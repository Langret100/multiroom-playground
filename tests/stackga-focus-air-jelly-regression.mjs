import fs from 'node:fs';
const root=new URL('..',import.meta.url).pathname;
const read=(p)=>fs.readFileSync(root+p,'utf8');
const main=read('games/stackga/js/main.js');
const game=read('games/stackga/js/game.js');
const room=read('js/pages/room.js');
const lobby=read('js/pages/lobby.js');
const reg=read('js/games/registry.js');
const cssCheck=read('css/styles.css');
function ok(v,m){if(!v)throw new Error(m)}

// Airborne jelly remains one connected body.
ok(game.includes('lastAirMoveAt = Date.now()'),'air move timestamp missing');
ok(game.includes('airSkew') && game.includes('lastAirMoveDir'),'air jelly inertia missing');
ok(game.includes('Airborne tetrominoes are one connected jelly body') && game.includes('ctx.transform(airSx,0,airSkew,airSy,0,0)') && game.includes('sx:1,sy:1'),'airborne piece still deforms per cell');
ok(game.includes('buildCascadeClusterMap') && game.includes('Connected floating chunks should feel like one soft jelly mass'),'post-clear floating cluster grouping missing');

// Root-cause keyboard fix: hidden CPU iframe must never compete for focus.
ok(main.includes('const CPU_EMBED = _query.get("cpu") === "1"'),'CPU embed discriminator missing');
ok(main.includes('if (!CPU_EMBED && ui.cvMe)'),'CPU iframe is still allowed to focus the board');
ok(!main.includes('window.focus()'),'obsolete forced window-focus workaround remains');
ok(!main.includes('focusBoardInput'),'obsolete repeated focus workaround remains');
ok(room.includes('fr.setAttribute("tabindex", "-1")') && room.includes('fr.setAttribute("aria-hidden", "true")'),'hidden CPU iframe focus exclusion missing');
ok(room.includes('? `${src}&cpu=1` : src'),'CPU iframe URL marker missing');
ok(room.includes('focusGameIframeSoon') && room.includes('setTimeout(poke,220)'),'visible player iframe focus recovery lost');
ok(!room.includes('forwardStackgaPhysicalKey') && !main.includes("type:'stackga_key'") && !main.includes("d.type!=='stackga_key'"),'failed Stackga key-proxy workaround still remains');
ok(!lobby.includes("type:'embedded_room_key'"),'failed top-level nested key-proxy workaround remains');
ok(!room.includes('blurGameBlockingInputs'),'failed input-blur workaround still remains');

// White-flash mask must be Stackga-only so other games keep their original iframe path.
ok(room.includes('=== "stackga") setDuelFrameLoading(true, "stackga")'),'Stackga loading mask missing');
ok(!/startCoopEmbed[\s\S]{0,800}setDuelFrameLoading\(true/.test(room),'loading mask leaked into coop games');
ok(cssCheck.includes('.duel-frameWrap[data-game=\"stackga\"].iframe-loading') || cssCheck.includes('.duel-frameWrap[data-game="stackga"].iframe-loading'),'Stackga loading mask CSS is not scoped');
ok(cssCheck.includes('.duel-frameWrap{ width:100%; border-radius:0; overflow:hidden; background:transparent; position:relative; }'),'shared duel frame background changed for other games');
ok(!cssCheck.includes('.duel-frameWrap.iframe-loading .duel-frame'),'generic iframe-loading opacity rule still affects other games');
ok(read('games/stackga/index.html').includes('stackga-critical-bg'),'critical initial background missing');
ok(reg.includes('20260831-cards7'),'card cache bump missing');
console.log('STACKGA_FOCUS_AIR_JELLY_REGRESSION_OK');
