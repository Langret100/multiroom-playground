import {RoomTransport} from './room-transport.mjs?v=0.7.0';
import {weaponSkill,SKILL_DETAILS} from './shared/weapon-skills.mjs';
import {actionState} from './shared/action-ui.mjs';
import {paintItemIcon} from './graphics.mjs';
import {GameAudio} from './audio.mjs';
import {Renderer} from './renderer.mjs?v=0.6.0';
import {WEAPONS,MONSTERS,SLOTS,RARITY_COLORS,AFFIX_NAMES,makeItem,distance} from './shared/catalog.mjs';
import {roomAt} from './shared/world.mjs';
const $=id=>document.getElementById(id),canvas=$('world'),renderer=new Renderer(canvas);
let transport=null,snapshot=null,last=performance.now(),hudAt=0,quizId=null,quizDismissed=null,selected=null,masterAction='select',touch={mx:0,my:0};
const gameAudio=new GameAudio();
const keys=new Set(),pressed={attack:false,special:false,block:false},mouse={x:innerWidth/2,y:innerHeight/2};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const held=k=>keys.has(k);
const command=c=>transport?.sendCommand(c);
const attackCommand=(special=false,p=null)=>{p=p||renderer.worldPoint(mouse.x,mouse.y);command({action:'attack',special,aimX:p.x,aimY:p.y});};
const slotNames={main:'오른손 · 주 무기',off:'왼손 · 보조',helmet:'머리 장비',armor:'몸통 장비',boots:'신발'};
function resetInput(){keys.clear();pressed.attack=pressed.special=pressed.block=pressed.sprint=false;touch={mx:0,my:0};transport?.sendInput({});}
function start(options){
  gameAudio.reset();gameAudio.unlock();transport?.close();transport=options.transport;snapshot=transport.snapshot();renderer.overview=options.role==='master'&&options.mode==='dungeon';renderer.fogAt=-1;renderer.tracks.clear();renderer.renderPositions.clear();renderer.rayCache?.clear();renderer.lightTracks?.clear();renderer.fxSeen.clear();renderer.shakeLife=0;renderer.masterRoom=2;
  $('resultOverlay').hidden=true;$('pauseOverlay').hidden=true;$('quizOverlay').hidden=true;$('hud').hidden=$('controls').hidden=false;$('side').hidden=options.role!=='master';$('side').classList.toggle('open',options.role==='master');$('side').classList.toggle('master-panel',options.role==='master');$('panelTitle').textContent=options.role==='master'?'던전 설계':'장비';$('bossHud').hidden=$('bossIntro').hidden=true;bossSeen=new Set();bossIntroUntil=0;inventorySignature='';renderer.dashTrails?.clear();
  quizId=null;quizDismissed=null;selected=null;masterAction='select';resetInput();
  $('modeLabel').textContent=options.mode==='arena'?'ARENA / 생존전':options.role==='master'?'DUNGEON / 마스터 방어':'DUNGEON / 모험가 공략';
  $('masterTools').hidden=options.role!=='master';$('inventory').hidden=options.role==='master';
  if(options.role==='master')mountMaster();renderer.buildType='select';$('inventoryBtn').textContent=options.role==='master'?'설계':'장비';canvas.focus();updateHud();
}
function menu(){if(transport?.network){resetInput();transport.post('dw_quit');}}
$('menuBtn').onclick=$('resultMenuBtn').onclick=menu;
function pause(v){if(!transport||snapshot?.result)return;if(!transport.network)transport.paused=v;$('pauseOverlay').hidden=!v;resetInput();}
$('pauseBtn').onclick=()=>pause(!transport?.paused);$('resumeBtn').onclick=()=>{pause(false);canvas.focus();};
$('mapToggle').onclick=()=>renderer.overview=!renderer.overview;
function toggleInventory(){const show=getComputedStyle($('side')).display==='none';$('side').hidden=!show;$('side').classList.toggle('open',show);}
$('inventoryBtn').onclick=$('closeEquipment').onclick=()=>{gameAudio.play('ui',.4);toggleInventory();};
function interact(){const target=actionState(snapshot).interact;if(target?.kind==='chest')quizDismissed=null;command({action:'interact',target:target?.kind,targetId:target?.id});}

