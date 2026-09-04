import fs from 'node:fs';
import { RoomDO } from '../cf-worker/src/index.js';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const ok=(v,m)=>{ if(!v) throw new Error(m); };

const room=read('js/pages/room.js');
const worker=read('cf-worker/src/index.js');
const soccer=read('games/soccer/game.js');
const star=read('games/starpaint/index.html');
const stackRoom=room;
const stackCpu=read('games/stackga/js/cpu.js');
const stackMain=read('games/stackga/js/main.js');
const gk=read('games/geumchikeo/index.html');

// StackGa defaults and easy behavior wiring.
ok(stackRoom.includes('localStorage.getItem("cpu_difficulty") || "low"'),'room default CPU is not low');
ok(stackRoom.includes("cpuDiffSelect.value || 'low'"),'room CPU UI fallback is not low');
ok(stackCpu.includes('constructor(game, seed, difficulty = "low")'),'CPU controller default is not low');
ok((stackMain.match(/get\("cpu"\) \|\| "low"/g)||[]).length===2,'embedded StackGa does not use low in both fallback paths');
ok(stackCpu.includes('if(this.diff === "low")') && stackCpu.includes('g.softDrop();'),'low CPU does not use paced soft drop');

// Soccer must have a single Worker-authoritative protocol and immediate goal plane reset.
ok(room.includes('room.onMessage("sc_round_state"') && room.includes('room.onMessage("sc_score_sync"'),'native soccer worker->iframe relay missing');
ok(room.includes('room.send("sc_math_submit"') && room.includes('room.send("sc_pos"'),'native soccer iframe->worker relay missing');
ok(!room.includes('sc_compat') && !soccer.includes('sc_compat'),'duplicate soccer compatibility path remains');
ok(soccer.includes('GOAL_SCORE_LEFT_X = GOAL_PLANE_LEFT_X') && soccer.includes('if(now-g.enteredAt>=180)'),'goal still waits inside net too long');
ok(worker.includes('this.sc.score[team] = Number(this.sc.score[team]||0) + 1'),'soccer score increment is not server authoritative');
ok(worker.includes('if(this.sc.seenGoalIds.includes(goalId))return'),'duplicate soccer goal guard missing');

// Forbidden-word consecutive duplicate penalty.
ok(gk.includes('SPAM_PENALTY=10'),'spam penalty not 10');
ok(gk.includes('normalized===lastOwnChatText'),'consecutive identical word detection missing');
ok(gk.includes('🚨 도배 경고! -${SPAM_PENALTY} 체력'),'spam warning missing');

// Room lifecycle reset.
ok(worker.includes('this.meta.phase = "lobby"') && worker.includes('u.ready = false'),'game end does not reset phase/readiness');
ok(worker.includes('this._broadcast("backToRoom", { resetReady:true })'),'authoritative room return broadcast missing');

// StarPaint: guest action presentation + host-authoritative fast combat presentation.
ok(star.includes('frontItem.taken=true') && star.includes('predictedPickupId'),'guest pickup is not presented immediately');
ok(star.includes('previewGuestItemUse(me,held,now)'),'guest item use immediate presentation missing');
ok(star.includes("parent.postMessage({type:'pb_hit'"),'host-authoritative immediate hit presentation missing');
ok(star.includes("parent.postMessage({type:'pb_fx'"),'immediate combat FX relay missing');
ok(star.includes("if(d.type==='pb_hit'){applyHitPresentation(d.hit);return}"),'guest does not consume hit presentation');
ok(room.includes('room.send("pb_hit"') && room.includes('room.onMessage("pb_hit"'),'room pb_hit bridge incomplete');
ok(room.includes('room.send("pb_fx"') && room.includes('room.onMessage("pb_fx"'),'room pb_fx bridge incomplete');
ok(worker.includes('if (t === "pb_hit")') && worker.includes('if(!sender?.isHost) return;'),'worker pb_hit host authority missing');
ok(worker.includes('if (t === "pb_fx")'),'worker pb_fx relay missing');
ok(room.includes('&v=sp-combat-authority') && !room.includes('&v=sp-startup-fast3'),'StarPaint iframe cache version was not advanced with the runtime fix');

class FakeSocket {
  constructor(){ this.handlers={message:[]}; this.sent=[]; }
  addEventListener(t,fn){ (this.handlers[t] ||= []).push(fn); }
  send(raw){ this.sent.push(JSON.parse(raw)); }
  close(){}
  serializeAttachment(){}
  deserializeAttachment(){ return null; }
  async emit(t,d={}){ for(const fn of this.handlers.message||[]) await fn({data:JSON.stringify({t,d})}); }
  messages(t){ return this.sent.filter(x=>x.t===t); }
}
function makeStarRoom(){
  const r=new RoomDO({},{});
  r.meta={roomId:'x',title:'x',mode:'starpaint',maxPlayers:8,phase:'playing',status:'playing',ownerUserId:'A'};
  r._scheduleLobbyUpdate=()=>{}; r._presenceSet=async()=>{}; r._presenceClear=async()=>{};
  r.users.set('A',{nick:'Host',ready:false,seat:0,isHost:true});
  r.users.set('B',{nick:'Guest',ready:false,seat:1,isHost:false});
  const a=new FakeSocket(),b=new FakeSocket();
  r.sockets.set(a,'A'); r.sockets.set(b,'B'); r.userSockets.set('A',a); r.userSockets.set('B',b);
  r._wireSocket(a); r._wireSocket(b); return {r,a,b};
}
{
  const {r,a,b}=makeStarRoom();
  await a.emit('pb_hit',{hit:{targetSid:'B',vx:20,vy:-7,duration:360}});
  ok(b.messages('pb_hit').at(-1)?.d?.hit?.targetSid==='B','host pb_hit did not reach guest');
  const before=b.messages('pb_hit').length;
  await b.emit('pb_hit',{hit:{targetSid:'A',vx:99,vy:99,duration:700}});
  ok(b.messages('pb_hit').length===before,'guest was allowed to author hit presentation');
  await a.emit('pb_fx',{event:{id:12,type:'rocketburst',x:100,y:200,life:.9}});
  ok(b.messages('pb_fx').at(-1)?.d?.event?.type==='rocketburst','host combat FX did not reach guest');
  const fxBefore=b.messages('pb_fx').length;
  await b.emit('pb_fx',{event:{id:13,type:'fake'}});
  ok(b.messages('pb_fx').length===fxBefore,'guest was allowed to author combat FX');
  r._endAndBackToLobby(1);
  await new Promise(r=>setTimeout(r,8));
  ok(r.meta.phase==='lobby' && [...r.users.values()].every(u=>u.ready===false),'same-room replay reset failed');
}

console.log('FINAL_REQUESTED_FIXES_REGRESSION_OK');
