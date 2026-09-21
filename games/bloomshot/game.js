(()=>{'use strict';
const E=BloomEngine,C=E.CHARACTERS,I=E.ITEMS,$=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),mini=$('minimap'),mc=mini.getContext('2d'),dial=$('dial').getContext('2d');
const COLORS=['#a7e887','#ffb194','#c1acff','#83d8f2','#ffd881','#ef9cc5','#99e3db','#e7c5a2'];
const SHOT_VISUALS=[
 {shape:'seed',trail:'leaf',outer:'#456c2e',inner:'#cfee75',spark:'#f4ffba'},
 {shape:'petal',trail:'ribbon',outer:'#d05f86',inner:'#ffb0cf',spark:'#fff1f7'},
 {shape:'spore',trail:'mist',outer:'#6e4ba8',inner:'#c79cff',spark:'#e9d9ff'},
 {shape:'dart',trail:'streak',outer:'#8b5b2b',inner:'#ffd36c',spark:'#fff0b1'},
 {shape:'crystal',trail:'shard',outer:'#417e92',inner:'#9eeaff',spark:'#e8fcff'},
 {shape:'ember',trail:'flame',outer:'#cc4c33',inner:'#ff9a4c',spark:'#ffe08b'},
 {shape:'ice',trail:'frost',outer:'#4d8ebd',inner:'#aeeeff',spark:'#f0fdff'},
 {shape:'star',trail:'electric',outer:'#7562c8',inner:'#ffe767',spark:'#fffad0'}
];
const MAPS=E.MAPS.map(m=>m.name),ICONS={double:'Ⅱ',power:'✦',heal:'✚',move:'➟',shield:'⬡',poison:'♨',freeze:'❄',wind:'↔'};
const embedded=parent!==window,bridge={sid:'local',hostSid:'local',isHost:!embedded,ready:!embedded};
let state=null,roster=[],sequence=0,pending=null,offset=0,received=0,lastSent=0,lastSync=0,reported=false,weapon='normal',sound=false,audio=null,audioBuffer=null,audioCues=null,audioLoad=null,bgmAudio=null,noticeUntil=0,lastEvent=0,setupCharacter=-1,lastTurn=-1,cpuTurn=-1,bootAt=Date.now();
let publishedEvent=-1,publishedPhase=null;
let charge=null,moveHeld=0,lastMove=0,panHeld=0,aimHeld=0,powerHeld=0,frameAt=0;
const camera={x:0,y:0,manual:false,w:1200,h:700,targetX:0,targetY:0},art={characters:[],portraitsSmall:[],portraitsLarge:[],portraitsPilot:[],mapBackdrops:Array(5).fill(null),mapForegrounds:Array(5).fill(null),mapPreviewImages:[],atlas:null,atlasMeta:null},visualPlayers=new Map(),mapPreviews=[];
const MAP_ART=[
 {bg:'assets/maps/map-0-bg.webp',fg:'assets/maps/map-0-fg.webp',preview:'assets/maps/map-0-preview.webp'},
 {bg:'assets/maps/map-1-bg.webp',fg:'assets/maps/map-1-fg.webp',preview:'assets/maps/map-1-preview.webp'},
 {bg:'assets/maps/map-2-bg.webp',fg:'assets/maps/map-2-fg.webp',preview:'assets/maps/map-2-preview.webp'},
 {bg:'assets/maps/map-3-bg.webp',fg:'assets/maps/map-3-fg.webp',preview:'assets/maps/map-3-preview.webp'},
 {bg:'assets/maps/map-4-bg.webp',fg:'assets/maps/map-4-fg.webp',preview:'assets/maps/map-4-preview.webp'}
];
const GAMEPLAY_ATLAS='assets/gameplay-atlas.webp',ATLAS_META_PATH='assets/gameplay-atlas.json';
function load(path,onload){const image=new Image();if(onload)image.onload=onload;image.src=path;return image;}
function atlasCharRect(index){return art.atlasMeta?.chars?.[index]||null;}
function atlasPartRect(name){return art.atlasMeta?.[name]||null;}
function atlasFrameTrim(index,row,col){return art.atlasMeta?.trims?.[index]?.[row*4+col]||null;}
function drawCover(c,image,w,h,alpha=1){if(!image?.complete||!image.naturalWidth)return false;const iw=image.naturalWidth,ih=image.naturalHeight,scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale,dx=(w-dw)/2,dy=(h-dh)/2;c.save();if(alpha!==1)c.globalAlpha*=alpha;c.imageSmoothingEnabled=false;c.drawImage(image,dx,dy,dw,dh);c.restore();return true;}
function drawMapPreview(index){const preview=mapPreviews[index];if(!preview)return;const pc=preview.getContext('2d');pc.clearRect(0,0,preview.width,preview.height);pc.imageSmoothingEnabled=false;const image=art.mapPreviewImages[index];if(image?.complete&&image.naturalWidth){pc.drawImage(image,0,0,preview.width,preview.height);return;}const sample=E.create([{sessionId:'preview'}],1,0);sample.map=index;E.buildMap(sample);pc.fillStyle=E.MAPS[index].sky[0];pc.fillRect(0,0,preview.width,preview.height);pc.fillStyle='#12212c66';pc.fillRect(0,0,preview.width,preview.height);pc.fillStyle=E.MAPS[index].edge;sample.solids.forEach((c,x)=>{for(let j=0;j<c.length;j+=2)pc.fillRect(x*E.STEP/E.W*preview.width,c[j]/E.H*preview.height,1,Math.max(2,(c[j+1]-c[j])/E.H*preview.height));});}
function ensureMapArt(index){if(index<0||index>=MAP_ART.length)return;if(!art.mapBackdrops[index])art.mapBackdrops[index]=load(`${MAP_ART[index].bg}?v=13`);if(!art.mapForegrounds[index])art.mapForegrounds[index]=load(`${MAP_ART[index].fg}?v=13`);}
function refreshMapPreviews(){for(let i=0;i<MAP_ART.length;i++)drawMapPreview(i);}
function startBgm(){
 if(!bgmAudio){bgmAudio=new Audio('assets/bloombit.mp3?v=13');bgmAudio.loop=true;bgmAudio.volume=.3;}
 if(sound){bgmAudio.currentTime=bgmAudio.currentTime||0;bgmAudio.play().catch(()=>{});}
}
function syncBgm(){
 if(!bgmAudio)return;
 if(sound){bgmAudio.volume=.3;bgmAudio.play().catch(()=>{});}else bgmAudio.pause();
}
function buildPortrait(index,size=96){
 const rect=atlasCharRect(index),trim=art.atlasMeta?.trims?.[index]?.[0];if(!rect||!trim||!art.atlas?.naturalWidth)return '';
 const cw=art.atlasMeta.frameW||rect.w/4,ch=art.atlasMeta.frameH||rect.h/4,srcX=rect.x+trim.x,srcY=rect.y+trim.y,srcW=trim.w,srcH=trim.h;
 const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const scale=Math.min(size/(srcW*.82),size/(srcH*.82)),dw=srcW*scale,dh=srcH*scale;
 const dx=(size-dw)/2,dy=(size-dh)/2+size*.07;
 c.drawImage(art.atlas,srcX,srcY,srcW,srcH,dx,dy,dw,dh);
 return canvas.toDataURL('image/png');
}
function refreshPortraitAssets(){
 if(!art.atlasMeta||!art.atlas?.complete)return;
 for(let i=0;i<C.length;i++){art.portraitsSmall[i]=buildPortrait(i,72);art.portraitsLarge[i]=buildPortrait(i,112);art.portraitsPilot[i]=buildPortrait(i,54);}
 document.querySelectorAll('#characters img').forEach((im,i)=>{if(art.portraitsSmall[i])im.src=art.portraitsSmall[i];});
 const minePlayer=state?.players?.find(p=>p.sid===bridge.sid);
 if(setupCharacter>=0&&art.portraitsLarge[setupCharacter])$('selectedPortrait').src=art.portraitsLarge[setupCharacter];
 if(minePlayer&&art.portraitsPilot[minePlayer.character])$('pilotImage').src=art.portraitsPilot[minePlayer.character];
}

for(let i=0;i<C.length;i++)art.characters.push(load(`assets/portrait-${i}.webp?v=13`));
fetch(`${ATLAS_META_PATH}?v=13`).then(r=>r.json()).then(meta=>{art.atlasMeta=meta;refreshPortraitAssets();}).catch(()=>{});
art.atlas=load(`${GAMEPLAY_ATLAS}?v=13`,()=>refreshPortraitAssets());
art.mapPreviewImages=MAP_ART.map((entry,i)=>load(`${entry.preview}?v=13`,()=>drawMapPreview(i)));
ensureMapArt(0);
fetch('assets/manifest.json?v=13').then(r=>r.json()).then(m=>{if(m.characters){art.characters=m.characters.map(load);refreshPortraitAssets();}}).catch(()=>{});
function send(type,data={}){if(embedded)parent.postMessage({type,gameId:'bloomshot',...data},location.origin);}
function publish(){if(!state||!bridge.isHost)return;state.seq++;state.hostTime=Date.now();lastSent=Date.now();publishedEvent=state.eventSeq;publishedPhase=state.phase;send('bs_state',{state});}
function toast(message){$('notice').textContent=message;noticeUntil=Date.now()+2300;}
async function ensureAudio(){
 try{
  audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
  if(!audioBuffer){audioLoad??=Promise.all([fetch('assets/bloomshot-sfx.ogg?v=13').then(r=>{if(!r.ok)throw new Error('audio');return r.arrayBuffer();}),fetch('assets/sfx-cues.json?v=13').then(r=>r.json())]).then(async([buf,map])=>{audioBuffer=await audio.decodeAudioData(buf);audioCues=map.cues||{};});await audioLoad;}
  return !!audioBuffer;
 }catch(_){return false;}
}
function playSfx(name,volume=.55,rate=1){if(!sound)return;ensureAudio().then(ok=>{if(!ok||!audioCues?.[name])return;const cue=audioCues[name],src=audio.createBufferSource(),gain=audio.createGain();src.buffer=audioBuffer;src.playbackRate.value=rate;gain.gain.value=volume;src.connect(gain).connect(audio.destination);src.start(0,cue.start,cue.duration);});}

function mine(){return state?.players.find(p=>p.sid===bridge.sid);}
function canAct(){return state?.phase==='aim'&&state.players[state.turn]?.sid===bridge.sid&&!state.players[state.turn]?.falling&&(!embedded||bridge.isHost||Date.now()-received<4000);}
function act(kind,extra={}){
 if(!state||pending)return;const c={kind,seq:++sequence,match:state.id,...extra};
 if(bridge.isHost){E.tick(state,Date.now());if(E.command(state,bridge.sid,c,Date.now(),bridge.hostSid)){publish();renderUI();}return;}
 pending={command:c,sent:Date.now(),created:Date.now()};send('bs_input',{input:c});
}
function adopt(incoming,hostTime){
 if(incoming?.version!==8){toast('새 게임 버전으로 방을 다시 시작하세요.');return;}
 if(state&&incoming.id===state.id&&incoming.seq<state.seq)return;
 state=incoming;received=Date.now();offset=(Number(hostTime)||Date.now())-Date.now();
 const p=mine();sequence=Math.max(sequence,p?.lastSeq||0);if(pending&&(p?.lastSeq>=pending.command.seq||pending.command.match!==state.id))pending=null;
}
window.addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==location.origin)return;const d=e.data||{};
 if(d.type==='bridge_init'&&d.gameId==='bloomshot'){
  bridge.sid=String(d.sessionId);bridge.hostSid=String(d.hostSessionId||d.players?.find(p=>p.isHost)?.sessionId||'');bridge.isHost=!!d.isHost;bridge.ready=true;roster=d.players||[];send('bs_sync');return;
 }
 if(!bridge.ready)return;
 if(d.type==='bridge_roster'&&d.gameId==='bloomshot'){roster=d.players||[];if(bridge.isHost&&state&&E.roster(state,roster,Date.now()))publish();}
 if(d.type==='bridge_host'){
  const before=bridge.isHost;bridge.hostSid=String(d.hostSessionId||'');bridge.isHost=!!d.isHost;
  if(!before&&bridge.isHost&&state){E.shiftClock(state,-offset);offset=0;E.roster(state,roster,Date.now());sequence=Math.max(sequence,mine()?.lastSeq||0);publish();}send('bs_sync');
 }
 if(d.type==='bs_sync'&&bridge.isHost&&state){publish();return;}
 if(d.type==='bs_input'&&bridge.isHost&&state){E.tick(state,Date.now());E.command(state,String(d.from),d.input,Date.now(),bridge.hostSid);publish();}
 if(d.type==='bs_state'){
  if(bridge.isHost){if(state)return;if(d.state){adopt(d.state,d.hostTime);if(!state)return;E.shiftClock(state,-offset);offset=0;E.roster(state,roster,Date.now());}
   else state=E.create(roster.length?roster:[{sessionId:bridge.sid,nick:'정령',seat:0}],Date.now()>>>0);publish();
  }else if(d.state)adopt(d.state,d.hostTime);
  renderUI();
 }
});
function choiceButtons(){
 C.forEach((c,i)=>{const b=document.createElement('button'),img=document.createElement('img'),n=document.createElement('span');img.src=art.portraitsSmall[i]||`assets/portrait-${i}.webp`;n.className='number';n.textContent=String(i+1).padStart(2,'0');b.append(n,img,document.createTextNode(c.name));b.onclick=()=>act('character',{value:i});$('characters').append(b);});
 MAPS.forEach((name,i)=>{const b=document.createElement('button');b.textContent=name;b.title=E.MAPS[i].hint;const preview=document.createElement('canvas');preview.width=160;preview.height=54;preview.setAttribute('aria-hidden','true');mapPreviews[i]=preview;drawMapPreview(i);b.prepend(preview);b.onclick=()=>{ensureMapArt(i);act('map',{value:i});};$('maps').append(b);});
 Object.entries(I).forEach(([key,item])=>{const b=document.createElement('button');b.className='item';b.dataset.item=key;b.style.setProperty('--item-color',item.color);b.title=item.desc;b.innerHTML=`<span class="icon">${ICONS[key]}</span><span class="item-name">${item.name}</span><span class="count">0</span>`;b.onclick=()=>{act('item',{item:key});$('itemHelp').textContent=item.desc;};b.onpointerenter=()=>$('itemHelp').textContent=item.desc;$('items').append(b);});
}
choiceButtons();
function selectionProfile(p){const c=E.spec(p);setupCharacter=p.character;$('selectedPortrait').src=art.portraitsLarge[p.character]||art.characters[p.character]?.src||`assets/portrait-${p.character}.webp`;$('selectedName').textContent=c.name;$('selectedTitle').textContent=c.title;
 const names=['방어력','이동력','일반탄','특수탄','발사각','사거리'],values=[Math.round(c.armor*100)+'%',c.move,c.damage,'고유 효과',c.angle.join('~')+'°',Math.round(c.speed*100)+'%'];
 $('stats').replaceChildren(...names.map((name,i)=>{const row=document.createElement('div');row.className='stat';const label=document.createElement('span');label.textContent=name;const bar=document.createElement('div');bar.className='bar';for(let j=0;j<6;j++){const segment=document.createElement('i');if(j<c.stats[i])segment.className='on';bar.append(segment);}const value=document.createElement('b');value.textContent=values[i];row.append(label,bar,value);return row;}));
 $('weaponOne').textContent=`일반 / ${c.weapon} — ${E.weaponDescription(p,'normal').details}`;$('weaponTwo').textContent=`특수 / ${c.weapon2} — ${E.weaponDescription(p,'special').details}`;
}
$('start').onclick=()=>act('start');$('pass').onclick=()=>act('pass');$('jump').onclick=()=>{camera.manual=false;act('jump');};
function beginMove(dir){if(!canAct())return;camera.manual=false;moveHeld=dir;lastMove=0;act('move',{value:dir});}
for(const [id,dir]of [['left',-1],['right',1]]){$(id).onpointerdown=e=>{e.preventDefault();$(id).setPointerCapture(e.pointerId);beginMove(dir);};$(id).onpointerup=$(id).onpointercancel=()=>moveHeld=0;}
function beginCharge(){if(!canAct()||pending)return;charge={at:Date.now(),initial:Number($('power').value)};camera.manual=false;}
function endCharge(cancel=false){if(!charge)return;charge=null;$('fire').classList.remove('charging');if(!cancel&&canAct())act('fire',{angle:Number($('angle').value),power:Number($('power').value),weapon});}
$('fire').onpointerdown=e=>{e.preventDefault();$('fire').setPointerCapture(e.pointerId);beginCharge();};$('fire').onpointerup=()=>endCharge();$('fire').onpointercancel=()=>endCharge(true);
const angleText=()=>Number($('angle').value).toFixed(1).replace(/\.0$/,'');
$('angle').oninput=()=>$('angleValue').textContent=angleText()+'°';$('power').oninput=()=>$('powerValue').textContent=$('power').value+'%';
const weaponTip=document.createElement('div');weaponTip.id='weaponTooltip';weaponTip.setAttribute('role','tooltip');weaponTip.hidden=true;document.body.append(weaponTip);
let tipTimer=0,tipDismiss=0,tipButton=null;
function hideWeaponTip(){clearTimeout(tipTimer);clearTimeout(tipDismiss);weaponTip.hidden=true;if(tipButton)tipButton.removeAttribute('aria-describedby');tipButton=null;}
function showWeaponTip(button){const p=mine();if(!p)return;const d=E.weaponDescription(p,button.dataset.weapon);hideWeaponTip();tipButton=button;const title=document.createElement('strong'),detail=document.createElement('p'),stats=document.createElement('p'),note=document.createElement('small');title.textContent=d.kind+' · '+d.name;detail.textContent=d.details;stats.textContent=d.stats;stats.className='tip-stats';note.textContent=d.compare;weaponTip.replaceChildren(title,detail,stats,note);weaponTip.hidden=false;button.setAttribute('aria-describedby','weaponTooltip');const r=button.getBoundingClientRect(),w=weaponTip.offsetWidth,h=weaponTip.offsetHeight;weaponTip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';weaponTip.style.top=Math.max(8,r.top-h-12)+'px';}
for(const b of document.querySelectorAll('[data-weapon]')){let held=false,origin=null;
 b.onclick=e=>{if(held){held=false;e.preventDefault();return;}hideWeaponTip();if(canAct()){weapon=b.dataset.weapon;renderUI();}};
 b.onpointerenter=e=>{if(e.pointerType==='mouse'){clearTimeout(tipTimer);tipTimer=setTimeout(()=>showWeaponTip(b),350);}};
 b.onpointerleave=e=>{if(e.pointerType==='mouse')hideWeaponTip();};
 b.onpointerdown=e=>{held=false;if(e.pointerType!=='mouse'){hideWeaponTip();origin={x:e.clientX,y:e.clientY};b.setPointerCapture(e.pointerId);tipTimer=setTimeout(()=>{held=true;showWeaponTip(b);},450);}};
 b.onpointermove=e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>12){clearTimeout(tipTimer);origin=null;}};
 b.onpointerup=e=>{if(e.pointerType!=='mouse'){clearTimeout(tipTimer);origin=null;if(held)tipDismiss=setTimeout(hideWeaponTip,4500);}};
 b.onpointercancel=()=>{origin=null;hideWeaponTip();};b.oncontextmenu=e=>e.preventDefault();b.onfocus=()=>{if(b.matches(':focus-visible')){clearTimeout(tipTimer);tipTimer=setTimeout(()=>showWeaponTip(b),350);}};b.onblur=hideWeaponTip;
}
window.addEventListener('keydown',e=>{if(e.code==='Escape')hideWeaponTip();});window.addEventListener('resize',hideWeaponTip);document.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-weapon]'))hideWeaponTip();});
$('sound').onclick=async()=>{sound=!sound;$('sound').textContent=sound?'소리 ON':'소리 OFF';if(sound){startBgm();await ensureAudio();playSfx('ui_on',.32);}syncBgm();};
$('exit').onclick=()=>{if(embedded)send('bs_quit');else location.href='../../index.html';};
$('focus').onclick=()=>{const p=mine()||state?.players[state.turn];if(p){camera.manual=false;camera.x=p.x-camera.w/2;}};
$('supplyView').onclick=()=>{const d=state?.drops.find(d=>d.status==='chute'||d.status==='fall')||state?.drops.at(-1);if(d){camera.manual=true;camera.x=d.x-camera.w/2;camera.y=-80;toast(`${I[d.item].name} 보급품 위치`);}};
$('again').onclick=()=>{state=E.create([{sessionId:'local',nick:'나',seat:0}],Date.now()>>>0);reported=false;lastEvent=0;setupCharacter=-1;lastTurn=-1;renderUI();};
window.addEventListener('keydown',e=>{
 if(e.target.tagName==='INPUT'&&e.target.type!=='range')return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
 if(e.code==='ArrowLeft'&&!e.repeat)beginMove(-1);if(e.code==='ArrowRight'&&!e.repeat)beginMove(1);
 if(e.code==='ArrowUp'||e.code==='ArrowDown'){aimHeld=e.code==='ArrowUp'?1:-1;if(!e.repeat&&canAct()){$('angle').value=Number($('angle').value)+aimHeld*.4;$('angle').oninput();}}
 if(e.code==='KeyA'||e.code==='KeyD')powerHeld=e.code==='KeyD'?1:-1;
 if(e.code==='KeyJ'&&!e.repeat){camera.manual=false;act('jump');}if(e.code==='Space'&&!e.repeat)beginCharge();
 if(e.code==='KeyQ')panHeld=-1;if(e.code==='KeyE')panHeld=1;
 if(!e.repeat&&['Digit1','Digit2','Digit3'].includes(e.code))act('item',{item:['double','power','heal'][Number(e.code.slice(-1))-1]});
});
window.addEventListener('keyup',e=>{if(e.code==='ArrowUp'||e.code==='ArrowDown')aimHeld=0;if(e.code==='KeyA'||e.code==='KeyD')powerHeld=0;if(e.code==='ArrowLeft'||e.code==='ArrowRight')moveHeld=0;if(e.code==='Space')endCharge();if(e.code==='KeyQ'||e.code==='KeyE')panHeld=0;});
window.addEventListener('blur',()=>{moveHeld=0;panHeld=0;aimHeld=0;powerHeld=0;endCharge(true);});
let drag=null;canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,cam:camera.x};camera.manual=true;};canvas.onpointermove=e=>{if(drag)camera.x=drag.cam-(e.clientX-drag.x)*camera.w/canvas.clientWidth;};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
function minimapMove(e){const rect=mini.getBoundingClientRect();camera.manual=true;camera.x=(e.clientX-rect.left)/rect.width*E.W-camera.w/2;}
mini.onpointerdown=e=>{mini.setPointerCapture(e.pointerId);minimapMove(e);};mini.onpointermove=e=>{if(e.buttons)minimapMove(e);};
function renderUI(){
 if(!state)return;ensureMapArt(state.map);const p=mine(),active=state.players[state.turn],now=Date.now()+offset,can=canAct(),c=p?E.spec(p):C[0];
 $('setup').hidden=state.phase!=='setup';$('result').hidden=state.phase!=='over';
 $('start').disabled=!bridge.isHost||!state;$('start').textContent=bridge.isHost?'READY TO BATTLE ▶':'방장의 시작을 기다리는 중';
 $('setupHint').textContent=state.players.some(p=>p.cpu)?'1인 CPU 연습 · 쉬움 · 정령과 전장을 고른 뒤 출발하세요.':`${state.players.length}명 온라인 대전 · 캐릭터를 고른 뒤 방장이 시작합니다.`;
 if(p&&setupCharacter!==p.character){setupCharacter=p.character;selectionProfile(p);$('angle').min=c.angle[0];$('angle').max=c.angle[1];$('angle').value=Math.max(c.angle[0],Math.min(c.angle[1],Number($('angle').value)));}
 [...$('characters').children].forEach((b,i)=>{b.classList.toggle('selected',p?.character===i);b.disabled=state.phase!=='setup';});[...$('maps').children].forEach((b,i)=>{b.classList.toggle('selected',state.map===i);b.disabled=!bridge.isHost;});
 $('status').textContent=!embedded?'CPU · 쉬움':bridge.isHost?'ONLINE · HOST':Date.now()-received>4000?'재연결 대기':'ONLINE · CONNECTED';
 $('turnBadge').textContent=state.phase==='setup'?'READY ROOM':state.phase==='over'?'BATTLE COMPLETE':state.phase==='flight'?`${active.nick} · 탄 추적 중`:state.phase==='jump'?`${active.nick} · 점프`:`${state.round}R  ${active.nick}  ${Math.max(0,Math.ceil((state.deadline-now)/1000))}초`;
 $('wind').textContent=`${state.wind<0?'◀':'▶'} ${String(Math.abs(state.wind)).padStart(2,'0')}`;$('windMeter').style.transform=`scaleX(${Math.max(.06,Math.abs(state.wind)/50)})`;
 $('supplyView').textContent=`♧ 보급 ${Math.max(0,Math.ceil((state.nextDropAt-now)/1000))}초`;
 $('cameraMode').textContent=camera.manual?'자유 시점 · 내 캐릭터로 복귀 가능':'자동 추적';
 $('pilotImage').src=art.portraitsPilot[p?.character||0]||art.characters[p?.character||0]?.src||'';$('pilotName').textContent=p?`${c.name} · ${p.nick}`:'관전 중';$('pilotHP').textContent=`HP ${Math.ceil(p?.hp||0)} / ${p?.maxHp||100}${p?.shield?' + 보호막':''}`;
 $('hpFill').style.width=`${p?p.hp/p.maxHp*100:0}%`;$('fuelFill').style.width=`${p?p.fuel/p.maxFuel*100:0}%`;$('fuel').textContent=`${Math.round(p?.fuel||0)} / ${p?.maxFuel||100}`;
 for(const id of ['left','right','jump','angle','power','fire','pass'])$(id).disabled=!can;
 $('jump').disabled=!can||p.fuel+1e-6<p.maxFuel*.3;
 document.querySelectorAll('[data-weapon]').forEach(b=>{b.disabled=false;b.setAttribute('aria-disabled',String(!can));b.classList.toggle('selected',b.dataset.weapon===weapon);b.textContent=b.dataset.weapon==='normal'?c.weapon:c.weapon2;b.setAttribute('aria-label',b.textContent+' · 길게 눌러 설명');b.removeAttribute('title');});
 document.querySelectorAll('[data-item]').forEach(b=>{const key=b.dataset.item;b.querySelector('.count').textContent='×'+(p?.items[key]||0);b.disabled=!can||!p?.items[key]||(key==='heal'&&p.hp>=p.maxHp);b.classList.toggle('selected',p?.boost===key);});
 $('boostLabel').textContent=p?.boost?`${I[p.boost].name} 준비 · 다음 발사에 적용`:'발사 강화는 하나씩 선택';
 $('roster').replaceChildren(...state.players.map((q,i)=>{const el=document.createElement('div');el.className='player'+(state.turn===i?' active':'')+(q.hp<=0?' dead':'');el.style.setProperty('--color',COLORS[i]);const n=document.createElement('b');n.textContent=`${q.sid===bridge.sid?'나 · ':''}${q.nick}`;const hp=document.createElement('span');hp.textContent=q.hp>0?`${Math.ceil(q.hp)} HP`:'OUT';el.append(n,hp);return el;}));
 if(state.phase==='over'){$('winner').textContent=state.winner?`${state.players.find(p=>p.sid===state.winner)?.nick} 승리!`:'무승부';$('resultHint').textContent=embedded?'잠시 후 같은 방 대기실로 돌아갑니다.':'다른 정령과 전장으로 다시 도전하세요.';$('again').hidden=embedded;}
 $('angle').oninput();$('power').oninput();
}
function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}camera.h=820;camera.w=820*rect.width/rect.height;}
function text(t,x,y,size=14,color='#fff',align='center'){ctx.font=`900 ${size}px system-ui`;ctx.textAlign=align;ctx.lineWidth=4;ctx.strokeStyle='#19243ccc';ctx.strokeText(t,x,y);ctx.fillStyle=color;ctx.fillText(t,x,y);}
let windTravel=0,windAt=0;
function backdrop(now){
 const m=E.MAPS[state.map],sky=ctx.createLinearGradient(0,0,0,camera.h);sky.addColorStop(0,m.sky[0]);sky.addColorStop(1,m.sky[1]);ctx.fillStyle=sky;ctx.fillRect(0,0,camera.w,camera.h);
 const bg=art.mapBackdrops[state.map];if(bg?.complete&&bg.naturalWidth){ctx.save();drawCover(ctx,bg,camera.w,camera.h,.94);ctx.restore();}
 // pixel sun/moon and horizon accents
 ctx.save();
 const sunX=camera.w*.78-camera.x*.025,sunY=110,sunR=state.map===4?66:44;
 ctx.fillStyle=state.map===4?'#ffe0a066':'#f9f3d444';ctx.beginPath();ctx.arc(sunX,sunY,sunR,0,7);ctx.fill();
 ctx.globalAlpha=.08;ctx.fillStyle='#ffffff';for(let gy=0;gy<camera.h;gy+=5)ctx.fillRect(0,gy,camera.w,1);ctx.globalAlpha=1;
 // distant silhouettes
 for(let layer=0;layer<3;layer++){const parallax=.08+layer*.12;ctx.fillStyle=['#142c3444','#17273b55','#19263777'][layer];
  for(let i=-2;i<12;i++){const x=i*410-((camera.x*parallax)%410),base=580+layer*55;
   if(state.map===0||state.map===1){ctx.beginPath();ctx.ellipse(x+110,base-210,120-layer*8,24+layer*4,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(x+108,base-194,78-layer*5,18+layer*2,0,0,7);ctx.fill();ctx.fillRect(x+92,base-194,26+layer*5,92);ctx.beginPath();ctx.ellipse(x+100,base-112,16+layer*2,7+layer,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(x+135,base-88,10+layer,5+layer*.7,0,0,7);ctx.fill();}
   else if(state.map===2){ctx.beginPath();ctx.moveTo(x-110,base);ctx.lineTo(x+90,140+(i%3)*75);ctx.lineTo(x+270,base);ctx.closePath();ctx.fill();}
   else if(state.map===3){ctx.fillRect(x+60,230,12,510);ctx.fillRect(x+220,350,12,400);ctx.save();ctx.translate(x+65,250);ctx.rotate(.48);ctx.fillRect(0,0,9,460);ctx.restore();ctx.fillRect(x,390,320,12);}
   else{ctx.fillRect(x+35,260,110,460);for(let j=0;j<4;j++){ctx.fillRect(x+10,270+j*95,160,18);}ctx.fillStyle='#efc88222';for(let j=0;j<12;j++)ctx.fillRect(x+50+(j%3)*28,300+Math.floor(j/3)*70,10,18);ctx.fillStyle=['#142c3444','#17273b55','#19263777'][layer];}
  }
 }
 // map-specific pixel clouds / spark blocks
 ctx.globalAlpha=.16;ctx.fillStyle='#ffffff';
 for(let i=0;i<10;i++){const cx=((i*173-camera.x*.06)% (camera.w+120))+20,cy=70+(i%4)*42+Math.sin(now/900+i)*7;
  if(state.map===2||state.map===4){for(let sx=0;sx<5;sx++)for(let sy=0;sy<3;sy++)if((sx+sy)%2===0)ctx.fillRect(cx+sx*10,cy+sy*8,8,6);}
  else if(state.map!==3){ctx.fillRect(cx,cy,42,8);ctx.fillRect(cx+8,cy-8,20,8);ctx.fillRect(cx+12,cy+8,16,8);}
 }
 ctx.globalAlpha=1;
 ctx.restore();
 const dt=windAt?Math.min(100,Math.max(0,now-windAt)):0;windAt=now;windTravel+=(state.wind||0)*dt*.0018;
 const windDir=state.wind<0?-1:1,windStrength=Math.min(1,Math.abs(state.wind)/50),windParticleCount=14+Math.round(windStrength*8),windArrowCount=3+(windStrength>.35?1:0)+(windStrength>.72?1:0);
 for(let i=0;i<windParticleCount;i++){const span=camera.w+100,x=((i*167+windTravel-camera.x*.18)%span+span)%span-50,y=70+(i*(camera.h-220)/Math.max(1,windParticleCount-1))+Math.sin(now/1300+i)*7;
  ctx.save();ctx.translate(x,y);ctx.rotate((Math.sin(now/1700+i)*.28)+(windDir<0?Math.PI:0));ctx.fillStyle=['#d5e89b','#ffc3d2','#f0fbff','#e3d4c3','#ffe3a3'][state.map];ctx.globalAlpha=.26+(i%3)*.08+.12*windStrength;
  if(m.particle==='leaf'){ctx.beginPath();ctx.ellipse(0,0,10,4,0,0,7);ctx.fill();ctx.strokeStyle='#829c5a';ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.stroke();}
  else if(m.particle==='petal'){ctx.beginPath();ctx.ellipse(0,0,5,9,.5,0,7);ctx.fill();ctx.fillRect(-11,-1,6,2);ctx.fillRect(5,-1,6,2);}
  else if(m.particle==='snow'){ctx.fillRect(-5,-1,10,2);ctx.fillRect(-1,-5,2,10);ctx.fillRect(-4,-4,8,1);ctx.fillRect(-4,3,8,1);}
  else if(m.particle==='paper'){ctx.fillRect(-5,-6,10,12);ctx.fillStyle='#b8847055';ctx.fillRect(-3,-3,6,2);ctx.fillStyle='#f6d9c2';ctx.fillRect(8,-1,12,2);}
  else{ctx.fillRect(-2,-2,4,4);ctx.globalAlpha*=.55;ctx.fillRect(8,-1,12,2);}
  ctx.restore();
 }
 // wind direction overlay arrows
 ctx.save();ctx.globalAlpha=.12+.08*windStrength;ctx.fillStyle='#ffffff';
 for(let i=0;i<windArrowCount;i++){const wx=120+i*(camera.w-240)/Math.max(1,windArrowCount-1)+((windTravel*1.3)%38),wy=96+(i%2)*145;ctx.save();ctx.translate(wx,wy);ctx.scale(windDir,1);ctx.beginPath();ctx.moveTo(-18,-4);ctx.lineTo(4,-4);ctx.lineTo(4,-10);ctx.lineTo(18,0);ctx.lineTo(4,10);ctx.lineTo(4,4);ctx.lineTo(-18,4);ctx.closePath();ctx.fill();ctx.restore();}
 ctx.restore();
}
function terrain(){
 const m=E.MAPS[state.map],from=Math.max(0,Math.floor(camera.x/E.STEP)-1),to=Math.min(state.solids.length-1,Math.ceil((camera.x+camera.w)/E.STEP)+1),fg=art.mapForegrounds[state.map];
 if(fg?.complete&&fg.naturalWidth){ctx.save();ctx.beginPath();for(let i=from;i<=to;i++){const c=state.solids[i],x=i*E.STEP;for(let j=0;j<c.length;j+=2){const top=c[j],bottom=c[j+1];ctx.rect(x,top,E.STEP+1,bottom-top);}}ctx.clip();ctx.fillStyle=m.rock;ctx.fillRect(0,0,E.W,E.H);ctx.imageSmoothingEnabled=false;ctx.drawImage(fg,0,0,E.W,E.H);ctx.restore();
  ctx.save();for(let i=from;i<=to;i++){const c=state.solids[i],x=i*E.STEP;for(let j=0;j<c.length;j+=2){const top=c[j],bottom=c[j+1];ctx.fillStyle='#ffffff14';ctx.fillRect(x,top,E.STEP+1,Math.min(state.map===2?10:6,bottom-top));ctx.fillStyle='#0b122033';ctx.fillRect(x,bottom-7,E.STEP+1,7);}}ctx.restore();return;}
 for(let i=from;i<=to;i++){const c=state.solids[i],x=i*E.STEP;for(let j=0;j<c.length;j+=2){const top=c[j],bottom=c[j+1];ctx.fillStyle=m.rock;ctx.fillRect(x,top,E.STEP+1,bottom-top);ctx.fillStyle='#111b3540';ctx.fillRect(x,bottom-9,E.STEP+1,9);ctx.fillStyle=m.edge;ctx.fillRect(x,top,E.STEP+1,Math.min(state.map===2?10:5,bottom-top));
   if(i%8===0){ctx.fillStyle='#ffffff18';for(let y=top+17;y<bottom-10;y+=22)ctx.fillRect(x,y,Math.min(12,E.STEP),3);}
   if((state.map===0||state.map===1)&&i%11===0){ctx.fillStyle=m.edge;ctx.fillRect(x,top-5,3,6);}
   if(state.map===0&&i%19===0){ctx.fillStyle='#6a995f';ctx.fillRect(x,bottom-3,3,15+(i%7)*3);ctx.fillRect(x-4,bottom+4,6,3);}
   if(state.map===2&&i%17===0){ctx.fillStyle='#b1e7f1';ctx.beginPath();ctx.moveTo(x,bottom);ctx.lineTo(x+7,bottom);ctx.lineTo(x+3,bottom+14);ctx.fill();}
   if(state.map===3&&i%9===0){ctx.fillStyle='#e6b694';ctx.fillRect(x,top+10,3,3);}
 }}
}
function recentEventAge(type,sid,now){for(let i=state.events.length-1;i>=0;i--){const e=state.events[i];if(e.type===type&&(!sid||e.sid===sid))return now-e.at;}return 1e9;}
function spriteFrame(p,v,now,moving){
 const hp=p.maxHp?p.hp/p.maxHp:1,launchAge=recentEventAge('launch',p.sid,now),landAge=recentEventAge('land',p.sid,now);
 const idle=Math.floor(now/220)%4,walk=Math.floor(now/120)%2;
 const tryingMove=state.players[state.turn]===p&&state.phase==='aim'&&p.sid===bridge.sid&&!!moveHeld;
 const blocked=tryingMove&&!moving&&Math.abs((v.lastRealX??p.x)-p.x)<0.2;
 if(launchAge<220)return {row:1,col:3};
 if(p.falling||state.jump?.sid===p.sid)return {row:2,col:0};
 if(landAge<260)return {row:2,col:1};
 if(blocked)return {row:1,col:2};
 if(hp<=.1)return {row:2,col:3};
 if(hp<=.5)return {row:2,col:2};
 if(moving)return {row:1,col:walk};
 return {row:0,col:idle};
}
function drawSpriteFrame(index,row,col,dx,dy,dw,dh){
 const rect=atlasCharRect(index),trim=atlasFrameTrim(index,row,col);if(!rect||!trim||!art.atlas?.complete||!art.atlas.naturalWidth)return false;
 const cw=art.atlasMeta.frameW||rect.w/4,ch=art.atlasMeta.frameH||rect.h/4;
 const scale=Math.min(dw/cw,dh/ch),outW=trim.w*scale,outH=trim.h*scale;
 const outX=dx+(dw-outW)/2,outY=dy+dh-outH;
 const sx=rect.x+col*cw+trim.x,sy=rect.y+row*ch+trim.y;
 ctx.drawImage(art.atlas,sx,sy,trim.w,trim.h,outX,outY,outW,outH);
 return true;
}
function drawTurnArrow(x,y,now,color='#fff2b1'){
 const bob=Math.sin(now/160)*4;ctx.save();ctx.translate(x,y-128+bob);ctx.lineJoin='round';ctx.lineWidth=4;ctx.fillStyle=color;ctx.strokeStyle='#3f3321';
 ctx.beginPath();ctx.moveTo(-14,-22);ctx.lineTo(14,-22);ctx.lineTo(14,-6);ctx.lineTo(24,-6);ctx.lineTo(0,24);ctx.lineTo(-24,-6);ctx.lineTo(-14,-6);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#ffcc55';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(8,-10);ctx.lineTo(4,-10);ctx.lineTo(4,-18);ctx.lineTo(-4,-18);ctx.lineTo(-4,-10);ctx.lineTo(-8,-10);ctx.closePath();ctx.fill();ctx.restore();
}
function burstParticles(style,e,age,now){
 const f=age/900,count=e.weapon==='special'?18:12,seed=(e.id||1)*97+(e.character||0)*31;
 for(let i=0;i<count;i++){const t=Math.max(0,Math.min(1,f*1.35-(i/count)*.15));if(t<=0)continue;const ang=(i/count)*Math.PI*2+((seed+i*13)%17)*.08,spd=(38+(i%5)*15)*(1.1-t*.25),px=e.x+Math.cos(ang)*spd*t,py=e.y+Math.sin(ang)*spd*t-(style.trail==='flame'?28*t*t:10*t*t);ctx.save();ctx.translate(px,py);ctx.rotate(ang+t*2.4);ctx.globalAlpha=(1-t)*.9;
  if(style.trail==='leaf'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.ellipse(0,0,7,3.2,0,0,7);ctx.fill();ctx.strokeStyle=style.outer;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.stroke();}
  else if(style.trail==='ribbon'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.ellipse(0,0,4.2,8.5,.3,0,7);ctx.fill();}
  else if(style.trail==='mist'){ctx.fillStyle=i%2?style.outer:style.inner;ctx.beginPath();ctx.arc(0,0,5.5+(i%3)*1.4,0,7);ctx.fill();}
  else if(style.trail==='streak'){ctx.fillStyle=i%2?style.outer:style.spark;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-3);ctx.lineTo(-8,0);ctx.lineTo(-5,3);ctx.closePath();ctx.fill();}
  else if(style.trail==='shard'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(0,-6);ctx.lineTo(-5,0);ctx.lineTo(0,6);ctx.closePath();ctx.fill();}
  else if(style.trail==='flame'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.moveTo(0,-8);ctx.quadraticCurveTo(7,-2,0,8);ctx.quadraticCurveTo(-6,-1,0,-8);ctx.fill();}
  else if(style.trail==='frost'){ctx.strokeStyle=i%2?style.inner:style.spark;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.moveTo(0,-5);ctx.lineTo(0,5);ctx.stroke();}
  else {ctx.strokeStyle=style.spark;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(-1,-2);ctx.lineTo(1,2);ctx.lineTo(5,0);ctx.stroke();}
 ctx.restore();
 }
}

function drawDrop(d,now){
 const color=I[d.item].color;let y=d.y,x=d.x;
 if(!bridge.isHost&&d.status==='chute'){const elapsed=Math.min(400,Math.max(0,now-state.simAt));x+=state.wind*.065*elapsed/1000;y+=((E.ground(state,x)+46)/25000)*elapsed;}
 ctx.save();ctx.translate(x,y);
 const glow=10+Math.sin(now/180+d.id)*3;ctx.globalAlpha=.45;ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,d.status==='chute'?-5:-12,glow,0,7);ctx.fill();ctx.globalAlpha=1;
 const airRect=atlasPartRect('supplyAir'),groundRect=atlasPartRect('supplyGround');
 if(d.status==='chute'&&airRect&&art.atlas?.complete){ctx.imageSmoothingEnabled=false;ctx.drawImage(art.atlas,airRect.x,airRect.y,airRect.w,airRect.h,-48,-109,96,120);ctx.fillStyle='#10202ddd';ctx.beginPath();ctx.arc(0,-8,11,0,7);ctx.fill();text(ICONS[d.item],0,-3,15,color);}
 else if(d.status==='ground'&&groundRect&&art.atlas?.complete){ctx.imageSmoothingEnabled=false;ctx.drawImage(art.atlas,groundRect.x,groundRect.y,groundRect.w,groundRect.h,-24,-34,48,40);ctx.fillStyle='#10202ddd';ctx.beginPath();ctx.arc(0,-15,10,0,7);ctx.fill();text(ICONS[d.item],0,-10,14,color);}
 else {if(d.status==='chute'){const sway=Math.sin(now/900+d.id)*4;ctx.translate(sway,0);ctx.strokeStyle='#f5efd8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-32,-53);ctx.lineTo(-9,-9);ctx.moveTo(32,-53);ctx.lineTo(9,-9);ctx.moveTo(0,-75);ctx.lineTo(0,-9);ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,-52,35,Math.PI,Math.PI*2);ctx.lineTo(35,-49);ctx.quadraticCurveTo(18,-58,0,-49);ctx.quadraticCurveTo(-18,-58,-35,-49);ctx.closePath();ctx.fill();ctx.strokeStyle='#fff5ca';ctx.stroke();}ctx.fillStyle='#243148';ctx.fillRect(-17,-17,34,30);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(-17,-17,34,30);text(ICONS[d.item],0,6,22,color);}
 ctx.restore();if(d.status==='ground')text(I[d.item].name,x,y-43,11,color);
}
function drawPlayer(p,i,now){
 if(p.hp<=0)return;
 let v=visualPlayers.get(p.sid);
 if(!v){v={x:p.x,y:p.y,tilt:0,lastRealX:p.x,lastRealY:p.y};visualPlayers.set(p.sid,v);}
 const moving=Math.abs(v.x-p.x)>1||Math.abs(v.y-p.y)>1;
 v.x+=(p.x-v.x)*.33;v.y+=(p.y-v.y)*.35;v.lastRealX=p.x;v.lastRealY=p.y;
 const grounded=!p.falling&&state.jump?.sid!==p.sid,targetTilt=grounded?E.surfaceAngle(state,p.x,p.y):0;v.tilt+=(targetTilt-v.tilt)*(moving?.34:.22);
 const x=v.x,y=v.y,tilt=v.tilt,c=E.spec(p),frame=spriteFrame(p,v,now,moving);
 if(x<camera.x-100||x>camera.x+camera.w+100)return;
 ctx.save();ctx.translate(x,y+5);ctx.rotate(tilt);ctx.fillStyle='#17233738';ctx.beginPath();ctx.ellipse(0,0,28,6,0,0,7);ctx.fill();ctx.restore();
 ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.scale(p.face,1);ctx.imageSmoothingEnabled=false;
 if(!drawSpriteFrame(p.character,frame.row,frame.col,-72,-112,144,112)){const im=art.characters[p.character];if(im?.complete&&im.naturalWidth)ctx.drawImage(im,-46,-86,92,92);else{ctx.fillStyle=c.color;ctx.fillRect(-25,-60,50,60);}}
 ctx.restore();
 if(p.shield>0){ctx.strokeStyle='#b2baff99';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-38,42,52,tilt,0,7);ctx.stroke();}
 if(p.poison?.turns>0)text(`독 ${p.poison.turns}`,x-43,y-48,12,'#c3e98c');
 if(p.frozen>0)text('❄',x+36,y-42,22,'#9becff');
 text(p.nick,x,y-98,14,COLORS[i]);
 ctx.fillStyle='#17243b';ctx.fillRect(x-33,y+13,66,8);ctx.fillStyle=COLORS[i];ctx.fillRect(x-32,y+14,64*p.hp/p.maxHp,6);text(Math.ceil(p.hp)+'',x,y+38,12,'#fff3bc');
 if(state.players[state.turn]===p&&state.phase==='aim')drawTurnArrow(x,y,now);
}
function pathStroke(points,color,width,alpha=1,dash=[]){if(points.length<2)return;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(dash);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.restore();}
function drawStar(x,y,r1,r2,n=5){ctx.beginPath();for(let i=0;i<n*2;i++){const a=-Math.PI/2+i*Math.PI/n,r=i%2?r2:r1,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function drawProjectile(pr,now){
 const dt=Math.min(.08,Math.max(0,(now-state.simAt)/1000)),x=pr.x+pr.vx*dt+state.wind*dt*dt*.5,y=pr.y+pr.vy*dt+165*dt*dt,style=SHOT_VISUALS[pr.character]||SHOT_VISUALS[0],special=pr.weapon==='special',pts=[...pr.trail,[x,y]],pulse=1+.12*Math.sin(now/70+pr.character),heading=Math.atan2(pr.vy,pr.vx);
 ctx.save();ctx.globalCompositeOperation='lighter';
 if(style.trail==='leaf'){pathStroke(pts,style.outer,special?7:5,.42);for(let i=1;i<pts.length;i+=3){const p=pts[i],a=i*.9;ctx.fillStyle=i%2?style.inner:style.spark;ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(p[0]+Math.cos(a)*4,p[1]+Math.sin(a)*4,3,1.4,a,0,7);ctx.fill();}}
 if(style.trail==='ribbon'){pathStroke(pts,style.outer,special?8:6,.32);const top=pts.map((p,i)=>[p[0],p[1]+Math.sin(i*.9+now*.012)*3]);pathStroke(top,style.inner,2.4,.75);for(let i=2;i<pts.length;i+=4){ctx.fillStyle=style.spark;ctx.globalAlpha=.48;ctx.beginPath();ctx.ellipse(pts[i][0],pts[i][1],2.8,1.4,i*.6,0,7);ctx.fill();}}
 if(style.trail==='mist'){for(let i=1;i<pts.length;i+=2){const p=pts[i],f=i/pts.length;ctx.fillStyle=i%4?style.outer:style.inner;ctx.globalAlpha=.08+.28*f;ctx.beginPath();ctx.arc(p[0]+Math.sin(i*2.3)*4,p[1]+Math.cos(i*1.7)*4,(special?8:6)*(0.5+f*.6),0,7);ctx.fill();}}
 if(style.trail==='streak'){pathStroke(pts,style.outer,special?6:4,.32);pathStroke(pts,style.spark,special?2.2:1.4,.9);}
 if(style.trail==='shard'){pathStroke(pts,style.outer,special?7:5,.34);pathStroke(pts,style.inner,2,.7);for(let i=2;i<pts.length;i+=4){const p=pts[i];ctx.fillStyle=style.spark;ctx.globalAlpha=.58;ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(i);ctx.fillRect(-2,-2,4,4);ctx.restore();}}
 if(style.trail==='flame'){pathStroke(pts,'#9c342b',special?13:9,.25);pathStroke(pts,style.outer,special?8:6,.5);pathStroke(pts,style.spark,2.2,.82);for(let i=3;i<pts.length;i+=4){const p=pts[i];ctx.fillStyle=style.inner;ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(p[0]+Math.sin(i)*5,p[1]+Math.cos(i)*4,2.5,0,7);ctx.fill();}}
 if(style.trail==='frost'){pathStroke(pts,style.outer,special?8:5,.27);pathStroke(pts,style.inner,2.2,.75);for(let i=3;i<pts.length;i+=4){const p=pts[i];ctx.strokeStyle=style.spark;ctx.globalAlpha=.55;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(p[0]-4,p[1]);ctx.lineTo(p[0]+4,p[1]);ctx.moveTo(p[0],p[1]-4);ctx.lineTo(p[0],p[1]+4);ctx.stroke();}}
 if(style.trail==='electric'){const zig=pts.map((p,i)=>[p[0]+Math.sin(i*7.7+pr.age*25)*(i%2?4:-3),p[1]+Math.cos(i*5.1+pr.age*18)*(i%2?3:-4)]);pathStroke(zig,style.outer,special?7:5,.3);pathStroke(zig,style.spark,1.8,.88);}
 ctx.restore();
 ctx.save();ctx.translate(x,y);ctx.rotate(heading);ctx.globalCompositeOperation='source-over';if(special){ctx.strokeStyle=style.spark;ctx.globalAlpha=.38;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,(pr.drawRadius+6)*pulse,0,7);ctx.stroke();ctx.globalAlpha=1;}
 const r=(pr.drawRadius||7)*(special?1.12:1);
 if(style.shape==='seed'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.ellipse(0,0,r*1.18,r*.72,0,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.ellipse(-1,-1,r*.7,r*.4,0,0,7);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.ellipse(-r*.5,-r*.75,r*.42,r*.22,-.55,0,7);ctx.fill();}
 if(style.shape==='petal'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.ellipse(0,-r*.25,r*1.15,r*.58,.18,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.ellipse(0,r*.28,r*1.05,r*.52,-.18,0,7);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(r*.35,0,1.7,0,7);ctx.fill();}
 if(style.shape==='spore'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.arc(-r*.2,-r*.2,r*.68,0,7);ctx.fill();for(let i=0;i<3;i++){const a=now*.004+i*2.1;ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(Math.cos(a)*r*1.25,Math.sin(a)*r*.85,1.6,0,7);ctx.fill();}}
 if(style.shape==='dart'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.moveTo(r*1.45,0);ctx.lineTo(-r*.55,-r*.65);ctx.lineTo(-r*.9,0);ctx.lineTo(-r*.55,r*.65);ctx.closePath();ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.arc(-r*.2,0,r*.55,0,7);ctx.fill();}
 if(style.shape==='crystal'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.moveTo(r*1.2,0);ctx.lineTo(r*.35,-r);ctx.lineTo(-r*.75,-r*.55);ctx.lineTo(-r,0);ctx.lineTo(-r*.55,r*.8);ctx.lineTo(r*.45,r*.65);ctx.closePath();ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.moveTo(r*.75,0);ctx.lineTo(r*.12,-r*.55);ctx.lineTo(-r*.4,0);ctx.lineTo(r*.1,r*.45);ctx.closePath();ctx.fill();}
 if(style.shape==='ember'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.arc(r*.12,-r*.12,r*.68,0,7);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(r*.35,-r*.35,r*.24,0,7);ctx.fill();}
 if(style.shape==='ice'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(r*.4,-r*.85);ctx.lineTo(-r*.45,-r*.8);ctx.lineTo(-r,0);ctx.lineTo(-r*.35,r*.78);ctx.lineTo(r*.45,r*.72);ctx.closePath();ctx.fill();ctx.strokeStyle=style.spark;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-r*.65,0);ctx.lineTo(r*.65,0);ctx.moveTo(0,-r*.65);ctx.lineTo(0,r*.65);ctx.stroke();}
 if(style.shape==='star'){ctx.fillStyle=style.outer;drawStar(0,0,r*1.15,r*.5,5);ctx.fill();ctx.fillStyle=style.inner;drawStar(0,0,r*.78,r*.32,5);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(0,0,1.8,0,7);ctx.fill();}
 ctx.restore();if(y<camera.y+12)text(`▲ ${Math.round(camera.y-y)}m`,Math.max(camera.x+60,Math.min(camera.x+camera.w-60,x)),camera.y+60,17,'#fff1ac');
}
function drawBlast(e,age,now){const f=age/900;if(f>1)return;const style=SHOT_VISUALS[e.character]||SHOT_VISUALS[0],special=e.weapon==='special',r=e.radius*(.22+f*.82);ctx.save();ctx.globalAlpha=1-f;ctx.globalCompositeOperation='lighter';burstParticles(style,e,age,now);
 if(e.character===0){ctx.strokeStyle=style.inner;ctx.lineWidth=7;ctx.beginPath();ctx.arc(e.x,e.y,r,0,7);ctx.stroke();for(let j=0;j<15;j++){const a=j*2.399;ctx.fillStyle=j%2?style.inner:style.spark;ctx.beginPath();ctx.ellipse(e.x+Math.cos(a)*r*1.2,e.y+Math.sin(a)*r*.8-f*20,5,2,a,0,7);ctx.fill();}}
 else if(e.character===1){ctx.strokeStyle=style.inner;ctx.lineWidth=5;ctx.beginPath();ctx.arc(e.x,e.y,r*.85,0,7);ctx.stroke();for(let j=0;j<18;j++){const a=j*.83;ctx.fillStyle=j%2?style.outer:style.spark;ctx.beginPath();ctx.ellipse(e.x+Math.cos(a)*r*1.4,e.y+Math.sin(a)*r,6,2.6,a,0,7);ctx.fill();}}
 else if(e.character===2){for(let j=0;j<14;j++){const a=j*2.1,rr=r*(.3+(j%5)/5);ctx.fillStyle=j%2?style.outer:style.inner;ctx.globalAlpha=(1-f)*.45;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*rr,e.y+Math.sin(a)*rr*.7,10+f*9,0,7);ctx.fill();}}
 else if(e.character===3){ctx.strokeStyle=style.spark;ctx.lineWidth=3;for(let j=0;j<14;j++){const a=j*Math.PI/7;ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*r*.25,e.y+Math.sin(a)*r*.25);ctx.lineTo(e.x+Math.cos(a)*r*1.6,e.y+Math.sin(a)*r*1.2);ctx.stroke();}}
 else if(e.character===4){for(let j=0;j<16;j++){const a=j*1.7;ctx.fillStyle=j%2?style.inner:style.spark;ctx.save();ctx.translate(e.x+Math.cos(a)*r*1.25,e.y+Math.sin(a)*r*.9);ctx.rotate(a+f);ctx.fillRect(-5,-5,10,10);ctx.restore();}ctx.strokeStyle=style.outer;ctx.lineWidth=6;ctx.beginPath();ctx.arc(e.x,e.y,r,0,7);ctx.stroke();}
 else if(e.character===5){for(let j=0;j<18;j++){const a=j*.73,rr=r*(.3+(j%4)*.25);ctx.fillStyle=j%3?style.inner:style.spark;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*rr,e.y+Math.sin(a)*rr*.75-f*24,8+f*6,0,7);ctx.fill();}ctx.strokeStyle=style.outer;ctx.lineWidth=9;ctx.beginPath();ctx.arc(e.x,e.y,r,0,7);ctx.stroke();}
 else if(e.character===6){ctx.strokeStyle=style.spark;ctx.lineWidth=2.5;for(let j=0;j<12;j++){const a=j*Math.PI/6;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(a)*r*1.55,e.y+Math.sin(a)*r*1.18);ctx.stroke();}ctx.strokeStyle=style.inner;ctx.lineWidth=5;ctx.beginPath();ctx.arc(e.x,e.y,r*.82,0,7);ctx.stroke();}
 else {ctx.strokeStyle=style.spark;ctx.lineWidth=special?5:3;for(let j=0;j<9;j++){const a=j*.7;ctx.beginPath();ctx.moveTo(e.x,e.y);let px=e.x,py=e.y;for(let k=1;k<=4;k++){const rr=r*k/3.2,na=a+Math.sin(k*5+j)*.18;px=e.x+Math.cos(na)*rr;py=e.y+Math.sin(na)*rr*.8;ctx.lineTo(px,py);}ctx.stroke();}ctx.fillStyle=style.inner;drawStar(e.x,e.y,r*.6,r*.26,5);ctx.fill();}
 if(special&&f<.34){const punch=1-f/.34;ctx.globalAlpha=punch*.5;ctx.strokeStyle='#ffffff';ctx.lineWidth=2+punch*4;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(10,r*(.42+punch*.24)),0,7);ctx.stroke();ctx.globalAlpha=punch*.34;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(e.x,e.y,Math.max(4,r*.22),0,7);ctx.fill();}ctx.globalAlpha=(1-f)*.7;ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(5,r*.42),0,7);ctx.fill();ctx.restore();}
