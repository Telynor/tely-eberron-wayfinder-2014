"""Extract the supplied 2018 prototype, including its custom font encodings."""
from pathlib import Path
import fitz, json, re, hashlib, argparse

ROOT=Path(__file__).resolve().parents[1]
MAPS={}
def mapping(font, seq):
    MAPS[font]={chr(0xe000+i):s for i,s in enumerate(seq)}
mapping('font6', list('ABCDEFGHIKLMNOPQRSTUVWZ')+list('ABCDEFGHIKLMNOPQRSTUVWXYZ')+['a','b','c','d','e','f','ff','ffi','g','h','i','k','l','m','n','o','p','q','r','s','t','ti','u','v','w','y','!','?',',',':','.','-','*','&'])
mapping('font9',list('ABCDEFGHIJKLMNOPRSTUVWY')+['a','b','c','d','e','f','ff','fi','ffi','fl','ft','g','h','i','j','k','l','m','n','o','p','q','r','s','t','tf','ti','tt','tti','u','v','w','x','y','z','!','?',',',';','.','…','’','“','”','-','·','(',')','&','0','1','2','3','4','5','6','8','+'])
MAPS['font12']={chr(0xe000+i):s for i,s in enumerate(['!','&','(',')','+',',','-','.','/','0','1','2','3','4','5','6',None,'8','9',':',';','?']+list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')+list('abcdefghijklmnopqrstuvwxyz')+['…','—','“','”','’','fi','fl','ff','ffi','ffl']) if s is not None}
# Font12's omitted 7 is absent from the subset, so every subsequent index is -1.
MAPS['font12']={chr(0xe000+i):s for i,s in enumerate(['!','&','(',')','+',',','-','.','/','0','1','2','3','4','5','6','8','9',':',';','?']+list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')+list('abcdefghijklmnopqrstuvwxyz')+['…','—','“','”','’','fi','fl','ff','ffi','ffl'])}
mapping('font13',['!','&','(',')','+',',','-','.','1','2','3','4','5','6','8',':',';','?']+list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')+list('abcdefghijklmnopqrstuvwxyz')+['…','—','“','”','‘','’','fi','fl','ff'])
mapping('font19',[',','-','.','3',':',';','?']+list('ABCDEHIKLMOPSTUWXY')+list('abcdefghijklmnopqrstuvwxyz')+['—','“','”','’','fi','fl'])
mapping('font20',[':','0','1','?','C','E','G','H','I','M','P','X']+list('abcdefghijklmnopqrstuv')+['x','y','’','fi','fl'])
# Several tiny subsets contain only the glyphs actually used in their boxes.
mapping('font20',[':','0','1','?','C','E','G','H','I','M','P','X','a','b','c','d','e','f','g','h','i','k','l','m','n','o','r','s','t','u','v','x','y','’','fi','fl'])
mapping('font21',list('ABCDFGHKLMNPRSTW')+['a','b','c','d','e','f','fi','g','h','i','k','l','m','n','o','p','r','s','t','ti','tt','u','y',',',':','’','*'])
mapping('font22',['.',':','?']+list('ACDFGHMNPSTWY')+['a','b','c','d','e','g','h','i','k','l','m','n','o','p','r','s','t','u','v','x','y','’','fi','fl'])
mapping('font24',['H','a','g','i','l','n','s','fl'])

def decode(s,font):
    return ''.join(MAPS.get(font,{}).get(c,c) for c in s).replace('\xa0',' ')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('pdf');args=ap.parse_args()
    pdf=Path(args.pdf);doc=fitz.open(pdf);pages=[];unknown={}
    for n,page in enumerate(doc,1):
        chars=[];seen=set()
        for b in page.get_text('rawdict')['blocks']:
            if b['type']!=0:continue
            for line in b['lines']:
                for span in line['spans']:
                    for ch in span['chars']:
                        if ch['bbox'][1]>960:continue
                        t=decode(ch['c'],span['font'])
                        if any('\ue000'<=c<='\uf8ff' for c in t):unknown.setdefault(span['font'],set()).add(ch['c'])
                        key=(round(ch['origin'][0],1),round(ch['origin'][1],1),t)
                        if key in seen:continue
                        seen.add(key);chars.append({'x':ch['bbox'][0],'y':ch['origin'][1],'right':ch['bbox'][2],'t':t,'font':span['font'],'size':span['size']})
        rows=[]
        for whole_page in [True]:
            cc=sorted(chars,key=lambda c:(c['y'],c['x']))
            groups=[]
            for c in cc:
                group=next((g for g in reversed(groups[-8:]) if abs(g[0]['y']-c['y'])<1.5),None)
                if group is None:groups.append([c])
                else:group.append(c)
            separated=[]
            for g in groups:
                g.sort(key=lambda c:c['x']);clusters=[[]];right=None
                for c in g:
                    if right is not None and right<400<=c['x'] and c['x']-right>29:clusters.append([])
                    clusters[-1].append(c);right=c['right']
                separated.extend(clusters)
            for g in separated:
                col=int(g[0]['x']>=389);text='';right=None
                for c in g:
                    if right is not None and c['x']-right>2.6 and not text.endswith(' ') and not c['t'].startswith(' '):text+=' '
                    text+=c['t'];right=c['right']
                text=re.sub(r'\s+',' ',text).strip()
                if not text:continue
                fonts=list(dict.fromkeys(c['font'] for c in g));size=max(c['size'] for c in g)
                rows.append({'page':n,'col':col,'x':round(g[0]['x'],1),'y':round(g[0]['y'],1),'text':text,'fonts':fonts,'size':round(size,2),'heading':(('font11' in fonts and size>=14) or ('font6' in fonts and size>=15))})
        rows.sort(key=lambda r:(r['col'],r['y']))
        pages.append({'pdf_page':n,'printed_page':str(n) if 4<=n<=173 else ['Cover','Credits','Contents'][n-1] if n<=3 else 'Map '+str(n),'rows':rows,'text':'\n'.join(r['text'] for r in rows)})
    out=ROOT/'source';out.mkdir(parents=True,exist_ok=True)
    (out/'book-pages.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2))
    (out/'book-text.txt').write_text('\n\n'.join(f'=== PAGE {p["pdf_page"]} ===\n{p["text"]}' for p in pages))
    (out/'source-audit.json').write_text(json.dumps({'pdf_pages':len(doc),'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'edition':'Original 2018 campaign prototype','unmapped_glyphs':{k:sorted(v) for k,v in unknown.items()}},ensure_ascii=False,indent=2))
    print({'pages':len(pages),'unmapped':{k:len(v) for k,v in unknown.items()}})

if __name__=='__main__':main()
