#!/usr/bin/env python3
"""Deterministic visual interpretation of K2 rock, snow and glacier.
Texture texels add material detail, never new measured terrain resolution.
The referenced heightfield and all route/collision coordinates stay unchanged.
"""
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter, zoom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/k2'
meta = json.loads((OUT / 'terrain.json').read_text())
N = 2048
rng = np.random.default_rng(20261008)
b = meta['bounds']
pixel = (b[2] - b[0]) / (N - 1)
height = np.fromfile(OUT / 'heights.bin', dtype='<u2').reshape(meta['grid'], meta['grid']).astype(np.float32) / 2
h = zoom(height, N / meta['grid'], order=3).astype(np.float32)
x, z = np.meshgrid(np.linspace(b[0], b[2], N, dtype=np.float32), np.linspace(b[1], b[3], N, dtype=np.float32))

def smooth(a, b, value):
    t = np.clip((value-a)/(b-a), 0, 1)
    return t*t*(3-2*t)

def noise(cells):
    grid = rng.normal(size=(cells, cells)).astype(np.float32)
    layer = zoom(grid, N/cells, order=3)
    return np.tanh(layer).astype(np.float32)

large, medium, fine, grain = noise(24), noise(100), noise(360), noise(1024)
hz, hx = np.gradient(h, pixel)
normal_y = 1 / np.sqrt(1 + hx*hx + hz*hz)
normal_z = -hz*normal_y
concavity = np.clip((gaussian_filter(h, 5)-h)/26, -1, 1)
broad_cavity = np.clip((gaussian_filter(h, 18)-h)/95, -1, 1)

# Snow stays in flatter shelves and concave gullies; exposed ridges remain rock.
# No arbitrary all-white elevation band.
deposition = normal_y + concavity*.19 + broad_cavity*.055 - normal_z*.035
deposition += medium*.085 + fine*.038
snow = smooth(.74, .90, deposition)
snow *= .55 + .45*smooth(5200, 6650, h)
summit = smooth(8080, 8500, h) * .98
snow *= 1 - smooth(.28, .85, -concavity)*.48
snow = np.maximum(snow, summit)

# Dipping strata and fractured slabs. This is albedo/micro-normal interpretation,
# not added mountain geometry or a claim about surveyed outcrops.
phase = (h + x*.21 + z*.13)*.090 + large*2.8 + medium*.48
strata = np.sin(phase)*.50 + np.sin(phase*2.63 + fine)*.19
fractures = np.power(np.clip(1-np.abs(medium*.75 + fine*.25), 0, 1), 18)
variation = np.clip(.97 + large*.15 + medium*.20 + fine*.10 + strata*.10 - fractures*.23, .43, 1.35)
rock = np.empty((N,N,3), np.float32)
rock[:] = [.33, .315, .29]
rock *= variation[:,:,None]
rock += large[:,:,None] * np.array([.025,.012,-.003], np.float32)

snow_color = np.empty_like(rock)
snow_color[:] = [.83,.875,.90]
snow_color *= (1 + fine*.035 + grain*.014)[:,:,None]
snow_color *= (.94 + .06*normal_y)[:,:,None]

# The low, broad basin carries cooler glacial ice mixed with long moraine bands.
valley = np.abs(x - (3300-z*.63))
glacier = (1-smooth(480,1200,valley)) * (1-smooth(5550,6100,h)) * smooth(.72,.96,normal_y)
moraine = np.zeros_like(h)
center = x + z*.63 - 3300 + large*85 + medium*23
for offset,width in [(-270,44),(90,36),(340,24)]:
    moraine = np.maximum(moraine,np.exp(-((center-offset)/width)**2))
glacial_color = np.empty_like(rock)
glacial_color[:] = [.72,.77,.79]
glacial_color *= (1+fine*.075)[:,:,None]
glacial_color = glacial_color*(1-moraine[:,:,None]*.72) + rock*moraine[:,:,None]*.72
rgb = rock*(1-snow[:,:,None]) + snow_color*snow[:,:,None]
rgb = rgb*(1-glacier[:,:,None]) + glacial_color*glacier[:,:,None]

# Ambient crevice shading baked without a preferred sun direction.
ao = np.clip(1 - np.maximum(concavity,0)*.20 - np.maximum(broad_cavity,0)*.12 - fractures*.06*(1-snow), .58, 1)
rgb *= ao[:,:,None]
rgb = np.clip(rgb,0,1)
Image.fromarray(np.rint(rgb*255).astype('uint8')).save(OUT/'terrain-albedo.jpg', quality=94, subsampling=0, optimize=True)

# Object-space normals retain the full-grid slopes even on the economical LOD.
# The 1–6 m visual roughness changes only shading, not geometry or collision.
micro = (medium*3.4 + fine*1.8 + strata*.65 + grain*.40)*(1-snow) + fine*.22*snow
surface = h + micro
dz, dx = np.gradient(surface, pixel)
normal = np.stack([-dx,np.ones_like(h),-dz],axis=-1)
normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
Image.fromarray(np.rint((normal*.5+.5)*255).clip(0,255).astype('uint8')).save(OUT/'terrain-normal.jpg',quality=95,subsampling=0,optimize=True)

# A seamless, fine rock relief for steep faces and close-up views. Fourier
# synthesis yields non-repeating fracture detail within the tiled sample.
T=512
white=rng.normal(size=(T,T))
fy,fx=np.meshgrid(np.fft.fftfreq(T),np.fft.fftfreq(T),indexing='ij')
spectrum=np.fft.fft2(white)
frequency=np.sqrt((fx*1.25)**2+(fy*.7)**2)
amplitude=np.power(np.maximum(frequency,1/T),-1.15);amplitude[0,0]=0
detail=np.fft.ifft2(spectrum*amplitude).real
detail=(detail-detail.mean())/detail.std()
detail=np.clip(.5+detail*.16,0,1)
Image.fromarray(np.rint(detail*255).astype('uint8')).save(OUT/'rock-grain.jpg',quality=94,optimize=True)

info = {'classification':'interpretación visual reconstruida', 'seed':20261008,
        'size':[N,N], 'texelMetersForRenderingOnly':pixel,
        'geometricDisplacement':False, 'normalSpace':'object-space: east, up, south',
        'snowCoverageFraction':float(np.mean(snow>.5)),
        'assets':{name:(OUT/name).stat().st_size for name in ['terrain-albedo.jpg','terrain-normal.jpg','rock-grain.jpg']}}
(OUT/'materials.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(info,ensure_ascii=False))
