import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../games/starpaint/index.html', import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../js/pages/room.js', import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

// One authoritative input stream: guests carry action seq on the proven movement snapshot only.
ok(src.includes("parent.postMessage({type:'pb_player',gameId:'starpaint'"),'pb_player action/movement stream missing');
ok(!src.includes("parent.postMessage({type:'pb_input',gameId:'starpaint'"),'guest still emits second pb_input action stream');
ok(src.includes("if(d.type==='pb_input'&&bridge.isHost){return}"),'legacy pb_input is not isolated from host action processing');

// 32-bit action sequence must be monotonic even if relay packets arrive out of order.
const m=src.match(/function seq32Newer\(next,prev\)\{[^}]+\}/);
ok(m,'seq32Newer helper missing');
const ctx={Number};vm.createContext(ctx);vm.runInContext(m[0],ctx);
ok(ctx.seq32Newer(5,4),'new seq not accepted');
ok(!ctx.seq32Newer(4,5),'stale seq accepted');
ok(!ctx.seq32Newer(5,5),'duplicate seq accepted');
ok(ctx.seq32Newer(0,0xffffffff),'wraparound seq not accepted');
ok(src.includes('if(seq32Newer(useSeq,p.lastUseSeq)){p.lastUseSeq=useSeq;useItem(p)}'),'host use gate is not monotonic');
ok(src.includes('if(seq32Newer(inUse,p.input.useSeq)){p.input.useSeq=inUse'),'host snapshot input can regress');

// Local prediction identity survives pre-ACK states and suppresses the matching authoritative replay.
ok(src.includes('p.localVisualHandledUseSeq=seq;p.localVisualHandledUntil=now+1400'),'local use identity not retained through ACK window');
ok(src.includes('handledOwnUse=localMe&&useAck!==0&&useAck===Number(p.localVisualHandledUseSeq||0)'),'authoritative same-use replay guard missing');
ok(src.includes('if(handledOwnUse){p.actionUntil=0;p.actionState=null;p.actionItem=null}'),'authoritative action still replays locally');
ok(src.includes('localPredictedStart=!bridge.isHost')&&src.includes('localVisualHandledUseSeq'),'same-use authoritative start FX still replays');

// Square frame helper must be gone from StarPaint FX: one star-frame primitive for every framed effect.
ok(!src.includes('drawPixelBoxRing'),'square FX frame helper still present');
ok((src.match(/drawPixelStarRing\(/g)||[]).length>=15,'star frame primitive not used across all framed effects');
ok(src.includes("f.type==='punch'")&&src.includes('drawPixelStarRing(x+f.dir*24'),'punch frame is not star-shaped');
ok(src.includes("f.type==='itemuse'")&&src.includes('drawPixelStarRing(x,y,10+k*10'),'item-use frames are not star-shaped');
ok(src.includes("pr.type==='beacon'")&&src.includes("drawPixelStarRing(rx,ry,pulse"),'beacon target frame is not star-shaped');

// Cache must force the cleaned game code, while retaining the existing local return flow.
ok(room.includes('sp-respawn-paint-lifecycle-rootfix'),'StarPaint iframe cache key not advanced');
ok(room.includes('scheduleStarpaintLocalReturn(1950)'),'winner return flow was lost');
console.log('STARPAINT_SINGLE_ACTION_STARFX_REGRESSION_OK');
