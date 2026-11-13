#!/usr/bin/env python3
"""Builds frame-joker-circus.svg from the 4 cut-out ChatGPT layers
(ring / plate / gems / deco) on the site's 2172x724 canvas, with the intro
motion of the reference clip. Layers are embedded as WebP data URIs because an
SVG shown via <img> or CSS background can't load external files.
usage: build_real.py <layers_dir> <out.svg> [preview.png]"""
import base64, io, math, sys
import numpy as np
from PIL import Image

L, OUT = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else None
W, H = 2172, 724

ring_src = Image.open(L + '/ring.png')
plate_src = Image.open(L + '/plate.png')
gems_src = Image.open(L + '/gems.png')
deco_src = Image.open(L + '/deco.png')

# ---------------------------------------------------------------- geometry
CX, CY = 470, 360                 # ring/avatar centre on the canvas
WREATH_S = 1.08                   # wreath scale (fills the canvas height)
WREATH_C = (505, 346)             # centre of the wreath opening (source px)
RING_C, RING_HOLE = (479.0, 335.3), 192.6
HOLE = 177                        # target hole radius
RING_S = HOLE / RING_HOLE

def scaled(im, box, s):
    c = im.crop(box)
    return c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)

layers = []   # (id, image, x, y)

# ring
rb = (194, 33, 763, 628)
ring = scaled(ring_src, rb, RING_S)
rx, ry = CX + (rb[0] - RING_C[0]) * RING_S, CY + (rb[1] - RING_C[1]) * RING_S

# wreath (left half of deco) and big jester (right half)
wb = (90, 0, 955, 667)
wreath = scaled(deco_src, wb, WREATH_S)
wx, wy = CX + (wb[0] - WREATH_C[0]) * WREATH_S, CY + (wb[1] - WREATH_C[1]) * WREATH_S

JS = 0.92
jb = (1284, 0, 1925, 667)
jester = scaled(deco_src, jb, JS)
jx = W - 8 - jester.width
jy = (H - jester.height) / 2 + 4

# plate: keep both ornate ends, lengthen by repeating whole quilt periods
PS = 0.74
pb = (612, 156, 1853, 523)
p = plate_src.crop(pb)
PERIOD = 108                      # quilt diamond period (source px)
cap = 260
left, right = p.crop((0, 0, cap, p.height)), p.crop((p.width - cap, 0, p.width, p.height))
mid = p.crop((cap, 0, cap + PERIOD * 6, p.height))
plate_x0 = CX + 150               # starts hidden behind the ring
plate_x1 = jx + (1800 - jb[0]) * JS   # ends under the jester's body
need = (plate_x1 - plate_x0) / PS - 2 * cap
reps = max(1, round(need / PERIOD))
long = Image.new('RGBA', (2 * cap + reps * PERIOD, p.height))
long.paste(left, (0, 0))
for i in range(reps):
    seg = mid.crop(((i % 6) * PERIOD, 0, (i % 6 + 1) * PERIOD, p.height))
    long.paste(seg, (cap + i * PERIOD, 0))
long.paste(right, (cap + reps * PERIOD, 0))
plate = long.resize((round(long.width * PS), round(long.height * PS)), Image.LANCZOS)
px = plate_x0
py = CY + 4 - plate.height / 2

# visible velvet span -> gems sit on its centre
VEL_X0 = wx + (930 - wb[0]) * WREATH_S          # right edge of wreath over the plate
VEL_X1 = jx + (1600 - jb[0]) * JS               # left edge of jester body
GX = (VEL_X0 + VEL_X1) / 2
top_border_y = py + (196 - pb[1]) * PS
bot_border_y = py + (484 - pb[1]) * PS
GS = 0.72
g_top = scaled(gems_src, (1018, 146, 1206, 298), GS)
g_bot = scaled(gems_src, (1018, 424, 1206, 578), GS)
gtx, gty = GX - g_top.width / 2, top_border_y - g_top.height / 2
gbx, gby = GX - g_bot.width / 2, bot_border_y - g_bot.height / 2

# flying star sprite (the big gold star from the jester layer)
star = deco_src.crop((1640, 490, 1790, 635))
star = star.resize((90, round(90 * star.height / star.width)), Image.LANCZOS)

