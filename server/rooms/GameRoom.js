import { Room } from "@colyseus/core";
import { GameState, PlayerState } from "../state/GameState.js";

const CPU_SID = "__cpu__";

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


export class GameRoom extends Room {
  onCreate(options){
    this.setState(new GameState());
    // maxClients computed after mode/modeType

    this.state.title = String(options?.title || "새 방").slice(0, 30);
    this.state.mode  = String(options?.mode || "stackga").slice(0, 20);
    // "duel" games are 1v1 games. If 3~4 players are in the room, we run a small tournament.
    // "coop" games are real-time cooperative games.
    const inferred = ["stackga","suika"].includes(this.state.mode) ? "duel" : "coop";
    this.state.modeType = String(options?.modeType || inferred).slice(0, 10);

// maxClients: duel games are capped at 4; snaketail supports up to 8; others default to 4
const requestedMax = parseInt(options?.maxClients || "4", 10) || 4;
const cap = (this.state.mode === "snaketail") ? 8 : 4;
this.maxClients = clamp(requestedMax, 2, (this.state.modeType === "duel" ? 4 : cap));

    // Metadata used by getAvailableRooms()
    this.setMetadata({
      title: this.state.title,
      mode: this.state.mode,
      modeType: this.state.modeType,
      status: "waiting",
      hostNick: String(options?.hostNick || "-").slice(0,20),
      maxClients: this.maxClients,
    });

    // lockstep frame broadcasting
    this.tick = 0;
    this.tickRate = 20; // 서버 틱: 20Hz (무료/대역폭 친화)
    this.inputs = new Map(); // sessionId -> latest mask
    this.started = false;

    // stackga tournament state
    this.tour = null; // { type, stage, players, bye, w1, w2, active:{a,b}, seeds:{a,b} }

    // ---- Togester (co-op iframe) transient sync state (NO persistence) ----
    this.tg = {
      players: new Map(),   // sessionId -> last state snapshot
      buttons: {},          // idx -> pressed
      floors: new Map(),    // id -> {id, owner, x, y, width, height, color, t}
      level: 1,
      lastBroadcastAt: 0,
      over: false,
    };

// ---- SnakeTail (shape snake) transient sync state (no persistence) ----
this.st = {
  players: {},   // sessionId -> last snapshot
  foods: [],     // authoritative food list
  scores: {},    // sessionId -> { mass, alive, nick }
  startedAt: 0,
  durationMs: 180000,
  timer: null,
  interval: null,
};

    this.onMessage("ready", (client, { ready }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase !== "lobby") return;
      p.ready = !!ready;
      this.recomputeReady();
    });

    this.onMessage("start", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p?.isHost) return;
      if (this.state.phase !== "lobby") return;

      // Host is considered "ready" implicitly.
      // Duel games allow 1 human + CPU (1:1) when alone.
      const humanSids = Array.from(this.state.players.keys()).filter(sid => sid !== CPU_SID);
      const humanCount = humanSids.length;

      if (this.state.modeType === "duel"){
        if (humanCount < 1) return;
        // Solo start -> inject CPU seat as a pseudo player.
        if (humanCount === 1 && !this.state.players.has(CPU_SID)){
          const cpu = new PlayerState();
          cpu.nick = "CPU";
          cpu.ready = true;
          cpu.isHost = false;
          this.state.players.set(CPU_SID, cpu);

          // Reserve a seat for UI/layout. CPU does NOT consume a real client slot.
          const used = new Set(Array.from(this.state.order.values()));
          let seat = 0;
          while (used.has(seat) && seat < this.maxClients) seat++;
          this.state.order.set(CPU_SID, seat);

          // Pre-fill input so lockstep frame payload remains stable.
          this.inputs.set(CPU_SID, 0);
        }

        // recomputeReady() also updates playerCount (humans) and allReady.
        this.recomputeReady();
        if (!this.state.allReady) return;
      } else {
        // Coop requires at least 2 humans.
        if (humanCount < 2) return;
        this.recomputeReady();
        if (!this.state.allReady) return;
      }

      this.state.phase = "playing";
      this.setMetadata({ ...this.metadata, status: "playing" });
      this.broadcast("started", { tickRate: this.tickRate });

