/**
 * AGP INSTALL APP — «ثبّت الموقع كتطبيق»: إضافة الموقع للشاشة الرئيسية عشان
 * يفتح بملء الشاشة بدون شريط المتصفح (site.webmanifest + وسوم apple-mobile-web-app
 * بكل الصفحات). مهم لمذيع الآيباد اللي يشارك الشاشة بتيك توك.
 *
 * - المتصفحات اللي تدعم التثبيت المباشر (Chrome/Edge — أندرويد والكمبيوتر):
 *   نحفظ حدث beforeinstallprompt ونفتح نافذة التثبيت نفسها من الزر.
 * - الآيباد/الآيفون: Safari ما يسمح بزر تثبيت، فنعرض الخطوات (مشاركة ← إضافة
 *   إلى الشاشة الرئيسية).
 * - لو الموقع مفتوح أصلاً كتطبيق: isInstalled() = true والزر ينخفى.
 *
 * AGPInstallApp.open() / isInstalled() / mountButton(host)
 */
(function () {
    'use strict';

    if (window.AGPInstallApp) return;

    var deferred = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault(); // نفتحها من زرّنا بدل شريط المتصفح التلقائي
        deferred = e;
    });
    window.addEventListener('appinstalled', function () {
        deferred = null;
        document.querySelectorAll('[data-install-app-btn]').forEach(function (b) { b.remove(); });
    });

    function isInstalled() {
        try {
            return window.navigator.standalone === true ||
                window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches;
        } catch (e) { return false; }
    }

    function platform() {
        var ua = navigator.userAgent || '';
        // iPadOS يقدّم نفسه كـMac — نميّزه باللمس
        var ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        if (ios) return 'ios';
        if (/Android/i.test(ua)) return 'android';
        return 'desktop';
    }

    var SHARE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    var ADD_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

    var STEPS = {
        ios: [
            { icon: SHARE_ICON, text: 'اضغط زر المشاركة بشريط Safari (مربع فيه سهم لفوق) — بالآيباد فوق جنب العنوان، وبالآيفون تحت.' },
            { icon: ADD_ICON, text: 'انزل بالقائمة واختر «إضافة إلى الشاشة الرئيسية».' },
            { text: 'خلّ الاسم «ألعاب أيمن» واضغط «إضافة».' },
            { text: 'افتح «ألعاب أيمن» من الشاشة الرئيسية — يفتح بملء الشاشة بدون شريط Safari.' }
        ],
        android: [
            { text: 'اضغط قائمة المتصفح ⋮ (فوق يسار أو يمين).' },
            { icon: ADD_ICON, text: 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».' },
            { text: 'افتح «ألعاب أيمن» من الشاشة الرئيسية.' }
        ],
        desktop: [
            { icon: ADD_ICON, text: 'بـChrome أو Edge: اضغط أيقونة التثبيت بآخر شريط العنوان، أو من القائمة ⋮ اختر «تثبيت ألعاب أيمن».' },
            { text: 'التطبيق يفتح بنافذة لحاله بدون شريط المتصفح — وتقدر تكبّرها بملء الشاشة (F11).' }
        ]
    };

    function el(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text != null) e.textContent = text;
        return e;
    }

    function showGuide() {
        var plat = platform();
        var back = el('div', 'position:fixed;inset:0;z-index:2147483646;background:rgba(3,3,8,.72);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)');
        var box = el('div', 'width:min(460px,100%);max-height:90vh;overflow:auto;background:linear-gradient(160deg,#1c1830,#0d0b16);border:1px solid rgba(178,140,245,.35);border-radius:22px;padding:22px;color:#f4f2fb;box-shadow:0 30px 80px -20px rgba(0,0,0,.9);text-align:right');
        box.appendChild(el('div', 'font-family:"Noto Kufi Arabic",sans-serif;font-size:19px;font-weight:700;margin-bottom:6px', 'ثبّت ألعاب أيمن كتطبيق'));
        box.appendChild(el('div', 'font-size:13.5px;color:#a79fbb;line-height:1.8;margin-bottom:14px', 'يفتح بملء الشاشة بدون شريط المتصفح — شاشة البث تطلع نظيفة، والأوفرلي فوق كل الصفحات.'));
        STEPS[plat].forEach(function (s, i) {
            var row = el('div', 'display:flex;align-items:flex-start;gap:12px;padding:10px 12px;margin-bottom:8px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)');
            row.appendChild(el('span', 'flex:none;width:26px;height:26px;border-radius:50%;background:#7a3fd4;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px', String(i + 1)));
            var txt = el('span', 'flex:1;font-size:14.5px;line-height:1.8', s.text);
            row.appendChild(txt);
            if (s.icon) { var ic = el('span', 'flex:none;color:#b28cf5;margin-top:3px'); ic.innerHTML = s.icon; row.appendChild(ic); }
            box.appendChild(row);
        });
        if (plat === 'ios') {
            box.appendChild(el('div', 'font-size:13px;line-height:1.8;color:#ffd27a;background:rgba(245,166,35,.08);border:1px solid rgba(245,166,35,.3);border-radius:12px;padding:10px 12px;margin-top:6px',
                'مهم: التطبيق له تخزين منفصل عن Safari — أول مرة تفتحه سجّل دخولك، واضغط «اتصل بالبث»، وصمّم الأوفرلي من «استوديو البث» من داخل التطبيق نفسه.'));
        }
        var close = el('button', 'margin-top:14px;width:100%;padding:12px;border-radius:999px;border:0;background:linear-gradient(180deg,#8a4fe8,#7a3fd4);color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer', 'تمام');
        close.type = 'button';
        close.addEventListener('click', function () { back.remove(); });
        back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
        box.appendChild(close);
        back.appendChild(box);
        document.body.appendChild(back);
    }

    function open() {
        if (deferred) {
            var d = deferred;
            deferred = null;
            d.prompt();
            return d.userChoice.catch(function () {});
        }
        showGuide();
        return Promise.resolve();
    }

    /** زر «ثبّت الموقع كتطبيق» داخل host (ما ينضاف لو الموقع مفتوح كتطبيق). */
    function mountButton(host, css) {
        if (isInstalled() || !host || host.querySelector('[data-install-app-btn]')) return null;
        var b = el('button', css || '');
        b.type = 'button';
        b.setAttribute('data-install-app-btn', '1');
        b.innerHTML = ADD_ICON;
        b.appendChild(document.createTextNode('ثبّت الموقع كتطبيق (ملء الشاشة)'));
        b.addEventListener('click', open);
        host.appendChild(b);
        return b;
    }

    window.AGPInstallApp = { open: open, isInstalled: isInstalled, mountButton: mountButton };
}());
