const fs=require('fs'),assert=require('assert');
const games=fs.readFileSync('js/chat/room-games.js','utf8');
const rt=fs.readFileSync('js/adapters/realtime.js','utf8');
assert(!games.includes('roomSubscriptions:new Map()'),'popup-specific subscription registry must not be added');
assert(!games.includes('ensureDesktopGameSubscription'),'popup-specific subscription lifecycle must not be added');
assert(!rt.includes('function subscribeGameMessages('),'dedicated game subscription API must not be added');
console.log('CHAT_ROOM_GAME_NO_DEDICATED_SUBSCRIPTION_OK');
