import fs from 'node:fs';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const checks=[
 ['separate local predicted dash clock', /localPredictedDashUntil/],
 ['movement uses effective one-shot dash', /effectiveDashUntil=Math\.max\(Number\(p\.dashUntil\)\|\|0,localDashUntil\)/],
 ['preview does not restart authoritative dashUntil', /if\(t==='dash'\)\{p\.localPredictedDashUntil=now\+430/],
 ['same use ack blocks authoritative dash restart', /samePredictedUse&&p\.localPredictedItem==='dash'\)\{p\.dashUntil=0\}/],
 ['predicted projectile collection exists', /predictedProjectiles:\[\]/],
 ['projectile preview updates before host state', /function updatePredictedProjectiles\(dt\)/],
 ['chargeable use previews projectile instantly', /addPredictedProjectile\(p,t,aim,seq,now\)/],
 ['render includes predicted and authoritative projectile', /\[\.\.\.game\.projectiles,\.\.\.game\.predictedProjectiles\]/],
 ['host remains sole item effect authority', /function hostStep\(dt\)[\s\S]*useItem\(p\)/],
];
let fail=0;
for(const [name,re] of checks){const ok=re.test(src); console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) fail++;}
if(fail) process.exit(1);
