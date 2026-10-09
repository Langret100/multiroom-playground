import test from 'node:test';
import assert from 'node:assert/strict';
import {DungeonGame} from '../cf-worker/src/dungeon/engine.mjs';
import {visibleFrom} from '../games/dungeonwarden/shared/vision.mjs';
import {attackContains,weaponPreview} from '../games/dungeonwarden/shared/combat.mjs';
import {WEAPONS,makeItem} from '../games/dungeonwarden/shared/catalog.mjs';
const simple=()=>{const g=new DungeonGame({mode:'dungeon',bots:0,seed:42});g.entities=g.entities.filter(e=>e.id==='local');g.map.bodies=g.entities;g.map.obstacles=[];g.chests=[];g.traps=[];const e=g.entities[0];e.x=10;e.y=11;e.facing=0;return [g,e];};
test('front cone shows actors and treasure; rear, distance and obstruction hide them',()=>{
  const [g,e]=simple(),r=g.map.rooms[0];const front=g.addMonster('slime',0,r,{x:16,y:11}),rear=g.addMonster('slime',0,r,{x:6,y:11}),far=g.addMonster('slime',0,r,{x:22,y:11});
  const cf=g.addChest(r,0,{x:15,y:11}),cb=g.addChest(r,0,{x:6,y:11});let s=g.snapshot(e.id);
  assert.ok(s.entities.some(x=>x.id===front.id));assert.ok(!s.entities.some(x=>x.id===rear.id||x.id===far.id));assert.ok(s.chests.some(c=>c.id===cf.id));assert.ok(!s.chests.some(c=>c.id===cb.id));assert.equal(s.map.rooms.length,8);
  g.map.obstacles.push({x:12,y:9,w:1,h:4});s=g.snapshot(e.id);assert.ok(!s.entities.some(x=>x.id===front.id));assert.ok(!s.chests.some(c=>c.id===cf.id));
  e.facing=Math.PI;assert.ok(g.snapshot(e.id).entities.some(x=>x.id===rear.id));
});
test('lantern trap visibility obeys angle and walls; SSR keeps its full-room ability',()=>{
  const [g,e]=simple();e.equipment.off=makeItem(g.random,'lantern',{kind:'lantern',tier:2});g.traps=[{id:'front',x:15,y:11},{id:'rear',x:6,y:11}];assert.deepEqual(g.snapshot(e.id).traps.map(t=>t.id),['front']);
  e.equipment.off.tier=3;assert.equal(g.snapshot(e.id).traps.length,2);g.map.obstacles.push({x:12,y:9,w:1,h:4});assert.deepEqual(g.snapshot(e.id).traps.map(t=>t.id),['rear']);
});
test('cone and rectangle damage geometry matches boss telegraphs',()=>{
  const [g,e]=simple(),r=g.map.rooms[0],dragon=g.addMonster('dragon',0,r,{x:4,y:11});g.bossSkill(dragon,0);const z=g.zones[0];assert.equal(z.shape,'cone');assert.ok(attackContains(z,e));assert.ok(!attackContains(z,{x:4,y:17}));
  const back=g.actor('back','player',2,11,{team:'party',room:0});g.entities.push(back);const hp=back.hp;g.time=z.at;g.updateZones();assert.equal(back.hp,hp);assert.ok(e.hp<e.maxHp);
});
test('all weapon previews have finite geometry and staff basic fourteen-step range',()=>{
  const [g,e]=simple();for(const type of Object.keys(WEAPONS)){e.equipment.main=makeItem(g.random,type,{kind:'main',type,tier:0});for(const special of [false,true]){const p=weaponPreview(e,{x:20,y:13},special,g.map.rooms[0]);assert.ok(p);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok((p.radius||p.length)>0);}}
  e.equipment.main=makeItem(g.random,'magic',{kind:'main',type:'meteor',tier:0});assert.equal(weaponPreview(e,{x:20,y:11}).length,16*1.2);assert.equal(weaponPreview(e,{x:20,y:11},true).radius,6);
});