      // Reset transient co-op state (no persistence)
      if (this.state.mode === "togester"){
        try{ this.tg.players.clear(); }catch(_){ }
        try{ this.tg.floors.clear(); }catch(_){ }
        this.tg.buttons = {};
        this.tg.level = 1;
        this.tg.lastBroadcastAt = 0;
        this.tg.over = false;
        this.broadcast("tg_level", { level: this.tg.level });
        this.broadcast("tg_buttons", { buttons: this.tg.buttons });
        this.broadcast("tg_floors", { floors: [] });
      }

      // SnakeTail init (3-minute round) for coop-competitive mode
      if (this.state.mode === "snaketail"){
        this.initSnakeTail();
      }

      if (this.state.modeType === "duel"){
        this.initDuelTournament();
        // Duel games run client-side; server only relays state/events.
        return;
      }

      this.startGameLoop();});


    this.onMessage("chat", (client, { text }) => {
      // Room-local chat. No persistence. Cleared when users leave / room disposes.
      const p = this.state.players.get(client.sessionId);
      const nick = p?.nick || "Player";
      const msg = {
        nick,
        text: String(text || "").replace(/[\r\n\t]/g, " ").slice(0,200),
        time: new Date().toTimeString().slice(0,5),
      };
      this.broadcast("chat", msg);
    });

    // ---- Togester relay (Firebase 제거: Colyseus 메시지로 동기화) ----
    this.onMessage("tg_state", (client, { state }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      const prev = this.tg.players.get(client.sessionId);

      const s = state || {};
      // sanitize & clamp a bit
      const snap = {
        x: clamp(Number(s.x)||0, -2000, 20000),
        y: clamp(Number(s.y)||0, -2000, 20000),
        vx: clamp(Number(s.vx)||0, -100, 100),
        vy: clamp(Number(s.vy)||0, -100, 100),
        onGround: !!s.onGround,
        onButton: !!s.onButton,
        isDead: !!s.isDead,
        color: String(s.color || "").slice(0, 16),
        name: String(p.nick || s.name || "Player").slice(0, 16),
      };
      this.tg.players.set(client.sessionId, snap);

      // If this player just died, remove their temporary floors ("바닥" 버튼)
      if (snap.isDead && !prev?.isDead){
        try{
          const removed = [];
          for (const [fid, fl] of this.tg.floors.entries()){
            if (fl && fl.owner === client.sessionId){
              this.tg.floors.delete(fid);
              removed.push(fid);
            }
          }
          if (removed.length){
            this.broadcast("tg_floor_remove", { owner: client.sessionId, ids: removed });
          }
        }catch(_){ }
      }

      // throttle broadcast to ~20Hz total per room
      const now = Date.now();
      if (now - this.tg.lastBroadcastAt < 50) return;
      this.tg.lastBroadcastAt = now;

      const out = {};
      for (const [sid, st] of this.tg.players.entries()) out[sid] = st;
      this.broadcast("tg_players", { players: out });
    });

    this.onMessage("tg_button", (client, { idx, pressed }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      // accept from anyone (game rules handle it), but sanitize
      const i = clamp(parseInt(idx ?? 0, 10) || 0, 0, 99);
      const v = !!pressed;
      this.tg.buttons[i] = v;
      this.broadcast("tg_button", { idx: i, pressed: v });
    });

    // Player push impulse (side collision / action button): forwarded to target client
    this.onMessage("tg_push", (client, { to, dx, dy, from }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const targetSid = String(to || "");
      if (!targetSid) return;
      // Only allow pushing real players in the room
      const tp = this.state.players.get(targetSid);
      if (!tp) return;
      const ix = clamp(Number(dx) || 0, -16, 16);
      const iy = clamp(Number(dy) || 0, -16, 16);
      if (!ix && !iy) return;
      this.broadcast("tg_push", {
        to: targetSid,
        dx: ix,
        dy: iy,
        from: String(from || client.sessionId || "").slice(0, 64),
      });
    });



    // Temporary floor spawn ("바닥" 버튼)
    this.onMessage("tg_floor", (client, payload) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      const now = Date.now();
      const rawId = String(payload?.id || "");
      const gen = () => `${client.sessionId}:${now.toString(36)}${Math.random().toString(36).slice(2,6)}`;
      const id = (rawId ? rawId : gen()).slice(0, 64);

      const floor = {
        id,
        owner: client.sessionId,
        x: clamp(Number(payload?.x) || 0, -2000, 20000),
        y: clamp(Number(payload?.y) || 0, -2000, 20000),
        width: clamp(Number(payload?.width) || 80, 20, 240),
        height: clamp(Number(payload?.height) || 20, 10, 120),
        color: String(payload?.color || "#636e72").slice(0, 16),
        t: now,
      };

      // Enforce per-owner floor limit (keep latest 5)
      try{
        const owned = [];
        for (const [fid, fl] of this.tg.floors.entries()){
          if (fl?.owner === client.sessionId) owned.push(fl);
        }
        if (owned.length >= 5){
          owned.sort((a,b)=>(a.t||0)-(b.t||0));
          const removeCount = owned.length - 4;
          const removedIds = [];
          for (let i=0;i<removeCount;i++){
            const rid = owned[i].id;
            if (this.tg.floors.delete(rid)) removedIds.push(rid);
          }
          if (removedIds.length){
            this.broadcast("tg_floor_remove", { owner: client.sessionId, ids: removedIds });
          }
        }
      }catch(_){ }

      this.tg.floors.set(id, floor);
      this.broadcast("tg_floor", floor);
    });
    this.onMessage("tg_level", (client, { level }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      // Allow ANY player to advance levels, but only step-by-1 to prevent skipping.
      const lv = clamp(parseInt(level ?? (this.tg.level + 1), 10) || (this.tg.level + 1), 1, 999);
      if (lv === this.tg.level) return; // duplicate
      if (lv !== this.tg.level + 1) return; // do not allow skipping or rewinding

      this.tg.level = lv;
      try{ this.tg.floors.clear(); }catch(_){ }
      this.broadcast("tg_level", { level: lv });
      this.broadcast("tg_floors", { floors: [] });
    });

    this.onMessage("tg_reset", (client, { t }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const p = this.state.players.get(client.sessionId);
      if (!p?.isHost) return; // host-only
      // clear buttons, keep player snapshots
      this.tg.buttons = {};
      try{ this.tg.floors.clear(); }catch(_){ }
      this.broadcast("tg_reset", { t: Number(t)||Date.now() });
      this.broadcast("tg_buttons", { buttons: this.tg.buttons });
      this.broadcast("tg_floors", { floors: [] });
    });

    // Togester game over (success/fail) -> result -> backToRoom
    this.onMessage("tg_over", (client, payload) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (this.tg.over) return;
      this.tg.over = true;

      const success = !!payload?.success;
      const reason = String(payload?.reason || (success ? "clear" : "fail")).slice(0, 64);
      this.finishTogester(success, reason, client.sessionId);
    });

