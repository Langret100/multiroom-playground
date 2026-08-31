const fs=require('fs'),vm=require('vm'),assert=require('assert');
let source=fs.readFileSync('js/chat/room-games.js','utf8');
assert(source.includes('function leaveActiveDesktopGame(roomId,gameId)'),'popup-close leave dispatcher missing');
assert(source.includes('reason:"popup-closed"'),'popup close reason missing');
assert(source.includes('winner:chessOther(mine.color)'),'closing active chess must award the other player');
assert(source.includes('kind:"mafia-leave"')&&source.includes('leaveMafiaWithoutPrompt'),'closing active mafia must emit leave');
assert(source.includes('reason:"host-popup-closed"'),'host closing pending invite must terminate invite');
assert(source.includes('win.addEventListener("pagehide",()=>finishDesktopPopupClose(win,closeToken)'),'native popup close hook missing');
assert(source.includes('setInterval(()=>{let closed=false;try{closed=!win||win.closed}'),'popup.closed fallback watcher missing');

const sent=[];let seq=0;const store={user:{user_id:'u1',nickname:'U1'},rooms:{r1:{id:'r1'}}};
const sandbox={MiniTalk:{Chat:{},Store:{get:k=>store[k]},UI:{Dom:{doc:()=>({defaultView:{screen:{availWidth:1366,availHeight:768}}})},Shell:{toast:()=>{}}},Realtime:{sendMessage:async(roomId,payload)=>{const saved={id:'s'+(++seq),roomId,user_id:store.user.user_id,nickname:'U1',...payload};sent.push(saved);return saved},removeGameMessages:async()=>{}}},TextEncoder,TextDecoder,crypto:require('crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},document:{querySelectorAll:()=>[]},navigator:{userAgent:'Mobile'},CSS:{escape:s=>s},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},window:{}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);const api=sandbox.MiniTalk.Chat.RoomGames;
const ingest=(id,kind,game)=>api.ingest({id,roomId:'r1',user_id:kind==='chess-start'?'u1':'u2',type:'game',game:{id:'g1',kind,...game}});
(async()=>{
  ingest('i1','game-invite',{gameType:'chess',hostId:'u1',host:{user_id:'u1',nickname:'U1'},invited:[{user_id:'u2',nickname:'U2'}],minPlayers:2,maxPlayers:2});
  ingest('s1','chess-start',{hostId:'u1',players:[{user_id:'u1',nickname:'U1',color:'w'},{user_id:'u2',nickname:'U2',color:'b'}],participants:[{user_id:'u1',nickname:'U1'},{user_id:'u2',nickname:'U2'}]});
  const left=await api._qa.leaveActiveDesktopGame('r1','g1');assert.strictEqual(left,true);const end=sent.find(m=>m.game?.kind==='chess-end');assert(end,'popup close did not end chess');assert.strictEqual(end.game.reason,'leave');assert.strictEqual(end.game.winner,'b');
  console.log('CHAT_ROOM_GAME_POPUP_CLOSE_LEAVE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
