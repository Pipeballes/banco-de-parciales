import re,html,subprocess,sys,concurrent.futures as cf
def ls(fid):
    for _ in range(3):
        h=subprocess.run(['curl','-sSL','--max-time','40',f'https://drive.google.com/embeddedfolderview?id={fid}'],capture_output=True,text=True).stdout
        if 'flip-entry' in h or 'folder-view' in h or len(h)>1000: break
    return [(i,'folder' if '/folders/' in href else 'file',html.unescape(t)) for i,href,t in re.findall(r'<div class="flip-entry" id="entry-([^"]+)".*?<a href="([^"]+)".*?flip-entry-title">([^<]*)<',h,re.S)]
# uso: python3 bfs.py <id carpeta raíz del Drive> <salida.tsv>   -> líneas: tipo, id, ruta
out=open(sys.argv[2] if len(sys.argv)>2 else 'tree.tsv','w')
front=[(sys.argv[1],'')]
with cf.ThreadPoolExecutor(16) as ex:
    while front:
        res=list(ex.map(lambda x:(x,ls(x[0])),front)); front=[]
        for (fid,path),items in res:
            for i,k,t in items:
                p=path+'/'+t; out.write(f'{k}\t{i}\t{p}\n')
                if k=='folder': front.append((i,p))
        out.flush()
