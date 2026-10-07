#!/usr/bin/env python3
"""Project documented reference altitudes / reconstructed route seeds onto the model.
No GPX measurements are created. Coordinates are model positions, always classified.
"""
import json, math
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
m=json.loads((ROOT/'public/k2/terrain.json').read_text())
h=np.fromfile(ROOT/'public/k2/heights.bin',dtype='<u2').reshape(m['grid'],m['grid'])/2
b=m['bounds'];s=m['gridSpacingMeters']
def sample(x,z):
    u=np.clip((x-b[0])/s,0,512);v=np.clip((z-b[1])/s,0,512)
    i=min(511,int(u));j=min(511,int(v));u-=i;v-=j
    a,c,d,e=h[j,i],h[j,i+1],h[j+1,i],h[j+1,i+1]
    return float(a+(c-a)*u+(d-a)*v if u+v<=1 else e+(d-e)*(1-u)+(c-e)*(1-v))
data=json.loads((ROOT/'data/k2/annotations.json').read_text())
for point in data['points']:
    x,z=point.pop('seed')
    if point.pop('snap',True):
        options=[]
        for dx in range(-170,171,10):
            for dz in range(-170,171,10):
                error=abs(sample(x+dx,z+dz)-point['referenceAltitude'])
                options.append((error+0.05*math.hypot(dx,dz),x+dx,z+dz))
        _,x,z=min(options)
    point['position']=[x,round(sample(x,z)-4500,2),z]
p={p['id']:p['position'] for p in data['points']}
def xz(id): return [p[id][0],p[id][2]]
def line(id,route_ids,points,shared=False):
    positions=[]
    for a,c in zip(points[:-1],points[1:]):
        steps=max(1,math.ceil(math.dist(a,c)/8))
        for i in range(steps):
            t=i/steps;x=a[0]+(c[0]-a[0])*t;z=a[1]+(c[1]-a[1])*t
            positions.append([round(x,2),round(sample(x,z)-4500,2),round(z,2)])
    x,z=points[-1];positions.append([x,round(sample(x,z)-4500,2),z])
    return {'id':id,'routes':route_ids,'shared':shared,'positions':positions}
data['segments']=[
 line('abruzzi',['abruzzi'],[xz('base'),[500,4550],[1550,3700],xz('abc'),[2370,2300],xz('camp1'),[1880,1630],xz('camp2'),[1170,1120],xz('camp3'),[1000,700],xz('camp4'),xz('shoulder')]),
 line('cesen',['cesen'],[xz('base'),[100,4600],[700,3530],[900,2850],[700,2350],xz('cesen1'),[650,1540],xz('cesen2'),[670,990],xz('cesen3'),xz('shoulder')]),
 line('upper',['abruzzi','cesen'],[xz('shoulder'),[350,300],[210,265],xz('bottleneck'),xz('traverse'),[-120,150],[-95,80],xz('summit')],True)
]
(ROOT/'public/k2/atlas.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'points':[(q['id'],q['position']) for q in data['points']],'routeVertices':sum(len(q['positions']) for q in data['segments'])}))
