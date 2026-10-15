"""Build a single namespaced v14/dnd5e 5.3.3 conversion of the supplied prototype."""
from pathlib import Path
import json,re,hashlib,html,copy,sys

ROOT=Path(__file__).resolve().parents[1]
ID='tely-eberron-wayfinder-2014';MOD='modules/'+ID
PAGES=json.loads((ROOT/'source/book-pages.json').read_text())
REGISTRY=json.loads((ROOT/'source/shared-content-registry.json').read_text())
ICON_PATHS=list(json.loads((ROOT/'source/icon-catalog.json').read_text())['paths'])
PACKS={k:[] for k in ['ancestries','features','feats','backgrounds','equipment','spells','creatures','tables','reference','macros']}
FEATURES={};ALIASES=[];REQUIRED_SPELLS={}
def uid(key):return hashlib.sha256((ID+':'+key).encode()).hexdigest()[:16]
def slug(s):return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
def normalize(s):return re.sub('[^a-z0-9]+',' ',s.lower().replace('’',"'")).strip()
def ref(pack,key):return f'Compendium.{ID}.{pack}.{"Actor" if pack=="creatures" else "JournalEntry" if pack=="reference" else "RollTable" if pack=="tables" else "Macro" if pack=="macros" else "Item"}.{uid(key)}'
def page_ref(n):return ref('reference','page:'+str(n))
def icon(part):
    candidates=[s for s in ICON_PATHS if part.lower() in s.lower()]
    return sorted(candidates)[0] if candidates else 'icons/sundries/books/book-open-purple.webp'
def art(name):return f'{MOD}/assets/art/{name}.png'
def text(page,start=None,end=None,last=None):
    s='\n'.join(p['text'] for p in PAGES[page-1:(last or page)])
    s=re.sub(r'\n(?:\d+ )?CHAPTER [^\n]*|\n\d{1,3}(?=\n|$)','',s)
    if start:
        k=s.find(start)
        if k<0:raise ValueError(f'Missing source heading {start!r} on {page}')
        s=s[k+len(start):]
    if end and end in s:s=s[:s.index(end)]
    return re.sub(r'(?<=[a-z])-\n(?=[a-z])','',s).strip()
def prose(s):return '<p>'+html.escape(s).replace('\n\n','</p><p>').replace('\n',' ')+'</p>'
def description(s,page):return prose(s)+f'<p><strong>WGtE 2018 prototype, p. {page}.</strong> @UUID[{page_ref(page)}]{{Original printed page}}</p>'
def item(name,typ,key,page,body='',pack='features',image=None,meta=None):
    d={'_id':uid(key),'name':name,'type':typ,'img':image or icon('runes-carved-stone'),'system':{'identifier':slug(key),'description':{'value':description(body,page),'chat':''},'source':{'book':'WGtE','page':str(page),'custom':"Wayfinder's Guide to Eberron (original 2018 prototype)",'rules':'2014','license':''}},'effects':[],'flags':{ID:{'key':key,'sourcePage':page,'automation':'native',**(meta or {})}},'folder':None,'sort':0,'ownership':{'default':0},'_stats':{'systemId':'dnd5e','systemVersion':'5.3.3'}}
    if typ in ['feat','equipment','weapon','consumable','spell']:
        d['system'].update(activities={},uses={'spent':0,'max':'','recovery':[]})
    if typ=='feat':d['system'].update(type={'value':'race' if pack=='features' else 'feat','subtype':''},requirements='',prerequisites={'level':None,'items':[],'repeatable':False},properties=[],advancement={})
    if typ in ['equipment','weapon','consumable','loot']:
        d['system'].update(quantity=1,weight={'value':0,'units':'lb'},price={'value':0,'denomination':'gp'},attunement='',attuned=False,equipped=False,identified=True,rarity='common',properties=[])
    PACKS[pack].append(d);return d
def effect(d,name,changes=(),duration=None,statuses=(),transfer=True,meta=None,typ='base'):
    e={'_id':uid(d['_id']+':effect:'+name),'name':name,'img':d['img'],'type':typ,'disabled':False,'transfer':transfer,'changes':[{'key':k,'value':str(v),'mode':m,'priority':20} for k,v,m in changes],'duration':duration or {},'statuses':list(statuses),'flags':{ID:meta or {}}}
    d['effects'].append(e);return e
def adv(d,typ,title,cfg,level=0):
    a={'_id':uid(d['_id']+':adv:'+title+':'+str(level)),'type':typ,'title':title,'level':level,'configuration':cfg,'value':{}}
    d['system'].setdefault('advancement',{})[a['_id']]=a;return a
def traits(d,title,grants=(),choices=(),mode='default'):
    return adv(d,'Trait',title,{'mode':mode,'allowReplacements':d['type']=='background','grants':list(grants),'choices':list(choices)})
def asi(d,fixed=None,points=0,allowed=None,cap=1,title='Ability Score Increase'):
    return adv(d,'AbilityScoreImprovement',title,{'points':points,'cap':cap,'max':20,'fixed':{a:(fixed or {}).get(a,0) for a in ['str','dex','con','int','wis','cha']},'locked':[a for a in ['str','dex','con','int','wis','cha'] if allowed and a not in allowed],'recommendation':None})
def grant(d,keys,title='Ancestry Features',level=0):
    return adv(d,'ItemGrant',title,{'items':[{'uuid':ref('features',k),'optional':False} for k in keys],'optional':False,'spell':None},level)
def uses(d,maxi=1,rest='lr'):
    d['system']['uses']={'spent':0,'max':str(maxi),'recovery':[{'period':rest,'type':'recoverAll','formula':''}] if rest else []}
def damage(formula,typ):
    m=re.fullmatch(r'(\d+)d(\d+)(?:\s*\+\s*(.*))?',formula)
    return {'number':int(m[1]) if m else None,'denomination':int(m[2]) if m else None,'bonus':(m[3] or '') if m else '', 'types':[typ] if typ else [],'custom':{'enabled':not bool(m),'formula':formula if not m else ''},'scaling':{'mode':'','number':None,'formula':''}}
