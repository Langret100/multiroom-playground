/* Local practice helpers. No fetch, socket or remote AI service. */
(()=>{'use strict';
 const query=new URLSearchParams(location.search),active=query.get('practice')==='1',difficulty=['low','mid','high'].includes(query.get('cpu'))?query.get('cpu'):'low';
 const presets={low:{reaction:950,mistake:.36,speed:.72,aimError:.55,chatDelay:6500},mid:{reaction:600,mistake:.22,speed:.86,aimError:.32,chatDelay:5000},high:{reaction:350,mistake:.10,speed:.96,aimError:.16,chatDelay:3600}};
 function brain(seed=Date.now()){
  let value=seed>>>0,next=0,hold=false;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  return {random,ready(now=Date.now()){if(now<next)return false;next=now+presets[difficulty].reaction*(.8+random()*.4);hold=random()<presets[difficulty].mistake;return true;},get mistake(){return hold;}};
 }
 const api={active,difficulty,config:presets[difficulty],presets,brain,
  roster(list,self){if(!active)return list;const me=list.find(p=>String(p.sessionId||p.sid)===String(self));return [{...(me||{}),sessionId:self,sid:self,seat:0,isHost:true,nick:me?.nick||'Player'},{sessionId:'solo-ai-1',sid:'solo-ai-1',seat:1,isHost:false,nick:'연습 AI',ai:true}];},
  isBot:sid=>String(sid).startsWith('solo-ai-'),
  allowPacket:type=>!active||type==='bridge_ready'||type==='gesture'||/quit|over|exit|end/.test(type)
 };
 window.SoloAI=api;
 if(active)document.addEventListener('DOMContentLoaded',()=>{const bar=document.createElement('div');bar.id='soloPracticeBadge';bar.style.cssText='position:fixed;right:8px;bottom:6px;z-index:20000;background:#102a43e6;color:#e6f8ff;border:1px solid #70c9dc88;border-radius:10px;padding:5px 8px;font:11px system-ui;display:flex;gap:8px;align-items:center';const label=document.createElement('span');label.textContent='로컬 싱글 · '+({low:'하',mid:'중',high:'상'}[difficulty]);const quit=document.createElement('button');quit.textContent='룸으로';quit.style.cssText='border:0;border-radius:6px;padding:4px 7px;color:#123;background:#c8efff;cursor:pointer';quit.onclick=()=>parent.postMessage({type:'solo_quit'},'*');bar.append(label,quit);document.body.append(bar);});
})();
