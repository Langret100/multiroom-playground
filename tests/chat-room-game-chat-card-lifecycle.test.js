const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../js/chat/room-games.js','utf8');
const store={user:{user_id:'u1',nickname:'U1'}};
const sandbox={
  MiniTalk:{Chat:{},Store:{get:k=>store[k]},UI:{Dom:{doc:()=>({defaultView:{screen:{availWidth:1366,availHeight:768}}})}},Realtime:{}},
  TextEncoder,TextDecoder,crypto:require('crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document:{querySelectorAll:()=>[]},navigator:{userAgent:'Mozilla/5.0'},CSS:{escape:s=>s},
  btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  requestAnimationFrame:fn=>fn(0),setTimeout:()=>0,clearTimeout:()=>{},window:{}
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const api=sandbox.MiniTalk.Chat.RoomGames;
const m=(id,kind,extra={})=>({id,roomId:'r1',type:'game',game:{id:'g1',kind,...extra}});
const invite=m('i1','game-invite',{gameType:'mafia',hostId:'host',host:{user_id:'host'},invited:[],minPlayers:4,maxPlayers:12});
api.ingest(invite);assert.strictEqual(api.isInternal(invite),false,'pending invite must be the visible game card');
const lobby=m('l1','mafia-lobby',{hostId:'host',participants:[]});api.ingest(lobby);assert.strictEqual(api.isInternal(invite),true,'invite must collapse after game starts');assert.strictEqual(api.isInternal(lobby),false,'started game anchor must stay visible');
const night=m('p1','mafia-phase',{phase:'night',round:1,living:[]});api.ingest(night);assert.strictEqual(api.isInternal(night),true,'automatic mafia phase must not create a chat card');
const ended=m('p2','mafia-phase',{phase:'ended',round:1,living:[],winner:'none'});api.ingest(ended);assert.strictEqual(api.isInternal(ended),false,'terminal message must be visible');assert.strictEqual(api.isInternal(lobby),true,'old start card must collapse after ending');
assert(source.includes('room-game-ended-chat-card')&&source.includes('게임이 종료되었습니다.'),'compact ended card missing');
assert(source.includes('room-game-open-button')&&source.includes('text:"열기"'),'compact open button missing');
console.log('CHAT_ROOM_GAME_CHAT_CARD_LIFECYCLE_OK');
