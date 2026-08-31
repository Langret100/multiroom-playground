const fs=require('fs'),vm=require('vm'),assert=require('assert'),webcrypto=require('crypto').webcrypto;
let source=fs.readFileSync(__dirname+'/../js/chat/room-games.js','utf8');
const users={};for(let i=1;i<=14;i++)users['u'+i]={user_id:'u'+i,nickname:'참가자'+i};
let current=users.u1,seq=0;const messages=[],storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const sandbox={
  MiniTalk:{Chat:{},Store:{get:k=>k==='user'?current:(k==='profiles'?{}:(k==='rooms'?{}:{}))},UI:{Dom:{doc:()=>({defaultView:{}})},Shell:{toast:()=>{}}},Realtime:{},MobileImmersive:{isMobile:()=>false}},
  TextEncoder,TextDecoder,crypto:webcrypto,localStorage,document:{querySelectorAll:()=>[]},navigator:{userAgent:'Node'},CSS:{escape:s=>s},
  btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:{AudioContext:null},console
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);const RG=sandbox.MiniTalk.Chat.RoomGames,Q=RG._qa;
function emitAs(uid,payload){const old=current;current=users[uid]||{user_id:uid,nickname:uid};const m={id:'m'+(++seq),roomId:'r1',user_id:uid,nickname:current.nickname,ts:Date.now()+seq,clientTs:Date.now()+seq,type:'game',text:payload.text||'[qa]',game:payload.game};messages.push(m);RG.ingest(m);current=old;return m}
sandbox.MiniTalk.Realtime.sendMessage=async(roomId,payload)=>emitAs(current.user_id,payload);
function latest(kind,id){return [...messages].reverse().find(m=>(!kind||m.game?.kind===kind)&&(!id||m.game?.id===id))}
async function accept(gameId,uid){const req=emitAs(uid,{game:{kind:'game-invite-accept',id:gameId,userId:uid,requestedAt:Date.now()}});current=users.u1;await Q.handleInviteAcceptAsHost(req)}
async function makePub(){const kp=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);return webcrypto.subtle.exportKey('jwk',kp.publicKey)}
(async()=>{
  // Over-invite ladder: host + first 11 accepts fill 12-player cap; later accept is rejected.
  const invited=Object.values(users).slice(1).map(p=>({user_id:p.user_id,nickname:p.nickname}));
  const inv={kind:'game-invite',id:'ladderInvite',gameType:'ladder',hostId:'u1',host:{...users.u1},invited,minPlayers:2,maxPlayers:12,resultLabels:['A','B']};
  emitAs('u1',{game:inv});
  for(let i=2;i<=12;i++)await accept(inv.id,'u'+i);
  const ladder=latest('ladder',inv.id);assert(ladder,'ladder must auto-start when first 12 total players fill capacity');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ladder.game.participants.map(p=>p.user_id))),Array.from({length:12},(_,i)=>'u'+(i+1)),'capacity must preserve first acceptance order and host');
  assert.strictEqual(ladder.game.results.length,12,'ladder result count must match accepted players');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ladder.game.results.slice(0,3))),['A','B','3번'],'ladder result labels must be normalized to final accepted count');
  const beforeLate=messages.length;await accept(inv.id,'u13');const late=Q.inviteSlotFor(inv.id,'u13');assert.strictEqual(late,null,'late accept after game finalization must not create a new slot');
  assert.strictEqual(messages.length,beforeLate+1,'late accept after finalization must not create a host response packet');
  assert(!ladder.game.participants.some(p=>p.user_id==='u13'),'late player must not enter full ladder');

  // All invitees respond below cap -> automatic start without a host start button.
  const inv2={kind:'game-invite',id:'smallLadder',gameType:'ladder',hostId:'u1',host:{...users.u1},invited:[users.u2,users.u3],minPlayers:2,maxPlayers:12,resultLabels:[]};emitAs('u1',{game:inv2});
  await accept(inv2.id,'u2');assert(!latest('ladder',inv2.id),'must wait while another invited player has not responded');
  await accept(inv2.id,'u3');assert(latest('ladder',inv2.id),'must auto-start when all invited players accept');

  // Host can start before every invitee responds once the game's valid minimum is present.
  const manual={kind:'game-invite',id:'manualLadder',gameType:'ladder',hostId:'u1',host:{...users.u1},invited:[users.u2,users.u3,users.u4],minPlayers:2,maxPlayers:12,resultLabels:['당첨','꽝'],openJoin:true};emitAs('u1',{game:manual});
  await accept(manual.id,'u2');assert(!latest('ladder',manual.id),'manual ladder must stay pending while unresponded invitees remain');
  current=users.u1;await Q.maybeFinalizeInviteAsHost('r1',manual.id,{force:true});const manualStarted=latest('ladder',manual.id);assert(manualStarted&&manualStarted.game.participants.length===2,'host manual start must use current accepted participants only');

  // A room member who was not invited can join before start.
  const open={kind:'game-invite',id:'openJoin',gameType:'ladder',hostId:'u1',host:{...users.u1},invited:[users.u2,users.u3],minPlayers:2,maxPlayers:12,resultLabels:[],openJoin:true};emitAs('u1',{game:open});
  await accept(open.id,'u5');const openSlot=Q.inviteSlotFor(open.id,'u5');assert(openSlot&&openSlot.game.status==='accepted','non-invited room member must be accepted while open join is active');
  assert(Q.inviteParticipants(open).some(p=>p.user_id==='u5'),'open join participant must be included in current roster');
  // A confirmed participant can cancel and then join again before the host starts.
  emitAs('u5',{game:{kind:'game-invite-leave',id:open.id,userId:'u5',leftAt:Date.now()}});
  assert(!Q.inviteParticipants(open).some(p=>p.user_id==='u5'),'cancelled participant must leave the current roster');
  assert.strictEqual(Q.inviteSlotFor(open.id,'u5'),null,'cancelled participant must not remain stuck in an accepted slot');
  await accept(open.id,'u5');
  assert(Q.inviteParticipants(open).some(p=>p.user_id==='u5'),'cancelled participant must be able to join again before start');

  // Mafia invitation -> all accepted -> lobby finalized -> all crypto keys ready -> phase auto-start.
  const minv={kind:'game-invite',id:'mafiaInvite',gameType:'mafia',hostId:'u1',host:{...users.u1},invited:[users.u2,users.u3,users.u4],minPlayers:4,maxPlayers:12,resultLabels:[]};emitAs('u1',{game:minv});
  await accept(minv.id,'u2');await accept(minv.id,'u3');await accept(minv.id,'u4');
  const lobby=latest('mafia-lobby',minv.id);assert(lobby,'mafia lobby must be created automatically after invite acceptance');assert.strictEqual(lobby.game.participants.length,4);
  // If someone leaves before role assignment and active players fall below four, the lobby must terminate instead of hanging forever.
  const preLeave={kind:'game-invite',id:'mafiaPreLeave',gameType:'mafia',hostId:'u1',host:{...users.u1},invited:[users.u2,users.u3,users.u4],minPlayers:4,maxPlayers:12,resultLabels:[]};emitAs('u1',{game:preLeave});
  await accept(preLeave.id,'u2');await accept(preLeave.id,'u3');await accept(preLeave.id,'u4');
  const preLobby=latest('mafia-lobby',preLeave.id);assert(preLobby,'pre-leave mafia lobby missing');
  const leaveMsg=emitAs('u4',{game:{kind:'mafia-leave',id:preLeave.id,userId:'u4'}});current=users.u1;await Q.maybeHandleLeaveAsHost(leaveMsg);
  const preEnd=latest('mafia-phase',preLeave.id);assert(preEnd&&preEnd.game.phase==='ended'&&preEnd.game.reason==='not-enough-before-start','pre-role mafia leave below four must terminate the game');
  for(const uid of ['u1','u2','u3','u4'])emitAs(uid,{game:{kind:'mafia-key',id:minv.id,userId:uid,publicKey:await makePub()}});
  current=users.u1;const started=await Q.maybeAutoStartMafia('r1',minv.id);assert.strictEqual(started,true,'mafia must auto-start after every accepted player crypto key is ready');
  const phase=latest('mafia-phase',minv.id);assert(phase&&phase.game.phase==='night','automatic mafia start must enter initial night phase');
  assert.strictEqual(messages.filter(m=>m.game?.kind==='mafia-role'&&m.game.id===minv.id).length,4,'each accepted mafia participant must receive one encrypted role');
  console.log('CHAT_ROOM_GAME_INVITE_FLOW_OK');
})().catch(e=>{console.error(e);process.exit(1)});
