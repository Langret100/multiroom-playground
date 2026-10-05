// Per-recipient encoder: terrain/UI/audio stay on the client. Static map is sent once.
const lists=['entities','loot','chests','traps','projectiles','zones','effects'];
export class StateEncoder {
  constructor(){this.fields=new Map();this.members=new Map();this.sequence=0;}
  changed(key,value){const encoded=JSON.stringify(value);if(this.fields.get(key)===encoded)return false;this.fields.set(key,encoded);return true;}
  encode(state){
    if(!this.sequence++){const packet={type:'snapshot',version:1,state};this.remember(state);return packet;}
    const delta={type:'delta',version:1,tick:state.tick,changes:{},lists:{}};
    for(const [key,value] of Object.entries(state))if(!lists.includes(key)&&key!=='map'&&this.changed(key,value))delta.changes[key]=value;
    for(const name of lists)delta.lists[name]=this.diffList(name,state[name]||[]);
    delta.map={rooms:this.diffList('rooms',state.map.rooms),obstacles:this.diffList('obstacles',state.map.obstacles)};
    return delta;
  }
  diffList(name,values){
    const old=this.members.get(name)||new Set(),current=new Set(),upserts=[];
    for(const value of values){const id=value.id;current.add(id);const patch={id};let dirty=!old.has(id);
      for(const [field,data] of Object.entries(value))if(this.changed(name+':'+id+':'+field,data)){patch[field]=data;dirty=true;}
      if(dirty)upserts.push(patch);
    }
    const removed=[...old].filter(id=>!current.has(id));for(const id of removed)for(const key of this.fields.keys())if(key.startsWith(name+':'+id+':'))this.fields.delete(key);
    this.members.set(name,current);return {upserts,removed};
  }
  remember(state){for(const [key,value] of Object.entries(state))if(!lists.includes(key)&&key!=='map')this.changed(key,value);for(const name of lists)this.diffList(name,state[name]||[]);this.diffList('rooms',state.map.rooms);this.diffList('obstacles',state.map.obstacles);}
}
export function applyStateDelta(state,packet){
  if(!state||packet.version!==1||packet.tick<state.tick)return state;
  const next={...state,...packet.changes};
  const merge=(old,{upserts=[],removed=[]}={})=>{const values=new Map((old||[]).filter(v=>!removed.includes(v.id)).map(v=>[v.id,v]));for(const patch of upserts)values.set(patch.id,{...values.get(patch.id),...patch});return [...values.values()];};
  for(const [name,patch] of Object.entries(packet.lists||{}))next[name]=merge(state[name],patch);
  if(packet.map)next.map={...state.map,rooms:merge(state.map.rooms,packet.map.rooms),obstacles:merge(state.map.obstacles,packet.map.obstacles)};
  return next;
}
