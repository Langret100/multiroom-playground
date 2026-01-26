// Parent Bridge Netplay Stub (no persistence)
// - iframe(게임) <-> parent(room.html) 간 postMessage 브리지
// - 매칭/상태 릴레이는 parent가 Cloudflare Worker(WebSocket)와 통신하며 처리합니다.
// - Firebase 의존성은 제거되었습니다.
//
// Protocol with parent window (room.html):
// - iframe -> parent: {type:"bridge_ready", gameId}
// - parent -> iframe: {type:"bridge_init", gameId, mySid, myNick, oppSid, oppNick, role, matchId}
// - iframe -> parent: {type:"duel_state", state}
// - iframe -> parent: {type:"duel_event", event}
// - iframe -> parent: {type:"duel_over", payload}
// - parent -> iframe: {type:"duel_state", sid, state}
// - parent -> iframe: {type:"duel_event", sid, event}
// - parent -> iframe: {type:"duel_result", payload}
// - parent -> iframe: {type:"duel_back"}

const gameId = new URLSearchParams(location.search).get("embedGame") || "stackga";
const EMBED = new URLSearchParams(location.search).get("embed") === "1";

let _init = null;
let _initWaiters = [];
let _roomCb = null;
let _oppCb = null;
let _evCb = null;

// Robust: if bridge_init is missed or delayed, guess my/opp sid from first incoming duel_state.
let _mySidGuess = null;
let _oppSidGuess = null;

let _evSeq = 0;

// Parent->iframe init can be missed if the first postMessage happens before
// listeners are attached. Ping until we receive init.
let _readyPingTimer = null;

function _post(msg){
  try{ window.parent?.postMessage(msg, "*"); }catch{}
}

function _ensureInit(){
  if (_init) return Promise.resolve(_init);
  return new Promise((resolve)=>_initWaiters.push(resolve));
}

function _mySid(){
  return (_init && _init.mySid) ? _init.mySid : _mySidGuess;
}

function _oppSid(){
  return (_init && _init.oppSid) ? _init.oppSid : _oppSidGuess;
}

function _makePlayersSnapshot(){
  const me = _mySid() || "me";
  const opp = _oppSid() || "opp";
  const players = {};
  players[me] = { name: (_init && _init.myNick) ? _init.myNick : "Player" };
  players[opp] = { name: (_init && _init.oppNick) ? _init.oppNick : "Opponent" };
  return players;
}

function _setInit(v){
  _init = v;
  try{ if (_readyPingTimer){ clearInterval(_readyPingTimer); _readyPingTimer=null; } }catch{}
  if (v?.mySid) _mySidGuess = v.mySid;
  if (v?.oppSid) _oppSidGuess = v.oppSid;

  for (const w of _initWaiters) w(v);
  _initWaiters = [];

  // Update opponent label if present
  try{
    const oppNick = v?.oppNick || "";
    const el = document.getElementById("oppTag") || document.getElementById("opp-title") || document.getElementById("oppTitle");
    if (el && oppNick) el.textContent = oppNick;
  }catch{}

  // Also update status text if exists
  try{
    const s = document.getElementById("net-status");
    if (s) s.textContent = "연결됨";
  }catch{}

  // Let main know that we are in embedded mode
  window.__EMBED_INIT__ = v;

  // CSS helpers for embedded sizing quirks
  try{ document.body?.classList?.add?.("embed"); }catch{}
}

