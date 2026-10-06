// Small WebGL 1 renderer: fixed orthographic projection, baked vertex lighting,
// one static buffer per room. Gameplay stays on its existing 2D plane.
export const MAP_Y_SCALE=.66;
export function appendModel(out,model,x,z,w,h,d,angle=0,tint=[1,1,1],elevation=0){
  if(!model)return;const [lo,hi]=model.bounds,v=model.vertices;
  const sx=w/(hi[0]-lo[0]||1),sy=h/(hi[1]-lo[1]||1),sz=d/(hi[2]-lo[2]||1),c=Math.cos(angle),s=Math.sin(angle);
  for(let i=0;i<v.length;i+=6){const xx=(v[i]-(lo[0]+hi[0])/2)*sx,zz=(v[i+2]-(lo[2]+hi[2])/2)*sz;out.push(x+xx*c-zz*s,elevation+(v[i+1]-lo[1])*sy,z+xx*s+zz*c,v[i+3]*tint[0],v[i+4]*tint[1],v[i+5]*tint[2]);}
}
export function dungeonBoundary(map){
  const w=Math.ceil(map.width)+2,h=Math.ceil(map.height)+2,cells=new Uint8Array(w*h);
  for(const r of [...map.rooms,...map.corridors])for(let y=Math.floor(r.y);y<r.y+r.h;y++)for(let x=Math.floor(r.x);x<r.x+r.w;x++)cells[y*w+x]=1;
  const occupied=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&cells[y*w+x];const segments=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(occupied(x,y)){if(!occupied(x,y-1))segments.push({x,y,w:1,h:0});if(!occupied(x,y+1))segments.push({x,y:y+1,w:1,h:0});if(!occupied(x-1,y))segments.push({x,y,w:0,h:1});if(!occupied(x+1,y))segments.push({x:x+1,y,w:0,h:1});}
  const rows=new Map();for(const e of segments){const cx=e.x+e.w/2,cy=e.y+e.h/2;e.height=map.rooms.some(r=>cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h)?3.2:1.3;const vertical=!!e.h,key=(vertical?'v:':'h:')+(vertical?e.x:e.y)+':'+e.height;if(!rows.has(key))rows.set(key,[]);rows.get(key).push(e);}const merged=[];for(const edges of rows.values()){edges.sort((a,b)=>a.h?a.y-b.y:a.x-b.x);for(const e of edges){const last=merged.at(-1);if(last&&last.h===e.h&&last.height===e.height&&last.w+last.h<2&&((e.h&&last.x===e.x&&last.y+last.h===e.y)||(!e.h&&last.y===e.y&&last.x+last.w===e.x))){last.w+=e.w;last.h+=e.h;}else merged.push({...e});}}
  return {segments:merged,occupied,w,h};
}
export class Map3D {
  constructor(){
    this.canvas=document.createElement('canvas');this.canvas.id='map3d';this.canvas.setAttribute('aria-hidden','true');document.body.prepend(this.canvas);
    this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});this.ready=false;this.stats={drawCalls:0,triangles:0,renderMs:0};this.chunks=[];this.quality=1;
    if(!this.gl){this.canvas.hidden=true;return;}
    const gl=this.gl;
    const shader=(type,source)=>{const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
    this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,'attribute vec3 aPosition;attribute vec3 aColor;uniform vec4 uCamera;uniform vec2 uSize;uniform vec2 uShake;varying vec3 vColor;void main(){vec3 p=aPosition;float x=(p.x-uCamera.x)*uCamera.z+uShake.x;float y=((p.z-uCamera.y)*.66-p.y*.75)*uCamera.z+uShake.y;float depth=clamp(-((p.z-uCamera.y)*.75+p.y*.66)/300.,-.99,.99);gl_Position=vec4(x*2./uSize.x,-y*2./uSize.y,depth,1.);vColor=aColor;}'));
    gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 vColor;uniform float uLava;uniform float uShadow;void main(){if(uShadow>.5){gl_FragColor=vec4(.025,.035,.06,vColor.r);}else{gl_FragColor=vec4(mix(vColor,vec3(.72,.23,.08),uLava*.5),1.);}}'));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    this.position=gl.getAttribLocation(this.program,'aPosition');this.color=gl.getAttribLocation(this.program,'aColor');this.camera=gl.getUniformLocation(this.program,'uCamera');this.size=gl.getUniformLocation(this.program,'uSize');this.shake=gl.getUniformLocation(this.program,'uShake');this.lava=gl.getUniformLocation(this.program,'uLava');this.shadowUniform=gl.getUniformLocation(this.program,'uShadow');
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.055,.065,.078,1);
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;this.canvas.hidden=true;});
    this.load();
  }
  async load(){try{this.models=globalThis.__DUNGEON_MODELS__||await (await fetch('assets/mini/selected-models.json')).json();this.ready=true;}catch{this.canvas.hidden=true;}}
  mesh(data){const gl=this.gl,buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return {buffer,count:data.length/6};}
  release(){if(this.staticProps)this.gl.deleteBuffer(this.staticProps.buffer);this.staticProps=null;this.obstacleKey=null;for(const c of this.chunks)this.gl.deleteBuffer(c.mesh.buffer);this.chunks=[];if(this.dynamic)this.gl.deleteBuffer(this.dynamic.buffer);this.dynamic=null;this.dynamicKey=null;if(this.shadows)this.gl.deleteBuffer(this.shadows.buffer);this.shadows=null;}
  build(map){
    this.release();this.map=map;this.mapKey=map.rooms.map(r=>[r.x,r.y,r.w,r.h].join(',')).join('|');
    const add=(out,key,x,z,w,h,d,a=0,t,elevation=0)=>appendModel(out,this.models[key],x,z,w,h,d,a,t,elevation);
    const plane=(out,x,z,w,d,color,y=.015)=>{for(const [xx,zz] of [[x,z],[x+w,z],[x,z+d],[x+w,z],[x+w,z+d],[x,z+d]])out.push(xx,y,zz,...color);};

    for(const r of map.rooms){const out=[],arena=map.mode==='arena',forest=arena&&[2,6,9].includes(r.id),pack=arena?'arena':'dungeon';
      // Large slabs have few triangles; relief comes from perimeter meshes and props.
      for(let x=r.x;x<r.x+r.w;x+=4)for(let z=r.y;z<r.y+r.h;z+=4){const w=Math.min(4,r.x+r.w-x),d=Math.min(4,r.y+r.h-z),variation=1-((Math.floor(x/4)*13+Math.floor(z/4)*7)%4)*.012;add(out,pack+'/floor',x+w/2,z+d/2,w,0,d,0,forest?[.68*variation,1.12*variation,.7*variation]:[variation*.83,variation*.84,variation*.82]);}
      // Offset stone courses, narrow mortar and restrained stone variation.
      if(!forest)for(let z=r.y+.1,row=0;z<r.y+r.h-.1;z+=1.8,row++)for(let x=r.x+.1-(row%2)*1.5;x<r.x+r.w-.1;x+=3){const left=Math.max(r.x+.1,x),right=Math.min(r.x+r.w-.1,x+2.96),d=Math.min(1.76,r.y+r.h-.1-z);if(right<=left)continue;const noise=((row*17+Math.floor(x)*11+r.id*7)%9+9)%9,t=arena?.43:.34;plane(out,left,z,right-left,d,[t+noise*.005,t+.02+noise*.005,t+.04+noise*.005],.016);}
      // A central inlay, border strips and small worn tiles give each chamber an identity.
      const gold=arena?[.46,.39,.25]:[.34,.29,.25],rug=arena?[.3,.32,.31]:r.id===7?[.31,.16,.2]:r.heal?[.2,.33,.3]:[.26,.28,.31];
      if(!forest){const rw=Math.min(10,r.w*.4),rd=Math.min(12,r.h*.5),rx=r.x+(r.w-rw)/2,rz=r.y+(r.h-rd)/2;plane(out,rx-.16,rz-.16,rw+.32,rd+.32,gold);plane(out,rx,rz,rw,rd,rug,.023);for(let i=0;i<4;i++)plane(out,rx+.5+i*(rw-1)/3,rz+.5,.16,rd-1,gold,.024);}
      const opening=(x,z)=>map.corridors.some(c=>x>=c.x-.6&&x<=c.x+c.w+.6&&z>=c.y-.6&&z<=c.y+c.h+.6);
      if(arena){for(let x=r.x+1;x<r.x+r.w;x+=2)for(const front of [false,true]){const z=front?r.y+r.h:r.y;if(!opening(x,z))add(out,pack+'/wall',x,z,2,3.2,.75,0);}for(let z=r.y+1;z<r.y+r.h;z+=2)for(const right of [false,true]){const x=right?r.x+r.w:r.x;if(!opening(x,z))add(out,pack+'/wall',x,z,2,3.2,.75,Math.PI/2);}}
      for(let i=0;i<4;i++){const x=r.x+3+i*(r.w-6)/3,z=r.y+2;
        if(forest){add(out,'forest/tree',x,z,2.2,3.1,2);add(out,'forest/plant',x+1.3,z+1,1.1,.45,1);}
        else{add(out,pack+'/column',x,r.y+.3,1,3.8,1);if(i%2===0)add(out,pack+'/banner',x+.9,r.y+.42,.9,1.5,.2,0,[1,.88,.84],1.45);}
      }
      if(!arena&&r.id===7)add(out,'dungeon/stairs',r.x+r.w/2,r.y+2,5,.7,3);
      if(arena&&r.central)add(out,'arena/statue',r.x+r.w/2,r.y+1.6,2.3,3.5,2.3);
      // Small, nonblocking edge dressing avoids covering playable corridors.
      if(!forest){add(out,'dungeon/barrel',r.x+1.4,r.y+r.h-2,1.1,1,1.1);add(out,'dungeon/pot',r.x+r.w-1.2,r.y+2,.8,.65,.8);add(out,'dungeon/stones',r.x+r.w-1,r.y+r.h-1,1.3,.45,1.1);if(r.id%2)add(out,'dungeon/rocks',r.x+1,r.y+2,1.2,.65,1.2);}
      this.chunks.push({room:r.id,bounds:r,mesh:this.mesh(out)});
    }
    const corridor=[];const boundary=dungeonBoundary(map);for(let y=0;y<boundary.h;y++)for(let x=0;x<boundary.w;x++)if(boundary.occupied(x,y)&&!map.rooms.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)){plane(corridor,x,y,1,1,[.34,.36,.38],.018);}
    this.chunks.push({room:null,bounds:{x:0,y:0,w:map.width,h:map.height},mesh:this.mesh(corridor)});
    if(map.mode==='dungeon'){const groups=new Map();for(const edge of boundary.segments){const key=Math.floor(edge.x/24)+':'+Math.floor(edge.y/24);if(!groups.has(key))groups.set(key,{out:[],x:Math.floor(edge.x/24)*24,y:Math.floor(edge.y/24)*24});const group=groups.get(key);add(group.out,'dungeon/wall',edge.x+edge.w/2,edge.y+edge.h/2,edge.w||edge.h,edge.height,.8,edge.h?Math.PI/2:0);}for(const g of groups.values())this.chunks.push({room:null,bounds:{x:g.x-1,y:g.y-1,w:27,h:27},mesh:this.mesh(g.out)});}
  }
  updateProps(s){
    // Network delta application preserves these array references until that collection
    // actually changes. Use that fact instead of JSON-stringifying every obstacle/chest/
    // trap on every requestAnimationFrame -- a surprisingly expensive hot path on
    // WhaleBooks when many actors are also animating.
    const obstacles=s.map.obstacles||[];
    if(obstacles!==this._obstaclesRef){this._obstaclesRef=obstacles;const data=[];for(const o of obstacles)appendModel(data,this.models[o.model||(o.fixed?(s.mode==='arena'?'arena/column':'dungeon/column'):'dungeon/barrel')],o.x+o.w/2,o.y+o.h/2,o.w,o.height||Math.max(1.2,o.h*.95),o.h);if(this.staticProps)this.gl.deleteBuffer(this.staticProps.buffer);this.staticProps=this.mesh(data);}
    const rooms=s.map.rooms||[],chests=s.chests||[],traps=s.traps||[];
    if(obstacles===this._dynamicObstaclesRef&&rooms===this._roomsRef&&chests===this._chestsRef&&traps===this._trapsRef)return;
    this._dynamicObstaclesRef=obstacles;this._roomsRef=rooms;this._chestsRef=chests;this._trapsRef=traps;
    const out=[],add=(key,x,z,w,h,d,a=0)=>appendModel(out,this.models[key],x,z,w,h,d,a);
    const box=(x,z,w,h,d,color,base=0)=>{const v=[[x-w/2,base,z-d/2],[x+w/2,base,z-d/2],[x+w/2,base+h,z-d/2],[x-w/2,base+h,z-d/2],[x-w/2,base,z+d/2],[x+w/2,base,z+d/2],[x+w/2,base+h,z+d/2],[x-w/2,base+h,z+d/2]];for(const [a,b,c,d,shade] of [[0,1,2,3,.75],[4,7,6,5,1],[0,3,7,4,.85],[1,5,6,2,.9],[3,2,6,7,1.15]])for(const i of [a,b,c,a,c,d])out.push(...v[i],...color.map(t=>t*shade));};
    for(const c of s.chests)add(c.opened?'dungeon/chest-open':'dungeon/chest',c.x,c.y,1.35,1.2,1.2);
    for(const t of s.traps)add('dungeon/trap',t.x,t.y,1.4,t.cool>0?.35:.12,1.4);
    if(s.mode==='dungeon')for(const r of s.map.rooms)if(r.id&&r.entry){const previous=s.map.rooms[r.id-1],doorWidth=s.map.corridorWidth||6;for(const door of [r.entry,{...previous.exit,angle:r.entry.angle}]){const a=door.angle||0,dx=Math.cos(a),dz=Math.sin(a);for(const side of [-1,1])add('dungeon/column',door.x+dx*side*doorWidth/2,door.y+dz*side*doorWidth/2,.85,3.6,.85);appendModel(out,this.models['dungeon/wall'],door.x,door.y,doorWidth+.6,.6,.85,a,[.92,.94,1],3.05);if(r.locked){add('dungeon/gate',door.x,door.y,doorWidth-.5,3.05,a?1.1:.55,a);if(a){box(door.x,door.y,1.4,2.85,doorWidth-.65,[.35,.19,.095]);for(const height of [.55,1.8])box(door.x,door.y,1.45,.15,doorWidth-.6,[.27,.29,.32],height);}}}}
    if(this.dynamic)this.gl.deleteBuffer(this.dynamic.buffer);this.dynamic=this.mesh(out);
    const shadows=[],ellipse=(x,z,rx,rz,opacity=.28)=>{const put=(x,z,a)=>shadows.push(x,.035,z,a,0,0);for(let i=0;i<20;i++){const a=i*Math.PI/10,b=(i+1)*Math.PI/10;put(x,z,opacity);put(x+Math.cos(a)*rx*.5,z+Math.sin(a)*rz*.5,opacity*.75);put(x+Math.cos(b)*rx*.5,z+Math.sin(b)*rz*.5,opacity*.75);for(const [angle,radius,alpha] of [[a,.5,opacity*.75],[a,1,0],[b,1,0],[a,.5,opacity*.75],[b,1,0],[b,.5,opacity*.75]])put(x+Math.cos(angle)*rx*radius,z+Math.sin(angle)*rz*radius,alpha);}};
    for(const o of obstacles)ellipse(o.x+o.w/2+.2,o.y+o.h/2+.35,o.w*.8,o.h*.72);
    for(const c of chests)ellipse(c.x+.12,c.y+.2,1,.72,.2);
    for(const r of rooms)for(let i=0;i<4;i++)ellipse(r.x+3+i*(r.w-6)/3,r.y+.5,.9,1.2,.2);
    if(this.shadows)this.gl.deleteBuffer(this.shadows.buffer);this.shadows=this.mesh(shadows);
  }
  draw(mesh,lava=0,shadow=false){const gl=this.gl;if(!mesh?.count)return;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(this.color,3,gl.FLOAT,false,24,12);gl.uniform1f(this.lava,lava);gl.uniform1f(this.shadowUniform,shadow?1:0);gl.drawArrays(gl.TRIANGLES,0,mesh.count);this.stats.drawCalls++;this.stats.triangles+=mesh.count/3;}
  render(s,camera,width,height,shakeX,shakeY){
    if(!this.ready)return false;const begin=performance.now(),gl=this.gl;
    // No retina multiplier: adjustable internal resolution while UI stays crisp.
    const w=Math.round(width*this.quality),h=Math.round(height*this.quality);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const key=s.map.rooms.map(r=>[r.x,r.y,r.w,r.h].join(',')).join('|');if(key!==this.mapKey||s.mode!==this.mode){this.mode=s.mode;this.build(s.map);}this.updateProps(s);
    gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.enableVertexAttribArray(this.position);gl.enableVertexAttribArray(this.color);gl.uniform4f(this.camera,camera.x,camera.y,camera.scale,0);gl.uniform2f(this.size,width,height);gl.uniform2f(this.shake,shakeX,shakeY);this.stats.drawCalls=0;this.stats.triangles=0;
    const pad=5,hw=width/camera.scale/2+pad,hh=height/camera.scale/MAP_Y_SCALE/2+pad;
    for(const chunk of this.chunks){const r=chunk.bounds;if(r.x+r.w<camera.x-hw||r.x>camera.x+hw||r.y+r.h<camera.y-hh||r.y>camera.y+hh)continue;this.draw(chunk.mesh,chunk.room!==null?s.map.rooms[chunk.room].lava:0);}
    this.draw(this.staticProps);this.draw(this.dynamic);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.draw(this.shadows,0,true);gl.depthMask(true);gl.disable(gl.BLEND);this.stats.renderMs=performance.now()-begin;return true;
  }
}





