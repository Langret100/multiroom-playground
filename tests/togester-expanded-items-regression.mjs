import fs from 'node:fs';
const tg=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
const must=(c,m)=>{if(!c)throw new Error(m)};
for(const [type,name] of [['hammer','망치'],['spring','스프링부츠'],['ice','빙결탄'],['boomerang','부메랑']]){
  must(tg.includes(`${type}:`) && tg.includes(`name:'${name}'`),`${name} definition missing`);
  must(tg.includes(`type==='${type}'`),`${name} use/SFX branch missing`);
  must(tg.includes(`e.kind==='${type}'`),`${name} visual effect missing`);
}
must(tg.includes("kind:'hammer'"),'hammer hit event missing');
must(tg.includes('PUSH_IMPULSE_X*2'),'hammer 2x push missing');
must(tg.includes("kind:'ice',stunMs:1200"),'ice stun missing');
must(tg.includes('PUSH_IMPULSE_X*1.25'),'boomerang knockback missing');
must(tg.includes('localPlayer.vy=Math.min(localPlayer.vy,-13.5)'),'spring jump boost missing');
must(tg.includes('const itemCount = 5'),'five initial items missing');
must(tg.includes('function _polishLevelGeometry(level)'),'map geometry polish missing');
must(tg.includes('gap>0 && gap<30'),'tiny-gap merge missing');
console.log('TOGESTER_EXPANDED_ITEMS_REGRESSION_OK');
