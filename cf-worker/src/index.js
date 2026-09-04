/**
 * Cloudflare Workers + Durable Objects backend (Colyseus replacement).
 *
 * Goals:
 * - Minimal server usage (throttled relays, debounced storage writes)
 * - No persistent game/chat records (state lives in memory / WS attachments only)
 * - Room list persists only while rooms exist; removed when empty.
 *
 * Endpoints:
 *   WS  /ws/lobby
 *   WS  /ws/room/:roomId
 *   GET /api/rooms
 *   POST /api/rooms
 */

const PROTOCOL_VERSION = "20260831-multigame1";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type"
  };
}

function json(data, init={}){
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type":"application/json; charset=utf-8", ...corsHeaders(), ...(init.headers||{}) }
  });
}

function randRoomId(){
  return Math.random().toString(36).slice(2, 10);
}

function safeNick(x){
  return String(x ?? "Player").replace(/[\r\n\t]/g, " ").slice(0, 24) || "Player";
}

function safeId(x){
  const s = String(x ?? "").trim();
  if(!s) return "";
  // keep URL/WS safe
  return s.replace(/[^\w\-:.@]/g, "").slice(0, 64);
}

function now(){ return Date.now(); }
function clampNumber(value,min,max){ const n=Number(value)||0; return Math.max(min,Math.min(max,n)); }

function buildBackroomsStartPayload(rosterInput, seedInput, startedAtInput){
  const roster = (Array.isArray(rosterInput) ? rosterInput : []).slice()
    .sort((a,b)=> Number(a?.seat ?? 99)-Number(b?.seat ?? 99) || String(a?.sid||'').localeCompare(String(b?.sid||'')));
  const seed = Number(seedInput) >>> 0;
  const startedAt = Number(startedAtInput) || now();
  const monsterSid = roster.length >= 2 ? String(roster[seed % roster.length]?.sid || '') : null;
  const monsterSeat = monsterSid ? Number(roster.find(r=>String(r?.sid||'')===monsterSid)?.seat ?? -1) : -1;
  const roles = {};
  const rabbitSlots = [
    {x:-5.4,z:7.6},{x:-3.6,z:6.95},{x:-1.8,z:6.35},{x:0,z:6.15},
    {x:1.8,z:6.35},{x:3.6,z:6.95},{x:5.4,z:7.6}
  ];
  roster.filter(r=>String(r?.sid||'')!==String(monsterSid||'')).forEach((r,idx)=>{
    const slot=rabbitSlots[Math.min(idx,rabbitSlots.length-1)];
    roles[String(r.sid)]={role:'rabbit',seat:Number(r.seat??-1),spawn:{x:slot.x,y:0.05,z:slot.z,yaw:Math.PI}};
  });
  if(monsterSid){
    roles[monsterSid]={role:'monster',seat:monsterSeat,spawn:{x:0,y:0.05,z:-161.6,yaw:0}};
  }
  return {
    mode:'backrooms3d',seed,startedAt,releaseAt:startedAt+10000,
    startId:`br-${startedAt}-${seed}`,playerCount:roster.length,roster,
    monsterSid,monsterSeat,roles,spawnLockMs:10000,ignoreCaughtMs:10000
  };
}

function wsSetAttachment(ws, obj){
  try{ if (ws && typeof ws.serializeAttachment === "function") ws.serializeAttachment(obj); }catch(_){}
}
function wsGetAttachment(ws){
  try{ if (ws && typeof ws.deserializeAttachment === "function") return ws.deserializeAttachment() || null; }catch(_){}
  return null;
}

export default {
  async fetch(request, env){
    if (request.method === "OPTIONS"){
      return new Response(null, { status:204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/version" && request.method === "GET") {
      return json({ ok:true, protocolVersion:PROTOCOL_VERSION });
    }

    const upgrade = request.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() === "websocket"){
      if (path === "/ws/lobby"){
        const id = env.LOBBY.idFromName("lobby");
        return env.LOBBY.get(id).fetch(request);
      }
      const m = path.match(/^\/ws\/room\/([^/]+)$/);
      if (m){
        const roomId = decodeURIComponent(m[1]);
        const id = env.ROOM.idFromName(roomId);
        return env.ROOM.get(id).fetch(request);
      }
      return new Response("Not found", { status:404 });
    }

    if (path === "/api/rooms" && request.method === "GET"){
      const lobby = env.LOBBY.get(env.LOBBY.idFromName("lobby"));
      return lobby.fetch(new Request(url.origin + "/internal/listRooms", { method:"GET" }));
    }
    if (path === "/api/rooms" && request.method === "POST"){
      const lobby = env.LOBBY.get(env.LOBBY.idFromName("lobby"));
      const body = await request.text();
      return lobby.fetch(new Request(url.origin + "/internal/createRoom", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body
      }));
    }

    return new Response("OK", { status:200, headers: corsHeaders() });
  }
};

// -------------------- Lobby Durable Object --------------------

export class LobbyDO{
  constructor(state, env){
    this.state = state;
    this.env = env;

    this.sockets = new Map();      // ws -> uid
    this.userSockets = new Map();  // uid -> ws
    this.nicks = new Map();        // uid -> nick

    // Global presence across lobby + rooms.
    // uid -> { nick, roomId, lastSeen }
    // - roomId: "" means in lobby (or not in any room)
    // - Users inside a room are registered by RoomDO via /internal/presenceSet
    this.presence = new Map();

    this.rooms = null;            // room map persisted while rooms exist
    this._saveTimer = null;
    this._wired = new WeakSet();  // sockets already wired (rehydration)
  }

  async _loadRooms(){
    if (this.rooms) return;
    // 요청사항: 방 나가면 서버에 기록이 남지 않도록, 영구 저장을 하지 않습니다.
    this.rooms = {};
  }

  _scheduleSaveRooms(delayMs=800){
    // no-op (no persistence)
    return;
  }

  _broadcast(t, d){
    const msg = JSON.stringify({ t, d });
    for (const ws of this.sockets.keys()){
      try{ ws.send(msg); }catch(_){}
    }
  }

  _broadcastPresence(){
    // Push presence updates so the lobby UI updates immediately without polling.
    this._broadcast("presence", this._presencePayload());
  }

  _presencePayload(){
    const users = [];
    for (const [uid, p] of this.presence.entries()){
      if (!p || !p.nick) continue;
      users.push({ userId: uid, nick: p.nick, roomId: p.roomId || "" });
    }
    users.sort((a,b)=> (a.nick||"").localeCompare(b.nick||"", "ko"));
    return { online: users.length, users };
  }

  _broadcastPresence(){
    this._broadcast("presence", this._presencePayload());
  }
  _send(ws, t, d){
    try{ ws.send(JSON.stringify({ t, d })); }catch(_){}
  }

  _roomsList(){
    const list = Object.values(this.rooms || {}).sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
    return list.map(r=>({
      roomId: r.roomId,
      title: r.title,
      mode: r.mode,
      maxPlayers: r.maxPlayers,
      players: r.players || 0,
      status: r.status || "waiting",
      updatedAt: r.updatedAt || 0
    }));
  }

  _wireSocket(ws){
    if (this._wired.has(ws)) return;
    this._wired.add(ws);

    ws.addEventListener("message", async (ev)=>{
      let msg;
      try{ msg = JSON.parse(ev.data); }catch(_){ return; }
      const t = msg.t;
      const d = msg.d || {};
      const uid = this.sockets.get(ws) || "";

      if (t === "hello"){
        // Client provides stable uid (from sheet login) + nick; if missing, generate a temporary one.
        const wantUid = safeId(d.user_id || d.uid) || crypto.randomUUID();
        const nick = safeNick(d.nick);

        // Enforce one connection per uid in lobby.
        const prev = this.userSockets.get(wantUid);
        if (prev && prev !== ws){
          try{ prev.close(1000, "replaced"); }catch(_){}
          this.sockets.delete(prev);
        }

        this.sockets.set(ws, wantUid);
        this.userSockets.set(wantUid, ws);
        this.nicks.set(wantUid, nick);
        wsSetAttachment(ws, { uid: wantUid, nick });

        // Register as online in lobby (roomId=""). RoomDO can override roomId later.
        this.presence.set(wantUid, { nick, roomId:"", lastSeen: now() });

        this._send(ws, "hello_ok", { userId: wantUid, nick, protocolVersion:PROTOCOL_VERSION });
        this._send(ws, "rooms", { list: this._roomsList() });
        this._broadcast("system", { text: `${nick} 접속`, ts: now() });
        this._broadcastPresence();
        return;
      }

      // Require hello first
      if (!uid) return;

      if (t === "list_rooms"){
        this._send(ws, "rooms", { list: this._roomsList() });
        return;
      }

      if (t === "presence"){
        this._send(ws, "presence", this._presencePayload());
        return;
      }

      if (t === "lobby_chat"){
        const nick = this.nicks.get(uid);
        if (!nick) return;
        this._broadcast("lobby_chat", { nick, text: String(d.text||"").slice(0,300), ts: now() });
        return;
      }

      if (t === "create_room"){
        const res = await this.fetch(new Request("https://lobby/internal/createRoom", {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body: JSON.stringify(d || {})
        }));
        const out = await res.json();
        this._send(ws, "room_created", { roomId: out.roomId });
        return;
      }
    });

    ws.addEventListener("close", ()=>{
      const uid = this.sockets.get(ws);
      this.sockets.delete(ws);
      if (uid){
        this.userSockets.delete(uid);
        const nick = this.nicks.get(uid);
        this.nicks.delete(uid);
        // Remove from presence only if not known to be inside a room.
        // (RoomDO will set roomId when the user joins a room.)
        const p = this.presence.get(uid);
        if (p && !p.roomId){
          this.presence.delete(uid);
        } else if (p){
          p.lastSeen = now();
          this.presence.set(uid, p);
        }
        this._broadcastPresence();
        if (nick) this._broadcast("system", { text: `${nick} 퇴장`, ts: now() });
      }
    });
  }

  _rehydrateSockets(){
    // After hibernation, we must re-wire event listeners and rebuild maps.
    try{
      const sockets = this.state.getWebSockets();
      for (const ws of sockets){
        const att = wsGetAttachment(ws) || {};
        const uid = safeId(att.uid);
        const nick = safeNick(att.nick || "");
        if (uid){
          this.sockets.set(ws, uid);
          this.userSockets.set(uid, ws);
          this.nicks.set(uid, nick);
        } else {
          this.sockets.set(ws, "");
        }
        this._wireSocket(ws);
      }
    }catch(_){}
  }

  async fetch(request){
    await this._loadRooms();
    this._rehydrateSockets();

    const url = new URL(request.url);
    const path = url.pathname;

    // internal HTTP
    if (path === "/internal/listRooms"){
      return json({ list: this._roomsList() });
    }

    if (path === "/internal/createRoom" && request.method === "POST"){
      let opts = {};
      try{ opts = await request.json(); }catch(_){}
      const roomId = randRoomId();
      const title = String(opts.title || "방").slice(0, 30);
      const mode = String(opts.mode || "stackga").slice(0, 24);
      // Allow larger rooms for some coop modes (e.g., snaketail). UI still limits per-game.
      const minPlayers = (mode === "mathexplorer") ? 1 : 2;
      let maxPlayers = Math.max(minPlayers, Math.min(8, Number(opts.maxClients || opts.maxPlayers || 4) || 4));
      // 수학축구는 짝수 인원(2/4/6/8)만 가능 — 방 생성 시점부터 강제
      if (mode === "soccer" && maxPlayers % 2 !== 0){
        maxPlayers = Math.max(2, maxPlayers - 1);
      }
      this.rooms[roomId] = {
        roomId, title, mode,
        maxPlayers,
        players: 0,
        status: "waiting",
        updatedAt: now()
      };
      this._scheduleSaveRooms();
      this._broadcast("rooms", { list: this._roomsList() });
      return json({ roomId });
    }

    if (path === "/internal/roomMeta"){
      const roomId = url.searchParams.get("roomId") || "";
      const meta = (this.rooms && this.rooms[roomId]) ? this.rooms[roomId] : null;
      return json({ meta });
    }

    if (path === "/internal/roomUpdate" && request.method === "POST"){
      let u = {};
      try{ u = await request.json(); }catch(_){}
      const roomId = String(u.roomId || "");
      if (!roomId) return json({ ok:false }, { status:400 });

      if (u.deleted){
        delete this.rooms[roomId];
      } else {
        const prev = this.rooms[roomId] || { roomId };
        this.rooms[roomId] = {
          ...prev,
          title: u.title ?? prev.title ?? "방",
          mode: u.mode ?? prev.mode ?? "stackga",
          maxPlayers: u.maxPlayers ?? prev.maxPlayers ?? 4,
          players: u.players ?? prev.players ?? 0,
          status: u.status ?? prev.status ?? "waiting",
          updatedAt: now()
        };
      }
      this._scheduleSaveRooms();
      this._broadcast("rooms", { list: this._roomsList() });
      return json({ ok:true });
    }

    // ---- global presence updates (called by RoomDO) ----
    if (path === "/internal/presenceSet" && request.method === "POST"){
      let body = {};
      try{ body = await request.json(); }catch(_){ }
      const uid = safeId(body.uid);
      if (!uid) return json({ ok:false }, { status:400 });
      const nick = safeNick(body.nick || "Player");
      const roomId = safeId(body.roomId || "");
      this.presence.set(uid, { nick, roomId, lastSeen: now() });
      this._broadcastPresence();
      return json({ ok:true });
    }

    if (path === "/internal/presenceClear" && request.method === "POST"){
      let body = {};
      try{ body = await request.json(); }catch(_){ }
      const uid = safeId(body.uid);
      if (!uid) return json({ ok:false }, { status:400 });
      const roomId = safeId(body.roomId || "");
      const cur = this.presence.get(uid);
      // Only clear if matches (avoids racing with a new room join).
      if (cur && (!roomId || cur.roomId === roomId)){
        this.presence.delete(uid);
        this._broadcastPresence();
      }
      return json({ ok:true });
    }

    // websocket lobby
    const upgrade = request.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() === "websocket" && path === "/ws/lobby"){
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();

      // Not yet known uid until hello
      this.sockets.set(server, "");
      wsSetAttachment(server, { uid:"", nick:"" });
      this._wireSocket(server);

      return new Response(null, { status:101, webSocket: client });
    }

    return new Response("Not found", { status:404 });
  }
}

// -------------------- Room Durable Object --------------------

function isDuelMode(mode){
  // Co-op/real-time shared iframe modes (not tournament/duel)
  const m = String(mode || "");
  return !(m === "togester" || m === "snaketail" || m === "suhaktokki" || m === "drawanswer" || m === "mathexplorer" || m === "math-explorer" || m === "backrooms3d" || m === "soccer" || m === "geumchikeo");
}

function roundLabelFor(nPlayers, roundIdx, matchIdx){
  if (nPlayers === 2) return "결승";
  if (nPlayers === 3){
    return (roundIdx === 0) ? "준결승" : "결승";
  }
  if (nPlayers === 4){
    if (roundIdx === 0) return matchIdx === 0 ? "준결승 1" : "준결승 2";
    return "결승";
  }
  return "";
}

function buildRounds(players){
  const p = players.slice();
  if (p.length === 2) return [ [ [p[0], p[1]] ] ];
  if (p.length === 3) return [ [ [p[0], p[1]] ], [ [null, p[2]] ] ];
  if (p.length >= 4) return [ [ [p[0], p[3]], [p[1], p[2]] ], [ [null, null] ] ];
  return [];
}

// -------------------- DrawAnswer (그림맞추기) helpers --------------------
// Korean-only word list (Hangul only) - 캐치마인드 스타일 초등학생용
const DA_WORDS = [
  // 과일/채소
  "사과","바나나","딸기","포도","수박","귤","복숭아","참외","파인애플","감자",
  "고구마","당근","오이","토마토","양파","마늘","버섯","브로콜리","상추","배추",
  "레몬","체리","망고","블루베리","콩","옥수수","호박","가지","무","배",
  // 음식/간식
  "김치","비빔밥","라면","떡볶이","순대","김밥","만두","삼겹살","불고기","치킨",
  "피자","햄버거","초밥","우동","카레","빵","케이크","아이스크림","초콜릿","쿠키",
  "탕수육","짜장면","짬뽕","삼계탕","갈비","족발","핫도그","도넛","솜사탕","붕어빵",
  "호떡","식빵","계란후라이","찐빵","군고구마","사탕","젤리","팝콘","빙수","떡",
  "새우깡","뻥튀기","삼각김밥","샌드위치","볶음밥","오믈렛","스파게티","팬케이크","라볶이","어묵",
  // 학용품/교실
  "연필","지우개","가방","책상","의자","칠판","필통","공책","풀","가위",
  "크레파스","색연필","자","교과서","도시락","체육복","실내화","책","알림장","선생님",
  // 교통/이동
  "버스","지하철","자동차","자전거","오토바이","비행기","기차","택시","킥보드","신호등",
  "횡단보도","헬리콥터","로켓","잠수함","열기구","트럭","소방차","경찰차","구급차",
  // 집/가전
  "냉장고","세탁기","텔레비전","리모컨","휴대폰","컴퓨터","시계","소파","침대","이불",
  "에어컨","선풍기","전기밥솥","전자레인지","청소기","다리미","믹서기","냄비","프라이팬","주전자",
  // 의류/잡화
  "모자","신발","양말","바지","셔츠","치마","코트","우산","안경","장갑",
  "넥타이","목걸이","반지","지갑","슬리퍼","부츠","운동화","스카프","귀걸이","벨트",
  // 동물
  "강아지","고양이","토끼","호랑이","사자","곰","여우","코끼리","기린","원숭이",
  "펭귄","돌고래","상어","고래","거북이","악어","독수리","공룡","앵무새","해파리",
  "햄스터","고슴도치","캥거루","코알라","판다","치타","늑대","하마","코뿔소","오리",
  "문어","오징어","게","새우","부엉이","까마귀","참새","홍학","타조","두더지",
  // 곤충/소동물
  "개미","나비","무당벌레","잠자리","메뚜기","귀뚜라미","지렁이","달팽이","개구리","두꺼비",
  "모기","파리","벌","매미","사마귀","딱정벌레","하루살이","거미","지네","전갈",
  // 스포츠/놀이
  "축구","농구","야구","테니스","수영","달리기","스키","스케이트","배드민턴","볼링",
  "탁구","골프","양궁","태권도","유도","체조","줄넘기","훌라후프","제기차기","딱지치기",
  "팽이","구슬치기","숨바꼭질","술래잡기","무궁화꽃","오목","장기","바둑","다트","윷놀이",
  // 음악/예술
  "피아노","기타","드럼","바이올린","트럼펫","플루트","하모니카","탬버린","색소폰","첼로",
  "그림","만화","마이크","스피커","카메라","피리","장구","꽹과리","거문고","가야금",
  // 날씨/자연
  "눈사람","눈송이","비","번개","구름","무지개","태양","달","별","바다",
  "산","강","숲","나무","꽃","장미","해바라기","튤립","선인장","대나무",
  "화산","폭풍","태풍","빙하","사막","정글","폭포","호수","섬","동굴",
  // 우주/판타지
  "로봇","우주선","행성","우주","외계인","마법사","용","왕관","성","검",
  "요정","귀신","해적","닌자","왕","공주","기사","마녀","드래곤","보물",
  // 생활/이벤트
  "풍선","선물","촛불","크리스마스","산타클로스","루돌프","트리","폭죽","사진","거울",
  "열쇠","지도","나침반","모래시계","동전","약","주사","체온계","돋보기","치약",
  // 직업
  "경찰","소방관","의사","간호사","요리사","가수","배우","화가","과학자","농부",
  "어부","군인","마술사","광대","탐정","우주비행사","운동선수","기자","판사","목수",
];

