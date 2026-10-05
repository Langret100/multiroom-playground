import {weaponSkill} from './weapon-skills.mjs';
import {WEAPONS,distance} from './catalog.mjs';
import {lineOfSight} from './world.mjs';
export function actionState(s){
 const me=s?.me;if(!me||me.dead)return {disabled:true,shield:false,interact:null,basic:'fist',special:null};
 const main=me.equipment.main,off=me.equipment.off,shield=off?.type==='shield',w=WEAPONS[off?.type]||WEAPONS[main?.type];
 const near=(a,r)=>a.filter(p=>distance(me,p)<r&&lineOfSight(s.map,me,p)).sort((a,b)=>distance(me,a)-distance(me,b))[0];
 const loot=near(s.loot||[],1.8),chest=near((s.chests||[]).filter(c=>!c.opened),2),spring=s.map.rooms.find(r=>r.heal&&r.id===me.room&&distance(me,{x:r.x+r.w/2,y:r.y+r.h/2})<3.5);
 return {disabled:false,shield,interact:loot?{kind:'loot',id:loot.id}:chest?{kind:'chest',id:chest.id}:spring?{kind:'heal',id:'healing-spring'}:null,basic:main?.type||'fist',special:shield?'shield':weaponSkill(WEAPONS[off?.type]?off:main)?.kind||null};
}
