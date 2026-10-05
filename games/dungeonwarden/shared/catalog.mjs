// Gameplay data is independent of sprites and transport. All distances are in steps.
export const RARITIES = ['N','R','SR','SSR'];
export const RARITY_COLORS = ['#9fa9b6','#edf2ff','#bb79ff','#ffd569'];
export const SLOTS = ['main','off','helmet','armor','boots'];
import {ITEM_POOLS,ITEM_DESIGNS} from './item-designs.mjs';
const armorCuts=new Map(ITEM_POOLS.armor.flat().map((d,i)=>[d.entry[0],i%5<2?'skirt':'straight']));
export const WEAPONS = {
  dagger: {name:'단검',range:3,delay:.32,damage:5,hands:1,special:'throw',cool:1.2},
  sword: {name:'롱소드',range:3.5,delay:.55,damage:9,hands:1,special:'double',cool:4},
  mace: {name:'메이스',range:3.5,delay:.65,damage:11,hands:1,special:'push',cool:5},
  axe: {name:'도끼',range:3.5,delay:.7,damage:12,hands:1,special:'bleed',cool:7},
  bow: {name:'활',range:27,delay:.8,damage:10,hands:2,special:'backstep',cool:4},
  hammer: {name:'양손망치',range:4.4,delay:.95,damage:18,hands:2,special:'slam',cool:3.5},
  greatsword: {name:'양손검',range:4.4,delay:.75,damage:14,hands:2,special:'spin',cool:2},
  meteor: {name:'운석 지팡이',range:8,delay:.65,damage:8,hands:2,special:'meteor',cool:12,cast:1.5},
  poison: {name:'독안개 지팡이',range:8,delay:.65,damage:8,hands:2,special:'poison',cool:10,cast:1},
  acid: {name:'산성비 지팡이',range:8,delay:.65,damage:8,hands:2,special:'acid',cool:11,cast:1.5},
  heal: {name:'치유 지팡이',range:6,delay:.8,damage:0,hands:2,special:'heal',cool:9,cast:1},
  healbolt: {name:'생명 지팡이',range:6,delay:.8,damage:0,hands:2,special:'healbolt',cool:10,cast:1},
  thunder: {name:'천둥 지팡이',range:8,delay:.65,damage:8,hands:2,special:'thunder',cool:12,cast:1.5},
  lightning: {name:'번개 지팡이',range:8,delay:.65,damage:8,hands:2,special:'lightning',cool:8,cast:1},
  fireball: {name:'화염 지팡이',range:8,delay:.65,damage:8,hands:2,special:'fireball',cool:9,cast:1.5},
  vines: {name:'덩굴 지팡이',range:8,delay:.65,damage:8,hands:2,special:'vines',cool:13,cast:1.5}
};
export const MONSTERS = {
  slime:{name:'슬라임',hp:45,damage:8,speed:2.1,range:1,cost:5},
  archer:{name:'해골 궁수',hp:40,damage:8,speed:2.8,range:10,cost:8},
  mage:{name:'불꽃 마법사',hp:38,damage:9,speed:2.5,range:8,cost:9},
  bombardier:{name:'폭탄 투척병',hp:55,damage:12,speed:2.3,range:7,cost:10},
  healer:{name:'도주하는 주술사',hp:45,damage:0,speed:3.7,range:7,cost:10},
  treasure:{name:'보물 고블린',hp:30,damage:0,speed:5.8,range:0,cost:0},
  skeleton:{name:'스켈레톤',hp:60,damage:10,speed:2.7,range:1.5,cost:7},
  goblin:{name:'고블린',hp:42,damage:9,speed:3.6,range:1,cost:6},
  bat:{name:'박쥐',hp:28,damage:6,speed:4.1,range:1,cost:5},
  ogre:{name:'오거',hp:105,damage:15,speed:1.8,range:2,cost:12},
  spectre:{name:'망령',hp:55,damage:9,speed:3,range:1.4,cost:9},
  spider:{name:'거미',hp:36,damage:7,speed:3.4,range:1,cost:6},
  golem:{name:'철갑 골렘',hp:340,damage:22,speed:1.5,range:2.2,cost:35,boss:true},
  lich:{name:'심연 리치',hp:240,damage:18,speed:1.9,range:7,cost:32,boss:true},
  dragon:{name:'화염 드레이크',hp:300,damage:24,speed:2,range:2.5,cost:38,boss:true}
};
export const AFFIXES = {
  main:['poison','burn','frost','lightning','meteor','multishot'],
  off:['autoblock','taunt'],
  helmet:['reset','restore','revenge','immune'],
  armor:['regen','stun','healburst','explosion'],
  boots:['blaze','luck','evade','teleport'],
  lantern:['clone']
};
export const AFFIX_NAMES = {poison:'맹독',burn:'화상',frost:'빙결',lightning:'벼락',meteor:'운석',multishot:'다중발사',autoblock:'자동 방어',taunt:'도발',reset:'쿨 초기화',restore:'사용횟수 회복',revenge:'복수',immune:'상태 면역',regen:'재생',stun:'반격 기절',healburst:'치유 파동',explosion:'폭발 반격',blaze:'불꽃 발자국',luck:'행운',evade:'무적 회피',teleport:'순간이동',clone:'분신'};
export function rng(seed=1){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
export const EQUIPMENT_APPEARANCES={helmet:[['helm','기사 투구'],['wizard_hat','마법사 모자'],['hood','여행자 후드'],['crown','왕관'],['circlet','보석 머리띠'],['ribbon','리본 장식']],armor:[['plate','판금 갑옷'],['robe','마법사 로브'],['tunic','여행자 옷'],['leather','가죽 의상'],['uniform','제복'],['cloak','수호자 망토']],boots:[['boots','장화'],['shoes','가죽 신발'],['sandals','여행자 샌들']],off:[['shield','기사 방패'],['pot_lid','냄비 뚜껑'],['wood_shield','나무 방패']]};
export const WEAPON_APPEARANCES={dagger:[['dagger','단검'],['kitchen_knife','요리사의 도구']],sword:[['sword','롱소드'],['baguette','단단한 바게트'],['wooden_bat','나무 방망이']],mace:[['mace','메이스'],['frying_pan','프라이팬'],['ladle','큰 국자']],axe:[['axe','도끼'],['toy_axe','장난감 도끼']],bow:[['bow','활'],['ribbon_bow','리본 활']],hammer:[['hammer','양손망치'],['toy_hammer','장난감 망치']],greatsword:[['greatsword','양손검'],['giant_baguette','대형 바게트'],['giant_paddle','커다란 노']],magic:[['staff','지팡이'],['parasol','마법 우산'],['spellbook','마법책'],['flower_wand','꽃 지팡이']]};
export const ITEM_STORIES={
giant_baguette:'두 손으로 들어야 할 정도의 거대한 바게트. 장시간 방치되어 매우 단단해졌다.',baguette:'아침 식사를 잊은 모험가의 빵. 이제는 베어 먹기보다 휘두르는 편이 낫다.',
frying_pan:'수많은 야영지의 저녁을 책임진 프라이팬. 바닥의 찌그러짐은 요리 때문만은 아니다.',pot_lid:'급히 뛰쳐나온 요리사가 챙긴 냄비 뚜껑. 손잡이만큼은 아직 뜨겁다.',ladle:'거인의 수프를 젓던 국자. 던전에서는 다른 용도로 더 자주 쓰인다.',
spellbook:'주인의 필기와 차 얼룩으로 가득한 마법책. 여백의 주문이 본문보다 강력하다.',parasol:'햇빛보다 불길을 더 많이 막아 온 우산. 비가 오면 마력이 조금 설렌다.',flower_wand:'시들지 않는 꽃을 묶은 지팡이. 깊은 지하에서도 은은한 풀 향기가 난다.',
kitchen_knife:'손질하던 채소를 두고 떠난 요리사의 도구. 손에 익은 무게는 전장에서도 믿음직하다.',wooden_bat:'마을 축제에 쓰던 방망이. 이름 모를 챔피언의 서명이 희미하게 남았다.',giant_paddle:'배를 잃은 뱃사공의 커다란 노. 이제는 적들을 거칠게 저어 넘긴다.',
toy_hammer:'장난감 가게 진열대에서 사라진 망치. 맞은 사람은 좀처럼 웃지 않는다.',toy_axe:'꼬마 기사의 보물이었다. 손잡이에 적힌 용사의 이름이 아직 남아 있다.',ribbon_bow:'선물 포장처럼 화려한 활. 날아가는 것은 감사의 인사만이 아니다.',
wizard_hat:'별을 세다 잠든 마법사의 모자. 안쪽에는 작은 별자리가 수놓아져 있다.',hood:'수많은 비바람을 함께 견딘 후드. 주인의 얼굴보다 여행의 흔적이 먼저 보인다.',crown:'왕국은 사라져도 왕관은 남았다. 주인은 오늘도 조금 당당하게 걷는다.',circlet:'작은 보석을 품은 머리띠. 잃어버린 약속처럼 은근히 빛난다.',ribbon:'행운을 빌며 묶어 준 리본. 매듭은 거친 싸움에도 쉽게 풀리지 않는다.',
robe:'오래된 주문이 안감에 적힌 로브. 걸을 때마다 조용히 페이지를 넘기는 소리가 난다.',tunic:'평범한 여행자의 옷. 기워진 자국마다 무사히 돌아온 이야기가 있다.',leather:'사냥꾼이 손수 덧댄 가죽 의상. 숲의 냄새가 아직 희미하게 남아 있다.',uniform:'주인을 잃은 부대의 제복. 단추 하나만은 끝까지 반듯하다.',cloak:'동료의 등을 덮어 주던 망토. 해진 가장자리에도 따뜻함이 남았다.',
wood_shield:'문짝을 깎아 만든 방패. 고향으로 돌아갈 때까지 부서지지 않기를 바랐다.',sandals:'먼 길을 함께 걸은 샌들. 밑창에는 아직 출발한 마을의 흙이 남아 있다.'};
export function itemStory(appearance,kind,type){return ITEM_STORIES[appearance]||({main:'수많은 모험가의 손을 거친 무기. 새 주인과 함께 또 하나의 이야기를 기다린다.',helmet:'머리에 남은 흠집은 지난 모험의 흔적이다. 이제 새로운 주인을 지킨다.',armor:'공들여 덧댄 옷감과 금속. 돌아오겠다는 약속을 몸에 걸쳤다.',boots:'던전의 먼지가 밑창 사이에 남았다. 다음 걸음은 어디로 향할까.',off:'오랜 세월 주인의 곁을 지켰다. 작은 흠집마다 막아 낸 위험이 있다.',lantern:'돌아오는 길을 잃지 말라고 건네받은 등불. 어둠 속에서 조용히 흔들린다.'}[kind]||'이름 모를 여행자의 흔적이 남아 있다.');}
export function makeItem(random,id,{kind,type:requestedType,tier,starter=false,appearance:requestedAppearance,catalog,definitionChoice}={}){
  const roll=(a,b)=>Math.floor(a+random()*(b-a+1));
  tier=tier??(random()<.04?3:random()<.18?2:random()<.45?1:0);
  kind=kind||['main','main','main','off','helmet','armor','boots','lantern'][roll(0,7)];
  if(starter){kind='main';requestedType='dagger';tier=0;}
  let choices=ITEM_POOLS[kind][tier];
  if(requestedType)choices=choices.filter(d=>d.type===requestedType);
  let def=definitionChoice;
  if(!def&&requestedAppearance)def=choices.find(d=>d.entry[0]===requestedAppearance);
  if(!def&&!requestedAppearance&&choices.length){
    if(kind==='main'&&!requestedType&&!starter){const groups=new Map();for(const d of choices){const family=WEAPONS[d.type]?.range>=5&&d.type!=='bow'?'staff':d.type;if(!groups.has(family))groups.set(family,[]);groups.get(family).push(d);}const families=[...groups.values()],pool=families[roll(0,families.length-1)];def=pool[roll(0,pool.length-1)];}
    else def=choices[starter?0:roll(0,choices.length-1)];
  }
  // Explicit appearance requests are supported by the asset preview/test harness.
  if(!def){const old=kind==='main'?(WEAPON_APPEARANCES[requestedType]||WEAPON_APPEARANCES.magic):EQUIPMENT_APPEARANCES[kind];const skin=old?.find(d=>d[0]===requestedAppearance);const design=(ITEM_DESIGNS[requestedType]||ITEM_DESIGNS[kind]||ITEM_DESIGNS.magic)[tier][0];def={type:requestedType||(kind==='off'?'shield':kind),entry:skin?[skin[0],skin[1],skin[0],itemStory(skin[0],kind,requestedType),'plain']:design};}
  const [appearance,name,shape,story,profile]=def.entry,type=def.type;
  const assigned=catalog?.find(d=>d.kind===kind&&d.tier===tier&&d.appearance===appearance);
  if(assigned)return {...assigned,id,stats:{...assigned.stats},ranges:structuredClone(assigned.ranges),affixes:assigned.affixes.map(a=>({...a})),visual:{...assigned.visual}};
  const hash=[...appearance].reduce((n,c)=>n+c.charCodeAt(0),0),bonus=tier*3;
  const stats={hp:0,attack:0,defense:0,agility:0},ranges={};
  const band=(key,low,high)=>{ranges[key]=[low,high];stats[key]=roll(low,high);};
  if(kind==='main'){const base=WEAPONS[type]?.damage||5;band('attack',starter||appearance==='dagger'?3:Math.max(2,base+bonus-2-hash%2),starter||appearance==='dagger'?7:base+bonus+2+hash%4);if(profile==='short'||profile==='crescent')band('agility',1+tier,3+tier*2);}
  else if(kind==='lantern'){for(const key of Object.keys(stats))band(key,1,Math.min(20,4+tier*4+hash%3));}
  else{band('defense',Math.max(1,2+bonus-hash%2),5+bonus+hash%3);if(kind==='boots')band('agility',2+tier,5+tier*4+hash%3);else if(hash%3===0)band('hp',3+tier*2,8+tier*5);else if(hash%3===1)band('attack',1+tier,3+tier*2);else band('agility',1+tier,3+tier*2);}
  const sourcePool=appearance==='giant_baguette'?['frost','regen','healburst']:kind==='main'&&['heal','healbolt'].includes(type)?['regen','restore','healburst','immune']:AFFIXES[kind]||[];
  const affixes=[],pool=sourcePool.filter(x=>(x!=='multishot'||(WEAPONS[type]?.range||0)>=5)&&(tier>=2||!['autoblock','evade','teleport','meteor','lightning','clone'].includes(x)));
  for(let i=0;i<(starter?0:tier)&&pool.length;i++){
    // The signature effect is associated with the design; extra effects are seeded per match.
    const index=i===0?(appearance==='giant_baguette'?0:hash%pool.length):roll(0,pool.length-1),key=pool.splice(index,1)[0];
    const charges=['autoblock','evade','clone'].includes(key)?(key==='clone'?1:key==='evade'?roll(1,2):roll(1,3)):null;
    affixes.push({key,chance:.06+random()*.09,value:key==='revenge'?.2+random()*.4:tier===3?1:.5+random()*.5,charges,maxCharges:charges});
  }
  if(appearance==='giant_baguette'){stats.hp=18;ranges.hp=[18,24];const crust=affixes.find(a=>a.key==='frost');if(crust){crust.chance=.3;crust.name='굳은 빵껍질';}}
  const palettes=[['#b9c4c6','#896e4a','#d6c69d'],['#a7bbc9','#99774d','#d4ba7c'],['#a7abc9','#806995','#dacb9a'],['#bacbd2','#887096','#edcf8b']];
  return {id,kind,type,appearance,tier,name,story,stats,ranges,affixes,visual:{shape,profile,primary:palettes[tier][hash%2],accent:palettes[tier][2],construction:hash%3,...(kind==='armor'?{cut:armorCuts.get(appearance)||'straight'}:{})},vision:kind==='lantern'?5+tier*5:0};
}
export function createMatchItemCatalog(seed){
  const random=rng((Number(seed)^0x45d9f3b)>>>0),catalog=[];
  for(const [kind,tiers] of Object.entries(ITEM_POOLS))tiers.forEach((items,tier)=>items.forEach(definitionChoice=>catalog.push(makeItem(random,'definition-'+definitionChoice.entry[0],{kind,tier,definitionChoice}))));
  return catalog;
}
export function itemFeedback(item){
  const shape=item?.visual?.shape||item?.appearance,type=item?.type;
  if(['baguette','giant_baguette'].includes(shape))return {material:'bread',swing:'breadSwing',hit:'breadHit',color:'#e6bb74'};
  if(shape==='lollipop')return {material:'candy',swing:'candySwing',hit:'candyHit',color:'#ed9cbb'};
  if(['frying_pan','pot_lid','ladle'].includes(shape))return {material:'pan',swing:'bluntSwing',hit:'panHit',color:'#d3dfdf'};
  if(shape==='spellbook')return {material:'paper',swing:'bookSwing',hit:'magic',color:'#c9aedb'};
  if(['wooden_bat','giant_paddle'].includes(shape)||type==='hammer'||type==='mace')return {material:'blunt',swing:'bluntSwing',hit:'bluntHit',color:'#c9a579'};
  if(shape==='parasol'||shape==='flower_wand'||WEAPONS[type]?.range>=5)return {material:'magic',swing:'cast',hit:'magic',color:'#ba9cdd'};
  return {material:'blade',swing:'swing',hit:'hit',color:'#f0debb'};
}

export function equipmentSound(item){
 const shape=item?.visual?.shape||item?.appearance;
 if(item?.kind==='main'){
  const material=itemFeedback(item).material;
  return ({bread:'equipBread',candy:'equipCandy',pan:'equipMetal',paper:'equipBook',blunt:'equipWood',magic:'equipMagic',blade:'equipMetal'})[material];
 }
 if(item?.kind==='lantern')return 'equipMagic';
 if(item?.kind==='boots')return 'equipLeather';
 if(['plate','helm','crown','circlet','shield'].includes(shape)||item?.kind==='off'&&!['wood_shield'].includes(shape))return 'equipMetal';
 return 'equipCloth';
}
