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

// Soccer: goal always resets midfield and starts a fresh restart quiz; post-result lock is shorter.
ok(sc.includes("r.phase='result';r.resultUntil=now+1600;r.kickoffAt=r.resultUntil+1900"),'soccer post-result delay not shortened');
ok(sc.includes("beginsAt=now+520"),'soccer restart preparation still excessively delayed');
ok(sc.includes('ball={x:FX+FW/2,y:KICKOFF_Y,z:0'),'soccer goal does not reset ball to midfield');
ok(sc.includes('soccerCompatRound=null') && sc.includes("soccerCompatStartRound('restart')"),'soccer goal does not force a fresh restart quiz');
ok(sc.includes('isHost = !!d.isHost || (mySeat===0);'),'soccer host fallback missing');
console.log('TOGESTER_SNAKETAIL_SOCCER_FOLLOWUP_REGRESSION_OK');
