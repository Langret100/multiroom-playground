import { Room } from "@colyseus/core";
import { GameState, PlayerState } from "../state/GameState.js";

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
    this.maxClients = clamp(parseInt(options?.maxClients || "4", 10) || 4, 2, 4);

    this.state.title = String(options?.title || "새 방").slice(0, 30);
    this.state.mode  = String(options?.mode || "tetris4").slice(0, 20);
    // "duel" games are 1v1 games. If 3~4 players are in the room, we run a small tournament.
    // "coop" games are real-time cooperative games.
    const inferred = ["stackga","suika"].includes(this.state.mode) ? "duel" : "coop";
    this.state.modeType = String(options?.modeType || inferred).slice(0, 10);

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
      level: 1,
      lastBroadcastAt: 0,
      over: false,
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
      if (this.state.playerCount < 2) return;
      if (!this.state.allReady) return;

      this.state.phase = "playing";
      this.setMetadata({ ...this.metadata, status: "playing" });
      this.broadcast("started", { tickRate: this.tickRate });

      // Reset transient co-op state (no persistence)
      if (this.state.mode === "togester"){
        try{ this.tg.players.clear(); }catch(_){ }
        this.tg.buttons = {};
        this.tg.level = 1;
        this.tg.lastBroadcastAt = 0;
        this.tg.over = false;
        this.broadcast("tg_level", { level: this.tg.level });
        this.broadcast("tg_buttons", { buttons: this.tg.buttons });
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

    this.onMessage("tg_level", (client, { level }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const p = this.state.players.get(client.sessionId);
      if (!p?.isHost) return; // host-only
      const lv = clamp(parseInt(level ?? 1, 10) || 1, 1, 999);
      this.tg.level = lv;
      this.broadcast("tg_level", { level: lv });
    });

    this.onMessage("tg_reset", (client, { t }) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      if (this.tg.over) return;
      const p = this.state.players.get(client.sessionId);
      if (!p?.isHost) return; // host-only
      // clear buttons, keep player snapshots
      this.tg.buttons = {};
      this.broadcast("tg_reset", { t: Number(t)||Date.now() });
      this.broadcast("tg_buttons", { buttons: this.tg.buttons });
    });

    // Togester game over (success/fail) -> result -> backToRoom
    this.onMessage("tg_over", (client, payload) => {
      if (this.state.mode !== "togester") return;
      if (this.state.phase !== "playing") return;
      // host-only to avoid duplicates
      const p = this.state.players.get(client.sessionId);
      if (!p?.isHost) return;
      if (this.tg.over) return;
      this.tg.over = true;

      const success = !!payload?.success;
      const reason = String(payload?.reason || (success ? "clear" : "fail")).slice(0, 64);
      this.finishTogester(success, reason, client.sessionId);
    });


    
    // Duel relay: no persistence. Only active match players can send.
    this.onMessage("duel_state", (client, { state }) => {
      if (this.state.modeType !== "duel") return;
      if (this.state.phase !== "playing") return;
      if (this.tour?.active){
        const { a, b } = this.tour.active;
        if (client.sessionId !== a && client.sessionId !== b) return;
      }
      // broadcast to everyone in the room (including spectators)
      this.broadcast("duel_state", { sid: client.sessionId, state });
    });

    this.onMessage("duel_event", (client, { event }) => {
      if (this.state.modeType !== "duel") return;
      if (this.state.phase !== "playing") return;
      if (this.tour?.active){
        const { a, b } = this.tour.active;
        if (client.sessionId !== a && client.sessionId !== b) return;
      }
      this.broadcast("duel_event", { sid: client.sessionId, event });
    });

this.onMessage("input", (client, { mask }) => {
      // no per-input logging / storage
      if (this.state.phase !== "playing") return;
      const m = clamp(parseInt(mask ?? 0, 10) || 0, 0, 63);
      this.inputs.set(client.sessionId, m);
    });

    // Stackga: client notifies when they died (only active match players)
    this.onMessage("duel_over", (client) => {
      if (this.state.modeType !== "duel") return;
      if (this.state.phase !== "playing") return;
      if (!this.tour?.active) return;
      const { a, b } = this.tour.active;
      if (client.sessionId !== a && client.sessionId !== b) return;

      const loserSid = client.sessionId;
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

    this.state.playerCount = this.state.players.size;
    // seat order
    if (!this.state.order.has(client.sessionId)){
      const used = new Set(Array.from(this.state.order.values()));
      let seat=0;
      while (used.has(seat) && seat < 4) seat++;
      this.state.order.set(client.sessionId, seat);
    }

    this.recomputeReady();
    this.syncMetadata();
    this.broadcast("system", { nick: "SYSTEM", text: `${nick} 입장`, time: new Date().toTimeString().slice(0,5) });
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
      if (this.state.mode === "togester" && this.state.phase === "playing"){
        const out = {};
        for (const [sid, st] of this.tg.players.entries()) out[sid] = st;
        this.broadcast("tg_players", { players: out });
      }
    }catch(_){ }
    this.state.playerCount = this.state.players.size;

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
    let all = true;
    let count = 0;
    for (const p of this.state.players.values()){
      count++;
      if (!p.ready) all = false;
    }
    this.state.playerCount = count;
    this.state.allReady = (count >= 2) && all;
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

}
