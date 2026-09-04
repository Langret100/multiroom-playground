import { StackGame } from '../games/stackga/js/game.js';
import { CpuController } from '../games/stackga/js/cpu.js';
const locks=[];
for(let seed=1;seed<=20;seed++){
  const g=new StackGame(seed*7919); const cpu=new CpuController(g,seed*104729,'low');
  const id=g.current.id; let t=0,lock=null,down=false,lastY=g.current.y;
  while(t<9000&&!g.dead){ g.tick(50); cpu.update(50); t+=50; if(g.current.id===id&&g.current.y>lastY)down=true; if(g.current.id!==id){lock=t;break;} lastY=g.current.y; }
  if(!down||lock===null||lock<2500) throw new Error(`seed ${seed} pace invalid down=${down} lock=${lock}`);
  locks.push(lock);
}
console.log('STACKGA_CPU_20SEED_OK min='+Math.min(...locks)+' max='+Math.max(...locks)+' avg='+Math.round(locks.reduce((a,b)=>a+b,0)/locks.length));
