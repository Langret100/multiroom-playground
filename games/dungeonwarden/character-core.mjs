import {P1ModularAssets} from './character-assets.mjs';
const P1BasicRig=(()=>{
  const directions=['front','side','back'];
  function create(image,atlas,canvasFactory){
    const sprites={};
    for(const dir of directions){sprites[dir]={};for(const [name,r] of Object.entries(atlas[dir])){
      const w=Math.max(1,Math.round(r[2]/atlas.density)),h=Math.max(1,Math.round(r[3]/atlas.density));
      const c=canvasFactory(w,h),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(image,...r,0,0,w,h);sprites[dir][name]=c;
    }}
    function render(c,dir,mode,t){
      const g=c.getContext('2d'),s=c.width/48,p=sprites[dir],moving=mode!=='idle',phase=t*(mode==='run'?15:9),step=moving?Math.sin(phase):0;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.imageSmoothingEnabled=false;
      const feetBottom=43,footY=feetBottom-Math.max(p.leftLeg.height,p.rightLeg.height),bodyY=40-p.torso.height;
      const bob=moving?-.35*Math.abs(step):.18*Math.sin(t*2.5),headY=bodyY+4-p.head.height+bob;
      function part(name,x,y){const a=p[name],top=a.trimTop??(name==='torso'?2:0),bottom=name==='head'?(a.trimBottom??(dir==='side'?2:1)):0,h=a.height-top-bottom;g.drawImage(a,0,top,a.width,h,Math.round((24+x-a.width/2)*s),Math.round((y+top)*s),a.width*s,h*s);}
      // Draw far limbs first. Sleeves connect at the outer torso, and hands end near its hem.
      const ax=Math.max(2.5,p.torso.width/2-.4),armBase=bodyY+p.torso.height-Math.max(p.leftArm.height,p.rightArm.height)-.5;
      const lift=mode==='run'?1.6:1.1;
      part('leftLeg',dir==='side'?-.6+step*.45:-2,footY-Math.max(0,step)*lift);
      part('rightLeg',dir==='side'?.6-step*.45:2,footY-Math.max(0,-step)*lift);
      const armY=armBase+bob;
      part('leftArm',-ax,armY+(moving?step*.35:0));
      if(dir!=='side')part('rightArm',ax,armY-(moving?step*.35:0));
      part('torso',0,bodyY+bob);
      if(dir==='side')part('rightArm',ax-1,armY-step*.35);
      part('head',0,headY);
    }
    return {render,sprites};
  }
  return {create};
})();

