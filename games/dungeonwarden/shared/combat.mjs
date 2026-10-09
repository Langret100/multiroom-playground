import {ATTACK_RANGE_SCALE} from '../combat-tuning.mjs';
import {weaponSkill} from './weapon-skills.mjs';
import {WEAPONS,clamp,distance} from './catalog.mjs';
// Shared attack geometry: previews and delayed attack damage use the same shapes.
export function attackContains(shape,p,pad=0){
  const dx=p.x-shape.x,dy=p.y-shape.y,a=shape.angle||0,along=dx*Math.cos(a)+dy*Math.sin(a),across=-dx*Math.sin(a)+dy*Math.cos(a);
  if(shape.shape==='cone')return Math.hypot(dx,dy)<=shape.radius+pad&&Math.cos(Math.atan2(dy,dx)-a)>=Math.cos(shape.arc||.8);
  if(shape.shape==='line'||shape.shape==='rect')return along>=-pad&&along<=(shape.length||shape.radius)+pad&&Math.abs(across)<=(shape.width||.6)/2+pad;
  return Math.hypot(dx,dy)<=shape.radius+pad;
}
function baseWeaponPreview(e,aim,special=false,room=null){
  const it=special&&WEAPONS[e.equipment?.off?.type]?e.equipment.off:e.equipment?.main,w=WEAPONS[it?.type];
  const angle=Math.atan2(aim.y-e.y,aim.x-e.x),direction={x:Math.cos(angle),y:Math.sin(angle)};
  const base={x:e.x,y:e.y,angle,color:'#95d7dc',label:'기본 공격'};
  if(!special){const range=it?.type==='bow'?Math.min(27,Math.max(7.5,25*(e.bowCharge||0)/2)+2):(w?.range||.7)*(['meteor','poison','acid','heal','healbolt','thunder','lightning','fireball','vines'].includes(it?.type)?2:1);
    return {...base,shape:range>=5?'line':'cone',length:range,radius:range>=5?range:range+.4,width:.6,arc:Math.acos(.1),label:`기본 ${range.toFixed(range%1?1:0)}걸음`};}
  if(!w)return null;const kind=weaponSkill(it)?.kind,range=Math.min(25,distance(e,aim)),p={x:e.x+direction.x*range,y:e.y+direction.y*range};
  const circle=(radius,at=p)=>({...base,...at,shape:'circle',radius,color:kind.includes('heal')?'#8be5b3':'#d0a4f0',label:w.name+' 특수'});
  if(e.equipment.off?.type==='shield')return null;
  if(['breadline','earthline','bladewave','clockwave'].includes(kind))return {...base,shape:'line',length:kind==='breadline'?5:kind==='earthline'||kind==='clockwave'?7:9,width:kind==='breadline'?1.4:kind==='earthline'?2:1.2,label:weaponSkill(it).name};
  if(['crescent','starfan','thornfan','phoenixfan','firefan','forklightning'].includes(kind)){const lengths={crescent:8,starfan:7,thornfan:12,phoenixfan:15,firefan:10,forklightning:14};return {...base,shape:'cone',radius:lengths[kind],arc:kind==='starfan'?.36:kind==='phoenixfan'?.3:kind==='firefan'?.22:.2,label:weaponSkill(it).name};}
  if(kind==='candyburst')return {...base,shape:'line',length:4.9,width:2.8,label:weaponSkill(it).name};
  if(['pulse','panclang','resonance','moonheal','shelter'].includes(kind))return circle(kind==='pulse'?2:kind==='moonheal'||kind==='shelter'?5:kind==='resonance'?3.2:3,e);
  if(['cometfall','inkcloud','stormchain'].includes(kind))return circle(kind==='cometfall'?4.3:kind==='inkcloud'?4.5:4);
  if(kind==='throw')return {...base,shape:'line',length:8,width:.6,label:'투척 8걸음'};
  if(kind==='backstep')return {...base,angle:angle+Math.PI,shape:'line',length:2,width:1,label:'백스텝 2걸음'};
  if(kind==='slam')return circle(w.range*.60,{x:e.x+direction.x*w.range*.60,y:e.y+direction.y*w.range*.60});
  if(['double','push','bleed'].includes(kind))return circle(1.5,{x:e.x+direction.x*.7,y:e.y+direction.y*.7});
  if(kind==='spin')return circle(w.range,e);
  if(kind==='meteor'||kind==='acid')return circle(5);
  if(kind==='poison'||kind==='heal')return circle(4);
  if(kind==='thunder')return circle(2);
  if(kind==='vines')return circle(7,{x:e.x+direction.x*2,y:e.y+direction.y*2});
  if(kind==='lightning')return {...base,shape:'line',length:room?Math.hypot(room.w,room.h):20,width:1.6,label:'번개 관통 · 폭 1.6걸음'};
  if(kind==='healbolt')return {...base,shape:'line',length:50,width:.6,color:'#8be5b3',label:'치유 탄환 50걸음'};
  if(kind==='fireball')return {...base,shape:'line',length:90,width:.6,impactRadius:3,color:'#ffb277',label:'화염구 · 벽 충돌 / 폭발 3걸음'};
  return circle(2);
}


export function weaponPreview(e,aim,special=false,room=null){
 const shape=baseWeaponPreview(e,aim,special,room);if(!shape)return shape;
 const item=special&&WEAPONS[e.equipment?.off?.type]?e.equipment.off:e.equipment?.main,kind=special?weaponSkill(item)?.kind:null;
 if(['backstep','moonheal','shelter','heal','healbolt'].includes(kind))return shape;
 if(shape.radius)shape.radius*=ATTACK_RANGE_SCALE;if(shape.impactRadius)shape.impactRadius*=ATTACK_RANGE_SCALE;
 if(shape.width)shape.width*=ATTACK_RANGE_SCALE;if((!special&&shape.shape==='line')||kind==='throw')shape.width=.6*2*ATTACK_RANGE_SCALE;
 if(['cometfall','inkcloud','stormchain'].includes(kind))shape.radius=2+(shape.radius/ATTACK_RANGE_SCALE-2)*ATTACK_RANGE_SCALE;
 if(shape.length&&!['breadline','earthline','candyburst','lightning'].includes(kind))shape.length*=ATTACK_RANGE_SCALE;
 return shape;
}
