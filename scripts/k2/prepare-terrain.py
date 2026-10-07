#!/usr/bin/env python3
"""Reconstruct a metric heightfield from referenced 150 m contour vectors.
The 513² grid is render sampling, NOT measurement resolution. No DEM claim.
Requires numpy, scipy and Pillow. Reproducible; no random geometric detail.
"""
import json, math, struct, hashlib
from pathlib import Path
import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
source = json.loads((ROOT/'data/k2/contours.json').read_text())
OUT = ROOT/'public/k2'
OUT.mkdir(parents=True, exist_ok=True)
N = 513
BOUNDS = [-5800., -5200., 5800., 6400.]  # east/south, summit at (0,0)
BASE = 4500.
mpp = source['metersPerPoint']
ax, az = source['summitPDF']
spacing = (BOUNDS[2]-BOUNDS[0])/(N-1)
xs = np.linspace(BOUNDS[0],BOUNDS[2],N)
zs = np.linspace(BOUNDS[1],BOUNDS[3],N)
X,Z = np.meshgrid(xs,zs)
masks = []
for layer in source['layers']:
    image = Image.new('1',(N,N))
    draw = ImageDraw.Draw(image)
    for polygon in layer['polygons']:
        p = [(((x-ax)*mpp-BOUNDS[0])/spacing, ((z-az)*mpp-BOUNDS[1])/spacing) for x,z in polygon]
        draw.polygon(p,fill=1)
    masks.append(np.array(image,dtype=bool))
# Repair nested-contour rasterization errors without silently punching holes.
repaired = 0
for i in range(len(masks)-2,-1,-1):
    repaired += int(np.count_nonzero(masks[i+1] & ~masks[i]))
    masks[i] |= masks[i+1]
height = np.full((N,N),4500.,dtype=np.float64)
for i, mask in enumerate(masks):
    lo = source['layers'][i]['height']
    if i+1 < len(masks):
        upper = masks[i+1]
        band = mask & ~upper
        inside = distance_transform_edt(mask)*spacing
        outside = distance_transform_edt(~upper)*spacing
        t = inside / np.maximum(inside+outside,spacing)
        height[band] = lo + 150*t[band]
    else:
        # Uppermost contour has no measured summit. Local, explicit reconstruction.
        peak_distance = np.hypot(X,Z)
        radius = max(float(np.max(peak_distance[mask])),1.)
        cap = 8400. + 211.*np.clip(1.-peak_distance/radius,0.,1.)**.75
        height[mask] = cap[mask]
# Mild 0.55-cell filter removes raster corners, not broad relief.
height = gaussian_filter(height,.55)
# Summit reconstruction is strictly local (<110 m), surrounding relief unchanged.
i,j = np.unravel_index(np.argmin(X*X+Z*Z),X.shape)
summit_correction = 8611.-height[i,j]
peak = np.exp(-((X-xs[j])**2+(Z-zs[i])**2)/(2*38**2))
height += summit_correction*peak
# Quantized orthometric-like MODEL altitudes, datum is not verified observational data.
quantized = np.rint(height*2).astype('<u2')
(OUT/'heights.bin').write_bytes(quantized.tobytes())
height = quantized.astype(float)/2
meta = {'classification':'reconstruido','source':source['source'],'sourceSHA256':source['sourceSHA256'],
        'grid':N,'gridSpacingMeters':spacing,'measurementResolutionMeters':None,
        'contourIntervalMeters':150,'bounds':BOUNDS,'verticalOrigin':BASE,
        'summit':[float(xs[j]),float(height[i,j]-BASE),float(zs[i])],
        'summitReference':{'latitude':35.8825,'longitude':76.5133,'altitude':8611},
        'axes':{'x':'este','y':'arriba, altitud del modelo - 4500 m','z':'sur'},
        'verticalDatum':'Referencia de modelo aproximada; geoide del DEM original no verificado.',
        'georeferencing':'Norte del raster, escala impresa 1:58100 y anclaje aproximado a la cumbre; no control terrestre.',
        'nestingPixelsRepaired':repaired,
        'localSummitCorrectionMeters':round(float(summit_correction),2),
        'minHeight':float(height.min()),'maxHeight':float(height.max()),'levels':{}}
