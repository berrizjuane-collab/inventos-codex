#!/usr/bin/env python3
"""Extract numerical contour geometry, NOT the cover imagery, from the pinned source PDF.
Use --download (GitHub) or --pdf /path/K2.pdf. Reject changed source bytes.
"""
import argparse,hashlib,json,urllib.request
from pathlib import Path
import fitz
ROOT=Path(__file__).resolve().parents[2]
SHA='ef15f1de17a43f5f7afef4b5eca9d6957897bd9304ae3f4d1173adbcf98b0b95'
COMMIT='f7b32fe0f19221e3364440c016ca825d92d420cc'
URL='https://raw.githubusercontent.com/hoshigarasu/terrain-layering-model/'+COMMIT+'/samples/K2.pdf'
parser=argparse.ArgumentParser();parser.add_argument('--pdf',type=Path);parser.add_argument('--download',action='store_true');args=parser.parse_args()
if args.pdf: raw=args.pdf.read_bytes()
elif args.download:
    with urllib.request.urlopen(URL,timeout=60) as response: raw=response.read()
else: parser.error('Choose --download or --pdf. Existing contours.json needs neither to rebuild terrain.')
if hashlib.sha256(raw).hexdigest()!=SHA: raise ValueError('Source checksum differs: do not silently replace the reference.')
pdf=fitz.open(stream=raw,filetype='pdf');layers=[]
for n in range(1,27):
    polygons=[]
    for d in pdf[n].get_drawings():
        if d['color'] and max(d['color'])<.01:
            points=[]
            for item in d['items']:
                if item[0]=='l':
                    if not points:points.append([item[1].x,item[1].y])
                    points.append([item[2].x,item[2].y])
                elif item[0]=='qu':
                    q=item[1];points.extend([[v.x,v.y] for v in [q.ul,q.ur,q.lr,q.ll]])
            if len(points)>2:polygons.append([[round(x,4),round(y,4)] for x,y in points])
    layers.append({'height':4500+150*n,'polygons':polygons})
obj={'source':'https://github.com/hoshigarasu/terrain-layering-model/blob/'+COMMIT+'/samples/K2.pdf',
     'sourceSHA256':SHA,'scaleDenominator':58100,'metersPerPoint':58100*.0254/72,
     'summitPDF':[553.8,394.4],'northUp':True,'boundsPDF':[28.34646,130.30872,1162.20447,711.58081],'layers':layers}
(ROOT/'data/k2/contours.json').write_text(json.dumps(obj,separators=(',',':'))+'\n')
print('Extracted 26 contour levels; no image assets redistributed.')
