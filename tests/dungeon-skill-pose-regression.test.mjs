import test from 'node:test';
import assert from 'node:assert/strict';
import {DungeonGame} from '../cf-worker/src/dungeon/engine.mjs';
import {skillMotion} from '../games/dungeonwarden/skill-motion.mjs';
import {SkillPreview} from '../games/dungeonwarden/skill-preview.mjs';
test('hammer slam damages the expanded edge and effect reports the identical radius',()=>{
 const g=new DungeonGame({mode:'arena',seed:42,bots:0,roster:[{id:'local'},{id:'target'}]});g.phase='playing';g.entities=g.entities.filter(e=>e.kind==='player');g.map={width:60,height:40,rooms:[{id:0,x:0,y:0,w:60,h:40}],corridors:[],obstacles:[]};
 const [a,b]=g.entities;a.equipment.main=g.itemCatalog.find(i=>i.type==='hammer'&&i.tier===1);a.x=20;a.y=20;a.facing=0;const reach=4.4,center={x:20+reach*.6,y:20};b.x=center.x;b.y=center.y+3;const hp=b.hp;
 g.special(a,{kind:'slam',slot:'main',x:b.x,y:b.y,damage:10});assert.ok(b.hp<hp);const f=g.effects.find(f=>f.kind==='slam');assert.equal(f.radius,reach*.6*1.2);assert.equal(f.x,center.x);assert.equal(f.y,center.y);
 b.hp=hp;b.invuln=0;b.y=center.y+3.4;g.special(a,{kind:'slam',slot:'main',x:b.x,y:b.y,damage:10});assert.equal(b.hp,hp);
});
test('skill motion distinguishes throws, bow draw, spell cast, hammer impact and retreat',()=>{
 assert.equal(skillMotion('throw','dagger'),'throw');assert.equal(skillMotion('starfan','dagger'),'throw');assert.equal(skillMotion('thornfan','bow'),'shoot');assert.equal(skillMotion('meteor','staff'),'cast');assert.equal(skillMotion('earthline','hammer'),'slam');assert.equal(skillMotion('backstep','bow'),'dodge');assert.equal(skillMotion('spin','greatsword'),'whirlwind');
});
test('preview executes every authored weapon special using the authoritative engine',()=>{
 const preview=new SkillPreview({actors:new Map()});const ids=['zweihander','war_hammer','longbow','iron_meteor_staff','ritual_knife','clock_hand','frying_pan','moon_staff_heal','phoenix_bow','astral_staff_lightning'];
 for(const id of ids){preview.select(id,true);let events=0;for(let i=0;i<180;i++){preview.advance(1/30);events+=preview.game.effects.length+preview.game.zones.length+preview.game.projectiles.length;}assert.ok(events>0,id);}
});
test('expanded sword reach hits its new edge and remains a melee combo',()=>{
 const p=new SkillPreview({actors:new Map()});p.select('longsword',false);const g=p.game,a=p.hero,b=p.target;a.root=1;b.x=a.x+4.4;b.y=a.y;const hp=b.hp;g.attack(a,{aimX:b.x,aimY:b.y});assert.ok(b.hp<hp);assert.equal(a.combo,1);
 a.cooldowns.attack=0;b.hp=hp;b.x=a.x+4.8;g.attack(a,{aimX:b.x,aimY:b.y});assert.equal(b.hp,hp);
});
test('meteor zone and impact apply range expansion once',()=>{
 const p=new SkillPreview({actors:new Map()});p.select('iron_meteor_staff',true);const g=p.game;g.special(p.hero,{kind:'meteor',slot:'main',x:p.target.x,y:p.target.y,damage:10});const zone=g.zones[0];assert.equal(zone.radius,6);g.time=zone.at;g.updateZones();const impact=g.effects.find(f=>f.kind==='meteor');assert.equal(impact.radius,zone.radius);
});
