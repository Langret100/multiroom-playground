import assert from 'node:assert/strict';

const HTTP=process.env.BR_HTTP||'http://127.0.0.1:3000';
const WS=HTTP.replace(/^http/,'ws');
const delay=ms=>new Promise(r=>setTimeout(r,ms));

const created=await fetch(`${HTTP}/api/rooms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'BR smoke',mode:'backrooms3d',maxPlayers:4})}).then(r=>r.json());
assert.ok(created.roomId,'room creation failed');

function client(uid,nick){
  const ws=new WebSocket(`${WS}/ws/room/${encodeURIComponent(created.roomId)}`),log=[];
  ws.addEventListener('message',e=>{try{log.push(JSON.parse(e.data));}catch{}});
  return {uid,nick,ws,log,send:(t,d={})=>ws.send(JSON.stringify({t,d}))};
}
async function open(c){if(c.ws.readyState===1)return;await new Promise((res,rej)=>{c.ws.addEventListener('open',res,{once:true});c.ws.addEventListener('error',rej,{once:true});});}
async function waitMsg(c,type,pred=()=>true,timeout=5000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const hit=c.log.find(m=>m.t===type&&pred(m.d||{}));if(hit)return hit.d;await delay(20);}
  throw new Error(`${c.uid} timeout ${type}; got ${c.log.map(x=>x.t).join(',')}`);
}

const a=client('br-a','A'),b=client('br-b','B');
await Promise.all([open(a),open(b)]);
a.send('hello_room',{uid:a.uid,nick:a.nick});b.send('hello_room',{uid:b.uid,nick:b.nick});
await Promise.all([waitMsg(a,'hello_ok'),waitMsg(b,'hello_ok')]);
a.send('ready',{v:true});b.send('ready',{v:true});await delay(100);a.send('start',{});
const [sa,sb]=await Promise.all([waitMsg(a,'started',d=>d.mode==='backrooms3d'),waitMsg(b,'started',d=>d.mode==='backrooms3d')]);
assert.deepEqual(sa.startPayload,sb.startPayload,'all players must receive one identical start payload');
const start=sa.startPayload,roster=start.roster||[],roles=start.roles||{};
assert.equal(roster.length,2);
assert.ok(start.startId&&Number.isInteger(start.seed));
assert.equal(Object.values(roles).filter(x=>x.role==='monster').length,1,'exactly one monster required');
assert.equal(Object.values(roles).filter(x=>x.role==='rabbit').length,1,'exactly one rabbit required');
assert.ok(roles[start.monsterSid]?.spawn,'monster spawn required');
for(const r of roster)assert.ok(roles[r.sid]?.spawn,`spawn missing for ${r.sid}`);

// Clients may lie or send before role setup; the server must overwrite role from startPayload.
a.send('br_msg',{msg:{kind:'state',seq:1,x:10,y:.05,z:11,yaw:0,vx:1,vz:0,role:'rabbit'}});
b.send('br_msg',{msg:{kind:'state',seq:1,x:20,y:.05,z:21,yaw:0,vx:1,vz:0,role:'monster'}});
const [seenA,seenB]=await Promise.all([
  waitMsg(b,'br_msg',d=>d.msg?.kind==='state'&&d.msg?.from==='br-a'),
  waitMsg(a,'br_msg',d=>d.msg?.kind==='state'&&d.msg?.from==='br-b')
]);
assert.equal(seenA.msg.role,roles['br-a'].role);
assert.equal(seenB.msg.role,roles['br-b'].role);
assert.equal(seenA.msg.x,10);assert.equal(seenB.msg.x,20);

await delay(55);
a.send('br_msg',{msg:{kind:'state',seq:2,x:13,y:.05,z:11,yaw:.2,vx:3,vz:0,role:'rabbit'}});
const moved=await waitMsg(b,'br_msg',d=>d.msg?.kind==='state'&&d.msg?.from==='br-a'&&d.msg?.seq===2);
assert.equal(moved.msg.x,13,'movement update must relay');

// Seat 0/host is the only shared-world authority.
b.send('br_msg',{msg:{kind:'world',ts:1,doorProg:99,marker:'nonhost'}});
await delay(120);
a.send('br_msg',{msg:{kind:'world',ts:2,doorProg:1,marker:'host'}});
const world=await waitMsg(b,'br_msg',d=>d.msg?.kind==='world'&&d.msg?.marker==='host');
assert.equal(world.msg.from,'br-a');
assert.equal(b.log.some(m=>m.t==='br_msg'&&m.d?.msg?.marker==='nonhost'),false,'non-host world update must be rejected');

a.ws.close();b.ws.close();
console.log(JSON.stringify({ok:true,roomId:created.roomId,seed:start.seed,startId:start.startId,monsterSid:start.monsterSid,checks:['identical start','one monster','authoritative spawns','server-owned roles','movement relay','host-only world']}));
await delay(50);
process.exit(0);
