import fs from 'node:fs';
const game=fs.readFileSync(new URL('../games/stackga/js/game.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../games/stackga/js/main.js',import.meta.url),'utf8');
const audio=fs.readFileSync(new URL('../games/stackga/js/audio.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../games/stackga/css/game.css',import.meta.url),'utf8');
if(!/export const COLS = 10/.test(game) || !/export const ROWS = 23/.test(game)) throw new Error('grid changed');
if(!/_colorRnd/.test(game) || !/Math\.floor\(this\._colorRnd\(\)\*7\)/.test(game)) throw new Error('falling random color missing');
if(!/fallingColor\(activePiece\.id/.test(game)) throw new Error('single-color falling tetromino missing');
if(!/paletteAt\(t\)/.test(game) || !/132,239,174/.test(game) || !/147,116,244/.test(game) || !/20,43,116/.test(game)) throw new Error('mint-violet-night palette missing');
if(!/mixColor\(fallingColor\(v,false\),targetColor,settleMix\)/.test(game) || !/\(age-120\)\/700/.test(game)) throw new Error('gradual landing color absorption missing');
if(!/settleGlow/.test(game) || !/settleMix>\.58/.test(game)) throw new Error('transition glow/star delay missing');
if(!/lastLockAt/.test(game) || !/Math\.sin\(age\/36\)/.test(game)) throw new Error('jelly wobble missing');
if(!/activePiece: meGame\.current/.test(main)) throw new Error('active piece render separation missing');
if(!/jellyLand/.test(audio) || !/sparkle/.test(audio)) throw new Error('sfx missing');
if(!/Slime_wet_smacking\.ogg/.test(audio) || !/Windchimes\.ogg/.test(audio)) throw new Error('public-domain sample refs missing');
if(!/Glass-jelly HUD/.test(css) || !/\.hudLeft>div/.test(css) || !/background:linear-gradient\(180deg,#55d7e5/.test(css)) throw new Error('glass HUD/frame restyle missing');
if(!/clearResult\.rows/.test(game) || !/r=>r>y/.test(game)) throw new Error('fresh-lock row-clear remap missing');

if(!/lastCascadeCells/.test(game) || !/cascadeInfo\.fromY/.test(game) || !/cascadeAge<0/.test(game) || !/fallT/.test(game) || !/\(cascadeAge-25\)\/500/.test(game)) throw new Error('delayed cascade fall/re-dye animation missing');
if(!/lastContactCells/.test(game) || !/contactAge/.test(game) || !/cw\*\.048/.test(game)) throw new Error('contact jelly reaction missing');

// A lock that completes the bottom row must keep the two surviving O-piece cells
// marked as fresh after the cleared row shifts the board down.
const {StackGame,COLS,ROWS}=await import('../games/stackga/js/game.js');
const g=new StackGame(1);
for(let x=0;x<COLS;x++) g.board[ROWS-1][x]=2;
g.board[ROWS-1][4]=0; g.board[ROWS-1][5]=0;
g.current={type:'O',id:5,x:3,y:ROWS-2,rot:0};
g.dead=false; g._lock();
if(g.lastCleared!==1) throw new Error('line-clear fixture failed');
const got=JSON.stringify(g.lastLockCells.slice().sort());
const want=JSON.stringify([[4,ROWS-1],[5,ROWS-1]].sort());
if(got!==want) throw new Error(`fresh-lock remap after clear wrong: ${got}`);

// Existing blocks that physically settle after a clear must be tracked with old/new rows
// so their colour can morph again and their jelly reaction can wave downward.
const c=new StackGame(2);
c.board[ROWS-1].fill(3);
c.board[ROWS-2][2]=4;
c.board[ROWS-1][4]=0; c.board[ROWS-1][5]=0;
c.current={type:'O',id:6,x:3,y:ROWS-2,rot:0}; c.dead=false; c._lock();
const moved=c.lastCascadeCells.find(v=>v.x===2 && v.fromY===ROWS-2 && v.toY===ROWS-1);
if(!moved) throw new Error('existing block cascade tracking missing');

// A landing piece must also make the already-settled block it directly touches react.
const h=new StackGame(3);
h.board[ROWS-1][4]=2;
h.current={type:'O',id:5,x:3,y:ROWS-3,rot:0}; h.dead=false; h._lock();
if(!h.lastContactCells.some(([x,y])=>x===4 && y===ROWS-1)) throw new Error('contact reaction tracking missing');

console.log('STACKGA_JELLY_VISUAL_REGRESSION_OK');
