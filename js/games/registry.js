(function(){
  // Game registry. Room creation cards and the in-room help panel both read this metadata.
  const GAME_REGISTRY = [
    {
      id:'starpaint', name:'별빛 컬러 배틀', category:'액션 · 점령', type:'coop', badgeClass:'coop', maxClients:8,
      embedPath:'games/starpaint/index.html?v=20260903-spaim1', cardImage:'assets/images/game_cards/starpaint.webp',
      lobbyDesc:'최대 8명이 말랑한 별빛 블록을 뛰어다니며 자기 색으로 칠하고 아이템으로 상대를 밀쳐내는 점령전.',
      descLines:['3개의 60초 라운드 동안 더 많은 블록을 자기 색으로 칠하세요.','1~4인은 기본 맵, 5~8인은 확장 맵에서 시작하며 10초마다 인원수에 맞춰 아이템이 보급됩니다.','아이템으로 상대를 밀치거나 바닥을 부수고, 3라운드에는 보스가 등장합니다.'],
      pcHint:'PC: ←→ 이동 · Z 점프 · X 액션 · 폭탄/로켓/대포는 X 길게 조준(↑↓ 각도) · C 아이템 교체',
      mobileHint:'모바일: 조이스틱 이동 · 점프/액션/교체 · 폭탄/로켓/대포는 액션 길게 누르고 위아래 드래그해 조준',
      pcControls:[['← →','이동'],['Z','점프'],['X','액션 · 짧게 즉시 사용 / 길게 조준'],['↑ ↓','조준 중 발사 각도'],['C','아이템 1↔2 교체']],
      mobileControls:[['왼쪽 터치','조이스틱 이동'],['점프','점프'],['액션','짧게 즉시 사용 / 길게 조준'],['위·아래 드래그','조준 각도'],['교체','아이템 1↔2 교체']]
    },
    {
      id:'stackga', name:'블록쌓기', category:'퍼즐 · 대전', type:'duel', badgeClass:'tetris', maxClients:2,
      embedPath:'games/stackga/index.html', cardImage:'assets/images/game_cards/stackga.webp?v=20260831-cards7',
      lobbyDesc:'떨어지는 블록으로 줄을 만들고 상대보다 오래 버티는 1:1 퍼즐 대전.',
      descLines:['블록으로 줄을 맞추면 사라집니다.','두 줄 이상 지우면 상대에게 한 줄 추가합니다.'],
      pcHint:'PC: ←→ 이동 · ↓ 빠른 하강 · ↑ 회전 · Space 즉시 낙하 · P 일시정지',
      mobileHint:'모바일: 좌우 스와이프 이동 · 아래 스와이프 하강 · 탭/버튼으로 회전·낙하',
      pcControls:[['← →','이동'],['↓','빠른 하강'],['↑','회전'],['SPACE','즉시 낙하'],['P','일시정지']],
      mobileControls:[['↔','좌우 스와이프'],['↓','아래 스와이프'],['↻','회전'],['⇩','즉시 낙하']]
    },
    {
      id:'suika', name:'도형게임', category:'퍼즐 · 대전', type:'duel', badgeClass:'suika', maxClients:2,
      embedPath:'games/suika/index.html', cardImage:'assets/images/game_cards/suika.webp?v=20260831-cards7',
      lobbyDesc:'같은 도형을 합쳐 더 큰 도형을 만들고 연쇄 합체로 상대를 압박하는 대전 퍼즐.',
      descLines:['같은 도형 두 개를 합쳐 다음 도형이 됩니다.','연속으로 도형을 합치면 상대에게 돌을 뿌립니다.'],
      pcHint:'PC: 마우스로 위치를 잡고 클릭/놓기로 도형을 떨어뜨립니다.',
      mobileHint:'모바일: 손가락으로 좌우 위치를 잡고 화면에서 손을 떼어 떨어뜨립니다.',
      pcControls:[['🖱','좌우 위치 조절'],['CLICK','도형 떨어뜨리기']],
      mobileControls:[['☝','드래그로 위치 조절'],['↓','손 떼어 떨어뜨리기']]
    },
    {
      id:'drawanswer', name:'그림맞추기', category:'파티 · 추리', type:'coop', badgeClass:'coop', maxClients:4,
      embedPath:'games/drawanswer/index.html', cardImage:'assets/images/game_cards/drawanswer.webp?v=20260831-cards7',
      lobbyDesc:'한 명이 제시어를 그림으로 표현하고 나머지가 채팅으로 정답을 맞히는 파티 게임.',
      descLines:['그리는 사람만 제시어를 보고 그림으로 표현합니다.','나머지는 채팅으로 맞추기! 2연속 정답 또는 5문제 최다정답 승리'],
      pcHint:'PC: 마우스로 그리기 · 색/지우개 선택 · 채팅 입력 후 Enter',
      mobileHint:'모바일: 손가락으로 그리기 · 도구 버튼 선택 · 채팅으로 정답 입력',
      pcControls:[['🖱','그림 그리기'],['COLOR','색/지우개'],['ENTER','정답 전송']],
      mobileControls:[['☝','손가락으로 그리기'],['🎨','색/지우개'],['💬','정답 입력']]
    },
    {
      id:'togester', name:'투게스터', category:'협동 · 퍼즐', type:'coop', badgeClass:'coop', maxClients:4,
      embedPath:'games/togester/index.html', cardImage:'assets/images/game_cards/togester.webp?v=20260831-cards7',
      lobbyDesc:'함정과 퍼즐을 함께 풀고 아이템을 활용해 20개 스테이지의 깃발까지 도달하는 협동 액션.',
      descLines:['둘이 힘을 합쳐 퍼즐을 풀고 탈출하세요.','버튼을 밟고 박스를 밀어 문을 여는 협동 플랫폼!'],
      pcHint:'PC: ←→ 이동 · Z 점프 · 가까이서 상자 밀기 · 아이템 버튼으로 사용',
      mobileHint:'모바일: 좌/우 이동 버튼 · 점프 버튼 · 아이템 버튼으로 사용',
      pcControls:[['← →','이동'],['Z','점프'],['몸으로','상자 밀기'],['ITEM','아이템 사용']],
      mobileControls:[['◀ ▶','이동'],['↑','점프'],['🎒','아이템 사용']]
    },
    {
      id:'suhaktokki', name:'수학토끼', category:'학습 · 추리', type:'coop', badgeClass:'coop', maxClients:8,
      embedPath:'games/suhaktokki/embed.html', cardImage:'assets/images/game_cards/suhaktokki.webp?v=20260831-cards7',
      lobbyDesc:'수학 미션을 해결해 물을 막고 선생토끼를 피해 제한시간 안에 팀 목표를 완수하는 협동 추리.',
      descLines:['토끼굴에서 미션을 풀어 동굴에 물이 차지 않도록 막으세요.','선생토끼(술래)를 피해 제한시간 내 협동하고 숨어있는 술래를 찾아내자!'],
      pcHint:'PC: 마우스 클릭/드래그 이동 · X 조작 · Q 물막기 · F 강제미션',
      mobileHint:'모바일: 왼쪽 조이스틱 이동 · 오른쪽 조작 버튼 · 선생토끼는 검은당근 버튼',
      pcControls:[['🖱','클릭/드래그 이동'],['X','상호작용'],['Q','물막기'],['F','강제미션']],
      mobileControls:[['◉','조이스틱 이동'],['✋','조작'],['🥕','검은당근(술래)']]
    },
    {
      id:'mathexplorer', name:'수학 탐험대', category:'학습 · 액션 RPG', type:'coop', badgeClass:'coop', maxClients:4,
      embedPath:'games/mathexplorer/index.html', cardImage:'assets/images/game_cards/mathexplorer.webp?v=20260831-cards7',
      lobbyDesc:'수학 문제를 풀고 몬스터를 쓰러뜨리며 아이템과 레벨업 효과로 함께 성장하는 협동 RPG.',
      descLines:['수학 문제를 풀며 몬스터를 물리치는 협동 RPG!','캐릭터 선택 후 라운드를 함께 버티고 성장하세요.'],
      pcHint:'PC: 키보드/마우스로 이동·공격 · 문제/보상은 화면 버튼으로 선택',
      mobileHint:'모바일: 가상 조이스틱 이동 · 공격/스킬 버튼 · 터치로 문제·업그레이드 선택',
      pcControls:[['WASD','이동'],['🖱','공격/선택'],['KEY','스킬']],
      mobileControls:[['◉','조이스틱 이동'],['⚔','공격'],['✨','스킬'],['☝','문제/보상 선택']]
    },
    {
      id:'backrooms3d', name:'백룸3d', category:'공포 · 탐험', type:'coop', badgeClass:'coop', maxClients:8,
      embedPath:'games/backrooms3d/embed.html', cardImage:'assets/images/game_cards/backrooms3d.webp?v=20260831-cards7',
      lobbyDesc:'미로를 탐색해 열쇠를 모으고 잠금을 풀어 탈출하는 3D 협동 공포 게임.',
      descLines:['토끼는 열쇠를 모아 탈출문의 잠금 3개를 풀고 탈출하세요.','2명 이상이면 무작위 1명이 괴물! 12시 방향 방에 갇혔다가 10초 후 출발합니다.'],
      pcHint:'PC: WASD 이동 · Shift 질주 · E 상호작용 · Enter 채팅',
      mobileHint:'모바일: 조이스틱 이동 · E/조작 버튼으로 상호작용 · 질주 버튼',
      pcControls:[['WASD','이동'],['SHIFT','질주'],['E','상호작용'],['ENTER','채팅']],
      mobileControls:[['◉','조이스틱 이동'],['E','상호작용'],['≫','질주']]
    },
    {
      id:'snaketail', name:'꼬리잡기', category:'액션 · 생존', type:'coop', badgeClass:'snake', maxClients:8,
      embedPath:'games/snaketail/index.html', cardImage:'assets/images/game_cards/snaketail.webp?v=20260831-cards7',
      lobbyDesc:'먹이를 먹어 몸집을 키우고 다른 꼬리를 피하거나 노리며 최후까지 살아남는 생존전.',
      descLines:['먹이를 먹어 커지고, 작은 뱀을 먹을 수 있습니다.','3분 동안 가장 크게(또는 최후 1인) 되면 승리!'],
      pcHint:'PC: 마우스 포인터 방향으로 회전 이동 · 화면 버튼으로 보조 조작',
      mobileHint:'모바일: 화면을 누른 방향으로 단계 각도만큼 회전 이동',
      pcControls:[['🖱','포인터 방향으로 회전'],['HOLD','방향 유지']],
      mobileControls:[['☝','가고 싶은 방향 터치'],['↻','터치 방향으로 회전']]
    },
    {
      id:'soccer', name:'수학축구', category:'스포츠 · 수학', type:'coop', badgeClass:'coop', maxClients:8,
      embedPath:'games/soccer/index.html', cardImage:'assets/images/game_cards/soccer.webp?v=20260831-cards7',
      lobbyDesc:'문제를 풀어 선공을 정하고 팀원과 패스·슛·태클로 더 많은 골을 노리는 수학 스포츠.',
      descLines:['문제를 풀어 선공을 정하고, 2분 동안 더 많은 골을 넣으면 승리!','이동 · 킥(길게 누르면 강슛) · 태클을 사용하세요.','골 뒤에도 짧은 문제 대결로 다음 선공을 정합니다.'],
      pcHint:'PC: WASD/방향키 이동 · Z/Space 길게 강슛 · X 헤딩 · C/Shift 태클',
      mobileHint:'모바일: 왼쪽 조이스틱 이동 · 킥 버튼 길게 강슛 · 헤딩/태클 버튼',
      pcControls:[['WASD','이동'],['Z / SPACE','킥·강슛'],['X','헤딩'],['C / SHIFT','태클']],
      mobileControls:[['◉','조이스틱 이동'],['⚽','킥·강슛'],['↑','헤딩'],['💨','태클']]
    },
    {
      id:'geumchikeo', name:'금칙어 게임', category:'파티 · 언어', type:'coop', badgeClass:'coop', maxClients:4,
      embedPath:'games/geumchikeo/index.html', cardImage:'assets/images/game_cards/geumchikeo.webp?v=20260831-cards7',
      lobbyDesc:'자연스럽게 대화하며 상대가 자신의 금칙어를 말하게 유도하고 점수를 지키는 심리 파티 게임.',
      descLines:['상대방이 금지된 단어를 말하게 만들면 점수가 깎입니다.','10초 이상 침묵해도 -30점! 사칙연산으로 점수 회복 가능.'],
      pcHint:'PC: 이동키로 캐릭터 이동 · 채팅 입력 후 Enter 또는 전송 버튼',
      mobileHint:'모바일: 조이스틱으로 이동 · 채팅 패널에서 입력/전송',
      pcControls:[['WASD','이동'],['ENTER','채팅 전송'],['💬','대화 유도']],
      mobileControls:[['◉','조이스틱 이동'],['💬','채팅 입력'],['SEND','전송']]
    }
  ];

  function gameById(id){ return GAME_REGISTRY.find(g => g.id === id) || GAME_REGISTRY[0]; }
  window.GAME_REGISTRY = GAME_REGISTRY;
  window.gameById = gameById;
})();
