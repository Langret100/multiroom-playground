(function(){
  // Google Sheet (Apps Script) based auth (no Firebase token).
  // - signup: mode=signup (registers in Sheet)
  // - login : mode=login  (verifies in Sheet)
  // Response expected: { ok:true, user_id, nickname } or { ok:false, error }
  // Caches non-guest user to localStorage("ghostUser") for convenience.

  function safeText(x, max){
    return String(x ?? "").replace(/[\r\n\t]/g, " ").slice(0, max || 200);
  }

  async function postToSheet(payload){
    if (!window.fetch || !window.SHEET_WRITE_URL) {
      throw new Error("SHEET_WRITE_URL not configured");
    }
    payload = payload || {};
    const parts = [];
    Object.keys(payload).forEach((k)=>{
      const v = payload[k];
      if (v === undefined || v === null) return;
      parts.push(encodeURIComponent(String(k)) + "=" + encodeURIComponent(String(v)));
    });
    const body = parts.join("&");
    const res = await fetch(window.SHEET_WRITE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    });
    return res;
  }

  function readGhostUser(){
    try {
      const raw = localStorage.getItem("ghostUser");
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch(e){ return null; }
  }
  function writeGhostUser(user){
    try { localStorage.setItem("ghostUser", JSON.stringify(user)); } catch(e){}
  }
  function clearGhostUser(){
    try { localStorage.removeItem("ghostUser"); } catch(e){}
  }

  function setSessionUser(user){
    try {
      sessionStorage.setItem("nick", user.nickname || "Player");
      sessionStorage.setItem("user_id", user.user_id || "");
      sessionStorage.setItem("username", user.username || "");
      sessionStorage.setItem("isGuest", user.isGuest ? "1" : "0");
    } catch(e){}
  }

  function genGuestNum(){
    return Math.floor(1000 + Math.random() * 9000);
  }

  function getEls(){
    return {
      modal: document.getElementById("loginModal"),
      loginForm: document.getElementById("loginForm"),
      loginUsername: document.getElementById("loginUsername"),
      loginPassword: document.getElementById("loginPassword"),
      signupToggle: document.getElementById("signupToggleBtn"),
      signupArea: document.getElementById("signupArea"),
      signupForm: document.getElementById("signupForm"),
      signupUsername: document.getElementById("signupUsername"),
      signupPassword: document.getElementById("signupPassword"),
      signupNickname: document.getElementById("signupNickname"),
      status: document.getElementById("loginStatus"),
      btnGuest: document.getElementById("guestBtn"),
      btnLogout: document.getElementById("logoutBtn"),
      lastNick: document.getElementById("lastNick"),
    };
  }

  function showModal(){
    const els = getEls();
    if (!els.modal) return;
    // Always start in "login" view; show signup only when user clicks 회원가입.
    if (els.signupArea) els.signupArea.classList.add("hidden");
    setStatus("");
    els.modal.classList.add("show");
    try{ document.body.classList.add("logged-out"); }catch(_){ }
    // reset scroll for mobile
    try { const b = els.modal.querySelector('.modalBody'); if(b) b.scrollTop = 0; } catch(e){}
    els.modal.setAttribute("aria-hidden", "false");
  }
  function hideModal(){
    const els = getEls();
    if (!els.modal) return;
    if (els.signupArea) els.signupArea.classList.add("hidden");
    els.modal.classList.remove("show");
    try{ document.body.classList.remove("logged-out"); }catch(_){ }
    els.modal.setAttribute("aria-hidden", "true");
  }
  function setStatus(msg){
    const els = getEls();
    if (els.status) els.status.textContent = msg || "";
  }

  function preloadLastLogin(){
    const els = getEls();
    const saved = readGhostUser();
    if (saved && saved.username && els.loginUsername){
      els.loginUsername.value = saved.username;
    }
    if (els.lastNick){
      els.lastNick.textContent = (saved && (saved.nickname || saved.username)) ? (saved.nickname || saved.username) : "(없음)";
    }
  }

  async function doLogin(username, password){
    setStatus("로그인 중...");
    const res = await postToSheet({ mode:"login", username, password });
    const json = await res.json();
    if (!json || !json.ok){
      throw new Error((json && json.error) || "로그인 실패");
    }
    const user = {
      user_id: String(json.user_id || ""),
      username,
      nickname: String(json.nickname || username),
      isGuest: false,
    };
    writeGhostUser({ user_id: user.user_id, username: user.username, nickname: user.nickname });
    setSessionUser(user);
    return user;
  }

  async function doSignup(username, password, nickname){
    setStatus("회원가입 중...");
    const res = await postToSheet({ mode:"signup", username, password, nickname: nickname || "" });
    const json = await res.json();
    if (!json || !json.ok){
      throw new Error((json && json.error) || "회원가입 실패");
    }
    const user = {
      user_id: String(json.user_id || ""),
      username,
      nickname: String(json.nickname || nickname || username),
      isGuest: false,
    };
    writeGhostUser({ user_id: user.user_id, username: user.username, nickname: user.nickname });
    setSessionUser(user);
    return user;
  }

  function doGuest(){
    const n = genGuestNum();
    const user = {
      user_id: "guest-" + n,
      username: "guest" + n,
      nickname: "게스트" + String(n).slice(-4),
      isGuest: true,
    };
    setSessionUser(user);
    return user;
  }

  function wireLogoutButton(){
    const els = getEls();
    if (!els.btnLogout || els.btnLogout._wired) return;
    els.btnLogout._wired = true;
    els.btnLogout.addEventListener("click", ()=>{
      clearGhostUser();
      try { sessionStorage.clear(); } catch(e){}
      location.reload();
    });
  }

  function alreadyLoggedInInThisTab(){
    try {
      const nick = sessionStorage.getItem("nick");
      if (!nick) return null;
      return {
        nickname: nick,
        user_id: sessionStorage.getItem("user_id") || "",
        username: sessionStorage.getItem("username") || "",
        isGuest: sessionStorage.getItem("isGuest") === "1",
      };
    } catch(e){ return null; }
  }

  function requireLogin(){
    wireLogoutButton();

    const existing = alreadyLoggedInInThisTab();
    // If this tab already has a session (including guest), reuse it.
    // NOTE: Guests previously saw the login modal on every navigation (lobby -> room -> lobby).
    // This causes repeated popups and is unnecessary once a nickname is already established.
    if (existing && existing.nickname){
      hideModal();
      return Promise.resolve(existing);
    }

    showModal();
    preloadLastLogin();

    return new Promise((resolve)=>{
      const els = getEls();
      if (!els.modal){
        resolve(doGuest());
        return;
      }

      let done = false;
      const finish = (user)=>{
        if (done) return;
        done = true;
        hideModal();
        resolve(user);
      };

      if (els.signupArea) els.signupArea.classList.add('hidden');

      if (els.signupToggle && !els.signupToggle._wired){
        els.signupToggle._wired = true;
        els.signupToggle.addEventListener("click", ()=>{
          const area = els.signupArea;
          if (!area) return;
          const willShow = area.classList.contains("hidden");
          area.classList.toggle("hidden");
          setStatus("");
          if (willShow) {
            // ensure the expanded signup section stays inside viewport (mobile): scroll modal body to reveal it
            try {
              const b = els.modal && els.modal.querySelector('.modalBody');
              if (b) requestAnimationFrame(()=>{ b.scrollTop = b.scrollHeight; });
            } catch(e){}
            try { (els.signupUsername || els.signupNickname || els.loginUsername)?.focus(); } catch(e){}
          } else {
            try {
              const b = els.modal && els.modal.querySelector('.modalBody');
              if (b) requestAnimationFrame(()=>{ b.scrollTop = 0; });
            } catch(e){}
            try { (els.loginUsername || els.signupUsername)?.focus(); } catch(e){}
          }
        });
      }

      if (els.loginForm && !els.loginForm._wired){
        els.loginForm._wired = true;
        els.loginForm.addEventListener("submit", async (ev)=>{
          ev.preventDefault();
          const u = safeText((els.loginUsername && els.loginUsername.value.trim()) || "", 60);
          const p = safeText((els.loginPassword && els.loginPassword.value.trim()) || "", 60);
          if (!u || !p){
            setStatus("아이디와 비밀번호를 입력해 주세요.");
            return;
          }
          try {
            const user = await doLogin(u, p);
            setStatus("");
            finish(user);
          } catch(e){
            console.error("login error", e);
            setStatus(e.message || "로그인 실패");
          }
        });
      }

      if (els.signupForm && !els.signupForm._wired){
        els.signupForm._wired = true;
        els.signupForm.addEventListener("submit", async (ev)=>{
          ev.preventDefault();
          const u = safeText((els.signupUsername && els.signupUsername.value.trim()) || "", 60);
          const p = safeText((els.signupPassword && els.signupPassword.value.trim()) || "", 60);
          const n = safeText((els.signupNickname && els.signupNickname.value.trim()) || "", 24);
          if (!u || !p){
            setStatus("회원가입: 아이디/비밀번호는 꼭 입력해야 해요.");
            return;
          }
          try {
            const user = await doSignup(u, p, n);
            setStatus("");
            finish(user);
          } catch(e){
            console.error("signup error", e);
            setStatus(e.message || "회원가입 실패");
          }
        });
      }

      if (els.btnGuest && !els.btnGuest._wired){
        els.btnGuest._wired = true;
        els.btnGuest.addEventListener("click", ()=>{
          finish(doGuest());
        });
      }

      try { (els.loginUsername || els.signupUsername)?.focus(); } catch(e){}
    });
  }

  window.Auth = {
    requireLogin,
    postToSheet,
    readGhostUser,
    clearGhostUser,
  };
})();