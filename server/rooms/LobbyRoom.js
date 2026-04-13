import { Room } from "@colyseus/core";

// In-memory presence only (no DB). This is "best-effort" and resets if server restarts.
const online = new Map(); // sessionId -> { nick, joinedAt }

function snapshot(){
  const users = Array.from(online.entries()).map(([id, v]) => ({ id, nick: v.nick }));
  return { online: users.length, users };
}

export class LobbyRoom extends Room {
  onCreate(){
    this.maxClients = 200; // lobby can hold many
    this.onMessage("chat", (client, { text }) => {
      const nick = online.get(client.sessionId)?.nick || "Player";
      const msg = { nick, text: String(text||"").slice(0,200), time: new Date().toTimeString().slice(0,5) };
      this.broadcast("chat", msg);
    });

    this.onMessage("presence", (client) => {
      client.send("presence", snapshot());
    });
  }

  onJoin(client, options){
    const nick = String(options?.nick || "Player").slice(0,20);
    online.set(client.sessionId, { nick, joinedAt: Date.now() });
    this.broadcast("system", { nick: "SYSTEM", text: `${nick} 접속`, time: new Date().toTimeString().slice(0,5) });
    this.broadcast("presence", snapshot());
  }

  onLeave(client){
    const nick = online.get(client.sessionId)?.nick || "Player";
    online.delete(client.sessionId);
    this.broadcast("system", { nick: "SYSTEM", text: `${nick} 퇴장`, time: new Date().toTimeString().slice(0,5) });
    this.broadcast("presence", snapshot());
  }
}
