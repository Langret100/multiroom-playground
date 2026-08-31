const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const api=fs.readFileSync('js/adapters/auth-api.js','utf8');
const admin=fs.readFileSync('js/features/admin.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

// Deleted rooms must not leave cursor garbage in ScriptProperties forever.
const ctx={console,Date,Math,JSON,PropertiesService:{getScriptProperties:()=>({getProperty(){return''},setProperty(){},deleteProperty(){}})}};
vm.createContext(ctx);vm.runInContext(gs,ctx);
const st={__lastRun:1,'r:1:a':10,'r:1:b':20,'g:9':3};
const removed=ctx.moaPruneChatLearnState_(st,[{key:'r:1:b'},{key:'g:9'}]);
ok(removed===1&&!('r:1:a' in st)&&st['r:1:b']===20,'stale learning cursors were not pruned');
console.log('MOA_V6_STALE_CURSOR_PRUNE_OK');

// Room member metadata must be fetched in one header block, not one Spreadsheet call per room.
ok(gs.includes('rooms.getRange(1,2,3,lastCol-1).getValues()'),'room metadata is not batched');
const knownBlock=gs.slice(gs.indexOf('function moaKnownChatNames_'),gs.indexOf('function moaPruneChatLearnState_'));
ok(!/getRange\(3,src\.col\)/.test(knownBlock),'nickname scrub still performs a per-room sheet read');
console.log('MOA_V6_ROOM_METADATA_BATCH_OK');

// Admin learning must not rescan every room after each batch just to compute has_more.
const learnBlock=gs.slice(gs.indexOf('function moaAdminLearnChats_'),gs.indexOf('/** 소통 시트 자동정리'));
ok(learnBlock.includes('hasMore=anyIncomplete||visited<sources.length'),'has_more is not derived from the visited batch');
ok(!/sources\.forEach\(function\(src\)\{var last=moaSourceLastRow_/.test(learnBlock),'admin batch still rescans all room tails');
console.log('MOA_V6_NO_POST_BATCH_ROOM_RESCAN_OK');

// Large room counts use bounded status instead of hundreds of tail probes on admin open.
ok(gs.includes('bounded=sources.length>80')&&admin.includes('r.status_bounded'),'bounded admin learning status is missing');
console.log('MOA_V6_BOUNDED_ADMIN_STATUS_OK');

// Old already-open clients cannot silently ignore delta and still advance their version.
ctx.jsonResponse_=x=>x;ctx.moaLanguagePublishing_=()=>false;ctx.moaCurrentSyncVersion_=()=>9;ctx.moaCurrentCoreSyncVersion_=()=>4;
ctx.moaPublicSnapshot_=()=>({policy:{},expressionWeights:{},patterns:[{id:'full'}]});ctx.moaLanguageDeltaFloor_=()=>1;ctx.moaSetLanguageDeltaFloor_=()=>{};
ctx.moaPublicPolicy_=()=>({});ctx.moaPublicExpressionWeights_=()=>({});ctx.moaPublicExamples_=()=>[];ctx.moaPublicHumanPatternDelta_=()=>({complete:true,patterns:[{id:'delta'}]});
let r=ctx.moaSync_({known_version:8,known_core_version:4});
ok(Array.isArray(r.patterns)&&r.patterns[0].id==='full'&&!r.incremental,'legacy client did not receive full compatibility snapshot');
r=ctx.moaSync_({known_version:8,known_core_version:4,client_caps:'delta-v1'});
ok(r.incremental===true&&r.patternDelta[0].id==='delta','delta-capable client lost incremental sync');
ok(api.includes('client_caps: "delta-v1"'),'new client does not advertise delta support');
console.log('MOA_V6_OLD_CLIENT_DELTA_COMPAT_OK');

// Shared IndexedDB corpus also shares its public language version across account switches.
ok(engine.includes('moa.v93.publicPatternVersion'),'shared public corpus version is not persisted');
ok(engine.includes('(publicKnown||storedKnown)'),'account switch still forces a full language snapshot despite shared corpus');
console.log('MOA_V6_SHARED_PUBLIC_VERSION_OK');

// Header damage must not be silently relabelled into the wrong schema.
ok(gs.includes('MOA_SCHEMA_MISMATCH'),'schema mismatch guard missing');
ok(gs.includes('unexpected.length&&recognized<headers.length'),'partial header corruption can still be silently relabelled');
console.log('MOA_V6_SCHEMA_GUARD_OK');

ok(html.includes('auth-api.js?v=64.5.40')&&html.includes('moa-communication-engine.js?v=50')&&html.includes('admin.js?v=64.5.38'),'V6 browser cache busts missing');
ok(app.includes('sw.js?v=64.5.60')&&html.includes('js/app.js?v=64.5.46')&&sw.includes('moaru-moa-dialogue-fusion-final'),'V6 service worker/app cache chain missing');
console.log('MOA_V6_CACHE_VERSION_OK');
