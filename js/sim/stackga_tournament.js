
// Stackga Tournament (2-player per match, supports 3-4 player tournament with spectators)
// Requires: window.StackgaEngine, window.StackgaTouch
(function(){
  const { StackGame, drawBoard, drawNext, ROWS } = window.StackgaEngine || {};
  if (!StackGame) { console.warn("StackgaEngine missing"); }

  // Input mask bits from room.js:
  // 1=left, 2=right, 4=up(rotate), 8=down(soft), 16=a(hard drop), 32=b(pause)
  class StackgaTournamentSim {
    constructor({ me, order, nicks }){
      this.me = me;
      this.order = order || {};
      this.nicks = nicks || {};
      this.tickRate = 20;
      this.dt = 1000/this.tickRate;

      this.match = null; // {a,b, nicks, seeds}
      this.games = new Map(); // sid -> StackGame
      this.deadSent = false;

      this._prevMask = new Map();
      this._hold = new Map(); // sid -> {l,r,d}
      this._holdRepeat = 2; // ticks per repeat for left/right when held

      // UI elements wired later
      this.ui = null;
    }

    bindUI(ui){
      // ui: {cvMe, cvOpp, cvNext, meTag, oppTag, shell}
      this.ui = ui;
      // Fit canvases for mobile
      try{
        window.StackgaTouch?.fitCanvases?.(ui.cvMe, ui.cvOpp, ui.cvNext, ROWS);
        window.addEventListener("resize", ()=>window.StackgaTouch?.fitCanvases?.(ui.cvMe, ui.cvOpp, ui.cvNext, ROWS));
        window.addEventListener("orientationchange", ()=>window.StackgaTouch?.fitCanvases?.(ui.cvMe, ui.cvOpp, ui.cvNext, ROWS));
      }catch{}
      // Touch controls on my canvas (only if I'm active player)
      try{
        window.StackgaTouch?.initTouchControls?.(ui.cvMe, (action)=> {
          if (!this.isActiveMe()) return;
          // Translate action into a one-tick pulse by setting a "virtual" mask in this._touchPulse
          const p = this._touchPulse || 0;
          let m = 0;
          if (action==="left") m = 1;
          else if (action==="right") m = 2;
          else if (action==="rotate") m = 4;
          else if (action==="down") m = 8;
          else if (action==="drop") m = 16;
          this._touchPulse = (p | m);
        });
      }catch{}
    }

    setTickRate(rate){
      this.tickRate = rate || 20;
      this.dt = 1000/this.tickRate;
    }

    onMatch(info){
      // info: {a,b,aNick,bNick,seedA,seedB}
      this.match = info;
      this.games.clear();
      this.deadSent = false;
      if (StackGame){
        this.games.set(info.a, new StackGame(info.seedA >>> 0));
        this.games.set(info.b, new StackGame(info.seedB >>> 0));
      }
      // reset masks
      this._prevMask.clear();
      this._hold.clear();
      if (this.ui){
        const meNick = (info.a===this.me) ? info.aNick : (info.b===this.me ? info.bNick : (sessionStorage.getItem("nick")||""));
        const oppNick = (info.a===this.me) ? info.bNick : (info.b===this.me ? info.aNick : `${info.aNick} vs ${info.bNick}`);
        if (this.ui.meTag) this.ui.meTag.textContent = meNick || "나";
        if (this.ui.oppTag) this.ui.oppTag.textContent = oppNick || "상대";
      }
    }

    isActiveMe(){
      return !!this.match && (this.match.a===this.me || this.match.b===this.me);
    }

    _edge(mask, bit, prev){ return ((mask & bit) !== 0) && ((prev & bit) === 0); }

    _applyMaskToGame(sid, mask){
      const g = this.games.get(sid);
      if (!g) return;
      const prev = this._prevMask.get(sid) || 0;

      // pulses from touch (only for me)
      if (sid === this.me && this._touchPulse){
        mask = mask | this._touchPulse;
      }

      // rotate on edge (up)
      if (this._edge(mask, 4, prev)) g.rotate();

      // hard drop on edge (a)
      if (this._edge(mask, 16, prev)) g.hardDrop();

      // pause on edge (b)
      if (this._edge(mask, 32, prev)) g.paused = !g.paused;

      // soft drop while held (down)
      if (mask & 8) g.softDrop();

      // left/right repeat
      const hold = this._hold.get(sid) || { l:0, r:0 };
      if (mask & 1){
        hold.l += 1;
        if (hold.l===1 || (hold.l % this._holdRepeat===0)) g.move(-1);
      } else hold.l = 0;

      if (mask & 2){
        hold.r += 1;
        if (hold.r===1 || (hold.r % this._holdRepeat===0)) g.move(1);
      } else hold.r = 0;

      this._hold.set(sid, hold);

      this._prevMask.set(sid, mask);

      if (sid === this.me) this._touchPulse = 0;
    }

    step(inputs){
      if (!this.match) return;

      const a = this.match.a, b = this.match.b;
      const ma = (inputs && inputs[a]) ? (inputs[a]>>>0) : 0;
      const mb = (inputs && inputs[b]) ? (inputs[b]>>>0) : 0;

      // Apply inputs then tick both games
      this._applyMaskToGame(a, ma);
      this._applyMaskToGame(b, mb);

      const ga = this.games.get(a), gb = this.games.get(b);
      if (ga) ga.tick(this.dt);
      if (gb) gb.tick(this.dt);

      // If I'm active and I died, signal server once (room.js will actually send)
      if (this.isActiveMe() && !this.deadSent){
        const g = this.games.get(this.me);
        if (g && g.dead){
          this.deadSent = true;
          if (typeof this.onLocalDead === "function"){
            this.onLocalDead();
          }
        }
      }
    }

    render(ctx, canvas){
      if (!this.ui || !this.match) {
        // fallback: blank
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillText("대기중...", 10, 20);
        return;
      }
      // Draw on dedicated canvases
      const a = this.match.a, b = this.match.b;
      const meSid = this.me;

      let mySid = meSid, oppSid = (a===meSid)?b : (b===meSid? a : a);
      const gMe = this.games.get(mySid);
      const gOpp = this.games.get(oppSid);

      // If spectator, show both in fixed order
      const spectator = !this.isActiveMe();
      if (spectator){
        mySid = a; oppSid = b;
      }

      const snapMe = gMe ? gMe.snapshot() : null;
      const snapOpp = gOpp ? gOpp.snapshot() : null;

      if (this.ui.cvMe && snapMe) drawBoard(this.ui.cvMe, snapMe, { showGhost:true });
      if (this.ui.cvNext && snapMe) drawNext(this.ui.cvNext, snapMe);
      if (this.ui.cvOpp && snapOpp) drawBoard(this.ui.cvOpp, snapOpp, { showGhost:false });

      // simple overlay in main canvas
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "rgba(0,0,0,0)";
    }
  }

  window.GameSims = window.GameSims || {};
  window.GameSims.stackga = StackgaTournamentSim;
})();
