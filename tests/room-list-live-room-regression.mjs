import fs from 'node:fs';
const s=fs.readFileSync(new URL('../cf-worker/src/index.js', import.meta.url),'utf8');
for (const needle of [
  'const ghostGraceMs = 45 * 1000',
  'safeId(p?.roomId || \'\') === roomId',
  'this._lastLobbyLeaseAt',
  'this._scheduleLobbyUpdate(0)',
  'if (t === "client_leave")',
  'const creationGraceMs = 10 * 60 * 1000'
]) {
  if (!s.includes(needle)) throw new Error('missing room-list safeguard: '+needle);
}
if (/if \(listedPlayers > 0 \|\| ageMs >= creationGraceMs\)\{\s*delete this\.rooms\[roomId\]/m.test(s)) {
  throw new Error('live room can still be deleted on first empty health result');
}
console.log('room-list live-room regression: ok');
