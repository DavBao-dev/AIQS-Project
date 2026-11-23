"""Copy pinned browser assets from integrity-checked official npm packages."""
from pathlib import Path
import urllib.request, json, tarfile, io, hashlib, base64
from concurrent.futures import ThreadPoolExecutor

PACKAGES={'katex':'0.19.1','marked':'18.2.1','dompurify':'3.5.0'}
ROOT=Path(__file__).resolve().parents[1]/'dist'/'vendor'

def download(package):
    name,version=package
    with urllib.request.urlopen(f'https://registry.npmjs.org/{name}/{version}',timeout=35) as r:meta=json.load(r)
    with urllib.request.urlopen(meta['dist']['tarball'],timeout=60) as r:archive=r.read()
    algorithm,expected=meta['dist']['integrity'].split('-',1)
    if algorithm!='sha512' or base64.b64encode(hashlib.sha512(archive).digest()).decode()!=expected:raise RuntimeError('Integrity mismatch: '+name)
    dest=ROOT/name;dest.mkdir(parents=True,exist_ok=True)
    names=[]
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as bundle:
        for member in bundle.getmembers():
            if not member.isfile():continue
            short=member.name.removeprefix('package/')
            output=None
            if name=='katex' and short in ('dist/katex.min.js','dist/katex.min.css'):output=Path(short).name
            elif name=='katex' and short.startswith('dist/fonts/') and short.endswith('.woff2'):output='fonts/'+Path(short).name
            elif name=='marked' and short=='lib/marked.umd.js':output='marked.umd.js'
            elif name=='dompurify' and short=='dist/purify.min.js':output='purify.min.js'
            elif Path(short).name in ('LICENSE','LICENSE-MPL','LICENSE.md') and '/' not in short:output=Path(short).name
            if output:
                target=dest/output;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(bundle.extractfile(member).read());names.append(output)
    if not any(n.endswith('.js') for n in names):raise RuntimeError('Missing browser JS: '+name)
    return {'package':name,'version':version,'integrity':meta['dist']['integrity'],'files':names}

if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:manifest=list(pool.map(download,PACKAGES.items()))
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps([{'package':p['package'],'version':p['version'],'files':len(p['files'])} for p in manifest]))