if (EMBED){
  // Forward the first user gesture to the parent so the parent page can
  // unlock autoplay-restricted audio (e.g., bgmGame in room.html).
  // NOTE: gestures inside an iframe do NOT trigger parent's window listeners.
  // Send gesture pings with throttling (not just once).
  // Reason: the first gesture can happen before the parent enters in-game phase,
  // so sending only once can leave game BGM locked for the whole first round.
  let _lastGestureAt = 0;
  const _sendGesture = ()=>{
    const now = Date.now();
    if (now - _lastGestureAt < 500) return;
    _lastGestureAt = now;
    _post({ type: "gesture", gameId });
  };
  window.addEventListener("pointerdown", _sendGesture, true);
  window.addEventListener("touchstart", _sendGesture, true);
  window.addEventListener("keydown", _sendGesture, true);

  // If the parent posts bridge_init very early (before this module listener is ready),
  // index.html buffers it on window.__PENDING_BRIDGE_INIT__. Consume it here.
  try{
    const pending = window.__PENDING_BRIDGE_INIT__;
    if (pending && typeof pending === "object" && pending.type === "bridge_init"){
      _setInit(pending);
      window.__PENDING_BRIDGE_INIT__ = null;
    }
  }catch(_){ }

  window.addEventListener("message", (e)=>{
    const d = e.data || {};
    if (!d || typeof d !== "object") return;

    if (d.type === "bridge_init"){
      _setInit(d);
      if (_roomCb){
        _roomCb({ meta: { state: "playing" }, players: _makePlayersSnapshot() });
      }
      return;
    }

    if (d.type === "duel_state"){
      const sid = d.sid;
      if (!sid) return;

      // If we don't know my sid yet (no bridge_init), assume the first state broadcast is mine.
      if (!_mySidGuess && !_init){
        _mySidGuess = sid;
        return;
      }

      const me = _mySid();
      if (me && sid === me) return;
      if (!_oppSidGuess) _oppSidGuess = sid;

      if (_oppCb){
        _oppCb({ pid: sid, state: d.state });
      }
      return;
    }

    if (d.type === "duel_event"){
      if (_evCb){
        const key = `ev_${Date.now()}_${++_evSeq}`;
        _evCb({ key, ev: d.event, pid: d.sid });
      }
      return;
    }

    if (d.type === "duel_result"){
      if (_roomCb){
        const winner = d.payload ? (d.payload.winnerSid || d.payload.winner || d.payload.winnerPid) : null;
        _roomCb({ meta: { state: "ended", winner, payload: d.payload }, players: _makePlayersSnapshot() });
      }
      return;
    }

    if (d.type === "duel_back"){
      if (_roomCb){
        _roomCb({ meta: { state: "back" }, players: _makePlayersSnapshot() });
      }
      return;
    }
  });

  // handshake (reliable): send immediately and retry until init arrives.
  const ping = ()=> _post({ type:"bridge_ready", gameId });
  ping();
  _readyPingTimer = setInterval(()=>{
    if (_init){ try{ clearInterval(_readyPingTimer); }catch{}; _readyPingTimer=null; return; }
    ping();
  }, 400);
}

// --- API compatible surface (subset used by game main.js)
export async function joinLobby(){
  if (!EMBED){
    throw new Error("This build expects to run embedded via the lobby app.");
  }
  // Do not block the game if bridge_init is delayed.
  return { slot: 0, roomId: "embedded", pid: _mySid() || "me", hbTimer: null };
}

export function roomRefs(){
  // Firebase refs are not used; we pass lightweight placeholders.
  return {
    metaRef: { kind:"meta" },
    playersRef: { kind:"players" },
    statesRef: { kind:"states" },
    eventsRef: { kind:"events" },
  };
}

export function watchRoom({ onRoom } = {}){
  _roomCb = onRoom;
  if (_roomCb){
    // Always emit a minimal "playing" snapshot so the game can start immediately.
    _roomCb({ meta: { state: "playing" }, players: _makePlayersSnapshot() });
  }
  return ()=>{ _roomCb = null; };
}

export async function setRoomState(){ /* no-op */ }

export async function publishMyState({ state } = {}){
  // In embedded mode, send to parent; parent forwards to server.
  // Do not await bridge_init; room.html already knows the sender sid.
  if (_init?.role === "spectator") return;
  if (!state) return;
  _post({ type:"duel_state", state });
}

export function subscribeOppState({ onOpp } = {}){
  _oppCb = onOpp;
  return ()=>{ _oppCb = null; };
}

export async function pushEvent({ ev, event } = {}){
  if (_init?.role === "spectator") return;
  const _e = ev || event;
  if (!_e) return;
  _post({ type:"duel_event", event: _e });
}

export function subscribeEvents({ onEvent } = {}){
  _evCb = (payload)=>{ try{ onEvent?.(payload); }catch{} };
  return ()=>{ _evCb = null; };
}

export async function tryCleanupRoom(){ /* no-op */ }
export async function hardDeleteRoom(){ /* no-op */ }
export async function releaseSlot(){ /* no-op */ }
export async function sweepLobbySlots(){ /* no-op */ }

// Expose init promise for rare callers
export function __ensureInitForDebug(){ return _ensureInit(); }
