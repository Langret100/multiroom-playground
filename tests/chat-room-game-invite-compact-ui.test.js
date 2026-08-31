const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'js/chat/room-games.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/room-games-plus.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(js.includes('room-game-invite-compact'), 'compact invitation class missing');
ok(js.includes('text:gameLabel'), 'game label missing');
ok(js.includes('text:`${people.length}/${Number(g.maxPlayers)||12}명`'), 'current/max participant display missing');
ok(js.includes('text:"참가"'), 'join button missing');
for(const noisy of ['수락 순서 우선','초대 ${(g.invited||[]).length}명','room-game-invite-people']) ok(!js.slice(js.indexOf('function inviteCard'),js.indexOf('const keyName')).includes(noisy),`noisy invite content remains: ${noisy}`);
ok(css.includes('width:min(244px,100%)'), 'compact width guard missing');
ok(css.includes('max-width:100%'), 'max width guard missing');
ok(css.includes('overflow:hidden'), 'overflow guard missing');
ok(html.includes('room-games-plus.css?v=7'),'css cache version not bumped');
ok(html.includes('room-games.js?v=26'),'js cache version not bumped');
console.log('CHAT_ROOM_GAME_INVITE_COMPACT_UI_OK');
