import subprocess,re,os,sys,tempfile,glob
from pillow_heif import register_heif_opener; register_heif_opener()
from PIL import Image
def dhash(img,n=16):
    g=img.convert('L').resize((n+1,n),Image.LANCZOS); p=list(g.getdata()); v=0
    for y in range(n):
        for x in range(n): v=(v<<1)|(p[y*(n+1)+x]>p[y*(n+1)+x+1])
    return v
def shingles(t):
    w=re.findall(r'[a-záéíóúñü0-9]{3,}',t.lower()); return {' '.join(w[i:i+4]) for i in range(max(0,len(w)-3))}
def pdf_fp(path,maxpages=40):
    t=subprocess.run(['pdftotext','-l',str(maxpages),path,'-'],capture_output=True,text=True).stdout
    d=tempfile.mkdtemp(); subprocess.run(['pdftoppm','-r','30','-gray','-png','-l',str(maxpages),path,d+'/p'],capture_output=True)
    hs=[]
    for f in sorted(glob.glob(d+'/p*.png')):
        try: hs.append(dhash(Image.open(f)))
        except Exception: pass
        os.remove(f)
    os.rmdir(d); return shingles(t),hs
def img_fp(path):
    im=Image.open(path)
    try:
        from PIL import ImageOps; im=ImageOps.exif_transpose(im)
    except Exception: pass
    return dhash(im)
