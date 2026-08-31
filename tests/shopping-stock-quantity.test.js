const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const start=src.indexOf('function shopRandomWeight_');
if(start<0)throw new Error('random helper missing');
const code=src.slice(start);
const state={catalog:{},coin:20,logs:[],inventory:new Map(),deductions:0,adds:0,failLog:false};
const normalize=p=>{const q=p?.quantity;const has=q!==null&&q!==undefined&&String(q).trim()!=='';return{id:String(p?.id||''),name:String(p?.name||''),description:String(p?.description||''),imageUrl:String(p?.imageUrl||''),price:Number(p?.price)||0,quantity:has?Math.max(0,Math.floor(Number(q)||0)):null,updatedAt:Number(p?.updatedAt)||0,active:p?.active!==false}};
const ctx={
 console, Math:Object.create(Math), SHOP_RANDOM_PURCHASE_PRICE:3,
 requireRegisteredShopUser_:id=>String(id||''),requireKnownMoaruUser_:id=>String(id||''),requireKnownMoaruUserCached_:id=>String(id||''),shopJson_:x=>x,
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},CacheService:{getScriptCache:()=>({remove:()=>{}})},
 SHEET_ID:'sheet',REWARD_SHEET:'보상',SpreadsheetApp:{openById:()=>({getSheetByName:()=>({})})},getOrCreateShopInventorySheet_:()=>({}),
 getOrCreateShopPurchaseLogSheet_:()=>({appendRow:r=>{if(state.failLog)throw new Error('LOG_FAIL');state.logs.push({purchaseKey:r[0],userId:r[1],productId:r[2],productName:r[3],price:r[4],beforeCoin:r[5],newCoin:r[6]})}}),
 findShopPurchase_:(_,key)=>state.logs.find(x=>x.purchaseKey===key)||null,
 readShopCatalog_:()=>state.catalog,
 writeShopProduct_:p=>{state.catalog[p.id]=normalize(p)},
 normalizeShopProduct_:normalize,
 createPurchasedInventory_:(user,p,key)=>{if(state.inventory.has(key))return state.inventory.get(key);const item={id:'inv-'+state.inventory.size,productId:p.id,name:p.name,price:p.price,purchaseKey:key};state.inventory.set(key,item);return item},
 createFreshPurchasedInventory_:(user,p,key)=>{const item={id:'inv-'+state.inventory.size,productId:p.id,name:p.name,price:p.price,purchaseKey:key};state.inventory.set(key,item);return item},
 clearPendingShopPurchase_:()=>{},rememberPendingShopPurchase_:()=>{},moaruSpreadsheetRetry_:fn=>fn(),isNaN,parseInt,Number,String,Object,Date,
};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.findRewardUserForShop_=()=>({coin:state.coin});
ctx.setRewardCoinForShopGuarded_=(_,newCoin)=>{const next=Number(newCoin);if(next<state.coin)state.deductions++;else if(next>state.coin)state.adds++;state.coin=next;return{success:true,newCoin:next}};
const call=params=>ctx.handleShopPurchase({parameter:params});
const reset=(coin=20)=>{state.catalog={};state.coin=coin;state.logs=[];state.inventory=new Map();state.deductions=0;state.adds=0;state.failLog=false};
const ok=(v,m)=>{if(!v)throw new Error(m)};

// 수량 2: 구매할 때마다 1씩 차감하고 0에서 품절.
reset();state.catalog={a:{id:'a',name:'한정',description:'d',price:5,quantity:2,updatedAt:7,active:true}};
let r=call({user_id:'u',product_id:'a',price:'5',expected_name:'한정',expected_description:'d',expected_updated_at:'7',purchase_key:'k1'});
ok(r.ok&&r.remaining_quantity===1&&state.catalog.a.quantity===1&&state.coin===15,'first limited purchase did not decrement stock');
r=call({user_id:'u',product_id:'a',price:'5',expected_name:'한정',expected_description:'d',expected_updated_at:'7',purchase_key:'k2'});
ok(r.ok&&r.remaining_quantity===0&&state.catalog.a.quantity===0&&state.coin===10,'second limited purchase did not reach sold out');
r=call({user_id:'u',product_id:'a',price:'5',expected_name:'한정',expected_description:'d',expected_updated_at:'7',purchase_key:'k3'});
ok(!r.ok&&r.error==='PRODUCT_SOLD_OUT'&&state.catalog.a.quantity===0&&state.coin===10,'sold-out direct purchase was allowed or charged');

// 같은 purchaseKey 재시도는 재고/코인 추가 차감 금지.
r=call({user_id:'u',product_id:'a',price:'5',expected_name:'한정',expected_description:'d',expected_updated_at:'7',purchase_key:'k2'});
ok(r.ok&&r.applied===false&&state.catalog.a.quantity===0&&state.coin===10,'duplicate purchase decremented stock or coin twice');

// 수량 미입력 상품은 기존처럼 무제한이며 차감하지 않음.
reset();state.catalog={u:{id:'u',name:'무제한',description:'d',price:4,updatedAt:1,active:true}};
r=call({user_id:'u',product_id:'u',price:'4',expected_name:'무제한',expected_description:'d',expected_updated_at:'1',purchase_key:'unlimited'});
ok(r.ok&&r.remaining_quantity===null&&state.catalog.u.quantity===undefined&&state.coin===16,'unlimited product behavior changed');

// 랜덤뽑기는 품절 상품을 후보에서 제외.
reset();state.catalog={sold:{id:'sold',name:'품절',price:1,quantity:0,active:true},live:{id:'live',name:'재고',price:9,quantity:1,active:true}};ctx.Math.random=()=>0;
r=call({user_id:'u',random_purchase:'1',price:'3',purchase_key:'random1'});
ok(r.ok&&r.product_id==='live'&&state.catalog.live.quantity===0&&state.coin===17,'random purchase selected sold-out item or failed to decrement winner');
r=call({user_id:'u',random_purchase:'1',price:'3',purchase_key:'random2'});
ok(!r.ok&&r.error==='NO_RANDOM_PRODUCTS'&&state.coin===17,'random purchase did not stop when all limited stock sold out');

// 구매로그 저장 실패 시 코인과 재고 모두 원복.
reset();state.catalog={a:{id:'a',name:'롤백',description:'d',price:5,quantity:1,updatedAt:4,active:true}};state.failLog=true;
r=call({user_id:'u',product_id:'a',price:'5',expected_name:'롤백',expected_description:'d',expected_updated_at:'4',purchase_key:'fail-log'});
ok(!r.ok&&r.error==='PURCHASE_LOG_FAILED'&&state.catalog.a.quantity===1&&state.coin===20,'log failure did not rollback stock and coin');

console.log('SHOPPING_STOCK_QUANTITY_OK');
