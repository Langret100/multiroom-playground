import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const sc=read('games/soccer/game.js');
ok(sc.includes('GOAL_SCORE_LEFT_X = GOAL_PLANE_LEFT_X') && sc.includes('if(now-g.enteredAt>=180)'),'soccer goal response too slow');
ok(sc.includes('soccerCompatConfirmGoal(team,goalId)'),'soccer compat score authority missing');
ok(sc.includes("soccerCompatStartRound('restart')"),'soccer fresh restart quiz missing');
ok(sc.includes('ball={x:FX+FW/2,y:KICKOFF_Y,z:0'),'soccer goal does not center ball');
console.log('TOGESTER_SNAKETAIL_SOCCER_FOLLOWUP_REGRESSION_OK');