function daNormalizeAnswer(s){
  // keep Hangul only + remove spaces/punctuation
  return String(s||"").trim().replace(/\s+/g,"").replace(/[^가-힣]/g,"");
}

function daPickWord(){
  const idx = Math.floor(Math.random() * DA_WORDS.length);
  return DA_WORDS[idx] || "사과";
}

export class RoomDO{
  constructor(state, env){
    this.state = state;
    this.env = env;

    this.sockets = new Map();      // ws -> uid
    this.userSockets = new Map();  // uid -> ws
    this.users = new Map();        // uid -> {nick, ready, seat, isHost}

    this.meta = {
      roomId: "",
      title: "방",
      mode: "stackga",
      maxPlayers: 4,
      phase: "lobby",
      status: "waiting",
      ownerUserId: ""
    };

    this.tour = null;              // tournament state for duel mode
    this.tg = { players:{}, floors:{}, buttons:{}, boxes:{}, lastBroadcast:0, timer:null }; // coop state aggregation
    this.pb = { state:null }; // StarPaint host-authoritative world snapshot
    this.st = { players:{}, foods:[], lastBroadcast:0, timer:null, startedAt:0, durationMs:180000, scores:{} }; // snaketail state
    // Soccer (수학축구): authoritative player/ball/score aggregation, mirrors GameRoom.js (Colyseus) implementation.
    this.sc = { players:{}, ball:null, score:{A:0,B:0}, over:false, lastPosBroadcastAt:0, posBroadcastTimer:null, phase:"idle", round:null, playedMs:0, playStartedAt:0, matchDurationMs:120000, timer:null, transitionTimer:null, kickoffOwnerSid:"", roundSerial:0 };
    this._soccerDisconnectTimers = new Map(); // uid -> reconnect grace timer

    // SuhakTokki: authoritative game_start payload (seed/roster/practice/teacher) is decided once per match.
    // Stored here so late-joiners can be synced.
    this.sk = { startPayload: null };
    this.mx = { startPayload: null, latestStates: {}, latestWorld: null, latestPhase: null, latestEvent: null, lastActiveAt: 0 };
    this.br = { startPayload: null, latestStates: {}, latestWorld: null, latestChat: [], ending:false, catchCooldown:{}, caughtCounts:{} };

    // DrawAnswer (Pictionary-like): minimal server = relays + round/timer/score authority
    this.da = {
      active:false,
      round:0,
      maxRounds:5,
      order:[],
      drawerIdx:0,
      drawerUid:"",
      word:"",
      endAt:0,
      timer:null,
      scores:{},      // uid -> { score, streak }
      ops:[],         // replay ops for current round (draw/clear)
    };

    this._wired = new WeakSet();
    this._lobbyUpdateTimer = null;
    this._backToLobbyTimer = null;
    this._relayLimiter = new Map(); // uid -> {duelTs, tgTs}

    // CPU player is virtual (no websocket). Only used to allow solo duel 1:1.
    this._cpu = { active:false };
  }

  _cpuUid(){ return "__cpu__"; }
  _hasCpu(){ return this.users.has(this._cpuUid()); }

  _ensureCpuUser(){
    const cpu = this._cpuUid();
    if (this.users.has(cpu)) return;
    // Put CPU into an available seat (typically 2P)
    const seat = this._assignSeat();
    this.users.set(cpu, { nick:"CPU", ready:true, seat, isHost:false });
  }

  _removeCpuUser(){
    const cpu = this._cpuUid();
    if (!this.users.has(cpu)) return;
    this.users.delete(cpu);
    if (this.meta.ownerUserId === cpu) this.meta.ownerUserId = "";
    this._recalcHost();
    this._applyHostFlags();
  }

  _startCpu(){ this._cpu.active = true; }
  _stopCpu(){ this._cpu.active = false; }

  _snapshot(){
    const players = Array.from(this.users.entries()).map(([uid, u])=>({
      sessionId: uid,
      nick: u.nick,
      ready: !!u.ready,
      seat: u.seat ?? 99,
      isHost: !!u.isHost
    })).sort((a,b)=> (a.seat??99)-(b.seat??99));
    return {
      meta: {
        roomId: this.meta.roomId,
        title: this.meta.title,
        mode: this.meta.mode,
        maxClients: this.meta.maxPlayers,
        phase: this.meta.phase
      },
      players
    };
  }

  _broadcast(t, d){
    const msg = JSON.stringify({ t, d });
    for (const ws of this.sockets.keys()){
      try{ ws.send(msg); }catch(_){}
    }
  }
  _send(ws, t, d){
    try{ ws.send(JSON.stringify({ t, d })); }catch(_){}
  }

  _recalcHost(){
    if (this.users.size === 0){
      this.meta.ownerUserId = "";
      return;
    }
    const current = this.meta.ownerUserId;
    if (current && this.users.has(current)) return;
    let bestUid = null;
    let bestSeat = 999;
    for (const [uid, u] of this.users.entries()){
      const s = u.seat ?? 99;
      if (s < bestSeat){
        bestSeat = s;
        bestUid = uid;
      }
    }
    this.meta.ownerUserId = bestUid || "";
  }

  _applyHostFlags(){
    for (const [uid, u] of this.users.entries()){
      u.isHost = (uid === this.meta.ownerUserId);
    }
  }

  _allReady(){
    const cpu = this._cpuUid();
    const duel = isDuelMode(this.meta.mode);
    const soloCoopOk = (
      this.meta.mode === "suhaktokki" ||
      this.meta.mode === "snaketail" ||
      this.meta.mode === "mathexplorer" ||
      this.meta.mode === "math-explorer" ||
      this.meta.mode === "starpaint"
    );
    let humanCount = 0;
    for (const [uid] of this.users.entries()){
      if (uid === cpu) continue;
      humanCount++;
    }

    // Solo duel: host can start immediately (server will attach CPU)
    if (duel && humanCount === 1) return true;
    // These co-op games explicitly support a one-player room.
    if (!duel && soloCoopOk && humanCount === 1) return true;
    if (humanCount < 2) return false;

    // Host does not need to ready; only non-host HUMAN players must be ready
    for (const [uid, u] of this.users.entries()){
      if (uid === cpu) continue;
      if (u.isHost) continue;
      if (!u.ready) return false;
    }
    return true;
  }

  _assignSeat(){
    const used = new Set();
    for (const u of this.users.values()){
      used.add(Number(u.seat ?? 99));
    }
    for (let i=0; i< (this.meta.maxPlayers||4); i++){
      if (!used.has(i)) return i;
    }
    return this.users.size;
  }

  async _pullMetaFromLobby(roomId){
    try{
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
      const res = await lobby.fetch(`https://lobby/internal/roomMeta?roomId=${encodeURIComponent(roomId)}`);
      const js = await res.json();
      const lm = js.meta;
      if (lm){
        this.meta.title = lm.title ?? this.meta.title;
        this.meta.mode = lm.mode ?? this.meta.mode;
        this.meta.maxPlayers = lm.maxPlayers ?? this.meta.maxPlayers;
      }
    }catch(_){}
  }

  _scheduleLobbyUpdate(delayMs=400){
    if (this._lobbyUpdateTimer) return;
    this._lobbyUpdateTimer = setTimeout(async ()=>{
      this._lobbyUpdateTimer = null;
      try{
        const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
        await lobby.fetch("https://lobby/internal/roomUpdate", {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body: JSON.stringify({
            roomId: this.meta.roomId,
            title: this.meta.title,
            mode: this.meta.mode,
            maxPlayers: this.meta.maxPlayers,
            players: this.users.size,
            status: this.meta.status
          })
        });
      }catch(_){}
    }, delayMs);
  }

