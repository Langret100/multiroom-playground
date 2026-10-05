import {writeFileSync} from 'node:fs';
import {createMatchItemCatalog,WEAPONS,AFFIX_NAMES} from './shared/catalog.mjs';
import {weaponSkill,SKILL_DETAILS} from './shared/weapon-skills.mjs';
const all=createMatchItemCatalog(42),names={main:'무기',helmet:'머리',armor:'몸통',boots:'신발',off:'보조',lantern:'랜턴'};
let out='# 고유 아이템 목록\n\n총 160종. 무기는 N 9 / R 9 / SR 12 / SSR 5종이며 나머지 다섯 부위는 각각 3 / 5 / 12 / 5종입니다. 무기군을 먼저 균등하게 선택하므로 단검이나 지팡이 외형 수가 드랍 비율을 늘리지 않습니다. 시드 42의 예시이며 능력치는 매 판 배정됩니다.\n\n';
for(const [kind,label] of Object.entries(names)){out+=`## ${label}\n\n| 등급 | 이름 | 계열 / 외형 | 능력치 범위 | 추가 효과 | 특수 공격 | 이야기 |\n|---|---|---|---|---|---|---|\n`;for(const i of all.filter(i=>i.kind===kind)){const skill=kind==='main'?weaponSkill(i):null,ranges=Object.entries(i.ranges).map(([k,v])=>`${k} ${v[0]}~${v[1]}`).join(', '),fx=i.affixes.map(a=>`${AFFIX_NAMES[a.key]||a.key} ${a.charges===null?Math.round(a.chance*100)+'%':a.maxCharges+'회'}`).join(', ');out+=`| ${['N','R','SR','SSR'][i.tier]} | ${i.name} | ${WEAPONS[i.type]?.name||label} / ${i.visual.shape} | ${ranges} | ${fx||'능력치 보너스'} | ${skill?skill.name+' ('+skill.cool+'초) '+(SKILL_DETAILS[skill.kind]||''):''} | ${i.story} |\n`;}out+='\n';}
writeFileSync(new URL('./ITEM-CATALOG.md',import.meta.url),out);
