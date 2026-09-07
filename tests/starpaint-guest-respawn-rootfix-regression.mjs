import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(src.includes("p.lastRespawnSeq=0;p.localRespawnPendingUntil=0"),'round reset does not clear host respawn ack');
const fnStart=src.indexOf('function applyPlayerSnapshots(players)');
const fnEnd=src.indexOf('function playerRenderX',fnStart);
ok(fnStart>=0&&fnEnd>fnStart,'applyPlayerSnapshots not found');
const fnSrc=src.slice(fnStart,fnEnd);
const respawnCheck=fnSrc.indexOf('const respawnSeq=');
const moveSeqCheck=fnSrc.indexOf('if(seq&&seq<=');
ok(respawnCheck>=0&&moveSeqCheck>=0&&respawnCheck<moveSeqCheck,'respawn sequence must be consumed before stale movement rejection');
ok(fnSrc.includes('if(seq32Newer(respawnSeq,lastRespawnSeq))') && fnSrc.includes('if(p.deadUntil>Date.now()){respawn(p);continue}'),'host-authoritative monotonic respawn sequence path missing');

// Execute the real applyPlayerSnapshots function body for the critical case:
// the guest is dead and the forced respawn snapshot has a stale movement seq.
const p={sid:'guest',deadUntil:Date.now()+30000,lastRespawnSeq:0,lastRemoteMoveSeq:77,input:{}};
let respawns=0;
const context={
  game:{players:{guest:p}},
  bridge:{isHost:true,sid:'host'},
  ensurePlayers(){},
  respawn(q){respawns++;q.deadUntil=0;q.x=560;q.y=400;},
  Date,
  Number,
  Math,
  remoteHistory:{},
  recordRemoteSnapshot(){},
  performance:{now:()=>0},
  console,
  seq32Newer(next,prev){next=Number(next)>>>0;prev=Number(prev)>>>0;const d=(next-prev)>>>0;return d!==0&&d<0x80000000}
};
vm.createContext(context);
vm.runInContext(fnSrc,context);
context.applyPlayerSnapshots({guest:{seq:77,respawnSeq:1,x:-999,y:-999,vx:0,vy:0}});
ok(respawns===1,'stale movement seq prevented early guest respawn');
ok(p.deadUntil===0,'host deadUntil was not cleared by quiz respawn');
ok(p.lastRespawnSeq===1,'host respawn ack was not advanced');
console.log('STARPAINT_GUEST_RESPAWN_ROOTFIX_OK');
