import fs from 'node:fs';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../js/pages/room.js', import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

ok(src.includes("localUsePendingSeq=input.useSeq>>>0")&&src.includes("localUsePendingUntil=now+900"),'guest use is not ACK-gated');
ok(src.includes("Number(me.localUsePendingSeq||0)!==0")&&src.includes("lastAuthoritativeUseAck"),'rapid duplicate use guard missing');
ok(src.includes("spawnFx('itemuse'")&&src.includes("spawnFx('rocketlaunch'")&&src.includes("spawnFx('beaconcall'")&&src.includes("spawnFx('laserAim'"),'guest immediate item FX coverage incomplete');
ok(src.includes('predictedRespawnAck')&&src.includes('&&!predictedRespawnAck'),'predicted respawn correction suppression missing');
ok(src.includes("drawPixelStarRing(x,y,8+20*t")&&src.includes("if(f.type==='paint')"),'paint-touch frame is not star-shaped');
ok(!src.includes('game.sfxEvents.length=0;game.fxEvents.length=0'),'one-shot FX is still cleared after a single snapshot');
ok(src.includes('at:Date.now()')&&src.includes('Date.now()-evAt>1800'),'persistent FX ring has no freshness bound');
ok(src.includes("spawnFx('laserStrike'")&&src.includes("drawPixelStarRing(x,y,20+70*t"),'laser strike beam/impact FX missing');
ok(src.includes("type:'pb_finish_visible'")&&room.includes("d.type === 'pb_finish_visible'")&&room.includes('scheduleStarpaintLocalReturn(1950)'),'2-second local return path missing');
ok(room.includes('starpaintResultActive')&&room.includes('if (!starpaintResultActive) showResultOverlay(r)'),'generic result overlay can still cover StarPaint winner scene');
console.log('STARPAINT_PRECISION_SYNC_FX_RETURN_REGRESSION_OK');
