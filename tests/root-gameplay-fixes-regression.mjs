import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const room=read('js/pages/room.js');
const worker=read('cf-worker/src/index.js');
const soccer=read('games/soccer/game.js');
const star=read('games/starpaint/index.html');
const cpu=read('games/stackga/js/cpu.js');
const stackMain=read('games/stackga/js/main.js');
const gk=read('games/geumchikeo/index.html');

// Soccer: exactly one native authority path.
ok(room.includes('room.send("sc_math_submit"') && room.includes('room.send("sc_pos"'),'soccer native iframe->Worker path missing');
ok(room.includes('room.onMessage("sc_round_state"') && room.includes('room.onMessage("sc_score_sync"'),'soccer native Worker->iframe path missing');
ok(!room.includes('sc_compat') && !soccer.includes('sc_compat') && !soccer.includes('soccerCompat'),'soccer duplicate compatibility authority remains');
ok(!room.includes('coop.meta.id === "soccer" && !coop.iframeReady'),'soccer init still depends on bridge_ready timing');
ok(room.includes('fromMainForPb || fromMainForSoccer'),'soccer bridge_ready cannot initialize bridge immediately');
ok(soccer.includes('isHost = !!d.isHost;'),'soccer iframe still invents host from seat');
ok(soccer.includes('GOAL_SCORE_LEFT_X = GOAL_PLANE_LEFT_X') && soccer.includes('if(now-g.enteredAt>=180)'),'soccer still waits for deep-net goal travel');
ok(worker.includes('this.sc.score[team] = Number(this.sc.score[team]||0) + 1'),'soccer score is not server-authoritative');
ok(worker.includes('if(this.sc.seenGoalIds.includes(goalId))return'),'soccer duplicate goal edge guard missing');

// StarPaint: native movement/actions, host-only world state, immediate local presentation.
ok(room.includes('room.send("tg_state", { state:{ __starpaintMove:d.player || {} } }') && room.includes('if(packet && packet.__starpaintMove)'),'StarPaint established movement aggregate relay missing');
ok(!room.includes('__starpaintState') && !room.includes('__starpaintSyncReq'),'StarPaint duplicate world/sync fallback remains');
ok(!worker.includes('if (t === "pb_player")') && !worker.includes('_schedulePbPlayersBroadcast'),'unnecessary StarPaint movement protocol was added to Worker');
ok(worker.includes('if(!sender?.isHost) return;'),'StarPaint host world authority not enforced');
ok(worker.includes('swapSeq:Number(d.input.swapSeq||0)>>>0') && worker.includes('shotCharged:!!d.input.shotCharged'),'StarPaint action metadata sanitizer incomplete');
ok(!star.includes('pickSeq:input.pickSeq>>>0,useSeq:input.useSeq>>>0,swapSeq:input.swapSeq>>>0,respawnSeq:input.respawnSeq>>>0,shotAngleDeg'),'StarPaint movement snapshot still duplicates action edges');
ok(star.includes('me.predictedPickupId=String(frontItem.id||\'\')') && star.includes('frontItem.taken=true'),'StarPaint guest pickup does not present immediately');
ok(star.includes('previewGuestItemUse(me,held,now)'),'StarPaint guest item use has no immediate presentation');
ok(star.includes('previewVisualKnock(hitPreview.player'),'StarPaint direct hit has no immediate visual knock');
ok(!star.includes('maybeReturnToRoom('),'StarPaint client still owns room lifecycle');
ok(worker.includes('this._endAndBackToLobby(2400);'),'StarPaint result does not return through server lifecycle');

// StackGa: low CPU has a visible decision period and no instant hard drop.
ok(stackMain.includes('new CpuController(cpuGame, ((Math.random()*2**32)>>>0), "low")'),'solo StackGa is not explicitly low difficulty');
ok(cpu.includes('this.thinkMs =') && cpu.includes('this.diff === "low"') && cpu.includes('g.softDrop();'),'low CPU paced soft drop missing');
ok(cpu.includes('if(this.diff === "low")') && cpu.includes('}else{\n        g.hardDrop();'),'hard drop is not excluded from low branch');

// Forbidden-word game: consecutive identical message costs exactly 10.
ok(gk.includes('SPAM_PENALTY=10'),'spam penalty is not 10');
ok(gk.includes('normalized===lastOwnChatText'),'consecutive identical-message detection missing');
ok(gk.includes('🚨 도배 경고! -${SPAM_PENALTY} 체력'),'spam warning text missing');

console.log('ROOT_GAMEPLAY_FIXES_REGRESSION_OK');
