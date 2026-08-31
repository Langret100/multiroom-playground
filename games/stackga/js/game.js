
export const COLS = 10;
// 요청: 기존 20행 기준에서 +3행 고정
export const ROWS = 23;

export const SHAPES = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  ],
  T: [
    [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  S: [
    [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
    [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  Z: [
    [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]],
  ],
  J: [
    [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]],
  ],
  L: [
    [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
    [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
};

const TYPES = ["I","O","T","S","Z","J","L"];

export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBagRng(seed){
  const rnd = mulberry32(seed);
  let bag = [];
  function refill(){
    bag = TYPES.slice();
    for(let i=bag.length-1;i>0;i--){
      const j = Math.floor(rnd()*(i+1));
      [bag[i],bag[j]] = [bag[j],bag[i]];
    }
  }
  refill();
  return () => {
    if(bag.length===0) refill();
    return bag.pop();
  };
}

export function newBoard(){
  return Array.from({length:ROWS},()=>Array.from({length:COLS},()=>0));
}

export function cloneBoard(b){
  return b.map(r=>r.slice());
}

function collide(board, piece, px, py, rot){
  const shape = SHAPES[piece.type][rot];
  for(let y=0;y<4;y++){
    for(let x=0;x<4;x++){
      if(!shape[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if(bx<0 || bx>=COLS || by>=ROWS) return true;
      if(by>=0 && board[by][bx]) return true;
    }
  }
  return false;
}

function merge(board, piece){
  const {x:px, y:py, rot, type, id} = piece;
  const shape = SHAPES[type][rot];
  for(let y=0;y<4;y++){
    for(let x=0;x<4;x++){
      if(!shape[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if(by>=0 && by<ROWS && bx>=0 && bx<COLS) board[by][bx] = id;
    }
  }
}

function clearLines(board){
  // Capture row indexes before mutating the board so freshly locked cells can
  // keep their jelly/morph animation attached to the same physical blocks.
  const rows = [];
  for(let y=0;y<ROWS;y++) if(board[y].every(v=>v!==0)) rows.push(y);
  if(!rows.length) return { cleared:0, rows };

  const rowSet = new Set(rows);
  const kept = board.filter((_,y)=>!rowSet.has(y));
  while(kept.length<ROWS) kept.unshift(Array.from({length:COLS},()=>0));
  board.splice(0, board.length, ...kept);
  return { cleared:rows.length, rows };
}

export class StackGame {
  constructor(seed){
    this.seed = seed>>>0;
    this.getNextType = makeBagRng(this.seed);
    this.board = newBoard();
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropMs = 900;
    this.gravityAcc = 0;
    this.paused = false;

    this.effects = {
      invertUntil: 0,
      shrinkUntil: 0,
      bigNextUntil: 0
    };

    // RNG for garbage-hole positions
    this._garbageRnd = mulberry32(((this.seed ^ 0xA5A5A5A5)>>>0) || 1);
    this._colorRnd = mulberry32(((this.seed ^ 0x3F91C2D7)>>>0) || 1);
    this.lastLockAt = 0;
    this.lastLockCells = [];
    // Purely local render events. These never enter multiplayer/server snapshots.
    this.lastContactAt = 0;
    this.lastContactCells = [];
    this.lastCascadeAt = 0;
    this.lastCascadeCells = [];
    // Local-only line clear presentation. The board rules/network state are unchanged.
    this.lastClearAt = 0;
    this.lastClearRows = [];
    this.lastClearCells = [];

    this.current = null;
    this.next = this._makePiece();
    this.dead = false;
    this.lastCleared = 0;
    this.spawn();
  }

  _makePiece(){
    const type = this.getNextType();
    // Shape and color are intentionally independent: every falling piece gets a fresh jelly color.
    const id = 1 + Math.floor(this._colorRnd()*7);
    return { type, id, x:3, y:-1, rot:0 };
  }

  spawn(){
    this.current = this.next;
    this.current.x = 3; this.current.y = -1; this.current.rot = 0;
    this.next = this._makePiece();
    if(this._isBigNextActive()){
      // No physics change, only render enlargement handled in renderer.
    }
    if(collide(this.board,this.current,this.current.x,this.current.y,this.current.rot)){
      this.dead = true;
    }
  }

  _isInvertActive(now=Date.now()){ return now < this.effects.invertUntil; }
  _isShrinkActive(now=Date.now()){ return now < this.effects.shrinkUntil; }
  _isBigNextActive(now=Date.now()){ return now < this.effects.bigNextUntil; }

  applyEffect(kind, ms){
    const now = Date.now();
    if(kind==="invert") this.effects.invertUntil = Math.max(this.effects.invertUntil, now+ms);
    if(kind==="shrink") this.effects.shrinkUntil = Math.max(this.effects.shrinkUntil, now+ms);
    if(kind==="bignext") this.effects.bigNextUntil = Math.max(this.effects.bigNextUntil, now+ms);
  }
  addGarbage(lines){
    if(this.dead || this.paused) return;
    const n = Math.max(0, lines|0);
    for(let i=0;i<n;i++){
      // If blocks are already in the top row, rising garbage causes top-out.
      if(this.board[0].some(v=>v)){
        this.dead = true;
        return;
      }
      const hole = Math.floor(this._garbageRnd()*COLS);
      const row = new Array(COLS).fill(8);
      row[hole] = 0;

      // Rising garbage: shift everything up, insert garbage at bottom
      this.board.shift();
      this.board.push(row);

      // If the active piece now overlaps, try pushing it up a bit; otherwise top-out.
      if(this.current && collide(this.board, this.current, this.current.x, this.current.y, this.current.rot)){
        let ok = false;
        for(let k=0;k<4;k++){
          this.current.y -= 1;
          if(!collide(this.board, this.current, this.current.x, this.current.y, this.current.rot)){
            ok = true;
            break;
          }
        }
        if(!ok){
          this.dead = true;
          return;
        }
      }
    }
  }


  tick(dt){
    if(this.dead || this.paused) return;
    this.gravityAcc += dt;
    const ms = this._computeDropMs();
    while(this.gravityAcc >= ms){
      this.gravityAcc -= ms;
      this.softDrop();
      if(this.dead) break;
    }
  }

  _computeDropMs(){
    // faster by level
    return Math.max(120, this.dropMs - (this.level-1)*70);
  }

  move(dx){
    if(this.dead || this.paused) return false;
    const nx = this.current.x + dx;
    if(!collide(this.board,this.current,nx,this.current.y,this.current.rot)){
      this.current.x = nx;
      // Local-only airborne jelly inertia. Never serialized or sent to the server.
      this.lastAirMoveAt = Date.now();
      this.lastAirMoveDir = dx < 0 ? -1 : 1;
      return true;
    }
    return false;
  }

  rotate(dir){
    if(this.dead || this.paused) return false;
    const nr = (this.current.rot + (dir>0?1:3)) % 4;
    // simple wall kicks
    const kicks = [0,-1,1,-2,2];
    for(const k of kicks){
      const nx = this.current.x + k;
      if(!collide(this.board,this.current,nx,this.current.y,nr)){
        this.current.rot = nr;
        this.current.x = nx;
        return true;
      }
    }
    return false;
  }

  hardDrop(){
    if(this.dead || this.paused) return;
    while(!collide(this.board,this.current,this.current.x,this.current.y+1,this.current.rot)){
      this.current.y += 1;
    }
    this._lock();
  }

  softDrop(){
    if(this.dead || this.paused) return;
    if(!collide(this.board,this.current,this.current.x,this.current.y+1,this.current.rot)){
      this.current.y += 1;
    } else {
      this._lock();
    }
  }

  _lock(){
    const shape = SHAPES[this.current.type][this.current.rot];
    const now = Date.now();
    this.lastLockCells = [];
    const pieceCells = [];
    for(let y=0;y<4;y++) for(let x=0;x<4;x++) if(shape[y][x]){
      const bx=this.current.x+x, by=this.current.y+y;
      if(by>=0 && by<ROWS && bx>=0 && bx<COLS){
        this.lastLockCells.push([bx,by]);
        pieceCells.push([bx,by]);
      }
    }

    // Existing blocks directly touched by the landing piece get a small secondary jelly reaction.
    const pieceSet = new Set(pieceCells.map(([x,y])=>`${x},${y}`));
    const contact = new Map();
    for(const [bx,by] of pieceCells){
      for(const [dx,dy] of [[0,1],[-1,0],[1,0],[0,-1]]){
        const x=bx+dx, y=by+dy;
        if(x<0 || x>=COLS || y<0 || y>=ROWS || pieceSet.has(`${x},${y}`)) continue;
        if(this.board[y][x]) contact.set(`${x},${y}`,[x,y]);
      }
    }
    this.lastContactAt = now;
    this.lastContactCells = [...contact.values()];
    this.lastLockAt = now;

    merge(this.board,this.current);

    // Capture where every surviving pre-clear block will settle. This powers only
    // client-side jelly/recolour animation after a line clear.
    const fullRows = [];
    for(let y=0;y<ROWS;y++) if(this.board[y].every(v=>v!==0)) fullRows.push(y);
    const fullSet = new Set(fullRows);
    // Keep a tiny render-only copy of completed rows so they can flash/pop before
    // disappearing. Gameplay still clears immediately, so multiplayer timing is untouched.
    if(fullRows.length){
      this.lastClearAt = now;
      this.lastClearRows = fullRows.slice();
      this.lastClearCells = fullRows.map(y=>({y, cells:this.board[y].slice()}));
    } else {
      this.lastClearAt = 0;
      this.lastClearRows = [];
      this.lastClearCells = [];
    }
    const cascade = [];
    if(fullRows.length){
      for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
        const id=this.board[y][x];
        if(!id || fullSet.has(y)) continue;
        const shift=fullRows.filter(r=>r>y).length;
        if(shift>0) cascade.push({x, fromY:y, toY:y+shift, id});
      }
    }

    const clearResult = clearLines(this.board);
    const cleared = clearResult.cleared;
    if(cleared>0){
      const clearedSet = new Set(clearResult.rows);
      this.lastLockCells = this.lastLockCells
        .filter(([,y])=>!clearedSet.has(y))
        .map(([x,y])=>[x, y + clearResult.rows.filter(r=>r>y).length]);
      this.lastContactCells = this.lastContactCells
        .filter(([,y])=>!clearedSet.has(y))
        .map(([x,y])=>[x, y + clearResult.rows.filter(r=>r>y).length]);
      // Let the clear flash finish first, then visually drop the surviving rows.
      // This timestamp may be slightly in the future on purpose.
      this.lastCascadeAt = now + 235;
      this.lastCascadeCells = cascade;
    } else {
      this.lastCascadeAt = 0;
      this.lastCascadeCells = [];
    }
    this.lastCleared = cleared;
    if(cleared>0){
      const pts = [0,100,250,450,700][cleared] || (cleared*250);
      this.score += pts * this.level;
      this.lines += cleared;
      this.level = 1 + Math.floor(this.lines / 10);
    }
    this.spawn();
    if(this.dead){
      // keep board as-is
    }
  }

  snapshot(){
    // board with current piece overlaid
    const b = cloneBoard(this.board);
    if(!this.dead && this.current){
      const shape = SHAPES[this.current.type][this.current.rot];
      for(let y=0;y<4;y++){
        for(let x=0;x<4;x++){
          if(!shape[y][x]) continue;
          const bx = this.current.x + x;
          const by = this.current.y + y;
          if(by>=0 && by<ROWS && bx>=0 && bx<COLS) b[by][bx] = this.current.id;
        }
      }
    }
    return b;
  }
}

export function drawBoard(ctx, board, cell, opts={}){
  const { ghost=false, activePiece=null, lastLockAt=0, lastLockCells=[], lastContactAt=0, lastContactCells=[], lastCascadeAt=0, lastCascadeCells=[], lastClearAt=0, lastClearRows=[], lastClearCells=[], lastAirMoveAt=0, lastAirMoveDir=0 } = opts;
  const now = Date.now();
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const bg = ctx.createLinearGradient(0,0,0,ctx.canvas.height);
  // Soft night-sky board: visibly blue, but still bright enough for jelly blocks.
  bg.addColorStop(0,"rgba(35,58,104,.985)");
  bg.addColorStop(.48,"rgba(48,82,132,.985)");
  bg.addColorStop(1,"rgba(74,112,154,.99)");
  ctx.fillStyle=bg; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  // Tiny fixed stars keep the sky readable without distracting from cells.
  ctx.save();
  for(let i=0;i<18;i++){
    const sx=((i*97+31)%997)/997*ctx.canvas.width;
    const sy=((i*53+17)%431)/431*ctx.canvas.height*.58;
    const rr=Math.max(0.8,cell*.022*((i%3)+1)*.52);
    ctx.fillStyle=`rgba(255,255,255,${.18+(i%4)*.07})`;
    ctx.beginPath(); ctx.arc(sx,sy,rr,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();

  const active = new Set();
  // Line-clear celebration: the completed row dissolves as one surface.
  // No per-cell timing/scale; gameplay state is already cleared immediately.
  const clearAge=now-lastClearAt;
  if(!ghost && lastClearAt && clearAge>=0 && clearAge<390 && Array.isArray(lastClearCells)){
    const white={rgb:[250,253,255],a:.98};
    for(const row of lastClearCells){
      const y=row.y|0, cells=row.cells||[];
      const cy=(y+.5)*cell;
      const flashT=Math.max(0,Math.min(1,clearAge/90));
      const dissolveT=Math.max(0,Math.min(1,(clearAge-75)/210));
      const fade=1-(dissolveT*dissolveT*(3-2*dissolveT));

      // Keep the entire completed line coherent: every cell brightens/fades together.
      if(fade>.02){
        for(let x=0;x<COLS;x++){
          const v=cells[x]||1;
          const base=settledColor(y,v,false);
          const pulse=Math.sin(flashT*Math.PI);
          let color=mixColor(base,white,.38+.50*pulse);
          color={rgb:color.rgb,a:Math.max(0,.98*fade)};
          drawJellyCell(ctx,x*cell,y*cell,cell,color,{sx:1,sy:1,dy:-cell*.025*dissolveT,sparkle:false,t:now,x,y,settleGlow:1});
        }
      }

      // One soft light ribbon sweeps through the whole line before it dissolves.
      if(clearAge<225){
        const sweep=Math.max(0,Math.min(1,(clearAge-20)/155));
        const x0=-ctx.canvas.width*.25 + ctx.canvas.width*1.5*sweep;
        const band=ctx.createLinearGradient(x0-cell*2,0,x0+cell*2,0);
        band.addColorStop(0,'rgba(255,255,255,0)');
        band.addColorStop(.42,'rgba(220,248,255,.18)');
        band.addColorStop(.5,'rgba(255,255,255,.96)');
        band.addColorStop(.58,'rgba(255,241,176,.34)');
        band.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=band;
        ctx.fillRect(0,cy-cell*.18,ctx.canvas.width,cell*.36);
      }

      // Sparkles lift from across the whole row, so it reads as one dissolving line.
      if(clearAge>72 && clearAge<390){
        const p=(clearAge-72)/318;
        ctx.save();
        for(let i=0;i<28;i++){
          const seed=(i*61+y*37)%101;
          const baseX=((i+.35+(seed%7)*.035)/28)*ctx.canvas.width;
          const side=((seed%9)-4)*cell*.028*p;
          const px=baseX+side;
          const py=cy - cell*(.10+.72*p) + Math.sin(seed*.83+i)*cell*.16*(1-p);
          const r=Math.max(1,cell*(.018+.018*((seed%5)/4)))*(1-p*.55);
          const alpha=Math.max(0,.92-p*.82);
          ctx.globalAlpha=alpha;
          ctx.fillStyle=(i%4===0)?'#fff0a8':(i%3===0?'#bff7ff':'#ffffff');
          ctx.translate(px,py);
          ctx.rotate((seed+i)*.17);
          ctx.beginPath();
          ctx.moveTo(0,-r*1.8); ctx.lineTo(r*.45,-r*.45); ctx.lineTo(r*1.8,0); ctx.lineTo(r*.45,r*.45);
          ctx.lineTo(0,r*1.8); ctx.lineTo(-r*.45,r*.45); ctx.lineTo(-r*1.8,0); ctx.lineTo(-r*.45,-r*.45); ctx.closePath(); ctx.fill();
          ctx.setTransform(1,0,0,1,0,0);
        }
        ctx.restore();
      }
    }
  }

  if(activePiece){
    const sh=SHAPES[activePiece.type][activePiece.rot];
    for(let yy=0;yy<4;yy++) for(let xx=0;xx<4;xx++) if(sh[yy][xx]) active.add(`${activePiece.x+xx},${activePiece.y+yy}`);
  }
  const lockedSet = new Set((lastLockCells||[]).map(([x,y])=>`${x},${y}`));
  const contactSet = new Set((lastContactCells||[]).map(([x,y])=>`${x},${y}`));
  const cascadeMap = new Map((lastCascadeCells||[]).map(c=>[`${c.x},${c.toY}`,c]));
  const cascadeClusterMap = buildCascadeClusterMap(lastCascadeCells||[]);
  const age = now-lastLockAt;
  const contactAge = now-lastContactAt;
  const cascadeAge = now-lastCascadeAt;
  const wobble = age>=0 && age<430 ? Math.sin(age/36)*Math.exp(-age/230) : 0;

  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
    const v=board[y][x];
    if(!v){
      ctx.fillStyle="rgba(220,236,255,.065)";
      roundRect(ctx,x*cell+1,y*cell+1,cell-2,cell-2,Math.max(2,cell*.14)); ctx.fill();
      continue;
    }
    const key=`${x},${y}`;
    const isActive=active.has(key);
    let sx=1, sy=1, dy=0;
    const isFreshLock=!ghost && !isActive && lockedSet.has(key);
    const isContact=!ghost && !isActive && !isFreshLock && contactSet.has(key);
    const cascadeInfo=!ghost && !isActive ? cascadeMap.get(key) : null;
    if(isFreshLock && age<430){
      sx=1+wobble*.12; sy=1-wobble*.17; dy=wobble*cell*.045;
    } else if(isContact && contactAge>=0 && contactAge<300){
      const cw=Math.sin(contactAge/31)*Math.exp(-contactAge/165);
      sx=1+cw*.048; sy=1-cw*.075; dy=cw*cell*.025;
    } else if(cascadeInfo){
      const dropRows=Math.max(0,cascadeInfo.toY-cascadeInfo.fromY);
      const clusterMeta=cascadeClusterMap.get(key);
      if(cascadeAge<0 && cascadeAge>-260){
        // While the completed row is flashing, visually keep surviving blocks
        // at their old height so the board does not appear to teleport.
        dy=-dropRows*cell;
      } else if(cascadeAge>=0 && cascadeAge<560){
        // Connected floating chunks should feel like one soft jelly mass, not
        // a set of independent squares. So use one cluster timing/phase.
        const fallT=Math.max(0,Math.min(1,cascadeAge/175));
        const ease=1-Math.pow(1-fallT,3);
        const delay=Math.max(0,(ROWS-1-(clusterMeta?.bottomY ?? y)))*6;
        const ca=Math.max(0,cascadeAge-delay);
        const phase=clusterMeta?.phase || 0;
        const cw=Math.sin(ca/39 + phase)*Math.exp(-ca/260);
        const stretch=Math.min(.02, ((clusterMeta?.size || 1)-1)*.0028);
        dy=-dropRows*cell*(1-ease)+cw*cell*.035;
        sx=1+cw*(.065+stretch); sy=1-cw*(.10+stretch*1.25);
      }
    }

    // Keep the falling jelly color for a beat, then let the block naturally
    // absorb the palette of the layer it landed in instead of snapping.
    const targetColor=isActive ? fallingColor(v,ghost) : settledColor(y,v,ghost);
    let cellColor=targetColor;
    let settleMix=1;
    if(isFreshLock && age>=0 && age<820 && v!==8){
      const raw=Math.max(0,Math.min(1,(age-120)/700));
      settleMix=raw*raw*(3-2*raw);
      cellColor=mixColor(fallingColor(v,false),targetColor,settleMix);
    } else if(cascadeInfo && cascadeAge<650 && v!==8){
      // A block that physically moved down after a clear keeps its former layer
      // colour through the flash, then re-dyes as it settles into the new height.
      if(cascadeAge<0){
        cellColor=settledColor(cascadeInfo.fromY,v,false);
      }else{
        const raw=Math.max(0,Math.min(1,(cascadeAge-25)/500));
        const k=raw*raw*(3-2*raw);
        cellColor=mixColor(settledColor(cascadeInfo.fromY,v,false),targetColor,k);
      }
    }
    drawJellyCell(ctx,x*cell,y*cell,cell,cellColor,{
      sx,sy,dy,
      sparkle:!isActive && v!==8 && (ROWS-y)>=9 && (!isFreshLock || settleMix>.58),
      t:now,x,y,
      settleGlow:isFreshLock ? Math.sin(Math.min(1,Math.max(0,(age-80)/620))*Math.PI) : 0
    });
  }
  if(activePiece){
    const sh=SHAPES[activePiece.type][activePiece.rot];
    const airAge = now - lastAirMoveAt;
    let airSx=1, airSy=1, airDx=0, airSkew=0;
    if(!ghost && lastAirMoveAt && airAge>=0 && airAge<260){
      const decay=Math.exp(-airAge/145);
      const wave=Math.sin((airAge+26)/48);
      // Stretch in the travel direction, then overshoot softly on the rebound.
      airSx=1 + (.115*decay) + (.025*wave*decay);
      airSy=1 - (.075*decay) - (.018*wave*decay);
      airDx=(lastAirMoveDir||0)*cell*(.105*decay + .025*wave*decay);
      airSkew=(lastAirMoveDir||0)*.09*decay;
    }

    // Airborne tetrominoes are one connected jelly body. Previously each cell
    // applied sx/sy/skew around its own centre, so a 4-cell piece looked like
    // four separate gummies wobbling. Transform the whole connected piece once
    // around its shared centre, then render its cells without per-cell squash.
    const airCells=[];
    for(let yy=0;yy<4;yy++) for(let xx=0;xx<4;xx++) if(sh[yy][xx]){
      const bx=activePiece.x+xx, by=activePiece.y+yy;
      if(by<0 || by>=ROWS || bx<0 || bx>=COLS) continue;
      airCells.push([bx,by]);
    }
    if(airCells.length){
      const minX=Math.min(...airCells.map(c=>c[0]));
      const maxX=Math.max(...airCells.map(c=>c[0]));
      const minY=Math.min(...airCells.map(c=>c[1]));
      const maxY=Math.max(...airCells.map(c=>c[1]));
      const centerX=((minX+maxX+1)*cell)*.5;
      const centerY=((minY+maxY+1)*cell)*.5;
      ctx.save();
      ctx.translate(centerX+airDx,centerY);
      ctx.transform(airSx,0,airSkew,airSy,0,0);
      ctx.translate(-centerX,-centerY);
      for(const [bx,by] of airCells){
        drawJellyCell(ctx,bx*cell,by*cell,cell,fallingColor(activePiece.id,ghost),{sx:1,sy:1,dy:0,skewX:0,sparkle:false,t:now,x:bx,y:by});
      }
      ctx.restore();
    }
  }
}

export function drawNext(ctx, piece, cell){
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const bg=ctx.createLinearGradient(0,0,0,ctx.canvas.height); bg.addColorStop(0,"#263f72"); bg.addColorStop(1,"#466f9d");
  ctx.fillStyle=bg; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  if(!piece) return;
  const shape=SHAPES[piece.type][0];
  for(let y=0;y<4;y++) for(let x=0;x<4;x++) if(shape[y][x]) drawJellyCell(ctx,x*cell,y*cell,cell,fallingColor(piece.id,false),{sx:1,sy:1,dy:0,sparkle:false,t:0,x,y});
}

function roundRect(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function fallingColor(v,ghost){
  const c=[[0,0,0],[58,201,255],[70,225,175],[255,196,79],[168,115,255],[255,102,170],[255,137,78],[102,151,255]][v]||[110,200,255];
  return {rgb:c,a:ghost?.55:.94};
}
function lerp(a,b,t){ return a+(b-a)*t; }
function mixColor(a,b,t){
  const k=Math.max(0,Math.min(1,t));
  return {
    rgb:[
      Math.round(lerp(a.rgb[0],b.rgb[0],k)),
      Math.round(lerp(a.rgb[1],b.rgb[1],k)),
      Math.round(lerp(a.rgb[2],b.rgb[2],k))
    ],
    a:lerp(a.a,b.a,k)
  };
}
function buildCascadeClusterMap(cells){
  const out = new Map();
  if(!Array.isArray(cells) || !cells.length) return out;
  const byKey = new Map(cells.map(cell=>[`${cell.x},${cell.toY}`, cell]));
  const seen = new Set();
  for(const cell of cells){
    const startKey = `${cell.x},${cell.toY}`;
    if(seen.has(startKey)) continue;
    const stack = [cell];
    const cluster = [];
    seen.add(startKey);
    while(stack.length){
      const cur = stack.pop();
      cluster.push(cur);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nextKey = `${cur.x+dx},${cur.toY+dy}`;
        const next = byKey.get(nextKey);
        if(next && !seen.has(nextKey)){
          seen.add(nextKey);
          stack.push(next);
        }
      }
    }
    const bottomY = Math.max(...cluster.map(v=>v.toY));
    const topY = Math.min(...cluster.map(v=>v.toY));
    const leftX = Math.min(...cluster.map(v=>v.x));
    const maxDrop = Math.max(...cluster.map(v=>Math.max(0, v.toY - v.fromY)));
    const phase = (((leftX+1)*17 + (topY+1)*11 + cluster.length*5) % 29) / 29 * Math.PI * 2;
    const meta = { bottomY, topY, leftX, maxDrop, size: cluster.length, phase };
    for(const member of cluster) out.set(`${member.x},${member.toY}`, meta);
  }
  return out;
}
function paletteAt(t){
  // bottom -> fresh mint/green -> violet -> cobalt -> deep starry blue
  const stops=[
    [0.00,[132,239,174]],
    [0.22,[87,220,194]],
    [0.43,[147,116,244]],
    [0.64,[78,120,240]],
    [0.82,[43,91,200]],
    [1.00,[20,43,116]]
  ];
  const x=Math.max(0,Math.min(1,t));
  for(let i=1;i<stops.length;i++){
    if(x<=stops[i][0]){
      const [p0,c0]=stops[i-1], [p1,c1]=stops[i];
      const k=(x-p0)/(p1-p0 || 1);
      return c0.map((v,j)=>Math.round(lerp(v,c1[j],k)));
    }
  }
  return stops[stops.length-1][1].slice();
}
function settledColor(y,v,ghost){
  if(v===8) return {rgb:[137,160,186],a:ghost?.42:.72};
  const h=ROWS-y;
  const t=Math.min(1,Math.max(0,(h-1)/14));
  const rgb=paletteAt(t);
  const upper=Math.max(0,Math.min(1,(h-8)/8));
  const a=lerp(.95,.71,upper)*(ghost?.58:1);
  return {rgb,a};
}
function drawJellyCell(ctx,px,py,cell,color,o){
  // Keep pieces visually connected: only a hairline gutter between cells.
  const pad=Math.max(.28,cell*.008), w=cell-pad*2, h=cell-pad*2;
  ctx.save(); ctx.translate(px+cell/2,py+cell/2+(o.dy||0));
  if(o.skewX) ctx.transform(1,0,o.skewX,1,0,0);
  ctx.scale(o.sx||1,o.sy||1); ctx.translate(-cell/2,-cell/2);
  const [r,g,b]=color.rgb; const grad=ctx.createLinearGradient(0,pad,0,cell-pad);
  grad.addColorStop(0,`rgba(${Math.min(255,r+35)},${Math.min(255,g+35)},${Math.min(255,b+38)},${color.a})`);
  grad.addColorStop(.48,`rgba(${r},${g},${b},${color.a})`);
  grad.addColorStop(1,`rgba(${Math.max(0,r-14)},${Math.max(0,g-16)},${Math.max(0,b-12)},${color.a})`);
  ctx.fillStyle=grad;
  // A tighter shadow keeps the jelly crisp instead of looking low-resolution/blurred.
  ctx.shadowColor=`rgba(${r},${g},${b},${.18+.12*(o.settleGlow||0)})`;
  ctx.shadowBlur=cell*(.038+.022*(o.settleGlow||0));
  roundRect(ctx,pad,pad,w,h,Math.max(1.8,cell*.125)); ctx.fill(); ctx.shadowBlur=0;
  const gloss=ctx.createLinearGradient(0,pad,0,cell*.42);
  gloss.addColorStop(0,"rgba(255,255,255,.58)"); gloss.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=gloss; roundRect(ctx,pad+cell*.055,pad+cell*.045,w-cell*.11,h*.34,Math.max(1.8,cell*.11)); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.52)"; ctx.lineWidth=Math.max(1,cell*.027);
  roundRect(ctx,pad+.5,pad+.5,w-1,h-1,Math.max(1.8,cell*.125)); ctx.stroke();
  if(o.sparkle){
    const phase=(o.t/260 + o.x*1.7 + o.y*.9);
    if(Math.sin(phase)>0.2){
      ctx.fillStyle=`rgba(255,255,255,${.32+.28*Math.sin(phase)})`;
      const cx=cell*(.25+((o.x*37+o.y*17)%48)/100), cy=cell*(.25+((o.x*13+o.y*29)%42)/100), rr=Math.max(1.1,cell*.055);
      ctx.beginPath(); ctx.moveTo(cx,cy-rr*1.8); ctx.lineTo(cx+rr*.5,cy-rr*.5); ctx.lineTo(cx+rr*1.8,cy); ctx.lineTo(cx+rr*.5,cy+rr*.5); ctx.lineTo(cx,cy+rr*1.8); ctx.lineTo(cx-rr*.5,cy+rr*.5); ctx.lineTo(cx-rr*1.8,cy); ctx.lineTo(cx-rr*.5,cy-rr*.5); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
