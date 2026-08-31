import fs from 'node:fs';
const root=new URL('..',import.meta.url).pathname;
const read=(p)=>fs.readFileSync(root+p,'utf8');
const main=read('games/stackga/js/main.js');
const game=read('games/stackga/js/game.js');
const room=read('js/pages/room.js');
const reg=read('js/games/registry.js');
function ok(v,m){if(!v)throw new Error(m)}
ok(game.includes('lastAirMoveAt = Date.now()'),'air move timestamp missing');
ok(game.includes('airSkew') && game.includes('lastAirMoveDir'),'air jelly inertia missing');
ok(game.includes('Airborne tetrominoes are one connected jelly body') && game.includes('ctx.transform(airSx,0,airSkew,airSy,0,0)') && game.includes('sx:1,sy:1'),'airborne piece still deforms per cell');
ok(game.includes('sx=1+wobble*.12') && game.includes('sy=1-wobble*.17'),'landing jelly not strengthened');
ok(main.includes('focus_game') && main.includes('setTimeout(focusMe,260)'),'child focus recovery missing');
ok(room.includes('focusGameIframeSoon') && room.includes('setTimeout(poke,220)'),'parent iframe focus recovery missing');
ok(reg.includes('20260831-cards7'),'card cache bump missing');
ok(room.includes("type:'stackga_key'") && room.includes("forwardStackgaPhysicalKey"),'parent key proxy missing');
ok(main.includes("d.type!=='stackga_key'") && main.includes("performAction('drop')"),'child key proxy receiver missing');
console.log('STACKGA_FOCUS_AIR_JELLY_REGRESSION_OK');

ok(!room.includes('blurGameBlockingInputs') && room.includes('iframe-loading'),'obsolete blur workaround remained or loading guard missing');
ok(!main.includes('focusBoardInput'),'obsolete start-loop focus workaround remained');

ok(room.includes('forwardStackgaPhysicalKey(e,true);\n      if (shouldIgnoreKeyEvent(e)) return;'),'stackga key forwarding still blocked by focused input');
ok(read('games/stackga/index.html').includes('stackga-critical-bg'),'critical initial background missing');
