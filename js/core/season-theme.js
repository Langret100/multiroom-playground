(function(){
'use strict';
const lunar={2026:['02-17','09-25'],2027:['02-07','09-15'],2028:['01-27','10-03'],2029:['02-13','09-22'],2030:['02-03','09-12']};
function choose(y,m,d){
 const today=Date.UTC(y,m-1,d),events=[['halloween','10-31'],['christmas','12-25']];
 if(lunar[y])events.push(['seollal',lunar[y][0]],['chuseok',lunar[y][1]]);
 for(const [id,md]of events){const [mm,dd]=md.split('-').map(Number),delta=(Date.UTC(y,mm-1,dd)-today)/86400000;if(delta>=0&&delta<=14)return id;}
 return m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';
}
if(typeof module==='object'&&module.exports){module.exports={choose,lunar};return;}
if(!document.body.matches('.page-lobby,.page-room'))return;
let id;try{id=sessionStorage.getItem('mp-season-v1');if(performance.getEntriesByType('navigation')[0]?.type==='reload')id=null;}catch(_){}
if(!id){const p=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date()),v=Object.fromEntries(p.map(x=>[x.type,x.value]));id=choose(+v.year,+v.month,+v.day);try{sessionStorage.setItem('mp-season-v1',id);}catch(_){}}
// Local preview is never enabled on the published site.
if(['localhost','127.0.0.1'].includes(location.hostname)){const q=new URLSearchParams(location.search).get('theme');if(['spring','summer','autumn','winter','halloween','christmas','seollal','chuseok'].includes(q))id=q;}
function attachSeasonMotion(theme){
 document.body.dataset.motionSeason=theme;
 const snow=['winter','christmas'].includes(theme),fall=['spring','autumn'].includes(theme),rise=theme==='summer';
 if(!snow&&!fall&&!rise)return;
 const snowShape='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke-linecap="round" stroke-linejoin="round">'+[...Array(6)].map((_,i)=>'<g transform="rotate('+i*60+' 32 32)"><path d="M32 32V6M32 14L25 9M32 14L39 9M32 23L24 17M32 23L40 17" stroke="#7399bd" stroke-opacity=".5" stroke-width="3.6"/><path d="M32 32V6M32 14L25 9M32 14L39 9M32 23L24 17M32 23L40 17" stroke="#fff" stroke-width="2"/></g>').join('')+'<path d="M32 27L36.3 29.5V34.5L32 37L27.7 34.5V29.5Z" stroke="#eefaff" stroke-width="2"/></g></svg>';
 const snowImage='url("data:image/svg+xml,'+encodeURIComponent(snowShape)+'")';
 const style=document.createElement('style');style.textContent=`
 .theme-motion-layer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:4;}
 .theme-particle{position:absolute;top:-20px;left:var(--x);width:var(--size);height:var(--size);animation:theme-fall var(--duration) linear infinite;animation-delay:var(--delay);pointer-events:none;}
 .theme-particle.snow{background-image:${snowImage};background-size:contain;background-repeat:no-repeat;opacity:.9;filter:drop-shadow(0 0 2px #d8efff);}
 .theme-particle.petal{background:#edacc4;border:1px solid #d887a7;border-radius:80% 12% 80% 12%;opacity:.65;}
 .theme-particle.leaf{background:#bf7437;border:1px solid #956137;border-radius:85% 10% 85% 10%;opacity:.6;}
 .theme-particle.bubble{top:auto;bottom:-20px;border:1px solid #6ab5c4;background:#fff4;border-radius:50%;opacity:.55;animation-name:theme-rise;}
 @keyframes theme-fall{0%{transform:translate3d(0,-20px,0) rotate(var(--angle))}50%{transform:translate3d(var(--sway),50vh,0) rotate(calc(var(--angle) + 65deg))}100%{transform:translate3d(var(--drift),105vh,0) rotate(calc(var(--angle) + 145deg))}}
 @keyframes theme-rise{to{transform:translate3d(var(--drift),-105vh,0)}}
 body.in-game .theme-motion-layer{display:none;}body[data-motion-hidden] .theme-particle{animation-play-state:paused;}
 @media(max-width:600px){.theme-particle:nth-child(n+5){display:none;}}
 @media(prefers-reduced-motion:reduce){.theme-motion-layer{display:none;}}
 `;document.head.append(style);
 const layer=document.createElement('div');layer.className='theme-motion-layer';layer.setAttribute('aria-hidden','true');
 const count=snow?12:6;
 for(let i=0;i<count;i++){const p=document.createElement('i');const duration=14+Math.random()*15;p.className='theme-particle '+(snow?'snow':rise?'bubble':theme==='spring'?'petal':'leaf');p.style.cssText='--x:'+(3+Math.random()*94)+'%;--size:'+((snow?11:6)+Math.random()*(snow?9:7))+'px;--duration:'+duration+'s;--delay:-'+(Math.random()*duration)+'s;--sway:'+(Math.random()*48-24)+'px;--drift:'+(Math.random()*56-28)+'px;--angle:'+(Math.random()*360)+'deg';layer.append(p);}
 document.body.append(layer);
 const visibility=()=>{if(document.hidden)document.body.dataset.motionHidden='';else delete document.body.dataset.motionHidden;};document.addEventListener('visibilitychange',visibility);visibility();
}
attachSeasonMotion(id);

if(id==='spring')return;
const themes={
 summer:{name:'여름',accent:'#168a9c',ink:'#183f49',paper:'#f2fcff',line:'#95ced4',radius:20,motif:'◌',tile:[1,0]},
 autumn:{name:'가을',accent:'#a76537',ink:'#49362b',paper:'#fff8ed',line:'#ddbc92',radius:13,motif:'❧',tile:[2,0]},
 winter:{name:'겨울',accent:'#527ea9',ink:'#304763',paper:'#f6fbff',line:'#b4c9de',radius:18,motif:'❄',tile:[3,0]},
 halloween:{name:'할로윈',accent:'#d76a16',ink:'#35271f',paper:'#fff3e7',line:'#dd8b43',radius:16,motif:'🎃',tile:[0,1]},
 christmas:{name:'크리스마스',accent:'#286347',ink:'#213d30',paper:'#f8fffc',line:'#88b49c',radius:16,motif:'✦',tile:[1,1]},
 seollal:{name:'설날',accent:'#ae454a',ink:'#4b3835',paper:'#fff9ee',line:'#d8b07c',radius:9,motif:'◇',tile:[2,1]},
 chuseok:{name:'추석',accent:'#94712d',ink:'#4a402e',paper:'#fffaf0',line:'#d4bd8d',radius:12,motif:'◐',tile:[3,1]}
};const t=themes[id];if(!t)return;const art={texture:'none'};const skin=['summer','autumn','winter','halloween','christmas','seollal','chuseok'].indexOf(id)*100/6;const ornament=['spring','summer','autumn','winter','halloween','christmas','seollal','chuseok'].indexOf(id);const attachment=(ornament%4)*100/3+'% '+Math.floor(ornament/4)*100+'%';
document.body.dataset.season=id;
const selector='body[data-season]:not(.in-game)';
const css=document.createElement('style');css.id='season-theme-style';css.textContent=`
${selector}{--accent:${t.accent};--text:${t.ink};--muted:${t.ink}b3;--panel:${t.paper}d1;--line:${t.line};--radius:${t.radius}px;--bg1:${t.paper};--bg2:${t.paper};--shadow:0 5px 20px ${t.ink}12;}
${selector}::before{background-image:url('assets/themes/seasons.webp');background-size:max(400vw,400vh) max(200vw,200vh);background-position:${t.tile[0]*100/3}% ${t.tile[1]*100}%;opacity:.55;}
${selector} :is(.panel,.modal,.createRoomModal,.selectedGameSummary){background-color:${t.paper}d1!important;background-image:${art.texture}!important;border:1px solid ${t.line}!important;border-radius:${t.radius}px!important;box-shadow:0 5px 18px ${t.ink}12!important;color:${t.ink}!important;}
${selector} :is(.panel,.modal){position:relative;}
${selector} :is(.panelHeader,.modalHeader,.createRoomHeader,.lobbySectionHead,.legendRow,.playersPanel>.controls,.createRoomFooter){background-color:${t.paper}65!important;background-image:${art.texture}!important;border-bottom:1px solid ${t.line}90!important;color:${t.ink}!important;}
${selector} :is(.chatLog,.pRow,.createGameCard,.selectedGameSummary,thead){background:${t.paper}25!important;}
${selector} :is(.btn.start,.gameCardCheck){background:${t.accent}!important;color:white!important;border-color:${t.accent}!important;}
${selector} button:disabled{opacity:.45;}
${selector} :is(input,select,textarea){background:${t.paper}!important;color:${t.ink}!important;border-color:${t.line}!important;border-radius:${Math.max(6,t.radius-5)}px!important;}
${selector} :is(input,select,textarea,button):focus-visible{outline:2px solid ${t.accent};outline-offset:2px;}
${selector} :is(.btn,button,.playerCountChip){border-color:${t.line};border-radius:${Math.max(7,t.radius-5)}px;color:${t.ink};}
${selector} :is(.btn.primary,button.primary,.createSubmitBtn){background:linear-gradient(135deg,${t.accent},${t.ink})!important;color:#fff!important;border:1px solid ${t.accent}!important;box-shadow:0 3px 8px ${t.accent}25!important;}
${selector} :is(.createGameCard.selected,.playerCountChip.selected){border-color:${t.accent}!important;background:${t.line}25!important;box-shadow:0 0 0 2px ${t.accent}20!important;}
${selector} .gameCardCheck{background:${t.accent}!important;}
body[data-season=seollal]:not(.in-game) :is(.panel,.modal),body[data-season=chuseok]:not(.in-game) :is(.panel,.modal){border-top:1px solid ${t.line}!important;}
body[data-season=winter]:not(.in-game) :is(.panel,.modal){border-top-color:#fff!important;}
body[data-season][data-season=christmas]:not(.in-game) :is(.btn.primary,button.primary){background-color:#a82735!important;border-color:#bc3941!important;}
body[data-season][data-season=christmas]:not(.in-game) .topbar{background-color:#17452dd9!important;color:white!important;}
body[data-season][data-season=christmas]:not(.in-game) .topbar .iconbtn{background:#fff8!important;border-color:#fff8!important;}
body[data-season][data-season=halloween]:not(.in-game) :is(.panelHeader,.lobbySectionHead,.modalHeader){background-color:#30251edf!important;color:#fff1dc!important;}
body[data-season][data-season=halloween]:not(.in-game) :is(.panelHeader h2,.lobbySectionHead h1,.lobbySectionHead p,.modalHeader){color:#fff1dc!important;}
body[data-season][data-season=halloween]:not(.in-game) .btn.primary{background:#d96d1a!important;color:#21170d!important;border-color:#f49e48!important;}
body[data-season][data-season=halloween]:not(.in-game)::before{filter:sepia(.8) saturate(.6);}
body[data-season][data-season=christmas]:not(.in-game) .panelHeader{border-bottom:2px solid #af3140!important;}
body[data-season][data-season]:not(.in-game) :is(.btn.primary,button.primary,.btn.start,.createSubmitBtn){position:relative;overflow:visible;background-color:${t.accent}!important;background-image:none!important;border-color:${t.accent}!important;color:white!important;text-shadow:none;}
${selector} .panel::before{content:'';position:absolute;pointer-events:none;top:-7px;bottom:auto;left:-7px;right:auto;width:112px;height:112px;transform:none;background-image:url('assets/themes/attachments.webp');background-size:400% 200%;background-position:${attachment};opacity:.6;z-index:2;}
${selector} :is(.lobbySectionHead,.panelHeader){position:relative;z-index:auto;}
${selector} .modal::before{content:none;}
body[data-season][data-season=winter]:not(.in-game) :is(.btn,.iconbtn),body[data-season][data-season=christmas]:not(.in-game) :is(.btn,.iconbtn){position:relative;overflow:visible;}

${selector} :is(.lobbySectionHead,.panelHeader)>*{position:relative;z-index:3;}
body[data-season][data-season]:not(.in-game) :is(.btn.primary,.btn.start,.createSubmitBtn,#roomChatSend){background-image:url('assets/themes/buttons.webp')!important;background-repeat:no-repeat!important;background-origin:border-box!important;background-clip:border-box!important;box-shadow:none!important;color:white!important;background-size:800% 567.1875%!important;background-position:${ornament*100/7}% 0%!important;background-color:transparent!important;border-color:transparent!important;}
body[data-season][data-season]:not(.in-game) :is(#readyBtn,#startBtn){background-size:800% 355.88235%!important;background-position:${ornament*100/7}% 24.52107%!important;}
body[data-season][data-season]:not(.in-game) :is(#chatSend,#roomChatSend){background-size:800% 184.26396%!important;background-position:${ornament*100/7}% 100%!important;}
${selector} :is(.btn,.createSubmitBtn)::after,${selector} :is(.btn,.createSubmitBtn)::before{content:none!important;}

body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) .panel::after{content:'';position:absolute;pointer-events:none;left:0;right:0;top:-12px;height:28px;z-index:4;background-image:url('assets/themes/snow-cap.webp'),linear-gradient(to bottom,transparent 35%,#fbfdff 35%,#fbfdff 70%,transparent 70%);background-position:top center;background-size:104% 100%,100% 100%;background-repeat:no-repeat;}
body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) :is(.btn.primary,.btn.start,.createSubmitBtn,#roomChatSend)::before{content:''!important;position:absolute;pointer-events:none;left:-3px;right:-3px;top:-16px;height:25px;z-index:4;background:url('assets/themes/snow-cap.webp') top center/100% 100% no-repeat;}
body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) :is(#chatSend,#roomChatSend)::before{height:17px;top:-8px;}

body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) .topbar{position:relative;isolation:isolate;}
body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) .topbar::after{content:'';position:absolute;pointer-events:none;left:0;right:0;top:-20px;height:28px;z-index:4;background-image:url('assets/themes/snow-cap.webp'),linear-gradient(to bottom,transparent 35%,#fbfdff 35%,#fbfdff 70%,transparent 70%);background-position:top center;background-size:104% 100%,100% 100%;background-repeat:no-repeat;}
body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) .panelHeader:has(#onlineKpi)::after{content:'';position:absolute;pointer-events:none;left:0;right:0;top:-13px;height:26px;z-index:4;background-image:url('assets/themes/snow-cap.webp'),linear-gradient(to bottom,transparent 35%,#fbfdff 35%,#fbfdff 70%,transparent 70%);background-position:top center;background-size:104% 100%,100% 100%;background-repeat:no-repeat;}
body[data-season][data-season]:is([data-season=winter],[data-season=christmas]):not(.in-game) :is(.panel,.panelHeader:has(#onlineKpi)){border-top-color:transparent!important;}
.season-snow{position:fixed;top:-16px;left:var(--snow-x);width:var(--snow-size);height:var(--snow-size);background:#fff;border-radius:50%;box-shadow:0 0 1px #62829c;opacity:.55;pointer-events:none;z-index:3;animation:season-snowfall var(--snow-time) linear infinite;animation-delay:var(--snow-delay);}
body.in-game .season-snow{display:none;animation:none;}
body[data-theme-hidden] .season-snow{animation-play-state:paused;}
@keyframes season-snowfall{to{transform:translate(18px,105vh)}}
@media(max-width:600px){.season-snow:nth-child(n+5){display:none;}${selector}::before{opacity:.55;}${selector} :is(.panel,.modal){box-shadow:none!important;}}
@media(prefers-reduced-motion:reduce){.season-snow{display:none;}}
`;document.head.append(css);
// Decode the shared atlas once. Only three small crops are generated for the active theme.
// Nine-slice borders preserve edge art when responsive buttons become wider.
const buttonAtlas=new Image();buttonAtlas.onload=()=>{
 const rules=[];
 for(const [y,h,target] of [[0,64,':is(.btn.primary,.btn.start,.createSubmitBtn)'],[64,102,':is(#readyBtn,#startBtn)']]){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=h;
  const context=canvas.getContext('2d');if(!context)continue;
  context.drawImage(buttonAtlas,ornament*256,y,256,h,0,0,256,h);
  const source=canvas.toDataURL('image/webp',.8);
  rules.push('body[data-season][data-season]:not(.in-game) '+target+'{background-image:none!important;border-image-source:url("'+source+'")!important;border-image-slice:0 80 fill!important;border-image-width:0 42px!important;border-image-outset:0!important;border-image-repeat:stretch!important;}');
 }
 rules.push('body[data-season][data-season]:not(.in-game) :is(#chatSend,#roomChatSend){border-image:none!important;background-image:url("assets/themes/buttons.webp")!important;}');
 const fit=document.createElement('style');fit.textContent=rules.join('\n');document.head.append(fit);
};buttonAtlas.src='assets/themes/buttons.webp';

const marks={"summer":{"music":[0,24],"sfx":{"click":[24.1,24.22],"readyOn":[24.32,24.67],"readyOff":[24.77,25.07],"start":[25.17,25.82],"win":[25.92,26.82],"lose":[26.92,27.52]}},"autumn":{"music":[27.62,51.62],"sfx":{"click":[51.72,51.84],"readyOn":[51.94,52.29],"readyOff":[52.39,52.69],"start":[52.79,53.44],"win":[53.54,54.44],"lose":[54.54,55.14]}},"winter":{"music":[55.24,79.24],"sfx":{"click":[79.34,79.46],"readyOn":[79.56,79.91],"readyOff":[80.01,80.31],"start":[80.41,81.06],"win":[81.16,82.06],"lose":[82.16,82.76]}},"halloween":{"music":[82.86,106.86],"sfx":{"click":[106.96,107.08],"readyOn":[107.18,107.53],"readyOff":[107.63,107.93],"start":[108.03,108.68],"win":[108.78,109.68],"lose":[109.78,110.38]}},"christmas":{"music":[110.48,134.48],"sfx":{"click":[134.58,134.7],"readyOn":[134.8,135.15],"readyOff":[135.25,135.55],"start":[135.65,136.3],"win":[136.4,137.3],"lose":[137.4,138]}},"seollal":{"music":[138.1,162.1],"sfx":{"click":[162.2,162.32],"readyOn":[162.42,162.77],"readyOff":[162.87,163.17],"start":[163.27,163.92],"win":[164.02,164.92],"lose":[165.02,165.62]}},"chuseok":{"music":[165.72,189.72],"sfx":{"click":[189.82,189.94],"readyOn":[190.04,190.39],"readyOff":[190.49,190.79],"start":[190.89,191.54],"win":[191.64,192.54],"lose":[192.64,193.24]}}},range=marks[id],manager=window.AudioManager;
if(!manager)return;
const original=manager.attachAudioManager.bind(manager);const active=new Set();let gesture=false;
const blocked=()=>document.body.classList.contains('in-game')||document.hidden;
manager.attachAudioManager=function(el,opts={}){
 if(!['bgmLobby','bgmBattle'].includes(el.id))return original(el,opts);
 const key=opts.storageKey||'audio_enabled';el.src='assets/themes/audio.mp3';el.preload='none';el.loop=false;el.volume=opts.volume??.09;el.muted=false;
 const [start,end]=range.music;
 function seek(){if(el.readyState&& (el.currentTime<start||el.currentTime>=end))el.currentTime=start;}
 function play(){if(!gesture||blocked()||!manager.isEnabled(key))return;seek();el.play().catch(()=>{});}
 el.addEventListener('loadedmetadata',seek);el.addEventListener('timeupdate',()=>{if(el.currentTime>=end-.05){el.currentTime=start;}});
 const handle={enable(){manager.setEnabled(key,true);play();},disable(){manager.setEnabled(key,false);el.pause();},sync(){manager.isEnabled(key)?play():el.pause();},stop(){el.pause();},resume:play};active.add(handle);
 window.addEventListener('storage',e=>{if(e.key===key)handle.sync();});return handle;
};
const fx=new Audio();fx.preload='none';fx.src='assets/themes/audio.mp3';fx.volume=.22;let fxEnd=0,fxTimer=0;
fx.addEventListener('timeupdate',()=>{if(fx.currentTime>=fxEnd)fx.pause();});
const sfx=window.SFX||{};for(const key of Object.keys(range.sfx)){const old=sfx[key];sfx[key]=function(){if(document.body.classList.contains('in-game')){old?.();return;}if(!manager.isEnabled('audio_enabled')||document.hidden)return;const [a,b]=range.sfx[key];fxEnd=b;function start(){clearTimeout(fxTimer);fx.currentTime=a;fx.play().then(()=>{fxTimer=setTimeout(()=>fx.pause(),Math.max(0,b-fx.currentTime)*1000);}).catch(()=>{});}if(fx.readyState)start();else{fx.addEventListener('loadedmetadata',start,{once:true});fx.load();}};}
window.SFX=sfx;
function unlock(){gesture=true;active.forEach(h=>h.resume());}
document.addEventListener('pointerdown',unlock,{once:true,capture:true});document.addEventListener('keydown',unlock,{once:true,capture:true});
function sync(){if(document.hidden)document.body.dataset.themeHidden='';else delete document.body.dataset.themeHidden;if(blocked()){active.forEach(h=>h.stop());fx.pause();}else active.forEach(h=>h.resume());}
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',()=>{active.forEach(h=>h.stop());fx.pause();});
})();
