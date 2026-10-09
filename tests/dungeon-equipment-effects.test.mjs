import test from 'node:test';
import assert from 'node:assert/strict';
import {SkillPreview} from '../games/dungeonwarden/skill-preview.mjs';
import {equipmentTrait} from '../games/dungeonwarden/shared/equipment-traits.mjs';
function scene(){const p=new SkillPreview({actors:new Map()});p.select('longsword',false);const {game:g,hero:a,target:b}=p;a.invuln=b.invuln=0;a.equipment.main.affixes=[];a.hp=b.hp=10000;a.maxHp=b.maxHp=10000;return {g,a,b,item:id=>({...structuredClone(g.itemCatalog.find(i=>i.appearance===id)),affixes:[]})};}
test('shield counters require front blocking and respect their two-second cooldown',()=>{
 const {g,a,b,item}=scene();a.equipment.off=item('phoenix_shield');assert.equal(equipmentTrait(a.equipment.off).kind,'flameguard');a.blocking=true;g.hurt(a,10,b,{push:0});assert.equal(g.projectiles.length,1);assert.equal(g.projectiles[0].kind,'ember');assert.equal(g.projectiles[0].targetId,b.id);g.hurt(a,10,b,{push:0});assert.equal(g.projectiles.length,1);g.time=3;a.facing=Math.PI;g.hurt(a,10,b,{push:0});assert.equal(g.projectiles.length,1);
});
test('frost armor slows nearby visible enemies on actual damage with a four-second cooldown',()=>{
 const {g,a,b,item}=scene();a.equipment.armor=item('crystal_plate');assert.equal(equipmentTrait(a.equipment.armor).kind,'frostarmor');g.hurt(a,10,b,{push:0});assert.equal(b.slow,2);assert.ok(g.effects.some(f=>f.kind==='frost'&&f.radius===3));b.slow=0;g.hurt(a,10,b,{push:0});assert.equal(b.slow,0);
});
test('armor clones retain the equipped weapon pixels, launch in order and cannot become loot',()=>{
 const {g,a,b,item}=scene();a.equipment.armor=item('royal_cloak');a.attackPose=.2;g.updateEquipment(a);assert.equal(g.projectiles.length,3);assert.ok(g.projectiles.every(p=>p.echoItem.appearance===a.equipment.main.appearance&&p.homing&&!p.item));assert.ok(g.projectiles[0].launchAt<g.projectiles[1].launchAt);g.time=.1;const hp=b.hp;g.updateProjectiles(1/30);assert.equal(b.hp,hp);g.time=1;for(let i=0;i<120;i++){g.time+=1/30;g.updateProjectiles(1/30);}assert.ok(b.hp<hp);assert.equal(g.loot.length,0);
});
test('moving flame armor leaves bounded fire zones rather than an invisible stat increase',()=>{
 const {g,a,item}=scene();a.equipment.armor=item('phoenix_robe');assert.equal(equipmentTrait(a.equipment.armor).kind,'flamewake');g.time=1;a.lastMove=1;g.updateEquipment(a);assert.equal(g.zones.length,1);assert.equal(g.zones[0].kind,'fire');g.updateEquipment(a);assert.equal(g.zones.length,1);g.time=2;g.updateEquipment(a);assert.equal(g.zones.length,1);
});
test('instant staff beams hit along the visible ray and stop at walls',()=>{
 const {g,a,b,item}=scene();a.equipment.main=item('astral_staff_lightning');g.special(a,{kind:'forklightning',slot:'main',x:b.x,y:b.y});assert.ok(b.hp<10000);assert.equal(g.effects.filter(f=>f.kind==='beam').length,3);b.hp=10000;b.x=a.x+7;g.map.obstacles=[{x:a.x+3,y:a.y-4,w:1,h:8}];g.effects=[];g.special(a,{kind:'forklightning',slot:'main',x:b.x,y:b.y});assert.equal(b.hp,10000);assert.ok(g.effects.filter(f=>f.kind==='beam').every(f=>f.length<=3.000001));
});
