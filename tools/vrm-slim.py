#!/usr/bin/env python3
"""
تخفيف موديل VRM (من VRoid Studio) قبل ما ينضاف للمنصة — بدون ما يتغيّر الشكل أو العظام أو التعابير.
الدليل: docs/CHARACTERS.md

    python3 tools/vrm-slim.py input.vrm assets/characters/<name>.vrm [--max 1024]

1. الصور أكبر من --max (افتراضي 1024) تتصغّر، وصورة المعاينة (thumbnail) تصير 64×64.
2. أهداف تعابير الوجه (morph targets) اللي ما تستخدمها أي تعبير VRM تنشال، وتتعدّل أرقام التعابير.
3. accessors و bufferViews اللي ما عاد لها استخدام تنشال، والملف ينبني من جديد.
مثال: موديلات حجرة ورقة مقص نزلت من 9 ميقا لـ 2.9 ميقا. يحتاج Pillow (pip install pillow).
"""
import sys, json, struct, io, argparse
from PIL import Image


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack_from('<I', b, 20 + jl)[0]
    binb = b[28 + jl:28 + jl + bl]
    views = [binb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    return j, views, len(b)


def write_glb(path, j, views):
    nb = bytearray()
    for v, data in zip(j['bufferViews'], views):
        while len(nb) % 4: nb.append(0)
        v['byteOffset'] = len(nb); v['byteLength'] = len(data); nb += data
    while len(nb) % 4: nb.append(0)
    j['buffers'][0]['byteLength'] = len(nb)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 28 + len(js) + len(nb)
    open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
                           + struct.pack('<II', len(nb), 0x004E4942) + bytes(nb))
    return total


def shrink_images(j, views, maxs):
    thumb = ((j.get('extensions', {}).get('VRMC_vrm', {}) or {}).get('meta', {}) or {}).get('thumbnailImage')
    for i, im in enumerate(j.get('images', [])):
        vi = im['bufferView']; img = Image.open(io.BytesIO(views[vi])); img.load()
        if i == thumb: img = img.resize((64, 64), Image.LANCZOS)
        elif max(img.size) > maxs: img = img.resize((maxs, maxs * img.size[1] // img.size[0]), Image.LANCZOS)
        else: continue
        out = io.BytesIO(); img.save(out, 'PNG', optimize=True); views[vi] = out.getvalue(); im['mimeType'] = 'image/png'


def strip_morphs(j, views):
    vrm = j['extensions']['VRMC_vrm']
    exprs = [e for g in ('preset', 'custom') for e in (vrm.get('expressions', {}).get(g) or {}).values()]
    used = {}
    for e in exprs:
        for bd in e.get('morphTargetBinds') or []:
            used.setdefault(j['nodes'][bd['node']]['mesh'], set()).add(bd['index'])
    remap = {}
    for mi, m in enumerate(j['meshes']):
        if not any(p.get('targets') for p in m['primitives']): continue
        keep = sorted(used.get(mi, set())); remap[mi] = {o: n for n, o in enumerate(keep)}
        for p in m['primitives']:
            if p.get('targets'): p['targets'] = [p['targets'][o] for o in keep]
        if 'weights' in m: m['weights'] = [m['weights'][o] for o in keep]
        tn = (m.get('extras') or {}).get('targetNames')
        if tn: m['extras']['targetNames'] = [tn[o] for o in keep]
    for e in exprs:
        for bd in e.get('morphTargetBinds') or []:
            bd['index'] = remap[j['nodes'][bd['node']]['mesh']][bd['index']]
    # accessors المستخدمة بس
    refs = set()
    for m in j['meshes']:
        for p in m['primitives']:
            refs.update(p['attributes'].values())
            if 'indices' in p: refs.add(p['indices'])
            for t in p.get('targets') or []: refs.update(t.values())
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: refs.add(s['inverseBindMatrices'])
    for a in j.get('animations', []):
        for sm in a['samplers']: refs.update([sm['input'], sm['output']])
    amap = {o: n for n, o in enumerate(sorted(refs))}
    j['accessors'] = [j['accessors'][o] for o in sorted(refs)]
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = amap[p['indices']]
            if p.get('targets'): p['targets'] = [{k: amap[v] for k, v in t.items()} for t in p['targets']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
    for a in j.get('animations', []):
        for sm in a['samplers']: sm['input'] = amap[sm['input']]; sm['output'] = amap[sm['output']]
    # bufferViews المستخدمة بس
    vrefs = sorted(set(a['bufferView'] for a in j['accessors'] if 'bufferView' in a) | set(i['bufferView'] for i in j.get('images', [])))
    vmap = {o: n for n, o in enumerate(vrefs)}
    views[:] = [views[o] for o in vrefs]
    j['bufferViews'] = [j['bufferViews'][o] for o in vrefs]
    for a in j['accessors']:
        if 'bufferView' in a: a['bufferView'] = vmap[a['bufferView']]
    for i in j.get('images', []): i['bufferView'] = vmap[i['bufferView']]
    return {k: len(v) for k, v in remap.items()}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--max', type=int, default=1024)
    a = ap.parse_args()
    j, views, before = read_glb(a.src)
    if 'VRMC_vrm' not in j.get('extensions', {}): sys.exit('مو ملف VRM 1.0 (صدّره من VRoid Studio بصيغة VRM 1.0)')
    shrink_images(j, views, a.max)
    kept = strip_morphs(j, views)
    after = write_glb(a.dst, j, views)
    print(f'{a.dst}: {before >> 10} KB -> {after >> 10} KB · morph targets kept: {kept}')