function holdButton(id,key){const b=$(id);b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);if(key==='attack'&&actionState(snapshot).interact){interact();e.preventDefault();return;}const activeKey=key==='special'&&actionState(snapshot).shield?'block':key;pressed[activeKey]=true;if(activeKey!=='block'&&(key==='attack'||key==='special')&&snapshot?.me?.equipment.main?.type!=='bow')attackCommand(key==='special');e.preventDefault();});b.addEventListener('pointerup',()=>{pressed[key]=false;if(id==='specialBtn')pressed.block=pressed.special=false;});b.addEventListener('pointercancel',()=>{pressed[key]=false;if(id==='specialBtn')pressed.block=pressed.special=false;});}
holdButton('dashBtn','sprint');holdButton('attackBtn','attack');holdButton('specialBtn','special');
addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea')||!transport)return;
  if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(!e.repeat){if(e.code==='Space'&&actionState(snapshot).interact)interact();if(e.code==='KeyV'){$('rangeEnabled').checked=!$('rangeEnabled').checked;applyGameSettings();}if(e.code==='KeyE')interact();if(e.code==='KeyM')renderer.overview=!renderer.overview;if(e.code==='Tab'||e.code==='KeyI'||e.code==='KeyB')toggleInventory();if(e.code==='Escape'){if(!$('quizOverlay').hidden)closeQuiz();else if(!$('side').hidden)toggleInventory();else pause(!transport.paused);}if(e.code==='KeyX')command({action:'swap'});if(e.code==='KeyC')command({action:'clone'});if(e.code==='Digit1'&&snapshot?.masterId==='local'){command({action:'possess',entity:selected});}if(e.code==='Digit2'&&snapshot?.masterId==='local')command({action:'possess',entity:null});if(['Digit3','Digit4','Digit5'].includes(e.code)&&snapshot?.masterId==='local')command({action:'bossSkill',skill:Number(e.code.slice(-1))-3});}
  keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',resetInput);document.addEventListener('visibilitychange',()=>{if(document.hidden){gameAudio.stop();if(transport)pause(true)};});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointermove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;renderer.preview=renderer.worldPoint(mouse.x,mouse.y);});
