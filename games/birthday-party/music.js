// موسيقى الحفلة: ملفات music/<الاسم>.mp3 (مولّدة بـ tools/make-music.mjs، وتقدر تنبدّل بأي ملف بنفس الاسم): lobby.mp3
// للانتظار والتهاني، reveal.mp3 للافتتاح، dance.mp3 للرقص، cake.mp3 لقص الكيكة ورقصها، outro.mp3 لمشهد النهاية (آخر 30ث). لو الملف مو موجود تسكت بدون أي خطأ.
// المتصفحات تمنع التشغيل قبل أول لمسة، فلو انرفض التشغيل نعيد المحاولة مع أول لمسة.
// أغنية الافتتاح (reveal) تبدأ مع العد التنازلي وتكمل لين آخرها: أي مقطع يُطلب وهي شغالة (الرقص مثلاً)
// ينتظر لين تخلص، إلا الكيكة والإيقاف.
// مقاطع تشتغل مرة وحدة (المشهد ينتهي مع نهايتها): الافتتاح، أغنية التجمّع حول الكيكة، أغنية القص، النهاية
const ONCE = new Set(['reveal', 'outro', 'cakesong', 'cutsong']);
export function createMusic(base = 'music/') {
  let cur = null, curName = null, pending = null, next = null, vol = 0.75;
  const tracks = new Map();
  function track(name) {
    if (!tracks.has(name)) {
      const a = new Audio(); a.preload = 'auto'; a.src = base + name + '.mp3'; a.volume = vol;
      a.loop = !ONCE.has(name); // cake تتكرر طول رقص الكيكة (5 دقايق)، والافتتاح والنهاية مرة وحدة
      a.onerror = () => { a.broken = true; if (a === cur) finish(a); };
      a.onended = () => finish(a);
      tracks.set(name, a);
    }
    return tracks.get(name);
  }
  // خلصت (أو ما تشتغل): نكمل بالمقطع اللي كان ينتظر
  function finish(a) {
    if (a !== cur || !next) return;
    const n = next; next = null; cur = null; curName = null; api.play(n);
  }
  // البداية من نص الأغنية (اللي يدخل متأخر): لو البداية بعد نهايتها، كأنها خلصت
  function seek(a, from) {
    const go = () => { if (from >= a.duration - .2) { a.pause(); finish(a); return; } try { a.currentTime = from; } catch (e) { /* */ } };
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
  }
  const holding = () => curName === 'reveal' && cur && !cur.ended && !cur.broken && (!cur.paused || pending === cur);
  function tryPlay(a) {
    if (!a || a.broken) return;
    const p = a.play();
    if (p && p.catch) p.catch(() => { pending = a; });
  }
  // أول لمسة: نجهّز كل المقاطع (iOS يحتاج كل عنصر صوت يتفعّل بلمسة)، ونشغّل اللي كان منتظر
  let primed = false;
  const unlock = () => {
    if (!primed) {
      primed = true;
      ['lobby', 'reveal', 'dance', 'outro', 'cakesong', 'cutsong'].forEach(n => { const a = track(n); if (a === cur || a.broken) return; a.muted = true; const p = a.play(); if (p && p.then) p.then(() => { a.pause(); a.muted = false; a.currentTime = 0; }).catch(() => { a.muted = false; }); });
    }
    if (pending) { const a = pending; pending = null; tryPlay(a); }
  };
  // capture: عصا التحكم توقف انتشار الحدث، فنسمعه قبلها
  addEventListener('pointerdown', unlock, { passive: true, capture: true });
  addEventListener('keydown', unlock, { capture: true });
  const api = {
    play(name, { from = 0 } = {}) {
      if (!ONCE.has(name) && holding()) { next = name; return; }
      if (curName === name && cur && (!cur.paused || pending === cur)) return;
      const a = track(name);
      if (from > 0 && isFinite(a.duration) && from >= a.duration - .2) return; // خلصت من زمان
      if (cur) cur.pause();
      if (pending && pending !== a) pending = null;
      cur = a; curName = name;
      if (from > 0 && isFinite(from)) seek(cur, from);
      tryPlay(cur);
    },
    stop() { if (cur) cur.pause(); cur = null; curName = null; pending = null; next = null; },
    get current() { return cur && !cur.paused ? curName : null; }, // للاختبار
    get time() { return cur ? cur.currentTime : 0; },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); tracks.forEach(a => { a.volume = vol; }); },
  };
  return api;
}
