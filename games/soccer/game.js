/*
 * Soccer client responsibilities
 * - Worker owns match/round phase, score, kickoff owner and remaining match time.
 * - This iframe owns rendering, local input prediction and host-side ball physics only.
 * - Every authoritative round snapshot is applied through SoccerRoundController.
 * - bridge_ready -> bridge_init -> sc_sync is the only startup synchronization path.
 */
'use strict';

/* ── 임베드/브릿지 (투게스터와 동일한 방식) ─────────────────────────────
 * room.js가 iframe을 열 때 항상 ?embed=1 을 URL에 심어준다. window.self
 * !== window.top 같은 런타임 판정은 일부 모바일 인앱브라우저/웹뷰에서
 * 신뢰할 수 없어서 쓰지 않는다 — 이 값이 어긋나면 아래 두 함수가 통째로
 * 아무 것도 보내지 않게 되어 "상대가 안 보이고 공도 안 움직이는" 증상으로
 * 이어진다.
 */
// SOCCER_AUDIT_20260819: authoritative math-round state + preserved full soccer physics
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window;
if (IS_MOBILE) document.body.classList.add('mobile');

function bridgeSend(type, payload={}){
  if (!EMBED) return;
  // gameId 태그는 room.js가 일부 모바일 WebView의 source=null postMessage도
  // 현재 열려 있는 수학축구 iframe의 패킷으로 안전하게 식별하는 데 쓴다.
  try{ parent.postMessage({ type, gameId:'soccer', ...payload }, '*'); }catch(_){}
}

/* ── 멀티플레이 동기화 구조 / 2026-07 수정 이유 ────────────────────────
 * [기존 증상]
 * bridge_init의 players 명단은 정상 도착해서 양쪽 화면에 캐릭터는 모두
 * 만들어졌지만, 실제 이동은 축구 전용 sc_pos → sc_players 경로에만
 * 의존했다. 배포 환경에서 이 전용 위치 스냅샷이 되돌아오지 않자 각 iframe은
 * 자기 me 좌표만 갱신했고, 상대 캐릭터는 시작 위치에 멈춘 채 남았다.
 * 공 역시 별도 sc_ball 경로만 써서 같은 환경에서 화면끼리 공유되지 않았다.
 *
 * [현재 해결 방식]
 * 이 파일은 계속 sc_pos/sc_ball 형식으로 room.js에 상태를 보낸다. room.js가
 * 이를 다른 협동게임에서 실제 동작이 확인된 tg_state → tg_players 공용 집계
 * 경로에 __game:'soccer' 태그를 붙여 전달한다. 위치뿐 아니라 호스트의 공과
 * 골/스턴/종료 이벤트도 같은 스냅샷에 포함한다. 공용 경로가 일정 시간
 * 응답하지 않을 때만 기존 sc_* 경로를 자동 보조 경로로 사용한다.
 *
 * 두 경로의 좌표를 동시에 적용하면 오래된 스냅샷이 새 좌표를 덮어써서
 * 멈춤/튐이 재발할 수 있다. 따라서 room.js의 주 경로 선택과 __game 태그를
 * 다른 게임의 tg_state 경로와 섞지 말 것.
 */

/* ── 캔버스 / 필드 좌표계 (고정 논리좌표, CSS로만 스케일) ── */
const CW=900, CH=560;
const FX=40, FY=54, FW=820, FH=452;
const GOAL_W=14, GOAL_H=130;
// 배경 에셋은 원근 때문에 논리 사각형의 세로 중앙과 화면 중앙점이 다르다.
const KICKOFF_Y = FY + FH*0.407;
const GOAL_Y1 = FY + FH*0.13, GOAL_Y2 = FY + FH*0.48;
const GOAL_PLANE_LEFT_X = FX - GOAL_W*0.58;
const GOAL_PLANE_RIGHT_X = FX + FW + GOAL_W*0.58;
const PR=17, BR=11;
// 공 전체가 네트 안쪽 깊이까지 들어간 뒤 골을 확정한다. BR 선언 뒤에 둔다.
const GOAL_SCORE_LEFT_X = FX-GOAL_W-BR-8;
const GOAL_SCORE_RIGHT_X = FX+FW+GOAL_W+BR+8;
const KICK_RANGE = PR+BR+16;   // 강슛이 닿는 사거리(접촉보다 살짝 넉넉하게)
const TACKLE_RANGE = PR+5;       // 실제 접촉에 가까운 태클 판정
const DRIBBLE_DISTANCE = PR+BR-1; // 몸에 붙이지 않고 발끝에서 한 박자씩 굴리는 기본 거리
const MAX_BALL_SPEED = 6.35;      // 이동 중 킥이 선수보다 확실히 앞서도록 허용하되 마찰/중력으로 비거리를 제어
const BALL_GRAVITY = 0.061;       // 로프트가 떠 있기만 하지 않고 자연스럽게 내려오게 조정
const BALL_BOUNCE = 0.18;         // 잔디 바운드는 낮고 빠르게 안정됨
const BALL_AIR_DRAG = 0.9965;     // 공중 슛도 지나치게 멀리 뻗지 않게 감쇠
const BALL_GOAL_MAX_Z = 23;      // 배경 골대 크로스바 높이에 맞춘 물리 높이
const GOAL_POST_HALF_Y = 7.5;    // 좌우 골포스트 충돌 두께(공 반지름 포함 전)
const GOAL_CROSSBAR_HALF_Z = 3.4;// 크로스바 충돌 두께
const HEADER_MIN_Z = 10;         // 머리 높이까지 오지 않은 공은 헤딩 불가
const HEADER_MAX_Z = 34;         // 점프 헤딩 가능한 실제 머리 범위
const FIXED_STEP_MS = 1000/60;   // 물리/소유권 판정은 화면 주사율과 무관하게 60Hz 고정
const MAX_FIXED_STEPS = 5;        // 긴 프레임 뒤 과도한 따라잡기 방지
const BALL_PREDICTION_MIN_WAIT_MS = 1600; // 정상 왕복 지연 중에는 예측을 강제로 되감지 않는다
const BALL_PREDICTION_HARD_MAX_MS = 2600; // 응답 유실 시에도 예측이 무한 유지되지는 않게 한다
const BALL_PREDICTION_REJECT_SNAPSHOTS = 12; // 킥 이후 권위 스냅샷이 충분히 왔는데도 확정이 없을 때만 거부로 판단


// 킥 물리의 단일 기준. 호스트 판정과 게스트 즉시 표시가 반드시 같은 값을 쓴다.
function makeKickSpec(charge, dir, playerVX=0, playerVY=0){
  const c=clamp(Number(charge)||0,0,1);
  const fx=Math.cos(dir), fy=Math.sin(dir);
  const forwardRun=Math.max(0,Number(playerVX||0)*fx+Number(playerVY||0)*fy);

  // 정지 킥의 힘과 달리기 관성을 분리한다. 달리는 중에는 공의 첫 속도가
  // 반드시 선수의 전진 속도보다 빨라야 하므로, 단순 가산 뒤 낮은 상한으로
  // 잘라 버리지 않고 "선수 속도 + 분리 여유"를 최저값으로 보장한다.
  const power=1.62+1.28*Math.pow(c,1.72);
  const runningKick=forwardRun>.45;
  const runCarry=runningKick?Math.min(1.70,forwardRun*.40):0;
  // 이동 중 킥은 충전량이 작아도 드리블 속도와 분명히 분리돼야 한다.
  // 선수의 전진속도보다 최소 1.65px/step 빠르게 하고, 낮은 로프트를 항상 준다.
  const separationSpeed=runningKick ? Math.max(forwardRun+1.65+.25*c,5.65+.28*c) : 0;
  const launchSpeed=Math.min(MAX_BALL_SPEED,Math.max(power+runCarry,separationSpeed));
  const loft=runningKick
    ? lerp(1.18,2.05,c)
    : (c<.48?0:lerp(.90,2.18,(c-.48)/.52));
  return {
    charge:c,dir,power,runCarry,forwardRun,runningKick,launchSpeed,
    startLead:DRIBBLE_DISTANCE+Math.min(14.0,forwardRun*2.55),
    loft,vx:fx*launchSpeed,vy:fy*launchSpeed,vz:loft
  };
}

// 한 프레임 공 물리. 호스트와 게스트 예측이 동일한 중력/저항/바운드를 사용한다.
function stepFreeBallState(state, steps=1){
  const count=Math.max(0,Number(steps)||0);
  state.x+=Number(state.vx||0)*count;
  state.y+=Number(state.vy||0)*count;
  state.z=Math.max(0,Number(state.z||0)+Number(state.vz||0)*count);
  state.vz=Number(state.vz||0)-BALL_GRAVITY*count;
  if(state.z<=0&&state.vz<0){
    const impact=Math.abs(state.vz);
    state.z=0;
    state.vz=impact>1.25?impact*BALL_BOUNCE:0;
  }
  const preDragSpeed=Math.hypot(Number(state.vx||0),Number(state.vy||0));
  // 잔디 위 공은 일정 비율로 영원히 미끄러지지 않는다. 느린 패스는 빨리 멈추고,
  // 강하게 찬 공은 초반 속도를 유지하다 속도가 낮아지면 자연스럽게 감속한다.
  let groundDrag=.975;
  if(preDragSpeed>4.20) groundDrag=.920;
  else if(preDragSpeed>3.60) groundDrag=.950;
  else if(preDragSpeed>2.85) groundDrag=.975;
  else if(preDragSpeed>2.05) groundDrag=.985;
  else if(preDragSpeed>1.25) groundDrag=.980;
  else if(preDragSpeed>.70) groundDrag=.966;
  else groundDrag=.948;
  const drag=Math.pow(state.z>0?BALL_AIR_DRAG:groundDrag,count);
  state.vx*=drag; state.vy*=drag;
  if(state.z<=0&&Math.hypot(state.vx,state.vy)<.055){state.vx=0;state.vy=0;}
  const speed=Math.hypot(state.vx,state.vy);
  if(speed>MAX_BALL_SPEED){ state.vx*=MAX_BALL_SPEED/speed; state.vy*=MAX_BALL_SPEED/speed; }
  // 라인 밖 처리는 호스트 규칙 루프에서 킥인/코너/골킥으로 판정한다.
  // 여기서 벽처럼 반사시키면 아웃 상황이 사라지고 골대 뒤로 공이 끼게 된다.
  state.x=clamp(state.x,FX-GOAL_W-BR-92,FX+FW+GOAL_W+BR+92);
  state.y=clamp(state.y,FY-BR-76,FY+FH+BR+76);
  return state;
}

// 발앞 한 점에 공을 고정하지 않고, 이동 속도에 따라 짧은 터치가 반복되도록 한다.
// 호스트 판정과 게스트 표시가 같은 함수를 사용하므로 드리블 위치도 서로 어긋나지 않는다.
function dribbleTargetForPlayer(p, vx, vy, now=Date.now()){
  const speed=Math.hypot(vx||0,vy||0);
  const dir=Number.isFinite(p.dir)?p.dir:0;
  const fx=Math.cos(dir), fy=Math.sin(dir);
  // 드리블 위치를 Date.now() 기반 발 터치 파형으로 만들면 호스트와 게스트의
  // 시계/수신 시점 차이만큼 서로 다른 공 좌표를 계산한다. 공 판정과 화면 위치는
  // 하나의 결정론적 목표를 사용하고, 달리는 느낌은 속도에 따른 앞 간격으로만 낸다.
  const lead=DRIBBLE_DISTANCE+Math.min(7.0,speed*1.05);
  return {x:p.x+fx*lead,y:p.y+fy*lead,speed};
}

const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
// v26: 달리기를 4장이 아닌 8장(왼발 접지·지지·통과·공중 →
// 오른발 접지·지지·통과·공중)으로 다시 그렸다. 모든 캐릭터의 원래 머리,
// 유니폼, 양말, 축구화 색은 유지하고 각 프레임을 같은 270px 전신 높이와
// y=378 발 기준선으로 정렬했다. 예전 4장은 보폭만 좁혔다 넓히며 같은 발이
// 계속 앞에 보여 달리는 대신 미끄러지는 것처럼 보였던 것이 원인이다.
// 공은 어떤 캐릭터 프레임에도 포함하지 않는다.
// 좌석 0/2/4/6은 A1~A4, 1/3/5/7은 B1~B4에 고정 대응한다.
const soccerPlayerSprites={A:new Array(6).fill(null),B:new Array(6).fill(null)};
const SOCCER_SPRITE_CELL=384;
// 팀별 6종 모두 동일한 384px × 20프레임 이미지 스프라이트를 사용한다.
for(const team of ['A','B'])for(let i=0;i<6;i++){
  const img=new Image();
  img.src=`./assets/player-${team.toLowerCase()}${i+1}-v26-run8-crisp.png?v=20260803-v27`;
  soccerPlayerSprites[team][i]=img;
}
function resize(){
  const wrap = document.getElementById('wrap');
  const vw=Math.max(1,wrap.clientWidth), vh=Math.max(1,wrap.clientHeight);
  // 화면을 꽉 채운다. 논리 캔버스 비율과 기기 비율이 다르면 바깥쪽 일부만
  // 자연스럽게 잘리고, 검은 여백이나 별도 점수 영역은 만들지 않는다.
  const scale=Math.max(vw/CW,vh/CH);
  const cssW=Math.ceil(CW*scale), cssH=Math.ceil(CH*scale);
  const dpr=clamp(Number(window.devicePixelRatio)||1,1,2);
  canvas.width=Math.max(1,Math.round(cssW*dpr));
  canvas.height=Math.max(1,Math.round(cssH*dpr));
  canvas.style.width=cssW+'px'; canvas.style.height=cssH+'px';
  ctx.setTransform(canvas.width/CW,0,0,canvas.height/CH,0,0);
  ctx.imageSmoothingEnabled=false;
}
window.addEventListener('resize', resize, { passive:true });
resize();

// 2.5D 투영은 화면 자체에 원근이 들어가므로 기존 확대/추적 카메라는 잠시 비활성화한다.
const camera={x:CW/2,y:CH/2,zoom:1};
function updateCamera(){
  if(!IS_MOBILE||!me){
    camera.zoom=lerp(camera.zoom,1,.18);
    camera.x=lerp(camera.x,CW/2,.18); camera.y=lerp(camera.y,CH/2,.18);
    return;
  }
  const portrait=innerHeight>innerWidth;
  const targetZoom=portrait?1.62:1.28;
  const pp=projectWorld(me.x,me.y,0);
  camera.zoom=lerp(camera.zoom,targetZoom,.12);
  const halfW=CW/(2*camera.zoom), halfH=CH/(2*camera.zoom);
  const tx=clamp(pp.x,halfW,CW-halfW);
  const ty=clamp(pp.groundY,halfH,CH-halfH);
  camera.x=lerp(camera.x,tx,.14); camera.y=lerp(camera.y,ty,.14);
}
function applyWorldCamera(){
  if(Math.abs(camera.zoom-1)<.001) return;
  ctx.translate(CW/2,CH/2);
  ctx.scale(camera.zoom,camera.zoom);
  ctx.translate(-camera.x,-camera.y);
}

/* ── 아주 작은 자체 SFX (부모 window.SFX는 iframe이라 접근 불가라서 자체 구현) ── */
let sfxCtx = null;
let soccerAudioAllowed=(()=>{try{return localStorage.getItem('audio_enabled')==='1';}catch(_){return false;}})();
function setSoccerAudioAllowed(enabled){
  soccerAudioAllowed=!!enabled;
  if(!soccerAudioAllowed&&sfxCtx&&sfxCtx.state==='running'){try{sfxCtx.suspend();}catch(_){ }}
}
function getSfxCtx(){
  if(!soccerAudioAllowed)return null;
  if (sfxCtx) return sfxCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try{ sfxCtx = new Ctx(); }catch(_){ sfxCtx = null; }
  return sfxCtx;
}
function tone(freq, dur, delay, type, vol){
  const c = getSfxCtx(); if (!c) return;
  try{
    const t0 = c.currentTime + (delay||0);
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type||'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol||0.05, t0+0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0+dur+0.02);
  }catch(_){}
}
// 짧은 화이트노이즈를 밴드패스로 걸러 "퍽/쏴아" 하는 타격감/군중 질감을 낸다.
function noiseBurst(dur, delay, vol, bandFreq, Q, decayType){
  const c = getSfxCtx(); if (!c) return null;
  try{
    const t0 = c.currentTime + (delay||0);
    const bufLen = Math.max(1, Math.floor(c.sampleRate*dur));
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufLen;i++) data[i] = (Math.random()*2-1);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(bandFreq||900, t0); bp.Q.setValueAtTime(Q||1.2, t0);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol||0.06, t0+0.01);
    if (decayType==='linear') gain.gain.linearRampToValueAtTime(0.0001, t0+dur);
    else gain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    src.connect(bp); bp.connect(gain); gain.connect(c.destination);
    src.start(t0); src.stop(t0+dur+0.02);
    return { src, gain };
  }catch(_){ return null; }
}
function sfxKick(power){
  tone(200+power*220, 0.09, 0, 'square', 0.05+power*0.03);
  noiseBurst(0.07, 0, 0.09+power*0.05, 1400+power*900, 2.2);
}
function sfxSwing(power){ tone(600+power*260, 0.05, 0, 'sine', 0.025+power*0.02); }
function sfxHeader(){
  tone(185,0.065,0,'triangle',0.055);
  noiseBurst(0.055,0,0.075,720,1.8);
}
function sfxBounce(strength){
  const k=clamp(Number(strength)||0,0,1);
  tone(105+k*75,0.055,0,'triangle',0.022+k*.035);
  noiseBurst(0.045,0,0.025+k*.045,420+k*380,1.5);
}
function sfxAirWhoosh(power){
  const k=clamp(Number(power)||0,0,1);
  noiseBurst(0.10,0.015,0.025+k*.035,1200+k*900,.8,'linear');
}
function sfxTackle(){
  tone(120, 0.12, 0, 'sawtooth', 0.05); tone(90, 0.1, 0.05, 'sawtooth', 0.04);
  noiseBurst(0.14, 0, 0.14, 350, 1.4);
}
function sfxGoal(){
  tone(660,0.12,0,'triangle',0.07); tone(880,0.14,0.09,'triangle',0.07); tone(1180,0.18,0.18,'triangle',0.07);
  sfxCheer();
}
function sfxCheer(){
  // 긴 백색소음은 일부 모바일 오디오 장치에서 '지이익'으로 들린다.
  // 짧은 음정 스웰만 사용해 득점 효과와 실제 BGM을 분리한다.
  tone(520,0.18,0,'triangle',0.035);
  tone(700,0.20,0.08,'triangle',0.04);
  tone(920,0.24,0.16,'triangle',0.045);
}
function sfxStun(){ tone(300,0.08,0,'sine',0.04); tone(220,0.08,0.06,'sine',0.03); }
function sfxTick(){ tone(880, 0.05, 0, 'square', 0.05); }
function sfxMathCorrect(){ tone(740,0.07,0,'square',0.045);tone(1040,0.10,0.065,'triangle',0.055); }
function sfxMathWrong(){ tone(210,0.10,0,'sawtooth',0.05);tone(145,0.13,0.13,'square',0.045); }
function sfxMathReveal(){ tone(520,0.06,0,'square',0.035); }
function sfxMathResult(winner){
  sfxWhistle(false);tone(winner==='A'?760:700,0.11,0.18,'triangle',0.055);tone(winner==='A'?980:920,0.16,0.30,'triangle',0.06);
}
function sfxWhistle(long){
  const dur = long ? 0.55 : 0.22;
  tone(2400, dur, 0, 'sine', 0.06);
  tone(2380, dur, 0.02, 'sine', 0.04);
  if (long){ tone(2400, 0.3, dur+0.12, 'sine', 0.06); }
}
let lastGesturePing=0;
function primeSfx(){
  try{ const c=getSfxCtx(); if (c && c.state==='suspended') c.resume(); }catch(_){}
  // iframe 안의 키/터치 제스처는 부모 문서로 전파되지 않는다. 부모에게
  // 명시적으로 알려 autoplay 잠금이 걸린 실제 축구 BGM을 해제한다.
  const now=Date.now();
  if(now-lastGesturePing>500){
    lastGesturePing=now;
    bridgeSend('gesture');
  }
}

/* ── 입력 ── */
const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true; primeSfx();
  if (e.code === 'KeyZ' || e.code === 'Space') beginKickCharge();
  if (e.code === 'KeyX') tryHeader();
  if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryTackle();
  if (['KeyZ','KeyX','KeyC','Space','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault();
}, { passive:false });
window.addEventListener('keyup', e=>{
  keys[e.code]=false;
  if (e.code === 'KeyZ' || e.code === 'Space') releaseKickCharge();
  if (e.code === 'KeyZ' || e.code === 'Space') e.preventDefault();
}, { passive:false });

let joyDX=0, joyDY=0, joyTouchId=null;
const joyEl = document.getElementById('joy'), joyStickEl = document.getElementById('joyStick');
function joyReset(){ joyDX=0; joyDY=0; joyStickEl.style.transform='translate(0,0)'; }
function joyHandle(t){
  const r = joyEl.getBoundingClientRect();
  const cx = r.left+r.width/2, cy = r.top+r.height/2;
  let dx=(t.clientX-cx)/(r.width/2), dy=(t.clientY-cy)/(r.height/2);
  const len=Math.hypot(dx,dy);
  if(len>1){ dx/=len; dy/=len; }
  joyDX=dx; joyDY=dy;
  joyStickEl.style.transform = `translate(${dx*34}px, ${dy*34}px)`;
}
joyEl.addEventListener('touchstart', e=>{
  const t=e.changedTouches[0]; joyTouchId=t.identifier; joyHandle(t); e.preventDefault(); primeSfx();
}, { passive:false });
joyEl.addEventListener('touchmove', e=>{
  for(const t of e.changedTouches){ if(t.identifier===joyTouchId){ joyHandle(t); e.preventDefault(); } }
}, { passive:false });
window.addEventListener('touchend', e=>{
  for(const t of e.changedTouches){ if(t.identifier===joyTouchId){ joyTouchId=null; joyReset(); } }
}, { passive:true });
window.addEventListener('touchcancel', e=>{ joyTouchId=null; joyReset(); }, { passive:true });

// 모바일 킥/헤딩/태클 버튼
const kickBtnEl = document.getElementById('kickBtn');
const jumpBtnEl = document.getElementById('jumpBtn');
const tackleBtnEl = document.getElementById('tackleBtn');
const kickChargeFillEl = document.getElementById('kickChargeFill');
const headerCoolFillEl=document.getElementById('headerCoolFill');
const tackleCoolFillEl=document.getElementById('tackleCoolFill');
kickBtnEl.addEventListener('touchstart', e=>{ e.preventDefault(); primeSfx(); beginKickCharge(); }, { passive:false });
kickBtnEl.addEventListener('touchend',   e=>{ e.preventDefault(); releaseKickCharge(); }, { passive:false });
kickBtnEl.addEventListener('touchcancel',e=>{ e.preventDefault(); releaseKickCharge(); }, { passive:false });
jumpBtnEl.addEventListener('touchstart', e=>{ e.preventDefault(); primeSfx(); tryHeader(); }, { passive:false });
tackleBtnEl.addEventListener('touchstart', e=>{ e.preventDefault(); primeSfx(); tryTackle(); }, { passive:false });

/* ── 게임 상태 ── */
let mySid='', myNick='Player', mySeat=-1, isHost=false, roster=[];
// Backwards-compatible math-round relay. This intentionally uses the old
// tg_state -> tg_players transport via room.js, so the deployed Worker does not
// need new soccer-specific packet handlers.
let soccerCompatHostSid='';
let soccerCompatSerial=0;
let soccerCompatRound=null;
let soccerCompatScores={};
let soccerCompatSeenSubmit={};
let soccerCompatTickTimer=0;
let soccerCompatLastHostVersion=0;
let soccerCompatLastSubmit=null;

let players={};      // sid -> {x,y,netX,netY,netVX,netVY,netT, seat,team,nick,color,dir,kickAt,kickCharge,tackle,_lastKickAt}
let me=null;
let ball={x:FX+FW/2,y:KICKOFF_Y,z:0,vx:0,vy:0,vz:0,owner:null,ownerUntil:0,lastKicker:null,noPickupUntil:0};
let netBall={x:FX+FW/2,y:KICKOFF_Y,z:0,vx:0,vy:0,vz:0,netX:FX+FW/2,netY:KICKOFF_Y,netZ:0,netVX:0,netVY:0,netVZ:0,netT:0,owner:null,samples:[],lastKicker:null,noPickupUntil:0};
let localDribbleVisualUntil=0;
let score={A:0,B:0};
let startTs=0, durationMs=120000;
let gameInitialized=false, gameActive=false, gameOver=false;
let pendingSoccerSnapshot=null;
const soccerRoundController = new SoccerRoundCore.SoccerRoundController();
let initialKickoffResolved=false;
let lastPosSent=0, lastBallSent=0, localStateSeq=0;
function nextStateSeq(){ return ++localStateSeq; }
let stunUntilMap = {};       // sid -> 스턴 해제 시각(ms)
let particles = [];          // 골 세리머니/충격 파티클
let rings = [];               // 킥/태클 충격파 링 {x,y,r,alpha,color}
let ballTrail = [];           // 빠른 공 뒤에 남는 잔상
let shakeUntil = 0, shakeMag = 0;   // 화면 흔들림
let kickoffUntil = 0;         // 이 시각까지는 킥오프 카운트다운
let restartLockUntil = 0;      // 골 직후 세리머니+카운트다운 전체 잠금
let restartTimer = 0;
let restartGeneration = 0;
let kickoffSoundsDone = new Set();
let soccerServerOffset=0;
let soccerClockSynced=false;
function soccerNow(){return Date.now()+soccerServerOffset;}

