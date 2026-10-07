import { Vector3, Box3 } from 'three';
import type { Heightfield } from './terrain';
import type { Vec3, ViewId } from './types';
export const CAMERA_LIMITS={minDistance:500,maxDistance:14500,clearance:115,minPolar:.12,maxPolar:Math.PI*.49,maxHorizontal:11200};
export const PRESETS:Record<ViewId,{position:Vec3;target:Vec3}>={
  general:{position:[4900,3800,7500],target:[220,2300,500]},
  abruzzi:{position:[5000,3850,6200],target:[900,2050,900]},
  shoulder:{position:[2500,4500,3450],target:[700,3150,390]},
  bottleneck:{position:[650,4050,1550],target:[60,3770,235]},
  summit:{position:[1600,5000,2100],target:[0,3900,50]},
  north:{position:[-3500,4900,-9000],target:[0,2200,-350]},
  east:{position:[9400,4800,1000],target:[500,2200,0]}
};
/** Checks both camera position and every sampled segment of its movement.
  Heightfield collision and independent reconstructed ice boxes use the same metre space. */
export function constrainCamera(position:Vector3,target:Vector3,field:Heightfield,previous?:Vector3,ice:Box3[]=[]):void {
  if(![...position.toArray(),...target.toArray()].every(Number.isFinite)) {
    position.set(...PRESETS.general.position);target.set(...PRESETS.general.target);
  }
  const oldTarget=target.clone();
  target.x=Math.max(-2600,Math.min(2600,target.x));target.z=Math.max(-2300,Math.min(3800,target.z));
  target.y=Math.max(400,Math.min(4250,target.y));
  position.add(target.clone().sub(oldTarget));
  const delta=position.clone().sub(target),distance=delta.length();
  if(distance<1) delta.set(0,1000,4000);
  delta.setLength(Math.max(CAMERA_LIMITS.minDistance,Math.min(CAMERA_LIMITS.maxDistance,delta.length())));
  position.copy(target).add(delta);
  const horizontal=Math.hypot(position.x,position.z);
  if(horizontal>CAMERA_LIMITS.maxHorizontal) {
    position.x*=CAMERA_LIMITS.maxHorizontal/horizontal;position.z*=CAMERA_LIMITS.maxHorizontal/horizontal;
  }
  if(field.contains(position.x,position.z)) position.y=Math.max(position.y,field.sample(position.x,position.z)+CAMERA_LIMITS.clearance);
  for(const box of ice) if(position.x>box.min.x-90&&position.x<box.max.x+90&&position.z>box.min.z-90&&position.z<box.max.z+90)
    position.y=Math.max(position.y,box.max.y+CAMERA_LIMITS.clearance);
  if(previous) {
    const distance=previous.distanceTo(position),steps=Math.max(2,Math.ceil(distance/22));
    let lift=0;
    for(let i=1;i<=steps;i++) {
      const t=i/steps,p=previous.clone().lerp(position,t);
      if(field.contains(p.x,p.z)) lift=Math.max(lift,(field.sample(p.x,p.z)+CAMERA_LIMITS.clearance-p.y)/t);
      for(const box of ice) if(p.x>box.min.x-90&&p.x<box.max.x+90&&p.z>box.min.z-90&&p.z<box.max.z+90)
        lift=Math.max(lift,(box.max.y+CAMERA_LIMITS.clearance-p.y)/t);
    }
    if(lift>0) position.y+=lift+2;
  }
}
