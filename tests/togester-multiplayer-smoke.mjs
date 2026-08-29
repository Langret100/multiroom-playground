import assert from 'node:assert/strict';

const HTTP = process.env.TG_HTTP || 'http://127.0.0.1:3000';
const WS = HTTP.replace(/^http/, 'ws');
const delay = ms => new Promise(r => setTimeout(r, ms));

const created = await fetch(`${HTTP}/api/rooms`, {
  method:'POST', headers:{'content-type':'application/json'},
  body:JSON.stringify({title:'TG smoke', mode:'togester', maxPlayers:4})
}).then(r => r.json());
assert.ok(created.roomId, 'room creation failed');

function client(uid, nick){
  const ws = new WebSocket(`${WS}/ws/room/${encodeURIComponent(created.roomId)}`);
  const log=[];
  ws.addEventListener('message', e => { try{ log.push(JSON.parse(e.data)); }catch{} });
  return {uid,nick,ws,log,send:(t,d={})=>ws.send(JSON.stringify({t,d}))};
}
async function waitOpen(c){
  if(c.ws.readyState===1)return;
  await new Promise((resolve,reject)=>{c.ws.addEventListener('open',resolve,{once:true});c.ws.addEventListener('error',reject,{once:true});});
}
async function waitMsg(c,type,pred=()=>true,timeout=4000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const hit=c.log.find(m=>m.t===type&&pred(m.d||{}));if(hit)return hit.d;await delay(20);}
  throw new Error(`${c.uid} timed out waiting for ${type}; got ${c.log.map(x=>x.t).join(',')}`);
}

const a=client('tg-a','A'), b=client('tg-b','B');
await Promise.all([waitOpen(a),waitOpen(b)]);
a.send('hello_room',{uid:a.uid,nick:a.nick}); b.send('hello_room',{uid:b.uid,nick:b.nick});
await Promise.all([waitMsg(a,'hello_ok'),waitMsg(b,'hello_ok')]);
a.send('ready',{v:true}); b.send('ready',{v:true}); await delay(100); a.send('start',{});
await Promise.all([waitMsg(a,'started'),waitMsg(b,'started')]);

a.send('tg_state',{state:{x:100,y:100,level:1,goalReached:false,isDead:false,name:'A'}});
b.send('tg_state',{state:{x:140,y:100,level:1,goalReached:false,isDead:false,name:'B'}});
await waitMsg(a,'tg_players',d=>d.players?.['tg-a']&&d.players?.['tg-b']);

const item={id:'smoke-item',type:'gun',x:120,y:80,vx:0,vy:0,landed:true};
a.send('tg_item',{action:'spawn',level:1,evt:'spawn-1',item});
await Promise.all([waitMsg(a,'tg_item',d=>d.action==='spawn'),waitMsg(b,'tg_item',d=>d.action==='spawn')]);

// 같은 프레임 줍기 경합: 서버가 정확히 한 명만 승인해야 한다.
a.send('tg_item',{action:'pick',level:1,evt:'pick-a',id:item.id,itemType:'gun',charges:6});
b.send('tg_item',{action:'pick',level:1,evt:'pick-b',id:item.id,itemType:'gun',charges:6});
await delay(180);
const acceptedA=a.log.filter(m=>m.t==='tg_item'&&m.d?.action==='pick'&&m.d?.id===item.id);
const acceptedB=b.log.filter(m=>m.t==='tg_item'&&m.d?.action==='pick'&&m.d?.id===item.id);
assert.equal(acceptedA.length,1,'client A must see one accepted pickup');
assert.equal(acceptedB.length,1,'client B must see one accepted pickup');
assert.equal(acceptedA[0].d.from,acceptedB[0].d.from,'pickup winner must match');

const winner=acceptedA[0].d.from==='tg-a'?a:b;
winner.send('tg_item',{action:'use',level:1,evt:'use-1',id:item.id,itemType:'gun',effect:{kind:'gun',x:120,y:100,tx:200,ty:100,color:'#74b9ff'}});
await Promise.all([waitMsg(a,'tg_item',d=>d.evt==='use-1'),waitMsg(b,'tg_item',d=>d.evt==='use-1')]);
a.send('tg_push',{to:'tg-b',dx:9,dy:-5});
const push=await waitMsg(b,'tg_push',d=>d.to==='tg-b');
assert.equal(push.dx,9); assert.equal(push.dy,-5);

// 두 플레이어의 깃발 도착 상태가 한 스냅샷에 보존되는지 확인.
a.send('tg_state',{state:{x:300,y:50,level:1,goalReached:true,isDead:false,name:'A',heldItem:{type:'missile',charges:1}}});
b.send('tg_state',{state:{x:300,y:50,level:1,goalReached:true,isDead:false,name:'B'}});
const goals=await waitMsg(a,'tg_players',d=>d.players?.['tg-a']?.goalReached&&d.players?.['tg-b']?.goalReached);
assert.equal(goals.players['tg-a'].level,1); assert.equal(goals.players['tg-b'].level,1);
assert.deepEqual(goals.players['tg-a'].heldItem,{type:'missile',charges:1},'held item must be visible to the other player');

a.ws.close(); b.ws.close();
console.log(JSON.stringify({ok:true,roomId:created.roomId,pickupWinner:acceptedA[0].d.from,checks:['2 clients','state aggregation','single-winner pickup','item effect relay','push relay','team goal state','remote held-item state']}));
await delay(50);
process.exit(0);
