(function(){
  const sp = new URLSearchParams(location.search);
  const embed = sp.get('embed') === '1';
  if (!embed) return;

  const GAME_ID = 'mathexplorer';
  const PHASES = {
    LOBBY:'lobby', CHAR_SELECT:'char_select', PLAYING:'playing',
    LEVEL_CHOICE:'level_choice', CHEST_CHOICE:'chest_choice', BOSS_INTRO:'boss_intro',
    ROUND_CLEAR:'round_clear', GAME_OVER:'game_over'
  };
  const state = {
    init:null, startPayload:null, localSid:'', hostSid:'', isHost:false, expectedHumans:1,
    peers:new Set(), rosterSids:[], phase:PHASES.LOBBY, phaseDeadline:0, phaseTimer:null,
    localCharChosen:false, localCharType:'', selectedBySid:{}, gameBooted:false, uiReady:false,
    chat:null, overlay:null, remoteStates:{}, worldSnap:null, labelsCanvas:null, labelsCtx:null, chatSeen:new Set(), chatSeq:0,
    selecting:false, choiceType:'', lastEventId:'', wrapped:false, entitySeq:1, lastWorldSeq:0, worldGhost:null,
    lastWorldAppliedAt:0, lastPhaseBroadcastAt:0, selectLockPos:null, __mxForceChoiceUi:false, __mxChoiceUiOpened:false, hostEnemySeen:{}, choiceDoneBySid:{}, choiceReqPending:false, choiceAckKey:'', tauntSid:'', tauntOffered:false, tauntChosen:false, lastAttackPulseSent:0, remoteAttackSeen:{}, __mxPendingChoiceCommit:'', __mxPendingChoiceAt:0,
    idMap:{ enemies:new WeakMap(), projectiles:new WeakMap(), enemyProjectiles:new WeakMap(), items:new WeakMap(), effects:new WeakMap() },
    ghostCache:{ monsters:Object.create(null), projectiles:Object.create(null), enemyProjectiles:Object.create(null) }, remoteFx:[], phaseParticipants:[], mapAppliedHash:''
  };
  const now=()=>Date.now();
  const G=()=>window.G||null;
  const mySid=()=>String(state.localSid||'');
  const hostSid=()=>String(state.hostSid || (state.startPayload?.roster?.[0]?.sid || ''));
  const iAmHost=()=> !!state.isHost || (mySid() && mySid()===hostSid());
  const safeNum=(v,d=0)=>{ const n=Number(v); return Number.isFinite(n)?n:d; };
  function getLocalAttackPulse(p){
    if(!p) return 0;
    return safeNum(p.lastAtk, safeNum(p.lastAttackTime, safeNum(p.lastAtkTime, safeNum(p.attackPulse, safeNum(p._lastAtk,0)))));
  }
  function getGlobalCtor(name){
    try{
      const w = window||globalThis;
      if (w && typeof w[name]==='function') return w[name];
    }catch(_){ }
    try{
      const fn = Function(`try { return typeof ${name} === 'function' ? ${name} : null; } catch(_) { return null; }`);
      const c = fn();
      if (typeof c === 'function'){ try{ window[name]=c; }catch(_){} return c; }
    }catch(_){ }
    return null;
  }
  const mxDbg=()=>{};
  function dbgBump(){}
  function post(msg){ try{ parent.postMessage(Object.assign({ gameId: GAME_ID }, msg), "*"); }catch(_){ } }
  function send(kind,payload){ post({ type:'mx_msg', msg:Object.assign({ kind, ts: now() }, payload||{}) }); }
  const sendPhase=(phase,payload)=>send('mx_phase',Object.assign({phase},payload||{}));
  const sendWorld=(payload)=>send('mx_world',payload||{});
  const sendState=(payload)=>send('mx_state',payload||{});
  const sendEvent=(evt,payload)=>send('mx_event',Object.assign({evt,id:`${evt}:${now()}:${Math.random().toString(36).slice(2,7)}`},payload||{}));
  function markPeer(sid){ sid=String(sid||'').trim(); if(!sid) return; const low=sid.toLowerCase(); if(low==='server'||low==='system'||low==='worker') return; state.peers.add(sid); }
  function activeCount(){ const e=Math.max(1, Number(state.expectedHumans||1)); const r=state.rosterSids.length?state.rosterSids.length:0; const p=Math.max(1, Array.from(state.peers||[]).filter(Boolean).length||0); return Math.min(4, Math.max(e,r,p)); }
  function ensureOverlay(){ if(state.overlay) return state.overlay; const el=document.createElement('div'); el.id='mxBridgeOverlay'; el.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:7px 12px;color:#fff;font:600 13px/1.2 sans-serif;pointer-events:none;display:none;'; document.body.appendChild(el); state.overlay=el; return el; }
  function setOverlay(t){ const el=ensureOverlay(); el.textContent=t||''; el.style.display=t?'block':'none'; }
  function ensureQuitBtn(){ if(document.getElementById('mxQuitBtn')) return; const b=document.createElement('button'); b.id='mxQuitBtn'; b.textContent='✕'; b.type='button'; b.style.cssText='position:fixed;top:10px;right:10px;z-index:99999;width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.35);color:#fff;font:700 18px/1 sans-serif;cursor:pointer;'; b.onclick=(e)=>{ e.preventDefault(); post({ type:'mx_quit' }); }; document.body.appendChild(b); }
  function esc(s){ return String(s||'').replace(/[&<>]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])); }
  function ensureChat(){ if(state.chat) return; const box=document.createElement('div'); box.id='mxChatBox'; box.style.cssText='position:fixed;left:10px;right:10px;bottom:10px;z-index:99999;background:rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px;color:#fff;font:12px/1.35 sans-serif;'; box.innerHTML='<div id="mxChatLog" style="height:90px;overflow:auto;margin-bottom:6px;background:rgba(0,0,0,.2);border-radius:6px;padding:6px"></div><div style="display:flex;gap:6px"><input id="mxChatInput" maxlength="180" placeholder="채팅" style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff"><button id="mxChatSend" type="button" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;cursor:pointer">전송</button></div>';
    document.body.appendChild(box); const log=box.querySelector('#mxChatLog'); const input=box.querySelector('#mxChatInput'); const btn=box.querySelector('#mxChatSend'); const append=(nick,text,self)=>{ const line=document.createElement('div'); line.innerHTML=`<span style="opacity:.82">${esc(nick)}:</span> <span>${esc(text)}</span>`; if(self) line.style.opacity='0.96'; log.appendChild(line); while(log.childElementCount>80) log.removeChild(log.firstChild); log.scrollTop=log.scrollHeight; }; const submit=()=>{ const text=String(input.value||'').trim(); if(!text) return; input.value=''; const id=`${mySid()||'self'}:${++state.chatSeq}:${now()}`; state.chatSeen.add(id); append('나', text, true); send('chat',{ text, t:'chat', kind:'chat', id, nick:(state.init?.nick||'') }); }; btn.onclick=submit; input.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); }}); state.chat={box,log,input,append}; }
  function ensureRemoteLabelCanvas(){ if(state.labelsCanvas) return; const c=document.createElement('canvas'); c.id='mxRemoteLabels'; c.style.cssText='position:fixed;inset:0;z-index:99998;pointer-events:none;'; document.body.appendChild(c); state.labelsCanvas=c; state.labelsCtx=c.getContext('2d'); const resize=()=>{ c.width=Math.max(1,innerWidth); c.height=Math.max(1,innerHeight); }; addEventListener('resize', resize); resize(); }
  function ensureUi(){ if(state.uiReady) return; state.uiReady=true; installEmbedStartLock(); ensureQuitBtn(); ensureChat(); ensureRemoteLabelCanvas(); }
  function applyDifficulty(diff){ try{ const hard=Number(diff||1)>=2; if(typeof window.hardMode!=='undefined' && !!window.hardMode!==hard && G()?.toggleHardMode) G().toggleHardMode(); }catch(_){ } }
  function ensureGlobalsReady(){ return !!(window.G && typeof window.G.showCharSelect==='function' && typeof window.G.selectChar==='function'); }
  function hideMainScreen(){ try{ document.getElementById('mainScreen')?.classList.add('hidden'); }catch(_){ } }
  function forceEmbedScreens(){
    try{
      if (!embed) return;
      const ms = document.getElementById('mainScreen');
      if (ms) { ms.classList.add('hidden'); ms.style.display='none'; }
      // startPayload 오기 전에는 싱글 첫화면 클릭으로 로컬 시작되는 것을 막는다.
      if (ms && !state.startPayload){
        ms.style.pointerEvents = 'none';
        ms.style.opacity = '0.45';
      } else if (ms){
        ms.style.pointerEvents = '';
        ms.style.opacity = '';
      }
    }catch(_){ }
  }
  function installEmbedStartLock(){
    try{
      if (!embed || window.__mxEmbedStartLockInstalled) return;
      window.__mxEmbedStartLockInstalled = true;
      document.addEventListener('click', (e)=>{
        try{
          if (!embed) return;
          if (state.startPayload && state.phase !== PHASES.LOBBY) return;
          const t = e.target;
          if (!t || !t.closest) return;
          if (t.closest('#mainScreen') || (!state.startPayload && t.closest('#charScreen'))){
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            setOverlay(state.startPayload ? '캐릭터 선택 동기화 대기중…' : '룸 시작 대기중…');
          }
        }catch(_){ }
      }, true);
    }catch(_){ }
  }
  function pauseGame(v){ try{ if(G()) G().paused=!!v; }catch(_){ } }
  function isLocalChoiceLock(){ return !!state.selecting && (state.choiceType==='레벨업' || state.choiceType==='보물' || !!isChoiceVisible()); }
  function setSelecting(v, label){ state.selecting=!!v; state.choiceType=label||''; const g=G(); if(g&&g.player){ g.player.__mxInvuln = !!v; if(v){ try{ state.selectLockPos={ x:safeNum(g.player.x), y:safeNum(g.player.y) }; if('vx' in g.player) g.player.vx=0; if('vy' in g.player) g.player.vy=0; }catch(_){} } else { state.selectLockPos=null; } } else if(!v){ state.selectLockPos=null; } }
  function showSelectingOverlay(label, remain){ const t = (typeof remain==='number'&&remain>=0) ? `${label} ${remain}s` : label; setOverlay(`선택중 · ${t}`); }
  function randomCharType(){ const arr=Array.isArray(window.CHAR_DESIGNS)?window.CHAR_DESIGNS:[]; if(!arr.length) return ''; const item=arr[Math.floor(Math.random()*arr.length)]; return String(item?.type||''); }
  function openCharSelect(){ if(!ensureGlobalsReady()) return false; ensureUi(); hideMainScreen(); try{ G().showCharSelect(); state.gameBooted=true; }catch(_){ } return true; }
  function selectedCount(){ return Object.keys(state.selectedBySid||{}).filter(k=>state.selectedBySid[k]!==undefined&&state.selectedBySid[k]!==null&&String(state.selectedBySid[k])!=='').length; }
  function hasUniqueSelections(){ const vals=Object.values(state.selectedBySid||{}).map(v=>String(v||'')).filter(Boolean); return (new Set(vals)).size===vals.length; }
  function isCharTakenByOther(type){ const t=String(type||''); if(!t) return false; const me=mySid()||'self'; return Object.entries(state.selectedBySid||{}).some(([sid,v])=>sid!==me && String(v||'')===t); }
  function refreshCharSelectLocks(){ try{ const grid=document.getElementById('charSelectGrid'); if(!grid) return; const arr=Array.isArray(window.CHAR_DESIGNS)?window.CHAR_DESIGNS:[]; const me=mySid()||'self'; Array.from(grid.children||[]).forEach((el,idx)=>{ if(!(el instanceof HTMLElement)) return; const t=String(el.dataset.charType||arr[idx]?.type||''); if(t&&!el.dataset.charType) el.dataset.charType=t; const owner=Object.entries(state.selectedBySid||{}).find(([sid,v])=>sid!==me && String(v||'')===t); const taken=!!owner; el.style.opacity=taken?'0.35':''; el.style.filter=taken?'grayscale(0.8)':''; el.style.pointerEvents=taken?'none':''; el.style.outline=(state.localCharType&&state.localCharType===t)?'2px solid #4cf':''; let badge=el.querySelector('.mxTakenBadge'); if(taken){ if(!badge){ badge=document.createElement('div'); badge.className='mxTakenBadge'; badge.style.cssText='position:absolute;left:4px;right:4px;bottom:4px;padding:2px 4px;font:700 11px/1.2 sans-serif;background:rgba(0,0,0,.7);color:#ffb;border-radius:4px;text-align:center;'; el.style.position='relative'; el.appendChild(badge); } badge.textContent='다른 플레이어 선택'; } else if(badge){ badge.remove(); } }); }catch(_){ } }
  function hasEveryoneSelected(){ return selectedCount() >= activeCount() && hasUniqueSelections(); }
  function setPhase(phase, opts={}){
    const prevPhase = state.phase;
    const prevDeadline = safeNum(state.phaseDeadline,0);
    const nextDeadline = opts.deadline ? (Number(opts.deadline)||0) : prevDeadline;
    const sameChoicePhase = ((phase===PHASES.LEVEL_CHOICE||phase===PHASES.CHEST_CHOICE) && prevPhase===phase && Math.abs(nextDeadline-prevDeadline)<=1200);
    state.phase=phase; if(opts.deadline) state.phaseDeadline=Number(opts.deadline)||0;
    if(Array.isArray(opts.participants)) state.phaseParticipants = opts.participants.map(v=>String(v||'')).filter(Boolean);
    if(state.phaseTimer){ clearInterval(state.phaseTimer); state.phaseTimer=null; }
    const ticker = (label,onExpire)=>{
      const tick=()=>{ const remain=Math.max(0, Math.ceil((state.phaseDeadline-now())/1000)); showSelectingOverlay(label, remain); if(now()>=state.phaseDeadline){ clearInterval(state.phaseTimer); state.phaseTimer=null; onExpire&&onExpire(); } };
      tick(); state.phaseTimer=setInterval(tick,200);
    };
    if(phase===PHASES.CHAR_SELECT){ pauseGame(true); setSelecting(true,'캐릭터'); ticker('캐릭터 선택', ()=>{ if(!state.localCharChosen){ const t=randomCharType(); if(t&&G()?.selectChar) G().selectChar(t); else document.querySelector('#charSelectGrid .character')?.click(); } if(iAmHost()) finalizeCharSelect(true); }); }
    else if(phase===PHASES.LEVEL_CHOICE){ if(!Array.isArray(state.phaseParticipants)||!state.phaseParticipants.length) state.phaseParticipants=getExpectedChoiceParticipants(); if(!sameChoicePhase){ resetChoiceDone(); state.__mxChoiceUiOpened=false; } setSelecting(true,'레벨업'); forceOpenChoiceUiForPhase(); ticker('레벨업 선택', ()=>{ if(isChoiceVisible()) autoPickCard('#upgrades .upgradeCard'); markChoiceDoneLocal(true); }); pauseGame(true); }
    else if(phase===PHASES.CHEST_CHOICE){ if(!Array.isArray(state.phaseParticipants)||!state.phaseParticipants.length) state.phaseParticipants=getExpectedChoiceParticipants(); if(!sameChoicePhase){ resetChoiceDone(); state.__mxChoiceUiOpened=false; state.__mxChestMathSolved=false; state.__mxChestAbortedLocal=false; } setSelecting(true,'보물'); forceOpenChoiceUiForPhase(); ticker('보물 선택', ()=>{ const vis=isChoiceVisible(); if(vis==='itemScreen' && state.__mxChestMathSolved){ autoPickCard('#items .upgradeCard'); markChoiceDoneLocal(true); } else { markChoiceDoneLocal(false); try{ document.getElementById('mathScreen')?.classList.add('hidden'); document.getElementById('itemScreen')?.classList.add('hidden'); }catch(_){} } }); pauseGame(true); }
    else if(phase===PHASES.PLAYING){ state.phaseParticipants=[]; setSelecting(false,''); setOverlay(''); pauseGame(false); hideChoiceScreens(); }
    else { pauseGame(true); }
  }
  function hideChoiceScreens(){ try{ ['levelUpScreen','itemScreen','mathScreen'].forEach(id=>document.getElementById(id)?.classList.add('hidden')); }catch(_){ } }
  function autoPickCard(sel){ try{ document.querySelector(sel)?.click(); }catch(_){ } }
  function currentPhaseKey(){ return `${state.phase}:${safeNum(state.phaseDeadline,0)}`; }
  function resetChoiceDone(){ state.choiceDoneBySid={}; state.choiceAckKey=''; }
  function getExpectedChoiceParticipants(){ const arr=(Array.isArray(state.phaseParticipants)?state.phaseParticipants:[]).filter(Boolean); if(arr.length) return Array.from(new Set(arr)); const roster=(Array.isArray(state.rosterSids)?state.rosterSids:[]).filter(Boolean); if(roster.length) return Array.from(new Set(roster)); const sel=Object.keys(state.selectedBySid||{}).filter(Boolean); if(sel.length) return Array.from(new Set(sel)); return [mySid()||'self']; }
  function inChoicePhase(){ return state.phase===PHASES.LEVEL_CHOICE || state.phase===PHASES.CHEST_CHOICE; }
  function localChoiceFinished(){ const sid=mySid()||''; return !!(sid && state.choiceDoneBySid && Object.prototype.hasOwnProperty.call(state.choiceDoneBySid,sid)); }
  function queueLocalChoiceCommit(kind){ try{ state.__mxPendingChoiceCommit=String(kind||''); state.__mxPendingChoiceAt=now(); }catch(_){} }
  function flushPendingLocalChoiceCommit(){ try{ if(!inChoicePhase() || localChoiceFinished()) return; const k=String(state.__mxPendingChoiceCommit||''); if(!k) return; if((k==='level' && state.phase!==PHASES.LEVEL_CHOICE) || (k==='item' && state.phase!==PHASES.CHEST_CHOICE)) return; markChoiceDoneLocal(true); state.__mxPendingChoiceCommit=''; }catch(_){} }
  function markChoiceDoneLocal(ok=true){
    if(!(state.phase===PHASES.LEVEL_CHOICE || state.phase===PHASES.CHEST_CHOICE)) return;
    const sid=mySid()||''; if(!sid) return;
    const key=currentPhaseKey();
    const nowTs = now();
    const samePhase = (state.choiceAckKey===key);
    const prevVal = Object.prototype.hasOwnProperty.call(state.choiceDoneBySid||{}, sid) ? !!state.choiceDoneBySid[sid] : null;
    const tooSoon = samePhase && (nowTs - safeNum(state.lastChoiceAckSentAt,0) < 250) && prevVal===!!ok;
    if(tooSoon) return;
    state.choiceAckKey=key; state.choiceDoneBySid[sid]=!!ok; state.lastChoiceAckSentAt = nowTs;
    sendEvent('choice_done',{ phase:state.phase, ok:!!ok, deadline:safeNum(state.phaseDeadline,0) });
    if(iAmHost()) maybeFinishSharedChoice();
  }
  function maybeFinishSharedChoice(){
    if(!iAmHost()) return;
    if(!inChoicePhase()) return;
    const participants=getExpectedChoiceParticipants();
    if(!participants.length) return;
    const me = String(mySid()||'');
    const nowTs = now();
    const roster = Array.from(new Set((Array.isArray(state.rosterSids)?state.rosterSids:[]).filter(Boolean)));
    const live = new Set();
    for(const sid of (roster.length?roster:participants)){
      const ss=String(sid||''); if(!ss) continue;
      if(ss===me){ live.add(ss); continue; }
      const rs = state.remoteStates && state.remoteStates[ss];
      const last = safeNum(rs&&rs.ts, 0);
      if(last && (nowTs-last) > 2500) continue;
      if(rs && safeNum(rs.hp,1)<=0) continue;
      live.add(ss);
    }
    if(me){
      try{ const g=G(); const hp=safeNum(g&&g.player&&g.player.hp,1); if(hp>0) live.add(me); }catch(_){ live.add(me); }
    }
    let targetList = participants.filter(sid => live.has(String(sid||'')));
    if(!targetList.length) targetList = Array.from(live);
    if(!targetList.length) targetList = participants;
    const doneMap = state.choiceDoneBySid||{};
    const done = targetList.every(sid => Object.prototype.hasOwnProperty.call(doneMap, sid));
    if(done){ endChoicePhase(); return; }
    const doneCount = targetList.filter(sid => Object.prototype.hasOwnProperty.call(doneMap, sid)).length;
    const liveHumans = Math.max(1, (me?1:0) + Object.values(state.remoteStates||{}).filter(rs=>rs && (nowTs-safeNum(rs.ts,0))<=2500 && safeNum(rs.hp,1)>0).length);
    if(doneCount >= Math.min(liveHumans, targetList.length||liveHumans)){ endChoicePhase(); return; }
  }
  function forceOpenChoiceUiForPhase(){ try{ const g=G(); if(!g) return; const before=isChoiceVisible(); state.__mxForceChoiceUi=true; try{ if(state.phase===PHASES.LEVEL_CHOICE && !before && typeof g.showLevelUp==='function') g.showLevelUp(); if(state.phase===PHASES.CHEST_CHOICE && !before){ if(state.__mxChestAbortedLocal) return; if(state.__mxChestMathSolved && typeof g.showItemScreen==='function') g.showItemScreen(); else if(typeof g.showMathScreen==='function') g.showMathScreen(g?.player?.x||0,g?.player?.y||0); else if(typeof g.showItemScreen==='function') g.showItemScreen(); } } finally { state.__mxForceChoiceUi=false; } if(isChoiceVisible()) state.__mxChoiceUiOpened=true; }catch(_){ state.__mxForceChoiceUi=false; } }
  function broadcastPhaseSync(phase, deadline, extra){ if(!iAmHost()) return; const participants = (phase===PHASES.LEVEL_CHOICE||phase===PHASES.CHEST_CHOICE) ? getExpectedChoiceParticipants() : []; sendPhase(phase,Object.assign({ deadline: deadline||0, expectedHumans: activeCount(), selectedBySid: state.selectedBySid||{}, phaseParticipants: participants }, extra||{})); }
  function beginCharSelect(){ if(!openCharSelect()){ setTimeout(beginCharSelect,120); return; } applyDifficulty(state.startPayload?.difficulty || state.init?.level || 1); state.selectedBySid={}; state.localCharChosen=false; state.localCharType=''; refreshCharSelectLocks(); const deadline=now()+10000; setPhase(PHASES.CHAR_SELECT,{ deadline }); if(iAmHost()) broadcastPhaseSync(PHASES.CHAR_SELECT, deadline); }
  function maybeStartSequence(){ if(!embed || !state.init) return; ensureUi(); forceEmbedScreens(); if(!state.startPayload){ setOverlay('게임 시작 동기화 대기…'); pauseGame(true); return; } if(state.phase===PHASES.LOBBY) beginCharSelect(); }
  function finalizeCharSelect(force){ if(!iAmHost()) return; if(!force && !hasUniqueSelections()){ mxDbg('char_duplicate_block', { selectedBySid: state.selectedBySid }); broadcastPhaseSync(PHASES.CHAR_SELECT, Math.max(now()+3000, safeNum(state.phaseDeadline,0)||0), { selectedBySid: state.selectedBySid||{} }); return; } if(!(hasEveryoneSelected() || force)) return; broadcastPhaseSync(PHASES.PLAYING,0); setPhase(PHASES.PLAYING); }
  function endChoicePhase(){ if(!iAmHost()) return; resetChoiceDone(); state.__mxChoiceUiOpened=false; state.__mxChestMathSolved=false; state.__mxChestAbortedLocal=false; state.lastChoiceEndAt=now(); broadcastPhaseSync(PHASES.PLAYING,0); setPhase(PHASES.PLAYING); try{ const g=G(); if(g){ g.paused=false; } }catch(_){} }
  function maybeInjectTauntShieldCard(){
    try{
      if(state.tauntOffered || state.tauntChosen) return;
      const root=document.getElementById('itemScreen') || document;
      const cards=[...root.querySelectorAll('.upgradeCard')];
      if(!cards.length) return;
      const target = cards[cards.length-1];
      if(!target || target.dataset.mxTaunt==='1') return;
      target.dataset.mxTaunt='1';
      target.dataset.mxTauntApplied='0';
      const titleEl = target.querySelector('h3,.title,.itemName,.upgradeTitle') || target;
      const descEl = target.querySelector('p,.desc,.description,.itemDesc') || null;
      if(titleEl){ try{ titleEl.textContent='도발의 방패'; }catch(_){} }
      if(descEl){ try{ descEl.textContent='몬스터 우선 타깃(한 번만 등장)'; }catch(_){} }
      target.style.outline='2px solid rgba(80,200,255,.9)';
      target.addEventListener('click', ()=>{
        try{
          if(target.dataset.mxTauntApplied==='1') return;
          target.dataset.mxTauntApplied='1';
          state.tauntChosen=true; state.tauntSid=mySid()||state.localSid||'';
          sendEvent('taunt_shield_pick',{ sid: state.tauntSid });
        }catch(_){ }
      }, { once:true });
      state.tauntOffered=true;
    }catch(_){ }
  }
  function getWorldPlayerBySid(sid){ const ws=(state.worldSnap&&state.worldSnap.players)||{}; return sid && ws && typeof ws==='object' ? ws[sid] : null; }
