# Multiroom Playground (Cloudflare Workers backend)

## 구성
- **Client(정적)**: GitHub Pages / Cloudflare Pages 등 정적 호스팅에 루트 그대로 업로드
- **Server(실시간 룸/매칭)**: `cf-worker/`의 **Cloudflare Workers + Durable Objects**

## 로그인/닉네임
- 접속 시 **로그인 창이 먼저 뜹니다.**
- 로그인은 `test-mina-main`과 동일하게 **Google Apps Script(구글 시트) 엔드포인트**로 검증합니다.
- **비밀번호는 저장하지 않습니다** (localStorage에는 닉네임/아이디만 저장).
- **게스트**는 랜덤 4자리 숫자 닉네임으로 입장합니다.

> 엔드포인트는 `sheet-config.js`의 `SHEET_WRITE_URL`을 사용합니다.

## Client (GitHub Pages)
- 레포 루트에 아래 파일/폴더를 그대로 올리면 됩니다:
  - `index.html` (로비)
  - `room.html` (방)
  - `*.js`, `styles.css`, `games/`, `sim/`

### 서버 주소 설정
- 기본값은 `js/core/config.js`에 있습니다.
  - 로컬 테스트(Worker dev): `ws://127.0.0.1:8787`
  - 배포(Workers): `wss://<your-worker-subdomain>.workers.dev`

> **우선순위**
> 1) 페이지에서 `window.__SERVER_ENDPOINT__` / `window.__SERVER_HTTP__`를 설정한 경우 그 값을 사용
> 2) 설정이 없으면 `js/core/config.js`의 `DEFAULT_WORKER_HOST`를 사용

예시(로컬 테스트):
```html
<script>
  window.__SERVER_ENDPOINT__ = "ws://127.0.0.1:8787";
</script>
```

## Server (Cloudflare Worker)

서버는 `cf-worker/` 폴더입니다. (Node/Colyseus 대체)

### 로컬(dev)
```bash
cd cf-worker
npm i -g wrangler
wrangler login
wrangler dev
```

### 배포
```bash
cd cf-worker
wrangler deploy
```

Workers 엔드포인트 및 라우팅은 `cf-worker/README.md`를 참고하세요.

## 기능
- 로비: 방 목록(표/상태등) + 로비 채팅 + 접속자 목록 + 접속 인원
- 방: 인원 목록 + 레디 + 방장 시작 + **방 채팅**
- 게임 동기화: lockstep frames(20Hz)
- 저장: DB/파일 저장 없음(메모리만 사용). 방을 나가면 UI 채팅도 비웁니다.

## 게임 추가(확장) 방법

이 프로젝트는 **게임을 폴더로 추가**하고 **레지스트리에 한 줄 추가**하면, 로비/방에서 바로 선택 가능하도록 되어 있습니다.

### 1) 게임 폴더 추가

`/games/<gameId>/index.html` 형태로 게임을 넣습니다.

예시:

- `games/stackga/index.html`
- `games/suika/index.html`

### 2) 레지스트리 등록

`js/games/registry.js`의 `GAME_REGISTRY`에 항목을 추가합니다.

- `type: "duel"` : 1:1 게임(3~4명이면 서버가 토너먼트 매치 진행)
- `type: "coop"` : 실시간 협동(서버 틱/입력 동기화 사용)

### 3) 1:1(duel) 게임의 네트워크 규칙

듀얼 게임은 **iframe 임베드**로 실행되며, 게임이 부모 페이지에 아래 메시지를 보내면 자동으로 동기화됩니다.

- 게임 → 부모: `postMessage({type:"duel_state", state})`
  - `state.dead` 또는 `state.over` 가 true/1이면 패배 처리(토너먼트 진행)
- 게임 ← 부모: `message.type === "duel_state"` 수신 시 상대 상태로 렌더

※ `games/stackga/js/netplay.js`, `games/suika/js/netplay.js`는 **부모 페이지(room.html)와의 postMessage 브리지**입니다.
실제 매칭/상태 릴레이는 **부모 페이지가 Worker(WebSocket)로 연결**해서 처리합니다.

---

## Legacy (참고)

`server/` 폴더(Node/Colyseus)는 과거 버전 호환용으로 남아있을 수 있습니다.
현재 기본 구성은 `cf-worker/`를 사용합니다.

---

## 최근 변경 (패치)

- 도형게임(구 수박게임): 진행바/그릇 UI 위치 조정(상단 대비 아래로 이동) 및 주석 추가
- 도형게임: iframe 임베드 환경에서 상대 상태 수신(duel_state) 누락 시에도 sid를 추정해 상대 화면이 뜨도록 보강
