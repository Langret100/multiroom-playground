import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const room=read('js/pages/room.js');
const soccer=read('games/soccer/game.js');
const star=read('games/starpaint/index.html');
const cpu=read('games/stackga/js/cpu.js');
const main=read('games/stackga/js/main.js');
const gk=read('games/geumchikeo/index.html');

ok(room.includes('&v=sp-workerless-rootfix2'),'StarPaint cache version not advanced');
ok(room.includes('__starpaintState') && room.includes('__starpaintSyncReq'),'StarPaint old-Worker fallback missing');
ok(star.includes('pickSeq:input.pickSeq>>>0,useSeq:input.useSeq>>>0'),'StarPaint action edge piggyback missing');
ok(!room.includes('room.send("pb_hit"') && !room.includes('room.send("pb_fx"'),'new Worker packet dependency remains');
ok(room.includes('room.onMessage("backToRoom"'),'server room-return event missing');

ok(room.includes('localStorage.getItem("cpu_difficulty") || "low"'),'CPU selector default not low');
ok(cpu.includes('constructor(game, seed, difficulty = "low")'),'CPU controller default not low');
ok(main.includes('new CpuController(cpuGame, ((Math.random()*2**32)>>>0), "low")'),'local solo CPU not forced low');
ok(cpu.includes('g.softDrop();'),'low CPU paced drop missing');

ok(room.includes('type:"sc_compat_players"') && soccer.includes("d.type === 'sc_compat_players'"),'soccer compatibility receive bridge missing');
ok(soccer.includes('soccerCompatConfirmGoal(team,goalId)') && soccer.includes('score[team]=Math.max(0,Number(score[team]||0))+1'),'soccer compat goal score missing');
ok(soccer.includes('if(now-g.enteredAt>=180)'),'soccer fast goal reaction missing');
ok(soccer.includes("soccerCompatStartRound('restart')"),'soccer restart quiz missing');
ok(gk.includes('normalized===lastOwnChatText') && gk.includes('SPAM_PENALTY=10'),'forbidden-word spam rule missing');
console.log('FINAL_REQUESTED_FIXES_REGRESSION_OK');
