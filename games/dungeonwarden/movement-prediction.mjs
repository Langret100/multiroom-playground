import {move} from './shared/world.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Render prediction has one movement path. It follows the server's timer order
// and 30 Hz step size; packet receipt times never replace its simulation clock.
export function predictMovement(map,e,input,dt,startTime,speed){
 const mx=clamp(Number(input.mx)||0,-1,1),my=clamp(Number(input.my)||0,-1,1),length=Math.max(1,Math.hypot(mx,my));
 e.predictionTime??=startTime;e.predictionSpeed??=speed;
 while(dt>1e-8){const step=Math.min(1/30,dt);dt-=step;e.predictionTime+=step;
  if(e.enterUntil>e.predictionTime||e.emergeUntil>e.predictionTime)continue;
  if(e.dead){e.x=clamp(e.x+mx*8*step,0,map.width);e.y=clamp(e.y+my*8*step,0,map.height);continue;}
  for(const key of ['stun','root'])e[key]=Math.max(0,(e[key]||0)-step);
  const wasSlow=e.slow>0;e.slow=Math.max(0,(e.slow||0)-step);if(wasSlow&&!e.slow)e.predictionSpeed*=2;
  if(e.cast?.ends<=e.predictionTime)e.cast=null;
  if(e.dashRecovery>0){e.dashRecovery=Math.max(0,e.dashRecovery-step);if(!e.dashRecovery)e.dash=3;}
  const wasBlocking=!!e.blocking;
  e.blocking=!!input.block&&e.equipment?.off?.type==='shield'&&e.guard>.05&&e.guardRecovery<=0&&!e.cast;
  if(wasBlocking&&!e.blocking&&e.guardRecovery<=0)e.guardRecovery=1;
  if(e.blocking){e.guard=Math.max(0,e.guard-step);if(!e.guard)e.guardRecovery=5;}
  else{e.guardRecovery=Math.max(0,(e.guardRecovery||0)-step);e.guard=Math.min(5,(e.guard??5)+step);}
  let dashing=false;
  if((mx||my)&&e.stun<=0&&e.root<=0&&!e.cast){
   dashing=!!input.sprint&&e.dashRecovery<=0&&e.dash>0;
   if(dashing){e.dash=Math.max(0,e.dash-step);if(e.dash<.00001){e.dash=0;e.dashRecovery=3;}}
   const velocity=e.predictionSpeed*(dashing?1.6:1)*(e.blocking?.35:1);
   moveToContact(map,e,mx/length*velocity*step,my/length*velocity*step);
  }
  if(!dashing&&e.dashRecovery<=0)e.dash=Math.min(3,(e.dash||0)+step);
 }
}

// Finish a blocked partial render step at contact. Dropping that whole step
// makes the predicted coordinate oscillate as the replay horizon gets longer.
function moveToContact(map,e,dx,dy){
 const wantedX=e.x+dx,wantedY=e.y+dy;move(map,e,dx,dy,false);
 for(const [axis,delta,wanted] of [['x',dx,wantedX],['y',dy,wantedY]]){
  const start=e[axis],gap=wanted-start;if(Math.abs(gap)<1e-8||gap*delta<=0)continue;
  let lo=0,hi=1;
  const candidate={...e};
  for(let n=0;n<12;n++){const t=(lo+hi)/2,amount=gap*t;candidate.x=e.x;candidate.y=e.y;move(map,candidate,axis==='x'?amount:0,axis==='y'?amount:0,false);if(Math.abs(candidate[axis]-(start+amount))<1e-8)lo=t;else hi=t;}
  e[axis]=start+gap*lo;
 }
}
