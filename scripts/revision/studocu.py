# usage: studocu.py src out tmp [skip_first=1]
import sys,re,glob,subprocess,os
from PIL import Image,ImageDraw
src,out,tmp=sys.argv[1:4]; skip=int(sys.argv[4]) if len(sys.argv)>4 else 1
os.makedirs(tmp,exist_ok=True)
for f in glob.glob(tmp+'/p-*.png'): os.remove(f)
subprocess.run(["pdftotext","-bbox",src,tmp+"/bb.html"],check=True)
subprocess.run(["pdftoppm","-r","110","-png",src,tmp+"/p"],check=True)
pages=re.split(r'<page ',open(tmp+"/bb.html").read())[1:]
files=sorted(glob.glob(tmp+"/p-*.png")); ims=[]; tot=0
PAT=re.compile(r'descargado|downloaded|lomoar|studocu|patrocinado|sponsored|@|messages\.',re.I)
for n,(pg,f) in enumerate(zip(pages,files)):
    if n<skip: continue
    pw,ph=map(float,re.search(r'width="([\d.]+)" height="([\d.]+)"',pg).groups())
    im=Image.open(f).convert("RGB"); sx=im.width/pw; sy=im.height/ph; d=ImageDraw.Draw(im)
    ws=[(float(a),float(b),float(c),float(e),t) for a,b,c,e,t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>',pg)]
    ys=[w[1] for w in ws if PAT.search(w[4])]
    for x0,y0,x1,y1,t in ws:
        if any(abs(y0-y)<3 for y in ys): d.rectangle((x0*sx-3,y0*sy-3,x1*sx+3,y1*sy+3),fill="black"); tot+=1
    ims.append(im)
ims[0].save(out,save_all=True,append_images=ims[1:],resolution=110); print("pages",len(ims),"redacted",tot)
