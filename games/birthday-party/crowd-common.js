// المشترك بين نوعي الشخصيات (الكلاسيكي crowd3d.js والهيكل العظمي crowd-rig.js):
// الألوان وأسماء الخيارات، والشكل الافتراضي المشتق من رقم اللاعب.
// الشكل look = [st, o, s, h, hs, acc, fx, hat] بنفس الترتيب والحدود اللي يفرضها السيرفر (LOOK_MAX).

export const SKIN = ['#f9d7c3', '#f1c3a5', '#e0a882', '#c98d66', '#9c6a4a'];
export const HAIR = ['#3b2418', '#5a3622', '#8a5a35', '#c99a5b', '#1f1a1d', '#7a3b52', '#e8cf9a', '#a8432f'];
export const OUTFIT = ['#f4a3c0', '#cdb6ef', '#a9dcc8', '#f7c59f', '#9fc6f0', '#f6d3e2', '#e98bb0', '#d9b8e8', '#ffd6a5', '#b5e2f0', '#8e6cc9', '#c94f7e'];

// أسماء الخيارات للوحة التعديل
export const LOOK = {
  styles: ['فستان', 'بنطلون وقميص'],
  outfits: OUTFIT, skins: SKIN, hairs: HAIR,
  hairStyles: ['قصير', 'طويل', 'كعكة', 'ذيلين', 'كيرلي قصير', 'كيرلي طويل'],
  accs: ['بدون', 'فيونكة', 'تاج صغير', 'وردة', 'نظارة', 'قبعة حفلة'],
  fxs: ['بدون', 'قلوب', 'شرار', 'هالة'],
  hats: ['بدون', 'منقّطة', 'مخطّطة', 'ذهبية لامعة', 'وردية بشراشيب'],
};

export const hash = n => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return h ^ (h >>> 16); };

// الشكل الفعلي: -1 (أو ما فيه شكل) ← الافتراضي المشتق من n. صاحبة الحفلة st = 0 دايماً (فستانها الفخم)
// القبعة الافتراضية «بدون» — اللاعب يختارها من ركن التعديل
export function resolveLook(n, role, look) {
  const h = hash(n), L = Array.isArray(look) ? look : [], pick = (i, def) => (Number.isInteger(L[i]) && L[i] >= 0 ? L[i] : def);
  return {
    st: role === 'girl' ? 0 : pick(0, 0), o: pick(1, role === 'girl' ? -1 : h % OUTFIT.length), s: pick(2, (h >>> 8) % SKIN.length),
    h: pick(3, (h >>> 12) % 6), hs: pick(4, role === 'girl' ? 1 : (h >>> 18) % 3), acc: pick(5, 0), fx: pick(6, 0), hat: pick(7, 0),
  };
}
