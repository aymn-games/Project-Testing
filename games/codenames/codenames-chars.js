/**
 * كود نيمز — شخصيات البطاقات بعد الفتح (رسومات أصلية SVG، viewBox 120×120)، بستايل «ستيكر كوميك».
 * تُستخدم بشاشة اللعب (game.html) وبخريطة جوال السباي ماستر (spymaster.html) بنفس الشكل.
 *   الأحمر: العميلة (img 1) · المحقق (img 2)     الأزرق: الهاكر (img 1) · العميلة (img 2)
 *   المحايد: شخص يائس                            الأسود: القاتل بقلنسوة (بطاقة سوداء حقيقية)
 * CN_CHARS.tile(t, img) ترجع ستايل البطاقة المفتوحة: {bg (طبقات CSS + الشخصية كـ data URI), frame, strip, word, num, sh, burst}.
 */
// p: {main, dark, light, skin, line, accent, hairC, outline, sticker}
(function () {
  const wrap = (p, body) => `<svg viewBox="0 0 120 120" overflow="visible"${p.sticker ? ' style="filter:drop-shadow(0 4px 0 rgba(0,0,0,.35))"' : ''}>${p.sticker ? `<g stroke="${p.outline || '#fff'}" stroke-width="7" stroke-linejoin="round" paint-order="stroke">${body.base}</g>` : body.base}${body.top || ''}</svg>`;
  const eye = (x, y, c) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="3" fill="${c}"/><circle cx="${x + .9}" cy="${y - 1}" r=".9" fill="#fff"/>`;

  // ---- الأحمر 1: عميلة بقبعة بيريه وشعر طويل
  const redSpy = p => wrap(p, {
    base: `<path d="M38 60C34 84 36 100 32 112H88C84 100 86 84 82 60Z" fill="${p.hairC || '#3b1a12'}"/>
      <path d="M16 120C18 96 34 84 60 82S102 96 104 120Z" fill="${p.main}"/>
      <path d="M44 84L60 100L76 84L84 90L60 112L36 90Z" fill="${p.dark}"/>
      <rect x="53" y="70" width="14" height="14" rx="5" fill="${p.skin}"/>
      <ellipse cx="60" cy="58" rx="15.5" ry="17.5" fill="${p.skin}"/>
      <path d="M43 60C41 42 50 34 61 34C73 34 80 43 77 60C74 50 70 46 64 45C60 52 51 56 43 60Z" fill="${p.hairC || '#3b1a12'}"/>
      <path d="M38 38C38 30 50 26 62 27C76 28 84 33 82 39C79 43 66 44 56 43C46 42 38 42 38 38Z" fill="${p.dark}"/>`,
    top: `<circle cx="64" cy="26" r="2.6" fill="${p.dark}"/>
      <path d="M48 57q4-3 8 0M64 57q4-3 8 0" stroke="${p.line}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${eye(52, 60, p.line)}${eye(68, 60, p.line)}
      <path d="M47 58l-3-2M73 58l3-2" stroke="${p.line}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M54.5 68.5q5.5 3.5 11 0q-5.5 1.5-11 0Z" fill="${p.accent}"/>
      <circle cx="49" cy="65" r="2.6" fill="${p.accent}" opacity=".25"/><circle cx="71" cy="65" r="2.6" fill="${p.accent}" opacity=".25"/>`
  });

  // ---- الأحمر 2: محقق بشنب وقبعة كاسكيت وياقة مرفوعة
  const redDet = p => wrap(p, {
    base: `<path d="M16 120C18 96 34 84 60 82S102 96 104 120Z" fill="${p.main}"/>
      <path d="M40 74L52 96L60 84L68 96L80 74L84 86L66 110H54L36 86Z" fill="${p.dark}"/>
      <rect x="53" y="70" width="14" height="14" rx="5" fill="${p.skin}"/>
      <ellipse cx="60" cy="58" rx="15.5" ry="17" fill="${p.skin}"/>
      <path d="M42 46C42 34 50 30 61 30C73 30 79 35 79 44L84 47C80 50 52 50 40 48Z" fill="${p.dark}"/>`,
    top: `<path d="M44 44C52 40 70 40 79 44" stroke="${p.light}" stroke-width="2" fill="none" opacity=".6"/>
      <path d="M47 55l8-1.5M65 53.5l8 1.5" stroke="${p.line}" stroke-width="3" stroke-linecap="round"/>
      ${eye(52, 59, p.line)}${eye(68, 59, p.line)}
      <path d="M50 67C54 64 58 65 60 66.5C62 65 66 64 70 67C66 70 62 69 60 68C58 69 54 70 50 67Z" fill="${p.hairC || '#2a160e'}"/>
      <path d="M46 70q14 8 28 0" stroke="${p.line}" stroke-width="1" fill="none" opacity=".25"/>`
  });

  // ---- الأزرق 1: هاكر بهودي وسماعات ونظارة
  const blueHack = p => wrap(p, {
    base: `<path d="M16 120C18 94 34 82 60 82S102 94 104 120Z" fill="${p.main}"/>
      <path d="M38 88C40 80 48 76 60 76S80 80 82 88C76 94 68 96 60 96S44 94 38 88Z" fill="${p.dark}"/>
      <rect x="53" y="70" width="14" height="12" rx="5" fill="${p.skin}"/>
      <ellipse cx="60" cy="57" rx="15.5" ry="17.5" fill="${p.skin}"/>
      <path d="M43 56C42 40 50 33 61 33C72 33 79 40 77 56C75 48 72 44 66 43L62 47L58 43C51 44 46 48 43 56Z" fill="${p.hairC || '#1c2333'}"/>`,
    top: `<path d="M38 88C38 78 46 72 60 72S82 78 82 88" stroke="${p.light}" stroke-width="3.5" fill="none"/>
      <rect x="32" y="82" width="11" height="14" rx="5" fill="${p.light}"/><rect x="77" y="82" width="11" height="14" rx="5" fill="${p.light}"/>
      <rect x="45" y="54" width="13" height="10" rx="3" fill="none" stroke="${p.line}" stroke-width="2.4"/><rect x="62" y="54" width="13" height="10" rx="3" fill="none" stroke="${p.line}" stroke-width="2.4"/>
      <path d="M58 58h4" stroke="${p.line}" stroke-width="2.4"/>
      ${eye(51.5, 59, p.line)}${eye(68.5, 59, p.line)}
      <path d="M55 69q5 2 10-1.5" stroke="${p.line}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M52 98l8 4 8-4" stroke="${p.light}" stroke-width="2" fill="none" opacity=".6"/>`
  });

  // ---- الأزرق 2: عميلة بشعر قصير وسماعة لاسلكية ومشبك نجمة
  const blueAgent = p => wrap(p, {
    base: `<path d="M16 120C18 96 34 84 60 82S102 96 104 120Z" fill="${p.main}"/>
      <path d="M48 80h24v10c0 4-5 7-12 7s-12-3-12-7Z" fill="${p.dark}"/>
      <rect x="53" y="70" width="14" height="12" rx="5" fill="${p.skin}"/>
      <ellipse cx="60" cy="58" rx="15.5" ry="17.5" fill="${p.skin}"/>
      <path d="M41 70C37 50 44 34 60 34S83 50 79 70C77 62 76 54 72 50C64 54 52 52 46 46C44 52 43 62 41 70Z" fill="${p.hairC || '#0f1a3a'}"/>`,
    top: `<path d="M71 40l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" fill="${p.accent}"/>
      <path d="M77 60c4 0 6 3 5 7" stroke="${p.light}" stroke-width="2.4" fill="none"/><path d="M82 67l-10 6" stroke="${p.light}" stroke-width="2" stroke-linecap="round"/><circle cx="71" cy="73.5" r="2.2" fill="${p.light}"/>
      <path d="M47 55q4.5-2.5 9 0M64 55q4.5-2.5 9 0" stroke="${p.line}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${eye(52, 60, p.line)}${eye(68, 60, p.line)}
      <path d="M55 68q5 3.5 10 0" stroke="${p.line}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  });

  // ---- المحايد: شخص يائس — يده على جبهته، حواجب حزينة، عرق، وغيمة ممطرة
  const despair = p => wrap(p, {
    base: `<path d="M14 120C16 100 32 90 60 88S104 100 106 120Z" fill="${p.main}"/>
      <rect x="53" y="74" width="14" height="14" rx="5" fill="${p.skin}"/>
      <ellipse cx="60" cy="62" rx="15.5" ry="17" fill="${p.skin}"/>
      <path d="M44 62C42 46 50 40 60 40C71 40 78 47 76 62C73 54 66 51 58 52C52 53 47 57 44 62Z" fill="${p.hairC || '#4a3a2a'}"/>
      <path d="M88 120C90 104 90 92 84 84" stroke="${p.dark}" stroke-width="17" fill="none" stroke-linecap="round"/>
      <path d="M85 86C82 74 76 62 66 52" stroke="${p.skin}" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M44 50C46 42 56 40 64 42C70 44 72 50 68 54C62 57 50 57 46 55C44 54 43 52 44 50Z" fill="${p.skin}"/>`,
    top: `<path d="M50 47l6 6M56 45l5 7M62 44l4 7" stroke="${p.dark}" stroke-width="1.3" stroke-linecap="round" opacity=".35"/>
      <path d="M48 66.5l7 -3M72 66.5l-7 -3" stroke="${p.line}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M50 69q2.6 2 5 0M65 69q2.6 2 5 0" stroke="${p.line}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M54 78q6-4 12 0" stroke="${p.line}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M40 64c-2 3-3 5-3 7a3 3 0 0 0 6 0c0-2-1-4-3-7Z" fill="#7cc4f2"/>
      <g transform="translate(86 24)"><path d="M-14 6a7 7 0 0 1 4-12a9 9 0 0 1 17 1a6 6 0 0 1 3 11Z" fill="${p.cloud || '#9aa0ab'}"/>
      <path d="M-8 10l-2 6M0 10l-2 6M8 10l-2 6" stroke="#7cc4f2" stroke-width="2.2" stroke-linecap="round"/></g>`
  });

  // ---- الأسود: القاتل — عباءة بقلنسوة، وجه ظلام وعيون بيضاء مضيئة
  const assassin = p => `<svg viewBox="0 0 120 120" overflow="visible">
      <defs><filter id="glow${p.id || ''}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path d="M10 120C14 96 26 84 40 78C34 70 32 60 34 48C36 30 46 18 60 16C74 18 84 30 86 48C88 60 86 70 80 78C94 84 106 96 110 120Z" fill="${p.cloak}" stroke="${p.rim}" stroke-width="1.6"/>
      <path d="M60 16C74 18 84 30 86 48C88 60 86 70 80 78L74 76C78 66 78 54 74 44C70 34 64 28 60 26C56 28 50 34 46 44C42 54 42 66 46 76L40 78C34 70 32 60 34 48C36 30 46 18 60 16Z" fill="${p.fold}"/>
      <path d="M60 26C66 30 72 38 74 48C76 60 72 72 64 78H56C48 72 44 60 46 48C48 38 54 30 60 26Z" fill="#000"/>
      <path d="M40 78L60 104L80 78L76 120H44Z" fill="${p.fold}" opacity=".7"/>
      <g filter="url(#glow${p.id || ''})" fill="${p.eye}"><path d="M48 53l11 3.5-1.2 3.5-9-2.4Z"/><path d="M72 53l-11 3.5 1.2 3.5 9-2.4Z"/></g>
      <path d="M52 68q8 5 16 0" stroke="${p.eye}" stroke-width="1.4" fill="none" opacity=".35" stroke-dasharray="2 2"/>
      <path d="M56 104h8l-4 10Z" fill="${p.rim}" opacity=".5"/>
    </svg>`;

  // ---- ستايل «ستيكر كوميك»: زجاج غامق بأشعة ونقاط + الشخصية ملصق بحدود غامقة شوي + شريط بلون الفريق
  var TEAM = { 1: { c: '#ef4444', c2: '#fca5a5', dk: '#b91c1c', xd: '#7f1d1d', hair: '#3b1a12', accent: '#dc2626' },
               2: { c: '#3b82f6', c2: '#93c5fd', dk: '#1d4ed8', xd: '#1e3a8a', hair: '#0f1a3a', accent: '#fde047' } };
  var SKIN = '#f6d2b8', LINE = '#3a2018', OUTLINE = '#5b5368';
  var rays = function (col) { return 'repeating-conic-gradient(from 0deg at 50% 40%, ' + col + ' 0 5deg, transparent 5deg 12deg)'; };
  var dots = function (col) { return 'radial-gradient(' + col + ' 1.5px, transparent 1.7px) 0 0/9px 9px'; };
  // بالبطاقة نقص الرسمة على الراس والكتفين (viewBox) عشان تطلع كاملة فوق شريط الكلمة
  var svgUrl = function (svg) { return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"' + svg.slice(4).replace('viewBox="0 0 120 120"', 'viewBox="6 10 108 84"')) + '")'; };
  var ART = 'center 9%/auto 63% no-repeat';
  var cache = {};
  function tile(t, img) {
    var k = t + '|' + (img === 2 ? 2 : 1);
    if (cache[k]) return cache[k];
    var r;
    if (t === 1 || t === 2) {
      var X = TEAM[t], p = { main: X.c, dark: X.xd, light: X.c2, skin: SKIN, line: LINE, accent: X.accent, hairC: X.hair, outline: OUTLINE, sticker: true };
      var art = t === 1 ? (img === 2 ? redDet(p) : redSpy(p)) : (img === 2 ? blueAgent(p) : blueHack(p));
      r = { bg: svgUrl(art) + ' ' + ART + ', radial-gradient(ellipse at 50% 40%, ' + X.c + '66, transparent 60%), ' + rays(X.c + '33') + ', ' + dots('rgba(255,255,255,.08)') + ', #14111c',
            frame: X.c + '80', strip: 'linear-gradient(180deg, ' + X.c + ', ' + X.dk + ')', word: '#fff', num: X.dk, sh: '0 5px 0 #000, 0 0 20px ' + X.c + '44', burst: X.c2 };
    } else if (t === 0) {
      r = { bg: svgUrl(despair({ main: '#9aa3b2', dark: '#5b6372', skin: SKIN, line: LINE, hairC: '#4a3a2a', cloud: '#8b93a1', outline: OUTLINE, sticker: true })) + ' ' + ART +
              ', radial-gradient(ellipse at 50% 40%, #f7f3ea, transparent 62%), ' + rays('rgba(140,140,150,.16)') + ', ' + dots('rgba(90,90,100,.14)') + ', #ece6da',
            frame: 'rgba(255,255,255,.8)', strip: 'linear-gradient(180deg, #c9ced8, #a7afbd)', word: '#2f3542', num: '#5b6372', sh: '0 5px 0 #a7a093, 0 12px 24px rgba(0,0,0,.25)', burst: '#e5e7eb' };
    } else {
      r = { bg: svgUrl(assassin({ cloak: '#0d0d10', fold: '#1b1b20', rim: 'rgba(255,255,255,.35)', eye: '#ffffff', id: 'a' })) + ' ' + ART +
              ', ' + rays('rgba(255,255,255,.028)') + ', ' + dots('rgba(255,255,255,.04)') + ', #000',
            frame: 'rgba(255,255,255,.14)', strip: '#000', word: '#fff', num: '#000', sh: '0 5px 0 #000, 0 12px 24px rgba(0,0,0,.7)', burst: '#ffffff' };
    }
    cache[k] = r;
    return r;
  }

  window.CN_CHARS = { redSpy: redSpy, redDet: redDet, blueHack: blueHack, blueAgent: blueAgent, despair: despair, assassin: assassin, tile: tile };
}());
