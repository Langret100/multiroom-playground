/* Chat room mini games: random ladder + client-only mafia/citizen/police/doctor. Apps Script is not used. */
MiniTalk.Chat.RoomGames=(()=>{
  const D=()=>MiniTalk.UI.Dom;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const state={messages:new Map(),privateBoxes:new Map(),decrypting:new Set(),keyAnnouncements:new Set(),revealedRoles:new Set(),autoResolved:new Set(),leaveHandled:new Set(),inviteHandled:new Set(),inviteStarting:new Set(),inviteQueues:new Map(),phaseTimers:new Map(),phaseResolving:new Set(),cleanupTimers:new Map(),localCleanupTimers:new Map(),cleanupRunning:new Set(),retiredGames:new Map(),inviteExpiryTimers:new Map(),chessSending:new Set(),chessFxSeen:new Set(),desktop:{win:null,roomId:null,root:null,title:null,back:null,activeGameId:null,sessionGames:new Map(),refreshTimer:0,closeWatchTimer:0,closeToken:0}};
  const currentUser=()=>MiniTalk.Store.get("user")||{};
  function gameWindow(){try{const w=state.desktop.win;if(w&&!w.closed)return w}catch{}return window}
  function gameConfirm(message){const w=gameWindow();return typeof w?.confirm==="function"?w.confirm(message):true}
  function gamePrompt(message,value=""){const w=gameWindow();return typeof w?.prompt==="function"?w.prompt(message,value):value}
  const randomToken=()=>{try{if(typeof crypto.randomUUID==="function")return crypto.randomUUID().replace(/-/g,"").slice(0,10)}catch{}try{return Array.from(crypto.getRandomValues(new Uint32Array(2))).map(v=>v.toString(36)).join("").slice(0,10)}catch{return Math.random().toString(36).slice(2,12)}};
  const nowId=prefix=>`${prefix}-${Date.now().toString(36)}-${randomToken()}`;
  const safeJson=value=>JSON.stringify(value).replace(/[<>&]/g,c=>({"<":"\\u003c",">":"\\u003e","&":"\\u0026"}[c]));
  const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unb64=text=>Uint8Array.from(atob(String(text||"")),c=>c.charCodeAt(0));
  const ROLE_ORDER=["mafia","police","doctor","citizen"];
  const ROLE_ASSET={
    mafia:"assets/chat-games/role-mafia.png?v=2",
    citizen:"assets/chat-games/role-citizen.png?v=2",
    police:"assets/chat-games/role-police.png?v=2",
    doctor:"assets/chat-games/role-doctor.png?v=2"
  };
  const ROLE_LABEL={mafia:"마피아",citizen:"시민",police:"경찰",doctor:"의사"};
  const ROLE_DESC={
    mafia:"정체를 숨기고 밤마다 한 명을 지목해요.",
    citizen:"대화를 통해 마피아를 찾아내고 투표로 막아야 해요.",
    police:"밤마다 한 명을 조사해 마피아인지 확인해요.",
    doctor:"밤마다 한 명을 치료해 탈락을 막을 수 있어요."
  };
  const phaseText=phase=>phase==="night"?"밤":phase==="day"?"낮 · 토론/투표":"게임 종료";
  const MAFIA_TIMING={roleReveal:15000,night:30000,discussion:45000,vote:30000};
  const INVITE_HOST_ALONE_TIMEOUT=10*60*1000;
  function phaseTiming(phase,{initial=false,now=Date.now()}={}){
    if(phase==="night"){
      const actionStartsAt=initial?now+MAFIA_TIMING.roleReveal:now;
      return{startedAt:now,actionStartsAt,deadline:actionStartsAt+MAFIA_TIMING.night};
    }
    if(phase==="day"){
      const discussionEndsAt=now+MAFIA_TIMING.discussion;
      return{startedAt:now,discussionEndsAt,deadline:discussionEndsAt+MAFIA_TIMING.vote};
    }
    return{startedAt:now,deadline:now};
  }
  function phasePayload(id,phase,round,living,opts={}){return{kind:"mafia-phase",id,phase,round,living:[...living],...phaseTiming(phase,opts)}}
  function formatRemain(ms){return `${Math.max(0,Math.ceil(ms/1000))}초`}
  function phaseWindow(game,now=Date.now()){
    if(game.phase==="night")return now<(game.actionStartsAt||game.startedAt||0)?"role":"night";
    if(game.phase==="day")return now<(game.discussionEndsAt||game.startedAt||0)?"discussion":"vote";
    return"ended";
  }
  const ladderPalette=["#7c3aed","#f97316","#06b6d4","#22c55e","#ef4444","#eab308","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f59e0b","#10b981"];
  let gameSfxCtx=null;
  function gameSfxContext(){
    try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;if(!gameSfxCtx||gameSfxCtx.state==="closed")gameSfxCtx=new Ctx();if(gameSfxCtx.state==="suspended")gameSfxCtx.resume().catch(()=>{});return gameSfxCtx}catch{return null}
  }
  function gameTone(ctx,{at=0,freq=440,to=null,duration=.08,gain=.035,type="sine"}={}){
    try{const start=ctx.currentTime+Math.max(0,at),osc=ctx.createOscillator(),amp=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(Math.max(40,freq),start);if(to)osc.frequency.exponentialRampToValueAtTime(Math.max(40,to),start+duration);amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(Math.max(.001,gain),start+.008);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(amp).connect(ctx.destination);osc.start(start);osc.stop(start+duration+.02)}catch{}
  }
  function playGameSfx(name){
    const ctx=gameSfxContext();if(!ctx)return false;
    const tone=(o)=>gameTone(ctx,o);
    if(name==="shuffle"){tone({freq:520,to:720,duration:.045,gain:.023,type:"triangle"});tone({at:.09,freq:610,to:830,duration:.045,gain:.022,type:"triangle"});tone({at:.18,freq:700,to:930,duration:.05,gain:.021,type:"triangle"})}
    else if(name==="flip"){tone({freq:260,to:760,duration:.14,gain:.032,type:"triangle"})}
    else if(name==="reveal"){tone({freq:523,duration:.16,gain:.035,type:"sine"});tone({at:.055,freq:659,duration:.18,gain:.03,type:"sine"});tone({at:.11,freq:784,duration:.2,gain:.028,type:"sine"})}
    else if(name==="trace"){tone({freq:500,to:900,duration:.13,gain:.025,type:"triangle"})}
    else if(name==="action"){tone({freq:430,to:610,duration:.09,gain:.026,type:"sine"})}
    else if(name==="vote"){tone({freq:360,to:300,duration:.11,gain:.028,type:"triangle"})}
    else if(name==="result"){tone({freq:330,to:520,duration:.13,gain:.03,type:"triangle"});tone({at:.08,freq:660,duration:.14,gain:.024,type:"sine"})}
    else if(name==="start"){tone({freq:392,duration:.10,gain:.025});tone({at:.07,freq:523,duration:.12,gain:.025});tone({at:.14,freq:659,duration:.14,gain:.025})}
    else if(name==="chess-move"){tone({freq:210,to:165,duration:.055,gain:.024,type:"triangle"});tone({at:.045,freq:125,duration:.035,gain:.018,type:"sine"})}
    else if(name==="chess-capture"){tone({freq:240,to:105,duration:.09,gain:.034,type:"square"});tone({at:.035,freq:760,to:330,duration:.075,gain:.016,type:"triangle"})}
    else if(name==="chess-castle"){tone({freq:185,to:155,duration:.055,gain:.024,type:"triangle"});tone({at:.07,freq:185,to:155,duration:.055,gain:.023,type:"triangle"})}
    else if(name==="chess-promote"){tone({freq:523,duration:.10,gain:.025,type:"sine"});tone({at:.065,freq:659,duration:.12,gain:.026,type:"sine"});tone({at:.13,freq:988,duration:.17,gain:.024,type:"triangle"})}
    else if(name==="chess-check"){tone({freq:740,to:520,duration:.10,gain:.03,type:"sawtooth"});tone({at:.10,freq:620,to:430,duration:.11,gain:.024,type:"triangle"})}
    else if(name==="chess-mate"){tone({freq:392,duration:.12,gain:.029,type:"triangle"});tone({at:.085,freq:523,duration:.14,gain:.03,type:"triangle"});tone({at:.17,freq:659,duration:.17,gain:.031,type:"triangle"});tone({at:.27,freq:988,duration:.30,gain:.024,type:"sine"})}
    return true
  }

  function roleAsset(role){return ROLE_ASSET[role]||ROLE_ASSET.citizen}
  function roleLabel(role){return ROLE_LABEL[role]||"시민"}
  function roleDesc(role){return ROLE_DESC[role]||ROLE_DESC.citizen}

  function gameMessages(gameId){return state.messages.get(gameId)||[]}
  function desktopRefreshKind(kind){
    return ["game-invite","game-invite-slot","game-invite-leave","game-invite-decline","game-invite-cancelled","ladder","mafia-lobby","mafia-phase","mafia-death","mafia-eliminate","mafia-tie","mafia-player-left","chess-start","chess-move","chess-end","chess-draw-offer","chess-draw-reject"].includes(String(kind||""));
  }
  function ingest(message){
    const game=message?.game;if(!game?.id||!game.kind)return;
    const list=state.messages.get(game.id)||[],messageId=String(message.id||"");
    const duplicate=messageId?list.some(item=>String(item.id||"")===messageId):list.some(item=>item===message);
    if(duplicate)return false;
    const retired=state.retiredGames.get(String(game.id));if(retired){if(Number(retired.expiresAt||0)<=Date.now())state.retiredGames.delete(String(game.id));else{if(messageId&&String(retired.hostId||"")===String(currentUser().user_id||"")&&MiniTalk.Realtime.removeGameMessages)setTimeout(()=>MiniTalk.Realtime.removeGameMessages(message.roomId||retired.roomId,[messageId]).catch(()=>{}),0);return false}}
    list.push(message);state.messages.set(game.id,list);
    if(game.kind==="mafia-role"&&game.target===currentUser().user_id)primeOwnBox(`role:${game.id}:${game.target}`,message,async()=>{
      const data=await decryptOwn(game.cipher);return{kind:"role",value:data}
    });
    if(game.kind==="mafia-police-result"&&game.target===currentUser().user_id)primeOwnBox(`police:${game.id}:${game.target}:${game.round||0}`,message,async()=>{
      const data=await decryptOwn(game.cipher);return{kind:"police-result",value:data}
    });
    if(game.kind==="game-invite")scheduleHostAloneInviteExpiry(message);
    if(game.kind==="game-invite-accept")setTimeout(()=>handleInviteAcceptAsHost(message).catch(()=>{}),0);
    if(game.kind==="game-invite-slot"&&game.status==="accepted")clearInviteExpiry(game.id);
    if(game.kind==="game-invite-leave"&&game.userId)state.inviteHandled.delete(`${game.id}:user:${String(game.userId)}`);
    if(game.kind==="game-invite-decline"||game.kind==="game-invite-leave")setTimeout(()=>maybeFinalizeInviteAsHost(message.roomId,game.id).catch(()=>{}),0);
    if(game.kind==="game-invite-slot"&&game.status==="accepted")setTimeout(()=>maybeFinalizeInviteAsHost(message.roomId,game.id).catch(()=>{}),0);
    if(game.kind==="mafia-lobby"&&game.participants?.some(p=>p.user_id===currentUser().user_id))setTimeout(()=>announceMafiaKey(message.roomId,game).catch(()=>{}),0);
    if(game.kind==="mafia-key")setTimeout(()=>maybeAutoStartMafia(message.roomId,game.id).catch(()=>{}),0);
    if(game.kind==="mafia-leave")setTimeout(()=>maybeHandleLeaveAsHost(message).catch(()=>{}),0);
    if(game.kind==="mafia-phase"&&game.phase!=="ended")scheduleHostPhaseResolution(message);
    if(gameIsTerminal(game.id)){clearInviteExpiry(game.id);rememberRetiredGame(game.id,message.roomId,gameHostId(game.id));scheduleLocalGameCleanup(game.id);scheduleGameCleanup(message.roomId,game.id)};
    if(game.kind==='chess-move'||game.kind==='chess-end')setTimeout(()=>playChessMessageFx(message),0);
    if(state.desktop.activeGameId===game.id&&desktopRefreshKind(game.kind))queueDesktopRefresh(game.id);
    return true;
  }
  function uniqueMembers(values){
    const rows=(values||[]).filter(raw=>raw?.user_id).map(raw=>({...raw,user_id:String(raw.user_id).trim(),nickname:String(raw.nickname||raw.name||raw.user_id||"").trim()})).filter(raw=>raw.user_id&&!/^guest-/i.test(raw.user_id));
    const nicknameKey=value=>String(value||"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("ko-KR");
    const realNicknames=new Set(rows.filter(raw=>!/^legacy-/i.test(raw.user_id)).map(raw=>nicknameKey(raw.nickname)).filter(Boolean));
    const out=[],seen=new Set();
    for(const raw of rows){
      const id=raw.user_id;if(seen.has(id))continue;
      if(/^legacy-/i.test(id)&&raw.nickname&&realNicknames.has(nicknameKey(raw.nickname)))continue;
      seen.add(id);out.push(raw);
    }
    return out;
  }
  function membersFor(room){
    if(room?.id==="global")return uniqueMembers(Object.values(MiniTalk.Store.get("presence")||{}));
    return uniqueMembers(Object.values(room?.members||{}));
  }
  function memberPicker(title,members,{min=2,max=99,extraBuilder=null,onSubmit,mount=null}){
    const U=D(),body=U.el("div",{class:"modal-stack room-game-picker"}),selected=new Set();
    body.append(U.el("p",{class:"muted modal-note",text:`${title}에 참여할 멤버를 선택하세요.`}));
    const controls=U.el("div",{class:"room-game-picker-controls"}),all=U.el("button",{class:"mini-action",type:"button",text:"전체 선택"}),none=U.el("button",{class:"mini-action",type:"button",text:"선택 해제"}),count=U.el("span",{class:"muted room-game-count"});
    controls.append(all,none,count);body.append(controls);
    const list=U.el("div",{class:"room-member-list room-game-member-list"});
    const update=()=>{count.textContent=`${selected.size}명 선택`;list.querySelectorAll("input[data-game-member]").forEach(input=>input.checked=selected.has(input.dataset.gameMember))};
    members.forEach(member=>{
      const id=String(member.user_id),profile=MiniTalk.Store.get("profiles")?.[id]||{},src=profile.avatar||member.avatar||"",check=U.el("input",{type:"checkbox","data-game-member":id,"aria-label":`${member.nickname||id} 선택`});
      check.checked=false;check.onchange=()=>{check.checked?selected.add(id):selected.delete(id);update()};
      const avatar=src?U.el("img",{class:"room-member-avatar profile-image",src,alt:""}):U.el("span",{class:"room-member-avatar",text:(member.nickname||id||"?").slice(0,1)});
      list.append(U.el("label",{class:"room-member room-game-member-option"},[
        avatar,
        U.el("span",{class:"room-member-copy"},[
          U.el("strong",{text:member.nickname||id}),
          U.el("small",{class:"muted",text:id===currentUser().user_id?"나":"대화방 멤버"})
        ]),
        check
      ]));
    });
    body.append(list);
    all.onclick=()=>{members.forEach(m=>selected.add(String(m.user_id)));update()};
    none.onclick=()=>{selected.clear();update()};
    const extra=extraBuilder?.(body,()=>[...selected])||null;
    const go=U.el("button",{class:"button primary",type:"button",text:"만들기"});
    go.onclick=async()=>{
      if(selected.size<min){MiniTalk.UI.Shell.toast(`최소 ${min}명을 선택하세요.`);return}
      if(selected.size>max){MiniTalk.UI.Shell.toast(`최대 ${max}명까지 선택할 수 있어요.`);return}
      go.disabled=true;
      try{await onSubmit([...selected],extra)}catch(error){MiniTalk.UI.Shell.toast(error.message||"게임을 만들지 못했습니다.");go.disabled=false}
    };
    body.append(go);update();if(mount){mount(title,body);return}MiniTalk.UI.Shell.modal(title,body)
  }

  function rng(seed){let x=(Number(seed)||1)>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296}}
  function ladderData(game){
    const people=game.participants||[],n=Math.max(2,people.length),rows=Math.max(12,Math.min(34,n*3+8)),random=rng(game.seed),rungs=[];
    let prev=-2;
    for(let r=0;r<rows;r++){
      const candidates=[];for(let c=0;c<n-1;c++)candidates.push(c);
      for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1)),t=candidates[i];candidates[i]=candidates[j];candidates[j]=t}
      const used=new Set();
      for(const c of candidates){if(used.has(c)||used.has(c+1))continue;const chance=n===2?.58:.42;if(random()>chance)continue;if(n===2&&prev===r-1&&random()<.48)continue;rungs.push([r,c]);used.add(c);used.add(c+1);prev=r}
    }
    const minimum=Math.min(rows,Math.max(5,n+3));
    if(rungs.length<minimum){
      const occupied=new Set(rungs.map(([r,c])=>`${r}:${c}`));
      for(let r=1;r<rows-1&&rungs.length<minimum;r+=2){const c=Math.floor(random()*Math.max(1,n-1));if(occupied.has(`${r}:${c}`))continue;if(rungs.some(([rr,cc])=>rr===r&&Math.abs(cc-c)<=1))continue;rungs.push([r,c]);occupied.add(`${r}:${c}`)}
      rungs.sort((a,b)=>a[0]-b[0]||a[1]-b[1])
    }
    const pos=[...Array(n).keys()];
    for(const [,c] of rungs){const t=pos[c];pos[c]=pos[c+1];pos[c+1]=t}
    const mapping=Array(n);pos.forEach((start,end)=>mapping[start]=end);return{rows,rungs,mapping}
  }
  function ladderLayout(game){
    const n=Math.max(2,(game.participants||[]).length),data=ladderData(game),width=Math.max(240,n*86),height=Math.max(390,data.rows*25+70),padX=Math.max(34,Math.min(58,width*.08)),padTop=28,padBottom=34;
    const x=index=>padX+index*(width-padX*2)/Math.max(1,n-1);
    const y=index=>padTop+(index+.5)*(height-padTop-padBottom)/Math.max(1,data.rows);
    return{...data,width,height,padX,padTop,padBottom,x,y}
  }
  function ladderTrace(game,start){
    const layout=ladderLayout(game),points=[],rungAt=new Map(layout.rungs.map(([r,c])=>[`${r}:${c}`,true]));
    let lane=start;points.push([layout.x(lane),layout.padTop]);
    for(let row=0;row<layout.rows;row++){
      const y=layout.y(row);points.push([layout.x(lane),y]);
      if(rungAt.get(`${row}:${lane}`)){lane+=1;points.push([layout.x(lane),y])}
      else if(rungAt.get(`${row}:${lane-1}`)){lane-=1;points.push([layout.x(lane),y])}
    }
    points.push([layout.x(lane),layout.height-layout.padBottom]);
    return{layout,points,endIndex:layout.mapping[start]}
  }
  function tracePath(points){return points.map((point,index)=>`${index?"L":"M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ")}
  function animateLadderPath(path,marker,duration=1100){
    return new Promise(resolve=>{let length=0;try{length=path.getTotalLength()}catch{}if(!length){resolve();return}path.style.strokeDasharray=String(length);path.style.strokeDashoffset=String(length);const started=(typeof performance!=="undefined"&&typeof performance.now==="function"?performance.now():Date.now());const frame=now=>{const t=Math.max(0,Math.min(1,((now||Date.now())-started)/duration)),ease=1-Math.pow(1-t,2.4),at=length*ease;path.style.strokeDashoffset=String(length-at);try{const point=path.getPointAtLength(at);marker.setAttribute("cx",point.x);marker.setAttribute("cy",point.y)}catch{}if(t<1)requestAnimationFrame(frame);else{path.style.strokeDashoffset="0";resolve()}};requestAnimationFrame(frame)})
  }
  function playerChip(U,person,index,onClick){const chip=U.el("button",{class:"ladder-player-chip",type:"button","data-player-index":String(index)}),avatar=U.el("span",{class:"ladder-player-dot",text:(person.nickname||person.user_id||"?").slice(0,1)}),name=U.el("span",{text:person.nickname});chip.append(avatar,name);chip.onclick=onClick;return chip}
  function ladderCard(game){
    const U=D(),layout=ladderLayout(game),card=U.el("section",{class:"room-game-card ladder-game-card"});
    card.append(U.el("div",{class:"room-game-head"},[
      U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:"🪜 사다리타기"}),U.el("small",{text:"이름을 누르면 실제 경로를 따라 내려가요."})]),
      U.el("span",{class:"room-game-badge",text:"RANDOM"})
    ]));
    card.append(U.el("div",{class:"room-game-pills"},[U.el("span",{class:"room-game-pill",text:`참가 ${game.participants.length}명`}),U.el("span",{class:"room-game-pill",text:`연결 ${layout.rungs.length}개`})]));
    const top=U.el("div",{class:"ladder-top-row"});
    game.participants.forEach((person,index)=>top.append(playerChip(U,person,index,()=>selectTrace(index))));card.append(top);
    const stage=U.el("div",{class:"ladder-stage"}),scroll=U.el("div",{class:"ladder-scroll"});
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox",`0 0 ${layout.width} ${layout.height}`);svg.setAttribute("preserveAspectRatio","xMidYMid meet");svg.classList.add("ladder-svg");
    const bg=document.createElementNS(svg.namespaceURI,"rect");bg.setAttribute("x","8");bg.setAttribute("y","8");bg.setAttribute("width",String(layout.width-16));bg.setAttribute("height",String(layout.height-16));bg.setAttribute("rx","18");bg.classList.add("ladder-panel-bg");svg.append(bg);
    for(let i=0;i<game.participants.length;i++){const line=document.createElementNS(svg.namespaceURI,"line");line.setAttribute("x1",layout.x(i));line.setAttribute("x2",layout.x(i));line.setAttribute("y1",layout.padTop);line.setAttribute("y2",layout.height-layout.padBottom);line.classList.add("ladder-rail");svg.append(line)}
    layout.rungs.forEach(([r,c])=>{const line=document.createElementNS(svg.namespaceURI,"line"),y=layout.y(r);line.setAttribute("x1",layout.x(c));line.setAttribute("x2",layout.x(c+1));line.setAttribute("y1",y);line.setAttribute("y2",y);line.classList.add("ladder-rung");svg.append(line)});
    const traceLayer=document.createElementNS(svg.namespaceURI,"g");traceLayer.classList.add("ladder-traces");svg.append(traceLayer);scroll.append(svg);stage.append(scroll);card.append(stage);
    const bottom=U.el("div",{class:"ladder-result-slots"});(game.results||[]).forEach((value,index)=>bottom.append(U.el("div",{class:"ladder-result-slot","data-result-index":String(index)},[U.el("small",{text:`결과 ${index+1}`}),U.el("strong",{text:value||`${index+1}번`})])));card.append(bottom);
    const focus=U.el("div",{class:"ladder-focus-box hidden"}),focusLine=U.el("div",{class:"ladder-focus-copy"},[U.el("small",{text:"선택 결과"}),U.el("strong",{text:"위에서 이름을 눌러 시작하세요."})]);focus.append(focusLine);card.append(focus);
    const revealAll=U.el("button",{class:"button secondary compact-button",type:"button",text:"전체 경로 순서대로 보기"}),resultList=U.el("div",{class:"ladder-results hidden"});layout.mapping.forEach((end,start)=>resultList.append(U.el("div",{class:"ladder-result-row"},[U.el("b",{text:game.participants[start].nickname}),U.el("span",{text:"→"}),U.el("strong",{text:(game.results||[])[end]||`${end+1}번`})])));
    let runToken=0;
    revealAll.onclick=async()=>{const token=++runToken;revealAll.disabled=true;resultList.classList.add("hidden");for(let i=0;i<game.participants.length&&token===runToken;i++)await selectTrace(i,{duration:Math.max(520,920-game.participants.length*22)});if(token===runToken){resultList.classList.remove("hidden");revealAll.textContent="전체 결과 다시 보기";revealAll.disabled=false}};
    card.append(U.el("div",{class:"room-game-actions"},[revealAll]),resultList);
    async function selectTrace(index,{duration=1100}={}){
      const picked=game.participants[index],trace=ladderTrace(game,index),color=ladderPalette[index%ladderPalette.length];playGameSfx("trace");top.querySelectorAll(".ladder-player-chip").forEach((node,i)=>node.classList.toggle("active",i===index));bottom.querySelectorAll(".ladder-result-slot").forEach(node=>node.classList.remove("active"));traceLayer.replaceChildren();
      const path=document.createElementNS(svg.namespaceURI,"path");path.setAttribute("d",tracePath(trace.points));path.classList.add("ladder-trace-path");path.style.setProperty("--trace-color",color);traceLayer.append(path);
      const marker=document.createElementNS(svg.namespaceURI,"circle");marker.setAttribute("cx",trace.points[0][0]);marker.setAttribute("cy",trace.points[0][1]);marker.setAttribute("r","8");marker.classList.add("ladder-runner");marker.style.setProperty("--trace-color",color);traceLayer.append(marker);
      focus.classList.remove("hidden");focusLine.replaceChildren(U.el("small",{text:"경로 추적 중"}),U.el("strong",{text:`${picked.nickname} 내려가는 중…`}));await animateLadderPath(path,marker,duration);
      marker.classList.add("arrived");bottom.querySelector(`[data-result-index="${trace.endIndex}"]`)?.classList.add("active");focusLine.replaceChildren(U.el("small",{text:"도착!"}),U.el("strong",{text:`${picked.nickname} → ${(game.results||[])[trace.endIndex]||`${trace.endIndex+1}번`}`}));playGameSfx("result");return trace.endIndex
    }
    return card
  }
  function chessPieceSvg(piece){
    if(!piece)return null;const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 64 64");svg.setAttribute("aria-hidden","true");svg.classList.add("chess-piece-svg",piece.c==='w'?"white":"black");const ns=svg.namespaceURI,add=(tag,attrs)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));svg.append(n);return n};
    const base=()=>{add("path",{d:"M15 53 Q32 47 49 53 L52 59 H12 Z",class:"piece-base"});add("path",{d:"M19 47 H45 L49 53 H15 Z",class:"piece-body"})};
    if(piece.t==='p'){add("circle",{cx:32,cy:18,r:9});add("path",{d:"M24 28 Q32 24 40 28 L43 46 H21 Z"});base()}
    else if(piece.t==='r'){add("path",{d:"M18 12 H24 V18 H29 V12 H35 V18 H40 V12 H46 V26 H18 Z"});add("path",{d:"M22 27 H42 L45 47 H19 Z"});base()}
    else if(piece.t==='n'){add("path",{d:"M20 46 Q18 35 26 29 L22 22 L31 10 Q43 15 47 28 L40 31 L43 47 Z"});add("circle",{cx:36,cy:20,r:2.3,class:"piece-eye"});base()}
    else if(piece.t==='b'){add("path",{d:"M32 9 C22 18 21 27 29 34 L23 46 H41 L35 34 C43 27 42 18 32 9 Z"});add("path",{d:"M36 15 L27 29",class:"piece-cut"});base()}
    else if(piece.t==='q'){for(const [cx,cy] of [[18,16],[32,10],[46,16]])add("circle",{cx,cy,r:4});add("path",{d:"M16 20 L24 31 L32 18 L40 31 L48 20 L43 46 H21 Z"});base()}
    else {add("path",{d:"M29 8 H35 V14 H41 V20 H35 V27 H29 V20 H23 V14 H29 Z"});add("path",{d:"M24 29 Q32 24 40 29 L43 46 H21 Z"});base()}
    return svg
  }
  const chessOther=c=>c==="w"?"b":"w";
  const chessColorLabel=c=>c==="w"?"백":"흑";
  const chessSquare=(r,c)=>`${String.fromCharCode(97+c)}${8-r}`;
  const chessPos=sq=>{const m=/^([a-h])([1-8])$/.exec(String(sq||""));return m?[8-Number(m[2]),m[1].charCodeAt(0)-97]:null};
  function chessInitial(){
    const back=['r','n','b','q','k','b','n','r'],board=Array.from({length:8},()=>Array(8).fill(null));
    for(let c=0;c<8;c++){board[0][c]={c:'b',t:back[c]};board[1][c]={c:'b',t:'p'};board[6][c]={c:'w',t:'p'};board[7][c]={c:'w',t:back[c]}}
    return{board,turn:'w',castling:{wk:true,wq:true,bk:true,bq:true},ep:null,half:0,full:1,last:null};
  }
  const chessClone=state=>({board:state.board.map(row=>row.map(p=>p?{...p}:null)),turn:state.turn,castling:{...state.castling},ep:state.ep,half:state.half,full:state.full,last:state.last?{...state.last}:null});
  const chessInside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
  function chessAttacked(state,r,c,by){
    const b=state.board,pawn=by==='w'?-1:1;
    for(const dc of [-1,1]){const rr=r-pawn,cc=c-dc;if(chessInside(rr,cc)&&b[rr][cc]?.c===by&&b[rr][cc]?.t==='p')return true}
    for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){const rr=r+dr,cc=c+dc;if(chessInside(rr,cc)&&b[rr][cc]?.c===by&&b[rr][cc]?.t==='n')return true}
    for(const [dr,dc,types] of [[-1,0,'rq'],[1,0,'rq'],[0,-1,'rq'],[0,1,'rq'],[-1,-1,'bq'],[-1,1,'bq'],[1,-1,'bq'],[1,1,'bq']]){let rr=r+dr,cc=c+dc;while(chessInside(rr,cc)){const p=b[rr][cc];if(p){if(p.c===by&&types.includes(p.t))return true;break}rr+=dr;cc+=dc}}
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(chessInside(rr,cc)&&b[rr][cc]?.c===by&&b[rr][cc]?.t==='k')return true}
    return false;
  }
  function chessInCheck(state,color){for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(state.board[r][c]?.c===color&&state.board[r][c]?.t==='k')return chessAttacked(state,r,c,chessOther(color));return true}
  function chessPseudo(state,from,to,promotion='q'){
    const a=chessPos(from),z=chessPos(to);if(!a||!z)return null;const [fr,fc]=a,[tr,tc]=z,p=state.board[fr][fc],target=state.board[tr][tc];if(!p||p.c!==state.turn||target?.c===p.c)return null;
    const dr=tr-fr,dc=tc-fc,adr=Math.abs(dr),adc=Math.abs(dc),out={from,to,piece:p,capture:target||null,promotion:null,castle:null,epCapture:null};
    if(p.t==='p'){
      const dir=p.c==='w'?-1:1,start=p.c==='w'?6:1,promote=p.c==='w'?0:7;
      if(dc===0&&dr===dir&&!target){}
      else if(dc===0&&dr===2*dir&&fr===start&&!target&&!state.board[fr+dir][fc]){}
      else if(adc===1&&dr===dir&&target?.c===chessOther(p.c)){}
      else if(adc===1&&dr===dir&&state.ep===to){out.epCapture=chessSquare(fr,tc);out.capture=state.board[fr][tc]||null;if(!out.capture||out.capture.t!=='p'||out.capture.c===p.c)return null}
      else return null;
      if(tr===promote){promotion=String(promotion||'q').toLowerCase();if(!['q','r','b','n'].includes(promotion))promotion='q';out.promotion=promotion}
      return out;
    }
    if(p.t==='n'){if(!((adr===2&&adc===1)||(adr===1&&adc===2)))return null;return out}
    if(p.t==='b'||p.t==='r'||p.t==='q'){
      if(p.t==='b'&&adr!==adc)return null;if(p.t==='r'&&dr!==0&&dc!==0)return null;if(p.t==='q'&&!(adr===adc||dr===0||dc===0))return null;
      const sr=Math.sign(dr),sc=Math.sign(dc);let rr=fr+sr,cc=fc+sc;while(rr!==tr||cc!==tc){if(state.board[rr][cc])return null;rr+=sr;cc+=sc}return out
    }
    if(p.t==='k'){
      if(adr<=1&&adc<=1)return out;
      if(dr===0&&adc===2){const side=dc>0?'k':'q',right=p.c+side,home=p.c==='w'?7:0;if(fr!==home||fc!==4||!state.castling[right]||chessInCheck(state,p.c))return null;const rookC=side==='k'?7:0,passC=side==='k'?5:3,endC=side==='k'?6:2,between=side==='k'?[5,6]:[1,2,3];if(!state.board[home][rookC]||state.board[home][rookC].c!==p.c||state.board[home][rookC].t!=='r'||between.some(c=>state.board[home][c])||chessAttacked(state,home,passC,chessOther(p.c))||chessAttacked(state,home,endC,chessOther(p.c)))return null;out.castle=side;return out}
    }
    return null;
  }
  function chessApply(state,move){
    const next=chessClone(state),[fr,fc]=chessPos(move.from),[tr,tc]=chessPos(move.to),p={...next.board[fr][fc]},originalType=p.t,captured=move.epCapture?next.board[chessPos(move.epCapture)[0]][chessPos(move.epCapture)[1]]:next.board[tr][tc];next.board[fr][fc]=null;
    if(move.epCapture){const [er,ec]=chessPos(move.epCapture);next.board[er][ec]=null}
    if(move.castle){const home=p.c==='w'?7:0,rookFrom=move.castle==='k'?7:0,rookTo=move.castle==='k'?5:3;next.board[home][rookTo]=next.board[home][rookFrom];next.board[home][rookFrom]=null}
    if(move.promotion)p.t=move.promotion;next.board[tr][tc]=p;
    if(p.t==='k'){next.castling[p.c+'k']=false;next.castling[p.c+'q']=false}
    if(p.t==='r'){if(fr===7&&fc===0)next.castling.wq=false;if(fr===7&&fc===7)next.castling.wk=false;if(fr===0&&fc===0)next.castling.bq=false;if(fr===0&&fc===7)next.castling.bk=false}
    if(captured?.t==='r'){if(tr===7&&tc===0)next.castling.wq=false;if(tr===7&&tc===7)next.castling.wk=false;if(tr===0&&tc===0)next.castling.bq=false;if(tr===0&&tc===7)next.castling.bk=false}
    next.ep=null;if(originalType==='p'&&Math.abs(tr-fr)===2)next.ep=chessSquare((fr+tr)/2,fc);next.half=(originalType==='p'||captured)?0:next.half+1;if(state.turn==='b')next.full++;next.turn=chessOther(state.turn);next.last={from:move.from,to:move.to};return next;
  }
  function chessLegalMove(state,from,to,promotion='q'){
    const move=chessPseudo(state,from,to,promotion);if(!move)return null;const next=chessApply(state,move);return chessInCheck(next,move.piece.c)?null:move;
  }
  function chessLegalMoves(state,color=state.turn){const original=state.turn;if(original!==color)state={...state,turn:color};const out=[];for(let fr=0;fr<8;fr++)for(let fc=0;fc<8;fc++){const p=state.board[fr][fc];if(!p||p.c!==color)continue;for(let tr=0;tr<8;tr++)for(let tc=0;tc<8;tc++){const m=chessLegalMove(state,chessSquare(fr,fc),chessSquare(tr,tc));if(m)out.push(m)}}return out}
  function chessStatus(state){const moves=chessLegalMoves(state,state.turn),check=chessInCheck(state,state.turn);if(!moves.length)return{ended:true,reason:check?'checkmate':'stalemate',winner:check?chessOther(state.turn):null,check};if(state.half>=100)return{ended:true,reason:'fifty-move',winner:null,check};return{ended:false,check}}
  function chessMoveFx(move,nextState){const status=chessStatus(nextState);return{capture:!!move.capture||!!move.epCapture,castle:move.castle||null,promotion:move.promotion||null,check:!!status.check,mate:status.ended&&status.reason==='checkmate'}}
  function chessSfxName(fx){if(fx?.mate)return'chess-mate';if(fx?.check)return'chess-check';if(fx?.promotion)return'chess-promote';if(fx?.castle)return'chess-castle';if(fx?.capture)return'chess-capture';return'chess-move'}
  function playChessMessageFx(message){const g=message?.game,key=String(message?.id||`${g?.id||''}:${g?.kind||''}:${g?.moveNo||''}`);if(!g||state.chessFxSeen.has(key))return false;state.chessFxSeen.add(key);if(g.kind==='chess-move'){playGameSfx(chessSfxName(g.fx));return true}if(g.kind==='chess-end'){playGameSfx(g.reason==='checkmate'?'chess-mate':'result');return true}return false}
  function chessState(gameId){const start=latest(gameId,'chess-start')?.game;if(!start)return null;let state=chessInitial(),validMoves=[];const moves=allOf(gameId,'chess-move').slice().sort((a,b)=>(Number(a.game?.moveNo)||0)-(Number(b.game?.moveNo)||0)||String(a.id||'').localeCompare(String(b.id||''))).map(m=>m.game);for(const g of moves){if(Number(g.moveNo)!==validMoves.length+1)continue;const player=start.players?.find(p=>String(p.user_id)===String(g.by));if(!player||player.color!==state.turn)continue;const mv=chessLegalMove(state,g.from,g.to,g.promotion);if(!mv)continue;state=chessApply(state,mv);validMoves.push(g)}return{start,state,moves:validMoves,status:chessStatus(state)}}
  function chessTerminal(gameId){const ends=allOf(gameId,'chess-end');if(!ends.length)return null;return ends.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0]}
  function chessPlayer(start,userId){return start?.players?.find(p=>String(p.user_id)===String(userId))||null}
  async function sendChessEnd(roomId,gameId,{reason,winner=null,by=null}={}){if(chessTerminal(gameId))return;await sendGame(roomId,{text:'[체스 게임 종료]',game:{kind:'chess-end',id:gameId,reason,winner,by,endedAt:Date.now()}});scheduleGameCleanup(roomId,gameId)}
  async function submitChessMove(roomId,gameId,from,to,promotion='q'){
    const snap=chessState(gameId),me=String(currentUser().user_id||'');if(!snap||chessTerminal(gameId))return;const mine=chessPlayer(snap.start,me);if(!mine||mine.color!==snap.state.turn)throw new Error('지금은 내 차례가 아니에요.');const lock=`${gameId}:${snap.moves.length+1}`;if(state.chessSending.has(lock))return;const mv=chessLegalMove(snap.state,from,to,promotion);if(!mv)throw new Error('그 말은 그렇게 움직일 수 없어요.');const projected=chessApply(snap.state,mv),fx=chessMoveFx(mv,projected);state.chessSending.add(lock);try{await sendGame(roomId,{text:'[체스 수]',game:{kind:'chess-move',id:gameId,moveNo:snap.moves.length+1,by:me,from,to,promotion:mv.promotion||null,fx,movedAt:Date.now()}});const after=chessState(gameId);if(after?.status?.ended)await sendChessEnd(roomId,gameId,{reason:after.status.reason,winner:after.status.winner})}finally{state.chessSending.delete(lock)}}
  async function resignChess(roomId,gameId){const snap=chessState(gameId),me=String(currentUser().user_id||'');if(!snap||chessTerminal(gameId))return;const mine=chessPlayer(snap.start,me);if(!mine)return;if(!gameConfirm('체스 게임에서 기권할까요?'))return;await sendChessEnd(roomId,gameId,{reason:'resign',winner:chessOther(mine.color),by:me})}
  async function leaveChess(roomId,gameId){const snap=chessState(gameId),me=String(currentUser().user_id||'');if(!snap||chessTerminal(gameId))return;const mine=chessPlayer(snap.start,me);if(!mine)return;if(!gameConfirm('체스 게임에서 나갈까요? 게임이 종료됩니다.'))return;await sendChessEnd(roomId,gameId,{reason:'leave',winner:chessOther(mine.color),by:me})}
  async function offerChessDraw(roomId,gameId){const snap=chessState(gameId),me=String(currentUser().user_id||'');if(!snap||chessTerminal(gameId)||!chessPlayer(snap.start,me))return;const existing=latest(gameId,'chess-draw-offer',m=>String(m.game.by)!==me&&!latest(gameId,'chess-draw-reject',r=>String(r.game.offerId)===String(m.id)));if(existing){await sendChessEnd(roomId,gameId,{reason:'draw-agreement',winner:null,by:me});return}await sendGame(roomId,{text:'[체스 무승부 제안]',game:{kind:'chess-draw-offer',id:gameId,by:me,offeredAt:Date.now()}});playGameSfx('vote')}
  async function rejectChessDraw(roomId,gameId,offer){if(!offer)return;await sendGame(roomId,{text:'[체스 무승부 거절]',game:{kind:'chess-draw-reject',id:gameId,by:String(currentUser().user_id||''),offerId:offer.id,rejectedAt:Date.now()}})}
  function chessEndText(end,start){if(!end)return'';const g=end.game;if(g.reason==='stalemate'||g.reason==='fifty-move'||g.reason==='draw-agreement')return'무승부로 게임이 끝났어요.';const winner=start.players?.find(p=>p.color===g.winner);return g.reason==='resign'?`${winner?.nickname||chessColorLabel(g.winner)} 승리 · 상대가 기권했어요.`:g.reason==='leave'?`${winner?.nickname||chessColorLabel(g.winner)} 승리 · 상대가 게임에서 나갔어요.`:`체크메이트 · ${winner?.nickname||chessColorLabel(g.winner)} 승리!`}
  function chessCard(roomId,message){
    const gameId=message.game.id,snap=chessState(gameId),U=D();if(!snap)return null;const {start,state:pos,moves,status}=snap,me=String(currentUser().user_id||''),mine=chessPlayer(start,me),end=chessTerminal(gameId),view=mine?.color==='b'?'b':'w',lastMoveMsg=latest(gameId,'chess-move'),lastFx=lastMoveMsg?.game?.fx||{},card=U.el('section',{class:`room-game-card chess-game-card ${status.check&&!end?'is-check':''} ${end?'is-ended':''} ${end?.game?.reason==='checkmate'?'is-checkmate':''}`}),white=start.players.find(p=>p.color==='w'),black=start.players.find(p=>p.color==='b');
    card.append(U.el('div',{class:'room-game-head'},[U.el('div',{class:'room-game-head-copy'},[U.el('strong',{text:'♟️ 체스'}),U.el('small',{text:`${white?.nickname||'백'} vs ${black?.nickname||'흑'} · 정식 이동 규칙`})]),U.el('span',{class:'room-game-badge chess',text:end?'END':pos.turn==='w'?'WHITE':'BLACK'})]));
    card.append(U.el('div',{class:'chess-player-strip'},[U.el('span',{class:`chess-player ${pos.turn==='w'&&!end?'active':''}`},[U.el('b',{text:'♔'}),U.el('strong',{text:white?.nickname||'백'}),U.el('small',{text:'백'})]),U.el('span',{class:'chess-vs',text:'VS'}),U.el('span',{class:`chess-player ${pos.turn==='b'&&!end?'active':''}`},[U.el('b',{text:'♚'}),U.el('strong',{text:black?.nickname||'흑'}),U.el('small',{text:'흑'})])]));
    const notice=U.el('p',{class:`chess-status ${status.check&&!end?'check':''} ${end?'ended':''}`,text:end?chessEndText(end,start):status.check?`${chessColorLabel(pos.turn)} 체크!`:(mine?mine.color===pos.turn?'내 차례예요.':`${chessColorLabel(pos.turn)} 차례를 기다리는 중…`:`${chessColorLabel(pos.turn)} 차례`)});card.append(notice);
    const board=U.el('div',{class:`chess-board view-${view} ${status.check&&!end?'board-check':''} ${end?.game?.reason==='checkmate'?'board-mate':''}`,'aria-label':'체스판'}),selected={sq:null};
    const order=view==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
    const refreshSelection=()=>{board.querySelectorAll('.chess-square').forEach(n=>{n.classList.toggle('selected',n.dataset.square===selected.sq);n.classList.remove('legal')});if(!selected.sq)return;for(const mv of chessLegalMoves(pos,pos.turn).filter(m=>m.from===selected.sq)){board.querySelector(`[data-square="${mv.to}"]`)?.classList.add('legal')}};
    for(const r of order)for(const c of order){const sq=chessSquare(r,c),piece=pos.board[r][c],btn=U.el('button',{class:`chess-square ${(r+c)%2?'dark':'light'} ${pos.last?.from===sq?'last last-from':''} ${pos.last?.to===sq?'last last-to moved':''} ${pos.last?.to===sq&&lastFx.capture?'capture-hit':''} ${pos.last?.to===sq&&lastFx.promotion?'promoted':''}`,type:'button','data-square':sq,'aria-label':sq});if(piece){const art=chessPieceSvg(piece);if(art)btn.append(art)};btn.onclick=async()=>{if(end||!mine||mine.color!==pos.turn)return;const here=pos.board[r][c];if(!selected.sq){if(here?.c===mine.color){selected.sq=sq;refreshSelection()}return}if(here?.c===mine.color){selected.sq=sq;refreshSelection();return}const from=selected.sq;selected.sq=null;refreshSelection();let promotion='q';const mv=chessLegalMove(pos,from,sq,'q');if(mv?.piece.t==='p'&&mv.promotion){const raw=gamePrompt('프로모션: 퀸(q), 룩(r), 비숍(b), 나이트(n)','q');promotion=['q','r','b','n'].includes(String(raw||'q').toLowerCase())?String(raw).toLowerCase():'q'}try{await submitChessMove(roomId,gameId,from,sq,promotion)}catch(e){MiniTalk.UI.Shell.toast(e.message||'수를 둘 수 없어요.')}};board.append(btn)}if(status.check&&!end)board.append(U.el('div',{class:'chess-board-fx check-flash','aria-hidden':'true',text:'CHECK'}));if(end?.game?.reason==='checkmate')board.append(U.el('div',{class:'chess-board-fx mate-burst','aria-hidden':'true'},[U.el('strong',{text:'CHECKMATE'}),U.el('span',{text:'♛'})]));card.append(board);
    if(!end&&mine){const actions=U.el('div',{class:'chess-actions'}),draw=U.el('button',{class:'button secondary compact-button',type:'button',text:'무승부 제안'}),resign=U.el('button',{class:'button danger compact-button',type:'button',text:'기권'}),leave=U.el('button',{class:'button secondary compact-button',type:'button',text:'나가기'});const offer=latest(gameId,'chess-draw-offer',m=>String(m.game.by)!==me&&!latest(gameId,'chess-draw-reject',r=>String(r.game.offerId)===String(m.id)));if(offer){draw.textContent='무승부 수락';const reject=U.el('button',{class:'button secondary compact-button',type:'button',text:'거절'});reject.onclick=()=>rejectChessDraw(roomId,gameId,offer);actions.append(draw,reject,resign,leave)}else actions.append(draw,resign,leave);draw.onclick=()=>offerChessDraw(roomId,gameId);resign.onclick=()=>resignChess(roomId,gameId);leave.onclick=()=>leaveChess(roomId,gameId);card.append(actions)}
    if(moves.length){const history=U.el('div',{class:'chess-history'});moves.slice(-10).forEach(m=>history.append(U.el('span',{text:`${m.moveNo}. ${m.from}→${m.to}${m.promotion?`=${m.promotion.toUpperCase()}`:''}`})));card.append(history)}return card
  }

  function inviteHostPerson(){const me=currentUser();return{user_id:String(me.user_id||""),nickname:String(me.nickname||me.user_id||"방장")}}
  function inviteMessage(gameId,kind){return latest(gameId,kind)}
  function inviteFinalMessage(gameId){return latest(gameId,"ladder")||latest(gameId,"mafia-lobby")||latest(gameId,"chess-start")||latest(gameId,"game-invite-cancelled")}
  function inviteMemberStates(gameId){
    const states=new Map();
    for(const m of gameMessages(gameId)){
      const g=m.game||{},id=String(g.userId||"");if(!id)continue;
      if(g.kind==="game-invite-slot")states.set(id,{state:g.status||"",message:m});
      else if(g.kind==="game-invite-leave")states.set(id,{state:"left",message:m});
      else if(g.kind==="game-invite-decline")states.set(id,{state:"declined",message:m});
    }
    return states
  }
  function inviteAcceptedSlots(gameId){return [...inviteMemberStates(gameId).values()].filter(v=>v.state==="accepted").map(v=>v.message)}
  function inviteDeclinedIds(gameId){return new Set([...inviteMemberStates(gameId)].filter(([,v])=>v.state==="declined").map(([id])=>id))}
  function inviteLeftIds(gameId){return new Set([...inviteMemberStates(gameId)].filter(([,v])=>v.state==="left").map(([id])=>id))}
  function inviteSlotFor(gameId,userId){const v=inviteMemberStates(gameId).get(String(userId));return v&&(v.state==="accepted"||v.state==="full")?v.message:null}
  function inviteParticipants(invite){
    const host=invite.host||{user_id:invite.hostId,nickname:invite.hostNickname||invite.hostId},byId=new Map((invite.invited||[]).map(p=>[String(p.user_id),p])),left=inviteLeftIds(invite.id),people=[{user_id:String(host.user_id),nickname:String(host.nickname||host.user_id)}];
    inviteAcceptedSlots(invite.id).forEach(m=>{const id=String(m.game.userId);if(left.has(id))return;const p=byId.get(id)||{user_id:id,nickname:m.game.nickname||id};if(p&&!people.some(x=>x.user_id===id))people.push({user_id:id,nickname:String(p.nickname||id)})});return people.slice(0,Number(invite.maxPlayers)||12)
  }
  function inviteEverAccepted(gameId){return allOf(gameId,"game-invite-slot").some(m=>m.game?.status==="accepted")}
  function clearInviteExpiry(gameId){const timer=state.inviteExpiryTimers.get(String(gameId||""));if(timer!=null)clearTimeout(timer);state.inviteExpiryTimers.delete(String(gameId||""))}
  function inviteCreatedAt(inviteMsg){return Number(inviteMsg?.game?.createdAt||inviteMsg?.clientTs||inviteMsg?.ts||0)}
  async function expireHostAloneInviteAsHost(roomId,gameId,{now=Date.now()}={}){
    const inviteMsg=latest(gameId,"game-invite"),invite=inviteMsg?.game;if(!invite||String(invite.hostId)!==String(currentUser().user_id||"")||inviteFinalMessage(gameId)){clearInviteExpiry(gameId);return false}
    const createdAt=inviteCreatedAt(inviteMsg),deadline=createdAt+INVITE_HOST_ALONE_TIMEOUT;if(!createdAt||Number(now)<deadline)return false;
    if(inviteEverAccepted(gameId)){clearInviteExpiry(gameId);return false}
    const people=inviteParticipants(invite);if(people.length!==1){clearInviteExpiry(gameId);return false}
    if(state.inviteStarting.has(gameId))return false;state.inviteStarting.add(gameId);
    try{
      if(inviteFinalMessage(gameId)||inviteEverAccepted(gameId)||inviteParticipants(invite).length!==1)return false;
      await sendGame(roomId,{text:"[게임 초대 종료]",game:{kind:"game-invite-cancelled",id:gameId,reason:"host-alone-timeout",participants:people,expiredAt:Number(now)}});scheduleGameCleanup(roomId,gameId);clearInviteExpiry(gameId);return true
    }finally{state.inviteStarting.delete(gameId)}
  }
  function scheduleHostAloneInviteExpiry(message){
    const invite=message?.game,gameId=String(invite?.id||""),roomId=message?.roomId;if(invite?.kind!=="game-invite"||!gameId||!roomId||String(invite.hostId)!==String(currentUser().user_id||""))return false;
    if(inviteFinalMessage(gameId)||inviteEverAccepted(gameId)){clearInviteExpiry(gameId);return false}
    const createdAt=inviteCreatedAt(message);if(!createdAt)return false;clearInviteExpiry(gameId);
    const delay=Math.max(0,createdAt+INVITE_HOST_ALONE_TIMEOUT-Date.now()+120),timer=setTimeout(()=>{state.inviteExpiryTimers.delete(gameId);expireHostAloneInviteAsHost(roomId,gameId).catch(()=>{})},delay);state.inviteExpiryTimers.set(gameId,timer);return true
  }
  function normalizedLadderResults(labels,count){const out=(labels||[]).map(v=>String(v||"").trim()).filter(Boolean).slice(0,count);while(out.length<count)out.push(`${out.length+1}번`);return out}
  async function sendInvite(roomId,{gameType,invited,minPlayers,maxPlayers,resultLabels=[]}){
    const host=inviteHostPerson(),id=nowId(`invite-${gameType}`),game={kind:"game-invite",id,gameType,hostId:host.user_id,host,invited,maxPlayers,minPlayers,resultLabels,openJoin:true,createdAt:Date.now()};
    const message={roomId,user_id:host.user_id,nickname:host.nickname,type:"game",text:gameType==="ladder"?"[사다리타기 초대]":gameType==="chess"?"[체스 초대]":"[마피아 게임 초대]",game};
    const saved=await sendGame(roomId,{text:message.text,game});return saved||message
  }
  async function createLadder(roomId,room,mount=null){
    const members=membersFor(room),me=String(currentUser().user_id||""),invitees=members.filter(m=>String(m.user_id)!==me);if(invitees.length<1)throw new Error("사다리타기는 함께할 멤버가 1명 이상 필요해요.");
    memberPicker("사다리타기 초대",invitees,{min:1,max:999,mount,extraBuilder:(body)=>{const U=D(),field=U.el("label",{class:"field room-game-results-field"},[U.el("span",{text:"결과 항목 (선택)"}),U.el("input",{placeholder:"예: 청소, 발표, 간식, 면제","aria-label":"사다리 결과 항목"}),U.el("small",{class:"muted",text:"수락 인원에 맞춰 앞에서부터 사용하고, 부족하면 번호 결과를 자동으로 채워요."})]);body.append(U.el("p",{class:"muted modal-note",text:"방장은 자동 참가합니다. 최대 12명이며, 더 많이 초대하면 수락 순서대로 정원이 찹니다."}),field);return{field}},onSubmit:async(ids,extra)=>{
      const invited=invitees.filter(m=>ids.includes(String(m.user_id))).map(m=>({user_id:String(m.user_id),nickname:String(m.nickname||m.user_id)})),raw=extra.field.querySelector("input").value.trim(),labels=raw?raw.split(",").map(v=>v.trim()).filter(Boolean):[];
      const message=await sendInvite(roomId,{gameType:"ladder",invited,minPlayers:2,maxPlayers:12,resultLabels:labels});if(mount)showDesktopMessage(message);else MiniTalk.UI.Shell.closeModal()
    }})
  }

  async function createMafia(roomId,room,mount=null){
    const members=membersFor(room),me=String(currentUser().user_id||""),invitees=members.filter(m=>String(m.user_id)!==me);if(invitees.length<3)throw new Error("마피아는 방장을 포함해 최소 4명이 필요해요.");
    memberPicker("마피아 게임 초대",invitees,{min:3,max:999,mount,onSubmit:async ids=>{
      const invited=invitees.filter(m=>ids.includes(String(m.user_id))).map(m=>({user_id:String(m.user_id),nickname:String(m.nickname||m.user_id)}));
      const message=await sendInvite(roomId,{gameType:"mafia",invited,minPlayers:4,maxPlayers:12});if(mount)showDesktopMessage(message);else MiniTalk.UI.Shell.closeModal()
    }})
  }

  async function createChess(roomId,room,mount=null){
    const members=membersFor(room),me=String(currentUser().user_id||''),invitees=members.filter(m=>String(m.user_id)!==me);if(invitees.length<1)throw new Error('체스는 함께할 상대가 1명 필요해요.');
    memberPicker('체스 초대',invitees,{min:1,max:1,mount,onSubmit:async ids=>{const invited=invitees.filter(m=>ids.includes(String(m.user_id))).slice(0,1).map(m=>({user_id:String(m.user_id),nickname:String(m.nickname||m.user_id)}));const message=await sendInvite(roomId,{gameType:'chess',invited,minPlayers:2,maxPlayers:2});if(mount)showDesktopMessage(message);else MiniTalk.UI.Shell.closeModal()}})
  }

  async function handleInviteAcceptAsHost(message){
    const g=message?.game,gameId=g?.id,userId=String(g?.userId||""),roomId=message?.roomId;if(!gameId||!userId||!roomId)return;
    const inviteMsg=latest(gameId,"game-invite"),invite=inviteMsg?.game;if(!invite||invite.hostId!==String(currentUser().user_id||""))return;
    const previous=state.inviteQueues.get(gameId)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const marker=`${gameId}:user:${userId}`;if(state.inviteHandled.has(marker)||inviteSlotFor(gameId,userId)||inviteDeclinedIds(gameId).has(userId)||inviteFinalMessage(gameId))return;
      const invitedPerson=(invite.invited||[]).find(p=>String(p.user_id)===userId);if(!invitedPerson&&!invite.openJoin)return;state.inviteHandled.add(marker);
      try{
        if(inviteFinalMessage(gameId))return;
        const participants=inviteParticipants(invite),max=Number(invite.maxPlayers)||12,status=participants.length>=max?"full":"accepted",nickname=String(g.nickname||invitedPerson?.nickname||userId);
        const saved=await sendGame(roomId,{text:status==="accepted"?"[게임 참가 확정]":"[게임 정원 마감]",game:{kind:"game-invite-slot",id:gameId,userId,nickname,status,acceptedAt:Date.now()}});
        if(status==="accepted")await maybeFinalizeInviteAsHost(roomId,gameId)
      }catch(error){state.inviteHandled.delete(marker);throw error}
    });
    state.inviteQueues.set(gameId,task);try{return await task}finally{if(state.inviteQueues.get(gameId)===task)state.inviteQueues.delete(gameId)}
  }
  async function maybeFinalizeInviteAsHost(roomId,gameId,{force=false}={}){
    const inviteMsg=latest(gameId,"game-invite"),invite=inviteMsg?.game;if(!invite||invite.hostId!==String(currentUser().user_id||"")||inviteFinalMessage(gameId)||state.inviteStarting.has(gameId))return false;
    const people=inviteParticipants(invite),max=Number(invite.maxPlayers)||12,min=Number(invite.minPlayers)||2,accepted=new Set(inviteAcceptedSlots(gameId).map(m=>String(m.game.userId))),declined=inviteDeclinedIds(gameId),invitedIds=(invite.invited||[]).map(p=>String(p.user_id)),allResponded=invitedIds.every(id=>accepted.has(id)||declined.has(id)||inviteSlotFor(gameId,id)?.game?.status==="full"),capacityReached=people.length>=max;
    if(force&&people.length<min)throw new Error(`최소 ${min}명이 참가해야 시작할 수 있어요.`);
    if(!force&&!capacityReached&&!allResponded)return false;
    state.inviteStarting.add(gameId);
    try{
      if(people.length<min){await sendGame(roomId,{text:"[게임 초대 종료]",game:{kind:"game-invite-cancelled",id:gameId,reason:"not-enough",participants:people}});scheduleGameCleanup(roomId,gameId);return false}
      if(invite.gameType==="ladder"){const results=normalizedLadderResults(invite.resultLabels,people.length),game={kind:"ladder",id:gameId,seed:crypto.getRandomValues(new Uint32Array(1))[0],participants:people,results};await sendGame(roomId,{text:"[사다리타기]",game});playGameSfx("start");scheduleGameCleanup(roomId,gameId);return true}
      if(invite.gameType==="chess"){const flip=crypto.getRandomValues(new Uint32Array(1))[0]&1,players=people.map((p,i)=>({...p,color:(i^flip)?'b':'w'})),game={kind:'chess-start',id:gameId,hostId:invite.hostId,participants:people,players,startedAt:Date.now()};await sendGame(roomId,{text:'[체스 게임 시작]',game});playGameSfx('start');return true}
      const kp=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]),hostPublic=await crypto.subtle.exportKey("jwk",kp.publicKey),hostPrivate=await crypto.subtle.exportKey("jwk",kp.privateKey),game={kind:"mafia-lobby",id:gameId,hostId:invite.hostId,hostPublic,participants:people};
      localStorage.setItem(mafiaHostKey(gameId),JSON.stringify({privateKey:hostPrivate,roles:null,living:people.map(p=>p.user_id),round:1}));const saved=await sendGame(roomId,{text:"[마피아 참가 확정]",game});playGameSfx("start");return true
    }finally{state.inviteStarting.delete(gameId)}
  }
  async function requestInviteAccept(roomId,message){
    const invite=message.game,me=String(currentUser().user_id||""),final=inviteFinalMessage(invite.id),slot=inviteSlotFor(invite.id,me);
    if(slot?.game?.status==="accepted")return;
    if(final){MiniTalk.UI.Shell.toast(final.game?.participants?.some?.(p=>String(p.user_id)===me)?"이미 참가가 확정됐어요.":"인원 초과로 참가할 수 없어요.");return}
    if(desktopGameMode()){const room=MiniTalk.Store.get("rooms")?.[roomId]||{id:roomId,title:"대화방",members:{}};if(ensureDesktopPopup(roomId,room))showDesktopMessage(message)}
    const saved=await sendGame(roomId,{text:"[게임 참가 요청]",game:{kind:"game-invite-accept",id:invite.id,userId:me,nickname:String(currentUser().nickname||me),requestedAt:Date.now()}});playGameSfx("action")
  }
  async function requestInviteDecline(roomId,message){const invite=message.game,me=String(currentUser().user_id||"");if(inviteFinalMessage(invite.id))return;const saved=await sendGame(roomId,{text:"[게임 초대 거절]",game:{kind:"game-invite-decline",id:invite.id,userId:me,declinedAt:Date.now()}});playGameSfx("vote")}
  function inviteCard(roomId,message){
    const U=D(),g=message.game,me=String(currentUser().user_id||""),isHost=me===String(g.hostId),isInvited=(g.invited||[]).some(p=>String(p.user_id)===me),canOpenJoin=!isHost&&g.openJoin!==false,declined=inviteDeclinedIds(g.id),slot=inviteSlotFor(g.id,me),people=inviteParticipants(g),final=inviteFinalMessage(g.id),gameLabel=g.gameType==="ladder"?"사다리타기":g.gameType==="chess"?"체스":"마피아 게임",icon=g.gameType==="ladder"?"🪜":g.gameType==="chess"?"♟️":"🕵️",card=U.el("section",{class:`room-game-card room-game-invite-card room-game-invite-compact ${g.gameType}`});
    const main=U.el("div",{class:"room-game-invite-compact-main"},[
      U.el("span",{class:"room-game-invite-compact-icon","aria-hidden":"true",text:icon}),
      U.el("div",{class:"room-game-invite-compact-copy"},[
        U.el("strong",{text:gameLabel}),
        U.el("small",{text:`${people.length}/${Number(g.maxPlayers)||12}명`})
      ])
    ]);
    card.append(main);
    if(final)return card;
    const pendingAccept=(isInvited||canOpenJoin)&&!slot&&!declined.has(me)&&Boolean(latest(g.id,"game-invite-accept",m=>String(m.game.userId)===me));
    if((isInvited||canOpenJoin)&&!slot&&!declined.has(me)&&!pendingAccept){
      const accept=U.el("button",{class:"button primary compact-button room-game-invite-compact-action",type:"button",text:"참가"});
      accept.onclick=async()=>{accept.disabled=true;try{await requestInviteAccept(roomId,message)}catch(e){MiniTalk.UI.Shell.toast(e.message||"참가 요청에 실패했어요.");accept.disabled=false}};
      card.append(accept)
    }else if(pendingAccept){
      card.append(U.el("button",{class:"button secondary compact-button room-game-invite-compact-action",type:"button",text:"확인 중",disabled:true}))
    }else if(slot?.game?.status==="accepted"){
      const leave=U.el("button",{class:"button secondary compact-button room-game-invite-compact-action",type:"button",text:"참가 취소"});
      leave.onclick=async()=>{leave.disabled=true;try{await sendGame(roomId,{text:"[게임 참가 취소]",game:{kind:"game-invite-leave",id:g.id,userId:me,leftAt:Date.now()}});playGameSfx("vote")}catch(e){MiniTalk.UI.Shell.toast(e.message||"참가 취소에 실패했어요.");leave.disabled=false}};
      card.append(leave)
    }else if(slot?.game?.status==="full"){
      card.append(U.el("button",{class:"button secondary compact-button room-game-invite-compact-action",type:"button",text:"마감",disabled:true}))
    }else if(declined.has(me)){
      card.append(U.el("button",{class:"button secondary compact-button room-game-invite-compact-action",type:"button",text:"거절됨",disabled:true}))
    }else if(isHost){
      const min=Number(g.minPlayers)||2,start=U.el("button",{class:"button primary compact-button room-game-invite-compact-action",type:"button",text:"시작"});
      start.disabled=people.length<min;start.title=people.length<min?`최소 ${min}명 필요`:"현재 인원으로 시작";
      start.onclick=async()=>{start.disabled=true;try{await maybeFinalizeInviteAsHost(roomId,g.id,{force:true})}catch(e){MiniTalk.UI.Shell.toast(e.message||"게임을 시작하지 못했어요.");start.disabled=people.length<min}};
      card.append(start)
    }
    return card
  }


  const keyName=userId=>`chat.roomGames.rsa.${userId}`;
  async function ensureRsa(){
    const id=currentUser().user_id;if(!id)throw new Error("로그인이 필요합니다.");
    let saved=null;try{saved=JSON.parse(localStorage.getItem(keyName(id))||"null")}catch{}
    if(saved?.publicKey&&saved?.privateKey)return saved;
    const kp=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]),publicKey=await crypto.subtle.exportKey("jwk",kp.publicKey),privateKey=await crypto.subtle.exportKey("jwk",kp.privateKey),out={publicKey,privateKey};
    localStorage.setItem(keyName(id),JSON.stringify(out));return out
  }
  async function importPublic(jwk){return crypto.subtle.importKey("jwk",jwk,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"])}
  async function importPrivate(jwk){return crypto.subtle.importKey("jwk",jwk,{name:"RSA-OAEP",hash:"SHA-256"},false,["decrypt"])}
  async function encryptFor(jwk,value){const key=await importPublic(jwk),data=enc.encode(safeJson(value)),buf=await crypto.subtle.encrypt({name:"RSA-OAEP"},key,data);return b64(buf)}
  async function decryptOwn(cipher){const saved=await ensureRsa(),key=await importPrivate(saved.privateKey),buf=await crypto.subtle.decrypt({name:"RSA-OAEP"},key,unb64(cipher));return JSON.parse(dec.decode(buf))}
  async function primeOwnBox(boxKey,message,loader){
    if(state.privateBoxes.has(boxKey)||state.decrypting.has(boxKey))return;
    state.decrypting.add(boxKey);
    try{
      const loaded=await loader();state.privateBoxes.set(boxKey,loaded);refreshPrivateBindings(boxKey,loaded)
    }catch{}
    finally{state.decrypting.delete(boxKey)}
  }
  function gameDocuments(){const docs=[document];try{if(state.desktop.win&&!state.desktop.win.closed&&state.desktop.win.document)docs.push(state.desktop.win.document)}catch{}return docs}
  function refreshPrivateBindings(boxKey,loaded){
    gameDocuments().forEach(doc=>{
      doc.querySelectorAll(`[data-mafia-role-panel="${CSS.escape(boxKey)}"]`).forEach(panel=>mountRolePanel(panel,loaded?.value?.role||loaded?.value||null));
      doc.querySelectorAll(`[data-police-result-box="${CSS.escape(boxKey)}"]`).forEach(node=>mountPoliceResult(node,loaded?.value||null))
    })
  }
  function latest(gameId,kind,filter=()=>true){return [...gameMessages(gameId)].reverse().find(m=>m.game?.kind===kind&&filter(m))||null}
  function allOf(gameId,kind){return gameMessages(gameId).filter(m=>m.game?.kind===kind)}
  async function sendGame(roomId,payload){
    const saved=await MiniTalk.Realtime.sendMessage(roomId,{...payload,type:"game"});if(saved)ingest(saved);return saved
  }
  function gameHostId(gameId){return String(latest(gameId,"game-invite")?.game?.hostId||latest(gameId,"mafia-lobby")?.game?.hostId||latest(gameId,"chess-start")?.game?.hostId||"")}
  function gameIsTerminal(gameId){const ladder=latest(gameId,"ladder"),cancelled=latest(gameId,"game-invite-cancelled"),phase=latestPhase(gameId),chessEnd=latest(gameId,"chess-end");return Boolean(ladder||cancelled||chessEnd||(phase?.game?.phase==="ended"))}
  function clearGameVolatileState(gameId){clearInviteExpiry(gameId);const prefix=`${gameId}:`;for(const [key,timer] of [...state.phaseTimers])if(String(key).startsWith(prefix)){clearTimeout(timer);state.phaseTimers.delete(key)}for(const key of [...state.privateBoxes.keys()])if(String(key).includes(`:${gameId}:`)||String(key).startsWith(`role:${gameId}:`)||String(key).startsWith(`police:${gameId}:`))state.privateBoxes.delete(key);for(const set of [state.keyAnnouncements,state.revealedRoles,state.autoResolved,state.phaseResolving,state.leaveHandled,state.inviteHandled,state.chessSending])for(const key of [...set])if(String(key).includes(gameId))set.delete(key);for(const key of [...state.chessFxSeen]){const messages=gameMessages(gameId);if(messages.some(m=>String(m.id||"")===String(key)))state.chessFxSeen.delete(key)}state.inviteQueues.delete(gameId);state.inviteStarting.delete(gameId);state.inviteStarting.delete(`mafia:${gameId}`)}
  function rememberRetiredGame(gameId,roomId,hostId){
    const id=String(gameId||"");if(!id)return;const record={roomId:String(roomId||""),hostId:String(hostId||""),expiresAt:Date.now()+5*60*1000};state.retiredGames.set(id,record);setTimeout(()=>{const current=state.retiredGames.get(id);if(current&&current.expiresAt<=Date.now())state.retiredGames.delete(id)},5*60*1000+1000)
  }
  function clearLocalGameState(gameId){
    clearTimeout(state.localCleanupTimers.get(gameId));state.localCleanupTimers.delete(gameId);clearGameVolatileState(gameId);state.messages.delete(gameId);state.desktop.sessionGames.delete(String(gameId));
  }
  function scheduleLocalGameCleanup(gameId,delay=30000){
    if(!gameId||!gameIsTerminal(gameId))return;clearTimeout(state.localCleanupTimers.get(gameId));const timer=setTimeout(()=>clearLocalGameState(gameId),Math.max(5000,Number(delay)||30000));state.localCleanupTimers.set(gameId,timer)
  }
  function removeIngestedMessage(messageId){
    const id=String(messageId||"");if(!id)return false;for(const [gameId,list] of [...state.messages]){const next=list.filter(m=>String(m.id||"")!==id);if(next.length===list.length)continue;if(next.length)state.messages.set(gameId,next);else clearLocalGameState(gameId);return true}return false
  }
  function scheduleGameCleanup(roomId,gameId,delay=10000){
    if(!roomId||!gameId||gameHostId(gameId)!==String(currentUser().user_id||"")||!gameIsTerminal(gameId))return;
    clearTimeout(state.cleanupTimers.get(gameId));
    const timer=setTimeout(()=>cleanupGameServerRecords(roomId,gameId),Math.max(1500,Number(delay)||10000));state.cleanupTimers.set(gameId,timer)
  }
  async function cleanupGameServerRecords(roomId,gameId){
    if(state.cleanupRunning.has(gameId))return;state.cleanupRunning.add(gameId);clearTimeout(state.cleanupTimers.get(gameId));state.cleanupTimers.delete(gameId);
    try{
      const ids=gameMessages(gameId).filter(m=>m?.id&&m.roomId===roomId).map(m=>m.id);
      if(ids.length&&MiniTalk.Realtime.removeGameMessages)await MiniTalk.Realtime.removeGameMessages(roomId,ids);
      try{localStorage.removeItem(mafiaHostKey(gameId))}catch{}
    }catch(error){console.warn("대화방 게임 기록 정리 실패",error);setTimeout(()=>{state.cleanupRunning.delete(gameId);scheduleGameCleanup(roomId,gameId,15000)},1000);return}
    state.cleanupRunning.delete(gameId);clearLocalGameState(gameId);if(state.desktop.activeGameId===gameId&&state.desktop.win&&!state.desktop.win.closed){state.desktop.activeGameId=null;const U=D(),ended=U.el("section",{class:"room-game-card room-game-ended-card"},[U.el("strong",{text:"게임이 종료됐어요."}),U.el("small",{text:"서버의 임시 게임 기록도 정리했습니다."})]);desktopMount("게임 종료",ended)}
  }
  async function resolveMafiaPhaseOnce(roomId,lobby,phaseMsg,{allowTimeout=false}={}){
    const g=phaseMsg?.game;if(!g?.id||!lobby)return false;const key=`${g.id}:${g.phase}:${g.round||1}:${g.deadline||0}`;if(state.phaseResolving.has(key))return false;
    const newest=latestPhase(g.id);if(!newest||newest.game?.phase!==g.phase||Number(newest.game?.round||1)!==Number(g.round||1)||Number(newest.game?.deadline||0)!==Number(g.deadline||0))return false;
    state.phaseResolving.add(key);try{if(g.phase==="night")await resolveNight(roomId,lobby,phaseMsg,{allowTimeout});else if(g.phase==="day")await resolveVote(roomId,lobby,phaseMsg,{allowTimeout});else return false;return true}finally{state.phaseResolving.delete(key)}
  }
  function scheduleHostPhaseResolution(message){
    const g=message?.game,roomId=message?.roomId;if(!g?.id||!g.deadline||!roomId)return;
    const lobby=latest(g.id,"mafia-lobby");if(!lobby||lobby.game.hostId!==currentUser().user_id)return;
    const key=`${g.id}:${g.phase}:${g.round||1}:${g.deadline}`;if(state.phaseTimers.has(key))return;
    const timer=setTimeout(async()=>{state.phaseTimers.delete(key);if(state.autoResolved.has(key))return;const newest=latestPhase(g.id);if(!newest||newest.id!==message.id&&Number(newest.game.deadline||0)!==Number(g.deadline||0))return;state.autoResolved.add(key);try{const resolved=await resolveMafiaPhaseOnce(roomId,lobby.game,message,{allowTimeout:true});if(resolved)playGameSfx("result");else state.autoResolved.delete(key)}catch{state.autoResolved.delete(key)}},Math.max(0,Number(g.deadline)-Date.now()+120));
    state.phaseTimers.set(key,timer)
  }
  function leftIds(gameId){return new Set(allOf(gameId,"mafia-player-left").map(m=>m.game.userId).filter(Boolean))}
  function activeParticipants(lobby){const left=leftIds(lobby.id);return (lobby.participants||[]).filter(p=>!left.has(p.user_id))}
  function winnerFor(host){
    if(!host?.roles||!Array.isArray(host.living))return null;
    const mafia=host.living.filter(id=>host.roles[id]==="mafia").length,citizenSide=host.living.length-mafia;
    if(mafia===0)return"citizen";
    if(mafia>=citizenSide)return"mafia";
    return null
  }
  function latestPhase(gameId){return latest(gameId,"mafia-phase")}
  async function sendEnded(roomId,lobby,host,{round=1,reason="rule",leftUserId=null}={}){
    const winner=winnerFor(host);
    if(!winner)return false;
    await sendGame(roomId,{text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:lobby.id,phase:"ended",round,living:[...host.living],winner,reason,leftUserId,startedAt:Date.now(),deadline:Date.now()}});scheduleGameCleanup(roomId,lobby.id);
    return true
  }
  async function maybeHandleLeaveAsHost(message){
    const g=message?.game,gameId=g?.id,userId=g?.userId,roomId=message?.roomId;if(!gameId||!userId||!roomId)return;
    const lobby=latest(gameId,"mafia-lobby");if(!lobby||lobby.game.hostId!==currentUser().user_id)return;
    const marker=`${gameId}:${userId}`;if(state.leaveHandled.has(marker))return;state.leaveHandled.add(marker);
    const host=await hostPrivate(gameId),person=lobby.game.participants.find(p=>p.user_id===userId);
    const startedPhase=latestPhase(gameId);
    if(!host?.roles||!startedPhase){
      await sendGame(roomId,{text:"[게임 나가기]",game:{kind:"mafia-player-left",id:gameId,userId,nickname:person?.nickname||userId,round:0}});
      const remaining=activeParticipants(lobby.game).map(p=>String(p.user_id)),roleSetupInterrupted=Boolean(host?.roles&&!startedPhase);
      if(userId===lobby.game.hostId||remaining.length<4||roleSetupInterrupted){
        const reason=userId===lobby.game.hostId?"host-left-before-start":roleSetupInterrupted?"left-during-role-setup":"not-enough-before-start";
        await sendGame(roomId,{text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:gameId,phase:"ended",round:0,living:remaining,winner:"none",reason,leftUserId:userId,startedAt:Date.now(),deadline:Date.now()}});
        scheduleGameCleanup(roomId,gameId)
      }
      return
    }
    if(!host.living.includes(userId)){return}
    const role=host.roles[userId]||"citizen";host.living=host.living.filter(id=>id!==userId);localStorage.setItem(mafiaHostKey(gameId),JSON.stringify(host));
    await sendGame(roomId,{text:"[게임 나가기]",game:{kind:"mafia-player-left",id:gameId,userId,nickname:person?.nickname||userId,role,round:latestPhase(gameId)?.game?.round||1}});
    if(await sendEnded(roomId,lobby.game,host,{round:latestPhase(gameId)?.game?.round||1,reason:"leave",leftUserId:userId}))return;
    const phase=latestPhase(gameId);if(!phase||phase.game.phase==="ended")return;
    if(userId===lobby.game.hostId){
      await sendGame(roomId,{text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:gameId,phase:"ended",round:phase.game.round||1,living:[...host.living],winner:"none",reason:"host-left",leftUserId:userId,startedAt:Date.now(),deadline:Date.now()}});scheduleGameCleanup(roomId,gameId);return
    }
    const carry={startedAt:phase.game.startedAt,deadline:phase.game.deadline,actionStartsAt:phase.game.actionStartsAt,discussionEndsAt:phase.game.discussionEndsAt};
    await sendGame(roomId,{text:"[마피아 인원 변경]",game:{kind:"mafia-phase",id:gameId,phase:phase.game.phase,round:phase.game.round||1,living:[...host.living],...carry}})
  }
  async function leaveMafia(roomId,lobby){
    const me=currentUser().user_id;if(!me||!lobby?.participants?.some(p=>p.user_id===me))return;
    if(leftIds(lobby.id).has(me))return;
    if(!gameConfirm("이 마피아 게임에서 나갈까요? 채팅방에는 그대로 남습니다."))return;
    await sendGame(roomId,{text:"[게임 나가기 요청]",game:{kind:"mafia-leave",id:lobby.id,userId:me}});
    if(lobby.hostId===me){const msg={roomId,user_id:me,game:{kind:"mafia-leave",id:lobby.id,userId:me}};await maybeHandleLeaveAsHost(msg)}
  }
  async function leaveMafiaWithoutPrompt(roomId,lobby){
    const me=String(currentUser().user_id||"");if(!me||!lobby?.participants?.some(p=>String(p.user_id)===me)||leftIds(lobby.id).has(me)||gameIsTerminal(lobby.id))return false;
    await sendGame(roomId,{text:"[게임 나가기 요청]",game:{kind:"mafia-leave",id:lobby.id,userId:me,reason:"popup-closed"}});
    if(String(lobby.hostId)===me){const msg={roomId,user_id:me,game:{kind:"mafia-leave",id:lobby.id,userId:me,reason:"popup-closed"}};await maybeHandleLeaveAsHost(msg)}
    return true
  }
  async function leaveActiveDesktopGame(roomId,gameId){
    const id=String(gameId||""),rid=String(roomId||"");if(!id||!rid||gameIsTerminal(id))return false;
    const me=String(currentUser().user_id||"");if(!me)return false;
    const start=latest(id,"chess-start")?.game;if(start&&!latest(id,"chess-end")){const mine=chessPlayer(start,me);if(mine){await sendChessEnd(rid,id,{reason:"leave",winner:chessOther(mine.color),by:me,popupClosed:true});return true}}
    const lobby=latest(id,"mafia-lobby")?.game;if(lobby&&latestPhase(id)?.game?.phase!=="ended"){if(await leaveMafiaWithoutPrompt(rid,lobby))return true}
    const invite=latest(id,"game-invite")?.game;if(invite&&!inviteFinalMessage(id)){
      if(String(invite.hostId)===me){const people=inviteParticipants(invite);await sendGame(rid,{text:"[게임 초대 종료]",game:{kind:"game-invite-cancelled",id,reason:"host-popup-closed",participants:people}});scheduleGameCleanup(rid,id);return true}
      const slot=inviteSlotFor(id,me);if(slot?.game?.status==="accepted"){await sendGame(rid,{text:"[게임 참가 취소]",game:{kind:"game-invite-leave",id,userId:me,leftAt:Date.now(),reason:"popup-closed"}});return true}
    }
    return false
  }
  function finishDesktopPopupClose(win,token){
    const d=state.desktop;if(token!==d.closeToken||d.win!==win)return;const sessions=[...d.sessionGames.entries()];if(d.activeGameId&&!d.sessionGames.has(String(d.activeGameId)))sessions.push([String(d.activeGameId),String(d.roomId||"")]);clearInterval(d.closeWatchTimer);d.closeWatchTimer=0;clearTimeout(d.refreshTimer);d.win=null;d.root=null;d.title=null;d.back=null;d.activeGameId=null;d.sessionGames.clear();d.closeToken++;sessions.forEach(([gameId,roomId])=>{if(roomId)leaveActiveDesktopGame(roomId,gameId).catch(e=>console.warn("게임 팝업 종료 나가기 처리 실패",e))})
  }
  function watchDesktopPopupClose(win){
    const d=state.desktop;clearInterval(d.closeWatchTimer);const token=++d.closeToken;d.closeWatchTimer=setInterval(()=>{let closed=false;try{closed=!win||win.closed}catch{closed=true}if(closed)finishDesktopPopupClose(win,token)},400);return token
  }
  function mafiaHostKey(gameId){return`chat.roomGames.mafiaHost.${gameId}`}
  function roleCounts(count){
    const n=Math.max(4,Math.min(12,Number(count)||4));
    if(n<8)return{mafia:1,police:0,doctor:0,citizen:n-1};
    if(n<12)return{mafia:2,police:1,doctor:0,citizen:n-3};
    return{mafia:2,police:1,doctor:1,citizen:n-4}
  }
  function roleSummary(counts){return ROLE_ORDER.filter(role=>counts[role]>0).map(role=>`${roleLabel(role)} ${counts[role]}`).join(" · ")}

  async function announceMafiaKey(roomId,game){
    if(!game.participants?.some(p=>p.user_id===currentUser().user_id))return;
    const marker=`${game.id}:${currentUser().user_id}`;
    if(state.keyAnnouncements.has(marker))return;
    const already=latest(game.id,"mafia-key",m=>m.game.userId===currentUser().user_id);
    if(already){state.keyAnnouncements.add(marker);return}
    state.keyAnnouncements.add(marker);
    try{const keys=await ensureRsa();await sendGame(roomId,{text:"[마피아 준비]",game:{kind:"mafia-key",id:game.id,userId:currentUser().user_id,publicKey:keys.publicKey}})}catch(error){state.keyAnnouncements.delete(marker);throw error}
  }
  async function maybeAutoStartMafia(roomId,gameId){
    const startKey=`mafia:${gameId}`,lobby=latest(gameId,"mafia-lobby")?.game;if(!lobby||lobby.hostId!==String(currentUser().user_id||"")||latestPhase(gameId)||state.inviteStarting.has(startKey))return false;
    const people=activeParticipants(lobby),keys=new Set(allOf(gameId,"mafia-key").map(m=>String(m.game.userId)));if(people.length<4||people.some(p=>!keys.has(String(p.user_id))))return false;
    state.inviteStarting.add(startKey);try{return await assignRoles(roomId,lobby)!==false}catch(error){state.inviteStarting.delete(startKey);MiniTalk.UI.Shell.toast(error.message||"마피아 게임을 시작하지 못했습니다.");return false}
  }
  function buildRolesForParticipants(participants){
    const counts=roleCounts(participants.length),shuffle=[...participants];
    for(let i=shuffle.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[shuffle[i],shuffle[j]]=[shuffle[j],shuffle[i]]}
    const roles={},order=[];Object.entries(counts).forEach(([role,count])=>{for(let i=0;i<count;i++)order.push(role)});shuffle.forEach((p,i)=>roles[p.user_id]=order[i]||"citizen");return roles
  }
  async function assignRoles(roomId,game){
    if(String(currentUser().user_id||"")!==String(game.hostId||""))throw new Error("게임 생성자만 시작할 수 있어요.");
    const people=activeParticipants(game);if(people.length<4)throw new Error("남은 참가자가 4명 미만이라 시작할 수 없어요.");
    const keyMsgs=allOf(game.id,"mafia-key"),keys=new Map(keyMsgs.map(m=>[String(m.game.userId),m.game.publicKey]));
    if(people.some(p=>!keys.has(String(p.user_id))))throw new Error("아직 준비되지 않은 참가자가 있어요.");
    const host=JSON.parse(localStorage.getItem(mafiaHostKey(game.id))||"{}"),sameRoster=host.roles&&people.every(p=>Object.prototype.hasOwnProperty.call(host.roles,String(p.user_id)))&&Object.keys(host.roles).length===people.length,roles=sameRoster?host.roles:buildRolesForParticipants(people);
    host.roles=roles;host.living=people.map(p=>String(p.user_id));localStorage.setItem(mafiaHostKey(game.id),JSON.stringify(host));
    const sentTargets=new Set(allOf(game.id,"mafia-role").map(m=>String(m.game.target||"")));
    for(const person of people){
      if(gameIsTerminal(game.id))return false;const target=String(person.user_id);if(sentTargets.has(target))continue;
      const cipher=await encryptFor(keys.get(target),{role:roles[target],counts:roleCounts(people.length)});if(gameIsTerminal(game.id))return false;
      await sendGame(roomId,{text:"[역할 배정]",game:{kind:"mafia-role",id:game.id,target,cipher}});sentTargets.add(target)
    }
    if(gameIsTerminal(game.id))return false;if(!latestPhase(game.id))await sendGame(roomId,{text:"[마피아 게임 시작]",game:phasePayload(game.id,"night",1,host.living,{initial:true})});return true
  }
  function participantBadge(U,person,{alive=true,ready=false}={}){return U.el("span",{class:`mafia-participant-chip ${alive?"alive":"dead"} ${ready?"ready":""}`.trim()},[U.el("span",{class:"mafia-participant-dot",text:alive?"●":"×"}),U.el("span",{text:person.nickname})])}
  function mountRolePanel(panel,role){
    const U=D(),boxKey=panel.dataset.mafiaRolePanel||"",revealed=state.revealedRoles.has(boxKey);
    if(!role){
      panel.className="mafia-my-role unknown";
      panel.replaceChildren(U.el("div",{class:"mafia-role-draw waiting"},[U.el("div",{class:"mafia-card-back",text:"?"}),U.el("div",{class:"mafia-role-draw-copy"},[U.el("strong",{text:"역할 준비 중…"}),U.el("small",{text:"암호화된 역할 정보를 받고 있어요."})])]))
      return
    }
    if(!revealed){
      panel.className="mafia-my-role draw-ready";
      const draw=U.el("div",{class:"mafia-role-draw"}),deck=U.el("div",{class:"mafia-card-deck"},[
        U.el("span",{class:"mafia-card-back back-3",text:"?"}),U.el("span",{class:"mafia-card-back back-2",text:"?"}),U.el("span",{class:"mafia-card-back back-1",text:"?"})
      ]),copy=U.el("div",{class:"mafia-role-draw-copy"},[U.el("strong",{text:"내 역할 뽑기"}),U.el("small",{text:"카드를 눌러 이번 게임의 역할을 확인하세요."})]),button=U.el("button",{class:"button primary compact-button mafia-role-draw-button",type:"button",text:"역할 뽑기"});
      button.onclick=()=>{
        if(button.disabled)return;button.disabled=true;playGameSfx("shuffle");draw.classList.add("drawing");button.textContent="카드 섞는 중…";
        setTimeout(()=>{playGameSfx("flip");draw.classList.add("flipping");button.textContent="역할 확인!"},650);
        setTimeout(()=>{playGameSfx("reveal");state.revealedRoles.add(boxKey);panel.classList.add("role-reveal-pop");mountRolePanel(panel,role);try{panel.__mafiaOnReveal?.()}catch{}},1200)
      };
      draw.append(deck,copy,button);panel.replaceChildren(draw);return
    }
    panel.className=`mafia-my-role ${role} revealed`;
    panel.replaceChildren(U.el("img",{class:"mafia-role-portrait",src:roleAsset(role),alt:`${roleLabel(role)} 캐릭터`,loading:"lazy"}),U.el("div",{class:"mafia-role-copy"},[U.el("span",{text:"내 역할"}),U.el("strong",{"data-mafia-role-key":boxKey,text:roleLabel(role)}),U.el("small",{text:roleDesc(role)})]))
  }
  function mountPoliceResult(node,data){
    const U=D();
    if(!data){node.replaceChildren(U.el("small",{text:"경찰 조사 결과를 확인 중입니다…"}));return}
    node.className=`mafia-event-text police-result ${data.isMafia?"mafia":"citizen"}`;
    node.replaceChildren(U.el("strong",{text:`조사 결과 · ${data.nickname}`}),U.el("div",{text:data.isMafia?"이 사람은 마피아입니다.":"이 사람은 마피아가 아닙니다."}))
  }
  function mafiaRolePreview(U,count){
    const counts=roleCounts(count),wrap=U.el("div",{class:"mafia-role-preview"});
    ROLE_ORDER.filter(role=>counts[role]>0).forEach(role=>wrap.append(U.el("div",{class:`mafia-role-preview-card ${role}`},[U.el("img",{src:roleAsset(role),alt:`${roleLabel(role)} 역할 캐릭터`,loading:"lazy"}),U.el("strong",{text:`${roleLabel(role)} ×${counts[role]}`}),U.el("small",{text:roleDesc(role)})])));
    return wrap
  }
  function mafiaLobbyCard(roomId,game){
    const U=D(),card=U.el("section",{class:"room-game-card mafia-game-card"}),keys=new Set(allOf(game.id,"mafia-key").map(m=>m.game.userId)),people=activeParticipants(game),selected=people.some(p=>p.user_id===currentUser().user_id),counts=roleCounts(people.length),left=leftIds(game.id);
    card.append(U.el("div",{class:"room-game-head"},[U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:"🕵️ 마피아 게임"}),U.el("small",{text:"노와르 카드형 디자인 · 역할 이미지는 각자만 확인"})]),U.el("span",{class:"room-game-badge mafia",text:"SECRET"})]));
    card.append(U.el("div",{class:"room-game-pills"},[U.el("span",{class:"room-game-pill",text:`참가 ${people.length}명`}),U.el("span",{class:"room-game-pill",text:`준비 ${people.filter(p=>keys.has(p.user_id)).length}/${people.length}`}),U.el("span",{class:"room-game-pill",text:people.length>=4?roleSummary(counts):"최소 4명 필요"})]));
    const names=U.el("div",{class:"mafia-participants"});game.participants.forEach(p=>names.append(participantBadge(U,p,{alive:!left.has(p.user_id),ready:keys.has(p.user_id)&&!left.has(p.user_id)})));card.append(names);if(people.length>=4)card.append(mafiaRolePreview(U,people.length));
    if(!latest(game.id,"mafia-phase"))card.append(U.el("p",{class:"mafia-event-text",text:people.every(p=>keys.has(p.user_id))?"참가 확인 완료 · 자동으로 역할을 배정하고 있어요.":`참가 확정 ${people.length}명 · 역할 암호키 준비 ${people.filter(p=>keys.has(p.user_id)).length}/${people.length} · 준비되면 자동 시작`}));
    if(selected&&!latest(game.id,"mafia-phase")){const leave=U.el("button",{class:"button danger compact-button mafia-leave-button",type:"button",text:"게임 나가기"});leave.onclick=async()=>{leave.disabled=true;try{await leaveMafia(roomId,game);playGameSfx("vote")}catch(e){MiniTalk.UI.Shell.toast(e.message);leave.disabled=false}};card.append(leave)}
    return card
  }
  function roundEvents(U,gameId){
    const wrap=U.el("div",{class:"mafia-event-list"}),latestTie=latest(gameId,"mafia-tie"),latestDeath=latest(gameId,"mafia-death"),latestVote=latest(gameId,"mafia-eliminate"),latestLeft=latest(gameId,"mafia-player-left");
    if(latestDeath)wrap.append(U.el("p",{class:"mafia-event-text",text:latestDeath.game.noKill?"시간 초과 또는 선택 불일치로 지난 밤에는 아무도 탈락하지 않았습니다.":latestDeath.game.saved?"의사가 지켜서 지난 밤에는 아무도 죽지 않았습니다.":`${latestDeath.game.nickname} 님이 밤에 탈락했습니다.`}));
    if(latestVote)wrap.append(U.el("p",{class:"mafia-event-text",text:`투표로 ${latestVote.game.nickname} 님이 탈락했습니다.`}));
    if(latestTie)wrap.append(U.el("p",{class:"mafia-event-text",text:"지난 투표는 동률이라 무효가 됐습니다."}));
    if(latestLeft)wrap.append(U.el("p",{class:"mafia-event-text",text:`${latestLeft.game.nickname||"참가자"} 님이 게임에서 나갔습니다.`}));
    return wrap.childNodes.length?wrap:null
  }
  function latestPoliceResultBox(gameId,userId){
    const msgs=allOf(gameId,"mafia-police-result").filter(m=>m.game.target===userId).sort((a,b)=>(a.game.round||0)-(b.game.round||0));
    const msg=msgs[msgs.length-1];if(!msg)return null;return{boxKey:`police:${gameId}:${userId}:${msg.game.round||0}`,message:msg}
  }
  function mafiaTimerCard(U,roomId,lobby,phaseMsg,card,rolePanel,roleValue){
    const g=phaseMsg.game,wrap=U.el("div",{class:"mafia-timer"}),label=U.el("strong",{text:""}),bar=U.el("span",{class:"mafia-timer-bar"}),fill=U.el("i");bar.append(fill);wrap.append(label,bar);card.append(wrap);
    const me=currentUser().user_id,key=`${g.id}:${g.phase}:${g.round||1}:${g.deadline||0}`;let mounted=false;
    const update=()=>{
      if(!wrap.isConnected){if(mounted)clearInterval(timer);return}mounted=true;
      const now=Date.now(),windowName=phaseWindow(g,now),end=windowName==="role"?g.actionStartsAt:windowName==="discussion"?g.discussionEndsAt:g.deadline,total=windowName==="role"?MAFIA_TIMING.roleReveal:windowName==="night"?MAFIA_TIMING.night:windowName==="discussion"?MAFIA_TIMING.discussion:MAFIA_TIMING.vote,remain=Math.max(0,(end||now)-now);
      label.textContent=windowName==="role"?`역할 확인 ${formatRemain(remain)}`:windowName==="night"?`밤 행동 ${formatRemain(remain)}`:windowName==="discussion"?`토론 ${formatRemain(remain)}`:windowName==="vote"?`투표 ${formatRemain(remain)}`:"종료";
      fill.style.width=`${Math.max(0,Math.min(100,total?remain/total*100:0))}%`;
      card.querySelectorAll('[data-phase-gate="night"]').forEach(node=>node.disabled=windowName!=="night");
      card.querySelectorAll('[data-phase-gate="vote"]').forEach(node=>node.disabled=windowName!=="vote");
      if(windowName!=="role"&&rolePanel&&roleValue&&!state.revealedRoles.has(rolePanel.dataset.mafiaRolePanel)){state.revealedRoles.add(rolePanel.dataset.mafiaRolePanel);mountRolePanel(rolePanel,roleValue);playGameSfx("reveal");try{rolePanel.__mafiaOnReveal?.()}catch{}}
      if(remain<=0&&g.phase!=="ended"&&lobby.hostId===me&&!state.autoResolved.has(key)){
        state.autoResolved.add(key);
        const action=resolveMafiaPhaseOnce(roomId,lobby,phaseMsg,{allowTimeout:true});
        action.then(resolved=>{if(resolved)playGameSfx("result");else state.autoResolved.delete(key)}).catch(()=>state.autoResolved.delete(key))
      }
    };
    const timer=setInterval(update,400);setTimeout(update,0);return wrap
  }
  function mafiaPhaseCard(roomId,phaseMsg){
    const gameId=phaseMsg.game.id,lobby=latest(gameId,"mafia-lobby"),phase=phaseMsg.game.phase,living=phaseMsg.game.living||lobby?.game.participants.map(p=>p.user_id)||[],U=D(),card=U.el("section",{class:"room-game-card mafia-game-card"});
    if(!lobby)return card;
    card.append(U.el("div",{class:"room-game-head"},[U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:`🕵️ 마피아 ${phaseMsg.game.round||1}라운드`}),U.el("small",{text:phaseText(phase)})]),U.el("span",{class:`room-game-badge mafia ${phase}`,text:phase==="ended"?"END":phase.toUpperCase()})]));
    card.append(U.el("div",{class:"room-game-pills"},[U.el("span",{class:"room-game-pill",text:`생존 ${living.length}명`}),U.el("span",{class:"room-game-pill",text:phase==="ended"?(phaseMsg.game.winner==="mafia"?"마피아 승리":phaseMsg.game.winner==="citizen"?"시민 승리":"게임 중단"):phase==="night"?"역할별 밤 행동 진행" :"모두 투표하세요"})]));
    const board=U.el("div",{class:"mafia-living-board"});lobby.game.participants.forEach(person=>board.append(participantBadge(U,person,{alive:living.includes(person.user_id)})));card.append(board);
    const me=currentUser().user_id,roleBoxKey=`role:${gameId}:${me}`,roleData=state.privateBoxes.get(roleBoxKey)?.value,roleValue=roleData?.role||roleData,roleRevealed=state.revealedRoles.has(roleBoxKey),hasLeft=leftIds(gameId).has(me);
    let rolePanel=null;if(lobby.game.participants.some(p=>p.user_id===me)){rolePanel=U.el("div",{class:`mafia-my-role ${roleValue||"unknown"}`,"data-mafia-role-panel":roleBoxKey});rolePanel.__mafiaOnReveal=()=>{if(!card.isConnected)return;const newest=latestPhase(gameId)||phaseMsg,fresh=mafiaPhaseCard(roomId,newest);try{if(card.ownerDocument&&fresh.ownerDocument!==card.ownerDocument)card.ownerDocument.adoptNode(fresh)}catch{}card.replaceWith(fresh)};mountRolePanel(rolePanel,roleValue);card.append(rolePanel)}
    if(phase!=="ended")mafiaTimerCard(U,roomId,lobby.game,phaseMsg,card,rolePanel,roleValue);
    const events=roundEvents(U,gameId);if(events)card.append(events);
    if(roleRevealed&&roleValue==="police"){const latestBox=latestPoliceResultBox(gameId,me);if(latestBox){const resultNode=U.el("div",{class:"mafia-event-text police-result","data-police-result-box":latestBox.boxKey});mountPoliceResult(resultNode,state.privateBoxes.get(latestBox.boxKey)?.value||null);card.append(resultNode)}}
    if(phase==="ended"){
      const winner=phaseMsg.game.winner||"citizen",participant=lobby.game.participants.some(p=>p.user_id===me),personalWin=participant&&winner!=="none"?((winner==="mafia")=== (roleValue==="mafia")):null,reason=phaseMsg.game.reason;
      const title=winner==="none"?"게임 종료":personalWin===true?"승리!":personalWin===false?"패배":"게임 종료";
      const detail=winner==="none"?(reason==="host-left"?"게임 진행자가 나가서 게임을 종료했어요.":"게임이 종료됐어요."):winner==="mafia"?"마피아 수가 시민 진영 수 이상이 되었어요.":"모든 마피아가 탈락했어요.";
      card.append(U.el("div",{class:`mafia-winner-banner ${winner} ${personalWin===true?"personal-win":personalWin===false?"personal-lose":""}`},[U.el("img",{src:roleAsset(winner==="mafia"?"mafia":"citizen"),alt:"게임 결과 캐릭터",loading:"lazy"}),U.el("div",{},[U.el("strong",{text:title}),U.el("small",{text:`${winner==="mafia"?"마피아 팀 승리":winner==="citizen"?"시민 팀 승리":"무승부/중단"} · ${detail}`})])]))
      return card
    }
    if(phase==="night"&&living.includes(me)&&roleRevealed){
      if(roleValue==="mafia"&&!latest(gameId,"mafia-night-action",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
        const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)&&p.user_id!==me),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
        const kill=U.el("button",{class:"button danger compact-button",type:"button",text:"밤의 대상 선택","data-phase-gate":"night"});kill.disabled=phaseWindow(phaseMsg.game)!=="night";kill.onclick=async()=>{kill.disabled=true;try{const cipher=await encryptFor(lobby.game.hostPublic,{target:sel.value,round:phaseMsg.game.round});await sendGame(roomId,{text:"[밤 행동 완료]",game:{kind:"mafia-night-action",id:gameId,round:phaseMsg.game.round,cipher}});playGameSfx("action")}catch(e){MiniTalk.UI.Shell.toast(e.message);kill.disabled=false}};
        card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"마피아만 보이는 비밀 행동"}),sel,kill]))
      }
      if(roleValue==="doctor"&&!latest(gameId,"mafia-doctor-action",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
        const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
        const save=U.el("button",{class:"button primary compact-button",type:"button",text:"치료 대상 선택","data-phase-gate":"night"});save.disabled=phaseWindow(phaseMsg.game)!=="night";save.onclick=async()=>{save.disabled=true;try{const cipher=await encryptFor(lobby.game.hostPublic,{target:sel.value,round:phaseMsg.game.round});await sendGame(roomId,{text:"[의사 행동 완료]",game:{kind:"mafia-doctor-action",id:gameId,round:phaseMsg.game.round,cipher}});playGameSfx("action")}catch(e){MiniTalk.UI.Shell.toast(e.message);save.disabled=false}};
        card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"의사는 한 명을 살릴 수 있어요. 자신도 가능해요."}),sel,save]))
      }
      if(roleValue==="police"&&!latest(gameId,"mafia-police-action",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
        const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)&&p.user_id!==me),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
        const inspect=U.el("button",{class:"button secondary compact-button",type:"button",text:"조사 대상 선택","data-phase-gate":"night"});inspect.disabled=phaseWindow(phaseMsg.game)!=="night";inspect.onclick=async()=>{inspect.disabled=true;try{const cipher=await encryptFor(lobby.game.hostPublic,{target:sel.value,round:phaseMsg.game.round});await sendGame(roomId,{text:"[경찰 행동 완료]",game:{kind:"mafia-police-action",id:gameId,round:phaseMsg.game.round,cipher}});playGameSfx("action")}catch(e){MiniTalk.UI.Shell.toast(e.message);inspect.disabled=false}};
        card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"경찰은 한 명을 조사해 마피아 여부를 확인해요."}),sel,inspect]))
      }
    }
    if(phase==="day"&&living.includes(me)&&!latest(gameId,"mafia-vote",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
      const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)&&p.user_id!==me),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
      const vote=U.el("button",{class:"button secondary compact-button",type:"button",text:"투표하기","data-phase-gate":"vote"});vote.disabled=phaseWindow(phaseMsg.game)!=="vote";vote.onclick=async()=>{vote.disabled=true;await sendGame(roomId,{text:"[마피아 투표]",game:{kind:"mafia-vote",id:gameId,round:phaseMsg.game.round,target:sel.value}});playGameSfx("vote")};
      card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"생존자는 한 명에게 투표할 수 있어요."}),sel,vote]))
    }
    if(lobby.game.participants.some(p=>p.user_id===me)&&!hasLeft){const leave=U.el("button",{class:"button danger compact-button mafia-leave-button",type:"button",text:"게임 나가기"});leave.onclick=async()=>{leave.disabled=true;try{await leaveMafia(roomId,lobby.game);playGameSfx("vote")}catch(e){MiniTalk.UI.Shell.toast(e.message);leave.disabled=false}};card.append(leave)}
    if(lobby&&currentUser().user_id===lobby.game.hostId&&!hasLeft){const hostControls=mafiaHostControls(roomId,lobby.game,phaseMsg);if(hostControls)card.append(hostControls)}
    return card
  }
  async function hostPrivate(gameId){return JSON.parse(localStorage.getItem(mafiaHostKey(gameId))||"null")}
  async function resolveNight(roomId,lobby,phaseMsg,{allowTimeout=false}={}){
    const host=await hostPrivate(lobby.id);if(!host?.roles)throw new Error("이 기기에 게임 진행 정보가 없습니다.");
    const round=phaseMsg.game.round,keyMsgs=allOf(lobby.id,"mafia-key"),publicKeys=new Map(keyMsgs.map(m=>[m.game.userId,m.game.publicKey])),privateHost=JSON.parse(localStorage.getItem(mafiaHostKey(lobby.id))),privateKey=await importPrivate(privateHost.privateKey);
    const aliveRoleIds=role=>Object.keys(host.roles).filter(id=>host.roles[id]===role&&host.living.includes(id));
    const decodeTargets=async(kind,allowedIds)=>{
      const actions=allOf(lobby.id,kind).filter(m=>m.game.round===round&&allowedIds.includes(m.user_id));
      const values=[];
      for(const m of actions){try{const buf=await crypto.subtle.decrypt({name:"RSA-OAEP"},privateKey,unb64(m.game.cipher)),data=JSON.parse(dec.decode(buf));if(host.living.includes(data.target))values.push({from:m.user_id,target:data.target})}catch{}}
      return values
    };
    const mafiaIds=aliveRoleIds("mafia"),doctorIds=aliveRoleIds("doctor"),policeIds=aliveRoleIds("police");
    const mafiaVotes=await decodeTargets("mafia-night-action",mafiaIds),doctorActions=await decodeTargets("mafia-doctor-action",doctorIds),policeActions=await decodeTargets("mafia-police-action",policeIds);
    const uniqueActors=actions=>new Set(actions.map(v=>v.from)).size;
    const expired=Date.now()>=(phaseMsg.game.deadline||Infinity),timedOut=allowTimeout&&expired;
    if(!timedOut&&uniqueActors(mafiaVotes)<mafiaIds.length)throw new Error(`마피아의 밤 행동이 ${mafiaIds.length-uniqueActors(mafiaVotes)}명 남았습니다.`);
    if(!timedOut&&doctorIds.length&&uniqueActors(doctorActions)<doctorIds.length)throw new Error("의사의 밤 행동이 아직 없습니다.");
    if(!timedOut&&policeIds.length&&uniqueActors(policeActions)<policeIds.length)throw new Error("경찰의 밤 행동이 아직 없습니다.");
    const counts={};mafiaVotes.forEach(v=>counts[v.target]=(counts[v.target]||0)+1);
    const rankedTargets=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(rankedTargets.length>1&&rankedTargets[0][1]===rankedTargets[1][1]){
      if(!timedOut)throw new Error("마피아끼리 선택한 대상이 달라요. 같은 대상을 선택해야 합니다.");
      await sendGame(roomId,{text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,noKill:true,nickname:"",target:""}});await advanceOrEnd(roomId,lobby,host,"day",round);return
    }
    const target=rankedTargets[0]?.[0];
    if(!target){if(!timedOut)throw new Error("마피아의 유효한 대상이 없습니다.");await sendGame(roomId,{text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,noKill:true,nickname:"",target:""}});await advanceOrEnd(roomId,lobby,host,"day",round);return}
    const savedTarget=doctorActions[0]?.target||null;
    for(const action of policeActions){
      const policeId=action.from,targetId=action.target,person=lobby.participants.find(p=>p.user_id===targetId),isMafia=host.roles[targetId]==="mafia",publicJwk=publicKeys.get(policeId);
      if(!publicJwk)continue;
      const cipher=await encryptFor(publicJwk,{target:targetId,nickname:person?.nickname||targetId,isMafia,round});
      await sendGame(roomId,{text:"[경찰 결과]",game:{kind:"mafia-police-result",id:lobby.id,round,target:policeId,cipher}})
    }
    if(savedTarget&&savedTarget===target){
      await sendGame(roomId,{text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,target,nickname:(lobby.participants.find(p=>p.user_id===target)?.nickname||target),saved:true}});
      await advanceOrEnd(roomId,lobby,host,"day",round);return
    }
    const person=lobby.participants.find(p=>p.user_id===target);host.living=host.living.filter(id=>id!==target);localStorage.setItem(mafiaHostKey(lobby.id),JSON.stringify(host));
    await sendGame(roomId,{text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,target,nickname:person?.nickname||target}});
    await advanceOrEnd(roomId,lobby,host,"day",round)
  }
  async function resolveVote(roomId,lobby,phaseMsg,{allowTimeout=false}={}){
    const host=await hostPrivate(lobby.id),votes=allOf(lobby.id,"mafia-vote").filter(m=>m.game.round===phaseMsg.game.round&&host.living.includes(m.user_id)&&host.living.includes(m.game.target)),voters=new Set(votes.map(v=>v.user_id));
    const expired=Date.now()>=(phaseMsg.game.deadline||Infinity),timedOut=allowTimeout&&expired;
    if(!timedOut&&voters.size<host.living.length)throw new Error(`아직 ${host.living.length-voters.size}명의 투표가 남았습니다.`);
    const counts={};votes.forEach(v=>counts[v.game.target]=(counts[v.game.target]||0)+1);const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(ranked.length>1&&ranked[0][1]===ranked[1][1]){await sendGame(roomId,{text:"[투표 무효]",game:{kind:"mafia-tie",id:lobby.id,round:phaseMsg.game.round}});await advanceOrEnd(roomId,lobby,host,"night",phaseMsg.game.round+1);return}
    const target=ranked[0]?.[0];if(!target){if(!timedOut)throw new Error("집계할 표가 없습니다.");await sendGame(roomId,{text:"[투표 무효]",game:{kind:"mafia-tie",id:lobby.id,round:phaseMsg.game.round,abstain:true}});await advanceOrEnd(roomId,lobby,host,"night",phaseMsg.game.round+1);return}const person=lobby.participants.find(p=>p.user_id===target);host.living=host.living.filter(id=>id!==target);localStorage.setItem(mafiaHostKey(lobby.id),JSON.stringify(host));
    await sendGame(roomId,{text:"[투표 탈락]",game:{kind:"mafia-eliminate",id:lobby.id,round:phaseMsg.game.round,target,nickname:person?.nickname||target}});await advanceOrEnd(roomId,lobby,host,"night",phaseMsg.game.round+1)
  }
  async function advanceOrEnd(roomId,lobby,host,nextPhase,round){const winner=winnerFor(host);if(winner){await sendGame(roomId,{text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:lobby.id,phase:"ended",round,living:[...host.living],winner,reason:"rule",startedAt:Date.now(),deadline:Date.now()}});scheduleGameCleanup(roomId,lobby.id);return}await sendGame(roomId,{text:"[마피아 진행]",game:phasePayload(lobby.id,nextPhase,round,host.living)})}
  function mafiaHostControls(roomId,lobby,phaseMsg){const U=D(),wrap=U.el("div",{class:"mafia-host-controls"});if(phaseMsg.game.phase==="night"){const b=U.el("button",{class:"button primary compact-button",type:"button",text:"밤 결과 처리","data-phase-gate":"night"});b.disabled=phaseWindow(phaseMsg.game)!=="night";b.onclick=async()=>{b.disabled=true;try{if(await resolveMafiaPhaseOnce(roomId,lobby,phaseMsg))playGameSfx("result")}catch(e){MiniTalk.UI.Shell.toast(e.message);b.disabled=phaseWindow(phaseMsg.game)!=="night"}};wrap.append(U.el("small",{class:"muted",text:"역할 확인이 끝난 뒤, 마피아/경찰/의사의 밤 행동 완료 후 처리할 수 있어요."}),b)}else if(phaseMsg.game.phase==="day"){const b=U.el("button",{class:"button primary compact-button",type:"button",text:"투표 집계","data-phase-gate":"vote"});b.disabled=phaseWindow(phaseMsg.game)!=="vote";b.onclick=async()=>{b.disabled=true;try{if(await resolveMafiaPhaseOnce(roomId,lobby,phaseMsg))playGameSfx("result")}catch(e){MiniTalk.UI.Shell.toast(e.message);b.disabled=phaseWindow(phaseMsg.game)!=="vote"}};wrap.append(U.el("small",{class:"muted",text:"토론 시간이 끝난 뒤 생존자 투표를 집계할 수 있어요."}),b)}return wrap.childNodes.length?wrap:null}
  function terminalDisplayMessage(gameId){
    const phase=latestPhase(gameId);
    return chessTerminal(gameId)||((phase?.game?.phase==="ended")?phase:null)||latest(gameId,"ladder")||latest(gameId,"game-invite-cancelled")||null
  }
  function isInternal(message){
    const g=message?.game,kind=g?.kind;if(!g?.id)return false;
    if(["game-invite-accept","game-invite-decline","game-invite-slot","game-invite-leave","mafia-key","mafia-role","mafia-night-action","mafia-doctor-action","mafia-police-action","mafia-police-result","mafia-vote","mafia-death","mafia-eliminate","mafia-tie","mafia-leave","mafia-player-left","chess-move","chess-draw-offer","chess-draw-reject"].includes(kind))return true;
    if(kind==="mafia-phase"&&g.phase!=="ended")return true;
    const terminal=terminalDisplayMessage(g.id);
    if(terminal)return String(terminal.id||"")!==String(message.id||"")&&terminal!==message;
    const started=latest(g.id,"mafia-lobby")||latest(g.id,"chess-start");
    if(started&&kind==="game-invite")return true;
    return false
  }
  function renderFullMessage(message,roomId){const g=message?.game;if(!g)return null;if(g.kind==="game-invite")return inviteCard(roomId,message);if(g.kind==="game-invite-cancelled")return inviteCard(roomId,latest(g.id,"game-invite")||message);if(g.kind==="ladder")return ladderCard(g);if(g.kind==="chess-start"||g.kind==="chess-move"||g.kind==="chess-end"||g.kind==="chess-draw-offer"||g.kind==="chess-draw-reject")return chessCard(roomId,message);if(g.kind==="mafia-lobby")return mafiaLobbyCard(roomId,g);if(g.kind==="mafia-phase")return mafiaPhaseCard(roomId,message);return null}
  function desktopGameMode(){if(MiniTalk.MobileImmersive?.isMobile?.())return false;const ua=navigator.userAgent||"";if(/CrOS|Whale/i.test(ua))return true;return !/Android|iPhone|iPad|iPod|Mobile/i.test(ua)}
  function desktopPopupBounds(){
    const source=MiniTalk.UI.Dom.doc()?.defaultView||window,scr=source.screen||{},availLeft=Number(scr.availLeft)||0,availTop=Number(scr.availTop)||0,availWidth=Math.max(760,Number(scr.availWidth)||1366),availHeight=Math.max(620,Number(scr.availHeight)||768),gap=42;
    const messengerLeft=Number(source.screenX??source.screenLeft)||availLeft,messengerTop=Number(source.screenY??source.screenTop)||availTop,messengerW=Math.max(300,Number(source.outerWidth)||360),desiredW=Math.min(1100,Math.max(820,Math.round(availWidth*.68))),desiredH=Math.min(900,Math.max(680,Math.round(availHeight*.86)));
    const rightStart=messengerLeft+messengerW+gap,rightSpace=availLeft+availWidth-rightStart;let width=Math.min(desiredW,availWidth-24),height=Math.min(desiredH,availHeight-24),left,top;
    if(rightSpace>=Math.min(720,width)){width=Math.min(width,rightSpace);left=rightStart}else left=Math.max(availLeft+8,Math.min(availLeft+availWidth-width-8,messengerLeft+messengerW/2-width/2));
    top=Math.max(availTop+8,Math.min(messengerTop,availTop+availHeight-height-8));return{width:Math.round(width),height:Math.round(height),left:Math.round(left),top:Math.round(top)}
  }
  function desktopPopupFeatures(){const b=desktopPopupBounds();return`popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=yes,resizable=yes,width=${b.width},height=${b.height},left=${b.left},top=${b.top}`}
  function enforceDesktopPopupBounds(win){const b=desktopPopupBounds();try{win.resizeTo(b.width,b.height);win.moveTo(b.left,b.top)}catch{}}
  function desktopMount(title,node){
    const d=state.desktop;if(!d.win||d.win.closed||!d.root)return false;d.title.textContent=title||"대화방 게임";d.back.classList.remove("hidden");d.root.replaceChildren(d.win.document.adoptNode(node));try{d.win.focus()}catch{}return true
  }
  function latestDisplayMessage(gameId){const list=gameMessages(gameId);return [...list].reverse().find(m=>["chess-end","chess-move","chess-start","chess-draw-offer","chess-draw-reject"].includes(m.game?.kind))||[...list].reverse().find(m=>m.game?.kind==="mafia-phase")||[...list].reverse().find(m=>m.game?.kind==="mafia-lobby")||[...list].reverse().find(m=>m.game?.kind==="ladder")||[...list].reverse().find(m=>m.game?.kind==="game-invite")||null}
  function roomDisplayGames(roomId){const out=[];for(const [gameId,list] of state.messages){if(!list.some(m=>m.roomId===roomId))continue;const msg=latestDisplayMessage(gameId);if(msg)out.push(msg)}return out.sort((a,b)=>(Number(b.ts)||Number(b.clientTs)||0)-(Number(a.ts)||Number(a.clientTs)||0)).slice(0,4)}
  function showDesktopMessage(message){
    if(!message?.game)return false;ingest(message);const d=state.desktop;if(!d.win||d.win.closed)return false;d.roomId=message.roomId||d.roomId;d.activeGameId=message.game.id;d.sessionGames.set(String(message.game.id),String(d.roomId||message.roomId||""));const node=renderFullMessage(message,d.roomId);if(!node)return false;d.title.textContent=(message.game.kind==="ladder"||message.game.gameType==="ladder")?"사다리타기":(String(message.game.kind||"").startsWith("chess-")||message.game.gameType==="chess")?"체스":"마피아 게임";d.back.classList.remove("hidden");const wrap=D().el("div",{class:"chat-room-game-desktop-stage"},[node]);d.root.replaceChildren(d.win.document.adoptNode(wrap));try{d.win.focus()}catch{}return true
  }
  function queueDesktopRefresh(gameId){clearTimeout(state.desktop.refreshTimer);state.desktop.refreshTimer=setTimeout(()=>{if(state.desktop.activeGameId!==gameId)return;const msg=latestDisplayMessage(gameId);if(msg)showDesktopMessage(msg)},30)}
  function renderDesktopMenu(roomId,room){
    const U=D(),body=U.el("div",{class:"room-game-desktop-menu"});body.append(U.el("div",{class:"room-game-desktop-hero"},[U.el("strong",{text:"대화방 미니게임"}),U.el("p",{text:"현재 대화방 멤버를 골라 게임을 시작하세요. PC·웨일북에서는 넓은 별도 창으로 진행합니다."})]));
    const choices=U.el("div",{class:"room-game-desktop-choices"}),ladder=U.el("button",{class:"room-game-desktop-choice ladder",type:"button"},[U.el("span",{class:"choice-icon choice-ladder","aria-hidden":"true"},[U.el("i"),U.el("i"),U.el("i")]),U.el("strong",{text:"사다리타기"}),U.el("small",{text:"2~12명 · 랜덤 경로 추적"})]),mafia=U.el("button",{class:"room-game-desktop-choice mafia",type:"button"},[U.el("img",{class:"choice-role-art",src:roleAsset("mafia"),alt:"",loading:"eager"}),U.el("strong",{text:"마피아 게임"}),U.el("small",{text:"4~12명 · 역할/타이머/투표"})]),chess=U.el("button",{class:"room-game-desktop-choice chess",type:"button"},[U.el("span",{class:"choice-chess","aria-hidden":"true",text:"♞"}),U.el("strong",{text:"체스"}),U.el("small",{text:"2명 · 체크/캐슬링/프로모션"})]);
    ladder.onclick=()=>createLadder(roomId,room,desktopMount);mafia.onclick=()=>createMafia(roomId,room,desktopMount);chess.onclick=()=>createChess(roomId,room,desktopMount);choices.append(ladder,mafia,chess);body.append(choices);
    const recent=roomDisplayGames(roomId);if(recent.length){const section=U.el("section",{class:"room-game-desktop-recent"},[U.el("strong",{text:"진행 중 / 최근 게임"})]);recent.forEach(msg=>{const ended=gameIsTerminal(msg.game.id),label=msg.game.kind==="game-invite"?`${msg.game.gameType==="ladder"?"사다리타기":msg.game.gameType==="chess"?"체스":"마피아 게임"} · 초대`:msg.game.kind==="ladder"?"사다리타기 · 종료":String(msg.game.kind||'').startsWith('chess-')?`체스${ended?' · 종료':''}`:msg.game.kind==="mafia-phase"&&msg.game.phase==="ended"?"마피아 게임 · 종료":"마피아 게임";const b=U.el("button",{class:`room-game-recent-button${ended?' is-ended':''}`,type:"button",text:ended?`${gameTypeLabel(msg.game)} · 종료됨`:label,disabled:ended,"aria-disabled":String(ended)});if(!ended)b.onclick=()=>showDesktopMessage(msg);section.append(b)});body.append(section)}
    const d=state.desktop;d.title.textContent="대화방 게임";d.back.classList.add("hidden");d.activeGameId=null;d.root.replaceChildren(d.win.document.adoptNode(body))
  }
  function ensureDesktopPopup(roomId,room){
    const d=state.desktop;try{if(d.win&&!d.win.closed){d.roomId=roomId;d.win.focus();renderDesktopMenu(roomId,room);return true}}catch{}
    let win=null;try{win=window.open("",`MoaruChatRoomGame_${String(roomId).replace(/[^a-zA-Z0-9_-]/g,"_")}`,desktopPopupFeatures())}catch{}if(!win)return false;
    const base=String(document.baseURI||location.href).replace(/"/g,"%22"),doc=win.document;doc.open();doc.write(`<!doctype html><html lang="ko" data-theme="${document.documentElement?.dataset?.theme||"light"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>대화방 게임</title><link rel="stylesheet" href="css/tokens.css?v=7"><link rel="stylesheet" href="css/app.css?v=64.5.23"><link rel="stylesheet" href="css/features/room-chess.css?v=2"><link rel="stylesheet" href="css/features/room-games-plus.css?v=6"><style>html,body{margin:0;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}.chat-room-game-window{background:#eef2f8}.chat-room-game-shell{width:100vw;height:100vh;height:100dvh;min-width:0;min-height:0;display:grid;grid-template-rows:54px minmax(0,1fr)}.chat-room-game-bar{display:flex;align-items:center;gap:10px;padding:0 14px;background:#fff;border-bottom:1px solid #dfe5ee;box-shadow:0 2px 10px rgba(22,33,50,.06)}.chat-room-game-back,.chat-room-game-close{width:36px;height:36px;border:1px solid #dfe5ee;border-radius:11px;background:#f6f8fb;color:#253246;font-size:18px;cursor:pointer}.chat-room-game-title{flex:1;font-size:15px}.chat-room-game-root{width:100%;min-width:0;min-height:0;overflow:auto;padding:18px;box-sizing:border-box}</style></head><body class="chat-room-game-window"><main class="chat-room-game-shell"><header class="chat-room-game-bar"><button id="roomGameBack" class="chat-room-game-back hidden" type="button" aria-label="게임 메뉴로">‹</button><strong id="roomGameTitle" class="chat-room-game-title">대화방 게임</strong><button id="roomGameClose" class="chat-room-game-close" type="button" aria-label="닫기">×</button></header><section id="roomGameRoot" class="chat-room-game-root"></section></main></body></html>`);doc.close();enforceDesktopPopupBounds(win);
    d.win=win;d.roomId=roomId;d.root=doc.getElementById("roomGameRoot");d.title=doc.getElementById("roomGameTitle");d.back=doc.getElementById("roomGameBack");d.activeGameId=null;const closeToken=watchDesktopPopupClose(win);
    d.back.onclick=async()=>{const id=d.roomId;let latestRoom=MiniTalk.Store.get("rooms")?.[id]||room;try{latestRoom=await MiniTalk.Realtime.getRoom(id)||latestRoom}catch{}renderDesktopMenu(id,latestRoom)};doc.getElementById("roomGameClose").onclick=async()=>{const sessions=[...d.sessionGames.entries()];if(d.activeGameId&&!d.sessionGames.has(String(d.activeGameId)))sessions.push([String(d.activeGameId),String(d.roomId||"")]);d.sessionGames.clear();try{for(const [id,rid] of sessions)if(rid)await leaveActiveDesktopGame(rid,id)}catch(e){console.warn("게임 팝업 닫기 나가기 처리 실패",e)}finally{d.activeGameId=null;try{win.close()}catch{finishDesktopPopupClose(win,closeToken)}}};win.addEventListener("pagehide",()=>finishDesktopPopupClose(win,closeToken),{once:true});renderDesktopMenu(roomId,room);try{win.focus()}catch{}return true
  }
  function gameTypeLabel(g){const invite=g?.id?latest(g.id,"game-invite")?.game:null,type=g?.gameType||invite?.gameType;return (g?.kind==="ladder"||type==="ladder")?"사다리타기":(String(g?.kind||"").startsWith("chess-")||type==="chess")?"체스":"마피아 게임"}
  function endedChatCard(message){const U=D(),g=message?.game||{},cancelled=Boolean(latest(g.id,"game-invite-cancelled")),label=gameTypeLabel(g),card=U.el("section",{class:"room-game-card room-game-ended-chat-card",role:"status"});card.append(U.el("span",{class:"room-game-ended-icon","aria-hidden":"true",text:"✓"}),U.el("div",{class:"room-game-ended-copy"},[U.el("strong",{text:`${label} · ${cancelled?"초대 종료":"게임 종료"}`}),U.el("small",{text:cancelled?"참가 인원이 부족해 종료되었습니다.":"게임이 종료되었습니다."})]));return card}
  function desktopLaunchCard(message,roomId){
    const U=D(),g=message.game;if(gameIsTerminal(g.id))return endedChatCard(message);
    const label=gameTypeLabel(g),card=U.el("section",{class:"room-game-card room-game-launch-card"});
    card.append(U.el("div",{class:"room-game-launch-main"},[U.el("span",{class:"room-game-launch-icon","aria-hidden":"true",text:label==="사다리타기"?"🪜":label==="체스"?"♟️":"🕵️"}),U.el("div",{class:"room-game-launch-copy"},[U.el("strong",{text:label}),U.el("small",{text:"진행 중"})])]));
    const b=U.el("button",{class:"button primary compact-button room-game-open-button",type:"button",text:"열기"});b.onclick=async()=>{if(gameIsTerminal(g.id)){card.replaceWith(endedChatCard(message));return}const room=await MiniTalk.Realtime.getRoom(roomId);if(!ensureDesktopPopup(roomId,room))return showDesktopMessage(message);showDesktopMessage(message)};card.append(b);return card
  }
  function renderMessage(message,roomId){const g=message?.game;if(!g)return null;ingest(message);if(!desktopGameMode()&&g.kind==="ladder")return ladderCard(g);if(gameIsTerminal(g.id))return endedChatCard(message);if(g.kind==="game-invite")return inviteCard(roomId,message);if(desktopGameMode())return desktopLaunchCard(message,roomId);return renderFullMessage(message,roomId)}
  async function open(roomId){const room=await MiniTalk.Realtime.getRoom(roomId);if(!room)throw new Error("대화방 정보를 불러오지 못했습니다.");if(desktopGameMode()&&ensureDesktopPopup(roomId,room))return;const U=D(),body=U.el("div",{class:"modal-stack room-game-menu"}),ladder=U.el("button",{class:"button secondary room-game-menu-button",type:"button",text:"🪜 사다리타기"}),mafia=U.el("button",{class:"button secondary room-game-menu-button",type:"button",text:"🕵️ 마피아 게임"}),chess=U.el("button",{class:"button secondary room-game-menu-button",type:"button",text:"♟️ 체스"});ladder.onclick=()=>createLadder(roomId,room);mafia.onclick=()=>createMafia(roomId,room);chess.onclick=()=>createChess(roomId,room);body.append(U.el("p",{class:"muted modal-note",text:"초대 후 최소 인원이 모이면 방장이 바로 시작할 수 있고, 시작 전에는 다른 대화방 멤버도 참가할 수 있어요."}),ladder,mafia,chess);MiniTalk.UI.Shell.modal("대화방 게임",body)}
  return{open,ingest,renderMessage,isInternal,ladderData,ladderTrace,roleCounts,buildRolesForParticipants,playGameSfx,phaseTiming,winnerFor,desktopGameMode,desktopPopupBounds,normalizedLadderResults,chessInitial,chessLegalMove,chessLegalMoves,chessApply,chessStatus,chessMoveFx,chessSfxName,chessState,removeMessage:removeIngestedMessage,_qa:{assignRoles,resolveNight,resolveVote,maybeHandleLeaveAsHost,hostPrivate,handleInviteAcceptAsHost,maybeFinalizeInviteAsHost,maybeAutoStartMafia,inviteParticipants,inviteSlotFor,inviteFinalMessage,membersFor,desktopRefreshKind,leaveActiveDesktopGame,expireHostAloneInviteAsHost,scheduleHostAloneInviteExpiry,inviteEverAccepted,INVITE_HOST_ALONE_TIMEOUT}};
})();
