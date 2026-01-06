# Cloudflare Workers Backend (Colyseus replacement)

This folder contains a Workers + Durable Objects backend that replaces the Node/Colyseus server.

## Endpoints
- WS: /ws/lobby
- WS: /ws/room/:roomId
- HTTP: GET /api/rooms
- HTTP: POST /api/rooms  (create room)

## Quick start (local)
1) Install wrangler: `npm i -g wrangler`
2) Login: `wrangler login`
3) From this folder:
   - `wrangler dev`

Worker dev URL will be printed, typically:
- http://127.0.0.1:8787
- ws://127.0.0.1:8787

Set your frontend endpoint before opening pages:
```html
<script>
  window.__SERVER_ENDPOINT__ = "ws://127.0.0.1:8787";
</script>
```

## Deploy
- `wrangler deploy`
Then set frontend endpoint:
```html
<script>
  window.__SERVER_ENDPOINT__ = "wss://<your-worker-subdomain>.workers.dev";
</script>
```
