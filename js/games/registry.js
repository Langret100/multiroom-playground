(function(){
  // Game registry. Add new games by adding a folder under /games/<id>/ and an entry here.
  // type:
  //  - "duel": 1v1 matches; if 3~4 players in room, server runs a tournament.
  //  - "coop": cooperative real-time game.
  const GAME_REGISTRY = [
    { id: "stackga", name: "블록쌓기", type:"duel", badgeClass: "tetris", maxClients: 4, embedPath: "games/stackga/index.html" },
    // NOTE: 기존 "수박게임"의 표시명은 요청에 따라 "도형게임"으로 변경.
    { id: "suika",   name: "도형게임",   type:"duel", badgeClass: "suika",  maxClients: 4, embedPath: "games/suika/index.html" },
    // Togester (co-op) is embedded as an iframe and synced via Colyseus messages.
    // Firebase dependencies have been removed.
    { id: "togester",name: "협동",   type:"coop", badgeClass: "coop",   maxClients: 4, embedPath: "games/togester/index.html" }
  ];

  function gameById(id){
    return GAME_REGISTRY.find(g => g.id === id) || GAME_REGISTRY[0];
  }

  window.GAME_REGISTRY = GAME_REGISTRY;
  window.gameById = gameById;
})();