// ---- SnakeTail relay (co-op competitive) ----
this.onMessage("st_state", (client, { state }) => {
  if (this.state.mode !== "snaketail") return;
  if (this.state.phase !== "playing") return;
  const p = this.state.players.get(client.sessionId);
  if (!p) return;

  const s = state || {};
  const sid = client.sessionId;

  const body = Array.isArray(s.body) ? s.body.slice(0, 180).map(pt => ({
    x: clamp(Number(pt?.x) || 0, -4000, 8000),
    y: clamp(Number(pt?.y) || 0, -4000, 8000),
  })) : [];

  const snap = {
    x: clamp(Number(s.x) || 0, -4000, 8000),
    y: clamp(Number(s.y) || 0, -4000, 8000),
    dir: clamp(Number(s.dir) || 0, -1000, 1000),
    mass: clamp(Number(s.mass || 0) || 0, 0, 99999),
    alive: (s.alive !== false),
    stageIdx: clamp(parseInt(s.stageIdx ?? 0, 10) || 0, 0, 99),
    nick: String(p.nick || s.nick || "Player").slice(0, 16),
    body,
  };

  this.st.players[sid] = snap;

  const prev = this.st.scores[sid] || { mass: 0, alive: true, nick: snap.nick };
  // If server already marked dead (e.g., via kill event), keep it dead.
  const alive = (prev.alive === false) ? false : snap.alive;
  this.st.scores[sid] = { mass: snap.mass, alive, nick: snap.nick };
});

