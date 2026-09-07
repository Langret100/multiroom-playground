import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

// Guest use prediction must not replay the authoritative FX locally.
const ps=src.indexOf('function previewGuestItemUse('), pe=src.indexOf('const keyMap=',ps);
ok(ps>=0&&pe>ps,'previewGuestItemUse missing');
const preview=src.slice(ps,pe);
ok(preview.includes('localPredictedUseSeq=input.useSeq>>>0'),'predicted use sequence missing');
ok(!preview.includes("spawnFx('itemuse'")&&!preview.includes('playItemSound('),'guest prediction still duplicates authoritative use FX/sound');
const ms=src.indexOf('function mergeRemotePlayers('), me=src.indexOf('function applyPlayerSnapshots',ms);
const merge=src.slice(ms,me);
ok(merge.includes('predictedUseAck')&&merge.includes('suppressAuthoritativeActionUntil'),'authoritative action replay suppression missing');
ok(merge.includes('p.actionUntil=0;p.actionState=null;p.actionItem=null'),'same use sequence still restarts local action');

// Respawn must choose an alive top block instead of falling through a destroyed fixed spawn column.
const rs=src.indexOf('function chooseRespawnSpot('), re=src.indexOf('function previewGuestRespawn',rs);
ok(rs>=0&&re>rs,'chooseRespawnSpot missing');
const respawnFn=src.slice(rs,re);
ok(respawnFn.includes('exposedTopBlocks().filter')&&respawnFn.includes('best.x+best.w/2'),'respawn does not target a live surface center');
const ctx={spawnPoints:()=>[560,1800], exposedTopBlocks:()=>[
  {id:'far',alive:true,x:1700,y:900,w:56,h:56},
  {id:'near',alive:true,x:620,y:940,w:56,h:56},
  {id:'dead',alive:false,x:550,y:900,w:56,h:56}
], game:{mapH:1400,mapW:5200}, Number, Math, Infinity};
vm.createContext(ctx); vm.runInContext(respawnFn,ctx);
const spot=ctx.chooseRespawnSpot({seat:0,h:62});
ok(spot.surfaceId==='near','respawn did not select nearest surviving top block');
ok(Math.abs(spot.x-648)<.01,'respawn is not centered on selected block');

// Rocket vertical impulse must be capped after itemPush, especially while airborne.
const xs=src.indexOf('function explodeRocket('), xe=src.indexOf('function explodeCannon',xs);
const rocket=src.slice(xs,xe);
ok(rocket.includes('wasAirborne=!q.onGround'),'airborne rocket handling missing');
ok(rocket.includes('wasAirborne?-11.6:-12.8'),'rocket upward velocity cap missing');
ok(rocket.includes('itemPush(q,nx*force,ny*force-5.9,1100,360)'),'rocket stun/knock tuning missing');
console.log('STARPAINT_ACTION_RESPAWN_ROCKET_REGRESSION_OK');
