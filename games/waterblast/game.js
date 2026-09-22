
(()=>{'use strict';
const GAME='waterblast',W=17,H=14,TICK=1000/60,SEND_MS=48,ROUND_MS=90000,FUSE=2600,STUCK_MS=4300,DIZZY_MS=1200;
const cvs=document.getElementById('c'),screenCtx=cvs.getContext('2d'),statusEl=document.getElementById('status'),timerEl=document.getElementById('timer'),statsEl=document.getElementById('stats'),center=document.getElementById('center'),big=document.getElementById('big'),small=document.getElementById('small');
let ctx=screenCtx;
let DPR=1,CW=0,CH=0,cell=48,ox=0,oy=0,viewX=0,viewY=0,viewW=0,viewH=0;
const camera={ox:0,oy:0,ready:false};
let gardenCache=null,gardenCacheKey='';
function resize(){DPR=Math.min(2,devicePixelRatio||1);CW=innerWidth;CH=innerHeight;cvs.width=Math.round(CW*DPR);cvs.height=Math.round(CH*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=false;
 const touch=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches,wide=CW>=1000&&CH>=600&&!touch,land=CW>CH;
 const left=wide?192:land?106:6,right=land&&!wide?84:6,top=wide?48:land?38:122,bottom=wide?28:land?8:180;
 viewX=left;viewY=top;viewW=Math.max(120,CW-left-right);viewH=Math.max(120,CH-top-bottom);
 const visibleCols=wide?13.2:land?11.6:8.4,visibleRows=wide?10.4:land?8.8:10.8;
 cell=Math.max(18,Math.min(viewW/visibleCols,viewH/visibleRows));camera.ready=false;gardenCacheKey='';
} addEventListener('resize',resize);resize();
function updateCamera(w){const p=w?.players?.[bridge.sid],source=!bridge.isHost&&p&&motion.pose?{...p,x:motion.pose.x,y:motion.pose.y}:p;if(!source){ox=viewX+(viewW-W*cell)/2;oy=viewY+(viewH-H*cell)/2;return;}
 const focusX=source.x,focusY=source.y,targetX=viewX+viewW*.50-focusX*cell,targetY=viewY+viewH*.52-focusY*cell;
 const minX=viewX+viewW-W*cell,maxX=viewX,minY=viewY+viewH-H*cell,maxY=viewY;
 const tx=W*cell<=viewW?viewX+(viewW-W*cell)/2:clamp(targetX,minX,maxX),ty=H*cell<=viewH?viewY+(viewH-H*cell)/2:clamp(targetY,minY,maxY);
 if(!camera.ready){camera.ox=tx;camera.oy=ty;camera.ready=true;}else{camera.ox+=(tx-camera.ox)*.24;camera.oy+=(ty-camera.oy)*.24;if(Math.abs(tx-camera.ox)<.05)camera.ox=tx;if(Math.abs(ty-camera.oy)<.05)camera.oy=ty;}
 ox=camera.ox;oy=camera.oy;
}
const extraItems={};for(const name of ['speed','range','bomb','bonus','broom','potion','shield','maxpower']){const img=new Image();img.src='assets/pixel-v21/'+name+'.webp';extraItems[name]=img;}const knockoutImg=new Image();knockoutImg.src='assets/pixel-v21/knockout.webp';const shieldFxImg=new Image();shieldFxImg.src='assets/pixel-v21/shield-aura.webp';const slimeAtlasImg=new Image();slimeAtlasImg.src='assets/pixel-v21/slime-atlas.webp';
const walkImages=Object.fromEntries(['red','silver','gold','pink'].map(name=>{const image=new Image();image.src='assets/walk-v22/'+name+'.webp';return [name,image];}));
let CHAR_META=null,WORLD_META=null,charImg=new Image(),worldImg=new Image(),potionImg=new Image(),townImg=new Image(),assetsReady=false;
async function loadAssets(){try{const [c,w]=await Promise.all([fetch('assets/characters.json').then(r=>r.json()),fetch('assets/garden-v8.json').then(r=>r.json())]);CHAR_META=c;WORLD_META=w;await Promise.all([new Promise((res,rej)=>{charImg.onload=res;charImg.onerror=rej;charImg.src='assets/characters.webp'}),new Promise((res,rej)=>{worldImg.onload=res;worldImg.onerror=rej;worldImg.src='assets/garden-v8.webp'}),new Promise((res,rej)=>{potionImg.onload=res;potionImg.onerror=rej;potionImg.src='assets/removal-potion-v8.webp'})]);await new Promise((res,rej)=>{townImg.onload=res;townImg.onerror=rej;townImg.src='assets/town-v13.webp'});await Promise.allSettled([...Object.values(extraItems),...Object.values(walkImages),knockoutImg,shieldFxImg,slimeAtlasImg].map(img=>img.decode()));assetsReady=true;buildHudIcons()}catch(e){console.error(e);statusEl.textContent='에셋 로드 실패'}}loadAssets();
const bridge={ready:false,sid:'',seat:0,isHost:false,hostSid:'',nick:'Player',players:[]};const input={l:false,r:false,u:false,d:false,bombSeq:0,mashSeq:0,potionSeq:0,pushSeq:0,pushFace:"d"};let lastBombDown=false,lastPotionDown=false,lastPushDown=false,lastSent=0,lastMashAt=0,world=null,remoteWorld=null,finishSent=false,lastFrame=performance.now(),acc=0,simNow=0;
function post(type,obj={}){try{parent.postMessage(Object.assign({type,gameId:GAME},obj),'*')}catch(_){}}
function hash(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}function rng(seed){return()=>((seed=Math.imul(seed^seed>>>15,1|seed),seed^=seed+Math.imul(seed^seed>>>7,61|seed),((seed^seed>>>14)>>>0)/4294967296))}
function key(x,y){return x+','+y}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function roster(){return (bridge.players||[]).slice().sort((a,b)=>Number(a.seat??99)-Number(b.seat??99)).slice(0,4)}const spawns=[[1,1],[15,12],[15,1],[1,12]];function freshSeed(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return(a[0]^Date.now())>>>0}catch(_){return hash(Date.now()+'|'+Math.random()+'|'+bridge.sid)}}
function makeWorld(seedOverride){
 const rs=roster(),seed=(Number(seedOverride)||freshSeed())>>>0,R=rng(seed),crates={},clear=new Set();
 for(const[sx,sy]of spawns)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(Math.abs(dx)+Math.abs(dy)<=1)clear.add(key(sx+dx,sy+dy));
 const crateCellAllowed=(x,y)=>!isWall(x,y)&&!clear.has(key(x,y))&&!isWall(x,y+1);
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const mx=W-1-x,my=H-1-y;if(!crateCellAllowed(x,y)||!crateCellAllowed(mx,my))continue;if(y*W+x>my*W+mx)continue;if(R()<.76){crates[key(x,y)]=1;crates[key(mx,my)]=1}}
 const players={};rs.forEach((p,i)=>{const q=spawns[i];players[String(p.sessionId)]={sid:String(p.sessionId),nick:String(p.nick||'Player').slice(0,18),seat:Number(p.seat??i),x:q[0]+.5,y:q[1]+.5,alive:true,bubbled:false,bubbleUntil:0,dizzyUntil:0,mash:0,speed:3.05,range:2,maxBombs:1,bombs:0,kos:0,lastHitBy:'',face:'d',moving:false,pushUntil:0,broom:false,potions:0,rescueUntil:0,broomStartAt:0,broomDismountUntil:0,stuckColor:'blue'}});
 const startAt=gameNow()+1800;
 return {v:4,roundId:bridge.sid+':'+seed+':'+startAt,mapSeed:seed,stateSeq:0,serverNow:gameNow(),startAt,endAt:startAt+ROUND_MS,players,crates,items:{},bombs:[],fx:[],seq:1,ended:false,winnerSid:'',winnerSeat:0};
}
function isWall(tx,ty){return tx<0||ty<0||tx>=W||ty>=H||tx===0||ty===0||tx===W-1||ty===H-1||(tx%2===0&&ty%2===0)}function bombAt(tx,ty,w=world){return(w?.bombs||[]).find(b=>b.x===tx&&b.y===ty)}
function blocked(x,y,w=world,p=null){
 const r=.25,flying=p&&p.broom;
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
function tryPush(p,dx,dy){
 if(!p.alive||p.bubbled||p.dizzyUntil>simNow)return false;
 const b=bombAt(Math.floor(p.x),Math.floor(p.y))||bombAt(Math.floor(p.x+dx*.58),Math.floor(p.y+dy*.58));
 if(!b||b.owner!==p.sid)return false;
 const nx=b.x+dx,ny=b.y+dy;if(isWall(nx,ny)||world.crates[key(nx,ny)]||bombAt(nx,ny))return false;
 b.x=nx;b.y=ny;p.pushUntil=simNow+220;return true;
}
function pushBomb(p,face){const v=({l:[-1,0],r:[1,0],u:[0,-1],d:[0,1]})[face||p.face]||[0,1];return tryPush(p,...v);}
function pressPush(){
 const p=world?.players?.[bridge.sid];if(!p?.alive||world.ended)return;
 if(p.bubbled){mash();return;}if(p.dizzyUntil>gameNow())return;
 input.pushFace=input.l?'l':input.r?'r':input.u?'u':input.d?'d':p.face;
 input.pushSeq++;actionPacket();
}
function movePlayer(p,inp,dt,w=world,now=simNow){
 if(!p.alive||p.bubbled||p.dizzyUntil>now){p.moving=false;return;}
 let dx=(inp.r?1:0)-(inp.l?1:0),dy=(inp.d?1:0)-(inp.u?1:0);
 if(dx&&dy){if(inp.moveAxis==='x')dy=0;else dx=0;}
 p.moving=!!(dx||dy);if(dx)p.face=dx<0?'l':'r';else if(dy)p.face=dy<0?'u':'d';
 const oldX=p.x,oldY=p.y,step=p.speed*(p.broom?1.18:1)*dt;
 if(dx){const nx=p.x+dx*step;if(!blocked(nx,p.y,w,p))p.x=nx;else{const cy=Math.floor(p.y)+.5,d=cy-p.y;if(Math.abs(d)<.33&&!blocked(nx,cy,w,p)){const y=p.y+clamp(d,-step,step);if(!blocked(p.x,y,w,p))p.y=y;}}}
 if(dy){const ny=p.y+dy*step;if(!blocked(p.x,ny,w,p))p.y=ny;else{const cx=Math.floor(p.x)+.5,d=cx-p.x;if(Math.abs(d)<.33&&!blocked(cx,ny,w,p)){const x=p.x+clamp(d,-step,step);if(!blocked(x,p.y,w,p))p.x=x;}}}
 p.x=clamp(p.x,1.32,W-1.32);p.y=clamp(p.y,1.32,H-1.32);p.moving=Math.hypot(p.x-oldX,p.y-oldY)>.00001;
}
function placeBomb(p){
 if(!p.alive||p.bubbled||p.dizzyUntil>simNow||p.bombs>=p.maxBombs)return;
 const x=Math.floor(p.x),y=Math.floor(p.y);if(bombAt(x,y)||isWall(x,y)||world.crates[key(x,y)])return;
 world.bombs.push({id:'s'+(++world.seq),x,y,owner:p.sid,bornAt:simNow,at:simNow+FUSE,range:p.range});p.bombs++;p.placeUntil=simNow+180;
}
function powerFromCrate(x,y){const rr=(hash(key(x,y)+'|'+world.startAt)%1000)/1000;return rr<.54?(rr<.11?'speed':rr<.22?'range':rr<.35?'bomb':rr<.37?'broom':rr<.43?'potion':rr<.48?'bonus':rr<.51?'shield':'maxpower'):''}
function slimeColor(b,now){const q=clamp((now-Number(b.bornAt??now-FUSE))/FUSE,0,1);return q<.48?'blue':q<.80?'yellow':'pink'}
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
function knockoutNow(p,now,killerSid=''){p.bubbled=false;p.bubbleUntil=0;p.dizzyUntil=0;p.mash=0;p.alive=false;p.broom=false;p.broomDismountUntil=0;p.pushUntil=0;p.placeUntil=0;if(killerSid)p.lastHitBy=killerSid;const killer=world.players[p.lastHitBy];if(killer&&killer.sid!==p.sid)killer.kos++;}
function itemPick(p){if(!p.alive||p.bubbled||p.dizzyUntil>simNow)return;const k=key(Math.floor(p.x),Math.floor(p.y)),it=world.items[k];if(!it||(it==='potion'&&p.potions>=1))return;const atCap=it==='speed'?p.speed>=5.2:it==='range'?p.range>=7:it==='bomb'?p.maxBombs>=6:false;p.pickupAtCap=atCap;delete world.items[k];if(it==='speed')p.speed=Math.min(5.2,p.speed+.35);if(it==='range')p.range=Math.min(7,p.range+1);if(it==='bomb'||it==='bonus')p.maxBombs=Math.min(6,p.maxBombs+1);if(it==='bonus'){p.speed=Math.min(5.2,p.speed+.35);p.range=Math.min(7,p.range+1);}if(it==='shield')p.shield=1;if(it==='maxpower')p.range=7;p.pickupKind=it;p.pickupSerial=(p.pickupSerial||0)+1;if(it==='broom'){p.broomStartAt=simNow;p.broom=true;}if(it==='potion')p.potions=1;}
function simulate(dt,inputs,now){
 simNow=now;if(!world||world.ended||now<world.startAt)return;
 for(const p of Object.values(world.players)){
  const inp=inputs[p.sid]||{};
  const potionSeq=Math.max(0,Number(inp.potionSeq)||0);
  if(potionSeq>Number(p._potionSeq||0)){p._potionSeq=potionSeq;usePotion(p,now);}
  if(p.dizzyUntil&&now>=p.dizzyUntil){p.dizzyUntil=0;p.alive=false;}
  if(p.sid!==bridge.sid&&Array.isArray(inp.moves))consumeMoves(p,inp,dt,now);else movePlayer(p,inp,dt);
  const bombSeq=Math.max(0,Number(inp.bombSeq)||0);
  if(bombSeq>Number(p._bombSeq||0)){p._bombSeq=bombSeq;placeBomb(p);}
  const pushSeq=Math.max(0,Number(inp.pushSeq)||0);if(pushSeq>Number(p._pushSeq||0)){p._pushSeq=pushSeq;pushBomb(p,inp.pushFace);}
  const mashSeq=Math.max(0,Number(inp.mashSeq)||0),previousMash=Number(p._mashSeq||0);p._mashSeq=Math.max(previousMash,mashSeq);
  if(p.bubbled){
   p.mash+=Math.min(9,Math.max(0,mashSeq-previousMash));
   if(p.mash>=9){p.bubbled=false;p.bubbleUntil=0;p.mash=0;p.lastHitBy='';p.immuneUntil=now+650;}
   else if(now>=p.bubbleUntil){knockoutNow(p,now);}
  }
  itemPick(p);
 }
 // An exposed trapped opponent can be popped by contact; the existing potion
 // remains usable during the final dizzy window.
 for(const p of Object.values(world.players))if(p.alive&&p.bubbled){const q=Object.values(world.players).find(q=>q.sid!==p.sid&&q.alive&&!q.bubbled&&q.dizzyUntil<=now&&Math.hypot(q.x-p.x,q.y-p.y)<.62);if(q){knockoutNow(p,now,q.sid);}}
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
let previousLocal=null;const renderedPlayers=new Map();
const motion={round:'',pending:[],next:0,pose:null};
function direction(i){let x=Number(!!i.r)-Number(!!i.l),y=Number(!!i.d)-Number(!!i.u);if(x&&y){if(i.moveAxis==='x')y=0;else x=0;}return x<0?'l':x>0?'r':y<0?'u':y>0?'d':'';}
function rebuildMotion(){const p=world?.players?.[bridge.sid];if(!p)return;
 if(motion.round!==world.roundId){motion.round=world.roundId;motion.pending=[];motion.next=0;}
 if(p._inputEpoch===inputEpoch){motion.pending=motion.pending.filter(f=>f[0]>Number(p._moveAck||0));motion.next=Math.max(motion.next,Number(p._moveAck||0));}
 motion.pose={...p};if(world.ended||gameNow()<world.startAt)return;
 for(const [,dir]of motion.pending)movePlayer(motion.pose,{[dir]:true},TICK/1000,world,gameNow());
}
function predictMotion(){if(bridge.isHost||!world)return;rebuildMotion();if(world.ended||gameNow()<world.startAt||motion.pending.length>=120)return;
 motion.pending.push([++motion.next,direction(input)]);movePlayer(motion.pose,{[direction(input)]:true},TICK/1000,world,gameNow());
}
function consumeMoves(p,inp,dt,now){
 p._moveCredit=Math.min(.15,(p._moveCredit||0)+dt);let count=0;
 for(const f of inp.moves){if(f[0]<=Number(p._moveAck||0))continue;if(f[0]!==Number(p._moveAck||0)+1||p._moveCredit+1e-8<TICK/1000||count>=9)break;
 movePlayer(p,{[f[1]]:true},TICK/1000,world,now);p._lastMoveAt=now;p._moveAck=f[0];p._moveCredit-=TICK/1000;count++;
 }if(!count&&(direction(inp)===''||now-(p._lastMoveAt||0)>180))p.moving=false;
}
function inputPacket(){return {...input,seq:++inputSeq,epoch:inputEpoch,roundId:world?.roundId||'',...(!bridge.isHost?{moves:motion.pending.map(f=>f.slice())}:{})};}
function actionPacket(){if(bridge.ready&&world)post('wb_action',{input:inputPacket()});}
function mash(){if(world?.players?.[bridge.sid]?.bubbled&&Date.now()-lastMashAt>70){input.mashSeq++;lastMashAt=Date.now();actionPacket();}}
function canUsePotion(p,now=gameNow()){
 return !!(world&&!world.ended&&p?.alive&&p.potions>0&&(p.bubbled||p.dizzyUntil>now));
}
function usePotion(p,now){
 if(!canUsePotion(p,now))return false;
 p.potions--;p.bubbled=false;p.bubbleUntil=0;p.dizzyUntil=0;p.mash=0;p.lastHitBy='';
 p.immuneUntil=now+900;p.rescueUntil=now+650;landPlayer(p);return true;
}
function pressPotion(){
 if(!canUsePotion(world?.players?.[bridge.sid]))return;
 input.potionSeq++;actionPacket();
}
function pressAction(){if(world?.players?.[bridge.sid]?.bubbled)mash();else{input.bombSeq++;actionPacket();}}
function acceptInput(sid,raw){
 if(!world?.players?.[sid]||sid===bridge.sid||!raw||raw.roundId!==world.roundId)return;
 const previous=guestInputs[sid],seq=Number(raw.seq||0);if(!Number.isFinite(seq)||(previous&&seq<=previous.seq))return;
 const p=world.players[sid];
 if(p._inputEpoch&&p._inputEpoch!==raw.epoch){p._bombSeq=Number(raw.bombSeq)||0;p._mashSeq=Number(raw.mashSeq)||0;p._potionSeq=Number(raw.potionSeq)||0;p._pushSeq=Number(raw.pushSeq)||0;}
 if(p._inputEpoch!==raw.epoch){p._moveAck=0;p._moveCredit=0;}
 p._inputEpoch=raw.epoch;
 const moves=Array.isArray(raw.moves)?raw.moves.slice(0,120).filter(f=>Array.isArray(f)&&Number.isSafeInteger(f[0])&&f[0]>0&&['','l','r','u','d'].includes(f[1])).map(f=>[f[0],f[1]]).sort((a,b)=>a[0]-b[0]):undefined;
 guestInputs[sid]={...(moves?{moves}:{}),moveAxis:raw.moveAxis==='x'?'x':'y',l:!!raw.l,r:!!raw.r,u:!!raw.u,d:!!raw.d,bombSeq:Math.max(0,Number(raw.bombSeq)||0),mashSeq:Math.max(0,Number(raw.mashSeq)||0),potionSeq:Math.max(0,Number(raw.potionSeq)||0),pushSeq:Math.max(0,Number(raw.pushSeq)||0),pushFace:["u","d","l","r"].includes(raw.pushFace)?raw.pushFace:p.face,seq,epoch:raw.epoch,roundId:raw.roundId};
}
function hitEffect(effect,now){
 for(const p of Object.values(world.players)){
  if(!p.alive||p.bubbled||p.dizzyUntil>now||p.immuneUntil>now)continue;
  if(effect.tiles.some(([x,y])=>Math.floor(p.x)===x&&Math.floor(p.y)===y)){
   if(p.shield){p.shield=0;p.immuneUntil=now+750;p.shieldBreakAt=now;continue;}
   if(p.broom){p.broom=false;p.broomDismountUntil=now+450;landPlayer(p);}
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
addEventListener('blur',()=>releaseControls());addEventListener('visibilitychange',()=>{if(document.hidden)releaseControls();});

const guestInputs={};function applyPackets(map){
 if(!bridge.ready)return;
 bridge.synced=true;
 for(const[sid,packet]of Object.entries(map||{})){
  if(bridge.isHost&&packet?.__waterblastInput)acceptInput(sid,packet.__waterblastInput);
  const ww=packet?.__waterblastWorld;
  if(!ww||(bridge.isHost&&world)||sid!==bridge.hostSid||!ww.roundId||!ww.players?.[bridge.sid])continue;
  if(world&&world.roundId!==ww.roundId)continue;
  if(remoteWorld&&ww.roundId===remoteWorld.roundId&&Number(ww.stateSeq)<=Number(remoteWorld.stateSeq))continue;
  hostOffset=Number(ww.serverNow||Date.now())-Date.now();remoteWorld=ww;world=ww;if(!bridge.isHost)rebuildMotion();
  if(bridge.isHost){const me=world.players[bridge.sid];me._bombSeq=input.bombSeq;me._mashSeq=input.mashSeq;me._potionSeq=input.potionSeq;me._pushSeq=input.pushSeq;reconcile(bridge.players);}
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
const heldDirections=new Map();let keyOrder=0;
const keyDirection=k=>({ArrowLeft:'l',a:'l',A:'l',ArrowRight:'r',d:'r',D:'r',ArrowUp:'u',w:'u',W:'u',ArrowDown:'d',s:'d',S:'d'})[k];
function updateKeyboard(){let best='',order=-1;for(const [key,value]of heldDirections)if(value>order){best=keyDirection(key);order=value;}input.l=best==='l';input.r=best==='r';input.u=best==='u';input.d=best==='d';input.moveAxis=best==='l'||best==='r'?'x':'y';}
function releaseControls(){heldDirections.clear();input.l=input.r=input.u=input.d=false;lastBombDown=lastPotionDown=lastPushDown=false;if(typeof knob!=='undefined')knob.style.transform='';joyId=null;actionPacket();}
function setKey(k,on){
 const dir=keyDirection(k);if(dir){if(on){if(heldDirections.has(k))return;heldDirections.set(k,++keyOrder);}else heldDirections.delete(k);updateKeyboard();if(on)mash();actionPacket();return;}
 if(['x','X'].includes(k)){if(on&&!lastPushDown)pressPush();lastPushDown=on;}
 if(['c','C'].includes(k)){if(on&&!lastPotionDown)pressPotion();lastPotionDown=on;}
 if(on&&['z','Z',' '].includes(k)&&!lastBombDown){pressAction();lastBombDown=true;}
 if(!on&&['z','Z',' '].includes(k))lastBombDown=false;
}addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','x','X','w','a','s','d','W','A','S','D','c','C','z','Z'].includes(e.key))e.preventDefault();setKey(e.key,true)});addEventListener('keyup',e=>setKey(e.key,false));
const joy=document.getElementById('joy'),knob=document.getElementById('knob'),bombBtn=document.getElementById('bomb');let joyId=null;function joyMove(e){const previous=direction(input),r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,m=Math.hypot(dx,dy),lim=42,ux=m?dx/m:0,uy=m?dy/m:0,mm=Math.min(lim,m);knob.style.transform=`translate(${ux*mm}px,${uy*mm}px)`;let axis=input.moveAxis||'x';if(Math.abs(dx)>Math.abs(dy)*1.2)axis='x';else if(Math.abs(dy)>Math.abs(dx)*1.2)axis='y';const active=m>(previous?10:14);input.l=active&&axis==='x'&&dx<0;input.r=active&&axis==='x'&&dx>0;input.u=active&&axis==='y'&&dy<0;input.d=active&&axis==='y'&&dy>0;input.moveAxis=axis;if(m>28)mash();if(direction(input)!==previous)actionPacket()}joy.addEventListener('pointerdown',e=>{if(joyId!==null)return;heldDirections.clear();joyId=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joyMove(e)});function joyEnd(e){if(e.pointerId!==joyId)return;joyId=null;knob.style.transform='';input.l=input.r=input.u=input.d=false;actionPacket()}joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);joy.addEventListener('lostpointercapture',joyEnd);bombBtn.addEventListener('pointerdown',e=>{e.preventDefault();pressAction();});
const potionBtn=document.getElementById('potion'),potionCount=document.getElementById('potionCount');
potionBtn.addEventListener('pointerdown',e=>{e.preventDefault();pressPotion();});
document.getElementById('sound')?.addEventListener('click',()=>{arcade.muted=!arcade.muted;arcadeMusic(world);document.getElementById('sound').textContent=arcade.muted?'소리 꺼짐':'소리 켜짐';document.getElementById('sound').setAttribute('aria-pressed',String(!arcade.muted));});
document.getElementById('push').addEventListener('pointerdown',e=>{e.preventDefault();pressPush();});
function tileRect(x,y){return[ox+x*cell,oy+y*cell,cell,cell]}function ws(name,x,y,w,h,rot=0){if(!assetsReady)return false;const r=WORLD_META.sprites[name];if(!r)return false;ctx.save();ctx.translate(x+w/2,y+h/2);if(rot)ctx.rotate(rot);ctx.drawImage(worldImg,r[0],r[1],r[2],r[3],-w/2,-h/2,w,h);ctx.restore();return true}const characterCrops=new Map();function cleanCharacterRect(rect){const key=rect.join(',');if(characterCrops.has(key))return characterCrops.get(key);const c=document.createElement('canvas');c.width=rect[2];c.height=rect[3];const g=c.getContext('2d');g.drawImage(charImg,...rect,0,0,c.width,c.height);const data=g.getImageData(0,0,c.width,c.height).data;let x=c.width,y=c.height,right=0,bottom=0;for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)if(data[(j*c.width+i)*4+3]>150){x=Math.min(x,i);y=Math.min(y,j);right=Math.max(right,i);bottom=Math.max(bottom,j);}const r=right>=x?[rect[0]+x,rect[1]+y,right-x+1,bottom-y+1]:rect;characterCrops.set(key,r);return r;}
function cs(rect,x,y,w,h,flip=false){if(!assetsReady||!rect)return;rect=cleanCharacterRect(rect);ctx.save();ctx.translate(Math.round(x*DPR)/DPR,Math.round(y*DPR)/DPR);if(flip)ctx.scale(-1,1);const ratio=Math.min(w*1.12/rect[2],h/rect[3]);w=Math.round(rect[2]*ratio*DPR)/DPR;h=Math.round(rect[3]*ratio*DPR)/DPR;ctx.drawImage(charImg,rect[0],rect[1],rect[2],rect[3],-Math.round(w*DPR/2)/DPR,-h,w,h);ctx.restore()}
const CHAR_NAMES=['red','silver','gold','pink'];function charName(p){return CHAR_NAMES[(p.seat||0)%4]}function charFrame(p,now){const m=CHAR_META?.characters?.[charName(p)];if(!m)return null;if(world?.ended&&p.sid===world.winnerSid)return m.win;if(!p.alive)return m.dizzy;if(p.dizzyUntil>now)return m.dizzy;if(p.bubbled)return m.idle[p.face||'d'];if(p.broom){if(now-(p.broomStartAt||0)<450)return m.broom_mount;return p.placeUntil>now||p.pushUntil>now?m.broom_place[p.face||'d']:m.broom[p.face||'d']}if(p.broomDismountUntil>now)return m.broom_mount;if(p.pushUntil>now)return m.push[p.face||'d'];if(p.placeUntil>now)return m.place[p.face||'d'];if(p.moving){const a=m.walk[p.face||'d'];return a[p._walkFrame??0]}return m.idle[p.face||'d']}
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

const COLORS=['#f4b75e','#8acbaf','#baa1df','#ed9ca9'],LOW_SPEC=false;
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function hexRgb(h){const raw=String(h||'#000').trim();const m=raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);if(m)return[m[1],m[2],m[3]].map(Number);let x=raw.replace('#','');if(x.length===3)x=x.split('').map(c=>c+c).join('');const n=parseInt(x,16)||0;return[(n>>16)&255,(n>>8)&255,n&255]}
function mixColor(a,b,t){t=Math.max(0,Math.min(1,t));const A=hexRgb(a),B=hexRgb(b);return`rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`}
function shade(hex,m){const a=hexRgb(hex);return`rgb(${a.map(v=>Math.max(0,Math.min(255,Math.round(v*m)))).join(',')})`}
function blockColor(b,now){const neutral='#17284f',target=b.owner<0?neutral:COLORS[b.owner],from=b.paintFrom||((b.prevOwner==null||b.prevOwner<0)?neutral:COLORS[b.prevOwner]);if(!b.paintAt)return target;const age=now-b.paintAt;if(age<=120)return from;let t=(age-120)/700;t=Math.max(0,Math.min(1,t));t=t*t*(3-2*t);return mixColor(from,target,t)}
function paintProgress(b,now){if(!b.paintAt)return 1;return Math.max(0,Math.min(1,(now-b.paintAt-120)/700))}
function drawBlockStar(x,y,size,color,alpha){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;const s=Math.max(3,Math.round(size));ctx.fillRect(Math.round(x-s),Math.round(y-1),s*2+1,3);ctx.fillRect(Math.round(x-1),Math.round(y-s),3,s*2+1);ctx.globalAlpha*=.72;ctx.fillRect(Math.round(x-s*.58),Math.round(y-s*.58),2,2);ctx.fillRect(Math.round(x+s*.58-1),Math.round(y-s*.58),2,2);ctx.fillRect(Math.round(x-s*.58),Math.round(y+s*.58-1),2,2);ctx.fillRect(Math.round(x+s*.58-1),Math.round(y+s*.58-1),2,2);ctx.restore()}
function jellyBlockPath(w,h,r,j){
const top=Math.max(-h*.11,Math.min(h*.19,j*h*.38)),bulge=Math.max(-w*.035,Math.min(w*.075,j*w*.13));
const l=-w/2,rgt=w/2,t=-h/2,b=h/2,rr=Math.max(3,r);
ctx.beginPath();ctx.moveTo(l+rr+bulge,t+top);
ctx.quadraticCurveTo(0,t+top-Math.max(0,j)*h*.035,rgt-rr-bulge,t+top);
ctx.quadraticCurveTo(rgt+bulge,t+top,rgt+bulge,t+top+rr);
ctx.lineTo(rgt,b-rr);ctx.quadraticCurveTo(rgt,b,rgt-rr,b);
ctx.lineTo(l+rr,b);ctx.quadraticCurveTo(l,b,l,b-rr);
ctx.lineTo(l-bulge,t+top+rr);ctx.quadraticCurveTo(l-bulge,t+top,l+rr+bulge,t+top);ctx.closePath();
}
function drawBlock(b,cx,cy,now){if(!b.alive)return;const x=b.x-cx,y=b.y-cy,j=Math.max(-.18,Math.min(.46,b.jelly||0)),v=b.jellyV||0;const col=blockColor(b,now),prog=paintProgress(b,now),target=b.owner<0?'#17284f':COLORS[b.owner];const pad=.7,r=Math.max(5,b.w*.105);ctx.save();ctx.translate(x+b.w/2,y+b.h/2);ctx.shadowColor='rgba(1,5,20,.40)';ctx.shadowBlur=LOW_SPEC?0:3.4;ctx.shadowOffsetY=LOW_SPEC?1:2.5;if(LOW_SPEC){ctx.fillStyle=col}else{const grad=ctx.createLinearGradient(0,-b.h/2,0,b.h/2);grad.addColorStop(0,mixColor(col,'#ffffff',.28));grad.addColorStop(.18,mixColor(col,'#ffffff',.13));grad.addColorStop(.68,col);grad.addColorStop(1,shade(col,.55));ctx.fillStyle=grad}ctx.strokeStyle=shade(col,.50);ctx.lineWidth=1.35;jellyBlockPath(b.w-pad*2,b.h-pad*2,r,j);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
// Side-view depth: brighter upper face and a fixed darker bottom/right rim. The contact deformation stays at the top.
ctx.globalAlpha=.18;ctx.fillStyle=mixColor(col,'#ffffff',.38);const topShift=Math.max(-b.h*.08,Math.min(b.h*.14,j*b.h*.32));roundRect(-b.w*.37,-b.h*.35+topShift,b.w*.60,b.h*.14,r*.48);ctx.fill();
ctx.globalAlpha=.20;ctx.fillStyle=shade(target,.42);ctx.fillRect(-b.w*.40,b.h*.35,b.w*.80,Math.max(2,b.h*.045));ctx.fillRect(b.w*.35,-b.h*.22,Math.max(2,b.w*.045),b.h*.57);
// Ownership absorption has a subtle lower-to-upper colored body, giving the morph depth instead of a flat tint.
if(b.paintAt&&prog<1){const q=prog*prog*(3-2*prog);ctx.globalAlpha=.10+.17*q;ctx.fillStyle=target;const hh=b.h*.70*q;roundRect(-b.w*.39,b.h*.36-hh,b.w*.78,hh,r*.46);ctx.fill();ctx.globalAlpha=.10+.14*Math.sin(Math.PI*q);ctx.fillStyle='#ffffff';const sw=b.w*.12,xx=-b.w*.47+(b.w+sw)*q;roundRect(xx,-b.h*.38+topShift,sw,b.h*.70,sw*.48);ctx.fill();}
// Larger star glints scale with the enlarged 56px cell.
const showStar=!LOW_SPEC&&(b.owner<0||prog>.74);if(showStar){const seed=b.jellySeed||0,tw=.48+.40*Math.sin(now/520+seed*8);drawBlockStar(b.w*.17,-b.h*.12+topShift,b.w*.075,b.owner<0?'#e7f1ff':'#ffffff',(b.owner<0?.52:.24)*tw)}ctx.restore()}
function gardenBlock(k,x,y){drawBlock({alive:true,x:x+2,y:y+2,w:cell-4,h:cell-4,owner:hash(k)%4,jelly:0,jellySeed:hash(k)%100},0,0,performance.now());}

const hudIcons={},rosterEl=document.getElementById('roster'),playersPanel=document.getElementById('playersPanel'),rosterToggle=document.getElementById('rosterToggle');
let rosterStamp='',rosterAt=0;
rosterToggle.addEventListener('click',()=>{const open=playersPanel.classList.toggle('open');rosterToggle.setAttribute('aria-expanded',String(open));rosterToggle.textContent=open?'접기':'전체 보기';});
function hudIcon(img,r){const c=document.createElement('canvas');c.width=48;c.height=48;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(img,...r,0,0,48,48);return c.toDataURL();}
function buildHudIcons(){for(const n of ['slime_blue','item_speed','item_range','item_broom','item_plus'])hudIcons[n]=hudIcon(worldImg,WORLD_META.sprites[n]);for(const n of ['red','silver','gold','pink'])hudIcons[n]=hudIcon(charImg,CHAR_META.characters[n].idle.d);for(const [key,name]of Object.entries({slime_blue:'bomb',item_speed:'speed',item_range:'range',item_broom:'broom',item_plus:'bonus',potion:'potion'}))hudIcons[key]='assets/pixel-v21/'+name+'.webp';document.getElementById('placeIcon').src=hudIcons.slime_blue;document.querySelector('#potion img').src=hudIcons.potion;}
function updateRoster(){
 if(!assetsReady||!world||performance.now()-rosterAt<150)return;rosterAt=performance.now();
 const ps=Object.values(world.players).sort((a,b)=>a.seat-b.seat),stamp=JSON.stringify(ps.map(p=>[p.sid,p.nick,p.alive,p.bubbled,!!(p.dizzyUntil>gameNow()),p.potions,p.broom,p.maxBombs,p.range,p.speed,p.kos,p.shield]));if(stamp===rosterStamp)return;rosterStamp=stamp;rosterEl.replaceChildren();
 for(const p of ps){
  const row=document.createElement('div');row.className='playerRow'+(p.sid===bridge.sid?' self':'')+(!p.alive?' out':'');
  const face=document.createElement('img');face.className='portrait';face.src=hudIcons[charName(p)];face.alt='';row.append(face);
  const body=document.createElement('div');body.className='playerInfo';const name=document.createElement('div');name.className='playerName';name.textContent=(p.sid===bridge.sid?'나 · ':'')+p.nick;name.title=p.nick;body.append(name);
  const items=document.createElement('div');items.className='held';
  const values=[['slime_blue',p.maxBombs,'최대 설치'],['item_range',p.range,'물줄기 범위'],['item_speed',Math.max(1,Math.round((p.speed-2.7)/.35)),'속도 단계'],['potion',p.potions||0,'제거 포션']];if(p.broom)values.push(['item_broom','✓','빗자루 탑승']);if(p.shield)values.push(['shield','1','물방패 · 피격 1회 방어']);
  for(const [key,count,label]of values){const item=document.createElement('span');item.title=label+' '+count;item.setAttribute('aria-label',item.title);const icon=document.createElement('img');icon.src=key==='shield'?'assets/pixel-v21/shield.webp':hudIcons[key];icon.alt='';item.append(icon,document.createTextNode(String(count)));items.append(item);}body.append(items);
  const state=document.createElement('small');state.className='playerState';state.textContent=!p.alive?'탈락':p.bubbled?'갇힘':p.dizzyUntil>gameNow()?'탈락 위기':p.broom?'빗자루 탑승':'KO '+p.kos;body.append(state);row.append(body);rosterEl.append(row);
 }
}

function drawGarden(){
 ctx.fillStyle='#bce5bc';ctx.fillRect(0,0,CW,CH);
 const size=64;for(let y=0;y<CH;y+=size)for(let x=0;x<CW;x+=size)ws('grass',x,y,size+1,size+1);
 ctx.fillStyle='#e5f1bccc';ctx.fillRect(0,0,CW,CH);
 for(const [x,y,n]of [[ox-54,oy-22,'tree'],[ox+cell*W+4,oy+12,'flowers'],[ox-56,oy+cell*H-60,'fountain'],[ox+cell*W-38,oy+cell*H+10,'hedge']])ws(n,x,y,52,52);
 ctx.fillStyle='#50734d';ctx.fillRect(ox-5,oy-5,cell*W+10,cell*H+10);ctx.fillStyle='#f5db9c';ctx.fillRect(ox-3,oy-3,cell*W+6,cell*H+6);
}

function drawArenaBackground(){
 if(!assetsReady)return;
 const k=[CW,CH,DPR,ox,oy,cell].join('|');
 if(k!==gardenCacheKey){gardenCache=document.createElement('canvas');gardenCache.width=cvs.width;gardenCache.height=cvs.height;const saved=ctx;ctx=gardenCache.getContext('2d');ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=false;try{ctx.clearRect(0,0,CW,CH);drawGarden();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const[px,py]=tileRect(x,y);if(!ws(((x+y)&1)?'floor_stone':'floor_stone2',px,py,cell+1,cell+1)){ctx.fillStyle=((x+y)&1)?'#7f9b86':'#8ca691';ctx.fillRect(px,py,cell+1,cell+1)}ctx.fillStyle='#fff3d66a';ctx.fillRect(px,py,cell+1,cell+1);if(isWall(x,y)){ws((x===0||x===W-1||y===0||y===H-1)?(hash(x+','+y)%4===0?'flowers':'hedge'):'wall',px+1,py+1,cell-2,cell-2)}}}finally{ctx=saved;}gardenCacheKey=k;}
 ctx.drawImage(gardenCache,0,0,CW,CH);
}
// Local presentation only. Simulation, item ownership and blast tiles stay authoritative.
const arcade={breaks:[],itemBirths:new Map(),round:'',seen:new Set(),players:{},crates:new Set(),particles:[],labels:[],bombViews:new Map(),audio:null,muted:false,countdown:'',last:0,ready:false};
const sfxNames=["place","push","blast","break","pickup","trap","rescue","out","start","win","tick"];
function prepareSfx(){if(arcade.sfxPromise||!arcade.audio)return;arcade.sfx={};arcade.sfxPromise=Promise.all(sfxNames.map(async name=>{try{const r=await fetch('./assets/sfx/'+name+'.wav');if(!r.ok)throw Error('sfx '+r.status);arcade.sfx[name]=await arcade.audio.decodeAudioData(await r.arrayBuffer());}catch(e){console.warn('Sound fallback',name);}}));}
function playSfx(kind){const a=arcade.audio,b=arcade.sfx?.[kind];if(!b)return false;if(!arcade.sfxBus){const bus=a.createDynamicsCompressor();bus.threshold.value=-15;bus.knee.value=15;bus.ratio.value=5;bus.attack.value=.003;bus.release.value=.12;bus.connect(a.destination);arcade.sfxBus=bus;}const source=a.createBufferSource(),gain=a.createGain();source.buffer=b;gain.gain.value=kind==='blast'?.65:.75;source.connect(gain);gain.connect(arcade.sfxBus);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();return true;}
function arcadeSound(kind){
 const a=arcade.audio;if(!a||arcade.muted||document.hidden||a.state!=='running')return;
 arcade.audioLast=arcade.audioLast||{};const stamp=performance.now();if(stamp-(arcade.audioLast[kind]??-1000)<80)return;arcade.audioLast[kind]=stamp;if(playSfx(kind))return;
 const notes=({place:[420,190],push:[260,480],blast:[140,55],break:[210,100],pickup:[660,880,1320],trap:[380,240,150],rescue:[440,740,1100],out:[300,200,100],start:[440,660,880],win:[523,659,784,1046],tick:[740]})[kind]||[440];
 notes.forEach((hz,i)=>{const t=a.currentTime+i*.055,o=a.createOscillator(),g=a.createGain();o.type=['blast','break','push'].includes(kind)?'triangle':'sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(Math.max(35,hz*(kind==='push'?1.6:.6)),t+.13);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(kind==='blast'?.065:.04,t+.006);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+.19);});
 if(['blast','break','push'].includes(kind)){
  const duration=kind==='blast'?.24:.12,buffer=a.createBuffer(1,Math.ceil(a.sampleRate*duration),a.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
  const n=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();n.buffer=buffer;f.type='lowpass';f.frequency.value=kind==='blast'?1800:900;g.gain.value=kind==='blast'?.10:.045;n.connect(f);f.connect(g);g.connect(a.destination);n.start();
 }
}
function unlockArcadeAudio(){try{if(!arcade.audio){const A=window.AudioContext||window.webkitAudioContext;if(A)arcade.audio=new A();}arcade.audio?.resume().catch(()=>{});prepareSfx();if(!arcade.bgm){arcade.bgm=new Audio('./assets/funnymusic.mp3');arcade.bgm.loop=true;arcade.bgm.preload='auto';arcade.bgm.volume=.30;}arcade.unlocked=true;arcade.musicRetryAt=0;arcadeMusic(world);}catch(_){}}
function arcadeMusic(w){const m=arcade.bgm;if(!m)return;const active=arcade.unlocked&&!arcade.muted&&!document.hidden&&w&&!w.ended&&gameNow()>=w.startAt;
 if(!active){m.pause();return;}
 if(m.paused&&!arcade.musicPending&&performance.now()>=(arcade.musicRetryAt||0)){arcade.musicPending=true;m.play().catch(()=>{arcade.musicRetryAt=performance.now()+2000;}).finally(()=>{arcade.musicPending=false;});}
}
addEventListener('visibilitychange',()=>arcadeMusic(world));
addEventListener('pagehide',()=>{arcade.bgm?.pause();arcade.audio?.suspend().catch(()=>{});});
addEventListener('pointerdown',unlockArcadeAudio);addEventListener('keydown',unlockArcadeAudio);
function arcadeBurst(x,y,color,count=12){const R=rng(hash(x+'|'+y+'|'+gameNow()));for(let i=0;i<count;i++){const a=R()*Math.PI*2,s=.7+R()*2.4;arcade.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1.4,life:.4+R()*.35,max:.75,color,size:.035+R()*.05});}if(arcade.particles.length>180)arcade.particles.splice(0,arcade.particles.length-180);}
function arcadeBreak(k){
 arcadeSound('break');
 const [x,y]=k.split(',').map(Number),canvas=document.createElement('canvas');canvas.width=canvas.height=96;
 const saved=ctx;ctx=canvas.getContext('2d');ctx.scale(96/cell,96/cell);gardenBlock(k,0,0);ctx=saved;
 arcade.breaks.push({x,y,canvas,at:performance.now()});if(arcade.breaks.length>24)arcade.breaks.shift();
}
function drawArcadeBreaks(){
 const stamp=performance.now();arcade.breaks=arcade.breaks.filter(b=>stamp-b.at<520);
 for(const b of arcade.breaks){const t=(stamp-b.at)/520;ctx.save();ctx.globalAlpha=(1-t)*.3;ctx.fillStyle='#fff0cf';ctx.beginPath();ctx.ellipse(ox+(b.x+.5)*cell,oy+(b.y+.75)*cell,cell*(.3+t*.35),cell*(.1+t*.14),0,0,7);ctx.fill();ctx.restore();for(let row=0;row<2;row++)for(let col=0;col<2;col++){
  const dx=col?1:-1,dy=row?1:-1;ctx.save();ctx.globalAlpha=Math.min(1,(1-t)*2);
  ctx.translate(ox+(b.x+.25+col*.5+dx*t*.3)*cell,oy+(b.y+.25+row*.5-t*.48+t*t*.65)*cell);
  ctx.rotate(dx*(row?-.8:.7)*t);const size=cell*.5*(1-t*.25);ctx.drawImage(b.canvas,col*48,row*48,48,48,-size/2,-size/2,size,size);ctx.restore();
 }}
}
function arcadeLabel(p,text,color='#fff6a6'){arcade.labels.push({x:p.x,y:p.y-.65,text,color,until:performance.now()+950});if(arcade.labels.length>18)arcade.labels.shift();}
function observeArcade(w){
 arcadeMusic(w);
 const first=arcade.round!==w.roundId;if(first){arcade.round=w.roundId;arcade.outFlights=new Map();arcade.winAt=0;arcade.walks?.clear();if(arcade.bgm)arcade.bgm.currentTime=0;arcade.seen.clear();arcade.bombViews.clear();arcade.players={};arcade.crates=new Set(Object.keys(w.crates));arcade.particles=[];arcade.labels=[];arcade.breaks=[];arcade.itemBirths.clear();arcade.countdown='';}
 for(const id of arcade.bombViews.keys())if(!w.bombs.some(b=>b.id===id))arcade.bombViews.delete(id);
 for(const b of w.bombs){const id='bomb:'+b.id;if(!arcade.seen.has(id)){arcade.seen.add(id);if(!first){arcadeSound('place');arcadeBurst(b.x+.5,b.y+.5,'#b6f8ff',5);}}}
 for(const f of w.fx){if(arcade.seen.has(f.id))continue;arcade.seen.add(f.id);if(!first){arcadeSound('blast');const q=f.parts?.find(q=>q.k==='center');if(q)arcadeBurst(q.x+.5,q.y+.5,'#c6faff',16);for(const tip of f.parts||[])if(tip.k==='cap')arcadeBurst(tip.x+.5,tip.y+.5,'#d8fcff',4);}}
 for(const k of arcade.crates)if(!w.crates[k]){const [x,y]=k.split(',').map(Number);arcadeBreak(k);arcadeBurst(x+.5,y+.5,COLORS[hash(k)%4],9);}arcade.crates=new Set(Object.keys(w.crates));
 for(const k of arcade.itemBirths.keys())if(!w.items[k])arcade.itemBirths.delete(k);for(const k of Object.keys(w.items))if(!arcade.itemBirths.has(k))arcade.itemBirths.set(k,performance.now()-(first?500:0));
 for(const p of Object.values(w.players)){const old=arcade.players[p.sid];if(old){
  if(p.pushUntil>gameNow()&&p.pushUntil>(old.pushUntil||0))arcadeSound('push');
  if(p.bubbled&&!old.bubbled){arcadeSound('trap');arcadeBurst(p.x,p.y,'#87e7ff',10);}
  if(old.bubbled&&!p.bubbled&&p.alive&&!(p.dizzyUntil>gameNow())){arcadeSound('rescue');arcadeLabel(p,'탈출!', '#b0ffe6');arcadeBurst(p.x,p.y,'#a7ffe4',22);}
  if(old.alive&&!p.alive){arcade.outFlights.set(p.sid,{at:performance.now(),dir:p.seat%2?-1:1});arcadeBurst(p.x,p.y,'#e0ffff',28);arcadeSound('out');arcadeLabel(p,'OUT', '#ffe6df');arcadeBurst(p.x,p.y,'#d5f4ff',20);}
  if((p.pickupSerial||0)>(old.pickupSerial||0)){arcadeSound('pickup');arcadeLabel(p,p.pickupAtCap?({speed:'속도 최대!',range:'물줄기 최대!',bomb:'슬라임 최대!'})[p.pickupKind]:({speed:'속도 증가!',range:'물줄기 증가!',bomb:'슬라임 증가!',bonus:'모든 능력 증가!',broom:'빗자루 탑승!',potion:'제거 포션 획득!',shield:'보호막 획득!',maxpower:'물줄기 최대!'})[p.pickupKind]||'아이템 획득!');arcadeBurst(p.x,p.y,'#fff0a1',10);}
 }if(p.shieldBreakAt&&p.shieldBreakAt!==old?.shieldBreakAt){arcadeLabel(p,'방어 성공!','#9cf2ff');arcadeBurst(p.x,p.y,'#b5f5ff',18);}
 arcade.players[p.sid]={pickupSerial:p.pickupSerial,shieldBreakAt:p.shieldBreakAt,pushUntil:p.pushUntil,alive:p.alive,bubbled:p.bubbled,speed:p.speed,range:p.range,maxBombs:p.maxBombs,potions:p.potions,broom:p.broom};}
 const now=gameNow(),cue=w.ended?'win':now<w.startAt?String(Math.ceil((w.startAt-now)/1000)):now<w.startAt+650?'start':'';
 if(w.ended&&!arcade.winAt)arcade.winAt=performance.now();
 if(cue&&cue!==arcade.countdown){arcade.countdown=cue;arcadeSound(cue==='win'?'win':cue==='start'?'start':'tick');}
 if(arcade.seen.size>512)arcade.seen=new Set([...arcade.seen].slice(-256));
 const dt=Math.min(.05,(performance.now()-(arcade.last||performance.now()))/1000);arcade.last=performance.now();for(const q of arcade.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=5*dt;q.life-=dt;}arcade.particles=arcade.particles.filter(p=>p.life>0);arcade.labels=arcade.labels.filter(p=>p.until>performance.now());
}
function arcadePixel(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function townFloor(){
 ctx.save();ctx.beginPath();ctx.rect(viewX,viewY,viewW,viewH);ctx.clip();
 arcadePixel(viewX,viewY,viewW,viewH,'#bde9ef');for(let y=viewY-32;y<viewY+viewH+32;y+=32)for(let x=viewX-32;x<viewX+viewW+32;x+=32)if(((Math.floor(x/32)+Math.floor(y/32))&1)===0)arcadePixel(x,y,32,32,'#c9f0ec');
 arcadePixel(ox-10,oy-10,cell*W+20,cell*H+25,'#247798');arcadePixel(ox-6,oy-6,cell*W+12,cell*H+12,'#fff2c1');
 const fromX=Math.max(0,Math.floor((viewX-ox)/cell)-1),toX=Math.min(W-1,Math.ceil((viewX+viewW-ox)/cell)+1),fromY=Math.max(0,Math.floor((viewY-oy)/cell)-1),toY=Math.min(H-1,Math.ceil((viewY+viewH-oy)/cell)+1);
 for(let y=fromY;y<=toY;y++)for(let x=fromX;x<=toX;x++){const px=ox+x*cell,py=oy+y*cell;arcadePixel(px,py,cell+1,cell+1,(x+y)%2?'#eadbb7':'#f0e3c5');arcadePixel(px,py,cell,cell*.025,'#cfb981');arcadePixel(px,py,cell*.025,cell,'#d8c294');arcadePixel(px+cell*.06,py+cell*.06,cell*.88,cell*.035,'#fff2d7');}
 ctx.restore();
}

function townObstacle(x,y){const px=ox+x*cell,py=oy+y*cell,s=cell;
 if(townImg.naturalWidth){const edge=x===0||y===0||x===W-1||y===H-1,index=edge?((x+y)%3===0?5:4):(Math.min(x,W-1-x)===4&&Math.min(y,H-1-y)===2)?3:Math.floor(Math.min(y,H-1-y)/2)%3;
 const height=s*(edge?1:index===3?1.65:1.42),width=s*(edge?1.08:.96),foot=py+s;
 if(!edge){ctx.fillStyle='#315b7138';ctx.beginPath();ctx.ellipse(px+s*.5,foot-s*.10,s*.43,s*.13,0,0,Math.PI*2);ctx.fill();}
 const fw=townImg.naturalWidth/4,fh=townImg.naturalHeight/2;ctx.drawImage(townImg,(index%4)*fw,Math.floor(index/4)*fh,fw,fh,px+(s-width)/2,foot-height,width,height);return;}

 ctx.save();ctx.translate(px,py);ctx.scale(s/48,s/48);
 const edge=x===0||y===0||x===W-1||y===H-1;
 if(edge){arcadePixel(1,12,46,32,'#388e68');arcadePixel(2,5,44,32,'#65b85d');arcadePixel(5,3,38,9,'#91d46a');for(let n=0;n<4;n++){arcadePixel(5+n*10,15+(n%2)*6,6,5,'#8dd26c');}if((x+y)%3===0){arcadePixel(20,20,9,9,'#fff4b2');arcadePixel(23,17,3,15,'#ffad9a');arcadePixel(17,23,15,3,'#ffad9a');}}
 else if((x+2*y)%8===0){arcadePixel(20,29,9,17,'#9e6d43');arcadePixel(7,12,34,25,'#2f9273');arcadePixel(12,3,25,30,'#46ac76');arcadePixel(16,0,17,20,'#83ce78');arcadePixel(9,25,30,5,'#65be72');}
 else{const roof=['#ee8069','#66b9db','#edbf59'][(x/2+y/2)%3];arcadePixel(5,20,38,26,'#b39769');arcadePixel(7,17,34,26,'#fff0c6');arcadePixel(3,11,42,13,'#805965');arcadePixel(7,5,34,17,roof);arcadePixel(12,0,24,8,roof);arcadePixel(10,8,28,3,'#ffffff66');arcadePixel(18,29,12,17,'#578b99');arcadePixel(21,32,6,7,'#b9e9ed');arcadePixel(8,27,7,8,'#75b7c6');arcadePixel(33,27,7,8,'#75b7c6');arcadePixel(17,43,15,3,'#eee0b2');}
 ctx.restore();}
function slimeAtlasFrame(name,x,y,size,flip=false,rotation=0,alpha=.78){if(!slimeAtlasImg?.naturalWidth)return false;const map={b0:0,b1:1,b2:2,b3:3,y0:4,y1:5,y2:6,y3:7,p0:8,p1:9,p2:10,p3:11,bb0:12,bb1:13,bb2:14,yy0:15,yy1:16,yy2:17,pp0:18,pp1:19,pp2:20,pre0:21,pre1:22,boom0:23,boom1:24,boom2:25},idx=map[name];if(idx==null)return false;const cellA=slimeAtlasImg.naturalWidth/8,col=idx%8,row=Math.floor(idx/8),cellH=slimeAtlasImg.naturalHeight/4;ctx.save();ctx.translate(x,y);ctx.rotate(rotation);if(flip)ctx.scale(-1,1);ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=false;ctx.drawImage(slimeAtlasImg,col*cellA,row*cellH,cellA,cellH,-size/2,-size/2,size,size);ctx.restore();return true;}
function arcadeSlime(b,now){let v=arcade.bombViews.get(b.id);if(!v){v={x:b.x,y:b.y,at:now,tx:b.x,ty:b.y,pushAt:0,pushDx:0,pushDy:0};arcade.bombViews.set(b.id,v);}if(v.tx!==b.x||v.ty!==b.y){v.pushDx=b.x-v.tx;v.pushDy=b.y-v.ty;v.tx=b.x;v.ty=b.y;v.pushAt=now;}const step=Math.max(0,Math.min(.4,(now-v.at)/100));v.at=now;v.x+=clamp(b.x-v.x,-step,step);v.y+=clamp(b.y-v.y,-step,step);const x=ox+(v.x+.5)*cell,y=oy+(v.y+.5)*cell,age=Math.max(0,now-b.bornAt),life=clamp(age/FUSE,0,1),color=slimeColor(b,now),prefix=color==='blue'?'b':color==='yellow'?'y':'p',pushAge=now-(v.pushAt||0),size=cell*1.10;
 ctx.save();ctx.fillStyle='#236e6530';ctx.beginPath();ctx.ellipse(x,y+cell*.28,cell*.31,cell*.085,0,0,7);ctx.fill();ctx.restore();
 let drawn=false;if(pushAge>=0&&pushAge<300&&(v.pushDx||v.pushDy)){const f=Math.min(2,Math.floor(pushAge/100)),name=(color==='blue'?'bb':color==='yellow'?'yy':'pp')+f,vertical=Math.abs(v.pushDy)>Math.abs(v.pushDx),flip=!vertical&&v.pushDx<0,rotation=vertical?(v.pushDy<0?-Math.PI/2:Math.PI/2):0;drawn=slimeAtlasFrame(name,x,y,size*1.08,flip,rotation,.76);}else if(life>.93){const f=Math.floor(now/95)%2;drawn=slimeAtlasFrame(f?'pre1':'pre0',x,y,size*1.11,false,0,.76);}else{const f=Math.floor(now/125+b.id.length)%4;drawn=slimeAtlasFrame(prefix+f,x,y,size,false,0,.74+.05*Math.sin(now/150));}
 if(!drawn){const pulse=Math.sin(age/(life>.8?45:105)),entry=clamp(age/180,0,1),spring=Math.sin(entry*Math.PI*3)*Math.exp(-entry*3)*(1-entry),sx=(1+.08*pulse)*(1+.28*(1-entry)+spring*.2),sy=(1-.075*pulse)*(.72+.28*entry-spring*.17),fallback=({blue:'#46cef0',yellow:'#f2d15b',pink:'#f487b7'})[color];ctx.save();ctx.translate(x,y);ctx.globalAlpha=.75;ctx.scale(sx,sy);ctx.fillStyle=fallback;ctx.beginPath();ctx.ellipse(0,-cell*.035,cell*.33,cell*.31,0,0,7);ctx.fill();ctx.restore();}
 if(life>.72){ctx.strokeStyle=life>.9?'#fff3b7':'#d9ffff';ctx.globalAlpha=.8;ctx.lineWidth=Math.max(1,cell*.035);ctx.beginPath();ctx.arc(x,y,cell*.41,-Math.PI/2,-Math.PI/2+life*Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
}
function drawSlimeBurstSprite(f,q,age){if(q.k!=='center'||!slimeAtlasImg?.naturalWidth)return;const phase=Math.min(2,Math.floor(age/100)),name=['boom0','boom1','boom2'][phase],x=ox+(q.x+.5)*cell,y=oy+(q.y+.5)*cell,alpha=Math.max(0,.88-age/430);slimeAtlasFrame(name,x,y,cell*1.55,false,0,alpha);}
function arcadeBlast(f,q){const px=ox+q.x*cell,py=oy+q.y*cell,now=gameNow(),age=560-(f.until-now),fade=clamp((f.until-now)/130,0,1),grow=(.76+.24*Math.min(1,age/65))*(1-.16*Math.max(0,(age-370)/190)),color=({blue:'#36c9f5',yellow:'#ffd85a',pink:'#ff7fbd'})[f.color]||'#39c9ef';drawSlimeBurstSprite(f,q,age);ctx.save();ctx.beginPath();ctx.rect(px,py,cell,cell);ctx.clip();ctx.globalAlpha=fade;ctx.translate(px+cell/2,py+cell/2);
 const horizontal=q.k==='h'||q.k==='center'||q.k==='cap'&&q.dx,vertical=q.k==='v'||q.k==='center'||q.k==='cap'&&q.dy;
 for(const [width,col]of [[.86,'#218baa'],[.75,color],[.39,'#b9f6ff'],[.09,'#f1ffff']]){ctx.fillStyle=col;const h=cell*width*grow;if(horizontal){ctx.beginPath();ctx.roundRect(-cell*.52,-h/2,cell*1.04,h,h*.32);ctx.fill();}if(vertical){ctx.beginPath();ctx.roundRect(-h/2,-cell*.52,h,cell*1.04,h*.32);ctx.fill();}}
 ctx.strokeStyle='#efffff';ctx.lineWidth=Math.max(1,cell*.035);for(const side of [-1,1]){ctx.beginPath();for(let n=0;n<=12;n++){const a=(n/12-.5)*cell,v=(side*.27+Math.sin(n*.95+age/42+(q.x+q.y)*2)*.045)*cell;if(horizontal){if(n===0)ctx.moveTo(a,v);else ctx.lineTo(a,v);}else{if(n===0)ctx.moveTo(v,a);else ctx.lineTo(v,a);}}ctx.stroke();}
 ctx.fillStyle='#edffff';for(let n=0;n<3;n++){const a=((age/90+n*.37)%1-.5)*cell;if(horizontal)ctx.fillRect(a,-cell*.26,cell*.13,cell*.06);if(vertical)ctx.fillRect(cell*.2,a,cell*.06,cell*.13);}
 ctx.strokeStyle='#edffff';ctx.lineWidth=Math.max(1,cell*.025);for(let i=0;i<4;i++){const along=((age/170+i*.27)%1-.5)*cell,across=Math.sin(i*2.4+age/65)*cell*.23;ctx.beginPath();ctx.arc(horizontal?along:across,horizontal?across:along,cell*(.025+(i%2)*.015),0,7);ctx.stroke();}
 if(q.k==='cap'){ctx.strokeStyle='#ffffff';ctx.lineWidth=cell*.05;ctx.beginPath();const angle=Math.atan2(q.dy,q.dx);ctx.arc(q.dx*cell*.14,q.dy*cell*.14,cell*.32,angle-Math.PI/2,angle+Math.PI/2);ctx.stroke();}
 if(q.k==='center'){ctx.strokeStyle='#e7ffff';ctx.lineWidth=cell*.045;ctx.beginPath();ctx.arc(0,0,cell*(.18+.23*Math.min(1,age/150)),0,7);ctx.stroke();ctx.fillStyle='#f2ffff';ctx.beginPath();ctx.arc(0,0,cell*.28*grow,0,7);ctx.fill();}ctx.restore();}
function arcadeItem(k,it,now){const [tx,ty]=k.split(',').map(Number),x=ox+(tx+.5)*cell,y=oy+(ty+.5)*cell,birth=clamp((performance.now()-(arcade.itemBirths.get(k)??performance.now()))/380,0,1),bob=Math.sin(now/190+hash(k)%8)*cell*.025-Math.sin(birth*Math.PI)*cell*.3;ctx.fillStyle='#30597535';ctx.beginPath();ctx.ellipse(x,y+cell*.29,cell*.29,cell*.08,0,0,7);ctx.fill();
 const size=cell*.96;if(extraItems[it]?.complete&&extraItems[it].naturalWidth)ctx.drawImage(extraItems[it],x-size/2,y-size/2+bob,size,size);else if(it==='potion')ctx.drawImage(potionImg,x-size/2,y-size/2+bob,size,size);else ws(it==='speed'?'item_speed':it==='range'||it==='maxpower'?'item_range':it==='broom'?'item_broom':'item_plus',x-size/2,y-size/2+bob,size,size);
}
function drawShieldAura(x,y,now){if(!shieldFxImg?.naturalWidth)return false;const frames=6,fw=Math.floor(shieldFxImg.naturalWidth/frames),fh=shieldFxImg.naturalHeight,frame=Math.floor(now/110)%frames,w=cell*1.42,h=cell*1.78;ctx.save();ctx.globalAlpha=.43+.08*Math.sin(now/150);ctx.drawImage(shieldFxImg,frame*fw,0,fw,fh,x-w/2,y-h*.88,w,h);ctx.globalAlpha=.18+.07*Math.sin(now/260);ctx.strokeStyle='#a9ecff';ctx.lineWidth=Math.max(1,cell*.03);ctx.beginPath();ctx.ellipse(x,y-cell*.18,cell*.40,cell*.54,0,0,7);ctx.stroke();ctx.restore();return true;}
function drawKnockout(p,x,y){const flight=arcade.outFlights?.get(p.sid),elapsed=flight?performance.now()-flight.at:1500,dir=flight?.dir||1,progress=clamp(elapsed/650,0,1),col=elapsed<650?0:elapsed<950?1:2+Math.floor(elapsed/700)%2,dx=dir*cell*.55*progress,lift=elapsed<650?Math.sin(progress*Math.PI)*cell*1.15:0,size=cell*(col<2?1.5:1.65);
 if(knockoutImg.naturalWidth){const fw=knockoutImg.naturalWidth/4,fh=knockoutImg.naturalHeight/4;ctx.drawImage(knockoutImg,col*fw,(p.seat%4)*fh,fw,fh,x+dx-size/2,y+cell*.3-lift-size,size,size);if(elapsed>650&&elapsed<1000){ctx.strokeStyle='#d4f9ff';ctx.lineWidth=cell*.05;ctx.beginPath();ctx.ellipse(x+dx,y+cell*.23,cell*(.25+(elapsed-650)/800),cell*.12,0,0,7);ctx.stroke();}}else cs(charFrame(p,gameNow()),x,y+cell*.3,cell,cell*1.4);
}
// Each new locomotion cell uses one fixed scale and foot anchor. Never stretch
// individual frames to their own bounding box (that makes the body pulse).
function locomotionCell(p){const flip=charName(p)==='silver'&&p.face==='l',row=flip?3:(({d:0,u:1,l:2,r:3})[p.face||'d']??0);return {row,flip,col:p.moving?1+(p._walkFrame||0)%4:0};}
function drawLocomotion(p,x,y){const img=walkImages[charName(p)];if(!img?.naturalWidth)return false;const {row,col,flip}=locomotionCell(p),size=cell*1.65,fw=img.naturalWidth/5,fh=img.naturalHeight/4;ctx.save();ctx.translate(Math.round(x*DPR)/DPR,Math.round(y*DPR)/DPR);if(flip)ctx.scale(-1,1);ctx.drawImage(img,col*fw,row*fh,fw,fh,-size/2,-size+size*4/96,size,size);ctx.restore();return true;}
function arcadePlayer(p,now){arcade.walks??=new Map();const previous=arcade.walks.get(p.sid),distance=previous?Math.hypot(p.x-previous.x,p.y-previous.y):0;
 const canWalk=p.alive&&!p.bubbled&&!(p.dizzyUntil>now)&&!p.broom;
 const moved=canWalk&&distance>.001&&distance<.4,travel=(previous?.travel||0)+(moved?distance:0),lastMotionAt=moved?now:previous?.lastMotionAt||0;
 arcade.walks.set(p.sid,{x:p.x,y:p.y,travel,lastMotionAt});
 p={...p,moving:canWalk&&(p.moving||(p.sid!==bridge.sid&&now-lastMotionAt<70)),_walkFrame:Math.floor(travel/.34)%4};const x=ox+p.x*cell,y=oy+p.y*cell;ctx.save();if(!p.alive){drawKnockout(p,x,y);ctx.restore();return;}
 const fly=p.broom,bob=p.bubbled?Math.sin(now/95)*cell*.055:0;ctx.fillStyle='#23625e44';ctx.beginPath();ctx.ellipse(x,y+cell*.24,cell*.24,cell*.085,0,0,7);ctx.fill();
 if(p.sid===bridge.sid){ctx.strokeStyle='#fff4a8';ctx.lineWidth=cell*.04;ctx.beginPath();ctx.ellipse(x,y+cell*.22,cell*.28,cell*.11,0,0,7);ctx.stroke();}
 const broomPose=fly||p.broomDismountUntil>now||now-(p.broomStartAt||0)<450;
 const actionPose=!broomPose&&(p.placeUntil>now||p.pushUntil>now);
 const normal=!fly&&!(p.dizzyUntil>now)&&!(p.broomDismountUntil>now)&&!(p.pushUntil>now)&&!(p.placeUntil>now)&&!(world?.ended&&p.sid===world.winnerSid);
 if(!normal||!drawLocomotion(p,x,y+cell*.30+bob)){
  if(actionPose){const actionH=({red:1.43,silver:1.44,gold:1.44,pink:1.31})[charName(p)]||1.43;cs(charFrame(p,now),x,y+cell*.37+bob,cell*1.62,cell*actionH);}
  else cs(charFrame(p,now),x,y+cell*.30+bob-(broomPose?cell*.18:0),cell*(broomPose?1.42:1.15),cell*(broomPose?1.88:1.52));
 }
 if(p.shield&&!drawShieldAura(x,y,now)){ctx.strokeStyle='#a9ecff';ctx.lineWidth=cell*.038;ctx.beginPath();ctx.ellipse(x,y-cell*.2,cell*.47,cell*.57,0,0,7);ctx.stroke();}
 if(p.bubbled){ctx.font=`900 ${Math.max(10,cell*.20)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.strokeStyle='#207db0';ctx.lineWidth=3;ctx.strokeText('어푸! 어푸!',x,y-cell*.95);ctx.fillText('어푸! 어푸!',x,y-cell*.95);for(let i=0;i<3;i++){const lift=(now/650+i*.33)%1;ctx.strokeStyle='#d7fbff';ctx.lineWidth=cell*.025;ctx.beginPath();ctx.arc(x+Math.sin(i*2+now/250)*cell*.33,y-cell*(.1+lift*.65),cell*(.025+i*.012),0,7);ctx.stroke();}const left=clamp((p.bubbleUntil-now)/STUCK_MS,0,1),r=cell*(.56+.025*Math.sin(now/95));ctx.fillStyle='#71dffa55';ctx.strokeStyle=left<.3?'#ffa4c1':'#a8efff';ctx.lineWidth=cell*.055;ctx.beginPath();ctx.arc(x,y-cell*.09,r,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#f4ffff';ctx.lineWidth=cell*.07;ctx.beginPath();ctx.arc(x,y-cell*.09,r*.8,Math.PI*1.05,Math.PI*1.45);ctx.stroke();arcadePixel(x-cell*.36,y+cell*.5,cell*.72,cell*.085,'#245970');arcadePixel(x-cell*.34,y+cell*.52,cell*.68*left,cell*.04,left<.3?'#ff9caa':'#a6f8fa');}
 if(p.dizzyUntil>now){for(let n=0;n<3;n++){const a=now/150+n*Math.PI*2/3;drawBlockStar(x+Math.cos(a)*cell*.3,y-cell*.48+Math.sin(a)*cell*.08,cell*.055,'#fff2a7',1);}}
 if(p.rescueUntil>now){ctx.strokeStyle='#d9fff3';ctx.lineWidth=cell*.07;ctx.beginPath();ctx.arc(x,y,cell*(.4+.5*(1-(p.rescueUntil-now)/650)),0,7);ctx.stroke();}
 ctx.restore();ctx.font=`800 ${Math.max(9,cell*.17)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=3;ctx.strokeStyle='#285c69';ctx.strokeText(p.nick,x,p.bubbled?y+cell*.82:y-cell*1.14);ctx.fillStyle=p.sid===bridge.sid?'#fff4a8':'#fff';ctx.fillText(p.nick,x,p.bubbled?y+cell*.82:y-cell*1.14);
}
function renderPlayerPose(p){const local=p.sid===bridge.sid,target=!bridge.isHost&&local&&motion.pose?{...p,x:motion.pose.x,y:motion.pose.y,face:motion.pose.face,moving:motion.pose.moving}:p;
 if(local){const prev=previousLocal;if(prev&&target.moving&&target.alive&&!target.bubbled&&target.dizzyUntil<=gameNow()&&Math.hypot(prev.x-target.x,prev.y-target.y)<.3){const a=clamp(acc/(TICK/1000),0,1);return {...target,x:prev.x+(target.x-prev.x)*a,y:prev.y+(target.y-prev.y)*a};}return target;}
 const stamp=performance.now(),old=renderedPlayers.get(p.sid),snap=!old||old.round!==world.roundId||!p.alive||p.bubbled||p.dizzyUntil>gameNow()||Math.hypot(p.x-old.x,p.y-old.y)>1.5;
 const a=snap?1:1-Math.exp(-Math.min(100,stamp-old.at)/48),view={...p,x:snap?p.x:old.x+(p.x-old.x)*a,y:snap?p.y:old.y+(p.y-old.y)*a};renderedPlayers.set(p.sid,{x:view.x,y:view.y,at:stamp,round:world.roundId});return view;
}
function drawArcadeScene(w){const now=gameNow();observeArcade(w);updateCamera(w);townFloor();ctx.save();ctx.beginPath();ctx.rect(viewX,viewY,viewW,viewH);ctx.clip();for(const f of w.fx||[])for(const q of f.parts||[])arcadeBlast(f,q);
 const objects=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(isWall(x,y))objects.push({depth:y+.85,draw:()=>townObstacle(x,y)});
 for(const k of Object.keys(w.crates)){const [x,y]=k.split(',').map(Number);objects.push({depth:y+.9,draw:()=>{const [px,py]=tileRect(x,y);gardenBlock(k,px,py);}});}
 for(const [k,it]of Object.entries(w.items))objects.push({depth:Number(k.split(',')[1])+.6,draw:()=>arcadeItem(k,it,now)});
 for(const b of w.bombs)objects.push({depth:b.y+.8,draw:()=>arcadeSlime(b,now)});
 for(const p of Object.values(w.players)){const view=renderPlayerPose(p);objects.push({depth:view.y+.28+(p.broom?1:0),draw:()=>arcadePlayer(view,now)});}
 objects.sort((a,b)=>a.depth-b.depth);for(const q of objects)q.draw();
 drawArcadeBreaks();
 for(const p of arcade.particles){ctx.globalAlpha=clamp(p.life/.2,0,1);arcadePixel(ox+p.x*cell,oy+p.y*cell,cell*p.size,cell*p.size,p.color);}ctx.globalAlpha=1;
 if(w.ended){const elapsed=(performance.now()-(arcade.winAt||performance.now()))/1000;for(let i=0;i<55;i++){const x=ox+((i*.618%1)*W)*cell,y=oy+((elapsed*(1+i%3*.23)+i*.31)%(H+1))*cell;ctx.save();ctx.translate(x,y);ctx.rotate(elapsed+i);ctx.fillStyle=['#ffda64','#80eaff','#ff99ba','#ffffff'][i%4];ctx.fillRect(-3,-5,6,10);ctx.restore();}}
 for(const p of arcade.labels){const age=1-(p.until-performance.now())/950;ctx.globalAlpha=clamp((p.until-performance.now())/200,0,1);ctx.textAlign='center';ctx.font=`900 ${Math.max(11,cell*.23)}px system-ui`;ctx.lineWidth=3;ctx.strokeStyle='#276679';const y=oy+(p.y-age*.4)*cell;ctx.strokeText(p.text,ox+p.x*cell,y);ctx.fillStyle=p.color;ctx.fillText(p.text,ox+p.x*cell,y);}ctx.globalAlpha=1;
 if(now>=w.startAt&&now<w.startAt+650&&!w.ended){ctx.textAlign='center';ctx.font=`1000 ${Math.min(68,cell*1.5)}px system-ui`;ctx.strokeStyle='#226e8a';ctx.lineWidth=8;const sx=viewX+viewW/2,sy=viewY+viewH*.48;ctx.strokeText('START!',sx,sy);ctx.fillStyle='#fff4a6';ctx.fillText('START!',sx,sy);}
 ctx.restore();
}

function draw(){ctx.clearRect(0,0,CW,CH);const w=world;if(!w)return;drawArcadeScene(w);updateRoster();const me=w.players?.[bridge.sid];if(me){potionCount.textContent=String(me.potions||0);potionBtn.disabled=!canUsePotion(me);potionBtn.classList.toggle('ready',canUsePotion(me));potionBtn.setAttribute('aria-label','제거 포션 '+(me.potions||0)+'개 · C키 또는 터치로 사용');statsEl.textContent=`🫧${me.maxBombs} · 📏${me.range} · 👟${Math.max(1,Math.round((me.speed-2.7)/.35))}${me.broom?' · 🧹':''}`;statusEl.textContent=me.alive?(me.bubbled?(me.potions>0?'갇힘! C / 포션 버튼으로 탈출':'슬라임! 이동키 / 🫧 버튼 연타로 탈출!'):me.dizzyUntil>gameNow()?(me.potions>0?'탈락 직전! C / 포션으로 구조':'빙글빙글… 기절!'):`KO ${me.kos} · ${bridge.isHost?'HOST':'PLAYER'}`):'탈락 · 결과를 기다리는 중'}const now=gameNow(),sec=Math.ceil(Math.min(ROUND_MS,Math.max(0,w.endAt-now))/1000);timerEl.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;if(w.ended){const win=w.players?.[w.winnerSid];center.classList.remove('hidden');big.textContent=win?.sid===bridge.sid?'VICTORY! 🏆':`${win?.nick||'플레이어'} 승리!`;small.textContent=`${win?.nick||'우승자'} · KO ${win?.kos||0} · 잠시 후 방으로 돌아갑니다.`;const portrait=document.getElementById('winnerPortrait');if(portrait){portrait.src=hudIcons[charName(win||{seat:0})];portrait.hidden=false;}document.getElementById('center').classList.add('victory')}else if(now<w.startAt){center.classList.remove('hidden');big.textContent=String(Math.max(1,Math.ceil((w.startAt-now)/1000)));small.textContent='슬라임을 설치하고 물줄기를 피해 마지막까지 살아남으세요!'}else center.classList.add('hidden')}
function loop(t){
 const d=Math.min(.05,(t-lastFrame)/1000);lastFrame=t;acc+=d;
 if(bridge.isHost){
  if(!world&&bridge.ready&&assetsReady&&roster().length>=bridge.expectedHumans)world=makeWorld();
  while(acc>=TICK/1000){previousLocal=world?.players?.[bridge.sid]?{...world.players[bridge.sid]}:null;simulate(TICK/1000,Object.assign({},guestInputs,{[bridge.sid]:input}),gameNow());acc-=TICK/1000;}
  if(world?.ended&&!finishSent){finishSent=true;post('wb_over',{winnerSeat:world.winnerSeat});}
 }else {while(acc>=TICK/1000){previousLocal=motion.pose?{...motion.pose}:null;predictMotion();acc-=TICK/1000;}}
 sendState(t);draw();requestAnimationFrame(loop);
}requestAnimationFrame(loop);
})();