def activity(d,name,typ='utility',handler=None,activation='action',r=0,target='self',count='1',formula=None,dtype=None,save=None,dc='spellcasting',duration=None,consume=False,meta=None):
    a={'_id':uid(d['_id']+':activity:'+name),'name':name,'type':typ,'activation':{'type':activation,'value':1,'condition':'','override':True},'consumption':{'spellSlot':False,'targets':[{'type':'itemUses','target':'','value':'1','scaling':{'mode':'','formula':''}}] if consume else [],'scaling':{'allowed':False,'max':''}},'description':{'chatFlavor':''},'duration':{'value':str(duration or ''),'units':'second' if duration else 'inst','concentration':False,'special':'','override':True},'effects':[],'range':{'value':r or None,'units':'self' if target=='self' else 'ft','special':'','override':True},'target':{'affects':{'count':count,'type':target,'choice':False,'special':''},'template':{'count':'','contiguous':False,'type':'','size':'','width':'','height':'','units':'ft'},'prompt':True,'override':True},'uses':{'spent':0,'max':'','recovery':[]},'visibility':{'level':{'min':None,'max':None},'requireAttunement':bool(d['system'].get('attunement')),'requireIdentification':False,'requireMagic':False},'sort':len(d['system']['activities']),'flags':{ID:{**({'handler':handler} if handler else {}),**(meta or {})}}}
    if typ=='utility':a['roll']={'prompt':bool(formula),'visible':bool(formula),'name':name,'formula':formula or ''}
    if typ=='attack':a.update(attack={'ability':'str','bonus':'','flat':False,'critical':{'threshold':None},'type':{'value':'melee','classification':'weapon'}},damage={'includeBase':False,'critical':{'bonus':''},'parts':[damage(formula,dtype)] if formula else []})
    if typ=='save':a.update(save={'ability':[save] if save else [],'dc':{'calculation':dc if not isinstance(dc,int) else '','formula':str(dc) if isinstance(dc,int) else ''}},damage={'onSave':'none','parts':[damage(formula,dtype)] if formula else []})
    if typ=='heal':a['healing']=damage(formula or '0',dtype or 'healing')
    d['system']['activities'][a['_id']]=a;return a
def feature(name,key,page,body='',handler=None,activation='action',r=0,rest=None,image=None,meta=None):
    d=item(name,'feat',key,page,body,image=image,meta=meta);FEATURES[key]=d
    if handler:activity(d,name,handler=handler,activation=activation,r=r,target='creature' if r else 'self',consume=bool(rest))
    if rest:uses(d,1,rest)
    return d
def rule(page,name,end=None,last=None):return text(page,name+'.',end,last)
def spell_uuid(name):
    aliases={'Locate Animals or Plants':['Locate Animals or Plants','Locate Animal or Plant'],"Mordenkainen's Magnificent Mansion":['Magnificent Mansion'],"Leomund's Secret Chest":['Secret Chest'],'Control Winds':['Control Wind']}
    candidates=[name]+aliases.get(name,[])
    entry=next((e for e in REGISTRY['entries'] if e['type']=='spell' and e['normalized'] in {normalize(c) for c in candidates}),None)
    REQUIRED_SPELLS[name]=entry['uuid'] if entry else None
    return entry['uuid'] if entry else None
def cast(d,name,ability,rest=None,level=0,ritual=False,activation='action',spell_level=None,material=True):
    u=ref('spells','spell:Gust') if name=='Gust' else spell_uuid(name)
    if not u:
        return activity(d,'Cast '+name,handler='cast-spell',activation=activation,consume=False,meta={'spell':name,'ability':ability,'rest':rest,'minimumLevel':level,'ritualOnly':ritual,'spellLevel':spell_level,'materialComponents':material})
    a=activity(d,'Cast '+name,'cast',activation=activation)
    for k in ['activation','duration','range','target']:a[k]['override']=False
    a['spell']={'uuid':u,'level':spell_level,'ability':ability,'properties':[] if material else ['material'],'spellbook':True,'challenge':{'override':False,'attack':None,'save':None}}
    a['visibility']['level']['min']=level or None
    if rest:a['uses']={'spent':0,'max':'1','recovery':[{'period':rest,'type':'recoverAll','formula':''}]};a['consumption']['targets']=[{'type':'activityUses','target':'','value':'1'}]
    a['flags'][ID]={'spell':name,'ability':ability,'ritualOnly':ritual,'spellLevel':spell_level,'materialComponents':material,'minimumLevel':level}
    if activation!='action':a['activation'].update(override=True,type=activation)
    return a

