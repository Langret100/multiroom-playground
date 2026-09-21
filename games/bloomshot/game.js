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
const MAPS=E.MAPS.map(m=>m.name),ICONS={double:'Ⅱ',power:'✦',heal:'✚',move:'➟',shield:'⬡',poison:'♨',freeze:'❄',wind:'↔'},ITEM_SHORT={double:'한 번 더 발사',power:'피해 2배',heal:'체력 50% 회복',move:'이동력 회복',shield:'피해 35 흡수',poison:'맞추면 중독',freeze:'맞추면 둔화',wind:'바람 방향 반전'};
const embedded=parent!==window,bridge={sid:'local',hostSid:'local',isHost:!embedded,ready:!embedded};
let state=null,roster=[],sequence=0,pending=null,offset=0,received=0,lastSent=0,lastSync=0,reported=false,weapon='normal',sound=true,audio=null,audioBuffer=null,audioCues=null,audioLoad=null,bgmAudio=null,noticeUntil=0,lastEvent=0,setupCharacter=-1,lastTurn=-1,cpuTurn=-1,bootAt=Date.now(),itemIconUrls={};
let publishedEvent=-1,publishedPhase=null,lastCountdownTurn=-1,lastCountdownValue=99;
let charge=null,moveHeld=0,lastMove=0,panHeld=0,aimHeld=0,powerHeld=0,frameAt=0;
const camera={x:0,y:0,manual:false,w:1200,h:700,targetX:0,targetY:0},art={characters:[],portraitsSmall:[],portraitsLarge:[],portraitsPilot:[],mapBackdrops:Array(5).fill(null),mapForegrounds:Array(5).fill(null),mapPreviewImages:[],atlas:null,atlasMeta:null,fxAtlas:null,fxMeta:null,itemUI:null,projectileFx:null,projectileMeta:null,crateAtlas:null,crateMeta:null},visualPlayers=new Map(),mapPreviews=[];
const MAP_ART=[
 {bg:'assets/maps/map-0-bg.webp',fg:'assets/maps/map-0-fg.webp',preview:'assets/maps/map-0-preview.webp'},
 {bg:'assets/maps/map-1-bg.webp',fg:'assets/maps/map-1-fg.webp',preview:'assets/maps/map-1-preview.webp'},
 {bg:'assets/maps/map-2-bg.webp',fg:'assets/maps/map-2-fg.webp',preview:'assets/maps/map-2-preview.webp'},
 {bg:'assets/maps/map-3-bg.webp',fg:'assets/maps/map-3-fg.webp',preview:'assets/maps/map-3-preview.webp'},
 {bg:'assets/maps/map-4-bg.webp',fg:'assets/maps/map-4-fg.webp',preview:'assets/maps/map-4-preview.webp'}
];
const GAMEPLAY_ATLAS='assets/gameplay-atlas.webp',ATLAS_META_PATH='assets/gameplay-atlas.json',FX_ATLAS='assets/fx-atlas.webp',FX_META_PATH='assets/fx-atlas.json',ITEM_UI='assets/item-ui.webp',PROJECTILE_FX='assets/projectile-fx-atlas.webp',PROJECTILE_META='assets/projectile-fx-atlas.json',CRATE_ATLAS='assets/crate-atlas.webp',CRATE_META='assets/crate-atlas.json';
function load(path,onload){const image=new Image();if(onload)image.onload=onload;image.src=path;return image;}
function atlasCharRect(index){return art.atlasMeta?.chars?.[index]||null;}
function atlasPartRect(name){return art.atlasMeta?.[name]||null;}
function drawAtlasPart(name,dx,dy,dw,dh,alpha=1){const r=atlasPartRect(name);if(!r||!art.atlas?.complete||!art.atlas.naturalWidth)return false;ctx.save();ctx.imageSmoothingEnabled=false;if(alpha!==1)ctx.globalAlpha*=alpha;ctx.drawImage(art.atlas,r.x,r.y,r.w,r.h,dx,dy,dw,dh);ctx.restore();return true;}
function drawProjectileAsset(character,group,frame,x,y,size,rotation=0,alpha=1){const m=art.projectileMeta,g=m?.groups?.[group],im=art.projectileFx;if(!g||!im?.complete||!im.naturalWidth)return false;const cw=m.cellW||64,ch=m.cellH||64,row=Math.max(0,Math.min((m.rows||8)-1,character|0)),f=((frame%g.frames)+g.frames)%g.frames,sx=(g.col+f)*cw,sy=row*ch;ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.imageSmoothingEnabled=false;if(alpha!==1)ctx.globalAlpha*=alpha;ctx.drawImage(im,sx,sy,cw,ch,-size/2,-size/2,size,size);ctx.restore();return true;}
function drawCrateAsset(name,dx,dy,dw,dh,alpha=1){const m=art.crateMeta,p=m?.parts?.[name],im=art.crateAtlas;if(!p||!im?.complete||!im.naturalWidth)return false;const cw=m.cellW||192,ch=m.cellH||192,sx=p.col*cw,sy=p.row*ch;ctx.save();ctx.imageSmoothingEnabled=false;if(alpha!==1)ctx.globalAlpha*=alpha;ctx.drawImage(im,sx,sy,cw,ch,dx,dy,dw,dh);ctx.restore();return true;}
function atlasFrameTrim(index,row,col){return art.atlasMeta?.trims?.[index]?.[row*4+col]||null;}
function fxSection(name){return art.fxMeta?.[name]||null;}
function fxItemRow(key){return art.fxMeta?.itemOverhead?.order?.indexOf(key)??-1;}
function drawFxFrame(name,row,col,dx,dy,dw,dh,alpha=1,flip=false){const sec=fxSection(name);if(!sec||!art.fxAtlas?.complete||!art.fxAtlas.naturalWidth)return false;const sx=sec.x+col*sec.w,sy=sec.y+(row||0)*sec.h;ctx.save();ctx.imageSmoothingEnabled=false;if(alpha!==1)ctx.globalAlpha*=alpha;if(flip){ctx.translate(dx+dw,dy);ctx.scale(-1,1);ctx.drawImage(art.fxAtlas,sx,sy,sec.w,sec.h,0,0,dw,dh);}else ctx.drawImage(art.fxAtlas,sx,sy,sec.w,sec.h,dx,dy,dw,dh);ctx.restore();return true;}
function drawSupplyGroundFrame(col,dx,dy,dw,dh,alpha=1){const sec=fxSection('supplyGroundSheet');if(!sec||!art.fxAtlas?.complete||!art.fxAtlas.naturalWidth)return false;const srcX=sec.x+col*sec.w,srcY=sec.y+20,srcW=sec.w,srcH=Math.max(1,sec.h-20);ctx.save();ctx.imageSmoothingEnabled=false;if(alpha!==1)ctx.globalAlpha*=alpha;ctx.drawImage(art.fxAtlas,srcX,srcY,srcW,srcH,dx,dy,dw,dh);ctx.restore();return true;}
function drawOverheadIcon(key,x,y,now,scale=1,alpha=1){const order=art.fxMeta?.itemOverhead?.order||['double','power','heal','move','shield','poison','freeze','wind'],row=order.indexOf(key),im=art.itemUI;if(row<0||!im?.complete||!im.naturalWidth)return false;const cellH=Math.floor(im.naturalHeight/order.length),size=Math.round(30*scale),bob=Math.sin(now/180)*2*scale;ctx.save();ctx.imageSmoothingEnabled=false;if(alpha!==1)ctx.globalAlpha*=alpha;ctx.drawImage(im,0,row*cellH,im.naturalWidth,cellH,x-size/2,y-size/2+bob,size,size);ctx.restore();return true;}
function drawItemUsePopup(key,x,y,age,now,label='사용'){const def=I[key];if(!def)return;const t=Math.min(1,age/1650),rise=18+t*16,effect=ITEM_SHORT[key]||def.desc,w=Math.max(116,88+effect.length*6),h=34,px=Math.round(x-w/2),py=Math.round(y-rise-h);ctx.save();ctx.globalAlpha=1-Math.max(0,(age-1200)/450);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#163645e8';ctx.fillRect(px+2,py+h-4,w-4,4);ctx.fillStyle='#fcffff';ctx.fillRect(px,py,w,h);ctx.fillStyle='#e7f8fb';ctx.fillRect(px+2,py+2,w-4,h-4);ctx.fillStyle=def.color;ctx.fillRect(px+4,py+4,26,h-8);drawOverheadIcon(key,px+17,py+17,now,1.15,1);text(label,px+49,py+11,8,'#6a8f9b');text(def.name,px+55,py+18,9,'#315b67');text(effect,px+Math.floor(w/2)+10,py+28,9,def.color);ctx.restore();}
function buildItemIconURLs(){const keys=art.fxMeta?.itemOverhead?.order||['double','power','heal','move','shield','poison','freeze','wind'];if(art.itemUI?.complete&&art.itemUI.naturalWidth){const cellH=Math.floor(art.itemUI.naturalHeight/Math.max(1,keys.length)),cellW=art.itemUI.naturalWidth;for(let r=0;r<keys.length;r++){const key=keys[r];const cv=document.createElement('canvas');cv.width=64;cv.height=64;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,64,64);c.drawImage(art.itemUI,0,r*cellH,cellW,cellH,4,4,56,56);itemIconUrls[key]=cv.toDataURL('image/png');}}else if(art.fxAtlas?.complete&&art.fxMeta?.itemOverhead){const sec=art.fxMeta.itemOverhead;for(let r=0;r<keys.length;r++){const key=keys[r];const cv=document.createElement('canvas');cv.width=64;cv.height=64;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,64,64);c.drawImage(art.fxAtlas,sec.x,sec.y+r*sec.h,sec.w,sec.h,12,12,40,40);itemIconUrls[key]=cv.toDataURL('image/png');}}document.querySelectorAll('[data-slot]').forEach((el,i)=>applySlotVisual(el,el.dataset.item||'',Number(el.dataset.slot||i)));}
function inventorySlots(p){if(Array.isArray(p?.slots)&&p.slots.length===4)return p.slots;const arr=[];Object.keys(I).forEach(k=>{for(let n=0;n<(p?.items?.[k]||0)&&arr.length<4;n++)arr.push(k);});while(arr.length<4)arr.push(null);return arr;}
function applySlotVisual(btn,key,idx){const icon=btn.querySelector('.slot-icon'),name=btn.querySelector('.item-name'),effect=btn.querySelector('.item-effect'),count=btn.querySelector('.count');btn.dataset.item=key||'';btn.dataset.slot=String(idx);if(key&&I[key]){btn.classList.remove('empty');btn.style.setProperty('--item-color',I[key].color);icon.innerHTML=itemIconUrls[key]?`<img src="${itemIconUrls[key]}" alt="">`:'';name.textContent=I[key].name;effect.textContent=ITEM_SHORT[key]||I[key].desc;count.textContent='';btn.title=`${I[key].name} · ${ITEM_SHORT[key]||I[key].desc}`;}else{btn.classList.add('empty');btn.style.removeProperty('--item-color');icon.innerHTML='';name.textContent='빈 칸';effect.textContent='보급 획득 시 채워짐';count.textContent='';btn.title='보급 상자를 먹으면 아이템이 들어옵니다.';}}
function drawCover(c,image,w,h,alpha=1){if(!image?.complete||!image.naturalWidth)return false;const iw=image.naturalWidth,ih=image.naturalHeight,scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale,dx=(w-dw)/2,dy=(h-dh)/2;c.save();if(alpha!==1)c.globalAlpha*=alpha;c.imageSmoothingEnabled=false;c.drawImage(image,dx,dy,dw,dh);c.restore();return true;}
function drawMapPreview(index){const preview=mapPreviews[index];if(!preview)return;const pc=preview.getContext('2d');pc.clearRect(0,0,preview.width,preview.height);pc.imageSmoothingEnabled=false;const image=art.mapPreviewImages[index];if(image?.complete&&image.naturalWidth){pc.drawImage(image,0,0,preview.width,preview.height);return;}const sample=E.create([{sessionId:'preview'}],1,0);sample.map=index;E.buildMap(sample);pc.fillStyle=E.MAPS[index].sky[0];pc.fillRect(0,0,preview.width,preview.height);pc.fillStyle='#12212c66';pc.fillRect(0,0,preview.width,preview.height);pc.fillStyle=E.MAPS[index].edge;sample.solids.forEach((c,x)=>{for(let j=0;j<c.length;j+=2)pc.fillRect(x*E.STEP/E.W*preview.width,c[j]/E.H*preview.height,1,Math.max(2,(c[j+1]-c[j])/E.H*preview.height));});}
function ensureMapArt(index){if(index<0||index>=MAP_ART.length)return;if(!art.mapBackdrops[index])art.mapBackdrops[index]=load(`${MAP_ART[index].bg}?v=33`);if(!art.mapForegrounds[index])art.mapForegrounds[index]=load(`${MAP_ART[index].fg}?v=33`);}
function refreshMapPreviews(){for(let i=0;i<MAP_ART.length;i++)drawMapPreview(i);}
function startBgm(){
 if(!bgmAudio){bgmAudio=new Audio('assets/bloombit.mp3?v=33');bgmAudio.loop=true;bgmAudio.volume=.22;}
 if(sound){bgmAudio.currentTime=bgmAudio.currentTime||0;bgmAudio.play().catch(()=>{});}
}
function syncBgm(){
 if(!bgmAudio)return;
 if(sound){bgmAudio.volume=.22;bgmAudio.play().catch(()=>{});}else bgmAudio.pause();
}
function buildPortrait(index,size=96){
 const rect=atlasCharRect(index),trim=art.atlasMeta?.trims?.[index]?.[0];if(!rect||!trim||!art.atlas?.naturalWidth)return '';
 const cw=art.atlasMeta.frameW||rect.w/4,ch=art.atlasMeta.frameH||rect.h/4,srcX=rect.x+trim.x,srcY=rect.y+trim.y,srcW=trim.w,srcH=trim.h;
 const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const scale=Math.min(size/(srcW*1.08),size/(srcH*1.08)),dw=srcW*scale,dh=srcH*scale;
 const dx=(size-dw)/2,dy=(size-dh)/2+size*.03;
 c.drawImage(art.atlas,srcX,srcY,srcW,srcH,dx,dy,dw,dh);
 return canvas.toDataURL('image/png');
}
function refreshPortraitAssets(){
 if(!art.atlasMeta||!art.atlas?.complete)return;
 for(let i=0;i<C.length;i++){art.portraitsSmall[i]=buildPortrait(i,78);art.portraitsLarge[i]=buildPortrait(i,124);art.portraitsPilot[i]=buildPortrait(i,58);}
 document.querySelectorAll('#characters img').forEach((im,i)=>{if(art.portraitsSmall[i])im.src=art.portraitsSmall[i];});
 const minePlayer=state?.players?.find(p=>p.sid===bridge.sid);
 if(setupCharacter>=0&&art.portraitsLarge[setupCharacter])$('selectedPortrait').src=art.portraitsLarge[setupCharacter];
 if(minePlayer&&art.portraitsPilot[minePlayer.character])$('pilotImage').src=art.portraitsPilot[minePlayer.character];
}

