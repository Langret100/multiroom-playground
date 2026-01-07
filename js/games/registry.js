(function(){
  // Game registry. Add new games by adding a folder under /games/<id>/ and an entry here.
  // type:
  //  - "duel": 1v1 matches; if 3~4 players in room, server runs a tournament.
  //  - "coop": cooperative real-time game.
  const GAME_REGISTRY = [
    {
      id: "stackga",
      name: "블록쌓기",
      // 요청사항: 방 화면(게임 시작 전 카드)에 표시할 2줄 설명
      descLines: [
        "블록으로 줄을 맞추면 사라집니다.",
        "두 줄 이상 지우면 상대에게 한 줄 추가합니다.",
      ],
      type:"duel",
      badgeClass: "tetris",
      maxClients: 4,
      embedPath: "games/stackga/index.html"
    },
    // NOTE: 기존 "수박게임"의 표시명은 요청에 따라 "도형게임"으로 변경.
    {
      id: "suika",
      name: "도형게임",
      // 요청사항: 방 화면(게임 시작 전 카드)에 표시할 2줄 설명
      descLines: [
        "같은 도형 두 개를 합쳐 다음 도형이 됩니다.",
        "연속으로 도형을 합치면 상대에게 돌을 뿌립니다.",
      ],
      type:"duel",
      badgeClass: "suika",
      maxClients: 4,
      embedPath: "games/suika/index.html"
    },
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