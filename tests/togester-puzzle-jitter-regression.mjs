import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2] || process.cwd();
const p=path.join(root,'games/togester/index.html');
const s=fs.readFileSync(p,'utf8');
function ok(x,m){ if(!x) throw new Error(m); }
ok(s.includes('if (isAuthoritativeBoxSim()) return;'), 'host must ignore echoed authoritative box snapshots');
ok(s.includes('if (!isAuthoritativePuzzleSim()) applyPuzzleSnapshot(d);'), 'host must ignore echoed puzzle snapshots');
ok(s.includes('if (!isAuthoritativeBoxSim()) applyBoxSnapshot(d);'), 'host must ignore echoed tg_boxes snapshots');
ok(s.includes('function updateRemotePuzzleMotion(){'), 'remote puzzle interpolation missing');
ok(s.includes('lift._netTargetY = y;'), 'lift network target missing');
ok(s.includes('dst._netTargetX = src.x;') && s.includes('dst._netTargetY = src.y;'), 'box network targets missing');
ok(s.includes('if (!isAuthoritativePuzzleSim()) updateRemotePuzzleMotion();'), 'remote puzzle interpolation not called each frame');
console.log('TOGESTER_PUZZLE_JITTER_REGRESSION_OK');