for(let i=0;i<C.length;i++)art.characters.push(load(`assets/portrait-${i}.webp?v=33`));
art.itemUI=load(`${ITEM_UI}?v=33`,()=>buildItemIconURLs());
fetch(`${ATLAS_META_PATH}?v=33`).then(r=>r.json()).then(meta=>{art.atlasMeta=meta;refreshPortraitAssets();}).catch(()=>{});
art.atlas=load(`${GAMEPLAY_ATLAS}?v=33`,()=>refreshPortraitAssets());
fetch(`${FX_META_PATH}?v=33`).then(r=>r.json()).then(meta=>{art.fxMeta=meta;buildItemIconURLs();}).catch(()=>{});
art.fxAtlas=load(`${FX_ATLAS}?v=33`,()=>buildItemIconURLs());
fetch(`${PROJECTILE_META}?v=33`).then(r=>r.json()).then(meta=>{art.projectileMeta=meta;}).catch(()=>{});
art.projectileFx=load(`${PROJECTILE_FX}?v=33`);
fetch(`${CRATE_META}?v=33`).then(r=>r.json()).then(meta=>{art.crateMeta=meta;}).catch(()=>{});
art.crateAtlas=load(`${CRATE_ATLAS}?v=33`);
art.mapPreviewImages=MAP_ART.map((entry,i)=>load(`${entry.preview}?v=33`,()=>drawMapPreview(i)));
ensureMapArt(0);
fetch('assets/manifest.json?v=33').then(r=>r.json()).then(m=>{if(m.characters){art.characters=m.characters.map(load);refreshPortraitAssets();}}).catch(()=>{});
function send(type,data={}){if(embedded)parent.postMessage({type,gameId:'bloomshot',...data},location.origin);}
function publish(){if(!state||!bridge.isHost)return;state.seq++;state.hostTime=Date.now();lastSent=Date.now();publishedEvent=state.eventSeq;publishedPhase=state.phase;send('bs_state',{state});}
function toast(message){$('notice').textContent=message;noticeUntil=Date.now()+2300;}
async function ensureAudio(){
 try{
  audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
  if(!audioBuffer){audioLoad??=Promise.all([fetch('assets/bloomshot-sfx.ogg?v=33').then(r=>{if(!r.ok)throw new Error('audio');return r.arrayBuffer();}),fetch('assets/sfx-cues.json?v=33').then(r=>r.json())]).then(async([buf,map])=>{audioBuffer=await audio.decodeAudioData(buf);audioCues=map.cues||{};});await audioLoad;}
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
 if(incoming?.version!==9){toast('새 게임 버전으로 방을 다시 시작하세요.');return;}
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
 for(let i=0;i<4;i++){const b=document.createElement('button');b.className='item empty';b.dataset.slot=String(i);b.innerHTML=`<span class="slot-icon"></span><span class="item-name">빈 칸</span><span class="item-effect">보급 획득 시 채워짐</span><span class="count"></span>`;b.onclick=()=>{const key=b.dataset.item;if(key)act('item',{item:key});if(key&&I[key])$('itemHelp').textContent=`${ITEM_SHORT[key]||I[key].name} · ${I[key].desc}`;};b.onpointerenter=()=>{const key=b.dataset.item;$('itemHelp').textContent=key&&I[key]?`${ITEM_SHORT[key]||I[key].name} · ${I[key].desc}`:'보급 상자를 먹으면 아이템이 들어옵니다.';};$('items').append(b);}
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
const unlockSound=()=>{if(sound){startBgm();ensureAudio();}};window.addEventListener('pointerdown',unlockSound,{once:true});window.addEventListener('keydown',unlockSound,{once:true});
$('exit').onclick=()=>{if(embedded)send('bs_quit');else location.href='../../index.html';};
$('focus').onclick=()=>{const p=mine()||state?.players[state.turn];if(p){camera.manual=false;camera.x=p.x-camera.w/2;}};
$('supplyView').onclick=()=>{const d=state?.drops.find(d=>d.status==='chute'||d.status==='fall')||state?.drops.at(-1);if(d){camera.manual=true;camera.x=d.x-camera.w/2;camera.y=-80;toast('보급품 위치');}};
$('again').onclick=()=>{state=E.create([{sessionId:'local',nick:'나',seat:0}],Date.now()>>>0);reported=false;lastEvent=0;setupCharacter=-1;lastTurn=-1;renderUI();};
window.addEventListener('keydown',e=>{
 if(e.target.tagName==='INPUT'&&e.target.type!=='range')return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
 if(e.code==='ArrowLeft'&&!e.repeat)beginMove(-1);if(e.code==='ArrowRight'&&!e.repeat)beginMove(1);
 if(e.code==='ArrowUp'||e.code==='ArrowDown'){aimHeld=e.code==='ArrowUp'?1:-1;if(!e.repeat&&canAct()){$('angle').value=Number($('angle').value)+aimHeld*.4;$('angle').oninput();}}
 if(e.code==='KeyA'||e.code==='KeyD')powerHeld=e.code==='KeyD'?1:-1;
 if(e.code==='KeyJ'&&!e.repeat){camera.manual=false;act('jump');}if(e.code==='Space'&&!e.repeat)beginCharge();
 if(e.code==='KeyQ')panHeld=-1;if(e.code==='KeyE')panHeld=1;
 if(!e.repeat&&['Digit1','Digit2','Digit3','Digit4'].includes(e.code)){const list=inventorySlots(mine());const slot=list[Number(e.code.slice(-1))-1];if(slot)act('item',{item:slot});}
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
 const remain=Math.max(0,Math.ceil((state.deadline-now)/1000));
 if(state.turnSerial!==lastCountdownTurn){lastCountdownTurn=state.turnSerial;lastCountdownValue=99;}
 if(state.phase==='aim'&&remain<=5&&remain>=1&&remain!==lastCountdownValue){lastCountdownValue=remain;playSfx('ui_on',remain===5?.34:.46,1.18+(5-remain)*.05);toast(remain<=3?`⏱ ${remain}초`:`${remain}초 남음`);}
 $('wind').textContent=`${state.wind<0?'◀':'▶'} ${String(Math.abs(state.wind)).padStart(2,'0')}`;$('windMeter').style.transform=`scaleX(${Math.max(.06,Math.abs(state.wind)/38)})`;
 $('supplyView').textContent=`♧ 보급 ${Math.max(0,Math.ceil((state.nextDropAt-now)/1000))}s`;
 $('cameraMode').textContent=camera.manual?'자유 시점 · 내 캐릭터로 복귀 가능':'자동 추적';
 $('pilotImage').src=art.portraitsPilot[p?.character||0]||art.characters[p?.character||0]?.src||'';$('pilotName').textContent=p?`${c.name} · ${p.nick}`:'관전 중';$('pilotHP').textContent=`HP ${Math.ceil(p?.hp||0)} / ${p?.maxHp||100}${p?.shield?' + 보호막':''}`;
 $('hpFill').style.width=`${p?p.hp/p.maxHp*100:0}%`;$('fuelFill').style.width=`${p?p.fuel/p.maxFuel*100:0}%`;$('fuel').textContent=`${Math.round(p?.fuel||0)} / ${p?.maxFuel||100}`;
 for(const id of ['left','right','jump','angle','power','fire','pass'])$(id).disabled=!can;
 $('jump').disabled=!can||p.fuel+1e-6<p.maxFuel*.3;
 document.querySelectorAll('[data-weapon]').forEach(b=>{b.disabled=false;b.setAttribute('aria-disabled',String(!can));b.classList.toggle('selected',b.dataset.weapon===weapon);b.textContent=b.dataset.weapon==='normal'?c.weapon:c.weapon2;b.setAttribute('aria-label',b.textContent+' · 길게 눌러 설명');b.removeAttribute('title');});
 inventorySlots(p).forEach((key,idx)=>{const b=document.querySelector(`[data-slot="${idx}"]`);if(!b)return;applySlotVisual(b,key,idx);const disabled=!can||!key||(key==='heal'&&p.hp>=p.maxHp);b.disabled=disabled;b.classList.toggle('selected',!!key&&p?.boost===key);});
 $('boostLabel').textContent=p?.boost?`${I[p.boost].name} 준비 · 다음 발사에 적용`:'아이템은 최대 4칸 · 보급품으로 채워집니다';
 $('roster').replaceChildren(...state.players.map((q,i)=>{const el=document.createElement('div');el.className='player'+(state.turn===i?' active':'')+(q.hp<=0?' dead':'');el.style.setProperty('--color',COLORS[i]);const n=document.createElement('b');n.textContent=`${q.sid===bridge.sid?'나 · ':''}${q.nick}`;const hp=document.createElement('span');hp.textContent=q.hp>0?`${Math.ceil(q.hp)} HP`:'OUT';el.append(n,hp);return el;}));
 if(state.phase==='over'){$('winner').textContent=state.winner?`${state.players.find(p=>p.sid===state.winner)?.nick} 승리!`:'무승부';$('resultHint').textContent=embedded?'잠시 후 같은 방 대기실로 돌아갑니다.':'다른 정령과 전장으로 다시 도전하세요.';$('again').hidden=embedded;}
 $('angle').oninput();$('power').oninput();
}
function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}camera.h=1080;camera.w=1080*rect.width/rect.height;}
function clearGhostOverlay(){const n=$('notice');if(n&&!String(n.textContent||'').trim())n.style.display='none';const t=document.getElementById('weaponTooltip');if(t&&(!t.textContent||!t.textContent.trim()))t.hidden=true;}
function text(t,x,y,size=14,color='#fff',align='center'){ctx.font=`900 ${size}px system-ui`;ctx.textAlign=align;ctx.lineWidth=4;ctx.strokeStyle='#19243ccc';ctx.strokeText(t,x,y);ctx.fillStyle=color;ctx.fillText(t,x,y);}
let windTravel=0,windAt=0;
function backdrop(now){
 const m=E.MAPS[state.map],sky=ctx.createLinearGradient(0,0,0,camera.h);sky.addColorStop(0,m.sky[0]);sky.addColorStop(1,m.sky[1]);ctx.fillStyle=sky;ctx.fillRect(0,0,camera.w,camera.h);
 const bg=art.mapBackdrops[state.map];if(bg?.complete&&bg.naturalWidth){ctx.save();drawCover(ctx,bg,camera.w,camera.h,.94);ctx.restore();}
 // background art is the only static backdrop layer; no legacy canvas silhouettes/cloud stamps
 const dt=windAt?Math.min(100,Math.max(0,now-windAt)):0;windAt=now;windTravel+=(state.wind||0)*dt*.0012;
 const windDir=state.wind<0?-1:1,windStrength=Math.min(1,Math.abs(state.wind)/38),windParticleCount=14+Math.round(windStrength*10);
 for(let i=0;i<windParticleCount;i++){const span=camera.w+150,x=((i*167+windTravel-camera.x*.1)%span+span)%span-75,y=56+(i*(camera.h-180)/Math.max(1,windParticleCount-1))+Math.sin(now/920+i*1.6)*12,frame=(Math.floor(now/130)+i)%4,sz=30+((i%3===0)?8:0);const ok=drawFxFrame('windParticles',state.map,frame,x-sz/2,y-sz/2,sz,sz,.50+(i%3)*.08+.12*windStrength,windDir<0);if(!ok){ctx.save();ctx.translate(x,y);ctx.fillStyle=['#b7e67d','#ffb8cf','#e8fbff','#dec3aa','#ffe49a'][state.map];ctx.globalAlpha=.5+(i%3)*.08+.10*windStrength;ctx.fillRect(-3,-3,6,6);ctx.restore();}}

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
function recentItemUse(sid,now){for(let i=state.events.length-1;i>=0;i--){const e=state.events[i];if(e.type==='item'&&e.sid===sid&&now-e.at<1650)return {item:e.item,age:now-e.at};}return null;}
function recentPickup(sid,now){for(let i=state.events.length-1;i>=0;i--){const e=state.events[i];if(e.type==='pickup'&&e.sid===sid&&now-e.at<1650)return {item:e.item,age:now-e.at};}return null;}
function spriteFrame(p,v,now,moving){const hp=p.maxHp?p.hp/p.maxHp:1,launchAge=recentEventAge('launch',p.sid,now),landAge=recentEventAge('land',p.sid,now);const idle=Math.floor(now/280)%4,walk=Math.floor(now/140)%2;const tryingMove=state.players[state.turn]===p&&state.phase==='aim'&&p.sid===bridge.sid&&!!moveHeld;const blocked=tryingMove&&!moving&&Math.abs((v.lastRealX??p.x)-p.x)<0.2;if(p.falling||state.jump?.sid===p.sid)return {row:2,col:0};if(landAge<260)return {row:2,col:1};if(launchAge<220)return {row:0,col:3};if(blocked)return {row:1,col:2};if(hp<=.1)return {row:2,col:2};if(hp<=.5)return {row:0,col:3};if(moving)return {row:1,col:walk};return {row:0,col:idle};}

function drawSpriteFrame(index,row,col,dx,dy,dw,dh){
 const rect=atlasCharRect(index),trim=atlasFrameTrim(index,row,col);if(!rect||!trim||!art.atlas?.complete||!art.atlas.naturalWidth)return false;
 const cw=art.atlasMeta.frameW||rect.w/4,ch=art.atlasMeta.frameH||rect.h/4;
 const scale=Math.min(dw/cw,dh/ch),outW=trim.w*scale,outH=trim.h*scale;
 const outX=dx+(dw-outW)/2,outY=dy+dh-outH+2;
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
 const f=age/900,count=e.weapon==='special'?22:15,seed=(e.id||1)*97+(e.character||0)*31;
 for(let i=0;i<count;i++){const t=Math.max(0,Math.min(1,f*1.35-(i/count)*.15));if(t<=0)continue;const ang=(i/count)*Math.PI*2+((seed+i*13)%17)*.08,spd=(50+(i%5)*18)*(1.15-t*.22),px=e.x+Math.cos(ang)*spd*t,py=e.y+Math.sin(ang)*spd*t-(style.trail==='flame'?34*t*t:14*t*t);ctx.save();ctx.translate(px,py);ctx.rotate(ang+t*2.4);ctx.globalAlpha=(1-t)*.9;
  if(style.trail==='leaf'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.ellipse(0,0,9,4.2,0,0,7);ctx.fill();ctx.strokeStyle=style.outer;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(7,0);ctx.stroke();}
  else if(style.trail==='ribbon'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.ellipse(0,0,5.6,11.2,.3,0,7);ctx.fill();}
  else if(style.trail==='mist'){ctx.fillStyle=i%2?style.outer:style.inner;ctx.beginPath();ctx.arc(0,0,7.4+(i%3)*1.8,0,7);ctx.fill();}
  else if(style.trail==='streak'){ctx.fillStyle=i%2?style.outer:style.spark;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-6,-4);ctx.lineTo(-10,0);ctx.lineTo(-6,4);ctx.closePath();ctx.fill();}
  else if(style.trail==='shard'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(0,-8);ctx.lineTo(-7,0);ctx.lineTo(0,8);ctx.closePath();ctx.fill();}
  else if(style.trail==='flame'){ctx.fillStyle=i%2?style.inner:style.spark;ctx.beginPath();ctx.moveTo(0,-11);ctx.quadraticCurveTo(9,-3,0,11);ctx.quadraticCurveTo(-8,-2,0,-11);ctx.fill();}
  else if(style.trail==='frost'){ctx.strokeStyle=i%2?style.inner:style.spark;ctx.lineWidth=1.9;ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(7,0);ctx.moveTo(0,-5);ctx.lineTo(0,5);ctx.stroke();}
  else {ctx.strokeStyle=style.spark;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(-2,-3);ctx.lineTo(2,3);ctx.lineTo(7,0);ctx.stroke();}
 ctx.restore();
 }
}

function drawDrop(d,now){
 const color='#d9e8c3';let y=d.y,x=d.x;
 if(!bridge.isHost&&d.status==='chute'){const elapsed=Math.min(400,Math.max(0,now-state.simAt));x+=state.wind*.048*elapsed/1000;y+=((E.ground(state,x)+46)/25000)*elapsed;}
 const bob=d.status==='chute'?Math.sin(now/220+d.id)*2.6:Math.sin(now/260+d.id*.8)*1.4;
 const sway=d.status==='chute'?Math.sin(now/420+d.id)*.095:Math.sin(now/310+d.id*.7)*.045;
 const landBounce=d.status==='ground'&&d.landedAt?Math.max(0,1-(now-d.landedAt)/420):0,frame=Math.floor(now/(d.status==='chute'?130:150)+d.id)%4;
 ctx.save();ctx.translate(x,y+bob-landBounce*4);ctx.rotate(sway*(1+landBounce*1.7));
 const glow= d.status==='chute' ? 12+Math.sin(now/180+d.id)*3 : 9+Math.sin(now/210+d.id)*2;
 ctx.globalAlpha=.22;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,d.status==='chute'?-4:-9,glow*1.18,glow*.72,0,0,7);ctx.fill();
 ctx.globalAlpha=d.status==='ground'?.14:.1;ctx.fillStyle='#0d1218';ctx.beginPath();ctx.ellipse(0,18, d.status==='ground'?22+landBounce*4:16, d.status==='ground'?7+landBounce*1.8:5,0,0,7);ctx.fill();ctx.globalAlpha=1;
 if(d.status==='chute'&&drawCrateAsset('air',-78,-176,156,216,1)){}
 else if(d.status==='ground'&&drawCrateAsset('ground',-66,-58,132,104,1)){}
 else {ctx.fillStyle='#243148';ctx.fillRect(-17,-17,34,30);ctx.strokeStyle='#d9d0b0';ctx.lineWidth=4;ctx.strokeRect(-17,-17,34,30);text('?',0,6,22,'#fff4c1');}
 ctx.restore();
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
 if(!drawSpriteFrame(p.character,frame.row,frame.col,-82,-128,164,128)){const im=art.characters[p.character];if(im?.complete&&im.naturalWidth)ctx.drawImage(im,-48,-92,96,96);else{ctx.fillStyle=c.color;ctx.fillRect(-25,-60,50,60);}}
 ctx.restore();
 if(p.shield>0){ctx.strokeStyle='#b2baff99';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-38,42,52,tilt,0,7);ctx.stroke();drawOverheadIcon('shield',x+30,y-86,now,.9,.92);}
 if(p.poison?.turns>0)drawOverheadIcon('poison',x-28,y-84,now,.88,.95);
 if(p.frozen>0)drawOverheadIcon('freeze',x+28,y-84,now,.88,.95);
 if(p.boost)drawOverheadIcon(p.boost,x,y-112,now,1.12,1);
 const picked=recentPickup(p.sid,now);if(picked){drawItemUsePopup(picked.item,x,y-122,picked.age,now,'획득');drawOverheadIcon(picked.item,x,y-137-picked.age*.012,now,1.16,Math.max(.32,1-picked.age/1650));}
 const itemUse=recentItemUse(p.sid,now);if(itemUse){drawItemUsePopup(itemUse.item,x,y-116,itemUse.age,now,'사용');drawOverheadIcon(itemUse.item,x,y-132-itemUse.age*.012,now,1.18,Math.max(.3,1-itemUse.age/1650));}
 text(p.nick,x,y-98,14,COLORS[i]);
 ctx.fillStyle='#17243b';ctx.fillRect(x-33,y+13,66,8);ctx.fillStyle=COLORS[i];ctx.fillRect(x-32,y+14,64*p.hp/p.maxHp,6);text(Math.ceil(p.hp)+'',x,y+38,12,'#fff3bc');
 if(state.players[state.turn]===p&&state.phase==='aim')drawTurnArrow(x,y,now);
}
function pathStroke(points,color,width,alpha=1,dash=[]){if(points.length<2)return;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(dash);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.restore();}
function drawStar(x,y,r1,r2,n=5){ctx.beginPath();for(let i=0;i<n*2;i++){const a=-Math.PI/2+i*Math.PI/n,r=i%2?r2:r1,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function projectileAugments(pr){return {power:pr.boostVisual==='power',freeze:pr.statusEffect==='freeze'||pr.boostVisual==='freeze',poison:pr.statusEffect==='poison'||pr.boostVisual==='poison',wind:!!pr.envWind||pr.envType==='wind',fire:!!pr.envFire||pr.envType==='fire'};}
function drawAugmentedTrail(pr,pts,now,special){const fx=projectileAugments(pr);ctx.save();ctx.globalCompositeOperation='lighter';if(fx.power){pathStroke(pts,'#f6b246',special?4.4:3.4,.46,[5,4]);for(let i=2;i<pts.length;i+=4){const p=pts[i];ctx.fillStyle='#fff2a8';ctx.globalAlpha=.62;ctx.beginPath();ctx.arc(p[0],p[1],2.2,0,7);ctx.fill();}}if(fx.freeze){pathStroke(pts,'#bff6ff',special?3.6:2.8,.38,[3,6]);for(let i=3;i<pts.length;i+=5){const p=pts[i];ctx.strokeStyle='#e8fdff';ctx.globalAlpha=.7;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(p[0]-3,p[1]);ctx.lineTo(p[0]+3,p[1]);ctx.moveTo(p[0],p[1]-3);ctx.lineTo(p[0],p[1]+3);ctx.stroke();}}if(fx.poison){for(let i=1;i<pts.length;i+=3){const p=pts[i],f=i/pts.length;ctx.fillStyle=i%2?'#c6f58e':'#9b62d9';ctx.globalAlpha=.10+.20*f;ctx.beginPath();ctx.arc(p[0]+Math.sin(i*1.4)*4,p[1]+Math.cos(i*1.1)*3,3.4+f*2.2,0,7);ctx.fill();}}if(fx.wind){const swirl=pts.map((p,i)=>[p[0]+Math.sin(i*1.8+now*.012)*4,p[1]+Math.cos(i*1.6+now*.012)*2]);pathStroke(swirl,'#eafcff',special?3.2:2.4,.36,[8,4]);for(let i=2;i<pts.length;i+=5){const p=pts[i];ctx.fillStyle='#d9f2cb';ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(p[0],p[1],3.6,1.5,Math.sin(i),0,7);ctx.fill();}}if(fx.fire){pathStroke(pts,'#ff9b56',special?4.6:3.6,.34,[2,5]);for(let i=2;i<pts.length;i+=3){const p=pts[i];ctx.fillStyle=i%2?'#ffd18d':'#ff7c4b';ctx.globalAlpha=.46;ctx.beginPath();ctx.arc(p[0]+Math.sin(i*1.6)*3,p[1]+Math.cos(i*1.2)*2,2.8,0,7);ctx.fill();}}ctx.restore();}
function drawAugmentedBody(pr,r,now,pulse){const fx=projectileAugments(pr);ctx.save();ctx.globalCompositeOperation='lighter';if(fx.power){ctx.strokeStyle='#ffd56a';ctx.globalAlpha=.75;ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(0,0,r*1.45,0,7);ctx.stroke();}if(fx.freeze){ctx.strokeStyle='#d8fbff';ctx.globalAlpha=.72;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*.9,0);ctx.lineTo(r*.9,0);ctx.moveTo(0,-r*.9);ctx.lineTo(0,r*.9);ctx.stroke();}if(fx.poison){for(let i=0;i<3;i++){const a=now*.006+i*2.09;ctx.fillStyle=i%2?'#c0f580':'#9a61db';ctx.globalAlpha=.5;ctx.beginPath();ctx.arc(Math.cos(a)*r*1.2,Math.sin(a)*r*.85,1.8,0,7);ctx.fill();}}if(fx.wind){ctx.strokeStyle='#f3ffff';ctx.globalAlpha=.5;ctx.lineWidth=1.9;ctx.beginPath();ctx.arc(0,0,r*(1.25+.05*Math.sin(now/90)),0,7);ctx.stroke();}if(fx.fire){ctx.strokeStyle='#ffb061';ctx.globalAlpha=.45;ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,r*(1.3+.08*Math.sin(now/70)),0,7);ctx.stroke();ctx.fillStyle='#ffe39e';ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(r*.15,-r*.15,r*.22,0,7);ctx.fill();}ctx.restore();}
function drawProjectile(pr,now){
 const dt=Math.min(.08,Math.max(0,(now-state.simAt)/1000)),x=pr.x+pr.vx*dt+state.wind*dt*dt*.5,y=pr.y+pr.vy*dt+165*dt*dt,style=SHOT_VISUALS[pr.character]||SHOT_VISUALS[0],special=pr.weapon==='special',pts=[...pr.trail,[x,y]],pulse=1+.12*Math.sin(now/70+pr.character),heading=Math.atan2(pr.vy,pr.vx);
 ctx.save();ctx.globalCompositeOperation='lighter';
 if(style.trail==='leaf'){pathStroke(pts,style.outer,special?9:6.5,.46);for(let i=1;i<pts.length;i+=3){const p=pts[i],a=i*.9;ctx.fillStyle=i%2?style.inner:style.spark;ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(p[0]+Math.cos(a)*4,p[1]+Math.sin(a)*4,3,1.4,a,0,7);ctx.fill();}}
 if(style.trail==='ribbon'){pathStroke(pts,style.outer,special?10:7,.36);const top=pts.map((p,i)=>[p[0],p[1]+Math.sin(i*.9+now*.012)*3]);pathStroke(top,style.inner,2.4,.75);for(let i=2;i<pts.length;i+=4){ctx.fillStyle=style.spark;ctx.globalAlpha=.48;ctx.beginPath();ctx.ellipse(pts[i][0],pts[i][1],2.8,1.4,i*.6,0,7);ctx.fill();}}
 if(style.trail==='mist'){for(let i=1;i<pts.length;i+=2){const p=pts[i],f=i/pts.length;ctx.fillStyle=i%4?style.outer:style.inner;ctx.globalAlpha=.08+.28*f;ctx.beginPath();ctx.arc(p[0]+Math.sin(i*2.3)*4,p[1]+Math.cos(i*1.7)*4,(special?10:7.5)*(0.55+f*.68),0,7);ctx.fill();}}
 if(style.trail==='streak'){pathStroke(pts,style.outer,special?8:5.6,.36);pathStroke(pts,style.spark,special?2.8:1.9,.92);}
 if(style.trail==='shard'){pathStroke(pts,style.outer,special?9:6.5,.38);pathStroke(pts,style.inner,2.8,.78);for(let i=2;i<pts.length;i+=4){const p=pts[i];ctx.fillStyle=style.spark;ctx.globalAlpha=.58;ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(i);ctx.fillRect(-2,-2,4,4);ctx.restore();}}
 if(style.trail==='flame'){pathStroke(pts,'#9c342b',special?16:11,.28);pathStroke(pts,style.outer,special?10:7.5,.56);pathStroke(pts,style.spark,3,.86);for(let i=3;i<pts.length;i+=4){const p=pts[i];ctx.fillStyle=style.inner;ctx.globalAlpha=.45;ctx.beginPath();ctx.arc(p[0]+Math.sin(i)*5,p[1]+Math.cos(i)*4,2.5,0,7);ctx.fill();}}
 if(style.trail==='frost'){pathStroke(pts,style.outer,special?10:7,.3);pathStroke(pts,style.inner,3,.8);for(let i=3;i<pts.length;i+=4){const p=pts[i];ctx.strokeStyle=style.spark;ctx.globalAlpha=.55;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(p[0]-4,p[1]);ctx.lineTo(p[0]+4,p[1]);ctx.moveTo(p[0],p[1]-4);ctx.lineTo(p[0],p[1]+4);ctx.stroke();}}
 if(style.trail==='electric'){const zig=pts.map((p,i)=>[p[0]+Math.sin(i*7.7+pr.age*25)*(i%2?5:-4),p[1]+Math.cos(i*5.1+pr.age*18)*(i%2?4:-5)]);pathStroke(zig,style.outer,special?9:6.5,.34);pathStroke(zig,style.spark,2.5,.9);}
 drawAugmentedTrail(pr,pts,now,special);
 ctx.restore();
 ctx.save();ctx.translate(x,y);ctx.rotate(heading);ctx.globalCompositeOperation='source-over';if(special){ctx.strokeStyle=style.spark;ctx.globalAlpha=.42;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,(pr.drawRadius+11)*pulse,0,7);ctx.stroke();ctx.globalAlpha=1;}
 const r=(pr.drawRadius||7)*(special?1.62:1.42);
 const spriteFrame=Math.floor(now/95+pr.character)%4,spriteSize=Math.max(special?40:34,r*(special?3.15:2.85));
 if(drawProjectileAsset(pr.character,special?'special':'normal',spriteFrame,0,0,spriteSize,0,1)){drawAugmentedBody(pr,r,now,pulse);ctx.restore();if(y<camera.y+12)text(`▲ ${Math.round(camera.y-y)}m`,Math.max(camera.x+60,Math.min(camera.x+camera.w-60,x)),camera.y+60,17,'#fff1ac');return;}
 if(style.shape==='seed'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.ellipse(0,0,r*1.18,r*.72,0,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.ellipse(-1,-1,r*.7,r*.4,0,0,7);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.ellipse(-r*.5,-r*.75,r*.42,r*.22,-.55,0,7);ctx.fill();}
 if(style.shape==='petal'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.ellipse(0,-r*.25,r*1.15,r*.58,.18,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.ellipse(0,r*.28,r*1.05,r*.52,-.18,0,7);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(r*.35,0,1.7,0,7);ctx.fill();}
 if(style.shape==='spore'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.arc(-r*.2,-r*.2,r*.68,0,7);ctx.fill();for(let i=0;i<3;i++){const a=now*.004+i*2.1;ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(Math.cos(a)*r*1.25,Math.sin(a)*r*.85,1.6,0,7);ctx.fill();}}
 if(style.shape==='dart'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.moveTo(r*1.45,0);ctx.lineTo(-r*.55,-r*.65);ctx.lineTo(-r*.9,0);ctx.lineTo(-r*.55,r*.65);ctx.closePath();ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.arc(-r*.2,0,r*.55,0,7);ctx.fill();}
 if(style.shape==='crystal'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.moveTo(r*1.2,0);ctx.lineTo(r*.35,-r);ctx.lineTo(-r*.75,-r*.55);ctx.lineTo(-r,0);ctx.lineTo(-r*.55,r*.8);ctx.lineTo(r*.45,r*.65);ctx.closePath();ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.moveTo(r*.75,0);ctx.lineTo(r*.12,-r*.55);ctx.lineTo(-r*.4,0);ctx.lineTo(r*.1,r*.45);ctx.closePath();ctx.fill();}
 if(style.shape==='ember'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.fillStyle=style.inner;ctx.beginPath();ctx.arc(r*.12,-r*.12,r*.68,0,7);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(r*.35,-r*.35,r*.24,0,7);ctx.fill();}
 if(style.shape==='ice'){ctx.fillStyle=style.outer;ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(r*.4,-r*.85);ctx.lineTo(-r*.45,-r*.8);ctx.lineTo(-r,0);ctx.lineTo(-r*.35,r*.78);ctx.lineTo(r*.45,r*.72);ctx.closePath();ctx.fill();ctx.strokeStyle=style.spark;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*.65,0);ctx.lineTo(r*.65,0);ctx.moveTo(0,-r*.65);ctx.lineTo(0,r*.65);ctx.stroke();}
 if(style.shape==='star'){ctx.fillStyle=style.outer;drawStar(0,0,r*1.15,r*.5,5);ctx.fill();ctx.fillStyle=style.inner;drawStar(0,0,r*.78,r*.32,5);ctx.fill();ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(0,0,1.8,0,7);ctx.fill();}
 drawAugmentedBody(pr,r,now,pulse);
 ctx.restore();if(y<camera.y+12)text(`▲ ${Math.round(camera.y-y)}m`,Math.max(camera.x+60,Math.min(camera.x+camera.w-60,x)),camera.y+60,17,'#fff1ac');
}
function drawBlast(e,age,now){const f=age/900;if(f>1)return;const style=SHOT_VISUALS[e.character]||SHOT_VISUALS[0],special=e.weapon==='special',r=e.radius*(.34+f*1.06);ctx.save();ctx.globalAlpha=1-f;ctx.globalCompositeOperation='lighter';burstParticles(style,e,age,now);const fx={power:e.boostVisual==='power',freeze:e.statusEffect==='freeze'||e.boostVisual==='freeze',poison:e.statusEffect==='poison'||e.boostVisual==='poison',wind:!!e.envWind||e.envType==='wind',fire:!!e.envFire||e.envType==='fire'};
 const assetFrame=Math.min(3,Math.floor(f*4)),assetSize=Math.max(78,e.radius*(1.55+f*.8));
 if(drawProjectileAsset(e.character,f<.28?'impact':'blast',assetFrame,e.x,e.y,assetSize,0,1-f*.12)){
  if(fx.power){ctx.strokeStyle='#ffd56a';ctx.lineWidth=4;ctx.globalAlpha=(1-f)*.45;ctx.beginPath();ctx.arc(e.x,e.y,r*1.08,0,7);ctx.stroke();}
  if(fx.freeze){ctx.strokeStyle='#dcffff';ctx.lineWidth=2;ctx.globalAlpha=(1-f)*.6;ctx.beginPath();ctx.arc(e.x,e.y,r*1.15,0,7);ctx.stroke();}
  if(fx.poison){ctx.strokeStyle='#b8ef87';ctx.lineWidth=3;ctx.globalAlpha=(1-f)*.42;ctx.beginPath();ctx.arc(e.x,e.y,r*1.12,0,7);ctx.stroke();}
  if(fx.wind){ctx.strokeStyle='#effcff';ctx.globalAlpha=(1-f)*.38;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,r*1.18,0,7);ctx.stroke();}
  if(fx.fire){ctx.strokeStyle='#ff9b56';ctx.globalAlpha=(1-f)*.38;ctx.lineWidth=7;ctx.beginPath();ctx.arc(e.x,e.y,r*1.1,0,7);ctx.stroke();}
  ctx.restore();return;
 }
 if(e.character===0){ctx.strokeStyle=style.inner;ctx.lineWidth=11;ctx.beginPath();ctx.arc(e.x,e.y,r,0,7);ctx.stroke();for(let j=0;j<15;j++){const a=j*2.399;ctx.fillStyle=j%2?style.inner:style.spark;ctx.beginPath();ctx.ellipse(e.x+Math.cos(a)*r*1.2,e.y+Math.sin(a)*r*.8-f*20,5,2,a,0,7);ctx.fill();}}
 else if(e.character===1){ctx.strokeStyle=style.inner;ctx.lineWidth=7;ctx.beginPath();ctx.arc(e.x,e.y,r*.85,0,7);ctx.stroke();for(let j=0;j<18;j++){const a=j*.83;ctx.fillStyle=j%2?style.outer:style.spark;ctx.beginPath();ctx.ellipse(e.x+Math.cos(a)*r*1.4,e.y+Math.sin(a)*r,6,2.6,a,0,7);ctx.fill();}}
 else if(e.character===2){for(let j=0;j<14;j++){const a=j*2.1,rr=r*(.3+(j%5)/5);ctx.fillStyle=j%2?style.outer:style.inner;ctx.globalAlpha=(1-f)*.45;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*rr,e.y+Math.sin(a)*rr*.7,10+f*9,0,7);ctx.fill();}}
 else if(e.character===3){ctx.strokeStyle=style.spark;ctx.lineWidth=4;for(let j=0;j<16;j++){const a=j*Math.PI/7;ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*r*.25,e.y+Math.sin(a)*r*.25);ctx.lineTo(e.x+Math.cos(a)*r*1.6,e.y+Math.sin(a)*r*1.2);ctx.stroke();}}
 else if(e.character===4){for(let j=0;j<16;j++){const a=j*1.7;ctx.fillStyle=j%2?style.inner:style.spark;ctx.save();ctx.translate(e.x+Math.cos(a)*r*1.25,e.y+Math.sin(a)*r*.9);ctx.rotate(a+f);ctx.fillRect(-5,-5,10,10);ctx.restore();}ctx.strokeStyle=style.outer;ctx.lineWidth=8;ctx.beginPath();ctx.arc(e.x,e.y,r,0,7);ctx.stroke();}
 else if(e.character===5){for(let j=0;j<18;j++){const a=j*.73,rr=r*(.3+(j%4)*.25);ctx.fillStyle=j%3?style.inner:style.spark;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*rr,e.y+Math.sin(a)*rr*.75-f*24,8+f*6,0,7);ctx.fill();}ctx.strokeStyle=style.outer;ctx.lineWidth=11;ctx.beginPath();ctx.arc(e.x,e.y,r,0,7);ctx.stroke();}
 else if(e.character===6){ctx.strokeStyle=style.spark;ctx.lineWidth=3.5;for(let j=0;j<12;j++){const a=j*Math.PI/6;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(a)*r*1.55,e.y+Math.sin(a)*r*1.18);ctx.stroke();}ctx.strokeStyle=style.inner;ctx.lineWidth=7;ctx.beginPath();ctx.arc(e.x,e.y,r*.82,0,7);ctx.stroke();}
 else {ctx.strokeStyle=style.spark;ctx.lineWidth=special?7:4;for(let j=0;j<9;j++){const a=j*.7;ctx.beginPath();ctx.moveTo(e.x,e.y);let px=e.x,py=e.y;for(let k=1;k<=4;k++){const rr=r*k/3.2,na=a+Math.sin(k*5+j)*.18;px=e.x+Math.cos(na)*rr;py=e.y+Math.sin(na)*rr*.8;ctx.lineTo(px,py);}ctx.stroke();}ctx.fillStyle=style.inner;drawStar(e.x,e.y,r*.6,r*.26,5);ctx.fill();}
 if(fx.power){ctx.strokeStyle='#ffd56a';ctx.lineWidth=4;ctx.globalAlpha=(1-f)*.44;ctx.beginPath();ctx.arc(e.x,e.y,r*1.08,0,7);ctx.stroke();}if(fx.freeze){ctx.strokeStyle='#dcffff';ctx.lineWidth=2;ctx.globalAlpha=(1-f)*.6;for(let a=0;a<6;a++){const ang=a*Math.PI/3;ctx.beginPath();ctx.moveTo(e.x+Math.cos(ang)*r*.2,e.y+Math.sin(ang)*r*.2);ctx.lineTo(e.x+Math.cos(ang)*r*1.2,e.y+Math.sin(ang)*r*1.2);ctx.stroke();}}if(fx.poison){for(let j=0;j<8;j++){const a=j*.8;ctx.fillStyle=j%2?'#c4f68d':'#9860d6';ctx.globalAlpha=(1-f)*.32;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*r*.85,e.y+Math.sin(a)*r*.55,5+f*3,0,7);ctx.fill();}}if(fx.wind){ctx.strokeStyle='#effcff';ctx.globalAlpha=(1-f)*.38;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,r*1.18,0,7);ctx.stroke();}if(fx.fire){ctx.strokeStyle='#ff9b56';ctx.globalAlpha=(1-f)*.38;ctx.lineWidth=7;ctx.beginPath();ctx.arc(e.x,e.y,r*1.1,0,7);ctx.stroke();} if(special&&f<.34){const punch=1-f/.34;ctx.globalAlpha=punch*.5;ctx.strokeStyle='#ffffff';ctx.lineWidth=2+punch*4;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(10,r*(.42+punch*.24)),0,7);ctx.stroke();ctx.globalAlpha=punch*.34;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(e.x,e.y,Math.max(4,r*.22),0,7);ctx.fill();}ctx.globalAlpha=(1-f)*.78;ctx.fillStyle=style.spark;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(8,r*.58),0,7);ctx.fill();ctx.globalAlpha=(1-f)*.28;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(e.x,e.y,Math.max(14,r*.9),0,7);ctx.fill();ctx.restore();}
