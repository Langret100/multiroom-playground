import {ClassicCombat} from './classic-combat.mjs?v=20261009-final-equipment';

// Effects are drawn continuously from simulation lifetimes. The old four-frame
// sprite sheets are deliberately not downloaded or sampled by combat rendering.
export const CombatEffects={
 ready:true,
 async load(){},
 meteorFall(ctx,zone,time){return ClassicCombat.meteorFall(ctx,zone,time);},
 paint(ctx,effect,time){return ClassicCombat.paint(ctx,effect,time);},
 projectile(ctx,projectile,time){return ClassicCombat.projectile(ctx,projectile,time);}
};
