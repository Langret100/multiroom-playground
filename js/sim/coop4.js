// Simple cooperative demo: everyone pushes a shared progress bar.
// Replace with your real coop game later.
class Coop4Sim {
  constructor({ me, order, nicks }){
    this.me = me;
    this.order = order;
    this.nicks = nicks || {};
    this.tick = 0;
    this.progress = 0;
    this.lastPress = {}; // sid -> last A press tick
  }

  step(frame){
    this.tick = frame.tick;
    const inputs = frame.inputs || {};
    for (const [sid, mask] of Object.entries(inputs)){
      const a = !!(mask & 16);
      if (a){
        // cooldown to avoid holding
        const last = this.lastPress[sid] ?? -999;
        if (this.tick - last >= 6){
          this.lastPress[sid] = this.tick;
          this.progress = Math.min(100, this.progress + 1.2);
        }
      }
    }
    // decay
    this.progress = Math.max(0, this.progress - 0.06);
  }

  render(ctx, canvas){
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.font = "16px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText("협동: A(또는 Enter/Space)를 번갈아 눌러 게이지를 100% 채우세요!", 12, 12);

    const barX=12, barY=48, barW=w-24, barH=22;
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "rgba(48,224,123,.85)";
    ctx.fillRect(barX, barY, barW*(this.progress/100), barH);
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(`${this.progress.toFixed(1)}%`, barX, barY + 32);

    // Show players
    const seats = Object.entries(this.order).sort((a,b)=>a[1]-b[1]);
    let y=90;
    for (const [sid, seat] of seats){
      ctx.fillStyle = "rgba(53,208,255,.85)";
      ctx.fillText(`#${seat+1} ${(this.nicks && this.nicks[sid]) ? this.nicks[sid] : sid.slice(0,4)}`, 12, y);
      y += 22;
    }
  }
}

(function(){
  window.GameSims = window.GameSims || {};
  window.GameSims['togester'] = Coop4Sim;
})();
