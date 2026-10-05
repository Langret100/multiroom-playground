// Presentation-only poses; replacement sprites can use these motion families.
export function weaponPose(type,moving=false,time=0){
 const poses={dagger:[-.35,.46,-.3,.10],sword:[-.6,.55,-.65,.08],axe:[-.95,.57,-.7,.06],mace:[-.8,.5,-.52,.07],greatsword:[-1.1,.45,-.95,.04],hammer:[-1.35,.5,-.85,.035],bow:[-.12,.65,-.58,.04]};
 const [angle,reach,height,sway]=poses[type]||[-.1,.62,-.8,.025];
 return {angle:angle+(moving?Math.sin(time*10)*sway:Math.sin(time*2.4)*sway*.3),reach,height:height+(moving?Math.sin(time*10)*.035:Math.sin(time*2.4)*.018),heavy:['hammer','greatsword'].includes(type)};
}