// 경기 시작(10초)과 득점 후 재시작(5초)에 사용하는 초3 덧셈·뺄셈 퀴즈
const mkEl=document.getElementById('mathKickoff'),mkPanel=document.getElementById('mkPanel'),mkTitle=document.getElementById('mkTitle'),mkPhase=document.getElementById('mkPhase'),mkSub=document.getElementById('mkSub'),mkTimer=document.getElementById('mkTimer'),mkProblem=document.getElementById('mkProblem'),mkChoices=document.getElementById('mkChoices'),mkMe=document.getElementById('mkMe'),mkHelp=document.getElementById('mkHelp'),mkResult=document.getElementById('mkResult'),mkCoin=document.getElementById('mkCoin'),mkTeamA=document.getElementById('mkTeamA'),mkTeamB=document.getElementById('mkTeamB'),mkTeamALabel=document.getElementById('mkTeamALabel'),mkTeamBLabel=document.getElementById('mkTeamBLabel'),mkFeedback=document.getElementById('mkFeedback');
let mathKickoff={roundId:'',kind:'initial',phase:'idle',seed:0,beginsAt:0,endsAt:0,kickoffAt:0,questionIndex:0,correct:0,confirmedCorrect:0,solved:false,submitted:false,current:null,result:null,raf:0,feedbackBusy:false,feedbackTimer:0,feedbackHideTimer:0,revealTimers:[],feedbackToken:0};
let soccerRoundSyncWatchdog=0;

function armSoccerRoundSyncWatchdog(){
  if(soccerRoundSyncWatchdog)clearTimeout(soccerRoundSyncWatchdog);
  soccerRoundSyncWatchdog=setTimeout(()=>{
    soccerRoundSyncWatchdog=0;
    if(mathKickoff.roundId||soccerRoundController.hasSnapshot)return;
    gameActive=false;startTs=0;
    showOverlay('실시간 서버 업데이트 필요','수학축구 라운드 정보가 오지 않았습니다. Cloudflare Worker를 이 소스와 함께 배포해 주세요.');
  },3500);
}