function drawEnvColumns(now){
 for(const env of state.envs||[]){
  const life=Math.min(1,Math.max(0,(env.ends-now)/1200)),grow=Math.min(1,Math.max(0,(now-env.born)/420)),alpha=Math.min(life,grow);if(alpha<=0)continue;
  const isFire=env.type==='fire';
  const top=Math.max(-40,(env.top??0)-(isFire?320:280)),bottom=Math.min(E.H+40,(env.y??E.H)+(isFire?280:240)),h=Math.max(isFire?860:800,bottom-top),w=Math.max(isFire?150:132,env.radius*(isFire?4.9:4.2)),frame=Math.floor(now/120+env.id)%4;
  if(env.type==='wind')drawFxFrame('windColumns',state.map,frame,env.x-w/2,top,w,h,alpha*.96,env.dir<0);
  else drawFxFrame('boostColumns',state.map,frame,env.x-w/2,top,w,h,Math.min(1,alpha*1.05),false);
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
 else if(state.phase==='flight'){for(let i=state.events.length-1;i>=0;i--){const ev=state.events[i];if(ev.type==='blast'||ev.type==='land'||ev.type==='cut'){follow={x:ev.x,y:ev.y};break;}}}
 if(!camera.manual&&follow){camera.targetX=follow.x-camera.w*.5;camera.targetY=state.phase==='flight'?Math.max(-160,Math.min(90,follow.y-camera.h*.43)):Math.max(-40,Math.min(240,follow.y-camera.h*(canvas.clientWidth<720?.46:.62)));camera.x+=(camera.targetX-camera.x)*.16;camera.y+=(camera.targetY-camera.y)*.07;}
 if(panHeld){camera.manual=true;camera.x+=panHeld*18;}camera.x=Math.max(-160,Math.min(E.W+160-camera.w,camera.x));camera.y=Math.max(-160,Math.min(240,camera.y));
 const scale=canvas.height/camera.h,shake=directHitShake(now);ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle=E.MAPS[state.map].sky[0];ctx.fillRect(0,0,camera.w,camera.h);ctx.save();ctx.translate(shake.x,shake.y);backdrop(now);ctx.save();ctx.translate(-camera.x,-camera.y);terrain();
 state.drops.forEach(d=>drawDrop(d,now));state.players.forEach((p,i)=>drawPlayer(p,i,now));drawEnvColumns(now);
 if(canAct()){const p=mine(),m=E.muzzlePosition(state,p);ctx.strokeStyle='#b8efe444';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y-42,88,Math.PI,Math.PI*2);ctx.stroke();for(let deg=0;deg<=180;deg+=15){const r=deg*Math.PI/180;ctx.beginPath();ctx.moveTo(p.x+Math.cos(r)*82,p.y-42-Math.sin(r)*82);ctx.lineTo(p.x+Math.cos(r)*88,p.y-42-Math.sin(r)*88);ctx.stroke();}const angle=Number($('angle').value)*Math.PI/180;ctx.strokeStyle='#fff1a8bb';ctx.lineWidth=2;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(m.x+Math.cos(angle)*115*p.face,m.y-Math.sin(angle)*115);ctx.stroke();ctx.setLineDash([]);text(`${angleText()}°`,m.x+Math.cos(angle)*137*p.face,m.y-Math.sin(angle)*137,16,'#ffeab4');}
 for(const pr of state.projectiles)drawProjectile(pr,now);
 drawFx(now);ctx.restore();ctx.restore();drawMinimap();drawDial();
}
function hostTick(){
 const now=Date.now();if(state&&bridge.isHost){E.tick(state,now);const p=state.players[state.turn];
  if(state.phase==='aim'&&p?.cpu&&!p.falling&&state.deadline-now<8500&&cpuTurn!==state.turnSerial){cpuTurn=state.turnSerial;const aim=E.cpuAim(state);if(p.hp<p.maxHp*.35&&p.items.heal)E.command(state,p.sid,{seq:p.lastSeq+1,match:state.id,kind:'item',item:'heal'},now,bridge.hostSid);else if(state.round>=4&&state.turnSerial%4===0&&p.items.double)E.command(state,p.sid,{seq:p.lastSeq+1,match:state.id,kind:'item',item:'double'},now,bridge.hostSid);E.command(state,p.sid,{seq:p.lastSeq+1,match:state.id,kind:'fire',weapon:state.round%3===0?'special':'normal',...aim},now,bridge.hostSid);publish();}
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
  if(ev.type==='pickup'){toast(`${state.players.find(p=>p.sid===ev.sid)?.nick} · 보급 획득!`);playSfx('pickup',.38);}
  if(ev.type==='cut'){toast('낙하산 명중! 보급품 급강하');playSfx('cut',.4);}
  if(ev.type==='item')playSfx('item',.34);
  if(ev.type==='launch'){const rate=1+((ev.character||0)-3.5)*.018+(ev.weapon==='special'?.045:0);playSfx(`launch_${ev.character||0}_${ev.weapon==='special'?'special':'normal'}`,ev.weapon==='special'?.96:.86,rate);}
  if(ev.type==='blast'){const rate=1+((ev.character||0)-3.5)*.012+(ev.weapon==='special'?.03:0),baseVol=ev.weapon==='special'?.98:.92;playSfx(`impact_${ev.character||0}_${ev.weapon==='special'?'special':'normal'}`,Math.min(1,baseVol+(ev.direct?.06:0)),rate);if(ev.direct)playSfx('direct_hit',.7);else playSfx('terrain_crack',.48);}
 }}
 if(now>noticeUntil)$('notice').textContent='';if(now-uiAt>150){uiAt=now;renderUI();}draw(now+offset);requestAnimationFrame(loop);
}
if(!embedded){state=E.create([{sessionId:'local',nick:'나',seat:0}],Date.now()>>>0);roster=[{sessionId:'local',nick:'나',seat:0}];renderUI();}else send('bridge_ready');
setInterval(hostTick,16);requestAnimationFrame(loop);
})();

