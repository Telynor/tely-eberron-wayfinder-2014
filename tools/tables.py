import re,json,html

PREFIX={10:'Personal Regrets',11:'Debts',13:'Military Background',48:'Magic Item Crafting Complications',62:'Kalashtar Quirks',68:'Warforged Quirks',71:'Mror Past',76:'Zil Schemes',80:'Talenta Halfling Quirks',92:'Dragonmark Quirks',94:'House Agent Role',112:'Aberrant Mark Flaws',143:'Falling in Sharn'}
def build(B):
    tables=[];active=None;row=None;heading='';notes=[]
    def finish():
        nonlocal active,row
        if active and active['results']:tables.append(active)
        active=None;row=None
    for page in B.PAGES:
        n=page['pdf_page']
        for r in page['rows']:
            s=r['text']
            if r['y']>932 or re.match(r'^(?:\d+ )?CHAP(?:P?T?T?)ER |^\d{1,3}$',s):continue
            if r['heading']:heading=s
            m=re.match(r'^((?:\d+)?d\d+)\s+([A-Z].*)$',s)
            if m:
                finish();formula=m[1];label=m[2]
                name=PREFIX.get(n,label)
                if 124<=n<=130:name='Sharn Background · '+label
                if n==95:name='House Agent · '+label
                if n==155:name={'Plot Hook':'Sharn Story · Hook','Villain':'Sharn Story · Villain','Plot':'Sharn Story · Plot'}[label]
                if n==156:name='Sharn Story · '+label
                if n==156 and 'Finale' in name:formula='1d10'
                active={'name':name,'formula':formula,'page':n,'results':[],'notes':['The source labels ten results 1d8. Corrected to 1d10 so results 9 and 10 are reachable.'] if n==156 and 'Finale' in name else []}
                continue
            if not active:continue
            if r['heading'] and not re.match(r'^\d',s):finish();continue
            m=re.match(r'^(\d{1,2})(?:[–—-](\d{1,2}))?(?:\s+(.*)|$)',s)
            if m:
                lo=int(m[1]);hi=int(m[2] or lo);count,die=[int(v or 1) for v in active['formula'].split('d')]
                # A source typo labels a ten-result table 1d8. Include all ten.
                if n==156 and 'Finale' in active['name'] and hi>8:
                    active['formula']='1d10';active['notes']=['The source labels ten results 1d8. Corrected to 1d10 so results 9 and 10 are reachable.']
                if lo<=die*count and (not active['results'] or lo>active['results'][-1]['range'][1]):
                    row={'range':[lo,hi],'text':m[3] or ''};active['results'].append(row);continue
            # All printed random-result prose uses the table-body subset fonts.
            # This prevents a completed table from absorbing ordinary body text.
            if row and any(f in r['fonts'] for f in ['font8','font9','font19','font20','font21','font22']):row['text']+=' '+s
    finish()
    for t in tables:
        # Printed table continuation labels are not part of result prose.
        t['results'][-1]['text']=re.sub(r'\s+CHAP.*$','',t['results'][-1]['text'])
        key='table:'+t['name'];image=B.icon('dice')
        doc={'_id':B.uid(key),'name':t['name'],'img':image,'description':f'<p>WGtE prototype, p. {t["page"]}. @UUID[{B.page_ref(t["page"])}]{{Original table}}</p>'+''.join('<p>'+html.escape(note)+'</p>' for note in t['notes']),'formula':t['formula'],'replacement':True,'displayRoll':True,'results':[],'flags':{B.ID:{'key':key,'sourcePage':t['page'],'sourceNotes':t['notes']}},'ownership':{'default':0},'folder':None}
        for i,r in enumerate(t['results']):doc['results'].append({'_id':B.uid(key+':'+str(i)),'type':'text','text':r['text'].strip(),'img':image,'weight':r['range'][1]-r['range'][0]+1,'range':r['range'],'drawn':False,'flags':{}})
        B.PACKS['tables'].append(doc)
    (B.ROOT/'source/table-inventory.json').write_text(json.dumps(tables,ensure_ascii=False,indent=2))
