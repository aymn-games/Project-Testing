// موسيقى الحفلة: ملفات music/<الاسم>.mp3 (مولّدة بـ tools/make-music.mjs، وتقدر تنبدّل بأي ملف بنفس الاسم): lobby.mp3
// للانتظار والتهاني، reveal.mp3 للافتتاح، dance.mp3 للرقص، cakesong.mp3 للتجمّع حول الكيكة، cutsong.mp3 للقص ورقص الكيكة، slowsong.mp3 لأول الرقص الحر (إضاءة خافتة)، outro.mp3 لمشهد النهاية (آخر 30ث). لو الملف مو موجود تسكت بدون أي خطأ.
// المتصفحات تمنع التشغيل قبل أول لمسة، فلو انرفض التشغيل نعيد المحاولة مع أول لمسة.
// أغنية الافتتاح (reveal) تبدأ مع العد التنازلي وتكمل لين آخرها: أي مقطع يُطلب وهي شغالة (الرقص مثلاً)
// ينتظر لين تخلص، إلا الكيكة والإيقاف.
// قاعدة ثابتة: مقطع واحد بس يشتغل بأي لحظة، وهو مقطع المشهد الحالي. أي عنصر صوت ثاني يبدأ يشتغل (سباق تحميل،
// رجوع للصفحة، المتصفح يكمل صوت قديم) يتوقف على طول، والمقاطع اللي تشتغل مرة وحدة تلحق وقت المشهد (لو بعدت أكثر
// من 1.5ث عنه ترجع لمكانها). لما الصفحة تختفي (خروج، تطبيق ثاني، قفل الجوال) الصوت يوقف، ويرجع مع وقت المشهد.
// مقاطع تشتغل مرة وحدة (المشهد ينتهي مع نهايتها): الافتتاح، أغنية التجمّع حول الكيكة، أغنية القص، النهاية
const ONCE = new Set(['reveal', 'outro', 'cakesong', 'cutsong', 'slowsong']);
export function createMusic(base = 'music/') {
  let cur = null, curName = null, pending = null, next = null, vol = 0.75;
  // وقت المشهد للمقطع الحالي (المقاطع اللي مرة وحدة): المكان المفروض = (الحين - anchor). لو تأخر التشغيل (المتصفح
  // ينتظر لمسة، أو الصفحة كانت مخفية) يبدأ من مكان المشهد الحين، مو من المكان اللي وقف فيه
  let anchor = null;
  const tracks = new Map();
  function track(name) {
    if (!tracks.has(name)) {
      const a = new Audio(); a.preload = 'auto'; a.src = base + name + '.mp3'; a.volume = vol;
      a.loop = !ONCE.has(name); // cake تتكرر طول رقص الكيكة (5 دقايق)، والافتتاح والنهاية مرة وحدة
      a.onerror = () => { a.broken = true; if (a === cur) finish(a); };
      a.onended = () => finish(a);
      // حارس: ما يشتغل غير مقطع المشهد (التجهيز الصامت بأول لمسة مستثنى لأنه مكتوم)
      a.addEventListener('play', () => { if ((a !== cur || hidden()) && !a.muted) a.pause(); });
      a.addEventListener('playing', () => {
        if (a !== cur || anchor == null || a.muted) return;
        const want = (performance.now() - anchor) / 1000;
        if (isFinite(a.duration) && want >= a.duration - .2) { a.pause(); finish(a); return; }
        if (Math.abs(a.currentTime - want) > .75) { try { a.currentTime = want; } catch (e) { /* */ } }
      });
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
  const hidden = () => document.visibilityState === 'hidden';
  // يوقف كل المقاطع إلا keep (حتى لو ما كانت cur — احتياط ضد أي صوت شغال من قبل)
  function pauseOthers(keep) { tracks.forEach(t => { if (t !== keep && !t.paused && !t.muted) t.pause(); }); }
  const holding = () => curName === 'reveal' && cur && !cur.ended && !cur.broken && (!cur.paused || pending === cur);
  function tryPlay(a) {
    if (!a || a.broken) return;
    if (hidden()) { pending = a; return; } // الصفحة مخفية: يبدأ لما ترجع
    const p = a.play();
    if (p && p.catch) p.catch(() => { pending = a; });
  }
  // أول لمسة: نجهّز كل المقاطع (iOS يحتاج كل عنصر صوت يتفعّل بلمسة)، ونشغّل اللي كان منتظر
  let primed = false;
  const unlock = () => {
    if (!primed) {
      primed = true;
      // بعد التجهيز: لو صار المقطع هو مقطع المشهد بالنص، يكمل (بس نرجع صوته) — غير كذا يتوقف ويرجع لأوله
      const done = a => { if (a !== cur) { a.pause(); a.currentTime = 0; } a.muted = false; if (a === cur && a.paused && !hidden()) tryPlay(a); };
      ['lobby', 'reveal', 'dance', 'outro', 'cakesong', 'cutsong', 'slowsong'].forEach(n => { const a = track(n); if (a === cur || a.broken) return; a.muted = true; const p = a.play(); if (p && p.then) p.then(() => done(a)).catch(() => { a.muted = false; }); else done(a); });
    }
    if (pending && !hidden()) { const a = pending; pending = null; if (a === cur) tryPlay(a); }
  };
  // capture: عصا التحكم توقف انتشار الحدث، فنسمعه قبلها
  addEventListener('pointerdown', unlock, { passive: true, capture: true });
  addEventListener('keydown', unlock, { capture: true });
  // الصفحة تختفي ← كل الصوت يوقف (ويتعلّق مقطع المشهد لين ترجع). الرجوع: play.html يعيد تطبيق المشهد بوقته
  document.addEventListener('visibilitychange', () => { if (hidden()) { if (cur && !cur.paused) pending = cur; pauseOthers(null); } });
  addEventListener('pagehide', () => { if (cur && !cur.paused) pending = cur; pauseOthers(null); });
  const api = {
    play(name, { from = 0 } = {}) {
      if (!ONCE.has(name) && holding()) { next = name; return; }
      if (curName === name && cur && (!cur.paused || pending === cur)) {
        // نفس المقطع شغال: المقاطع اللي مرة وحدة تلحق وقت المشهد لو بعدت عنه
        if (ONCE.has(name) && from > 0 && isFinite(from)) { anchor = performance.now() - from * 1000; if (Math.abs(cur.currentTime - from) > 1.5) seek(cur, from); }
        pauseOthers(cur); if (cur.paused) tryPlay(cur); return;
      }
      const a = track(name);
      next = null; anchor = ONCE.has(name) && from > 0 && isFinite(from) ? performance.now() - from * 1000 : ONCE.has(name) ? performance.now() : null;
      // خلصت من زمان: المشهد صار بدون صوت (ما نخلي صوت مشهد قبله يكمل)
      if (from > 0 && isFinite(a.duration) && from >= a.duration - .2) { if (cur) cur.pause(); pauseOthers(null); cur = null; curName = null; pending = null; return; }
      if (cur) cur.pause();
      pauseOthers(a);
      if (pending && pending !== a) pending = null;
      cur = a; curName = name;
      if (from > 0 && isFinite(from)) seek(cur, from);
      tryPlay(cur);
    },
    stop() { if (cur) cur.pause(); pauseOthers(null); cur = null; curName = null; pending = null; next = null; },
    get current() { return cur && !cur.paused ? curName : null; }, // للاختبار
    get time() { return cur ? cur.currentTime : 0; },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); tracks.forEach(a => { a.volume = vol; }); },
  };
  return api;
}
