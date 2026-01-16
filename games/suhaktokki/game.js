/* 수학토끼 v0.1
   로컬 멀티(같은 브라우저 탭/창): BroadcastChannel
   - 4~8명 (테스트용 봇 추가 가능)
   - 선생토끼(임포스터) 1명
   - 토끼굴 맵 + 위치별 수학 미션(각 미션 3문제 정답 시 해결)
   - PC: 마우스(클릭/드래그 방향으로 이동)
   - 모바일: 가상 조이스틱 + 조작/검은당근 버튼 + 전체화면
*/

(() => {
  'use strict';

  // embed (multiroom iframe)
  const QS = new URLSearchParams(location.search);
  const EMBED = QS.get("embed") === "1";
  function bridgeSend(type, payload){
    try{ window.parent && window.parent.postMessage({ type, ...(payload||{}) }, "*"); }catch(_){ }
  }

  // ---------- DOM ----------
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const lobby = document.getElementById('lobby');
  const nickEl = document.getElementById('nick');
  const roomEl = document.getElementById('room');
  const joinBtn = document.getElementById('joinBtn');
  const addBotBtn = document.getElementById('addBotBtn');
  const startBtn = document.getElementById('startBtn');

  const hud = document.getElementById('hud');
  const timeText = document.getElementById('timeText');
  const progFill = document.getElementById('progFill');
  const progText = document.getElementById('progText');
  const rolePill = document.getElementById('rolePill');
  const roleText = document.getElementById('roleText');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const exitBtn = document.getElementById('exitBtn');

  const rulesBtn = document.getElementById('rulesBtn');
  const mapBtn = document.getElementById('mapBtn');

  const rulesModal = document.getElementById('rulesModal');
  const closeRules = document.getElementById('closeRules');
  const mapModal = document.getElementById('mapModal');
  const closeMap = document.getElementById('closeMap');
  const mapUiCanvas = document.getElementById('mapUiCanvas');
  const mapUiCtx = mapUiCanvas ? mapUiCanvas.getContext('2d') : null;

  const lobbyStatus = document.getElementById('lobbyStatus');
  const roster = document.getElementById('roster');
  const rosterMeta = document.getElementById('rosterMeta');
  const rosterList = document.getElementById('rosterList');

  // room name pill (created dynamically to keep HTML small)
  const rightHud = document.getElementById('rightHud');
  const roomPill = document.createElement('div');
  roomPill.className = 'pill';
  roomPill.id = 'roomPill';
  roomPill.style.display = 'none';
  roomPill.style.opacity = '0.92';
  roomPill.style.pointerEvents = 'none';
  const roomText = document.createElement('span');
  roomText.id = 'roomText';
  roomPill.appendChild(roomText);
  if (rightHud) rightHud.insertBefore(roomPill, rightHud.firstChild);

  const touchUI = document.getElementById('touchUI');
  const joy = document.getElementById('joy');
  const joyKnob = document.getElementById('joyKnob');
  const interactBtn = document.getElementById('interactBtn');
  const killBtn = document.getElementById('killBtn');
  const saboBtn = document.getElementById('saboBtn');
  const forceBtn = document.getElementById('forceBtn');
  const saboBtnTouch = document.getElementById('saboBtnTouch');
  const forceBtnTouch = document.getElementById('forceBtnTouch');

  const missionModal = document.getElementById('missionModal');
  const missionTitle = document.getElementById('missionTitle');
  const missionDesc = document.getElementById('missionDesc');
  const qArea = document.getElementById('qArea');
  const closeMission = document.getElementById('closeMission');

  const meetingModal = document.getElementById('meetingModal');
  const meetingInfo = document.getElementById('meetingInfo');
  const voteList = document.getElementById('voteList');
  const skipVote = document.getElementById('skipVote');

  const sceneModal = document.getElementById('sceneModal');
  const sceneTitle = document.getElementById('sceneTitle');
  const sceneText = document.getElementById('sceneText');
  const sceneOk = document.getElementById('sceneOk');
  const sceneCanvas = document.getElementById('sceneCanvas');
  const sceneCtx = sceneCanvas.getContext('2d');

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const now = () => performance.now();
  const randId = () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  const strHash = (s) => {
    s = String(s || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  };

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const isMobile = matchMedia('(pointer:coarse)').matches;
  if (isMobile) touchUI.style.display = 'block';

  // ---------- Fullscreen / orientation ----------
  async function requestFullscreenAndLandscape() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      }
    } catch (_) {}
    try {
      await screen.orientation?.lock?.('landscape');
    } catch (_) {
      // iOS Safari 등은 lock이 막혀있을 수 있음
    }
  }
  fullscreenBtn.addEventListener('click', () => requestFullscreenAndLandscape());

  async function leaveRoom() {
    if (EMBED){
      // In multiroom iframe: just return to room UI
      try{ bridgeSend("sk_quit", {}); }catch(_){ }
      try{ G.net?.close?.(); }catch(_){ }
      G.net = null;
      return;
    }
    try { if (document.fullscreenElement) await document.exitFullscreen?.(); } catch (_) {}
    try { await screen.orientation?.unlock?.(); } catch (_) {}
    try { closeMissionUI(); } catch (_) {}
    try { closeMeetingUI(); } catch (_) {}
    try { sceneModal.classList.remove('show'); } catch (_) {}
    try { stopSceneAnim(); } catch (_) {}

    try { G.net?.close?.(); } catch (_) {}
    G.net = null;

    G.phase = 'lobby';
    G.host.started = false;
    G.host.inputs?.clear?.();
    G.host.votes?.clear?.();
    hostInitFromMap();

    hud.style.display = 'none';
    lobby.classList.remove('hidden');
    startBtn.disabled = true;
  }

  exitBtn.addEventListener('click', () => leaveRoom());

  // ---------- Lobby/Phase UI helpers ----------
  function setLobbyStatus(text, kind) {
    if (!lobbyStatus) return;
    if (!text) { lobbyStatus.textContent = ''; return; }
    lobbyStatus.textContent = text;
    if (kind === 'danger') lobbyStatus.style.color = 'rgba(255,90,122,.92)';
    else lobbyStatus.style.color = 'rgba(244,247,255,.82)';
  }

  function updateRosterUI() {
    if (!roster || !rosterList || !rosterMeta) return;
    if (!G.net) {
      roster.style.display = 'none';
      rosterList.innerHTML = '';
      rosterMeta.textContent = '0/8';
      return;
    }
    roster.style.display = 'block';
    const players = Object.values(G.state.players || {});
    rosterMeta.textContent = `${players.length}/8` + (G.net.isHost ? ' · 호스트' : '');
    rosterList.innerHTML = '';
    for (const p of players) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const bot = p.isBot ? '🤖' : '🐰';
      const alive = (p.alive && !p.down) ? '' : ' (다운)';
      chip.textContent = `${bot} ${p.nick}${alive}`;
      rosterList.appendChild(chip);
    }
  }

  function applyPhaseUI() {
    const inGame = EMBED ? !!G.net : !!(G.net && G.phase !== 'lobby');
    // lobby vs game
    if (inGame) {
      lobby?.classList.add('hidden');
      if (hud) hud.style.display = 'flex';
    } else {
      lobby?.classList.remove('hidden');
      if (hud) hud.style.display = 'none';
    }

    // inputs enabled only before join
    const joined = !!G.net;
    if (nickEl) nickEl.disabled = joined;
    if (roomEl) roomEl.disabled = joined;
    if (joinBtn) joinBtn.disabled = joined || !G.assetsReady;

    // host controls (in lobby)
    if (addBotBtn) addBotBtn.disabled = !G.assetsReady || !G.net || !G.net.isHost || (G.phase !== 'lobby');
    if (startBtn) startBtn.disabled = !G.assetsReady || !G.net || !G.net.isHost || G.host.started || (G.phase !== 'lobby') || Object.keys(G.state.players || {}).length < 1;

    // HUD buttons
    if (rulesBtn) rulesBtn.style.display = inGame ? 'inline-flex' : 'none';
    if (mapBtn) mapBtn.style.display = inGame ? 'inline-flex' : 'none';

    updateRosterUI();
  }

  // ---------- Rules/Map modal ----------
  function openRulesUI() { rulesModal?.classList.add('show'); }
  function closeRulesUI() { rulesModal?.classList.remove('show'); }

  function openMapUI() {
    if (!mapModal) return;
    G.ui.mapOpen = true;
    mapModal.classList.add('show');
  }
  function closeMapUI() {
    G.ui.mapOpen = false;
    mapModal?.classList.remove('show');
  }
  function toggleMapUI() {
    if (!G.net || G.phase === 'lobby') return;
    if (G.ui.mapOpen) closeMapUI(); else openMapUI();
  }

  rulesBtn?.addEventListener('click', () => openRulesUI());
  closeRules?.addEventListener('click', () => closeRulesUI());
  rulesModal?.addEventListener('click', (e) => { if (e.target === rulesModal) closeRulesUI(); });

  mapBtn?.addEventListener('click', () => toggleMapUI());
  closeMap?.addEventListener('click', () => closeMapUI());
  mapModal?.addEventListener('click', (e) => { if (e.target === mapModal) closeMapUI(); });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'm' || e.key === 'M') toggleMapUI();
    if (e.key === 'Escape') { closeRulesUI(); closeMapUI(); }
  });

  // ---------- Assets ----------
  const AS = {
    tilesImg: null,
    objsImg: null,
    tilesMeta: null,
    objsMeta: null,
    map: null,
    charsImg: null,
  };

  async function loadJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch fail ${url}`);
    return await r.json();
  }

  function loadImage(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
  }

  async function loadAssets() {
    AS.tilesMeta = await loadJSON('assets/tiles_rabbithole.json');
    AS.objsMeta = await loadJSON('assets/objects_rabbithole.json');
    AS.map = await loadJSON('assets/map_mathburrow_01.json');

    AS.tilesImg = await loadImage('assets/tiles_rabbithole.png');
    AS.objsImg = await loadImage('assets/objects_rabbithole.png');
    AS.charsImg = await loadImage('assets/chars_bunny_suits.png');
  }

  // ---------- Render sizing ----------
  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let viewW = 0, viewH = 0;

  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    // canvas는 화면을 꽉 쓰되, 둥근 모서리 유지
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    viewW = w;
    viewH = h;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Game constants ----------
  const TS = 16;
  const PLAYER_R = 7;
  const SPEED = 92; // px/s
  const KILL_RANGE = 26;
  const INTERACT_RANGE = 28;
  const VENT_TRAVEL_MS = 850;
  const VENT_COOLDOWN_MS = 4500;
  const FORCE_COOLDOWN_MS = 40_000;

  const COLOR_ROWS = 4; // sprite rows
  const FRAMES = 4; // sprite cols
  const SPR_W = 16, SPR_H = 18;

  const COLORS = [
    { name: '파랑', row: 0 },
    { name: '초록', row: 1 },
    { name: '핑크', row: 2 },
    { name: '노랑', row: 3 },
  ];

  // ---------- Map pre-render ----------
  let mapCanvas = null;
  let solid = null; // boolean grid

  function tileIsSolid(id) {
    const t = AS.tilesMeta.tiles?.[String(id)];
    return !!t?.solid;
  }

  function buildCollision() {
    const { width: W, height: H } = AS.map;
    solid = new Uint8Array(W * H);
    const walls = AS.map.layers.walls;
    for (let i = 0; i < walls.length; i++) {
      const id = walls[i];
      if (id && tileIsSolid(id)) solid[i] = 1;
    }
  }

  function buildMapPrerender() {
    const { width: W, height: H } = AS.map;
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = W * TS;
    mapCanvas.height = H * TS;
    const mctx = mapCanvas.getContext('2d');

    const cols = AS.tilesMeta.columns;
    const drawLayer = (layerArr) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const id = layerArr[y * W + x];
          if (!id) continue;
          const sx = (id % cols) * TS;
          const sy = Math.floor(id / cols) * TS;
          mctx.drawImage(AS.tilesImg, sx, sy, TS, TS, x * TS, y * TS, TS, TS);
        }
      }
    };

    drawLayer(AS.map.layers.ground);
    drawLayer(AS.map.layers.walls);
    drawLayer(AS.map.layers.deco);
  }

  // ---------- Networking: BroadcastChannel ----------
  class LocalNet {
    constructor(roomCode) {
      this.room = roomCode;
      this.clientId = randId();
      this.bc = new BroadcastChannel('mathtokki:' + roomCode);
      this.hostId = null;
      this.isHost = false;
      this.myPlayerId = null;
      this.handlers = new Map();
      this.lastHostSeen = 0;

      this.bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.room !== this.room) return;
        if (msg.t === 'host') this.lastHostSeen = Date.now();
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      };
    }

    on(type, fn) { this.handlers.set(type, fn); }

    post(msg) {
      msg.room = this.room;
      msg.from = this.clientId;
      this.bc.postMessage(msg);
    }

    async discoverHost() {
      this.post({ t: 'discover', at: Date.now() });
      await new Promise(r => setTimeout(r, 250));
      if (!this.hostId) {
        // host가 없다면 내가 host
        this.becomeHost();
      }
    }

    becomeHost() {
      this.isHost = true;
      this.hostId = this.clientId;
      this.post({ t: 'host', hostId: this.hostId, at: Date.now() });
    }

    close() {
      try { this.bc.close(); } catch (_) {}
    }
  }

  

  // ---------- Networking: WebSocket (Cloudflare Worker/Durable Object relay) ----------
  class WSNet {
    constructor(roomCode, wsBase) {
      this.room = roomCode;
      this.clientId = randId();
      this.hostId = null;
      this.isHost = false;
      this.myPlayerId = null;
      this.handlers = new Map();
      this.wsBase = wsBase;
      this.lastHostSeen = 0;

      const url = this._makeWsUrl(wsBase, roomCode);
      this.ws = new WebSocket(url);
      this.ws.addEventListener('message', (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || msg.room !== this.room) return;
        if (msg.t === 'host') this.lastHostSeen = Date.now();
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      });

      this.ws.addEventListener('close', () => {
        // 연결이 끊기면 로컬로 자동 복귀하지는 않고, 토스트만
        showToast('온라인 연결이 끊겼어. 새로고침해줘!');
      });
    }

    _makeWsUrl(wsBase, room) {
      let base = wsBase.trim();
      // ws/wss가 아니면 http/https를 ws/wss로 치환
      if (base.startsWith('http://')) base = 'ws://' + base.slice('http://'.length);
      if (base.startsWith('https://')) base = 'wss://' + base.slice('https://'.length);
      if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
        base = 'wss://' + base;
      }
      base = base.replace(/\/$/, '');
      return `${base}/ws/${encodeURIComponent(room)}`;
    }

    on(type, fn) { this.handlers.set(type, fn); }

    post(msg) {
      if (!this.ws || this.ws.readyState !== 1) return;
      msg.room = this.room;
      msg.from = this.clientId;
      try { this.ws.send(JSON.stringify(msg)); } catch (_) {}
    }

    async discoverHost() {
      // 기존 로직(클라이언트 호스트 선출)을 그대로 사용
      this.post({ t: 'discover', at: Date.now() });
      await new Promise(r => setTimeout(r, 250));
      if (!this.hostId) this.becomeHost();
    }

    becomeHost() {
      this.isHost = true;
      this.hostId = this.clientId;
      this.post({ t: 'host', hostId: this.hostId, at: Date.now() });
    }

    close() {
      try { this.ws.close(); } catch (_) {}
    }
  }



  // ---------- Networking: Bridge (embedded in multiroom) ----------
  class BridgeNet {
    constructor(roomCode, sessionId, isHost){
      this.room = roomCode;
      this.clientId = String(sessionId || randId());
      this.hostId = null;
      this.isHost = !!isHost;
      this.myPlayerId = null;
      this.handlers = new Map();
      this.lastHostSeen = 0;
      this._onMsg = (ev)=>{
        const data = ev.data || {};
        if (!data || typeof data !== "object") return;
        if (data.type !== "sk_msg") return;
        const msg = data.msg;
        if (!msg || msg.room !== this.room) return;
        if (msg.t === "host") this.lastHostSeen = Date.now();
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      };
      window.addEventListener("message", this._onMsg);
    }
    on(type, fn){ this.handlers.set(type, fn); }
    post(msg){
      msg.room = this.room;
      msg.from = this.clientId;
      try{ window.parent && window.parent.postMessage({ type:"sk_msg", msg }, "*"); }catch(_){ }
    }
    async discoverHost(){
      // In embed mode, do NOT auto-elect host on clients.
      this.post({ t:"discover", at: Date.now() });
      await new Promise(r => setTimeout(r, 300));
      if (this.isHost && !this.hostId){ this.becomeHost(); }
    }
    becomeHost(){
      this.isHost = true;
      this.hostId = this.clientId;
      this.post({ t:"host", hostId: this.hostId, at: Date.now() });
    }
    close(){
      try{ window.removeEventListener("message", this._onMsg); }catch(_){ }
      this._onMsg = null;
    }
  }

  // ---------- Game state ----------
  const G = {
    net: null,
    assetsReady: false,
    assetsError: null,
    phase: 'lobby', // lobby | play | meeting | scene | end

    host: {
      seed: 0,
      started: false,
      tick: 0,
      lastStep: 0,
      inputs: new Map(), // playerId -> input
      votes: new Map(),
      meetingEndsAt: 0,
      meetingKind: 'emergency', // emergency | report
      pendingScene: null,
      missionDisabledUntil: 0,
      revealUntil: 0,
    },

    state: {
      timeLeft: 180,
      maxTime: 180,
      solved: 0,
      total: 8,
      practice: false,
      players: {}, // id -> player
      objects: {}, // id -> obj
      missions: {}, // id -> {kind, state:'idle'|'active'|'solved', expiresAt}
      doors: {}, // id -> {closedUntil, closed}
      lockedRoomId: null,
      lockedRoomUntil: 0,
      waterBlocks: {}, // id -> {x,y,until}
      teacherId: null,
      winner: null,
      lastUpdateAt: 0,
    },

    ui: {
      mission: null, // {siteId, kind, correct, practice}
      reopenMission: null, // {siteId, at} (graph penalty)
      meeting: { voted: false },
      mapOpen: false,
    },

    fx: [], // {kind, x, y, bornAt, extra}

    local: {
      mouseDown: false,
      mvx: 0,
      mvy: 0,
      pendingAct: null,
      pendingVote: null,
      joy: { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 },
    },
  };

  // ---------- Host simulation ----------
  function hostInitFromMap() {
    const st = G.state;
    st.objects = {};
    st.missions = {};
    st.doors = {};
    st.waterBlocks = {};
    st.leaks = {};
    st.leakLevel = 0;
    st.lockedRoomId = null;
    st.lockedRoomUntil = 0;

    for (const o of AS.map.objects) {
      st.objects[o.id] = { ...o };
      if (o.type === 'mission') {
        st.missions[o.id] = { kind: o.kind, state: 'idle', expiresAt: 0 };
      }
      if (o.type === 'root_door') {
        st.doors[o.id] = { closed: false, closedUntil: 0, roomId: o.roomId };
      }
    }

    st.total = Object.keys(st.missions).length;
    st.solved = 0;
    st.timeLeft = 180;
    st.maxTime = 180;
    st.practice = false;
    st.teacherId = null;
    st.winner = null;
    st.lastUpdateAt = now();

    G.host.missionDisabledUntil = 0;
    G.host.revealUntil = 0;
    G.host.alarmUntil = 0;
    G.host.alarmText = '';
  }

  function hostAddPlayer(nick, isBot = false) {
    const st = G.state;
    const ids = Object.keys(st.players).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
    const nextId = ids.length ? Math.max(...ids) + 1 : 1;

    const sp = AS.map.spawnPoints[(nextId - 1) % AS.map.spawnPoints.length];
    const color = (nextId - 1) % COLORS.length;

    st.players[nextId] = {
      id: nextId,
      nick: nick.slice(0, 10),
      color,
      x: (sp.x + 0.5) * TS,
      y: (sp.y + 0.5) * TS,
      vx: 0,
      vy: 0,
      alive: true,
      down: false,
      role: 'crew',
      frozenUntil: 0,
      slowUntil: 0,
      killCdUntil: 0,
      saboCdUntil: 0,
      forceCdUntil: 0,
      glassesUntil: 0,
      invertUntil: 0,
      darkUntil: 0,
      crown: false,
      ventCdUntil: 0,
      vent: null, // {fromX,fromY,toX,toY,start,end,fromVent,toVent}
      isBot,
      botBrain: isBot ? { t: 0, target: null } : null,
    };

    return nextId;
  }

  function hostAssignTeacher() {
    const st = G.state;
    if (st.practice) {
      st.teacherId = null;
      for (const p of Object.values(st.players)) p.role = 'crew';
      return;
    }
    const aliveIds = Object.values(st.players).filter(p => p.alive).map(p => p.id);
    if (aliveIds.length < 4) return;
    const idx = Math.floor(Math.random() * aliveIds.length);
    const tid = aliveIds[idx];
    st.teacherId = tid;
    for (const p of Object.values(st.players)) p.role = (p.id === tid) ? 'teacher' : 'crew';
  }

  function hostStartGame(practice = false) {
    hostInitFromMap();
    G.host.started = true;
    G.state.practice = !!practice;
    G.state.timeLeft = 180;
    G.state.maxTime = 180;
    hostAssignTeacher();

    // 왕관/플로우리스 추적(호스트 전용)
    G.host._flawless = new Map(); // playerId -> Set(kind)
    G.host._missionProg = new Map(); // playerId -> Map(siteId -> {correct, hadWrong, practice})

    // 첫 미션 2개 활성화
    for (let i = 0; i < 2; i++) hostActivateRandomMission();

    broadcastState(true);
  }

  function hostAliveCount() {
    return Object.values(G.state.players).filter(p => p.alive && !p.down).length;
  }

  function hostCrewAliveCount() {
    const st = G.state;
    return Object.values(st.players).filter(p => p.alive && !p.down && p.id !== st.teacherId).length;
  }

  function hostActivateRandomMission() {
    const st = G.state;
    const alive = hostAliveCount();
    const limit = Math.max(1, Math.ceil(alive * 2 / 3));
    const active = Object.values(st.missions).filter(m => m.state === 'active').length;
    if (active >= limit) return false;

    const candidates = Object.entries(st.missions)
      .filter(([_, m]) => m.state === 'idle')
      .map(([id]) => id);
    if (!candidates.length) return false;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    st.missions[pick].state = 'active';
    st.missions[pick].expiresAt = now() + 60_000;
    return true;
  }

  function hostFailMission(siteId, reason) {
    const st = G.state;
    const m = st.missions[siteId];
    if (!m) return;

    m.state = 'idle';
    m.expiresAt = 0;
    if (m.forceFailAt) delete m.forceFailAt;
    if (m.forcedBy) delete m.forcedBy;

    // 제한시간 감소 + 누수(물샘) 누적
    st.timeLeft = Math.max(0, st.timeLeft - 15);

    // 누수 레벨(압박) : 실패할수록 시간이 더 빨리 줄어듦(과도하지 않게 캡)
    const add = (reason === 'forced') ? 2 : 1;
    st.leakLevel = Math.min(6, (st.leakLevel || 0) + add);

    const obj = st.objects[siteId];
    if (obj) {
      const tNow = now();
      const leakId = 'leak_' + siteId + '_' + Math.floor(tNow);
      st.leaks[leakId] = {
        id: leakId,
        x: obj.x,
        y: obj.y + 2,
        until: tNow + 45_000,
        bornAt: tNow,
        kind: (reason === 'forced' ? 'forced' : 'leak'),
      };
    }

    if (reason === 'forced') {
      broadcast({ t: 'toast', text: `선생토끼가 미션을 망쳤다! 물이 새고 있어… (누수 ${st.leakLevel})` });
    } else {
      broadcast({ t: 'toast', text: `미션 실패! 시간이 줄고 물이 새고 있어… (누수 ${st.leakLevel})` });
    }
  }


  function hostTick(dt) {
    const st = G.state;
    if (st.winner) return;

    // 타이머(누수 레벨이 높을수록 더 빨리 줄어듦)
    const leakMul = 1 + 0.06 * (st.leakLevel || 0);
    st.timeLeft -= dt * leakMul;
    if (st.timeLeft <= 0) {
      if (st.practice) {
        st.timeLeft = st.maxTime;
        broadcast({ t: 'toast', text: '연습 모드: 시간이 리셋됐어!' });
      } else {
        st.timeLeft = 0;
        st.winner = 'teacher';
        G.phase = 'end';
        return;
      }
    }

    // 미션 활성화 스케줄
    if (!G.host._nextMissionAt) G.host._nextMissionAt = now() + 6_000;
    if (now() >= G.host._nextMissionAt) {
      hostActivateRandomMission();
      G.host._nextMissionAt = now() + (6_000 + Math.random() * 6_000);
    }

    // 미션 만료/강제실패 처리
    for (const [id, m] of Object.entries(st.missions)) {
      if (m.state !== 'active') continue;

      // 선생토끼 강제미션: 잠깐 활성화된 뒤 자동 실패
      if (m.forceFailAt && now() >= m.forceFailAt) {
        hostFailMission(id, 'forced');
        continue;
      }

      // 일반 만료
      if (now() >= m.expiresAt) {
        hostFailMission(id, 'timeout');
      }
    }
    for (const [wbId, wb] of Object.entries(st.waterBlocks)) {
      if (now() >= wb.until) delete st.waterBlocks[wbId];
    }
    for (const [lkId, lk] of Object.entries(st.leaks || {})) {
      if (now() >= lk.until) delete st.leaks[lkId];
    }

    // 문 잠금 해제
    for (const d of Object.values(st.doors)) {
      if (d.closedUntil && now() >= d.closedUntil) {
        d.closedUntil = 0;
        d.closed = false;
      }
    }
    if (st.lockedRoomUntil && now() >= st.lockedRoomUntil) {
      st.lockedRoomUntil = 0;
      st.lockedRoomId = null;
    }

    // 보트 AI
    for (const p of Object.values(st.players)) {
      if (!p.isBot || !p.alive || p.down) continue;
      botThink(p, dt);
    }

    // 이동
    for (const p of Object.values(st.players)) {
      if (!p.alive) continue;
      if (p.down) continue;

      // 땅굴(벤트) 이동 중이면 이동/킬/조작 불가 + 도착 처리
      if (p.vent) {
        if (now() >= p.vent.end) {
          p.x = p.vent.toX;
          p.y = p.vent.toY;
          p.vx = 0;
          p.vy = 0;
          p.vent = null;
        } else {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
      }
      const frozen = now() < p.frozenUntil;
      const inp = G.host.inputs.get(p.id) || { mvx: 0, mvy: 0 };
      let mvx = frozen ? 0 : (inp.mvx || 0);
      let mvy = frozen ? 0 : (inp.mvy || 0);
      if (now() < (p.invertUntil || 0)) { mvx = -mvx; mvy = -mvy; }

      let spd = SPEED;
      if (now() < p.slowUntil) spd *= 0.6;

      const len = Math.hypot(mvx, mvy);
      const tvx = len > 1e-6 ? (mvx / len) * spd : 0;
      const tvy = len > 1e-6 ? (mvy / len) * spd : 0;
      // 가속/감속(모바일 조작감 개선)
      const a = 1 - Math.exp(-dt * 12);
      p.vx += (tvx - p.vx) * a;
      p.vy += (tvy - p.vy) * a;

      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;

      moveWithCollision(p, nx, ny);
    }

    // 승리 조건
    if (!st.practice) {
      const crewAlive = hostCrewAliveCount();
      if (crewAlive <= 1 && st.teacherId && st.players[st.teacherId]?.alive) {
        st.winner = 'teacher';
        G.phase = 'end';
        return;
      }

      if (st.solved >= st.total) {
        st.winner = 'crew';
        G.phase = 'end';
        return;
      }
    }
  }

  function botThink(p, dt) {
    p.botBrain.t -= dt;
    if (p.botBrain.t <= 0) {
      p.botBrain.t = 0.6 + Math.random() * 1.2;
      // 랜덤 지점 이동
      const tx = (10 + Math.random() * 44) * TS;
      const ty = (10 + Math.random() * 80) * TS;
      p.botBrain.target = { x: tx, y: ty };
    }
    const t = p.botBrain.target;
    if (!t) return;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) {
      p.botBrain.target = null;
      G.host.inputs.set(p.id, { mvx: 0, mvy: 0 });
      return;
    }
    G.host.inputs.set(p.id, { mvx: dx / d, mvy: dy / d });
  }

  
  function roomAtPixel(px, py) {
    if (!AS.map || !AS.map.rooms) return null;
    const tx = Math.floor(px / TS);
    const ty = Math.floor(py / TS);
    for (const r of AS.map.rooms) {
      const [x, y, w, h] = r.rect;
      if (tx >= x && ty >= y && tx < x + w && ty < y + h) return r;
    }
    return null;
  }

  function drawLockedRoomOverlay(cam, st) {
    if (!st.lockedRoomId || !st.lockedRoomUntil) return;
    const rem = st.lockedRoomUntil - now();
    if (rem <= 0) return;
    const r = (AS.map.rooms || []).find(rr => rr.id === st.lockedRoomId);
    if (!r) return;
    const [tx, ty, tw, th] = r.rect;
    const x = tx * TS - cam.x;
    const y = ty * TS - cam.y;
    const w = tw * TS;
    const h = th * TS;

    // clip to viewport
    const vx0 = 0, vy0 = 0, vx1 = viewW, vy1 = viewH;
    const rx0 = Math.max(vx0, x), ry0 = Math.max(vy0, y);
    const rx1 = Math.min(vx1, x + w), ry1 = Math.min(vy1, y + h);
    if (rx1 <= rx0 || ry1 <= ry0) return;

    const pulse = 0.55 + 0.25 * Math.sin(now() * 0.01);
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.10 * pulse;
    ctx.fillStyle = 'rgba(255,90,122,1)';
    ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);

    // diagonal stripes
    ctx.globalAlpha = 0.20 + 0.08 * pulse;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 2;
    const step = 16;
    const off = (now() * 0.08) % step;
    for (let sx = rx0 - (ry1 - ry0) - step; sx < rx1 + step; sx += step) {
      ctx.beginPath();
      ctx.moveTo(sx + off, ry1);
      ctx.lineTo(sx + (ry1 - ry0) + off, ry0);
      ctx.stroke();
    }

    // border
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(rx0 + 1.5, ry0 + 1.5, (rx1 - rx0) - 3, (ry1 - ry0) - 3);

    // label
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = '900 14px system-ui';
    ctx.textAlign = 'left';
    const sec = Math.ceil(rem / 1000);
    ctx.fillText(`출입 금지: ${r.name} (${sec}s)`, rx0 + 10, ry0 + 20);
    ctx.restore();
  }

function tileAtPixel(x, y) {
    const { width: W, height: H } = AS.map;
    const tx = Math.floor(x / TS);
    const ty = Math.floor(y / TS);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return { tx, ty, solid: true };
    const s = solid[ty * W + tx] === 1;
    return { tx, ty, solid: s };
  }

  function doorSolidAt(tx, ty) {
    const st = G.state;
    for (const obj of Object.values(st.objects)) {
      if (obj.type !== 'root_door') continue;
      if (obj.x === tx && obj.y === ty) {
        const d = st.doors[obj.id];
        if (d?.closed) return true;
      }
    }
    return false;
  }

  function waterAtTile(tx, ty) {
    const st = G.state;
    for (const wb of Object.values(st.waterBlocks)) {
      if (wb && Array.isArray(wb.tiles) && wb.tiles.length) {
        for (const t of wb.tiles) {
          if (t.x === tx && t.y === ty) return wb;
        }
      } else if (wb && wb.x === tx && wb.y === ty) {
        return wb;
      }
    }
    return null;
  }

  function waterBlockSolidAt(tx, ty, player) {
    const wb = waterAtTile(tx, ty);
    if (!wb) return false;
    // 선생토끼는 물길을 헤엄쳐서 통과 가능
    if (player && player.role === 'teacher') return false;
    return true;
  }

  function isSolidPixelFor(player, x, y) {
    const t = tileAtPixel(x, y);
    if (t.solid) return true;
    if (doorSolidAt(t.tx, t.ty)) return true;
    if (waterBlockSolidAt(t.tx, t.ty, player)) return true;
    return false;
  }

  function moveWithCollision(p, nx, ny) {
    // 축별 분리
    let x = nx;
    let y = p.y;
    if (collidesCircle(p, x, y, PLAYER_R)) x = p.x;
    y = ny;
    if (collidesCircle(p, x, y, PLAYER_R)) y = p.y;
    p.x = x;
    p.y = y;
  }

  function collidesCircle(player, cx, cy, r) {
    // 4점 + 중심
    const pts = [
      [cx, cy],
      [cx - r, cy],
      [cx + r, cy],
      [cx, cy - r],
      [cx, cy + r],
    ];
    for (const [x, y] of pts) {
      if (isSolidPixelFor(player, x, y)) return true;
    }
    return false;
  }

  // ---------- Host actions ----------
  function hostNearestInteractable(player) {
    const st = G.state;
    let best = null;
    let bestD2 = Infinity;

    for (const obj of Object.values(st.objects)) {
      // meeting, mission, door, report
      if (!['meeting_bell', 'mission', 'root_door', 'body_report', 'vent_hole'].includes(obj.type)) continue;
      if (obj.type === 'vent_hole' && player.role !== 'teacher') continue;
      if (obj.type === 'vent_hole' && G.state.practice) continue;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      const d2 = dist2(player.x, player.y, ox, oy);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = obj;
      }
    }

    // body report: 'down'된 플레이어 주변에서도 가능(스프라이트는 down 상태로 표현)
    if (!st.practice && st.teacherId) {
      for (const bp of Object.values(st.players)) {
        if (!bp.alive || !bp.down) continue;
        if (bp.id === player.id) continue;
        const d2 = dist2(player.x, player.y, bp.x, bp.y);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { id: 'body:' + bp.id, type: 'body_report', victimId: bp.id, px: bp.x, py: bp.y };
        }
      }
    }

    if (!best) return null;
    if (best.type === 'body_report' && best.id && best.id.startsWith('body:')) {
      if (bestD2 <= (INTERACT_RANGE + 10) ** 2) return best;
      return null;
    }

    if (bestD2 <= INTERACT_RANGE ** 2) return best;
    return null;
  }

  function hostHandleInteract(playerId) {
    const st = G.state;
    const p = st.players[playerId];
    if (!p || !p.alive || p.down) return;

    const obj = hostNearestInteractable(p);
    if (!obj) return;

    if (obj.type === 'meeting_bell') {
      if (st.practice || !st.teacherId) {
        sendToPlayer(playerId, { t: 'toast', text: '연습 모드: 선생토끼가 없어 회의는 할 수 없어!' });
        return;
      }
      hostStartMeeting('emergency', '종이 울렸다!');
      return;
    }

    if (obj.type === 'vent_hole') {
      if (st.practice || !st.teacherId) {
        sendToPlayer(playerId, { t: 'toast', text: '연습 모드: 땅굴은 쓸 수 없어!' });
        return;
      }
      if (p.id !== st.teacherId || p.role !== 'teacher') {
        sendToPlayer(playerId, { t: 'toast', text: '땅굴은 선생토끼만 쓸 수 있어!' });
        return;
      }
      if (now() < (p.ventCdUntil || 0)) {
        const sLeft = Math.ceil((p.ventCdUntil - now())/1000);
        sendToPlayer(playerId, { t: 'toast', text: `땅굴 쿨타임 ${sLeft}s` });
        return;
      }

      const vents = Object.values(st.objects).filter(o => o.type === 'vent_hole');
      if (vents.length < 2) return;
      const here = st.objects[obj.id];
      const links = (here && here.links) ? here.links.slice() : vents.map(v => v.id).filter(id => id !== obj.id);
      const choices = links.filter(id => id !== obj.id && st.objects[id] && st.objects[id].type === 'vent_hole');
      if (!choices.length) return;
      const toId = choices[Math.floor(Math.random() * choices.length)];
      const dest = st.objects[toId];

      p.ventCdUntil = now() + VENT_COOLDOWN_MS;
      p.vent = {
        fromX: p.x, fromY: p.y,
        toX: (dest.x + 0.5) * TS,
        toY: (dest.y + 0.5) * TS,
        start: now(),
        end: now() + VENT_TRAVEL_MS,
        fromVent: obj.id,
        toVent: dest.id,
      };

      broadcast({
        t: 'fx',
        kind: 'vent',
        from: { x: here.x, y: here.y },
        to: { x: dest.x, y: dest.y },
        bornAt: now(),
      });
      sendToPlayer(playerId, { t: 'toast', text: `땅굴 이동! → ${dest.roomId || '어딘가'}` });
      broadcastState(true);
      return;
    }

    if (obj.type === 'root_door') {
      const d = st.doors[obj.id];
      if (!d) return;
      // 잠금 중이면 토글 불가
      if (d.closedUntil && now() < d.closedUntil) return;
      d.closed = !d.closed;
      return;
    }

    if (obj.type === 'mission') {
      if (now() < G.host.missionDisabledUntil) {
        // 미션 잠김
        sendToPlayer(playerId, { t: 'toast', text: '지금은 미션을 풀 수 없어!' });
        return;
      }
      const m = st.missions[obj.id];
      if (!m || m.state === 'solved') {
        sendToPlayer(playerId, { t: 'toast', text: '이미 당근으로 막았어!' });
        return;
      }
      const practice = m.state !== 'active';
      const ui = buildMissionUI(obj.id, m.kind, practice);

      // 그래프 페널티 등으로 UI가 닫혔다가 다시 열릴 때 진행도 유지
      let prog = hostGetMissionProg(playerId, obj.id);
      if (!prog || prog.practice !== !!practice) {
        hostInitMissionProg(playerId, obj.id, m.kind, practice);
        prog = hostGetMissionProg(playerId, obj.id);
      }

      sendToPlayer(playerId, { t: 'uiMissionOpen', ...ui, correct: prog?.correct || 0 });
      return;
    }

    if (obj.type === 'body_report') {
      if (st.practice || !st.teacherId) {
        sendToPlayer(playerId, { t: 'toast', text: '연습 모드: 기절/회의가 없어. 미션 연습만 가능!' });
        return;
      }
      hostStartMeeting('report', '기절한 토끼를 발견!');
      return;
    }
  }

  function hostHandleKill(playerId) {
    const st = G.state;
    if (st.practice || !st.teacherId) return;
    const killer = st.players[playerId];
    if (!killer || !killer.alive || killer.down) return;
    if (killer.vent) return;
    if (killer.id !== st.teacherId) return;
    if (now() < killer.killCdUntil) return;

    // 가장 가까운 크루
    let target = null;
    let bestD2 = Infinity;
    for (const p of Object.values(st.players)) {
      if (!p.alive || p.down) continue;
      if (p.id === killer.id) continue;
      const d2 = dist2(killer.x, killer.y, p.x, p.y);
      if (d2 < bestD2) { bestD2 = d2; target = p; }
    }
    if (!target) return;
    if (bestD2 > KILL_RANGE ** 2) return;

    target.down = true;
    killer.killCdUntil = now() + 18_000;
    broadcastState();
  }


  function hostHandleSabotage(playerId) {
    const st = G.state;
    if (st.practice || !st.teacherId) return;
    const t = st.players[playerId];
    if (!t || !t.alive || t.down) return;
    if (t.vent) return;
    if (t.id !== st.teacherId || t.role !== 'teacher') return;

    const tNow = now();
    if (tNow < (t.saboCdUntil || 0)) return;

    // "길목"(뿌리문) 위에 있을 때만 물을 채울 수 있음
    let nearDoor = null;
    let bestD2 = Infinity;
    for (const obj of Object.values(st.objects)) {
      if (obj.type !== 'root_door') continue;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      const d2 = dist2(t.x, t.y, ox, oy);
      if (d2 < bestD2) { bestD2 = d2; nearDoor = obj; }
    }
    const RANGE2 = (INTERACT_RANGE + 10) ** 2;
    if (!nearDoor || bestD2 > RANGE2) {
      sendToPlayer(playerId, { t: 'toast', text: '길목(뿌리문) 근처에서만 물을 채울 수 있어!' });
      return;
    }

    // 이미 물이 차 있으면 중복 사용 방지
    if (waterAtTile(nearDoor.x, nearDoor.y)) {
      sendToPlayer(playerId, { t: 'toast', text: '이미 물이 차 있어!' });
      return;
    }

    const W = AS.map.width, H = AS.map.height;
    const baseSolidAt = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      return solid[ty * W + tx] === 1;
    };

    // 방향별로 "열린 통로" 길이를 재서 물이 길을 따라 차오르는 느낌
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    const lens = dirs.map(([dx, dy]) => {
      let n = 0;
      for (let i = 1; i <= 6; i++) {
        const tx = nearDoor.x + dx * i;
        const ty = nearDoor.y + dy * i;
        if (baseSolidAt(tx, ty)) break;
        // 닫힌 문 타일은 통로로 보지 않음
        if (doorSolidAt(tx, ty)) break;
        n++;
      }
      return n;
    });

    // 가장 열린 2방향 선택
    const order = [0, 1, 2, 3].sort((a, b) => lens[b] - lens[a]);

    const tiles = [];
    const addTile = (tx, ty) => {
      const key = tx + ',' + ty;
      if (seen.has(key)) return;
      seen.add(key);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
      // 문 타일은 항상 포함(통로 핵심)
      if (!(tx === nearDoor.x && ty === nearDoor.y) && baseSolidAt(tx, ty)) return;
      tiles.push({ x: tx, y: ty });
    };
    const seen = new Set();

    // 중심(문 타일)
    addTile(nearDoor.x, nearDoor.y);

    // 통로 방향으로 1~4타일 확장
    for (const idx of order.slice(0, 2)) {
      const [dx, dy] = dirs[idx];
      const L = Math.min(4, Math.max(1, lens[idx]));
      for (let i = 1; i <= L; i++) addTile(nearDoor.x + dx * i, nearDoor.y + dy * i);
    }

    // 폭을 살짝 주기(문 주변 + 1타일)
    addTile(nearDoor.x + 1, nearDoor.y);
    addTile(nearDoor.x - 1, nearDoor.y);
    addTile(nearDoor.x, nearDoor.y + 1);
    addTile(nearDoor.x, nearDoor.y - 1);

    const wbId = 'sabo_' + Math.floor(tNow);
    st.waterBlocks[wbId] = {
      id: wbId,
      x: nearDoor.x,
      y: nearDoor.y,
      tiles,
      until: tNow + 12_000,
      bornAt: tNow,
      kind: 'sabo',
      spotId: nearDoor.id,
    };

    // 물이 차오르는 순간, 수학토끼가 물길 위에 있었다면 옆으로 살짝 밀어내서 갇히지 않게
    const flooded = new Set(tiles.map(tt => tt.x + ',' + tt.y));
    const isBlockedForCrew = (tx, ty) => {
      if (baseSolidAt(tx, ty)) return true;
      if (doorSolidAt(tx, ty)) return true;
      if (flooded.has(tx + ',' + ty)) return true;
      return false;
    };
    for (const p of Object.values(st.players)) {
      if (!p.alive || p.down) continue;
      if (p.role === 'teacher') continue;
      const tx = Math.floor(p.x / TS);
      const ty = Math.floor(p.y / TS);
      if (!flooded.has(tx + ',' + ty)) continue;
      
      // BFS처럼 가까운 안전 타일부터 찾기
      let found = null;
      for (let r = 1; r <= 6 && !found; r++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (!isBlockedForCrew(nx, ny)) found = { x: nx, y: ny };
          }
        }
      }
      if (found) {
        p.x = (found.x + 0.5) * TS;
        p.y = (found.y + 0.5) * TS;
      }
    }

    t.saboCdUntil = tNow + 40_000;
    broadcast({ t: 'toast', text: `물이 차올라 길이 막혔다! (${nearDoor.roomId || '통로'})` });
    broadcastState(true);
  }


    function hostHandleForceMission(playerId) {
      const st = G.state;
      if (st.practice || !st.teacherId) return;
      const t = st.players[playerId];
      if (!t || !t.alive || t.down) return;
      if (t.vent) return;
      if (t.id !== st.teacherId || t.role !== 'teacher') return;
  
      const tNow = now();
      if (tNow < (t.forceCdUntil || 0)) {
        const sLeft = Math.ceil((t.forceCdUntil - tNow) / 1000);
        sendToPlayer(playerId, { t: 'toast', text: `강제미션 쿨타임 ${sLeft}s` });
        return;
      }
  
      // 근처의 '미션이 안 뜬 곳(Idle)' 찾기
      let best = null;
      let bestD2 = Infinity;
      for (const obj of Object.values(st.objects)) {
        if (obj.type !== 'mission') continue;
        const m = st.missions[obj.id];
        if (!m || m.state !== 'idle') continue;
        const ox = (obj.x + 0.5) * TS;
        const oy = (obj.y + 0.5) * TS;
        const d2 = dist2(t.x, t.y, ox, oy);
        if (d2 < bestD2) { bestD2 = d2; best = obj; }
      }
      if (!best || bestD2 > INTERACT_RANGE ** 2) {
        sendToPlayer(playerId, { t: 'toast', text: '근처에 숨은 미션 위치가 없어!' });
        return;
      }
  
      const mm = st.missions[best.id];
      if (!mm || mm.state !== 'idle') return;
  
      // 1) 미션 표시 시작(모두에게 물 솟음/느낌표가 보이도록)
      mm.state = 'active';
      mm.expiresAt = tNow + 2_500;
  
      // 2) 잠깐 뒤 자동 실패 처리(=제한시간 감소 + 물샘)
      mm.forceFailAt = tNow + 1_200;
      mm.forcedBy = playerId;
  
      t.forceCdUntil = tNow + FORCE_COOLDOWN_MS;
  
      broadcast({ t: 'toast', text: '어디선가 물이 솟기 시작했다!' });
      broadcastState(true);
    }
  

  function hostStartMeeting(kind, reason) {
    if (G.state.practice || !G.state.teacherId) return;
    if (G.phase !== 'play') return;
    G.phase = 'meeting';
    G.host.votes.clear();
    G.host.meetingEndsAt = now() + 20_000;
    G.host.meetingKind = kind || 'emergency';
    broadcastState(true);
    broadcast({ t: 'uiMeetingOpen', kind: G.host.meetingKind, reason, endsAt: G.host.meetingEndsAt });
  }

  function hostSubmitVote(playerId, targetIdOrNull) {
    if (G.phase !== 'meeting') return;
    const st = G.state;
    const voter = st.players[playerId];
    if (!voter || !voter.alive || voter.down) return;

    // targetIdOrNull == null => skip
    const emergency = (G.host.meetingKind === 'emergency');
    const weight = (emergency && voter.crown) ? 2 : 1;
    G.host.votes.set(playerId, { target: targetIdOrNull, weight });

    // '다음 긴급회의 한정' : 긴급회의(종)에서만 2표 + 소멸
    if (emergency && voter.crown) voter.crown = false;
  }

  function hostResolveMeeting() {
    const st = G.state;
    if (G.phase !== 'meeting') return;

    // 집계
    const tally = new Map();
    let skip = 0;
    for (const [voterId, v] of G.host.votes.entries()) {
      const voter = st.players[voterId];
      if (!voter || !voter.alive || voter.down) continue;
      const target = (v && typeof v === 'object') ? v.target : v;
      const w = (v && typeof v === 'object' && v.weight) ? v.weight : 1;
      if (target == null) { skip += w; continue; }
      const t = st.players[target];
      if (!t || !t.alive || t.down) continue;
      tally.set(target, (tally.get(target) || 0) + w);
    }

    let max = 0;
    let winner = null;
    let tie = false;
    for (const [pid, c] of tally.entries()) {
      if (c > max) { max = c; winner = pid; tie = false; }
      else if (c === max) { tie = true; }
    }
    if (tie) winner = null;

    if (winner != null) {
      const ejected = st.players[winner];
      if (ejected) {
        ejected.alive = false;
        ejected.down = false;
      }
      hostShowEjectScene(winner);

      // 선생토끼 추방이면 즉시 크루 승
      if (winner === st.teacherId) {
        st.winner = 'crew';
        G.phase = 'end';
      }
    } else {
      hostShowEjectScene(null);
    }

    // 회의 종료: 왕관은 '다음 긴급회의 한정'이므로, 긴급회의에서만 소멸
    if (G.host.meetingKind === 'emergency') {
      for (const pp of Object.values(st.players)) {
        if (pp && pp.crown) pp.crown = false;
      }
    }

    broadcastState(true);
  }

  function hostShowEjectScene(ejectedIdOrNull) {
    G.phase = 'scene';
    let title = '비 내리는 바깥...';
    let text = '';
    if (ejectedIdOrNull == null) {
      text = '동점! 아무도 추방되지 않았다.';
      broadcast({ t: 'uiScene', kind: 'tie', title, text });
    } else {
      const p = G.state.players[ejectedIdOrNull];
      if (p) {
        const isTeacher = (ejectedIdOrNull === G.state.teacherId);
        if (isTeacher) {
          text = `${p.nick} (선생토끼) : "칫..." 하고 사라졌다.`;
        } else {
          text = `${p.nick} : "으앙..." 비 맞으며 울고 있다...`;
        }
      }
      broadcast({
        t: 'uiScene',
        kind: 'eject',
        title,
        text,
        ejected: p ? { id: p.id, nick: p.nick, color: p.color, isTeacher: (p.id === G.state.teacherId) } : null,
      });
    }
  }

  // ---------- Mission UI / generation ----------
  const KIND_LABEL = {
    add: '덧셈',
    sub: '뺄셈',
    mul: '곱셈',
    div: '나눗셈',
    shape: '도형',
    graph: '그래프',
    unit: '단위변환',
    pattern: '규칙찾기',
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function genQuestion(kind) {
    // 난이도: 초3 무난
    if (kind === 'add') {
      const a = 10 + Math.floor(Math.random() * 490);
      const b = 10 + Math.floor(Math.random() * 490);
      return { type: 'number', prompt: `${a} + ${b} = ?`, answer: a + b };
    }
    if (kind === 'sub') {
      const a = 30 + Math.floor(Math.random() * 700);
      const b = 10 + Math.floor(Math.random() * Math.min(200, a - 1));
      return { type: 'number', prompt: `${a} - ${b} = ?`, answer: a - b };
    }
    if (kind === 'mul') {
      const a = 2 + Math.floor(Math.random() * 8);
      const b = 3 + Math.floor(Math.random() * 10);
      return { type: 'number', prompt: `${a} × ${b} = ?`, answer: a * b };
    }
    if (kind === 'div') {
      const b = 2 + Math.floor(Math.random() * 8);
      const q = 2 + Math.floor(Math.random() * 9);
      const a = b * q;
      return { type: 'number', prompt: `${a} ÷ ${b} = ?`, answer: q };
    }
    if (kind === 'unit') {
      const t = pick(['cm-m', 'm-cm', 'g-kg', 'kg-g', 'min-h', 'h-min', 'ml-l', 'l-ml']);
      if (t === 'cm-m') {
        const cm = (1 + Math.floor(Math.random() * 9)) * 100;
        return { type: 'number', prompt: `${cm}cm = ? m`, answer: cm / 100 };
      }
      if (t === 'm-cm') {
        const m = 1 + Math.floor(Math.random() * 9);
        return { type: 'number', prompt: `${m}m = ? cm`, answer: m * 100 };
      }
      if (t === 'g-kg') {
        const g = (1 + Math.floor(Math.random() * 9)) * 100;
        return { type: 'number', prompt: `${g}g = ? kg`, answer: g / 1000 };
      }
      if (t === 'kg-g') {
        const kg = 1 + Math.floor(Math.random() * 5);
        return { type: 'number', prompt: `${kg}kg = ? g`, answer: kg * 1000 };
      }
      if (t === 'min-h') {
        const min = pick([60, 120, 180]);
        return { type: 'number', prompt: `${min}분 = ? 시간`, answer: min / 60 };
      }
      if (t === 'h-min') {
        const h = pick([1, 2, 3]);
        return { type: 'number', prompt: `${h}시간 = ? 분`, answer: h * 60 };
      }
      if (t === 'ml-l') {
        const ml = pick([500, 1000, 1500, 2000]);
        return { type: 'number', prompt: `${ml}mL = ? L`, answer: ml / 1000 };
      }
      // l-ml
      const l = pick([1, 2, 3]);
      return { type: 'number', prompt: `${l}L = ? mL`, answer: l * 1000 };
    }
    if (kind === 'pattern') {
      const patternType = pick(['add', 'mul2', 'alt']);
      if (patternType === 'add') {
        const start = 2 + Math.floor(Math.random() * 10);
        const step = 2 + Math.floor(Math.random() * 8);
        const seq = [start, start + step, start + step * 2, start + step * 3];
        return { type: 'number', prompt: `규칙찾기: ${seq.join(', ')} , 다음 수는?`, answer: start + step * 4 };
      }
      if (patternType === 'mul2') {
        const start = 2 + Math.floor(Math.random() * 6);
        const seq = [start, start * 2, start * 4, start * 8];
        return { type: 'number', prompt: `규칙찾기: ${seq.join(', ')} , 다음 수는?`, answer: start * 16 };
      }
      // alt
      const a = 3 + Math.floor(Math.random() * 10);
      const b = 10 + Math.floor(Math.random() * 20);
      const seq = [a, b, a, b];
      return { type: 'choice', prompt: `규칙찾기: ${seq.join(', ')} , 다음은?`, answer: String(a), options: [String(a), String(b), String(a + 1), String(b + 1)].sort(() => Math.random() - 0.5) };
    }
    if (kind === 'shape') {
      const shapes = [
        { k: '삼각형', sides: 3 },
        { k: '사각형', sides: 4 },
        { k: '오각형', sides: 5 },
        { k: '육각형', sides: 6 },
        { k: '원', sides: 0 },
      ];
      const s = pick(shapes);
      const opts = shapes.filter(x => x.k !== s.k).map(x => x.k);
      const options = [s.k, pick(opts), pick(opts), pick(opts)].filter((v, i, a) => a.indexOf(v) === i);
      while (options.length < 4) options.push(pick(opts));
      options.sort(() => Math.random() - 0.5);
      return { type: 'shape', prompt: '이 도형의 이름은?', answer: s.k, options, shapeKey: s.k };
    }
    // graph
    const labels = ['당근', '버섯', '딸기', '감자'];
    const vals = labels.map(() => 2 + Math.floor(Math.random() * 8));
    const askType = pick(['max', 'sum']);
    if (askType === 'max') {
      let mi = 0;
      for (let i = 1; i < vals.length; i++) if (vals[i] > vals[mi]) mi = i;
      const ans = labels[mi];
      const options = labels.slice().sort(() => Math.random() - 0.5);
      return { type: 'graph', prompt: '그래프에서 가장 많은 것은?', answer: ans, options, labels, vals };
    }
    // sum
    const a = Math.floor(Math.random() * 4);
    let b = Math.floor(Math.random() * 4);
    while (b === a) b = Math.floor(Math.random() * 4);
    return { type: 'graphNum', prompt: `${labels[a]}와 ${labels[b]}의 합은?`, answer: vals[a] + vals[b], labels, vals };
  }

  function buildMissionUI(siteId, kind, practice) {
    return {
      siteId,
      kind,
      practice,
      correct: 0,
      question: genQuestion(kind),
    };
  }

  function hostInitMissionProg(playerId, siteId, kind, practice) {
    if (!G.host._missionProg) G.host._missionProg = new Map();
    let mp = G.host._missionProg.get(playerId);
    if (!mp) { mp = new Map(); G.host._missionProg.set(playerId, mp); }
    mp.set(siteId, { correct: 0, hadWrong: false, kind, practice: !!practice });
  }

  function hostGetMissionProg(playerId, siteId) {
    const mp = G.host._missionProg?.get(playerId);
    return mp ? mp.get(siteId) : null;
  }

  function hostResetFlawless(playerId) {
    if (!G.host._flawless) G.host._flawless = new Map();
    G.host._flawless.set(playerId, new Set());
    const p = G.state.players[playerId];
    if (p) p.crown = false;
  }

  function hostAddFlawlessKind(playerId, kind) {
    if (!G.host._flawless) G.host._flawless = new Map();
    let set = G.host._flawless.get(playerId);
    if (!set) { set = new Set(); G.host._flawless.set(playerId, set); }
    set.add(kind);
    return set.size;
  }

  function hostMissionSubmit(playerId, payload) {
    const st = G.state;
    const p = st.players[playerId];
    if (!p || !p.alive || p.down) return;

    const siteId = payload.siteId;
    const m = st.missions[siteId];
    if (!m) return;

    // 진행 상태(호스트 권위)
    let prog = hostGetMissionProg(playerId, siteId);
    if (!prog) {
      // 클라이언트가 새로고침 등으로 상태를 잃었을 때 대비
      const practice = (m.state !== 'active');
      hostInitMissionProg(playerId, siteId, m.kind, practice);
      prog = hostGetMissionProg(playerId, siteId);
    }

    const isPractice = !!prog.practice;
    if (!isPractice && m.state === 'solved') return;

    const q = payload.question;
    const ans = payload.answer;

    const ok = checkAnswer(q, ans);
    if (!ok) {
      prog.hadWrong = true;
      // 활성 미션에서만 페널티
      if (!isPractice) applyPenalty(m.kind, playerId);

      // 플로우리스(왕관) 조건은 '틀림'이 있으면 즉시 리셋
      if (!isPractice && p.id !== st.teacherId) hostResetFlawless(playerId);

      // 선생토끼가 틀리면 10초 땡글 안경
      if (!isPractice && p.id === st.teacherId) p.glassesUntil = Math.max(p.glassesUntil || 0, now() + 10_000);

      sendToPlayer(playerId, { t: 'uiMissionResult', ok: false, text: '틀렸어! 다시!' });
      sendToPlayer(playerId, { t: 'uiMissionNext', question: genQuestion(m.kind), correct: prog.correct });
      return;
    }

    // 맞음
    prog.correct += 1;
    if (prog.correct >= 3) {
      // 완료
      if (isPractice) {
        st.timeLeft += 10;
        st.timeLeft = Math.min(st.timeLeft, 999);
        sendToPlayer(playerId, { t: 'uiMissionResult', ok: true, text: '+10초! (연습)' });
        // 연습은 진행도/상태 변경 없음
        hostInitMissionProg(playerId, siteId, m.kind, true);
        broadcastState(true);
        return;
      }

      m.state = 'solved';
      m.expiresAt = 0;
      st.solved += 1;
      st.timeLeft += 30;
      st.timeLeft = Math.min(st.timeLeft, 999);
      sendToPlayer(playerId, { t: 'uiMissionResult', ok: true, text: '+30초! 해결!' });

      const siteObj = st.objects[siteId];
      if (siteObj) broadcast({ t: 'fx', kind: 'carrotPop', x: siteObj.x, y: siteObj.y, bornAt: now() });

      // 누수(압박) 완화: 미션을 해결하면 누수 레벨 1 감소 + 가장 오래된 물샘 흔적 1개 제거
      if ((st.leakLevel || 0) > 0) {
        st.leakLevel = Math.max(0, (st.leakLevel || 0) - 1);
        const entries = Object.entries(st.leaks || {});
        if (entries.length) {
          entries.sort((a,b) => (a[1].bornAt||0) - (b[1].bornAt||0));
          delete st.leaks[entries[0][0]];
        }
        broadcast({ t: 'toast', text: `당근으로 막았다! 누수가 줄었어. (누수 ${st.leakLevel})` });
      }

      // 왕관: 서로 다른 활성 미션 3개를 '한 번도 틀림 없이' 해결
      if (p.id !== st.teacherId && !p.crown && !prog.hadWrong) {
        const size = hostAddFlawlessKind(playerId, m.kind);
        if (size >= 3) {
          p.crown = true;
          // 다음 회의에서만 2표, 투표 후 사라짐
          sendToPlayer(playerId, { t: 'toast', text: '👑 왕관 획득! 다음 회의에서 2표야!' });
          broadcast({ t: 'toast', text: `${p.nick} 토끼가 왕관을 얻었다! (다음 회의 2표)` });
          // 다음 왕관을 위해 리셋(중복 방지)
          hostResetFlawless(playerId);
          p.crown = true;
        }
      }

      // 다음 시도 대비 진행 초기화
      hostInitMissionProg(playerId, siteId, m.kind, false);

      broadcastState(true);
    } else {
      sendToPlayer(playerId, { t: 'uiMissionResult', ok: true, text: `정답! (${prog.correct}/3)` });
      sendToPlayer(playerId, { t: 'uiMissionNext', question: genQuestion(m.kind), correct: prog.correct });
    }
  }

  function checkAnswer(q, ans) {
    if (q.type === 'number' || q.type === 'graphNum') {
      const a = Number(ans);
      return Number.isFinite(a) && a === q.answer;
    }
    if (q.type === 'choice' || q.type === 'shape' || q.type === 'graph') {
      return String(ans) === String(q.answer);
    }
    return false;
  }

  function applyPenalty(kind, playerId) {
    const st = G.state;
    const doors = Object.values(st.doors);
    const victim = st.players[playerId];

    if (kind === 'add') {
      // 무작위 "방" 10초 잠금 (중첩 시 시간은 늘어나고, 방은 유지)
      const endAt = now() + 10_000;

      // 이미 잠긴 방이 없으면 새로 뽑기
      const hasActiveLock = !!(st.lockedRoomUntil && now() < st.lockedRoomUntil && st.lockedRoomId);
      if (!hasActiveLock && doors.length) {
        const picked = doors[Math.floor(Math.random() * doors.length)];
        st.lockedRoomId = picked.roomId;
      }

      if (st.lockedRoomId) {
        st.lockedRoomUntil = Math.max(st.lockedRoomUntil || 0, endAt);
        for (const d of Object.values(st.doors)) {
          if (d.roomId === st.lockedRoomId) {
            d.closed = true;
            d.closedUntil = Math.max(d.closedUntil || 0, endAt);
          }
        }
      }
      return;
    }
    if (kind === 'mul') {
      // 전체 위치 공개 8초(중첩 시 더 길게)
      G.host.revealUntil = Math.max(G.host.revealUntil || 0, now() + 8_000);
      return;
    }
    if (kind === 'div') {
      // 선생토끼 제외 5초 정지
      for (const p of Object.values(st.players)) {
        if (!p.alive || p.down) continue;
        if (p.id === st.teacherId) continue;
        p.frozenUntil = Math.max(p.frozenUntil, now() + 5_000);
      }
      return;
    }
    if (kind === 'shape') {
      // 모든 문 닫힘 5초
      for (const d of Object.values(st.doors)) {
        d.closed = true;
        d.closedUntil = Math.max(d.closedUntil, now() + 5_000);
      }
      return;
    }
    if (kind === 'graph') {
      // 모든 미션 7초 잠금
      G.host.missionDisabledUntil = Math.max(G.host.missionDisabledUntil, now() + 7_000);
      // 진행 중 UI 닫기는 클라이언트 쪽에서 처리
      broadcast({ t: 'uiForceCloseMission', ms: 7_000 });
      return;
    }
    if (kind === 'pattern') {
      // 규칙찾기 오답: 모든 미션 발생 + 전역 경보
      const endAt = now() + 60_000;
      for (const m of Object.values(st.missions)) {
        if (m.state === 'idle') {
          m.state = 'active';
          m.expiresAt = endAt;
        } else if (m.state === 'active') {
          m.expiresAt = Math.max(m.expiresAt || 0, endAt);
        }
      }
      // 경보(표시/연출): 6초
      G.host.alarmUntil = Math.max(G.host.alarmUntil || 0, now() + 6_000);
      G.host.alarmText = '🚨 규칙찾기 오답! 모든 미션이 발생했어!';
      broadcast({ t: 'toast', text: '🚨 규칙찾기 오답! 모든 미션이 발생했어!' });
      return;
    }
    if (kind === 'unit') {
      // 단위변환: 해당 플레이어 10초 조작 반전
      if (victim) victim.invertUntil = Math.max(victim.invertUntil || 0, now() + 10_000);
      sendToPlayer(playerId, { t: 'toast', text: '단위변환을 틀렸다! 10초간 방향이 반대야!' });
      return;
    }
    if (kind === 'sub') {
      // 뺄셈: 해당 플레이어 8초 시야 감소
      if (victim) victim.darkUntil = Math.max(victim.darkUntil || 0, now() + 8_000);
      sendToPlayer(playerId, { t: 'toast', text: '뺄셈을 틀렸다! 8초간 굴이 어두워져…' });
      return;
    }
  }

  // ---------- Broadcast helpers ----------
  function broadcast(msg) {
    if (!G.net) return;
    G.net.post(msg);
  }

  function sendToPlayer(playerId, msg) {
    // BroadcastChannel은 개별 전송이 없어서, to 필드로 필터
    broadcast({ ...msg, to: playerId });
  }

  function broadcastState(force = false) {
    if (!G.net || !G.net.isHost) return;
    const st = G.state;
    const payload = {
      t: 'state',
      phase: G.phase,
      timeLeft: st.timeLeft,
      maxTime: st.maxTime,
      solved: st.solved,
      total: st.total,
      practice: st.practice,
      players: st.players,
      missions: st.missions,
      doors: st.doors,
      waterBlocks: st.waterBlocks,
      leaks: st.leaks,
      leakLevel: st.leakLevel || 0,
      lockedRoomId: st.lockedRoomId,
      lockedRoomUntil: st.lockedRoomUntil,
      teacherId: st.teacherId,
      winner: st.winner,
      host: {
        meetingEndsAt: G.host.meetingEndsAt,
        revealUntil: G.host.revealUntil,
        missionDisabledUntil: G.host.missionDisabledUntil,
        alarmUntil: G.host.alarmUntil || 0,
        alarmText: G.host.alarmText || '',
      },
      at: now(),
      force,
    };
    broadcast(payload);
  }

  // ---------- Client input & UI ----------
  function setRolePill() {
    const st = G.state;
    const me = st.players[G.net?.myPlayerId];
    if (!me) {
      rolePill.style.display = 'none';
      return;
    }
    rolePill.style.display = 'flex';
    if (st.practice) {
      roleText.textContent = '연습 모드';
      rolePill.style.borderColor = 'rgba(125,211,252,.55)';
      return;
    }
    if (me.role === 'teacher') {
      roleText.textContent = '선생토끼';
      rolePill.style.borderColor = 'rgba(255,90,122,.6)';
    } else {
      roleText.textContent = '수학토끼';
      rolePill.style.borderColor = 'rgba(102,224,163,.45)';
    }
  }

  function hasIdleMissionNearby(me) {
    const st = G.state;
    for (const obj of Object.values(st.objects)) {
      if (obj.type !== 'mission') continue;
      const m = st.missions[obj.id];
      if (!m || m.state !== 'idle') continue;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      if (dist2(me.x, me.y, ox, oy) <= INTERACT_RANGE ** 2) return true;
    }
    return false;
  }

  function nearestFloodSpotDoor(me) {
    const st = G.state;
    let best = null;
    let bestD2 = Infinity;
    for (const obj of Object.values(st.objects)) {
      if (obj.type !== 'root_door') continue;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      const d2 = dist2(me.x, me.y, ox, oy);
      if (d2 < bestD2) { bestD2 = d2; best = obj; }
    }
    const RANGE2 = (INTERACT_RANGE + 10) ** 2;
    if (!best || bestD2 > RANGE2) return null;
    // 이미 물이 차 있으면 버튼을 숨김
    if (waterAtTile(best.x, best.y)) return null;
    return best;
  }

  function setHUD() {
    timeText.textContent = fmtTime(G.state.timeLeft);

    // 타이머 경고(60/30/10초): 점멸 + (가능하면) 비프/진동
    const tl = G.state.timeLeft || 0;
    const stage = (G.phase === 'play' && tl > 0) ? (tl <= 10 ? 3 : (tl <= 30 ? 2 : (tl <= 60 ? 1 : 0))) : 0;

    // 60초 이하는 텍스트 점멸
    if (stage >= 1) {
      const blink = (Math.sin(now() * 0.02) * 0.5 + 0.5);
      timeText.style.opacity = (blink > 0.5 ? '1' : '0.35');
      timeText.style.color = 'rgb(255,90,122)';
    } else {
      timeText.style.opacity = '';
      timeText.style.color = '';
    }

    if (!G.ui._timeWarnStage) G.ui._timeWarnStage = 0;
    if (stage !== G.ui._timeWarnStage) {
      G.ui._timeWarnStage = stage;
      // 단계 진입 시 1회만
      if (stage === 1) {
        playBeep(440, 0.06);
        tryVibrate(40);
      }
      if (stage === 2) {
        playBeep(520, 0.07);
        tryVibrate([60, 30, 60]);
      }
      if (stage === 3) {
        playBeep(720, 0.09);
        tryVibrate([90, 40, 90]);
      }
    }
    const pct = G.state.total ? (G.state.solved / G.state.total) : 0;
    progFill.style.width = `${clamp(pct * 100, 0, 100)}%`;
    if (progText) progText.textContent = `${G.state.solved}/${G.state.total}`;

    // 선생토끼 전용: 스킬 버튼 UI
    const st = G.state;
    const me = st.players[G.net?.myPlayerId];
    const show = !!(G.net && me && !st.practice && me.role === 'teacher');

    // (1) 길목 물채우기(사보타주): 길목(뿌리문) 근처일 때만 버튼 표시
    const nearFloodDoor = (show && me) ? nearestFloodSpotDoor(me) : null;
    const showSabo = !!nearFloodDoor;
    if (saboBtn) saboBtn.style.display = showSabo ? 'inline-flex' : 'none';
    if (saboBtnTouch) saboBtnTouch.style.display = showSabo ? 'flex' : 'none';

    // (2) 강제미션
    if (forceBtn) forceBtn.style.display = show ? 'inline-flex' : 'none';
    if (forceBtnTouch) forceBtnTouch.style.display = show ? 'flex' : 'none';

    if (show) {
      // 근처에 Idle 미션이 있는지(강제미션 가능 위치)
      const nearIdle = hasIdleMissionNearby(me);

      const remSabo = Math.ceil(Math.max(0, ((me.saboCdUntil || 0) - now())) / 1000);
      const saboReady = (remSabo <= 0) && (G.phase === 'play');
      if (saboBtn) {
        saboBtn.disabled = !saboReady;
        saboBtn.textContent = remSabo > 0 ? `물채우기 ${remSabo}s` : '물채우기';
      }
      if (saboBtnTouch) {
        saboBtnTouch.classList.toggle('ready', saboReady);
        saboBtnTouch.textContent = remSabo > 0 ? `물채우기 ${remSabo}s` : '물채우기';
      }

      const remForce = Math.ceil(Math.max(0, ((me.forceCdUntil || 0) - now())) / 1000);
      const forceReady = (remForce <= 0) && (G.phase === 'play') && nearIdle;
      const forceText = remForce > 0 ? `강제미션 ${remForce}s` : (nearIdle ? '강제미션' : '강제미션(근처X)');
      if (forceBtn) {
        forceBtn.disabled = !forceReady;
        forceBtn.textContent = forceText;
      }
      if (forceBtnTouch) {
        forceBtnTouch.classList.toggle('ready', forceReady);
        forceBtnTouch.textContent = forceText;
      }
    }
  }

  // ---------- Feedback helpers (beep/vibrate) ----------
  let _AC = null;
  function ensureAudio() {
    if (_AC) return _AC;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _AC = new AC();
      return _AC;
    } catch {
      return null;
    }
  }

  // 사용자 제스처 이후에만 소리가 남(브라우저 정책)
  window.addEventListener('pointerdown', () => {
    const ac = ensureAudio();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  }, { once: true });
  window.addEventListener('keydown', () => {
    const ac = ensureAudio();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  }, { once: true });

  function playBeep(freq = 600, dur = 0.07) {
    const ac = ensureAudio();
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.03, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, dur));
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + Math.max(0.03, dur) + 0.02);
  }

  function tryVibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  }

  function showToast(text) {
    // 간단 토스트: rolePill 텍스트 잠깐 바꾸기
    const prev = roleText.textContent;
    roleText.textContent = text;
    setTimeout(() => setRolePill(), 900);
    setTimeout(() => { roleText.textContent = prev; }, 1200);
  }

  function openMissionUI(payload) {
    G.ui.mission = {
      siteId: payload.siteId,
      kind: payload.kind,
      practice: payload.practice,
      correct: payload.correct || 0,
      question: payload.question,
    };

    missionTitle.textContent = `${KIND_LABEL[payload.kind] || '미션'} 미션`;
    missionDesc.textContent = payload.practice ? '연습 미션: 맞히면 +10초 (진행도는 안 올라가요)' : '문제 3개를 맞히면 해결! (+30초)';
    missionModal.classList.add('show');
    renderQuestion();
  }

  function closeMissionUI() {
    missionModal.classList.remove('show');
    G.ui.mission = null;
  }

  function renderQuestion(resultText) {
    qArea.innerHTML = '';
    const ui = G.ui.mission;
    if (!ui) return;
    const q = ui.question;

    const p = document.createElement('p');
    p.style.margin = '0 0 10px';
    p.style.fontWeight = '900';
    p.style.fontSize = '18px';
    p.textContent = q.prompt;
    qArea.appendChild(p);

    if (q.type === 'shape') {
      const c = document.createElement('canvas');
      c.width = 260;
      c.height = 150;
      c.style.width = '100%';
      c.style.maxWidth = '320px';
      c.style.borderRadius = '12px';
      c.style.border = '1px solid rgba(255,255,255,.12)';
      c.style.background = 'rgba(255,255,255,.05)';
      qArea.appendChild(c);
      drawShapePreview(c.getContext('2d'), q.shapeKey);

      qArea.appendChild(document.createElement('div')).style.height = '8px';

      q.options.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'ui wide';
        b.textContent = opt;
        b.onclick = () => submitMissionAnswer(opt);
        qArea.appendChild(b);
      });
    } else if (q.type === 'graph' || q.type === 'graphNum') {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 160;
      c.style.width = '100%';
      c.style.maxWidth = '360px';
      c.style.borderRadius = '12px';
      c.style.border = '1px solid rgba(255,255,255,.12)';
      c.style.background = 'rgba(255,255,255,.05)';
      qArea.appendChild(c);
      drawGraph(c.getContext('2d'), q.labels, q.vals);
      qArea.appendChild(document.createElement('div')).style.height = '8px';

      if (q.type === 'graph') {
        q.options.forEach(opt => {
          const b = document.createElement('button');
          b.className = 'ui wide';
          b.textContent = opt;
          b.onclick = () => submitMissionAnswer(opt);
          qArea.appendChild(b);
        });
      } else {
        const input = document.createElement('input');
        input.placeholder = '숫자 입력';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.style.width = '100%';
        input.style.padding = '14px';
        input.style.borderRadius = '12px';
        input.style.marginBottom = '10px';
        qArea.appendChild(input);

        const b = document.createElement('button');
        b.className = 'ui wide';
        b.textContent = '제출';
        b.onclick = () => submitMissionAnswer(input.value);
        qArea.appendChild(b);
        setTimeout(() => input.focus(), 0);
      }
    } else if (q.type === 'choice') {
      q.options.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'ui wide';
        b.textContent = opt;
        b.onclick = () => submitMissionAnswer(opt);
        qArea.appendChild(b);
      });
    } else {
      const input = document.createElement('input');
      input.placeholder = '숫자 입력';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.style.width = '100%';
      input.style.padding = '14px';
      input.style.borderRadius = '12px';
      input.style.marginBottom = '10px';
      qArea.appendChild(input);

      const b = document.createElement('button');
      b.className = 'ui wide';
      b.textContent = '제출';
      b.onclick = () => submitMissionAnswer(input.value);
      qArea.appendChild(b);
      setTimeout(() => input.focus(), 0);
    }

    if (resultText) {
      const r = document.createElement('p');
      r.style.margin = '12px 0 0';
      r.style.fontWeight = '900';
      r.textContent = resultText;
      qArea.appendChild(r);
    }
  }

  function drawShapePreview(c, shapeKey) {
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.save();
    c.translate(c.canvas.width / 2, c.canvas.height / 2 + 10);
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(255,255,255,.92)';
    c.fillStyle = 'rgba(102,224,163,.25)';

    const R = 46;
    const drawPoly = (n) => {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (-Math.PI / 2) + i * (2 * Math.PI / n);
        const x = Math.cos(a) * R;
        const y = Math.sin(a) * R;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      c.stroke();
    };

    if (shapeKey === '원') {
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (shapeKey === '삼각형') drawPoly(3);
    else if (shapeKey === '사각형') drawPoly(4);
    else if (shapeKey === '오각형') drawPoly(5);
    else if (shapeKey === '육각형') drawPoly(6);

    c.restore();
  }

  function drawGraph(c, labels, vals) {
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    const W = c.canvas.width, H = c.canvas.height;
    const pad = 20;
    const maxV = Math.max(...vals, 1);
    const bw = (W - pad * 2) / vals.length;

    c.strokeStyle = 'rgba(255,255,255,.2)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(pad, H - pad);
    c.lineTo(W - pad, H - pad);
    c.stroke();

    for (let i = 0; i < vals.length; i++) {
      const x = pad + i * bw + bw * 0.2;
      const w = bw * 0.6;
      const h = (H - pad * 2) * (vals[i] / maxV);
      const y = (H - pad) - h;

      c.fillStyle = 'rgba(125,211,252,.25)';
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 3;
      c.beginPath();
      c.rect(x, y, w, h);
      c.fill();
      c.stroke();

      c.fillStyle = 'rgba(255,255,255,.9)';
      c.font = 'bold 12px system-ui';
      c.textAlign = 'center';
      c.fillText(labels[i], x + w / 2, H - 6);
      c.fillText(String(vals[i]), x + w / 2, y - 6);
    }
  }

  function submitMissionAnswer(ans) {
    const ui = G.ui.mission;
    if (!ui || !G.net) return;
    const payload = {
      t: 'missionSubmit',
      playerId: G.net.myPlayerId,
      siteId: ui.siteId,
      kind: ui.kind,
      practice: ui.practice,
      correct: ui.correct,
      question: ui.question,
      answer: ans,
    };
    G.net.post(payload);
  }

  closeMission.addEventListener('click', () => closeMissionUI());

  function openMeetingUI(kind, reason, endsAt) {
    meetingModal.classList.add('show');
    const tag = (kind === 'report') ? '🚨 신고' : '🔔 긴급회의';
    meetingInfo.textContent = `${tag} · ${reason}`;
    G.ui.meeting.voted = false;

    renderVoteList();

    // 타이머 업데이트
    const tick = () => {
      if (G.phase !== 'meeting') return;
      const left = Math.max(0, Math.ceil((endsAt - now()) / 1000));
      meetingInfo.textContent = `${tag} · ${reason} (남은 ${left}s)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function closeMeetingUI() {
    meetingModal.classList.remove('show');
  }

  function renderVoteList() {
    voteList.innerHTML = '';
    const st = G.state;
    const meId = G.net?.myPlayerId;

    const alive = Object.values(st.players).filter(p => p.alive && !p.down);
    alive.forEach(p => {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      left.innerHTML = `<b>${escapeHtml(p.nick)}</b> <small style="color:rgba(244,247,255,.65);font-weight:900">#${p.id}</small>`;
      const btn = document.createElement('button');
      btn.className = 'ui';
      btn.textContent = '투표';
      btn.disabled = G.ui.meeting.voted || p.id === meId;
      btn.onclick = () => {
        if (!G.net) return;
        G.ui.meeting.voted = true;
        G.net.post({ t: 'vote', playerId: meId, target: p.id });
        renderVoteList();
      };
      row.appendChild(left);
      row.appendChild(btn);
      voteList.appendChild(row);
    });
  }

  skipVote.addEventListener('click', () => {
    if (!G.net) return;
    G.ui.meeting.voted = true;
    G.net.post({ t: 'vote', playerId: G.net.myPlayerId, target: null });
    renderVoteList();
  });

  // ---------- Scene (eject / tie) animation ----------
  const SCENE = {
    raf: 0,
    active: false,
    startAt: 0,
    payload: null,
    drops: [],
  };

  function stopSceneAnim() {
    SCENE.active = false;
    if (SCENE.raf) cancelAnimationFrame(SCENE.raf);
    SCENE.raf = 0;
  }

  function fitSceneCanvas() {
    const rect = sceneCanvas.getBoundingClientRect();
    const w = Math.max(10, rect.width);
    const h = Math.max(10, rect.height);
    sceneCanvas.width = Math.floor(w * DPR);
    sceneCanvas.height = Math.floor(h * DPR);
  }

  function initRain() {
    const W = sceneCanvas.width;
    const H = sceneCanvas.height;
    const n = Math.floor((W * H) / (90_000)) * 60 + 70; // 화면 크기에 따라 대충
    SCENE.drops = new Array(n).fill(0).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
      v: 340 + Math.random() * 420,
      l: 12 + Math.random() * 18,
    }));
  }

  function colorHex(colorIdx) {
    // 캐릭터 팔레트(간단)
    return ['#58a6ff', '#58e58c', '#ff76c8', '#ffd24a'][colorIdx % 4];
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(x, y, w, h, rr);
      return;
    }
    // fallback
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawBunny(x, y, scale, colorIdx, t, mood) {
    // 몸통(토끼옷) + 얼굴(밝은 톤) + 귀 살랑
    const c = colorHex(colorIdx);
    const ear = Math.sin(t * 0.004) * (mood === 'teacher' ? 0.06 : 0.13);
    const W = 28 * scale;
    const H = 34 * scale;

    // 그림자
    sceneCtx.save();
    sceneCtx.globalAlpha = 0.25;
    sceneCtx.fillStyle = '#000';
    sceneCtx.beginPath();
    sceneCtx.ellipse(x, y + H * 0.55, W * 0.36, H * 0.12, 0, 0, Math.PI * 2);
    sceneCtx.fill();
    sceneCtx.restore();

    // 귀(2개)
    function earOne(dx) {
      sceneCtx.save();
      sceneCtx.translate(x + dx * scale, y - H * 0.35);
      sceneCtx.rotate(ear * (dx < 0 ? 1 : -1));
      sceneCtx.fillStyle = c;
      roundRect(sceneCtx, -4 * scale, -18 * scale, 8 * scale, 22 * scale, 5 * scale);
      sceneCtx.fill();
      sceneCtx.globalAlpha = 0.25;
      sceneCtx.fillStyle = '#fff';
      roundRect(sceneCtx, -2 * scale, -15 * scale, 4 * scale, 16 * scale, 4 * scale);
      sceneCtx.fill();
      sceneCtx.restore();
    }
    earOne(-7);
    earOne(7);

    // 몸
    sceneCtx.fillStyle = c;
    roundRect(sceneCtx, x - W * 0.5, y - H * 0.2, W, H, 10 * scale);
    sceneCtx.fill();

    // 얼굴/배 패치
    sceneCtx.fillStyle = 'rgba(255,255,255,.85)';
    sceneCtx.beginPath();
    sceneCtx.ellipse(x, y - H * 0.08, W * 0.28, H * 0.22, 0, 0, Math.PI * 2);
    sceneCtx.fill();

    // 눈
    sceneCtx.fillStyle = '#172036';
    const eyeY = y - H * 0.12;
    sceneCtx.beginPath();
    sceneCtx.arc(x - W * 0.14, eyeY, 2.2 * scale, 0, Math.PI * 2);
    sceneCtx.arc(x + W * 0.14, eyeY, 2.2 * scale, 0, Math.PI * 2);
    sceneCtx.fill();

    // 볼터치
    sceneCtx.fillStyle = 'rgba(255,130,170,.45)';
    sceneCtx.beginPath();
    sceneCtx.ellipse(x - W * 0.22, y - H * 0.05, 3.5 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
    sceneCtx.ellipse(x + W * 0.22, y - H * 0.05, 3.5 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
    sceneCtx.fill();

    // 표정/효과
    if (mood === 'cry') {
      sceneCtx.fillStyle = 'rgba(125,211,252,.85)';
      for (let i = 0; i < 3; i++) {
        const ty = eyeY + (6 + i * 6) * scale + (Math.sin(t * 0.01 + i) * 2 * scale);
        sceneCtx.beginPath();
        sceneCtx.ellipse(x - W * 0.14, ty, 1.8 * scale, 3 * scale, 0, 0, Math.PI * 2);
        sceneCtx.fill();
      }
    }
  }

  function drawRain(dtMs) {
    const W = sceneCanvas.width;
    const H = sceneCanvas.height;

    // 하늘
    const g = sceneCtx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1020');
    g.addColorStop(0.55, '#0a1326');
    g.addColorStop(1, '#070a10');
    sceneCtx.fillStyle = g;
    sceneCtx.fillRect(0, 0, W, H);

    // 구름
    sceneCtx.fillStyle = 'rgba(255,255,255,.06)';
    sceneCtx.beginPath();
    sceneCtx.ellipse(W * 0.25, H * 0.22, W * 0.18, H * 0.10, 0, 0, Math.PI * 2);
    sceneCtx.ellipse(W * 0.52, H * 0.18, W * 0.22, H * 0.12, 0, 0, Math.PI * 2);
    sceneCtx.ellipse(W * 0.80, H * 0.24, W * 0.16, H * 0.10, 0, 0, Math.PI * 2);
    sceneCtx.fill();

    // 땅
    sceneCtx.fillStyle = '#070a10';
    sceneCtx.fillRect(0, H * 0.72, W, H * 0.28);
    sceneCtx.fillStyle = 'rgba(125,211,252,.10)';
    sceneCtx.fillRect(0, H * 0.74, W, H * 0.02);

    // 비
    sceneCtx.save();
    sceneCtx.strokeStyle = 'rgba(125,211,252,.35)';
    sceneCtx.lineWidth = Math.max(1, Math.floor(1 * DPR));
    const dt = dtMs / 1000;
    for (const d of SCENE.drops) {
      d.y += d.v * dt;
      d.x += 60 * dt;
      if (d.y > H + 30) { d.y = -30; d.x = Math.random() * W; }
      if (d.x > W + 30) d.x = -30;
      sceneCtx.beginPath();
      sceneCtx.moveTo(d.x, d.y);
      sceneCtx.lineTo(d.x - 10, d.y + d.l);
      sceneCtx.stroke();
    }
    sceneCtx.restore();

    // 빗물 물결
    sceneCtx.fillStyle = 'rgba(125,211,252,.10)';
    for (let i = 0; i < 7; i++) {
      const rx = (W * 0.12) + (i * W * 0.12) + (Math.sin((now() * 0.003) + i) * 10);
      const ry = H * 0.80 + (i % 2) * 10;
      sceneCtx.beginPath();
      sceneCtx.ellipse(rx, ry, 18, 4, 0, 0, Math.PI * 2);
      sceneCtx.fill();
    }
  }

  function startSceneAnim(payload) {
    stopSceneAnim();
    SCENE.payload = payload;
    SCENE.active = true;
    SCENE.startAt = now();
    fitSceneCanvas();
    initRain();

    let last = now();
    const loop = () => {
      if (!SCENE.active) return;
      const t = now();
      const dtMs = Math.min(60, t - last);
      last = t;

      // DPR 스케일
      sceneCtx.save();
      sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
      sceneCtx.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height);
      sceneCtx.restore();

      drawRain(dtMs);

      const W = sceneCanvas.width;
      const H = sceneCanvas.height;
      const p = payload?.ejected;

      if (payload?.kind === 'eject' && p) {
        const mood = p.isTeacher ? 'teacher' : 'cry';
        const wob = p.isTeacher ? 0 : Math.sin(t * 0.01) * 4;
        drawBunny(W * 0.5 + wob, H * 0.62, 2.4 * DPR, p.color ?? 0, t - SCENE.startAt, mood);

        // 말풍선
        const msg = p.isTeacher ? '칫!' : '으앙…';
        bubble(W * 0.5, H * 0.20, msg);
      } else {
        // 동점/아무도 추방X
        bubble(W * 0.5, H * 0.28, '…?');
      }

      SCENE.raf = requestAnimationFrame(loop);
    };
    SCENE.raf = requestAnimationFrame(loop);
  }

  function bubble(cx, cy, text) {
    const pad = 10 * DPR;
    sceneCtx.save();
    sceneCtx.font = `${Math.floor(14 * DPR)}px system-ui, sans-serif`;
    sceneCtx.textAlign = 'center';
    sceneCtx.textBaseline = 'middle';
    const tw = sceneCtx.measureText(text).width;
    const w = tw + pad * 2;
    const h = 28 * DPR;
    sceneCtx.fillStyle = 'rgba(18,26,46,.85)';
    sceneCtx.strokeStyle = 'rgba(255,255,255,.12)';
    sceneCtx.lineWidth = Math.max(1, Math.floor(1 * DPR));
    roundRect(sceneCtx, cx - w / 2, cy - h / 2, w, h, 12 * DPR);
    sceneCtx.fill();
    sceneCtx.stroke();
    sceneCtx.fillStyle = '#f4f7ff';
    sceneCtx.fillText(text, cx, cy + 1 * DPR);
    sceneCtx.restore();
  }

  function openScene(payloadOrTitle, textMaybe) {
    const payload = (typeof payloadOrTitle === 'object' && payloadOrTitle) ? payloadOrTitle : { kind: 'text', title: payloadOrTitle, text: textMaybe };
    sceneTitle.textContent = payload.title || '비 내리는 바깥...';
    sceneText.textContent = payload.text || '';
    sceneModal.classList.add('show');
    // 모달이 뜬 뒤 실제 레이아웃 크기를 재서 캔버스 맞추기
    requestAnimationFrame(() => startSceneAnim(payload));
  }

  function closeScene() {
    stopSceneAnim();
    sceneModal.classList.remove('show');
  }

  sceneOk.addEventListener('click', () => {
    closeScene();
    // 호스트가 play로 복귀시키면 자동 반영
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  // ---------- Input ----------
  function canvasPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left);
    const y = (ev.clientY - rect.top);
    return { x, y };
  }

  function setMoveFromPointer(px, py) {
    const st = G.state;
    const me = st.players[G.net?.myPlayerId];
    if (!me) return;

    // 화면좌표 -> 월드좌표
    const cam = getCamera(me);
    const wx = cam.x + px;
    const wy = cam.y + py;
    const dx = wx - me.x;
    const dy = wy - me.y;
    const d = Math.hypot(dx, dy) || 1;
    G.local.mvx = dx / d;
    G.local.mvy = dy / d;
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (isMobile) return; // 모바일은 조이스틱
    if (G.phase !== 'play') return;
    G.local.mouseDown = true;
    const p = canvasPoint(ev);
    setMoveFromPointer(p.x, p.y);
  });

  window.addEventListener('pointermove', (ev) => {
    if (isMobile) return;
    if (!G.local.mouseDown) return;
    if (G.phase !== 'play') return;
    const p = canvasPoint(ev);
    setMoveFromPointer(p.x, p.y);
  });

  window.addEventListener('pointerup', () => {
    if (isMobile) return;
    G.local.mouseDown = false;
    G.local.mvx = 0;
    G.local.mvy = 0;
  });

  // mobile joystick
  function joyCenter() {
    const r = joy.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rad: r.width / 2 };
  }

  window.addEventListener('pointerdown', (ev) => {
    if (!isMobile) return;
    if (G.phase !== 'play') return;
    const jc = joyCenter();
    const d = Math.hypot(ev.clientX - jc.cx, ev.clientY - jc.cy);
    if (d <= jc.rad * 1.3) {
      G.local.joy.active = true;
      G.local.joy.id = ev.pointerId;
      G.local.joy.cx = jc.cx;
      G.local.joy.cy = jc.cy;
      updateJoy(ev.clientX, ev.clientY);
    }
  });

  window.addEventListener('pointermove', (ev) => {
    if (!isMobile) return;
    if (!G.local.joy.active || ev.pointerId !== G.local.joy.id) return;
    updateJoy(ev.clientX, ev.clientY);
  });

  window.addEventListener('pointerup', (ev) => {
    if (!isMobile) return;
    if (ev.pointerId !== G.local.joy.id) return;
    G.local.joy.active = false;
    G.local.joy.id = null;
    G.local.mvx = 0;
    G.local.mvy = 0;
    joyKnob.style.transform = 'translate(-50%, -50%)';
  });

  function updateJoy(x, y) {
    const jc = joyCenter();
    const dx = x - jc.cx;
    const dy = y - jc.cy;
    const max = jc.rad * 0.75;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (dx / len) * Math.min(max, len);
    const ny = (dy / len) * Math.min(max, len);
    joyKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    const mvLen = Math.hypot(nx, ny) || 1;
    G.local.mvx = nx / mvLen;
    G.local.mvy = ny / mvLen;
    if (Math.hypot(nx, ny) < 6) {
      G.local.mvx = 0;
      G.local.mvy = 0;
    }
  }

  interactBtn.addEventListener('click', () => {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    G.net.post({ t: 'act', playerId: G.net.myPlayerId, kind: 'interact' });
  });

  killBtn.addEventListener('click', () => {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    G.net.post({ t: 'act', playerId: G.net.myPlayerId, kind: 'kill' });
  });

  function sendSabotage() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    G.net.post({ t: 'act', playerId: G.net.myPlayerId, kind: 'sabotage' });
  }

  function sendForceMission() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    G.net.post({ t: 'act', playerId: G.net.myPlayerId, kind: 'forceMission' });
  }

  saboBtn?.addEventListener('click', () => sendSabotage());
  saboBtnTouch?.addEventListener('click', () => sendSabotage());
  forceBtn?.addEventListener('click', () => sendForceMission());
  forceBtnTouch?.addEventListener('click', () => sendForceMission());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'q' || e.key === 'Q') sendSabotage();
    if (e.key === 'f' || e.key === 'F') sendForceMission();
  });

  // ---------- Rendering ----------
  function getCamera(me) {
    const W = AS.map.width * TS;
    const H = AS.map.height * TS;
    const vw = viewW;
    const vh = viewH;
    const x = clamp(me.x - vw / 2, 0, Math.max(0, W - vw));
    const y = clamp(me.y - vh / 2, 0, Math.max(0, H - vh));
    return { x, y };
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);

    if (!AS.map || !mapCanvas) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = 'bold 16px system-ui';
      ctx.fillText('로딩 중...', 20, 30);
      return;
    }

    const st = G.state;
    const me = st.players[G.net?.myPlayerId] || Object.values(st.players)[0];
    let cam = me ? getCamera(me) : { x: 0, y: 0 };

    // time warning shake (10초 이하)
    if (G.phase === 'play' && st.timeLeft > 0 && st.timeLeft <= 10) {
      const amp = (1 - st.timeLeft / 10) * 3.0;
      cam = {
        x: cam.x + Math.sin(now() * 0.07) * amp,
        y: cam.y + Math.cos(now() * 0.09) * amp * 0.8,
      };
    }

    // map
    ctx.drawImage(mapCanvas, cam.x, cam.y, viewW, viewH, 0, 0, viewW, viewH);

    // locked room big overlay (add-penalty)
    drawLockedRoomOverlay(cam, st);

    // room name pill
    if (roomPill && roomText && me) {
      const rr = roomAtPixel(me.x, me.y);
      if (rr) {
        roomPill.style.display = 'flex';
        roomText.textContent = `📍 ${rr.name}`;
      } else {
        roomPill.style.display = 'none';
      }
    }

    // water blocks (길 막힘)
    for (const wb of Object.values(st.waterBlocks)) {
      const tiles = (wb && Array.isArray(wb.tiles) && wb.tiles.length) ? wb.tiles : [{ x: wb.x, y: wb.y }];
      for (const tt of tiles) {
        const x = (tt.x + 0.5) * TS - cam.x;
        const y = (tt.y + 0.5) * TS - cam.y;
        drawWaterBlock(x, y, wb);
      }
    }

    // leaks (미션 실패 누수 흔적: 길은 안 막힘)
    for (const lk of Object.values(st.leaks || {})) {
      const x = (lk.x + 0.5) * TS - cam.x;
      const y = (lk.y + 0.5) * TS - cam.y;
      drawLeakSpot(x, y, lk);
    }


    // objects: doors + missions + bell + vent
    for (const obj of Object.values(st.objects)) {
      const x = (obj.x + 0.5) * TS - cam.x;
      const y = (obj.y + 0.5) * TS - cam.y;

      if (obj.type === 'root_door') {
        const d = st.doors[obj.id];
        const blocked = !!waterAtTile(obj.x, obj.y);
        drawDoor(x, y, d?.closed, blocked, obj.id);
        if (st.lockedRoomId && st.lockedRoomUntil && now() < st.lockedRoomUntil && obj.roomId === st.lockedRoomId) {
          drawLockedDoorOverlay(x, y, st.lockedRoomUntil - now());
        }
      } else if (obj.type === 'mission') {
        const m = st.missions[obj.id];
        drawMissionSpot(x, y, m);
      } else if (obj.type === 'meeting_bell') {
        drawObjSprite('meeting_bell', x, y);
      } else if (obj.type === 'admin_board') {
        drawObjSprite('admin_board', x, y);
      } else if (obj.type === 'camera_monitor') {
        drawObjSprite('camera_monitor', x, y);
      } else if (obj.type === 'vent_hole') {
        drawObjSprite('vent_hole', x, y);
      }
    }

    // 1회성 효과(파티클/뽁/땅굴)
    drawFx(cam);

    // players
    const players = Object.values(st.players)
      .slice()
      .sort((a, b) => (a.y - b.y));

    for (const p of players) {
      if (!p.alive) continue;
      const px = p.x - cam.x;
      const py = p.y - cam.y;
      drawPlayer(p, px, py);
    }

    // UI hints
    if (G.phase === 'play' && me) {
      const near = nearestHint(me);
      const canI = near.canInteract;
      interactBtn.style.display = canI ? 'flex' : 'none';
      interactBtn.classList.toggle('ready', canI);

      const showKill = (me.role === 'teacher') && near.canKill && !st.practice;
      killBtn.style.display = showKill ? 'flex' : 'none';
      killBtn.classList.toggle('ready', showKill);

      // 방 잠금(덧셈 페널티) 힌트
      if (st.lockedRoomUntil && now() < st.lockedRoomUntil) {
        ctx.fillStyle = 'rgba(255,90,122,.10)';
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '900 16px system-ui';
        const sLeft = Math.ceil((st.lockedRoomUntil - now()) / 1000);
        ctx.fillText(`방 잠김! (${sLeft}s)`, 18, 36);
      }

      // 미션 잠금 힌트
      if (now() < G.host.missionDisabledUntil) {
        ctx.fillStyle = 'rgba(255,90,122,.20)';
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '900 18px system-ui';
        ctx.fillText('미션 잠김!', 18, 36);
      }

      // 위치 공개
      if (now() < G.host.revealUntil) {
        ctx.fillStyle = 'rgba(125,211,252,.12)';
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '900 14px system-ui';
        ctx.fillText('모든 토끼 위치가 공개됨!', 18, 58);
      }

      // 전역 경보(규칙찾기 오답 등)
      if (now() < (G.host.alarmUntil || 0)) {
        if (!G.ui._alarmBeepedUntil) G.ui._alarmBeepedUntil = 0;
        if (G.ui._alarmBeepedUntil < (G.host.alarmUntil || 0)) {
          G.ui._alarmBeepedUntil = (G.host.alarmUntil || 0);
          playBeep(660, 0.08);
          tryVibrate([60, 40, 60]);
        }
        ctx.fillStyle = 'rgba(255,90,122,.10)';
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.font = '900 16px system-ui';
        ctx.fillText(G.host.alarmText || '경보!', 18, 80);
      }

      // 개인 페널티: 시야 감소(뺄셈)
      if (me.darkUntil && now() < me.darkUntil) {
        const rem = me.darkUntil - now();
        const p = clamp(rem / 8000, 0, 1);
        const g = ctx.createRadialGradient(viewW * 0.5, viewH * 0.5, 60, viewW * 0.5, viewH * 0.5, Math.max(viewW, viewH) * 0.65);
        g.addColorStop(0, `rgba(0,0,0,${0.0})`);
        g.addColorStop(0.35, `rgba(0,0,0,${0.18 + (1-p)*0.18})`);
        g.addColorStop(1, `rgba(0,0,0,${0.78})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '900 14px system-ui';
        ctx.fillText('시야 감소!', 18, 102);
      }

      // 개인 페널티: 조작 반전(단위변환)
      if (me.invertUntil && now() < me.invertUntil) {
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '900 14px system-ui';
        const s = Math.ceil((me.invertUntil - now()) / 1000);
        ctx.fillText(`방향 반전! (${s}s)`, 18, 124);
      }

      // 시간 경고: 30초 이하 비네트(테두리 경고)
      if (G.phase === 'play' && st.timeLeft > 0 && st.timeLeft <= 30) {
        const k = clamp((30 - st.timeLeft) / 30, 0, 1);
        const g2 = ctx.createRadialGradient(viewW * 0.5, viewH * 0.5, 80, viewW * 0.5, viewH * 0.5, Math.max(viewW, viewH) * 0.7);
        g2.addColorStop(0, 'rgba(0,0,0,0)');
        g2.addColorStop(0.55, `rgba(255,90,122,${0.05 + k * 0.08})`);
        g2.addColorStop(1, `rgba(255,90,122,${0.12 + k * 0.18})`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, viewW, viewH);
      }

    }

    // end overlay
    if (G.phase === 'end' && st.winner) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = '900 28px system-ui';
      const msg = st.winner === 'crew' ? '수학토끼 승리!' : '선생토끼 승리!';
      ctx.fillText(msg, 18, 48);
      ctx.font = '800 14px system-ui';
      ctx.fillText('새로고침하면 다시 시작할 수 있어요.', 18, 74);
    }
  }

  function drawMiniMap(x, y) {
    // "곱셈 패널티: 위치 공개" 시 잠깐 뜨는 간단 미니맵
    const st = G.state;
    if (!AS.map) return;

    const worldW = AS.map.width * TS;
    const worldH = AS.map.height * TS;
    const w = 150;
    const h = 110;
    const sx = w / worldW;
    const sy = h / worldH;
    const s = Math.min(sx, sy);

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(18,26,46,.70)';
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();
    ctx.stroke();

    // 점들
    const meId = G.net?.myPlayerId;
    for (const p of Object.values(st.players)) {
      if (!p.alive) continue;
      const px = Math.round(p.x * s);
      const py = Math.round(p.y * s);

      // 내 위치는 흰 테두리
      const isMe = (p.id === meId);
      ctx.fillStyle = 'rgba(125,211,252,.95)';
      if (p.id === st.teacherId) ctx.fillStyle = 'rgba(255,90,122,.95)';

      ctx.beginPath();
      ctx.arc(8 + px, 8 + py, isMe ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (isMe) {
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(244,247,255,.85)';
    ctx.font = '900 11px system-ui';
    ctx.fillText('미니맵', 10, h - 10);

    ctx.restore();
  }


  function renderMapUI() {
    if (!G.ui.mapOpen || !mapUiCanvas || !mapUiCtx) return;
    if (!AS.map || !mapCanvas) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cw = mapUiCanvas.clientWidth || 520;
    const ch = mapUiCanvas.clientHeight || 420;
    const w = Math.max(200, Math.floor(cw));
    const h = Math.max(200, Math.floor(ch));
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (mapUiCanvas.width !== bw || mapUiCanvas.height !== bh) {
      mapUiCanvas.width = bw;
      mapUiCanvas.height = bh;
    }

    mapUiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mapUiCtx.clearRect(0, 0, w, h);

    // panel bg
    mapUiCtx.fillStyle = 'rgba(18,26,46,.70)';
    mapUiCtx.strokeStyle = 'rgba(255,255,255,.18)';
    mapUiCtx.lineWidth = 2;
    mapUiCtx.beginPath();
    mapUiCtx.roundRect(0, 0, w, h, 14);
    mapUiCtx.fill();
    mapUiCtx.stroke();

    const worldW = AS.map.width * TS;
    const worldH = AS.map.height * TS;
    const pad = 10;
    const s2 = Math.min((w - pad*2) / worldW, (h - pad*2) / worldH);
    const ox = Math.floor(pad + (w - worldW * s2) / 2);
    const oy = Math.floor(pad + (h - worldH * s2) / 2);

    // map image
    mapUiCtx.save();
    mapUiCtx.imageSmoothingEnabled = false;
    mapUiCtx.drawImage(mapCanvas, 0, 0, worldW, worldH, ox, oy, worldW * s2, worldH * s2);
    mapUiCtx.restore();

    // mission markers
    const st = G.state;
    const missions = st.missions || {};
    for (const obj of Object.values(st.objects || {})) {
      if (obj.type !== 'mission') continue;
      const m = missions[obj.id];
      const mx = ox + (obj.x + 0.5) * TS * s2;
      const my = oy + (obj.y + 0.5) * TS * s2;

      let col = 'rgba(244,247,255,.25)';
      if (m?.state === 'active') col = 'rgba(125,211,252,.95)';
      if (m?.state === 'solved') col = 'rgba(255,152,84,.95)';

      mapUiCtx.fillStyle = col;
      mapUiCtx.strokeStyle = 'rgba(0,0,0,.35)';
      mapUiCtx.lineWidth = 2;
      mapUiCtx.beginPath();
      mapUiCtx.arc(mx, my, (m?.state === 'active') ? 6 : 5, 0, Math.PI * 2);
      mapUiCtx.fill();
      mapUiCtx.stroke();

      if (m?.state === 'active') {
        mapUiCtx.fillStyle = 'rgba(0,0,0,.75)';
        mapUiCtx.font = '900 10px system-ui';
        mapUiCtx.textAlign = 'center';
        mapUiCtx.textBaseline = 'middle';
        mapUiCtx.fillText('!', mx, my - 0.5);
      }
    }

    // my position
    const me = st.players[G.net?.myPlayerId] || null;
    if (me) {
      const px = ox + me.x * s2;
      const py = oy + me.y * s2;
      mapUiCtx.fillStyle = 'rgba(255,255,255,.90)';
      mapUiCtx.strokeStyle = 'rgba(0,0,0,.45)';
      mapUiCtx.lineWidth = 2;
      mapUiCtx.beginPath();
      mapUiCtx.arc(px, py, 5.5, 0, Math.PI * 2);
      mapUiCtx.fill();
      mapUiCtx.stroke();
    }
  }
  function drawObjSprite(typeKey, x, y) {
    const def = AS.objsMeta.objects?.[typeKey];
    if (!def) return;
    const cols = AS.objsMeta.columns;
    const sid = def.spriteId;
    const sx = (sid % cols) * TS;
    const sy = Math.floor(sid / cols) * TS;
    ctx.drawImage(AS.objsImg, sx, sy, TS, TS, x - TS / 2, y - TS / 2, TS, TS);
  }

  function drawLockedDoorOverlay(x, y, remMs) {
    const p = clamp(remMs / 10_000, 0, 1);
    const pulse = (Math.sin(now() * 0.02) * 0.5 + 0.5);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(255,90,122,${0.18 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.roundRect(-TS*0.62, -TS*0.58, TS*1.24, TS*1.16, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(10, 10);
    ctx.moveTo(10, -10);
    ctx.lineTo(-10, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawDoor(x, y, closed, blocked, seedKey) {
    // 뿌리 문(덩굴): 살짝 꿈틀 + 물막기면 물결
    const w = TS * 0.95;
    const h = TS * 0.9;
    const tNow = now();
    const seed = (strHash(seedKey || '') % 1000) * 0.01;
    const wig = Math.sin(tNow * 0.012 + seed * 7) * (closed ? 0.9 : 0.55);
    const sway = Math.sin(tNow * 0.006 + seed * 11) * (closed ? 0.35 : 0.22);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway * 0.05);

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';

    let fill = closed ? 'rgba(255,90,122,.22)' : 'rgba(102,224,163,.14)';
    if (blocked) fill = 'rgba(125,211,252,.18)';
    ctx.fillStyle = fill;

    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, 8);
    ctx.fill();
    ctx.stroke();

    // 뿌리 줄(살짝 꿈틀)
    ctx.strokeStyle = blocked ? 'rgba(125,211,252,.72)' : 'rgba(255,255,255,.6)';
    ctx.lineWidth = closed ? 5 : 2.5;

    const c1x = -8 + wig;
    const c1y = -6 - wig * 0.35;
    const c2x = 8 - wig;
    const c2y = 6 + wig * 0.28;

    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-w/2 + 6, -h/2 + 6 + i*3);
      ctx.bezierCurveTo(c1x, c1y + i*1.2, c2x, c2y - i*0.6, w/2 - 6, h/2 - 6 - i*2);
      ctx.stroke();
    }

    if (blocked) {
      const r = (Math.sin(tNow * 0.01 + seed * 3) * 0.5 + 0.5);
      ctx.strokeStyle = `rgba(255,255,255,${0.22 + r * 0.18})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 10, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawMissionSpot(x, y, m) {
    if (!m) return;
    ctx.save();
    ctx.translate(x, y);

    // 구멍
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (m.state === 'solved') {
      // 당근으로 막힘
      ctx.fillStyle = 'rgba(255,152,84,.9)';
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-5, -8, 10, 18, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(102,224,163,.85)';
      ctx.beginPath();
      ctx.ellipse(-6, -10, 6, 4, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(6, -10, 6, 4, 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 물 솟음
      const active = (m.state === 'active');
      const t = now() / 300;
      const amp = active ? 6 : 3;
      ctx.strokeStyle = (() => {
        const forced = !!(m.forceFailAt || m.forcedBy);
        if (forced) return active ? 'rgba(255,90,122,.95)' : 'rgba(255,90,122,.70)';
        return active ? 'rgba(125,211,252,.95)' : 'rgba(125,211,252,.70)';
      })();
      ctx.lineWidth = active ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.bezierCurveTo(-3, -8 - Math.sin(t)*amp, 3, -12 - Math.cos(t)*amp, 0, -18 - Math.sin(t*1.3)*amp);
      ctx.stroke();

      if (active) {
        // 느낌표
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.font = '900 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, -22);
      }
    }

    ctx.restore();
  }

  function drawFx(cam) {
    const tNow = now();
    // 오래된 효과 정리
    G.fx = G.fx.filter(f => tNow - (f.bornAt || tNow) < 1600);

    for (const f of G.fx) {
      if (f.kind === 'carrotPop') {
        const age = (tNow - f.bornAt) / 1000;
        const p = clamp(age / 0.9, 0, 1);
        const x = (f.x + 0.5) * TS - cam.x;
        const y = (f.y + 0.5) * TS - cam.y;

        ctx.save();
        ctx.translate(x, y - 10 * (1 - p));
        const a = 1 - p;
        // '뽁' 느낌 링
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 10, 6 + 18 * p, 3 + 10 * p, 0, 0, Math.PI * 2);
        ctx.stroke();
        // 작은 당근 조각
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const r = 6 + 26 * p;
          const px = Math.cos(ang) * r;
          const py = Math.sin(ang) * r * 0.55 - 8 * p;
          ctx.fillStyle = `rgba(255,152,84,${0.9 * a})`;
          ctx.beginPath();
          ctx.roundRect(px - 2, py - 2, 4, 4, 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (f.kind === 'vent') {
        const age = (tNow - f.bornAt) / 1000;
        const p = clamp(age / 0.7, 0, 1);
        for (const pt of [f.from, f.to]) {
          if (!pt) continue;
          const x = (pt.x + 0.5) * TS - cam.x;
          const y = (pt.y + 0.5) * TS - cam.y;
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = `rgba(165,120,78,${0.20 * (1 - p)})`;
          for (let i = 0; i < 7; i++) {
            const ang = (i/7) * Math.PI * 2;
            const r = 4 + 22 * p;
            ctx.beginPath();
            ctx.ellipse(Math.cos(ang)*r, Math.sin(ang)*r*0.55, 2.5, 1.8, 0, 0, Math.PI*2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }
  }

  function drawWaterBlock(x, y, wb) {
    const tNow = now();
    const born = wb?.bornAt || tNow;
    const p = clamp((tNow - born) / 450, 0, 1);
    const kind = wb?.kind || 'sabo';
    const a = 0.12 + 0.20 * p;

    ctx.save();
    ctx.translate(x, y);

    // 물이 차오르는 느낌(아래에서 위로)
    const h = (TS - 2) * p;
    ctx.fillStyle = `rgba(125,211,252,${a})`;
    ctx.beginPath();
    ctx.roundRect(-TS/2+1, (TS/2-1) - h, TS-2, h, 10);
    ctx.fill();

    // 테두리 + 잔물결
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-TS/2+1, -TS/2+1, TS-2, TS-2, 10);
    ctx.stroke();

    const wave = Math.sin((tNow * 0.008) + (x + y) * 0.03) * (2 + 1.5 * (1 - p));
    ctx.strokeStyle = 'rgba(125,211,252,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-TS/2+3, 2 + wave);
    ctx.quadraticCurveTo(0, -2 - wave, TS/2-3, 2 + wave);
    ctx.stroke();

    // 사보타주면 살짝 위험한 느낌(짧은 번쩍임)
    if (kind === 'sabo') {
      const flash = (Math.sin(tNow * 0.02) * 0.5 + 0.5) * 0.18;
      ctx.fillStyle = `rgba(255,255,255,${flash * (1 - p)})`;
      ctx.fillRect(-TS/2+2, -TS/2+2, TS-4, TS-4);
    }

    // 작은 물방울(등장 순간)
    if (p < 0.9) {
      const seed = (wb?.id ? strHash(wb.id) : 0) ^ ((x * 31 + y * 17) | 0);
      for (let i = 0; i < 3; i++) {
        const k = (seed + i * 97) | 0;
        const rx = ((k % 11) - 5) * 1.2;
        const ry = -8 - ((k >> 4) % 6) * 1.2 - (1 - p) * 6;
        ctx.fillStyle = 'rgba(125,211,252,.75)';
        ctx.beginPath();
        ctx.ellipse(rx, ry, 1.6, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }


  function drawLeakSpot(x, y, lk) {
    // 누수 흔적: 물막기(사보)처럼 충돌을 만들지 않고, 시각 효과만 표시
    const tNow = now();
    const born = lk?.bornAt || tNow;
    const life = Math.max(1, (lk?.until || (born + 45_000)) - born);
    const age = tNow - born;
    const fade = 1 - clamp(age / life, 0, 1);

    // drawWaterBlock 재사용 + 강제실패면 살짝 붉게
    const fake = { id: lk?.id || 'leak', bornAt: born, kind: (lk?.kind === 'forced' ? 'forced' : 'leak') };
    ctx.save();
    if (lk?.kind === 'forced') {
      ctx.globalAlpha = 0.95 * fade;
      drawWaterBlock(x, y, fake);
      ctx.fillStyle = `rgba(255,90,122,${0.12 * fade})`;
      ctx.beginPath();
      ctx.ellipse(x, y + 6, TS * 0.34, TS * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.90 * fade;
      drawWaterBlock(x, y, fake);
    }
    ctx.restore();
  }
  function drawCrown(x, y) {
    const t = now() * 0.004;
    const bob = Math.sin(t) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(255,215,90,.95)';
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-2, -2);
    ctx.lineTo(0, -12);
    ctx.lineTo(2, -2);
    ctx.lineTo(8, -10);
    ctx.lineTo(12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 작은 보석
    ctx.fillStyle = 'rgba(125,211,252,.95)';
    ctx.beginPath();
    ctx.arc(0, -6, 2.4, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawGlasses(x, y) {
    const t = now() * 0.01;
    const shine = (Math.sin(t) * 0.5 + 0.5) * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.lineWidth = 2;
    // 테두리
    ctx.beginPath();
    ctx.arc(-6, 0, 5, 0, Math.PI*2);
    ctx.arc(6, 0, 5, 0, Math.PI*2);
    ctx.moveTo(-1, 0);
    ctx.lineTo(1, 0);
    ctx.stroke();
    // 반짝
    ctx.fillStyle = `rgba(255,255,255,${0.10 + shine})`;
    ctx.beginPath();
    ctx.ellipse(-8, -2, 2.2, 1.2, -0.4, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -3, 2.4, 1.3, -0.4, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p, x, y) {
    // sprite + 귀(오버레이)
    const vt = p.vent;
    let restored = false;
    if (vt) {
      const tNow = now();
      const dur = Math.max(1, vt.end - vt.start);
      const p01 = clamp((tNow - vt.start) / dur, 0, 1);
      // 들어갈 때 사라졌다가, 나올 때 나타나는 느낌
      const alpha = p01 < 0.5 ? (1 - p01 * 2) : ((p01 - 0.5) * 2);
      ctx.save();
      restored = true;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      // 살짝 아래로 빨려 들어가는 느낌
      y += 10 * (p01 < 0.5 ? p01 * 2 : (1 - p01) * 2);
    }

    const inWaterTile = !!waterAtTile(Math.floor(p.x / TS), Math.floor(p.y / TS));
    const swimming = inWaterTile && p.role === 'teacher' && !p.down && !p.vent;
    if (swimming) {
      const stt = now() * 0.006 + (strHash(p.id) % 997);
      y += Math.sin(stt) * 2.2;
    }

    const row = COLORS[p.color % COLORS.length].row;
    const moving = Math.hypot(p.vx, p.vy) > 6;
    const t = now() / 120;
    const frame = moving ? (1 + (Math.floor(t) % 2)) : 0; // 0 idle, 1/2 walk

    const sx = frame * SPR_W;
    const sy = row * SPR_H;

    const scale = 2;
    ctx.drawImage(AS.charsImg, sx, sy, SPR_W, SPR_H,
      x - (SPR_W * scale) / 2, y - (SPR_H * scale) / 2, SPR_W * scale, SPR_H * scale);

    if (swimming) drawSwimOverlay(x, y);

    // 귀 살랑
    const sway = (moving ? 0.22 : 0.12) * Math.sin(t * 0.9) + 0.12 * (p.vx / 80);
    const twitch = (G.phase === 'meeting' && Math.sin(t * 0.4 + p.id) > 0.98) ? 0.5 : 0;
    drawEars(x, y - 20, sway + twitch);

    // 왕관(크루 전용)
    if (p.crown) drawCrown(x, y - 56);

    // 땡글 안경(선생토끼가 틀렸을 때)
    if (p.glassesUntil && now() < p.glassesUntil) drawGlasses(x, y - 10);

    // 상태(빵점/기절)
    if (p.down) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      ctx.ellipse(x, y + 18, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // 별 빙글(기절 모션)
      const tt = now() / 140;
      for (let i = 0; i < 3; i++) {
        const ang = tt + i * (Math.PI * 2 / 3);
        const rx = Math.cos(ang) * 10;
        const ry = -24 + Math.sin(ang) * 4;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255,90,122,.95)';
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('빵점', x, y - 30);
    }

    // 닉
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 4;
    ctx.font = '900 13px system-ui';
    ctx.textAlign = 'center';
    ctx.strokeText(p.nick, x, y - 36);
    ctx.fillText(p.nick, x, y - 36);

    // 선생토끼만 보이는 검은당근 쿨다운 힌트
    const me = G.state.players[G.net?.myPlayerId];
    if (me && me.id === p.id && p.role === 'teacher') {
      const cd = Math.max(0, Math.ceil((p.killCdUntil - now()) / 1000));
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(x - 18, y - 18, 36, 16);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '900 11px system-ui';
        ctx.fillText(`${cd}s`, x, y - 6);
      }
    }

    if (restored) ctx.restore();
  }

  function drawEars(x, y, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 2;

    const ear = (sx) => {
      ctx.save();
      ctx.translate(sx, 0);
      ctx.rotate(a * sx * 0.06);
      ctx.beginPath();
      ctx.roundRect(-5, -28, 10, 28, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    ear(-10);
    ear(10);

    ctx.restore();
  }

  function drawSwimOverlay(x, y) {
    const t = now() * 0.01;
    // 아래쪽에 물결이 몸을 덮는 느낌
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 20, y - 2, 40, 26);
    ctx.clip();

    ctx.fillStyle = 'rgba(125,211,252,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const yy = y + 6 + i * 6 + Math.sin(t + i) * 1.4;
      const ww = 18 - i * 3;
      ctx.beginPath();
      ctx.moveTo(x - ww, yy);
      ctx.quadraticCurveTo(x, yy - 4, x + ww, yy);
      ctx.stroke();
    }
    ctx.restore();

    // 작은 물방울/거품
    const a = 0.35 + 0.25 * (Math.sin(t * 1.7) * 0.5 + 0.5);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    for (let i = 0; i < 3; i++) {
      const rx = (Math.sin(t * 1.2 + i * 2.1) * 8);
      const ry = (Math.cos(t * 1.4 + i * 1.7) * 4);
      ctx.beginPath();
      ctx.ellipse(x + rx, y + 4 + i * 6 + ry, 1.5, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function nearestHint(me) {
    const st = G.state;
    let canInteract = false;
    let canKill = false;

    // interactable
    for (const obj of Object.values(st.objects)) {
      if (!['meeting_bell', 'mission', 'root_door', 'vent_hole'].includes(obj.type)) continue;
      if (obj.type === 'vent_hole' && me.role !== 'teacher') continue;
      if (obj.type === 'vent_hole' && st.practice) continue;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      if (dist2(me.x, me.y, ox, oy) <= INTERACT_RANGE ** 2) { canInteract = true; break; }
    }
    // bodies
    for (const p of Object.values(st.players)) {
      if (p.down && p.alive) {
        if (dist2(me.x, me.y, p.x, p.y) <= (INTERACT_RANGE + 10) ** 2) { canInteract = true; break; }
      }
    }

    // kill hint
    if (me.role === 'teacher' && now() >= me.killCdUntil) {
      for (const p of Object.values(st.players)) {
        if (!p.alive || p.down) continue;
        if (p.id === me.id) continue;
        if (dist2(me.x, me.y, p.x, p.y) <= KILL_RANGE ** 2) { canKill = true; break; }
      }
    }

    return { canInteract, canKill };
  }

  // ---------- Main loop ----------
  let lastFrame = now();
  function frame() {
    const t = now();
    const dt = Math.min(0.05, (t - lastFrame) / 1000);
    lastFrame = t;

    // host sim
    if (G.net?.isHost && G.host.started) {
      if (G.phase === 'meeting' && now() >= G.host.meetingEndsAt) {
        hostResolveMeeting();
        // scene 유지 3초 후 play
        setTimeout(() => {
          if (G.net?.isHost && G.phase === 'scene') {
            G.phase = 'play';
            broadcastState(true);
          }
        }, 3000);
      }
      if (G.phase === 'scene') {
        // 유지
      } else if (G.phase === 'play') {
        hostTick(dt);
      }
      // 스냅샷
      if (!G.host._lastBroadcast) G.host._lastBroadcast = 0;
      if (t - G.host._lastBroadcast > 100) {
        G.host._lastBroadcast = t;
        broadcastState();
      }
    }

    // client input send
    if (G.net && G.phase === 'play') {
      if (!G.local._lastInputAt) G.local._lastInputAt = 0;
      if (t - G.local._lastInputAt > 66) {
        G.local._lastInputAt = t;
        G.net.post({ t: 'input', playerId: G.net.myPlayerId, mvx: G.local.mvx, mvy: G.local.mvy });
      }
    }

    // graph penalty: reopen mission UI after lock ends (if player stayed near)
    if (G.ui.reopenMission && !G.ui.mission && G.net && G.net.myPlayerId) {
      const rm = G.ui.reopenMission;
      if (now() >= rm.at && now() >= (G.host.missionDisabledUntil || 0)) {
        const st = G.state;
        const me = st.players[G.net.myPlayerId];
        const obj = st.objects && st.objects[rm.siteId];
        if (me && obj && obj.type === 'mission') {
          const ox = (obj.x + 0.5) * TS;
          const oy = (obj.y + 0.5) * TS;
          if (dist2(me.x, me.y, ox, oy) <= INTERACT_RANGE ** 2) {
            G.net.post({ t: 'openMission', playerId: G.net.myPlayerId, siteId: rm.siteId });
          }
        }
        // attempt only once
        G.ui.reopenMission = null;
      }
    }

    // UI
    setHUD();

    draw();
    renderMapUI();
    requestAnimationFrame(frame);
  }

  // ---------- Join flow ----------
  async function joinRoom() {
    if (!G.assetsReady) { showToast('에셋 로딩이 필요해요'); applyPhaseUI(); return; }
    const nick = (nickEl.value || '토끼').trim().slice(0, 10);
    const room = (roomEl.value || '1234').trim().slice(0, 8);

    const wsBase = (window.__ONLINE_WS_BASE__ || '').trim();
    let net;
    if (window.__USE_BRIDGE_NET__){
      net = new BridgeNet(room, window.__EMBED_SESSION_ID__ || "", !!window.__EMBED_IS_HOST__);
    } else if (wsBase){
      net = new WSNet(room, wsBase);
    } else {
      net = new LocalNet(room);
    }
    G.net = net;

    // host discovery
    net.on('host', (m) => {
      net.hostId = m.hostId;
    });

    net.on('discover', (m) => {
      if (net.isHost) net.post({ t: 'host', hostId: net.hostId, at: Date.now() });
    });

    // join
    net.on('join', (m) => {
      if (!net.isHost) return;
      const st = G.state;
      const playersCount = Object.values(st.players).filter(p => !p.isBot).length;
      if (playersCount >= 8) {
        net.post({ t: 'joinDenied', toClient: m.from, reason: '방이 가득 찼어!' });
        return;
      }
      const pid = hostAddPlayer(m.nick || '토끼', false);
      // clientId -> playerId 매핑
      if (!G.host._clientToPlayer) G.host._clientToPlayer = new Map();
      G.host._clientToPlayer.set(m.from, pid);
      net.post({ t: 'joinAck', toClient: m.from, playerId: pid, isHost: false });
      broadcastState(true);
    });

    net.on('joinAck', (m) => {
      if (m.toClient !== net.clientId) return;
      net.myPlayerId = m.playerId;
      G.phase = 'lobby';
      setRolePill();
      setHUD();
      applyPhaseUI();
      if (net.isHost) {
        startBtn.disabled = false;
        startBtn.textContent = '게임 시작 (호스트)';
      }
    });

    net.on('joinDenied', (m) => {
      if (m.toClient !== net.clientId) return;
      showToast(m.reason || '참가 실패');
      net.close();
      G.net = null;
    });

    // inputs (host)
    net.on('input', (m) => {
      if (!net.isHost) return;
      if (!m.playerId) return;
      G.host.inputs.set(m.playerId, { mvx: clamp(m.mvx || 0, -1, 1), mvy: clamp(m.mvy || 0, -1, 1) });
    });

    net.on('act', (m) => {
      if (!net.isHost) return;
      if (m.kind === 'interact') hostHandleInteract(m.playerId);
      if (m.kind === 'kill') hostHandleKill(m.playerId);
      if (m.kind === 'sabotage') hostHandleSabotage(m.playerId);
      if (m.kind === 'forceMission') hostHandleForceMission(m.playerId);
    });
    net.on('openMission', (m) => {
      if (!net.isHost) return;
      const st = G.state;
      const p = st.players[m.playerId];
      if (!p || !p.alive || p.down) return;
      const obj = st.objects[m.siteId];
      if (!obj || obj.type !== 'mission') return;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      if (dist2(p.x, p.y, ox, oy) > INTERACT_RANGE ** 2) return;

      // reuse the same logic as interact-mission block
      if (now() < G.host.missionDisabledUntil) {
        sendToPlayer(m.playerId, { t: 'toast', text: '지금은 미션을 풀 수 없어!' });
        return;
      }
      const mm = st.missions[obj.id];
      if (!mm || mm.state === 'solved') {
        sendToPlayer(m.playerId, { t: 'toast', text: '이미 당근으로 막았어!' });
        return;
      }
      const practice = mm.state !== 'active';
      const ui = buildMissionUI(obj.id, mm.kind, practice);
      let prog = hostGetMissionProg(m.playerId, obj.id);
      if (!prog || prog.practice !== !!practice) {
        hostInitMissionProg(m.playerId, obj.id, mm.kind, practice);
        prog = hostGetMissionProg(m.playerId, obj.id);
      }
      sendToPlayer(m.playerId, { t: 'uiMissionOpen', ...ui, correct: prog?.correct || 0 });
    });


    net.on('missionSubmit', (m) => {
      if (!net.isHost) return;
      hostMissionSubmit(m.playerId, m);
    });

    net.on('vote', (m) => {
      if (!net.isHost) return;
      hostSubmitVote(m.playerId, m.target);
    });

    // state (all clients)
    net.on('state', (m) => {
      // client에선 state를 그대로 반영
      if (net.isHost) {
        // 호스트도 UI 반영을 위해 받아도 됨
      }
      G.phase = m.phase;
      G.state.timeLeft = m.timeLeft;
      G.state.maxTime = m.maxTime;
      G.state.solved = m.solved;
      G.state.total = m.total;
      G.state.practice = !!m.practice;
      G.state.players = m.players;
      G.state.missions = m.missions;
      G.state.doors = m.doors;
      G.state.waterBlocks = m.waterBlocks;
      G.state.leaks = m.leaks || {};
      G.state.leakLevel = m.leakLevel || 0;
      G.state.lockedRoomId = m.lockedRoomId || null;
      G.state.lockedRoomUntil = m.lockedRoomUntil || 0;
      G.state.teacherId = m.teacherId;
      G.state.winner = m.winner;
      G.host.meetingEndsAt = m.host?.meetingEndsAt || 0;
      G.host.revealUntil = m.host?.revealUntil || 0;
      G.host.missionDisabledUntil = m.host?.missionDisabledUntil || 0;
      G.host.alarmUntil = m.host?.alarmUntil || 0;
      G.host.alarmText = m.host?.alarmText || '';

      // 내 role 업데이트
      setRolePill();

      if (G.phase === 'play') {
        meetingModal.classList.remove('show');
        sceneModal.classList.remove('show');
        stopSceneAnim();
      }

      if (G.phase === 'end' && G.state.winner) {
        // end
      }

      // 호스트 권한 UI
      startBtn.disabled = !(net.isHost && Object.keys(G.state.players).length >= 1 && !G.host.started);
      if (net.isHost && !G.host.started) {
        const n = Object.keys(G.state.players).length;
        startBtn.textContent = n >= 4 ? '게임 시작 (호스트)' : `연습 시작 (현재 ${n}명)`;
      }
      applyPhaseUI();
    });

    // UI events
    net.on('uiMissionOpen', (m) => {
      if (m.to && m.to !== net.myPlayerId) return;
      openMissionUI(m);
    });

    net.on('uiMissionResult', (m) => {
      if (m.to && m.to !== net.myPlayerId) return;
      if (!G.ui.mission) return;
      renderQuestion(m.text);
    });

    net.on('uiMissionNext', (m) => {
      if (m.to && m.to !== net.myPlayerId) return;
      if (!G.ui.mission) return;
      if (typeof m.correct === 'number') G.ui.mission.correct = m.correct;
      G.ui.mission.question = m.question;
      renderQuestion();
    });

    net.on('uiForceCloseMission', (m) => {
      // 그래프 페널티: 7초 동안 미션 닫힘
      if (G.ui.mission) {
        // 열려있던 미션은 잠금 해제 후 자동으로 다시 띄워주기
        G.ui.reopenMission = { siteId: G.ui.mission.siteId, at: now() + (m.ms || 7000) };
        closeMissionUI();
      }
      showToast('미션이 잠겼어!');
    });

    net.on('uiMeetingOpen', (m) => {
      openMeetingUI(m.kind || 'emergency', m.reason || '회의!', m.endsAt || (now() + 20_000));
    });

    net.on('uiScene', (m) => {
      closeMeetingUI();
      closeMissionUI();
      openScene(m);
    });

    net.on('toast', (m) => {
      if (m.to && m.to !== net.myPlayerId) return;
      showToast(m.text || '');
    });

    net.on('fx', (m) => {
      // 간단 파티클/연출 (상태 스냅샷에 넣지 않는 1회성 효과)
      if (m.kind === 'carrotPop') {
        G.fx.push({ kind: 'carrotPop', x: m.x, y: m.y, bornAt: m.bornAt || now() });
      } else if (m.kind === 'vent') {
        G.fx.push({ kind: 'vent', from: m.from, to: m.to, bornAt: m.bornAt || now() });
      }
    });

    // discovery
    await net.discoverHost();

    // host 초기화
    if (net.isHost) {
      hostInitFromMap();
      // 호스트 자신도 플레이어로 추가
      const pid = hostAddPlayer(nick, false);
      net.myPlayerId = pid;
      G.phase = 'lobby';
      setRolePill();
      setHUD();
      setLobbyStatus('대기실: 플레이어를 추가하고 시작하세요. (4명 미만이면 연습 모드)', null);
      broadcastState(true);
      applyPhaseUI();
    } else {
      // join 요청
      net.post({ t: 'join', nick, clientId: net.clientId });
    }
  }

  joinBtn.addEventListener('click', () => {
    if (G.net) return;
    joinRoom().catch(e => {
      console.error(e);
      showToast('참가 실패');
    });
  });

  addBotBtn.addEventListener('click', async () => {
    if (!G.assetsReady) { showToast('에셋 로딩이 필요해요'); return; }
    if (!G.net) {
      try { await joinRoom(); } catch (_) { return; }
    }
    if (!G.net?.isHost) return;
    const st = G.state;
    const current = Object.values(st.players).length;
    if (current >= 8) return;
    hostAddPlayer('봇' + (current + 1), true);
    broadcastState(true);
    applyPhaseUI();
  });

  startBtn.addEventListener('click', async () => {
    if (!G.assetsReady) { showToast('에셋 로딩이 필요해요'); return; }
    if (!G.net) {
      try { await joinRoom(); } catch (_) { return; }
    }
    if (!G.net?.isHost) return;
    if (G.host.started) return;
    G.phase = 'play';
    const n = Object.values(G.state.players).length;
    const practice = n < 4;
    hostStartGame(practice);
    broadcast({ t: 'toast', text: practice ? '연습 모드 시작! (선생토끼 없음)' : '게임 시작!' });
    applyPhaseUI();
  });



  // ---------- Embed bridge (multiroom) ----------
  async function startEmbedded(init){
    if (!init || !init.roomCode) return;
    if (G.net) return;

    // wait assets (they load asynchronously)
    const until = Date.now() + 8000;
    while(!G.assetsReady && !G.assetsError && Date.now() < until){
      await new Promise(r => setTimeout(r, 50));
    }

    window.__USE_BRIDGE_NET__ = true;
    window.__EMBED_SESSION_ID__ = String(init.sessionId || '');
    window.__EMBED_IS_HOST__ = !!init.isHost;

    try{ nickEl.value = String(init.nick || nickEl.value || '토끼').slice(0,10); }catch(_){ }
    try{ roomEl.value = String(init.roomCode || roomEl.value || '1234').slice(0,8); }catch(_){ }

    // hide local lobby controls (room UI is handled by parent)
    try{ joinBtn.style.display = 'none'; }catch(_){ }
    try{ addBotBtn.style.display = 'none'; }catch(_){ }
    // keep startBtn for programmatic click

    await joinRoom();

    // host: auto start immediately (practice if <4 players)
    if (window.__EMBED_IS_HOST__){
      setTimeout(()=>{ try{ startBtn.click(); }catch(_){ } }, 300);
    }
  }

  if (EMBED){
    // Tell parent we're ready for bridge_init
    bridgeSend('bridge_ready', {});
    window.addEventListener('message', (ev)=>{
      const d = ev.data || {};
      if (!d || typeof d !== 'object') return;
      if (d.type === 'bridge_init'){
        startEmbedded(d).catch(()=>{});
      }
    });
  }

  // ---------- Boot ----------
  (async () => {
    hud.style.display = 'none';
    try {
      await loadAssets();
      buildCollision();
      buildMapPrerender();
      hostInitFromMap();
      G.assetsReady = true;
      setLobbyStatus('', null);
    } catch (e) {
      console.error(e);
      G.assetsReady = false;
      G.assetsError = e?.message || String(e);
      const isFile = (location && location.protocol === 'file:');
      const msg = isFile
        ? '에셋을 불러오지 못했어. 더블클릭(file://) 실행은 막혀있어서 로컬 서버로 열어야 해요.\n예) 터미널에서 이 폴더로 이동 후:  python -m http.server 8000  →  http://localhost:8000'
        : '에셋을 불러오지 못했어. 새로고침하거나 로컬 서버에서 실행해줘!';
      setLobbyStatus(msg, 'danger');
      showToast('에셋 로딩 실패');
    }
    applyPhaseUI();
    // roundRect polyfill for older
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        const rr = Array.isArray(r) ? r : [r, r, r, r];
        const [r1, r2, r3, r4] = rr;
        this.beginPath();
        this.moveTo(x + r1, y);
        this.lineTo(x + w - r2, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r2);
        this.lineTo(x + w, y + h - r3);
        this.quadraticCurveTo(x + w, y + h, x + w - r3, y + h);
        this.lineTo(x + r4, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r4);
        this.lineTo(x, y + r1);
        this.quadraticCurveTo(x, y, x + r1, y);
        this.closePath();
        return this;
      };
    }

    requestAnimationFrame(frame);
  })();
})();
