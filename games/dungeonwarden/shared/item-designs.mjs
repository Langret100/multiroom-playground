// Four separate loot pools. Entries are identities, not recolors of one base item.
// [id, name, drawable silhouette, story, distinctive construction]
export const ITEM_DESIGNS={
dagger:[
 [['dagger','낡은 단검','dagger','입구를 나설 때 받은 작은 단검. 손잡이의 흠집은 첫 모험부터 함께했다.','plain'],['paring_knife','사과 깎는 칼','kitchen_knife','껍질을 얇게 깎던 칼. 급한 여행에서는 뜻밖의 동반자가 된다.','short']],
 [['fang_knife','늑대 송곳니','dagger','사냥꾼이 커다란 송곳니를 날로 삼았다. 손잡이에는 무리의 표식이 남아 있다.','hook'],['letter_knife','귀족의 편지칼','dagger','연애편지를 열던 은제 칼. 오늘은 조금 더 거친 소식을 전한다.','cross']],
 [['ritual_knife','달무리 의식검','dagger','초승달의 밤에만 쓰던 의식의 칼. 날의 구멍 사이로 희미한 빛이 흐른다.','crescent'],['scissor_knife','재단사의 가위날','dagger','잃어버린 가위의 한쪽 날. 마지막 옷을 완성하려던 장인의 마음이 남았다.','fork']],
 [['star_shard','떨어진 별 조각','dagger','별똥별을 주워 손잡이를 달았다. 베어진 어둠에는 잠시 별빛이 남는다.','crystal'],['royal_fang','용왕의 이빨','dagger','용왕이 남긴 이빨 한 개. 작은 크기와 달리 무게는 쉽게 익숙해지지 않는다.','wing']]
],
sword:[
 [['wooden_bat','마을 방망이','wooden_bat','마을 축제에서 쓰던 방망이. 누군가의 우승 기록이 손잡이에 새겨져 있다.','plain'],['rusty_sword','녹슨 장검','sword','창고 깊숙이 잠들었던 장검. 닦아 낸 날 아래로 옛 문장이 드러난다.','plain']],
 [['longsword','수비대 장검','sword','문을 지키던 수비대의 장검. 손잡이는 교대 근무의 흔적으로 반들반들하다.','cross'],['baguette','단단한 바게트','baguette','아침 식사를 잊은 모험가의 빵. 이제는 베어 먹기보다 휘두르는 편이 낫다.','plain']],
 [['clock_hand','멈춘 시계의 장침','sword','무너진 시계탑에서 가져온 장침. 이제 시간을 재는 대신 적의 빈틈을 잰다.','arrow'],['saw_sword','정원사의 톱검','sword','거대한 덩굴을 자르던 톱. 마른 잎 냄새가 검집에 남아 있다.','teeth']],
 [['sun_sword','여명의 성검','sword','동이 트기 전 가장 밝게 빛나는 검. 오래된 맹세가 칼날 위에서 깨어난다.','wing'],['glass_sword','거울 호수의 검','sword','호수의 수면을 베어 만든 투명한 검. 날 속에는 다른 하늘이 비친다.','crystal']]
],
mace:[
 [['ladle','큰 국자','ladle','거인의 수프를 젓던 국자. 던전에서는 다른 용도로 더 자주 쓰인다.','plain'],['wood_club','매듭진 몽둥이','mace','길가의 나뭇가지를 다듬었다. 매듭이 많아 손보다 적에게 더 아프다.','short']],
 [['frying_pan','야영지 프라이팬','frying_pan','수많은 야영지의 저녁을 책임졌다. 바닥의 찌그러짐은 요리 때문만은 아니다.','plain'],['guard_mace','경비병 메이스','mace','소란스러운 시장을 지키던 메이스. 손잡이에 오늘의 순찰표가 끼워져 있다.','cross']],
 [['bell_mace','새벽 종추','mace','폐성당의 종을 울리던 추. 적에게 닿을 때마다 낮은 울림이 퍼진다.','bell'],['gear_mace','정비공 톱니추','mace','돌아가지 않는 기계에서 꺼낸 톱니바퀴. 이제는 손으로 직접 돌린다.','teeth']],
 [['comet_mace','작은 혜성','mace','긴 꼬리를 남기는 별의 핵. 주인은 자신이 들고 있는 것이 돌이라고 주장한다.','crystal'],['royal_scepter','잊힌 왕의 홀','mace','백성이 사라진 왕의 홀. 명령 대신 묵직한 대답을 전한다.','wing']]
],
axe:[
 [['wood_axe','장작 도끼','axe','난로에 넣을 장작을 패던 도끼. 오늘도 주인을 따뜻하게 지켜 준다.','plain'],['toy_axe','꼬마 기사의 도끼','toy_axe','손잡이에 꼬마 용사의 이름이 적혀 있다. 장난감이라고 얕보면 곤란하다.','short']],
 [['battle_axe','용병의 전투도끼','axe','급료를 기다리던 용병의 도끼. 날보다 손잡이의 흠집이 더 많다.','cross'],['cleaver_axe','정육점 대절도','axe','아주 큰 고기를 손질하던 도구. 주인은 그 고기가 무엇이었는지 말하지 않는다.','block']],
 [['moon_axe','초승달 도끼','axe','달 모양의 날이 어둠을 가른다. 보름달의 밤에도 초승달을 놓지 않는다.','crescent'],['rescue_axe','기관사의 구조도끼','axe','멈춘 열차의 문을 뜯어내던 도끼. 막힌 길 앞에서 특히 믿음직하다.','hook']],
 [['dragon_axe','용익 전투도끼','axe','용의 날개뼈를 다듬은 날. 크게 휘두르면 오래된 비늘 소리가 난다.','wing'],['crystal_axe','수정 광산의 심장','axe','광부가 마지막으로 캐낸 수정 덩어리. 손질하기엔 너무 단단해 도끼가 되었다.','crystal']]
],
bow:[
 [['hunting_bow','사냥꾼 단궁','bow','먹을 것을 구하던 작은 활. 여행자의 끼니는 종종 이 활에 달렸다.','short'],['branch_bow','버드나무 활','bow','유연한 가지에 줄을 걸었다. 바람이 불면 나뭇잎이었던 시절을 떠올린다.','plain']],
 [['longbow','수비대 장궁','bow','성벽 위의 궁수가 쓰던 장궁. 먼 곳을 보던 눈빛이 활 끝에 남았다.','long'],['ribbon_bow','축제 리본 활','ribbon_bow','선물 포장처럼 화려한 활. 날아가는 것은 감사의 인사만이 아니다.','cross']],
 [['thorn_bow','가시 정원의 활','bow','장미 덩굴을 말려 만든 활. 꽃은 졌지만 가시는 여전히 날카롭다.','teeth'],['crescent_bow','월식의 활','bow','달을 따라 휘어진 활. 시위를 당기면 밤하늘처럼 고요해진다.','crescent']],
 [['phoenix_bow','불사조의 날개','bow','다시 태어난 새가 남긴 깃으로 만들었다. 날개를 접어도 온기는 사라지지 않는다.','wing'],['astral_bow','별자리 장궁','bow','별과 별 사이에 시위를 걸었다. 다음 화살이 어느 별로 향할지는 주인이 정한다.','crystal']]
],
hammer:[
 [['wood_mallet','목수의 큰 망치','hammer','집 한 채를 세운 망치. 이제는 길을 막은 것들을 허문다.','plain'],['toy_hammer','축제 뿅망치','toy_hammer','장난감 가게에서 사라진 망치. 맞은 사람은 좀처럼 웃지 않는다.','short']],
 [['war_hammer','공성 망치','hammer','성문을 두드리던 공성대의 도구. 주인이 바뀌어도 인사 방식은 거칠다.','block'],['stone_pestle','거인의 절굿공이','hammer','곡식을 찧던 거대한 절굿공이. 던전에서 쓸 만한 곡식은 아직 찾지 못했다.','long']],
 [['lollipop_hammer','왕사탕 롤리팝','lollipop','축제의 거대한 사탕에 손잡이를 달았다. 달콤한 향과 달리 맞으면 몹시 아프다.','candy'],['bell_hammer','잠든 종탑','hammer','종탑의 작은 종을 통째로 손잡이에 달았다. 조용히 싸우기에는 맞지 않는다.','bell']],
 [['meteor_hammer','운석 파쇄추','hammer','떨어진 운석을 그대로 묶었다. 땅에 닿으면 하늘도 잠깐 흔들리는 듯하다.','crystal'],['royal_hammer','거왕의 심판','hammer','거인 왕이 판결을 내릴 때 쓰던 망치. 두 손으로 들어도 엄숙한 무게는 남는다.','wing']]
],
greatsword:[
 [['giant_paddle','뱃사공의 큰 노','giant_paddle','배를 잃은 뱃사공의 노. 이제는 적들을 거칠게 저어 넘긴다.','long'],['giant_baguette','대형 바게트','giant_baguette','두 손으로 들어야 할 정도의 거대한 바게트. 장시간 방치되어 매우 단단해졌다.','long']],
 [['zweihander','용병 쯔바이핸더','greatsword','긴 칼날과 보조 가드를 가진 양손검. 용병은 길이를 급료만큼 중요하게 여겼다.','cross'],['iron_slab','철판 대검','greatsword','작업장 문짝을 길게 깎아 만들었다. 검이라는 이름은 주인의 고집이다.','block']],
 [['execution_blade','심판관의 대검','greatsword','검 끝에 날이 없는 오래된 대검. 새 주인은 무거운 과거를 다른 싸움에 쓴다.','fork'],['anchor_blade','난파선 닻검','greatsword','부러진 닻에서 꺼낸 검. 바다를 떠났지만 붙잡는 힘은 그대로다.','hook']],
 [['dragon_zwei','용골 쯔바이핸더','greatsword','용의 등뼈를 따라 칼날을 단조했다. 날 끝마다 작은 비늘이 남아 있다.','teeth'],['dawn_greatsword','새벽을 여는 대검','greatsword','닫힌 밤을 열었다는 전설의 검. 들어 올릴 때마다 날개 같은 가드가 펼쳐진다.','wing']]
],
magic:[
 [['twig_staff','마른 가지 지팡이','staff','길에서 주운 가지에 작은 돌을 묶었다. 주문보다 마음이 먼저 준비되었다.','plain'],['school_book','견습생 연습장','spellbook','틀린 주문마다 선을 그은 연습장. 마지막 페이지에는 아직 빈칸이 많다.','short']],
 [['parasol','비 오는 날의 마법 우산','parasol','비 대신 불길을 막은 날이 더 많다. 주인은 여전히 날씨를 먼저 확인한다.','plain'],['flower_wand','정원사의 꽃 지팡이','flower_wand','시들지 않는 꽃을 묶었다. 지하에서도 은은한 풀 향기가 난다.','cross']],
 [['moon_staff','월광 관측봉','staff','별을 관측하던 학자의 도구. 이제는 별빛을 조금 빌려 싸운다.','crescent'],['sealed_book','봉인된 마도서','spellbook','쇠사슬이 풀린 뒤에도 책은 조용하다. 주인이 읽어 줄 순간을 기다린다.','fork']],
 [['astral_staff','천구의 지팡이','staff','작은 천구가 끝에서 회전한다. 그 안의 하늘은 언제나 맑다.','crystal'],['phoenix_parasol','불사조 깃 우산','parasol','타지 않는 깃으로 짠 우산. 펼치면 잿빛 날개가 다시 빛난다.','wing']]
],
helmet:[
 [['travel_hood','먼길 후드','hood','비바람을 견딘 후드. 얼굴보다 여행의 흔적이 먼저 보인다.','plain'],['cloth_ribbon','들꽃 리본','ribbon','길가의 꽃 대신 묶어 준 리본. 매듭에 작은 응원의 마음이 남았다.','short']],
 [['guard_helm','수비대 투구','helm','성벽을 지키던 투구. 가느다란 깃이 바람의 방향을 알려 준다.','cross'],['apprentice_hat','견습 마법사 모자','wizard_hat','별을 세다 잠든 견습생의 모자. 안쪽에는 숙제가 적혀 있다.','plain']],
 [['moon_circlet','달빛 머리띠','circlet','작은 달 장식이 달린 머리띠. 어둠 속에서 길을 기억한다.','crescent'],['captain_hat','유람선 선장 모자','wizard_hat','배는 없어도 선장은 당당하다. 챙에 바닷바람의 흔적이 남았다.','fork']],
 [['royal_crown','잊힌 왕국의 왕관','crown','왕국은 사라져도 왕관은 남았다. 주인은 오늘도 조금 당당하게 걷는다.','wing'],['astral_hood','별밤 예언자의 후드','hood','별의 조각이 가장자리에 박혔다. 고개를 돌리면 작은 밤하늘도 따라간다.','crystal']]
],
armor:[
 [['travel_tunic','기운 여행자 옷','tunic','기운 자국마다 무사히 돌아온 이야기가 있다. 새 여행을 위해 다시 수선했다.','plain'],['work_apron','빵집 작업복','tunic','밀가루를 털어도 빵 냄새는 남는다. 앞치마 주머니에는 작은 행운이 들었다.','short']],
 [['guard_plate','수비대 판금 갑옷','plate','교대 근무마다 닦아 온 갑옷. 한 번 더 집에 돌아가기 위해 걸쳤다.','cross'],['ranger_leather','숲지기 가죽 옷','leather','숲의 냄새가 희미하게 남아 있다. 작은 잎 장식은 동료의 선물이다.','hook']],
 [['moon_robe','월광 연구자의 로브','robe','오래된 주문이 안감에 적혔다. 걸을 때마다 조용히 페이지를 넘기는 소리가 난다.','crescent'],['captain_uniform','원정대 제복','uniform','해어진 소매에도 계급장은 반듯하다. 동료들은 이 옷을 보고 길을 찾았다.','fork']],
 [['royal_cloak','왕실 수호자의 망토','cloak','동료의 등을 덮어 주던 망토. 해진 끝에도 따뜻함이 남았다.','wing'],['crystal_plate','수정성의 갑옷','plate','금속 사이에 수정판을 끼웠다. 움직일 때마다 작은 성이 함께 빛난다.','crystal']]
],
boots:[
 [['travel_sandals','여행자 샌들','sandals','밑창에는 출발한 마을의 흙이 남았다. 먼 길도 첫걸음에서 시작했다.','short'],['worn_shoes','낡은 가죽 신발','shoes','수선점의 실이 여러 색으로 남았다. 어느 것도 쉽게 풀리지 않는다.','plain']],
 [['guard_boots','수비대 장화','boots','긴 순찰에도 견딘 장화. 발뒤꿈치에 성벽의 먼지가 남았다.','cross'],['ranger_shoes','숲길 신발','shoes','젖은 풀을 지나도 발걸음은 가볍다. 끈에 작은 잎을 달았다.','hook']],
 [['moon_boots','달무리 장화','boots','발끝에 초승달 장식이 달렸다. 밤길에 남기는 자국이 유난히 작다.','crescent'],['captain_boots','원정대 긴 장화','boots','진흙탕을 건너던 대장의 장화. 가죽에 원정의 지도가 남았다.','long']],
 [['wing_boots','새벽 날개 신발','shoes','작은 날개를 단 신발. 걸음마다 주인의 등을 조금 떠밀어 준다.','wing'],['crystal_boots','수정길 장화','boots','수정으로 보강한 발끝. 돌길에서 맑은 소리가 울린다.','crystal']]
],
off:[
 [['pot_lid','야영지 냄비 뚜껑','pot_lid','급히 떠난 요리사가 챙겼다. 흠집마다 한 번의 위험을 막아 냈다.','plain'],['door_shield','문짝 방패','wood_shield','고향집 문짝을 깎았다. 돌아갈 때까지 부서지지 않기를 바랐다.','block']],
 [['guard_shield','수비대 방패','shield','성문을 지키던 방패. 지워진 문장 위에 새 이름을 적었다.','cross'],['wicker_shield','소풍 바구니 덮개','wood_shield','소풍은 끝났지만 덮개는 남았다. 뜻밖에도 튼튼한 선물이었다.','short']],
 [['moon_shield','월식 방패','shield','달을 닮은 둥근 방패. 한쪽의 빈자리로 적의 움직임을 살핀다.','crescent'],['gear_shield','기계실 톱니 방패','shield','멈춘 기계의 부품. 날카로운 가장자리에는 기름 냄새가 남았다.','teeth']],
 [['wing_shield','왕실 날개 방패','shield','수호자의 날개를 새겼다. 동료가 뒤에 설 자리를 언제나 남겨 둔다.','wing'],['crystal_shield','거울성의 방패','shield','작은 수정판이 겹쳐진 방패. 막아 낸 불빛을 잠시 품는다.','crystal']]
],
lantern:[
 [['camp_lamp','야영지 등불','lantern','돌아올 길을 잃지 말라고 건네받았다. 작은 불꽃이 고집스럽게 버틴다.','plain']],
 [['miner_lamp','광부의 작업등','lantern','어둠에 익숙한 광부의 등불. 손잡이에 동료의 이름이 새겨져 있다.','block']],
 [['moon_lamp','달빛 반딧불 등','lantern','유리 속에 달빛을 담았다. 불꽃 대신 작은 빛들이 떠다닌다.','crescent']],
 [['astral_lamp','별길 인도자의 등불','lantern','잃어버린 길을 잇는 등불. 빛이 닿으면 낯선 곳도 잠시 고향처럼 느껴진다.','wing']]
]
};

