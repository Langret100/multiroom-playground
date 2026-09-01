import fs from 'node:fs';
const html=fs.readFileSync(new URL('../games/snaketail/index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cf-worker/src/index.js',import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../server/rooms/GameRoom.js',import.meta.url),'utf8');
function must(re,msg){if(!re.test(html+worker+room))throw new Error(msg)}
function mustHtml(re,msg){if(!re.test(html))throw new Error(msg)}
function mustWorker(re,msg){if(!re.test(worker))throw new Error(msg)}
function mustRoom(re,msg){if(!re.test(room))throw new Error(msg)}
function mustNotHtml(re,msg){if(re.test(html))throw new Error(msg)}

mustNotHtml(/SnakeGame\/master\/data\/Snake\.png|snakeSpriteReady|snakeSprite\.src/,'remote pixel snake head still present');
mustHtml(/Local vector mascot head:[\s\S]*front is \+X/,'vector head direction marker missing');
mustHtml(/Math\.min\(body\.length,8\)/,'head direction does not use recent trail window');
mustHtml(/Math\.abs\(delta\)>Math\.PI\*0\.72/,'stale trail backward-flip guard missing');
mustHtml(/connected core stroke guarantees continuity[\s\S]*lineWidth=beadR\*1\.56/,'connected body core missing');
mustHtml(/beadStep=Math\.max\(1,Math\.floor\(body\.length\/110\)\)/,'dense bead overlay missing');
mustHtml(/resampleBodyPath\(body,targetCount\)/,'3D body resampling missing');
mustHtml(/if\(!s\|\|sid===mySid\|\|s\.alive===false\) continue/,'dead remote snakes still render in 2D');
mustHtml(/if \(mySid && me\.alive\)/,'dead local snake still enters 3D snapshot');
mustHtml(/if\(me\.alive\)drawSnake/,'dead local snake still renders in 2D');
mustHtml(/Spread pellets across the \*entire\* body path/,'full-body pellet conversion missing');
mustWorker(/prevScore && prevScore\.alive !== false && incomingAlive === false/,'worker death transition conversion missing');
mustWorker(/this\.st\.players\[victimSid\]\.alive = false/,'worker kill does not remove victim snapshot');
mustRoom(/hadScore && prev\.alive !== false && snap\.alive === false/,'GameRoom death transition conversion missing');
mustRoom(/this\.st\.players\[victimSid\]\.alive = false/,'GameRoom kill does not remove victim snapshot');

// Pure model: resampling a long 600-sample body to 160 points must cover both ends
// and keep gap bounded, unlike the old 42-bead truncation/skip behavior.
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function resampleBodyPath(body, desiredCount){
 const pts=body.filter(p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)));
 if(pts.length<=1)return pts.map(p=>({x:Number(p.x),y:Number(p.y)}));
 const count=Math.max(2,Math.min(240,Math.floor(Number(desiredCount)||pts.length)));
 const seg=[];let total=0;
 for(let i=1;i<pts.length;i++){const ax=+pts[i-1].x,ay=+pts[i-1].y,bx=+pts[i].x,by=+pts[i].y;const len=Math.hypot(bx-ax,by-ay);seg.push({ax,ay,bx,by,len,start:total});total+=len}
 const out=[];let si=0;
 for(let n=0;n<count;n++){const target=(n/(count-1))*total;while(si<seg.length-1&&target>seg[si].start+seg[si].len)si++;const q=seg[si];const t=q.len>0?clamp((target-q.start)/q.len,0,1):0;out.push({x:q.ax+(q.bx-q.ax)*t,y:q.ay+(q.by-q.ay)*t})}
 return out;
}
const body=Array.from({length:600},(_,i)=>({x:i*6,y:Math.sin(i/20)*10}));
const sampled=resampleBodyPath(body,160);
if(sampled.length!==160)throw new Error('resample count wrong');
if(Math.abs(sampled[0].x-body[0].x)>1e-6 || Math.abs(sampled.at(-1).x-body.at(-1).x)>1e-6)throw new Error('resample does not cover full body');
let maxGap=0;for(let i=1;i<sampled.length;i++)maxGap=Math.max(maxGap,Math.hypot(sampled[i].x-sampled[i-1].x,sampled[i].y-sampled[i-1].y));
if(maxGap>24)throw new Error('resampled body gap too large: '+maxGap);
console.log('SNAKETAIL_VISUAL_DEATH_REGRESSION_OK maxGap='+maxGap.toFixed(2));
