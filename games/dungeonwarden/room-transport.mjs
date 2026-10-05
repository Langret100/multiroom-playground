import {applyStateDelta} from './shared/state-codec.mjs';
export class RoomTransport {
 constructor(id,gameId){this.id=id;this.gameId=gameId;this.latest=null;this.network=true;this.clock=0;this.sent=-1;this.pending={};this.raw=null;this.frames=[];this.interpDelay=.145;this.arrivalGap=.1;this.jitter=.015;this.lastReceiveAt=0;}
 post(type,data={}){parent.postMessage({type,gameId:this.gameId,...data},location.origin);}
 receive(packet){if(packet.type==='snapshot')this.raw=packet.state;else this.raw=applyStateDelta(this.raw,packet);if(!this.raw)return;
  // Existing renderer uses 'local' as the viewer ID. Normalize only this recipient's identity.
  const map=v=>typeof v==='string'?(v===this.id?'local':v):Array.isArray(v)?v.map(map):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,map(x)])):v;
  this.latest=map(this.raw);
  const receivedAt=performance.now()/1000;if(this.lastReceiveAt){const gap=Math.max(.025,Math.min(.4,receivedAt-this.lastReceiveAt)),prevGap=this.arrivalGap;this.arrivalGap=prevGap*.88+gap*.12;this.jitter=this.jitter*.88+Math.abs(gap-prevGap)*.12;const desired=Math.max(.125,Math.min(.19,this.arrivalGap+this.jitter*2.6+.025));this.interpDelay=this.interpDelay*.9+desired*.1;}this.lastReceiveAt=receivedAt;
  this.frames.push({at:receivedAt,state:this.latest});this.frames=this.frames.slice(-10);
 }
 sendInput(input){this.pending=input;}
 sendCommand(command){const c={...command};if(c.target==='local')c.target=this.id;if(c.targetId==='local')c.targetId=this.id;this.post('dw_command',{command:c});}
 update(dt){this.clock+=dt;if(this.clock-this.sent>=.05){this.sent=this.clock;this.post('dw_input',{input:this.pending});}}
 snapshot(){return this.latest;}
 renderSnapshot(now=performance.now()/1000){
  if(!this.latest||this.frames.length<2)return this.latest;
  const target=now-this.interpDelay;let a=this.frames[0],b=a;
  for(const frame of this.frames){if(frame.at<=target)a=frame;else{b=frame;break;}b=frame;}
  if(a===b){
   const last=this.frames[this.frames.length-1],prev=this.frames[this.frames.length-2],ahead=Math.min(.06,Math.max(0,target-last.at)),span=Math.max(.001,last.at-prev.at);
   if(ahead>0&&span>.025&&span<.35){const extrapolate=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{const q=ids.get(e.id);if(!q||q.room!==e.room||q.dead!==e.dead)return e;const dx=e.x-q.x,dy=e.y-q.y,dist=Math.hypot(dx,dy);if(dist>2.5)return e;const factor=Math.min(ahead/span,.65);return {...e,x:e.x+dx*factor,y:e.y+dy*factor};});};const entities=extrapolate(prev.state.entities,last.state.entities),byId=new Map(entities.map(e=>[e.id,e]));return {...last.state,networkInterpolated:true,entities,me:byId.get(last.state.me?.id)||last.state.me,projectiles:extrapolate(prev.state.projectiles,last.state.projectiles)};}
   return a.state;
  }
  const t=Math.max(0,Math.min(1,(target-a.at)/(b.at-a.at))),mix=(x,y)=>x+(y-x)*t;
  const positions=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{const p=ids.get(e.id);if(!p||p.room!==e.room||p.dead!==e.dead||Math.hypot(e.x-p.x,e.y-p.y)>12)return e;return {...e,x:mix(p.x,e.x),y:mix(p.y,e.y)};});};
  const entities=positions(a.state.entities,b.state.entities),byId=new Map(entities.map(e=>[e.id,e]));
  return {...b.state,networkInterpolated:true,time:mix(a.state.time,b.state.time),entities,me:byId.get(b.state.me?.id)||b.state.me,projectiles:positions(a.state.projectiles,b.state.projectiles)};
 }
 close(){this.sendInput({});this.post('dw_input',{input:{}});}
}
