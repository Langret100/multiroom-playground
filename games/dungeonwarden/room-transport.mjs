import {applyStateDelta} from './shared/state-codec.mjs?v=20261008-skills2';
import {move,lineOfSight} from './shared/world.mjs';
import {WEAPONS} from './shared/catalog.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cloneEntity=e=>e?{...e,equipment:e.equipment?{...e.equipment}:e.equipment,base:e.base?{...e.base}:e.base}:null;

export class RoomTransport {
 constructor(id,gameId){
  this.id=id;this.gameId=gameId;this.latest=null;this.network=true;
  this.clock=0;this.sent=-1;this.pending={};this.raw=null;this.frames=[];this.edge={attack:false,special:false};this.prevInput={};
  this.interpDelay=.10;this.arrivalGap=.05;this.jitter=.006;this.lastReceiveAt=0;
  this.serverMe=null;this.visualMe=null;this.visualAt=0;
 }
 post(type,data={}){parent.postMessage({type,gameId:this.gameId,...data},location.origin);}
 normalize(v){return typeof v==='string'?(v===this.id?'local':v):Array.isArray(v)?v.map(x=>this.normalize(x)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,this.normalize(x)])):v;}
 receive(packet){
  if(packet.type==='snapshot')this.raw=packet.state;else this.raw=applyStateDelta(this.raw,packet);if(!this.raw)return;
  const next=this.normalize(this.raw);this.latest=next;
  const now=performance.now()/1000;
  if(this.lastReceiveAt){
   const gap=clamp(now-this.lastReceiveAt,.02,.4),delta=Math.abs(gap-this.arrivalGap);
   this.arrivalGap=this.arrivalGap*.88+gap*.12;this.jitter=this.jitter*.9+delta*.1;
   this.interpDelay=clamp(this.arrivalGap+this.jitter*2.5+.018,.07,.14);
  }
  this.lastReceiveAt=now;this.frames.push({at:now,state:next});if(this.frames.length>16)this.frames.shift();
  this.reconcileLocal(next.me||next.entities?.find(e=>e.id==='local'));
 }
 localSpeed(e){
  if(Number.isFinite(e.stats?.speed))return e.stats.speed;
  let agility=e.base?.agility??100;
  for(const item of Object.values(e.equipment||{}))if(item?.stats?.agility)agility+=item.stats.agility;
  let speed=6*agility/100*(e.slow>0?.5:1);
  const main=e.equipment?.main,off=e.equipment?.off;
  if(main&&WEAPONS[main.type]?.hands===1&&!off)speed*=1.07;
  return speed;
 }
 orientLocal(e){
  const i=this.pending||{},dx=Number(i.mx)||0,dy=Number(i.my)||0,len=Math.hypot(dx,dy);
  const ranged=e.equipment?.main?.type==='bow'||(WEAPONS[e.equipment?.main?.type]?.range||0)>=5;
  const aimX=Number(i.aimX),aimY=Number(i.aimY),hasAim=Number.isFinite(aimX)&&Number.isFinite(aimY)&&Math.hypot(aimX-e.x,aimY-e.y)>.1;
  if((ranged||i.block||i.attack||i.special)&&hasAim)e.facing=Math.atan2(aimY-e.y,aimX-e.x);
  else if(len>.001)e.facing=Math.atan2(dy,dx);
 }
 advanceLocal(e,dt){
  const s=this.latest,i=this.pending||{};if(!e||!s?.map||e.dead||dt<=0)return;
  const dx=Number(i.mx)||0,dy=Number(i.my)||0,len=Math.hypot(dx,dy);
  this.orientLocal(e);
  if(!len||e.stun>0||e.root>0||e.cast)return;
  let speed=this.localSpeed(e);
  const sprint=!!i.sprint&&e.dashRecovery<=0&&e.dash>0;if(sprint)speed*=1.6;
  if(i.block&&e.equipment?.off?.type==='shield')speed*=.35;
  const map={...s.map,bodies:(s.entities||[]).filter(x=>x.id!=='local')};
  move(map,e,dx/Math.max(1,len)*speed*dt,dy/Math.max(1,len)*speed*dt,false);
 }
 reconcileLocal(server){
  if(!server)return;this.serverMe=cloneEntity(server);
  if(!this.visualMe||this.visualMe.room!==server.room||this.visualMe.dead!==server.dead){this.visualMe=cloneEntity(server);this.visualAt=performance.now()/1000;}
 }
 sendInput(input){
  input=input||{};
  // Pointer/touch taps can be shorter than the 50-67 ms network cadence. Preserve the
  // rising edge until a packet is actually sent so an 8-player render hitch cannot eat
  // an attack or special input. Continuous state (movement/block/sprint/aim) still uses
  // the newest sample only.
  if(input.attack&&!this.prevInput.attack)this.edge.attack=true;
  if(input.special&&!this.prevInput.special)this.edge.special=true;
  this.prevInput={attack:!!input.attack,special:!!input.special};
  this.pending=input;
 }
 sendCommand(command){const c={...command};if(c.target==='local')c.target=this.id;if(c.targetId==='local')c.targetId=this.id;this.post('dw_command',{command:c});}
 update(dt){
  this.clock+=dt;
  const signature=JSON.stringify(this.pending);
  const active=!!(this.pending.mx||this.pending.my||this.pending.attack||this.pending.special||this.pending.block||this.pending.sprint);
  const previous=this.sentInput||{},critical=['mx','my','attack','special','block','sprint'].some(k=>(this.pending[k]||0)!==(previous[k]||0))||this.edge.attack||this.edge.special||this.sentPulse;
  const changed=signature!==this.sentSignature;
  if(this.clock-this.sent>=(critical?.025:active||changed?.05:.5)-1e-6){
   this.sentSignature=signature;this.sentInput={...this.pending};
   this.sent=this.clock;
   const input={...this.pending,attack:!!this.pending.attack||this.edge.attack,special:!!this.pending.special||this.edge.special};
   this.sentPulse=input.attack!==!!this.pending.attack||input.special!==!!this.pending.special;
   this.post('dw_input',{input});
   this.edge.attack=this.edge.special=false;
  }
 }
 snapshot(){return this.latest;}
 interpolateRemote(now){
  if(!this.latest||this.frames.length<2)return this.latest;
  const target=now-this.interpDelay;let a=this.frames[0],b=null;
  for(const frame of this.frames){if(frame.at<=target)a=frame;else{b=frame;break;}}
  if(!b){
   const last=this.frames.at(-1),prev=this.frames.at(-2);if(!prev)return last.state;
   const ahead=clamp(target-last.at,0,.08),span=Math.max(.001,last.at-prev.at),factor=clamp(ahead/span,0,.75);
   const extrapolate=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{if(e.id==='local')return e;const q=ids.get(e.id);if(!q||q.room!==e.room||q.dead!==e.dead)return e;const dx=e.x-q.x,dy=e.y-q.y;if(Math.hypot(dx,dy)>2.5)return e;return {...e,x:e.x+dx*factor,y:e.y+dy*factor};});};
   const ageTimers=e=>({...e,...Object.fromEntries(['attackPose','hitPose','life'].filter(k=>Number.isFinite(e[k])).map(k=>[k,Math.max(0,e[k]-ahead)]))});
   return {...last.state,time:last.state.time+ahead,entities:extrapolate(prev.state.entities,last.state.entities).map(e=>e.id==='local'?e:ageTimers(e)),projectiles:extrapolate(prev.state.projectiles,last.state.projectiles),effects:(last.state.effects||[]).map(ageTimers)};
  }
  const span=Math.max(.001,b.at-a.at),t=clamp((target-a.at)/span,0,1),mix=(x,y)=>x+(y-x)*t;
  const interp=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{if(e.id==='local')return e;const q=ids.get(e.id);if(!q||q.room!==e.room||q.dead!==e.dead||Math.hypot(e.x-q.x,e.y-q.y)>2.5)return e;const out={...e,x:mix(q.x,e.x),y:mix(q.y,e.y)};for(const k of ['attackPose','hitPose','life'])if(Number.isFinite(q[k])&&Number.isFinite(e[k])&&e[k]<=q[k])out[k]=mix(q[k],e[k]);if(Number.isFinite(q.facing)&&Number.isFinite(e.facing))out.facing=q.facing+Math.atan2(Math.sin(e.facing-q.facing),Math.cos(e.facing-q.facing))*t;return out;});};
  const renderTime=mix(a.state.time,b.state.time);
  // Effect lifetimes are clocks, not positions. Even newly created effects need to
  // advance on the render timeline instead of waiting for another matching packet.
  const effects=(b.state.effects||[]).map(f=>({...f,life:f.life+b.state.time-renderTime})).filter(f=>f.life>0&&f.life<=f.maxLife+1e-6);
  return {...b.state,time:renderTime,entities:interp(a.state.entities,b.state.entities),projectiles:interp(a.state.projectiles,b.state.projectiles),zones:a.state.zones||b.state.zones,effects};
 }
 renderSnapshot(now=performance.now()/1000){
  const state=this.interpolateRemote(now);if(!state||!this.serverMe)return state;
  // Start every frame from the latest authoritative position and extrapolate only the
  // tiny amount of time since that packet arrived. Prediction therefore never accumulates
  // across packets and cannot build up a rubber-band correction debt.
  const target=cloneEntity(this.serverMe),age=clamp(now-this.lastReceiveAt,0,.12);
  this.advanceLocal(target,age);this.orientLocal(target);
  const prev=this.visualMe;
  if(!prev||prev.room!==target.room||prev.dead!==target.dead||Math.hypot(target.x-prev.x,target.y-prev.y)>1.6)this.visualMe=cloneEntity(target);
  else{
   const dt=clamp(now-(this.visualAt||now),0,.05),dashVisual=!!this.pending?.sprint||!!target.dashing,blend=1-Math.exp(-dt*(dashVisual?56:38)),x=prev.x+(target.x-prev.x)*blend,y=prev.y+(target.y-prev.y)*blend;
   this.visualMe=cloneEntity(target);this.visualMe.x=x;this.visualMe.y=y;
  }
  this.visualAt=now;const me=this.visualMe,pmx=Number(this.pending?.mx)||0,pmy=Number(this.pending?.my)||0,plen=Math.hypot(pmx,pmy);
  const localEntity={...this.serverMe,x:me.x,y:me.y,facing:me.facing,attackPose:Math.max(0,(this.serverMe.attackPose||0)-age),hitPose:Math.max(0,(this.serverMe.hitPose||0)-age),poseTime:(this.latest?.time||0)+age,visualMoving:plen>.001&&!me.dead&&!(me.stun>0)&&!(me.root>0)&&!me.cast,visualMoveFacing:plen>.001?Math.atan2(pmy,pmx):me.facing};
  const entities=(state.entities||[]).map(e=>e.id==='local'?localEntity:e);
  // Remote actors are intentionally shown on the interpolation timeline, but the local
  // player's attack state must not live on that delayed timeline. Otherwise the character
  // is rendered at the current position while slash/cast/projectile visuals are 70-140 ms
  // behind and appear to originate from empty space.
  const latest=this.latest||state,localNow=list=>(list||[]).filter(v=>v?.owner==='local'),remoteDelayed=list=>(list||[]).filter(v=>v?.owner!=='local');
  const predictProjectile=p=>{const next={...p,x:p.x+Math.cos(p.angle||0)*(p.speed||0)*age,y:p.y+Math.sin(p.angle||0)*(p.speed||0)*age};return latest.map&&lineOfSight(latest.map,p,next)?next:p;};
  const projectiles=[...remoteDelayed(state.projectiles),...localNow(latest.projectiles).map(predictProjectile)];
  const zones=[...remoteDelayed(state.zones),...localNow(latest.zones)];
  const effects=[...remoteDelayed(state.effects),...localNow(latest.effects).map(f=>({...f,life:Math.max(0,f.life-age)}))].filter(f=>f.life>0);
  return {...state,networkInterpolated:true,entities,me:localEntity,projectiles,zones,effects};
 }
 close(){this.sendInput({});this.post('dw_input',{input:{}});}
}
