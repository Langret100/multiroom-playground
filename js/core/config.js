// 서버 주소를 여기에 설정하세요.
// 로컬 테스트(Worker dev): ws://127.0.0.1:8787  (wrangler dev)
// 배포(Cloudflare Workers): wss://<your-worker-subdomain>.workers.dev
//
// ✅ Pages(HTTPS) 배포용 기본값을 Worker로 자동 설정합니다.
// - 로컬(localhost/127.0.0.1)에서는 기존처럼 로컬 ws://127.0.0.1:8787 사용
// - 그 외(배포 환경)에서는 아래 Worker로 연결
(function(){
  // NOTE (중요): 로그인/닉네임 검증 로직은 별도(sheet-config.js)이며,
  // 여기서는 "실시간 룸/매칭"(WebSocket/HTTP) 서버 주소만 설정합니다.
  //
  // Endpoint 우선순위
  // 1) 페이지에서 window.__SERVER_ENDPOINT__ / window.__SERVER_HTTP__를 지정한 경우
  // 2) 지정이 없으면 아래 DEFAULT_WORKER_HOST로 자동 연결
  const DEFAULT_WORKER_HOST = "multiroom-playground.tmdrb445-f03.workers.dev";

  const host = (window.location && window.location.hostname) || "";
  const isLocal = (host === "localhost" || host === "127.0.0.1");

  // 1) 사용자가 window.__SERVER_ENDPOINT__ / __SERVER_HTTP__ 로 강제 지정하면 그 값을 우선 사용
  let wsEndpoint = window.__SERVER_ENDPOINT__;
  let httpBase = window.__SERVER_HTTP__;

  // 2) 지정이 없으면 환경에 따라 자동 선택
  if(!wsEndpoint){
    wsEndpoint = isLocal ? "ws://127.0.0.1:8787" : `wss://${DEFAULT_WORKER_HOST}`;
  }

  // 3) HTTP base는 WS endpoint에서 파생(필요시 override 가능)
  if(!httpBase){
    httpBase = wsEndpoint.replace(/^ws(s?):\/\//, "http$1://");
  }

  window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, {
    SERVER_ENDPOINT: wsEndpoint,
    SERVER_HTTP: httpBase
  });
})();
