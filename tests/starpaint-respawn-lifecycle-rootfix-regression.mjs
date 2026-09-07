import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(src.includes('p.localRespawnPendingUntil=Number.MAX_SAFE_INTEGER'),'guest respawn prediction still expires by timer');
ok(src.includes('pendingRespawn=localMe&&pendingRespawnSeq!==0&&respawnAck!==pendingRespawnSeq'),'pending respawn is not ack-driven');
ok(src.includes('if(pendingRespawnSeq!==0&&respawnAck===pendingRespawnSeq){p.localRespawnPendingUntil=0;p.localRespawnPendingSeq=0}'),'matching ack does not clear pending respawn');
ok(src.includes('respawnSurfaceId:p.respawnSurfaceId||null'),'authoritative respawn surface is not serialized');
ok(src.includes('if(predictedRespawnAck){const prevY='),'matching ack does not reconcile prediction without replaying full drop');

const s=src.indexOf('function mergeRemotePlayers(incoming)');
const e=src.indexOf('function applyPlayerSnapshots(players)',s);
ok(s>=0&&e>s,'mergeRemotePlayers not found');
const mergeSrc=src.slice(s,e);
let now=Date.now();
const p={sid:'guest',nick:'G',seat:1,w:40,h:62,deadUntil:0,stun:0,slow:0,iceSlideUntil:0,knockUntil:0,itemsHeld:[],itemSlot:0,localRespawnPendingSeq:7,localRespawnPendingUntil:Number.MAX_SAFE_INTEGER,localUsePendingSeq:0,localSwapPredictionUntil:0,lastCorrectionSeq:0,actionUntil:0,jumpPackUntil:0,jumpPackJumpsLeft:0,airJumpCount:0,x:500,y:500,renderX:500,renderY:500,vy:5,respawnSurfaceId:'guest-surface'};
const blocks=[{id:'host-surface',alive:true,y:700}];
const context={game:{players:{guest:p},predictedProjectiles:[],blocks},bridge:{sid:'guest',isHost:false},input:{respawnSeq:7,swapSeq:0},ensurePlayers(){},Date,Number,Math,performance:{now:()=>0},remoteHistory:{},hostTimeToLocal:(v)=>Number(v)||0,normalizeInventory:(q)=>Array.isArray(q.itemsHeld)?q.itemsHeld:[],console};
vm.createContext(context);vm.runInContext(mergeSrc,context);
// Even after an arbitrarily late stale death snapshot, the guest must stay alive until matching ack.
context.mergeRemotePlayers({guest:{nick:'G',seat:1,w:40,h:62,deadUntil:now+25000,respawnAck:0,itemsHeld:[],itemSlot:0,correctionSeq:0,stun:now+5000,knockUntil:now+5000}});
ok(p.deadUntil===0,'stale deadUntil re-killed guest before respawn ack');
ok(p.stun===0&&p.knockUntil===0,'stale death combat state leaked into pending respawn');
ok(p.localRespawnPendingSeq===7,'stale ack cleared pending respawn');
// Matching ack may choose another safe block. Reconcile x to host, but never reset y back upward to replay the fall.
context.mergeRemotePlayers({guest:{nick:'G',seat:1,w:40,h:62,deadUntil:0,respawnAck:7,respawnSurfaceId:'host-surface',itemsHeld:[],itemSlot:0,correctionSeq:1,correction:{x:900,y:300,vx:0,vy:1.2,onGround:false,face:1}}});
ok(p.deadUntil===0,'matching respawn ack did not keep player alive');
ok(p.localRespawnPendingSeq===0,'matching respawn ack did not clear pending state');
ok(p.x===900,'matching respawn ack did not adopt authoritative safe x');
ok(p.y>=500,'matching respawn ack replayed the fall from the top');
ok(p.y<=700-62/2-2,'respawn reconciliation placed player below authoritative surface');

// Host must consume one respawn sequence exactly once, even when the same movement snapshot repeats.
const a=src.indexOf('function applyPlayerSnapshots(players)');
const b=src.indexOf('function playerRenderX',a);
ok(a>=0&&b>a,'applyPlayerSnapshots not found');
const applySrc=src.slice(a,b);
const hp={sid:'guest',deadUntil:now+30000,lastRespawnSeq:0,lastRemoteMoveSeq:77,input:{}};
let respawns=0;
const hctx={game:{players:{guest:hp}},bridge:{isHost:true,sid:'host'},ensurePlayers(){},respawn(q){respawns++;q.deadUntil=0;q.x=560;q.y=400;},Date,Number,Math,remoteHistory:{},recordRemoteSnapshot(){},performance:{now:()=>0},console,seq32Newer(next,prev){next=Number(next)>>>0;prev=Number(prev)>>>0;const d=(next-prev)>>>0;return d!==0&&d<0x80000000}};
vm.createContext(hctx);vm.runInContext(applySrc,hctx);
hctx.applyPlayerSnapshots({guest:{seq:77,respawnSeq:9,x:-999,y:-999,vx:0,vy:0}});
hp.deadUntil=now+30000; // emulate a stale/dead packet arriving after the same request was already consumed
hctx.applyPlayerSnapshots({guest:{seq:78,respawnSeq:9,x:-999,y:-999,vx:0,vy:0}});
ok(respawns===1,'same respawnSeq caused duplicate host respawn');
ok(hp.lastRespawnSeq===9,'host respawn ack sequence not retained');
console.log('STARPAINT_RESPAWN_LIFECYCLE_ROOTFIX_OK');
