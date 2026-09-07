import fs from 'node:fs';
const s=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const reg=fs.readFileSync(new URL('../js/games/registry.js', import.meta.url),'utf8');
const must=[
  'Local-only launch trail',
  'drawPixelStarRing(xx,yy,r',
  'hitAirborne=!p.onGround',
  'mag>7.2',
  'LOW_SPEC?5:8',
  'single-action-starfx-rootfix'
];
for(const x of must){if(!(s.includes(x)||reg.includes(x))) throw new Error('missing '+x)}
// The trail must be render-derived only: no new bridge/postMessage event names.
if(/meteorTrail|hitTrail/.test(s.match(/parent\.postMessage\([^\n]*/g)?.join('\n')||'')) throw new Error('trail leaked into network messages');
console.log('PASS starpaint-hit-meteor-trail-regression');
