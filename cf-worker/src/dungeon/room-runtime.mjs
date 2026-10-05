import {DungeonGame} from './engine.mjs';
import {StateEncoder} from './state-codec.mjs';

// A room owns the simulation. Input identity always comes from its authenticated socket.
export class DungeonRoomRuntime {
  constructor(players,{mode='arena',masterId=null,seed=Date.now()}={}){
    const roster=players.slice(0,8).map(p=>({id:String(p.id),name:String(p.name).slice(0,40)}));
    this.game=new DungeonGame({mode,role:masterId?'master':'adventurer',masterId,seed,roster,bots:Math.min(2,Math.max(0,8-roster.length))});
    this.encoders=new Map();this.limits=new Map();
  }
  input(id,input){if(this.game.roster.some(p=>p.id===id&&!p.bot))this.game.input(id,input||{});}
  command(id,command){if(!this.game.roster.some(p=>p.id===id&&!p.bot))return;const count=this.limits.get(id)||0;if(count>=12)return;this.limits.set(id,count+1);this.game.command(id,command||{});}
  step(dt){this.game.step(dt);this.limits.clear();}
  packet(id,reset=false){if(reset||!this.encoders.has(id))this.encoders.set(id,new StateEncoder());return this.encoders.get(id).encode(this.game.snapshot(id));}
  leave(id){this.game.input(id,{});const e=this.game.entities.find(e=>e.id===id);if(e){e.bot=true;e.name+=' · AI';}this.encoders.delete(id);}
}

