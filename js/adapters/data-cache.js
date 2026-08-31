/* ============================================================
   기기 데이터 캐시 (IndexedDB)
   - Firebase의 큰/반복 데이터를 기기에 보관해 재다운로드를 줄입니다.
   - 기능 모듈은 IndexedDB를 직접 다루지 않고 이 모듈만 사용합니다.
   - 30일 미사용 데이터 자동 정리 + 채팅 방별 최대 100건 유지.
   ============================================================ */
MiniTalk.DataCache=(()=>{
  const DB_NAME="moaru-device-cache",DB_VERSION=1,STORE="entries";
  const MAX_AGE=30*24*60*60*1000,CLEAN_INTERVAL=24*60*60*1000,CHAT_MAX=100;
  let dbPromise=null,disabled=false,memory=new Map();
  const id=(type,key)=>`${type}:${String(key)}`;
  const now=()=>Date.now();

  function open(){
    if(disabled||typeof indexedDB==="undefined")return Promise.resolve(null);
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(resolve=>{
      let request;
      try{request=indexedDB.open(DB_NAME,DB_VERSION)}catch{disabled=true;resolve(null);return}
      request.onupgradeneeded=()=>{
        const db=request.result,store=db.objectStoreNames.contains(STORE)?request.transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:"id"});
        if(!store.indexNames.contains("type"))store.createIndex("type","type",{unique:false});
        if(!store.indexNames.contains("lastAccessedAt"))store.createIndex("lastAccessedAt","lastAccessedAt",{unique:false});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{console.warn("기기 데이터 캐시를 열지 못했습니다.",request.error);disabled=true;resolve(null)};
      request.onblocked=()=>console.warn("기기 데이터 캐시 업그레이드가 다른 탭에 의해 지연되고 있습니다.");
    });
    return dbPromise
  }

  async function transact(mode,work){
    const db=await open();if(!db)return work(null);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;
      try{result=work(store,tx)}catch(error){reject(error);return}
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||new Error("기기 캐시 처리 실패"));
      tx.onabort=()=>reject(tx.error||new Error("기기 캐시 처리가 취소되었습니다."));
    }).catch(error=>{console.warn("기기 데이터 캐시 처리 실패",error);return null})
  }

  function requestValue(request,fallback=null){return new Promise(resolve=>{request.onsuccess=()=>resolve(request.result??fallback);request.onerror=()=>resolve(fallback)})}

  async function get(type,key,fallback=null){
    const cacheId=id(type,key);
    if(disabled)return memory.get(cacheId)?.value??fallback;
    const db=await open();if(!db)return memory.get(cacheId)?.value??fallback;
    const record=await new Promise(resolve=>{const tx=db.transaction(STORE,"readonly"),req=tx.objectStore(STORE).get(cacheId);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null)});
    if(!record)return fallback;
    touch(type,key).catch(()=>{});return record.value??fallback
  }

  async function put(type,key,value,options={}){
    const record={id:id(type,key),type:String(type),key:String(key),value,savedAt:now(),lastAccessedAt:now(),sortAt:Number(options.sortAt)||0};
    memory.set(record.id,record);
    if(disabled)return value;
    await transact("readwrite",store=>{store?.put(record)});return value
  }

  async function remove(type,key){
    const cacheId=id(type,key);memory.delete(cacheId);
    if(disabled)return true;
    await transact("readwrite",store=>{store?.delete(cacheId)});return true
  }

  async function list(type,{prefix="",touchRecords=true}={}){
    const db=await open();
    let rows=[];
    if(!db)rows=[...memory.values()].filter(row=>row.type===type&&(!prefix||row.key.startsWith(prefix)));
    else rows=await new Promise(resolve=>{const tx=db.transaction(STORE,"readonly"),index=tx.objectStore(STORE).index("type"),req=index.getAll(IDBKeyRange.only(String(type)));req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([])});
    if(prefix)rows=rows.filter(row=>String(row.key).startsWith(prefix));
    if(touchRecords&&rows.length){const at=now();rows.forEach(row=>{row.lastAccessedAt=at;memory.set(row.id,row)});if(db)transact("readwrite",store=>rows.forEach(row=>store?.put(row))).catch(()=>{})}
    return rows
  }

  async function touch(type,key){
    const cacheId=id(type,key),db=await open();
    if(!db){const row=memory.get(cacheId);if(row)row.lastAccessedAt=now();return}
    const row=await new Promise(resolve=>{const tx=db.transaction(STORE,"readonly"),req=tx.objectStore(STORE).get(cacheId);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null)});if(!row)return;
    row.lastAccessedAt=now();memory.set(cacheId,row);await transact("readwrite",store=>store?.put(row))
  }

  const metaKey=key=>String(key);
  const getMeta=(key,fallback=null)=>get("meta",metaKey(key),fallback);
  const setMeta=(key,value)=>put("meta",metaKey(key),value);

  async function getMessages(roomId,limit=CHAT_MAX){
    const prefix=`${String(roomId)}|`,rows=await list("chat-message",{prefix}),count=Math.max(1,Math.min(CHAT_MAX,Number(limit)||CHAT_MAX));
    return rows.sort((a,b)=>(Number(a.sortAt)||0)-(Number(b.sortAt)||0)||String(a.key).localeCompare(String(b.key))).map(row=>row.value).filter(Boolean).slice(-count)
  }
  async function getMessagesBefore(roomId,beforeTs,beforeId="",limit=25){
    const prefix=`${String(roomId)}|`,cutoff=Number(beforeTs)||Number.MAX_SAFE_INTEGER,cursorId=String(beforeId||""),count=Math.max(1,Math.min(CHAT_MAX,Number(limit)||25)),rows=await list("chat-message",{prefix});
    const messageId=row=>String(row.value?.id||String(row.key).slice(prefix.length));
    return rows.filter(row=>{const ts=Number(row.sortAt)||0;return ts<cutoff||(ts===cutoff&&cursorId&&messageId(row)<cursorId)}).sort((a,b)=>(Number(a.sortAt)||0)-(Number(b.sortAt)||0)||messageId(a).localeCompare(messageId(b))).slice(-count).map(row=>row.value).filter(Boolean)
  }

  async function putMessage(roomId,message){
    if(!message?.id)return;
    const room=String(roomId),key=`${room}|${message.id}`,sortAt=Number(message.ts)||Number(message.clientTs)||now();
    await put("chat-message",key,{...message,roomId:message.roomId||room},{sortAt});
    const rows=await list("chat-message",{prefix:`${room}|`,touchRecords:false});
    if(rows.length>CHAT_MAX){rows.sort((a,b)=>(Number(a.sortAt)||0)-(Number(b.sortAt)||0));await Promise.all(rows.slice(0,rows.length-CHAT_MAX).map(row=>remove("chat-message",row.key)))}
  }

  async function removeMessage(roomId,messageId){const room=String(roomId),mid=String(messageId||"");if(!mid)return false;await remove("chat-message",`${room}|${mid}`);return true}

  async function removeMessageRoom(roomId){const rows=await list("chat-message",{prefix:`${String(roomId)}|`,touchRecords:false});await Promise.all(rows.map(row=>remove("chat-message",row.key)))}

  async function cleanup({force=false}={}){
    const last=Number(await getMeta("maintenance.last",0))||0;if(!force&&now()-last<CLEAN_INTERVAL)return false;
    const cutoff=now()-MAX_AGE,db=await open();
    if(db){
      const rows=await new Promise(resolve=>{const tx=db.transaction(STORE,"readonly"),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([])});
      const stale=rows.filter(row=>row.type!=="meta"&&Number(row.lastAccessedAt||row.savedAt||0)<cutoff);
      if(stale.length)await transact("readwrite",store=>stale.forEach(row=>store?.delete(row.id)));
    }else for(const [key,row] of memory)if(row.type!=="meta"&&Number(row.lastAccessedAt||row.savedAt||0)<cutoff)memory.delete(key);
    await setMeta("maintenance.last",now());return true
  }

  function start(){cleanup().catch(error=>console.warn("기기 캐시 정리 실패",error))}

  return{get,put,remove,list,touch,getMeta,setMeta,getMessages,getMessagesBefore,putMessage,removeMessage,removeMessageRoom,cleanup,start,MAX_AGE,CHAT_MAX};
})();
