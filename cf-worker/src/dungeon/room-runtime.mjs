import {DungeonGame} from './engine.mjs';
import {StateEncoder} from './state-codec.mjs';

// A room owns the simulation. Input identity always comes from its authenticated socket.
export class DungeonRoomRuntime {
  constructor(players,{mode='arena',masterId=null,seed=Date.now()}={}){
    const roster=players.slice(0,8).map(p=>({id:String(p.id),name:String(p.name).slice(0,40)}));
    this.game=new DungeonGame({mode,role:masterId?'master':'adventurer',masterId,seed,roster,bots:Math.min(2,Math.max(0,8-roster.length))});
    this.encoders=new Map();this.limits=new Map();this.inputAt=new Map();this.edges=new Map();this.cleanCache=new Map();this.serializationCache=new Map();
  }
  input(id,input){if(this.game.roster.some(p=>p.id===id&&!p.bot)){const prev=this.game.inputs.get(id)||{},edge=this.edges.get(id)||{};for(const k of ['attack','special'])if(input?.[k]&&!prev[k])edge[k]=true;this.edges.set(id,edge);this.game.input(id,input||{});this.inputAt.set(id,this.game.time);}}
  command(id,command){if(!this.game.roster.some(p=>p.id===id&&!p.bot))return;const count=this.limits.get(id)||0;if(count>=12)return;this.limits.set(id,count+1);this.game.command(id,command||{});}
  step(dt){
    for(const [id,at]of this.inputAt)if(this.game.time-at>.8){this.game.input(id,{});this.inputAt.delete(id);this.edges.delete(id);}
    const restore=new Map();for(const [id,edge]of this.edges)if(edge.attack||edge.special){const input=this.game.inputs.get(id)||{};restore.set(id,input);this.game.input(id,{...input,attack:input.attack||edge.attack,special:input.special||edge.special});}
    this.game.step(dt);this.cleanCache.clear();this.serializationCache.clear();for(const [id,input]of restore)this.game.input(id,input);this.edges.clear();this.limits.clear();
  }
  packet(id,reset=false){if(reset||!this.encoders.has(id))this.encoders.set(id,new StateEncoder());return this.encoders.get(id).encode(this.game.snapshot(id,this.cleanCache),this.serializationCache);}
  leave(id){this.game.input(id,{});this.edges.delete(id);this.inputAt.delete(id);this.cleanCache.clear();this.serializationCache.clear();const e=this.game.entities.find(e=>e.id===id);if(e){e.bot=true;e.name+=' · AI';}this.encoders.delete(id);}
}

