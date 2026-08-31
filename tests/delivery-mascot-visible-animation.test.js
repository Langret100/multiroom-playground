const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'css/features/shopping-store.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('shopping-store.css?v=64.5.18'),'shopping CSS cache version stale');
ok(css.includes('left:50%')&&css.includes('margin-left:-44px'),'delivery mascot does not start centered');
ok(!css.includes('.delivery-order-mascot{position:absolute;left:-82px'),'old offscreen mascot start remains');
ok(css.includes('42%{transform:translateX(0)')&&css.includes('opacity:1'),'mascot is not held visibly before running');
ok(css.includes('100%{transform:translateX(172px)')&&css.includes('opacity:0'),'mascot exit animation missing');
console.log('DELIVERY_MASCOT_VISIBLE_ANIMATION_OK');
