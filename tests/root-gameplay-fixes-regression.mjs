import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const room=read('js/pages/room.js');
const soccer=read('games/soccer/game.js');
const round=read('games/soccer/round-controller.js');
const star=read('games/starpaint/index.html');
const cpu=read('games/stackga/js/cpu.js');
const stackMain=read('games/stackga/js/main.js');
const gk=read('games/geumchikeo/index.html');

// StarPaint: old Worker-compatible aggregate path carries movement + action sequences.
ok(room.includes('__starpaintMove') && room.includes('__starpaintState') && room.includes('__starpaintSyncReq'),'StarPaint aggregate compatibility path missing');
ok(star.includes('pickSeq:input.pickSeq>>>0,useSeq:input.useSeq>>>0,swapSeq:input.swapSeq>>>0,respawnSeq:input.respawnSeq>>>0,shotAngleDeg'),'StarPaint action sequences missing from established player snapshot');
ok(!room.includes('room.send("pb_hit"') && !room.includes('room.send("pb_fx"'),'StarPaint still requires new Worker combat packets');
ok(!star.includes("type:'pb_hit'") && !star.includes("type:'pb_fx'"),'StarPaint iframe still emits new Worker combat packets');
ok(star.includes('frontItem.taken=true') && star.includes('previewGuestItemUse(me,held,now)') && star.includes('previewVisualKnock(hitPreview.player'),'StarPaint immediate guest presentation missing');
ok(!star.includes('maybeReturnToRoom(Date.now())'),'StarPaint still owns room return locally');

// Room lifecycle: StarPaint winner scene returns locally after ~2s; authoritative backToRoom still finalizes server state later.
ok(room.includes('room.onMessage("backToRoom"') && room.includes('returnToRoomLobbyLocal();'),'authoritative room return missing');
ok(room.includes('__starpaintLocalBackTimer = setTimeout') && room.includes('}, 2000);'),'StarPaint 2s local winner return missing');

// StackGa: low is the actual default and low never hard-drops after alignment.
ok(room.includes('localStorage.getItem("cpu_difficulty") || "low"'),'room CPU default not low');
ok(stackMain.includes('new CpuController(cpuGame, ((Math.random()*2**32)>>>0), "low")'),'solo CPU not explicitly low');
ok((stackMain.match(/get\("cpu"\) \|\| "low"/g)||[]).length===2,'embedded CPU low fallback incomplete');
ok(cpu.includes('constructor(game, seed, difficulty = "low")') && cpu.includes('this.thinkMs ='),'CPU low pacing/default missing');
ok(cpu.includes('if(this.diff === "low")') && cpu.includes('g.softDrop();') && cpu.includes('}else{\n        g.hardDrop();'),'low CPU still instant-hard-drops');

// Soccer: one established generic relay is the compatibility authority for quiz/movement.
ok(room.includes('sc_compat') && room.includes('__soccerCompat:soccerLegacyRelayState.round, __soccerPos:soccerLegacyRelayState.pos'),'soccer merged established relay missing');
ok(!room.includes('room.send("sc_math_submit"'),'soccer requires newer Worker math API');
ok(soccer.includes("bridgeSend('sc_compat',{packet:soccerCompatLastSubmit})"),'soccer quiz progress not using established relay');
ok(soccer.includes('score[team]=Math.max(0,Number(score[team]||0))+1'),'compat host does not increment match score');
ok(soccer.includes('soccerCompatConfirmGoal(team,goalId)'),'goal path does not use compat score authority');
ok(round.includes('goalSerial:') && soccer.includes("case 'goal':"),'compat goal edge metadata/presentation missing');
ok(soccer.includes('GOAL_SCORE_LEFT_X = GOAL_PLANE_LEFT_X') && soccer.includes('if(now-g.enteredAt>=180)'),'goal still waits deep inside net');
ok(soccer.includes('ball={x:FX+FW/2,y:KICKOFF_Y,z:0'),'goal does not promptly center ball');
ok(soccer.includes('Math.max(Number(score.A||0),Number(d.scoreA ?? score.A))'),'late Worker goal can overwrite compat score downward');

// Forbidden-word consecutive duplicate message.
ok(gk.includes('SPAM_PENALTY=10'),'spam penalty not 10');
ok(gk.includes('normalized===lastOwnChatText'),'consecutive exact duplicate check missing');
ok(gk.includes('gSend(\'score\',{score:ns,why:\'spam\''),'spam health is not synchronized');
ok(gk.includes('🚨 도배 경고! -${SPAM_PENALTY} 체력'),'spam warning missing');
console.log('ROOT_GAMEPLAY_FIXES_REGRESSION_OK');
