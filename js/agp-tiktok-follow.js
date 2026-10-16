/**
 * بطاقة "تابع حساب المنصة على تيك توك" — مشتركة بين الرئيسية ومكتبة ألعاب
 * التيك توك ومكتبة ألعاب الدسكورد. لتغيير الحساب: عدّل HANDLE فقط.
 *
 * الاستخدام:
 *   AGPTikTokFollow.insertAfter(element)   // يضيف البطاقة بعد عنصر
 *   AGPTikTokFollow.insertBefore(element)  // يضيفها قبل عنصر
 *   (خيار ثاني {flush:true}: بعرض الحاوية كاملة بدون هوامش جانبية)
 * كل صفحة تستدعيها مرة وحدة بس (البطاقة ما تتكرر لو انستدعت مرتين).
 */
(function () {
  'use strict';

  var HANDLE = 'aymngame';
  var URL = 'https://www.tiktok.com/@' + HANDLE;

  // شعار تيك توك (Simple Icons) بالألوان الرسمية — طبقتين ملونتين + أبيض.
  var LOGO_PATH = 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';
  var LOGO_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="' + LOGO_PATH + '" fill="#25F4EE" transform="translate(-0.9,-0.6)"/>' +
      '<path d="' + LOGO_PATH + '" fill="#FE2C55" transform="translate(0.9,0.6)"/>' +
      '<path d="' + LOGO_PATH + '" fill="#fff"/>' +
    '</svg>';

  var CSS =
    '.agp-ttf{direction:rtl;box-sizing:border-box;width:100%;max-width:1100px;margin:32px auto;padding:0 16px;font-family:inherit}' +
    '.agp-ttf *{box-sizing:border-box}' +
    '.agp-ttf.agp-ttf-flush{max-width:none;padding:0;margin:44px 0 0}' +
    '.agp-ttf-card{position:relative;overflow:hidden;display:flex;align-items:center;gap:20px;padding:22px 26px;border-radius:24px;' +
      'background:linear-gradient(120deg,rgba(37,244,238,.10),rgba(18,14,28,.92) 38%,rgba(18,14,28,.92) 62%,rgba(254,44,85,.13));' +
      'border:1px solid rgba(255,255,255,.10);box-shadow:0 24px 60px -30px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06);color:#f4f2fb}' +
    '.agp-ttf-card::before{content:"";position:absolute;inset:-40% auto auto -10%;width:260px;height:260px;border-radius:50%;' +
      'background:radial-gradient(circle,rgba(254,44,85,.22),transparent 65%);pointer-events:none}' +
    '.agp-ttf-card::after{content:"";position:absolute;inset:auto -8% -50% auto;width:260px;height:260px;border-radius:50%;' +
      'background:radial-gradient(circle,rgba(37,244,238,.18),transparent 65%);pointer-events:none}' +
    '.agp-ttf-logo{position:relative;z-index:1;flex:0 0 auto;width:64px;height:64px;border-radius:18px;display:grid;place-items:center;' +
      'background:#000;border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px -10px rgba(254,44,85,.55)}' +
    '.agp-ttf-logo svg{width:34px;height:34px}' +
    '.agp-ttf-text{position:relative;z-index:1;flex:1 1 auto;min-width:0;text-align:right}' +
    '.agp-ttf-kicker{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#b9b2c8;margin-bottom:4px}' +
    '.agp-ttf-kicker i{width:7px;height:7px;border-radius:50%;background:#FE2C55;box-shadow:0 0 0 3px rgba(254,44,85,.2)}' +
    '.agp-ttf-title{margin:0;font-size:clamp(17px,2.2vw,21px);font-weight:700;line-height:1.5}' +
    '.agp-ttf-handle{display:inline-block;margin-top:2px;font-size:14px;font-weight:600;color:#7cf6f2;direction:ltr}' +
    '.agp-ttf-sub{margin:4px 0 0;font-size:13px;line-height:1.7;color:#968ea4}' +
    '.agp-ttf-btn{position:relative;z-index:1;flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;' +
      'font-size:15px;font-weight:700;color:#fff !important;text-decoration:none !important;white-space:nowrap;' +
      'background:linear-gradient(135deg,#FE2C55,#ff5a7a);box-shadow:0 12px 28px -12px rgba(254,44,85,.8);transition:transform .15s,box-shadow .15s}' +
    '.agp-ttf-btn:hover{transform:translateY(-2px);box-shadow:0 16px 32px -12px rgba(254,44,85,.95)}' +
    '.agp-ttf-btn svg{width:18px;height:18px}' +
    '@media (max-width:640px){' +
      '.agp-ttf-card{flex-wrap:wrap;gap:14px;padding:18px}' +
      '.agp-ttf-logo{width:52px;height:52px;border-radius:15px}' +
      '.agp-ttf-logo svg{width:28px;height:28px}' +
      '.agp-ttf-text{flex:1 1 calc(100% - 70px)}' +
      '.agp-ttf-btn{width:100%;justify-content:center}' +
    '}';

  function ensureStyles() {
    if (document.getElementById('agp-ttf-styles')) return;
    var st = document.createElement('style');
    st.id = 'agp-ttf-styles';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.className = 'agp-ttf';
    wrap.setAttribute('data-agp-tiktok-follow', '1');
    wrap.innerHTML =
      '<div class="agp-ttf-card">' +
        '<a class="agp-ttf-logo" href="' + URL + '" target="_blank" rel="noopener" aria-label="حساب المنصة على تيك توك">' + LOGO_SVG + '</a>' +
        '<div class="agp-ttf-text">' +
          '<div class="agp-ttf-kicker"><i></i>الحساب الرسمي للمنصة</div>' +
          '<h3 class="agp-ttf-title">تابعنا على تيك توك</h3>' +
          '<a class="agp-ttf-handle" href="' + URL + '" target="_blank" rel="noopener">@' + HANDLE + '</a>' +
          '<p class="agp-ttf-sub">أول من يعرف بالألعاب الجديدة والتحديثات والبثوث.</p>' +
        '</div>' +
        '<a class="agp-ttf-btn" href="' + URL + '" target="_blank" rel="noopener">' + LOGO_SVG + 'تابع الحساب</a>' +
      '</div>';
    return wrap;
  }

  function insert(el, before, opts) {
    if (!el || !el.parentNode || document.querySelector('[data-agp-tiktok-follow]')) return null;
    ensureStyles();
    var card = build();
    if (opts && opts.flush) card.classList.add('agp-ttf-flush');
    el.parentNode.insertBefore(card, before ? el : el.nextSibling);
    return card;
  }

  window.AGPTikTokFollow = {
    HANDLE: HANDLE,
    URL: URL,
    insertAfter: function (el, opts) { return insert(el, false, opts); },
    insertBefore: function (el, opts) { return insert(el, true, opts); }
  };
})();
