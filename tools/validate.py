"""Offline release checks. A real Foundry data-model run is separately required."""
from pathlib import Path
import json,re,sys,hashlib,collections,subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];M=json.loads((ROOT/'module.json').read_text());ID=M['id'];errors=[];warnings=[];images=set();refs=set();docs={};activity_count=0;embedded=0
icons=set(json.loads((ROOT/'source/icon-catalog.json').read_text())['paths'])
registry=json.loads((ROOT/'source/shared-content-registry.json').read_text());external={e['uuid'] for e in registry['entries']}
handlers=set(re.findall(r"(?:handlers|itemHandlers|actions)\[['\"]([^'\"]+)['\"]\]",'\n'.join(p.read_text() for p in (ROOT/'scripts').glob('*.mjs'))))
def check(ok,message):
 if not ok:errors.append(message)
def walk(x):
 if isinstance(x,str):
  if x.startswith('Compendium.') and ' 'not in x:refs.add(x)
  refs.update(re.findall(r'@UUID\[(Compendium\.[^\]#]+)',x))
 elif isinstance(x,list):
  for v in x:walk(v)
 elif isinstance(x,dict):
  if x.get('img'):images.add(x['img'])
  if x.get('src') and x.get('type')=='image':images.add(x['src'])
  for v in x.values():walk(v)
def item(d,where):
 global activity_count,embedded
 check(bool(d.get('img')),where+': missing image')
 for a in d.get('system',{}).get('activities',{}).values():
  activity_count+=1;handler=a.get('flags',{}).get(ID,{}).get('handler');check(not handler or handler in handlers,where+': unknown handler '+str(handler))
  check(a.get('_id') and re.fullmatch(r'[a-zA-Z0-9]{16}',a['_id']),where+': invalid activity ID')
  check(a['type']in ['utility','attack','save','heal','cast','damage','enchant','summon'],where+': invalid activity type')
  for target in a.get('consumption',{}).get('targets',[]):check(target['type']in ['itemUses','activityUses'],where+': unsupported resource type')
  if a['type']=='cast':check(bool(a.get('spell',{}).get('uuid')),where+': missing spell UUID')
 for adv in d.get('system',{}).get('advancement',{}).values():check(adv['type']in ['Trait','AbilityScoreImprovement','ItemGrant','Size'],where+': unsupported advancement type')
 for i in d.get('items',[]):embedded+=1;item(i,where+' / '+i['name'])
counts={}
for pack in M['packs']:
 ds=json.loads((ROOT/'content'/f'{pack["name"]}.json').read_text());counts[pack['name']]=len(ds);ids=set()
 for d in ds:
  where=pack['name']+' / '+d['name'];check(d['_id']not in ids,where+': duplicate ID');ids.add(d['_id']);check(bool(re.fullmatch(r'[a-zA-Z0-9]{16}',d['_id'])),where+': invalid ID')
  uuid=f'Compendium.{ID}.{pack["name"]}.{pack["type"]}.{d["_id"]}';docs[uuid]=d
  check(not d.get('type')in ['class','subclass'],where+': class or subclass duplication')
  if pack['type']in ['Item','Actor']:item(d,where)
  elif pack['type']=='JournalEntry':check(bool(d.get('flags',{}).get(ID,{}).get('icon')),where+': missing journal thumbnail')
  else:check(bool(d.get('img')),where+': missing image')
  if pack['type']=='RollTable':
   c,n=[int(v or 1) for v in d['formula'].split('d')];r=[i for e in d['results'] for i in range(e['range'][0],e['range'][1]+1)];check(sorted(r)==list(range(c,c*n+1)),where+': missing or overlapping results');check(all(e['text'].strip()for e in d['results']),where+': empty table result')
  walk(d)
for ref in refs:check(ref in docs or ref in external,'Unresolved reference: '+ref)
for image in images:
 if image.startswith('modules/'+ID+'/'):check((ROOT/image[len('modules/'+ID+'/'):]).is_file(),'Missing module image: '+image)
 elif image.startswith('icons/'):check(image in icons,'Unverified Foundry icon: '+image)
 else:errors.append('Unpackaged image: '+image)
for d in json.loads((ROOT/'content/creatures.json').read_text()):
 for image in [d['img'],d['prototypeToken']['texture']['src']]:
  p=ROOT/image[len('modules/'+ID+'/'):];im=Image.open(p).convert('RGBA');alpha=im.getchannel('A');check(alpha.getextrema()[0]==0 and alpha.getextrema()[1]==255,'Creature image is not transparent: '+d['name']);check(all(im.getpixel(pt)[3]==0 for pt in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]),'Creature image has opaque background corners: '+d['name'])
# Cross-book item collisions, including changes of Foundry item subtype.
physical={'equipment','weapon','consumable','loot'}
def norm(s):return re.sub('[^a-z0-9]+',' ',s.lower().replace('’',"'")).strip()
for pack in ['ancestries','feats','spells','equipment']:
 for d in json.loads((ROOT/'content'/f'{pack}.json').read_text()):
  collision=[e for e in registry['entries']if e['normalized']==norm(d['name'])and(e['type']==d['type']or e['type']in physical and d['type']in physical)];check(not collision,'Cross-book duplicate: '+d['name'])
for p in (ROOT/'scripts').glob('*.mjs'):
 r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True);check(r.returncode==0,p.name+': '+r.stderr)
claw=json.loads((ROOT/'content/creatures.json').read_text())[0]
check([claw['system']['abilities'][a]['value']for a in ['str','dex','con','int','wis','cha']]==[17,17,13,2,12,10],'Clawfoot ability scores differ from source')
check(claw['system']['attributes']['hp']['max']==16,'Clawfoot HP differs from source');check(not any(i['name']in ['Multiattack','Pack Tactics']for i in claw['items']),'Later-edition creature traits leaked into the prototype')
check(counts['reference']==187 and len(list((ROOT/'assets/pages').glob('*.webp')))==176,'Incomplete sourcebook page coverage')
check(counts['ancestries']==22 and counts['equipment']==28 and counts['tables']==38,'Source inventory changed unexpectedly')
report={'status':'passed'if not errors else'failed','counts':counts,'totalDocuments':sum(counts.values()),'embeddedItems':embedded,'activities':activity_count,'uniqueImages':len(images),'resolvedCompendiumReferences':len(refs),'registryEntriesChecked':len(registry['entries']),'crossBookCollisions':0 if not errors else None,'transparentCreatureImages':counts['creatures'],'errors':errors,'warnings':warnings,'liveFoundryTested':False}
(ROOT/'docs/validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));sys.exit(bool(errors))
