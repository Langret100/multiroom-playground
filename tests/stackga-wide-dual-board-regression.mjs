import fs from 'node:fs';
const css=fs.readFileSync('games/stackga/css/game.css','utf8');
const touch=fs.readFileSync('games/stackga/js/touch.js','utf8');
const main=fs.readFileSync('games/stackga/js/main.js','utf8');
const html=fs.readFileSync('games/stackga/index.html','utf8');
function ok(v,m){ if(!v) throw new Error(m); }
ok(css.includes('@media (min-width: 900px)'), 'wide breakpoint missing');
ok(css.includes('grid-template-columns:minmax(300px,1fr) minmax(430px,1fr)'), 'wide two-zone shell missing');
ok(css.includes('grid-column:2') && css.includes('grid-row:1 / 4'), 'opponent board not promoted');
ok(touch.includes('const isWide = shellW >= 900'), 'runtime wide branch missing');
ok(touch.includes('Desktop/Whalebook: opponent gets a full-height board'), 'full opponent sizing path missing');
ok(touch.includes('Mobile/tablet: preserve the existing compact right rail'), 'mobile compatibility path missing');
ok(main.includes('./touch.js?v=20260831-dualboard1'), 'touch cache bust missing');
ok(html.includes('game.css?v=20260831-dualboard1') && html.includes('main.js?v=20260831-dualboard1'), 'asset cache bust missing');
console.log('STACKGA_WIDE_DUAL_BOARD_REGRESSION_OK');
