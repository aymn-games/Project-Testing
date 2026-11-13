#!/usr/bin/env python3
"""Builds frame-joker-circus.svg from the platform owner's 4 aligned layers
(assets/frame-src/joker-circus/01..04 *.png, each 2172x724 RGBA) and adds the
intro motion of the reference clip:
  ring pops in -> name plate slides out from behind it -> ruby gems pop ->
  decorations + big jester burst in with flying gold stars and white puffs
  rising from behind the top of the avatar ring -> idle (bulbs, shine, glints).
Layers are embedded as WebP data URIs: an SVG shown through <img> or a CSS
background can't load external files.
usage: python3 tools/build-frame-joker-circus.py assets/frame-src/joker-circus frame-joker-circus.svg
After changing the art, re-measure the template in js/agp-player-card.js
(the script prints the hole / name boxes)."""
import base64, io, math, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, OUT = sys.argv[1], sys.argv[2]
W, H = 2172, 724


def load(name):
    """RGBA layer with faint stray pixels (far from real content) removed."""
    a = np.asarray(Image.open('%s/%s.png' % (SRC, name)).convert('RGBA')).copy()
    keep = ndi.binary_dilation(a[..., 3] > 60, iterations=4)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    return a


def piece(arr, box=None):
    """Crop an RGBA array (optionally to box) to its content -> (Image, x, y)."""
    if box:
        x0, y0, x1, y1 = box
        sub = np.zeros_like(arr)
        sub[y0:y1, x0:x1] = arr[y0:y1, x0:x1]
        arr = sub
    im = Image.fromarray(arr, 'RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(bb), bb[0], bb[1]


ring_a = load('01_Gold_Ring')
plate_a = load('02_Nameplate')
gems_a = load('03_Ruby_Diamonds')
deco_a = load('04_Decorations')

# ---------------------------------------------------------------- measure the ring hole
cx, cy = 518.0, 368.0
alpha = ring_a[..., 3]
for _ in range(3):
    pts = []
    for k in range(72):
        t = math.radians(k * 5)
        for r in range(80, 330):
            x, y = int(round(cx + r * math.cos(t))), int(round(cy + r * math.sin(t)))
            if alpha[y, x] > 128:
                pts.append((x, y))
                break
    xs = np.array([p[0] for p in pts], float)
    ys = np.array([p[1] for p in pts], float)
    c = np.linalg.lstsq(np.c_[2 * xs, 2 * ys, np.ones(len(xs))], xs ** 2 + ys ** 2, rcond=None)[0]
    cx, cy = c[0], c[1]
    HOLE = math.sqrt(c[2] + cx * cx + cy * cy)
CX, CY = cx, cy

ring, rx, ry = piece(ring_a)
plate, px, py = piece(plate_a)
# gems: top and bottom are separate rows
grows = np.nonzero((gems_a[..., 3] > 60).any(axis=1))[0]
gsplit = int(grows[np.argmax(np.diff(grows))]) + 1
g_top, gtx, gty = piece(gems_a, (0, 0, W, gsplit))
g_bot, gbx, gby = piece(gems_a, (0, gsplit, W, H))
# decorations: split at the first empty column after the wreath (wreath | big jester)
dcols = (deco_a[..., 3] > 60).any(axis=0)
dsplit = next(x for x in range(900, 1700) if not dcols[x])
wreath, wx, wy = piece(deco_a, (0, 0, dsplit, H))
jester, jx, jy = piece(deco_a, (dsplit, 0, W, H))

# name box: velvet band between the gems, free of decorations
pr = plate_a[..., :3].astype(int)
velvet = (plate_a[..., 3] > 200) & (pr[..., 2] > pr[..., 0] + 30)
vys, vxs = np.nonzero(velvet)
gr = np.nonzero((gems_a[..., 3] > 60).any(axis=1))[0]
ny0 = int(gr[gr < gsplit].max()) + 5          # under the top gem
ny1 = int(gr[gr >= gsplit].min()) - 3         # above the bottom gem
band = (deco_a[ny0:ny1, vxs.min():vxs.max() + 1, 3] > 60).any(axis=0)
free = [i + vxs.min() for i in range(len(band)) if not band[i]]
nx0, nx1 = free[0] + 10, free[-1] - 10
GX = (gtx + g_top.width / 2)

# flying star sprite: the big gold star at the bottom of the jester layer
sa = deco_a[560:724, 1860:2060].astype(np.float32)
gold = (sa[..., 3] > 60) & (sa[..., 0] > 110) & (sa[..., 0] >= sa[..., 1]) & (sa[..., 1] >= sa[..., 2] * 1.15)
lab, _ = ndi.label(gold)
cnt = np.bincount(lab.ravel()); cnt[0] = 0
smask = ndi.binary_closing(lab == cnt.argmax(), iterations=2)
sa[..., 3] = np.where(smask, sa[..., 3], 0)
star = Image.fromarray(sa.astype(np.uint8), 'RGBA')
star = star.crop(star.getchannel('A').getbbox())
star = star.resize((80, round(80 * star.height / star.width)), Image.LANCZOS)

# marquee bulbs on the ring (for the twinkle overlay)
rgb = ring_a[..., :3].astype(np.float32)
bright = (rgb.mean(axis=2) > 235) & (ring_a[..., 3] > 200)
lab, n = ndi.label(bright)
bulbs = []
for i in range(1, n + 1):
    yy, xx = np.nonzero(lab == i)
    if len(xx) >= 12:
        bx, by = xx.mean(), yy.mean()
        if HOLE < math.hypot(bx - CX, by - CY) < HOLE + 70:
            bulbs.append((bx, by))

print('hole centre %.1f,%.1f r %.1f -> box %d %d %d %d' % (CX, CY, HOLE, round(CX - HOLE), round(CY - HOLE), round(CX + HOLE), round(CY + HOLE)))
print('name box', nx0, ny0, nx1, ny1, '| bulbs', len(bulbs), '| deco split', dsplit)


def data_uri(im, q=90):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def f(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')


def img(im, x, y):
    return '<image x="%d" y="%d" width="%d" height="%d" href="%s"/>' % (x, y, im.width, im.height, data_uri(im))


# ---------------------------------------------------------------- svg
o = []
a = o.append
a('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H))
a('<!-- AGP frame «الجوكر» — art: platform owner (4 layers), animated. Avatar hole centre %s,%s r=%s. '
  'Template: js/agp-player-card.js. Built by tools/build-frame-joker-circus.py -->' % (f(CX), f(CY), f(HOLE)))
a('<defs>')
a('<mask id="mHole" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><rect width="%d" height="%d" fill="#fff"/>'
  '<circle cx="%s" cy="%s" r="%s" fill="#000"/></mask>' % (W, H, W, H, f(CX), f(CY), f(HOLE - 2)))
a('<mask id="mBand" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><circle cx="%s" cy="%s" r="%s" fill="#fff"/>'
  '<circle cx="%s" cy="%s" r="%s" fill="#000"/></mask>' % (W, H, f(CX), f(CY), f(HOLE + 60), f(CX), f(CY), f(HOLE + 2)))
a('<radialGradient id="gGlow"><stop offset="0" stop-color="#fff6d0" stop-opacity="1"/><stop offset=".35" stop-color="#ffd970" stop-opacity=".7"/><stop offset="1" stop-color="#ffb030" stop-opacity="0"/></radialGradient>')
a('<radialGradient id="gPuff" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#eef0f6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
a('<linearGradient id="gShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff6d8" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>')
a('<filter id="fSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>')
a('<image id="star" width="%d" height="%d" href="%s"/>' % (star.width, star.height, data_uri(star)))
a('</defs>')

a('<style>')
a('.fb{transform-box:fill-box;transform-origin:center}')
a('#ring{transform-origin:%spx %spx;animation:ringIn .7s cubic-bezier(.2,1.5,.4,1) .3s both}' % (f(CX), f(CY)))
a('@keyframes ringIn{0%{transform:scale(.05) rotate(-40deg);opacity:0}60%{opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}')
a('#plate{transform-origin:%dpx %spx;animation:plateIn .55s cubic-bezier(.25,1.2,.45,1) 1.05s both}' % (px, f(py + plate.height / 2)))
a('@keyframes plateIn{0%{transform:scaleX(.04);opacity:0;filter:blur(6px)}25%{opacity:1}100%{transform:scaleX(1);opacity:1;filter:blur(0)}}')
a('.orn{animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}')
a('@keyframes pop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}')
a('.dec{animation:decIn .6s cubic-bezier(.2,1.5,.4,1) both}')
a('@keyframes decIn{0%{transform:scale(.25) rotate(-10deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}')
# cartoon smoke "poof": cloud shoots out diagonally, then breaks into a curved trail of dots
a('.poof{opacity:0;animation:poof .9s cubic-bezier(.2,.8,.3,1) both}')
a('@keyframes poof{0%{transform:translate(0,0) scale(.25);opacity:0}15%{opacity:1}50%{transform:translate(var(--dx),var(--dy)) scale(1.15);opacity:1}72%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.6);opacity:0}}')
a('.dot{opacity:0;animation:dot .8s ease-out both}')
a('@keyframes dot{0%{transform:scale(.3);opacity:0}25%{transform:scale(1);opacity:1}100%{transform:translate(var(--tx),var(--ty)) scale(.2);opacity:0}}')
a('.streak{opacity:0;stroke-dasharray:120 400;stroke-dashoffset:120;animation:streak .45s ease-out both}')
a('@keyframes streak{0%{opacity:1;stroke-dashoffset:120}100%{opacity:0;stroke-dashoffset:-150}}')
a('.fly{opacity:0;animation:fly 1.15s cubic-bezier(.15,.7,.3,1) both}')
a('@keyframes fly{0%{transform:translate(0,0) scale(.3) rotate(0);opacity:0}15%{opacity:1}80%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1) rotate(220deg);opacity:0}}')
a('.bulb{mix-blend-mode:screen;animation:bulb 1.3s ease-in-out infinite}')
a('@keyframes bulb{0%,100%{opacity:.9}50%{opacity:.1}}')
a('#shine{animation:shine 4.5s ease-in-out 3.2s infinite}')
a('@keyframes shine{0%{transform:translateX(-500px)}45%,100%{transform:translateX(1400px)}}')
a('.glint{opacity:0;animation:glint 3.4s ease-in-out infinite}')
a('@keyframes glint{0%,70%,100%{opacity:0;transform:scale(.2) rotate(0)}82%{opacity:1;transform:scale(1) rotate(45deg)}}')
a('.bob{transform-origin:%dpx %dpx;animation:bob 2.8s ease-in-out 3s infinite}' % (jx + jester.width * .6, jy + jester.height))
a('@keyframes bob{0%,100%{transform:rotate(0)}50%{transform:rotate(-2deg)}}')
a('@media (prefers-reduced-motion:reduce){*{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}')
a('</style>')

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

# cartoon smoke poofs from behind the ring's 4 diagonals (drawn over the decorations, like the reference clip)
a('<g mask="url(#mHole)">')
for ci, deg in enumerate((225, 315, 135, 45)):
    t = math.radians(deg)
    ux, uy = math.cos(t), math.sin(t)
    ox, oy = CX + (HOLE + 55) * ux, CY + (HOLE + 55) * uy          # bursts out at the ring band
    out = 150                                                     # how far the cloud shoots out
    d0 = 2.3 + ci * .05
    # speed lines from the ring outward
    for li, off in enumerate((-26, 0, 26)):
        nx_, ny_ = -uy * off, ux * off
        x0, y0 = CX + (HOLE + 50) * ux + nx_, CY + (HOLE + 50) * uy + ny_
        x1, y1 = x0 + 230 * ux, y0 + 230 * uy
        a('<line class="streak" x1="%s" y1="%s" x2="%s" y2="%s" stroke="#fff" stroke-width="6" stroke-linecap="round" style="animation-delay:%.2fs"/>' % (
            f(x0), f(y0), f(x1), f(y1), d0 + li * .04))
    # the cloud: overlapping circles with a soft grey underside (cartoon puff)
    circles = []
    for k, (ang, rr, dist) in enumerate([(0, 46, 0), (60, 38, 44), (120, 36, 46), (180, 40, 44), (240, 34, 42), (300, 38, 44), (30, 28, 70), (210, 28, 68)]):
        a_ = math.radians(ang)
        cx_, cy_ = ox + dist * math.cos(a_), oy + dist * .8 * math.sin(a_)
        circles.append('<circle cx="%s" cy="%s" r="%d" fill="#d9dce8"/>' % (f(cx_ + 3), f(cy_ + 6), rr))
        circles.append('<circle cx="%s" cy="%s" r="%d" fill="#fff"/>' % (f(cx_), f(cy_), rr))
    a('<g class="fb poof" style="--dx:%dpx;--dy:%dpx;animation-delay:%.2fs">%s</g>' % (round(out * ux), round(out * uy), d0, ''.join(circles)))
    # dissipating trail: curved arc of small dots around the cloud's final spot
    fx, fy = ox + out * ux, oy + out * uy
    for j in range(9):
        aa = math.radians(deg - 95 + j * 24)
        rr = 95 + j * 3
        dx_, dy_ = fx + rr * math.cos(aa), fy + rr * math.sin(aa)
        a('<circle class="fb dot" cx="%s" cy="%s" r="%d" fill="#fff" style="--tx:%dpx;--ty:%dpx;animation-delay:%.2fs"/>' % (
            f(dx_), f(dy_), 17 - j, round(40 * ux), round(40 * uy), d0 + .45 + j * .035))
a('</g>')

a('<g mask="url(#mHole)">')
for (x, y, d) in [(CX - 150, 140, 0), (CX + 190, 620, .9), (GX - 200, 300, 1.6), (GX + 300, 470, 2.3), (jx + 380, 90, .4), (CX - 330, 330, 1.2)]:
    a('<g class="fb glint" style="animation-delay:%.1fs"><path d="M%s %s l7 -26 l7 26 l26 7 l-26 7 l-7 26 l-7 -26 l-26 -7 Z" fill="#fff"/></g>' % (3.2 + d, f(x - 7), f(y - 7)))
for i, (sx, sy, dx, dy) in enumerate([(jx + 300, 230, -220, -160), (jx + 400, 330, 170, -200), (jx + 230, 430, -280, 120), (jx + 420, 480, 140, 170),
                                      (CX + 280, 300, -180, -210), (CX + 220, 540, 140, 160), (GX, 270, -70, -220), (GX + 140, 480, 90, 200)]):
    a('<g class="fb fly" style="--dx:%dpx;--dy:%dpx;animation-delay:%.2fs"><use href="#star" x="%s" y="%s"/></g>' % (
        dx, dy, 2.3 + (i % 4) * .06, f(sx - star.width / 2), f(sy - star.height / 2)))
a('</g>')
a('</svg>')
svg = '\n'.join(o)
open(OUT, 'w').write(svg)
print('svg bytes', len(svg))