def build_races():
    f=feature('Change Appearance','changeling:appearance',61,rule(61,'Change Appearance','Changeling Instincts.'),'appearance',image=art('changeling'))
    feature('Changeling Instincts','changeling:instincts',61,rule(61,'Changeling Instincts','Unsettling Visage.'),image=art('changeling'))
    feature('Unsettling Visage','changeling:visage',61,rule(61,'Unsettling Visage','Divergent Persona.'),'unsettling-visage','reaction',rest='sr',image=art('changeling'))
    feature('Divergent Persona','changeling:persona',61,rule(61,'Divergent Persona','Languages.'),'persona',image=art('changeling'))
    feature('Dual Mind','kalashtar:dual-mind',63,rule(63,'Dual Mind','Mental Discipline.'),'dual-mind','reaction',image=art('kalashtar'))
    f=feature('Mental Discipline','kalashtar:discipline',63,rule(63,'Mental Discipline','Mind Link.'),image=art('kalashtar'));effect(f,'Psychic Resistance',[('system.traits.dr.value','psychic',2)])
    feature('Mind Link','kalashtar:mind-link',63,rule(63,'Mind Link','Psychic Glamour.'),'mind-link','bonus',60,image=art('kalashtar'))
    feature('Psychic Glamour','kalashtar:glamour',63,rule(63,'Psychic Glamour','Severed from Dreams.'),'psychic-glamour',image=art('kalashtar'))
    feature('Severed from Dreams','kalashtar:dreams',63,rule(63,'Severed from Dreams','Languages.'),image=art('kalashtar'),meta={'dreamImmunity':True})
    feature('Shifting','shifter:shifting',65,rule(65,'Shifting','Languages.'),'shifting','bonus',rest='sr',image=art('shifter'))
    for sub,start,end in [('Beasthide','BEASTHIDE','LONGTOOTH'),('Longtooth','LONGTOOTH','SWIFTSTRIDE'),('Swiftstride','SWIFTSTRIDE','WILDHUNT'),('Wildhunt','WILDHUNT',None)]:
        f=feature(sub+' Shifting Feature','shifter:'+sub.lower(),66,text(66,start,end),image=art('shifter'),meta={'shifterSubrace':sub.lower()})
        if sub=='Longtooth':activity(f,'Fangs (While Shifted)','attack',activation='bonus',r=5,target='creature',formula='1d6 + @mod',dtype='piercing',meta={'requiresShift':True})
        if sub=='Swiftstride':activity(f,'Swiftstride Reaction',handler='swiftstride-reaction',activation='reaction',meta={'requiresShift':True})
        if sub=='Wildhunt':
            a=activity(f,'Mark the Scent',handler='mark-scent',activation='bonus',r=10,target='creature',consume=True);uses(f,1,'sr')
    f=feature('Warforged Resilience','warforged:resilience',68,rule(68,'Warforged Resilience'),image=art('warforged'),meta={'noFood':True,'noWater':True,'noBreathing':True,'noSleep':True,'diseaseImmunity':True,'magicalSleepImmunity':True})
    effect(f,'Poison Resistance',[('system.traits.dr.value','poison',2)])
    feature("Sentry's Rest",'warforged:rest',69,rule(69,'Sentry’s Rest','INTEGRATED PROTECTION'),image=art('warforged'))
    feature('Integrated Protection','warforged:protection',69,rule(69,'Integrated Protection','Languages.'),'integrated-protection',image=art('warforged'))
    feature('Specialized Design','warforged:envoy-design',69,rule(69,'Specialized Design','Integrated Tool.'),image=art('warforged'))
    feature('Integrated Tool','warforged:integrated-tool',69,rule(69,'Integrated Tool','Effect'),'integrated-tool',image=art('warforged'))
    f=feature('Iron Fists','warforged:iron-fists',70,rule(70,'Iron Fists','Powerful Build.'),image=art('warforged'))
    activity(f,'Iron Fists','attack',r=5,target='creature',formula='1d4 + @mod',dtype='bludgeoning')
    f=feature('Powerful Build','warforged:powerful-build',70,rule(70,'Powerful Build','SKIRMISHER'),image=art('warforged'));effect(f,'Powerful Build',[('flags.dnd5e.powerfulBuild','true',5)])
    feature('Light Step','warforged:light-step',70,rule(70,'Light Step'),image=art('warforged'),meta={'narrative':'Normal travel pace while moving alone for at least one hour.'})
    # Base ancestry traits required by the dragonmarked subraces. Each is defined only once.
    f=feature('Fey Ancestry','base:fey-ancestry',96,'Advantage on saves against being charmed; magic cannot put you to sleep.',image=icon('fae-fairy'),meta={'charmSaveAdvantage':True,'magicalSleepImmunity':True})
    f=feature('Halfling Lucky','base:halfling-lucky',99,'Reroll a natural 1 on an attack roll, ability check, or saving throw and use the new result.',image=icon('buff-luck'));effect(f,'Halfling Lucky',[('flags.dnd5e.halflingLucky','true',5)])
    feature('Brave','base:brave',99,'Advantage on saving throws against being frightened.',image=icon('lion'),meta={'fearSaveAdvantage':True})
    feature('Halfling Nimbleness','base:nimbleness',99,'Move through the space of a creature of a size larger than yours.',image=icon('feet-winged'),meta={'narrative':'Movement through larger creatures remains subject to map occupancy.'})
    feature('Gnome Cunning','base:gnome-cunning',103,'Advantage on Intelligence, Wisdom, and Charisma saving throws against magic.',image=icon('rune'),meta={'gnomeCunning':True})
    f=feature('Dwarven Resilience','base:dwarven-resilience',108,'Advantage on saving throws against poison and resistance to poison damage.',image=icon('poison'),meta={'poisonSaveAdvantage':True});effect(f,'Poison Resistance',[('system.traits.dr.value','poison',2)])
    feature('Stonecunning','base:stonecunning',108,'When making an Intelligence (History) check related to stonework, add double proficiency instead of the usual proficiency bonus.',image=icon('stone-earth'),meta={'stonecunning':True})
    f=feature('Trance','base:trance',105,'Meditate deeply for 4 hours a day instead of sleeping. You remain semiconscious.',image=icon('meditate'),meta={'noSleep':True})
    def race(name,key,page,body,features,fixed=None,points=0,allowed=None,cap=1,languages=('common',),choices=0,size='med',speed=30,senses=0,image=None,subtype=None,mark=None):
        d=item(name,'race',key,page,body,'ancestries',image,{'ancestry':True,'subrace':subtype,'mark':mark})
        d['system'].update(type={'value':'humanoid','subtype':subtype or name,'custom':''},movement={'walk':speed,'swim':30 if mark=='storm' else 0,'units':'ft'},senses={'darkvision':senses,'units':'ft'},advancement={})
        adv(d,'Size','Size',{'sizes':[size]});asi(d,fixed,points,allowed,cap)
        traits(d,'Languages',['languages:'+l for l in languages],[{'count':choices,'pool':['languages:*']}] if choices else [])
        if features:grant(d,features)
        return d
    d=race('Changeling','race:changeling',61,text(61,'CHANGELING TRAITS'),['changeling:appearance','changeling:instincts','changeling:visage','changeling:persona'],{'cha':2},1,['dex','int'],languages=['common'],choices=2,image=art('changeling'))
    traits(d,'Changeling Instincts',choices=[{'count':2,'pool':['skills:dec','skills:itm','skills:ins','skills:per']}]);traits(d,'Divergent Persona Tool',choices=[{'count':1,'pool':['tool:*']}])
    race('Kalashtar','race:kalashtar',63,text(63,'KALASHTAR TRAITS'),['kalashtar:dual-mind','kalashtar:discipline','kalashtar:mind-link','kalashtar:glamour','kalashtar:dreams'],{'wis':1,'cha':1},1,languages=['common','quori'],choices=1,image=art('kalashtar'))
    for sub,fixed,skill in [('beasthide',{'dex':1,'con':2},'ath'),('longtooth',{'dex':1,'str':2},'itm'),('swiftstride',{'dex':2,'cha':1},'acr'),('wildhunt',{'dex':1,'wis':2},'sur')]:
        d=race('Shifter ('+sub.title()+')','race:shifter:'+sub,66,text(65,'SHIFTER TRAITS')+'\n\n'+FEATURES['shifter:'+sub]['system']['description']['value'],['shifter:shifting','shifter:'+sub],fixed,speed=35 if sub=='swiftstride' else 30,senses=60,image=art('shifter'),subtype=sub)
        traits(d,'Keen Senses and Subrace Skill',['skills:prc','skills:'+skill])
    for sub in ['envoy','juggernaut','skirmisher']:
        fs=['warforged:resilience','warforged:rest','warforged:protection']+({'envoy':['warforged:envoy-design','warforged:integrated-tool'],'juggernaut':['warforged:iron-fists','warforged:powerful-build'],'skirmisher':['warforged:light-step']}[sub])
        fixed={'con':1,**({'str':2} if sub=='juggernaut' else {'dex':2} if sub=='skirmisher' else {})}
        d=race('Warforged ('+sub.title()+')','race:warforged:'+sub,69,text(68,'WARFORGED TRAITS')+'\n\n'+text(69,'Sentry’s Rest.'),fs,fixed,2 if sub=='envoy' else 0,cap=1,speed=35 if sub=='skirmisher' else 30,choices=1 if sub=='envoy' else 0,image=art('warforged'),subtype=sub)
        if sub=='envoy':traits(d,'Specialized Design',choices=[{'count':1,'pool':['skills:*']},{'count':1,'pool':['tool:*']}])
    return race

