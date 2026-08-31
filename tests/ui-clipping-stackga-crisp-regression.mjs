import fs from 'node:fs';
const css=fs.readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
const gcss=fs.readFileSync(new URL('../games/stackga/css/game.css',import.meta.url),'utf8');
const game=fs.readFileSync(new URL('../games/stackga/js/game.js',import.meta.url),'utf8');
const idx=fs.readFileSync(new URL('../games/stackga/index.html',import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../room.html',import.meta.url),'utf8');
function ok(x,m){if(!x) throw new Error(m)}
ok(css.includes('grid-template-areas:"flow control" "tip control"'),'briefing layout not fixed');
ok(css.includes('overflow-x:hidden !important') && css.includes('scrollbar-width:none !important'),'create game grid scrollbar fix missing');
ok(css.includes('.canvasWrap::-webkit-scrollbar{display:none}'),'room description scroll chrome not hidden');
ok(game.includes('Pale night-sky board'),'night sky render missing');
ok(game.includes('cell*.018'),'jelly cell gap not tightened');
ok(game.includes('cell*(.065+.035*'),'jelly shadow not sharpened');
ok(game.includes('Tiny fixed stars'),'night stars missing');
ok(gcss.includes('pale night-sky polish'),'stackga shell restyle missing');
ok(idx.includes('game.css?v=20260831-dualboard1') && idx.includes('main.js?v=20260831-dualboard1'),'stackga cache bust missing');
ok(room.includes('styles.css?v=20260831-roomguide2'),'room css cache bust missing');
console.log('UI_CLIPPING_STACKGA_CRISP_REGRESSION_OK');
