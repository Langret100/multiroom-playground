
// ---- BGM (best-effort autoplay; mobile may require a tap) ----
function setupBgm(audioElId, btnId){
  const audio = document.getElementById(audioElId);
  const btn = document.getElementById(btnId);
  if(!audio || !btn) return;

  // start hidden; show only if user needs to tap
  btn.style.display = "none";

  const tryPlayMuted = async () => {
    try{
      audio.loop = true;
      audio.muted = true;     // autoplay usually allowed only when muted
      audio.volume = 0.0875;
      await audio.play();
      // Unmute on first user interaction
      const unlock = async () => {
        try{
          audio.muted = false;
          await audio.play();
        }catch(e){}
        window.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("touchstart", unlock, true);
        window.removeEventListener("keydown", unlock, true);
      };
      window.addEventListener("pointerdown", unlock, true);
      window.addEventListener("touchstart", unlock, true);
      window.addEventListener("keydown", unlock, true);
    }catch(e){
      // If autoplay totally blocked, show button to start
      btn.style.display = "";
    }
  };

  btn.addEventListener("click", async ()=>{
    try{
      audio.muted = false;
      await audio.play();
      btn.style.display = "none";
    }catch(e){
      // keep button visible
      btn.style.display = "";
    }
  });

  tryPlayMuted();
}

