import { StackGame } from '../games/stackga/js/game.js';
import { CpuController } from '../games/stackga/js/cpu.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const g=new StackGame(12345);
const cpu=new CpuController(g,67890,'low');
const firstId=g.current.id;
let elapsed=0,firstLockAt=null,firstDownAt=null,lastY=g.current.y;
while(elapsed<9000 && !g.dead){
  // Match the real solo loop: normal gravity still runs while CPU thinks/acts.
  g.tick(50);
  cpu.update(50);
  elapsed+=50;
  if(g.current.id===firstId && g.current.y>lastY && firstDownAt===null) firstDownAt=elapsed;
  if(g.current.id!==firstId){firstLockAt=elapsed;break;}
  lastY=g.current.y;
}
ok(firstDownAt!==null,'easy CPU piece never visibly descended');
ok(firstLockAt!==null,'easy CPU piece never completed within test window');
ok(firstLockAt>=2500,`easy CPU still locks almost instantly (${firstLockAt}ms)`);
ok(firstDownAt<firstLockAt,'easy CPU did not visibly descend before locking');
console.log(`STACKGA_CPU_PACE_ROOTFIX_OK firstDown=${firstDownAt}ms firstLock=${firstLockAt}ms`);
