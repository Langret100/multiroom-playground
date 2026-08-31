const fs=require('fs'),vm=require('vm'),assert=require('assert'),webcrypto=require('crypto').webcrypto;
let source=fs.readFileSync(__dirname+'/../js/chat/room-games.js','utf8');
const storage=new Map(),messages=[],users={};for(let i=1;i<=12;i++)users['u'+i]={user_id:'u'+i,nickname:'참가자'+i};
let current=users.u1,seq=0;
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const sandbox={
 MiniTalk:{Chat:{},Store:{get:k=>k==='user'?current:(k==='profiles'?{}:{})},UI:{Dom:{doc:()=>({defaultView:{}})},Shell:{toast:()=>{}}},Realtime:{},MobileImmersive:{isMobile:()=>false}},
 TextEncoder,TextDecoder,crypto:webcrypto,localStorage,document:{querySelectorAll:()=>[]},navigator:{userAgent:'Node'},CSS:{escape:s=>s},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},window:{confirm:()=>true,AudioContext:null},console
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const RG=sandbox.MiniTalk.Chat.RoomGames,Q=RG._qa;
function emitAs(uid,payload){const old=current;current=users[uid]||{user_id:uid,nickname:uid};const m={id:'m'+(++seq),roomId:'r1',user_id:uid,nickname:current.nickname,ts:Date.now(),clientTs:Date.now(),type:'game',text:payload.text||'[qa]',game:payload.game};messages.push(m);RG.ingest(m);current=old;return m}
sandbox.MiniTalk.Realtime.sendMessage=async(roomId,payload)=>emitAs(current.user_id,payload);
function latest(kind,id){return [...messages].reverse().find(m=>(!kind||m.game?.kind===kind)&&(!id||m.game?.id===id))}
async function makeKey(){const kp=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);return{pub:await webcrypto.subtle.exportKey('jwk',kp.publicKey),priv:await webcrypto.subtle.exportKey('jwk',kp.privateKey)}}
async function encryptFor(pub,value){const key=await webcrypto.subtle.importKey('jwk',pub,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);const b=await webcrypto.subtle.encrypt({name:'RSA-OAEP'},key,new TextEncoder().encode(JSON.stringify(value)));return Buffer.from(b).toString('base64')}
async function setupGame(n=12,id='g'+Date.now()){
 current=users.u1;const host=await makeKey(),participants=Object.values(users).slice(0,n),lobby={kind:'mafia-lobby',id,hostId:'u1',hostPublic:host.pub,participants};
 localStorage.setItem('chat.roomGames.mafiaHost.'+id,JSON.stringify({privateKey:host.priv,roles:null,living:participants.map(p=>p.user_id),round:1}));
 emitAs('u1',{game:lobby});
 for(const p of participants){const k=await makeKey();emitAs(p.user_id,{game:{kind:'mafia-key',id,userId:p.user_id,publicKey:k.pub}})}
 current=users.u1;await Q.assignRoles('r1',lobby);return lobby
}
async function night(lobby){
 const phase=latest('mafia-phase',lobby.id),host=await Q.hostPrivate(lobby.id),roles=host.roles,living=host.living;
 const mafia=living.filter(id=>roles[id]==='mafia'),police=living.filter(id=>roles[id]==='police'),doctor=living.filter(id=>roles[id]==='doctor');
 const ordinary=living.filter(id=>roles[id]==='citizen');const target=ordinary[0]||living.find(id=>!mafia.includes(id));
 for(const id of mafia)emitAs(id,{game:{kind:'mafia-night-action',id:lobby.id,round:phase.game.round,cipher:await encryptFor(lobby.hostPublic,{target,round:phase.game.round})}});
 for(const id of police)emitAs(id,{game:{kind:'mafia-police-action',id:lobby.id,round:phase.game.round,cipher:await encryptFor(lobby.hostPublic,{target:mafia[0],round:phase.game.round})}});
 for(const id of doctor){const save=living.find(x=>x!==target)||id;emitAs(id,{game:{kind:'mafia-doctor-action',id:lobby.id,round:phase.game.round,cipher:await encryptFor(lobby.hostPublic,{target:save,round:phase.game.round})}})}
 current=users.u1;await Q.resolveNight('r1',lobby,phase);return{target,mafia,police,doctor}
}
async function voteOut(lobby,target){const phase=latest('mafia-phase',lobby.id),host=await Q.hostPrivate(lobby.id);assert.strictEqual(phase.game.phase,'day');for(const id of host.living){let t=target;if(id===target)t=host.living.find(x=>x!==id&&x!==target)||host.living.find(x=>x!==id);emitAs(id,{game:{kind:'mafia-vote',id:lobby.id,round:phase.game.round,target:t}})}current=users.u1;await Q.resolveVote('r1',lobby,phase)}
(async()=>{
 const lobby=await setupGame(12,'full12');let host=await Q.hostPrivate('full12');const counts={mafia:0,police:0,doctor:0,citizen:0};Object.values(host.roles).forEach(r=>counts[r]++);assert.deepStrictEqual(counts,{mafia:2,police:1,doctor:1,citizen:8});
 console.log('roles',counts);
 const n1=await night(lobby);host=await Q.hostPrivate('full12');assert(!host.living.includes(n1.target),'night target should be eliminated');assert.strictEqual(latest('mafia-phase','full12').game.phase,'day');console.log('night1 ok, dead',n1.target,'living',host.living.length);
 let mafiaAlive=host.living.filter(id=>host.roles[id]==='mafia');await voteOut(lobby,mafiaAlive[0]);host=await Q.hostPrivate('full12');assert.strictEqual(host.living.filter(id=>host.roles[id]==='mafia').length,1);assert.strictEqual(latest('mafia-phase','full12').game.phase,'night');console.log('vote1 ok, mafia left 1');
 const n2=await night(lobby);host=await Q.hostPrivate('full12');assert.strictEqual(latest('mafia-phase','full12').game.phase,'day');mafiaAlive=host.living.filter(id=>host.roles[id]==='mafia');await voteOut(lobby,mafiaAlive[0]);const ended=latest('mafia-phase','full12');assert.strictEqual(ended.game.phase,'ended');assert.strictEqual(ended.game.winner,'citizen');console.log('full12 winner',ended.game.winner,'round',ended.game.round);
 // Leave: last mafia leaves => citizen win
 const lobby4=await setupGame(4,'leave4');host=await Q.hostPrivate('leave4');const mafia=host.living.find(id=>host.roles[id]==='mafia');const leaveMsg=emitAs(mafia,{game:{kind:'mafia-leave',id:'leave4',userId:mafia}});current=users.u1;await Q.maybeHandleLeaveAsHost(leaveMsg);const endLeave=latest('mafia-phase','leave4');assert.strictEqual(endLeave.game.phase,'ended');assert.strictEqual(endLeave.game.winner,'citizen');console.log('leave mafia =>',endLeave.game.winner);
 // Leave parity: remove citizens until mafia parity => mafia win
 const lobbyP=await setupGame(4,'parity4');host=await Q.hostPrivate('parity4');const civs=host.living.filter(id=>host.roles[id]!=='mafia'&&id!=='u1');for(let i=0;i<2;i++){const lm=emitAs(civs[i],{game:{kind:'mafia-leave',id:'parity4',userId:civs[i]}});current=users.u1;await Q.maybeHandleLeaveAsHost(lm);if(latest('mafia-phase','parity4')?.game.phase==='ended')break}const endP=latest('mafia-phase','parity4');assert.strictEqual(endP.game.phase,'ended');assert.strictEqual(endP.game.winner,'mafia');console.log('leave parity =>',endP.game.winner);
 console.log('PLAYTHROUGH_OK messages='+messages.length);
})().catch(e=>{console.error(e);process.exit(1)});
