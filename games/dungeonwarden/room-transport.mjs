import {applyStateDelta} from './shared/state-codec.mjs';
import {move} from './shared/world.mjs';
import {WEAPONS} from './shared/catalog.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cloneEntity=e=>e?{...e,equipment:e.equipment?{...e.equipment}:e.equipment,base:e.base?{...e.base}:e.base}:null;

export class RoomTransport {
 constructor(id,gameId){
  this.id=id;this.gameId=gameId;this.latest=null;this.network=true;
  this.clock=0;this.sent=-1;this.pending={};this.raw=null;this.frames=[];
  this.interpDelay=.16;this.arrivalGap=.1;this.jitter=.01;this.lastReceiveAt=0;
  this.predictedMe=null;this.serverMe=null;this.correction={x:0,y:0};
 }
 post(type,data={}){parent.postMessage({type,gameId:this.gameId,...data},location.origin);}
 normalize(v){return typeof v==='string'?(v===this.id?'local':v):Array.isArray(v)?v.map(x=>this.normalize(x)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,this.normalize(x)])):v;}
 receive(packet){
  if(packet.type==='snapshot')this.raw=packet.state;else this.raw=applyStateDelta(this.raw,packet);if(!this.raw)return;
  const next=this.normalize(this.raw);this.latest=next;
  const now=performance.now()/1000;
  if(this.lastReceiveAt){
   const gap=clamp(now-this.lastReceiveAt,.025,.5),delta=Math.abs(gap-this.arrivalGap);
   this.arrivalGap=this.arrivalGap*.9+gap*.1;this.jitter=this.jitter*.9+delta*.1;
   this.interpDelay=clamp(this.arrivalGap+this.jitter*3+.035,.14,.22);
  }
  this.lastReceiveAt=now;this.frames.push({at:now,state:next});if(this.frames.length>12)this.frames.shift();
  this.reconcileLocal(next.me||next.entities?.find(e=>e.id==='local'));
 }
 reconcileLocal(server){
  if(!server)return;this.serverMe=server;
  if(!this.predictedMe||this.predictedMe.room!==server.room||this.predictedMe.dead!==server.dead){this.predictedMe=cloneEntity(server);this.correction.x=this.correction.y=0;return;}
  const dx=server.x-this.predictedMe.x,dy=server.y-this.predictedMe.y,dist=Math.hypot(dx,dy);
  if(dist>2.2){this.predictedMe=cloneEntity(server);this.correction.x=this.correction.y=0;return;}
  this.correction.x+=dx;this.correction.y+=dy;
  // Keep all non-position authoritative fields current.
  const x=this.predictedMe.x,y=this.predictedMe.y;
  this.predictedMe=cloneEntity(server);this.predictedMe.x=x;this.predictedMe.y=y;
 }
 sendInput(input){this.pending=input||{};}
 sendCommand(command){const c={...command};if(c.target==='local')c.target=this.id;if(c.targetId==='local')c.targetId=this.id;this.post('dw_command',{command:c});}
 localSpeed(e){
  let agility=e.base?.agility??100;
  for(const item of Object.values(e.equipment||{}))if(item?.stats?.agility)agility+=item.stats.agility;
  let speed=6*agility/100*(e.slow>0?.5:1);
  const main=e.equipment?.main,off=e.equipment?.off;
  if(main&&WEAPONS[main.type]?.hands===1&&!off)speed*=1.07;
  return speed;
 }
 predictLocal(dt){
  const e=this.predictedMe,s=this.latest,i=this.pending||{};if(!e||!s?.map||e.dead)return;
  // Smoothly absorb normal server reconciliation without creating a visible snap.
  const settle=1-Math.exp(-dt*12);e.x+=this.correction.x*settle;e.y+=this.correction.y*settle;this.correction.x*=1-settle;this.correction.y*=1-settle;
  const dx=Number(i.mx)||0,dy=Number(i.my)||0,len=Math.hypot(dx,dy);
  if(!len||e.stun>0||e.root>0||e.cast)return;
  let speed=this.localSpeed(e);
  const sprint=!!i.sprint&&e.dashRecovery<=0&&e.dash>0;if(sprint)speed*=1.6;
  if(i.block&&e.equipment?.off?.type==='shield')speed*=.35;
  const map={...s.map,bodies:(s.entities||[]).filter(x=>x.id!=='local')};
  move(map,e,dx/Math.max(1,len)*speed*dt,dy/Math.max(1,len)*speed*dt,false);
  if(!WEAPONS[e.equipment?.main?.type]?.range&&!(i.block&&e.equipment?.off?.type==='shield'))e.facing=Math.atan2(dy,dx);
 }
 update(dt){
  this.clock+=dt;this.predictLocal(dt);
  if(this.clock-this.sent>=.05){this.sent=this.clock;this.post('dw_input',{input:this.pending});}
 }
 snapshot(){return this.latest;}
 interpolateRemote(now){
  if(!this.latest||this.frames.length<2)return this.latest;
  const target=now-this.interpDelay;let a=this.frames[0],b=null;
  for(const frame of this.frames){if(frame.at<=target)a=frame;else{b=frame;break;}}
  if(!b){
   const last=this.frames.at(-1),prev=this.frames.at(-2);if(!prev)return last.state;
   const ahead=clamp(target-last.at,0,.12),span=Math.max(.001,last.at-prev.at),factor=clamp(ahead/span,0,.85);
   const extrapolate=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{if(e.id==='local')return e;const p=ids.get(e.id);if(!p||p.room!==e.room||p.dead!==e.dead)return e;const dx=e.x-p.x,dy=e.y-p.y;if(Math.hypot(dx,dy)>2.5)return e;return {...e,x:e.x+dx*factor,y:e.y+dy*factor};});};
   return {...last.state,entities:extrapolate(prev.state.entities,last.state.entities),projectiles:extrapolate(prev.state.projectiles,last.state.projectiles)};
  }
  const span=Math.max(.001,b.at-a.at),t=clamp((target-a.at)/span,0,1),mix=(x,y)=>x+(y-x)*t;
  const interp=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{if(e.id==='local')return e;const p=ids.get(e.id);if(!p||p.room!==e.room||p.dead!==e.dead||Math.hypot(e.x-p.x,e.y-p.y)>12)return e;return {...e,x:mix(p.x,e.x),y:mix(p.y,e.y)};});};
  return {...b.state,time:mix(a.state.time,b.state.time),entities:interp(a.state.entities,b.state.entities),projectiles:interp(a.state.projectiles,b.state.projectiles)};
 }
 renderSnapshot(now=performance.now()/1000){
  const state=this.interpolateRemote(now);if(!state||!this.predictedMe)return state;
  const me=this.predictedMe,entities=(state.entities||[]).map(e=>e.id==='local'?{...e,x:me.x,y:me.y,facing:me.facing}:e);
  return {...state,networkInterpolated:true,entities,me:{...(state.me||me),x:me.x,y:me.y,facing:me.facing}};
 }
 close(){this.sendInput({});this.post('dw_input',{input:{}});}
}
