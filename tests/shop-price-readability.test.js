const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const css=fs.readFileSync(path.join(root,'css/features/shopping-store.css'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(/\.shop-price\s*\{[^}]*font-size:\s*12px/.test(css),'desktop shop price is still too small');
ok(/@media[\s\S]*\.shop-price\s*\{[^}]*font-size:\s*11px/.test(css),'small-screen shop price is still too small');
ok(html.includes('shopping-store.css?v=64.5.18'),'shop price cache ref stale');
console.log('SHOP_PRICE_READABILITY_OK');
