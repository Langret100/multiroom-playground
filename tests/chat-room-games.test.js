const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname+'/..';
const source=fs.readFileSync(root+'/js/chat/room-games.js','utf8');
const realtime=fs.readFileSync(root+'/js/adapters/realtime.js','utf8');
const chats=fs.readFileSync(root+'/js/features/chats.js','utf8');
const index=fs.readFileSync(root+'/index.html','utf8');
const css=fs.readFileSync(root+'/css/app.css','utf8')+fs.readFileSync(root+'/css/features/room-games-plus.css','utf8');
assert(source.includes('kind:"ladder"'),'ladder payload missing');
assert(source.includes('typeof crypto.randomUUID==="function"')&&source.includes('crypto.getRandomValues(new Uint32Array(2))'),'randomUUID compatibility fallback missing');
assert(source.includes('kind:"mafia-lobby"'),'mafia lobby missing');
assert(source.includes('crypto.subtle.generateKey({name:"RSA-OAEP"'),'mafia role encryption missing');
assert(source.includes('kind:"game-invite"')&&source.includes('invited,maxPlayers,minPlayers'),'game invitation payload missing');
for(const role of ['mafia','citizen','police','doctor'])assert(source.includes(`assets/chat-games/role-${role}.png`),`role asset missing for ${role}`);
assert(source.includes('mafia-doctor-action')&&source.includes('mafia-police-action')&&source.includes('mafia-police-result'),'doctor/police flow missing');
assert(source.includes('memberPicker("마피아 게임 초대",invitees,{min:3,max:999'),'mafia invitation picker must allow over-inviting while keeping host auto-participation');
assert(source.includes('selected=new Set();'),'game invite picker must start with no invitees selected');
assert(source.includes('check.checked=false'),'game invite member checkboxes must start unchecked');
assert(source.includes('역할 뽑기')&&source.includes('mafia-role-draw'),'role draw UI missing');
assert(css.includes('@keyframes mafia-card-shuffle-left')&&css.includes('@keyframes mafia-card-deck-flip')&&css.includes('@keyframes mafia-role-reveal'),'role draw animation CSS missing');
assert(realtime.includes('game:payload.game&&typeof payload.game==="object"?payload.game:null'),'realtime adapter drops game metadata');
assert(chats.includes('addAction("♟","게임"'),'composer game action missing');
assert(chats.includes('MiniTalk.Chat.RoomGames?.renderMessage?.(message,message.roomId)'),'game renderer missing');
assert(index.includes('js/chat/room-games.js?v=26'),'room-games script not loaded');

assert(source.includes('svg.setAttribute("preserveAspectRatio","xMidYMid meet")'),'ladder must preserve its vertical geometry');
assert(source.includes('"data-phase-gate":"night"'),'host night control gate missing');
assert(source.includes('"data-phase-gate":"vote"'),'host vote control gate missing');

assert(source.includes('Math.max(12,Math.min(34,n*3+8))')&&source.includes('Math.max(5,n+3)'),'ladder rung-density guard missing');
assert(css.includes('.chat-room-game-window .room-game-member-list{display:grid;grid-template-columns:repeat(2'),'desktop member picker is not two-column');
for(const role of ['mafia','citizen','police','doctor'])assert(fs.existsSync(root+`/assets/chat-games/role-${role}.png`),`${role} role image file missing`);
// Mobile role art budget: actual cards render far below source size, so keep assets lean.
function pngSize(path){const b=fs.readFileSync(path);return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),bytes:b.length}}
for(const role of ['mafia','citizen','police','doctor']){
  const info=pngSize(root+`/assets/chat-games/role-${role}.png`);
  assert(info.width<=320&&info.height<=400,`${role} role art is oversized for mobile UI: ${info.width}x${info.height}`);
  assert(info.bytes<=40000,`${role} role art exceeds mobile byte budget: ${info.bytes}`);
}
assert(source.includes('playGameSfx("shuffle")')&&source.includes('playGameSfx("flip")')&&source.includes('playGameSfx("reveal")'),'role draw SFX cues missing');
assert(source.includes('playGameSfx("trace")')&&source.includes('playGameSfx("vote")')&&source.includes('playGameSfx("result")'),'game interaction SFX cues missing');
assert(source.includes('uniqueActors(mafiaVotes)<mafiaIds.length'),'night resolution does not wait for all mafia actions');
assert(source.includes('uniqueActors(doctorActions)<doctorIds.length'),'night resolution does not wait for doctor action');
assert(source.includes('uniqueActors(policeActions)<policeIds.length'),'night resolution does not wait for police action');
assert(source.includes('마피아끼리 선택한 대상이 달라요'),'split mafia target guard missing');
assert(source.includes('roleReveal:15000')&&source.includes('night:30000')&&source.includes('discussion:45000')&&source.includes('vote:30000'),'mafia timing policy missing');
assert(source.includes('kind:"mafia-leave"')&&source.includes('kind:"mafia-player-left"'),'mafia leave flow missing');
assert(source.includes('personal-win')&&source.includes('personal-lose'),'personal win/loss rendering missing');

