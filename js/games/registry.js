(function(){
  // Game registry. Add new games by adding a folder under /games/<id>/ and an entry here.
  // type:
  //  - "duel": 1v1 matches; if 3~4 players in room, server runs a tournament.
  //  - "coop": cooperative real-time game.
  const GAME_REGISTRY = [
    {
      id: "stackga",
      name: "블록쌓기",
      mobileHint: "모바일: 하단 버튼으로 이동/회전/드롭",
      // 요청사항: 방 화면(게임 시작 전 카드)에 표시할 2줄 설명
      descLines: [
        "블록으로 줄을 맞추면 사라집니다.",
        "두 줄 이상 지우면 상대에게 한 줄 추가합니다.",
      ],
      type:"duel",
      badgeClass: "tetris",
      maxClients: 2,
      embedPath: "games/stackga/index.html"
    },
    // NOTE: 기존 "수박게임"의 표시명은 요청에 따라 "도형게임"으로 변경.
    {
      id: "suika",
      name: "도형게임",
      mobileHint: "모바일: 좌우 이동 후 탭으로 떨어뜨리기",
      // 요청사항: 방 화면(게임 시작 전 카드)에 표시할 2줄 설명
      descLines: [
        "같은 도형 두 개를 합쳐 다음 도형이 됩니다.",
        "연속으로 도형을 합치면 상대에게 돌을 뿌립니다.",
      ],
      type:"duel",
      badgeClass: "suika",
      maxClients: 2,
      embedPath: "games/suika/index.html"
    },
    // Togester (co-op) is embedded as an iframe and synced via Colyseus messages.
    // Firebase dependencies have been removed.
    {
      id: "drawanswer",
      name: "그림맞추기",
      mobileHint: "모바일: 손가락으로 그림 · 채팅으로 정답 입력",
      descLines: [
        "그리는 사람만 제시어를 보고 그림으로 표현합니다.",
        "나머지는 채팅으로 맞추기! 2연속 정답 또는 5문제 최다정답 승리",
      ],
      type: "coop",
      badgeClass: "coop",
      maxClients: 4,
      embedPath: "games/drawanswer/index.html"
    },

    {
      id: "togester",
      name: "투게스터",
      mobileHint: "모바일: 좌/우 터치 이동 · 양쪽 터치 점프",
      pcHint: "PC: ←→ 이동 / Z 점프",
      descLines: [
        "둘이 힘을 합쳐 퍼즐을 풀고 탈출하세요.",
        "버튼을 밟고 박스를 밀어 문을 여는 협동 플랫폼!",
      ],
      type:"coop",
      badgeClass: "coop",
      maxClients: 4,
      embedPath: "games/togester/index.html"
    },

    {
      id: "suhaktokki",
      name: "수학토끼",
      mobileHint: "모바일: 조이스틱 이동 · 조작 버튼",
      descLines: [
        "토끼굴에서 미션을 풀어 당근을 막으세요.",
        "선생토끼(임포스터)를 피해 제한시간 내 협동!"
      ],
      type: "coop",
      badgeClass: "coop",
      maxClients: 8,
      // Use an embed-only entry that bypasses the game's internal lobby.
      embedPath: "games/suhaktokki/embed.html"
    },

    // SnakeTail (shape snake) - free-for-all up to 8 players
    {
      id: "snaketail",
      name: "꼬리잡기",
      mobileHint: "모바일: 화면을 누른 방향으로 단계 각도만큼 회전 이동",
      descLines: [
        "먹이를 먹어 커지고, 작은 뱀을 먹을 수 있습니다.",
        "3분 동안 가장 크게(또는 최후 1인) 되면 승리!",
      ],
      type: "coop",
      badgeClass: "snake",
      maxClients: 8,
      embedPath: "games/snaketail/index.html"
    }
  ];

  function gameById(id){
    return GAME_REGISTRY.find(g => g.id === id) || GAME_REGISTRY[0];
  }

  window.GAME_REGISTRY = GAME_REGISTRY;
  window.gameById = gameById;
})();
