(function(){
  function nowHHMM(){
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  }

  function safeText(x, max=200){
    return String(x ?? "").replace(/[\r\n\t]/g, " ").slice(0, max);
  }

  function setStatus(text, kind="info"){
    const el = document.querySelector("#statusBanner");
    if (!el) return;
    el.className = `status ${kind}`;
    el.textContent = text;
    el.style.display = text ? "block" : "none";
  }

  // ---- Lightweight Colyseus-compatible wrapper over Cloudflare Workers WS ----
  class LiveMap extends Map{
    constructor(){ super(); this.onAdd = null; this.onRemove = null; }
    set(key, value){
      const existed = this.has(key);
      super.set(key, value);
      if(!existed && typeof this.onAdd === "function") this.onAdd(value, key);
      return this;
    }
    delete(key){
      const existed = this.has(key);
      const val = this.get(key);
      const res = super.delete(key);
      if(existed && typeof this.onRemove === "function") this.onRemove(val, key);
      return res;
    }
    clear(){
      // trigger onRemove for all
      if(typeof this.onRemove === "function"){
        for(const [k,v] of this.entries()) this.onRemove(v,k);
      }
      super.clear();
    }
  }

  function buildRoomState(){
    const st = {
      title: "방",
      mode: "stackga",
      phase: "lobby",      // lobby | playing
      allReady: false,
      playerCount: 0,
      maxClients: 4,
      // Colyseus MapSchema-like:
      players: new LiveMap(),   // key: sessionId(userId) -> {nick,ready,isHost}
      order: new LiveMap(),     // key: sessionId -> seat number
      onChange: null
    };
    return st;
  }

  class RoomConnection{
    constructor(ws, kind, opts){
      this.ws = ws;
      this.kind = kind; // "lobby" or "room"
      this.sessionId = opts.sessionId || "";
      this.id = opts.roomId || ""; // for create() return compatibility
      this.state = buildRoomState();
      this._handlers = new Map(); // type -> [fn]
      this._helloOk = new Promise((res)=>{ this._helloResolve = res; });
      ws.onmessage = (ev)=> this._onWsMessage(ev);
      ws.onclose = ()=> {
        // no-op; pages handle UI
      };
    }
    onMessage(type, fn){
      const arr = this._handlers.get(type) || [];
      arr.push(fn);
      this._handlers.set(type, arr);
    }
    _emit(type, payload){
      const arr = this._handlers.get(type);
      if(arr){ for(const fn of arr){ try{ fn(payload); }catch(e){} } }
    }
    send(type, payload){
      // translate legacy colyseus message names to server protocol
      const msg = translateOut(this.kind, type, payload);
      if(!msg) return;
      this.ws.send(JSON.stringify(msg));
    }
    leave(){
      try{ this.ws.close(1000, "leave"); }catch(_){}
    }
    _applyStateSnapshot(snap){
      // snap: {meta, players:[...]}
      const meta = snap.meta || {};
      this.state.title = meta.title ?? this.state.title;
      this.state.mode  = meta.mode  ?? this.state.mode;
      this.state.phase = meta.phase ?? this.state.phase;
      this.state.maxClients = meta.maxClients ?? this.state.maxClients;

      const playersArr = Array.isArray(snap.players) ? snap.players : [];
      const desired = new Set(playersArr.map(p=> String(p.sessionId)));

      // remove missing
      for(const sid of Array.from(this.state.players.keys())){
        if(!desired.has(String(sid))){
          this.state.players.delete(sid);
          this.state.order.delete(sid);
        }
      }

      // add/update
      for(const p of playersArr){
        const sid = String(p.sessionId);
        const val = {
          nick: p.nick || "Player",
          ready: !!p.ready,
          isHost: !!p.isHost
        };
        // update without triggering onAdd if exists: just set (our LiveMap triggers only on new keys)
        this.state.players.set(sid, val);
        this.state.order.set(sid, Number(p.seat ?? 99));
      }

      // derived
const CPU_SID = "__cpu__";
const humans = playersArr.filter(p => String(p.sessionId) !== CPU_SID);
this.state.playerCount = humans.length;

// Host does not need to be ready; only non-host human players must be ready.
const nonHost = humans.filter(p => !p.isHost);
const isCoop = (this.state.mode === "togester");
const isDuel = !isCoop;

if (isDuel && humans.length === 1){
  // 1인 듀얼은 서버가 CPU를 붙여 시작하므로 ready 조건을 true로 봄(프론트 UX용)
  this.state.allReady = true;
} else {
  this.state.allReady = humans.length >= 2 && nonHost.length >= 1 && nonHost.every(p=> !!p.ready);
}
      if(typeof this.state.onChange === "function") {
        try{ this.state.onChange(); }catch(e){}
      }
    }
    _onWsMessage(ev){
      let msg;
      try{ msg = JSON.parse(ev.data); }catch(_){ return; }

      // handle state snapshots internally
      if(msg.t === "room_state" && this.kind === "room"){
        this._applyStateSnapshot(msg.d || {});
        return;
      }

      const translated = translateIn(this.kind, msg);
      if(!translated) return;

      if(translated.__sessionId){
        this.sessionId = translated.__sessionId;
        if (this._helloResolve) { try{ this._helloResolve(this.sessionId); }catch(_){ } this._helloResolve = null; }
        return;
      }

      this._emit(translated.type, translated.payload);
    }
  }

  function translateOut(kind, legacyType, payload){
    if(kind === "lobby"){
      if(legacyType === "chat") return { t:"lobby_chat", d:{ text: safeText(payload?.text, 300) } };
      if(legacyType === "presence") return { t:"presence", d:{} };
      return null;
    }
    if(kind === "room"){
      if(legacyType === "chat") return { t:"room_chat", d:{ text: safeText(payload?.text, 300) } };
      if(legacyType === "ready") {
        const v = (typeof payload === "boolean") ? payload : !!(payload && (payload.ready ?? payload.v));
        return { t:"ready", d:{ v } };
      } // room.js sends boolean
      if(legacyType === "start") return { t:"start", d:{} };
      // relay game messages as-is
      const passthrough = new Set([
        "duel_state","duel_event","duel_over",
        // Togester
        "tg_state","tg_players","tg_level","tg_button","tg_buttons","tg_reset","tg_push","tg_over",
        // SnakeTail
        "st_state","st_timer","st_foods","st_spawn","st_eat","st_eaten","st_players","st_scores","st_event","st_over",
        // misc
        "frame","match"
      ]);
      if(passthrough.has(legacyType)) return { t: legacyType, d: payload ?? {} };
      return { t: legacyType, d: payload ?? {} };
    }
    return null;
  }

  function translateIn(kind, msg){
    if(kind === "lobby"){
      if(msg.t === "hello_ok") return { __sessionId: msg.d?.userId || "" };
      if(msg.t === "lobby_chat") return { type:"chat", payload: msg.d };
      if(msg.t === "system") return { type:"system", payload: msg.d };
      if(msg.t === "presence") return { type:"presence", payload: msg.d };
      if(msg.t === "rooms") return { type:"rooms", payload: msg.d };
      if(msg.t === "room_created") return { type:"room_created", payload: msg.d };
      return null;
    }
    if(kind === "room"){
      if(msg.t === "hello_ok") return { __sessionId: msg.d?.userId || "" };
      // room_state handled internally
      if(msg.t === "room_chat") return { type:"chat", payload: msg.d };
      if(msg.t === "system") return { type:"system", payload: msg.d };
      if(msg.t === "started") return { type:"started", payload: msg.d };
      if(msg.t === "match") return { type:"match", payload: msg.d };
      if(msg.t === "result") return { type:"result", payload: msg.d };
      if(msg.t === "backToRoom") return { type:"backToRoom", payload: msg.d };
      // relay game events
      const passthrough = new Set([
        "duel_state","duel_event",
        // Togester
        "tg_players","tg_level","tg_button","tg_buttons","tg_reset","tg_push",
        // SnakeTail
        "st_timer","st_foods","st_spawn","st_eaten","st_players","st_scores","st_event",
        // SuhakTokki (coop)
        "sk_msg",
        // misc
        "frame"
      ]);
      if(passthrough.has(msg.t)) return { type: msg.t, payload: msg.d };
      return null;
    }
    return null;
  }

  class CFClient{
    constructor(){
      const cfgWs = (window.APP_CONFIG && window.APP_CONFIG.SERVER_ENDPOINT) || "";
      const cfgHttp = (window.APP_CONFIG && window.APP_CONFIG.SERVER_HTTP) || "";

      // Persisted override (useful for QA / different deployments)
      const savedWs = (()=>{ try{ return localStorage.getItem("server_endpoint") || ""; }catch(_){ return ""; } })();

      const host = (window.location && window.location.hostname) || "";
      const isLocal = (host === "localhost" || host === "127.0.0.1");

      // Candidate endpoints to probe (first successful WS wins)
      const candidates = [];
      const push = (x)=>{ if(!x) return; const v = String(x).replace(/\/+$/,''); if(v && !candidates.includes(v)) candidates.push(v); };

      push(cfgWs);
      push(savedWs);
      if(isLocal){
        // Colyseus default
        push("ws://localhost:2567");
        push("ws://127.0.0.1:2567");
        // Worker dev (wrangler)
        push("ws://127.0.0.1:8787");
      } else {
        // Same-origin guess (for custom reverse proxy deployments)
        try{
          const proto = (window.location && window.location.protocol === "https:") ? "wss://" : "ws://";
          push(proto + window.location.host);
        }catch(_){ }
      }

      // Default fallback (kept for backward-compat)
      if(!candidates.length) push("ws://127.0.0.1:2567");

      this._candidates = candidates;

      // Initialize to config value (may be replaced by probing)
      const wsBase = candidates[0];
      const httpBase = (cfgHttp || wsBase.replace(/^ws(s?):\/\//,"http$1://"));
      this.wsBase = wsBase;
      this.httpBase = String(httpBase).replace(/\/+$/,'');
    }

    async _openWithProbe(path){
      let lastErr = null;
      for(const base of (this._candidates || [])){
        const url = base.replace(/\/+$/,'') + path;
        try{
          const ws = new WebSocket(url);
          await waitOpen(ws);
          // Success: pin endpoint for subsequent connections + persist
          this.wsBase = base.replace(/\/+$/,'');
          this.httpBase = this.wsBase.replace(/^ws(s?):\/\//,"http$1://");
          try{ localStorage.setItem("server_endpoint", this.wsBase); }catch(_){ }
          return ws;
        }catch(e){
          lastErr = e;
          try{ /* best effort close */
            // In some browsers ws may be OPEN even if waitOpen threw; closing is safe.
            // eslint-disable-next-line no-undef
          }catch(_){ }
        }
      }
      throw (lastErr || new Error("ws error"));
    }
    async joinOrCreate(roomName, opts){
      if(roomName !== "lobby_room") throw new Error("Only lobby_room supported in CF mode");
      const ws = await this._openWithProbe("/ws/lobby");
      const conn = new RoomConnection(ws, "lobby", {});
      const nick = opts?.nick || localStorage.getItem("nick") || "Player";
      // waitOpen done in probe
      const user_id = (sessionStorage.getItem("user_id") || localStorage.getItem("user_id") || "");
      ws.send(JSON.stringify({ t:"hello", d:{ nick, user_id } }));
      await conn._helloOk;
      // request initial presence + rooms via server push; also safe to request
      ws.send(JSON.stringify({ t:"presence", d:{} }));
      ws.send(JSON.stringify({ t:"list_rooms", d:{} }));
      return conn;
    }
    async joinById(roomId, opts){
      const ws = await this._openWithProbe("/ws/room/" + encodeURIComponent(roomId));
      const conn = new RoomConnection(ws, "room", { roomId });
      const nick = opts?.nick || localStorage.getItem("nick") || "Player";
      // waitOpen done in probe

      // IMPORTANT: Room requires hello_room first; then it replies with hello_ok.
      const user_id = (sessionStorage.getItem("user_id") || localStorage.getItem("user_id") || "");
      ws.send(JSON.stringify({ t:"hello_room", d:{ nick, user_id } }));

      await conn._helloOk;
      return conn;
    }
    async create(roomName, opts){
      if(roomName !== "game_room") throw new Error("Only game_room supported in CF mode");
      const res = await fetch(this.httpBase + "/api/rooms", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify(opts || {})
      });
      if(!res.ok) throw new Error("Create room failed");
      const data = await res.json();
      return { id: data.roomId };
    }
    async getAvailableRooms(roomName){
      if(roomName !== "game_room") return [];
      const res = await fetch(this.httpBase + "/api/rooms", { method:"GET" });
      if(!res.ok) throw new Error("rooms fetch failed");
      const data = await res.json();
      // match Colyseus getAvailableRooms shape
      return (data.list || []).map(r => ({
        roomId: r.roomId,
        clients: r.players,
        maxClients: r.maxPlayers,
        metadata: { title: r.title, mode: r.mode, status: r.status }
      }));
    }
  }

  function waitOpen(ws){
    return new Promise((resolve,reject)=>{
      const to = setTimeout(()=>reject(new Error("ws timeout")), 8000);
      ws.onopen = ()=>{ clearTimeout(to); resolve(); };
      ws.onerror = (e)=>{ clearTimeout(to); reject(new Error("ws error")); };
    });
  }

  function makeClient(){
    return new CFClient();
  }

  // Build marker for debugging deployments
  window.__BUILD_ID = "2026-01-07-fix-ready-bgm";
  try{ console.log("[build]", window.__BUILD_ID); }catch(_){ }

  window.Net = { nowHHMM, makeClient, safeText, setStatus };
})();
