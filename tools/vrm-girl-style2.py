#!/usr/bin/env python3
"""
الشكل الثاني لشخصية البنت (girl2.vrm) — يُبنى من girl.vrm نفسه بدون VRoid Studio. الدليل: docs/CHARACTERS.md

    python3 tools/vrm-girl-style2.py assets/characters/girl.vrm assets/characters/girl2.vrm

اللي يتغيّر:
1. الشعر: من «بوب» قصير لشعر طويل ينزل على الظهر (خصلات الشعر نفسها تنمد لتحت وتنزاح ورا الكتوف
   عشان ما تدخل بالجسم)، ولونه أسود مزرّق. أطراف الشعر الطويل تتبع الصدر بدل الراس، فما تخترق الظهر
   مع الرقص.
2. اللبس: بدل فستان الخادمة الوردي والمريلة، زي مدرسي: تنورة كاروهات كحلي×عنابي بكسرات، صدرية كحلية،
   شريطة ورباط أكمام حمراء، وجوارب سوداء.
الهيكل والعظام والتعابير والحجم نفسها، فأي حركة أو لعبة تشتغل على girl.vrm تشتغل عليه.
يحتاج Pillow و numpy.
"""
import sys, io, math, importlib.util, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('vrm_slim', os.path.join(HERE, 'vrm-slim.py'))
slim = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(slim)

CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def get_acc(j, views, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
    assert not bv.get('byteStride') or bv['byteStride'] == n * dt.itemsize, 'interleaved buffers not supported'
    arr = np.frombuffer(views[a['bufferView']], dt, a['count'] * n, a.get('byteOffset', 0)).copy()
    return arr.reshape(a['count'], n) if n > 1 else arr


def set_acc(j, views, i, arr):
    a = j['accessors'][i]; bv = a['bufferView']; off = a.get('byteOffset', 0)
    data = bytearray(views[bv]); raw = np.ascontiguousarray(arr.astype(CT[a['componentType']])).tobytes()
    data[off:off + len(raw)] = raw; views[bv] = bytes(data)
    if a['type'] == 'VEC3' and 'min' in a: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()


# ---------------------------------------------------------------- الصور
def lum(rgb): return rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114


def sat(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1); return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)


def tint(rgb, mask, color, ref):
    """يلوّن البكسلات المحددة بلون جديد ويحافظ على الظل والإضاءة (نسبة الإضاءة لـ ref)."""
    k = (lum(rgb) / ref)[..., None]
    out = np.clip(np.array(color, np.float32)[None, None, :] * k, 0, 255)
    rgb[mask] = out[mask]


