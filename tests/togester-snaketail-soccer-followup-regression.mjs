import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const tg=read('games/togester/index.html');
const st=read('games/snaketail/index.html');
const sc=read('games/soccer/game.js');
const ok=(v,m)=>{if(!v)throw new Error(m)};

// Togester: slightly quicker movement / shorter float + pickup cannot be resurrected.
ok(tg.includes('const GRAVITY = 0.18 * PHYS_SCALE'),'togester gravity not retuned');
ok(tg.includes('const MOVE_MAX_SPEED = 2.40 * PHYS_SCALE'),'togester move speed not retuned');
ok(tg.includes('pendingItemPickupIds') && tg.includes('consumedItemIds'),'pickup stale-snapshot guards missing');
ok(tg.includes('!consumedItemIds.has(id) && !pendingItemPickupIds.has(id)'),'host world snapshot can resurrect picked item');
ok(tg.includes("worldItems=worldItems.filter(x=>String(x.id)!==pickId)"),'picked item is not removed immediately');
ok(tg.includes("pendingItemPickupIds.delete(String(ev.id||''))"),'rejected pickup cannot recover');

// SnakeTail: visual direction follows the newest actual body trail rather than a stale angle only.
ok(st.includes('function visualHeadDir(state)'),'snaketail visual direction helper missing');
ok(st.includes('const trailDir=Math.atan2(hy-anchor.y,hx-anchor.x)'),'snaketail head direction not derived from travel trail');
ok(st.includes('const yaw = -visualHeadDir(s) + Math.PI * 0.5'),'snaketail 3D head direction not corrected');
ok(st.includes('const dir=visualHeadDir(s);'),'snaketail 2D head direction not corrected');

// Soccer: Worker owns round timing/score and the client only presents confirmed goals.
const worker=read('cf-worker/src/index.js');
ok(worker.includes('const beginsAt=now()+800;'),'soccer Worker quiz preparation missing');
ok(worker.includes('r.resultUntil=now()+3000;r.kickoffAt=r.resultUntil+3000'),'soccer Worker result/countdown lifecycle missing');
ok(worker.includes('this.sc.score[team] = Number(this.sc.score[team]||0) + 1'),'soccer score is not Worker-authoritative');
ok(worker.includes('if(this.sc.seenGoalIds.includes(goalId))return'),'soccer duplicate goal protection missing');
ok(sc.includes('GOAL_SCORE_LEFT_X = GOAL_PLANE_LEFT_X') && sc.includes('GOAL_SCORE_RIGHT_X = GOAL_PLANE_RIGHT_X'),'soccer goal plane still requires deep-net travel');
ok(sc.includes('if(now-g.enteredAt>=180)'),'soccer goal visual still holds the ball too long');
ok(sc.includes('ball={x:FX+FW/2,y:KICKOFF_Y,z:0'),'soccer confirmed goal does not reset ball to midfield');
ok(sc.includes('isHost = !!d.isHost;'),'soccer iframe still invents host authority from seat number');
ok(!sc.includes('sc_compat') && !sc.includes('soccerCompat'),'soccer compatibility round path remains');
console.log('TOGESTER_SNAKETAIL_SOCCER_FOLLOWUP_REGRESSION_OK');
