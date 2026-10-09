import test from 'node:test';
import assert from 'node:assert/strict';
import {DungeonGame} from '../cf-worker/src/dungeon/engine.mjs';
import {makeItem,WEAPONS} from '../games/dungeonwarden/shared/catalog.mjs';
import {lineOfSight,walkable,roomAt} from '../games/dungeonwarden/shared/world.mjs';
function game(options={}){const g=new DungeonGame({seed:42,mode:'dungeon',bots:0,...options});g.entities=g.entities.filter(e=>e.kind==='player');g.chests=[];g.loot=[];if(g.mode==='dungeon'&&g.role!=='master'){g.map.rooms[0].w=60;g.map.rooms[0].h=60;g.map.obstacles=g.map.obstacles.filter(o=>o.room!==0);for(const r of g.map.rooms.slice(1))r.x+=60;for(const o of g.map.obstacles)o.x+=60;for(const c of g.map.corridors)c.x+=60;g.map.width+=60;g.map.height=60;const local=g.entities.find(e=>e.id==='local');local.x=30;local.y=30;}g.map.bodies=g.entities;return g;}
const me=g=>g.entities.find(e=>e.id==='local');
function item(g,kind,type,tier=0){const i=makeItem(g.random,g.id('item'),{kind,tier});if(type)i.type=type;return i;}
function advance(g,seconds){for(let i=0;i<Math.round(seconds/.05)&&!g.result;i++)g.step(.05);}

