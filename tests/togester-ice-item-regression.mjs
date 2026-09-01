import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
const icon=html.match(/function drawPixelItemIcon\([\s\S]*?\n\s*function drawBackPixelItem/)?.[0]||'';
const sound=html.match(/function itemSound\([\s\S]*?\n\s*function itemHitSound/)?.[0]||'';
assert.ok(icon.includes("type==='ice'") && icon.includes("'#81ecec'"),'ice icon branch missing');
assert.ok(icon.includes("type==='hammer'") && icon.includes("type==='spring'") && icon.includes("type==='boomerang'"),'expanded item icon branches missing');
assert.ok(sound.includes("type==='ice'") && sound.includes('_itemTone(1080'),'ice sound branch missing');
assert.ok(!/\bp\s*\(/.test(sound),'pixel drawing code leaked into itemSound');
assert.ok(html.includes("try{ itemSound(type); }catch(_){ }"),'SFX isolation missing');
assert.ok(html.includes("heldItem.charges--;\n            if(heldItem.charges<=0) heldItem=null;"),'charge consumption missing');

// Execute the real useHeldItem() body with an ice item. This catches the exact regression
// where push happened first and a presentation exception prevented charge consumption.
const fnSrc=html.match(/function useHeldItem\(\)\{[\s\S]*?\n\s*function applyItemEvent/)?.[0].replace(/\n\s*function applyItemEvent[\s\S]*$/,'');
assert.ok(fnSrc,'useHeldItem source missing');
let now=1000, pushes=0, uses=0, sounds=0, effects=0, ui=0, publishes=0;
const ctx={
  heldItem:{id:'ice-1',type:'ice',charges:3}, localPlayer:{isDead:false,facing:1,x:100,y:100,vy:0,vx:0,onGround:true,pushAnimUntil:0},
  lastItemUseAt:0, performance:{now:()=>now}, closestRemote:()=>({sid:'b',x:220,y:100}), players:{}, getRemotePosForLogic:()=>({x:220,y:100}),
  PUSH_IMPULSE_X:10,PUSH_IMPULSE_Y:-8,PUSH_ANIM_MS:180,ITEM_DEFS:{ice:{color:'#81ecec'}},
  bridgeSendPush(){pushes++}, itemEvent(){uses++}, updateItemButton(){ui++}, itemSound(){sounds++}, addItemEffect(){effects++},
  EMBED:true,isGuestMode:false,bridgeSendState(){publishes++},Math,console
};
vm.createContext(ctx); vm.runInContext(`${fnSrc};globalThis.run=useHeldItem`,ctx);
for(let i=0;i<3;i++){ctx.run(); now+=300;}
assert.equal(pushes,3,'ice should apply exactly once per use');
assert.equal(uses,3,'ice use event count mismatch');
assert.equal(sounds,3,'ice SFX not invoked per use');
assert.equal(effects,3,'ice VFX not invoked per use');
assert.equal(ctx.heldItem,null,'ice should unequip after final charge');
assert.equal(ui,3,'item UI should refresh after each use');
assert.ok(publishes>=3,'post-use state publish missing');
console.log('TOGESTER_ICE_ITEM_REGRESSION_OK');
