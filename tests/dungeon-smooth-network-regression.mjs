import test from 'node:test';
import assert from 'node:assert/strict';
import {DungeonRoomRuntime} from '../cf-worker/src/dungeon/room-runtime.mjs';
import {RoomTransport} from '../games/dungeonwarden/room-transport.mjs';
import {StateEncoder,applyStateDelta} from '../cf-worker/src/dungeon/state-codec.mjs';
import {RoomDO} from '../cf-worker/src/index.js';
const roster=Array.from({length:8},(_,i)=>({id:'p'+i,name:'Player '+i}));
const wire=x=>JSON.parse(JSON.stringify(x));
test('changing aim stays near twenty input packets per second while a short tap survives',()=>{
 const t=new RoomTransport('p0','dungeonwarden'),packets=[];t.post=(type,p)=>packets.push(p.input);
 for(let i=0;i<120;i++){t.sendInput({mx:1,aimX:i*.01,aimY:0});t.update(1/120);}
 assert.ok(packets.length<=22,`input packets=${packets.length}`);
 t.sendInput({mx:1,attack:true});t.sendInput({mx:1});t.update(.026);assert.equal(packets.at(-1).attack,true);
});
test('effect deletion retains neighbouring IDs and reappearing IDs resend all fields',()=>{
 const e=new StateEncoder();e.diffList('effects',[{id:'a',life:1,kind:'slash'},{id:'a:x',life:2,kind:'meteor'}]);
 const p=e.diffList('effects',[{id:'a:x',life:2,kind:'meteor'}]);assert.deepEqual(p,{upserts:[],removed:['a']});
 assert.equal(e.entityFields.size,1);assert.equal(e.fields.size,3);
 assert.deepEqual(e.diffList('effects',[{id:'a:x',life:2,kind:'meteor'},{id:'a',life:1,kind:'slash'}]).upserts,[{id:'a',life:1,kind:'slash'}]);
});
test('shared compound serialization refreshes mutable equipment on the next tick',()=>{
 const r=new DungeonRoomRuntime(roster,{mode:'arena',seed:42});const states=new Map(roster.map(p=>[p.id,wire(r.packet(p.id).state)]));
 const hero=r.game.entities.find(e=>e.id==='p0');hero.equipment.main.stats.agility=37;r.step(1/30);
 for(const p of roster){const packet=r.packet(p.id);if(packet)states.set(p.id,applyStateDelta(states.get(p.id),wire(packet)));assert.deepEqual(states.get(p.id),wire(r.game.snapshot(p.id)));}
});
test('eight recipients reconstruct movement, combat and map state for 300 ticks',()=>{
 const r=new DungeonRoomRuntime(roster,{mode:'dungeon',seed:42}),states=new Map();
 for(const p of roster)states.set(p.id,wire(r.packet(p.id).state));
 for(let tick=0;tick<300;tick++){
  for(let i=0;i<8;i++)r.input(roster[i].id,{mx:Math.sin(tick*.07+i),my:Math.cos(tick*.07+i),attack:tick%12<6});
  r.step(1/30);if(tick%2)continue;
  for(const p of roster){const packet=r.packet(p.id);if(packet)states.set(p.id,applyStateDelta(states.get(p.id),wire(packet)));assert.deepEqual(states.get(p.id),wire(r.game.snapshot(p.id)));}
 }
});
test('idle sends heartbeat; move, stop and short action edges are delivered',()=>{
 const t=new RoomTransport('p0','dungeonwarden'),packets=[];t.post=(type,p)=>packets.push(p.input);
 for(let i=0;i<600;i++){t.sendInput({});t.update(1/60);}
 assert.ok(packets.length<=21,'idle heartbeat exceeds 2 Hz');const idle=packets.length;
 t.sendInput({mx:1});t.update(1/60);t.update(1/60);assert.equal(packets.at(-1).mx,1);
 t.sendInput({attack:true});t.sendInput({});t.update(.03);assert.equal(packets.at(-1).attack,true);
 t.sendInput({});t.update(.03);assert.ok(!packets.at(-1).attack);
 console.log(JSON.stringify({idlePacketsIn10Seconds:idle,previousExpectedPackets:200}));
});
test('press and release before a physics tick preserves one action; stale movement stops',()=>{
 const r=new DungeonRoomRuntime(roster.slice(0,1),{mode:'dungeon',seed:42});
 r.input('p0',{attack:true});r.input('p0',{});
 const step=r.game.step.bind(r.game);let observed;r.game.step=dt=>{observed={...r.game.inputs.get('p0')};step(dt);};
 r.step(1/30);assert.equal(observed.attack,true);assert.equal(r.game.inputs.get('p0').attack,false);
 r.step(1/30);assert.equal(observed.attack,false);
 r.input('p0',{mx:1});for(let i=0;i<30;i++)r.step(1/30);assert.equal(r.game.inputs.get('p0').mx,0);
});
test('prediction uses authoritative equipment speed and facing crosses angle boundary smoothly',()=>{
 const t=new RoomTransport('p0','dungeonwarden');assert.equal(t.localSpeed({stats:{speed:8.75}}),8.75);
 const a={time:1,entities:[{id:'remote',x:0,y:0,room:1,facing:Math.PI-.1,attackPose:.2}],projectiles:[],effects:[]};
 const b={...a,time:1.1,entities:[{...a.entities[0],x:.6,facing:-Math.PI+.1,attackPose:.1}]};
 t.latest=b;t.frames=[{at:1,state:a},{at:1.1,state:b}];t.interpDelay=.1;
 const e=t.interpolateRemote(1.15).entities[0];assert.ok(Math.abs(Math.abs(e.facing)-Math.PI)<.01);assert.ok(Math.abs(e.x-.3)<.001);assert.ok(Math.abs(e.attackPose-.15)<.001);
});
test('local attack pose, effect age and projectile advance every render frame without packets',()=>{
 const t=new RoomTransport('p0','dungeonwarden'),r=new DungeonRoomRuntime(roster.slice(0,1),{mode:'dungeon',seed:42});
 const state=wire(r.game.snapshot('p0'));state.effects=[{id:'slash-test',owner:'p0',kind:'slash',life:.22,maxLife:.22,x:state.me.x,y:state.me.y}];
 state.projectiles=[{id:'arrow-test',owner:'p0',kind:'arrow',angle:0,speed:20,x:state.me.x,y:state.me.y}];state.me.attackPose=.25;state.entities.find(e=>e.id==='p0').attackPose=.25;
 t.receive({type:'snapshot',state});const at=t.lastReceiveAt;
 const a=t.renderSnapshot(at+.01),b=t.renderSnapshot(at+.026);
 assert.ok(Math.abs(a.effects[0].life-b.effects[0].life-.016)<1e-6);assert.ok(Math.abs(a.me.attackPose-b.me.attackPose-.016)<1e-6);
 assert.ok(Math.abs(b.projectiles[0].x-a.projectiles[0].x-.32)<1e-6);
});
test('meteor falls toward the scheduled point and impact uses the same position and owner',()=>{
 const r=new DungeonRoomRuntime(roster.slice(0,1),{mode:'dungeon',seed:42}),e=r.game.entities.find(e=>e.id==='p0'),p={x:e.x+1,y:e.y};
 r.game.scheduleZone(e,'meteor',p,2,.4,10);const z=r.game.zones.at(-1);assert.equal(z.created,0);assert.equal(z.at,.4);
 for(let i=0;i<13;i++)r.step(1/30);const impact=r.game.effects.find(f=>f.kind==='meteor');assert.ok(impact);assert.equal(impact.x,p.x);assert.equal(impact.y,p.y);assert.equal(impact.owner,e.id);assert.equal(impact.impactAt,z.at);
});
test('recipient-specific visibility shares entity stat calculation and refreshes after a tick',()=>{
 const r=new DungeonRoomRuntime(roster,{mode:'arena',seed:42}),stats=r.game.stats.bind(r.game);let count=0;r.game.stats=e=>{count++;return stats(e);};
 for(const p of roster)r.packet(p.id);assert.equal(count,r.cleanCache.size);assert.ok(count<=r.game.entities.length);
 const before=count;r.step(1/30);assert.equal(r.cleanCache.size,0);const afterStep=count;for(const p of roster)r.packet(p.id);assert.ok(count-afterStep<=r.game.entities.length);
 console.log(JSON.stringify({cachedEntityStatCallsPer8Recipients:before,entityCount:r.game.entities.length}));
});
test('eight-player worker sends 10 frames/sec and shares one encoded packet across duplicate sockets',()=>{
 const interval=globalThis.setInterval,dateNow=Date.now;let callback,wall=100000;
 globalThis.setInterval=(fn,ms)=>{callback=fn;assert.ok(ms<34);return 999;};Date.now=()=>wall;
 const room=new RoomDO({},{}),delivered=[];room.meta={mode:'dungeonwarden',dungeonMode:'dungeon',phase:'playing',ownerUserId:'p0'};
 for(let i=0;i<8;i++){room.users.set('p'+i,{nick:'P'+i,seat:i});room.sockets.set({tag:'s'+i},'p'+i);}room.sockets.set({tag:'duplicate'},'p1');room._send=(ws,type,data)=>delivered.push({ws,packet:data.packet});
 try{room._startDungeon();room.dw.game.phase='playing';let encodes=0;const packet=room.dw.packet.bind(room.dw);room.dw.packet=(...args)=>{encodes++;return packet(...args);};
  for(let i=0;i<30;i++){wall+=i%3===0?34:33;callback();}
  const frames=delivered.filter(v=>v.ws.tag==='s0').length;assert.ok(frames>=9&&frames<=11,'frames='+frames+' encodes='+encodes);assert.equal(encodes,frames*8);
  const main=delivered.filter(v=>v.ws.tag==='s1'),copies=delivered.filter(v=>v.ws.tag==='duplicate');assert.equal(main.length,copies.length);for(let i=0;i<main.length;i++)assert.equal(main[i].packet,copies[i].packet);
  console.log(JSON.stringify({workerFramesPerSecond:frames,encodes,recipients:8}));
 }finally{globalThis.setInterval=interval;Date.now=dateNow;room.dwTimer=null;}
});
