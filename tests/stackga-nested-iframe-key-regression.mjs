import fs from 'node:fs';
const lobby=fs.readFileSync(new URL('../js/pages/lobby.js',import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../js/pages/room.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../games/stackga/js/main.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const roomHtml=fs.readFileSync(new URL('../room.html',import.meta.url),'utf8');
function ok(v,m){ if(!v) throw new Error(m); }
// Exact path that was missing: top-level lobby -> embedded room -> Stackga iframe.
ok(lobby.includes('function forwardEmbeddedRoomKey') && lobby.includes("type:'embedded_room_key'"),'top-level embedded-room keyboard proxy missing');
ok(lobby.includes("window.addEventListener('keydown'") && lobby.includes("window.addEventListener('keyup'"),'top-level key listeners missing');
ok(lobby.includes("ov.classList.contains('hidden')") && lobby.includes('fr?.contentWindow'),'proxy not scoped to visible embedded room');
ok(room.includes("d.type!=='embedded_room_key'") && room.includes('e.source !== window.parent'),'room parent-key receiver/source guard missing');
ok(room.includes('function forwardStackgaKeyToGame') && room.includes("type:'stackga_key'"),'room-to-game keyboard relay missing');
ok(main.includes("d.type!=='stackga_key'") && main.includes("performAction('drop')"),'Stackga child key receiver missing');
// Remove the previous failed workaround rather than layering it underneath.
ok(!room.includes('blurGameBlockingInputs'),'obsolete input-blur workaround still present');
ok(!main.includes('focusBoardInput'),'obsolete extra focus retry workaround still present');
// Cache-bust the changed parent and room scripts, otherwise deployed Pages can keep old relay code.
ok(index.includes('lobby.js?v=20260831-create-room-v3'),'lobby relay cache bump missing');
ok(roomHtml.includes('room.js?v=20260831-controlguide4'),'room relay cache bump missing');
console.log('STACKGA_NESTED_IFRAME_KEY_REGRESSION_OK path=index->room->stackga');
