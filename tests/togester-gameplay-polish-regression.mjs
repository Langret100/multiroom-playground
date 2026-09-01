import fs from 'node:fs';
const html=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('const GRAVITY = 0.18 * PHYS_SCALE'),'gravity polish missing');
ok(html.includes('const MAX_FALL_SPEED = 4.40 * PHYS_SCALE'),'fall-speed polish missing');
ok(html.includes('const MOVE_MAX_SPEED = 2.40 * PHYS_SCALE'),'move-speed polish missing');
ok(html.includes('const JUMP_VELOCITY = -6.40 * PHYS_SCALE'),'jump polish missing');
ok(html.includes('const JUMP_HOLD_MAX_MS = 250'),'jump hold polish missing');
ok(html.includes('boxJumpGraceUntil: 0') && html.includes('boxJumpGraceUntil = now + 150'),'box jump grace missing');
ok(html.includes("performance.now() < (player.boxJumpGraceUntil || 0)"),'box jump resolver guard missing');
ok(html.includes("if (lv <= 3) return ['stairs','stairs']") && html.includes("return [pick(['relay','split'])"),'readable co-op sequence missing');
console.log('TOGESTER_GAMEPLAY_POLISH_REGRESSION_OK');
