(function(){
  // Minimal audio helper:

  // --- SFX (WebAudio, no external files) ---
  let _sfxCtx = null;
  function _getSfxCtx(){
    if (_sfxCtx) return _sfxCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _sfxCtx = new Ctx();
    return _sfxCtx;
  }
  function _tone(freq, dur=0.12, when=0, type="triangle", vol=0.06){
    const ctx = _getSfxCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    // quick envelope
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playWinSfx(){
    const ctx = _getSfxCtx();
    try{ ctx && ctx.state === "suspended" && ctx.resume(); }catch(_){}
    // two short bright tones
    _tone(880, 0.10, 0.00, "triangle", 0.06);
    _tone(1320,0.14, 0.08, "triangle", 0.055);
  }
  function playLoseSfx(){
    const ctx = _getSfxCtx();
    try{ ctx && ctx.state === "suspended" && ctx.resume(); }catch(_){}
    // one lower tone
    _tone(220, 0.16, 0.00, "sine", 0.055);
    _tone(165, 0.18, 0.10, "sine", 0.045);
  }
  function playReadyOn(){
    const ctx = _getSfxCtx();
    try{ ctx && ctx.state === "suspended" && ctx.resume(); }catch(_){ }
    // cute up-chirp
    _tone(523.25, 0.07, 0.00, "triangle", 0.055);
    _tone(659.25, 0.09, 0.06, "triangle", 0.055);
  }
  function playReadyOff(){
    const ctx = _getSfxCtx();
    try{ ctx && ctx.state === "suspended" && ctx.resume(); }catch(_){ }
    // soft down-chirp
    _tone(659.25, 0.07, 0.00, "triangle", 0.045);
    _tone(523.25, 0.09, 0.06, "triangle", 0.045);
  }
  function playStartSfx(){
    const ctx = _getSfxCtx();
    try{ ctx && ctx.state === "suspended" && ctx.resume(); }catch(_){ }
    // short "go" arpeggio
    _tone(392.0, 0.08, 0.00, "square", 0.04);
    _tone(523.25,0.10, 0.06, "square", 0.04);
    _tone(659.25,0.12, 0.12, "square", 0.04);
  }
  function playClick(){
    const ctx = _getSfxCtx();
    try{ ctx && ctx.state === "suspended" && ctx.resume(); }catch(_){ }
    _tone(880, 0.05, 0, "triangle", 0.025);
  }

  window.SFX = { win: playWinSfx, lose: playLoseSfx, readyOn: playReadyOn, readyOff: playReadyOff, start: playStartSfx, click: playClick };

  // - No floating "sound enable" button (requested)
  // - Warm up with muted autoplay best-effort
  // - If user previously enabled sound (localStorage key), unmute on first gesture
  function attachAudioManager(audioEl, opts){
    opts = opts || {};
    const volume = (typeof opts.volume === 'number') ? opts.volume : 0.7;
    const storageKey = opts.storageKey || 'audio_enabled';

    try{
      audioEl.loop = true;
      audioEl.preload = 'auto';
      audioEl.playsInline = true;
      audioEl.volume = volume;
    }catch(_){}

    // Warm-up: try muted autoplay so decoding is ready.
    (async ()=>{
      try{
        audioEl.muted = true;
        await audioEl.play();
      }catch(_){}
    })();

    const onGesture = async ()=>{
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('touchstart', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);

      // unlock sfx context as well
      try{
        const ctx = _getSfxCtx();
        if (ctx && ctx.state === "suspended") await ctx.resume();
      }catch(_){}

      // Default to enabled on first run.
      // (Autoplay still needs a gesture, but we shouldn't stay muted forever.)
      let pref = null;
      try{ pref = localStorage.getItem(storageKey); }catch(_){ pref = null; }
      if (pref === null){
        try{ localStorage.setItem(storageKey, '1'); }catch(_){ }
        pref = '1';
      }
      // Force-enable background music when the user interacts (no UI toggle in this build).
      if (pref !== '1'){
        try{ localStorage.setItem(storageKey, '1'); }catch(_){ }
        pref = '1';
      }
      try{
        audioEl.volume = volume;
        audioEl.muted = false;
        await audioEl.play();
      }catch(_){}
    };

    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('touchstart', onGesture, true);
    document.addEventListener('keydown', onGesture, true);

    async function enable(){
      try{
        localStorage.setItem(storageKey, '1');
        audioEl.volume = volume;
        audioEl.muted = false;
        await audioEl.play();
      }catch(_){}
    }
    function disable(){
      try{
        // Persist user's choice to keep audio off.
        localStorage.setItem(storageKey, '0');
        audioEl.muted = true;
        audioEl.pause();
      }catch(_){}
    }

    return { enable, disable, stop(){ try{ audioEl.pause(); }catch(_){ } } };
  }

  window.AudioManager = { attachAudioManager };
})();