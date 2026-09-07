import fs from 'node:fs';
const src = fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url), 'utf8');
const checks = [
  ['stable projectile identity helper', /function useProjectileId\(ownerSid,useSeq,type\)/],
  ['host projectile carries useSeq id', /id:useProjectileId\(p\.sid,useSeq,'rocket'\),useSeq/],
  ['serialized projectile keeps id and useSeq', /projectiles=game\.projectiles\.map\(pr=>\(\{id:pr\.id\|\|null,useSeq:Number\(pr\.useSeq\)\|\|0/],
  ['predicted projectile uses same stable id', /pr\.id=useProjectileId\(p\.sid,seq,t\);pr\.useSeq=seq>>>0/],
  ['ack no longer deletes predicted projectile', /pr\._acked=true/],
  ['ack does not filter predicted projectile immediately', /game\.predictedProjectiles=game\.predictedProjectiles\.filter\(pr=>!\(String\(pr\.owner\).*useAck\)\)/, true],
  ['authoritative projectile adopts predicted object', /predictedById=new Map[\s\S]*adoptedPredictedIds\.add\(pid\)/],
  ['adopted projectile removed from prediction list by id', /adoptedPredictedIds\.size\)game\.predictedProjectiles=game\.predictedProjectiles\.filter/],
  ['adoption blends instead of respawning', /_blendFromX=shown\.x[\s\S]*_blendStartedAt=recvPerf/],
  ['same local action suppression is sequence based not timer based', /handledOwnUse=localMe&&useAck!==0&&useAck===Number\(p\.localVisualHandledUseSeq\|\|0\);/],
  ['pending use cannot create new sequence before ack', /localUsePendingSeq\|\|0\)!==0&&Number\(me\.lastAuthoritativeUseAck\|\|0\)!==Number\(me\.localUsePendingSeq\|\|0\)\)\{sendPlayerState/],
  ['impact event can retire unmatched predicted projectile', /ev\.impact&&ev\.projectileId/],
];
let fail = 0;
for (const [name, re, mustNot=false] of checks) {
  const hit = re.test(src);
  const ok = mustNot ? !hit : hit;
  console.log(`${ok?'PASS':'FAIL'} ${name}`);
  if (!ok) fail++;
}
if (fail) process.exit(1);
