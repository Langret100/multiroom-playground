import fs from 'node:fs';
const room=fs.readFileSync(new URL('../js/pages/room.js',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('../games/soccer/game.js',import.meta.url),'utf8');
function ok(cond,msg){if(!cond){console.error('FAIL',msg);process.exitCode=1}else console.log('PASS',msg)}
// Restore the startup path that existed in the original playable build.
ok(!room.includes('const soccerSeatReady = !isSoccer'), 'no added seat-gate in parent bridge init');
ok(room.includes('&& !isSoccer && !isStarpaint)'), 'soccer remains exempt from room snapshot bridge blocking');
ok(!room.includes("ord.forEach((seat,sid)=>add(sid,seat))"), 'bridge roster construction restored to original players path');
ok(!game.includes('needRoster:true'), 'iframe no longer adds retry protocol for early roster');
ok(!game.includes('if(mySeat<0 || !incoming.some(p=>p.sid===mySid))'), 'iframe original init acceptance restored');
ok(game.includes('mySeat = Number(d.seat ?? -1);'), 'original bridge_init seat assignment restored');
ok(game.includes("bridgeSend('sc_compat',{packet:soccerCompatLastSubmit})"), 'original compatibility quiz relay retained');
ok(room.includes('__soccerCompat:soccerLegacyRelayState.round') && room.includes("type:\"sc_compat_players\""), 'generic tg_state/tg_players soccer compatibility relay retained');
// Goal fix is host-side and does not require a Worker upgrade.
ok(game.includes('soccerCompatConfirmGoal(team,goalId)'),'host compat goal authority retained');
ok(!game.includes("bridgeSend('sc_goal',{team,restartId:goalId})"),'goal does not depend on Worker sc_goal acceptance');
