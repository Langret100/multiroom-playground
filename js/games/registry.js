(function(){
  // Game registry. Add new games by adding a folder under /games/<id>/ and an entry here.
  // type:
  //  - "duel": 1v1 matches; if 3~4 players in room, server runs a tournament.
  //  - "coop": cooperative real-time game.
  const GAME_REGISTRY = [
    { id: "stackga", name: "스택가", type:"duel", badgeClass: "tetris", maxClients: 4, embedPath: "games/stackga/index.html" },
    { id: "suika",   name: "수박",   type:"duel", badgeClass: "suika",  maxClients: 4, embedPath: "games/suika/index.html" },
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