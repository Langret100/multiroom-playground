const fs=require('fs'),vm=require('vm'),assert=require('assert');
let source=fs.readFileSync(__dirname+'/../js/chat/room-games.js','utf8');
const sandbox={
  MiniTalk:{Chat:{},Store:{get:k=>k==='user'?{user_id:'me'}:k==='presence'?{}:k==='profiles'?{}:{}},UI:{Dom:{doc:()=>({defaultView:{}})},Shell:{toast:()=>{}}},Realtime:{},MobileImmersive:{isMobile:()=>false}},
  TextEncoder,TextDecoder,crypto:require('crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},document:{querySelectorAll:()=>[]},navigator:{userAgent:'Node'},CSS:{escape:s=>s},window:{AudioContext:null},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},requestAnimationFrame:fn=>fn(),console
};
vm.createContext(sandbox);vm.runInContext(source,sandbox);const RG=sandbox.MiniTalk.Chat.RoomGames;
const msg={id:'same-1',roomId:'r',user_id:'u1',game:{id:'g',kind:'mafia-key',userId:'u1'}};
assert.strictEqual(RG.ingest(msg),true,'first message should ingest');
assert.strictEqual(RG.ingest({...msg}),false,'same Firebase message id must not re-run side effects');
const members=RG._qa.membersFor({id:'r',members:{a:{user_id:'u1',nickname:'A'},sameId:{user_id:'u1',nickname:'A old'},legacyA:{user_id:'legacy-0-A',nickname:'A'},b:{user_id:'u2',nickname:'B'},sameNickReal:{user_id:'u3',nickname:'B'},legacyOnly:{user_id:'legacy-4-Old',nickname:'Old'},guest:{user_id:'guest-x',nickname:'guest'}}});
assert.deepStrictEqual(JSON.parse(JSON.stringify(members.map(x=>x.user_id))),['u1','u2','u3','legacy-4-Old'],'member picker must dedupe exact user ids, drop legacy shadows of real accounts, preserve real same-nickname accounts, and exclude guests');
assert.strictEqual(RG._qa.desktopRefreshKind('mafia-key'),false,'mafia key packet must not replace whole popup');
assert.strictEqual(RG._qa.desktopRefreshKind('mafia-role'),false,'private role packet must not replace whole popup');
assert.strictEqual(RG._qa.desktopRefreshKind('mafia-night-action'),false,'night action packet must not replace whole popup');
assert.strictEqual(RG._qa.desktopRefreshKind('mafia-vote'),false,'vote packet must not replace whole popup');
assert.strictEqual(RG._qa.desktopRefreshKind('mafia-phase'),true,'phase transition must refresh popup');
assert(/function enforceDesktopPopupBounds\(win\)\{const b=desktopPopupBounds\(\);try\{win\.resizeTo/.test(source),'popup bounds must be applied once');
assert(!/function enforceDesktopPopupBounds\(win\)[\s\S]{0,240}setTimeout\(apply/.test(source),'popup bounds must not be repeatedly forced');

assert(source.includes('panel.__mafiaOnReveal?.()'),'role reveal must trigger one targeted mafia screen refresh so role actions appear immediately');
assert(source.includes('latestRoom=await MiniTalk.Realtime.getRoom(id)||latestRoom'),'popup back button must resolve the currently active room instead of a stale initially-opened room');
assert(source.includes("localeCompare(String(b.id||''))"),'same-number chess moves must be ordered deterministically across clients');

const css=fs.readFileSync(__dirname+'/../css/features/room-games-plus.css','utf8');
assert(css.includes('.chat-room-game-desktop-stage>.room-game-card{width:100%;max-width:none'),'popup game card must fill available width');
assert(css.includes('min-height:calc(100dvh - 90px)'),'popup game card must fill available height');
console.log('CHAT_ROOM_GAMES_POPUP_STABILITY_DEDUPE_OK');
