import assert from 'node:assert/strict';
import fs from 'node:fs';

const HTTP = process.env.SK_HTTP || 'http://127.0.0.1:3000';
const WS = HTTP.replace(/^http/, 'ws');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const source = fs.readFileSync(new URL('../games/suhaktokki/game.js', import.meta.url), 'utf8');
assert.match(source, /teacherCaught\s*=\s*ex\.role\s*===\s*'teacher'/, 'teacher ejection must be detected at vote resolution');
assert.match(source, /hostFinishMatch\('crew',\s*'teacher_caught'\)/, 'teacher capture must finish with crew victory');
assert.match(source, /const localWon\s*=.*meRole/, 'result overlay must calculate a local win/loss verdict');
assert.match(source, /function hostFinishMatch[\s\S]*?closeScene\(\)/, 'the ejection modal must close before the result overlay');
assert.match(source, /G\.phase === 'meeting'\s*&&\s*Number\(G\.host\.meetingEndsAt \|\| 0\) > 0/, 'meeting resolution must reject a zero/stale deadline');
assert.match(source, /payload\.teacherCaught[\s\S]*?amTeacher \? '패배' : '승리!'/, 'teacher-caught scene must show a per-player verdict');
assert.doesNotMatch(source.slice(source.indexOf('function scheduleMatchEndReturn'), source.indexOf('function resetMatchEndReturn')), /broadcast\s*\([^\n]*hostExit/, 'normal match end must not masquerade as host exit');

const created = await fetch(`${HTTP}/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'SuhakTokki smoke', mode: 'suhaktokki', maxPlayers: 8 })
}).then(r => r.json());
assert.ok(created.roomId, 'room creation failed');

function makeClient(uid, nick) {
  const ws = new WebSocket(`${WS}/ws/room/${encodeURIComponent(created.roomId)}`);
  const log = [];
  ws.addEventListener('message', e => { try { log.push(JSON.parse(e.data)); } catch {} });
  return { uid, nick, ws, log, send: (t, d = {}) => ws.send(JSON.stringify({ t, d })) };
}
async function open(c) {
  if (c.ws.readyState === 1) return;
  await new Promise((resolve, reject) => {
    c.ws.addEventListener('open', resolve, { once: true });
    c.ws.addEventListener('error', reject, { once: true });
  });
}
async function waitMsg(c, type, pred = () => true, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const hit = c.log.find(m => m.t === type && pred(m.d || {}));
    if (hit) return hit.d;
    await delay(20);
  }
  throw new Error(`${c.uid} timeout ${type}; got ${c.log.map(x => x.t).join(',')}`);
}

const clients = ['sk-a', 'sk-b', 'sk-c', 'sk-d'].map((uid, i) => makeClient(uid, `토끼${i + 1}`));
await Promise.all(clients.map(open));
for (const c of clients) c.send('hello_room', { uid: c.uid, nick: c.nick });
await Promise.all(clients.map(c => waitMsg(c, 'hello_ok')));
for (const c of clients) c.send('ready', { v: true });
await delay(120);
clients[0].send('start', {});

const starts = await Promise.all(clients.map(c => waitMsg(c, 'started', d => d.mode === 'suhaktokki')));
for (const s of starts.slice(1)) assert.deepEqual(s.startPayload, starts[0].startPayload, 'all clients must share one start payload');
const start = starts[0].startPayload;
assert.equal(start.practice, false, 'four players must start competitive mode');
assert.equal(start.roster.length, 4);
assert.ok(start.teacherSid && start.roster.some(p => p.sid === start.teacherSid), 'one roster player must be the teacher');

// Meeting/vote packets must reach every peer with the original payload.
clients[1].send('sk_msg', { msg: { t: 'vote', playerId: 2, target: 1, marker: 'teacher-vote-test' } });
const relayed = await waitMsg(clients[2], 'sk_msg', d => d.msg?.marker === 'teacher-vote-test');
assert.equal(relayed.msg.t, 'vote');

// A guest cannot terminate the shared room.
clients[2].send('sk_over', { reason: 'match_end' });
await delay(450);
assert.equal(clients.some(c => c.log.some(m => m.t === 'backToRoom')), false, 'non-host sk_over must be ignored');

// The authoritative host ends it once; everyone returns and ready flags reset.
clients[0].send('sk_over', { reason: 'teacher_caught' });
await Promise.all(clients.map(c => waitMsg(c, 'backToRoom')));
const lobby = await waitMsg(clients[3], 'room_state', d => d.meta?.phase === 'lobby');
assert.ok(lobby.players.every(p => p.ready === false), 'ready flags must reset after match end');

for (const c of clients) c.ws.close();
console.log(JSON.stringify({
  ok: true,
  roomId: created.roomId,
  teacherSid: start.teacherSid,
  checks: ['four-player competitive start', 'shared teacher assignment', 'vote relay', 'host-only end', 'lobby reset', 'teacher-caught code path', 'per-player result']
}));
await delay(50);
process.exit(0);
