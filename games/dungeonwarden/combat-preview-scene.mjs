import {createMatchItemCatalog} from './shared/catalog.mjs';
import {ClassicCombat} from './classic-combat.mjs?v=20261008-rpg';
const items=createMatchItemCatalog(42);
const modes={sword:['longsword','sword'],dagger:['fang_knife','dagger'],hammer:['war_hammer','hammer'],arrow:['longbow','bow'],meteor:['iron_meteor_staff','meteor']};
export function paintCombatPreview(c,characters,mode,time,width,height){
 const [appearance,type]=modes[mode]||modes.sword,item=items.find(i=>i.appearance===appearance)||items.find(i=>i.type===type),cycle=time%2.5;
 const hero={id:'preview-hero',kind:'player',headId:'p1',x:-2.4,y:0,facing:0,equipment:{main:item},combo:1,attackPose:cycle>=.4&&cycle<.65?.65-cycle:0,hitPose:0};
 const meteor=mode==='meteor',ranged=meteor||mode==='arrow',impact=meteor?1.25:mode==='arrow'?.55:.5,age=cycle-impact;
 const target={id:'preview-target',kind:'player',headId:'p2',x:0,y:0,facing:Math.PI,equipment:{},combo:0,attackPose:0,hitPose:age>=0&&age<.12?.12-age:0};
 if(meteor){hero.attackPose=0;hero.cast=cycle>=.4&&cycle<.75?{started:.4,ends:.75}:null;}
 c.resetTransform();c.clearRect(0,0,width,height);c.fillStyle='#15212b';c.fillRect(0,0,width,height);
 const scale=Math.min(42,width/13);c.save();c.translate(width/2,height*.64);c.scale(scale,scale*.74);
 for(let y=-7;y<6;y++)for(let x=-8;x<9;x++){c.fillStyle=(x+y)%2?'#26353c':'#29393f';c.fillRect(x,y,.98,.98);}
 c.fillStyle='#0d182333';for(const e of [hero,target]){c.beginPath();c.ellipse(e.x,e.y+.14,.65,.20,0,0,Math.PI*2);c.fill();}
 // Actors retain upright proportions; ground and attack geometry share the same camera.
 for(const e of [hero,target]){c.save();c.translate(e.x,e.y);c.scale(1,1/.74);c.translate(-e.x,-e.y);if(e.hitPose)c.filter='brightness(2)';characters.draw(c,e,cycle,false,0,time);c.restore();}
 if(mode==='arrow'&&cycle>=.4&&cycle<.55)ClassicCombat.projectile(c,{kind:'arrow',angle:0,x:hero.x+(cycle-.4)*16,y:0},time);
 if(meteor){
  const zone={kind:'meteor',created:.75,at:1.25,x:target.x,y:target.y,radius:2};
  if(cycle>=.75&&cycle<1.25)ClassicCombat.meteorFall(c,zone,cycle);
  if(age>=0&&age<.6)ClassicCombat.paint(c,{kind:'meteor',x:target.x,y:target.y,radius:2,life:.6-age,maxLife:.6});
 }
 if(age>=0&&age<.38)ClassicCombat.paint(c,{kind:'hit',x:target.x,y:target.y,life:.38-age,maxLife:.38,value:meteor?42:12,heavy:meteor,angle:0});
 c.restore();
}
