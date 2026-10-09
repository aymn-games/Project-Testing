// تأثيرات الرئيسية ومكتبة الألعاب: تدرّج ألوان العناوين (أخضر -> أبيض)
// + ألعاب نارية خضراء في الخلفية. يُحمَّل من index.html و games.html فقط.
(function () {
  // ---------- (1) تدرّج ألوان النصوص (العناوين) ----------
  var css = document.createElement('style');
  css.id = 'agp-home-fx-style';
  css.textContent =
    'h1, h1 span, h2, h3.title {' +
    '  background: linear-gradient(100deg, #ffffff 0%, #d9fbe8 35%, #6fe0a6 70%, #1fae6a 100%) !important;' +
    '  -webkit-background-clip: text !important; background-clip: text !important;' +
    '  -webkit-text-fill-color: transparent !important; color: transparent !important;' +
    '}' +
    '#agp-fireworks { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; mix-blend-mode: screen; }';
  // الصفحة تُعاد بناؤها بالكامل بواسطة الـbundler بعد التحميل (يستبدل
  // documentElement)، فنعيد إلحاق الستايل والكانفس كلما اختفيا.
  function ensureStyle() {
    if (!document.getElementById('agp-home-fx-style')) (document.head || document.documentElement).appendChild(css);
  }
  ensureStyle();
  setInterval(ensureStyle, 500);

  // ---------- (2) ألعاب نارية خضراء ----------
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'agp-fireworks';
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var rockets = [], sparks = [];
  var COLORS = ['#1fae6a', '#2fd17f', '#6fe0a6', '#b8f5d3', '#ffffff'];

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function launch() {
    rockets.push({
      x: W * (0.12 + Math.random() * 0.76),
      y: H,
      vy: -(H * 0.012 + Math.random() * H * 0.004),
      targetY: H * (0.12 + Math.random() * 0.35)
    });
  }

  function explode(x, y) {
    var n = 60 + Math.floor(Math.random() * 30);
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n;
      var sp = 1.2 + Math.random() * 2.8;
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, decay: 0.010 + Math.random() * 0.012,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  }

  var lastLaunch = 0;
  function frame(t) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    if (!document.hidden && t - lastLaunch > 900 + Math.random() * 900) {
      launch(); lastLaunch = t;
    }

    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.y += r.vy;
      ctx.fillStyle = '#b8f5d3';
      ctx.beginPath(); ctx.arc(r.x, r.y, 2, 0, Math.PI * 2); ctx.fill();
      if (r.y <= r.targetY) { explode(r.x, r.y); rockets.splice(i, 1); }
    }

    for (var j = sparks.length - 1; j >= 0; j--) {
      var s = sparks[j];
      s.vx *= 0.985; s.vy = s.vy * 0.985 + 0.035;
      s.x += s.vx; s.y += s.vy;
      s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(j, 1); continue; }
      ctx.globalAlpha = s.life * 0.85;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  function ensureCanvas() {
    if (document.body && !document.getElementById('agp-fireworks')) document.body.appendChild(canvas);
  }
  ensureCanvas();
  setInterval(ensureCanvas, 500);
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
