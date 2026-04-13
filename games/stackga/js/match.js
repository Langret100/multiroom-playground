/**
 * Feature: HUD 상단 소리 버튼 옆에 "매칭" 버튼을 두고,
 *          클릭 시 페이지를 새로고침하여 온라인 매칭을 다시 시도합니다.
 *
 * Remove:
 *  - index.html: #btnMatch 버튼 제거
 *  - css/game.css: .matchBtn 스타일 제거
 *  - js/main.js: 이 모듈 import / init 호출 제거
 *  - js/match.js 파일 삭제
 */

export function initMatchButton({ buttonEl, audio } = {}){
  if(!buttonEl) return;

  const EMBED = new URLSearchParams(location.search).get("embed") === "1";

  // Embedded (room.html iframe): repurpose as "Exit / Forfeit".
  if (EMBED){
    try{ buttonEl.textContent = "나가기"; }catch{}
    try{ buttonEl.title = "나가기"; }catch{}
    buttonEl.addEventListener("click", ()=>{
      // Try to unlock audio on the gesture (safe no-op if blocked)
      try{ audio?.gestureStart?.(); }catch{}
      try{ window.parent?.postMessage({ type: "duel_quit" }, "*"); }catch{}
    });
    return;
  }

  // Firebase 매칭 제거: 온라인 플레이는 로비(Cloudflare 서버)에서 진행합니다.
  // 단독 실행에서는 오프라인으로 바로 플레이할 수 있고,
  // 버튼은 로비로 이동합니다.
  try{ buttonEl.textContent = "로비"; }catch{}
  try{ buttonEl.title = "로비로 이동"; }catch{}
  buttonEl.addEventListener("click", ()=>{
    try{ audio?.gestureStart?.(); }catch{}
    location.href = "../../index.html";
  });
}
