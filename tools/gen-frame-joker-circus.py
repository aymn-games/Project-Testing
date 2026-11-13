#!/usr/bin/env python3
"""Generates frame-joker-circus.svg (animated joker frame, 2172x724 canvas).
Usage: python3 tools/gen-frame-joker-circus.py frame-joker-circus.svg
After changing geometry, re-measure the template in js/agp-player-card.js."""
import math, sys

W, H = 2172, 724
CX, CY = 430, 352          # ring centre
HOLE = 212                 # transparent avatar hole radius
out = []
def a(s): out.append(s)

def f(v): return ('%.1f' % v).rstrip('0').rstrip('.')

def star(cx, cy, r1, r2, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        t = math.radians(rot + i * 180 / n)
        pts.append('%s,%s' % (f(cx + r * math.cos(t)), f(cy + r * math.sin(t))))
    return ' '.join(pts)

def diamond(cx, cy, w, h, cls=''):
    """Faceted red gem in a gold setting."""
    g = []
    g.append('<g class="%s">' % cls)
    g.append('<path d="M%s %s L%s %s L%s %s L%s %s Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>' % (
        f(cx), f(cy - h * .62), f(cx + w * .62), f(cy), f(cx), f(cy + h * .62), f(cx - w * .62), f(cy)))
    g.append('<path d="M%s %s L%s %s L%s %s L%s %s Z" fill="url(#gRuby)" stroke="#4a0008" stroke-width="2"/>' % (
        f(cx), f(cy - h / 2), f(cx + w / 2), f(cy), f(cx), f(cy + h / 2), f(cx - w / 2), f(cy)))
    g.append('<path d="M%s %s L%s %s L%s %s L%s %s Z" fill="#ff8f98" opacity=".75"/>' % (
        f(cx), f(cy - h / 2), f(cx + w * .2), f(cy - h * .05), f(cx), f(cy + h * .1), f(cx - w * .2), f(cy - h * .05)))
    g.append('<path d="M%s %s L%s %s L%s %s Z" fill="#fff" opacity=".7"/>' % (
        f(cx - w * .1), f(cy - h * .32), f(cx - w * .02), f(cy - h * .18), f(cx - w * .22), f(cy - h * .06)))
    g.append('</g>')
    return ''.join(g)

def bell(cx, cy, r):
    return ('<g><circle cx="%s" cy="%s" r="%s" fill="url(#gGoldBall)" stroke="#5a2e08" stroke-width="2"/>'
            '<path d="M%s %s h%s" stroke="#5a2e08" stroke-width="2"/>'
            '<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity=".8"/></g>') % (
        f(cx), f(cy), f(r), f(cx - r * .6), f(cy + r * .25), f(r * 1.2), f(cx - r * .35), f(cy - r * .35), f(r * .25))

def jester_face(cx, cy, s, wink=False, flip=False):
    """Original jester head drawn around (cx, cy), scale s (head radius ~ 70*s)."""
    g = ['<g transform="translate(%s %s) scale(%s %s)">' % (f(cx), f(cy), f(-s if flip else s), f(s))]
    # ruff collar
    for i, ang in enumerate(range(200, 341, 20)):
        t = math.radians(ang)
        x, y = 70 * math.cos(t) * -1, 58 + 18 * math.sin(t) * -1
    for i in range(9):
        t = math.radians(200 + i * 17.5)
        x, y = 78 * math.cos(t), 60 - 22 * math.sin(t) + 18
        g.append('<circle cx="%s" cy="%s" r="24" fill="url(#%s)" stroke="#3a0a10" stroke-width="2"/>' % (
            f(x), f(y), 'gRed' if i % 2 == 0 else 'gBlue'))
    # hat lobes (behind head)
    g.append('<path d="M-40 -40 C-90 -70 -120 -60 -150 -20 C-120 -40 -95 -30 -70 -5 Z" fill="url(#gBlue)" stroke="#0a1450" stroke-width="3"/>')
    g.append('<path d="M40 -40 C90 -70 120 -60 150 -20 C120 -40 95 -30 70 -5 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="3"/>')
    g.append('<path d="M-30 -55 C-40 -120 0 -150 30 -150 C10 -125 10 -90 30 -55 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="3"/>')
    g.append(bell(-150, -18, 13) + bell(150, -18, 13) + bell(32, -152, 12))
    # face
    g.append('<ellipse cx="0" cy="8" rx="64" ry="68" fill="url(#gSkin)" stroke="#8a4a3a" stroke-width="3"/>')
    g.append('<ellipse cx="-34" cy="30" rx="15" ry="11" fill="#ff8aa0" opacity=".7"/>')
    g.append('<ellipse cx="34" cy="30" rx="15" ry="11" fill="#ff8aa0" opacity=".7"/>')
    # eyes
    g.append('<path d="M-38 -20 Q-24 -34 -10 -22" stroke="#5a2a1a" stroke-width="4" fill="none" stroke-linecap="round"/>')
    g.append('<path d="M10 -22 Q24 -34 38 -20" stroke="#5a2a1a" stroke-width="4" fill="none" stroke-linecap="round"/>')
    g.append('<ellipse cx="-24" cy="-4" rx="12" ry="14" fill="#fff" stroke="#3a2a2a" stroke-width="2"/>'
             '<circle cx="-22" cy="-2" r="8" fill="#1f3c9a"/><circle cx="-22" cy="-2" r="4" fill="#0a0f2a"/>'
             '<circle cx="-19" cy="-6" r="3" fill="#fff"/>')
    if wink:
        g.append('<path d="M10 -2 Q24 8 38 -2" stroke="#3a2a2a" stroke-width="5" fill="none" stroke-linecap="round"/>')
    else:
        g.append('<ellipse cx="24" cy="-4" rx="12" ry="14" fill="#fff" stroke="#3a2a2a" stroke-width="2"/>'
                 '<circle cx="22" cy="-2" r="8" fill="#1f3c9a"/><circle cx="22" cy="-2" r="4" fill="#0a0f2a"/>'
                 '<circle cx="25" cy="-6" r="3" fill="#fff"/>')
    # mouth
    g.append('<path d="M-34 28 Q0 80 34 28 Q0 40 -34 28 Z" fill="#7a0a14" stroke="#4a0008" stroke-width="3"/>')
    g.append('<path d="M-26 32 Q0 42 26 32 L24 38 Q0 46 -24 38 Z" fill="#fff"/>')
    g.append('<path d="M-14 56 Q0 46 14 56 Q0 64 -14 56 Z" fill="#ff5a6a"/>')
    # nose
    g.append('<circle cx="0" cy="14" r="15" fill="url(#gNose)" stroke="#6a0010" stroke-width="2"/><circle cx="-5" cy="9" r="5" fill="#fff" opacity=".85"/>')
    # crown
    g.append('<path d="M-46 -48 L-46 -78 L-28 -60 L-14 -88 L0 -64 L14 -88 L28 -60 L46 -78 L46 -48 Q0 -58 -46 -48 Z" '
             'fill="url(#gGold)" stroke="#5a2e08" stroke-width="3" stroke-linejoin="round"/>')
    g.append('<circle cx="0" cy="-56" r="6" fill="url(#gRuby)"/><circle cx="-28" cy="-54" r="4" fill="#2f5fd6"/><circle cx="28" cy="-54" r="4" fill="#2f5fd6"/>')
    for x in (-46, -14, 14, 46):
        g.append('<circle cx="%d" cy="%d" r="5" fill="url(#gGoldBall)"/>' % (x, -80 if abs(x) == 46 else -90))
    g.append('</g>')
    return ''.join(g)

def card(cx, cy, rot, suit_red):
    sym = '&#9829;' if suit_red else '&#9824;'
    col = '#d0101c' if suit_red else '#111'
    return ('<g transform="translate(%s %s) rotate(%s)">'
            '<rect x="-48" y="-68" width="96" height="136" rx="10" fill="#fffaf2" stroke="#8a6a3a" stroke-width="3"/>'
            '<text x="-34" y="-36" font-family="Georgia,serif" font-weight="700" font-size="30" fill="%s">A</text>'
            '<text x="0" y="22" text-anchor="middle" font-size="58" fill="%s">%s</text>'
            '</g>') % (f(cx), f(cy), f(rot), col, col, sym)

def trumpet(x, y, rot):
    return ('<g transform="translate(%s %s) rotate(%s)">'
            '<rect x="0" y="-9" width="120" height="18" rx="6" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>'
            '<path d="M110 -10 Q150 -14 170 -48 L170 48 Q150 14 110 10 Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>'
            '<ellipse cx="170" cy="0" rx="12" ry="48" fill="#8a4a12" stroke="#5a2e08" stroke-width="3"/>'
            '<circle cx="40" cy="-18" r="7" fill="url(#gGoldBall)"/><circle cx="62" cy="-18" r="7" fill="url(#gGoldBall)"/>'
            '</g>') % (f(x), f(y), f(rot))

def glove(cx, cy, s, rot):
    return ('<g transform="translate(%s %s) rotate(%s) scale(%s)">'
            '<ellipse cx="0" cy="0" rx="34" ry="30" fill="#fff" stroke="#8a8aa0" stroke-width="3"/>'
            '<rect x="-30" y="-56" width="15" height="40" rx="7.5" fill="#fff" stroke="#8a8aa0" stroke-width="3"/>'
            '<rect x="-13" y="-64" width="15" height="46" rx="7.5" fill="#fff" stroke="#8a8aa0" stroke-width="3"/>'
            '<rect x="4" y="-60" width="15" height="44" rx="7.5" fill="#fff" stroke="#8a8aa0" stroke-width="3"/>'
            '<rect x="20" y="-48" width="13" height="34" rx="6.5" fill="#fff" stroke="#8a8aa0" stroke-width="3"/>'
            '<ellipse cx="-38" cy="6" rx="10" ry="20" transform="rotate(-35 -38 6)" fill="#fff" stroke="#8a8aa0" stroke-width="3"/>'
            '<ellipse cx="0" cy="0" rx="30" ry="26" fill="#fff"/>'
            '<rect x="-30" y="22" width="60" height="22" rx="8" fill="url(#gRed)" stroke="#4a0008" stroke-width="3"/>'
            '</g>') % (f(cx), f(cy), f(rot), f(s))

def pennant(x, y, ang, red):
    """Triangular bunting flag hanging at (x,y) rotated by ang."""
    return ('<g transform="translate(%s %s) rotate(%s)">'
            '<path d="M-34 0 L34 0 L28 72 L0 56 L-28 72 Z" fill="url(#%s)" stroke="#5a2e08" stroke-width="3" stroke-linejoin="round"/>'
            '<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="1.5"/>'
            '</g>') % (f(x), f(y), f(ang), 'gRed' if red else 'gBlue', star(0, 28, 14, 6))

# ---------------------------------------------------------------- document
a('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H))
a('<!-- AGP frame: «إطار الجوكر» — original design, animated (intro ~3s then idle loop). '
  'Avatar hole: centre %d,%d r=%d (transparent). Measured template: js/agp-player-card.js -->' % (CX, CY, HOLE))
a('<defs>')
a('<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".35" stop-color="#f2b54a"/><stop offset=".7" stop-color="#b8701e"/><stop offset="1" stop-color="#6e3a0c"/></linearGradient>')
a('<linearGradient id="gGoldH" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#d48b2a"/><stop offset="1" stop-color="#7a420e"/></linearGradient>')
a('<radialGradient id="gGoldBall" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff6c8"/><stop offset=".4" stop-color="#e6a23a"/><stop offset="1" stop-color="#6e3a0c"/></radialGradient>')
a('<linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a52"/><stop offset=".55" stop-color="#d81f2a"/><stop offset="1" stop-color="#8a0c16"/></linearGradient>')
a('<linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7ff0"/><stop offset=".55" stop-color="#2048c0"/><stop offset="1" stop-color="#0f2370"/></linearGradient>')
a('<linearGradient id="gRuby" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9aa2"/><stop offset=".45" stop-color="#e3162a"/><stop offset="1" stop-color="#6a0010"/></linearGradient>')
a('<radialGradient id="gSkin" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#fffaf6"/><stop offset=".7" stop-color="#ffe6da"/><stop offset="1" stop-color="#f3b9a4"/></radialGradient>')
a('<radialGradient id="gNose" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff7a82"/><stop offset=".6" stop-color="#e0101e"/><stop offset="1" stop-color="#7a0010"/></radialGradient>')
a('<radialGradient id="gVelvet" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#2f62e6"/><stop offset=".6" stop-color="#1c3caf"/><stop offset="1" stop-color="#0c1d63"/></radialGradient>')
a('<radialGradient id="gBulb" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#fff2c0"/><stop offset="1" stop-color="#e09a30"/></radialGradient>')
a('<radialGradient id="gGlow"><stop offset="0" stop-color="#fff3c0" stop-opacity=".9"/><stop offset="1" stop-color="#ffcc55" stop-opacity="0"/></radialGradient>')
a('<radialGradient id="gPuff" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f0f0f6"/><stop offset="1" stop-color="#c8c8d8"/></radialGradient>')
a('<linearGradient id="gShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>')
# quilted velvet pattern
a('<pattern id="pQuilt" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
  '<path d="M0 0 H44 M0 0 V44" stroke="#0a1650" stroke-width="2.5" opacity=".55"/>'
  '<path d="M1.5 1.5 H44 M1.5 1.5 V44" stroke="#5b86ff" stroke-width="1" opacity=".35"/>'
  '<circle cx="0" cy="0" r="2.6" fill="#f2c25a"/></pattern>')
a('<clipPath id="cRing"><path clip-rule="evenodd" d="M%d %d a266 266 0 1 0 532 0 a266 266 0 1 0 -532 0 Z M%d %d a%d %d 0 1 0 %d 0 a%d %d 0 1 0 %d 0 Z"/></clipPath>' % (CX - 266, CY, CX - HOLE - 4, CY, HOLE + 4, HOLE + 4, 2 * HOLE + 8, HOLE + 4, HOLE + 4, -2 * HOLE - 8))
a('<clipPath id="cPlate"><rect x="700" y="252" width="1170" height="216" rx="24"/></clipPath>')
a('<mask id="mHole" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><rect width="%d" height="%d" fill="#fff"/><circle cx="%d" cy="%d" r="%d" fill="#000"/></mask>' % (W, H, W, H, CX, CY, HOLE - 3))
a('</defs>')

# ---------------------------------------------------------------- styles / motion
O = '%dpx %dpx' % (CX, CY)
a('<style>')
a('.fb{transform-box:fill-box;transform-origin:center}')
# 1) ring pops in (0.35s -> 1.0s)
a('#ring{transform-origin:%s;animation:ringIn .7s cubic-bezier(.2,1.5,.4,1) .3s both}' % O)
a('@keyframes ringIn{0%{transform:scale(.05) rotate(-40deg);opacity:0}60%{opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}')
# 2) plate stretches out from behind ring (1.05s -> 1.55s)
a('#plate{transform-origin:700px 360px;animation:plateIn .55s cubic-bezier(.25,1.25,.45,1) 1.05s both}')
a('@keyframes plateIn{0%{transform:scaleX(.04);opacity:0;filter:blur(6px)}25%{opacity:1}100%{transform:scaleX(1);opacity:1;filter:blur(0)}}')
# 3) plate gems/ornaments pop (1.55s ->)
a('.orn{animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}')
a('@keyframes pop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}')
# 4) jokers + decorations burst in (2.0s ->)
a('.dec{animation:decIn .55s cubic-bezier(.2,1.55,.4,1) both}')
a('@keyframes decIn{0%{transform:scale(.2) rotate(-12deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}')
# 5) burst: smoke puffs + flying stars (2.35s -> 3.2s)
a('.puff{opacity:0;animation:puff .9s ease-out both}')
a('@keyframes puff{0%{transform:scale(.2);opacity:0}25%{opacity:1}100%{transform:scale(1.35);opacity:0}}')
a('.fly{opacity:0;animation:fly 1.1s cubic-bezier(.15,.7,.3,1) both}')
a('@keyframes fly{0%{transform:translate(0,0) scale(.3) rotate(0);opacity:0}15%{opacity:1}80%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1) rotate(200deg);opacity:0}}')
# idle loop (after intro)
a('.bulb{animation:bulb 1.2s ease-in-out infinite}')
a('@keyframes bulb{0%,100%{opacity:1}50%{opacity:.35}}')
a('.glint{opacity:0;animation:glint 3.2s ease-in-out infinite}')
a('@keyframes glint{0%,70%,100%{opacity:0;transform:scale(.2) rotate(0)}82%{opacity:1;transform:scale(1) rotate(45deg)}}')
a('#shine{animation:shine 4.5s ease-in-out 3.2s infinite}')
a('@keyframes shine{0%{transform:translateX(-500px)}45%,100%{transform:translateX(2400px)}}')
a('.bob{animation:bob 2.6s ease-in-out 3s infinite}')
a('@keyframes bob{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg)}}')
a('.tw{animation:tw 1.8s ease-in-out infinite}')
a('@keyframes tw{0%,100%{transform:scale(1)}50%{transform:scale(.78)}}')
a('@media (prefers-reduced-motion:reduce){*{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}')
a('</style>')

def dec(inner, delay, extra_cls=''):
    return '<g class="fb dec %s" style="animation-delay:%.2fs">%s</g>' % (extra_cls, delay, inner)

# ================================================================ BACK LAYER (behind ring)
back = []
# left group: hats behind ring top
back.append(dec('<path d="M300 150 C230 40 120 60 70 150 C130 110 200 120 250 190 Z" fill="url(#gBlue)" stroke="#0a1450" stroke-width="4"/>' + bell(72, 148, 20), 2.05))
back.append(dec('<path d="M560 150 C630 40 740 60 790 150 C730 110 660 120 610 190 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="4"/>' + bell(788, 148, 20), 2.08))
back.append(dec('<path d="M330 110 C300 10 380 -10 420 40 C380 30 370 70 380 110 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="4"/>'
                '<path d="M530 110 C560 10 480 -10 440 40 C480 30 490 70 480 110 Z" fill="url(#gBlue)" stroke="#0a1450" stroke-width="4"/>', 2.02))
back.append(dec(bell(250, 70, 22) + bell(610, 70, 22), 2.1))
# cards
back.append(dec(card(185, 230, -18, True), 2.12))
back.append(dec(card(680, 230, 18, False), 2.14))
# trumpets
back.append(dec(trumpet(300, 520, 160), 2.18))
back.append(dec(trumpet(560, 520, 20), 2.2))
# ribbons
back.append(dec('<path d="M330 600 C250 640 170 610 70 660 L120 690 L60 715 C180 690 260 700 360 640 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="3"/>', 2.22))
back.append(dec('<path d="M530 600 C610 640 690 610 790 660 L740 690 L800 715 C680 690 600 700 500 640 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="3"/>', 2.22))
# bunting under ring
bunt = []
for i, ang in enumerate(range(118, 63, -11)):
    t = math.radians(ang)
    x, y = CX + 282 * math.cos(t), CY + 282 * math.sin(t)
    bunt.append(pennant(x, y, ang - 90, i % 2 == 1))
BUNT = dec(''.join(bunt), 2.16)

# ================================================================ PLATE (name plate)
plate = []
plate.append('<g id="plate">')
# ornate gold frame
plate.append('<path d="M700 262 H1830 Q1866 262 1866 298 V422 Q1866 458 1830 458 H700 Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="5"/>')
# end scroll cap (right)
plate.append('<path d="M1860 300 C1900 300 1910 330 1888 345 C1912 352 1912 368 1888 375 C1910 390 1900 420 1860 420 Z" fill="url(#gGoldH)" stroke="#5a2e08" stroke-width="4"/>')
plate.append('<circle cx="1895" cy="360" r="11" fill="url(#gRuby)" stroke="#5a2e08" stroke-width="2"/>')
# inner bevel + velvet
plate.append('<rect x="718" y="280" width="1130" height="160" rx="16" fill="#3a1e06"/>')
plate.append('<rect x="726" y="287" width="1114" height="146" rx="12" fill="url(#gVelvet)"/>')
plate.append('<rect x="726" y="287" width="1114" height="146" rx="12" fill="url(#pQuilt)"/>')
plate.append('<rect x="726" y="287" width="1114" height="146" rx="12" fill="none" stroke="#ffd36a" stroke-width="2" opacity=".6"/>')
# beading along the frame
for x in range(760, 1830, 34):
    plate.append('<circle cx="%d" cy="271" r="3.6" fill="#fff0b0" opacity=".85"/><circle cx="%d" cy="449" r="3.6" fill="#fff0b0" opacity=".85"/>' % (x, x))
plate.append('</g>')

# plate ornaments (pop after the plate)
orn = []
orn.append('<g class="fb orn" style="animation-delay:1.55s">%s</g>' % diamond(1270, 262, 64, 76))
orn.append('<g class="fb orn" style="animation-delay:1.62s">%s</g>' % diamond(1270, 458, 64, 76))
orn.append('<g class="fb orn" style="animation-delay:1.7s"><polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/></g>' % star(745, 280, 40, 17))
orn.append('<g class="fb orn" style="animation-delay:1.74s"><polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/></g>' % star(752, 446, 36, 15))
orn.append('<g class="fb orn" style="animation-delay:1.78s"><polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/></g>' % star(1800, 448, 40, 17))

# ================================================================ RING
ring = ['<g id="ring">']
# scalloped back plate (8 lobes)
lobes = []
for i in range(8):
    t = math.radians(i * 45 + 22.5)
    lobes.append('<circle cx="%s" cy="%s" r="62"/>' % (f(CX + 262 * math.cos(t)), f(CY + 262 * math.sin(t))))
ring.append('<g fill="url(#gGoldH)" stroke="#5a2e08" stroke-width="4">%s</g>' % ''.join(lobes))
# finials top/bottom/left/right
ring.append('<path d="M%d %d L%d %d L%d %d Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>' % (CX - 26, CY - 270, CX, CY - 330, CX + 26, CY - 270))
ring.append('<path d="M%d %d L%d %d L%d %d Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>' % (CX - 26, CY + 270, CX, CY + 320, CX + 26, CY + 270))
ring.append(diamond(CX - 300, CY, 40, 46) + diamond(CX + 300, CY, 40, 46))
# main band (with transparent hole)
ring.append('<path fill-rule="evenodd" d="M%d %d a%d %d 0 1 0 %d 0 a%d %d 0 1 0 %d 0 Z M%d %d a%d %d 0 1 0 %d 0 a%d %d 0 1 0 %d 0 Z" '
            'fill="url(#gGold)" stroke="#5a2e08" stroke-width="5"/>' % (
                CX - 266, CY, 266, 266, 532, 266, 266, -532,
                CX - HOLE, CY, HOLE, HOLE, 2 * HOLE, HOLE, HOLE, -2 * HOLE))
# inner bevel ring
ring.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#7a420e" stroke-width="10"/>' % (CX, CY, HOLE + 5))
ring.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#ffe39a" stroke-width="3" opacity=".8"/>' % (CX, CY, HOLE + 11))
ring.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#ffe39a" stroke-width="3" opacity=".7"/>' % (CX, CY, 260))
# marquee bulbs
for i in range(24):
    t = math.radians(i * 15)
    x, y = CX + 239 * math.cos(t), CY + 239 * math.sin(t)
    ring.append('<circle cx="%s" cy="%s" r="20" fill="url(#gGlow)" class="bulb" style="animation-delay:%.2fs"/>' % (f(x), f(y), (i % 2) * .6))
    ring.append('<circle cx="%s" cy="%s" r="10" fill="url(#gBulb)" stroke="#7a420e" stroke-width="2"/>' % (f(x), f(y)))
# top & bottom gems on the ring
ring.append(diamond(CX, CY - 262, 66, 80))
ring.append(diamond(CX, CY + 262, 66, 80))
# side blue stars
for sx in (CX - 250, CX + 250):
    ring.append('<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>' % star(sx, CY - 70, 40, 18))
    ring.append('<polygon points="%s" fill="url(#gBlue)"/>' % star(sx, CY - 70, 26, 11))
# shine sweep, clipped to the ring band
ring.append('<g clip-path="url(#cRing)"><rect id="shine" x="0" y="0" width="90" height="724" fill="url(#gShine)" transform="skewX(-20)" opacity=".8"/></g>')
ring.append('</g>')

# ================================================================ FRONT LAYER (over ring)
front = [BUNT]
# crown on top of ring
crown = ('<path d="M%d 118 L%d 40 L%d 86 L%d 14 L%d 86 L%d 40 L%d 118 Q%d 100 %d 118 Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="4" stroke-linejoin="round"/>' % (
    CX - 110, CX - 112, CX - 56, CX, CX + 56, CX + 112, CX + 110, CX, CX - 110))
crown += '<circle cx="%d" cy="14" r="12" fill="url(#gGoldBall)"/><circle cx="%d" cy="40" r="10" fill="url(#gGoldBall)"/><circle cx="%d" cy="40" r="10" fill="url(#gGoldBall)"/>' % (CX, CX - 112, CX + 112)
crown += '<circle cx="%d" cy="92" r="9" fill="url(#gRuby)"/><circle cx="%d" cy="96" r="7" fill="#2f5fd6"/><circle cx="%d" cy="96" r="7" fill="#2f5fd6"/>' % (CX, CX - 60, CX + 60)
front.append(dec(crown + diamond(CX, 120, 60, 72), 2.0))
# pendant under ring
front.append(dec('<path d="M%d 640 V676" stroke="#b8701e" stroke-width="5"/>%s<circle cx="%d" cy="706" r="13" fill="url(#gGoldBall)" stroke="#5a2e08" stroke-width="2"/>' % (
    CX, diamond(CX, 660, 44, 54), CX), 2.24))
# small jesters on both sides of the ring
front.append(dec(jester_face(150, 405, .85), 2.06, 'side'))
front.append(dec(jester_face(712, 405, .85, wink=True, flip=True), 2.1, 'side'))
# right big jester (owner of the plate end)
big = []
big.append('<path d="M1880 400 C1920 360 2060 360 2100 400 L2120 560 L2075 600 L2035 560 L1990 600 L1945 560 L1900 600 L1860 560 Z" fill="url(#gRed)" stroke="#4a0008" stroke-width="4" stroke-linejoin="round"/>')
big.append('<path d="M1990 372 L2040 560 L1990 600 L1945 560 Z" fill="url(#gBlue)" stroke="#0a1450" stroke-width="3" stroke-linejoin="round"/>')
big.append('<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="2"/>' % star(1992, 460, 24, 10))
big.append('<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="2"/>' % star(1992, 530, 18, 8))
big.append(jester_face(1990, 245, 1.32, wink=True, flip=True))
front.append(dec('<g class="fb bob">%s</g>' % ''.join(big), 2.12))
# bell + horn above plate top-right
front.append(dec('<path d="M1660 250 C1650 200 1680 160 1730 150 C1760 190 1750 240 1700 262 Z" fill="url(#gGold)" stroke="#5a2e08" stroke-width="4"/>'
                 '<ellipse cx="1680" cy="256" rx="30" ry="10" fill="#8a4a12" stroke="#5a2e08" stroke-width="3"/>' + bell(1672, 276, 11)
                 , 2.18))
# gloves reaching out
front.append(dec('<g class="fb bob">' + glove(1790, 250, 1.1, -70) + '</g>', 2.2))
front.append(dec(glove(2120, 430, 1.0, 20), 2.24))
# stars cluster bottom-right
front.append(dec('<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="4"/>' % star(1880, 600, 78, 32), 2.26, ''))
front.append(dec('<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>' % star(1780, 540, 40, 17), 2.3))
front.append(dec('<polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="3"/>' % star(2120, 610, 42, 18), 2.32))
front.append(dec(diamond(1830, 520, 52, 64) + diamond(2060, 660, 44, 54), 2.28))

# idle twinkles & glints
idle = []
for (x, y, d) in [(260, 140, 0), (610, 560, .9), (1300, 300, 1.6), (1700, 420, 2.3), (2070, 120, .4), (120, 300, 1.2), (900, 440, 2.0)]:
    idle.append('<g class="fb glint" style="animation-delay:%.1fs"><path d="M%d %d l8 -30 l8 30 l30 8 l-30 8 l-8 30 l-8 -30 l-30 -8 Z" fill="#fff"/></g>' % (3.2 + d, x - 8, y - 8))

# burst: smoke puffs around ring diagonals + flying stars from the right jester
burst = []
for i, (px, py) in enumerate([(CX - 250, CY - 230), (CX + 250, CY - 230), (CX - 250, CY + 230), (CX + 250, CY + 230)]):
    cl = ''.join('<circle cx="%s" cy="%s" r="%d" fill="url(#gPuff)"/>' % (f(px + 55 * math.cos(k * 1.3)), f(py + 48 * math.sin(k * 1.3)), 44 - k * 4) for k in range(5))
    burst.append('<g class="fb puff" style="animation-delay:%.2fs">%s</g>' % (2.35 + i * .05, cl))
for i, (sx, sy, dx, dy) in enumerate([(1900, 200, -200, -150), (1950, 300, 160, -190), (1850, 380, -260, 120), (1980, 420, 150, 180),
                                      (800, 300, -150, -200), (700, 500, 120, 170), (1500, 260, -60, -230), (1600, 470, 80, 220)]):
    burst.append('<g class="fb fly" style="--dx:%dpx;--dy:%dpx;animation-delay:%.2fs"><polygon points="%s" fill="url(#gGold)" stroke="#5a2e08" stroke-width="2"/></g>' % (
        dx, dy, 2.3 + (i % 4) * .06, star(sx, sy, 22, 9)))

a('<g mask="url(#mHole)">')
a('<g id="back">%s</g>' % ''.join(back))
a(''.join(plate))
a(''.join(orn))
a(''.join(ring))
a('<g id="front">%s</g>' % ''.join(front))
a('<g id="idle">%s</g>' % ''.join(idle))
a('<g id="burst">%s</g>' % ''.join(burst))
a('</g>')
a('</svg>')

open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(out))
print('written', sys.argv[1])