def plaid(h, w):
    """تنورة كاروهات بكسرات: كحلي مع خطوط عنابي وأحمر وأبيض رفيعة."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    navy, mid, wine, red, white = [np.array(c, np.float32) for c in ((30, 38, 72), (46, 58, 104), (104, 30, 48), (190, 40, 52), (226, 228, 236))]
    img = np.zeros((h, w, 3), np.float32) + navy
    P = 46.0  # حجم مربع الكاروهات
    bx, by = (xx % P) / P, (yy % P) / P
    band = lambda t, a, b: (t >= a) & (t < b)
    v, hz = band(bx, .0, .42), band(by, .0, .42)
    img[v | hz] = mid; img[v & hz] = mid + 14
    for t0, t1, c in ((.55, .70, wine), (.61, .64, red), (.86, .88, white)):
        cv, ch = band(bx, t0, t1), band(by, t0, t1)
        img[cv] = img[cv] * .25 + c * .75; img[ch] = img[ch] * .35 + c * .65
        img[cv & ch] = c
    # الكسرات: ظل عمودي متكرر
    pleat = 512 / 28.0
    ph = (xx % pleat) / pleat
    shade = .78 + .30 * np.clip(np.sin(ph * math.pi), 0, 1) ** .6 - .12 * (ph > .9)
    return np.clip(img * shade[..., None], 0, 255)


def restyle_texture(png, shade_ref=None):
    im = Image.open(io.BytesIO(png)).convert('RGBA'); a = np.asarray(im).astype(np.float32)
    rgb, al = a[..., :3].copy(), a[..., 3]
    H, W = al.shape; s = W / 1024.0
    R = lambda x0, y0, x1, y1: (slice(int(y0 * s), int(y1 * s)), slice(int(x0 * s), int(x1 * s)))
    yy, xx = np.mgrid[0:H, 0:W]
    inR = lambda x0, y0, x1, y1: (xx >= x0 * s) & (xx < x1 * s) & (yy >= y0 * s) & (yy < y1 * s)
    L, S = lum(rgb), sat(rgb)
    pink = (S > .07) & (rgb[..., 0] > rgb[..., 1] + 8)

    # 1) الشعر (المربع فوق يمين + غطاء الراس): أسود مزرّق
    hair = (inR(512, 0, 768, 256) | inR(512, 256, 768, 512)) & (al > 0)
    tint(rgb, hair, (44, 46, 66), 110.0)

    # 2) التنورة: كاروهات (نحافظ على الكشكش الأبيض تحت وعلى شفافية الأطراف)
    sk = R(0, 268, 512, 490)
    # الكشكش الأبيض فقط يبقى (الوردي تحته، وذيول الفيونكة البيضاء على أطراف الظهر تنصبغ)
    frill = inR(100, 452, 412, 474) & (L > 200) & (S < .06)
    new = plaid(sk[0].stop - sk[0].start, sk[1].stop - sk[1].start)
    # حزام الخصر (الشريط الفاتح فوق التنورة): كحلي غامق
    belt = int(22 * s); new[:belt] = np.array((26, 30, 58), np.float32) * (.9 + .1 * np.linspace(0, 1, belt))[:, None, None]
    blk = rgb[sk]; m = ~frill[sk]; blk[m] = new[m]; rgb[sk] = blk

    # 3) الصدرية: الوردي ← كحلي، والشريطة والحواف ← أحمر، والأبيض يبقى
    bod = inR(133, 128, 380, 268) & pink
    ribbon = inR(226, 130, 290, 200) & pink
    trims = (inR(0, 30, 135, 140) | inR(378, 30, 512, 140)) & pink
    tint(rgb, bod & ~ribbon, (40, 50, 96), 205.0)
    tint(rgb, ribbon | trims, (214, 44, 58), 190.0)
    # الشريط الفاتح العلوي بالوسط (الياقة/الرقبة): أحمر
    collar = inR(160, 80, 350, 128) & (al > 0)
    tint(rgb, collar, (200, 40, 54), 240.0)

    # 4) الجوارب البيضاء ← سوداء (عمودي الرجلين بصورة الجسم، البكسلات الفاتحة قليلة اللون)
    legs = (inR(0, 815, 124, 1024) | inR(388, 815, 512, 1024)) & (S < .06) & (L > 180)
    tint(rgb, legs, (34, 34, 44), 235.0)

    a[..., :3] = rgb
    out = io.BytesIO(); Image.fromarray(a.astype(np.uint8), 'RGBA').save(out, 'PNG', optimize=True)
    return out.getvalue()


def restyle_shade(base_old, base_new, shade_png):
    """صورة الظل (MToon shadeMultiply): نفس نسبة الظل الأصلية على الألوان الجديدة."""
    bo = np.asarray(Image.open(io.BytesIO(base_old)).convert('RGBA')).astype(np.float32)
    bn = np.asarray(Image.open(io.BytesIO(base_new)).convert('RGBA')).astype(np.float32)
    sh = np.asarray(Image.open(io.BytesIO(shade_png)).convert('RGBA')).astype(np.float32)
    ratio = (lum(sh[..., :3]) / np.maximum(lum(bo[..., :3]), 1))[..., None]
    changed = np.abs(bn[..., :3] - bo[..., :3]).sum(-1) > 3
    out = sh.copy(); out[..., :3][changed] = np.clip(bn[..., :3] * np.clip(ratio, .4, 1.1), 0, 255)[changed]
    b = io.BytesIO(); Image.fromarray(out.astype(np.uint8), 'RGBA').save(b, 'PNG', optimize=True); return b.getvalue()


# ---------------------------------------------------------------- الشعر الطويل
TOP, BOB_END, LONG_END = 1.47, 1.31, 0.92   # بداية المد، نهاية البوب الحالي، نهاية الشعر الطويل (متر)


def long_hair(j, views):
    mesh = next(m for m in j['meshes'] if m['name'].startswith('Body'))
    p = mesh['primitives'][0]; A = p['attributes']
    P = get_acc(j, views, A['POSITION']); UV = get_acc(j, views, A['TEXCOORD_0'])
    J = get_acc(j, views, A['JOINTS_0']); Wt = get_acc(j, views, A['WEIGHTS_0'])
    skin = j['skins'][0]; names = [j['nodes'][k]['name'] for k in skin['joints']]
    head, chest, upper = names.index('J_Bip_C_Head'), names.index('J_Bip_C_UpperChest'), names.index('J_Bip_C_Neck')
    # خصل الشعر: مكانها بالصورة (المربع العلوي يمين) وفوق الرقبة — عشان ما نلقط رؤوس الجزمة اللي صورتها جنبه
    hair = (UV[:, 0] > .5) & (UV[:, 0] < .75) & (UV[:, 1] < .5) & (P[:, 1] > 1.2)
    # الغرة والخصل قدام الوجه ما تنمد (z كبيرة)، والباقي (جوانب وورا) يصير طويل
    front = P[:, 2] > -0.005
    grow = hair & ~front & (P[:, 1] < TOP)
    # جسم الشخصية (بدون الشعر) لحساب المسافة اللي لازم يبعد عنها الشعر
    body = ~hair
    t = np.clip((TOP - P[grow, 1]) / (TOP - BOB_END), 0, None)        # 0 عند بداية المد، 1 عند نهاية البوب
    q = P[grow].copy()
    q[:, 1] = TOP - t * (TOP - LONG_END)
    # كل خصلة تنزاح لورا كل ما نزلت (فوق الكتف والظهر)، والجوانب تبعد شوي للخارج
    drop = np.clip(TOP - q[:, 1], 0, None)
    side = np.clip(np.abs(q[:, 0]) / .14, 0, 1)
    q[:, 2] -= np.clip(drop - .05, 0, None) * (.10 + .25 * side)
    q[:, 0] *= 1 + np.clip(drop - .08, 0, .3) * .55
    # دفع لبرّا الجسم: لكل شريحة ارتفاع، أقل z للجسم (ظهره) ضمن عرض الخصلة
    BP = P[body & (P[:, 1] > LONG_END - .05) & (P[:, 1] < TOP + .02)]
    for i in range(len(q)):
        x, y, z = q[i]
        near = BP[(np.abs(BP[:, 1] - y) < .03) & (np.abs(BP[:, 0] - x) < .05)]
        if len(near):
            back = near[:, 2].min() - .025
            if z > back and z < near[:, 2].max(): q[i, 2] = back
    P[grow] = q
    # الأطراف تتبع الصدر (مزج تدريجي)، والأعلى يبقى مع الراس. الراس يبقى أقوى عظمة لكل خصلة (الصدر 0.45 بالأكثر):
    # الألعاب اللي تصنّف أجزاء الجسم بأقوى عظمة (بدلة سباق الفورمولا) تعرف إن هذا شعر مو لبس
    w = np.clip((drop - .12) / .25, 0, 1) * .45
    gi = np.where(grow)[0]
    J[gi] = 0; Wt[gi] = 0
    J[gi, 0] = head; J[gi, 1] = chest
    Wt[gi, 0] = 1 - w; Wt[gi, 1] = w
    set_acc(j, views, A['POSITION'], P); set_acc(j, views, A['JOINTS_0'], J); set_acc(j, views, A['WEIGHTS_0'], Wt)
    return int(grow.sum())


def main(src, dst):
    j, views, _ = slim.read_glb(src)
    mat = next(m for m in j['materials'] if 'Body' in m['name'])
    base_img = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    shade_img = j['textures'][mat['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index']]['source']
    bv, sv = j['images'][base_img]['bufferView'], j['images'][shade_img]['bufferView']
    old = views[bv]; views[bv] = restyle_texture(old); views[sv] = restyle_shade(old, views[bv], views[sv])
    n = long_hair(j, views)
    meta = j['extensions']['VRMC_vrm']['meta']; meta['name'] = (meta.get('name') or 'girl') + ' (style 2)'
    size = slim.write_glb(dst, j, views)
    print('hair vertices grown:', n, '· size:', round(size / 1e6, 2), 'MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
