import fs from 'node:fs';
import { RoomDO } from '../cf-worker/src/index.js';
function ok(v,m){if(!v)throw new Error(m)}
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const sp=read('games/starpaint/index.html');
ok(sp.includes('localPickupPrediction={id:String(frontItem.id||\'\')'), 'starpaint local pickup prediction missing');
ok(sp.includes('localPickupPred&&String(it.id||\'\')===String(localPickupPred.id||\'\')'), 'starpaint stale snapshot pickup preservation missing');
ok(sp.includes("spawnFx('shot',p.x+p.face*62"), 'starpaint immediate guest item-use effect preview missing');
ok(sp.includes('function predictGuestHitVisual('), 'starpaint guest hit visual prediction missing');
ok(sp.includes('queueGuestImpactPrediction(me,held,shot,now)'), 'starpaint item impact prediction not connected to guest use');
ok(sp.includes('updateGuestImpactPredictions(dt)'), 'starpaint predicted impact updater not connected');
ok(sp.includes("predictGuestHitVisual(hitPreview.player,me.face*14.5,-4.8,170,'hit')"), 'starpaint empty-hand instant knock preview missing');
ok(sp.includes('p.localHitX=0;p.localHitY=0;p.localHitVX=0;p.localHitVY=0;p.localHitUntil=0'), 'starpaint host correction does not clear predicted knock offset');

const stack=read('games/stackga/js/main.js');
const cpu=read('games/stackga/js/cpu.js');
ok(stack.includes('new CpuController(cpuGame, ((Math.random()*2**32)>>>0), "low")'), 'solo stackga CPU not lowered');
ok(cpu.includes('? 105 : 52'), 'easy CPU action pacing not reduced');

const gk=read('games/geumchikeo/index.html');
ok(gk.includes('SPAM_PENALTY=10'), 'spam penalty is not 10');
ok(gk.includes('normalized===lastOwnChatText'), 'consecutive duplicate block missing');
ok(gk.includes('도배 경고! -${SPAM_PENALTY} 체력'), 'spam warning text missing');

const soc=read('games/soccer/game.js');
ok(soc.includes('now-Number(g.enteredAt||now)>=260'), 'goal net dwell cap missing');
ok(soc.includes('score[team]=Math.max(0,Number(score[team]||0))+1'), 'host immediate goal score missing');
ok(soc.includes('x:FX+FW/2,y:KICKOFF_Y'), 'immediate midfield reset missing');

// Worker lifecycle: lobby/ready reset must happen synchronously, not after visual delay.
const env={LOBBY:{idFromName:()=>'',get:()=>({fetch:async()=>({})})}};
const room=new RoomDO({},env);
room._scheduleLobbyUpdate=()=>{};
const sent=[];
room._broadcast=(t,d)=>sent.push({t,d});
room._stopCpu=()=>{}; room._removeCpuUser=()=>{};
room.meta.phase='playing';room.meta.status='playing';room.meta.mode='starpaint';
room.users.set('h',{nick:'H',ready:true,seat:0,isHost:true});
room.users.set('g',{nick:'G',ready:true,seat:1,isHost:false});
room._endAndBackToLobby(5000);
ok(room.meta.phase==='lobby'&&room.meta.status==='waiting','room phase did not reset immediately');
ok([...room.users.values()].every(u=>u.ready===false),'ready flags did not reset immediately');
ok(sent.some(x=>x.t==='room_state'&&x.d?.meta?.phase==='lobby'),'immediate lobby room_state missing');
if(room._backToLobbyTimer){clearTimeout(room._backToLobbyTimer);room._backToLobbyTimer=null;}
console.log('current-fixes-regression PASS');

// Two-socket same-room replay: after an ended match, guest can ready and host can start again
// without leaving/recreating the room. This exercises the real RoomDO message path.
class MockSocket{
  constructor(name){this.name=name;this.listeners={};this.sent=[];this.closed=false;this._attachment=null;}
  addEventListener(t,fn){(this.listeners[t]||(this.listeners[t]=[])).push(fn)}
  send(raw){try{this.sent.push(JSON.parse(raw))}catch{this.sent.push(raw)}}
  close(){this.closed=true}
  serializeAttachment(v){this._attachment=v}
  deserializeAttachment(){return this._attachment}
  async emit(t,d={}){for(const fn of (this.listeners.message||[]))await fn({data:JSON.stringify({t,d})})}
}
const room2=new RoomDO({},env);
room2._scheduleLobbyUpdate=()=>{};room2._stopCpu=()=>{};room2._removeCpuUser=()=>{};
room2.meta.mode='starpaint';room2.meta.phase='playing';room2.meta.status='playing';room2.meta.ownerUserId='h';room2.meta.maxPlayers=8;
room2.users.set('h',{nick:'H',ready:true,seat:0,isHost:true});
room2.users.set('g',{nick:'G',ready:true,seat:1,isHost:false});
const hs=new MockSocket('h'), gs=new MockSocket('g');
room2.sockets.set(hs,'h');room2.sockets.set(gs,'g');room2.userSockets.set('h',hs);room2.userSockets.set('g',gs);
room2._wireSocket(hs);room2._wireSocket(gs);
room2._endAndBackToLobby(5000);
ok(room2.meta.phase==='lobby','same-room replay: end did not unlock lobby');
await gs.emit('ready',{ready:true});
ok(room2.users.get('g')?.ready===true,'same-room replay: guest could not ready after return');
await hs.emit('start',{});
ok(room2.meta.phase==='playing','same-room replay: host could not start second match in same room');
ok(room2._backToLobbyTimer===null,'same-room replay: stale back-to-room timer survived second start');

// Worker-authoritative soccer scoring: host goal increments exactly once and broadcasts score.
const room3=new RoomDO({},env);
room3._scheduleLobbyUpdate=()=>{}; room3.meta.mode='soccer'; room3.meta.phase='playing'; room3.meta.status='playing'; room3.meta.ownerUserId='h';
room3.users.set('h',{nick:'H',ready:false,seat:0,isHost:true});
room3.users.set('g',{nick:'G',ready:false,seat:1,isHost:false});
const sh=new MockSocket('soc-host'), sg=new MockSocket('soc-guest');
room3.sockets.set(sh,'h');room3.sockets.set(sg,'g');room3.userSockets.set('h',sh);room3.userSockets.set('g',sg);
room3._wireSocket(sh);room3._wireSocket(sg);
room3.sc.phase='playing'; room3.sc.over=false; room3.sc.score={A:0,B:0}; room3.sc.matchDurationMs=120000; room3.sc.playedMs=0; room3.sc.playStartedAt=Date.now();
await sh.emit('sc_goal',{team:'A',restartId:'goal-test-1'});
ok(room3.sc.score.A===1&&room3.sc.score.B===0,'soccer Worker did not increment score');
const firstGoal=sg.sent.find(m=>m?.t==='sc_goal'&&m?.d?.restartId==='goal-test-1');
ok(firstGoal?.d?.scoreA===1&&firstGoal?.d?.scoreB===0,'soccer score broadcast missing/wrong');
room3.sc.phase='playing';
await sh.emit('sc_goal',{team:'A',restartId:'goal-test-1'});
ok(room3.sc.score.A===1,'soccer duplicate goal edge counted twice');
if(room3.sc.transitionTimer){clearTimeout(room3.sc.transitionTimer);room3.sc.transitionTimer=null;}
console.log('two-client-room-and-soccer PASS');