// Final playable catalogs are counted per equipment category, not per attack style.
const pick=(type,tier,index=0)=>{const entry=(ITEM_DESIGNS[type]||ITEM_DESIGNS.magic)[tier][index];return {type,entry:ITEM_DESIGNS[type]?entry:[entry[0]+'_'+type,entry[1]+' · '+({meteor:'운석',heal:'치유',poison:'독안개',thunder:'천둥',fireball:'화염',vines:'덩굴',lightning:'번개',healbolt:'생명'}[type]||type),entry[2],entry[3],entry[4]]};};
export const ITEM_POOLS={main:[
 [pick('dagger',0),pick('sword',0,1),{type:'dagger',entry:['copper_dagger','구리 단검','dagger','초보 대장장이가 만든 구리 단검. 평범하지만 손에 익히기 쉽다.','short']},pick('mace',0),pick('axe',0),pick('bow',0),pick('hammer',0),pick('greatsword',0),pick('fireball',0)],
 [{type:'acid',entry:['copper_acid_staff','구리 마법봉','staff','구리 고리에 산성 주문을 새긴 보급형 마법봉.','plain']},pick('greatsword',1),pick('bow',1),pick('mace',1,1),{type:'meteor',entry:['iron_meteor_staff','철제 마법봉','staff','작은 돌을 끼운 철제 마법봉. 견습 마법사의 믿음직한 도구다.','cross']},pick('dagger',1),pick('sword',1),pick('axe',1),pick('hammer',1)],
 [pick('dagger',2),pick('sword',2),pick('mace',1),pick('axe',2),pick('bow',2),pick('hammer',2),pick('greatsword',2),pick('heal',2),pick('poison',2,1),pick('thunder',2),pick('fireball',2,1),pick('vines',2)],
 [pick('greatsword',0,1),pick('bow',3),pick('hammer',3),pick('lightning',3),pick('healbolt',3,1)]
]};
const extra={
helmet:[
 [['straw_hat','농부 밀짚모자','wizard_hat','햇볕을 막던 넓은 챙. 지하에서도 주인은 챙을 고쳐 쓴다.','wide']],
 [['chef_hat','요리사 모자','wizard_hat','좋은 요리에는 인내가 필요하다. 던전에서도 마찬가지라 믿었다.','tall'],['pilgrim_wrap','순례자 머리천','hood','긴 기도 끝에 감은 머리천. 매듭에는 여행의 먼지가 남았다.','wrap'],['duelist_beret','결투가 베레모','helm','멋을 아는 결투가의 모자. 기울어진 각도만큼은 고집을 꺾지 않는다.','feather']],
 [['rose_hat','장미 정원 모자','wizard_hat','장미가 자라는 정원의 모자. 가시는 주인을 향하지 않는다.','flower'],['fox_mask','여우 축제 가면','helm','웃는 얼굴을 새긴 가면. 뒤의 표정은 주인만 안다.','ears'],['cat_hood','고양이 귀 후드','hood','친구가 달아 준 작은 귀. 낯선 소리에도 먼저 반응하는 기분이다.','ears'],['antler_band','숲사슴 머리장식','circlet','숲에서 주운 뿔을 엮었다. 작은 새가 쉬어 가곤 했다.','antler'],['pirate_hat','해적 삼각모','wizard_hat','지도는 잃었지만 모자는 지켰다. 다음 보물은 지하에 있을지도 모른다.','wide'],['rose_ribbon','붉은 약속 리본','ribbon','헤어지기 전에 묶어 준 리본. 약속한 날까지 매듭은 풀지 않는다.','flower'],['goggle_band','탐험가 고글','circlet','모래바람을 견딘 고글. 렌즈에는 아직 먼 사막이 비친다.','goggles'],['swan_veil','백조 베일','hood','물가의 무희가 남긴 베일. 고개를 돌리면 춤의 끝이 따라온다.','veil'],['horn_helm','돌격대 뿔투구','helm','돌격대의 표식을 달았다. 뿔은 허세였지만 용기는 아니었다.','horn'],['clock_cap','시계공의 작업모','helm','톱니를 잃어버리지 않게 달아 둔 모자. 이제 시간보다 안전을 챙긴다.','gear']],
 [['phoenix_crown','불사조 깃관','crown','재에서 돌아온 새의 깃. 가장 어두울 때도 불씨를 품는다.','feather'],['oracle_veil','황혼 예언자의 베일','hood','내일을 본 예언자는 오늘의 바람을 즐겼다. 베일은 아직 흔들린다.','veil'],['royal_antler','요정왕의 가지관','circlet','살아 있는 가지가 왕관을 이룬다. 작은 잎은 사계절을 잊었다.','antler']]
],
armor:[
 [['wool_vest','양치기 털조끼','leather','차가운 밤을 견딘 조끼. 잃어버린 양 한 마리의 털을 기념으로 달았다.','fur']],
 [['chef_coat','요리사 흰 재킷','uniform','깨끗한 재킷을 지키는 일은 어려웠다. 오늘의 얼룩은 수프가 아니다.','apron'],['pilgrim_robe','순례자의 수도복','robe','긴 길에 맞게 수선했다. 소매마다 작은 기도가 남았다.','wrap'],['duelist_coat','결투가 짧은 코트','cloak','빠른 몸놀림에 맞춘 코트. 주머니에는 결투 신청서가 한 장 있다.','short']],
 [['rose_dress','장미 정원 드레스','robe','정원사의 손으로 수놓았다. 꽃이 지지 않도록 조심스레 입는다.','flower'],['pirate_coat','해적 선장의 코트','cloak','지도와 동전을 숨기던 코트. 지금은 동료의 보급품을 품는다.','wide'],['beast_vest','야수 사냥꾼 조끼','leather','사냥의 흔적을 기워 넣었다. 주인은 전리품보다 귀환을 자랑한다.','fur'],['clock_uniform','시계탑 정비복','uniform','작은 톱니를 넣던 주머니. 하나쯤은 시간을 되돌릴지도 모른다.','gear'],['desert_wrap','모래바람 여행복','tunic','사막 바람을 막던 천. 차가운 지하에서는 다른 바람을 막는다.','wrap'],['swan_cloak','백조 무희의 망토','cloak','마지막 춤의 깃이 남았다. 달릴 때마다 박자가 떠오른다.','feather'],['scale_mail','은비늘 사슬옷','plate','작은 비늘을 정성껏 이어 붙였다. 하나하나가 돌아오겠다는 약속이다.','scale'],['storm_jacket','폭풍 항해 재킷','uniform','비를 막던 이중 깃. 폭풍은 지나도 단추는 튼튼하다.','collar'],['druid_robe','깊은 숲의 로브','robe','나뭇잎 사이로 햇빛을 받았다. 안감에는 씨앗이 숨겨져 있다.','leaf'],['rune_plate','룬장인의 흉갑','plate','손으로 새긴 룬이 겹친다. 작은 실수조차 새로운 주문이 되었다.','rune']],
 [['phoenix_robe','불사조의 예복','robe','한 번 타고 다시 짠 옷감. 남은 깃이 따뜻한 바람을 만든다.','feather'],['oracle_dress','황혼 예언자의 옷','tunic','앞뒤의 자수가 다른 하늘을 그린다. 오늘의 빛이 어디에나 남는다.','veil'],['worldtree_cloak','세계수 수호 망토','cloak','오래된 나무가 내어 준 잎. 주인을 품어 작은 숲이 된다.','leaf']]
],
boots:[
 [['cloth_slippers','집 나온 실내화','shoes','문 앞에서 신발을 잘못 골랐다. 그래도 첫걸음을 멈추지는 않았다.','short']],
 [['chef_clogs','주방 나막신','sandals','젖은 주방을 걸었다. 두꺼운 밑창은 던전에서도 믿음직하다.','block'],['pilgrim_shoes','순례자 천신','shoes','몇 번이고 새로 기운 신발. 걸어온 거리만큼 실이 늘었다.','wrap'],['duelist_boots','결투가 반장화','boots','부드러운 가죽이 발목을 감싼다. 한 걸음으로 결투가 갈렸다.','short']],
 [['rose_shoes','장미 무도회 신발','shoes','무도회의 마지막 곡이 끝났다. 새 박자는 전장에서 찾는다.','flower'],['pirate_boots','해적 선장 장화','boots','파도에 젖어도 벗지 않았다. 밑창에는 갑판의 결이 남았다.','wide'],['beast_boots','사냥꾼 털장화','boots','눈길의 추위를 막았다. 발끝에 작은 발톱 장식이 달렸다.','fur'],['clock_shoes','시계공 톱니 신발','shoes','작업장에서 떨어진 톱니를 붙였다. 걸음은 언제나 일정하다.','gear'],['desert_sandals','사막 길잡이 샌들','sandals','모래를 털기 쉬운 끈. 주인은 길을 잃은 적이 없다고 말한다.','wrap'],['swan_shoes','백조 무희 신발','shoes','발끝마다 흰 깃이 달렸다. 바닥을 디딜 때도 춤처럼 가볍다.','feather'],['scale_boots','은비늘 전투장화','boots','작은 비늘로 발등을 덮었다. 물가를 걸어도 녹슬지 않는다.','scale'],['storm_boots','폭풍 갑판 장화','boots','미끄러운 갑판을 견딘 밑창. 폭풍 속의 걸음을 기억한다.','block'],['druid_sandals','이끼길 샌들','sandals','얇은 끈에 잎을 엮었다. 발자국 옆에 작은 풀이 돋는다.','leaf'],['rune_shoes','룬새김 신발','shoes','밑창에 새긴 기호. 걷는 길마다 짧은 주문을 남긴다.','rune']],
 [['phoenix_boots','불사조 깃장화','boots','재 속을 걸어도 깃은 남았다. 다시 떠오를 발걸음을 기다린다.','feather'],['oracle_slippers','예언자의 비단신','shoes','내일의 길을 알던 주인도 첫걸음은 조심스러웠다.','veil'],['worldtree_boots','세계수 뿌리신','boots','어린 뿌리를 엮어 만들었다. 낯선 땅에서도 단단히 서 있다.','leaf']]
],
off:[
 [['tray_shield','주점 쟁반','pot_lid','빈 잔을 나르던 쟁반. 오늘은 날아오는 위험을 받는다.','wide']],
 [['chef_board','요리사의 도마','wood_shield','칼자국이 겹쳐진 도마. 새로운 흠집도 익숙하게 받아 낸다.','block'],['pilgrim_shield','순례자의 나무판','wood_shield','기도문을 새긴 작은 판. 무거운 짐보다 마음을 먼저 지켰다.','wrap'],['duelist_buckler','결투가 버클러','shield','검 끝을 흘려내는 작은 방패. 크기보다 타이밍을 믿는다.','short']],
 [['rose_shield','장미 덩굴 방패','wood_shield','가시 덩굴이 가장자리를 감싼다. 꽃은 주인의 쪽으로 피었다.','flower'],['pirate_wheel','해적선 조타륜','wood_shield','배를 잃은 뒤에도 놓지 않았다. 주인은 이걸로 길을 돌린다.','gear'],['beast_shield','야수 가죽 방패','shield','잡은 야수의 가죽을 팽팽히 당겼다. 울음 대신 충격을 받아 낸다.','fur'],['clock_door','시계탑 작은 문','wood_shield','시계의 정비 문을 떼었다. 안쪽에는 마지막 점검 날짜가 남았다.','block'],['desert_fan','모래바람 철부채','shield','거친 바람을 막던 부채. 펼치면 작은 성벽이 된다.','fork'],['swan_shield','백조 깃방패','shield','깃과 나무를 함께 엮었다. 부드러운 겉면에 속기 쉽다.','feather'],['scale_shield','은비늘 방패','shield','비늘이 맞물려 충격을 나눈다. 물결처럼 차례로 빛난다.','scale'],['storm_plate','폭풍선 철판','shield','갑판을 보강하던 철판. 거친 바다의 녹이 가장자리에 남았다.','wide'],['druid_shield','고목 나이테 방패','wood_shield','긴 세월을 견딘 나무의 단면. 세월만큼 단단한 마음을 빌렸다.','leaf'],['rune_shield','룬새김 방패','shield','방어 주문을 여러 번 새겼다. 겹친 기호는 장인의 끈기다.','rune']],
 [['phoenix_shield','불사조 날개 방패','shield','잿빛 날개를 펼쳤다. 막아 낸 열기 속에서 다시 빛난다.','feather'],['oracle_mirror','예언자의 거울','shield','다가올 위험을 비춘다는 거울. 주인은 먼저 동료를 돌아봤다.','veil'],['worldtree_shield','세계수 가지 방패','wood_shield','살아 있는 가지가 손잡이를 감싼다. 잎은 주인의 숨을 따라 흔들린다.','leaf']]
],
lantern:[
 [['bottle_lamp','병 속 촛불','lantern','빈 병에 작은 초를 넣었다. 바람을 막아 준 만큼 길이 이어졌다.','short'],['paper_lamp','종이 축제등','lantern','축제가 끝나도 불빛은 남았다. 즐거운 길을 한 번 더 밝힌다.','wrap']],
 [['chef_lamp','주방 가스등','lantern','늦은 저녁을 밝히던 등. 굶주린 모험가에게 작은 위안이 된다.','block'],['pilgrim_lamp','순례자의 성화등','lantern','먼 길 동안 한 번도 꺼뜨리지 않았다. 불꽃에 기도를 조금 나눴다.','cross'],['ranger_lamp','숲지기 벌레등','lantern','반딧불이 쉬어 가는 등. 주인은 그들의 길도 함께 지킨다.','leaf'],['sailor_lamp','항해사의 유리등','lantern','파도에 흔들려도 불빛은 돌아왔다. 지금은 지하의 물결을 비춘다.','wide']],
 [['rose_lamp','장미 향초등','lantern','불을 켜면 말린 장미 향이 난다. 정원의 기억이 잠시 돌아온다.','flower'],['pirate_lamp','해적의 신호등','lantern','먼 배에 신호를 보내던 등. 오늘은 가까운 동료를 부른다.','wide'],['beast_lamp','야수뼈 횃불등','lantern','작은 뼈로 불꽃을 둘렀다. 사냥꾼은 어둠도 전리품이라 불렀다.','horn'],['clock_lamp','시계공 태엽등','lantern','태엽을 감으면 작은 빛이 돈다. 기다림도 빛의 일부가 된다.','gear'],['desert_lamp','모래궁 유리등','lantern','모래를 녹여 만든 유리. 사막의 마지막 빛을 품었다.','crystal'],['swan_lamp','백조 무희의 등','lantern','흰 깃이 불빛을 감싼다. 마지막 춤은 등 안에서 이어진다.','feather'],['scale_lamp','은비늘 방수등','lantern','물속에서 꺼낸 등. 비늘 사이로 작은 빛이 빠져나온다.','scale'],['storm_lamp','폭풍선 갑판등','lantern','성난 파도에도 꺼지지 않았다. 주인은 아직 그 불빛을 믿는다.','block'],['druid_lamp','숲정령 씨앗등','lantern','빛나는 씨앗을 담았다. 길을 밝힌 뒤에는 다시 심어 주기로 했다.','leaf'],['rune_lamp','룬장인의 작업등','lantern','불꽃 아래 보호 기호를 새겼다. 긴 작업의 동반자였다.','rune'],['dream_lamp','꿈 수집가의 등','lantern','잠든 마을에서 빌린 작은 빛. 안을 보면 낯익은 풍경이 스친다.','veil']],
 [['phoenix_lamp','불사조 심화등','lantern','꺼진 재에서 다시 불을 얻었다. 어둠은 그 불꽃을 오래 품지 못한다.','feather'],['oracle_lamp','예언자의 수정등','lantern','내일의 빛을 조금 담았다. 오늘의 발걸음도 조심히 비춘다.','crystal'],['worldtree_lamp','세계수 반딧불등','lantern','오래된 나무의 빛나는 수액. 작은 숲이 유리 안에서 숨 쉰다.','leaf'],['royal_lamp','왕국 마지막 등불','lantern','모두 떠난 궁전에서 가져왔다. 남은 불꽃은 아직 누군가를 기다린다.','cross']]
]
};
for(const kind of ['helmet','armor','boots','off','lantern'])ITEM_POOLS[kind]=ITEM_DESIGNS[kind].map((list,tier)=>[...list,...extra[kind][tier]].map(entry=>({type:kind==='off'?'shield':kind,entry})));