canvas.addEventListener('pointerdown',e=>{
  if(!transport||transport.paused)return;mouse.x=e.clientX;mouse.y=e.clientY;canvas.focus();
  const p=renderer.worldPoint(mouse.x,mouse.y),s=transport.snapshot(),master=s.masterId==='local';
  const mm=renderer.minimapRect;if(mm&&!renderer.overview&&e.clientX>=mm.x&&e.clientX<=mm.x+mm.w&&e.clientY>=mm.y&&e.clientY<=mm.y+mm.h){const r=roomAt(s.map,{x:(e.clientX-mm.x)/mm.scale,y:(e.clientY-mm.y)/mm.scale});if(master&&r)renderer.masterRoom=r.id;else renderer.overview=true;return;}
  if(s.phase==='spawn'){command({action:'spawn',...p});return;}
  if(master&&!s.possession){
    if(renderer.overview){const r=roomAt(s.map,p);if(r){renderer.masterRoom=r.id;renderer.overview=false;}return;}
    if(e.button===2&&selected){const target=s.entities.find(x=>x.kind==='player'&&!x.dead&&distance(x,p)<2);command({action:'order',entity:selected,...p,target:target?.id});return;}
    if(masterAction==='select'){const m=s.entities.find(x=>x.kind==='monster'&&!x.dead&&distance(x,p)<2);selected=m?.id||null;renderer.selected=selected;return;}
    command({action:'place',room:renderer.masterRoom,type:masterAction,tier:Number($('tierSelect').value),...p});return;
  }
  if(renderer.overview){renderer.overview=false;return;}
  if(s.me?.dead){const t=s.entities.find(x=>x.kind==='player'&&!x.dead&&distance(x,p)<2);if(t)command({action:'follow',target:t.id});return;}
  if(e.button===2)pressed.special=true;else pressed.attack=true;
  if(!(e.button===2&&actionState(snapshot).shield)&&snapshot?.me?.equipment.main?.type!=='bow')attackCommand(e.button===2,p);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup',()=>{pressed.attack=false;pressed.special=false;});canvas.addEventListener('pointercancel',resetInput);
$('touchMove').addEventListener('pointerdown',e=>{e.currentTarget.setPointerCapture(e.pointerId);updateStick(e);});$('touchMove').addEventListener('pointermove',e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))updateStick(e);});
for(const type of ['pointerup','pointercancel'])$('touchMove').addEventListener(type,()=>{touch={mx:0,my:0};$('touchMove').firstElementChild.style.transform='';});
function updateStick(e){const rect=$('touchMove').getBoundingClientRect(),dx=(e.clientX-rect.left-rect.width/2)/40,dy=(e.clientY-rect.top-rect.height/2)/40,len=Math.max(1,Math.hypot(dx,dy));touch={mx:dx/len,my:dy/len};$('touchMove').firstElementChild.style.transform=`translate(${touch.mx*30}px,${touch.my*30}px)`;if(snapshot?.me){const p=renderer.screenPoint(snapshot.me);mouse.x=p.x+touch.mx*100;mouse.y=p.y+touch.my*100;}}
const monsterGlyphs={slime:'◕',skeleton:'☠',goblin:'♟',bat:'◈',ogre:'♜',spectre:'♧',spider:'※',golem:'▣',lich:'♛',dragon:'♞',chest:'▣',trap:'▲',obstacle:'▦',select:'↖'};
function mountMaster(){
  $('masterTools').innerHTML=`<p class="master-guide">① 방 선택 → ② 카드 선택 → ③ 바닥 클릭<br>방이 열리기 전까지 배치할 수 있습니다.</p><div class="room-tabs">${[2,3,4,5,6,7].map(id=>`<button data-room="${id}">${id+1}방</button>`).join('')}</div><select id="roomSelect" hidden>${[2,3,4,5,6,7].map(id=>`<option value="${id}">${id+1}</option>`).join('')}</select><div id="budget"></div><button id="readyRaid" class="primary">준비 완료 · 공략 시작 ▶</button><button id="fillRoom">추천 배치 채우기</button><div class="tier-tabs">${['N','R','SR','SSR'].map((t,i)=>`<button data-tier="${i}" style="color:${RARITY_COLORS[i]}">${t}</button>`).join('')}</div><select id="tierSelect" hidden>${[0,1,2,3].map(i=>`<option value="${i}">${i}</option>`).join('')}</select><div class="build-cards">${[['select','선택 / 지휘',0],['chest','보물상자',-8],['trap','가시 함정',8],['obstacle','장애물',6],...Object.entries(MONSTERS).filter(([k])=>!['treasure','spectre'].includes(k)).map(([k,v])=>[k,v.name,v.cost])].map(([k,name,cost])=>`<button class="build-card" data-build="${k}" data-cost="${cost}" title="${name}">${MONSTERS[k]?`<canvas class="monster-thumb" width="64" height="56" data-thumb="${k}"></canvas>`:`<i>${monsterGlyphs[k]}</i>`}<strong>${name}</strong><small class="card-cost">${cost<0?'자원 +8':cost===0?'우클릭 명령':cost+' 자원'}</small></button>`).join('')}</div><div id="placementHelp">카드를 선택한 뒤 바닥을 클릭하세요.</div><div class="command-buttons"><button id="possessBtn">보스 직접 조작 [1]</button><button id="releaseBtn">지휘 복귀 [2]</button></div><div class="boss-skills">${[0,1,2].map(i=>`<button data-boss-skill="${i}">패턴 ${i+1} [${i+3}]</button>`).join('')}</div><div id="masterRoster"></div>`;
  $('masterTools').querySelectorAll('[data-thumb]').forEach(c=>{const ctx=c.getContext('2d'),prev=renderer.ctx;renderer.ctx=ctx;ctx.save();ctx.translate(32,44);ctx.scale(22,22);renderer.drawActor({id:'card-'+c.dataset.thumb,kind:'monster',type:c.dataset.thumb,boss:MONSTERS[c.dataset.thumb].boss,x:0,y:0,hp:1,maxHp:1,equipment:{},facing:Math.PI/2},0,0);ctx.restore();renderer.ctx=prev;});
  const refresh=()=>{const tier=Number($('tierSelect').value);$('masterTools').querySelectorAll('[data-build]').forEach(b=>{b.classList.toggle('selected',b.dataset.build===masterAction);const cost=Number(b.dataset.cost);b.querySelector('small').textContent=cost<0?'자원 +8':cost===0?'우클릭 명령':Math.round(cost*(MONSTERS[b.dataset.build]?1+tier*.6:1))+' 자원';});$('masterTools').querySelectorAll('[data-tier]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.tier)===tier));};
  $('masterTools').querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>{renderer.masterRoom=Number(b.dataset.room);renderer.overview=false;});
  $('masterTools').querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{masterAction=b.dataset.build;renderer.buildType=masterAction;if(innerWidth<800&&masterAction!=='select')toggleInventory();$('placementHelp').textContent=masterAction==='select'?'몬스터 클릭: 선택 · 우클릭: 이동 / 공격 명령':b.querySelector('strong').textContent+' 선택됨 · 방 바닥을 클릭해 배치';refresh();});
  $('masterTools').querySelectorAll('[data-tier]').forEach(b=>b.onclick=()=>{$('tierSelect').value=b.dataset.tier;refresh();});
  $('fillRoom').onclick=()=>command({action:'fillRoom',room:renderer.masterRoom});$('readyRaid').onclick=()=>{command({action:'startRaid'});if(innerWidth<800)toggleInventory();};
  $('possessBtn').onclick=()=>command({action:'possess',entity:selected});$('releaseBtn').onclick=()=>command({action:'possess',entity:null});
  $('masterTools').querySelectorAll('[data-boss-skill]').forEach(b=>b.onclick=()=>command({action:'bossSkill',skill:Number(b.dataset.bossSkill)}));refresh();
}
const equipmentIconCache=new Map();
function drawEquipmentIcon(canvas,item){
 const native=renderer.characters?.itemSprite(item);
 if(native){const c=canvas.getContext('2d'),fit=Math.min(78/native.width,78/native.height);c.clearRect(0,0,96,96);c.imageSmoothingEnabled=false;c.drawImage(native,48-native.width*fit/2,48-native.height*fit/2,native.width*fit,native.height*fit);return;}
 const key=JSON.stringify([item.designId,item.appearance,item.tier,item.visual]);let image=equipmentIconCache.get(key);
 if(!image){const source=document.createElement('canvas');source.width=source.height=256;const c=source.getContext('2d');c.translate(128,128);c.scale(40,40);if(item.kind==='main')c.rotate(-.55);paintItemIcon(c,item,0);
  const data=c.getImageData(0,0,256,256).data;let minX=255,minY=255,maxX=0,maxY=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  image=document.createElement('canvas');image.width=image.height=96;const out=image.getContext('2d'),w=maxX-minX+1,h=maxY-minY+1,fit=Math.min(78/w,78/h);out.imageSmoothingEnabled=false;out.drawImage(source,minX,minY,w,h,48-w*fit/2,48-h*fit/2,w*fit,h*fit);equipmentIconCache.set(key,image);
 }
 const c=canvas.getContext('2d');c.clearRect(0,0,96,96);c.drawImage(image,0,0);
}
function itemArt(it,slot){return it?`<canvas class="item-art item-icon" width="96" height="96" data-item-slot="${slot}"></canvas>`:`<span class="empty-gear">—</span>`;}
let bossSeen=new Set(),bossIntroUntil=0;
function equipmentView(me){
  return `<div class="paper-doll"><div class="hero-preview"><canvas id="heroPreview" width="112" height="160"></canvas><b>${esc(me.name)}</b><small>모험가</small></div>${SLOTS.map(slot=>{const it=me.equipment[slot],name=slotNames[slot];return `<button class="gear-slot slot-${slot} ${it?'filled':''}" data-gear="${slot}" title="${name}${it?' · '+esc(it.name):' · 비어 있음'}" style="--rarity:${RARITY_COLORS[it?.tier||0]}">${itemArt(it,slot)}<small>${name.split(' · ').at(-1)}</small>${it?`<span class="rarity">${['N','R','SR','SSR'][it.tier]}</span>`:''}</button>`;}).join('')}</div><div id="gearDetails" class="gear-details"><b>장비 슬롯을 선택하세요</b><p>능력치와 옵션을 확인하고 장비를 버릴 수 있습니다.</p></div><div class="equipment-stats"><span>⚔ ${attackLabel(me.stats)} 공격</span><span>◇ ${Math.round(me.stats.defense)} 방어</span><span>➤ ${Math.round(me.stats.agility)} 민첩</span></div><p class="equipment-help">X: 한손 무기 교체 · C: 랜턴 분신<br>I / Tab / B: 장비창 닫기</p>`;
}
function attackLabel(stats){const lo=Math.round(stats.attackMin??stats.attack),hi=Math.round(stats.attackMax??stats.attack);return lo===hi?lo:lo+'~'+hi;}
function affixDescription(a){const chance=Math.round(a.chance*100)+'%',uses=a.charges+'/'+a.maxCharges+'회';const descriptions={poison:'적중 시 '+chance+'로 3초 중독',burn:'적중 시 '+chance+'로 3초 화상',frost:'적중 시 '+chance+'로 2초 감속',lightning:'적중 시 '+chance+'로 지연 벼락 · 18 피해',meteor:'적중 시 '+chance+'로 작은 운석 · 22 피해',multishot:'투사체 발사 시 '+chance+'로 추가 2발 · 각각 70% 피해',autoblock:'자동 피해 방어 · '+uses,taunt:'적중 시 '+chance+'로 5초 도발',reset:'피격 시 '+chance+'로 공격·특수 재사용 초기화',restore:'피격 시 '+chance+'로 소모 효과 1회 복원',revenge:'피격 시 '+chance+'로 일부 피해 반사',immune:'피격 시 '+chance+'로 상태 이상 면역',regen:'지속 회복 · 초당 체력 2',stun:'피격 시 '+chance+'로 공격자 기절',healburst:'피격 시 '+chance+'로 주변 3걸음 · 체력 10 회복',explosion:'피격 시 '+chance+'로 주변 3걸음 반격 폭발 · 자신도 추가 피해',blaze:'이동 중 불꽃 발자국 · 적에게 피해',luck:'상자 보상 20% 확률로 한 등급 상승',evade:'일반 피해 자동 회피 · '+uses,teleport:'피격 시 '+chance+'로 같은 방의 안전한 곳에 순간이동',clone:'C로 랜턴 분신 소환 · '+uses};return (a.name||AFFIX_NAMES[a.key]||a.key)+' · '+(descriptions[a.key]||chance);}
function showGear(me,slot){const it=me.equipment[slot];$('inventory').querySelectorAll('[data-gear]').forEach(b=>b.classList.toggle('selected',b.dataset.gear===slot));$('gearDetails').innerHTML=it?`<strong style="color:${RARITY_COLORS[it.tier]}">${esc(it.name)}</strong><p class="item-story">${esc(it.story||'')}</p><p class=\"item-roll\">능력치 · ${Object.entries(it.ranges||{}).map(([k,r])=>`${({hp:'체력',attack:'공격',defense:'방어',agility:'민첩'})[k]} ${k==='attack'&&it.kind==='main'?r[0]+'~'+r[1]+' (공격마다 추첨)':it.stats[k]+' (범위 '+r[0]+'~'+r[1]+')'}`).join(' · ')}</p><p>${Object.entries(it.stats).filter(([k,v])=>v&&!(k==='attack'&&it.kind==='main')).map(([k,v])=>`${({hp:'체력',attack:'공격',defense:'방어',agility:'민첩'})[k]} +${v}`).join(' · ')}</p><p>${it.affixes.map(a=>esc(affixDescription(a))).join('<br>')||'능력치 보너스 · 추가 발동 효과 없음'}</p>${it.kind==='main'?`<p class="skill-description"><b>${esc(weaponSkill(it)?.name||'특수')}</b> · 재사용 ${weaponSkill(it)?.cool||0}초<br>${esc(SKILL_DETAILS[weaponSkill(it)?.kind]||'조준 지점에 고유 공격을 사용합니다.')}</p>`:''}<button id="dropSelected">장비 버리기</button>`:`<b>${slotNames[slot]}</b><p>비어 있는 슬롯입니다.</p>`;if(it)$('dropSelected').onclick=()=>command({action:'drop',slot});}
function closeQuiz(){quizDismissed=snapshot?.quiz?.chest;$('quizOverlay').hidden=true;canvas.focus();}
$('quizCancel').onclick=closeQuiz;$('quizForm').onsubmit=e=>{e.preventDefault();command({action:'answer',answer:$('answer').value});};
let inventorySignature='';renderer.dashTrails?.clear();
function setPhaseBanner({show=false,title='',sub='',timeLabel='',progress=1}={}){
  const box=$('phaseBanner'); if(!box) return;
  box.hidden=!show;
  if(!show) return;
  $('phaseBannerTitle').textContent=title;
  $('phaseBannerSub').textContent=sub||'';
  const timer=$('phaseBannerTimer'),label=$('phaseBannerTimeLabel'),fill=$('phaseBannerTimeFill');
  const hasTimer=!!timeLabel;
  timer.hidden=!hasTimer;
  if(hasTimer){label.textContent=timeLabel;fill.style.width=`${Math.max(0,Math.min(1,progress))*100}%`;}
}
function updateHud(){
  const s=snapshot;if(!s)return;const master=s.masterId==='local',me=s.me||s.entities.find(e=>e.id===s.possession);
  renderer.sidebarOpen=!$('side').hidden;
  $('timer').textContent=`${Math.floor(s.remaining/60)}:${String(Math.floor(s.remaining%60)).padStart(2,'0')}`;
  const spawnLeft=Math.max(0,Math.ceil(10-s.time));
  const arenaSpawn=s.mode==='arena'&&s.phase==='spawn';
  const dungeonMasterPlanning=s.mode==='dungeon'&&master&&s.phase==='planning'&&!s.possession;
  $('status').textContent=arenaSpawn||dungeonMasterPlanning?'':s.phase==='planning'?'방을 설계한 뒤 공략 시작 버튼을 누르세요':master?s.possession?'보스 직접 조작 중':'방을 준비하고 모험가를 저지하세요':me?.dead?'유령 관전 · 클릭으로 생존자 따라가기':s.mode==='dungeon'?`${(me?.room||0)+1} / 8번 방`:'용암을 피해 생존하세요';
  if(arenaSpawn)setPhaseBanner({show:true,title:'시작할 위치를 선택해주세요.',sub:'10초 안에 원하는 칸을 클릭해 시작 지점을 정하세요.',timeLabel:`남은 시간 ${spawnLeft}초`,progress:(10-Math.max(0,Math.min(10,s.time)))/10});
  else if(dungeonMasterPlanning)setPhaseBanner({show:true,title:'모험가가 오기 전에 모든 방에 몬스터를 배치해주세요.',sub:'빛나는 방만 배치 가능 · 검게 표시된 방은 배치할 수 없습니다.'});
  else setPhaseBanner({show:false});
  $('objective').hidden=master;$('objective').innerHTML=master?'':s.mode==='dungeon'?`<b>${(s.objective?.room||0)+1}번 방 · 던전 공략</b><small>남은 몬스터 ${s.objective?.monsters||0} · 상자 ${s.objective?.chests||0}</small><small>${s.objective?.exit?'출구 열림 → 다음 방으로 이동':s.map.rooms[s.objective?.room]?.heal?'중앙 치유 샘 사용 · 전원 집결 '+s.objective.gathered+'/'+s.objective.livingParty+' · 20초 휴식':'몬스터를 처치해 출구를 여세요'}</small>`:`<b>아레나 · 생존 ${s.roster.filter(p=>!p.dead).length}명</b><small>장비를 모으고 용암을 피하세요</small>`;
  document.querySelector('.actions').hidden=master&&!s.possession;document.querySelector('.control-help').textContent=master?'방 선택 → 카드 선택 → 바닥 클릭 · 몬스터 선택 후 우클릭: 명령':'WASD 이동 · Shift 질주 · E 상호작용 · I / Tab 장비 · M 지도';
  if(me){
    const signature=JSON.stringify([me.equipment,me.dead,me.dead?s.roster:null]);
    if(signature!==inventorySignature){inventorySignature=signature;$('inventory').innerHTML=equipmentView(me);$('inventory').querySelectorAll('[data-gear]').forEach(b=>b.onclick=()=>showGear(snapshot.me,b.dataset.gear));
      if(me.dead){$('inventory').innerHTML='<p>관전할 모험가를 선택하세요.</p>'+s.roster.filter(p=>!p.dead).map(p=>`<button data-follow="${esc(p.id)}">${esc(p.name)} 따라가기</button>`).join('');$('inventory').querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>command({action:'follow',target:b.dataset.follow}));}}
    if(renderer.minimapRect)$('objective').style.top=`${(renderer.minimapRect.frameBottom??renderer.minimapRect.y+renderer.minimapRect.h)+32}px`;
    refreshActionButtons(me);const dashLocked=(me.dashRecovery||0)>0;$('dashBtn').disabled=!!me.dead||dashLocked;$('dashBtn').querySelector('.dash-fill').style.height=`${100*(dashLocked?me.dashRecovery/3:1-(me.dash??3)/3)}%`;$('dashBtn').querySelector('kbd').textContent=dashLocked?me.dashRecovery.toFixed(1)+'s':'Shift';
    const w=WEAPONS[me.equipment.main?.type],specialWeapon=weaponSkill(WEAPONS[me.equipment.off?.type]?me.equipment.off:me.equipment.main);$('specialBtn').disabled=me.dead||(!specialWeapon&&me.equipment.off?.type!=='shield');
    $('attackBtn').querySelector('.dash-fill').style.height=`${$('attackBtn').dataset.action==='interact'?0:100*Math.min(1,me.cooldowns.attack/(w?.delay||.45))}%`;
    $('specialBtn').querySelector('.dash-fill').style.height=`${100*Math.min(1,me.cooldowns.special/(specialWeapon?.cool||1))}%`;
    if(me.equipment.off?.type==='shield')$('specialBtn').querySelector('.dash-fill').style.height=`${100*((me.guardRecovery||0)>0?me.guardRecovery/5:1-me.guard/5)}%`;
  }
  if(master&&$('budget')){const b=s.builders[renderer.masterRoom];$('roomSelect').value=String(renderer.masterRoom);$('budget').textContent=b?`${b.locked?'배치 마감':'남은 자원'} · ${b.budget-b.spent} / ${b.budget}`:'고정 방 · 배치 불가';$('readyRaid').hidden=s.phase!=='planning';$('masterTools').querySelectorAll('[data-room]').forEach(button=>{button.classList.toggle('selected',Number(button.dataset.room)===renderer.masterRoom);button.classList.toggle('locked',!!s.builders[button.dataset.room]?.locked);});$('masterRoster').innerHTML=s.roster.map(p=>`<div class="roster-row"><span>${esc(p.name)}</span><span>${p.dead?'탈락':Math.ceil(p.hp)+' HP'}</span></div>`).join('');}
  const boss=s.entities.find(e=>e.boss&&!e.dead&&(master?e.room===renderer.masterRoom:e.room===me?.room));$('bossHud').hidden=!boss;if(boss){$('bossHud').innerHTML=`<b>${esc(boss.name)}</b><div class="boss-health"><i style="width:${boss.hp/boss.maxHp*100}%"></i></div><small>${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}</small>`;if(!master&&!bossSeen.has(boss.id)){bossSeen.add(boss.id);bossIntroUntil=performance.now()+2300;$('bossIntro').innerHTML=`<small>수호자를 마주했다</small><strong>${esc(boss.name)}</strong><span>붉은 공격 범위를 피해 싸우세요</span>`;}}$('bossIntro').hidden=performance.now()>bossIntroUntil||master;
  document.querySelectorAll('[data-item-slot]').forEach(icon=>{const item=me?.equipment[icon.dataset.itemSlot];if(item)drawEquipmentIcon(icon,item);});
  const hero=$('heroPreview');if(hero&&me){const ctx=hero.getContext('2d');ctx.clearRect(0,0,hero.width,hero.height);renderer.characters?.drawPreview(ctx,me,s.time,hero.width,hero.height);}
  $('notifications').innerHTML=s.messages.slice(-3).map(m=>`<div>${esc(m.text)}</div>`).join('');
  if(s.quiz&&s.quiz.chest!==quizDismissed){$('quizOverlay').hidden=false;$('question').textContent=s.quiz.question+' = ?';$('quizFeedback').textContent=s.quiz.feedback||'';if(quizId!==s.quiz.chest){quizId=s.quiz.chest;$('answer').value='';resetInput();$('answer').focus();}}
  else $('quizOverlay').hidden=true;
  if(!s.quiz){quizId=null;quizDismissed=null;}
  if(s.result&&$('resultOverlay').hidden){resetInput();$('quizOverlay').hidden=true;$('resultOverlay').hidden=false;const win=master?s.result.winner==='master':s.mode==='dungeon'?s.result.winner==='party':s.result.winner==='local';$('resultTitle').textContent=win?'승리':'탐험 종료';$('resultReason').textContent=s.result.reason+` · ${Math.floor(s.time/60)}분 ${Math.floor(s.time%60)}초`;}
}
let frameTimes=[],fpsTextAt=0;
function applyGameSettings(){renderer.map3d.quality=Number($('mapQuality').value);gameAudio.settings({enabled:$('soundEnabled').checked,music:Number($('musicVolume').value)/100,effects:Number($('effectsVolume').value)/100});renderer.shakeEnabled=$('shakeEnabled').checked;renderer.rangeEnabled=$('rangeEnabled').checked;try{localStorage.setItem('dungeon-options',JSON.stringify({sound:$('soundEnabled').checked,music:$('musicVolume').value,effects:$('effectsVolume').value,shake:$('shakeEnabled').checked,range:$('rangeEnabled').checked,aim:$('aimAssist').checked,quality:$('mapQuality').value,showFps:$('showFps').checked}));}catch{}}
try{const v=JSON.parse(localStorage.getItem('dungeon-options')||'null');if(v){$('soundEnabled').checked=v.sound;$('musicVolume').value=v.music;$('effectsVolume').value=v.effects;$('shakeEnabled').checked=v.shake;$('rangeEnabled').checked=v.range;$('aimAssist').checked=v.aim;$('mapQuality').value=v.quality||'1';$('showFps').checked=!!v.showFps;}}catch{}
for(const id of ['mapQuality','showFps','soundEnabled','musicVolume','effectsVolume','shakeEnabled','rangeEnabled','aimAssist'])$(id).addEventListener('input',applyGameSettings);applyGameSettings();document.addEventListener('pointerdown',()=>gameAudio.unlock(),{capture:true});
function loop(now){frameTimes.push(now-last);if(frameTimes.length>90)frameTimes.shift();const dt=Math.min(.15,(now-last)/1000);last=now;
  if(transport){let p=renderer.worldPoint(mouse.x,mouse.y);const me=snapshot?.me||snapshot?.entities.find(e=>e.id===snapshot.possession);if(me&&innerWidth<800&&$('aimAssist').checked&&(pressed.attack||pressed.special)){const target=snapshot.entities.filter(e=>!e.dead&&e.team!==me.team&&distance(e,me)<25).sort((a,b)=>distance(a,me)-distance(b,me))[0];p=target?{x:target.x,y:target.y}:{x:me.x+Math.cos(me.facing)*7,y:me.y+Math.sin(me.facing)*7};}renderer.aim=p;renderer.previewSpecial=pressed.special||held('KeyQ')||!!me?.cast;const inputBlocked=!$('quizOverlay').hidden||transport.paused||!$('resultOverlay').hidden;
    const input=inputBlocked?{}:{mx:Number(held('KeyD')||held('ArrowRight'))-Number(held('KeyA')||held('ArrowLeft'))+touch.mx,my:Number(held('KeyS')||held('ArrowDown'))-Number(held('KeyW')||held('ArrowUp'))+touch.my,aimX:p.x,aimY:p.y,attack:(!actionState(snapshot).interact&&held('Space'))||pressed.attack,special:!actionState(snapshot).shield&&(held('KeyQ')||pressed.special),sprint:held('ShiftLeft')||held('ShiftRight')||pressed.sprint,block:held('KeyF')||pressed.block||(actionState(snapshot).shield&&(held('KeyQ')||pressed.special))};
    transport.sendInput(input);transport.update(dt);snapshot=transport.snapshot();gameAudio.update(snapshot,transport.paused);renderer.draw(transport.renderSnapshot?.(now/1000)||snapshot,dt);if(now-fpsTextAt>500){fpsTextAt=now;const avg=frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length,m=renderer.map3d.stats;$('renderStats').hidden=!$('showFps').checked;$('renderStats').textContent=`${Math.round(1000/avg)} FPS · ${m.drawCalls} draws · ${Math.round(m.triangles/1000)}k tris · ${m.renderMs.toFixed(1)} ms CPU`; }if(now-hudAt>100){hudAt=now;updateHud();}
  }else{renderer.ctx.fillStyle='#0c1118';renderer.ctx.fillRect(0,0,innerWidth,innerHeight);}
  requestAnimationFrame(loop);
}
addEventListener('resize',()=>{renderer.resize();renderer.fogAt=-1;});requestAnimationFrame(loop);

