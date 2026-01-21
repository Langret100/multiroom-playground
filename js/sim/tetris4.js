// Very small 4-player lockstep-friendly mini "block stacking" demo.
// Replace this file with your real tetris engine later.
class Tetris4Sim {
  constructor({ me, order, nicks }){
    this.me = me;
    this.order = order;
    this.nicks = nicks || {}; // map sessionId => seat index
    this.tick = 0;
    this.players = {};
    for (const sid of Object.keys(order)){
      this.players[sid] = { x: 4, y: 0, score: 0, dead: false };
    }
    this.gridW = 10; this.gridH = 18;
    this.gravityEvery = 8;
    this.blocks = {}; // per player: set of filled cells as Set("x,y")
    for (const sid of Object.keys(order)) this.blocks[sid] = new Set();
  }

  step(frame){
    // frame.inputs: sid -> mask
    this.tick = frame.tick;
    for (const [sid, mask] of Object.entries(frame.inputs || {})){
      const p = this.players[sid];
      if (!p || p.dead) continue;

      const left = !!(mask & 1);
      const right= !!(mask & 2);
      const up   = !!(mask & 4);
      const down = !!(mask & 8);
      const a    = !!(mask & 16);

      if (left) p.x = Math.max(0, p.x - 1);
      if (right) p.x = Math.min(this.gridW-1, p.x + 1);
      if (down) p.y = Math.min(this.gridH-1, p.y + 1);

      if (a){
        // place a block at current pos
        this.blocks[sid].add(`${p.x},${p.y}`);
        p.score += 1;
        p.y = 0;
      }

      if (this.tick % this.gravityEvery === 0){
        p.y = Math.min(this.gridH-1, p.y + 1);
      }

      // lose if cell already filled at spawn
      if (p.y === 0 && this.blocks[sid].has(`${p.x},0`)){
        p.dead = true;
      }
    }
  }

  render(ctx, canvas){
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // layout: 2x2 mini boards
    const seats = Object.entries(this.order).sort((a,b)=>a[1]-b[1]);
    const cols = 2, rows = 2;
    const pad = 10;
    const cell = Math.floor(Math.min((w - pad*3)/2/this.gridW, (h - pad*3)/2/this.gridH));
    ctx.font = `${Math.max(12, Math.floor(cell*0.9))}px system-ui`;
    ctx.textBaseline = "top";

    for (let i=0;i<4;i++){
      const sx = pad + (i%2) * (this.gridW*cell + pad);
      const sy = pad + Math.floor(i/2) * (this.gridH*cell + pad);
      // frame
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.strokeRect(sx-1, sy-1, this.gridW*cell+2, this.gridH*cell+2);

      const sid = seats[i]?.[0];
      if (!sid) {
        ctx.fillStyle = "rgba(255,255,255,.35)";
        ctx.fillText("빈 자리", sx, sy);
        continue;
      }
      const p = this.players[sid];
      // draw blocks
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(sx, sy, this.gridW*cell, this.gridH*cell);

      // existing cells
      ctx.fillStyle = "rgba(255,255,255,.45)";
      for (const key of this.blocks[sid]){
        const [x,y] = key.split(",").map(Number);
        ctx.fillRect(sx + x*cell, sy + y*cell, cell-1, cell-1);
      }

      // active piece
      if (!p.dead){
        ctx.fillStyle = "rgba(53,208,255,.85)";
        ctx.fillRect(sx + p.x*cell, sy + p.y*cell, cell-1, cell-1);
      }else{
        ctx.fillStyle = "rgba(255,77,77,.85)";
        ctx.fillText("DEAD", sx, sy);
      }

      // header
      ctx.fillStyle = "rgba(255,255,255,.85)";
      const seat = this.order[sid] + 1;
      ctx.fillText(`#${seat} ${sid.slice(0,4)}  점수:${p.score}`, sx, sy + this.gridH*cell + 6);
    }
  }
}

(function(){
  window.GameSims = window.GameSims || {};
  window.GameSims['tetris4'] = Tetris4Sim;
})();