this.onMessage("st_eat", (client, { id }) => {
  if (this.state.mode !== "snaketail") return;
  if (this.state.phase !== "playing") return;
  const sid = client.sessionId;
  const foodId = String(id || "");
  if (!foodId) return;

  const idx = (this.st.foods || []).findIndex(f => String(f?.id) === foodId);
  if (idx < 0) return;

  const [food] = this.st.foods.splice(idx, 1);
  const value = clamp(Number(food?.value || 2) || 2, 1, 12);

  this.broadcast("st_eaten", { id: foodId, eaterSid: sid, value });

  const cur = this.st.scores[sid] || { mass: 0, alive: true, nick: this.state.players.get(sid)?.nick || "Player" };
  cur.mass = (Number(cur.mass) || 0) + value;
  // keep alive flag if already dead
  cur.alive = cur.alive !== false;
  this.st.scores[sid] = cur;

  // keep food count roughly constant
  const nf = this.randFood();
  this.st.foods.push(nf);
  this.broadcast("st_spawn", { foods: [nf] });
});

this.onMessage("st_spawn", (client, { foods }) => {
  if (this.state.mode !== "snaketail") return;
  if (this.state.phase !== "playing") return;
  const p = this.state.players.get(client.sessionId);
  if (!p?.isHost) return;

  const arr = Array.isArray(foods) ? foods : [];
  if (!arr.length) return;

  const out = [];
  for (const f of arr){
    if (!f || typeof f !== "object") continue;
    const id = String(f.id || `${Date.now()}-${Math.floor(Math.random()*1e9)}`);
    const x = clamp(Number(f.x) || 0, 0, 1600);
    const y = clamp(Number(f.y) || 0, 0, 900);
    const value = clamp(Number(f.value || 2) || 2, 1, 12);
    const item = { id, x, y, value };
    this.st.foods.push(item);
    out.push(item);
    if (out.length >= 80) break;
  }
  if (out.length) this.broadcast("st_spawn", { foods: out });
});

this.onMessage("st_event", (client, { event }) => {
  if (this.state.mode !== "snaketail") return;
  if (this.state.phase !== "playing") return;
  const p = this.state.players.get(client.sessionId);
  if (!p?.isHost) return;

  const ev = event || {};
  this.broadcast("st_event", { event: ev });

  // If host reports a kill, reflect it in server score so last-alive detection works.
  if (ev && ev.kind === "kill"){
    const victimSid = String(ev.victimSid || "");
    if (victimSid){
      const cur = this.st.scores[victimSid] || { mass: 0, alive: true, nick: this.state.players.get(victimSid)?.nick || "Player" };
      cur.alive = false;
      this.st.scores[victimSid] = cur;
      this.maybeAutoEndSnakeTail();
    }
  }
});

