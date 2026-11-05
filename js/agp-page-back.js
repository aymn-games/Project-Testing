/**
 * AGP PAGE BACK — زر «رجوع» موحّد للصفحات اللي بأسفل المتجر (الشروط،
 * الاسترجاع، الخصوصية، حذف البيانات، الدعم).
 *
 * - ينضاف لحاله أول <main> بالصفحة. يكفي تحميل الملف آخر الـ<body>:
 *   <script src="js/agp-page-back.js"></script>
 * - لو الزائر جاي من صفحة بنفس الموقع (المتجر مثلاً) يرجّعه لها بالضبط
 *   (history.back)، ولو فتح الرابط مباشرة يوديه لـ data-back على <main>
 *   أو للرئيسية.
 * - الصفحات عامة: الملف ما يطلب تسجيل دخول ولا يلمس الحساب.
 */
(function () {
    'use strict';

    var main = document.querySelector('main');
    if (!main || main.querySelector('.agp-page-back')) return;

    var css = '' +
        '.agp-page-back{display:inline-flex;align-items:center;gap:10px;margin:0 0 22px;padding:8px 18px 8px 10px;' +
        'min-height:44px;border-radius:999px;border:1px solid rgba(167,139,250,0.32);' +
        'background:linear-gradient(135deg,rgba(124,77,255,0.14),rgba(255,255,255,0.03));' +
        'color:#e6e1f5;font:inherit;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none !important;' +
        'box-shadow:0 8px 22px -14px rgba(124,77,255,0.9);transition:background .2s,border-color .2s,transform .12s;}' +
        '.agp-page-back:hover{background:linear-gradient(135deg,rgba(124,77,255,0.26),rgba(255,255,255,0.05));border-color:rgba(167,139,250,0.6);color:#fff;}' +
        '.agp-page-back:active{transform:scale(0.97);}' +
        '.agp-page-back:focus-visible{outline:2px solid #a78bfa;outline-offset:3px;}' +
        '.agp-page-back .ic{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;' +
        'background:linear-gradient(135deg,#a47bff,#6d5cf0);color:#fff;flex:none;}' +
        '.agp-page-back .ic svg{width:15px;height:15px;}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var fallback = main.getAttribute('data-back') || './';

    function cameFromSite() {
        try {
            return !!document.referrer && new URL(document.referrer).origin === location.origin &&
                document.referrer !== location.href && history.length > 1;
        } catch (e) { return false; }
    }

    var a = document.createElement('a');
    a.className = 'agp-page-back';
    a.href = fallback;
    a.setAttribute('aria-label', 'رجوع للصفحة السابقة');
    // السهم يأشر لليمين لأن الصفحة RTL (الرجوع = ناحية البداية)
    a.innerHTML = '<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span><span>رجوع</span>';
    a.addEventListener('click', function (e) {
        if (cameFromSite()) { e.preventDefault(); history.back(); }
    });

    main.insertBefore(a, main.firstChild);
}());
