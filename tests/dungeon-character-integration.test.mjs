import test from 'node:test';
import assert from 'node:assert/strict';
import {DungeonGame} from '../cf-worker/src/dungeon/engine.mjs';
import {StateEncoder,applyStateDelta} from '../games/dungeonwarden/shared/state-codec.mjs';
test('each participant keeps the same head across recipients and state deltas',()=>{
 const roster=Array.from({length:8},(_,i)=>({id:i?'human'+i:'local',name:'P'+(i+1)})),g=new DungeonGame({mode:'dungeon',seed:42,bots:0,roster});
 const players=g.entities.filter(e=>e.kind==='player');assert.equal(new Set(players.map(e=>e.headId)).size,8);
 const encoder=new StateEncoder(),first=g.snapshot('local'),state=encoder.encode(first).state;g.step(.05);
 const next=applyStateDelta(state,encoder.encode(g.snapshot('local')));assert.deepEqual(next.entities.filter(e=>e.kind==='player').map(e=>[e.id,e.headId]),first.entities.filter(e=>e.kind==='player').map(e=>[e.id,e.headId]));
 const other=g.snapshot('human1');assert.equal(other.me.headId,'p2');assert.equal(other.entities.find(e=>e.id==='local').headId,'p1');
});
test('released special retains a renderable pose after the cast disappears',()=>{
 const g=new DungeonGame({mode:'dungeon',seed:42,bots:0}),e=g.entities.find(e=>e.id==='local');e.equipment.main=g.itemCatalog.find(i=>i.kind==='main'&&i.type==='hammer'&&i.tier===1);
 g.input('local',{mx:0,my:0,special:true,aimX:e.x+2,aimY:e.y});g.step(.05);assert.ok(e.cast);g.input('local',{});for(let i=0;i<4;i++)g.step(.05);
 const me=g.snapshot('local').me;assert.equal(me.cast,null);assert.equal(me.skillPose.mode,'slam');assert.ok(me.skillPose.ends>g.time);for(let i=0;i<8;i++)g.step(.05);assert.equal(g.snapshot('local').me.skillPose,null);
});

