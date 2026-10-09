export function skillMotion(kind,family){
 if(kind==='spin')return 'whirlwind';
 if(kind==='backstep')return 'dodge';
 if(family==='bow')return 'shoot';
 if(family==='staff')return 'cast';
 if(kind==='throw'||kind==='starfan')return 'throw';
 if(['slam','earthline','cometfall','breadline','panclang','resonance','candyburst'].includes(kind))return 'slam';
 if(['bladewave','crescent','bleed','clockwave'].includes(kind))return 'dash';
 return 'combo';
}
