
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
      audio.volume = 0.7;
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
    chatLog: document.querySelector("#chatLog"),
    chatInput: document.querySelector("#chatInput"),
    chatSend: document.querySelector("#chatSend"),
    usersWrap: document.querySelector("#usersWrap"),
  };

  let client = null;
  let lobbyRoom = null;
  let myNick = null;

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
    return g ? g.name : (modeId || "-");
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
        location.href = `./room.html?roomId=${encodeURIComponent(r.roomId)}`;
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

  function openModal(){
    els.modal.classList.add("show");
    els.roomTitle.value = (els.roomTitle.value || "새 방");
  }
  function closeModal(){
    els.modal.classList.remove("show");
  }

  async function createRoom(){
    if (!client) return;
    const title = safeText(els.roomTitle.value || "새 방", 30);
    const mode = els.gameMode.value || ((window.GAME_REGISTRY && window.GAME_REGISTRY[0] && window.GAME_REGISTRY[0].id) ? window.GAME_REGISTRY[0].id : "stackga");
    const meta = (window.gameById ? window.gameById(mode) : null);
    const modeType = meta?.type || "coop";
    const cap = (meta && typeof meta.maxClients === "number") ? meta.maxClients : 4;
    const maxClients = Math.max(2, Math.min(cap, parseInt(els.maxClients.value||String(cap),10)||cap));

    try{
      const room = await client.create("game_room", { title, mode, modeType, maxClients, hostNick: myNick, nick: myNick });
      sessionStorage.setItem("pendingRoomId", room.id);
      location.href = `./room.html?roomId=${encodeURIComponent(room.id)}`;
    }catch(err){
      setStatus("방 생성 실패: 서버 연결을 확인하세요.", "error");
    }
  }

  function wireUI(){
    els.gameMode.innerHTML = "";
    for (const g of (window.GAME_REGISTRY || [])){
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = `${g.name}`;
      els.gameMode.appendChild(opt);
    }

    // maxClients options depend on selected game (e.g., 꼬리잡기 supports up to 8)
    const updateMaxClientsOptions = ()=>{
      try{
        const mode = els.gameMode.value || "stackga";
        const meta = (window.gameById ? window.gameById(mode) : null);
        const cap = (meta && typeof meta.maxClients === "number") ? meta.maxClients : 4;

        // label hint
        if (els.maxClientsLabel) els.maxClientsLabel.textContent = `최대 인원 (2~${cap})`;

        const sel = els.maxClients;
        if (!sel) return;
        const prev = parseInt(sel.value || String(Math.min(4, cap)), 10) || Math.min(4, cap);
        const next = Math.max(2, Math.min(cap, prev));

        sel.innerHTML = "";
        for (let n = cap; n >= 2; n--){
          const o = document.createElement("option");
          o.value = String(n);
          o.textContent = String(n);
          if (n === next) o.selected = true;
          sel.appendChild(o);
        }
      }catch(_){ }
    };

    updateMaxClientsOptions();
    try{ els.gameMode.addEventListener("change", updateMaxClientsOptions); }catch(_){ }

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
    els.createConfirm.addEventListener("click", async ()=>{ closeModal(); await createRoom(); });

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
  // Slightly lower lobby BGM (was a bit loud)
  window.AudioManager.attachAudioManager(el, { label: '로비 음악 켜기', storageKey: 'audio_enabled', volume: 0.42 });
})();