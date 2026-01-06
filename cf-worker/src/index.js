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

    this.rooms = null;            // room map persisted while rooms exist
    this._saveTimer = null;
    this._wired = new WeakSet();  // sockets already wired (rehydration)
  }

  async _loadRooms(){
    if (this.rooms) return;
    const data = await this.state.storage.get("rooms");
    this.rooms = data || {};
  }

  _scheduleSaveRooms(delayMs=800){
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(async ()=>{
      this._saveTimer = null;
      try{ await this.state.storage.put("rooms", this.rooms || {}); }catch(_){}
    }, delayMs);
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

        this._send(ws, "hello_ok", { userId: wantUid, nick });
        this._send(ws, "rooms", { list: this._roomsList() });
        this._broadcast("system", { text: `${nick} 접속`, ts: now() });
        return;
      }

      // Require hello first
      if (!uid) return;

      if (t === "list_rooms"){
        this._send(ws, "rooms", { list: this._roomsList() });
        return;
      }

      if (t === "presence"){
        const users = [];
        for (const [u, n] of this.nicks.entries()){
          if (n) users.push({ userId: u, nick: n });
        }
        this._send(ws, "presence", { online: users.length, users });
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
      const maxPlayers = Math.max(2, Math.min(4, Number(opts.maxClients || opts.maxPlayers || 4) || 4));
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
  // In this template: "togester" is co-op; others are duel.
  return String(mode || "") !== "togester";
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
    this.tg = { players:{}, lastBroadcast:0, timer:null }; // coop state aggregation

    this._wired = new WeakSet();
    this._lobbyUpdateTimer = null;
    this._relayLimiter = new Map(); // uid -> {duelTs, tgTs}
  }

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
    if (this.users.size < 2) return false;
    for (const u of this.users.values()){
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

        // capacity check
        if (this.users.size >= (this.meta.maxPlayers || 4)){
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

        this._recalcHost();
        this._applyHostFlags();

        wsSetAttachment(ws, { uid: wantUid, nick, ready: !!this.users.get(wantUid).ready, seat: this.users.get(wantUid).seat });

        this._send(ws, "hello_ok", { userId: wantUid });
        this._broadcast("system", { text: `${nick} 입장`, ts: now() });

        this.meta.status = (this.meta.phase === "playing") ? "playing" : "waiting";
        this._scheduleLobbyUpdate();
        this._broadcast("room_state", this._snapshot());
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
        u.ready = !!d.v;
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
        if (!this._allReady()){
          this._send(ws, "system", { text:"모두 레디해야 시작됩니다.", ts: now() });
          return;
        }

        // Clear transient states
        this.tour = null;
        this.tg.players = {};
        if (this.tg.timer){ try{ clearTimeout(this.tg.timer); }catch(_){}
          this.tg.timer = null;
        }

        this.meta.phase = "playing";
        this.meta.status = "playing";
        this._scheduleLobbyUpdate();
        this._broadcast("started", { mode: this.meta.mode });

        // Duel tournament is server-authoritative.
        if (isDuelMode(this.meta.mode)){
          this._startTournament();
        }

        this._broadcast("room_state", this._snapshot());
        return;
      }

      // ----- Coop aggregation (togester) -----
      if (t === "tg_state"){
        // rate-limit client spam (client already throttles)
        const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0 };
        const n = now();
        if (n - lim.tgTs < 80) return;
        lim.tgTs = n;
        this._relayLimiter.set(uid, lim);

        // store per-player state, broadcast aggregated snapshot at ~8fps
        this.tg.players[uid] = d.state || {};
        this._scheduleTgBroadcast();
        return;
      }

      if (t === "tg_button"){
        this._broadcast("tg_button", { idx: d.idx, pressed: !!d.pressed });
        return;
      }
      if (t === "tg_buttons"){
        this._broadcast("tg_buttons", { buttons: d.buttons || {} });
        return;
      }
      if (t === "tg_level"){
        this._broadcast("tg_level", { level: d.level });
        return;
      }
      if (t === "tg_reset"){
        this._broadcast("tg_reset", { t: d.t || now() });
        return;
      }
      if (t === "tg_over"){
        if (this.meta.phase !== "playing") return;
        const success = !!d.success;
        this._broadcast("result", { mode:"togester", done:true, success, reason: d.reason || "" });
        this._endAndBackToLobby(2500);
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

      // remove user + seat
      const u = this.users.get(uid);
      this.users.delete(uid);
      this.userSockets.delete(uid);

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

      if (this.users.size === 0){
        // No persistence: delete room immediately from lobby.
        this._deleteFromLobby();
        return;
      }

      this.meta.status = (this.meta.phase === "playing") ? "playing" : "waiting";
      this._scheduleLobbyUpdate();
      this._broadcast("room_state", this._snapshot());
    });
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
    }, 120);
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

  _endAndBackToLobby(delayMs){
    const d = Number(delayMs || 0);
    setTimeout(()=>{
      this.meta.phase = "lobby";
      this.meta.status = "waiting";
      this.tour = null;

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