MARKS={
 'detection':{'page':96,'base':'half-elf','fixed':{'int':1,'cha':1},'points':1,'skills':['inv','ins'],'intuition':'Deductive Intuition','traits':['Sense Threats'],'casts':[('Detect Magic','int',None,0,True),('Detect Poison and Disease','int',None,0,True)]},
 'finding':{'page':97,'base':'human','fixed':{'dex':1,'wis':1},'points':1,'skills':['prc','sur'],'intuition':"Hunter's Intuition",'traits':['Imprint Prey',"Nature’s Voice"],'casts':[('Locate Animals or Plants','wis',None,3,True)]},
 'handling':{'page':98,'base':'human','fixed':{'dex':1,'wis':1},'points':1,'skills':['ani','nat'],'intuition':'Wild Intuition','traits':['Expert Handling','Primal Connection','The Bigger They Are'],'casts':[('Animal Friendship','wis','sr',0,False)]},
 'healing':{'page':99,'base':'halfling','fixed':{'dex':2,'wis':1},'skills':['med'],'intuition':'Medical Intuition','traits':['Healing Touch']},
 'hospitality':{'page':100,'base':'halfling','fixed':{'dex':2,'cha':1},'skills':['per'],'tools':['brewer','cook'],'intuition':'Ever Hospitable','traits':["Innkeeper’s Charms"],'casts':[('Friends','cha',None,0,False),('Prestidigitation','cha',None,0,False)]},
 'making':{'page':101,'base':'human','fixed':{'int':1,'dex':1},'points':1,'allowed':['int','dex'],'skills':[],'artisan':True,'intuition':"Artisan’s Intuition",'traits':["Maker’s Gift",'Magecraft','Spellsmith'],'casts':[('Mending','int',None,0,False)]},
 'passage':{'page':102,'base':'human','fixed':{'dex':2},'points':1,'allowed':['str','con','int','wis','cha'],'skills':['ath'],'tools':['land'],'intuition':'Intuitive Motion','traits':["Courier’s Speed",'Determined Stride','Shared Passage']},
 'scribing':{'page':103,'base':'gnome','fixed':{'int':2,'cha':1},'skills':[],'tools':['calligrapher','forg'],'intuition':'Gifted Scribe','traits':["Scribe’s Insight",'Whispering Wind','Extra Language'],'casts':[('Comprehend Languages','int','lr',0,False),('Message','int',None,0,False)]},
 'sentinel':{'page':104,'base':'human','fixed':{'str':1,'wis':1},'points':1,'skills':['prc'],'conditional':True,'initiative':True,'intuition':"Sentinel’s Intuition",'traits':["Sentinel’s Shield",'Vigilant Guardian'],'casts':[('Blade Ward','wis',None,0,False),('Shield','wis','sr',0,False)]},
 'shadow':{'page':105,'base':'elf','fixed':{'dex':2,'cha':1},'skills':['prf','ste'],'intuition':'Gift of the Shadows','traits':['Natural Talent','Shape Shadows','Slip Into Shadow'],'casts':[('Minor Illusion','cha',None,0,False)]},
 'storm':{'page':106,'base':'half-elf','fixed':{'dex':1,'cha':1},'points':1,'skills':['acr'],'tools':['water','air'],'intuition':"Windwright’s Intuition",'traits':['Sea Monkey',"Storm’s Blessing",'Headwinds'],'casts':[('Gust','cha',None,0,False),('Gust of Wind','cha','lr',3,False)]},
 'warding':{'page':108,'base':'dwarf','fixed':{'con':2,'dex':1,'int':1},'skills':['his','inv'],'tools':['thief'],'conditional':True,'intuition':'Master of Locks','traits':['Wards and Seals'],'casts':[('Alarm','int',None,0,True),('Arcane Lock','int','lr',3,False)]}
}
GREATER={
 'detection':(['cha','int'],'int','lr',['See Invisibility','True Seeing']),
 'finding':(['dex','str','wis'],'wis','lr',['Locate Creature','Find the Path']),
 'handling':(['dex','wis'],'wis','lr',['Beast Sense','Dominate Beast']),
 'healing':(['dex','wis'],'wis','lr',['Mass Healing Word','Greater Restoration']),
 'hospitality':(['cha','dex'],'cha','lr',['Sanctuary',"Mordenkainen's Magnificent Mansion"]),
 'making':(['dex','int'],'int','lr',['Fabricate','Creation']),
 'passage':(['dex','con'],'con','lr',['Blink','Teleportation Circle']),
 'scribing':(['int','cha'],'int','sr',['Sending','Tongues']),
 'sentinel':(['str','wis'],'wis','sr',['Compelled Duel','Warding Bond']),
 'shadow':(['cha','dex'],'cha','lr',['Nondetection','Mislead']),
 'storm':(['cha','dex'],'cha','lr',['Control Water','Control Winds']),
 'warding':(['dex','int'],'int','lr',['Knock','Glyph of Warding',"Leomund's Secret Chest"])
}

