/* 상품 카탈로그·구매·보관함·선물의 서버 동기화를 UI에서 분리합니다. */
MiniTalk.Shopping = MiniTalk.Shopping || {};
MiniTalk.Shopping.StoreService = (() => {
  const USED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
  const CATALOG_CACHE_KEY = "shop.catalog.cache.v2";
  const objectValue = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  let catalogPromise = null, catalogLoadedAt = 0, inventoryPromise = null, activeUserId = "", inventoryVersion = 0, shopActive = false, inventoryDirty = true;
  const pendingPurchaseKeys = new Map();
  const pendingGiftKeys = new Map();
  const pendingDeliveryKeys = new Map();

  function user() { return MiniTalk.Store.get("user") || {}; }
  function requireLogin() { const current=user();if(!current.user_id||current.isGuest)throw new Error("로그인 후 이용할 수 있어요.");return current; }
  function normalizeProduct(product={}) { const rawQuantity=product.quantity??product.stock??null,hasQuantity=rawQuantity!==null&&rawQuantity!==undefined&&String(rawQuantity).trim()!=="",quantity=hasQuantity?Math.max(0,Math.floor(Number(rawQuantity)||0)):null;return { id:String(product.id||""),name:String(product.name||"").trim().slice(0,60),description:String(product.description||"").trim().slice(0,160),imageUrl:String(product.imageUrl||product.image_url||"").trim().slice(0,7200),price:Math.max(1,Math.floor(Number(product.price)||0)),quantity,updatedAt:Number(product.updatedAt)||0 }; }
  function isSoldOut(product){return product?.quantity!==null&&product?.quantity!==undefined&&Number(product.quantity)<=0}
  function patchProductQuantity(productId,quantity){if(quantity===undefined)return;const catalog={...objectValue(MiniTalk.Store.get("shopCatalog"))},current=catalog[productId];if(!current)return;catalog[productId]=normalizeProduct({...current,quantity});writeCatalog(catalog);catalogLoadedAt=Date.now()}
  function normalizeInventory(item={}) { const product=objectValue(MiniTalk.Store.get("shopCatalog"))[item.productId]||{};const status=String(item.deliveryStatus||item.delivery_status||"").trim().toLowerCase();return{...item,id:String(item.id||""),productId:String(item.productId||""),name:item.name||product.name||"상품",description:item.description||product.description||"",imageUrl:item.imageUrl||product.imageUrl||"",price:Number(item.price||product.price)||0,deliveryStatus:["owned","requested","shipping","completed","cancelled"].includes(status)?status:(item.usedAt?"completed":"owned"),deliveryRequestedAt:Number(item.deliveryRequestedAt||item.delivery_requested_at)||0,deliveryCompletedAt:Number(item.deliveryCompletedAt||item.delivery_completed_at)||0,deliveryCancelledAt:Number(item.deliveryCancelledAt||item.delivery_cancelled_at)||0,deliveryHandledBy:String(item.deliveryHandledBy||item.delivery_handled_by||"")}; }

  function writeCatalog(catalog) { const current=objectValue(MiniTalk.Store.get("shopCatalog"));if(sameValue(current,catalog))return false;MiniTalk.Store.set("shopCatalog",catalog);MiniTalk.Persistence.set(CATALOG_CACHE_KEY,catalog);return true; }
  function hydrateCatalogCache() { const cached=objectValue(MiniTalk.Persistence.get(CATALOG_CACHE_KEY,{}));if(Object.keys(cached).length&&!Object.keys(objectValue(MiniTalk.Store.get("shopCatalog"))).length)MiniTalk.Store.set("shopCatalog",cached); }
  hydrateCatalogCache();

  MiniTalk.Events.on("rt:command",command=>{if(!["SHOP_GIFT","SHOP_DELIVERY_SHIPPING","SHOP_DELIVERY_COMPLETED","SHOP_DELIVERY_CANCELLED"].includes(command?.type))return;inventoryDirty=true;refreshInventory(true).catch(error=>console.warn("쇼핑 보관함 갱신 실패",error))});

  // Firebase 호환 보관함과 Apps Script 보관함을 합쳐 기존 구매품을 잃지 않습니다.
  MiniTalk.Events.on("rt:shop-inventory", value=>{const current=objectValue(MiniTalk.Store.get("shopInventory")),merged={...current,...objectValue(value)};if(!sameValue(current,merged))MiniTalk.Store.set("shopInventory",merged)});

  function products() { return Object.values(objectValue(MiniTalk.Store.get("shopCatalog"))).map(normalizeProduct).filter(item=>item.id&&item.name&&item.price>0).sort((a,b)=>a.price-b.price||a.name.localeCompare(b.name,"ko")); }
  async function refreshCatalog(force=false) {
    hydrateCatalogCache();
    if(!force&&Date.now()-catalogLoadedAt<30000)return products();
    if(catalogPromise)return catalogPromise;
    catalogPromise=MiniTalk.AuthApi.shopCatalog().then(rows=>{const catalog={};rows.map(normalizeProduct).filter(item=>item.id&&item.name&&item.price>0).forEach(item=>{catalog[item.id]=item});catalogLoadedAt=Date.now();writeCatalog(catalog);return products()}).finally(()=>{catalogPromise=null});
    return catalogPromise;
  }

  function inventoryCacheKey(userId){return`shop.inventory.server.${userId}`}
  function seenGiftKey(userId){return`shop.gifts.seen.${userId}`}
  function publishInventory(rows,current){
    const catalog=objectValue(MiniTalk.Store.get("shopCatalog")),server={};
    rows.map(normalizeInventory).filter(item=>item.id).forEach(item=>{server[item.id]={...item,imageUrl:item.imageUrl||catalog[item.productId]?.imageUrl||""}});
    const local=objectValue(MiniTalk.Store.get("shopInventory")),serverPurchaseKeys=new Set(Object.values(server).map(item=>String(item?.purchaseKey||"")).filter(Boolean)),pending=Object.fromEntries(Object.entries(local).filter(([,item])=>item?.pendingSync&&!serverPurchaseKeys.has(String(item.purchaseKey||""))));
    // Apps Script에 같은 purchaseKey가 확인된 상품은 예전 Realtime 로컬 mirror에서 제거합니다.
    // 서버에 없는 구형 local-only 상품은 건드리지 않아 마이그레이션 전 보유품을 잃지 않습니다.
    MiniTalk.Realtime.pruneShopInventoryMirror?.(current.user_id,[...serverPurchaseKeys]);
    const merged={...pending,...server},previous=objectValue(MiniTalk.Store.get("shopInventory"));if(!sameValue(previous,merged)){MiniTalk.Store.set("shopInventory",merged);MiniTalk.Persistence.set(inventoryCacheKey(current.user_id),merged)}
    const seen=new Set(MiniTalk.Persistence.get(seenGiftKey(current.user_id),[])||[]);let changed=false;
    Object.values(server).filter(item=>item.giftedAt&&!seen.has(item.id)).forEach(item=>{seen.add(item.id);changed=true;MiniTalk.Tools.Notifications?.notifyGift?.(item)});
    if(changed)MiniTalk.Persistence.set(seenGiftKey(current.user_id),[...seen].slice(-300));
    return inventory();
  }
  async function refreshInventory(force=false) {
    const current=user();if(!current.user_id||current.isGuest)return[];
    const currentUserId=String(current.user_id);
    // 로그인 직후 start()보다 보관함 갱신이 먼저 호출되어도 첫 응답을 버리지 않습니다.
    // 다른 계정으로 바뀐 경우에는 이전 계정의 진행 중 응답을 무효화하고 새 캐시로 교체합니다.
    if(activeUserId!==currentUserId){const hadActiveUser=!!activeUserId;inventoryVersion++;inventoryPromise=null;activeUserId=currentUserId;if(hadActiveUser)MiniTalk.Store.set("shopInventory",objectValue(MiniTalk.Persistence.get(inventoryCacheKey(activeUserId),{})))}
    if(!force&&inventoryPromise)return inventoryPromise;
    const version=inventoryVersion,request=MiniTalk.AuthApi.shopInventory(currentUserId).then(rows=>{if(version!==inventoryVersion||activeUserId!==currentUserId)return[];inventoryDirty=false;return publishInventory(rows,current)});
    inventoryPromise=request.finally(()=>{if(version===inventoryVersion)inventoryPromise=null});
    return inventoryPromise;
  }
  function start(current=user()) {
    /* Firebase 상품/피드/방 데이터를 상시 읽지 않는 최적화는 유지합니다.
     * Apps Script 보관함은 기존 안정 동작처럼 15초마다 확인해 선물/사용 상태 누락을 빠르게 복구합니다. */
    hydrateCatalogCache();shopActive=false;inventoryDirty=true;
    const nextUserId=!current.user_id||current.isGuest?"":String(current.user_id);
    if(activeUserId!==nextUserId){inventoryVersion++;inventoryPromise=null;activeUserId=nextUserId;const cached=activeUserId?objectValue(MiniTalk.Persistence.get(inventoryCacheKey(activeUserId),{})):{};MiniTalk.Store.set("shopInventory",cached)}
    if(!activeUserId)return;
    refreshInventory(true).catch(error=>console.warn("보관함을 불러오지 못했습니다.",error));
  }
  async function enter(){
    shopActive=true;const current=user();hydrateCatalogCache();
    const jobs=[refreshCatalog(false).catch(error=>{console.warn("상품 목록을 불러오지 못했습니다.",error);return products()})];
    if(current.user_id&&!current.isGuest&&(inventoryDirty||!Object.keys(objectValue(MiniTalk.Store.get("shopInventory"))).length))jobs.push(refreshInventory(true).then(rows=>{inventoryDirty=false;return rows}).catch(error=>{console.warn("보관함을 불러오지 못했습니다.",error);return inventory()}));
    return Promise.all(jobs)
  }
  function leave(){shopActive=false}

  async function saveProduct(product) { const current=requireLogin(),value=normalizeProduct({...product,id:product?.id||crypto.randomUUID(),updatedAt:Date.now()});if(!value.name||value.price<=0)throw new Error("상품 이름과 가격을 입력하세요.");const result=await MiniTalk.AuthApi.shopSaveProduct(current.user_id,MiniTalk.AdminSession.requireToken("SHOP"),value),saved=normalizeProduct({...value,...(result.product||{}),imageUrl:result.product?.imageUrl||result.product?.image_url||value.imageUrl});writeCatalog({...objectValue(MiniTalk.Store.get("shopCatalog")),[saved.id]:saved});catalogLoadedAt=Date.now();return saved; }
  async function deleteProduct(id) { const current=requireLogin();await MiniTalk.AuthApi.shopDeleteProduct(current.user_id,MiniTalk.AdminSession.requireToken("SHOP"),id);const catalog={...objectValue(MiniTalk.Store.get("shopCatalog"))};delete catalog[id];writeCatalog(catalog);catalogLoadedAt=Date.now(); }
  function inventory(now=Date.now()) { return Object.values(objectValue(MiniTalk.Store.get("shopInventory"))).map(normalizeInventory).filter(item=>!item.usedAt||now-Number(item.usedAt)<USED_VISIBLE_MS).sort((a,b)=>Number(b.createdAt||b.giftedAt||0)-Number(a.createdAt||a.giftedAt||0)); }
  function usedRemainingDays(item,now=Date.now()){return item?.usedAt?Math.max(0,Math.ceil((USED_VISIBLE_MS-(now-Number(item.usedAt)))/86400000)):0}
  function recipients(){return MiniTalk.UserDirectory?.all?.()||[]}
  function isActiveUser(current){const live=user();return Boolean(current?.user_id)&&!live.isGuest&&String(live.user_id||"")===String(current.user_id)}
  function persistInventoryMap(current,items){MiniTalk.Persistence.set(inventoryCacheKey(current.user_id),items);if(isActiveUser(current))MiniTalk.Store.set("shopInventory",items)}
  function putLocalInventory(current,item){if(!item?.id||!isActiveUser(current))return null;const items={...objectValue(MiniTalk.Store.get("shopInventory"))},saved=normalizeInventory(item);items[saved.id]=saved;persistInventoryMap(current,items);return saved}
  function removeLocalInventory(current,id){if(!isActiveUser(current))return;const items={...objectValue(MiniTalk.Store.get("shopInventory"))};if(!Object.prototype.hasOwnProperty.call(items,id))return;delete items[id];persistInventoryMap(current,items)}
  function syncInventoryLater(tasks){Promise.allSettled((tasks||[]).map(task=>Promise.resolve().then(task))).then(results=>{results.forEach(result=>{if(result.status==="rejected")console.warn("쇼핑 보관함 백그라운드 동기화 실패",result.reason)})})}

  async function purchase(product) {
    const current=requireLogin(),item=normalizeProduct(product);if(!item.id||!item.name||!item.price)throw new Error("구매할 상품 정보가 올바르지 않습니다.");
    const pendingKey=`${current.user_id}:${item.id}`,purchaseKey=pendingPurchaseKeys.get(pendingKey)||`${pendingKey}:${crypto.randomUUID()}`;pendingPurchaseKeys.set(pendingKey,purchaseKey);
    let result;
    try {
      // 별도 사전 조회 없이 기존 구매 요청에 화면의 상품 개정 정보를 함께 보냅니다.
      result=await MiniTalk.AuthApi.shopPurchase({userId:current.user_id,product:item,purchaseKey});
      patchProductQuantity(item.id,result.remaining_quantity);
    } catch(error) {
      if(["PRODUCT_CHANGED","PRICE_CHANGED","PRODUCT_NOT_AVAILABLE","PRODUCT_SOLD_OUT"].includes(error?.code)) {
        await refreshCatalog(true).catch(()=>{});
        pendingPurchaseKeys.delete(pendingKey);
        error.productChanged=true;
      }
      throw error;
    }
    const stored=result.item||{productId:item.id,name:item.name,description:item.description,imageUrl:item.imageUrl,price:item.price,purchaseKey,purchasedAt:Date.now(),createdAt:Date.now()};
    if(result.item)putLocalInventory(current,result.item);
    const balance=result.newCoin??result.coin??result.balance;if(balance!=null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.setLocal(balance,"purchase");
    pendingPurchaseKeys.delete(pendingKey);
    if(!isActiveUser(current))return result;
    if(result.inventory_pending||!result.item){
      // 서버 구매는 확정됐지만 보관함 기록만 지연된 경우에는 서버 캐시에 임시 항목을 남겨 화면에서 사라지지 않게 합니다.
      // Realtime fallback 저장소에는 새 구매품을 복제하지 않습니다. 그 저장소는 영구 동기화되지 않아 오래된 상품이 다시 나타날 수 있습니다.
      const pendingItem={...stored,id:`pending-${crypto.randomUUID()}`,pendingSync:true};putLocalInventory(current,pendingItem);
      if(isActiveUser(current))await refreshInventory(true).catch(()=>{});
      if(balance==null&&isActiveUser(current))await MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
      return result;
    }
    // Apps Script 보관함이 권위 저장소입니다. 정상 구매는 이미 반환된 item을 즉시 표시하고 서버 재확인만 뒤에서 수행합니다.
    syncInventoryLater([async()=>{if(isActiveUser(current))await refreshInventory(true)}]);
    if(balance==null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
    return result;
  }
  async function randomPurchase() {
    const current=requireLogin();
    const available=products().filter(product=>!isSoldOut(product));
    if(!available.length)throw new Error("추첨할 상품이 아직 없습니다.");
    const pendingKey=`${current.user_id}:random`,purchaseKey=pendingPurchaseKeys.get(pendingKey)||`${pendingKey}:${crypto.randomUUID()}`;
    pendingPurchaseKeys.set(pendingKey,purchaseKey);
    let result;
    try {
      result=await MiniTalk.AuthApi.shopPurchase({userId:current.user_id,product:null,purchaseKey,randomPurchase:true,price:3});
      if(result.product_id)patchProductQuantity(result.product_id,result.remaining_quantity);
    } catch(error) {
      if(["PRODUCT_NOT_AVAILABLE","NO_RANDOM_PRODUCTS"].includes(error?.code))await refreshCatalog(true).catch(()=>{});
      if(error?.code!=="REQUEST_TIMEOUT")pendingPurchaseKeys.delete(pendingKey);
      throw error;
    }
    const won=normalizeProduct({
      id:result.product_id||result.item?.productId,
      name:result.product_name||result.item?.name,
      description:result.product_description||result.item?.description||"",
      imageUrl:result.product_image_url||result.item?.imageUrl||"",
      price:result.original_price||result.item?.originalPrice||result.item?.price||3,
      updatedAt:result.product_updated_at||0
    });
    const stored=result.item||{productId:won.id,name:won.name,description:won.description,imageUrl:won.imageUrl,price:3,purchaseKey,purchasedAt:Date.now(),createdAt:Date.now()};
    if(result.item)putLocalInventory(current,result.item);
    const balance=result.newCoin??result.coin??result.balance;
    if(balance!=null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.setLocal(balance,"random-purchase");
    pendingPurchaseKeys.delete(pendingKey);
    if(!isActiveUser(current))return {...result,product:won,item:stored};
    if(result.inventory_pending||!result.item){
      const pendingItem={...stored,id:`pending-${crypto.randomUUID()}`,pendingSync:true};putLocalInventory(current,pendingItem);
      if(isActiveUser(current))await refreshInventory(true).catch(()=>{});
      if(balance==null&&isActiveUser(current))await MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
      return {...result,product:won,item:stored};
    }
    syncInventoryLater([async()=>{if(isActiveUser(current))await refreshInventory(true)}]);
    if(balance==null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
    return {...result,product:won,item:stored};
  }
  async function use(id) { const current=requireLogin(),item=inventory().find(row=>row.id===id);if(!item||item.usedAt)throw new Error("사용할 수 없는 상품입니다.");const result=await MiniTalk.AuthApi.shopUse({userId:current.user_id,inventoryId:id,item}),usedAt=Number(result.usedAt)||Date.now();try{await MiniTalk.Realtime.useShopInventory(id,usedAt)}catch(error){console.warn("Firebase 보관함 사용 상태 동기화 실패",error)}await refreshInventory(true);return usedAt; }
  async function requestDelivery(id) {
    const current=requireLogin(),item=inventory().find(row=>row.id===id);
    if(!item)throw new Error("배송 요청할 상품을 찾을 수 없습니다.");
    if(item.usedAt||item.deliveryStatus==="completed")throw new Error("이미 배송이 완료된 상품입니다.");
    if(item.deliveryStatus==="requested"||item.deliveryStatus==="shipping")throw new Error("이미 배송이 진행 중입니다.");
    const pendingKey=`${current.user_id}:${id}`,requestId=pendingDeliveryKeys.get(pendingKey)||crypto.randomUUID(),previous={...item};
    pendingDeliveryKeys.set(pendingKey,requestId);
    // 클릭 직후 보관함 카드부터 요청 상태로 바꿔 서버 왕복 시간을 UI 반응시간으로 느끼지 않게 합니다. 실패하면 원래 상태로 되돌립니다.
    putLocalInventory(current,{...item,deliveryStatus:"requested",deliveryRequestedAt:Date.now(),deliveryPending:true});
    try {
      const result=await MiniTalk.AuthApi.shopRequestDelivery({userId:current.user_id,inventoryId:id,item,requestId});
      putLocalInventory(current,{...(result.item||item),deliveryStatus:result.deliveryStatus||result.item?.deliveryStatus||"requested",deliveryRequestedAt:Number(result.deliveryRequestedAt||result.item?.deliveryRequestedAt)||Date.now(),deliveryPending:false});
      // 서버 재검증은 화면 응답을 막지 않고 백그라운드에서 수행합니다.
      if(isActiveUser(current))refreshInventory(true).catch(()=>{});
      return result;
    } catch(error) {
      putLocalInventory(current,previous);
      throw error;
    } finally {
      pendingDeliveryKeys.delete(pendingKey);
    }
  }
  async function gift(id,targetId) {
    const current=requireLogin(),item=inventory().find(row=>row.id===id);
    if(!item||item.usedAt||item.deliveryStatus==="completed"||item.deliveryStatus==="requested"||item.deliveryStatus==="shipping")throw new Error("선물할 수 없는 상품입니다.");
    const target=recipients().find(row=>row.user_id===targetId);if(!target)throw new Error("선물할 사용자를 찾을 수 없습니다.");
    const pendingKey=`${current.user_id}:${id}:${target.user_id}`,requestId=pendingGiftKeys.get(pendingKey)||crypto.randomUUID(),previous={...item};pendingGiftKeys.set(pendingKey,requestId);
    // 선물 버튼을 누른 즉시 보관함에서 감춰 체감 지연을 없애고, 서버 실패 시 그대로 복구합니다.
    removeLocalInventory(current,id);
    try {
      await MiniTalk.AuthApi.shopGift({userId:current.user_id,nickname:current.nickname,targetId:target.user_id,inventoryId:id,item,requestId});
    } catch(error) {
      putLocalInventory(current,previous);
      // 실패 재시도는 같은 requestId를 재사용해야 서버의 중복 선물 방지 영수증과 정합성이 맞습니다.
      throw error;
    }
    pendingGiftKeys.delete(pendingKey);
    if(!isActiveUser(current))return{targetId:target.user_id,targetNickname:target.nickname};
    MiniTalk.Realtime.notifyCommandTargets?.([target.user_id]);
    syncInventoryLater([async()=>{if(!isActiveUser(current))return;await MiniTalk.Realtime.removeShopInventory?.(id,current.user_id);if(isActiveUser(current))await refreshInventory(true)}]);
    return{targetId:target.user_id,targetNickname:target.nickname};
  }

  return{products,refreshCatalog,refreshInventory,start,enter,leave,saveProduct,deleteProduct,inventory,recipients,purchase,randomPurchase,use,requestDelivery,gift,normalizeProduct,normalizeInventory,isSoldOut,usedRemainingDays,requireLogin,USED_VISIBLE_MS};
})();
