
(()=>{'use strict';
const GAME='waterblast',W=15,H=11,TICK=1000/60,SEND_MS=48,ROUND_MS=90000,FUSE=2600,STUCK_MS=4300,DIZZY_MS=1200,BROOM_MS=9000;
const cvs=document.getElementById('c'),ctx=cvs.getContext('2d'),statusEl=document.getElementById('status'),timerEl=document.getElementById('timer'),statsEl=document.getElementById('stats'),center=document.getElementById('center'),big=document.getElementById('big'),small=document.getElementById('small');
let DPR=1,CW=0,CH=0,cell=48,ox=0,oy=0;function resize(){DPR=Math.min(2,devicePixelRatio||1);CW=innerWidth;CH=innerHeight;cvs.width=Math.round(CW*DPR);cvs.height=Math.round(CH*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=false;cell=Math.min((CW-24)/W,(CH-24)/H);ox=(CW-cell*W)/2;oy=(CH-cell*H)/2}addEventListener('resize',resize);resize();
let CHAR_META=null,WORLD_META=null,charImg=new Image(),worldImg=new Image(),assetsReady=false;
async function loadAssets(){try{const [c,w]=await Promise.all([fetch('assets/characters.json').then(r=>r.json()),fetch('assets/world.json').then(r=>r.json())]);CHAR_META=c;WORLD_META=w;await Promise.all([new Promise((res,rej)=>{charImg.onload=res;charImg.onerror=rej;charImg.src='assets/characters.webp'}),new Promise((res,rej)=>{worldImg.onload=res;worldImg.onerror=rej;worldImg.src='assets/world.webp'})]);assetsReady=true}catch(e){console.error(e);statusEl.textContent='에셋 로드 실패'}}loadAssets();
const bridge={ready:false,sid:'',seat:0,isHost:false,hostSid:'',nick:'Player',players:[]};const input={l:false,r:false,u:false,d:false,bombSeq:0,mashSeq:0};let lastBombDown=false,lastSent=0,lastMashAt=0,world=null,remoteWorld=null,finishSent=false,lastFrame=performance.now(),acc=0,simNow=0;
function post(type,obj={}){try{parent.postMessage(Object.assign({type,gameId:GAME},obj),'*')}catch(_){}}
function hash(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}function rng(seed){return()=>((seed=Math.imul(seed^seed>>>15,1|seed),seed^=seed+Math.imul(seed^seed>>>7,61|seed),((seed^seed>>>14)>>>0)/4294967296))}
function key(x,y){return x+','+y}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function roster(){return (bridge.players||[]).slice().sort((a,b)=>Number(a.seat??99)-Number(b.seat??99)).slice(0,8)}const spawns=[[1,1],[13,9],[13,1],[1,9],[7,1],[7,9],[1,5],[13,5]];function freshSeed(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return(a[0]^Date.now())>>>0}catch(_){return hash(Date.now()+'|'+Math.random()+'|'+bridge.sid)}}
function makeWorld(seedOverride){
 const rs=roster(),seed=(Number(seedOverride)||freshSeed())>>>0,R=rng(seed),crates={},clear=new Set();
 for(const[sx,sy]of spawns)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(Math.abs(dx)+Math.abs(dy)<=1)clear.add(key(sx+dx,sy+dy));
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(x%2===0&&y%2===0||clear.has(key(x,y)))continue;if(R()<.64)crates[key(x,y)]=1}
 const players={};rs.forEach((p,i)=>{const q=spawns[i];players[String(p.sessionId)]={sid:String(p.sessionId),nick:String(p.nick||'Player').slice(0,18),seat:Number(p.seat??i),x:q[0]+.5,y:q[1]+.5,alive:true,bubbled:false,bubbleUntil:0,dizzyUntil:0,mash:0,speed:3.05,range:2,maxBombs:1,bombs:0,kos:0,lastHitBy:'',face:'d',moving:false,pushUntil:0,broomUntil:0,broomStartAt:0,broomDismountUntil:0,stuckColor:'blue'}});
 const startAt=gameNow()+1800;
 return {v:4,roundId:bridge.sid+':'+seed+':'+startAt,mapSeed:seed,stateSeq:0,serverNow:gameNow(),startAt,endAt:startAt+ROUND_MS,players,crates,items:{},bombs:[],fx:[],seq:1,ended:false,winnerSid:'',winnerSeat:0};
}
function isWall(tx,ty){return tx<0||ty<0||tx>=W||ty>=H||tx===0||ty===0||tx===W-1||ty===H-1||(tx%2===0&&ty%2===0)}function bombAt(tx,ty,w=world){return(w?.bombs||[]).find(b=>b.x===tx&&b.y===ty)}
function blocked(x,y,w=world,p=null){
 const r=.29,flying=p&&p.broomUntil>simNow;
 for(const[px,py]of[[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]]){
  const tx=Math.floor(px),ty=Math.floor(py);if(isWall(tx,ty))return true;
  const slime=bombAt(tx,ty,w);
  // A newly placed slime must allow occupants to walk off it. A player standing
  // outside its collision box still cannot walk into it without pushing.
  const leaving=!!(p&&Math.abs(p.x-(tx+.5))<.5+r&&Math.abs(p.y-(ty+.5))<.5+r);
  if(!flying&&(w.crates[key(tx,ty)]||(slime&&!leaving)))return true;
 }
 return false;
}
function tryPush(p,dx,dy){if(p.broomUntil>simNow)return false;const tx=Math.floor(p.x+dx*.58),ty=Math.floor(p.y+dy*.58),b=bombAt(tx,ty);if(!b)return false;const sx=dx?Math.sign(dx):0,sy=dy?Math.sign(dy):0,nx=tx+sx,ny=ty+sy;if(isWall(nx,ny)||world.crates[key(nx,ny)]||bombAt(nx,ny))return true;b.x=nx;b.y=ny;p.pushUntil=simNow+220;return true}
function movePlayer(p,inp,dt){if(!p.alive||p.bubbled||p.dizzyUntil>simNow){p.moving=false;return}let dx=(inp.r?1:0)-(inp.l?1:0),dy=(inp.d?1:0)-(inp.u?1:0);p.moving=!!(dx||dy);if(dx&&dy){dx*=.7071;dy*=.7071}if(Math.abs(dx)>Math.abs(dy))p.face=dx<0?'l':'r';else if(dy)p.face=dy<0?'u':'d';const s=p.speed*(p.broomUntil>simNow?1.18:1)*dt;if(dx&&tryPush(p,dx,0))dx=0;if(dy&&tryPush(p,0,dy))dy=0;let nx=p.x+dx*s;if(!blocked(nx,p.y,world,p))p.x=nx;let ny=p.y+dy*s;if(!blocked(p.x,ny,world,p))p.y=ny;p.x=clamp(p.x,1.32,W-1.32);p.y=clamp(p.y,1.32,H-1.32)}
function placeBomb(p){
 if(!p.alive||p.bubbled||p.dizzyUntil>simNow||p.bombs>=p.maxBombs)return;
 const x=Math.floor(p.x),y=Math.floor(p.y);if(bombAt(x,y)||isWall(x,y)||world.crates[key(x,y)])return;
 world.bombs.push({id:'s'+(++world.seq),x,y,owner:p.sid,bornAt:simNow,at:simNow+FUSE,range:p.range});p.bombs++;p.placeUntil=simNow+180;
}
function powerFromCrate(x,y){const rr=(hash(key(x,y)+'|'+world.startAt)%1000)/1000;return rr<.48?(rr<.11?'speed':rr<.22?'range':rr<.35?'bomb':rr<.43?'broom':'bonus'):''}
function slimeColor(b,now){const q=clamp((now-Number(b.bornAt??now-FUSE))/FUSE,0,1);return q<.48?'blue':q<.80?'green':'pink'}
function explode(b,now){
 const owner=world.players[b.owner];if(owner)owner.bombs=Math.max(0,owner.bombs-1);
 const color=slimeColor(b,now),tiles=[[b.x,b.y]],parts=[{x:b.x,y:b.y,k:'center'}],drops=[];
 for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
  const ray=[];for(let n=1;n<=b.range;n++){
   const x=b.x+dx*n,y=b.y+dy*n;if(isWall(x,y))break;ray.push([x,y]);tiles.push([x,y]);
   const k=key(x,y);if(world.crates[k]){delete world.crates[k];const item=powerFromCrate(x,y);if(item)drops.push([k,item]);break;}
  }
  ray.forEach((t,i)=>parts.push({x:t[0],y:t[1],k:i===ray.length-1?'cap':(dx?'h':'v'),dx,dy}));
 }
 const effect={id:'f'+(++world.seq),tiles,parts,color,owner:b.owner,until:now+560};world.fx.push(effect);
 for(const[tx,ty]of tiles)delete world.items[key(tx,ty)];
 // Drops are revealed after the blast clears old items, so the new reward survives.
 for(const[k,item]of drops)world.items[k]=item;
 hitEffect(effect,now);
 for(const other of world.bombs)if(other.at>now&&tiles.some(([x,y])=>x===other.x&&y===other.y))other.at=now;
}
function itemPick(p){if(!p.alive||p.bubbled)return;const k=key(Math.floor(p.x),Math.floor(p.y)),it=world.items[k];if(!it)return;delete world.items[k];if(it==='speed')p.speed=Math.min(5.2,p.speed+.35);if(it==='range')p.range=Math.min(7,p.range+1);if(it==='bomb'||it==='bonus')p.maxBombs=Math.min(6,p.maxBombs+1);if(it==='broom'){p.broomStartAt=simNow;p.broomUntil=simNow+BROOM_MS}}
function simulate(dt,inputs,now){
 simNow=now;if(!world||world.ended||now<world.startAt)return;
 for(const p of Object.values(world.players)){
  if(p.dizzyUntil&&now>=p.dizzyUntil){p.dizzyUntil=0;p.alive=false;const killer=world.players[p.lastHitBy];if(killer&&killer.sid!==p.sid)killer.kos++;}
  if(p.broomUntil&&now>=p.broomUntil){p.broomUntil=0;p.broomDismountUntil=now+450;landPlayer(p);}
  const inp=inputs[p.sid]||{};movePlayer(p,inp,dt);
  const bombSeq=Math.max(0,Number(inp.bombSeq)||0);
  if(bombSeq>Number(p._bombSeq||0)){p._bombSeq=bombSeq;placeBomb(p);}
  const mashSeq=Math.max(0,Number(inp.mashSeq)||0),previousMash=Number(p._mashSeq||0);p._mashSeq=Math.max(previousMash,mashSeq);
  if(p.bubbled){
   p.mash+=Math.min(9,Math.max(0,mashSeq-previousMash));
   if(p.mash>=9){p.bubbled=false;p.bubbleUntil=0;p.mash=0;p.lastHitBy='';p.immuneUntil=now+650;}
   else if(now>=p.bubbleUntil){p.bubbled=false;p.dizzyUntil=now+DIZZY_MS;}
  }
  itemPick(p);
 }
 // Process a whole chain in this tick, including slimes made due by another blast.
 let b;while((b=world.bombs.find(b=>b.at<=now))){world.bombs.splice(world.bombs.indexOf(b),1);explode(b,now);}
 world.fx=world.fx.filter(f=>f.until>now);for(const effect of world.fx)hitEffect(effect,now);
 const active=Object.values(world.players).filter(p=>p.alive);
 if(now>=world.endAt||(active.length<=1&&Object.keys(world.players).length>=2&&now>world.startAt+2500))finish(now);
}
function finish(now){
 if(world.ended)return;world.ended=true;
 const ps=Object.values(world.players).sort((a,b)=>((b.alive?100:0)+b.kos*10)-((a.alive?100:0)+a.kos*10)||a.seat-b.seat);
 const winner=ps[0];world.winnerSid=winner?.sid||'';world.winnerSeat=winner?.seat||0;world.endAt=now;world.seq++;
}

