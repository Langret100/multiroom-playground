import fs from 'node:fs';
const root=new URL('..',import.meta.url).pathname;
const game=fs.readFileSync(root+'games/stackga/js/game.js','utf8');
const main=fs.readFileSync(root+'games/stackga/js/main.js','utf8');
const css=fs.readFileSync(root+'games/stackga/css/game.css','utf8');
const musicPath=root+'assets/audio/stackmusic.mp3';
function ok(v,m){if(!v)throw new Error(m)}
ok(game.includes('lastClearAt = 0') && game.includes('lastClearCells = []'),'line clear render state missing');
ok(game.includes('lastClearAt = now') && game.includes('this.board[y].slice()'),'completed row capture missing');
ok(game.includes('now + 235'),'cascade delay after clear missing');
ok(game.includes('completed row dissolves as one surface'),'whole-row dissolve effect missing');
ok(game.includes('every cell brightens/fades together'),'line still uses independent cell timing');
ok(game.includes('for(let i=0;i<28;i++)') && game.includes('Sparkles lift from across the whole row'),'row-wide sparkle dissolve missing');
ok(!game.includes('centre-out jelly pop'),'old centre-out per-cell clear effect still present');
ok(game.includes('dy=-dropRows*cell') && game.includes('fallT'),'delayed cascade fall missing');
ok(main.includes('lastClearAt: meGame.lastClearAt') && main.includes('lastClearCells: meGame.lastClearCells'),'line clear renderer wiring missing');
ok(css.includes('Mobile embedded exit button') && css.includes('white-space:nowrap!important') && css.includes('word-break:keep-all!important'),'mobile exit no-wrap missing');
// READY -> START cue is local presentation only, before gameplay loop begins.
ok(main.includes('"READY"') && main.includes('"START!"') && main.includes('startCuePending') && main.includes('beginLoop()'),'READY/START cue missing');
ok(css.includes('.overlay.stackStartCue') && css.includes('@keyframes stackReadyPop') && css.includes('@keyframes stackStartPop'),'READY/START cute styling missing');
// Replacement music keeps the existing filename and is compressed well below the old ~1.8MB file.
ok(fs.existsSync(musicPath),'stackmusic.mp3 missing');
ok(fs.statSync(musicPath).size < 250000,`stackmusic.mp3 not compressed enough: ${fs.statSync(musicPath).size}`);
const {StackGame,COLS,ROWS}=await import('../games/stackga/js/game.js?v=lineclear-test');
const g=new StackGame(42);
for(let x=0;x<COLS;x++)g.board[ROWS-1][x]=2;
g.board[ROWS-1][4]=0;g.board[ROWS-1][5]=0;
g.current={type:'O',id:5,x:3,y:ROWS-2,rot:0};g.dead=false;
g._lock();
ok(g.lastCleared===1,'fixture did not clear line');
ok(g.lastClearRows.length===1 && g.lastClearRows[0]===ROWS-1,'clear row state incorrect');
ok(g.lastClearCells.length===1 && g.lastClearCells[0].cells.every(Boolean),'clear row snapshot incomplete');
ok(g.lastCascadeAt>g.lastClearAt,'cascade is not delayed after clear');
console.log('STACKGA_LINECLEAR_MOBILE_EXIT_REGRESSION_OK');
