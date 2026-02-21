(function(){
  const sp = new URLSearchParams(location.search);
  const embed = sp.get('embed') === '1';
  const gameIdRaw = (sp.get('embedGame') || 'mathexplorer').toLowerCase();
  const gameId = (gameIdRaw === 'math-explorer') ? 'mathexplorer' : gameIdRaw;
  let initMsg = null;
  let startPayload = null;
  let charChosen = false;
  let charTimer = null;
  let charDeadline = 0;
  let overlay = null;
  let levelUpTimer = null;
  let chestTimer = null;
  let localSid = '';
  let localNick = 'Player';
  let expectedHumans = 1;
  let localSeat = -1;
  let bridgeIsHost = false;
  let lastWorldSendTs = 0;
  let lastHostBeatTs = 0;
  let worldSnapshot = null;
  let peers = new Set();
  let selectedChars = new Set();
  let suppressXpRelay = false;
  let phase = null; // {kind,id,owner,ready:Set,deadline}
  let remoteLock = null;
  let invulnBeforeLock = false;
  let localChestOpen = false;
  let remoteChestLocks = 0;
  let globalChestClaims = [];
  let teamXpTotal = 0;
  let localXpSent = 0;
  let teamBossThresholdXp = null;
  let lastBossThresholdBase = null;

  const remotePlayers = new Map(); // sid -> state
  let stateTimer = null;
  let drawOverlayTimer = null;
  let overlayCanvas = null;
  let overlayCtx = null;
  let chatWrap = null;
  let chatInput = null;
  let chatLog = null;
  let exitBtn = null;

  function post(msg){ try{ parent?.postMessage(Object.assign({ gameId }, msg), '*'); }catch(_){} }
  function sendMx(m){ try{ post({ type:'mx_msg', msg:m||{} }); }catch(_){} }
  function now(){ return Date.now(); }
  function myPlayer(){ try{ return window.G?.player || null; }catch(_){ return null; } }
  function phaseKey(){ return phase ? `${phase.kind}:${phase.id}` : ''; }
  function sidShort(s){ return String(s||'').slice(0,4); }

  function markPeer(sid){ if (!sid) return; peers.add(String(sid)); }
  function isSelf(from){ return !!from && String(from) === String(localSid||''); }
  function activeCount(){
    const observed = Math.max(1, peers.size || 0);
    const configured = Math.max(1, Number(expectedHumans||0)||0);
    // Prefer authoritative room count (game_start / bridge_init) so all clients wait for the same count
    // during character selection and shared-phase sync, even before hello packets fully propagate.
    return Math.min(4, Math.max(observed, configured));
  }
  function coopScale(){ const n = activeCount(); return n >= 3 ? 3 : n >= 2 ? 2 : 1; }
  function coopBossScale(){ const n = activeCount(); return n >= 3 ? 6 : n >= 2 ? 3 : 1; }
  function isWorldAuthority(){
    if (!embed) return true;
    if (bridgeIsHost) return true;
    if (Number.isFinite(localSeat) && localSeat === 0) return true;
    return false;
  }
  function dynamicMaxEnemies(){ const n = activeCount(); if (n >= 3) return 20; if (n >= 2) return 30; return 60; }
  function inSelectionPhase(){
    // Character selection waiting, levelup/chest modals, or remote lock
    if ((charChosen && selectedChars.size < activeCount()) || (!charChosen && document.getElementById('charScreen') && !document.getElementById('charScreen').classList.contains('hidden'))) return true;
    return !!phase || !!remoteLock;
  }

  function ensureOverlay(){
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'mxBridgeOverlay';
    overlay.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.2);padding:6px 10px;border-radius:999px;font:600 14px/1.2 sans-serif;';
    document.body.appendChild(overlay);
    return overlay;
  }
  function setOverlay(text, show=true){ const el=ensureOverlay(); el.textContent=text||''; el.style.display=(show&&text)?'block':'none'; }

  function ensureFreezeLayer(){
    let el = document.getElementById('mxFreezeLayer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'mxFreezeLayer';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.12);z-index:9998;display:none;pointer-events:none;';
    document.body.appendChild(el);
    return el;
  }
  function setRemoteLock(label, on){
    try{
      const fl = ensureFreezeLayer();
      if (on){
        remoteLock = { label: label||'선택 중' };
        fl.style.display = 'block';
        invulnBeforeLock = !!myPlayer()?.__mxInvuln;
        if (myPlayer()) myPlayer().__mxInvuln = true;
        if (window.G) window.G.paused = true;
        setOverlay(`${label} · 다른 플레이어 선택 중`, true);
      } else {
        remoteLock = null;
        fl.style.display = 'none';
        if (myPlayer()) myPlayer().__mxInvuln = !!invulnBeforeLock;
        if (!phase && window.G) window.G.paused = false;
        setOverlay('', false);
      }
    }catch(_){ }
  }

  function ensureExitButton(){
    if (exitBtn) return exitBtn;
    exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.textContent = '✕';
    exitBtn.title = '나가기';
    exitBtn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10001;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.45);background:rgba(20,20,20,.35);color:#fff;font-size:18px;line-height:1;cursor:pointer;backdrop-filter: blur(2px);';
    exitBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); post({ type:'mx_quit' }); });
    document.body.appendChild(exitBtn);
    return exitBtn;
  }

  function ensureChat(){
    if (chatWrap) return;
    chatWrap = document.createElement('div');
    chatWrap.id = 'mxChatDock';
    chatWrap.style.cssText = 'position:fixed;left:12px;right:12px;bottom:10px;z-index:10000;pointer-events:none;display:flex;justify-content:center;';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(760px,100%);background:rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:8px;backdrop-filter: blur(3px);pointer-events:auto;';
    chatLog = document.createElement('div');
    chatLog.style.cssText = 'height:82px;overflow:auto;color:#fff;font:12px/1.35 sans-serif;padding:2px 2px 6px 2px;';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;';
    chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.maxLength = 120;
    chatInput.placeholder = '채팅 입력 후 Enter';
    chatInput.style.cssText = 'flex:1;min-width:0;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;padding:8px 10px;font:13px sans-serif;outline:none;';
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button'; sendBtn.textContent = '전송';
    sendBtn.style.cssText = 'border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.14);color:#fff;padding:8px 12px;cursor:pointer;';
    const send = ()=>{
      const text = String(chatInput?.value||'').trim();
      if (!text) return;
      appendChatLine(localNick, text, true);
      sendMx({ kind:'chat', text, nick: localNick, ts: now() });
      chatInput.value = '';
    };
    chatInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); send(); } });
    sendBtn.addEventListener('click', send);
    row.append(chatInput, sendBtn);
    panel.append(chatLog, row);
    chatWrap.append(panel);
    document.body.appendChild(chatWrap);
  }
  function appendChatLine(nick, text, self){
    if (!chatLog) return;
    const line = document.createElement('div');
    line.style.cssText = `margin:2px 0; opacity:.95; ${self?'color:#d6f6ff;':''}`;
    line.textContent = `[${(nick||'Player').slice(0,12)}] ${String(text||'').slice(0,120)}`;
    chatLog.appendChild(line);
    while (chatLog.children.length > 60) chatLog.removeChild(chatLog.firstChild);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function ensureOverlayCanvas(){
    if (overlayCanvas && overlayCanvas.isConnected) return;
    const base = document.getElementById('gameCanvas');
    if (!base) return;
    const parent = base.parentElement || document.body;
    const style = getComputedStyle(parent);
    if (style.position === 'static') parent.style.position = 'relative';
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'mxRemoteOverlay';
    overlayCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;';
    parent.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');
  }
  function syncOverlayCanvasSize(){
    ensureOverlayCanvas();
    const base = document.getElementById('gameCanvas');
    if (!base || !overlayCanvas) return;
    if (overlayCanvas.width !== base.width) overlayCanvas.width = base.width;
    if (overlayCanvas.height !== base.height) overlayCanvas.height = base.height;
    // match visual size if canvas CSS scaled
    overlayCanvas.style.width = base.style.width || '100%';
    overlayCanvas.style.height = base.style.height || '100%';
  }

  function designByType(type){
    try{ return (window.CHAR_DESIGNS||[]).find(d => d && d.type === type) || null; }catch(_){ return null; }
  }

  function drawRemoteOverlay(){
    try{
      if (!embed) return;
      syncOverlayCanvasSize();
      if (!overlayCtx || !window.G || !window.G.camera) return;
      const c = overlayCtx;
      c.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
      const camX = Number(window.G.camera.x||0), camY = Number(window.G.camera.y||0);
      const t = now();
      for (const [sid, rp] of remotePlayers.entries()){
        if (!rp) continue;
        // interpolate
        const age = Math.max(0, t - (rp.ts||t));
        const lerp = Math.min(1, age / 90);
        if (!Number.isFinite(rp.rx)) { rp.rx = rp.x||0; rp.ry = rp.y||0; }
        rp.rx += ((rp.x||0) - rp.rx) * (0.18 + lerp*0.22);
        rp.ry += ((rp.y||0) - rp.ry) * (0.18 + lerp*0.22);
        const sx = rp.rx - camX;
        const sy = rp.ry - camY;
        if (sx < -80 || sy < -100 || sx > overlayCanvas.width+80 || sy > overlayCanvas.height+80) continue;
        c.save();
        c.translate(sx, sy);
        c.globalAlpha = rp.selecting ? 0.45 : 0.9;
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath(); c.ellipse(0,25,18,9,0,0,Math.PI*2); c.fill();
        const d = designByType(rp.character);
        if (d && typeof d.draw === 'function'){
          const frame = Math.floor(Number(rp.walkAnim||0)) % 2;
          d.draw(c, frame, 1.35);
        } else {
          c.fillStyle = '#7ad'; c.beginPath(); c.arc(0,0,18,0,Math.PI*2); c.fill();
        }
        // hp
        if (Number.isFinite(rp.hp) && Number.isFinite(rp.maxHp) && rp.maxHp > 0){
          c.globalAlpha = 0.85;
          c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(-24,-44,48,6);
          c.fillStyle = '#3f6'; c.fillRect(-24,-44,48*Math.max(0,Math.min(1,rp.hp/rp.maxHp)),6);
        }
        // name tag
        c.globalAlpha = 1;
        const label = rp.selecting ? `선택중 · ${rp.nick||sidShort(sid)}` : (rp.nick||sidShort(sid));
        c.font = 'bold 12px sans-serif';
        const tw = c.measureText(label).width;
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.fillRect(-tw/2 - 6, -62, tw + 12, 18);
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, -53);
        c.restore();
      }
      // local label
      const p = myPlayer();
      if (p && p.x != null){
        const sx = p.x - camX, sy = p.y - camY;
        c.save();
        c.translate(sx, sy);
        const selecting = inSelectionPhase();
        const label = selecting ? `선택중 · ${localNick}` : localNick;
        c.font='bold 12px sans-serif'; const tw = c.measureText(label).width;
        c.fillStyle='rgba(0,0,0,.55)'; c.fillRect(-tw/2 - 6, -62, tw + 12, 18);
        c.fillStyle='#fff'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(label, 0, -53);
        c.restore();
      }
    }catch(_){ }
  }

  function pruneClaims(){
    const t = now();
    globalChestClaims = (globalChestClaims||[]).filter(c => (t - (c.ts||0)) < 30000);
  }
  function sendHello(){ sendMx({ kind:'hello', ts: now(), nick: localNick, char: myPlayer()?.design?.type||'' }); }
  function applyDifficulty(diff){
    try{
      const target = (Number(diff)>=2);
      if (typeof window.hardMode !== 'undefined' && !!window.hardMode !== target && window.G?.toggleHardMode){
        window.G.toggleHardMode();
      }
    }catch(_){ }
  }
  function hideMain(){ try{ document.getElementById('mainScreen')?.classList.add('hidden'); }catch(_){} }
  function showCharSelect(){ try{ hideMain(); window.G?.showCharSelect?.(); }catch(_){} }

  function chooseRandomChar(){
    if (charChosen) return;
    try{
      const arr = Array.isArray(window.CHAR_DESIGNS) ? window.CHAR_DESIGNS : null;
      if (arr && arr.length){
        const pick = arr[Math.floor(Math.random()*arr.length)];
        if (pick?.type && window.G?.selectChar) { window.G.selectChar(pick.type); return; }
      }
      document.querySelector('#charSelectGrid .character')?.click();
    }catch(_){ }
  }

  function clearPickTimers(){ clearInterval(levelUpTimer); clearInterval(chestTimer); }

  function openPhase(kind, secs){
    const id = `${kind}-${now()}-${Math.random().toString(36).slice(2,6)}`;
    phase = { kind, id, owner: localSid || 'me', ready: new Set([localSid||'me']), deadline: now()+secs*1000 };
    if (window.G) window.G.paused = true;
    sendMx({ kind:'phase_open', pkind:kind, pid:id, secs });
    startSharedPhaseCountdown(kind, secs);
    return phase;
  }
  function startSharedPhaseCountdown(kind, secs){
    clearPickTimers();
    const deadline = now() + secs*1000;
    const timer = setInterval(()=>{
      const remain = Math.max(0, Math.ceil((deadline-now())/1000));
      const need = Math.max(0, activeCount() - (phase?.ready?.size||0));
      const label = kind === 'levelup' ? '레벨업 선택' : '보물 선택';
      setOverlay(`${label} ${remain}s${need?` · 대기 ${need}`:''}`);
      sendMx({ kind:'modal_state', label, remain, phase: phaseKey() });
      if (remain <= 0){
        clearInterval(timer);
        try{ if (kind === 'levelup') autoPick('#upgrades .upgradeCard'); else autoPick('#items .upgradeCard, #items > div'); }catch(_){ }
      }
    }, 250);
    if (kind === 'levelup') levelUpTimer = timer; else chestTimer = timer;
  }
  function maybeResumePhase(){
    if (!phase) return;
    if (phase.ready.size >= activeCount()){
      sendMx({ kind:'phase_resume', pkind:phase.kind, pid:phase.id });
      endPhaseLocal(phase.kind, phase.id);
    }
  }
  function endPhaseLocal(kind, id){
    if (!phase || phase.kind !== kind || phase.id !== id) return;
    phase = null;
    clearPickTimers();
    if (!remoteLock && window.G) window.G.paused = false;
    setOverlay('', false);
    sendMx({ kind:'modal_clear' });
  }
  function markLocalPhaseReady(kind){
    if (!phase || phase.kind !== kind) return;
    phase.ready.add(localSid||'me');
    sendMx({ kind:'phase_ready', pkind:kind, pid:phase.id });
    maybeResumePhase();
  }

  function autoPick(sel){
    try{
      const nodes = [...document.querySelectorAll(sel)].filter(n=>n.offsetParent!==null);
      if (!nodes.length) return;
      nodes[Math.floor(Math.random()*nodes.length)].click();
    }catch(_){ }
  }

  function wrapCardsForPhase(containerSel, kind){
    const root = document.querySelector(containerSel);
    if (!root) return;
    root.querySelectorAll('.upgradeCard').forEach(card=>{
      if (card.__mxWrapped) return;
      card.__mxWrapped = true;
      card.addEventListener('click', ()=>{ try{ markLocalPhaseReady(kind); }catch(_){} }, true);
    });
  }

  function startCharCountdown(){
    clearInterval(charTimer);
    charDeadline = now() + 10000;
    const tick = ()=>{
      const remain = Math.max(0, Math.ceil((charDeadline - now())/1000));
      const need = Math.max(0, activeCount() - selectedChars.size);
      setOverlay(`캐릭터 선택 (${remain}s)${need?` · 대기 ${need}`:''} · 최대4인`);
      if (remain <= 0){
        clearInterval(charTimer);
        let tries = 0;
        const retry = setInterval(()=>{
          tries++;
          chooseRandomChar();
          if (charChosen || tries >= 20){ clearInterval(retry); }
        }, 200);
      }
    };
    tick();
    charTimer = setInterval(tick, 200);
  }

  function beginFromRoom(){
    if (!window.G || typeof window.G.showCharSelect !== 'function' || !document.getElementById('charScreen')){
      setTimeout(beginFromRoom, 150);
      return;
    }
    // In room mode, wait for authoritative game_start payload before opening the selection UI.
    // This prevents clients from starting separate local runs and getting stuck in mismatched phases.
    if (embed && activeCount() > 1 && !startPayload){
      setOverlay('게임 시작 동기화 중…', true);
      setTimeout(beginFromRoom, 120);
      return;
    }
    ensureExitButton();
    ensureChat();
    hookGame();
    try{ document.getElementById('mainScreen')?.classList.add('hidden'); }catch(_){ }
    applyDifficulty(startPayload?.difficulty ?? initMsg?.difficulty ?? initMsg?.level ?? 1);
    if (embed) sendHello();
    showCharSelect();
    startCharCountdown();
    setTimeout(sendHello, 600);
    setTimeout(sendHello, 1500);
    startStateLoop();
    startOverlayLoop();
  }

  function tryClaimChest(chest){
    if (remoteLock || localChestOpen) return false;
    pruneClaims();
    if ((globalChestClaims?.length||0) >= 3) return false;
    localChestOpen = true;
    const claim = { from: localSid||'me', x: Math.round(chest?.x||0), y: Math.round(chest?.y||0), ts: now() };
    globalChestClaims.push(claim);
    sendMx({ kind:'chest_claim', x: claim.x, y: claim.y, ts: claim.ts });
    return true;
  }
  function releaseChest(reason){
    localChestOpen = false;
    pruneClaims();
    globalChestClaims = (globalChestClaims||[]).filter(c => String(c.from||'') !== String(localSid||''));
    sendMx({ kind:'chest_release', reason: reason||'done' });
  }

  function ensureEntityId(obj, prefix){
    try{
      if (!obj) return '';
      if (!obj.__mxId) obj.__mxId = `${prefix}${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-4)}`;
      return String(obj.__mxId);
    }catch(_){ return ''; }
  }

  function findEnemyById(id){
    try{
      if (!id || !window.G || !Array.isArray(window.G.enemies)) return null;
      const sid = String(id);
      for (const e of window.G.enemies){ if (e && String(e.__mxId||'') === sid) return e; }
    }catch(_){ }
    return null;
  }

  function awardRemoteKill(enemy){
    try{
      if (!enemy || !window.G || !window.G.player) return;
      const p = window.G.player;
      window.G.score = Number(window.G.score||0) + Number(enemy.score||0);
      suppressXpRelay = false; // host should relay xp_gain to team
      p.gainExp(Number(enemy.exp||0));
      const currentChests = (window.G.items||[]).filter(item => item.type === 'chest').length;
      if (Math.random() < 0.1 && currentChests < 3) window.G.items.push({x: enemy.x, y: enemy.y, type: 'chest'});
      else if (Math.random() < 0.3) window.G.items.push({x: enemy.x, y: enemy.y, type: 'exp', value: enemy.exp});
      try{ window.G.textParticle?.(enemy.x, enemy.y, '협동 처치!', '#8ff', 0.9); }catch(_){}
    }catch(_){ }
  }

  function applyRemoteCombatHit(m){
    try{
      if (!embed || !isWorldAuthority() || !window.G) return;
      const enemy = findEnemyById(m.enemyId);
      if (!enemy || !(enemy.hp > 0)) return;
      let dmg = Number(m.dmg || 0);
      if (!Number.isFinite(dmg) || dmg <= 0) return;
      if (dmg > 100000) dmg = 100000;
      enemy.hp -= dmg;
      try{ window.G.textParticle?.(enemy.x, enemy.y, `-${Math.round(dmg)}`, '#faa', 0.7); }catch(_){}
      if (enemy.hp <= 0 && !enemy.__mxRemoteKillAwarded){
        enemy.__mxRemoteKillAwarded = true;
        awardRemoteKill(enemy);
      }
    }catch(_){ }
  }

  function buildWorldSnapshot(){
    try{
      if (!window.G || !window.G.player) return null;
      const g = window.G;
      const enemies = (g.enemies||[]).map((e,idx)=>({
        id: ensureEntityId(e,'e'),
        x: Math.round(e.x||0), y: Math.round(e.y||0),
        hp: Math.round(Number(e.hp||0)), maxHp: Math.round(Number(e.maxHp||e.hp||1)),
        type: Number(e.type||0),
        boss: !!e.isBoss,
        lvl: Number(e.level||e.stage||g.stage||1)
      })).slice(0,80);
      const items = (g.items||[]).map((it)=>({
        id: ensureEntityId(it,'i'), x: Math.round(it.x||0), y: Math.round(it.y||0),
        type: String(it.type||'exp'), v: Math.round(Number(it.value||0))
      })).slice(0,120);
      const enemyProjectiles = (g.enemyProjectiles||[]).map((ep,idx)=>({
        id: ensureEntityId(ep,'ep'), x: Math.round(ep.x||0), y: Math.round(ep.y||0),
        vx: Number(ep.vx||0), vy: Number(ep.vy||0), life: Number(ep.life||0), damage: Number(ep.damage||0),
        isRock: !!ep.isRock, size: Number(ep.size||0)
      })).slice(0,160);
      const effects = (g.effects||[]).filter(e=>e && (e.type==='attackWarning' || e.type==='laserWarning')).map(e=>({
        id: ensureEntityId(e,'fx'), type:String(e.type), x:Number(e.x||0), y:Number(e.y||0), life:Number(e.life||0),
        radius:Number(e.radius||0), angle:Number(e.angle||0), width:Number(e.width||0), length:Number(e.length||0)
      })).slice(0,60);
      return {
        kind:'world',
        ts: now(),
        stage: Number(g.stage||1),
        score: Math.round(Number(g.score||0)),
        nextBossScore: Math.round(Number(g.nextBossScore||0)),
        bossAlive: !!g.boss,
        enemies, items, enemyProjectiles, effects
      };
    }catch(_){ return null; }
  }

  function applyWorldSnapshot(m){
    try{
      if (!window.G || !m || !Array.isArray(m.enemies) || !Array.isArray(m.items)) return;
      const g = window.G;
      worldSnapshot = { ts: now(), hostTs: Number(m.ts||0), data: m };
      lastHostBeatTs = now();
      // mirror scoreboard/stage from authority (do not reduce progress harshly)
      if (Number.isFinite(m.stage)) g.stage = Math.max(1, Number(m.stage));
      if (Number.isFinite(m.score)) g.score = Math.max(Number(g.score||0), Number(m.score));
      if (Number.isFinite(m.nextBossScore) && m.nextBossScore > 0) g.nextBossScore = Number(m.nextBossScore);

      const byId = new Map();
      for (const e of (g.enemies||[])){ if (e && e.__mxId) byId.set(String(e.__mxId), e); }
      const nextEnemies = [];
      for (const se of m.enemies){
        let e = byId.get(String(se.id));
        if (!e){
          try{
            if (se.boss && window.Boss) e = new window.Boss(Number(se.x||0), Number(se.y||0), Number(g.bossCount||0));
            else if (window.Enemy) e = new window.Enemy(Number(se.x||0), Number(se.y||0), Number(g.stage||1), Number.isFinite(se.type)?Number(se.type):null);
          }catch(_){ e = null; }
          if (!e) continue;
          e.__mxId = String(se.id);
        }
        e.x = Number(se.x||e.x||0); e.y = Number(se.y||e.y||0);
        if (Number.isFinite(se.hp)) e.hp = Number(se.hp);
        if (Number.isFinite(se.maxHp)) e.maxHp = Number(se.maxHp);
        if (Number.isFinite(se.type)) e.type = Number(se.type);
        if (se.boss) e.isBoss = true;
        nextEnemies.push(e);
      }
      g.enemies = nextEnemies;
      g.boss = nextEnemies.find(e=>e && e.isBoss) || null;

      const itemById = new Map();
      for (const it of (g.items||[])){ if (it && it.__mxId) itemById.set(String(it.__mxId), it); }
      const nextItems = [];
      for (const si of m.items){
        let it = itemById.get(String(si.id));
        if (!it) it = { x:0, y:0, type:'exp', value:1 };
        it.__mxId = String(si.id);
        it.x = Number(si.x||0); it.y = Number(si.y||0);
        it.type = String(si.type||'exp'); it.value = Number(si.v||0);
        nextItems.push(it);
      }
      g.items = nextItems;

      if (Array.isArray(m.enemyProjectiles)) {
        g.enemyProjectiles = m.enemyProjectiles.map((ep)=>({
          __mxId: String(ep.id||''), x:Number(ep.x||0), y:Number(ep.y||0), vx:Number(ep.vx||0), vy:Number(ep.vy||0),
          life:Number(ep.life||0), damage:Number(ep.damage||0), isRock:!!ep.isRock, size:Number(ep.size||0)
        }));
      }
      if (Array.isArray(m.effects)) {
        const keepLocal = (g.effects||[]).filter(e=>e && !(e.type==='attackWarning' || e.type==='laserWarning'));
        const remoteFx = m.effects.map((e)=>({
          __mxId:String(e.id||''), type:String(e.type||'attackWarning'), x:Number(e.x||0), y:Number(e.y||0), life:Number(e.life||0),
          radius:Number(e.radius||0), angle:Number(e.angle||0), width:Number(e.width||0), length:Number(e.length||0)
        }));
        g.effects = keepLocal.concat(remoteFx);
      }
    }catch(_){ }
  }

  function maybeSendWorldSnapshot(force){
    try{
      if (!embed || !localSid || !isWorldAuthority() || !window.G || !window.G.running) return;
      const n = now();
      if (!force && (n - lastWorldSendTs) < 60) return;
      lastWorldSendTs = n;
      const snap = buildWorldSnapshot();
      if (!snap) return;
      sendMx(snap);
    }catch(_){ }
  }

  function patchGuestSpawnSuppression(){
    try{
      if (!window.G || window.G.__mxGuestSpawnSuppressed) return;
      window.G.__mxGuestSpawnSuppressed = true;
      const wrapNoopIfGuest = (name)=>{
        const orig = window.G[name]?.bind(window.G);
        if (!orig) return;
        window.G[name] = function(){
          if (embed && !isWorldAuthority() && activeCount() > 1) return;
          return orig.apply(this, arguments);
        };
      };
      wrapNoopIfGuest('spawnEnemies');
      wrapNoopIfGuest('spawnBoss');
      wrapNoopIfGuest('checkBossSpawn');
    }catch(_){ }
  }

  function patchNoPvPAndInvuln(){
    try{
      if (!window.Player || window.Player.prototype.__mxPatchedDamage) return;
      const P = window.Player.prototype;
      const origTake = P.takeDamage;
      P.takeDamage = function(dmg){
        if (this.__mxInvuln) return;
        if (embed && activeCount() > 1 && !isWorldAuthority()) {
          // Guest local enemy/boss/projectile hits are non-authoritative in coop shared-world mode.
          return;
        }
        return origTake.call(this, dmg);
      };
      const origDraw = P.draw;
      P.draw = function(){
        const selecting = !!this.__mxInvuln || inSelectionPhase();
        const c = window.ctx;
        if (selecting && c) { c.save(); c.globalAlpha = 0.55; }
        const r = origDraw.apply(this, arguments);
        if (selecting && c) c.restore();
        return r;
      };
      P.__mxPatchedDamage = true;
    }catch(_){ }
  }

  function updateBossThresholdHint(){
    try{
      if (!window.G) return;
      const base = Number(window.G.nextBossScore || 700);
      lastBossThresholdBase = base;
      teamBossThresholdXp = base * coopBossScale();
    }catch(_){ }
  }

  function patchXpShare(){
    try{
      if (!window.Player || window.Player.prototype.__mxPatchedXp) return;
      const P = window.Player.prototype;
      const origGain = P.gainExp;
      P.gainExp = function(amt){
        const ret = origGain.call(this, amt);
        try{
          if (Number.isFinite(amt) && amt > 0){
            if (!suppressXpRelay){
              localXpSent += Math.round(amt);
              teamXpTotal += Math.round(amt);
              sendMx({ kind:'xp_gain', amt: Math.round(amt), total: localXpSent, team: teamXpTotal });
            }
            updateBossThresholdHint();
          }
        }catch(_){ }
        return ret;
      };
      P.__mxPatchedXp = true;
    }catch(_){ }
  }

  function patchEnemyScaling(){
    try{
      if (!window.Enemy || window.Enemy.prototype.__mxScaledPatch) return;
      const scaleEnemy = (e)=>{
        if (!e || e.__mxScaled) return e;
        const mult = coopScale();
        if (mult > 1){
          if (Number.isFinite(e.hp)) e.hp *= mult;
          if (Number.isFinite(e.damage)) e.damage *= mult;
          if (Number.isFinite(e.exp)) e.exp *= mult;
          if (Number.isFinite(e.score)) e.score *= mult;
          if (e.isBoss && Number.isFinite(e.hp)) e.hp *= 1; // already scaled via mult, keep same path
        }
        e.__mxScaled = true;
        return e;
      };
      const OrigEnemy = window.Enemy;
      window.Enemy = function(){ const e = Reflect.construct(OrigEnemy, arguments, new.target || OrigEnemy); return scaleEnemy(e); };
      window.Enemy.prototype = OrigEnemy.prototype;
      Object.setPrototypeOf(window.Enemy, OrigEnemy);
      window.Enemy.prototype.__mxScaledPatch = true;
      // also patch Boss constructor if available
      if (window.Boss && !window.Boss.prototype.__mxScaledPatch){
        const OrigBoss = window.Boss;
        window.Boss = function(){ const b = Reflect.construct(OrigBoss, arguments, new.target || OrigBoss); if (b){ const mult=coopScale(); if (mult>1){ if(Number.isFinite(b.hp)) b.hp*=mult; if(Number.isFinite(b.damage)) b.damage*=mult; if(Number.isFinite(b.exp)) b.exp*=mult; if(Number.isFinite(b.score)) b.score*=mult; } b.__mxScaled=true; } return b; };
        window.Boss.prototype = OrigBoss.prototype;
        Object.setPrototypeOf(window.Boss, OrigBoss);
        window.Boss.prototype.__mxScaledPatch = true;
      }
    }catch(_){ }
  }

  function patchGameBalanceAndFlow(){
    if (!window.G || window.G.__mxBalancePatched) return;
    window.G.__mxBalancePatched = true;

    // Dynamic enemy max + spawn count limit
    const origSpawnEnemies = window.G.spawnEnemies?.bind(window.G);
    if (origSpawnEnemies){
      window.G.spawnEnemies = function(){
        const maxE = dynamicMaxEnemies();
        if (this.enemies.length >= maxE || this.boss) return;
        const before = this.enemies.length;
        const out = origSpawnEnemies();
        if (this.enemies.length > maxE) this.enemies.length = maxE;
        return out;
      };
    }

    // Boss at map center + team XP threshold
    const origSpawnBoss = window.G.spawnBoss?.bind(window.G);
    if (origSpawnBoss){
      window.G.spawnBoss = function(){
        // Temporarily center player reference by patching after original spawn
        const out = origSpawnBoss();
        try{
          const cx = (window.MAP_WIDTH||3000)/2, cy = (window.MAP_HEIGHT||3000)/2;
          const bosses = (this.enemies||[]).filter(e=>e && e.isBoss);
          bosses.forEach((b,i)=>{
            b.x = cx + (i===0?0:(i%2?120:-120));
            b.y = cy + (i===0?0:(i%2?-80:80));
          });
          if (this.boss){ this.boss.x = cx; this.boss.y = cy; }
          this.textParticle?.(cx, cy-150, '중앙 보스 출현!', '#ff0', 2.2);
        }catch(_){ }
        updateBossThresholdHint();
        sendMx({ kind:'boss_spawn', ts: now(), teamXp: teamXpTotal, threshold: teamBossThresholdXp||0 });
        return out;
      };
    }

    const origCheckBossSpawn = window.G.checkBossSpawn?.bind(window.G);
    if (origCheckBossSpawn){
      window.G.checkBossSpawn = function(){
        if (this.boss) return;
        // solo keeps original behavior
        if (activeCount() <= 1) return origCheckBossSpawn();
        if (this.nextBossScore === undefined) this.nextBossScore = 700;
        if (!Number.isFinite(teamBossThresholdXp)) teamBossThresholdXp = Number(this.nextBossScore||700) * coopBossScale();
        if ((teamXpTotal||0) >= (teamBossThresholdXp||Infinity)){
          this.spawnBoss();
          let bossInterval = 3000;
          if (this.stage >= 6) bossInterval = 10000;
          else if (this.stage >= 5) bossInterval = 8000;
          else if (this.stage >= 4) bossInterval = 6000;
          else if (this.stage >= 3) bossInterval = 4000;
          this.nextBossScore = (this.nextBossScore || 700) + bossInterval;
          teamBossThresholdXp = this.nextBossScore * coopBossScale();
          return;
        }
      };
    }

    const origReset = window.G.reset?.bind(window.G);
    if (origReset){
      window.G.reset = function(){
        const r = origReset();
        teamXpTotal = 0; localXpSent = 0;
        updateBossThresholdHint();
        sendMx({ kind:'run_reset' });
        return r;
      };
    }

    // Level-up 5s / Chest 20s timings handled in bridge hooks; just expose invuln during pauses
    const origLoop = window.G.loop?.bind(window.G);
    if (origLoop){
      window.G.loop = function(ts){
        try{ const p=myPlayer(); if (p) p.__mxInvuln = inSelectionPhase(); }catch(_){ }
        try{ if (embed && !isWorldAuthority() && activeCount()>1 && worldSnapshot && (now()-Number(worldSnapshot.ts||0) < 1500)) applyWorldSnapshot(worldSnapshot.data); }catch(_){ }
        return origLoop(ts);
      };
    }
  }

  function patchUiHooks(){
    if (!window.G || window.G.__mxBridgeHooked) return;
    window.G.__mxBridgeHooked = true;
    patchNoPvPAndInvuln();
    patchXpShare();
    patchEnemyScaling();
    patchGameBalanceAndFlow();
    patchGuestSpawnSuppression();
    try{
      if (window.Player && !window.Player.prototype.__mxCombatAuthorityPatched){
        const P = window.Player.prototype;
        const origDeal = P.dealDamage;
        P.dealDamage = function(enemy, dmg){
          try{ ensureEntityId(enemy, 'e'); }catch(_){ }
          if (embed && activeCount() > 1 && !isWorldAuthority()) {
            const enemyId = String(enemy?.__mxId||'');
            let req = Number(dmg||0);
            if (!Number.isFinite(req) || req <= 0) return;
            // clamp for safety; host remains authoritative for resulting state
            req = Math.min(req, Math.max(1, Number(this.damage||req) * 4));
            sendMx({ kind:'combat_hit', enemyId, dmg: req, ts: now() });
            try{ window.G?.textParticle?.(enemy?.x||0, (enemy?.y||0)-8, '타격!', '#9ff', 0.55); }catch(_){ }
            return;
          }
          return origDeal.call(this, enemy, dmg);
        };
        P.__mxCombatAuthorityPatched = true;
      }
    }catch(_){ }

    const origSelect = window.G.selectChar?.bind(window.G);
    if (origSelect){
      window.G.selectChar = function(type){
        charChosen = true;
        clearInterval(charTimer);
        selectedChars.add(localSid||'me');
        setOverlay('다른 플레이어 캐릭터 선택 대기…', true);
        sendMx({ kind:'char_selected', character:type||'', nick: localNick });
        const out = origSelect(type);
        sendLocalState(true);
        if (window.G) window.G.paused = (selectedChars.size < activeCount());
        if (activeCount() <= 1 && window.G) window.G.paused = false;
        return out;
      };
    }

    const origStart = window.G.start?.bind(window.G);
    if (origStart){
      window.G.start = function(){
        const out = origStart();
        try{ if (selectedChars.size < activeCount()) window.G.paused = true; }catch(_){ }
        updateBossThresholdHint();
        ensureExitButton(); ensureChat();
        return out;
      };
    }

    const origLevelUp = window.G.showLevelUp?.bind(window.G);
    if (origLevelUp){
      window.G.showLevelUp = function(){
        const out = origLevelUp();
        openPhase('levelup', 5);
        wrapCardsForPhase('#upgrades', 'levelup');
        sendLocalState(true);
        return out;
      };
    }

    const origShowMath = window.G.showMathScreen?.bind(window.G);
    if (origShowMath){
      window.G.showMathScreen = function(x,y){
        const chest = {x,y};
        if (!tryClaimChest(chest)) return;
        const out = origShowMath(x,y);
        if (window.G) window.G.paused = true;
        sendMx({ kind:'chest_phase_open', secs:20 });
        startChestQuestionCountdown();
        sendLocalState(true);
        return out;
      };
    }

    const origCheckMath = window.G.checkMathAnswer?.bind(window.G);
    if (origCheckMath){
      window.G.checkMathAnswer = function(){
        const out = origCheckMath();
        const afterOpen = document.getElementById('itemScreen') && !document.getElementById('itemScreen').classList.contains('hidden');
        if (afterOpen){
          openPhase('chest', 20);
          wrapCardsForPhase('#items', 'chest');
          sendLocalState(true);
        }
        return out;
      };
    }

    const origCloseMath = window.G.closeMath?.bind(window.G);
    if (origCloseMath){
      window.G.closeMath = function(){
        const out = origCloseMath();
        clearInterval(chestTimer);
        if (localChestOpen) releaseChest('cancel');
        sendLocalState(true);
        return out;
      };
    }

    const origShowItems = window.G.showItemScreen?.bind(window.G);
    if (origShowItems){
      window.G.showItemScreen = function(){
        const out = origShowItems();
        wrapCardsForPhase('#items', 'chest');
        return out;
      };
    }
  }

  function hookGame(){
    patchUiHooks();
  }

  function startChestQuestionCountdown(){
    clearInterval(chestTimer);
    const deadline = now() + 20000;
    chestTimer = setInterval(()=>{
      const remain = Math.max(0, Math.ceil((deadline-now())/1000));
      setOverlay(`보물 문제 ${remain}s`);
      sendMx({ kind:'modal_state', label:'보물 문제/선택', remain });
      if (remain<=0){
        clearInterval(chestTimer);
        try{ window.G?.closeMath?.(); }catch(_){ }
      }
    }, 250);
  }

  function startStateLoop(){
    clearInterval(stateTimer);
    stateTimer = setInterval(()=>{ sendLocalState(false); maybeSendWorldSnapshot(false); }, 50);
  }
  function startOverlayLoop(){
    if (drawOverlayTimer) return;
    const tick = ()=>{ drawRemoteOverlay(); drawOverlayTimer = requestAnimationFrame(tick); };
    drawOverlayTimer = requestAnimationFrame(tick);
  }
  function sendLocalState(force){
    try{
      if (!embed || !localSid) return;
      const p = myPlayer();
      if (!p || !window.G) return;
      const msg = {
        kind:'state',
        x: Math.round(p.x||0), y: Math.round(p.y||0),
        hp: Math.round(p.hp||0), maxHp: Math.round(p.maxHp||0),
        level: Number(p.level||1),
        walkAnim: Number(p.walkAnim||0),
        character: p.design?.type || '',
        nick: localNick,
        selecting: !!inSelectionPhase(),
        stage: Number(window.G.stage||1),
        teamXp: Math.round(teamXpTotal||0),
        bossNeed: Math.round(teamBossThresholdXp||0),
        authority: isWorldAuthority(),
        ts: now(),
      };
      sendMx(msg);
    }catch(_){ }
  }

  function handleMxMessage(m){
    if (!m || typeof m !== 'object') return;
    if (m.from) markPeer(m.from);
    const k = m.kind || '';
    if (isSelf(m.from)) {
      if (k !== 'hello' && k !== 'hello_ack') return;
    }
    if (k === 'hello') {
      if (m.from){
        const rp = remotePlayers.get(String(m.from)) || { sid:String(m.from) };
        if (m.nick) rp.nick = String(m.nick).slice(0,20);
        if (m.char) rp.character = String(m.char);
        remotePlayers.set(String(m.from), rp);
      }
      sendMx({ kind:'hello_ack', nick: localNick, char: myPlayer()?.design?.type||'' });
      return;
    }
    if (k === 'hello_ack') {
      if (m.from){
        const rp = remotePlayers.get(String(m.from)) || { sid:String(m.from) };
        if (m.nick) rp.nick = String(m.nick).slice(0,20);
        if (m.char) rp.character = String(m.char);
        remotePlayers.set(String(m.from), rp);
      }
      return;
    }

    if (k === 'chat'){
      appendChatLine(m.nick || remotePlayers.get(String(m.from))?.nick || sidShort(m.from), m.text || '', false);
      return;
    }

    if (k === 'state'){
      const sid = String(m.from||'');
      if (!sid || sid === localSid) return;
      const rp = remotePlayers.get(sid) || { sid, rx:Number(m.x||0), ry:Number(m.y||0) };
      rp.x = Number(m.x||0); rp.y = Number(m.y||0);
      rp.hp = Number(m.hp||0); rp.maxHp = Number(m.maxHp||0);
      rp.level = Number(m.level||1); rp.walkAnim = Number(m.walkAnim||0);
      rp.character = String(m.character||rp.character||'');
      rp.nick = String(m.nick || rp.nick || sidShort(sid)).slice(0,20);
      rp.selecting = !!m.selecting;
      rp.authority = !!m.authority;
      rp.ts = Number(m.ts||now());
      remotePlayers.set(sid, rp);
      if (Number.isFinite(m.teamXp)) teamXpTotal = Math.max(teamXpTotal, Number(m.teamXp||0));
      if (Number.isFinite(m.bossNeed) && m.bossNeed>0) teamBossThresholdXp = Math.max(teamBossThresholdXp||0, Number(m.bossNeed));
      return;
    }

    if (k === 'world'){
      if (isSelf(m.from)) return;
      // Prefer explicit authority sender, fallback to seat0/first peer timing.
      applyWorldSnapshot(m);
      return;
    }

    if (k === 'char_selected'){
      if (m.from) selectedChars.add(m.from);
      if (m.from){
        const rp = remotePlayers.get(String(m.from)) || { sid:String(m.from) };
        rp.character = String(m.character||rp.character||'');
        rp.nick = String(m.nick||rp.nick||sidShort(m.from)).slice(0,20);
        remotePlayers.set(String(m.from), rp);
      }
      const need = Math.max(0, activeCount() - selectedChars.size);
      if (need <= 0){
        clearInterval(charTimer);
        setOverlay('', false);
        try{ if (window.G && !remoteLock) window.G.paused = false; }catch(_){ }
      } else if (!charChosen){
        setOverlay(`캐릭터 선택 중 · 대기 ${need}`, true);
      }
      return;
    }

    if (k === 'xp_gain'){
      try{
        const p = myPlayer();
        const amt = Number(m.amt||0);
        if (amt > 0){
          teamXpTotal = Math.max(teamXpTotal, Number(m.team||0)||0);
          if (teamXpTotal <= 0) teamXpTotal += Math.round(amt);
          // also award local EXP so all players progress together (best-effort coop)
          if (p){
            suppressXpRelay = true;
            p.gainExp(Math.round(amt));
          }
        }
      }catch(_){ }
      finally{ suppressXpRelay = false; }
      return;
    }

    if (k === 'phase_open'){
      const pkind = String(m.pkind||'');
      const pid = String(m.pid||'');
      if (!pkind || !pid) return;
      if (phase && phase.id === pid) return;
      phase = { kind: pkind, id: pid, owner: m.from||'', ready: new Set(), deadline: now() + (Number(m.secs||10)*1000) };
      if (m.from) phase.ready.add(m.from);
      if (window.G) window.G.paused = true;
      const label = pkind === 'levelup' ? '레벨업 선택' : '보물 선택';
      if ((m.from||'') !== localSid) setRemoteLock(label, true);
      return;
    }
    if (k === 'phase_ready'){
      if (!phase || phase.id !== String(m.pid||'')) return;
      if (m.from) phase.ready.add(m.from);
      if (phase.owner === localSid) maybeResumePhase();
      return;
    }
    if (k === 'phase_resume'){
      if (!phase || phase.id !== String(m.pid||'')) return;
      const pkind = phase.kind;
      endPhaseLocal(pkind, phase.id);
      setRemoteLock('', false);
      if (pkind === 'chest' && localChestOpen) releaseChest('done');
      return;
    }

    if (k === 'chest_claim'){
      pruneClaims();
      globalChestClaims.push({ from: String(m.from||''), x: Number(m.x||0), y: Number(m.y||0), ts: Number(m.ts||now()) });
      if (!isSelf(m.from)) {
        remoteChestLocks = Math.max(1, remoteChestLocks + 1);
        setRemoteLock('보물 선택', true);
      }
      return;
    }
    if (k === 'chest_release'){
      pruneClaims();
      globalChestClaims = (globalChestClaims||[]).filter(c => String(c.from||'') !== String(m.from||''));
      if (!isSelf(m.from)) {
        remoteChestLocks = Math.max(0, remoteChestLocks - 1);
        if (remoteChestLocks <= 0) setRemoteLock('', false);
      }
      return;
    }
    if (k === 'chest_phase_open'){
      if ((m.from||'') !== localSid) setRemoteLock('보물 문제/선택', true);
      return;
    }
    if (k === 'modal_state' && m.label){
      if (!charChosen && String(m.label).includes('캐릭터')) return;
      if (remoteLock || phase) setOverlay(`${m.label}${m.remain ? ' '+m.remain+'s' : ''}`, true);
      return;
    }
    if (k === 'modal_clear'){
      if (!phase && !remoteLock) setOverlay('', false);
      return;
    }
    if (k === 'run_reset'){
      teamXpTotal = 0;
      teamBossThresholdXp = null;
      return;
    }
    if (k === 'boss_spawn'){
      if (Number.isFinite(m.teamXp)) teamXpTotal = Math.max(teamXpTotal, Number(m.teamXp||0));
      if (Number.isFinite(m.threshold)) teamBossThresholdXp = Math.max(teamBossThresholdXp||0, Number(m.threshold||0));
      return;
    }
  }

  window.addEventListener('message', (e)=>{
    const d = e.data || {};
    if (d.type === 'bridge_init' && (((d.gameId||'').toLowerCase()===gameId) || !d.gameId)){
      initMsg = d;
      localSid = String(d.sessionId || d.mySid || localSid || '');
      localNick = String(d.nick || d.myNick || localNick || 'Player').slice(0,20);
      localSeat = Number.isFinite(Number(d.seat)) ? Number(d.seat) : localSeat;
      bridgeIsHost = !!d.isHost || (localSeat === 0);
      expectedHumans = Math.max(1, Number(d.humanCount || d.expectedHumans || 1));
      markPeer(localSid || 'me');
      if (embed){ setTimeout(beginFromRoom, 50); }
    }
    if (d.type === 'bridge_host'){
      bridgeIsHost = !!d.isHost || (Number.isFinite(localSeat) && localSeat === 0);
      if (d.hostSessionId) markPeer(String(d.hostSessionId));
    }
    if (d.type === 'game_start' && d.payload && (((d.payload.mode||'').toLowerCase() === 'mathexplorer') || ((d.payload.mode||'').toLowerCase() === 'math-explorer'))){
      startPayload = d.payload;
      applyDifficulty(startPayload.difficulty || 1);
      expectedHumans = Math.max(1, Number(startPayload.playerCount || expectedHumans || 1));
      setTimeout(sendHello, 30);
    }
    if (d.type === 'mx_set_difficulty'){ applyDifficulty(d.difficulty || 1); }
    if (d.type === 'mx_msg') handleMxMessage(d.msg || {});
    if (d.type === 'bridge_leave') { try{ post({ type:'mx_quit' }); }catch(_){} }
  });

  const hookInt = setInterval(()=>{ try{ hookGame(); ensureExitButton(); ensureChat(); }catch(_){} }, 300);
  setTimeout(()=> clearInterval(hookInt), 30000);

  if (embed){
    try{ document.querySelector('#gameOverScreen .button')?.addEventListener('click', (ev)=>{ ev.preventDefault(); location.reload(); }); }catch(_){ }
  }

  setInterval(()=>{
    try{
      if (!embed || !window.G) return;
      if (charChosen && activeCount()<=1 && !phase && !remoteLock) window.G.paused = false;
      // prune stale remotes
      const t = now();
      for (const [sid,rp] of remotePlayers){ if (t - Number(rp.ts||0) > 12000) remotePlayers.delete(sid); }
      if (!isWorldAuthority() && worldSnapshot && (t - Number(worldSnapshot.ts||0) > 1200)) {
        // authority stream stale: temporarily allow local simulation so game doesn't freeze.
      }
    }catch(_){ }
  }, 500);
  setInterval(()=>{ try{ if (embed && localSid) { sendHello(); sendLocalState(false); maybeSendWorldSnapshot(true); } }catch(_){} }, 4000);

  setTimeout(()=> post({ type:'bridge_ready' }), 50);
  // Fallback for slow bridge init: in embedded room, force-hide title and retry coop boot.
  setTimeout(()=>{ try{ if (embed) beginFromRoom(); }catch(_){} }, 1200);
})();
