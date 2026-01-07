
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
    maxClients: document.querySelector("#maxClients"),
    chatLog: document.querySelector("#chatLog"),
    chatInput: document.querySelector("#chatInput"),
    chatSend: document.querySelector("#chatSend"),
    usersWrap: document.querySelector("#usersWrap"),
  };

  let client = null;
  let lobbyRoom = null;
  let myNick = null;

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
    els.usersWrap.innerHTML = "";
    for (const u of users){
      const d = document.createElement("div");
      d.className = "userItem";
      d.textContent = u.nick || u.id?.slice(0,6) || "Player";
      els.usersWrap.appendChild(d);
    }
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

      const join = () => {
        sessionStorage.setItem("pendingRoomId", r.roomId);
        location.href = `./room.html?roomId=${encodeURIComponent(r.roomId)}`;
      };

      tr.querySelector("button")?.addEventListener("click", (e)=>{ e.stopPropagation(); join(); });
      tr.addEventListener("click", join);
      tr.addEventListener("keydown", (e)=>{ if (e.key === "Enter") join(); });
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
    const maxClients = Math.max(2, Math.min(4, parseInt(els.maxClients.value||"4",10)||4));

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

      lobbyRoom.onMessage("chat", appendChat);
      lobbyRoom.onMessage("system", appendChat);
      lobbyRoom.onMessage("rooms", (m)=>{
        // Primary room list updates come from LobbyDO push (reduces server usage).
        renderRooms((m && m.list) ? m.list : []);
      });
      lobbyRoom.onMessage("presence", (m) => {
        els.onlineKpi.innerHTML = `접속 인원: <b>${m.online}</b>명`;
        renderUsers(m.users || []);
      });

      lobbyRoom.send("presence", {});
      // Optional one-shot fetch as a fallback (manual refresh is also available)
      await refreshRooms();
      // Fallback polling: ensures 인원/상태가 누락되더라도 로비가 결국 동기화됩니다.
      setInterval(()=>{ try{ refreshRooms(); }catch(_){} }, 5000);
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