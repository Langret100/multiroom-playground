import { RoomDO } from '../cf-worker/src/index.js';

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const assert = (v,m)=>{ if(!v) throw new Error(m); };
class FakeSocket {
  constructor(name){ this.name=name; this.handlers={message:[],close:[]}; this.sent=[]; }
  addEventListener(t,fn){ (this.handlers[t] ||= []).push(fn); }
  send(raw){ this.sent.push(JSON.parse(raw)); }
  close(){}
  serializeAttachment(){}
  deserializeAttachment(){ return null; }
  async emit(t,d={}){ for(const fn of this.handlers.message||[]) await fn({data:JSON.stringify({t,d})}); }
  messages(t){ return this.sent.filter(x=>x.t===t); }
}
function makeRoom(mode){
  const r=new RoomDO({},{});
  r.meta={roomId:'test',title:'test',mode,maxPlayers:8,phase:'lobby',status:'waiting',ownerUserId:'A'};
  r._scheduleLobbyUpdate=()=>{};
  r._presenceSet=async()=>{};
  r._presenceClear=async()=>{};
  r.users.set('A',{nick:'Host',ready:false,seat:0,isHost:true});
  r.users.set('B',{nick:'Guest',ready:true,seat:1,isHost:false});
  const a=new FakeSocket('A'), b=new FakeSocket('B');
  r.sockets.set(a,'A'); r.sockets.set(b,'B'); r.userSockets.set('A',a); r.userSockets.set('B',b);
  r._wireSocket(a); r._wireSocket(b);
  return {r,a,b};
}

// Soccer: actual RoomDO message path, no compatibility tunnel.
{
  const {r,a,b}=makeRoom('soccer');
  await a.emit('start',{});
  assert(r.meta.phase==='playing','soccer did not enter playing room phase');
  assert(r.sc.phase==='quiz','soccer did not create authoritative quiz round');
  assert(a.messages('sc_round_state').length>0 && b.messages('sc_round_state').length>0,'soccer round snapshot was not broadcast');
  const rid=r.sc.round.id;
  // Force the authoritative round to the play phase without waiting real UI seconds.
  if(r.sc.transitionTimer){ clearTimeout(r.sc.transitionTimer); r.sc.transitionTimer=null; }
  r.sc.round.winner='A'; r.sc.round.tied=false; r.sc.round.resultUntil=Date.now()-1; r.sc.round.kickoffAt=Date.now()-1;
  r.sc.kickoffOwnerSid='A'; r.sc.phase='countdown';
  r._startSoccerPlay(rid);
  assert(r.sc.phase==='playing','soccer did not enter authoritative play phase');
  await a.emit('sc_goal',{team:'A',restartId:'goal-1'});
  assert(r.sc.score.A===1,'soccer goal did not increment score');
  assert(a.messages('sc_goal').at(-1)?.d?.scoreA===1 && b.messages('sc_goal').at(-1)?.d?.scoreA===1,'confirmed soccer score was not broadcast');
  await a.emit('sc_goal',{team:'A',restartId:'goal-1'});
  assert(r.sc.score.A===1,'duplicate soccer goal incremented twice');
  if(r.sc.transitionTimer){ clearTimeout(r.sc.transitionTimer); r.sc.transitionTimer=null; }
  r._endAndBackToLobby(5); await sleep(20);
  assert(r.meta.phase==='lobby','soccer did not return to lobby');
  assert(r.users.get('B').ready===false,'ready state was not reset after game');
  await b.emit('ready',{v:true});
  await a.emit('start',{});
  assert(r.meta.phase==='playing' && r.sc.phase==='quiz','same room could not start a second soccer match');
  if(r.sc.transitionTimer) clearTimeout(r.sc.transitionTimer);
  if(r.sc.timer) clearTimeout(r.sc.timer);
}

// StarPaint: native pb_input and pb_player paths preserve action edge data.
{
  const {r,a,b}=makeRoom('starpaint');
  r.meta.phase='playing'; r.meta.status='playing';
  await b.emit('pb_input',{input:{pickSeq:3,useSeq:4,swapSeq:5,respawnSeq:6,quizRespawn:true,shotAngleDeg:31,shotPower:.72,shotCharged:true}});
  const input=a.messages('pb_input').at(-1)?.d;
  assert(input?.from==='B','StarPaint action sender identity lost');
  assert(input.input.pickSeq===3 && input.input.useSeq===4 && input.input.swapSeq===5,'StarPaint action sequences were stripped');
  assert(input.input.shotAngleDeg===31 && Math.abs(input.input.shotPower-.72)<1e-9 && input.input.shotCharged===true,'StarPaint charged shot metadata was stripped');
  await b.emit('tg_state',{state:{__starpaintMove:{seq:9,x:100,y:200,vx:2,vy:-1,face:-1}}});
  await sleep(60);
  const snap=a.messages('tg_players').at(-1)?.d?.players?.B?.__starpaintMove;
  assert(snap?.seq===9 && snap.x===100,'StarPaint established movement aggregate did not reach peer');
  await a.emit('pb_state',{state:{stateSeq:77,round:2}});
  const state=b.messages('pb_state').at(-1)?.d?.state;
  assert(state?.stateSeq===77,'StarPaint authoritative world state did not reach guest');
  await b.emit('pb_state',{state:{stateSeq:999}});
  assert(r.pb.state?.stateSeq===77,'StarPaint guest was able to overwrite host world state');
}

console.log('ROOT_WORKER_FLOW_REGRESSION_OK');
