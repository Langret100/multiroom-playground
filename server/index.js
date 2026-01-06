import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { GameRoom } from "./rooms/GameRoom.js";

const PORT = parseInt(process.env.PORT || "2567", 10);

const app = express();
app.use(cors());
app.get("/", (_, res) => res.send("OK"));

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: app.listen(PORT, () => {
      console.log(`Colyseus listening on ws://localhost:${PORT}`);
    }),
  }),
});

gameServer.define("lobby_room", LobbyRoom);
gameServer.define("game_room", GameRoom).enableRealtimeListing();