function drawEnvColumns(now){
 const mapThemes=[
  {wind:'leaf',boost:'sunseed',windColors:['#9de5ae','#dff7a6','#7dbe7e'],boostColors:['#fff0a8','#ffc96e','#ff9f54']},
  {wind:'petal',boost:'bloom',windColors:['#ffd0df','#fff1b4','#f1a6c0'],boostColors:['#ffe7b5','#ffb8d5','#ff8cab']},
  {wind:'snow',boost:'crystal',windColors:['#d8f7ff','#f7ffff','#9ad9ff'],boostColors:['#eefcff','#a8f1ff','#7cd2ff']},
  {wind:'steam',boost:'ember',windColors:['#e6d6c8','#fff0d8','#b49786'],boostColors:['#ffd69f','#ff9b69','#ff6e43']},
  {wind:'star',boost:'nova',windColors:['#ffe39c','#fff8de','#ffd06f'],boostColors:['#fff0ad','#ffd8ff','#a9c7ff']}
 ];
 const theme=mapThemes[state.map]||mapThemes[0];
 for(const env of state.envs||[]){
  const life=Math.min(1,Math.max(0,(env.ends-now)/1200)),grow=Math.min(1,Math.max(0,(now-env.born)/500)),alpha=Math.min(life,grow);if(alpha<=0)continue;
  const h=env.y-env.top;ctx.save();ctx.translate(env.x,env.y);
  if(env.type==='wind'){
   ctx.globalAlpha=.12*alpha;ctx.fillStyle=theme.windColors[0];ctx.beginPath();ctx.ellipse(0,-h*.5,env.radius*.9,h*.52,0,0,7);ctx.fill();
   for(let i=0;i<7;i++){
    const yy=-h+(i/6)*h, swing=Math.sin(now/250+i*1.3)*11*env.dir;
    ctx.strokeStyle=theme.windColors[i%2?1:2]+(i%2?'aa':'88');ctx.lineWidth=i%3===0?2.5:2;ctx.beginPath();
    ctx.moveTo(-env.radius*.55,yy);ctx.quadraticCurveTo(swing,yy-14,env.radius*.5,yy-18);ctx.stroke();
   }
   for(let i=0;i<9;i++){
    const yy=-h+24+i*(h-48)/8, spin=now/260+i*21, bx=Math.sin(spin)*10*env.dir;
    ctx.globalAlpha=(.24+.05*(i%3))*alpha;ctx.fillStyle=theme.windColors[(i%3)];
    if(theme.wind==='leaf'){ctx.beginPath();ctx.ellipse(bx,yy,8,3,spin*.1,0,7);ctx.fill();ctx.strokeStyle=theme.windColors[2];ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(bx-5,yy);ctx.lineTo(bx+5,yy);ctx.stroke();}
    else if(theme.wind==='petal'){ctx.beginPath();ctx.ellipse(bx,yy,4.5,8,0.45,0,7);ctx.fill();}
    else if(theme.wind==='snow'){ctx.fillRect(bx-5,yy-1,10,2);ctx.fillRect(bx-1,yy-5,2,10);}
    else if(theme.wind==='steam'){ctx.beginPath();ctx.arc(bx,yy,5.5+(i%2),0,7);ctx.fill();}
    else {ctx.beginPath();ctx.moveTo(bx,yy-6);ctx.lineTo(bx+2,yy-2);ctx.lineTo(bx+7,yy-2);ctx.lineTo(bx+3,yy+1);ctx.lineTo(bx+5,yy+6);ctx.lineTo(bx,yy+3);ctx.lineTo(bx-5,yy+6);ctx.lineTo(bx-3,yy+1);ctx.lineTo(bx-7,yy-2);ctx.lineTo(bx-2,yy-2);ctx.closePath();ctx.fill();}
   }
  } else {
   const topCol=theme.boostColors[0],midCol=theme.boostColors[1],baseCol=theme.boostColors[2];
   const grad=ctx.createLinearGradient(0,-h,0,0);grad.addColorStop(0,topCol+'00');grad.addColorStop(.18,topCol+'77');grad.addColorStop(.72,midCol+'bb');grad.addColorStop(1,baseCol+'cc');
   ctx.globalAlpha=.88*alpha;ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(-env.radius*.72,0);
   for(let y=0;y>=-h;y-=16){const flare=Math.sin(now/180+y*.05)*9;ctx.lineTo(-env.radius*.2+flare*.16,y);ctx.lineTo(env.radius*.22+flare*.16,y-9);}ctx.lineTo(env.radius*.72,0);ctx.closePath();ctx.fill();
   ctx.globalAlpha=.55*alpha;
   for(let i=0;i<8;i++){
    const yy=-12-i*(h-28)/7,rx=Math.sin(now/150+i*2.2)*9,rr=4+(i%3)*2;ctx.fillStyle=[topCol,midCol,baseCol][i%3];
    if(theme.boost==='sunseed'){ctx.beginPath();ctx.ellipse(rx,yy,rr+2,rr*.8,0,0,7);ctx.fill();}
    else if(theme.boost==='bloom'){ctx.beginPath();ctx.ellipse(rx,yy,rr,rr*1.6,.35,0,7);ctx.fill();}
    else if(theme.boost==='crystal'){ctx.save();ctx.translate(rx,yy);ctx.rotate(i);ctx.beginPath();ctx.moveTo(rr,0);ctx.lineTo(0,-rr);ctx.lineTo(-rr,0);ctx.lineTo(0,rr);ctx.closePath();ctx.fill();ctx.restore();}
    else if(theme.boost==='ember'){ctx.beginPath();ctx.moveTo(rx,yy-rr*1.2);ctx.quadraticCurveTo(rx+rr,yy,rx,yy+rr*1.2);ctx.quadraticCurveTo(rx-rr*.9,yy,rx,yy-rr*1.2);ctx.fill();}
    else {ctx.beginPath();ctx.moveTo(rx,yy-rr*1.2);ctx.lineTo(rx+rr*.35,yy-rr*.35);ctx.lineTo(rx+rr*1.15,yy);ctx.lineTo(rx+rr*.35,yy+rr*.35);ctx.lineTo(rx,yy+rr*1.2);ctx.lineTo(rx-rr*.35,yy+rr*.35);ctx.lineTo(rx-rr*1.15,yy);ctx.lineTo(rx-rr*.35,yy-rr*.35);ctx.closePath();ctx.fill();}
   }
   ctx.globalAlpha=.26*alpha;ctx.strokeStyle=topCol;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-h*.18,env.radius*.9,0,7);ctx.stroke();
  }
  ctx.restore();
 }
}

