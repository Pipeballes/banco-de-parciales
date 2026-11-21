# mk2.py: tapar zonas de imágenes/PDF con rectángulos negros (coordenadas relativas 0-1) y armar un PDF
import glob,subprocess,os,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import fp
from PIL import Image,ImageDraw,ImageOps
def img(f,boxes=(),crop=None):
    im=ImageOps.exif_transpose(Image.open(f)).convert('RGB'); w,h=im.size; d=ImageDraw.Draw(im)
    for x0,y0,x1,y1 in boxes: d.rectangle((x0*w,y0*h,x1*w,y1*h),fill='black')
    if crop: im=im.crop((int(crop[0]*w),int(crop[1]*h),int(crop[2]*w),int(crop[3]*h)))
    im.thumbnail((1800,1800)); return im
def pdfpages(f,boxes=(),pages=None):
    import tempfile; t=os.path.join(tempfile.mkdtemp(),'p'); subprocess.run(['pdftoppm','-r','110','-png',f,t],check=True)
    out=[]
    for k,p in enumerate(sorted(glob.glob(t+'-*.png'))):
        if pages is None or k in pages: out.append(img(p,boxes))
        os.remove(p)
    return out
def save(ims,out):
    os.makedirs(os.path.dirname(out),exist_ok=True); ims[0].save(out,save_all=True,append_images=ims[1:],resolution=110,quality=80)
