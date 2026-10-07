import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {geographicToLocal,localToGeographic,isDeathZone} from '../../src/k2/coordinates';
import {Heightfield} from '../../src/k2/terrain';
import {constrainCamera,PRESETS,CAMERA_LIMITS} from '../../src/k2/camera';
import {effectiveDpr,AutoQuality} from '../../src/k2/quality';
import type {AtlasData,TerrainMeta} from '../../src/k2/types';
const meta=JSON.parse(readFileSync('public/k2/terrain.json','utf8')) as TerrainMeta;
const bytes=readFileSync('public/k2/heights.bin');
const field=new Heightfield(meta,new Uint16Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
const atlas=JSON.parse(readFileSync('public/k2/atlas.json','utf8')) as AtlasData;
describe('K2 geographic and terrain contracts',()=>{
  it('preserves metres, altitude datum offset, north direction and reversible local transforms',()=>{
    for(const coordinates of [[35.8825,76.5133,8611],[35.8346,76.5093,4968],[35.91,76.54,8000]]) {
      const p=geographicToLocal(...coordinates as [number,number,number]),back=localToGeographic(p);
      expect(back.latitude).toBeCloseTo(coordinates[0],10);expect(back.longitude).toBeCloseTo(coordinates[1],10);
      expect(back.altitude).toBe(coordinates[2]);
    }
    expect(geographicToLocal(35.9,76.5133,8000)[2]).toBeLessThan(0);
    expect(geographicToLocal(35.8825,76.52,8000)[0]).toBeGreaterThan(0);
    expect(isDeathZone(3499.99)).toBe(false);expect(isDeathZone(3500)).toBe(true);
  });
  it('samples actual triangle slopes at each LOD and rejects missing raster bytes',()=>{
    expect(()=>new Heightfield(meta,new Uint16Array(17))).toThrow();
    for(const step of [1,2,4])for(let i=0;i<50;i++){
      const ix=(i*37%(512/step))*step,iz=(i*19%(512/step))*step;
      const x=meta.bounds[0]+ix*meta.gridSpacingMeters,z=meta.bounds[1]+iz*meta.gridSpacingMeters;
      expect(field.sample(x,z,step)+4500).toBe(field.values[iz*513+ix]/2);
    }
    expect(field.sample(meta.summit[0],meta.summit[2])+4500).toBe(8611);
  });
  it('anchors every route segment to the terrain, shares only one upper path and keeps route-specific camps',()=>{
    const references=new Set(atlas.sources.map(s=>s.id));
    for(const point of atlas.points){
      expect(point.position.every(Number.isFinite)).toBe(true);
      expect(Math.abs(field.sample(point.position[0],point.position[2])-point.position[1])).toBeLessThan(.03);
      expect(point.references.every(r=>references.has(r))).toBe(true);
    }
    for(const segment of atlas.segments)for(const p of segment.positions){
      expect(field.contains(p[0],p[2])).toBe(true);
      expect(Math.abs(field.sample(p[0],p[2])-p[1])).toBeLessThan(.05);
    }
    const common=atlas.segments.filter(s=>s.shared);expect(common).toHaveLength(1);
    expect(common[0].routes).toEqual(['abruzzi','cesen']);
    expect(atlas.points.filter(p=>/^camp/.test(p.id)).every(p=>p.routes.length===1&&p.routes[0]==='abruzzi')).toBe(true);
    expect(atlas.points.filter(p=>/^cesen/.test(p.id)).every(p=>p.routes.length===1&&p.routes[0]==='cesen')).toBe(true);
  });
  it('occludes far-side annotations through the mountain and keeps exposed summit visible',()=>{
    expect(field.occluded([0,2000,4000],[0,3200,-1200])).toBe(true);
    expect(field.occluded([2000,5000,3000],[0,4151,10.9375])).toBe(false);
  });
});
describe('K2 camera and quality',()=>{
  it('keeps camera paths above terrain through orbit and transitions between opposite views',()=>{
    let previous=new Vector3(...PRESETS.general.position);
    for(const preset of Object.values(PRESETS)){
      const target=new Vector3(...preset.target),destination=new Vector3(...preset.position);
      for(let i=1;i<=40;i++){
        const next=previous.clone().lerp(destination,.09);
        constrainCamera(next,target,field,previous);
        for(let j=1;j<=30;j++){
          const p=previous.clone().lerp(next,j/30);
          if(field.contains(p.x,p.z))expect(p.y-field.sample(p.x,p.z)).toBeGreaterThanOrEqual(CAMERA_LIMITS.clearance-1);
        }
        expect(next.distanceTo(target)).toBeLessThanOrEqual(CAMERA_LIMITS.maxDistance+1);
        previous=next;
      }
    }
  });
  it('repairs a camera inside the mountain, invalid values, excessive pan and zoom',()=>{
    for(const position of [new Vector3(0,0,0),new Vector3(NaN,4,6),new Vector3(90000,90000,90000)]){
      const target=new Vector3(9999,2000,-9999);constrainCamera(position,target,field);
      expect(position.toArray().every(Number.isFinite)).toBe(true);
      expect(Math.abs(target.x)).toBeLessThanOrEqual(2600);expect(target.z).toBeGreaterThanOrEqual(-2300);
      expect(Math.hypot(position.x,position.z)).toBeLessThanOrEqual(CAMERA_LIMITS.maxHorizontal+.001);
      if(field.contains(position.x,position.z))expect(position.y-field.sample(position.x,position.z)).toBeGreaterThanOrEqual(CAMERA_LIMITS.clearance);
    }
  });
  it('limits pixel cost and uses measured frames with hysteresis instead of oscillating on single samples',()=>{
    expect(effectiveDpr('high',3840,2160,3)**2*3840*2160).toBeLessThanOrEqual(2400000.001);
    const auto=new AutoQuality(8,8,1000000);
    expect(auto.profile).toBe('medium');
    for(let i=0;i<60;i++)auto.measure(45,10000+i*45);
    expect(auto.profile).toBe('low');
    for(let i=0;i<90;i++)auto.measure(10,13000+i*10);
    expect(auto.profile).toBe('low');
    for(let i=0;i<90;i++)auto.measure(10,25000+i*10);
    expect(auto.profile).toBe('low');
    for(let i=0;i<90;i++)auto.measure(10,90000+i*10);
    expect(auto.profile).toBe('medium');
    const limited=new AutoQuality(3,8,1000000);
    for(let i=0;i<200;i++)limited.measure(12,200000+i*12);
    expect(limited.profile).toBe('low');
  });
});