let hostOffset=0,inputSeq=Date.now()*64;
const inputEpoch=Date.now()+':'+Math.random().toString(36).slice(2);
function gameNow(){return Date.now()+hostOffset;}
function inputPacket(){return {...input,seq:++inputSeq,epoch:inputEpoch,roundId:world?.roundId||''};}
function actionPacket(){if(bridge.ready&&world)post('wb_action',{input:inputPacket()});}
function mash(){if(world?.players?.[bridge.sid]?.bubbled&&Date.now()-lastMashAt>70){input.mashSeq++;lastMashAt=Date.now();actionPacket();}}
function pressAction(){if(world?.players?.[bridge.sid]?.bubbled)mash();else{input.bombSeq++;actionPacket();}}
function acceptInput(sid,raw){
 if(!world?.players?.[sid]||sid===bridge.sid||!raw||raw.roundId!==world.roundId)return;
 const previous=guestInputs[sid],seq=Number(raw.seq||0);if(!Number.isFinite(seq)||(previous&&seq<=previous.seq))return;
 const p=world.players[sid];
 if(p._inputEpoch&&p._inputEpoch!==raw.epoch){p._bombSeq=Number(raw.bombSeq)||0;p._mashSeq=Number(raw.mashSeq)||0;}
 p._inputEpoch=raw.epoch;
 guestInputs[sid]={l:!!raw.l,r:!!raw.r,u:!!raw.u,d:!!raw.d,bombSeq:Math.max(0,Number(raw.bombSeq)||0),mashSeq:Math.max(0,Number(raw.mashSeq)||0),seq,epoch:raw.epoch,roundId:raw.roundId};
}
function hitEffect(effect,now){
 for(const p of Object.values(world.players)){
  if(!p.alive||p.bubbled||p.dizzyUntil>now||p.immuneUntil>now)continue;
  if(effect.tiles.some(([x,y])=>Math.floor(p.x)===x&&Math.floor(p.y)===y)){
   p.bubbled=true;p.bubbleUntil=now+STUCK_MS;p.mash=0;p.lastHitBy=effect.owner;p.stuckColor=effect.color;
   const inp=p.sid===bridge.sid?input:guestInputs[p.sid];p._mashSeq=Number(inp?.mashSeq||0);
  }
 }
}
function landPlayer(p){
 if(!world.crates[key(Math.floor(p.x),Math.floor(p.y))]&&!bombAt(Math.floor(p.x),Math.floor(p.y)))return;
 const choices=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(!isWall(x,y)&&!world.crates[key(x,y)]&&!bombAt(x,y))choices.push({x:x+.5,y:y+.5});
 choices.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));if(choices[0])Object.assign(p,choices[0]);
}
addEventListener('blur',()=>{input.l=input.r=input.u=input.d=false;lastBombDown=false;});

