import {clamp, distance} from './catalog.mjs';
export function buildMap(mode,random){
  const rooms=[],corridors=[],obstacles=[];
  if(mode==='dungeon'){
    const sizes=[[32,30],[44,30],[28,58],[48,30],[30,64],[44,34],[30,54],[48,40]],slots=[[0,0],[1,0],[1,1],[0,1],[0,2],[1,2],[2,2],[2,1]];
    for(let i=0;i<8;i++){const [w,h]=sizes[i],[col,row]=slots[i];rooms.push({id:i,x:col*64,y:row*78,w,h,theme:['entrance','storehouse','barracks','ruins','workshop','sanctum','spring','throne'][i],heal:i===6,editable:[2,3,4,5,7].includes(i),locked:i>0,lava:0});}
    for(let i=1;i<rooms.length;i++){
      const a=rooms[i-1],b=rooms[i],ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2};
      const horizontal=slots[i-1][1]===slots[i][1],forward=horizontal?bc.x>ac.x:bc.y>ac.y;
      const exit=horizontal?{x:forward?a.x+a.w:a.x,y:ac.y}:{x:ac.x,y:forward?a.y+a.h:a.y};
      const entry=horizontal?{x:forward?b.x:b.x+b.w,y:bc.y}:{x:bc.x,y:forward?b.y:b.y+b.h};
      a.exit={...exit};b.entry={...entry,angle:horizontal?Math.PI/2:0};b.entryGoal={x:entry.x+(horizontal?(forward?3:-3):0),y:entry.y+(!horizontal?(forward?3:-3):0)};
      const mid=horizontal?(exit.x+entry.x)/2:(exit.y+entry.y)/2;
      const points=horizontal?[exit,{x:mid,y:exit.y},{x:mid,y:entry.y},entry]:[exit,{x:exit.x,y:mid},{x:entry.x,y:mid},entry];
      for(let j=1;j<points.length;j++){const p=points[j-1],q=points[j];corridors.push({id:`c${i}-${j}`,to:i,x:Math.min(p.x,q.x)-3,y:Math.min(p.y,q.y)-3,w:Math.abs(p.x-q.x)+6,h:Math.abs(p.y-q.y)+6});}
    }
  }else{
    // Twelve varied rooms, short elbow corridors, one open central room.
    const widths=[34,42,48,38],heights=[34,44,38];
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const id=row*4+col,w=widths[col]-Math.floor(random()*3)*2,h=heights[row]-Math.floor(random()*3)*2;
      const x=widths.slice(0,col).reduce((a,b)=>a+b+6,0),y=heights.slice(0,row).reduce((a,b)=>a+b+6,0);
      rooms.push({id,x,y,w,h,lava:0,editable:false,central:id===5});
    }
    for(const r of rooms){
      const right=rooms[r.id+1];if(r.id%4<3){const y=r.y+r.h/2,yy=right.y+right.h/2,mid=(r.x+r.w+right.x)/2;corridors.push({x:r.x+r.w-1,y:y-3,w:mid-r.x-r.w+4,h:6},{x:mid-3,y:Math.min(y,yy)-3,w:6,h:Math.abs(y-yy)+6},{x:mid-3,y:yy-3,w:right.x-mid+4,h:6});}
      const bottom=rooms[r.id+4];if(bottom){const x=r.x+r.w/2,xx=bottom.x+bottom.w/2,mid=(r.y+r.h+bottom.y)/2;corridors.push({x:x-3,y:r.y+r.h-1,w:6,h:mid-r.y-r.h+4},{x:Math.min(x,xx)-3,y:mid-3,w:Math.abs(x-xx)+6,h:6},{x:xx-3,y:mid-3,w:6,h:bottom.y-mid+4});}
    }
  }
  if(mode==='dungeon'){for(const r of rooms){for(const k of ['x','y','w','h'])r[k]*=2;for(const p of [r.entry,r.exit,r.entryGoal].filter(Boolean)){p.x*=2;p.y*=2;}}for(const c of corridors)for(const k of ['x','y','w','h'])c[k]*=2;}
  for(const r of rooms){if(r.heal){obstacles.push({id:'healing-spring',room:r.id,x:r.x+r.w/2-1.6,y:r.y+r.h/2-1.6,w:3.2,h:3.2,height:1.6,model:'dungeon/pot',fixed:true});continue;}if(r.id===0&&mode==='dungeon'||r.central)continue;
    const layouts=[
      [['barrel',.22,.7,2,2,1.5],['barrel',.28,.7,2,2,1.5],['wood-structure',.65,.72,4,3,2.3],['pot',.78,.25,1.6,1.6,1.2],['table',.55,.23,4,2,1.2]],
      [['table',.3,.65,5,2.5,1.3],['chair',.27,.76,1.7,1.7,1.4],['chair',.43,.76,1.7,1.7,1.4],['wood-support',.73,.63,2,2,2.8],['barrel',.78,.22,2,2,1.5]],
      [['rocks',.25,.68,4,3,1.5],['wall-half',.62,.64,6,1.2,2],['stones',.72,.8,3,2,1],['column',.72,.23,2,2,3.3]],
      [['wood-structure',.24,.72,5,3,2.4],['table',.6,.67,4,2.5,1.3],['pot',.74,.75,1.8,1.8,1.3],['barrel',.8,.22,2,2,1.5],['wall-half',.45,.25,5,1.2,2]],
      [['column',.27,.65,2,2,3.4],['column',.7,.65,2,2,3.4],['stones',.43,.8,3,2,1],['pot',.72,.24,1.8,1.8,1.4],['wall-half',.5,.24,5,1.2,2.2]],
      [['wall-half',.25,.7,6,1.2,2.5],['wall-half',.64,.7,6,1.2,2.5],['column',.22,.25,2.3,2.3,3.5],['column',.75,.25,2.3,2.3,3.5],['rocks',.46,.82,3.5,2.5,1.4]]
    ];
    const forest=mode==='arena'&&[2,6,9].includes(r.id);
    const layout=layouts[(mode==='arena'?r.id+Math.floor(random()*layouts.length):r.id===7?5:r.id-1)%layouts.length];
    const arranged=mode==='dungeon'?layout.concat(layout.map(([model,px,py,w,h,height])=>[model,1-px,1-py,w,h,height])):layout;
    arranged.forEach(([model,px,py,w,h,height],i)=>{if(mode==='dungeon'){const factor=model==='column'?2:1.8;w*=factor;h*=factor;height*=model==='column'?1.6:1.25;}const x=r.x+r.w*px-w/2,y=r.y+r.h*py-h/2;
      if(x<r.x+2||y<r.y+2||x+w>r.x+r.w-2||y+h>r.y+r.h-2||obstacles.some(o=>o.room===r.id&&x<o.x+o.w+1&&x+w+1>o.x&&y<o.y+o.h+1&&y+h+1>o.y))return;
      // Keep the horizontal door lane and spawn/loot area clear.
      if(mode==='dungeon'){const center={x:r.x+r.w/2,y:r.y+r.h/2},rect={x:x-1.2,y:y-1.2,w:w+2.4,h:h+2.4};if([r.entry,r.exit].filter(Boolean).some(door=>segmentRect(door,center,rect)))return;}
      obstacles.push({id:`prop-${r.id}-${i}`,room:r.id,x,y,w,h,height,model:forest?(i%2?'forest/rocks-low':'forest/tree'):'dungeon/'+model,fixed:true});
    });
  }
  return {mode,corridorWidth:mode==='dungeon'?12:6,rooms,corridors,obstacles,width:Math.max(...rooms.map(r=>r.x+r.w)),height:Math.max(...rooms.map(r=>r.y+r.h))};
}
export function inside(p,r,pad=0){return p.x>=r.x+pad&&p.y>=r.y+pad&&p.x<=r.x+r.w-pad&&p.y<=r.y+r.h-pad;}
export const roomAt=(map,p)=>map.rooms.find(r=>inside(p,r));
export function walkable(map,p,radius=.35){
  const probes=[p,{x:p.x-radius,y:p.y},{x:p.x+radius,y:p.y},{x:p.x,y:p.y-radius},{x:p.x,y:p.y+radius}];
  return probes.every(q=>map.rooms.some(r=>inside(q,r))||map.corridors.some(r=>inside(q,r)&&(!r.to||!map.rooms[r.to].locked)))&&!map.obstacles.some(o=>inside(p,{x:o.x-radius,y:o.y-radius,w:o.w+2*radius,h:o.h+2*radius}));
}
export function segmentRect(a,b,r){
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y]]){
    if(Math.abs(p)<1e-9){if(q<0)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}
  }return true;
}
export function lineOfSight(map,a,b){
  if(map.obstacles.some(o=>segmentRect(a,b,o)))return false;
  const n=Math.ceil(distance(a,b)/.7);
  for(let i=1;i<n;i++){const q={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n};if(!map.rooms.some(r=>inside(q,r))&&!map.corridors.some(r=>inside(q,r)&&(!r.to||!map.rooms[r.to].locked)))return false;}
  return true;
}
export function move(map,e,dx,dy,roomOnly=false){
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.25));const home=roomOnly?map.rooms[e.room]:null;
  for(let i=0;i<count;i++){
    const x={x:e.x+dx/count,y:e.y},y={x:e.x,y:e.y+dy/count};
    if(walkable(map,x,e.boss?.7:.48)&&bodyClear(map,e,x)&&(!home||inside(x,home,.5)))e.x=x.x;
    y.x=e.x;if(walkable(map,y,e.boss?.7:.48)&&bodyClear(map,e,y)&&(!home||inside(y,home,.5)))e.y=y.y;
  }
  e.x=clamp(e.x,0,map.width);e.y=clamp(e.y,0,map.height);
}

