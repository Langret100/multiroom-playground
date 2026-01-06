// 서버 주소를 여기에 설정하세요.
// 로컬 테스트(Worker dev): ws://127.0.0.1:8787  (wrangler dev)
// 배포(Cloudflare Workers): wss://<your-worker-subdomain>.workers.dev
(function(){
  const wsEndpoint = (window.__SERVER_ENDPOINT__ || "ws://127.0.0.1:8787");
  // HTTP base is derived from WS endpoint unless provided explicitly.
  const httpBase = (window.__SERVER_HTTP__ || wsEndpoint.replace(/^ws(s?):\/\//, "http$1://"));
  window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, {
    SERVER_ENDPOINT: wsEndpoint,
    SERVER_HTTP: httpBase
  });
})();
