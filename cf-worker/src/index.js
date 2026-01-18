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

        this._send(ws, "hello_ok", { userId: wantUid, nick });
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
      const maxPlayers = Math.max(2, Math.min(8, Number(opts.maxClients || opts.maxPlayers || 4) || 4));
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
  return !(m === "togester" || m === "snaketail");
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
    this.tg = { players:{}, floors:{}, lastBroadcast:0, timer:null }; // coop state aggregation
    this.st = { players:{}, foods:[], lastBroadcast:0, timer:null, startedAt:0, durationMs:180000, scores:{} }; // snaketail state

    this._wired = new WeakSet();
    this._lobbyUpdateTimer = null;
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
    const soloCoopOk = (this.meta.mode === "suhaktokki");
    let humanCount = 0;
    for (const [uid] of this.users.entries()){
      if (uid === cpu) continue;
      humanCount++;
    }

    // Solo duel: host can start immediately (server will attach CPU)
    if (duel && humanCount === 1) return true;
    // SuhakTokki allows solo play inside a co-op room.
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

        // Disallow NEW joins while a game is running (no spectate). Allow reconnect if already in users.
        if (this.meta.phase === "playing" && !this.users.has(wantUid)) {
          this._send(ws, "system", { text:"게임중인 방입니다. 게임이 끝난 뒤 입장해 주세요.", ts: now() });
          try{ ws.close(1008, "playing"); }catch(_){}
          return;
        }

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

        // If we are in lobby, ensure no stale CPU player remains from a prior solo game
        if (this.meta.phase === "lobby"){
          this._stopCpu();
          this._removeCpuUser();
        }

        wsSetAttachment(ws, { uid: wantUid, nick, ready: !!this.users.get(wantUid).ready, seat: this.users.get(wantUid).seat });

        this._send(ws, "hello_ok", { userId: wantUid });
        this._broadcast("system", { text: `${nick} 입장`, ts: now() });

        this.meta.status = (this.meta.phase === "playing") ? "playing" : "waiting";
        this._scheduleLobbyUpdate();
        this._broadcast("room_state", this._snapshot());

        // SnakeTail: if a match is already running, sync timer/foods/snapshots to the joining client
        // (prevents missing initial food spawn due to iframe load timing).
        if (this.meta.phase === "playing" && this.meta.mode === "snaketail"){
          try{ this._send(ws, "st_timer", { startTs: this.st.startedAt || now(), durationMs: this.st.durationMs || 180000 }); }catch(_){ }
          try{ this._send(ws, "st_foods", { foods: Array.isArray(this.st.foods) ? this.st.foods : [] }); }catch(_){ }
          try{ this._send(ws, "st_players", { players: this.st.players || {} }); }catch(_){ }
          try{ this._send(ws, "st_scores", { scores: this.st.scores || {} }); }catch(_){ }
        }

        // Togester: if a match is already running, sync current players + floors to the joining client
        if (this.meta.phase === "playing" && this.meta.mode === "togester"){
          try{ this._send(ws, "tg_players", { players: this.tg.players || {} }); }catch(_){ }
          try{
            const floors = Object.values(this.tg.floors || {});
            this._send(ws, "tg_floors", { floors });
          }catch(_){ }
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
          const minHumans = (this.meta.mode === "suhaktokki" || this.meta.mode === "snaketail") ? 1 : 2;
          if (humanCount < minHumans){
            this._send(ws, "system", { text:`${minHumans}명 이상 있어야 시작할 수 있습니다.`, ts: now() });
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
        // Clear transient states (prevent stale snapshots carrying into a new match)
        this.tour = null;

        this.tg.players = {};
        this.tg.floors = {};
        if (this.tg.timer){ try{ clearTimeout(this.tg.timer); }catch(_){}
          this.tg.timer = null;
        }

        // SnakeTail transient state (clients simulate; server relays + keeps score)
        this.st.players = {};
        this.st.foods = [];
        this.st.scores = {};
        this.st.startedAt = 0;
        if (this.st.timer){ try{ clearTimeout(this.st.timer); }catch(_){ }
          this.st.timer = null;
        }

        this.meta.phase = "playing";
        this.meta.status = "playing";
        this._scheduleLobbyUpdate();
        this._broadcast("started", { mode: this.meta.mode });

        // SnakeTail: start 3-minute round timer (server is source of truth)
        if (this.meta.mode === "snaketail"){
          this.st.startedAt = now();
          this.st.durationMs = 180000;
          try{ this._spawnInitialSnakeTailFoods(80); }catch(_){ }
          this._broadcast("st_timer", { startTs: this.st.startedAt, durationMs: this.st.durationMs });

          if (this.st.timer){ try{ clearTimeout(this.st.timer); }catch(_){ } this.st.timer = null; }
          this.st.timer = setTimeout(()=>{
            try{ this._endSnakeTail("timeout"); }catch(_){ }
          }, this.st.durationMs + 200);
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
        const inner = (d && d.msg && typeof d.msg === "object") ? d.msg : {};
        // throttle high-frequency state packets
        if (String(inner.t||"") === "state"){
          const lim = this._relayLimiter.get(uid) || { duelTs:0, tgTs:0, stTs:0, skTs:0 };
          const n = now();
          if (n - (lim.skTs||0) < 70) return;
          lim.skTs = n;
          this._relayLimiter.set(uid, lim);
        }
        this._broadcast("sk_msg", { msg: inner });
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

      if (t === "tg_push"){
        if (this.meta.mode !== "togester") return;
        // Broadcast a push impulse (clients will filter by `to`)
        this._broadcast("tg_push", { to: String(d.to||""), dx: Number(d.dx)||0, dy: Number(d.dy)||0, from: uid });
        return;
      }

      if (t === "tg_floor"){
        if (this.meta.mode !== "togester") return;
        const id = String(d.id || "");
        if (!id) return;
        const owner = safeId(d.owner) || uid;
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
        this.st.players[uid] = state;

        // Keep a lightweight score snapshot on the server (mass, alive)
        const mass = Number(state.mass || state.score || 0) || 0;
        const alive = state.alive !== false;
        const nick = this.users.get(uid)?.nick || safeNick(state.nick || "");
        this.st.scores[uid] = { mass, alive, nick };

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
        this._broadcast("st_event", { event: d.event || {} });
        return;
      }

      if (t === "st_over"){
        if (this.meta.phase !== "playing") return;
        const reason = String(d.reason || "client_over");
        const winnerSid = String(d.winnerSid || "");
        this._endSnakeTail(reason, winnerSid);
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

      // Update global presence: user left this room.
      // Lobby page will later set roomId="" when the user reconnects there.
      this._presenceClear(uid, this.meta.roomId);

      // remove user + seat
      const u = this.users.get(uid);
      this.users.delete(uid);
      this.userSockets.delete(uid);

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

  _spawnInitialSnakeTailFoods(count=45){
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

  _endAndBackToLobby(delayMs){
    const d = Number(delayMs || 0);
    setTimeout(()=>{
      this.meta.phase = "lobby";
      this.meta.status = "waiting";
      this.tour = null;


      // Clear transient per-game snapshots so leaving the room leaves no server-side residue
      try{ this.tg.players = {}; this.tg.floors = {}; }catch(_){ }
      if (this.tg && this.tg.timer){ try{ clearTimeout(this.tg.timer); }catch(_){ } this.tg.timer = null; }
      try{ this.st.players = {}; this.st.foods = []; this.st.scores = {}; this.st.startedAt = 0; }catch(_){ }
      if (this.st && this.st.timer){ try{ clearTimeout(this.st.timer); }catch(_){ } this.st.timer = null; }


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
