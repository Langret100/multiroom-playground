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
// - Respect user's saved preference in localStorage (storageKey: 'audio_enabled' by default)

function _readPref(storageKey){
  try{
    const v = localStorage.getItem(storageKey);
    if (v === '0' || v === '1') return v;
  }catch(_){}
  return null;
}
function isEnabled(storageKey){
  const v = _readPref(storageKey);
  // Default: enabled
  return (v === null) ? true : (v === '1');
}
function setEnabled(storageKey, enabled){
  try{ localStorage.setItem(storageKey, enabled ? '1' : '0'); }catch(_){}
}

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

  // Ensure a preference exists (default ON), but do not override an explicit OFF.
  try{
    const pref = _readPref(storageKey);
    if (pref === null) setEnabled(storageKey, true);
  }catch(_){}

  // Apply initial preference immediately (before any gesture).
  (()=>{
    const enabled = isEnabled(storageKey);
    try{
      if (!enabled){
        audioEl.muted = true;
        audioEl.pause();
      }else{
        // Start muted to comply with autoplay restrictions; we'll unmute on a gesture.
        audioEl.muted = true;
      }
    }catch(_){}
  })();

  // Warm-up: try muted autoplay so decoding is ready (only if enabled).
  (async ()=>{
    if (!isEnabled(storageKey)) return;
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

    // Only start music if user's preference is enabled.
    if (!isEnabled(storageKey)){
      try{ audioEl.muted = true; audioEl.pause(); }catch(_){}
      return;
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
    setEnabled(storageKey, true);
    try{
      audioEl.volume = volume;
      audioEl.muted = false;
      await audioEl.play();
    }catch(_){}
  }
  function disable(){
    setEnabled(storageKey, false);
    try{
      audioEl.muted = true;
      audioEl.pause();
    }catch(_){}
  }
  function sync(){
    // Apply current preference (useful if changed elsewhere)
    if (isEnabled(storageKey)) enable();
    else disable();
  }

  // Keep in sync across tabs/windows.
  try{
    window.addEventListener('storage', (ev)=>{
      if (ev && ev.key === storageKey) sync();
    });
  }catch(_){}

  return { enable, disable, sync, stop(){ try{ audioEl.pause(); }catch(_){ } } };
}

window.AudioManager = { attachAudioManager, isEnabled, setEnabled };
})();