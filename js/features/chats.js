/* ============================================================
   CHAT FEATURE / ORCHESTRATOR
   ------------------------------------------------------------
   이 파일은 채팅 화면의 조립만 담당합니다.
   세부 기능은 js/chat/* 로 분리:
   - emoji.js       토리 이모티콘 12종
   - attachments.js 사진/카메라/파일
   - capture.js     현재 화면 캡처 후 대화방 공유
   - linkify.js     URL/YouTube 미리보기
   - voice.js       보내기 길게 눌러 음성 입력
   - unread.js      방별 미확인 수
   ============================================================ */
MiniTalk.Features.Chats=(()=>{
  const messagesByRoom={},renderedMessageIds={},olderStateByRoom={};let roomAlertTimes={};let renderFrame=0;let eventsBound=false,roomSnapshotReceived=false;
  let roomListReadyWaiters=[];
  const isRenderedChatRoute=()=>MiniTalk.Router.current()==="chats";
  function bindEvents(){if(eventsBound)return;eventsBound=true;
    MiniTalk.Events.on("rt:rooms",rooms=>{roomSnapshotReceived=true;const active=MiniTalk.Store.get("activeRoom"),memberRooms=Object.fromEntries(Object.entries(rooms||{}).filter(([,room])=>MiniTalk.Realtime.isRoomMember(room)));MiniTalk.Store.set("rooms",rooms);notifyRoomInvites(memberRooms);notifyMemberRoomUpdates(memberRooms,active);MiniTalk.Chat.Unread.syncRooms(memberRooms,active);if(!isRenderedChatRoute())return;if(active&&(!rooms?.[active]||!canViewRoom(rooms[active]))){MiniTalk.UI.Shell.closeModal();backToList();MiniTalk.UI.Shell.toast(rooms?.[active]?"대화방에서 나왔습니다.":"대화방이 삭제되었습니다.");return}if(!active)refreshRoomList()});
    MiniTalk.Events.on("rt:profiles",profiles=>{MiniTalk.Store.set("profiles",profiles||{});if(!isRenderedChatRoute())return;const active=MiniTalk.Store.get("activeRoom");if(active){applyChatHeader(MiniTalk.Store.get("rooms")?.[active]?.title||"대화",roomHeaderActions(active),{back:()=>backToList()});scheduleMessageRender(active)}else{applyChatHeader(homeTitle(),headerListActions());refreshRoomList()}});
    MiniTalk.Events.on("rt:presence",presence=>MiniTalk.Store.set("presence",presence||{}));
    MiniTalk.Events.on("rt:message-reset",roomId=>{messagesByRoom[roomId]=[];renderedMessageIds[roomId]=new Set();olderStateByRoom[roomId]={loading:false,hasMore:true}});
    MiniTalk.Events.on("rt:message",message=>{MiniTalk.Chat.RoomGames?.ingest?.(message);const roomId=message.roomId;if(!roomId)return;const list=messagesByRoom[roomId]||(messagesByRoom[roomId]=[]),isNew=!list.some(item=>item.id===message.id);if(isNew)list.push(message);const active=isRenderedChatRoute()&&MiniTalk.Store.get("activeRoom")===roomId,room=MiniTalk.Store.get("rooms")?.[roomId],stillMember=Boolean(room&&MiniTalk.Realtime.isRoomMember(room)),notifyable=message.type!=="game"||message.game?.kind==="game-invite";if(active)scheduleMessageRender(roomId);if(isNew&&!active&&stillMember&&notifyable&&(message.ts||0)>Date.now()-7000)MiniTalk.Features.Tools?.notifyIncoming?.(message)});
    MiniTalk.Events.on("rt:message-removed",info=>{const roomId=String(info?.roomId||""),id=String(info?.id||"");if(!roomId||!id)return;const list=messagesByRoom[roomId]||(messagesByRoom[roomId]=[]),next=list.filter(message=>String(message.id||"")!==id);if(next.length===list.length)return;messagesByRoom[roomId]=next;renderedMessageIds[roomId]?.delete(id);MiniTalk.Chat.RoomGames?.removeMessage?.(id);if(isRenderedChatRoute()&&MiniTalk.Store.get("activeRoom")===roomId)scheduleMessageRender(roomId)});
    MiniTalk.Events.on("chat:unread",()=>{if(isRenderedChatRoute()&&!MiniTalk.Store.get("activeRoom"))refreshRoomList()});
  }
  function scheduleMessageRender(roomId){if(renderFrame)cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>{renderFrame=0;if(MiniTalk.Store.get("activeRoom")===roomId)renderMessages(roomId)})}
  function waitForRoomList(){
    const host=MiniTalk.UI.Dom.byId("viewHost"),view=MiniTalk.UI.Dom.one(".chat-home",host);
    if(roomSnapshotReceived&&view?.dataset?.roomsReady==="1"&&!MiniTalk.Store.get("activeRoom"))return Promise.resolve();
    return new Promise(resolve=>roomListReadyWaiters.push(resolve))
  }
  function markRoomListReady(view){
    if(!roomSnapshotReceived||!view?.isConnected||MiniTalk.Store.get("activeRoom"))return;
    requestAnimationFrame(()=>{
      if(!view.isConnected||view.dataset.roomsReady!=="1"||MiniTalk.Store.get("activeRoom"))return;
      const waiters=roomListReadyWaiters.splice(0);waiters.forEach(resolve=>resolve());
      MiniTalk.Events.emit("chat:room-list-ready",{count:MiniTalk.UI.Dom.all(".conversation-item:not(.hidden)",view).length})
    })
  }
  function render(host){MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();applyChatHeader(homeTitle(),headerListActions());renderList(host)}
  function headerListActions(){const guest=Boolean(MiniTalk.Store.get("user")?.isGuest);return[
    guest?null:MiniTalk.UI.Dom.el("button",{class:"icon-button subtle header-create-button",type:"button",text:"＋","aria-label":"대화방 만들기",onclick:createRoomDialog}),
    MiniTalk.UI.Dom.el("button",{class:"icon-button subtle header-search-button",type:"button",text:"⌕","aria-label":"검색",onclick:()=>MiniTalk.UI.Dom.one(".search")?.focus()})
  ].filter(Boolean)}
  function roomHeaderActions(roomId){return MiniTalk.Store.get("user")?.isGuest?[]:[MiniTalk.UI.Dom.el("button",{class:"icon-button subtle",type:"button",text:"⋯","aria-label":"대화방 메뉴",onclick:()=>openRoomMenu(roomId)})]}
  function profileHeaderOptions(){const D=MiniTalk.UI.Dom,user=MiniTalk.Store.get("user")||{},profile=MiniTalk.Store.get("profiles")?.[user.user_id]||{},node=D.el("img",{class:"header-profile-avatar",src:profile.avatar||"assets/mascot-avatar.png",alt:user.isGuest?"기본 프로필":"내 프로필",onerror:event=>{event.currentTarget.onerror=null;event.currentTarget.src="assets/mascot-avatar.png"}});return{profile:true,profileEditable:!user.isGuest,profileNode:node,onProfile:user.isGuest?null:()=>MiniTalk.Tools.ProfileEditor.open(()=>{const active=MiniTalk.Store.get("activeRoom");if(active){const room=MiniTalk.Store.get("rooms")?.[active];applyChatHeader(room?.title||"대화",roomHeaderActions(active),{back:()=>backToList()})}else{applyChatHeader(homeTitle(),headerListActions());refreshRoomList()}})}}
  function homeTitle(){return MiniTalk.Store.get("user")?.nickname||"모아루"}
  function applyChatHeader(title,actions=[],options={}){MiniTalk.UI.Shell.setHeader(title,actions,{...options,...profileHeaderOptions()})}
  function isAdmin(){return MiniTalk.AdminSession?.authorized?.()===true}
  function canViewRoom(room){return MiniTalk.Realtime.isRoomMember(room)}
  function roomMessageTime(room){return Number(room?.lastMessageAt||room?.last_message_at||room?.updatedAt||room?.updated_at||0)}
  function roomHasVisibleActivity(room){return Boolean(String(room?.lastMessage||"").trim())||roomMessageTime(room)>0||Number(room?.messageCount||room?.message_count||room?.messagesCount||0)>0}
  /* 방 목록의 최신 메시지 시각을 비교해, 현재 소속된 방의 새 글만 알립니다. 최초 로드와 탈퇴한 방은 제외됩니다. */
  function notifyMemberRoomUpdates(rooms,activeRoom){
    const now=Date.now(),next={},currentUserId=String(MiniTalk.Store.get("user")?.user_id||"");
    Object.values(rooms||{}).forEach(room=>{
      if(!room?.id)return;
      /* 알림은 반드시 실제 마지막 메시지 시각만 사용합니다.
         room.updatedAt은 멤버/비밀번호/마이그레이션 같은 방 메타데이터 변경에도 갱신되므로
         오래된 lastMessage를 새 글처럼 되살리는 원인이 될 수 있습니다. */
      const ts=Number(room.lastMessageAt||room.last_message_at||0),previous=Number(roomAlertTimes[room.id]||0),senderId=String(room.lastMessageUserId||room.last_message_user_id||"");
      next[room.id]=ts;
      if(previous<=0||ts<=previous||room.id===activeRoom||ts<=now-7000)return;
      /* 예전 요약처럼 발신자 ID가 없는 데이터는 추측해서 알리지 않습니다.
         현재 저장되는 정상 요약에는 lastMessageUserId가 항상 있으므로 실제 새 메시지는 유지됩니다. */
      if(!senderId||senderId===currentUserId)return;
      MiniTalk.Features.Tools?.notifyIncoming?.({roomId:room.id,user_id:senderId,nickname:room.lastMessageNickname||room.title||"모아루",text:room.lastMessage||"새 메시지",ts});
    });
    roomAlertTimes=next;
  }
  function notifyRoomInvites(rooms){const current=MiniTalk.Store.get("user")||{};if(!current.user_id||current.isGuest)return;const key=`chat.roomInvites.seen.${current.user_id}`,seen=new Set(MiniTalk.Persistence.get(key,[])||[]);let changed=false;Object.values(rooms||{}).forEach(room=>{if(!room?.id||room.id==="global")return;const member=room._membership||room.members?.[current.user_id],invitedAt=Number(member?.invitedAt||0);if(!invitedAt||member?.invitedBy===current.user_id)return;const marker=`${room.id}:${invitedAt}`;if(seen.has(marker))return;seen.add(marker);changed=true;MiniTalk.Features.Tools?.notifyRoomInvite?.(room)});if(changed)MiniTalk.Persistence.set(key,[...seen].slice(-200))}
  function profileForMessage(message){const profiles=MiniTalk.Store.get("profiles")||{},stored=profiles[message.user_id]||profiles[message.nickname]||{},avatar=stored.avatar||message.avatar||message.profileImage||message.profile_image||message.profileImageUrl||message.avatarUrl||message.photoURL||message.photoUrl||"";return{...stored,avatar}}
  /* 방 이미지가 없으면 1:1 상대, 방 제목과 같은 사용자, 마지막 발신자 순으로 프로필을 찾습니다. */
  function roomAvatar(room){
    const direct=room?.avatar||room?.profileImage||room?.profile_image||room?.imageUrl||room?.image_url||room?.icon||"";
    if(direct)return direct;
    const profiles=MiniTalk.Store.get("profiles")||{},userId=MiniTalk.Store.get("user")?.user_id||"";
    const memberEntries=Object.entries(room?.members||{}).filter(([id])=>id!==userId);
    const memberIds=memberEntries.map(([id])=>id),memberNames=memberEntries.map(([,member])=>member?.nickname).filter(Boolean);
    const candidates=[room?.otherUserId,room?.target_user_id,room?.lastMessageUserId,room?.lastMessageNickname,...memberIds,...memberNames].filter(Boolean);
    for(const id of candidates){if(profiles[id]?.avatar)return profiles[id].avatar}
    const title=String(room?.title||room?.name||"").trim();
    const matched=Object.values(profiles).find(profile=>String(profile?.nickname||"").trim()===title&&profile?.avatar);
    return matched?.avatar||"assets/mascot-avatar.png";
  }
  function favoriteKey(){return`chat.favorites.${MiniTalk.Store.get("user")?.user_id||"guest"}`}
  function favoriteMap(){return MiniTalk.Persistence.get(favoriteKey(),{})||{}}
  function isFavorite(roomId){return favoriteMap()[roomId]===true}
  function toggleFavorite(roomId){const map=favoriteMap();map[roomId]=!map[roomId];MiniTalk.Persistence.set(favoriteKey(),map);return map[roomId]}
  function createRoomDialog(){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"});body.innerHTML='<label class="field">대화방 이름<input id="newRoomName" maxlength="40" placeholder="예: 우리 반 수다방"></label><label class="field">비밀번호 (선택)<input id="newRoomPassword" type="password" minlength="4" maxlength="32" autocomplete="new-password" placeholder="비워두면 공개방"></label><p class="muted modal-note">비밀번호를 설정하면 처음 입장하는 사람에게만 입력을 요청합니다.</p><button id="newRoomCreate" type="button" class="button primary">만들기</button>';body.querySelector("#newRoomCreate").onclick=async()=>{const b=body.querySelector("#newRoomCreate");b.disabled=true;try{const room=await MiniTalk.Realtime.createRoom(body.querySelector("#newRoomName").value,body.querySelector("#newRoomPassword").value);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("대화방을 만들었습니다.");setTimeout(()=>openRoom(room.id),30)}catch(e){MiniTalk.UI.Shell.toast(e.message)}finally{b.disabled=false}};MiniTalk.UI.Shell.modal("새 대화방",body);setTimeout(()=>body.querySelector("#newRoomName")?.focus(),30)}
  function renderList(host=MiniTalk.UI.Dom.byId("viewHost")){
    if(!host)return;const D=MiniTalk.UI.Dom,allRooms=Object.values(MiniTalk.Store.get("rooms")||{}).sort((a,b)=>roomMessageTime(b)-roomMessageTime(a)),rooms=allRooms.filter(canViewRoom);
    const view=D.el("section",{class:"view chat-home view-enter","data-filter":"all","data-rooms-ready":roomSnapshotReceived?"1":"0"});
    const top=D.el("div",{class:"chat-home-top"}),searchWrap=D.el("div",{class:"chat-search-wrap"}),search=D.el("input",{class:"search chat-search",placeholder:"대화방이나 메시지 검색","aria-label":"대화방 검색"});searchWrap.append(D.el("span",{class:"search-glyph",text:"⌕","aria-hidden":"true"}),search,D.el("span",{class:"search-hint",text:"검색"}));
    const filters=D.el("div",{class:"chat-filter-tabs","aria-label":"대화 필터"});[["all","전체"],["unread","안읽음"],["favorite","즐겨찾기"],["group","그룹"]].forEach(([mode,label])=>{const button=D.el("button",{class:`chat-filter ${mode==="all"?"active":""}`,type:"button",text:label});button.onclick=()=>{view.dataset.filter=mode;D.all(".chat-filter",filters).forEach(item=>item.classList.toggle("active",item===button));if(mode==="group"){filter(search.value,list,mode,view);MiniTalk.Realtime.startRoomListSubscription?.().then(()=>{if(view.isConnected&&view.dataset.filter==="group")refreshRoomList()}).catch(error=>console.warn("그룹 대화방 목록 갱신 실패",error))}else{MiniTalk.Realtime.stopRoomListSubscription?.();filter(search.value,list,mode,view)}};filters.append(button)});
    /* MOA_CHAT_INTEGRATION_START - 모아 AI 제거 시 aiCount/listItem 관련 블록을 제거. moa-chat.js 상단 참고. */
    const aiCount=MiniTalk.Features.MoaChat?.listItem?1:0;const sectionHead=D.el("div",{class:"conversation-section-head"},[D.el("strong",{text:"최근 대화"}),D.el("span",{class:"conversation-count",text:`${rooms.length+aiCount}`})]);top.append(searchWrap,filters,sectionHead);
    const list=D.el("div",{class:"conversation-list",id:"conversationList"});search.oninput=e=>filter(e.target.value,list,view.dataset.filter,view);
    const moaItem=MiniTalk.Features.MoaChat?.listItem?.();if(moaItem)list.append(moaItem);
    /* MOA_CHAT_INTEGRATION_END */
    allRooms.forEach((room,i)=>{const node=roomItem(room);node.style.setProperty("--stagger",`${Math.min(i,8)*22}ms`);list.append(node)});
    list.append(D.el("div",{class:"empty-state filter-empty hidden","data-filter-empty":"1"},[D.el("span",{text:"●"}),D.el("strong",{text:allRooms.length?"표시할 대화방이 없습니다":"대화방이 없습니다"}),D.el("small",{class:"muted",text:allRooms.length?"그룹 탭에서 참여할 대화방을 찾아보세요.":"오른쪽 위 ＋ 버튼으로 새 대화를 만들 수 있어요."})]));
    view.append(top,list);host.replaceChildren(view);MiniTalk.UI.DragScroll?.bind?.(list);filter("",list,"all",view);markRoomListReady(view)
  }
  function refreshRoomList(){
    const D=MiniTalk.UI.Dom,host=D.byId("viewHost"),view=D.one(".chat-home",host);if(!view){renderList(host);return}
    const list=D.one("#conversationList",view),search=D.one(".chat-search",view);if(!list)return renderList(host);
    view.dataset.roomsReady=roomSnapshotReceived?"1":"0";
    const mode=view.dataset.filter||"all",query=search?.value||"",scrollTop=list.scrollTop,allRooms=Object.values(MiniTalk.Store.get("rooms")||{}).sort((a,b)=>roomMessageTime(b)-roomMessageTime(a)||String(a.id).localeCompare(String(b.id)));
    const nodes=[];
    /* MOA_CHAT_INTEGRATION_START - 모아 AI 제거 시 아래 moaItem 1줄 제거. */
    const moaItem=MiniTalk.Features.MoaChat?.listItem?.();if(moaItem)nodes.push(moaItem);
    /* MOA_CHAT_INTEGRATION_END */
    nodes.push(...allRooms.map(room=>roomItem(room)));nodes.push(D.el("div",{class:"empty-state filter-empty hidden","data-filter-empty":"1"},[D.el("span",{text:"●"}),D.el("strong",{text:allRooms.length?"표시할 대화방이 없습니다":"대화방이 없습니다"}),D.el("small",{class:"muted",text:allRooms.length?"그룹 탭에서 참여할 대화방을 찾아보세요.":"오른쪽 위 ＋ 버튼으로 새 대화를 만들 수 있어요."})]));
    list.replaceChildren(...nodes);filter(query,list,mode,view);list.scrollTop=scrollTop;markRoomListReady(view);
  }
  function roomPreview(room){const D=MiniTalk.UI.Dom,node=D.el("p",{class:"conversation-preview"}),text=String(room?.lastMessage||"");if(text)MiniTalk.Chat.Emoji.appendText(text,node,room?.lastMessageEmoticon||"");else node.textContent="대화를 시작하세요";return node}
  function roomItem(room){const D=MiniTalk.UI.Dom,unread=MiniTalk.Chat.Unread.count(room.id),messageAt=roomMessageTime(room),time=messageAt?new Date(messageAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):"",tone=[...(room.id||"")].reduce((sum,char)=>sum+char.charCodeAt(0),0)%4,node=D.el("button",{class:"conversation-item conversation-enter",type:"button","data-room-id":room.id,"data-tone":String(tone),"data-unread":unread?"1":"0","data-favorite":isFavorite(room.id)?"1":"0","data-member":canViewRoom(room)?"1":"0","data-room-type":room.type||"group","data-has-message":roomHasVisibleActivity(room)?"1":"0"},[
    D.el("div",{class:"avatar-wrap"},[D.el("img",{class:"avatar profile-image",src:roomAvatar(room),alt:`${room.title||"대화방"} 이미지`,onerror:event=>{event.currentTarget.onerror=null;event.currentTarget.src="assets/mascot-avatar.png"}}),room.hasPassword?D.el("span",{class:"room-lock-badge",text:MiniTalk.Realtime.isRoomMember(room)?"🔓":"🔒","aria-label":MiniTalk.Realtime.isRoomMember(room)?"참여 중인 비밀번호방":"잠긴 비밀번호방"}):null]),
    D.el("div",{class:"conversation-main"},[D.el("strong",{class:"conversation-title"},[D.el("span",{text:`${isFavorite(room.id)?"★ ":""}${room.title||room.id}`})]),roomPreview(room)]),
    D.el("div",{class:"conversation-meta"},[D.el("time",{text:time}),unread?D.el("b",{class:"unread",text:String(Math.min(99,unread))}):null])
  ]);let holdTimer=0,holdTriggered=false,startX=0,startY=0;const cancelHold=()=>{clearTimeout(holdTimer);holdTimer=0};node.onpointerdown=event=>{if(event.button!==0)return;holdTriggered=false;startX=event.clientX;startY=event.clientY;holdTimer=setTimeout(()=>{holdTriggered=true;quickRoomActions(room)},620)};node.onpointermove=event=>{if(Math.abs(event.clientX-startX)>10||Math.abs(event.clientY-startY)>10)cancelHold()};node.onpointerup=cancelHold;node.onpointercancel=cancelHold;node.onpointerleave=cancelHold;node.oncontextmenu=event=>{event.preventDefault();cancelHold();quickRoomActions(room)};node.onclick=event=>{if(holdTriggered){event.preventDefault();holdTriggered=false;return}openRoom(room.id)};return node}
  function filter(query,root,mode="all",view=null){const q=query.trim().toLowerCase();let visible=0;MiniTalk.UI.Dom.all(".conversation-item",root).forEach(item=>{const textMatch=item.textContent.toLowerCase().includes(q),member=item.dataset.member==="1",hasMessage=item.dataset.hasMessage==="1",modeMatch=(mode==="all"&&member)||(mode==="unread"&&member&&item.dataset.unread==="1")||(mode==="favorite"&&member&&item.dataset.favorite==="1")||(mode==="group"&&item.dataset.roomType==="group"&&hasMessage);const show=textMatch&&modeMatch;item.classList.toggle("hidden",!show);if(show)visible++});const ready=(view||root?.closest?.(".chat-home"))?.dataset?.roomsReady==="1";MiniTalk.UI.Dom.one("[data-filter-empty]",root)?.classList.toggle("hidden",!ready||visible>0);const count=MiniTalk.UI.Dom.one(".conversation-count",view||root?.parentElement);if(count)count.textContent=String(visible)}
  async function openRoom(roomId,verifiedRoom=null){let room=verifiedRoom||MiniTalk.Store.get("rooms")?.[roomId]||null;if(!room?._detail)room=await MiniTalk.Realtime.getRoom(roomId);if(!room){MiniTalk.UI.Shell.toast("대화방을 찾을 수 없습니다.");return}if(!MiniTalk.Realtime.isRoomMember(room)&&!isAdmin()){if(room.hasPassword){joinRoomDialog(room);return}try{room=await MiniTalk.Realtime.joinRoom(roomId)}catch(e){MiniTalk.UI.Shell.toast(e.message);return}}MiniTalk.Store.set("rooms",{...(MiniTalk.Store.get("rooms")||{}),[roomId]:room});MiniTalk.Store.set("activeRoom",roomId);MiniTalk.Store.set("lastRoom",roomId);MiniTalk.Realtime.stopRoomListSubscription?.();MiniTalk.Chat.Unread.clear(roomId,roomMessageTime(room));applyChatHeader(room.title,roomHeaderActions(roomId),{back:()=>backToList()});renderMessages(roomId);MiniTalk.Realtime.subscribeMessages(roomId).catch(error=>{console.warn("대화내역 구독 시작 실패",error);MiniTalk.UI.Shell.toast("대화내역을 불러오지 못했습니다.")})}
  function quickRoomActions(room){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"}),favorite=D.el("button",{class:"button secondary",type:"button",text:isFavorite(room.id)?"즐겨찾기 해제":"즐겨찾기"});favorite.onclick=()=>{const active=toggleFavorite(room.id);MiniTalk.UI.Shell.closeModal();renderList();MiniTalk.UI.Shell.toast(active?"즐겨찾기에 추가했습니다.":"즐겨찾기에서 해제했습니다.")};body.append(favorite);if(room.id!=="global"&&MiniTalk.Realtime.isRoomMember(room)){const leave=D.el("button",{class:"button room-leave-button",type:"button",text:"대화방 나가기"});leave.onclick=()=>confirmLeaveRoom(room);body.append(leave)}else if(!MiniTalk.Realtime.isRoomMember(room)){const enter=D.el("button",{class:"button primary",type:"button",text:room.hasPassword?"비밀번호 입력 후 참여":"대화방 참여"});enter.onclick=()=>{MiniTalk.UI.Shell.closeModal();openRoom(room.id)};body.append(enter)}MiniTalk.UI.Shell.modal(room.title||"대화방",body)}
  function joinRoomDialog(room){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"});body.innerHTML='<p class="modal-note">이 대화방은 비밀번호로 보호되어 있습니다.</p><label class="field">대화방 비밀번호<input id="roomJoinPassword" type="password" maxlength="32" autocomplete="current-password"></label><button id="roomJoinAction" type="button" class="button primary">입장하기</button>';const action=body.querySelector("#roomJoinAction"),input=body.querySelector("#roomJoinPassword");action.onclick=async()=>{action.disabled=true;try{const joined=await MiniTalk.Realtime.joinRoom(room.id,input.value);MiniTalk.Store.set("rooms",{...(MiniTalk.Store.get("rooms")||{}),[room.id]:joined});MiniTalk.UI.Shell.closeModal();setTimeout(()=>openRoom(room.id,joined),30)}catch(e){MiniTalk.UI.Shell.toast(e.message);input.select()}finally{action.disabled=false}};input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();action.click()}};MiniTalk.UI.Shell.modal(room.title,body);setTimeout(()=>input.focus(),30)}
  function roomMemberList(room){if(room.id==="global")return Object.values(MiniTalk.Store.get("presence")||{}).filter(Boolean);return Object.values(room.members||{}).filter(Boolean)}
  async function openRoomMenu(roomId){const room=await MiniTalk.Realtime.getRoom(roomId);if(!room){MiniTalk.UI.Shell.closeModal();backToList();return}const D=MiniTalk.UI.Dom,user=MiniTalk.Store.get("user"),owner=room.creator===user?.user_id,members=roomMemberList(room),body=D.el("div",{class:"room-menu modal-stack"});
    const summaryAvatar=D.el("img",{class:"room-summary-icon profile-image",src:roomAvatar(room),alt:`${room.title||"대화방"} 프로필`});summaryAvatar.onerror=()=>{summaryAvatar.onerror=null;summaryAvatar.src="assets/mascot-avatar.png"};const summary=D.el("section",{class:"room-summary"},[summaryAvatar,D.el("div",{},[D.el("strong",{text:room.title||room.id}),D.el("small",{class:"muted",text:room.id==="global"?"모든 사용자가 참여하는 기본 대화방":`${members.length}명 · ${room.hasPassword?"비밀번호방":"공개방"}`})])]);body.append(summary);
    const memberBox=D.el("section",{class:"room-section"},[D.el("strong",{class:"room-section-title",text:room.id==="global"?"현재 접속자":"멤버"})]),list=D.el("div",{class:"room-member-list"});
    if(!members.length)list.append(D.el("p",{class:"muted modal-note",text:"표시할 멤버가 없습니다."}));
    members.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)).forEach(member=>{const id=member.user_id||"",isOwner=id===room.creator,profile=MiniTalk.Store.get("profiles")?.[id]||MiniTalk.Store.get("profiles")?.[member.nickname]||{},src=profile.avatar||member.avatar||"",avatar=src?D.el("img",{class:"room-member-avatar profile-image",src,alt:`${member.nickname||id||"사용자"} 프로필`}):D.el("span",{class:"room-member-avatar",text:(member.nickname||id||"?").slice(0,1)});if(src)avatar.onerror=()=>{avatar.onerror=null;avatar.replaceWith(D.el("span",{class:"room-member-avatar",text:(member.nickname||id||"?").slice(0,1)}))};const row=D.el("div",{class:"room-member"},[avatar,D.el("span",{class:"room-member-copy"},[D.el("strong",{text:member.nickname||id||"익명"}),D.el("small",{class:"muted",text:isOwner?"방장":member.online?"접속 중":"멤버"})])]);if(owner&&room.id!=="global"&&id&&id!==user.user_id){const kick=D.el("button",{class:"mini-action danger-lite",type:"button",text:"내보내기"});kick.onclick=()=>confirmRemoveMember(room,id,member.nickname||id);row.append(kick)}list.append(row)});memberBox.append(list);body.append(memberBox);
    if(room.id!=="global"&&(MiniTalk.Realtime.isRoomMember(room)||isAdmin())){const invite=D.el("button",{class:"button secondary compact-button",type:"button",text:"친구 초대"});invite.onclick=()=>inviteRoomDialog(room);body.append(invite)}
    if(owner&&room.id!=="global"){const security=D.el("section",{class:"room-section"});security.innerHTML=`<strong class="room-section-title">비밀번호</strong><label class="field"><input id="roomPasswordEdit" type="password" minlength="4" maxlength="32" autocomplete="new-password" placeholder="${room.hasPassword?"새 비밀번호 또는 빈칸":"4자 이상 입력"}"></label><p class="muted modal-note">${room.hasPassword?"빈칸으로 저장하면 비밀번호가 해제됩니다.":"설정하면 새 멤버가 입장할 때 입력해야 합니다."}</p>`;const save=D.el("button",{class:"button secondary compact-button",type:"button",text:room.hasPassword?"변경 또는 해제":"비밀번호 설정"});save.onclick=async()=>{save.disabled=true;try{await MiniTalk.Realtime.updateRoomPassword(roomId,security.querySelector("#roomPasswordEdit").value);MiniTalk.UI.Shell.toast("비밀번호 설정을 저장했습니다.");await openRoomMenu(roomId)}catch(e){MiniTalk.UI.Shell.toast(e.message)}finally{save.disabled=false}};security.append(save);body.append(security)}
    if(room.id!=="global"){const leaveButton=D.el("button",{class:"button room-leave-button",type:"button",text:"대화방 나가기"});leaveButton.onclick=()=>confirmLeaveRoom(room);body.append(leaveButton)}else body.append(D.el("p",{class:"muted modal-note",text:"전체 대화는 기본 대화방이므로 나가거나 비밀번호를 설정할 수 없습니다."}));
    MiniTalk.UI.Shell.modal("대화방 정보",body)
  }
  function inviteRoomDialog(room){
    const D=MiniTalk.UI.Dom,user=MiniTalk.Store.get("user")||{},members=room.members||{},people=new Map();
    // 가입자 명단 → 프로필 → presence를 합칠 때 presence의 빈 avatar가 이미 찾은 프로필을 덮지 않게 병합합니다.
    const add=value=>{if(!value||typeof value!=="object"||MiniTalk.UserDirectory?.isGuest?.(value))return;const id=String(value.user_id||value.userId||value.uid||"").trim(),nickname=String(value.nickname||value.name||value.username||id).trim();if(!id||id===user.user_id||members[id]||/^guest-/i.test(id))return;const previous=people.get(id)||{},avatar=String(value.avatar||value.profileImage||value.profile_image||value.profileImageUrl||value.avatarUrl||value.photoURL||value.photoUrl||"").trim();people.set(id,{...previous,user_id:id,nickname:previous.nickname||nickname,avatar:avatar||previous.avatar||""})};
    MiniTalk.UserDirectory?.all?.().forEach(add);Object.values(MiniTalk.Store.get("profiles")||{}).forEach(add);Object.values(MiniTalk.Store.get("presence")||{}).forEach(add);
    const body=D.el("div",{class:"modal-stack"}),search=D.el("input",{class:"search",placeholder:"이름 검색","aria-label":"초대할 사용자 검색"}),controls=D.el("div",{class:"admin-target-controls invite-select-controls"}),selectAll=D.el("button",{class:"mini-action",type:"button",text:"전체 선택"}),clearAll=D.el("button",{class:"mini-action",type:"button",text:"선택 해제"}),count=D.el("span",{class:"muted admin-selected-count",text:"0명 선택"}),list=D.el("div",{class:"room-member-list invite-member-list"}),selected=new Set(),candidates=[...people.values()].sort((a,b)=>a.nickname.localeCompare(b.nickname,"ko"));
    controls.append(selectAll,clearAll,count);
    const updateCount=()=>{count.textContent=`${selected.size}명 선택`;clearAll.disabled=!selected.size};
    const renderCandidates=query=>{const q=String(query||"").trim().toLowerCase(),visible=candidates.filter(person=>person.nickname.toLowerCase().includes(q));list.replaceChildren(...visible.map(person=>{const check=D.el("input",{type:"checkbox","aria-label":`${person.nickname} 선택`});check.checked=selected.has(person.user_id);check.onchange=()=>{check.checked?selected.add(person.user_id):selected.delete(person.user_id);updateCount()};let avatar;if(person.avatar){avatar=D.el("img",{class:"room-member-avatar profile-image",src:person.avatar,alt:`${person.nickname} 프로필`});avatar.onerror=()=>{avatar.onerror=null;avatar.replaceWith(D.el("span",{class:"room-member-avatar",text:(person.nickname||"?").slice(0,1)}))}}else avatar=D.el("span",{class:"room-member-avatar",text:(person.nickname||"?").slice(0,1)});return D.el("label",{class:"room-member invite-member-option"},[avatar,D.el("span",{class:"room-member-copy"},[D.el("strong",{text:person.nickname})]),check])}));if(!visible.length)list.append(D.el("p",{class:"muted modal-note",text:"초대할 수 있는 사용자가 없습니다."}));updateCount()};
    search.oninput=()=>renderCandidates(search.value);selectAll.onclick=()=>{candidates.forEach(person=>selected.add(person.user_id));renderCandidates(search.value)};clearAll.onclick=()=>{selected.clear();renderCandidates(search.value)};const action=D.el("button",{class:"button primary",type:"button",text:"선택한 사용자 초대"});action.onclick=async()=>{const targets=candidates.filter(person=>selected.has(person.user_id));action.disabled=true;try{const count=await MiniTalk.Realtime.inviteRoomMembers(room.id,targets);MiniTalk.UI.Shell.toast(`${count}명을 초대했습니다.`);await openRoomMenu(room.id)}catch(error){MiniTalk.UI.Shell.toast(error.message);action.disabled=false}};body.append(search,controls,list,action);renderCandidates("");MiniTalk.UI.Shell.modal("대화방 초대",body);setTimeout(()=>search.focus(),30)
  }
  function confirmRemoveMember(room,memberId,name){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"},[D.el("p",{text:`${name}님을 대화방에서 내보낼까요?`}),D.el("p",{class:"muted modal-note",text:"비밀번호방이라면 다시 입장하려면 비밀번호가 필요합니다."})]),row=D.el("div",{class:"button-row"}),cancel=D.el("button",{class:"button secondary",type:"button",text:"취소"}),remove=D.el("button",{class:"button room-leave-button",type:"button",text:"내보내기"});cancel.onclick=()=>openRoomMenu(room.id);remove.onclick=async()=>{remove.disabled=true;try{await MiniTalk.Realtime.removeRoomMember(room.id,memberId);MiniTalk.UI.Shell.toast("멤버를 내보냈습니다.");await openRoomMenu(room.id)}catch(e){MiniTalk.UI.Shell.toast(e.message);remove.disabled=false}};row.append(cancel,remove);body.append(row);MiniTalk.UI.Shell.modal("멤버 내보내기",body)}
  function confirmLeaveRoom(room){const D=MiniTalk.UI.Dom,isOwner=room.creator===MiniTalk.Store.get("user")?.user_id,count=Object.keys(room.members||{}).length,body=D.el("div",{class:"modal-stack"},[D.el("p",{text:`${room.title}에서 나갈까요?`}),D.el("p",{class:"muted modal-note",text:isOwner?(count>1?"가장 먼저 참여한 멤버에게 방장이 자동으로 넘어갑니다.":"남은 멤버가 없어 대화방과 메시지가 삭제됩니다."):"다시 참여하려면 대화방에 재입장해야 합니다."})]),row=D.el("div",{class:"button-row"}),cancel=D.el("button",{class:"button secondary",type:"button",text:"취소"}),leaveButton=D.el("button",{class:"button room-leave-button",type:"button",text:"나가기"});cancel.onclick=()=>openRoomMenu(room.id);leaveButton.onclick=async()=>{leaveButton.disabled=true;MiniTalk.Store.set("activeRoom",null);try{const result=await MiniTalk.Realtime.leaveRoom(room.id);MiniTalk.UI.Shell.closeModal();MiniTalk.Realtime.unsubscribeMessages?.();backToList();MiniTalk.UI.Shell.toast(result.deleted?"대화방을 삭제했습니다.":"대화방에서 나왔습니다.")}catch(e){MiniTalk.Store.set("activeRoom",room.id);MiniTalk.UI.Shell.toast(e.message);leaveButton.disabled=false}};row.append(cancel,leaveButton);body.append(row);MiniTalk.UI.Shell.modal("대화방 나가기",body)}
  function backToList(){MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();applyChatHeader(homeTitle(),headerListActions(),{back:null});renderList()}
  function renderMessages(roomId){
    const D=MiniTalk.UI.Dom,host=D.byId("viewHost");if(!host)return;MiniTalk.Features.Settings?.applyChatBackground?.();
    const existing=D.one(".chat-room",host),sameRoom=existing?.getAttribute?.("data-room-id")===String(roomId),existingList=sameRoom?existing.querySelector?.("#messageList"):null;
    if(existingList){refreshMessageList(roomId,existingList);return}
    const view=D.el("section",{class:"view chat-room view-enter","data-room-id":roomId}),list=D.el("div",{class:"message-list",id:"messageList"});
    fillMessageList(roomId,list,true);
    // 대화방은 기존의 보이는 스크롤바/휠/모바일 터치를 유지하면서 PC/PiP에서
    // 메시지 영역을 잡아 위아래로 끌어도 스크롤되게 합니다.
    // keepScrollbar는 thumb/track 직접 조작을 커스텀 드래그가 가로채지 않게 합니다.
    MiniTalk.UI.DragScroll?.bind?.(list,{keepScrollbar:true});
    list.addEventListener("scroll",()=>{if(list.scrollTop<=72)loadOlderMessages(roomId,list).catch(error=>console.warn("이전 대화 불러오기 실패",error))},{passive:true});
    const composer=buildComposer(roomId);view.append(list,composer.root);host.replaceChildren(view);scrollToLatest(list)
  }
  function scrollToLatest(list){if(!list)return;list.scrollTop=list.scrollHeight;requestAnimationFrame(()=>{if(list.isConnected)list.scrollTop=list.scrollHeight})}
  async function loadOlderMessages(roomId,list){
    const state=olderStateByRoom[roomId]||(olderStateByRoom[roomId]={loading:false,hasMore:true});if(state.loading||state.hasMore===false||!list?.isConnected)return;
    const sorted=[...(messagesByRoom[roomId]||[])].sort((a,b)=>(Number(a.ts)||Number(a.clientTs)||0)-(Number(b.ts)||Number(b.clientTs)||0)||String(a.id||"").localeCompare(String(b.id||"")));if(!sorted.length)return;
    const oldest=sorted[0],beforeTs=Number(oldest.ts)||Number(oldest.clientTs)||0;if(!beforeTs)return;state.loading=true;
    const oldHeight=list.scrollHeight,oldTop=list.scrollTop;
    try{
      const result=await MiniTalk.Realtime.loadOlderMessages?.(roomId,beforeTs,oldest.id)||{messages:[],hasMore:false},incoming=Array.isArray(result.messages)?result.messages:[],current=messagesByRoom[roomId]||(messagesByRoom[roomId]=[]),known=new Set(current.map(message=>String(message.id||"")));
      incoming.forEach(message=>{if(message?.id&&!known.has(String(message.id))){known.add(String(message.id));current.push(message)}});state.hasMore=result.hasMore!==false;
      if(incoming.length){fillMessageList(roomId,list,false);requestAnimationFrame(()=>{if(list.isConnected)list.scrollTop=Math.max(0,list.scrollHeight-oldHeight+oldTop)})}
    }finally{state.loading=false}
  }
  function refreshMessageList(roomId,list){
    const distance=Math.max(0,list.scrollHeight-list.scrollTop-list.clientHeight),stickToBottom=distance<72,previousTop=list.scrollTop;
    fillMessageList(roomId,list,false);
    requestAnimationFrame(()=>{if(stickToBottom)scrollToLatest(list);else list.scrollTop=Math.min(previousTop,Math.max(0,list.scrollHeight-list.clientHeight))})
  }
  function fillMessageList(roomId,list,initial){
    const sorted=[...(messagesByRoom[roomId]||[])].sort((a,b)=>(Number(a.ts)||Number(a.clientTs)||0)-(Number(b.ts)||Number(b.clientTs)||0)||String(a.id||"").localeCompare(String(b.id||""))),seen=renderedMessageIds[roomId]||(renderedMessageIds[roomId]=new Set());
    // Prime the complete game timeline before deciding which historical game rows are visible.
    // Without this first pass, a fresh chat render can briefly show invite/start/terminal cards together
    // because earlier rows do not yet know that a later message already ended the same game.
    sorted.forEach(message=>{if(message?.type==="game")MiniTalk.Chat.RoomGames?.ingest?.(message)});
    const nodes=sorted.map((message,i)=>{const n=messageNode(message),key=String(message.id||`${message.user_id||""}:${message.ts||0}:${i}`),fresh=!seen.has(key);if(fresh&&(initial?i>=Math.max(0,sorted.length-4):true))n.classList.add("message-enter");seen.add(key);return n});
    list.replaceChildren(...nodes)
  }
  function buildComposer(roomId){
    const D=MiniTalk.UI.Dom;let menuOpen=false,emojiOpen=false;
    const root=D.el("section",{class:"composer-zone"});
    if(MiniTalk.Store.get("user")?.isGuest){root.append(D.el("div",{class:"guest-readonly-composer",role:"status",text:"게스트는 대화를 볼 수만 있어요."}));return{root,input:null}}
    const voiceStatus=D.el("div",{class:"voice-status","aria-live":"polite"});
    const tray=D.el("div",{class:"attach-tray hidden"});
    const emojiPanel=D.el("div",{class:"emoji-panel hidden"});
    MiniTalk.Chat.Emoji.list().forEach(info=>{const b=D.el("button",{type:"button",class:"emoji-item","aria-label":info.fallback||info.code});b.append(D.el("img",{src:info.src,alt:info.fallback||info.code,loading:"lazy"}));b.onclick=async()=>{await sendPayload(roomId,{text:info.fallback||info.token,type:"text",emoticon:info.fallback?info.code:null});emojiPanel.classList.add("hidden");emojiOpen=false};emojiPanel.append(b)});
    const form=D.el("form",{class:"composer"}),plus=D.el("button",{class:"composer-icon composer-attach-button",type:"button",text:"＋","aria-label":"첨부 메뉴"}),input=D.el("input",{id:"msgInput",placeholder:"메시지 입력",maxlength:"500","aria-label":"메시지 입력",autocomplete:"off"}),emoji=D.el("button",{class:"composer-icon emoji-toggle",type:"button",text:"☺","aria-label":"이모티콘"}),send=D.el("button",{id:"msgSendBtn",class:"send",type:"submit",text:"➤","aria-label":"전송 - 길게 누르면 음성 입력"});
    const addAction=(icon,label,fn)=>{const b=D.el("button",{type:"button",class:"attach-action"},[D.el("span",{text:icon}),D.el("small",{text:label})]);b.onclick=async()=>{tray.classList.add("hidden");menuOpen=false;try{await fn()}catch(e){if(e?.message&&!/취소/.test(e.message))MiniTalk.UI.Shell.toast(e.message)}};tray.append(b)};
    addAction("▧","사진",async()=>{const payload=await MiniTalk.Chat.Attachments.image({camera:false});if(payload)await sendPayload(roomId,payload)});
    addAction("◉","카메라",async()=>{const payload=await MiniTalk.Chat.Attachments.image({camera:true});if(payload)await sendPayload(roomId,payload)});
    addAction("⌁","파일",async()=>{const payload=await MiniTalk.Chat.Attachments.file();if(payload)await sendPayload(roomId,payload)});
    addAction("▣","캡처",async()=>MiniTalk.Tools.Capture.captureAndSend(roomId));
    addAction("♟","게임",async()=>MiniTalk.Chat.RoomGames.open(roomId));
    plus.onclick=()=>{menuOpen=!menuOpen;tray.classList.toggle("hidden",!menuOpen);emojiPanel.classList.add("hidden");emojiOpen=false;plus.classList.toggle("active",menuOpen)};
    emoji.onclick=()=>{emojiOpen=!emojiOpen;emojiPanel.classList.toggle("hidden",!emojiOpen);tray.classList.add("hidden");menuOpen=false;plus.classList.remove("active")};
    const submitText=async text=>{const clean=String(text||"").trim();if(!clean)return;await sendPayload(roomId,{text:clean,type:"text"})};
    form.onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;send.disabled=true;try{await submitText(text);input.value=""}catch(error){MiniTalk.UI.Shell.toast(error.message)}finally{send.disabled=false;input.focus()}};
    MiniTalk.Chat.Voice.bind(send,input,async text=>{try{await submitText(text)}catch(e){MiniTalk.UI.Shell.toast(e.message);throw e}},voiceStatus);
    form.append(plus,input,emoji,send);root.append(voiceStatus,tray,emojiPanel,form);return{root,input}
  }
  async function sendPayload(roomId,payload){await MiniTalk.Realtime.sendMessage(roomId,payload)}
  function messageNode(message){
    const D=MiniTalk.UI.Dom,current=MiniTalk.Store.get("user")||{},mine=message.user_id===current.user_id||(!message.user_id&&message.nickname&&message.nickname===current.nickname),row=D.el("article",{class:`message-row ${mine?"mine":""}`}),profile=profileForMessage(message);
    if(!mine){const avatar=D.el("img",{class:"message-avatar profile-image",src:profile.avatar||"assets/mascot-avatar.png",alt:`${message.nickname||"사용자"} 프로필`});avatar.onerror=()=>{avatar.onerror=null;avatar.src="assets/mascot-avatar.png"};avatar.setAttribute("role","button");avatar.tabIndex=0;avatar.setAttribute("data-no-drag-scroll","");avatar.onclick=event=>{event.preventDefault();event.stopPropagation();openUserProfile(message,profile)};avatar.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openUserProfile(message,profile)}};row.append(avatar)}
    if(message.type==="game"&&MiniTalk.Chat.RoomGames?.isInternal?.(message))row.classList.add("hidden");
    const content=D.el("div",{class:"message-content"});if(!mine)content.append(D.el("small",{class:"sender-name",text:message.nickname||"익명"}));
    const bubble=D.el("div",{class:"bubble"});const type=message.type||(message.fileUrl?"file":(message.image||message.imageUrl?"image":"text"));
    if(type==="game"){
      const gameNode=MiniTalk.Chat.RoomGames?.renderMessage?.(message,message.roomId);if(gameNode){bubble.classList.add("game-bubble");bubble.append(gameNode)}else bubble.textContent=message.text||"[대화방 게임]";
    }else if(type==="image"){
      const src=message.imageUrl||message.image;if(src){bubble.classList.add("media-bubble");const img=D.el("img",{src,alt:"공유 이미지",loading:"lazy"});img.onerror=()=>{img.replaceWith(D.el("span",{class:"image-load-error",text:"이미지를 불러오지 못했습니다."}))};img.setAttribute("data-no-drag-scroll","");img.onclick=event=>{event.preventDefault();event.stopPropagation();openImage(src)};bubble.append(img)}
    }else if(type==="file"){
      bubble.classList.add("file-bubble");const a=D.el("a",{href:message.fileUrl||"#",target:"_blank",rel:"noopener noreferrer",class:"file-card"},[D.el("span",{text:"⌁"}),D.el("span",{},[D.el("strong",{text:message.fileName||"첨부 파일"}),D.el("small",{text:"파일 열기"})])]);bubble.append(a)
    }else{
      const rawText=message.text||"",preview=!message.emoticon?MiniTalk.Chat.Linkify.preview(rawText,D.doc()):null,shownText=preview?MiniTalk.Chat.Linkify.displayText(rawText):rawText;
      if(MiniTalk.Chat.Emoji.isOnlyCustom(shownText,message.emoticon)||MiniTalk.Chat.Emoji.isOnlyUnicode(shownText))bubble.classList.add("emoji-only");
      if(shownText)MiniTalk.Chat.Emoji.appendText(shownText,bubble,message.emoticon);
      if(shownText)MiniTalk.Chat.Linkify.enhance(bubble);
      if(preview){if(!shownText)bubble.classList.add("preview-only");bubble.append(preview)}
    }
    const meta=D.el("time",{class:"message-time",text:message.ts?new Date(message.ts).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):""});content.append(D.el("div",{class:"bubble-line"},mine?[meta,bubble]:[bubble,meta]));row.append(content);return row
  }
  function openImage(src){const D=MiniTalk.UI.Dom,wrap=D.el("div",{class:"image-viewer"}),img=D.el("img",{src,alt:"이미지 크게 보기"});wrap.append(img);wrap.onclick=()=>wrap.remove();D.doc().body.append(wrap)}
  function openUserProfile(message,profile){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"profile-viewer"}),avatar=D.el("img",{class:"profile-viewer-avatar",src:profile?.avatar||"assets/mascot-avatar.png",alt:"프로필"});avatar.onerror=()=>{avatar.onerror=null;avatar.src="assets/mascot-avatar.png"};body.append(avatar,D.el("strong",{class:"profile-viewer-name",text:message.nickname||"익명"}),D.el("p",{class:"muted profile-viewer-status",text:profile?.statusMsg||"상태메시지가 없습니다."}));MiniTalk.UI.Shell.modal("프로필",body,{hostClass:"profile-modal-host",modalClass:"profile-modal"})}
  function leave(){MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();MiniTalk.Realtime.stopRoomListSubscription?.();MiniTalk.Chat.QR.stop?.();if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0}}
  bindEvents();return{id:"chats",title:"대화",icon:"◉",render,leave,waitForRoomList};
})();
MiniTalk.Registry.register(MiniTalk.Features.Chats);
