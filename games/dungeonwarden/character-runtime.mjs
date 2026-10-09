import {equipmentTrait} from './shared/equipment-traits.mjs?v=20261009-final-equipment';
import {equipmentKey,lanternPose,lanternColor} from './equipment-art.mjs?v=20261009-final-equipment';
import {P1ModularAssets,P1WeaponMotion} from './character-core.mjs?v=20261009-final-equipment';
import {WEAPONS,itemFeedback} from './shared/catalog.mjs';
import {skillMotion} from './skill-motion.mjs?v=20261009-final-equipment';
import {paintItemIcon,paintWeapon} from './graphics.mjs';
const directions=['front','side','back'];
export class CharacterRenderer {
 constructor(canvas=null){this.canvas=canvas;this.ready=false;this.actors=new Map();this.icons=new Map();this.heads=new Map();if(canvas)canvas.dataset.characterAssets='loading';}
 async load(spec){
  if(!spec)return;const catalog=spec.catalog,images={},files=new Set([catalog.body,...catalog.heads,...catalog.equipment,...catalog.armor,...(catalog.weaponAssets?[catalog.weaponAssets]:[])].flatMap(x=>[x.file,x.expressionFile].filter(Boolean)));
  await Promise.all([...files].map(file=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images[file]=image;resolve();};image.onerror=()=>reject(new Error('Character asset: '+file));const src=spec.images?.[file]||'assets/'+spec.path+file;image.src=src.startsWith('data:')?src:src+(src.includes('?')?'&':'?')+'v='+(spec.assetVersion||'20261009-final-equipment');})));
  this.factory=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};this.art=P1ModularAssets.create(catalog,images,this.factory);this.catalog=catalog;this.ready=true;if(this.canvas)this.canvas.dataset.characterAssets='ready';
 }
 family(item){return WEAPONS[item?.type]?.range>=5&&item?.type!=='bow'?'staff':item?.type||'sword';}
 key(item){return JSON.stringify([item?.designId,item?.appearance,item?.type,item?.tier,item?.visual]);}
 weapon(item){
  if(!item){const sprite=this.factory(1,1);sprite.grip={x:0,y:0};return {sprite,theme:'iron',family:'sword'};}
  const family=this.family(item),key='weapon:'+this.key(item),generated=this.art.items?.[item.appearance];
  const centralGrip=sprite=>{if(family==='axe')sprite.edgeSide=({wood_axe:-1,battle_axe:1,moon_axe:1})[item.appearance]||1;if(family==='staff'&&!['spellbook','flower_wand'].includes(item.visual?.shape)){sprite.grip={x:sprite.grip?.x??sprite.width/2,y:sprite.height*.53};}return sprite;};
  if(generated)return {sprite:centralGrip(generated),theme:(item.tier||0)>=2?'rare':'iron',family};
  if(!this.icons.has(key)){
   const size=192,origin=96,raw=this.factory(size,size),g=raw.getContext('2d');g.imageSmoothingEnabled=false;g.translate(origin,origin);g.scale(40,40);g.rotate(-Math.PI/2);paintWeapon(g,item,0);
   const data=g.getImageData(0,0,size,size).data;let l=size,t=size,r=0,b=0;
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(data[(y*size+x)*4+3]>160){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
   if(l>r){l=t=0;r=b=0;}const c=this.factory(r-l+1,b-t+1),cg=c.getContext('2d');cg.imageSmoothingEnabled=false;cg.drawImage(raw,l,t,c.width,c.height,0,0,c.width,c.height);
   const pixels=cg.getImageData(0,0,c.width,c.height);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>160?255:0;cg.putImageData(pixels,0,0);c.grip={x:origin-l,y:origin-t};this.icons.set(key,c);
  }
  return {sprite:centralGrip(this.icons.get(key)),theme:(item.tier||0)>=2?'rare':'iron',family};
 }
 accessory(item,dir='front'){
  if(!item)return null;const key='accessory:'+dir+':'+this.key(item);if(this.icons.has(key))return this.icons.get(key);
  if(item.kind==='main')return this.weapon(item).sprite;
  const outfit=this.art.outfits?.[item.appearance]?.front;if(outfit&&(item.kind==='armor'||item.kind==='boots')){const c=this.factory(item.kind==='armor'?96:52,item.kind==='armor'?64:40),g=c.getContext('2d');g.imageSmoothingEnabled=false;if(item.kind==='armor'){g.drawImage(outfit.leftArm.image,0,0,outfit.leftArm.image.width,outfit.leftArm.image.height-10,0,14,outfit.leftArm.image.width,outfit.leftArm.image.height-10);g.drawImage(outfit.rightArm.image,0,0,outfit.rightArm.image.width,outfit.rightArm.image.height-10,68,14,outfit.rightArm.image.width,outfit.rightArm.image.height-10);g.drawImage(outfit.torso.image,28,8);}else{g.drawImage(outfit.leftLeg.image,2,0);g.drawImage(outfit.rightLeg.image,30,0);}this.icons.set(key,c);return c;}
  const sprite=this.art.equipmentSprites?.[item.appearance+'-'+dir]||this.art.equipmentSprites?.[equipmentKey(item,dir)];if(sprite){this.icons.set(key,sprite);return sprite;}
  if(item.kind==='armor'||item.kind==='boots'){const shape=item.visual?.shape,detail=this.art.equipmentSprites?.[item.kind==='boots'?(item.visual?.profile==='wing'?'boots-wing':shape==='sandals'?'boots-cloth':'boots-leather'):(shape==='cloak'?'royal-front':shape==='leather'?'leather-front':shape==='plate'?'':'cloth-front')];if(detail){this.icons.set(key,detail);return detail;}const style=['plate','boots'].includes(shape)?'iron':'robe',parts=this.art.outfits[style].front;if(item.kind==='armor')return parts.torso.image||parts.torso;const c=this.factory(48,36),g=c.getContext('2d');g.drawImage(parts.leftLeg.image||parts.leftLeg,0,0);g.drawImage(parts.rightLeg.image||parts.rightLeg,28,0);this.icons.set(key,c);return c;}
  const size=14,c=this.factory(size,size),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.translate(size/2,size/2);g.scale(size/2.5,size/2.5);paintItemIcon(g,item,0);
  const pixels=g.getImageData(0,0,size,size);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>160?255:0;g.putImageData(pixels,0,0);this.icons.set(key,c);return c;
 }
 wearPart(source,item,name){
  if(!item||source.preservePalette)return source;const key='wear:'+name+':'+this.key(item);
  this.wearCache??=new WeakMap();let variants=this.wearCache.get(source);if(!variants)this.wearCache.set(source,variants=new Map());if(variants.has(key))return variants.get(key);
  const skirt=name==='torso'&&item.visual?.cut==='skirt',density=source.density||1,width=source.width+(skirt?2:0),height=source.height,c=this.factory(width*density,height*density),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(source.image||source,(skirt?1:0)*density,0);const p=g.getImageData(0,0,c.width,c.height),color=item.visual?.primary||((item.tier||0)>1?'#9373aa':'#84969c'),rgb=color.match(/[0-9a-f]{2}/gi)?.slice(0,3).map(x=>parseInt(x,16))||[132,150,156];
  if(!source.preservePalette)for(let i=0;i<p.data.length;i+=4){const r=p.data[i],gr=p.data[i+1],b=p.data[i+2];if(p.data[i+3]<30)continue;if(!name.includes('Leg')&&r>b*1.28&&r>gr*1.08)continue;const factor=.35+(r+gr+b)/3/255*.9;for(let k=0;k<3;k++)p.data[i+k]=Math.round(Math.min(245,rgb[k]*factor));}
  g.putImageData(p,0,0);if(skirt){g.scale(density,density);g.fillStyle=color;g.fillRect(0,height-2,width,1);g.fillStyle=item.visual?.accent||'#bdb39a';g.fillRect(1,height-1,width-2,1);}
  const result=density>1?{image:c,width,height,density,trimTop:source.trimTop??0,armorCut:item.visual?.cut||'straight'}:c;if(density===1){c.trimTop=source.trimTop??2;c.armorCut=item.visual?.cut||'straight';}variants.set(key,result);return result;
 }
 composeHead(source,item,dir){
  const key='headwear:'+dir+':'+this.key(item);this.headWearCache??=new WeakMap();let variants=this.headWearCache.get(source);if(!variants)this.headWearCache.set(source,variants=new Map());if(variants.has(key))return variants.get(key);
  const sprite=this.accessory(item,dir),shape=item.visual?.shape||'helm',pad=64,width=72,c=this.factory(width,source.height+pad),g=c.getContext('2d');c.headPad=pad;g.imageSmoothingEnabled=false;g.drawImage(source,Math.round((width-source.width)/2),pad);
  const type=equipmentKey(item,dir).split('-')[0],wear=type==='hat'?{w:38,top:-16}:type==='crown'?{w:32,top:-12}:type==='circlet'?{w:30,top:0}:type==='ribbon'?{w:22,top:0,x:10}:type==='captain'?{w:38,top:-13}:type==='turban'?{w:34,top:-4}:type==='hood'?{w:dir==='side'?42:40,top:-5,x:dir==='side'?8:0}: {w:32,top:-3};
  const fitting=this.catalog.headwearFittings?.[item.appearance];if(fitting){wear.w=dir==='side'?(fitting.sideWidth||fitting.width):fitting.width;wear.top=fitting.top??wear.top;wear.x=dir==='side'?(fitting.sideX??fitting.x??0):(fitting.x||0);}
  // Closed headwear replaces the hair silhouette. Preserve one continuous face
  // window instead of punching separate skin-colored holes through the rim.
  const closed=(type==='hood'&&item.visual?.profile!=='veil'||fitting?.closed)&&!(fitting?.faceMask&&dir==='back'),faceWindow=closed&&dir!=='back'?this.faceWindow(source):null;
  if(closed){const left=Math.round(width/2-wear.w/2+(wear.x||0)),right=left+wear.w,p=g.getImageData(0,0,width,c.height),faceLeft=Math.round((width-source.width)/2)+(faceWindow?.[0]||0);for(let y=pad;y<c.height;y++)for(let x=0;x<width;x++){const inFace=faceWindow&&x>=faceLeft&&x<faceLeft+faceWindow[2]&&y>=pad+faceWindow[1]&&y<pad+faceWindow[1]+faceWindow[3];if(!inFace&&(dir==='back'||x<left+3||x>=right-3||y>=pad+(faceWindow?.[1]??source.height)))p.data[(y*width+x)*4+3]=0;}g.putImageData(p,0,0);}
  const h=Math.min(fitting?.maxHeight??Infinity,source.height-wear.top,Math.round(wear.w*sprite.height/sprite.width)),layer=this.factory(width,c.height),lg=layer.getContext('2d');if(fitting?.brim!==undefined)wear.top=(dir==='side'?(fitting.sideBrim??fitting.brim):fitting.brim)-h;else if(type==='hat')wear.top=16-h;if(!closed&&(['hat','captain','crown'].includes(type)||fitting?.brim!==undefined&&!fitting.maxHeight&&!['antler_band','royal_antler'].includes(item.appearance))){const face=this.faceWindow(source),anchor=(face?.[1]??Math.round(source.height*.62))+1;wear.top=anchor-h;}lg.imageSmoothingEnabled=false;lg.drawImage(sprite,Math.round(width/2-wear.w/2+(wear.x||0)),pad+wear.top,wear.w,h);
  // Fit the face aperture to the actual modular head, including eyes between skin pixels.
  // Headgear is baked into each expression part; it never overlays the finished actor.
  if(dir!=='back'&&!fitting?.faceMask&&['helm','hood','turban'].includes(type)){const face=source.getContext('2d').getImageData(0,0,source.width,source.height).data,pixels=lg.getImageData(0,0,width,c.height),left=Math.round((width-source.width)/2);for(let y=Math.floor(source.height*.6);y<source.height;y++)for(let x=0;x<source.width;x++){const i=(y*source.width+x)*4,r=face[i],gr=face[i+1],b=face[i+2];if(face[i+3]<200||r<145||gr<80||r<gr*1.05||r<b*1.3)continue;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const px=x+left+dx,py=pad+y+dy;if(px>=0&&px<width&&py>=0&&py<c.height)pixels.data[(py*width+px)*4+3]=0;}}lg.putImageData(pixels,0,0);}
  if(type==='ribbon'||item.visual?.profile==='veil'){const face=source.getContext('2d').getImageData(0,0,source.width,source.height).data,p=lg.getImageData(0,0,width,c.height),left=Math.round((width-source.width)/2);for(let y=Math.floor(source.height*.6);y<source.height;y++)for(let x=0;x<source.width;x++)if(face[(y*source.width+x)*4+3]>160)p.data[((pad+y)*width+left+x)*4+3]=0;lg.putImageData(p,0,0);}
  if(closed&&dir!=='back'&&!fitting?.faceMask){const face=source.getContext('2d').getImageData(0,0,source.width,source.height).data,p=lg.getImageData(0,0,width,c.height),left=Math.round((width-source.width)/2);for(let y=Math.floor(source.height*.66);y<source.height;y++)for(let x=0;x<source.width;x++){const i=(y*source.width+x)*4,r=face[i],gr=face[i+1],b=face[i+2];if(face[i+3]>200&&r>205&&gr>135&&b>100&&r>gr*1.05&&gr<b*1.7)p.data[((pad+y)*width+left+x)*4+3]=0;}lg.putImageData(p,0,0);}
  if(closed){const pixels=g.getImageData(0,0,width,c.height),mask=lg.getImageData(0,0,width,c.height).data,faceLeft=Math.round((width-source.width)/2)+(faceWindow?.[0]||0);for(let y=pad;y<c.height;y++){let l=width,r=-1;for(let x=0;x<width;x++)if(mask[(y*width+x)*4+3]>160){l=Math.min(l,x);r=Math.max(r,x);}for(let x=0;x<width;x++){const inFace=faceWindow&&x>=faceLeft&&x<faceLeft+faceWindow[2]&&y>=pad+faceWindow[1]&&y<pad+faceWindow[1]+faceWindow[3];if(!inFace&&(x<l||x>r))pixels.data[(y*width+x)*4+3]=0;}}g.putImageData(pixels,0,0);}
  g.drawImage(layer,0,0);c.trimBottom=source.trimBottom;c.trimTop=0;variants.set(key,c);return c;
 }
 faceWindow(source){const p=source.getContext('2d').getImageData(0,0,source.width,source.height).data;let left=source.width,right=-1,top=source.height,bottom=-1;for(let y=Math.floor(source.height*.66);y<source.height;y++)for(let x=0;x<source.width;x++){const i=(y*source.width+x)*4,r=p[i],gr=p[i+1],b=p[i+2];if(p[i+3]>200&&r>205&&gr>135&&b>100&&r>gr*1.05&&gr<b*1.7){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return right<left?null:[left,Math.max(0,top-1),right-left+1,bottom-Math.max(0,top-1)+1];}
 rig(headId,eq){const rig=this.art.rig(headId);for(const d of directions){
  const shape=eq.armor?.visual?.shape,id=eq.armor?.appearance||'',style=this.art.outfits?.[id]?id:shape==='plate'?'iron':shape==='cloak'||id.includes('royal')?'royal':shape==='leather'||shape==='vest'||id.includes('leather')?'leather':'cloth',parts=this.art.outfits?.[style]?.[d]||this.art.outfits?.robe?.[d];
  for(const n of ['torso','leftArm','rightArm'])rig.sprites[d][n]=this.wearPart(eq.armor&&parts?parts[n]:rig.sprites[d][n],eq.armor,n);
  const bootId=eq.boots?.appearance||'',bootStyle=this.art.outfits?.[bootId]?bootId:eq.boots?.visual?.profile==='wing'||/wing|dawn|swan/.test(bootId)?'bootsWing':/guard|scale|crystal|rune/.test(bootId)?'iron':eq.boots?.visual?.shape==='sandals'?'robe':/moon|pilgrim|oracle/.test(bootId)?'bootsCloth':'bootsLeather';
  for(const n of ['leftLeg','rightLeg'])rig.sprites[d][n]=this.wearPart(eq.boots?this.art.outfits?.[bootStyle]?.[d]?.[n]||rig.sprites[d][n]:rig.sprites[d][n],eq.boots,n);
  if(eq.helmet){rig.expressions[d]=Object.fromEntries(Object.entries(rig.expressions[d]).map(([state,head])=>[state,this.composeHead(head,eq.helmet,d)]));rig.sprites[d].head=rig.expressions[d].neutral;}
  if(eq.armor?.visual?.shape==='cloak'){rig.accessories??={};rig.accessories[d]={cloak:{...this.wearPart(parts.cloak||this.art.outfits.robe[d].cloak,eq.armor,'cloak'),anchorX:parts.cloak?.width>=16?0:3}};}
 }return rig;}

 head(e){const id=e.id.replace(/-trail$/,'');if(e.headId&&this.art.heads[e.headId])return e.headId;if(id==='portrait-preview')return this.heads.get(e.originalId)||'p1';if(!this.heads.has(id))this.heads.set(id,id==='local'?'p1':'p'+(2+[...this.heads.keys()].filter(k=>k!=='local').length%7));return this.heads.get(id);}
 drawPreview(ctx,e,time,width,height){
    if(!this.ready)return;this.previewCanvas??=this.factory(256,256);const g=this.previewCanvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,256,256);g.save();g.translate(128,180);g.scale(16,16);
  this.draw(g,{...e,id:e.id+'-equipment-preview',x:0,y:0,facing:Math.PI/2,pose:null,attackPose:0,hitPose:0,skillPose:null,cast:null,whirl:null,dashing:false},time,false,0);g.restore();
    const data=g.getImageData(0,0,256,256).data;let left=256,top=256,right=0,bottom=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(left>right)return;const w=right-left+1,h=bottom-top+1,scale=Math.min(1.6,(width-16)/w,(height-20)/h),dw=w*scale,dh=h*scale;ctx.imageSmoothingEnabled=false;ctx.drawImage(this.previewCanvas,left,top,w,h,Math.round((width-dw)/2),Math.round((height-dh)/2),dw,dh);
 }
 draw(ctx,e,time,moving,index,visualTime=time){
  time=e.poseTime??time;
  if(!this.ready||e.kind!=='player')return false;if(e.pose==='victory')time=performance.now()/1000;const id=e.id.replace(/-trail$/,''),head=this.head(e),equipment=e.equipment||{},slot=e.cast?.slot||e.skillPose?.slot||e.whirl?.slot||'main',eq={...equipment,main:equipment[slot]||equipment.main},signature=head+'|'+slot+'|'+['armor','boots','main','off','helmet'].map(k=>this.key(eq[k])).join('|');
  let actor=this.actors.get(id);if(!actor||actor.signature!==signature){const rig=this.rig(head,eq),weapon=this.weapon(eq.main);actor={signature,rig,weapon,canvas:this.factory(512,512),motion:P1WeaponMotion.create(rig,{},this.factory)};this.actors.set(id,actor);}
  const x=Math.cos(e.facing||0),y=Math.sin(e.facing||0),dir=Math.abs(x)>Math.abs(y)?x>0?'right':'side':y>0?'front':'back';
  const skill=e.skillPose?.ends>time?e.skillPose:null;
  const mode=e.pose==='victory'?'victory':e.hitPose?'hurt':e.whirl?'whirlwind':skill?skill.mode:e.cast?skillMotion(e.cast.kind,actor.weapon.family):e.bowCharge>0?'shoot':e.attackPose?'combo':e.dashing?'run':moving?'walk':'idle';
  const def=P1WeaponMotion.weapons.find(w=>w[0]===actor.weapon.family)||P1WeaponMotion.weapons[0],start=e.cast?(e.cast.started??e.cast.ends-.12):0;
  const duration=mode==='combo'?def[4]:mode==='whirlwind'?2:mode==='dash'?.64:1.05;
  const animationTime=e.whirl?Math.max(0,time-(e.whirl.ends-2)):skill?(.30+.70*Math.min(1,(time-skill.started)/Math.max(.01,skill.ends-skill.started)))*duration:e.cast?Math.min(.28,Math.max(0,time-start)/Math.max(.12,e.cast.ends-start)*.28)*duration:e.bowCharge>0?.25*duration:e.attackPose?Math.max(0,1-e.attackPose/(e.attackDuration||.25))*duration:visualTime;
  const pose=actor.motion.render(actor.canvas,dir,actor.weapon.family,animationTime,{mode,bowCharge:e.bowCharge||0,single:!!skill||!!e.cast||!!e.bowCharge||!!e.attackPose&&!e.whirl,combo:e.combo||1,weapon:actor.weapon.sprite,grip:actor.weapon.sprite.grip,helmet:null,blocking:!!e.blocking,shield:eq.off?.type==='shield'?this.accessory(eq.off,dir==='right'?'side':dir):null,shieldHeight:eq.off?.visual?.shape==='buckler'?8:eq.off?.appearance==='pot_lid'?9:12,theme:actor.weapon.theme,effects:false});
  const matrix=ctx.getTransform?.();
  const sx=Math.max(1,Math.abs(matrix?.a||1)),sy=Math.max(1,Math.abs(matrix?.d||1));
  const snap=(v,scale)=>Math.round(v*scale)/scale;
  const drawW=8.4,drawH=8.4,anchorY=.6425;
  const point=p=>({x:e.x-drawW/2+(pose.flip?128-p.x:p.x)/128*drawW,y:e.y-drawH*anchorY+p.y/128*drawH});
  const trailKey=mode+'|'+(e.combo||1)+'|'+(skill?.started||0)+(mode==='whirlwind'?'|'+pose.dir+'|'+pose.flip:'');if(actor.trailKey!==trailKey){actor.trail=[];actor.trailKey=trailKey;}
  actor.trail=(actor.trail||[]).filter(p=>visualTime-p.at<.14);
  const melee=!['bow','staff'].includes(actor.weapon.family),swing=melee&&pose.active&&(mode==='whirlwind'||['combo','slam','dash','jump'].includes(mode)&&pose.progress>.28&&pose.progress<.66);
  if(swing&&(!actor.trail.length||visualTime-actor.trail.at(-1).at>.005)){
   const tip=point(pose.tip),hand=point(pose.hand);actor.trail.push({at:visualTime,tip,inner:{x:hand.x+(tip.x-hand.x)*.20,y:hand.y+(tip.y-hand.y)*.20}});if(actor.trail.length>14)actor.trail.shift();
  }
  const material=eq.main?itemFeedback(eq.main).material:'blade',ink=material==='candy'?'#ffb4da':material==='bread'?'#ffe0a0':material==='wood'?'#d6ead0':actor.weapon.theme==='rare'?'#d0baff':'#a8e4ff';
  for(let i=1;i<actor.trail.length;i++){const a=actor.trail[i-1],b=actor.trail[i];ctx.save();ctx.globalAlpha*=.68*Math.max(0,1-(visualTime-b.at)/.14);ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(a.tip.x,a.tip.y);ctx.lineTo(b.tip.x,b.tip.y);ctx.lineTo(b.inner.x,b.inner.y);ctx.lineTo(a.inner.x,a.inner.y);ctx.closePath();ctx.fill();ctx.strokeStyle='#fff7d8';ctx.lineWidth=.04;ctx.beginPath();ctx.moveTo(a.tip.x,a.tip.y);ctx.lineTo(b.tip.x,b.tip.y);ctx.stroke();ctx.restore();}
  const lamp=equipment.off?.type==='lantern'?equipment.off:null,lp=lamp?lanternPose(e,visualTime):null;
  const trait=equipmentTrait(equipment.armor);if(trait?.kind==='echoarmor'&&equipment.main&&(e.echoLaunchUntil||0)<time)this.drawOrbitWeapons(ctx,e,equipment.main,visualTime);
  if(lamp&&lp.dy<0)this.drawLantern(ctx,lamp,lp,visualTime);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(actor.canvas,snap(e.x-drawW/2,sx),snap(e.y-drawH*anchorY,sy),drawW,drawH);
  if(lamp&&lp.dy>=0)this.drawLantern(ctx,lamp,lp,visualTime);
  if(slot==='main'&&eq.off&&!['shield','lantern'].includes(eq.off.type)){const icon=this.accessory(eq.off),sway=Math.sin(visualTime*(moving?11:2.5)-.5)*.05;ctx.save();ctx.translate(e.x+(dir==='side'?0:-.9),e.y-1.25+sway);ctx.rotate(sway);ctx.drawImage(icon,-.4,-.4,.8,.8);ctx.restore();}return true;
 }
 drawOrbitWeapons(ctx,e,item,time){for(let i=0;i<3;i++){const a=time*1.7+i*Math.PI*2/3,p={x:e.x+Math.cos(a)*1.55,y:e.y-1.6+Math.sin(a)*.65};this.drawEcho(ctx,{x:p.x,y:p.y,angle:a+Math.PI/2,echoItem:item},time,.65);}}
  drawEcho(ctx,p,time,alpha=1){const sprite=this.weapon(p.echoItem).sprite,h=Math.min(2.5,Math.max(1.2,(sprite.motionLength||22)/22*1.74)),w=sprite.width/sprite.height*h,hover=p.launchAt?1.6*Math.max(0,Math.min(1,(p.launchAt+.2-time)/.2)):0;ctx.save();ctx.globalAlpha*=alpha;ctx.translate(p.x,p.y-.4-hover);ctx.rotate(p.angle+Math.PI/2);ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite,-w/2,-h/2,w,h);ctx.restore();return true;}
 drawLantern(ctx,item,p,time){
  const color=lanternColor(item),key='glow:'+color;
  if(!this.icons.has(key)){const c=this.factory(80,80),g=c.getContext('2d'),glow=g.createRadialGradient(40,40,2,40,40,40);glow.addColorStop(0,color+'aa');glow.addColorStop(.3,color+'45');glow.addColorStop(1,color+'00');g.fillStyle=glow;g.fillRect(0,0,80,80);this.icons.set(key,c);}
  ctx.save();ctx.globalAlpha*=.7+.08*Math.sin(time*3);ctx.drawImage(this.icons.get(key),p.x-1.5,p.y-1.5,3,3);ctx.restore();
  ctx.save();ctx.fillStyle='#171c2a33';ctx.beginPath();ctx.ellipse(p.x,p.groundY,.22,.08,0,0,Math.PI*2);ctx.fill();ctx.translate(p.x,p.y);ctx.rotate(p.tilt);ctx.imageSmoothingEnabled=false;const icon=this.accessory(item),h=1.2,w=h*icon.width/icon.height;ctx.drawImage(icon,-w/2,-h/2,w,h);ctx.restore();
 }
 itemSprite(item){if(!this.ready)return null;return item.kind==='main'?this.weapon(item).sprite:this.accessory(item);}

 drawDrop(ctx,item){const c=this.itemSprite(item);if(!c)return false;const baseLength=c.motionLength||(item.kind==='main'?(['greatsword','hammer'].includes(this.family(item))?27:21):item.kind==='armor'?16:14),boost={main:1.26,armor:1.24,helmet:1.2,boots:1.22,off:1.18}[item.kind]||1.16,scale=baseLength/c.height/16*boost*1.0,offsetY={main:-.12,armor:-.18,helmet:-.22,boots:.12,off:-.08}[item.kind]||0;ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(0,offsetY);if(item.kind==='main')ctx.rotate(-.45);ctx.drawImage(c,-c.width*scale/2,-c.height*scale/2,c.width*scale,c.height*scale);ctx.restore();return true;}
}
