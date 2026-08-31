import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const room=read('js/pages/room.js');
const soccer=read('games/soccer/game.js');
const tg=read('games/togester/index.html');

for (const forbidden of [
  'room.send("tg_item"', 'room.send("sc_math_submit"', 'room.send("sc_time_ping"',
  'room.onMessage("tg_item"', 'room.onMessage("sc_time_pong"', 'room.onMessage("sc_round_state"',
  'room.onMessage("sc_round_progress"', 'room.onMessage("sc_math_ack"', 'room.onMessage("sc_score_sync"'
]) {
  if (room.includes(forbidden)) throw new Error(`obsolete Worker-specific room path remains: ${forbidden}`);
}
if (/bridgeSend\(['"](?:tg_item|sc_math_submit|sc_time_ping)['"]/.test(tg+soccer)) throw new Error('obsolete Worker-specific iframe send path remains');
if(!room.includes('room.send("tg_state", { state: { __soccerCompat: d.packet || {} } })')) throw new Error('soccer compatibility tunnel missing');
if(!room.includes('type:"sc_compat_players"')) throw new Error('soccer compatibility receive bridge missing');
if(!soccer.includes("bridgeSend('sc_compat'")) throw new Error('soccer compat sender missing');
if(soccer.includes("bridgeSend('sc_math_submit'")) throw new Error('soccer still depends on new sc_math_submit Worker API');
if(!soccer.includes("d.type === 'sc_compat_players'")) throw new Error('soccer compat aggregate receiver missing');
if(!tg.includes('itemRequest: itemCompatRequest')) throw new Error('togester item request not piggybacked on tg_state');
if(!tg.includes('itemCompat: isHost ?')) throw new Error('togester host item authority snapshot missing');
if(/bridgeSend\(['\"]tg_item['\"]/.test(tg)) throw new Error('togester still depends on tg_item Worker API');

const mx=read('games/mathexplorer/math-explorer-bridge.js');
if(mx.includes("sendEvent('choice_done'")) throw new Error('mathexplorer choice_done still depends on guest mx_event allowlist');
if(mx.includes("sendEvent('choice_apply'")) throw new Error('mathexplorer choice_apply still depends on guest mx_event allowlist');
if(mx.includes("sendEvent('choice_request'")) throw new Error('mathexplorer choice_request still depends on guest mx_event allowlist');
if(!mx.includes('choiceRequestPhase: String(state.__mxChoiceRequestPhase')) throw new Error('mathexplorer choice request not carried by mx_state');
if(!mx.includes('rewardPulse: safeNum(state.__mxRewardPulse')) throw new Error('mathexplorer reward effect marker not carried by mx_state');
if(!mx.includes('choicePulse: safeNum(state.__mxChoicePulse')) throw new Error('mathexplorer choice completion not carried by mx_state');

console.log('LEGACY_WORKER_COMPAT_REGRESSION_OK');
