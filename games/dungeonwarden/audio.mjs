import {roomAt} from './shared/world.mjs';
export function collectDoorSounds(map,previous,listener){const sounds=[],room=listener?roomAt(map,listener):null;if(map.mode!=='dungeon')return sounds;for(const r of map.rooms.filter(r=>r.id>0)){const old=previous.get(r.id);previous.set(r.id,!!r.locked);if(old===undefined||old===!!r.locked)continue;if(room&&(room.id===r.id||room.id===r.id-1))sounds.push(r.locked?'doorClose':'doorOpen');}return sounds;}
export class GameAudio {
  constructor(){this.enabled=true;this.musicVolume=.22;this.effectsVolume=.55;this.voices=[];this.seen=new Set();this.cool=new Map();this.unlocked=false;this.music=null;this.track=null;this.paths=null;this.pending=null;this.paused=true;this.lastTime=0;this.steps=new Map();this.doors=new Map();}
  async load(){const assets=globalThis.__DUNGEON_ASSETS__||(await (await fetch('assets/manifest.json')).json());this.sprite=assets.audioSprite;if(this.sprite){this.context??=new (window.AudioContext||window.webkitAudioContext)();const url=this.sprite.src.startsWith('data:')?this.sprite.src:'assets/'+this.sprite.src;this.buffer=await this.context.decodeAudioData(await (await fetch(url)).arrayBuffer());}this.paths=(globalThis.__DUNGEON_ASSETS__||(await (await fetch('assets/manifest.json')).json())).audio||{};}
  unlock(){this.unlocked=true;this.context?.resume();if(!this.paths)this.load().then(()=>{if(this.pending)this.update(this.pending,this.paused);});if(this.music&&!this.paused&&this.enabled)this.music.play().catch(()=>{});}
  src(key){const p=this.paths?.[key];return p?.startsWith('data:')?p:p?'assets/'+p:null;}
  play(key,volume=1,rate=1){
    if(!this.unlocked||!this.enabled||!this.paths||this.paused)return;
    const clip=this.sprite?.clips?.[key];if(clip&&this.buffer){const now=performance.now();if(now-(this.cool.get(key)||0)<70)return;this.cool.set(key,now);if(this.effectsVolume<=0)return;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffer;source.playbackRate.value=rate;gain.gain.value=Math.min(1,volume*this.effectsVolume);source.connect(gain);gain.connect(this.context.destination);this.voices=this.voices.filter(a=>!a.ended);if(this.voices.length>=10)this.voices.shift().pause();const voice={ended:false,pause:()=>{try{source.stop();}catch{}}};source.onended=()=>{voice.ended=true;gain.disconnect();};this.voices.push(voice);this.context.resume();source.start(0,clip.start,clip.duration);return;}const src=this.src(key);if(!src||this.effectsVolume<=0)return;const now=performance.now();if(now-(this.cool.get(key)||0)<70)return;this.cool.set(key,now);
    this.voices=this.voices.filter(a=>!a.ended);if(this.voices.length>=10){this.voices.shift().pause();}
    const a=new Audio(src);a.volume=Math.min(1,volume*this.effectsVolume);a.playbackRate=rate;this.voices.push(a);a.play().catch(()=>{});
  }
  setTrack(key){
    if(this.track===key)return;this.track=key;if(this.music){this.music.pause();this.music=null;}
    const src=this.src(key);if(src){this.music=document.getElementById('backgroundMusic')||new Audio();this.music.src=src;this.music.loop=true;this.music.volume=this.musicVolume;if(this.enabled&&this.unlocked&&!this.paused)this.music.play().catch(()=>{});}
  }
  settings({enabled=this.enabled,music=this.musicVolume,effects=this.effectsVolume}={}){this.enabled=enabled;this.musicVolume=music;this.effectsVolume=effects;if(this.music){this.music.volume=music;if(!enabled)this.music.pause();else if(this.unlocked&&!this.paused)this.music.play().catch(()=>{});}if(!enabled)this.voices.forEach(a=>a.pause());}
  stop(){this.paused=true;this.music?.pause();this.voices.forEach(a=>a.pause());this.pending=null;}
  reset(){this.stop();this.seen.clear();this.steps.clear();this.doors.clear();this.cool.clear();this.voices=[];this.track=null;this.music=null;this.lastTime=0;}
  update(s,paused=false){
    this.pending=s;this.paused=paused||!!s.result||s.phase==='planning';
    const doorSounds=collectDoorSounds(s.map,this.doors,s.me||s.entities.find(e=>e.id===s.possession));
    if(!this.paths||!this.unlocked)return;
    const focus=s.me||s.entities.find(e=>e.id===s.possession)||{x:s.map.rooms[2].x+12,y:12};
    const boss=s.entities.some(e=>e.boss&&!e.dead&&e.room===focus.room);
    this.setTrack(boss?'musicBoss':'musicExplore');
    if(this.music){this.music.volume=this.musicVolume;if(this.paused||!this.enabled)this.music.pause();else if(this.music.paused)this.music.play().catch(()=>{});}
    if(this.paused){this.voices.forEach(a=>a.pause());return;}
    for(const key of doorSounds)this.play(key,.85);
    const fxKeys={skillCharge:'cast',ward:'heal',breadrise:'breadHit',candyburst:'candyHit',panclang:'panHit',pulse:'magic',moonheal:'heal',slash:'swing',shoot:'magic',hit:'hit',block:'block',heal:'heal',cast:'cast',chest:'chest',death:'death',slam:'impact',spin:'swing',meteor:'impact',thunder:'thunder',lightning:'thunder',fireball:'impact',dash:'dash',trap:'impact',equip:'pickup',poison:'magic',acid:'magic',vines:'cast'};
    for(const f of s.effects){if(this.seen.has(f.id))continue;this.seen.add(f.id);const d=Math.hypot(f.x-focus.x,f.y-focus.y);if(d>20&&s.masterId!=='local')continue;const key=f.kind==='equip'&&f.sound?f.sound:f.feedback&&['slash','spin'].includes(f.kind)?f.feedback.swing:f.feedback&&['hit','slam'].includes(f.kind)?f.feedback.hit:f.kind==='shoot'&&f.weapon==='bow'?'bow':fxKeys[f.kind];if(key)this.play(key,Math.max(.12,1-d/22),f.kind==='slash'?.92+Math.random()*.15:1);}
    if(this.seen.size>1500)this.seen=new Set(s.effects.map(f=>f.id));
    if(s.me&&!s.me.dead){const old=this.steps.get(s.me.id);if(old&&Math.hypot(s.me.x-old.x,s.me.y-old.y)>.15&&s.time-(old.at||0)>.28){this.play('step',.25);this.steps.set(s.me.id,{x:s.me.x,y:s.me.y,at:s.time});}else if(!old)this.steps.set(s.me.id,{x:s.me.x,y:s.me.y,at:s.time});}
    this.lastTime=s.time;
  }
}
