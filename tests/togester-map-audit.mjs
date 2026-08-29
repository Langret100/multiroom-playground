import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
const netAdapter=fs.readFileSync(new URL('../js/core/net.js',import.meta.url),'utf8');
assert.ok((netAdapter.match(/"tg_item"/g)||[]).length>=2,'tg_item must be allowed in both outbound and inbound adapter lists');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const dummy=()=>({style:{},classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},removeEventListener(){},querySelector(){return dummy()},querySelectorAll(){return[]},setAttribute(){},getContext(){return{}},play(){return Promise.resolve()},pause(){},value:'',textContent:'',hidden:false});
const elements=new Map();
const document={getElementById(id){if(!elements.has(id))elements.set(id,dummy());return elements.get(id)},addEventListener(){},querySelector(){return dummy()},querySelectorAll(){return[]},body:dummy()};
const windowObj={addEventListener(){},removeEventListener(){},parent:null,innerWidth:800,innerHeight:600,devicePixelRatio:1}; windowObj.parent=windowObj;
const sandbox={console,document,window:windowObj,location:{search:''},localStorage:{getItem(){return null},setItem(){}},performance:{now:()=>0},URLSearchParams,Math,Date,setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(){return 0},cancelAnimationFrame(){},Audio:function(){return dummy()},navigator:{userAgent:'test'}};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(`${scripts[0]}\nglobalThis.__getLevel=getLevelForRound;globalThis.__buildItems=buildRoundItems;globalThis.__types=ITEM_TYPES;globalThis.__max=TG_MAX_ROUNDS;`,sandbox);

const summary=[];
for(let n=1;n<=sandbox.__max;n++){
  const lv=sandbox.__getLevel(n); assert.ok(lv,`round ${n} missing`);
  assert.ok(lv.platforms.length>=4,`round ${n} lacks platforms`);
  const dist=Math.hypot(lv.goal.x-lv.spawn.x,lv.goal.y-lv.spawn.y);
  assert.ok(dist>=260,`round ${n} goal is too close (${dist})`);
  const items=sandbox.__buildItems(lv,n);
  assert.ok(items.length>=3&&items.length<=5,`round ${n} item count ${items.length}`);
  assert.equal(new Set(items.map(x=>x.id)).size,items.length,`round ${n} duplicate item id`);
  assert.ok(items.every(x=>sandbox.__types.includes(x.type)),`round ${n} invalid item type`);
  for(const b of lv.buttons||[]){
    if(b.doorId!=null)assert.ok(lv.doors[b.doorId],`round ${n} dangling door button`);
    if(b.bridgeId!=null)assert.ok(lv.bridges[b.bridgeId],`round ${n} dangling bridge button`);
    if(b.liftId!=null)assert.ok(lv.lifts[b.liftId],`round ${n} dangling lift button`);
  }
  const mechanics=(lv.buttons?.length||0)+(lv.doors?.length||0)+(lv.boxes?.length||0)+(lv.lifts?.length||0)+(lv.bridges?.length||0)+(lv.spikes?.length||0);
  if(n>=2)assert.ok(mechanics>0,`round ${n} has no puzzle or trap`);
  const spawnRect={x:lv.spawn.x,y:lv.spawn.y,w:40,h:40};
  assert.ok(!(lv.spikes||[]).some(s=>spawnRect.x<s.x+s.width&&spawnRect.x+spawnRect.w>s.x&&spawnRect.y<s.y+s.height&&spawnRect.y+spawnRect.h>s.y),`round ${n} trap overlaps spawn`);
  summary.push({round:n,platforms:lv.platforms.length,mechanics,items:items.length,distance:Math.round(dist)});
}
console.log(JSON.stringify({ok:true,rounds:summary.length,itemRange:[Math.min(...summary.map(x=>x.items)),Math.max(...summary.map(x=>x.items))],mechanics:summary.reduce((a,x)=>a+x.mechanics,0)}));
