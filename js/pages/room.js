
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
  const { makeClient, safeText, nowHHMM, setStatus } = window.Net;

  const q = new URLSearchParams(location.search);
  const roomId = q.get("roomId") || sessionStorage.getItem("pendingRoomId");

  const els = {
    title: document.querySelector("#roomTitle"),
    mode: document.querySelector("#roomMode"),
    players: document.querySelector("#playersList"),
    readyBtn: document.querySelector("#readyBtn"),
    startBtn: document.querySelector("#startBtn"),
    leaveBtn: document.querySelector("#leaveBtn"),
    status: document.querySelector("#roomStatus"),
    canvas: document.querySelector("#gameCanvas"),
    roomChatLog: document.querySelector("#roomChatLog"),
    roomChatInput: document.querySelector("#roomChatInput"),
    roomChatSend: document.querySelector("#roomChatSend"),
  };

  const resultEls = {
    overlay: document.getElementById("resultOverlay"),
    title: document.getElementById("resultTitle"),
    desc: document.getElementById("resultDesc"),
  };

  // Embedded iframe game state
  let duel = {
    active: null, // {gameId,aSid,bSid,aNick,bNick,roundLabel}
    meta: null,
    reportedOver: false,
    iframeReady: false,
    iframeLoaded: false,
    iframeEl: null,
    ui: {}
  };
  let coop = {
    active: false,
    meta: null,
    iframeReady: false,
    iframeLoaded: false,
    level: 1,
  };
  let sim = null;
  let tickRate = 20;

  // Duel/Coop iframe UI refs
  duel.ui.duelUI = document.getElementById("duelUI");
  duel.ui.duelLine = document.getElementById("duelLine");
  duel.ui.duelSub = document.getElementById("duelSub");
  duel.ui.duelBracket = document.getElementById("duelBracket");
  duel.ui.frameWrap = document.getElementById("duelFrameWrap");
  duel.ui.frame = document.getElementById("duelFrame");
  duel.ui.spectate = document.getElementById("duelSpectate");
  duel.ui.spectateScore = document.getElementById("duelSpectateScore");
  duel.ui.specGrid = document.getElementById("spectateGrid");
  duel.ui.specCanvasA = document.getElementById("specCanvasA");
  duel.ui.specCanvasB = document.getElementById("specCanvasB");
  duel.ui.specNameA = document.getElementById("specNameA");
  duel.ui.specNameB = document.getElementById("specNameB");
  duel.ui.specSplitBtn = document.getElementById("spectateSplitBtn");
  duel.ui.specSingleBtn = document.getElementById("spectateSingleBtn");
  duel.ui.specSwapBtn = document.getElementById("spectateSwapBtn");
  duel.iframeEl = duel.ui.frame;

  // Spectator live view (no iframe): render latest duel_state snapshots
  const spec = {
    mode: "split", // split | single
    focus: "A",    // A | B (single mode)
    last: new Map(),
  };

  // Simple tournament UI (client-side from match/result messages)
  const bracket = {
    matches: [],
    activeIdx: -1,
    eliminated: new Set(),
    champion: null,
  };

  function setText(el, t){ if(el) el.textContent = String(t ?? ""); }

  function updateBracketUI(){
    if(!duel.ui.duelBracket) return;
    const host = duel.ui.duelBracket;
    host.innerHTML = "";
    const matches = bracket.matches || [];
    const champName = bracket.champion || null;

    if(!matches.length && !champName) return;

    // Collect roster nicks (for 3p bye display)
    let roster = [];
    try{
      if (room && room.state && room.state.players){
        room.state.players.forEach((p, sid)=> { if(p && p.nick) roster.push({sid, nick: p.nick}); });
      }
    }catch(e){}

    // Partition matches (labels may vary)
    const isSemi = (lbl)=> /준결|semi/i.test(lbl||"");
    const isFinal = (lbl)=> /결승|final/i.test(lbl||"");

    const semis = matches.filter(m => isSemi(m.label || m.labelKor || m.labelEn || m.label));
    const finals = matches.filter(m => isFinal(m.label || m.labelKor || m.labelEn || m.label));
    // Fallback by order
    const semis2 = semis.length ? semis : matches.slice(0, Math.min(2, matches.length-1));
    const finalM = finals[0] || (matches.length>=2 ? matches[matches.length-1] : null);

    const grid = document.createElement("div");
    grid.className = "bracketGrid";
    const colSemi = document.createElement("div");
    colSemi.className = "bracketCol semi";
    const colFinal = document.createElement("div");
    colFinal.className = "bracketCol final";

    function cardForMatch(m, kind){
      const div = document.createElement("div");
      div.className = "bracketCard";
      if(kind) div.classList.add(kind);
      if(m && m.done) div.classList.add("done");
      // active highlight
      const idx = matches.indexOf(m);
      if(idx === bracket.activeIdx) div.classList.add("active");

      const aLose = m && m.loserSid && m.aSid === m.loserSid;
      const bLose = m && m.loserSid && m.bSid === m.loserSid;
      const aName = m ? (aLose ? "✖ " : "") + (m.aNick || "—") : "—";
      const bName = m ? (bLose ? "✖ " : "") + (m.bNick || "—") : "—";
      const tag = (m && (m.label || "")) || (kind==="final" ? "결승" : "준결");

      div.innerHTML = `
        <div class="tag">${safeText(tag, 10)}</div>
        <div class="names">
          <div class="name ${aLose ? "lose":""}">${safeText(aName, 28)}</div>
          <div class="vs">vs</div>
          <div class="name ${bLose ? "lose":""}">${safeText(bName, 28)}</div>
        </div>
      `;
      return div;
    }

    // Semi cards (max 2)
    for (let i=0;i<Math.min(2, semis2.length);i++){
      colSemi.appendChild(cardForMatch(semis2[i], "semi"));
    }

    // If only one semi but we have 3+ roster, show a bye card to keep bracket balanced
    if (colSemi.children.length === 1 && roster.length >= 3){
      // find bye candidate: someone not in semi match
      const semi = semis2[0];
      const used = new Set([semi?.aSid, semi?.bSid].filter(Boolean));
      const bye = roster.find(r => !used.has(r.sid));
      const byeCard = document.createElement("div");
      byeCard.className = "bracketCard semi bye";
      byeCard.innerHTML = `
        <div class="tag">부전승</div>
        <div class="names">
          <div class="name">${safeText(bye ? bye.nick : "—", 28)}</div>
          <div class="vs">대기</div>
          <div class="name muted">결승 직행</div>
        </div>
      `;
      colSemi.appendChild(byeCard);
    }

    // Final card
    if(finalM){
      colFinal.appendChild(cardForMatch(finalM, "final"));
    }else{
      const placeholder = document.createElement("div");
      placeholder.className = "bracketCard final";
      placeholder.innerHTML = `
        <div class="tag">결승</div>
        <div class="names">
          <div class="name">—</div>
          <div class="vs">vs</div>
          <div class="name">—</div>
        </div>
      `;
      colFinal.appendChild(placeholder);
    }

    // Champion badge
    if(champName){
      const champ = document.createElement("div");
      champ.className = "bracketChampion";
      champ.innerHTML = `🏆 ${safeText(champName, 32)}`;
      colFinal.appendChild(champ);
    }

    grid.appendChild(colSemi);
    grid.appendChild(colFinal);
    host.appendChild(grid);
  }

  function resetBracket(){
    bracket.matches = [];
    bracket.activeIdx = -1;
    bracket.eliminated = new Set();
    bracket.champion = null;
    updateBracketUI();
  }

  // ---- Spectator (real view) renderer ----
  function ensureSpecCanvasSize(cv){
    if(!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(180, rect.width);
    const h = Math.max(240, rect.height);
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function drawBoardSnapshot(ctx, state){
    const cv = ctx.canvas;
    const w = cv.width / (window.devicePixelRatio||1);
    const h = cv.height / (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);

    const board = state?.board;
    if(!Array.isArray(board) || !Array.isArray(board[0])){
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px system-ui";
      ctx.fillText("대기 중…", 10, 20);
      return;
    }
    const rows = board.length;
    const cols = board[0].length;
    const cell = Math.floor(Math.min(w/cols, h/rows));
    const ox = Math.floor((w - cell*cols)/2);
    const oy = Math.floor((h - cell*rows)/2);
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.fillRect(0,0,w,h);

    const palette = ["rgba(0,0,0,0)", "#7dd3fc", "#fca5a5", "#fcd34d", "#86efac", "#c4b5fd", "#fdba74", "#fda4af", "#94a3b8"]; // 0..8
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const v = board[y][x] | 0;
        if(!v) continue;
        ctx.fillStyle = palette[Math.max(0,Math.min(8,v))];
        ctx.fillRect(ox + x*cell + 1, oy + y*cell + 1, cell-2, cell-2);
      }
    }
    // outline
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox+0.5, oy+0.5, cell*cols-1, cell*rows-1);
    // score
    const score = state?.score ?? state?.points ?? 0;
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.fillText(`S:${score}`, 10, 18);
  }

  function drawSuikaSnapshot(ctx, state){
    const cv = ctx.canvas;
    const w = cv.width / (window.devicePixelRatio||1);
    const h = cv.height / (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.fillRect(0,0,w,h);

    const objs = state?.objects;
    if(!Array.isArray(objs)){
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "12px system-ui";
      ctx.fillText("대기 중…", 10, 20);
      return;
    }
    // simple cup
    const inset = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(inset, inset, w-2*inset, h-2*inset);

    for(const o of objs){
      const x = inset + (Number(o.x)||0) * (w-2*inset);
      const y = inset + (Number(o.y)||0) * (h-2*inset);
      const idx = Number(o.i)||0;
      const r = 6 + Math.max(0, idx) * 3;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();
    }
    const score = state?.score ?? 0;
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    ctx.fillText(`S:${score}`, 10, 18);
  }

  function updateSpectateLayout(){
    if(!duel.ui.specGrid) return;
    duel.ui.specGrid.classList.toggle("single", spec.mode === "single");
    if (duel.ui.specSwapBtn) duel.ui.specSwapBtn.style.display = (spec.mode === "single") ? "" : "none";

    const panes = duel.ui.specGrid.querySelectorAll(".spectatePane");
    panes.forEach(p=>p.style.display = "");
    if (spec.mode === "single"){
      // show only focus pane
      panes.forEach(p=>{
        const side = p.getAttribute("data-side");
        if (side !== spec.focus) p.style.display = "none";
      });
    }
  }

  function renderSpectate(){
    if(!duel.active) return;
    if(!duel.ui.specCanvasA || !duel.ui.specCanvasB) return;
    ensureSpecCanvasSize(duel.ui.specCanvasA);
    ensureSpecCanvasSize(duel.ui.specCanvasB);
    const ctxA = duel.ui.specCanvasA.getContext("2d");
    const ctxB = duel.ui.specCanvasB.getContext("2d");

    const sA = spec.last.get(duel.active.aSid);
    const sB = spec.last.get(duel.active.bSid);

    // Decide renderer by gameId/state shape
    const gameId = duel.meta?.id || duel.active.gameId;
    const isBoardGame = (gameId === "stackga") || (sA?.board || sB?.board);
    if (isBoardGame){
      drawBoardSnapshot(ctxA, sA);
      drawBoardSnapshot(ctxB, sB);
    } else {
      drawSuikaSnapshot(ctxA, sA);
      drawSuikaSnapshot(ctxB, sB);
    }
  }

  // iframe -> parent bridge
  let lastDuelStateSent = 0;
  let lastTgStateSent = 0;
  window.addEventListener("message", (e)=>{
    const d = e.data || {};
    if (!d || typeof d !== "object") return;
    if (d.type === "bridge_ready"){
      duel.iframeReady = true;
      coop.iframeReady = true;
      // if match already known, init now
      if (duel.active && duel.meta && duel.iframeEl && duel.iframeLoaded){
        sendBridgeInit();
      }
      if (coop.active && coop.meta && duel.iframeEl && coop.iframeLoaded){
        sendCoopBridgeInit();
      }
      return;
    }
    if (!room) return;
    // Togester (coop) iframe -> server relay
    if (d.type === "tg_state"){
      const now = Date.now();
      if (now - lastTgStateSent >= 120){
        lastTgStateSent = now;
        room.send("tg_state", { state: d.state });
      }
      return;
    }
    if (d.type === "tg_button"){
      room.send("tg_button", { idx: d.idx, pressed: d.pressed });
      return;
    }
    if (d.type === "tg_level"){
      room.send("tg_level", { level: d.level });
      return;
    }
    if (d.type === "tg_reset"){
      room.send("tg_reset", { t: d.t });
      return;
    }
    if (d.type === "tg_over"){
      room.send("tg_over", {
        success: !!d.success,
        reason: d.reason
      });
      return;
    }
    if (d.type === "duel_state"){
      const now = Date.now();
      if (now - lastDuelStateSent >= 80){
        lastDuelStateSent = now;
        room.send("duel_state", { state: d.state });
      }
      // auto gameover detect (stackga: dead, suika: over)
      if (!duel.reportedOver && (d.state?.dead || d.state?.over)){
        duel.reportedOver = true;
        room.send("duel_over", {});
      }
      return;
    }
    if (d.type === "duel_event"){
      room.send("duel_event", { event: d.event });
      return;
    }
  });



  let client = null;
  let room = null;

  let myNick = sessionStorage.getItem("nick") || "Player";
  let mySessionId = null;
  let isReady = false;
  let isHost = false;

  // Input state -> 6bit mask
  const inputState = { left:false, right:false, up:false, down:false, a:false, b:false };
  let lastSentMask = 0;


  function maskFromInput(s){
    return (s.left?1:0) | (s.right?2:0) | (s.up?4:0) | (s.down?8:0) | (s.a?16:0) | (s.b?32:0);
  }
  function setInput(key, down){
    switch(key){
      case "ArrowLeft": case "a": case "A": inputState.left = down; break;
      case "ArrowRight": case "d": case "D": inputState.right = down; break;
      case "ArrowUp": case "w": case "W": inputState.up = down; break;
      case "ArrowDown": case "s": case "S": inputState.down = down; break;
      case " ": case "Enter": inputState.a = down; break;
      case "Shift": inputState.b = down; break;
      // touch control keys:
      case "L": inputState.left = down; break;
      case "R": inputState.right = down; break;
      case "U": inputState.up = down; break;
      case "D": inputState.down = down; break;
      case "A": inputState.a = down; break;
      case "B": inputState.b = down; break;
    }
  }

  function maybeSendInputDelta(force=false){
    if (!room) return;
    const m = maskFromInput(inputState);
    if (!force && m === lastSentMask) return;
    lastSentMask = m;
    if (room.state.phase !== "playing") return;
    room.send("input", { mask: m });
  }

  function wireInputs(){
    window.addEventListener("keydown", (e)=>{ setInput(e.key, true); maybeSendInputDelta(); }, { passive:true });
    window.addEventListener("keyup", (e)=>{ setInput(e.key, false); maybeSendInputDelta(); }, { passive:true });

    // Mobile overlay buttons
    const btns = document.querySelectorAll("[data-key]");
    for (const b of btns){
      const k = b.getAttribute("data-key");
      const down = ()=>{ setInput(k, true); maybeSendInputDelta(); };
      const up = ()=>{ setInput(k, false); maybeSendInputDelta(); };
      b.addEventListener("touchstart", (e)=>{ e.preventDefault(); down(); }, { passive:false });
      b.addEventListener("touchend", (e)=>{ e.preventDefault(); up(); }, { passive:false });
      b.addEventListener("touchcancel", (e)=>{ e.preventDefault(); up(); }, { passive:false });
      b.addEventListener("mousedown", (e)=>{ e.preventDefault(); down(); });
      b.addEventListener("mouseup", (e)=>{ e.preventDefault(); up(); });
      b.addEventListener("mouseleave", (e)=>{ e.preventDefault(); up(); });
    }
  }

  function appendRoomChat(m){
    if (!els.roomChatLog) return;
    const line = document.createElement("div");
    line.className = "chatLine";
    const time = m.time || nowHHMM();
    const nick = safeText(m.nick || "?", 24);
    const text = safeText(m.text || "", 200);
    line.innerHTML = `<span class="t">[${time}]</span> <b class="n">${nick}</b>: <span class="m">${text}</span>`;
    els.roomChatLog.appendChild(line);
    els.roomChatLog.scrollTop = els.roomChatLog.scrollHeight;
  }

  function sendRoomChat(){
    if (!room) return;
    const text = safeText(els.roomChatInput.value, 200);
    if (!text.trim()) return;
    room.send("chat", { text });
    els.roomChatInput.value = "";
  }

  function modeLabel(modeId){
    const g = window.gameById ? window.gameById(modeId) : null;
    return g ? g.name : (modeId || "-");
  }

  function renderPlayers(){
    if (!room) return;
    const state = room.state;
    els.players.innerHTML = "";

    // MapSchema iteration
    const entries = [];
    state.players.forEach((p, sid)=> entries.push([sid, p]));
    // sort by seat (order map)
    const seatOf = {};
    state.order.forEach((seat, sid)=> seatOf[sid] = seat);
    entries.sort((a,b)=> (seatOf[a[0]]??99) - (seatOf[b[0]]??99));

    for (const [sid, p] of entries){
      const row = document.createElement("div");
      row.className = "pRow";
      const seat = (seatOf[sid] ?? 0) + 1;
      const host = p.isHost ? "👑" : "";
      const ready = (state.phase === "lobby") ? (p.ready ? "READY" : "WAIT") : "PLAY";
      row.innerHTML = `
        <span class="pSeat">P${seat}</span>
        <span class="pNick">${safeText(p.nick, 20)} ${host}</span>
        <span class="pReady ${p.ready ? "ok" : "muted"}">${ready}</span>
      `;
      els.players.appendChild(row);

      if (sid === mySessionId){
        isHost = !!p.isHost;
        // keep local toggle in sync (server resets ready on backToRoom)
        isReady = !!p.ready;
      }
    }

    // buttons
    els.readyBtn.textContent = isReady ? "레디 해제" : "레디";
    els.startBtn.disabled = !(isHost && state.phase === "lobby" && state.allReady && state.playerCount >= 2);
  }

  function showResultOverlay(r){
    if(!resultEls.overlay) return;

    // Co-op (Togester)
    if (r && r.mode === "togester"){
      const ok = !!r.success;
      const title = ok ? "성공!" : "실패";
      let desc = ok ? "🎉 협동 클리어!" : "💥 전원 사망";
      if (r.reason && typeof r.reason === "string"){
        const rs = r.reason.toLowerCase();
        if (rs.includes("clear") || rs.includes("game")) desc = "🎉 협동 클리어!";
        if (rs.includes("dead") || rs.includes("fail")) desc = "💥 전원 사망";
      }
      setText(resultEls.title, title);
      setText(resultEls.desc, desc);
      resultEls.overlay.classList.remove("hidden");
      resultEls.overlay.setAttribute("aria-hidden", "false");
      return;
    }

    // Update bracket state from result
    try{
      const idx = (bracket.activeIdx >= 0) ? bracket.activeIdx : (bracket.matches.length - 1);
      const m = bracket.matches[idx];
      if (m && r?.winnerSid){
        m.winnerSid = r.winnerSid;
        m.done = true;
        const loser = (m.aSid === r.winnerSid) ? m.bSid : m.aSid;
        m.loserSid = loser;
        bracket.eliminated.add(loser);
      }
      if (r?.done && r?.winnerNick){
        bracket.champion = r.winnerNick;
      }
      updateBracketUI();
    }catch(_){ }

    // Text
    const isParticipant = duel.active && (mySessionId === duel.active.aSid || mySessionId === duel.active.bSid);
    const win = !!r?.winnerSid && r.winnerSid === mySessionId;
    const title = isParticipant ? (win ? "승리!" : "패배") : "경기 종료";
    const desc = r?.done
      ? `🏆 ${safeText(r?.winnerNick || "우승자", 24)} 우승!`
      : `승자: ${safeText(r?.winnerNick || "-", 24)}`;
    setText(resultEls.title, title);
    setText(resultEls.desc, desc);

    resultEls.overlay.classList.remove("hidden");
    resultEls.overlay.setAttribute("aria-hidden", "false");
  }

  function hideResultOverlay(){
    if(!resultEls.overlay) return;
    resultEls.overlay.classList.add("hidden");
    resultEls.overlay.setAttribute("aria-hidden", "true");
  }

  function resizeCanvas(){
    const canvas = els.canvas;
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // keep aspect similar
    const w = Math.max(280, rect.width - 16);
    const h = Math.max(320, Math.min(540, rect.height - 90));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  
function showDuelUI(show){
  if(!duel.ui.duelUI) return;
  duel.ui.duelUI.classList.toggle("hidden", !show);
  // Hide stackga sim UI when duel is active
  const sgUI = document.getElementById("stackgaUI");
  if (sgUI) sgUI.classList.toggle("hidden", show);
}

function postToIframe(msg){
  try{
    if (duel.iframeEl && duel.iframeEl.contentWindow){
      duel.iframeEl.contentWindow.postMessage(msg, "*");
    }
  }catch{}
}

function sendBridgeInit(){
  if (!duel.active || !duel.meta) return;
  const me = mySessionId;
  const isA = (me === duel.active.aSid);
  const isB = (me === duel.active.bSid);
  const role = (isA || isB) ? "player" : "spectator";

  const oppSid = isA ? duel.active.bSid : duel.active.aSid;
  const oppNick = isA ? duel.active.bNick : duel.active.aNick;

  postToIframe({
    type: "bridge_init",
    gameId: duel.meta.id,
    mySid: me,
    myNick: myNick || "Player",
    oppSid,
    oppNick,
    role,
    matchId: `${duel.active.gameId}-${duel.active.roundLabel || ""}-${Date.now()}`
  });
}

function sendCoopBridgeInit(){
  if (!coop.active || !coop.meta) return;
  const seat = (()=>{
    try{
      const s = room?.state?.order?.get(mySessionId);
      return (typeof s === "number") ? s : 0;
    }catch(_){ return 0; }
  })();
  postToIframe({
    type: "bridge_init",
    gameId: coop.meta.id,
    sessionId: mySessionId,
    nick: myNick || "Player",
    seat,
    isHost: !!isHost,
    roomCode: roomId,
    level: coop.level || 1
  });
}

function handleDuelMatch(m){
  // New match begins -> hide previous result overlay (no persistence)
  try{ hideResultOverlay(); }catch(_){ }
  duel.active = m;
  duel.meta = window.gameById ? window.gameById(m.gameId) : { id: m.gameId, type:"duel", embedPath:"" };
  duel.reportedOver = false;

  // Update spectator labels and clear cached snapshots
  try{ setText(duel.ui.specNameA, m.aNick || "A"); }catch(_){ }
  try{ setText(duel.ui.specNameB, m.bNick || "B"); }catch(_){ }
  try{ spec.last.clear(); }catch(_){ }

  // Bracket update (client-side)
  bracket.activeIdx = bracket.matches.length;
  bracket.matches.push({
    label: m.roundLabel || "",
    aSid: m.aSid,
    bSid: m.bSid,
    aNick: m.aNick,
    bNick: m.bNick,
    winnerSid: null,
    loserSid: null,
    done: false,
  });
  updateBracketUI();

  showDuelUI(true);

  // headline
  const line = `${m.roundLabel || ""} ${m.aNick || "A"} vs ${m.bNick || "B"}`.trim();
  if (duel.ui.duelLine) duel.ui.duelLine.textContent = line || "경기 시작";
  if (duel.ui.duelSub) duel.ui.duelSub.textContent = (m.gameId ? `게임: ${duel.meta.name || m.gameId}` : "");

  const me = mySessionId;
  const isPlayer = (me === m.aSid || me === m.bSid);

  if (isPlayer){
    duel.ui.frameWrap?.classList.remove("hidden");
    duel.ui.spectate?.classList.add("hidden");
    // Load iframe fresh
    const src = `${duel.meta.embedPath}?embed=1&embedGame=${encodeURIComponent(duel.meta.id)}&_m=${Date.now()}`;
    duel.iframeLoaded = false;
    duel.iframeReady = false;
    if (duel.iframeEl){
      duel.iframeEl.onload = ()=>{
        duel.iframeLoaded = true;
        // wait for bridge_ready or init anyway
        sendBridgeInit();
      };
      duel.iframeEl.src = src;
    }
  } else {
    duel.ui.frameWrap?.classList.add("hidden");
    duel.ui.spectate?.classList.remove("hidden");
    if (duel.ui.spectateScore) duel.ui.spectateScore.textContent = "";
    updateSpectateLayout();
    renderSpectate();
  }
}

function startCoopEmbed(meta){
  coop.active = true;
  coop.meta = meta;
  coop.iframeLoaded = false;
  coop.iframeReady = false;

  showDuelUI(true);
  // coop에서는 관전/대진 UI를 숨기고 iframe만 사용
  duel.ui.spectate?.classList.add("hidden");
  duel.ui.frameWrap?.classList.remove("hidden");
  if (duel.ui.duelLine) duel.ui.duelLine.textContent = meta?.name || "협동";
  if (duel.ui.duelSub) duel.ui.duelSub.textContent = "";

  const src = `${meta.embedPath}?embed=1&embedGame=${encodeURIComponent(meta.id)}&_m=${Date.now()}`;
  if (duel.iframeEl){
    duel.iframeEl.onload = ()=>{
      coop.iframeLoaded = true;
      sendCoopBridgeInit();
    };
    duel.iframeEl.src = src;
  }
}

function startSim(){
    const modeId = room.state.mode || "tetris4";
    const meta = window.gameById ? window.gameById(modeId) : null;
    if (meta && meta.type === "duel"){
      showDuelUI(true);
      // wait for server match message
      return;
    }
    if (meta && meta.type === "coop" && meta.embedPath){
      startCoopEmbed(meta);
      return;
    }
    showDuelUI(false);
    const ctor = (window.GameSims || {})[modeId];
    if (!ctor){
      setStatus("게임 시뮬레이터를 찾을 수 없습니다(스크립트 누락).", "error");
      return;
    }
    const orderObj = {};
    room.state.order.forEach((seat, sid)=> orderObj[sid] = seat);
    const nicksObj = {};
    try{ room.state.players.forEach((p, sid)=> { nicksObj[sid] = p.nick || sid.slice(0,4); }); }catch{}
    sim = new ctor({ me: mySessionId, order: orderObj, nicks: nicksObj });

    // Mode-specific UI
    const sgUI = document.getElementById("stackgaUI");
    const mainCanvas = els.canvas;
    if (modeId === "stackga"){
      if (sgUI) sgUI.classList.remove("hidden");
      if (mainCanvas) mainCanvas.style.display = "none";
    } else {
      if (sgUI) sgUI.classList.add("hidden");
      if (mainCanvas) mainCanvas.style.display = "";
    }

    // Bind Stackga sub-canvases if supported
    if (typeof sim.bindUI === "function" && modeId === "stackga"){
      sim.bindUI({
        cvMe: document.getElementById("cvMe"),
        cvOpp: document.getElementById("cvOpp"),
        cvNext: document.getElementById("cvNext"),
        meTag: document.getElementById("meTag"),
        oppTag: document.getElementById("oppTag"),
      });
      // when local dies, notify server (tournament logic decides winner)
      sim.onLocalDead = ()=> {
        try{ room.send("sg_over", {}); }catch{}
      };
    }

  }

  function draw(){
    if (!sim) return;
    const ctx = els.canvas.getContext("2d");
    // sim handles drawing
    sim.render(ctx, els.canvas);
    requestAnimationFrame(draw);
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

    myNick = sessionStorage.getItem("nick") || myNick;

    if (!roomId){
      setStatus("방 ID가 없습니다. 로비로 돌아갑니다.", "error");
      setTimeout(()=> location.href="./index.html", 500);
      return;
    }

    try{
      client = makeClient();
      room = await client.joinById(roomId, { nick: myNick });

      mySessionId = room.sessionId;

      // UI header
      els.title.textContent = safeText(room.state.title || "방", 30);
      els.mode.textContent = modeLabel(room.state.mode);
      els.status.textContent = (room.state.phase === "playing") ? "게임중" : "대기중";

      // state listeners
      room.state.onChange = () => {
        els.title.textContent = safeText(room.state.title || "방", 30);
        els.mode.textContent = modeLabel(room.state.mode);
        els.status.textContent = (room.state.phase === "playing") ? "게임중" : "대기중";
        renderPlayers();
      };
      room.state.players.onAdd = renderPlayers;
      room.state.players.onRemove = renderPlayers;
      room.state.order.onAdd = renderPlayers;
      room.state.order.onRemove = renderPlayers;

      room.onMessage("started", (m)=> {
        tickRate = m.tickRate || 20;
        setStatus("", "info");
        // reset per-game transient UI/state
        try{ spec.last.clear(); }catch(_){ }
        try{ if (duel.ui.spectateScore) duel.ui.spectateScore.textContent = ""; }catch(_){ }
        try{ resetBracket(); }catch(_){ }
        coop.level = 1;
        startSim();
      });

      room.onMessage("duel_state", (msg)=>{
        // Relay to embedded iframe
        if (duel.iframeEl) postToIframe({ type:"duel_state", sid: msg.sid, state: msg.state });

        // Spectator real-view: cache latest snapshots and render canvases
        if (duel.active){
          try{ spec.last.set(msg.sid, msg.state || {}); }catch(_){ }
          if (duel.ui.spectate && !duel.ui.spectate.classList.contains("hidden")){
            renderSpectate();
          }
        }

        // Spectator scoreboard (best-effort): show each side's score if available
        if (duel.active && duel.ui.spectate && !duel.ui.spectate.classList.contains("hidden")){
          const a = duel.active.aSid, b = duel.active.bSid;
          const aNick = duel.active.aNick || "A";
          const bNick = duel.active.bNick || "B";
          const score = (msg.state && (msg.state.score ?? msg.state.points ?? msg.state.pt));
          if (score !== undefined && duel.ui.spectateScore){
            // store in dataset
            if (!duel.ui.spectateScore._scores) duel.ui.spectateScore._scores = {};
            duel.ui.spectateScore._scores[msg.sid] = score;
            const sa = duel.ui.spectateScore._scores[a];
            const sb = duel.ui.spectateScore._scores[b];
            const lines = [];
            if (sa !== undefined) lines.push(`${aNick}: ${sa}`);
            if (sb !== undefined) lines.push(`${bNick}: ${sb}`);
            duel.ui.spectateScore.textContent = lines.join(" · ");
          }
        }
      });

      room.onMessage("duel_event", (msg)=>{
        // Relay to embedded iframe
        if (duel.iframeEl) postToIframe({ type:"duel_event", sid: msg.sid, event: msg.event });
      });

      // Togester (coop) relay: server -> iframe
      room.onMessage("tg_players", (msg)=>{
        if (duel.iframeEl) postToIframe({ type:"tg_players", players: msg.players || {} });
      });
      room.onMessage("tg_button", (msg)=>{
        if (duel.iframeEl) postToIframe({ type:"tg_button", idx: msg.idx, pressed: msg.pressed });
      });
      room.onMessage("tg_buttons", (msg)=>{
        if (duel.iframeEl) postToIframe({ type:"tg_buttons", buttons: msg.buttons || {} });
      });
      room.onMessage("tg_level", (msg)=>{
        coop.level = (msg && typeof msg.level === "number") ? msg.level : (parseInt(msg?.level,10) || coop.level || 1);
        if (duel.iframeEl) postToIframe({ type:"tg_level", level: msg.level });
      });
      room.onMessage("tg_reset", (msg)=>{
        if (duel.iframeEl) postToIframe({ type:"tg_reset", t: msg.t });
      });

room.onMessage("frame", (frame)=> {
        // lockstep: server gives inputs for each tick
        if (!sim) return;
        sim.step(frame.inputs || {});
      });

      room.onMessage("match", (m)=> {
        const meta = window.gameById ? window.gameById(m.gameId || room.state.mode) : null;
        if (meta && meta.type === "duel"){
          handleDuelMatch(m);
        } else if (sim && typeof sim.onMatch==="function"){
          sim.onMatch(m);
        }
      });
      room.onMessage("result", (r)=> { showResultOverlay(r); });
      room.onMessage("backToRoom", ()=> {
        hideResultOverlay();
        showDuelUI(false);
        duel.active=null; duel.meta=null;
        coop.active=false; coop.meta=null; coop.iframeLoaded=false; coop.iframeReady=false;
        coop.level = 1;
        isReady = false;
        if(duel.iframeEl) duel.iframeEl.src="about:blank";
        /* stay in room lobby UI */
      });

      room.onMessage("chat", appendRoomChat);
      room.onMessage("system", appendRoomChat);

      // chat ui
      els.roomChatSend.addEventListener("click", sendRoomChat);
      els.roomChatInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter") sendRoomChat(); });

      // Ready / Start
      els.readyBtn.addEventListener("click", ()=>{
        isReady = !isReady;
        room.send("ready", { ready: isReady });
        renderPlayers();
      });
      els.startBtn.addEventListener("click", ()=> room.send("start", {}));

      // Leave
      els.leaveBtn.addEventListener("click", leaveToLobby);

      // start loop
      setInterval(()=> maybeSendInputDelta(true), 500); // keepalive (최대 2회/초) - 방을 나가면 기록 없음
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
      wireInputs();
      // Spectate UI buttons
      duel.ui.specSplitBtn?.addEventListener("click", ()=>{ spec.mode = "split"; updateSpectateLayout(); renderSpectate(); });
      duel.ui.specSingleBtn?.addEventListener("click", ()=>{ spec.mode = "single"; spec.focus = "A"; updateSpectateLayout(); renderSpectate(); });
      duel.ui.specSwapBtn?.addEventListener("click", ()=>{ spec.focus = (spec.focus === "A") ? "B" : "A"; updateSpectateLayout(); renderSpectate(); });
      updateSpectateLayout();
      renderPlayers();

      // Start render loop
      requestAnimationFrame(draw);

      setStatus("", "info");
    }catch(err){
      setStatus("서버에 연결할 수 없습니다. 로비로 돌아갑니다.", "error");
      setTimeout(()=> location.href="./index.html", 800);
    }
  }

  function leaveToLobby(){
    try{
      if (room) room.leave();
    }catch(_){}
    // clear room chat UI (no persistence)
    if (els.roomChatLog) els.roomChatLog.innerHTML = "";
    location.href = "./index.html";
  }

  connect();
})();


// ---- BGM ----
(function(){
  const el = document.getElementById('bgmBattle');
  if (!el || !window.AudioManager) return;
  window.AudioManager.attachAudioManager(el, { label: '방 음악 켜기', storageKey: 'audio_enabled' });
})();
