import type { Domain, ExperimentConfigV1, Vec3 } from './types';
export function halton(index: number, base: number): number { let f=1, r=0; while(index>0){ f/=base; r+=f*(index%base); index=Math.floor(index/base); } return r; }
export function generateSeeds(domain: Domain, count=16): Vec3[] { return Array.from({length:Math.min(64,count)},(_,i)=>[2,3,5].map((base,j)=>domain[0][j]+(domain[1][j]-domain[0][j])*(.1+.8*halton(i+1,base))) as Vec3); }
export function defaultConfig(): ExperimentConfigV1 {
  const domain:Domain=[[-3,-3,-3],[3,3,3]];
  return {schemaVersion:1,engineVersion:'1.0.0',fieldId:'rotation',components:['-y','x','0'],parameters:{},domain,resolution:9,
    numerics:{derivativeMethod:'auto',eta:1e-4,integration:'adaptive',stepFactor:.01,minStepFactor:1e-6,maxStepFactor:.025,atolFactor:1e-6,rtol:1e-5,zeroThreshold:1e-10,maxLengthFactor:8,maxSteps:1500,closeLoops:true},
    seeds:generateSeeds(domain),layers:{arrows:true,vectors:'field',lines:false,seeds:true,axes:true,cut:false,scalar:'none'},
    slice:{plane:'XY',position:0,resolution:65},scales:{field:.1,curl:.2,magnitude:6,divergence:3,directionOnly:false},graphics:{pixelRatio:1.5},camera:{position:[8,-10,7],target:[0,0,0],zoom:1},inspected:[1,0,0]};
}
