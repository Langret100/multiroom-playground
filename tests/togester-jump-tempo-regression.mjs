import fs from 'node:fs';
const html=fs.readFileSync(new URL('../games/togester/index.html',import.meta.url),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(html.includes('const GRAVITY = 0.18 * PHYS_SCALE'),'gravity tempo/height retune missing');
ok(html.includes('const MAX_FALL_SPEED = 4.40 * PHYS_SCALE'),'fall tempo retune missing');
ok(html.includes('const JUMP_VELOCITY = -6.40 * PHYS_SCALE'),'jump ascent retune missing');
ok(html.includes('const JUMP_HOLD_GRAVITY_MULT = 0.50'),'jump hold gravity retune missing');
function flight(jv,g,holdMult,maxFall){
  let y=0,v=jv,apex=0,apexFrame=0;
  for(let f=0;f<240;f++){
    const gg=(v<0 && f<=15)?g*holdMult:g;
    v+=gg; if(v>maxFall)v=maxFall; y+=v;
    if(y<apex){apex=y;apexFrame=f+1;}
    if(y>=0 && f+1>apexFrame+1)return {apex,apexFrame,total:f+1};
  }
  throw new Error('flight did not land');
}
const original=flight(-6.55,.16,.45,4.15);
const balanced=flight(-6.40,.18,.50,4.40);
const heightRatio=Math.abs(balanced.apex)/Math.abs(original.apex);
// Target: roughly 15% lower, but only a modestly quicker arc -- not a snap jump.
ok(heightRatio>0.83 && heightRatio<0.87,'jump height is not about 15% lower than original tune');
ok(original.apexFrame-balanced.apexFrame>=4 && original.apexFrame-balanced.apexFrame<=8,'ascent changed too little or became too abrupt');
ok(original.total-balanced.total>=12 && original.total-balanced.total<=20,'airtime changed too little or became too abrupt');
console.log('TOGESTER_JUMP_TEMPO_REGRESSION_OK', {original,balanced,heightRatio});