function clearSoccerRoundSyncWatchdog(){
  if(!soccerRoundSyncWatchdog)return;
  clearTimeout(soccerRoundSyncWatchdog);soccerRoundSyncWatchdog=0;
}
function seededRand(seed){let x=(seed|0)||123456789;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%1000000)/1000000;};}
function hashText(t){let h=2166136261;for(const ch of String(t||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function clearMathTimeouts(){
  if(mathKickoff.feedbackTimer){try{clearTimeout(mathKickoff.feedbackTimer);}catch(_){ }mathKickoff.feedbackTimer=0;}
  if(mathKickoff.feedbackHideTimer){try{clearTimeout(mathKickoff.feedbackHideTimer);}catch(_){ }mathKickoff.feedbackHideTimer=0;}
  if(Array.isArray(mathKickoff.revealTimers)){
    for(const t of mathKickoff.revealTimers){try{clearTimeout(t);}catch(_){ }}
  }
  mathKickoff.revealTimers=[];mathKickoff.feedbackBusy=false;mathKickoff.feedbackToken++;
}
function queueMathTimeout(fn,ms){const t=setTimeout(fn,ms);mathKickoff.revealTimers.push(t);return t;}
function clearMathFeedback(){mkFeedback.className='mk-feedback';mkFeedback.textContent='';}
function showMathFeedback(ok,text,durationMs){
  const token=++mathKickoff.feedbackToken;clearMathFeedback();mkFeedback.textContent=text;mkFeedback.className=`mk-feedback show ${ok?'good':'bad'}`;
  if(mathKickoff.feedbackHideTimer){try{clearTimeout(mathKickoff.feedbackHideTimer);}catch(_){ }}
  mathKickoff.feedbackHideTimer=setTimeout(()=>{if(token!==mathKickoff.feedbackToken)return;clearMathFeedback();mathKickoff.feedbackHideTimer=0;},Math.max(120,durationMs||240));
}
function mathProgressHint(){return '제한시간 동안 팀 정답 합계를 최대한 높이세요! 정답은 바로 다음 문제, 오답은 0.6초 쉬어요!';}
function makeMathQuestion(index){
  // All players get different operands, but the same question number uses the same
  // difficulty lane. This keeps the team race fairer without making teammates see
  // an identical answer they can simply copy from each other.
  const lane=((mathKickoff.seed>>>3)+Math.max(0,index|0))&3;
  const rnd=seededRand((mathKickoff.seed^hashText(mySid)^Math.imul(index+1,2654435761))>>>0);
  let a,b,answer,add;
  const digit=(min,max)=>min+Math.floor(rnd()*(max-min+1));
  if(lane===0){
    // Addition without carrying in the ones place.
    add=true;
    const a1=digit(0,8), b1=digit(0,9-a1);
    const at=digit(1,7), bt=digit(1,Math.max(1,8-at));
    a=at*10+a1;b=bt*10+b1;answer=a+b;
  }else if(lane===1){
    // Subtraction without borrowing.
    add=false;
    const bt=digit(1,7), at=digit(bt,9);
    const b1=digit(0,9), a1=digit(b1,9);
    a=at*10+a1;b=bt*10+b1;
    if(b> a){const t=a;a=b;b=t;}
    answer=a-b;
  }else if(lane===2){
    // Addition with carrying; keep the total at or below 100.
    add=true;
    let guard=0;
    do{
      const a1=digit(1,9), b1=digit(Math.max(1,10-a1),9);
      const at=digit(1,7), bt=digit(1,8-at);
      a=at*10+a1;b=bt*10+b1;answer=a+b;
    }while(answer>100&&++guard<30);
  }else{
    // Subtraction with borrowing.
    add=false;
    const at=digit(2,9), bt=digit(1,at-1);
    const a1=digit(0,8), b1=digit(a1+1,9);
    a=at*10+a1;b=bt*10+b1;answer=a-b;
  }
  const set=new Set([answer]);
  while(set.size<4){
    const delta=(1+Math.floor(rnd()*12))*(rnd()<.5?-1:1);
    set.add(Math.max(0,Math.min(100,answer+delta)));
  }
  const choices=[...set];for(let i=choices.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
  return {text:`${a} ${add?'+':'−'} ${b} = ?`,answer,choices,lane};
}
function renderMathQuestion(question){
  if(!question)return;mkProblem.textContent=question.text;mkChoices.innerHTML='';clearMathFeedback();
  for(const value of question.choices){const b=document.createElement('button');b.className='mk-choice';b.textContent=value;b.onclick=()=>answerMathQuestion(value,b);mkChoices.appendChild(b);}
}
function showNextMathQuestion(forceNew=true){
  if(mathKickoff.phase!=='quiz')return;
  if(forceNew||!mathKickoff.current)mathKickoff.current=makeMathQuestion(mathKickoff.questionIndex++);
  renderMathQuestion(mathKickoff.current);
}
function sendMathProgress(final=false,answeredAt=null,questionIndex=null,answer=null){
  const stamp=Number.isFinite(Number(answeredAt))?Number(answeredAt):soccerNow();
  const payload={roundId:mathKickoff.roundId,final:!!final,answeredAt:stamp};
  // The Worker owns quiz scoring. A correct click sends only the exact question
  // sequence number and selected answer; the server regenerates the deterministic
  // question from round seed + uid and increments the score only after validation.
  if(Number.isInteger(questionIndex)&&Number.isFinite(Number(answer))){
    payload.questionIndex=questionIndex;
    payload.answer=Number(answer);
  }
  // Compatibility mode: send the locally validated cumulative score through
  // the generic relay. The host is the sole authority that totals both teams.
  soccerCompatLastSubmit={
    kind:'submit', roundId:String(mathKickoff.roundId||''),
    score:Math.max(0,Number(mathKickoff.correct||0)), final:!!final,
    at:stamp, nonce:`${mySid}:${String(mathKickoff.roundId||'')}:${Math.max(0,Number(mathKickoff.correct||0))}:${final?1:0}`
  };
  bridgeSend('sc_compat',{packet:soccerCompatLastSubmit});
}
function answerMathQuestion(value,btn){
  const clickedAt=soccerNow();
  if(mathKickoff.phase!=='quiz'||mathKickoff.feedbackBusy||clickedAt>=mathKickoff.endsAt)return;
  const ok=Number(value)===Number(mathKickoff.current?.answer);mathKickoff.feedbackBusy=true;
  for(const b of mkChoices.children)b.disabled=true;btn.classList.add(ok?'good':'bad');
  if(ok){
    const answeredQuestionIndex=Math.max(0,mathKickoff.questionIndex-1);
    mathKickoff.correct++;sfxMathCorrect();showMathFeedback(true,'정답!',230);
    mkMe.textContent=`내 정답 ${mathKickoff.correct}개`;mkHelp.textContent='좋아요! 바로 다음 문제로 갑니다';sendMathProgress(false,clickedAt,answeredQuestionIndex,value);
    mathKickoff.feedbackTimer=setTimeout(()=>{mathKickoff.feedbackBusy=false;mathKickoff.feedbackTimer=0;if(mathKickoff.phase==='quiz'&&soccerNow()<mathKickoff.endsAt)showNextMathQuestion(true);},240);
    return;
  }
  sfxMathWrong();mkMe.textContent='오답! 0.6초 뒤 같은 문제를 다시 풀어요';mkHelp.textContent='막 찍기 방지! 0.6초 동안 다시 누를 수 없어요';showMathFeedback(false,'X',620);
  mathKickoff.feedbackTimer=setTimeout(()=>{
    mathKickoff.feedbackBusy=false;mathKickoff.feedbackTimer=0;if(mathKickoff.phase!=='quiz'||soccerNow()>=mathKickoff.endsAt)return;
    mkMe.textContent=`내 정답 ${mathKickoff.correct}개`;mkHelp.textContent=mathProgressHint();showNextMathQuestion(false);
  },620);
}
function submitMathScore(){if(mathKickoff.submitted)return;mathKickoff.submitted=true;sendMathProgress(true);}
function startMathKickoff(data){
  const rid=String(data.roundId||'');if(!rid||rid===mathKickoff.roundId&&mathKickoff.phase!=='done'&&mathKickoff.phase!=='idle')return;
  clearMathTimeouts();clearMathFeedback();mkPanel.classList.remove('redwin','bluewin');mkResult.className='mk-result';
  mathKickoff.roundId=rid;mathKickoff.kind=data.kind==='restart'?'restart':'initial';mathKickoff.seed=Number(data.seed||1);mathKickoff.beginsAt=Number(data.beginsAt||soccerNow());mathKickoff.endsAt=Number(data.endsAt||mathKickoff.beginsAt+(mathKickoff.kind==='restart'?5000:10000));mathKickoff.kickoffAt=Number(data.kickoffAt||mathKickoff.endsAt+3600);mathKickoff.phase='waiting';mathKickoff.correct=Math.max(0,Number(data.selfRoundScore||0));mathKickoff.confirmedCorrect=mathKickoff.correct;mathKickoff.solved=false;mathKickoff.questionIndex=mathKickoff.correct;mathKickoff.submitted=false;mathKickoff.result=null;mathKickoff.current=null;
  gameActive=false;restartLockUntil=Math.max(restartLockUntil,Date.now()+Math.max(0,mathKickoff.kickoffAt-soccerNow()));kickoffUntil=0;clearRoundActions();ball.owner=null;netBall.owner=null;
  mkEl.classList.add('show');mkResult.textContent='';mkCoin.classList.remove('show');mkTeamA.textContent=String(Number(data.scoreA||0));mkTeamB.textContent=String(Number(data.scoreB||0));mkTeamALabel.textContent='정답 합계';mkTeamBLabel.textContent='정답 합계';mkMe.textContent=`내 정답 ${mathKickoff.correct}개`;mkHelp.textContent=mathProgressHint();mkProblem.textContent='준비!';mkChoices.innerHTML='';
  mkTitle.textContent=mathKickoff.kind==='restart'?'⚽ 득점 후 선공 결정':'⚽ 선·후공 결정';mkPhase.textContent=mathKickoff.kind==='restart'?'재시작 문제' : '첫 경기';
  mathKickoffFrame();
}
function mathKickoffFrame(){
  cancelAnimationFrame(mathKickoff.raf);const now=soccerNow();
  if(mathKickoff.phase==='waiting'){
    if(now>=mathKickoff.beginsAt){mathKickoff.phase='quiz';mkSub.textContent=mathKickoff.kind==='restart'?'5초 동안 최대한 많이 맞혀 재시작 선공을 차지하세요!':'10초 동안 최대한 많이 맞혀 첫 선공을 차지하세요!';mkHelp.textContent=mathProgressHint();showNextMathQuestion(true);}
    else{mkProblem.textContent='준비!';mkChoices.innerHTML='';mkTimer.textContent=Math.max(0,(mathKickoff.beginsAt-now)/1000).toFixed(1);}
  }
  if(mathKickoff.phase==='quiz'){
    const left=mathKickoff.endsAt-now;mkTimer.textContent=Math.max(0,left/1000).toFixed(1);mkTimer.classList.toggle('danger',left>0&&left<=3000);if(left<=0){mathKickoff.phase='submitted';submitMathScore();mkProblem.textContent='결과 집계중…';mkChoices.innerHTML='';mkSub.textContent='양 팀의 정답 결과를 확인하고 있습니다';mkHelp.textContent='잠시만요! 곧 선공 팀이 정해집니다';clearMathFeedback();}}
  if(mathKickoff.phase!=='done'&&mathKickoff.phase!=='result')mathKickoff.raf=requestAnimationFrame(mathKickoffFrame);
}
function handleMathAck(d){
  const localRoundId=String(mathKickoff.roundId||'');
  const ackRoundId=String(d.roundId||'');
  const activeRoundId=String(d.activeRoundId||ackRoundId);
  // A delayed ACK from the previous round must never rewrite the score/problem index
  // of a newer round. Ask for the current authoritative snapshot instead.
  if(activeRoundId&&activeRoundId!==localRoundId){bridgeSend('sc_sync',{});return;}
  if(ackRoundId!==localRoundId)return;
  const serverScore=Math.max(0,Number(d.score||0));
  const expected=Math.max(0,Math.floor(Number(d.expectedQuestionIndex??serverScore)||0));
  if(Number.isFinite(Number(d.serverNow))&&Number(d.serverNow)>0&&!soccerClockSynced){
    soccerServerOffset=Number(d.serverNow)-Date.now();
  }
  if(d.accepted){
    mathKickoff.confirmedCorrect=Math.max(mathKickoff.confirmedCorrect||0,serverScore);
    if(mathKickoff.correct<serverScore){
      mathKickoff.correct=serverScore;
      mkMe.textContent=`내 정답 ${mathKickoff.correct}개`;
    }
    return;
  }
  // A correct answer is shown optimistically for responsiveness. If the Worker rejects
  // it (rare clock edge, reconnect, or sequence mismatch), restore the exact server
  // score/question instead of letting every later answer fail for the rest of the round.
  mathKickoff.confirmedCorrect=serverScore;
  if(mathKickoff.phase!=='quiz'||soccerNow()>=mathKickoff.endsAt)return;
  clearMathTimeouts();
  mathKickoff.correct=serverScore;
  mathKickoff.questionIndex=expected;
  mathKickoff.current=null;
  mathKickoff.feedbackBusy=false;
  mkMe.textContent=`내 정답 ${serverScore}개`;
  mkHelp.textContent='서버와 문제 순서를 맞췄어요. 계속 풀어보세요!';
  showMathFeedback(false,'동기화',300);
  showNextMathQuestion(true);
}

function applyMathResult(d){
  const incomingRoundId=String(d.roundId||'');
  if(!incomingRoundId)return;
  // 재접속/늦은 진입으로 RESULT 상태부터 받은 경우에도 roundId를 기준으로
  // 최소 결과 UI 상태를 복구해 다음 COUNTDOWN 전환을 놓치지 않는다.
  if(incomingRoundId!==mathKickoff.roundId){
    if(mathKickoff.phase!=='idle'&&mathKickoff.phase!=='done')return;
    mathKickoff.roundId=incomingRoundId;
    mathKickoff.kind=d.kind==='restart'?'restart':'initial';
    mathKickoff.submitted=true;
    mathKickoff.correct=Math.max(0,Number(d.selfRoundScore||0));
    mathKickoff.solved=false;
    mkEl.classList.add('show');
    mkTitle.textContent=mathKickoff.kind==='restart'?'⚽ 득점 후 선공 결정':'⚽ 선·후공 결정';
    mkPhase.textContent=mathKickoff.kind==='restart'?'재시작 결과':'첫 경기 결과';
    mkTeamALabel.textContent='정답 합계';
    mkTeamBLabel.textContent='정답 합계';
  }
  clearMathTimeouts();mathKickoff.result=d;mathKickoff.phase='result';
  mkEl.classList.add('show');mkTimer.textContent='결과';mkTimer.classList.remove('danger');mkChoices.innerHTML='';clearMathFeedback();mkTeamA.classList.remove('pop');mkTeamB.classList.remove('pop');
  const scoreA=Number(d.scoreA||0),scoreB=Number(d.scoreB||0);const winner=d.winner==='A'?'RED':'BLUE';
  const resultRemain=Math.max(0,Number(d.resultUntil||0)-soccerNow());
  mkResult.className=`mk-result ${d.winner==='A'?'red':'blue'}`;mkResult.textContent='';mkCoin.classList.remove('show');

  const showFinalResult=()=>{
    mkTeamA.textContent=String(scoreA);mkTeamB.textContent=String(scoreB);mkProblem.textContent=`${scoreA} : ${scoreB}`;
    mkSub.textContent=d.tied?'동점! 추첨 결과 선공팀이 정해졌습니다':'팀 정답 합계로 선공 결정!';
    mkResult.textContent=mathKickoff.kind==='restart'?`${winner} 팀이 재시작 선공!`:`${winner} 팀이 첫 선공!`;
    mkHelp.textContent='이제 3, 2, 1 후 경기가 시작됩니다';
    mkCoin.classList.remove('show');sfxMathResult(d.winner);
  };

  // 정상 수신이면 결과 화면을 충분히 보여준다. RESULT 단계에 늦게 재접속한
  // 경우에는 남은 시간 안에 긴 연출을 억지로 재생하지 않고 최종 결과를 즉시
  // 보여줘, 선공팀을 확인하지 못한 채 COUNTDOWN으로 넘어가는 일을 막는다.
  if(resultRemain<1450){
    showFinalResult();
  }else{
    mkSub.textContent='양 팀 결과를 하나씩 공개합니다';mkProblem.textContent='두근두근…';mkHelp.textContent='누가 먼저 공을 가질까요?';mkTeamA.textContent='?';mkTeamB.textContent='?';
    queueMathTimeout(()=>{sfxMathReveal();mkTeamA.textContent=String(scoreA);mkTeamA.classList.remove('pop');void mkTeamA.offsetWidth;mkTeamA.classList.add('pop');},260);
    queueMathTimeout(()=>{sfxMathReveal();mkTeamB.textContent=String(scoreB);mkTeamB.classList.remove('pop');void mkTeamB.offsetWidth;mkTeamB.classList.add('pop');},720);
    queueMathTimeout(()=>{sfxMathReveal();mkProblem.textContent=`${scoreA} : ${scoreB}`;},1100);
    if(d.tied){
      queueMathTimeout(()=>{mkSub.textContent='동점! 동전 던지기로 선공을 정합니다';mkHelp.textContent='축구공 동전이 돌아갑니다!';mkCoin.classList.add('show');},1350);
      queueMathTimeout(()=>{mkCoin.classList.remove('show');sfxMathResult(d.winner);mkResult.textContent=mathKickoff.kind==='restart'?`${winner} 팀이 재시작 선공!`:`${winner} 팀이 첫 선공!`;mkHelp.textContent='동점 승부 끝! 3, 2, 1 후 시작합니다';},1950);
    }else{
      queueMathTimeout(()=>{sfxMathResult(d.winner);mkSub.textContent='팀 정답 합계로 선공 결정!';mkResult.textContent=mathKickoff.kind==='restart'?`${winner} 팀이 재시작 선공!`:`${winner} 팀이 첫 선공!`;mkHelp.textContent='잠시 후 3, 2, 1 카운트다운이 시작됩니다';},1450);
    }
  }
  // 실제 재개 시각과 경기 잠금은 방장 권위 호환 라운드 상태를 따른다.
  restartLockUntil=Math.max(restartLockUntil,Date.now()+Math.max(0,Number(d.kickoffAt||0)-soccerNow()));
}

function setLiveRoundScores(a,b){
  const nextA=String(Math.max(0,Number(a||0))), nextB=String(Math.max(0,Number(b||0)));
  if(mkTeamA.textContent!==nextA){mkTeamA.textContent=nextA;mkTeamA.classList.remove('pop');void mkTeamA.offsetWidth;mkTeamA.classList.add('pop');}
  if(mkTeamB.textContent!==nextB){mkTeamB.textContent=nextB;mkTeamB.classList.remove('pop');void mkTeamB.offsetWidth;mkTeamB.classList.add('pop');}
}

let kickoffTeamLabel='';
function prepareAuthoritativeKickoff(d){
  const ownerSid=String(d.kickoffOwnerSid||d.ownerSid||'');
  gameActive=false;clearRoundActions();clearMathFeedback();goalPending=false;
  localKickTrack=null;localDribbleVisualUntil=0;pendingClaimAt=0;pendingClaimUntil=0;
  for(const p of Object.values(players)){
    const sp=getSpawn(p.seat);p.x=sp.x;p.y=sp.y;p.vx=0;p.vy=0;p.netX=sp.x;p.netY=sp.y;p.dir=defaultDir(p.team);p.dribble=false;
  }
  ball={x:FX+FW/2,y:KICKOFF_Y,z:0,vx:0,vy:0,vz:0,owner:null,ownerUntil:0,lastKicker:null,noPickupUntil:0};
  const owner=players[ownerSid];
  if(owner){
    owner.x=owner.netX=FX+FW/2+(String(d.winner||'')==='A'?-DRIBBLE_DISTANCE:DRIBBLE_DISTANCE);
    owner.y=owner.netY=KICKOFF_Y;owner.dir=defaultDir(owner.team);
    const t=dribbleTarget(owner);ball.x=t.x;ball.y=t.y;ball.owner=ownerSid;ball.ownerUntil=Number(d.kickoffAt||Date.now())+1200;ball.ownerSince=Date.now();
  }
  netBall={x:ball.x,y:ball.y,z:0,vx:0,vy:0,vz:0,netX:ball.x,netY:ball.y,netZ:0,netVX:0,netVY:0,netVZ:0,netT:Date.now(),visualAt:Date.now(),owner:ball.owner,samples:[],lastKicker:null,noPickupUntil:0};
}

function applySoccerRoundSnapshot(raw){
  clearSoccerRoundSyncWatchdog();
  const accepted=soccerRoundController.accept(raw,durationMs);
  if(!accepted.accepted)return false;
  const d=accepted.next;
  if(d.serverNow>0&&!soccerClockSynced) soccerServerOffset=d.serverNow-Date.now();
  // Compatibility rounds use the host's wall clock; no Worker clock API required.

  durationMs=d.remainingMs;
  if(d.phase==='playing')startTs=Date.now();else startTs=0;
  if(d.winner==='A')kickoffTeamLabel='RED 선공';else if(d.winner==='B')kickoffTeamLabel='BLUE 선공';

  const packet={...d,ownerSid:d.kickoffOwnerSid,scoreA:d.roundScoreA,scoreB:d.roundScoreB};
  switch(d.phase){
    case 'quiz':
      goalPending=false;pendingGoalVisual=null;gameActive=false;kickoffUntil=0;
      restartLockUntil=Math.max(restartLockUntil,Date.now()+Math.max(0,d.endsAt-soccerNow()));
      if(accepted.phaseChanged)startMathKickoff(packet);
      setLiveRoundScores(d.roundScoreA,d.roundScoreB);
      break;
    case 'goal':
      gameActive=false;kickoffUntil=0;clearRoundActions();mkEl.classList.remove('show');
      break;
    case 'result':
      gameActive=false;
      if(accepted.phaseChanged)applyMathResult(packet);
      break;
    case 'countdown': {
      gameActive=false;
      if(accepted.phaseChanged){
        clearMathTimeouts();mkEl.classList.remove('show');mathKickoff.phase='countdown';prepareAuthoritativeKickoff(d);
      }else if(accepted.ownerChanged){
        prepareAuthoritativeKickoff(d);
      }
      if(accepted.phaseChanged||accepted.kickoffTimeChanged){
        const ms=Math.max(0,d.kickoffAt-soccerNow());startKickoffCountdown(ms);restartLockUntil=Date.now()+ms;
      }
      break;
    }
    case 'playing':
      if(accepted.phaseChanged){
        if(accepted.prev.phase!=='countdown'||accepted.roundChanged||accepted.ownerChanged)prepareAuthoritativeKickoff(d);
        mkEl.classList.remove('show');mathKickoff.phase='done';kickoffUntil=0;restartLockUntil=0;
        gameActive=true;initialKickoffResolved=true;goalPending=false;
        if(isHost)sendBallSnapshot();
      }else{
        gameActive=true;
      }
      break;
    case 'over':
      gameActive=false;kickoffUntil=0;restartLockUntil=0;
      break;
    default:
      gameActive=false;
      break;
  }
  return true;
}

function queueOrApplySoccerSnapshot(data){
  if(!loopRunning||!me){
    const next=SoccerRoundCore.normalizeSnapshot(data,durationMs);
    const prev=pendingSoccerSnapshot;
    if(!prev||next.roundSerial>prev.roundSerial||
      (next.roundSerial===prev.roundSerial&&(SoccerRoundCore.PHASE_ORDER[next.phase]??0)>=(SoccerRoundCore.PHASE_ORDER[prev.phase]??0))){
      pendingSoccerSnapshot=next;
    }
    return false;
  }
  return applySoccerRoundSnapshot(data);
}

function flushPendingSoccerSnapshot(){
  if(!loopRunning||!me||!pendingSoccerSnapshot)return;
  const snapshot=pendingSoccerSnapshot;
  pendingSoccerSnapshot=null;
  applySoccerRoundSnapshot(snapshot);
}

function disposeMathKickoffUi(){
  try{cancelAnimationFrame(mathKickoff.raf);}catch(_){ }
  mathKickoff.raf=0;clearMathTimeouts();clearMathFeedback();
  mathKickoff.phase='idle';mathKickoff.current=null;mathKickoff.result=null;
  try{mkEl.classList.remove('show');}catch(_){ }
}
window.addEventListener('pagehide',disposeMathKickoffUi,{once:true});
window.addEventListener('beforeunload',disposeMathKickoffUi,{once:true});

let scoreAnimA = 0, scoreAnimB = 0; // 골 넣었을 때 스코어보드 팝 애니메이션 타임스탬프
let prevScoreA = 0, prevScoreB = 0;
const recentImpactFxIds = new Map(); // 로컬 예측/호스트 확정이 같은 킥을 두 번 재생하지 않게 id별 기록
const recentHeaderJumpFxIds = new Map();
let lastExplicitImpactMs = 0;   // 속도 추정 이펙트와 확정 이펙트 중복 방지

function addShake(mag, durMs){
  shakeMag = Math.max(shakeMag, mag);
  shakeUntil = Math.max(shakeUntil, Date.now()+durMs);
}
function spawnBurst(x, y, color, count, spread){
  for (let i=0;i<count;i++){
    const a = Math.random()*Math.PI*2, sp = 1+Math.random()*(spread||3);
    particles.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-1, life:1, color, size:2.5+Math.random()*2.5 });
  }
}
function spawnRing(x, y, color){
  rings.push({ x, y, r:6, alpha:0.55, color });
}
function playKickImpact(x,y,power,dir){
  const p=clamp(power||.5,0,1);
  // v7에서 게스트에게 보이던 짧고 선명한 타격감 그대로 사용한다.
  spawnRing(x,y,'#ffd640');
  spawnBurst(x,y,'#ffffff',6,2.2);
  addShake(Math.min(7,(5+p*9)*.72),130);
  sfxKick(p);
}
function cleanupRecentFx(map,now){
  for(const [id,at] of map){ if(now-at>2500) map.delete(id); }
}
function playKickImpactOnce(impactAt,x,y,power,dir){
  const id=String(impactAt||'');
  if(!id) return false;
  const now=Date.now();
  cleanupRecentFx(recentImpactFxIds,now);
  if(recentImpactFxIds.has(id)) return false;
  recentImpactFxIds.set(id,now);
  lastExplicitImpactMs=now;
  playKickImpact(x,y,power,dir);
  return true;
}
function playHeaderJumpFxOnce(headerAt,x,y,color){
  const id='jump:'+String(headerAt||'');
  if(id==='jump:') return false;
  const now=Date.now();
  cleanupRecentFx(recentHeaderJumpFxIds,now);
  if(recentHeaderJumpFxIds.has(id)) return false;
  recentHeaderJumpFxIds.set(id,now);
  rings.push({x,y,r:5,alpha:.46,color:color||'#dff7ff',squash:.46});
  for(let i=0;i<7;i++){
    const a=Math.PI+(i/6)*Math.PI;
    const sp=.55+Math.random()*.65;
    particles.push({x:x+(Math.random()*8-4),y:y+8,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp*.45,life:.7,color:'#e7fff2',size:1.5+Math.random()*1.5});
  }
  return true;
}

function updateKickoffCountdown(){
  if (kickoffUntil<=0) return;
  const left = kickoffUntil - Date.now();
  if (left<=0){
    if (!kickoffSoundsDone.has('go')){ kickoffSoundsDone.add('go'); sfxWhistle(false); }
    kickoffUntil = 0;
    return;
  }
  const sec = Math.ceil(left/1000);
  const key = 'tick'+sec;
  if (!kickoffSoundsDone.has(key) && sec<=3){ kickoffSoundsDone.add(key); sfxTick(); }
}

function isRoundLocked(now=Date.now()){ return now < Math.max(restartLockUntil||0,kickoffUntil||0,fieldRestartUntil||0); }

function clamp(v,lo,hi){ return v<lo?lo:(v>hi?hi:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function teamOf(seat){ return (Number(seat)||0)%2===0 ? 'A' : 'B'; }
function colorOf(team){ return team==='A' ? '#e74c3c' : '#3b82f6'; }
function defaultDir(team){ return team==='A' ? 0 : Math.PI; } // A는 오른쪽(B골), B는 왼쪽(A골)을 바라봄

function getSpawn(seat){
  const team = teamOf(seat);
  const idx = Math.floor((Number(seat)||0)/2);
  // 첫 선수는 실제 중앙원 높이에, 추가 선수는 위/아래 대칭으로 배치한다.
  const laneOffsets=[0,-78,78,-142,142];
  const laneY = KICKOFF_Y + (laneOffsets[idx] ?? ((idx%2?-1:1)*(142+Math.floor(idx/2)*48)));
  const x = team==='A' ? FX+FW*0.28 : FX+FW*0.72;
  return { x, y: clamp(laneY, FY+PR+4, FY+FH-PR-4) };
}

function makePlayer(seat, nick){
  const team = teamOf(seat);
  const sp = getSpawn(seat);
  return {
    x:sp.x, y:sp.y, vx:0, vy:0,
    netX:sp.x, netY:sp.y, netVX:0, netVY:0, netT:Date.now(),
    seat, team, nick: nick||'Player', color: colorOf(team), characterVariant:Math.floor((Number(seat)||0)/2)%6,
    dir: defaultDir(team), kickAt:0, kickCharge:0, headerAt:0, tackleAt:0,
    tackle:false, dribble:false, dribbleBallX:sp.x, dribbleBallY:sp.y,
    _lastStateSeq:0, _dribbleReceivedAt:0,
    claimAt:0, claimBallX:sp.x, claimBallY:sp.y, _lastClaimAt:0, _claimReceivedAt:0,
    _lastKickAt:0, _lastHeaderAt:0, _lastTackleAt:0,
    netSamples:[],
  };
}

function startKickoffCountdown(ms){
  kickoffUntil = Date.now() + (ms||3000);
  kickoffSoundsDone = new Set();
}

function clearRoundActions(){
  kickCharging=false; kickChargeStart=0;
  localKickTrack=null; localDribbleVisualUntil=0;
  pendingClaimAt=0; pendingClaimUntil=0; pendingClaimBallX=0; pendingClaimBallY=0;
  pendingKickAt=0; pendingKickUntil=0; pendingKickCharge=0;
  pendingHeaderAt=0; pendingHeaderUntil=0;
  pendingTackleAt=0; pendingTackleUntil=0; tackleActiveUntil=0;
  joyReset();
  for(const p of Object.values(players)){
    p.vx=0; p.vy=0; p.tackle=false; p.dribble=false;
    p.kickAt=0; p.headerAt=0; p.claimAt=0;
    p._noDribbleReportUntil=restartLockUntil;
  }
}

function initGame(){
  if (!roster.length) return;
  players = {};
  for (const p of roster){
    players[p.sid] = makePlayer(p.seat, p.nick);
  }
  me = players[mySid] || null;
  score = { A:0, B:0 }; prevScoreA=0; prevScoreB=0;
  ball = { x:FX+FW/2, y:KICKOFF_Y, z:0, vx:0, vy:0, vz:0, owner:null, ownerUntil:0, lastKicker:null, noPickupUntil:0 };
  netBall = { x:ball.x, y:ball.y, z:0, vx:0, vy:0, vz:0, netX:ball.x, netY:ball.y, netZ:0,
    netVX:0,netVY:0,netVZ:0,netT:Date.now(),visualAt:Date.now(),owner:null,samples:[],lastKicker:null,noPickupUntil:0 };
  gameOver = false;
  gameActive = false;
  hideOverlay();
  restartLockUntil=Date.now()+20000;
  startLoop();
  flushPendingSoccerSnapshot();
}

/* 로스터(전원 명단)를 서버 권위값(this.sc_roster의 seat/isHost)과 항상 일치하도록
 * 맞춘다. 예전 버전은 새로 들어온 사람만 "추가"만 하고, 이미 있던 사람의
 * seat/team이 잘못됐거나(초기 roster 스냅샷이 아직 order 동기화 전이었던 경우
 * seat가 임시값으로 온 적이 있었다) 나간 사람이 필드에 유령처럼 남는 문제,
 * 그리고 방장이 중간에 나갔을 때 공 권위(isHost)가 아무에게도 넘어가지 않아
 * 공이 영원히 멈추는 문제가 있었다. sc_roster는 서버가 "지금 진짜로 방에
 * 있는 사람 + 정확한 좌석 + 정확한 방장"을 주는 유일한 소스이므로, 받을
 * 때마다 전체를 다시 맞춘다(좌표는 순간이동하지 않도록 보존).
 */
function applyRoster(list){
  roster = (list||[]).map(p=>({
    sid: String(p.sid||p.sessionId||''),
    nick: String(p.nick||'Player'),
    seat: Number(p.seat ?? -1),
    isHost: !!p.isHost,
    characterVariant: Math.max(0,Math.min(5,Number(p.characterVariant ?? 0)|0)),
  })).filter(p=>p.seat>=0 && p.sid);
  if (!roster.length) return;

  const knownSids = new Set(roster.map(r=>r.sid));

  // 1) 로스터에 더 이상 없는 유령 플레이어 제거(중간 퇴장자가 필드에 얼어붙어
  //    남아있던 문제의 원인).
  for (const sid of Object.keys(players)){
    if (!knownSids.has(sid)) delete players[sid];
  }

  // 2) 신규/기존 플레이어를 좌석·팀·닉네임 기준으로 동기화(좌표는 유지).
  for (const r of roster){
    let p = players[r.sid];
    if (!p){
      p = players[r.sid] = makePlayer(r.seat, r.nick);
    } else {
      if (p.seat !== r.seat){
        p.seat = r.seat;
        p.team = teamOf(r.seat);
        p.color = colorOf(p.team);
        p.dir = defaultDir(p.team);
      }
      p.nick = r.nick;
    }
    p.characterVariant = r.characterVariant;
    if (r.sid === mySid){
      isHost = r.isHost; // 방장이 바뀌어도(중간 퇴장 등) 항상 최신값으로 갱신 → 공 권위가 끊기지 않음
    }
  }

  if (!me) me = players[mySid] || null;

  // bridge_init가 첫 room_state보다 먼저 와 빈 로스터로 초기화된 경우에도,
  // 뒤이어 도착한 서버 로스터만으로 게임을 정상 시작한다.
  // 퀴즈 진행 중에는 gameActive가 false이지만 게임 월드는 이미 준비된 상태다.
  // sc_sync 재요청으로 로스터가 반복 도착해도 공/점수/잠금 상태를 다시 초기화하지 않는다.
  if (gameInitialized && !loopRunning && !gameOver && me){
    initGame();
  }
  // 로스터/월드가 준비되기 전에 도착한 퀴즈 상태를 여기서 재생한다.
  // 네트워크 패킷 순서가 바뀌어도 문제 화면과 입력 잠금이 정상적으로 이어진다.
  if(loopRunning && me){
    flushPendingSoccerSnapshot();
  }
}

function applyRemotePlayers(map){
  if (!map) return;
  const now = Date.now();
  const actionIdIsUsable=(id)=>{
    // 액션 id는 생성 기기의 Date.now()를 식별자로만 쓴다. 서로 다른 PC/모바일의
    // 시계가 몇 초 이상 어긋날 수 있으므로 호스트 현재 시각과 비교해 폐기하지 않는다.
    // 중복 실행은 각 선수의 _lastKickAt/_lastHeaderAt/_lastTackleAt/_lastClaimAt으로 막는다.
    return Number(id||0)>0;
  };
  for (const [sid, snap] of Object.entries(map)){
    if (sid === mySid) continue;
    let p = players[sid];
    if (!p){
      const seat = Number(snap.seat ?? -1);
      if (seat < 0) continue;
      p = players[sid] = makePlayer(seat, snap.nick);
    }
    const incomingStateSeq=Number(snap.stateSeq||0);
    const staleState=(Number(p._lastStateSeq||0)>0&&incomingStateSeq<=0)||
      (incomingStateSeq>0&&incomingStateSeq<=Number(p._lastStateSeq||0));
    const actionOnly=!!snap.__actionOnly;

    // sc_pos의 액션 edge 패킷은 일반 좌표 스냅샷과 별도로 즉시 도착할 수 있다.
    // stateSeq가 새롭더라도 위치/속도를 덮지 않고 아직 처리하지 않은 edge만 병합한다.
    if(staleState||actionOnly){
      const incomingKickAt=Number(snap.kickAt||0);
      if(actionIdIsUsable(incomingKickAt)&&incomingKickAt!==p.kickAt&&incomingKickAt!==p._lastKickAt){
        p.kickAt=incomingKickAt;
        p.kickCharge=Number(snap.kickCharge||0);
        if(snap.kickX!=null)p.kickX=Number(snap.kickX);
        if(snap.kickY!=null)p.kickY=Number(snap.kickY);
        if(snap.kickDir!=null)p.kickDir=Number(snap.kickDir);
        if(snap.kickVX!=null)p.kickVX=Number(snap.kickVX);
        if(snap.kickVY!=null)p.kickVY=Number(snap.kickVY);
        if(snap.kickBallX!=null)p.kickBallX=Number(snap.kickBallX);
        if(snap.kickBallY!=null)p.kickBallY=Number(snap.kickBallY);
        p._pendingKickAt=incomingKickAt;
        p._kickReceivedAt=now;
        p._kickPoseUntil=now+180;
      }
      const incomingHeaderAt=Number(snap.headerAt||0);
      if(actionIdIsUsable(incomingHeaderAt)&&incomingHeaderAt!==p.headerAt&&incomingHeaderAt!==p._lastHeaderAt){
        p.headerAt=incomingHeaderAt;
        if(snap.headerX!=null)p.headerX=Number(snap.headerX);
        if(snap.headerY!=null)p.headerY=Number(snap.headerY);
        if(snap.headerDir!=null)p.headerDir=Number(snap.headerDir);
        if(snap.headerBallX!=null)p.headerBallX=Number(snap.headerBallX);
        if(snap.headerBallY!=null)p.headerBallY=Number(snap.headerBallY);
        p._headerPoseStart=now;p._headerPoseUntil=now+HEADER_DUR_MS;p._headerContactAt=now+90;
        playHeaderJumpFxOnce(incomingHeaderAt,p.x,p.y,p.color);
      }
      const incomingTackleAt=Number(snap.tackleAt||0);
      if(actionIdIsUsable(incomingTackleAt)&&incomingTackleAt!==p.tackleAt&&incomingTackleAt!==p._lastTackleAt){
        p.tackleAt=incomingTackleAt;p.tackle=!!snap.tackle;
        p._tacklePoseStart=now;p._tacklePoseUntil=now+TACKLE_DUR_MS;
      }
      const incomingClaimAt=Number(snap.claimAt||0);
      if(actionIdIsUsable(incomingClaimAt)&&incomingClaimAt!==p.claimAt&&incomingClaimAt!==p._lastClaimAt){
        p.claimAt=incomingClaimAt;
        if(snap.claimBallX!=null)p.claimBallX=Number(snap.claimBallX);
        if(snap.claimBallY!=null)p.claimBallY=Number(snap.claimBallY);
        p._claimReceivedAt=now;p._claimAttempts=0;
      }
      continue;
    }
    if(incomingStateSeq>0)p._lastStateSeq=incomingStateSeq;
    p.netX = Number(snap.x ?? p.netX);
    p.netY = Number(snap.y ?? p.netY);
    p.netVX = Number(snap.vx ?? 0);
    p.netVY = Number(snap.vy ?? 0);
    p.netT = now;
    if(!Array.isArray(p.netSamples)) p.netSamples=[];
    p.netSamples.push({t:now,x:p.netX,y:p.netY,vx:p.netVX,vy:p.netVY});
    if(p.netSamples.length>12) p.netSamples.splice(0,p.netSamples.length-12);
    if(snap.dribble!=null){
      p.dribble=!!snap.dribble;
      p._dribbleReceivedAt=p.dribble?now:0;
    }
    if(snap.dribbleBallX!=null)p.dribbleBallX=Number(snap.dribbleBallX);
    if(snap.dribbleBallY!=null)p.dribbleBallY=Number(snap.dribbleBallY);
    if (snap.dir != null) p.dir = Number(snap.dir);
    const incomingClaimAt=Number(snap.claimAt||0);
    if(actionIdIsUsable(incomingClaimAt) && incomingClaimAt!==p.claimAt){
      p._claimReceivedAt=now;
      p._claimAttempts=0;
    }
    if(actionIdIsUsable(incomingClaimAt))p.claimAt=incomingClaimAt;
    if(snap.claimBallX!=null)p.claimBallX=Number(snap.claimBallX);
    if(snap.claimBallY!=null)p.claimBallY=Number(snap.claimBallY);
    const incomingKickAt=Number(snap.kickAt||0);
    if(actionIdIsUsable(incomingKickAt) && incomingKickAt!==p.kickAt){
      p._kickPoseUntil=now+180;
      if(incomingKickAt!==p._lastKickAt && incomingKickAt!==p._pendingKickAt){
        p._pendingKickAt=incomingKickAt;
        p._kickReceivedAt=now;
      }
    }
    if(actionIdIsUsable(incomingKickAt))p.kickAt=incomingKickAt;
    p.kickCharge = Number(snap.kickCharge ?? p.kickCharge ?? 0);
    if(snap.kickX!=null) p.kickX=Number(snap.kickX);
    if(snap.kickY!=null) p.kickY=Number(snap.kickY);
    if(snap.kickDir!=null) p.kickDir=Number(snap.kickDir);
    if(snap.kickVX!=null) p.kickVX=Number(snap.kickVX);
    if(snap.kickVY!=null) p.kickVY=Number(snap.kickVY);
    if(snap.kickBallX!=null) p.kickBallX=Number(snap.kickBallX);
    if(snap.kickBallY!=null) p.kickBallY=Number(snap.kickBallY);
    const incomingHeaderAt=Number(snap.headerAt||0);
    if(actionIdIsUsable(incomingHeaderAt) && incomingHeaderAt!==p.headerAt){
      p._headerPoseStart=now;
      p._headerPoseUntil=now+HEADER_DUR_MS;
      playHeaderJumpFxOnce(incomingHeaderAt,p.x,p.y,p.color);
      p._headerContactAt=now+90;
    }
    if(actionIdIsUsable(incomingHeaderAt))p.headerAt=incomingHeaderAt;
    if(snap.headerX!=null)p.headerX=Number(snap.headerX);
    if(snap.headerY!=null)p.headerY=Number(snap.headerY);
    if(snap.headerDir!=null)p.headerDir=Number(snap.headerDir);
    if(snap.headerBallX!=null)p.headerBallX=Number(snap.headerBallX);
    if(snap.headerBallY!=null)p.headerBallY=Number(snap.headerBallY);
    const incomingTackleAt=Number(snap.tackleAt||0);
    if(actionIdIsUsable(incomingTackleAt)&&incomingTackleAt!==p.tackleAt){
      p._tacklePoseStart=now;
      p._tacklePoseUntil=now+TACKLE_DUR_MS;
    }
    if(actionIdIsUsable(incomingTackleAt))p.tackleAt=incomingTackleAt;
    p.tackle = !!snap.tackle;
  }
}

function hideOverlay(){ document.getElementById('overlay').classList.add('hidden'); }
function showOverlay(title, text){
  document.getElementById('ovTitle').textContent = title;
  document.getElementById('ovText').textContent = text || '';
  document.getElementById('overlay').classList.remove('hidden');
}

/* ── 킥 차징 / 헤딩 / 태클 ── */
let kickCharging = false, kickChargeStart = 0;
let pendingKickAt = 0, pendingKickCharge = 0, pendingKickUntil = 0;
let pendingKickX=0, pendingKickY=0, pendingKickDir=0, pendingKickBallX=0, pendingKickBallY=0;
let pendingKickVX=0, pendingKickVY=0;
let pendingHeaderAt=0,pendingHeaderUntil=0;
let pendingHeaderX=0,pendingHeaderY=0,pendingHeaderDir=0,pendingHeaderBallX=0,pendingHeaderBallY=0;
let pendingTackleAt=0,pendingTackleUntil=0;
// 게스트가 직접 찬 공은 로컬 예측/호스트 확인/일반 보간으로 갈아타지 않는다.
// 하나의 표시 궤도를 계속 적분하고, 호스트 스냅샷은 진행 방향을 거스르지 않는
// 작은 오차 보정과 속도 동기화에만 사용한다.
const AUTH_CLIENT_PICKUP_Z=5;
let localKickTrack=null;
let pendingClaimAt=0, pendingClaimUntil=0, pendingClaimBallX=0, pendingClaimBallY=0;
let headerCooldownUntil=0;
let tackleCooldownUntil = 0;
let tackleActiveUntil = 0;
const KICK_CHARGE_MS = 600;
const HEADER_COOLDOWN_MS=800;
const HEADER_DUR_MS=520;
const HEADER_CONTACT_DELAY_MS=210;
const HEADER_RANGE=PR+BR+5; // 몸 전체가 아니라 실제 머리 근처의 짧은 접촉 범위
const TACKLE_COOLDOWN_MS = 3000;
const TACKLE_DUR_MS = 230;
const STUN_MS = 550;

function isStunned(sid, now){ return (stunUntilMap[sid]||0) > (now||Date.now()); }

function beginKickCharge(){
  if (!me || !gameActive || gameOver || isRoundLocked()) return;
  if (isStunned(mySid)) return;
  const now=Date.now();
  if(now<tackleActiveUntil||now<(me._headerPoseUntil||0))return;
  if (kickCharging) return;
  kickCharging = true;
  kickChargeStart = Date.now();
}
function releaseKickCharge(){
  if (!kickCharging) return;
  kickCharging = false;
  if (!me || !gameActive || gameOver || isRoundLocked()) return;
  const held = Date.now() - kickChargeStart;
  const charge = clamp(held / KICK_CHARGE_MS, 0, 1);
  pendingKickAt = Date.now();
  pendingClaimAt=0; pendingClaimUntil=0;
  // 킥 직후 공과 선수가 아직 가까운 몇 프레임 동안 거리만 보고 dribble=true를
  // 다시 보내면 호스트가 킥을 드리블로 덮을 수 있다. 권위 재획득 전까지 금지한다.
  me._noDribbleReportUntil=pendingKickAt+450;
  localDribbleVisualUntil=0;
  pendingKickCharge = 0.20 + 0.80*charge; // 탭만 해도 최소한의 슛은 나가도록
  // 위치 송신 주기(약 30ms) 사이에서 한 프레임짜리 킥 edge가 유실되지 않도록
  // 같은 edge id를 짧은 시간 반복 전송한다. 서버/호스트는 id로 중복 실행을 막는다.
  pendingKickUntil = pendingKickAt+650;
  const kickBall=ball_or_netball();
  pendingKickX=me.x; pendingKickY=me.y; pendingKickDir=me.dir;
  // 버튼을 놓은 바로 이 순간의 이동속도를 킥 이벤트에 고정한다.
  pendingKickVX=Number(me.vx||0); pendingKickVY=Number(me.vy||0);
  const ownsKickBall=(kickBall.owner===mySid);
  // 소유 중 킥은 양쪽 모두 선수 발앞의 동일한 결정론적 시작점을 사용한다.
  // 자유공 킥만 현재 공 좌표를 유지한다.
  pendingKickBallX=ownsKickBall?me.x+Math.cos(me.dir)*DRIBBLE_DISTANCE:kickBall.x;
  pendingKickBallY=ownsKickBall?me.y+Math.sin(me.dir)*DRIBBLE_DISTANCE:kickBall.y;
  // 내 상태는 applyRemotePlayers()에서 의도적으로 제외된다. 이전에는 이 값을
  // 네트워크에만 보내서, 게스트의 킥은 호스트가 받아 처리했지만 호스트 자신의
  // 킥은 호스트 players[mySid]에 기록되지 않았다. 그 결과 호스트는 충전 슛이
  // 발동하지 않고 몸 충돌로 공을 미는 것처럼만 보였다. 로컬 객체에도 동일한
  // edge 값을 먼저 기록해 양쪽 모두 같은 호스트 권위 판정을 타게 한다.
  me.kickAt = pendingKickAt;
  me.kickCharge = pendingKickCharge;
  me.kickX=pendingKickX; me.kickY=pendingKickY; me.kickDir=pendingKickDir;
  me.kickVX=pendingKickVX; me.kickVY=pendingKickVY;
  me.kickBallX=pendingKickBallX; me.kickBallY=pendingKickBallY;
  me._kickPoseUntil = Date.now()+180;
  me._kickReceivedAt=pendingKickAt;
  const immediateKickPacket={
    stateSeq:nextStateSeq(),
    x:me.x,y:me.y,vx:me.vx,vy:me.vy,dir:me.dir,
    kickAt:pendingKickAt,kickCharge:pendingKickCharge,tackle:!!me.tackle,
    kickX:pendingKickX,kickY:pendingKickY,kickDir:pendingKickDir,
    kickVX:pendingKickVX,kickVY:pendingKickVY,
    kickBallX:pendingKickBallX,kickBallY:pendingKickBallY,
  };
  // 이전에는 netSends()의 다음 30ms 주기까지 기다려 게스트 슛이 호스트보다
  // 늦게 출발했다. 버튼을 놓은 같은 호출 스택에서 이벤트를 즉시 전달한다.
  if(!isHost) bridgeSend('sc_pos',immediateKickPacket);
  sfxSwing(pendingKickCharge); // 호스트 여부와 상관없이 내가 찬 순간 즉시 피드백
  // 게스트는 호스트 왕복을 기다리면 충격 효과가 늦거나 보간에 나뉘어 약해진다.
  // 공이 실제 사거리 안일 때만 화면 효과를 먼저 재생하고, 공의 위치/속도 판정은
  // 여전히 호스트가 맡는다. 호스트는 updateBallHost()의 확정 판정에서 재생한다.
  if(!isHost){
    const b=ball_or_netball();
    // 보간 중인 화면 좌표뿐 아니라 방금 받은 권위 목표 좌표도 확인한다.
    // 빠른 공은 화면 표시가 목표보다 몇 프레임 뒤라 실제로 맞은 슛을 놓칠 수 있다.
    const visibleDist=Math.hypot(b.x-me.x,b.y-me.y);
    const targetDist=Math.hypot((netBall.netX??b.x)-me.x,(netBall.netY??b.y)-me.y);
    const locallyAtFoot=Math.hypot(b.x-(me.x+Math.cos(me.dir)*DRIBBLE_DISTANCE),b.y-(me.y+Math.sin(me.dir)*DRIBBLE_DISTANCE))<DRIBBLE_DISTANCE+18;
    const ownedLocally=(b.owner===mySid)||Date.now()<localDribbleVisualUntil||locallyAtFoot;
    const immediateEligible=ownedLocally||
      Math.min(visibleDist,targetDist,Math.hypot(pendingKickBallX-me.x,pendingKickBallY-me.y))<KICK_RANGE+24;
    if(immediateEligible){
      playKickImpactOnce(pendingKickAt,b.x,b.y,pendingKickCharge,me.dir);
      lastBallSpeedSeen=Math.max(lastBallSpeedSeen,1.10+pendingKickCharge*1.30);
      // 호스트 확인이 돌아오기 전 최대 180ms만 동일한 파워 공식으로 표시 공을
      // 전진시킨다. 그래서 이펙트 뒤 공이 멈춰 있다가 뒤늦게 출발하지 않는다.
      const spec=makeKickSpec(pendingKickCharge,me.dir,pendingKickVX,pendingKickVY);
      netBall.x=ownedLocally?pendingKickBallX:b.x;
      netBall.y=ownedLocally?pendingKickBallY:b.y;
      netBall.z=Math.max(0,b.z||0);
      netBall.vx=spec.vx;
      netBall.vy=spec.vy;
      netBall.vz=spec.vz;
      if(spec.loft>0)sfxAirWhoosh(pendingKickCharge);
      netBall.owner=null;
      // 킥 직전 드리블 스냅샷을 남겨 두면 공이 발 쪽으로 한 번 돌아왔다가
      // 다시 출발한다. 예측 시작점에서 과거 버퍼를 비우고 새 궤적만 재생한다.
      netBall.netX=netBall.x; netBall.netY=netBall.y; netBall.netZ=netBall.z;
      netBall.samples=[];
      netBall.kickReconcile=null;
      localKickTrack={
        id:String(pendingKickAt), createdAt:Date.now(), lastAt:Date.now(), confirmed:false,
        separated:false, reacquireAfter:Date.now()+420,
        // 킥 직전까지 수신한 호스트 공 순번을 기준으로, 그 이후 권위 스냅샷이
        // 몇 개나 도착했는지 센다. 단순 시간 초과만으로 정상 킥을 되감지 않는다.
        baselineBallSeq:Number(netBall.lastAcceptedBallSeq||netBall.netBallSeq||0),
        authoritySnapshots:0,
        authAt:0, authX:netBall.x, authY:netBall.y, authZ:netBall.z,
        authVX:netBall.vx, authVY:netBall.vy, authVZ:netBall.vz,
        dirX:Math.cos(me.dir), dirY:Math.sin(me.dir)
      };
      netBall.lastKicker=mySid;
      netBall.noPickupUntil=Date.now()+420;
    }
  }
}
function tryHeader(){
  if(!me||!gameActive||gameOver||isRoundLocked()||isStunned(mySid))return;
  const now=Date.now();
  if(now<headerCooldownUntil||now<tackleActiveUntil||kickCharging)return;
  headerCooldownUntil=now+HEADER_COOLDOWN_MS;
  pendingHeaderAt=now;
  pendingHeaderUntil=now+280;
  const b=ball_or_netball();
  pendingHeaderX=me.x;pendingHeaderY=me.y;pendingHeaderDir=me.dir;
  pendingHeaderBallX=b.x;pendingHeaderBallY=b.y;
  me.headerAt=now;
  me.headerX=me.x;me.headerY=me.y;me.headerDir=me.dir;
  me.headerBallX=b.x;me.headerBallY=b.y;
  me._headerPoseStart=now;
  me._headerPoseUntil=now+HEADER_DUR_MS;
  me._headerContactAt=now+HEADER_CONTACT_DELAY_MS;
  playHeaderJumpFxOnce(now,me.x,me.y,me.color);
  // 킥과 마찬가지로 버튼을 누른 호출 스택에서 엣지 id를 보낸다. 위치 송신
  // 주기만 기다리면 게스트 헤딩이 호스트 판정보다 한 박자 늦어질 수 있다.
  bridgeSend('sc_pos',{
    stateSeq:nextStateSeq(),
    x:me.x,y:me.y,vx:me.vx,vy:me.vy,dir:me.dir,
    headerAt:pendingHeaderAt,headerX:pendingHeaderX,headerY:pendingHeaderY,
    headerDir:pendingHeaderDir,headerBallX:pendingHeaderBallX,headerBallY:pendingHeaderBallY,
    tackle:!!me.tackle,
  });
  // 실제 접촉 효과음은 호스트가 공중 공 접촉을 확정했을 때 재생한다.
}
function tryTackle(){
  if (!me || !gameActive || gameOver || isRoundLocked()) return;
  if (isStunned(mySid)) return;
  const now = Date.now();
  if (now < tackleCooldownUntil||now<(me._headerPoseUntil||0)||kickCharging) return;
  tackleActiveUntil = now + TACKLE_DUR_MS;
  tackleCooldownUntil = now + TACKLE_COOLDOWN_MS;
  pendingTackleAt=now;
  pendingTackleUntil=now+260;
  me.tackleAt=now;
  me._tacklePoseStart=now;
  me._tacklePoseUntil=now+TACKLE_DUR_MS;
  bridgeSend('sc_pos',{
    stateSeq:nextStateSeq(),
    x:me.x,y:me.y,vx:me.vx,vy:me.vy,dir:me.dir,
    tackle:true,tackleAt:pendingTackleAt,
  });
  sfxTackle();
}

/* ── 매 프레임 갱신 ── */
function updateMe(){
  if (!me || !gameActive || gameOver) return;
  const now = Date.now();
  jumpBtnEl.classList.toggle('cooling',now<headerCooldownUntil);
  tackleBtnEl.classList.toggle('cooling',now<tackleCooldownUntil);
  const headerRemain=clamp((headerCooldownUntil-now)/HEADER_COOLDOWN_MS,0,1);
  const tackleRemain=clamp((tackleCooldownUntil-now)/TACKLE_COOLDOWN_MS,0,1);
  if(headerCoolFillEl)headerCoolFillEl.style.height=`${Math.round((1-headerRemain)*100)}%`;
  if(tackleCoolFillEl)tackleCoolFillEl.style.height=`${Math.round((1-tackleRemain)*100)}%`;
  if (isRoundLocked(now)){ me.vx=0; me.vy=0; me.tackle=false; return; }
  if (isStunned(mySid, now)){ me.vx=0; me.vy=0; me.tackle=false; return; }

  let dx=0, dy=0;
  if (keys['ArrowLeft']||keys['KeyA']) dx-=1;
  if (keys['ArrowRight']||keys['KeyD']) dx+=1;
  if (keys['ArrowUp']||keys['KeyW']) dy-=1;
  if (keys['ArrowDown']||keys['KeyS']) dy+=1;
  if (IS_MOBILE && (Math.abs(joyDX)>0.12 || Math.abs(joyDY)>0.12)){ dx=joyDX; dy=joyDY; }
  const rawLen = Math.hypot(dx,dy);
  const len = rawLen;
  if (len>0){ dx/=len; dy/=len; me.dir = Math.atan2(dy,dx); }

  const tackling = now < tackleActiveUntil;
  const heading=now<(me._headerPoseUntil||0);
  const sprinting = !kickCharging && !tackling && !heading && ((keys['KeyE']) || (IS_MOBILE && rawLen>.88));
  // 고정 60Hz 전환 뒤 느려진 체감을 보정한다. 일반 이동뿐 아니라 달리기,
  // 킥 충전 중 이동, 헤딩/태클 이동도 같은 비율로 올려 상태 전환 때 속도가
  // 갑자기 꺾이지 않게 한다.
  const PLAYER_SPEED_MULTIPLIER = 1.25;
  const baseSpeed = tackling ? 4.0 : (heading?2.25:(sprinting ? 3.35 : (kickCharging ? 1.85 : 2.70)));
  const SPD = baseSpeed * PLAYER_SPEED_MULTIPLIER;
  const targetVX=dx*SPD, targetVY=dy*SPD;
  // 출발은 민첩하지만 반대 방향 전환에는 짧은 관성이 남도록 한다. 축구게임처럼
  // 달리던 방향을 즉시 180도로 꺾지 못하고, 입력을 놓으면 빠르게 감속한다.
  const curSpeed=Math.hypot(me.vx||0,me.vy||0);
  const targetSpeed=Math.hypot(targetVX,targetVY);
  const alignment=(curSpeed>.05&&targetSpeed>.05)?
    ((me.vx||0)*targetVX+(me.vy||0)*targetVY)/(curSpeed*targetSpeed):-1;
  const accel=tackling?.58:(len===0?.30:(alignment<-.25?.20:(alignment<.45?.25:.31)));
  me.vx = lerp(me.vx||0,targetVX,accel);
  me.vy = lerp(me.vy||0,targetVY,accel);
  if (len===0 && Math.hypot(me.vx,me.vy)<.08){ me.vx=0; me.vy=0; }
  if (tackling && len===0){
    // 방향 입력이 없어도 바라보는 방향으로 돌진
    me.vx = Math.cos(me.dir)*SPD; me.vy = Math.sin(me.dir)*SPD;
  }
  me.x = clamp(me.x+me.vx, FX+PR, FX+FW-PR);
  me.y = clamp(me.y+me.vy, FY+PR, FY+FH-PR);

  // 선수끼리 완전히 겹쳐 통과하지 않도록 로컬 선수를 가장 가까운 경계로
  // 밀어낸다. 판정은 좌표만 보정하므로 서버 구조 변경 없이도 수비가 가능하다.
  for(const [sid,q] of Object.entries(players)){
    if(sid===mySid) continue;
    const ox=me.x-q.x, oy=me.y-q.y, od=Math.hypot(ox,oy)||.001, min=PR*1.72;
    if(od<min){
      const nx=ox/od, ny=oy/od, push=(min-od)*.55;
      me.x=clamp(me.x+nx*push,FX+PR,FX+FW-PR);
      me.y=clamp(me.y+ny*push,FY+PR,FY+FH-PR);
      const into=me.vx*nx+me.vy*ny;
      if(into<0){ me.vx-=nx*into*.72; me.vy-=ny*into*.72; }
    }
  }
  me.tackle = tackling;

  // 킥 차지 UI(모바일 버튼 게이지)
  if (kickCharging){
    const pct = clamp((now-kickChargeStart)/KICK_CHARGE_MS, 0, 1)*100;
    kickChargeFillEl.style.height = pct+'%';
  } else {
    kickChargeFillEl.style.height = '0%';
  }
}

/* 원격 플레이어 보간: 마지막 스냅샷 시각(netT)로부터 경과한 시간만큼 속도로
 * 짧게 외삽(extrapolate)한 뒤 그 목표점으로 부드럽게 당긴다. 예전 버전은
 * "마지막으로 받은 좌표"로 곧장 당기기만 해서 20Hz 스냅샷 사이에 살짝
 * 끊겨 보였는데, 이렇게 하면 패킷 사이에도 자연스럽게 이어져 보인다. */
function smoothToward(cur, netX, netY, netVX, netVY, netT, now, factor){
  const dt = clamp(now-(netT||now), 0, 160); // 과도한 외삽 방지
  const tx = netX + (netVX||0)*dt*0.06;
  const ty = netY + (netVY||0)*dt*0.06;
  return { x: lerp(cur.x, clamp(tx, FX+PR, FX+FW-PR), factor),
           y: lerp(cur.y, clamp(ty, FY+PR, FY+FH-PR), factor) };
}

function lerpRemote(){
  const now = Date.now();
  const renderAt = now - 72; // 지터를 흡수할 작은 재생 지연
  for (const [sid,p] of Object.entries(players)){
    if (sid===mySid) continue;
    const samples=Array.isArray(p.netSamples)?p.netSamples:[];
    while(samples.length>2 && samples[1].t<=renderAt) samples.shift();
    let tx=p.netX,ty=p.netY;
    if(samples.length>=2 && samples[0].t<=renderAt && renderAt<=samples[1].t){
      const a=samples[0],b=samples[1];
      const u=clamp((renderAt-a.t)/Math.max(1,b.t-a.t),0,1);
      tx=lerp(a.x,b.x,u); ty=lerp(a.y,b.y,u);
    }else if(samples.length){
      const a=samples[samples.length-1];
      const age=clamp(renderAt-a.t,0,110);
      tx=a.x+(a.vx||0)*age*.06; ty=a.y+(a.vy||0)*age*.06;
    }
    const err=Math.hypot(tx-p.x,ty-p.y);
    if(err>180){ p.x=tx; p.y=ty; continue; }
    const factor=err>70?.42:(err>25?.27:.18);
    p.x=lerp(p.x,clamp(tx,FX+PR,FX+FW-PR),factor);
    p.y=lerp(p.y,clamp(ty,FY+PR,FY+FH-PR),factor);
  }
}

function beginBallAuthorityHandoff(auth, now=Date.now(), duration=220){
  const oldX=Number(netBall.x||0), oldY=Number(netBall.y||0), oldZ=Math.max(0,Number(netBall.z||0));
  const ax=Number(auth.x??netBall.netX??oldX), ay=Number(auth.y??netBall.netY??oldY);
  const az=Math.max(0,Number(auth.z??netBall.netZ??oldZ));
  netBall.renderOffsetX=oldX-ax;
  netBall.renderOffsetY=oldY-ay;
  netBall.renderOffsetZ=oldZ-az;
  netBall.renderOffsetStartedAt=now;
  netBall.renderOffsetUntil=now+duration;
  netBall.x=ax; netBall.y=ay; netBall.z=az;
  netBall.vx=Number(auth.vx??netBall.netVX??netBall.vx??0);
  netBall.vy=Number(auth.vy??netBall.netVY??netBall.vy??0);
  netBall.vz=Number(auth.vz??netBall.netVZ??netBall.vz??0);
  netBall.samples=[];
}

function confirmBallAuthoritySmooth(auth, track, now=Date.now()){
  // 확정 순간 과거 권위 좌표로 갈아타지 않는다. 현재 로컬 예측 위치와
  // 최신 권위 위치의 전진축 차이를 visualLead로 저장하고, 권위 공은 계속
  // 앞으로 움직이는 동안 그 차이만 서서히 줄인다. 따라서 화면 공은 한 번도
  // 뒤로 가지 않으면서 최종적으로 호스트 궤도에 합류한다.
  let dx=Number(track?.dirX||auth.vx||0),dy=Number(track?.dirY||auth.vy||0);
  const dl=Math.hypot(dx,dy)||1;dx/=dl;dy/=dl;
  const px=Number(netBall.x||0),py=Number(netBall.y||0);
  const ax=Number(auth.x??netBall.netX??px),ay=Number(auth.y??netBall.netY??py);
  track.confirmed=true;
  track.confirmedAt=now;
  track.authReceivedAt=now;
  track.authX=ax;track.authY=ay;track.authZ=Math.max(0,Number(auth.z??0));
  track.authVX=Number(auth.vx??0);track.authVY=Number(auth.vy??0);track.authVZ=Number(auth.vz??0);
  track.visualLead=Math.max(0,(px*dx+py*dy)-(ax*dx+ay*dy));
  track.dirX=dx;track.dirY=dy;
  netBall.renderOffsetX=0;netBall.renderOffsetY=0;netBall.renderOffsetZ=0;
  netBall.renderOffsetUntil=0;
  netBall.samples=[];
}
function ballRenderState(b){
  if(b!==netBall)return b;
  const now=Date.now(), until=Number(b.renderOffsetUntil||0), start=Number(b.renderOffsetStartedAt||0);
  if(until<=now||until<=start){
    b.renderOffsetX=0;b.renderOffsetY=0;b.renderOffsetZ=0;
    return b;
  }
  const u=clamp((now-start)/Math.max(1,until-start),0,1);
  // 부드러운 감쇠. 실제 판정 좌표는 이미 권위 좌표이고 화면만 이어 붙인다.
  const k=(1-u)*(1-u);
  return Object.assign({},b,{
    x:Number(b.x||0)+Number(b.renderOffsetX||0)*k,
    y:Number(b.y||0)+Number(b.renderOffsetY||0)*k,
    z:Math.max(0,Number(b.z||0)+Number(b.renderOffsetZ||0)*k)
  });
}

function updateNetBall(){
  if(isHost)return;
  const now=Date.now();
  const visualDt=clamp(now-Number(netBall.visualAt||now),0,34);
  netBall.visualAt=now;

  // 권위상 내가 공 소유자가 된 순간에는 이전 킥 예측/보정을 즉시 끝낸다.
  // 이 우선순위가 localKickTrack보다 뒤에 있으면, 호스트 화면은 재드리블 중인데
  // 게스트 화면만 공이 마지막 킥 위치에 남아 있는 현상이 생긴다.
  if(netBall.owner===mySid&&me&&(netBall.netZ||0)<5){
    localKickTrack=null;
    netBall.kickReconcile=null;
    netBall.samples=[];
    netBall.renderOffsetX=0;netBall.renderOffsetY=0;netBall.renderOffsetZ=0;
    netBall.renderOffsetUntil=0;
    localDribbleVisualUntil=now+260;
    const target=dribbleTargetForPlayer(me,me.vx||0,me.vy||0,now);
    // 자기 소유 공은 네트워크 스냅샷을 보간해 따라오게 하지 않는다.
    // 호스트가 owner=mySid로 승인한 뒤에는 매 틱 동일한 발앞 목표를 직접 사용한다.
    // 여기서 lerp를 쓰면 이전 킥 위치의 x축이 오래 남아 위아래만 따라오는 것처럼 보인다.
    netBall.x=target.x;
    netBall.y=target.y;
    netBall.z=0;netBall.vz=0;
    netBall.vx=(me.vx||0)*.78;
    netBall.vy=(me.vy||0)*.78;
    return;
  }

  // 호스트 확정 전까지만 로컬 예측을 사용한다. 확정되면 실제 판정 좌표는
  // 즉시 권위 공으로 전환하고, 화면 위치만 짧은 오프셋으로 이어 붙인다.
  if(localKickTrack){
    const track=localKickTrack;
    const dt=clamp(now-(track.lastAt||now),0,34);
    track.lastAt=now;

    if(!track.confirmed){
      stepFreeBallState(netBall,dt/(1000/60));
      const predictionAge=now-Number(track.createdAt||now);
      const rejectedByAuthority=predictionAge>BALL_PREDICTION_MIN_WAIT_MS&&
        Number(track.authoritySnapshots||0)>=BALL_PREDICTION_REJECT_SNAPSHOTS;
      const hardExpired=predictionAge>BALL_PREDICTION_HARD_MAX_MS;
      if(rejectedByAuthority||hardExpired){
        confirmBallAuthoritySmooth({
          x:netBall.netX,y:netBall.netY,z:netBall.netZ,
          vx:netBall.netVX,vy:netBall.netVY,vz:netBall.netVZ
        },track,now);
      }
      return;
    }

    // 확정 뒤에는 권위 스냅샷을 현재 수신 시각까지 전진시킨 위치를 기준으로
    // 표시한다. 예측 선행량은 420ms 동안 줄이되 전진축 좌표는 절대 감소시키지 않는다.
    const dx=Number(track.dirX||0),dy=Number(track.dirY||0),sx=-dy,sy=dx;
    const authSteps=clamp(now-Number(track.authReceivedAt||now),0,120)/(1000/60);
    const auth={x:Number(track.authX||0),y:Number(track.authY||0),z:Math.max(0,Number(track.authZ||0)),
      vx:Number(track.authVX||0),vy:Number(track.authVY||0),vz:Number(track.authVZ||0)};
    stepFreeBallState(auth,authSteps);
    const u=clamp((now-Number(track.confirmedAt||now))/420,0,1);
    const lead=Number(track.visualLead||0)*(1-u)*(1-u);
    const authAlong=auth.x*dx+auth.y*dy;
    const oldAlong=Number(netBall.x||0)*dx+Number(netBall.y||0)*dy;
    const authAcross=auth.x*sx+auth.y*sy;
    const oldAcross=Number(netBall.x||0)*sx+Number(netBall.y||0)*sy;
    const nextAlong=Math.max(oldAlong,authAlong+lead);
    const nextAcross=lerp(oldAcross,authAcross,.34);
    netBall.x=dx*nextAlong+sx*nextAcross;
    netBall.y=dy*nextAlong+sy*nextAcross;
    netBall.z=lerp(Number(netBall.z||0),auth.z,.32);
    netBall.vx=lerp(Number(netBall.vx||0),auth.vx,.30);
    netBall.vy=lerp(Number(netBall.vy||0),auth.vy,.30);
    netBall.vz=lerp(Number(netBall.vz||0),auth.vz,.34);

    if(u>=1){
      netBall.kickReconcile={dirX:dx,dirY:dy,until:now+1400};
      netBall.samples=[];
      localKickTrack=null;
    }
    return;
  }

  const claimedByOther=!!(netBall.owner&&netBall.owner!==mySid);
  if(netBall.owner===mySid)localDribbleVisualUntil=now+220;

  // 게스트가 자유공에 실제로 닿은 순간은 화면에서 즉시 발앞 반응을 준다.
  // 판정 소유권은 여전히 호스트가 결정하고, 이 로컬 반응은 짧은 시각 예측뿐이다.
  if(!netBall.owner&&!localKickTrack&&me&&(netBall.netZ||0)<5&&now>=Number(netBall.noPickupUntil||0)){
    const controlX=me.x+Math.cos(me.dir)*Math.min(8,Math.hypot(me.vx||0,me.vy||0)*1.1);
    const controlY=me.y+Math.sin(me.dir)*Math.min(8,Math.hypot(me.vx||0,me.vy||0)*1.1);
    const visiblePickupDist=Math.hypot(netBall.x-controlX,netBall.y-controlY);
    const authorityPickupDist=Math.hypot(Number(netBall.netX||netBall.x)-controlX,Number(netBall.netY||netBall.y)-controlY);
    const pickupDist=Math.min(visiblePickupDist,authorityPickupDist);
    if(pickupDist<PR+BR+16){
      if(now>=pendingClaimUntil){
        pendingClaimAt=now; pendingClaimUntil=now+520;
        pendingClaimBallX=netBall.x; pendingClaimBallY=netBall.y;
      }
      localDribbleVisualUntil=Math.max(localDribbleVisualUntil,now+180);
      const target=dribbleTargetForPlayer(me,me.vx||0,me.vy||0,now);
      netBall.x=lerp(netBall.x,target.x,.94);
      netBall.y=lerp(netBall.y,target.y,.94);
      netBall.z=lerp(netBall.z||0,0,.70);
      netBall.vx=lerp(netBall.vx||0,(me.vx||0)*.78,.48);
      netBall.vy=lerp(netBall.vy||0,(me.vy||0)*.78,.48);
      return;
    }
  }

  // 자유공의 최종 소유권은 호스트가 한 명을 선정한 sc_ball 스냅샷으로 확정한다.
  const ownerPlayer=netBall.owner?players[netBall.owner]:null;
  const dribblePlayer=ownerPlayer;
  if(dribblePlayer&&(netBall.netZ||0)<5){
    const isMine=dribblePlayer===me;
    const pvx=isMine?(dribblePlayer.vx||0):(dribblePlayer.netVX||0);
    const pvy=isMine?(dribblePlayer.vy||0):(dribblePlayer.netVY||0);
    const target=dribbleTargetForPlayer(dribblePlayer,pvx,pvy,now);
    netBall.x=lerp(netBall.x,target.x,isMine?.92:.55);
    netBall.y=lerp(netBall.y,target.y,isMine?.92:.55);
    netBall.z=lerp(netBall.z||0,0,.55);netBall.vz=0;
    netBall.vx=lerp(netBall.vx||0,pvx*.78,.30);
    netBall.vy=lerp(netBall.vy||0,pvy*.78,.30);
    return;
  }

  // 자유공은 다음 네트워크 패킷을 기다리며 멈추지 않는다. 화면 공을 매 프레임
  // 현재 속도로 먼저 진행한 뒤 최신 권위 위치와의 작은 오차만 부드럽게 보정한다.
  if(visualDt>0)stepFreeBallState(netBall,visualDt/(1000/60));
  const samples=Array.isArray(netBall.samples)?netBall.samples:[];
  const latest=samples.length?samples[samples.length-1]:null;
  let tx=Number(netBall.netX||netBall.x),ty=Number(netBall.netY||netBall.y),tz=Math.max(0,Number(netBall.netZ||0));
  let tvx=Number(netBall.netVX||0),tvy=Number(netBall.netVY||0),tvz=Number(netBall.netVZ||0);
  if(latest){
    const age=clamp(now-latest.t,0,100);
    const auth={x:latest.x,y:latest.y,z:latest.z||0,vx:latest.vx||0,vy:latest.vy||0,vz:latest.vz||0};
    stepFreeBallState(auth,age/(1000/60));
    tx=auth.x;ty=auth.y;tz=auth.z;tvx=auth.vx;tvy=auth.vy;tvz=auth.vz;
  }
  const err=Math.hypot(tx-netBall.x,ty-netBall.y);
  const oldX=netBall.x,oldY=netBall.y;
  let nextX,nextY;
  if(err>180){nextX=tx;nextY=ty;netBall.z=tz;}
  else{
    const correction=err>90?.40:(err>38?.25:.12);
    nextX=lerp(netBall.x,tx,correction);
    nextY=lerp(netBall.y,ty,correction);
    netBall.z=lerp(netBall.z||0,tz,err>40?.38:.28);
  }
  const reconcile=netBall.kickReconcile;
  if(reconcile&&now<Number(reconcile.until||0)){
    const dx=Number(reconcile.dirX||0),dy=Number(reconcile.dirY||0);
    const oldAlong=oldX*dx+oldY*dy;
    const targetAlong=tx*dx+ty*dy;
    const nextAlong=nextX*dx+nextY*dy;
    if(targetAlong<oldAlong-1){
      // 호스트 좌표가 아직 뒤라면 앞으로 가던 공을 되감지 않고 좌우 오차만 보정한다.
      const sx=-dy,sy=dx;
      const nextAcross=nextX*sx+nextY*sy;
      nextX=dx*oldAlong+sx*nextAcross;
      nextY=dy*oldAlong+sy*nextAcross;
    }else if(targetAlong>=oldAlong-1&&Math.abs(targetAlong-oldAlong)<10){
      netBall.kickReconcile=null;
    }
  }else if(reconcile){netBall.kickReconcile=null;}
  netBall.x=nextX;netBall.y=nextY;
  netBall.vx=lerp(netBall.vx||0,tvx,.22);
  netBall.vy=lerp(netBall.vy||0,tvy,.22);
  netBall.vz=lerp(netBall.vz||0,tvz,.24);
}


function announceFieldRestart(text, ms=850){
  fieldRestartText=String(text||'');
  fieldRestartUntil=Date.now()+ms;
  fieldRestartSerial++;
}
function resetBallForRestart(x,y,text,restartTeam=null){
  const now=Date.now();
  pendingGoalVisual=null;
  ball.x=clamp(x,FX+BR,FX+FW-BR);
  ball.y=clamp(y,FY+BR,FY+FH-BR);
  ball.z=0;ball.vx=0;ball.vy=0;ball.vz=0;
  ball.owner=null;ball.ownerUntil=0;ball.ownerSince=0;
  ball.noPickupUntil=now+360;ball.noStealUntil=now+760;
  ball.lastKicker=null;
  fieldRestartTeam=restartTeam||null;
  fieldRestartTeamUntil=now+1250;
  announceFieldRestart(text,1000);
  sendBallSnapshot();
}
function queueFieldRestart(kind,x,y,text,restartTeam){
  if(pendingFieldOut)return;
  const now=Date.now();
  ball.owner=null;ball.ownerUntil=0;
  ball.noPickupUntil=now+900;
  // 공이 선을 넘은 즉시 텔레포트하지 않고 약 0.48초 더 날아가는 장면을 보여준다.
  pendingFieldOut={kind,x,y,text,restartTeam,resolveAt:now+480};
  fieldRestartText='공이 경기장 밖으로 나갔습니다';
  fieldRestartUntil=now+480;
  fieldRestartSerial++;
  sendBallSnapshot();
}
function returnBallFromOut(side){
  const now=Date.now();
  const midX=FX+FW/2, midY=FY+FH/2;
  let tx=midX,ty=midY;
  if(side==='top'){
    ball.y=FY-BR-2; tx=clamp(ball.x,FX+80,FX+FW-80); ty=FY+FH*.34;
  }else if(side==='bottom'){
    ball.y=FY+FH+BR+2; tx=clamp(ball.x,FX+80,FX+FW-80); ty=FY+FH*.66;
  }else if(side==='left'){
    ball.x=FX-GOAL_W-BR-2; tx=FX+FW*.27; ty=clamp(ball.y,FY+60,FY+FH-60);
  }else{
    ball.x=FX+FW+GOAL_W+BR+2; tx=FX+FW*.73; ty=clamp(ball.y,FY+60,FY+FH-60);
  }
  const dx=tx-ball.x,dy=ty-ball.y,len=Math.max(.001,Math.hypot(dx,dy));
  // 중간 세기의 낮은 킥처럼 안쪽으로 되돌린다. 즉시 재배치하지 않고
  // 선 밖 좌표에서 출발하므로 공이 경기장 안으로 날아드는 과정이 보인다.
  const power=4.35;
  ball.owner=null;ball.ownerUntil=0;ball.ownerSince=0;
  ball.vx=dx/len*power;ball.vy=dy/len*power;
  ball.z=Math.max(1.5,ball.z||0);ball.vz=Math.max(.55,Math.min(1.15,Math.abs(ball.vz||0)+.55));
  ball.noPickupUntil=now+330;ball.noStealUntil=now+430;
  ball.impactAt=`return:${now}`;ball.impactPower=.58;ball.impactDir=Math.atan2(ball.vy,ball.vx);
  announceFieldRestart('공이 경기장 안으로 돌아옵니다',620);
  spawnRing(ball.x,ball.y,'rgba(255,255,255,.72)');
  sendBallSnapshot();
}
function handleFieldOut(prevX,prevY){
  const now=Date.now();
  if(isRoundLocked()||now<Number(ball._outReturnLockUntil||0))return false;

  // 포스트 사이·크로스바 아래의 유효 골문은 네트 안쪽 목표선까지 계속 진행한다.
  const insideGoalTunnel = ball.y>GOAL_Y1+GOAL_POST_HALF_Y+BR*.55 &&
    ball.y<GOAL_Y2-GOAL_POST_HALF_Y-BR*.55 &&
    (ball.z||0)+BR*.32<BALL_GOAL_MAX_Z-GOAL_CROSSBAR_HALF_Z;
  if(ball.x<FX-GOAL_W-BR && insideGoalTunnel && ball.x>GOAL_SCORE_LEFT_X-BR*1.5)return false;
  if(ball.x>FX+FW+GOAL_W+BR && insideGoalTunnel && ball.x<GOAL_SCORE_RIGHT_X+BR*1.5)return false;

  let side='';
  if(ball.y<FY-BR)side='top';
  else if(ball.y>FY+FH+BR)side='bottom';
  else if(ball.x<FX-GOAL_W-BR)side='left';
  else if(ball.x>FX+FW+GOAL_W+BR)side='right';
  if(!side)return false;

  ball._outReturnLockUntil=now+700;
  returnBallFromOut(side);
  return true;
}
function collideGoalFrame(prevX,prevY,prevZ){
  const leftPlane=GOAL_PLANE_LEFT_X,rightPlane=GOAL_PLANE_RIGHT_X;
  const crossedLeft=prevX>=leftPlane-BR&&ball.x<leftPlane+BR;
  const crossedRight=prevX<=rightPlane+BR&&ball.x>rightPlane-BR;
  const nearPlane=crossedLeft||crossedRight;
  if(!nearPlane)return false;
  const postHit=Math.abs(ball.y-GOAL_Y1)<=GOAL_POST_HALF_Y+BR*.42||Math.abs(ball.y-GOAL_Y2)<=GOAL_POST_HALF_Y+BR*.42;
  const insideMouth=ball.y>GOAL_Y1+GOAL_POST_HALF_Y&&ball.y<GOAL_Y2-GOAL_POST_HALF_Y;
  const crossbarHit=insideMouth&&Math.abs((ball.z||0)-BALL_GOAL_MAX_Z)<=GOAL_CROSSBAR_HALF_Z+2.2;
  if(!postHit&&!crossbarHit)return false;
  if(crossedLeft){ball.x=leftPlane+BR+1;ball.vx=Math.abs(ball.vx)*.58;}
  else {ball.x=rightPlane-BR-1;ball.vx=-Math.abs(ball.vx)*.58;}
  if(crossbarHit){ball.vz=-Math.max(.8,Math.abs(ball.vz||0)*.55);ball.z=Math.min(ball.z,BALL_GOAL_MAX_Z-GOAL_CROSSBAR_HALF_Z-1);}
  else {ball.vy+=(ball.y<(GOAL_Y1+GOAL_Y2)/2?-1:1)*.65;}
  ball.owner=null;ball.ownerUntil=0;ball.noPickupUntil=Date.now()+180;
  ball.impactAt=`frame:${Date.now()}`;ball.impactPower=.5;ball.impactDir=Math.atan2(ball.vy,ball.vx);
  sfxTackle();sendBallSnapshot();
  return true;
}

function updateBallHost(advancePhysics=true){
  if (!isHost || !gameActive || gameOver) return;
  const now = Date.now();
  // 아웃 연출 중에는 선수 입력/재획득은 잠그되 공 물리만 계속 진행해
  // 선 밖으로 날아가는 장면을 끝까지 보여준다.
  if (isRoundLocked(now) && !pendingFieldOut) return;
  if(pendingFieldOut){
    const prevBallX=ball.x,prevBallY=ball.y;
    stepFreeBallState(ball,1);
    handleFieldOut(prevBallX,prevBallY);
    return;
  }
  if(pendingGoalVisual){
    // 골문 입구부터 네트 안쪽까지 공이 실제로 굴러가거나 날아가는 모습을 유지한다.
    const g=pendingGoalVisual;
    const goalDir=Number(g.goalDir||0)||1;
    const targetX=Number(g.targetX||ball.x);
    const towardSpeed=Math.max(1.35,Math.abs(ball.vx||0));
    ball.vx=goalDir*towardSpeed;
    stepFreeBallState(ball,1);
    ball.vx*=.965;ball.vy*=.94;ball.vz*=.91;
    ball.y=clamp(ball.y,GOAL_Y1+GOAL_POST_HALF_Y+BR*.5,GOAL_Y2-GOAL_POST_HALF_Y-BR*.5);
    const reached=goalDir>0?ball.x>=targetX:ball.x<=targetX;
    if(reached){
      ball.x=targetX;
      ball.vx=goalDir*Math.max(.38,Math.abs(ball.vx)*.45);
      if(!g.insideAt){g.insideAt=now;sendBallSnapshot();}
      if(now-g.insideAt>=220){
        const team=g.team;pendingGoalVisual=null;scoreGoal(team);
      }
    }
    return;
  }

  // 공 소유권은 선수 반복 순서에 따라 여러 번 덮어쓰지 않는다.
  // 한 프레임의 모든 접촉/claim 후보를 먼저 모은 뒤 가장 적합한 한 명만 선정한다.
  const AUTH_PICKUP_Z=5;
  const stateBySid={};
  const pickupCandidates=[];
  const groundBall=(ball.z||0)<AUTH_PICKUP_Z;

  for(const [sid,p] of Object.entries(players)){
    const effectiveVX=sid===mySid?(p.vx||0):(p.netVX||0);
    const effectiveVY=sid===mySid?(p.vy||0):(p.netVY||0);
    const speed=Math.hypot(effectiveVX,effectiveVY);
    const controlX=clamp(p.x,FX+PR,FX+FW-PR);
    const controlY=clamp(p.y,FY+PR,FY+FH-PR);
    const dx=ball.x-controlX,dy=ball.y-controlY;
    const d=Math.hypot(dx,dy)||0.0001;
    const minD=PR+BR;
    const restartTeamLocked=fieldRestartTeam&&now<fieldRestartTeamUntil&&p.team!==fieldRestartTeam;
    const pickupLocked=restartTeamLocked||(ball.lastKicker===sid&&now<Number(ball.noPickupUntil||0));
    const carrying=groundBall&&ball.owner===sid&&now<(ball.ownerUntil||0)&&d<minD+28;
    const ownerIsOpponent=!!(ball.owner&&ball.owner!==sid&&players[ball.owner]&&players[ball.owner].team!==p.team);
    const stealReady=ownerIsOpponent&&now>=Number(ball.noStealUntil||0)&&groundBall&&d<minD+2;

    const reportedPlayerX=Number(p.netX),reportedPlayerY=Number(p.netY);
    const reportedBallX=Number(p.dribbleBallX),reportedBallY=Number(p.dribbleBallY);
    const dribbleFresh=now-Number(p._dribbleReceivedAt||0)<=220;
    const reportedContact=!!(sid!==mySid&&p.dribble&&dribbleFresh&&
      Number.isFinite(reportedPlayerX)&&Number.isFinite(reportedPlayerY)&&
      Number.isFinite(reportedBallX)&&Number.isFinite(reportedBallY)&&
      Math.hypot(reportedBallX-reportedPlayerX,reportedBallY-reportedPlayerY)<minD+18&&
      Math.hypot(ball.x-reportedBallX,ball.y-reportedBallY)<72);

    const claimPending=!!(p.claimAt&&p.claimAt!==p._lastClaimAt);
    let claimValid=false,claimExpired=false;
    if(claimPending){
      const claimAge=now-Number(p._claimReceivedAt||now);
      const claimBX=Number(p.claimBallX),claimBY=Number(p.claimBallY);
      const claimPlayerDist=Math.hypot(claimBX-controlX,claimBY-controlY);
      claimExpired=claimAge<0||claimAge>700;
      // 재시도는 공중볼이 착지하는 짧은 시간만 허용한다. 현재 권위 공과 선수가
      // 실제 접촉 중이어야 하므로 과거 claim 좌표가 나중에 공을 훔칠 수 없다.
      claimValid=!claimExpired&&!pickupLocked&&groundBall&&
        Number.isFinite(claimPlayerDist)&&claimPlayerDist<minD+22&&d<minD+22;
      p._claimAttempts=Number(p._claimAttempts||0)+1;
    }

    stateBySid[sid]={sid,p,effectiveVX,effectiveVY,speed,controlX,controlY,dx,dy,d,minD,
      pickupLocked,carrying,ownerIsOpponent,stealReady,reportedContact,claimPending,claimValid,claimExpired};

    if(!pickupLocked&&groundBall){
      // 우선순위가 같으면 실제 권위 공에 더 가까운 선수를 선택한다.
      if(stealReady)pickupCandidates.push({sid,priority:4,d});
      else if(claimValid)pickupCandidates.push({sid,priority:3,d});
      else if(carrying)pickupCandidates.push({sid,priority:2,d});
      else if(d<minD+4||reportedContact)pickupCandidates.push({sid,priority:1,d});
    }
  }

  pickupCandidates.sort((a,b)=>b.priority-a.priority||a.d-b.d||String(a.sid).localeCompare(String(b.sid)));
  const pickupWinner=pickupCandidates.length?stateBySid[pickupCandidates[0].sid]:null;
  // 유효 claim은 같은 경합 프레임에서 승패와 무관하게 모두 소비한다.
  // 아직 공중인 경우처럼 일시적으로 무효인 claim만 700ms 안에서 재시도한다.
  for(const st of Object.values(stateBySid)){
    if(st.claimPending&&(st.claimValid||st.claimExpired))st.p._lastClaimAt=st.p.claimAt;
  }
  if(pickupWinner){
    const {sid,p,effectiveVX,effectiveVY,speed,controlX,controlY,dx,dy,d,claimValid}=pickupWinner;
    const moving=speed>.08;
    const target=dribbleTargetForPlayer(p,effectiveVX,effectiveVY,now);
    const wasOwner=ball.owner===sid&&now<(ball.ownerUntil||0);
    // 새 소유권이 확정되는 순간에는 이전 자유공/킥 위치에서 발앞까지 보간하지 않는다.
    // 그 보간이 재드리블 시작 시 공이 옆이나 뒤에 남아 있다가 뒤늦게 붙는 공통 원인이었다.
    // 최초 획득은 결정론적인 발앞 목표로 즉시 스냅하고, 이미 소유 중일 때만 부드럽게 추종한다.
    if(!wasOwner){
      const previousOwner=ball.owner;
      const isSteal=!!(previousOwner&&previousOwner!==sid&&players[previousOwner]&&players[previousOwner].team!==p.team);
      // 탈취는 공을 새 선수 발앞으로 한 프레임에 순간이동시키지 않는다.
      // 실제 접촉점에서 140ms 정도 발앞으로 끌려오게 해 소유권 전환이 자연스럽게 보인다.
      const blend=isSteal?.34:1;
      ball.x=lerp(ball.x,target.x,blend);
      ball.y=lerp(ball.y,target.y,blend);
      ball.vx=lerp(ball.vx,effectiveVX*.78,isSteal?.44:1);
      ball.vy=lerp(ball.vy,effectiveVY*.78,isSteal?.44:1);
      ball.ownerTransitionUntil=isSteal?now+140:0;
    }else{
      const transitioning=now<Number(ball.ownerTransitionUntil||0);
      const blend=transitioning?.46:(moving?.82:.90);
      ball.x=lerp(ball.x,target.x,blend);
      ball.y=lerp(ball.y,target.y,blend);
      ball.vx=lerp(ball.vx,effectiveVX*.78,transitioning?.48:(moving?.38:.30));
      ball.vy=lerp(ball.vy,effectiveVY*.78,transitioning?.48:(moving?.38:.30));
    }
    ball.z=0;ball.vz=0;
    const changedOwner=ball.owner!==sid;
    ball.owner=sid;
    ball.ownerUntil=now+260;
    if(changedOwner){ ball.ownerSince=now; ball.noStealUntil=now+240; }
    if(claimValid){
      sendBallSnapshot();
    }
  }else if(ball.owner&&now>(ball.ownerUntil||0)){
    ball.owner=null;
  }

  for (const [sid,p] of Object.entries(players)){
    const st=stateBySid[sid];
    const effectiveVX=st.effectiveVX,effectiveVY=st.effectiveVY;
    const remoteSpeed=st.speed;
    const controlX=st.controlX,controlY=st.controlY;
    const dx=st.dx,dy=st.dy,d=st.d,minD=st.minD;

    // 충전 슛: kickAt이 마지막으로 처리한 값과 다르면 "새 킥"으로 인식(간헐적
    // 위치 패킷에 덮여 한 프레임짜리 이벤트가 사라지지 않도록 sticky 필드로 옴).
    if (p.kickAt && p.kickAt !== p._lastKickAt){
      const kickPX=Number.isFinite(p.kickX)?p.kickX:p.x;
      const kickPY=Number.isFinite(p.kickY)?p.kickY:p.y;
      const reportedBallX=Number(p.kickBallX), reportedBallY=Number(p.kickBallY);
      const requestBallDist=Math.hypot(reportedBallX-kickPX,reportedBallY-kickPY);
      const receiveAge=now-Number(p._kickReceivedAt||now);
      // 서로 다른 기기의 Date.now()를 비교하지 않는다. 호스트가 이 edge를
      // 처음 받은 시각을 기준으로 짧은 재시도 창을 두어, 첫 프레임에 공 위치가
      // 어긋나도 sticky 패킷이 도착하는 동안 정상 처리할 수 있게 한다.
      const timelyKick=receiveAge>=0&&receiveAge<=1500;
      const reportedContact=Number.isFinite(requestBallDist)&&requestBallDist<KICK_RANGE+32;
      const ownedByShooter=ball.owner===sid&&now<(ball.ownerUntil||0);
      const reportedNearAuthority=Number.isFinite(reportedBallX)&&Number.isFinite(reportedBallY)&&
        Math.hypot(ball.x-reportedBallX,ball.y-reportedBallY)<112;
      const kickInRange=timelyKick&&(ownedByShooter||d<KICK_RANGE+22||(reportedContact&&reportedNearAuthority));
      if (kickInRange){
        // 성공한 경우에만 edge를 소비한다. 실패한 첫 프레임에서 미리 소비하면
        // 뒤이어 온 동일 킥 패킷이 모두 무시되어 간헐적으로 공이 안 차진다.
        p._lastKickAt = p.kickAt;
        p._pendingKickAt = 0;
        const dir = Number.isFinite(p.kickDir) ? p.kickDir : (Number.isFinite(p.dir) ? p.dir : Math.atan2(dy,dx));
        const charge=clamp(p.kickCharge||0,0,1);
        const kickVX=Number.isFinite(p.kickVX)?p.kickVX:effectiveVX;
        const kickVY=Number.isFinite(p.kickVY)?p.kickVY:effectiveVY;
        const spec=makeKickSpec(charge,dir,kickVX,kickVY);
        // 소유 중 킥은 게스트와 호스트가 같은 선수 발앞 시작점을 사용한다.
        // 자유공은 권위 공 좌표를 그대로 사용하며, 보고 좌표로 임의 보정하지 않는다.
        if(ownedByShooter){
          ball.x=clamp(kickPX+Math.cos(dir)*spec.startLead,FX-GOAL_W-BR,FX+FW+GOAL_W+BR);
          ball.y=clamp(kickPY+Math.sin(dir)*spec.startLead,FY+BR,FY+FH-BR);
        }
        ball.vx=spec.vx;
        ball.vy=spec.vy;
        ball.vz=spec.vz;
        ball.z=Math.max(0,ball.z||0);
        if(spec.loft>0)sfxAirWhoosh(charge);
        // 속도 변화로 이펙트를 추측하면 보간/프레임 속도에 따라 양쪽에서
        // 사라질 수 있다. 호스트가 확정한 킥 id를 공 스냅샷에 실어 전원이
        // 정확히 한 번씩 같은 이펙트를 재생하게 한다.
        ball.impactAt=String(p.kickAt||now);
        ball.impactPower=charge;
        ball.impactDir=dir;
        ball.owner=null;
        ball.ownerUntil=0;
        ball.lastKicker=sid;
        ball.noPickupUntil=now+(spec.runningKick?560:420);
        p._kickPoseUntil=now+180;
        playKickImpactOnce(ball.impactAt,ball.x,ball.y,charge,dir);
        // 같은 프레임의 속도 변화 감지기가 이 효과를 한 번 더 재생하지 않게 기준 갱신.
        lastBallSpeedSeen=Math.hypot(ball.vx,ball.vy);
        // 다음 30ms 주기를 기다리지 않고 같은 호출 스택에서 권위 킥을 전송한다.
        sendBallSnapshot();
      }else if(receiveAge>1500){
        // 오래된 실패 edge만 만료 처리한다. 재시도 창 안에서는 소비하지 않는다.
        p._lastKickAt=p.kickAt;
        p._pendingKickAt=0;
      }
    }

    // 헤딩도 킥과 같은 edge id 방식으로 호스트가 한 번만 판정한다. 단순한
    // header=true 상태를 여러 프레임 처리하면 공에 힘이 누적되므로 반드시
    // headerAt과 _lastHeaderAt을 비교한다. 게스트는 버튼 순간의 공 좌표도
    // 함께 보내 왕복 지연 중 공이 조금 이동해도 유효한 접촉을 잃지 않는다.
    if(p.headerAt&&p.headerAt!==p._lastHeaderAt&&now>=(p._headerContactAt||0)){
      p._lastHeaderAt=p.headerAt;
      const headerPX=Number.isFinite(p.headerX)?p.headerX:controlX;
      const headerPY=Number.isFinite(p.headerY)?p.headerY:controlY;
      const requestDist=Math.hypot(Number(p.headerBallX)-headerPX,Number(p.headerBallY)-headerPY);
      const reportedDrift=Math.hypot(ball.x-Number(p.headerBallX),ball.y-Number(p.headerBallY));
      const airborne=(ball.z||0)>=HEADER_MIN_Z&&(ball.z||0)<=HEADER_MAX_Z;
      const headDir=Number.isFinite(p.headerDir)?p.headerDir:(Number.isFinite(p.dir)?p.dir:0);
      const frontDot=((ball.x-headerPX)*Math.cos(headDir)+(ball.y-headerPY)*Math.sin(headDir));
      const nearHead=d<HEADER_RANGE&&frontDot>-9&&frontDot<HEADER_RANGE+7;
      const reportedNearHead=Number.isFinite(requestDist)&&requestDist<HEADER_RANGE+2&&reportedDrift<30;
      const headerInRange=airborne&&(nearHead||reportedNearHead);
      if(headerInRange){
        const dir=Number.isFinite(p.headerDir)?p.headerDir:(Number.isFinite(p.dir)?p.dir:0);
        const power=1.95;
        ball.vx=Math.cos(dir)*power+(ball.vx||0)*.24;
        ball.vy=Math.sin(dir)*power+(ball.vy||0)*.24;
        // 헤딩은 수평 방향을 바꾸면서 공을 다시 살짝 띄운다.
        ball.vz=Math.max(2.8,Math.abs(ball.vz||0)*.42+1.8);
        ball.owner=null;ball.ownerUntil=0;ball.lastKicker=null;ball.noPickupUntil=0;
        ball.impactAt=`h:${p.headerAt}`;
        ball.impactPower=.62;
        ball.impactDir=dir;
        playKickImpactOnce(ball.impactAt,ball.x,ball.y,.62,dir);
        sfxHeader();
        lastBallSpeedSeen=Math.hypot(ball.vx,ball.vy);
      }
    }

    // 돌진 태클: 상대 팀 선수와 부딪히면 스턴시키고 공을 살짝 튕겨낸다.
    // 서버는 sc_stun을 seat 0(호스트)만 보낼 수 있게 막아뒀으므로, 태클
    // "판정" 자체는 반드시 호스트 쪽에서 해야 한다 — 그래서 각 클라이언트는
    // 의사만(sc_pos.tackle) 보내고, 실제 스턴 발생은 여기 호스트 루프에서만.
    if (p.tackle){
      for (const q of Object.values(players)){
        if (q === p || q.team === p.team) continue;
        if (isStunned(playerSidOf(q), now)) continue;
        const qd = Math.hypot(q.x-p.x, q.y-p.y);
        if (qd < TACKLE_RANGE){
          const qsid = playerSidOf(q);
          const key = qsid;
          if ((p._tackleHitAt && p._tackleHitAt[key] && now - p._tackleHitAt[key] < 700)) continue;
          p._tackleHitAt = p._tackleHitAt || {};
          p._tackleHitAt[key] = now;
          applyStun(qsid, STUN_MS, /*local broadcast now, plus tell server*/true);
          // 태클한 방향으로 공도 살짝 튕겨나가도록(뺏는 느낌)
          const bd = Math.hypot(ball.x-q.x, ball.y-q.y);
          if (bd < KICK_RANGE&&(ball.z||0)<5){
            ball.vx = Math.cos(p.dir)*0.90;
            ball.vy = Math.sin(p.dir)*0.90;
            ball.owner=null;
            ball.ownerUntil=0;
          }
        }
      }
    }
  }

  if(ball.owner&&now>(ball.ownerUntil||0))ball.owner=null;

  // 메시지 수신 콜백에서는 액션/소유권만 처리한다. 실제 공 물리는
  // 고정 60Hz 게임 루프에서 프레임당 정확히 한 번만 진행한다.
  if(!advancePhysics) return;

  const prevBallX=ball.x, prevBallY=ball.y, prevBallZ=ball.z||0;
  stepFreeBallState(ball,1);

  // 골문 입구를 통과하면 네트 안쪽 이동 연출을 시작한다. 득점 자체는
  // beginGoalVisual 이후 공이 안쪽 목표선에 도달한 뒤에만 확정된다.
  function crossedGoalMouth(lineX,movingLeft){
    const crossed=movingLeft
      ? (prevBallX>=lineX&&ball.x<lineX)
      : (prevBallX<=lineX&&ball.x>lineX);
    if(!crossed)return false;
    const denom=ball.x-prevBallX;
    const t=Math.abs(denom)<1e-6?1:clamp((lineX-prevBallX)/denom,0,1);
    const crossY=lerp(prevBallY,ball.y,t);
    const crossZ=lerp(prevBallZ,ball.z||0,t);
    return crossY>GOAL_Y1+GOAL_POST_HALF_Y+BR*.55&&
      crossY<GOAL_Y2-GOAL_POST_HALF_Y-BR*.55&&
      crossZ+BR*.32<BALL_GOAL_MAX_Z-GOAL_CROSSBAR_HALF_Z;
  }
  // 포스트와 크로스바에 닿으면 골이 아니라 실제처럼 튕겨 나온다.
  if(collideGoalFrame(prevBallX,prevBallY,prevBallZ))return;
  if(crossedGoalMouth(GOAL_PLANE_LEFT_X,true)){ beginGoalVisual('B'); return; }
  if(crossedGoalMouth(GOAL_PLANE_RIGHT_X,false)){ beginGoalVisual('A'); return; }

  // 골문이 아닌 경기장 선 밖으로 나가면 선 밖 위치에서 중간 세기의 낮은 킥처럼
  // 경기장 안으로 자동 복귀한다. 순간이동식 킥인/골킥은 사용하지 않는다.
  if(handleFieldOut(prevBallX,prevBallY))return;
}

let lastBallSpeedSeen = 0;
function updateBallImpactFx(){
  // 모든 킥/헤딩 이펙트는 호스트가 확정한 impactAt 또는 같은 id의 로컬 예측으로만
  // 재생한다. 속도 변화 추정 방식은 게스트 로컬 예측 뒤 호스트 확정 시 두 번째
  // 이펙트를 만들 수 있으므로 완전히 제거한다.
  const b=ball_or_netball();
  lastBallSpeedSeen=Math.hypot(b.vx||0,b.vy||0);
}
function updateBallTrail(){
  const b = ball_or_netball();
  const spd = Math.hypot(b.vx||0, b.vy||0);
  if (spd > 3){
    ballTrail.push({ x:b.x, y:b.y, z:b.z||0, life:1 });
    if (ballTrail.length > 14) ballTrail.shift();
  }
  for (const t of ballTrail) t.life -= 0.09;
  ballTrail = ballTrail.filter(t=>t.life>0);
}
function updateRings(){
  for (const r of rings){ r.r += 2.4; r.alpha -= 0.045; }
  rings = rings.filter(r=>r.alpha>0);
}

function playerSidOf(p){
  for (const [sid, v] of Object.entries(players)) if (v === p) return sid;
  return null;
}

let stunFxThrottle = {};
function applyStun(sid, dur, notifyServer){
  stunUntilMap[sid] = Date.now()+dur;
  const now = Date.now();
  if (!stunFxThrottle[sid] || now - stunFxThrottle[sid] > 300){
    stunFxThrottle[sid] = now;
    const p = players[sid];
    if (p){ spawnBurst(p.x, p.y, '#ffe08a', 10, 3); spawnRing(p.x, p.y, '#ffffff'); }
    if (sid === mySid){ sfxStun(); addShake(5, 200); }
    else { sfxTackle(); }
  }
  if (notifyServer){
    bridgeSend('sc_stun', { sid, dur });
  }
}

let fieldRestartUntil=0;
let fieldRestartText='';
let fieldRestartSerial=0;
let pendingFieldOut=null;       // 구버전 재개 호환 필드(현재 일반 아웃은 자동 리턴 사용)
let fieldRestartTeam=null;      // 골킥/코너/킥인 재개 권한 팀
let fieldRestartTeamUntil=0;
let goalPending = false;
let pendingGoalVisual=null;
function beginGoalVisual(team){
  if(pendingGoalVisual||goalPending)return;
  const now=Date.now();
  const goalDir=team==='A'?1:-1;
  const targetX=team==='A'?GOAL_SCORE_RIGHT_X:GOAL_SCORE_LEFT_X;
  ball.owner=null;ball.ownerUntil=0;ball.noPickupUntil=now+1400;
  // 골문 입구를 통과한 순간부터 연출을 시작한다. 공은 여기서 멈추지 않고
  // 네트 안쪽 목표선까지 실제 물리 좌표로 이동한 뒤에만 득점 처리된다.
  pendingGoalVisual={team,targetX,goalDir,enteredAt:now,insideAt:0};
  sendBallSnapshot();
}
function scoreGoal(team){
  if(goalPending||isRoundLocked()||!gameActive)return;
  goalPending=true;
  // Worker 승인 왕복 사이에도 로컬 입력/공 물리가 한두 프레임 더 진행되지 않게
  // 즉시 짧은 잠금을 건다. 정상 승인 시 곧 도착하는 QUIZ 상태가 이 잠금을
  // 라운드 종료시각까지 연장하고, 거부/유실 시에는 안전 잠금만 자동 만료된다.
  restartLockUntil=Math.max(restartLockUntil,Date.now()+1800);
  clearRoundActions();
  // 점수는 로컬에서 미리 올리지 않는다. Worker가 sc_goal을 승인한 뒤
  // sc_goal과 방장 권위 호환 상태로 확정된 값만 스코어보드에 반영한다.
  bridgeSend('sc_goal',{team,restartId:`g:${mySid}:${Date.now()}`});
  showGoalFlash(team);spawnGoalParticles(team);sfxGoal();addShake(8,400);
  // 승인된 골이면 곧바로 QUIZ 상태가 와서 goalPending이 해제된다.
  // 패킷이 거부/유실된 경우에도 영구 잠금되지 않도록 짧은 안전 타임아웃만 둔다.
  setTimeout(()=>{goalPending=false;},1800);
}

let goalFlashUntil=0, goalFlashTeam=null;
function showGoalFlash(team){ goalFlashTeam=team; goalFlashUntil=Date.now()+900; }
function spawnGoalParticles(team){
  const cx = team==='A' ? GOAL_SCORE_RIGHT_X : GOAL_SCORE_LEFT_X;
  const cy = (GOAL_Y1+GOAL_Y2)/2;
  const cols = team==='A' ? ['#e74c3c','#ff8a80','#fff','#ffd166'] : ['#3b82f6','#8ab4ff','#fff','#8ef0ff'];
  for (let i=0;i<64;i++){
    const a = Math.random()*Math.PI*2, sp = 2+Math.random()*4;
    particles.push({ x:cx, y:cy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-2,
      life:1, color: cols[i%cols.length], size:3+Math.random()*3 });
  }
}
function updateParticles(){
  for (const pt of particles){
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.12; pt.life -= 0.018;
  }
  particles = particles.filter(pt=>pt.life>0);
}

/* ── 네트워크 송신 ── */
let hostBallSeq=0;
function sendBallSnapshot(){
  if(!isHost||!EMBED||!gameActive)return;
  const sentAt=Date.now();
  const ballSeq=++hostBallSeq;
  lastBallSent=sentAt;
  bridgeSend('sc_ball', {
    x:ball.x,y:ball.y,z:ball.z||0,vx:ball.vx,vy:ball.vy,vz:ball.vz||0,owner:ball.owner||null,
    impactAt:ball.impactAt||'',impactPower:ball.impactPower||0,impactDir:ball.impactDir||0,
    restartText:fieldRestartText||'',restartUntil:fieldRestartUntil||0,restartSerial:fieldRestartSerial||0,sentAt,ballSeq
  });
}
function netSends(){
  if (!EMBED || !gameActive) return;
  const now = Date.now();
  if (me && now-lastPosSent >= 30){
    lastPosSent = now;
    const shownBall=ball_or_netball();
    const localSpeed=Math.hypot(me.vx||0,me.vy||0);
    // dribble은 단순 근접 보고가 아니라 호스트가 승인한 실제 소유권만 전송한다.
    // 킥 직후/로컬 예측 중에는 가까워도 절대 다시 드리블로 보고하지 않는다.
    const dribble=!isRoundLocked(now)&&!kickCharging&&!localKickTrack&&
      now>=Number(me._noDribbleReportUntil||0)&&shownBall.owner===mySid&&
      (shownBall.z||0)<AUTH_CLIENT_PICKUP_Z;
    const kickActive=now<pendingKickUntil;
    const headerActive=now<pendingHeaderUntil;
    const tackleEdgeActive=now<pendingTackleUntil;
    const claimActive=now<pendingClaimUntil;
    const kickAt = kickActive ? pendingKickAt : 0;
    const kickCharge = kickActive ? pendingKickCharge : 0;
    if(!kickActive && me.kickAt){ me.kickAt=0; me.kickCharge=0; }
    if(!headerActive&&me.headerAt)me.headerAt=0;
    if(!tackleEdgeActive&&me.tackleAt)me.tackleAt=0;
    const stateSeq=nextStateSeq();
    bridgeSend('sc_pos', {
      stateSeq,
      x:me.x, y:me.y, vx:me.vx, vy:me.vy, dir:me.dir,
      dribble,dribbleBallX:shownBall.x,dribbleBallY:shownBall.y,
      claimAt:claimActive?pendingClaimAt:0,
      claimBallX:pendingClaimBallX,claimBallY:pendingClaimBallY,
      kickAt, kickCharge,
      kickX:pendingKickX, kickY:pendingKickY, kickDir:pendingKickDir,
      kickVX:pendingKickVX, kickVY:pendingKickVY,
      kickBallX:pendingKickBallX, kickBallY:pendingKickBallY,
      headerAt:headerActive?pendingHeaderAt:0,
      headerX:pendingHeaderX,headerY:pendingHeaderY,headerDir:pendingHeaderDir,
      headerBallX:pendingHeaderBallX,headerBallY:pendingHeaderBallY,
      tackle:!!me.tackle,tackleAt:tackleEdgeActive?pendingTackleAt:0,
    });
  }
  if (isHost && now-lastBallSent >= 30) sendBallSnapshot();
}

/* ── 경기 종료는 Worker 타이머가 단독으로 결정한다. ── */

/* ── 렌더링 ── */
let crowdCanvas = null;
function buildCrowdCanvas(){
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  // 2.5D 경기장 느낌: 바깥을 단순 평면이 아니라 관중석/통로/보드가 있는
  // 작은 스타디움처럼 보이게 미리 그려 둔다.
  g.fillStyle = '#07111d'; g.fillRect(0,0,CW,CH);

  const sky = g.createLinearGradient(0,0,0,FY-8);
  sky.addColorStop(0,'#162845');
  sky.addColorStop(1,'#0d182a');
  g.fillStyle = sky; g.fillRect(0,0,CW,FY+8);

  const bowlTop = FY-42;
  g.fillStyle='#0a1424'; g.fillRect(0,bowlTop,CW,32); g.fillRect(0,FY+FH+10,CW,32);
  g.fillStyle='#13243a'; g.fillRect(0,bowlTop+7,CW,10); g.fillRect(0,FY+FH+17,CW,10);
  g.fillStyle='#223856'; g.fillRect(0,bowlTop+17,CW,6); g.fillRect(0,FY+FH+27,CW,6);

  // 조명 글로우
  for (const lx of [80, CW-80]){
    const glow = g.createRadialGradient(lx, 22, 6, lx, 22, 46);
    glow.addColorStop(0,'rgba(255,244,199,.24)');
    glow.addColorStop(.55,'rgba(255,244,199,.08)');
    glow.addColorStop(1,'rgba(255,244,199,0)');
    g.fillStyle = glow; g.fillRect(lx-46,0,92,72);
    g.fillStyle='#d8e6ff'; g.fillRect(lx-20,9,40,3);
    g.fillStyle='#90a8c9'; g.fillRect(lx-14,12,28,2);
  }

  // 상/하단 관중석 블록
  const crowdCols = ['#ff8b7d','#67d9c7','#ffd166','#90b8ff','#caa1ff','#f3f6ff'];
  for (const baseY of [10,22,34,FY+FH+16,FY+FH+28,FY+FH+40]){
    for (let x=10; x<CW-10; x+=8){
      const idx = Math.abs(((x/8)|0)+((baseY/6)|0)*3) % crowdCols.length;
      g.fillStyle = crowdCols[idx]; g.fillRect(x, baseY, 4, 4);
      if (((x/8 + baseY)|0)%3!==0){ g.fillStyle='#0b1628'; g.fillRect(x+4,baseY+1,2,3); }
    }
  }

  // 하단 통로 / 그늘
  g.fillStyle='#0a1321'; g.fillRect(0,FY+FH+50,CW,CH-(FY+FH+50));
  g.fillStyle='#121f31'; g.fillRect(0,FY+FH+50,CW,10);

  // 좌우 광고보드/벤치 구역
  g.fillStyle='#102136'; g.fillRect(0,FY,FX-7,FH); g.fillRect(FX+FW+7,FY,CW-(FX+FW+7),FH);
  for (let y=FY+18, i=0; y<FY+FH-18; y+=54,i++){
    const board = i%2 ? '#2a5d96' : '#9b3550';
    g.fillStyle = board;
    g.fillRect(7,y,27,32); g.fillRect(CW-34,y,27,32);
    g.fillStyle='rgba(255,255,255,.78)';
    g.fillRect(11,y+6,18,3); g.fillRect(11,y+13,12,3); g.fillRect(11,y+20,18,3);
    g.fillRect(CW-30,y+6,18,3); g.fillRect(CW-24,y+13,12,3); g.fillRect(CW-30,y+20,18,3);
  }
  g.fillStyle='#0c1a2a'; g.fillRect(34,FY+36,12,120); g.fillRect(CW-46,FY+FH-156,12,120);
  g.fillStyle='#41566d'; g.fillRect(36,FY+42,8,7); g.fillRect(CW-44,FY+FH-150,8,7);
  g.fillStyle='#1d3b2d'; g.fillRect(35,FY+50,10,24); g.fillRect(CW-45,FY+FH-143,10,24);

  // 피치 받침대: 오른쪽/아래쪽으로 깊이가 보이게 만든다.
  g.fillStyle='rgba(0,0,0,.24)';
  g.beginPath();
  g.moveTo(FX+8,FY+8); g.lineTo(FX+FW+16,FY+8); g.lineTo(FX+FW+24,FY+FH+18); g.lineTo(FX+16,FY+FH+18);
  g.closePath(); g.fill();
  g.fillStyle='#143d2b'; g.fillRect(FX-9,FY-9,FW+18,9);
  g.fillStyle='#0e3223'; g.fillRect(FX+FW,FY,9,FH+9);
  g.fillStyle='#0a261b'; g.fillRect(FX,FY+FH,FW+9,10);
  g.fillStyle='#1d6841'; g.fillRect(FX-7,FY-7,FW+14,4); g.fillRect(FX-7,FY,4,FH);
  g.fillStyle='#07341f'; g.fillRect(FX-7,FY-3,FW+14,3); g.fillRect(FX-3,FY+FH,FW+10,7);
  g.fillRect(FX-7,FY,4,FH); g.fillRect(FX+FW,FY,7,FH+7);

  // 잔디: 큰 스트라이프 + 미세 결 + 가장자리 비네트
  g.fillStyle='#23884b'; g.fillRect(FX,FY,FW,FH);
  const stripeW = FW/12;
  for (let i=0;i<12;i++){
    g.fillStyle = i%2 ? '#2ba55a' : '#248b4c';
    g.fillRect(Math.round(FX+i*stripeW),FY,Math.ceil(stripeW)+1,FH);
  }
  for (let y=FY+10;y<FY+FH-6;y+=18){
    for (let x=FX+8;x<FX+FW-6;x+=22){
      const phase = ((x+y)/6|0)%3;
      g.fillStyle = phase===0 ? 'rgba(255,255,255,.046)' : 'rgba(5,57,29,.09)';
      g.fillRect(x+(phase*3),y,6,2);
    }
  }
  const pitchLight=g.createLinearGradient(FX,FY,FX,FY+FH);
  pitchLight.addColorStop(0,'rgba(223,255,233,.12)');
  pitchLight.addColorStop(.42,'rgba(255,255,255,0)');
  pitchLight.addColorStop(1,'rgba(2,35,21,.18)');
  g.fillStyle=pitchLight; g.fillRect(FX,FY,FW,FH);
  const sideShade = g.createLinearGradient(FX,FY,FX+FW,FY);
  sideShade.addColorStop(0,'rgba(0,0,0,.10)');
  sideShade.addColorStop(.2,'rgba(0,0,0,0)');
  sideShade.addColorStop(.8,'rgba(0,0,0,0)');
  sideShade.addColorStop(1,'rgba(255,255,255,.05)');
  g.fillStyle=sideShade; g.fillRect(FX,FY,FW,FH);
  for(let y=FY+36;y<FY+FH;y+=56){
    g.fillStyle='rgba(238,255,242,.03)'; g.fillRect(FX,y,FW,2);
    g.fillStyle='rgba(3,43,24,.05)'; g.fillRect(FX,y+2,FW,2);
  }

  // 경기장 주변 광고 LED 느낌 라인
  g.fillStyle='#17344b'; g.fillRect(FX-22,FY-2,12,FH+6); g.fillRect(FX+FW+10,FY-2,12,FH+6);
  for(let y=FY+8;y<FY+FH-8;y+=14){
    g.fillStyle = ((y/14)|0)%2 ? '#5cd6ff' : '#ffcf66';
    g.fillRect(FX-20,y,8,3); g.fillRect(FX+FW+12,y,8,3);
  }

  return c;
}

const STADIUM_BG = new Image();
STADIUM_BG.src = './assets/stadium_25d_bg.webp?v=20260731-small';
const BALL_SHEET = new Image();
BALL_SHEET.src = './assets/ball_sheet.png';
let stadiumCanvas = null;

// 픽셀풍 임시 배경 캔버스. 외부 배경 에셋이 로드되기 전만 사용한다.
function buildStadiumCanvas(){
  const c=document.createElement('canvas'); c.width=CW; c.height=CH;
  const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
  const sky=g.createLinearGradient(0,0,0,CH);
  sky.addColorStop(0,'#2e4a6a'); sky.addColorStop(.45,'#31595b'); sky.addColorStop(1,'#243123');
  g.fillStyle=sky; g.fillRect(0,0,CW,CH);
  fillWorldPolygon([[FX-52,FY-14],[FX+FW+52,FY-14],[FX+FW+68,FY+FH+24],[FX-68,FY+FH+24]], '#71593c');
  fillWorldPolygon([[FX-36,FY-7],[FX+FW+36,FY-7],[FX+FW+48,FY+FH+12],[FX-48,FY+FH+12]], '#8c7049');
  fillWorldPolygon([[FX,FY],[FX+FW,FY],[FX+FW,FY+FH],[FX,FY+FH]], '#2b6b37');
  for(let i=0;i<14;i++){
    const x0=FX+i*(FW/14), x1=FX+(i+1)*(FW/14);
    fillWorldPolygon([[x0,FY],[x1,FY],[x1,FY+FH],[x0,FY+FH]], i%2 ? 'rgba(95,171,92,.30)' : 'rgba(10,62,25,.14)');
  }
  strokeWorldLine([[FX,FY],[FX+FW,FY],[FX+FW,FY+FH],[FX,FY+FH],[FX,FY]], '#eef8e8', 3);
  strokeWorldLine([[FX+FW/2,FY],[FX+FW/2,FY+FH]], '#eef8e8', 2.4);
  strokeWorldEllipse(FX+FW/2,FY+FH/2,54,54,'#eef8e8',2.2,48);
  return c;
}
function drawField(){
  if(STADIUM_BG.complete && STADIUM_BG.naturalWidth){
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(STADIUM_BG,0,0,CW,CH);
    return;
  }
  if(!stadiumCanvas) stadiumCanvas = buildStadiumCanvas();
  ctx.drawImage(stadiumCanvas,0,0);
}

function shadeColor(hex, amt){
  const c = hex.replace('#','');
  const n = parseInt(c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c, 16);
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const f = amt<0 ? amt+1 : amt;
  if (amt<0){ r*=f; g*=f; b*=f; } else { r=r+(255-r)*f; g=g+(255-g)*f; b=b+(255-b)*f; }
  return `rgb(${r|0},${g|0},${b|0})`;
}

function jerseyNumberOf(p){ return Math.floor((Number(p.seat)||0)/2)+1; }

function ball_or_netball(){ return isHost ? ball : netBall; }

// 배경 에셋의 실제 잔디 경계와 일치하는 투영값.
const PROJ_TOP_Y=173, PROJ_BOTTOM_Y=421;
const PROJ_TOP_L=116, PROJ_TOP_R=784;
const PROJ_BOTTOM_L=22, PROJ_BOTTOM_R=878;
// 캐릭터의 앞뒤 크기 차이는 크게 줄인다.
const PROJ_FAR_SCALE=.92, PROJ_NEAR_SCALE=.98;
// z는 물리 높이이므로 화면 픽셀과 직접 대응시키지 않는다.
const PROJ_HEIGHT_SCALE=2.35;
function depthTFromY(y){ return clamp((y-FY)/FH,0,1); }
function projectWorld(x,y,z=0){
  const t=depthTFromY(y);
  // 골대 안쪽 및 라인 밖 공도 화면에 보여야 하므로 경기장 경계에서 x를 고정하지 않는다.
  // 지나치게 먼 좌표만 제한하고, 골 네트 깊이와 자동 리턴 연출은 투영 범위에 포함한다.
  const fx=clamp((x-FX)/FW,-0.14,1.14);
  const left=lerp(PROJ_TOP_L,PROJ_BOTTOM_L,t);
  const right=lerp(PROJ_TOP_R,PROJ_BOTTOM_R,t);
  const groundX=lerp(left,right,fx);
  const groundY=lerp(PROJ_TOP_Y,PROJ_BOTTOM_Y,t);
  const scale=lerp(PROJ_FAR_SCALE,PROJ_NEAR_SCALE,t);
  return { x:groundX, y:groundY-(z||0)*PROJ_HEIGHT_SCALE*scale, groundY, scale, t, left, right };
}
function spriteScaleForY(y){ return projectWorld(FX+FW/2,y,0).scale; }
function ballScaleForY(y){ return lerp(.88,.98,depthTFromY(y)); }
function shadowSpecForY(y){
  const t=depthTFromY(y);
  return {
    offX: Math.round(lerp(-1,1,t)),
    footY: Math.round(lerp(8,10,t)),
    w: Math.round(lerp(11,16,t)),
    h: Math.round(lerp(3,5,t)),
    alphaA: lerp(.15,.22,t),
    alphaB: lerp(.24,.34,t)
  };
}
function strokeWorldLine(points, color, width){
  if(!points.length) return;
  ctx.beginPath();
  points.forEach((pt,i)=>{ const p=projectWorld(pt[0],pt[1],pt[2]||0); if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
}
function fillWorldPolygon(points, color){
  if(!points.length) return;
  ctx.beginPath();
  points.forEach((pt,i)=>{ const p=projectWorld(pt[0],pt[1],pt[2]||0); if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
  ctx.closePath(); ctx.fillStyle=color; ctx.fill();
}
function strokeWorldEllipse(cx,cy,rx,ry,color,width,steps=40){
  const pts=[];
  for(let i=0;i<=steps;i++){
    const a=(i/steps)*Math.PI*2;
    pts.push([cx+Math.cos(a)*rx, cy+Math.sin(a)*ry, 0]);
  }
  strokeWorldLine(pts,color,width);
}

// 3x5 픽셀 비트맵 숫자(1~4만 필요 — 팀당 최대 4명)
const PIXEL_DIGITS = {
  1: ['.#.','##.','.#.','.#.','###'],
  2: ['###','..#','###','#..','###'],
  3: ['###','..#','###','..#','###'],
  4: ['#.#','#.#','###','..#','..#'],
};
function drawPixelDigit(baseX, baseY, digit, px, color){
  const rows = PIXEL_DIGITS[digit] || PIXEL_DIGITS[1];
  ctx.fillStyle = color;
  for (let y=0;y<rows.length;y++){
    for (let x=0;x<rows[y].length;x++){
      if (rows[y][x]==='#') ctx.fillRect(Math.round(baseX+x*px),Math.round(baseY+y*px),Math.max(1,Math.round(px)),Math.max(1,Math.round(px)));
    }
  }
}

function drawPlayerLegacy(p, mine, sid){
  const now = Date.now();
  const stunned = isStunned(sid, now);
  const dir = Number.isFinite(p.dir) ? p.dir : 0;
  const spd = Math.hypot(p.vx||0, p.vy||0);
  const moving = spd > 0.35;
  const nearBall = !stunned && Math.hypot(ball_or_netball().x-p.x, ball_or_netball().y-p.y) < KICK_RANGE+4;
  const facing = Math.cos(dir) < -0.15 ? -1 : 1;

  ctx.save(); ctx.translate(p.x,p.y);
  const t=now/1000, walkPhase=moving?(Math.floor(t*10)%2):0;
  const bob=Math.round(moving?Math.sin(t*13):Math.sin(t*2.4)*.45);

  // 부드러운 타원 대신 3단 픽셀 그림자
  ctx.fillStyle='rgba(2,20,12,.18)'; ctx.fillRect(-14,12,28,6);
  ctx.fillStyle='rgba(2,20,12,.28)'; ctx.fillRect(-10,14,20,5);
  ctx.fillStyle='rgba(2,20,12,.38)'; ctx.fillRect(-6,16,12,3);

  if (now<tackleActiveUntil && mine){
    ctx.globalAlpha=.22; ctx.fillStyle=p.color;
    ctx.fillRect(-Math.cos(dir)*19-15,-Math.sin(dir)*19-19,30,35); ctx.globalAlpha=1;
  }

  // 작은 16×18 치비 소녀 축구선수. PX=2는 2배 backing canvas에서 실제 4px
  // 단위라 흐림 없이 또렷하고, 이전 PX=2.5보다 화면 점유 크기도 20% 작다.
  const PX=2, W=16, H=18;
  const baseX=-W*PX/2, baseY=-H*PX+13;
  const teamColor=stunned?'#838b94':p.color;
  const OUT=stunned?'#444b53':shadeColor(teamColor,-.48);
  const DARK=stunned?'#5d646d':shadeColor(teamColor,-.25);
  const HI=stunned?'#aeb4ba':shadeColor(teamColor,.28);
  const FACE=stunned?'#b9b9b9':'#f4caa1';
  const INNER=stunned?'#999':'#f28fad';
  const WHITE=stunned?'#d1d1d1':'#f7f8f2';
  const SHOE='#172033', EYE='#18202d';
  const variant=Math.abs(Number(p.seat)||0)%4;
  const HAIR=stunned?'#686d75':['#5a3828','#252c3b','#d49a42','#7b4d76'][variant];
  const HAIR_HI=stunned?'#858a91':['#8b5a3c','#46516a','#f1c56b','#b071a9'][variant];

  ctx.save(); ctx.scale(facing,1); ctx.imageSmoothingEnabled=false;
  const px=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(baseX+x*PX),Math.round(baseY+(y+bob)*PX),Math.ceil(w*PX),Math.ceil(h*PX));};

  // 작은 치비 소녀 축구선수: 머리카락 실루엣 → 얼굴 → 앞머리 순서.
  // 좌석별로 갈색/남색/금발/보라 머리를 사용하고 팀 색은 머리핀과 유니폼에 둔다.
  if(variant===0){ px(12,3,3,7,OUT); px(13,4,3,5,HAIR); }
  else if(variant===1){ px(2,2,2,9,OUT); px(12,2,2,9,OUT); }
  else if(variant===2){ px(12,3,3,4,OUT); px(13,4,3,3,HAIR); }
  else { px(1,4,3,5,OUT); px(0,5,3,4,HAIR); }

  px(3,1,10,2,OUT); px(2,3,12,7,OUT); px(3,10,10,1,OUT);
  px(3,2,10,3,HAIR); px(3,4,10,5,FACE); px(4,9,8,1,FACE);
  px(3,3,3,3,HAIR); px(6,3,2,2,HAIR_HI); px(10,3,3,3,HAIR);
  px(3,8,2,2,HAIR); px(11,8,2,2,HAIR);
  px(4,7,2,1,INNER); px(10,7,2,1,INNER);
  if (!stunned){
    px(5,5,1,2,EYE); px(10,5,1,2,EYE);
    px(5,5,1,1,'#fff'); px(10,5,1,1,'#fff');
    px(7,8,2,1,INNER);
  } else { px(4,6,2,1,EYE); px(10,6,2,1,EYE); }

  // 팀색 머리핀
  px(11,2,2,1,teamColor); px(12,1,1,3,HI);

  // 몸통/팔: 태클 중이면 앞팔과 몸을 길게 보여 동작을 읽기 쉽게 한다.
  px(3,10,10,5,OUT); px(4,10,8,4,teamColor); px(4,12,8,1,HI);
  if (p.tackle){ px(1,11,3,2,OUT); px(0,12,3,2,teamColor); px(12,10,3,2,OUT); }
  else { px(2,11,2,3,OUT); px(3,11,1,2,FACE); px(12,11,2,3,OUT); px(12,11,1,2,FACE); }
  px(4,14,8,2,OUT); px(5,14,6,2,WHITE);

  const step=walkPhase?1:0, kicking=now<(p._kickPoseUntil||0);
  if(kicking){
    px(4,16,2,2,OUT); px(3,17,3,1,SHOE);
    px(10,15,3,2,OUT); px(12,16,4,2,SHOE);
  }else{
    px(5-step,16,2,2,OUT); px(9+step,16,2,2,OUT);
    px(4-step,17,3,1,SHOE); px(9+step,17,3,1,SHOE);
  }

  drawPixelDigit(baseX+7*PX,baseY+(10.4+bob)*PX,jerseyNumberOf(p),1,'rgba(255,255,255,.96)');
  ctx.restore();

  if (mine&&kickCharging){
    const pct=clamp((now-kickChargeStart)/KICK_CHARGE_MS,0,1);
    // 슛 방향/파워 가이드: 차징 중에만 보여 화면을 어지럽히지 않는다.
    ctx.save(); ctx.rotate(dir);
    const guide=28+Math.round(pct*34);
    ctx.fillStyle=pct>.72?'#fff3a5':'rgba(255,230,109,.82)';
    for(let gx=24;gx<guide;gx+=8) ctx.fillRect(gx,-2,5,4);
    ctx.fillRect(guide,-5,4,10); ctx.fillRect(guide+4,-3,4,6);
    ctx.restore();
  }
  if (mine){
    ctx.fillStyle='#ffe66d';ctx.fillRect(-5,-38,10,3);ctx.fillRect(-3,-41,6,3);ctx.fillRect(-1,-44,2,3);
  }
  if (stunned){ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff59d';ctx.fillText('💫',0,-42);}

  const label=String(p.nick||'Player').slice(0,8);
  ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  const labelY=Math.round(-50-Math.max(0,6*(depthScale-.75)));
  ctx.lineWidth=2;ctx.strokeStyle='rgba(4,12,20,.9)';ctx.strokeText(label,0,labelY);
  ctx.fillStyle=mine?'#ffe66d':'#fff';ctx.fillText(label,0,labelY);
  ctx.restore();
}

function spriteVariantOf(p){
  const v=Number(p?.characterVariant);
  return Number.isFinite(v)?Math.max(0,Math.min(5,Math.floor(v))):Math.abs(Math.floor((Number(p.seat)||0)/2))%6;
}

/* 서버가 배정한 팀별 6종 이미지 스프라이트를 동일하게 렌더링한다. */
function drawPlayer(p,mine,sid){
  const now=Date.now(), stunned=isStunned(sid,now);
  const dir=Number.isFinite(p.dir)?p.dir:0;
  // 원격 선수의 p.vx/p.vy는 화면 좌표 보간용이라 0으로 남는다. 이전에는
  // 상대가 이동해도 계속 대기 자세였으므로 원격 애니메이션은 수신 속도를 쓴다.
  const animVX=mine?(p.vx||0):(p.netVX||0),animVY=mine?(p.vy||0):(p.netVY||0);
  const spd=Math.hypot(animVX,animVY);
  const moving=spd>.3, running=spd>3.35, facing=Math.cos(dir)<-.15?-1:1;
  const b=ball_or_netball(), nearBall=!stunned&&Math.hypot(b.x-p.x,b.y-p.y)<KICK_RANGE+5;
  // 전역 시계로 프레임을 고르면 출발 순간 중간 동작으로 튄다. 선수별 누적
  // 애니메이션 시계를 사용해 항상 접지 동작부터 자연스럽게 시작한다.
  const animDt=clamp(now-(p._animAt||now),0,50);
  p._animAt=now;
  if(moving)p._animClock=(p._animClock||0)+animDt/(running?78:98);
  else p._animClock=0;
  const animStep=Math.floor(p._animClock||0);
  const phase=moving?(animStep%2):0;
  // 정지 상태에서 캐릭터 전체를 위아래로 옮기던 1px bob이 둥둥 떠 보이던
  // 원인이었다. 상하 이동은 달리는 접지 순간에만 사용하고 대기 중에는 0이다.
  // 8프레임 달리기와 같은 순서로 지지 때 1px 내려가고 공중 때 1px 오른다.
  // 단순히 홀수 프레임마다 내려가던 방식보다 발 접지와 몸통 높이가 맞는다.
  const runBob=[0,1,0,-1,0,1,0,-1];
  const bob=0;
  const sway=moving?(phase?1:-1):0;
  const kicking=now<(p._kickPoseUntil||0);
  const heading=now<(p._headerPoseUntil||0);
  const tackling=now<(p._tacklePoseUntil||0)||p.tackle;
  const headerStart=p._headerPoseStart||now;
  const headerProgress=heading?clamp((now-headerStart)/HEADER_DUR_MS,0,1):0;
  const actionLift=heading?Math.round(Math.sin(headerProgress*Math.PI)*14):0;
  const dribbling=nearBall&&moving&&!kicking&&!heading&&!tackling;
  const proj=projectWorld(p.x,p.y,0);
  // 발 프레임 교대와 동시에 y 좌표 원근 배율까지 변하면 크기가 출렁여 보인다.
  // 캐릭터는 고정 배율로 그리고 경기장 깊이는 위치/그림자만으로 표현한다.
  const depthScale=.95;
  const shadow=shadowSpecForY(p.y);

  ctx.save();
  ctx.translate(Math.round(proj.x),Math.round(proj.groundY));
  // 발바닥 바로 아래의 낮은 타원 그림자만 사용한다. 발밑 링/막대는 표시하지 않는다.
  ctx.save();
  ctx.translate(shadow.offX,shadow.footY);
  ctx.fillStyle=`rgba(2,14,10,${shadow.alphaA.toFixed(3)})`;
  ctx.beginPath();ctx.ellipse(0,0,shadow.w*.8,shadow.h*.8,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=`rgba(2,14,10,${shadow.alphaB.toFixed(3)})`;
  ctx.beginPath();ctx.ellipse(0,0,Math.max(4,shadow.w*.464),Math.max(1.6,shadow.h*.416),0,0,Math.PI*2);ctx.fill();
  ctx.restore();
  ctx.translate(0,Math.round(bob-actionLift));

  if(now<tackleActiveUntil&&mine){
    ctx.globalAlpha=.18;ctx.fillStyle=p.color;
    ctx.fillRect(-Math.cos(dir)*14-10,-Math.sin(dir)*14-15,21,26);ctx.globalAlpha=1;
  }

  const variant=spriteVariantOf(p);
  const sprite=soccerPlayerSprites[p.team]?.[variant]||soccerPlayerSprites[p.team]?.[0]||soccerPlayerSprites.A[0];
  const spriteReady=!!(sprite&&sprite.complete&&sprite.naturalWidth>=SOCCER_SPRITE_CELL*20);
  if(spriteReady){
    // 0~7 좌우 다리를 완전히 교대한 달리기 8단계 / 8~9 헤딩 /
    // 10~11 태클 / 12~14 대기 호흡 / 15~16 드리블 / 17~19 슛.
    // 원격 선수도 netVX/netVY와 현재 시간으로 같은 순환을 계산하므로 한 자세로
    // 미끄러지지 않는다. 기본 속도에서도 반드시 새 8프레임 달리기를 쓴다.
    const moveFrames=[0,1,2,1,4,5,6,5];
    const dribbleFrames=[0,15,2,15,4,16,6,16];
    const idleFrames=[12,13,14,13];
    const moveCycle=moveFrames[animStep%moveFrames.length];
    const dribbleCycle=dribbleFrames[animStep%dribbleFrames.length];
    const idleCycle=idleFrames[Math.floor((now+(Number(p.seat)||0)*83)/620)%idleFrames.length];
    // 슛은 준비→접촉→팔로스루 3단계를 모두 보여 한 장으로 끝나지 않는다.
    const kickProgress=kicking?clamp(1-((p._kickPoseUntil||0)-now)/180,0,1):0;
    const tackleStart=p._tacklePoseStart||now;
    const tackleProgress=tackling?clamp((now-tackleStart)/TACKLE_DUR_MS,0,1):0;
    const actionFrame=heading?(headerProgress<.48?8:9):(tackling?(tackleProgress<.45?10:11):-1);
    const kickFrame=kickProgress<.34?17:(kickProgress<.68?18:19);
    const frame=actionFrame>=0?actionFrame:
      (kicking?kickFrame:(dribbling?dribbleCycle:(moving?moveCycle:idleCycle)));
    ctx.save();
    ctx.scale(facing*depthScale,depthScale);
    // 원본 224px 셀을 고DPI 캔버스에 고품질 축소한다. 이전처럼 에셋 자체를
    // 72px로 낮추지 않으므로 얼굴과 유니폼 세부 정보가 유지된다.
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    if(stunned)ctx.filter='grayscale(1) brightness(.78)';
    // 4:4 화면 가독성을 위해 기존 표시 크기의 80%로 축소한다. 원본 384px
    // 스프라이트는 그대로 사용하므로 얼굴과 유니폼의 선명도는 유지된다.
    ctx.drawImage(sprite,frame*SOCCER_SPRITE_CELL,0,SOCCER_SPRITE_CELL,SOCCER_SPRITE_CELL,-28.16,-48.64,56.32,56.32);
    ctx.imageSmoothingEnabled=false;
    ctx.filter='none';
    ctx.restore();
  }else{
    // 이미지 로드 실패 시 캐릭터를 새로 그리지 않고 팀 기본 스프라이트가 로드될 때까지 건너뛴다.
    ctx.restore();
    return;
  }

  if(mine&&kickCharging){
    const pct=clamp((now-kickChargeStart)/KICK_CHARGE_MS,0,1);
    // 캐릭터를 두르는 원형 게이지는 제거하고, 방향 점선의 길이만 충전량에
    // 따라 늘어난다. 모바일 버튼 안의 채움 게이지는 손가락 아래에서도 보인다.
    ctx.save();ctx.rotate(dir);const guide=20+Math.round(pct*25);
    ctx.fillStyle=pct>.72?'#fff3a5':'rgba(255,230,109,.85)';
    for(let gx=18;gx<guide;gx+=6)ctx.fillRect(gx,-1.2,3,2.4);
    ctx.fillRect(guide,-3.2,2.4,6.4);ctx.restore();
  }
  if(stunned){ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff59d';ctx.fillText('💫',0,-44);}

  // 닉네임은 프레임 없이 정수리 바로 위에 작고 반투명하게 표시한다.
  // 헤딩 점프 시 현재 컨텍스트와 함께 자연스럽게 올라간다.
  const nick=String(p.nick||'Player').slice(0,10);
  ctx.font='700 6px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  const labelY=-43;
  ctx.lineWidth=1.45;ctx.strokeStyle='rgba(0,0,0,.40)';ctx.strokeText(nick,0,labelY);
  ctx.fillStyle=mine?'rgba(255,246,188,.94)':'rgba(255,255,255,.88)';ctx.fillText(nick,0,labelY);
  if(mine){
    const markerY=labelY-6;
    ctx.fillStyle='rgba(255,235,128,.62)';
    ctx.beginPath();ctx.moveTo(-3.2,markerY-2.4);ctx.lineTo(3.2,markerY-2.4);ctx.lineTo(0,markerY+1.6);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

function drawBallTrail(){
  for (const t of ballTrail){
    const p = projectWorld(t.x,t.y,t.z||0);
    ctx.save();
    ctx.globalAlpha = clamp(t.life,0,1)*0.26;
    const s = (2 + 4*clamp(t.life,0,1)) * p.scale;
    ctx.fillStyle = '#dff7ff';
    ctx.fillRect(Math.round(p.x-s/2), Math.round(p.y-s/2), Math.max(2,Math.round(s)), Math.max(2,Math.round(s)));
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(p.x-s/4), Math.round(p.y-s/4), Math.max(1,Math.round(s/2)), Math.max(1,Math.round(s/2)));
    ctx.restore();
  }
}

function drawRings(){
  for (const r of rings){
    const base=projectWorld(r.x,r.y,0);
    ctx.save();
    ctx.globalAlpha = clamp(r.alpha,0,1);
    ctx.strokeStyle = r.color; ctx.lineWidth = 2;
    const rw=Math.max(8,r.r*base.scale);
    const rh=Math.max(4,r.r*base.scale*.42);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y+6, rw, rh, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
}

// 공 판정 반지름(BR)은 그대로 두고 화면 표시와 그림자만 기존의 80%로 축소한다.
function drawBall(b){
  b=ballRenderState(b);
  const ground=projectWorld(b.x,b.y,0);
  const proj=projectWorld(b.x,b.y,b.z||0);
  const depthScale=ballScaleForY(b.y);
  const shadow=shadowSpecForY(b.y);
  ctx.save();
  const ballLift=clamp(Number(b.z||0)/28,0,1);
  const sw=Math.max(2.4,6.4*depthScale*(1-ballLift*.48));
  const sh=Math.max(1.2,2.16*depthScale*(1-ballLift*.38));
  ctx.globalAlpha=.34-ballLift*.20;
  ctx.fillStyle='rgba(2,12,10,.72)';
  ctx.beginPath();ctx.ellipse(Math.round(ground.x+shadow.offX),Math.round(ground.groundY+4),sw,sh,0,0,Math.PI*2);ctx.fill();
  ctx.restore();

  const speed=Math.hypot(b.vx||0,b.vy||0);
  const frame=Math.floor(Date.now()/(speed>1?80:220)+Math.abs((b.x||0)+(b.y||0))/28)%4;
  const w=Math.round(13.056*depthScale), h=Math.round(13.056*depthScale);
  const dx=Math.round(proj.x-w/2), dy=Math.round(proj.y-h*.78);
  ctx.imageSmoothingEnabled=false;
  if(BALL_SHEET.complete && BALL_SHEET.naturalWidth){
    ctx.drawImage(BALL_SHEET, frame*16, 0, 16, 16, dx, dy, w, h);
  }else{
    ctx.fillStyle='#f7f7f2'; ctx.fillRect(dx+3,dy+2,Math.max(6,w-6),Math.max(6,h-5));
    ctx.fillStyle='#1f2b36'; ctx.fillRect(dx+Math.floor(w*.42),dy+Math.floor(h*.38),Math.max(3,Math.floor(w*.22)),Math.max(3,Math.floor(h*.22)));
  }
}

function drawParticles(){
  for (const pt of particles){
    const p=projectWorld(pt.x,pt.y,0);
    ctx.save();
    ctx.globalAlpha = clamp(pt.life,0,1);
    ctx.fillStyle = pt.color;
    const s=(pt.size||3)*p.scale;
    ctx.fillRect(Math.round(p.x-s/2),Math.round(p.y-s/2),Math.max(2,Math.round(s)),Math.max(2,Math.round(s)));
    ctx.restore();
  }
}

function drawHUD(){
  const now=Date.now();
  let sec=Math.max(0,Math.ceil((durationMs-(now-startTs))/1000));
  if(!startTs) sec=Math.ceil(durationMs/1000);
  const lowTime=sec<=10&&gameActive&&!gameOver;
  const mm=String(Math.floor(sec/60)).padStart(2,'0');
  const ss=String(sec%60).padStart(2,'0');
  const hud=document.getElementById('scoreHud');
  const scoreAEl=document.getElementById('scoreA');
  const scoreBEl=document.getElementById('scoreB');
  const clockEl=document.getElementById('scoreClock');
  if(scoreAEl) scoreAEl.textContent=String(score.A);
  if(scoreBEl) scoreBEl.textContent=String(score.B);
  if(clockEl) clockEl.textContent=mm+':'+ss;
  if(hud) hud.classList.toggle('low',lowTime);
}

function drawKickoffCountdown(){
  if(kickoffUntil<=0)return;
  const left=kickoffUntil-Date.now();
  if(left<=0)return;
  const sec=Math.ceil(left/1000);
  ctx.save();
  // 화면 전체를 덮는다. 이전처럼 논리 필드(FX/FY)만 덮어 좌우가 남지 않는다.
  ctx.fillStyle='rgba(2,8,12,.58)';ctx.fillRect(0,0,CW,CH);
  const pulse=1+Math.sin(Date.now()/110)*.035;
  ctx.translate(CW/2,CH/2);ctx.scale(pulse,pulse);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='900 92px system-ui,sans-serif';
  ctx.lineWidth=12;ctx.strokeStyle='rgba(0,0,0,.45)';
  ctx.strokeText(String(sec),0,2);
  ctx.fillStyle='#fff4c2';ctx.fillText(String(sec),0,0);
  ctx.font='700 18px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,.9)';
  ctx.fillText(kickoffTeamLabel?`${kickoffTeamLabel} · 준비!`:'준비!',0,72);
  ctx.restore();
}


function drawFieldRestartNotice(){
  if(!fieldRestartText||Date.now()>=fieldRestartUntil)return;
  ctx.save();
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='900 25px system-ui,sans-serif';ctx.lineWidth=7;
  ctx.strokeStyle='rgba(0,0,0,.68)';ctx.strokeText(fieldRestartText,CW/2,86);
  ctx.fillStyle='#fff4c2';ctx.fillText(fieldRestartText,CW/2,86);
  ctx.restore();
}

function drawGoalFlash(){
  if (!goalFlashTeam || Date.now()>goalFlashUntil) { goalFlashTeam=null; return; }
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = goalFlashTeam==='A' ? '#e74c3c' : '#3b82f6';
  ctx.fillRect(0,0,CW,CH);
  ctx.globalAlpha = 1;
  ctx.fillStyle='#fff'; ctx.font='bold 46px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('GOAL!', CW/2, CH/2);
  ctx.restore();
}

function draw(){
  updateCamera();
  ctx.save();
  const now = Date.now();
  if (now < shakeUntil){
    const decay = (shakeUntil-now)/300;
    const mag = shakeMag*clamp(decay,0,1);
    ctx.translate((Math.random()*2-1)*mag, (Math.random()*2-1)*mag);
  } else {
    shakeMag = 0;
  }
  applyWorldCamera();
  drawField();
  drawBallTrail();
  const renderables=[];
  for (const [sid,p] of Object.entries(players)) renderables.push({depth:p.y,type:'player',fn:()=>drawPlayer(p,sid===mySid,sid)});
  const shownBall=ball_or_netball();
  renderables.push({depth:(shownBall.y||FY)+((shownBall.z||0)>0?1:0),type:'ball',fn:()=>drawBall(shownBall)});
  renderables.sort((a,b)=>a.depth-b.depth+(a.type==='ball'?0.01:0));
  for(const r of renderables) r.fn();
  drawRings();
  drawParticles();
  ctx.restore();
  drawHUD();
  drawGoalFlash();
  drawFieldRestartNotice();
  drawKickoffCountdown();
}


/* ── 게임 루프 (프레임 하나의 예외가 루프 전체를 죽이지 않도록 격리) ── */
let loopRunning = false;
function startLoop(){
  if (loopRunning) return;
  loopRunning = true;
  let lastTs=performance.now();
  let accumulator=0;
  function tick(ts){
    const frameMs=clamp(Number(ts-lastTs)||0,0,100);
    lastTs=ts;
    accumulator+=frameMs;
    try{
      let steps=0;
      while(accumulator>=FIXED_STEP_MS&&steps<MAX_FIXED_STEPS){
        updateKickoffCountdown();
        updateMe();
        lerpRemote();
        updateNetBall();
        updateBallHost(true);
        updateBallImpactFx();
        updateBallTrail();
        updateRings();
        updateParticles();
        accumulator-=FIXED_STEP_MS;
        steps++;
      }
      // 탭 복귀 등으로 누적이 지나치게 커지면 오래된 시간을 버린다.
      if(steps===MAX_FIXED_STEPS) accumulator=Math.min(accumulator,FIXED_STEP_MS);
      netSends();
      draw();
    }catch(err){
      try{ console.error('[soccer] frame error (자동 복구됨):', err); }catch(_){}
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


function soccerCompatTeamOfSid(sid){
  const r=(roster||[]).find(p=>String(p.sid||p.sessionId||'')===String(sid||''));
  const seat=Number(r?.seat ?? -1);
  return seat>=0 && (seat%2===0) ? 'A' : 'B';
}
function soccerCompatOwnerForTeam(team){
  const arr=(roster||[]).filter(p=>Number(p?.seat??-1)>=0 && soccerCompatTeamOfSid(p.sid||p.sessionId)===team)
    .sort((a,b)=>Number(a.seat)-Number(b.seat));
  return String(arr[0]?.sid||arr[0]?.sessionId||mySid||'');
}
function soccerCompatSnapshot(){
  const r=soccerCompatRound;if(!r)return null;
  let scoreA=0,scoreB=0;
  for(const [sid,v] of Object.entries(soccerCompatScores||{})){
    const n=Math.max(0,Number(v||0));
    if(soccerCompatTeamOfSid(sid)==='A')scoreA+=n;else scoreB+=n;
  }
  return {
    phase:r.phase,roundId:r.id,kind:r.kind,seed:r.seed,beginsAt:r.beginsAt,endsAt:r.endsAt,
    resultUntil:r.resultUntil||0,kickoffAt:r.kickoffAt||0,winner:r.winner||'',tied:!!r.tied,
    roundScoreA:scoreA,roundScoreB:scoreB,scoreA:Number(score.A||0),scoreB:Number(score.B||0),
    kickoffOwnerSid:String(r.kickoffOwnerSid||''),remainingMs:Math.max(0,Number(durationMs||120000)),
    serverNow:Date.now(),roundSerial:Number(r.serial||0),selfRoundScore:Math.max(0,Number(soccerCompatScores[mySid]||0))
  };
}
function soccerCompatBroadcast(){
  if(!isHost||!soccerCompatRound)return;
  const snap=soccerCompatSnapshot();
  bridgeSend('sc_compat',{packet:{kind:'state',hostSid:mySid,version:++soccerCompatLastHostVersion,snapshot:snap,scores:{...soccerCompatScores}}});
}
function soccerCompatScheduleTick(){
  if(soccerCompatTickTimer)clearTimeout(soccerCompatTickTimer);
  soccerCompatTickTimer=setTimeout(()=>{soccerCompatTickTimer=0;soccerCompatTick();},450);
}
function soccerCompatStartRound(kind='initial'){
  if(!isHost)return;
  const restart=kind==='restart',now=Date.now(),beginsAt=now+800,endsAt=beginsAt+(restart?5000:10000);
  soccerCompatScores={};soccerCompatSeenSubmit={};
  soccerCompatRound={id:`compat-${restart?'r':'i'}-${++soccerCompatSerial}-${now}`,serial:soccerCompatSerial,kind:restart?'restart':'initial',
    seed:(Math.floor(Math.random()*2147483646)+1),phase:'quiz',beginsAt,endsAt,resultUntil:0,kickoffAt:0,winner:'',tied:false,kickoffOwnerSid:''};
  soccerCompatBroadcast();soccerCompatScheduleTick();
}
function soccerCompatTick(){
  if(!isHost||!soccerCompatRound)return;
  const r=soccerCompatRound,now=Date.now();
  if(r.phase==='quiz'&&now>=r.endsAt+150){
    let a=0,b=0;for(const [sid,v] of Object.entries(soccerCompatScores)){if(soccerCompatTeamOfSid(sid)==='A')a+=Number(v||0);else b+=Number(v||0);}
    r.tied=a===b;r.winner=r.tied?((r.seed&1)?'A':'B'):(a>b?'A':'B');r.kickoffOwnerSid=soccerCompatOwnerForTeam(r.winner);
    r.phase='result';r.resultUntil=now+3000;r.kickoffAt=r.resultUntil+3000;soccerCompatBroadcast();
  }else if(r.phase==='result'&&now>=r.resultUntil){r.phase='countdown';soccerCompatBroadcast();
  }else if(r.phase==='countdown'&&now>=r.kickoffAt){r.phase='playing';soccerCompatBroadcast();
  }else{
    // Heartbeat lets reloads/late iframe initialization recover the current round
    // from the legacy relay without any Worker-side cache/API additions.
    soccerCompatBroadcast();
  }
  soccerCompatScheduleTick();
}
function soccerCompatAcceptSubmit(sid,p){
  if(!isHost||!soccerCompatRound||soccerCompatRound.phase!=='quiz'||!p)return;
  if(String(p.roundId||'')!==String(soccerCompatRound.id||''))return;
  const nonce=String(p.nonce||`${sid}:${p.roundId}:${p.score}`);if(soccerCompatSeenSubmit[nonce])return;soccerCompatSeenSubmit[nonce]=1;
  soccerCompatScores[String(sid)]=Math.max(Number(soccerCompatScores[String(sid)]||0),Math.max(0,Math.floor(Number(p.score)||0)));
  soccerCompatBroadcast();
}
function soccerCompatHandlePlayers(map){
  map=map||{};
  if(isHost){
    for(const [sid,st] of Object.entries(map)){
      const p=st&&st.__soccerCompat;if(p&&p.kind==='submit')soccerCompatAcceptSubmit(sid,p);
    }
  }
  let hostPacket=null;
  if(soccerCompatHostSid&&map[soccerCompatHostSid]?.__soccerCompat?.kind==='state')hostPacket=map[soccerCompatHostSid].__soccerCompat;
  if(!hostPacket){
    for(const [sid,st] of Object.entries(map)){const p=st&&st.__soccerCompat;if(p&&p.kind==='state'&&String(p.hostSid||'')===String(sid)){hostPacket=p;soccerCompatHostSid=String(sid);break;}}
  }
  if(hostPacket?.snapshot){
    const snap={...hostPacket.snapshot};snap.selfRoundScore=Math.max(0,Number(hostPacket.scores?.[mySid]||0));
    queueOrApplySoccerSnapshot(snap);
  }
}

/* ── 브릿지 메시지 수신 ── */
window.addEventListener('message', e=>{
  const d = e.data;
  if (!d || typeof d !== 'object') return;

  if(d.type==='audio_pref'){setSoccerAudioAllowed(!!d.enabled);return;}
  if(d.type==='stop_audio'){setSoccerAudioAllowed(false);return;}

  if (d.type === 'bridge_init'){
    // 협동게임용 정식 초기화에는 sessionId가 반드시 있다.
    // 다른 게임의 범용 bridge_init이 먼저 들어오면 빈 sid로 초기화되어
    // 경기장만 보이고 조작/퀴즈가 멈출 수 있으므로 무시한다.
    if(!d.sessionId) return;
    mySid = String(d.sessionId||'');
    myNick = String(d.nick||'Player');
    mySeat = Number(d.seat ?? -1);
    isHost = !!d.isHost;

    const incoming = (d.players||[]).map(p=>({
      sid: String(p.sid||p.sessionId||''),
      nick: String(p.nick||'Player'),
      seat: Number(p.seat ?? -1),
      isHost: !!p.isHost,
    })).filter(p=>p.seat>=0);

    if (gameInitialized){
      applyRoster(incoming);
      flushPendingSoccerSnapshot();
      // 부모가 bridge_init 직후 보낸 sync 응답은 느린 iframe에서 초기화보다
      // 먼저 도착할 수 있다. iframe 자신도 매 init마다 권위 상태를 재요청한다.
      if(isHost){ if(!soccerCompatRound)soccerCompatStartRound('initial'); else soccerCompatBroadcast(); }
      return;
    }
    gameInitialized = true;
    roster = incoming;
    soccerCompatHostSid=String(incoming.find(p=>p.isHost)?.sid||incoming.find(p=>p.seat===0)?.sid||'');
    const sAt = Number(d.startedAt||0);
    // startedAt=0 means the Worker-owned quiz has not opened play yet. Treating it
    // as Date.now() made the match clock count down on a permanently locked field
    // whenever an old Worker failed to send sc_round_state.
    startTs = sAt>0 ? sAt : 0;
    initGame();
    flushPendingSoccerSnapshot();
    // Do not depend on new Worker soccer-round packets. The room host starts the
    // compatible round authority over the legacy generic relay.
    if(isHost) setTimeout(()=>{ if(!soccerCompatRound) soccerCompatStartRound('initial'); },80);
    return;
  }

  // room.js는 room.state.players(방 전체의 실시간 상태)를 감시하다가 방장이
  // 바뀔 때마다 이 메시지를 보내준다 — 투게스터 등 다른 협동 게임들이 방장
  // 승계를 안정적으로 처리하는 데 쓰는 바로 그 채널이다. sc_roster는 축구
  // 전용 보조 채널이라 타이밍이 늦거나 빠질 수 있으니, 항상 이걸 1차 소스로
  // 삼는다.
  if (d.type === 'bridge_host'){
    const prevHost = isHost;
    isHost = !!d.isHost;
    soccerCompatHostSid=String(d.hostSessionId||soccerCompatHostSid||'');
    if (isHost && !prevHost){
      // 막 방장이 됐다면, 기존에 보던 netBall 위치/속도를 그대로 물려받아
      // 공이 순간이동하듯 튀지 않게 하고, 즉시 공 계산을 이어받는다.
      ball = { x:netBall.x, y:netBall.y, z:netBall.z||0, vx:netBall.vx||0, vy:netBall.vy||0, vz:netBall.vz||0,
        owner:netBall.owner||null, ownerUntil:Date.now()+120 };
      hostBallSeq=Math.max(hostBallSeq,Number(netBall.lastAcceptedBallSeq||0));
      lastBallSpeedSeen = Math.hypot(ball.vx, ball.vy);
      if(!soccerCompatRound)soccerCompatStartRound(mathKickoff.kind==='restart'?'restart':'initial'); else soccerCompatBroadcast();
    }
    return;
  }

  if (d.type === 'sc_compat_players'){
    soccerCompatHandlePlayers(d.players||{});
    return;
  }



  if (d.type === 'sc_players'){
    const hasUrgentAction=Object.values(d.players||{}).some(s=>s&&(s.kickAt||s.headerAt||s.tackleAt||s.claimAt));
    applyRemotePlayers(d.players);
    // 게스트 액션이 도착했는데 다음 requestAnimationFrame까지 기다리면 네트워크
    // 왕복 뒤 최대 16ms가 더 붙는다. 액션 edge가 든 패킷만 호스트 판정을
    // 같은 메시지 호출 안에서 한 번 진행한다. 각 edge id의 _last* 검사 때문에
    // 다음 일반 프레임에서 힘이 중복 적용되지는 않는다.
    if(isHost&&hasUrgentAction)updateBallHost(false);
    return;
  }

  if (d.type === 'sc_ball'){
    const now=Date.now();
    if(isRoundLocked(now)){
      netBall.owner=null;localKickTrack=null;localDribbleVisualUntil=0;
      if(kickoffUntil>0){
        netBall.x=netBall.netX=FX+FW/2;netBall.y=netBall.netY=KICKOFF_Y;netBall.z=netBall.netZ=0;
        netBall.vx=netBall.netVX=0;netBall.vy=netBall.netVY=0;netBall.vz=netBall.netVZ=0;netBall.samples=[];
      }
      return;
    }
    const incomingSentAt=Number(d.sentAt||0);
    const incomingBallSeq=Number(d.ballSeq||0);
    const lastAcceptedBallSeq=Number(netBall.lastAcceptedBallSeq||0);
    const lastAcceptedSentAt=Number(netBall.lastAcceptedSentAt||0);
    // 호스트 단조 증가 ballSeq를 1차 기준으로 사용한다. 구형 릴레이와의
    // 호환을 위해 ballSeq가 없을 때만 sentAt 순서를 보조 기준으로 사용한다.
    if(incomingBallSeq){
      if(lastAcceptedBallSeq&&incomingBallSeq<=lastAcceptedBallSeq)return;
      netBall.lastAcceptedBallSeq=incomingBallSeq;
    }else{
      if(lastAcceptedBallSeq)return;
      if(lastAcceptedSentAt&&(!incomingSentAt||incomingSentAt<lastAcceptedSentAt))return;
    }
    if(incomingSentAt)netBall.lastAcceptedSentAt=incomingSentAt;
    const incomingImpact=d.impactAt?String(d.impactAt):'';
    const newImpact=!!(incomingImpact&&incomingImpact!==String(netBall.impactAt||''));
    const confirmsLocalKick=!!(localKickTrack&&incomingImpact===String(localKickTrack.id));
    // 로컬 킥이 시작된 뒤 생성된 호스트 공 스냅샷만 거부 판단에 사용한다.
    // 킥 전에 이미 전송돼 늦게 도착한 스냅샷은 baselineBallSeq 이하라 세지 않는다.
    if(localKickTrack&&incomingBallSeq>Number(localKickTrack.baselineBallSeq||0)){
      localKickTrack.authoritySnapshots=Number(localKickTrack.authoritySnapshots||0)+1;
    }
    const preservingLocalKick=!!localKickTrack;
    netBall.netX = Number(d.x ?? netBall.netX);
    netBall.netY = Number(d.y ?? netBall.netY);
    netBall.netZ = Math.max(0,Number(d.z ?? netBall.netZ ?? 0));
    netBall.netVX=Number(d.vx??0);
    netBall.netVY=Number(d.vy??0);
    netBall.netVZ=Number(d.vz??0);
    netBall.netSentAt=Number(d.sentAt||now);
    if(Number(d.restartSerial||0)>Number(netBall.restartSerial||0)){
      netBall.restartSerial=Number(d.restartSerial||0);
      fieldRestartText=String(d.restartText||'');
      fieldRestartUntil=Number(d.restartUntil||0);
      localKickTrack=null;localDribbleVisualUntil=0;pendingClaimAt=0;pendingClaimUntil=0;
    }
    netBall.netBallSeq=incomingBallSeq||netBall.netBallSeq||0;
    // 표시 속도와 수신 속도를 분리한다. 매 패킷마다 표시 속도까지 교체하면
    // 게스트 화면에서 공이 30ms 단위로 가다 서다를 반복한다. 새 타격은 즉시
    // 반영하고, 일반 이동은 updateNetBall()의 연속 보간으로 따라간다.
    if(!preservingLocalKick){
      if(newImpact){
        netBall.vx=netBall.netVX;
        netBall.vy=netBall.netVY;
        netBall.vz=netBall.netVZ;
        netBall.z=netBall.netZ;
      }else{
        netBall.vx=lerp(netBall.vx||0,netBall.netVX,.22);
        netBall.vy=lerp(netBall.vy||0,netBall.netVY,.22);
        netBall.vz=lerp(netBall.vz||0,netBall.netVZ,.26);
      }
    }
    netBall.owner = d.owner ? String(d.owner) : null;
    const localOwnerConfirmed=netBall.owner===mySid;
    if(netBall.owner!==mySid&&now>=pendingClaimUntil)localDribbleVisualUntil=0;
    if(localOwnerConfirmed){
      // [중요] 호스트가 owner=mySid를 보냈다면 재획득이 최종 확정된 것이다.
      // 이전 킥 예측(localKickTrack)이 남아 있더라도 owner를 null로 되돌리면 안 된다.
      // 그렇게 하면 호스트 화면만 드리블되고 게스트 화면 공은 마지막 킥 위치에 멈춘다.
      pendingClaimAt=0; pendingClaimUntil=0;
      localDribbleVisualUntil=now+420;
      localKickTrack=null;
      netBall.kickReconcile=null;
      netBall.samples=[];
      netBall.renderOffsetX=0;netBall.renderOffsetY=0;netBall.renderOffsetZ=0;
      netBall.renderOffsetUntil=0;
    }
    netBall.netT = now;
    if(localOwnerConfirmed){
      // 소유권 확정은 킥 예측 확정보다 항상 우선한다. updateNetBall()이 다음 고정 틱에서
      // 자기 발앞 목표로 즉시 배치하므로 여기서는 권위 owner를 그대로 보존한다.
    }else if(confirmsLocalKick){
      confirmBallAuthoritySmooth({
        x:netBall.netX,y:netBall.netY,z:netBall.netZ,
        vx:netBall.netVX,vy:netBall.netVY,vz:netBall.netVZ
      },localKickTrack,now);
      netBall.owner=null;
    }else if(localKickTrack&&localKickTrack.confirmed){
      // 동일 킥의 후속 권위 스냅샷은 표시 위치를 덮지 않고 추적 상태만 갱신한다.
      localKickTrack.authReceivedAt=now;
      localKickTrack.authX=netBall.netX;localKickTrack.authY=netBall.netY;localKickTrack.authZ=netBall.netZ;
      localKickTrack.authVX=netBall.netVX;localKickTrack.authVY=netBall.netVY;localKickTrack.authVZ=netBall.netVZ;
      netBall.owner=null;
    }else if(localKickTrack&&newImpact&&incomingImpact!==String(localKickTrack.id)){
      // 다른 선수의 새 타격이 확정되면 그때만 내 예측 궤도를 종료한다.
      localKickTrack=null;
    }else if(localKickTrack&&netBall.owner){
      // 다른 선수의 소유권이 킥 이전 스냅샷으로 늦게 도착한 경우에만 예측을 유지한다.
      // 내 소유권(owner===mySid)은 위 localOwnerConfirmed 분기에서 절대 지우지 않는다.
      netBall.owner=null;
    }
    if(!Array.isArray(netBall.samples)) netBall.samples=[];
    if(!localKickTrack){
      netBall.samples.push({t:now,x:netBall.netX,y:netBall.netY,z:netBall.netZ,vx:netBall.netVX,vy:netBall.netVY,vz:netBall.netVZ});
      if(netBall.samples.length>14) netBall.samples.splice(0,netBall.samples.length-14);
    }else{
      netBall.samples=[];
    }
    if(d.impactAt){
      netBall.impactAt=String(d.impactAt);
      netBall.impactPower=Number(d.impactPower||0);
      netBall.impactDir=Number(d.impactDir||0);
      const played=playKickImpactOnce(netBall.impactAt,netBall.netX,netBall.netY,netBall.impactPower,netBall.impactDir);
      if(played&&netBall.impactAt.startsWith('h:'))sfxHeader();
      lastBallSpeedSeen=Math.hypot(netBall.vx,netBall.vy);
    }
    return;
  }

  if (d.type === 'sc_goal'){
    localKickTrack=null;
    const newA = Number(d.scoreA ?? score.A), newB = Number(d.scoreB ?? score.B);
    if (newA !== score.A) scoreAnimA = Date.now();
    if (newB !== score.B) scoreAnimB = Date.now();
    score.A = newA; score.B = newB;
    if (d.type === 'sc_goal'){
      const hold=Math.max(700,Number(d.quizDelayMs||1050));
      gameActive=false;restartLockUntil=Math.max(restartLockUntil,Date.now()+hold);clearRoundActions();
      if(isHost)setTimeout(()=>soccerCompatStartRound('restart'),Math.min(900,hold));
      if(!isHost){showGoalFlash(d.team); spawnGoalParticles(d.team); sfxGoal(); addShake(8,400);}
    }
    return;
  }

  if (d.type === 'sc_stun'){
    const sid = String(d.sid||''); const dur = Number(d.dur||0);
    if (sid && dur>0) applyStun(sid, dur, false);
    return;
  }

  if (d.type === 'sc_roster'){
    applyRoster(d.players||[]);
    return;
  }

  if (d.type === 'sc_end'){
    gameOver = true; gameActive = false;
    sfxWhistle(true);
    const a = Number(d.scoreA ?? score.A), b = Number(d.scoreB ?? score.B);
    const winner = d.winner || (a===b ? 'draw' : (a>b?'A':'B'));
    const msg = winner==='draw' ? '무승부!' : (winner==='A' ? '🔴 A팀 승리!' : '🔵 B팀 승리!');
    showOverlay(msg, `최종 스코어  A ${a} : ${b} B`);
    return;
  }
});

bridgeSend('bridge_ready', {});
// 모바일/느린 기기에서 첫 ready가 부모 리스너보다 먼저 전송되면 경기장만
// 보이고 로스터·수학 라운드가 오지 않는 상태가 된다. 초기화가 끝날 때까지만
// 제한적으로 재요청해 항상 bridge_init → sc_sync 경로를 완성한다.
[140,420,900,1800,3200].forEach(delayMs=>setTimeout(()=>{
  if(!gameInitialized) bridgeSend('bridge_ready',{retry:true});
},delayMs));
