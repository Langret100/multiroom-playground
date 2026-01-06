(function(){
  function attachAudioManager(audioEl, opts){
    opts = opts || {};
    const volume = typeof opts.volume === 'number' ? opts.volume : 0.7;
    const label = opts.label || '사운드 켜기';
    const storageKey = opts.storageKey || 'audio_enabled';

    audioEl.loop = true;
    audioEl.preload = 'auto';
    audioEl.playsInline = true;
    audioEl.volume = volume;

    let uiBtn = null;

    function showButton(){
      if (uiBtn) return;
      uiBtn = document.createElement('button');
      uiBtn.className = 'audioEnableBtn';
      uiBtn.type = 'button';
      uiBtn.textContent = '🔊';
      uiBtn.title = label;
      uiBtn.setAttribute('aria-label', label);
      document.body.appendChild(uiBtn);

      uiBtn.addEventListener('click', async () => {
        try {
          audioEl.muted = false;
          await audioEl.play();
          localStorage.setItem(storageKey, '1');
          uiBtn.remove(); uiBtn = null;
        } catch (e) {
          // still blocked — keep button
        }
      });
    }

    async function tryUnmuted(){
      try {
        audioEl.muted = false;
        await audioEl.play();
        // played with sound
        localStorage.setItem(storageKey, '1');
        return true;
      } catch (e) {
        return false;
      }
    }

    async function tryMuted(){
      try {
        audioEl.muted = true;
        await audioEl.play();
        return true;
      } catch (e) {
        return false;
      }
    }

    async function boot(){
      // 1) If user previously enabled sound, try unmuted first.
      if (localStorage.getItem(storageKey) === '1') {
        if (await tryUnmuted()) return;
      }
      // 2) Try unmuted autoplay (desktop / permissive browsers)
      if (await tryUnmuted()) return;

      // 3) Fall back to muted autoplay (most mobile browsers allow this)
      const mutedOk = await tryMuted();
      // muted autoplay gives no audible sound. Show a button to enable sound.
      showButton();

      // If even muted autoplay fails, user must tap the button anyway.
      if (!mutedOk) showButton();
    }

    boot();

    // On first gesture, if sound was enabled before, unmute.
    const onGesture = async () => {
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      if (localStorage.getItem(storageKey) !== '1') return;
      try {
        audioEl.muted = false;
        await audioEl.play();
      } catch (e) {
        showButton();
      }
    };
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);

    return { stop(){ try { audioEl.pause(); } catch(_){} } };
  }

  window.AudioManager = { attachAudioManager };
})();
