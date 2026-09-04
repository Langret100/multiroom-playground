import { RoomDO } from '../cf-worker/src/index.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(v,m)=>{if(!v)throw new Error(m)};
class FakeSocket{constructor(){this.handlers={message:[]};this.sent=[];}addEventListener(t,fn){(this.handlers[t]??=[]).push(fn)}send(raw){this.sent.push(JSON.parse(raw))}close(){}serializeAttachment(){}deserializeAttachment(){return null}async emit(t,d={}){for(const fn of this.handlers.message||[])await fn({data:JSON.stringify({t,d})})}messages(t){return this.sent.filter(x=>x.t===t)}}
function make(mode){const r=new RoomDO({},{});r.meta={roomId:'x',title:'x',mode,maxPlayers:8,phase:'playing',status:'playing',ownerUserId:'A'};r._scheduleLobbyUpdate=()=>{};r._presenceSet=async()=>{};r._presenceClear=async()=>{};r.users.set('A',{nick:'Host',ready:false,seat:0,isHost:true});r.users.set('B',{nick:'Guest',ready:true,seat:1,isHost:false});const a=new FakeSocket(),b=new FakeSocket();r.sockets.set(a,'A');r.sockets.set(b,'B');r.userSockets.set('A',a);r.userSockets.set('B',b);r._wireSocket(a);r._wireSocket(b);return{r,a,b}}
// The final client only requires the long-standing tg_state aggregate and backToRoom reset.
{
 const {r,a,b}=make('soccer');
 await a.emit('tg_state',{state:{__soccerCompat:{kind:'state',hostSid:'A',snapshot:{phase:'quiz'}},__soccerPos:{x:100,y:200}}});
 await b.emit('tg_state',{state:{__soccerCompat:{kind:'submit',roundId:'r',score:2},__soccerPos:{x:120,y:220}}});
 await sleep(70);
 const snap=a.messages('tg_players').at(-1)?.d?.players||{};
 ok(snap.B?.__soccerPos?.x===120,'established aggregate relay did not carry soccer state');
 r._endAndBackToLobby(1);await sleep(8);
 ok(r.meta.phase==='lobby' && [...r.users.values()].every(u=>u.ready===false),'authoritative same-room reset failed');
}
console.log('ROOT_WORKER_FLOW_REGRESSION_OK');
