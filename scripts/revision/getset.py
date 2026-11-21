# TREE=tree.tsv getset.py "<ruta de carpeta del Drive>" outdir  -> downloads direct files, builds sheet.png of all pages
import sys,os,re,subprocess,glob
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import fp
from PIL import Image,ImageDraw,ImageOps
pref,out=sys.argv[1].rstrip('/'),sys.argv[2]; os.makedirs(out,exist_ok=True)
rows=[l.rstrip('\n').split('\t') for l in open(os.environ.get('TREE','tree.tsv'))]
fs=sorted([r for r in rows if r[0]=='file' and os.path.dirname(r[2])==pref and re.search(r'(?i)\.(pdf|jpe?g|png|heic|docx?|webp)$',r[2])],key=lambda r:r[2])
thumbs=[]
for k,(t,i,p) in enumerate(fs):
    ext=p.rsplit('.',1)[1].lower(); f=f'{out}/{k:02d}.{ext}'
    if not os.path.exists(f): subprocess.run(['curl','-sSL','-o',f,f'https://drive.usercontent.google.com/download?id={i}&export=download&confirm=t'])
    if ext in('doc','docx'):
        subprocess.run(['soffice','-env:UserInstallation=file:///tmp/lo_gs','--headless','--convert-to','pdf','--outdir',out,f],capture_output=True); f=f'{out}/{k:02d}.pdf'; ext='pdf'
    if ext=='pdf':
        subprocess.run(['pdftoppm','-r','40','-png','-l','12',f,f'{out}/t{k:02d}'],capture_output=True)
        for g in sorted(glob.glob(f'{out}/t{k:02d}-*.png')): thumbs.append((f'{k:02d} {os.path.basename(p)[:40]} p{g.rsplit("-",1)[1][:-4]}',Image.open(g).convert('RGB')))
    else:
        try:
            im=ImageOps.exif_transpose(Image.open(f)).convert('RGB'); im.thumbnail((700,700)); thumbs.append((f'{k:02d} {os.path.basename(p)[:45]}',im))
        except Exception as e: print('ERR',p,e)
    print(f'{k:02d}\t{p}')
W=520; cols=4
for n in range(0,len(thumbs),12):
    ch=thumbs[n:n+12]; H=max(min(im.height*W//im.width,700) for _,im in ch)+16; rws=(len(ch)+cols-1)//cols
    sh=Image.new('RGB',(W*cols,H*rws),'white'); d=ImageDraw.Draw(sh)
    for j,(lab,im) in enumerate(ch):
        im=im.copy(); im.thumbnail((W-6,H-18)); x,y=(j%cols)*W,(j//cols)*H; sh.paste(im,(x+3,y+16)); d.text((x+3,y+2),lab,fill='red')
    sh.save(f'{out}/sheet{n//12}.png')
print('sheets',(len(thumbs)+11)//12)
