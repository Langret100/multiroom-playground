export function equipmentTrait(item){
 if(!item)return null;const id=item.appearance||item.designId||'',p=item.visual?.profile;
 if(item.type==='shield'){
  if(id.includes('phoenix'))return {kind:'flameguard',name:'불사조 반격',detail:'정면 방어에 성공하면 공격자에게 화염 유도탄을 되돌려 보냅니다. 재사용 2초.'};
  if(id.includes('crystal')||id.includes('scale'))return {kind:'frostguard',name:'빙결 반격',detail:'정면 방어에 성공하면 얼음 파편이 터져 공격자를 2초 늦춥니다. 재사용 2초.'};
  if(id.includes('moon')||id.includes('mirror')||id.includes('rune'))return {kind:'mirrorguard',name:'거울 유도탄',detail:'정면 방어에 성공하면 빛의 유도탄으로 반격합니다. 재사용 2초.'};
  if(id.includes('rose')||id.includes('tree')||id.includes('druid'))return {kind:'rootguard',name:'덩굴 반격',detail:'정면 방어에 성공하면 공격자를 덩굴로 0.6초 묶습니다. 재사용 2초.'};
  return {kind:'steelguard',name:'방패 방어',detail:'정면으로 막으면 방패를 들고 불꽃 튀는 금속 충돌을 보여 줍니다.'};
 }
 if(item.kind==='armor'&&item.tier>=2){
  if(id.includes('phoenix')||id.includes('storm'))return {kind:'flamewake',name:'화염 발자국',detail:'이동할 때 불길을 남깁니다. 불길에 닿은 적에게 피해와 화상을 줍니다.'};
  if(id.includes('crystal')||id.includes('scale'))return {kind:'frostarmor',name:'서리 갑옷',detail:'피격 시 주변 3걸음에 얼음 파편이 터지고 적을 2초 늦춥니다. 재사용 4초.'};
  if(id.includes('royal')||id.includes('wing')||p==='wing')return {kind:'echoarmor',name:'수호자의 복제 무기',detail:'장착한 무기 3개가 주변에 떠 있습니다. 기본 공격 시 순차적으로 적에게 날아갑니다. 재사용 3초.'};
  if(['robe','cloak'].includes(item.visual?.shape))return {kind:'wisparmor',name:'달빛 추적구',detail:'주변의 빛 구체가 가까운 적을 찾아 날아갑니다. 사거리 8걸음, 재사용 2초.'};
 }
 if(item.kind==='main'){
  if(id==='ritual_knife')return {kind:'orbitweapon',name:'복제 의식검',detail:'특수 공격으로 같은 의식검 5개가 떠오른 뒤 적을 추적하며 날아갑니다.'};
  if(id==='moon_axe')return {kind:'frostweapon',name:'서리 쌍날',detail:'특수 공격의 얼음 초승달 두 개가 관통하며 적을 2초 늦춥니다.'};
  if(id==='moon_staff_thunder')return {kind:'homingweapon',name:'추적 천둥구',detail:'기본 공격의 천둥 구체가 가까운 적 쪽으로 방향을 바꿉니다.'};
  if(id==='astral_staff_lightning')return {kind:'beamweapon',name:'천구의 빔',detail:'특수 공격으로 세 갈래 번개 빔을 순간적으로 관통시킵니다.'};
 }
 return null;
}
