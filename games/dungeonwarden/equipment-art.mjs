export function lanternPose(e,time=0){
 let seed=0;for(const c of String(e.id||''))seed=(seed*31+c.charCodeAt(0))>>>0;
 const phase=time*.95+(seed%628)/100,dx=1.8+Math.cos(phase)*.22,dy=Math.sin(phase)*.18;
 return {x:e.x+dx,y:e.y+dy-2.1+Math.sin(time*2.6+phase)*.12,groundY:e.y+dy,dx,dy,tilt:Math.sin(time*1.8+phase)*.075};
}
export function lanternColor(item){return item?.tier>=3?'#cbb2ff':item?.tier===2?'#9be9da':'#ffdc8b';}
// Names select real atlas pixels, never generated rectangles or polygons.
export function equipmentKey(item,dir='front'){
 const id=item.appearance||item.designId||'',shape=item.visual?.shape,p=item.visual?.profile;
 if(item.type==='shield')return 'shield-'+(id.includes('phoenix')||p==='wing'||p==='feather'?'phoenix':id.includes('crystal')||p==='crystal'||p==='scale'?'crystal':id.includes('moon')||p==='crescent'?'moon':p==='flower'||p==='leaf'?'rose':shape==='pot_lid'?'pot':shape==='wood_shield'?'door':p==='short'||p==='gear'||p==='teeth'?'buckler':'guard');
 if(item.type==='lantern')return 'lamp-'+(id.includes('clock')||p==='gear'?'clock':p==='wrap'?'paper':p==='leaf'||p==='flower'?'leaf':id.includes('oracle')||p==='crystal'?'oracle':id.includes('astral')||item.tier===3?'astral':p==='crescent'||item.tier===2?'moon':item.tier===1?'miner':'camp');
 if(item.kind==='helmet'){const type=shape==='wizard_hat'?(id.includes('captain')?'captain':'hat'):shape==='hood'?'hood':shape==='crown'?'crown':shape==='circlet'?'circlet':shape==='ribbon'?'ribbon':id.includes('turban')?'turban':'helm';return ['circlet','ribbon','captain','turban'].includes(type)?type:type+'-'+dir;}
 return '';
}