# ---------------------------------------------------------------- bulbs (for twinkle overlay)
ra = np.asarray(ring.convert('RGBA')).astype(np.float32)
lum = ra[..., :3].mean(axis=2)
bright = (lum > 235) & (ra[..., 3] > 200)
from scipy import ndimage as ndi
lab, n = ndi.label(bright)
bulbs = []
for i, sl in enumerate(ndi.find_objects(lab), 1):
    area = (lab[sl] == i).sum()
    if area >= 12:
        cy_, cx_ = ndi.center_of_mass(lab == i)
        bx, by = rx + cx_, ry + cy_
        if 150 < math.hypot(bx - CX, by - CY) < 245:
            bulbs.append((bx, by))

def data_uri(im, q=88):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

def f(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')

def img(im, x, y, extra=''):
    return '<image x="%s" y="%s" width="%d" height="%d" href="%s"%s/>' % (f(x), f(y), im.width, im.height, data_uri(im), extra)

# ---------------------------------------------------------------- measurements (printed for the template)
name_box = (VEL_X0 + 30, top_border_y + 40, VEL_X1 - 20, bot_border_y - 40)
print('ring hole', CX - HOLE, CY - HOLE, CX + HOLE, CY + HOLE)
print('name box', [round(v) for v in name_box])
print('bulbs', len(bulbs), 'plate', round(px), round(py), plate.width, plate.height, 'jester', round(jx), round(jy))

# ---------------------------------------------------------------- svg
o = []
a = o.append
a('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H))
a('<!-- AGP frame «الجوكر» — layers by the platform owner (ChatGPT), cut out and animated. '
  'Avatar hole: centre %d,%d r=%d (transparent). Template: js/agp-player-card.js. Built by tools/build-frame-joker-circus.py -->' % (CX, CY, HOLE))
a('<defs>')
a('<mask id="mHole" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><rect width="%d" height="%d" fill="#fff"/>'
  '<circle cx="%d" cy="%d" r="%d" fill="#000"/></mask>' % (W, H, W, H, CX, CY, HOLE - 2))
a('<mask id="mBand" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><circle cx="%d" cy="%d" r="%d" fill="#fff"/>'
  '<circle cx="%d" cy="%d" r="%d" fill="#000"/></mask>' % (W, H, CX, CY, round(258 * RING_S), CX, CY, HOLE + 2))
a('<radialGradient id="gGlow"><stop offset="0" stop-color="#fff6d0" stop-opacity="1"/><stop offset=".35" stop-color="#ffd970" stop-opacity=".7"/><stop offset="1" stop-color="#ffb030" stop-opacity="0"/></radialGradient>')
a('<radialGradient id="gPuff" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#eef0f6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
a('<linearGradient id="gShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff6d8" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>')
a('<filter id="fSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>')
a('<image id="star" width="%d" height="%d" href="%s"/>' % (star.width, star.height, data_uri(star)))
a('</defs>')

a('<style>')
a('.fb{transform-box:fill-box;transform-origin:center}')
# 1) ring pops in
a('#ring{transform-origin:%dpx %dpx;animation:ringIn .7s cubic-bezier(.2,1.5,.4,1) .3s both}' % (CX, CY))
a('@keyframes ringIn{0%{transform:scale(.05) rotate(-40deg);opacity:0}60%{opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}')
# 2) plate stretches out from behind the ring
a('#plate{transform-origin:%dpx %dpx;animation:plateIn .55s cubic-bezier(.25,1.2,.45,1) 1.05s both}' % (px, CY))
a('@keyframes plateIn{0%{transform:scaleX(.04);opacity:0;filter:blur(6px)}25%{opacity:1}100%{transform:scaleX(1);opacity:1;filter:blur(0)}}')
# 3) plate gems pop
a('.orn{animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}')
a('@keyframes pop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}')
# 4) wreath + big jester burst in
a('.dec{animation:decIn .6s cubic-bezier(.2,1.5,.4,1) both}')
a('@keyframes decIn{0%{transform:scale(.25) rotate(-10deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}')
# 5) burst: puffs + flying stars
a('.puff{opacity:0;animation:puff .95s ease-out both}')
a('@keyframes puff{0%{transform:scale(.2);opacity:0}25%{opacity:.95}100%{transform:scale(1.4);opacity:0}}')
a('.fly{opacity:0;animation:fly 1.15s cubic-bezier(.15,.7,.3,1) both}')
a('@keyframes fly{0%{transform:translate(0,0) scale(.3) rotate(0);opacity:0}15%{opacity:1}80%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1) rotate(220deg);opacity:0}}')
# idle
a('.bulb{mix-blend-mode:screen;animation:bulb 1.3s ease-in-out infinite}')
a('@keyframes bulb{0%,100%{opacity:.9}50%{opacity:.1}}')
a('#shine{animation:shine 4.5s ease-in-out 3.2s infinite}')
a('@keyframes shine{0%{transform:translateX(-500px)}45%,100%{transform:translateX(1400px)}}')
a('.glint{opacity:0;animation:glint 3.4s ease-in-out infinite}')
a('@keyframes glint{0%,70%,100%{opacity:0;transform:scale(.2) rotate(0)}82%{opacity:1;transform:scale(1) rotate(45deg)}}')
a('.bob{transform-origin:%dpx %dpx;animation:bob 2.8s ease-in-out 3s infinite}' % (jx + jester.width * .6, jy + jester.height))
a('@keyframes bob{0%,100%{transform:rotate(0)}50%{transform:rotate(-2.2deg)}}')
a('@media (prefers-reduced-motion:reduce){*{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}')
a('</style>')

a('<g mask="url(#mHole)">')
a('<g id="plate">%s</g>' % img(plate, px, py))
a('<g class="fb orn" style="animation-delay:1.55s">%s</g>' % img(g_top, gtx, gty))
a('<g class="fb orn" style="animation-delay:1.65s">%s</g>' % img(g_bot, gbx, gby))
ring_g = [img(ring, rx, ry)]
for i, (bx, by) in enumerate(bulbs):
    ring_g.append('<circle class="bulb" cx="%s" cy="%s" r="20" fill="url(#gGlow)" style="animation-delay:%.2fs"/>' % (f(bx), f(by), (i % 2) * .65))
ring_g.append('<g mask="url(#mBand)"><rect id="shine" x="%d" y="0" width="80" height="%d" fill="url(#gShine)" transform="skewX(-20)"/></g>' % (CX - 420, H))
a('<g id="ring">%s</g>' % ''.join(ring_g))
a('<g class="fb dec" style="animation-delay:2.0s">%s</g>' % img(wreath, wx, wy))
a('<g class="fb dec" style="animation-delay:2.12s"><g class="bob">%s</g></g>' % img(jester, jx, jy))

# glints
for (x, y, d) in [(CX - 150, 140, 0), (CX + 190, 600, .9), (GX - 200, 300, 1.6), (GX + 260, 430, 2.3), (jx + 380, 90, .4), (CX - 330, 320, 1.2)]:
    a('<g class="fb glint" style="animation-delay:%.1fs"><path d="M%s %s l7 -26 l7 26 l26 7 l-26 7 l-7 26 l-7 -26 l-26 -7 Z" fill="#fff"/></g>' % (3.2 + d, f(x - 7), f(y - 7)))
# puffs at the ring diagonals
R2 = 225
for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
    px_, py_ = CX + sx * R2 * .78, CY + sy * R2 * .78
    cl = ''.join('<circle cx="%s" cy="%s" r="%d" fill="url(#gPuff)"/>' % (
        f(px_ + 50 * math.cos(k * 1.25)), f(py_ + 42 * math.sin(k * 1.25)), 46 - k * 4) for k in range(6))
    a('<g class="fb puff" filter="url(#fSoft)" style="animation-delay:%.2fs">%s</g>' % (2.35 + i * .05, cl))
# flying stars
for i, (sx, sy, dx, dy) in enumerate([(jx + 330, 230, -220, -160), (jx + 420, 330, 170, -200), (jx + 260, 420, -280, 120), (jx + 450, 470, 140, 170),
                                      (CX + 260, 300, -180, -210), (CX + 200, 520, 140, 160), (GX, 270, -70, -220), (GX + 120, 470, 90, 200)]):
    a('<g class="fb fly" style="--dx:%dpx;--dy:%dpx;animation-delay:%.2fs"><use href="#star" x="%s" y="%s" transform="scale(1)"/></g>' % (
        dx, dy, 2.3 + (i % 4) * .06, f(sx - star.width / 2), f(sy - star.height / 2)))
a('</g>')
a('</svg>')
open(OUT, 'w').write('\n'.join(o))
print('svg bytes', len('\n'.join(o)))

if PREVIEW:
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for im, x, y in [(plate, px, py), (g_top, gtx, gty), (g_bot, gbx, gby), (ring, rx, ry), (wreath, wx, wy), (jester, jx, jy)]:
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        layer.paste(im, (round(x), round(y)), im)
        canvas = Image.alpha_composite(canvas, layer)
    canvas.save(PREVIEW)
