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
    lastWorldAppliedAt:0, lastPhaseBroadcastAt:0,
    idMap:{ enemies:new WeakMap(), projectiles:new WeakMap(), enemyProjectiles:new WeakMap(), items:new WeakMap(), effects:new WeakMap() }
  };
  const now=()=>Date.now();
  const G=()=>window.G||null;
  const mySid=()=>String(state.localSid||'');
  const hostSid=()=>String(state.hostSid || (state.startPayload?.roster?.[0]?.sid || ''));
  const iAmHost=()=> !!state.isHost || (mySid() && mySid()===hostSid());
  const safeNum=(v,d=0)=>{ const n=Number(v); return Number.isFinite(n)?n:d; };
  function post(msg){ try{ parent.postMessage(Object.assign({ gameId: GAME_ID }, msg), "*"); }catch(_){ } }
  function send(kind,payload){ post({ type:'mx_msg', msg:Object.assign({ kind, ts: now() }, payload||{}) }); }
  const sendPhase=(phase,payload)=>send('mx_phase',Object.assign({phase},payload||{}));
  const sendWorld=(payload)=>send('mx_world',payload||{});
  const sendState=(payload)=>send('mx_state',payload||{});
  const sendEvent=(evt,payload)=>send('mx_event',Object.assign({evt,id:`${evt}:${now()}:${Math.random().toString(36).slice(2,7)}`},payload||{}));
  function markPeer(sid){ sid=String(sid||'').trim(); if(sid) state.peers.add(sid); }
  function activeCount(){ const e=Math.max(1, Number(state.expectedHumans||1)); const r=state.rosterSids.length?state.rosterSids.length:0; const p=Math.max(1, state.peers.size||0); return Math.min(4, Math.max(e,r,p)); }
  function ensureOverlay(){ if(state.overlay) return state.overlay; const el=document.createElement('div'); el.id='mxBridgeOverlay'; el.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:7px 12px;color:#fff;font:600 13px/1.2 sans-serif;pointer-events:none;display:none;'; document.body.appendChild(el); state.overlay=el; return el; }
  function setOverlay(t){ const el=ensureOverlay(); el.textContent=t||''; el.style.display=t?'block':'none'; }
  function ensureQuitBtn(){ if(document.getElementById('mxQuitBtn')) return; const b=document.createElement('button'); b.id='mxQuitBtn'; b.textContent='✕'; b.type='button'; b.style.cssText='position:fixed;top:10px;right:10px;z-index:99999;width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.35);color:#fff;font:700 18px/1 sans-serif;cursor:pointer;'; b.onclick=(e)=>{ e.preventDefault(); post({ type:'mx_quit' }); }; document.body.appendChild(b); }
  function esc(s){ return String(s||'').replace(/[&<>]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])); }
  function ensureChat(){ if(state.chat) return; const box=document.createElement('div'); box.id='mxChatBox'; box.style.cssText='position:fixed;left:10px;right:10px;bottom:10px;z-index:99999;background:rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px;color:#fff;font:12px/1.35 sans-serif;'; box.innerHTML='<div id="mxChatLog" style="height:90px;overflow:auto;margin-bottom:6px;background:rgba(0,0,0,.2);border-radius:6px;padding:6px"></div><div style="display:flex;gap:6px"><input id="mxChatInput" maxlength="180" placeholder="채팅" style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff"><button id="mxChatSend" type="button" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;cursor:pointer">전송</button></div>';
    document.body.appendChild(box); const log=box.querySelector('#mxChatLog'); const input=box.querySelector('#mxChatInput'); const btn=box.querySelector('#mxChatSend'); const append=(nick,text,self)=>{ const line=document.createElement('div'); line.innerHTML=`<span style="opacity:.82">${esc(nick)}:</span> <span>${esc(text)}</span>`; if(self) line.style.opacity='0.96'; log.appendChild(line); while(log.childElementCount>80) log.removeChild(log.firstChild); log.scrollTop=log.scrollHeight; }; const submit=()=>{ const text=String(input.value||'').trim(); if(!text) return; input.value=''; const id=`${mySid()||'self'}:${++state.chatSeq}:${now()}`; state.chatSeen.add(id); append('나', text, true); send('chat',{ text, t:'chat', id, nick:(state.init?.nick||'') }); }; btn.onclick=submit; input.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); }}); state.chat={box,log,input,append}; }
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
  function setSelecting(v, label){ state.selecting=!!v; state.choiceType=label||''; const g=G(); if(g&&g.player){ g.player.__mxInvuln = !!v; } }
  function showSelectingOverlay(label, remain){ const t = (typeof remain==='number'&&remain>=0) ? `${label} ${remain}s` : label; setOverlay(`선택중 · ${t}`); }
  function randomCharType(){ const arr=Array.isArray(window.CHAR_DESIGNS)?window.CHAR_DESIGNS:[]; if(!arr.length) return ''; const item=arr[Math.floor(Math.random()*arr.length)]; return String(item?.type||''); }
  function openCharSelect(){ if(!ensureGlobalsReady()) return false; ensureUi(); hideMainScreen(); try{ G().showCharSelect(); state.gameBooted=true; }catch(_){ } return true; }
  function selectedCount(){ return Object.keys(state.selectedBySid||{}).filter(k=>state.selectedBySid[k]!==undefined).length; }
  function hasEveryoneSelected(){ return selectedCount() >= activeCount(); }
  function setPhase(phase, opts={}){
    state.phase=phase; if(opts.deadline) state.phaseDeadline=Number(opts.deadline)||0;
    if(state.phaseTimer){ clearInterval(state.phaseTimer); state.phaseTimer=null; }
    const ticker = (label,onExpire)=>{
      const tick=()=>{ const remain=Math.max(0, Math.ceil((state.phaseDeadline-now())/1000)); showSelectingOverlay(label, remain); if(now()>=state.phaseDeadline){ clearInterval(state.phaseTimer); state.phaseTimer=null; onExpire&&onExpire(); } };
      tick(); state.phaseTimer=setInterval(tick,200);
    };
    if(phase===PHASES.CHAR_SELECT){ pauseGame(true); setSelecting(true,'캐릭터'); ticker('캐릭터 선택', ()=>{ if(!state.localCharChosen){ const t=randomCharType(); if(t&&G()?.selectChar) G().selectChar(t); else document.querySelector('#charSelectGrid .character')?.click(); } if(iAmHost()) finalizeCharSelect(true); }); }
    else if(phase===PHASES.LEVEL_CHOICE){ pauseGame(true); setSelecting(true,'레벨업'); ticker('레벨업 선택', ()=>{ autoPickCard('#upgrades .upgradeCard'); if(iAmHost()) endChoicePhase(); }); }
    else if(phase===PHASES.CHEST_CHOICE){ pauseGame(true); setSelecting(true,'보물'); ticker('보물 선택', ()=>{ autoPickCard('#items .upgradeCard'); if(iAmHost()) endChoicePhase(); }); }
    else if(phase===PHASES.PLAYING){ setSelecting(false,''); setOverlay(''); pauseGame(false); hideChoiceScreens(); }
    else { pauseGame(true); }
  }
  function hideChoiceScreens(){ try{ ['levelUpScreen','itemScreen','mathScreen'].forEach(id=>document.getElementById(id)?.classList.add('hidden')); }catch(_){ } }
  function autoPickCard(sel){ try{ document.querySelector(sel)?.click(); }catch(_){ } }
  function broadcastPhaseSync(phase, deadline, extra){ if(!iAmHost()) return; sendPhase(phase,Object.assign({ deadline: deadline||0, expectedHumans: activeCount(), selectedBySid: state.selectedBySid||{} }, extra||{})); }
  function beginCharSelect(){ if(!openCharSelect()){ setTimeout(beginCharSelect,120); return; } applyDifficulty(state.startPayload?.difficulty || state.init?.level || 1); state.selectedBySid={}; state.localCharChosen=false; state.localCharType=''; const deadline=now()+10000; setPhase(PHASES.CHAR_SELECT,{ deadline }); if(iAmHost()) broadcastPhaseSync(PHASES.CHAR_SELECT, deadline); }
  function maybeStartSequence(){ if(!embed || !state.init) return; ensureUi(); forceEmbedScreens(); if(!state.startPayload){ setOverlay('게임 시작 동기화 대기…'); pauseGame(true); return; } if(state.phase===PHASES.LOBBY) beginCharSelect(); }
  function finalizeCharSelect(force){ if(!iAmHost()) return; if(!(hasEveryoneSelected() || force)) return; broadcastPhaseSync(PHASES.PLAYING,0); setPhase(PHASES.PLAYING); }
  function endChoicePhase(){ if(!iAmHost()) return; broadcastPhaseSync(PHASES.PLAYING,0); setPhase(PHASES.PLAYING); }
  function idFor(group,obj){ if(!obj||typeof obj!=='object') return ''; let id=state.idMap[group].get(obj); if(!id){ id=`${group[0]}${state.entitySeq++}`; state.idMap[group].set(obj,id); } return id; }
  function slimEntity(group,e){ if(!e) return null; const o={ id:idFor(group,e), x:Math.round(safeNum(e.x)), y:Math.round(safeNum(e.y)) };
    if('hp' in e) o.hp=Math.round(safeNum(e.hp)); if('maxHp' in e) o.maxHp=Math.round(safeNum(e.maxHp));
    if('type' in e) o.type=e.type; if(e.isBoss) o.isBoss=true; if('life' in e) o.life=Math.round(safeNum(e.life));
    if('damage' in e) o.damage=Math.round(safeNum(e.damage)); if('value' in e) o.value=Math.round(safeNum(e.value));
    if('vx' in e) o.vx=+safeNum(e.vx).toFixed(2); if('vy' in e) o.vy=+safeNum(e.vy).toFixed(2);
    return o;
  }
  function serializeWorld(){ const g=G(); if(!g||!g.player) return null; const p=g.player; const players={}; players[mySid()||'self']={ sid:mySid()||'self', x:Math.round(safeNum(p.x)), y:Math.round(safeNum(p.y)), hp:Math.round(safeNum(p.hp)), maxHp:Math.round(safeNum(p.maxHp)), lvl:Math.round(safeNum(p.level,1)), exp:Math.round(safeNum(p.exp,0)), expNext:Math.round(safeNum(p.expNext,1)), selecting:!!p.__mxInvuln || state.phase!==PHASES.PLAYING, name: state.init?.nick||'', charType: state.localCharType||'' }; for (const [sid,rs] of Object.entries(state.remoteStates||{})){ if(!sid||!rs) continue; players[sid]={ sid, x:Math.round(safeNum(rs.x)), y:Math.round(safeNum(rs.y)), hp:Math.round(safeNum(rs.hp)), maxHp:Math.round(safeNum(rs.maxHp)), lvl:Math.round(safeNum(rs.lvl,1)), exp:Math.round(safeNum(rs.exp,0)), expNext:Math.round(safeNum(rs.expNext,1)), selecting:!!rs.selecting, name:String(rs.name||''), charType:String(rs.charType||'') }; } return { seq: ++state.lastWorldSeq, phase:state.phase, stage:Math.round(safeNum(g.stage,1)), score:Math.round(safeNum(g.score)), teamXp:Math.round(teamXpEstimate()), nextBossScore:Math.round(safeNum(g.nextBossScore,700)), bossCount:Math.round(safeNum(g.bossCount,0)), player:{ x:Math.round(safeNum(p.x)), y:Math.round(safeNum(p.y)), hp:Math.round(safeNum(p.hp)), maxHp:Math.round(safeNum(p.maxHp)), level:Math.round(safeNum(p.level,1)), exp:Math.round(safeNum(p.exp,0)), expNext:Math.round(safeNum(p.expNext,1)) }, players, entities:{ monsters:(Array.isArray(g.enemies)?g.enemies:[]).slice(0,180).map(e=>slimEntity('enemies',e)).filter(Boolean), projectiles:(Array.isArray(g.projectiles)?g.projectiles:[]).slice(0,220).map(e=>slimEntity('projectiles',e)).filter(Boolean), enemyProjectiles:(Array.isArray(g.enemyProjectiles)?g.enemyProjectiles:[]).slice(0,220).map(e=>slimEntity('enemyProjectiles',e)).filter(Boolean), drops:(Array.isArray(g.items)?g.items:[]).slice(0,120).map(e=>slimEntity('items',e)).filter(Boolean) } }; }
  function _ghostDrawCircle(x,y,r,fill,stroke){ try{ const c=window.ctx; if(!c) return; c.save(); c.fillStyle=fill||'rgba(255,80,80,.8)'; c.beginPath(); c.arc(x,y,Math.max(2,r||8),0,Math.PI*2); c.fill(); if(stroke){ c.strokeStyle=stroke; c.lineWidth=2; c.stroke(); } c.restore(); }catch(_){} }
  function makeGhostEnemy(e){ return { __mxGhost:true, __mxId:String(e?.id||''), x:safeNum(e?.x), y:safeNum(e?.y), hp:safeNum(e?.hp,1), maxHp:Math.max(1,safeNum(e?.maxHp,1)), size:Math.max(8,safeNum(e?.size,18)), isBoss:!!e?.isBoss, type:e?.type, update(){ return this.hp>0; }, draw(){ _ghostDrawCircle(this.x,this.y,this.isBoss?Math.max(this.size,24):this.size, this.isBoss?'rgba(255,120,40,.9)':'rgba(220,60,60,.85)', this.isBoss?'#ff0':null); } }; }
  function makeGhostProjectile(p, enemy){ return { __mxGhost:true, __mxId:String(p?.id||''), x:safeNum(p?.x), y:safeNum(p?.y), vx:safeNum(p?.vx), vy:safeNum(p?.vy), life:Math.max(1,safeNum(p?.life,5)), size:Math.max(4,safeNum(p?.size, enemy?10:6)), damage:safeNum(p?.damage,0), isRock:!!p?.isRock, isBossProjectile:!!p?.isBossProjectile, update(){ this.life=Math.max(0,this.life-1); return this.life>0; }, draw(){ _ghostDrawCircle(this.x,this.y,this.size, enemy?'rgba(255,180,60,.9)':'rgba(120,220,255,.9)'); } } }
  function makeGhostDrop(d){ return { __mxGhost:true, __mxId:String(d?.id||''), x:safeNum(d?.x), y:safeNum(d?.y), type:String(d?.type||'exp'), value:safeNum(d?.value,1) }; }
  function buildGhostWorld(s){ const ents=s?.entities||{}; return { monsters:(Array.isArray(ents.monsters)?ents.monsters:[]).map(makeGhostEnemy), projectiles:(Array.isArray(ents.projectiles)?ents.projectiles:[]).map(p=>makeGhostProjectile(p,false)), enemyProjectiles:(Array.isArray(ents.enemyProjectiles)?ents.enemyProjectiles:[]).map(p=>makeGhostProjectile(p,true)), drops:(Array.isArray(ents.drops)?ents.drops:[]).map(makeGhostDrop) }; }
  function applyWorldSnapshotToGuest(s){ const g=G(); if(!g||!s) return; try{ const seq=safeNum(s.seq,0); if(seq && seq < safeNum(state.lastWorldSeq,0)) return; if(seq) state.lastWorldSeq = seq; state.lastWorldAppliedAt = now(); applyHostPlayerProgressToGuest(s); syncRemoteStatesFromWorldPlayers(s); state.worldGhost = buildGhostWorld(s); }catch(_){ } }
  function teamXpEstimate(){ const g=G(); const p=g&&g.player; let total = safeNum(p?.exp,0); for (const rs of Object.values(state.remoteStates||{})){ total += safeNum(rs?.exp,0); } return Math.max(0, total); }
  function applyHostPlayerProgressToGuest(s){ const g=G(); if(!g||!g.player||!s) return; try{ const hp=s.player||{}; const lp=g.player; if(typeof hp.maxHp==='number') lp.maxHp = hp.maxHp; if(typeof hp.hp==='number') lp.hp = Math.max(1, Math.min(safeNum(lp.maxHp||hp.maxHp,99999), hp.hp)); if(typeof hp.level==='number') lp.level = hp.level; if(typeof hp.exp==='number') lp.exp = hp.exp; if(typeof hp.expNext==='number') lp.expNext = hp.expNext; if(typeof s.score==='number') g.score = s.score; if(typeof s.stage==='number') g.stage = s.stage; if(typeof s.nextBossScore==='number') g.nextBossScore = s.nextBossScore; if(typeof s.bossCount==='number') g.bossCount = s.bossCount; }catch(_){} }
  function syncRemoteStatesFromWorldPlayers(s){ const players=(s&&s.players&&typeof s.players==='object')?s.players:null; if(!players) return; for (const [sid,ps] of Object.entries(players)){ if(!sid || sid===mySid()) continue; state.remoteStates[sid] = Object.assign({}, state.remoteStates[sid]||{}, { sid, x:safeNum(ps?.x), y:safeNum(ps?.y), hp:safeNum(ps?.hp), maxHp:safeNum(ps?.maxHp), lvl:safeNum(ps?.lvl,1), exp:safeNum(ps?.exp,0), expNext:safeNum(ps?.expNext,1), selecting:!!ps?.selecting, name:String(ps?.name||state.remoteStates[sid]?.name||''), charType:String(ps?.charType||''), ts: now() }); } }
  function drawRemoteLabels(){ ensureRemoteLabelCanvas(); const c=state.labelsCanvas, ctx=state.labelsCtx; if(!ctx) return; ctx.clearRect(0,0,c.width,c.height); const arr=Object.values(state.remoteStates||{}); if(!arr.length) return; const g=G(); const lp=g&&g.player; const camX=lp?(safeNum(lp.x)-c.width/2):0; const camY=lp?(safeNum(lp.y)-c.height/2):0; ctx.font='12px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom'; for(const st of arr){ if(!st||!st.sid||st.sid===mySid()) continue; const x=safeNum(st.x)-camX, y=safeNum(st.y)-camY; if(x<-100||y<-100||x>c.width+100||y>c.height+100) continue; const name=String(st.name||`유저-${String(st.sid).slice(0,4)}`); if(st.selecting){ ctx.fillStyle='rgba(255,255,0,.95)'; ctx.fillText('선택중',x,y-38); } ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(x-42,y-32,84,18); ctx.fillStyle='white'; ctx.fillText(name,x,y-17); if(typeof st.hp==='number'&&typeof st.maxHp==='number'&&st.maxHp>0){ const w=62,h=5, px=x-w/2, py=y-10; ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(px,py,w,h); ctx.fillStyle='lime'; ctx.fillRect(px,py,Math.max(0,Math.min(w,w*(st.hp/st.maxHp))),h); } } }
  function postLocalState(){ const g=G(), p=g&&g.player; if(!p||!mySid()) return; sendState({ x:Math.round(safeNum(p.x)), y:Math.round(safeNum(p.y)), hp:Math.round(safeNum(p.hp)), maxHp:Math.round(safeNum(p.maxHp)), lvl:Math.round(safeNum(p.level,1)), exp:Math.round(safeNum(p.exp,0)), expNext:Math.round(safeNum(p.expNext,1)), score:Math.round(safeNum(g?.score,0)), stage:Math.round(safeNum(g?.stage,1)), selecting: !!p.__mxInvuln || state.phase!==PHASES.PLAYING, name: state.init?.nick||'', charType: state.localCharType||'', phase:state.phase }); }
  function postWorldIfHost(){ if(!iAmHost()||state.phase!==PHASES.PLAYING) return; const s=serializeWorld(); if(s) sendWorld(s); }
  function handlePhaseSync(m){ if(typeof m.expectedHumans==='number') state.expectedHumans=Math.max(1,Number(m.expectedHumans||1)); if(m.selectedBySid&&typeof m.selectedBySid==='object') state.selectedBySid=Object.assign({}, m.selectedBySid); const phase=String(m.phase||''); if(Object.values(PHASES).includes(phase)){ if(phase===PHASES.CHAR_SELECT && !openCharSelect()){ setTimeout(()=>handlePhaseSync(m),120); return; } setPhase(phase,{ deadline:Number(m.deadline||0)||0 }); } }
  function handleMxEvent(m){ const id=String(m.id||''); if(id&&id===state.lastEventId) return; if(id) state.lastEventId=id; const evt=String(m.evt||''); if(evt==='boss_spawn' && !iAmHost()){ try{ if (G() && G().boss == null && typeof G().spawnBoss==='function') G().spawnBoss(); }catch(_){ } }
  }
  function handleMxMsg(msg){ const m=(msg&&typeof msg==='object')?msg:{}; const from=String(m.from||''); if(from) markPeer(from); let k=String(m.kind||m.t||''); if(k==='mx_chat'||k==='chat_msg'){ k='chat'; m.kind='chat'; } if(k==='mx_phase'||k==='phase'){ k='phase_sync'; } if(k==='mx_state'){ k='state'; } if(k==='mx_world'){ k='world'; } if(k==='hello'){ send('hello_ack',{}); return; } if(k==='hello_ack'){ if(from) markPeer(from); return; } if(k==='chat'){ if(!m.text) return; ensureChat(); const cid=String(m.id||''); if(cid){ if(state.chatSeen.has(cid)) return; state.chatSeen.add(cid); if(state.chatSeen.size>300){ try{ state.chatSeen = new Set(Array.from(state.chatSeen).slice(-200)); }catch(_){ } } } if(from&&from===mySid()) return; state.chat.append(m.nick||m.name||`유저-${(from||'').slice(0,4)}`, String(m.text||''), false); return; } if(k==='phase_sync'||k==='mx_phase'){ handlePhaseSync(m); return; } if(k==='mx_event'){ handleMxEvent(m); return; } if(k==='char_selected'){ if(from){ state.selectedBySid[from]=String(m.character||''); if(state.phase===PHASES.CHAR_SELECT){ if(iAmHost()) finalizeCharSelect(false); else setOverlay(`다른 플레이어 캐릭터 선택 대기 · ${Math.max(0,activeCount()-selectedCount())}명`); } } return; } if(k==='state'||k==='mx_state'){ if(!from) return; state.remoteStates[from]={ sid:from, x:safeNum(m.x), y:safeNum(m.y), hp:safeNum(m.hp), maxHp:safeNum(m.maxHp), lvl:safeNum(m.lvl,1), exp:safeNum(m.exp,0), expNext:safeNum(m.expNext,1), score:safeNum(m.score,0), stage:safeNum(m.stage,1), selecting:!!m.selecting, name:String(m.name||m.nick||''), charType:String(m.charType||''), ts:now() }; return; } if(k==='world'||k==='mx_world'){ state.worldSnap=m; if(!iAmHost()) applyWorldSnapshotToGuest(m); return; } }
  function ensurePlayerSafetyWrap(){ try{ const g=G(); const pl=g&&g.player; if(!pl) return; if(!pl.__mxTakeDamageWrapped&&typeof pl.takeDamage==='function'){ const o=pl.takeDamage.bind(pl); pl.takeDamage=function(d){ if(this.__mxInvuln || state.phase!==PHASES.PLAYING || (!iAmHost() && (window.location.search||'').includes('embed=1'))) return; return o(d); }; pl.__mxTakeDamageWrapped=true; }
    if(!pl.__mxGainExpWrapped&&typeof pl.gainExp==='function'){ const ge=pl.gainExp.bind(pl); pl.gainExp=function(v){ if(!iAmHost() && (window.location.search||'').includes('embed=1')) return; return ge(v); }; pl.__mxGainExpWrapped=true; }
  }catch(_){} }
  function wrapGameHooks(){ const g=G(); if(!g){ ensurePlayerSafetyWrap(); return; } if(g.__mxNetWrapped){ ensurePlayerSafetyWrap(); return; } g.__mxNetWrapped=true; const origSelect=g.selectChar?.bind(g); const origStart=g.start?.bind(g); const origUpdate=g.update?.bind(g); const origLoop=g.loop?.bind(g); const origShowLevel=g.showLevelUp?.bind(g); const origShowMath=g.showMathScreen?.bind(g); const origShowItem=g.showItemScreen?.bind(g); const origSpawnBoss=g.spawnBoss?.bind(g); const origCheckBossSpawn=g.checkBossSpawn?.bind(g);
    if(origStart){ g.start=function(){ const r=origStart(); if(state.phase!==PHASES.PLAYING) pauseGame(true); try{ applyCoopScaling(); }catch(_){ } return r; }; }
    if(origSelect){ g.selectChar=function(type){ const sid=mySid()||'self'; state.localCharChosen=true; state.localCharType=String(type||''); state.selectedBySid[sid]=state.localCharType; const r=origSelect(type); pauseGame(true); send('char_selected',{ character: state.localCharType }); if(iAmHost()) finalizeCharSelect(false); else setOverlay(`다른 플레이어 캐릭터 선택 대기 · ${Math.max(0,activeCount()-selectedCount())}명`); return r; }; }
    if(origUpdate){ g.update=function(){ if(!iAmHost()&&state.worldSnap) applyWorldSnapshotToGuest(state.worldSnap); return origUpdate(); }; }
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
          const saved={ enemies:g.enemies, projectiles:g.projectiles, enemyProjectiles:g.enemyProjectiles, items:g.items, boss:g.boss };
          try{
            g.spawnEnemies=noSpawnEnemies; g.spawnBoss=noBossSpawn; g.checkBossSpawn=noCheckBossSpawn; g.processRangedEffectQueue=noRangedQueue;
            const gw=state.worldGhost||{};
            g.enemies = Array.isArray(gw.monsters)?gw.monsters.slice():[];
            g.projectiles = Array.isArray(gw.projectiles)?gw.projectiles.slice():[];
            g.enemyProjectiles = Array.isArray(gw.enemyProjectiles)?gw.enemyProjectiles.slice():[];
            g.items = Array.isArray(gw.drops)?gw.drops.slice():[];
            g.boss = g.enemies.find(e=>e&&e.isBoss) || null;
            return origLoop2(timestamp);
          } finally {
            g.spawnEnemies=se; g.spawnBoss=sb; g.checkBossSpawn=cb; g.processRangedEffectQueue=pr;
            if(state.worldGhost){
              const gw=state.worldGhost||{};
              g.enemies = Array.isArray(gw.monsters)?gw.monsters.slice():[];
              g.projectiles = Array.isArray(gw.projectiles)?gw.projectiles.slice():[];
              g.enemyProjectiles = Array.isArray(gw.enemyProjectiles)?gw.enemyProjectiles.slice():[];
              g.items = Array.isArray(gw.drops)?gw.drops.slice():[];
              g.boss = g.enemies.find(e=>e&&e.isBoss) || null;
            } else {
              g.enemies=saved.enemies; g.projectiles=saved.projectiles; g.enemyProjectiles=saved.enemyProjectiles; g.items=saved.items; g.boss=saved.boss;
            }
          }
        }
        return origLoop2(timestamp);
      }; }
    }
    if(origShowLevel){ g.showLevelUp=function(){ const r=origShowLevel(); if(iAmHost()){ const dl=now()+5000; broadcastPhaseSync(PHASES.LEVEL_CHOICE, dl, { choice:'level' }); } else { setPhase(PHASES.LEVEL_CHOICE,{deadline:now()+5000}); } return r; }; }
    if(origShowMath){ g.showMathScreen=function(x,y){ const r=origShowMath(x,y); if(iAmHost()){ const dl=now()+20000; broadcastPhaseSync(PHASES.CHEST_CHOICE, dl, { choice:'chest_math' }); } else { setPhase(PHASES.CHEST_CHOICE,{deadline:now()+20000}); } return r; }; }
    if(origShowItem){ g.showItemScreen=function(){ const r=origShowItem(); if(iAmHost()){ const dl=now()+20000; broadcastPhaseSync(PHASES.CHEST_CHOICE, dl, { choice:'chest_item' }); } else { setPhase(PHASES.CHEST_CHOICE,{deadline:now()+20000}); } return r; }; }
    if(origCheckBossSpawn){ g.checkBossSpawn=function(){ if(!iAmHost()) return; const savedScore=g.score; try{ const teamScoreProxy=Math.max(safeNum(g.score,0), Math.round(teamXpEstimate())); g.score = teamScoreProxy; return origCheckBossSpawn(); } finally { g.score = Math.max(savedScore, safeNum(g.score,0)); } }; }
    if(origSpawnBoss){ g.spawnBoss=function(){ const r=origSpawnBoss(); try{ if (g.boss){ g.boss.x = Math.round((window.MAP_WIDTH||2000)/2); g.boss.y = Math.round((window.MAP_HEIGHT||2000)/2); if (Array.isArray(g.enemies)){ const be = g.enemies.find(e=>e&&e.isBoss); if (be){ be.x=g.boss.x; be.y=g.boss.y; } } } }catch(_){ } if(iAmHost()) sendEvent('boss_spawn',{ stage:safeNum(g.stage,1) }); return r; };
    }
    ensurePlayerSafetyWrap();
  }
  function applyCoopScaling(){ const g=G(); if(!g) return; const pc=Math.max(1,Math.min(4,Number(state.startPayload?.playerCount||state.expectedHumans||1))); const enemyMul = 1 + (pc-1)*0.45; const hpMul = 1 + (pc-1)*0.35; window.__mxCoopBalance = { playerCount:pc, enemyMul, hpMul }; try{ window.MAX_ENEMIES = Math.max(window.MAX_ENEMIES||0, Math.round((window.MAX_ENEMIES||24) * enemyMul)); }catch(_){ }
  }
  function onBridgeInit(d){ state.init=d; state.localSid=String(d.sessionId||d.mySid||''); state.expectedHumans=Math.max(1, Number(d.humanCount||d.expectedHumans||1)); state.hostSid=String(d.hostSessionId||''); state.isHost=!!d.isHost || (state.localSid && state.localSid===state.hostSid); markPeer(state.localSid||'self'); ensureUi(); send('hello',{}); setTimeout(()=>send('hello',{}),500); maybeStartSequence(); }
  function onGameStart(payload){ state.startPayload=payload||{}; installEmbedStartLock(); forceEmbedScreens(); state.expectedHumans=Math.max(1, Number(payload?.playerCount || state.expectedHumans || 1)); state.rosterSids=Array.isArray(payload?.roster)?payload.roster.map(r=>String(r?.sid||'')).filter(Boolean):[]; state.hostSid = state.hostSid || (state.rosterSids[0]||''); state.isHost = state.isHost || (mySid() && mySid()===state.hostSid); applyDifficulty(payload?.difficulty||1); maybeStartSequence(); }
  window.addEventListener('message',(e)=>{ const d=e.data||{}; if(d.type==='bridge_init' && (!d.gameId || d.gameId===GAME_ID || d.gameId==='math-explorer')) return onBridgeInit(d); if(d.type==='bridge_host'){ state.hostSid=String(d.hostSessionId||state.hostSid||''); state.isHost=!!d.isHost || (mySid() && mySid()===state.hostSid); return; } if(d.type==='game_start' && d.payload && (d.payload.mode==='mathexplorer'||d.payload.mode==='math-explorer')) return onGameStart(d.payload); if(d.type==='mx_set_difficulty') return applyDifficulty(d.difficulty||1); if(d.type==='mx_msg') return handleMxMsg(d.msg||{}); });
  function patchGlobalCombatGuards(){ try{ if(window.Player&&window.Player.prototype&&!window.Player.prototype.__mxBridgeGuardPatched){ const oTD=window.Player.prototype.takeDamage; if(typeof oTD==='function'){ window.Player.prototype.takeDamage=function(d){ if((window.location.search||'').includes('embed=1') && !iAmHost()) return; if(this&&this.__mxInvuln) return; return oTD.call(this,d); }; } const oGE=window.Player.prototype.gainExp; if(typeof oGE==='function'){ window.Player.prototype.gainExp=function(v){ if((window.location.search||'').includes('embed=1') && !iAmHost()) return; return oGE.call(this,v); }; } window.Player.prototype.__mxBridgeGuardPatched=true; } }catch(_){} }
  function raf(){ try{ forceEmbedScreens(); patchGlobalCombatGuards(); if(ensureGlobalsReady()) wrapGameHooks(); const cutoff=now()-6000; for(const [sid,st] of Object.entries(state.remoteStates)){ if(!st||(st.ts||0)<cutoff) delete state.remoteStates[sid]; } if(!iAmHost() && state.phase===PHASES.PLAYING && state.worldGhost && (now()-safeNum(state.lastWorldAppliedAt,0)>1200)){ setOverlay('호스트 월드 동기화 지연…'); } else if(state.phase===PHASES.PLAYING && !state.selecting){ setOverlay(''); } drawRemoteLabels(); }catch(_){ } requestAnimationFrame(raf); } requestAnimationFrame(raf);
  setInterval(()=>{ try{ if(mySid()) send('hello',{}); }catch(_){ } },4000);
  setInterval(()=>{ try{ postLocalState(); }catch(_){ } },80);
  setInterval(()=>{ try{ postWorldIfHost(); }catch(_){ } },50);
  setTimeout(()=>{ try{ maybeStartSequence(); }catch(_){ } },800);
  setTimeout(()=>post({ type:'bridge_ready' }),50);
  try{ installEmbedStartLock(); forceEmbedScreens(); }catch(_){ }
})();
