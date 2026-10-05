import {applyStateDelta} from './shared/state-codec.mjs';
export class RoomTransport {
 constructor(id,gameId){this.id=id;this.gameId=gameId;this.latest=null;this.network=true;this.clock=0;this.sent=-1;this.pending={};this.lastSentInput={};this.raw=null;this.frames=[];}
 post(type,data={}){parent.postMessage({type,gameId:this.gameId,...data},location.origin);}
 receive(packet){if(packet.type==='snapshot')this.raw=packet.state;else this.raw=applyStateDelta(this.raw,packet);if(!this.raw)return;
  // Existing renderer uses 'local' as the viewer ID. Normalize only this recipient's identity.
  const map=v=>typeof v==='string'?(v===this.id?'local':v):Array.isArray(v)?v.map(map):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,map(x)])):v;
  this.latest=map(this.raw);
  this.frames.push({at:performance.now()/1000,state:this.latest});this.frames=this.frames.slice(-8);
 }
 sendInput(input){this.pending=input||{};}
 inputChanged(a={},b={}){
  for(const k of ['mx','my'])if(Number(a[k]||0)!==Number(b[k]||0))return true;
  for(const k of ['attack','special','sprint','block'])if(!!a[k]!==!!b[k])return true;
  return Math.hypot((a.aimX||0)-(b.aimX||0),(a.aimY||0)-(b.aimY||0))>.12;
 }
 postInput(){this.post('dw_input',{input:this.pending});this.lastSentInput={...this.pending};this.sent=this.clock;}
 sendCommand(command){const c={...command};if(c.target==='local')c.target=this.id;if(c.targetId==='local')c.targetId=this.id;this.post('dw_command',{command:c});}
 update(dt){
  this.clock+=dt;
  const p=this.pending||{},last=this.lastSentInput||{},changed=this.inputChanged(p,last);
  const motionChanged=(p.mx||0)!==(last.mx||0)||(p.my||0)!==(last.my||0)||!!p.sprint!==!!last.sprint||!!p.block!==!!last.block;
  const actionEdge=!!p.attack!==!!last.attack||!!p.special!==!!last.special;
  // Movement/button edges are latency-sensitive and go out immediately. Continuous aim
  // updates are capped at 10 Hz to match authoritative state delivery. Once an input state
  // is accepted the server retains it, and WebSocket delivery is reliable/ordered, so repeating
  // unchanged movement or held buttons adds traffic without improving control or recovery.
  if((changed&&(motionChanged||actionEdge))||(changed&&this.clock-this.sent>=.1))this.postInput();
 }
 snapshot(){return this.latest;}
 renderSnapshot(now=performance.now()/1000){
  if(!this.latest||this.frames.length<2)return this.latest;
  const target=now-.1;let a=this.frames[0],b=a;
  for(const frame of this.frames){if(frame.at<=target)a=frame;else{b=frame;break;}b=frame;}
  if(a===b)return a.state;
  const t=Math.max(0,Math.min(1,(target-a.at)/(b.at-a.at))),mix=(x,y)=>x+(y-x)*t;
  const positions=(old,values)=>{const ids=new Map((old||[]).map(e=>[e.id,e]));return (values||[]).map(e=>{const p=ids.get(e.id);if(!p||p.room!==e.room||p.dead!==e.dead||Math.hypot(e.x-p.x,e.y-p.y)>12)return e;return {...e,x:mix(p.x,e.x),y:mix(p.y,e.y)};});};
  const entities=positions(a.state.entities,b.state.entities),byId=new Map(entities.map(e=>[e.id,e]));
  return {...b.state,networkInterpolated:true,time:mix(a.state.time,b.state.time),entities,me:byId.get(b.state.me?.id)||b.state.me,projectiles:positions(a.state.projectiles,b.state.projectiles)};
 }
 close(){this.pending={};this.postInput();}
}
