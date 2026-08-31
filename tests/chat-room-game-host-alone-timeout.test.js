const fs=require('fs'),vm=require('vm'),assert=require('assert'),webcrypto=require('crypto').webcrypto;
const source=fs.readFileSync(__dirname+'/../js/chat/room-games.js','utf8');
const users={u1:{user_id:'u1',nickname:'방장'},u2:{user_id:'u2',nickname:'참가자'}};let current=users.u1,seq=0;const messages=[],storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const sandbox={MiniTalk:{Chat:{},Store:{get:k=>k==='user'?current:(k==='profiles'?{}:(k==='rooms'?{}:{}))},UI:{Dom:{doc:()=>({defaultView:{}})},Shell:{toast:()=>{}}},Realtime:{},MobileImmersive:{isMobile:()=>false}},TextEncoder,TextDecoder,crypto:webcrypto,localStorage,document:{querySelectorAll:()=>[]},navigator:{userAgent:'Node'},CSS:{escape:s=>s},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},window:{AudioContext:null},console};
vm.createContext(sandbox);vm.runInContext(source,sandbox);const RG=sandbox.MiniTalk.Chat.RoomGames,Q=RG._qa;
function emit(uid,game){const old=current;current=users[uid]||{user_id:uid,nickname:uid};const m={id:'m'+(++seq),roomId:'r1',user_id:uid,nickname:current.nickname,ts:1000+seq,clientTs:1000+seq,type:'game',text:'[qa]',game};messages.push(m);RG.ingest(m);current=old;return m}
sandbox.MiniTalk.Realtime.sendMessage=async(roomId,payload)=>emit(current.user_id,payload.game);
function latest(kind,id){return [...messages].reverse().find(m=>m.game?.kind===kind&&m.game?.id===id)}
(async()=>{
  assert.strictEqual(Q.INVITE_HOST_ALONE_TIMEOUT,10*60*1000,'host-alone timeout must be exactly 10 minutes');

  const lonely={kind:'game-invite',id:'lonely',gameType:'chess',hostId:'u1',host:users.u1,invited:[users.u2],minPlayers:2,maxPlayers:2,createdAt:1000,openJoin:true};emit('u1',lonely);
  current=users.u1;
  assert.strictEqual(await Q.expireHostAloneInviteAsHost('r1','lonely',{now:1000+Q.INVITE_HOST_ALONE_TIMEOUT-1}),false,'must not expire before 10 minutes');
  assert(!latest('game-invite-cancelled','lonely'),'premature cancellation must not be emitted');
  assert.strictEqual(await Q.expireHostAloneInviteAsHost('r1','lonely',{now:1000+Q.INVITE_HOST_ALONE_TIMEOUT}),true,'host-only invite must expire at 10 minutes');
  const cancelled=latest('game-invite-cancelled','lonely');assert(cancelled,'timeout cancellation packet missing');
  assert.strictEqual(cancelled.game.reason,'host-alone-timeout');assert.deepStrictEqual(JSON.parse(JSON.stringify(cancelled.game.participants.map(p=>p.user_id))),['u1']);

  const joined={...lonely,id:'joined',createdAt:2000};emit('u1',joined);emit('u1',{kind:'game-invite-slot',id:'joined',userId:'u2',nickname:'참가자',status:'accepted',acceptedAt:2500});
  assert.strictEqual(Q.inviteEverAccepted('joined'),true,'accepted participant history must be remembered');
  assert.strictEqual(await Q.expireHostAloneInviteAsHost('r1','joined',{now:2000+Q.INVITE_HOST_ALONE_TIMEOUT+1}),false,'joined invite must not be auto-cancelled');
  assert(!latest('game-invite-cancelled','joined'),'joined invite must remain active');

  const joinedLeft={...lonely,id:'joined-left',createdAt:3000};emit('u1',joinedLeft);emit('u1',{kind:'game-invite-slot',id:'joined-left',userId:'u2',nickname:'참가자',status:'accepted',acceptedAt:3500});emit('u2',{kind:'game-invite-leave',id:'joined-left',userId:'u2',leftAt:4000});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Q.inviteParticipants(joinedLeft).map(p=>p.user_id))),['u1'],'participant should be host-only after leave');
  assert.strictEqual(await Q.expireHostAloneInviteAsHost('r1','joined-left',{now:3000+Q.INVITE_HOST_ALONE_TIMEOUT+1}),false,'a game that had a confirmed participant must not be treated as never-joined');
  assert(!latest('game-invite-cancelled','joined-left'),'joined-then-left invite must not be cancelled by never-joined timer');

  console.log('CHAT_ROOM_GAME_HOST_ALONE_TIMEOUT_OK');
})().catch(e=>{console.error(e);process.exit(1)});