def build_marks(race):
    for mark,c in MARKS.items():
        page=c['page'];region=text(page,'TRAITS');names=[c['intuition']]+c['traits'];fs=[]
        for name in names:
            source_name=name.replace("'",'’')
            # The 2018 typography mixes curly and straight apostrophes.
            label=next((n for n in [name,source_name,name.replace('’',"'")] if n+'.' in region),None)
            body=region[region.index(label+'.')+len(label)+1:] if label else region
            nxt=re.search(r'\n[A-Z][A-Za-z’\'’ -]{2,45}\. ',body)
            if nxt:body=body[:nxt.start()]
            k='mark:'+mark+':'+slug(name);fs.append(k)
            data={'mark':mark}
            if name==c['intuition']:data['intuition']={k:v for k,v in c.items() if k in ['skills','tools','artisan','conditional','initiative']}
            handler={"Imprint Prey":'imprint-prey','Healing Touch':'healing-touch','Magecraft':'magecraft','Spellsmith':'spellsmith','Shared Passage':'shared-passage','Vigilant Guardian':'vigilant-guardian','Slip Into Shadow':'hide','Expert Handling':'help','Determined Stride':'determined-stride'}.get(name)
            activation='bonus' if handler in ['imprint-prey','shared-passage','hide'] else 'action'
            rest='sr' if handler in ['imprint-prey','healing-touch','hide'] else 'lr' if handler in ['spellsmith','shared-passage'] else None
            r=30 if handler in ['imprint-prey','help'] else 5 if handler=='healing-touch' else 0
            d=feature(name,k,page,body,handler,activation,r,rest,image=icon('runes-carved-stone'),meta=data)
            if name=='Storm’s Blessing':effect(d,'Lightning Resistance',[('system.traits.dr.value','lightning',2)])
            if name=='Vigilant Guardian':
                activity(d,'Swap With Ward',handler='guardian-swap',activation='reaction',r=5,target='creature');activity(d,'Spot Threats to Ward',handler='conditional-check')
            if name=='Natural Talent':activity(d,'Choose Talent',handler='natural-talent')
        if c.get('casts'):
            caster=FEATURES[next(k for k in fs if k.endswith(slug(c['traits'][-1]))) ]
            # Keep spell buttons grouped on the trait that actually grants them.
            for name,ab,rest,lvl,ritual in c['casts']:
                target_name={'Mending':'Maker’s Gift','Friends':'Innkeeper’s Charms','Prestidigitation':'Innkeeper’s Charms','Comprehend Languages':'Scribe’s Insight','Message':'Whispering Wind','Minor Illusion':'Shape Shadows','Animal Friendship':'Primal Connection','Blade Ward':'Sentinel’s Shield','Shield':'Sentinel’s Shield','Gust':'Headwinds','Gust of Wind':'Headwinds','Alarm':'Wards and Seals','Arcane Lock':'Wards and Seals'}.get(name,c['traits'][-1])
                cast(FEATURES['mark:'+mark+':'+slug(target_name)],name,ab,rest,lvl,ritual,activation='reaction' if name=='Shield' else 'action')
        base=c['base'];bases=['half-orc','human'] if mark=='finding' else [base]
        for base in bases:
            extra=[];lang=['common'];lc=0;size='med';speed=40 if mark=='passage' else 30;senses=0
            if base=='half-elf':extra=['base:fey-ancestry'];lang=['common','elvish'];senses=60
            if base=='halfling':extra=['base:halfling-lucky','base:brave','base:nimbleness'];lang=['common','halfling'];size='sm';speed=25
            if base=='elf':extra=['base:fey-ancestry','base:trance'];lang=['common','elvish'];senses=60
            if base=='gnome':extra=['base:gnome-cunning'];lang=['common','gnomish'];lc=1;size='sm';speed=25;senses=60
            if base=='dwarf':extra=['base:dwarven-resilience','base:stonecunning'];lang=['common','dwarvish'];speed=25;senses=60
            if base=='human' and mark!='finding':lc=1
            if mark=='finding':lang=['common','goblin'];senses=60
            fixed=copy.deepcopy(c['fixed'])
            if mark=='finding' and base=='half-orc':fixed={'str':1,'wis':1}
            d=race('Mark of '+mark.title()+' ('+base.title()+')','race:mark:'+mark+':'+base,page,region,extra+fs,fixed,c.get('points',0),c.get('allowed'),languages=lang,choices=lc,size=size,speed=speed,senses=senses,mark=mark,subtype=base)
            if base=='elf':traits(d,'Keen Senses',['skills:prc'])
            if base=='dwarf':
                traits(d,'Dwarven Combat Training',['weapon:mar:battleaxe','weapon:sim:handaxe','weapon:sim:lighthammer','weapon:mar:warhammer'])
                traits(d,'Dwarven Tool Proficiency',choices=[{'count':1,'pool':['tool:art:smith','tool:art:brewer','tool:art:mason']}])
            if mark=='making':traits(d,"Maker's Gift",choices=[{'count':1,'pool':['tool:art:*']}])
            if mark=='scribing':traits(d,'Gifted Scribe',['tool:art:calligrapher','tool:forg'])
    d=item('Revenant Blade','feat','feat:revenant-blade',74,text(74,'FEAT: REVENANT BLADE','ELVES OF KHORVAIRE'),'feats',icon('sword'),{'revenantBlade':True});d['system']['requirements']='Elf';asi(d,points=1,allowed=['str','dex']);activity(d,'Wield Double Blade',handler='revenant-blade')
    d=item('Greater Dragonmark','feat','feat:greater-dragonmark',110,text(110,'FEAT: GREATER DRAGONMARK'),'feats',icon('rune'),{'greaterMark':True});d['system']['prerequisites']['level']=8;d['system']['requirements']='8th level; a true dragonmark';activity(d,'Configure Greater Dragonmark',handler='greater-dragonmark')
    d=item('Aberrant Dragonmark','feat','feat:aberrant-dragonmark',112,text(112,'FEAT: ABERRANT DRAGONMARK'),'feats',icon('tentacle'),{'aberrantMark':True});d['system']['requirements']='No existing dragonmark';asi(d,{'con':1});activity(d,'Choose Aberrant Spells',handler='aberrant-spells');activity(d,'Cast Aberrant Spell',handler='aberrant-cast');activity(d,'Cast Aberrant Cantrip',handler='aberrant-cantrip')
    for n in ['Aereni','Valenar']:
        d=feature(n+' Elf Training','elf:'+n.lower(),73,text(73,'ELF VARIANTS','ELVES OF VALENAR'),'elf-training',image=icon('bow'),meta={'culture':n.lower()})
        d['system']['requirements']='Elf; replaces Elf Weapon Training'
    for mark,(_,ability,rest,spells) in GREATER.items():
        for name in spells:spell_uuid(name)

def build_background():
    f=feature('House Connections','background:house-connections',95,text(95,'FEATURE: HOUSE CONNECTIONS','SUGGESTED CHARACTERISTICS'),'house-connections',image=icon('handshake'),meta={'narrative':'House standing determines favors and assistance.'});f['system']['type']={'value':'background','subtype':''}
    d=item('House Agent','background','background:house-agent',94,text(94,'HOUSE AGENT')+'\n\n'+text(95),'backgrounds',icon('signet'),{'houseAgent':True})
    d['system']['advancement']={};traits(d,'House Agent Skills',['skills:inv','skills:per']);grant(d,['background:house-connections'],'House Connections')
    d['system']['description']['value']+='<p>After choosing your house, use the House Connections activity to configure its two tool proficiencies and claim the printed starting equipment once.</p>'

def build_spells():
    d=item('Gust','spell','spell:Gust',107,text(107,'GUST'),'spells',icon('wind-vortex'))
    d['system'].update(level=0,school='trs',method='spell',prepared=0,properties=['vocal','somatic'],materials={'value':'','consumed':False,'cost':0,'supply':0},activation={'type':'action','value':1,'condition':''},range={'value':30,'units':'ft'},target={'affects':{'type':'creature','count':'1'},'template':{'type':'','units':'ft'}},duration={'value':'','units':'inst'},ability='')
    a=activity(d,'Push Creature','save',r=30,target='creature',save='str',meta={'pushDistance':5,'maxSize':'med'})
    activity(d,'Push Unattended Object',handler='gust-object',r=30,target='object',meta={'maxWeight':5,'pushDistance':10})
    activity(d,'Harmless Air Effect',handler='cosmetic',r=30,target='space')

