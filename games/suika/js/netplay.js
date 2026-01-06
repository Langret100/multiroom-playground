// Colyseus Bridge Netplay Stub (no persistence)
// This file replaces Firebase netplay for embedded play inside the main lobby/room app.
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

function _post(msg){
  try{ window.parent?.postMessage(msg, "*"); }catch{}
}

function _ensureInit(){
  if (_init) return Promise.resolve(_init);
  return new Promise((resolve)=>_initWaiters.push(resolve));
}

function _setInit(v){
  _init = v;
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
  window.addEventListener("message", (e)=>{
    const d = e.data || {};
    if (d.type === "bridge_init"){
      _setInit(d);
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
      if (_oppCb){
        _ensureInit().then((init)=>{
          if (d.sid && init.oppSid && d.sid === init.oppSid){
            _oppCb({ pid: d.sid, state: d.state });
          }
        });
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

  // handshake
  _post({ type:"bridge_ready", gameId });
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
