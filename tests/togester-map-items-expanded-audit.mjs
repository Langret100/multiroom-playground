import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const dummy=()=>({style:{},classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},removeEventListener(){},querySelector(){return dummy()},querySelectorAll(){return[]},setAttribute(){},getContext(){return{}},play(){return Promise.resolve()},pause(){},value:'',textContent:'',hidden:false});
const elements=new Map();
const document={getElementById(id){if(!elements.has(id))elements.set(id,dummy());return elements.get(id)},addEventListener(){},querySelector(){return dummy()},querySelectorAll(){return[]},body:dummy()};
const windowObj={addEventListener(){},removeEventListener(){},parent:null,innerWidth:800,innerHeight:600,devicePixelRatio:1};windowObj.parent=windowObj;
const sandbox={console,document,window:windowObj,location:{search:''},localStorage:{getItem(){return null},setItem(){}},performance:{now:()=>0},URLSearchParams,Math,Date,setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(){return 0},cancelAnimationFrame(){},Audio:function(){return dummy()},navigator:{userAgent:'test'}};
sandbox.globalThis=sandbox;vm.createContext(sandbox);
vm.runInContext(`${scripts[0]}\nglobalThis.__getLevel=getLevelForRound;globalThis.__buildItems=buildRoundItems;globalThis.__types=ITEM_TYPES;globalThis.__defs=ITEM_DEFS;globalThis.__max=TG_MAX_ROUNDS;`,sandbox);
const required=['hammer','spring','ice','boomerang'];
for(const t of required) assert.ok(sandbox.__types.includes(t),`new item missing: ${t}`);
assert.ok(sandbox.__types.length>=10,`expected >=10 item types, got ${sandbox.__types.length}`);
const seen=new Set();
let closeGapCount=0;
for(let n=1;n<=sandbox.__max;n++){
 const lv=sandbox.__getLevel(n);assert.ok(lv,`round ${n} missing`);
 const items=sandbox.__buildItems(lv,n);assert.equal(items.length,5,`round ${n} must spawn exactly 5 items`);
 if(n>=4){const ys=items.map(it=>it.y);assert.ok(Math.max(...ys)-Math.min(...ys)>=420,`round ${n} items are not spread along the route`);}
 for(const it of items){
   seen.add(it.type);assert.ok(sandbox.__defs[it.type],`round ${n} unknown item ${it.type}`);
   const supports=(lv.platforms||[]).filter(p=>Math.abs((it.y+24)-p.y)<=1 && it.x>=p.x+8 && it.x<=p.x+p.width-8);
   assert.ok(supports.length>0,`round ${n} item ${it.id} is not safely on a platform`);
   for(const sp of lv.spikes||[]){
     const ix=it.x+12, iy=it.y+12;
     const near=ix>sp.x-16&&ix<sp.x+sp.width+16&&iy>sp.y-38&&iy<sp.y+sp.height+20;
     assert.ok(!near,`round ${n} item ${it.id} too close to spike`);
   }
 }
 for(const b of lv.buttons||[]){
   if(b.doorId!=null)assert.ok(lv.doors[b.doorId],`round ${n} dangling door button`);
   if(b.bridgeId!=null)assert.ok(lv.bridges[b.bridgeId],`round ${n} dangling bridge button`);
   if(b.liftId!=null)assert.ok(lv.lifts[b.liftId],`round ${n} dangling lift button`);
   for(const sp of lv.spikes||[]){
     const overlap=b.x<sp.x+sp.width&&b.x+b.width>sp.x&&b.y<sp.y+sp.height&&b.y+b.height>sp.y;
     assert.ok(!overlap,`round ${n} button overlaps spike`);
   }
 }
 const plats=(lv.platforms||[]).filter(p=>p.height<=35);
 for(let i=0;i<plats.length;i++)for(let j=i+1;j<plats.length;j++){
   const a=plats[i],b=plats[j]; if(Math.abs(a.y-b.y)>8)continue;
   const gap=Math.max(a.x,b.x)-Math.min(a.x+a.width,b.x+b.width);
   if(gap>0&&gap<28)closeGapCount++;
 }
}
for(const t of required)assert.ok(seen.has(t),`new item never appears in initial round items: ${t}`);
assert.equal(closeGapCount,0,`ambiguous same-row tiny platform gaps remain: ${closeGapCount}`);
console.log(JSON.stringify({ok:true,rounds:sandbox.__max,itemTypes:sandbox.__types.length,newItems:required,closeGapCount}));
