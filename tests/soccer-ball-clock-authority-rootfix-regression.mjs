import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const game=read('games/soccer/game.js');
const room=read('js/pages/room.js');
const html=read('games/soccer/index.html');
const roomHtml=read('room.html');
function ok(v,m){ if(!v){ console.error('FAIL',m); process.exitCode=1; } else console.log('PASS',m); }

const updateStart=game.indexOf('function updateNetBall(){');
const updateEnd=game.indexOf('\n\nfunction announceFieldRestart',updateStart);
const updateNet=game.slice(updateStart,updateEnd);

ok(game.includes('let matchDeadlineAt=0;')&&game.includes('let soccerCompatMatchDeadlineAt=0;'),'match clock has one persistent deadline');
ok(game.includes("remainingMs:soccerCompatMatchDeadlineAt>0?Math.max(0,soccerCompatMatchDeadlineAt-Date.now())"),'compat host broadcasts decreasing remaining time');
ok(game.includes("if(r.phase==='playing'&&soccerCompatMatchDeadlineAt>0&&now>=soccerCompatMatchDeadlineAt)"),'compat host ends match at deadline');
ok(game.includes("r.phase='over';durationMs=0;matchDeadlineAt=now;"),'deadline transitions to over instead of endless playing');
ok(game.includes("const clockRunning=roundPhase==='playing'&&matchDeadlineAt>0&&!gameOver"),'HUD reads persistent deadline');
ok(!game.includes("durationMs=d.remainingMs;\n  if(d.phase==='playing')startTs=Date.now()"),'playing heartbeat no longer restarts timer');
ok(game.includes('matchDeadlineAt=continuingSamePlay?Math.min(matchDeadlineAt,candidateDeadline):candidateDeadline;'),'same-match heartbeats can never push the deadline later');

ok(room.includes('const soccerLegacyRelayState = { round:null, pos:null, ball:null };'),'legacy relay stores round/player/ball together');
ok(room.includes('__soccerBall:soccerLegacyRelayState.ball'),'host ball rides same generic relay as player state');
ok(room.includes('soccerLegacyRelayState.ball = {'),'sc_ball iframe event updates combined host relay state');
ok(!room.includes('room.send("sc_ball", {'),'iframe host no longer depends on second soccer-specific ball transport');
ok(game.includes('if(hostState?.__soccerBall)applyAuthoritativeBallSnapshot(hostState.__soccerBall);'),'clients consume host ball from combined relay');
ok(game.includes('function applyAuthoritativeBallSnapshot(d){'),'all ball transports enter one authoritative apply function');

ok(!updateNet.includes('netBall.x=target.x')&&!updateNet.includes('dribblePlayer&&(netBall.netZ||0)<5'),'guest no longer rebuilds owned ball from its local player pose');
ok(!updateNet.includes('netBall.x=lerp(netBall.x,target.x,.94)'),'guest claim does not drag ball locally before host approval');
ok(updateNet.includes("Render only the host's authoritative ball state"),'free and owned ball use one authoritative render path');
ok(updateNet.includes('if(localKickTrack)'),'short local kick prediction still exists for responsiveness');
ok(updateNet.includes('/160'),'kick presentation lead converges quickly to host state');

ok(html.includes('game.js?v=20260907-ball-clock-rootfix1'),'soccer game cache key advanced');
ok(roomHtml.includes('room.js?v=20260907-soccer-ball-clock-rootfix1'),'room bridge cache key advanced');
