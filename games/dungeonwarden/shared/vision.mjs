import {distance} from './catalog.mjs';
import {lineOfSight,roomAt} from './world.mjs';
export const VISION_ARC=Math.PI/3;
export const NEAR_VISION_RADIUS=3;
export function visibleFrom(map,source,p){
  const d=distance(source,p);if(d<.01)return true;
  if(source.poison)return d<.65&&lineOfSight(map,source,p);
  const fullRoom=source.fullRoom&&roomAt(map,source)?.id===roomAt(map,p)?.id;
  if(!fullRoom&&d>Math.min(45,source.radius||10))return false;
  if(d>(source.nearRadius??NEAR_VISION_RADIUS)&&!source.omni&&!fullRoom&&Math.cos(Math.atan2(p.y-source.y,p.x-source.x)-(source.facing||0))<Math.cos(source.arc||VISION_ARC))return false;
  return lineOfSight(map,source,p);
}
