const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../js/chat/room-games.js','utf8');
const css=fs.readFileSync(__dirname+'/../css/features/room-games-plus.css','utf8');
const context={console,TextEncoder,TextDecoder,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(Date.now()+2000),performance:{now:()=>0},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),MiniTalk:{Chat:{},UI:{Dom:null},Store:{get:()=>({})}},crypto:require('crypto').webcrypto,navigator:{userAgent:''},window:{},document:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
context.MiniTalk.UI.Dom=()=>({el:()=>({})});vm.createContext(context);vm.runInContext(src,context);const G=context.MiniTalk.Chat.RoomGames;
for(let seed=1;seed<=50;seed++){
  const game={seed,participants:[{nickname:'A'},{nickname:'B'}],results:['당첨','꽝']};
  const data=G.ladderData(game),trace=G.ladderTrace(game,0);
  assert(data.rungs.length>=5,`2-player ladder too sparse seed=${seed} rungs=${data.rungs.length}`);
  assert(trace.points.length>data.rows,'trace must include horizontal branch points');
  assert(trace.endIndex===data.mapping[0],'trace destination must match generated mapping');
}
assert(src.includes('preserveAspectRatio","xMidYMid meet'),'ladder geometry must preserve aspect ratio');
assert(src.includes('animateLadderPath(path,marker'),'runner must animate along the actual path');
assert(src.includes('전체 경로 순서대로 보기'),'sequential all-results playback missing');
assert(css.includes('.ladder-runner')&&css.includes('min-height:390px'),'vertical ladder runner styling missing');
assert(src.includes('function chessPieceSvg(piece)')&&css.includes('.chess-piece-svg'),'vector chess piece rendering missing');
console.log('CHAT_ROOM_LADDER_VISUAL_FLOW_OK seeds=50');