  async _deleteFromLobby(){
    try{
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
      await lobby.fetch("https://lobby/internal/roomUpdate", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ roomId: this.meta.roomId, deleted:true })
      });
    }catch(_){}
  }

  async _presenceSet(uid, nick, roomId){
    try{
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
      await lobby.fetch("https://lobby/internal/presenceSet", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ uid, nick, roomId })
      });
    }catch(_){ }
  }

  async _presenceClear(uid, roomId){
    try{
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
      await lobby.fetch("https://lobby/internal/presenceClear", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ uid, roomId })
      });
    }catch(_){ }
  }

  _wireSocket(ws){
    if (this._wired.has(ws)) return;
    this._wired.add(ws);

    ws.addEventListener("message", async (ev)=>{
      let msg;
      try{ msg = JSON.parse(ev.data); }catch(_){ return; }
      const t = msg.t;
      const d = msg.d || {};

      const uid = this.sockets.get(ws) || "";

      if (t === "hello_room"){
        const wantUid = safeId(d.user_id || d.uid) || crypto.randomUUID();
        const nick = safeNick(d.nick);

        // Fetch lobby meta once, on first hello.
        if (!this.meta.roomId) this.meta.roomId = this._roomIdFromPath(ws._pathHint) || this.meta.roomId;
        if (!this.meta.roomId) this.meta.roomId = wantUid.slice(0,8);
        await this._pullMetaFromLobby(this.meta.roomId);

        // Running games normally allow late-join for cooperative modes, but Soccer is
        // team-balanced at kickoff and must keep that roster fixed for the whole match.
        // Existing uid reconnects are still allowed; only brand-new entrants are blocked.
        if (this.meta.phase === "playing" && !this.users.has(wantUid)) {
          const duel = isDuelMode(this.meta.mode);
          const soccerLocked = this.meta.mode === "soccer";
          if (duel || soccerLocked) {
            const text = soccerLocked
              ? "수학축구 경기 중에는 새로 참가할 수 없습니다. 다음 경기에서 입장해 주세요."
              : "게임중인 방입니다. 게임이 끝난 뒤 입장해 주세요.";
            this._send(ws, "system", { text, ts: now() });
            try{ ws.close(1008, "playing"); }catch(_){ }
            return;
          }
        }

        // capacity check: reconnecting an existing uid does not consume a new seat.
        if (!this.users.has(wantUid) && this.users.size >= (this.meta.maxPlayers || 4)){
          this._send(ws, "system", { text:"방이 꽉 찼습니다.", ts: now() });
          try{ ws.close(1008, "full"); }catch(_){}
          return;
        }

        // enforce one socket per uid
        const prev = this.userSockets.get(wantUid);
        if (prev && prev !== ws){
          try{ prev.close(1000, "replaced"); }catch(_){}
          this.sockets.delete(prev);
        }

        this.sockets.set(ws, wantUid);
        this.userSockets.set(wantUid, ws);

        if (!this.users.has(wantUid)){
          const seat = this._assignSeat();
          this.users.set(wantUid, { nick, ready:false, seat, isHost:false });
        } else {
          const u = this.users.get(wantUid);
          u.nick = nick;
        }

        try{
          const rt=this._soccerDisconnectTimers?.get(wantUid);
          if(rt){
            clearTimeout(rt);
            this._soccerDisconnectTimers.delete(wantUid);
            // A reconnect can be the event that settles the last outstanding grace
            // window. Re-evaluate the final soccer roster only after that window is
            // gone; otherwise a prior permanent dropout can leave an odd roster
            // running indefinitely.
            this._checkSoccerRosterViability();
          }
        }catch(_){ }

        this._recalcHost();
        this._applyHostFlags();

        // If we are in lobby, ensure no stale CPU player remains from a prior solo game
        if (this.meta.phase === "lobby"){
          this._stopCpu();
          this._removeCpuUser();
        }

        wsSetAttachment(ws, { uid: wantUid, nick, ready: !!this.users.get(wantUid).ready, seat: this.users.get(wantUid).seat });

        this._send(ws, "hello_ok", { userId: wantUid, protocolVersion:PROTOCOL_VERSION });
        this._broadcast("system", { text: `${nick} 입장`, ts: now() });

        this.meta.status = (this.meta.phase === "playing") ? "playing" : "waiting";
        this._scheduleLobbyUpdate();
        this._broadcast("room_state", this._snapshot());

        // SuhakTokki: if a match is already running, sync authoritative start payload to the joining client.
        // Without this, the iframe stays forever on "로딩 중..." because it never receives game_start.
        if (this.meta.phase === "playing" && (this.meta.mode === "suhaktokki" || this.meta.mode === "mathexplorer" || this.meta.mode === "math-explorer" || this.meta.mode === "backrooms3d")){
          try{
            const sp = (this.meta.mode === "suhaktokki") ? (this.sk && this.sk.startPayload) : (this.meta.mode === "backrooms3d") ? (this.br && this.br.startPayload) : (this.mx && this.mx.startPayload);
            if (sp) this._send(ws, "started", { mode: this.meta.mode, startPayload: sp });
          }catch(_){ }
        }

        // MathExplorer: if a match is already running, sync cached start/state/world to the joining client.
        if (this.meta.phase === "playing" && (this.meta.mode === "mathexplorer" || this.meta.mode === "math-explorer")){
          try{
            if (this.mx && this.mx.latestPhase) this._send(ws, "mx_msg", { msg: Object.assign({}, this.mx.latestPhase, { from:"server" }) });
            if (this.mx && this.mx.latestWorld) this._send(ws, "mx_msg", { msg: Object.assign({}, this.mx.latestWorld, { from:"server" }) });
            if (this.mx && this.mx.latestEvent) this._send(ws, "mx_msg", { msg: Object.assign({}, this.mx.latestEvent, { from:"server" }) });
            const states = (this.mx && this.mx.latestStates) ? Object.values(this.mx.latestStates) : [];
            for (const st of states){ try{ this._send(ws, "mx_msg", { msg: Object.assign({}, st, { from: String(st?.from || "") }) }); }catch(_){ } }
          }catch(_){ }
        }

        // Backrooms3d: if a match is already running, sync cached world/state/chat to the joining client.
        if (this.meta.phase === "playing" && this.meta.mode === "backrooms3d"){
          try{
            if (this.br && this.br.latestWorld) this._send(ws, "br_msg", { msg: Object.assign({}, this.br.latestWorld, { from:"server" }) });
            const states = (this.br && this.br.latestStates) ? Object.values(this.br.latestStates) : [];
            for (const st of states){ try{ this._send(ws, "br_msg", { msg: Object.assign({}, st, { from: String(st?.from || "") }) }); }catch(_){ } }
            const chats = (this.br && this.br.latestChat) ? this.br.latestChat : [];
            for (const c of chats){ try{ this._send(ws, "br_msg", { msg: Object.assign({}, c, { from: String(c?.from || "server") }) }); }catch(_){ } }
          }catch(_){ }
        }

        // SnakeTail: if a match is already running, sync timer/foods/snapshots to the joining client
        // (prevents missing initial food spawn due to iframe load timing).
        if (this.meta.phase === "playing" && this.meta.mode === "snaketail"){
          try{ this._send(ws, "st_timer", { startTs: this.st.startedAt || now(), durationMs: this.st.durationMs || 180000 }); }catch(_){ }
          try{ this._send(ws, "st_foods", { foods: Array.isArray(this.st.foods) ? this.st.foods : [] }); }catch(_){ }
          try{ this._send(ws, "st_players", { players: this.st.players || {} }); }catch(_){ }
          try{ this._send(ws, "st_scores", { scores: this.st.scores || {} }); }catch(_){ }
        }

        // Soccer: one authoritative round-state snapshot is enough for late join/reconnect.
        if (this.meta.phase === "playing" && this.meta.mode === "soccer" && this.sc){
          try{ this._ensureSoccerPlayerRegistered(wantUid); }catch(_){ }
          try{
            // If kickoff ownership became empty while this player was inside reconnect
            // grace, restore a connected winner immediately instead of waiting for the
            // next 500ms transition retry. This keeps the result/countdown screen and
            // actual ball ownership visually continuous on reconnect.
            if((this.sc.phase==="result"||this.sc.phase==="countdown") &&
               (!this.sc.kickoffOwnerSid || !this.userSockets.get(this.sc.kickoffOwnerSid))){
              this._reassignSoccerKickoffOwner();
              this._broadcastSoccerState();
            }
          }catch(_){ }
          try{ this._sendSoccerState(ws); }catch(_){ }
        }

        // Togester: if a match is already running, sync current players + floors to the joining client
        if (this.meta.phase === "playing" && this.meta.mode === "togester"){
          try{ this._send(ws, "tg_players", { players: this.tg.players || {} }); }catch(_){ }
          try{
            const floors = Object.values(this.tg.floors || {});
            this._send(ws, "tg_floors", { floors });
          }catch(_){ }
          try{
            const boxes = Object.values(this.tg.boxes || {});
            if (boxes.length) this._send(ws, "tg_boxes", { level: this.tg.level || 1, boxes });
          }catch(_){ }
          try{
            if (this.tg.puzzle) this._send(ws, "tg_puzzle", this.tg.puzzle);
          }catch(_){ }
        }

        // DrawAnswer: if a match is already running, sync current round state + replay ops
        if (this.meta.phase === "playing" && this.meta.mode === "drawanswer"){
          try{ this._sendDaSync(ws, wantUid); }catch(_){ }
        }
        // Inform lobby presence list that this user is currently inside a room.
        // This allows the lobby's online list to include room occupants and show their room.
        await this._presenceSet(wantUid, nick, this.meta.roomId);
        return;
      }

      if (!uid) return; // require hello_room first

      if (t === "room_chat"){
        const u = this.users.get(uid);
        if (!u) return;
        this._broadcast("room_chat", { nick: u.nick, text: String(d.text||"").slice(0,300), ts: now() });
        return;
      }

      if (t === "ready"){
        const u = this.users.get(uid);
        if (!u) return;
        if (this.meta.phase !== "lobby") return;
        u.ready = !!(d.v ?? d.ready);
        wsSetAttachment(ws, { uid, nick: u.nick, ready: !!u.ready, seat: u.seat });
        this._broadcast("room_state", this._snapshot());
        return;
      }

      if (t === "start"){
        const u = this.users.get(uid);
        if (!u) return;
        if (uid !== this.meta.ownerUserId){
          this._send(ws, "system", { text:"방장만 시작할 수 있습니다.", ts: now() });
          return;
        }

        // Validate start conditions
        const cpu = this._cpuUid();
        const duel = isDuelMode(this.meta.mode);
        let humanCount = 0;
        for (const [pid] of this.users.entries()){
          if (pid === cpu) continue;
          humanCount++;
        }

        // NOTE: In solo duel (only 1 human in a duel mode), the host should be able to start
        // immediately without any ready-gating. CPU will be attached to make it 1:1.
        const soloDuel = (duel && humanCount === 1);

        if (!duel){
          // Co-op usually requires 2+ humans; allow solo for SuhakTokki and SnakeTail.
          const minHumans = (["suhaktokki","snaketail","mathexplorer","math-explorer"].includes(this.meta.mode)) ? 1 : 2;
          if (humanCount < minHumans){
            this._send(ws, "system", { text:`${minHumans}명 이상 있어야 시작할 수 있습니다.`, ts: now() });
            return;
          }
          // 수학축구: 반드시 짝수 인원이어야 함
          if (this.meta.mode === "soccer" && humanCount % 2 !== 0){
            this._send(ws, "system", { text:`수학축구는 짝수 인원(2·4·6·8명)이어야 시작할 수 있습니다. (현재 ${humanCount}명)`, ts: now() });
            return;
          }
        } else {
          // Duel: allow solo start (CPU will be attached for 1:1)
          if (humanCount < 1){
            this._send(ws, "system", { text:"참가자가 없습니다.", ts: now() });
            return;
          }
          if (humanCount === 1){
            this._ensureCpuUser();
            this._startCpu();
          } else {
            // If a stray CPU exists, remove it for real PvP games
            this._stopCpu();
            this._removeCpuUser();
          }
        }

        if (!soloDuel && !this._allReady()){
          this._send(ws, "system", { text:"모두 레디해야 시작됩니다.", ts: now() });
          return;
        }

        // Soccer teams are derived from seat parity (0=A, 1=B, 2=A, 3=B...).
        // Lobby departures can leave holes such as seats 0 and 2; an even player
        // count alone would then produce A=2/B=0. Compact soccer seats immediately
        // before match start so both teams always have equal membership.
        if(this.meta.mode === "soccer"){
          const cpu=this._cpuUid();
          const humans=Array.from(this.users.entries())
            .filter(([pid])=>pid!==cpu)
            .sort((a,b)=>Number(a[1]?.seat??99)-Number(b[1]?.seat??99)||String(a[0]).localeCompare(String(b[0])));
          humans.forEach(([pid,pu],idx)=>{
            pu.seat=idx;
            const sock=this.userSockets.get(pid);
            if(sock) wsSetAttachment(sock,{uid:pid,nick:pu.nick,ready:!!pu.ready,seat:idx});
          });
          this._applyHostFlags();
          this._broadcast("room_state", this._snapshot());
        }
        // Clear transient states (prevent stale snapshots carrying into a new match)
        this.tour = null;

        this.tg.players = {};
        this.tg.floors = {};
        this.tg.itemOwners = {};
        if (this.tg.timer){ try{ clearTimeout(this.tg.timer); }catch(_){}
          this.tg.timer = null;
        }

        // StarPaint has its own native pb_* lifecycle. Never carry a prior match's
        // world/player snapshot into a new round in the same room.
        this.pb = { state:null };

        // SnakeTail transient state (clients simulate; server relays + keeps score)
        this.st.players = {};
        this.st.foods = [];
        this.st.scores = {};
        this.st.startedAt = 0;
        if (this.st.timer){ try{ clearTimeout(this.st.timer); }catch(_){ }
          this.st.timer = null;
        }

        // Soccer transient state (server is authoritative for roster/score/timer)
        this.sc.players = {};
        this.sc.ball = null;
        this.sc.score = { A:0, B:0 };
        this.sc.over = false;
        this.sc.phase = "idle";
        this.sc.round = null;
        this.sc.playedMs = 0;
        this.sc.playStartedAt = 0;
        this.sc.kickoffOwnerSid = "";
        this.sc.roundSerial = 0;
        this.sc.lastPosBroadcastAt = 0;
        if (this.sc.posBroadcastTimer){ try{ clearTimeout(this.sc.posBroadcastTimer); }catch(_){ } this.sc.posBroadcastTimer = null; }
        if (this.sc.timer){ try{ clearTimeout(this.sc.timer); }catch(_){ } this.sc.timer = null; }
        if (this.sc.transitionTimer){ try{ clearTimeout(this.sc.transitionTimer); }catch(_){ } this.sc.transitionTimer = null; }

        // DrawAnswer transient state
        try{
          this.da.active = false;
          this.da.round = 0;
          this.da.order = [];
          this.da.drawerIdx = 0;
          this.da.drawerUid = "";
          this.da.word = "";
          this.da.endAt = 0;
          this.da.ops = [];
          if (this.da.timer){ try{ clearTimeout(this.da.timer); }catch(_){ }
            this.da.timer = null;
          }
        }catch(_){ }

        // SuhakTokki/MathExplorer: decide authoritative start payload exactly once per match.
        // The iframe must start ONLY from this payload (game_start).
        let skStartPayload = null;
        let mxStartPayload = null;
        let brStartPayload = null;
        if (this.meta.mode === "mathexplorer" || this.meta.mode === "math-explorer"){
          try{
            this.mx.latestStates = {};
            this.mx.latestWorld = null;
            this.mx.latestPhase = null;
            this.mx.latestEvent = null;
            this.mx.lastActiveAt = 0;
            const cpuUid = this._cpuUid();
            const roster = Array.from(this.users.entries())
              .filter(([ruid])=> String(ruid) !== String(cpuUid))
              .map(([ruid, ru])=>({ sid:String(ruid), nick:safeNick(ru?.nick), seat:Number(ru?.seat ?? 99) }))
              .sort((a,b)=> (a.seat??99) - (b.seat??99));
            const seed = (Math.floor(Math.random()*0x100000000) >>> 0);
            mxStartPayload = {
              mode: 'mathexplorer',
              startedAt: now(),
              seed,
              playerCount: roster.length,
              roster,
              difficulty: Number(d?.coopDifficulty ?? 1) || 1,
            };
            try{ this.mx.startPayload = mxStartPayload; }catch(_){ }
          }catch(_){ try{ this.mx.startPayload = null; }catch(_){ } }
        }
        if (this.meta.mode === "suhaktokki"){
          try{
            const cpuUid = this._cpuUid();
            const roster = Array.from(this.users.entries())
              .filter(([uid])=> String(uid) !== String(cpuUid))
              .map(([uid, u])=>({ sid: String(uid), nick: safeNick(u?.nick), seat: Number(u?.seat ?? 99) }))
              .sort((a,b)=> (a.seat??99) - (b.seat??99));

            const humans = roster.length;
            const practice = (humans < 4);

            // 32-bit seed
            const seed = (Math.floor(Math.random() * 0x100000000) >>> 0);
            let teacherSid = null;
            if (!practice && humans > 0){
              const idx = (seed >>> 0) % humans;
              teacherSid = roster[idx]?.sid ?? null;
            }

            skStartPayload = {
              startedAt: now(),
              seed,
              practice,
              teacherSid,
              roster
            };
            this.sk.startPayload = skStartPayload;
          }catch(_){
            // if anything goes wrong, keep null and rely on client-side lobby fallback (dev only)
            skStartPayload = null;
            try{ this.sk.startPayload = null; }catch(_){ }
          }
        }
        if (this.meta.mode === "backrooms3d"){
          try{
            const cpuUid = this._cpuUid();
            const roster = Array.from(this.users.entries())
              .filter(([uid])=> String(uid) !== String(cpuUid))
              .map(([uid, u])=>({ sid: String(uid), nick: safeNick(u?.nick), seat: Number(u?.seat ?? 99), isHost: !!u?.isHost }))
              .sort((a,b)=> (a.seat??99) - (b.seat??99) || String(a.sid).localeCompare(String(b.sid)));
            const seed = (Math.floor(Math.random() * 0x100000000) >>> 0);
            const startedAt = now();
            const payload = buildBackroomsStartPayload(roster, seed, startedAt);
            this.br.startPayload = payload;
            this.br.latestStates = {};
            this.br.latestWorld = null;
            this.br.latestChat = [];
            this.br.ending = false;
            this.br.catchCooldown = {};
            this.br.caughtCounts = {};
          }catch(_){
            try{ this.br.startPayload = null; this.br.latestStates = {}; this.br.latestWorld = null; this.br.latestChat = []; this.br.ending = false; this.br.catchCooldown = {}; this.br.caughtCounts = {}; }catch(_e){}
          }
        }

        this.meta.phase = "playing";
        this.meta.status = "playing";
        this._scheduleLobbyUpdate();
        if (this.meta.mode === "suhaktokki"){
          this._broadcast("started", { mode: this.meta.mode, startPayload: skStartPayload, protocolVersion:PROTOCOL_VERSION });
        } else if (this.meta.mode === "mathexplorer" || this.meta.mode === "math-explorer"){
          this._broadcast("started", { mode: this.meta.mode, startPayload: mxStartPayload, protocolVersion:PROTOCOL_VERSION });
        } else if (this.meta.mode === "backrooms3d"){
          this._broadcast("started", { mode: this.meta.mode, startPayload: this.br && this.br.startPayload, protocolVersion:PROTOCOL_VERSION });
        } else {
          this._broadcast("started", { mode: this.meta.mode, protocolVersion:PROTOCOL_VERSION });
        }

        // SnakeTail: start 3-minute round timer (server is source of truth)
        if (this.meta.mode === "snaketail"){
          this.st.startedAt = now();
          this.st.durationMs = 180000;
          try{ this._spawnInitialSnakeTailFoods(160); }catch(_){ }
          this._broadcast("st_timer", { startTs: this.st.startedAt, durationMs: this.st.durationMs });

          if (this.st.timer){ try{ clearTimeout(this.st.timer); }catch(_){ } this.st.timer = null; }
          this.st.timer = setTimeout(()=>{
            try{ this._endSnakeTail("timeout"); }catch(_){ }
          }, this.st.durationMs + 200);
        }

        // Soccer: 2-minute match init (server builds roster + teams, owns timer/score)
        if (this.meta.mode === "soccer"){
          try{ this._initSoccer(); }catch(_){ }
        }

        // DrawAnswer: start 5-question session (2 minutes each)
        if (this.meta.mode === "drawanswer"){
          try{ this._daStartGame(); }catch(_){ }
        }

        // Duel tournament is server-authoritative.
        if (isDuelMode(this.meta.mode)){
          this._startTournament();
        }

        this._broadcast("room_state", this._snapshot());
        return;
      }

      // ----- SuhakTokki relay (generic packet) -----
      if (t === "sk_msg"){
        if (this.meta.phase !== "playing") return;
        if (this.meta.mode !== "suhaktokki" && this.meta.mode !== "geumchikeo") return;
        const inner = (d && d.msg && typeof d.msg === "object") ? d.msg : {};
        // throttle high-frequency state packets
        if (String(inner.t||"") === "state"){
          const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0, skTs:0 };
          const n = now();
          if (n - (lim.skTs||0) < 70) return;
          lim.skTs = n;
          this._relayLimiter.set(uid, lim);
        }
        // Geumchikeo routes players by `from`; bind that field to the
        // authenticated room user so one client cannot impersonate another.
        const out = (this.meta.mode === "geumchikeo")
          ? Object.assign({}, inner, { from:String(uid) })
          : inner;
        this._broadcast("sk_msg", { msg: out });
        return;
      }

      // SuhakTokki match-end/host-exit: the iframe reports this through room.js.
      // Only the current authoritative host may end the shared room session.
      if (t === "sk_over"){
        if (this.meta.mode !== "suhaktokki" || this.meta.phase !== "playing") return;
        const sender = this.users.get(uid);
        if (!sender?.isHost && Number(sender?.seat ?? -1) !== 0) return;
        this._endAndBackToLobby(300);
        return;
      }

      // Geumchikeo shares sk_msg for its realtime packets, but has its own end signal.
      if (t === "gk_over"){
        if (this.meta.mode !== "geumchikeo" || this.meta.phase !== "playing") return;
        this._endAndBackToLobby(2600);
        return;
      }

      // MathExplorer is host-authoritative; closing one embedded game while
      // leaving the room in `playing` would strand the remaining clients.
      if (t === "mx_over"){
        if ((this.meta.mode !== "mathexplorer" && this.meta.mode !== "math-explorer") || this.meta.phase !== "playing") return;
        this._endAndBackToLobby(300);
        return;
      }



      // ----- MathExplorer relay (generic packet) -----
      if (t === "mx_msg") {
        if (this.meta.phase !== "playing") return;
        if (this.meta.mode !== "mathexplorer" && this.meta.mode !== "math-explorer") return;
        const inner = (d && d.msg && typeof d.msg === "object") ? d.msg : {};
        let kind = String(inner.kind||inner.t||"");
        if (kind === "mx_chat" || kind === "chat_msg") kind = "chat";

        // throttle high-frequency packets
        if (kind === "state" || kind === "world" || kind === "mx_state" || kind === "mx_world") {
          const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0, skTs:0, mxTs:0, mxWorldTs:0 };
          const n = now();
          if (kind === "state" || kind === "mx_state"){
            if (n - (lim.mxTs||0) < 60) return;
            lim.mxTs = n;
          } else {
            if (n - (lim.mxWorldTs||0) < 90) return;
            lim.mxWorldTs = n;
          }
          this._relayLimiter.set(uid, lim);
        }

        // Host-only kinds (room host or seat0 authoritative broadcast)
        const sender = this.users.get(uid);
        const senderSeat = Number(sender?.seat ?? 99);
        const isAuthoritativeSender = !!sender?.isHost || senderSeat === 0;
        const mxEventName = String(inner.evt || inner.event || "");
        const guestMxEvents = new Set([
          "remote_attack", "choice_done", "choice_apply", "choice_request",
          "chest_touch", "taunt_shield_pick"
        ]);
        if ((kind === "phase_sync" || kind === "world" || kind === "mx_phase" || kind === "mx_world") && !isAuthoritativeSender) {
          return;
        }
        if (kind === "mx_event" && !isAuthoritativeSender && !guestMxEvents.has(mxEventName)) {
          return;
        }

        // cache latest states/world/phase for late-join sync
        try{
          if (!this.mx) this.mx = { startPayload:null, latestStates:{}, latestWorld:null, latestPhase:null, latestEvent:null, lastActiveAt:0 };
          this.mx.lastActiveAt = now();
          if (kind === "state") {
            this.mx.latestStates[String(uid)] = Object.assign({}, inner, { from:String(uid) });
          } else if (kind === "world" || kind === "mx_world") {
            this.mx.latestWorld = Object.assign({}, inner, { from:String(uid) });
          } else if (kind === "phase_sync" || kind === "mx_phase") {
            this.mx.latestPhase = Object.assign({}, inner, { from:String(uid) });
          } else if (kind === "mx_event") {
            this.mx.latestEvent = Object.assign({}, inner, { from:String(uid) });
          }
        }catch(_){ }

        const out = Object.assign({}, inner, {
          from: String(uid),
          seat: Number(this.users.get(uid)?.seat ?? -1),
          nick: safeNick(this.users.get(uid)?.nick || "")
        });
        // Guest-originated gameplay events always belong to the authenticated socket.
        // Do not trust a client-provided sid: it caused rewards/attacks to be applied
        // to the wrong player and made per-client effects diverge.
        if (kind === "mx_event" && !isAuthoritativeSender) out.sid = String(uid);
        this._broadcast("mx_msg", { msg: out });
        if (kind === "mx_event" && String(inner.evt || "") === "game_over_all") {
          this._endAndBackToLobby(2300);
        }
        return;
      }
      // ----- Backrooms3d relay (generic packet) -----
      if (t === "br_msg") {
        if (this.meta.mode !== "backrooms3d" || this.meta.phase !== "playing") return;
        const inner = (d && d.msg && typeof d.msg === "object") ? d.msg : {};
        let kind = String(inner.kind || inner.t || "");
        // 포획은 아래 최신 위치 기반 서버 판정만 허용한다.
        if (kind === "caught") return;

        if (kind === "state" || kind === "world") {
          const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0, skTs:0, mxTs:0, mxWorldTs:0, brTs:0, brWorldTs:0 };
          const n = now();
          if (kind === "state") {
            if (n - (lim.brTs||0) < 40) return;
            lim.brTs = n;
          } else {
            if (n - (lim.brWorldTs||0) < 90) return;
            lim.brWorldTs = n;
          }
          this._relayLimiter.set(uid, lim);
        }

        const sender = this.users.get(uid);
        const senderSeat = Number(sender?.seat ?? 99);
        const isAuthoritativeSender = !!sender?.isHost || senderSeat === 0;
        if ((kind === "world" || kind === "caught" || kind === "game_end") && !isAuthoritativeSender) {
          return;
        }

        const startRole = String(this.br?.startPayload?.roles?.[String(uid)]?.role ||
          (String(this.br?.startPayload?.monsterSid||'')===String(uid) ? 'monster' : 'rabbit'));
        const cleanInner = kind === 'state' ? Object.assign({}, inner, {
          x:clampNumber(inner.x,-220,220),y:clampNumber(inner.y,-4,20),z:clampNumber(inner.z,-220,220),
          yaw:clampNumber(inner.yaw,-Math.PI*4,Math.PI*4),vx:clampNumber(inner.vx,-30,30),vz:clampNumber(inner.vz,-30,30),
          seq:Math.max(0,Math.floor(Number(inner.seq)||0)),hasKey:!!inner.hasKey,ghost:!!inner.ghost,trapped:!!inner.trapped,
          caught:Math.max(0,Math.min(2,Math.floor(Number(inner.caught)||0))),role:startRole
        }) : inner;

        try{
          if (!this.br) this.br = { startPayload:null, latestStates:{}, latestWorld:null, latestChat:[], ending:false, catchCooldown:{}, caughtCounts:{} };
          if (kind === "game_end" && this.br.ending) return;
          if (kind === "leave") {
            if (this.br.latestStates) delete this.br.latestStates[String(uid)];
          } else if (kind === "state") {
            this.br.latestStates[String(uid)] = Object.assign({}, cleanInner, { from:String(uid), _serverAt:n });
            this._checkBackroomsCatches();
          } else if (kind === "world") {
            this.br.latestWorld = Object.assign({}, inner, { from:String(uid) });
          } else if (kind === "chat") {
            this.br.latestChat.push(Object.assign({}, inner, { from:String(uid) }));
            if (this.br.latestChat.length > 30) this.br.latestChat = this.br.latestChat.slice(-30);
          } else if (kind === "game_end") {
            this.br.ending = true;
          }
        }catch(_){ }

        const out = Object.assign({}, cleanInner, { from: String(uid), seat: Number(this.users.get(uid)?.seat ?? -1), nick: safeNick(this.users.get(uid)?.nick || "") });
        this._broadcast("br_msg", { msg: out });
        // If the authoritative room host closes Backrooms while staying in the
        // outer room, nobody else can publish world snapshots. End cleanly
        // instead of leaving the remaining players in a frozen match.
        if (kind === "leave" && isAuthoritativeSender) this._endAndBackToLobby(300);
        if (kind === "game_end") this._endAndBackToLobby(2600);
        return;
      }

      // ----- DrawAnswer (Pictionary-like) -----
      if (t === "da_enter"){
        if (this.meta.mode !== "drawanswer" || this.meta.phase !== "playing") return;
        if (!this.da || !this.da.active) return;
        if (!this.da.inGame) this.da.inGame = {};
        this.da.inGame[uid] = true;
        // (선택) 사용자가 게임 화면을 다시 열었을 때, 진행중인 세션에 복귀할 수 있게 order/score에 추가
        try{
          if (Array.isArray(this.da.order) && !this.da.order.includes(uid)){
            this.da.order.push(uid);
          }
          if (!this.da.scores) this.da.scores = {};
          if (!this.da.scores[uid]){
            const nn = this.users.get(uid)?.nick || 'Player';
            this.da.scores[uid] = { score:0, streak:0, nick: nn };
          }
        }catch(_){ }
        return;
      }

      if (t === "da_exit"){
        if (this.meta.mode !== "drawanswer" || this.meta.phase !== "playing") return;
        if (!this.da || !this.da.active) return;
        if (!this.da.inGame) this.da.inGame = {};
        if (this.da.inGame[uid] === false) return;
        this.da.inGame[uid] = false;

        // 채팅에 "나감" 표기 (요청)
        try{
          const nn = this.users.get(uid)?.nick || 'Player';
          this._broadcast('da_chat', { system:true, text: `${nn} 나감`, ts: now() });
        }catch(_){ }

        // 방을 나가지 않았더라도 "게임"에서는 이탈로 처리
        try{ this._daOnLeave(uid); }catch(_){ }
        return;
      }

      if (t === "da_sync"){
        if (this.meta.mode !== "drawanswer") return;
        this._sendDaSync(ws, uid);
        return;
      }

      if (t === "da_draw"){
        if (this.meta.mode !== "drawanswer" || this.meta.phase !== "playing") return;
        if (!this.da || uid !== this.da.drawerUid) return;
        const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0, skTs:0, daTs:0 };
        const n = now();
        if (n - (lim.daTs||0) < 35) return;
        lim.daTs = n;
        this._relayLimiter.set(uid, lim);

        const segs = Array.isArray(d.segs) ? d.segs : [];
        if (!segs.length) return;
        const c = String(d.c || "#000000").slice(0, 20);
        const w = Math.max(1, Math.min(24, Number(d.w||5)));

        // store for late joiner replay (cap size)
        try{
          this.da.ops.push({ t:"draw", segs: segs.slice(0, 120), c, w });
          if (this.da.ops.length > 450) this.da.ops.splice(0, this.da.ops.length - 450);
        }catch(_){ }

        this._broadcast("da_draw", { segs: segs.slice(0, 120), c, w });
        return;
      }

      if (t === "da_clear"){
        if (this.meta.mode !== "drawanswer" || this.meta.phase !== "playing") return;
        if (!this.da || uid !== this.da.drawerUid) return;
        try{
          this.da.ops.push({ t:"clear" });
          if (this.da.ops.length > 450) this.da.ops.splice(0, this.da.ops.length - 450);
        }catch(_){ }
        this._broadcast("da_clear", {});
        return;
      }

      if (t === "da_chat"){
        if (this.meta.mode !== "drawanswer" || this.meta.phase !== "playing") return;
        const u = this.users.get(uid);
        if (!u) return;
        const text = String(d.text||"").slice(0, 120);
        if (!text.trim()) return;
        // broadcast chat first (UI responsiveness)
        this._broadcast("da_chat", { nick: u.nick, text, ts: now() });
        try{ this._daHandleGuess(uid, u.nick, text); }catch(_){ }
        return;
      }

      // ----- Coop aggregation (togester) -----
      if (t === "tg_state"){
        // rate-limit client spam (client already throttles)
        const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0 };
        const n = now();
        if (n - lim.tgTs < 40) return;
        lim.tgTs = n;
        this._relayLimiter.set(uid, lim);

        // store per-player state, broadcast aggregated snapshot at ~20fps
        // + 요청사항: 발판 생성 제한을 "라운드당"이 아니라 "목숨(사망/리스폰)당"으로 처리
        const prev = (this.tg.players && this.tg.players[uid]) ? this.tg.players[uid] : {};
        const prevDead = !!prev.isDead;
        const nextState = d.state || {};
        const nextDead = !!nextState.isDead;
        this.tg.players[uid] = nextState;

        // Death/respawn => reset this player's floor quota on the server
        if (this.meta.mode === "togester"){
          if (!this.tg.floorUsed) this.tg.floorUsed = {};
          if ((nextDead && !prevDead) || (!nextDead && prevDead)){
            this.tg.floorUsed[uid] = 0;
            try{ this._send(ws, "tg_floor_quota", { used: 0, limit: 2 }); }catch(_){ }
          }
        }
        this._scheduleTgBroadcast();
        return;
      }

      if (t === "tg_button"){
        if (this.meta.mode === "togester"){
          const sender = this.users.get(uid);
          if (!sender || !sender.isHost) return;
          if (!this.tg.buttons) this.tg.buttons = {};
          this.tg.buttons[String(d.idx)] = !!d.pressed;
        }
        this._broadcast("tg_button", { idx: d.idx, pressed: !!d.pressed });
        return;
      }
      if (t === "tg_buttons"){
        if (this.meta.mode === "togester"){
          const sender = this.users.get(uid);
          if (!sender || !sender.isHost) return;
          this.tg.buttons = d.buttons || {};
        }
        this._broadcast("tg_buttons", { buttons: d.buttons || {} });
        return;
      }
      if (t === "tg_level"){
        if (this.meta.mode === "togester"){
          this.tg.level = d.level;
          // Level change: clear transient state (floors/buttons) so everyone stays in sync
          this.tg.floors = {};
          this.tg.buttons = {};
          this.tg.boxes = {};
          this.tg.floorUsed = {};
          this.tg.puzzle = null;
          this.tg.itemOwners = {};
          this._broadcast("tg_floors", { floors: [] });
          this._broadcast("tg_buttons", { buttons: {} });
          this._broadcast("tg_boxes", { level: d.level, boxes: [] });
          this._broadcast("tg_puzzle", { level: d.level, boxes: [], buttons: {}, doors: [], lifts: [], bridges: [] });
        }
        this._broadcast("tg_level", { level: d.level });
        return;
      }
      if (t === "tg_reset"){
        if (this.meta.mode === "togester"){
          this.tg.floors = {};
          this.tg.buttons = {};
          this.tg.boxes = {};
          this.tg.floorUsed = {};
          this.tg.puzzle = null;
          this.tg.itemOwners = {};
          this._broadcast("tg_floors", { floors: [] });
          this._broadcast("tg_boxes", { level: this.tg.level || 1, boxes: [] });
          this._broadcast("tg_puzzle", { level: this.tg.level || 1, boxes: [], buttons: {}, doors: [], lifts: [], bridges: [] });
        }
        this._broadcast("tg_reset", { t: d.t || now() });
        return;
      }

      if (t === "tg_sync"){
        if (this.meta.mode !== "togester") return;
        try{
          const floors = Object.values(this.tg.floors || {});
          this._send(ws, "tg_floors", { floors });
        }catch(_){ }
        try{ this._send(ws, "tg_level", { level: this.tg.level || 1 }); }catch(_){ }
        try{ this._send(ws, "tg_buttons", { buttons: this.tg.buttons || {} }); }catch(_){ }
        try{ this._send(ws, "tg_boxes", { level: this.tg.level || 1, boxes: Object.values(this.tg.boxes || {}) }); }catch(_){ }
        try{ if (this.tg.puzzle) this._send(ws, "tg_puzzle", this.tg.puzzle); }catch(_){ }
        try{
          const used = (this.tg.floorUsed && this.tg.floorUsed[uid]) ? this.tg.floorUsed[uid] : 0;
          this._send(ws, "tg_floor_quota", { used, limit: 2 });
        }catch(_){ }
        return;
      }

      if (t === "tg_push"){
        if (this.meta.mode !== "togester") return;
        // Broadcast a push impulse (clients will filter by `to`)
        this._broadcast("tg_push", { to: String(d.to||""), dx: Number(d.dx)||0, dy: Number(d.dy)||0, from: uid });
        return;
      }

      if (t === "tg_item"){
        if (this.meta.mode !== "togester") return;
        const action = String(d.action || "");
        if (!["spawn","pick","drop","use"].includes(action)) return;
        if (!this.tg.itemOwners) this.tg.itemOwners = {};
        const id = String(d.id || d.item?.id || "").slice(0, 80);
        if (action === "spawn") {
          const sender = this.users.get(uid);
          if (!sender?.isHost) return;
        }
        if (action === "pick") {
          if (!id || this.tg.itemOwners[id]) return;
          this.tg.itemOwners[id] = uid;
        }
        if ((action === "use" || action === "drop") && (!id || this.tg.itemOwners[id] !== uid)) return;
        if (action === "drop") delete this.tg.itemOwners[id];
        const item = d.item && typeof d.item === "object" ? {
          id, type:String(d.item.type||"").slice(0,20),
          x:Math.max(-2000,Math.min(20000,Number(d.item.x)||0)), y:Math.max(-2000,Math.min(20000,Number(d.item.y)||0)),
          vx:Math.max(-12,Math.min(12,Number(d.item.vx)||0)), vy:Math.max(-16,Math.min(16,Number(d.item.vy)||0)), landed:!!d.item.landed
        } : undefined;
        this._broadcast("tg_item", { action, level:Number(d.level)||this.tg.level||1, evt:String(d.evt||"").slice(0,100),
          id, itemType:String(d.itemType||"").slice(0,20), charges:Math.max(0,Math.min(20,Number(d.charges)||0)), item,
          effect:d.effect&&typeof d.effect==="object"?d.effect:undefined, from:uid });
        return;
      }

      if (t === "tg_box_impulse"){
        if (this.meta.mode !== "togester") return;
        const id = String(d.id || "").slice(0, 32);
        if (!id) return;
        this._broadcast("tg_box_impulse", {
          id,
          level: Number(d.level) || (this.tg.level || 1),
          vx: Math.max(-8, Math.min(8, Number(d.vx) || 0)),
          from: uid
        });
        return;
      }

      if (t === "tg_puzzle") {
        if (this.meta.mode !== "togester") return;
        const sender = this.users.get(uid);
        if (!sender || !sender.isHost) return;
        const level = Number(d.level) || (this.tg.level || 1);
        const buttons = (d.buttons && typeof d.buttons === 'object') ? d.buttons : {};
        const doors = Array.isArray(d.doors) ? d.doors.map(x => ({ open: !!(x && x.open) })) : [];
        const lifts = Array.isArray(d.lifts) ? d.lifts.map(x => ({ y: Number(x && x.y) || 0 })) : [];
        const bridges = Array.isArray(d.bridges) ? d.bridges.map(x => ({ active: !!(x && x.active) })) : [];
        const arr = Array.isArray(d.boxes) ? d.boxes : [];
        this.tg.boxes = {};
        for (const raw of arr){
          const id = String(raw && raw.id || "").slice(0, 32);
          if (!id) continue;
          this.tg.boxes[id] = {
            id,
            x: Number(raw.x) || 0,
            y: Number(raw.y) || 0,
            vx: Number(raw.vx) || 0,
            vy: Number(raw.vy) || 0,
            width: Math.max(8, Number(raw.width) || 40),
            height: Math.max(8, Number(raw.height) || 40)
          };
        }
        // Keep button cache for legacy tg_button/tg_buttons sync compatibility.
        this.tg.buttons = {};
        for (const k of Object.keys(buttons)) this.tg.buttons[String(k)] = !!buttons[k];
        this.tg.puzzle = { level, boxes: Object.values(this.tg.boxes), buttons: this.tg.buttons, doors, lifts, bridges };
        this._broadcast("tg_puzzle", this.tg.puzzle);
        return;
      }

      if (t === "tg_boxes"){
        if (this.meta.mode !== "togester") return;
        const sender = this.users.get(uid);
        if (!sender || !sender.isHost) return; // host authoritative snapshot only
        const level = Number(d.level) || (this.tg.level || 1);
        if (level !== (this.tg.level || level)) this.tg.level = level;
        const arr = Array.isArray(d.boxes) ? d.boxes : [];
        this.tg.boxes = {};
        for (const raw of arr){
          const id = String(raw && raw.id || "").slice(0, 32);
          if (!id) continue;
          this.tg.boxes[id] = {
            id,
            x: Number(raw.x) || 0,
            y: Number(raw.y) || 0,
            vx: Number(raw.vx) || 0,
            vy: Number(raw.vy) || 0,
            width: Math.max(8, Number(raw.width) || 40),
            height: Math.max(8, Number(raw.height) || 40)
          };
        }
        this._broadcast("tg_boxes", { level, boxes: Object.values(this.tg.boxes) });
        return;
      }

      if (t === "tg_floor"){
        if (this.meta.mode !== "togester") return;
        const id = String(d.id || "");
        if (!id) return;
        const owner = uid; // do not allow spoofing

        const LIMIT = 2;
        if (!this.tg.floorUsed) this.tg.floorUsed = {};
        const used = Number(this.tg.floorUsed[owner] || 0);
        if (used >= LIMIT){
          // Deny but inform the requester so UI can update.
          try{ this._send(ws, "tg_floor_quota", { used, limit: LIMIT }); }catch(_){ }
          return;
        }

        const pl = {
          id,
          owner,
          x: Number(d.x)||0,
          y: Number(d.y)||0,
          width: Math.max(10, Number(d.width)||90),
          height: Math.max(6, Number(d.height)||20),
          color: String(d.color || '#2f3640').slice(0, 32)
        };
        this.tg.floors[id] = pl;
        this.tg.floorUsed[owner] = used + 1;
        try{ this._send(ws, "tg_floor_quota", { used: used + 1, limit: LIMIT }); }catch(_){ }
        this._broadcast("tg_floor", pl);
        return;
      }

      if (t === "tg_floor_remove"){
        if (this.meta.mode !== "togester") return;
        const owner = safeId(d.owner) || uid;
        const ids = Array.isArray(d.ids) ? d.ids.map(x=>String(x||'')).filter(Boolean) : null;
        if (ids && ids.length){
          for (const fid of ids){
            if (this.tg.floors && this.tg.floors[fid]) delete this.tg.floors[fid];
          }
          this._broadcast("tg_floor_remove", { ids });
        } else {
          const removed = [];
          for (const [fid, pl] of Object.entries(this.tg.floors || {})){
            if (pl && String(pl.owner||'') === String(owner)){
              removed.push(fid);
              delete this.tg.floors[fid];
            }
          }
          if (removed.length){
            this._broadcast("tg_floor_remove", { owner });
          }
        }
        return;
      }
      if (t === "tg_over"){
        if (this.meta.phase !== "playing") return;
        const success = !!d.success;
        this._broadcast("result", { mode:"togester", done:true, success, reason: d.reason || "" });
        this._endAndBackToLobby(2500);
        return;
      }

      // ----- StarPaint relay (host-authoritative world) -----
      if (t === "pb_input"){
        if (this.meta.mode !== "starpaint" || this.meta.phase !== "playing") return;
        const clean = d.input && typeof d.input === "object" ? {
          left:!!d.input.left, right:!!d.input.right,
          jumpSeq:Number(d.input.jumpSeq||0)>>>0, pickSeq:Number(d.input.pickSeq||0)>>>0,
          useSeq:Number(d.input.useSeq||0)>>>0, swapSeq:Number(d.input.swapSeq||0)>>>0,
          respawnSeq:Number(d.input.respawnSeq||0)>>>0, quizRespawn:!!d.input.quizRespawn,
          shotAngleDeg:Number(d.input.shotAngleDeg||0), shotPower:Number(d.input.shotPower||0), shotCharged:!!d.input.shotCharged
        } : {};
        this._broadcast("pb_input", { from:uid, input:clean });
        return;
      }
      if (t === "pb_state"){
        if (this.meta.mode !== "starpaint" || this.meta.phase !== "playing") return;
        const sender=this.users.get(uid); if(!sender?.isHost) return;
        if(!this.pb) this.pb={state:null};
        this.pb.state = d.state && typeof d.state === "object" ? d.state : null;
        if (this.pb.state) this._broadcast("pb_state", { state:this.pb.state });
        return;
      }
      if (t === "pb_hit"){
        if (this.meta.mode !== "starpaint" || this.meta.phase !== "playing") return;
        const sender=this.users.get(uid); if(!sender?.isHost) return;
        const hit=d.hit&&typeof d.hit==="object"?d.hit:null; if(!hit) return;
        const targetSid=String(hit.targetSid||""); if(!targetSid||!this.users.has(targetSid)) return;
        this._broadcast("pb_hit", { hit:{ targetSid, vx:Number(hit.vx)||0, vy:Number(hit.vy)||0, duration:Math.max(80,Math.min(800,Number(hit.duration)||240)) } });
        return;
      }
      if (t === "pb_fx"){
        if (this.meta.mode !== "starpaint" || this.meta.phase !== "playing") return;
        const sender=this.users.get(uid); if(!sender?.isHost) return;
        const ev=d.event&&typeof d.event==="object"?d.event:null; if(!ev) return;
        this._broadcast("pb_fx", { event:ev });
        return;
      }
      if (t === "pb_sync"){
        if (this.meta.mode !== "starpaint" || this.meta.phase !== "playing") return;
        if (this.pb && this.pb.state) this._send(ws, "pb_state", { state:this.pb.state });
        return;
      }
      if (t === "pb_over"){
        if (this.meta.mode !== "starpaint" || this.meta.phase !== "playing") return;
        const sender=this.users.get(uid); if(!sender?.isHost) return;
        const winnerSeat=Math.max(0,Math.min(7,Number(d.winnerSeat)||0));
        const scores=Array.isArray(d.scores)?d.scores.slice(0,8).map(v=>Math.max(0,Number(v)||0)):[];
        this._broadcast("pb_over", { winnerSeat, scores, state:this.pb&&this.pb.state?this.pb.state:null });
        this._broadcast("result", { mode:"starpaint", done:true, winnerSeat, scores });
        this._endAndBackToLobby(2400);
        return;
      }
      if (t === "pb_quit"){
        if (this.meta.mode !== "starpaint") return;
        return;
      }

      // ----- SnakeTail relay (snaketail) -----
      if (t === "st_sync"){
        // Client asks for a resync (useful when iframe loads after initial broadcast)
        if (this.meta.mode !== "snaketail") return;
        if (this.meta.phase !== "playing") return;
        try{ this._send(ws, "st_timer", { startTs: this.st.startedAt || now(), durationMs: this.st.durationMs || 180000 }); }catch(_){ }
        try{ this._send(ws, "st_foods", { foods: Array.isArray(this.st.foods) ? this.st.foods : [] }); }catch(_){ }
        try{ this._send(ws, "st_players", { players: this.st.players || {} }); }catch(_){ }
        try{ this._send(ws, "st_scores", { scores: this.st.scores || {} }); }catch(_){ }
        return;
      }

      if (t === "st_state"){
        const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0 };
        const n = now();
        if (n - (lim.stTs||0) < 80) return;
        lim.stTs = n;
        this._relayLimiter.set(uid, lim);

        const state = d.state || {};
        const prevState = this.st.players[uid] || null;
        const prevScore = this.st.scores[uid] || null;
        this.st.players[uid] = state;

        // Keep a lightweight score snapshot on the server (mass, alive)
        const mass = Number(state.mass || state.score || 0) || 0;
        const incomingAlive = state.alive !== false;
        const alive = (prevScore && prevScore.alive === false) ? false : incomingAlive;
        const nick = this.users.get(uid)?.nick || safeNick(state.nick || "");
        this.st.scores[uid] = { mass, alive, nick };

        // Existing st_state is also the authoritative death transition. This covers
        // wall/self deaths without adding a new protocol message. Host-reported kills
        // mark the score dead first, so they do not duplicate these pellets.
        if (prevScore && prevScore.alive !== false && incomingAlive === false){
          const body = Array.isArray(state.body) && state.body.length ? state.body : (Array.isArray(prevState?.body) ? prevState.body : []);
          const pellets = [];
          for (let i=0; i<body.length && pellets.length<80; i++){
            const pt = body[i]; if(!pt) continue;
            const x = Number(pt.x||0)||0, y = Number(pt.y||0)||0;
            const value = Math.max(1, Math.min(4, Math.round(mass/Math.max(1, body.length)) || 1));
            const kind = value >= 4 ? 3 : (value >= 2 ? 2 : 1);
            const rec = { id:`death-${uid}-${n}-${i}`, x, y, kind, value };
            this.st.foods.push(rec); pellets.push(rec);
          }
          if (pellets.length) this._broadcast("st_spawn", { foods: pellets });
          this._broadcast("st_event", { event:{ kind:"death", victimSid:uid, killerSid:"", t:n, pellets:pellets.map(p=>p.id) } });
          this._maybeEndSnakeTail();
        }

        this._scheduleStBroadcast();
        return;
      }

      if (t === "st_eat"){
        // Any client can request an eat. Server validates by existence only (best-effort).
        const id = String(d.id || "");
        if (!id) return;
        const idx = (this.st.foods || []).findIndex(f => String(f.id) === id);
        if (idx < 0) return;
        const [food] = this.st.foods.splice(idx, 1);
        // Broadcast consumed + growth info
        this._broadcast("st_eaten", { id, eaterSid: uid, value: Number(food?.value||2)||2, kind: Number(food?.kind||0)||0 });
        // Update server score immediately
        const cur = this.st.scores[uid] || { mass:0, alive:true, nick: this.users.get(uid)?.nick || "" };
        cur.mass = (Number(cur.mass)||0) + (Number(food?.value||2)||2);
        cur.alive = cur.alive !== false;
        this.st.scores[uid] = cur;
        // Keep food count roughly constant
        const newFood = this._randFood();
        this.st.foods.push(newFood);
        this._broadcast("st_spawn", { foods: [newFood] });
        return;
      }

      if (t === "st_spawn"){
        // Host spawns extra food (kills). Non-host players can request *boost pellets* only.
        const foods = Array.isArray(d.foods) ? d.foods : [];
        if (!foods.length) return;

        const source = String(d.source || "");
        const isHost = (uid === this.meta.ownerUserId);

        if (!isHost){
          // Allow boost pellets from any client, but heavily restricted + rate-limited.
          if (source !== "boost") return;
          const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0, stBoostTs:0 };
          const n = now();
          if (n - (lim.stBoostTs||0) < 130) return; // ~7.7/sec max
          lim.stBoostTs = n;
          this._relayLimiter.set(uid, lim);

          // Only 1-2 tiny pellets at a time
          if (foods.length > 2) return;
        }

        const normalized = [];
        for (const f of foods){
          if (!f || typeof f !== "object") continue;
          const id = String(f.id || crypto.randomUUID());
          const x = Number(f.x||0) || 0;
          const y = Number(f.y||0) || 0;
          const valueIn = Number(f.value||0) || 0;
          const kindIn = Number(f.kind||0) || 0;

          // Clamp non-host boost pellets to small values only
          if (!isHost){
            if (x < 0 || y < 0 || x > 2000 || y > 2000) continue;
            if (valueIn > 1.6) continue;
            if (kindIn && kindIn !== 1) continue;
          }

          const ft = this._foodTypeFromValue(valueIn);
          const kind = (kindIn >= 1 && kindIn <= 5) ? kindIn : ft.kind;
          const value = (valueIn > 0) ? valueIn : ft.value;
          const rec = { id, x, y, kind, value };
          this.st.foods.push(rec);
          normalized.push(rec);
        }

        if (normalized.length) this._broadcast("st_spawn", { foods: normalized });
        return;
      }

      if (t === "st_event"){
        // Only host can broadcast authoritative events (kills, roundStart, etc.)
        if (uid !== this.meta.ownerUserId) return;
        const ev = d.event || {};
        this._broadcast("st_event", { event: ev });
        if (ev && ev.kind === "kill"){
          const victimSid = String(ev.victimSid || "");
          if (victimSid){
            const cur = this.st.scores[victimSid] || { mass:0, alive:true, nick:this.users.get(victimSid)?.nick || "" };
            cur.alive = false;
            this.st.scores[victimSid] = cur;
            if (this.st.players[victimSid]) this.st.players[victimSid].alive = false;
            this._maybeEndSnakeTail();
          }
        }
        return;
      }

      if (t === "st_over"){
        if (this.meta.phase !== "playing") return;
        const reason = String(d.reason || "client_over");
        const winnerSid = String(d.winnerSid || "");
        this._endSnakeTail(reason, winnerSid);
        return;
      }

      // ----- Soccer relay (soccer) -----
      if (t === "sc_math_submit"){
        if(this.meta.mode!=="soccer"||this.meta.phase!=="playing"||!this.sc||this.sc.over)return;
        const round=this.sc.round;
        const incomingRoundId=String(d.roundId||"");
        const sendMathAck=(accepted,reason,scoreOverride=null)=>{
          try{
            const activeRound=this.sc?.round;
            const activeId=String(activeRound?.id||"");
            const ownScore=Math.max(0,Number(scoreOverride ?? activeRound?.submissions?.[uid]?.score ?? 0));
            this._send(ws,"sc_math_ack",{
              roundId:incomingRoundId||activeId,
              activeRoundId:activeId,
              accepted:!!accepted,
              reason:String(reason||""),
              score:ownScore,
              expectedQuestionIndex:ownScore,
              phase:String(this.sc?.phase||"idle"),
              serverNow:now()
            });
          }catch(_){ }
        };
        if(!round||incomingRoundId!==String(round.id||"")){
          sendMathAck(false,"round_mismatch");
          return;
        }
        if(this.sc.phase!=="quiz"){
          sendMathAck(false,"round_closed");
          return;
        }
        // Judge quiz answers against the authoritative server deadline. A small receive
        // grace lets an answer clicked just before zero survive ordinary network delay,
        // while answeredAt prevents the settle window itself from becoming extra solving time.
        const recvAt=now();
        const rawAnsweredAt=Number(d.answeredAt);
        const answeredAt=(Number.isFinite(rawAnsweredAt)&&rawAnsweredAt>0)?rawAnsweredAt:recvAt;
        if(recvAt>Number(round.endsAt||0)+350){sendMathAck(false,"recv_late");return;}
        if(answeredAt>Number(round.endsAt||0)+35){sendMathAck(false,"answer_late");return;}
        // The preparation window is not solving time. Keep only a tiny clock-tolerance
        // instead of the old 1s early allowance, otherwise a modified client can pre-answer.
        if(answeredAt<Number(round.beginsAt||0)-35){sendMathAck(false,"answer_early");return;}
        try{this._ensureSoccerPlayerRegistered(uid);}catch(_){ }
        if(!this.sc.players?.[uid]){sendMathAck(false,"player_missing");return;}
        const previous=Math.max(0,Number(round.submissions[uid]?.score||0));
        const team=String(this.sc.players?.[uid]?.team||round.submissions[uid]?.team||"");
        if(team!=="A"&&team!=="B"){sendMathAck(false,"team_missing",previous);return;}
        // Final packets only mark that the local UI reached the deadline; scoring is
        // server-authoritative and never trusts a client-provided cumulative score.
        if(d.final===true){sendMathAck(true,"final",previous);return;}
        if(d.questionIndex===null||d.questionIndex===undefined||d.answer===null||d.answer===undefined){
          sendMathAck(false,"bad_payload",previous);return;
        }
        const questionIndex=Number(d.questionIndex);
        const selectedAnswer=Number(d.answer);
        if(!Number.isInteger(questionIndex)||questionIndex<0||!Number.isInteger(selectedAnswer)){
          sendMathAck(false,"bad_payload",previous);return;
        }
        // A player can only solve the next unanswered deterministic question. If an
        // optimistic client ever gets ahead, the ACK tells it exactly which question
        // to restore instead of rejecting every subsequent answer for the whole round.
        if(questionIndex!==previous){sendMathAck(false,"sequence",previous);return;}
        const expected=this._soccerMathAnswer(round.seed,uid,questionIndex);
        if(!Number.isFinite(expected)||selectedAnswer!==expected){sendMathAck(false,"wrong",previous);return;}
        // Team is snapshotted with the earned point, so later disconnect expiry cannot
        // erase learning progress already earned in this round.
        const nextScore=previous+1;
        round.submissions[uid]={ score:nextScore, team };
        sendMathAck(true,"correct",nextScore);
        this._broadcastSoccerRoundProgress();
        return;
      }
      if (t === "sc_pos"){
        if (this.meta.mode !== "soccer") return;
        if (this.meta.phase !== "playing") return;
        if (!this.sc || this.sc.phase !== "playing") return;
        // 자기복구: _initSoccer() 시점에 등록되지 못했거나(레이스), 그 사이
        // 좌석이 늦게 배정된 클라이언트라도 첫 sc_pos가 도착하면 즉시
        // 등록한다. 이게 없으면 한 번이라도 등록을 놓친 클라이언트는
        // 이후 어떤 sc_pos를 보내도 영원히 무시되어, 그 사람만 자기
        // 화면에서는 움직이지만 다른 사람 화면(특히 호스트의 공 물리
        // 판정)에는 전혀 반영되지 않는 문제가 생긴다.
        try{ this._ensureSoccerPlayerRegistered(uid); }catch(_){ }
        const p = this.sc.players?.[uid];
        if (!p) return; // 좌석이 없는(관전 등) 클라이언트만 무시
        p.stateSeq = Number(d.stateSeq ?? p.stateSeq ?? 0);
        p.x   = Number(d.x   ?? p.x);
        p.y   = Number(d.y   ?? p.y);
        p.dir = Number(d.dir ?? p.dir);
        p.vx  = Number(d.vx  ?? 0);
        p.vy  = Number(d.vy  ?? 0);
        if (d.dribble != null) p.dribble = !!d.dribble;
        if (d.dribbleBallX != null) p.dribbleBallX = Number(d.dribbleBallX);
        if (d.dribbleBallY != null) p.dribbleBallY = Number(d.dribbleBallY);
        p.tackle = !!d.tackle;
        if (d.claimAt){
          p.claimAt = Number(d.claimAt) || p.claimAt || 0;
          p.claimBallX = Number(d.claimBallX ?? p.claimBallX ?? 0);
          p.claimBallY = Number(d.claimBallY ?? p.claimBallY ?? 0);
        }
        if (d.kickAt){
          p.kickAt = Number(d.kickAt) || p.kickAt;
          p.kickCharge = Number(d.kickCharge ?? p.kickCharge ?? 0);
          p.kickX = Number(d.kickX ?? p.kickX ?? p.x);
          p.kickY = Number(d.kickY ?? p.kickY ?? p.y);
          p.kickDir = Number(d.kickDir ?? p.kickDir ?? p.dir);
          p.kickVX = Number(d.kickVX ?? p.kickVX ?? p.vx ?? 0);
          p.kickVY = Number(d.kickVY ?? p.kickVY ?? p.vy ?? 0);
          p.kickBallX = Number(d.kickBallX ?? p.kickBallX ?? 0);
          p.kickBallY = Number(d.kickBallY ?? p.kickBallY ?? 0);
        }
        if (d.headerAt){
          p.headerAt = Number(d.headerAt) || p.headerAt || 0;
          p.headerX = Number(d.headerX ?? p.headerX ?? p.x);
          p.headerY = Number(d.headerY ?? p.headerY ?? p.y);
          p.headerDir = Number(d.headerDir ?? p.headerDir ?? p.dir);
          p.headerBallX = Number(d.headerBallX ?? p.headerBallX ?? 0);
          p.headerBallY = Number(d.headerBallY ?? p.headerBallY ?? 0);
        }
        if (d.tackleAt) p.tackleAt = Number(d.tackleAt) || p.tackleAt || 0;
        const urgentSoccerAction=!!(d.kickAt||d.headerAt||d.tackleAt||d.claimAt);
        // 여러 플레이어의 위치 패킷이 같은 33ms 창에 도착해도 마지막 상태를 버리지
        // 않고, 남은 시간 뒤 한 번 더 방송한다. 액션 엣지는 즉시 내보낸다.
        this._scheduleSoccerPlayersBroadcast(urgentSoccerAction);
        return;
      }
      if (t === "sc_ball"){
        if (this.meta.mode !== "soccer") return;
        if (this.meta.phase !== "playing") return;
        if (!this.sc || this.sc.phase !== "playing") return;
        const u = this.users.get(uid);
        // Soccer has exactly one current authority: the server-designated host.
        // Seat 0 is not a fallback authority; after host migration that would create
        // two simultaneous ball authorities when the old seat-0 player reconnects.
        if (!u?.isHost) return;
        this.sc.ball = { x: Number(d.x ?? 0), y: Number(d.y ?? 0), z: Math.max(0, Number(d.z ?? 0)), vx: Number(d.vx ?? 0), vy: Number(d.vy ?? 0), vz: Number(d.vz ?? 0), owner: d.owner ?? null, impactAt: String(d.impactAt||''), impactPower: Number(d.impactPower||0), impactDir: Number(d.impactDir||0), restartText: String(d.restartText||''), restartUntil: Number(d.restartUntil||0), restartSerial: Number(d.restartSerial||0), sentAt: Number(d.sentAt||0), ballSeq: Number(d.ballSeq||0) };
        // broadcast to everyone except the sender (host already has authoritative local state)
        for (const [sock, sUid] of this.sockets.entries()){
          if (sUid && sUid !== uid) this._send(sock, "sc_ball", this.sc.ball);
        }
        return;
      }
      if (t === "sc_goal"){
        if (this.meta.mode !== "soccer" || this.meta.phase !== "playing" || !this.sc || this.sc.over) return;
        if (this.sc.phase !== "playing") return;
        const u = this.users.get(uid);
        if (!u?.isHost) return;
        const team = String(d.team || "");
        if (team !== "A" && team !== "B") return;

        // Worker의 실제 경기시간이 이미 끝났다면, 종료 타이머가 몇 ms 늦게
        // 실행됐더라도 그 뒤 도착한 골을 인정하지 않는다.
        if (this._soccerRemainingMs() <= 0){
          const w=(this.sc.score.A>this.sc.score.B)?"A":(this.sc.score.B>this.sc.score.A)?"B":"draw";
          this._finishSoccer(w);
          return;
        }

        // 동일 골 edge는 딱 한 번만 인정한다. 이전 라운드의 늦은/중복 패킷이
        // 다음 PLAYING까지 살아남아 점수를 또 올리는 것을 방지한다.
        const goalId=String(d.restartId||"");
        if(!goalId)return;
        if(!this.sc.seenGoalIds)this.sc.seenGoalIds=[];
        if(this.sc.seenGoalIds.includes(goalId))return;
        this.sc.seenGoalIds.push(goalId);
        if(this.sc.seenGoalIds.length>64)this.sc.seenGoalIds.splice(0,this.sc.seenGoalIds.length-64);

        this._pauseSoccerClock();
        this.sc.score[team] = Number(this.sc.score[team]||0) + 1;
        this.sc.ball = null;
        // 골 직후 바로 문제 전체화면을 띄우면 골 플래시/폭죽/화면 흔들림이
        // 보이기도 전에 가려진다. 약 1초의 서버 권위 GOAL 단계에서 입력과
        // 경기시계를 잠그고 골 연출을 보여준 뒤 재시작 퀴즈로 넘어간다.
        const goalShowMs=1050;
        this.sc.phase="goal";
        this._broadcast("sc_goal", { team, scoreA:this.sc.score.A, scoreB:this.sc.score.B, restartId:goalId, quizDelayMs:goalShowMs });
        this._broadcastSoccerState();
        this._clearSoccerTransitionTimer();
        this.sc.transitionTimer=setTimeout(()=>{try{this._startSoccerRound("restart");}catch(_){ }},goalShowMs);
        return;
      }
      if (t === "sc_stun"){
        if (this.meta.mode !== "soccer") return;
        if (this.meta.phase !== "playing") return;
        if (!this.sc || this.sc.phase !== "playing") return;
        const u = this.users.get(uid);
        if (!u?.isHost) return;
        const sid = String(d.sid || "");
        const dur = Number(d.dur || 0);
        if (!sid || dur <= 0) return;
        this._broadcast("sc_stun", { sid, dur });
        return;
      }

      if (t === "sc_time_ping"){
        if (this.meta.mode !== "soccer" || !this.sc) return;
        this._send(ws,"sc_time_pong",{clientSentAt:Number(d.clientSentAt||0),serverNow:now()});
        return;
      }

      if (t === "sc_sync"){
        if (this.meta.mode !== "soccer" || !this.sc) return;
        try{ this._ensureSoccerPlayerRegistered(uid); }catch(_){ }
        this._sendSoccerState(ws);
        return;
      }

      // ----- Duel relay (spectate snapshots) -----
      if (t === "duel_state"){
        const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0 };
        const n = now();
        if (n - lim.duelTs < 70) return; // ~14fps cap
        lim.duelTs = n;
        this._relayLimiter.set(uid, lim);

        this._broadcast("duel_state", { sid: uid, state: d.state || {} });
        return;
      }
      if (t === "duel_event"){
        this._broadcast("duel_event", { sid: uid, event: d.event });
        return;
      }

      // duel over signals
      if (t === "duel_over" || t === "sg_over"){
        this._onDuelOver(uid);
        return;
      }
    });

    ws.addEventListener("close", ()=>{
      const uid = this.sockets.get(ws);
      this.sockets.delete(ws);
      if (!uid) return;

      // If this is an old socket that was replaced by a newer connection for the
      // same uid, its delayed close event must not tear down the fresh session.
      if (this.userSockets.get(uid) && this.userSockets.get(uid) !== ws) return;
      this.userSockets.delete(uid);

      // Soccer tolerates short network drops. Preserve seat/team/character and the
      // server player record for 8 seconds so the same uid can reconnect cleanly.
      if (this.meta.mode === "soccer" && this.meta.phase === "playing" && this.sc && !this.sc.over){
        try{
          // If the player who was selected to take kickoff drops during RESULT or
          // COUNTDOWN, hand kickoff to another currently-connected teammate now.
          // Waiting until PLAYING would otherwise leave the ball attached to an
          // offline avatar for the opening moment of the round.
          if (String(this.sc.kickoffOwnerSid||"") === String(uid) &&
              (this.sc.phase === "result" || this.sc.phase === "countdown")){
            this._reassignSoccerKickoffOwner(uid);
            this._broadcastSoccerState();
          }

          // If the authoritative host disconnected, promote the lowest-seat player
          // who is still actually connected. Keeping the old host flag during the
          // reconnect grace would freeze ball physics for the whole grace window.
          if (uid === this.meta.ownerUserId){
            let bestUid="", bestSeat=999;
            for(const [pid,pu] of this.users.entries()){
              if(pid===uid || !this.userSockets.get(pid)) continue;
              const seat=Number(pu?.seat??99);
              if(seat<bestSeat){bestSeat=seat;bestUid=pid;}
            }
            if(bestUid) this.meta.ownerUserId=bestUid;
            this._applyHostFlags();
            this._broadcast("room_state", this._snapshot());
            this._broadcast("sc_roster", { players:this._buildSoccerRoster() });
          }
          const prior=this._soccerDisconnectTimers?.get(uid);
          if(prior) clearTimeout(prior);
          const timer=setTimeout(()=>{
            try{
              this._soccerDisconnectTimers.delete(uid);
              if(this.userSockets.get(uid)) return;
              this._presenceClear(uid, this.meta.roomId);
              this.users.delete(uid);
              if(this.sc?.players?.[uid]) delete this.sc.players[uid];
              this._recalcHost(); this._applyHostFlags();
              this._broadcast("sc_players", { players:this.sc?.players||{} });
              this._broadcast("sc_roster", { players:this._buildSoccerRoster() });
              this._broadcast("room_state", this._snapshot());
              this._scheduleLobbyUpdate();
              // Do not decide match viability from this one expiry in isolation.
              // With two near-simultaneous disconnects, the first expiry can
              // temporarily produce 3 players while the second grace window is still
              // pending; after both settle there may be a valid 2-player match.
              this._checkSoccerRosterViability();
            }catch(_){ }
          },8000);
          this._soccerDisconnectTimers.set(uid,timer);
          this._broadcast("system", { text:`${this.users.get(uid)?.nick||"플레이어"} 연결 복구 대기 중…`, ts:now() });
        }catch(_){ }
        return;
      }

      this._presenceClear(uid, this.meta.roomId);
      const u = this.users.get(uid);
      this.users.delete(uid);

      this._recalcHost();
      this._applyHostFlags();

      // ---- transient per-game state cleanup (no persistence) ----
      // Make sure a leaving player does not remain in any server-side snapshots
      // (prevents ghost state and avoids leaving per-user records in memory).
      try{ this._relayLimiter.delete(uid); }catch(_){ }
      try{
        if (this.tg && this.tg.players && this.tg.players[uid]){
          delete this.tg.players[uid];
          this._scheduleTgBroadcast();
        }
      }catch(_){ }

      // Remove any temporary Togester floors owned by the leaving player
      try{
        const removed = [];
        for (const [fid, pl] of Object.entries((this.tg && this.tg.floors) ? this.tg.floors : {})){
          if (pl && String(pl.owner||'') === String(uid)){
            removed.push(fid);
            delete this.tg.floors[fid];
          }
        }
        if (removed.length){
          this._broadcast("tg_floor_remove", { owner: uid });
        }
      }catch(_){ }
      try{
        if (this.st){
          if (this.st.players && this.st.players[uid]) delete this.st.players[uid];
          if (this.st.scores && this.st.scores[uid]) delete this.st.scores[uid];
          if (this.meta.mode === "snaketail" && this.meta.phase === "playing"){
            this._broadcast("st_players", { players: this.st.players || {} });
            this._broadcast("st_scores", { scores: this.st.scores || {} });
            try{ this._maybeEndSnakeTail(); }catch(_){ }
          }
        }
      }catch(_){ }

      // Soccer: drop the leaver's tracked position and let everyone know the roster shrank.
      try{
        if (this.sc && this.sc.players && this.sc.players[uid]) delete this.sc.players[uid];
        if (this.meta.mode === "soccer" && this.meta.phase === "playing"){
          this._broadcast("sc_players", { players: this.sc.players || {} });
          this._broadcast("sc_roster", { players: this._buildSoccerRoster() });

          // 수학축구는 반드시 짝수(양 팀 동수)로만 진행되어야 하는 게임이다.
          // 경기 도중 누군가 나가서 인원이 홀수가 되거나 한쪽 팀이 아예
          // 없어지면(2명 미만) 그 즉시 현재 스코어 기준으로 경기를 종료한다
          // — 팀 밸런스가 깨진 채로 경기가 계속 진행되는 상황을 막는다.
          const cpu = this._cpuUid();
          let scHumanCount = 0;
          for (const pid of this.users.keys()){ if (pid !== cpu) scHumanCount++; }
          if (!this.sc.over && (scHumanCount < 2 || scHumanCount % 2 !== 0)){
            const sA = this.sc.score?.A||0, sB = this.sc.score?.B||0;
            const w = (sA > sB) ? "A" : (sB > sA) ? "B" : "draw";
            this._finishSoccer(w);
          }
        }
      }catch(_){ }

      // Backrooms3d: remove the cached avatar immediately. Without this cleanup,
      // reconnecting/late-joining clients receive a ghost player forever.
      try{
        if (this.br && this.br.latestStates) delete this.br.latestStates[String(uid)];
        if (this.meta.mode === "backrooms3d" && this.meta.phase === "playing"){
          this._broadcast("br_msg", { msg:{ kind:"peer_left", from:"server", sid:String(uid), nick:safeNick(u?.nick || "") } });
        }
      }catch(_){ }

      // MathExplorer: remove departed peers from late-join snapshots and notify
      // the running clients so shared selection phases do not wait on ghosts.
      try{
        if (this.mx && this.mx.latestStates) delete this.mx.latestStates[String(uid)];
        if ((this.meta.mode === "mathexplorer" || this.meta.mode === "math-explorer") && this.meta.phase === "playing"){
          this._broadcast("mx_msg", { msg:{ kind:"peer_left", from:"server", sid:String(uid), nick:safeNick(u?.nick || "") } });
        }
      }catch(_){ }

      // DrawAnswer: remove leaver from order/score; if drawer left, advance round
      try{
        if (this.meta.mode === "drawanswer" && this.meta.phase === "playing"){
          // In-game chat: announce leaving (so players see it in the drawanswer chat UI)
          try{
            const nn = (u && u.nick) ? u.nick : '누군가';
            this._broadcast('da_chat', { system:true, text: `${nn} 나감`, ts: now() });
          }catch(_){ }
          this._daOnLeave(uid);
        }
      }catch(_){ }

      if (u?.nick){
        this._broadcast("system", { text: `${u.nick} 퇴장`, ts: now() });
      }

      // Tournament: if current player leaves, forfeit.
      if (this.meta.phase === "playing" && this.tour && this.tour.current){
        const cur = this.tour.current;
        if (uid === cur.a || uid === cur.b){
          const winner = (uid === cur.a) ? cur.b : cur.a;
          if (winner && this.users.has(winner)){
            this._finishCurrentMatch(winner, uid);
          } else {
            // no one left -> back to lobby
            this._endAndBackToLobby(0);
          }
        }
      }

      this._recalcHost();
      this._applyHostFlags();

      // If only CPU remains, clean it up so the room can be removed.
      try{
        const cpu = this._cpuUid();
        let humanCount = 0;
        for (const [pid] of this.users.entries()){
          if (pid === cpu) continue;
          humanCount++;
        }
        if (humanCount === 0){
          this._stopCpu();
          this._removeCpuUser();
        }
      }catch(_){ }

      if (this.users.size === 0){
        // No persistence: delete room immediately from lobby and hard-reset transient state.
        try{ this._resetTransientRoomState(); }catch(_){}
        this._deleteFromLobby();
        return;
      }

      this.meta.status = (this.meta.phase === "playing") ? "playing" : "waiting";
      this._scheduleLobbyUpdate();
      this._broadcast("room_state", this._snapshot());
    });
  }


  _resetTransientRoomState(){
    // Hard-reset all in-memory transient room/game state when the room becomes empty.
    // This prevents ghost timers/state surviving hibernation or object reuse.
    try{ if (this._lobbyUpdateTimer){ clearTimeout(this._lobbyUpdateTimer); this._lobbyUpdateTimer = null; } }catch(_){}
    try{ if (this._backToLobbyTimer){ clearTimeout(this._backToLobbyTimer); this._backToLobbyTimer = null; } }catch(_){}
    try{ if (this.tg && this.tg.timer){ clearTimeout(this.tg.timer); } }catch(_){}
    try{ if (this.pb && this.pb.playerTimer){ clearTimeout(this.pb.playerTimer); } }catch(_){}
    try{ if (this.st && this.st.timer){ clearTimeout(this.st.timer); } }catch(_){}
    try{ if (this.st && this.st._timer){ clearTimeout(this.st._timer); } }catch(_){}
    try{ if (this.sc && this.sc.timer){ clearTimeout(this.sc.timer); } }catch(_){}
    try{ if (this.sc?.transitionTimer){ clearTimeout(this.sc.transitionTimer); } }catch(_){}
    try{ if (this.sc?.posBroadcastTimer){ clearTimeout(this.sc.posBroadcastTimer); } }catch(_){}
    try{ if (this.da && this.da.timer){ clearTimeout(this.da.timer); } }catch(_){}

    try{ this.sockets = new Map(); }catch(_){}
    try{ this.userSockets = new Map(); }catch(_){}
    try{ this.users = new Map(); }catch(_){}
    try{ this._relayLimiter = new Map(); }catch(_){}
    try{ this._wired = new WeakSet(); }catch(_){}

    this.tour = null;
    this.tg = { players:{}, floors:{}, lastBroadcast:0, timer:null };
    this.pb = { state:null };
    this.st = { players:{}, foods:[], lastBroadcast:0, timer:null, startedAt:0, durationMs:180000, scores:{} };
    this.sc = { players:{}, ball:null, score:{A:0,B:0}, over:false, lastPosBroadcastAt:0, posBroadcastTimer:null, phase:"idle", round:null, playedMs:0, playStartedAt:0, matchDurationMs:120000, timer:null, transitionTimer:null, kickoffOwnerSid:"", roundSerial:0 };
    this.sk = { startPayload: null };
    this.mx = { startPayload: null, latestStates: {}, latestWorld: null, latestPhase: null, latestEvent: null, lastActiveAt: 0 };
    this.br = { startPayload: null, latestStates: {}, latestWorld: null, latestChat: [], ending:false, catchCooldown:{}, caughtCounts:{} };
    this.da = { active:false, round:0, maxRounds:5, order:[], drawerIdx:0, drawerUid:'', word:'', endAt:0, timer:null, scores:{}, ops:[] };
    this._cpu = { active:false };

    this.meta.phase = 'lobby';
    this.meta.status = 'waiting';
    this.meta.ownerUserId = '';
  }

  _roomIdFromPath(pathHint){
    if (!pathHint) return "";
    const m = String(pathHint).match(/^\/ws\/room\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  _rehydrateSocketsFromState(){
    try{
      const sockets = this.state.getWebSockets();
      for (const ws of sockets){
        const att = wsGetAttachment(ws) || {};
        const uid = safeId(att.uid);
        const nick = safeNick(att.nick || "");
        const seat = (typeof att.seat === "number") ? att.seat : (parseInt(att.seat,10) || 99);
        const ready = !!att.ready;

        // Store a path hint so hello_room can resolve roomId if needed.
        // (Cloudflare does not expose the original request after hibernation.)
        if (!ws._pathHint) ws._pathHint = this.meta.roomId ? ("/ws/room/" + encodeURIComponent(this.meta.roomId)) : "";

        this.sockets.set(ws, uid || "");
        if (uid){
          this.userSockets.set(uid, ws);
          if (!this.users.has(uid)){
            this.users.set(uid, { nick, ready, seat, isHost:false });
          } else {
            const u = this.users.get(uid);
            u.nick = nick;
            u.ready = ready;
            u.seat = u.seat ?? seat;
          }
        }
        this._wireSocket(ws);
      }
      this._recalcHost();
      this._applyHostFlags();
    }catch(_){}
  }

  _scheduleTgBroadcast(){
    if (this.tg.timer) return;
    this.tg.timer = setTimeout(()=>{
      this.tg.timer = null;
      this._broadcast("tg_players", { players: this.tg.players });
    }, 50);
  }

  _checkBackroomsCatches(){
    try{
      if(this.meta.mode!=="backrooms3d"||this.meta.phase!=="playing"||!this.br?.startPayload)return;
      const start=this.br.startPayload;
      if(now()<Number(start.startedAt||0)+10000)return;
      const states=this.br.latestStates||{};
      const roles=start.roles||{};
      if(!this.br.catchCooldown)this.br.catchCooldown={};
      if(!this.br.caughtCounts)this.br.caughtCounts={};
      const roleOf=(sid)=>String(roles[String(sid)]?.role||
        (String(start.monsterSid||'')===String(sid)?'monster':'rabbit'));
      const hunters=Object.entries(states).filter(([sid,st])=>roleOf(sid)==='monster'&&!st?.ghost);
      const rabbits=Object.entries(states).filter(([sid,st])=>roleOf(sid)==='rabbit'&&!st?.ghost&&!st?.trapped);
      const stamp=now();
      const catchRadius=2.75;
      for(const [,hunter] of hunters){
        if(stamp-Number(hunter?._serverAt||stamp)>1500)continue;
        for(const [target,rabbit] of rabbits){
          if(stamp-Number(rabbit?._serverAt||stamp)>1500)continue;
          if(stamp-Number(this.br.catchCooldown[target]||0)<3000)continue;
          const dx=Number(rabbit?.x||0)-Number(hunter?.x||0);
          const dz=Number(rabbit?.z||0)-Number(hunter?.z||0);
          if(dx*dx+dz*dz>catchRadius*catchRadius)continue;
          const count=Math.min(2,Math.max(Number(this.br.caughtCounts[target]||0),Number(rabbit?.caught||0))+1);
          this.br.catchCooldown[target]=stamp;
          this.br.caughtCounts[target]=count;
          this.br.latestStates[target]=Object.assign({},rabbit,{caught:count,trapped:count<2,ghost:count>=2,hasKey:false});
          this._broadcast("br_msg",{msg:{kind:"caught",target:String(target),caught:count,from:"server",nick:"SYSTEM"}});
          return;
        }
      }
    }catch(_){ }
  }

  // -------- Soccer helpers --------
  _buildSoccerRoster(){
    const cpu = this._cpuUid();
    return Array.from(this.users.entries())
      .filter(([uid]) => uid !== cpu)
      .map(([uid, u]) => ({ sid: String(uid), nick: safeNick(u?.nick), seat: Number(u?.seat ?? 99), isHost: !!u?.isHost, characterVariant: Math.max(0,Math.min(5,Number(this.sc?.players?.[uid]?.characterVariant ?? 0)|0)) }))
      .sort((a,b)=> (a.seat??99) - (b.seat??99));
  }

  _checkSoccerRosterViability(){
    if(this.meta.mode!=="soccer"||this.meta.phase!=="playing"||!this.sc||this.sc.over)return;
    // A reserved user inside reconnect grace is not a final roster decision yet.
    // Wait until every outstanding grace either reconnects or expires, then judge
    // the stable roster exactly once.
    if(this._soccerDisconnectTimers && this._soccerDisconnectTimers.size>0)return;
    const cpu=this._cpuUid();
    let humans=0,teamA=0,teamB=0;
    for(const pid of this.users.keys())if(pid!==cpu)humans++;
    for(const [pid,p] of Object.entries(this.sc.players||{})){
      if(pid===cpu||!this.users.has(pid))continue;
      if(p?.team==="A")teamA++;else if(p?.team==="B")teamB++;
    }
    // Even headcount alone is not enough: after two same-team departures a 4P match
    // could otherwise continue as A=0/B=2. Continue only when both teams still have
    // the same non-zero number of players.
    if(humans<2||humans%2!==0||teamA<1||teamB<1||teamA!==teamB){
      const a=Number(this.sc.score?.A||0),b=Number(this.sc.score?.B||0);
      this._finishSoccer(a>b?"A":b>a?"B":"draw");
    }
  }

  _reassignSoccerKickoffOwner(excludeUid=""){
    if(!this.sc||!this.sc.round)return "";
    const winner=String(this.sc.round.winner||"");
    if(winner!=="A"&&winner!=="B"){this.sc.kickoffOwnerSid="";return "";}
    const candidates=Object.entries(this.sc.players||{})
      .filter(([sid,p])=>String(sid)!==String(excludeUid||"")&&p?.team===winner&&!!this.userSockets.get(sid))
      .sort((a,b)=>Number(a[1]?.seat??99)-Number(b[1]?.seat??99));
    this.sc.kickoffOwnerSid=candidates.length?String(candidates[0][0]):"";
    return this.sc.kickoffOwnerSid;
  }


  _ensureSoccerKickoffOwnerConnected(){
    if(!this.sc||!this.sc.round)return "";
    const current=String(this.sc.kickoffOwnerSid||"");
    if(current&&this.userSockets.get(current))return current;
    return this._reassignSoccerKickoffOwner(current);
  }

  _delaySoccerTransitionForKickoffOwner(roundId,phase){
    const r=this.sc?.round;
    if(!r||this.sc.over||String(r.id)!==String(roundId))return false;
    if(this._ensureSoccerKickoffOwnerConnected())return false;
    // A whole winning team can be inside the 8s reconnect grace. Do not let RESULT
    // or COUNTDOWN advance into a PLAYING state with nobody able to receive kickoff.
    if(this._soccerDisconnectTimers&&this._soccerDisconnectTimers.size>0){
      this._clearSoccerTransitionTimer();
      const waitMs=500;
      if(phase==="result"){
        this.sc.phase="result";
        r.resultUntil=now()+waitMs;
        r.kickoffAt=r.resultUntil+3000;
      }else{
        this.sc.phase="countdown";
        r.kickoffAt=now()+1000;
      }
      this._broadcastSoccerState();
      this.sc.transitionTimer=setTimeout(()=>{
        try{
          if(phase==="result")this._startSoccerCountdown(roundId);
          else this._startSoccerPlay(roundId);
        }catch(_){ }
      },waitMs);
      return true;
    }
    // With no reconnect grace left, the normal roster viability check decides whether
    // the match can continue. If it somehow remains viable, retry shortly rather than
    // opening play without a valid kickoff owner.
    this._checkSoccerRosterViability();
    if(this.sc?.over)return true;
    this._clearSoccerTransitionTimer();
    this.sc.transitionTimer=setTimeout(()=>{
      try{
        if(phase==="result")this._startSoccerCountdown(roundId);
        else this._startSoccerPlay(roundId);
      }catch(_){ }
    },250);
    return true;
  }

  _pickSoccerCharacterVariant(team){
    const used=new Set(Object.values(this.sc?.players||{}).filter(p=>p?.team===team).map(p=>Number(p.characterVariant)).filter(v=>Number.isFinite(v)));
    const choices=[0,1,2,3,4,5].filter(v=>!used.has(v));
    const pool=choices.length?choices:[0,1,2,3,4,5];
    return pool[Math.floor(Math.random()*pool.length)]||0;
  }

  _ensureSoccerPlayerRegistered(uid){
    if (!this.sc || this.sc.players[uid]) return;
    const u = this.users.get(uid);
    const seat = Number(u?.seat ?? -1);
    if (seat < 0) return;
    this.sc.players[uid] = {
      x: 0, y: 0, dir: 0, vx: 0, vy: 0,
      nick: safeNick(u?.nick),
      seat,
      team: (seat % 2 === 0) ? "A" : "B",
      characterVariant: this._pickSoccerCharacterVariant((seat % 2 === 0) ? "A" : "B"),
      kickAt: 0, kickCharge: 0, tackle: false,
    };
  }

  _soccerRemainingMs(){
    if(!this.sc)return 0;
    let played=Number(this.sc.playedMs||0);
    if(this.sc.phase==="playing"&&this.sc.playStartedAt>0)played+=Math.max(0,now()-this.sc.playStartedAt);
    return Math.max(0,Number(this.sc.matchDurationMs||120000)-played);
  }

  _pauseSoccerClock(){
    if(!this.sc)return;
    if(this.sc.phase==="playing"&&this.sc.playStartedAt>0){
      this.sc.playedMs=Number(this.sc.playedMs||0)+Math.max(0,now()-this.sc.playStartedAt);
    }
    this.sc.playStartedAt=0;
    if(this.sc.timer){try{clearTimeout(this.sc.timer);}catch(_){ }this.sc.timer=null;}
  }

  _resumeSoccerClock(){
    if(!this.sc||this.sc.over)return;
    this.sc.phase="playing";
    this.sc.playStartedAt=now();
    this._scheduleSoccerEnd();
  }

  _scheduleSoccerEnd(){
    if(!this.sc||this.sc.over)return;
    if(this.sc.timer){try{clearTimeout(this.sc.timer);}catch(_){ }}
    const left=this._soccerRemainingMs();
    if(left<=0){
      const w=(this.sc.score.A>this.sc.score.B)?"A":(this.sc.score.B>this.sc.score.A)?"B":"draw";
      this._finishSoccer(w);return;
    }
    this.sc.timer=setTimeout(()=>{
      try{
        if(this.meta.mode!=="soccer"||this.meta.phase!=="playing"||this.sc.over||this.sc.phase!=="playing")return;
        this._pauseSoccerClock();
        const w=(this.sc.score.A>this.sc.score.B)?"A":(this.sc.score.B>this.sc.score.A)?"B":"draw";
        this._finishSoccer(w);
      }catch(_){ }
    },left+100);
  }

  _soccerHashText(t){
    let h=2166136261;
    for(const ch of String(t||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return h>>>0;
  }

  _soccerSeededRand(seed){
    let x=(seed|0)||123456789;
    return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%1000000)/1000000;};
  }

  _soccerMathAnswer(seed,uid,index){
    index=Math.max(0,Math.floor(Number(index)||0));
    const lane=((Number(seed||1)>>>3)+index)&3;
    const rnd=this._soccerSeededRand((Number(seed||1)^this._soccerHashText(uid)^Math.imul(index+1,2654435761))>>>0);
    const digit=(min,max)=>min+Math.floor(rnd()*(max-min+1));
    let a,b,answer;
    if(lane===0){
      const a1=digit(0,8),b1=digit(0,9-a1),at=digit(1,7),bt=digit(1,Math.max(1,8-at));
      a=at*10+a1;b=bt*10+b1;answer=a+b;
    }else if(lane===1){
      const bt=digit(1,7),at=digit(bt,9),b1=digit(0,9),a1=digit(b1,9);
      a=at*10+a1;b=bt*10+b1;if(b>a){const t=a;a=b;b=t;}answer=a-b;
    }else if(lane===2){
      let guard=0;
      do{const a1=digit(1,9),b1=digit(Math.max(1,10-a1),9),at=digit(1,7),bt=digit(1,8-at);a=at*10+a1;b=bt*10+b1;answer=a+b;}while(answer>100&&++guard<30);
    }else{
      const at=digit(2,9),bt=digit(1,at-1),a1=digit(0,8),b1=digit(a1+1,9);
      a=at*10+a1;b=bt*10+b1;answer=a-b;
    }
    return Number(answer);
  }

  _soccerRoundScores(){
    let scoreA=0,scoreB=0;
    const submissions=this.sc?.round?.submissions||{};
    for(const [sid,sub] of Object.entries(submissions)){
      const n=Math.max(0,Number(sub?.score||0));
      const team=String(sub?.team||this.sc?.players?.[sid]?.team||"");
      if(team==="A")scoreA+=n;else if(team==="B")scoreB+=n;
    }
    return {scoreA,scoreB};
  }

  _broadcastSoccerRoundProgress(){
    if(!this.sc?.round)return;
    const {scoreA,scoreB}=this._soccerRoundScores();
    this._broadcast("sc_round_progress",{roundId:this.sc.round.id,scoreA,scoreB});
  }

  _soccerStatePayload(){
    const sc=this.sc||{};
    const r=sc.round||{};
    const scores=this._soccerRoundScores();
    return {
      phase:String(sc.phase||"idle"),
      roundId:String(r.id||""), kind:String(r.kind||"initial"), seed:Number(r.seed||1),
      beginsAt:Number(r.beginsAt||0), endsAt:Number(r.endsAt||0),
      resultUntil:Number(r.resultUntil||0), kickoffAt:Number(r.kickoffAt||0),
      winner:String(r.winner||""), tied:!!r.tied,
      // During QUIZ expose the live server aggregate. finalScoreA/B are initialized
      // to 0, so nullish-coalescing them would incorrectly report 0 on reconnect.
      roundScoreA:Number(sc.phase==="quiz" ? scores.scoreA : (r.finalScoreA ?? scores.scoreA)),
      roundScoreB:Number(sc.phase==="quiz" ? scores.scoreB : (r.finalScoreB ?? scores.scoreB)),
      scoreA:Number(sc.score?.A||0), scoreB:Number(sc.score?.B||0),
      kickoffOwnerSid:String(sc.kickoffOwnerSid||""),
      remainingMs:this._soccerRemainingMs(),
      serverNow:now(), roundSerial:Number(sc.roundSerial||0)
    };
  }

  _broadcastSoccerState(){ this._broadcast("sc_round_state",this._soccerStatePayload()); }

  _sendSoccerState(ws){
    this._send(ws,"sc_roster",{players:this._buildSoccerRoster()});
    if(this.sc?.ball)this._send(ws,"sc_ball",this.sc.ball);
    this._send(ws,"sc_score_sync",{scoreA:Number(this.sc?.score?.A||0),scoreB:Number(this.sc?.score?.B||0)});
    const state=this._soccerStatePayload();
    // A reconnecting/reloaded player must resume their own cumulative quiz score.
    // Otherwise the client restarts at 0 while the server keeps (for example) 5,
    // and the next five correct answers merely catch back up instead of adding points.
    try{
      const uid=this.sockets.get(ws);
      if(uid&&this.sc?.round){
        state.selfRoundScore=Math.max(0,Number(this.sc.round.submissions?.[uid]?.score||0));
      }
    }catch(_){ }
    this._send(ws,"sc_round_state",state);
  }

  _clearSoccerTransitionTimer(){
    if(this.sc?.transitionTimer){try{clearTimeout(this.sc.transitionTimer);}catch(_){ }this.sc.transitionTimer=null;}
  }

  _startSoccerRound(kind="initial"){
    if(!this.sc||this.sc.over)return;
    this._pauseSoccerClock();
    this._clearSoccerTransitionTimer();
    const isRestart=kind==="restart";
    const beginsAt=now()+800;
    const endsAt=beginsAt+(isRestart?5000:10000);
    const id=`${isRestart?"r":"i"}-${++this.sc.roundSerial}-${now()}`;
    this.sc.phase="quiz";
    this.sc.kickoffOwnerSid="";
    this.sc.round={id,kind:isRestart?"restart":"initial",seed:Math.floor(Math.random()*2147483647)||1,beginsAt,endsAt,submissions:{},winner:"",tied:false,finalScoreA:0,finalScoreB:0,resultUntil:0,kickoffAt:0};
    this.sc.ball=null;
    this._broadcastSoccerState();
    // Accept packets only through endsAt+350ms, then leave a small server-only settle
    // window so a packet at the edge cannot race the round-finalization callback.
    this.sc.transitionTimer=setTimeout(()=>{try{this._finishSoccerRound(id);}catch(_){ }},Math.max(0,endsAt-now())+450);
  }

  _finishSoccerRound(roundId){
    const r=this.sc?.round;
    if(!r||this.sc.over||this.sc.phase!=="quiz"||String(r.id)!==String(roundId))return;
    this._clearSoccerTransitionTimer();
    const {scoreA,scoreB}=this._soccerRoundScores();
    const tied=scoreA===scoreB;
    const winner=tied?(Math.random()<.5?"A":"B"):(scoreA>scoreB?"A":"B");
    const winnerPlayers=Object.entries(this.sc.players||{})
      .filter(([,p])=>p.team===winner)
      .sort((a,b)=>Number(a[1].seat)-Number(b[1].seat));
    // Prefer a player who is actually connected at result time. A player inside the
    // reconnect grace remains in sc.players, but assigning kickoff ownership to that
    // offline sid leaves the ball attached to nobody when PLAYING opens.
    const owner=winnerPlayers.find(([sid])=>!!this.userSockets.get(sid)) || winnerPlayers[0];
    r.winner=winner;r.tied=tied;r.finalScoreA=scoreA;r.finalScoreB=scoreB;
    r.resultUntil=now()+3000;r.kickoffAt=r.resultUntil+3000;
    this.sc.kickoffOwnerSid=owner?String(owner[0]):"";
    this.sc.phase="result";
    this._broadcastSoccerState();
    this.sc.transitionTimer=setTimeout(()=>{try{this._startSoccerCountdown(roundId);}catch(_){ }},Math.max(0,r.resultUntil-now()));
  }

  _startSoccerCountdown(roundId){
    const r=this.sc?.round;
    if(!r||this.sc.over||String(r.id)!==String(roundId))return;
    if(this._delaySoccerTransitionForKickoffOwner(roundId,"result"))return;
    this._clearSoccerTransitionTimer();
    this.sc.phase="countdown";
    this.sc.ball=null;
    this._broadcastSoccerState();
    this.sc.transitionTimer=setTimeout(()=>{try{this._startSoccerPlay(roundId);}catch(_){ }},Math.max(0,r.kickoffAt-now()));
  }

  _startSoccerPlay(roundId){
    const r=this.sc?.round;
    if(!r||this.sc.over||String(r.id)!==String(roundId))return;
    if(this._delaySoccerTransitionForKickoffOwner(roundId,"countdown"))return;
    this._clearSoccerTransitionTimer();
    this._resumeSoccerClock();
    this._broadcastSoccerState();
  }

  _scheduleSoccerPlayersBroadcast(urgent=false){
    if(!this.sc||this.meta.mode!=="soccer"||this.meta.phase!=="playing")return;
    const broadcast=()=>{
      if(!this.sc||this.meta.mode!=="soccer"||this.meta.phase!=="playing")return;
      this.sc.lastPosBroadcastAt=now();
      this._broadcast("sc_players",{players:this.sc.players});
    };
    if(urgent){
      if(this.sc.posBroadcastTimer){try{clearTimeout(this.sc.posBroadcastTimer);}catch(_){ }this.sc.posBroadcastTimer=null;}
      broadcast();
      return;
    }
    const wait=Math.max(0,33-(now()-Number(this.sc.lastPosBroadcastAt||0)));
    if(wait===0){broadcast();return;}
    if(this.sc.posBroadcastTimer)return;
    this.sc.posBroadcastTimer=setTimeout(()=>{
      if(this.sc)this.sc.posBroadcastTimer=null;
      broadcast();
    },wait);
  }

  _initSoccer(){
    try{ for(const t of this._soccerDisconnectTimers?.values?.()||[]) clearTimeout(t); }catch(_){ }
    this._soccerDisconnectTimers = new Map();
    if(this.sc.timer){try{clearTimeout(this.sc.timer);}catch(_){ }}
    if(this.sc.transitionTimer){try{clearTimeout(this.sc.transitionTimer);}catch(_){ }}
    this.sc.players={};this.sc.ball=null;this.sc.score={A:0,B:0};this.sc.over=false;
    this.sc.phase="idle";this.sc.round=null;this.sc.playedMs=0;this.sc.playStartedAt=0;
    if(this.sc.posBroadcastTimer){try{clearTimeout(this.sc.posBroadcastTimer);}catch(_){ }}
    this.sc.matchDurationMs=120000;this.sc.lastPosBroadcastAt=0;this.sc.posBroadcastTimer=null;this.sc.timer=null;this.sc.transitionTimer=null;
    this.sc.kickoffOwnerSid="";this.sc.roundSerial=0;this.sc.seenGoalIds=[];

    const cpu=this._cpuUid();
    const variants={A:[0,1,2,3,4,5],B:[0,1,2,3,4,5]};
    for(const team of ["A","B"]){
      const arr=variants[team];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
    }
    const ti={A:0,B:0};
    for(const [uid,u] of this.users.entries()){
      if(uid===cpu)continue;const seat=Number(u?.seat??-1);if(seat<0)continue;
      const team=(seat%2===0)?"A":"B";
      this.sc.players[uid]={x:0,y:0,dir:0,vx:0,vy:0,nick:safeNick(u?.nick),seat,team,characterVariant:variants[team][ti[team]++%6],kickAt:0,kickCharge:0,tackle:false};
    }
    this._broadcast("sc_roster",{players:this._buildSoccerRoster()});
    this._startSoccerRound("initial");
  }

  _finishSoccer(winner){
    if(!this.sc||this.sc.over||this.meta.mode!=="soccer")return;
    this.sc.over=true;this.sc.phase="over";
    if(this.sc.timer){try{clearTimeout(this.sc.timer);}catch(_){ }this.sc.timer=null;}
    this._clearSoccerTransitionTimer();
    const sA=Number(this.sc.score.A||0),sB=Number(this.sc.score.B||0);
    const winnerNick=winner==="A"?"A팀":winner==="B"?"B팀":"무승부";
    let winnerSid="";
    for(const [sid,p] of Object.entries(this.sc.players||{})){if(!winnerSid)winnerSid=sid;if(winner!=="draw"&&p.team===winner){winnerSid=sid;break;}}
    this._broadcast("sc_round_state",this._soccerStatePayload());
    this._broadcast("sc_end",{scoreA:sA,scoreB:sB,winner,winnerNick});
    this._broadcast("result",{mode:"soccer",done:true,winnerSid,winnerNick,scoreA:sA,scoreB:sB,winner});
    this._endAndBackToLobby(2600);
  }

  // -------- SnakeTail helpers --------
  _scheduleStBroadcast(){
    if (this.st._timer) return;
    this.st._timer = setTimeout(()=>{
      this.st._timer = null;
      this._broadcast("st_players", { players: this.st.players });
      // Also push scores snapshot occasionally (cheap)
      this._broadcast("st_scores", { scores: this.st.scores || {} });
      try{ this._maybeEndSnakeTail(); }catch(_){ }
    }, 110);
  }
  _foodTypeFromValue(v){
    const TYPES = [
      { kind: 1, value: 1 },
      { kind: 2, value: 2 },
      { kind: 3, value: 4 },
      { kind: 4, value: 7 },
      { kind: 5, value: 12 },
    ];
    const val = Number(v||0) || 0;
    if (!val) return TYPES[1];
    let best = TYPES[1];
    let bestd = 1e9;
    for (const t of TYPES){
      const d = Math.abs((Number(t.value)||0) - val);
      if (d < bestd){ bestd = d; best = t; }
    }
    return best;
  }

  _randFood(id){
    // Snake.io-style 5-tier foods (tiny -> huge)
    const TYPES = [
      { kind: 1, value: 1, w: 45 },
      { kind: 2, value: 2, w: 28 },
      { kind: 3, value: 4, w: 16 },
      { kind: 4, value: 7, w: 8 },
      { kind: 5, value: 12, w: 3 },
    ];

    let r = Math.random() * TYPES.reduce((a,t)=>a+t.w, 0);
    let pick = TYPES[0];
    for (const t of TYPES){
      r -= t.w;
      if (r <= 0){ pick = t; break; }
    }

    // World coordinates are client-defined; keep a sane default arena.
    const W = 1600, H = 900;
    const x = 80 + Math.random() * (W - 160);
    const y = 80 + Math.random() * (H - 160);

    return {
      id: id || crypto.randomUUID(),
      x,
      y,
      kind: pick.kind,
      value: pick.value,
    };
  }

  _spawnInitialSnakeTailFoods(count=90){
    this.st.foods = [];
    for (let i=0; i<count; i++) this.st.foods.push(this._randFood());
    this._broadcast("st_foods", { foods: this.st.foods });
  }

  _maybeEndSnakeTail(){
    if (this.meta.phase !== "playing") return;
    if (this.meta.mode !== "snaketail") return;
    const entries = Object.entries(this.st.scores || {});
    if (!entries.length) return;
    let alive = entries.filter(([,s])=> s && s.alive);
    // If only one alive and at least 2 participants, finish early.
    const humans = Array.from(this.users.keys()).filter(u => u !== this._cpuUid());
    if (humans.length >= 2 && alive.length === 1){
      const [winnerSid] = alive[0];
      this._endSnakeTail("last_alive", winnerSid);
    }
  }

  _endSnakeTail(reason="timeout", forceWinnerSid=""){
    if (this.meta.phase !== "playing") return;
    if (this.meta.mode !== "snaketail") return;

    // pick winner: forceWinnerSid > last alive > highest mass
    const scores = this.st.scores || {};
    let winnerSid = forceWinnerSid || "";
    if (!winnerSid){
      const alive = Object.entries(scores).filter(([,s])=> s && s.alive);
      if (alive.length === 1) winnerSid = alive[0][0];
    }
    if (!winnerSid){
      let best = null;
      for (const [sid, s] of Object.entries(scores)){
        const mass = Number(s?.mass || 0) || 0;
        if (!best || mass > best.mass){ best = { sid, mass }; }
      }
      winnerSid = best?.sid || "";
    }

    const winnerNick = (winnerSid && this.users.get(winnerSid)?.nick) || (scores[winnerSid]?.nick) || "";

    // Broadcast a generic result payload so the room UI overlay can show.
    this._broadcast("result", {
      mode: "snaketail",
      done: true,
      winnerSid,
      winnerNick,
      reason,
      scores
    });

    // Return to room lobby shortly after.
    this._endAndBackToLobby(2600);
  }

  _startTournament(){
    const entries = Array.from(this.users.entries()).sort((a,b)=> (a[1].seat??99)-(b[1].seat??99));
    const players = entries.map(([uid])=>uid).slice(0, 4);
    if (players.length < 2) return;

    const rounds = buildRounds(players);
    const winners = rounds.map(r => r.map(()=>null));
    this.tour = {
      gameId: this.meta.mode,
      players,
      rounds,
      winners,
      nPlayers: players.length,
      current: null
    };
    this._startNextMatch();
  }

  _startNextMatch(){
    if (!this.tour) return;
    const { rounds, winners, nPlayers } = this.tour;

    for (let r=0; r<rounds.length; r++){
      for (let m=0; m<rounds[r].length; m++){
        if (winners[r][m]) continue;

        let a = rounds[r][m][0];
        let b = rounds[r][m][1];

        if (a === null || b === null){
          // fill from previous round winners
          const prev = winners[r-1] || [];
          if (a === null) a = prev[m*2] || prev[0] || null;
          if (b === null) b = prev[m*2+1] || prev[1] || null;
        }

        if (!a || !b) return; // cannot start yet

        const ua = this.users.get(a);
        const ub = this.users.get(b);

        const payload = {
          gameId: this.tour.gameId,
          roundLabel: roundLabelFor(nPlayers, r, m),
          aSid: a,
          bSid: b,
          aNick: ua?.nick || "A",
          bNick: ub?.nick || "B",
          spectators: this.tour.players.filter(x => x !== a && x !== b)
        };

        this.tour.current = { roundIdx:r, matchIdx:m, a, b };
        this._broadcast("match", payload);
        return;
      }
    }
  }

  _onDuelOver(loserUid){
    if (this.meta.phase !== "playing" || !this.tour || !this.tour.current) return;
    const cur = this.tour.current;
    if (loserUid !== cur.a && loserUid !== cur.b) return;
    const winner = (loserUid === cur.a) ? cur.b : cur.a;
    if (!winner) return;
    this._finishCurrentMatch(winner, loserUid);
  }

  _finishCurrentMatch(winnerUid, loserUid){
    if (!this.tour || !this.tour.current) return;
    const cur = this.tour.current;
    const { roundIdx, matchIdx } = cur;

    // ignore if already decided
    if (this.tour.winners[roundIdx][matchIdx]) return;

    this.tour.winners[roundIdx][matchIdx] = winnerUid;

    const winnerNick = this.users.get(winnerUid)?.nick || "승자";
    const loserNick = this.users.get(loserUid)?.nick || "패자";

    const done = (roundIdx === this.tour.rounds.length - 1);
    const finalDone = done; // last round has only 1 match in our templates
    this._broadcast("result", {
      mode: "duel",
      winnerSid: winnerUid,
      winnerNick,
      loserSid: loserUid,
      loserNick,
      done: finalDone
    });

    // Next step
    if (finalDone){
      this._endAndBackToLobby(2500);
    } else {
      setTimeout(()=> this._startNextMatch(), 1200);
    }
  }

  // -------------------- DrawAnswer (그림맞추기) server logic --------------------

  _daHangulOnly(s){
    const t = String(s || '').trim();
    if (!t) return false;
    return /^[가-힣\s]+$/.test(t);
  }

  _daBuildOrder(){
    const cpu = this._cpuUid();
    return Array.from(this.users.entries())
      .filter(([uid]) => uid !== cpu)
      .sort((a,b) => (Number(a[1]?.seat ?? 99) - Number(b[1]?.seat ?? 99)))
      .map(([uid]) => uid);
  }

  _daClearTimer(){
    if (this.da && this.da.timer){
      try{ clearTimeout(this.da.timer); }catch(_){ }
      this.da.timer = null;
    }
  }

  _daReset(){
    try{ this._daClearTimer(); }catch(_){ }
    try{
      this.da.active = false;
      this.da.round = 0;
      this.da.maxRounds = 5;
      this.da.order = [];
      this.da.drawerIdx = 0;
      this.da.drawerUid = '';
      this.da.word = '';
      this.da.endAt = 0;
      this.da.ops = [];
      this.da.scores = {};
      this.da.used = [];
      this.da._roundToken = 0;
    }catch(_){ }
  }

  _daBroadcastState(announce){
    const drawerNick = this.users.get(this.da.drawerUid)?.nick || '';
    for (const [ws, uid] of this.sockets.entries()){
      if (!uid) continue;
      const youAreDrawer = (uid === this.da.drawerUid);
      this._send(ws, 'da_state', {
        round: this.da.round,
        maxRounds: this.da.maxRounds,
        drawerUid: this.da.drawerUid,
        drawerNick,
        endAt: this.da.endAt,
        youAreDrawer,
        announce: announce || ''
      });
    }
  }

  _sendDaSync(ws, uid){
    if (!this.da || !this.da.active) return;
    const drawerNick = this.users.get(this.da.drawerUid)?.nick || '';
    const youAreDrawer = (uid === this.da.drawerUid);
    this._send(ws, 'da_state', {
      round: this.da.round,
      maxRounds: this.da.maxRounds,
      drawerUid: this.da.drawerUid,
      drawerNick,
      endAt: this.da.endAt,
      youAreDrawer
    });
    this._send(ws, 'da_replay', { ops: Array.isArray(this.da.ops) ? this.da.ops : [] });
    if (youAreDrawer){
      this._send(ws, 'da_word', { word: this.da.word || '' });
    }
  }

  _daPickUniqueWord(){
    // Avoid repeats within this session when possible.
    const used = Array.isArray(this.da.used) ? this.da.used : [];
    const maxTry = 40;
    for (let i=0; i<maxTry; i++){
      const w = daPickWord();
      if (!used.includes(w)) return w;
    }
    return daPickWord();
  }

  _daStartGame(){
    if (this.meta.mode !== 'drawanswer' || this.meta.phase !== 'playing') return;
    this._daReset();
    this.da.active = true;
    this.da.maxRounds = 5;
    this.da.order = this._daBuildOrder();
    // "게임 참여" 인원(방에 남아있어도 게임 화면에서 나가면 제외)
    this.da.inGame = {};
    for (const uid of this.da.order){ this.da.inGame[uid] = true; }
    this.da.drawerIdx = 0;
    this.da.scores = {};
    this.da.used = [];
    for (const uid of this.da.order){
      const nick = this.users.get(uid)?.nick || 'Player';
      this.da.scores[uid] = { score:0, streak:0, nick };
    }
    this._broadcast('da_chat', { system:true, nick:'', text:'게임 시작! 그림은 스트로크만 전송(서버 부담 최소)', ts: now() });
    this._daNextRound('start');
  }

  _daNextRound(reason){
    if (!this.da || !this.da.active) return;
    if (!Array.isArray(this.da.order) || this.da.order.length === 0){
      this._daEndGame('empty');
      return;
    }
    if (this.da.round >= (this.da.maxRounds || 5)){
      this._daEndGame('rounds');
      return;
    }

    // rotate drawer
    this.da.drawerIdx = (Number(this.da.drawerIdx)||0) % this.da.order.length;
    this.da.drawerUid = this.da.order[this.da.drawerIdx] || this.da.order[0];

    // new word & timer
    const word = this._daPickUniqueWord();
    this.da.word = word;
    if (Array.isArray(this.da.used)) this.da.used.push(word);
    this.da.ops = [];

    // Clear the shared canvas when a new round starts (so the next drawer begins fresh).
    try{ this._broadcast('da_clear', {}); }catch(_){ }

    this.da.round = (Number(this.da.round)||0) + 1;
    this.da.endAt = now() + 120000;

    // Reset streaks for non-drawer is NOT desired; streak depends on correct answers only.
    // (We reset non-winners streak on each round change after a correct/timeout in handlers.)

    // timer token
    const token = (Number(this.da._roundToken)||0) + 1;
    this.da._roundToken = token;
    this._daClearTimer();
    this.da.timer = setTimeout(()=>{
      try{ this._daOnTimeout(token); }catch(_){ }
    }, 120000 + 120);

    const drawerNick = this.users.get(this.da.drawerUid)?.nick || '';
    const announce = reason === 'start'
      ? `라운드 ${this.da.round} 시작! (${drawerNick} 차례)`
      : `다음 라운드! (${drawerNick} 차례)`;

    this._daBroadcastState(announce);

    // send secret word only to drawer
    const drawerWs = this.userSockets.get(this.da.drawerUid);
    if (drawerWs){
      this._send(drawerWs, 'da_word', { word });
    }
  }

  _daOnTimeout(token){
    if (!this.da || !this.da.active) return;
    if (Number(this.da._roundToken) !== Number(token)) return;
    const ans = this.da.word || '';
    this._broadcast('da_chat', { system:true, text:`시간초과! 정답: ${ans}`, ts: now() });

    // Everyone who didn't answer correctly this round loses streak.
    for (const uid of Object.keys(this.da.scores || {})){
      const s = this.da.scores[uid];
      if (s) s.streak = 0;
    }

    // advance drawer
    this.da.drawerIdx = (this.da.drawerIdx + 1) % this.da.order.length;
    this._daNextRound('timeout');
  }

  _daHandleGuess(uid, nick, text){
    if (!this.da || !this.da.active) return;
    if (uid === this.da.drawerUid) return;

    const guessRaw = String(text || '').slice(0, 30);
    if (!this._daHangulOnly(guessRaw)) return;

    const guess = daNormalizeAnswer(guessRaw);
    const answer = daNormalizeAnswer(this.da.word || '');
    if (!guess || !answer) return;

    if (guess === answer){
      // score
      if (!this.da.scores[uid]) this.da.scores[uid] = { score:0, streak:0, nick: nick || 'Player' };
      const rec = this.da.scores[uid];
      rec.score = (Number(rec.score)||0) + 1;
      rec.streak = (Number(rec.streak)||0) + 1;
      rec.nick = nick || rec.nick || 'Player';

      // others streak reset (they failed this round)
      for (const [k, v] of Object.entries(this.da.scores || {})){
        if (!v) continue;
        if (k !== uid) v.streak = 0;
      }

      const ans = this.da.word || '';
      this._broadcast('da_chat', { system:true, correct:true, nick, text:`정답! (${ans})`, ts: now() });

      // win condition: 2-streak
      if (rec.streak >= 2){
        this._daEndGame('streak', uid);
        return;
      }

      // next drawer + round
      this.da.drawerIdx = (this.da.drawerIdx + 1) % this.da.order.length;
      this._daNextRound('correct');
    }
  }

  _daPickWinnerUid(){
    const entries = Object.entries(this.da.scores || {});
    if (!entries.length) return '';
    // sort by score desc, then seat asc
    entries.sort((a,b)=>{
      const sa = Number(a[1]?.score||0);
      const sb = Number(b[1]?.score||0);
      if (sb != sa) return sb - sa;
      const sea = Number(this.users.get(a[0])?.seat ?? 99);
      const seb = Number(this.users.get(b[0])?.seat ?? 99);
      return sea - seb;
    });
    return entries[0][0] || '';
  }

  _daEndGame(reason, winnerUid){
    if (!this.da || !this.da.active) return;
    this.da.active = false;
    this._daClearTimer();

    const winUid = winnerUid || this._daPickWinnerUid();
    const winNick = this.users.get(winUid)?.nick || (this.da.scores?.[winUid]?.nick) || '승자';

    this._broadcast('da_over', { winnerUid: winUid, winnerNick: winNick, reason: String(reason||'') });
    this._broadcast('result', { mode:'drawanswer', done:true, winnerNick: winNick, reason: String(reason||'') });

    // return to lobby after a moment
    this._endAndBackToLobby(2500);
  }

  _daOnLeave(uid){
    if (!this.da || !this.da.active) return;
    // remove from order
    const idx = (this.da.order || []).indexOf(uid);
    if (idx >= 0){
      this.da.order.splice(idx, 1);
      // adjust drawerIdx if needed
      if (idx < this.da.drawerIdx) this.da.drawerIdx = Math.max(0, this.da.drawerIdx - 1);
      if (this.da.drawerIdx >= this.da.order.length) this.da.drawerIdx = 0;
    }
    // remove score record
    try{ if (this.da.scores && this.da.scores[uid]) delete this.da.scores[uid]; }catch(_){ }

    const remainCount = (this.da.order || []).length;
    if (remainCount === 0){
      this._daEndGame('empty');
      return;
    }
    // If only one player remains, end immediately (auto-exit for the last player)
    if (remainCount === 1){
      const last = (this.da.order || [])[0];
      this._broadcast('da_chat', { system:true, text:'혼자 남아서 게임이 종료됩니다.', ts: now() });
      this._daEndGame('alone', last);
      return;
    }


    if (uid === this.da.drawerUid){
      this._broadcast('da_chat', { system:true, text:'그리는 사람이 나갔어요. 다음 라운드로 넘어갑니다.', ts: now() });
      // move to next drawer (current index already points to next after removal)
      this._daNextRound('leave');
    }
  }


  _endAndBackToLobby(delayMs){
    // Several clients may report the same shared game end nearly simultaneously.
    // Schedule exactly one reset/backToRoom broadcast for the room.
    if (this._backToLobbyTimer) return;
    const d = Number(delayMs || 0);
    this._backToLobbyTimer = setTimeout(()=>{
      this._backToLobbyTimer = null;
      this.meta.phase = "lobby";
      this.meta.status = "waiting";
      this.tour = null;


      // Clear transient per-game snapshots so leaving the room leaves no server-side residue
      try{ this.tg.players = {}; this.tg.floors = {}; }catch(_){ }
      if (this.tg && this.tg.timer){ try{ clearTimeout(this.tg.timer); }catch(_){ } this.tg.timer = null; }
      this.pb = { state:null };
      try{ this.st.players = {}; this.st.foods = []; this.st.scores = {}; this.st.startedAt = 0; }catch(_){ }
      if (this.st && this.st.timer){ try{ clearTimeout(this.st.timer); }catch(_){ } this.st.timer = null; }
      if (this.st && this.st._timer){ try{ clearTimeout(this.st._timer); }catch(_){ } this.st._timer = null; }

      if (this.sc?.transitionTimer){ try{ clearTimeout(this.sc.transitionTimer); }catch(_){ } }
      try{ this.sc.players = {}; this.sc.ball = null; this.sc.score = { A:0, B:0 }; this.sc.over = false; this.sc.phase = "idle"; this.sc.round = null; this.sc.playedMs = 0; this.sc.playStartedAt = 0; this.sc.kickoffOwnerSid = ""; }catch(_){ }
      if (this.sc && this.sc.timer){ try{ clearTimeout(this.sc.timer); }catch(_){ } this.sc.timer = null; }

      // Clear authoritative start payloads / transient coop caches when returning to lobby.
      try{ if (this.sk) this.sk.startPayload = null; }catch(_){ }
      try{ if (this.mx){ this.mx.startPayload = null; this.mx.latestStates = {}; this.mx.latestWorld = null; this.mx.latestPhase = null; this.mx.latestEvent = null; this.mx.lastActiveAt = 0; } }catch(_){ }
      try{ if (this.br){ this.br.startPayload = null; this.br.latestStates = {}; this.br.latestWorld = null; this.br.latestChat = []; this.br.ending = false; } }catch(_){ }

      try{ this.da && this._daReset(); }catch(_){ }
      try{ this._relayLimiter = new Map(); }catch(_){ }

      // stop CPU + remove CPU user when returning to lobby
      this._stopCpu();
      this._removeCpuUser();

      // reset ready
      for (const u of this.users.values()){
        u.ready = false;
      }

      // update attachments
      for (const [ws, uid] of this.sockets.entries()){
        if (!uid) continue;
        const u = this.users.get(uid);
        if (!u) continue;
        wsSetAttachment(ws, { uid, nick: u.nick, ready: !!u.ready, seat: u.seat });
      }

      this._scheduleLobbyUpdate();
      this._broadcast("backToRoom", { resetReady:true });
      this._broadcast("room_state", this._snapshot());
    }, d);
  }

  async fetch(request){
    const url = new URL(request.url);
    const path = url.pathname;
    const upgrade = request.headers.get("Upgrade") || "";

    // path must be /ws/room/:roomId
    const m = path.match(/^\/ws\/room\/([^/]+)$/);
    const reqRoomId = m ? decodeURIComponent(m[1]) : "";

    if (reqRoomId && !this.meta.roomId){
      this.meta.roomId = reqRoomId;
    }

    this._rehydrateSocketsFromState();

    if (upgrade.toLowerCase() === "websocket" && m){
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();

      // store path hint for this socket for hello_room
      server._pathHint = path;

      this.sockets.set(server, "");
      wsSetAttachment(server, { uid:"", nick:"", ready:false, seat:99 });
      this._wireSocket(server);

      return new Response(null, { status:101, webSocket: client });
    }

    return new Response("Not found", { status:404 });
  }
}
