const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const admin=read('js/features/admin.js'),rt=read('js/adapters/realtime.js'),tasks=read('js/tasks/task-service.js'),shop=read('js/shopping/store-service.js'),server=read('docs/apps-script/coin-shopping-extension.gs'),index=read('index.html'),sw=read('sw.js');
// 관리자 화면은 코인 잔액 네트워크 조회 때문에 전체 화면을 차단하면 안 됩니다.
ok(!admin.includes('if(!balanceLoaded||balanceOwner!==String(MiniTalk.Store.get("user")?.user_id||""))'),'admin screen still blocks on coin balance fetch');
ok(admin.includes('if(coin&&!balanceLoaded&&!balanceInFlight)')&&admin.includes('loadBalances(false).then'),'coin balance is not lazy/background loaded');
// 전체 관리자 기능은 클라이언트와 서버에서 ADMIN 전용이어야 합니다.
ok((rt.match(/requireToken\("ADMIN"\)/g)||[]).length>=3,'realtime admin command paths are not explicitly ADMIN-only');
ok((tasks.match(/requireToken\("ADMIN"\)/g)||[]).length>=5,'task admin paths are not explicitly ADMIN-only');
for(const fn of ['handleAdminDispatch','handleAdminUserBalances','handleAdminCoinReward','handleAdminTaskAssign','handleAdminTaskList','handleAdminTaskReview','handleAdminTaskBulkReview','handleAdminTaskBulkDelete']){
  const at=server.indexOf('function '+fn+'(e)');ok(at>=0,fn+' missing');const body=server.slice(at,server.indexOf('\n}',at)+2);ok(body.includes('requireAdminToken_('),fn+' is not ADMIN-only');
}
// 쇼핑몰 관리자는 상품/배송에 계속 접근 가능해야 합니다.
for(const fn of ['handleShopProductSave','handleShopProductDelete','handleShopDeliveryList']){
  const at=server.indexOf('function '+fn+'(e)');ok(at>=0,fn+' missing');const body=server.slice(at,server.indexOf('\n}',at)+2);ok(body.includes('requireShopManagerToken_('),fn+' lost SHOP_MANAGER access');
}
ok(shop.includes('requireToken("SHOP")'),'shopping manager client path does not request SHOP permission');
// 사용자 과제 조회/제출은 로그인 캐시를 사용해 주기적 로그인 시트 읽기를 피합니다.
for(const fn of ['handleUserTaskList','handleUserTaskSubmit']){
  const at=server.indexOf('function '+fn+'(e)');const body=server.slice(at,server.indexOf('\n}',at)+2);ok(body.includes('requireKnownMoaruUserCached_('),fn+' still re-reads login sheet');
}
ok(tasks.includes('setInterval(() => refresh(true).catch(() => {}), 30000)'),'task fallback polling was not reduced');
ok(admin.includes('},30000);load();return section'),'admin task review fallback polling was not reduced');
// 변경 에셋 캐시 버전 동기화
for(const ref of ['js/adapters/realtime.js?v=64.5.47','js/shopping/store-service.js?v=64.5.25','js/tasks/task-service.js?v=64.5.26','js/features/admin.js?v=64.5.38'])ok(index.includes(ref),'cache ref missing '+ref);
ok(sw.includes('moaru-moa-dialogue-fusion-final'),'v104 service worker cache missing');
console.log('V104_ADMIN_ALL_FASTPATH_OK');
