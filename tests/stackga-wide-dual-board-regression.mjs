import fs from 'node:fs';
const css=fs.readFileSync('games/stackga/css/game.css','utf8');
const touch=fs.readFileSync('games/stackga/js/touch.js','utf8');
const main=fs.readFileSync('games/stackga/js/main.js','utf8');
const html=fs.readFileSync('games/stackga/index.html','utf8');
function ok(v,m){ if(!v) throw new Error(m); }
ok(css.includes('@media (min-width:900px)') || css.includes('@media (min-width: 900px)'), 'wide breakpoint missing');
ok(css.includes('grid-template-columns:minmax(0,1fr) clamp(104px,7.5vw,142px) minmax(0,1fr)'), 'three-column duel shell missing');
ok(css.includes('.sideCol{display:contents}'), 'center rail/opponent promotion missing');
ok(touch.includes('const isWide = shellW >= 900'), 'runtime wide branch missing');
ok(touch.includes('two equally important full-size boards'), 'equal full board sizing missing');
ok(touch.includes('Mobile/tablet: preserve the existing compact right rail'), 'mobile compatibility path missing');
ok(main.includes('HORIZ_DAS_MS = 115') && main.includes('HORIZ_ARR_MS = 34'), 'keyboard DAS/ARR missing');
ok(main.includes('./touch.js?v=20260831-jellyfocus3'), 'touch cache bust missing');
ok(html.includes('game.css?v=20260831-jellyfocus3') && html.includes('main.js?v=20260831-jellyfocus3'), 'asset cache bust missing');
console.log('STACKGA_WIDE_DUAL_BOARD_REGRESSION_OK');
