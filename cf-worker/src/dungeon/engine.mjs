import {weaponSkill} from './weapon-skills.mjs';
import {WEAPONS,MONSTERS,SLOTS,RARITIES,rng,makeItem,createMatchItemCatalog,itemFeedback,equipmentSound,clamp,distance,finite} from './catalog.mjs';
import {buildMap,inside,roomAt,walkable,lineOfSight,move,findPath,pathSearch,bodyClear} from './world.mjs';

import {visibleFrom,VISION_ARC} from './vision.mjs';
import {attackContains} from './combat.mjs';

// Authoritative simulation: no DOM, image, audio, browser clock or network dependencies.
// LocalTransport owns this instance now; a server can own the identical instance later.
export class DungeonGame {
  constructor(options={}){
    this.options=options;this.seed=options.seed??Date.now();this.itemCatalog=createMatchItemCatalog(this.seed);this.random=rng(this.seed);this.serial=0;this.time=0;this.tickId=0;
    this.mode=options.mode==='dungeon'?'dungeon':'arena';this.role=options.role==='master'?'master':'adventurer';
    this.map=buildMap(this.mode,this.random);this.entities=[];this.loot=[];this.chests=[];this.traps=[];this.projectiles=[];this.zones=[];this.effects=[];
    this.messages=[];this.result=null;this.phase=this.mode==='arena'?'spawn':this.role==='master'?'planning':'playing';this.spawnUntil=10;this.respawnAt=60;this.currentRoom=0;this.healUntil=0;
    this.masterId=this.mode==='dungeon'?(this.role==='master'?(options.masterId||'local'):'ai-master'):null;
    this.possession=null;this.directed=new Map();this.builders={};this.quizByPlayer=new Map();this.inputs=new Map();this.commands=[];
    this.roster=(options.roster||[{id:'local',name:'나'}]).map(p=>({...p}));const botCount=clamp(options.bots??2,0,2);
    for(let i=0;i<botCount;i++)this.roster.push({id:'bot'+i,name:'모험가 '+(i+1),bot:true});
    if(this.role==='master'&&this.mode==='dungeon'&&this.roster.length===1)this.roster.push({id:'bot0',name:'모험가 1',bot:true});
    const adventurers=this.roster.filter(p=>p.id!==this.masterId);
    this.partySize=Math.max(1,adventurers.length);
    for(let i=0;i<adventurers.length;i++){
      const r=this.mode==='arena'?this.map.rooms[[0,11,3,8,2,9,4,7][i%8]]:this.map.rooms[0];
      this.entities.push(this.actor(adventurers[i].id,'player',r.x+r.w*.35+(i%4)*1.5,r.y+r.h*.5+Math.floor(i/4)*1.5,{name:adventurers[i].name,headId:'p'+(i%8+1),bot:!!adventurers[i].bot,team:this.mode==='dungeon'?'party':adventurers[i].id,room:r.id}));
      if(!adventurers[i].bot)this.inputs.set(adventurers[i].id,{});
    }
    for(const r of this.map.rooms){
      if(this.mode==='dungeon'){
        if(r.editable)this.builders[r.id]={budget:Math.round(({2:24,3:32,4:40,5:48,7:72}[r.id])*(1+.45*(this.partySize-1))),spent:0,chests:0,locked:false};
        if(r.id===0)for(let i=0;i<this.partySize;i++)this.addChest(r,0,{x:r.x+6+(i%4)*3,y:r.y+6+Math.floor(i/4)*3},2);
        if(r.id===1)for(let i=0;i<this.partySize;i++)this.addMonster('skeleton',0,r);
      }else{
        const n=1;for(let i=0;i<n;i++){const slime=this.addMonster('slime',0,r);slime.equipment={};slime.base={hp:18,attack:3,defense:0,agility:100};slime.speed=1.8;slime.maxHp=18;slime.hp=18;slime.starterSlime=true;}
        for(let i=0;i<1+(5-n);i++)this.addChest(r);
      }
    }
    if(this.mode==='dungeon'&&this.masterId==='ai-master')this.autoBuild();
    Object.defineProperty(this.map,'bodies',{value:this.entities,enumerable:false,writable:true});
    this.spawnTreasure();
    this.note(this.mode==='arena'?'10초 동안 시작 위치를 클릭하세요.':'입구 상자에서 장비를 챙기세요.');
  }
  createItem(id,options){return makeItem(this.random,id,{...options,catalog:this.itemCatalog});}
  id(prefix){return `${prefix}-${++this.serial}`;}
  note(text){this.messages.push({id:this.serial++,time:this.time,text});if(this.messages.length>5)this.messages.shift();}
  actor(id,kind,x,y,extra={}){
    const main=this.createItem(this.id('item'),{kind:'main',tier:0,starter:true});
    return {id,kind,x,y,room:0,name:id,team:'monsters',hp:100,maxHp:100,base:{hp:100,attack:20,defense:10,agility:100},equipment:{main,off:null,helmet:null,armor:null,boots:null},facing:Math.PI/2,
      cooldowns:{attack:0,special:0},guard:5,guardRecovery:0,dash:3,dashRecovery:0,blocking:false,dead:false,stun:0,root:0,slow:0,immune:0,invuln:0,burn:0,poison:0,bleed:0,acid:0,attackPose:0,cast:null,lastMove:0,aiAt:0,...extra};
  }
  stats(e){
    const s={...e.base};for(const it of Object.values(e.equipment||{}))if(it)for(const k of Object.keys(s))s[k]+=(it.stats[k]||0);
    s.defense=Math.max(0,s.defense-(e.acid>0?50:0));s.speed=(e.kind==='monster'?e.speed:6*s.agility/100)*(e.slow>0?.5:1);
    if(e.kind==='player'&&e.equipment.main&&WEAPONS[e.equipment.main.type]?.hands===1&&!e.equipment.off)s.speed*=1.07;
    s.attackMin=s.attackMax=s.attack;for(const item of Object.values(e.equipment||{}))if(item?.kind==='main'&&item.ranges?.attack){s.attackMin+=item.ranges.attack[0]-item.stats.attack;s.attackMax+=item.ranges.attack[1]-item.stats.attack;}
    return s;
  }
  affixes(e){return Object.values(e.equipment||{}).flatMap(i=>i?.affixes||[]);}
  attackDamage(e){
    let damage=this.stats(e).attack;
    for(const item of Object.values(e.equipment||{}))if(item?.kind==='main'&&item.ranges?.attack){const [min,max]=item.ranges.attack;damage-=item.stats.attack;damage+=min+Math.floor(this.random()*(max-min+1));}
    return damage;
  }
  point(r){const clear=p=>walkable(this.map,p,1)&&!this.entities.some(e=>!e.dead&&distance(e,p)<3)&&!this.chests.some(c=>distance(c,p)<2);for(let i=0;i<60;i++){const p={x:r.x+4+this.random()*(r.w-8),y:r.y+4+this.random()*(r.h-8)};if(clear(p))return p;}for(let y=r.y+4;y<r.y+r.h-4;y+=3)for(let x=r.x+4;x<r.x+r.w-4;x+=3){const p={x,y};if(clear(p))return p;}throw new Error('No separated spawn position in room '+r.id);}
  addChest(r,tier=null,p=null,count=1){
    p=p||this.point(r);const c={id:this.id('chest'),room:r.id,...p,tier:tier??(this.random()<.1?3:this.random()<.3?2:this.random()<.5?1:0),opened:false,count};c.contents=Array.from({length:count},()=>this.createItem(this.id('item'),{tier:c.tier}));this.chests.push(c);return c;
  }
  addMonster(type,tier,r,p=null){
    const def=MONSTERS[type];p=p||this.point(r);if(!walkable(this.map,p,.7)||!bodyClear(this.map,{id:'spawn',kind:'monster',dead:false},p)||this.entities.some(t=>t.kind==='monster'&&!t.dead&&distance(t,p)<2.4))p=this.point(r);const multiplier=1+tier*.45;
    const e=this.actor(this.id('mob'),'monster',p.x,p.y,{type,room:r.id,tier,name:def.name,team:'monsters',boss:!!def.boss,speed:def.speed,range:def.range,
      base:{hp:Math.round(def.hp*multiplier),attack:Math.round(def.damage*multiplier),defense:4+tier*5,agility:100}});
    e.equipment={main:this.createItem(this.id('item'),{kind:'main',tier:clamp(tier+(this.random()<.06?1:0),0,3)})};
    if(['archer','mage','bombardier','healer'].includes(type)){e.equipment={main:this.createItem(this.id('item'),{kind:'main',tier:0,type:type==='archer'?'bow':type==='healer'?'heal':'fireball'})};e.cooldowns.attack=1;}
    if(type==='treasure'){e.equipment={};e.base={hp:30,attack:0,defense:0,agility:100};e.emergeUntil=this.time+1; e.roamAt=0;}
    e.maxHp=this.stats(e).hp;e.hp=e.maxHp;this.entities.push(e);return e;
  }
  spawnTreasure(){
    if(this.treasureRespawnAt>this.time||this.entities.some(e=>e.type==='treasure'&&!e.dead))return;
    const rooms=this.map.rooms.filter(r=>r.id!==0&&!r.locked&&!r.lava);if(!rooms.length)return;const r=rooms[Math.floor(this.random()*rooms.length)];
    const e=this.addMonster('treasure',0,r);this.fx('entry',e,0,1,{radius:1});return e;
  }
  treasureAI(e,dt){
    const threat=this.entities.filter(t=>t.kind==='player'&&!t.dead&&distance(e,t)<=30).sort((a,b)=>distance(e,a)-distance(e,b))[0];
    if(threat){
      if(this.time>=(e.speechAt||0)){const lines=['보물을 빼앗길 순 없어!','이건 전부 내 보물이야!','잡을 수 있으면 잡아봐!','내 주머니에 손대지 마!'];e.speech={text:lines[Math.floor(this.random()*lines.length)],until:this.time+3};e.speechAt=this.time+5;}
      const angle=Math.atan2(e.y-threat.y,e.x-threat.x),goal={x:e.x+Math.cos(angle)*5,y:e.y+Math.sin(angle)*5};
      if(walkable(this.map,goal,.48)&&lineOfSight(this.map,e,goal)){this.steer(e,goal,dt,e.speed);return;}
    }
    if(this.time>=(e.roamAt||0)||!e.roamGoal||distance(e,e.roamGoal)<1){
      const candidates=this.map.rooms.filter(r=>r.id!==0&&!r.locked&&!r.lava).map(r=>this.point(r));
      candidates.sort((a,b)=>threat?distance(b,threat)-distance(a,threat):this.random()-.5);
      for(const p of candidates)if(walkable(this.map,p,.5)){e.roamGoal=p;break;}e.roamAt=this.time+3;
    }
    if(e.roamGoal)this.steer(e,e.roamGoal,dt,e.speed);
  }
  monsterTactics(e,target,dt){
    if(e.type==='healer'){
      const allies=this.entities.filter(t=>t!==e&&t.kind==='monster'&&t.type!=='treasure'&&!t.dead&&t.room===e.room&&t.hp<t.maxHp&&distance(e,t)<7&&lineOfSight(this.map,e,t));
      if(allies.length&&e.cooldowns.special<=0){this.healArea(e,e,7,12);e.cooldowns.special=3;}
    }
    if(!target)return;const d=distance(e,target),aim=Math.atan2(target.y-e.y,target.x-e.x);e.facing=aim;
    if(d<4.5){this.steer(e,{x:e.x-Math.cos(aim)*3,y:e.y-Math.sin(aim)*3},dt,e.speed);e.facing=aim;}
    else if(d>e.range-1)this.steer(e,target,dt,e.speed);
    if(e.type==='healer'||d>e.range||e.cooldowns.attack>0||!lineOfSight(this.map,e,target))return;
    if(e.type==='bombardier'){this.scheduleZone(e,'meteor',target,2,.95,this.attackDamage(e));e.cast={kind:'bomb-windup',ends:this.time+.65,x:target.x,y:target.y};e.cooldowns.attack=2.8;this.fx('cast',e,aim,.65);}
    else this.attack(e,{aimX:target.x,aimY:target.y});
  }
  arenaReinforcements(){
    this.arenaReinforced=true;this.note('추가 몬스터가 모서리 벽에서 진입합니다!');
    for(const r of this.map.rooms)for(let i=0;i<2;i++){
      const corners=[{x:r.x+1.2,y:r.y+1.2},{x:r.x+r.w-1.2,y:r.y+1.2},{x:r.x+1.2,y:r.y+r.h-1.2},{x:r.x+r.w-1.2,y:r.y+r.h-1.2}];
      const to=corners[(r.id+i*2)%4];if(!walkable(this.map,to,.48)||!bodyClear(this.map,{kind:'monster',id:'incoming',dead:false},to))continue;
      const e=this.addMonster(['archer','mage','bombardier','healer'][(r.id+i)%4],0,r,to);
      e.enterTo={...to};e.enterFrom={x:to.x+(to.x<r.x+r.w/2?-1:1),y:to.y+(to.y<r.y+r.h/2?-1:1)};e.x=e.enterFrom.x;e.y=e.enterFrom.y;e.enterUntil=this.time+1.2;e.invuln=1.2;
      this.fx('entry',to,0,1.2,{radius:1});
    }
  }
  autoBuild(){for(const r of this.map.rooms.filter(x=>x.editable))this.fillRoom(r.id);}
  fillRoom(room){
    const r=this.map.rooms[room],b=this.builders[room];if(!r||!b||b.locked)return false;
    if(!this.chests.some(c=>c.room===room))this.place(this.masterId,{room,type:'chest',x:r.x+6,y:r.y+5,tier:Math.min(2,Math.floor((room-1)/2))});
    const tier=this.partySize===1?0:Math.min(1,Math.floor((room-2)/3));
    if(room===7&&!this.entities.some(e=>e.boss&&e.room===room))this.place(this.masterId,{room,type:'dragon',tier:this.partySize===1?0:this.partySize>=4?2:1,x:r.x+r.w*.65,y:r.y+r.h*.5});
    const types={2:['archer','goblin'],3:['mage','healer'],4:['bombardier','archer'],5:['ogre','healer','mage'],7:['mage','healer']}[room];
    const targetCount=room===7?Math.min(3,Math.floor(this.partySize/2)):this.partySize===1?2:Math.min(5,Math.ceil(this.partySize*.6)+1);
    for(let i=0;i<targetCount;i++)for(let attempt=0;attempt<8;attempt++){const p=this.point(r);if(this.place(this.masterId,{room,type:types[i%types.length],tier:room===7?0:tier,...p}))break;}
    this.place(this.masterId,{room,type:'trap',x:r.x+6,y:r.y+12});return true;
  }
  say(e,event,urgent=false){
    if(!e.bot||e.dead||!urgent&&this.time<(e.speechAt||0))return;
    const lines={follow:['뒤따라갈게!','주변은 내가 살펴볼게.','같이 가자. 너무 멀리 가지 마!'],chest:['상자 발견! 내가 열어볼게.','여기 상자 있어. 잠깐만!'],loot:['이 장비, 쓸 만하겠는데?','좋아, 이번엔 이걸로 간다.'],enemy:['앞에 적이다! 같이 가자.','빈틈을 노려보자.'],boss:['큰 녀석이다. 범위를 조심해!','보스다! 너무 붙지 마.'],dodge:['위험해! 범위 밖으로!','옆으로 피해!'],low:['체력이 위험해. 조금 물러날게.','잠깐, 숨 좀 돌릴게.'],heal:['치유할게! 가까이 와.','상처부터 회복하자.'],next:['문 열렸어. 다음 방으로!','준비됐지? 앞으로 가자.'],lava:['용암이 올라온다. 이동해!','여긴 위험해. 중앙으로!'],rest:['샘에서 잠깐 쉬자.','여기서 회복하고 가자.']};
    const choices=lines[event];if(!choices)return;const hash=[...e.id].reduce((a,c)=>a+c.charCodeAt(0),Math.floor(this.time));e.speech={text:choices[hash%choices.length],until:this.time+3.2};e.speechAt=this.time+7+hash%4;e.aiState=event;
  }
  avoidHazard(e,dt){
    const dangers=this.zones.filter(z=>{const owner=this.entities.find(t=>t.id===z.owner);return owner&&this.enemies(owner,e)&&z.expires>this.time&&attackContains(z,e,.6);});
    if(!dangers.length)return false;let goal=null,best=Infinity;
    for(const radius of [1.5,3,5,7])for(let i=0;i<16;i++){const angle=i*Math.PI/8,p={x:e.x+Math.cos(angle)*radius,y:e.y+Math.sin(angle)*radius};if(!walkable(this.map,p,.48)||!bodyClear(this.map,e,p)||dangers.some(z=>attackContains(z,p,.8)))continue;const score=radius+(lineOfSight(this.map,e,p)?0:5);if(score<best){best=score;goal=p;}}
    if(!goal)return false;this.say(e,'dodge');this.steer(e,goal,dt,this.stats(e).speed);return true;
  }
  input(id,input){
    // Identity is supplied by transport, never by gameplay packet. No positions/damage accepted.
    if(typeof input!=='object'||!input)return;
    this.inputs.set(id,{mx:clamp(finite(input.mx),-1,1),my:clamp(finite(input.my),-1,1),aimX:finite(input.aimX),aimY:finite(input.aimY),attack:!!input.attack,special:!!input.special,sprint:!!input.sprint,block:!!input.block});
  }
  command(id,command){if(command&&typeof command==='object'&&this.commands.length<100)this.commands.push({...command,id});}
  process(id,c){
    const e=this.entities.find(x=>x.id===id);
    if(c.action==='place'){const ok=this.place(id,c);if(!ok&&id==='local')this.note('배치 불가: 입구·장애물·겹침·남은 자원 또는 마감 상태를 확인하세요.');return ok;}
    if(id===this.masterId){
      if(c.action==='fillRoom'){this.fillRoom(Number(c.room));return;}
      if(c.action==='startRaid'&&this.phase==='planning'){this.phase='playing';this.note('모험가의 공략이 시작됐습니다. 다음 방도 준비하세요.');return;}
      if(c.action==='bossSkill'){const m=this.entities.find(x=>x.id===this.possession&&!x.dead&&x.boss);if(m&&m.cooldowns.special<=0&&!m.cast&&m.stun<=0){this.bossSkill(m,clamp(Math.floor(finite(c.skill)),0,2));m.cooldowns.special=5;}return;}
      if(c.action==='possess'){const m=this.entities.find(x=>x.id===c.entity&&x.boss&&!x.dead&&x.kind==='monster');this.possession=m?.id||null;return;}
      if(c.action==='order'){const m=this.entities.find(x=>x.id===c.entity&&x.kind==='monster'&&!x.dead);if(m){const p={x:finite(c.x),y:finite(c.y)};if(inside(p,this.map.rooms[m.room],.5))this.directed.set(m.id,{...p,target:String(c.target||'')});}return;}
    }
    if(!e)return;
    if(c.action==='spawn'&&this.phase==='spawn'){const p={x:finite(c.x),y:finite(c.y)};if(walkable(this.map,p,.48)&&bodyClear(this.map,e,p)&&roomAt(this.map,p)){e.x=p.x;e.y=p.y;e.room=roomAt(this.map,p).id;}return;}
    if(e.dead){if(c.action==='follow')e.follow=String(c.target||'');return;}
    if(c.action==='attack'){this.attack(e,this.inputs.get(id)||{},!!c.special);return;}
    if(c.action==='interact')this.interact(e,false,c.target?{kind:c.target,id:c.targetId}:null);
    if(c.action==='answer')this.answer(e,String(c.answer??''));
    if(c.action==='drop'&&SLOTS.includes(c.slot)){const it=e.equipment[c.slot];if(it){this.drop(it,e);e.equipment[c.slot]=null;this.syncHp(e);}return;}
    if(c.action==='swap'){const a=e.equipment.main,b=e.equipment.off;if(b&&WEAPONS[b.type]&&WEAPONS[b.type].hands===1&&(!a||WEAPONS[a.type]?.hands===1)){e.equipment.main=b;e.equipment.off=a;}return;}
    if(c.action==='clone'){
      const a=this.affixes(e).find(a=>a.key==='clone'&&a.charges>0);if(a){a.charges--;const power=.3+(e.equipment.off?.tier||0)*.1;
        let spawn=null;for(const radius of [1.2,2,3])for(let i=0;i<8&&!spawn;i++){const p={x:e.x+Math.cos(i*Math.PI/4)*radius,y:e.y+Math.sin(i*Math.PI/4)*radius};if(walkable(this.map,p,.48)&&!this.entities.some(t=>!t.dead&&distance(t,p)<1))spawn=p;}if(!spawn){a.charges++;return;}
        const clone=this.actor(this.id('clone'),'clone',spawn.x,spawn.y,{name:e.name+'의 분신',team:e.team,owner:e.id,room:e.room,base:{hp:e.maxHp*power,attack:this.stats(e).attack*power,defense:0,agility:100}});
        clone.equipment={main:e.equipment.main?{...e.equipment.main,stats:{},affixes:[]}:null};clone.hp=clone.maxHp=clone.base.hp;this.entities.push(clone);}
    }
  }
  syncHp(e){e.maxHp=this.stats(e).hp;e.hp=Math.min(e.hp,e.maxHp);}
  drop(item,p){this.loot.push({...p,x:p.x+(this.random()-.5)*1.4,y:p.y+(this.random()-.5)*1.4,id:this.id('drop'),item});}
  equip(e,drop){
    const it=drop.item;let slot=it.kind==='lantern'?'off':it.kind;
    if(e.kind==='monster'){slot='main';if(e.equipment.main)return false;}
    if(slot==='main'&&WEAPONS[it.type]?.hands===1&&e.equipment.main&&WEAPONS[e.equipment.main.type]?.hands===1&&!e.equipment.off)slot='off';
    if(slot==='main'&&WEAPONS[it.type]?.hands===2&&e.equipment.off){this.drop(e.equipment.off,e);e.equipment.off=null;}
    if(slot==='off'&&WEAPONS[e.equipment.main?.type]?.hands===2){this.drop(e.equipment.main,e);e.equipment.main=null;}
    if(e.equipment[slot])this.drop(e.equipment[slot],e);
    e.equipment[slot]=it;if(e.kind==='player')this.quizByPlayer.delete(e.id);this.loot=this.loot.filter(l=>l.id!==drop.id);this.syncHp(e);this.fx('equip',e,0,.3,{sound:equipmentSound(it),itemName:it.name});return true;
  }
  interact(e,chestOnly=false,intent=null){
    const room=roomAt(this.map,e),spring=room?.heal?{x:room.x+room.w/2,y:room.y+room.h/2}:null;
    const drops=this.loot.filter(x=>distance(e,x)<1.8&&lineOfSight(this.map,e,x)).sort((a,b)=>distance(e,a)-distance(e,b));
    if(intent?.kind==='loot'){const drop=drops.find(d=>d.id===intent.id);if(drop)this.equip(e,drop);return;}if(drops.length&&!chestOnly&&!intent){this.equip(e,drops[0]);return;}
    const nearbyChests=intent&&intent.kind!=='chest'?[]:this.chests.filter(x=>(!intent||x.id===intent.id)&&distance(e,x)<2&&lineOfSight(this.map,e,x));
    const chest=nearbyChests.filter(x=>!x.opened).sort((a,b)=>distance(e,a)-distance(e,b))[0]||nearbyChests[0];
    if(chest){if(chest.opened){this.note('비었다…');return;}
      const n=chest.tier,a=1+Math.floor(this.random()*(n<2?9+n*5:9)),b=1+Math.floor(this.random()*(n<2?9+n*5:6));let question,answer;
      if(n===0){question=`${a} + ${b}`;answer=a+b;}else if(n===1){question=`${Math.max(a,b)} − ${Math.min(a,b)}`;answer=Math.abs(a-b);}else if(n===2){question=`${a} × ${b}`;answer=a*b;}else{question=`(${a} + ${b}) × 2`;answer=(a+b)*2;}
      this.quizByPlayer.set(e.id,{chest:chest.id,question,answer,feedback:''});return;
    }
    if(!chestOnly&&spring&&distance(e,spring)<3.5){if(this.time<(room.springReadyAt||0))return;room.springReadyAt=this.time+3;if(!room.healStarted){room.healStarted=true;this.healUntil=this.time+20;this.note('치유 샘 활성화 · 20초 후 보스방이 열립니다.');}for(const p of this.entities.filter(p=>p.kind==='player'&&!p.dead&&p.team===e.team&&roomAt(this.map,p)?.id===room.id))p.hp=p.maxHp;this.fx('heal',spring,0,1.2,{radius:5});return;}
  }
  answer(e,answer){
    const q=this.quizByPlayer.get(e.id);if(!q)return;const chest=this.chests.find(c=>c.id===q.chest);
    if(!chest||chest.opened){q.feedback='비었다… 다른 모험가가 먼저 열었습니다.';q.done=true;return;}
    if(distance(e,chest)>2.5||!lineOfSight(this.map,e,chest)){q.feedback='상자 가까이에서 풀어주세요.';return;}
    if(!answer.trim()||Number(answer)!==q.answer){q.feedback='다시 계산해보세요. 재도전은 무제한입니다.';return;}
    chest.opened=true;const luck=this.affixes(e).some(a=>a.key==='luck');
    for(let i=0;i<chest.count;i++){const lucky=luck&&this.random()<.2;this.drop(lucky?this.createItem(this.id('item'),{tier:clamp(chest.tier+1,0,3)}):chest.contents?.[i]||this.createItem(this.id('item'),{tier:chest.tier}),chest);}chest.contents=[];
    this.quizByPlayer.delete(e.id);this.fx('chest',chest,0,1);this.note('상자가 열렸습니다. E로 장비를 줍습니다.');
  }
  place(id,c){
    if(id!==this.masterId||this.mode!=='dungeon'||this.result)return false;
    const r=this.map.rooms[Number(c.room)],b=this.builders[r?.id];if(!r||!b||b.locked)return false;
    const p={x:Math.round(finite(c.x)*2)/2,y:Math.round(finite(c.y)*2)/2},tier=clamp(Math.floor(finite(c.tier)),0,3);
    if(!inside(p,r,2)||!walkable(this.map,p,1)||this.entities.some(e=>!e.dead&&distance(e,p)<2)||this.chests.some(e=>distance(e,p)<2)||this.traps.some(e=>distance(e,p)<2))return false;
    if([r.entry,r.exit].filter(Boolean).some(d=>distance(d,p)<4))return false;
    const type=String(c.type),mob=MONSTERS[type];if(type==='treasure')return false;
    if(type==='chest'){if(b.chests>=3)return false;this.addChest(r,tier,p);b.chests++;b.budget+=8;return true;}
    const cost=type==='trap'?8:type==='obstacle'?6:mob?Math.round(mob.cost*(1+tier*.6)):Infinity;
    if(b.spent+cost>b.budget)return false;
    if(type==='trap'){if(this.traps.filter(t=>t.room===r.id).length>=3)return false;this.traps.push({id:this.id('trap'),...p,room:r.id,cool:0});}
    else if(type==='obstacle'){
      if(this.map.obstacles.filter(o=>!o.fixed&&o.room===r.id).length>=2)return false;
      this.map.obstacles.push({id:this.id('wall'),room:r.id,x:p.x-1,y:p.y-1,w:2,h:2,fixed:false});
    }else if(mob){
      const existing=this.entities.filter(e=>e.kind==='monster'&&e.room===r.id);
      if(r.id!==7&&(mob.boss&&existing.length||!mob.boss&&existing.some(e=>e.boss)))return false;
      this.addMonster(type,tier,r,p);
    }else return false;
    b.spent+=cost;return true;
  }
  fx(kind,p,angle=0,life=.4,extra={}){this.effects.push({id:this.id('fx'),kind,x:p.x,y:p.y,angle,life,maxLife:life,...extra});}
  enemies(a,b){return a.id!==b.id&&!b.dead&&a.team!==b.team&&b.kind!=='ghost'&&!(a.kind==='monster'&&b.kind==='monster');}
  validHit(a,b){
    if(!this.enemies(a,b))return false;
    if(a.kind==='monster'||b.kind==='monster')if(a.type!=='treasure'&&b.type!=='treasure'&&roomAt(this.map,a)?.id!==roomAt(this.map,b)?.id)return false;
    return true;
  }
  status(e,key,seconds){if(e.immune<=0)e[key]=Math.max(e[key]||0,seconds);}
  hurt(target,amount,source=null,{ignore=false,push=0,stun=0,dot=false,proc=true}={}){
    if(target.dead||target.invuln>0)return;
    if(source&&!this.validHit(source,target))return;
    const aff=this.affixes(target);const auto=aff.find(a=>a.key==='autoblock'&&a.charges>0);
    if(auto&&!dot){auto.charges--;this.fx('block',target);return;}
    const evade=aff.find(a=>a.key==='evade'&&a.charges>0);
    if(evade&&!dot){evade.charges--;target.invuln=.35;move(this.map,target,-Math.cos(target.facing)*2,-Math.sin(target.facing)*2,target.kind==='monster');this.fx('dash',target);return;}
    let reduction=1;if(target.blocking&&source&&!dot){const angle=Math.atan2(source.y-target.y,source.x-target.x);if(Math.cos(angle-target.facing)>.2)reduction=source.projectile?.3:.5;}
    const dmg=Math.max(dot?0:1,amount*(ignore||dot?1:100/(100+this.stats(target).defense)))*reduction;
    target.hp-=dmg;target.hitPose=.12;
    if(!dot||this.time-(target.dotFxAt||0)>.5){this.fx('hit',target,0,.28,{value:dot?Math.round(amount/.05):Math.round(dmg),target:target.id,dot:!!dot,heavy:!dot&&dmg>=25,feedback:source?itemFeedback(source.equipment?.main):null});target.dotFxAt=this.time;}
    if(stun)this.status(target,'stun',stun);
    if(source&&push){const ang=Math.atan2(target.y-source.y,target.x-source.x);move(this.map,target,Math.cos(ang)*push,Math.sin(ang)*push,target.kind==='monster');}
    if(source&&proc&&!dot){
      for(const a of this.affixes(source))if(this.random()<a.chance){
        if(['poison','burn'].includes(a.key))this.status(target,a.key,3);
        if(a.key==='frost')this.status(target,'slow',2);
        if(a.key==='taunt'){target.taunt=source.id;target.tauntUntil=this.time+5;}
        if(a.key==='lightning')this.scheduleZone(source,'thunder',target,2,.6,18,0,1);
        if(a.key==='meteor')this.scheduleZone(source,'meteor',target,2,.7,22);
      }
      for(const a of aff)if(this.random()<a.chance){
        if(a.key==='reset')target.cooldowns={attack:0,special:0};
        if(a.key==='restore'){const use=aff.find(x=>x.charges!==null&&x.charges<x.maxCharges);if(use)use.charges++;}
        if(a.key==='revenge'&&!source.dead)this.hurt(source,dmg*a.value,target,{ignore:true,proc:false});
        if(a.key==='stun')this.status(source,'stun',1);
        if(a.key==='immune')target.immune=2;
        if(a.key==='healburst')this.healArea(target,target,3,10);
        if(a.key==='explosion'){target.hp-=dmg*.5;this.area(target,target,3,dmg*a.value,{proc:false});}
        if(a.key==='teleport'){const r=roomAt(this.map,target);if(r){const p=this.point(r);target.x=p.x;target.y=p.y;this.fx('dash',target);}}
      }
    }
    if(target.hp<=0)this.kill(target,source);
  }
  kill(e,source){
    if(e.dead)return;e.dead=true;e.hp=0;e.blocking=false;e.cast=null;e.whirl=null;
    if(e.type==='treasure'){this.drop(this.createItem(this.id('item'),{tier:3}),e);this.treasureRespawnAt=this.time+10;this.note('보물 고블린 처치 · SSR 장비 획득!');}
    for(const item of Object.values(e.equipment))if(item)this.drop(item,e);e.equipment={};
    this.quizByPlayer.delete(e.id);this.fx('death',e,0,.7);if(e.kind==='player')this.note(`${e.name}이 유령이 되었습니다.`);
    if(source?.kind==='monster'&&!source.equipment.main){const l=this.loot.find(l=>distance(l,source)<2);if(l)this.equip(source,l);}
  }
  healArea(source,p,radius,amount){for(const e of this.entities)if(!e.dead&&(e.team===source.team||e.id===source.id)&&distance(e,p)<=radius&&lineOfSight(this.map,p,e))e.hp=Math.min(e.maxHp,e.hp+amount);this.fx('heal',p,0,.7,{radius});}
  area(source,p,radius,amount,options={}){for(const e of this.entities)if(distance(e,p)<=radius&&lineOfSight(this.map,p,e)&&this.validHit(source,e))this.hurt(e,amount,source,options);}
  scheduleZone(source,kind,p,radius,delay,damage,duration=0,stun=0){this.zones.push({id:this.id('zone'),owner:source.id,kind,x:p.x,y:p.y,radius,at:this.time+delay,damage,duration,stun,active:false,next:0,expires:this.time+delay+Math.max(.15,duration)});}
  projectile(e,kind,range,damage,angle=e.facing,extra={}){this.fx('shoot',e,angle,.18,{weapon:e.equipment.main?.type,appearance:e.equipment.main?.appearance,feedback:itemFeedback(e.equipment.main)});this.projectiles.push({id:this.id('bolt'),owner:e.id,weapon:e.equipment.main?.type,kind,x:e.x,y:e.y,angle,speed:['magic','heal','fireball'].includes(kind)?14:20,remaining:range*(['magic','heal','fireball'].includes(kind)?2:1),visualScale:['magic','heal','fireball'].includes(kind)?1.8:1,damage,...extra});}
  multishot(e,kind,range,damage){if(this.affixes(e).some(a=>a.key==='multishot'&&this.random()<a.chance))for(const offset of [-.15,.15])this.projectile(e,kind,range,damage*.7,e.facing+offset);}
  attack(e,input,special=false){
    const specialSlot=WEAPONS[e.equipment.off?.type]?'off':'main';
    const weapon=WEAPONS[e.equipment[special?specialSlot:'main']?.type],stats=this.stats(e);const key=special?'special':'attack';
    if(e.dead||e.stun>0||e.cast||e.whirl||e.cooldowns[key]>0||e.blocking)return;
    if(e.kind==='monster'&&e.boss&&special){this.bossSkill(e,Math.floor(this.random()*3));e.cooldowns.special=5;return;}
    if(special&&(!weapon||e.equipment.off?.type==='shield'))return;
    e.attackPose=.25;
    if(special){e.combo=0;e.comboUntil=0;e.attackPose=0;const skill=weaponSkill(e.equipment[specialSlot]);e.cooldowns.special=skill.cool;if(skill.kind==='spin'){e.whirl={ends:this.time+2,next:this.time,damage:this.attackDamage(e),slot:specialSlot};return;}e.cast={kind:skill.kind,started:this.time,ends:this.time+skill.cast,x:finite(input.aimX,e.x),y:finite(input.aimY,e.y),weapon:e.equipment[specialSlot].type,slot:specialSlot,damage:this.attackDamage(e)};
      this.fx('cast',e,0,skill.cast||.12,{weapon:e.equipment[specialSlot].type,appearance:e.equipment[specialSlot].appearance,feedback:itemFeedback(e.equipment[specialSlot])});if(e.equipment[specialSlot].tier===3)this.fx('skillCharge',e,e.facing,.45,{radius:1.5,skill:skill.kind});return;}
    const heavy=['greatsword','hammer'].includes(e.equipment.main?.type),playerCombo=e.kind==='player'&&(weapon?.range||.7)<5;
    if(playerCombo){const count=heavy?2:3;e.combo=this.time<=(e.comboUntil||0)&&e.comboWeapon===(e.equipment.main?.type||'fist')?(e.combo||0)%count+1:1;e.comboUntil=this.time+1.5;e.comboWeapon=e.equipment.main?.type||'fist';}else {e.combo=0;e.comboUntil=0;}
    const bonus=this.attackDamage(e)*(playerCombo&&(heavy?e.combo===2:e.combo===3)?heavy?1.18:1.15:1);
    e.cooldowns.attack=e.kind==='monster'?({slime:1.1,skeleton:.9,goblin:.8,bat:1,ogre:1.4,spectre:1.1,spider:.9}[e.type]||1.4):(weapon?.delay||.45)/(e.kind==='player'&&weapon?.hands===1&&!e.equipment.off?1.07:1);
    if(e.kind==='monster'&&Math.max(e.range,weapon?.range||0)>=5){const range=Math.min(12,Math.max(e.range,weapon?.range||0));e.cast={kind:'monster-shot',ends:this.time+.65,angle:e.facing,ox:e.x,oy:e.y,range,damage:bonus,projectileKind:e.equipment.main?.type==='bow'?'arrow':'magic'};this.fx('cast',e,e.facing,.65);return;}
    if(weapon?.type==='unused')return;
    if(e.kind!=='monster'&&e.equipment.main?.type==='bow'){
      const charge=clamp(e.bowCharge||0,0,2.5),range=Math.min(27,Math.max(7.5,25*charge/2)+2);this.projectile(e,'arrow',range,bonus*(charge>=2?1.5:1),e.facing,{ignore:charge>=2});this.multishot(e,'arrow',range,bonus);e.bowCharge=0;return;
    }
    if(e.kind!=='monster'&&weapon&&['meteor','poison','acid','heal','healbolt','thunder','lightning','fireball','vines'].includes(e.equipment.main?.type)){
      const heal=['heal','healbolt'].includes(e.equipment.main.type);this.projectile(e,heal?'heal':'magic',weapon.range,heal?0:bonus,e.facing,{heal:heal?.1:0,root:e.equipment.main.type==='vines'?.35:0,stun:e.equipment.main.type==='thunder'?.15:0,burn:e.equipment.main.type==='fireball'?1:0});if(!heal)this.multishot(e,'magic',weapon.range,bonus);return;
    }
    const range=e.kind==='monster'?e.range:(weapon?.range||.7);if(playerCombo&&e.root<=0)move(this.map,e,Math.cos(e.facing)*(heavy?.3:e.combo===3?.38:.22),Math.sin(e.facing)*(heavy?.3:e.combo===3?.38:.22));
    this.fx('slash',e,e.facing,.22,{radius:range,combo:e.combo||1,weapon:e.equipment.main?.type,appearance:e.equipment.main?.appearance,feedback:itemFeedback(e.equipment.main)});
    if(playerCombo&&heavy&&e.combo===2&&itemFeedback(e.equipment.main).material!=='bread')this.fx('slam',{x:e.x+Math.cos(e.facing)*range*.65,y:e.y+Math.sin(e.facing)*range*.65},e.facing,.3,{radius:range*.45,feedback:itemFeedback(e.equipment.main)});
    for(const t of this.entities)if(distance(e,t)<=range+.4&&Math.cos(Math.atan2(t.y-e.y,t.x-e.x)-e.facing)>.1&&lineOfSight(this.map,e,t)&&this.validHit(e,t)){
      this.hurt(t,bonus,e,{push:.3});
      if(!['greatsword','hammer'].includes(e.equipment.main?.type))break;
    }
  }
  special(e,c){
    const stats={...this.stats(e),attack:c.damage??this.attackDamage(e)};const dir={x:Math.cos(e.facing),y:Math.sin(e.facing)};
    const dist=Math.hypot(c.x-e.x,c.y-e.y);const range=c.kind==='healbolt'?25:25;
    const p={x:e.x+(c.x-e.x)*Math.min(1,range/(dist||1)),y:e.y+(c.y-e.y)*Math.min(1,range/(dist||1))};
    const melee=(radius,damage,opts={})=>{this.fx('slash',e,e.facing,.35,{radius,feedback:itemFeedback(e.equipment[c.slot||'main'])});this.area(e,{x:e.x+dir.x*.7,y:e.y+dir.y*.7},radius,damage,opts);};
    const fan=(kind,count,spread,range,mult,extra={})=>{for(let i=0;i<count;i++)this.projectile(e,kind,range,stats.attack*mult,e.facing+(i-(count-1)/2)*spread,extra);};
    const march=(kind,count,spacing,radius,mult)=>{for(let i=1;i<=count;i++){const at={x:e.x+dir.x*i*spacing,y:e.y+dir.y*i*spacing};if(!walkable(this.map,at,.1)||!lineOfSight(this.map,e,at))break;this.scheduleZone(e,kind,at,radius,i*.12,stats.attack*mult,0,.25);}};
    switch(c.kind){
      case 'monster-shot':this.projectile(e,c.projectileKind,c.range,c.damage,c.angle);break;
      case 'pulse':this.area(e,e,2,stats.attack*.9,{push:.8});this.fx('pulse',e,0,.5,{radius:2});break;
      case 'breadline':march('breadrise',5,1,.7,.8);break;
      case 'earthline':march('slam',5,1.4,1,.8);break;
      case 'bladewave':fan('bladewave',1,0,9,1.4,{pierce:true});break;
      case 'clockwave':fan('clockwave',1,0,7,1.1,{pierce:true,stun:1});break;
      case 'starfan':fan('star',5,.18,7,.55);break;
      case 'crescent':fan('crescent',2,.3,8,.9,{pierce:true});break;
      case 'thornfan':fan('thorn',3,.2,12,.8,{root:1});break;
      case 'phoenixfan':fan('phoenix',5,.15,15,.85,{burn:3});break;
      case 'firefan':fan('fireball',3,.22,10,.65);break;
      case 'panclang':this.area(e,e,3,stats.attack*1.2,{stun:.7,push:1.5});this.fx('panclang',e,0,.6,{radius:3,feedback:itemFeedback(e.equipment[c.slot])});break;
      case 'resonance':for(let i=0;i<3;i++)this.scheduleZone(e,'pulse',e,2+i*.6,i*.2,stats.attack*.55);break;
      case 'candyburst':for(let i=0;i<3;i++)this.scheduleZone(e,'candyburst',{x:e.x+dir.x*(1.5+i),y:e.y+dir.y*(1.5+i)},1.4,i*.2,stats.attack*.7,0,.35);break;
      case 'cometfall':for(let i=0;i<3;i++)this.scheduleZone(e,'meteor',{x:p.x+(i-1)*2,y:p.y},2.3,.4+i*.25,stats.attack*1.15,0,.5);break;
      case 'moonheal':this.healArea(e,e,5,35);this.scheduleZone(e,'moonheal',e,5,.4,0,2);break;
      case 'shelter':this.healArea(e,e,5,40);for(const t of this.entities)if(!t.dead&&t.team===e.team&&distance(t,e)<5&&lineOfSight(this.map,e,t))t.immune=Math.max(t.immune,2);this.fx('ward',e,0,2,{radius:5});break;
      case 'inkcloud':for(let i=-1;i<=1;i++)this.scheduleZone(e,'poison',{x:p.x+i*2,y:p.y},2.5,0,stats.attack*.3,3);break;
      case 'stormchain':for(let i=0;i<3;i++)this.scheduleZone(e,'thunder',{x:p.x+(i-1)*2,y:p.y},2,.2+i*.25,stats.attack*.85,0,.6);break;
      case 'forklightning':fan('lightning',3,.18,14,1.1,{pierce:true,stun:.4});break;

      case 'throw':{const slot=c.slot||'main',item=e.equipment[slot];if(!item||item.type!=='dagger')break;e.equipment[slot]=null;this.projectile(e,'dagger',8,stats.attack,e.facing,{item});break;}
      case 'double':melee(1.5,stats.attack);this.scheduleZone(e,'slash',{x:e.x+dir.x,y:e.y+dir.y},1.5,.2,stats.attack);break;
      case 'push':melee(1.5,stats.attack,{push:3});break;
      case 'bleed':melee(1.5,stats.attack);for(const t of this.entities)if(this.validHit(e,t)&&distance(e,t)<2)this.status(t,'bleed',5);break;
      case 'backstep':move(this.map,e,-dir.x*2,-dir.y*2);this.fx('dash',e,e.facing,.3);break;
      case 'slam':{const reach=WEAPONS[e.equipment[c.slot||'main']?.type]?.range||2.5,at={x:e.x+dir.x*reach*.65,y:e.y+dir.y*reach*.65};this.area(e,at,reach*.45,stats.attack*1.5,{stun:1});this.fx('slam',at,e.facing,.5,{radius:reach*.45,feedback:itemFeedback(e.equipment[c.slot||'main'])});break;}
      case 'spin':e.whirl={ends:this.time+2,next:this.time,damage:stats.attack,slot:c.slot||'main'};break;
      case 'meteor':this.scheduleZone(e,'meteor',p,5,.3,65,2);break;
      case 'poison':this.scheduleZone(e,'poison',p,4,0,7,3);this.zones.at(-1).steerable=true;break;
      case 'acid':this.scheduleZone(e,'acid',p,5,0,7,5);break;
      case 'heal':this.healArea(e,p,4,30);break;
      case 'healbolt':this.projectile(e,'heal',25,0,e.facing,{healAmount:50});break;
      case 'thunder':for(let i=0;i<3;i++)this.scheduleZone(e,'thunder',p,2,i*.35,25,0,2);break;
      case 'lightning':{const r=roomAt(this.map,e);const length=r?Math.hypot(r.w,r.h):20;for(const t of this.entities){const dx=t.x-e.x,dy=t.y-e.y,along=dx*dir.x+dy*dir.y;if(this.validHit(e,t)&&roomAt(this.map,t)?.id===r?.id&&along>0&&along<length&&Math.abs(dx*dir.y-dy*dir.x)<.8&&lineOfSight(this.map,e,t))this.hurt(t,50,e,{stun:1});}this.fx('lightning',e,e.facing,.35,{radius:length});break;}
      case 'fireball':this.projectile(e,'fireball',Math.hypot(this.map.width,this.map.height),55);break;
      case 'vines':{const center={x:e.x+dir.x*2,y:e.y+dir.y*2};for(const t of this.entities)if(this.validHit(e,t)&&distance(t,center)<=7&&lineOfSight(this.map,e,t)){move(this.map,t,center.x-t.x,center.y-t.y,t.kind==='monster');this.status(t,'root',3);this.status(t,'poison',3);}this.fx('vines',center,0,1,{radius:7});break;}
    }
  }
  bossSkill(e,index){
    const targets=this.entities.filter(t=>this.validHit(e,t)&&roomAt(this.map,t)?.id===e.room);const target=targets.sort((a,b)=>distance(e,a)-distance(e,b))[0];if(!target)return;
    const damage=this.stats(e).attack*1.8;
    if(index===0){
      if(e.type==='lich')this.scheduleZone(e,'meteor',target,4,.9,damage,0,1);
      else {const a=Math.atan2(target.y-e.y,target.x-e.x);e.facing=a;this.scheduleZone(e,e.type==='dragon'?'fireball':'slam',e,7,.9,damage,0,1);Object.assign(this.zones.at(-1),{shape:e.type==='dragon'?'cone':'rect',angle:a,arc:.65,length:7,width:2.5});}
    }
    if(index===1){for(let i=0;i<3;i++)this.scheduleZone(e,e.type==='lich'?'poison':'thunder',{x:target.x+(i-1)*3,y:target.y},2,1+i*.2,damage*.6,e.type==='lich'?2:0,1);}
    if(index===2){e.cast={kind:'boss-ring',ends:this.time+1,x:e.x,y:e.y};this.scheduleZone(e,'spin',e,6,1,damage,0,.5);}
    this.fx('cast',e,0,1);
  }
  steer(e,target,dt,speed){
    if(e.root>0)return;
    let goal=target;const home=e.kind==='monster'&&e.type!=='treasure'?this.map.rooms[e.room]:null;
    if(!lineOfSight(this.map,e,target)){
      if(!e.pathTarget||distance(e.pathTarget,target)>2||(!e.path?.length&&this.time>=(e.pathAt||0))||e.path?.length&&!walkable(this.map,e.path[0],.5)){
        if(!e.pathSearch||distance(e.pathTarget||e,target)>2){e.pathSearch=pathSearch(this.map,{x:e.x,y:e.y},{x:target.x,y:target.y},home);e.pathTarget={x:target.x,y:target.y};}e.pathAt=this.time+1.5;
      }
      if(e.pathSearch){const result=e.pathSearch.next();if(result.done){e.path=result.value;e.pathSearch=null;}else if(!e.path?.length)return;}
      while(e.path?.length&&distance(e,e.path[0])<.6)e.path.shift();
      goal=e.path?.[0]||target;
    }
    const len=distance(e,goal);if(len<.25)return;
    const baseAngle=Math.atan2(goal.y-e.y,goal.x-e.x);let angle=baseAngle,best=-Infinity;
    for(const off of [0,.4,-.4,.8,-.8,1.3,-1.3,1.8,-1.8,Math.PI]){
      const a=baseAngle+off,p={x:e.x+Math.cos(a)*.65,y:e.y+Math.sin(a)*.65};
      if(e.type==='treasure'&&inside(p,this.map.rooms[0]))continue;
      if(!walkable(this.map,p,e.boss?.7:.48)||home&&!inside(p,home,.7)||!bodyClear(this.map,e,p))continue;
      const score=-distance(p,goal)-Math.abs(off)*.08;if(score>best){best=score;angle=a;}
    }
    if(best!==-Infinity){e.facing=angle;move(this.map,e,Math.cos(angle)*Math.min(speed*dt,len),Math.sin(angle)*Math.min(speed*dt,len),!!home);e.lastMove=this.time;}
  }
  ai(e,dt){
    if(e.dead||e.stun>0||e.cast)return;
    if(e.type==='treasure'){this.treasureAI(e,dt);return;}
    e.blocking=e.kind==='player'&&e.equipment.off?.type==='shield'&&this.time<(e.blockUntil||0)&&e.guard>0&&e.guardRecovery<=0;
    if(e.blocking){e.guard=Math.max(0,e.guard-dt);if(!e.guard)e.guardRecovery=5;}else{e.guardRecovery=Math.max(0,e.guardRecovery-dt);e.guard=Math.min(5,e.guard+dt);}
    if(e.kind==='player'&&this.avoidHazard(e,dt))return;
    if(e.kind==='clone'){const owner=this.entities.find(x=>x.id===e.owner);if(!owner||owner.dead||owner.equipment.off?.type!=='lantern'){e.dead=true;return;}}
    const leader=this.mode==='dungeon'&&e.kind==='player'&&e.bot?this.entities.find(p=>p.kind==='player'&&!p.bot&&!p.dead&&p.team===e.team):null;
    const follow=()=>{const index=Math.max(0,this.entities.filter(p=>p.kind==='player'&&p.bot).indexOf(e)),angle=(leader.facing||0)+Math.PI+(index?-.7:.7),goal={x:leader.x+Math.cos(angle)*2.8,y:leader.y+Math.sin(angle)*2.8};if(distance(e,leader)>4)this.steer(e,walkable(this.map,goal,.5)?goal:leader,dt,this.stats(e).speed);if(this.time>=(e.followSpeechAt||0)){this.say(e,'follow');e.followSpeechAt=this.time+12+index*3;}};
    if(leader&&(distance(e,leader)>8||roomAt(this.map,e)?.id!==roomAt(this.map,leader)?.id)){follow();return;}
    const r=roomAt(this.map,e);
    if(!r){
      if(e.kind==='player'&&this.mode==='arena'&&e.route){const p=e.route[e.routeIndex]||e.route.at(-1);if(distance(e,p)<1.3)e.routeIndex++;this.steer(e,p,dt,this.stats(e).speed);}
      else if(e.kind==='player'&&this.mode==='dungeon'){const next=this.map.rooms[Math.min(7,e.room+1)];this.steer(e,next.entryGoal||{x:next.x+3,y:next.y+12},dt,this.stats(e).speed);}
      return;
    }
    if(e.kind==='player'&&this.mode==='arena'&&r.lava>0){this.say(e,'lava');this.arenaBotRoute(e,r,dt);return;}
    if(e.kind==='player'&&r.heal&&!r.healStarted){const spring={x:r.x+r.w/2,y:r.y+r.h/2};this.say(e,'rest');if(distance(e,spring)<3.5)this.interact(e);else this.steer(e,spring,dt,this.stats(e).speed);return;}
    if(e.kind==='player'&&r.heal&&r.healStarted&&this.map.rooms[r.id+1]?.locked){const party=this.entities.filter(p=>p.kind==='player'&&!p.dead),index=party.indexOf(e),angle=index*Math.PI*2/party.length,goal={x:r.x+r.w/2+Math.cos(angle)*6,y:r.y+r.h/2+Math.sin(angle)*6};if(distance(e,goal)>1)this.steer(e,goal,dt,this.stats(e).speed);this.say(e,'rest');return;}
    if(this.time>=(e.perceptionAt||0)){e.perceptionAt=this.time+.2;e.enemyIds=this.entities.filter(t=>this.validHit(e,t)&&roomAt(this.map,t)?.id===r.id&&distance(e,t)<24&&lineOfSight(this.map,e,t)).map(t=>t.id);}
    const enemies=this.entities.filter(t=>e.enemyIds?.includes(t.id)&&this.validHit(e,t)&&roomAt(this.map,t)?.id===r.id);
    if(e.kind==='player'&&['heal','healbolt'].includes(e.equipment.main?.type)){
      const allies=this.entities.filter(t=>t.team===e.team&&t.kind==='player'&&!t.dead&&roomAt(this.map,t)?.id===r.id);
      if(allies.length<=1){const item=e.equipment.main;this.drop(item,e);e.equipment.main=this.createItem(this.id('item'),{starter:true});}
      else{const injured=allies.filter(t=>t.hp/t.maxHp<.8).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
        if(injured){this.say(e,'heal');if(injured===e){if(e.cooldowns.special<=0)this.attack(e,{aimX:e.x,aimY:e.y},true);}
          else if(distance(e,injured)>4||!lineOfSight(this.map,e,injured))this.steer(e,injured,dt,this.stats(e).speed);
          else{e.facing=Math.atan2(injured.y-e.y,injured.x-e.x);this.attack(e,{aimX:injured.x,aimY:injured.y});if(injured.hp/injured.maxHp<.45)this.attack(e,{aimX:injured.x,aimY:injured.y},true);}return;}
        const threat=enemies.sort((a,b)=>distance(e,a)-distance(e,b))[0];if(threat&&distance(e,threat)<3){this.steer(e,{x:e.x+(e.x-threat.x),y:e.y+(e.y-threat.y)},dt,this.stats(e).speed);return;}
        if(threat){const lead=allies.filter(t=>t!==e&&!['heal','healbolt'].includes(t.equipment.main?.type)).sort((a,b)=>distance(a,threat)-distance(b,threat))[0];if(lead&&distance(e,lead)>3)this.steer(e,lead,dt,this.stats(e).speed);return;}
      }
    }
    let target=enemies.sort((a,b)=>distance(e,a)-distance(e,b))[0];
    if(e.tauntUntil>this.time)target=enemies.find(t=>t.id===e.taunt)||target;
    const order=this.directed.get(e.id);if(order?.target)target=enemies.find(t=>t.id===order.target)||target;
    const range=e.kind==='monster'?Math.max(e.range,WEAPONS[e.equipment.main?.type]?.range||0):WEAPONS[e.equipment.main?.type]?.range||.7;
    if(target&&e.kind==='player'&&e.team==='party'&&distance(e,target)>5&&this.chests.some(c=>c.room===r.id&&!c.opened))target=null;
    if(e.kind==='monster'&&['archer','mage','bombardier','healer'].includes(e.type)){this.monsterTactics(e,target,dt);return;}
    if(target){
      this.say(e,target.boss?'boss':e.hp/e.maxHp<.3?'low':'enemy');
      e.facing=Math.atan2(target.y-e.y,target.x-e.x);
      if(e.kind==='player'&&e.equipment.off?.type==='shield'&&target.attackPose>0&&distance(e,target)<(target.range||2)+.8&&e.guard>.5&&e.guardRecovery<=0){e.blockUntil=this.time+.25;e.blocking=true;}
      if(e.kind==='player'&&range>=5&&distance(e,target)<2.8){const angle=Math.atan2(e.y-target.y,e.x-target.x);this.steer(e,{x:e.x+Math.cos(angle)*2,y:e.y+Math.sin(angle)*2},dt,this.stats(e).speed);if(e.equipment.main?.type==='bow')this.attack(e,{aimX:target.x,aimY:target.y},true);e.facing=Math.atan2(target.y-e.y,target.x-e.x);return;}
      if(distance(e,target)>Math.min(range,6)){let goal=target;if(e.kind==='player'&&range<3){const allies=this.entities.filter(t=>t.bot&&!t.dead&&t.team===e.team),slot=Math.max(0,allies.indexOf(e)),a=Math.atan2(e.y-target.y,e.x-target.x)+((slot%3)-1)*.65;goal={x:target.x+Math.cos(a)*range*.65,y:target.y+Math.sin(a)*range*.65};}this.steer(e,goal,dt,this.stats(e).speed);} 
      if(distance(e,target)<=Math.min(range,6)+.35&&lineOfSight(this.map,e,target)){e.facing=Math.atan2(target.y-e.y,target.x-e.x);if(e.equipment.main?.type==='bow'){e.bowCharge=(e.bowCharge||0)+dt;if(e.bowCharge>1.5)this.attack(e,{aimX:target.x,aimY:target.y});}else this.attack(e,{aimX:target.x,aimY:target.y});}
      if(e.boss&&e.cooldowns.special<=0){this.bossSkill(e,Math.floor(this.random()*3));e.cooldowns.special=5;}
      if(e.kind==='player'&&e.cooldowns.special<=0&&distance(e,target)<(range>=5?15:2.7)&&e.equipment.main?.type!=='dagger')this.attack(e,{aimX:target.x,aimY:target.y},true);
    }else if(e.kind==='monster'&&order)this.steer(e,order,dt,this.stats(e).speed);
    else if(e.kind==='clone'){const owner=this.entities.find(x=>x.id===e.owner);if(distance(e,owner)>2)this.steer(e,owner,dt,6);}
    else if(e.kind==='player'){
      const value=item=>{if(!item)return 0;if(item.kind==='main'&&['heal','healbolt'].includes(item.type)&&this.entities.filter(t=>t.team===e.team&&!t.dead&&t.kind==='player').length<=1)return -100;const w=WEAPONS[item.type],attack=item.ranges?.attack?(item.ranges.attack[0]+item.ranges.attack[1])/2:item.stats.attack||0;return item.kind==='main'?(attack/Math.max(.4,w?.delay||.65))*(w?.range>=5?1.35:w?.hands===2?1.4:1)+item.tier*3:(item.stats.defense||0)*1.6+(item.stats.hp||0)*.3+(item.stats.agility||0)*.5+item.tier*2;};
      const wants=l=>{
        let slot=l.item.kind==='lantern'?'off':l.item.kind;
        if(slot==='main'&&WEAPONS[l.item.type]?.hands===1&&WEAPONS[e.equipment.main?.type]?.hands===1&&!e.equipment.off)slot='off';
        const lostOther=slot==='main'&&WEAPONS[l.item.type]?.hands===2?value(e.equipment.off):slot==='off'&&WEAPONS[e.equipment.main?.type]?.hands===2?value(e.equipment.main):0;
        return value(l.item)>value(e.equipment[slot])+lostOther+1;
      };
      const loot=this.loot.filter(l=>wants(l)&&(!leader||distance(leader,l)<7)&&distance(e,l)<10&&lineOfSight(this.map,e,l)).sort((a,b)=>distance(e,a)-distance(e,b))[0];
      if(loot){if(distance(e,loot)<1.4){if(this.equip(e,loot))this.say(e,'loot');}else this.steer(e,loot,dt,this.stats(e).speed);return;}
      const chest=this.chests.filter(c=>c.room===r.id&&!c.opened&&(!leader||distance(leader,c)<7)).sort((a,b)=>{const score=c=>distance(e,c)+(this.entities.some(t=>t!==e&&t.bot&&!t.dead&&t.team===e.team&&t.chestTarget===c.id)?20:0);return score(a)-score(b);})[0];if(chest){if(e.chestTarget!==chest.id)this.say(e,'chest');e.chestTarget=chest.id;this.steer(e,chest,dt,this.stats(e).speed);if(distance(e,chest)<1.5&&this.time>e.aiAt){this.interact(e,true);const q=this.quizByPlayer.get(e.id);if(q)this.answer(e,String(q.answer));e.aiAt=this.time+2;}return;}
      else if(this.mode==='dungeon'&&!target){if(leader){follow();return;}const next=this.map.rooms[Math.min(7,r.id+1)];if(!next.locked&&(!r.heal||this.healUntil<=this.time)){this.say(e,'next');this.steer(e,next.entryGoal||{x:next.x+3,y:next.y+12},dt,this.stats(e).speed);}else if(r.heal)this.say(e,'rest');else{const points=[{x:r.x+r.w*.5,y:r.y+r.h*.5},{x:r.x+r.w-4,y:r.y+4},{x:r.x+r.w-4,y:r.y+r.h-4},{x:r.x+4,y:r.y+r.h-4},{x:r.x+4,y:r.y+4}].filter(p=>walkable(this.map,p,.5));e.searchIndex??=0;let goal=points[e.searchIndex%points.length];if(goal&&(distance(e,goal)<1||this.time>(e.searchUntil||0))){e.searchIndex++;e.searchUntil=this.time+5;goal=points[e.searchIndex%points.length];}if(goal)this.steer(e,goal,dt,this.stats(e).speed);}}
      else if(this.mode==='arena'&&!loot&&!chest){this.arenaBotRoute(e,r,dt);}
    }
  }
  arenaBotRoute(e,r,dt){
    // Follow the explicit elbow corridor geometry toward the central room as lava spreads.
    const goal=this.map.rooms[5];if(r.id===5){if(!e.wander||distance(e,e.wander)<1)e.wander=this.point(r);this.steer(e,e.wander,dt,4);return;}
    const row=Math.floor(r.id/4),col=r.id%4;let nextId=col!==1?r.id+(col>1?-1:1):r.id+(row>1?-4:4);
    const next=this.map.rooms[nextId];let waypoints;
    if(Math.floor(nextId/4)===row){const left=r.x<next.x?r:next,right=left===r?next:r,mid=(left.x+left.w+right.x)/2;
      waypoints=[{x:r.x<next.x?r.x+r.w-2:r.x+2,y:r.y+r.h/2},{x:mid,y:r.y+r.h/2},{x:mid,y:next.y+next.h/2},{x:next.x+next.w/2,y:next.y+next.h/2}];
    }else{const top=r.y<next.y?r:next,bottom=top===r?next:r,mid=(top.y+top.h+bottom.y)/2;waypoints=[{x:r.x+r.w/2,y:r.y<next.y?r.y+r.h-2:r.y+2},{x:r.x+r.w/2,y:mid},{x:next.x+next.w/2,y:mid},{x:next.x+next.w/2,y:next.y+next.h/2}];}
    if(e.routeRoom!==r.id){e.routeRoom=r.id;e.route=waypoints;e.routeIndex=0;}
    const p=e.route[e.routeIndex]||e.route.at(-1);if(distance(e,p)<1.3)e.routeIndex++;this.steer(e,p,dt,this.stats(e).speed);
  }
  step(dt=.05){
    if(this.result)return;this.map.bodies=this.entities;if(this.phase==='planning'){if(this.commands.length)this.tickId++;for(const c of this.commands.splice(0))this.process(c.id,c);if(this.phase==='planning')return;}dt=clamp(finite(dt,.05),0,.1);this.time+=dt;this.tickId++;
    for(const c of this.commands.splice(0))this.process(c.id,c);
    if(this.phase==='spawn'){if(this.time>=this.spawnUntil){this.phase='playing';this.arenaReinforceAt=this.time+20;this.note('20초 후 추가 몬스터가 진입합니다.');}return;}
    if(this.treasureRespawnAt&&this.time>=this.treasureRespawnAt){this.entities=this.entities.filter(e=>e.type!=='treasure'||!e.dead);this.treasureRespawnAt=0;this.spawnTreasure();this.map.bodies=this.entities;}
    if(this.mode==='arena'&&!this.arenaReinforced&&this.time>=this.arenaReinforceAt)this.arenaReinforcements();
    for(const e of this.entities){
      if(e.emergeUntil>this.time)continue;
      if(e.enterUntil>this.time){const t=1-(e.enterUntil-this.time)/1.2;e.x=e.enterFrom.x+(e.enterTo.x-e.enterFrom.x)*t;e.y=e.enterFrom.y+(e.enterTo.y-e.enterFrom.y)*t;continue;}
      if(e.dead){const i=this.inputs.get(e.id);if(i){e.x=clamp(e.x+i.mx*8*dt,0,this.map.width);e.y=clamp(e.y+i.my*8*dt,0,this.map.height);}continue;}
      for(const k of ['stun','root','slow','immune','invuln','burn','poison','bleed','acid','attackPose','hitPose'])e[k]=Math.max(0,(e[k]||0)-dt);
      for(const k of Object.keys(e.cooldowns))e.cooldowns[k]=Math.max(0,e.cooldowns[k]-dt);
      this.syncHp(e);
      if(e.burn||e.poison||e.bleed)this.hurt(e,dt*((e.burn?3:0)+(e.poison?2:0)+(e.bleed?3:0)),null,{dot:true});
      if(e.dead)continue;
      if(this.affixes(e).some(a=>a.key==='regen'))e.hp=Math.min(e.maxHp,e.hp+dt*2);
    if(e.cast&&e.cast.ends<=this.time){const c=e.cast;e.cast=null;if(c.kind!=='boss-ring'){
      if(e.kind==='player'){const mode=['slam','earthline','cometfall','breadline'].includes(c.kind)?'slam':['double','bleed','bladewave','crescent'].includes(c.kind)?'dash':'combo';e.skillPose={mode,started:this.time,ends:this.time+.36};}
      this.special(e,c);
    }}
      e.dashing=false;if(e.dashRecovery>0){e.dashRecovery=Math.max(0,e.dashRecovery-dt);if(e.dashRecovery===0)e.dash=3;}
      const controlled=e.id===this.possession?this.inputs.get(this.masterId):this.inputs.get(e.id);
      if(controlled&&!e.bot||e.id===this.possession){
        const i=controlled||{};const hasShield=e.equipment.off?.type==='shield';
        const wasBlocking=e.blocking;
        e.blocking=!!i.block&&hasShield&&e.guard>.05&&e.guardRecovery<=0&&!e.cast;
        if(wasBlocking&&!e.blocking&&e.guardRecovery<=0)e.guardRecovery=1;
        if(e.blocking){e.guard=Math.max(0,e.guard-dt);if(e.guard===0)e.guardRecovery=5;}
        else {e.guardRecovery=Math.max(0,e.guardRecovery-dt);e.guard=Math.min(5,e.guard+dt);}
        const dx=finite(i.mx),dy=finite(i.my),len=Math.hypot(dx,dy);
        const ranged=e.equipment.main?.type==='bow'||WEAPONS[e.equipment.main?.type]?.range>=5;
        if(ranged||e.blocking)e.facing=Math.atan2(i.aimY-e.y,i.aimX-e.x);
        else if(len)e.facing=Math.atan2(dy,dx);
        if((i.attack||i.special)&&Math.hypot(i.aimX-e.x,i.aimY-e.y)>.1)e.facing=Math.atan2(i.aimY-e.y,i.aimX-e.x);
        if(len&&e.stun<=0&&e.root<=0&&!e.cast){e.dashing=!!i.sprint&&e.dashRecovery<=0&&e.dash>0;if(e.dashing){e.dash=Math.max(0,e.dash-dt);if(e.dash<.00001){e.dash=0;e.dashRecovery=3;}}if(e.dashing&&!e.wasDashing)this.fx('dash',e,e.facing,.25);const speed=this.stats(e).speed*(e.dashing?1.6:1)*(e.blocking?.35:1)*(this.possession===e.id?.65:1);move(this.map,e,dx/Math.max(1,len)*speed*dt,dy/Math.max(1,len)*speed*dt,e.kind==='monster');e.lastMove=this.time;if(e.dashing&&this.tickId%7===0)this.fx('dust',e,e.facing,.25);}e.wasDashing=e.dashing;
        if(e.equipment.main?.type==='bow'){if(i.attack)e.bowCharge=Math.min(2.5,(e.bowCharge||0)+dt);else if(e.bowCharge>0)this.attack(e,i);}else if(i.attack&&((weaponSkill(e.equipment.main)&&WEAPONS[e.equipment.main?.type]?.range>=5)||!e.basicHeld))this.attack(e,i);e.basicHeld=!!i.attack;
        if(i.special)this.attack(e,i,true);
      }else this.ai(e,dt);
      if(!e.dashing&&e.dashRecovery<=0)e.dash=Math.min(3,e.dash+dt);
      if(e.whirl){const held=e.bot||controlled?.special;if(!held||this.time>=e.whirl.ends||e.stun>0||e.dead||e.equipment.off?.type==='shield'){e.whirl=null;}else{if(controlled&&(controlled.mx||controlled.my))e.facing=Math.atan2(controlled.my,controlled.mx);e.attackPose=.25;if(this.time>=e.whirl.next){e.whirl.next=this.time+.25;this.area(e,e,WEAPONS[e.equipment[e.whirl.slot]?.type]?.range||2.8,e.whirl.damage*.35,{proc:false});this.fx('spin',e,this.time*14,.26,{radius:WEAPONS[e.equipment[e.whirl.slot]?.type]?.range||2.8,feedback:itemFeedback(e.equipment[e.whirl.slot])});}}}
      const r=roomAt(this.map,e);if(r){e.room=r.id;if(r.lava>0)this.hurt(e,dt*r.lava,null,{dot:true});}
      if(e.kind==='monster'&&e.type!=='treasure'&&!e.starterSlime&&!e.equipment.main){const loot=this.loot.find(l=>distance(e,l)<1);if(loot)this.equip(e,loot);}
      // Thrown daggers auto-equip on contact while the main hand is empty.
      if(!e.equipment.main){const l=this.loot.find(l=>l.item.type==='dagger'&&distance(e,l)<.9);if(l)this.equip(e,l);}
      if(this.affixes(e).some(a=>a.key==='blaze')&&this.time-e.lastMove<.1&&e.blazeReady){this.scheduleZone(e,'fire',e,1,0,6,2);e.blazeReady=false;}
      if(this.time-e.lastMove>2)e.blazeReady=true;
    }
    this.updateProjectiles(dt);this.updateZones();
    for(const t of this.traps){t.cool=Math.max(0,t.cool-dt);if(t.cool<=0){const e=this.entities.find(e=>!e.dead&&e.team!=='monsters'&&distance(e,t)<.8);if(e){this.hurt(e,15,null,{stun:.4});t.cool=2;this.fx('trap',t,0,.5);}}}
    this.effects=this.effects.filter(f=>(f.life-=dt)>0);
    if(this.mode==='dungeon')this.dungeonProgress();else this.arenaProgress();
    if(this.time>=600&&!this.result){if(this.mode==='dungeon')this.finish('master','10분 방어 성공');else{const alive=this.entities.filter(e=>e.kind==='player'&&!e.dead);alive.sort((a,b)=>b.hp/b.maxHp-a.hp/a.maxHp||b.hp-a.hp||a.id.localeCompare(b.id));this.finish(alive[0]?.id||null,'시간 종료 · 생존 체력 비율 순위');}}
  }
  updateProjectiles(dt){
    for(const p of this.projectiles){
      const owner=this.entities.find(e=>e.id===p.owner);if(!owner){p.done=true;continue;}
      const travel=Math.min(p.speed*dt,p.remaining);const n=Math.max(1,Math.ceil(travel/.25));
      for(let i=0;i<n&&!p.done;i++){
        const old={x:p.x,y:p.y};p.x+=Math.cos(p.angle)*travel/n;p.y+=Math.sin(p.angle)*travel/n;p.remaining-=travel/n;
        if(!walkable(this.map,p,.05)){p.x=old.x;p.y=old.y;p.done=true;}
        const hit=this.entities.find(e=>!e.dead&&e.id!==owner.id&&!p.hitIds?.includes(e.id)&&distance(e,p)<.6&&lineOfSight(this.map,old,e)&&(p.kind==='heal'?e.team===owner.team:this.validHit(owner,e)));
        if(hit){
          if(p.kind==='heal'){hit.hp=Math.min(hit.maxHp,hit.hp+(p.healAmount||hit.maxHp*.1));this.fx('heal',hit);}else this.hurt(hit,p.damage,{...owner,projectile:true},{ignore:!!p.ignore,push:.25});
          if(p.stun)this.status(hit,'stun',p.stun);if(p.root)this.status(hit,'root',p.root);if(p.burn)this.status(hit,'burn',p.burn);if(p.pierce){p.hitIds??=[];p.hitIds.push(hit.id);}else p.done=true;
        }
        if(p.remaining<=.01)p.done=true;
      }
      if(p.done){if(p.kind==='magic')this.fx(p.weapon==='fireball'?'fireball':p.weapon,p,0,.4,{radius:.8});if(p.kind==='fireball'){this.area(owner,p,3,p.damage,{push:3});this.fx('fireball',p,0,.6,{radius:3});}if(p.item)this.drop(p.item,p);}
    }
    this.projectiles=this.projectiles.filter(p=>!p.done);
  }
  updateZones(){
    for(const z of this.zones){const owner=this.entities.find(e=>e.id===z.owner);if(!owner)continue;
      if(z.steerable){const input=this.inputs.get(owner.id);if(input){const dx=input.aimX-z.x,dy=input.aimY-z.y,len=Math.hypot(dx,dy),p={x:z.x+dx/Math.max(1,len)*.3,y:z.y+dy/Math.max(1,len)*.3};if(walkable(this.map,p,.05)&&distance(owner,p)<=25){z.x=p.x;z.y=p.y;}}}
      if(this.time>=z.at&&this.time>=z.next){
        const first=!z.active;z.active=true;z.next=this.time+.5;
        if(first)this.fx(z.kind,z,0,z.kind==='breadrise'?.9:.6,{radius:z.radius});if(z.kind==='moonheal')this.healArea(owner,z,z.radius,8);
        for(const target of this.entities)if(this.validHit(owner,target)&&attackContains(z,target)&&lineOfSight(this.map,z,target))this.hurt(target,z.damage*(first?1:.25),owner,{stun:z.stun,proc:false});
        if(['poison','acid','meteor','fire'].includes(z.kind))for(const t of this.entities)if(this.validHit(owner,t)&&attackContains(z,t)&&lineOfSight(this.map,z,t)){this.status(t,z.kind==='acid'?'acid':z.kind==='poison'?'poison':'burn',z.kind==='acid'?5:2);}
        if(!z.duration)z.expires=this.time;
      }
    }
    this.zones=this.zones.filter(z=>z.expires>this.time);
  }
  dungeonProgress(){
    const players=this.entities.filter(e=>e.kind==='player'&&!e.dead);
    if(!players.length){this.finish('master','모든 모험가 탈락');return;}
    for(const r of this.map.rooms){
      if(players.some(p=>p.room===r.id)){
        this.currentRoom=Math.max(this.currentRoom,r.id);
        if(this.builders[r.id]&&!this.builders[r.id].locked){this.builders[r.id].locked=true;this.note(`${r.id+1}번 방 배치 마감 · 현재 배치대로 진행합니다.`);}
        const monsters=this.entities.some(e=>e.kind==='monster'&&!e.dead&&e.type!=='treasure'&&e.room===r.id);
        if(!monsters){
          if(r.heal&&!r.healStarted)continue;
          if(r.id===7){this.finish('party','최종 방 정복');return;}
          const next=this.map.rooms[r.id+1];if(next.locked&&(!r.heal||this.time>=this.healUntil&&(this.options.singlePlayer===false||players.every(p=>roomAt(this.map,p)?.id===r.id)))){next.locked=false;this.spawnTreasure();this.note(`${next.id+1}번 방으로 가는 문이 열렸습니다.`);if(this.builders[next.id])this.builders[next.id].locked=true;}
        }
      }
    }
  }
  arenaProgress(){
    if(this.time>=this.respawnAt){for(const r of this.map.rooms){const unopened=this.chests.filter(c=>!c.opened&&c.room===r.id).length;if(unopened<8)this.addChest(r);}this.respawnAt+=60;}
    for(const r of this.map.rooms){const dist=Math.abs(r.id%4-1)+Math.abs(Math.floor(r.id/4)-1),start=60+(3-dist)*80;r.lava=this.time>=start?clamp(1+Math.floor((this.time-start)/35),1,10):0;}
    const alive=this.entities.filter(e=>e.kind==='player'&&!e.dead);if(alive.length<=1&&this.entities.filter(e=>e.kind==='player').length>1)this.finish(alive[0]?.id||null,'최후의 생존자');
  }
  finish(winner,reason){this.result={winner,reason,time:this.time};this.phase='over';this.note(reason);}
  vision(e){
    if(!e||e.dead)return 10;const lantern=e.equipment.off?.type==='lantern'?e.equipment.off:null;
    const weapon=e.equipment.main?.type;return lantern?.tier===3?250:Math.max(10+(lantern?.vision||0),weapon==='bow'||WEAPONS[weapon]?.range>=5?15:0);
  }
  sightSources(viewer){
    if(!viewer)return [];
    return [viewer,...(this.mode==='dungeon'&&!viewer.dead?this.entities.filter(e=>e!==viewer&&e.kind==='player'&&!e.dead&&e.team===viewer.team):[])];
  }
  canSee(viewer,p,cachedSources=null){
    if(!viewer)return false;if(viewer.dead)return true;
    return (cachedSources||this.sightSources(viewer)).some(e=>visibleFrom(this.map,{...e,radius:this.vision(e),arc:VISION_ARC,fullRoom:e.equipment.off?.type==='lantern'&&e.equipment.off.tier===3,poison:this.zones.some(z=>z.active&&z.kind==='poison'&&distance(e,z)<z.radius)},p));
  }