def write_glb(name,step):
    h = height[::step,::step]
    x,z = np.meshgrid(xs[::step],zs[::step])
    count = h.shape[0]; dx = spacing*step
    dz,dy = np.gradient(h,dx,dx)
    normals = np.stack([-dy,np.ones_like(h),-dz],axis=-1)
    normals /= np.linalg.norm(normals,axis=-1,keepdims=True)
    positions = np.stack([x,h-BASE,z],axis=-1).astype('<f4').reshape(-1,3)
    normals = normals.astype('<f4').reshape(-1,3)
    a=np.arange((count-1)*(count-1)).reshape(count-1,count-1)
    corners=np.arange(count*count).reshape(count,count)[:-1,:-1].reshape(-1)
    # east × south points down, so inverse winding gives correct upward normals.
    indices=np.column_stack([corners,corners+count,corners+1,corners+1,corners+count,corners+count+1]).astype('<u4').reshape(-1)
    chunks=[positions.tobytes(),normals.tobytes(),indices.tobytes()]
    if step == 4:
        # Low profile: precomputed linear-space albedo, diffuse vertex lighting.
        # Move expensive slope / snow interpretation OFF the mobile fragment path.
        def smooth(a,b,v):
            t=np.clip((v-a)/(b-a),0,1)
            return t*t*(3-2*t)
        rough=(.5+.5*np.sin(x*.021+np.cos(z*.015)*2)*np.sin(z*.029)).reshape(-1)
        snow=smooth(.52,.85,normals[:,1]+(rough-.5)*.10-normals[:,2]*.05)
        snow=np.maximum(snow,smooth(8150,8580,h.reshape(-1))*.88)*smooth(5100,5650,h.reshape(-1))
        valley=np.abs(x.reshape(-1)-(3300-z.reshape(-1)*.63))
        glacier=(1-smooth(400,1000,valley))*(1-smooth(5300,5850,h.reshape(-1)))*smooth(.40,.70,normals[:,1])
        snow=np.maximum(snow,glacier*.85)
        rock=np.array([.18,.195,.21])[None,:]*(.87+.21*rough[:,None])
        ice=np.array([.75,.81,.85])[None,:]*(.94+.06*rough[:,None])
        rgb=rock*(1-snow[:,None])+ice*snow[:,None]
        color=np.column_stack([np.clip(np.rint(rgb*255),0,255).astype('uint8'),np.full(len(rgb),255,dtype='uint8')])
        chunks.append(color.tobytes())
    offsets=[0,len(chunks[0]),len(chunks[0])+len(chunks[1])]
    if step == 4: offsets.append(sum(len(c) for c in chunks[:3]))
    blob=b''.join(chunks)
    gltf={'asset':{'version':'2.0','generator':'K2 contour reconstruction; not a direct DEM'},
          'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
          'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'indices':2}]}],
          'buffers':[{'byteLength':len(blob)}],
          'bufferViews':[{'buffer':0,'byteOffset':off,'byteLength':len(chunks[k]),'target':34963 if k==2 else 34962} for k,off in enumerate(offsets)],
          'accessors':[{'bufferView':0,'componentType':5126,'count':len(positions),'type':'VEC3','min':positions.min(0).tolist(),'max':positions.max(0).tolist()},
                       {'bufferView':1,'componentType':5126,'count':len(normals),'type':'VEC3'},
                       {'bufferView':2,'componentType':5125,'count':len(indices),'type':'SCALAR'}]}
    if step == 4:
        gltf['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=3
        gltf['accessors'].append({'bufferView':3,'componentType':5121,'normalized':True,'count':len(positions),'type':'VEC4'})
    raw=json.dumps(gltf,separators=(',',':')).encode()
    raw+=b' '*((-len(raw))%4);blob+=b'\0'*((-len(blob))%4)
    out=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(blob))+struct.pack('<I4s',len(raw),b'JSON')+raw+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    (OUT/(name+'.glb')).write_bytes(out)
    meta['levels'][name]={'triangles':len(indices)//3,'vertices':len(positions),'bytes':len(out)}
for name,step in [('terrain-low',4),('terrain-medium',2),('terrain-high',1)]:
    write_glb(name,step)
(OUT/'terrain.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
# Local, deterministic material detail is separate from the reconstructed heightfield.
rng = np.random.default_rng(20261007)
noise = rng.normal(128,21,(256,256))
yy,xx = np.mgrid[:256,:256]
texture = np.clip(noise+10*np.sin(yy*.3+np.sin(xx*.025)*2),0,255).astype('uint8')
Image.fromarray(texture).save(OUT/'rock-detail.png')
print(json.dumps({'levels':meta['levels'],'heightRange':[meta['minHeight'],meta['maxHeight']],'summit':meta['summit'],'repaired':repaired}))