/* All animation coordinates are logical pixels. Art is sampled once by the rig. */
const P1WeaponMotion=(()=>{
 const weapons=[['sword','한손검','weapon_regular_sword',3,.48],['dagger','단검','weapon_knife',3,.32],['axe','도끼','weapon_axe',3,.62],['mace','메이스','weapon_mace',3,.56],['greatsword','양손검','weapon_anime_sword',2,.84],['hammer','양손망치','weapon_big_hammer',2,.92],['bow','활','weapon_bow',1,.76],['staff','스태프','weapon_green_magic_staff',1,.82]];
 const modes=[['combo','기본 연속 공격'],['jump','점프 공격'],['dash','돌진 공격'],['slam','내려찍기'],['whirlwind','휠윈드'],['idle','대기'],['walk','걷기'],['run','달리기'],['hurt','피격'],['victory','승리']];
 const clamp=x=>Math.max(0,Math.min(1,x)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
 function create(rig,images,factory){
  const native=factory(96,96),wg=factory(96,96),outg=native.getContext('2d');
  function render(out,direction,type,time,options={}){
   const def=weapons.find(w=>w[0]===type)||weapons[0],mode=options.mode||'combo',heavy=['greatsword','hammer'].includes(type),ranged=['bow','staff'].includes(type),passive=['idle','walk','run','hurt','victory'].includes(mode);
   const count=mode==='combo'?def[3]:1,duration=mode==='combo'?def[4]:mode==='whirlwind'?2:mode==='dash'?.64:1.05;
   const cycle=duration*count+.65,clock=options.single?Math.max(0,time):((time%cycle)+cycle)%cycle,active=!passive&&clock<duration*count,index=options.combo!==undefined?Math.max(0,Math.min(def[3]-1,options.combo-1)):Math.min(count-1,Math.floor(clock/duration)),u=active?clock/duration-Math.floor(clock/duration):1;
   const wind=smooth(u/.32),strike=smooth((u-.32)/.16),recover=smooth((u-.53)/.47),pulse=active?Math.sin(Math.PI*clamp((u-.25)/.45)):0;
   let dir=direction==='right'||direction==='left'?'side':direction==='up'?'back':direction==='down'?'front':direction;
   let flip=direction==='right';if(mode==='whirlwind'&&active){const n=Math.floor(u*16)%4;dir=['side','back','side','front'][n];flip=n===2;}
   const v=dir==='side'?{x:-1,y:0}:dir==='front'?{x:0,y:1}:{x:0,y:-1},cross={x:-v.y,y:v.x};
   const moving=mode==='walk'||mode==='run',step=moving?Math.sin(time*(mode==='run'?15:9)):0;
   const lunge=active?(mode==='dash'?9*pulse:heavy?2*pulse:1.3*pulse):mode==='hurt'?-2*Math.sin(time*9):0;
   // Reference: lift from 140ms, settle toward 490ms, impact near 560ms.
   const overhead=mode==='jump'||mode==='slam'||(heavy&&index===1);
   const jump=active&&overhead?-9*Math.sin(Math.PI*clamp((u-.06)/.55)):0;
   const cx=48+v.x*lunge,feet=66+v.y*lunge,p={...rig.sprites[dir]},bodyY=feet-3-p.torso.height+jump+(moving?-.35*Math.abs(step):.18*Math.sin(time*2.5))+pulse*.6;
   const expression=mode==='hurt'?'hurt':active?'attack':'neutral';if(rig.expressions?.[dir]?.[expression])p.head=rig.expressions[dir][expression];
   const headY=bodyY+4-p.head.height,shoulderY=bodyY+p.torso.height-p.leftArm.height+.5,headX=cx,g=outg,wgctx=wg.getContext('2d');
   for(const ctx of [g,wgctx]){ctx.resetTransform();ctx.clearRect(0,0,96,96);ctx.imageSmoothingEnabled=false;}
   const main=dir==='side'?'leftArm':'rightArm',other=main==='leftArm'?'rightArm':'leftArm',sx=dir==='side'?-2:3;
   const resting={x:cx+sx+(main==='leftArm'?-3:3),y:shoulderY+6};
   const extension=active?(type==='dagger'?6*strike*(1-recover):4*strike*(1-recover)):0;
   let hand={x:resting.x+v.x*extension,y:resting.y+v.y*extension};
   if(active&&overhead){hand.x+=cross.x*3*wind*(1-recover);hand.y-=6*wind*(1-strike);}
   else if(active&&!ranged&&type!=='dagger'){hand.x+=cross.x*3*(strike-.5)*wind*(1-recover);hand.y+=cross.y*3*(strike-.5)*wind*(1-recover);}
   if(moving)hand.y+=step*.45;
   if(mode==='victory'){hand.y-=6*(.7+.3*Math.sin(time*5));hand.x+=3;}
   const base=dir==='side'?-Math.PI/2:dir==='front'?Math.PI:0;
   let angle=base;
   if(active&&!ranged&&type!=='dagger'){
    const start=dir==='side'?-.12:base-.9,end=dir==='side'?-2.8:base+.9;
    const opposite=index%2&&!overhead;
    angle=lerp(base,lerp(opposite?end:start,opposite?start:end,strike),wind)*(1-recover)+base*recover;
   }
   if(mode==='victory')angle=dir==='side'?-.3:-.2;
   const item=options.weapon||images[type],length=item.motionLength||(type==='dagger'?12:heavy?27:type==='bow'?16:21);
   const scale=length/item.height,w=Math.max(3,Math.round(item.width*scale)),h=length,grip=options.grip||{x:item.width/2,y:type==='bow'?item.height/2:item.height-3};
   const gripX=grip.x*scale,gripY=grip.y*scale;
   if(type==='bow')angle=dir==='side'?0:dir==='front'?-Math.PI/2:Math.PI/2;
   wgctx.save();wgctx.translate(Math.round(hand.x),Math.round(hand.y));wgctx.rotate(angle);wgctx.drawImage(item,-gripX,-gripY,w,h);wgctx.restore();
   const tip={x:hand.x+Math.sin(angle)*gripY,y:hand.y-Math.cos(angle)*gripY};
   // Windup may pass behind the head. The outward strike moves to the near plane.
   const rear=dir==='back'||(active&&u<.32)||mode==='victory';
   function part(name,x,y){const a=p[name],top=a.trimTop??(name==='torso'?2:0),bottom=name==='head'?(a.trimBottom??(dir==='side'?2:1)):0;g.drawImage(a,0,top,a.width,a.height-top-bottom,Math.round(x-a.width/2),Math.round(y+top),a.width,a.height-top-bottom);}
   function arm(name,shoulderX,target){const a=p[name],px=name==='leftArm'?a.width-2:1,py=1,dx=name==='leftArm'?3-a.width:a.width-3,dy=a.height-3,angle=Math.atan2(target.y-shoulderY,target.x-shoulderX)-Math.atan2(dy,dx);g.save();g.translate(Math.round(shoulderX),Math.round(shoulderY));g.rotate(angle);g.drawImage(a,-px,-py);g.restore();return {x:shoulderX+dx*Math.cos(angle)-dy*Math.sin(angle),y:shoulderY+dx*Math.sin(angle)+dy*Math.cos(angle)};}
   // The hand/weapon use the same actual rigid-arm endpoint (no floating equipment).
   const shoulderX=cx+sx,armPart=p[main],armDX=main==='leftArm'?3-armPart.width:armPart.width-3,armDY=armPart.height-3,armRotation=Math.atan2(hand.y-shoulderY,hand.x-shoulderX)-Math.atan2(armDY,armDX);
   const actual={x:shoulderX+armDX*Math.cos(armRotation)-armDY*Math.sin(armRotation),y:shoulderY+armDX*Math.sin(armRotation)+armDY*Math.cos(armRotation)};
   wgctx.resetTransform();wgctx.clearRect(0,0,96,96);wgctx.save();wgctx.translate(Math.round(actual.x),Math.round(actual.y));wgctx.rotate(angle);wgctx.drawImage(item,-gripX,-gripY,w,h);wgctx.restore();
   tip.x+=actual.x-hand.x;tip.y+=actual.y-hand.y;hand=actual;
   g.fillStyle='#111b2840';g.fillRect(Math.round(cx)-5,Math.round(feet)+1,10,2);
   const attachment=rig.accessories?.[dir];if(attachment?.cloak){g.save();g.translate(Math.round(cx+3),Math.round(bodyY+3));g.rotate(Math.sin(time*8-.5)*.12+pulse*.18);g.drawImage(attachment.cloak,-4,0);g.restore();}
   if(['idle','walk','run'].includes(mode)){
    // Keep the restored walking rig intact: no stretched joints or rotating toes.
    const ax=Math.max(2.5,p.torso.width/2-.4),ay=bodyY+p.torso.height-Math.max(p.leftArm.height,p.rightArm.height)-.5,lift=mode==='run'?1.6:1.1;
    const lh=feet-Math.max(p.leftLeg.height,p.rightLeg.height);
    const idleHand={x:cx+(dir==='side'?-ax:ax)+(dir==='side'?-1:1),y:ay+p[main].height-2+(moving?step*.35:0)};
    hand=idleHand;wgctx.resetTransform();wgctx.clearRect(0,0,96,96);wgctx.save();wgctx.translate(Math.round(hand.x),Math.round(hand.y));wgctx.rotate(angle);wgctx.drawImage(item,-gripX,-gripY,w,h);wgctx.restore();
    if(rear)g.drawImage(wg,0,0);
    part('leftLeg',cx+(dir==='side'?-.6+step*.45:-2),lh-Math.max(0,step)*lift);
    part('rightLeg',cx+(dir==='side'?.6-step*.45:2),lh-Math.max(0,-step)*lift);
    part('leftArm',cx-ax,ay+(moving?step*.35:0));
    if(dir!=='side')part('rightArm',cx+ax,ay-(moving?step*.35:0));
    part('torso',cx,bodyY);if(dir==='side')part('rightArm',cx+ax-1,ay-step*.35);
    if(!rear)g.drawImage(wg,0,0);part('head',headX,headY);
   }else{
   if(rear){g.drawImage(wg,0,0);arm(main,shoulderX,hand);}
   part('leftLeg',cx+(dir==='side'?-.5:-2),feet-p.leftLeg.height+jump-Math.max(0,step)*1.1);
   part('rightLeg',cx+(dir==='side'?.5:2),feet-p.rightLeg.height+jump-Math.max(0,-step)*1.1);
   const support={x:cx+(dir==='side'?2:-6),y:shoulderY+6-step*.4};
   if(heavy||type==='bow'){support.x=hand.x-Math.sin(angle)*2;support.y=hand.y+Math.cos(angle)*2;}
   arm(other,cx+(dir==='side'?2:-3),support);
   part('torso',cx,bodyY);part('head',headX,headY);
   if(options.helmet)g.drawImage(options.helmet,Math.round(headX-options.helmet.width/2),Math.round(headY+p.head.height*.52-options.helmet.height));
   if(!rear){arm(main,shoulderX,hand);g.drawImage(wg,0,0);if(heavy||type==='bow')arm(other,cx+(dir==='side'?2:-3),support);}
   }
   if(['idle','walk','run'].includes(mode)&&options.helmet)g.drawImage(options.helmet,Math.round(headX-options.helmet.width/2),Math.round(headY+p.head.height*.52-options.helmet.height));
   if(options.shield&&!heavy&&!ranged)g.drawImage(options.shield,Math.round(cx+3),Math.round(bodyY+4));
   if(attachment?.clasp){g.save();g.translate(Math.round(cx+4),Math.round(bodyY+7));g.rotate(Math.sin(time*10-1)*.18);g.drawImage(attachment.clasp,-1,0);g.restore();}
   const hit=active&&u>=.35&&u<.68;
   function arc(x,y,r,a,b,color){g.fillStyle=color;for(let i=0;i<28;i++){const q=lerp(a,b,i/27);g.fillRect(Math.round(x+Math.cos(q)*r),Math.round(y+Math.sin(q)*r),1,1);}}
   if(options.effects!==false&&hit){const ex=hand.x+v.x*length*.75,ey=hand.y+v.y*length*.75;
    if(mode==='whirlwind'){arc(cx,feet-2,23,time*16,time*16+4.8,'#f2dfaa');arc(cx,feet-2,20,time*16+.4,time*16+4,'#95bac4');}
    else if(ranged){g.fillStyle=type==='bow'?'#d2ae6c':'#8ce4cd';const travel=12+clamp((u-.35)/.3)*23;g.fillRect(Math.round(hand.x+v.x*travel)-1,Math.round(hand.y+v.y*travel)-1,type==='bow'?2:4,type==='bow'?2:4);}
    else if(type==='hammer'||type==='mace'||overhead){arc(ex,ey,4+8*strike,0,Math.PI*2,options.theme==='rare'?'#edb0cc':'#d4b680');}
    else if(type==='dagger'){g.fillStyle='#dcebdc';for(let i=3;i<13;i++)g.fillRect(Math.round(hand.x+v.x*i),Math.round(hand.y+v.y*i),1,1);}
    else {const bearing=Math.atan2(v.y,v.x);arc(hand.x,hand.y,length*.88,bearing-.65,bearing+.65,options.theme==='rare'?'#e4be76':'#dcebdc');arc(hand.x,hand.y,length*.78,bearing-.55,bearing+.55,'#8fbbc4');}
   }
   const og=out.getContext('2d');og.resetTransform();og.clearRect(0,0,out.width,out.height);og.imageSmoothingEnabled=false;if(flip){og.translate(out.width,0);og.scale(-1,1);}og.drawImage(native,0,0,out.width,out.height);
   return {combo:index+1,phase:passive?mode:!active?'대기':u<.32?'준비':u<.53?'타격':'복귀',dir,hand,tip,angle,rear,active,progress:u};
  }
  return {render};
 }
 return {create,weapons,modes};
})();

export {P1BasicRig,P1WeaponMotion,P1ModularAssets};