export function bodyClear(map,e,p){
  if(e.dead)return true;
  return !(map.bodies||[]).some(t=>t!==e&&!t.dead&&distance(p,t)<(e.boss?.7:.48)+(t.boss?.7:.48)-.001);
}
// Small grid A*: cached by the caller, eight neighbours with no diagonal corner cutting.
export function findPath(map,start,target,home=null){const search=pathSearch(map,start,target,home);let result;do{result=search.next();}while(!result.done);return result.value;}
export function* pathSearch(map,start,target,home=null){
  const step=!home&&distance(start,target)>30?2:1,sx=Math.floor(start.x/step)*step+.5,sy=Math.floor(start.y/step)*step+.5;
  const key=(x,y)=>`${x},${y}`,open=[{x:sx,y:sy,g:0,f:distance(start,target)}],cost=new Map([[key(sx,sy),0]]),parents=new Map();
  const push=node=>{open.push(node);let i=open.length-1;while(i){const p=(i-1)>>1;if(open[p].f<=node.f)break;open[i]=open[p];i=p;}open[i]=node;};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let c=i*2+1;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(last.f<=open[c].f)break;open[i]=open[c];i=c;}open[i]=last;}return first;};
  const validity=new Map();const valid=p=>{const k=key(p.x,p.y);if(!validity.has(k))validity.set(k,walkable(map,p,.5)&&(!home||inside(p,home,.5)));return validity.get(k);};let goal=null,best=null;
  for(let n=0;open.length&&n<7000;n++){
    if(n&&n%64===0)yield null;
    const a=pop(),ak=key(a.x,a.y);
    if(a.g!==cost.get(ak))continue;
    if(!best||distance(a,target)<distance(best,target))best=a;
    if(distance(a,target)<1.2){goal=a;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const b={x:a.x+dx*step,y:a.y+dy*step};if(!valid(b)||!valid({x:a.x+dx*step/2,y:a.y+dy*step/2})||dx&&dy&&(!valid({x:a.x+dx*step,y:a.y})||!valid({x:a.x,y:a.y+dy*step})||!valid({x:a.x+dx*step/2,y:a.y})||!valid({x:a.x,y:a.y+dy*step/2})))continue;
      const bk=key(b.x,b.y),g=a.g+Math.hypot(dx,dy)*step;if(g>=(cost.get(bk)??Infinity))continue;
      cost.set(bk,g);parents.set(bk,a);push({...b,g,f:g+distance(b,target)});
    }
  }
  goal=goal||best;if(!goal)return [];const path=[];
  for(let a=goal;a&&path.length<1000;a=parents.get(key(a.x,a.y)))path.push({x:a.x,y:a.y});
  return path.reverse().slice(1);
}