test('seed gives reproducible map and loot, options roster is not mutated',()=>{
  const roster=[{id:'local',name:'나'}];const a=new DungeonGame({mode:'arena',seed:9,bots:2,roster}),b=new DungeonGame({mode:'arena',seed:9,bots:2,roster});
  assert.deepEqual(a.map,b.map);assert.deepEqual(a.chests,b.chests);assert.equal(roster.length,1);
});
test('input cannot teleport; diagonal normalization and Shift speed',()=>{
  const a=game(),b=game();const ea=me(a),eb=me(b),start={x:ea.x,y:ea.y};
  a.input('local',{mx:1,my:1,x:99999,y:99999});b.input('local',{mx:1,my:0,sprint:true});advance(a,1);advance(b,1);
  const walk=Math.hypot(ea.x-start.x,ea.y-start.y),run=eb.x-start.x;
  assert.ok(Math.abs(walk-6.42)<.01);assert.ok(Math.abs(run/walk-1.6)<.01);assert.ok(ea.x<40);
});
test('commands cannot spoof master or another player identity',()=>{
  const g=game();g.command('local',{id:'ai-master',action:'place',room:2,type:'slime',x:165,y:15});g.step();assert.equal(g.entities.filter(e=>e.kind==='monster'&&e.type!=='treasure').length,0);
});
test('walls and pillars block motion and visibility',()=>{
  const g=game();g.map.obstacles.push({x:35,y:25,w:2,h:10});assert.equal(lineOfSight(g.map,{x:30,y:30},{x:40,y:30}),false);
  g.input('local',{mx:1});advance(g,3);assert.ok(me(g).x<35);assert.equal(walkable(g.map,{x:36,y:30}),false);
});
test('player staff and bow projectile reach includes the twenty percent increase',()=>{
  for(const [type,range] of [['meteor',16*1.2],['heal',12*1.2],['bow',27*1.2]]){
    const g=game();const e=me(g);e.equipment.main=item(g,'main',type);e.bowCharge=2.5;g.attack(e,{aimX:e.x+25,aimY:e.y});assert.equal(g.projectiles[0].remaining,range);assert.equal(g.projectiles[0].speed,type==='bow'?20:14);assert.equal(g.projectiles[0].visualScale,type==='bow'?1:1.8);
  }
});
test('projectiles cannot cross a wall and throwing keeps same item identity',()=>{
  const g=game();const e=me(g);e.facing=0;e.equipment.main=item(g,'main','dagger');const original=e.equipment.main;
  g.map.obstacles.push({x:e.x+2,y:e.y-1,w:1,h:2});g.special(e,{kind:'throw'});assert.equal(e.equipment.main,null);g.updateProjectiles(.5);
  assert.equal(g.projectiles.length,0);assert.equal(g.loot[0].item.id,original.id);assert.ok(g.loot[0].x<e.x+3);
});
test('dual wield special comes from left; shields disable weapon special',()=>{
  const g=game(),e=me(g);e.equipment.off=item(g,'main','mace');g.attack(e,{aimX:e.x+2,aimY:e.y},true);assert.equal(e.cast.kind,'push');
  e.cast=null;e.cooldowns.special=0;e.equipment.off=item(g,'off','shield');g.attack(e,{},true);assert.equal(e.cast,null);
});
test('loot has no backpack, two handed weapons release offhand, death preserves charges',()=>{
  const g=game(),e=me(g);e.equipment.off=item(g,'off','shield',2);e.equipment.off.affixes=[{key:'autoblock',chance:1,charges:1,maxCharges:3}];const shield=e.equipment.off;
  const drop={id:'test',x:e.x,y:e.y,item:item(g,'main','hammer')};g.loot.push(drop);g.equip(e,drop);assert.equal(e.equipment.off,null);assert.equal(e.equipment.main.type,'hammer');
  assert.equal(g.loot.find(l=>l.item.id===shield.id).item.affixes[0].charges,1);
  g.kill(e);assert.ok(e.dead);assert.equal(Object.values(e.equipment).length,0);assert.ok(g.loot.some(l=>l.item.type==='hammer'));
});
test('fractional lava damage is one HP per second, not one per tick',()=>{
  const g=game(),e=me(g),before=e.hp;for(let i=0;i<20;i++)g.hurt(e,.05,null,{dot:true});assert.ok(Math.abs(e.hp-(before-1))<1e-8);
});
test('unlimited chest retries and atomic first opener; answers are private',()=>{
  const g=game();const e=me(g),b=g.actor('b','player',e.x,e.y,{team:'party'});g.entities.push(b);const chest=g.addChest(g.map.rooms[0],3,{x:e.x,y:e.y});
  g.interact(e);g.interact(b);const qa=g.quizByPlayer.get(e.id),qb=g.quizByPlayer.get(b.id);g.answer(e,'');assert.equal(chest.opened,false);
  g.answer(e,String(qa.answer));assert.ok(chest.opened);assert.equal(g.loot.length,1);g.answer(b,String(qb.answer));assert.match(g.quizByPlayer.get(b.id).feedback,/비었다/);assert.equal(g.loot.length,1);
  assert.equal(g.snapshot('b').quiz.answer,undefined);
});
test('master budget, overlapping placements and room lock are enforced',()=>{
  const g=game({role:'master',bots:1});const r=g.map.rooms[2];const c={room:2,type:'slime',tier:0,x:r.x+5,y:r.y+5};
  assert.equal(g.place('other',c),false);assert.equal(g.place('local',c),true);assert.equal(g.place('local',c),false);assert.equal(g.builders[2].spent,5);
  g.builders[2].locked=true;assert.equal(g.place('local',{...c,x:r.x+20}),false);
});
test('boss placement excludes normal monsters except final room',()=>{
  const g=game({role:'master',bots:1}),r=g.map.rooms[3];g.builders[3].budget=1000;
  assert.ok(g.place('local',{room:3,type:'golem',x:r.x+15,y:r.y+15}));assert.equal(g.place('local',{room:3,type:'slime',x:r.x+25,y:r.y+15}),false);
});
test('monster/player damage cannot cross room boundary',()=>{
  const g=game(),e=me(g),m=g.addMonster('slime',0,g.map.rooms[1]);const hp=m.hp;g.hurt(m,999,e);assert.equal(m.hp,hp);
});
test('FOV snapshot hides distant enemies and supports shared lantern only in dungeon',()=>{
  for(const mode of ['arena','dungeon']){
    const g=game({mode});g.phase='playing';const e=me(g),room=g.map.rooms[0];room.w=Math.max(room.w,60);room.h=Math.max(room.h,60);g.map.obstacles=[];e.x=room.x+10;e.y=room.y+10;
    e.facing=0;const ally=g.actor('ally','player',e.x+12,e.y,{team:e.team});ally.facing=0;ally.equipment.off=item(g,'lantern',null,2);g.entities.push(ally);
    const m=g.addMonster('slime',0,room,{x:e.x+22,y:e.y});
    assert.equal(g.snapshot('local').entities.some(x=>x.id===m.id),mode==='dungeon');
  }
});
test('single master AI opens chests, crosses corridors, clears and reaches final room',()=>{
  const g=new DungeonGame({mode:'dungeon',role:'master',bots:3,seed:42});g.command('local',{action:'startRaid'});advance(g,400);assert.ok(g.currentRoom>=6);assert.equal(g.result.winner,'party');assert.ok(g.chests.some(c=>c.opened));
});
test('AI master fills five editable rooms with budgets, monsters have at most one item',()=>{
  const g=new DungeonGame({mode:'dungeon',role:'adventurer',bots:2,seed:42});assert.equal(Object.keys(g.builders).length,5);
  for(const r of g.map.rooms.filter(r=>r.editable))assert.ok(g.entities.some(e=>e.kind==='monster'&&e.room===r.id));
  for(const e of g.entities.filter(e=>e.kind==='monster'&&e.type!=='treasure'))assert.equal(Object.values(e.equipment).filter(Boolean).length,1);
});
test('arena bots navigate elbow corridors to the central room; idle human never becomes AI',()=>{
  const g=new DungeonGame({mode:'arena',bots:3,seed:42});g.entities=g.entities.filter(e=>e.kind==='player');g.chests=[];
  const player=me(g),start={x:player.x,y:player.y};
  for(const e of g.entities){e.invuln=1000;e.team='party';}
  advance(g,160);assert.equal(player.x,start.x);assert.equal(player.y,start.y);
  for(const bot of g.entities.filter(e=>e.bot))assert.equal(bot.room,5);
});
test('arena spawn expires, chests respawn and lava escalates before ten minute timeout',()=>{
  const g=game({mode:'arena'});g.entities= [me(g)];g.time=10;g.step();assert.equal(g.phase,'playing');
  g.time=61;g.step();assert.ok(g.chests.length>0);assert.ok(g.map.rooms.some(r=>r.lava>0));
  g.time=599.95;g.step(.1);assert.equal(g.result.reason,'시간 종료 · 생존 체력 비율 순위');
});
test('all weapon specials execute without crashing',()=>{
  for(const [type,w] of Object.entries(WEAPONS)){
    const g=game(),e=me(g);e.equipment.main=item(g,'main',type);g.attack(e,{aimX:e.x+3,aimY:e.y+3},true);advance(g,2);assert.ok(Number.isFinite(e.hp),type);
  }
});




