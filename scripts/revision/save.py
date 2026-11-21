import sys,os
from pypdf import PdfReader,PdfWriter
# copia PDFs borrando los metadatos de autor. uso: save.py src dst [src dst ...]
a=sys.argv[1:]
for s,d in zip(a[::2],a[1::2]):
    os.makedirs(os.path.dirname(d),exist_ok=True)
    w=PdfWriter(clone_from=PdfReader(s)); w.metadata=None; w.add_metadata({'/Producer':''}); w.write(d); print('ok',d.split('parciales/')[-1])
