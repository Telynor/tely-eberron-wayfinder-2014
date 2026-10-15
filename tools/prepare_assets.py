from pathlib import Path
import fitz,json,shutil,concurrent.futures
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PDF=ROOT.parent/'upload'/'D&D 5E - Wayfinders Guide to Eberron.pdf'
OUT=ROOT/'assets/pages';OUT.mkdir(parents=True,exist_ok=True)
def render(n):
    doc=fitz.open(PDF);pix=doc[n].get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
    image=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    image.save(OUT/f'{n+1:03d}.webp',quality=84,method=4)
    return n+1
with concurrent.futures.ThreadPoolExecutor(4) as pool:results=list(pool.map(render,range(176)))
out=ROOT/'assets/art';out.mkdir(exist_ok=True)
sources=[]
for name,filename,page in [('changeling','p060-1.png',60),('kalashtar','p062-7.png',62),('shifter','p064-0.png',64),('warforged','p069-3.png',69),('khyber-dragonshard','p113-1.png',113),('dimensional-seal','p118-0.png',118)]:
    original=ROOT.parent/'tmp/source-art'/filename
    dest=out/(name+'.png');shutil.copyfile(original,dest)
    sources.append({'name':name,'file':str(dest.relative_to(ROOT)),'source':'Supplied WGtE prototype, page '+str(page),'kind':'official sourcebook illustration'})
generated=ROOT.parent/'generated_images'/'exec-edff3c8f-e576-4235-891c-066a2de2a732.png'
if generated.exists():
    dest=ROOT/'assets/creatures/clawfoot-raptor-cutout.png';shutil.copyfile(generated,dest)
    sources.append({'name':'Clawfoot Raptor','file':str(dest.relative_to(ROOT)),'source':'https://www.dndbeyond.com/avatars/thumbnails/2265/42/1000/1000/636678129810649453.png','kind':'official artwork, imagegen cutout edit; rider and scenery removed','prompt':'Remove rider and scenery; preserve the dinosaur and saddle on alpha transparency.'})
(ROOT/'source/art-provenance.json').write_text(json.dumps(sources,indent=2))
print({'rendered_pages':len(results),'illustrations':len(sources),'page_bytes':sum(p.stat().st_size for p in OUT.iterdir())})
