import {applyStateDelta} from './shared/state-codec.mjs';
export class RoomTransport {
 constructor(id,gameId){this.id=id;this.gameId=gameId;this.latest=null;this.network=true;this.clock=0;this.sent=-1;this.pending={};this.raw=null;}
 post(type,data={}){parent.postMessage({type,gameId:this.gameId,...data},location.origin);}
 receive(packet){if(packet.type==='snapshot')this.raw=packet.state;else this.raw=applyStateDelta(this.raw,packet);if(!this.raw)return;
  // Existing renderer uses 'local' as the viewer ID. Normalize only this recipient's identity.
  const map=v=>typeof v==='string'?(v===this.id?'local':v):Array.isArray(v)?v.map(map):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,map(x)])):v;
  this.latest=map(this.raw);
 }
 sendInput(input){this.pending=input;}
 sendCommand(command){const c={...command};if(c.target==='local')c.target=this.id;if(c.targetId==='local')c.targetId=this.id;this.post('dw_command',{command:c});}
 update(dt){this.clock+=dt;if(this.clock-this.sent>=.05){this.sent=this.clock;this.post('dw_input',{input:this.pending});}}
 snapshot(){return this.latest;}
 close(){this.sendInput({});this.post('dw_input',{input:{}});}
}
