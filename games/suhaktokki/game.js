/* 학생토끼 v0.1
   로컬 멀티(같은 브라우저 탭/창): BroadcastChannel
   - 4~8명 (테스트용 봇 추가 가능)
   - 선생토끼(임포스터) 1명
   - 토끼굴 맵 + 위치별 수학 미션(각 미션 3문제 정답 시 해결)
   - PC: 마우스(클릭/드래그 방향으로 이동)
   - 모바일: 가상 조이스틱 + 조작/검은당근 버튼 + 전체화면
*/

(() => {
  'use strict';

  // ---------- Pixel-art crisp rendering ----------
  // Bitmap sprites may look blurry if canvas smoothing is enabled (common in iframes / CSS scaling).
  // Force nearest-neighbor for the main canvases.
  function setCrisp(canvasEl, g){
    if (!canvasEl || !g) return;
    try{
      g.imageSmoothingEnabled = false;
      g.mozImageSmoothingEnabled = false;
      g.webkitImageSmoothingEnabled = false;
      g.msImageSmoothingEnabled = false;
    }catch(_){ }
    try{
      canvasEl.style.imageRendering = 'pixelated';
    }catch(_){ }
  }

  // embed (multiroom iframe)
  const QS = new URLSearchParams(location.search);
  const EMBED = QS.get("embed") === "1";
  function bridgeSend(type, payload){
    try{ window.parent && window.parent.postMessage({ type, ...(payload||{}) }, "*"); }catch(_){ }
  }

  // ---------- DOM ----------
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  setCrisp(canvas, ctx);

  // Ensure keyboard controls work reliably inside an iframe (multiroom embed):
  // make canvas focusable and focus it on interaction.
  try {
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    canvas.addEventListener('pointerdown', () => { try { canvas.focus(); } catch (_) {} });
  } catch (_) {}

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
  setCrisp(mapUiCanvas, mapUiCtx);

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
  // PC에서 선생토끼가 가까이 있는 학생을 0점(검은당근) 처리할 수 있는 버튼
  let killBtnPc = document.getElementById('killBtnPc');
  try{
    if (!killBtnPc && rightHud){
      killBtnPc = document.createElement('button');
      killBtnPc.className = 'ui mini danger';
      killBtnPc.id = 'killBtnPc';
      killBtnPc.textContent = '0점(X)';
      killBtnPc.style.display = 'none';
      const fsb = document.getElementById('fullscreenBtn');
      rightHud.insertBefore(killBtnPc, fsb || null);
    }
  }catch(_){ }
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
  const meetingRoster = document.getElementById('meetingRoster');
  const meetingChatLog = document.getElementById('meetingChatLog');
  const meetingChatText = document.getElementById('meetingChatText');
  const meetingChatSend = document.getElementById('meetingChatSend');
  const voteList = document.getElementById('voteList');
  const skipVote = document.getElementById('skipVote');

  const sceneModal = document.getElementById('sceneModal');
  const sceneTitle = document.getElementById('sceneTitle');
  const sceneText = document.getElementById('sceneText');
  const sceneOk = document.getElementById('sceneOk');
  const sceneCanvas = document.getElementById('sceneCanvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  setCrisp(sceneCanvas, sceneCtx);

  // ---------- Role reveal (Among Us style) ----------
  // Build overlay dynamically so it works in both standalone and embedded modes.
  const roleReveal = document.createElement('div');
  roleReveal.id = 'roleReveal';
  roleReveal.style.position = 'fixed';
  roleReveal.style.inset = '0';
  roleReveal.style.zIndex = '80';
  roleReveal.style.display = 'none';
  roleReveal.style.alignItems = 'center';
  roleReveal.style.justifyContent = 'center';
  roleReveal.style.background = 'rgba(0,0,0,.78)';
  roleReveal.style.padding = '18px';
  roleReveal.style.backdropFilter = 'blur(2px)';
  roleReveal.style.pointerEvents = 'auto';

  const rrCard = document.createElement('div');
  rrCard.style.width = 'min(560px, 92vw)';
  rrCard.style.borderRadius = '22px';
  rrCard.style.border = '2px solid rgba(255,255,255,.12)';
  rrCard.style.boxShadow = '0 40px 120px rgba(0,0,0,.65)';
  rrCard.style.padding = '18px 18px 16px';
  rrCard.style.textAlign = 'center';
  rrCard.style.color = 'rgba(244,247,255,.98)';
  rrCard.style.transform = 'scale(.96)';
  rrCard.style.transition = 'transform .18s ease, opacity .18s ease';
  rrCard.style.opacity = '0';

  const rrLine = document.createElement('div');
  rrLine.style.fontWeight = '1000';
  rrLine.style.letterSpacing = '-.3px';
  rrLine.style.fontSize = '14px';
  rrLine.style.opacity = '.92';
  rrLine.textContent = '역할';

  const rrBig = document.createElement('div');
  rrBig.style.marginTop = '8px';
  rrBig.style.fontWeight = '1100';
  rrBig.style.letterSpacing = '-.8px';
  rrBig.style.fontSize = '44px';
  rrBig.style.lineHeight = '1.05';
  rrBig.textContent = '...';

  const rrPortraitWrap = document.createElement('div');
  rrPortraitWrap.style.marginTop = '10px';
  rrPortraitWrap.style.display = 'flex';
  rrPortraitWrap.style.justifyContent = 'center';
  rrPortraitWrap.style.alignItems = 'center';

  const rrPortrait = document.createElement('canvas');
  rrPortrait.width = 220;
  rrPortrait.height = 220;
  rrPortrait.style.width = '220px';
  rrPortrait.style.height = '220px';
  rrPortrait.style.imageRendering = 'pixelated';
  rrPortrait.style.borderRadius = '18px';
  rrPortrait.style.border = '1px solid rgba(255,255,255,.10)';
  rrPortrait.style.background = 'rgba(0,0,0,.18)';
  rrPortrait.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.25)';
  const rrPctx = rrPortrait.getContext('2d');
  setCrisp(rrPortrait, rrPctx);

  rrPortraitWrap.appendChild(rrPortrait);

  const rrSub = document.createElement('div');
  rrSub.style.marginTop = '10px';
  rrSub.style.fontWeight = '850';
  rrSub.style.fontSize = '14px';
  rrSub.style.color = 'rgba(244,247,255,.82)';
  rrSub.style.lineHeight = '1.35';
  rrSub.style.whiteSpace = 'pre-line';

  const rrHint = document.createElement('div');
  rrHint.style.marginTop = '12px';
  rrHint.style.fontWeight = '900';
  rrHint.style.fontSize = '12px';
  rrHint.style.color = 'rgba(244,247,255,.62)';
  rrHint.textContent = '탭/클릭하면 닫혀요';

  rrCard.appendChild(rrLine);
  rrCard.appendChild(rrBig);
  rrCard.appendChild(rrPortraitWrap);
  rrCard.appendChild(rrSub);
  rrCard.appendChild(rrHint);
  roleReveal.appendChild(rrCard);
  document.body.appendChild(roleReveal);

  function drawGlassesOn(_ctx, x, y, intensity = 0.65, tNow = now()) {
    const t = tNow * 0.01;
    const shine = (Math.sin(t) * 0.5 + 0.5) * (0.14 + 0.22 * intensity);
    _ctx.save();
    _ctx.translate(x, y);
    _ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.40 * intensity})`;
    _ctx.shadowColor = `rgba(255,255,255,${0.18 * intensity})`;
    _ctx.shadowBlur = 4 * intensity;
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    _ctx.arc(-10, 0, 7.4, 0, Math.PI*2);
    _ctx.arc(10, 0, 7.4, 0, Math.PI*2);
    _ctx.moveTo(-2, 0);
    _ctx.lineTo(2, 0);
    _ctx.stroke();
    _ctx.fillStyle = `rgba(255,255,255,${0.06 + shine})`;
    _ctx.beginPath();
    _ctx.ellipse(-13, -3, 3.4, 1.8, -0.4, 0, Math.PI*2);
    _ctx.fill();
    _ctx.beginPath();
    _ctx.ellipse(7, -4, 3.8, 2.0, -0.4, 0, Math.PI*2);
    _ctx.fill();
    _ctx.restore();
  }

  function renderRolePortrait(role, practice) {
    // Draw the local player's sprite as a portrait inside the role reveal card.
    // Teacher shows glasses (local-only), crew shows normal.
    const tNow = now();
    rrPctx.save();
    rrPctx.clearRect(0, 0, rrPortrait.width, rrPortrait.height);

    // soft vignette
    const g = rrPctx.createRadialGradient(110, 78, 30, 110, 120, 160);
    g.addColorStop(0, 'rgba(255,255,255,.10)');
    g.addColorStop(1, 'rgba(0,0,0,.30)');
    rrPctx.fillStyle = g;
    rrPctx.fillRect(0, 0, rrPortrait.width, rrPortrait.height);

    // Choose a stable frame: front view, idle.
    const me = G.state?.players?.[G.net?.myPlayerId];
    const color = (me && typeof me.color === 'number') ? me.color : 0;

    if (AS.charsImg) {
      rrPctx.imageSmoothingEnabled = false;
      const MOTION_ROWS = 5;
      const DIR_ROWS = 3;
      const motionWalk = 0;
      const dirFront = 0;
      const row = ((color % COLOR_ROWS) * (MOTION_ROWS * DIR_ROWS)) + (motionWalk * DIR_ROWS) + dirFront;
      const sx = 0;
      const sy = row * SPR_H;

      // draw big (pixelated)
      const scale = 2.6;
      const dw = SPR_W * scale;
      const dh = SPR_H * scale;
      const dx = (rrPortrait.width - dw) / 2;
      const dy = 18;
      rrPctx.drawImage(AS.charsImg, sx, sy, SPR_W, SPR_H, dx, dy, dw, dh);

      // teacher glasses overlay (face position on portrait)
      if (!practice && role === 'teacher') {
        // glasses are local-only by nature (this overlay is local UI)
        const gx = rrPortrait.width / 2;
        // Glasses should sit lower on the face (mobile request)
        const gy = dy + dh * 0.46;
        drawGlassesOn(rrPctx, gx, gy, 0.9, tNow);
      }
    } else {
      // Fallback portrait
      rrPctx.fillStyle = 'rgba(255,255,255,.9)';
      rrPctx.font = '900 16px system-ui';
      rrPctx.textAlign = 'center';
      rrPctx.fillText('로딩중...', 110, 112);
    }

    // role badge bottom
    rrPctx.fillStyle = 'rgba(0,0,0,.35)';
    rrPctx.fillRect(18, 176, 184, 28);
    rrPctx.fillStyle = 'rgba(255,255,255,.92)';
    rrPctx.font = '900 13px system-ui';
    rrPctx.textAlign = 'center';
    const label = practice ? '연습 모드' : (role === 'teacher' ? '선생토끼' : '학생토끼');
    rrPctx.fillText(label, 110, 195);

    rrPctx.restore();
  }

  function showRoleReveal(role, practice) {
    try { closeMissionUI(); } catch (_) {}
    try { closeMeetingUI(); } catch (_) {}
    // role: 'teacher' | 'crew'
    const isPractice = !!practice;
    let title = '';
    let sub = '';
    let bg = '';
    let border = 'rgba(255,255,255,.12)';

    if (isPractice) {
      title = '연습 모드';
      sub = '1~3명일 때는 연습 모드야!\n(선생토끼 없음)';
      bg = 'radial-gradient(900px 420px at 50% 0%, rgba(125,211,252,.35), rgba(18,26,46,.92))';
      border = 'rgba(125,211,252,.45)';
    } else if (role === 'teacher') {
      title = '선생토끼';
      sub = '들키지 말고 검은당근으로 빵점을 줘!\n(불 끄기/물막기/강제미션 가능)';
      bg = 'radial-gradient(900px 420px at 50% 0%, rgba(255,90,122,.45), rgba(18,26,46,.92))';
      border = 'rgba(255,90,122,.55)';
    } else {
      title = '학생토끼';
      sub = '미션을 풀어 시간을 늘리자!\n(불 켜기 가능)';
      bg = 'radial-gradient(900px 420px at 50% 0%, rgba(102,224,163,.38), rgba(18,26,46,.92))';
      border = 'rgba(102,224,163,.45)';
    }

    rrBig.textContent = title;
    rrSub.textContent = sub;
    rrCard.style.background = bg;
    rrCard.style.borderColor = border;

    // portrait
    try { renderRolePortrait(role, isPractice); } catch (_) {}

    roleReveal.style.display = 'flex';
    // animate in
    requestAnimationFrame(() => {
      rrCard.style.opacity = '1';
      rrCard.style.transform = 'scale(1)';
    });

    // auto hide
    const until = now() + 1800;
    G.ui.roleRevealUntil = until;
  }

  function hideRoleReveal() {
    if (roleReveal.style.display === 'none') return;
    rrCard.style.opacity = '0';
    rrCard.style.transform = 'scale(.96)';
    setTimeout(() => { roleReveal.style.display = 'none'; }, 180);
    G.ui.roleRevealUntil = 0;
  }

  roleReveal.addEventListener('pointerdown', () => hideRoleReveal());

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

  // "모바일" 판정이 너무 보수적이면 조이스틱 UI가 안 뜨는 경우가 있어
  // coarse pointer + touchpoints 를 함께 고려
  const isMobile = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window) || ((navigator && navigator.maxTouchPoints) ? navigator.maxTouchPoints > 0 : false);
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

  function stopHeartbeat() {
    try {
      if (G.net && G.net._hb) {
        clearInterval(G.net._hb);
        G.net._hb = null;
      }
    } catch (_) {}
  }

  async function leaveRoom() {
    if (EMBED){
      // In multiroom iframe: just return to room UI
      try{ bridgeSend("sk_quit", {}); }catch(_){ }
      try{ stopHeartbeat(); }catch(_){ }
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

    stopHeartbeat();
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
    const inGame = !!(G.net && G.phase !== 'lobby');
    // lobby vs game
    if (EMBED) {
      // Embedded: never show the internal lobby overlay once we've joined.
      const joined = !!G.net || !!G.ui?.embedJoined;
      if (joined || inGame) {
        lobby?.classList.add('hidden');
        if (hud) hud.style.display = 'flex';
      } else {
        lobby?.classList.remove('hidden');
        if (hud) hud.style.display = 'none';
      }
    } else {
      if (inGame) {
        lobby?.classList.add('hidden');
        if (hud) hud.style.display = 'flex';
      } else {
        lobby?.classList.remove('hidden');
        if (hud) hud.style.display = 'none';
      }
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
    // PC map shortcut: C
    if (e.key === 'c' || e.key === 'C') toggleMapUI();
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
    pixel: {},
  };

  async function loadJSON(url, fallback=null) {
    // Prefer fetch() when served over http(s). If we are running under file://,
    // fetch() for JSON is often blocked by browser security. In that case we
    // fall back to inline JSON blobs injected by assets_inline.js.
    try{
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`fetch fail ${url} (${r.status})`);
      return await r.json();
    }catch(err){
      try{
        const M = (window.__SUHAK_INLINE_JSON__||{});
        const key = String(url||"" ).replace(/^\.\//, "").replace(/^\//,"");
        if (M[key]) return M[key];
        const base = key.split("/").pop();
        if (M[base]) return M[base];
        for (const k in M){
          if (k === key || k.endsWith("/"+base)) return M[k];
        }
      }catch(_){ }
      // Last resort: return a safe fallback so the game can still boot.
      if (fallback !== null && fallback !== undefined) return fallback;
      return null;
    }
  }

  function loadImage(url, fallbackSize=null) {
    const I = (window.__SUHAK_INLINE_IMG__ || {});
    const key = String(url || '').replace(/^\.\//, '').replace(/^\//, '');
    const base = key.split('/').pop();
    const inline = I[key] || I['assets/' + base] || I[base];

    const guessSize = ()=>{
      if (fallbackSize && typeof fallbackSize === 'object'){
        const w = Number(fallbackSize.w||fallbackSize.width||0);
        const h = Number(fallbackSize.h||fallbackSize.height||0);
        if (w>0 && h>0) return {w,h};
      }
      const u = String(url||'');
      if (u.includes('tiles_rabbithole')) return {w:256,h:256};
      if (u.includes('objects_rabbithole')) return {w:256,h:128};
      if (u.includes('chars_bunny')) return {w:384,h:384};
      return {w:64,h:64};
    };

    const makePlaceholder = ()=>{
      const {w,h} = guessSize();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = 'rgba(255,0,255,0.22)';
      g.fillRect(0,0,w,h);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 2;
      for (let i=-h;i<w;i+=12){
        g.beginPath();
        g.moveTo(i,0);
        g.lineTo(i+h,h);
        g.stroke();
      }
      return c;
    };

    return new Promise((res) => {
      const im = new Image();
      let triedInline = false;
      im.onload = () => res(im);
      im.onerror = () => {
        if (!triedInline && inline) {
          triedInline = true;
          im.src = inline;
          return;
        }
        // Give up but keep booting.
        res(makePlaceholder());
      };
      try{ im.src = url; }catch(_){ res(makePlaceholder()); }
    });
  }

  // Green-screen keying (EXACT): only RGB(0,255,0) becomes transparent.
  // This prevents accidental holes in the sprite caused by HSV/threshold keying.
  function greenKeyExact(src) {
    try {
      const c = document.createElement('canvas');
      c.width = src.width | 0;
      c.height = src.height | 0;
      const cctx = c.getContext('2d');
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(src, 0, 0);
      const id = cctx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === 0 && d[i + 1] === 255 && d[i + 2] === 0 && d[i + 3] === 255) {
          d[i + 3] = 0;
        }
      }
      cctx.putImageData(id, 0, 0);
      return c;
    } catch (_) {
      return src;
    }
  }

  // ---------- Tokki pixel sprite generator ----------
  // Builds a full v3-style sprite sheet (same layout as chars_bunny_v3.png):
  //   columns: 6 frames
  //   rows: (8 colors) * (5 motions) * (3 directions)
  // Source: palette-indexed 32x36 pixel data (tokki_data.js), scaled to 64x72.
  function buildTokkiSpriteSheet() {
    // tokki_data.js must be loaded before game.js
    if (typeof TOKKI_W === 'undefined' || typeof TOKKI_VIEW_0 === 'undefined') {
      throw new Error('tokki_data.js not loaded');
    }

    const W = TOKKI_W, H = TOKKI_H;
    const pal = TOKKI_PALETTE;
    const palLen = Math.floor(pal.length / 4);

    // dir mapping in this game: 0=front, 1=back, 2=side
    const DIRS = [
      { view: TOKKI_VIEW_1, dress: TOKKI_VIEW_1_DRESS, ear: TOKKI_VIEW_1_EAR, bag: (typeof TOKKI_VIEW_1_BAG !== 'undefined' ? TOKKI_VIEW_1_BAG : null) },
      { view: TOKKI_VIEW_2, dress: TOKKI_VIEW_2_DRESS, ear: TOKKI_VIEW_2_EAR, bag: (typeof TOKKI_VIEW_2_BAG !== 'undefined' ? TOKKI_VIEW_2_BAG : null) },
      { view: TOKKI_VIEW_0, dress: TOKKI_VIEW_0_DRESS, ear: TOKKI_VIEW_0_EAR, bag: (typeof TOKKI_VIEW_0_BAG !== 'undefined' ? TOKKI_VIEW_0_BAG : null) },
    ];

    const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b);

    // precompute average dress luminance per dir-view (for shading preservation)
    const avgDressLum = DIRS.map(({ view, dress }) => {
      let s = 0, n = 0;
      for (let i = 0; i < view.length; i++) {
        if (!dress[i]) continue;
        const idx = view[i] | 0;
        if (idx <= 0 || idx >= palLen) continue;
        const r = pal[idx * 4 + 0], g = pal[idx * 4 + 1], b = pal[idx * 4 + 2];
        s += lum(r, g, b);
        n++;
      }
      return n ? (s / n) : 120;
    });

    // player color variants (dress tint) matching the in-game COLORS order
    const DRESS_RGB = [
      [59, 130, 246],  // blue
      [34, 197, 94],   // green
      [236, 72, 153],  // pink
      [250, 204, 21],  // yellow
      [168, 85, 247],  // purple
      [249, 115, 22],  // orange
      [20, 184, 166],  // teal
      [239, 68, 68],   // red
    ];

    const clamp01 = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));
    const clamp255 = (x) => (x < 0 ? 0 : (x > 255 ? 255 : x));

    // Apply shading by scaling toward white/black based on luminance ratio.
    function shadeToTarget(rgb, ratio) {
      // ratio ~ [0.7 .. 1.35]
      const t = clamp01((ratio - 0.65) / (1.35 - 0.65));
      const dark = 0.72, light = 1.18;
      const s = dark + (light - dark) * t;
      return [
        clamp255(rgb[0] * s),
        clamp255(rgb[1] * s),
        clamp255(rgb[2] * s),
      ];
    }

    // Fixed walk frames (3 unique frames: mid/left/right) mapped into the engine's 6-frame cycle.
    // This avoids jittery bobbing and makes the stepping read like real pixel animation.
    const WALK_FRAME_MAP = [0, 1, 0, 2, 0, 1];

    // Swim can stay slightly bobbed (works well for teachers in water)
    const SWIM_BOB = [0, -1, -1, 0, 1, 0];
    const SWIM_EAR = [0, 0, -1, 0, 1, 0];

    function cloneU8(a) { return new Uint8Array(a); }

    function movePixelsByPredicate(src, pred, dx, dy) {
      const out = cloneU8(src);
      const moved = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const v = src[i] | 0;
          if (!v) continue;
          if (!pred(i, x, y, v)) continue;
          moved.push([x, y, v]);
          out[i] = 0;
        }
      }
      for (let k = 0; k < moved.length; k++) {
        const x = moved[k][0], y = moved[k][1], v = moved[k][2];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        out[ny * W + nx] = v;
      }
      return out;
    }

    function moveMask(src, mask, dx, dy) {
      if (!mask) return src;
      return movePixelsByPredicate(src, (i) => (mask[i] ? true : false), dx, dy);
    }

    // Build 3 walk frames for each direction: mid, left-step, right-step.
    function makeWalk3Frames(dirIndex, def) {
      const mid = def.view;

      // Ear wiggle + bag bounce (fixed per frame)
      const earDY_L = -1, earDY_R = 1;
      const bagDY_L = 1, bagDY_R = -1;

      // 1) start from base
      let left = cloneU8(mid);
      let right = cloneU8(mid);

      // 2) ears
      left = moveMask(left, def.ear, 0, earDY_L);
      right = moveMask(right, def.ear, 0, earDY_R);

      // 3) bag (if mask is missing, use a small bbox on the back view)
      if (def.bag && def.bag.some && def.bag.some(v => v)) {
        left = moveMask(left, def.bag, 0, bagDY_L);
        right = moveMask(right, def.bag, 0, bagDY_R);
      } else if (dirIndex === 1) {
        // back view: approximate bag bbox
        const bagPred = (i, x, y) => (x >= 20 && x <= 26 && y >= 20 && y <= 30);
        left = movePixelsByPredicate(left, (i,x,y,v) => bagPred(i,x,y) && v && !def.dress[i], 0, bagDY_L);
        right = movePixelsByPredicate(right, (i,x,y,v) => bagPred(i,x,y) && v && !def.dress[i], 0, bagDY_R);
      }

      // 4) feet / step read
      if (dirIndex === 0 || dirIndex === 1) {
        // front/back: split left/right foot and lift the opposite slightly
        const y0 = 33, y1 = 35;
        const lf = (i, x, y) => (y >= y0 && y <= y1 && x >= 13 && x <= 15);
        const rf = (i, x, y) => (y >= y0 && y <= y1 && x >= 16 && x <= 18);

        left = movePixelsByPredicate(left, (i,x,y,v) => lf(i,x,y) && v, -1, 0);
        left = movePixelsByPredicate(left, (i,x,y,v) => rf(i,x,y) && v, 0, -1);

        right = movePixelsByPredicate(right, (i,x,y,v) => rf(i,x,y) && v, 1, 0);
        right = movePixelsByPredicate(right, (i,x,y,v) => lf(i,x,y) && v, 0, -1);

        // arm swing (subtle): shift sleeve/hand clusters
        const lArm = (i,x,y) => (x >= 9 && x <= 12 && y >= 19 && y <= 24);
        const rArm = (i,x,y) => (x >= 19 && x <= 22 && y >= 19 && y <= 24);
        left = movePixelsByPredicate(left, (i,x,y,v) => lArm(i,x,y) && v && !def.dress[i], 0, -1);
        left = movePixelsByPredicate(left, (i,x,y,v) => rArm(i,x,y) && v && !def.dress[i], 0, 1);
        right = movePixelsByPredicate(right, (i,x,y,v) => lArm(i,x,y) && v && !def.dress[i], 0, 1);
        right = movePixelsByPredicate(right, (i,x,y,v) => rArm(i,x,y) && v && !def.dress[i], 0, -1);

      } else {
        // side: swing single foot and a tiny arm/bag shift already handles most of the read
        const foot = (i, x, y) => (y >= 33 && y <= 35 && x >= 15 && x <= 17);
        left = movePixelsByPredicate(left, (i,x,y,v) => foot(i,x,y) && v, 1, 0);
        right = movePixelsByPredicate(right, (i,x,y,v) => foot(i,x,y) && v, -1, 0);
        const arm = (i,x,y) => (x >= 18 && x <= 21 && y >= 19 && y <= 24);
        left = movePixelsByPredicate(left, (i,x,y,v) => arm(i,x,y) && v && !def.dress[i], 0, 1);
        right = movePixelsByPredicate(right, (i,x,y,v) => arm(i,x,y) && v && !def.dress[i], 0, -1);
      }

      return [mid, left, right];
    }

    const WALK3 = DIRS.map((d, i) => makeWalk3Frames(i, d));

    function paintRGBA(rgba, x, y, r, g, b, a) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      rgba[o + 0] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }

    function renderRGBA(dir, colorIdx, motion, frame) {
      const def = DIRS[dir];
      const wfi = (motion === 0 /* walk */) ? (WALK_FRAME_MAP[frame] | 0) : 0;
      const view = (motion === 0 /* walk */) ? (WALK3[dir][wfi] || def.view) : def.view;
      const dress = def.dress;
      const ear = def.ear;

      const bob = (motion === 1 /* swim */) ? SWIM_BOB[frame] : 0;
      const earW = (motion === 1 /* swim */) ? SWIM_EAR[frame] : 0;

      // palette indices after motion offsets
      const dstIdx = new Uint16Array(W * H);
      const dstDress = new Uint8Array(W * H);

      // motion: 0 walk, 1 swim, 2 faint, 3 cry, 4 tsk
      // for non-walk motions (except swim), keep minimal bob to reduce jitter
      const bobY = (motion <= 1) ? bob : 0;
      const earDY = (motion <= 1) ? earW : 0;

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const idx = view[i] | 0;
          if (!idx) continue;
          let ny = y + bobY;
          let nx = x;
          // subtle ear wiggle only
          if (ear[i]) ny += earDY;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const di = ny * W + nx;
          dstIdx[di] = idx;
          if (dress[i]) dstDress[di] = 1;
        }
      }

      // Convert to RGBA + recolor dress
      const rgba = new Uint8ClampedArray(W * H * 4);
      const target = DRESS_RGB[(colorIdx | 0) % DRESS_RGB.length];
      const refLum = avgDressLum[dir] || 120;

      for (let i = 0; i < dstIdx.length; i++) {
        const idx = dstIdx[i] | 0;
        if (!idx || idx >= palLen) continue;
        let r = pal[idx * 4 + 0], g = pal[idx * 4 + 1], b = pal[idx * 4 + 2], a = pal[idx * 4 + 3];
        if (dstDress[i]) {
          const ratio = lum(r, g, b) / refLum;
          const rr = shadeToTarget(target, ratio);
          r = rr[0]; g = rr[1]; b = rr[2];
        }
        const o = i * 4;
        rgba[o + 0] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = a;
      }

      // Small emote overlays (front/back/side all get them; front looks best)
      if (motion === 3 /* cry */) {
        const t = frame % 4;
        const dx = (t === 1 || t === 2) ? 0 : 1;
        // tear drops
        paintRGBA(rgba, 12, 18 + dx, 125, 211, 252, 235);
        paintRGBA(rgba, 19, 18 + dx, 125, 211, 252, 235);
        paintRGBA(rgba, 12, 19 + dx, 125, 211, 252, 210);
        paintRGBA(rgba, 19, 19 + dx, 125, 211, 252, 210);
      } else if (motion === 4 /* tsk */) {
        const t = frame % 3;
        // tiny anger mark near top-right
        paintRGBA(rgba, 22, 10, 255, 90, 122, 240);
        if (t === 1) paintRGBA(rgba, 23, 9, 255, 90, 122, 230);
        if (t === 2) paintRGBA(rgba, 21, 9, 255, 90, 122, 230);
        // mouth wiggle
        paintRGBA(rgba, 16, 18, 0, 0, 0, 0); // clear
        paintRGBA(rgba, 16 + (t - 1), 18, 56, 10, 27, 255);
      }

      return rgba;
    }

    // --- Build sheet ---
    const sheet = document.createElement('canvas');
    sheet.width = SPR_W * FRAMES;
    sheet.height = SPR_H * (COLOR_ROWS * 5 * 3);
    const sctx = sheet.getContext('2d');
    sctx.imageSmoothingEnabled = false;

    // tiny (32x36) buffer canvas
    const tiny = document.createElement('canvas');
    tiny.width = W;
    tiny.height = H;
    const tctx = tiny.getContext('2d');
    tctx.imageSmoothingEnabled = false;

    // 64x72 cell canvas (used for rotation in faint)
    const cell = document.createElement('canvas');
    cell.width = SPR_W;
    cell.height = SPR_H;
    const cctx = cell.getContext('2d');
    cctx.imageSmoothingEnabled = false;

    // motion row mapping must match drawPlayer()
    const MOTION = { walk: 0, swim: 1, faint: 2, cry: 3, tsk: 4 };

    function drawScaledRGBA(rgba32, dx, dy) {
      const img = new ImageData(rgba32, W, H);
      tctx.clearRect(0, 0, W, H);
      tctx.putImageData(img, 0, 0);
      sctx.drawImage(tiny, 0, 0, W, H, dx, dy, SPR_W, SPR_H);
    }

    // Build each row into the sheet
    for (let color = 0; color < COLOR_ROWS; color++) {
      for (let motion = 0; motion < 5; motion++) {
        for (let dir = 0; dir < 3; dir++) {
          const row = color * (5 * 3) + motion * 3 + dir;
          const baseY = row * SPR_H;
          for (let f = 0; f < FRAMES; f++) {
            const x = f * SPR_W;

            // faint: 2 frames used; rotate front sprite to look "down"
            if (motion === MOTION.faint) {
              const useF = (f % 2);
              const rgba32 = renderRGBA(0, color, 0, 0); // front idle as base
              cctx.clearRect(0, 0, SPR_W, SPR_H);
              // draw base scaled into cell
              const img = new ImageData(rgba32, W, H);
              tctx.clearRect(0, 0, W, H);
              tctx.putImageData(img, 0, 0);
              cctx.save();
              // Shift the rotated body slightly downward so the "fainted" bunny lies on the floor
              // (and doesn't look like it's floating).
              cctx.translate(SPR_W / 2, SPR_H / 2 + 10);
              cctx.rotate(-Math.PI / 2 + (useF ? 0.06 : -0.04));
              cctx.drawImage(tiny, -SPR_W / 2, -SPR_H / 2, SPR_W, SPR_H);
              cctx.restore();
              sctx.drawImage(cell, 0, 0, SPR_W, SPR_H, x, baseY, SPR_W, SPR_H);
              continue;
            }

            // cry/tsk: only a few frames are referenced, others duplicate
            let rf = f;
            if (motion === MOTION.cry) rf = f % 4;
            if (motion === MOTION.tsk) rf = f % 3;
            if (motion === MOTION.walk || motion === MOTION.swim) rf = f; // 0..5

            const rgba32 = renderRGBA(dir, color, motion, rf);
            drawScaledRGBA(rgba32, x, baseY);
          }
        }
      }
    }

    return sheet;
  }

  async function loadAssets() {
    // Ultra-defensive loading: Cloudflare Worker/PAGES routing or CSP can make asset fetch fail.
    // We always fall back to inline blobs or a minimal built-in map so the game can still run.
    const DEFAULT_TILES_META = { tileSize: 32, columns: 8, tiles: {} };
    const DEFAULT_OBJS_META  = { tileSize: 32, columns: 8, objects: {} };
    const makeFallbackMap = ()=>{
      const W=20, H=20;
      const ground=new Array(W*H).fill(0);
      for (let y=H-2; y<H; y++) for (let x=0; x<W; x++) ground[y*W+x]=1;
      return {
        name: 'FallbackBurrow',
        tileSize: 32,
        width: W,
        height: H,
        layers: { ground, decor: new Array(W*H).fill(0) },
        rooms: [],
        objects: [],
        spawnPoints: [{ x: 2, y: H-3 }]
      };
    };

    AS.tilesMeta = await loadJSON('assets/tiles_rabbithole.json', DEFAULT_TILES_META);
    AS.objsMeta  = await loadJSON('assets/objects_rabbithole.json', DEFAULT_OBJS_META);
    AS.map       = await loadJSON('assets/map_mathburrow_01.json', makeFallbackMap());

    if (!AS.tilesMeta) AS.tilesMeta = DEFAULT_TILES_META;
    if (!AS.objsMeta) AS.objsMeta = DEFAULT_OBJS_META;
    if (!AS.map || !AS.map.layers) AS.map = makeFallbackMap();

    AS.tilesImg = await loadImage('assets/tiles_rabbithole.png');
    AS.objsImg = await loadImage('assets/objects_rabbithole.png');
    // Character sprites: prefer the tokki_data-based generator (3-pose) for deterministic layout.
    // Fallback to PNG only if generator fails (e.g., tokki_data missing).
    try {
      AS.charsImg = buildTokkiSpriteSheet();
    } catch (e) {
      console.warn('[tokki] sprite build failed; falling back to chars_bunny_v3.png', e);
      try {
        AS.charsImg = greenKeyExact(await loadImage('assets/chars_bunny_v3.png'));
      } catch (e2) {
        console.warn('[tokki] chars png load failed', e2);
        AS.charsImg = null;
      }
    }

    // Custom pixel-art pack (user provided)
    // (All images are optional; game falls back to default rendering if missing.)
    AS.pixel = {};
    const px = [
      ['floor_tile', 'assets/pixel/floor_tile.png'],
      ['corridor_dirt_tile', 'assets/pixel/corridor_dirt_tile.png'],
      ['wall', 'assets/pixel/wall.png'],
      ['wall_alt', 'assets/pixel/wall_alt.png'],
      ['vent', 'assets/pixel/vent.png'],
      ['water_overflow_sheet', 'assets/pixel/water_overflow_sheet.png'],
      ['rock_1', 'assets/pixel/rock_1.png'],
      ['rock_2', 'assets/pixel/rock_2.png'],
      ['round_table', 'assets/pixel/round_table.png'],
      ['diamond_table', 'assets/pixel/diamond_table.png'],
      ['megaphone', 'assets/pixel/megaphone.png'],
      ['street_lamp', 'assets/pixel/street_lamp.png'],
      ['floor_lamp', 'assets/pixel/floor_lamp.png'],
      // clearer ON/OFF lamp sprites (OFF is visibly dimmer)
      ['street_lamp_off', 'assets/pixel/street_lamp_off.png'],
      ['floor_lamp_off', 'assets/pixel/floor_lamp_off.png'],
      ['rock_diamond_decor', 'assets/pixel/rock_diamond_decor.png'],
      ['vine_door_closed', 'assets/pixel/vine_door_closed.png'],
      ['vine_door_side', 'assets/pixel/vine_door_side.png'],
      ['vine_door_open', 'assets/pixel/vine_door_open.png'],
      // Side-entrance (left/right) door sprites (separate design)
      ['vine_door_lr_closed', 'assets/pixel/vine_door_lr_closed.png'],
      ['vine_door_lr_open', 'assets/pixel/vine_door_lr_open.png'],
      ['teacher_basic_sheet', 'assets/pixel/teacher_basic_sheet.png'],
      ['teacher_kill0_sheet', 'assets/pixel/teacher_kill0_sheet.png'],
      ['teacher_tch_sheet', 'assets/pixel/teacher_tch_sheet.png'],
    ];
    await Promise.all(px.map(async ([k, url]) => {
      try { AS.pixel[k] = greenKeyExact(await loadImage(url)); }
      catch (e) { AS.pixel[k] = null; }
    }));
  }

  // ---------- Render sizing ----------
  let DPR = Math.max(1, (window.devicePixelRatio || 1));
  let viewW = 0, viewH = 0;

  // Snap a CSS-pixel coordinate to the nearest device pixel (keeps pixel art crisp
  // even on fractional DPR like 1.25/1.5).
  const snapPx = (v) => Math.round(v * DPR) / DPR;

  function resize() {
    DPR = Math.max(1, (window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    // canvas는 화면을 꽉 쓰되, 둥근 모서리 유지
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    viewW = w;
    viewH = h;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Game constants ----------
  const TS = 32;
  const ZOOM = 1; // 화면 확대(픽셀 퍼펙트). 1=기본, 2=2배

  const PLAYER_R = 14;
  const SPEED = 184; // px/s
  // Teacher "0점" must be very close ("붙어야"), so keep the range tight.
  // (Still leaves a little forgiveness for touch input.)
  const KILL_RANGE = 30;
  const INTERACT_RANGE = 112;
  // Missions should require getting a bit closer than doors/meeting.
  const MISSION_INTERACT_RANGE = 72;
  const VENT_TRAVEL_MS = 850;
  const VENT_COOLDOWN_MS = 4500;
  const FORCE_COOLDOWN_MS = 40_000;

  const COLOR_ROWS = 8; // sprite rows
  const FRAMES = 6; // sprite cols
  const SPR_W = 64, SPR_H = 72;

  const COLORS = [
    { name: '파랑', row: 0 },
    { name: '초록', row: 1 },
    { name: '핑크', row: 2 },
    { name: '노랑', row: 3 },
    { name: '보라', row: 4 },
    { name: '주황', row: 5 },
    { name: '청록', row: 6 },
    { name: '빨강', row: 7 },
  ];

  // ---------- Map pre-render ----------
  let mapCanvas = null;
  let solid = null; // boolean grid

  function tileIsSolid(id) {
    const n = Number(id)||0;
    const tm = AS.tilesMeta;
    if (!tm || !tm.tiles) return n !== 0;
    const t = tm.tiles?.[String(id)];
    if (t && typeof t.solid !== 'undefined') return !!t.solid;
    // Safe default: treat any non-zero tile id as solid.
    return n !== 0;
  }

  // Cached pixel-decor placements (prevents \"invisible collision\" when we also mark decor tiles solid)
  let PIXEL_DECOR_CACHE = null;

    function getPixelDecorPlacements(solidRef) {
    if (PIXEL_DECOR_CACHE) return PIXEL_DECOR_CACHE;
    const solidGrid = solidRef || solid;
    // Static, non-networked decorations to make the burrow feel more "Among-Us".
    // We keep these out of the network/state to avoid desync.
    const out = [];
    if (!AS.map || !AS.pixel) return out;

    const W = AS.map.width | 0;
    const H = AS.map.height | 0;

    // Avoid placing decor on top of interactive objects.
    const occ = new Set();
    for (const o of (AS.map.objects || [])) {
      occ.add(`${o.x|0},${o.y|0}`);
    }

    const roomRect = (id) => (AS.map.rooms || []).find(r => r.id === id)?.rect || null;
    const inAnyRoom = (tx, ty) => {
      for (const r of (AS.map.rooms || [])) {
        const rect = r && r.rect;
        if (!rect) continue;
        const [rx, ry, rw, rh] = rect;
        if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) return true;
      }
      return false;
    };
    const roomIdAt = (tx, ty) => {
      for (const r of (AS.map.rooms || [])) {
        const rect = r && r.rect;
        if (!rect) continue;
        const [rx, ry, rw, rh] = rect;
        if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) return r.id || null;
      }
      return null;
    };
    const okTile = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (occ.has(`${tx|0},${ty|0}`)) return false;
      // If collision map already exists, don't place on blocked tiles.
      if (solidGrid && solidGrid[ty * W + tx]) return false;
      return true;
    };

    const add = (key, tx, ty, w = 64, h = 64, solidFlag = true) => {
      if (!AS.pixel[key]) return;
      if (!okTile(tx, ty)) return;
      out.push({ key, tx, ty, w, h, solid: !!solidFlag, roomId: roomIdAt(tx, ty) });
    };

    // Useful map layer helpers (for corridor/edge decoration).
    const ground = (AS.map.layers && AS.map.layers.ground) ? AS.map.layers.ground : [];
    const walls = (AS.map.layers && AS.map.layers.walls) ? AS.map.layers.walls : [];
    const hasAny = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      const i = ty * W + tx;
      return !!(ground[i] || walls[i]);
    };
    const isWall = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      return !!walls[ty * W + tx];
    };
    const nearWallEdge = (tx, ty) => {
      // walkable tile with at least one adjacent wall
      if (!hasAny(tx, ty)) return false;
      if (isWall(tx, ty)) return false;
      return isWall(tx+1, ty) || isWall(tx-1, ty) || isWall(tx, ty+1) || isWall(tx, ty-1);
    };

    // Helper: place 4 corner lamps in a room (keeps middle open)
    const lampCorners = (rr) => {
      if (!rr) return;
      const [rx, ry, rw, rh] = rr;
      add('floor_lamp', rx + 2, ry + 2, 32, 32, true);
      add('floor_lamp', rx + rw - 3, ry + 2, 32, 32, true);
      add('floor_lamp', rx + 2, ry + rh - 3, 32, 32, true);
      add('floor_lamp', rx + rw - 3, ry + rh - 3, 32, 32, true);
    };

    // Admin: meeting-like table + lamps + small crystal
    {
      const rr = roomRect('admin');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('diamond_table', rx + Math.floor(rw / 2), ry + Math.floor(rh / 2), 64, 64, true);
        add('rock_diamond_decor', rx + 3, ry + 3, 32, 32, true);
        // more obvious lamps
        add('street_lamp', rx + 3, ry + rh - 4, 64, 64, true);
        add('street_lamp', rx + rw - 4, ry + 3, 64, 64, true);
      }
    }

    // Security: monitors vibe (lamps + rocks)
    {
      const rr = roomRect('security');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('floor_lamp', rx + 2, ry + rh - 3, 32, 32, true);
        add('floor_lamp', rx + rw - 3, ry + 2, 32, 32, true);
        add('rock_1', rx + Math.floor(rw / 2), ry + 3, 64, 64, true);
        add('rock_2', rx + 3, ry + 3, 64, 64, true);
      }
    }

    // Lab: table-heavy (different feel) + lamps
    {
      const rr = roomRect('lab');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('diamond_table', rx + Math.floor(rw / 2), ry + 4, 64, 64, true);
        add('round_table', rx + 3, ry + rh - 4, 64, 64, true);
        add('floor_lamp', rx + 2, ry + 2, 32, 32, true);
        add('floor_lamp', rx + rw - 3, ry + rh - 3, 32, 32, true);
      }
    }

    // Reactor: big crystal + rocks + lamps
    {
      const rr = roomRect('reactor');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('rock_diamond_decor', rx + Math.floor(rw / 2), ry + Math.floor(rh / 2), 64, 64, true);
        add('rock_2', rx + 3, ry + rh - 4, 64, 64, true);
        add('rock_1', rx + rw - 5, ry + 3, 64, 64, true);
        add('street_lamp', rx + 2, ry + 2, 64, 64, true);
      }
    }

    // Warren hall: street lamps + rocks along edges (wide hall)
    {
      const rr = roomRect('warren');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('street_lamp', rx + 3, ry + 2, 64, 64, true);
        add('street_lamp', rx + rw - 4, ry + 2, 64, 64, true);
        add('rock_1', rx + 4, ry + rh - 3, 64, 64, true);
        add('rock_2', rx + rw - 5, ry + rh - 3, 64, 64, true);
        add('round_table', rx + Math.floor(rw/2), ry + Math.floor(rh/2), 64, 64, true);
      }
    }

    // Rootworks: cluttered workshop feel
    {
      const rr = roomRect('rootworks');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('diamond_table', rx + 6, ry + 4, 64, 64, true);
        add('rock_2', rx + rw - 7, ry + 4, 64, 64, true);
        add('floor_lamp', rx + 2, ry + rh - 3, 32, 32, true);
        add('floor_lamp', rx + rw - 3, ry + rh - 3, 32, 32, true);
        add('rock_1', rx + Math.floor(rw/2), ry + Math.floor(rh/2), 64, 64, true);
      }
    }

    // Mushroom grove: decorative crystals/rocks, keep path open
    {
      const rr = roomRect('mushroom');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('rock_diamond_decor', rx + 5, ry + 5, 32, 32, true);
        add('rock_diamond_decor', rx + rw - 6, ry + 6, 32, 32, true);
        add('rock_1', rx + 6, ry + rh - 5, 64, 64, true);
        add('rock_2', rx + rw - 7, ry + rh - 5, 64, 64, true);
        add('street_lamp', rx + Math.floor(rw/2), ry + 2, 64, 64, true);
      }
    }

    // Med nook / Storage: smaller props
    {
      const rr = roomRect('med');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('floor_lamp', rx + 2, ry + 2, 32, 32, true);
        add('rock_diamond_decor', rx + rw - 4, ry + rh - 4, 32, 32, true);
        add('round_table', rx + Math.floor(rw/2), ry + Math.floor(rh/2), 64, 64, true);
      }
    }
    {
      const rr = roomRect('storage');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        // storage: rocks pile
        add('rock_1', rx + Math.floor(rw / 2), ry + Math.floor(rh / 2), 64, 64, true);
        add('rock_2', rx + 3, ry + 3, 64, 64, true);
        add('rock_2', rx + rw - 4, ry + rh - 4, 64, 64, true);
        add('floor_lamp', rx + 2, ry + 2, 32, 32, true);
        add('floor_lamp', rx + rw - 3, ry + 2, 32, 32, true);
      }
    }

    // Meeting bell room: a small megaphone prop (non-solid)
    {
      const rr = roomRect('meeting');
      if (rr && AS.pixel.megaphone) {
        const [rx, ry, rw, rh] = rr;
        add('megaphone', rx + Math.max(2, Math.floor(rw/2)-1), ry + 2, 32, 32, false);
      }
    }

    // Scatter tiny "crystal pebbles" around corridor edges (non-solid, purely visual)
    // This makes the burrow feel less empty while avoiding invisible collision.
    const seed = strHash(AS.map.name || 'map');
    const hash2 = (x, y) => {
      // cheap deterministic hash
      let h = (seed ^ (x*374761393) ^ (y*668265263)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (h ^ (h >>> 16)) >>> 0;
    };
    for (let ty = 2; ty < H-2; ty++) {
      for (let tx = 2; tx < W-2; tx++) {
        if (!okTile(tx, ty)) continue;
        // skip rooms; focus on corridors to add life
        if (inAnyRoom(tx, ty)) continue;
        if (!nearWallEdge(tx, ty)) continue;
        const r = hash2(tx, ty) / 0xFFFFFFFF;
        if (r < 0.028) {
          // small pebble/crystal (visual only)
          add('rock_diamond_decor', tx, ty, 24, 24, false);
        } else if (r < 0.040) {
          add('rock_2', tx, ty, 48, 48, false);
        }
      }
    }

    PIXEL_DECOR_CACHE = out;
    return out;
  }

  function buildCollision() {
    const { width: W, height: H } = AS.map;
    solid = new Uint8Array(W * H);
    // NOTE:
    // - "빈"(ground=0) 타일은 맵 안이어도 실제로는 void(검은 영역)처럼 보이므로
    //   아예 걸을 수 없게 막아줘야 한다.
    // - 일부 맵은 deco 레이어에 시각적 벽(충돌이 있어야 하는 것)을 올려둔다.
    //   그래서 walls + deco + (필요 시) ground의 solid 플래그를 모두 반영한다.
    const ground = AS.map.layers.ground || [];
    const walls = AS.map.layers.walls || [];
    const deco = AS.map.layers.deco || [];
    for (let i = 0; i < solid.length; i++) {
      const gid = ground[i] || 0;
      const wid = walls[i] || 0;
      const did = deco[i] || 0;

      // void: ground 자체가 없으면 "맵 밖" 취급(검은 영역 방지)
      if (!gid && !wid && !did) {
        solid[i] = 1;
        continue;
      }

      if ((gid && tileIsSolid(gid)) || (wid && tileIsSolid(wid)) || (did && tileIsSolid(did))) {
        solid[i] = 1;
      }
    }

    // Make the emergency meeting table tile solid (players stand around it, not on it)
    for (const o of (AS.map.objects || [])) {
      if (o.type !== 'meeting_bell') continue;
      const tx = o.x | 0, ty = o.y | 0;
      if (tx >= 0 && ty >= 0 && tx < W && ty < H) solid[ty * W + tx] = 1;
    }

    // Static decor collisions
    for (const d of getPixelDecorPlacements()) {
      if (!d.solid) continue;
      const tx = d.tx | 0, ty = d.ty | 0;
      if (tx >= 0 && ty >= 0 && tx < W && ty < H) solid[ty * W + tx] = 1;
    }
  }

  function buildMapPrerender() {
    const { width: W, height: H } = AS.map;
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = W * TS;
    mapCanvas.height = H * TS;
    const mctx = mapCanvas.getContext('2d');
    mctx.imageSmoothingEnabled = false;

    const ground = AS.map.layers.ground || [];
    const walls = AS.map.layers.walls || [];
    const deco = AS.map.layers.deco || [];

    // If the custom pack is available, draw the map using it.
    const floorImg = AS.pixel?.floor_tile;
    const corrImg = AS.pixel?.corridor_dirt_tile || floorImg;
    const wallImg = AS.pixel?.wall;
    const wallAltImg = AS.pixel?.wall_alt || wallImg;

    // dark void
    mctx.fillStyle = 'rgb(12,16,26)';
    mctx.fillRect(0, 0, W * TS, H * TS);

    const inAnyRoom = (tx, ty) => {
      for (const r of (AS.map.rooms || [])) {
        const [rx, ry, rw, rh] = r.rect;
        if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) return true;
      }
      return false;
    };

    if (floorImg) {
      // floors
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const has = (ground[i] || walls[i] || deco[i]);
          if (!has) continue;
          const use = inAnyRoom(x, y) ? floorImg : corrImg;
          if (use) mctx.drawImage(use, 0, 0, use.width, use.height, x * TS, y * TS, TS, TS);

          // subtle floor variation (deterministic) so large areas don't look flat
          const h = ((x * 92837111) ^ (y * 689287499)) >>> 0;
          const r = (h % 97) / 97;
          if (r < 0.06) {
            mctx.save();
            mctx.fillStyle = 'rgba(0,0,0,.06)';
            mctx.fillRect(x * TS + 6, y * TS + 22, 10, 4);
            mctx.restore();
          } else if (r < 0.09) {
            mctx.save();
            mctx.fillStyle = 'rgba(255,255,255,.05)';
            mctx.fillRect(x * TS + 18, y * TS + 10, 8, 3);
            mctx.restore();
          }
        }
      }

      // walls (+ solid deco tiles). Some maps use the "deco" layer for solid blockers.
      // When we render with the custom pixel pack, those blockers could become invisible
      // unless we draw them as walls too.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const solidDeco = !!(deco[i] && tileIsSolid(deco[i]));
          if (!walls[i] && !solidDeco) continue;
          const use = ((x + y) % 2 === 0) ? wallImg : wallAltImg;
          if (use) mctx.drawImage(use, 0, 0, use.width, use.height, x * TS, y * TS, TS, TS);
        }
      }

      // ambient occlusion-ish shadows to make walls readable (prevents "invisible" blockers)
      const isWallTile = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const i = y * W + x;
        return !!walls[i] || !!(deco[i] && tileIsSolid(deco[i]));
      };
      const isWalkableTile = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const i = y * W + x;
        // treat solid deco tiles as non-walkable
        return !!(ground[i] || deco[i] || walls[i]) && !walls[i] && !(deco[i] && tileIsSolid(deco[i]));
      };
      mctx.save();
      mctx.fillStyle = 'rgba(0,0,0,.22)';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isWallTile(x, y)) continue;
          // shadow onto the tile below
          if (isWalkableTile(x, y + 1)) {
            mctx.fillRect(x * TS, (y + 1) * TS, TS, 6);
          }
          // shadow onto the tile to the right
          if (isWalkableTile(x + 1, y)) {
            mctx.fillRect((x + 1) * TS, y * TS, 6, TS);
          }
        }
      }
      mctx.restore();
    } else {
      // fallback to original tilesheet
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
      drawLayer(ground);
      drawLayer(walls);
      drawLayer(deco);
    }
    // static decorations (with shadows)
    for (const d of getPixelDecorPlacements()) {
      const isLamp = /lamp|street_lamp|floor_lamp/i.test(d.key);
      if (isLamp) continue; // lamps are dynamic (can be turned on/off)
      const im = AS.pixel[d.key];
      if (!im) continue;
      const px = (d.tx + 0.5) * TS - d.w / 2;
      const py = (d.ty + 0.5) * TS - d.h / 2;

      // drop shadow (depth)
      const cx = Math.floor(px + d.w / 2);
      const sy = Math.floor(py + d.h * 0.72);
      mctx.save();
      mctx.fillStyle = 'rgba(0,0,0,.30)';
      mctx.beginPath();
      mctx.ellipse(cx, sy, d.w * 0.28, d.h * 0.10, 0, 0, Math.PI * 2);
      mctx.fill();
      mctx.restore();

      // draw sprite
      mctx.drawImage(im, 0, 0, im.width, im.height, Math.floor(px), Math.floor(py), d.w, d.h);

    }
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
      // Track peers for deterministic leader election (fixes "2명만 보임/연습모드" split-host issue)
      this.peers = new Map(); // id -> lastSeen(ms)
      this._helloTimer = null;
      this._watchTimer = null;

      this.bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || (msg.room && msg.room !== this.room)) return;
        const tNow = Date.now();
        if (msg.from) this.peers.set(String(msg.from), tNow);
        if (msg.t === 'hello') {
          // peer discovery
          if (msg.from) this.peers.set(String(msg.from), tNow);
        }
        if (msg.t === 'host') {
          this.lastHostSeen = tNow;
          if (msg.hostId) {
            // Always converge to the smallest known hostId
            const hid = String(msg.hostId);
            if (!this.hostId || hid < this.hostId) this.hostId = hid;
            // If I'm host but another smaller host exists, step down.
            if (this.isHost && this.hostId !== this.clientId && this.hostId < this.clientId) {
              this.isHost = false;
            }
          }
        }
        if (msg.t === 'discover') {
          // Reply to discovery with a hello (and host ping if I'm host)
          this._sendHello();
          if (this.isHost) this.post({ t: 'host', hostId: this.hostId, at: tNow });
        }
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      };

      // Periodic hello helps cross-tab stability.
      this._sendHello();
      this._helloTimer = setInterval(() => this._sendHello(), 1200);
      // Host watchdog: if host disappears, re-elect.
      this._watchTimer = setInterval(() => {
        if (this.isHost) return;
        if (this.hostId && (Date.now() - this.lastHostSeen) <= 3500) return;
        this._electHost();
      }, 1000);
    }

    on(type, fn) { this.handlers.set(type, fn); }

    post(msg) {
      msg.room = this.room;
      msg.from = this.clientId;
      this.bc.postMessage(msg);
    }

    _sendHello() {
      try {
        this.post({ t: 'hello', at: Date.now() });
      } catch (_) {}
    }

    _electHost() {
      const tNow = Date.now();
      // Keep peers fresh for ~3.5s
      const live = new Set([String(this.clientId)]);
      for (const [id, seen] of this.peers.entries()) {
        if ((tNow - (seen || 0)) <= 3500) live.add(String(id));
      }
      // If we already have a fresh host ping, prefer that.
      if (this.hostId && (tNow - this.lastHostSeen) <= 3500) {
        this.isHost = (this.hostId === this.clientId);
        return;
      }
      // Deterministic: smallest id becomes host
      let best = null;
      for (const id of live) {
        if (!best || id < best) best = id;
      }
      if (!best) best = String(this.clientId);
      this.hostId = best;
      if (best === String(this.clientId)) {
        this.becomeHost();
      } else {
        this.isHost = false;
      }
    }

    async discoverHost() {
      // Handshake + deterministic leader election.
      this._sendHello();
      this.post({ t: 'discover', at: Date.now() });
      // Slightly longer window so different browsers/devices join reliably.
      await new Promise(r => setTimeout(r, 650));
      this._electHost();
    }

    becomeHost() {
      this.isHost = true;
      this.hostId = this.clientId;
      this.post({ t: 'host', hostId: this.hostId, at: Date.now() });
    }

    close() {
      try { if (this._helloTimer) clearInterval(this._helloTimer); } catch (_) {}
      try { if (this._watchTimer) clearInterval(this._watchTimer); } catch (_) {}
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
      this.peers = new Map(); // id -> lastSeen(ms)
      this._helloTimer = null;
      this._watchTimer = null;

      const url = this._makeWsUrl(wsBase, roomCode);
      this.ws = new WebSocket(url);
      this.ws.addEventListener('message', (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || (msg.room && msg.room !== this.room)) return;
        const tNow = Date.now();
        if (msg.from) this.peers.set(String(msg.from), tNow);
        if (msg.t === 'hello') {
          if (msg.from) this.peers.set(String(msg.from), tNow);
        }
        if (msg.t === 'host') {
          this.lastHostSeen = tNow;
          if (msg.hostId) {
            const hid = String(msg.hostId);
            if (!this.hostId || hid < this.hostId) this.hostId = hid;
            if (this.isHost && this.hostId !== this.clientId && this.hostId < this.clientId) {
              this.isHost = false;
            }
          }
        }
        if (msg.t === 'discover') {
          this._sendHello();
          if (this.isHost) this.post({ t: 'host', hostId: this.hostId, at: tNow });
        }
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      });

      this.ws.addEventListener('close', () => {
        // 연결이 끊기면 로컬로 자동 복귀하지는 않고, 토스트만
        showToast('온라인 연결이 끊겼어. 새로고침해줘!');
      });

      // Periodic hello helps stable peer discovery across devices.
      this._sendHello();
      this._helloTimer = setInterval(() => this._sendHello(), 1500);
      this._watchTimer = setInterval(() => {
        if (this.isHost) return;
        if (this.hostId && (Date.now() - this.lastHostSeen) <= 4000) return;
        this._electHost();
      }, 1100);
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

    _sendHello() {
      if (!this.ws || this.ws.readyState !== 1) return;
      this.post({ t: 'hello', at: Date.now() });
    }

    _electHost() {
      const tNow = Date.now();
      const live = new Set([String(this.clientId)]);
      for (const [id, seen] of this.peers.entries()) {
        if ((tNow - (seen || 0)) <= 4000) live.add(String(id));
      }
      if (this.hostId && (tNow - this.lastHostSeen) <= 4000) {
        this.isHost = (this.hostId === this.clientId);
        return;
      }
      let best = null;
      for (const id of live) {
        if (!best || id < best) best = id;
      }
      if (!best) best = String(this.clientId);
      this.hostId = best;
      if (best === String(this.clientId)) this.becomeHost();
      else this.isHost = false;
    }

    async discoverHost() {
      // Deterministic leader election (fixes split-host on multi-device joins)
      this._sendHello();
      this.post({ t: 'discover', at: Date.now() });
      await new Promise(r => setTimeout(r, 800));
      this._electHost();
    }

    becomeHost() {
      this.isHost = true;
      this.hostId = this.clientId;
      this.post({ t: 'host', hostId: this.hostId, at: Date.now() });
    }

    close() {
      try { if (this._helloTimer) clearInterval(this._helloTimer); } catch (_) {}
      try { if (this._watchTimer) clearInterval(this._watchTimer); } catch (_) {}
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
        if (!msg || (msg.room && msg.room !== this.room)) return;
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
      lamps: {}, // id -> {on, kind}
      teacherId: null,
      winner: null,
      lastUpdateAt: 0,
    },

    ui: {
      mission: null, // {siteId, kind, correct, practice}
      reopenMission: null, // {siteId, at} (graph penalty)
      meeting: { voted: false },
      meetingChat: { id: 0, msgs: [], lastSentAt: 0 },
      meetingAlarmUntil: 0,
      meetingAlarmFlashUntil: 0,
      mapOpen: false,
      roleRevealUntil: 0,
    },

    fx: [], // {kind, x, y, bornAt, extra}

    local: {
      mouseDown: false,
      mvx: 0,
      mvy: 0,
      pendingAct: null,
      pendingVote: null,
      joy: { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 },
      keys: { up:false, down:false, left:false, right:false, using:false },
    },
  };

  // ---------- Host simulation ----------
  function hostInitFromMap() {
    const st = G.state;
    st.objects = {};
    st.missions = {};
    st.doors = {};
    st.waterBlocks = {};
    st.lamps = {};
    st.leaks = {};
    st.leakLevel = 0;
    st.lockedRoomId = null;
    st.lockedRoomUntil = 0;

    const roomById = new Map((AS.map.rooms || []).map(r => [r.id, r]));
    const W = AS.map.width | 0;
    const H = AS.map.height | 0;
    const canWalk = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (!solid) return true;
      return solid[ty * W + tx] ? false : true;
    };

    const pushDoorOutward = (o) => {
      // Place doors on the room-corridor boundary (Among Us style).
      // Important: prefer the *map-authored* doorway location and only push 1 tile outward
      // when possible. A full room-edge scan is used only as a fallback.
      const r = roomById.get(o.roomId);
      if (!r || !r.rect) return;
      const [rx, ry, rw, rh] = r.rect;

      const ox0 = o.x | 0, oy0 = o.y | 0;
      const inRoomRect = (tx, ty) => (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh);
      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ];

      // Helper: check if tile is inside ANY room rect (optionally excluding this room).
      const inAnyRoomRect = (tx, ty, excludeId = null) => {
        for (const rr of (AS.map.rooms || [])) {
          if (!rr || !rr.rect) continue;
          if (excludeId && rr.id === excludeId) continue;
          const [x, y, w, h] = rr.rect;
          if (tx >= x && ty >= y && tx < x + w && ty < y + h) return true;
        }
        return false;
      };

      // Snap the door along the room-wall opening ("hole") so side-entrance doors
      // don't end up attached to the wrong place. We expand along the wall direction
      // and pick the center of the contiguous corridor<->room open edge.
      const snapDoorToHole = () => {
        const ndx = (o._doorDx|0), ndy = (o._doorDy|0);
        if (Math.abs(ndx) + Math.abs(ndy) !== 1) return;
        const ox = o.x|0, oy = o.y|0;
        // Perpendicular (along the wall): if normal is X, wall runs along Y, and vice versa.
        const px = (ndx !== 0) ? 0 : 1;
        const py = (ndx !== 0) ? 1 : 0;
        const maxOff = 4;

        const okAt = (off) => {
          const cx = ox + px * off;
          const cy = oy + py * off;
          const rx2 = cx - ndx;
          const ry2 = cy - ndy;
          if (!canWalk(cx, cy)) return false;
          if (!canWalk(rx2, ry2)) return false;
          if (!inRoomRect(rx2, ry2)) return false;
          // corridor tile must NOT be inside any other room rect.
          const outsideIsCorridor = !inAnyRoomRect(cx, cy, o.roomId);
          if (!outsideIsCorridor) return false;
          return true;
        };

        if (!okAt(0)) return;
        let lo = 0;
        while (lo - 1 >= -maxOff && okAt(lo - 1)) lo--;
        let hi = 0;
        while (hi + 1 <= maxOff && okAt(hi + 1)) hi++;

        const mid = Math.round((lo + hi) / 2);
        o.x = (ox + px * mid) | 0;
        o.y = (oy + py * mid) | 0;
      };




      // Helper: once door is on corridor side with a known normal (doorDx/doorDy),
      // snap it to the *center* of the actual wall opening by scanning the contiguous
      // corridor<->room open edge along the perpendicular axis.
      // This fixes side-entrance rooms where authored door markers can be slightly off,
      // producing "door attached in a weird spot" and weak blocking.
      const snapDoorToHoleCenter = () => {
        const ndx = (o._doorDx|0);
        const ndy = (o._doorDy|0);
        if (Math.abs(ndx) + Math.abs(ndy) !== 1) return;
        const px = (ndx !== 0) ? 0 : 1;
        const py = (ndx !== 0) ? 1 : 0;
        const ox = o.x|0, oy = o.y|0;
        const maxOff = 4;
        const okAt = (off) => {
          const cx = ox + px * off;
          const cy = oy + py * off;
          const rx2 = cx - ndx;
          const ry2 = cy - ndy;
          if (!canWalk(cx, cy)) return false;          // corridor tile
          if (!canWalk(rx2, ry2)) return false;        // room-side tile
          if (!inRoomRect(rx2, ry2)) return false;
          // corridor tile should not be inside another room
          if (inAnyRoomRect(cx, cy, o.roomId)) return false;
          return true;
        };
        if (!okAt(0)) return;
        let lo = 0, hi = 0;
        while (lo - 1 >= -maxOff && okAt(lo - 1)) lo--;
        while (hi + 1 <= maxOff && okAt(hi + 1)) hi++;
        if (lo === 0 && hi === 0) return;
        const mid = Math.round((lo + hi) / 2);
        o.x = ox + px * mid;
        o.y = oy + py * mid;

      };
      // 1) First try: if the authored door tile is inside the room, push exactly 1 tile outward
      //    into a walkable corridor tile that is NOT inside another room.
      if (inRoomRect(ox0, oy0)) {
        let best = null;
        for (const d of dirs) {
          const nx = ox0 + d.dx;
          const ny = oy0 + d.dy;
          if (inRoomRect(nx, ny)) continue;
          if (!canWalk(nx, ny)) continue;
          const outsideIsCorridor = !inAnyRoomRect(nx, ny, o.roomId);
          const score = (outsideIsCorridor ? 10 : 0);
          if (!best || score > best.score) {
            best = { outX: nx, outY: ny, dx: d.dx, dy: d.dy, score };
          }
        }
        if (best) {
          o.x = best.outX;
          o.y = best.outY;
          o._doorDx = best.dx;
          o._doorDy = best.dy;
          snapDoorToHoleCenter();
          return;
        }
      }

      // 2) Second try: if the authored door tile is already outside the room, derive outward dir
      //    by finding the adjacent inside-room tile.
      if (!inRoomRect(ox0, oy0) && canWalk(ox0, oy0)) {
        let best = null;
        for (const d of dirs) {
          const ix = ox0 - d.dx;
          const iy = oy0 - d.dy;
          if (!inRoomRect(ix, iy)) continue;
          if (!canWalk(ix, iy)) continue;
          const corridorIsCorridor = !inAnyRoomRect(ox0, oy0, o.roomId);
          const score = (corridorIsCorridor ? 10 : 0);
          if (!best || score > best.score) best = { dx: d.dx, dy: d.dy, score };
        }
        if (best) {
          o._doorDx = best.dx;
          o._doorDy = best.dy;
          // keep o.x/o.y as-is
          snapDoorToHoleCenter();
          return;
        }
      }

      // 3) Fallback: scan room boundary band for a likely doorway candidate near the authored position.
      //    Prefer candidates whose outside tile is corridor (not inside another room).
      let best = null;
      const band = 3;
      for (let ty = ry; ty < ry + rh; ty++) {
        for (let tx = rx; tx < rx + rw; tx++) {
          const nearEdge = (tx - rx < band) || (rx + rw - 1 - tx < band) || (ty - ry < band) || (ry + rh - 1 - ty < band);
          if (!nearEdge) continue;
          if (!canWalk(tx, ty)) continue;
          for (const d of dirs) {
            const nx = tx + d.dx;
            const ny = ty + d.dy;
            if (inRoomRect(nx, ny)) continue;
            if (!canWalk(nx, ny)) continue;
            const outsideIsCorridor = !inAnyRoomRect(nx, ny, o.roomId);
            const dist = Math.abs(tx - ox0) + Math.abs(ty - oy0);
            const score = (outsideIsCorridor ? 1000 : 0) - dist;
            if (!best || score > best.score) {
              best = { outX: nx, outY: ny, dx: d.dx, dy: d.dy, score };
            }
          }
        }
      }

      // Full scan fallback (handles slightly-off room rect metadata)
      if (!best) {
        for (let ty = ry; ty < ry + rh; ty++) {
          for (let tx = rx; tx < rx + rw; tx++) {
            if (!canWalk(tx, ty)) continue;
            for (const d of dirs) {
              const nx = tx + d.dx;
              const ny = ty + d.dy;
              if (inRoomRect(nx, ny)) continue;
              if (!canWalk(nx, ny)) continue;
              const outsideIsCorridor = !inAnyRoomRect(nx, ny, o.roomId);
              const dist = Math.abs(tx - ox0) + Math.abs(ty - oy0);
              const score = (outsideIsCorridor ? 1000 : 0) - dist;
              if (!best || score > best.score) best = { outX: nx, outY: ny, dx: d.dx, dy: d.dy, score };
            }
          }
        }
      }

      if (best) {
        o.x = best.outX;
        o.y = best.outY;
        o._doorDx = best.dx;
        o._doorDy = best.dy;
          snapDoorToHoleCenter();
        return;
      }

      // Last resort: never push into room interior.
      const ix = ox0, iy = oy0;
      const dTop = Math.abs(iy - ry);
      const dBot = Math.abs((ry + rh - 1) - iy);
      const dL = Math.abs(ix - rx);
      const dR = Math.abs((rx + rw - 1) - ix);
      const m = Math.min(dTop, dBot, dL, dR);
      let dx = 0, dy = 0;
      if (m === dTop) dy = -1;
      else if (m === dBot) dy = 1;
      else if (m === dL) dx = -1;
      else dx = 1;
      o._doorDx = dx;
      o._doorDy = dy;
      for (let s = 1; s <= 10; s++) {
        const tx = ix + dx * s;
        const ty = iy + dy * s;
        if (inRoomRect(tx, ty)) continue;
        if (canWalk(tx, ty)) {
          o.x = tx;
          o.y = ty;
          snapDoorToHole();
          return;
        }
      }
    };

    // --- Map objects ---
    const objs = Array.isArray(AS.map.objects) ? AS.map.objects : [];
    for (const o0 of objs) {
      if (!o0 || !o0.id || !o0.type) continue;
      const id = String(o0.id);
      const type = String(o0.type);
      const o = { ...o0 };
      o.id = id;
      o.type = type;
      o.x = (o.x | 0);
      o.y = (o.y | 0);
      if (typeof o.w === 'number') o.w = (o.w | 0);
      if (typeof o.h === 'number') o.h = (o.h | 0);
      if (o.links && !Array.isArray(o.links)) o.links = [];

      if (type === 'root_door') {
        // Ensure doors live on the corridor side and have a consistent outward direction.
        pushDoorOutward(o);
        st.doors[id] = { closed: false, closedUntil: 0 };
      }

      if (type === 'mission') {
        st.missions[id] = {
          kind: String(o.kind || 'add'),
          state: 'idle',
          expiresAt: 0,
        };
      }

      // Store all interactive objects
      st.objects[id] = o;
    }

    // Total missions count
    const missionCount = Object.keys(st.missions).length;
    if (missionCount > 0) st.total = missionCount;

    // --- Dynamic lamps (placed as decor but networked so they can be sabotaged/fixed) ---
    try {
      const dec = getPixelDecorPlacements();
      for (const d of dec) {
        if (!d || !d.key) continue;
        const key = String(d.key);
        const isLamp = /street_lamp|floor_lamp/i.test(key);
        if (!isLamp) continue;
        const lid = `lamp_${key}_${d.tx|0}_${d.ty|0}`;
        if (st.objects[lid]) continue;
        st.objects[lid] = {
          id: lid,
          type: 'lamp',
          kind: key,
          x: d.tx | 0,
          y: d.ty | 0,
          roomId: d.roomId || null,
        };
        st.lamps[lid] = { on: true, kind: key };
      }
    } catch (_) {
      // non-fatal
    }

    // Build initial door-solid set (for closed doors / future toggles)
    try{ rebuildDoorSolidSet(); }catch(_){ }
  }



  function hostAddPlayer(nick, isBot = false, clientId = null) {
    const st = G.state;
    if (!st.players) st.players = {};

    if (!G.host.nextPlayerId) G.host.nextPlayerId = 1;
    const id = G.host.nextPlayerId++;

    const sps = (AS.map && Array.isArray(AS.map.spawnPoints) && AS.map.spawnPoints.length)
      ? AS.map.spawnPoints
      : [{ x: 2, y: 2 }];
    const sp = sps[(id - 1) % sps.length] || sps[0];

    // Avoid players stacking perfectly on the same pixel (looks like one player is missing).
    // Pick the nearest walkable tile around the spawn that isn't already occupied.
    const W = (AS.map && AS.map.width) ? (AS.map.width | 0) : 0;
    const H = (AS.map && AS.map.height) ? (AS.map.height | 0) : 0;
    const baseTx = (Number(sp.x) | 0);
    const baseTy = (Number(sp.y) | 0);
    const offsets = [
      [0,0],[1,0],[-1,0],[0,1],[0,-1],
      [1,1],[-1,1],[1,-1],[-1,-1],
      [2,0],[-2,0],[0,2],[0,-2],
      [2,1],[2,-1],[-2,1],[-2,-1],
      [1,2],[-1,2],[1,-2],[-1,-2],
    ];
    const isWalk = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (!solid) return true;
      return !solid[ty * W + tx];
    };

    
    let chosenTx = baseTx, chosenTy = baseTy;
    const minD2 = (TS * 0.55) * (TS * 0.55);
    const others = Object.values(st.players || {}).filter(pp => pp && pp.alive);
    for (let k = 0; k < offsets.length; k++) {
      const tx = baseTx + offsets[k][0];
      const ty = baseTy + offsets[k][1];
      if (!isWalk(tx, ty)) continue;
      const cx = (tx + 0.5) * TS;
      const cy = (ty + 0.5) * TS;
      let ok = true;
      for (const op of others) {
        const dx = (op.x || 0) - cx;
        const dy = (op.y || 0) - cy;
        if (dx*dx + dy*dy < minD2) { ok = false; break; }
      }
      if (ok) { chosenTx = tx; chosenTy = ty; break; }
    }

    const px = (chosenTx + 0.5) * TS;
    const py = (chosenTy + 0.5) * TS;

    st.players[id] = {
      id,
      nick: String(nick || (isBot ? '봇' : '토끼')).slice(0, 16),
      clientId: clientId ? String(clientId) : null,
      isBot: !!isBot,

      role: 'crew',
      // Visual identity: 8 unique variants (clothes + hair accent)
      color: (id - 1) % 8,
      alive: true,
      down: false,

      x: px,
      y: py,
      vx: 0,
      vy: 0,
      facing: 1,

      // status effects
      slowUntil: 0,
      frozenUntil: 0,
      invertUntil: 0,
      vent: null,

      // action/emote/cooldowns
      emoteKind: null,
      emoteUntil: 0,
      killCdUntil: 0,
      saboCdUntil: 0,

      // mission-in-progress indicator (33/66/100)
      missionSiteId: null,
      missionStage: 0,
      missionClearAt: 0,

      // connection (host heartbeat)
      lastSeen: now(),
    };

    return id;
  }

  function hostAssignTeacher() {
    const st = G.state;
    if (st.practice) {
      st.teacherId = null;
      for (const p of Object.values(st.players)) p.role = 'crew';
      return;
    }
    const aliveIds = Object.values(st.players).filter(p => p.alive).map(p => p.id);
    if (aliveIds.length < 2) return;
    const idx = Math.floor(Math.random() * aliveIds.length);
    const tid = aliveIds[idx];
    st.teacherId = tid;
    for (const p of Object.values(st.players)) p.role = (p.id === tid) ? 'teacher' : 'crew';
  }

  function hostStartGame(practice = false) {
    const st = G.state;
    hostInitFromMap();

    // Ensure the initial lighting state is fully bright (all lamps on) at game start.
    // This prevents an occasional "slightly dark" look reported on some devices.
    try{
      for (const lid of Object.keys(st.lamps || {})){
        if (st.lamps[lid]) st.lamps[lid].on = true;
      }
    }catch(_){ }

    G.host.started = true;
    st.practice = !!practice;
    st.infiniteMissions = !st.practice;
    st.timeLeft = 180;
    st.maxTime = 180;
    hostAssignTeacher();

    // 왕관/플로우리스 추적(호스트 전용)
    G.host._flawless = new Map(); // playerId -> Set(kind)
    G.host._missionProg = new Map(); // playerId -> Map(siteId -> {correct, hadWrong, practice})

    // 첫 미션 2개 활성화
    for (let i = 0; i < 2; i++) hostActivateRandomMission();

    

    // 각자 역할 안내(내가 선생토끼인지 바로 알 수 있게)
    for (const pp of Object.values(st.players)) {
      const text = practice
        ? '연습 모드야! (선생토끼 없음) 마음껏 미션을 눌러봐!'
        : ((pp.role === 'teacher') ? '당신은 선생토끼야! (임포스터) 들키지 말고 빵점을 줘!' : '당신은 학생토끼야! 미션을 해결해서 시간을 늘려!');
      sendToPlayer(pp.id, { t: 'toast', text });

      // Among-Us style: big role reveal overlay (per player)
      sendToPlayer(pp.id, { t: 'uiRoleReveal', role: pp.role, practice });
    }
  }

  function hostRemovePlayer(playerId, reason = 'left') {
    const st = G.state;
    const pid = Number(playerId || 0);
    if (!pid || !st.players || !st.players[pid]) return;
    const p = st.players[pid];
    const nick = p.nick || ('#' + pid);
    const cid = (p.clientId != null) ? String(p.clientId) : null;

    // Remove from state
    delete st.players[pid];

    // Cleanup host caches
    try{ G.host.inputs && G.host.inputs.delete(pid); }catch(_){ }
    try{ G.host.votes && G.host.votes.delete(pid); }catch(_){ }
    try{ if (G.host._clientToPlayer && cid) G.host._clientToPlayer.delete(cid); }catch(_){ }

    // Win rule: if the teacher leaves/disconnects, students win immediately.
    // (Ghost/down players are allowed to exist and do NOT affect win conditions.)
    if (!st.practice && Number(st.teacherId || 0) === pid) {
      st.teacherId = null;
      st.winner = 'crew';
      G.phase = 'end';
      broadcast({ t: 'toast', text: '선생토끼가 퇴장해서 학생토끼 승리!' });
      broadcastState(true);
      return;
    }

    // If we drop below 2 humans in real game, go back to practice.
    try{
      const humansNow = Object.values(st.players || {}).filter(pp => pp && pp.alive && !pp.isBot).length;
      if (!st.practice && humansNow < 2) {
        st.practice = true;
        st.teacherId = null;
        for (const pp of Object.values(st.players || {})) pp.role = 'crew';
        broadcast({ t: 'toast', text: '인원이 줄어서 연습 모드로 전환됐어!' });
      }
    }catch(_){ }

    broadcastState(true);

    if (reason) {
      broadcast({ t: 'toast', text: `${nick} 퇴장` });
    }
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
    st.missions[pick].activatedAt = now();
    // Clear any stale seal timestamp if this site gets reused.
    if (st.missions[pick].sealedAt) st.missions[pick].sealedAt = 0;
    return true;
  }

  function hostFailMission(siteId, reason) {
    const st = G.state;
    const m = st.missions[siteId];
    if (!m) return;

    m.state = 'idle';
    m.expiresAt = 0;
    if (m.activatedAt) m.activatedAt = 0;
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

    // heartbeat prune (ghost players)
    try{
      if (!G.host._lastPruneAt) G.host._lastPruneAt = 0;
      if (now() - G.host._lastPruneAt > 1000) {
        G.host._lastPruneAt = now();
        const hostPid = (G.net && G.net.isHost) ? Number(G.net.myPlayerId || 0) : 0;
        const ids = Object.keys(st.players || {}).map(k => Number(k || 0)).filter(v => !!v)
        ;
        const toKick = [];
        for (const pid of ids) {
          const p = st.players[pid];
          if (!p) continue;
          if (p.isBot) { p.lastSeen = now(); continue; }
          if (hostPid && pid === hostPid) { p.lastSeen = now(); continue; }
          const ls = Number(p.lastSeen || 0);
          if (ls && (now() - ls > 12000)) toKick.push(pid);
        }
        for (const pid of toKick) {
          hostRemovePlayer(pid, 'timeout');
        }
      }
    }catch(_){ }

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

    // Solved missions can respawn after a random cooldown (endless tasks mode)
    if (st.infiniteMissions) {
      for (const [id, m] of Object.entries(st.missions)) {
        if (m.state === "solved" && m.respawnAt && now() >= m.respawnAt) {
          m.state = "idle";
          m.respawnAt = 0;
          m.sealedAt = 0;
          m.expiresAt = 0;
          if (m.activatedAt) m.activatedAt = 0;
        }
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
    let doorSolidDirty = false;
    for (const d of Object.values(st.doors)) {
      if (d.closedUntil && now() >= d.closedUntil) {
        d.closedUntil = 0;
        if (d.closed) { d.closed = false; doorSolidDirty = true; }
      }
    }
    if (doorSolidDirty) {
      try{ rebuildDoorSolidSet(); }catch(_){ }
    }


    // Clear mission progress % markers after a short delay (so 100% is briefly visible).
    for (const p of Object.values(st.players)) {
      if (!p || !p.alive) continue;
      if (p.missionClearAt && now() >= p.missionClearAt) {
        p.missionClearAt = 0;
        p.missionStage = 0;
        p.missionSiteId = null;
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
    const hostPid = (G.net && G.net.isHost) ? Number(G.net.myPlayerId || 0) : 0;
    for (const p of Object.values(st.players)) {
      if (!p.alive) continue;
      if (p.down) continue;

      // During the teacher "0점" emote, freeze movement so the pose doesn't look broken
      // if we slow down the animation duration.
      if (p.emoteKind === 'kill0' && now() < (p.emoteUntil || 0)) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }

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
      const inpRec = G.host.inputs.get(p.id) || { mvx: 0, mvy: 0, at: 0 };
      const age = inpRec.at ? (now() - inpRec.at) : 0;
      let mvx = frozen ? 0 : (inpRec.mvx || 0);
      let mvy = frozen ? 0 : (inpRec.mvy || 0);

      // Network jitter/dropouts: avoid immediate "stop-start" on host view.
      // After ~150ms without input updates, slowly fade movement to 0 over ~250ms.
      if (!p.isBot && p.id !== hostPid) {
        if (age > 150) {
          const k = clamp(1 - (age - 150) / 250, 0, 1);
          mvx *= k;
          mvy *= k;
        }
      }
      if (now() < (p.invertUntil || 0)) { mvx = -mvx; mvy = -mvy; }

      // Save intended direction for rendering (prevents left/right input showing as back/front).
      const ilen = Math.hypot(mvx, mvy);
      if (ilen > 0.12) {
        const avx = Math.abs(mvx), avy = Math.abs(mvy);
        // Prefer side view unless vertical is clearly dominant (helps joystick noise).
        if (avx >= avy * 0.85) {
          p.dir = 2;
          p.facing = (mvx < 0 ? -1 : 1);
        } else if (avy >= avx * 1.10) {
          p.dir = (mvy < 0 ? 1 : 0);
        }
      }

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
      // Teacher wins when ALL other rabbits are down.
      if (crewAlive === 0 && st.teacherId && st.players[st.teacherId]?.alive) {
        st.winner = 'teacher';
        G.phase = 'end';
        return;
      }

      if (!st.infiniteMissions && st.solved >= st.total) {
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
      G.host.inputs.set(p.id, { mvx: 0, mvy: 0, at: now() });
      return;
    }
    G.host.inputs.set(p.id, { mvx: dx / d, mvy: dy / d, at: now() });
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

  // Fast lookup for room rectangles (used for door-closed visibility overlay)
  let ROOMS_BY_ID = null;
  function getRoomById(id) {
    if (!id) return null;
    if (!ROOMS_BY_ID) {
      ROOMS_BY_ID = new Map();
      const rms = (AS.map && Array.isArray(AS.map.rooms)) ? AS.map.rooms : [];
      for (const r of rms) {
        if (r && r.id) ROOMS_BY_ID.set(r.id, r);
      }
    }
    return ROOMS_BY_ID.get(id) || null;
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
    const vx0 = 0, vy0 = 0, vx1 = (cam.vw || viewW), vy1 = (cam.vh || viewH);
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

  // Door geometry helper: estimate corridor axis/width around a door tile.
  // We keep this lightweight and deterministic so rendering + collision + vision agree.
  function _isSolidTile(tx, ty) {
    const W = AS.map.width|0, H = AS.map.height|0;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return !!(solid && solid[ty*W + tx] === 1);
  }

  function _openRun(tx, ty, dx, dy, maxSteps) {
    let n = 0;
    const m = Math.max(1, maxSteps|0);
    for (let i = 1; i <= m; i++) {
      const x = tx + dx * i;
      const y = ty + dy * i;
      if (_isSolidTile(x, y)) break;
      n++;
    }
    return n;
  }

  function doorCrossInfoAt(tx, ty, hintObj = null) {
    // Scan only a short range so doors in wide rooms don't explode in size.
    const max = 4;
    const spanX = 1 + _openRun(tx, ty, -1, 0, max) + _openRun(tx, ty, 1, 0, max);
    const spanY = 1 + _openRun(tx, ty, 0, -1, max) + _openRun(tx, ty, 0, 1, max);

    // Corridor axis: whichever span is larger. If ambiguous, prefer the original door push direction.
    let corridorVertical = false;
    if (spanY > spanX + 1) corridorVertical = true;
    else if (spanX > spanY + 1) corridorVertical = false;
    else if (hintObj && typeof hintObj._doorDx === 'number' && typeof hintObj._doorDy === 'number') {
      // If the door was pushed outward vertically, it's likely on a horizontal wall,
      // meaning the corridor runs horizontally -> door should be vertical.
      // But for our cross-width estimation, we only need corridor axis.
      corridorVertical = (Math.abs(hintObj._doorDy) === 1);
    } else {
      // Default: vertical corridors are the common case in this map.
      corridorVertical = true;
    }

    const crossTiles = clamp(corridorVertical ? spanX : spanY, 2, 4);
    return { corridorVertical, crossTiles };
  }

  // Build a stable span of offsets across the door opening (perpendicular to the
  // corridor axis). We derive this from *actual open tiles* around the door tile
  // so even-width corridors (2/4) don't leave a "gap" you can slip through.
  function doorSpanOffsetsAt(tx, ty, info) {
    const max = 4;
    const desired = clamp((info && (info.crossTiles|0)) || 3, 1, 4);
    // corridorVertical => opening spans X (perpendicular to vertical corridor)
    const spanX = !!(info && info.corridorVertical);

    let left = 0, right = 0;
    if (spanX) {
      left = _openRun(tx, ty, -1, 0, max);
      right = _openRun(tx, ty,  1, 0, max);
    } else {
      left = _openRun(tx, ty, 0, -1, max);
      right = _openRun(tx, ty, 0,  1, max);
    }

    // Trim to desired size, keeping the span contiguous.
    while (1 + left + right > desired) {
      if (right > left) right--; else left--;
    }
    // NOTE: if 1+left+right < desired, we simply keep the real open span.

    return { spanX, minOff: -left, maxOff: right };
  }

  // Door boundary blocking (Among Us-style): a closed door blocks the *edge* between two tiles
  // (corridor <-> room) rather than making a whole tile solid. This avoids invisible solid-tile
  // artifacts and makes vision/collision more accurate.
  function doorEdgeBlockedBetween(tx0, ty0, tx1, ty1) {
    const st = G.state;
    if (!st || !st.objects || !st.doors) return false;
    const dx = (tx1 - tx0) | 0;
    const dy = (ty1 - ty0) | 0;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

    // Helper: room-rect lookup for inferring door normal when metadata is missing.
    const roomRectOf = (roomId) => {
      try {
        const rooms = AS?.map?.rooms;
        if (!rooms || !Array.isArray(rooms)) return null;
        for (const r of rooms) {
          if (!r) continue;
          if (String(r.id) !== String(roomId)) continue;
          return {
            x: (r.x | 0),
            y: (r.y | 0),
            w: (r.w | 0),
            h: (r.h | 0),
          };
        }
      } catch (_) {}
      return null;
    };
    const inRect = (rect, x, y) => {
      if (!rect) return false;
      return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
    };

    for (const obj of Object.values(st.objects)) {
      if (!obj || obj.type !== 'root_door') continue;
      const d = st.doors[obj.id];
      if (!d || !d.closed) continue;

      const ox = obj.x | 0;
      const oy = obj.y | 0;

      // Door normal (room -> corridor). Prefer authored/pushed metadata; infer from room rect if needed.
      let odx = (obj._doorDx | 0) || 0;
      let ody = (obj._doorDy | 0) || 0;
      if (Math.abs(odx) + Math.abs(ody) !== 1) {
        odx = 0; ody = 0;
        const rect = roomRectOf(obj.roomId);
        if (rect) {
          // Door object lives on the corridor tile. The room-side tile is one step opposite to the normal.
          const dirs = [ [0,-1], [0,1], [-1,0], [1,0] ];
          for (const [ddx, ddy] of dirs) {
            const rx = ox - ddx;
            const ry = oy - ddy;
            if (inRect(rect, rx, ry)) { odx = ddx; ody = ddy; break; }
          }
        }
        if (Math.abs(odx) + Math.abs(ody) !== 1) { odx = 0; ody = 1; }
      }

      // Door span/width: reuse the same cross-tiles estimate used by rendering,
      // but compute a *contiguous open-span* so even-width corridors are fully blocked.
      const info = doorCrossInfoAt(ox, oy, obj);
      const span = doorSpanOffsetsAt(ox, oy, info);
      for (let off = span.minOff; off <= span.maxOff; off++) {
        // Corridor side tile (door object lives on corridor tile)
        const cx = span.spanX ? (ox + off) : ox;
        const cy = span.spanX ? oy : (oy + off);
        // Room side tile is one step opposite to the door normal.
        const rx = cx - odx;
        const ry = cy - ody;
        if ((tx0 === cx && ty0 === cy && tx1 === rx && ty1 === ry) ||
            (tx1 === cx && ty1 === cy && tx0 === rx && ty0 === ry)) return true;
      }
    }
    return false;
  }

  function doorEdgeBlockedSegment(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return false;
    const step = Math.max(4, TS * 0.25);
    const n = Math.ceil(dist / step);

    let ptx = Math.floor(x0 / TS);
    let pty = Math.floor(y0 / TS);

    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      const tx = Math.floor(x / TS);
      const ty = Math.floor(y / TS);
      if (tx !== ptx || ty !== pty) {
        if (doorEdgeBlockedBetween(ptx, pty, tx, ty)) return true;
        ptx = tx; pty = ty;
      }
    }
    return false;
  }

  // ---------- Door solid "invisible wall" ----------
// Closed doors create temporary solid tiles on BOTH sides of the opening.
// This guarantees you cannot pass room <-> corridor when a door is closed,
// even if edge-based checks miss due to large dt or diagonal movement.
function rebuildDoorSolidSet() {
  const st = G.state;
  if (!st) return;
  if (!G._doorSolidSet) G._doorSolidSet = new Set();
  const set = G._doorSolidSet;
  set.clear();

  for (const obj of Object.values(st.objects || {})) {
    if (!obj || obj.type !== 'root_door') continue;
    const d = st.doors && st.doors[obj.id];
    if (!d || !d.closed) continue;

    const ox = obj.x | 0;
    const oy = obj.y | 0;

    // Door normal (room -> corridor). Prefer authored metadata; infer from room rect if needed.
    let odx = (obj._doorDx | 0) || 0;
    let ody = (obj._doorDy | 0) || 0;
    if (Math.abs(odx) + Math.abs(ody) !== 1) {
      odx = 0; ody = 0;
      const rect = roomRectOf(obj.roomId);
      if (rect) {
        const dirs = [ [0,-1], [0,1], [-1,0], [1,0] ];
        for (const [ddx, ddy] of dirs) {
          const rx = ox - ddx;
          const ry = oy - ddy;
          if (inRect(rect, rx, ry)) { odx = ddx; ody = ddy; break; }
        }
      }
      if (Math.abs(odx) + Math.abs(ody) !== 1) { odx = 0; ody = 1; }
    }

    const info = doorCrossInfoAt(ox, oy, obj);
    if (!info) continue;
    const span = doorSpanOffsetsAt(ox, oy, info);

    // Mark all doorway tiles across the opening as solid (both sides).
    for (let off = span.minOff; off <= span.maxOff; off++) {
      const cx = span.spanX ? (ox + off) : ox;
      const cy = span.spanX ? oy : (oy + off);
      const rx = cx - odx;
      const ry = cy - ody;

      set.add(cx + "," + cy);
      set.add(rx + "," + ry);
    }

    // Also include the authored door tile itself as a safety plug.
    set.add(ox + "," + oy);
  }
}

function doorSolidAt(tx, ty) {
  const set = G._doorSolidSet;
  if (!set || !set.size) return false;
  return set.has((tx | 0) + "," + (ty | 0));
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
    // axis-separated resolution + door-edge boundary blocking
    let x = nx;
    let y = p.y;

    // door boundary check on X move (check a few points on the collision circle).
    // (If we only check the center, players can "clip" through a closed door with their edge.)
    const doorHitX = doorEdgeBlockedSegment(p.x, p.y, x, y)
      || doorEdgeBlockedSegment(p.x, p.y - PLAYER_R + 2, x, y - PLAYER_R + 2)
      || doorEdgeBlockedSegment(p.x, p.y + PLAYER_R - 2, x, y + PLAYER_R - 2);
    if (doorHitX || collidesCircle(p, x, y, PLAYER_R)) {
      x = p.x;
      p.vx = 0;
    }

    y = ny;
    // door boundary check on Y move (check a few points on the collision circle).
    const doorHitY = doorEdgeBlockedSegment(x, p.y, x, y)
      || doorEdgeBlockedSegment(x - PLAYER_R + 2, p.y, x - PLAYER_R + 2, y)
      || doorEdgeBlockedSegment(x + PLAYER_R - 2, p.y, x + PLAYER_R - 2, y);
    if (doorHitY) {
      y = p.y;
      p.vy = 0;
    } else if (collidesCircle(p, x, y, PLAYER_R)) {
      y = p.y;
      p.vy = 0;
    }

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
      if (!['meeting_bell', 'mission', 'root_door', 'body_report', 'vent_hole', 'lamp'].includes(obj.type)) continue;
      if (obj.type === 'vent_hole' && player.role !== 'teacher') continue;
      if (obj.type === 'vent_hole' && G.state.practice) continue;
      if (obj.type === 'lamp') {
        const lp = st.lamps && st.lamps[obj.id];
        if (!lp) continue;
        if (player.role === 'teacher' && !lp.on) continue;
        if (player.role !== 'teacher' && lp.on) continue;
      }
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      const d2 = dist2(player.x, player.y, ox, oy);
      const range2 = (obj.type === 'mission') ? (MISSION_INTERACT_RANGE ** 2) : (INTERACT_RANGE ** 2);
      if (d2 > range2) continue;
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

    // 'best' is already filtered by type-specific range.
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
    if (obj.type === 'lamp') {
      const lp = st.lamps && st.lamps[obj.id];
      if (!lp) return;
      // Teacher can only turn OFF; crew can only turn ON (Among Us style).
      if (p.role === 'teacher') {
        if (lp.on) {
          lp.on = false;
          broadcast({ t: 'lightNotice', text: '누군가 불을 껐어요.', until: now() + 1500 });
        }
      } else {
        if (!lp.on) {
          lp.on = true;
          broadcast({ t: 'lightNotice', text: '누군가 불을 켰어요.', until: now() + 1500 });
        }
      }
      broadcastState(true);
      return;
    }


    if (obj.type === 'root_door') {
      const d = st.doors[obj.id];
      if (!d) return;
      // 잠금 중이면 토글 불가
      if (d.closedUntil && now() < d.closedUntil) return;

      const wasClosed = !!d.closed;
      d.closed = !wasClosed;

      // Among-Us style quick door animation (vines spill down/up)
      const t0 = now();
      d.anim = { k: d.closed ? 'close' : 'open', s: t0, e: t0 + (d.closed ? 260 : 200) };

      if (d.closed) {
        broadcast({ t: 'fx', kind: 'doorClose', x: obj.x, y: obj.y, bornAt: t0, id: obj.id });
      }


      // Rebuild invisible-wall tiles for closed doors
      try{ rebuildDoorSolidSet(); }catch(_){ }

      broadcastState(true);
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

      // Show mission progress % over the character until the mission UI is closed.
      // Stage mapping: 1->33%, 2->66%, 3->100%
      p.missionSiteId = obj.id;
      p.missionStage = clamp((prog?.correct || 0) + 1, 1, 3);
      p.missionClearAt = 0;
      broadcastState(true);

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

    // brief kill animation (shown to everyone)
    killer.emoteKind = 'kill0';
    killer.emoteUntil = now() + 900;

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


    const isClosedDoorTile = (tx, ty) => {
      const st2 = G.state;
      for (const o of Object.values(st2.objects || {})) {
        if (!o || o.type !== 'root_door') continue;
        const dd = st2.doors && st2.doors[o.id];
        if (dd && dd.closed && (o.x|0) === (tx|0) && (o.y|0) === (ty|0)) return true;
      }
      return false;
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
        if (isClosedDoorTile(tx, ty)) break;
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

    // 물이 차오르는 순간, 학생토끼가 물길 위에 있었다면 옆으로 살짝 밀어내서 갇히지 않게
    const flooded = new Set(tiles.map(tt => tt.x + ',' + tt.y));
    const isBlockedForCrew = (tx, ty) => {
      if (baseSolidAt(tx, ty)) return true;
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
      const practice = !!st.practice;
      hostInitMissionProg(playerId, siteId, m.kind, practice);
      prog = hostGetMissionProg(playerId, siteId);
    }

    // Practice mode is global (1~3 players). Keep per-player mission prog in sync.
    const isPractice = !!st.practice;
    if (prog.practice !== isPractice) {
      hostInitMissionProg(playerId, siteId, m.kind, isPractice);
      prog = hostGetMissionProg(playerId, siteId) || prog;
    }
    if (!isPractice && m.state === 'solved') return;

    const q = payload.question;
    const ans = payload.answer;

    const ok = checkAnswer(q, ans);
    if (!ok) {
      // Wrong: immediately exit the mission UI (no lingering modal / darkness overlay).
      prog.hadWrong = true;
      if (!isPractice) {
        // Active (real) mission: apply penalty.
        applyPenalty(m.kind, playerId);
        // Flawless crown condition resets on any mistake (crew only).
        if (p.id !== st.teacherId) hostResetFlawless(playerId);
        // Teacher mistake: 10s silly glasses.
        if (p.id === st.teacherId) p.glassesUntil = Math.max(p.glassesUntil || 0, now() + 10_000);
      }

      // Reset this site's progress so reopening starts fresh.
      hostInitMissionProg(playerId, siteId, m.kind, isPractice);

      // Clear world marker quickly (client will also send missionClose).
      p.missionSiteId = null;
      p.missionStage = 0;
      p.missionClearAt = 0;

      sendToPlayer(playerId, { t: 'uiMissionExit', siteId, toast: '틀렸어! 다시 시도해!' });
      broadcastState(true);
      return;
    }

    // Correct: progress toward 3 correct (practice + real share the same 3-question flow)
    prog.correct += 1;

    // Update world-space mission progress marker (33/66/100)
    // Stage: (correct+1) -> 1:33%, 2:66%, 3:100%
    p.missionSiteId = siteId;
    p.missionStage = clamp(prog.correct + 1, 1, 3);
    p.missionClearAt = 0;

    if (prog.correct >= 3) {
      // complete
      if (!isPractice) {
        m.state = 'solved';
        m.expiresAt = 0;
        m.sealedAt = now();
        if (st.infiniteMissions) {
          m.respawnAt = now() + (20_000 + Math.random() * 20_000);
        }
        st.solved += 1;
      }

      // Reward: +15 seconds (practice + real)
      st.timeLeft += 15;
      st.timeLeft = Math.min(st.timeLeft, 999);
      st.maxTime = Math.max(st.maxTime || 0, st.timeLeft);
      sendToPlayer(playerId, { t: 'uiMissionExit', siteId, toast: isPractice ? '+15초! (연습)' : '+15초! 해결!' });

      // Show 100% briefly, then clear the marker.
      p.missionStage = 3;
      p.missionClearAt = now() + 1200;

      const siteObj = st.objects[siteId];
      if (!isPractice && siteObj) broadcast({ t: 'fx', kind: 'seal', x: siteObj.x, y: siteObj.y, bornAt: now() });

      // 누수(압박) 완화: (실전만) 미션을 해결하면 누수 레벨 1 감소 + 가장 오래된 물샘 흔적 1개 제거
      if (!isPractice && (st.leakLevel || 0) > 0) {
        st.leakLevel = Math.max(0, (st.leakLevel || 0) - 1);
        const entries = Object.entries(st.leaks || {});
        if (entries.length) {
          entries.sort((a,b) => (a[1].bornAt||0) - (b[1].bornAt||0));
          delete st.leaks[entries[0][0]];
        }
        broadcast({ t: 'toast', text: `당근으로 막았다! 누수가 줄었어. (누수 ${st.leakLevel})` });
      }

      // 왕관: (실전만) 서로 다른 활성 미션 3개를 '한 번도 틀림 없이' 해결
      if (!isPractice && p.id !== st.teacherId && !p.crown && !prog.hadWrong) {
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
      hostInitMissionProg(playerId, siteId, m.kind, isPractice);

      // Show 100% briefly, then clear the marker.
      p.missionStage = 3;
      p.missionClearAt = now() + 1200;

      broadcastState(true);
    } else {
      sendToPlayer(playerId, { t: 'uiMissionResult', ok: true, text: `정답! (${prog.correct}/3)` });
      sendToPlayer(playerId, { t: 'uiMissionNext', question: genQuestion(m.kind), correct: prog.correct });
      // Broadcast so others can see the % change above the player's head.
      broadcastState(true);
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
      lamps: st.lamps,
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
      roleText.textContent = '학생토끼';
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
    // Time bar next to the timer (requested)
    const mt = Math.max(1, Number(G.state.maxTime || 180));
    const pctT = clamp((tl / mt) * 100, 0, 100);
    progFill.style.width = `${pctT}%`;
    if (progText) {
      if (G.state.infiniteMissions) progText.textContent = `${G.state.solved}/∞`;
      else progText.textContent = `${G.state.solved}/${G.state.total}`;
    }

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

  

  function playThunk() {
    const ac = ensureAudio();
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime;

    // low thump
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filt = ac.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(140, t0);
    osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.08);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(800, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ac.destination);

    osc.start(t0);
    osc.stop(t0 + 0.16);
  }

  // Emergency siren (Among-Us style). Pure WebAudio so we don't need external files.
  function playSiren(durSec = 3.2) {
    const ac = ensureAudio();
    if (!ac || ac.state !== 'running') return;

    const t0 = ac.currentTime;
    const t1 = t0 + Math.max(0.4, durSec);

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filt = ac.createBiquadFilter();

    // Siren sweep using an LFO
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(640, t0);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(1.6, t0);
    lfoGain.gain.setValueAtTime(240, t0);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1400, t0);
    filt.Q.setValueAtTime(0.8, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.05);
    gain.gain.setValueAtTime(0.06, t1 - 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ac.destination);

    lfo.start(t0);
    osc.start(t0);
    osc.stop(t1 + 0.02);
    lfo.stop(t1 + 0.02);
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
    missionDesc.textContent = payload.practice
      ? '연습 미션: 문제 3개 모두 맞히면 +15초'
      : '문제 3개 모두 맞히면 해결! (+15초)';
    missionModal.classList.add('show');
    renderQuestion();
  }

  function closeMissionUI() {
    const ui = G.ui.mission;
    missionModal.classList.remove('show');
    G.ui.mission = null;
    // Tell host to clear the "mission in progress" marker above my head.
    try{
      if (ui && G.net && ui.siteId) {
        G.net.post({ t: 'missionClose', playerId: Number(G.net.myPlayerId || 0), siteId: ui.siteId });
      }
    }catch(_){ }
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
      playerId: Number(G.net.myPlayerId || 0),
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

  // ---------- Meeting chat (Among-Us style) ----------
  function nowHHMM(){
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  }

  function sanitizeMeetingText(s){
    return String(s || '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function createTokkiIcon(colorIdx){
    // Small pixel avatar used in meeting roster/chat (no nicknames).
    try{
      if (!AS || !AS.charsImg) {
        const sp = document.createElement('span');
        sp.className = 'mDot';
        sp.style.background = colorHex(colorIdx ?? 0);
        sp.textContent = '🐰';
        return sp;
      }
      const canvas = document.createElement('canvas');
      const scale = 0.5; // 64x72 -> 32x36
      canvas.width = Math.round(SPR_W * scale);
      canvas.height = Math.round(SPR_H * scale);
      canvas.className = 'mTokki';
      const cx = canvas.getContext('2d');
      cx.imageSmoothingEnabled = false;
      const MOTION_ROWS = 5;
      const DIR_ROWS = 3;
      const motionWalk = 0;
      const dirFront = 0;
      const row = ((Number(colorIdx||0) % COLOR_ROWS) * (MOTION_ROWS * DIR_ROWS)) + (motionWalk * DIR_ROWS) + dirFront;
      const sx = 0;
      const sy = row * SPR_H;
      cx.drawImage(AS.charsImg, sx, sy, SPR_W, SPR_H, 0, 0, canvas.width, canvas.height);
      return canvas;
    } catch (_) {
      const sp = document.createElement('span');
      sp.className = 'mDot';
      sp.style.background = colorHex(colorIdx ?? 0);
      sp.textContent = '🐰';
      return sp;
    }
  }

  function renderMeetingRoster(){
    if (!meetingRoster) return;
    const st = G.state;
    meetingRoster.innerHTML = '';
    const players = Object.values(st.players || {}).slice().sort((a,b)=> (a.id||0) - (b.id||0));
    for (const p of players){
      const chip = document.createElement('div');
      chip.className = 'mAvatar' + ((p.alive && !p.down) ? '' : ' mDead');
      const icon = createTokkiIcon(p.color ?? 0);
      const label = document.createElement('span');
      // Use nickname in meeting UIs (chat/vote/roster). Fall back to #id if missing.
      const nn = (p.nick || '').toString().trim();
      label.textContent = nn ? nn : `#${p.id}`;
      label.title = `#${p.id}`;
      label.style.fontWeight = '1000';
      label.style.fontSize = '12px';
      chip.appendChild(icon);
      chip.appendChild(label);
      meetingRoster.appendChild(chip);
    }
  }

  function renderMeetingChat(){
    if (!meetingChatLog) return;
    const msgs = (G.ui.meetingChat?.msgs || []).slice(-80);
    meetingChatLog.innerHTML = '';
    for (const m of msgs){
      const line = document.createElement('div');
      line.className = 'mLine';

      const icon = createTokkiIcon(m.color ?? 0);

      const bubble = document.createElement('div');
      bubble.className = 'mBubble';

      const meta = document.createElement('div');
      meta.className = 'mMeta';
      const who = document.createElement('span');
      who.className = 'mNick';
      // Show nickname (fallback: #id)
      const mnn = (m.nick || '').toString().trim();
      const pid = Number(m.pid||0);
      who.textContent = mnn ? mnn : `#${pid}`;
      who.title = `#${pid}`;
      const time = document.createElement('span');
      time.className = 'mTime';
      time.textContent = String(m.time || '');
      meta.appendChild(who);
      meta.appendChild(time);

      const textEl = document.createElement('div');
      textEl.textContent = String(m.text || '');

      bubble.appendChild(meta);
      bubble.appendChild(textEl);

      line.appendChild(icon);
      line.appendChild(bubble);
      meetingChatLog.appendChild(line);
    }
    // always scroll to bottom on update
    try{ meetingChatLog.scrollTop = meetingChatLog.scrollHeight; }catch(_){ }
  }

  function sendMeetingChat(){
    if (!G.net) return;
    if (G.phase !== 'meeting') return;

    // Ghosts (downed players) can only watch the meeting: no chat.
    try{
      const me = G.state?.players?.[G.net?.myPlayerId];
      if (!me || !me.alive || me.down) {
        showToast('유령은 회의 채팅을 쓸 수 없어!');
        return;
      }
    }catch(_){ }

    const text = sanitizeMeetingText(meetingChatText?.value || '');
    if (!text) return;
    const tNow = now();
    if (tNow - (G.ui.meetingChat?.lastSentAt || 0) < 350) return;
    G.ui.meetingChat.lastSentAt = tNow;
    const meetingId = G.ui.meetingChat?.id || 0;
    const meId = Number(G.net.myPlayerId || 0);
    G.net.post({ t:'meetingChat', meetingId, playerId: meId, text });
    if (meetingChatText) meetingChatText.value = '';
  }

  if (meetingChatSend) meetingChatSend.addEventListener('click', () => sendMeetingChat());
  if (meetingChatText) meetingChatText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendMeetingChat(); }
  });

  function openMeetingUI(kind, reason, endsAt) {
    meetingModal.classList.add('show');

    // Initialize meeting chat (new meeting instance id)
    G.ui.meetingChat.id = Number(endsAt || 0);
    G.ui.meetingChat.msgs = [];

    // Emergency bell: flash + siren
    if (kind === 'emergency') {
      G.ui.meetingAlarmUntil = now() + 3500;
      G.ui.meetingAlarmFlashUntil = now() + 3500;
      playSiren(3.5);
      tryVibrate([120, 60, 120, 60, 180]);
    } else {
      G.ui.meetingAlarmUntil = now() + 1400;
      G.ui.meetingAlarmFlashUntil = now() + 1400;
      playBeep(520, 0.08);
      playBeep(640, 0.08);
      tryVibrate([90, 40, 90]);
    }
    const tag = (kind === 'report') ? '🚨 신고' : '🔔 긴급회의';
    meetingInfo.textContent = `${tag} · ${reason}`;
    G.ui.meeting.voted = false;

    renderMeetingRoster();
    renderMeetingChat();
    renderVoteList();

    // Ghosts (downed players) should not be able to chat during meetings.
    try{
      const me = G.state?.players?.[G.net?.myPlayerId];
      const ghost = (!me || !me.alive || me.down);
      if (meetingChatText) {
        meetingChatText.disabled = ghost;
        if (ghost) meetingChatText.placeholder = '유령은 채팅 불가 (구경만)';
        else meetingChatText.placeholder = '채팅...';
      }
      if (meetingChatSend) meetingChatSend.disabled = ghost;
    }catch(_){ }

    // focus chat box (best-effort)
    try{ setTimeout(()=> (meetingChatText && !meetingChatText.disabled) && meetingChatText.focus(), 80); }catch(_){ }

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
    // clear chat input (keep history cleared on next open)
    try{ if (meetingChatText) meetingChatText.value = ''; }catch(_){ }
  }

  function renderVoteList() {
    voteList.innerHTML = '';
    const st = G.state;
    const meId = G.net?.myPlayerId;

    // Keep roster in sync with current alive/down states
    renderMeetingRoster();

    const alive = Object.values(st.players).filter(p => p.alive && !p.down);
    alive.forEach(p => {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';
      const icon = createTokkiIcon(p.color ?? 0);
      const label = document.createElement('div');
      const vnn = (p.nick || '').toString().trim();
      label.textContent = vnn ? vnn : `#${p.id}`;
      label.title = `#${p.id}`;
      label.style.fontWeight = '900';
      left.appendChild(icon);
      left.appendChild(label);
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
    G.net.post({ t: 'vote', playerId: Number(G.net.myPlayerId || 0), target: null });
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
    sceneCanvas.width = Math.round(w * DPR);
    sceneCanvas.height = Math.round(h * DPR);
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
    return ['#58a6ff','#58e58c','#ff76c8','#ffd24a','#a578ff','#ffa04a','#28d2dc','#ff5a5a'][colorIdx % 8];
  }

  function hairHex(colorIdx) {
    // 머리/포인트 색상(옷색과 다르게 8명 구분) - 밝고 대비가 큰 색으로
    return ['#f97316','#9333ea','#14b8a6','#2563eb','#84cc16','#db2777','#f59e0b','#ef4444'][colorIdx % 8];
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
        const cx = W * 0.5 + wob;
        const cy = H * 0.62;
        if (p.isTeacher) {
          // teacher is known in this scene: show the provided pixel-art 'TCH' pose if available
          const ok = drawTeacherSceneSheet('teacher_tch_sheet', cx, cy, 1.05 * DPR, t, 'teacher');
          if (!ok) drawBunny(cx, cy, 2.4 * DPR, p.color ?? 0, t - SCENE.startAt, mood);
        } else {
          drawBunny(cx, cy, 2.4 * DPR, p.color ?? 0, t - SCENE.startAt, mood);
        }

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

  function drawTeacherSceneSheet(sheetKey, x, y, scale, t, mood) {
    const sheet = AS.pixel?.[sheetKey];
    if (!sheet) return false;
    const bob = (mood === 'teacher') ? 0 : Math.sin(t * 0.01) * 1.5;
    const sw = 64, sh = 72;
    const viewX = 64; // front view
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);
    sceneCtx.save();
    sceneCtx.imageSmoothingEnabled = false;
    // soft shadow
    sceneCtx.globalAlpha = 0.22;
    sceneCtx.fillStyle = '#000';
    sceneCtx.beginPath();
    sceneCtx.ellipse(x, y + dh * 0.22, dw * 0.28, dh * 0.09, 0, 0, Math.PI * 2);
    sceneCtx.fill();
    sceneCtx.globalAlpha = 1;

    sceneCtx.drawImage(sheet, viewX, 0, sw, sh, Math.round(x - dw/2), Math.round(y - dh*0.70 + bob), dw, dh);
    sceneCtx.restore();
    return true;
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

  // PC: click-to-interact helper
  // If the user clicks an interactive thing (mission hole, lamp, door, bell, vent, body)
  // and they are already within interact range, trigger interact instead of steering.
  function tryInteractFromPointer(px, py){
    try {
      if (!G.net) return false;
      const st = G.state;
      const me = st.players[G.net?.myPlayerId];
      if (!me || !me.alive || me.down) return false;
      const cam = getCamera(me);
      const wx = cam.x + px;
      const wy = cam.y + py;

      // candidate objects
      let best = null;
      let bestD2 = Infinity;
      for (const obj of Object.values(st.objects || {})) {
        if (!['meeting_bell', 'mission', 'root_door', 'vent_hole', 'lamp'].includes(obj.type)) continue;
        if (obj.type === 'vent_hole' && (me.role !== 'teacher' || st.practice)) continue;
        if (obj.type === 'lamp') {
          const lp = st.lamps && st.lamps[obj.id];
          if (!lp) continue;
          if (me.role === 'teacher' && !lp.on) continue;
          if (me.role !== 'teacher' && lp.on) continue;
        }
        const ox = (obj.x + 0.5) * TS;
        const oy = (obj.y + 0.5) * TS;
        const clickD2 = dist2(wx, wy, ox, oy);
        if (clickD2 > (TS * 0.9) ** 2) continue; // must click near the thing
        const meD2 = dist2(me.x, me.y, ox, oy);
        if (meD2 > INTERACT_RANGE ** 2) continue; // must be close enough
        if (clickD2 < bestD2) { bestD2 = clickD2; best = obj; }
      }

      // body report (click near a downed player)
      if (!best && !st.practice && st.teacherId) {
        for (const p of Object.values(st.players || {})) {
          if (!p.alive || !p.down) continue;
          if (p.id === me.id) continue;
          const clickD2 = dist2(wx, wy, p.x, p.y);
          if (clickD2 > (TS * 0.9) ** 2) continue;
          const meD2 = dist2(me.x, me.y, p.x, p.y);
          if (meD2 > (INTERACT_RANGE + 10) ** 2) continue;
          best = { type: 'body_report' };
          break;
        }
      }

      if (!best) return false;

      // Trigger interact immediately.
      if (G.net.isHost && G.net.myPlayerId) {
        hostHandleInteract(G.net.myPlayerId);
        broadcastState(true);
      } else {
        G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), kind: 'interact' });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (isMobile) return; // 모바일은 조이스틱
    if (G.phase !== 'play') return;
    G.local.mouseDown = true;
    const p = canvasPoint(ev);
    // If the click is on an interactable and I'm in range, interact instead of moving.
    if (tryInteractFromPointer(p.x, p.y)) {
      G.local.mouseDown = false;
      G.local.mvx = 0;
      G.local.mvy = 0;
      return;
    }
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

  // PC keyboard movement (WASD + Arrow keys)
  function recomputeKeyMove(){
    const k = G.local.keys;
    const x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    if (x || y){
      const d = Math.hypot(x, y) || 1;
      G.local.mvx = x / d;
      G.local.mvy = y / d;
      G.local.mouseDown = false; // stop pointer steering while using keys
      k.using = true;
    } else {
      // only zero out if we were using keyboard (avoid killing joystick/pointer mid-drag)
      if (k.using){
        G.local.mvx = 0;
        G.local.mvy = 0;
      }
      k.using = false;
    }
  }

  function isTyping(){
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = (ae.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable;
  }

  window.addEventListener('keydown', (e) => {
    if (isMobile) return;
    if (G.phase !== 'play') return;
    if (isTyping()) return;
    let handled = true;
    switch (e.key){
      case 'ArrowUp':
      case 'w':
      case 'W':
        G.local.keys.up = true; break;
      case 'ArrowDown':
      case 's':
      case 'S':
        G.local.keys.down = true; break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        G.local.keys.left = true; break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        G.local.keys.right = true; break;
            case '1':
        if (G.net) G.net.post({ t: 'emote', playerId: Number(G.net.myPlayerId || 0), kind: 'cry' });
        handled = true; break;
      case '2':
        if (G.net) G.net.post({ t: 'emote', playerId: Number(G.net.myPlayerId || 0), kind: 'tsk' });
        handled = true; break;
default:
        handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    recomputeKeyMove();
  }, { passive:false });

  window.addEventListener('keyup', (e) => {
    if (isMobile) return;
    let handled = true;
    switch (e.key){
      case 'ArrowUp':
      case 'w':
      case 'W':
        G.local.keys.up = false; break;
      case 'ArrowDown':
      case 's':
      case 'S':
        G.local.keys.down = false; break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        G.local.keys.left = false; break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        G.local.keys.right = false; break;
      default:
        handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    recomputeKeyMove();
  }, { passive:false });

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

  function sendInteract() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    // Host shortcut (solo/practice)
    if (G.net.isHost && G.net.myPlayerId) {
      hostHandleInteract(G.net.myPlayerId);
      broadcastState(true);
      return;
    }
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), kind: 'interact' });
  }

  // Primary action: X (PC) / 조작 버튼 (mobile). Context-sensitive:
  // - If teacher and a target is in range, X -> 0점
  // - Otherwise, X -> interact (doors, missions, meeting, etc.)
  function sendPrimaryAction() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    const me = G.state?.players?.[G.net.myPlayerId];
    if (!me || !me.alive || me.down) return;
    const near = nearestHint(me);
    const canKill = (me.role === 'teacher') && near.canKill && !!near.killTarget && !G.state.practice;
    if (canKill) sendKill();
    else if (near.canInteract) sendInteract();
  }

  interactBtn.addEventListener('click', () => sendInteract());

  function sendKill() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    // Host shortcut (solo/practice)
    if (G.net.isHost && G.net.myPlayerId) {
      hostHandleKill(G.net.myPlayerId);
      broadcastState(true);
      return;
    }
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), kind: 'kill' });
  }

  killBtn.addEventListener('click', () => sendKill());
  try { if (killBtnPc) killBtnPc.addEventListener('click', () => sendKill()); } catch (_) {}

  function sendSabotage() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), kind: 'sabotage' });
  }

  function sendForceMission() {
    if (!G.net) return;
    if (G.phase !== 'play') return;
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), kind: 'forceMission' });
  }

  saboBtn?.addEventListener('click', () => sendSabotage());
  saboBtnTouch?.addEventListener('click', () => sendSabotage());
  forceBtn?.addEventListener('click', () => sendForceMission());
  forceBtnTouch?.addEventListener('click', () => sendForceMission());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // keyboard actions (PC)
    if (!isMobile && G.phase === 'play' && !isTyping()) {
      if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        sendPrimaryAction();
        return;
      }
    }

    if (e.key === 'q' || e.key === 'Q') sendSabotage();
    if (e.key === 'f' || e.key === 'F') sendForceMission();
  });

  // ---------- Rendering ----------
  function getCamera(me) {
    const W = AS.map.width * TS;
    const H = AS.map.height * TS;
    const vw = viewW / ZOOM;
    const vh = viewH / ZOOM;
    // Snap camera to CSS-pixel grid to avoid sub-pixel sampling blur when drawing the cached map.
    const x = snapPx(clamp(me.x - vw / 2, 0, Math.max(0, W - vw)));
    const y = snapPx(clamp(me.y - vh / 2, 0, Math.max(0, H - vh)));
    return { x, y, vw, vh };
  }
  // ---------- Lighting / Vision (Among Us-like) ----------
  function _angDiff(a, b){
    let d = a - b;
    while (d > Math.PI) d -= Math.PI*2;
    while (d < -Math.PI) d += Math.PI*2;
    return Math.abs(d);
  }

  function opaqueAtTile(tx, ty){
    const W = AS.map.width|0, H = AS.map.height|0;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    if (solid && solid[ty*W + tx] === 1) return true;
    return false;
  }

  
  
  function castRay(px, py, ang, maxDist){
    const step = 6;
    const c = Math.cos(ang), s = Math.sin(ang);
    let lastX = px, lastY = py;
    let ptx = Math.floor(px / TS);
    let pty = Math.floor(py / TS);
    for (let d = 0; d <= maxDist; d += step){
      const x = px + c*d;
      const y = py + s*d;
      const tx = Math.floor(x / TS);
      const ty = Math.floor(y / TS);
      if (tx !== ptx || ty !== pty) {
        if (doorEdgeBlockedBetween(ptx, pty, tx, ty)) return { x: lastX, y: lastY };
        ptx = tx; pty = ty;
      }
      if (opaqueAtTile(tx, ty)) return { x: lastX, y: lastY };
      lastX = x; lastY = y;
    }
    return { x: px + c*maxDist, y: py + s*maxDist };
  }

  function lineOfSight(px, py, tx, ty){
    // sample along the segment; stop at walls or closed door boundaries
    const dx = tx - px, dy = ty - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return true;
    const step = 8;
    const n = Math.ceil(dist / step);

    let ptx = Math.floor(px / TS);
    let pty = Math.floor(py / TS);

    for (let i = 0; i <= n; i++){
      const t = i / n;
      const x = px + dx * t;
      const y = py + dy * t;
      const gx = Math.floor(x / TS);
      const gy = Math.floor(y / TS);

      if (gx !== ptx || gy !== pty) {
        if (doorEdgeBlockedBetween(ptx, pty, gx, gy)) return false;
        ptx = gx; pty = gy;
      }

      if (opaqueAtTile(gx, gy)) return false;
    }
    return true;
  }

  function getGlobalDarkness01(st){
    const lamps = st.lamps || {};
    const ids = Object.keys(lamps);
    const total = ids.length;
    if (!total) return 0;
    let off = 0;
    for (const id of ids){ if (!lamps[id]?.on) off++; }
    return clamp(off / total, 0, 1);
  }

  function getLookAngle(me){
    // prefer current input direction; fallback to last stored
    const mvx = G.local.mvx || 0;
    const mvy = G.local.mvy || 0;
    const mag = Math.hypot(mvx, mvy);
    if (!G.ui._lookAng && G.ui._lookAng !== 0) G.ui._lookAng = 0;
    if (mag > 0.15){
      G.ui._lookAng = Math.atan2(mvy, mvx);
    } else {
      // use sprite dir/facing
      if (Math.abs(me.vx || 0) > Math.abs(me.vy || 0)) {
        if ((me.vx || 0) > 0.2) G.ui._lookAng = 0;
        else if ((me.vx || 0) < -0.2) G.ui._lookAng = Math.PI;
      } else {
        if ((me.vy || 0) > 0.2) G.ui._lookAng = Math.PI/2;
        else if ((me.vy || 0) < -0.2) G.ui._lookAng = -Math.PI/2;
      }
    }
    return G.ui._lookAng || 0;
  }

  function drawLightMask(cam, me, st){
    if (!me || me.role === 'teacher' || st.practice) return;
    const dark01 = getGlobalDarkness01(st);
    if (dark01 <= 0) return;

    // Intensity curves
    const a = clamp(dark01, 0, 1);
    const overlayA = 0.28 + 0.62 * a;
    const look = getLookAngle(me);
    const half = (Math.PI/180) * (150 - 80 * a); // 150deg -> 70deg
    const maxDist = 520 - 220 * a; // 520px -> 300px
    const nearR = 110 - 45 * a; // small circle for close-by side vision
    const rays = Math.round(70 - 10 * a);

    // darkness overlay
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${overlayA})`;
    ctx.fillRect(0, 0, viewW, viewH);

    // punch visible areas
    ctx.globalCompositeOperation = 'destination-out';

    // NOTE: world is rendered in (world px) * ZOOM, but this mask is drawn in screen space.
    const scale = ZOOM;

    // near circle
    const cx = (me.x - cam.x) * scale;
    const cy = (me.y - cam.y) * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, nearR * scale, 0, Math.PI*2);
    ctx.fill();

    // wedge polygon via ray casting
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i <= rays; i++){
      const t = i / rays;
      const ang = look - half + (2*half) * t;
      const hit = castRay(me.x, me.y, ang, maxDist);
      const sx = (hit.x - cam.x) * scale;
      const sy = (hit.y - cam.y) * scale;
      ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // When all lamps are off, show faint lamp positions so players can find them.
    const lamps = st.lamps || {};
    const ids = Object.keys(lamps);
    let onCount = 0;
    for (const id of ids){ if (lamps[id]?.on) onCount++; }
    if (ids.length && onCount === 0){
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(255,225,140,1)';
      for (const id of ids){
        const o = st.objects && st.objects[id];
        if (!o) continue;
        const lx = ((o.x + 0.5) * TS - cam.x) * scale;
        const ly = ((o.y + 0.5) * TS - cam.y) * scale;
        if (lx < -40 || ly < -40 || lx > viewW + 40 || ly > viewH + 40) continue;
        ctx.beginPath();
        ctx.arc(lx, ly - 18 * scale, 6 * scale, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
  }



  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 픽셀 아트: 항상 최근접/정수 좌표로 렌더링
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, viewW, viewH);

    if (!AS.map || !mapCanvas) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = 'bold 16px system-ui';
      ctx.fillText('로딩 중...', 20, 30);
      return;
    }

    const st = G.state;
    const me = st.players[G.net?.myPlayerId] || Object.values(st.players)[0];
    let cam = me ? getCamera(me) : { x: 0, y: 0, vw: viewW / ZOOM, vh: viewH / ZOOM };

    // time warning shake (10초 이하)
    if (G.phase === 'play' && st.timeLeft > 0 && st.timeLeft <= 10) {
      const amp = (1 - st.timeLeft / 10) * 3.0;
      cam = { ...cam,
        x: cam.x + Math.sin(now() * 0.07) * amp,
        y: cam.y + Math.cos(now() * 0.09) * amp * 0.8,
      };
    }

    // door close shake (tiny 1~2px)
    if (G.ui.shakeUntil && now() < G.ui.shakeUntil) {
      const rem = (G.ui.shakeUntil - now());
      const dur = (G.ui.shakeDur || 160);
      const p = Math.max(0, Math.min(1, rem / dur));
      const amp = (G.ui.shakeAmp || 2) * p;
      cam = { ...cam,
        x: cam.x + (Math.random() * 2 - 1) * amp,
        y: cam.y + (Math.random() * 2 - 1) * amp,
      };
    }

    // world render (pixel-perfect zoom)
    ctx.save();
    ctx.scale(ZOOM, ZOOM);

    // 정수 픽셀 스냅(가로/세로 한 줄이 투명해 보이는 현상 방지)
    cam = { ...cam, x: snapPx(cam.x), y: snapPx(cam.y) };

    // map
    const vw = (cam.vw || (viewW / ZOOM));
    const vh = (cam.vh || (viewH / ZOOM));
    ctx.drawImage(mapCanvas, cam.x, cam.y, vw, vh, 0, 0, vw, vh);

    // locked room overlay (add-penalty)
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
        const dx = (obj._doorDx|0)||0; const dy = (obj._doorDy|0)||0;
        const sx = x + (-dx) * TS * 0.5;
        const sy = y + (-dy) * TS * 0.5;
        drawDoor(sx, sy, d, blocked, obj.id, obj.x, obj.y, dx, dy);
        if (st.lockedRoomId && st.lockedRoomUntil && now() < st.lockedRoomUntil && obj.roomId === st.lockedRoomId) {
          drawLockedDoorOverlay(sx, sy, st.lockedRoomUntil - now());
        }
      } else if (obj.type === 'mission') {
        const m = st.missions[obj.id];
        drawMissionSpot(x, y, m);
      } else if (obj.type === 'meeting_bell') {
        drawEmergencyMeeting(x, y);
      } else if (obj.type === 'admin_board') {
        drawObjSprite('admin_board', x, y);
      } else if (obj.type === 'camera_monitor') {
        drawObjSprite('camera_monitor', x, y);
      } else if (obj.type === 'lamp') {
        drawLamp(obj, x, y);
      } else if (obj.type === 'vent_hole') {
        // Vents should only be visible/usable to the teacher (imposter).
        if (me && me.role === 'teacher' && !st.practice) {
          if (AS.pixel?.vent) {
            const im = AS.pixel.vent;
            const dw = TS * 2;
            const dh = TS * 2;
            ctx.drawImage(im, 0, 0, im.width, im.height, Math.round(x - dw / 2), Math.round(y - dh / 2), dw, dh);
          } else {
            drawObjSprite('vent_hole', x, y);
          }
        }
      }
    }

    // -------- Closed-door visibility --------
    // If a door is closed, the far side should be visible only as a dark interior
    // (static), and we must not render dynamic entities (players) behind it.
    // We implement this by:
    // 1) Darkening the associated room rectangle when I'm outside it.
    // 2) Hiding players whose line-of-sight segment from me crosses a closed-door edge.
    const closedDoorEdges = new Set();
    const closedRoomIds = new Set();
    const meRoom = (me ? roomAtPixel(me.x, me.y) : null);
    const meRoomId = meRoom ? meRoom.id : null;

    for (const obj of Object.values(st.objects)) {
      if (!obj || obj.type !== 'root_door') continue;
      const d = st.doors && st.doors[obj.id];
      if (!d || !d.closed) continue;

      // room darkening (only when I'm not inside that room)
      if (obj.roomId && obj.roomId !== meRoomId) closedRoomIds.add(obj.roomId);

      // build blocked tile-to-tile edges for quick segment testing
      const doorDx = (obj._doorDx|0)||0;
      const doorDy = (obj._doorDy|0)||0;
      const info = doorCrossInfoAt(obj.x|0, obj.y|0, obj);
      if (!info) continue;
      const span = doorSpanOffsetsAt(obj.x|0, obj.y|0, info);
      for (let off = span.minOff; off <= span.maxOff; off++) {
        const cx = span.spanX ? ((obj.x|0) + off) : (obj.x|0);
        const cy = span.spanX ? (obj.y|0) : ((obj.y|0) + off);
        const rx = cx - doorDx;
        const ry = cy - doorDy;
        const k1 = `${cx},${cy}|${rx},${ry}`;
        const k2 = `${rx},${ry}|${cx},${cy}`;
        closedDoorEdges.add(k1);
        closedDoorEdges.add(k2);
      }
    }

    // Darken the closed room interiors (static view only)
    if (closedRoomIds.size) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      // Keep far-side objects readable, but hide what players are doing.
      // (Players behind a closed door are not rendered; this is the "privacy" tint.)
      ctx.fillStyle = 'rgba(0,0,0,.38)';
      for (const rid of closedRoomIds) {
        const rr = getRoomById(rid);
        if (!rr || !rr.rect) continue;
        const [rx, ry, rw, rh] = rr.rect;
        const x0 = rx * TS - cam.x;
        const y0 = ry * TS - cam.y;
        ctx.fillRect(x0, y0, rw * TS, rh * TS);
      }
      ctx.restore();
    }

    // Helper: does the segment cross any closed-door edge?
    function segBlockedByClosedDoor(x0, y0, x1, y1) {
      if (!closedDoorEdges.size) return false;
      const step = TS * 0.25;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-3) return false;
      const n = Math.max(1, Math.ceil(dist / step));
      let tx = Math.floor(x0 / TS);
      let ty = Math.floor(y0 / TS);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const xx = x0 + dx * t;
        const yy = y0 + dy * t;
        const ntx = Math.floor(xx / TS);
        const nty = Math.floor(yy / TS);
        if (ntx !== tx || nty !== ty) {
          if (closedDoorEdges.has(`${tx},${ty}|${ntx},${nty}`)) return true;
          tx = ntx; ty = nty;
        }
      }
      return false;
    }

    // 1회성 효과(파티클/뽁/땅굴)
    drawFx(cam);

    // players
    const players = Object.values(st.players)
      .slice()
      .sort((a, b) => (a.y - b.y));

    for (const p of players) {
      if (!p.alive) continue;

      let wx = p.x, wy = p.y;
      let pDraw = p;
      // Client-side smoothing for remote players (render-only)
      if (G.net && !G.net.isHost && G.netSmooth && G.netSmooth.players) {
        const ex = G.netSmooth.players.get(p.id);
        if (ex) {
          const a = clamp((now() - ex.t0) / 180, 0, 1);
          wx = ex.px + (ex.tx - ex.px) * a;
          wy = ex.py + (ex.ty - ex.py) * a;
          pDraw = (wx === p.x && wy === p.y) ? p : ({ ...p, x: wx, y: wy });
        }
      }

      // Hide movement behind closed doors.
      if (me && p.id !== me.id) {
        if (segBlockedByClosedDoor(me.x, me.y, wx, wy)) continue;
      }

      const px = wx - cam.x;
      const py = wy - cam.y;
      drawPlayer(pDraw, px, py);
    }

    ctx.restore();

    // global lighting / vision mask (crew only)
    if (G.phase === 'play') {
      try { drawLightMask(cam, me, st); } catch (_) {}
    }

    // Emergency meeting screen flash
    if (now() < (G.ui.meetingAlarmFlashUntil || 0)) {
      const tt = now() * 0.02;
      const pulse = (Math.sin(tt) * 0.5 + 0.5);
      ctx.fillStyle = `rgba(255,90,122,${0.08 + pulse * 0.14})`;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '900 18px system-ui';
      ctx.fillText('비상 소집!', 18, 58);
    }

    // Light notice (top message)
    if (now() < (G.ui.lightNoticeUntil || 0)) {
      const msg = G.ui.lightNoticeText || '누군가 불을 껐어요.';
      const alpha = clamp(((G.ui.lightNoticeUntil - now()) / 1500), 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.88 * alpha;
      ctx.font = '900 16px system-ui';
      ctx.textAlign = 'center';
      const w = ctx.measureText(msg).width + 26;
      const x = viewW * 0.5;
      const y = 28;
      ctx.fillStyle = 'rgba(10,14,26,.72)';
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - w/2, y - 18, w, 28, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillText(msg, x, y);
      ctx.restore();
    }

    // UI hints
    if (G.phase === 'play' && me) {
      const near = nearestHint(me);
      const canI = near.canInteract;
      interactBtn.style.display = canI ? 'flex' : 'none';
      interactBtn.classList.toggle('ready', canI);

      // Bigger, clearer door prompt ("열기/닫기")
      if (canI && near.target) {
        interactBtn.textContent = near.target.label || '조작';
        interactBtn.classList.toggle('doorHint', near.target.type === 'root_door');
        try { drawWorldInteractPrompt(cam, near.target); } catch (_) {}
      } else {
        interactBtn.textContent = '조작';
        interactBtn.classList.remove('doorHint');
      }

      const showKill = (me.role === 'teacher') && near.canKill && !!near.killTarget && !st.practice;
      killBtn.style.display = showKill ? 'flex' : 'none';
      killBtn.classList.toggle('ready', showKill);

      // PC에서도 0점(검은당근) 채점 버튼을 노출
      try {
        if (killBtnPc) {
          killBtnPc.textContent = '0점(X)';
          killBtnPc.style.display = (!isMobile && showKill) ? 'inline-flex' : 'none';
          killBtnPc.classList.toggle('ready', showKill);
        }
      } catch (_) {}

      // 근처 학생 머리 위에 검은당근 표시
      if (showKill && near.killTarget) {
        try { drawWorldKillPrompt(cam, near.killTarget); } catch (_) {}
      }

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
      const msg = st.winner === 'crew' ? '학생토끼 승리!' : '선생토끼 승리!';
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

      // small puddle to visually "attach" water to the hole
      ctx.fillStyle = active ? 'rgba(125,211,252,.28)' : 'rgba(125,211,252,.18)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 13, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(244,247,255,.85)';
    ctx.font = '900 11px system-ui';
    ctx.fillText('미니맵', 10, h - 10);

    ctx.restore();
  }


  function renderMapUI() {
    if (!G.ui.mapOpen || !mapUiCanvas || !mapUiCtx) return;
    if (!AS.map || !mapCanvas) return;

    const dpr = Math.round(Math.max(1, Math.min(2, window.devicePixelRatio || 1)));
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

    // room outlines + labels (Among-Us style guidance)
    if (AS.map.rooms && Array.isArray(AS.map.rooms)) {
      mapUiCtx.save();
      mapUiCtx.strokeStyle = 'rgba(255,255,255,.28)';
      mapUiCtx.lineWidth = 1.6;
      mapUiCtx.font = '900 11px system-ui';
      mapUiCtx.textAlign = 'center';
      mapUiCtx.textBaseline = 'middle';
      for (const rr of AS.map.rooms) {
        const [rx, ry, rw, rh] = rr.rect;
        const x0 = ox + rx * TS * s2;
        const y0 = oy + ry * TS * s2;
        const w0 = rw * TS * s2;
        const h0 = rh * TS * s2;
        mapUiCtx.beginPath();
        mapUiCtx.roundRect(x0 + 1, y0 + 1, Math.max(0, w0 - 2), Math.max(0, h0 - 2), 10);
        mapUiCtx.stroke();
        mapUiCtx.fillStyle = 'rgba(0,0,0,.45)';
        mapUiCtx.fillText(rr.name, x0 + w0 / 2, y0 + h0 / 2);
      }
      mapUiCtx.restore();
    }

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
      mapUiCtx.arc(mx, my, (m?.state === 'active') ? 18 : 15, 0, Math.PI * 2);
      mapUiCtx.fill();
      mapUiCtx.stroke();

      if (m?.state === 'active') {
        mapUiCtx.fillStyle = 'rgba(0,0,0,.75)';
        mapUiCtx.font = '900 32px system-ui';
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
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + TS*0.22, TS*0.30, TS*0.13, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(AS.objsImg, sx, sy, TS, TS, x - TS / 2, y - TS / 2, TS, TS);
  }

  function drawLamp(obj, x, y) {
    const st = G.state;
    const lp = st.lamps && st.lamps[obj.id];
    const on = !!(lp && lp.on);
    const kind = (lp && lp.kind) || obj.kind || 'floor_lamp';
    const imOn = AS.pixel?.[kind] || AS.pixel?.floor_lamp || AS.pixel?.street_lamp;
    const imOff = AS.pixel?.[`${kind}_off`] || null;
    const im = on ? imOn : (imOff || imOn);
    if (!im) return;

    // size: lamps are drawn 2x tile like other big props
    const dw = TS * 2;
    const dh = TS * 2;
    const px = x - dw / 2;
    const py = y - dh / 2;

    // shadow
    ctx.save();
    ctx.fillStyle = on ? 'rgba(0,0,0,.26)' : 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(x, y + dh * 0.18, dw * 0.28, dh * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // sprite
    ctx.save();
    // If we have a dedicated OFF sprite, don't additionally fade it.
    ctx.globalAlpha = on ? 1.0 : (imOff ? 1.0 : 0.55);
    ctx.drawImage(im, 0, 0, im.width, im.height, Math.round(px), Math.round(py), dw, dh);
    ctx.restore();

    // glow when ON
    if (on) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gx = x;
      const gy = y - dh * 0.20;
      const r = Math.max(dw, dh) * 0.95;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, 'rgba(255,244,214,.22)');
      g.addColorStop(0.35, 'rgba(255,220,160,.10)');
      g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      ctx.restore();
    }
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

    function drawEmergencyMeeting(x, y) {
    const table = AS.pixel?.round_table;
    const mega = AS.pixel?.megaphone;

    if (!table) {
      drawObjSprite('meeting_bell', x, y);
      return;
    }

    const tNow = now();
    const alarm = (tNow < (G.ui.meetingAlarmUntil || 0)) || (G.phase === 'meeting' && (G.host.meetingKind === 'emergency'));
    const pulse = (Math.sin(tNow * 0.02) * 0.5 + 0.5);

    ctx.save();
    ctx.translate(x, y);

    // Neutral drop shadow (table sprite had a green-ish ground tint; this overrides it)
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // subtle glow
    if (alarm) {
      ctx.fillStyle = `rgba(255,90,122,${0.10 + pulse * 0.10})`;
      ctx.beginPath();
      ctx.ellipse(0, 10, 44, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // table (64x64)
    const tw = 64, th = 64;
    ctx.drawImage(table, 0, 0, table.width, table.height, Math.round(-tw / 2), Math.round(-th / 2), tw, th);

    // Extra shading to neutralize any green-ish tint baked into the table sprite
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.fillRect(-tw/2, 14, tw, 34);
    ctx.restore();
    // Small exterior dark strip (covers any ground pixels bleeding outside)
    ctx.fillStyle = 'rgba(0,0,0,.20)';
    ctx.fillRect(-tw/2, 12, tw, 26);

    // megaphone on top (bob + shake)
    if (mega) {
      const mw = 32, mh = 32;
      const bob = Math.sin(tNow * 0.012) * 1.4;
      const shake = alarm ? (Math.sin(tNow * 0.08) * 1.8) : 0;
      ctx.save();
      ctx.translate(shake, -14 + bob);
      ctx.rotate(alarm ? (Math.sin(tNow * 0.06) * 0.12) : 0);
      // blink highlight
      if (alarm && pulse > 0.6) {
        ctx.globalAlpha = 0.92;
      }
      ctx.drawImage(mega, 0, 0, mega.width, mega.height, Math.round(-mw / 2), Math.round(-mh / 2), mw, mh);
      ctx.restore();
    }

    // Alarm waves (Among-Us style)
    if (alarm) {
      const r = 16 + pulse * 14;
      ctx.strokeStyle = `rgba(255,255,255,${0.20 + pulse * 0.25})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 8, r * 1.55, r * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();

      // rays
      ctx.strokeStyle = `rgba(255,90,122,${0.30 + pulse * 0.25})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + tNow * 0.002;
        const x1 = Math.cos(ang) * (22 + pulse * 4);
        const y1 = 6 + Math.sin(ang) * (14 + pulse * 3);
        const x2 = Math.cos(ang) * (30 + pulse * 6);
        const y2 = 6 + Math.sin(ang) * (20 + pulse * 5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }


  function drawDoor(x, y, door, blocked, seedKey, tileX, tileY, doorDx=0, doorDy=0) {
    // Prefer user provided vine-door sprites (pixel art)
    const imClosed = AS.pixel?.vine_door_closed;
    const imSide = AS.pixel?.vine_door_side;
    const imOpen = AS.pixel?.vine_door_open;
    // Side-entrance (left/right) door sprites
    const imClosedLR = AS.pixel?.vine_door_lr_closed;
    const imOpenLR = AS.pixel?.vine_door_lr_open;
    const wallIm = AS.pixel?.wall || AS.pixel?.wall_alt || null;

    const tNow = now();
    const closed = !!(door && door.closed);
    const anim = door && door.anim;
    let animK = null;
    let animP = 1;
    if (anim && typeof anim.s === 'number' && typeof anim.e === 'number' && anim.e > anim.s) {
      if (tNow >= anim.s && tNow < anim.e) {
        animK = anim.k || null;
        animP = clamp((tNow - anim.s) / (anim.e - anim.s), 0, 1);
      }
    }

    const seed = (strHash(seedKey || '') % 1000) * 0.01;
    const sway = Math.sin(tNow * 0.006 + seed * 11) * (closed ? 0.030 : 0.012);
    const wig  = Math.sin(tNow * 0.012 + seed * 7) * (closed ? 0.75 : 0.35);

    // Helper: draw the closed door composed to arbitrary width (no scaling mush)
    function drawClosedComposite(info, w, h) {
      ctx.globalAlpha = 0.98;
      if (info.corridorVertical) {
        // spans X
        const leftX = Math.round(-w/2);
        const topY = Math.round(-h/2);
        if (imSide) {
          ctx.drawImage(imSide, 0, 0, 32, 64, leftX, topY, TS, h);
          ctx.drawImage(imSide, 32, 0, 32, 64, leftX + w - TS, topY, TS, h);
        }
        const midW = Math.max(0, w - 2*TS);
        if (midW > 0) {
          ctx.drawImage(imClosed, 0, 0, 64, 64, leftX + TS, topY, midW, h);
        }
      } else {
        // spans Y (rotate 90deg)
        const leftX = Math.round(-h/2);
        const topY = Math.round(-w/2);
        ctx.save();
        ctx.rotate(Math.PI/2);
        if (imSide) {
          ctx.drawImage(imSide, 0, 0, 32, 64, topY, leftX, TS, h);
          ctx.drawImage(imSide, 32, 0, 32, 64, topY + w - TS, leftX, TS, h);
        }
        const midW = Math.max(0, w - 2*TS);
        if (midW > 0) {
          ctx.drawImage(imClosed, 0, 0, 64, 64, topY + TS, leftX, midW, h);
        }
        ctx.restore();
      }
    }

    // Helper: a tiny dust/spark burst while closing
    function drawCloseDust(p, info, w, h) {
      const a = (1 - p) * 0.55;
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(165,120,78,1)';
      const base = (strHash(String(seedKey||'')) % 997) * 0.01;
      for (let i = 0; i < 10; i++) {
        const r = ((strHash(String(seedKey||'') + ':' + i) % 1000) / 1000);
        const ang = (i / 10) * Math.PI * 2 + base;
        const rr = 6 + 22 * p + r * 6;
        const px = Math.cos(ang) * rr;
        const py = (h * 0.22) + Math.sin(ang) * rr * 0.55 + (r * 10 * (1 - p));
        ctx.beginPath();
        ctx.ellipse(px, py, 2.2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // a couple of vine flecks
      ctx.strokeStyle = `rgba(110,196,150,${0.55 * a})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const r = ((strHash(String(seedKey||'') + ':v' + i) % 1000) / 1000);
        const x0 = -w/2 + 8 + r * (w - 16);
        const y0 = -h/2 + 8 + r * 10;
        const x1 = x0 + (Math.sin(tNow * 0.03 + r * 9) * 6);
        const y1 = y0 + 10 + r * 12;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Extra visual fix: blend door edges into adjacent wall tiles so a closed door
    // doesn't look like a transparent flat plane.
    function drawDoorWallMask(info, w, h, alpha = 0.90) {
      if (!wallIm) return;
      const strip = Math.max(6, Math.round(TS * 0.20));
      ctx.save();
      ctx.globalAlpha = alpha;
      // Make the mask follow the same orientation as drawClosedComposite
      if (!info.corridorVertical) ctx.rotate(Math.PI / 2);
      const leftX = Math.round(-w / 2);
      const topY = Math.round(-h / 2);
      // Left and right edge strips
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height,
        leftX - strip + 2, topY, strip, h);
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height,
        leftX + w - 2, topY, strip, h);
      // Small corner caps (hide tile seams)
      ctx.globalAlpha = alpha * 0.75;
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height,
        leftX - strip + 2, topY - 4, strip, 8);
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height,
        leftX + w - 2, topY - 4, strip, 8);
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height,
        leftX - strip + 2, topY + h - 4, strip, 8);
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height,
        leftX + w - 2, topY + h - 4, strip, 8);
      ctx.restore();
    }

    // Helper: connect door edges to wall tiles a bit more naturally (edge masking)
    function drawDoorEdgeMask(info, w, h, alpha=0.85) {
      if (!wallIm) return;
      const strip = Math.max(6, Math.round(TS * 0.22));
      ctx.save();
      ctx.globalAlpha = alpha;
      // make sure masking follows door orientation
      if (!info.corridorVertical) ctx.rotate(Math.PI / 2);
      const leftX = Math.round(-w / 2);
      const topY = Math.round(-h / 2);
      // Slight overlap into the doorway so gaps/seams are hidden
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height, leftX - strip + 2, topY, strip, h);
      ctx.drawImage(wallIm, 0, 0, wallIm.width, wallIm.height, leftX + w - 2, topY, strip, h);
      // Dark crease on the boundary to emphasize "depth"
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(leftX + 1, topY + 2, 3, h - 4);
      ctx.fillRect(leftX + w - 4, topY + 2, 3, h - 4);
      ctx.restore();
    }

    if (imClosed && imOpen) {
      const tx = tileX | 0;
      const ty = tileY | 0;
      const hint = { _doorDx: doorDx|0, _doorDy: doorDy|0 };
      const info = doorCrossInfoAt(tx, ty, hint);
      // Oversize a bit more so the door covers the corridor opening flush (no side gap).
      // Door opening major length and thickness.
      // corridorVertical=true: doorway spans X (horizontal door plane)
      // corridorVertical=false: doorway spans Y (vertical door plane)
      const w = TS * info.crossTiles + Math.round(TS * 0.60);
      const h = TS * 2; // 64px thick -> 2 tiles

      // Door plane size (thin barrier) – boundary-like
      const planeW = info.corridorVertical ? w : TS * 0.9;
      const planeH = info.corridorVertical ? TS * 0.9 : w;

      // Image draw size: for side-entrance doors (corridor runs horizontally),
      // the door artwork should be "tall" along Y. So we swap draw dimensions.
      const drawW = info.corridorVertical ? w : h;
      const drawH = info.corridorVertical ? h : w;

      // Choose proper sprites by orientation.
      const openIm = info.corridorVertical ? imOpen : (imOpenLR || imOpen);
      const closedIm = info.corridorVertical ? imClosed : (imClosedLR || imClosed);

      ctx.save();
      ctx.translate(x, y);

      // subtle sway / wiggle so closed doors feel "alive"
      if (closed || animK === 'close') {
        ctx.rotate(sway);
        ctx.translate(wig * 0.25, 0);
      }

      // Occlusion/thickness: stronger "pushing out" feeling on both room/corridor sides
      const roomShiftX = (doorDx ? -Math.sign(doorDx) : 0) * (TS * 0.38);
      const roomShiftY = (doorDy ? -Math.sign(doorDy) : 0) * (TS * 0.38);
      const occl = (sx, sy, a1, a2) => {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = `rgba(0,0,0,${a1})`;
        ctx.beginPath();
        ctx.roundRect(-planeW/2 - 2, -planeH/2 - 1, planeW + 4, planeH + 2, 12);
        ctx.fill();
        // deeper extrusion
        ctx.translate(sx * 0.55, sy * 0.55);
        ctx.fillStyle = `rgba(0,0,0,${a2})`;
        ctx.beginPath();
        ctx.roundRect(-planeW/2 - 1, -planeH/2, planeW + 2, planeH, 10);
        ctx.fill();
        ctx.restore();
      };
      if (closed || animK === 'close') {
        occl(roomShiftX, roomShiftY, 0.26, 0.14);
        occl(-roomShiftX, -roomShiftY, 0.18, 0.10);
      } else {
        // even when open, keep a faint depth hint so it doesn't look like a "transparent wall"
        occl(roomShiftX * 0.55, roomShiftY * 0.55, 0.10, 0.05);
      }

      // Render states (support close/open animation)
      const drawOpen = (alpha=0.95) => {
        ctx.globalAlpha = alpha;
        // For side-entrance doors, draw using dedicated LR sprite and swap draw dimensions.
        if (!info.corridorVertical && imOpenLR) {
          const dw = h;
          const dh = w;
          ctx.drawImage(imOpenLR, 0, 0, imOpenLR.width, imOpenLR.height, Math.round(-dw/2), Math.round(-dh/2), dw, dh);
        } else {
          ctx.drawImage(imOpen, 0, 0, imOpen.width, imOpen.height, Math.round(-w/2), Math.round(-h/2), w, h);
        }
      };

      const isLRDoor = (!info.corridorVertical && !!imClosedLR);

      const drawClosed = () => {
        if (!info.corridorVertical && imClosedLR) {
          const dw = h;
          const dh = w;
          ctx.globalAlpha = 0.98;
          ctx.drawImage(imClosedLR, 0, 0, imClosedLR.width, imClosedLR.height, Math.round(-dw/2), Math.round(-dh/2), dw, dh);
        } else {
          drawClosedComposite(info, w, h);
        }
      };

      if (!closed && animK !== 'close') {
        // fully open
        drawOpen(0.95);
      } else if (closed && animK !== 'open') {
        // fully closed
        drawClosed();
      } else if (animK === 'close') {
        // Close animation.
        // - Front doors: vines spill down (original)
        // - Left/Right doors: two panels slide toward the center (vertical open/close)
        drawOpen(0.75);
        const p = animP;

        if (!info.corridorVertical && imClosedLR) {
          const dw = h;
          const dh = w;
          const shift = (1 - p) * (dh * 0.50);
          // Top panel
          ctx.save();
          ctx.translate(0, -shift);
          ctx.beginPath();
          ctx.rect(Math.round(-dw/2), Math.round(-dh/2), Math.round(dw), Math.round(dh/2));
          ctx.clip();
          drawClosed();
          ctx.restore();
          // Bottom panel
          ctx.save();
          ctx.translate(0, +shift);
          ctx.beginPath();
          ctx.rect(Math.round(-dw/2), 0, Math.round(dw), Math.round(dh/2));
          ctx.clip();
          drawClosed();
          ctx.restore();
          drawCloseDust(p, info, w, h);
        } else {
          const drop = (1 - p) * TS * 0.55;
          ctx.save();
          ctx.translate(0, -drop);
          ctx.beginPath();
          ctx.rect(Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h * p));
          ctx.clip();
          drawClosed();
          ctx.restore();
          drawCloseDust(p, info, w, h);
        }
      }
      else if (animK === 'open') {
        // Open animation.
        // - Front doors: retract upward (original)
        // - Left/Right doors: two panels slide outward (up/down) to open
        const p = animP;

        if (!info.corridorVertical && imClosedLR) {
          const dw = h;
          const dh = w;
          const shift = p * (dh * 0.50);
          const a = Math.max(0, 1 - p * 0.90);
          // Top panel
          ctx.save();
          ctx.globalAlpha = ctx.globalAlpha * a;
          ctx.translate(0, -shift);
          ctx.beginPath();
          ctx.rect(Math.round(-dw/2), Math.round(-dh/2), Math.round(dw), Math.round(dh/2));
          ctx.clip();
          drawClosed();
          ctx.restore();
          // Bottom panel
          ctx.save();
          ctx.globalAlpha = ctx.globalAlpha * a;
          ctx.translate(0, +shift);
          ctx.beginPath();
          ctx.rect(Math.round(-dw/2), 0, Math.round(dw), Math.round(dh/2));
          ctx.clip();
          drawClosed();
          ctx.restore();
          drawOpen(0.55 + 0.40 * p);
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(Math.round(-w/2), Math.round(-h/2), Math.round(w), Math.round(h * (1 - p)));
          ctx.clip();
          drawClosed();
          ctx.restore();
          drawOpen(0.55 + 0.40 * p);
        }
      }


      // Tile-edge masking: connect vine door edges to surrounding wall tiles.
      // (Prevents the "transparent wall" feel when closed.)
      // Edge mask: works well for front doors. For LR doors we use a full sprite,
      // so masking can create odd seams; skip it.
      if (info.corridorVertical) {
        try {
          const a = (closed || animK === 'close') ? 0.92 : 0.55;
          drawDoorEdgeMask(info, w, h, a);
        } catch (_) {}
      }

      // Closed-door ambient rustle: tiny dust specks near the base edge
      if (closed && animK !== 'open') {
        const dustA = 0.14 + (Math.sin(tNow * 0.004 + seed * 13) * 0.5 + 0.5) * 0.10;
        ctx.save();
        ctx.globalAlpha = dustA;
        ctx.fillStyle = 'rgba(255,255,255,1)';
        for (let i = 0; i < 4; i++) {
          const r = ((strHash(String(seedKey||'') + ':d' + i) % 1000) / 1000);
          const px = -w*0.35 + r * (w*0.70);
          const py = h*0.18 + (Math.sin(tNow * 0.006 + r * 9) * 4);
          ctx.beginPath();
          ctx.ellipse(px, py, 1.4, 1.0, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // subtle vine wiggle lines
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = 'rgba(110,196,150,1)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const r = ((strHash(String(seedKey||'') + ':l' + i) % 1000) / 1000);
          const x0 = -w/2 + 10 + r * (w - 20);
          const y0 = -h/2 + 8;
          const x1 = x0 + Math.sin(tNow * 0.004 + r * 12) * 10;
          const y1 = y0 + 18 + r * 8;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // highlight outline to make it readable
      if (closed || animK === 'close') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-planeW/2, -planeH/2, planeW, planeH, 10);
        ctx.stroke();
      }

      // water-blocked pulse overlay
      if (blocked) {
        const pulse = (Math.sin(tNow * 0.015 + (strHash(seedKey || '') % 999) * 0.01) * 0.5 + 0.5);
        ctx.strokeStyle = `rgba(125,211,252,${0.25 + pulse * 0.25})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-planeW * 0.55, -planeH * 0.48, planeW * 1.1, planeH * 0.96, 12);
        ctx.stroke();
      }

      ctx.restore();
      return;
    }

    // Fallback procedural vine door
    const w = TS * 0.95;
    const h = TS * 0.9;
    const seed2 = (strHash(seedKey || '') % 1000) * 0.01;
    const wig2 = Math.sin(tNow * 0.012 + seed2 * 7) * (closed ? 0.9 : 0.55);
    const sway2 = Math.sin(tNow * 0.006 + seed2 * 11) * (closed ? 0.35 : 0.22);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway2 * 0.05);

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';

    let fill = closed ? 'rgba(255,90,122,.22)' : 'rgba(102,224,163,.14)';
    if (blocked) fill = 'rgba(125,211,252,.18)';
    ctx.fillStyle = fill;

    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = blocked ? 'rgba(125,211,252,.72)' : 'rgba(255,255,255,.6)';
    ctx.lineWidth = closed ? 5 : 2.5;

    const c1x = -8 + wig2;
    const c1y = -6 - wig2 * 0.35;
    const c2x = 8 - wig2;
    const c2y = 6 + wig2 * 0.28;

    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-w/2 + 6, -h/2 + 6 + i*3);
      ctx.bezierCurveTo(c1x, c1y + i*1.2, c2x, c2y - i*0.6, w/2 - 6, h/2 - 6 - i*2);
      ctx.stroke();
    }

    if (blocked) {
      const r = (Math.sin(tNow * 0.01 + seed2 * 3) * 0.5 + 0.5);
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
    const sheet = AS.pixel?.water_overflow_sheet;
    const rock = AS.pixel?.rock_2 || AS.pixel?.rock_1;

    const tNow = now();

    ctx.save();
    ctx.translate(x, y);

    // Missions are intentionally drawn at 2x tile size (64x64) for readability.
    const DW = TS * 2;

    // Grounded hole (stronger contact + rim so it doesn't look like it's floating)
    ctx.fillStyle = 'rgba(0,0,0,.40)';
    ctx.beginPath();
    ctx.ellipse(0, 20, 24, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // muddy rim
    ctx.fillStyle = 'rgba(92,62,42,.95)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // hole depth
    ctx.fillStyle = 'rgba(24,18,16,.95)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 14, 18, 9.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Water stains remain around the hole even when it is blocked (requested).
    // Keep it subtle when not active; stronger when the water is overflowing.
    {
      const active = (m.state === 'active');
      const a = active ? 0.18 : 0.11;
      ctx.fillStyle = `rgba(125,211,252,${a})`;
      ctx.beginPath();
      ctx.ellipse(0, 28, 30, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(125,211,252,${a * 0.75})`;
      ctx.beginPath();
      ctx.ellipse(-10, 26, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (m.state === 'solved') {
      // Mission solved: carrot plug seals the hole (clear contrast)
      const sealedAt = m.sealedAt || 0;
      const age = sealedAt ? (tNow - sealedAt) : 9999;
      const p = clamp(age / 520, 0, 1);
      const drop = (1 - p);
      const bounce = Math.sin(p * Math.PI) * 5.0 * (1 - p * 0.35);
      const yOff = -DW * 0.35 * drop + bounce;
      const sc = 0.80 + 0.20 * p;

      {
        const rw = DW * sc;
        const rh = DW * sc;
        const cx = 0;
        const cy = 10 + yOff;
        // carrot body
        ctx.fillStyle = 'rgba(255,152,84,.98)';
        ctx.beginPath();
        ctx.roundRect(cx - rw*0.18, cy - rh*0.22, rw*0.36, rh*0.46, 10);
        ctx.fill();
        // carrot shading
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        ctx.beginPath();
        ctx.roundRect(cx - rw*0.18, cy - rh*0.02, rw*0.36, rh*0.26, 10);
        ctx.fill();
        // carrot highlight
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath();
        ctx.roundRect(cx - rw*0.14, cy - rh*0.18, rw*0.08, rh*0.32, 8);
        ctx.fill();
        // leaves
        ctx.fillStyle = 'rgba(74,222,128,.95)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - rh*0.24);
        ctx.lineTo(cx - rw*0.10, cy - rh*0.40);
        ctx.lineTo(cx - rw*0.02, cy - rh*0.42);
        ctx.lineTo(cx + rw*0.02, cy - rh*0.34);
        ctx.lineTo(cx + rw*0.10, cy - rh*0.40);
        ctx.lineTo(cx + rw*0.06, cy - rh*0.26);
        ctx.closePath();
        ctx.fill();
        // outline for contrast
        ctx.strokeStyle = 'rgba(0,0,0,.30)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // sealing dust + ring for the first ~1.2s
      if (age < 1200) {
        const a = clamp(1 - age / 1200, 0, 1);
        const pulse = (Math.sin(tNow * 0.03) * 0.5 + 0.5);

        ctx.strokeStyle = `rgba(255,255,255,${0.25 * a + pulse * 0.10 * a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 12, (18 + 22 * (1 - a)) * 1.5, (10 + 12 * (1 - a)), 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(165,120,78,${0.22 * a})`;
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2;
          const r = 10 + 26 * (1 - a);
          const px = Math.cos(ang) * r;
          const py = 12 + Math.sin(ang) * r * 0.55;
          ctx.beginPath();
          ctx.ellipse(px, py, 3.2, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

    } else if (m.state !== 'active') {
      // Mission not active: block the hole with a carrot (instead of a rock)
      // while keeping the wet stains around it (requested).
      const seed = (strHash(String(m.kind || '')) % 999) * 0.01;
      const bob = Math.sin(tNow * 0.010 + seed * 11) * 2.0;

      const sc = 0.78;
      const rw = DW * sc;
      const rh = DW * sc;
      const cx = 0;
      const cy = 12 + bob;

      // carrot body
      ctx.fillStyle = 'rgba(255,152,84,.98)';
      ctx.beginPath();
      ctx.roundRect(cx - rw*0.16, cy - rh*0.22, rw*0.32, rh*0.46, 10);
      ctx.fill();
      // carrot shading
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath();
      ctx.roundRect(cx - rw*0.16, cy - rh*0.02, rw*0.32, rh*0.26, 10);
      ctx.fill();
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath();
      ctx.roundRect(cx - rw*0.12, cy - rh*0.18, rw*0.07, rh*0.32, 8);
      ctx.fill();
      // leaves
      ctx.fillStyle = 'rgba(74,222,128,.95)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - rh*0.24);
      ctx.lineTo(cx - rw*0.10, cy - rh*0.40);
      ctx.lineTo(cx - rw*0.02, cy - rh*0.42);
      ctx.lineTo(cx + rw*0.02, cy - rh*0.34);
      ctx.lineTo(cx + rw*0.10, cy - rh*0.40);
      ctx.lineTo(cx + rw*0.06, cy - rh*0.26);
      ctx.closePath();
      ctx.fill();
      // outline for contrast
      ctx.strokeStyle = 'rgba(0,0,0,.28)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // subtle "sealed" ring
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 12, 26, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Active mission: water is overflowing (animated)
      const activatedAt = m.activatedAt || 0;
      const rise = activatedAt ? clamp((tNow - activatedAt) / 420, 0, 1) : 1;
      const riseY = (1 - rise) * 18;
      const alpha = 0.35 + 0.65 * rise;

      if (sheet) {
        const frame = (Math.floor(tNow / 160) % 2);
        const bob = Math.sin(tNow * 0.012) * 4.0;
        const sx = frame * 32;
        ctx.save();
        ctx.globalAlpha *= alpha;
        // Place water closer to the ground hole and "rise" in when activated.
        ctx.drawImage(sheet, sx, 0, 32, 32,
          Math.round(-DW / 2), Math.round(-DW / 2 + 6 + bob + riseY), DW, DW);
        ctx.restore();
      } else {
        // fallback simple water jet
        const t = tNow / 300;
        const amp = 6;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = 'rgba(125,211,252,.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.bezierCurveTo(-3, -8 - Math.sin(t) * amp + riseY * 0.4, 3, -12 - Math.cos(t) * amp + riseY * 0.4, 0, -18 - Math.sin(t * 1.3) * amp + riseY * 0.4);
        ctx.stroke();
        ctx.restore();
      }

      // extra droplets (active only)
      const base = tNow * 0.006 + (strHash(String(m.kind || '')) % 997);
      const nDrop = 4;
      for (let i = 0; i < nDrop; i++) {
        const tt = base + i * 1.7;
        const px = Math.sin(tt) * (10 + i * 2);
        const py = 20 + ((tt * 22) % 26);
        const a = clamp(0.75 - (py / 70), 0, 1) * 0.95 * alpha;
        ctx.fillStyle = `rgba(125,211,252,${a})`;
        ctx.beginPath();
        ctx.ellipse(px, py, 1.8, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // active marker
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = '900 26px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -DW * 0.75);
    }

    ctx.restore();
  }

  function drawFx(cam) {
    const tNow = now();
    // 오래된 효과 정리
    G.fx = G.fx.filter(f => tNow - (f.bornAt || tNow) < 1800);

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

      if (f.kind === 'seal') {
        const age = (tNow - f.bornAt) / 1000;
        const p = clamp(age / 0.9, 0, 1);
        const x = (f.x + 0.5) * TS - cam.x;
        const y = (f.y + 0.5) * TS - cam.y;
        const a = 1 - p;

        ctx.save();
        ctx.translate(x, y);

        // dust burst
        ctx.fillStyle = `rgba(165,120,78,${0.26 * a})`;
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          const r = 8 + 30 * p;
          const px = Math.cos(ang) * r;
          const py = 10 + Math.sin(ang) * r * 0.55;
          ctx.beginPath();
          ctx.ellipse(px, py, 3.2, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // sparkle ticks
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + 0.6;
          const r1 = 10 + 18 * p;
          const r2 = r1 + 8;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * r1, 4 + Math.sin(ang) * r1 * 0.6);
          ctx.lineTo(Math.cos(ang) * r2, 4 + Math.sin(ang) * r2 * 0.6);
          ctx.stroke();
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

      if (f.kind === 'doorClose') {
        const age = (tNow - f.bornAt) / 1000;
        const p = clamp(age / 0.55, 0, 1);
        const x = (f.x + 0.5) * TS - cam.x;
        const y = (f.y + 0.5) * TS - cam.y;
        const a = 1 - p;

        ctx.save();
        ctx.translate(x, y);

        // dusty thud burst
        ctx.fillStyle = `rgba(165,120,78,${0.28 * a})`;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          const r = 6 + 26 * p;
          const px = Math.cos(ang) * r;
          const py = 10 + Math.sin(ang) * r * 0.55;
          ctx.beginPath();
          ctx.ellipse(px, py, 3.0, 2.1, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // vine bits
        ctx.strokeStyle = `rgba(140,255,190,${0.35 * a})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + 0.6;
          const r1 = 8 + 10 * p;
          const r2 = r1 + 10;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * r1, 2 + Math.sin(ang) * r1 * 0.6);
          ctx.lineTo(Math.cos(ang) * r2, 2 + Math.sin(ang) * r2 * 0.6);
          ctx.stroke();
        }

        ctx.restore();
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

  function drawGlasses(x, y, intensity = 0.65) {
    const t = now() * 0.01;
    const shine = (Math.sin(t) * 0.5 + 0.5) * (0.14 + 0.22 * intensity);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.40 * intensity})`;
    ctx.shadowColor = `rgba(255,255,255,${0.18 * intensity})`;
    ctx.shadowBlur = 4 * intensity;
    ctx.lineWidth = 2;
    // 테두리
    ctx.beginPath();
    ctx.arc(-6, 0, 5, 0, Math.PI*2);
    ctx.arc(6, 0, 5, 0, Math.PI*2);
    ctx.moveTo(-1, 0);
    ctx.lineTo(1, 0);
    ctx.stroke();
    // 반짝
    ctx.fillStyle = `rgba(255,255,255,${0.06 + shine})`;
    ctx.beginPath();
    ctx.ellipse(-8, -2, 2.2, 1.2, -0.4, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -3, 2.4, 1.3, -0.4, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  
  // ---------- Togester-style pixel bunny (procedural character; no external sprite dependency) ----------
  function _hexToRgb(hex){
    const h = (hex || '#000000').replace('#','').trim();
    const v = h.length === 3 ? h.split('').map(c=>c+c).join('') : h.padEnd(6,'0').slice(0,6);
    const n = parseInt(v,16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function _rgbToHex(r,g,b){
    const to = (x)=>('0'+Math.max(0,Math.min(255,Math.round(x))).toString(16)).slice(-2);
    return '#'+to(r)+to(g)+to(b);
  }
  function _shade(hex, amt){
    const {r,g,b} = _hexToRgb(hex);
    const f = (x)=> x + (amt/100) * (amt>0 ? (255-x) : x);
    return _rgbToHex(f(r), f(g), f(b));
  }

  function drawTogesterBunny(x, y, color, name, isLocal=false, isDead=false, state){
    ctx.save();
    // Don't dim fainted players with a black overlay; use pose/FX instead.
    if (isDead) ctx.globalAlpha = 1;
    const s = state || {};
    const vx = (typeof s.vx === 'number') ? s.vx : 0;
    const vy = (typeof s.vy === 'number') ? s.vy : 0;
    const onGround = (typeof s.onGround === 'boolean') ? s.onGround : true;
    const facing = (typeof s.facing === 'number') ? s.facing : (vx < -0.2 ? -1 : 1);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 14, 4, 0, 0, Math.PI*2);
    ctx.fill();

    const PX = 2;     // 1px = 2 screen px
    const W = 16, H = 18; // sprite pixels
    const drawW = W * PX, drawH = H * PX;

    // align bottom-center
    const baseX = Math.round(x - drawW/2);
    const baseY = Math.round(y - drawH + 18);

    const t = performance.now() / 1000;
    const moving = onGround && Math.abs(vx) > 0.6;
    const jumping = !onGround && vy < -0.6;

    // 3-phase walk
    const walkPhase = moving ? (Math.floor(t * 12) % 3) : 0;
    const bob = moving ? Math.sin(t * 12) * 0.8 : Math.sin(t * 2.2) * 0.4;
    const bobPx = Math.round(bob);

    const OUT = _shade(color, -45);
    const BASE = color;
    const HI = _shade(color, 25);
    const FACE = '#f2c8a0';
    const INNER = '#ffb8d0';
    const EYE = '#1f1f1f';
    const BLUSH = 'rgba(255,184,208,0.85)';

    const p = (px, py, w=1, h=1, c=BASE) => {
      ctx.fillStyle = c;
      ctx.fillRect(baseX + px*PX, baseY + (py + bobPx)*PX, w*PX, h*PX);
    };

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const cx = baseX + drawW/2;
    const cy = baseY + drawH/2;
    ctx.translate(cx, cy);
    ctx.scale(facing, 1);
    ctx.translate(-cx, -cy);

    // ===== Long bunny ears (built into frame) =====
    const earTilt = jumping ? 1 : (moving ? walkPhase : 0);
    // left ear
    p(4, 0, 2, 6, OUT);
    p(5, 1, 1, 4, BASE);
    p(5, 2, 1, 3, INNER);
    // right ear
    p(10, 0, 2, 6, OUT);
    p(10, 1, 1, 4, BASE);
    p(10, 2, 1, 3, INNER);
    // ear wobble pixels
    if (moving){
      if (earTilt == 1) { p(3, 2, 1, 1, OUT); p(11, 3, 1, 1, OUT); }
      if (earTilt == 2) { p(3, 3, 1, 1, OUT); p(11, 2, 1, 1, OUT); }
    }

    // ===== Body (2.5-head-ish) =====
    // outline shell
    p(4, 6, 8, 10, OUT);
    p(5, 7, 6, 8, BASE);
    // face patch
    p(6, 8, 4, 4, FACE);
    p(6, 12, 4, 2, _shade(FACE, -10));

    // visor-like cute highlight (togester vibe but bunny)
    p(6, 9, 4, 1, _shade(FACE, 18));

    // eyes
    p(7, 9, 1, 1, EYE);
    p(9, 9, 1, 1, EYE);

    // blush
    p(6, 10, 1, 1, BLUSH);
    p(10, 10, 1, 1, BLUSH);

    // little nose
    p(8, 10, 1, 1, _shade(INNER, -10));

    // ===== Legs/feet (walk) =====
    const legY = 15;
    if (!onGround){
      // tuck legs
      p(6, legY, 2, 1, OUT);
      p(8, legY, 2, 1, OUT);
    } else if (!moving){
      p(6, legY, 2, 2, OUT);
      p(8, legY, 2, 2, OUT);
      p(6, legY+1, 2, 1, HI);
      p(8, legY+1, 2, 1, HI);
    } else {
      // three-step
      if (walkPhase === 0){
        p(6, legY, 2, 2, OUT);
        p(9, legY, 1, 2, OUT);
      } else if (walkPhase === 1){
        p(6, legY, 1, 2, OUT);
        p(8, legY, 2, 2, OUT);
      } else {
        p(6, legY, 2, 2, OUT);
        p(8, legY, 2, 2, OUT);
        p(5, legY-1, 1, 1, HI);
        p(11, legY-1, 1, 1, HI);
      }
      // foot highlights
      p(6, legY+1, 2, 1, HI);
      p(8, legY+1, 2, 1, HI);
    }

    // carrot badge (math bunny concept)
    p(11, 11, 1, 2, '#ff8a3d');
    p(12, 12, 1, 1, '#ff8a3d');
    p(12, 11, 1, 1, '#4ade80');
    ctx.restore();
    ctx.restore();
  }

  function drawHairAccentOnSprite(x, y, colorIdx, dir, facing) {
    // Small pixel tuft overlay so 8 players differ by BOTH clothes(row) and hair.
    const col = hairHex(colorIdx || 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    // Match sprite mirroring logic (only side view mirrors)
    if (dir === 2) ctx.scale(-facing, 1);

    // Sprite is drawn at (-SPR_W/2, -60)
    const ox = -SPR_W / 2;
    const oy = -60;

    ctx.fillStyle = col;
    // Bigger tuft + fringe so it's clearly visible on mobile.
    // top tuft
    ctx.fillRect(ox + 26, oy + 7, 12, 4);
    ctx.fillRect(ox + 29, oy + 4, 6, 3);
    // fringe
    ctx.fillRect(ox + 27, oy + 11, 10, 2);
    // side strands
    ctx.fillRect(ox + 24, oy + 11, 4, 3);
    ctx.fillRect(ox + 36, oy + 11, 4, 3);

    // subtle outline for contrast
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 26, oy + 7, 12, 4);

    ctx.restore();
  }

  function drawBlackCarrotIcon(x, y, scale = 1) {
    // Cute '검은당근' marker (UI overlay), drawn in screen space.
    const s = Math.max(0.6, scale);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    // shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 16, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // carrot body
    ctx.fillStyle = 'rgba(10,10,14,.96)';
    ctx.beginPath();
    roundRect(ctx, -6, -4, 12, 18, 6);
    ctx.fill();

    // highlight
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    roundRect(ctx, -4.5, -2.5, 3.5, 14, 4);
    ctx.fill();

    // leaves
    ctx.fillStyle = 'rgba(34,197,94,.95)';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-7, -16);
    ctx.lineTo(-2, -18);
    ctx.lineTo(0, -12);
    ctx.lineTo(2, -18);
    ctx.lineTo(7, -16);
    ctx.lineTo(0, -6);
    ctx.closePath();
    ctx.fill();

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function drawWorldKillPrompt(cam, target) {
    if (!target) return;
    const sx = (target.wx - cam.x) * ZOOM;
    const sy = (target.wy - cam.y) * ZOOM;

    let x = sx;
    let y = sy - 92;

    // keep on screen
    x = clamp(x, 28, viewW - 28);
    y = clamp(y, 18, viewH - 18);

    ctx.save();
    ctx.globalAlpha = 0.96;
    drawBlackCarrotIcon(x, y, 1.0);

    // tiny hint text (PC readability). Mobile already has the button.
    if (!isMobile) {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '900 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('X: 0점', x, y + 34);
    }
    ctx.restore();
  }



  function drawPlayer(p, x, y) {
    // Sprite-sheet character (togester-like, bunny suit). We keep the old
    // procedural fallback so the game still runs even if the sheet fails.
    const vt = p.vent;
    let restored = false;
    if (vt) {
      const tNow = now();
      const dur = Math.max(1, vt.end - vt.start);
      const p01 = clamp((tNow - vt.start) / dur, 0, 1);
      const alpha = p01 < 0.5 ? (1 - p01 * 2) : ((p01 - 0.5) * 2);
      ctx.save();
      restored = true;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      y += 10 * (p01 < 0.5 ? p01 * 2 : (1 - p01) * 2);
    }

    const inWaterTile = !!waterAtTile(Math.floor(p.x / TS), Math.floor(p.y / TS));
    const swimming = inWaterTile && p.role === 'teacher' && !p.down && !p.vent;
    if (swimming) {
      const stt = now() * 0.006 + (strHash(p.id) % 997);
      y += Math.sin(stt) * 2.2;
    }

    const meId = G.net?.myPlayerId;
    const isLocal = (meId === p.id);

    const speed = Math.hypot(p.vx || 0, p.vy || 0);
    const moving = speed > 4.5;
    const facing = (typeof p.facing === 'number') ? p.facing : (p.vx < -0.2 ? -1 : 1);

    // Motion selection (v3 sheet): walk / swim / faint / cry / tsk
    const MOTION_ROWS = 5;
    const DIR_ROWS = 3; // 0:front/down, 1:back/up, 2:side (left/right via mirroring)
    const motionMap = { walk: 0, swim: 1, faint: 2, cry: 3, tsk: 4 };
    let motion = 'walk';
    if (p.down) motion = 'faint';
    else if (p.emoteUntil && now() < p.emoteUntil && (p.emoteKind === 'cry' || p.emoteKind === 'tsk')) motion = p.emoteKind;
    else if (swimming) motion = 'swim';

    // frame index
    const base = now() * 0.012 + (strHash(p.id) % 997);
    let frame = 0;
    if (motion === 'walk') frame = moving ? Math.floor(base % 6) : 0;
    else if (motion === 'swim') frame = Math.floor(base % 6);
    else if (motion === 'faint') frame = Math.floor((base * 0.35) % 2);
    else if (motion === 'cry') frame = Math.floor((base * 0.8) % 4);
    else if (motion === 'tsk') frame = Math.floor((base * 0.9) % 3);

    // 픽셀 퍼펙트: 서브픽셀 렌더링은 얇은 투명 줄/떨림을 만든다.
    // (특히 스프라이트시트에서 한 줄이 투명해 보이는 현상)
    x = snapPx(x);
    y = snapPx(y);

    // direction row (only affects sprite selection; movement/physics unchanged)
    const avx = p.vx || 0, avy = p.vy || 0;
    let dir = (typeof p.dir === 'number') ? p.dir : 0;
    if (typeof p.dir !== 'number') {
      if (Math.abs(avy) > Math.abs(avx)) dir = (avy < -0.2 ? 1 : 0);
      else if (Math.abs(avx) > 0.2) dir = 2;
    }

    const colorRowsAvail = (AS.charsImg && AS.charsImg.height)
      ? Math.max(1, Math.floor((AS.charsImg.height / SPR_H) / (MOTION_ROWS * DIR_ROWS)))
      : COLOR_ROWS;
    const colorIdx = (((p.color || 0) % colorRowsAvail) + colorRowsAvail) % colorRowsAvail;
    const row = colorIdx * (MOTION_ROWS * DIR_ROWS) + motionMap[motion] * DIR_ROWS + dir;

    // Slight y offset when fainted so the body lies on the ground (and doesn't look like it's floating).
    const ySprite = y + (p.down ? 14 : 0);

    // Soft ground shadow (helps characters feel grounded)
    ctx.save();
    const shA = p.down ? 0.30 : 0.22;
    const shW = p.down ? 18 : 14;
    const shH = p.down ? 7 : 6;
    const shY = y + (p.down ? 18 : 10);
    ctx.fillStyle = "rgba(0,0,0," + shA + ")";
    ctx.beginPath();
    ctx.ellipse(x, shY, shW, shH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Kill pose: shown to everyone (requested). This reveals the teacher during the action.
    const killPose = p.role === 'teacher' && p.emoteUntil && now() < p.emoteUntil && p.emoteKind === 'kill0' && AS.pixel?.teacher_kill0_sheet;

    if (killPose) {
      const sheet = AS.pixel.teacher_kill0_sheet;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, ySprite);
      if (dir === 2) ctx.scale(-facing, 1);
      else ctx.scale(1, 1);
      // choose view based on dir: 0(front) 1(back) 2(side
      const viewX = (dir === 1) ? 128 : (dir === 2 ? 0 : 64);
      ctx.drawImage(sheet, viewX, 0, 64, 72, -SPR_W / 2, -60, SPR_W, SPR_H);
      ctx.restore();
    } else     if (AS.charsImg) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(x, ySprite);
      // Mirror only for side sprites; front/back stay facing camera
      if (dir === 2) ctx.scale(-facing, 1);
      else ctx.scale(1, 1);
      const sx = frame * SPR_W;
      const sy = row * SPR_H;
      // anchor: center-ish
      ctx.drawImage(AS.charsImg, sx, sy, SPR_W, SPR_H, -SPR_W / 2, -60, SPR_W, SPR_H);
      ctx.restore();
      // Player distinction is handled by clothes color; extra head accents were removed (requested).
    } else {
      // fallback (should rarely happen)
      const col = colorHex(p.color || 0);
      const st = { vx: p.vx || 0, vy: p.vy || 0, onGround: true, facing };
      drawTogesterBunny(x, y, col, p.nick || '', isLocal, !!p.down, st);
    }

    if (swimming) drawSwimOverlay(x, y);

    if (p.crown) drawCrown(x, y - 56);

    // Mission progress indicator (shown during mission interaction)
    if (p.missionStage && p.missionSiteId && !p.down) {
      drawMissionPercent(x, ySprite - 54, p.missionStage);
    }

    // 역할은 '본인에게만' 보여야 함: 선생토끼 안경은 본인 화면에서만 렌더링.
    // (상태에는 role이 실려오더라도, 타 유저 화면에서는 안경이 보이지 않게 한다.)
    try{
      const me = (G.net && G.net.myPlayerId) ? (G.state.players && G.state.players[G.net.myPlayerId]) : null;
      const isMeTeacher = !!me && (me.role === 'teacher') && !G.state.practice;
      if (isMeTeacher && isLocal) {
        const shining = (p.glassesUntil && now() < p.glassesUntil);
        if (dir === 0) {
          // y는 발밑 기준이므로 얼굴까지 충분히 올려서 붙인다 (조금 더 아래로)
          // Lower the glasses so they sit on the eyes (requested).
          drawGlasses(x, ySprite - 26, shining ? 1.0 : 0.7);
        }
      }
    }catch(_){ }

    if (p.down) {
      const tt = now() / 140;
      for (let i = 0; i < 3; i++) {
        const ang = tt + i * (Math.PI * 2 / 3);
        const rx = Math.cos(ang) * 10;
        const ry = -24 + Math.sin(ang) * 4;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(x + rx, ySprite + ry, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255,90,122,.95)';
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('빵점', x, ySprite - 26);
    }


    // nick
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 4;
    ctx.font = '900 13px system-ui';
    ctx.textAlign = 'center';
    // Slightly higher so it doesn't overlap ears/glasses on small screens.
    // Requested: raise nickname a bit more for readability.
    // Raise nickname a bit more (requested: ~7px)
    ctx.strokeText(p.nick, x, y - 64);
    ctx.fillText(p.nick, x, y - 64);

    // teacher-only cooldown hint (keep)
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

  function drawMissionPercent(x, y, stage) {
    const pct = (stage === 1) ? 33 : (stage === 2) ? 66 : 100;
    const text = `${pct}%`;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 12px system-ui';
    const w = Math.max(38, ctx.measureText(text).width + 18);
    const h = 18;
    ctx.fillStyle = 'rgba(10,14,26,.75)';
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w/2, y - h/2, w, h, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
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

  // World-space prompt (bigger "열기/닫기" near doors, etc.)
  function drawWorldInteractPrompt(cam, target){
    if (!target) return;
    const sx0 = (target.wx - cam.x) * ZOOM;
    const sy0 = (target.wy - cam.y) * ZOOM;
    const label = target.label || '조작';

    // place above the target
    let x = sx0;
    let y = sy0 - 66;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.font = '1100 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Larger prompt for door open/close on mobile.
    const iconW = 40;
    const padX = 18;
    const padY = 12;
    const textW = ctx.measureText(label).width;
    const w = Math.max(76, textW + padX * 2 + iconW);
    const h = 44;

    // keep on screen
    x = clamp(x, w/2 + 10, viewW - w/2 - 10);
    y = clamp(y, 16, viewH - 16);

    // background
    ctx.fillStyle = 'rgba(10,14,26,.78)';
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w/2, y - h/2, w, h, 14);
    ctx.fill();
    ctx.stroke();

    // icon
    ctx.save();
    ctx.translate(x - w/2 + 20, y);
    ctx.fillStyle = (target.type === 'root_door') ? 'rgba(102,224,163,.95)' : 'rgba(255,255,255,.85)';
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(8,16,34,.95)';
    ctx.font = '1100 18px system-ui';
    // All interactions are done with X (or touch on mobile).
    ctx.fillText('X', 0, 0);
    ctx.restore();

    // label
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.font = '1100 20px system-ui';
    ctx.fillText(label, x + iconW*0.15, y);
    ctx.restore();
  }

  function nearestHint(me) {
    const st = G.state;
    let canInteract = false;
    let canKill = false;
    let killTarget = null;
    let target = null; // { type, id, label, wx, wy }
    let bestD2 = Infinity;

    // interactable (pick the closest target for better UI/label)
    for (const obj of Object.values(st.objects)) {
      if (!obj || !['meeting_bell', 'mission', 'root_door', 'vent_hole', 'lamp'].includes(obj.type)) continue;
      if (obj.type === 'vent_hole' && (me.role !== 'teacher' || st.practice)) continue;

      // Lamp rules: teacher can ONLY turn OFF, students can ONLY turn ON
      if (obj.type === 'lamp') {
        const lp = st.lamps && st.lamps[obj.id];
        if (!lp) continue;
        if (me.role === 'teacher' && !lp.on) continue;
        if (me.role !== 'teacher' && lp.on) continue;
      }

      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      const d2 = dist2(me.x, me.y, ox, oy);
      const range2 = (obj.type === 'mission') ? (MISSION_INTERACT_RANGE ** 2) : (INTERACT_RANGE ** 2);
      if (d2 > range2) continue;
      canInteract = true;

      if (d2 < bestD2) {
        bestD2 = d2;
        let label = '조작';
        if (obj.type === 'mission') label = '미션';
        else if (obj.type === 'meeting_bell') label = '회의';
        else if (obj.type === 'vent_hole') label = '땅굴';
        else if (obj.type === 'root_door') {
          const dd = st.doors && st.doors[obj.id];
          label = (dd && dd.closed) ? '열기' : '닫기';
        }
        else if (obj.type === 'lamp') {
          const lp = st.lamps && st.lamps[obj.id];
          label = (lp && lp.on) ? '끄기' : '켜기';
        }
        target = { type: obj.type, id: obj.id, label, wx: ox, wy: oy };
      }
    }
    // bodies (report)
    for (const p of Object.values(st.players)) {
      if (!p || !p.down || !p.alive) continue;
      const d2 = dist2(me.x, me.y, p.x, p.y);
      if (d2 <= (INTERACT_RANGE + 10) ** 2) {
        canInteract = true;
        if (d2 < bestD2) {
          bestD2 = d2;
          target = { type: 'body', id: p.id, label: '신고', wx: p.x, wy: p.y };
        }
      }
    }
    // kill hint (teacher only)
    if (me.role === 'teacher' && !st.practice && now() >= (me.killCdUntil || 0)) {
      let best = null;
      let bestD2 = Infinity;
      for (const p of Object.values(st.players)) {
        if (!p.alive || p.down) continue;
        if (p.id === me.id) continue;
        const d2 = dist2(me.x, me.y, p.x, p.y);
        if (d2 <= KILL_RANGE ** 2 && d2 < bestD2) {
          bestD2 = d2;
          best = p;
        }
      }
      if (best) {
        canKill = true;
        killTarget = { id: best.id, wx: best.x, wy: best.y };
      }
    }

    return { canInteract, canKill, target, killTarget };
  }



  // ---------- Client-side prediction (non-host) ----------
  // When I'm not the host, waiting for host snapshots (15~30fps) makes my OWN
  // movement look choppy. Predict locally each frame, then let host snapshots
  // softly correct us (see state handler).
  function clientPredictLocalMove(dt) {
    const net = G.net;
    if (!net || net.isHost) return;
    if (G.phase !== 'play') return;
    const myId = Number(net.myPlayerId || 0);
    if (!myId) return;
    const st = G.state;
    const me = st.players && st.players[myId];
    if (!me || !me.alive || me.down) return;
    if (me.vent) return;

    const frozen = now() < (me.frozenUntil || 0);
    let mvx = frozen ? 0 : clamp(G.local.mvx || 0, -1, 1);
    let mvy = frozen ? 0 : clamp(G.local.mvy || 0, -1, 1);
    if (now() < (me.invertUntil || 0)) { mvx = -mvx; mvy = -mvy; }

    // direction/facing (match host logic)
    const ilen = Math.hypot(mvx, mvy);
    if (ilen > 0.12) {
      const avx = Math.abs(mvx), avy = Math.abs(mvy);
      if (avx >= avy * 0.85) {
        me.dir = 2;
        me.facing = (mvx < 0 ? -1 : 1);
      } else if (avy >= avx * 1.10) {
        me.dir = (mvy < 0 ? 1 : 0);
      }
    }

    let spd = SPEED;
    if (now() < (me.slowUntil || 0)) spd *= 0.6;
    const len = Math.hypot(mvx, mvy);
    const tvx = len > 1e-6 ? (mvx / len) * spd : 0;
    const tvy = len > 1e-6 ? (mvy / len) * spd : 0;
    const a = 1 - Math.exp(-dt * 12);
    me.vx = (me.vx || 0) + (tvx - (me.vx || 0)) * a;
    me.vy = (me.vy || 0) + (tvy - (me.vy || 0)) * a;

    const nx = me.x + me.vx * dt;
    const ny = me.y + me.vy * dt;
    moveWithCollision(me, nx, ny);

    // soft-correct towards host auth position (reduces rubber-banding)
    try{
      const ax = (typeof me._authX === 'number') ? me._authX : null;
      const ay = (typeof me._authY === 'number') ? me._authY : null;
      if (ax != null && ay != null) {
        const dx = ax - me.x;
        const dy = ay - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          if (dist > 64) {
            me.x = ax;
            me.y = ay;
            me.vx = 0;
            me.vy = 0;
          } else {
            const maxStep = Math.max(48, TS * 6) * dt;
            const step = Math.min(dist, maxStep);
            const nx2 = me.x + (dx / dist) * step;
            const ny2 = me.y + (dy / dist) * step;
            moveWithCollision(me, nx2, ny2);
          }
        }
      }
    }catch(_){ }
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
      if (t - G.host._lastBroadcast > 33) {
        G.host._lastBroadcast = t;
        broadcastState();
      }
    }

    // client input send
    if (G.net && G.phase === 'play') {
      // If I'm the host, apply my input locally (do NOT rely on server echo)
      // so solo/practice play always responds.
      if (G.net.isHost && G.net.myPlayerId){
        G.host.inputs.set(Number(G.net.myPlayerId || 0), { mvx: clamp(G.local.mvx || 0, -1, 1), mvy: clamp(G.local.mvy || 0, -1, 1), at: now() });
      } else {
        if (!G.local._lastInputAt) G.local._lastInputAt = 0;
        if (t - G.local._lastInputAt > 33) {
          G.local._lastInputAt = t;
          G.net.post({ t: 'input', playerId: Number(G.net.myPlayerId || 0), mvx: G.local.mvx, mvy: G.local.mvy });
        }
      }
    }

    // predict my movement locally when I'm not the host (prevents choppy self-move)
    try { clientPredictLocalMove(dt); } catch (_) {}

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
            G.net.post({ t: 'openMission', playerId: Number(G.net.myPlayerId || 0), siteId: rm.siteId });
          }
        }
        // attempt only once
        G.ui.reopenMission = null;
      }
    }

    // UI
    setHUD();

    // auto-hide role reveal
    if (G.ui.roleRevealUntil && now() >= G.ui.roleRevealUntil) {
      hideRoleReveal();
    }

    draw();
    renderMapUI();
    requestAnimationFrame(frame);
  }

  // ---------- Join flow ----------
  async function joinRoom() {
    if (!G.assetsReady) { showToast('에셋 로딩이 필요해요'); applyPhaseUI(); return; }
    const nick = (nickEl.value || '토끼').trim().slice(0, 10);
    const room = (roomEl.value || '1234').trim().slice(0, 64);

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
      const from = (m && m.from != null) ? String(m.from) : '';
      if (!G.host._clientToPlayer) G.host._clientToPlayer = new Map();

      // Dedupe joins using a per-join token (NOT clientId), because embed sessionId can be shared
      // across iframes. Clients retry join until joinAck arrives, reusing the same joinToken.
      if (!G.host._joinTokenToPlayer) G.host._joinTokenToPlayer = new Map();
      const jt = (m && m.joinToken != null) ? String(m.joinToken) : '';
      if (jt && G.host._joinTokenToPlayer.has(jt)) {
        const pid = Number(G.host._joinTokenToPlayer.get(jt) || 0);
        const p = st.players[pid];
        if (p) {
          p.nick = (m.nick || p.nick || '토끼').trim().slice(0, 10);
          p.clientId = from;
          p.isBot = false;
          p.alive = true;
          p.lastSeen = now();
        }
        net.post({ t: 'joinAck', toClient: from || m.from, playerId: pid, isHost: false, joinToken: jt });
        broadcastState(true);
        return;
      }

      const playersCount = Object.values(st.players).filter(p => !p.isBot).length;
      if (playersCount >= 8) {
        net.post({ t: 'joinDenied', toClient: from || m.from, reason: '방이 가득 찼어!', joinToken: jt });
        return;
      }
      const pid = hostAddPlayer(m.nick || '토끼', false, from || m.from);
      try{ const p = G.state.players && G.state.players[pid]; if (p) p.lastSeen = now(); }catch(_){ }
      if (jt) G.host._joinTokenToPlayer.set(jt, pid);
      if (from) G.host._clientToPlayer.set(from, pid);
      net.post({ t: 'joinAck', toClient: from || m.from, playerId: pid, isHost: false, joinToken: jt });
      broadcastState(true);

      // If we started in practice (e.g., embed auto-start) and now have enough players,
      // switch to the real game by assigning a teacher and notifying roles.
      const humanCountNow = Object.values(st.players).filter(p => !p.isBot).length;
      if (G.host.started && st.practice && humanCountNow >= 4) {
        st.practice = false;
        st.timeLeft = 180;
        st.maxTime = 180;
        hostAssignTeacher();
        for (const pp of Object.values(st.players)) {
          sendToPlayer(pp.id, { t: 'toast', text: (pp.role === 'teacher') ? '당신은 선생토끼야! (임포스터)' : '당신은 학생토끼야! 미션을 해결해!' });
        }
        broadcast({ t: 'toast', text: '인원이 모여서 본게임으로 전환! (선생토끼 배정)' });
      }
    });

    net.on('joinAck', (m) => {
      if (m.toClient !== net.clientId) return;
      // If multiple clients share the same clientId (possible in embed/bridge),
      // only accept the ack that matches my joinToken.
      if (m.joinToken && net.joinToken && String(m.joinToken) !== String(net.joinToken)) return;
      net.myPlayerId = Number(m.playerId || 0);

      // heartbeat (client -> host)
      try{
        if (!net.isHost) {
          if (net._hb) { clearInterval(net._hb); net._hb = null; }
          net._hb = setInterval(()=>{
            try{ net.post({ t: 'ping', playerId: Number(net.myPlayerId || 0) }); }catch(_){ }
          }, 1000);
        }
      }catch(_){ }

      // stop join retry loop
      try{ if (net._joinRetry) { clearInterval(net._joinRetry); net._joinRetry = null; } }catch(_){ }

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
      if (m.joinToken && net.joinToken && String(m.joinToken) !== String(net.joinToken)) return;
      showToast(m.reason || '참가 실패');
      try{ if (net._hb) { clearInterval(net._hb); net._hb = null; } }catch(_){}
      net.close();
      G.net = null;
    });

    // leave/disconnect (host)
    net.on('leave', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (pid) hostRemovePlayer(pid, m.reason || 'left');
    });

    // heartbeat ping (host): keep lastSeen fresh even if player is idle
    net.on('ping', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (!pid) return;
      const p = G.state.players && G.state.players[pid];
      if (p) p.lastSeen = now();
    });

    // inputs (host)
    net.on('input', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (!pid) return;
      const p = G.state.players && G.state.players[pid];
      if (p) p.lastSeen = now();
      G.host.inputs.set(pid, { mvx: clamp(m.mvx || 0, -1, 1), mvy: clamp(m.mvy || 0, -1, 1), at: now() });
    });

    net.on('emote', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      const p = G.state.players[pid];
      if (!p || !p.alive) return;
      const kind = (m.kind === 'cry' || m.kind === 'tsk') ? m.kind : null;
      if (!kind) return;
      p.emoteKind = kind;
      p.emoteUntil = now() + (kind === 'cry' ? 1800 : 900);
      broadcastState();
    });

    net.on('act', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (!pid) return;
      if (m.kind === 'interact') hostHandleInteract(pid);
      if (m.kind === 'kill') hostHandleKill(pid);
      if (m.kind === 'sabotage') hostHandleSabotage(pid);
      if (m.kind === 'forceMission') hostHandleForceMission(pid);
    });
    net.on('openMission', (m) => {
      if (!net.isHost) return;
      const st = G.state;
      const pid = Number(m.playerId || 0);
      const p = st.players[pid];
      if (!p || !p.alive || p.down) return;
      const obj = st.objects[m.siteId];
      if (!obj || obj.type !== 'mission') return;
      const ox = (obj.x + 0.5) * TS;
      const oy = (obj.y + 0.5) * TS;
      if (dist2(p.x, p.y, ox, oy) > MISSION_INTERACT_RANGE ** 2) return;

      // reuse the same logic as interact-mission block
      if (now() < G.host.missionDisabledUntil) {
        sendToPlayer(pid, { t: 'toast', text: '지금은 미션을 풀 수 없어!' });
        return;
      }
      const mm = st.missions[obj.id];
      if (!mm || mm.state === 'solved') {
        sendToPlayer(pid, { t: 'toast', text: '이미 당근으로 막았어!' });
        return;
      }
      // In real game (4+), missions are always treated as real missions (not practice).
      // In practice mode, every mission is treated as practice regardless of activation state.
      if (!st.practice && mm.state === 'idle') {
        mm.state = 'active';
        mm.expiresAt = now() + 60_000;
        mm.activatedAt = now();
        if (mm.sealedAt) mm.sealedAt = 0;
      }
      const practice = !!st.practice;
      const ui = buildMissionUI(obj.id, mm.kind, practice);
      let prog = hostGetMissionProg(pid, obj.id);
      if (!prog || prog.practice !== !!practice) {
        hostInitMissionProg(pid, obj.id, mm.kind, practice);
        prog = hostGetMissionProg(pid, obj.id);
      }

      // Mission-in-progress % marker
      p.missionSiteId = obj.id;
      p.missionStage = clamp((prog?.correct || 0) + 1, 1, 3);
      p.missionClearAt = 0;
      broadcastState(true);
      sendToPlayer(pid, { t: 'uiMissionOpen', ...ui, correct: prog?.correct || 0 });
    });


    net.on('missionSubmit', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (!pid) return;
      hostMissionSubmit(pid, { ...m, playerId: pid });
    });

    net.on('missionClose', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (!pid) return;
      const st = G.state;
      const p = st.players[pid];
      if (!p) return;
      // If a player closes the mission UI mid-run, treat it as a reset so the
      // next open starts from 0/3 ("한 번에 문제 3개" 규칙).
      const siteId = m.siteId;
      const mm = siteId ? st.missions[siteId] : null;
      if (mm && mm.kind) {
        hostInitMissionProg(pid, siteId, mm.kind, !!st.practice);
      }
      // clear mission marker
      p.missionSiteId = null;
      p.missionStage = 0;
      p.missionClearAt = 0;
      broadcastState(true);
    });

    net.on('vote', (m) => {
      if (!net.isHost) return;
      const pid = Number(m.playerId || 0);
      if (!pid) return;
      hostSubmitVote(pid, m.target);
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

      // Apply authoritative state; for my own player (non-host), keep locally predicted
      // position but store the host position as a soft correction target.
      const incomingPlayers = m.players || {};
      const myPid = (!net.isHost && net.myPlayerId) ? String(net.myPlayerId) : null;
      if (myPid && G.state.players && G.state.players[myPid]) {
        const prev = G.state.players[myPid];
        const inc = incomingPlayers[myPid];
        if (inc) {
          const dx = (inc.x || 0) - (prev.x || 0);
          const dy = (inc.y || 0) - (prev.y || 0);
          const err = Math.hypot(dx, dy);
          const hard = (err > 64) || (!!inc.down !== !!prev.down) || (!!inc.alive !== !!prev.alive) || (!!inc.vent) || (!!prev.vent);

          // copy authoritative fields but keep predicted position unless we must hard snap
          for (const [k, v] of Object.entries(inc)) {
            if (k === 'x' || k === 'y' || k === 'vx' || k === 'vy') continue;
            prev[k] = v;
          }

          prev._authX = (inc.x || 0);
          prev._authY = (inc.y || 0);
          prev._authAt = now();

          if (hard) {
            prev.x = inc.x;
            prev.y = inc.y;
            prev.vx = inc.vx || 0;
            prev.vy = inc.vy || 0;
          }

          incomingPlayers[myPid] = prev;
        } else {
          // snapshot missed me: keep previous local copy
          incomingPlayers[myPid] = prev;
        }
      }
      G.state.players = incomingPlayers;

      // If joinAck was missed, recover myPlayerId by matching clientId.
      if (!net.myPlayerId && m.players) {
        for (const [pid, pp] of Object.entries(m.players)) {
          if (pp && pp.clientId && String(pp.clientId) === String(net.clientId)) {
            net.myPlayerId = parseInt(pid, 10);
            break;
          }
        }
      }
      

      // Smooth remote players on clients so other players look less 'choppy'.
      try {
        if (!net.isHost) {
          if (!G.netSmooth) G.netSmooth = { players: new Map() };
          const sm = G.netSmooth.players;
          const tNow = now();
          const myId = Number(net.myPlayerId || 0);
          const playersObj = m.players || {};

          // prune missing players
          for (const pid of Array.from(sm.keys())) {
            if (!playersObj[String(pid)]) sm.delete(pid);
          }

          for (const [pidStr, pp] of Object.entries(playersObj)) {
            const pid = Number(pidStr || 0);
            if (!pid || pid === myId || !pp) continue;
            const ex = sm.get(pid);
            if (!ex) {
              sm.set(pid, { px: pp.x, py: pp.y, tx: pp.x, ty: pp.y, t0: tNow, down: !!pp.down, alive: !!pp.alive, vent: !!pp.vent });
              continue;
            }
            const a = clamp((tNow - ex.t0) / 180, 0, 1);
            const cx = ex.px + (ex.tx - ex.px) * a;
            const cy = ex.py + (ex.ty - ex.py) * a;
            const jump = (Math.hypot(pp.x - cx, pp.y - cy) > TS * 3) || (!!pp.vent) || (!!pp.down !== !!ex.down) || (!!pp.alive !== !!ex.alive);
            if (jump) {
              ex.px = pp.x; ex.py = pp.y; ex.tx = pp.x; ex.ty = pp.y; ex.t0 = tNow;
            } else {
              ex.px = cx; ex.py = cy; ex.tx = pp.x; ex.ty = pp.y; ex.t0 = tNow;
            }
            ex.down = !!pp.down;
            ex.alive = !!pp.alive;
            ex.vent = !!pp.vent;
          }
        }
      } catch (_) {}

      G.state.missions = m.missions;
      G.state.doors = m.doors;
      try{ rebuildDoorSolidSet(); }catch(_){ }
      G.state.waterBlocks = m.waterBlocks;
      G.state.lamps = m.lamps || {};
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
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      openMissionUI(m);
    });

    net.on('uiMissionResult', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      if (!G.ui.mission) return;
      renderQuestion(m.text);
    });

    net.on('uiMissionNext', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      if (!G.ui.mission) return;
      if (typeof m.correct === 'number') G.ui.mission.correct = m.correct;
      G.ui.mission.question = m.question;
      renderQuestion();
    });


    net.on('uiMissionExit', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      // Close mission immediately (used on wrong answer / mission complete)
      if (G.ui.mission) {
        if (!m.siteId || String(G.ui.mission.siteId) === String(m.siteId)) {
          closeMissionUI();
        }
      }
      if (m.toast) showToast(m.toast);
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

    
    net.on('lightNotice', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      G.ui.lightNoticeUntil = m.until || (now() + 1500);
      G.ui.lightNoticeText = m.text || '누군가 불을 껐어요.';
    });
