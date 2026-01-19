
  // Fullscreen game mode (hide chat/side panels while playing)
  function enterGameFullscreen(){
    // entering gameplay should always use the real room phase
    forceLobbyUI = false;
    try{ document.body.classList.add("in-game"); }catch(_){}
    // Stop room BGM while the embedded game is running (games may have their own audio)
    try{ window.__bgmBattleHandle?.stop?.(); }catch(_){}
    try{ const el = document.getElementById('bgmBattle'); if (el) el.pause(); }catch(_){}
    try{
      // ensure duel UI/frame is visible
      duel.ui?.duelUI?.classList.remove("hidden");
      duel.ui?.duelFrameWrap?.classList.remove("hidden");
      duel.ui?.duelSpectate?.classList.add("hidden");
    }catch(_){}
    try{ window.scrollTo(0,0); }catch(_){ }
    try{ setTogesterDock(isTogesterActive()); }catch(_){ }
  }

  function exitGameFullscreen(){
    try{ document.body.classList.remove("in-game"); }catch(_){ }
    // Stop game-specific BGM when leaving the embedded gameplay
    try{ window.__stopGameBgm?.(); }catch(_){ }
    // Resume room BGM only if the user previously enabled it
    try{
      const el = document.getElementById('bgmBattle');
      if (el && localStorage.getItem('audio_enabled') === '1'){
        el.muted = false;
        el.play().catch(()=>{});
      }
    }catch(_){ }
    try{
      // Hide the game frame when not actively playing (no spectator layout needed now)
      duel.ui?.duelFrameWrap?.classList.add("hidden");
      const fr = duel.ui?.duelFrame;
      if (fr) fr.src = "about:blank";
    }catch(_){ }
    try{
      const dock = document.getElementById("tgDock");
      if (dock) dock.classList.add("hidden");
    }catch(_){ }
    // Reset dock layout vars (avoids residual blank space after leaving a docked game)
    try{ setTogesterDock(false); }catch(_){ }
  }

  // Local UI override: when a player leaves SnakeTail mid-match ("나가기"),
  // the server match can continue for others, but this client should return
  // to the room lobby UI (ready list/button visible).
  let forceLobbyUI = false;
  // DrawAnswer: if you are left alone mid-game, auto-return to lobby UI.
  let _daAutoLeftSolo = false;

  function isTogesterActive(){
    try{
      // Prefer the latest room mode cached from the room page runtime.
      const modeId = (window.__roomModeId || "").toString();
      if (modeId) return (modeId === "togester" || modeId === "snaketail");

      // Fallbacks (best-effort)
      const coop = window.__roomCoop;
      const room = window.__roomRef;
      const id = (coop && coop.meta && coop.meta.id)
        ? coop.meta.id
        : ((room && room.state && room.state.mode) || "");
      return (id === "togester" || id === "snaketail");
    }catch(_){
      return false;
    }
  }

  function setTogesterDock(on){
    try{
      const dock = document.getElementById("tgDock");
      if (!dock) return;
      const root = document.documentElement;
      const show = !!on && document.body.classList.contains("in-game");

      dock.classList.toggle("hidden", !show);
      document.body.classList.toggle("tg-mode", !!show);

      if (!show){
        try{ root.style.setProperty("--tgDockH", "0px"); }catch(_){ }
        return;
      }

      // Measure dock height after layout so the iframe area can stop above it.
      requestAnimationFrame(()=>{
        try{
          const h = dock.getBoundingClientRect().height || dock.offsetHeight || 0;
          root.style.setProperty("--tgDockH", h + "px");
        }catch(_){ }
      });
    }catch(_){ }
  }

  function shakeOnce(){
    try{
      document.body.classList.add('shake');
      setTimeout(()=>{ try{ document.body.classList.remove('shake'); }catch(_){ } }, 380);
    }catch(_){ }
  }

// ---- BGM (best-effort autoplay; mobile may require a tap) ----
function setupBgm(audioElId, btnId){
  const audio = document.getElementById(audioElId);
  const btn = document.getElementById(btnId);
  if(!audio || !btn) return;

  // start hidden; show only if user needs to tap
  btn.style.display = "none";

  const tryPlayMuted = async () => {
    try{
      audio.loop = true;
      audio.muted = true;     // autoplay usually allowed only when muted
      audio.volume = 0.7;
      await audio.play();
      // Unmute on first user interaction
      const unlock = async () => {
        try{
          audio.muted = false;
          await audio.play();
        }catch(e){}
        window.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("touchstart", unlock, true);
        window.removeEventListener("keydown", unlock, true);
      };
      window.addEventListener("pointerdown", unlock, true);
      window.addEventListener("touchstart", unlock, true);
      window.addEventListener("keydown", unlock, true);
    }catch(e){
      // If autoplay totally blocked, show button to start
      btn.style.display = "";
    }
  };

  btn.addEventListener("click", async ()=>{
    try{
      audio.muted = false;
      await audio.play();
      btn.style.display = "none";
    }catch(e){
      // keep button visible
      btn.style.display = "";
    }
  });

  tryPlayMuted();
}