assert(source.includes('kind:"game-invite-accept"')&&source.includes('kind:"game-invite-decline"')&&source.includes('kind:"game-invite-slot"'),'game invite accept/decline/slot protocol missing');
assert(source.includes('status=participants.length>=max?"full":"accepted"'),'first-accept capacity guard missing');
assert(source.includes('capacityReached=people.length>=max')&&source.includes('allResponded'),'automatic invite finalization missing');
assert(source.includes('maybeAutoStartMafia'),'mafia automatic start after accepted participants prepare keys is missing');
assert(source.includes('if(desktopGameMode()){const room=MiniTalk.Store.get("rooms")?.[roomId]'),'accepted desktop invite must open popup from user gesture');
assert(source.includes('인원 초과로 참가할 수 없어요.'),'late acceptance full-capacity feedback missing');
assert(css.includes('.room-game-invite-actions')&&css.includes('.room-game-invite-person'),'game invite UI CSS missing');
assert(source.includes('scheduleHostPhaseResolution'),'background phase timeout scheduler missing');
assert(source.includes('allowTimeout:true'),'timeout fallback resolution missing');
assert(css.includes('.mafia-timer')&&css.includes('.mafia-leave-button'),'timer/leave CSS missing');
assert(source.includes('function desktopGameMode()')&&source.includes('/CrOS|Whale/i'),'PC/WhaleBook desktop detection missing');
assert(source.includes('window.open("",`MoaruChatRoomGame_'),'desktop chat-game popup open missing');
assert(source.includes('width=${b.width},height=${b.height}')&&source.includes('enforceDesktopPopupBounds'),'desktop popup sizing enforcement missing');
assert(source.includes('room-game-open-button')&&source.includes('text:"열기"'),'compact desktop popup launch control missing');
assert(css.includes('.chat-room-game-window .room-game-card')&&css.includes('width:min(780px,calc(100vw - 48px))'),'large-window game card layout missing');
assert(css.includes('.chat-room-game-window .mafia-role-preview')&&css.includes('repeat(4,minmax(0,1fr))'),'desktop role grid missing');