net.on('uiMeetingOpen', (m) => {
      openMeetingUI(m.kind || 'emergency', m.reason || '회의!', m.endsAt || (now() + 20_000));
    });

    // Meeting chat packets (Among-Us style)
    net.on('meetingChat', (m) => {
      const mid = Number(m.meetingId || 0);
      // If we already have an active meeting id, ignore messages from other meetings
      if (G.ui.meetingChat?.id && mid && mid !== Number(G.ui.meetingChat.id)) return;

      const pid = Number(m.playerId || 0);
      const p = (G.state && G.state.players) ? G.state.players[pid] : null;
      const nick = String(m.nick || p?.nick || `#${pid}`).
        replace(/[\r\n\t]/g,' ').slice(0, 12);
      const color = (typeof m.color === 'number') ? m.color : (p?.color ?? 0);
      const text = sanitizeMeetingText(m.text || '');
      if (!text) return;

      const time = nowHHMM();
      G.ui.meetingChat.msgs.push({ pid, nick, color, text, time });
      if (G.ui.meetingChat.msgs.length > 140) G.ui.meetingChat.msgs.splice(0, 30);
      // Render if meeting UI is visible
      if (G.phase === 'meeting') renderMeetingChat();
    });

    net.on('uiScene', (m) => {
      closeMeetingUI();
      closeMissionUI();
      openScene(m);
    });

    net.on('toast', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      showToast(m.text || '');
    });

    net.on('uiRoleReveal', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      // role reveal is per-player; keep it deterministic even if state arrives slightly later.
      showRoleReveal(m.role, m.practice);
    });

    net.on('fx', (m) => {
      // 간단 파티클/연출 (상태 스냅샷에 넣지 않는 1회성 효과)
      if (m.kind === 'carrotPop') {
        G.fx.push({ kind: 'carrotPop', x: m.x, y: m.y, bornAt: m.bornAt || now() });
      } else if (m.kind === 'seal') {
        G.fx.push({ kind: 'seal', x: m.x, y: m.y, bornAt: m.bornAt || now() });
        playThunk();
        tryVibrate([70, 40, 90]);
      } else if (m.kind === 'vent') {
        G.fx.push({ kind: 'vent', from: m.from, to: m.to, bornAt: m.bornAt || now() });
      } else if (m.kind === 'doorClose') {
        // door close: dust + tiny camera shake (Among Us feel)
        G.fx.push({ kind: 'doorClose', x: m.x, y: m.y, bornAt: m.bornAt || now() });

        // shake only if it's near my view (so far-away doors don't shake the whole screen)
        let doShake = true;
        try {
          const me = G.state && G.net && G.state.players && G.state.players[G.net.myPlayerId];
          if (me && typeof m.x === 'number' && typeof m.y === 'number') {
            const ox = (m.x + 0.5) * TS;
            const oy = (m.y + 0.5) * TS;
            const dx = (me.x - ox);
            const dy = (me.y - oy);
            doShake = (dx*dx + dy*dy) <= (TS * 9) * (TS * 9);
          }
        } catch (_) {}

        if (doShake) {
          G.ui.shakeUntil = now() + 160;
          G.ui.shakeDur = 160;
          G.ui.shakeAmp = 2;
          playThunk();
          tryVibrate([25, 30, 25]);
        }
      }
    });

    // discovery
    await net.discoverHost();

    // host 초기화
    if (net.isHost) {
      hostInitFromMap();
      // 호스트 자신도 플레이어로 추가
      const pid = hostAddPlayer(nick, false, net.clientId);
      net.myPlayerId = pid;
      G.phase = 'lobby';
      setRolePill();
      setHUD();
      setLobbyStatus('대기실: 플레이어를 추가하고 시작하세요. (1명일 때 연습 모드)', null);
      broadcastState(true);
      applyPhaseUI();
    } else {
      // join 요청
      if (!net.joinToken) net.joinToken = randId();
      net.post({ t: 'join', nick, clientId: net.clientId, joinToken: net.joinToken });

      // If the first join packet is dropped (common when the iframe loads before the room
      // starts relaying packets), keep retrying until we get joinAck.
      try{
        if (!net._joinRetry){
          net._joinRetry = setInterval(()=>{
            try{
              if (!G.net || G.net !== net) { clearInterval(net._joinRetry); net._joinRetry = null; return; }
              if (net.isHost || net.myPlayerId) { clearInterval(net._joinRetry); net._joinRetry = null; return; }
              if (!net.joinToken) net.joinToken = randId();
              net.post({ t: 'join', nick, clientId: net.clientId, joinToken: net.joinToken, retry: true });
            }catch(_){ }
          }, 900);
        }
      }catch(_){ }
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
    // In embedded mode, let the parent decide practice/duel when available.
    const forced = (EMBED && typeof window.__EMBED_PRACTICE__ === 'boolean') ? window.__EMBED_PRACTICE__ : null;
    const practice = (forced !== null) ? forced : (n < 4);
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
    // Host is decided by the room (avoid multiple-host races when more players join).
    window.__EMBED_IS_HOST__ = !!init.isHost;
    // Parent can precompute whether this should be practice.
    if (typeof init.practice === 'boolean') window.__EMBED_PRACTICE__ = init.practice;

    try{ nickEl.value = String(init.nick || nickEl.value || '토끼').slice(0,10); }catch(_){ }
    try{ roomEl.value = String(init.roomCode || roomEl.value || '1234').slice(0,64); }catch(_){ }

    // hide local lobby controls (room UI is handled by parent)
    try{ joinBtn.style.display = 'none'; }catch(_){ }
    try{ addBotBtn.style.display = 'none'; }catch(_){ }
    // keep startBtn for programmatic click

    await joinRoom();

    // Embedded UX: never show the internal lobby overlay. The parent already has it.
    try{ G.ui.embedJoined = true; }catch(_){ }
    try{ lobby?.classList.add('hidden'); }catch(_){ }
    try{ if (hud) hud.style.display = 'flex'; }catch(_){ }

    // host: start immediately (practice if <4, duel if >=4). This matches the parent room's UX.
    if (window.__EMBED_IS_HOST__){
      setTimeout(()=>{ try{ startBtn.click(); }catch(_){ } }, 180);
    } else {
      try{ showToast('호스트가 게임을 시작하는 중...'); }catch(_){ }
    }
  }

  if (EMBED){
    // Tell parent we're ready for bridge_init
    bridgeSend('bridge_ready', {});

    // bridge_init가 listener보다 먼저 도착하는 레이스를 방지하기 위해
    // index.html에서 window.__PENDING_BRIDGE_INIT__에 버퍼링해둘 수 있다.
    try{
      const pending = window.__PENDING_BRIDGE_INIT__;
      if (pending && typeof pending === 'object' && pending.type === 'bridge_init'){
        window.__PENDING_BRIDGE_INIT__ = null;
        startEmbedded(pending).catch((e)=>{
          try{ console.error(e); }catch(_){ }
          try{ setLobbyStatus('임베드 연결 실패...','danger'); }catch(_){ }
        });
      }
    }catch(_){ }

    window.addEventListener('message', (ev)=>{
      const d = ev.data || {};
      if (!d || typeof d !== 'object') return;
      // Parent -> iframe: leaving the embedded game view (go back to room)
      if (d.type === 'bridge_leave') {
        try {
          if (G.net) {
            const pid = Number(G.net.myPlayerId || 0);
            if (pid) G.net.post({ t: 'leave', playerId: pid, reason: (d.reason || 'leave') });
            // stop background simulation
            try{ stopHeartbeat(); }catch(_){ }
            try{ G.net.close && G.net.close(); }catch(_){ }
            G.net = null;
          }
        } catch (_) {}
        return;
      }
      if (d.type === 'bridge_init'){
        startEmbedded(d).catch((e)=>{
          try{ console.error(e); }catch(_){ }
          try{ setLobbyStatus('임베드 연결 실패...','danger'); }catch(_){ }
        });
      }
    });
  }

    // Best-effort: if the iframe is being unloaded/hidden, notify host to remove this player.
    const _sendLeave = (why)=>{
      try{
        if (!G.net) return;
        const pid = Number(G.net.myPlayerId || 0);
        if (!pid) return;
        G.net.post({ t: 'leave', playerId: pid, reason: why || 'unload' });
      }catch(_){ }
    };
    window.addEventListener('pagehide', ()=>{ try{ _sendLeave('pagehide'); }catch(_){} try{ stopHeartbeat(); }catch(_){} });
    window.addEventListener('beforeunload', ()=>{ try{ _sendLeave('unload'); }catch(_){} try{ stopHeartbeat(); }catch(_){} });


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
      setLobbyStatus('에셋을 불러오지 못했어. 새로고침하거나 잠시 후 다시 시도해줘!', 'danger');
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