const guestInputs={};function applyPackets(map){
 if(!bridge.ready)return;
 bridge.synced=true;
 for(const[sid,packet]of Object.entries(map||{})){
  if(bridge.isHost&&packet?.__waterblastInput)acceptInput(sid,packet.__waterblastInput);
  const ww=packet?.__waterblastWorld;
  if(!ww||(bridge.isHost&&world)||sid!==bridge.hostSid||!ww.roundId||!ww.players?.[bridge.sid])continue;
  if(world&&world.roundId!==ww.roundId)continue;
  if(remoteWorld&&ww.roundId===remoteWorld.roundId&&Number(ww.stateSeq)<=Number(remoteWorld.stateSeq))continue;
  hostOffset=Number(ww.serverNow||Date.now())-Date.now();remoteWorld=ww;world=ww;
  if(bridge.isHost){const me=world.players[bridge.sid];me._bombSeq=input.bombSeq;me._mashSeq=input.mashSeq;reconcile(bridge.players);}
 }
}function sendState(now){
 if(!bridge.ready||(bridge.isHost&&!world)||now-lastSent<SEND_MS)return;lastSent=now;
 const state={__waterblastInput:inputPacket()};
 if(bridge.isHost&&world){world.stateSeq=Number(world.stateSeq||0)+1;world.serverNow=gameNow();state.__waterblastWorld=world;}
 post('wb_state',{state});
}function reconcile(players){
 bridge.players=(players||[]).filter(p=>p&&(p.sessionId||p.sid)).map(p=>({...p,sessionId:String(p.sessionId||p.sid)}));
 if(bridge.isHost&&world)for(const[sid,p]of Object.entries(world.players))if(!bridge.players.some(x=>x.sessionId===sid)&&p.alive){p.alive=false;p.bubbled=false;}
}
function onBridge(d){
 if(!d||typeof d!=='object')return;
 if(d.type==='bridge_init'&&d.gameId===GAME){
  if(!d.sessionId)return;bridge.sid=String(d.sessionId);bridge.seat=Number(d.seat??d.selfSeat??0);bridge.nick=d.nick||'Player';
  bridge.isHost=!!d.isHost;bridge.expectedHumans=Math.max(2,Number(d.expectedHumans||d.humanCount||d.players?.length||2));
  bridge.hostSid=String(d.hostSessionId||d.hostSid||d.players?.find(p=>p.isHost)?.sessionId||(bridge.isHost?bridge.sid:''));
  bridge.ready=true;reconcile(d.players||[]);post('wb_sync');
  center.classList.remove('hidden');big.textContent='슬라임 아레나';small.textContent='플레이어와 에셋을 준비하고 있습니다…';return;
 }
 if(d.type==='bridge_host'){
  const was=bridge.isHost;bridge.isHost=!!d.isHost;bridge.hostSid=String(d.hostSessionId||d.hostSid||(bridge.isHost?bridge.sid:bridge.hostSid));
  if(!was&&bridge.isHost){world=remoteWorld||world;finishSent=false;for(const id of Object.keys(guestInputs))delete guestInputs[id];reconcile(bridge.players);}
  return;
 }
 if(d.type==='bridge_roster'&&d.gameId===GAME){reconcile(d.players||[]);return;}
 if(d.type==='wb_players'&&d.gameId===GAME){applyPackets(d.players||{});return;}
 if(d.type==='wb_action'&&d.gameId===GAME&&bridge.isHost)acceptInput(String(d.sid||''),d.input);
}addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin)onBridge(e.data||{});});post('bridge_ready');for(const delay of [200,700,1600,3200])setTimeout(()=>{if(!bridge.ready)post('bridge_ready')},delay);
function setKey(k,on){
 if(['ArrowLeft','a','A'].includes(k))input.l=on;if(['ArrowRight','d','D'].includes(k))input.r=on;
 if(['ArrowUp','w','W'].includes(k))input.u=on;if(['ArrowDown','s','S'].includes(k))input.d=on;
 if(on&&['x','X',' '].includes(k)&&!lastBombDown){pressAction();lastBombDown=true;}
 if(!on&&['x','X',' '].includes(k))lastBombDown=false;
 if(on&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D'].includes(k))mash();
}addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','x','X','w','a','s','d','W','A','S','D'].includes(e.key))e.preventDefault();setKey(e.key,true)});addEventListener('keyup',e=>setKey(e.key,false));
const joy=document.getElementById('joy'),knob=document.getElementById('knob'),bombBtn=document.getElementById('bomb');let joyId=null;function joyMove(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,m=Math.hypot(dx,dy),lim=42,ux=m?dx/m:0,uy=m?dy/m:0,mm=Math.min(lim,m);knob.style.transform=`translate(${ux*mm}px,${uy*mm}px)`;input.l=dx<-18;input.r=dx>18;input.u=dy<-18;input.d=dy>18;if(m>28)mash()}joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joyMove(e)});function joyEnd(e){if(e.pointerId!==joyId)return;joyId=null;knob.style.transform='';input.l=input.r=input.u=input.d=false}joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);bombBtn.addEventListener('pointerdown',e=>{e.preventDefault();pressAction();});
function tileRect(x,y){return[ox+x*cell,oy+y*cell,cell,cell]}function ws(name,x,y,w,h,rot=0){if(!assetsReady)return false;const r=WORLD_META.sprites[name];if(!r)return false;ctx.save();ctx.translate(x+w/2,y+h/2);if(rot)ctx.rotate(rot);ctx.drawImage(worldImg,r[0],r[1],r[2],r[3],-w/2,-h/2,w,h);ctx.restore();return true}function cs(rect,x,y,w,h,flip=false){if(!assetsReady||!rect)return;ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.drawImage(charImg,rect[0],rect[1],rect[2],rect[3],-w/2,-h,w,h);ctx.restore()}
const CHAR_NAMES=['red','silver','gold','pink'];function charName(p){return CHAR_NAMES[(p.seat||0)%4]}function charFrame(p,now){const m=CHAR_META?.characters?.[charName(p)];if(!m)return null;if(world?.ended&&p.sid===world.winnerSid)return m.win;if(!p.alive)return m.dizzy;if(p.dizzyUntil>now)return m.dizzy;if(p.bubbled)return m.stuck[p.stuckColor||'blue'];if(p.broomUntil>now){if(now-(p.broomStartAt||0)<450)return m.broom_mount;return p.pushUntil>now?m.broom_place[p.face||'d']:m.broom[p.face||'d']}if(p.broomDismountUntil>now)return m.broom_mount;if(p.pushUntil>now)return m.push[p.face||'d'];if(p.placeUntil>now)return m.place[p.face||'d'];if(p.moving){const a=m.walk[p.face||'d'];return a[Math.floor(now/120)%a.length]}return m.idle[p.face||'d']}
function drawBlastPart(f,q,x,y){
 const color=({blue:'#36d9ff',green:'#7fee56',pink:'#ff68c0'})[f.color]||'#36d9ff';
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp((f.until-gameNow())/160,0,1);
 ctx.shadowColor=color;ctx.shadowBlur=cell*.18;
 const horizontal=q.k==='center'||q.k==='h'||q.k==='cap'&&q.dx;
 const vertical=q.k==='center'||q.k==='v'||q.k==='cap'&&q.dy;
 for(const [width,fill]of [[.58,color],[.23,'#e6fffb']]){
  ctx.fillStyle=fill;const a=cell*(1-width)/2;
  if(horizontal){ctx.beginPath();ctx.roundRect(-1,a,cell+2,cell*width,cell*.09);ctx.fill();}
  if(vertical){ctx.beginPath();ctx.roundRect(a,-1,cell*width,cell+2,cell*.09);ctx.fill();}
 }
 ctx.restore();
}
function draw(){ctx.clearRect(0,0,CW,CH);ctx.fillStyle='#0b2435';ctx.fillRect(0,0,CW,CH);const w=world;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const[px,py]=tileRect(x,y);if(!ws(((x+y)&1)?'floor_stone':'floor_stone2',px,py,cell+1,cell+1)){ctx.fillStyle=((x+y)&1)?'#7f9b86':'#8ca691';ctx.fillRect(px,py,cell+1,cell+1)}if(isWall(x,y)){ws('wall',px+2,py+2,cell-4,cell-4);if((x===0||x===W-1||y===0||y===H-1)&&hash(x+','+y)%7===0)ws('flowers',px+cell*.12,py+cell*.12,cell*.76,cell*.76)}}if(!w)return;for(const k of Object.keys(w.crates||{})){const[x,y]=k.split(',').map(Number),[px,py]=tileRect(x,y);ws(hash(k)%2?'crate':'crate2',px+3,py+3,cell-6,cell-6)}for(const[k,it]of Object.entries(w.items||{})){const[x,y]=k.split(',').map(Number),cx=ox+(x+.5)*cell,cy=oy+(y+.5)*cell;const nm=it==='speed'?'item_speed':it==='range'?'item_range':it==='broom'?'item_broom':'item_plus';if(!ws(nm,cx-cell*.28,cy-cell*.28,cell*.56,cell*.56)){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(cx,cy,cell*.2,0,7);ctx.fill()}}for(const b of w.bombs||[]){const cx=ox+(b.x+.5)*cell,cy=oy+(b.y+.5)*cell,color=slimeColor(b,gameNow()),s=1+.035*Math.sin(performance.now()/125),hh=cell*.68/s;ws('slime_'+color,cx-cell*.36,cy-hh*.56,cell*.72,hh)}for(const f of w.fx||[]){for(const q of(f.parts||[])){const[px,py]=tileRect(q.x,q.y),nm='fx_'+(f.color||'blue')+'_'+q.k;let rot=0;if(q.k==='cap'){if(q.dx<0)rot=Math.PI;if(q.dy>0)rot=Math.PI/2;if(q.dy<0)rot=-Math.PI/2}drawBlastPart(f,q,px,py)}}for(const p of Object.values(w.players||{})){const cx=ox+p.x*cell,cy=oy+p.y*cell;ctx.save();ctx.globalAlpha=p.alive?1:.45;ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(cx,cy+cell*.24,cell*.24,cell*.09,0,0,7);ctx.fill();const rect=charFrame(p,gameNow()),mounted=p.broomUntil>gameNow()||p.broomDismountUntil>gameNow(),scale=mounted?1.13:1;cs(rect,cx,cy+cell*.31,cell*.88*scale,cell*1.08*scale,p.face==='r');ctx.restore();ctx.fillStyle='#fff';ctx.font=`800 ${Math.max(10,cell*.17)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(p.nick,cx,cy-cell*.46);if(p.bubbled){ctx.font=`900 ${Math.max(10,cell*.16)}px sans-serif`;ctx.fillText(`${p.mash||0}/9`,cx,cy+cell*.53)}}const me=w.players?.[bridge.sid];if(me){statsEl.textContent=`🫧${me.maxBombs} · 📏${me.range} · 👟${Math.max(1,Math.round((me.speed-2.7)/.35))}${me.broomUntil>gameNow()?' · 🧹':''}`;statusEl.textContent=me.alive?(me.bubbled?'슬라임! 이동키 / 🫧 버튼 연타로 탈출!':me.dizzyUntil>gameNow()?'빙글빙글… 기절!':`KO ${me.kos} · ${bridge.isHost?'HOST':'PLAYER'}`):'탈락 · 결과를 기다리는 중'}const now=gameNow(),sec=Math.ceil(Math.min(ROUND_MS,Math.max(0,w.endAt-now))/1000);timerEl.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;if(w.ended){const win=w.players?.[w.winnerSid];center.classList.remove('hidden');big.textContent=win?.sid===bridge.sid?'승리! 🏆':`${win?.nick||'플레이어'} 승리!`;small.textContent=`KO ${win?.kos||0} · 잠시 후 방으로 돌아갑니다.`}else if(now<w.startAt){center.classList.remove('hidden');big.textContent=String(Math.max(1,Math.ceil((w.startAt-now)/1000)));small.textContent='슬라임을 설치하고 물줄기를 피해 마지막까지 살아남으세요!'}else center.classList.add('hidden')}
function loop(t){
 const d=Math.min(.05,(t-lastFrame)/1000);lastFrame=t;acc+=d;
 if(bridge.isHost){
  if(!world&&bridge.ready&&bridge.synced&&assetsReady&&roster().length>=bridge.expectedHumans)world=makeWorld();
  while(acc>=TICK/1000){simulate(TICK/1000,Object.assign({},guestInputs,{[bridge.sid]:input}),gameNow());acc-=TICK/1000;}
  if(world?.ended&&!finishSent&&gameNow()>=world.endAt+2100){finishSent=true;post('wb_over',{winnerSeat:world.winnerSeat});}
 }else acc=0;
 sendState(t);draw();requestAnimationFrame(loop);
}requestAnimationFrame(loop);
})();