(function(){
  const { makeClient, safeText, nowHHMM, setStatus } = window.Net;

  const q = new URLSearchParams(location.search);
  const roomId = q.get("roomId") || sessionStorage.getItem("pendingRoomId");

  const els = {
    title: document.querySelector("#roomTitle"),
    mode: document.querySelector("#roomMode"),
    players: document.querySelector("#playersList"),
    readyBtn: document.querySelector("#readyBtn"),
    startBtn: document.querySelector("#startBtn"),
    leaveBtn: document.querySelector("#leaveBtn"),
    status: document.querySelector("#roomStatus"),
    canvas: document.querySelector("#gameCanvas"),
    roomChatLog: document.querySelector("#roomChatLog"),
    roomChatInput: document.querySelector("#roomChatInput"),
    roomChatSend: document.querySelector("#roomChatSend"),
    tgDock: document.querySelector("#tgDock"),
    tgDockLog: document.querySelector("#tgDockLog"),
    tgDockInput: document.querySelector("#tgDockInput"),
    tgDockSend: document.querySelector("#tgDockSend"),
  };

  // CPU difficulty (solo duel: 1 human + CPU)
  // Stored locally so the choice persists.
  let cpuDifficulty = (localStorage.getItem("cpu_difficulty") || "mid").toLowerCase();
  let cpuDiffWrap = null;
  let cpuDiffSelect = null;

  function mountCpuDifficultyUi(){
    try{
      const controls = document.querySelector('.playersPanel .controls');
      if (!controls) return;
      // Avoid duplicates
      if (document.getElementById('cpuDiffWrap')){
        cpuDiffWrap = document.getElementById('cpuDiffWrap');
        cpuDiffSelect = document.getElementById('cpuDiffSel');
        return;
      }

      const wrap = document.createElement('div');
      wrap.id = 'cpuDiffWrap';
      wrap.style.display = 'none';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '8px';
      wrap.style.marginBottom = '8px';
      wrap.innerHTML = `
        <span class="muted" style="font-size:13px;">CPU 난이도</span>
        <select id="cpuDiffSel" class="input" style="max-width:120px; padding:8px 10px;">
          <option value="low">하</option>
          <option value="mid">중</option>
          <option value="high">상</option>
        </select>
      `;
      // Place above the buttons
      controls.parentElement?.insertBefore(wrap, controls);

      cpuDiffWrap = wrap;
      cpuDiffSelect = wrap.querySelector('#cpuDiffSel');
      if (cpuDiffSelect){
        cpuDiffSelect.value = cpuDifficulty;
        cpuDiffSelect.addEventListener('change', ()=>{
          cpuDifficulty = (cpuDiffSelect.value || 'mid').toLowerCase();
          try{ localStorage.setItem('cpu_difficulty', cpuDifficulty); }catch(_){ }
        });
      }
    }catch(_){ }
  }

  const previewEls = {
    wrap: document.getElementById("gamePreview"),
    thumb: document.querySelector("#gamePreview .gpThumb"),
    // NOTE: room.html에서 제목/기본설명 대신 게임별 2줄 설명만 표시
    desc: document.getElementById("previewDesc"),
  };

  // ---- Game BGM (per-game music during play) ----
  const GAME_BGM_MAP = {
    suika: "assets/audio/suikamusic.mp3",
    stackga: "assets/audio/stackmusic.mp3",
  };
  const _gameBgm = { el: null, handle: null, lastMode: null, primed: false };

  function _ensureGameBgm(){
    if (_gameBgm.el) return;
    _gameBgm.el = document.getElementById("bgmGame");
    if (_gameBgm.el && window.AudioManager){
      // Slightly lower than room BGM; music should sit behind gameplay.
      _gameBgm.handle = window.AudioManager.attachAudioManager(_gameBgm.el, { label: "게임 음악", storageKey: "audio_enabled", volume: 0.55 });
    }
  }

  function playGameBgm(modeId){
    _ensureGameBgm();
    const el = _gameBgm.el;
    if (!el) return;
    const src = GAME_BGM_MAP[modeId];
    if (!src){
      stopGameBgm();
      return;
    }
    if (_gameBgm.lastMode !== modeId || el.getAttribute("src") !== src){
      try{ el.src = src; }catch(_){ }
      _gameBgm.lastMode = modeId;
    }
    try{ el.currentTime = 0; }catch(_){ }

    // Prime muted playback once (autoplay is usually allowed only when muted).
    // After that, keep the current mute state so we don't accidentally re-mute on later calls.
    if (!_gameBgm.primed){
      try{ el.muted = true; }catch(_){ }
      try{ el.play().catch(()=>{}); }catch(_){ }
      _gameBgm.primed = true;
      return;
    }

    try{ el.play().catch(()=>{}); }catch(_){ }
  }

  function stopGameBgm(){
    const el = _gameBgm.el;
    if (!el) return;
    try{ el.pause(); }catch(_){ }
    try{ el.currentTime = 0; }catch(_){ }
    try{ el.muted = true; }catch(_){ }
    _gameBgm.primed = false;
  }

  // Expose for fullscreen helpers outside this closure
  try{ window.__playGameBgm = playGameBgm; }catch(_){ }
  try{ window.__stopGameBgm = stopGameBgm; }catch(_){ }

  function defaultModeId(){
    return (window.GAME_REGISTRY && window.GAME_REGISTRY[0] && window.GAME_REGISTRY[0].id)
      ? window.GAME_REGISTRY[0].id
      : "stackga";
  }

function updatePreview(modeId){
  const meta = window.gameById ? window.gameById(modeId) : null;
  const label = meta?.name || modeLabel(modeId) || "-";

  // 요청사항: 방 화면에서 제목/기본설명 대신 게임별 2줄 설명만 표시
  try{
    if (previewEls.desc){
      const lines = Array.isArray(meta?.descLines) ? meta.descLines : [];
      const cleaned = lines
        .map(s => (s ?? "").toString().trim())
        .filter(Boolean)
        .slice(0, 2);

      // 2줄이 없으면 최소 1줄은 보여주기
      const fallback = cleaned.length ? cleaned : ["게임 시작 시 전체 화면으로 전환됩니다."];
      previewEls.desc.innerHTML = fallback
        .map(line => `<div>${safeText(line, 80)}</div>`)
        .join("");
    }
  }catch(_){}

  try{
    if (previewEls.thumb){
      previewEls.thumb.dataset.game = meta?.id || modeId || "";
      previewEls.thumb.dataset.label = (label || "").slice(0, 6);
    }
  }catch(_){}

  // 요청사항: 방 화면 상단의 모바일 조작 안내를 게임별로 표시
  // (투게스터는 하단에 PC/모바일 조작을 함께 표시)
  try{
    const sub = document.getElementById("gamePanelSub");
    if (sub){
      const isTogester = (meta && meta.id) ? (meta.id === 'togester') : (modeId === 'togester');
      const hint = (meta && meta.mobileHint) ? String(meta.mobileHint).trim() : "";
      sub.textContent = (!isTogester && hint) ? safeText(hint, 80) : "";
    }
  }catch(_){ }

  // Preview 하단 조작 안내(투게스터 등)
  try{
    const el = document.getElementById('gameControlsHint');
    if (el){
      const isTogester = (meta && meta.id) ? (meta.id === 'togester') : (modeId === 'togester');
      if (isTogester){
        const m = (meta && meta.mobileHint) ? String(meta.mobileHint).trim() : '';
        const pc = (meta && meta.pcHint) ? String(meta.pcHint).trim() : '';
        const line = [m, pc].filter(Boolean).join(' · ');
        el.textContent = line ? safeText(line, 100) : '';
        el.style.display = line ? 'block' : 'none';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    }
  }catch(_){ }
}


  const resultEls = {
    overlay: document.getElementById("resultOverlay"),
    title: document.getElementById("resultTitle"),
    desc: document.getElementById("resultDesc"),
  };

  // Embedded iframe game state
  let duel = {
    active: null, // {gameId,aSid,bSid,aNick,bNick,roundLabel}
    meta: null,
    reportedOver: false,
    iframeReady: false,
    iframeLoaded: false,
    iframeEl: null,
    ui: {}
  };
  const CPU_SID = "__cpu__";
  let cpuFrame = {
    iframeEl: null,
    iframeReady: false,
    iframeLoaded: false,
  };
  let coop = {
    active: false,
    meta: null,
    iframeReady: false,
    iframeLoaded: false,
    practice: false,
    level: 1,
  };

  // Expose minimal state for helpers defined outside this IIFE (best-effort).
  try{ window.__roomCoop = coop; }catch(_){ }
  let sim = null;
  let tickRate = 20;

  // Duel/Coop iframe UI refs
  duel.ui.duelUI = document.getElementById("duelUI");
  duel.ui.duelLine = document.getElementById("duelLine");
  duel.ui.duelSub = document.getElementById("duelSub");
  duel.ui.duelBracket = document.getElementById("duelBracket");
  duel.ui.frameWrap = document.getElementById("duelFrameWrap");
  duel.ui.frame = document.getElementById("duelFrame");
  duel.ui.spectate = document.getElementById("duelSpectate");
  duel.ui.spectateScore = document.getElementById("duelSpectateScore");
  duel.ui.specGrid = document.getElementById("spectateGrid");
  duel.ui.specCanvasA = document.getElementById("specCanvasA");
  duel.ui.specCanvasB = document.getElementById("specCanvasB");
  duel.ui.specNameA = document.getElementById("specNameA");
  duel.ui.specNameB = document.getElementById("specNameB");
  duel.ui.specSplitBtn = document.getElementById("spectateSplitBtn");
  duel.ui.specSingleBtn = document.getElementById("spectateSingleBtn");
  duel.ui.specSwapBtn = document.getElementById("spectateSwapBtn");
  duel.iframeEl = duel.ui.frame;

  // Spectator live view (no iframe): render latest duel_state snapshots
  const spec = {
    mode: "split", // split | single
    focus: "A",    // A | B (single mode)
    last: new Map(),
  };

  // Simple tournament UI (client-side from match/result messages)
  const bracket = {
    matches: [],
    activeIdx: -1,
    eliminated: new Set(),
    champion: null,
  };

  function setText(el, t){ if(el) el.textContent = String(t ?? ""); }

  function updateBracketUI(){
    if(!duel.ui.duelBracket) return;
    const host = duel.ui.duelBracket;
    host.innerHTML = "";
    const matches = bracket.matches || [];
    const champName = bracket.champion || null;

    if(!matches.length && !champName) return;

    // Collect roster nicks (for 3p bye display)
    let roster = [];
    try{
      if (room && room.state && room.state.players){
        room.state.players.forEach((p, sid)=> { if(p && p.nick) roster.push({sid, nick: p.nick}); });
      }
    }catch(e){}

    // Partition matches (labels may vary)
    const isSemi = (lbl)=> /준결|semi/i.test(lbl||"");
    const isFinal = (lbl)=> /결승|final/i.test(lbl||"");

    const semis = matches.filter(m => isSemi(m.label || m.labelKor || m.labelEn || m.label));
    const finals = matches.filter(m => isFinal(m.label || m.labelKor || m.labelEn || m.label));
    // Fallback by order
    const semis2 = semis.length ? semis : matches.slice(0, Math.min(2, matches.length-1));
    const finalM = finals[0] || (matches.length>=2 ? matches[matches.length-1] : null);

    const grid = document.createElement("div");
    grid.className = "bracketGrid";
    const colSemi = document.createElement("div");
    colSemi.className = "bracketCol semi";
    const colFinal = document.createElement("div");
    colFinal.className = "bracketCol final";

    function cardForMatch(m, kind){
      const div = document.createElement("div");
      div.className = "bracketCard";
      if(kind) div.classList.add(kind);
      if(m && m.done) div.classList.add("done");
      // active highlight
      const idx = matches.indexOf(m);
      if(idx === bracket.activeIdx) div.classList.add("active");

      const aLose = m && m.loserSid && m.aSid === m.loserSid;
      const bLose = m && m.loserSid && m.bSid === m.loserSid;
      const aName = m ? (aLose ? "✖ " : "") + (m.aNick || "—") : "—";
      const bName = m ? (bLose ? "✖ " : "") + (m.bNick || "—") : "—";
      const tag = (m && (m.label || "")) || (kind==="final" ? "결승" : "준결");

      div.innerHTML = `
        <div class="tag">${safeText(tag, 10)}</div>
        <div class="names">
          <div class="name ${aLose ? "lose":""}">${safeText(aName, 28)}</div>
          <div class="vs">vs</div>
          <div class="name ${bLose ? "lose":""}">${safeText(bName, 28)}</div>
        </div>
      `;
      return div;
    }

    // Semi cards (max 2)
    for (let i=0;i<Math.min(2, semis2.length);i++){
      colSemi.appendChild(cardForMatch(semis2[i], "semi"));
    }

    // If only one semi but we have 3+ roster, show a bye card to keep bracket balanced
    if (colSemi.children.length === 1 && roster.length >= 3){
      // find bye candidate: someone not in semi match
      const semi = semis2[0];
      const used = new Set([semi?.aSid, semi?.bSid].filter(Boolean));
      const bye = roster.find(r => !used.has(r.sid));
      const byeCard = document.createElement("div");
      byeCard.className = "bracketCard semi bye";
      byeCard.innerHTML = `
        <div class="tag">부전승</div>
        <div class="names">
          <div class="name">${safeText(bye ? bye.nick : "—", 28)}</div>
          <div class="vs">대기</div>
          <div class="name muted">결승 직행</div>
        </div>
      `;
      colSemi.appendChild(byeCard);
    }

    // Final card
    if(finalM){
      colFinal.appendChild(cardForMatch(finalM, "final"));
    }else{
      const placeholder = document.createElement("div");
      placeholder.className = "bracketCard final";
      placeholder.innerHTML = `
        <div class="tag">결승</div>
        <div class="names">
          <div class="name">—</div>
          <div class="vs">vs</div>
          <div class="name">—</div>
        </div>
      `;
      colFinal.appendChild(placeholder);
    }

    // Champion badge
    if(champName){
      const champ = document.createElement("div");
      champ.className = "bracketChampion";
      champ.innerHTML = `🏆 ${safeText(champName, 32)}`;
      colFinal.appendChild(champ);
    }

    grid.appendChild(colSemi);
    grid.appendChild(colFinal);
    host.appendChild(grid);
  }

  function resetBracket(){
    bracket.matches = [];
    bracket.activeIdx = -1;
    bracket.eliminated = new Set();
    bracket.champion = null;
    updateBracketUI();
  }

  // ---- Spectator (real view) renderer ----
  function ensureSpecCanvasSize(cv){
    if(!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(180, rect.width);
    const h = Math.max(240, rect.height);
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function drawBoardSnapshot(ctx, state){
    const cv = ctx.canvas;
    const w = cv.width / (window.devicePixelRatio||1);
    const h = cv.height / (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);

    const board = state?.board;
    if(!Array.isArray(board) || !Array.isArray(board[0])){
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px system-ui";
      ctx.fillText("대기 중…", 10, 20);
      return;
    }
    const rows = board.length;
    const cols = board[0].length;
    const cell = Math.floor(Math.min(w/cols, h/rows));
    const ox = Math.floor((w - cell*cols)/2);
    const oy = Math.floor((h - cell*rows)/2);
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.fillRect(0,0,w,h);

    const palette = ["rgba(0,0,0,0)", "#7dd3fc", "#fca5a5", "#fcd34d", "#86efac", "#c4b5fd", "#fdba74", "#fda4af", "#94a3b8"]; // 0..8
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const v = board[y][x] | 0;
        if(!v) continue;
        ctx.fillStyle = palette[Math.max(0,Math.min(8,v))];
        ctx.fillRect(ox + x*cell + 1, oy + y*cell + 1, cell-2, cell-2);
      }
    }
    // outline
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox+0.5, oy+0.5, cell*cols-1, cell*rows-1);
    // score
    const score = state?.score ?? state?.points ?? 0;
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.fillText(`S:${score}`, 10, 18);
  }

  function drawSuikaSnapshot(ctx, state){
    const cv = ctx.canvas;
    const w = cv.width / (window.devicePixelRatio||1);
    const h = cv.height / (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.fillRect(0,0,w,h);

    const objs = state?.objects;
    if(!Array.isArray(objs)){
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px system-ui";
      ctx.fillText("대기 중…", 10, 20);
      return;
    }
    // simple cup
    const inset = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(inset, inset, w-2*inset, h-2*inset);

    for(const o of objs){
      const x = inset + (Number(o.x)||0) * (w-2*inset);
      const y = inset + (Number(o.y)||0) * (h-2*inset);
      const idx = Number(o.i)||0;
      const r = 6 + Math.max(0, idx) * 3;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();
    }
    const score = state?.score ?? 0;
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.fillText(`S:${score}`, 10, 18);
  }

  function updateSpectateLayout(){
    if(!duel.ui.specGrid) return;
    duel.ui.specGrid.classList.toggle("single", spec.mode === "single");
    if (duel.ui.specSwapBtn) duel.ui.specSwapBtn.style.display = (spec.mode === "single") ? "" : "none";

    const panes = duel.ui.specGrid.querySelectorAll(".spectatePane");
    panes.forEach(p=>p.style.display = "");
    if (spec.mode === "single"){
      // show only focus pane
      panes.forEach(p=>{
        const side = p.getAttribute("data-side");
        if (side !== spec.focus) p.style.display = "none";
      });
    }
  }

  function renderSpectate(){
    if(!duel.active) return;
    if(!duel.ui.specCanvasA || !duel.ui.specCanvasB) return;
    ensureSpecCanvasSize(duel.ui.specCanvasA);
    ensureSpecCanvasSize(duel.ui.specCanvasB);
    const ctxA = duel.ui.specCanvasA.getContext("2d");
    const ctxB = duel.ui.specCanvasB.getContext("2d");

    const sA = spec.last.get(duel.active.aSid);
    const sB = spec.last.get(duel.active.bSid);

    // Decide renderer by gameId/state shape
    const gameId = duel.meta?.id || duel.active.gameId;
    const isBoardGame = (gameId === "stackga") || (sA?.board || sB?.board);
    if (isBoardGame){
      drawBoardSnapshot(ctxA, sA);
      drawBoardSnapshot(ctxB, sB);
    } else {
      drawSuikaSnapshot(ctxA, sA);
      drawSuikaSnapshot(ctxB, sB);
    }
  }

  // iframe -> parent bridge
  let lastDuelStateSent = 0;
  let lastTgStateSent = 0;
  window.addEventListener("message", (e)=>{
    const d = e.data || {};
    if (!d || typeof d !== "object") return;
    const srcWin = e.source;
    const fromMain = !!(duel.iframeEl && srcWin === duel.iframeEl.contentWindow);
    const fromCpu  = !!(cpuFrame.iframeEl && srcWin === cpuFrame.iframeEl.contentWindow);

    // Gestures inside an iframe do not propagate to the parent window.
    // Use this ping to unlock autoplay-restricted audio so game BGM can start
    // as soon as the player interacts with the game.
    if (d.type === "gesture"){
      try{ _ensureGameBgm(); }catch(_){ }
      try{
        const inGame = document.body.classList.contains("in-game") || !(duel.ui?.duelFrameWrap?.classList?.contains("hidden"));
        if (inGame){
          const modeId = (room && room.state && (room.state.mode || room.state.gameId)) || duel.active?.gameId || duel.meta?.id;
          playGameBgm(modeId);
        }
      }catch(_){ }
      try{ _gameBgm.handle?.enable?.(); }catch(_){ }
      try{ if(_gameBgm.el){ _gameBgm.el.muted = false; _gameBgm.el.play().catch(()=>{}); } }catch(_){ }
      return;
    }

    if (d.type === "bridge_ready"){
      if (fromMain){
        duel.iframeReady = true;
        coop.iframeReady = true;
      }
      if (fromCpu){
        cpuFrame.iframeReady = true;
      }

      // if match already known, init now
      if (fromMain && duel.active && duel.meta && duel.iframeLoaded){
        sendBridgeInit();
      }
      if (fromCpu && cpuFrame.iframeEl && duel.active && duel.meta && cpuFrame.iframeLoaded){
        sendCpuBridgeInit();
      }
      if (fromMain && coop.active && coop.meta && duel.iframeEl && coop.iframeLoaded){
        sendCoopBridgeInit();
      }
      return;
    }
    if (!room) return;

    // In-game "나가기" from embedded duel iframe (forfeit & return to room UI)
    if (d.type === "duel_quit"){
      if (!fromMain) return;
      try{ room.send("duel_over", {}); }catch(_){ }
      try{ exitGameFullscreen(); }catch(_){ }
      return;
    }
    
    // In-game "나가기" from embedded togester iframe (end coop & return to room UI)
    if (d.type === "tg_quit"){
      if (!fromMain) return;
      // 방 안 연습 모드에서는 서버에 결과를 보내지 않고 바로 방으로 복귀
      if (coop.practice){
        try{
          coop.practice = false;
          coop.active = false;
          coop.meta = null;
          coop.iframeLoaded = false;
          coop.iframeReady = false;
        }catch(_){ }
        try{ exitGameFullscreen(); }catch(_){ }
        return;
      }
      try{ room.send("tg_over", { success: false, reason: "quit" }); }catch(_){ }
      try{ exitGameFullscreen(); }catch(_){ }
      return;
    }

    // In-game "나가기" from embedded SnakeTail iframe (return to room UI only)
    if (d.type === "st_quit"){
      if (!fromMain) return;
      // Snaketail is a shared session; leaving should not end the whole match.
      // But this client should return to the lobby UI (ready list/button visible)
      // even while the server match continues for others.
      forceLobbyUI = true;
      try{ exitGameFullscreen(); }catch(_){ }
      try{ renderPlayers(); }catch(_){ }
      return;
    }

    // In-game "나가기" from embedded SuhakTokki iframe (return to room UI only)
    if (d.type === "sk_quit"){
      if (!fromMain) return;
      forceLobbyUI = true;
      try{ exitGameFullscreen(); }catch(_){ }
      try{ renderPlayers(); }catch(_){ }
      return;
    }

    // In-game "나가기" from embedded DrawAnswer iframe (return to room UI only)
    if (d.type === "da_quit"){
      if (!fromMain) return;
      // 방에는 남아있더라도 "게임"에서 나간 것으로 처리 (혼자 남았을 때 즉시 종료 기준)
      try{ room.send("da_exit", {}); }catch(_){ }
      forceLobbyUI = true;
      try{ exitGameFullscreen(); }catch(_){ }
      try{ renderPlayers(); }catch(_){ }
      return;
    }

    // SuhakTokki iframe -> server relay (generic packet)
    if (d.type === "sk_msg"){
      if (!fromMain) return;
      try{ room.send("sk_msg", { msg: d.msg || {} }); }catch(_){ }
      return;
    }

    // DrawAnswer iframe -> server relay
    if (d.type === "da_enter"){
      if (!fromMain) return;
      try{ room.send("da_enter", {}); }catch(_){ }
      return;
    }
    if (d.type === "da_exit"){
      if (!fromMain) return;
      try{ room.send("da_exit", {}); }catch(_){ }
      return;
    }
    if (d.type === "da_sync"){
      if (!fromMain) return;
      try{ room.send("da_sync", {}); }catch(_){ }
      return;
    }
    if (d.type === "da_draw"){
      if (!fromMain) return;
      try{ room.send("da_draw", { segs: d.segs || [], c: d.c, w: d.w }); }catch(_){ }
      return;
    }
    if (d.type === "da_clear"){
      if (!fromMain) return;
      try{ room.send("da_clear", {}); }catch(_){ }
      return;
    }
    if (d.type === "da_chat"){
      if (!fromMain) return;
      const text = (d && typeof d.text === "string") ? d.text : (d && typeof d.msg === "string" ? d.msg : "");
      try{ room.send("da_chat", { text }); }catch(_){ }
      return;
    }

    // DrawAnswer: game enter/exit (staying in room)
    if (d.type === "da_enter"){
      if (!fromMain) return;
      try{ room.send("da_enter", {}); }catch(_){ }
      return;
    }
    if (d.type === "da_exit"){
      if (!fromMain) return;
      try{ room.send("da_exit", {}); }catch(_){ }
      return;
    }

// Togester (coop) iframe -> server relay
    if (d.type === "tg_state"){
      if (!fromMain) return;
      const now = Date.now();
      if (now - lastTgStateSent >= 120){
        lastTgStateSent = now;
        room.send("tg_state", { state: d.state });
      }
      return;
    }
    if (d.type === "tg_button"){
      if (!fromMain) return;
      room.send("tg_button", { idx: d.idx, pressed: d.pressed });
      return;
    }
    if (d.type === "tg_level"){
      if (!fromMain) return;
      room.send("tg_level", { level: d.level });
      return;
    }
    if (d.type === "tg_reset"){
      if (!fromMain) return;
      room.send("tg_reset", { t: d.t });
      return;
    }
    if (d.type === "tg_push"){
      if (!fromMain) return;
      // relay a push impulse to the target player (server will broadcast)
      try{
        room.send("tg_push", { to: d.to, dx: d.dx, dy: d.dy, from: mySessionId });
      }catch(_){ }
      return;
    }

    if (d.type === "tg_floor"){
      if (!fromMain) return;
      try{
        room.send("tg_floor", {
          id: d.id,
          owner: d.owner || mySessionId,
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          color: d.color
        });
      }catch(_){ }
      return;
    }


    if (d.type === "tg_floor_remove"){
      if (!fromMain) return;
      try{
        room.send("tg_floor_remove", { owner: d.owner || mySessionId, ids: Array.isArray(d.ids) ? d.ids : null });
      }catch(_){ }
      return;
    }
    if (d.type === "tg_sync"){
      if (!fromMain) return;
      try{ room.send("tg_sync", {}); }catch(_){ }
      return;
    }
    if (d.type === "tg_over"){
      if (!fromMain) return;
      room.send("tg_over", {
        success: !!d.success,
        reason: d.reason
      });
      return;
    }

    // SnakeTail (coop competitive) iframe -> server relay
    if (d.type === "st_state"){
      if (!fromMain) return;
      const now = Date.now();
      if (!window.__lastStStateSent) window.__lastStStateSent = 0;
      if (now - window.__lastStStateSent >= 120){
        window.__lastStStateSent = now;
        try{ room.send("st_state", { state: d.state }); }catch(_){ }
      }
      return;
    }
    if (d.type === "st_eat"){
      if (!fromMain) return;
      try{ room.send("st_eat", { id: d.id }); }catch(_){ }
      return;
    }
    if (d.type === "st_spawn"){
      if (!fromMain) return;
      try{ room.send("st_spawn", { foods: d.foods || [] }); }catch(_){ }
      return;
    }
    if (d.type === "st_event"){
      if (!fromMain) return;
      try{ room.send("st_event", { event: d.event || {} }); }catch(_){ }
      return;
    }
    if (d.type === "st_over"){
      if (!fromMain) return;
      try{ room.send("st_over", { reason: d.reason, winnerSid: d.winnerSid }); }catch(_){ }
      return;
    }
    if (d.type === "duel_state"){
      if (!fromMain && !fromCpu) return;
      const senderSid = fromCpu ? CPU_SID : mySessionId;

      // Local relay between the two iframes for solo CPU matches.
      if (fromMain && cpuFrame.iframeEl){
        postToCpu({ type:"duel_state", sid: senderSid, state: d.state });
      } else if (fromCpu){
        postToMain({ type:"duel_state", sid: senderSid, state: d.state });
      }

      const now = Date.now();
      if (now - lastDuelStateSent >= 80){
        lastDuelStateSent = now;
        const payload = { state: d.state };
        if (senderSid === CPU_SID) payload.sid = CPU_SID;
        room.send("duel_state", payload);
      }

      try{ spec.last.set(senderSid, d.state); }catch(_){ }

      // auto gameover detect (stackga: dead, suika: over)
      if (!duel.reportedOver && (d.state?.dead || d.state?.over)){
        duel.reportedOver = true;
        room.send("duel_over", { loserSid: senderSid });
      }
      return;
    }
    if (d.type === "duel_event"){
      if (!fromMain && !fromCpu) return;
      const senderSid = fromCpu ? CPU_SID : mySessionId;

      // Local relay for solo CPU matches.
      if (fromMain && cpuFrame.iframeEl){
        postToCpu({ type:"duel_event", sid: senderSid, event: d.event });
      } else if (fromCpu){
        postToMain({ type:"duel_event", sid: senderSid, event: d.event });
      }

      const payload = { event: d.event };
      if (senderSid === CPU_SID) payload.sid = CPU_SID;
      room.send("duel_event", payload);
      return;
    }
  });



  let client = null;
  let room = null;
  let prevPhase = null;

  let myNick = sessionStorage.getItem("nick") || "Player";
  let mySessionId = null;
  let lastResultKey = "";

  let isReady = false;
  let isHost = false;

  // Input state -> 6bit mask
  const inputState = { left:false, right:false, up:false, down:false, a:false, b:false };
  let lastSentMask = 0;


  function maskFromInput(s){
    return (s.left?1:0) | (s.right?2:0) | (s.up?4:0) | (s.down?8:0) | (s.a?16:0) | (s.b?32:0);
  }
  function setInput(key, down){
    switch(key){
      case "ArrowLeft": case "a": case "A": inputState.left = down; break;
      case "ArrowRight": case "d": case "D": inputState.right = down; break;
      case "ArrowUp": case "w": case "W": inputState.up = down; break;
      case "ArrowDown": case "s": case "S": inputState.down = down; break;
      case " ": case "Enter": inputState.a = down; break;
      case "Shift": inputState.b = down; break;
      // touch control keys:
      case "L": inputState.left = down; break;
      case "R": inputState.right = down; break;
      case "U": inputState.up = down; break;
      case "D": inputState.down = down; break;
      case "A": inputState.a = down; break;
      case "B": inputState.b = down; break;
    }
  }

  function maybeSendInputDelta(force=false){
    if (!room) return;
    const m = maskFromInput(inputState);
    if (!force && m === lastSentMask) return;
    lastSentMask = m;
    if (room.state.phase !== "playing") return;
    room.send("input", { mask: m });
  }

  function shouldIgnoreKeyEvent(e){
    try{
      const t = e?.target;
      if (!t) return false;
      const tag = (t.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
    }catch(_){ }
    return false;
  }

  function setupKeyboardAwareForTgDock(){
    const input = els?.tgDockInput;
    if (!input) return;

    const root = document.documentElement;
    const vv = window.visualViewport;
    let active = false;

    const update = () => {
      try{
        const h = vv ? vv.height : window.innerHeight;
        root.style.setProperty("--vvh", (h * 0.01) + "px");
        let kb = 0;
        if (vv){
          kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
        }
        root.style.setProperty("--kb", kb + "px");
        // Keep current dock height in a CSS var (0 when hidden)
        try{
          const dock = document.getElementById("tgDock");
          let dh = 0;
          if (dock && !dock.classList.contains("hidden")){
            dh = dock.getBoundingClientRect().height || dock.offsetHeight || 0;
          }
          root.style.setProperty("--tgDockH", dh + "px");
        }catch(_){ }
      }catch(_){ }
    };

    const activate = () => {
      active = true;
      try{ document.body.classList.add("kb-open"); }catch(_){ }
      update();
    };
    const deactivate = () => {
      active = false;
      try{ document.body.classList.remove("kb-open"); }catch(_){ }
      try{ root.style.setProperty("--kb", "0px"); }catch(_){ }
      update();
    };

    input.addEventListener("focus", ()=>{
      if (!isTogesterActive()) return;
      activate();
      setTimeout(()=>{ try{ input.scrollIntoView({ block:"center", inline:"nearest" }); }catch(_){ } }, 50);
    });
    input.addEventListener("blur", ()=>{ deactivate(); });

    // If the user taps back on the game, close the keyboard (mobile UX).
    // - We try multiple strategies: parent doc taps, iframe element taps, and a postMessage ping from the togester iframe.
    if (!window.__tgDockBlurWired){
      window.__tgDockBlurWired = true;

      const blurInput = () => {
        try{
          if (document.activeElement === input) input.blur();
        }catch(_){ }
      };

      const onOuterTap = (e) => {
        try{
          if (!document.body.classList.contains("tg-mode")) return;
          const dock = document.getElementById("tgDock");
          if (dock && e && e.target && dock.contains(e.target)) return;
          blurInput();
        }catch(_){ }
      };

      document.addEventListener("pointerdown", onOuterTap, true);
      document.addEventListener("touchstart", onOuterTap, true);

      // Some mobile browsers don't deliver parent events for taps inside the iframe.
      // Togester iframe sends a ping so we can blur the input reliably.
      window.addEventListener("message", (ev)=>{
        try{
          const t = ev && ev.data && ev.data.type;
          if (t === "tg_iframe_tap" || t === "dock_iframe_tap") blurInput();
        }catch(_){ }
      });

      const iframeEl = document.getElementById("duelFrame");
      if (iframeEl){
        iframeEl.addEventListener("pointerdown", ()=>{ if (document.body.classList.contains("tg-mode")) blurInput(); }, { passive:true });
        iframeEl.addEventListener("touchstart", ()=>{ if (document.body.classList.contains("tg-mode")) blurInput(); }, { passive:true });
      }
    }


    if (vv){
      vv.addEventListener("resize", ()=>{ if (active) update(); });
      vv.addEventListener("scroll", ()=>{ if (active) update(); });
    }
    window.addEventListener("resize", ()=>{ if (active) update(); });
  }

  function wireInputs(){
    window.addEventListener("keydown", (e)=>{ if (shouldIgnoreKeyEvent(e)) return; setInput(e.key, true); maybeSendInputDelta(); }, { passive:true });
    window.addEventListener("keyup", (e)=>{ if (shouldIgnoreKeyEvent(e)) return; setInput(e.key, false); maybeSendInputDelta(); }, { passive:true });

    // Mobile overlay buttons
    const btns = document.querySelectorAll("[data-key]");
    for (const b of btns){
      const k = b.getAttribute("data-key");
      const down = ()=>{ setInput(k, true); maybeSendInputDelta(); };
      const up = ()=>{ setInput(k, false); maybeSendInputDelta(); };
      b.addEventListener("touchstart", (e)=>{ e.preventDefault(); down(); }, { passive:false });
      b.addEventListener("touchend", (e)=>{ e.preventDefault(); up(); }, { passive:false });
      b.addEventListener("touchcancel", (e)=>{ e.preventDefault(); up(); }, { passive:false });
      b.addEventListener("mousedown", (e)=>{ e.preventDefault(); down(); });
      b.addEventListener("mouseup", (e)=>{ e.preventDefault(); up(); });
      b.addEventListener("mouseleave", (e)=>{ e.preventDefault(); up(); });
    }
  }

  function appendRoomChat(m){
    const time = m.time || nowHHMM();

    const rawNick = (m.nick ?? "").toString().trim();
    const rawText = (m.text ?? "").toString().trim();
    const isSystem = (!rawNick || rawNick === "SYSTEM" || rawNick === "?" || m.system === true || m.type === "system");

    let isSysLine = false;
    let html = "";

    if (isSystem){
      let msg = rawText || "";
      const join = msg.match(/^(.+?)\s*(접속|입장)$/);
      const leave = msg.match(/^(.+?)\s*(퇴장|나감|종료)$/);
      if (join) msg = `${join[1]}님이 접속하셨습니다.`;
      else if (leave) msg = `${leave[1]}님이 퇴장하셨습니다.`;
      isSysLine = true;
      html = `<span class="t">[${time}]</span> <span class="sysMsg">${safeText(msg, 200)}</span>`;
    } else {
      const nick = safeText(rawNick, 24);
      const text = safeText(rawText, 200);
      html = `<span class="t">[${time}]</span> <b class="n">${nick}</b>: <span class="m">${text}</span>`;
    }

    function appendTo(logEl){
      if (!logEl) return;
      const line = document.createElement("div");
      line.className = "chatLine";
      if (isSysLine) line.classList.add("sys");
      line.innerHTML = html;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }

    appendTo(els.roomChatLog);
    appendTo(els.tgDockLog);
  }

  function sendChatFrom(inputEl){
    if (!room || !inputEl) return;
    const text = safeText(inputEl.value, 200);
    if (!text.trim()) return;
    room.send("chat", { text });
    inputEl.value = "";
  }

  function sendRoomChat(){ sendChatFrom(els.roomChatInput); }
  function sendDockChat(){ sendChatFrom(els.tgDockInput); }

  function modeLabel(modeId){
    const g = window.gameById ? window.gameById(modeId) : null;
    return g ? g.name : (modeId || "-");
  }

  function renderPlayers(){
    if (!room) return;
    const state = room.state;

    // If the match is truly back in the lobby, clear any local override.
    if (state.phase === "lobby") forceLobbyUI = false;

    // UI phase (SnakeTail can be left mid-match without ending the whole room).
    const phase = forceLobbyUI ? "lobby" : state.phase;

    // Layout hint for CSS (mobile: hide player list during play).
    try{
      document.body.classList.toggle("is-playing", phase !== "lobby");
      document.body.classList.toggle("is-lobby", phase === "lobby");
    }catch(_){ }
    els.players.innerHTML = "";

    // MapSchema iteration
    const entries = [];
    state.players.forEach((p, sid)=> entries.push([sid, p]));
    // sort by seat (order map)
    const seatOf = {};
    state.order.forEach((seat, sid)=> seatOf[sid] = seat);
    entries.sort((a,b)=> (seatOf[a[0]]??99) - (seatOf[b[0]]??99));

    for (const [sid, p] of entries){
      const row = document.createElement("div");
      row.className = "pRow";
      const seat = (seatOf[sid] ?? 0) + 1;
      const host = p.isHost ? "👑" : "";
      const ready = (phase !== "lobby") ? "PLAY" : (p.isHost ? "방장" : (p.ready ? "READY" : "WAIT"));
      const readyCls = (phase !== "lobby") ? "ok" : (p.isHost ? "ok" : (p.ready ? "ok" : "muted"));
      row.innerHTML = `
        <span class="pSeat">P${seat}</span>
        <span class="pNick">${safeText(p.nick, 20)} ${host}</span>
        <span class="pReady ${readyCls}">${ready}</span>
      `;
      els.players.appendChild(row);

      if (sid === mySessionId){
        isHost = !!p.isHost;
        // keep local toggle in sync (server resets ready on backToRoom)
        isReady = !!p.ready;
      }
    }

    // buttons
    const lockedMidMatch = !!(forceLobbyUI && state.phase !== "lobby");
    if (lockedMidMatch){
      // Player left SnakeTail while the match continues.
      // Show the lobby UI, but keep controls disabled to avoid confusing actions.
      els.readyBtn.classList.remove("hidden");
      els.readyBtn.disabled = true;
      els.readyBtn.textContent = "게임중";
      els.startBtn.classList.add("hidden");
    } else {
      els.readyBtn.disabled = false;
      els.readyBtn.textContent = isReady ? "준비 해제" : "준비";
      // Host only needs Start
      els.readyBtn.classList.toggle("hidden", isHost);

      // 요청: 방장 외에는 시작 버튼이 보이지 않게
      // (비방장에게는 애초에 시작 UI를 노출하지 않습니다.)
      els.startBtn.classList.toggle("hidden", !isHost);
    }

    // Start 조건:
// - 규칙은 "모두 레디" 유지
// - 방장은 레디 버튼이 없으므로 자동 레디로 간주
// - CPU(__cpu__)는 레디 체크/인원 체크에서 제외
// - 듀얼 게임은 1인 시작 허용(서버가 CPU를 붙여 1:1 구성)
const CPU_SID = "__cpu__";
const modeId = state.mode || "";
const gmeta = (window.gameById ? window.gameById(modeId) : null);
const isCoop = (gmeta && gmeta.type === "coop") || modeId === "togester";
const isDuel = (gmeta && gmeta.type === "duel") || (!isCoop);

let humanCount = 0;
let nonHostHumanCount = 0;
let nonHostHumanReady = true;

try{
  state.players.forEach((p, sid)=>{
    if (String(sid) === CPU_SID) return;
    humanCount++;
    if (p?.isHost) return; // host is treated as ready
    nonHostHumanCount++;
    if (!p.ready) nonHostHumanReady = false;
  });
}catch(_){ }

let canStart = false;
let reason = "";
let startText = "게임 시작";
let startAction = "start";

const isTogester = (modeId === "togester");
const isSnakeTail = (modeId === "snaketail");
const isSuhakTokki = (modeId === "suhaktokki");

if (!isHost) reason = "방장만 시작할 수 있습니다.";
else if (state.phase !== "lobby") reason = "이미 진행 중입니다.";
else if (isCoop){
  if (isTogester && humanCount === 1){
    // 투게스터: 혼자일 때는 방 안 연습 모드(서버 시작 없이 iframe만 실행)
    canStart = true;
    startText = "연습 시작";
    startAction = "practice";
  } else if (isSuhakTokki && humanCount === 1){
    // 수학토끼: 혼자 시작해도 서버 매치를 시작(방 phase=playing)해서 이후 합류/동기화가 가능하도록 함
    // 게임 내부에서 자동으로 연습 모드(선생토끼 없음)로 판정합니다.
    canStart = true;
    startText = "연습 시작";
    startAction = "start";
  } else if (isSnakeTail && humanCount === 1){
    // SnakeTail은 혼자서도 정상 라운드를 시작할 수 있어요(먹이/타이머는 서버가 관리).
    canStart = true;
    startText = "혼자 시작";
    startAction = "start";
  } else {
    if (humanCount < 2) reason = "2명 이상 필요합니다.";
    else if (!nonHostHumanReady) reason = "모두 준비해야 시작됩니다.";
    else canStart = true;
  }
} else if (isDuel){
  if (humanCount === 1){
    // 1인 듀얼: 서버가 CPU를 붙여 시작
    canStart = true;
  } else {
    if (humanCount < 2) reason = "2명 이상 필요합니다.";
    else if (!nonHostHumanReady) reason = "모두 준비해야 시작됩니다.";
    else canStart = true;
  }
} else {
  if (humanCount < 2) reason = "2명 이상 필요합니다.";
  else if (!nonHostHumanReady) reason = "모두 준비해야 시작됩니다.";
  else canStart = true;
}

els.startBtn.disabled = !canStart;
els.startBtn.dataset.action = startAction;
els.startBtn.textContent = startText;
els.startBtn.title = canStart ? startText : reason;

  // Show CPU difficulty only when host starts a solo duel in lobby.
  try{
    if (cpuDiffWrap){
      const showCpuDiff = !!(isHost && state.phase === "lobby" && isDuel && humanCount === 1);
      cpuDiffWrap.style.display = showCpuDiff ? "flex" : "none";
      if (cpuDiffSelect) cpuDiffSelect.value = cpuDifficulty;
    }
  }catch(_){ }

  }

  function showResultOverlay(r){
    if(!resultEls.overlay) return;

    // de-dupe (server may emit same result more than once)
    const _k = `${r?.mode||""}|${r?.winnerSid||""}|${r?.loserSid||""}|${r?.done?1:0}|${r?.success?1:0}|${r?.reason||""}`;
    if (_k && _k === lastResultKey) return;
    lastResultKey = _k;

    // Co-op (Togester)
    if (r && r.mode === "togester"){
      const ok = !!r.success;
      // theme + sfx
      try{ resultEls.overlay.classList.remove("win","lose"); resultEls.overlay.classList.add(ok ? "win" : "lose"); }catch(_){ }
      try{ (ok ? window.SFX?.win : window.SFX?.lose)?.(); }catch(_){ }
      const title = ok ? "성공!" : "실패";
      let desc = ok ? "🎉 협동 클리어!" : "💥 게임 오버";
      if (r.reason && typeof r.reason === "string"){
        const rs = r.reason.toLowerCase();
        if (rs.includes("clear") || rs.includes("game")) desc = "🎉 협동 클리어!";
        if (rs.includes("dead") || rs.includes("fail")) desc = "💥 게임 오버";
      }
      setText(resultEls.title, title);
      setText(resultEls.desc, desc);
      resultEls.overlay.classList.remove("hidden");
      resultEls.overlay.setAttribute("aria-hidden", "false");
      // return from fullscreen back to room UI a moment after result
      try{ setTimeout(()=>exitGameFullscreen(), 1400); }catch(_){ }
      return;
    }

    // Update bracket state from result
    try{
      const idx = (bracket.activeIdx >= 0) ? bracket.activeIdx : (bracket.matches.length - 1);
      const m = bracket.matches[idx];
      if (m && r?.winnerSid){
        m.winnerSid = r.winnerSid;
        m.done = true;
        const loser = (m.aSid === r.winnerSid) ? m.bSid : m.aSid;
        m.loserSid = loser;
        bracket.eliminated.add(loser);
      }
      if (r?.done && r?.winnerNick){
        bracket.champion = r.winnerNick;
      }
      updateBracketUI();
    }catch(_){ }

    // Text
    const isParticipant = duel.active && (mySessionId === duel.active.aSid || mySessionId === duel.active.bSid);
    const win = !!r?.winnerSid && r.winnerSid === mySessionId;
    try{ resultEls.overlay.classList.remove("win","lose"); if (isParticipant) resultEls.overlay.classList.add(win ? "win" : "lose"); }catch(_){ }
    try{ if (isParticipant) (win ? window.SFX?.win : window.SFX?.lose)?.(); }catch(_){ }
    const title = isParticipant ? (win ? "승리!" : "패배") : "경기 종료";
    const desc = r?.done
      ? `🏆 ${safeText(r?.winnerNick || "우승자", 24)} 우승!`
      : `승자: ${safeText(r?.winnerNick || "-", 24)}`;
    setText(resultEls.title, title);
    setText(resultEls.desc, desc);

    resultEls.overlay.classList.remove("hidden");
    resultEls.overlay.setAttribute("aria-hidden", "false");
  }

  function hideResultOverlay(){
    if(!resultEls.overlay) return;
    resultEls.overlay.classList.add("hidden");
    resultEls.overlay.setAttribute("aria-hidden", "true");
  }

  function resizeCanvas(){
    const canvas = els.canvas;
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // keep aspect similar
    const w = Math.max(280, rect.width - 16);
    const h = Math.max(320, Math.min(540, rect.height - 90));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  
function showDuelUI(show){
  if(!duel.ui.duelUI) return;
  duel.ui.duelUI.classList.toggle("hidden", !show);
  // Hide stackga sim UI when duel is active
  const sgUI = document.getElementById("stackgaUI");
  if (sgUI) sgUI.classList.toggle("hidden", show);
}

function postTo(targetIframe, msg){
  try{
    if (targetIframe && targetIframe.contentWindow){
      targetIframe.contentWindow.postMessage(msg, "*");
    }
  }catch{}
}
function postToMain(msg){ postTo(duel.iframeEl, msg); }
function postToCpu(msg){ postTo(cpuFrame.iframeEl, msg); }
function postToAllIframes(msg){
  postToMain(msg);
  postToCpu(msg);
}

function sendBridgeInitTo(targetIframe, init){
  postTo(targetIframe, {
    type: "bridge_init",
    ...init
  });
}

function sendBridgeInit(){
  if (!duel.active || !duel.meta) return;
  const me = mySessionId;
  const isA = (me === duel.active.aSid);
  const isB = (me === duel.active.bSid);
  const role = (isA || isB) ? "player" : "spectator";

  const oppSid = isA ? duel.active.bSid : duel.active.aSid;
  const oppNick = isA ? duel.active.bNick : duel.active.aNick;

  if (!duel.matchId) duel.matchId = `${duel.active.gameId}-${duel.active.roundLabel || ""}-${Date.now()}`;
  sendBridgeInitTo(duel.iframeEl, {
    gameId: duel.meta.id,
    mySid: me,
    myNick: myNick || "Player",
    oppSid,
    oppNick,
    role,
    matchId: duel.matchId
  });
}

function sendCpuBridgeInit(){
  if (!cpuFrame.iframeEl || !duel.active || !duel.meta) return;
  if (!duel.matchId) duel.matchId = `${duel.active.gameId}-${duel.active.roundLabel || ""}-${Date.now()}`;
  sendBridgeInitTo(cpuFrame.iframeEl, {
    gameId: duel.meta.id,
    mySid: CPU_SID,
    myNick: "CPU",
    oppSid: mySessionId,
    oppNick: myNick || "Player",
    role: "cpu",
    matchId: duel.matchId,
    cpuDifficulty
  });
}

function sendCoopBridgeInit(){
  if (!coop.active || !coop.meta) return;
  const seat = (()=>{
    try{
      const s = room?.state?.order?.get(mySessionId);
      return (typeof s === "number") ? s : 0;
    }catch(_){ return 0; }
  })();
  const humanCount = (()=>{
    try{ return room?.state?.players ? room.state.players.size : 0; }catch(_){ return 0; }
  })();
  const solo = (humanCount === 1);
  const isHostFromState = (()=>{
    try{ return !!room?.state?.players?.get(mySessionId)?.isHost; }catch(_){ return false; }
  })();
  // Some coop games allow solo practice. If you are alone, treat yourself as host
  // for the embedded game even if the host flag hasn't arrived yet.
  const effectiveIsHost = isHostFromState || !!isHost || (solo && (coop.meta.id === "suhaktokki"));
  postToMain({
    type: "bridge_init",
    gameId: coop.meta.id,
    sessionId: mySessionId,
    nick: myNick || "Player",
    seat,
    isHost: effectiveIsHost,
    solo,
    roomCode: roomId,
    level: coop.level || 1,
    practice: !!coop.practice
  });
  
  // SnakeTail: ensure we don't miss initial food/timer messages due to iframe load timing
  try{
    if (coop.meta && coop.meta.id === "snaketail"){
      room?.send?.("st_sync", {});
    }
  }catch(_){ }
// Give keyboard focus to the game iframe (otherwise arrow/WASD may be captured by parent)
  try{ duel.iframeEl?.contentWindow?.focus?.(); }catch(_){ }
}

function handleDuelMatch(m){
  // New match begins -> hide previous result overlay (no persistence)
  try{ hideResultOverlay(); }catch(_){ }
  duel.active = m;
  duel.meta = window.gameById ? window.gameById(m.gameId) : { id: m.gameId, type:"duel", embedPath:"" };
  duel.reportedOver = false;
  duel.matchId = null;
  cpuFrame.iframeReady = false;
  cpuFrame.iframeLoaded = false;

  // Update spectator labels and clear cached snapshots
  try{ setText(duel.ui.specNameA, m.aNick || "A"); }catch(_){ }
  try{ setText(duel.ui.specNameB, m.bNick || "B"); }catch(_){ }
  try{ spec.last.clear(); }catch(_){ }

  // Bracket update (client-side)
  bracket.activeIdx = bracket.matches.length;
  bracket.matches.push({
    label: m.roundLabel || "",
    aSid: m.aSid,
    bSid: m.bSid,
    aNick: m.aNick,
    bNick: m.bNick,
    winnerSid: null,
    loserSid: null,
    done: false,
  });
  updateBracketUI();

  showDuelUI(true);

  // headline
  const line = `${m.roundLabel || ""} ${m.aNick || "A"} vs ${m.bNick || "B"}`.trim();
  if (duel.ui.duelLine) duel.ui.duelLine.textContent = line || "경기 시작";
  if (duel.ui.duelSub) duel.ui.duelSub.textContent = (m.gameId ? `게임: ${duel.meta.name || m.gameId}` : "");

  const me = mySessionId;
  const isPlayer = (me === m.aSid || me === m.bSid);
  const cpuInMatch = (m.aSid === CPU_SID || m.bSid === CPU_SID);

  if (isPlayer){
    duel.ui.frameWrap?.classList.remove("hidden");
    duel.ui.spectate?.classList.add("hidden");
    // Load iframe fresh
    const src = `${duel.meta.embedPath}?embed=1&embedGame=${encodeURIComponent(duel.meta.id)}&_m=${Date.now()}`;
    duel.iframeLoaded = false;
    duel.iframeReady = false;
    if (duel.iframeEl){
      duel.iframeEl.onload = ()=>{
        duel.iframeLoaded = true;
        // wait for bridge_ready or init anyway
        sendBridgeInit();
      };
      duel.iframeEl.src = src;
    }

    // Solo CPU match: run a hidden CPU iframe that auto-plays and relays state/events.
    if (cpuInMatch && me !== CPU_SID){
      if (!cpuFrame.iframeEl){
        const fr = document.createElement("iframe");
        fr.setAttribute("title", "CPU");
        fr.style.position = "absolute";
        fr.style.width = "1px";
        fr.style.height = "1px";
        fr.style.opacity = "0";
        fr.style.pointerEvents = "none";
        fr.style.border = "0";
        // keep in DOM to load scripts normally
        (duel.ui.frameWrap || document.body).appendChild(fr);
        cpuFrame.iframeEl = fr;
      }
      cpuFrame.iframeLoaded = false;
      cpuFrame.iframeReady = false;
      cpuFrame.iframeEl.onload = ()=>{
        cpuFrame.iframeLoaded = true;
        sendCpuBridgeInit();
      };
      cpuFrame.iframeEl.src = src;
    } else {
      // Not a solo CPU match -> tear down hidden CPU iframe
      if (cpuFrame.iframeEl){
        try{ cpuFrame.iframeEl.remove(); }catch(_){ }
        cpuFrame.iframeEl = null;
        cpuFrame.iframeLoaded = false;
        cpuFrame.iframeReady = false;
      }
    }
  } else {
    duel.ui.frameWrap?.classList.add("hidden");
    duel.ui.spectate?.classList.remove("hidden");
    // spectator: ensure CPU iframe is not running
    if (cpuFrame.iframeEl){
      try{ cpuFrame.iframeEl.remove(); }catch(_){ }
      cpuFrame.iframeEl = null;
      cpuFrame.iframeLoaded = false;
      cpuFrame.iframeReady = false;
    }
    if (duel.ui.spectateScore) duel.ui.spectateScore.textContent = "";
    updateSpectateLayout();
    renderSpectate();
  }
}

function startCoopEmbed(meta){
  coop.active = true;
  coop.meta = meta;
  coop.iframeLoaded = false;
  coop.iframeReady = false;

  showDuelUI(true);
  try{ enterGameFullscreen(); }catch(_){ }
  // coop에서는 관전/대진 UI를 숨기고 iframe만 사용
  duel.ui.spectate?.classList.add("hidden");
  duel.ui.frameWrap?.classList.remove("hidden");
  if (duel.ui.duelLine) duel.ui.duelLine.textContent = meta?.name || "협동";
  if (duel.ui.duelSub) duel.ui.duelSub.textContent = "";

  const src = `${meta.embedPath}?embed=1&embedGame=${encodeURIComponent(meta.id)}&_m=${Date.now()}`;
  if (duel.iframeEl){
    duel.iframeEl.onload = ()=>{
      coop.iframeLoaded = true;
      sendCoopBridgeInit();
    };
    duel.iframeEl.src = src;
  }
}


function startCoopPractice(meta){
  // Practice mode inside a coop room (no server "start"; stays in lobby)
  coop.active = true;
  coop.meta = meta;
  coop.practice = true;
  coop.level = 1;
  coop.iframeLoaded = false;
  coop.iframeReady = false;

  showDuelUI(true);
  try{ enterGameFullscreen(); }catch(_){ }
  duel.ui.spectate?.classList.add("hidden");
  duel.ui.frameWrap?.classList.remove("hidden");
  if (duel.ui.duelLine) duel.ui.duelLine.textContent = (meta?.name || "협동") + " · 연습";
  if (duel.ui.duelSub) duel.ui.duelSub.textContent = "";

  const src = `${meta.embedPath}?embed=1&practice=1&embedGame=${encodeURIComponent(meta.id)}&_m=${Date.now()}`;
  if (duel.iframeEl){
    duel.iframeEl.onload = ()=>{
      coop.iframeLoaded = true;
      sendCoopBridgeInit();
    };
    duel.iframeEl.src = src;
  }
}


function startSim(){
    const modeId = room.state.mode || defaultModeId();
    const meta = window.gameById ? window.gameById(modeId) : null;
    if (meta && meta.type === "duel"){
      showDuelUI(true);
      // wait for server match message
      return;
    }
    if (meta && meta.type === "coop" && meta.embedPath){
      startCoopEmbed(meta);
      return;
    }
    showDuelUI(false);
    const ctor = (window.GameSims || {})[modeId];
    if (!ctor){
      setStatus("게임 시뮬레이터를 찾을 수 없습니다(스크립트 누락).", "error");
      return;
    }
    const orderObj = {};
    room.state.order.forEach((seat, sid)=> orderObj[sid] = seat);
    const nicksObj = {};
    try{ room.state.players.forEach((p, sid)=> { nicksObj[sid] = p.nick || sid.slice(0,4); }); }catch{}
    sim = new ctor({ me: mySessionId, order: orderObj, nicks: nicksObj });

    // Mode-specific UI
    const sgUI = document.getElementById("stackgaUI");
    const mainCanvas = els.canvas;
    if (modeId === "stackga"){
      if (sgUI) sgUI.classList.remove("hidden");
      if (mainCanvas) mainCanvas.style.display = "none";
    } else {
      if (sgUI) sgUI.classList.add("hidden");
      if (mainCanvas) mainCanvas.style.display = "";
    }

    // Bind Stackga sub-canvases if supported
    if (typeof sim.bindUI === "function" && modeId === "stackga"){
      sim.bindUI({
        cvMe: document.getElementById("cvMe"),
        cvOpp: document.getElementById("cvOpp"),
        cvNext: document.getElementById("cvNext"),
        meTag: document.getElementById("meTag"),
        oppTag: document.getElementById("oppTag"),
      });
      // when local dies, notify server (tournament logic decides winner)
      sim.onLocalDead = ()=> {
        try{ room.send("sg_over", {}); }catch{}
      };
    }

  }

  function draw(){
    if (!sim) return;
    const ctx = els.canvas.getContext("2d");
    // sim handles drawing
    sim.render(ctx, els.canvas);
    requestAnimationFrame(draw);
  }

  async function connect(){
    // Require login OR guest nickname first.
    try {
      if (window.Auth && typeof window.Auth.requireLogin === "function") {
        await window.Auth.requireLogin();
      }
    } catch (e) {
      console.warn("auth failed, fallback guest", e);
    }

    myNick = sessionStorage.getItem("nick") || myNick;

    // CPU difficulty selector (visible only for solo duel in lobby)
    try{ mountCpuDifficultyUi(); }catch(_){ }

    if (!roomId){
      setStatus("방 ID가 없습니다. 로비로 돌아갑니다.", "error");
      setTimeout(()=> location.href="./index.html", 500);
      return;
    }

    try{
      client = makeClient();
      room = await client.joinById(roomId, { nick: myNick });

      mySessionId = room.sessionId;

      // cache for fullscreen helpers (togester dock, etc.)
      try{ window.__roomRef = room; }catch(_){ }
      try{ window.__roomModeId = room?.state?.mode || ""; }catch(_){ }

      // UI header
      els.title.textContent = safeText(room.state.title || "방", 30);
      els.mode.textContent = modeLabel(room.state.mode);
      els.status.textContent = (room.state.phase === "playing") ? "게임중" : "대기중";

      // preview title (pre-game)
      try{ updatePreview(room.state.mode); }catch(_){ }


      // state listeners
      room.state.onChange = () => {
        els.title.textContent = safeText(room.state.title || "방", 30);
        els.mode.textContent = modeLabel(room.state.mode);
        els.status.textContent = (room.state.phase === "playing") ? "게임중" : "대기중";

        try{ window.__roomModeId = room?.state?.mode || ""; }catch(_){ }

        try{ updatePreview(room.state.mode); }catch(_){ }
        // phase transitions (waiting <-> playing)
        try{
          const ph = room.state.phase;
          if (ph !== prevPhase){
            if (ph === "playing") enterGameFullscreen();
            else if (prevPhase === "playing") exitGameFullscreen();
            prevPhase = ph;
          }
        }catch(_){}
		// DrawAnswer: if everyone else left, automatically return to lobby UI.
		// (We keep the room connection; only exit the embedded gameplay screen.)
		try{
			if (room.state.mode === "drawanswer" && room.state.phase === "playing"){
				const cnt = (room.state.players && typeof room.state.players.size === "number") ? room.state.players.size : 0;
				if (cnt <= 1){
					if (!_daAutoLeftSolo && document.body.classList.contains("in-game")){
						_daAutoLeftSolo = true;
						forceLobbyUI = true;
						try{ exitGameFullscreen(); }catch(_){ }
						try{ appendRoomChat({ system:true, text: "다른 플레이어가 없어 게임을 종료했어요." }); }catch(_){ }
					}
				} else {
					_daAutoLeftSolo = false;
				}
			} else {
				_daAutoLeftSolo = false;
			}
		}catch(_){ }

		renderPlayers();
      };
      room.state.players.onAdd = renderPlayers;
      room.state.players.onRemove = renderPlayers;
      room.state.order.onAdd = renderPlayers;
      room.state.order.onRemove = renderPlayers;

      room.onMessage("started", (m)=> {
        try{ enterGameFullscreen(); }catch(_){ }
        try{ window.SFX?.start?.(); }catch(_){ }
        try{ shakeOnce(); }catch(_){ }
        // Start per-game BGM for supported games (best-effort; may require user gesture on mobile)
        try{ playGameBgm(room.state.mode || (m && m.gameId)); }catch(_){ }
        tickRate = m.tickRate || 20;
        setStatus("", "info");
        // reset per-game transient UI/state
        try{ spec.last.clear(); }catch(_){ }
        try{ if (duel.ui.spectateScore) duel.ui.spectateScore.textContent = ""; }catch(_){ }
        try{ resetBracket(); }catch(_){ }
        coop.level = 1;
        coop.practice = false;
        startSim();
      });

      room.onMessage("duel_state", (msg)=>{
        // Relay to embedded iframes (player + optional CPU)
        postToAllIframes({ type:"duel_state", sid: msg.sid, state: msg.state });

        // Spectator real-view: cache latest snapshots and render canvases
        if (duel.active){
          try{ spec.last.set(msg.sid, msg.state || {}); }catch(_){ }
          if (duel.ui.spectate && !duel.ui.spectate.classList.contains("hidden")){
            renderSpectate();
          }
        }

        // Spectator scoreboard (best-effort): show each side's score if available
        if (duel.active && duel.ui.spectate && !duel.ui.spectate.classList.contains("hidden")){
          const a = duel.active.aSid, b = duel.active.bSid;
          const aNick = duel.active.aNick || "A";
          const bNick = duel.active.bNick || "B";
          const score = (msg.state && (msg.state.score ?? msg.state.points ?? msg.state.pt));
          if (score !== undefined && duel.ui.spectateScore){
            // store in dataset
            if (!duel.ui.spectateScore._scores) duel.ui.spectateScore._scores = {};
            duel.ui.spectateScore._scores[msg.sid] = score;
            const sa = duel.ui.spectateScore._scores[a];
            const sb = duel.ui.spectateScore._scores[b];
            const lines = [];
            if (sa !== undefined) lines.push(`${aNick}: ${sa}`);
            if (sb !== undefined) lines.push(`${bNick}: ${sb}`);
            duel.ui.spectateScore.textContent = lines.join(" · ");
          }
        }
      });

      room.onMessage("duel_event", (msg)=>{
        // Relay to embedded iframes (player + optional CPU)
        postToAllIframes({ type:"duel_event", sid: msg.sid, event: msg.event });
      });

      // SuhakTokki relay: server -> iframe (generic packet)
      room.onMessage("sk_msg", (msg)=>{
        const inner = (msg && msg.msg) ? msg.msg : msg;
        postToMain({ type:"sk_msg", msg: inner || {} });
      });

      // DrawAnswer (그림맞추기) relay: server -> iframe
      room.onMessage("da_state", (msg)=>{
        postToMain(Object.assign({ type:"da_state" }, msg || {}));
      });
      room.onMessage("da_word", (msg)=>{
        postToMain({ type:"da_word", word: msg.word });
      });
      room.onMessage("da_draw", (msg)=>{
        postToMain({ type:"da_draw", segs: msg.segs || [], c: msg.c, w: msg.w });
      });
      room.onMessage("da_clear", ()=>{
        postToMain({ type:"da_clear" });
      });
      room.onMessage("da_replay", (msg)=>{
        postToMain({ type:"da_replay", ops: msg.ops || [] });
      });
      room.onMessage("da_chat", (msg)=>{
        postToMain(Object.assign({ type:"da_chat" }, msg || {}));
      });
      room.onMessage("da_over", (msg)=>{
        postToMain(Object.assign({ type:"da_over" }, msg || {}));
      });

      // Togester (coop) relay: server -> iframe
      room.onMessage("tg_players", (msg)=>{
        postToMain({ type:"tg_players", players: msg.players || {} });
      });
      room.onMessage("tg_button", (msg)=>{
        postToMain({ type:"tg_button", idx: msg.idx, pressed: msg.pressed });
      });
      room.onMessage("tg_buttons", (msg)=>{
        postToMain({ type:"tg_buttons", buttons: msg.buttons || {} });
      });
      room.onMessage("tg_level", (msg)=>{
        coop.level = (msg && typeof msg.level === "number") ? msg.level : (parseInt(msg?.level,10) || coop.level || 1);
        postToMain({ type:"tg_level", level: msg.level });
      });
      room.onMessage("tg_reset", (msg)=>{
        postToMain({ type:"tg_reset", t: msg.t });
      });
      room.onMessage("tg_push", (msg)=>{
        postToMain({ type:"tg_push", to: msg.to, dx: msg.dx, dy: msg.dy, from: msg.from });
      });

      room.onMessage("tg_floors", (msg)=>{
        postToMain({ type:"tg_floors", floors: msg.floors || [] });
      });
      room.onMessage("tg_floor", (msg)=>{
        postToMain(Object.assign({ type:"tg_floor" }, msg || {}));
      });
      room.onMessage("tg_floor_remove", (msg)=>{
        postToMain({ type:"tg_floor_remove", ids: msg.ids || null, owner: msg.owner || null });
      });
      room.onMessage("tg_floor_quota", (msg)=>{
        postToMain({ type:"tg_floor_quota", used: msg.used, limit: msg.limit });
      });

      // SnakeTail relay: server -> iframe
      room.onMessage("st_timer", (msg)=>{
        postToMain({ type:"st_timer", startTs: msg.startTs, durationMs: msg.durationMs });
      });
      room.onMessage("st_foods", (msg)=>{
        postToMain({ type:"st_foods", foods: msg.foods || [] });
      });
      room.onMessage("st_spawn", (msg)=>{
        postToMain({ type:"st_spawn", foods: msg.foods || [] });
      });
      room.onMessage("st_eaten", (msg)=>{
        postToMain({ type:"st_eaten", id: msg.id, eaterSid: msg.eaterSid, value: msg.value });
      });
      room.onMessage("st_players", (msg)=>{
        postToMain({ type:"st_players", players: msg.players || {} });
      });
      room.onMessage("st_scores", (msg)=>{
        postToMain({ type:"st_scores", scores: msg.scores || {} });
      });
      room.onMessage("st_event", (msg)=>{
        postToMain({ type:"st_event", event: msg.event || {} });
      });

      room.onMessage("frame", (frame)=> {
        // lockstep: server gives inputs for each tick
        if (!sim) return;
        sim.step(frame.inputs || {});
      });

      room.onMessage("match", (m)=> {
        const meta = window.gameById ? window.gameById(m.gameId || room.state.mode) : null;
        if (meta && meta.type === "duel"){
          handleDuelMatch(m);
        } else if (sim && typeof sim.onMatch==="function"){
          sim.onMatch(m);
        }
      });
      room.onMessage("result", (r)=> {
        try{ stopGameBgm(); }catch(_){ }
        showResultOverlay(r);
        // Let embedded games show their own win/lose overlay too.
        postToAllIframes({ type: "duel_result", payload: r });
      });
      room.onMessage("backToRoom", ()=> {
        try{ exitGameFullscreen(); }catch(_){ }
        try{ stopGameBgm(); }catch(_){ }
        hideResultOverlay();
        showDuelUI(false);
        duel.active=null; duel.meta=null;
        coop.active=false; coop.practice=false; coop.meta=null; coop.iframeLoaded=false; coop.iframeReady=false;
        coop.level = 1;
        isReady = false;
        // Notify iframes (best-effort) before clearing.
        postToAllIframes({ type: "duel_back" });
        // Notify iframes (best-effort) before clearing.
        postToAllIframes({ type: "duel_back" });
        if(duel.iframeEl) duel.iframeEl.src="about:blank";
        /* stay in room lobby UI */
      });

      room.onMessage("chat", appendRoomChat);
      room.onMessage("system", appendRoomChat);

      // chat ui
      els.roomChatSend.addEventListener("click", sendRoomChat);
      els.roomChatInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); sendRoomChat(); } });

      // togester in-game dock chat ui (shown only in fullscreen)
      if (els.tgDockSend) els.tgDockSend.addEventListener("click", sendDockChat);
      if (els.tgDockInput){
        // Prevent gameplay key handling while typing.
        els.tgDockInput.addEventListener("keydown", (e)=>{
          try{ e.stopPropagation(); }catch(_){ }
          if (e.key === "Enter"){
            e.preventDefault();
            sendDockChat();
          }
        });
        els.tgDockInput.addEventListener("keyup", (e)=>{ try{ e.stopPropagation(); }catch(_){ } });
        try{ setupKeyboardAwareForTgDock(); }catch(_){ }
      }

      // Ready / Start
      els.readyBtn.addEventListener("click", ()=>{
        if (isHost) return; // host does not need ready
        isReady = !isReady;
        try{ (isReady ? window.SFX?.readyOn : window.SFX?.readyOff)?.(); }catch(_){ }
        room.send("ready", { ready: isReady });
        renderPlayers();
      });
      els.startBtn.addEventListener("click", ()=>{
        if (els.startBtn.disabled) return;
        // light click sfx (start sfx + shake happens on server "started" for everyone)
        try{ window.SFX?.click?.(); }catch(_){ }

        const action = els.startBtn.dataset.action || "start";
        if (action === "practice"){
          const modeId = room?.state?.mode || "";
          const meta = window.gameById ? window.gameById(modeId) : null;
          if (meta && meta.type === "coop" && meta.embedPath){
            try{ enterGameFullscreen(); }catch(_){ }
            try{ playGameBgm(meta.id); }catch(_){ }
            startCoopPractice(meta);
          }
          return;
        }

        room.send("start", { cpuDifficulty });
      });

      // Leave
      els.leaveBtn.addEventListener("click", leaveToLobby);

      // Ensure WS closes even on tab close / navigation (auto-delete empty rooms)
      window.addEventListener("pagehide", ()=>{ try{ room?.leave(); }catch(_){} });
      window.addEventListener("beforeunload", ()=>{ try{ room?.leave(); }catch(_){} });

      // start loop
      setInterval(()=> maybeSendInputDelta(true), 500); // keepalive (최대 2회/초) - 방을 나가면 기록 없음
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
      wireInputs();
      // Spectate UI buttons
      duel.ui.specSplitBtn?.addEventListener("click", ()=>{ spec.mode = "split"; updateSpectateLayout(); renderSpectate(); });
      duel.ui.specSingleBtn?.addEventListener("click", ()=>{ spec.mode = "single"; spec.focus = "A"; updateSpectateLayout(); renderSpectate(); });
      duel.ui.specSwapBtn?.addEventListener("click", ()=>{ spec.focus = (spec.focus === "A") ? "B" : "A"; updateSpectateLayout(); renderSpectate(); });
      updateSpectateLayout();
      renderPlayers();

      // Start render loop
      requestAnimationFrame(draw);

      setStatus("", "info");
    }catch(err){
      setStatus("서버에 연결할 수 없습니다. 로비로 돌아갑니다.", "error");
      setTimeout(()=> location.href="./index.html", 800);
    }
  }

  function leaveToLobby(){
    try{ stopGameBgm(); }catch(_){}
    try{
      if (room) room.leave();
    }catch(_){}
    // clear room chat UI (no persistence)
    if (els.roomChatLog) els.roomChatLog.innerHTML = "";
    location.href = "./index.html";
  }

  connect();
})();


// ---- BGM ----
(function(){
  const el = document.getElementById('bgmBattle');
  if (!el || !window.AudioManager) return;
  // keep handle so we can stop/resume on fullscreen game transitions
  // Slightly lower room BGM (was a bit loud)
  window.__bgmBattleHandle = window.AudioManager.attachAudioManager(el, { label: '방 음악 켜기', storageKey: 'audio_enabled', volume: 0.42 });
})();
