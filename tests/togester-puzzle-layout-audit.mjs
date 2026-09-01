import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
assert.ok(!html.match(/function _seqForLevel[\s\S]*?function _genLevel/)?.[0].includes("'relay'"),'relay composite still used by round sequence');
assert.ok(!html.match(/function _seqForLevel[\s\S]*?function _genLevel/)?.[0].includes("'split'"),'split composite still used by round sequence');
assert.ok(!html.match(/function _seqForLevel[\s\S]*?function _genLevel/)?.[0].includes("'boxrelay'"),'boxrelay composite still used by round sequence');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const dummy=()=>({style:{},classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},removeEventListener(){},querySelector(){return dummy()},querySelectorAll(){return[]},setAttribute(){},getContext(){return{}},play(){return Promise.resolve()},pause(){},value:'',textContent:'',hidden:false});
const elements=new Map(); const document={getElementById(id){if(!elements.has(id))elements.set(id,dummy());return elements.get(id)},addEventListener(){},querySelector(){return dummy()},querySelectorAll(){return[]},body:dummy()};
const windowObj={addEventListener(){},removeEventListener(){},parent:null,innerWidth:800,innerHeight:600,devicePixelRatio:1};windowObj.parent=windowObj;
const sandbox={console,document,window:windowObj,location:{search:''},localStorage:{getItem(){return null},setItem(){}},performance:{now:()=>0},URLSearchParams,Math,Date,setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(){return 0},cancelAnimationFrame(){},Audio:function(){return dummy()},navigator:{userAgent:'test'}};
sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(`${scripts[0]}\nglobalThis.__get=getLevelForRound;globalThis.__max=TG_MAX_ROUNDS;`,sandbox);
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
for(let n=1;n<=sandbox.__max;n++){
 const lv=sandbox.__get(n); const all=[...(lv.platforms||[]),...(lv.buttons||[]),...(lv.doors||[]),...(lv.spikes||[]),...(lv.boxes||[]),...(lv.lifts||[]),...(lv.bridges||[])];
 for(const o of all){ assert.ok(o.x>=0 && o.x+o.width<=520,`round ${n} out of horizontal bounds`); assert.ok(o.y>=60 && o.y+o.height<=2470,`round ${n} out of vertical bounds`); }
 for(const b of lv.buttons||[]){
   const support=(lv.platforms||[]).some(p=>b.x>=p.x-1&&b.x+b.width<=p.x+p.width+1&&Math.abs((b.y+b.height)-p.y)<=1);
   assert.ok(support,`round ${n} button lacks aligned support platform`);
   for(const sp of lv.spikes||[]){
     const padded={x:b.x-30,y:b.y-35,width:b.width+60,height:b.height+70};
     assert.ok(!overlaps(padded,sp),`round ${n} spike crowds button`);
   }
 }
 for(let i=0;i<(lv.buttons||[]).length;i++) for(let j=i+1;j<(lv.buttons||[]).length;j++){
   const a=lv.buttons[i],b=lv.buttons[j]; const dy=Math.abs(a.y-b.y);
   assert.ok(dy>45 || Math.abs(a.x-b.x)>120,`round ${n} puzzle controls visually stacked`);
 }
 for(const d of lv.doors||[]) assert.ok((lv.buttons||[]).some(b=>b.doorId===(lv.doors||[]).indexOf(d)),`round ${n} door has no controller`);
 for(const br of lv.bridges||[]) assert.ok((lv.buttons||[]).some(b=>b.bridgeId===(lv.bridges||[]).indexOf(br)),`round ${n} bridge has no controller`);
 for(const l of lv.lifts||[]) assert.ok((lv.buttons||[]).some(b=>b.liftId===(lv.lifts||[]).indexOf(l)),`round ${n} lift has no controller`);
}
console.log(`TOGESTER_PUZZLE_LAYOUT_AUDIT_OK rounds=${sandbox.__max}`);
