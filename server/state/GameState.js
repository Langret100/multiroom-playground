import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class PlayerState extends Schema {
  constructor(){
    super();
    this.nick = "";
    this.ready = false;
    this.isHost = false;
  }
}
defineTypes(PlayerState, {
  nick: "string",
  ready: "boolean",
  isHost: "boolean",
});

export class GameState extends Schema {
  constructor(){
    super();
    this.title = "방";
    this.mode = "stackga";
    this.modeType = "duel"; // duel | coop
    this.phase = "lobby"; // lobby | playing
    this.maxClients = 4;

    this.players = new MapSchema();
    this.allReady = false;
    this.playerCount = 0;
    this.order = new MapSchema(); // sessionId -> seat
  }
}
defineTypes(GameState, {
  title: "string",
  mode: "string",
  maxClients: "number",
  modeType: "string",
  phase: "string",
  players: { map: PlayerState },
  allReady: "boolean",
  playerCount: "number",
  order: { map: "number" },
});
