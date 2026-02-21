(function(){
  const sp = new URLSearchParams(location.search);
  const embed = sp.get('embed') === '1';
  const gameId = sp.get('embedGame') || 'mathexplorer';
  let initMsg = null;
  let startPayload = null;
  let charChosen = false;
  let charTimer = null;
  let charDeadline = 0;
  let overlay = null;
  let levelUpTimer = null;
  let chestTimer = null;
  let localSid = '';
  let expectedHumans = 1;
  let peers = new Set();
  let selectedChars = new Set();
  let suppressXpRelay = false;
  let phase = null; // {kind,id,owner,ready:Set,deadline}
  let remoteLock = null; // chest/selection by another player
  let invulnBeforeLock = false;
  let localChestOpen = false;
  let chestOpenCount = 0;
  let remoteChestLocks = 0;
  let globalChestClaims = []; // recent claims best-effort

  function post(msg){ try{ parent?.postMessage(Object.assign({ gameId }, msg), '*'); }catch(_){} }
  function sendMx(m){ try{ post({ type:'mx_msg', msg:m||{} }); }catch(_){} }
  function sidShort(s){ return String(s||'').slice(0,4); }
  function now(){ return Date.now(); }
  function phaseKey(){ return phase ? `${phase.kind}:${phase.id}` : ''; }
  function myPlayer(){ try{ return window.G?.player || null; }catch(_){ return null; } }

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
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.18);z-index:9998;display:none;pointer-events:none;';
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
        if (!phase) { try{ if (window.G) window.G.paused = false; }catch(_){} }
        setOverlay('', false);
      }
    }catch(_){ }
  }

  function activeCount(){
    // Prefer observed peers (actual participants) over room-config/max slots.
    const observed = Math.max(1, peers.size||0);
    const configured = Math.max(1, Number(expectedHumans||0)||0);
    // If we only observe ourselves for a while, don't block on absent players.
    if (observed <= 1) return 1;
    return Math.min(4, Math.max(observed, Math.min(configured, observed)));
  }
  function markPeer(sid){ if (!sid) return; peers.add(String(sid)); }
  function isSelf(from){ return !!from && String(from) === String(localSid||''); }
  function pruneClaims(){
    const t = now();
    globalChestClaims = (globalChestClaims||[]).filter(c => (t - (c.ts||0)) < 30000);
  }
  function sendHello(){ sendMx({ kind:'hello', ts: now() }); }
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
      const list = arr && arr.length ? arr : null;
      if (list){
        const pick = list[Math.floor(Math.random()*list.length)];
        if (pick?.type && window.G?.selectChar) { window.G.selectChar(pick.type); return; }
      }
      document.querySelector('#charSelectGrid .character')?.click();
    }catch(_){ }
  }

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

  function startCharCountdown(){
    clearInterval(charTimer);
    charDeadline = now() + 10000;
    const tick = ()=>{
      const remain = Math.max(0, Math.ceil((charDeadline - now())/1000));
      const need = Math.max(0, activeCount() - selectedChars.size);
      setOverlay(`캐릭터 선택 (${remain}s)${need?` · 대기 ${need}`:''} · 최대4인`);
      if (remain <= 0){
        clearInterval(charTimer);
        // Retry a few times in case character grid was not yet rendered.
        let tries = 0;
        const retry = setInterval(()=>{
          tries++;
          chooseRandomChar();
          if (charChosen || tries >= 20){ clearInterval(retry); if (!charChosen) setOverlay('캐릭터 자동 선택 중…', true); }
        }, 200);
      }
    };
    tick();
    charTimer = setInterval(tick, 200);
  }

  function beginFromRoom(){
    // game bootstrap can be slower than bridge_init in iframe; wait until core APIs exist
    if (!window.G || typeof window.G.showCharSelect !== 'function' || !document.getElementById('charScreen')){
      setTimeout(beginFromRoom, 150);
      return;
    }
    hookCharacterSelect();
    applyDifficulty(startPayload?.difficulty ?? initMsg?.level ?? 1);
    if (embed) sendHello();
    showCharSelect();
    startCharCountdown();
    setTimeout(sendHello, 600);
    setTimeout(sendHello, 1500);
  }

  function autoPick(sel){
    try{
      const nodes = [...document.querySelectorAll(sel)].filter(n=>n.offsetParent!==null);
      if (!nodes.length) return;
      nodes[Math.floor(Math.random()*nodes.length)].click();
    }catch(_){ }
  }
  function clearPickTimers(){ clearInterval(levelUpTimer); clearInterval(chestTimer); }

  function wrapCardsForPhase(containerSel, kind){
    const root = document.querySelector(containerSel);
    if (!root) return;
    [...root.querySelectorAll('.upgradeCard, > div')].forEach(card=>{
      if (card.__mxWrapped) return;
      card.__mxWrapped = true;
      const orig = card.onclick;
      card.onclick = function(ev){
        try{ orig && orig.call(this, ev); }catch(err){ throw err; }
        try{ markLocalPhaseReady(kind); }catch(_){ }
      };
    });
  }

  function tryClaimChest(chest){
    // best-effort distributed lock (non-authoritative)
    if (remoteLock || localChestOpen) return false;
    pruneClaims();
    if ((globalChestClaims?.length||0) >= 3) return false;
    localChestOpen = true;
    chestOpenCount = Math.max(0, chestOpenCount) + 1;
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

  function patchNoPvPAndInvuln(){
    try{
      if (!window.Player || window.Player.prototype.__mxPatchedDamage) return;
      const P = window.Player.prototype;
      const origTake = P.takeDamage;
      P.takeDamage = function(dmg){
        if (this.__mxInvuln) return;
        return origTake.call(this, dmg);
      };
      P.__mxPatchedDamage = true;
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
          if (!suppressXpRelay && Number.isFinite(amt) && amt > 0){
            sendMx({ kind:'xp_gain', amt: Math.round(amt) });
          }
        }catch(_){ }
        return ret;
      };
      P.__mxPatchedXp = true;
    }catch(_){ }
  }

  function hookCharacterSelect(){
    if (!window.G || window.G.__mxBridgeHooked) return;
    window.G.__mxBridgeHooked = true;
    patchNoPvPAndInvuln();
    patchXpShare();

    const origSelect = window.G.selectChar?.bind(window.G);
    if (origSelect){
      window.G.selectChar = function(type){
        charChosen = true;
        clearInterval(charTimer);
        selectedChars.add(localSid||'me');
        setOverlay('다른 플레이어 캐릭터 선택 대기…', true);
        sendMx({ kind:'char_selected', character:type||'' });
        const out = origSelect(type);
        // Wait until others choose (best effort) before unpausing if game already started
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
        return out;
      };
    }

    const origLevelUp = window.G.showLevelUp?.bind(window.G);
    if (origLevelUp){
      window.G.showLevelUp = function(){
        const out = origLevelUp();
        openPhase('levelup', 10);
        wrapCardsForPhase('#upgrades', 'levelup');
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
        return out;
      };
    }

    const origCheckMath = window.G.checkMathAnswer?.bind(window.G);
    if (origCheckMath){
      window.G.checkMathAnswer = function(){
        const before = document.getElementById('itemScreen')?.classList.contains('hidden') === false;
        const out = origCheckMath();
        const afterOpen = document.getElementById('itemScreen') && !document.getElementById('itemScreen').classList.contains('hidden');
        if (afterOpen){
          openPhase('chest', 20);
          wrapCardsForPhase('#items', 'chest');
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

  function handleMxMessage(m){
    if (!m || typeof m !== 'object') return;
    if (m.from) markPeer(m.from);
    const k = m.kind || '';
    if (isSelf(m.from)) {
      // ignore self-echo for coordination packets; local state already applied
      if (k !== 'hello' && k !== 'hello_ack') return;
    }
    if (k === 'hello') {
      sendMx({ kind:'hello_ack' });
      return;
    }
    if (k === 'hello_ack') return;

    if (k === 'char_selected'){
      if (m.from) selectedChars.add(m.from);
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
        if (!p || !(amt>0)) return;
        suppressXpRelay = true;
        p.gainExp(Math.round(amt));
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
      if (!phase) return;
      if (phase.id !== String(m.pid||'')) return;
      if (m.from) phase.ready.add(m.from);
      if (phase.owner === localSid) maybeResumePhase();
      return;
    }

    if (k === 'phase_resume'){
      if (!phase) return;
      if (phase.id !== String(m.pid||'')) return;
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
      if (remoteLock || phase){
        setOverlay(`${m.label}${m.remain ? ' '+m.remain+'s' : ''}`, true);
      }
      return;
    }
    if (k === 'modal_clear'){
      if (!phase && !remoteLock) setOverlay('', false);
      return;
    }
  }

  window.addEventListener('message', (e)=>{
    const d = e.data || {};
    if (d.type === 'bridge_init' && (d.gameId===gameId || !d.gameId)){
      initMsg = d;
      localSid = String(d.sessionId || d.mySid || localSid || '');
      expectedHumans = Math.max(1, Number(d.humanCount || d.expectedHumans || 1));
      markPeer(localSid || 'me');
      if (embed){ setTimeout(beginFromRoom, 50); }
    }
    if (d.type === 'game_start' && d.payload && (d.payload.mode === 'mathexplorer')){
      startPayload = d.payload;
      applyDifficulty(startPayload.difficulty || 1);
      expectedHumans = Math.max(1, Number(startPayload.playerCount || expectedHumans || 1));
      setTimeout(sendHello, 30);
    }
    if (d.type === 'mx_set_difficulty'){ applyDifficulty(d.difficulty || 1); }
    if (d.type === 'mx_msg') handleMxMessage(d.msg || {});
  });

  const hookInt = setInterval(()=>{ try{ hookCharacterSelect(); }catch(_){} }, 300);
  setTimeout(()=> clearInterval(hookInt), 30000);

  if (embed){
    try{ document.querySelector('#gameOverScreen .button')?.addEventListener('click', (ev)=>{ ev.preventDefault(); location.reload(); }); }catch(_){ }
  }


  // Safety: if solo and char select somehow selected but game remains paused, unpause.
  setInterval(()=>{
    try{
      if (!embed || !window.G) return;
      if (charChosen && activeCount()<=1 && !phase && !remoteLock) window.G.paused = false;
    }catch(_){}
  }, 500);

  // Periodic hello to converge peer count (best effort, no authority)
  setInterval(()=>{ try{ if (embed && localSid) sendHello(); }catch(_){} }, 4000);

  setTimeout(()=> post({ type:'bridge_ready' }), 50);
})();
