/* 학생토끼 v0.1
   로컬 멀티(같은 브라우저 탭/창): BroadcastChannel
   - 4~8명 (테스트용 봇 추가 가능)
   - 선생토끼(술래) 1명
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
  // In embed mode, request an authoritative snapshot from the host.
  // This prevents "stuck loading" / missing avatars when early broadcasts are lost during iframe boot.
  function requestHostSync(reason){
    try{
      if (!EMBED) return;
      const net = G && G.net;
      if (!net || net.isHost) return;
      if (!net.joinToken) net.joinToken = randId();
      net.post({ t:'syncReq', reason: reason || 'boot', joinToken: net.joinToken, at: Date.now() });
    }catch(_){ }
  }
  function stopHostSyncRetry(net){
    try{
      net = net || (G && G.net);
      if (net && net._syncRetry){ clearInterval(net._syncRetry); net._syncRetry = null; }
    }catch(_){ }
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
  // Boot loading overlay (index.html). In embed mode, this prevents black/flicker frames while
  // assets/join/start are still pending.
  const bootLoading = document.getElementById('bootLoading');
  const bootLoadingText = document.getElementById('bootLoadingText');
  function bootShow(msg){
    try{
      // User request: never block the game with a full-screen loading overlay.
      // Even if assets/join are slow, keep rendering on the canvas and/or show lobby UI.
      if (EMBED) { bootHide(); return; }
      if (!bootLoading) return;
      bootLoading.classList.remove('hidden');
      if (bootLoadingText && msg != null) bootLoadingText.textContent = String(msg);
    }catch(_){ }
  }
  function bootHide(){
    try{ if (bootLoading) bootLoading.classList.add('hidden'); }catch(_){ }
  }

  // Default behavior: always hide the HTML boot overlay.
  // (We still show loading/title art on the canvas when needed.)
  try{ bootHide(); }catch(_){ }
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
  const rulesModal = document.getElementById('rulesModal');
  const closeRules = document.getElementById('closeRules');
  const lobbyStatus = document.getElementById('lobbyStatus');
  const roster = document.getElementById('roster');
  const rosterMeta = document.getElementById('rosterMeta');
  const rosterList = document.getElementById('rosterList');

  const rightHud = document.getElementById('rightHud');
  const roomPill = document.getElementById('roomPill');
  const roomText = document.getElementById('roomText');

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

  // ---------- Pixel-sprite tinting (for special pose sheets) ----------
  // We keep this very lightweight: create a tinted offscreen canvas per (sheetKey,colorIdx).
  // This is used for one-off pose sheets like "teacher_kill0" and "student_cry" so
  // the outfit color matches the player's color selection.
  function getTintedSheet(sheetKey, colorIdx) {
    const img = AS.pixel?.[sheetKey];
    if (!img) return null;
    if (!AS._tintCache) AS._tintCache = {};
    const k = sheetKey + ':' + String(colorIdx|0);
    if (AS._tintCache[k]) return AS._tintCache[k];

    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    // base
    g.clearRect(0,0,c.width,c.height);
    g.drawImage(img,0,0);
    // tint (multiply keeps shading). We intentionally keep alpha < 1 so skin/hair aren't fully recolored.
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.78;
    g.fillStyle = colorHex(colorIdx);
    g.fillRect(0,0,c.width,c.height);
    g.globalCompositeOperation = 'destination-in';
    g.globalAlpha = 1;
    g.drawImage(img,0,0);
    g.globalCompositeOperation = 'source-over';
    AS._tintCache[k] = c;
    return c;
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

  async function leaveRoom(reason) {
    if (EMBED){
      // In multiroom iframe: return to room UI (parent page controls room phase)
      try{ bridgeSend("sk_quit", { reason: reason || '' }); }catch(_){ }
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

  function hostExitAll() {
    // Host-confirmed exit: end the match for everyone and go back to the room after 1.5s.
    try { showCenterNotice('호스트 이탈로 게임이 종료되었습니다.', 1500); } catch (_) {}
    try { if (G.net && G.net.isHost) broadcast({ t: 'hostExit', reason: 'host_exit', at: now() }); } catch (_) {}
    setTimeout(() => { try { leaveRoom('host_exit'); } catch (_) {} }, 1500);
  }

  // When the match ends (winner decided), automatically return everyone back to the room.
  // This keeps the multiroom UX consistent with Together-style games.
  function scheduleMatchEndReturn() {
    if (!EMBED) return;
    if (!G.ui) G.ui = {};
    if (G.ui._matchEndReturnScheduled) return;
    G.ui._matchEndReturnScheduled = true;
    try { showCenterNotice('게임이 종료되었습니다. 잠시 후 방으로 돌아갑니다.', 1600); } catch (_) {}
    // Tell all clients to quit (they handle hostExit by calling leaveRoom).
    try { if (G.net && G.net.isHost) broadcast({ t: 'hostExit', reason: 'match_end', at: now() }); } catch (_) {}
    setTimeout(() => { try { leaveRoom('match_end'); } catch (_) {} }, 1700);
  }

  function tryHostLeave() {
    const t = now();
    if (!G.ui) G.ui = {};
    const armedAt = G.ui._hostLeaveArmedAt || 0;
    const within = (armedAt && (t - armedAt) < 4500);
    if (!within) {
      G.ui._hostLeaveArmedAt = t;
      try { showCenterNotice('당신이 호스트입니다. 게임이 종료될 때 까지 나가면 안됩니다', 2500); } catch (_) {}
      return;
    }
    // second press
    hostExitAll();
  }

  exitBtn.addEventListener('click', () => {
    // If host tries to leave mid-game, require a second press and end the match for everyone.
    try {
      if (G.net && G.net.isHost && G.phase !== 'lobby') { tryHostLeave(); return; }
    } catch (_) {}
    leaveRoom();
  });

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
      // Embedded: keep the in-iframe lobby visible until the match actually starts,
      // so the host can always press Start if auto-start fails for any reason.
      const started = !!(G.state && G.state.started) || !!(G.host && G.host.started);
      if (started || inGame) {
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

    updateRosterUI();
  }

  // ---------- Rules/Map modal ----------
  function openRulesUI() { rulesModal?.classList.add('show'); }
  function closeRulesUI() { rulesModal?.classList.remove('show'); }

  rulesBtn?.addEventListener('click', () => openRulesUI());
  closeRules?.addEventListener('click', () => closeRulesUI());
  rulesModal?.addEventListener('click', (e) => { if (e.target === rulesModal) closeRulesUI(); });


  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape') { closeRulesUI(); }
  });

  // ---------- Phase helpers ----------
  // Embed relays can occasionally drop the phase/state packet right at match start.
  // If the match has started but the local phase still reads 'lobby', treat it as
  // 'play' for movement/input gating so players can move immediately.
  function effectivePhase(){
    try{
      if (G && G.phase === 'lobby' && G.state && G.state.started) return 'play';
    }catch(_){ }
    return (G && G.phase) ? G.phase : 'lobby';
  }
  function inPlay(){ return effectivePhase() === 'play'; }

  // ---------- Identity helpers (embed/network robustness) ----------
  // In embed mode, some clients may fail to receive joinAck and therefore
  // don't know their playerId yet. However, they still have a stable joinToken.
  // We accept joinToken/clientId-based routing on the host so movement/input
  // works immediately even before the client binds a numeric playerId.
  function resolvePlayerIdFromMsg(m){
    try{
      const pid = Number(m && m.playerId || 0);
      if (pid) return pid;
      // joinToken -> playerId (strongest)
      const jt = (m && m.joinToken != null) ? String(m.joinToken) : '';
      if (jt && G.host && G.host._joinTokenToPlayer && G.host._joinTokenToPlayer.has(jt)) {
        return Number(G.host._joinTokenToPlayer.get(jt) || 0);
      }
      // embed sessionId -> playerId (stable per browser tab, unlike joinAck which can be dropped)
      const sid = (m && m.sessionId != null) ? String(m.sessionId) : '';
      if (sid && G.host && G.host._sidToPlayer && G.host._sidToPlayer.has(sid)) {
        return Number(G.host._sidToPlayer.get(sid) || 0);
      }
      // clientId/cid -> playerId
      const cid = (m && (m.cid != null || m.from != null)) ? String(m.cid ?? m.from) : '';
      if (cid && G.host && G.host._clientToPlayer && G.host._clientToPlayer.has(cid)) {
        return Number(G.host._clientToPlayer.get(cid) || 0);
      }
    }catch(_){ }
    return 0;
  }

  // ---------- Host-side input routing (movement) ----------
  // Movement is host-authoritative. Guests send only an intent (mvx/mvy),
  // and the host applies it to the right player.
  //
  // In embed mode, numeric playerId can temporarily be 0 (joinAck missed),
  // and some relays rewrite/strip routing fields. To make movement robust,
  // we additionally keep an input map keyed by the player's joinToken.
  // The host applies input using this key first, then falls back to playerId.
  function hostRecordMoveIntent(msg){
    try{
      if (!G || !G.net || !G.net.isHost) return;
      if (!G.host) G.host = {};
      if (!G.host.inputs) G.host.inputs = new Map();
      if (!G.host._moveByToken) G.host._moveByToken = new Map();
      if (!G.host._clientReportedState) G.host._clientReportedState = new Map();

      // Ensure we keep the strongest routing map up-to-date.
      // Some room relays can drop joinToken on the initial join packet,
      // but still forward it on later input packets. If that happens, movement
      // looks like "rubber-banding" because the host never binds the token to the player.
      if (!G.host._joinTokenToPlayer) G.host._joinTokenToPlayer = new Map();

      const pid = resolvePlayerIdFromMsg(msg);
      const mvx = clamp(msg.mvx || 0, -1, 1);
      const mvy = clamp(msg.mvy || 0, -1, 1);
      const at = now();

      // Opportunistically bind joinToken -> pid when possible.
      // This fixes cases where join/joinAck/state binding was delayed or stripped,
      // but input packets still carry joinToken.
      try{
        const jtRaw = (msg && msg.joinToken != null) ? String(msg.joinToken) : '';
        if (pid && jtRaw) {
          const p = G.state && G.state.players && G.state.players[pid];
          if (p && (!p.joinToken || String(p.joinToken) !== jtRaw)) {
            p.joinToken = jtRaw;
          }
          G.host._joinTokenToPlayer.set(jtRaw, pid);
        }
      }catch(_){ }

      // Primary key: joinToken (per-iframe unique)
      let key = (msg && msg.joinToken != null) ? String(msg.joinToken) : '';
      if (!key && pid) {
        const p = G.state && G.state.players && G.state.players[pid];
        if (p && p.joinToken) key = String(p.joinToken);
      }
      // Fallback: embed sessionId (stable per tab / relay)
      if (!key) {
        const sid = (msg && msg.sessionId != null) ? String(msg.sessionId) : '';
        if (sid) key = `sid:${sid}`;
      }
      // Fallback: cid/from (still stable per iframe)
      if (!key) {
        const cid = (msg && (msg.cid != null || msg.from != null)) ? String(msg.cid ?? msg.from) : '';
        if (cid) key = `cid:${cid}`;
      }

      if (pid) {
        const p = G.state.players && G.state.players[pid];
        if (p) p.lastSeen = at;
        const tNow = now();
        const isRoamingGhostHost = !!(p && p.down && p.role !== 'teacher' && !G.state.practice);
        const forced = !!(p && !isRoamingGhostHost && ((Number(p.forcePosUntil || 0) > tNow) || (Number(p.ignoreClientStateUntil || 0) > tNow)));
        const ventLocked = !!(p && !isRoamingGhostHost && ((p.vent && typeof p.vent === 'object') || (Number(p.ventLockUntil || 0) > tNow) || forced));
        if (key) G.host._moveByToken.set(key, ventLocked ? { mvx: 0, mvy: 0, at: tNow } : { mvx, mvy, at });
        G.host.inputs.set(pid, ventLocked ? { mvx: 0, mvy: 0, at: tNow } : { mvx, mvy, at });
        try{
          const hasPose = Number.isFinite(Number(msg && msg.px)) && Number.isFinite(Number(msg && msg.py));
          // 유령은 ventLocked 무관하게 위치를 항상 수락
          if (hasPose && (!ventLocked || isRoamingGhostHost)) {
            const prevRep = G.host._clientReportedState.get(pid);
            const nextSeq = Number.isFinite(Number(msg && msg.seq)) ? Number(msg.seq) : null;
            const nextSentAt = Number.isFinite(Number(msg && msg.sentAt)) ? Number(msg.sentAt) : null;
            const prevSeq = prevRep && Number.isFinite(Number(prevRep.seq)) ? Number(prevRep.seq) : null;
            const prevSentAt = prevRep && Number.isFinite(Number(prevRep.sentAt)) ? Number(prevRep.sentAt) : null;
            const staleBySeq = (nextSeq != null && prevSeq != null && nextSeq <= prevSeq);
            const staleByTime = (nextSeq == null && nextSentAt != null && prevSentAt != null && nextSentAt < prevSentAt - 1);
            if (!staleBySeq && !staleByTime) {
              G.host._clientReportedState.set(pid, {
                x: Number(msg.px), y: Number(msg.py),
                vx: Number(msg.pvx || 0), vy: Number(msg.pvy || 0),
                dir: Number.isFinite(Number(msg && msg.dir)) ? Number(msg.dir) : null,
                facing: Number.isFinite(Number(msg && msg.facing)) ? Number(msg.facing) : null,
                seq: nextSeq,
                sentAt: nextSentAt,
                at
              });
            }
          }
        }catch(_){ }
      } else if (key) {
        G.host._moveByToken.set(key, { mvx, mvy, at });
      }
    }catch(_){ }
  }

  // ---------- Assets ----------
  const AS = {
    loadingImg: null,
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
    // Kick off the loading/title image as early as possible so the first paint isn't black.
    const _pLoadingImg = loadImage('assets/mathrabbitloading.png');

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

    // Await after JSON so it can download in parallel.
    AS.loadingImg = await _pLoadingImg;

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
      // Ejected student crying pose (single frame)
      ['student_cry_sheet', 'assets/pixel/student_cry_sheet.png'],
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
  const LAMP_INTERACT_RANGE = 104;
  const LAMP_CLICK_RANGE = TS * 1.35;
  // Missions should require getting a bit closer than doors/meeting.
  const MISSION_INTERACT_RANGE = 72;

  function getLampInteractPoint(obj) {
    return { x: (obj.x + 0.5) * TS, y: (obj.y + 0.72) * TS };
  }

  function getObjInteractPoint(obj) {
    if (obj && obj.type === 'lamp') return getLampInteractPoint(obj);
    if (obj && obj.type === 'mission') return { x: (obj.x + 0.5) * TS, y: (obj.y + 0.88) * TS };
    return { x: (obj.x + 0.5) * TS, y: (obj.y + 0.5) * TS };
  }

  function getObjInteractRange(obj) {
    if (!obj) return INTERACT_RANGE;
    if (obj.type === 'mission') return MISSION_INTERACT_RANGE;
    if (obj.type === 'lamp') return 84;
    if (obj.type === 'vent_hole') return 72;
    return INTERACT_RANGE;
  }
  const VENT_TRAVEL_MS = 850;
  const VENT_COOLDOWN_MS = 5000;
  const VENT_SETTLE_MS = 900;
  const VENT_INPUT_LOCK_MS = 900;
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

  function canWalkTile(tx, ty) {
    const W = AS.map?.width | 0;
    const H = AS.map?.height | 0;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    if (!solid) return true;
    return !solid[ty * W + tx];
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

    // Admin: meeting-like table + lamp + small crystal
    {
      const rr = roomRect('admin');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('diamond_table', rx + Math.floor(rw / 2), ry + Math.floor(rh / 2), 64, 64, true);
        add('rock_diamond_decor', rx + 3, ry + 3, 32, 32, true);
        add('street_lamp', rx + rw - 4, ry + 3, 64, 64, true);
      }
    }

    // Security: monitors vibe (lamps + rocks)
    {
      const rr = roomRect('security');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('floor_lamp', rx + rw - 3, ry + 2, 32, 32, true);
        add('rock_1', rx + Math.floor(rw / 2), ry + 3, 64, 64, true);
        add('rock_2', rx + 3, ry + 3, 64, 64, true);
      }
    }

    // Lab(공부방): mission stays lower-left but lifted off the wall, with extra tables.
    {
      const rr = roomRect('lab');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('diamond_table', rx + 4, ry + 3, 64, 64, true);
        add('diamond_table', rx + 8, ry + 4, 64, 64, true);
        add('diamond_table', rx + 6, ry + 5, 64, 64, true);
        add('round_table', rx + 8, ry + rh - 4, 64, 64, true);
        add('round_table', rx + 10, ry + rh - 5, 64, 64, true);
        // moved from 취미방 좌하단
        add('floor_lamp', rx + rw - 3, ry + 2, 32, 32, true);
      }
    }

    // Reactor(뿌리방): now holds the moved central mission, so keep the corner open but populated.
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

    // 중앙광장: open plaza with clutter moved toward the edges.
    {
      const rr = roomRect('rootworks');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('diamond_table', rx + 6, ry + 4, 64, 64, true);
        add('rock_2', rx + rw - 7, ry + 4, 64, 64, true);
        add('rock_1', rx + Math.floor(rw/2), ry + Math.floor(rh/2), 64, 64, true);
        add('round_table', rx + 5, ry + rh - 4, 64, 64, true);
        add('round_table', rx + rw - 8, ry + rh - 5, 64, 64, true);
        add('diamond_table', rx + Math.floor(rw/2) - 4, ry + 3, 64, 64, true);
        add('rock_diamond_decor', rx + 4, ry + 6, 32, 32, true);
        add('rock_diamond_decor', rx + rw - 5, ry + Math.floor(rh/2), 32, 32, true);
        add('rock_2', rx + Math.floor(rw/2) + 4, ry + rh - 4, 64, 64, true);
        // moved from 저장고 mission-side lamp
        add('street_lamp', rx + rw - 3, ry + 2, 64, 64, true);
      }
    }

    // Mushroom grove: denser rock placement.
    {
      const rr = roomRect('mushroom');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('rock_1', rx + 5, ry + 8, 64, 64, true);
        add('rock_2', rx + rw - 7, ry + 6, 64, 64, true);
        add('rock_1', rx + 7, ry + rh - 6, 64, 64, true);
        add('rock_2', rx + rw - 8, ry + rh - 7, 64, 64, true);
        add('rock_1', rx + 11, ry + 5, 64, 64, true);
        add('rock_2', rx + rw - 12, ry + 11, 64, 64, true);
        add('rock_1', rx + 11, ry + Math.floor(rh/2), 64, 64, true);
        add('rock_2', rx + rw - 12, ry + Math.floor(rh/2) + 3, 64, 64, true);
        add('rock_diamond_decor', rx + Math.floor(rw / 2) - 2, ry + 8, 32, 32, true);
        add('rock_diamond_decor', rx + Math.floor(rw / 2) + 3, ry + rh - 8, 32, 32, true);
        add('rock_diamond_decor', rx + 6, ry + 14, 32, 32, true);
        add('rock_diamond_decor', rx + rw - 7, ry + rh - 11, 32, 32, true);
        add('street_lamp', rx + rw - 5, ry + 3, 64, 64, true);
      }
    }

    // Med nook / Storage: smaller props
    {
      const rr = roomRect('med');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        add('rock_diamond_decor', rx + rw - 4, ry + rh - 4, 32, 32, true);
        add('round_table', rx + Math.floor(rw/2), ry + Math.floor(rh/2), 64, 64, true);
      }
    }
    {
      const rr = roomRect('storage');
      if (rr) {
        const [rx, ry, rw, rh] = rr;
        // 확장창고: keep rocks and one normal-sized lamp in an empty corner.
        add('rock_1', rx + Math.floor(rw / 2), ry + Math.floor(rh / 2), 64, 64, true);
        add('rock_2', rx + 3, ry + 3, 64, 64, true);
        add('rock_2', rx + rw - 4, ry + rh - 4, 64, 64, true);
        add('floor_lamp', rx + 2, ry + 2, 32, 32, true);
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
        if (msg.cid) this.peers.set(String(msg.cid), tNow);
        if (msg.t === 'hello') {
          // peer discovery
          if (msg.from) this.peers.set(String(msg.from), tNow);
        if (msg.cid) this.peers.set(String(msg.cid), tNow);
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
      // Some relays may rewrite/strip `from`; keep a dedicated stable client id.
      msg.cid = this.clientId;
      this.bc.postMessage(msg);
    }

    _sendHello() {
      try {
        this.post({ t: 'hello', at: Date.now(), hostId: this.hostId || null });
        if (this.isHost) {
          try{ this.post({ t: 'host', hostId: this.hostId, at: Date.now() }); }catch(_){ }
        }
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
      await new Promise(r => setTimeout(r, 1100));
      this._electHost();
      await new Promise(r => setTimeout(r, 350));
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
        let msg = ev.data;
        if (typeof msg === 'string'){
          try{ msg = JSON.parse(msg); }catch(_){ return; }
        }
        if (!msg || typeof msg !== 'object') return;
        if (!msg || (msg.room && msg.room !== this.room)) return;
        const tNow = Date.now();
        if (msg.from) this.peers.set(String(msg.from), tNow);
        if (msg.cid) this.peers.set(String(msg.cid), tNow);
        if (msg.t === 'hello') {
          if (msg.from) this.peers.set(String(msg.from), tNow);
        if (msg.cid) this.peers.set(String(msg.cid), tNow);
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
      // Stable per-client id for robust routing/rebinding.
      msg.cid = this.clientId;
      try { this.ws.send(JSON.stringify(msg)); } catch (_) {}
    }

    _sendHello() {
      if (!this.ws || this.ws.readyState !== 1) return;
      this.post({ t: 'hello', at: Date.now(), hostId: this.hostId || null });
        if (this.isHost) {
          try{ this.post({ t: 'host', hostId: this.hostId, at: Date.now() }); }catch(_){ }
        }
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
	      // IMPORTANT (embed): multiple iframes can share the same sessionId.
	      // Use a per-iframe unique clientId for routing, and keep the provided
	      // sessionId only as a non-routing tag.
	      this.sessionId = String(sessionId || '');
	      this.clientId = randId();
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
	  // Stable per-iframe id for robust routing even if `from` is rewritten.
	  msg.cid = this.clientId;
	      if (this.sessionId) msg.sessionId = this.sessionId;
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
    // Lifecycle flag: clients use this to decide whether to show the loading/title screen.
    // Always reset it on initialization; hostStartGame() will set it back to true.
    st.started = false;
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
        const drawW = Math.max(12, Number(d.w || 0) || (key === 'floor_lamp' ? 16 : TS * 2));
        const drawH = Math.max(12, Number(d.h || 0) || (key === 'floor_lamp' ? 16 : TS * 2));
        st.objects[lid] = {
          id: lid,
          type: 'lamp',
          kind: key,
          x: d.tx | 0,
          y: d.ty | 0,
          roomId: d.roomId || null,
          drawW,
          drawH,
          solidBlock: (key === 'floor_lamp'),
          blockRadius: (key === 'floor_lamp') ? Math.max(8, Math.min(drawW, drawH) * 0.35) : 0,
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
    // Spread more aggressively (helps 4~8 players not overlap and appear "missing").
    const offsets = [
      [0,0],
      [1,0],[-1,0],[0,1],[0,-1],
      [1,1],[-1,1],[1,-1],[-1,-1],
      [2,0],[-2,0],[0,2],[0,-2],
      [2,1],[2,-1],[-2,1],[-2,-1],
      [1,2],[-1,2],[1,-2],[-1,-2],
      [3,0],[-3,0],[0,3],[0,-3],
      [3,1],[3,-1],[-3,1],[-3,-1],
      [1,3],[-1,3],[1,-3],[-1,-3],
      [2,2],[-2,2],[2,-2],[-2,-2],
      [4,0],[-4,0],[0,4],[0,-4],
    ];
    const isWalk = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (!solid) return true;
      return !solid[ty * W + tx];
    };

    
    let chosenTx = baseTx, chosenTy = baseTy;
    const minD2 = (TS * 0.85) * (TS * 0.85);
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
	      // In embed mode, the parent room provides a stable Colyseus sessionId.
	      // We store it to make host-side input routing resilient even when joinAck is dropped.
	      sessionId: null,
      joinToken: null,
      isBot: !!isBot,

      role: 'crew',
      // Visual identity: 8 unique variants (clothes + hair accent)
      color: (id - 1) % 8,
      alive: true,
      down: false,
      bodyX: null,
      bodyY: null,

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
      forceCdUntil: 0,
      ventLockUntil: 0,
      forcePosUntil: 0,
      forcePosX: 0,
      forcePosY: 0,
      ignoreClientStateUntil: 0,

      // mission-in-progress indicator (33/66/100)
      missionSiteId: null,
      missionStage: 0,
      missionClearAt: 0,

      // connection (host heartbeat)
      lastSeen: now(),
    };

    // Maintain lookup maps for robust routing (joinToken/clientId -> playerId)
    try{
      if (!G.host._clientToPlayer) G.host._clientToPlayer = new Map();
      if (clientId) G.host._clientToPlayer.set(String(clientId), id);
    }catch(_){ }

    return id;
  }

  function hostAssignTeacher() {
    const st = G.state;
    if (st.practice) {
      st.teacherId = null;
      for (const p of Object.values(st.players)) p.role = 'crew';
      return;
    }
    const aliveIds = Object.values(st.players)
      .filter(p => p && p.alive)
      .map(p => Number(p.id || 0))
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (aliveIds.length < 2) return;
    let idx = 0;
    try {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      idx = buf[0] % aliveIds.length;
    } catch (_) {
      idx = Math.floor(Math.random() * aliveIds.length);
    }
    const tid = aliveIds[idx];
    st.teacherId = tid;
    for (const p of Object.values(st.players)) p.role = (Number(p.id || 0) === tid) ? 'teacher' : 'crew';
  }

  function hostStartGame(practice = false) {
    const st = G.state;
    hostInitFromMap();

    // In embed mode, decide practice based on the room's expected human count (from parent),
    // not only on the instantaneous join count (which can be temporarily low due to relay timing).
    try{
      if (window.__EMBED_MODE__) {
        const desired = (typeof window.__EMBED_PRACTICE__ === 'boolean') ? !!window.__EMBED_PRACTICE__ : !!practice;
        const nHum = Object.values(st.players || {}).filter(p=>p && !p.isBot).length;
        // Only start practice if the room is *actually* a practice room (<4 expected AND <4 currently).
        practice = !!(desired && nHum < 4);
      }
    }catch(_){ }

    // Ensure the initial lighting state is fully bright (all lamps on) at game start.
    // This prevents an occasional "slightly dark" look reported on some devices.
    try{
      for (const lid of Object.keys(st.lamps || {})){
        if (st.lamps[lid]) st.lamps[lid].on = true;
      }
    }catch(_){ }

    // Mark as started for both host-only logic and the replicated state (clients).
    G.host.started = true;
    st.started = true;
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
        : ((pp.role === 'teacher') ? '당신은 선생토끼야! (술래) 들키지 말고 빵점을 줘!' : '당신은 학생토끼야! 미션을 해결해서 시간을 늘려!');
      sendToPlayer(pp.id, { t: 'toast', text });

      // Among-Us style: big role reveal overlay (per player)
      sendToPlayer(pp.id, { t: 'uiRoleReveal', role: pp.role, practice });
    }

    // Push an immediate authoritative snapshot so clients drop the loading screen promptly.
    try{ broadcastRoster(true); }catch(_){ }
    try{ broadcastState(true); }catch(_){ }
    try{ broadcastPlayers(); }catch(_){ }
  }

  function hostRemovePlayer(playerId, reason = 'left') {
    const st = G.state;
    const pid = Number(playerId || 0);
    if (!pid || !st.players || !st.players[pid]) return;
    const p = st.players[pid];
    const nick = p.nick || ('#' + pid);
    const cid = (p.clientId != null) ? String(p.clientId) : null;
	    const jt = (p.joinToken != null) ? String(p.joinToken) : '';
	    const sid = (p.sessionId != null) ? String(p.sessionId) : '';

    // Remove from state
    delete st.players[pid];

    // Release any mission locks held by this player.
    try{
      for (const m of Object.values(st.missions || {})) {
        if (m && Number(m.inUseBy) === pid) { m.inUseBy = 0; m.inUseUntil = 0; }
      }
    }catch(_){ }

    // Cleanup host caches
    try{ G.host.inputs && G.host.inputs.delete(pid); }catch(_){ }
    try{ G.host.votes && G.host.votes.delete(pid); }catch(_){ }
    try{ if (G.host._clientToPlayer && cid) G.host._clientToPlayer.delete(cid); }catch(_){ }
	    try{ if (G.host._joinTokenToPlayer && jt) G.host._joinTokenToPlayer.delete(jt); }catch(_){ }
	    try{ if (G.host._sidToPlayer && sid) G.host._sidToPlayer.delete(sid); }catch(_){ }

    // Win rule: if the teacher leaves/disconnects, students win immediately.
    // (Ghost/down players are allowed to exist and do NOT affect win conditions.)
    if (!st.practice && Number(st.teacherId || 0) === pid) {
      st.teacherId = null;
      st.winner = 'crew';
      G.phase = 'end';
      broadcast({ t: 'toast', text: '선생토끼가 퇴장해서 학생토끼 승리!' });
      broadcastState(true);
      try { scheduleMatchEndReturn(); } catch (_) {}
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
    try{ broadcastRoster(true); }catch(_){ }

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
    if (m.inUseBy) m.inUseBy = 0;
    if (m.inUseUntil) m.inUseUntil = 0;

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
        y: obj.y + 0.15,
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
          if (ls && (now() - ls > 120000)) toKick.push(pid);
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
        try { broadcastState(true); } catch (_) {}
        try { scheduleMatchEndReturn(); } catch (_) {}
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
      G.host._nextMissionAt = now() + (6_000 + Math.random() * 3_500);
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

    // Mission concurrency lock timeout: if a player disappears mid-mission,
    // release the lock so others can use it.
    for (const m of Object.values(st.missions || {})) {
      if (m && m.inUseBy && now() >= (m.inUseUntil || 0)) { m.inUseBy = 0; m.inUseUntil = 0; }
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
      // Teacher is never a ghost. If the teacher is caught, the match ends immediately.
      if (p.down && p.role === 'teacher') continue;

      // During the teacher "0점" emote, freeze movement so the pose doesn't look broken
      // if we slow down the animation duration.
      if (p.emoteKind === 'kill0' && now() < (p.emoteUntil || 0)) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }

      // 땅굴(벤트) 이동 중이면 이동/킬/조작 불가 + 도착 처리
      // NOTE: vent 처리를 forcePosUntil보다 먼저 해야 한다.
      // 땅굴 도착 시 forcePosUntil을 목적지로 세팅하므로,
      // vent가 아직 진행 중일 때 forcePosUntil이 이전 위치로 snap하는 충돌을 방지.
      if (p.vent) {
        if (now() >= p.vent.end) {
          p.x = p.vent.toX;
          p.y = p.vent.toY;
          p.vx = 0;
          p.vy = 0;
          p.vent = null;
          // 도착 직후 forcePosUntil도 목적지로 동기화 (혹시 다른 값이 남아 있을 경우 대비)
          if (Number(p.forcePosUntil || 0) > now()) {
            p.forcePosX = p.x;
            p.forcePosY = p.y;
          }
        } else {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
      }
      const forcedPosNow = Number(p.forcePosUntil || 0) > now();
      if (forcedPosNow) {
        p.x = Number(p.forcePosX || p.x || 0);
        p.y = Number(p.forcePosY || p.y || 0);
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      if (p.forcePosUntil && now() >= Number(p.forcePosUntil || 0)) {
        p.forcePosUntil = 0;
      }
      const ventLockedNow = Number(p.ventLockUntil || 0) > now();
      if (ventLockedNow) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      // Non-host human players: trust the latest pose reported by that client.
      // This removes the host-side re-simulation / pull-back loop that caused visible rubber-banding.
      try{
        const rep = G.host && G.host._clientReportedState && G.host._clientReportedState.get(p.id);
        const repAge = rep ? (now() - Number(rep.at || 0)) : 1e9;
        // Treat remote human movement as client-driven for a longer window.
        // Falling back to host-side re-simulation after ~220ms caused the classic
        // "go a bit, then spring back" jitter whenever a packet was late.
        if (!p.isBot && p.id !== hostPid && rep) {
          let rx = Number(rep.x || 0);
          let ry = Number(rep.y || 0);
          if (repAge > 120 && repAge < 1800) {
            const dtRep = Math.min(0.65, Math.max(0, repAge / 1000));
            rx += Number(rep.vx || 0) * dtRep;
            ry += Number(rep.vy || 0) * dtRep;
          }
          if (repAge < 1800) {
            p.x = rx;
            p.y = ry;
            p.vx = Number(rep.vx || 0);
            p.vy = Number(rep.vy || 0);
            if (rep.dir != null) p.dir = rep.dir;
            if (rep.facing != null) p.facing = rep.facing;
            // Keep host-side render smoothing samples for remotes too.
            try{
              if (!G.remoteSmooth) G.remoteSmooth = { remotes: new Map(), bufferMs: 110, k: 16, snapDist: TS * 7 };
              const sm = G.remoteSmooth.remotes || (G.remoteSmooth.remotes = new Map());
              let ex = sm.get(p.id);
              const tNow = now();
              if (!ex) {
                ex = { rx: p.x, ry: p.y, samples: [{ t: tNow, x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0 }], alive: !!p.alive, down: !!p.down, vent: !!(p.vent || p.venting) };
                sm.set(p.id, ex);
              } else {
                ex.alive = !!p.alive; ex.down = !!p.down; ex.vent = !!(p.vent || p.venting);
                if (!ex.samples) ex.samples = [];
                ex.samples.push({ t: tNow, x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0 });
                if (ex.samples.length > 14) ex.samples.shift();
              }
            }catch(_){ }
            continue;
          }
          // If the stream is briefly late, hold the last client pose instead of falling back
          // to host-side re-simulation, which is what caused the visible pull-back.
          if (repAge < 2600) {
            p.vx = 0;
            p.vy = 0;
            continue;
          }
        }
      }catch(_){ }

      const frozen = now() < p.frozenUntil;

      // Prefer movement intent keyed by joinToken (more robust than numeric playerId in embed mode).
      // Fallback to the legacy playerId-keyed inputs map.
      let inpRec = G.host.inputs.get(p.id) || { mvx: 0, mvy: 0, at: 0 };
      try{
        const key = (p.joinToken != null && String(p.joinToken) !== '') ? String(p.joinToken)
          : ((p.sessionId != null && String(p.sessionId) !== '') ? `sid:${String(p.sessionId)}`
            : ((p.clientId != null && String(p.clientId) !== '') ? `cid:${String(p.clientId)}` : ''));
        if (key && G.host._moveByToken && G.host._moveByToken.has(key)) {
          const rec = G.host._moveByToken.get(key);
          if (rec && (!inpRec.at || (rec.at || 0) >= inpRec.at)) inpRec = rec;
        }
      }catch(_){ }
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
      // Ghosts move slightly faster (Among Us feel).
      if (p.down && p.role !== 'teacher' && !st.practice) spd *= 1.22;

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
        try { broadcastState(true); } catch (_) {}
        try { scheduleMatchEndReturn(); } catch (_) {}
        return;
      }

      if (!st.infiniteMissions && st.solved >= st.total) {
        st.winner = 'crew';
        G.phase = 'end';
        try { broadcastState(true); } catch (_) {}
        try { scheduleMatchEndReturn(); } catch (_) {}
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

    const crossTiles = clamp(corridorVertical ? spanX : spanY, 2, 5);
    return { corridorVertical, crossTiles };
  }

  // Build a stable span of offsets across the door opening (perpendicular to the
  // corridor axis). We derive this from *actual open tiles* around the door tile
  // so even-width corridors (2/4) don't leave a "gap" you can slip through.
  function doorSpanOffsetsAt(tx, ty, info) {
    const max = 4;
    const desired = clamp((info && (info.crossTiles|0)) || 3, 1, 5);
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

  // ---------- Door solid "invisible wall" ----------
// Closed doors create temporary solid tiles on BOTH sides of the opening.
// This guarantees you cannot pass room <-> corridor when a door is closed,
// even if edge-based checks miss due to large dt or diagonal movement.

function rebuildDoorSolidSet(force = false) {
  const st = G.state;
  if (!st) return;

  const objs = Object.values(st.objects || {});
  const doors = st.doors || {};

  // Build a cheap key of which doors are closed. If unchanged, skip the heavy rebuild.
  let key = '';
  for (const obj of objs) {
    if (!obj || obj.type !== 'root_door') continue;
    const d = doors[obj.id];
    if (d && d.closed) key += String(obj.id) + ';';
  }

  if (!force && G._doorSolidKey === key) return;
  G._doorSolidKey = key;

  if (!G._doorSolidSet) G._doorSolidSet = new Set();
  const set = G._doorSolidSet;
  set.clear();

  if (!key) return;

  for (const obj of objs) {
    if (!obj || obj.type !== 'root_door') continue;
    const d = doors[obj.id];
    if (!d || !d.closed) continue;

    const ox = obj.x | 0;
    const oy = obj.y | 0;

    const info = doorCrossInfoAt(ox, oy, obj);
    if (!info) { set.add(ox + "," + oy); continue; }
    const span = doorSpanOffsetsAt(ox, oy, info);

    for (let off = span.minOff; off <= span.maxOff; off++) {
      const cx = span.spanX ? (ox + off) : ox;
      const cy = span.spanX ? oy : (oy + off);
      set.add(cx + "," + cy);
    }
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

  function solidLampAtPixel(x, y) {
    const objs = G.state && G.state.objects ? Object.values(G.state.objects) : [];
    for (const obj of objs) {
      if (!obj || obj.type !== 'lamp' || !obj.solidBlock) continue;
      const cx = (obj.x + 0.5) * TS;
      const cy = (obj.y + 0.72) * TS;
      const r = Number(obj.blockRadius || 0);
      if (r <= 0) continue;
      if (dist2(x, y, cx, cy) <= r * r) return true;
    }
    return false;
  }

  function isSolidPixelFor(player, x, y) {
    const t = tileAtPixel(x, y);
    if (t.solid) return true;
    if (doorSolidAt(t.tx, t.ty)) return true;
    if (waterBlockSolidAt(t.tx, t.ty, player)) return true;
    if (solidLampAtPixel(x, y)) return true;
    return false;
  }

  
  function moveWithCollision(p, nx, ny) {
    // 유령(downed non-teacher): 벽/문 충돌은 일반과 동일하게 적용.
    // (이전에는 완전히 통과시켰으나, 요청에 따라 벽은 막음)
    // 맵 경계 클램프는 모든 플레이어에게 공통 적용.

    // axis-separated resolution (tile solids + closed-door invisible walls)
    let x = nx;
    let y = p.y;

    if (collidesCircle(p, x, y, PLAYER_R)) {
      x = p.x;
      p.vx = 0;
    }

    y = ny;
    if (collidesCircle(p, x, y, PLAYER_R)) {
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
    let bestPri = -Infinity;

    for (const obj of Object.values(st.objects)) {
      if (!['meeting_bell', 'mission', 'root_door', 'body_report', 'vent_hole', 'lamp'].includes(obj.type)) continue;
      if (obj.type === 'vent_hole' && player.role !== 'teacher') continue;
      if (obj.type === 'vent_hole' && G.state.practice) continue;
      if (obj.type === 'mission' && player.role === 'teacher' && !st.practice) continue;
      if (obj.type === 'meeting_bell' && player.role === 'teacher' && !st.practice) continue;
      if (obj.type === 'lamp') {
        const lp = st.lamps && st.lamps[obj.id];
        if (!lp) continue;
        if (player.role === 'teacher' && !lp.on) continue;
        if (player.role !== 'teacher' && lp.on) continue;
      }
      const pt = getObjInteractPoint(obj);
      const ox = pt.x;
      const oy = pt.y;
      const d2 = dist2(player.x, player.y, ox, oy);
      const range = getObjInteractRange(obj);
      if (d2 > range ** 2) continue;
      if (obj.type === 'meeting_bell' && Number(st.meetingBellCdUntil || 0) > now()) continue;

      let pri = 0;
      if (obj.type === 'vent_hole' && player.role === 'teacher') pri = 120;
      else if (obj.type === 'body_report') pri = 90;
      else if (obj.type === 'meeting_bell') pri = 80;
      else if (obj.type === 'root_door') pri = 30;
      else if (obj.type === 'lamp') pri = 20;
      else if (obj.type === 'mission') pri = 10;

      if (pri > bestPri || (pri === bestPri && d2 < bestD2)) {
        bestPri = pri;
        bestD2 = d2;
        best = obj;
      }
    }
    return best;
  }


  function hostResolveInteractableById(player, targetId) {
    const st = G.state;
    if (!targetId) return null;
    const obj = (st.objects || {})[targetId];
    if (!obj) return null;
    if (!['meeting_bell', 'mission', 'root_door', 'body_report', 'vent_hole', 'lamp'].includes(obj.type)) return null;
    if (obj.type === 'vent_hole' && player.role !== 'teacher') return null;
    if (obj.type === 'vent_hole' && G.state.practice) return null;
    if (obj.type === 'mission' && player.role === 'teacher' && !st.practice) return null;
    if (obj.type === 'meeting_bell' && player.role === 'teacher' && !st.practice) return null;
    if (obj.type === 'lamp') {
      const lp = st.lamps && st.lamps[obj.id];
      if (!lp) return null;
      if (player.role === 'teacher' && !lp.on) return null;
      if (player.role !== 'teacher' && lp.on) return null;
    }
    const pt = getObjInteractPoint(obj);
    const d2 = dist2(player.x, player.y, pt.x, pt.y);
    if (d2 > getObjInteractRange(obj) ** 2) return null;
    if (obj.type === 'meeting_bell' && Number(st.meetingBellCdUntil || 0) > now()) return null;
    return obj;
  }



  // 유령(downed student)이 주변 미션 오브젝트를 찾는 전용 함수.
  // hostNearestInteractable은 유령에게 호출하면 vent/lamp/door 등을 포함해
  // 잘못된 결과를 낼 수 있으므로 미션만 전용으로 탐색한다.
  function hostNearestMission(player) {
    const st = G.state;
    let best = null;
    let bestD2 = Infinity;
    for (const obj of Object.values(st.objects)) {
      if (obj.type !== 'mission') continue;
      const mm = st.missions && st.missions[obj.id];
      if (!mm || mm.state === 'solved') continue;
      const pt = getObjInteractPoint(obj);
      const d2 = dist2(player.x, player.y, pt.x, pt.y);
      const range = getObjInteractRange(obj);
      if (d2 > range ** 2) continue;
      if (d2 < bestD2) { bestD2 = d2; best = obj; }
    }
    return best;
  }

  function hostNearestReportBody(player) {
    const st = G.state;
    let best = null;
    let bestD2 = Infinity;
    for (const bp of Object.values(st.players || {})) {
      if (!bp || !bp.alive || !bp.down) continue;
      if (bp.id === player.id) continue;
      const bx = (bp.bodyX != null) ? bp.bodyX : bp.x;
      const by = (bp.bodyY != null) ? bp.bodyY : bp.y;
      const d2 = dist2(player.x, player.y, bx, by);
      if (d2 > (INTERACT_RANGE + 10) ** 2) continue;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { type: 'body_report', id: `body_${bp.id}`, pid: bp.id, x: bx, y: by };
      }
    }
    return best;
  }

function hostHandleInteract(playerId) {
    const st = G.state;
    const p = st.players[playerId];
    if (!p || !p.alive) return;
    const isGhost = (!!p.down && p.role !== 'teacher' && !st.practice);
    // Teacher (or practice) ghosts do nothing; student ghosts can do missions only.
    if (p.down && !isGhost) return;

    // 유령의 경우 _clientReportedState의 최신 위치로 임시 오버라이드하여 거리 체크.
    // hostTick이 아직 해당 틱을 처리하기 전일 수 있어 p.x/y가 오래된 값일 수 있음.
    let px = p.x, py = p.y;
    if (isGhost) {
      try {
        const rep = G.host && G.host._clientReportedState && G.host._clientReportedState.get(Number(playerId));
        if (rep && (now() - Number(rep.at || 0)) < 2000) {
          px = Number(rep.x || p.x);
          py = Number(rep.y || p.y);
        }
      } catch (_) {}
    }
    const pForRange = isGhost ? { ...p, x: px, y: py } : p;

    const reportBody = (!isGhost && !st.practice) ? hostNearestReportBody(p) : null;
    const obj = reportBody || (isGhost ? hostNearestMission(pForRange) : hostNearestInteractable(p));
    if (!obj) return;

    if (isGhost && obj.type !== 'mission') return;

    if (obj.type === 'meeting_bell') {
      if (p.role === 'teacher' && !st.practice) {
        sendToPlayer(playerId, { t: 'toast', text: '선생토끼는 회의를 열 수 없어!' });
        return;
      }
      const bellCdUntil = Number(st.meetingBellCdUntil || 0);
      if (bellCdUntil > now()) {
        const sLeft = Math.max(1, Math.ceil((bellCdUntil - now()) / 1000));
        sendToPlayer(playerId, { t: 'toast', text: `회의 쿨타임 ${sLeft}s` });
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
      if (p.role !== 'teacher') {
        sendToPlayer(playerId, { t: 'toast', text: '땅굴은 선생토끼만 쓸 수 있어!' });
        return;
      }
      if (now() < (p.ventCdUntil || 0)) {
        const sLeft = Math.ceil((p.ventCdUntil - now())/1000);
        sendToPlayer(playerId, { t: 'toast', text: `땅굴 쿨타임 ${sLeft}s` });
        return;
      }

      const here = st.objects[obj.id];
      const VENT_LINKS = {
        vent_warren: 'vent_root',
        vent_root: 'vent_lab',
        vent_lab: 'vent_storage',
        vent_storage: 'vent_mushroom',
        vent_mushroom: 'vent_warren',
      };
      const allVents = Object.values(st.objects).filter(o => o.type === 'vent_hole');
      if (allVents.length < 2) return;
      let toId = VENT_LINKS[obj.id] || null;
      if (!(toId && st.objects[toId] && st.objects[toId].type === 'vent_hole' && toId !== obj.id)) {
        const links = (here && here.links) ? here.links.slice() : allVents.map(v => v.id).filter(id => id !== obj.id);
        const choices = links.filter(id => id !== obj.id && st.objects[id] && st.objects[id].type === 'vent_hole');
        if (!choices.length) return;
        toId = choices[0];
      }
      const dest = st.objects[toId];
      const pickVentExitPixel = (ventObj) => {
        const pref = [
          [0, 2], [0, -2], [2, 0], [-2, 0],
          [1, 2], [-1, 2], [1, -2], [-1, -2],
          [2, 1], [2, -1], [-2, 1], [-2, -1],
          [0, 3], [0, -3], [3, 0], [-3, 0],
        ];
        for (const [dx, dy] of pref) {
          const tx = ventObj.x + dx;
          const ty = ventObj.y + dy;
          if (!canWalkTile(tx, ty)) continue;
          return { x: (tx + 0.5) * TS, y: (ty + 0.5) * TS };
        }
        for (let r = 1; r <= 6; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dx === 0 && dy === 0) continue;
              const tx = ventObj.x + dx;
              const ty = ventObj.y + dy;
              if (!canWalkTile(tx, ty)) continue;
              return { x: (tx + 0.5) * TS, y: (ty + 0.5) * TS };
            }
          }
        }
        return { x: (ventObj.x + 0.5) * TS, y: (ventObj.y + 1.5) * TS };
      };
      const exit = pickVentExitPixel(dest);

      const ventNow = now();
      // 1초짜리 사라짐→이동→나타남 애니메이션
      // Phase 0~0.45s: 출발지에서 서서히 사라짐 (fade-out)
      // Phase 0.45~0.55s: 숨어있는 상태 (완전 투명)
      // Phase 0.55~1.0s: 목적지에서 서서히 나타남 (fade-in)
      const VENT_ANIM_MS = 1000;
      const settleUntil = ventNow + Math.max(VENT_ANIM_MS, VENT_SETTLE_MS, VENT_INPUT_LOCK_MS);
      p.ventCdUntil = ventNow + VENT_COOLDOWN_MS;
      p.ventLockUntil = settleUntil;
      p.forcePosUntil = settleUntil;
      p.forcePosX = exit.x;
      p.forcePosY = exit.y;
      p.ignoreClientStateUntil = settleUntil;
      // 출발 위치에서 freeze (사라지는 동안 출발지에 머물다가 도착 타이밍에 이동)
      const arriveAt = ventNow + VENT_ANIM_MS * 0.55;
      p.vent = { end: arriveAt, toX: exit.x, toY: exit.y, start: ventNow, animEnd: ventNow + VENT_ANIM_MS };
      p.vx = 0;
      p.vy = 0;
      try {
        if (G.host && G.host.inputs) G.host.inputs.set(p.id, { mvx: 0, mvy: 0, at: ventNow });
        if (G.host && G.host._moveByToken) {
          const jt = (p.joinToken != null && String(p.joinToken) !== '') ? String(p.joinToken) : '';
          const sid = (!jt && p.sessionId != null && String(p.sessionId) !== '') ? `sid:${String(p.sessionId)}` : '';
          const cid = (!jt && !sid && p.clientId != null && String(p.clientId) !== '') ? `cid:${String(p.clientId)}` : '';
          const key = jt || sid || cid;
          if (key) G.host._moveByToken.set(key, { mvx: 0, mvy: 0, at: ventNow });
        }
        if (G.host && G.host._clientReportedState) {
          G.host._clientReportedState.delete(p.id);
        }
      } catch (_) {}

      broadcast({
        t: 'fx',
        kind: 'vent',
        from: { x: here.x, y: here.y },
        to: { x: dest.x, y: dest.y },
        bornAt: ventNow,
        animMs: VENT_ANIM_MS,
        pid: p.id,
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
      if (p.role === 'teacher' && !st.practice) {
        sendToPlayer(playerId, { t: 'toast', text: '선생토끼는 문제를 풀 수 없어!' });
        return;
      }
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
      // Mission concurrency lock (site-specific): only one player can work on a mission at a time.
      if (m.inUseBy && Number(m.inUseBy) !== Number(playerId) && now() < (m.inUseUntil || 0)) {
        sendToPlayer(playerId, { t: 'toast', text: '이미 미션 수행중입니다.' });
        return;
      }
      m.inUseBy = Number(playerId);
      m.inUseUntil = now() + 45000;
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
      if (p.role === 'teacher' && !st.practice) {
        sendToPlayer(playerId, { t: 'toast', text: '선생토끼는 회의를 열 수 없어!' });
        return;
      }
      if (st.practice) {
        sendToPlayer(playerId, { t: 'toast', text: '연습 모드: 기절/회의가 없어. 미션 연습만 가능!' });
        return;
      }
      const reportCdUntil = Number(st.reportMeetingCdUntil || 0);
      if (reportCdUntil > now()) {
        const sLeft = Math.max(1, Math.ceil((reportCdUntil - now()) / 1000));
        sendToPlayer(playerId, { t: 'toast', text: `신고 쿨타임 ${sLeft}s` });
        return;
      }
      hostStartMeeting('report', '기절한 토끼를 발견!');
      return;
    }
  }



  function hostStartMeeting(kind = 'emergency', reason = '회의!') {
    const st = G.state;
    const tNow = now();
    const endsAt = tNow + 10000;
    G.phase = 'meeting';
    G.host.meetingKind = kind;
    G.host.meetingEndsAt = endsAt;
    try { G.host.votes && G.host.votes.clear(); } catch (_) { G.host.votes = new Map(); }
    st.meetingBellCdUntil = tNow + 20000;
    st.reportMeetingCdUntil = tNow + 20000;
    for (const p of Object.values(st.players || {})) {
      if (!p) continue;
      p.vx = 0; p.vy = 0;
      p.vent = null;
      p.forcePosUntil = 0;
      p.ignoreClientStateUntil = 0;
      p.ventLockUntil = Math.max(Number(p.ventLockUntil || 0), tNow + 900);
    }
    try {
      if (G.host && G.host.inputs) {
        for (const pid of Object.keys(st.players || {})) {
          G.host.inputs.set(Number(pid), { mvx: 0, mvy: 0, at: tNow });
        }
      }
    } catch (_) {}
    broadcastState(true);
    broadcast({ t: 'uiMeetingOpen', kind, reason, endsAt });
    broadcast({ t: 'voteUpdate', tally: {}, skip: 0, total: 0, endsAt });
  }

  function hostSubmitVote(playerId, target) {
    if (G.phase !== 'meeting') return;
    const st = G.state;
    const p = st.players[playerId];
    if (!p || !p.alive || p.down) return;
    if (!G.host.votes) G.host.votes = new Map();
    if (target != null) {
      const tp = st.players[Number(target)];
      if (!tp || !tp.alive || tp.down) return;
      G.host.votes.set(Number(playerId), Number(target));
    } else {
      G.host.votes.set(Number(playerId), null);
    }
    const tally = {};
    let skip = 0, total = 0;
    for (const [_, v] of G.host.votes.entries()) {
      total++;
      if (v == null) skip++;
      else tally[String(v)] = Number(tally[String(v)] || 0) + 1;
    }
    broadcast({ t: 'voteUpdate', tally, skip, total, endsAt: G.host.meetingEndsAt });
  }

  function hostResolveMeeting() {
    const st = G.state;
    const tally = {};
    let skip = 0;
    for (const [_, v] of (G.host.votes || new Map()).entries()) {
      if (v == null) skip++;
      else tally[String(v)] = Number(tally[String(v)] || 0) + 1;
    }
    let topPid = null, topVotes = 0, tied = false;
    for (const [pid, cnt] of Object.entries(tally)) {
      const n = Number(cnt || 0);
      if (n > topVotes) { topVotes = n; topPid = Number(pid); tied = false; }
      else if (n === topVotes) { tied = true; }
    }
    let title = '회의 종료';
    let text = '아무도 쫓아내지 못했다.';
    let scenePayload = { t: 'uiScene', kind: 'text', title, text };
    if (topPid != null && !tied && topVotes > skip) {
      const ex = st.players[topPid];
      if (ex) {
        ex.alive = false;
        ex.down = true;
        if (ex.bodyX == null || ex.bodyY == null) { ex.bodyX = ex.x; ex.bodyY = ex.y; }
        title = '회의 결과';
        text = `${ex.nick || '토끼'}가 쫓겨났다!`;
        scenePayload = {
          t: 'uiScene',
          kind: 'eject',
          title,
          text,
          ejected: {
            nick: ex.nick || '토끼',
            color: Number(ex.color || 0),
            isTeacher: ex.role === 'teacher',
          },
        };
      }
    }
    G.phase = 'scene';
    G.host.meetingEndsAt = 0;
    try { G.host.votes && G.host.votes.clear(); } catch (_) {}
    broadcastState(true);
    broadcast(scenePayload);
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
    // Freeze the body position once (so a ghost can roam while the fainted body stays).
    if (target.bodyX == null || target.bodyY == null) { target.bodyX = target.x; target.bodyY = target.y; }

    // brief kill animation (shown to everyone)
    killer.emoteKind = 'kill0';
    killer.emoteUntil = now() + 900;

    killer.killCdUntil = now() + 7_000;
    broadcastState();
  }


  function getFloodDoorCorridorPoints(nearDoor) {
    if (!nearDoor) return [];
    const info = doorCrossInfoAt(nearDoor.x, nearDoor.y, nearDoor) || { corridorVertical: true };
    const span = doorSpanOffsetsAt(nearDoor.x, nearDoor.y, info) || { spanX: true, minOff: 0, maxOff: 0 };
    const pts = [];
    const addPt = (tx, ty) => {
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      if (!canWalkTile(tx, ty)) return;
      pts.push({ x: (tx + 0.5) * TS, y: (ty + 0.5) * TS });
    };
    for (let off = span.minOff; off <= span.maxOff; off++) {
      if (info.corridorVertical) {
        addPt(nearDoor.x + off, nearDoor.y - 1);
        addPt(nearDoor.x + off, nearDoor.y + 1);
        addPt(nearDoor.x + off, nearDoor.y - 2);
        addPt(nearDoor.x + off, nearDoor.y + 2);
      } else {
        addPt(nearDoor.x - 1, nearDoor.y + off);
        addPt(nearDoor.x + 1, nearDoor.y + off);
        addPt(nearDoor.x - 2, nearDoor.y + off);
        addPt(nearDoor.x + 2, nearDoor.y + off);
      }
    }
    return pts;
  }

  function computeFloodTilesForDoor(nearDoor) {
    if (!nearDoor) return [];
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

    const roomContains = (tx, ty) => {
      const rr = nearDoor.roomId ? getRoomById(nearDoor.roomId) : null;
      return !!(rr && _roomRectContainsTile(rr, tx, ty));
    };

    const info = doorCrossInfoAt(nearDoor.x, nearDoor.y, nearDoor) || { corridorVertical: true };
    const span = doorSpanOffsetsAt(nearDoor.x, nearDoor.y, info) || { spanX: true, minOff: 0, maxOff: 0 };
    const outsideSeeds = [];
    const pushSeed = (tx, ty, dist=0) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
      if (baseSolidAt(tx, ty) || isClosedDoorTile(tx, ty) || roomContains(tx, ty)) return;
      outsideSeeds.push({ x: tx, y: ty, dist });
    };

    for (let off = span.minOff; off <= span.maxOff; off++) {
      if (info.corridorVertical) {
        pushSeed(nearDoor.x + off, nearDoor.y - 1, 1);
        pushSeed(nearDoor.x + off, nearDoor.y + 1, 1);
      } else {
        pushSeed(nearDoor.x - 1, nearDoor.y + off, 1);
        pushSeed(nearDoor.x + 1, nearDoor.y + off, 1);
      }
    }

    const tiles = [];
    const seen = new Set();
    const addTile = (tx, ty) => {
      const key = tx + ',' + ty;
      if (seen.has(key)) return false;
      seen.add(key);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      tiles.push({ x: tx, y: ty });
      return true;
    };

    for (let off = span.minOff; off <= span.maxOff; off++) {
      if (info.corridorVertical) addTile(nearDoor.x + off, nearDoor.y);
      else addTile(nearDoor.x, nearDoor.y + off);
    }

    const q = [];
    for (const seed of outsideSeeds) {
      if (addTile(seed.x, seed.y)) q.push(seed);
    }

    const MAX_DIST = 6;
    const MAX_TILES = 72;
    while (q.length && tiles.length < MAX_TILES) {
      const cur = q.shift();
      if (cur.dist >= MAX_DIST) continue;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (baseSolidAt(nx, ny) || isClosedDoorTile(nx, ny) || roomContains(nx, ny)) continue;
        const key = nx + ',' + ny;
        if (seen.has(key)) continue;
        addTile(nx, ny);
        q.push({ x: nx, y: ny, dist: cur.dist + 1 });
        if (tiles.length >= MAX_TILES) break;
      }
    }
    return tiles;
  }

  function nearestFloodSpotDoor(player) {
    const st = G.state;
    if (!player || !st || !st.objects) return null;
    let best = null;
    let bestD2 = Infinity;
    const RANGE2 = (TS * 3.35) ** 2;
    for (const obj of Object.values(st.objects || {})) {
      if (!obj || obj.type !== 'root_door') continue;
      const corridorPts = getFloodDoorCorridorPoints(obj);
      if (!corridorPts.length) continue;
      let localBest = Infinity;
      for (const pt of corridorPts) {
        const d2 = dist2(player.x, player.y, pt.x, pt.y);
        if (d2 < localBest) localBest = d2;
      }
      if (localBest > RANGE2) continue;
      if (localBest < bestD2) {
        bestD2 = localBest;
        best = obj;
      }
    }
    return best;
  }

  function nearestDoorInteractTarget(player) {
    const st = G.state;
    if (!player || !st || !st.objects) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const obj of Object.values(st.objects || {})) {
      if (!obj || obj.type !== 'root_door') continue;
      const pt = getObjInteractPoint(obj);
      const d2 = dist2(player.x, player.y, pt.x, pt.y);
      const range2 = getObjInteractRange(obj) ** 2;
      if (d2 > range2) continue;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = obj;
      }
    }
    return best;
  }

  function getForceMissionTargetNearby(player) {
    const st = G.state;
    if (!player || !st || !st.objects || !st.missions) return null;

    let pickId = null;
    let bestD2 = Infinity;
    for (const obj of Object.values(st.objects || {})) {
      if (!obj || obj.type !== 'mission') continue;
      const mm = st.missions[obj.id];
      if (!mm) continue;
      // solved/active는 제외, sealed 대기중인 미션도 제외한다.
      if (mm.state === 'solved' || mm.state === 'active') continue;
      if (mm.inUseBy && now() < Number(mm.inUseUntil || 0)) continue;
      if (mm.sealedAt && now() < Number(mm.sealedAt || 0)) continue;
      const pt = getObjInteractPoint(obj);
      const ox = pt.x;
      const oy = pt.y;
      const d2 = dist2(player.x, player.y, ox, oy);
      if (d2 > (MISSION_INTERACT_RANGE ** 2)) continue;
      if (d2 < bestD2) {
        bestD2 = d2;
        pickId = obj.id;
      }
    }
    return pickId;
  }

  function hasForceMissionTargetNearby(player) {
    return !!getForceMissionTargetNearby(player);
  }

  function hostHandleSabotage(playerId) {
    const st = G.state;
    const p = st.players[playerId];
    if (!p || !p.alive || p.role !== 'teacher' || st.practice) return;
    if (!inPlay() || now() < Number(p.saboCdUntil || 0)) return;
    const nearInteractDoor = nearestDoorInteractTarget(p);
    if (nearInteractDoor) {
      sendToPlayer(playerId, { t: 'toast', text: '문 앞에서는 물채우기보다 문 조작이 우선이야!' });
      return;
    }
    const nearDoor = nearestFloodSpotDoor(p);
    if (!nearDoor) {
      sendToPlayer(playerId, { t: 'toast', text: '복도의 뿌리문 길목 근처에서만 물채우기를 쓸 수 있어!' });
      return;
    }
    const tiles = computeFloodTilesForDoor(nearDoor).slice(0, 96);
    if (!tiles.length) return;
    const until = now() + 10000;
    const stamp = Math.floor(now());
    for (let i = 0; i < tiles.length; i++) {
      const tt = tiles[i];
      const id = `flood_${nearDoor.id}_${stamp}_${i}`;
      st.waterBlocks[id] = { id, x: tt.x, y: tt.y, until };
    }
    p.saboCdUntil = now() + 20000;
    broadcast({ t: 'toast', text: '선생토끼가 길목에 물을 채웠다!' });
    broadcastState(true);
  }

  function hostHandleForceMission(playerId) {
    const st = G.state;
    const p = st.players[playerId];
    if (!p || !p.alive || p.role !== 'teacher' || st.practice) return;
    if (!inPlay() || now() < Number(p.forceCdUntil || 0)) return;
    const pickId = getForceMissionTargetNearby(p);
    if (!pickId) {
      sendToPlayer(playerId, { t: 'toast', text: '근처에 강제미션 걸 수 있는 미션이 없어!' });
      return;
    }
    const mm = st.missions[pickId];
    mm.state = 'active';
    mm.activatedAt = now();
    mm.expiresAt = now() + 12000;
    mm.forceFailAt = now() + 12000;
    mm.forcedBy = playerId;
    if (mm.sealedAt) mm.sealedAt = 0;
    p.forceCdUntil = now() + FORCE_COOLDOWN_MS;
    broadcast({ t: 'toast', text: '선생토끼가 강제미션을 걸었다!' });
    broadcastState(true);
  }

  function setHUD() {
    timeText.textContent = fmtTime(G.state.timeLeft);

    // 타이머 경고(60/30/10초): 점멸 + (가능하면) 비프/진동
    const tl = G.state.timeLeft || 0;
    const stage = (inPlay() && tl > 0) ? (tl <= 10 ? 3 : (tl <= 30 ? 2 : (tl <= 60 ? 1 : 0))) : 0;

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
    const nearHintTarget = (show && me) ? nearestHint(me)?.target : null;
    // 문 바로 앞에서는 문 열기/닫기를 우선한다.
    const showSabo = !!(nearFloodDoor && !(nearHintTarget && nearHintTarget.type === 'root_door'));
    if (saboBtn) saboBtn.style.display = showSabo ? 'inline-flex' : 'none';
    if (saboBtnTouch) saboBtnTouch.style.display = showSabo ? 'flex' : 'none';

    // (2) 강제미션
    if (forceBtn) forceBtn.style.display = show ? 'inline-flex' : 'none';
    if (forceBtnTouch) forceBtnTouch.style.display = show ? 'flex' : 'none';

    if (show) {
      // 근처에 Idle 미션이 있는지(강제미션 가능 위치)
      const nearIdle = hasForceMissionTargetNearby(me);

      const remSabo = Math.ceil(Math.max(0, ((me.saboCdUntil || 0) - now())) / 1000);
      const saboReady = (remSabo <= 0) && inPlay();
      if (saboBtn) {
        saboBtn.disabled = !saboReady;
        saboBtn.textContent = remSabo > 0 ? `물채우기 ${remSabo}s` : '물채우기';
      }
      if (saboBtnTouch) {
        saboBtnTouch.classList.toggle('ready', saboReady);
        saboBtnTouch.textContent = remSabo > 0 ? `물채우기 ${remSabo}s` : '물채우기';
      }

      const remForce = Math.ceil(Math.max(0, ((me.forceCdUntil || 0) - now())) / 1000);
      const forceReady = (remForce <= 0) && inPlay() && nearIdle;
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

  
function showCenterNotice(text, ms=2500){
  if (!G.ui) G.ui = {};
  G.ui.centerNoticeText = String(text || '');
  G.ui.centerNoticeUntil = now() + (ms || 2500);
}

function showToast(text) {
    // 간단 토스트: rolePill 텍스트 잠깐 바꾸기
    const prev = roleText.textContent;
    roleText.textContent = text;
    setTimeout(() => setRolePill(), 900);
    setTimeout(() => { roleText.textContent = prev; }, 1200);
  }


  const KIND_LABEL = {
    add: '덧셈', sub: '뺄셈', mul: '곱셈', div: '나눗셈',
    shape: '도형', graph: '그래프', unit: '단위', pattern: '규칙'
  };

  function _missionRandInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function _missionPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function _missionShuf(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function _normAnswer(v) { return String(v ?? '').replace(/\s+/g, '').trim(); }

  function _makeMissionQuestion(kind) {
    switch (String(kind || 'add')) {
      case 'add': {
        const a = _missionRandInt(2, 19), b = _missionRandInt(2, 19);
        return { type: 'input', prompt: `${a} + ${b} = ?`, answer: String(a + b) };
      }
      case 'sub': {
        const a = _missionRandInt(8, 30), b = _missionRandInt(2, a - 1);
        return { type: 'input', prompt: `${a} - ${b} = ?`, answer: String(a - b) };
      }
      case 'mul': {
        const a = _missionRandInt(2, 9), b = _missionRandInt(2, 9);
        return { type: 'input', prompt: `${a} × ${b} = ?`, answer: String(a * b) };
      }
      case 'div': {
        const b = _missionRandInt(2, 9), c = _missionRandInt(2, 9), a = b * c;
        return { type: 'input', prompt: `${a} ÷ ${b} = ?`, answer: String(c) };
      }
      case 'shape': {
        const shapes = ['원', '삼각형', '사각형', '오각형', '육각형'];
        const ans = _missionPick(shapes);
        return { type: 'shape', prompt: '그림과 같은 도형 이름은?', shapeKey: ans, options: _missionShuf([ans, ...shapes.filter(s => s !== ans).slice(0, 3)]), answer: ans };
      }
      case 'graph': {
        const labels = ['토끼풀', '당근', '버섯', '도토리'];
        const vals = _missionShuf([2, 4, 6, 8]);
        let maxI = 0;
        for (let i = 1; i < vals.length; i++) if (vals[i] > vals[maxI]) maxI = i;
        const ans = labels[maxI];
        return { type: 'graph', prompt: '가장 높은 막대의 이름은?', labels, vals, options: _missionShuf(labels), answer: ans };
      }
      case 'unit': {
        const n = _missionRandInt(2, 9) * 10;
        const ans = String(n * 100);
        return { type: 'choice', prompt: `${n} m 는 몇 cm일까?`, options: _missionShuf([ans, String(n*10), String(n*1000), String(n*50)]), answer: ans };
      }
      case 'pattern': {
        const s = _missionRandInt(1, 4), d = _missionRandInt(2, 5);
        const seq = [s, s+d, s+d*2, s+d*3];
        const ans = String(s + d*4);
        return { type: 'choice', prompt: `${seq.join(', ')}, 다음 수는?`, options: _missionShuf([ans, String(Number(ans)+d), String(Number(ans)-1), String(Number(ans)+1)]), answer: ans };
      }
      default: {
        const a = _missionRandInt(2, 12), b = _missionRandInt(2, 12);
        return { type: 'input', prompt: `${a} + ${b} = ?`, answer: String(a + b) };
      }
    }
  }

  function buildMissionUI(siteId, kind, practice) {
    return { siteId, kind, practice: !!practice, question: _makeMissionQuestion(kind) };
  }

  function hostGetMissionProg(playerId, siteId) {
    if (!G.host._missionProg) G.host._missionProg = new Map();
    const byPlayer = G.host._missionProg.get(Number(playerId));
    return byPlayer ? (byPlayer.get(String(siteId)) || null) : null;
  }

  function hostInitMissionProg(playerId, siteId, kind, practice) {
    if (!G.host._missionProg) G.host._missionProg = new Map();
    const pid = Number(playerId);
    let byPlayer = G.host._missionProg.get(pid);
    if (!byPlayer) { byPlayer = new Map(); G.host._missionProg.set(pid, byPlayer); }
    byPlayer.set(String(siteId), { kind, practice: !!practice, correct: 0, hadWrong: false, question: _makeMissionQuestion(kind) });
    return byPlayer.get(String(siteId));
  }

  function hostMissionSubmit(playerId, payload) {
    const st = G.state;
    const pid = Number(playerId || 0);
    const siteId = String(payload && payload.siteId || '');
    const p = st.players && st.players[pid];
    const mm = siteId ? st.missions[siteId] : null;
    if (!p || !mm) return;
    let prog = hostGetMissionProg(pid, siteId);
    if (!prog) prog = hostInitMissionProg(pid, siteId, mm.kind, !!st.practice);
    const q = prog.question || payload.question || _makeMissionQuestion(mm.kind);
    const ok = _normAnswer(payload.answer) === _normAnswer(q.answer);
    if (!ok) {
      prog.hadWrong = true;
      prog.correct = 0;
      prog.question = _makeMissionQuestion(mm.kind);
      p.missionStage = 1;
      broadcastState(true);
      sendToPlayer(pid, { t: 'uiMissionNext', siteId, correct: 0, question: prog.question });
      sendToPlayer(pid, { t: 'toast', text: '틀렸어! 처음부터 다시.' });
      return;
    }
    prog.correct = Number(prog.correct || 0) + 1;
    if (prog.correct >= 3) {
      if (st.practice) {
        st.timeLeft = Math.min(st.maxTime || 180, Math.floor((st.timeLeft || 0) + 15));
      } else {
        st.timeLeft = Math.min(st.maxTime || 180, Math.floor((st.timeLeft || 0) + 15));
        st.solved = Number(st.solved || 0) + 1;
        mm.state = 'solved';
        mm.expiresAt = 0;
        mm.activatedAt = 0;
        mm.sealedAt = 0;
        if (st.infiniteMissions) mm.respawnAt = now() + 12000 + Math.random() * 10000;
      }
      mm.inUseBy = 0;
      mm.inUseUntil = 0;
      p.missionSiteId = null;
      p.missionStage = 3;
      p.missionClearAt = now() + 700;
      sendToPlayer(pid, { t: 'uiMissionExit', siteId, toast: '미션 해결!' });
      broadcastState(true);
      return;
    }
    p.missionStage = clamp((prog.correct || 0) + 1, 1, 3);
    prog.question = _makeMissionQuestion(mm.kind);
    broadcastState(true);
    sendToPlayer(pid, { t: 'uiMissionNext', siteId, correct: prog.correct, question: prog.question });
  }

  function openMissionUI(payload) {
    const me = G.state?.players?.[G.net?.myPlayerId];
    if (me && me.role === 'teacher' && !G.state?.practice) {
      try { showCenterNotice('선생토끼는 문제를 풀 수 없어!', 1200); } catch (_) {}
      try {
        if (G.net && payload && payload.siteId) {
          G.net.post({ t: 'missionClose', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, siteId: payload.siteId });
        }
      } catch (_) {}
      return;
    }
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
        const packet = { t: 'missionClose', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, siteId: ui.siteId };
        if (G.net.isHost && G.net.myPlayerId) {
          const st = G.state;
          const pid = Number(G.net.myPlayerId || 0);
          const p = st.players && st.players[pid];
          const mm = st.missions && st.missions[ui.siteId];
          if (mm && mm.kind) hostInitMissionProg(pid, ui.siteId, mm.kind, !!st.practice);
          if (mm && Number(mm.inUseBy) === pid) { mm.inUseBy = 0; mm.inUseUntil = 0; }
          if (p) { p.missionSiteId = null; p.missionStage = 0; p.missionClearAt = 0; }
          broadcastState(true);
        } else {
          G.net.post(packet);
        }
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
      joinToken: G.net.joinToken || null,
      siteId: ui.siteId,
      kind: ui.kind,
      practice: ui.practice,
      correct: ui.correct,
      question: ui.question,
      answer: ans,
    };
    if (G.net.isHost && G.net.myPlayerId) {
      hostMissionSubmit(Number(G.net.myPlayerId || 0), payload);
      return;
    }
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
	  G.net.post({ t:'meetingChat', meetingId, playerId: meId, joinToken: G.net.joinToken || null, text });
    if (meetingChatText) meetingChatText.value = '';
  }

  if (meetingChatSend) meetingChatSend.addEventListener('click', () => sendMeetingChat());
  if (meetingChatText) meetingChatText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendMeetingChat(); }
  });



  // ---------- Broadcast helpers ----------
  function broadcast(msg) {
    if (!G.net) return;
    G.net.post(msg);
  }

  function sendToPlayer(playerId, msg) {
    const packet = { ...msg, to: playerId };
    // BroadcastChannel does not deliver to the same tab/window.
    // In 1인 로컬/연습모드에서 호스트 자신에게 보내는 미션 UI/토스트는
    // 네트워크를 거치지 말고 바로 로컬 핸들러로 태운다.
    if (G.net && Number(playerId) === Number(G.net.myPlayerId || 0) && G.net.isHost) {
      try {
        const h = G.net.handlers && G.net.handlers.get(packet.t);
        if (h) { h(packet); return; }
      } catch (_) {}
      if (packet.t === 'toast') {
        try { showToast(packet.text || ''); } catch (_) {}
        return;
      }
    }
    broadcast(packet);
  }

  function broadcastState(force = false) {
    if (!G.net || !G.net.isHost) return;
    const st = G.state;
    const payload = {
      t: 'state',
      phase: G.phase,
      started: !!st.started,
      timeLeft: st.timeLeft,
      maxTime: st.maxTime,
      solved: st.solved,
      total: st.total,
      practice: !!st.practice,
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
      force: !!force,
    };
    broadcast(payload);
    try { G.host._lastStateBroadcast = now(); } catch (_) {}
  }

  function broadcastPlayers() {
    if (!G.net || !G.net.isHost) return;
    const st = G.state;
    const players = {};
    try {
      for (const [id, p] of Object.entries(st.players || {})) {
        if (!p) continue;
        players[id] = {
          x: Math.round((p.x || 0) * 100) / 100,
          y: Math.round((p.y || 0) * 100) / 100,
          vx: Math.round((p.vx || 0) * 100) / 100,
          vy: Math.round((p.vy || 0) * 100) / 100,
          dir: (p.dir | 0) || 0,
          facing: (p.facing | 0) || 1,
          alive: !!p.alive,
          down: !!p.down,
          role: p.role || 'crew',
          vent: p.vent ? 1 : 0,
          ventStart: (p.vent && p.vent.start) ? Number(p.vent.start) : 0,
          ventAnimEnd: (p.vent && p.vent.animEnd) ? Number(p.vent.animEnd) : 0,
          ventToX: (p.vent && p.vent.toX != null) ? Number(p.vent.toX) : 0,
          ventToY: (p.vent && p.vent.toY != null) ? Number(p.vent.toY) : 0,
          ventLockUntil: Number(p.ventLockUntil || 0),
          forcePosUntil: Number(p.forcePosUntil || 0),
          forcePosX: Number(p.forcePosX || 0),
          forcePosY: Number(p.forcePosY || 0),
          emoteKind: p.emoteKind || null,
          emoteUntil: p.emoteUntil || 0,
          missionSiteId: p.missionSiteId || null,
          missionStage: p.missionStage || 0,
        };
      }
    } catch (_) {}
    broadcast({ t: 'p', players, at: now() });
    try { G.host._lastPlayersBroadcast = now(); } catch (_) {}
  }

  function broadcastRoster(force = false) {
    if (!G.net || !G.net.isHost) return;
    const st = G.state;
    const players = {};
    try {
      for (const [id, p] of Object.entries(st.players || {})) {
        if (!p) continue;
        players[id] = {
          id: p.id,
          nick: p.nick || '토끼',
          color: p.color || 0,
          role: p.role || 'crew',
          alive: !!p.alive,
          down: !!p.down,
          isBot: !!p.isBot,
          clientId: (p.clientId != null) ? String(p.clientId) : null,
          joinToken: p.joinToken || null,
          x: Math.round((p.x || 0) * 100) / 100,
          y: Math.round((p.y || 0) * 100) / 100,
          vx: Math.round((p.vx || 0) * 100) / 100,
          vy: Math.round((p.vy || 0) * 100) / 100,
          dir: (p.dir | 0) || 0,
          facing: (p.facing | 0) || 1,
          vent: p.vent ? 1 : 0,
        };
      }
    } catch (_) {}
    broadcast({ t: 'roster', phase: G.phase, started: !!st.started, practice: !!st.practice, teacherId: st.teacherId, players, at: now(), force: !!force });
    try { G.host._lastRosterBroadcast = now(); } catch (_) {}
  }

  function setRolePill() {
    const st = G.state || {};
    const me = (st.players || {})[G.net?.myPlayerId];
    if (!rolePill || !roleText) return;
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
    // Local vote state (clients may change vote until timer ends)
    G.ui.meeting.voted = false; // legacy flag (kept for compatibility)
    G.ui.meeting.myVote = undefined;
    G.ui.meeting.tally = {};
    G.ui.meeting.skip = 0;
    G.ui.meeting.total = 0;
    G.ui.meeting.endsAt = Number(endsAt || 0);

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

    const endsAt = Number(G.ui?.meeting?.endsAt || 0);
    const canVoteTime = (endsAt ? (now() < endsAt) : true);
    const myVote = G.ui?.meeting?.myVote;
    const tally = (G.ui?.meeting?.tally) || {};
    const skipCnt = Number(G.ui?.meeting?.skip || 0);
    const isGhost = (()=>{
      try{
        const me = st.players[meId];
        return (!me || !me.alive || me.down);
      }catch(_){ return false; }
    })();

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
      // vote count badge
      const badge = document.createElement('div');
      badge.textContent = String(tally[p.id] || 0);
      badge.style.minWidth = '24px';
      badge.style.padding = '2px 8px';
      badge.style.borderRadius = '999px';
      badge.style.background = 'rgba(255,255,255,.08)';
      badge.style.border = '1px solid rgba(255,255,255,.12)';
      badge.style.fontWeight = '900';
      badge.style.textAlign = 'center';

      const btn = document.createElement('button');
      btn.className = 'ui';
      const selected = (myVote === p.id);
      btn.textContent = selected ? '선택됨' : '투표';
      btn.disabled = (!canVoteTime) || isGhost || (p.id === meId);
      btn.onclick = () => {
        if (!G.net) return;
        if (!canVoteTime) return;
        if (isGhost) return;
        G.ui.meeting.myVote = p.id;
	        G.net.post({ t: 'vote', playerId: meId, joinToken: G.net.joinToken || null, target: p.id });
        renderVoteList();
      };
      row.appendChild(left);
      row.appendChild(badge);
      row.appendChild(btn);

      // highlight my choice
      if (selected) {
        row.style.outline = '2px solid rgba(125,211,252,.55)';
        row.style.borderRadius = '12px';
        row.style.padding = '6px';
      }
      voteList.appendChild(row);
    });

    // Skip vote button state (show count + my selection)
    try{
      const selSkip = (myVote === null);
      skipVote.textContent = selSkip ? `기권(선택됨) · ${skipCnt}표` : `기권 · ${skipCnt}표`;
      skipVote.disabled = (!canVoteTime) || isGhost;
      skipVote.style.outline = selSkip ? '2px solid rgba(125,211,252,.55)' : '';
    }catch(_){ }
  }

  skipVote.addEventListener('click', () => {
    if (!G.net) return;
    const endsAt = Number(G.ui?.meeting?.endsAt || 0);
    if (endsAt && now() >= endsAt) return;
    // Ghosts cannot vote
    try{
      const me = G.state?.players?.[G.net?.myPlayerId];
      if (!me || !me.alive || me.down) return;
    }catch(_){ }
    G.ui.meeting.myVote = null;
    G.net.post({ t: 'vote', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, target: null });
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
          // ejected student: prefer the dedicated crying sheet
          const ok = drawStudentCrySceneSheet(cx, cy, 1.10 * DPR, p.color ?? 0, t);
          if (!ok) drawBunny(cx, cy, 2.4 * DPR, p.color ?? 0, t - SCENE.startAt, mood);
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

  function drawStudentCrySceneSheet(x, y, scale, colorIdx, t) {
    const sheet = (getTintedSheet('student_cry_sheet', colorIdx) || AS.pixel?.student_cry_sheet);
    if (!sheet) return false;
    const bob = Math.sin(t * 0.01) * 1.6;
    const sw = 64, sh = 72;
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    sceneCtx.save();
    sceneCtx.imageSmoothingEnabled = false;
    // shadow
    sceneCtx.globalAlpha = 0.22;
    sceneCtx.fillStyle = '#000';
    sceneCtx.beginPath();
    sceneCtx.ellipse(x, y + dh * 0.22, dw * 0.28, dh * 0.09, 0, 0, Math.PI * 2);
    sceneCtx.fill();
    sceneCtx.globalAlpha = 1;

    sceneCtx.drawImage(sheet, 0, 0, sw, sh, Math.round(x - dw/2), Math.round(y - dh*0.70 + bob), dw, dh);
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
    // 씬 확인 즉시 이동 가능하도록 play로 전환 (호스트 broadcastState 대기 없이)
    if (G.phase === 'scene') {
      G.phase = 'play';
    }
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
      if (!me || !me.alive) return false;
      const isGhost = (!!me.down && me.role !== 'teacher' && !st.practice);
      if (me.down && !isGhost) return false;
      const cam = getCamera(me);
      const wx = cam.x + px;
      const wy = cam.y + py;

      let best = null;
      let bestD2 = Infinity;
      let bestPri = -Infinity;
      for (const obj of Object.values(st.objects || {})) {
        if (!['meeting_bell', 'mission', 'root_door', 'vent_hole', 'lamp'].includes(obj.type)) continue;
        if (isGhost && obj.type !== 'mission') continue;
        if (obj.type === 'vent_hole' && (me.role !== 'teacher' || st.practice)) continue;
        if (obj.type === 'lamp') {
          const lp = st.lamps && st.lamps[obj.id];
          if (!lp) continue;
          if (me.role === 'teacher' && !lp.on) continue;
          if (me.role !== 'teacher' && lp.on) continue;
        }
        const pt = getObjInteractPoint(obj);
        const ox = pt.x;
        const oy = pt.y;
        const clickRange = (obj.type === 'lamp') ? LAMP_CLICK_RANGE : (TS * 0.9);
        const clickD2 = dist2(wx, wy, ox, oy);
        if (clickD2 > clickRange ** 2) continue;
        const meD2 = dist2(me.x, me.y, ox, oy);
        if (meD2 > getObjInteractRange(obj) ** 2) continue;

        let pri = 0;
        if (obj.type === 'vent_hole' && me.role === 'teacher') pri = 100;
        else if (obj.type === 'meeting_bell') pri = 80;
        else if (obj.type === 'root_door') pri = 30;
        else if (obj.type === 'lamp') pri = 20;
        else if (obj.type === 'mission') pri = 10;

        if (pri > bestPri || (pri === bestPri && clickD2 < bestD2)) {
          bestPri = pri;
          bestD2 = clickD2;
          best = obj;
        }
      }

      if (!best && !isGhost) {
        for (const p of Object.values(st.players || {})) {
          if (!p.alive || !p.down) continue;
          if (p.id === me.id) continue;
          const bx = (p.bodyX != null) ? p.bodyX : p.x;
          const by = (p.bodyY != null) ? p.bodyY : p.y;
          const clickD2 = dist2(wx, wy, bx, by);
          if (clickD2 > (TS * 0.9) ** 2) continue;
          const meD2 = dist2(me.x, me.y, bx, by);
          if (meD2 > (INTERACT_RANGE + 10) ** 2) continue;
          best = { type: 'body_report' };
          break;
        }
      }

      if (!best) return false;

      if (G.net.isHost && G.net.myPlayerId) {
        hostHandleInteract(G.net.myPlayerId, best?.id || null);
        broadcastState(true);
      } else {
        G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'interact' });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (isMobile) return; // 모바일은 조이스틱
    if (!inPlay()) return;
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
    if (!inPlay()) return;
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
    if (!inPlay()) return;
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
        if (G.net) G.net.post({ t: 'emote', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'cry' });
        handled = true; break;
      case '2':
        if (G.net) G.net.post({ t: 'emote', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'tsk' });
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
    if (!inPlay()) return;
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
    if (!inPlay()) return;
    // Host shortcut (solo/practice)
    if (G.net.isHost && G.net.myPlayerId) {
      hostHandleInteract(G.net.myPlayerId);
      broadcastState(true);
      return;
    }
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'interact' });
  }

  // Primary action: X (PC) / 조작 버튼 (mobile). Context-sensitive:
  // - If teacher and a target is in range, X -> 0점
  // - Otherwise, X -> interact (doors, missions, meeting, etc.)
  function sendPrimaryAction() {
    if (!G.net) return;
    if (!inPlay()) return;
    const st = G.state;
    const me = st?.players?.[G.net.myPlayerId];
    if (!me || !me.alive) return;
    const isGhost = (!!me.down && me.role !== 'teacher' && !st.practice);
    if (me.down && !isGhost) return;
    const near = nearestHint(me);
    const canKill = (me.role === 'teacher') && near.canKill && !!near.killTarget && !G.state.practice;
    const nearFloodDoor = (me.role === 'teacher' && !G.state.practice) ? nearestFloodSpotDoor(me) : null;
    const nearReportBody = (!G.state.practice) ? hostNearestReportBody(me) : null;
    const nearDoorInteract = !!(near && near.target && near.target.type === 'root_door' && near.canInteract);
    if (canKill) sendKill();
    else if (nearDoorInteract) sendInteract();
    else if (near.canInteract) sendInteract();
    else if (nearFloodDoor && !nearReportBody) sendSabotage();
  }

  interactBtn.addEventListener('click', () => sendInteract());

  function sendKill() {
    if (!G.net) return;
    if (!inPlay()) return;
    // Host shortcut (solo/practice)
    if (G.net.isHost && G.net.myPlayerId) {
      hostHandleKill(G.net.myPlayerId);
      broadcastState(true);
      return;
    }
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'kill' });
  }

  killBtn.addEventListener('click', () => sendKill());
  try { if (killBtnPc) killBtnPc.addEventListener('click', () => sendKill()); } catch (_) {}

  function sendSabotage() {
    if (!G.net) return;
    if (!inPlay()) return;
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'sabotage' });
  }

  function sendForceMission() {
    if (!G.net) return;
    if (!inPlay()) return;
    // Host shortcut: same reason as sabotage/interact/kill.
    // Without this, the teacher host can see the button but nothing happens.
    if (G.net.isHost && G.net.myPlayerId) {
      hostHandleForceMission(G.net.myPlayerId);
      broadcastState(true);
      return;
    }
    G.net.post({ t: 'act', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, kind: 'forceMission' });
  }

  saboBtn?.addEventListener('click', () => sendSabotage());
  saboBtnTouch?.addEventListener('click', () => sendSabotage());
  forceBtn?.addEventListener('click', () => sendForceMission());
  forceBtnTouch?.addEventListener('click', () => sendForceMission());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // keyboard actions (PC)
    if (!isMobile && inPlay() && !isTyping()) {
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
        if (doorSolidAt(tx, ty) || doorSolidAt(ptx, pty)) return { x: lastX, y: lastY };
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
        if (doorSolidAt(gx, gy) || doorSolidAt(ptx, pty)) return false;
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
    // Make each lamp toggle noticeably impactful.
    // Empirically, the default linear mapping felt too subtle; amplify.
    const LIGHT_DARK_MULT = 3.0;
    return clamp((off / total) * LIGHT_DARK_MULT, 0, 1);
  }

  function getLookAngle(me){
    // Prefer explicit facing/dir from simulation (stable & matches the sprite direction).
    try{
      if (me && me.dir != null) {
        if (me.dir === 2) return (me.facing < 0 ? Math.PI : 0);
        if (me.dir === 1) return -Math.PI/2;
        if (me.dir === 0) return Math.PI/2;
      }
    }catch(_){ }
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
  // Teacher and practice mode ignore vision limits.
  // Also, Among-Us style: dead/ghost players are NOT affected by lights.
  if (!me || me.role === 'teacher' || st.practice || (me.down && me.role !== 'teacher')) return;

  let dark01 = getGlobalDarkness01(st);

  // Per-player darkness debuff (e.g., subtraction wrong): temporarily narrows vision more.
  try{
    const tNow = now();
    if (me.darkUntil && tNow < me.darkUntil) {
      const p = clamp((me.darkUntil - tNow) / 8000, 0, 1);
      dark01 = clamp(dark01 + 0.85 * p, 0, 1);
    }
  }catch(_){}

  if (dark01 <= 0) return;

  const a = clamp(dark01, 0, 1);

  // Darkness overlay alpha and vision params (more off lamps => narrower & shorter vision)
  const overlayA = clamp((0.20 + 0.72 * a) * 2.0, 0, 0.92);
  const look = getLookAngle(me);

  // Among Us-like: fixed 60° cone. Darkness shrinks distance.
  const baseHalf = (Math.PI/180) * 30;                // 60° total
  const baseDist = (520 - 380 * a) * ZOOM;            // ~520px -> ~200px (screen space)
  const nearR    = (26) * ZOOM;                       // tiny always-visible circle around my body
  const nearFeather = (14) * ZOOM;                    // feather for the small circle

  const cx = (me.x - cam.x) * ZOOM;
  const cy = (me.y - cam.y) * ZOOM;

  // IMPORTANT:
  // Do NOT use destination-out on the main canvas, or it will punch holes through the world
  // (making the "visible" area transparent/black and the outside bright = inverted effect).
  // Instead, draw the darkness mask on an offscreen canvas and then blit it over the world.
  if (!G.ui) G.ui = {};
  let mcv = G.ui._lightMaskCanvas;
  if (!mcv) {
    mcv = document.createElement('canvas');
    G.ui._lightMaskCanvas = mcv;
    try { mcv.width = viewW; mcv.height = viewH; } catch(_) {}
  }
  if (mcv.width !== viewW || mcv.height !== viewH) {
    mcv.width = viewW; mcv.height = viewH;
  }
  const mctx = mcv.getContext('2d');
  setCrisp(mcv, mctx);

  mctx.save();
  mctx.clearRect(0, 0, viewW, viewH);

  // darkness overlay
  mctx.globalCompositeOperation = 'source-over';
  mctx.globalAlpha = 1;
  mctx.fillStyle = `rgba(0,0,0,${overlayA})`;
  mctx.fillRect(0, 0, viewW, viewH);

  // punch visible areas with soft gradients
  mctx.globalCompositeOperation = 'destination-out';

  // near body reveal: tiny circle around the player (so you can always see yourself)
  try{
    const r0 = Math.max(2, nearR);
    const r1 = Math.max(r0 + 2, nearR + nearFeather);
    const g0 = mctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
    const mid = clamp(r0 / r1, 0, 1);
    g0.addColorStop(0.00, 'rgba(0,0,0,1)');
    g0.addColorStop(mid,  'rgba(0,0,0,1)');
    g0.addColorStop(1.00, 'rgba(0,0,0,0)');
    mctx.fillStyle = g0;
    mctx.beginPath();
    mctx.arc(cx, cy, r1, 0, Math.PI*2);
    mctx.fill();
  }catch(_){
    mctx.beginPath();
    mctx.arc(cx, cy, nearR, 0, Math.PI*2);
    mctx.fill();
  }

  const layers = [
    { alpha: 1.00, widen: 1.00, dist: 1.00 },
    { alpha: 0.55, widen: 1.18, dist: 0.97 },
    { alpha: 0.22, widen: 1.38, dist: 0.92 },
  ];

  for (const L of layers) {
    const half = baseHalf * L.widen;
    const r = baseDist * L.dist;

    mctx.save();
    mctx.translate(cx, cy);
    mctx.rotate(look);

    mctx.beginPath();
    mctx.moveTo(0, 0);
    mctx.arc(0, 0, r, -half, half);
    mctx.closePath();
    mctx.clip();

    try{
      const g = mctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0.00, `rgba(0,0,0,${1.00 * L.alpha})`);
      g.addColorStop(0.45, `rgba(0,0,0,${0.75 * L.alpha})`);
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      mctx.fillStyle = g;
    }catch(_){
      mctx.fillStyle = `rgba(0,0,0,${0.8 * L.alpha})`;
    }

    mctx.fillRect(-r, -r, r * 2, r * 2);
    mctx.restore();
  }

  mctx.restore();

  // Blit the mask over the world
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(mcv, 0, 0);
  ctx.restore();

}

// 꺼진 등 위치를 항상 연하게 표시 (선생/학생/유령 공통, dark01 무관)
// - 선생: 본인이 껐음에도 위치 파악 가능
// - 학생: 어두운 상황에서도 꺼진 등 찾아서 복구 가능
function drawOffLampHints(cam, me, st) {
  if (!me || st.practice) return;
  const lamps = st.lamps || {};
  const offIds = Object.keys(lamps).filter(id => !lamps[id]?.on);
  if (!offIds.length) return;

  const dark01 = getGlobalDarkness01(st);
  // 완전히 어두울수록 더 밝게 표시 (찾을 수 있도록), 기본도 항상 표시
  const baseAlpha = 0.18 + Math.min(0.28, dark01 * 0.36);

  ctx.save();
  for (const id of offIds) {
    const o = st.objects && st.objects[id];
    if (!o) continue;
    const pt = getLampInteractPoint(o);
    const lx = (pt.x - cam.x) * ZOOM;
    const ly = (pt.y - cam.y) * ZOOM;
    if (lx < -72 || ly < -96 || lx > viewW + 72 || ly > viewH + 72) continue;

    // 희미한 후광 (파란빛 — 꺼진 등 느낌)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rr = 18 * ZOOM;
    const g = ctx.createRadialGradient(lx, ly - 10 * ZOOM, 0, lx, ly - 10 * ZOOM, rr);
    g.addColorStop(0, 'rgba(175,210,255,0.55)');
    g.addColorStop(0.5, 'rgba(120,170,235,0.15)');
    g.addColorStop(1, 'rgba(120,170,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, ly - 10 * ZOOM, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 등 스프라이트 자체를 연하게 표시
    ctx.save();
    ctx.globalAlpha = baseAlpha;
    drawLamp(o, lx, ly);
    ctx.restore();
  }
  ctx.restore();
}

function _roomRectContainsTile(rr, tx, ty) {
  if (!rr || !rr.rect) return false;
  const [rx, ry, rw, rh] = rr.rect;
  return tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh;
}

function _isOuterBoundaryWallTile(tx, ty) {
  if (!AS.map) return false;
  const W = AS.map.width | 0, H = AS.map.height | 0;
  if (tx <= 0 || ty <= 0 || tx >= W - 1 || ty >= H - 1) return true;
  return false;
}

function _collectOcclusionTilesForRoom(roomId, pad = 0) {
  const rr = getRoomById(roomId);
  if (!rr || !AS.map) return [];
  const out = [];
  const [rx, ry, rw, rh] = rr.rect;
  const W = AS.map.width | 0, H = AS.map.height | 0;
  for (let ty = ry - pad; ty < ry + rh + pad; ty++) {
    if (ty < 0 || ty >= H) continue;
    for (let tx = rx - pad; tx < rx + rw + pad; tx++) {
      if (tx < 0 || tx >= W) continue;
      out.push({ x: tx, y: ty });
    }
  }
  return out;
}

function _isSideCulDeSacRoom(roomId) {
  return roomId === 'lab' || roomId === 'reactor' || roomId === 'med' || roomId === 'storage';
}

function _floodDoorSideComponent(seedX, seedY, passable, visibleWalk) {
  if (!AS.map) return [];
  const W = AS.map.width | 0, H = AS.map.height | 0;
  if (seedX < 0 || seedY < 0 || seedX >= W || seedY >= H) return [];
  if (!passable(seedX, seedY)) return [];
  const seen = new Set();
  const out = [];
  const q = [{ x: seedX, y: seedY }];
  seen.add(seedX + ',' + seedY);
  while (q.length) {
    const cur = q.shift();
    const ckey = cur.x + ',' + cur.y;
    if (!visibleWalk || !visibleWalk.has(ckey)) out.push({ x: cur.x, y: cur.y });
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!passable(nx, ny)) continue;
      const nkey = nx + ',' + ny;
      if (seen.has(nkey)) continue;
      seen.add(nkey);
      q.push({ x: nx, y: ny });
    }
  }
  return out;
}

function _collectLeakedOcclusionTilesForClosedDoor(obj, passable, visibleWalk) {
  if (!obj || typeof obj.x !== 'number' || typeof obj.y !== 'number') return [];
  const dx = (obj._doorDx | 0) || 0;
  const dy = (obj._doorDy | 0) || 0;
  if (!dx && !dy) return [];

  const ox = obj.x | 0, oy = obj.y | 0;
  const insideSeed = { x: ox - dx, y: oy - dy };
  const outsideSeed = { x: ox + dx, y: oy + dy };
  const insideKey = insideSeed.x + ',' + insideSeed.y;
  const outsideKey = outsideSeed.x + ',' + outsideSeed.y;
  const insideReachable = !!(visibleWalk && visibleWalk.has(insideKey));
  const outsideReachable = !!(visibleWalk && visibleWalk.has(outsideKey));

  let hidden = [];
  if (insideReachable && !outsideReachable) {
    hidden = _floodDoorSideComponent(outsideSeed.x, outsideSeed.y, passable, visibleWalk);
  } else if (!insideReachable && outsideReachable) {
    hidden = _floodDoorSideComponent(insideSeed.x, insideSeed.y, passable, visibleWalk);
  } else if (!insideReachable && !outsideReachable) {
    const roomTiles = _collectOcclusionTilesForRoom(obj.roomId);
    hidden = roomTiles.filter(tt => !(visibleWalk && visibleWalk.has(tt.x + ',' + tt.y)));
  }

  if (!hidden.length) return [];
  const out = [];
  const seen = new Set();
  const W = AS.map.width | 0, H = AS.map.height | 0;
  for (const tt of hidden) {
    for (let yy = tt.y - 1; yy <= tt.y + 1; yy++) {
      for (let xx = tt.x - 1; xx <= tt.x + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const key = xx + ',' + yy;
        if (visibleWalk && visibleWalk.has(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x: xx, y: yy });
      }
    }
  }
  return out;
}

function drawTileOverlaySet(cam, tileSet, fillStyle) {
  if (!tileSet || !tileSet.size) return;
  ctx.save();
  ctx.fillStyle = fillStyle;
  const vw = viewW / ZOOM;
  const vh = viewH / ZOOM;
  const coverUp = Math.round(TS * 0.95);
  for (const key of tileSet) {
    const [txs, tys] = key.split(',');
    const tx = txs | 0, ty = tys | 0;
    const sx = tx * TS - cam.x;
    const sy = ty * TS - cam.y;
    if (sx + TS <= 0 || sy + TS <= -coverUp || sx >= vw || sy >= vh) continue;
    ctx.fillRect(Math.round(sx), Math.round(sy - coverUp), TS, TS + coverUp);
  }
  ctx.restore();
}

// Closed doors should block visibility across the opening (so you can't "peek" the other side).
// Per-user rule: if I'm outside a closed room, I can't see inside it; if I'm inside it, I can't see outside.
function _nearestPassableTile(tx, ty) {
  const W = AS.map ? (AS.map.width | 0) : 0;
  const H = AS.map ? (AS.map.height | 0) : 0;
  const passable = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (_isSolidTile(x, y)) return false;
    if (doorSolidAt(x, y)) return false;
    return true;
  };
  if (passable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (passable(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function _computeDoorOcclusionComponent(me, st) {
  if (!me || !AS.map) return null;
  const W = AS.map.width | 0, H = AS.map.height | 0;
  const startTx = Math.floor(me.x / TS);
  const startTy = Math.floor(me.y / TS);
  const lockKey = (st.lockedRoomId && st.lockedRoomUntil && now() < st.lockedRoomUntil) ? `${st.lockedRoomId}:${st.lockedRoomUntil|0}` : '';
  const cacheKey = `${startTx},${startTy}|${G._doorSolidKey || ''}|${lockKey}`;
  if (G._doorOccCache && G._doorOccCache.key === cacheKey) return G._doorOccCache.occluded;

  const start = _nearestPassableTile(startTx, startTy);
  const visibleWalk = new Set();
  const visibleAll = new Set();
  const q = [];
  if (start) {
    const startKey = `${start.x},${start.y}`;
    visibleWalk.add(startKey);
    q.push(start);
  }

  const passable = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (_isSolidTile(x, y)) return false;
    if (doorSolidAt(x, y)) return false;
    return true;
  };

  while (q.length) {
    const cur = q.shift();
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!passable(nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (visibleWalk.has(key)) continue;
      visibleWalk.add(key);
      q.push({ x: nx, y: ny });
    }
  }

  // Visibility should stop at closed doors / walls, but the blocking edge itself
  // must remain visible. So we add reachable walk tiles, then only the adjacent
  // blocking tiles (walls / closed-door solids) around them. We do NOT dilate into
  // adjacent passable tiles, because that leaks vision through shut doorways.
  for (const key of visibleWalk) {
    visibleAll.add(key);
    const [txs, tys] = key.split(',');
    const tx = txs | 0, ty = tys | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (_isSolidTile(nx, ny) || doorSolidAt(nx, ny)) visibleAll.add(`${nx},${ny}`);
      }
    }
  }

  const occluded = new Set();
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (_isOuterBoundaryWallTile(tx, ty) && _isSolidTile(tx, ty)) continue;
      const key = `${tx},${ty}`;
      if (!visibleAll.has(key)) occluded.add(key);
    }
  }

  // Closed door art itself should stay visible from either side. Only the area
  // beyond the door should be hidden. Remove each closed-door span tile from the
  // occluded set after the main flood/occlusion pass.
  for (const obj of (AS.map.objects || [])) {
    if (!obj || obj.type !== 'root_door') continue;
    const d = st.doors && st.doors[obj.id];
    if (!d || !d.closed) continue;
    const ox = obj.x | 0, oy = obj.y | 0;
    const info = doorCrossInfoAt(ox, oy, obj);
    if (!info) {
      occluded.delete(`${ox},${oy}`);
      continue;
    }
    const span = doorSpanOffsetsAt(ox, oy, info);
    for (let off = span.minOff; off <= span.maxOff; off++) {
      const cx = span.spanX ? (ox + off) : ox;
      const cy = span.spanX ? oy : (oy + off);
      occluded.delete(`${cx},${cy}`);
    }
    occluded.delete(`${ox},${oy}`);
  }

  const myRoom = roomAtPixel(me.x, me.y);
  const myRoomId = myRoom ? myRoom.id : null;

  // Keep room-lock occlusion as a separate gameplay rule. Door visibility itself is
  // now derived from the actual passable flood + adjacent blockers, which fixes the
  // four side-room cases without per-room special casing.
  if (st.lockedRoomId && st.lockedRoomUntil && now() < st.lockedRoomUntil && st.lockedRoomId !== myRoomId) {
    for (const tt of _collectOcclusionTilesForRoom(st.lockedRoomId)) {
      occluded.add(tt.x + ',' + tt.y);
    }
  }

  G._doorOccCache = { key: cacheKey, occluded };
  return occluded;
}

function drawClosedDoorOcclusion(cam, me, st){
  if (!me || !st || !AS.map) return;
  const hasClosedDoor = Object.values(st.doors || {}).some(d => d && d.closed);
  const hasLockedRoom = !!(st.lockedRoomId && st.lockedRoomUntil && now() < st.lockedRoomUntil);
  if (!hasClosedDoor && !hasLockedRoom) return;

  const occluded = _computeDoorOcclusionComponent(me, st);
  if (!occluded || !occluded.size) return;
  drawTileOverlaySet(cam, occluded, 'rgb(12,16,26)');
}

function drawWaterTileOverlay(cam, st) {
  const flooded = new Set();
  for (const wb of Object.values(st.waterBlocks || {})) {
    const tiles = (wb && Array.isArray(wb.tiles) && wb.tiles.length) ? wb.tiles : ((wb && Number.isFinite(wb.x) && Number.isFinite(wb.y)) ? [{ x: wb.x, y: wb.y }] : []);
    for (const tt of tiles) flooded.add(tt.x + ',' + tt.y);
  }
  drawTileOverlaySet(cam, flooded, 'rgba(96,190,255,0.42)');
}


function drawWaterBlockTimers(cam, st) {
  const groups = new Map();
  for (const wb of Object.values(st.waterBlocks || {})) {
    if (!wb) continue;
    const id = String(wb.id || '');
    const m = id.match(/^(flood_.+)_\d+$/);
    const key = m ? m[1] : id;
    let g = groups.get(key);
    if (!g) g = { until: Number(wb.until || 0), pts: [] };
    g.until = Math.max(g.until, Number(wb.until || 0));
    if (Number.isFinite(wb.x) && Number.isFinite(wb.y)) g.pts.push({ x: wb.x, y: wb.y });
    if (Array.isArray(wb.tiles)) {
      for (const tt of wb.tiles) if (tt && Number.isFinite(tt.x) && Number.isFinite(tt.y)) g.pts.push({ x: tt.x, y: tt.y });
    }
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const leftMs = Number(g.until || 0) - now();
    if (leftMs <= 0 || !g.pts.length) continue;
    const secsLeft = Math.max(1, Math.ceil(leftMs / 1000));
    let sx = 0, sy = 0;
    for (const pt of g.pts) { sx += pt.x; sy += pt.y; }
    const centroid = { x: sx / g.pts.length, y: sy / g.pts.length };
    let anchor = g.pts[0];
    let best = Infinity;
    for (const pt of g.pts) {
      const d2 = (pt.x - centroid.x) * (pt.x - centroid.x) + (pt.y - centroid.y) * (pt.y - centroid.y);
      if (d2 < best) { best = d2; anchor = pt; }
    }
    const x = (anchor.x + 0.5) * TS - cam.x;
    const y = (anchor.y + 0.5) * TS - cam.y - TS * 0.15;
    drawStatusTimerBadge(x, y, secsLeft, 'rgba(28,110,180,.88)');
  }
}

function drawMiniMapHUD() {
  if (!AS.map || !mapCanvas) return;
  const st = G.state;
  const me = st.players[G.net?.myPlayerId] || null;
  const rr = me ? roomAtPixel(me.x, me.y) : null;
  const mobile = !!isMobile;
  const pad = mobile ? 8 : 9;
  const contentW = mobile ? 120 : 172;
  const contentH = mobile ? 82 : 118;
  const frameW = contentW + pad * 2;
  const frameH = contentH + pad * 2;
  const worldW = AS.map.width * TS;
  const worldH = AS.map.height * TS;

  const x = mobile ? (viewW - frameW - 10) : (viewW - frameW - 14);
  const y = mobile ? 70 : 58;
  const s2 = Math.min(contentW / worldW, contentH / worldH);
  const mapW = worldW * s2;
  const mapH = worldH * s2;
  const ox = x + pad + Math.floor((contentW - mapW) / 2);
  const oy = y + pad + Math.floor((contentH - mapH) / 2);

  ctx.save();
  ctx.fillStyle = 'rgba(18,26,46,.78)';
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, frameW, frameH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, contentW, contentH, 10);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mapCanvas, 0, 0, worldW, worldH, ox, oy, mapW, mapH);
  ctx.restore();

  for (const obj of Object.values(st.objects || {})) {
    if (!obj || obj.type !== 'mission') continue;
    const mm = (st.missions || {})[obj.id];
    if (!mm || mm.state !== 'active') continue;
    const mx = ox + (obj.x + 0.5) * TS * s2;
    const my = oy + (obj.y + 0.5) * TS * s2;
    const pulse = 0.58 + 0.42 * ((Math.sin(now() / 480) + 1) * 0.5);
    const ringR = mobile ? 5.8 : 7.2;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = 'rgba(255,255,255,.96)';
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = mobile ? 1.6 : 1.9;
    ctx.beginPath();
    ctx.arc(mx, my, ringR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = mobile ? '900 10px system-ui' : '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    ctx.fillText('!', mx, my + 0.2);
    ctx.restore();
  }

  // 꺼진 등 노란 점으로 미니맵에 표시
  {
    const lamps = st.lamps || {};
    const offLampIds = Object.keys(lamps).filter(id => !lamps[id]?.on);
    if (offLampIds.length) {
      const lampPulse = 0.70 + 0.30 * ((Math.sin(now() / 600) + 1) * 0.5);
      const lampR = mobile ? 3.2 : 4.0;
      for (const id of offLampIds) {
        const lo = st.objects && st.objects[id];
        if (!lo) continue;
        const lmx = ox + (lo.x + 0.5) * TS * s2;
        const lmy = oy + (lo.y + 0.5) * TS * s2;
        // 미니맵 영역 바깥이면 스킵
        if (lmx < ox || lmy < oy || lmx > ox + mapW || lmy > oy + mapH) continue;
        ctx.save();
        ctx.globalAlpha = lampPulse * 0.92;
        // 노란 테두리 원
        ctx.beginPath();
        ctx.arc(lmx, lmy, lampR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,230,60,.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,150,0,.95)';
        ctx.lineWidth = mobile ? 1.2 : 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  if (me) {
    const px = ox + me.x * s2;
    const py = oy + me.y * s2;
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, mobile ? 3.8 : 4.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (roomPill && roomText) {
    if (rr) {
      roomText.textContent = rr.name || '';
      roomPill.style.display = 'flex';
      roomPill.style.position = 'fixed';
      roomPill.style.left = `${x}px`;
      roomPill.style.top = `${y + frameH + 8}px`;
      roomPill.style.width = `${frameW}px`;
      roomPill.style.justifyContent = 'center';
      roomPill.style.pointerEvents = 'none';
      roomPill.style.zIndex = '24';
      roomPill.style.padding = mobile ? '6px 10px' : '7px 12px';
      roomPill.style.fontSize = mobile ? '12px' : '13px';
    } else {
      roomPill.style.display = 'none';
    }
  }

  if (mobile && rightHud) {
    rightHud.style.position = 'fixed';
    rightHud.style.right = '10px';
    rightHud.style.top = '8px';
    rightHud.style.width = `${frameW}px`;
    rightHud.style.display = 'grid';
    rightHud.style.gridTemplateColumns = '1fr 1fr';
    rightHud.style.gap = '6px';
    rightHud.style.justifyItems = 'stretch';
    rightHud.style.alignItems = 'stretch';
    rightHud.style.zIndex = '25';
    if (rolePill) {
      rolePill.style.gridColumn = '1 / -1';
      rolePill.style.justifyContent = 'center';
      rolePill.style.minWidth = '0';
      rolePill.style.padding = '6px 10px';
    }
    if (fullscreenBtn) {
      fullscreenBtn.style.minWidth = '0';
      fullscreenBtn.style.padding = '6px 8px';
      fullscreenBtn.style.fontSize = '11px';
    }
    if (exitBtn) {
      exitBtn.style.minWidth = '0';
      exitBtn.style.padding = '6px 8px';
      exitBtn.style.fontSize = '11px';
    }
  } else if (rightHud) {
    rightHud.style.position = '';
    rightHud.style.right = '';
    rightHud.style.top = '';
    rightHud.style.width = '';
    rightHud.style.display = '';
    rightHud.style.gridTemplateColumns = '';
    rightHud.style.gap = '';
    rightHud.style.justifyItems = '';
    rightHud.style.alignItems = '';
    rightHud.style.zIndex = '';
    if (rolePill) {
      rolePill.style.gridColumn = '';
      rolePill.style.justifyContent = '';
      rolePill.style.minWidth = '';
      rolePill.style.padding = '';
    }
    if (fullscreenBtn) {
      fullscreenBtn.style.minWidth = '';
      fullscreenBtn.style.padding = '';
      fullscreenBtn.style.fontSize = '';
    }
    if (exitBtn) {
      exitBtn.style.minWidth = '';
      exitBtn.style.padding = '';
      exitBtn.style.fontSize = '';
    }
  }

  ctx.restore();
}

function drawLoadingScreen(extraText=null){

  ctx.save();
  try{
    if (AS.loadingImg && AS.loadingImg.width > 0) {
      const iw = AS.loadingImg.width, ih = AS.loadingImg.height;
      const scale = Math.max(viewW / iw, viewH / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = (viewW - dw) / 2;
      const dy = (viewH - dh) / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(AS.loadingImg, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,viewW,viewH);
    }
  }catch(_){
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,viewW,viewH);
  }

  if (extraText){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,viewW,viewH);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(extraText), viewW/2, viewH*0.55);
    ctx.restore();
  }
  ctx.restore();
}

function drawCenterNoticeOverlay(){
  try{
    if (!G.ui) return;
    const until = Number(G.ui.centerNoticeUntil || 0);
    if (!until) return;
    const t = now();
    if (t > until) return;
    const msg = String(G.ui.centerNoticeText || '').trim();
    if (!msg) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(0,0,viewW,viewH);

    const padX = 22;
    const padY = 14;
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxW = Math.min(viewW * 0.82, 720);
    const words = msg.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words){
      const test = line ? (line + ' ' + w) : w;
      if (ctx.measureText(test).width <= maxW) line = test;
      else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);

    const lineH = 28;
    const boxW = maxW + padX*2;
    const boxH = lines.length*lineH + padY*2;
    const bx = (viewW - boxW)/2;
    const by = (viewH - boxH)/2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, bx, by, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    let y = by + boxH/2 - (lines.length-1)*lineH/2;
    for (const L of lines){
      ctx.fillText(L, viewW/2, y);
      y += lineH;
    }
    ctx.restore();
  }catch(_){}
}



  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 픽셀 아트: 항상 최근접/정수 좌표로 렌더링
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, viewW, viewH);

    
// Show a proper loading/title screen instead of a black canvas while assets/join/start are pending.
if (!AS.map || !mapCanvas) {
  // In embed mode, keep the HTML loading overlay visible from the first paint.
  try{ if (EMBED) bootShow('로딩 중...'); }catch(_){ }
  drawLoadingScreen();
  drawCenterNoticeOverlay();
  return;
}

const st = G.state;

// Embedded mode: while we're still in lobby / waiting for host start, show the loading/title art.
try{
  // In iframe embed mode, treat ourselves as embed from the very first frame.
  const isEmbed = !!EMBED || !!(G.ui && G.ui.embedJoined);
  if (isEmbed && (G.phase === 'lobby' || !st.started)) {
    const hint = (G.net && G.net.isHost && G.ui && G.ui._embedWaitingStart)
      ? '플레이어 접속을 기다리는 중...'
      : '로딩 중...';
    // Boot overlay should not block the lobby UI.
    // Show it only until assets are loaded; then hide it even if we are still waiting in lobby.
    try{
      if (!G.ui) G.ui = {};
      if (!G.assetsReady){
        if (!(G.ui && G.ui._bootHidden)) bootShow(hint);
      } else {
        if (!G.ui._bootHidden){ bootHide(); G.ui._bootHidden = true; }
      }
    }catch(_){ }
    // Keep drawing the canvas title art as a fallback (HTML overlay is on top in embed).
    drawLoadingScreen((hint === '플레이어 접속을 기다리는 중...') ? hint : null);
    drawCenterNoticeOverlay();
    return;
  }
}catch(_){}

    // [boot] hide overlay once started
    // In embed (iframe) mode: once the match is actually started, hide the HTML boot overlay.
    // Keep this outside the waiting-early-return branch so it only runs when we are about to render the world.
    if (EMBED) {
      try{
        if (!G.ui) G.ui = {};
        if (!G.ui._bootHidden && G.phase !== 'lobby' && st && st.started) {
          bootHide();
          G.ui._bootHidden = true;
        }
      }catch(_){ }
    }


    const me = st.players[G.net?.myPlayerId] || Object.values(st.players)[0];
    let cam = me ? getCamera(me) : { x: 0, y: 0, vw: viewW / ZOOM, vh: viewH / ZOOM };

    // time warning shake (10초 이하)
    if (inPlay() && st.timeLeft > 0 && st.timeLeft <= 10) {
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
        const bellCdUntil = Number(st.meetingBellCdUntil || 0);
        if (bellCdUntil > now()) {
          drawWorldCooldownTag(x, y - TS * 0.95, `회의 ${Math.max(1, Math.ceil((bellCdUntil - now()) / 1000))}s`);
        }
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
          const ventCdLeft = Math.max(0, Math.ceil((((me && me.ventCdUntil) || 0) - now()) / 1000));
          if (ventCdLeft > 0) drawVentCooldown(x, y - TS * 0.9, ventCdLeft);
        }
      }
    }

    // 1회성 효과(파티클/뽁/땅굴)
    drawFx(cam);

    // players
    const players = Object.values(st.players)
      .slice()
      .sort((a, b) => (a.y - b.y));

    const viewerIsGhost = (!!me && !!me.down && me.role !== 'teacher' && !st.practice);

    for (const p of players) {
      if (!p.alive) continue;

      let wx = p.x, wy = p.y;
      let pDraw = p;
      // Render smoothing for other players (host and guest alike).
      // Never smooth my own avatar here; only remotes should use the buffered render pose.
      if (G.net && G.remoteSmooth && G.remoteSmooth.remotes && Number(p.id || 0) !== Number(G.net.myPlayerId || 0)) {
        const ex = G.remoteSmooth.remotes.get(p.id);
        if (ex && typeof ex.rx === 'number' && typeof ex.ry === 'number') {
          wx = ex.rx;
          wy = ex.ry;
          if (wx !== p.x || wy !== p.y) pDraw = ({ ...p, x: wx, y: wy });
        }
      }

      const px = wx - cam.x;
      const py = wy - cam.y;
      const isGhostBody = (!!p.down && p.role !== 'teacher' && !st.practice);
      if (isGhostBody) {
        // bodyX/bodyY가 없으면 p.x/p.y를 시체 위치로 사용
        const bxw = (p.bodyX != null) ? p.bodyX : p.x;
        const byw = (p.bodyY != null) ? p.bodyY : p.y;

        // 1) fainted body stays where it fell
        const body = { ...p, x: bxw, y: byw, vx: 0, vy: 0, down: true, vent: null };
        drawPlayer(body, bxw - cam.x, byw - cam.y);
        const reportCdUntil = Number(st.reportMeetingCdUntil || 0);
        if (reportCdUntil > now()) {
          drawWorldCooldownTag(bxw - cam.x, byw - cam.y - TS * 0.9, `신고 ${Math.max(1, Math.ceil((reportCdUntil - now()) / 1000))}s`);
        }

        // 2) ghost clone roams & does missions (semi-transparent)
        // Visible ONLY to dead/ghost players (Among Us).
        if (viewerIsGhost) {
          ctx.save();
          ctx.globalAlpha = 0.38;
          const ghostDraw = (pDraw === p) ? ({ ...p, down: false }) : ({ ...pDraw, down: false });
          drawPlayer(ghostDraw, wx - cam.x, wy - cam.y);
          ctx.restore();
        }
      } else {
        drawPlayer(pDraw, px, py);
      }
    }

    ctx.restore();

    // global lighting / vision mask (crew only)
    if (inPlay()) {
      try { drawLightMask(cam, me, st); } catch (_) {}
      // 꺼진 등 위치 힌트 — 선생/학생/유령 모두, dark01 무관하게 항상 표시
      try { drawOffLampHints(cam, me, st); } catch (_) {}
      try {
        ctx.save();
        ctx.scale(ZOOM, ZOOM);
        drawClosedDoorOcclusion(cam, me, st);
        drawWaterTileOverlay(cam, st);
    drawWaterBlockTimers(cam, st);
        ctx.restore();
      } catch (_) {}
      // Among Us style: keep MY character readable even when the world is dark.
      try {
        if (me && me.role !== 'teacher' && !st.practice && !me.down && getGlobalDarkness01(st) > 0) {
          ctx.save();
          ctx.scale(ZOOM, ZOOM);
          const my = st.players[G.net?.myPlayerId];
          if (my && my.alive) {
            const isGhostBody = (!!my.down && my.role !== 'teacher' && !st.practice);
            if (isGhostBody && (my.bodyX != null || my.bodyY != null)) {
              // redraw only the roaming ghost (body can stay in the dark)
              ctx.save();
              ctx.globalAlpha = 0.38;
              const ghost = { ...my, down: false };
              drawPlayer(ghost, (my.x - cam.x), (my.y - cam.y));
              ctx.restore();
            } else {
              drawPlayer(my, (my.x - cam.x), (my.y - cam.y));
            }
          }
          ctx.restore();
        }
      } catch (_) {}
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

    // 고정 미니맵 (우측 상단)
    if (inPlay()) {
      try { drawMiniMapHUD(); } catch (_) {}
    }

    // UI hints
    if (inPlay() && me) {
      const near = nearestHint(me);
      const showInteract = !!near.target;
      const canI = !!near.interactReady;
      interactBtn.style.display = showInteract ? 'flex' : 'none';
      interactBtn.classList.toggle('ready', canI);
      interactBtn.style.opacity = showInteract ? (canI ? '1' : '0.45') : '';

      // Bigger, clearer door prompt ("열기/닫기")
      if (showInteract && near.target) {
        interactBtn.textContent = near.target.label || '조작';
        interactBtn.classList.toggle('doorHint', near.target.type === 'root_door');
        try { drawWorldInteractPrompt(cam, near.target); } catch (_) {}
      } else {
        interactBtn.textContent = '조작';
        interactBtn.classList.remove('doorHint');
        interactBtn.style.opacity = '';
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
      if (inPlay() && st.timeLeft > 0 && st.timeLeft <= 30) {
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
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 32px system-ui';
      const msg = st.winner === 'crew' ? '학생토끼 승리!' : '선생토끼 승리!';
      const cx = viewW * 0.5;
      const cy = viewH * 0.5;
      ctx.fillText(msg, cx, cy - 14);
      ctx.font = '800 14px system-ui';
      const sub = EMBED ? '잠시 후 방으로 돌아갑니다.' : '새로고침하면 다시 시작할 수 있어요.';
      ctx.fillText(sub, cx, cy + 18);
      ctx.restore();
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

    // size: use per-object sizing so small floor lamps can stay compact.
    const dw = Math.max(12, Number(obj.drawW || 0) || ((kind === 'floor_lamp') ? TS : TS * 2));
    const dh = Math.max(12, Number(obj.drawH || 0) || ((kind === 'floor_lamp') ? TS : TS * 2));
    const px = x - dw / 2;
    const py = y - dh / 2;

    // shadow
    ctx.save();
    ctx.fillStyle = on ? 'rgba(0,0,0,.26)' : 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(x, y + dh * 0.42, dw * 0.30, dh * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // sprite — 꺼진 등은 전용 off 스프라이트가 없으면 desaturate+dim
    ctx.save();
    if (!on && !imOff) {
      // off 전용 이미지가 없으면 grayscale 필터로 확실히 구분
      ctx.filter = 'grayscale(1) brightness(0.42)';
      ctx.globalAlpha = 0.80;
    } else {
      ctx.globalAlpha = on ? 1.0 : 1.0;
    }
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

    // 꺼진 등: 빨간 X 배지로 꺼짐을 누구에게나 명확히 표시
    if (!on) {
      const bsz = Math.max(8, dw * 0.38);
      const bx = x + dw * 0.20;
      const by = y - dh * 0.20;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, bsz * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,10,10,.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,.95)';
      ctx.lineWidth = Math.max(1.5, bsz * 0.18);
      const d = bsz * 0.34;
      ctx.beginPath();
      ctx.moveTo(bx - d, by - d); ctx.lineTo(bx + d, by + d);
      ctx.moveTo(bx + d, by - d); ctx.lineTo(bx - d, by + d);
      ctx.stroke();
      ctx.restore();
    }
  
    // Center notices (host warnings, host exit, etc.)
    drawCenterNoticeOverlay();
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

      // Keep side-door logic at full 5-tile span, but restore the *visible* LR door
      // art to its previous height so only the collision/occlusion grows, not the sprite.
      const lrVisualMajor = (!info.corridorVertical && info.crossTiles >= 5)
        ? (TS * (info.crossTiles - 1) + Math.round(TS * 0.60))
        : w;

      // Image draw size: for side-entrance doors (corridor runs horizontally),
      // the door artwork should be "tall" along Y. So we swap draw dimensions.
      const drawW = info.corridorVertical ? w : h;
      const drawH = info.corridorVertical ? h : lrVisualMajor;

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
        if (!info.corridorVertical && openIm) {
          const dw = h;
          const dh = lrVisualMajor;
          ctx.drawImage(openIm, 0, 0, openIm.width, openIm.height, Math.round(-dw/2), Math.round(-dh/2), dw, dh);
        } else if (openIm) {
          ctx.drawImage(openIm, 0, 0, openIm.width, openIm.height, Math.round(-w/2), Math.round(-h/2), w, h);
        }
      };

      const isLRDoor = (!info.corridorVertical && !!imClosedLR);

      const drawClosed = () => {
        if (!info.corridorVertical && imClosedLR) {
          const dw = h;
          const dh = lrVisualMajor;
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
          const dh = lrVisualMajor;
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
          const dh = lrVisualMajor;
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
      // no lingering ripple/water ring under a sealed carrot

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
      // Keep the inactive hole dry-looking; no blue tint under the carrot.
      ctx.fillStyle = 'rgba(62,42,28,.18)';
      ctx.beginPath();
      ctx.ellipse(0, 18, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // Active mission: use the original full water-jet sprite and anchor its base to the hole.
      // Avoid custom blue puddle/ring overlays so nothing appears as a square tile below the hole.
      const activatedAt = m.activatedAt || 0;
      const rise = activatedAt ? clamp((tNow - activatedAt) / 420, 0, 1) : 1;
      const riseY = (1 - rise) * 10;
      const alpha = 0.35 + 0.65 * rise;
      const bob = Math.sin(tNow * 0.012) * 1.8;

      if (sheet) {
        const frame = (Math.floor(tNow / 160) % 2);
        const sx = frame * 32;
        const jetW = Math.round(DW * 0.78);
        const jetH = Math.round(DW * 1.02);
        const jetX = Math.round(-jetW * 0.5);
        const jetY = Math.round(18 - jetH + bob + riseY);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.drawImage(sheet, sx, 0, 32, 32, jetX, jetY, jetW, jetH);
        ctx.restore();
      } else {
        const t = tNow / 300;
        const amp = 6;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = 'rgba(125,211,252,.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.bezierCurveTo(-3, -14 - Math.sin(t) * amp + riseY * 0.35, 3, -24 - Math.cos(t) * amp + riseY * 0.35, 0, -38 - Math.sin(t * 1.3) * amp + riseY * 0.35);
        ctx.stroke();
        ctx.restore();
      }

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
    // 누수 흔적: 네모 물타일처럼 보이지 않게, 구멍 아래의 둥근 물고임만 그린다.
    const tNow = now();
    const born = lk?.bornAt || tNow;
    const life = Math.max(1, (lk?.until || (born + 45_000)) - born);
    const age = tNow - born;
    const fade = 1 - clamp(age / life, 0, 1);
    const pulse = Math.sin(tNow * 0.010 + ((x + y) * 0.02)) * 0.5 + 0.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= fade;

    // 바닥에 남는 둥근 물고임
    const baseA = (lk?.kind === 'forced') ? 0.22 : 0.18;
    ctx.fillStyle = (lk?.kind === 'forced')
      ? `rgba(255,90,122,${baseA + pulse * 0.06})`
      : `rgba(96,190,255,${baseA + pulse * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(0, 11, TS * 0.28, TS * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = (lk?.kind === 'forced')
      ? `rgba(255,210,220,${0.18 + pulse * 0.10})`
      : `rgba(210,245,255,${0.16 + pulse * 0.10})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 12, TS * 0.22, TS * 0.10, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 작은 방울만 살짝
    for (let i = 0; i < 3; i++) {
      const ph = tNow * 0.006 + i * 1.9 + ((x + y) * 0.01);
      const dx = Math.sin(ph) * (5 + i * 1.5);
      const dy = -5 - (Math.cos(ph * 1.2) * 2.2);
      ctx.fillStyle = (lk?.kind === 'forced')
        ? `rgba(255,210,220,${0.20 * fade})`
        : `rgba(220,248,255,${0.18 * fade})`;
      ctx.beginPath();
      ctx.arc(dx, 6 + dy, 1.6 + i * 0.25, 0, Math.PI * 2);
      ctx.fill();
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

    // 땅굴 이동 애니메이션: 1초간 서서히 사라졌다(0~0.45s) 이동 후 나타남(0.55~1.0s)
    // _ventAnim: { start, animEnd, toX, toY }  ← broadcastPlayers/p 스냅샷에서 주입
    // 호스트는 p.vent 객체(start/animEnd)를 직접 사용
    let ventAlpha = 1;
    let ventYOffset = 0;
    let restored = false;

    const tNow = now();
    const va = p._ventAnim || (p.vent && typeof p.vent === 'object' ? {
      start: Number(p.vent.start || tNow),
      animEnd: Number(p.vent.animEnd || (tNow + 1000)),
      toX: Number(p.vent.toX || p.x),
      toY: Number(p.vent.toY || p.y),
    } : null);

    if (va) {
      const total = Math.max(1, va.animEnd - va.start);
      const t01 = clamp((tNow - va.start) / total, 0, 1);
      const FADE_OUT_END  = 0.45;  // 0→0.45s: 사라짐
      const HIDDEN_END    = 0.55;  // 0.45→0.55s: 완전 투명
      const FADE_IN_END   = 1.00;  // 0.55→1.0s: 나타남

      if (t01 < FADE_OUT_END) {
        // fade out: 1 → 0
        ventAlpha = 1 - t01 / FADE_OUT_END;
        ventYOffset = -8 * (t01 / FADE_OUT_END);  // 살짝 위로 뜨며 사라짐
      } else if (t01 < HIDDEN_END) {
        // 완전 투명 (이동 중)
        ventAlpha = 0;
        ventYOffset = 0;
      } else {
        // fade in: 0 → 1  (목적지에서 아래로 내려오며 나타남)
        const fi = (t01 - HIDDEN_END) / (FADE_IN_END - HIDDEN_END);
        ventAlpha = fi;
        ventYOffset = -12 * (1 - fi);  // 위에서 내려오며 나타남
      }

      if (ventAlpha <= 0.01) {
        // 완전 투명 구간 — 아무것도 그리지 않음
        return;
      }
      ctx.save();
      restored = true;
      ctx.globalAlpha = clamp(ventAlpha, 0, 1);
      y += ventYOffset;
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
      const sheet = getTintedSheet('teacher_kill0_sheet', p.color ?? 0) || AS.pixel.teacher_kill0_sheet;
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



  function drawStatusTimerBadge(x, y, secsLeft, fill = 'rgba(10,14,26,.82)') {
    const text = `${secsLeft}s`;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px system-ui';
    const w = Math.max(48, ctx.measureText(text).width + 20);
    const h = 22;
    ctx.fillStyle = fill;
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w/2, y - h/2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y + 0.5);
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  function drawWorldCooldownTag(x, y, text, accent = 'rgba(255,90,122,.96)') {
    if (!text) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 12px system-ui';
    const tw = ctx.measureText(text).width;
    const w = Math.max(52, tw + 16);
    const h = 22;
    ctx.fillStyle = 'rgba(10,14,26,.82)';
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  function drawVentCooldown(x, y, secsLeft) {
    drawStatusTimerBadge(x, y, secsLeft, 'rgba(10,14,26,.82)');
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
    const isGhost = (!!me.down && me.role !== 'teacher' && !st.practice);
    let canInteract = false;
    let canKill = false;
    let killTarget = null;
    let target = null; // { type, id, label, wx, wy }
    let bestD2 = Infinity;

    // interactable (pick the closest target for better UI/label)
    let interactReady = false;
    for (const obj of Object.values(st.objects)) {
      if (!obj || !['meeting_bell', 'mission', 'root_door', 'vent_hole', 'lamp'].includes(obj.type)) continue;
      if (isGhost && obj.type !== 'mission') continue;
      if (obj.type === 'vent_hole' && (me.role !== 'teacher' || st.practice)) continue;
      if (obj.type === 'mission' && me.role === 'teacher' && !st.practice) continue;
      if (obj.type === 'meeting_bell' && me.role === 'teacher' && !st.practice) continue;

      // Lamp rules: teacher can ONLY turn OFF, students can ONLY turn ON
      if (obj.type === 'lamp') {
        const lp = st.lamps && st.lamps[obj.id];
        if (!lp) continue;
        if (me.role === 'teacher' && !lp.on) continue;
        if (me.role !== 'teacher' && lp.on) continue;
      }

      const pt = getObjInteractPoint(obj);
      const ox = pt.x;
      const oy = pt.y;
      const d2 = dist2(me.x, me.y, ox, oy);
      const range = getObjInteractRange(obj);
      const range2 = range ** 2;
      if (d2 > range2) continue;
      canInteract = true;

      const doorPriorityBias = (obj.type === 'root_door') ? (TS * 0.9) ** 2 : 0;
      const weightedD2 = Math.max(0, d2 - doorPriorityBias);
      if (weightedD2 < bestD2) {
        bestD2 = weightedD2;
        let label = '조작';
        let ready = true;
        if (obj.type === 'mission') label = '미션';
        else if (obj.type === 'meeting_bell') {
          const bellCdUntil = Number(st.meetingBellCdUntil || 0);
          if (bellCdUntil > now()) {
            ready = false;
            label = `회의 ${Math.max(1, Math.ceil((bellCdUntil - now()) / 1000))}s`;
          } else {
            label = '회의';
          }
        }
        else if (obj.type === 'vent_hole') label = '땅굴';
        else if (obj.type === 'root_door') {
          const dd = st.doors && st.doors[obj.id];
          label = (dd && dd.closed) ? '열기' : '닫기';
        }
        else if (obj.type === 'lamp') {
          const lp = st.lamps && st.lamps[obj.id];
          label = (lp && lp.on) ? '끄기' : '켜기';
        }
        interactReady = ready;
        target = { type: obj.type, id: obj.id, label, wx: ox, wy: oy, ready };
      }
    }
    // bodies (report)
    if (!isGhost && me.role !== 'teacher') for (const p of Object.values(st.players)) {
      if (!p || !p.down || !p.alive) continue;
      const bx = (p.bodyX != null) ? p.bodyX : p.x;
      const by = (p.bodyY != null) ? p.bodyY : p.y;
      const d2 = dist2(me.x, me.y, bx, by);
      if (d2 <= (INTERACT_RANGE + 10) ** 2) {
        canInteract = true;
        if (d2 < bestD2) {
          bestD2 = d2;
          const reportCdUntil = Number(st.reportMeetingCdUntil || 0);
          const ready = !(reportCdUntil > now());
          const label = ready
            ? '신고'
            : `신고 ${Math.max(1, Math.ceil((reportCdUntil - now()) / 1000))}s`;
          interactReady = ready;
          target = { type: 'body', id: p.id, label, wx: bx, wy: by, ready };
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

    return { canInteract, interactReady: (target ? !!target.ready : false), canKill, target, killTarget };
  }



  // ---------- Client-side prediction (non-host) ----------
  // When I'm not the host, waiting for host snapshots (15~30fps) makes my OWN
  // movement look choppy. Predict locally each frame, then let host snapshots
  // softly correct us (see state handler).
  function clientPredictLocalMove(dt) {
    const net = G.net;
    if (!net || net.isHost) return;
    if (!inPlay()) return;
    const myId = Number(net.myPlayerId || 0);
    if (!myId) return;
    const st = G.state;
    const me = st.players && st.players[myId];
    if (!me || !me.alive) return;
    const canRoamGhost = (!!me.down && me.role !== 'teacher' && !st.practice);
    if (me.down && !canRoamGhost) return;
    if (me.vent || me.venting || (Number(me.ventLockUntil || 0) > now()) || (Number(me.forcePosUntil || 0) > now())) { me.vx = 0; me.vy = 0; return; }

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
    // Ghosts move slightly faster (Among Us feel).
    if (me.down && me.role !== 'teacher' && !st.practice) spd *= 1.22;
    const len = Math.hypot(mvx, mvy);
    const tvx = len > 1e-6 ? (mvx / len) * spd : 0;
    const tvy = len > 1e-6 ? (mvy / len) * spd : 0;
    const a = 1 - Math.exp(-dt * 12);
    me.vx = (me.vx || 0) + (tvx - (me.vx || 0)) * a;
    me.vy = (me.vy || 0) + (tvy - (me.vy || 0)) * a;

    const nx = me.x + me.vx * dt;
    const ny = me.y + me.vy * dt;
    moveWithCollision(me, nx, ny);

    // With client-reported movement relayed by the host, only correct on very large desyncs
    // or special state changes. Small drift should never yank the player backward.
    // 유령(down + non-teacher)은 자유롭게 이동 중이므로 _authX/Y 보정을 완전히 건너뜀.
    const _isRoamGhost = (!!me.down && me.role !== 'teacher' && !G.state.practice);
    if (!_isRoamGhost) {
      try{
        const ax = (typeof me._authX === 'number') ? me._authX : null;
        const ay = (typeof me._authY === 'number') ? me._authY : null;
        if (ax != null && ay != null) {
          const dx = ax - me.x;
          const dy = ay - me.y;
          const dist = Math.hypot(dx, dy);
          const special = (!!(me.vent && typeof me.vent === 'object')) || (!!me.venting);
          // Do not softly pull the local player back during normal movement.
          // Only snap on extreme desyncs or special transitions like death/vent.
          if (dist > 640 || special) {
            me.x = ax; me.y = ay; me.vx = 0; me.vy = 0;
          }
        }
      }catch(_){ }
    }
  }
// ---------- Remote player smoothing (non-host render) ----------
  // Non-host clients receive host snapshots with jitter and variable cadence.
  // We keep a per-player render state, dead-reckon using host velocities, and
  // smooth towards the predicted position each frame.
  function clientUpdateRemoteRender(dt) {
    const net = G.net;
    if (!net) return;
    const rs = G.remoteSmooth;
    if (!rs || !rs.remotes) return;

    // Interpolate slightly *in the past* to hide network jitter (Among Us style).
    const bufferMs = (rs.bufferMs != null ? rs.bufferMs : 160);
    const k = (rs.k || 30);
    const snapDist = (rs.snapDist || (TS * 6));
    const tNow = now();
    const targetT = tNow - bufferMs;

    for (const ex of rs.remotes.values()) {
      if (!ex) continue;
      const samples = ex.samples || (ex.samples = []);
      if (!samples.length) continue;

      // Keep a small window of samples.
      while (samples.length > 12) samples.shift();
      while (samples.length >= 3 && samples[1].t < targetT - 900) samples.shift();

      let px, py;

      const first = samples[0];
      const last = samples[samples.length - 1];

      if (targetT <= first.t) {
        px = first.x; py = first.y;
      } else if (targetT >= last.t) {
        // If we're ahead of the newest sample (rare), lightly dead-reckon.
        const dtSec = clamp((targetT - last.t) / 1000, 0, 0.35);
        px = last.x + (last.vx || 0) * dtSec;
        py = last.y + (last.vy || 0) * dtSec;
      } else {
        // Find two samples around targetT and lerp.
        let s0 = first, s1 = last;
        for (let i = 0; i < samples.length - 1; i++) {
          const a = samples[i], b = samples[i + 1];
          if (a.t <= targetT && targetT <= b.t) { s0 = a; s1 = b; break; }
        }
        const denom = (s1.t - s0.t) || 1;
        const u = clamp((targetT - s0.t) / denom, 0, 1);
        px = s0.x + (s1.x - s0.x) * u;
        py = s0.y + (s1.y - s0.y) * u;
      }

      if (typeof ex.rx !== 'number' || typeof ex.ry !== 'number') {
        ex.rx = px; ex.ry = py;
        continue;
      }

      const dx = px - ex.rx;
      const dy = py - ex.ry;
      const d = Math.hypot(dx, dy);

      // Snap on big error or special states (vents/death/down).
      if (d > snapDist || ex.vent || !ex.alive || ex.down) {
        ex.rx = px; ex.ry = py;
        continue;
      }

      const a = 1 - Math.exp(-dt * k);
      ex.rx += dx * a;
      ex.ry += dy * a;
    }
  }

// ---------- Main loop ----------
  let lastFrame = now();
  function frame() {
    const t = now();
    const dt = Math.min(0.05, (t - lastFrame) / 1000);
    lastFrame = t;

    // Capture host local input *before* simulation so the host's own movement
    // uses the freshest stick/keyboard state this frame.
    try {
      if (G.net && G.net.isHost) {
        const pid0 = Number(G.net.myPlayerId || 0);
        if (pid0) {
          G.host.inputs.set(pid0, {
            mvx: clamp(G.local.mvx || 0, -1, 1),
            mvy: clamp(G.local.mvy || 0, -1, 1),
            at: t,
          });
        }
      }
    } catch (_) {}

    // Host disconnect watchdog (non-host clients): if we stop receiving host packets,
    // reset back to the room instead of getting stuck.
    try {
      if (G.net && !G.net.isHost && G.phase !== 'lobby') {
        const last = (G.net._lastHostSeenAt || 0);
        if (last && (t - last) > 9000 && !(G.ui && (G.ui._hostExitHandled || G.ui._hostGoneHandled))) {
          if (!G.ui) G.ui = {};
          G.ui._hostGoneHandled = true;
          try { showCenterNotice('호스트 이탈로 게임이 종료되었습니다.', 1500); } catch (_) {}
          setTimeout(() => { try { leaveRoom(); } catch (_) {} }, 1500);
        }
      }
    } catch (_) {}

    // host sim
    if (G.net?.isHost && G.host.started) {
      if (G.phase === 'meeting' && now() >= G.host.meetingEndsAt) {
        hostResolveMeeting();
        // scene 유지 3초 후 play (또는 선생 추방 시 크루 즉시 승리)
        setTimeout(() => {
          if (G.net?.isHost && G.phase === 'scene') {
            // 선생토끼가 추방(alive=false)됐으면 크루 승리로 즉시 종료
            const _st = G.state;
            if (_st && _st.teacherId) {
              const _teacher = _st.players && _st.players[_st.teacherId];
              if (_teacher && !_teacher.alive) {
                _st.winner = 'crew';
                G.phase = 'end';
                try { broadcastState(true); } catch (_) {}
                try { scheduleMatchEndReturn(); } catch (_) {}
                return;
              }
            }
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
      // 스냅샷 (네트워크 트래픽 최적화)
// - 33ms마다: 플레이어 이동만(가벼운 패킷) 전송
// - 180ms마다: 전체 상태(미션/문/시간 등) 스냅샷 전송
      if (!G.host._lastPlayersBroadcast) G.host._lastPlayersBroadcast = 0;
      if (t - G.host._lastPlayersBroadcast > 25) {
        G.host._lastPlayersBroadcast = t;
        broadcastPlayers();
      }

      if (!G.host._lastStateBroadcast) G.host._lastStateBroadcast = 0;
      if (t - G.host._lastStateBroadcast > 180) {
        G.host._lastStateBroadcast = t;
        broadcastState();
      }

      // Also broadcast a lightweight roster occasionally during play.
      // This lets clients who missed joinAck/state bind their playerId reliably (common on slow iframe loads).
      if (!G.host._lastRosterInPlay) G.host._lastRosterInPlay = 0;
      if (t - G.host._lastRosterInPlay > 900) {
        G.host._lastRosterInPlay = t;
        try{ broadcastRoster(); }catch(_){ }
      }
    }

    // host lobby: broadcast a small roster snapshot periodically so guests who miss joinAck/state
    // can still bind their playerId and render everyone reliably.
    if (G.net?.isHost && !G.host.started) {
      if (!G.host._lastRosterBroadcast) G.host._lastRosterBroadcast = 0;
      if (t - G.host._lastRosterBroadcast > 250) {
        G.host._lastRosterBroadcast = t;
        try{ broadcastRoster(); }catch(_){ }
      }
    }

    // predict my movement locally before packaging the pose we send to the host.
    // Sending the pre-prediction pose made the host relay a slightly older position,
    // which looked like "go forward, then get pulled back" on both host and guest screens.
    try { clientPredictLocalMove(dt); } catch (_) {}

    // client input send
    if (G.net && inPlay()) {
      // If I'm the host, apply my input locally (do NOT rely on server echo)
      // so solo/practice play always responds.
      const pid = Number(G.net.myPlayerId || 0);
      if (G.net.isHost && pid){
        // Host input is already captured at the top of the frame before hostTick().
      } else {
        // Always send movement intent using joinToken as fallback.
        // This fixes: "방장 외 이동이 안 됨" when joinAck was dropped and the client
        // never bound myPlayerId (pid=0). The host can resolve pid via joinToken.
        if (!G.local._lastInputAt) G.local._lastInputAt = 0;
        if (t - G.local._lastInputAt > 16) {
          G.local._lastInputAt = t;
          const jt = G.net.joinToken || null;
          const meNow = G.state && G.state.players ? G.state.players[pid] : null;
          if (!G.local._moveSeq) G.local._moveSeq = 0;
          G.local._moveSeq += 1;
          // Hybrid: movement is effectively client-driven, but the host still relays the latest
          // reported pose so every client converges to the same visible result.
          G.net.post({
            t: 'moveIntent',
            playerId: pid || 0,
            joinToken: jt,
            seq: G.local._moveSeq,
            sentAt: t,
            mvx: G.local.mvx,
            mvy: G.local.mvy,
            px: meNow ? meNow.x : undefined,
            py: meNow ? meNow.y : undefined,
            pvx: meNow ? meNow.vx : undefined,
            pvy: meNow ? meNow.vy : undefined,
            dir: meNow ? meNow.dir : undefined,
            facing: meNow ? meNow.facing : undefined,
          });
        }
        // Best-effort: if we still haven't bound our id, occasionally request a resync.
        if (!pid) {
          if (!G.local._needPidAt) G.local._needPidAt = 0;
          if (t - G.local._needPidAt > 900) {
            G.local._needPidAt = t;
            try{ requestHostSync('needPlayerId'); }catch(_){ }
          }
        }
      }
    }

    // smooth remote players (non-host) every frame
    try { clientUpdateRemoteRender(dt); } catch (_) {}

    // graph penalty: reopen mission UI after lock ends (if player stayed near)
    if (G.ui.reopenMission && !G.ui.mission && G.net && G.net.myPlayerId) {
      const rm = G.ui.reopenMission;
      if (now() >= rm.at && now() >= (G.host.missionDisabledUntil || 0)) {
        const st = G.state;
        const me = st.players[G.net.myPlayerId];
        const obj = st.objects && st.objects[rm.siteId];
        if (me && obj && obj.type === 'mission') {
          const pt = getObjInteractPoint(obj);
          const ox = pt.x;
          const oy = pt.y;
          if (dist2(me.x, me.y, ox, oy) <= INTERACT_RANGE ** 2) {
            G.net.post({ t: 'openMission', playerId: Number(G.net.myPlayerId || 0), joinToken: G.net.joinToken || null, siteId: rm.siteId });
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
    requestAnimationFrame(frame);
  }

  // ---------- Join flow ----------
  async function joinRoom() {
    if (!G.assetsReady) { showToast('에셋 로딩이 필요해요'); applyPhaseUI(); return; }
    const nick = (nickEl.value || '토끼').trim().slice(0, 10);
    const room = (roomEl.value || '1234').trim().slice(0, 256);

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

    // Embed fallback: if clients are stuck in lobby (host didn't auto-start),
    // allow any client to request the host to start.
    net.on('embedStart', (_m) => {
      try{
        if (!net.isHost) return;
        if (G.host.started) return;
        _embedHostStartNow().catch(()=>{});
      }catch(_){ }
    });
    // Snapshot resync (clients -> host): used in embed mode when the first roster/state broadcasts
    // can be missed during iframe boot. Host responds by broadcasting fresh snapshots.
    net.on('syncReq', (m) => {
      try{
        if (!net.isHost) return;
        const tNow = now();
        if (!G.host) G.host = {};
        // throttle to avoid spam if multiple clients request at once
        if (G.host._lastSyncReqAt && (tNow - G.host._lastSyncReqAt) < 180) return;
        G.host._lastSyncReqAt = tNow;
        try{ broadcastRoster(true); }catch(_){ }
        try{ broadcastState(true); }catch(_){ }
      }catch(_){ }
    });



    // join
    net.on('join', (m) => {
      if (!net.isHost) return;
      const st = G.state;
	    const sid = (m && m.sessionId != null) ? String(m.sessionId) : '';
      // Robust sender identity: some relays rewrite/strip `from`, but we also carry `cid`.
      const from = (m && (m.cid != null || m.from != null || m.clientId != null || m.sessionId != null))
        ? String(m.cid ?? m.from ?? m.clientId ?? m.sessionId)
        : '';
      const rawClientId = (m && m.clientId != null) ? String(m.clientId) : '';
      if (!G.host._clientToPlayer) G.host._clientToPlayer = new Map();
	    if (!G.host._sidToPlayer) G.host._sidToPlayer = new Map();

      // Dedupe joins using a per-join token (NOT clientId), because embed sessionId can be shared
      // across iframes. Clients retry join until joinAck arrives, reusing the same joinToken.
      if (!G.host._joinTokenToPlayer) G.host._joinTokenToPlayer = new Map();
      const jt = (m && m.joinToken != null) ? String(m.joinToken) : '';
      if (jt && G.host._joinTokenToPlayer.has(jt)) {
        const pid = Number(G.host._joinTokenToPlayer.get(jt) || 0);
        const p = st.players[pid];
        if (p) {
          p.nick = (m.nick || p.nick || '토끼').trim().slice(0, 10);
          p.clientId = rawClientId || from || p.clientId || null;
	        p.sessionId = sid || p.sessionId || null;
          p.joinToken = jt || p.joinToken || null;
          p.isBot = false;
          p.alive = true;
          p.lastSeen = now();
        }
        // refresh routing maps
        try{
          if (jt) G.host._joinTokenToPlayer.set(jt, pid);
	        if (sid) G.host._sidToPlayer.set(sid, pid);
          if (from) G.host._clientToPlayer.set(from, pid);
          if (rawClientId) G.host._clientToPlayer.set(rawClientId, pid);
        }catch(_){ }
        net.post({ t: 'joinAck', toCid: from || null, toClient: from || null, playerId: pid, isHost: false, joinToken: jt });
        broadcastState(true);
        try{ broadcastRoster(true); }catch(_){ }
        return;
      }

      const playersCount = Object.values(st.players).filter(p => !p.isBot).length;
      if (playersCount >= 8) {
        net.post({ t: 'joinDenied', toCid: from || null, toClient: from || null, reason: '방이 가득 찼어!', joinToken: jt });
        return;
      }
	    const pid = hostAddPlayer(m.nick || '토끼', false, rawClientId || from || null);
	    try{
	      const p = G.state.players && G.state.players[pid];
	      if (p) {
	        p.lastSeen = now();
	        p.joinToken = jt || p.joinToken || null;
	        p.sessionId = sid || p.sessionId || null;
	      }
	    }catch(_){ }
      if (jt) G.host._joinTokenToPlayer.set(jt, pid);
	    if (sid) G.host._sidToPlayer.set(sid, pid);
      if (from) G.host._clientToPlayer.set(from, pid);
      if (rawClientId) G.host._clientToPlayer.set(rawClientId, pid);
      net.post({ t: 'joinAck', toCid: from || null, toClient: from || null, playerId: pid, isHost: false, joinToken: jt });
      broadcastState(true);
      try{ broadcastRoster(true); }catch(_){ }

      // If we started in practice (e.g., embed auto-start) and now have enough players,
      // switch to the real game by assigning a teacher and notifying roles.
      const humanCountNow = Object.values(st.players).filter(p => !p.isBot).length;
      if (G.host.started && st.practice && humanCountNow >= 4) {
        st.practice = false;
        st.timeLeft = 180;
        st.maxTime = 180;
        st.infiniteMissions = !st.practice;
        hostAssignTeacher();
        for (const pp of Object.values(st.players)) {
          sendToPlayer(pp.id, { t: 'toast', text: (pp.role === 'teacher') ? '당신은 선생토끼야! (술래)' : '당신은 학생토끼야! 미션을 해결해!' });
          // Refresh role reveal for everyone on conversion.
          sendToPlayer(pp.id, { t: 'uiRoleReveal', role: pp.role, practice: false });
        }
        broadcast({ t: 'toast', text: '인원이 모여서 본게임으로 전환! (선생토끼 배정)' });
        broadcastState(true);
      }
    });

    net.on('joinAck', (m) => {
      // Robust routing: different relays may address clients by per-iframe clientId OR by sessionId.
      const myCid = String(net.clientId || '');
      const mySid = (net.sessionId != null) ? String(net.sessionId) : '';

      // If joinToken is present, enforce it first (strongest signal).
      const hasToken = (m.joinToken != null && String(m.joinToken) !== '');
      if (hasToken && net.joinToken && String(m.joinToken) !== String(net.joinToken)) return;
      const tokenOk = (hasToken && net.joinToken && String(m.joinToken) === String(net.joinToken));

      // If token matches, accept even if routing fields are rewritten by the room shell.
      if (!tokenOk) {
        // Prefer `toCid` routing when available; fall back to legacy `toClient`.
        if (m.toCid != null) {
          const to = String(m.toCid);
          if (to !== myCid && (!mySid || to !== mySid)) return;
        } else if (m.toClient != null) {
          const to = String(m.toClient);
          if (to !== myCid && (!mySid || to !== mySid)) return;
        } else {
          // If ack doesn't include routing OR joinToken, it's ambiguous -> ignore and recover from `state`.
          return;
        }
      }

      net.myPlayerId = Number(m.playerId || 0);

      // heartbeat (client -> host)
      try{
        if (!net.isHost) {
          if (net._hb) { clearInterval(net._hb); net._hb = null; }
          net._hbPid = Number(net.myPlayerId || 0);
          net._hb = setInterval(()=>{
            try{ net.post({ t: 'ping', playerId: Number(net.myPlayerId || 0), joinToken: net.joinToken || null }); }catch(_){ }
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
      const myCid = String(net.clientId || '');
      const mySid = (net.sessionId != null) ? String(net.sessionId) : '';

      const hasToken = (m.joinToken != null && String(m.joinToken) !== '');
      if (hasToken && net.joinToken && String(m.joinToken) !== String(net.joinToken)) return;
      const tokenOk = (hasToken && net.joinToken && String(m.joinToken) === String(net.joinToken));

      if (!tokenOk) {
        if (m.toCid != null) {
          const to = String(m.toCid);
          if (to !== myCid && (!mySid || to !== mySid)) return;
        } else if (m.toClient != null) {
          const to = String(m.toClient);
          if (to !== myCid && (!mySid || to !== mySid)) return;
        } else {
          return;
        }
      }

      showToast(m.reason || '참가 실패');
      try{ if (net._hb) { clearInterval(net._hb); net._hb = null; } net._hbPid = 0; }catch(_){}
      net.close();
      G.net = null;
    });

    // leave/disconnect (host)
    net.on('leave', (m) => {
      if (!net.isHost) return;
      const pid = resolvePlayerIdFromMsg(m);
      if (pid) hostRemovePlayer(pid, m.reason || 'left');
    });

    // heartbeat ping (host): keep lastSeen fresh even if player is idle
    net.on('ping', (m) => {
      if (!net.isHost) return;
      const pid = resolvePlayerIdFromMsg(m);
      if (!pid) return;
      const p = G.state.players && G.state.players[pid];
      if (p) p.lastSeen = now();
    });

    // inputs (host)
    net.on('input', (m) => {
      if (!net.isHost) return;
      hostRecordMoveIntent(m);
    });

    // movement intent (host) - preferred over legacy 'input'
    net.on('moveIntent', (m) => {
      if (!net.isHost) return;
      hostRecordMoveIntent(m);
    });

    net.on('emote', (m) => {
      if (!net.isHost) return;
      const pid = resolvePlayerIdFromMsg(m);
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
      const pid = resolvePlayerIdFromMsg(m);
      if (!pid) return;
      if (m.kind === 'interact') hostHandleInteract(pid);
      if (m.kind === 'kill') hostHandleKill(pid);
      if (m.kind === 'sabotage') hostHandleSabotage(pid);
      if (m.kind === 'forceMission') hostHandleForceMission(pid);
    });
    net.on('openMission', (m) => {
      if (!net.isHost) return;
      const st = G.state;
      const pid = resolvePlayerIdFromMsg(m);
      const p = st.players[pid];
      if (!p || !p.alive) return;
      const isGhost = (!!p.down && p.role !== 'teacher');
      if (p.down && !isGhost) return;
      const obj = st.objects[m.siteId];
      if (!obj || obj.type !== 'mission') return;
      const pt = getObjInteractPoint(obj);
      const ox = pt.x;
      const oy = pt.y;
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
      // Mission concurrency lock (site-specific)
      if (mm.inUseBy && Number(mm.inUseBy) !== Number(pid) && now() < (mm.inUseUntil || 0)) {
        sendToPlayer(pid, { t: 'toast', text: '이미 미션 수행중입니다.' });
        return;
      }
      mm.inUseBy = Number(pid);
      mm.inUseUntil = now() + 45000;
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
      const pid = resolvePlayerIdFromMsg(m);
      if (!pid) return;
      hostMissionSubmit(pid, { ...m, playerId: pid });
    });

    net.on('missionClose', (m) => {
      if (!net.isHost) return;
      const pid = resolvePlayerIdFromMsg(m);
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
      // Release mission lock when UI closes.
      if (mm && Number(mm.inUseBy) === Number(pid)) { mm.inUseBy = 0; mm.inUseUntil = 0; }
      // clear mission marker
      p.missionSiteId = null;
      p.missionStage = 0;
      p.missionClearAt = 0;
      broadcastState(true);
    });

    net.on('vote', (m) => {
      if (!net.isHost) return;
      const pid = resolvePlayerIdFromMsg(m);
      if (!pid) return;
      hostSubmitVote(pid, m.target);
    });

    // state (all clients)
    net.on('state', (m) => {
      // Host already owns the authoritative simulation. Re-applying echoed network
      // snapshots on the host can reintroduce older positions into the live state and
      // make the host's own movement feel choppy/sticky. Ignore echoed state on host.
      if (net.isHost) return;
      try { net._lastHostSeenAt = now(); } catch (_) {}
      G.phase = m.phase;
      if (typeof m.started !== 'undefined') G.state.started = !!m.started;
      // Embed: hide the HTML boot loading overlay as soon as the match is running.
      try{
        if (EMBED) {
          if (!G.ui) G.ui = {};
          if (!G.ui._bootHidden && (G.phase !== 'lobby')) {
            bootHide();
            G.ui._bootHidden = true;
          }
        }
      }catch(_){ }
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
          const lastInpAt = (G.local && G.local._lastInputAt) ? G.local._lastInputAt : 0;
          const movingNow = (Math.hypot((G.local&&G.local.mvx)||0, (G.local&&G.local.mvy)||0) > 0.08);
          const recentlyMoving = movingNow || ((now() - lastInpAt) < 320);
          const tNow2 = now();
          const ventLockedRemote2 = (Number(inc.ventLockUntil || 0) > tNow2) || (Number(inc.forcePosUntil || 0) > tNow2);
          // 유령(down + non-teacher)은 서버 위치로 hard snap 하지 않는다
          const isRoamingGhost2 = (!!inc.down && inc.role !== 'teacher' && !G.state.practice);
          const hard = !isRoamingGhost2 && (
            (err > 420) || (!!inc.down !== !!prev.down) || (!!inc.alive !== !!prev.alive) || (!!inc.vent) || (!!prev.vent)
          );

          // copy authoritative fields but keep predicted position unless we must hard snap
          for (const [k, v] of Object.entries(inc)) {
            if (k === 'x' || k === 'y' || k === 'vx' || k === 'vy') continue;
            prev[k] = v;
          }
          // _ventAnim: 새 vent 시작이면 설정, 끝났으면 유지하되 animEnd 이후 제거
          if (inc.vent && inc.ventStart) {
            if (!prev._ventAnim || prev._ventAnim.start !== inc.ventStart) {
              prev._ventAnim = { start: Number(inc.ventStart), animEnd: Number(inc.ventAnimEnd || (inc.ventStart + 1000)), toX: Number(inc.ventToX || 0), toY: Number(inc.ventToY || 0) };
            }
          } else if (!inc.vent) {
            if (prev._ventAnim && tNow2 > (prev._ventAnim.animEnd || 0)) prev._ventAnim = null;
          }

          // For the local player, avoid feeding every host snapshot back into movement.
          // That feedback loop was the main source of visible pull-back / rubber-banding.
          // Keep authoritative positions only for major state transitions.
          if (ventLockedRemote2 && !isRoamingGhost2) {
            // 땅굴 잠금 중: 입력 차단
            try {
              G.local.mvx = 0; G.local.mvy = 0;
              G.local.touch = null;
              G.local._lastInputAt = tNow2;
            } catch (_) {}
            // 애니메이션 타이밍에 맞춰 위치 결정
            // HIDDEN_END(55%) 이전: 출발지(현재 위치) 유지
            // HIDDEN_END 이후: 목적지(forcePosX/Y)로 snap
            const _va = prev._ventAnim;
            if (_va) {
              const _total = Math.max(1, _va.animEnd - _va.start);
              const _t01 = clamp((tNow2 - _va.start) / _total, 0, 1);
              if (_t01 >= 0.55) {
                const fpx = typeof inc.forcePosX === 'number' ? inc.forcePosX : null;
                const fpy = typeof inc.forcePosY === 'number' ? inc.forcePosY : null;
                if (fpx != null && fpy != null) {
                  prev.x = fpx; prev.y = fpy; prev.vx = 0; prev.vy = 0;
                  prev._authX = fpx; prev._authY = fpy; prev._authAt = tNow2;
                }
              }
              // t01 < 0.55 구간은 현재 위치 유지 (출발지에서 사라지는 중)
            } else {
              // _ventAnim 없으면 기존 방식으로 fallback
              const fpx = typeof inc.forcePosX === 'number' ? inc.forcePosX : null;
              const fpy = typeof inc.forcePosY === 'number' ? inc.forcePosY : null;
              if (fpx != null && fpy != null) {
                prev.x = fpx; prev.y = fpy; prev.vx = 0; prev.vy = 0;
                prev._authX = fpx; prev._authY = fpy; prev._authAt = tNow2;
              }
            }
          } else if (hard) {
            prev._authX = inc.x;
            prev._authY = inc.y;
            prev._authAt = tNow2;
            prev.x = inc.x;
            prev.y = inc.y;
            prev.vx = inc.vx || 0;
            prev.vy = inc.vy || 0;
          } else if (!isRoamingGhost2) {
            // 일반: _auth만 업데이트 (clientPredictLocalMove에서 부드럽게 보정)
            prev._authX = inc.x;
            prev._authY = inc.y;
            prev._authAt = tNow2;
          }
          // 유령은 _auth 업데이트 안 함 (snap 트리거 방지)

          incomingPlayers[myPid] = prev;
        } else {
          // snapshot missed me: keep previous local copy
          incomingPlayers[myPid] = prev;
        }
      }
      // _ventAnim 보존: state 통째 교체 시 기존 클라이언트 애니메이션 상태가 날아가지 않도록
      try {
        const _tNow = now();
        for (const [pidStr, pp] of Object.entries(G.state.players || {})) {
          if (!pp || !pp._ventAnim) continue;
          const inc2 = incomingPlayers[pidStr];
          if (inc2 && !inc2._ventAnim) {
            // animEnd가 아직 안 지났으면 보존
            if (_tNow < (pp._ventAnim.animEnd || 0)) {
              inc2._ventAnim = pp._ventAnim;
            }
          }
        }
      } catch (_) {}
      G.state.players = incomingPlayers;

      // Robustly recover / validate myPlayerId from authoritative state.
      // (In some embed relays, joinAck can be dropped or routed inconsistently.)
      try{
        if (!net.isHost && m.players) {
          const playersObj = m.players || {};
          const cur = Number(net.myPlayerId || 0);
          const curObj = cur ? playersObj[String(cur)] : null;

          // If we don't have a valid id yet (or it disappeared), resolve it.
          let need = (!cur) || !curObj;

          // Also re-resolve if current id clearly belongs to someone else.
          if (!need && curObj) {
            if (net.joinToken && curObj.joinToken && String(curObj.joinToken) !== String(net.joinToken)) need = true;
            else if (curObj.clientId && String(curObj.clientId) !== String(net.clientId)) {
              // clientId mismatch can happen after reconnects; try to rebind.
              need = true;
            }
          }

          if (need) {
            let found = 0;
            // 1) Prefer joinToken match (works even if clientId is shared)
            if (net.joinToken) {
              for (const [pid, pp] of Object.entries(playersObj)) {
                if (pp && pp.joinToken && String(pp.joinToken) === String(net.joinToken)) { found = Number(pid||0); break; }
              }
            }
            // 2) Fallback to clientId match
            if (!found) {
              for (const [pid, pp] of Object.entries(playersObj)) {
                if (pp && pp.clientId && String(pp.clientId) === String(net.clientId)) { found = Number(pid||0); break; }
              }
            }
            if (found) net.myPlayerId = found;
          }
        }
      }catch(_){ }

      // If joinAck was dropped (common in embed relays), start heartbeat as soon as
      // we can bind `myPlayerId` from authoritative state, so the host doesn't prune us.
      try{
        if (!net.isHost) {
          const pid = Number(net.myPlayerId || 0);
          if (pid) {
            if (net._hb && net._hbPid !== pid) { try{ clearInterval(net._hb); }catch(_){} net._hb = null; }
            if (!net._hb) {
              net._hbPid = pid;
              net._hb = setInterval(()=>{
                try{ net.post({ t: 'ping', playerId: Number(net.myPlayerId || 0), joinToken: net.joinToken || null }); }catch(_){ }
              }, 1000);
            }
            // stop join retry loop once bound
            if (net._joinRetry) { try{ clearInterval(net._joinRetry); }catch(_){} net._joinRetry = null; }
            try{ stopHostSyncRetry(net); }catch(_){ }

          }
        }
      }catch(_){ }
      

      // Smooth remote players on clients so other players look less 'choppy'.
      try{
        if (!net.isHost) {
          if (!G.remoteSmooth) G.remoteSmooth = { remotes: new Map(), bufferMs: 110, k: 16, snapDist: TS * 7 };
          const sm = G.remoteSmooth.remotes;
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

            let ex = sm.get(pid);
            if (!ex) {
              ex = { rx: pp.x, ry: pp.y, samples: [{ t: tNow, x: pp.x, y: pp.y, vx: pp.vx || 0, vy: pp.vy || 0 }], alive: !!pp.alive, down: !!pp.down, vent: !!pp.vent };
              sm.set(pid, ex);
              continue;
            }

            const special = (!!pp.down !== !!ex.down) || (!!pp.alive !== !!ex.alive) || (!!pp.vent !== !!ex.vent);
            ex.alive = !!pp.alive;
            ex.down = !!pp.down;
            ex.vent = !!pp.vent;

            if (!ex.samples) ex.samples = [];
            ex.samples.push({ t: tNow, x: pp.x, y: pp.y, vx: pp.vx || 0, vy: pp.vy || 0 });
            if (ex.samples.length > 12) ex.samples.shift();
            if (special) { ex.rx = pp.x; ex.ry = pp.y; ex.samples = [{ t: tNow, x: pp.x, y: pp.y, vx: pp.vx || 0, vy: pp.vy || 0 }]; }
          }
        }
      }catch(_){}
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

      if (inPlay()) {
        meetingModal.classList.remove('show');
        sceneModal.classList.remove('show');
        stopSceneAnim();
      }

      if (G.phase === 'end' && G.state.winner) {
        // end: if we are embedded in multiroom, auto-return to the room (late joiners too)
        try { scheduleMatchEndReturn(); } catch (_) {}
      }

      // 호스트 권한 UI
      startBtn.disabled = !(net.isHost && Object.keys(G.state.players).length >= 1 && !G.host.started);
      if (net.isHost && !G.host.started) {
        const n = Object.keys(G.state.players).length;
        const exp = Number(window.__EMBED_EXPECTED_HUMANS__ || 0) || 0;
        const desiredPractice = (typeof window.__EMBED_PRACTICE__ === 'boolean')
          ? !!window.__EMBED_PRACTICE__
          : ((exp > 0) ? (exp < 4) : (n < 4));
        const willPractice = desiredPractice && n < 4;
        startBtn.textContent = willPractice
          ? `연습 시작 (현재 ${n}명)`
          : (`게임 시작 (호스트)` + (exp > 0 ? ` / 목표 ${exp}명` : ''));
      }

    

      applyPhaseUI();
    });


    // Lightweight roster snapshots (sent in lobby and on join/leave). Helps clients bind even if joinAck/state is missed.
    net.on('roster', (m) => {
      try { net._lastHostSeenAt = now(); } catch (_) {}
      if (net.isHost) return;
      const st = G.state;
      if (!st.players) st.players = {};
      try{
        if (m && typeof m.phase === 'string') G.phase = m.phase;
        if (m && typeof m.started !== 'undefined') st.started = !!m.started;
        // Embed: once we learn the match is running (from lightweight roster), hide boot overlay.
        try{
          if (EMBED) {
            if (!G.ui) G.ui = {};
            if (!G.ui._bootHidden && (G.phase !== 'lobby')) {
              bootHide();
              G.ui._bootHidden = true;
            }
          }
        }catch(_){ }
        if (m && typeof m.practice === 'boolean') st.practice = !!m.practice;
        if (m && m.teacherId != null) st.teacherId = m.teacherId;
      }catch(_){ }

      const players = (m && m.players) ? m.players : {};
      const tNow = now();

      for (const [pidStr, up] of Object.entries(players || {})) {
        if (!up) continue;
        const pid = Number(pidStr || up.id || 0);
        if (!pid) continue;
        let p = st.players[String(pid)];
        if (!p) {
          p = st.players[String(pid)] = { id: pid };
        }
        p.id = pid;
        if (up.nick != null) p.nick = String(up.nick || '토끼').slice(0, 10);
        if (up.color != null) p.color = up.color;
        if (up.role != null) p.role = up.role;
        if (typeof up.alive === 'boolean') p.alive = !!up.alive;
        if (typeof up.down === 'boolean') p.down = !!up.down;
        if (typeof up.isBot === 'boolean') p.isBot = !!up.isBot;
        if (up.clientId != null) p.clientId = String(up.clientId);
        if (up.joinToken != null) p.joinToken = up.joinToken;
        const rosterMyId = Number(net.myPlayerId || 0);
        const rosterIsMe = (rosterMyId && pid === rosterMyId);
        const rosterInPlay = (effectivePhase() === 'play');
        if (!(rosterIsMe && rosterInPlay)) {
          if (typeof up.x === 'number') p.x = up.x;
          if (typeof up.y === 'number') p.y = up.y;
          if (typeof up.vx === 'number') p.vx = up.vx;
          if (typeof up.vy === 'number') p.vy = up.vy;
        }
        if (typeof up.facing === 'number') p.facing = up.facing;
        if (typeof up.dir === 'number') p.dir = up.dir;
        p.venting = !!up.vent;
        p._pAt = tNow;
      }

      // prune missing players (best-effort)
      try{
        const graceMs = 2000;
        for (const [pidStr, pp] of Object.entries(st.players || {})) {
          if (!pp) continue;
          if (players[pidStr]) continue;
          const last = (typeof pp._pAt === 'number') ? pp._pAt : 0;
          if (last && (tNow - last) > graceMs) {
            delete st.players[pidStr];
          }
        }
      }catch(_){ }

      // Bind my playerId if joinAck/state was missed (roster is lighter and often arrives first).
      try{
        const jt = net.joinToken || null;
        const cid = net.clientId || null;

        const cur = Number(net.myPlayerId || 0);
        const curObj = cur ? (st.players && st.players[String(cur)]) : null;
        let need = (!cur || !curObj);

        // If we already think we have an id but the token doesn't match, re-bind.
        try{
          if (!need && jt && curObj && curObj.joinToken && String(curObj.joinToken) !== String(jt)) need = true;
        }catch(_){ }

        if (need && (jt || cid)) {
          let found = 0;

          // 1) Prefer joinToken match
          if (jt) {
            for (const pp of Object.values(st.players || {})) {
              if (!pp) continue;
              if (pp.joinToken && String(pp.joinToken) === String(jt)) { found = Number(pp.id || 0); break; }
            }
          }
          // 2) Fallback to clientId match
          if (!found && cid) {
            for (const pp of Object.values(st.players || {})) {
              if (!pp) continue;
              if (pp.clientId && String(pp.clientId) === String(cid)) { found = Number(pp.id || 0); break; }
            }
          }

          if (found) {
            net.myPlayerId = found;

            // Start heartbeat (client -> host) just like joinAck/state handler.
            try{
              if (!net.isHost) {
                if (net._hb) { clearInterval(net._hb); net._hb = null; }
                net._hbPid = Number(net.myPlayerId || 0);
                net._hb = setInterval(()=>{
                  try{ net.post({ t: 'ping', playerId: Number(net.myPlayerId || 0), joinToken: net.joinToken || null }); }catch(_){ }
                }, 1000);
              }
            }catch(_){ }

            // Stop join retry loop (if running).
            try{ if (net._joinRetry) { clearInterval(net._joinRetry); net._joinRetry = null; } }catch(_){ }
            try{ stopHostSyncRetry(net); }catch(_){ }

          }
        }
      }catch(_){ }

      applyPhaseUI();
    });



    // Fast player-motion updates (lighter than full state). Used for smooth remote movement.
    // Host sends this frequently; non-host clients use it to render other players smoothly and to
    // quickly reflect joins/leaves even if a full `state` snapshot is delayed.
    net.on('p', (m) => {
      try { net._lastHostSeenAt = now(); } catch (_) {}
      if (net.isHost) return;

      const players = (m && m.players) ? m.players : {};
      const st = G.state;
      if (!st.players) st.players = {};

      // Keep a render buffer for other players.
      try{
        if (!G.remoteSmooth) G.remoteSmooth = { remotes: new Map(), bufferMs: 110, k: 16, snapDist: TS * 7 };
      }catch(_){ }

      const tNow = now();
      const myPidNum = (net.myPlayerId) ? Number(net.myPlayerId || 0) : 0;
      const myPidStr = myPidNum ? String(myPidNum) : null;

      // Apply motion snapshots (create placeholders if needed).
      for (const [pidStr, up] of Object.entries(players || {})) {
        if (!up) continue;
        const pid = Number(pidStr || 0);
        if (!pid) continue;

        // Update local state copy (so UI logic like "근처 플레이어"도 최신에 가깝게 유지)
        let p = st.players[pidStr];
        if (!p) {
          // Create a minimal placeholder; full snapshot will fill the rest.
          p = st.players[pidStr] = {
            id: pid, nick: '토끼', alive: true, down: false,
            x: up.x||0, y: up.y||0, vx: up.vx||0, vy: up.vy||0,
            facing: up.facing||1, dir: up.dir||0
          };
        }

        // Mark freshness for leave pruning.
        p._pAt = tNow;

        // For myself: treat as soft correction target
        if (myPidStr && pidStr === myPidStr) {
          const dx = (up.x || 0) - (p.x || 0);
          const dy = (up.y || 0) - (p.y || 0);
          const err = Math.hypot(dx, dy);
          const lastInpAt = (G.local && G.local._lastInputAt) ? G.local._lastInputAt : 0;
          const movingNow = (Math.hypot((G.local&&G.local.mvx)||0, (G.local&&G.local.mvy)||0) > 0.08);
          const recentlyMoving = movingNow || ((tNow - lastInpAt) < 320);
          const ventLockedRemote = (Number(up.ventLockUntil || 0) > tNow) || (Number(up.forcePosUntil || 0) > tNow);
          // 유령(down + non-teacher)은 서버 위치로 강제 snap하지 않는다.
          // 클라이언트가 자유롭게 이동하는 중이기 때문.
          const isRoamingGhost = (!!up.down && up.role !== 'teacher' && !G.state.practice);
          const hard = !isRoamingGhost && (
            (err > 420) || (!!up.down !== !!p.down) || (!!up.alive !== !!p.alive) || (!!up.vent) || (!!p.venting)
          );

          // Same rule as full state snapshots: don't continuously feed my rendered
          // host position back into movement unless the divergence is truly huge.

          // Copy non-pos fields
          if (typeof up.alive === 'boolean') p.alive = !!up.alive;
          if (typeof up.down === 'boolean') p.down = !!up.down;
          p.venting = !!up.vent;
          if (typeof up.ventLockUntil === 'number') p.ventLockUntil = up.ventLockUntil;
          if (typeof up.forcePosUntil === 'number') p.forcePosUntil = up.forcePosUntil;
          if (typeof up.forcePosX === 'number') p.forcePosX = up.forcePosX;
          if (typeof up.forcePosY === 'number') p.forcePosY = up.forcePosY;
          if (up.emoteKind != null) p.emoteKind = up.emoteKind;
          if (typeof up.emoteUntil === 'number') p.emoteUntil = up.emoteUntil;
          if (up.missionSiteId != null) p.missionSiteId = up.missionSiteId;
          if (typeof up.missionStage === 'number') p.missionStage = up.missionStage;
          // vent 애니메이션 타이밍 저장
          if (up.vent && up.ventStart) {
            if (!p._ventAnim || p._ventAnim.start !== up.ventStart) {
              p._ventAnim = { start: Number(up.ventStart), animEnd: Number(up.ventAnimEnd || (up.ventStart + 1000)), toX: Number(up.ventToX || 0), toY: Number(up.ventToY || 0) };
            }
          } else if (!up.vent) {
            // vent가 끝났어도 animEnd까지는 _ventAnim 유지 (fade-in 재생 중)
            if (p._ventAnim && tNow > (p._ventAnim.animEnd || 0)) p._ventAnim = null;
          }
          if (ventLockedRemote) {
            // 땅굴 잠금 중: 입력을 막고 애니메이션 타이밍에 맞춰 위치 결정
            try {
              G.local.mvx = 0; G.local.mvy = 0;
              G.local.touch = null;
              G.local._lastInputAt = tNow;
            } catch (_) {}
            const _va2 = p._ventAnim;
            if (_va2) {
              const _total2 = Math.max(1, _va2.animEnd - _va2.start);
              const _t012 = clamp((tNow - _va2.start) / _total2, 0, 1);
              if (_t012 >= 0.55) {
                const fpx = typeof up.forcePosX === 'number' ? up.forcePosX : null;
                const fpy = typeof up.forcePosY === 'number' ? up.forcePosY : null;
                if (fpx != null && fpy != null) {
                  p.x = fpx; p.y = fpy; p.vx = 0; p.vy = 0;
                  p._authX = fpx; p._authY = fpy; p._authAt = tNow;
                }
              }
            } else {
              const fpx = typeof up.forcePosX === 'number' ? up.forcePosX : null;
              const fpy = typeof up.forcePosY === 'number' ? up.forcePosY : null;
              if (fpx != null && fpy != null) {
                p.x = fpx; p.y = fpy; p.vx = 0; p.vy = 0;
                p._authX = fpx; p._authY = fpy; p._authAt = tNow;
              }
            }
            // forcePosX/Y가 없으면 현재 위치 유지 (튀지 않도록)
          } else if (hard) {
            p.x = up.x; p.y = up.y;
            p.vx = up.vx || 0; p.vy = up.vy || 0;
            p._authX = p.x; p._authY = p.y; p._authAt = tNow;
            if (typeof up.facing === 'number') p.facing = up.facing;
            if (typeof up.dir === 'number') p.dir = up.dir;
          } else if (!isRoamingGhost) {
            // 일반 이동: _authX/Y만 업데이트 (clientPredictLocalMove에서 부드럽게 보정)
            p._authX = up.x; p._authY = up.y; p._authAt = tNow;
          }
          // 유령은 _auth 업데이트 안 함 (snap 트리거 방지)
          continue;
        }

        // For other players: update authoritative motion directly, and let render smoothing handle visuals
        p.x = up.x; p.y = up.y;
        p.vx = up.vx || 0; p.vy = up.vy || 0;
        if (typeof up.facing === 'number') p.facing = up.facing;
        if (typeof up.dir === 'number') p.dir = up.dir;
        if (typeof up.alive === 'boolean') p.alive = !!up.alive;
        if (typeof up.down === 'boolean') p.down = !!up.down;
        p.venting = !!up.vent;
        if (typeof up.ventLockUntil === 'number') p.ventLockUntil = up.ventLockUntil;
        if (typeof up.forcePosUntil === 'number') p.forcePosUntil = up.forcePosUntil;
        if (up.emoteKind != null) p.emoteKind = up.emoteKind;
        if (typeof up.emoteUntil === 'number') p.emoteUntil = up.emoteUntil;
        if (up.missionSiteId != null) p.missionSiteId = up.missionSiteId;
        if (typeof up.missionStage === 'number') p.missionStage = up.missionStage;
        // vent 애니메이션 타이밍 저장 (타인 플레이어)
        if (up.vent && up.ventStart) {
          if (!p._ventAnim || p._ventAnim.start !== up.ventStart) {
            p._ventAnim = { start: Number(up.ventStart), animEnd: Number(up.ventAnimEnd || (up.ventStart + 1000)), toX: Number(up.ventToX || 0), toY: Number(up.ventToY || 0) };
          }
        } else if (!up.vent) {
          if (p._ventAnim && tNow > (p._ventAnim.animEnd || 0)) p._ventAnim = null;
        }

        // Update smoothing buffer
        if (G.remoteSmooth && G.remoteSmooth.remotes) {
          const sm = G.remoteSmooth.remotes;
          let ex = sm.get(pid);
          if (!ex) {
            ex = { rx: p.x, ry: p.y, samples: [{ t: tNow, x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0 }], alive: !!p.alive, down: !!p.down, vent: !!(p.vent || p.venting) };
            sm.set(pid, ex);
          } else {
            const special = (!!p.down !== !!ex.down) || (!!p.alive !== !!ex.alive) || (!!(p.vent || p.venting) !== !!ex.vent);
            ex.alive = !!p.alive;
            ex.down = !!p.down;
            ex.vent = !!(p.vent || p.venting);
            if (!ex.samples) ex.samples = [];
            ex.samples.push({ t: tNow, x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0 });
            if (ex.samples.length > 12) ex.samples.shift();
            if (special) { ex.rx = p.x; ex.ry = p.y; ex.samples = [{ t: tNow, x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0 }]; }
          }
        }
      }

      // Prune players that disappeared from snapshots (join/leave robustness).
      // Keep a short grace window so we don't flicker on packet loss.
      try{
        const graceMs = 1500;
        for (const [pidStr, pp] of Object.entries(st.players || {})) {
          if (!pp) continue;
          if (myPidStr && pidStr === myPidStr) continue;
          if (players[pidStr]) continue;
          const last = (typeof pp._pAt === 'number') ? pp._pAt : 0;
          if (!last || (tNow - last) > graceMs) {
            delete st.players[pidStr];
            const pid = Number(pidStr || 0);
            if (pid && G.remoteSmooth && G.remoteSmooth.remotes) G.remoteSmooth.remotes.delete(pid);
          }
        }
      }catch(_){ }

      // Also prune smoothing buffer for ids not in the latest packet (best-effort).
      try{
        if (G.remoteSmooth && G.remoteSmooth.remotes) {
          const sm = G.remoteSmooth.remotes;
          for (const pid of Array.from(sm.keys())) {
            if (!players[String(pid)]) {
              // Keep it around briefly; it will be removed via st.players prune above.
              // But if state already dropped it, remove immediately.
              if (!st.players[String(pid)]) sm.delete(pid);
            }
          }
        }
      }catch(_){ }
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
      openMeetingUI(m.kind || 'emergency', m.reason || '회의!', m.endsAt || (now() + 10_000));
    });

    // Live vote counts (who has how many votes) + remaining time.
    net.on('voteUpdate', (m) => {
      try{
        if (!G.ui) G.ui = {};
        if (!G.ui.meeting) G.ui.meeting = {};
        G.ui.meeting.tally = m.tally || {};
        G.ui.meeting.skip = Number(m.skip || 0);
        G.ui.meeting.total = Number(m.total || 0);
        if (m.endsAt) G.ui.meeting.endsAt = Number(m.endsAt);
        if (G.phase === 'meeting') renderVoteList();
      }catch(_){ }
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
      // 클라이언트 phase도 즉시 scene으로 동기화 (meeting → scene)
      if (G.phase === 'meeting' || G.phase === 'play') {
        G.phase = 'scene';
      }
      openScene(m);
    });

    net.on('toast', (m) => {
      if (m.to != null && Number(m.to) !== Number(net.myPlayerId)) return;
      showToast(m.text || '');
    });



    // Host exited -> everyone returns to the room (avoid "stuck" clients).
    net.on('hostExit', (m) => {
      if (net.isHost) return; // host handles its own exit flow
      if (G.ui && G.ui._hostExitHandled) return;
      if (!G.ui) G.ui = {};
      G.ui._hostExitHandled = true;
      try { showCenterNotice('호스트 이탈로 게임이 종료되었습니다.', 1500); } catch (_) {}
      setTimeout(() => { try { leaveRoom(m?.reason || 'host_exit'); } catch (_) {} }, 1500);
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

    // Give relays/devices a brief window to converge on the same host.
    await new Promise(r => setTimeout(r, 250));
    try{ if (typeof net._electHost === 'function') net._electHost(); }catch(_){ }


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

      // Also request a fresh snapshot from the host a few times.
      // This is the main fix for: "로딩에서 안 넘어감 / 일부 유저 캐릭터가 안 뜸" (초기 브로드캐스트 유실).
      try{
        if (EMBED && !net._syncRetry){
          let tries = 0;
          // Slight delay: ensure iframe message bridge + room relay are fully up.
          setTimeout(()=>{ try{ requestHostSync('boot'); }catch(_){} }, 420);
          net._syncRetry = setInterval(()=>{
            try{
              if (!G.net || G.net !== net) { stopHostSyncRetry(net); return; }
              if (net.isHost) { stopHostSyncRetry(net); return; }
              // Stop once we are bound and visible in the authoritative player list.
              const pid = Number(net.myPlayerId || 0);
              if (pid && G.state && G.state.players && G.state.players[String(pid)]) { stopHostSyncRetry(net); return; }
              if (++tries > 8) { stopHostSyncRetry(net); return; }
              requestHostSync('retry');
            }catch(_){ stopHostSyncRetry(net); }
          }, 650);
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
    const n = Object.values(G.state.players).filter(p => p && !p.isBot).length;
    const practice = (n < 4);
    hostStartGame(practice);
    broadcast({ t: 'toast', text: practice ? '연습 모드 시작! (선생토끼 없음)' : '게임 시작!' });
    applyPhaseUI();
  });


  // Programmatic start used by embedded mode (avoids relying on a DOM click on a disabled button).
  async function _embedHostStartNow() {
    if (!G.assetsReady) return;
    if (!G.net) {
      try { await joinRoom(); } catch (_) { return; }
    }
    if (!G.net?.isHost) return;
    if (G.host.started) return;
    G.phase = 'play';
    const n = Object.values(G.state.players || {}).filter(p => p && !p.isBot).length;
    const practice = (n < 4);
    hostStartGame(practice);
    try{ broadcast({ t: 'toast', text: practice ? '연습 모드 시작! (선생토끼 없음)' : '게임 시작!' }); }catch(_){ }
    applyPhaseUI();
  }

  function _armEmbedHostAutostart(){
    try{
      if (!EMBED) return;
      if (!window.__EMBED_IS_HOST__) return;
      if (G.ui && G.ui._embedHostAutoTimer){ clearInterval(G.ui._embedHostAutoTimer); G.ui._embedHostAutoTimer = null; }
      const t0 = now();
      const expected = Number(window.__EMBED_EXPECTED_HUMANS__ || 0) || 0;
      // In embed rooms we must avoid deadlocks (no one can press the in-iframe start button).
      // Start quickly even for small rooms; late joiners are supported.
      const minReal = 1;
      const target = (expected > 0) ? expected : minReal;
      const MAX_WAIT = 1800;
      const CHECK_MS = 120;
      if (!G.ui) G.ui = {};
      G.ui._embedWaitingStart = true;
      G.ui._embedHostAutoTimer = setInterval(()=>{
        try{
          if (!G.net) return;
          if (!G.net.isHost) { clearInterval(G.ui._embedHostAutoTimer); G.ui._embedHostAutoTimer = null; G.ui._embedWaitingStart = false; return; }
          if (G.host.started) { clearInterval(G.ui._embedHostAutoTimer); G.ui._embedHostAutoTimer = null; G.ui._embedWaitingStart = false; return; }
          const n = Object.values(G.state.players || {}).filter(p=>p && !p.isBot).length;
          const ready = (expected > 0) ? (n >= target) : (n >= minReal);
          if (ready || (now() - t0) > MAX_WAIT){
            clearInterval(G.ui._embedHostAutoTimer);
            G.ui._embedHostAutoTimer = null;
            _embedHostStartNow().catch(()=>{});
          }
        }catch(_){ }
      }, CHECK_MS);
    }catch(_){ }
  }



  // ---------- Embed bridge (multiroom) ----------
  async function startEmbedded(init){
    if (!init) return;
    // Some parents may omit/rename the room code field; be tolerant.
    const roomCode = String(init.roomCode || init.roomId || init.room || '').trim() || 'local';
    if (G.net) return;

    // wait assets (they load asynchronously)
    // IMPORTANT (embed): joinRoom() early-returns when assets aren't ready.
    // If we proceed with a timeout here, slow networks can leave the iframe stuck
    // forever on the HTML "로딩 중..." overlay because we never retry join.
    while(!G.assetsReady && !G.assetsError){
      await new Promise(r => setTimeout(r, 50));
    }
    if (G.assetsError){
      try{ setLobbyStatus('에셋을 불러오지 못했어. 새로고침하거나 잠시 후 다시 시도해줘!', 'danger'); }catch(_){ }
      return;
    }

    window.__USE_BRIDGE_NET__ = true;
    window.__EMBED_SESSION_ID__ = String(init.sessionId || '');
    // Host is decided by the room (avoid multiple-host races when more players join).
    
// Host is ideally decided by the room, but some room states don't expose isHost reliably.
// For SuhakTokki embed we elect host deterministically to avoid "no host => infinite loading":
// - spectators are never host
// Host selection in embed mode:
// - Prefer the explicit boolean `init.isHost` from the parent room shell.
// - Only fall back to `seat===0` when `init.isHost` is *missing* (undefined),
//   because seat can temporarily be 0 for everyone before the room's order map arrives.
const __seat = (init.seat != null) ? Number(init.seat)
            : (init.order != null) ? Number(init.order)
            : (init.slot != null) ? Number(init.slot)
            : -1;
const __role = String(init.role || '');
const __hasHintHost = (typeof init.isHost === 'boolean');
const __hintHost = __hasHintHost ? !!init.isHost : false;
const __electedHost = (__role !== 'spectator') && (__hasHintHost ? __hintHost : (__seat === 0));
window.__EMBED_SEAT__ = (Number.isFinite(__seat) ? __seat : -1);
window.__EMBED_IS_HOST__ = !!__electedHost;
    // Embed meta (expected number of human players in this room). Used to prevent accidental "practice" start.
    window.__EMBED_HUMAN_COUNT__ = Number(init.humanCount || 0) || 0;
    window.__EMBED_EXPECTED_HUMANS__ = Number(init.expectedHumans || init.humanCount || 0) || 0;
    window.__EMBED_PRACTICE__ = (typeof init.practice === 'boolean')
      ? !!init.practice
      : ((window.__EMBED_EXPECTED_HUMANS__ > 0) ? (window.__EMBED_EXPECTED_HUMANS__ < 4) : false);

    try{ nickEl.value = String(init.nick || nickEl.value || '토끼').slice(0,10); }catch(_){ }
    try{ roomEl.value = String(roomCode).slice(0,256); }catch(_){ }

    // hide local lobby controls (room UI is handled by parent)
    try{ joinBtn.style.display = 'none'; }catch(_){ }
    try{ addBotBtn.style.display = 'none'; }catch(_){ }
    // keep startBtn for programmatic click

    await joinRoom();

    // Embedded UX: never show the internal lobby overlay. The parent already has it.
    try{ G.ui.embedJoined = true; }catch(_){ }
    // Let applyPhaseUI decide whether to show lobby/hud (we keep lobby visible until started in embed).
    try{ applyPhaseUI(); }catch(_){ }

    // If we are a non-host client and the room ends up with no host auto-start (rare relay/host flag issues),
    // ask the host to start after a short grace period.
    setTimeout(() => {
      try{
        if (!EMBED) return;
        if (!G.net || G.net.isHost) return;
        if (G.state && G.state.started) return;
        if (G.phase !== 'lobby') return;
        G.net.post({ t: 'embedStart' });
      }catch(_){ }
    }, 2200);

    // Safety net: on some hosts/relays the "isHost" flag can be missing or delayed.
    // If a solo player gets stuck forever at the title/loading screen waiting for the host,
    // force-start a local practice session after a short delay.
    setTimeout(() => {
      try{
        if (!EMBED) return;
        if (!G.net || G.host.started) return;
        // Only intervene when there is effectively a single human in the room.
        const humans = Object.values(G.state.players || {}).filter(p => p && !p.isBot).length;
        if (humans > 1) return;
        // If still not started, promote to host locally and begin practice.
        try{ G.net.isHost = true; }catch(_){ }
        try{ window.__EMBED_IS_HOST__ = true; }catch(_){ }
        if (G.phase === 'lobby') G.phase = 'play';
        try{ hostStartGame(true); }catch(_){ }
        try{ broadcastState(true); }catch(_){ }
        try{ broadcastRoster(true); }catch(_){ }
      }catch(_){ }
    }, 3500);

    // host: auto-start (embedded).
    // NOTE: never rely on button.click() because disabled buttons do not dispatch click events.
    if (window.__EMBED_IS_HOST__){
      _armEmbedHostAutostart();
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
      const pendingRaw = window.__PENDING_BRIDGE_INIT__;
      let pending = pendingRaw;
      if (typeof pendingRaw === 'string'){
        try{ pending = JSON.parse(pendingRaw); }catch(_){ pending = null; }
      }
      if (pending && typeof pending === 'object' && pending.type === 'bridge_init'){
        window.__PENDING_BRIDGE_INIT__ = null;
        window.__EMBED_INITED__ = true;
        startEmbedded(pending).catch((e)=>{
          try{ console.error(e); }catch(_){ }
          try{ setLobbyStatus('임베드 연결 실패...','danger'); }catch(_){ }
        });
      }
    }catch(_){ }

    window.addEventListener('message', (ev)=>{
      let d = ev.data;
      if (typeof d === 'string'){
        try{ d = JSON.parse(d); }catch(_){ return; }
      }
      if (!d || typeof d !== 'object') return;
      // Parent -> iframe: host ownership update (avoids no-host deadlocks).
      if (d.type === 'bridge_host') {
        try{
          window.__EMBED_IS_HOST__ = !!d.isHost;
          if (G.net) G.net.isHost = !!d.isHost;
          // If we just became host, arm auto-start and ensure lobby UI updates.
          if (window.__EMBED_IS_HOST__){
            try{ applyPhaseUI(); }catch(_){ }
            try{ _armEmbedHostAutostart(); }catch(_){ }
          }
        }catch(_){ }
        return;
      }

      // Parent -> iframe: leaving the embedded game view (go back to room)
      if (d.type === 'bridge_leave') {
        try {
          // If host tries to leave the embedded game mid-match, require confirmation.
          if (G.net && G.net.isHost && G.phase !== 'lobby') { tryHostLeave(); return; }
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
        try{ window.__EMBED_INITED__ = true; }catch(_){ }
        startEmbedded(d).catch((e)=>{
          try{ console.error(e); }catch(_){ }
          try{ setLobbyStatus('임베드 연결 실패...','danger'); }catch(_){ }
        });
      }
    });

    // Fallback: if the parent never delivers bridge_init (schema mismatch / race / caching),
    // start a local practice session so the game doesn't get stuck on the title screen.
    // This is only used when no init arrives for a while.
    try{
      setTimeout(()=>{
        try{
          if (!EMBED) return;
          if (window.__EMBED_INITED__) return;
          window.__EMBED_INITED__ = true;
          startEmbedded({
            type: 'bridge_init',
            gameId: 'suhaktokki',
            sessionId: 'local',
            nick: 'Player',
            seat: 0,
            isHost: true,
            solo: true,
            expectedHumans: 1,
            humanCount: 1,
            roomCode: 'local',
            level: 1,
            practice: true
          }).catch(()=>{});
        }catch(_){ }
      }, 2500);
    }catch(_){ }
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