test('ghost sees all rooms and hidden objects even when following a living player',()=>{
 const [g,e]=simple(),r=g.map.rooms[7],far=g.addMonster('slime',0,r,{x:r.x+10,y:r.y+11});
 const chest=g.addChest(r,0,{x:r.x+12,y:11});g.traps=[{id:'hidden-trap',x:r.x+14,y:11}];
 g.loot=[{id:'hidden-loot',x:r.x+15,y:11,item:makeItem(g.random,'drop',{kind:'main',tier:0})}];
 assert.ok(!g.snapshot(e.id).entities.some(x=>x.id===far.id));e.dead=true;
 const ally=g.actor('ally','player',10,11,{team:'party',room:0});g.entities.push(ally);
 for(const follow of ['',ally.id]){e.follow=follow;const s=g.snapshot(e.id);assert.ok(s.entities.some(x=>x.id===far.id));assert.ok(s.chests.some(x=>x.id===chest.id));assert.equal(s.traps.length,1);assert.equal(s.loot.length,1);assert.deepEqual(s.visionSources,[]);assert.ok(!('contents' in s.chests[0]));}
});

test('arena offers twenty seconds of weak slimes after selection then one corner wave',()=>{
 const g=new DungeonGame({mode:'arena',bots:0,seed:42});
 assert.ok(g.entities.filter(e=>e.kind==='monster'&&e.type!=='treasure').every(e=>e.type==='slime'&&e.hp===45&&!e.equipment.main));
 for(let i=0;i<200;i++)g.step(.05);assert.equal(g.phase,'playing');assert.ok(g.messages.some(m=>m.text.includes('20초 후 첫 몬스터 증원')));
 const at=g.arenaReinforceAt;g.time=at-.1;g.step(.05);assert.equal(g.arenaWave,0);g.time=at;g.step(.05);
 const wave=g.entities.filter(e=>e.enterUntil);assert.ok(wave.length>0);assert.ok(wave.every(e=>e.enterUntil>g.time));
 const n=g.entities.length;g.step(.05);assert.equal(g.entities.length,n);
 const dead=wave[0];g.kill(dead,null);g.entities.find(e=>e.id==='local').dead=true;assert.ok(!g.snapshot('local').entities.some(e=>e.id===dead.id));
});

test('near circular sight reveals the rear but remains occluded by walls',()=>{
 const [g,e]=simple(),r=g.map.rooms[0],rear=g.addMonster('slime',0,r,{x:8,y:11});
 assert.ok(g.snapshot(e.id).entities.some(x=>x.id===rear.id));g.map.obstacles.push({x:8.7,y:10,w:.4,h:2});assert.ok(!g.snapshot(e.id).entities.some(x=>x.id===rear.id));
});

test('dungeon shares distant unlit ally vision including chests; arena keeps personal sight',()=>{
 const [g,e]=simple(),r=g.map.rooms[7];const ally=g.actor('ally','player',r.x+5,r.y+11,{team:e.team,room:7,facing:0});g.entities.push(ally);
 const mob=g.addMonster('slime',0,r,{x:r.x+10,y:r.y+11}),chest=g.addChest(r,0,{x:r.x+9,y:r.y+11});let s=g.snapshot(e.id);
 assert.ok(s.entities.some(x=>x.id===mob.id));assert.ok(s.chests.some(x=>x.id===chest.id));assert.deepEqual(s.visionSources.map(x=>x.id),[e.id,ally.id]);
 g.map.obstacles.push({x:r.x+7,y:r.y+9,w:1,h:4});assert.ok(!g.snapshot(e.id).entities.some(x=>x.id===mob.id));g.map.obstacles=[];
 ally.dead=true;assert.ok(!g.snapshot(e.id).entities.some(x=>x.id===mob.id));ally.dead=false;g.mode='arena';assert.ok(!g.snapshot(e.id).entities.some(x=>x.id===mob.id));
});




