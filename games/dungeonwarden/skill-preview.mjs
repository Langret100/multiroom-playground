import {DungeonGame} from '../../cf-worker/src/dungeon/engine.mjs?v=20261009-final-equipment';
import {weaponSkill,SKILL_DETAILS} from './shared/weapon-skills.mjs';
import {WEAPONS} from './shared/catalog.mjs';
import {ClassicCombat} from './classic-combat.mjs?v=20261009-final-equipment';
export class SkillPreview {
 constructor(characters){this.characters=characters;this.catalog=new DungeonGame({seed:42,bots:0}).itemCatalog;this.direction=0;this.special=true;}
 select(appearance,special=this.special,direction=this.direction){
  this.appearance=appearance;this.special=special;this.direction=direction;this.clock=0;this.started=false;this.accumulator=0;this.characters.actors.clear();
  const g=this.game=new DungeonGame({mode:'arena',seed:42,bots:0,roster:[{id:'preview-hero',name:'시전자'},{id:'preview-target',name:'표적'}]});
  g.phase='playing';g.entities=g.entities.filter(e=>e.kind==='player');g.map={width:60,height:40,rooms:[{id:0,x:0,y:0,w:60,h:40,lava:0}],corridors:[],obstacles:[]};g.loot=[];g.chests=[];g.traps=[];g.projectiles=[];g.zones=[];g.effects=[];g.ai=()=>{};g.arenaProgress=()=>{};g.arenaReinforceAt=Infinity;g.arenaWarnAt=Infinity;
  const hero=this.hero=g.entities[0],target=this.target=g.entities[1],item=this.item=this.catalog.find(i=>i.appearance===appearance);
  if(!item)throw Error('Unknown weapon '+appearance);hero.equipment={main:structuredClone(item)};target.equipment={};
  hero.x=27;hero.y=20;hero.facing=direction;hero.enterUntil=hero.emergeUntil=target.enterUntil=target.emergeUntil=0;
  const ranged=WEAPONS[item.type].range>=5,distance=ranged?5:2.4;target.x=hero.x+Math.cos(direction)*distance;target.y=hero.y+Math.sin(direction)*distance;target.facing=direction+Math.PI;
  if(['heal','healbolt'].includes(item.type)){hero.team=target.team='party';hero.hp=target.hp=40;}
  hero.affixes=[];target.affixes=[];g.map.bodies=g.entities;g.input(hero.id,{});g.input(target.id,{});
  const skill=weaponSkill(item);return `${item.name} · ${special?skill.name:'기본 공격'}${special?' — '+(SKILL_DETAILS[skill.kind]||'조준 위치에 '+skill.name):''}`;
 }
 advance(dt){
  if(!this.game)return;this.clock+=dt;
  if(this.clock>6){this.select(this.appearance,this.special,this.direction);return;}
  this.accumulator+=dt;while(this.accumulator>=1/60){this.accumulator-=1/60;const g=this.game,h=this.hero,t=this.target;
   const input={mx:this.walking?Math.cos(this.direction)*.2:0,my:this.walking?Math.sin(this.direction)*.2:0,block:!!this.guardPreview,aimX:t.x,aimY:t.y,special:this.special&&weaponSkill(this.item).kind==='spin'&&g.time>=.5&&g.time<2.4,attack:!this.special&&this.item.type==='bow'&&g.time>=.5&&g.time<1.4};g.input(h.id,input);
   if(this.guardPreview&&g.time>=1&&g.time>=(this.guardHitAt||0)){this.guardHitAt=g.time+1;g.attack(t,{aimX:h.x,aimY:h.y});}
   if(g.time>=.5&&!this.started){this.started=true;if(this.special||this.item.type!=='bow')g.attack(h,input,this.special);}
   g.step(1/60);
  }
 }
 paint(c,width,height){
  const g=this.game;if(!g)return;c.resetTransform();c.clearRect(0,0,width,height);c.fillStyle='#15212b';c.fillRect(0,0,width,height);
  const scale=Math.min(38,width/24),cx=29,cy=20;c.save();c.translate(width/2,height*.64);c.scale(scale,scale*.74);c.translate(-cx,-cy);
  for(let y=9;y<30;y++)for(let x=14;x<44;x++){c.fillStyle=(x+y)%2?'#26353c':'#29393f';c.fillRect(x,y,.98,.98);}
  for(const z of g.zones){if(z.active&&['poison','acid','vines','moonheal','fire'].includes(z.kind))ClassicCombat.paint(c,{...z,maxLife:1,life:1-(g.time-z.at)%1});}
  for(const e of g.entities){if(e.dead)continue;c.fillStyle='#0d182355';c.beginPath();c.ellipse(e.x,e.y+.14,.65,.20,0,0,Math.PI*2);c.fill();c.save();c.translate(e.x,e.y);c.scale(1,1/.74);c.translate(-e.x,-e.y);if(e.hitPose)c.filter='brightness(2)';this.characters.draw(c,{...e,poseTime:g.time},g.time,false,0,this.clock);c.restore();}
  for(const z of g.zones)ClassicCombat.meteorFall(c,z,g.time);
  for(const p of g.projectiles)if(p.echoItem)this.characters.drawEcho(c,p,g.time);else ClassicCombat.projectile(c,p,g.time);
  for(const f of g.effects){if(f.kind==='slash'&&f.owner===this.hero.id&&!this.special)continue;ClassicCombat.paint(c,f);}
  c.restore();
 }
}
