// Per-recipient encoder: terrain/UI/audio stay on the client. Static map is sent once.
const lists=['entities','loot','chests','traps','projectiles','zones','effects'];
const hasPatch=p=>!!p&&(p.upserts?.length||p.removed?.length);
export class StateEncoder {
  constructor(){this.fields=new Map();this.members=new Map();this.entityFields=new Map();this.sequence=0;}
  changed(key,value){
    // Most network fields are primitives. Avoid JSON.stringify on every x/y/hp/timer field
    // for every recipient; stringify only compound values whose contents can mutate in place.
    const type=typeof value;let compound;if(value!==null&&type==='object'){compound=this.serializationCache?.get(value);if(compound===undefined){compound=JSON.stringify(value);this.serializationCache?.set(value,compound);}}
    const previous=this.fields.get(key),object=value!==null&&type==='object';
    if(this.fields.has(key)&&(object?previous?.encoded===compound:Object.is(previous,value)))return false;
    this.fields.set(key,object?{encoded:compound}:value);return true;
  }
  networkList(name,values){
    // Trap simulation needs the exact cooldown, but rendering only tests cool > 0. Sending
    // a countdown every 100 ms is pure traffic, so expose only the visual on/off state.
    return name==='traps'?values.map(t=>({...t,cool:t.cool>0?1:0})):values;
  }
  dynamicFields(name){
    // Existing objects in these lists are mostly immutable. New objects still send every field;
    // after that compare only fields that can actually change during the match.
    return ({loot:[],chests:['opened'],traps:['cool'],rooms:['locked','lava'],obstaclesDynamic:[]})[name]||null;
  }
  encode(state,serializationCache){
    this.serializationCache=serializationCache;
    if(!this.sequence++){const packet={type:'snapshot',version:1,state};this.remember(state);return packet;}
    const delta={type:'delta',version:1,tick:state.tick,changes:{},lists:{}};
    for(const [key,value] of Object.entries(state))if(!lists.includes(key)&&key!=='map'&&key!=='tick'&&key!=='me'&&key!=='remaining'&&this.changed(key,value))delta.changes[key]=value;
    for(const name of lists){const patch=this.diffList(name,this.networkList(name,state[name]||[]));if(hasPatch(patch))delta.lists[name]=patch;}
    // Most map obstacles are immutable scenery. Re-checking every fixed prop for every
    // recipient 10 times/sec wastes Durable Object CPU. Only player/master placed walls
    // can change after the initial snapshot, so track that tiny dynamic subset.
    const rooms=this.diffList('rooms',state.map.rooms.map(r=>({id:r.id,locked:!!r.locked,lava:r.lava||0})));
    const obstacles=this.diffList('obstaclesDynamic',(state.map.obstacles||[]).filter(o=>!o.fixed));
    if(hasPatch(rooms)||hasPatch(obstacles))delta.map={};
    if(hasPatch(rooms))delta.map.rooms=rooms;
    if(hasPatch(obstacles))delta.map.obstacles=obstacles;
    if(!Object.keys(delta.changes).length)delete delta.changes;
    if(!Object.keys(delta.lists).length)delete delta.lists;
    if(!delta.changes&&!delta.lists&&!delta.map)return null;
    return delta;
  }
  diffList(name,values){
    const old=this.members.get(name)||new Set(),current=new Set(),upserts=[];
    for(const value of values){const id=value.id;current.add(id);const patch={id},isNew=!old.has(id);let dirty=isNew;
      const dynamic=this.dynamicFields(name),entries=isNew||dynamic===null?Object.entries(value):dynamic.map(field=>[field,value[field]]);
      const prefix=name+':'+id+':',keys=this.entityFields.get(prefix)||new Set();this.entityFields.set(prefix,keys);
      for(const [field,data] of entries){keys.add(field);if(this.changed(prefix+field,data)){patch[field]=data;dirty=true;}}
      if(dirty)upserts.push(patch);
    }
    const removed=[...old].filter(id=>!current.has(id));for(const id of removed){const prefix=name+':'+id+':';for(const field of this.entityFields.get(prefix)||[])this.fields.delete(prefix+field);this.entityFields.delete(prefix);}
    this.members.set(name,current);return {upserts,removed};
  }
  remember(state){
    for(const [key,value] of Object.entries(state))if(!lists.includes(key)&&key!=='map'&&key!=='tick'&&key!=='me'&&key!=='remaining')this.changed(key,value);
    for(const name of lists)this.diffList(name,this.networkList(name,state[name]||[]));
    this.diffList('rooms',state.map.rooms.map(r=>({id:r.id,locked:!!r.locked,lava:r.lava||0})));
    this.diffList('obstaclesDynamic',(state.map.obstacles||[]).filter(o=>!o.fixed));
  }
}
export function applyStateDelta(state,packet){
  if(!state||packet.version!==1||packet.tick<state.tick)return state;
  const next={...state,...(packet.changes||{}),tick:packet.tick};
  if(Number.isFinite(state.remaining)&&Number.isFinite(state.time)&&Number.isFinite(next.time))next.remaining=Math.max(0,state.remaining+state.time-next.time);
  const merge=(old,{upserts=[],removed=[]}={})=>{const values=new Map((old||[]).filter(v=>!removed.includes(v.id)).map(v=>[v.id,v]));for(const patch of upserts)values.set(patch.id,{...values.get(patch.id),...patch});return [...values.values()];};
  for(const [name,patch] of Object.entries(packet.lists||{}))next[name]=merge(state[name],patch);
  if(packet.map)next.map={...state.map,rooms:packet.map.rooms?merge(state.map.rooms,packet.map.rooms):state.map.rooms,obstacles:packet.map.obstacles?merge(state.map.obstacles,packet.map.obstacles):state.map.obstacles};
  // 'me' is the same entity already present in entities. Keep it coherent locally instead
  // of transmitting the same player object twice in every movement/combat delta.
  if(next.me?.id&&Array.isArray(next.entities)){const own=next.entities.find(e=>e.id===next.me.id);if(own)next.me=own;}
  return next;
}
