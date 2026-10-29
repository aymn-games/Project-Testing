// موسيقى الحفلة: ملفات music/<الاسم>.mp3 (مولّدة بـ tools/make-music.mjs، وتقدر تنبدّل بأي ملف بنفس الاسم): lobby.mp3
// للانتظار والتهاني، reveal.mp3 للافتتاح، dance.mp3 للرقص، cake.mp3 لقص الكيكة ورقصها. لو الملف مو موجود تسكت بدون أي خطأ.
// المتصفحات تمنع التشغيل قبل أول لمسة، فلو انرفض التشغيل نعيد المحاولة مع أول لمسة.
export function createMusic(base = 'music/') {
  let cur = null, curName = null, pending = null, vol = 0.75;
  const tracks = new Map();
  function track(name) {
    if (!tracks.has(name)) {
      const a = new Audio(); a.preload = 'auto'; a.src = base + name + '.mp3'; a.volume = vol;
      a.loop = name !== 'reveal'; // cake تتكرر طول رقص الكيكة (5 دقايق)
      a.onerror = () => { a.broken = true; };
      tracks.set(name, a);
    }
    return tracks.get(name);
  }
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
      ['lobby', 'reveal', 'dance', 'cake'].forEach(n => { const a = track(n); if (a === cur || a.broken) return; a.muted = true; const p = a.play(); if (p && p.then) p.then(() => { a.pause(); a.muted = false; a.currentTime = 0; }).catch(() => { a.muted = false; }); });
    }
    if (pending) { const a = pending; pending = null; tryPlay(a); }
  };
  // capture: عصا التحكم توقف انتشار الحدث، فنسمعه قبلها
  addEventListener('pointerdown', unlock, { passive: true, capture: true });
  addEventListener('keydown', unlock, { capture: true });
  return {
    play(name, { from = 0 } = {}) {
      if (curName === name && cur && !cur.paused) return;
      if (cur) cur.pause();
      cur = track(name); curName = name;
      try { if (from > 0 && isFinite(from)) cur.currentTime = from; } catch (e) { /* قبل التحميل */ }
      tryPlay(cur);
    },
    stop() { if (cur) cur.pause(); cur = null; curName = null; pending = null; },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); tracks.forEach(a => { a.volume = vol; }); },
  };
}
