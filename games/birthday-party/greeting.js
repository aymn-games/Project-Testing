// بطاقة التهنئة بمشهد النهاية (play.html): التاريخ ثم التهنئة بالعربي ثم الإنجليزي، تنكتب حرف حرف
// مثل الكتابة على لوحة مفاتيح مع صوت نقر خفيف، وتبقى ثابتة لين آخر المشهد، وتتلاشى مع نهايته.
//
// الوقت كله محسوب من ساعة السيرفر (بداية المشهد phase.at ونهايته phase.until)، فكل الأجهزة تكتب نفس
// الحرف بنفس اللحظة، واللي يدخل متأخر يشوف اللي انكتب لين الحين. run() ينعاد بأمان، وstop() ينظّف.
//
// التوقيت (ms من بداية المشهد): تبدأ عند START، والكتابة كلها 15ث:
//   التاريخ 0 ← 2.54ث · وقفة لين 3.18ث · العربي لين 8.9ث · الإنجليزي لين 15ث · ثابتة · تلاشي آخر 1.2ث
const START = 2000, FADE_IN = 700, FADE_OUT = 1200;
const PLAN = [
  { k: 'dateAr', t0: 0, t1: 1150 }, { k: 'dateEn', t0: 1150, t1: 2540 },
  { k: 'ar', t0: 3180, t1: 8900 }, { k: 'en', t0: 8900, t1: 15000 },
];
export const GREETING = {
  dateAr: '٣ نوفمبر', dateEn: 'November 3',
  ar: 'كل عام وحسنك الباهي يزيد\nعسى عامك سعيد\nوأيامك هنيّة',
  en: 'May your beauty and radiance grow with every year\nMay your year be filled with happiness\nAnd your days be ever so sweet',
};

// ---- صوت النقر: نبضة ضجيج قصيرة مفلترة، بتنويع بسيط بالطبقة والقوة (ما يشتغل قبل أول لمسة) ----
let actx = null, noise = null;
function unlock() {
  try {
    if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; actx = new C(); }
    if (actx.state === 'suspended') actx.resume();
    if (!noise) { const n = Math.floor(actx.sampleRate * .03); noise = actx.createBuffer(1, n, actx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  } catch (e) { /* صوت غير مدعوم */ }
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, { capture: true, passive: true }));
function click(soft) {
  if (!actx || actx.state !== 'running' || !noise) return;
  try {
    const t = actx.currentTime + Math.random() * .012, src = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = noise; src.playbackRate.value = .85 + Math.random() * .35;
    bp.type = 'bandpass'; bp.frequency.value = (soft ? 1400 : 2600) + Math.random() * 1600; bp.Q.value = 1.4 + Math.random();
    const v = (soft ? .025 : .045) * (.7 + Math.random() * .3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .002); g.gain.exponentialRampToValueAtTime(.0005, t + .045);
    src.connect(bp).connect(g).connect(actx.destination); src.start(t); src.stop(t + .06);
  } catch (e) { /* */ }
}

export function createGreeting(root) {
  // كل سطر: نص كامل مخفي يحجز مكانه (ما يتحرك التوسيط وهو ينكتب)، وفوقه المكتوب لين الحين
  const segs = PLAN.map(p => {
    const el = root.querySelector('[data-seg="' + p.k + '"]'), chars = Array.from(GREETING[p.k]);
    el.textContent = ''; const full = document.createElement('span'), typed = document.createElement('span');
    full.className = 'g-full'; full.textContent = GREETING[p.k]; full.setAttribute('aria-hidden', 'true'); typed.className = 'g-typed';
    el.append(full, typed); return Object.assign({ el, typed, chars, shown: -1 }, p);
  });
  let raf = 0, at = 0, until = 0, nowFn = null;
  function frame() {
    raf = 0;
    const now = nowFn(), e = now - at - START;
    if (until && now >= until) { stop(); return; }
    let active = null, clicked = false;
    for (const s of segs) {
      const n = Math.max(0, Math.min(s.chars.length, Math.floor((e - s.t0) / (s.t1 - s.t0) * s.chars.length)));
      if (n !== s.shown) {
        // صوت للحرف الجديد (حرف وحد بالإطار حتى لو الجهاز بطيء وطلع أكثر من حرف)
        if (s.shown >= 0 && n > s.shown && !clicked) { const c = s.chars[n - 1]; if (c !== '\n') { click(c === ' '); clicked = true; } }
        s.shown = n; s.typed.textContent = s.chars.slice(0, n).join('');
      }
      if (e >= s.t0 && e < s.t1) active = s;
    }
    for (const s of segs) s.el.classList.toggle('typing', s === active);
    const fin = Math.max(0, Math.min(1, e / FADE_IN)), fout = until ? Math.max(0, Math.min(1, (until - now) / FADE_OUT)) : 1;
    root.style.opacity = String(Math.min(fin, fout));
    root.classList.toggle('hidden', e < 0);
    raf = requestAnimationFrame(frame);
  }
  // at/untilMs: بداية ونهاية المشهد بساعة السيرفر، nowF: serverNow
  function run(atMs, untilMs, nowF) {
    if (raf && at === atMs && until === untilMs) return;
    stop(); at = atMs; until = untilMs || 0; nowFn = nowF;
    frame();
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    root.classList.add('hidden'); root.style.opacity = '0';
    for (const s of segs) { s.shown = -1; s.typed.textContent = ''; s.el.classList.remove('typing'); }
  }
  return { run, stop, get running() { return !!raf; } };
}