def build_items():
    names=[('Imbued Wood',114),('Orb of Shielding',114),('Band of Loyalty',115),('Cleansing Stone',115),('Everbright Lantern',115),('Feather Token',115),('Glamerweave',115),('Shiftweave',115),('Spellshard',115),('Bag of Bounty',116),("Inquisitive's Goggles",116),('Keycharm',116),('Rings of Shared Suffering',117),("Scribe's Pen",117),('Wheel of Wind and Water',117),('Dimensional Seal',118),('Mabaran Resonator',118),("Master's Call",119),('Spell Sink',119),('Storm Spire',119),('Armblade',120),('Docent',120),('Wand Sheath',122)]
    images={'Imbued Wood':'wand','Orb of Shielding':'orb-crystal','Band of Loyalty':'ring','Cleansing Stone':'stone','Everbright Lantern':'lantern','Feather Token':'feather', 'Glamerweave':'shirt','Shiftweave':'robe', 'Spellshard':'gem-faceted','Bag of Bounty':'sack',"Inquisitive's Goggles":'goggles','Keycharm':'key','Rings of Shared Suffering':'ring',"Scribe's Pen":'quill','Wheel of Wind and Water':'ship','Mabaran Resonator':'skull',"Master's Call":'golem','Spell Sink':'vortex','Storm Spire':'lightning','Armblade':'sword','Docent':'orb','Wand Sheath':'gauntlet'}
    allnames=[n.upper().replace("'",'’') for n,_ in names]
    for name,page in names:
        heading=name.upper().replace("'",'’');last=121 if name=='Docent' else 117 if name=='Keycharm' else page
        section=text(page,heading,last=last)
        cutoff=next((m.start() for m in re.finditer(r'\n(?:'+ '|'.join(re.escape(n) for n in allnames)+r')\n',section)),None)
        if cutoff is not None:section=section[:cutoff]
        # Orb's optional-rule box is a separate GM tool.
        if name=='Orb of Shielding':section=section.split('OPTIONAL RULE:')[0]
        d=item(name,'weapon' if name=='Armblade' else 'consumable' if name=='Feather Token' else 'equipment','item:'+slug(name),page,section,'equipment',art('dimensional-seal') if name=='Dimensional Seal' else icon(images.get(name,'gem')))
        m=d['flags'][ID];m['itemKind']=slug(name)
        first=section.split('\n',2)[0].lower()
        d['system']['rarity']='legendary' if name in ['Dimensional Seal','Mabaran Resonator',"Master's Call",'Spell Sink'] else 'veryRare' if name=='Storm Spire' else 'rare' if name=='Docent' else 'uncommon' if name in ['Bag of Bounty',"Inquisitive's Goggles",'Rings of Shared Suffering','Wheel of Wind and Water'] else 'common'
        requires=name in ['Imbued Wood','Orb of Shielding','Band of Loyalty',"Inquisitive's Goggles",'Rings of Shared Suffering','Mabaran Resonator',"Master's Call",'Storm Spire','Armblade','Docent','Wand Sheath']
        d['system']['attunement']='required' if requires else ''
        d['system']['type']={'value':'ring' if name in ['Band of Loyalty','Rings of Shared Suffering'] else 'trinket' if name=='Feather Token' else 'wondrous','subtype':''}
        if name=='Imbued Wood':m['focusTypes']=['fire'];activity(d,'Choose Imbued Wood',handler='imbued-wood')
        elif name=='Orb of Shielding':m['orbTypes']=['fire'];activity(d,'Choose Orb Material',handler='orb-material')
        elif name=='Band of Loyalty':m['deathAtZero']=True
        elif name=='Cleansing Stone':activity(d,'Clean Garments and Body',handler='cosmetic')
        elif name=='Everbright Lantern':activity(d,'Open or Close Shutter',handler='lantern')
        elif name=='Feather Token':uses(d,1,None);cast(d,'Feather Fall','int',activation='bonus');a=list(d['system']['activities'].values())[-1];a['consumption']['targets']=[{'type':'itemUses','target':'','value':'1'}]
        elif name=='Glamerweave':activity(d,'Describe Illusion',handler='cosmetic')
        elif name=='Shiftweave':activity(d,'Change Outfit',handler='shiftweave')
        elif name=='Spellshard':activity(d,'Read or Inscribe Spellshard',handler='spellshard')
        elif name=='Bag of Bounty':m['requiredMark']='hospitality';uses(d,3,'dawn');activity(d,'Create Feast',handler='bounty',consume=True)
        elif name=="Inquisitive's Goggles":m.update(requiredMark='finding',goggles=True);activity(d,'Identify Aura',handler='aura-check')
        elif name=='Keycharm':m['requiredMark']='warding';activity(d,'Bind or Manage Wards',handler='keycharm')
        elif name=='Rings of Shared Suffering':m['requiredMark']='sentinel';activity(d,'Link or End Link',handler='shared-suffering',activation='bonus')
        elif name=="Scribe's Pen":m['requiredMark']='scribing';activity(d,'Write, Reveal, or Conceal',handler='scribes-pen')
        elif name=='Wheel of Wind and Water':m['requiredMark']='storm';activity(d,'Control Vessel',handler='wheel')
        elif name in ['Dimensional Seal','Mabaran Resonator',"Master's Call",'Spell Sink','Storm Spire']:
            m['machine']=slug(name);activity(d,'Activate or Deactivate Machine',handler='machine')
            if name=="Master's Call":activity(d,'Command Warforged','save',r=52800,target='creature',save='wis',dc='int',meta={'handler':'masters-call'});list(d['system']['activities'].values())[-1]['save']['dc']={'calculation':'','formula':'14 + @abilities.int.mod'}
            if name=='Storm Spire':
                m.update(requiredMark='storm',requiresGreaterMark=True)
                cast(d,'Call Lightning','int',spell_level=5);cast(d,'Gust of Wind','int',spell_level=5);activity(d,'Control Local or Distant Weather',handler='storm-weather')
        elif name=='Armblade':
            m['warforgedOnly']=True;d['system'].update(type={'value':'martialM','baseItem':'longsword'},properties=['ver'],damage={'base':damage('1d8','slashing'),'versatile':damage('1d10','slashing')},proficient=None,magicalBonus=0)
            a=activity(d,'Armblade Attack','attack',r=5,target='creature');a['attack']['ability']='';a['damage']['includeBase']=True
            activity(d,'Choose Weapon Profile',handler='armblade')
        elif name=='Docent':m['warforgedOnly']=True;activity(d,'Configure or Consult Docent',handler='docent',activation='bonus')
        elif name=='Wand Sheath':m['warforgedOnly']=True;activity(d,'Insert or Remove Wand',handler='wand-sheath');activity(d,'Extend or Retract Wand',handler='wand-toggle',activation='bonus')
    for n,body in [('Eberron Dragonshard','Rosy red crystals used to fuel magic and refined into component dust.'),('Khyber Dragonshard','Deep blue or dark violet crystals used in binding and necromantic magic.'),('Siberys Dragonshard','Amber crystals with swirling golden veins, tied to dragonmarks.'),('Dragonshard Dust','Can replace a priced spell component, unless the DM rules otherwise.')]:
        d=item(n,'loot','item:'+slug(n),113,body+'\n\n'+text(113,'DRAGONSHARDS'),'equipment',art('khyber-dragonshard') if n=='Khyber Dragonshard' else icon('gem-faceted'));d['system']['type']={'value':'material','subtype':''}
    d=item('Double-Bladed Scimitar','weapon','item:double-bladed-scimitar',74,text(73,'VALENAR DOUBLE SCIMITAR')+'\n\n'+text(74,'Special.','FEAT: REVENANT BLADE'),'equipment',icon('sword'),{'doubleBlade':True})
    d['system'].update(type={'value':'martialM','baseItem':''},price={'value':100,'denomination':'gp'},weight={'value':6,'units':'lb'},properties=['two','spc'],damage={'base':damage('2d4','slashing')},proficient=None)
    a=activity(d,'Two-Handed Attack','attack',r=5,target='creature');a['attack']['ability']='';a['damage']['includeBase']=True
    a=activity(d,'Opposite Blade','attack',activation='bonus',r=5,target='creature',formula='1d4 + @mod',dtype='slashing',meta={'oppositeBlade':True});a['attack']['ability']=''