this.onMessage("st_over", (client, { reason, winnerSid }) => {
  if (this.state.mode !== "snaketail") return;
  if (this.state.phase !== "playing") return;
  const p = this.state.players.get(client.sessionId);
  if (!p?.isHost) return;
  this.finishSnakeTail(String(reason || "client_over").slice(0, 64), String(winnerSid || ""));
});



    
    // Duel relay: no persistence. Only active match players can send.
    this.onMessage("duel_state", (client, payload) => {
      if (this.state.modeType !== "duel") return;
      if (this.state.phase !== "playing") return;

      const state = payload?.state;
      const requestedSid = payload?.sid;

      // Allow the active human to proxy CPU snapshots for spectators.
      let sid = client.sessionId;
      if (requestedSid === CPU_SID) sid = CPU_SID;

      if (this.tour?.active){
        const { a, b } = this.tour.active;
        // only active match human clients can send
        if (client.sessionId !== a && client.sessionId !== b) return;
        // proxy allowed only if CPU is one of active players
        if (sid === CPU_SID && a !== CPU_SID && b !== CPU_SID) return;
      }

      // broadcast to everyone in the room (including spectators)
      this.broadcast("duel_state", { sid, state });
    });

    this.onMessage("duel_event", (client, payload) => {
      if (this.state.modeType !== "duel") return;
      if (this.state.phase !== "playing") return;

      const event = payload?.event;
      const requestedSid = payload?.sid;

      let sid = client.sessionId;
      if (requestedSid === CPU_SID) sid = CPU_SID;

      if (this.tour?.active){
        const { a, b } = this.tour.active;
        if (client.sessionId !== a && client.sessionId !== b) return;
        if (sid === CPU_SID && a !== CPU_SID && b !== CPU_SID) return;
      }

      this.broadcast("duel_event", { sid, event });
    });

    this.onMessage("input", (client, { mask }) => {
      // no per-input logging / storage
      if (this.state.phase !== "playing") return;
      const m = clamp(parseInt(mask ?? 0, 10) || 0, 0, 63);
      this.inputs.set(client.sessionId, m);
    });

    // Stackga: client notifies when they died (only active match players)
    this.onMessage("duel_over", (client, payload) => {
      if (this.state.modeType !== "duel") return;
      if (this.state.phase !== "playing") return;
      if (!this.tour?.active) return;
      const { a, b } = this.tour.active;

      // Only active match human clients can submit the result.
      if (client.sessionId !== a && client.sessionId !== b) return;

      // Allow host to proxy CPU defeat.
      const requestedLoser = payload?.loserSid;
      let loserSid = client.sessionId;
      if (requestedLoser === CPU_SID && (a === CPU_SID || b === CPU_SID)){
        loserSid = CPU_SID;
      } else if (requestedLoser === client.sessionId){
        loserSid = client.sessionId;
      }

      const winnerSid = (loserSid === a) ? b : a;

      const loser = this.state.players.get(loserSid);
      const winner = this.state.players.get(winnerSid);

      // record winners for bracket
      if (this.tour.type === 2){
        this.tour.w1 = winnerSid;
      } else if (this.tour.type === 3){
        this.tour.w1 = winnerSid;
      } else {
        if (this.tour.stage === 0) this.tour.w1 = winnerSid;
        else if (this.tour.stage === 1) this.tour.w2 = winnerSid;
        else if (this.tour.stage === 2) this.tour.w1 = winnerSid; // final winner
      }

      this.broadcast("result", {
        done: false,
        winnerSid,
        loserSid,
        winnerNick: winner?.nick || "?",
        loserNick: loser?.nick || "?"
      });

      // advance after short delay
      setTimeout(()=>{
        if (!this.tour) return;
        this.tour.stage += 1;
        // if tournament complete
        if (this.tour.type === 2){
          this.finishDuelTournament(this.tour.w1);
        } else if (this.tour.type === 3){
          if (this.tour.stage >= 2){
            this.finishDuelTournament(this.tour.w1);
          } else {
            this.startNextDuelMatch();
          }
        } else {
          if (this.tour.stage >= 3){
            this.finishDuelTournament(this.tour.w1);
          } else {
            this.startNextDuelMatch();
          }
        }
      }, 2500);
    });

  }

  onJoin(client, options){
    const nick = String(options?.nick || "Player").slice(0, 20);
    const p = new PlayerState();
    p.nick = nick;
    this.state.players.set(client.sessionId, p);

    // host: first joiner
    if (this.state.playerCount === 0){
      p.isHost = true;
      this.setMetadata({ ...this.metadata, hostNick: nick });
    }

    // playerCount/allReady are derived in recomputeReady()
    // seat order
    if (!this.state.order.has(client.sessionId)){
      const used = new Set(Array.from(this.state.order.values()));
      let seat=0;
      while (used.has(seat) && seat < this.maxClients) seat++;
      this.state.order.set(client.sessionId, seat);
    }

    this.recomputeReady();
    this.syncMetadata();
    this.broadcast("system", { nick: "SYSTEM", text: `${nick} 입장`, time: new Date().toTimeString().slice(0,5) });

    // Late-join sync for SnakeTail (spectators can still see foods/timer)
    try{
      if (this.state.mode === "snaketail" && this.state.phase === "playing" && this.st){
        client.send("st_timer", { startTs: this.st.startedAt || Date.now(), durationMs: this.st.durationMs || 180000 });
        client.send("st_foods", { foods: this.st.foods || [] });
        client.send("st_players", { players: this.st.players || {} });
        client.send("st_scores", { scores: this.st.scores || {} });
      }
    }catch(_){ }

    // Togester: late join sync (level/buttons/floors)
    try{
      if (this.state.mode === "togester" && this.state.phase === "playing" && !this.tg.over){
        client.send("tg_level", { level: this.tg.level });
        client.send("tg_buttons", { buttons: this.tg.buttons });
        client.send("tg_floors", { floors: Array.from(this.tg.floors.values()) });
      }
    }catch(_){ }

  }

  onLeave(client){
    const leaving = this.state.players.get(client.sessionId);
    const nick = leaving?.nick || "Player";
    this.state.players.delete(client.sessionId);
    this.state.order.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    // Togester transient state cleanup (no persistence)
    try{
      if (this.tg?.players) this.tg.players.delete(client.sessionId);
      try{
        if (this.tg?.floors){
          const removed = [];
          for (const [fid, fl] of this.tg.floors.entries()){
            if (fl && fl.owner === client.sessionId){
              this.tg.floors.delete(fid);
              removed.push(fid);
            }
          }
          if (removed.length){
            this.broadcast("tg_floor_remove", { owner: client.sessionId, ids: removed });
          }
        }
      }catch(_){ }
      if (this.state.mode === "togester" && this.state.phase === "playing"){
        const out = {};
        for (const [sid, st] of this.tg.players.entries()) out[sid] = st;
        this.broadcast("tg_players", { players: out });
      }
    }catch(_){ }
// SnakeTail transient state cleanup (no persistence)
try{
  if (this.st && this.state.mode === "snaketail"){
    delete this.st.players[client.sessionId];
    delete this.st.scores[client.sessionId];
    // Keep snapshots consistent for spectators
    if (this.state.phase === "playing"){
      this.broadcast("st_players", { players: this.st.players });
      this.broadcast("st_scores", { scores: this.st.scores });
      this.maybeAutoEndSnakeTail();
    }
  }
}catch(_){ }

    // playerCount/allReady are derived in recomputeReady()

    // if host left, promote the smallest seat to host
    if (this.state.playerCount > 0){
      const players = Array.from(this.state.players.entries());
      let hostSid = null;
      // choose smallest seat
      let best = 999;
      for (const [sid] of players){
        const seat = this.state.order.get(sid);
        if (seat !== undefined && seat < best){
          best = seat; hostSid = sid;
        }
      }
      for (const [sid, ps] of players){
        ps.isHost = (sid === hostSid);
      }
      const hostNick = hostSid ? (this.state.players.get(hostSid)?.nick || "-") : "-";
      this.setMetadata({ ...this.metadata, hostNick });
    }

    // if everyone left, let Colyseus dispose naturally
    this.recomputeReady();
    this.syncMetadata();
    this.broadcast("system", { nick: "SYSTEM", text: `${nick} 퇴장`, time: new Date().toTimeString().slice(0,5) });
  }

  recomputeReady(){
    // NOTE: host is implicitly ready.
    // CPU is a pseudo-player used only for solo-duel and does not count as a human.
    let humans = 0;
    let nonHostHumansReady = true;

    for (const [sid, p] of this.state.players.entries()){
      if (sid === CPU_SID) continue;
      humans++;
      if (!p.isHost && !p.ready) nonHostHumansReady = false;
    }

    this.state.playerCount = humans;
    if (this.state.modeType === "duel"){
      this.state.allReady = (humans >= 1) && nonHostHumansReady;
    } else {
      this.state.allReady = (humans >= 2) && nonHostHumansReady;
    }
  }

  syncMetadata(){
    const status = (this.state.phase === "playing") ? "playing" : "waiting";
    this.setMetadata({
      ...this.metadata,
      title: this.state.title,
      mode: this.state.mode,
      modeType: this.state.modeType,
      status,
      maxClients: this.maxClients,
    });
  }

  startGameLoop(){
    if (this.started) return;
    this.started = true;
    // Pre-fill inputs with 0 for connected players
    for (const sid of this.state.players.keys()){
      if (!this.inputs.has(sid)) this.inputs.set(sid, 0);
    }

    this.clock.setInterval(() => {
      this.tick++;
      const frameInputs = {};
      if (this.state.modeType === "duel" && this.tour?.active){
        // only active match players produce inputs; spectators just receive them
        const { a, b } = this.tour.active;
        frameInputs[a] = this.inputs.get(a) ?? 0;
        frameInputs[b] = this.inputs.get(b) ?? 0;
      } else {
        for (const sid of this.state.players.keys()){
          frameInputs[sid] = this.inputs.get(sid) ?? 0;
        }
      }
      this.broadcast("frame", { tick: this.tick, inputs: frameInputs });
    }, Math.floor(1000 / this.tickRate));
  }

  initDuelTournament(){
    const sids = Array.from(this.state.players.keys());
    shuffle(sids);
    const n = sids.length;
    const type = (n >= 4) ? 4 : (n === 3 ? 3 : 2);

    this.tour = { type, stage: 0, players: sids, bye: null, w1: null, w2: null, active: null, seeds: null };

    if (type === 3){
      this.tour.bye = sids[2];
    }
    // immediately start first match
    this.startNextDuelMatch();
  }

  startNextDuelMatch(){
    if (!this.tour) return;
    const t = this.tour;
    const sids = t.players;

    let a=null,b=null, roundLabel="";
    if (t.type === 2){
      a = sids[0]; b = sids[1];
      roundLabel = "결승";
    } else if (t.type === 3){
      if (t.stage === 0){
        a = sids[0]; b = sids[1];
        roundLabel = "준결";
      } else if (t.stage === 1){
        a = t.w1; b = t.bye;
        roundLabel = "결승";
      } else {
        this.finishDuelTournament(t.w1);
        return;
      }
    } else { // 4
      if (t.stage === 0){
        a = sids[0]; b = sids[1];
        roundLabel = "준결 1";
      } else if (t.stage === 1){
        a = sids[2]; b = sids[3];
        roundLabel = "준결 2";
      } else if (t.stage === 2){
        a = t.w1; b = t.w2;
        roundLabel = "결승";
      } else {
        this.finishDuelTournament(t.w1);
        return;
      }
    }

    if (!a || !b) return;

    t.active = { a, b, label: roundLabel };
    t.seeds = { seedA: (Math.random()*2**32)>>>0, seedB: (Math.random()*2**32)>>>0 };
    // reset last input snapshot for active players
    this.inputs.set(a, 0);
    this.inputs.set(b, 0);

    const pa = this.state.players.get(a);
    const pb = this.state.players.get(b);

    this.broadcast("match", {
      gameId: this.state.mode,
      aSid: a,
      bSid: b,
      aNick: pa?.nick || "A",
      bNick: pb?.nick || "B",
      seedA: t.seeds.seedA,
      seedB: t.seeds.seedB,
      roundLabel: roundLabel
    });

    // Let spectators know too
    this.broadcast("system", { nick: "SYSTEM", text: `🎮 매치 시작: ${(pa?.nick||"A")} vs ${(pb?.nick||"B")} (${roundLabel})`, at: new Date().toISOString() });
  }

  finishDuelTournament(winnerSid){
    const p = this.state.players.get(winnerSid);
    this.broadcast("result", { done: true, winnerSid, winnerNick: p?.nick || "?" });

    // return to room lobby after a short delay
    setTimeout(()=>{
      this.state.phase = "lobby";
      this.started = false;

      // Solo-duel cleanup: remove CPU pseudo player on return to lobby.
      if (this.state.players.has(CPU_SID)){
        try{ this.state.players.delete(CPU_SID); }catch(_){ }
        try{ this.state.order.delete(CPU_SID); }catch(_){ }
        try{ this.inputs.delete(CPU_SID); }catch(_){ }
      }

      for (const ps of this.state.players.values()) ps.ready = false;
      this.recomputeReady();
      this.setMetadata({ ...this.metadata, status: "waiting" });
      this.broadcast("backToRoom", {});
    }, 2500);
  }

  finishTogester(success, reason, bySid){
    const by = this.state.players.get(bySid);
    this.broadcast("result", {
      mode: "togester",
      done: true,
      success: !!success,
      reason: String(reason || (success ? "clear" : "fail")).slice(0, 64),
      bySid,
      byNick: by?.nick || "?",
    });

    setTimeout(()=>{
      this.state.phase = "lobby";
      this.started = false;
      for (const ps of this.state.players.values()) ps.ready = false;
      this.recomputeReady();
      this.setMetadata({ ...this.metadata, status: "waiting" });

      // reset transient toggester state
      try{ this.tg.players.clear(); }catch(_){ }
      this.tg.buttons = {};
      this.tg.level = 1;
      this.tg.lastBroadcastAt = 0;
      this.tg.over = false;

      this.broadcast("backToRoom", { mode: "togester" });
    }, 2500);
  }

  // --- SnakeTail helpers ---
  randFood(){
    const id = `${Date.now()}-${Math.floor(Math.random()*1e9)}`;
    const x = 80 + Math.random() * (1600 - 160);
    const y = 80 + Math.random() * (900 - 160);
    const r = Math.random();
    const value = (r < 0.80) ? 2 : ((r < 0.95) ? 4 : 6);
    return { id, x, y, value };
  }

  initSnakeTail(){
    if (!this.st) return;
    // Clear previous round timers
    try{ this.st.timer && this.st.timer.clear && this.st.timer.clear(); }catch(_){ }
    try{ this.st.interval && this.st.interval.clear && this.st.interval.clear(); }catch(_){ }

    this.st.players = {};
    this.st.scores = {};
    this.st.foods = [];
    this.st.startedAt = Date.now();
    this.st.durationMs = 180000;

    // Seed foods
    const seedCount = 70;
    for (let i=0; i<seedCount; i++) this.st.foods.push(this.randFood());

    // Seed scores from current room players
    try{
      for (const [sid, ps] of this.state.players.entries()){
        if (sid === CPU_SID) continue;
        this.st.scores[sid] = { mass: 14, alive: true, nick: ps?.nick || "Player" };
      }
    }catch(_){ }

    // Broadcast initial state
    this.broadcast("st_timer", { startTs: this.st.startedAt, durationMs: this.st.durationMs });
    this.broadcast("st_foods", { foods: this.st.foods });
    this.broadcast("st_scores", { scores: this.st.scores });
    this.broadcast("st_players", { players: this.st.players });

    // Periodic sync + gentle food respawn
    this.st.interval = this.clock.setInterval(()=>{
      if (this.state.mode !== "snaketail" || this.state.phase !== "playing") return;
      // keep foods topped up
      const maxFoods = 90;
      if (this.st.foods.length < maxFoods){
        const k = Math.min(3, maxFoods - this.st.foods.length);
        const out = [];
        for (let i=0; i<k; i++){
          const f = this.randFood();
          this.st.foods.push(f);
          out.push(f);
        }
        if (out.length) this.broadcast("st_spawn", { foods: out });
      }
      // broadcast snapshots for spectators/late joins
      this.broadcast("st_players", { players: this.st.players });
      this.broadcast("st_scores", { scores: this.st.scores });
      this.maybeAutoEndSnakeTail();
    }, 250);

    this.st.timer = this.clock.setTimeout(()=>{
      // Time over -> winner by mass (alive preferred)
      let bestSid = "";
      let bestMass = -1;
      const entries = Object.entries(this.st.scores || {});
      const alive = entries.filter(([,s])=> s && s.alive !== false);
      const arr = alive.length ? alive : entries;
      for (const [sid, s] of arr){
        const m = Number(s?.mass||0)||0;
        if (m > bestMass){ bestMass = m; bestSid = sid; }
      }
      this.finishSnakeTail("time", bestSid);
    }, this.st.durationMs);
  }

  maybeAutoEndSnakeTail(){
    if (!this.st || this.state.mode !== "snaketail" || this.state.phase !== "playing") return;
    const entries = Object.entries(this.st.scores || {});
    const alive = entries.filter(([,s])=> s && s.alive !== false);
    if (alive.length === 1){
      const winnerSid = alive[0][0];
      this.finishSnakeTail("last_alive", winnerSid);
    }
  }

  finishSnakeTail(reason, winnerSid){
    if (!this.st || this.state.mode !== "snaketail") return;
    if (this.state.phase !== "playing") return;

    // prevent duplicate finishes
    this.state.phase = "finishing";

    const winner = this.state.players.get(winnerSid);
    const winnerNick = winner?.nick || this.st.scores?.[winnerSid]?.nick || "우승자";

    this.broadcast("result", {
      mode: "snaketail",
      done: true,
      reason: String(reason || "end").slice(0, 64),
      winnerSid: String(winnerSid || ""),
      winnerNick: String(winnerNick || "우승자").slice(0, 24),
    });

    // return to room lobby after a short delay
    setTimeout(()=>{
      // stop timers
      try{ this.st.timer && this.st.timer.clear && this.st.timer.clear(); }catch(_){ }
      try{ this.st.interval && this.st.interval.clear && this.st.interval.clear(); }catch(_){ }

      this.state.phase = "lobby";
      this.started = false;
      for (const ps of this.state.players.values()) ps.ready = false;
      this.recomputeReady();
      this.setMetadata({ ...this.metadata, status: "waiting" });

      // reset transient snaketail state
      try{ this.st.players = {}; }catch(_){ }
      try{ this.st.foods = []; }catch(_){ }
      try{ this.st.scores = {}; }catch(_){ }

      this.broadcast("backToRoom", { mode: "snaketail" });
    }, 2500);
  }

}