function drawFx(now){
 for(const z of state.zones){ctx.fillStyle=z.type==='fire'?'#ff9c6555':'#b5d67a55';for(let i=0;i<8;i++){const x=z.x+(i-3.5)*20,y=z.y-15-Math.sin(now/270+i)*9;ctx.beginPath();ctx.arc(x,y,19,0,7);ctx.fill();}}
 for(const e of state.events){const age=now-e.at;if(age<0||age>1500)continue;
  if(e.type==='blast')drawBlast(e,age,now);
  if(e.type==='damage'){ctx.globalAlpha=1-age/1500;text('-'+e.damage,e.x,e.y-age*.025,24,'#fff4ad');ctx.globalAlpha=1;}
  if(e.type==='cut'&&age<700)text('낙하산 명중!',e.x,e.y-70-age*.04,18,'#ffefa7');
 }
}
function directHitShake(now){
 let hit=null;
 for(let i=state.events.length-1;i>=0;i--){const e=state.events[i];if(e.type==='blast'&&e.direct){hit=e;break;}}
 if(!hit)return{x:0,y:0};
 const age=now-hit.at,dur=hit.weapon==='special'?360:290;if(age<0||age>dur)return{x:0,y:0};
 const fade=1-age/dur,amp=(hit.weapon==='special'?5.2:3.8)*fade*fade;
 const seed=(hit.id||1)*1.713;
 return{x:Math.sin(age*.19+seed)*amp+Math.sin(age*.43+seed*.7)*amp*.35,y:Math.cos(age*.23+seed*1.3)*amp*.72};
}
function drawMinimap(){mc.clearRect(0,0,360,68);mc.fillStyle='#11223cee';mc.fillRect(0,0,360,68);mc.fillStyle=E.MAPS[state.map].edge;state.solids.forEach((c,i)=>{for(let j=0;j<c.length;j+=2)mc.fillRect(i*E.STEP/E.W*360,c[j]/E.H*68,1,Math.max(2,(c[j+1]-c[j])/E.H*68));});for(let i=0;i<state.players.length;i++){const p=state.players[i];if(p.hp<=0)continue;mc.fillStyle=COLORS[i];mc.fillRect(p.x/E.W*360-2,p.y/E.H*68-4,4,4);}for(const d of state.drops){mc.fillStyle=I[d.item].color;mc.fillRect(d.x/E.W*360-1,Math.max(1,d.y/E.H*68),3,3);}mc.strokeStyle='#ffdf81';mc.lineWidth=1;mc.strokeRect(camera.x/E.W*360,Math.max(0,camera.y/E.H*68),camera.w/E.W*360,camera.h/E.H*68);}
function drawDial(){const a=Number($('angle').value)*Math.PI/180;dial.clearRect(0,0,130,90);dial.fillStyle='#102035';dial.beginPath();dial.arc(64,78,59,Math.PI,2*Math.PI);dial.fill();dial.strokeStyle='#658aa0';dial.lineWidth=2;dial.stroke();for(let d=0;d<=180;d+=15){const r=d*Math.PI/180;dial.beginPath();dial.moveTo(64+Math.cos(r)*50,78-Math.sin(r)*50);dial.lineTo(64+Math.cos(r)*57,78-Math.sin(r)*57);dial.stroke();}dial.strokeStyle='#f9d371';dial.lineWidth=3;dial.beginPath();dial.moveTo(64,78);dial.lineTo(64+Math.cos(a)*51,78-Math.sin(a)*51);dial.stroke();dial.font='bold 18px monospace';dial.textAlign='center';dial.fillStyle='#ffe9a8';dial.fillText(angleText()+'°',48,66);}
function draw(now){
 resize();if(!state){ctx.clearRect(0,0,canvas.width,canvas.height);return;}
 const active=state.players[state.turn];if(state.turnSerial!==lastTurn){lastTurn=state.turnSerial;camera.manual=false;}
 let follow=active;
 if(state.phase==='flight'&&state.projectiles.length){const pr=state.projectiles[0],lead=Math.min(.15,Math.max(0,(now-state.simAt)/1000));follow={x:pr.x+pr.vx*lead,y:pr.y+pr.vy*lead};}
 if(!camera.manual&&follow){camera.targetX=follow.x-camera.w*.5;camera.targetY=state.phase==='flight'?Math.max(-160,Math.min(90,follow.y-camera.h*.43)):Math.max(-40,Math.min(240,follow.y-camera.h*(canvas.clientWidth<720?.46:.62)));camera.x+=(camera.targetX-camera.x)*.16;camera.y+=(camera.targetY-camera.y)*.07;}
 if(panHeld){camera.manual=true;camera.x+=panHeld*18;}camera.x=Math.max(-160,Math.min(E.W+160-camera.w,camera.x));camera.y=Math.max(-160,Math.min(240,camera.y));
 const scale=canvas.height/camera.h,shake=directHitShake(now);ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle=E.MAPS[state.map].sky[0];ctx.fillRect(0,0,camera.w,camera.h);ctx.save();ctx.translate(shake.x,shake.y);backdrop(now);ctx.save();ctx.translate(-camera.x,-camera.y);terrain();drawEnvColumns(now);
 state.drops.forEach(d=>drawDrop(d,now));state.players.forEach((p,i)=>drawPlayer(p,i,now));
 if(canAct()){const p=mine(),m=E.muzzlePosition(state,p);ctx.strokeStyle='#b8efe444';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y-42,88,Math.PI,Math.PI*2);ctx.stroke();for(let deg=0;deg<=180;deg+=15){const r=deg*Math.PI/180;ctx.beginPath();ctx.moveTo(p.x+Math.cos(r)*82,p.y-42-Math.sin(r)*82);ctx.lineTo(p.x+Math.cos(r)*88,p.y-42-Math.sin(r)*88);ctx.stroke();}const angle=Number($('angle').value)*Math.PI/180;ctx.strokeStyle='#fff1a8bb';ctx.lineWidth=2;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(m.x+Math.cos(angle)*115*p.face,m.y-Math.sin(angle)*115);ctx.stroke();ctx.setLineDash([]);text(`${angleText()}°`,m.x+Math.cos(angle)*137*p.face,m.y-Math.sin(angle)*137,16,'#ffeab4');}
 for(const pr of state.projectiles)drawProjectile(pr,now);
 drawFx(now);ctx.restore();ctx.restore();drawMinimap();drawDial();
}
function hostTick(){
 const now=Date.now();if(state&&bridge.isHost){E.tick(state,now);const p=state.players[state.turn];
  if(state.phase==='aim'&&p?.cpu&&!p.falling&&state.deadline-now<25000&&cpuTurn!==state.turnSerial){cpuTurn=state.turnSerial;const aim=E.cpuAim(state);if(p.hp<p.maxHp*.35&&p.items.heal)E.command(state,p.sid,{seq:p.lastSeq+1,match:state.id,kind:'item',item:'heal'},now,bridge.hostSid);else if(state.round>=4&&state.turnSerial%4===0&&p.items.double)E.command(state,p.sid,{seq:p.lastSeq+1,match:state.id,kind:'item',item:'double'},now,bridge.hostSid);E.command(state,p.sid,{seq:p.lastSeq+1,match:state.id,kind:'fire',weapon:state.round%3===0?'special':'normal',...aim},now,bridge.hostSid);publish();}
  if(state.eventSeq!==publishedEvent||state.phase!==publishedPhase||now-lastSent>2000)publish();
  if(state.phase==='over'&&!reported&&now>state.deadline-2000){reported=true;send('bs_over',{winnerSeat:state.players.find(p=>p.sid===state.winner)?.seat??-1});}
 }
 if(state&&!bridge.isHost)E.tick(state,now+offset);
 if(embedded&&bridge.ready&&(!state||(!bridge.isHost&&now-received>3500))&&now-lastSync>2000){lastSync=now;send('bs_sync');}
 if(embedded&&!bridge.ready&&now-lastSync>1000){lastSync=now;send('bridge_ready');}
 if(embedded&&!state&&now-bootAt>8000)$('setupHint').textContent='연결 대기 중 · 방 연결을 확인하고 다시 입장하세요.';
 if(pending&&now-pending.sent>350){if(now-pending.created<5000){pending.sent=now;send('bs_input',{input:pending.command});}else{pending=null;toast('연결을 확인한 뒤 다시 시도하세요.');}}
}
let uiAt=0;function loop(){const now=Date.now(),dt=frameAt?Math.min(50,now-frameAt)/1000:0;frameAt=now;
 if(canAct()){if(aimHeld){$('angle').value=Number($('angle').value)+aimHeld*28*dt;$('angle').oninput();}if(powerHeld&&!charge){$('power').value=Number($('power').value)+powerHeld*32*dt;$('power').oninput();}}
 if(moveHeld&&canAct()&&!pending&&now-lastMove>70){lastMove=now;act('move',{value:moveHeld});}
 if(charge){if(!canAct())endCharge(true);else if(now-charge.at>180){$('fire').classList.add('charging');const f=((now-charge.at-180)/1500)%2;$('power').value=Math.round(10+90*(f<=1?f:2-f));$('power').oninput();}}
 if(state){for(const ev of state.events){if(ev.id<=lastEvent)continue;lastEvent=ev.id;
  if(ev.type==='pickup'){toast(`${state.players.find(p=>p.sid===ev.sid)?.nick} · ${I[ev.item].name} 획득!`);playSfx('pickup',.38);}
  if(ev.type==='cut'){toast('낙하산 명중! 보급품 급강하');playSfx('cut',.4);}
  if(ev.type==='item')playSfx('item',.34);
  if(ev.type==='launch'){const rate=1+((ev.character||0)-3.5)*.02+(ev.weapon==='special'?.06:0);playSfx(`launch_${ev.character||0}_${ev.weapon==='special'?'special':'normal'}`,ev.weapon==='special'?.52:.42,rate);}
  if(ev.type==='blast'){const rate=1+((ev.character||0)-3.5)*.015+(ev.weapon==='special'?.04:0),baseVol=ev.weapon==='special'?.62:.52;playSfx(`impact_${ev.character||0}_${ev.weapon==='special'?'special':'normal'}`,Math.min(.74,baseVol+(ev.direct?.08:0)),rate);}
 }}
 if(now>noticeUntil)$('notice').textContent='';if(now-uiAt>150){uiAt=now;renderUI();}draw(now+offset);requestAnimationFrame(loop);
}
if(!embedded){state=E.create([{sessionId:'local',nick:'나',seat:0}],Date.now()>>>0);roster=[{sessionId:'local',nick:'나',seat:0}];renderUI();}else send('bridge_ready');
setInterval(hostTick,16);requestAnimationFrame(loop);
})();

