const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const store=fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8');
const rt=fs.readFileSync(path.join(root,'js/adapters/realtime.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
const purchase=store.slice(store.indexOf('async function purchase('),store.indexOf('async function randomPurchase('));
const random=store.slice(store.indexOf('async function randomPurchase('),store.indexOf('async function use('));
ok(!purchase.includes('Realtime.addShopInventory'), 'normal purchase still creates persistent Realtime mirror');
ok(!random.includes('Realtime.addShopInventory'), 'random purchase still creates persistent Realtime mirror');
ok((purchase.match(/pendingSync:true/g)||[]).length===1, 'purchase pending fallback must be Store-only pendingSync');
ok((random.match(/pendingSync:true/g)||[]).length===1, 'random pending fallback must be Store-only pendingSync');
const remove=rt.slice(rt.indexOf('async function removeShopInventory('),rt.indexOf('async function giftShopInventory('));
ok(remove.includes('if(explicitOwner){const stored=localGet(`shop.inventory.${expectedOwner}`,{})'), 'explicit-owner legacy cleanup must read raw mirror only');
const explicit=remove.slice(remove.indexOf('if(explicitOwner)'),remove.indexOf('const inventory=localShopInventory'));
ok(!explicit.includes('emit("shop-inventory"'), 'explicit-owner cleanup must not re-emit stale mirror');
ok(html.includes('js/shopping/store-service.js?v=64.5.25'), 'store-service cache version stale');
ok(html.includes('js/adapters/realtime.js?v=64.5.47'), 'realtime cache version stale');
console.log('SHOPPING_LOCAL_MIRROR_RESURRECTION_OK');
