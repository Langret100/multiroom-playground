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

const gameId = new URLSearchParams(location.search).get("embedGame") || "suika";
const EMBED = new URLSearchParams(location.search).get("embed") === "1";

let _init = null;
let _initWaiters = [];
let _roomCb = null;
let _oppCb = null;
let _evCb = null;

// Robust sid guessing
// - 일부 환경에서 bridge_init(oppSid 포함)가 늦거나 누락될 수 있어
//   첫 duel_state 수신을 기준으로 my/opp sid 를 추정합니다.
let _mySidGuess = null;
let _oppSidGuess = null;

// Parent->iframe init can be missed if the first postMessage happens
// before the iframe finishes attaching listeners. Ping until we receive init.
let _readyPingTimer = null;

function _post(msg){
  try{ window.parent?.postMessage(msg, "*"); }catch{}
}

function _ensureInit(){
  if (_init) return Promise.resolve(_init);
  return new Promise((resolve)=>_initWaiters.push(resolve));
}

function _setInit(v){
  _init = v;
  if (v?.mySid) _mySidGuess = v.mySid;
  if (v?.oppSid) _oppSidGuess = v.oppSid;
  try{ if (_readyPingTimer){ clearInterval(_readyPingTimer); _readyPingTimer=null; } }catch{}
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

  window.addEventListener("message", (e)=>{
    const d = e.data || {};
    if (d.type === "bridge_init"){
      _setInit(d);
      // stop pinging once initialized
      try{ if (_readyPingTimer) clearInterval(_readyPingTimer); }catch{}
      _readyPingTimer = null;
      // push initial room info
      if (_roomCb){
        const players = {};
        if (d.mySid) players[d.mySid] = { name: d.myNick || "Player" };
        if (d.oppSid) players[d.oppSid] = { name: d.oppNick || "Player" };
        _roomCb({ meta: { state: "playing" }, players });
      }
      return;
    }
    if (d.type === "duel_state"){
      const sid = d.sid;
      if (!sid) return;

      // If bridge_init is missing, assume first broadcast is mine.
      if (!_init && !_mySidGuess){
        _mySidGuess = sid;
        return;
      }

      const mySid = (_init?.mySid) || _mySidGuess;
      if (mySid && sid === mySid) return;

      // If oppSid is missing in init, learn it from the first non-me sid.
      if (!_oppSidGuess) _oppSidGuess = sid;

      if (_oppCb){
        _oppCb({ pid: sid, state: d.state });
      }
      return;
    }
    if (d.type === "duel_event"){
      if (_evCb){
        _evCb({ pid: d.sid, event: d.event });
      }
      return;
    }
    if (d.type === "duel_result"){
      // optional: main.js may handle overlay; leave it to parent.
      return;
    }
  });

  // handshake (reliable): send immediately, and retry until init arrives.
  const ping = ()=> _post({ type:"bridge_ready", gameId });
  ping();
  _readyPingTimer = setInterval(()=>{
    if (_init){ try{ clearInterval(_readyPingTimer); }catch{}; _readyPingTimer=null; return; }
    ping();
  }, 400);
}

// --- API compatible surface (subset used by game main.js)
export async function joinLobby({ name } = {}){
  if (!EMBED){
    throw new Error("This build expects to run embedded via the lobby app.");
  }
  const init = await _ensureInit();
  // pid: use mySid so that existing logic treats it as player id
  return { slot: 0, roomId: "embedded", pid: init.mySid, hbTimer: null };
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
  if (_init && _roomCb){
    const d = _init;
    const players = {};
    if (d.mySid) players[d.mySid] = { name: d.myNick || "Player" };
    if (d.oppSid) players[d.oppSid] = { name: d.oppNick || "Player" };
    _roomCb({ meta: { state: "playing" }, players });
  }
  return ()=>{ _roomCb = null; };
}

export async function setRoomState(){ /* no-op */ }

export async function publishMyState({ pid, state } = {}){
  // In embedded mode, send to parent; parent forwards to server.
  const init = await _ensureInit();
  if (init.role === "spectator") return;
  if (!state) return;
  _post({ type:"duel_state", state });
}

export function subscribeOppState({ onOpp } = {}){
  _oppCb = onOpp;
  return ()=>{ _oppCb = null; };
}

export async function pushEvent({ pid, ev, event } = {}){
  const init = await _ensureInit();
  if (init.role === "spectator") return;
  const _e = ev || event;
  if (!_e) return;
  _post({ type:"duel_event", event: _e });
}

export function subscribeEvents({ onEvent } = {}){
  _evCb = ({ event })=>{ try{ onEvent?.(event); }catch{} };
  return ()=>{ _evCb = null; };
}

export async function tryCleanupRoom(){ /* no-op */ }
export async function hardDeleteRoom(){ /* no-op */ }
export async function releaseSlot(){ /* no-op */ }
export async function sweepLobbySlots(){ /* no-op */ }
