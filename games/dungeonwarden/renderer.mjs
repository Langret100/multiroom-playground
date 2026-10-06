import {CombatEffects} from './combat-effects.mjs';
import {weaponPose} from './shared/weapon-poses.mjs';
import {Map3D,MAP_Y_SCALE} from './map3d.mjs';
import {RARITY_COLORS,WEAPONS} from './shared/catalog.mjs';
import {weaponPreview} from './shared/combat.mjs';
import {paintWeapon,paintWear,paintItemIcon,paintEffect,traceAttackShape} from './graphics.mjs';
import {walkable,lineOfSight,inside} from './shared/world.mjs';
import {CharacterRenderer} from './character-runtime.mjs?v=0.6.0';
const palette=['#79d5c1','#e99a83','#8caee9','#ddb477','#ae99e4','#e4a8c2','#a7c578','#84bdd1'];
export function minimapLayout(map,width){const w=width<500?150:200,h=Math.max(44,Math.min(118,w*map.height/map.width)),x=18,y=115,scale=Math.min(w/map.width,h/map.height);return {x,y,w,h,scale,mx:x+(w-map.width*scale)/2,my:y+(h-map.height*scale)/2};}
export class Renderer {
  constructor(canvas){this.canvas=canvas;this.map3d=new Map3D();this.projectionY=MAP_Y_SCALE;this.ctx=canvas.getContext('2d');this.camera={x:30,y:30,scale:20};this.overview=false;this.masterRoom=2;this.sprites={};this.manifest={sprites:{}};this.tracks=new Map();this.renderPositions=new Map();this.lootVisuals=new Map();this.fogAt=-1;this.fogPaths=[];this.selected=null;this.preview=null;this.aim=null;this.shakeEnabled=true;this.rangeEnabled=true;this.shakeX=0;this.shakeY=0;this.shakeStrength=0;this.shakeLife=0;this.fxSeen=new Set();this.hitStop=0;this.loadAssets();this.resize();}
  resize(){const ratio=Math.min(1.5,devicePixelRatio||1);this.width=innerWidth;this.height=innerHeight;this.canvas.width=Math.round(this.width*ratio);this.canvas.height=Math.round(this.height*ratio);this.ctx.setTransform(ratio,0,0,ratio,0,0);this.ctx.imageSmoothingEnabled=false;}
  async loadAssets(){try{this.manifest=globalThis.__DUNGEON_ASSETS__||await (await fetch('assets/manifest.json')).json();this.characters=new CharacterRenderer(this.canvas);await this.characters.load(this.manifest.characters);await CombatEffects.load(this.manifest.effectAssets);await Promise.all(Object.entries(this.manifest.sprites||{}).map(([key,data])=>new Promise(resolve=>{const image=new Image();image.onload=()=>{this.sprites[key]={image,...data};resolve();};image.onerror=()=>resolve();image.src=data.src.startsWith('data:')?data.src:new URL('assets/'+data.src,location.href).href;})));if(this.manifest.terrain){const image=new Image();image.src=this.manifest.terrain.src.startsWith('data:')?this.manifest.terrain.src:'assets/'+this.manifest.terrain.src;await new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;});this.terrain=image;} }catch(error){console.error('Asset loading failed',error);}}
  worldPoint(x,y){const c=this.camera;return {x:(x-this.width/2-this.shakeX)/c.scale+c.x,y:(y-this.height/2-this.shakeY)/(c.scale*this.projectionY)+c.y};}
  screenPoint(p){const c=this.camera;return {x:(p.x-c.x)*c.scale+this.width/2,y:(p.y-c.y)*c.scale*this.projectionY+this.height/2};}
  direction(angle){const x=Math.cos(angle),y=Math.sin(angle);return Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up';}
  frameSprite(key,e,now,motion,at=e,visualTime=now){
    const asset=this.sprites[key];if(!asset)return false;
    const direction=this.direction(e.facing||0),animation=asset.animations?.[motion]||asset.animations?.idle;
    const frames=animation?.directions?.[direction];if(!frames?.length)return false;
    const phase=motion==='attack'&&e.attackPose?Math.min(frames.length-1,Math.floor((1-e.attackPose/.25)*frames.length)):Math.floor(visualTime*(animation.fps||8))%frames.length;
    const frame=frames[phase],fw=asset.frameWidth,fh=asset.frameHeight,cols=Math.floor((asset.sourceRect?.[2]||asset.image.width)/fw);
    const anchor=asset.anchor||[.5,.9],h=asset.heightSteps||2.8,w=h*fw/fh;
    this.ctx.save();if(asset.flipRight&&direction==='right'){this.ctx.translate(at.x*2,0);this.ctx.scale(-1,1);}this.ctx.drawImage(asset.image,(asset.sourceRect?.[0]||0)+(frame%cols)*fw,(asset.sourceRect?.[1]||0)+Math.floor(frame/cols)*fh,fw,fh,at.x-w*anchor[0],at.y-h*anchor[1],w,h);this.ctx.restore();return true;
  }
  drawActor(e,now,index,visualTime=this.visualClock??now){
    if(e.kind==='monster'&&e.dead)return;
    const ctx=this.ctx,move=this.tracks.get(e.id),mx=move?e.x-move.x:0,my=move?e.y-move.y:0,delta=Math.hypot(mx,my),changed=!!move&&delta>.0025;
    const isLocal=e.id==='local',inputMoving=isLocal&&typeof e.visualMoving==='boolean'?e.visualMoving:null;
    const movingUntil=changed?visualTime+.15:(move?.movingUntil||0),moving=inputMoving??(movingUntil>visualTime);
    // The local actor already carries the current input-facing from RoomTransport.
    // Never infer its facing again from the smoothed render delta: on a reversal the
    // render position keeps drifting toward the previous target for a few frames and
    // would otherwise flip old/new directions every frame (the visible spin/jitter).
    // Remote actors still derive walking direction from travel, but only commit a new
    // direction after a meaningful displacement so packet jitter cannot rotate them.
    let moveFacing=move?.moveFacing??e.facing??0;
    if(isLocal){
      moveFacing=Number.isFinite(e.visualMoveFacing)?e.visualMoveFacing:(e.facing??moveFacing);
    }else if(changed&&delta>.018){
      const candidate=Math.atan2(my,mx),prevDir=this.direction(moveFacing),nextDir=this.direction(candidate);
      if(prevDir===nextDir){moveFacing=candidate;}
      else{
        const since=move?.turnCandidate===nextDir?(move.turnCandidateSince||visualTime):visualTime;
        if(move?.turnCandidate===nextDir&&visualTime-since>=.045)moveFacing=candidate;
      }
    }
    const useMoveFacing=moving&&!e.attackPose&&!e.cast&&!e.whirl&&!e.blocking;
    const visualEntity=useMoveFacing?{...e,facing:moveFacing}:e;
    const motion=e.dead?'ghost':e.cast?'cast':e.hitPose?'hit':e.attackPose?'attack':moving?'walk':'idle';
    const color=e.kind==='monster'?e.boss?'#bf7b79':e.type==='treasure'?'#e9c34e':e.type==='slime'?'#8fb768':e.type==='spectre'?'#a491cf':'#ad9b7f':palette[index%palette.length];
    const bob=moving?Math.sin(visualTime*13.5)*.06:Math.sin(visualTime*3)*.025;
    ctx.save();ctx.translate(e.x,e.y);ctx.scale(1,1/this.projectionY);ctx.translate(-e.x,-e.y);ctx.globalAlpha=e.afterimage|| (e.dead?.45:1);if(e.spawnRevealUntil>now)ctx.globalAlpha*=Math.max(.2,1-(e.spawnRevealUntil-now)/1.4);if(e.hitPose>0){ctx.filter='brightness(2.2) saturate(.4)';ctx.translate(Math.sin(e.hitPose*100)*.07,0);};
    // A radial CanvasGradient per actor per frame becomes expensive with 8 players and
    // a full monster wave. A soft translucent ellipse is visually equivalent at this
    // game scale and removes dozens of gradient allocations every frame.
    ctx.fillStyle='#060b1438';ctx.save();ctx.translate(e.x,e.y+.16);ctx.scale(1,.4);ctx.beginPath();ctx.arc(0,0,.7,0,Math.PI*2);ctx.fill();ctx.restore();
    const layers=this.manifest.layers?.[e.kind==='player'?'adventurer':e.type];
    let custom=this.characters?.draw(ctx,visualEntity,now,moving,index,visualTime)||false;
    if(!custom&&layers&&this.sprites[layers.body]){const order=layers.order?.[this.direction(visualEntity.facing)]||['body','armor','helmet','main','off'];for(const layer of order){const key=layer==='body'?layers.body:(this.sprites[`${layer}:${e.equipment?.[layer]?.appearance}`]?`${layer}:${e.equipment?.[layer]?.appearance}`:`${layer}:${e.equipment?.[layer]?.type}`);if(key)custom=this.frameSprite(key,visualEntity,now,motion,visualEntity,visualTime)||custom;}}
    else if(!custom)custom=this.frameSprite(e.kind==='monster'?e.type:'player',visualEntity,now,motion,visualEntity,visualTime);
    if(!custom){
      ctx.translate(e.x,e.y+bob);if(e.type==='treasure'){const emergence=Math.max(0,Math.min(1,1-((e.emergeUntil||0)-now)));ctx.globalAlpha*=emergence;ctx.translate(0,(1-emergence)*1.5);ctx.shadowColor='#ffce4d';ctx.shadowBlur=10;ctx.fillStyle='#88612d';ctx.beginPath();ctx.ellipse(-.55,-.55,.55,.7,-.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f3d56c';ctx.fillRect(-.8,-1.2,.5,.15);}const facing=this.direction(visualEntity.facing);const armor=e.equipment?.armor;
      if(e.kind==='monster'&&e.type==='slime'){
        ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,-.3,.7,.5,0,Math.PI,Math.PI*2);ctx.lineTo(.7,.1);ctx.lineTo(-.7,.1);ctx.closePath();ctx.fill();
        ctx.fillStyle='#122120';ctx.fillRect(-.22,-.3,.1,.1);ctx.fillRect(.15,-.3,.1,.1);
      }else{
        const big=e.boss?1.6:1;ctx.scale(big,big);
        const foot=moving?Math.sin(visualTime*13.5)*(['hammer','greatsword'].includes(e.equipment.main?.type)?.08:.12):0;ctx.fillStyle='#182431';ctx.fillRect(-.4,-.1+foot,.3,.35);ctx.fillRect(.1,-.1-foot,.3,.35);
        ctx.fillStyle=armor?RARITY_COLORS[armor.tier]:color;ctx.fillRect(-.43,-.75,.86,.75);
        ctx.fillStyle='#253348';ctx.fillRect(-.52,-1.45,1.04,.78);ctx.fillStyle=e.kind==='monster'?'#d7d2b6':'#efcfa9';ctx.fillRect(-.43,-1.32,.86,.55);
        ctx.fillStyle=e.kind==='monster'?color:'#735544';ctx.fillRect(-.48,-1.55,.96,.3);
        
        if(facing!=='up'){ctx.fillStyle='#263b44';ctx.fillRect(facing==='left'?-.36:facing==='right'?.2:-.24,-1.1,.12,.13);if(facing==='down')ctx.fillRect(.15,-1.1,.12,.13);}
        paintWear(ctx,e);const boots=e.equipment?.boots;if(boots){ctx.fillStyle=RARITY_COLORS[boots.tier];ctx.fillRect(-.41,.1+foot,.32,.15);ctx.fillRect(.1,.1-foot,.32,.15);}
        const weapon=e.equipment?.main,progress=e.attackPose?1-e.attackPose/.25:0,thrust=weapon?.type==='dagger',swing=e.attackPose&&!thrust?(e.combo===2?-1:1)*Math.sin((progress-.5)*Math.PI)*(e.combo===3?.45:1.1):0;
        const heavy=['greatsword','hammer'].includes(weapon?.type),motionSwing=weapon?.type==='axe'?swing*1.25:weapon?.type==='mace'?swing*.65:heavy&&e.combo===2?swing*.3:swing;const a=e.whirl?visualTime*14:(visualEntity.facing||0)+motionSwing,reach=e.attackPose?(thrust?Math.sin(progress*Math.PI)*(e.combo===3?1:.8):e.combo===3?.7:.4):.15;
        const pose=weaponPose(weapon?.type,moving,now),rest=!e.attackPose&&!e.whirl,side=facing==='left'?-1:1;ctx.save();ctx.translate(rest?side*pose.reach:Math.cos(a)*(.55+reach),rest?pose.height:Math.sin(a)*(.55+reach)-.55);ctx.rotate(rest?side*pose.angle:a);
        ctx.fillStyle=RARITY_COLORS[weapon?.tier||0];
        paintWeapon(ctx,weapon,now,!!e.attackPose);
        ctx.restore();const off=e.equipment?.off;
        if(off){ctx.save();ctx.translate(-.7,-.4);ctx.scale(.6,.6);paintItemIcon(ctx,off,now);ctx.restore();}
      }
    }
    if(e.blocking){ctx.strokeStyle='#a3d7ef';ctx.lineWidth=.1;ctx.beginPath();ctx.arc(e.x,e.y-.5,1,e.facing-.9,e.facing+.9);ctx.stroke();}
    if(e.cast||e.bowCharge>=2){ctx.strokeStyle=e.cast?'#b994ff':'#ffe29b';ctx.lineWidth=.07;ctx.beginPath();ctx.arc(e.x,e.y,1.1,0,Math.PI*2);ctx.stroke();}
    if(this.selected===e.id){ctx.strokeStyle='#f3d49d';ctx.lineWidth=.09;ctx.strokeRect(e.x-1,e.y-1.7,2,2);}
    ctx.restore();
    let turnCandidate=move?.turnCandidate,turnCandidateSince=move?.turnCandidateSince;
    if(!isLocal&&changed&&delta>.018){
      const nextDir=this.direction(Math.atan2(my,mx)),currentDir=this.direction(moveFacing);
      if(nextDir===currentDir){turnCandidate=null;turnCandidateSince=0;}
      else if(turnCandidate!==nextDir){turnCandidate=nextDir;turnCandidateSince=visualTime;}
    }else if(isLocal||!moving){turnCandidate=null;turnCandidateSince=0;}
    this.tracks.set(e.id,{x:e.x,y:e.y,movingUntil,moveFacing,turnCandidate,turnCandidateSince});
    if(!e.dead&&!e.afterimage){const w=e.boss?2.2:1.5;ctx.fillStyle='#0b1018';ctx.fillRect(e.x-w/2-.06,e.y+.4,w+.12,.42);ctx.fillStyle=e.kind==='monster'?'#dc625f':'#82ca91';ctx.fillRect(e.x-w/2,e.y+.46,w*Math.max(0,e.hp/e.maxHp),.3);ctx.fillStyle='#ffffff26';ctx.fillRect(e.x-w/2,e.y+.46,w*Math.max(0,e.hp/e.maxHp),.07);}
  }
  tile(index,x,y,w=1,h=1){const a=this.manifest.terrain;if(!a||!this.terrain?.complete)return;const t=a.tile;this.ctx.drawImage(this.terrain,index%a.columns*t,Math.floor(index/a.columns)*t,t,t,x,y,w,h);}
  region(name,x,y,w=1,h=1){const a=this.manifest.terrain?.regions?.[name];if(!a||!this.terrain?.complete)return;const p=this.screenPoint({x,y});if(p.x+w*this.camera.scale< -60||p.y+h*this.camera.scale< -60||p.x>this.width+60||p.y>this.height+60)return;this.ctx.drawImage(this.terrain,...a,x,y,w,h);}
  lootTrack(loot,time){let entry=this.lootVisuals.get(loot.id);if(!entry||Math.hypot((entry.baseX??loot.x)-loot.x,(entry.baseY??loot.y)-loot.y)>.9){const seed=(String(loot.id||'loot')).split('').reduce((a,c)=>a+c.charCodeAt(0),0);entry={seenAt:time,seed,baseX:loot.x,baseY:loot.y};this.lootVisuals.set(loot.id,entry);}entry.baseX=loot.x;entry.baseY=loot.y;entry.lastSeen=time;return entry;}
  drawLootBeam(x,y,tier,time){
    if(tier<1)return;
    const ctx=this.ctx,palette={
      1:{core:'#f5f7fb',mid:'#cfd5de',outer:'#8e99aa',spark:'#ffffff'},
      2:{core:'#f0d8ff',mid:'#b45dff',outer:'#6f34c9',spark:'#e9c6ff'},
      3:{core:'#fff8c8',mid:'#ffd85c',outer:'#f09b29',spark:'#fff0a0'}
    }[tier]||{core:'#ffffff',mid:'#d9dde5',outer:'#9ca5b4',spark:'#ffffff'};
    const level=Math.max(1,Math.min(3,tier));
    const pulse=.94+.06*Math.sin(time*5.8+x*1.3);
    const height=[0,7.4,8.5,9.2][level],width=[0,.72,1.08,1.55][level];
    const outerAlpha=[0,.08,.14,.20][level],midAlpha=[0,.35,.58,.72][level],coreW=[0,.055,.09,.15][level];
    const rayCount=[0,1,2,3][level],sparkCount=[0,3,5,8][level];
    ctx.save();ctx.globalCompositeOperation='lighter';
    const halo=ctx.createLinearGradient(x,y-height,x,y+.15);
    halo.addColorStop(0,'rgba(255,255,255,0)');
    halo.addColorStop(.16,palette.outer+Math.round(outerAlpha*255).toString(16).padStart(2,'0'));
    halo.addColorStop(.48,palette.mid+Math.round(outerAlpha*1.45*255).toString(16).padStart(2,'0'));
    halo.addColorStop(.82,palette.mid+Math.round(outerAlpha*1.05*255).toString(16).padStart(2,'0'));
    halo.addColorStop(1,palette.outer+'05');
    ctx.fillStyle=halo;ctx.beginPath();ctx.moveTo(x-width*.7,y);ctx.lineTo(x-width*.46,y-height*.18);ctx.lineTo(x-width*.23,y-height);ctx.lineTo(x+width*.23,y-height);ctx.lineTo(x+width*.46,y-height*.18);ctx.lineTo(x+width*.7,y);ctx.closePath();ctx.fill();
    const mid=ctx.createLinearGradient(x,y-height,x,y);mid.addColorStop(0,'rgba(255,255,255,0)');mid.addColorStop(.22,palette.core+Math.round(midAlpha*.45*255).toString(16).padStart(2,'0'));mid.addColorStop(.56,palette.mid+Math.round(midAlpha*255).toString(16).padStart(2,'0'));mid.addColorStop(.86,palette.core+Math.round(midAlpha*.68*255).toString(16).padStart(2,'0'));mid.addColorStop(1,palette.mid+'0a');ctx.fillStyle=mid;ctx.fillRect(x-width*.16,y-height,width*.32,height);
    const core=ctx.createLinearGradient(x,y-height,x,y);core.addColorStop(0,'rgba(255,255,255,0)');core.addColorStop(.28,palette.spark+(level===1?'66':level===2?'88':'aa'));core.addColorStop(.68,palette.core+(level===1?'bb':level===2?'dd':'ff'));core.addColorStop(1,palette.core+'33');ctx.fillStyle=core;ctx.fillRect(x-coreW/2,y-height+.25,coreW,height-.25);
    ctx.globalAlpha=.22*pulse+.08*level;ctx.strokeStyle=palette.mid;ctx.lineWidth=.035+.012*level;ctx.beginPath();ctx.moveTo(x-width*.65,y-.035);ctx.lineTo(x+width*.65,y-.035);ctx.stroke();
    ctx.globalAlpha=.42+.11*level;ctx.strokeStyle=palette.core;ctx.lineWidth=.035+.012*level;for(let i=0;i<rayCount;i++){const centered=i-(rayCount-1)/2,ox=centered*.20+Math.sin(time*3+i)*.035;ctx.beginPath();ctx.moveTo(x+ox,y-height*(.22+i*.07));ctx.lineTo(x+ox*.42,y-.16);ctx.stroke();}
    for(let i=0;i<sparkCount;i++){const phase=time*(1.05+i*.07)+i*1.7,py=y-((phase%1)*height*.86+.35),px=x+Math.sin(phase*5.1+i)*(.16+.045*level+.035*(i%2)),s=.035+.008*level+.01*(i%2);ctx.globalAlpha=.22+.12*level+.22*Math.sin(phase*3+i)**2;ctx.fillStyle=palette.spark;ctx.fillRect(px-s,py-s,s*2,s*2);}
    ctx.restore();
  }
  ground(r){
    if(!this.terrain||this.camera.scale<5)return;this.floorCache??=new Map();const key=[r.x,r.y,r.w,r.h].join(':');let image=this.floorCache.get(key);
    if(!image){image=document.createElement('canvas');image.width=Math.ceil(r.w*16);image.height=Math.ceil(r.h*16);const c=image.getContext('2d');for(let y=0;y<Math.ceil(r.h);y++)for(let x=0;x<Math.ceil(r.w);x++){const hash=Math.abs((x+Math.floor(r.x))*17+(y+Math.floor(r.y))*31),name='floor_'+(hash%23<4?2+hash%7:1),a=this.manifest.terrain.regions[name];c.drawImage(this.terrain,...a,x*16,y*16,16,16);}this.floorCache.set(key,image);}
    const p=this.screenPoint(r);if(p.x+r.w*this.camera.scale<0||p.y+r.h*this.camera.scale<0||p.x>this.width||p.y>this.height)return;this.ctx.drawImage(image,r.x,r.y,r.w,r.h);
  }
  roomWalls(r,map,time){
    const opening=(x,y)=>map.corridors.some(c=>inside({x:x+.5,y:y+.5},c));
    for(let x=r.x;x<r.x+r.w;x++){if(!opening(x,r.y-1)){this.region('wall_top_mid',x,r.y-1);this.region('wall_mid',x,r.y,1,1);}if(!opening(x,r.y+r.h))this.region('wall_top_mid',x,r.y+r.h);}
    for(let y=r.y;y<r.y+r.h;y++){if(!opening(r.x-1,y))this.region('wall_edge_left',r.x-1,y);if(!opening(r.x+r.w,y))this.region('wall_edge_right',r.x+r.w,y);}
    this.region('wall_top_left',r.x-1,r.y-1);this.region('wall_top_right',r.x+r.w,r.y-1);
    const banner=['red','blue','green','yellow'][r.id%4];for(const x of [r.x+4,r.x+r.w-5])this.region('wall_banner_'+banner,x,r.y);
    // Wall fountains are animated terrain decorations, not hidden interactables.
    for(const x of [r.x+8,r.x+r.w-9]){const frame=Math.floor(time*5)%3;this.region('wall_fountain_top_1',x,r.y-1);this.region('wall_fountain_mid_blue_anim_f'+frame,x,r.y);this.region('wall_fountain_basin_blue_anim_f'+frame,x,r.y+1);}
  }

  drawArenaLava(s){
    if(s.mode!=='arena')return;const ctx=this.ctx,time=performance.now()/1000;
    for(const room of s.map.rooms){if(!(room.lava>0))continue;const intensity=Math.min(1,.42+room.lava*.045);ctx.save();
      const g=ctx.createLinearGradient(room.x,room.y,room.x+room.w,room.y+room.h);g.addColorStop(0,`rgba(122,20,7,${.28*intensity})`);g.addColorStop(.45,`rgba(238,64,16,${.34*intensity})`);g.addColorStop(1,`rgba(105,12,8,${.3*intensity})`);ctx.fillStyle=g;ctx.fillRect(room.x,room.y,room.w,room.h);
      ctx.save();ctx.beginPath();ctx.rect(room.x,room.y,room.w,room.h);ctx.clip();ctx.globalCompositeOperation='screen';
      for(let i=0;i<5;i++){const yy=room.y+((i*6+time*(1.4+i*.14)+room.id*2.1)%(room.h+5))-2.5;ctx.strokeStyle=i%2?'rgba(255,173,45,.22)':'rgba(255,92,24,.28)';ctx.lineWidth=.18+.04*(i%3);ctx.beginPath();for(let x=room.x-2;x<=room.x+room.w+2;x+=2){const y=yy+Math.sin(x*.7+time*2+i)*.35;x===room.x-2?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
      for(let i=0;i<9;i++){const seed=room.id*31+i*17,x=room.x+1.5+((seed*1.77)%(Math.max(2,room.w-3))),phase=(time*(.35+(i%3)*.08)+seed*.13)%1,y=room.y+room.h-1.2-phase*(room.h-2.4),rad=.12+(i%3)*.05;ctx.fillStyle=i%2?'rgba(255,224,109,.55)':'rgba(255,122,38,.48)';ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();}
      ctx.restore();ctx.strokeStyle=`rgba(255,194,75,${.42+.08*Math.sin(time*3+room.id)})`;ctx.lineWidth=.12;ctx.strokeRect(room.x+.08,room.y+.08,room.w-.16,room.h-.16);ctx.restore();}
  }
  drawArenaSpawnIndicators(s){if(s.mode!=='arena')return;const ctx=this.ctx,now=s.time;for(const e of s.entities){if(e.kind!=='monster'||e.dead)continue;if(e.spawnRevealUntil>now){const p=Math.max(0,Math.min(1,1-(e.spawnRevealUntil-now)/1.4));ctx.save();ctx.translate(e.x,e.y);ctx.globalAlpha=.35+.65*p;ctx.strokeStyle=e.boss?'#ffd569':'#e8c88a';ctx.lineWidth=.08;ctx.setLineDash([.18,.12]);ctx.beginPath();ctx.arc(0,0,(e.boss?1.4:.8)*(1.15-.25*p),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();}}}
  drawPlanningHighlights(s,overview,master){
    if(!(master&&s.mode==='dungeon'&&s.phase==='planning'))return;
    const ctx=this.ctx;
    const pulse=.55+.45*Math.sin(s.time*4.2);
    for(const r of s.map.rooms){
      if(r.id<=0) continue;
      const buildable=!!s.builders?.[r.id];
      if(!buildable){
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,.72)';
        ctx.fillRect(r.x,r.y,r.w,r.h);
        ctx.strokeStyle='rgba(30,34,40,.95)';
        ctx.lineWidth=2/this.camera.scale;
        ctx.strokeRect(r.x,r.y,r.w,r.h);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.fillStyle=`rgba(112, 240, 196, ${0.10+0.06*pulse})`;
      ctx.fillRect(r.x+.18,r.y+.18,r.w-.36,r.h-.36);
      ctx.strokeStyle=`rgba(248, 224, 139, ${0.48+0.36*pulse})`;
      ctx.lineWidth=3/this.camera.scale;
      ctx.shadowColor='rgba(126,217,197,.78)';
      ctx.shadowBlur=20/this.camera.scale;
      ctx.strokeRect(r.x+.15,r.y+.15,r.w-.3,r.h-.3);
      ctx.shadowBlur=0;
      if(overview){
        ctx.fillStyle='rgba(236,245,223,.96)';
        ctx.font=`${11/this.camera.scale}px monospace`;
        ctx.textAlign='center';
        ctx.fillText('배치 가능',r.x+r.w/2,r.y+r.h/2+2/this.camera.scale);
      }
      ctx.restore();
    }
  }

  draw(snapshot,dt){
    if(!snapshot)return;this.frameDt=dt;this.visualClock=(this.visualClock??performance.now()/1000)+Math.min(.05,Math.max(0,dt));const s=snapshot,ctx=this.ctx,master=s.masterId==='local';
    const focus=s.me||s.entities.find(e=>e.id===s.possession);this.hitStop=Math.max(0,this.hitStop-dt);
    for(const f of s.effects){if(this.fxSeen.has(f.id))continue;this.fxSeen.add(f.id);if(focus&&Math.hypot(f.x-focus.x,f.y-focus.y)>16)continue;let force={breadrise:1,candyburst:2,panclang:3,slam:5,meteor:7,fireball:6,thunder:3,lightning:3,trap:3,death:2}[f.kind]||0;if(f.kind==='hit'&&!f.dot){force=f.target===s.me?.id?(f.heavy?5:2):f.heavy?2:0;if(f.target===focus?.id)this.hitStop=Math.max(this.hitStop,f.heavy?.045:.018);}if(force){this.shakeStrength=Math.max(this.shakeStrength,force);this.shakeLife=.24;}}
    if(this.fxSeen.size>1500)this.fxSeen=new Set(s.effects.map(f=>f.id));this.shakeLife=Math.max(0,this.shakeLife-dt);if(!this.shakeLife)this.shakeStrength=0;
    const amplitude=this.shakeEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches?this.shakeStrength*this.shakeLife/.24:0;this.shakeX=Math.sin(s.time*137)*amplitude;this.shakeY=Math.cos(s.time*179)*amplitude*.65;
    const spawnSelection=s.mode==='arena'&&s.phase==='spawn';
    const overview=this.overview||s.phase==='spawn';
    if(spawnSelection){const regions=[...s.map.rooms,...s.map.corridors],left=Math.min(...regions.map(r=>r.x))-2,top=Math.min(...regions.map(r=>r.y))-2,right=Math.max(...regions.map(r=>r.x+r.w))+2,bottom=Math.max(...regions.map(r=>r.y+r.h))+2;this.camera.x=(left+right)/2;this.camera.y=(top+bottom)/2;this.camera.scale=Math.min((this.width-48)/(right-left),(this.height-120)/((bottom-top)*this.projectionY));}
    else if(overview){this.camera.x=s.map.width/2;this.camera.y=s.map.height/2;this.camera.scale=Math.min((this.width-70)/s.map.width,(this.height-170)/s.map.height);}
    else if(master){const r=s.map.rooms[this.masterRoom];this.camera.x=r.x+r.w/2;this.camera.y=r.y+r.h/2;this.camera.scale=Math.min(Math.max(180,this.width-(this.width>800?400:this.sidebarOpen?320:40))/r.w,(this.height-160)/r.h);this.camera.x+=(this.width>800?150:this.sidebarOpen?100:0)/this.camera.scale;}
    else{const me=s.me?.dead&&s.me.follow?s.entities.find(e=>e.id===s.me.follow)||s.me:s.me;if(me){this.camera.x+=(me.x-this.camera.x)*Math.min(1,dt*9);this.camera.y+=(me.y-this.camera.y)*Math.min(1,dt*9);}this.camera.scale=23;}
    const c=this.camera;ctx.clearRect(0,0,this.width,this.height);const mapReady=this.map3d.render(s,c,this.width,this.height,this.shakeX,this.shakeY);if(!mapReady){ctx.fillStyle='#090f17';ctx.fillRect(0,0,this.width,this.height);}
    ctx.save();ctx.translate(this.shakeX,this.shakeY);ctx.save();ctx.translate(this.width/2,this.height/2);ctx.scale(c.scale,c.scale*this.projectionY);ctx.translate(-c.x,-c.y);
    const scale=c.scale;ctx.lineWidth=1/scale;
    if(!mapReady){
    for(const corridor of s.map.corridors){ctx.fillStyle='#25313e';ctx.fillRect(corridor.x,corridor.y,corridor.w,corridor.h);this.ground(corridor);}
    for(const r of s.map.rooms){ctx.fillStyle=r.lava?'#593328':r.heal?'#263c3f':'#283440';ctx.fillRect(r.x,r.y,r.w,r.h);this.ground(r);if(scale>5)this.roomWalls(r,s.map,s.time);if(r.lava){ctx.fillStyle="#e44e2544";ctx.fillRect(r.x,r.y,r.w,r.h);}ctx.strokeStyle=r.lava?'#e79955':'#46576a';ctx.lineWidth=(r.lava?3:2)/scale;ctx.strokeRect(r.x,r.y,r.w,r.h);
      if(scale>3){ctx.strokeStyle='#ffffff05';ctx.lineWidth=1/scale;ctx.beginPath();for(let x=r.x;x<r.x+r.w;x+=4){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.h);}for(let y=r.y;y<r.y+r.h;y+=4){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.w,y);}ctx.stroke();}
      if(master&&!overview&&r.id===this.masterRoom){ctx.strokeStyle='#7ed9c517';ctx.beginPath();for(let x=r.x;x<r.x+r.w;x++){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.h);}for(let y=r.y;y<r.y+r.h;y++){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.w,y);}ctx.stroke();}
      if(s.mode==='dungeon'&&r.id>0){ctx.save();ctx.translate(r.entry?.x??r.x,r.entry?.y??12);ctx.rotate(r.entry?.angle??Math.PI/2);const a=this.manifest.terrain?.regions?.[r.locked?'doors_leaf_closed':'doors_leaf_open'];if(a&&this.terrain?.complete)ctx.drawImage(this.terrain,...a,-3,-1,6,2);ctx.restore();}
      if(r.heal){ctx.fillStyle='#75d7bd';ctx.beginPath();ctx.arc(r.x+r.w/2,r.y+r.h/2,2,0,Math.PI*2);ctx.fill();}
      if(overview){ctx.fillStyle='#d2dce8';ctx.font=`${12/scale}px sans-serif`;ctx.textAlign='center';ctx.fillText(`${r.id+1}${r.lava?' / 용암':''}`,r.x+r.w/2,r.y+6);}
    }
    this.drawPlanningHighlights(s,overview,master);
    for(const o of s.map.obstacles){ctx.fillStyle='#111d2c';ctx.fillRect(o.x+.4,o.y+.5,o.w,o.h);ctx.fillStyle='#526171';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle='#6b7988';ctx.fillRect(o.x,o.y,o.w,.3);this.region(o.fixed?'column':'crate',o.x,o.y-o.h*.45,o.w,o.h*1.45);}
    }
    this.drawArenaLava(s);this.drawArenaSpawnIndicators(s);
    for(const e of s.entities){const c=e.cast;if(c?.kind!=='monster-shot')continue;ctx.save();traceAttackShape(ctx,{shape:'line',x:c.ox,y:c.oy,angle:c.angle,length:c.range*(c.projectileKind==='magic'?2:1),width:.9});ctx.fillStyle='#ec595b38';ctx.strokeStyle='#f18a79';ctx.lineWidth=.08;ctx.fill();ctx.stroke();ctx.restore();}
    for(const z of s.zones){
      const enemy=s.entities.find(e=>e.id===z.owner)?.team!==s.me?.team,color=enemy?'#e87763':'#b899dc';ctx.save();traceAttackShape(ctx,z,s.map);ctx.fillStyle=z.active?(z.kind==='poison'?'#73995066':z.kind==='acid'?'#a7ad5a66':'#de995b44'):color+'2b';ctx.strokeStyle=z.active?color+'77':color;ctx.lineWidth=z.active?.07:.09;ctx.fill();ctx.stroke();
      if(!z.active){const pulse=.7+Math.sin(s.time*10)*.2;ctx.globalAlpha=pulse;ctx.setLineDash([.3,.16]);ctx.stroke();ctx.setLineDash([]);}else if(z.kind==='poison'||z.kind==='acid'){for(let i=0;i<15;i++){const a=i*2.4,d=z.radius*(.2+(i%4)*.2),x=z.x+Math.cos(a+s.time*.12)*d,y=z.y+Math.sin(a+s.time*.12)*d;ctx.fillStyle=z.kind==='poison'?'#b4d89166':'#d0d88b88';ctx.fillRect(x,y-Math.sin(s.time*3+i)*.2,.2,.2);if(z.kind==='acid'){ctx.strokeStyle='#d0d88b88';ctx.beginPath();ctx.moveTo(x,y-1);ctx.lineTo(x-.15,y-.3);ctx.stroke();}}}
      ctx.restore();
    }
    const actor=s.me||s.entities.find(e=>e.id===s.possession);if(actor&&!actor.dead&&!overview&&this.rangeEnabled&&this.aim){const shape=weaponPreview(actor,this.aim,this.previewSpecial,s.map.rooms[actor.room]);if(shape){ctx.save();traceAttackShape(ctx,shape,s.map);ctx.fillStyle=shape.color+'15';ctx.strokeStyle=shape.color+'90';ctx.lineWidth=.04;ctx.setLineDash([.2,.18]);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=shape.color;ctx.font='.45px sans-serif';ctx.textAlign='center';ctx.fillText(shape.label,actor.x,actor.y+1.1);ctx.restore();}}
    if(!mapReady)for(const t of s.traps)this.region('floor_spikes_anim_f'+(t.cool>0?3:1),t.x-.6,t.y-.6,1.2,1.2);
    for(const r of s.map.rooms.filter(r=>r.heal)){const x=r.x+r.w/2,y=r.y+r.h/2;ctx.save();ctx.fillStyle='#75f0df';ctx.shadowColor='#65e9d6';ctx.shadowBlur=14;ctx.beginPath();ctx.ellipse(x,y-1.5,1.15,.58,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d3fff3';ctx.lineWidth=.06;ctx.stroke();for(let i=0;i<7;i++){const a=i*2.4+s.time*.6,d=.5+(i%3)*.35;ctx.fillStyle='#c5fff1';ctx.fillRect(x+Math.cos(a)*d,y-1.7-((s.time*.6+i*.3)%1.8),.1,.1);}ctx.fillStyle='#d5fff0';ctx.fillRect(x-.1,y-4.3,.2,.8);ctx.fillRect(x-.4,y-4,.8,.2);ctx.shadowBlur=0;ctx.font='.5px sans-serif';ctx.textAlign='center';ctx.fillText('치유의 샘',x,y-4.65);ctx.font='.38px sans-serif';ctx.fillText('가까이에서 상호작용 · 체력 회복',x,y+2.6);ctx.restore();}
    for(const chest of s.chests){ctx.strokeStyle=RARITY_COLORS[chest.tier];ctx.lineWidth=.08;if(!chest.opened)ctx.strokeRect(chest.x-.7,chest.y-.6,1.4,1.2);if(!mapReady)this.region((chest.opened?'chest_empty_open_anim_f2':'chest_full_open_anim_f0'),chest.x-.7,chest.y-.85,1.4,1.4);}
    this.dashTrails??=new Map();for(const e of s.entities){if(!e.dashing){this.dashTrails.delete(e.id);continue;}let trail=this.dashTrails.get(e.id);if(!trail){trail={at:0,points:[]};this.dashTrails.set(e.id,trail);}if(s.time-trail.at>.06){trail.at=s.time;trail.points.push({x:e.x,y:e.y,at:s.time});}trail.points=trail.points.filter(p=>s.time-p.at<.22).slice(-4);for(const p of trail.points)this.drawActor({...e,id:e.id+'-trail',x:p.x,y:p.y,afterimage:.18*(1-(s.time-p.at)/.22),attackPose:0,whirl:null},s.time,0,this.visualClock);}
    const visualNow=performance.now()/1000,visibleLoot=new Set(s.loot.map(l=>l.id));for(const id of [...this.lootVisuals.keys()])if(!visibleLoot.has(id))this.lootVisuals.delete(id);
    for(const l of s.loot){const track=this.lootTrack(l,visualNow),life=Math.max(0,Math.min(1,(visualNow-track.seenAt)/.34)),ease=1-Math.pow(1-life,3),seed=(track.seed||0)*.017,dropX=l.x+((track.seed||0)%2?.09:-.09),settledY=l.y+.34,drawY=settledY-(1-ease)*.78+Math.sin(visualNow*2.4+seed)*.05,itemScale=.92+.22*ease;if(l.item.tier>0)this.drawLootBeam(dropX,settledY+.04,l.item.tier,visualNow+seed);ctx.save();ctx.translate(dropX,settledY+.2);ctx.scale(1,.38);const shade=ctx.createRadialGradient(0,0,0,0,0,.66);shade.addColorStop(0,'#0000004c');shade.addColorStop(1,'#00000000');ctx.fillStyle=shade;ctx.beginPath();ctx.arc(0,0,.66,0,Math.PI*2);ctx.fill();ctx.restore();if(life<1){ctx.save();ctx.globalAlpha=(1-life)*.5;ctx.strokeStyle=(RARITY_COLORS[l.item.tier]||'#fff')+'aa';ctx.lineWidth=.1;ctx.beginPath();ctx.arc(dropX,drawY,.35+.45*life,0,Math.PI*2);ctx.stroke();ctx.restore();}ctx.save();ctx.translate(dropX,drawY);ctx.scale(itemScale,itemScale);if(!this.characters?.drawDrop(ctx,l.item)){ctx.scale(1,1);paintItemIcon(ctx,l.item,visualNow);}ctx.restore();}

    const viewPad=4,viewHalfW=this.width/(2*c.scale)+viewPad,viewHalfH=this.height/(2*c.scale*this.projectionY)+viewPad;
    const sorted=s.entities.map(e=>{const previous=this.renderPositions.get(e.id),blend=this.hitStop>0?0:s.networkInterpolated?1:1-Math.exp(-35*dt);const position=!previous||Math.hypot(e.x-previous.x,e.y-previous.y)>12?{x:e.x,y:e.y}:{x:previous.x+(e.x-previous.x)*blend,y:previous.y+(e.y-previous.y)*blend};this.renderPositions.set(e.id,position);return {...e,...position,pose:s.phase==='over'&&!e.dead&&(s.result?.winner==='party'||s.result?.winner===e.id)?'victory':null};}).filter(e=>overview||spawnSelection||(Math.abs(e.x-c.x)<=viewHalfW&&Math.abs(e.y-c.y)<=viewHalfH)).sort((a,b)=>a.y-b.y);
    const depthItems=[...sorted.map(e=>({y:e.y,actor:e})),...s.effects.filter(f=>f.kind==='breadrise').map(f=>({y:f.y,fx:f}))].sort((a,b)=>a.y-b.y||(a.fx?-1:1));for(const d of depthItems)if(d.actor){if(!spawnSelection)this.drawActor(d.actor,s.time,s.roster.findIndex(p=>p.id===d.actor.id)+1,this.visualClock);}else paintEffect(ctx,d.fx,s.time);
    for(const p of s.projectiles){if(CombatEffects.projectile(ctx,p,s.time))continue;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.scale(p.visualScale||1,p.visualScale||1);const color=p.kind==='heal'?'#9ce5bf':p.kind==='fireball'?'#f2b169':p.kind==='arrow'?'#d8bf94':p.kind==='phoenix'?'#ffab64':p.kind==='thorn'?'#9bcc77':p.kind==='lightning'?'#b2e0ff':'#b6a0e3';ctx.fillStyle=color+'55';ctx.fillRect(-1.2,-.12,1.3,.24);ctx.fillStyle=color;if(p.kind==='lightning'){ctx.strokeStyle='#c9ecff';ctx.lineWidth=.14;ctx.beginPath();ctx.moveTo(-.6,0);ctx.lineTo(-.2,-.2);ctx.lineTo(.1,.2);ctx.lineTo(.5,0);ctx.stroke();}else if(p.kind==='phoenix'){ctx.fillStyle='#ffbe75';ctx.beginPath();ctx.moveTo(.6,0);ctx.lineTo(-.3,-.45);ctx.lineTo(-.1,0);ctx.lineTo(-.3,.45);ctx.closePath();ctx.fill();}else if(['bladewave','crescent','clockwave'].includes(p.kind)){ctx.strokeStyle=p.kind==='clockwave'?'#b6ddff':'#e4dbff';ctx.lineWidth=.16;ctx.beginPath();ctx.arc(0,0,.8,-1.3,1.3);ctx.stroke();}else if(p.kind==='fireball'){ctx.beginPath();ctx.arc(0,0,.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0cf';ctx.fillRect(-.12,-.12,.24,.24);}else{ctx.fillRect(-.4,-.08,.8,.16);ctx.fillStyle='#f5e8db';ctx.fillRect(.18,-.12,.15,.24);}ctx.restore();}
    for(const f of s.effects)if(f.kind!=='breadrise')paintEffect(ctx,f,s.time);
    if(this.preview&&master){ctx.strokeStyle='#7ed9c5';ctx.lineWidth=.1;ctx.strokeRect(Math.round(this.preview.x)-.5,Math.round(this.preview.y)-.5,1,1);}
    ctx.restore();
    if(!master&&!s.me?.dead&&s.phase!=='spawn'&&!overview)this.drawFog(s);
    // Labels are screen-space so they stay readable across zoom levels.
    for(const e of s.entities){const p=this.screenPoint(e);if(p.x<0||p.x>this.width||p.y<0||p.y>this.height)continue;if(spawnSelection){if(e.kind!=='player')continue;const colors=['#ff7777','#72baff','#ffd26b','#b694ff','#6ee0aa','#ff99d5','#63dce7','#f6aa68'],index=Math.max(0,s.roster.findIndex(r=>r.id===e.id)),color=colors[index%colors.length];ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle=color;ctx.strokeStyle='#18212b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-10,-25);ctx.lineTo(10,-25);ctx.lineTo(10,-15);ctx.lineTo(17,-15);ctx.lineTo(0,0);ctx.lineTo(-17,-15);ctx.lineTo(-10,-15);ctx.closePath();ctx.fill();ctx.stroke();ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeText(e.name,0,-34);ctx.fillText(e.name,0,-34);ctx.restore();continue;}ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle=e.id==='local'?'#e9cf9f':'#c2cede';ctx.fillText(e.dead?`${e.name} · 유령`:e.bot&&e.kind==='player'?e.name.replace('모험가 ','AI '):e.name,p.x,p.y-2.3*scale);}
    let bubbles=0;for(const e of s.entities){if(!e.speech||bubbles>=3)continue;const p=this.screenPoint(e);if(p.x<35||p.x>this.width-35||p.y<90||p.y>this.height)continue;ctx.font='11px sans-serif';const text=e.speech.text,w=Math.min(220,ctx.measureText(text).width+20),x=Math.max(8,Math.min(this.width-w-8,p.x-w/2)),y=p.y-3*scale-25;ctx.fillStyle='#ece0c5';ctx.strokeStyle='#796448';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,29,5);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-5,y+29);ctx.lineTo(p.x,y+35);ctx.lineTo(p.x+5,y+29);ctx.fill();ctx.fillStyle='#302838';ctx.textAlign='center';ctx.fillText(text,x+w/2,y+19);bubbles++;}
    ctx.restore();if(!overview)this.minimap(s);
  }
  fogGeometry(s){
    const rooms=s.map.rooms||[],corridors=s.map.corridors||[],obstacles=s.map.obstacles||[];
    const key=[obstacles.map(o=>`${o.x},${o.y},${o.w},${o.h}`).join(';'),rooms.map(r=>`${r.x},${r.y},${r.w},${r.h},${r.locked?1:0}`).join(';'),corridors.map(c=>`${c.x},${c.y},${c.w},${c.h},${c.to||''}`).join(';')].join('|');
    if(this._fogGeometry?.key===key)return this._fogGeometry;
    const pack=values=>{const out=new Float32Array(values.length*4);let i=0;for(const r of values){out[i++]=r.x;out[i++]=r.y;out[i++]=r.x+r.w;out[i++]=r.y+r.h;}return out;};
    const walk=[...rooms,...corridors.filter(c=>!c.to||!rooms[c.to]?.locked)];
    this._fogGeometry={key,obstacles:pack(obstacles),walk:pack(walk)};return this._fogGeometry;
  }
  drawFog(s){
    const ctx=this.ctx,scale=this.camera.scale;
    if(!this.fogCanvas){this.fogCanvas=document.createElement('canvas');this.fogCtx=this.fogCanvas.getContext('2d');this.lightCanvas=document.createElement('canvas');this.lightCtx=this.lightCanvas.getContext('2d');}
    for(const c of [this.fogCanvas,this.lightCanvas])if(c.width!==Math.ceil(this.width)||c.height!==Math.ceil(this.height)){c.width=Math.ceil(this.width);c.height=Math.ceil(this.height);}
    const f=this.fogCtx,l=this.lightCtx;f.clearRect(0,0,this.width,this.height);l.clearRect(0,0,this.width,this.height);f.globalCompositeOperation='source-over';f.fillStyle='#10111bb0';f.fillRect(0,0,this.width,this.height);
    const geometry=this.fogGeometry(s),blocked=(x,y)=>{const obs=geometry.obstacles;for(let i=0;i<obs.length;i+=4)if(x>=obs[i]&&x<=obs[i+2]&&y>=obs[i+1]&&y<=obs[i+3])return true;const walk=geometry.walk;for(let i=0;i<walk.length;i+=4)if(x>=walk[i]&&x<=walk[i+2]&&y>=walk[i+1]&&y<=walk[i+3])return false;return true;};
    const RAYS=96,POINTS=RAYS+1;
    this.rayCache??=new Map();this.lightTracks??=new Map();
    for(const rawSource of s.visionSources){
      const rp=this.renderPositions.get(rawSource.id),sourceX=rp?.x??rawSource.x,sourceY=rp?.y??rawSource.y,turn=rawSource.facing||0;
      const p=this.screenPoint({x:sourceX,y:sourceY}),radius=rawSource.poison?.6:Math.min(45,rawSource.radius),omni=rawSource.fullRoom||rawSource.poison,arc=Math.PI,start=turn-Math.PI,key=rawSource.id||String(sourceX);
      let cache=this.rayCache.get(key),worldPoints=cache?.points;
      const recalc=!cache||s.time-cache.at>1/30||Math.abs(turn-cache.turn)>.08||Math.hypot(sourceX-cache.x,sourceY-cache.y)>.2||cache.radius!==radius;
      if(recalc){
        if(!(worldPoints instanceof Float32Array)||worldPoints.length!==POINTS*2)worldPoints=new Float32Array(POINTS*2);
        for(let i=0;i<POINTS;i++){
          const angle=start+arc*2*i/RAYS,ca=Math.cos(angle),sa=Math.sin(angle),rayRadius=omni||Math.cos(angle-turn)>=Math.cos(rawSource.arc||Math.PI/3)?radius:Math.min(radius,rawSource.nearRadius||3);let far=0;
          for(let d=.2;d<=rayRadius;d+=.25){const x=sourceX+ca*d,y=sourceY+sa*d;if(blocked(x,y))break;far=d;}
          worldPoints[i*2]=sourceX+ca*far;worldPoints[i*2+1]=sourceY+sa*far;
        }
        cache={points:worldPoints,at:s.time,turn,x:sourceX,y:sourceY,radius};this.rayCache.set(key,cache);
      }
      let local=this.lightTracks.get(key);if(!(local instanceof Float32Array)||local.length!==POINTS*2){local=new Float32Array(POINTS*2);for(let i=0;i<POINTS;i++){local[i*2]=worldPoints[i*2]-cache.x;local[i*2+1]=worldPoints[i*2+1]-cache.y;}this.lightTracks.set(key,local);}
      const lightBlend=1-Math.exp(-24*(this.frameDt||1/60));
      l.save();l.beginPath();l.moveTo(p.x,p.y);
      for(let i=0;i<POINTS;i++){
        const ix=i*2,tx=worldPoints[ix]-cache.x,ty=worldPoints[ix+1]-cache.y;local[ix]+=(tx-local[ix])*lightBlend;local[ix+1]+=(ty-local[ix+1])*lightBlend;
        const sx=(sourceX+local[ix]-this.camera.x)*this.camera.scale+this.width/2,sy=(sourceY+local[ix+1]-this.camera.y)*this.camera.scale*this.projectionY+this.height/2;l.lineTo(sx,sy);
      }
      l.closePath();l.clip();const g=l.createRadialGradient(p.x,p.y,0,p.x,p.y,radius*scale);g.addColorStop(0,'#fffffffa');g.addColorStop(.35,'#ffffffe8');g.addColorStop(.65,'#ffffffa0');g.addColorStop(.85,'#ffffff40');g.addColorStop(1,'#ffffff00');l.fillStyle=g;l.fillRect(0,0,this.width,this.height);const near=l.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.min(radius,3)*scale);near.addColorStop(0,'#fffffffa');near.addColorStop(.45,'#ffffffd0');near.addColorStop(.75,'#ffffff60');near.addColorStop(1,'#ffffff00');l.fillStyle=near;l.fillRect(p.x-3*scale,p.y-3*scale,6*scale,6*scale);l.restore();
    }
    f.globalCompositeOperation='destination-out';f.filter=`blur(${Math.max(10,Math.min(18,scale*.65))}px)`;f.drawImage(this.lightCanvas,0,0);f.filter='none';f.globalCompositeOperation='source-over';ctx.drawImage(this.fogCanvas,0,0,this.width,this.height);
  }
  minimap(s){const ctx=this.ctx,{w,h,x,y,scale,mx,my}=minimapLayout(s.map,this.width);this.minimapRect={x:mx,y:my,w:s.map.width*scale,h:s.map.height*scale,scale,frameBottom:y+h};ctx.fillStyle='#0e1825e8';ctx.fillRect(x-6,y-6,w+12,h+12);
    const key=s.map.rooms.map(r=>[r.x,r.y,r.w,r.h].join(',')).join('|');
    if(this.miniShapeKey!==key){this.miniShapeKey=key;const W=Math.ceil(s.map.width),H=Math.ceil(s.map.height),cells=new Uint8Array(W*H),edge=new Path2D();for(const r of [...s.map.rooms,...s.map.corridors])for(let yy=Math.max(0,Math.floor(r.y));yy<Math.min(H,Math.ceil(r.y+r.h));yy++)for(let xx=Math.max(0,Math.floor(r.x));xx<Math.min(W,Math.ceil(r.x+r.w));xx++)cells[yy*W+xx]=1;for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){if(!cells[yy*W+xx])continue;for(const [dx,dy,ax,ay,bx,by] of [[-1,0,xx,yy,xx,yy+1],[1,0,xx+1,yy,xx+1,yy+1],[0,-1,xx,yy,xx+1,yy],[0,1,xx,yy+1,xx+1,yy+1]]){const nx=xx+dx,ny=yy+dy;if(nx<0||nx>=W||ny<0||ny>=H||!cells[ny*W+nx]){edge.moveTo(ax,ay);edge.lineTo(bx,by);}}}this.miniEdges=edge;}
    ctx.fillStyle='#241f1ded';ctx.fillRect(x-6,y-6,w+12,h+12);ctx.strokeStyle='#8b8066';ctx.lineWidth=2;ctx.strokeRect(x-6,y-6,w+12,h+12);
    ctx.save();ctx.translate(mx,my);ctx.scale(scale,scale);ctx.fillStyle='#839b4b';for(const r of [...s.map.rooms,...s.map.corridors])ctx.fillRect(r.x,r.y,r.w,r.h);for(const r of s.map.rooms.filter(r=>r.lava>0)){ctx.fillStyle='#d44825';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle='#ffc278';ctx.lineWidth=1.5/scale;ctx.strokeRect(r.x,r.y,r.w,r.h);const px=r.x+r.w/2,py=r.y+r.h/2;ctx.fillStyle='#fff0b0';ctx.font=`${10/scale}px sans-serif`;ctx.textAlign='center';ctx.fillText('!',px,py+3/scale);}ctx.strokeStyle='#b4bd78';ctx.lineWidth=4/scale;ctx.stroke(this.miniEdges);ctx.strokeStyle='#303923';ctx.lineWidth=2/scale;ctx.stroke(this.miniEdges);for(const c of s.map.corridors)if(c.to&&s.map.rooms[c.to]?.locked){ctx.fillStyle='#c4aa66';ctx.fillRect(c.x+c.w/2-.7,c.y,.9,c.h);}ctx.restore();
    if(s.mode==='dungeon')for(const r of s.map.rooms.filter(r=>r.id===7||r.heal)){const px=mx+(r.x+r.w/2)*scale,py=my+(r.y+r.h/2)*scale;ctx.save();ctx.translate(px,py);ctx.fillStyle='#253327';ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();if(r.heal){ctx.fillStyle='#b7ffe0';ctx.fillRect(-1,-4,2,8);ctx.fillRect(-4,-1,8,2);}else{ctx.fillStyle='#ffde78';ctx.beginPath();ctx.moveTo(-4,3);ctx.lineTo(-5,-3);ctx.lineTo(-2,0);ctx.lineTo(0,-4);ctx.lineTo(2,0);ctx.lineTo(5,-3);ctx.lineTo(4,3);ctx.closePath();ctx.fill();}ctx.restore();}
    for(const e of s.entities.filter(e=>!e.dead&&(e.boss||e.type==='treasure'))){const px=mx+e.x*scale,py=my+e.y*scale;ctx.save();ctx.translate(px,py);if(e.type==='treasure'){ctx.fillStyle='#7ff0b2';ctx.strokeStyle='#fff1a8';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,0);ctx.lineTo(0,5);ctx.lineTo(-4,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#143626';ctx.fillRect(-1.2,-1.2,2.4,2.4);}else{ctx.fillStyle='#ffcf5c';ctx.strokeStyle='#8f2e24';ctx.lineWidth=1.2;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rad=i%2?3.2:5.4;i?ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#5b1515';ctx.fillRect(-1.2,-1.2,2.4,2.4);}ctx.restore();}
    for(const e of s.entities.filter(e=>e.kind==='player'&&!e.dead)){const px=mx+e.x*scale,py=my+e.y*scale;ctx.fillStyle=e.id==='local'?'#ef4c4c':'#d8e6af';ctx.strokeStyle=e.id==='local'?'#fff5cd':'#303923';ctx.lineWidth=e.id==='local'?1.5:1;ctx.beginPath();ctx.arc(px,py,e.id==='local'?3.5:2,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.fillStyle='#8798ad';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText(s.map.rooms.some(r=>r.lava>0)?'M · 전체 지도 / 주황: 용암 / ★ 보스 / ◆ 보물':'M · 전체 지도 / ★ 보스 / ◆ 보물',x,y+h+18);}
}



