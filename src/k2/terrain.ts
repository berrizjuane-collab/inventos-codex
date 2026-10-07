import type { TerrainMeta } from './types';
export class Heightfield {
  constructor(public readonly meta:TerrainMeta, public readonly values:Uint16Array) {
    if(values.length!==meta.grid*meta.grid) throw new Error('El raster de relieve está incompleto.');
  }
  contains(x:number,z:number) { const b=this.meta.bounds; return x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]; }
  /** Exact linear-triangle sampling of the prepared GLB, including coarser levels. */
  sample(x:number,z:number,step=1):number {
    const b=this.meta.bounds,grid=this.meta.grid,spacing=this.meta.gridSpacingMeters*step,n=(grid-1)/step;
    const px=Math.max(0,Math.min(n,(x-b[0])/spacing)),pz=Math.max(0,Math.min(n,(z-b[1])/spacing));
    const ix=Math.min(n-1,Math.floor(px)),iz=Math.min(n-1,Math.floor(pz)),u=px-ix,v=pz-iz;
    const h=(i:number,j:number)=>this.values[(j*step)*grid+i*step]/2-this.meta.verticalOrigin;
    const a=h(ix,iz),c=h(ix+1,iz),d=h(ix,iz+1),e=h(ix+1,iz+1);
    return u+v<=1 ? a+(c-a)*u+(d-a)*v : e+(d-e)*(1-u)+(c-e)*(1-v);
  }
  /** Ray / heightfield occlusion, bounded sampling; last 45 m excludes the lifted marker anchor. */
  occluded(start:readonly number[],end:readonly number[]):boolean {
    const length=Math.hypot(end[0]-start[0],end[1]-start[1],end[2]-start[2]);
    const steps=Math.min(650,Math.ceil(length/35));
    for(let i=1;i<steps;i++) {
      const t=i/steps; if((1-t)*length<45) break;
      const x=start[0]+(end[0]-start[0])*t,z=start[2]+(end[2]-start[2])*t;
      if(this.contains(x,z) && start[1]+(end[1]-start[1])*t<this.sample(x,z)-12) return true;
    }
    return false;
  }
}