def build_creature():
    image=f'{MOD}/assets/creatures/clawfoot-raptor-cutout.png'
    d={'_id':uid('creature:clawfoot-raptor'),'name':'Clawfoot Raptor','type':'npc','img':image,'system':{'abilities':{a:{'value':v,'proficient':0,'bonuses':{'check':'','save':''}} for a,v in zip(['str','dex','con','int','wis','cha'],[17,17,13,2,12,10])},'attributes':{'ac':{'flat':14,'calc':'natural','formula':''},'hp':{'value':16,'max':16,'temp':0,'tempmax':0,'formula':'3d8+3'},'movement':{'walk':50,'units':'ft','hover':False},'senses':{'darkvision':0,'blindsight':0,'tremorsense':0,'truesight':0,'units':'ft','special':''}},'details':{'alignment':'Unaligned','type':{'value':'beast','subtype':'dinosaur','custom':'','swarm':''},'cr':0.5,'source':{'book':'WGtE','page':'81','rules':'2014'},'biography':{'value':description(text(81,'CLAWFOOT RAPTOR'),81)}},'skills':{'ath':{'value':1,'ability':'str','bonuses':{'check':''}},'prc':{'value':2,'ability':'wis','bonuses':{'check':''}},'ste':{'value':1,'ability':'dex','bonuses':{'check':''}}},'traits':{'size':'med','di':{'value':[],'bypasses':[],'custom':''},'dr':{'value':[],'bypasses':[],'custom':''},'dv':{'value':[],'bypasses':[],'custom':''},'ci':{'value':[],'custom':''},'languages':{'value':[],'custom':''}}},'items':[],'effects':[],'prototypeToken':{'name':'Clawfoot Raptor','texture':{'src':image},'width':1,'height':1,'actorLink':False,'sight':{'enabled':False},'disposition':-1,'bar1':{'attribute':'attributes.hp'}},'flags':{ID:{'key':'creature:clawfoot-raptor','sourcePage':81,'pounce':True,'automation':'native + midi-qol'}},'ownership':{'default':0},'folder':None}
    for name,formula,typ in [('Claws','2d6 + @mod','slashing'),('Bite','2d4 + @mod','piercing')]:
        f=item(name,'feat','clawfoot:'+name.lower(),81,'Melee weapon attack: +5 to hit, reach 5 feet, one target. '+('10 (2d6+3) slashing damage.' if name=='Claws' else '8 (2d4+3) piercing damage.'),image=image,meta={'creatureAttack':True,'clawAttack':name=='Claws'})
        PACKS['features'].remove(f);a=activity(f,name,'attack',r=5,target='creature',formula=formula,dtype=typ);a['attack']['ability']='str';d['items'].append(f)
        if name=='Bite':activity(f,'Pounce Bite','attack',activation='bonus',r=5,target='creature',formula=formula,dtype=typ,meta={'pounceBite':True})
    f=item('Pounce','feat','clawfoot:pounce',81,rule(81,'Pounce','ACTIONS'),image=image,meta={'pounce':True});PACKS['features'].remove(f)
    a=activity(f,'Pounce: Strength Save','save',activation='special',r=5,target='creature',save='str',dc=13)
    e=effect(f,'Prone',transfer=False,statuses=['prone']);a['effects']=[{'_id':e['_id'],'level':{'min':None,'max':None},'onSave':False}];d['items'].append(f)
    PACKS['creatures'].append(d)

def build_reference():
    def journal(name,key,pages,body):
        j={'_id':uid(key),'name':name,'img':f'{MOD}/assets/pages/{pages[0]:03d}.webp','pages':[],'categories':[],'flags':{ID:{'key':key,'sourcePages':pages,'icon':f'{MOD}/assets/pages/{pages[0]:03d}.webp'}},'ownership':{'default':0},'folder':None,'sort':0}
        j['pages'].append({'_id':uid(key+':text'),'name':'Searchable Text','type':'text','title':{'show':False,'level':1},'text':{'format':1,'content':body},'sort':0,'flags':{}})
        for n in pages:
            j['pages'].append({'_id':uid(key+':image:'+str(n)),'name':f'Original page {n}','type':'image','src':f'{MOD}/assets/pages/{n:03d}.webp','image':{'caption':f'Original uploaded 2018 prototype, PDF page {n}'},'title':{'show':True,'level':1},'sort':n*10,'flags':{}})
        PACKS['reference'].append(j);return j
    for p in PAGES:
        n=p['pdf_page'];journal(f'{n:03d} · '+('Cover' if n==1 else 'Credits' if n==2 else 'Contents' if n==3 else 'Map' if n>=174 else next((r['text'] for r in p['rows'] if r['heading']),'Source Page')),'page:'+str(n),[n],'<h2>PDF page '+str(n)+'</h2>'+prose(p['text']))
    chapters=[('Introduction',1,4),('Chapter 1 · What Is Eberron?',5,20),('Chapter 2 · Welcome to Khorvaire',21,58),('Chapter 3 · Races of Eberron',59,88),('Chapter 4 · Dragonmarks',89,112),('Chapter 5 · Magic Items',113,122),('Chapter 6 · Sharn, City of Towers',123,163),('Appendix A · Further Reading',164,166),('Appendix B · Glossary',167,171),('Appendix C · House Crests and Maps',172,176)]
    for name,a,b in chapters:
        body='<h1>'+name+'</h1><ul>'+''.join(f'<li>@UUID[{page_ref(n)}]{{Page {n}}}</li>' for n in range(a,b+1))+'</ul>'
        journal(name,'chapter:'+str(a),[a],body)
    body='<h1>Wayfinder Setup and Automation</h1><p>This is the original 2018 prototype, using 2014 rules. Drag an ancestry onto a character and complete the native advancement prompts. Use its feature activities for choices and triggered actions. Run Configure Selected Character after a bulk import.</p><p>Tasha owns the existing Artificer class and subclasses. This module adds no duplicate class or subclass. Standard spells are linked to dnd5e or the earliest canonical book module; missing non-SRD spell services are resolved at runtime.</p><p>GM decisions remain choices: disguises, willingness, obstacles, plot-device consequences, weather and social favors cannot be inferred reliably from the map alone.</p><p>Enable Midi-QOL for hit, failed-save and reaction automation. See the included automation audit and runtime acceptance checklist for the precise tested scope.</p>'
    journal('Start Here · Setup, Source Versions and Shared Content','guide',[1],body)

