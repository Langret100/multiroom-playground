import {P1ModularAssets,P1WeaponMotion} from './character-core.mjs?v=0.5.8';
import {WEAPONS} from './shared/catalog.mjs';
import {paintItemIcon,paintWeapon} from './graphics.mjs';
const directions=['front','side','back'];
export class CharacterRenderer {
 constructor(canvas=null){this.canvas=canvas;this.ready=false;this.actors=new Map();this.icons=new Map();this.heads=new Map();if(canvas)canvas.dataset.characterAssets='loading';}
 async load(spec){
  if(!spec)return;const catalog=spec.catalog,images={},files=new Set([catalog.body,...catalog.heads,...catalog.equipment,...catalog.armor,...(catalog.weaponAssets?[catalog.weaponAssets]:[])].flatMap(x=>[x.file,x.expressionFile].filter(Boolean)));
  await Promise.all([...files].map(file=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images[file]=image;resolve();};image.onerror=()=>reject(new Error('Character asset: '+file));image.src=spec.images?.[file]||'assets/'+spec.path+file;})));
  this.factory=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};this.art=P1ModularAssets.create(catalog,images,this.factory);this.catalog=catalog;this.ready=true;if(this.canvas)this.canvas.dataset.characterAssets='ready';
 }
 family(item){return WEAPONS[item?.type]?.range>=5&&item?.type!=='bow'?'staff':item?.type||'sword';}
 key(item){return JSON.stringify([item?.designId,item?.appearance,item?.type,item?.tier,item?.visual]);}
 weapon(item){
  if(!item){const sprite=this.factory(1,1);sprite.grip={x:0,y:0};return {sprite,theme:'iron',family:'sword'};}
  const family=this.family(item),key='weapon:'+this.key(item),generated=this.art.items?.[item.appearance];
  if(generated)return {sprite:generated,theme:(item.tier||0)>=2?'rare':'iron',family};
  if(!this.icons.has(key)){
   const raw=this.factory(64,64),g=raw.getContext('2d');g.imageSmoothingEnabled=false;g.translate(32,46);g.scale(20,20);g.rotate(-Math.PI/2);paintWeapon(g,item,0);
   const data=g.getImageData(0,0,64,64).data;let l=64,t=64,r=0,b=0;
   for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(data[(y*64+x)*4+3]>160){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
   if(l>r){l=t=0;r=b=0;}const c=this.factory(r-l+1,b-t+1),cg=c.getContext('2d');cg.imageSmoothingEnabled=false;cg.drawImage(raw,l,t,c.width,c.height,0,0,c.width,c.height);
   const pixels=cg.getImageData(0,0,c.width,c.height);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>160?255:0;cg.putImageData(pixels,0,0);c.grip={x:32-l,y:46-t};this.icons.set(key,c);
  }
  return {sprite:this.icons.get(key),theme:(item.tier||0)>=2?'rare':'iron',family};
 }
 accessory(item){
  if(!item)return null;const key='accessory:'+this.key(item);if(this.icons.has(key))return this.icons.get(key);
  const size=item.kind==='helmet'?24:item.type==='lantern'?10:14,c=this.factory(size,size),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.translate(size/2,size/2);g.scale(size/2.5,size/2.5);paintItemIcon(g,item,0);
  const pixels=g.getImageData(0,0,size,size);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>160?255:0;g.putImageData(pixels,0,0);this.icons.set(key,c);return c;
 }
 wearPart(source,item,name){
  if(!item)return source;const key='wear:'+name+':'+this.key(item);
  this.wearCache??=new WeakMap();let variants=this.wearCache.get(source);if(!variants)this.wearCache.set(source,variants=new Map());if(variants.has(key))return variants.get(key);
  const skirt=name==='torso'&&item.visual?.cut==='skirt',c=this.factory(source.width+(skirt?2:0),source.height),g=c.getContext('2d');g.drawImage(source,skirt?1:0,0);const p=g.getImageData(0,0,c.width,c.height),color=item.visual?.primary||((item.tier||0)>1?'#9373aa':'#84969c'),rgb=color.match(/[0-9a-f]{2}/gi)?.slice(0,3).map(x=>parseInt(x,16))||[132,150,156];
  for(let i=0;i<p.data.length;i+=4){const r=p.data[i],gr=p.data[i+1],b=p.data[i+2];if(p.data[i+3]<30)continue;if(!name.includes('Leg')&&r>b*1.28&&r>gr*1.08)continue;const factor=.35+(r+gr+b)/3/255*.9;for(let k=0;k<3;k++)p.data[i+k]=Math.round(Math.min(245,rgb[k]*factor));}
  g.putImageData(p,0,0);const shape=item.visual?.shape||item.appearance||'',profile=item.visual?.profile;
  if(name==='torso'){g.fillStyle=item.visual?.accent||'#bdb39a';g.fillRect(2,c.height-3,c.width-4,1);if(profile==='rune'||profile==='crystal')g.fillRect(Math.floor(c.width/2),c.height-6,1,2);if(['robe','cloak','tunic'].includes(shape)){g.fillStyle=color;g.fillRect(1,c.height-2,c.width-2,1);}}
  if(skirt){g.fillStyle=color;g.fillRect(0,c.height-2,c.width,1);g.fillStyle=item.visual?.accent||'#bdb39a';g.fillRect(1,c.height-1,c.width-2,1);}
  c.armorCut=item.visual?.cut||'straight';variants.set(key,c);return c;
 }
 rig(headId,eq){const rig=this.art.rig(headId);for(const d of directions){for(const n of ['torso','leftArm','rightArm'])rig.sprites[d][n]=this.wearPart(rig.sprites[d][n],eq.armor,n);for(const n of ['leftLeg','rightLeg'])rig.sprites[d][n]=this.wearPart(rig.sprites[d][n],eq.boots,n);}return rig;}
 head(e){const id=e.id.replace(/-trail$/,'');if(e.headId&&this.art.heads[e.headId])return e.headId;if(id==='portrait-preview')return this.heads.get(e.originalId)||'p1';if(!this.heads.has(id))this.heads.set(id,id==='local'?'p1':'p'+(2+[...this.heads.keys()].filter(k=>k!=='local').length%7));return this.heads.get(id);}
 drawPreview(ctx,e,time,width,height){
  if(!this.ready)return;this.previewCanvas??=this.factory(96,96);const g=this.previewCanvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,96,96);g.save();g.translate(48,66);g.scale(16,16);
  this.draw(g,{...e,id:e.id+'-equipment-preview',x:0,y:0,facing:Math.PI/2,pose:null,attackPose:0,hitPose:0,skillPose:null,cast:null,whirl:null,dashing:false},time,false,0);g.restore();
  const data=g.getImageData(0,0,96,96).data;let left=96,top=96,right=0,bottom=0;for(let y=0;y<96;y++)for(let x=0;x<96;x++)if(data[(y*96+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(left>right)return;const w=right-left+1,h=bottom-top+1,scale=Math.min(1.6,(width-16)/w,(height-20)/h),dw=w*scale,dh=h*scale;ctx.imageSmoothingEnabled=false;ctx.drawImage(this.previewCanvas,left,top,w,h,Math.round((width-dw)/2),Math.round((height-dh)/2),dw,dh);
 }
 draw(ctx,e,time,moving,index,visualTime=time){
  if(!this.ready||e.kind!=='player')return false;if(e.pose==='victory')time=performance.now()/1000;const id=e.id.replace(/-trail$/,''),head=this.head(e),eq=e.equipment||{},signature=head+'|'+['armor','boots','main','off','helmet'].map(k=>this.key(eq[k])).join('|');
  let actor=this.actors.get(id);if(!actor||actor.signature!==signature){const rig=this.rig(head,eq),weapon=this.weapon(eq.main);actor={signature,rig,weapon,canvas:this.factory(96,96),motion:P1WeaponMotion.create(rig,{},this.factory)};this.actors.set(id,actor);}
  const x=Math.cos(e.facing||0),y=Math.sin(e.facing||0),dir=Math.abs(x)>Math.abs(y)?x>0?'right':'side':y>0?'front':'back';
  const skill=e.skillPose?.ends>time?e.skillPose:null;
  const mode=e.pose==='victory'?'victory':e.hitPose?'hurt':e.whirl?'whirlwind':skill?skill.mode:e.attackPose?'combo':e.cast?'combo':e.dashing?'run':moving?'walk':'idle';
  const def=P1WeaponMotion.weapons.find(w=>w[0]===actor.weapon.family)||P1WeaponMotion.weapons[0],start=e.cast?(e.cast.started??e.cast.ends-.12):0;
  const animationTime=skill?(time-skill.started)*(mode==='combo'?def[4]:1.05)/Math.max(.01,skill.ends-skill.started):e.attackPose?Math.max(0,1-e.attackPose/.25)*def[4]:e.cast?Math.min(.3,Math.max(0,time-start)/Math.max(.12,e.cast.ends-start)*.3)*def[4]:visualTime;
  actor.motion.render(actor.canvas,dir,actor.weapon.family,animationTime,{mode,single:!!skill||!!e.attackPose&&!e.whirl,combo:e.combo||1,weapon:actor.weapon.sprite,grip:actor.weapon.sprite.grip,helmet:this.accessory(eq.helmet),shield:eq.off?.type==='shield'?this.accessory(eq.off):null,theme:actor.weapon.theme,effects:false});
  const matrix=ctx.getTransform?.();
  const sx=Math.max(1,Math.abs(matrix?.a||1)),sy=Math.max(1,Math.abs(matrix?.d||1));
  const snap=(v,scale)=>Math.round(v*scale)/scale;
  const drawW=6.3,drawH=6.3,anchorY=.69;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(actor.canvas,snap(e.x-drawW/2,sx),snap(e.y-drawH*anchorY,sy),drawW,drawH);
  if(eq.off&&eq.off.type!=='shield'){const icon=this.accessory(eq.off),sway=Math.sin(visualTime*(moving?11:2.5)-.5)*.05;ctx.save();ctx.translate(e.x+(dir==='side'?0:-.9),e.y-1.25+sway);ctx.rotate(sway);ctx.drawImage(icon,-.4,-.4,.8,.8);ctx.restore();}return true;
 }
 itemSprite(item){if(!this.ready)return null;if(item.kind==='main')return this.weapon(item).sprite;if(item.kind==='armor')return this.wearPart(this.art.body.front.torso,item,'torso');if(item.kind==='boots'){const key='boot-pair:'+this.key(item);if(!this.icons.has(key)){const c=this.factory(12,9),g=c.getContext('2d');g.drawImage(this.wearPart(this.art.body.front.leftLeg,item,'leftLeg'),0,0);g.drawImage(this.wearPart(this.art.body.front.rightLeg,item,'rightLeg'),7,0);this.icons.set(key,c);}return this.icons.get(key);}return this.accessory(item);}
 drawDrop(ctx,item){const c=this.itemSprite(item);if(!c)return false;const baseLength=c.motionLength||(item.kind==='main'?(['greatsword','hammer'].includes(this.family(item))?27:21):item.kind==='armor'?16:14),boost={main:1.26,armor:1.24,helmet:1.2,boots:1.22,off:1.18}[item.kind]||1.16,scale=baseLength/c.height/16*boost*1.0,offsetY={main:-.12,armor:-.18,helmet:-.22,boots:.12,off:-.08}[item.kind]||0;ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(0,offsetY);if(item.kind==='main')ctx.rotate(-.45);ctx.drawImage(c,-c.width*scale/2,-c.height*scale/2,c.width*scale,c.height*scale);ctx.restore();return true;}
}
