import fs from 'node:fs';
const game=fs.readFileSync(new URL('../games/soccer/game.js', import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../js/pages/room.js', import.meta.url),'utf8');
const roomHtml=fs.readFileSync(new URL('../room.html', import.meta.url),'utf8');
const soccerHtml=fs.readFileSync(new URL('../games/soccer/index.html', import.meta.url),'utf8');
const checks=[
 ['parent publishes live soccer roster', room.includes('type:"bridge_roster", gameId:"soccer", players:soccerRoster')],
 ['soccer roster uses authoritative seat map', room.includes('seat: Number.isFinite(Number(seatOf[sid])) ? Number(seatOf[sid]) : -1')],
 ['bridge init no longer commits without self roster', game.includes('if(!self){') && game.includes("부모가 보내는 bridge_roster를 기다린다")],
 ['game receives parent bridge roster', game.includes("d.type === 'bridge_roster'") && game.includes("d.gameId === 'soccer'")],
 ['world init happens after self roster exists', game.includes('mySeat = Number(self.seat);') && game.includes('gameInitialized = true;\n    initGame();')],
 ['workerless compat relay retained', game.includes("bridgeSend('sc_compat'") && room.includes('sc_compat')],
 ['room js cache-bust changed', roomHtml.includes('room.js?v=soccer-roster-lifecycle-rootfix')],
 ['soccer game cache-bust changed', soccerHtml.includes('game.js?v=roster-lifecycle-rootfix')],
];
let fail=0;
for(const [name,ok] of checks){console.log(ok?'PASS':'FAIL',name); if(!ok)fail++;}
if(fail)process.exit(1);
