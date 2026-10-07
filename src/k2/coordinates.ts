import type { Vec3 } from './types';
export const ORIGIN = { latitude:35.8825, longitude:76.5133, altitude:4500 };
const DEG = Math.PI/180;
/** Metric local east / up / south tangent approximation. Render and geography share ONE conversion. */
export function geographicToLocal(latitude:number,longitude:number,altitude:number):Vec3 {
  const latitudeRad=ORIGIN.latitude*DEG;
  const a=6378137, e2=0.00669437999014;
  const w=Math.sqrt(1-e2*Math.sin(latitudeRad)**2);
  const eastRadius=a/w*Math.cos(latitudeRad);
  const northRadius=a*(1-e2)/(w*w*w);
  return [(longitude-ORIGIN.longitude)*DEG*eastRadius,altitude-ORIGIN.altitude,-(latitude-ORIGIN.latitude)*DEG*northRadius];
}
export function localToGeographic(p:Vec3) {
  const lat=ORIGIN.latitude*DEG, a=6378137,e2=0.00669437999014,w=Math.sqrt(1-e2*Math.sin(lat)**2);
  return { latitude:ORIGIN.latitude-p[2]/(a*(1-e2)/(w*w*w))/DEG,
    longitude:ORIGIN.longitude+p[0]/(a/w*Math.cos(lat))/DEG,altitude:p[1]+ORIGIN.altitude };
}
export function isDeathZone(localHeight:number) { return localHeight+ORIGIN.altitude>=8000; }
