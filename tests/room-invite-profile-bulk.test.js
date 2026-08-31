const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const chats=fs.readFileSync(path.join(root,'js/features/chats.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(chats.includes('avatar:avatar||previous.avatar||""'),'invite candidate profile avatar can be erased by presence data');
ok(chats.includes('text:"전체 선택"'),'invite dialog bulk select missing');
ok(chats.includes('text:"선택 해제"'),'invite dialog clear selection missing');
ok(chats.includes('candidates.forEach(person=>selected.add(person.user_id))'),'bulk select does not select invite candidates');
ok(chats.includes('selected.clear();renderCandidates(search.value)'),'bulk clear does not clear invite candidates');
ok(chats.includes('avatar.replaceWith(D.el("span"'),'broken profile image fallback missing');
ok(html.includes('js/features/chats.js?v=64.5.25'),'invite patch cache version stale');
console.log('ROOM_INVITE_PROFILE_BULK_OK');