function hostRetargetAndBuffEnemies(g){
  if(!iAmHost() || !g || !Array.isArray(g.enemies)) return;
  const me=mySid()||'self';
  let targetSid='';
  if(state.tauntSid && state.tauntSid!==me){
    const tp = state.remoteStates[state.tauntSid] || getWorldPlayerBySid(state.tauntSid);
    if(tp) targetSid=state.tauntSid;
  }
  for(const e of g.enemies){
    if(!e || e.__mxGhost) continue;
    try{
      const hitSid = String(e.__mxLastHitSid||'');
      const hitFresh = (now() - safeNum(e.__mxLastHitAt,0)) < 1800;
      if(hitSid && hitFresh && hitSid!==me){
        const hp = state.remoteStates[hitSid] || getWorldPlayerBySid(hitSid);
        if(hp) targetSid = hitSid;
      }
    }catch(_){ }
    if(!e.__mxScaled){
      try{
        if('maxHp' in e){ e.maxHp=Math.max(1,Math.round(safeNum(e.maxHp,1)*1.5)); }
        if('hp' in e){ e.hp=Math.max(1,Math.round(safeNum(e.hp,1)*1.5)); }
        if('damage' in e){ e.damage=Math.max(1, +(safeNum(e.damage,1)*2).toFixed(2)); }
        e.__mxScaled=true;
      }catch(_){}
    }
    let tgt=null;
    if(targetSid){ tgt = state.remoteStates[targetSid] || getWorldPlayerBySid(targetSid); }
    if(!tgt){
      let best=null, bestD=Infinity;
      for(const [sid,rs] of Object.entries(state.remoteStates||{})){
        if(!rs) continue;
        const dx=safeNum(rs.x)-safeNum(e.x), dy=safeNum(rs.y)-safeNum(e.y);
        const d=dx*dx+dy*dy;
        if(d<bestD){ bestD=d; best=rs; }
      }
      const lp=g.player;
      if(lp){
        const dx=safeNum(lp.x)-safeNum(e.x), dy=safeNum(lp.y)-safeNum(e.y);
        const d=dx*dx+dy*dy;
        if(d<bestD){ best={x:lp.x,y:lp.y}; bestD=d; }
      }
      tgt=best;
    }
    if(!tgt) continue;
    try{
      const dx=safeNum(tgt.x)-safeNum(e.x), dy=safeNum(tgt.y)-safeNum(e.y);
      const len=Math.hypot(dx,dy)||1;
      const pull = e.isBoss ? 0.85 : 0.55;
      if('vx' in e) e.vx = (safeNum(e.vx,0)*0.45) + (dx/len)*pull;
      if('vy' in e) e.vy = (safeNum(e.vy,0)*0.45) + (dy/len)*pull;
      if('targetX' in e) e.targetX = safeNum(tgt.x);
      if('targetY' in e) e.targetY = safeNum(tgt.y);
    }catch(_){ }
  }
  // 원격 플레이어 공격 판정은 remote_attack 이벤트로만 처리한다.
  // (주기적 자동판정은 공격 불가/중복타격/XP 중복의 주된 원인이 되었음)
  try{ mirrorTeamProgressToRemotes(); }catch(_){ }
}

