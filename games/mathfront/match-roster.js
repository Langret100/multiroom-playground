(function(root){
class MathfrontRoster{
 constructor(){this.slots=[];this.started=false;}
 start(players){if(!Array.isArray(players)||players.length<2||players.length>8||players.length%2)throw Error('온라인 시작 인원은 2·4·6·8명이어야 합니다.');const ids=players.map(p=>String(p.id));if(new Set(ids).size!==ids.length)throw Error('중복 참가자');this.slots=players.map((p,i)=>({id:String(p.id),team:i%2?'red':'blue',ai:false,nick:p.nick||'Player'}));this.started=true;return this.slots;}
 leave(id){const slot=this.slots.find(p=>p.id===String(id));if(!this.started||!slot||slot.ai)return null;slot.ai=true;slot.nick='AI · '+slot.nick;return slot;}
}
root.MathfrontRoster=MathfrontRoster;
})(typeof window==='undefined'?globalThis:window);