  snapshot(id){
    const me=this.entities.find(e=>e.id===id);const master=id===this.masterId;
    const viewer=me?.dead&&me.follow?this.entities.find(e=>e.id===me.follow&&!e.dead)||me:me;
    const sources=this.sightSources(viewer);
    const visible=p=>master||!!me?.dead||this.phase==='spawn'||this.canSee(viewer,p,sources);
    const clean=e=>({id:e.id,kind:e.kind,type:e.type,name:e.name,headId:e.headId,team:e.team,x:e.x,y:e.y,room:e.room,facing:e.facing,hp:e.hp,maxHp:e.maxHp,dead:e.dead,tier:e.tier,boss:e.boss,bot:e.bot,speech:e.speech?.until>this.time?e.speech:null,aiState:e.aiState,equipment:e.equipment,
      cooldowns:e.cooldowns,guard:e.guard,guardRecovery:e.guardRecovery,blocking:e.blocking,combo:e.combo||0,comboUntil:e.comboUntil||0,dashing:!!e.dashing,dash:e.dash,dashRecovery:e.dashRecovery,whirl:e.whirl?{ends:e.whirl.ends}:null,attackPose:e.attackPose,skillPose:e.skillPose?.ends>this.time?e.skillPose:null,enterUntil:e.enterUntil,emergeUntil:e.emergeUntil,hitPose:e.hitPose,cast:e.cast,bowCharge:e.bowCharge||0,stun:e.stun,root:e.root,slow:e.slow,invuln:e.invuln,follow:e.follow,stats:this.stats(e)});
    const entities=this.entities.filter(e=>!(e.kind==='monster'&&e.dead)&&(e.id===id||visible(e)||master)).map(clean);
    const q=this.quizByPlayer.get(id);
    return {version:1,tick:this.tickId,time:this.time,mode:this.mode,phase:this.phase,masterId:this.masterId,possession:this.possession,me:me?clean(me):null,
      objective:viewer?{gathered:this.entities.filter(p=>p.kind==='player'&&!p.dead&&roomAt(this.map,p)?.heal).length,livingParty:this.entities.filter(p=>p.kind==='player'&&!p.dead).length,healReady:this.time>=this.healUntil,room:viewer.room,monsters:this.entities.filter(e=>e.kind==='monster'&&e.type!=='treasure'&&!e.dead&&e.room===viewer.room).length,chests:this.chests.filter(c=>!c.opened&&c.room===viewer.room).length,exit:!this.map.rooms[Math.min(7,viewer.room+1)]?.locked}:null,entities,loot:this.loot.filter(visible),chests:this.chests.filter(visible).map(({contents,...chest})=>chest),traps:this.traps.filter(t=>master||!!me?.dead||sources.some(e=>e.equipment.off?.type==='lantern'&&this.canSee(e,t,[e]))),
      projectiles:this.projectiles.filter(visible),zones:this.zones.filter(visible),effects:this.effects.filter(visible),map:this.map,builders:master?this.builders:{},
      visionSources:master||me?.dead?[]:sources.map(e=>({id:e.id,x:e.x,y:e.y,facing:e.facing,arc:VISION_ARC,nearRadius:3,radius:this.vision(e),fullRoom:e.equipment.off?.type==='lantern'&&e.equipment.off.tier===3,poison:this.zones.some(z=>z.active&&z.kind==='poison'&&distance(e,z)<z.radius)})),
      quiz:q?{chest:q.chest,question:q.question,feedback:q.feedback,done:q.done}:null,roster:this.entities.filter(e=>e.kind==='player').map(e=>({id:e.id,name:e.name,dead:e.dead,hp:e.hp,maxHp:e.maxHp})),
      messages:this.messages,result:this.result,currentRoom:this.currentRoom,healUntil:this.healUntil,remaining:Math.max(0,600-this.time)};
  }
}









