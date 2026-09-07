import fs from 'node:fs';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const checks=[
 ['shared shot resolver exists', /function resolveActionShot\(t,shot,face\)/],
 ['quick use resolves defaults before preview', /const frontItem=.*effectiveShot=held\?resolveActionShot\(held,shot,me\.face\|\|1\):null;input\.useSeq/s],
 ['input shot values set before preview', /if\(effectiveShot\)\{input\.shotAngleDeg=effectiveShot\.angleDeg;input\.shotPower=effectiveShot\.power;input\.shotCharged=!!effectiveShot\.charged\}.*previewGuestItemUse\(me,held,now,effectiveShot\)/s],
 ['packet reuses same input values', /const packet=\{useSeq:input\.useSeq>>>0,shotAngleDeg:Number\(input\.shotAngleDeg\)\|\|0,shotPower:Number\(input\.shotPower\)\|\|0,shotCharged:!!input\.shotCharged\}/],
 ['old zero-after-preview branch removed', !src.includes("input.shotAngleDeg=packet.shotAngleDeg=shot.angleDeg")],
];
let ok=true; for(const [name,c] of checks){const pass=typeof c==='boolean'?c:c.test(src); console.log(`${pass?'PASS':'FAIL'} ${name}`); if(!pass)ok=false;} if(!ok)process.exit(1);