function simulateRemoteAttackOnHost(rs, meta={}){
  try{
    if(!iAmHost()) return;
    const g=G(); if(!g || !Array.isArray(g.enemies)) return;
    const sid=String(rs?.sid||meta.sid||'');
    if(!sid) return;
    if(sid===String(mySid()||'')) return;

    state.remoteAttackSeen = state.remoteAttackSeen||{};
    const pulse = safeNum(meta.pulse, safeNum(rs?.attackPulse,0));
    if(pulse && state.remoteAttackSeen[sid]===pulse) return;
    if(pulse) state.remoteAttackSeen[sid]=pulse;

    const t=now();
    const cdKey='__mxRemoteEvtAtkAt_'+sid;
    const atkSpeedMs = Math.max(90, safeNum(meta.atkSpeed, safeNum(rs?.atkSpeed, 220)));
    const interval = Math.max(80, Math.round(atkSpeedMs*0.75));
    if(!pulse){
      const last=safeNum(state[cdKey],0);
      if(t-last<interval) return;
    }
    state[cdKey]=t;

    const sx=safeNum(meta.x, safeNum(rs?.x, safeNum(state.remoteStates?.[sid]?.x)));
    const sy=safeNum(meta.y, safeNum(rs?.y, safeNum(state.remoteStates?.[sid]?.y)));
    if(!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    const tx=safeNum(meta.tx, NaN), ty=safeNum(meta.ty, NaN);
    const ctype=String(meta.charType||rs?.charType||state.selectedBySid?.[sid]||'').toLowerCase();
    const isRanged = /ranger|archer|mage|wizard/.test(ctype);

    const baseRange = Math.max(isRanged?180:90, safeNum(meta.range, safeNum(rs?.range, isRanged?240:140)));
    const maxRange = baseRange + (isRanged ? 50 : 28);

    let best=null, bestScore=Infinity;
    for(const e of (Array.isArray(g.enemies)?g.enemies:[])){
      if(!e || e.__mxGhost || safeNum(e.hp,1)<=0) continue;
      const ex=safeNum(e.x), ey=safeNum(e.y);
      const dFromPlayer=Math.hypot(ex-sx, ey-sy);
      if(dFromPlayer > maxRange + Math.max(18, safeNum(e.size,16))) continue;

      let score=dFromPlayer;
      if(Number.isFinite(tx) && Number.isFinite(ty)){
        const td=Math.hypot(ex-tx, ey-ty);
        const hitbox=Math.max(22, safeNum(e.size,16)+14);
        if(td > Math.max(hitbox, 48) && dFromPlayer > maxRange*0.92) continue;
        score = td*0.78 + dFromPlayer*0.22;
      }
      if(score < bestScore){ best=e; bestScore=score; }
    }
    if(!best) return;

    const dmgBase=Math.max(1, safeNum(meta.damage, safeNum(rs?.damage, 10)));
    const critChance=Math.max(0, Math.min(1, safeNum(meta.crit, safeNum(rs?.crit,0))));
    const ang = Math.atan2(safeNum(best.y)-sy, safeNum(best.x)-sx);
    try{ pushRemoteFx(isRanged?(/ranger|archer/.test(ctype)?'archer':'mage'):'melee', sx, sy, safeNum(best.x), safeNum(best.y)); }catch(_){}

    // 원격 공격은 호스트 플레이어 객체를 빌려쓰지 않고 직접 판정/데미지만 반영한다.
    // (host 화면 캐릭터/몬스터 사라짐, 직업 연출 혼선, 투사체 중복 생성 방지)
    const crit = Math.random() < critChance;
    const dmg = Math.max(1, Math.round(dmgBase * (crit ? 2 : 1)));
    try{ best.__mxLastHitSid = sid; best.__mxLastHitAt = t; }catch(_){ }
    if(typeof best.takeDamage==='function') best.takeDamage(dmg);
    else if('hp' in best) best.hp = safeNum(best.hp,1)-dmg;
    try{ if(crit && g && typeof g.textParticle==='function') g.textParticle(best.x, best.y - 24, '치명타!', '#ff0', 0.8); }catch(_){ }
    try{ if(g && typeof g.textParticle==='function') g.textParticle(best.x, best.y, `-${Math.round(dmg)}`, '#f00', 0.7); }catch(_){ }

    // 피격 이펙트(가시성 향상)
    try{
      if(!isRanged && Array.isArray(g.slashes)){
        g.slashes.push({
          x:sx, y:sy, angle:ang, opacity:1,
          life:8,
          color:'#7fd3ff'
        });
        if(g.slashes.length>140) g.slashes.splice(0, g.slashes.length-140);
      }
      if(isRanged){
        // 원거리 직업은 slash 배열(전사 베기 렌더) 대신 textParticle 기반 연출만 사용
        const archer = /ranger|archer/.test(ctype);
        const mage = /mage|wizard/.test(ctype);
        const dx = safeNum(best.x)-sx, dy = safeNum(best.y)-sy;
        try{ if(g && typeof g.textParticle==='function'){
          g.textParticle(sx, sy-10, archer?'↗':'✦', archer?'#ffd27a':'#9fd8ff', 0.45);
          g.textParticle(sx + dx*0.55, sy + dy*0.55, archer?'➶':'✦', archer?'#ffcf66':'#8ed0ff', 0.45);
          if(mage){ g.textParticle(sx + dx*0.78, sy + dy*0.78, '✦', '#b8e6ff', 0.45); }
          g.textParticle(best.x, best.y-14, archer?'✶':'✹', archer?'#ffe39a':'#c6ecff', 0.35);
        } }catch(_){ }
      }
    }catch(_){ }
  }catch(_){ }
}

  function idFor(group,obj){ if(!obj||typeof obj!=='object') return ''; let id=state.idMap[group].get(obj); if(!id){ id=`${group[0]}${state.entitySeq++}`; state.idMap[group].set(obj,id); } return id; }
  function slimEntity(group,e){ if(!e) return null; const o={ id:idFor(group,e), x:Math.round(safeNum(e.x)), y:Math.round(safeNum(e.y)) };
    if('hp' in e) o.hp=Math.round(safeNum(e.hp)); if('maxHp' in e) o.maxHp=Math.round(safeNum(e.maxHp));
    if('type' in e) o.type=e.type; if(e.isBoss) o.isBoss=true; if('life' in e) o.life=Math.round(safeNum(e.life));
    if('damage' in e) o.damage=Math.round(safeNum(e.damage)); if('value' in e) o.value=Math.round(safeNum(e.value));
    if('vx' in e) o.vx=+safeNum(e.vx).toFixed(2); if('vy' in e) o.vy=+safeNum(e.vy).toFixed(2);
    if('size' in e) o.size=Math.round(Math.max(1,safeNum(e.size,0)));
    if('radius' in e) o.radius=Math.round(Math.max(1,safeNum(e.radius,0)));
    if('width' in e) o.width=Math.round(Math.max(1,safeNum(e.width,0)));
    if('height' in e) o.height=Math.round(Math.max(1,safeNum(e.height,0)));
    if('color' in e) o.color=String(e.color||'');
    if('isBossProjectile' in e) o.isBossProjectile=!!e.isBossProjectile;
    if('isEnemy' in e) o.isEnemy=!!e.isEnemy; if('isArrow' in e) o.isArrow=!!e.isArrow;
    return o;
  }
  function hostAwardXpFromKills(monsterSlimList){
    if(!iAmHost()) return;
    if(inChoicePhase && inChoicePhase()) { try{ state.hostEnemySeen = state.hostEnemySeen || {}; }catch(_){} return; }
    if((now() - safeNum(state.lastChoiceEndAt,0)) < 1200) return;
    const g=G(); const pl=g&&g.player;
    if(!pl || typeof pl.gainExp!=='function') return;
    const nextSeen={};
    let award=0;
    const host = mySid()||'self';
    for(const e of (Array.isArray(g.enemies)?g.enemies:[])){
      const id = idFor('enemies', e);
      nextSeen[id] = {
        hp:safeNum(e?.hp,1), isBoss:!!e?.isBoss, value:safeNum(e?.value,0),
        lastHitSid:String(e?.__mxLastHitSid||''), lastHitAt:safeNum(e?.__mxLastHitAt,0)
      };
    }
    const prevSeen = state.hostEnemySeen || {};
    for(const [id,prev] of Object.entries(prevSeen)){
      if(!prev || nextSeen[id]) continue;
      const hpPrev = safeNum(prev.hp,1);
      if(hpPrev <= 0) continue;
      const sid = String(prev.lastHitSid||'');
      const recent = (now() - safeNum(prev.lastHitAt,0)) <= 3000;
      // guest 공격도 host Player.dealDamage 경로로 처리되어 score/XP가 이미 적용됨.
      // 여기서 추가 가산하면 팀 XP/레벨업이 2번 오를 수 있으므로 bookkeeping만 유지.
      if(!sid || sid===host || !recent) continue;
    }
    state.hostEnemySeen = nextSeen;
    if(award>0){
      try{ pl.gainExp(award); }catch(_){}
      try{ if(Array.isArray(g.items) && g.items.length){ g.items = g.items.filter(it=> String(it?.type||'')!=='exp'); } }catch(_){}
    }
  }
  function serializeWorld(){ const g=G(); if(!g||!g.player) return null; const p=g.player; const hostLvl=Math.round(safeNum(p.level,1)), hostExp=Math.round(safeNum(p.exp,0)), hostExpNext=Math.round(safeNum(p.expNext,1)); const players={}; players[mySid()||'self']={ sid:mySid()||'self', x:Math.round(safeNum(p.x)), y:Math.round(safeNum(p.y)), hp:Math.round(safeNum(p.hp)), maxHp:Math.round(safeNum(p.maxHp)), lvl:hostLvl, exp:hostExp, expNext:hostExpNext, selecting:!!state.selecting, name: state.init?.nick||'', charType: state.localCharType||'' }; for (const [sid,rs] of Object.entries(state.remoteStates||{})){ if(!sid||!rs) continue; players[sid]={ sid, x:Math.round(safeNum(rs.x)), y:Math.round(safeNum(rs.y)), hp:Math.round(safeNum(rs.hp)), maxHp:Math.round(safeNum(rs.maxHp)), lvl:hostLvl, exp:hostExp, expNext:hostExpNext, selecting:!!rs.selecting, name:String(rs.name||''), charType:String(rs.charType||''), damage:safeNum(rs.damage,0), range:safeNum(rs.range,0), atkSpeed:safeNum(rs.atkSpeed,0), crit:safeNum(rs.crit,0), speed:safeNum(rs.speed,0), multishot:safeNum(rs.multishot,0), pierce:safeNum(rs.pierce,0) }; }
    const monsters=(Array.isArray(g.enemies)?g.enemies:[]).slice(0,180).map(e=>slimEntity('enemies',e)).filter(Boolean);
    hostAwardXpFromKills(monsters);
    try{ if(Array.isArray(g.items) && g.items.length){ g.items = g.items.filter(it=> String(it?.type||'')!=='exp'); } }catch(_){}
    const drops=(Array.isArray(g.items)?g.items:[]).slice(0,80).map(it=>({ id:idFor('items',it), x:Math.round(safeNum(it.x)), y:Math.round(safeNum(it.y)), type:String(it.type||''), value:Math.round(safeNum(it.value,0)) })).filter(Boolean); const obstacles=(Array.isArray(g.obstacles)?g.obstacles:[]).slice(0,120).map((o,idx)=>({id:'o'+idx,x:Math.round(safeNum(o.x)),y:Math.round(safeNum(o.y)),size:+safeNum(o.size,20).toFixed(2),type:String(o.type||'rock')}));
    const slashes=(Array.isArray(g.slashes)?g.slashes:[]).slice(0,80).map((e,idx)=>({ id:`s${idx}:${Math.round(safeNum(e.x))}:${Math.round(safeNum(e.y))}`, x:Math.round(safeNum(e.x)), y:Math.round(safeNum(e.y)), angle:+safeNum(e.angle).toFixed(3), opacity:+safeNum(e.opacity,1).toFixed(3), life:Math.round(safeNum(e.life,1)), isHammer:!!e.isHammer, color:String(e.color||'') }));
    const playerSync={ x:Math.round(safeNum(p.x)), y:Math.round(safeNum(p.y)), hp:Math.round(safeNum(p.hp)), maxHp:Math.round(safeNum(p.maxHp)), level:Math.round(safeNum(p.level,1)), exp:Math.round(safeNum(p.exp,0)), expNext:Math.round(safeNum(p.expNext,1)), speed:safeNum(p.speed), damage:safeNum(p.damage), range:safeNum(p.range), atkSpeed:safeNum(p.atkSpeed), crit:safeNum(p.crit), multishot:safeNum(p.multishot), pierce:safeNum(p.pierce), itemLevels:Object.assign({}, p.itemLevels||{}), skillLevels:Object.assign({}, p.skillLevels||{}) };
    return { seq: ++state.lastWorldSeq, phase:state.phase, stage:Math.round(safeNum(g.stage,1)), score:Math.round(safeNum(g.score)), teamXp:Math.round(teamXpEstimate()), nextBossScore:Math.round(safeNum(g.nextBossScore,700)), bossCount:Math.round(safeNum(g.bossCount,0)), player:playerSync, players, entities:{ monsters, projectiles:(Array.isArray(g.projectiles)?g.projectiles:[]).slice(0,220).map(e=>slimEntity('projectiles',e)).filter(Boolean), enemyProjectiles:(Array.isArray(g.enemyProjectiles)?g.enemyProjectiles:[]).slice(0,220).map(e=>slimEntity('enemyProjectiles',e)).filter(Boolean), drops, slashes, obstacles } }; }
  function _ghostDrawCircle(x,y,r,fill,stroke){ try{ const c=window.ctx; if(!c) return; c.save(); c.fillStyle=fill||'rgba(255,80,80,.8)'; c.beginPath(); c.arc(x,y,Math.max(2,r||8),0,Math.PI*2); c.fill(); if(stroke){ c.strokeStyle=stroke; c.lineWidth=2; c.stroke(); } c.restore(); }catch(_){} }
  function makeGhostEnemy(e){ return { __mxGhost:true, __mxId:String(e?.id||''), x:safeNum(e?.x), y:safeNum(e?.y), hp:safeNum(e?.hp,1), maxHp:Math.max(1,safeNum(e?.maxHp,1)), size:Math.max(10,safeNum(e?.size||e?.radius,18)), isBoss:!!e?.isBoss, type:e?.type, color:e?.color, update(){ return this.hp>0; }, draw(){ try{ const c=window.ctx; if(!c) return; const r=this.isBoss?Math.max(this.size,24):this.size; c.save(); c.globalAlpha=0.95; c.fillStyle='rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(this.x,this.y+r*0.55,r*0.65,r*0.26,0,0,Math.PI*2); c.fill(); c.fillStyle=this.color|| (this.isBoss?'rgba(170,70,255,.9)':'rgba(210,75,75,.92)'); c.fillRect(this.x-r*0.45,this.y-r*0.15,r*0.9,r*0.95); c.fillRect(this.x-r*0.7,this.y-r*0.05,r*0.25,r*0.7); c.fillRect(this.x+r*0.45,this.y-r*0.05,r*0.25,r*0.7); c.fillRect(this.x-r*0.3,this.y+r*0.8,r*0.18,r*0.55); c.fillRect(this.x+r*0.12,this.y+r*0.8,r*0.18,r*0.55); c.fillStyle=this.isBoss?'#35104f':'#1f3d16'; c.fillRect(this.x-r*0.45,this.y-r*0.55,r*0.9,r*0.35); c.fillStyle='#fff'; c.fillRect(this.x-r*0.2,this.y-r*0.33,Math.max(2,r*0.12),Math.max(2,r*0.12)); c.fillRect(this.x+r*0.08,this.y-r*0.33,Math.max(2,r*0.12),Math.max(2,r*0.12)); if(this.maxHp>0){ const w=Math.max(18,r*2.1), h=4; c.fillStyle='rgba(0,0,0,.55)'; c.fillRect(this.x-w/2,this.y-r-10,w,h); c.fillStyle=this.isBoss?'#ffb000':'#ff5a5a'; c.fillRect(this.x-w/2,this.y-r-10,Math.max(0,Math.min(w,w*(this.hp/this.maxHp))),h);} c.restore(); }catch(_){ _ghostDrawCircle(this.x,this.y,this.isBoss?Math.max(this.size,24):this.size, this.isBoss?'rgba(255,120,40,.9)':'rgba(220,60,60,.85)', this.isBoss?'#ff0':null); } } }; }
  function makeGhostProjectile(p, enemy){ return { __mxGhost:true, __mxId:String(p?.id||''), x:safeNum(p?.x), y:safeNum(p?.y), vx:safeNum(p?.vx), vy:safeNum(p?.vy), life:Math.max(1,safeNum(p?.life,5)), size:Math.max(4,safeNum(p?.size||p?.radius, enemy?10:6)), damage:safeNum(p?.damage,0), color:String(p?.color||''), isRock:!!p?.isRock, isBossProjectile:!!p?.isBossProjectile, update(){ this.life=Math.max(0,this.life-1); return this.life>0; }, draw(){ try{ const c=window.ctx; if(!c) return; c.save(); c.globalAlpha=0.95; if(this.isArrow){ const ang=Math.atan2(safeNum(this.vy,0), safeNum(this.vx,1)); const len=Math.max(8, Math.max(this.size,5)*2.2); c.translate(this.x,this.y); c.rotate(ang); c.strokeStyle=this.color || 'rgba(255,210,120,.95)'; c.lineWidth=2; c.beginPath(); c.moveTo(-len*0.45,0); c.lineTo(len*0.4,0); c.stroke(); c.beginPath(); c.moveTo(len*0.4,0); c.lineTo(len*0.15,-3); c.lineTo(len*0.15,3); c.closePath(); c.fillStyle=this.color || 'rgba(255,210,120,.95)'; c.fill(); } else { c.fillStyle=this.color || (enemy?'rgba(255,180,60,.95)':'rgba(120,220,255,.95)'); c.beginPath(); c.arc(this.x,this.y,Math.max(this.size, enemy?6:5),0,Math.PI*2); c.fill(); c.fillStyle='rgba(255,255,255,.45)'; c.fillRect(this.x-1,this.y-1,2,2); } c.restore(); }catch(_){ _ghostDrawCircle(this.x,this.y,this.size, enemy?'rgba(255,180,60,.9)':'rgba(120,220,255,.9)'); } } } }
  function makeGhostDrop(d){ return { __mxGhost:true, __mxId:String(d?.id||''), x:safeNum(d?.x), y:safeNum(d?.y), type:String(d?.type||'exp'), value:safeNum(d?.value,1), update(){ return true; }, draw(){ try{ const c=window.ctx; if(!c) return; c.save(); c.globalAlpha=0.75; c.fillStyle=this.type==='exp'?'rgba(90,180,255,.9)':'rgba(255,220,80,.9)'; c.beginPath(); c.arc(this.x,this.y,4,0,Math.PI*2); c.fill(); c.restore(); }catch(_){} } }; }
  function _mxSyncProps(dst, src){ if(!dst||!src) return dst; for(const k of ['x','y','vx','vy','hp','maxHp','damage','size','radius','width','height','life','type','color','isArrow','isEnemy','isBossProjectile']){ if(k in src){ try{ dst[k]=src[k]; }catch(_){} } } return dst; }
  function _mxCacheSyncList(kind, list, make){ if(!state.ghostCache||typeof state.ghostCache!=='object'){ state.ghostCache={ monsters:Object.create(null), projectiles:Object.create(null), enemyProjectiles:Object.create(null) }; } const cache=(state.ghostCache&&state.ghostCache[kind])||(state.ghostCache[kind]=Object.create(null)); const out=[]; const seen=Object.create(null); for(const e of (Array.isArray(list)?list:[])){ if(!e) continue; const id=String(e.id||''); if(!id) continue; seen[id]=1; let obj=cache[id]; if(!obj){ obj=make(e); if(!obj) continue; cache[id]=obj; } _mxSyncProps(obj,e); out.push(obj); } for(const id of Object.keys(cache)){ if(!seen[id]) delete cache[id]; } return out; }
  function makeSyncedEnemy(e, stage){ try{ const x=safeNum(e?.x), y=safeNum(e?.y); let obj=null; const BossCtor=getGlobalCtor('Boss'); const EnemyCtor=getGlobalCtor('Enemy'); if(e&&e.isBoss && typeof BossCtor==='function'){ obj = new BossCtor(x,y, Math.max(1, safeNum(stage,1))); } else if(typeof EnemyCtor==='function'){ const forceType = (e&&typeof e.type==='number') ? e.type : null; obj = new EnemyCtor(x,y, Math.max(1, safeNum(stage,1)), forceType); } if(!obj) return makeGhostEnemy(e); obj.__mxGhost=true; obj.__mxId=String(e?.id||''); obj.__mxNet=true; _mxSyncProps(obj,e); obj.isBoss=!!e?.isBoss; if(typeof obj.maxHp!=='number' || !Number.isFinite(obj.maxHp)) obj.maxHp=Math.max(1,safeNum(e?.maxHp, obj.hp||1)); if(typeof obj.hp!=='number' || !Number.isFinite(obj.hp)) obj.hp=safeNum(e?.hp, obj.maxHp||1); if('lastDmg' in obj && typeof e?.lastDmg==='number') obj.lastDmg=e.lastDmg; if('animPhase' in obj && typeof e?.animPhase==='number') obj.animPhase=e.animPhase; obj.update=function(){ this.animPhase=safeNum(this.animPhase,0)+0.12; return this.hp>0; }; return obj; }catch(_){ return makeGhostEnemy(e); } }
  function makeSyncedProjectile(p, enemy){ try{ let obj=null; const ProjectileCtor=getGlobalCtor('Projectile'); if(typeof ProjectileCtor==='function' && !enemy){ const ang=Math.atan2(safeNum(p?.vy,0), safeNum(p?.vx,1)); const owner={ x:safeNum(p?.x), y:safeNum(p?.y), damage:safeNum(p?.damage,1), pierce:99, dealDamage(){} }; obj = new ProjectileCtor(safeNum(p?.x), safeNum(p?.y), ang, owner, !!p?.isArrow); obj.owner=owner; obj.hit = new Set(); obj.angle=ang; } else { obj = makeGhostProjectile(p, enemy); } obj.__mxGhost=true; obj.__mxId=String(p?.id||''); _mxSyncProps(obj,p); if('vx' in obj || 'vy' in obj) obj.angle=Math.atan2(safeNum(obj.vy,0), safeNum(obj.vx,1)); if(obj.owner){ obj.owner.x=safeNum(p?.x,obj.owner.x); obj.owner.y=safeNum(p?.y,obj.owner.y); obj.owner.damage=safeNum(p?.damage,obj.owner.damage); } obj.update=function(){ return true; }; return obj; }catch(_){ return makeGhostProjectile(p, enemy); } }
  function buildGhostWorld(s){ const ents=s?.entities||{}; const stage=safeNum(s?.stage,1); return { monsters:_mxCacheSyncList('monsters', (Array.isArray(ents.monsters)?ents.monsters:[]), (e)=>makeSyncedEnemy(e, stage)), projectiles:_mxCacheSyncList('projectiles', (Array.isArray(ents.projectiles)?ents.projectiles:[]), (p)=>makeSyncedProjectile(p,false)), enemyProjectiles:_mxCacheSyncList('enemyProjectiles', (Array.isArray(ents.enemyProjectiles)?ents.enemyProjectiles:[]), (p)=>makeSyncedProjectile(p,true)), drops:(Array.isArray(ents.drops)?ents.drops:[]).map(makeGhostDrop), slashes:(Array.isArray(ents.slashes)?ents.slashes:[]).map(v=>Object.assign({},v)), obstacles:(Array.isArray(ents.obstacles)?ents.obstacles:[]).map(v=>Object.assign({},v)) }; }
  function applyWorldSnapshotToGuest(s){ const g=G(); if(!g||!s) return; try{ const seq=safeNum(s.seq,0); if(seq && seq < safeNum(state.lastWorldSeq,0)) return; if(seq) state.lastWorldSeq = seq; state.lastWorldAppliedAt = now(); const ph=String(s.phase||''); if(ph && ph!==state.phase && Object.values(PHASES).includes(ph)){ setPhase(ph,{ deadline:safeNum(state.phaseDeadline,0) }); } applyHostPlayerProgressToGuest(s); syncRemoteStatesFromWorldPlayers(s); state.worldGhost = buildGhostWorld(s); try{ const obs=state.worldGhost&&state.worldGhost.obstacles; const g=G(); if(g && Array.isArray(obs) && obs.length){ const hash=JSON.stringify(obs); if(hash!==state.mapAppliedHash){ g.obstacles = obs.map(o=>({x:o.x,y:o.y,size:o.size,type:o.type})); state.mapAppliedHash=hash; } } }catch(_){ } }catch(_){ } }
  function teamXpEstimate(){ const g=G(); const p=g&&g.player; return Math.max(0, safeNum(p?.exp,0)); }
  function getHostTeamProgress(){ const g=G(); const p=g&&g.player; if(!g||!p) return null; return { level:Math.round(safeNum(p.level,1)), exp:Math.round(safeNum(p.exp,0)), expNext:Math.round(safeNum(p.expNext,1)) }; }
  function mirrorTeamProgressToRemotes(){ if(!iAmHost()) return; const tp=getHostTeamProgress(); if(!tp) return; for(const rs of Object.values(state.remoteStates||{})){ if(!rs) continue; rs.lvl=tp.level; rs.exp=tp.exp; rs.expNext=tp.expNext; } }
  function applyHostPlayerProgressToGuest(s){ const g=G(); if(!g||!g.player||!s) return; try{ const hp=s.player||{}; const lp=g.player; if(typeof hp.maxHp==='number') lp.maxHp = hp.maxHp; if(typeof hp.hp==='number') lp.hp = Math.max(0, Math.min(safeNum(lp.maxHp||hp.maxHp,99999), hp.hp)); if(typeof hp.level==='number') lp.level = hp.level; if(typeof hp.exp==='number') lp.exp = hp.exp; if(typeof hp.expNext==='number') lp.expNext = hp.expNext; // 게스트 로컬 플레이어 좌표는 로컬 입력 기준으로 유지한다.
      // (호스트 좌표로 덮어쓰면 게스트 입력/공격이 죽고, 게스트 상태가 다시 호스트로 송신되어 캐릭터가 겹쳐 끌려가는 문제가 생김)
      if(!iAmHost() && state.phase===PHASES.PLAYING){
        // 좌표 미동기화가 아니라, 월드(몬스터/투사체/드롭)만 호스트 스냅샷으로 렌더링하고
        // 플레이어 진행도(레벨/경험치/스탯)만 동기화한다.
      }
      // 레벨/팀경험치만 공유. 개별 보상으로 달라지는 전투 스탯/아이템 레벨은 로컬 유지.
      if(typeof s.score==='number') g.score = s.score; if(typeof s.stage==='number') g.stage = s.stage; if(typeof s.nextBossScore==='number') g.nextBossScore = s.nextBossScore; if(typeof s.bossCount==='number') g.bossCount = s.bossCount; }catch(_){} }
  function syncRemoteStatesFromWorldPlayers(s){
    const players=(s&&s.players&&typeof s.players==='object')?s.players:null; if(!players) return;
    const tNow = now();
    for (const [sid,ps] of Object.entries(players)){
      if(!sid || sid===mySid()) continue;
      const prev=state.remoteStates[sid]||{};
      const nx=safeNum(ps?.x), ny=safeNum(ps?.y);
      const dtMs = Math.max(1, tNow - safeNum(prev.lastUpdateAt, tNow));
      const dt = Math.min(0.25, dtMs/1000);
      const estVx = Number.isFinite(prev.x) ? (nx - safeNum(prev.x)) / dt : 0;
      const estVy = Number.isFinite(prev.y) ? (ny - safeNum(prev.y)) / dt : 0;
      const rx=Number.isFinite(prev.rx)?prev.rx:nx, ry=Number.isFinite(prev.ry)?prev.ry:ny;
      state.remoteStates[sid] = Object.assign({}, prev, {
        sid, x:nx, y:ny, rx, ry,
        vx: (safeNum(prev.vx, estVx) * 0.45) + (estVx * 0.55),
        vy: (safeNum(prev.vy, estVy) * 0.45) + (estVy * 0.55),
        hp:safeNum(ps?.hp), maxHp:safeNum(ps?.maxHp), lvl:safeNum(ps?.lvl,1), exp:safeNum(ps?.exp,0), expNext:safeNum(ps?.expNext,1),
        selecting:!!ps?.selecting, name:String(ps?.name||prev?.name||''), charType:String(ps?.charType||''),
        damage:safeNum(ps?.damage, safeNum(prev?.damage,0)), range:safeNum(ps?.range, safeNum(prev?.range,0)), atkSpeed:safeNum(ps?.atkSpeed, safeNum(prev?.atkSpeed,0)),
        crit:safeNum(ps?.crit, safeNum(prev?.crit,0)), speed:safeNum(ps?.speed, safeNum(prev?.speed,0)), multishot:safeNum(ps?.multishot, safeNum(prev?.multishot,0)), pierce:safeNum(ps?.pierce, safeNum(prev?.pierce,0)),
        ts: tNow, lastUpdateAt: tNow
      });
    }
  }
  function drawRemoteLabels(){ ensureRemoteLabelCanvas(); const c=state.labelsCanvas, ctx=state.labelsCtx; if(!ctx) return; ctx.clearRect(0,0,c.width,c.height); if(!iAmHost() && state.worldGhost && state.phase===PHASES.PLAYING){ try{ const g=G(), lp=g&&g.player; const camX=lp?(safeNum(lp.x)-c.width/2):0, camY=lp?(safeNum(lp.y)-c.height/2):0; const mons=Array.isArray(state.worldGhost.monsters)?state.worldGhost.monsters:[]; if((g?.enemies?.length||0)===0){ for(const m of mons){ if(!m) continue; const x=safeNum(m.x)-camX, y=safeNum(m.y)-camY; if(x<-80||y<-80||x>c.width+80||y>c.height+80) continue; ctx.save(); ctx.globalAlpha=.85; ctx.fillStyle=m.isBoss?'rgba(255,120,40,.85)':'rgba(220,60,60,.8)'; ctx.beginPath(); ctx.arc(x,y,Math.max(8,safeNum(m.size,16)),0,Math.PI*2); ctx.fill(); ctx.restore(); } } const prs=[...(Array.isArray(state.worldGhost.projectiles)?state.worldGhost.projectiles:[]),...(Array.isArray(state.worldGhost.enemyProjectiles)?state.worldGhost.enemyProjectiles:[])]; if((g?.projectiles?.length||0)+(g?.enemyProjectiles?.length||0)===0){ for(const p of prs){ const x=safeNum(p.x)-camX, y=safeNum(p.y)-camY; if(x<-40||y<-40||x>c.width+40||y>c.height+40) continue; ctx.save(); ctx.globalAlpha=.9; if(p && p.isArrow){ const ang=Math.atan2(safeNum(p.vy,0), safeNum(p.vx,1)); const len=Math.max(8, safeNum(p.size,5)*2.2); ctx.translate(x,y); ctx.rotate(ang); ctx.strokeStyle='rgba(255,210,120,.95)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-len*0.45,0); ctx.lineTo(len*0.4,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(len*0.4,0); ctx.lineTo(len*0.15,-3); ctx.lineTo(len*0.15,3); ctx.closePath(); ctx.fillStyle='rgba(255,210,120,.95)'; ctx.fill(); } else { ctx.fillStyle=p.isBossProjectile?'rgba(255,120,80,.95)':(p.damage?'rgba(255,210,120,.95)':'rgba(120,220,255,.95)'); ctx.beginPath(); ctx.arc(x,y,Math.max(3,safeNum(p.size,5)),0,Math.PI*2); ctx.fill(); } ctx.restore(); } } }catch(_){} } const arr=Object.values(state.remoteStates||{}); const g=G();
    if(isChoiceVisible()) return;
    // guest overlay for host-synced monsters/projectiles (disabled by default; game loop injects ghost entities)
    try{ if(false && !iAmHost() && state.worldGhost){ const lp0=g&&g.player; const camX0=lp0?(safeNum(lp0.x)-c.width/2):0; const camY0=lp0?(safeNum(lp0.y)-c.height/2):0; const lpMon=g&&g.player; const camXm=lpMon?(safeNum(lpMon.x)-c.width/2):0; const camYm=lpMon?(safeNum(lpMon.y)-c.height/2):0; for(const mon of (Array.isArray(state.worldGhost.monsters)?state.worldGhost.monsters:[])){ if(!mon) continue; const mx=safeNum(mon.x)-camXm, my=safeNum(mon.y)-camYm; if(mx<-60||my<-60||mx>c.width+60||my>c.height+60) continue; ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle=mon.isBoss?'rgba(255,120,40,.8)':'rgba(220,60,60,.8)'; ctx.beginPath(); ctx.arc(mx,my,Math.max(8,safeNum(mon.size,16)),0,Math.PI*2); ctx.fill(); ctx.restore(); } const projs=[...(Array.isArray(state.worldGhost.projectiles)?state.worldGhost.projectiles:[]), ...(Array.isArray(state.worldGhost.enemyProjectiles)?state.worldGhost.enemyProjectiles:[])]; for(const pr of projs){ if(!pr) continue; const x0=safeNum(pr.x)-camX0, y0=safeNum(pr.y)-camY0; if(x0<-40||y0<-40||x0>c.width+40||y0>c.height+40) continue; ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle=(pr&&pr.isBossProjectile)?'rgba(255,120,80,.95)':((pr&&pr.damage)?'rgba(255,210,120,.95)':'rgba(120,220,255,.95)'); ctx.beginPath(); ctx.arc(x0,y0,Math.max(3,safeNum(pr.size,5)),0,Math.PI*2); ctx.fill(); ctx.restore(); } } }catch(_){}
    if(!arr.length) return; const lp=g&&g.player; const camX=lp?(safeNum(lp.x)-c.width/2):0; const camY=lp?(safeNum(lp.y)-c.height/2):0; ctx.font='12px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom'; const tNow=now(); for(const st of arr){ if(!st||!st.sid||st.sid===mySid()) continue; const age=Math.max(0,Math.min(160,tNow-safeNum(st.lastUpdateAt,st.ts||tNow))); const tx=safeNum(st.x)+safeNum(st.vx,0)*(age/1000)*0.12; const ty=safeNum(st.y)+safeNum(st.vy,0)*(age/1000)*0.12; const dx=tx-safeNum(st.rx,tx), dy=ty-safeNum(st.ry,ty); const dist=Math.hypot(dx,dy); const a=dist>80?0.68:(dist>30?0.48:0.30); st.rx=Number.isFinite(st.rx)?(st.rx+dx*a):tx; st.ry=Number.isFinite(st.ry)?(st.ry+dy*a):ty; if(dist>180){ st.rx=tx; st.ry=ty; } const x=safeNum(st.rx)-camX, y=safeNum(st.ry)-camY; if(x<-100||y<-120||x>c.width+100||y>c.height+100) continue; ctx.save(); ctx.translate(x,y); ctx.globalAlpha=0.94; ctx.fillStyle='rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(0,25,20,10,0,0,Math.PI*2); ctx.fill(); const char=(Array.isArray(window.CHAR_DESIGNS)?window.CHAR_DESIGNS:[]).find(ch=>String(ch?.type||'')===String(st.charType||'')); if(char&&typeof char.draw==='function'){ try{ const frame=(Math.floor((tNow/140))%2); char.draw(ctx, frame, 1.5); }catch(_){ } } else { ctx.fillStyle='rgba(80,180,255,.85)'; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill(); } ctx.restore(); const name=String(st.name||`유저-${String(st.sid).slice(0,4)}`); if(st.selecting){ ctx.fillStyle='rgba(255,255,0,.95)'; ctx.fillText('선택중',x,y-64); } ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(x-46,y-80,92,18); ctx.fillStyle='white'; ctx.fillText(name,x,y-65); if(typeof st.hp==='number'&&typeof st.maxHp==='number'&&st.maxHp>0){ const w=62,h=5, px=x-w/2, py=y-54; ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(px,py,w,h); ctx.fillStyle='lime'; ctx.fillRect(px,py,Math.max(0,Math.min(w,w*(st.hp/st.maxHp))),h); } } }
  function pushRemoteFx(kind, x, y, tx, ty){
    try{
      if(!Number.isFinite(x)||!Number.isFinite(y)) return;
      state.remoteFx = Array.isArray(state.remoteFx) ? state.remoteFx : [];
      state.remoteFx.push({ kind:String(kind||'melee'), x:safeNum(x), y:safeNum(y), tx:safeNum(tx,x), ty:safeNum(ty,y), t:now() });
      if(state.remoteFx.length>80) state.remoteFx.splice(0, state.remoteFx.length-80);
    }catch(_){}
  }
  function drawRemoteFx(){
    try{
      const c=window.ctx; if(!c) return;
      const arr=Array.isArray(state.remoteFx)?state.remoteFx:[]; if(!arr.length) return;
      const t=now();
      for(let i=arr.length-1;i>=0;i--){
        const fx=arr[i]; const age=t-safeNum(fx.t,0);
        if(age>220){ arr.splice(i,1); continue; }
        const a=Math.max(0,1-age/220);
        const x=safeNum(fx.x), y=safeNum(fx.y), tx=safeNum(fx.tx,x), ty=safeNum(fx.ty,y);
        c.save(); c.globalAlpha = 0.25 + a*0.75;
        if(fx.kind==='archer'){
          const ang=Math.atan2(ty-y, tx-x); const len=Math.max(12, Math.hypot(tx-x,ty-y)*Math.min(1,0.35+a*0.35));
          c.translate(x,y); c.rotate(ang); c.strokeStyle='rgba(255,210,120,.95)'; c.lineWidth=2; c.beginPath(); c.moveTo(0,0); c.lineTo(len,0); c.stroke(); c.beginPath(); c.moveTo(len,0); c.lineTo(len-6,-3); c.lineTo(len-6,3); c.closePath(); c.fillStyle='rgba(255,220,140,.95)'; c.fill();
        }else if(fx.kind==='mage'){
          const px=x+(tx-x)*(0.2+0.6*(1-a)), py=y+(ty-y)*(0.2+0.6*(1-a));
          c.fillStyle='rgba(170,225,255,.95)'; c.beginPath(); c.arc(px,py,4+a*3,0,Math.PI*2); c.fill();
          c.strokeStyle='rgba(120,200,255,.7)'; c.lineWidth=2; c.beginPath(); c.moveTo(x,y); c.lineTo(px,py); c.stroke();
        }else{
          c.strokeStyle='rgba(255,255,255,.95)'; c.lineWidth=3; c.beginPath(); c.arc(x,y,10+a*8,-0.8,0.8); c.stroke();
        }
        c.restore();
      }
    }catch(_){}
  }
  function handlePhaseSync(m){ if(typeof m.expectedHumans==='number') state.expectedHumans=Math.max(1,Number(m.expectedHumans||1)); if(m.selectedBySid&&typeof m.selectedBySid==='object') state.selectedBySid=Object.assign({}, m.selectedBySid); refreshCharSelectLocks(); const phase=String(m.phase||''); if(Object.values(PHASES).includes(phase)){ if(phase===PHASES.CHAR_SELECT && !openCharSelect()){ setTimeout(()=>handlePhaseSync(m),120); return; } const incomingDeadline=(Number(m.deadline||0)||0); const sameChoiceResync=((phase===PHASES.LEVEL_CHOICE||phase===PHASES.CHEST_CHOICE) && phase===state.phase && localChoiceFinished()); setPhase(phase,{ deadline:(sameChoiceResync ? safeNum(state.phaseDeadline,incomingDeadline) : incomingDeadline), participants:Array.isArray(m.phaseParticipants)?m.phaseParticipants:undefined }); if(phase===PHASES.LEVEL_CHOICE || phase===PHASES.CHEST_CHOICE) forceOpenChoiceUiForPhase(); } }
  function handleMxEvent(m){ const id=String(m.id||''); if(id&&id===state.lastEventId) return; if(id) state.lastEventId=id; const evt=String(m.evt||''); if(evt==='boss_spawn' && !iAmHost()){ try{ if (G() && G().boss == null && typeof G().spawnBoss==='function') G().spawnBoss(); }catch(_){ } } if(evt==='char_conflict'){ const to=String(m.to||''); if(to && to!==(mySid()||'')) return; const c=String(m.character||''); if(state.localCharType && state.localCharType===c){ state.localCharChosen=false; state.localCharType=''; const me=mySid()||'self'; delete state.selectedBySid[me]; refreshCharSelectLocks(); setOverlay('같은 캐릭터 선택됨 · 다른 캐릭터를 골라주세요'); } return; } if(evt==='chest_touch'){ if(iAmHost()){ try{ if(inChoicePhase()) return; const g=G(); if(!g) return; const tx=safeNum(m.x, NaN), ty=safeNum(m.y, NaN); let hit=null, idx=-1; const items=Array.isArray(g.items)?g.items:[]; for(let i=0;i<items.length;i++){ const it=items[i]; if(!it||it.type!=='chest') continue; const dx=safeNum(it.x)-tx, dy=safeNum(it.y)-ty; if(!Number.isFinite(tx)||!Number.isFinite(ty) || (dx*dx+dy*dy)<=900){ hit=it; idx=i; break; } } if(hit && idx>=0){ try{ g.items.splice(idx,1); }catch(_){} } if(typeof g.showMathScreen==='function') g.showMathScreen(hit?hit.x:tx||0, hit?hit.y:ty||0); }catch(_){} } return; } if(evt==='choice_request'){ if(iAmHost()){ const phaseReq=String(m.phase||''); const uiNow = isChoiceVisible(); /* guest 요청으로도 페이즈를 시작할 수 있어야 함 (host UI 표시 여부와 무관) */ if(inChoicePhase() && state.phase===phaseReq){ return; } const deadline = now() + (phaseReq===PHASES.CHEST_CHOICE ? 20000 : 12000); state.phaseParticipants=getExpectedChoiceParticipants(); broadcastPhaseSync(phaseReq, deadline,{ phaseParticipants: state.phaseParticipants.slice() }); setPhase(phaseReq,{deadline, participants: state.phaseParticipants.slice()}); } return; } if(evt==='remote_attack'){ const sid=String(m.from||m.sid||''); if(iAmHost()){ if(sid && sid===String(mySid()||'')) return; const rs=(state.remoteStates&&state.remoteStates[sid])||Object.assign({sid}, m||{}); simulateRemoteAttackOnHost(rs,{ sid, x:m.x, y:m.y, tx:m.tx, ty:m.ty, damage:m.damage, range:m.range, crit:m.crit, charType:m.charType, pulse:m.pulse }); return; } try{ if(sid && sid===String(mySid()||'')) return; const g=G(); if(!g) return; const x=safeNum(m.x, NaN), y=safeNum(m.y, NaN), tx=safeNum(m.tx, x), ty=safeNum(m.ty, y); if(!Number.isFinite(x)||!Number.isFinite(y)) return; const ctype=String(m.charType||'').toLowerCase(); const isRanged=/ranger|archer|mage|wizard/.test(ctype); const ang=Math.atan2((Number.isFinite(ty)?ty:y)-y,(Number.isFinite(tx)?tx:x)-x); try{ pushRemoteFx(isRanged?(/ranger|archer/.test(ctype)?'archer':'mage'):'melee', x, y, tx, ty); }catch(_){} if(isRanged){ const archer=/ranger|archer/.test(ctype), mage=/mage|wizard/.test(ctype); const dx=(Number.isFinite(tx)?tx:x)-x, dy=(Number.isFinite(ty)?ty:y)-y; const mx=x + dx*0.55, my=y + dy*0.55; try{ if(typeof g.textParticle==='function'){ g.textParticle(x, y-10, archer?'↗':'✦', archer?'#ffd27a':'#9fd8ff', 0.45); g.textParticle(mx, my, archer?'➶':'✦', archer?'#ffcf66':'#8ed0ff', 0.45); if(mage) g.textParticle(x+dx*0.78, y+dy*0.78, '✦', '#b8e6ff', 0.45); } }catch(_){} } else if(Array.isArray(g.slashes)){ g.slashes.push({ x, y, angle:ang, opacity:0.95, life:6, color:'#ffffff' }); if(g.slashes.length>140) g.slashes.splice(0,g.slashes.length-140); } }catch(_){} return; } if(evt==='choice_done'){ const sid=String(m.from||''); const ph=String(m.phase||''); if(!sid||!inChoicePhase()|| (ph&&ph!==state.phase)) return; if(getExpectedChoiceParticipants().includes(sid)){ state.choiceDoneBySid[sid]=!!m.ok; } maybeFinishSharedChoice(); return; } if(evt==='taunt_shield_pick'){ const sid=String(m.sid||m.from||''); if(sid){ state.tauntSid=sid; state.tauntChosen=true; } return; } if(evt==='game_over_all'){ try{ const g=G(); if(g){ g.paused=true; g.gameOver=true; } }catch(_){} setOverlay('팀 전멸 · 게임 오버'); return; }
  }
  function handleMxMsg(msg){ const m=(msg&&typeof msg==='object')?msg:{}; const from=String(m.from||''); if(from) markPeer(from); let k=String(m.kind||m.t||''); if(k==='mx_chat'||k==='chat_msg'){ k='chat'; m.kind='chat'; } if(k==='mx_phase'||k==='phase'){ k='phase_sync'; } if(k==='mx_state'){ k='state'; } if(k==='mx_world'){ k='world'; } if(k==='hello'){ send('hello_ack',{}); return; } if(k==='hello_ack'){ if(from) markPeer(from); return; } if(k==='chat'){ dbgBump('in'); dbgBump('chatIn'); if(!m.text) return; ensureChat(); const cid=String(m.id||''); if(cid){ if(state.chatSeen.has(cid)) return; state.chatSeen.add(cid); if(state.chatSeen.size>300){ try{ state.chatSeen = new Set(Array.from(state.chatSeen).slice(-200)); }catch(_){ } } } if(from&&from===mySid()) return; state.chat.append(m.nick||m.name||`유저-${(from||'').slice(0,4)}`, String(m.text||''), false); return; } if(k==='phase_sync'||k==='mx_phase'){ dbgBump('in'); handlePhaseSync(m); return; } if(k==='mx_event'){ handleMxEvent(m); return; } if(k==='char_selected'){ dbgBump('in'); if(from){ const chosen=String(m.character||''); state.selectedBySid[from]=chosen; refreshCharSelectLocks(); if(iAmHost()){ const me=mySid()||'self'; const duplicateOwner=Object.entries(state.selectedBySid||{}).find(([sid,v])=>sid!==from && String(v||'')===chosen); if(chosen && duplicateOwner){ delete state.selectedBySid[from]; broadcastPhaseSync(PHASES.CHAR_SELECT, Math.max(now()+3000, safeNum(state.phaseDeadline,0)||0), { selectedBySid: state.selectedBySid||{} }); sendEvent('char_conflict',{ to:from, character:chosen }); return; } } if(state.phase===PHASES.CHAR_SELECT){ if(iAmHost()) finalizeCharSelect(false); else setOverlay(`다른 플레이어 캐릭터 선택 대기 · ${Math.max(0,activeCount()-selectedCount())}명`); } } return; } if(k==='state'||k==='mx_state'){ dbgBump('in'); dbgBump('stateIn'); if(!from) return; if(from===String(mySid()||'')) return; if(!iAmHost() && state.worldSnap && from===String(state.hostSid||'')){ return; } const prev=state.remoteStates[from]||{}; const nx=safeNum(m.x), ny=safeNum(m.y); const tNow=now(); const dtMs=Math.max(1, tNow - safeNum(prev.lastUpdateAt, tNow)); const dt=Math.min(0.25, dtMs/1000); const estVx=Number.isFinite(prev.x)?(nx-safeNum(prev.x))/dt:0; const estVy=Number.isFinite(prev.y)?(ny-safeNum(prev.y))/dt:0; state.remoteStates[from]={ sid:from, x:nx, y:ny, rx:Number.isFinite(prev.rx)?prev.rx:nx, ry:Number.isFinite(prev.ry)?prev.ry:ny, vx:(safeNum(prev.vx,estVx)*0.45)+(estVx*0.55), vy:(safeNum(prev.vy,estVy)*0.45)+(estVy*0.55), hp:safeNum(m.hp), maxHp:safeNum(m.maxHp), lvl:safeNum(m.lvl,1), exp:safeNum(m.exp,0), expNext:safeNum(m.expNext,1), score:safeNum(m.score,0), stage:safeNum(m.stage,1), selecting:!!m.selecting, name:String(m.name||m.nick||''), charType:String(m.charType||''), damage:safeNum(m.damage, safeNum(prev.damage,0)), range:safeNum(m.range, safeNum(prev.range,0)), atkSpeed:safeNum(m.atkSpeed, safeNum(prev.atkSpeed,0)), crit:safeNum(m.crit, safeNum(prev.crit,0)), speed:safeNum(m.speed, safeNum(prev.speed,0)), multishot:safeNum(m.multishot, safeNum(prev.multishot,0)), pierce:safeNum(m.pierce, safeNum(prev.pierce,0)), attackPulse:safeNum(m.attackPulse, safeNum(prev.attackPulse,0)), attacking:!!m.attacking, ts:tNow, lastUpdateAt:tNow }; if(iAmHost()){ try{ const pulseNow=safeNum(m.attackPulse,0), pulsePrev=safeNum(prev.attackPulse,0); if(pulseNow && pulseNow!==pulsePrev){ simulateRemoteAttackOnHost(state.remoteStates[from], { sid:from, x:nx, y:ny, damage:safeNum(m.damage,0), range:safeNum(m.range,0), crit:safeNum(m.crit,0), charType:String(m.charType||''), pulse:pulseNow }); } }catch(_){} } return; } if(k==='world'||k==='mx_world'){ dbgBump('in'); dbgBump('worldIn'); state.worldSnap=m; if(!iAmHost()) applyWorldSnapshotToGuest(m); return; } }
  function ensureLocalAttackSendWrap(){
    try{
      const g=G(), pl=g&&g.player;
      if(!pl || pl.__mxLocalAttackSendWrapped || typeof pl.attack!=='function') return;
      const oa = pl.attack.bind(pl);
      pl.attack = function(target){
        const t0 = Date.now();
        const ret = oa.apply(this, arguments);
        try{
          if((window.location.search||'').includes('embed=1') && !iAmHost() && !inChoicePhase()){
            const ctype = String((this.design&&this.design.type)||state.localCharType||'');
            const nonce = `${Math.floor(t0/20)}:${Math.round(safeNum(this.x,0))}:${Math.round(safeNum(this.y,0))}`;
            if(state.__mxLastAttackNonce !== nonce){
              state.__mxLastAttackNonce = nonce;
              sendEvent('remote_attack',{ x:Math.round(safeNum(this.x,0)), y:Math.round(safeNum(this.y,0)), tx:Math.round(safeNum(target&&target.x, NaN)), ty:Math.round(safeNum(target&&target.y, NaN)), damage:safeNum(this.damage,0), range:safeNum(this.range,0), crit:safeNum(this.crit,0), charType:ctype, pulse:(getLocalAttackPulse(this)||t0) });
            }
          }
        }catch(_){}
        return ret;
      };
      pl.__mxLocalAttackSendWrapped = true;
    }catch(_){}
  }
  function ensurePlayerSafetyWrap(){ try{ const g=G(); const pl=g&&g.player; if(!pl) return; if(!pl.__mxTakeDamageWrapped&&typeof pl.takeDamage==='function'){ const o=pl.takeDamage.bind(pl); pl.takeDamage=function(d){ if(this.__mxInvuln || state.phase!==PHASES.PLAYING || (!iAmHost() && (window.location.search||'').includes('embed=1'))) return; return o(d); }; pl.__mxTakeDamageWrapped=true; }
    if(!pl.__mxGainExpWrapped&&typeof pl.gainExp==='function'){ const ge=pl.gainExp.bind(pl); pl.gainExp=function(v){ if(!iAmHost() && (window.location.search||'').includes('embed=1')) return; return ge(v); }; pl.__mxGainExpWrapped=true; }
    if(!pl.__mxDrawWrapped&&typeof pl.draw==='function'){ const od=pl.draw.bind(pl); pl.draw=function(){ const selectingNow = !!this.__mxInvuln && (state.choiceType==='레벨업' || state.choiceType==='보물' || !!isChoiceVisible()); if(selectingNow && window.ctx){ try{ window.ctx.save(); window.ctx.globalAlpha = 0.48; const r=od(); window.ctx.restore(); return r; }catch(_){ try{ window.ctx.restore(); }catch(__){} } } return od(); }; pl.__mxDrawWrapped=true; }
  }catch(_){} }
  function wrapGameHooks(){ const g=G(); if(!g){ ensurePlayerSafetyWrap(); ensureLocalAttackSendWrap(); return; } if(g.__mxNetWrapped){ ensurePlayerSafetyWrap(); ensureLocalAttackSendWrap(); return; } g.__mxNetWrapped=true; const origSelect=g.selectChar?.bind(g); const origStart=g.start?.bind(g); const origUpdate=g.update?.bind(g); const origLoop=g.loop?.bind(g); const origShowLevel=g.showLevelUp?.bind(g); const origShowMath=g.showMathScreen?.bind(g); const origShowItem=g.showItemScreen?.bind(g); const origCloseMath=g.closeMath?.bind(g); const origSpawnBoss=g.spawnBoss?.bind(g); const origCheckBossSpawn=g.checkBossSpawn?.bind(g);
    if(origStart){ g.start=function(){ const r=origStart(); if(state.phase!==PHASES.PLAYING) pauseGame(true); try{ applyCoopScaling(); }catch(_){ } return r; }; }
    const origShowCharSelect=g.showCharSelect?.bind(g); if(origShowCharSelect && !g.__mxShowCharSelectWrapped){ g.__mxShowCharSelectWrapped=true; g.showCharSelect=function(){ const r=origShowCharSelect(); try{ const grid=document.getElementById('charSelectGrid'); const arr=Array.isArray(window.CHAR_DESIGNS)?window.CHAR_DESIGNS:[]; Array.from(grid?.children||[]).forEach((el,idx)=>{ if(el&&el.dataset) el.dataset.charType=String(arr[idx]?.type||''); }); refreshCharSelectLocks(); }catch(_){ } return r; }; }
    if(origSelect){ g.selectChar=function(type){ const t=String(type||''); if(isCharTakenByOther(t)){ setOverlay('이미 다른 플레이어가 선택한 캐릭터입니다'); refreshCharSelectLocks(); return; } const sid=mySid()||'self'; state.localCharChosen=true; state.localCharType=t; state.selectedBySid[sid]=state.localCharType; refreshCharSelectLocks(); const r=origSelect(type); pauseGame(true); send('char_selected',{ character: state.localCharType }); if(iAmHost()) finalizeCharSelect(false); else setOverlay(`다른 플레이어 캐릭터 선택 대기 · ${Math.max(0,activeCount()-selectedCount())}명`); return r; }; }
    if(origUpdate){ g.update=function(){ const pl=g&&g.player; const lock=isLocalChoiceLock(); const sx=lock&&pl?safeNum(pl.x):0, sy=lock&&pl?safeNum(pl.y):0; const savedPaused=g.paused; if(lock) g.paused=true; if(!iAmHost() && state.phase!==PHASES.PLAYING) g.paused=true; const r=origUpdate(); if(iAmHost()){ try{ hostRetargetAndBuffEnemies(g); }catch(_){} } if(lock&&pl){ try{ pl.x=sx; pl.y=sy; if('vx' in pl) pl.vx=0; if('vy' in pl) pl.vy=0; }catch(_){} } if(lock){ g.paused=savedPaused||true; }  return r; }; }
    if(!g.__mxAuthoritativeWrapped){
      g.__mxAuthoritativeWrapped = true;
      const noBossSpawn = function(){ return; };
      const noSpawnEnemies = function(){ return; };
      const noRangedQueue = function(){ return; };
      const noCheckBossSpawn = function(){ return; };
      const origGameOver = g.gameOver?.bind(g);
      if(origGameOver){ g.gameOver=function(){ if(!iAmHost()) return; return origGameOver(); }; }
      const origLoop2 = g.loop?.bind(g);
      if(origLoop2){ g.loop=function(timestamp){
        if(!iAmHost()){
          if(state.worldSnap) applyWorldSnapshotToGuest(state.worldSnap);
          const se=g.spawnEnemies, sb=g.spawnBoss, cb=g.checkBossSpawn, pr=g.processRangedEffectQueue;
          const saved={ enemies:g.enemies, projectiles:g.projectiles, enemyProjectiles:g.enemyProjectiles, items:g.items, slashes:g.slashes, boss:g.boss };
          try{
            g.spawnEnemies=noSpawnEnemies; g.spawnBoss=noBossSpawn; g.checkBossSpawn=noCheckBossSpawn; g.processRangedEffectQueue=noRangedQueue;
            const gw=state.worldGhost||{};
            g.enemies = ((state.phase!==PHASES.LOBBY && state.phase!==PHASES.CHAR_SELECT) && Array.isArray(gw.monsters))?gw.monsters.slice():[];
            g.projectiles = []; // 호스트 권한형: 게스트 루프에 원격 투사체 객체 주입 금지(프리징 방지)
            g.enemyProjectiles = []; // 오버레이/ghost 렌더만 사용
            g.items = Array.isArray(gw.drops)?gw.drops.slice():[];
            g.slashes = Array.isArray(gw.slashes)?gw.slashes.slice():[];
            g.boss = g.enemies.find(e=>e&&e.isBoss) || null;
            try{ return origLoop2(timestamp); }
            catch(err){ try{ console.warn('[mx] guest loop suppressed error', err); }catch(_){} return; }
          } finally {
            g.spawnEnemies=se; g.spawnBoss=sb; g.checkBossSpawn=cb; g.processRangedEffectQueue=pr;
            if(state.worldGhost){
              const gw=state.worldGhost||{};
              g.enemies = ((state.phase!==PHASES.LOBBY && state.phase!==PHASES.CHAR_SELECT) && Array.isArray(gw.monsters))?gw.monsters.slice():[];
              g.projectiles = []; // 호스트 권한형: 게스트 루프에 원격 투사체 객체 주입 금지(프리징 방지)
              g.enemyProjectiles = []; // 오버레이/ghost 렌더만 사용
              g.items = Array.isArray(gw.drops)?gw.drops.slice():[];
              g.slashes = Array.isArray(gw.slashes)?gw.slashes.slice():[];
              g.boss = g.enemies.find(e=>e&&e.isBoss) || null;
            } else {
              g.enemies=saved.enemies; g.projectiles=saved.projectiles; g.enemyProjectiles=saved.enemyProjectiles; g.items=saved.items; g.slashes=saved.slashes; g.boss=saved.boss;
            }
          }
        }
        return origLoop2(timestamp);
      }; }
    }
    if(origShowLevel){ g.showLevelUp=function(){ if(inChoicePhase() && localChoiceFinished() && !state.__mxForceChoiceUi){ setOverlay('다른 플레이어 선택 대기'); try{ g.paused=true; }catch(_){} return; } if(state.phase===PHASES.LEVEL_CHOICE && (isChoiceVisible()||state.selecting) && !state.__mxForceChoiceUi) return; if(inChoicePhase() && state.phase!==PHASES.LEVEL_CHOICE && !state.__mxForceChoiceUi) return; if(!iAmHost() && !state.__mxForceChoiceUi){ sendEvent('choice_request',{ phase:PHASES.LEVEL_CHOICE }); return; } const r=origShowLevel(); try{ const root=document.getElementById('levelUpScreen'); try{ if(root && !localChoiceFinished()){ delete root.dataset.mxSelectedLocked; } }catch(_){} const cards=[...document.querySelectorAll('#upgrades .upgradeCard')]; try{ if(root && !root.__mxChoiceClickCap){ root.addEventListener('click', ()=>{ try{ if(state.phase===PHASES.LEVEL_CHOICE){ queueLocalChoiceCommit('level'); setTimeout(()=>flushPendingLocalChoiceCommit(),0); } }catch(_){} }, true); root.__mxChoiceClickCap=1; } }catch(_){} cards.forEach(card=>{ try{ delete card.dataset.mxPicked; }catch(_){} if(card.dataset.mxWrapped==='1') return; card.dataset.mxWrapped='1'; const oc=card.onclick; card.onclick=(ev)=>{ if(card.dataset.mxPicked==='1') return; card.dataset.mxPicked='1'; if(typeof oc==='function') oc.call(card,ev); try{ markChoiceUiPicked(root, card); }catch(_){} if(inChoicePhase()){ try{ root?.classList.remove('hidden'); }catch(_){} try{ g.paused=true; }catch(_){} const _mxChoiceKey=currentPhaseKey(); setTimeout(()=>{ if(!inChoicePhase() || currentPhaseKey()!==_mxChoiceKey) return; try{ root?.classList.remove('hidden'); }catch(_){} try{ g.paused=true; }catch(_){} },0); setOverlay('다른 플레이어 선택 대기'); try{ queueLocalChoiceCommit('level'); markChoiceDoneLocal(true); }catch(_){} } }; }); }catch(_){} if(iAmHost() && !state.__mxForceChoiceUi && state.phase!==PHASES.LEVEL_CHOICE){ const deadline=now()+12000; state.phaseParticipants=getExpectedChoiceParticipants(); broadcastPhaseSync(PHASES.LEVEL_CHOICE, deadline,{ phaseParticipants: state.phaseParticipants.slice() }); setPhase(PHASES.LEVEL_CHOICE,{deadline, participants: state.phaseParticipants.slice()}); } state.__mxChoiceUiOpened = state.__mxChoiceUiOpened || !!isChoiceVisible(); return r; }; }
    if(origShowMath){ g.showMathScreen=function(x,y){ if(state.phase===PHASES.CHEST_CHOICE && (isChoiceVisible()||state.selecting) && !state.__mxForceChoiceUi) return; if(!iAmHost() && !state.__mxForceChoiceUi){ sendEvent('chest_touch',{ x:safeNum(x,0), y:safeNum(y,0) }); return; } try{ state.__mxChestAbortedLocal=false; }catch(_){} const r=origShowMath(x,y); if(iAmHost() && !state.__mxForceChoiceUi && state.phase!==PHASES.CHEST_CHOICE){ const deadline=now()+20000; state.phaseParticipants=getExpectedChoiceParticipants(); broadcastPhaseSync(PHASES.CHEST_CHOICE, deadline,{ phaseParticipants: state.phaseParticipants.slice() }); setPhase(PHASES.CHEST_CHOICE,{deadline, participants: state.phaseParticipants.slice()}); } state.__mxChoiceUiOpened = state.__mxChoiceUiOpened || !!isChoiceVisible(); return r; }; }
    const origCheckMath = g.checkMathAnswer?.bind(g);
    if(origCheckMath && !g.__mxCheckMathWrapped){
      g.__mxCheckMathWrapped=true;
      g.checkMathAnswer=function(){
        try{
          const val = parseInt(document.getElementById('mathAnswer')?.value);
          const ans = safeNum(g.currentProblem?.answer, NaN);
          const correct = Number.isFinite(ans) && val===ans;
          if(state.phase===PHASES.CHEST_CHOICE){
            state.__mxChestMathSolved = !!correct;
          }
        }catch(_){}
        return origCheckMath();
      };
    }
    if(origCloseMath){ g.closeMath=function(){ const r=origCloseMath(); try{ if(state.phase===PHASES.CHEST_CHOICE){ state.__mxChestAbortedLocal=true; markChoiceDoneLocal(false); setSelecting(true,'보물'); setOverlay('다른 플레이어 선택 대기'); g.paused=true; document.getElementById('mathScreen')?.classList.add('hidden'); document.getElementById('itemScreen')?.classList.add('hidden'); } }catch(_){} return r; }; }
    if(origShowItem){ g.showItemScreen=function(){ if(inChoicePhase() && localChoiceFinished() && !state.__mxForceChoiceUi){ setOverlay('다른 플레이어 선택 대기'); try{ g.paused=true; }catch(_){} return; } if(state.phase===PHASES.CHEST_CHOICE && isChoiceVisible()==='itemScreen' && !state.__mxForceChoiceUi){ try{ state.__mxChestMathSolved=true; }catch(_){} return; } if(!iAmHost() && !state.__mxForceChoiceUi){ sendEvent('choice_request',{ phase:PHASES.CHEST_CHOICE }); return; } const r=origShowItem(); try{ const root=document.getElementById('itemScreen'); try{ if(root && !localChoiceFinished()){ delete root.dataset.mxSelectedLocked; } }catch(_){} const cards=[...document.querySelectorAll('#items .upgradeCard')]; try{ if(root && !root.__mxChoiceClickCap){ root.addEventListener('click', ()=>{ try{ if(state.phase===PHASES.CHEST_CHOICE){ queueLocalChoiceCommit('item'); setTimeout(()=>flushPendingLocalChoiceCommit(),0); } }catch(_){} }, true); root.__mxChoiceClickCap=1; } }catch(_){} cards.forEach(card=>{ try{ delete card.dataset.mxPicked; }catch(_){} if(card.dataset.mxWrapped==='1') return; card.dataset.mxWrapped='1'; const oc=card.onclick; card.onclick=(ev)=>{ if(card.dataset.mxPicked==='1') return; card.dataset.mxPicked='1'; if(typeof oc==='function') oc.call(card,ev); try{ markChoiceUiPicked(root, card); }catch(_){} if(inChoicePhase()){ try{ root?.classList.remove('hidden'); }catch(_){} try{ g.paused=true; }catch(_){} const _mxChoiceKey=currentPhaseKey(); setTimeout(()=>{ if(!inChoicePhase() || currentPhaseKey()!==_mxChoiceKey) return; try{ root?.classList.remove('hidden'); }catch(_){} try{ g.paused=true; }catch(_){} },0); setOverlay('다른 플레이어 선택 대기'); try{ queueLocalChoiceCommit('item'); markChoiceDoneLocal(true); }catch(_){} } }; }); }catch(_){} try{ maybeInjectTauntShieldCard(); }catch(_){} try{ if(state.phase===PHASES.CHEST_CHOICE){ state.__mxChestMathSolved = true; } }catch(_){} if(iAmHost() && !state.__mxForceChoiceUi && state.phase!==PHASES.CHEST_CHOICE){ const deadline=now()+20000; state.phaseParticipants=getExpectedChoiceParticipants(); broadcastPhaseSync(PHASES.CHEST_CHOICE, deadline,{ phaseParticipants: state.phaseParticipants.slice() }); setPhase(PHASES.CHEST_CHOICE,{deadline, participants: state.phaseParticipants.slice()}); } state.__mxChoiceUiOpened = state.__mxChoiceUiOpened || !!isChoiceVisible(); return r; }; }
    try{ const PlayerCtor=getGlobalCtor('Player') || window.Player; if(PlayerCtor&&PlayerCtor.prototype && !PlayerCtor.prototype.__mxRemoteAttackHooked){ const _oa=PlayerCtor.prototype.attack; if(typeof _oa==='function'){ PlayerCtor.prototype.attack=function(target){ const r=_oa.apply(this, arguments); try{ if((window.location.search||'').includes('embed=1') && !iAmHost() && !inChoicePhase()){ const pulse = getLocalAttackPulse(this) || Date.now(); if(pulse !== safeNum(state.lastAttackPulseSent,0)){ state.lastAttackPulseSent = pulse; sendEvent('remote_attack',{ x:Math.round(safeNum(this.x)), y:Math.round(safeNum(this.y)), tx:Math.round(safeNum(target&&target.x, NaN)), ty:Math.round(safeNum(target&&target.y, NaN)), damage:safeNum(this.damage,0), range:safeNum(this.range,0), crit:safeNum(this.crit,0), charType:String((this.design&&this.design.type)||state.localCharType||''), pulse }); } } }catch(_){} return r; }; } PlayerCtor.prototype.__mxRemoteAttackHooked=true; } }catch(_){}
    if(typeof g.processRangedEffectQueue==='function' && !g.__mxRangedFreezeWrapped){ const _prq=g.processRangedEffectQueue.bind(g); g.processRangedEffectQueue=function(){ if(state.phase===PHASES.LEVEL_CHOICE || state.phase===PHASES.CHEST_CHOICE) return; return _prq(); }; g.__mxRangedFreezeWrapped=true; }
    if(origCheckBossSpawn){ g.checkBossSpawn=function(){ if(!iAmHost()) return; return origCheckBossSpawn(); }; }
    if(origSpawnBoss){ g.spawnBoss=function(){ const r=origSpawnBoss(); try{ if (g.boss){ g.boss.x = Math.round((window.MAP_WIDTH||2000)/2); g.boss.y = Math.round((window.MAP_HEIGHT||2000)/2); if (Array.isArray(g.enemies)){ const be = g.enemies.find(e=>e&&e.isBoss); if (be){ be.x=g.boss.x; be.y=g.boss.y; } } } }catch(_){ } if(iAmHost()) sendEvent('boss_spawn',{ stage:safeNum(g.stage,1) }); return r; };
    }
    ensurePlayerSafetyWrap();
    ensureLocalAttackSendWrap();
    try{ const PlayerCtor2=getGlobalCtor('Player') || window.Player; if(PlayerCtor2&&PlayerCtor2.prototype&&!PlayerCtor2.prototype.__mxHostHitOwnerPatched){ const odd=PlayerCtor2.prototype.dealDamage; if(typeof odd==='function'){ PlayerCtor2.prototype.dealDamage=function(enemy,dmg){ try{ if(iAmHost() && enemy){ enemy.__mxLastHitSid = mySid()||'self'; enemy.__mxLastHitAt = now(); } }catch(_){} return odd.apply(this, arguments); }; } PlayerCtor2.prototype.__mxHostHitOwnerPatched=true; } }catch(_){}
  }
  function applyCoopScaling(){ const g=G(); if(!g) return; const pc=Math.max(1,Math.min(4,Number(state.startPayload?.playerCount||state.expectedHumans||1))); const enemyMul = 1 + (pc-1)*0.45; const hpMul = 1 + (pc-1)*0.35; window.__mxCoopBalance = { playerCount:pc, enemyMul, hpMul }; try{ window.MAX_ENEMIES = Math.max(window.MAX_ENEMIES||0, Math.round((window.MAX_ENEMIES||24) * enemyMul)); }catch(_){ }
  }
  function isChoiceVisible(){
    try{
      const ids = ['levelUpScreen','itemScreen','mathScreen'];
      for (const id of ids){
        const el = document.getElementById(id);
        if(!el) continue;
        const cs = getComputedStyle(el);
        const hiddenCls = el.classList && el.classList.contains('hidden');
        if (!hiddenCls && cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null) return id;
      }
    }catch(_){ }
    return '';
  }
  function choiceLabelById(id){
    if(id==='levelUpScreen') return '레벨업';
    if(id==='itemScreen' || id==='mathScreen') return '보물';
    return '';
  }
  function markChoiceUiPicked(root, card){
    try{
      if(!root || !card) return;
      root.dataset.mxSelectedLocked='1';
      const all=[...root.querySelectorAll('.upgradeCard,.option,.card,button')];
      for(const el of all){
        if(!el) continue;
        if(el===card){
          el.dataset.mxPicked='1';
          el.style.opacity='1';
          el.style.filter='none';
          el.style.outline = el.style.outline || '2px solid rgba(255,255,255,.7)';
        }else{
          el.style.opacity='0.28';
          el.style.filter='grayscale(0.35)';
          el.style.pointerEvents='none';
        }
      }
    }catch(_){}
  }
  function localPickedCardInVisibleChoice(){
    try{
      const rid=isChoiceVisible();
      if(rid==='levelUpScreen') return !!document.querySelector('#levelUpScreen .upgradeCard[data-mx-picked="1"]');
      if(rid==='itemScreen') return !!document.querySelector('#itemScreen .upgradeCard[data-mx-picked="1"]');
    }catch(_){}
    return false;
  }
  function postLocalState(){
    const g=G(); const p=g&&g.player; if(!p || !mySid()) return;
    const curPulse=getLocalAttackPulse(p);
    if(!iAmHost() && !inChoicePhase() && curPulse && curPulse!==safeNum(state.lastAttackPulseSent,0)){
      state.lastAttackPulseSent=curPulse;
      sendEvent('remote_attack',{ x:Math.round(safeNum(p.x)), y:Math.round(safeNum(p.y)), damage:safeNum(p.damage,0), range:safeNum(p.range,0), crit:safeNum(p.crit,0), charType:String((p.design&&p.design.type)||state.localCharType||''), pulse:curPulse });
    }
    sendState({
      x: Math.round(safeNum(p.x)), y: Math.round(safeNum(p.y)),
      hp: Math.round(safeNum(p.hp)), maxHp: Math.round(safeNum(p.maxHp)),
      lvl: Math.round(safeNum(p.level,1)), exp: Math.round(safeNum(p.exp,0)), expNext: Math.round(safeNum(p.expNext,1)),
      score: Math.round(safeNum(g&&g.score,0)), stage: Math.round(safeNum(g&&g.stage,1)),
      selecting: !!state.selecting,
      name: String(state.init?.nick||''), charType: String(state.localCharType||''),
      // 실제 게임 Player 필드명 기준 전송 (bridge 내부 가상필드명과 다름)
      damage: safeNum(p.damage,0), range: safeNum(p.range,0), atkSpeed: safeNum(p.atkSpeed,0),
      crit: safeNum(p.crit,0), speed: safeNum(p.speed,0),
      multishot: safeNum(p.multishot,0), pierce: safeNum(p.pierce,0),
      attacking: !!p.isAttacking, attackPulse: getLocalAttackPulse(p)
    });
  }
  function hostChestTouchFallback(){
    try{
      if(!iAmHost() || inChoicePhase()) return;
      const g=G(); if(!g || !Array.isArray(g.items) || !g.player) return;
      const players=[{sid:mySid()||'self', x:safeNum(g.player.x), y:safeNum(g.player.y)}];
      for(const [sid,rs] of Object.entries(state.remoteStates||{})){ if(!rs) continue; if((now()-safeNum(rs.ts,0))>2500) continue; players.push({sid,x:safeNum(rs.x),y:safeNum(rs.y)}); }
      for(let i=0;i<g.items.length;i++){ const it=g.items[i]; if(!it||String(it.type||'')!=='chest') continue;
        for(const pl of players){ const dx=safeNum(it.x)-safeNum(pl.x), dy=safeNum(it.y)-safeNum(pl.y); if(dx*dx+dy*dy<=32*32){ try{ g.items.splice(i,1); }catch(_){} try{ if(typeof g.showMathScreen==='function') g.showMathScreen(safeNum(it.x,0), safeNum(it.y,0)); }catch(_){} return; } }
      }
    }catch(_){}
  }
  function postWorldIfHost(){
    if(!iAmHost()) return;
    if(state.phase!==PHASES.PLAYING && state.phase!==PHASES.LEVEL_CHOICE && state.phase!==PHASES.CHEST_CHOICE) return;
    const snap = serializeWorld();
    if(!snap) return;
    sendWorld(snap);
  }
  function onBridgeInit(d){ state.init=d; state.localSid=String(d.sessionId||d.mySessionId||d.mySid||''); state.expectedHumans=Math.max(1, Number(d.humanCount||d.expectedHumans||1)); state.hostSid=String(d.hostSessionId||''); state.isHost=!!d.isHost || (state.localSid && state.localSid===state.hostSid); markPeer(state.localSid||'self'); ensureUi(); send('hello',{}); setTimeout(()=>send('hello',{}),500); maybeStartSequence(); }
  document.addEventListener('click', (e)=>{ try{
    const t=e.target && e.target.closest ? e.target.closest('.upgradeCard,.option,.card,button') : null; if(!t) return;
    const g=G();
    if(state.phase===PHASES.LEVEL_CHOICE && t.closest('#levelUpScreen')){
      try{ markChoiceUiPicked(document.getElementById('levelUpScreen'), t.closest('.upgradeCard,.option,.card,button')); }catch(_){}
      const _mxPk = currentPhaseKey(); setTimeout(()=>{ if(!inChoicePhase() || currentPhaseKey()!==_mxPk) return; try{ document.getElementById('levelUpScreen')?.classList.remove('hidden'); if(g) g.paused=true; }catch(_){} markChoiceDoneLocal(true); },0);
    }
    if(state.phase===PHASES.CHEST_CHOICE && t.closest('#itemScreen')){
      try{ markChoiceUiPicked(document.getElementById('itemScreen'), t.closest('.upgradeCard,.option,.card,button')); }catch(_){}
      const _mxPk = currentPhaseKey(); setTimeout(()=>{ if(!inChoicePhase() || currentPhaseKey()!==_mxPk) return; try{ document.getElementById('itemScreen')?.classList.remove('hidden'); if(g) g.paused=true; }catch(_){} markChoiceDoneLocal(true); },0);
    }
  }catch(_){} }, true);
  function onGameStart(payload){ state.startPayload=payload||{}; try{ post({ type:'mx_game_start_ack' }); }catch(_){ } installEmbedStartLock(); forceEmbedScreens(); state.expectedHumans=Math.max(1, Number(payload?.playerCount || state.expectedHumans || 1)); state.rosterSids=Array.isArray(payload?.roster)?payload.roster.map(r=>String(r?.sid||'')).filter(Boolean):[]; state.hostSid = state.hostSid || (state.rosterSids[0]||''); state.isHost = state.isHost || (mySid() && mySid()===state.hostSid); applyDifficulty(payload?.difficulty||1); maybeStartSequence(); }
  window.addEventListener('message',(e)=>{ const d=e.data||{}; if(d&&d.type){ dbgBump('in'); } if(d.type==='bridge_init' && (!d.gameId || d.gameId===GAME_ID || d.gameId==='math-explorer')) return onBridgeInit(d); if(d.type==='bridge_host'){ state.hostSid=String(d.hostSessionId||state.hostSid||''); state.isHost=!!d.isHost || (mySid() && mySid()===state.hostSid); return; } if(d.type==='game_start' && d.payload){ const pm=String(d.payload.mode||sp.get('embedGame')||''); if(!pm || pm==='mathexplorer' || pm==='math-explorer') return onGameStart(Object.assign({ mode: pm||'mathexplorer' }, d.payload)); } if(d.type==='mx_set_difficulty') return applyDifficulty(d.difficulty||1); if(d.type==='mx_msg') return handleMxMsg(d.msg||{}); });
  function patchGlobalCombatGuards(){ try{ const PlayerCtor=getGlobalCtor('Player') || window.Player; if(PlayerCtor&&PlayerCtor.prototype&&!PlayerCtor.prototype.__mxBridgeGuardPatched){ const oTD=PlayerCtor.prototype.takeDamage; if(typeof oTD==='function'){ PlayerCtor.prototype.takeDamage=function(d){ if((window.location.search||'').includes('embed=1') && !iAmHost()) return; if(this&&this.__mxInvuln) return; return oTD.call(this,d); }; } const oGE=PlayerCtor.prototype.gainExp; if(typeof oGE==='function'){ PlayerCtor.prototype.gainExp=function(v){ if((window.location.search||'').includes('embed=1') && !iAmHost()) return; return oGE.call(this,v); }; } PlayerCtor.prototype.__mxBridgeGuardPatched=true; } }catch(_){} }
  function raf(){ try{ forceEmbedScreens(); patchGlobalCombatGuards(); if(ensureGlobalsReady()) wrapGameHooks(); const choiceId=isChoiceVisible(); if(choiceId==='itemScreen'){ try{ maybeInjectTauntShieldCard(); }catch(_){} } if(choiceId && state.phase!==PHASES.CHAR_SELECT){ if(!state.selecting || (state.choiceType!==choiceLabelById(choiceId))){ setSelecting(true, choiceLabelById(choiceId)); } } else if(state.selecting && state.phase!==PHASES.CHAR_SELECT && !choiceId){ try{ if(iAmHost() && !state.__mxTeamGameOverSent){ const g=G(); const localDead = !!(g&&g.player&&safeNum(g.player.hp,1)<=0); const remoteDead = Object.values(state.remoteStates||{}).some(rs=>rs && (now()-safeNum(rs.ts,0))<2500 && safeNum(rs.hp,1)<=0); if(localDead||remoteDead){ state.__mxTeamGameOverSent=true; sendEvent('game_over_all',{}); try{ if(g){ g.paused=true; g.gameOver=true; } }catch(_){} } } }catch(_){} if(inChoicePhase()){ flushPendingLocalChoiceCommit(); pauseGame(true); } else { setSelecting(false,''); } } const cutoff=now()-6000; for(const [sid,st] of Object.entries(state.remoteStates)){ if(!st||(st.ts||0)<cutoff) delete state.remoteStates[sid]; } if(!iAmHost() && state.phase===PHASES.PLAYING && state.worldGhost && (now()-safeNum(state.lastWorldAppliedAt,0)>1200)){ setOverlay('호스트 월드 동기화 지연…'); } else if(state.phase===PHASES.PLAYING && !state.selecting){ setOverlay(''); try{ const g=G(); if(g){ g.paused=false; } }catch(_){} } try{ if(iAmHost() && !state.__mxTeamGameOverSent){ const g=G(); const localDead = !!(g&&g.player&&safeNum(g.player.hp,1)<=0); const remoteDead = Object.values(state.remoteStates||{}).some(rs=>rs && (now()-safeNum(rs.ts,0))<2500 && safeNum(rs.hp,1)<=0); if(localDead||remoteDead){ state.__mxTeamGameOverSent=true; sendEvent('game_over_all',{}); try{ if(g){ g.paused=true; g.gameOver=true; } }catch(_){} } } }catch(_){} if(inChoicePhase()){ flushPendingLocalChoiceCommit(); if(localPickedCardInVisibleChoice() && !localChoiceFinished()){ try{ markChoiceDoneLocal(true); setOverlay('다른 플레이어 선택 대기'); }catch(_){} } pauseGame(true); const blockChestReopen = (state.phase===PHASES.CHEST_CHOICE && state.__mxChestAbortedLocal); if(!isChoiceVisible() && !localChoiceFinished() && !blockChestReopen) { try{ forceOpenChoiceUiForPhase(); }catch(_){} } } if(state.selecting){ try{ const g=G(); const pl=g&&g.player; const lp=state.selectLockPos; if(pl&&lp){ pl.x=safeNum(lp.x); pl.y=safeNum(lp.y); if('vx' in pl) pl.vx=0; if('vy' in pl) pl.vy=0; } }catch(_){} } try{ if(iAmHost() && state.phase===PHASES.PLAYING){ hostChestTouchFallback(); } }catch(_){} try{ if(iAmHost() && inChoicePhase() && safeNum(state.phaseDeadline,0)>0 && now()>=safeNum(state.phaseDeadline,0)+500){ const parts=getExpectedChoiceParticipants(); for(const sid of parts){ if(!Object.prototype.hasOwnProperty.call(state.choiceDoneBySid||{}, sid)) state.choiceDoneBySid[sid]=false; } maybeFinishSharedChoice(); if(inChoicePhase() && now()>=safeNum(state.phaseDeadline,0)+2000){ endChoicePhase(); } } }catch(_){} drawRemoteLabels(); drawRemoteFx(); }catch(_){ } requestAnimationFrame(raf); } requestAnimationFrame(raf);
  setInterval(()=>{ try{ if(mySid()) send('hello',{}); }catch(_){ } },4000);
  setInterval(()=>{ try{ postLocalState(); }catch(_){ } },80);
  setInterval(()=>{ try{ postWorldIfHost(); }catch(_){ } },50);
  setTimeout(()=>{ try{ maybeStartSequence(); }catch(_){ } },800);
  setTimeout(()=>post({ type:'bridge_ready' }),50);
  try{ console.log('[MathExplorer bridge v23] loaded'); }catch(_){}
  try{ installEmbedStartLock(); forceEmbedScreens(); }catch(_){ }
})();
