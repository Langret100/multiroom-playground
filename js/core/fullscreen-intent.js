(function(){
  // Persist "Fullscreen intent" across page navigations.
  // Browsers exit fullscreen on navigation for security reasons, so we re-request
  // fullscreen on the next page if the user previously enabled it.
  const KEY = "fullscreen_intent";

  let unloading = false;
  const markUnloading = () => { unloading = true; };
  window.addEventListener("pagehide", markUnloading);
  window.addEventListener("beforeunload", markUnloading);
  window.addEventListener("unload", markUnloading);

  function hasIntent(){
    try{ return localStorage.getItem(KEY) === "1"; }catch(_){ return false; }
  }
  function setIntent(on){
    try{
      if (on) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    }catch(_){ }
  }

  async function tryEnter(){
    if (!hasIntent()) return false;
    if (document.fullscreenElement) return true;
    try{
      if (document.documentElement && document.documentElement.requestFullscreen){
        await document.documentElement.requestFullscreen();
        return !!document.fullscreenElement;
      }
    }catch(_){ }
    return false;
  }

  // Keep intent in sync with actual fullscreen state.
  // IMPORTANT: do NOT clear intent when fullscreen ends due to navigation.
  document.addEventListener("fullscreenchange", () => {
    const navigating = !!window.__fsNavigating;
    if (document.fullscreenElement) {
      setIntent(true);
    } else {
      if (!(unloading || navigating)) setIntent(false);
    }
  });

  // Best-effort: try immediately (may work if user-activation carries over).
  setTimeout(() => { tryEnter(); }, 0);

  // If the immediate attempt is blocked, re-try on the next user gesture.
  const onUserGesture = async () => {
    if (!document.fullscreenElement && hasIntent()) {
      await tryEnter();
    }
    if (document.fullscreenElement || !hasIntent()) {
      document.removeEventListener("pointerdown", onUserGesture, true);
      document.removeEventListener("keydown", onUserGesture, true);
    }
  };
  document.addEventListener("pointerdown", onUserGesture, true);
  document.addEventListener("keydown", onUserGesture, true);
})();