(function(){
  const { makeClient, nowHHMM, safeText, setStatus } = window.Net;
  const els = {
    roomsBody: document.querySelector("#roomsBody"),
    onlineKpi: document.querySelector("#onlineKpi"),
    myId: document.querySelector("#myId"),
    refreshBtn: document.querySelector("#refreshRooms"),
    createBtn: document.querySelector("#openCreate"),
    createBtn2: document.querySelector("#openCreate2"),
    fullBtn: document.querySelector("#toggleFullscreen"),
    modal: document.querySelector("#createModal"),
    modalClose: document.querySelector("#modalClose"),
    createConfirm: document.querySelector("#createConfirm"),
    createCancel: document.querySelector("#createCancel"),
    roomTitle: document.querySelector("#roomTitle"),
    gameMode: document.querySelector("#gameMode"),
    maxClientsLabel: document.querySelector("#maxClientsLabel"),
    maxClients: document.querySelector("#maxClients"),
    gameCardGrid: document.querySelector("#gameCardGrid"),
    gameHoldTip: document.querySelector("#gameHoldTip"),
    playerCountChips: document.querySelector("#playerCountChips"),
    selectedGameSummary: document.querySelector("#selectedGameSummary"),
    roomTitleCount: document.querySelector("#roomTitleCount"),
    chatLog: document.querySelector("#chatLog"),
    chatInput: document.querySelector("#chatInput"),
    chatSend: document.querySelector("#chatSend"),
    usersWrap: document.querySelector("#usersWrap"),
  };

  let client = null;
  let lobbyRoom = null;
  let myNick = null;
  // Tracks whether the user manually changed the "max clients" select inside the create-room modal.
  // If not touched, we apply per-game defaults (most games default to 4, stackga/suika are capped at 2).
  let maxClientsTouched = false;

  function defaultRoomTitle(){
    const nick = safeText(((myNick||"Player").toString().trim()) || "Player", 20);
    return nick + "의 방";
  }

  // Cache latest rooms/users so we can render user meta (room title/game) reliably.
  let roomsById = new Map();
  let lastUsers = [];

  // Throttled presence refresh (avoid redundant requests)
  let _presenceTimer = null;
  let _lastPresenceReq = 0;

  function appendChat(m){
    const line = document.createElement("div");
    line.className = "chatLine";
    const time = m.time || nowHHMM();

    // System messages (join/leave etc.)
    const rawNick = (m.nick ?? "").toString().trim();
    const rawText = (m.text ?? "").toString().trim();
    const isSystem = (!rawNick || rawNick === "SYSTEM" || rawNick === "?" || m.system === true || m.type === "system");

    if (isSystem){
      let msg = rawText || "";
      const join = msg.match(/^(.+?)\s*(접속|입장)$/);
      const leave = msg.match(/^(.+?)\s*(퇴장|나감|종료)$/);
      if (join) msg = `${join[1]}님이 접속하셨습니다.`;
      else if (leave) msg = `${leave[1]}님이 퇴장하셨습니다.`;
      line.classList.add("sys");
      line.innerHTML = `<span class="t">[${time}]</span> <span class="sysMsg">${safeText(msg, 200)}</span>`;
    } else {
      const nick = safeText(rawNick, 24);
      const text = safeText(rawText, 200);
      line.innerHTML = `<span class="t">[${time}]</span> <b class="n">${nick}</b>: <span class="m">${text}</span>`;
    }

    els.chatLog.appendChild(line);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function renderUsers(users){
    lastUsers = Array.isArray(users) ? users : [];
    els.usersWrap.innerHTML = "";
    for (const u of lastUsers){
      const d = document.createElement("div");
      d.className = "userItem";
      const nick = u.nick || u.id?.slice(0,6) || "Player";
      const roomId = u.roomId || "";
      if (roomId && roomsById.has(roomId)){
        const r = roomsById.get(roomId);
        const title = safeText(r.title || "방", 18);
        const mode = safeText(modeLabel(r.mode), 10);
        d.textContent = `${nick} (${title} · ${mode})`;
      } else {
        d.textContent = roomId ? `${nick} (방: ${roomId})` : nick;
      }
      els.usersWrap.appendChild(d);
    }
  }

  
  function requestPresenceThrottled(reason){
    if (!lobbyRoom) return;
    const now = Date.now();
    // min interval 800ms
    if (now - _lastPresenceReq < 800){
      if (_presenceTimer) return;
      _presenceTimer = setTimeout(()=>{ _presenceTimer=null; requestPresenceThrottled('debounced'); }, 850);
      return;
    }
    _lastPresenceReq = now;
    try{ lobbyRoom.send("presence", { reason: reason || "ui" }); }catch(_){}
  }

function statusDot(room){
    const status = room?.metadata?.status || "waiting";
    const full = (room.clients >= room.maxClients);
    if (status === "playing") return "danger";
    if (full) return "warn";
    return "ok";
  }

  function modeLabel(modeId){
    const g = window.gameById ? window.gameById(modeId) : null;
    const name = g ? g.name : (modeId || "-");
    try{
      // Wider mobile threshold so long Korean game titles don't auto-wrap awkwardly
      const isMobileNarrow = window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
      const id = g?.id || modeId;
      if (isMobileNarrow && id === "drawanswer") return "그림\n맞추기";
    }catch(_){ }
    return name;
  }

  function normalizeRoom(r){
    // Accept both Colyseus-like rooms and LobbyDO rooms list.
    const meta = r.metadata || {};
    const roomId = r.roomId || r.id || "";
    const title = meta.title ?? r.title ?? "방";
    const mode = meta.mode ?? r.mode ?? "stackga";
    const status = meta.status ?? r.status ?? "waiting";
    const clients = Number(r.clients ?? r.players ?? 0);
    const maxClients = Number(r.maxClients ?? r.maxPlayers ?? 4);
    return { roomId, title, mode, status, clients, maxClients };
  }

  // ---- Fullscreen-friendly room entry (no top-level navigation) ----
  // Most browsers exit fullscreen on a top-level navigation (index.html -> room.html).
  // To make fullscreen feel continuous, when the user is already in fullscreen,
  // we open room.html in an iframe overlay instead.
  let _embedOverlay = null;
  let _embedFrame = null;

  function isFullscreenActive(){
    try{ return !!document.fullscreenElement; }catch(_){ return false; }
  }

  async function toggleBrowserFullscreen(){
    try{
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    }catch(_){ }
  }

  function openEmbeddedRoom(roomId){
    try{
      const ov = _embedOverlay || document.getElementById('embedRoomOverlay');
      const fr = _embedFrame || document.getElementById('embedRoomFrame');
      _embedOverlay = ov; _embedFrame = fr;
      if (!ov || !fr){
        location.href = `./room.html?roomId=${encodeURIComponent(roomId)}`;
        return;
      }

      // When the room is rendered as an overlay (to keep browser fullscreen),
      // the lobby page stays alive underneath. Stop lobby BGM so it doesn't
      // overlap with room/game BGM.
      try{
        window.__lobbyBgmPausedByEmbed = true;
        window.__bgmLobbyHandle?.stop?.();
        const el = document.getElementById('bgmLobby');
        if (el){ el.pause(); el.muted = true; }
      }catch(_){ }

      ov.classList.remove('hidden');
      ov.setAttribute('aria-hidden', 'false');
      // Keep URL param explicit so room.js/auth.js can behave differently in embed mode.
      fr.src = `./room.html?roomId=${encodeURIComponent(roomId)}&embedded=1`;
    }catch(_){
      location.href = `./room.html?roomId=${encodeURIComponent(roomId)}`;
    }
  }

  function closeEmbeddedRoom(){
    try{
      const ov = _embedOverlay || document.getElementById('embedRoomOverlay');
      const fr = _embedFrame || document.getElementById('embedRoomFrame');
      _embedOverlay = ov; _embedFrame = fr;
      if (fr) fr.src = 'about:blank';
      if (ov){
        ov.classList.add('hidden');
        ov.setAttribute('aria-hidden', 'true');
      }
    }catch(_){ }

    // Resume lobby BGM only if the user preference is enabled.
    try{
      if (window.__lobbyBgmPausedByEmbed){
        window.__lobbyBgmPausedByEmbed = false;
        const el = document.getElementById('bgmLobby');
        if (el && window.AudioManager && window.AudioManager.isEnabled('audio_enabled')){
          el.volume = (typeof LOBBY_BGM_VOLUME === 'number') ? LOBBY_BGM_VOLUME : 0.0875;
          el.muted = false;
          el.play().catch(()=>{});
        }
      }
    }catch(_){ }

    // Best-effort: refresh the rooms list after returning.
    try{ refreshRooms(); }catch(_){ }
  }

  // Receive signals from embedded room/game iframes.
  window.addEventListener('message', (e)=>{
    const d = e?.data || {};
    if (!d || typeof d !== 'object') return;
    if (d.type === 'embedded_room_leave') closeEmbeddedRoom();
    if (d.type === 'fs_toggle') toggleBrowserFullscreen();
    if (d.type === 'fs_request') { try{ document.documentElement.requestFullscreen?.(); }catch(_){ } }
    if (d.type === 'fs_exit') { try{ document.exitFullscreen?.(); }catch(_){ } }
    if (d.type === 'auth_logout') { try{ location.reload(); }catch(_){ } }
    if (d.type === 'audio_pref' && typeof d.enabled === 'boolean'){
      try{ window.AudioManager && window.AudioManager.setEnabled('audio_enabled', d.enabled); }catch(_){ }
      try{ window.__bgmLobbyHandle && window.__bgmLobbyHandle.sync && window.__bgmLobbyHandle.sync(); }catch(_){ }
      try{ window.__renderLobbyMuteBtn && window.__renderLobbyMuteBtn(); }catch(_){ }
    }
  });

  function renderRooms(list){
    const rooms = (list || []).map(normalizeRoom).filter(r=>!!r.roomId);

    // Update room map for presence rendering (nick -> room title/game)
    roomsById.clear();
    for (const r of rooms) roomsById.set(r.roomId, r);
    // Re-render users so their room meta stays fresh even if presence payload only has roomId.
    if (lastUsers && lastUsers.length) renderUsers(lastUsers);

    if (!rooms.length){
      els.roomsBody.innerHTML = `<tr><td colspan="5" class="muted">열린 방이 없습니다. 아래 '방 만들기'를 눌러 생성하세요.</td></tr>`;
      return;
    }

    els.roomsBody.innerHTML = "";
    for (const r of rooms){
      const tr = document.createElement("tr");
      tr.className = "roomRow";
      tr.tabIndex = 0;
      tr.dataset.roomid = r.roomId;

      const dot = (r.status === "playing") ? "danger" : ((r.clients >= r.maxClients) ? "warn" : "ok");
      const title = safeText(r.title || "방", 30);
      const mode = safeText(modeLabel(r.mode), 16);
      const isPlaying = (r.status === "playing");
      if (isPlaying) tr.classList.add("playing");
      const isFull = (r.clients >= r.maxClients);
      const stateText = isPlaying ? "게임중" : (isFull ? "만석" : "대기");
      const people = `${r.clients}/${r.maxClients}`;
      tr.innerHTML = `
        <td class="tdState"><span class="dot ${dot}"></span><span class="stateTxt">${stateText}</span></td>
        <td class="tdMode"><span class="modeTag ${window.gameById(r.mode)?.badgeClass || ""}">${mode}</span></td>
        <td class="tdTitle"><div class="title1">${title}</div></td>
        <td class="tdCount"><b>${people}</b></td>
        <td class="tdJoin"><button class="btn small">입장</button></td>
      `;

      // Disable entry interactions for playing/full rooms
      const joinBtn = tr.querySelector("button");
      if (isPlaying || isFull){
        if (joinBtn) joinBtn.disabled = true;
        tr.classList.add("disabled");
        tr.tabIndex = -1;
      }

      const join = () => {
        // No entry while the room is already in-game (no spectate)
        if (isPlaying){
          setStatus("게임중인 방은 입장할 수 없습니다.", "error");
          return;
        }
        if (isFull){
          setStatus("방이 꽉 찼습니다.", "error");
          return;
        }
        sessionStorage.setItem("pendingRoomId", r.roomId);
        try{ window.__fsNavigating = true; }catch(_){ }
        if (isFullscreenActive()) openEmbeddedRoom(r.roomId);
        else location.href = `./room.html?roomId=${encodeURIComponent(r.roomId)}`;
      };

      if (!(isPlaying || isFull)) {
        tr.querySelector("button")?.addEventListener("click", (e)=>{ e.stopPropagation(); join(); });
        tr.addEventListener("click", join);
        tr.addEventListener("keydown", (e)=>{ if (e.key === "Enter") join(); });
      }
      els.roomsBody.appendChild(tr);
    }
  }

  async function refreshRooms(){
    // Manual refresh only (to reduce server usage). Primary updates come via LobbyDO push.
    if (!client) return;
    try{
      const rooms = await client.getAvailableRooms("game_room");
      renderRooms(rooms);
      setStatus("", "info");
    }catch(err){
      console.warn("rooms fetch failed", err);
      setStatus("방 목록을 불러올 수 없습니다. 서버가 켜져있는지 확인해 주세요.", "error");
      els.roomsBody.innerHTML = `<tr><td colspan="5" class="muted">방 목록을 불러올 수 없습니다.</td></tr>`;
    }
  }

  function currentGameMeta(){
    const id = els.gameMode?.value || window.GAME_REGISTRY?.[0]?.id || "stackga";
    return window.gameById ? window.gameById(id) : null;
  }

  function renderSelectedGameSummary(meta){
    if (!els.selectedGameSummary || !meta) return;
    const pc = (meta.pcHint || '').replace(/^PC:\s*/,'');
    const mobile = (meta.mobileHint || '').replace(/^모바일:\s*/,'');
    els.selectedGameSummary.innerHTML = `
      <img src="./${meta.cardImage || ''}" alt="" aria-hidden="true"/>
      <div><b>${safeText(meta.name,30)}</b><span>${safeText(meta.lobbyDesc || (meta.descLines||[])[0] || '',120)}</span>
      <small><strong>PC</strong> ${safeText(pc,90)} <em>·</em> <strong>모바일</strong> ${safeText(mobile,90)}</small></div>`;
  }

  function renderPlayerChips(meta, preferred){
    const wrap = els.playerCountChips;
    const sel = els.maxClients;
    if (!wrap || !sel || !meta) return;
    const cap = Math.max(1, Number(meta.maxClients || 4));
    const min = meta.id === 'mathexplorer' ? 1 : 2;
    const evenOnly = meta.id === 'soccer';
    let options=[];
    for(let n=min;n<=cap;n++) if(!evenOnly || n%2===0) options.push(n);
    const fallback = options.includes(4) ? 4 : options[options.length-1];
    let chosen = Number(preferred || sel.value || fallback);
    if(!options.includes(chosen)) chosen=fallback;
    sel.innerHTML=''; wrap.innerHTML='';
    options.forEach(n=>{
      const o=document.createElement('option'); o.value=String(n); o.textContent=String(n); o.selected=n===chosen; sel.appendChild(o);
      const b=document.createElement('button'); b.type='button'; b.className='playerCountChip'+(n===chosen?' selected':'');
      b.dataset.count=String(n); b.setAttribute('role','radio'); b.setAttribute('aria-checked',n===chosen?'true':'false');
      b.innerHTML=`<span aria-hidden="true">${n===1?'●':n<=4?'●●':'●●●'}</span><b>${n}명</b>`;
      b.addEventListener('click',()=>{ maxClientsTouched=true; sel.value=String(n); wrap.querySelectorAll('.playerCountChip').forEach(x=>{const on=x===b;x.classList.toggle('selected',on);x.setAttribute('aria-checked',on?'true':'false');}); });
      wrap.appendChild(b);
    });
    if (els.maxClientsLabel) els.maxClientsLabel.textContent = evenOnly ? `수학축구는 짝수 인원만 가능 · 최대 ${cap}명` : `${min}~${cap}명 선택 가능`;
  }

  function selectGameCard(id, animate=true){
    const meta = window.gameById ? window.gameById(id) : null;
    if(!meta || meta.disabled) return;
    els.gameMode.value=id;
    els.gameCardGrid?.querySelectorAll('.createGameCard').forEach(card=>{
      const on=card.dataset.game===id; card.classList.toggle('selected',on); card.setAttribute('aria-checked',on?'true':'false');
      if(on && animate){ card.classList.remove('pickPop'); void card.offsetWidth; card.classList.add('pickPop'); }
    });
    renderPlayerChips(meta, maxClientsTouched ? Number(els.maxClients.value) : null);
    renderSelectedGameSummary(meta);
    try{ if(els.createConfirm) els.createConfirm.disabled=!!meta.disabled; }catch(_){ }
  }

  function showGameHoldInfo(meta, card){
    if(!els.gameHoldTip || !meta) return;
    els.gameHoldTip.hidden=false;
    els.gameHoldTip.innerHTML=`<div class="holdInfoArt"><img src="./${meta.cardImage || ''}" alt=""/></div><div><b>${safeText(meta.name,30)}</b><span>${safeText(meta.lobbyDesc || '',150)}</span><small><strong>PC</strong> ${safeText((meta.pcHint||'').replace(/^PC:\s*/,''),100)}<br><strong>모바일</strong> ${safeText((meta.mobileHint||'').replace(/^모바일:\s*/,''),100)}</small></div>`;
    card?.classList.add('holdOpen');
  }

  function buildGameCards(){
    if(!els.gameCardGrid) return;
    els.gameCardGrid.innerHTML='';
    const games=(window.GAME_REGISTRY||[]);
    games.forEach((g,idx)=>{
      const card=document.createElement('button'); card.type='button'; card.className='createGameCard'+(g.disabled?' disabled':'');
      card.dataset.game=g.id; card.setAttribute('role','radio'); card.setAttribute('aria-checked','false'); card.disabled=!!g.disabled;
      card.innerHTML=`<span class="gameCardArt"><img src="./${g.cardImage||''}" alt="" loading="eager"/></span><span class="gameCardText"><b>${safeText(g.name,30)}</b><small>${safeText(g.category||'',30)}</small></span><span class="gameCardCheck" aria-hidden="true">✓</span>${g.disabled?`<span class="gameCardDisabled">${safeText(g.disabledLabel||'준비중',20)}</span>`:''}`;
      let holdTimer=null, longPressed=false;
      const cancel=()=>{ if(holdTimer){clearTimeout(holdTimer);holdTimer=null;} };
      card.addEventListener('pointerdown',()=>{ longPressed=false; cancel(); holdTimer=setTimeout(()=>{longPressed=true; showGameHoldInfo(g,card);},520); });
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>card.addEventListener(ev,cancel));
      card.addEventListener('click',(e)=>{ if(longPressed){e.preventDefault();longPressed=false;return;} if(els.gameHoldTip){els.gameHoldTip.hidden=true;els.gameHoldTip.innerHTML='';} els.gameCardGrid?.querySelectorAll('.createGameCard').forEach(x=>x.classList.remove('holdOpen')); selectGameCard(g.id,true); });
      card.addEventListener('contextmenu',e=>e.preventDefault());
      els.gameCardGrid.appendChild(card);
    });
    const initial=els.gameMode.value || games.find(g=>!g.disabled)?.id; if(initial) selectGameCard(initial,false);
  }

  function openModal(){
    els.modal.classList.add("show");
    const def = defaultRoomTitle();
    // Always start with a sensible default; user can overwrite.
    els.roomTitle.value = def;
    // Reset touched state every time the modal opens so game defaults apply naturally.
    maxClientsTouched = false;
    try{ els.roomTitle.dataset.defaultTitle = def; }catch(_){ }
    try{ if(els.roomTitleCount) els.roomTitleCount.textContent=`${els.roomTitle.value.length}/30`; }catch(_){ }
    try{ els.gameHoldTip.hidden=true; els.gameHoldTip.innerHTML=''; }catch(_){ }
    try{ selectGameCard(els.gameMode.value || window.GAME_REGISTRY?.find(g=>!g.disabled)?.id || 'stackga', false); }catch(_){ }
    try{ els.roomTitle.focus(); els.roomTitle.select(); }catch(_){ }
  }
  function closeModal(){
    els.modal.classList.remove("show");
  }

  async function createRoom(){
    if (!client) return;
    let rawTitle = (els.roomTitle.value || "").toString().trim();
    const defTitle = (els.roomTitle.dataset && els.roomTitle.dataset.defaultTitle) ? els.roomTitle.dataset.defaultTitle : defaultRoomTitle();
    if (!rawTitle || rawTitle === "새 방") rawTitle = defTitle;
    const title = safeText(rawTitle, 30);
    const mode = els.gameMode.value || ((window.GAME_REGISTRY && window.GAME_REGISTRY[0] && window.GAME_REGISTRY[0].id) ? window.GAME_REGISTRY[0].id : "stackga");
    const meta = (window.gameById ? window.gameById(mode) : null);
    const modeType = meta?.type || "coop";
    if (meta?.disabled){
      setStatus(`${meta.name}는 현재 ${meta.disabledLabel || "수정중"}입니다.`, "error");
      return;
    }
    const cap = (meta && typeof meta.maxClients === "number") ? meta.maxClients : 4;
    const minCap = (mode === "mathexplorer") ? 1 : 2;
    const maxClients = Math.max(minCap, Math.min(cap, parseInt(els.maxClients.value||String(cap),10)||cap));

    try{
      const room = await client.create("game_room", { title, mode, modeType, maxClients, hostNick: myNick, nick: myNick });
      sessionStorage.setItem("pendingRoomId", room.id);
      try{ window.__fsNavigating = true; }catch(_){ }
      if (isFullscreenActive()) openEmbeddedRoom(room.id);
      else location.href = `./room.html?roomId=${encodeURIComponent(room.id)}`;
    }catch(err){
      setStatus("방 생성 실패: 서버 연결을 확인하세요.", "error");
    }
  }

  function wireUI(){
    els.gameMode.innerHTML = "";
    for (const g of (window.GAME_REGISTRY || [])){
      const opt = document.createElement("option"); opt.value=g.id; opt.textContent=g.name; opt.disabled=!!g.disabled; els.gameMode.appendChild(opt);
    }
    buildGameCards();
    try{ els.gameMode.addEventListener('change',()=>selectGameCard(els.gameMode.value,false)); }catch(_){ }
    try{ els.roomTitle?.addEventListener('input',()=>{ if(els.roomTitleCount) els.roomTitleCount.textContent=`${els.roomTitle.value.length}/30`; }); }catch(_){ }

    els.refreshBtn.addEventListener("click", ()=> refreshRooms());

    // Fullscreen toggle (Pages/desktop friendly)
    if (els.fullBtn) {
      const sync = () => {
        els.fullBtn.textContent = document.fullscreenElement ? "🗗" : "⛶";
        els.fullBtn.title = document.fullscreenElement ? "전체화면 해제" : "전체화면";
        els.fullBtn.setAttribute("aria-label", els.fullBtn.title);
      };
      els.fullBtn.addEventListener("click", async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
          } else {
            await document.exitFullscreen();
          }
        } catch (e) {
          // ignore (some browsers block)
        }
        sync();
      });
      document.addEventListener("fullscreenchange", sync);
      sync();
    }

    els.createBtn && els.createBtn.addEventListener("click", openModal);
    els.createBtn2 && els.createBtn2.addEventListener("click", openModal);
    els.modalClose.addEventListener("click", closeModal);
    els.createCancel.addEventListener("click", closeModal);
    els.createConfirm.addEventListener("click", async ()=>{
      if(els.createConfirm.disabled) return;
      els.createConfirm.classList.add("launching");
      await new Promise(r=>setTimeout(r,150));
      closeModal();
      els.createConfirm.classList.remove("launching");
      await createRoom();
    });

    const sendChat = ()=>{
      if (!lobbyRoom) return;
      const text = safeText(els.chatInput.value, 200);
      if (!text.trim()) return;
      lobbyRoom.send("chat", { text });
      els.chatInput.value = "";
    };
    els.chatSend.addEventListener("click", sendChat);
    els.chatInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") sendChat(); });
  }

  async function connect(){
    // Require login OR guest nickname first.
    try {
      if (window.Auth && typeof window.Auth.requireLogin === "function") {
        await window.Auth.requireLogin();
      }
    } catch (e) {
      console.warn("auth failed, fallback guest", e);
    }

    myNick = sessionStorage.getItem("nick") || "Player";
    els.myId.textContent = myNick;

    try{
      client = makeClient();
      lobbyRoom = await client.joinOrCreate("lobby_room", { nick: myNick });

      lobbyRoom.onMessage("chat", (m)=>{ appendChat(m); });
      lobbyRoom.onMessage("system", (m)=>{ 
        appendChat(m);
        // If a join/leave system notice arrived, refresh presence promptly (throttled).
        const t = (m && (m.text||m.message||"")).toString();
        if (/접속|입장|퇴장|나감|종료/.test(t)) requestPresenceThrottled("system");
      });
      lobbyRoom.onMessage("rooms", (m)=>{
        // Primary room list updates come from LobbyDO push (reduces server usage).
        renderRooms((m && m.list) ? m.list : []);
      });
      lobbyRoom.onMessage("presence", (m) => {
        els.onlineKpi.innerHTML = `접속 인원: <b>${m.online}</b>명`;
        renderUsers(m.users || []);
      });

      requestPresenceThrottled("init");
      // Optional one-shot fetch as a fallback (manual refresh is also available)
      await refreshRooms();
      // Fallback polling (low frequency): room list is primarily pushed from the server.
      // Keep this light to avoid redundant requests.
      setInterval(()=>{ try{ if (document.visibilityState === "visible") refreshRooms(); }catch(_){} }, 15000);
      setStatus("", "info");
    }catch(err){
      setStatus("서버에 연결할 수 없습니다. 로컬 테스트는 http 서버로 열고, 서버를 먼저 실행하세요.", "error");
      els.roomsBody.innerHTML = `<tr><td colspan="5" class="muted">서버 연결 실패</td></tr>`;
    }
  }

  wireUI();
  connect();
})();


