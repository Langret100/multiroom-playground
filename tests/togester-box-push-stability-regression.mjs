import fs from 'node:fs';
const html=fs.readFileSync(new URL('../games/togester/index.html', import.meta.url),'utf8');
function ok(v,m){ if(!v) throw new Error(m); }
ok(html.includes('const BOX_PUSH_SEND_INTERVAL_MS = 110'), 'guest push throttle missing');
ok(html.includes('const BOX_PUSH_LEASE_MS = 170'), 'host push lease missing');
ok(html.includes("bridgeSend('tg_box_impulse', { level: currentLevel, id, vx: dir * 3, pushLeaseMs: BOX_PUSH_LEASE_MS })"), 'stable impulse payload missing');
ok(html.includes('if (prev && prev.dir === dir && (now - prev.at) < BOX_PUSH_SEND_INTERVAL_MS) return false'), 'per-box/direction throttle missing');
ok(html.includes('box._remotePushUntil = performance.now() + lease'), 'host lease refresh missing');
ok(html.includes('box._remotePushVx = ivx < 0 ? -3 : 3'), 'host normalized push force missing');
ok(html.includes('box.vx = box._remotePushVx < 0 ? -3 : 3'), 'host continuous lease force missing');
ok(!html.includes("bridgeSend('tg_box_impulse', { level: currentLevel, id: String(box.id || ''), vx: 3"), 'old every-frame right impulse still present');
ok(!html.includes("bridgeSend('tg_box_impulse', { level: currentLevel, id: String(box.id || ''), vx: -3"), 'old every-frame left impulse still present');
console.log('TOGESTER_BOX_PUSH_STABILITY_REGRESSION_OK');