function actionGlyph(kind){
 const paths={bread:'M13 34V15q0-10 7-10t7 10v19Zm4-20 7-3m-7 10 7-3m-7 10 7-3',shield:'M20 5 33 10v11q-2 10-13 16Q9 31 7 21V10Z',interact:'M8 17h24v17H8ZM8 17V9h24v8M17 20h6v6h-6Z',axe:'M11 34 27 7M21 9q15-6 14 8l-12 3M21 9l-7 8 6 6',mace:'M10 34 23 15M21 6l9 2 4 8-7 7-8-4-3-8Z',greatsword:'M7 35l8-8m-6-5 12 12M15 27 30 5l6 6-15 22',hammer:'M12 34 26 12M15 6l13-3 10 11-13 6Z',dash:'M15 5h9v13l9 6v8H9v-7l6-7ZM9 34h24M3 12h7M2 18h7',dagger:'M9 33l6-6m-4-4 8 8m-4-4L31 8l-5 18-7 5',sword:'M8 34l7-7m-4-4 8 8m-4-4L32 7l-3 14-10 10',bow:'M10 7q26 13 0 26l8-13ZM5 20h29m-6-5 6 5-6 5',magic:'M9 33l17-20M26 4v5m-8 4h5m6 0h5m-8 4v5M6 9l3-3m21 23 3 3',heal:'M17 7h7v10h10v7H24v10h-7V24H7v-7h10Z',spin:'M9 14a13 13 0 1 1-2 13M4 13h10V3',backstep:'M29 9Q9 9 9 27m-5-6 5 6 6-6M21 30h12',slam:'M20 4v23m-7-7 7 7 7-7M5 34l5-4m25 4-5-4',lightning:'M24 4 10 22h10l-4 14 15-21H21Z',throw:'M6 30 30 6m-8 0h8v8M4 15h9M4 23h6'};
 const path=paths[kind]||paths.magic;return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
$('dashBtn').querySelector('i').innerHTML=actionGlyph('dash');
let actionSignature='';
function refreshActionButtons(me){
 const main=me.equipment.main,off=me.equipment.off,w=WEAPONS[main?.type],special=WEAPONS[off?.type]||w;
 const state=actionState(snapshot);const skill=weaponSkill(WEAPONS[off?.type]?off:main);const sig=[main?.appearance,off?.appearance,main?.type,off?.type,state.special,!!me.dead,state.interact?.kind].join(':');if(sig===actionSignature)return;actionSignature=sig;
 const basic={dagger:['➤','찌르기'],sword:['⚔','휘두르기'],axe:['⚒','휘두르기'],mace:['⚒','휘두르기'],hammer:['⚒','휘두르기'],greatsword:['⚔','휘두르기'],bow:['➶','사격'],heal:['✚','치유탄'],healbolt:['✚','치유탄']};
 const skills={throw:['➤','투척'],double:['⚔','연속공격'],push:['➠','밀치기'],bleed:['⋮','출혈공격'],backstep:['↶','백스텝'],slam:['↓','내려찍기'],spin:['⟳','회전공격'],meteor:['☄','운석'],poison:['♧','독안개'],acid:['⋮','산성비'],heal:['✚','치유파동'],healbolt:['✚','치유탄'],thunder:['ϟ','벼락'],lightning:['ϟ','번개'],fireball:['♨','화염구'],vines:['♧','덩굴']};
 const a=state.interact?['',state.interact.kind==='heal'?'회복':'상호작용']:basic[main?.type]||(w?['✧','마법탄']:['✊','주먹']),b=state.shield?['','방어']:['',skill?.name||'특수'];
 for(const [id,info,key] of [['attackBtn',a,'Space'],['specialBtn',b,'Q']]){const el=$(id);el.innerHTML=`<i class="action-symbol">${actionGlyph(id==='attackBtn'?(state.interact?(state.interact.kind==='heal'?'heal':'interact'):['heal','healbolt'].includes(main?.type)?'heal':main?.type):state.shield?'shield':state.special==='breadline'?'bread':state.special==='spin'?'spin':state.special==='bladewave'?'sword':state.special)}</i><small>${info[1]}</small><kbd>${key}</kbd><span class="dash-fill"></span>`;el.title=(id==='attackBtn'?main:off?.kind==='main'?off:main)?.name||info[1];el.setAttribute('aria-label',info[1]);el.dataset.action=id==='attackBtn'&&state.interact?'interact':id==='specialBtn'&&state.shield?'block':id==='attackBtn'?'attack':'special';}
 $('attackBtn').disabled=!!me.dead;$('dashBtn').disabled=!!me.dead||me.dashRecovery>0;
}





const embedded=parent!==window;const roomGameId=new URLSearchParams(location.search).get('gameId')||'dungeonwarden';let roomTransport=null,roomStarted=false;
if(embedded){$('status').textContent='게임 룸 연결 중…';$('hud').hidden=false;
 const ready=()=>parent.postMessage({type:'bridge_ready',gameId:roomGameId},location.origin);ready();const readyTimer=setInterval(()=>{if(!roomTransport)ready();else clearInterval(readyTimer);},700);
 const connectStarted=performance.now();const syncTimer=setInterval(()=>{
 if(roomStarted){clearInterval(syncTimer);return;}
 if(roomTransport)roomTransport.post('dw_sync');else ready();
 if(performance.now()-connectStarted>10000)$('status').textContent=roomTransport?'던전 서버 응답 없음 · Worker 자동 배포 상태를 확인해 주세요.':'게임 룸 초기화 신호 없음 · 방으로 돌아가 다시 시작해 주세요.';
},1500);
addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;const d=e.data||{};if(d.gameId&&d.gameId!==roomGameId)return;
  if(d.type==='bridge_init'&&!roomTransport){roomTransport=new RoomTransport(String(d.sessionId),roomGameId);roomTransport.post('dw_sync');}
  if(d.type==='dw_packet'&&roomTransport){roomTransport.receive(d.packet);if(!roomStarted&&roomTransport.latest){roomStarted=true;const state=roomTransport.latest;start({mode:state.mode,role:state.masterId==='local'?'master':'adventurer',transport:roomTransport});}}
 });}

if(!embedded){$('hud').hidden=false;$('status').textContent='플레이그라운드 게임 룸에서 시작해 주세요.';}
