"""Remove the white background from a JPG layer -> RGBA PNG.
usage: cutout.py in.jpg out.png [seedx,seedy ...]
Background = near-white regions connected to the border or to a seed point.
Edge pixels get alpha from their distance to white (un-premultiplied)."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
seeds = [tuple(int(v) for v in s.split(',')) for s in sys.argv[3:]]
rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
mn = rgb.min(axis=2)
mx = rgb.max(axis=2)
near_white = (mn >= 243) & ((mx - mn) <= 8)
lab, n = ndi.label(near_white)
keep = set()
h, w = mn.shape
border = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
keep.update(int(v) for v in np.unique(border) if v)
for (x, y) in seeds:
    if lab[y, x]:
        keep.add(int(lab[y, x]))
    else:
        print('seed not near-white:', x, y, rgb[y, x])
bg = np.isin(lab, list(keep))
# close tiny specks inside bg
bg = ndi.binary_closing(bg, iterations=1) | bg
alpha = np.where(bg, 0.0, 1.0)
# soft edge: band of 3px around the background
band = ndi.binary_dilation(bg, iterations=3) & ~bg
a_edge = np.clip((255.0 - mn) / 70.0, 0, 1)
alpha = np.where(band, np.minimum(alpha, a_edge), alpha)
# un-premultiply from white on the band
a3 = np.maximum(alpha, 1e-3)[..., None]
fg = np.clip((rgb - 255.0 * (1 - a3)) / a3, 0, 255)
out = np.where(band[..., None], fg, rgb)
rgba = np.dstack([out, alpha * 255]).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(dst)
ys, xs = np.nonzero(alpha > 0.05)
print(dst, 'bbox', xs.min(), ys.min(), xs.max(), ys.max())
# report leftover pure-white pockets (candidates for extra seeds)
pure = (mn >= 248) & ((mx - mn) <= 5) & ~bg
lb, k = ndi.label(pure)
for i, sl in enumerate(ndi.find_objects(lb), 1):
    area = int((lb[sl] == i).sum())
    if area > 150:
        print('pocket', (sl[1].start + sl[1].stop) // 2, (sl[0].start + sl[0].stop) // 2, 'area', area)
