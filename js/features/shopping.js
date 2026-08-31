/* 쇼핑 탭: 관리자 상품 카탈로그와 사용자 보관함을 표시합니다. */
MiniTalk.Features.Shopping = (() => {
  const Service = MiniTalk.Shopping.StoreService;
  let inventoryOpen = false, refreshTimer = 0, randomOverlay = null, randomArrivalId = "";

  const DELIVERY_AUDIO_URLS = ['assets/sounds/delivery-order-1.mp3', 'assets/sounds/delivery-order-2.mp3'];
  const DELIVERY_MASCOT_URL = 'assets/mascot-mini-talk.png';
  const deliveryAudioPool = new Map();
  let deliveryMascotPreload = null;

  // 쇼핑 화면이 Document PiP/별도 문서로 옮겨져도 미디어는 앱 원본 URL 기준으로 찾습니다.
  function appAssetUrl(path) {
    try { return new URL(String(path || ''), document.baseURI || location.href).href; }
    catch (_) { return String(path || ''); }
  }

  function preloadDeliveryMedia() {
    DELIVERY_AUDIO_URLS.forEach(path => {
      const src = appAssetUrl(path);
      if (deliveryAudioPool.has(src)) return;
      try {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.load?.();
        deliveryAudioPool.set(src, audio);
      } catch (_) {}
    });
    if (!deliveryMascotPreload) {
      try {
        deliveryMascotPreload = new Image();
        deliveryMascotPreload.decoding = 'async';
        deliveryMascotPreload.src = appAssetUrl(DELIVERY_MASCOT_URL);
      } catch (_) {}
    }
  }

  // 네트워크 요청을 await하기 전에 사용자 클릭 제스처 안에서 오디오 엘리먼트를 한 번 활성화합니다.
  // 볼륨 0으로 시작하므로 성공 확인 전 음성은 들리지 않습니다.
  function primeDeliveryAudio(soundUrls = DELIVERY_AUDIO_URLS) {
    const paths = Array.isArray(soundUrls) && soundUrls.length ? soundUrls : DELIVERY_AUDIO_URLS;
    const sources = paths.map(appAssetUrl);
    const src = sources[Math.floor(Math.random() * sources.length)] || sources[0];
    if (!src) return null;
    try {
      // 배송 요청마다 전용 Audio 인스턴스를 사용합니다. 여러 상품을 빠르게 연속 주문해도
      // 같은 풀 오디오의 currentTime/loop/volume을 서로 덮어쓰지 않게 합니다.
      const preload = deliveryAudioPool.get(src);
      const audio = preload?.cloneNode ? preload.cloneNode(true) : new Audio(src);
      audio.preload = 'auto';
      const prime = { audio, src, released: false };
      try { audio.currentTime = 0; } catch (_) {}
      audio.loop = true;
      audio.volume = 0;
      // 요청이 끝날 때까지 무음 재생을 유지해 사용자 클릭에서 얻은 재생 상태를 끊지 않습니다.
      Promise.resolve(audio.play()).catch(() => {});
      return prime;
    } catch (_) { return null; }
  }

  MiniTalk.Events.on("state:shopCatalog", refreshVisible);
  MiniTalk.Events.on("state:shopInventory", refreshVisible);

  function refreshVisible() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      const route = MiniTalk.Store.get("route"), host = MiniTalk.UI.Dom.byId("viewHost");
      if (route === "shopping" && host) patchVisible(host);
    }, 140);
  }

  function patchVisible(host) {
    const D = MiniTalk.UI.Dom, screen = host.querySelector(".shopping-screen"), view = host.querySelector(".shopping-view");
    if (!screen || !view) return render(host, { animate: false, preserveScroll: true, refreshCatalog: false });
    const user = MiniTalk.Store.get("user") || {}, products = Service.products(), owned = user.isGuest ? [] : Service.inventory(), scrollTop = screen.scrollTop;
    screen.querySelector(".shop-market-hero")?.replaceWith(shopHero(products.filter(product=>!Service.isSoldOut(product)).length, user.isGuest));
    const catalog = screen.querySelector(".shop-product-grid");
    if (catalog) {
      catalog.classList.toggle("is-empty", !products.length);
      catalog.replaceChildren(...(products.length ? products.map(product => productCard(product, user.isGuest)) : [marketEmpty()]));
    }
    const oldPanel = view.querySelector(".shop-inventory-panel");
    if (inventoryOpen) {
      const panel = inventoryPanel(user, owned, () => { inventoryOpen = false;render(host); });
      oldPanel ? oldPanel.replaceWith(panel) : view.insertBefore(panel, view.querySelector(".shop-inventory-fab"));
    } else oldPanel?.remove();
    const button = D.el("button", { class: `shop-inventory-fab${inventoryOpen ? " active" : ""}`, type: "button", "aria-expanded": String(inventoryOpen), "aria-label": inventoryOpen ? "보관함 닫기" : "보관함 열기", onclick: () => { inventoryOpen = !inventoryOpen;render(host); } }, [D.el("small", { text: "보관함" }), owned.length ? D.el("b", { text: String(owned.length) }) : null].filter(Boolean));
    const oldButton = view.querySelector(".shop-inventory-fab");oldButton ? oldButton.replaceWith(button) : view.append(button);
    screen.scrollTop = scrollTop;
  }

  function render(host, options = {}) {
    preloadDeliveryMedia();
    const D = MiniTalk.UI.Dom, user = MiniTalk.Store.get("user") || {};
    const previousScroll = options.preserveScroll ? Number(host.querySelector(".shopping-screen")?.scrollTop || 0) : 0;
    if (options.refreshCatalog !== false) Service.enter().catch(error=>console.warn("쇼핑 데이터 갱신 실패",error));
    MiniTalk.UI.Shell.setHeader("쇼핑", [MiniTalk.Economy.CoinWallet.badge({ header: true })]);
    const view = D.el("section", { class: `view utility-view shopping-view${options.animate === false ? "" : " view-enter"}` });
    const wrap = D.el("div", { class: "card-list shopping-screen" });
    const products = Service.products();
    wrap.append(shopHero(products.filter(product=>!Service.isSoldOut(product)).length, user.isGuest));
    const catalog = D.el("div", { class: `shop-product-grid${products.length ? "" : " is-empty"}` });
    if (!products.length) catalog.append(marketEmpty());
    products.forEach(product => catalog.append(productCard(product, user.isGuest)));
    wrap.append(catalog);

    const owned = user.isGuest ? [] : Service.inventory();
    const inventoryButton = D.el("button", {
      class: `shop-inventory-fab${inventoryOpen ? " active" : ""}`,
      type: "button",
      "aria-expanded": String(inventoryOpen),
      "aria-label": inventoryOpen ? "보관함 닫기" : "보관함 열기",
      onclick: () => { inventoryOpen = !inventoryOpen; render(host); }
    }, [D.el("small", { text: "보관함" }), owned.length ? D.el("b", { text: String(owned.length) }) : null].filter(Boolean));

    view.append(wrap);
    if (inventoryOpen) view.append(inventoryPanel(user, owned, () => { inventoryOpen = false; render(host); }));
    view.append(inventoryButton);
    host.replaceChildren(view);
    MiniTalk.UI.DragScroll?.bind?.(wrap);
    if (previousScroll > 0) wrap.scrollTop = previousScroll;
  }

  function shopHero(count, guest) {
    const D = MiniTalk.UI.Dom;
    return D.el("button", {
      class: "shop-market-hero shop-random-entry",
      type: "button",
      "aria-label": guest ? "랜덤구매 로그인 필요" : "랜덤구매 열기",
      onclick: () => guest ? MiniTalk.UI.Shell.toast("로그인 후 랜덤구매를 이용할 수 있어요.") : openRandomPurchase()
    }, [
      D.el("span", { class: "shop-market-mark random-mark", text: "?" }),
      D.el("div", { class: "shop-market-copy" }, [
        D.el("strong", { text: "랜덤구매" }),
        D.el("small", { text: guest ? "로그인하고 3코인 랜덤구매를 이용해보세요" : "3코인으로 등록 상품 하나를 무작위로 뽑아요" })
      ]),
      D.el("span", { class: "shop-market-count", text: count ? `${count}개 상품` : "준비 중" })
    ]);
  }

  const RANDOM_COST = 3;
  let randomAudioContext = null;

  function randomAudio() {
    try {
      if (!randomAudioContext) randomAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (randomAudioContext.state === "suspended") randomAudioContext.resume();
      return randomAudioContext;
    } catch (_) { return null; }
  }

  function randomTone(freq, duration=.06, type="square", gainValue=.09, delay=0) {
    const ctx = randomAudio(); if (!ctx) return;
    const at = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, at); gain.gain.setValueAtTime(gainValue, at);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + duration + .02);
  }

  function randomTick() { randomTone(690 + Math.random()*170, .045, "square", .055); }
  function randomWhoosh() { randomTone(145, .42, "sawtooth", .06); randomTone(520, .34, "triangle", .045, .08); }
  function randomBrake() { randomTone(180, .18, "sine", .12); randomTone(910, .05, "square", .06, .06); }
  function randomFanfare() { [523,659,784,1047].forEach((f,i)=>randomTone(f,.35,"triangle",.09,i*.09)); }

  function closeRandomOverlay() {
    if (!randomOverlay) return;
    const state=randomOverlay.__state||{};
    (state.timers||[]).forEach(clearTimeout); if(state.interval)clearInterval(state.interval);try{state.rollAnimation?.cancel?.()}catch{}
    randomOverlay.classList.add("leaving");
    setTimeout(()=>{ randomOverlay?.remove(); randomOverlay=null; }, 240);
  }

  function randomProductCell(product, active=false) {
    const D=MiniTalk.UI.Dom;
    return D.el("div", { class:`shop-random-reel-cell${active?" active":""}` }, [
      product?.imageUrl ? D.el("img", { src:product.imageUrl, alt:"" }) : D.el("span", { class:"shop-random-placeholder", text:"◇" }),
      D.el("strong", { text:product?.name||"?" })
    ]);
  }

  function randomConfetti(doc, host) {
    const shades=["#4f7cff","#70a0ff","#ffd66b","#8d7cff","#ffffff"];
    for(let i=0;i<54;i++){
      const bit=doc.createElement("i"); bit.className="shop-random-confetti";
      bit.style.left=`${6+Math.random()*88}%`; bit.style.setProperty("--fall",`${210+Math.random()*260}px`);
      bit.style.setProperty("--turn",`${Math.floor(Math.random()*780-390)}deg`);
      bit.style.setProperty("--delay",`${Math.random()*.22}s`); bit.style.background=shades[Math.floor(Math.random()*shades.length)];
      host.append(bit); setTimeout(()=>bit.remove(),2600);
    }
  }

  async function openRandomPurchase() {
    const D=MiniTalk.UI.Dom, doc=D.doc(), products=Service.products().filter(product=>!Service.isSoldOut(product));
    if(!products.length){ MiniTalk.UI.Shell.toast("추첨할 상품이 아직 없어요."); return; }

    closeRandomOverlay(); randomAudio();
    const cachedBalance=Number(MiniTalk.Economy.CoinWallet.value?.()||0);
    const overlay=D.el("div", { class:"shop-random-overlay", role:"dialog", "aria-label":"랜덤구매" });
    const card=D.el("section", { class:"shop-random-machine" });
    const top=D.el("div", { class:"shop-random-top" }, [
      D.el("span", { class:"shop-random-kicker", text:"랜덤 뽑기" }),
      D.el("span", { class:"shop-random-cost" }, [coinAmount(RANDOM_COST,"coin-amount"),D.el("i",{class:"shop-random-cost-divider",text:"/","aria-hidden":"true"}),D.el("small",{text:"1회"})])
    ]);
    const windowEl=D.el("div", { class:"shop-random-window" });
    const strip=D.el("div", { class:"shop-random-strip" });
    const tap=D.el("div", { class:"shop-random-tap" }, [D.el("strong",{text:"눌러서 뽑기"}),D.el("small",{text:"3코인 · 한 번 뽑기"})]);
    const status=D.el("div", { class:"shop-random-status" }, [D.el("strong",{text:""}),D.el("small",{text:""})]);
    const footer=D.el("small",{class:"shop-random-foot",text:`현재 ${products.length}개 상품 중 하나가 나와요`});
    windowEl.append(strip,tap); card.append(top,windowEl,status,footer); overlay.append(card);
    const state={phase:cachedBalance<RANDOM_COST?"insufficient":"ready",products,timers:[],result:null,winner:null,resultId:"",rollAnimation:null,startedAt:0,settling:false,fastRequested:false};
    overlay.__state=state; randomOverlay=overlay;

    const setStatus=(title="",sub="")=>{status.querySelector("strong").textContent=title;status.querySelector("small").textContent=sub;status.classList.toggle("active",Boolean(title||sub));};
    const randomProduct=()=>products[Math.floor(Math.random()*products.length)];
    const cellHeight=()=>Math.max(96,windowEl.clientHeight/3);
    const sizeCells=()=>{const h=cellHeight();strip.querySelectorAll(".shop-random-reel-cell").forEach(el=>el.style.height=`${h}px`);return h;};
    const seedReel=()=>{
      const seq=Array.from({length:7},randomProduct);strip.replaceChildren(...seq.map(randomProductCell));
      const h=sizeCells();strip.style.transform=`translateY(${-2*h}px)`;
    };
    const showInsufficient=()=>{
      state.phase="insufficient";try{state.rollAnimation?.cancel?.()}catch{};state.rollAnimation=null;
      overlay.classList.remove("spinning","result","error");overlay.classList.add("insufficient");strip.replaceChildren();tap.replaceChildren(D.el("strong",{text:"코인이 부족해요"}),D.el("small",{text:"화면을 누르면 닫혀요"}));setStatus();
    };
    seedReel();
    if(state.phase==="insufficient")showInsufficient();
    doc.body.append(overlay);requestAnimationFrame(()=>overlay.classList.add("show"));

    MiniTalk.Economy.CoinWallet.refresh(true).then(balance=>{if(randomOverlay!==overlay||state.phase!=="ready")return;if(Number(balance)<RANDOM_COST)showInsufficient()}).catch(()=>{});

    const buildRollingStrip=()=>{
      const seq=Array.from({length:90},randomProduct);strip.replaceChildren(...seq.map(randomProductCell));
      const h=sizeCells();strip.style.transform="translateY(0px)";
      return h;
    };
    const startRolling=()=>{
      const h=buildRollingStrip();state.startedAt=performance.now();state.phase="spinning";overlay.classList.add("spinning");tap.classList.add("hidden");setStatus("돌아가는 중","한 번 더 누르면 바로 뽑아요");randomWhoosh();
      const distance=h*72;
      state.rollAnimation=strip.animate([{transform:"translateY(0px)"},{transform:`translateY(${-distance}px)`}],{duration:9000,easing:"linear",fill:"forwards"});
      for(let i=0;i<34;i++)state.timers.push(setTimeout(randomTick,60+i*92));
    };
    const movePrizeToInventory=()=>{
      if(state.phase!=="result")return;state.phase="closing";
      const prize=windowEl.querySelector(".shop-random-reel-cell.active");prize?.classList.add("fly-to-inventory");overlay.classList.add("prize-leaving");randomArrivalId=state.resultId||"";
      state.timers.push(setTimeout(()=>{closeRandomOverlay();inventoryOpen=true;const host=MiniTalk.UI.Dom.byId("viewHost");if(host&&MiniTalk.Store.get("route")==="shopping")render(host,{animate:false,refreshCatalog:false});setTimeout(()=>{randomArrivalId="";},1800)},560));
    };
    const showWinner=()=>{
      if(state.phase==="result"||state.phase==="closing")return;state.phase="result";randomBrake();randomFanfare();overlay.classList.remove("spinning");overlay.classList.add("result");
      setStatus(state.winner?.name||"당첨!","보관함으로 이동 중");randomConfetti(doc,overlay);state.resultId=state.result?.item?.id||"";state.timers.push(setTimeout(movePrizeToInventory,1100));
    };
    const settle=(fast=false)=>{
      if(state.settling||!state.result)return;state.settling=true;try{state.rollAnimation?.cancel?.()}catch{};state.rollAnimation=null;
      const winner=state.result.product||products.find(p=>p.id===state.result.product_id)||{name:state.result.product_name||"상품",imageUrl:state.result.product_image_url||""};state.winner=winner;
      const seq=Array.from({length:10},randomProduct);const winnerIndex=seq.length;seq.push(winner,randomProduct());
      strip.replaceChildren(...seq.map((p,i)=>randomProductCell(p,i===winnerIndex)));const h=sizeCells();strip.style.transform="translateY(0px)";void strip.offsetHeight;
      const target=-(winnerIndex-1)*h,duration=fast?420:820;strip.style.transition=`transform ${duration}ms cubic-bezier(.12,.72,.16,1)`;requestAnimationFrame(()=>strip.style.transform=`translateY(${target}px)`);
      const ticks=fast?8:14;for(let i=0;i<ticks;i++){const progress=i/ticks;state.timers.push(setTimeout(randomTick,duration*(progress*progress*.88)));}
      state.timers.push(setTimeout(showWinner,duration+70));
    };
    const scheduleNormalSettle=()=>{
      if(!state.result||state.settling)return;const elapsed=performance.now()-state.startedAt,wait=Math.max(0,2680-elapsed);state.timers.push(setTimeout(()=>settle(false),wait));
    };
    const requestPurchase=async()=>{
      try{state.result=await Service.randomPurchase();if(state.fastRequested)settle(true);else scheduleNormalSettle();}
      catch(error){
        try{state.rollAnimation?.cancel?.()}catch{};state.rollAnimation=null;state.timers.forEach(clearTimeout);state.timers=[];overlay.classList.remove("spinning");tap.classList.remove("hidden");
        if(error?.code==="INSUFFICIENT_COIN")showInsufficient();
        else{state.phase="error";overlay.classList.add("error");strip.replaceChildren();tap.replaceChildren(D.el("strong",{text:"추첨하지 못했어요"}),D.el("small",{text:"화면을 누르면 닫혀요"}));setStatus();MiniTalk.UI.Shell.toast(error?.message||"랜덤구매에 실패했습니다.");}
      }
    };

    overlay.addEventListener("click",()=>{
      if(state.phase==="insufficient"||state.phase==="error"){closeRandomOverlay();return;}
      if(state.phase==="ready"){startRolling();requestPurchase();return;}
      if(state.phase==="spinning"&&!state.settling){state.fastRequested=true;setStatus("빠르게 뽑는 중","잠깐만!");if(state.rollAnimation)state.rollAnimation.playbackRate=3.2;if(state.result)settle(true);}
    });
  }

  function marketEmpty() {
    const D = MiniTalk.UI.Dom;
    return D.el("section", { class: "shop-market-empty" }, [
      D.el("div", { class: "shop-empty-illustration", "aria-hidden": "true" }, [D.el("span", { text: "◇" }), D.el("i", { text: "+" })]),
      D.el("strong", { text: "상점을 준비하고 있어요" })
    ]);
  }

  function inventoryPanel(user, owned, close) {
    const D = MiniTalk.UI.Dom;
    const panel = D.el("aside", { class: "shop-inventory-panel", "aria-label": "보관함" });
    const closeButton = D.el("button", { class: "icon-button subtle modal-close-button", type: "button", text: "×", "aria-label": "보관함 닫기", onclick: close });
    panel.append(D.el("header", {}, [D.el("div", {}, [D.el("strong", { text: "보관함" }), D.el("small", { class: "muted", text: user.isGuest ? "로그인 후 이용할 수 있어요" : `보관 상품 ${owned.length}개` })]), closeButton]));
    const inventory = D.el("div", { class: "shop-inventory-list" });
    if (!owned.length) inventory.append(empty(user.isGuest ? "로그인이 필요해요" : "보관함이 비어 있어요", user.isGuest ? "로그인하면 구매한 상품을 확인할 수 있어요." : "구매한 상품과 받은 선물이 여기에 모입니다."));
    owned.forEach(item => inventory.append(inventoryCard(item)));
    panel.append(inventory);
    return panel;
  }

  function empty(title, subtitle) {
    const D = MiniTalk.UI.Dom;
    return D.el("div", { class: "empty-state compact-empty" }, [D.el("span", { text: "▤" }), D.el("strong", { text: title }), D.el("small", { class: "muted", text: subtitle })]);
  }


  function coinAmount(value, className="coin-amount") {
    const D = MiniTalk.UI.Dom;
    return D.el("span", { class: className, "aria-label": `${Number(value)||0}코인` }, [
      D.el("img", { src: "assets/ui/notebook-coin.svg", alt: "" }),
      D.el("b", { text: String(Number(value)||0) })
    ]);
  }

  function productCard(product, guest) {
    const D = MiniTalk.UI.Dom, soldOut = Service.isSoldOut(product);
    return D.el("button", { class: `shop-product-card${soldOut ? " is-sold-out" : ""}`, type: "button", disabled: soldOut, "aria-disabled": String(soldOut), onclick: () => soldOut ? MiniTalk.UI.Shell.toast("품절된 상품이에요.") : guest ? MiniTalk.UI.Shell.toast("로그인 후 구매할 수 있어요.") : openPurchase(product) }, [
      product.imageUrl ? D.el("img", { class: "shop-product-image", src: product.imageUrl, alt: "", loading: "lazy" }) : D.el("span", { class: "shop-product-icon", text: "▤" }),
      D.el("span", { class: "shop-product-copy" }, [D.el("strong", { text: product.name }), D.el("small", { class: "muted", text: product.description || "설명 없음" }), product.quantity !== null ? D.el("small", { class: `shop-stock-label${soldOut ? " sold-out" : ""}`, text: soldOut ? "품절" : `남은 수량 ${product.quantity}개` }) : null].filter(Boolean)),
      soldOut ? D.el("span", { class: "shop-sold-out-badge", text: "품절" }) : coinAmount(product.price, "shop-price coin-amount")
    ]);
  }

  function openPurchase(product) {
    const D = MiniTalk.UI.Dom, body = D.el("div", { class: "modal-stack purchase-confirm" });
    const confirm = D.el("button", { class: "button primary purchase-confirm-button", type: "button" }, [coinAmount(product.price, "coin-amount button-coin"), D.el("span", { text: "으로 구매" })]);
    confirm.onclick = async () => {
      if (confirm.disabled) return;
      confirm.disabled = true;
      confirm.classList.add("is-pending");
      const original = confirm.innerHTML;
      confirm.textContent = "구매 처리 중…";
      try { await Service.purchase(product); MiniTalk.UI.Shell.closeModal(); MiniTalk.UI.Shell.toast(`${product.name}을(를) 구매했습니다.`); }
      catch (error) {
        if (error.productChanged) {
          MiniTalk.UI.Shell.closeModal();
          refreshVisible();
        } else { confirm.disabled = false; confirm.classList.remove("is-pending"); confirm.innerHTML = original; }
        MiniTalk.UI.Shell.toast(error.message);
      }
    };
    body.append(D.el("div", { class: "purchase-product" }, [product.imageUrl ? D.el("img", { class: "purchase-product-image", src: product.imageUrl, alt: product.name }) : null, D.el("strong", { text: product.name }), D.el("p", { class: "muted", text: product.description || "상품 설명이 없습니다." }), coinAmount(product.price, "coin-amount purchase-price")].filter(Boolean)), D.el("p", { text: "이 상품을 구매하시겠습니까?" }), confirm);
    MiniTalk.UI.Shell.modal("구매 확인", body, { hostClass: "purchase-modal-host", modalClass: "purchase-modal" });
  }

  function deliverySummary(item) {
    const status = String(item.deliveryStatus || (item.usedAt ? "completed" : "owned"));
    if (status === "requested") return "주문이 접수되어 배달을 준비하고 있어요.";
    if (status === "shipping") return "모아루가 배달 중이에요.";
    if (status === "completed") return "배송완료";
    if (status === "cancelled") return "취소되었습니다.";
    return item.giftedByNickname ? `${item.giftedByNickname}님이 보낸 선물` : item.description || "배송 요청 가능";
  }

  function renderDeliveryEffect(item, cue = {}) {
    const D = MiniTalk.UI.Dom, doc = D.doc();
    doc.querySelectorAll('.delivery-order-effect').forEach(node => node.remove());
    const mascot = D.el('img', { class: 'delivery-order-mascot', src: appAssetUrl(DELIVERY_MASCOT_URL), alt: '모아루 배달 연출' });
    const host = D.el('div', { class: 'delivery-order-effect', 'aria-hidden': 'true' });
    const card = D.el('div', { class: 'delivery-order-card' }, [
      D.el('div', { class: 'delivery-order-runway' }, [
        mascot,
        D.el('span', { class: 'delivery-order-dust dust-a' }),
        D.el('span', { class: 'delivery-order-dust dust-b' }),
        D.el('span', { class: 'delivery-order-dust dust-c' })
      ]),
      D.el('strong', { text: '배달의 학급 주문!' }),
      D.el('p', { text: `${item.name || '상품'} 배달을 준비하고 있어요.` })
    ]);
    host.append(card);

    const primed = cue.primedAudio || null;
    const choices = Array.isArray(cue.soundUrls) && cue.soundUrls.length ? cue.soundUrls : DELIVERY_AUDIO_URLS;
    try {
      const src = primed?.src || appAssetUrl(choices[Math.floor(Math.random() * choices.length)] || choices[0]);
      const audio = primed?.audio || deliveryAudioPool.get(src) || new Audio(src);
      if (primed) primed.released = true;
      audio.preload = 'auto';
      audio.loop = false;
      audio.volume = 1;
      try { audio.currentTime = 0; } catch (_) {}
      // prime이 정상적으로 유지 중이면 currentTime 재설정만으로 처음부터 소리가 납니다.
      // 브라우저가 prime을 막은 경우에만 play()를 재시도합니다.
      if (audio.paused || audio.ended) audio.play().catch(() => {});
      if (!deliveryAudioPool.has(src)) deliveryAudioPool.set(src, audio);
    } catch (_) {}

    // 캐릭터 파일이 실제 준비된 뒤 연출 타이머를 시작해서, 로딩 중 애니메이션이 끝나는 일을 막습니다.
    let mounted = false;
    const mount = () => {
      if (mounted) return;
      mounted = true;
      doc.body.append(host);
      setTimeout(() => host.classList.add('leaving'), 1800);
      setTimeout(() => host.remove(), 2350);
    };
    if (mascot.complete && mascot.naturalWidth > 0) mount();
    else {
      mascot.addEventListener('load', mount, { once: true });
      mascot.addEventListener('error', mount, { once: true });
      setTimeout(mount, 650);
    }
  }

  function inventoryCard(item) {
    const D = MiniTalk.UI.Dom, used = Boolean(item.usedAt) || item.deliveryStatus === 'completed';
    const actions = D.el("div", { class: "shop-inventory-actions" });
    const status = String(item.deliveryStatus || (used ? 'completed' : 'owned'));
    if (!used) {
      const deliveryLocked = status === 'requested' || status === 'shipping';
      if (!deliveryLocked) {
        const giftButton = D.el("button", { class: "button secondary compact-button", type: "button", text: "선물", onclick: () => openGift(item) });
        actions.append(giftButton);
      }
      const deliveryButtonText = deliveryLocked ? '배송중' : (status === 'cancelled' ? '다시 배송' : '배송');
      const deliveryButton = D.el("button", { class: "button primary compact-button", type: "button", text: deliveryButtonText, disabled: deliveryLocked });
      deliveryButton.onclick = () => requestDelivery(item, deliveryButton);
      actions.append(deliveryButton);
    }
    const arrived = randomArrivalId && String(item.id || "") === String(randomArrivalId);
    return D.el("article", { class: `shop-inventory-item${used ? " used" : ""}${status ? ` status-${status}` : ''}${arrived ? " random-arrived" : ""}` }, [
      item.imageUrl ? D.el("img", { class: "shop-inventory-image", src: item.imageUrl, alt: "", loading: "lazy" }) : null,
      D.el("div", { class: "shop-inventory-copy" }, [
        D.el("strong", { text: item.name || "상품" }),
        D.el("small", { class: `muted inventory-status inventory-status-${status}`, text: deliverySummary(item) })
      ]), actions
    ].filter(Boolean));
  }

  async function requestDelivery(item, button) {
    if (button?.disabled) return;
    const originalText = button?.textContent || '배송';
    const deliverySounds = ['assets/sounds/delivery-order-1.mp3', 'assets/sounds/delivery-order-2.mp3'];
    const primedAudio = primeDeliveryAudio(deliverySounds);
    if (button) { button.disabled = true; button.textContent = '주문 중'; }
    try {
      const result = await Service.requestDelivery(item.id);
      MiniTalk.UI.Shell.toast(`${item.name} 배송을 요청했습니다.`);
      renderDeliveryEffect(item, { soundUrls: deliverySounds, ...(result?.effect || {}), primedAudio });
      refreshVisible();
    }
    catch (error) {
      if (primedAudio?.audio) {
        primedAudio.released = true;
        primedAudio.audio.loop = false;
        primedAudio.audio.pause?.();
        try { primedAudio.audio.currentTime = 0; } catch (_) {}
        primedAudio.audio.volume = 1;
      }
      MiniTalk.UI.Shell.toast(error.message || '배송을 요청하지 못했습니다.');
      if (button?.isConnected) { button.disabled = false; button.textContent = originalText; }
    }
  }

  async function useItem(item, button) {
    if (button?.disabled) return;
    if (button) { button.disabled = true;button.textContent = "처리 중"; }
    try { await Service.use(item.id); MiniTalk.UI.Shell.toast(`${item.name}을(를) 사용했습니다.`); }
    catch (error) { MiniTalk.UI.Shell.toast(error.message || "상품을 사용하지 못했습니다.");if (button?.isConnected) { button.disabled = false;button.textContent = "사용"; } }
  }

  async function openGift(item) {
    const status = String(item?.deliveryStatus || (item?.usedAt ? "completed" : "owned"));
    if (item?.usedAt || status === "completed" || status === "requested" || status === "shipping") {
      MiniTalk.UI.Shell.toast("배송 중인 상품은 선물할 수 없어요.");
      return;
    }
    const D = MiniTalk.UI.Dom, body = D.el("div", { class: "modal-stack" }, [D.el("p", { class: "muted modal-note", text: "선물할 사용자를 준비하고 있습니다." })]);
    MiniTalk.UI.Shell.modal("선물하기", body);
    let users = Service.recipients(), selected = "", search = null, list = null, send = null;
    const draw = () => {
      if (!search || !list) return;
      const q = search.value.trim().toLowerCase(), shown = users.filter(row => row.nickname.toLowerCase().includes(q));
      list.replaceChildren(...shown.map(row => { const radio = D.el("input", { type: "radio", name: "giftTarget", value: row.user_id, "aria-label": `${row.nickname} 선택` });radio.checked = selected === row.user_id;radio.onchange = () => { selected = row.user_id;draw(); };return D.el("label", { class: `gift-user-option${selected === row.user_id ? " selected" : ""}` }, [D.el("span", { class: "gift-user-avatar", text: row.nickname.slice(0, 1) }), D.el("strong", { text: row.nickname }), radio]); }));
      if (!shown.length) list.append(empty("검색 결과가 없어요", "다른 닉네임으로 검색해보세요."));
    };
    const mount = () => {
      search = D.el("input", { class: "search", placeholder: "닉네임 검색", "aria-label": "선물할 사용자 검색" });list = D.el("div", { class: "gift-user-list" });send = D.el("button", { class: "button primary", type: "button", text: "선물 보내기" });
      send.onclick = async () => {
        if (!selected) return MiniTalk.UI.Shell.toast("사용자를 선택하세요.");
        const original = send.textContent;send.disabled = true;send.textContent = "보내는 중…";
        try { const result = await Service.gift(item.id, selected);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast(`${result.targetNickname}님에게 선물했습니다.`); }
        catch (error) { MiniTalk.UI.Shell.toast(error.message);if(send?.isConnected){send.disabled = false;send.textContent = original;} }
      };
      search.oninput = draw;body.replaceChildren(D.el("p", { text: `${item.name}을(를) 누구에게 선물할까요?` }), search, list, send);draw();setTimeout(() => search?.focus(), 30);
    };
    // 이미 받아둔 가입자 명단이 있으면 즉시 선물창을 열고, 최신 명단 확인은 뒤에서 합니다.
    if (users.length || MiniTalk.UserDirectory?.loaded?.()) {
      mount();
      MiniTalk.UserDirectory.refresh().then(() => { users = Service.recipients();draw(); }).catch(error => console.warn("가입자 명단 백그라운드 갱신 실패", error));
      return;
    }
    try { await MiniTalk.UserDirectory.refresh();users = Service.recipients();mount(); }
    catch (error) { body.replaceChildren(empty("가입자 명단을 불러오지 못했어요", error.message || "Apps Script 배포 상태를 확인하세요.")); }
  }

  function adminPanel(onChanged, context = {}) {
    const D = context.Dom || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell, panel = D.el("section", { class: "tool-card admin-shop-panel" });
    if (!Service.products().length) Service.refreshCatalog().then(rows => { if (rows.length) onChanged?.(); }).catch(error => console.warn("상품 목록을 불러오지 못했습니다.", error));
    const add = D.el("button", { class: "button primary compact-button", type: "button", text: "상품 추가", onclick: () => openProductEditor(null, onChanged, { D, Shell }) });
    panel.append(D.el("div", { class: "admin-shop-head" }, [D.el("div", {}, [D.el("strong", { text: "쇼핑 상품 관리" }), D.el("small", { class: "muted", text: "상품 이름·가격·설명과 선택 재고 수량을 설정합니다." })]), add]));
    const list = D.el("div", { class: "admin-product-list" });
    const products = Service.products();
    if (!products.length) list.append(empty("등록된 상품이 없어요", "상품 추가 버튼으로 첫 상품을 등록하세요."));
    products.forEach(product => list.append(D.el("article", { class: "admin-product-row" }, [
      product.imageUrl ? D.el("img", { class: "admin-product-image", src: product.imageUrl, alt: "", loading: "lazy" }) : D.el("span", { class: "admin-product-image placeholder", text: "▤" }),
      D.el("div", {}, [D.el("strong", { text: product.name }), D.el("small", { class: "muted admin-product-meta" }, [coinAmount(product.price, "coin-amount inline-coin"), D.el("span", { text: ` · ${product.quantity === null ? "재고 무제한" : product.quantity <= 0 ? "품절" : `재고 ${product.quantity}개`} · ${product.description || "설명 없음"}` })])]),
      D.el("div", { class: "button-row compact-row" }, [D.el("button", { class: "button secondary compact-button", type: "button", text: "수정", onclick: () => openProductEditor(product, onChanged, { D, Shell }) }), D.el("button", { class: "button secondary compact-button", type: "button", text: "삭제", onclick: () => deleteProduct(product, onChanged, { D, Shell }) })])
    ])));
    panel.append(list);return panel;
  }

  function openProductEditor(product, onChanged, context = {}) {
    const D = context.D || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell, body = D.el("div", { class: "modal-stack" });
    body.innerHTML = `<button id="productImagePicker" class="product-image-picker" type="button" aria-label="상품 이미지 촬영 또는 선택"><span>▤</span><strong>상품 이미지</strong><small>눌러서 촬영하거나 선택하세요</small></button><div id="productImageActions" class="product-image-actions hidden"><button id="productCamera" class="button secondary compact-button" type="button">카메라로 촬영</button><button id="productGallery" class="button secondary compact-button" type="button">이미지 선택</button><button id="productImageRemove" class="button text compact-button" type="button">이미지 제거</button></div><input id="productCameraInput" class="hidden" type="file" accept="image/*" capture="environment"><input id="productGalleryInput" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"><p class="muted modal-note">사진은 실제 표시 크기에 맞는 160×120 이미지로 자동 압축됩니다.</p><label class="field">상품 이름<input id="productName" maxlength="60"></label><label class="field">가격<input id="productPrice" type="number" min="1" step="1"></label><label class="field">재고 수량 <small class="muted">(선택 · 비워두면 무제한)</small><input id="productQuantity" type="number" min="0" step="1" inputmode="numeric" placeholder="무제한"></label><label class="field">설명<textarea id="productDescription" maxlength="160"></textarea></label><button id="productSave" class="button primary" type="button">저장</button>`;
    const picker = body.querySelector("#productImagePicker"), actions = body.querySelector("#productImageActions"), cameraInput = body.querySelector("#productCameraInput"), galleryInput = body.querySelector("#productGalleryInput");
    let imageUrl = product?.imageUrl || "", pendingImage = "";
    const updatePreview = value => { picker.style.backgroundImage = value ? `url("${value}")` : "";picker.classList.toggle("has-image", Boolean(value));picker.querySelector("span").textContent = value ? "" : "▤";picker.querySelector("strong").textContent = value ? "이미지 변경" : "상품 이미지"; };
    updatePreview(imageUrl);
    picker.onclick = () => actions.classList.toggle("hidden");
    body.querySelector("#productCamera").onclick = () => cameraInput.click();
    body.querySelector("#productGallery").onclick = () => galleryInput.click();
    body.querySelector("#productImageRemove").onclick = () => { imageUrl = "";pendingImage = "";updatePreview("");actions.classList.add("hidden"); };
    const chooseImage = async input => { const file = input.files?.[0];if (!file) return;actions.classList.add("hidden");picker.disabled = true;try { pendingImage = await compressProductImage(file);updatePreview(pendingImage); } catch (error) { Shell.toast(error.message); } finally { picker.disabled = false;input.value = ""; } };
    cameraInput.onchange = () => chooseImage(cameraInput);galleryInput.onchange = () => chooseImage(galleryInput);
    body.querySelector("#productName").value = product?.name || "";body.querySelector("#productPrice").value = product?.price || "";body.querySelector("#productQuantity").value = product?.quantity === null || product?.quantity === undefined ? "" : String(product.quantity);body.querySelector("#productDescription").value = product?.description || "";
    body.querySelector("#productSave").onclick = async event => { const button = event.currentTarget,name = body.querySelector("#productName").value.trim(),price = body.querySelector("#productPrice").value,quantityText = body.querySelector("#productQuantity").value.trim(),quantity = quantityText === "" ? null : Math.max(0,Math.floor(Number(quantityText)||0)),description = body.querySelector("#productDescription").value;button.disabled = true;try { if (pendingImage) imageUrl = pendingImage;await Service.saveProduct({ id: product?.id, name, price, quantity, description, imageUrl });Shell.closeModal();Shell.toast("상품을 저장했습니다.");onChanged?.(); } catch (error) { Shell.toast(error.message);button.disabled = false; } };
    Shell.modal(product ? "상품 수정" : "상품 추가", body);
  }

  function compressProductImage(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type?.startsWith("image/")) return reject(new Error("사진 또는 이미지 파일을 선택하세요."));
      if (file.size > 12 * 1024 * 1024) return reject(new Error("12MB 이하 이미지를 선택하세요."));
      const objectUrl = URL.createObjectURL(file), image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas"), width = 160, height = 120;
          const sourceRatio = image.width / image.height, targetRatio = width / height;
          let sx = 0, sy = 0, sw = image.width, sh = image.height;
          if (sourceRatio > targetRatio) { sw = image.height * targetRatio; sx = (image.width - sw) / 2; }
          else { sh = image.width / targetRatio; sy = (image.height - sh) / 2; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
          let quality = .62, data = canvas.toDataURL("image/webp", quality);
          const type = data.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
          if (type === "image/jpeg") data = canvas.toDataURL(type, quality);
          while (data.length > 6900 && quality > .20) { quality -= .08; data = canvas.toDataURL(type, quality); }
          URL.revokeObjectURL(objectUrl);
          if (data.length > 7200) return reject(new Error("서버 저장 크기에 맞게 사진을 압축하지 못했습니다."));
          resolve(data);
        } catch (error) { URL.revokeObjectURL(objectUrl); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl);reject(new Error("이미지를 불러오지 못했습니다.")); };
      image.src = objectUrl;
    });
  }

  function deleteProduct(product, onChanged, context = {}) {
    const D = context.D || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell, body = D.el("div", { class: "modal-stack" }), remove = D.el("button", { class: "button primary", type: "button", text: "삭제" });
    remove.onclick = async () => { remove.disabled = true;try { await Service.deleteProduct(product.id);Shell.closeModal();Shell.toast("상품을 삭제했습니다.");onChanged?.(); } catch (error) { Shell.toast(error.message);remove.disabled = false; } };
    body.append(D.el("p", { text: `${product.name} 상품을 삭제할까요?` }), D.el("small", { class: "muted", text: "이미 구매한 사용자의 보관함 상품은 유지됩니다." }), remove);Shell.modal("상품 삭제", body);
  }

  function deliveryAdminPanel(context = {}) {
    const D = context.Dom || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell;
    const panel = D.el("section", { class: "tool-card admin-delivery-panel" });
    const head = D.el("div", { class: "admin-shop-head" }), title = D.el("div", {}, [D.el("strong", { text: "배송 요청 관리" }), D.el("small", { class: "muted", text: "학생이 요청한 상품의 배송 상태를 처리합니다." })]);
    const refresh = D.el("button", { class: "mini-action", type: "button", text: "새로고침" }), list = D.el("div", { class: "admin-delivery-list" });
    head.append(title, refresh);panel.append(head, list);
    let loading = false, rows = [];
    const current = MiniTalk.Store.get("user") || {};
    const draw = () => {
      list.replaceChildren();
      if (!rows.length) { list.append(empty("대기 중인 배송이 없어요", "새 배송 요청이 들어오면 여기에 표시됩니다."));return; }
      rows.forEach(row => {
        const status = String(row.deliveryStatus || row.status || "requested"), item = D.el("article", { class: `admin-delivery-row status-${status}` });
        const copy = D.el("div", { class: "admin-delivery-copy" }, [D.el("strong", { text: row.name || "상품" }), D.el("span", { text: row.nickname || row.ownerNickname || row.owner_id || row.ownerId || "학생" }), D.el("small", { class: "muted", text: status === "shipping" ? "배송중" : "배송 요청" })]);
        const buttons = D.el("div", { class: "button-row compact-row" });
        const action = async (kind, button) => {
          if (button.disabled) return;
          const group = [...buttons.querySelectorAll("button")], original = button.textContent;group.forEach(value => value.disabled = true);button.textContent = kind === "completed" ? "완료 처리 중…" : kind === "cancelled" ? "취소 중…" : "변경 중…";
          try {
            const payload = { userId: current.user_id, adminToken: MiniTalk.AdminSession.requireToken("SHOP"), ownerId: row.ownerId || row.owner_id, inventoryId: row.id || row.inventoryId || row.inventory_id };
            let result;
            if (kind === "shipping") result = await MiniTalk.AuthApi.shopDeliveryShipping(payload);
            else if (kind === "completed") result = await MiniTalk.AuthApi.shopDeliveryComplete(payload);
            else result = await MiniTalk.AuthApi.shopDeliveryCancel(payload);
            if (String(result?.deliveryStatus || "") !== kind) throw new Error("서버 배송 상태를 확인하지 못했습니다. 다시 새로고침해주세요.");
            MiniTalk.Realtime.notifyCommandTargets?.([payload.ownerId]);
            Shell.toast(kind === "completed" ? "배송완료로 처리했습니다." : kind === "cancelled" ? "배송을 취소했습니다." : "배송중으로 변경했습니다.");
            // 상태변경 성공 뒤 배송목록 전체를 다시 읽지 않습니다. 현재 행만 즉시 반영하고 수동 새로고침은 별도 버튼으로 유지합니다.
            if (kind === "shipping") rows = rows.map(value => value === row ? {...value,status:"shipping",deliveryStatus:"shipping"} : value);
            else rows = rows.filter(value => value !== row);
            draw();
          } catch (error) {
            if (["ADMIN_SESSION_EXPIRED","ADMIN_AUTH_REQUIRED","SHOP_MANAGER_PERMISSION_REQUIRED"].includes(String(error?.code || ""))) MiniTalk.AdminSession.clear?.();
            Shell.toast(error.message || "배송 상태를 변경하지 못했습니다.");
            if (button?.isConnected) { group.forEach(value => value.disabled = false);button.textContent = original; }
          }
        };
        if (status === "requested") { const shipping = D.el("button", { class: "button secondary compact-button", type: "button", text: "배송 시작" });shipping.onclick = () => action("shipping", shipping);buttons.append(shipping); }
        const complete = D.el("button", { class: "button primary compact-button", type: "button", text: "배송완료" }), cancel = D.el("button", { class: "button secondary compact-button", type: "button", text: "취소" });
        complete.onclick = () => action("completed", complete);cancel.onclick = () => action("cancelled", cancel);buttons.append(complete, cancel);item.append(copy, buttons);list.append(item);
      });
    };
    const load = async () => {
      if (loading) return;loading = true;refresh.disabled = true;
      if (!rows.length) list.replaceChildren(D.el("p", { class: "muted", text: "배송 요청을 불러오는 중입니다." }));
      try { rows = await MiniTalk.AuthApi.shopDeliveryList(current.user_id, MiniTalk.AdminSession.requireToken("SHOP"));draw(); }
      catch (error) { if (!rows.length) list.replaceChildren(D.el("p", { class: "muted", text: error.message || "배송 요청을 불러오지 못했습니다." }));else Shell.toast(error.message || "배송 요청을 새로고침하지 못했습니다."); }
      finally { loading = false;refresh.disabled = false; }
    };
    refresh.onclick = load;load();return panel;
  }

  function leave(){inventoryOpen=false;clearTimeout(refreshTimer);refreshTimer=0;Service.leave?.()}
  return { id: "shopping", title: "쇼핑", icon: "▤", render, leave, adminPanel, deliveryAdminPanel };
})();
MiniTalk.Registry.register(MiniTalk.Features.Shopping);