// ---- BGM ----
(function(){
  const el = document.getElementById('bgmLobby');
  if (!el || !window.AudioManager) return;

  const storageKey = 'audio_enabled';

  // Pick one lobby track per lobby page load. The selected source stays fixed
  // while this lobby page remains open, including room-overlay entry/exit.
  const LOBBY_BGM_TRACKS = Object.freeze([
    'assets/audio/lobby_music.mp3',
    'assets/audio/lobby_music2.mp3',
    'assets/audio/lobby_music3.mp3',
  ]);
  const randomIndex = (() => {
    try{
      if (window.crypto && typeof window.crypto.getRandomValues === 'function'){
        const n = new Uint32Array(1);
        window.crypto.getRandomValues(n);
        return n[0] % LOBBY_BGM_TRACKS.length;
      }
    }catch(_){ }
    return Math.floor(Math.random() * LOBBY_BGM_TRACKS.length);
  })();
  const selectedTrack = LOBBY_BGM_TRACKS[randomIndex];
  if (el.getAttribute('src') !== selectedTrack){
    el.src = selectedTrack;
    try{ el.load(); }catch(_){ }
  }

  // Keep the existing reduced lobby-volume setting for every random track.
  const LOBBY_BGM_VOLUME = 0.0875;
  const handle = window.AudioManager.attachAudioManager(el, { label: '로비 음악', storageKey, volume: LOBBY_BGM_VOLUME });
  try{ window.__bgmLobbyHandle = handle; }catch(_){}

  const btn = document.getElementById('toggleMute');

  function renderMuteBtn(){
    if (!btn) return;
    const enabled = window.AudioManager.isEnabled(storageKey);
    btn.textContent = enabled ? '🔊' : '🔇';
    const t = enabled ? '음소거' : '음소거 해제';
    btn.title = t;
    btn.setAttribute('aria-label', t);
  }

  // Expose so embedded room/game can force a UI refresh.
  try{ window.__renderLobbyMuteBtn = renderMuteBtn; }catch(_){ }

  if (btn){
    btn.addEventListener('click', async ()=>{
      try{ window.SFX && window.SFX.click && window.SFX.click(); }catch(_){}
      const enabled = window.AudioManager.isEnabled(storageKey);
      const nextEnabled = !enabled;
      if (enabled) handle.disable();
      else await handle.enable();
      renderMuteBtn();

      // If a room is open in the fullscreen overlay, sync its mute button too.
      try{
        const fr = document.getElementById('embedRoomFrame');
        if (fr && fr.contentWindow) fr.contentWindow.postMessage({ type:'audio_pref', enabled: nextEnabled }, '*');
      }catch(_){ }
    });
  }

  // Apply preference right away (so lobby doesn't play if already muted)
  try{ if (!window.AudioManager.isEnabled(storageKey)) handle.disable(); }catch(_){}

 // Keep the button UI in sync when the preference is toggled from an embedded room.
  try{
    window.addEventListener('storage', (ev)=>{
      if (ev && ev.key === storageKey) renderMuteBtn();
    });
  }catch(_){}

  renderMuteBtn();
})();