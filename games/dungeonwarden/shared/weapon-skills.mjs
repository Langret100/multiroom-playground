import {WEAPONS} from './catalog.mjs';
export function weaponSkill(item){
 const w=WEAPONS[item?.type];if(!w)return null;
 if((item.tier??0)<2){const kind=w.special;return {kind,name:({throw:'투척',double:'연속공격',push:'밀치기',bleed:'출혈공격',backstep:'백스텝',slam:'내려찍기',spin:'휠윈드',pulse:'마력 파동'})[kind]||w.name+' 특수',cool:kind==='spin'?5:kind==='pulse'?5:w.cool,cast:kind==='spin'?0:(w.cast||.12)};}
 const shape=item.visual?.shape||item.appearance;
 let kind=shape==='giant_baguette'?'breadline':shape==='lollipop'?'candyburst':shape==='frying_pan'?'panclang':item.appearance==='clock_hand'?'clockwave':null;
 kind??=({dagger:'starfan',sword:'bladewave',axe:'crescent',mace:'resonance',greatsword:'bladewave',hammer:item.tier===3?'cometfall':'earthline',bow:item.tier===3?'phoenixfan':'thornfan',heal:'moonheal',healbolt:'shelter',poison:'inkcloud',thunder:'stormchain',fireball:'firefan',vines:'vines',lightning:'forklightning',meteor:'meteor',acid:'acid'})[item.type]||w.special;
 const names={breadline:'바게트 대지행진',candyburst:'사탕꽃 폭발',panclang:'야영지의 종소리',clockwave:'멈춘 시간',starfan:'달무리 별칼',bladewave:'검기 방출',crescent:'초승달 쌍날',resonance:'공명 충격',cometfall:'운석 삼연격',earthline:'대지 균열',phoenixfan:'불사조 비행',thornfan:'가시비',moonheal:'월광 치유진',shelter:'불사조의 안식',inkcloud:'먹빛 봉인',stormchain:'천둥 삼중주',firefan:'마도서 화염장',vines:'덩굴 소용돌이',forklightning:'천구 번개'};
 return {kind,name:names[kind]||w.name+' 특수',cool:kind==='breadline'?8:kind==='bladewave'?6:w.cool,cast:['breadline','cometfall'].includes(kind)?.3:.12};
}

export const SKILL_DETAILS={breadline:'앞으로 1걸음 간격으로 빵 5개가 솟아오릅니다. 벽에서 멈춥니다.',spin:'누르는 동안 이동하며 회전 공격. 최대 2초, 놓으면 중단.',bladewave:'9걸음 관통 검기를 발사합니다.',clockwave:'7걸음 관통 장침. 맞은 적을 1초 정지시킵니다.',starfan:'달빛 칼날 5개를 부채꼴로 발사합니다.',crescent:'8걸음 관통 초승달 두 개를 발사합니다.',thornfan:'가시 화살 3발. 적을 1초 묶습니다.',phoenixfan:'불사조 화살 5발. 적에게 3초 화상을 남깁니다.',firefan:'폭발하는 화염구 3발을 펼칩니다.',panclang:'주변 3걸음에 금속 공명. 밀치기와 짧은 기절.',candyburst:'앞쪽 세 곳에 사탕꽃이 터져 짧게 기절시킵니다.',cometfall:'조준 지점에 운석 3개가 순차적으로 떨어집니다.',moonheal:'주변 5걸음의 아군을 치유하고 2초간 치유진을 남깁니다.',shelter:'주변 아군 치유와 2초 피해 면역.',inkcloud:'조준한 곳에 먹빛 독안개 세 곳을 펼칩니다.',stormchain:'세 곳에 시간차 벼락과 짧은 기절.',forklightning:'세 갈래 관통 번개를 발사합니다.',pulse:'주변 2걸음에 마력 파동.',throw:'단검을 던집니다. 떨어진 단검은 회수할 수 있습니다.',double:'가까운 적에게 두 번 공격합니다.',push:'가까운 적을 밀쳐 냅니다.',bleed:'근거리 공격으로 출혈을 남깁니다.',backstep:'뒤로 2걸음 물러납니다.',slam:'앞을 내려찍어 잠시 기절시킵니다.',vines:'앞쪽 덩굴이 적을 모으고 묶습니다.'};