def build_macros():
    for name,method in [('Configure Selected Character','configureActor'),('Configure Selected Item','configureItem'),('Check Shared Content for Duplicates','checkDuplicates'),('Open Wayfinder Sourcebook','openBook'),('Generate a Sharn Story','story'),('Craft a Magic Item or Schema','craft'),('Configure a Magewright','magewright'),('Manage Eldritch Machines','manageMachines'),('Manage Wind Cube','manageWind'),('Resolve Falling','resolveFall'),('Validate Installed Wayfinder Content','validateInstalled')]:
        command=f'const api=game.modules.get("{ID}")?.api; if(!api) ui.notifications.warn("Enable Wayfinder first."); else await api.{method}();'
        PACKS['macros'].append({'_id':uid('macro:'+method),'name':name,'type':'script','scope':'global','img':icon('map' if method in ['openBook','story'] else 'tools' if method=='craft' else 'rune'),'command':command,'author':None,'flags':{ID:{'key':'macro:'+method}},'ownership':{'default':2},'folder':None})

def deduplicate():
    aliases={};removed=[]
    for pack,docs in PACKS.items():
        if pack not in ['ancestries','feats','spells','equipment']:continue
        for d in docs[:]:
            n=normalize(d['name']);existing=next((e for e in REGISTRY['entries'] if (e['type']==d['type'] or e['type'] in ['equipment','weapon','consumable','loot'] and d['type'] in ['equipment','weapon','consumable','loot']) and e['normalized']==n),None)
            if existing:
                aliases[ref(pack,d['flags'][ID]['key'])]=existing['uuid'];docs.remove(d);removed.append({'name':d['name'],'canonical':existing['uuid'],'reason':'Already present in '+existing['module']})
    def rewrite(x):
        if isinstance(x,str):
            for old,new in aliases.items():x=x.replace(old,new)
            return x
        if isinstance(x,list):return [rewrite(v) for v in x]
        if isinstance(x,dict):return {k:rewrite(v) for k,v in x.items()}
        return x
    for pack in PACKS:PACKS[pack]=rewrite(PACKS[pack])
    artif=next(e for e in REGISTRY['entries'] if e['name']=='Artificer' and e['type']=='class')
    report={'policy':REGISTRY['policy'],'checkedModules':REGISTRY['sources'],'newClasses':0,'newSubclasses':0,'skippedDuplicates':removed,'existingArtificer':artif,'spellLinks':REQUIRED_SPELLS,'runtimePolicy':'Only namespaced content is modified. Imported class/subclass/feat singletons are checked by canonical key; deliberate multiple equipment copies remain possible.'}
    (ROOT/'docs/duplicate-audit.json').write_text(json.dumps(report,indent=2))

def output():
    def add_keys(d,coll,anc=(),parents=()):
        d['_key']='!'+'.'.join((*anc,coll))+'!'+'.'.join((*parents,d['_id']))
        for child in {'actors':['items','effects'],'items':['effects'],'journal':['pages','categories'],'tables':['results']}.get(coll,[]):
            for e in d.get(child,[]):add_keys(e,child,(*anc,coll),(*parents,d['_id']))
    for pack,ds in PACKS.items():
        path=ROOT/'packs-src'/pack;path.mkdir(parents=True,exist_ok=True)
        for p in path.glob('*.json'):p.unlink()
        coll={'creatures':'actors','tables':'tables','reference':'journal','macros':'macros'}.get(pack,'items')
        for d in ds:
            add_keys(d,coll);(path/(slug(d['name'])+'-'+d['_id']+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2))
        out=ROOT/'content';out.mkdir(exist_ok=True);(out/(pack+'.json')).write_text(json.dumps(ds,ensure_ascii=False,separators=(',',':')))
    counts={k:len(v) for k,v in PACKS.items()};(ROOT/'docs/build-counts.json').write_text(json.dumps(counts,indent=2));print(json.dumps(counts,indent=2))
    (ROOT/'content/mark-config.json').write_text(json.dumps({'marks':MARKS,'greater':GREATER,'spells':REQUIRED_SPELLS},ensure_ascii=False,indent=2))
    entries=[]
    for pack,ds in PACKS.items():
        if pack in ['tables','reference','macros']:continue
        for d in ds:
            typ='item' if d['type'] in ['equipment','weapon','consumable','loot'] else d['type']
            entries.append({'name':d['name'],'normalized':normalize(d['name']),'type':d['type'],'module':ID,'pack':pack,'uuid':ref(pack,d['flags'][ID]['key']),'canonicalKey':typ+':'+normalize(d['name']),'rules':'2014','edition':'2018 prototype'})
    (ROOT/'source/canonical-content-index.json').write_text(json.dumps({'schema':1,'module':ID,'version':'0.1.0','entries':entries},ensure_ascii=False,indent=2)+'\n')

def main():
    (ROOT/'docs').mkdir(exist_ok=True)
    race=build_races();build_marks(race);build_background();build_spells();build_items();build_creature()
    for d in PACKS['features']:
        if d['flags'][ID].get('intuition'):activity(d,'Qualifying Intuition Check',handler='trait-check')
        if d['flags'][ID].get('stonecunning') or d['flags'][ID].get('key') in ['changeling:appearance','shifter:wildhunt']:activity(d,'Qualifying Trait Check',handler='conditional-check')
    import tables
    tables.build(sys.modules[__name__])
    build_reference();build_macros();deduplicate();output()

if __name__=='__main__':main()
