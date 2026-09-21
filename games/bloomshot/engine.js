(function(root){
'use strict';
const W=3200,H=1000,STEP=4,DT=.02,DROP_MS=25000;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CHARACTERS=[
 {name:'모리',title:'씨앗 포격수',hp:100,armor:.08,move:100,step:10,angle:[10,80],damage:42,radius:58,speed:1,special:'burst',weapon:'씨앗 폭탄',weapon2:'세 갈래 씨앗',color:'#a8e879',stats:[3,4,3,4,4,4]},
 {name:'피피',title:'꽃잎 유격수',hp:90,armor:0,move:120,step:12,angle:[15,85],damage:36,radius:50,speed:1.04,special:'petal',weapon:'쌍꽃봉오리',weapon2:'꽃잎 연사',color:'#ffb0b3',stats:[2,6,3,4,6,4]},
 {name:'루미',title:'포자 연금술사',hp:100,armor:.05,move:90,step:10,angle:[20,85],damage:38,radius:56,speed:.98,special:'poison',weapon:'굴착 포자',weapon2:'독안개 포자',color:'#c7a0f2',stats:[3,3,3,5,6,3]},
 {name:'치치',title:'도토리 명사수',hp:85,armor:0,move:110,step:12,angle:[5,65],damage:50,radius:40,speed:1.12,special:'pierce',weapon:'도토리 탄',weapon2:'송곳 도토리',color:'#ffd376',stats:[2,5,5,5,3,6]},
 {name:'바위콩',title:'수정 파괴자',hp:130,armor:.16,move:80,step:9,angle:[15,65],damage:49,radius:68,speed:.96,special:'crater',weapon:'거친 수정탄',weapon2:'지반 파괴탄',color:'#94ced8',stats:[6,2,5,6,3,3]},
 {name:'홍시',title:'불꽃 도깨비',hp:100,armor:.06,move:95,step:11,angle:[10,75],damage:44,radius:60,speed:1,special:'fire',weapon:'불씨 탄',weapon2:'타오르는 열매',color:'#ff9d6c',stats:[3,4,4,5,4,4]},
 {name:'눈송',title:'서리 마법사',hp:95,armor:.10,move:100,step:10,angle:[15,80],damage:37,radius:62,speed:1.03,special:'ice',weapon:'압설 눈뭉치',weapon2:'서리 구슬',color:'#a5e9ff',stats:[4,4,3,4,5,4]},
 {name:'번개비',title:'별빛 곡사수',hp:90,armor:0,move:115,step:11,angle:[25,88],damage:43,radius:52,speed:1.08,special:'star',weapon:'별 조각',weapon2:'길잡이 별',color:'#ede18f',stats:[2,5,4,5,6,5]}
];
// Damage area and terrain removal are independent. Ratios are relative to the normal shot.
const WEAPONS={
 normal:{count:1,damage:1,blast:1,crater:1,size:8,spread:[0],desc:'단발 · 피해 100% · 파괴 반경 100% · 안정적인 즉시 피해'},
 burst:{count:3,damage:.38,blast:.64,crater:.44,size:5,spread:[-6,0,6],desc:'3발 · 발당 피해 38% / 파괴 반경 44% · 분산 포격, 모두 맞으면 합계 114%'},
 petal:{count:2,damage:.58,blast:.7,crater:.58,size:6,spread:[-2.5,2.5],desc:'2발 · 발당 피해 58% / 파괴 반경 58% · 집중 연사, 모두 맞으면 합계 116%'},
 poison:{count:1,damage:.6,blast:.85,crater:.3,size:7,spread:[0],desc:'직격 피해 60% / 파괴 반경 30% · 중독: 피해자 자기 턴 시작에 6씩 3회'},
 pierce:{count:1,damage:1.2,blast:.4,crater:.2,size:4,spread:[0],pierce:100,armorPierce:.65,desc:'피해 120% / 파괴 반경 20% · 작은 탄, 지형 약 100 관통 · 방어력 65% 무시'},
 crater:{count:1,damage:.65,blast:.8,crater:1.7,size:10,spread:[0],desc:'피해 65% / 파괴 반경 170% · 체력보다 발판 파괴·낙사 유도'},
 fire:{count:1,damage:.55,blast:.9,crater:.45,size:8,spread:[0],desc:'피해 55% / 파괴 반경 45% · 불길: 자기 턴 시작에 영역 안이면 8, 2회 기회'},
 ice:{count:1,damage:.65,blast:.9,crater:.4,size:7,spread:[0],desc:'피해 65% / 파괴 반경 40% · 상대 다음 턴 이동력 절반'},
 star:{count:1,damage:.78,blast:.6,crater:.35,size:5,spread:[0],homing:true,desc:'단발 · 피해 78% / 파괴 반경 35% · 하강 중 가까운 적 쪽으로 약하게 유도'}
};
const NORMALS=[
 {...WEAPONS.normal,desc:'균형형 단발. 즉시 피해와 지형 파괴가 고르게 나옵니다.'},
 {...WEAPONS.normal,count:2,damage:.46,blast:.8,crater:.48,size:5,spread:[-.7,.7],desc:'쌍꽃봉오리 2발. 발당 피해와 파임은 작고 두 발 합계도 기준 단발보다 약하지만, 좁게 모여 날아갑니다.'},
 {...WEAPONS.normal,damage:.82,blast:.9,crater:1.15,depth:1.15,size:8,desc:'굴착 포자 단발. 피해는 낮고 땅을 더 깊게 파냅니다. 일반탄에는 독이 없습니다.'},
 {...WEAPONS.normal,damage:1.05,blast:.6,crater:.55,size:4,speed:1.12,desc:'고속 도토리 단발. 작은 탄으로 집중 피해를 주며 주변 지형은 적게 깎습니다. 일반탄은 관통하지 않습니다.'},
 {...WEAPONS.normal,damage:.78,blast:.9,crater:1.05,rough:true,size:9,desc:'거친 수정탄 단발. 피해를 줄이는 대신 크레이터에 높낮이가 큰 잔턱을 남겨 이동을 방해합니다.'},
 {...WEAPONS.normal,damage:.9,blast:1.25,crater:.7,size:7,desc:'확산 불씨 단발. 직접 피해는 약간 낮지만 피해 범위가 넓고 땅은 덜 파냅니다. 일반탄은 불길을 남기지 않습니다.'},
 {...WEAPONS.normal,damage:.9,blast:.9,crater:1.15,depth:.55,size:8,desc:'압설 눈뭉치 단발. 피해는 약간 낮고 지형을 넓고 얕게 깎습니다. 일반탄은 이동력을 줄이지 않습니다.'},
 {...WEAPONS.normal,damage:.9,blast:.55,crater:.45,speed:1.2,size:4,desc:'속사 별 조각 단발. 빠르고 작은 탄으로 좁은 틈을 노립니다. 피해와 파임은 줄고 일반탄에는 유도가 없습니다.'}
];
function weaponSpec(p,weapon){return weapon==='special'?WEAPONS[spec(p).special]:NORMALS[p.character]||NORMALS[0];}
function weaponDescription(p,weapon){const c=spec(p),w=weaponSpec(p,weapon),normal=weaponSpec(p,'normal');const details=weapon==='normal'?w.desc:({burst:'부채꼴 3발. 일반탄보다 발당 피해와 파임을 줄인 분산 포격입니다.',petal:'일반 쌍탄보다 넓게 퍼지는 2발. 모두 맞히면 더 강하지만 집중시키기 어렵습니다.',poison:'중독 단발. 피해자 자기 턴 시작마다 6씩 3회, 중첩 없이 갱신합니다.',pierce:'작은 관통탄. 지형 약 100 관통, 방어력 65% 무시. 파괴 범위는 작습니다.',crater:'넓게 폭파하는 지반 파괴탄. 즉시 피해보다 발판 제거와 낙사를 노립니다.',fire:'불길 단발. 피해자 자기 턴 시작에 영역 안이면 8 피해, 다음 2회 판정합니다.',ice:'서리 단발. 상대 다음 자기 턴 이동력을 절반으로 줄입니다.',star:'약유도 단발. 하강 중 300 이내 적 쪽으로 조금씩 방향을 보정합니다.'})[c.special];return {name:weapon==='normal'?c.weapon:c.weapon2,kind:weapon==='normal'?'일반탄':'특수탄',details,stats:w.count+'발 · 발당 기준 피해 '+(c.damage*w.damage).toFixed(1)+' · 피해 반경 '+Math.round(c.radius*w.blast)+' · 파괴 반경 '+Math.round(c.radius*w.crater),compare:weapon==='special'?'일반탄 대비 발당 피해 '+Math.round(w.damage/normal.damage*100)+'% / 파괴 반경 '+Math.round(w.crater/normal.crater*100)+'%':'방어력·착탄 거리·강화 아이템 적용 전 수치'};}

const ITEMS={double:{name:'2연발',label:'DOUBLE',color:'#ffe28b',desc:'첫 탄 명중·소실 후 같은 각도·파워로 두 번째 발사'},power:{name:'파워 ×2',label:'POWER',color:'#ff9f8d',desc:'이번 발사의 피해량 2배'},heal:{name:'회복 50%',label:'HEAL',color:'#9ceab7',desc:'최대 체력의 50% 회복'},move:{name:'이동 충전',label:'MOVE',color:'#a5dffc',desc:'이동 포인트 전체 충전'},shield:{name:'보호막',label:'GUARD',color:'#b9b1ff',desc:'다음 피해 35 흡수'},poison:{name:'독안개',label:'SPORE',color:'#bedf80',desc:'피격자 중독: 자기 턴 시작에 6 피해씩 3회 · 중첩 없이 갱신'},freeze:{name:'서리 탄',label:'FROST',color:'#92e4f0',desc:'맞은 상대의 다음 이동력 절반'},wind:{name:'바람 반전',label:'WIND',color:'#e6d4ff',desc:'현재 바람의 방향을 반대로'}};
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
const MAPS=[{name:'거목의 다리',hint:'얇은 나무 다리 · 끊어지는 연결부 · 잎바람',sky:['#abc982','#e6d7a0'],rock:'#756047',edge:'#b0ce70',particle:'leaf'}, {name:'안개 공중정원',hint:'겹친 부유섬 · 아래 발판으로 추락 · 꽃잎',sky:['#173957','#73949f'],rock:'#495d68',edge:'#84b696',particle:'petal'}, {name:'서리 균열',hint:'갈라진 얼음판 · 깊은 낭떠러지 · 눈송이',sky:['#34465f','#99b5c0'],rock:'#648999',edge:'#e3f8ff',particle:'snow'}, {name:'황혼 철골',hint:'좁은 철골 · 높은 턱 · 떠다니는 종잇조각',sky:['#706987','#dcb1a0'],rock:'#635765',edge:'#dba58d',particle:'paper'}, {name:'별빛 유적',hint:'계단과 탑 · 낮은 통로 · 빛나는 모래',sky:['#302c51','#c39377'],rock:'#766153',edge:'#eac788',particle:'ember'}];
function column(s,x){return x<0||x>W?[]:s.solids[clamp(Math.round(x/STEP),0,s.solids.length-1)]||[];}
function ground(s,x,from=-Infinity){const c=column(s,x);for(let i=0;i<c.length;i+=2)if(c[i+1]>=from-1)return c[i];return H+120;}
function solidAt(s,x,y){const c=column(s,x);for(let i=0;i<c.length;i+=2)if(y>=c[i]&&y<=c[i+1])return true;return false;}
function surfaceAngle(s,x,y){
 const sample=(xx,span)=>{const gy=ground(s,xx,y-36);return Math.abs(gy-y)<=Math.max(28,span*.95)?gy:null;};
 for(const span of [24,18,12,8]){const l=sample(x-span,span),r=sample(x+span,span);if(l!==null&&r!==null)return clamp(Math.atan2(r-l,span*2),-.48,.48);}
 return 0;
}
function muzzlePosition(s,p){const tilt=(p.falling||s.jump?.sid===p.sid)?0:surfaceAngle(s,p.x,p.y),lx=p.face*29,ly=-44,cs=Math.cos(tilt),sn=Math.sin(tilt);return{x:p.x+lx*cs-ly*sn,y:p.y+lx*sn+ly*cs,tilt};}
function bodyBlocked(s,x,y){return [-15,0,15].some(dx=>[-12,-30,-49].some(dy=>solidAt(s,x+dx,y+dy)));}
function ensureSlots(p){if(!Array.isArray(p.slots)||p.slots.length!==4){const order=['double','power','heal','move','shield','poison','freeze','wind'],slots=[];for(const key of order){const n=Math.max(0,p.items?.[key]||0);for(let i=0;i<n&&slots.length<4;i++)slots.push(key);}while(slots.length<4)slots.push(null);p.slots=slots;}return p.slots;}
function slotCount(p){return ensureSlots(p).filter(Boolean).length;}
function addSlot(p,item){const slots=ensureSlots(p);const idx=slots.indexOf(null);if(idx<0)return false;slots[idx]=item;return true;}
function removeSlot(p,item){const slots=ensureSlots(p);const idx=slots.indexOf(item);if(idx<0)return false;slots[idx]=null;const filled=slots.filter(Boolean);while(filled.length<4)filled.push(null);p.slots=filled;return true;}
function destroy(s,x,y,radius,rough=false,depth=1){for(let i=Math.max(0,Math.floor((x-radius)/STEP));i<=Math.min(s.solids.length-1,Math.ceil((x+radius)/STEP));i++){const dx=i*STEP-x;if(Math.abs(dx)>=radius)continue;const h=Math.sqrt(radius*radius-dx*dx)*depth*(rough?.35+.65*(.5+.5*Math.sin(i*.58)):1),lo=Math.floor(y-h),hi=Math.ceil(y+h),out=[];const c=s.solids[i];for(let j=0;j<c.length;j+=2){const a=c[j],b=c[j+1];if(b<lo||a>hi)out.push(a,b);else{if(a<lo)out.push(a,lo);if(b>hi)out.push(hi,b);}}s.solids[i]=out;s.terrain[i]=out[0]??H+120;}}

function spec(p){return CHARACTERS[p.character]||CHARACTERS[0];}
function event(s,type,data={}){s.eventSeq++;s.events.push({id:s.eventSeq,type,at:s.simAt,...data});if(s.events.length>35)s.events.shift();}
function configure(p){const c=spec(p);p.maxHp=c.hp;p.hp=c.hp;p.maxFuel=c.move;p.fuel=c.move;p.shield=0;p.frozen=0;p.poison=null;p.boost=null;}
function create(roster,seed=1234,now=Date.now()){
 const s={version:9,seed:seed>>>0,id:String(seed)+'-'+now,seq:0,phase:'setup',map:0,turn:0,turnSerial:0,round:1,wind:0,deadline:0,simAt:now,nextDropAt:0,nextEnvAt:0,dropSeq:0,envSeq:0,eventSeq:0,events:[],drops:[],zones:[],envs:[],projectiles:[],queue:[],repeatShot:null,jump:null,solids:[],terrain:[],players:[],shot:null,winner:null};
 s.players=roster.slice(0,8).map((r,i)=>({sid:String(r.sessionId),nick:String(r.nick||'정령').slice(0,24),seat:Number(r.seat)||0,character:i%8,x:0,y:0,face:1,items:{double:1,power:1,heal:1,move:0,shield:0,poison:0,freeze:0,wind:0},slots:['double','power','heal',null],lastSeq:0,cpu:!!r.cpu,lastAngle:45,lastPower:60}));
 if(s.players.length===1)s.players.push({...s.players[0],sid:'bloom-cpu',nick:'연습 정령',seat:1,character:2,cpu:true,items:{...s.players[0].items},slots:[...s.players[0].slots]});
 s.players.forEach(configure);buildMap(s);return s;
}
function buildMap(s){
 const baked=root.BloomMapSolids?.[s.map];
 s.solids=baked?baked.map(c=>c.slice()):Array.from({length:W/STEP+1},()=>[]);
 const slab=(x1,x2,y,thick,wave=0)=>{for(let i=Math.ceil(x1/STEP);i<=Math.floor(x2/STEP);i++){const top=Math.round(y+Math.sin(i*STEP/110)*wave);const edge=Math.sin(Math.PI*(i*STEP-x1)/(x2-x1));const depth=s.map===1?Math.round(thick*(.4+.6*edge)+Math.abs(Math.sin(i*.37))*15):s.map===2?thick+Math.round(Math.abs(Math.sin(i*.6))*12):thick;s.solids[i].push(top,top+depth);}};
 if(!baked){
 if(s.map===0){slab(80,1080,460,88,12);slab(1080,1430,460,30,5);slab(1540,2020,420,85,8);slab(2020,2360,460,28);slab(2360,3120,460,95,10);slab(870,1310,725,70,8);slab(1820,2210,735,70,8);}
 if(s.map===1){slab(80,720,365,85,14);slab(920,1420,580,75,14);slab(1520,2220,355,85,14);slab(2440,3120,525,90,12);slab(350,1130,750,65,10);slab(1840,2640,755,70,10);slab(1170,1610,245,60,8);}
 if(s.map===2){slab(50,730,465,60,5);slab(875,1280,505,50,4);slab(1510,1910,420,60,4);slab(2070,2460,510,48,4);slab(2610,3150,465,62,4);slab(600,985,765,60);slab(1780,2160,765,55);}
 if(s.map===3){slab(70,650,470,30);slab(650,930,390,35);slab(1070,1660,600,30);slab(1780,2250,420,32);slab(2370,3120,480,30);slab(360,1220,770,28);slab(1600,2720,790,30);slab(1450,1810,270,28);slab(2820,2890,300,180);}
 if(s.map===4){slab(70,800,530,100);slab(800,1040,470,160);slab(1040,1250,410,220);slab(1250,1470,350,90);slab(1250,1740,680,70);slab(1750,2200,430,70);slab(1940,2080,260,170);slab(2390,3140,530,100);slab(2590,2770,450,80);slab(550,1230,810,70);}
 }
 for(const c of s.solids){const pairs=[];for(let i=0;i<c.length;i+=2)pairs.push([c[i],c[i+1]]);pairs.sort((a,b)=>a[0]-b[0]);const merged=[];for(const [a,b]of pairs){if(merged.length&&a<=merged.at(-1))merged[merged.length-1]=Math.max(b,merged.at(-1));else merged.push(a,b);}c.splice(0,c.length,...merged);}
 s.terrain=s.solids.map(c=>c[0]??H+120);
 s.players.forEach((p,i)=>{const target=260+i*((W-520)/Math.max(1,s.players.length-1));let x=target;for(let distance=0;distance<500;distance+=STEP){const candidates=[target+distance,target-distance];const found=candidates.find(xx=>xx>50&&xx<W-50&&ground(s,xx)>70&&ground(s,xx)<850&&Math.abs(ground(s,xx-26)-ground(s,xx+26))<18&&!s.players.slice(0,i).some(q=>Math.abs(q.x-xx)<50));if(found!==undefined){x=found;break;}}p.x=x;p.y=ground(s,x);p.face=p.x<W/2?1:-1;p.falling=false;p.fallVy=0;});
}
function setWind(s){s.wind=Math.round((random(s)-.5)*76);}
function spawnDrop(s,at){const keys=Object.keys(ITEMS),d={id:++s.dropSeq,item:keys[Math.floor(random(s)*keys.length)],x:100+random(s)*(W-200),y:-60,born:at,status:'chute',vy:0,cutAt:0};s.drops.push(d);event(s,'supply',{dropId:d.id,x:d.x,item:d.item});return d;}
function spawnEnv(s,at){
 let env=null;
 for(let tries=0;tries<18&&!env;tries++){const type=random(s)<.55?'wind':'fire',x=180+random(s)*(W-360),floor=ground(s,x);if(floor<180||floor>930)continue;if(s.players.some(p=>p.hp>0&&Math.abs(p.x-x)<140))continue;const height=(type==='wind'?300:250)+random(s)*(type==='wind'?120:95),radius=type==='wind'?46:40;env={id:++s.envSeq,type,x,y:floor-6,top:Math.max(48,floor-height),radius,strength:22+random(s)*10,dir:random(s)<.5?-1:1,boost:1.18+random(s)*.09,born:at,ends:at+9000+random(s)*5000};}
 if(!env)return null;s.envs.push(env);event(s,'env_spawn',{envType:env.type,x:env.x,y:env.y,top:env.top,dir:env.dir,radius:env.radius});return env;
}
function advanceEnvs(s,t){while(s.nextEnvAt&&t>=s.nextEnvAt){if(s.envs.length<2)spawnEnv(s,s.nextEnvAt);s.nextEnvAt+=18000+Math.round(random(s)*16000);}s.envs=s.envs.filter(e=>e.ends>t);}
function start(s,now){if(s.phase!=='setup')return false;s.simAt=now;s.phase='aim';s.turn=Math.max(0,s.players.findIndex(p=>p.hp>0));s.turnSerial++;s.deadline=now+10000;s.nextDropAt=now+DROP_MS;s.nextEnvAt=now+12000+Math.round(random(s)*8000);setWind(s);spawnDrop(s,now);event(s,'turn',{sid:s.players[s.turn].sid});checkWinner(s,now);return true;}
function checkWinner(s,now){const alive=s.players.filter(p=>p.hp>0);if(alive.length>1)return false;s.phase='over';s.winner=alive[0]?.sid||null;s.deadline=now+7000;return true;}
function next(s,now){
 if(checkWinner(s,now))return;for(let i=0;i<s.players.length;i++){s.turn=(s.turn+1)%s.players.length;if(s.turn===0)s.round++;if(s.players[s.turn].hp>0)break;}
 const p=s.players[s.turn];turnEffects(s,p);if(p.hp<=0){next(s,now);return;}p.fuel=p.frozen>0?p.maxFuel*.5:p.maxFuel;if(p.frozen>0)p.frozen--;p.boost=null;
 s.phase='aim';s.turnSerial++;s.deadline=now+10000;s.shot=null;setWind(s);event(s,'turn',{sid:p.sid});
}
function turnEffects(s,p){
 if(p.poison?.turns>0){hurt(s,p,p.poison.damage,'poison');p.poison.turns--;if(!p.poison.turns)p.poison=null;}
 let burn=0;for(const z of s.zones){if((z.pending?.[p.sid]||0)<=0)continue;z.pending[p.sid]--;if(Math.abs(p.x-z.x)<z.radius&&Math.abs(p.y-z.y)<100)burn=Math.max(burn,z.damage);}
 if(burn&&p.hp>0)hurt(s,p,burn,'fire');
 s.zones=s.zones.filter(z=>s.players.some(q=>q.hp>0&&(z.pending?.[q.sid]||0)>0));
}
function pickup(s,p){for(const d of s.drops)if(d.status==='ground'&&Math.abs(d.x-p.x)<38&&Math.abs(d.y-(p.y-14))<40){if(slotCount(p)>=4)continue;if(!addSlot(p,d.item))continue;p.items[d.item]=(p.items[d.item]||0)+1;d.status='taken';event(s,'pickup',{sid:p.sid,item:d.item,x:d.x,y:d.y});}}
function hurt(s,p,amount,kind,armorPierce=0){let damage=Math.max(1,Math.round(amount*(['fall','poison','fire'].includes(kind)?1:1-spec(p).armor*(1-armorPierce))));const absorb=Math.min(p.shield,damage);p.shield-=absorb;damage-=absorb;p.hp=Math.max(0,p.hp-damage);if(damage)event(s,'damage',{sid:p.sid,x:p.x,y:p.y-80,damage,kind});}
function settle(s){for(const p of s.players){if(p.hp<=0||s.jump?.sid===p.sid)continue;const y=ground(s,p.x,p.y-2);if(y>p.y+2){if(!p.falling){p.falling=true;p.fallFrom=p.y;p.fallVy=0;}}else{p.y=y;pickup(s,p);}}}
function advanceFalls(s){for(const p of s.players){if(!p.falling||p.hp<=0)continue;const floor=ground(s,p.x,p.y-2);p.fallVy+=760*DT;p.y+=p.fallVy*DT;if(p.y>H+50){p.hp=0;p.falling=false;event(s,'fall',{sid:p.sid,x:p.x,y:p.y});}else if(p.y>=floor){p.y=floor;p.falling=false;if(p.y-p.fallFrom>90)hurt(s,p,(p.y-p.fallFrom-90)*.22,'fall');pickup(s,p);event(s,'land',{sid:p.sid,x:p.x,y:p.y});}}}
function impact(s,pr){
 const {x,y,radius,damage,effect}=pr;event(s,'blast',{x,y,radius:Math.max(radius,pr.craterRadius),color:pr.color,character:pr.character,weapon:pr.weapon,effect:pr.effect,envType:pr.envType||'',envWind:!!pr.envWind,envFire:!!pr.envFire,boostVisual:pr.boostVisual||'',statusEffect:pr.statusEffect||'',direct:!!pr.hitSid,hitSid:pr.hitSid||''});
 for(const p of s.players){if(p.hp<=0)continue;const dist=Math.hypot(p.x-x,p.y-25-y),direct=p.sid===pr.hitSid;if(direct||dist<radius+20){
  hurt(s,p,damage*(direct?1:Math.max(0,1-dist/(radius+20))),'hit',pr.armorPierce);
  if(effect==='ice'||pr.statusEffect==='freeze')p.frozen=1;
  if(effect==='poison'||pr.statusEffect==='poison')p.poison={damage:6,turns:3};
 }}
 destroy(s,x,y,pr.craterRadius,pr.rough,pr.craterDepth);
 if(effect==='fire')s.zones.push({x,y,radius:95,type:'fire',damage:8,pending:Object.fromEntries(s.players.filter(p=>p.hp>0).map(p=>[p.sid,2])),owner:pr.owner});
 settle(s);
}
function projectile(s,p,angle,power,weapon,boost,at,extraAngle=0){
 const c=spec(p),w=weaponSpec(p,weapon),rad=(angle+extraAngle)*Math.PI/180,speed=power*11.1*c.speed*(w.speed||1),m=muzzlePosition(s,p);
 return {owner:p.sid,character:p.character,weapon,x:m.x,y:m.y,vx:Math.cos(rad)*speed*p.face,vy:-Math.sin(rad)*speed,age:0,born:at,damage:c.damage*w.damage*(boost==='power'?2:1)*1.65,radius:c.radius*w.blast*1.22,craterRadius:c.radius*w.crater*1.24,drawRadius:w.size*1.34,rough:!!w.rough,craterDepth:w.depth||1,pierceLeft:w.pierce||0,armorPierce:w.armorPierce||0,homing:!!w.homing,effect:weapon==='special'?c.special:'',boostVisual:boost||'',statusEffect:boost==='poison'?'poison':boost==='freeze'?'freeze':'',color:c.color,trail:[]};
}
function launch(s,q){const p=s.players.find(p=>p.sid===q.sid);if(!p||p.hp<=0)return;const w=weaponSpec(p,q.weapon),m=muzzlePosition(s,p);for(const a of w.spread){const pr=projectile(s,p,q.angle,q.power,q.weapon,q.boost,s.simAt,a);pr.damage*=1+Math.max(0,s.round-10)*.08;s.projectiles.push(pr);}event(s,'launch',{sid:p.sid,x:m.x,y:m.y,character:p.character,weapon:q.weapon,effect:q.weapon==='special'?spec(p).special:''});}
function command(s,sid,c,now,hostSid){
 if(!c||!Number.isSafeInteger(c.seq)||c.seq<1||c.match!==s.id)return false;const p=s.players.find(p=>p.sid===sid);if(!p||c.seq<=p.lastSeq)return false;p.lastSeq=c.seq;
 if(s.phase==='setup'){
  if(c.kind==='character'&&Number.isInteger(c.value)&&c.value>=0&&c.value<CHARACTERS.length){p.character=c.value;configure(p);return true;}
  if(c.kind==='map'&&sid===hostSid&&Number.isInteger(c.value)&&c.value>=0&&c.value<MAPS.length){s.map=c.value;buildMap(s);return true;}
  return c.kind==='start'&&sid===hostSid?start(s,now):false;
 }
 if(s.phase!=='aim'||s.players[s.turn]!==p||p.hp<=0||p.falling||now>=s.deadline)return false;
 if(c.kind==='move'){
  if(c.value!==-1&&c.value!==1)return false;p.face=c.value;if(p.fuel<3)return false;const x=clamp(p.x+c.value*spec(p).step,25,W-25);
  if(ground(s,x,p.y-24)<p.y-24||bodyBlocked(s,x,p.y)||s.players.some(q=>q!==p&&q.hp>0&&Math.abs(q.x-x)<42))return false;p.x=x;const floor=ground(s,x,p.y-24);if(floor<=p.y+24)p.y=floor;p.fuel=Math.max(0,p.fuel-3);settle(s);if(p.hp<=0)next(s,now);return true;
 }
 if(c.kind==='jump'){const cost=p.maxFuel*.3;if(p.fuel+1e-6<cost)return false;p.fuel-=cost;s.jump={sid,fromX:p.x,fromY:p.y,at:now,duration:1050,distance:175*p.face};s.phase='jump';event(s,'jump',{sid});return true;}
 if(c.kind==='pass'){next(s,now);return true;}
 if(c.kind==='item'){
  const item=c.item;if(!ITEMS[item]||!p.items[item])return false;
  if(['double','power','poison','freeze'].includes(item)){p.boost=p.boost===item?null:item;return true;}
  if(item==='heal'){if(p.hp>=p.maxHp)return false;p.hp=Math.min(p.maxHp,p.hp+p.maxHp*.5);}if(item==='move')p.fuel=p.maxFuel;if(item==='shield')p.shield+=35;if(item==='wind')s.wind=-s.wind;p.items[item]--;removeSlot(p,item);event(s,'item',{sid,item});return true;
 }
 if(c.kind!=='fire'||!Number.isFinite(c.angle)||!Number.isFinite(c.power)||!['normal','special'].includes(c.weapon))return false;
 const cfg=spec(p),angle=clamp(c.angle,...cfg.angle),power=clamp(c.power,10,100),boost=p.boost;if(boost){if(!p.items[boost])return false;p.items[boost]--;removeSlot(p,boost);p.boost=null;}
 p.lastAngle=angle;p.lastPower=power;s.shot={id:s.turnSerial,owner:sid,angle,power,weapon:c.weapon,boost,at:now};s.phase='flight';s.queue=[{sid,angle,power,weapon:c.weapon,boost,at:now}];s.repeatShot=boost==='double'?{sid,angle,power,weapon:c.weapon,boost:null}:null;s.deadline=now+16000;s.flightEnd=0;return true;
}
function advanceDrops(s,t){
 while(t>=s.nextDropAt){spawnDrop(s,s.nextDropAt);s.nextDropAt+=DROP_MS;}
 for(const d of s.drops){
  if(d.status==='chute'){d.x=clamp(d.x+s.wind*.048*DT,35,W-35);const f=clamp((t-d.born)/DROP_MS,0,1);d.y=-60+(ground(s,d.x)-14+60)*f;if(f>=1){d.status='ground';d.landedAt=t;event(s,'land',{x:d.x,y:d.y});}}
  else if(d.status==='fall'){const floor=ground(s,d.x,d.y+12)-14;d.vy+=900*DT;d.y+=d.vy*DT;if(d.y>=floor){d.y=floor;d.status='ground';d.landedAt=t;event(s,'land',{x:d.x,y:d.y});}}
  else if(d.status==='ground'){const floor=ground(s,d.x,d.y+12);if(floor>d.y+16){d.status='fall';d.vy=0;}else d.y=floor-14;}
  if(d.y>H+50)d.status='taken';
 }
 for(const p of s.players)if(p.hp>0)pickup(s,p);s.drops=s.drops.filter(d=>d.status!=='taken');
}
function updateProjectiles(s,t){
 while(s.queue.length&&s.queue[0].at<=t)launch(s,s.queue.shift());
 for(const pr of s.projectiles){pr.age+=DT;const dt=DT/4;
  for(let k=0;k<4&&!pr.dead;k++){
   pr.vx+=s.wind*dt*.72;pr.vy+=330*dt;
   if(pr.homing&&pr.vy>0){const target=s.players.filter(p=>p.hp>0&&p.sid!==pr.owner&&Math.hypot(p.x-pr.x,p.y-28-pr.y)<300).sort((a,b)=>Math.hypot(a.x-pr.x,a.y-28-pr.y)-Math.hypot(b.x-pr.x,b.y-28-pr.y))[0];if(target){const speed=Math.hypot(pr.vx,pr.vy),heading=Math.atan2(pr.vy,pr.vx),desired=Math.atan2(target.y-28-pr.y,target.x-pr.x),diff=Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading));if(Math.abs(diff)<Math.PI*.6){const direction=heading+clamp(diff,-.5*dt,.5*dt);pr.vx=Math.cos(direction)*speed;pr.vy=Math.sin(direction)*speed;}}}
   pr.x+=pr.vx*dt;pr.y+=pr.vy*dt;if(pr.pierceActive)pr.pierceLeft=Math.max(0,pr.pierceLeft-Math.hypot(pr.vx,pr.vy)*dt);
   for(const env of s.envs){if(pr.x>env.x-env.radius&&pr.x<env.x+env.radius&&pr.y>env.top&&pr.y<env.y){if(env.type==='wind'){if(!pr.windTouched?.includes(env.id)){pr.windTouched=(pr.windTouched||[]);pr.windTouched.push(env.id);pr.envWind=true;event(s,'env_touch',{envType:'wind',x:pr.x,y:pr.y});}pr.vx+=env.dir*env.strength*dt*2.75;pr.vy-=62*dt;pr.envType='wind';}
     else{if(!pr.fireBoosted?.includes(env.id)){pr.damage*=env.boost;pr.radius*=1.12;pr.craterRadius*=1.1;pr.vx*=1.08;pr.vy*=1.08;pr.fireBoosted=(pr.fireBoosted||[]);pr.fireBoosted.push(env.id);pr.envFire=true;event(s,'env_touch',{envType:'fire',x:pr.x,y:pr.y});}pr.vy-=26*dt;pr.envType='fire';}}}
   for(const d of s.drops)if(d.status==='chute'&&(Math.hypot(pr.x-d.x,pr.y-d.y)<25||Math.hypot(pr.x-d.x,pr.y-(d.y-52))<35)){d.status='fall';d.vy=800;d.cutAt=t;event(s,'cut',{x:d.x,y:d.y});}
   // Above-camera shots remain alive. Only bounded side/bottom misses disappear.
   if(pr.x < -480||pr.x>W+480||pr.y>H+80||pr.age>15){pr.dead=true;event(s,'miss',{x:pr.x,y:pr.y});break;}
   const hit=s.players.find(p=>p.hp>0&&(p.sid!==pr.owner||pr.age>.25)&&Math.hypot(p.x-pr.x,p.y-28-pr.y)<17+pr.drawRadius);
   if(hit){pr.hitSid=hit.sid;impact(s,pr);pr.dead=true;}
   else if(pr.x>=0&&pr.x<=W&&solidAt(s,pr.x,pr.y)){
    if(pr.pierceLeft>0){pr.pierceActive=true;destroy(s,pr.x,pr.y,pr.craterRadius);settle(s);if(pr.pierceLeft<=0){impact(s,pr);pr.dead=true;}}
    else{impact(s,pr);pr.dead=true;}
   }
  }
  pr.trail.push([Math.round(pr.x),Math.round(pr.y)]);if(pr.trail.length>22)pr.trail.shift();
 }
 s.projectiles=s.projectiles.filter(p=>!p.dead);if(!s.projectiles.length&&!s.queue.length&&s.repeatShot){s.queue.push({...s.repeatShot,at:t+350});s.repeatShot=null;}if(s.phase==='flight'&&!s.projectiles.length&&!s.queue.length){if(!s.flightEnd)s.flightEnd=t+320;if(t>=s.flightEnd)next(s,t);}
}
function tick(s,now){
 if(s.phase==='setup'||s.phase==='over')return false;let changed=false;const limit=Math.min(now,s.simAt+120000);
 while(s.simAt+20<=limit&&s.phase!=='over'){
  s.simAt+=20;const t=s.simAt;changed=true;advanceDrops(s,t);advanceEnvs(s,t);
  if(s.phase==='jump'&&s.jump){const j=s.jump,p=s.players.find(p=>p.sid===j.sid),f=clamp((t-j.at)/j.duration,0,1),x=clamp(j.fromX+j.distance*f,25,W-25),y=j.fromY-140*Math.sin(Math.PI*f),floor=ground(s,p.x,p.y-2);if(!bodyBlocked(s,x,p.y)&&!s.players.some(q=>q!==p&&q.hp>0&&Math.abs(q.x-x)<36&&Math.abs(q.y-p.y)<48))p.x=x;
   const descending=f>.5,hitHead=!descending&&bodyBlocked(s,p.x,y);if((descending&&y>=floor)||f>=1||hitHead){if(descending&&y>=floor)p.y=floor;s.jump=null;s.phase='aim';settle(s);}else p.y=y;
  }
  advanceFalls(s);
  if(s.phase==='flight')updateProjectiles(s,t);
  if(s.phase==='aim'&&t>=s.deadline)next(s,t);if(s.phase==='aim'&&!checkWinner(s,t)&&s.players[s.turn].hp<=0)next(s,t);
 }return changed;
}
function roster(s,players,now){const ids=new Set(players.map(p=>String(p.sessionId)));let changed=false;for(const p of s.players)if(!p.cpu&&!ids.has(p.sid)&&p.hp>0){p.hp=0;changed=true;}if(changed&&s.phase==='aim'){if(!checkWinner(s,now)&&s.players[s.turn].hp<=0)next(s,now);}return changed;}
function trace(s,p,angle,power){const pr=projectile(s,p,angle,power,'normal',null,0),path=[[pr.x,pr.y]];let hit={x:pr.x,y:pr.y,miss:true};for(let i=0;i<900;i++){pr.vx+=s.wind*DT*.72;pr.vy+=330*DT;pr.x+=pr.vx*DT;pr.y+=pr.vy*DT;if(i%2===0)path.push([pr.x,pr.y]);if(pr.x < -480||pr.x>W+480||pr.y>H+80){hit={x:pr.x,y:pr.y,miss:true};break;}const victim=s.players.find(q=>q.hp>0&&(q!==p||i>14)&&Math.hypot(q.x-pr.x,q.y-28-pr.y)<25);if(victim||(pr.x>=0&&pr.x<=W&&solidAt(s,pr.x,pr.y))){hit={x:pr.x,y:pr.y,miss:false};break;}}return {path,hit};}
function cpuAim(s,precise=false){const p=s.players[s.turn],target=s.players.filter(q=>q!==p&&q.hp>0).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];if(!target)return{angle:45,power:65};p.face=target.x>p.x?1:-1;let best={angle:45,power:75},score=Infinity;for(let a=Math.max(25,spec(p).angle[0]);a<=spec(p).angle[1];a+=4)for(let v=25;v<=100;v+=3){const t=trace(s,p,a,v),d=Math.hypot(t.hit.x-target.x,t.hit.y-target.y)+(t.hit.miss?1000:0);if(d<score){score=d;best={angle:a,power:v};}}if(!precise){const mild=random(s)<.22,angleError=(random(s)*2-1)*(mild?2:9),powerError=(random(s)*2-1)*(mild?3:13);best.angle=clamp(best.angle+angleError,...spec(p).angle);best.power=clamp(best.power+powerError,18,100);}return best;}
function shiftClock(s,delta){s.simAt+=delta;s.deadline+=delta;if(s.nextDropAt)s.nextDropAt+=delta;if(s.nextEnvAt)s.nextEnvAt+=delta;if(s.shot)s.shot.at+=delta;if(s.jump)s.jump.at+=delta;if(s.flightEnd)s.flightEnd+=delta;for(const d of s.drops){d.born+=delta;if(d.cutAt)d.cutAt+=delta;if(d.landedAt)d.landedAt+=delta;}for(const env of s.envs){env.born+=delta;env.ends+=delta;}for(const q of s.queue)q.at+=delta;for(const p of s.projectiles)p.born+=delta;for(const e of s.events)e.at+=delta;}
root.BloomEngine={W,H,STEP,DROP_MS,WEAPONS,NORMALS,weaponSpec,weaponDescription,MAPS,solidAt,surfaceAngle,muzzlePosition,destroy,settle,CHARACTERS,ITEMS,create,ground,buildMap,start,command,tick,roster,trace,cpuAim,shiftClock,spawnDrop,spec};
})(typeof globalThis!=='undefined'?globalThis:this);
