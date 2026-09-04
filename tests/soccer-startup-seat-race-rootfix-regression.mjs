import fs from 'node:fs';
const room=fs.readFileSync(new URL('../js/pages/room.js',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('../games/soccer/game.js',import.meta.url),'utf8');
function ok(cond,msg){if(!cond){console.error('FAIL',msg);process.exitCode=1}else console.log('PASS',msg)}
ok(room.includes('const soccerSeatReady = !isSoccer'), 'soccer waits for authoritative seat before bridge init');
ok(room.includes("if(ord&&typeof ord.forEach==='function') ord.forEach((seat,sid)=>add(sid,seat))"), 'bridge roster is built directly from authoritative order map');
ok(game.includes("if(mySeat<0 || !incoming.some(p=>p.sid===mySid))"), 'iframe refuses invalid early bridge_init');
ok(game.includes("bridgeSend('bridge_ready',{retry:true,needRoster:true})"), 'invalid init requests a fresh bridge init instead of committing loading state');
ok(game.includes("gameInitialized = true;\n    roster = incoming;"), 'valid init still commits normally');