let toneStarts=0;
class FakeParam{setValueAtTime(){} exponentialRampToValueAtTime(){}}
class FakeOsc{constructor(){this.frequency=new FakeParam();this.type='sine'}connect(){return this}start(){toneStarts++}stop(){}}
class FakeGain{constructor(){this.gain=new FakeParam()}connect(){return this}}
class FakeAudioContext{constructor(){this.currentTime=0;this.state='running';this.destination={}}createOscillator(){return new FakeOsc()}createGain(){return new FakeGain()}resume(){this.state='running';return Promise.resolve()}}
const fakeView={screen:{availLeft:0,availTop:0,availWidth:1366,availHeight:768},screenX:20,screenY:30,outerWidth:360,outerHeight:620};
const fakeNavigator={userAgent:'Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36 Chrome/151 Whale/4.30'};
const sandbox={MiniTalk:{Chat:{},Store:{get:()=>({})},UI:{Dom:{doc:()=>({defaultView:fakeView})}},Realtime:{}},TextEncoder,TextDecoder,crypto:require('crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{}},document:{querySelectorAll:()=>[]},navigator:fakeNavigator,CSS:{escape:s=>s},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),requestAnimationFrame:fn=>fn(),setTimeout:(fn)=>fn(),clearTimeout:()=>{},window:{AudioContext:FakeAudioContext}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const {ladderData,ladderTrace,roleCounts,buildRolesForParticipants,playGameSfx,phaseTiming,winnerFor,desktopGameMode,desktopPopupBounds}=sandbox.MiniTalk.Chat.RoomGames;
assert.strictEqual(desktopGameMode(),true,'CrOS/WhaleBook must use desktop popup mode');
fakeNavigator.userAgent='Mozilla/5.0 (Linux; Android 15; Mobile)';
assert.strictEqual(desktopGameMode(),false,'Android mobile must keep inline game UI');
fakeNavigator.userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151';
assert.strictEqual(desktopGameMode(),true,'Windows desktop must use popup game UI');
const popupBounds=desktopPopupBounds();assert(popupBounds.width>=760&&popupBounds.height>=620,'desktop game popup is not large enough');
for(const cue of ['shuffle','flip','reveal','trace','action','vote','result','start'])assert.strictEqual(playGameSfx(cue),true,`SFX cue ${cue} failed to initialize`);
assert(toneStarts>=12,`WebAudio SFX did not schedule enough tones: ${toneStarts}`);
for(let n=2;n<=12;n++)for(let seed=1;seed<=40;seed++){
  const participants=Array.from({length:n},(_,i)=>({user_id:String(i),nickname:'u'+i}));
  const a=ladderData({participants,seed}),b=ladderData({participants,seed});
  assert.deepStrictEqual(Array.from(a.mapping),Array.from(b.mapping),'same seed must be deterministic');
  assert.deepStrictEqual(Array.from(a.mapping).sort((x,y)=>x-y),Array.from({length:n},(_,i)=>i),'ladder mapping must be a permutation');
}
const trace=ladderTrace({participants:[{user_id:'1',nickname:'a'},{user_id:'2',nickname:'b'},{user_id:'3',nickname:'c'}],seed:123},0);
assert(trace&&Array.isArray(trace.points)&&trace.points.length>=3,'ladder trace points missing');
assert(Number.isInteger(trace.endIndex)&&trace.endIndex>=0&&trace.endIndex<3,'ladder trace end index invalid');
assert.deepStrictEqual(JSON.parse(JSON.stringify(roleCounts(4))),{mafia:1,police:0,doctor:0,citizen:3},'4-player roles incorrect');
assert.deepStrictEqual(JSON.parse(JSON.stringify(roleCounts(7))),{mafia:1,police:0,doctor:0,citizen:6},'7-player roles incorrect');
assert.deepStrictEqual(JSON.parse(JSON.stringify(roleCounts(8))),{mafia:2,police:1,doctor:0,citizen:5},'8-player roles incorrect');
assert.deepStrictEqual(JSON.parse(JSON.stringify(roleCounts(11))),{mafia:2,police:1,doctor:0,citizen:8},'11-player roles incorrect');
assert.deepStrictEqual(JSON.parse(JSON.stringify(roleCounts(12))),{mafia:2,police:1,doctor:1,citizen:8},'12-player roles incorrect');
const t0=100000;
assert.deepStrictEqual(JSON.parse(JSON.stringify(phaseTiming("night",{initial:true,now:t0}))),{startedAt:t0,actionStartsAt:t0+15000,deadline:t0+45000},'initial night timing incorrect');
assert.deepStrictEqual(JSON.parse(JSON.stringify(phaseTiming("night",{now:t0}))),{startedAt:t0,actionStartsAt:t0,deadline:t0+30000},'night timing incorrect');
assert.deepStrictEqual(JSON.parse(JSON.stringify(phaseTiming("day",{now:t0}))),{startedAt:t0,discussionEndsAt:t0+45000,deadline:t0+75000},'day timing incorrect');
assert.strictEqual(winnerFor({roles:{m:'mafia',c:'citizen'},living:['c']}),'citizen','last mafia leave must produce citizen win');
assert.strictEqual(winnerFor({roles:{m:'mafia',c:'citizen'},living:['m']}),'mafia','citizen-side leave causing parity must produce mafia win');
assert.strictEqual(winnerFor({roles:{m:'mafia',c1:'citizen',c2:'citizen'},living:['m','c1','c2']}),null,'game should continue when no victory condition is met');
for(const n of [4,8,12]){
  const participants=Array.from({length:n},(_,i)=>({user_id:String(i),nickname:'u'+i})),expected=roleCounts(n),signatures=new Set();
  for(let r=0;r<24;r++){
    const roles=buildRolesForParticipants(participants),counts={mafia:0,police:0,doctor:0,citizen:0};
    Object.values(roles).forEach(role=>counts[role]++);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(counts)),JSON.parse(JSON.stringify(expected)),`${n}-player role quantities changed`);
    signatures.add(participants.map(p=>roles[p.user_id]).join(','));
  }
  assert(signatures.size>1,`${n}-player roles are not randomized across participants`);
}
console.log('CHAT_ROOM_GAMES_OK');
