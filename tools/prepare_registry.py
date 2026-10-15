"""Snapshot canonical IDs, never copy another book's documents into a new pack."""
from pathlib import Path
import json,re,os,hashlib
ROOT=Path(__file__).resolve().parents[1]
TASHA=Path(os.environ.get('TASHA_SOURCE_DIR',str(ROOT.parent/'audit/tasha-published')))
def normalize(name):
    return re.sub(r'[^a-z0-9]+',' ',name.lower().replace('’',"'")).strip()
entries=[]
for p in (TASHA/'content').glob('*.json'):
    if p.stem in ['reference','handouts','macros','tables']:continue
    for d in json.loads(p.read_text()):
        dt='Actor' if p.stem=='creatures' else 'Item'
        entries.append({'name':d['name'],'normalized':normalize(d['name']),'type':d['type'],'module':'tely-tashas-2014','pack':p.stem,'uuid':f'Compendium.tely-tashas-2014.{p.stem}.{dt}.{d["_id"]}','parent':d.get('flags',{}).get('tely-tashas-2014',{}).get('parent')})
srd=json.loads((TASHA/'source/srd-spell-index.json').read_text())
for name,v in srd.items():entries.append({'name':name,'normalized':normalize(name),'type':'spell','module':'dnd5e','pack':'spells','uuid':v['uuid']})
tasha_manifest=json.loads((TASHA/'module.json').read_text())
result={'schema':1,'policy':'First published canonical document wins. Identical republished content is linked, never copied. Distinct rules require an explicit version suffix and review.','sources':[{'module':'tely-tashas-2014','version':tasha_manifest['version'],'release':'https://github.com/Telynor/tely-tashas-2014/releases/tag/v'+tasha_manifest['version'],'sourceZipSha256':hashlib.sha256((ROOT.parent/'audit/tasha-v0.1.1-source.zip').read_bytes()).hexdigest()},{'module':'dnd5e','version':'5.3.3','rules':'2014'}],'entries':entries}
(ROOT/'source/shared-content-registry.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
icons=json.loads((TASHA/'source/icon-catalog.json').read_text())
(ROOT/'source/icon-catalog.json').write_text(json.dumps(icons))
print({'canonical_entries':len(entries),'icons':len(icons['paths'])})
