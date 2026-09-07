import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

// Root rule: a correction from the previous dead life cannot cross a pending respawn boundary.
ok(src.includes('if(corr&&!pendingRespawn&&newCorr>oldCorr)'), 'stale death correction is still allowed during pending respawn');
ok(src.includes('pendingRespawn=localMe&&pendingRespawnSeq!==0&&respawnAck!==pendingRespawnSeq'), 'respawn lifecycle is not ACK-bound');
ok(src.includes('correctionAck:Number(p.lastCorrectionSeq)||0'), 'guest does not acknowledge accepted authoritative correction');

const ms=src.indexOf('function mergeRemotePlayers(incoming)');
const me=src.indexOf('function applyPlayerSnapshots(players)',ms);
ok(ms>=0&&me>ms,'mergeRemotePlayers missing');
const mergeSrc=src.slice(ms,me);
const now=Date.now();
const p={sid:'guest',nick:'G',seat:1,w:40,h:62,deadUntil:0,stun:0,slow:0,iceSlideUntil:0,iceSlideDir:0,knockUntil:0,knockDir:0,knockSpeed:0,itemsHeld:[],itemSlot:0,localRespawnPendingSeq:7,localRespawnPendingUntil:Number.MAX_SAFE_INTEGER,localUsePendingSeq:0,localSwapPredictionUntil:0,lastCorrectionSeq:0,actionUntil:0,jumpPackUntil:0,jumpPackJumpsLeft:0,airJumpCount:0,x:500,y:500,vx:0,vy:5,onGround:false,renderX:500,renderY:500,respawnSurfaceId:'guest-surface'};
const blocks=[{id:'host-surface',alive:true,x:850,y:700,w:100,h:40}];
const ctx={game:{players:{guest:p},predictedProjectiles:[],blocks},bridge:{sid:'guest',isHost:false},input:{respawnSeq:7,swapSeq:0},ensurePlayers(){},Date,Number,Math,performance:{now:()=>0},remoteHistory:{},hostTimeToLocal:(v)=>Number(v)||0,normalizeInventory:(q)=>Array.isArray(q.itemsHeld)?q.itemsHeld:[],console};
vm.createContext(ctx); vm.runInContext(mergeSrc,ctx);
// Delayed kill correction arrives after local quiz respawn began. It must be quarantined completely.
ctx.mergeRemotePlayers({guest:{nick:'G',seat:1,w:40,h:62,deadUntil:now+25000,respawnAck:0,itemsHeld:[],itemSlot:0,correctionSeq:5,correction:{x:-999,y:-999,vx:0,vy:0,onGround:false,face:1},stun:now+5000,knockUntil:now+5000}});
ok(p.deadUntil===0,'stale death state re-killed pending respawn');
ok(p.x===500&&p.y===500,'stale death correction moved pending respawn back to death coordinates');
ok(p.lastCorrectionSeq===0,'ignored death correction incorrectly advanced correction ack');
ok(p.localRespawnPendingSeq===7,'stale death snapshot cleared pending respawn');
// Matching authoritative respawn correction is the first correction allowed across the boundary.
ctx.mergeRemotePlayers({guest:{nick:'G',seat:1,w:40,h:62,deadUntil:0,respawnAck:7,respawnSurfaceId:'host-surface',itemsHeld:[],itemSlot:0,correctionSeq:6,correction:{x:900,y:300,vx:0,vy:1.2,onGround:false,face:1}}});
ok(p.localRespawnPendingSeq===0,'matching respawn ack did not close pending lifecycle');
ok(p.lastCorrectionSeq===6,'matching respawn correction was not acknowledged');
ok(p.x===900,'authoritative respawn surface x was not adopted');
ok(p.x!==-999&&p.y!==-999,'player returned to death coordinates after respawn ack');

// After the correction ACK, host movement snapshots must be accepted again and ground paint resumes.
const as=src.indexOf('function applyPlayerSnapshots(players)');
const ae=src.indexOf('function playerRenderX',as);
const applySrc=src.slice(as,ae);
const hs=src.indexOf('function applyRemoteMovementOnHost(');
const he=src.indexOf('function normalizeInventory',hs);
const remoteMoveSrc=src.slice(hs,he);
let painted=0;
const hp={sid:'guest',deadUntil:0,lastRespawnSeq:7,lastRemoteMoveSeq:10,input:{respawnSeq:7,useSeq:0,pickSeq:0,swapSeq:0},correctionSeq:6,correctionUntil:Date.now()+650,x:900,y:638,vx:0,vy:0,onGround:false,w:40,h:62,face:1};
const block={id:'b',alive:true,x:850,y:670,w:100,h:40,owner:-1};
const hctx={game:{players:{guest:hp},mapH:1400,mapW:5200},bridge:{isHost:true,sid:'host'},ensurePlayers(){},respawn(){},Date,Number,Math,remoteHistory:{},recordRemoteSnapshot(){},performance:{now:()=>0},console,seq32Newer(next,prev){next=Number(next)>>>0;prev=Number(prev)>>>0;const d=(next-prev)>>>0;return d!==0&&d<0x80000000},getBlockUnder(){return block},paintBlock(){painted++},killPlayer(){throw new Error('unexpected kill')}};
vm.createContext(hctx); vm.runInContext(applySrc+'\n'+remoteMoveSrc,hctx);
hctx.applyPlayerSnapshots({guest:{seq:11,respawnSeq:7,correctionAck:6,x:900,y:639,vx:0,vy:0,onGround:true,face:1,w:40,h:62,lastGroundAt:Date.now()}});
ok(hp.onGround===true,'host did not accept post-respawn grounded movement after correction ack');
hctx.applyRemoteMovementOnHost(hp,Date.now());
ok(painted===1,'authoritative ground painting did not resume after respawn lifecycle completed');
console.log('STARPAINT_RESPAWN_PAINT_LIFECYCLE_ROOTFIX_OK');
