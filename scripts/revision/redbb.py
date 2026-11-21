# redbb.py src out regex tmp: tapa en negro las palabras del PDF (con texto) que coinciden con la regex
import sys,re,glob,subprocess,os
from PIL import Image,ImageDraw
src,out,pat,tmp=sys.argv[1:5]
os.makedirs(tmp,exist_ok=True)
subprocess.run(["pdftotext","-bbox",src,tmp+"/bb.html"],check=True)
subprocess.run(["pdftoppm","-r","130","-png",src,tmp+"/p"],check=True)
html=open(tmp+"/bb.html").read(); pages=re.split(r'<page ',html)[1:]
files=sorted(glob.glob(tmp+"/p-*.png")); ims=[]; tot=0
for pg,f in zip(pages,files):
    pw,ph=map(float,re.search(r'width="([\d.]+)" height="([\d.]+)"',pg).groups())
    im=Image.open(f).convert("RGB"); sx=im.width/pw; sy=im.height/ph; d=ImageDraw.Draw(im)
    for x0,y0,x1,y1,t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>',pg):
        if re.search(pat,t,re.I): d.rectangle((float(x0)*sx-3,float(y0)*sy-3,float(x1)*sx+3,float(y1)*sy+3),fill="black"); tot+=1
    ims.append(im)
ims[0].save(out,save_all=True,append_images=ims[1:],resolution=130); print("redacted",tot)
