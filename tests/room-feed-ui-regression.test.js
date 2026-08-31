const fs=require("fs");
function read(p){return fs.readFileSync(p,"utf8")}
function ok(v,m){if(!v)throw new Error(m)}
const rt=read("js/adapters/realtime.js"),feed=read("js/features/feed.js"),css=read("css/features/feed-classinfo-weekly.css"),html=read("index.html"),sw=read("sw.js"),app=read("js/app.js");
const finishPos=rt.indexOf('finishTransportInit(generation,nextMode);');
const initialPos=rt.indexOf('if(mode==="firebase")roomIndexReady=prepareRoomIndexes()');
const startFirebase=rt.slice(rt.indexOf('function startFirebase(){'),rt.indexOf('async function startLocal(){'));
ok(finishPos>=0&&initialPos>finishPos,'initial member rooms must load after transport mode is finalized');
ok(!startFirebase.includes('prepareRoomIndexes()'),'startFirebase must not trigger room index work while transport is initializing');
ok(feed.includes('class:"view feed-shell"')&&feed.includes('class:"feed-view"'),'feed shell and scroll area must be separate');
ok(feed.includes('shell.append(scroller)')&&feed.includes('shell.append(D.el("button",{class:"feed-fab"'),'feed FAB must be outside the scroll area');
ok(css.includes('.feed-shell{height:100%;min-height:0;position:relative;overflow:hidden}'),'feed shell positioning missing');
ok(css.includes('.feed-fab{position:absolute;'),'feed FAB must anchor to non-scrolling shell');
ok(!css.includes('.feed-fab{position:fixed;'),'fixed FAB inside animated feed view must not return');
ok(html.includes('feed-classinfo-weekly.css?v=65.0.31')&&html.includes('realtime.js?v=64.5.47')&&html.includes('features/feed.js?v=65.0.21')&&html.includes('app.js?v=64.5.46'),'room/feed cache versions stale');
ok(sw.includes('moaru-moa-dialogue-fusion-final')&&app.includes('sw.js?v=64.5.60'),'service worker cache version stale');
console.log('ROOM_FEED_UI_REGRESSION_OK');
