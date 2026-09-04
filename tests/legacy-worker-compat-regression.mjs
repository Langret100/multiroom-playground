import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const room=read('js/pages/room.js');
const soccer=read('games/soccer/game.js');
const tg=read('games/togester/index.html');

// Soccer now has one authoritative protocol: the Worker's native sc_* messages.
for (const required of [
  'room.send("sc_pos"', 'room.send("sc_math_submit"', 'room.send("sc_time_ping"',
  'room.onMessage("sc_time_pong"', 'room.onMessage("sc_round_state"',
  'room.onMessage("sc_round_progress"', 'room.onMessage("sc_math_ack"',
  'room.onMessage("sc_score_sync"', 'room.onMessage("sc_players"',
  'room.onMessage("sc_goal"', 'room.onMessage("sc_roster"'
]) {
  if (!room.includes(required)) throw new Error(`native soccer relay missing: ${required}`);
}
if(!soccer.includes("bridgeSend('sc_math_submit'")) throw new Error('soccer math submit is not using native Worker protocol');
if(!soccer.includes("bridgeSend('sc_sync'")) throw new Error('soccer native sync request missing');
for (const forbidden of ['sc_compat','soccerCompat','soccerLegacyRelay','__soccerCompat','__soccerPos']) {
  if ((room+soccer).includes(forbidden)) throw new Error(`removed soccer compatibility tunnel remains: ${forbidden}`);
}

// Togester intentionally keeps its established compatibility transport; this test
// makes sure the soccer cleanup did not alter that unrelated game.
if(!tg.includes('itemRequest: itemCompatRequest')) throw new Error('togester item request not piggybacked on tg_state');
if(!tg.includes('itemCompat: isHost ?')) throw new Error('togester host item authority snapshot missing');
if(/bridgeSend\(['\"]tg_item['\"]/.test(tg)) throw new Error('togester unexpectedly depends on tg_item Worker API');

const mx=read('games/mathexplorer/math-explorer-bridge.js');
if(mx.includes("sendEvent('choice_done'")) throw new Error('mathexplorer choice_done still depends on guest mx_event allowlist');
if(mx.includes("sendEvent('choice_apply'")) throw new Error('mathexplorer choice_apply still depends on guest mx_event allowlist');
if(mx.includes("sendEvent('choice_request'")) throw new Error('mathexplorer choice_request still depends on guest mx_event allowlist');
if(!mx.includes('choiceRequestPhase: String(state.__mxChoiceRequestPhase')) throw new Error('mathexplorer choice request not carried by mx_state');
if(!mx.includes('rewardPulse: safeNum(state.__mxRewardPulse')) throw new Error('mathexplorer reward effect marker not carried by mx_state');
if(!mx.includes('choicePulse: safeNum(state.__mxChoicePulse')) throw new Error('mathexplorer choice completion not carried by mx_state');

console.log('LEGACY_WORKER_COMPAT_REGRESSION_OK');
