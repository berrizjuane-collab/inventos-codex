#!/usr/bin/env python3
"""Bake an authored, transparent high-altitude cloud bank.

No photography or external texture is used. A seeded 3D density field is eroded
with multi-scale noise, lit by integrating density toward the sun, then volume
composited from front to back. Requires NumPy, SciPy and Pillow.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, shift, zoom

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'k2'
SEED = 20261007
WIDTH, HEIGHT, DEPTH = 1024, 512, 64
SHAPE = (DEPTH, HEIGHT, WIDTH)
rng = np.random.default_rng(SEED)


def noise(shape):
    coarse = rng.normal(0, 1, shape).astype(np.float32)
    coarse = gaussian_filter(coarse, .50)
    field = zoom(coarse, [a / b for a, b in zip(SHAPE, shape)],
                 order=1, prefilter=False)
    field -= field.mean()
    field /= max(float(field.std()), .01)
    return field


z = np.linspace(-.52, .52, DEPTH, dtype=np.float32)[:, None, None]
y = np.linspace(-1, 1, HEIGHT, dtype=np.float32)[None, :, None]
x = np.linspace(-2, 2, WIDTH, dtype=np.float32)[None, None, :]

# Unequal lobes form a wind-stretched bank. The upper silhouette, sparse tails,
# and variable depth are shaped independently instead of repeating circles.
lobes = [
    (-1.42, .21, .07, .34, .12, .18, .79),
    (-1.09, .15, .03, .40, .21, .30, 1.00),
    (-.69, -.04, -.03, .39, .28, .27, 1.10),
    (-.24, -.11, .07, .47, .31, .32, 1.05),
    (.18, .04, -.04, .39, .24, .26, 1.06),
    (.54, .04, .06, .35, .22, .28, .95),
    (.90, .17, -.02, .38, .15, .23, .83),
    (1.26, .23, .06, .35, .10, .18, .61),
    (1.49, .17, .06, .25, .07, .13, .34),
]
envelope = np.zeros(SHAPE, dtype=np.float32)
for cx, cy, cz, rx, ry, rz, strength in lobes:
    d = ((x-cx)/rx)**2 + ((y-cy)/ry)**2 + ((z-cz)/rz)**2
    np.maximum(envelope, np.exp(-d*.88)*strength, out=envelope)

coarse = noise((7, 18, 30))
medium = noise((13, 42, 73))
fine = noise((27, 99, 177))
detail = noise((39, 181, 321))
erosion = coarse*.125 + medium*.075 + fine*.027 + detail*.008
density = np.clip((envelope - .19 + erosion) * 2.7, 0, 1.6)
# Erosion must not leave detached noise throughout the empty transparent frame.
density *= np.clip((envelope-.038)*11, 0, 1)
del coarse, medium, fine, detail, erosion

# Longer, tenuous wisps survive in the lee of the denser lower layer.
streak = np.exp(-((y-.27-np.sin(x*3.8)*.031)/.042)**2
                - ((z-.11)/.15)**2 - ((x-.56)/1.02)**2)
density += streak*.15
density = gaussian_filter(density, (.38, .52, .52)).astype(np.float32)

# Sun is above and left of the camera. Integrating its optical depth produces
# translucent bright fringes and coherent cool self-shadow under the bank.
sun = np.array([-.46, -.76, -.46], dtype=np.float32)
sun /= np.linalg.norm(sun)
voxel = np.array([1.04/(DEPTH-1), 2/(HEIGHT-1), 4/(WIDTH-1)])
optical = np.zeros(SHAPE, dtype=np.float32)
last = 0.
for distance in [.014, .035, .070, .120, .190, .280, .400, .570, .780]:
    displaced = shift(density, -sun*distance/voxel, order=1,
                      mode='constant', cval=0, prefilter=False)
    optical += displaced * (distance-last)
    last = distance
light = np.exp(-optical*7.5)
del optical, displaced, envelope

# Straight-alpha texture, sRGB encoded. Cool skylight is deliberately visible
# in the underside; no opaque blue rectangle or baked sky behind the cloud.
transmittance = np.ones((HEIGHT, WIDTH), dtype=np.float32)
rgb = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
ambient = np.array([.29, .39, .53], dtype=np.float32)
direct = np.array([.72, .67, .56], dtype=np.float32)
for layer in range(DEPTH):
    alpha = 1-np.exp(-density[layer]*(1.04/DEPTH)*9.8)
    weight = transmittance * alpha
    color = ambient[None, None, :] + light[layer, :, :, None]*direct
    rgb += weight[:, :, None] * color
    transmittance *= 1-alpha
alpha = 1-transmittance
rgb /= np.maximum(alpha[:, :, None], 1e-5)
rgb = np.clip(rgb, 0, 1)
rgb = np.where(rgb <= .0031308, rgb*12.92, 1.055*rgb**(1/2.4)-.055)

# The last wind streak must disappear before the billboard bounds; even a
# two-percent opaque edge becomes visible when the texture is enlarged.
edge_x = np.clip((1.98-np.abs(x[0, 0]))/.22, 0, 1)
edge_y = np.clip((.98-np.abs(y[0, :, 0]))/.12, 0, 1)
edge_x = edge_x*edge_x*(3-2*edge_x)
edge_y = edge_y*edge_y*(3-2*edge_y)
alpha *= edge_y[:, None]*edge_x[None, :]

# Edge alpha has no hard cutoff. White RGB in transparent texels keeps bilinear
# sprite filtering from introducing dark fringes at the very thinnest wisps.
rgb[alpha < 1e-5] = [1, 1, 1]
pixels = np.dstack([rgb, alpha])
rgba = np.rint(np.clip(pixels, 0, 1)*255).astype(np.uint8)
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(rgba, 'RGBA').save(OUT/'cloud-bank.png', optimize=True)
meta = {
    'asset': 'cloud-bank.png', 'dimensions': [WIDTH, HEIGHT],
    'seed': SEED, 'classification': 'authored atmospheric illustration',
    'provenance': 'Procedural volume authored for this atlas; no external imagery.',
    'method': 'Seeded 3D density, multiscale erosion, sunlight optical depth, alpha raymarch.',
    'colorSpace': 'sRGB', 'alpha': 'straight', 'sunDirectionInImage': 'upper left',
    'recommendedUse': 'Distant camera-facing billboards; depth test on, depth write off; opacity 0.35–0.7.',
    'notMeteorologicalData': True,
}
(OUT/'cloud-bank.json').write_text(json.dumps(meta, indent=2)+'\n')
print(json.dumps({'texture': str(OUT/'cloud-bank.png'),
                  'dimensions': [WIDTH, HEIGHT],
                  'bytes': (OUT/'cloud-bank.png').stat().st_size,
                  'seed': SEED}))
