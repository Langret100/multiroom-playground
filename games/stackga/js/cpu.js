import { COLS, ROWS, SHAPES, mulberry32 } from "./game.js";

// CPU는 같은 배치 탐색을 쓰되 난이도별로 판단 시간과 실제 조작 속도를 다르게 둡니다.
function cloneBoard(b){
  return b.map(row => row.slice());
}

function collide(board, type, rot, px, py){
  const shape = SHAPES[type][rot];
  for(let y=0;y<4;y++){
    for(let x=0;x<4;x++){
      if(!shape[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if(bx < 0 || bx >= COLS || by >= ROWS) return true;
      if(by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function merge(board, type, rot, px, py, id){
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
  let cleared = 0;
  for(let y=ROWS-1; y>=0; y--){
    if(board[y].every(v=>v)){
      board.splice(y,1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }
  return cleared;
}

function evalBoard(board, cleared){
  // column heights
  const heights = new Array(COLS).fill(0);
  for(let x=0;x<COLS;x++){
    let h = 0;
    for(let y=0;y<ROWS;y++){
      if(board[y][x]){
        h = ROWS - y;
        break;
      }
    }
    heights[x] = h;
  }
  const aggHeight = heights.reduce((a,b)=>a+b,0);
  const maxHeight = Math.max(...heights);
  let bump = 0;
  for(let x=0;x<COLS-1;x++) bump += Math.abs(heights[x]-heights[x+1]);

  // holes
  let holes = 0;
  for(let x=0;x<COLS;x++){
    let seenBlock = false;
    for(let y=0;y<ROWS;y++){
      if(board[y][x]) seenBlock = true;
      else if(seenBlock) holes++;
    }
  }

  // Heuristic weights (tuned to be stronger but still human-like)
  let score = 0;
  score += cleared * 1200;          // clear lines
  score -= holes * 160;             // avoid holes strongly
  score -= aggHeight * 6;           // keep low
  score -= bump * 10;               // smoother
  score -= maxHeight * 12;          // avoid topping out
  return score;
}

export class CpuController {
  constructor(game, seed, difficulty = "low"){
    this.game = game;
    this.rnd = mulberry32((seed>>>0) || 1);
    this.lastPieceKey = "";
    this.targetX = 3;
    this.targetRot = 0;
    this.actionAcc = 0;
    const d = (String(difficulty||"low").toLowerCase());
    this.diff = (d === "high" || d === "hard" || d === "h") ? "high" : (d === "low" || d === "easy" || d === "l") ? "low" : "mid";
    this.actionMs = (this.diff === "high") ? 55 : (this.diff === "low") ? 145 : 95;
    this.jitterScale = (this.diff === "high") ? 3 : (this.diff === "low") ? 32 : 12;
    this.thinkMs = (this.diff === "high") ? 120 : (this.diff === "low") ? 650 : 360;
    this.thinkLeft = 0;
  }

  _plan(){
    const g = this.game;
    if(!g || g.dead || g.paused || !g.current) return;

    const type = g.current.type;
    const id = g.current.id || 7;
    const key = `${type}:${g.current.id}:${g.next?.type||""}`;
    if(this.lastPieceKey === key) return;
    this.lastPieceKey = key;
    // 새 블록이 뜨자마자 정답 위치로 순간이동하듯 처리하지 않는다.
    // 낮음은 약 0.7~1.0초 정도 보면서 실제 중력으로 먼저 내려오게 한다.
    const thinkJitter = this.diff === "low" ? Math.floor(this.rnd()*260) : Math.floor(this.rnd()*80);
    this.thinkLeft = this.thinkMs + thinkJitter;

    const base = cloneBoard(g.board);
    let best = { score: -1e18, x: g.current.x, rot: g.current.rot };

    for(let rot=0; rot<4; rot++){
      // x range broad enough for 4x4 matrices
      for(let x=-2; x<COLS; x++){
        let y = -3;
        // if collides at spawn area, skip
        if(collide(base, type, rot, x, y)) continue;
        while(!collide(base, type, rot, x, y+1)) y++;
        const b2 = cloneBoard(base);
        merge(b2, type, rot, x, y, id);
        const cleared = clearLines(b2);
        const sc = evalBoard(b2, cleared);

        // small randomness to avoid identical play (difficulty-dependent)
        const jitter = (this.rnd()-0.5) * (this.jitterScale || 3);
        const sc2 = sc + jitter;

        if(sc2 > best.score){
          best = { score: sc2, x, rot };
        }
      }
    }

    this.targetX = best.x;
    this.targetRot = best.rot;
  }

  update(dt){
    const g = this.game;
    if(!g || g.dead || g.paused) return;

    this._plan();

    if(this.thinkLeft > 0){
      this.thinkLeft = Math.max(0, this.thinkLeft - dt);
      return;
    }

    this.actionAcc += dt;
    while(this.actionAcc >= this.actionMs){
      this.actionAcc -= this.actionMs;

      // rotate toward target
      if(g.current && g.current.rot !== this.targetRot){
        g.rotate(1);
        continue;
      }
      // move toward target x
      if(g.current && g.current.x < this.targetX){
        g.move(1);
        continue;
      }
      if(g.current && g.current.x > this.targetX){
        g.move(-1);
        continue;
      }

      // 낮음은 블록이 실제로 내려가는 모습을 보이면서 쌓는다.
      // 중/높음만 기존 빠른 hard drop을 사용한다.
      if(this.diff === "low"){
        g.softDrop();
      }else{
        g.hardDrop();
      }
    }
  }
}
