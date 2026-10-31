"""Copy exact producer archive contracts into this standalone probe's CLI cache."""
import hashlib, json, pathlib, zipfile
here = pathlib.Path(__file__).resolve().parent
root = here.parents[2]
for name in ('core', 'karma', 'special', 'world', 'bodies', 'shop', 'ui', 'communication', 'reports', 'items'):
    archive = root / f'plugins/{name}/dist/_edgegamers_ttt-{name}.s2sp'
    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read('manifest.json'))
        data = z.read(f'types/_edgegamers_ttt-{name}.d.ts')
    publication = manifest['publishes'][f'@edgegamers/ttt-{name}']
    assert hashlib.sha256(data).hexdigest() == publication['typesSha256']
    target = here / f'.s2script/types/@edgegamers/ttt-{name}'
    target.mkdir(parents=True, exist_ok=True)
    (target/'index.d.ts').write_bytes(data)
    (target/'package.json').write_text(json.dumps({'name': f'@edgegamers/ttt-{name}', 'version': manifest['version'], 's2script': {'publishes': manifest['publishes']}}, indent=2)+'\n')
    print(name, publication['typesSha256'])
