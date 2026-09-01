import fs from 'node:fs';
import assert from 'node:assert/strict';

const tg=fs.readFileSync(new URL('../games/togester/index.html', import.meta.url),'utf8');
const br=fs.readFileSync(new URL('../games/backrooms3d/embed.html', import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cf-worker/src/index.js', import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/rooms/GameRoom.js', import.meta.url),'utf8');

// Togester: last charge must unequip, update UI, then publish the post-use state.
const useBlock=tg.slice(tg.indexOf('function useHeldItem()'), tg.indexOf('function applyItemEvent'));
assert.match(useBlock,/heldItem\.charges--;/);
assert.match(useBlock,/if\(heldItem\.charges<=0\) heldItem=null;/);
const dec=useBlock.indexOf('heldItem.charges--');
const clear=useBlock.indexOf('if(heldItem.charges<=0) heldItem=null');
const ui=useBlock.indexOf('updateItemButton()',clear);
const sync=useBlock.indexOf('bridgeSendState(true)',ui);
assert.ok(dec>=0 && clear>dec && ui>clear && sync>ui,'post-consumption unequip must sync after local clear');

// Backrooms: client fallback and both server implementations use the same catch radius.
assert.match(br,/const MULTI_CATCH_RADIUS = 2\.75;/);
assert.match(br,/MULTI_CATCH_RADIUS\*MULTI_CATCH_RADIUS/);
assert.match(worker,/const catchRadius=2\.75;/);
assert.match(worker,/_checkBackroomsCatches\(\)/);
assert.match(worker,/_serverAt:n/);
assert.match(server,/const checkBackroomsCatches = \(\)=>\{/);
assert.match(server,/const stamp=Date\.now\(\), catchRadius=2\.75;/);
assert.match(server,/checkBackroomsCatches\(\);/);
assert.match(server,/_serverAt = nowMs/);

// Boundary sanity: visually touching range should catch, clearly separated should not.
const r=2.75;
assert.ok(2.55*2.55 < r*r);
assert.ok(3.10*3.10 > r*r);
console.log('TOGESTER_ITEM_CONSUME_BACKROOMS_CATCH_REGRESSION_OK');
