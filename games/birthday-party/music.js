// موسيقى الحفلة: ملفات music/<الاسم>.mp3 (يرفعها صاحب المشروع لاحقاً — مثلاً
// reveal.mp3 للافتتاح و dance.mp3 لوقت الرقص). لو الملف مو موجود تسكت بدون أي خطأ.
// المتصفحات تمنع التشغيل قبل أول لمسة، فلو انرفض التشغيل نعيد المحاولة مع أول لمسة.
export function createMusic(base = 'music/') {
  let cur = null, curName = null, pending = null, vol = 0.75;
  const tracks = new Map();
  function track(name) {
    if (!tracks.has(name)) {
      const a = new Audio(); a.preload = 'auto'; a.src = base + name + '.mp3'; a.volume = vol;
      a.loop = name !== 'reveal';
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
  const unlock = () => { if (pending) { const a = pending; pending = null; tryPlay(a); } };
  addEventListener('pointerdown', unlock, { passive: true });
  addEventListener('keydown', unlock);
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
