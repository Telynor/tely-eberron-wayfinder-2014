from pathlib import Path
import json,zipfile,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1];manifest=json.loads((ROOT/'module.json').read_text());dist=ROOT/'dist';dist.mkdir(exist_ok=True)
ID=manifest['id'];install=dist/(ID+'.zip');source=dist/(ID+'-source.zip')
def files(names):
 for name in names:
  p=ROOT/name
  if not p.exists():raise FileNotFoundError(p)
  for f in sorted(p.rglob('*')) if p.is_dir() else [p]:
   if f.is_file() and '__pycache__'not in f.parts and f.name not in ['LOCK','LOG','LOG.old']:yield f
with zipfile.ZipFile(install,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
 for f in files(['module.json','README.md','NOTICE.md','scripts','packs','content/mark-config.json','assets','docs']):
  if f.name=='clawfoot-raptor.png':continue
  z.write(f,str(f.relative_to(ROOT)))
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
 for f in files(['module.json','README.md','NOTICE.md','package.json','requirements.txt','.gitignore','scripts','content','packs-src','source','tools','tests','docs']):z.write(f,str(f.relative_to(ROOT)))
shutil.copyfile(ROOT/'module.json',dist/'module.json')
artifacts=[dist/'module.json',install,source];checksums=''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n'for f in artifacts);(dist/'SHA256SUMS.txt').write_text(checksums)
for p in [install,source]:
 with zipfile.ZipFile(p)as z:
  assert z.testzip()is None;assert 'module.json'in z.namelist();assert json.loads(z.read('module.json'))==manifest
print(json.dumps([{'file':str(f),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}for f in artifacts],indent=2))
