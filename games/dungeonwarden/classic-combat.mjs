// Compact, continuous 2D RPG effects. Geometry follows the attack direction and
// range; no animation sheets, particle simulation or additional network messages.
const clamp=v=>Math.max(0,Math.min(1,v));
const color=f=>f.feedback?.material==='candy'?'#ff9ccf':f.feedback?.material==='bread'?'#ffd38b':f.feedback?.material==='magic'?'#b9acff':'#8dd9ff';
function crescent(c,r,start,end,width,fill){
 c.fillStyle=fill;c.beginPath();const n=18;
 for(let i=0;i<=n;i++){const a=start+(end-start)*i/n;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
 for(let i=n;i>=0;i--){const a=start+(end-start)*i/n,inner=r-width*Math.sin(Math.PI*i/n);c.lineTo(Math.cos(a)*inner,Math.sin(a)*inner);}
 c.closePath();c.fill();
}
function streak(c,x,y,length,width,fill){c.fillStyle=fill;c.beginPath();c.moveTo(x+length,y);c.lineTo(x,y-width);c.lineTo(x-length*.55,y);c.lineTo(x,y+width);c.closePath();c.fill();}
export const ClassicCombat={
 meteorFall(c,z,time){
  if(z.kind!=='meteor'||z.active||time>=z.at)return false;
  const duration=Math.min(.5,Math.max(.08,z.at-(z.created??z.at-.45))),p=clamp((time-(z.at-duration))/duration);if(time<z.at-duration)return true;
  const x=z.x-(1-p)*2.4,y=z.y-(1-p)*7,size=Math.max(.35,Math.min(.8,z.radius*.30));
  c.save();c.strokeStyle='#ffbb74';c.lineWidth=.055;c.globalAlpha*=.4+p*.4;c.beginPath();c.ellipse(z.x,z.y,z.radius*(.3+p*.12),z.radius*(.12+p*.05),0,0,Math.PI*2);c.stroke();c.restore();
  c.save();c.translate(x,y-.1);c.rotate(Math.atan2(7,2.4));
  for(const [length,width,ink]of [[2.5,size*.65,'#f08046'],[1.8,size*.36,'#ffd993']]){c.fillStyle=ink;c.beginPath();c.moveTo(-size*.25,-width);c.lineTo(-length,0);c.lineTo(-size*.25,width);c.closePath();c.fill();}
  c.fillStyle='#584252';c.beginPath();for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=size*(i%2?.83:1);i?c.lineTo(Math.cos(a)*r,Math.sin(a)*r):c.moveTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();
  c.strokeStyle='#ffd79a';c.lineWidth=.08;c.beginPath();c.arc(0,0,size*.8,-1.25,1.25);c.stroke();c.fillStyle='#bd7954';c.fillRect(-size*.3,-size*.24,size*.4,size*.22);c.restore();return true;
 },
 paint(c,f){
  if(!['slash','spin','slam','hit','shoot','fireball','fire','lightning','thunder','meteor','heal','moonheal','ward','cast','skillCharge','block','dash','pulse','panclang','trap','candyburst','breadrise','poison','acid','vines','entry','equip','chest','death','dust','crescent','bladewave','clockwave','phoenix','frost','beam'].includes(f.kind))return false;
  const p=clamp(1-f.life/Math.max(.001,f.maxLife)),fade=clamp((1-p)/.38),r=Math.max(.3,f.radius||1),tint=color(f);
  if(p>=1)return true;c.save();c.translate(f.x,f.y-.35);c.globalAlpha*=fade;
  if(f.kind==='beam'){
   c.rotate(f.angle||0);const length=f.length||r;c.fillStyle='#67cfff55';c.fillRect(0,-.32,length,.64);c.fillStyle='#8fe9ff';c.fillRect(0,-.15,length,.3);c.fillStyle='#fffbe7';c.fillRect(0,-.045,length,.09);
  }else if(f.kind==='frost'){
   c.strokeStyle='#9beaff';c.lineWidth=.08;c.beginPath();c.ellipse(0,.35,r*(.4+p*.6),r*(.2+p*.3),0,0,Math.PI*2);c.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4,d=r*(.25+p*.65);c.save();c.translate(Math.cos(a)*d,Math.sin(a)*d*.6);c.rotate(a);streak(c,0,0,.3,.12,'#9feaff');streak(c,0,0,.19,.045,'#fffaff');c.restore();}
  }else if(f.kind==='hit'){
   if(!f.dot&&p<.65){c.save();c.rotate((f.angle||0)+Math.PI/4);const burst=(f.heavy?.72:.46)*(1+p*1.8);
    for(let i=0;i<6;i++){c.rotate(Math.PI/3);streak(c,burst*.55,0,burst*.55,.08*(1-p),i%2?tint:'#fffbe6');}c.restore();
    c.fillStyle='#fffde7';c.beginPath();c.arc(0,0,.13*(1-p),0,Math.PI*2);c.fill();
   }
   c.globalAlpha*=clamp((1-p)/.25);c.font=`bold ${f.heavy?1:.76}px sans-serif`;c.textAlign='center';c.lineJoin='round';c.lineWidth=.10;c.strokeStyle='#172033';const y=-1.05-Math.sin(Math.min(1,p*1.4)*Math.PI/2)*.85;
   c.strokeText(String(f.value??''),0,y);c.fillStyle=f.target==='local'?'#ff8d81':f.heavy?'#ffdf78':'#fffbe8';c.fillText(String(f.value??''),0,y);
  }else if(['poison','acid','vines'].includes(f.kind)){
   const ink=f.kind==='poison'?'#b999dc':f.kind==='acid'?'#bce16f':'#99d897';c.strokeStyle=ink;c.lineWidth=.07;
   c.beginPath();c.ellipse(0,.35,r*.8,r*.32,0,0,Math.PI*2);c.stroke();
   for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*r*.65,y=Math.sin(a)*r*.24+.35;c.save();c.translate(x,y-p*.7);if(f.kind==='vines'){c.beginPath();c.moveTo(0,p*.7);c.quadraticCurveTo(.18,-.2,.04,-.7*Math.sin(Math.PI*p));c.stroke();}else{c.rotate(Math.PI/4);c.fillStyle=ink;c.fillRect(-.07,-.07,.14,.14);}c.restore();}
  }else if(f.kind==='breadrise'){
   const rise=Math.sin(Math.PI*Math.min(1,p*1.5)),height=r*2*rise;c.fillStyle='#855329';c.fillRect(-r*.24,.35-height,r*.48,height);c.fillStyle='#f3cd87';c.fillRect(-r*.18,.35-height,r*.36,height);c.fillStyle='#fff1c4';for(let i=0;i<3;i++)c.fillRect(-r*.12,.35-height+i*height/3,r*.24,.06);
   c.strokeStyle='#ddad67';c.lineWidth=.06;c.beginPath();c.ellipse(0,.35,r*(.3+p*.5),r*(.12+p*.16),0,0,Math.PI*2);c.stroke();
  }else if(['entry','equip','chest','death','dust'].includes(f.kind)){
   const ink=f.kind==='death'?'#bd9dc9':f.kind==='dust'?'#baa785':'#f6dda1',count=f.kind==='dust'?4:8;c.fillStyle=ink;
   for(let i=0;i<count;i++){const a=i*Math.PI*2/count,d=(.2+p*.65)*r;c.save();c.translate(Math.cos(a)*d,Math.sin(a)*d*.4+.35-p*.3);c.rotate(Math.PI/4);const size=.08*(1-p);c.fillRect(-size,-size,size*2,size*2);c.restore();}
  }else if(['crescent','bladewave','clockwave','phoenix'].includes(f.kind)){
   c.rotate(f.angle||0);crescent(c,r*.9,-1.1,1.1,.22,'#c1b2ff');crescent(c,r*.87,-1.05,1.05,.10,'#fffde9');
  }else if(f.kind==='lightning'||f.kind==='thunder'){
   const directional=f.kind==='lightning';if(directional)c.rotate(f.angle||0);
   const len=directional?r:4.5;c.lineJoin='miter';
   for(const [width,ink]of [[.25,'#777ce9'],[.10,'#d1e9ff'],[.035,'#fffde9']]){c.lineWidth=width;c.strokeStyle=ink;c.beginPath();for(let i=0;i<=10;i++){const d=len*i/10,zig=i===0||i===10?0:(i%2?1:-1)*.18;i?c.lineTo(directional?d:zig,directional?zig:d-len):c.moveTo(directional?d:zig,directional?zig:d-len);}c.stroke();}
   if(!directional){c.strokeStyle='#dbe8ff';c.lineWidth=.07;c.beginPath();c.ellipse(0,.35,r*(.2+p*.8),r*(.1+p*.3),0,0,Math.PI*2);c.stroke();}
  }else if(f.kind==='meteor'){
   const flash=1-clamp(p/.4);c.fillStyle='#ffb477';
   for(let i=0;i<7;i++){c.save();c.rotate(i*Math.PI*2/7);streak(c,r*(.1+p*.6),0,r*.3*(1-p),.08,'#ffba74');c.restore();}
   c.strokeStyle='#ffc77e';c.lineWidth=.14*(1-p);c.beginPath();c.ellipse(0,.35,r*(.25+p*.75),r*(.1+p*.35),0,0,Math.PI*2);c.stroke();
   c.globalAlpha*=flash;streak(c,0,-.25,r*.6,.38,'#fff2c4');c.rotate(-Math.PI/2);streak(c,.6,0,1.6,.22,'#ffe3a5');
  }else if(['heal','moonheal','ward','cast','skillCharge'].includes(f.kind)){
   const healing=['heal','moonheal','ward'].includes(f.kind),ink=healing?'#9deebc':'#bca8ef';c.strokeStyle=ink;c.lineWidth=.05;c.beginPath();c.ellipse(0,.35,r*(.6+p*.3),r*(.22+p*.14),0,0,Math.PI*2);c.stroke();
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*r*.55,y=Math.sin(a)*r*.22+.3-p*.8;c.fillStyle=ink;if(healing){c.fillRect(x-.13,y-.035,.26,.07);c.fillRect(x-.035,y-.13,.07,.26);}else{c.save();c.translate(x,y);c.rotate(Math.PI/4);c.fillRect(-.055,-.055,.11,.11);c.restore();}}
  }else if(f.kind==='block'){
   c.rotate(f.angle||0);c.strokeStyle='#a6e7ff';c.lineWidth=.12;c.beginPath();c.arc(0,0,.7+p*.3,-.8,.8);c.stroke();streak(c,.6,0,.23,.1,'#fffce9');
  }else if(f.kind==='dash'){
   c.rotate(f.angle||0);c.strokeStyle='#d5efff';c.lineWidth=.035;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-.4-p*1.2,i*.22);c.lineTo(-.1-p*.4,i*.22);c.stroke();}
  }else if(f.kind==='slash'||f.kind==='spin'){
   c.rotate(f.angle||0);
   if(f.weapon==='dagger'){
    const x=r*(.2+Math.min(1,p*3)*.65);streak(c,x,0,r*.32,.18,tint);streak(c,x+.05,0,r*.3,.065,'#fffde8');
   }else{
    const reverse=f.combo===2?-1:1,sweep=f.kind==='spin'?p*Math.PI*2:-1.15+2.3*Math.min(1,p*2.4),end=reverse*sweep,start=end-reverse*(.3+1.25*Math.sin(Math.PI*p));
    const blunt=['mace','hammer'].includes(f.weapon),radius=r*.92;
    crescent(c,radius,start,end,blunt?.13:.30,tint);
    crescent(c,radius-.025,start+.08*reverse,end-.025*reverse,blunt?.06:.15,'#fffde9');
    if(!blunt&&p<.55){c.globalAlpha*=.3;crescent(c,radius-.17,start-.13*reverse,end-.18*reverse,.12,tint);}
   }
  }else if(f.kind==='slam'){
   c.translate(0,.35);const spread=1-Math.pow(1-clamp(p/.65),3),shock=r*(.15+.85*spread);
   const glow=c.createRadialGradient(0,0,0,0,0,r);glow.addColorStop(0,'#ffe4a03a');glow.addColorStop(1,'#ddae6b00');c.fillStyle=glow;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
   c.strokeStyle='#edd39b';c.lineWidth=.14*(1-p)+.025;c.beginPath();c.arc(0,0,shock,0,Math.PI*2);c.stroke();
   c.strokeStyle='#75665b';c.lineWidth=.11;
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7+.17,reach=r*(.66+(i%3)*.09)*Math.min(1,p*6);c.beginPath();c.moveTo(Math.cos(a)*.15,Math.sin(a)*.15);c.lineTo(Math.cos(a+.12)*reach*.48,Math.sin(a+.12)*reach*.48);c.lineTo(Math.cos(a-.06)*reach,Math.sin(a-.06)*reach);c.stroke();}
   for(let i=0;i<12;i++){const a=i*Math.PI/6,d=r*(.2+.70*spread),lift=Math.sin(Math.PI*clamp(p*1.5))*(.35+i%3*.12),size=.09+.035*(i%3);c.save();c.translate(Math.cos(a)*d,Math.sin(a)*d-lift);c.rotate(a+p*3);c.fillStyle=i%2?'#b49d7d':'#e4c493';c.fillRect(-size,-size,size*2,size*1.4);c.restore();}
   if(p<.24){c.globalAlpha*=1-p/.24;streak(c,0,0,r*.60,.28,'#fff3d0');c.rotate(-Math.PI/2);streak(c,.5,0,1.1,.17,'#fffce7');}
  }else if(['fireball','fire','pulse','panclang','trap','candyburst'].includes(f.kind)){
   c.strokeStyle=['fireball','fire','trap'].includes(f.kind)?'#ffb15e':f.kind==='candyburst'?'#fca5d0':['pulse','panclang'].includes(f.kind)?'#b7e5ff':'#e8cf99';c.lineWidth=.12*(1-p);c.beginPath();c.ellipse(0,.35,r*(.3+p*.7),r*(.13+p*.32),0,0,Math.PI*2);c.stroke();
   for(let i=0;i<8;i++){const a=i*Math.PI/4,d=r*(.25+p*.7);c.save();c.translate(Math.cos(a)*d,Math.sin(a)*d*.6);c.rotate(a);streak(c,0,0,.14+(.22*(1-p)),.045,c.strokeStyle);c.restore();}
   if(p<.35){c.globalAlpha*=1-p/.35;streak(c,0,0,r*.55,.22,'#fff2ba');c.rotate(Math.PI/2);streak(c,0,0,r*.4,.14,'#fffbe6');}
  }else if(f.kind==='shoot'){
   c.rotate(f.angle||0);c.translate(.65,0);streak(c,.15+p*.3,0,.25,.10,f.weapon==='bow'?'#ffe3a6':'#cbb4ff');
  }
  c.restore();return true;
 },
 projectile(c,p,time){
  if(!['dagger','arrow','magic','fireball','heal','phoenix','bladewave','crescent','star','clockwave','thorn','lightning','wisp','ember','frostblade'].includes(p.kind))return false;
  c.save();c.translate(p.x,p.y-.35);c.rotate(p.angle||0);
  if(p.kind==='dagger'){
   c.globalAlpha*=.3;streak(c,-.5,0,.65,.07,'#d6e9fa');c.globalAlpha/=.3;
   c.fillStyle='#dcecf7';c.beginPath();c.moveTo(.6,0);c.lineTo(-.12,-.13);c.lineTo(-.03,0);c.lineTo(-.12,.13);c.closePath();c.fill();c.fillStyle='#998368';c.fillRect(-.42,-.055,.34,.11);c.fillStyle='#eac787';c.fillRect(-.14,-.21,.06,.42);
  }else if(p.kind==='star'){
   c.rotate(time*9);c.fillStyle='#ddd2ff';c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?.17:.45;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();streak(c,0,0,.23,.08,'#fffce8');
  }else if(p.kind==='phoenix'){
   c.globalAlpha*=.4;streak(c,-.5,0,1.3,.23,'#ff8548');c.globalAlpha/=.4;c.fillStyle='#ffc766';c.beginPath();c.moveTo(.65,0);c.lineTo(.2,-.17);c.lineTo(-.35,-.68);c.lineTo(-.15,-.08);c.lineTo(-.6,0);c.lineTo(-.15,.08);c.lineTo(-.35,.68);c.lineTo(.2,.17);c.closePath();c.fill();streak(c,.12,0,.4,.12,'#fff4c8');
  }else if(p.kind==='clockwave'){
   c.globalAlpha*=.3;streak(c,-.7,0,1.2,.08,'#a9dbff');c.globalAlpha/=.3;streak(c,.1,0,.9,.11,'#f3e2ab');c.strokeStyle='#d5edff';c.lineWidth=.04;c.beginPath();c.arc(-.4,0,.24,0,Math.PI*2);c.stroke();
  }else if(p.kind==='arrow'||p.kind==='thorn'){
   c.globalAlpha*=.28;streak(c,-.55,0,.85,.045,'#fff0c1');c.globalAlpha/=.28;
   c.strokeStyle=p.kind==='thorn'?'#a6d992':'#d8b97c';c.lineWidth=.06;c.beginPath();c.moveTo(-.55,0);c.lineTo(.35,0);c.stroke();
   c.fillStyle='#f3f6ea';c.beginPath();c.moveTo(.53,0);c.lineTo(.23,-.12);c.lineTo(.29,0);c.lineTo(.23,.12);c.closePath();c.fill();
   c.strokeStyle='#f4deb0';c.beginPath();c.moveTo(-.52,-.13);c.lineTo(-.32,0);c.lineTo(-.52,.13);c.stroke();
   if(p.kind==='thorn'){c.fillStyle='#a6d992';c.beginPath();c.moveTo(-.25,0);c.lineTo(-.47,-.25);c.lineTo(-.53,0);c.lineTo(-.47,.25);c.closePath();c.fill();}
  }else if(['bladewave','crescent','frostblade'].includes(p.kind)){
   crescent(c,.72,-1.2,1.2,.20,p.kind==='frostblade'?'#7ddfff':'#c8b6ff');crescent(c,.69,-1.1,1.1,.09,'#fffce8');
  }else if(p.kind==='lightning'){
   c.strokeStyle='#cbe5ff';c.lineWidth=.12;c.beginPath();c.moveTo(-.7,0);c.lineTo(-.35,-.12);c.lineTo(-.1,.13);c.lineTo(.4,0);c.stroke();c.strokeStyle='#fffde7';c.lineWidth=.035;c.stroke();
  }else{
   const fire=p.kind==='fireball'||p.kind==='ember'||p.weapon==='fireball',tint=p.kind==='heal'?'#8df7b8':p.kind==='wisp'?'#9aefff':fire?'#ff9d52':['thunder','lightning'].includes(p.weapon)?'#b8caff':'#c5a5ff';
   c.globalAlpha*=.35;streak(c,-.45,0,.8,.18,tint);c.globalAlpha/=.35;
   streak(c,0,0,.4,.24,tint);streak(c,.07,0,.24,.12,'#fffde7');
   for(let i=0;i<3;i++){c.globalAlpha=.5*(1-i/3);c.fillStyle=tint;const d=.55+i*.24;c.fillRect(-d,-.05+Math.sin(time*16+i*2)*.09,.1,.1);}
  }
  c.restore();return true;
 }
};
