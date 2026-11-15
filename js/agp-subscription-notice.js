/**
 * إعلان بدء نظام الاشتراكات — نافذة «مرة وحدة» بالرئيسية (index.html) ومكتبة الألعاب (games.html).
 *
 *  - تطلع تلقائياً أول ما يدخل المستخدم، وفوقها شارة «تنويه مهم».
 *  - ما تنقفل أول 15 ثانية: لا ESC ولا ضغط برا النافذة. العدّاد مدموج بزر الإغلاق نفسه
 *    («يمكنك الإغلاق بعد N ثانية» مع تعبئة هادئة)، وبعدها يتحوّل الزر لـ«فهمت، متابعة».
 *  - الضغط برا النافذة ما يقفلها أبداً — الإغلاق من الزر (أو ESC بعد انتهاء العدّاد).
 *  - زر «تواصل معنا وشاركنا رأيك» شغّال من أول لحظة ويفتح حساب تيك توك @em70_q.
 *  - بعد الإغلاق ينحفظ بـ localStorage (STORE_KEY) فما تطلع مرة ثانية بنفس المتصفح.
 *
 * للمعاينة بدون ما ينحفظ: index.html?notice=subs-preview
 * لإعلان جديد بالمستقبل: غيّر STORE_KEY والنص.
 */
(function () {
    'use strict';

    var STORE_KEY = 'agp:notice:subscriptions-dec-2026:closed';
    var LOCK_SECONDS = 15;
    var CONTACT_URL = 'https://www.tiktok.com/@em70_q';

    var preview = /[?&]notice=subs-preview\b/.test(location.search);

    function wasClosed() {
        try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
    }
    function markClosed() {
        if (preview) return;
        try { localStorage.setItem(STORE_KEY, '1'); } catch (e) {}
    }

    if (!preview && wasClosed()) return;

    var FONT = '"IBM Plex Sans Arabic",system-ui,sans-serif';

    var CSS = '' +
        '.agp-sn-bg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;direction:rtl;' +
        'background:rgba(4,4,10,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:agpSnFade .25s ease both;transition:opacity .25s ease}' +
        '.agp-sn-bg.is-out{opacity:0}' +
        '.agp-sn-bg *{box-sizing:border-box}' +
        '.agp-sn{position:relative;display:flex;flex-direction:column;width:min(720px,100%);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);' +
        'border-radius:28px;color:#f4f2fa;text-align:right;font:500 17px/1.85 ' + FONT + ';' +
        'background:linear-gradient(180deg,#1e1a31 0%,#14111d 100%);border:1px solid rgba(255,255,255,.09);' +
        'box-shadow:0 40px 90px -24px rgba(0,0,0,.9);animation:agpSnIn .3s ease both}' +
        '.agp-sn:focus{outline:none}' +

        /* الرأس */
        '.agp-sn-head{padding:28px 32px 18px;border-bottom:1px solid rgba(255,255,255,.06)}' +
        '.agp-sn-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 12px;border-radius:999px;font:700 14px/1 ' + FONT + ';color:#dbe4ff;' +
        'background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(139,92,246,.2));border:1px solid rgba(129,140,248,.4)}' +
        '.agp-sn-badge svg{width:16px;height:16px;color:#a5b4fc}' +
        '.agp-sn-head h2{margin:14px 0 4px;font:800 28px/1.45 ' + FONT + ';color:#fff}' +
        '.agp-sn-sub{margin:0;font-size:16px;color:#a9a3c2}' +

        /* المحتوى */
        '.agp-sn-body{flex:1 1 auto;overflow-y:auto;padding:22px 32px 8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}' +
        '.agp-sn-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}' +
        '.agp-sn-list li{position:relative;padding-right:24px;color:#d6d1e6}' +
        '.agp-sn-list li::before{content:"";position:absolute;right:2px;top:.72em;width:9px;height:9px;border-radius:3px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);box-shadow:0 0 0 4px rgba(99,102,241,.14)}' +
        '.agp-sn-card{margin:20px 0 0;padding:20px 22px;border-radius:20px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}' +
        '.agp-sn-label{display:flex;align-items:center;gap:10px;margin:0 0 14px;font:700 17px/1.4 ' + FONT + ';color:#fff}' +
        '.agp-sn-label::before{content:"";width:4px;height:18px;border-radius:2px;background:linear-gradient(180deg,#3b82f6,#8b5cf6)}' +

        /* الأسعار */
        '.agp-sn-prices{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
        '.agp-sn-price{padding:18px 14px;border-radius:18px;text-align:center;background:linear-gradient(160deg,rgba(59,130,246,.14),rgba(139,92,246,.16));border:1px solid rgba(139,92,246,.35)}' +
        '.agp-sn-price small{display:block;font-size:15px;font-weight:600;color:#c4bdf0}' +
        '.agp-sn-price b{display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:4px;font:800 34px/1.2 ' + FONT + ';color:#fff}' +
        '.agp-sn-price b em{font-style:normal;font-size:16px;font-weight:600;color:#c4bdf0}' +

        /* يشمل + شعارات المنصات */
        '.agp-sn-incl{margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.07)}' +
        '.agp-sn-incl p{margin:0;color:#e6e2f2;font-weight:600}' +
        '.agp-sn-plats{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}' +
        '.agp-sn-plat{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:12px;font:700 15px/1 ' + FONT + ';color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}' +
        '.agp-sn-plat svg{width:20px;height:20px;flex:0 0 auto}' +

        /* تاريخ البدء — مميّز */
        '.agp-sn-date{display:flex;align-items:center;gap:18px;padding:20px 22px;background:linear-gradient(120deg,rgba(37,99,235,.28),rgba(124,58,237,.3));border:1px solid rgba(129,140,248,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}' +
        '.agp-sn-cal{flex:0 0 auto;width:78px;border-radius:16px;overflow:hidden;text-align:center;background:#fff;color:#1e1b4b;box-shadow:0 10px 24px -10px rgba(0,0,0,.7)}' +
        '.agp-sn-cal span{display:block;padding:4px 0;font:700 13px/1.4 ' + FONT + ';color:#fff;background:linear-gradient(135deg,#3b82f6,#7c3aed)}' +
        '.agp-sn-cal b{display:block;font:800 32px/1.25 ' + FONT + '}' +
        '.agp-sn-cal i{display:block;padding-bottom:4px;font:600 12px/1.3 ' + FONT + ';font-style:normal;color:#6b6890}' +
        '.agp-sn-date small{display:block;font-size:15px;color:#c7d2fe}' +
        '.agp-sn-date strong{display:block;font:800 26px/1.4 ' + FONT + ';color:#fff}' +

        /* الختام والتواصل */
        '.agp-sn-thanks{margin:22px 0 0;color:#d6d1e6}' +
        '.agp-sn-sign{margin:6px 0 0;font-weight:800;color:#fff}' +
        '.agp-sn-contact{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}' +
        '.agp-sn-contact p{margin:0;flex:1 1 auto;font-size:16px;color:#d6d1e6}' +
        '.agp-sn-cbtn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:48px;padding:10px 18px;border-radius:14px;text-decoration:none;white-space:nowrap;' +
        'color:#fff;font:700 15px ' + FONT + ';background:rgba(255,255,255,.06);border:1px solid rgba(139,92,246,.5);transition:background .15s,border-color .15s}' +
        '.agp-sn-cbtn:hover{background:rgba(139,92,246,.2);border-color:rgba(167,139,250,.8)}' +
        '.agp-sn-cbtn svg{width:18px;height:18px}' +

        /* الزر السفلي: العدّاد مدموج فيه */
        '.agp-sn-foot{padding:16px 32px 26px;border-top:1px solid rgba(255,255,255,.06)}' +
        '.agp-sn-ok{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:58px;padding:0 20px;border-radius:18px;' +
        'font:800 17px ' + FONT + ';color:#9b95b4;cursor:not-allowed;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);' +
        'transition:color .3s,background .3s,box-shadow .3s,transform .15s,border-color .3s}' +
        '.agp-sn-fill{position:absolute;inset:0;background:linear-gradient(90deg,rgba(59,130,246,.16),rgba(139,92,246,.2));transform-origin:right;transform:scaleX(0);transition:transform 1s linear}' +
        '.agp-sn-ok span,.agp-sn-ok svg{position:relative}' +
        '.agp-sn-txt{display:inline-flex;align-items:center;gap:10px}' +
        '.agp-sn-ok svg{width:18px;height:18px}' +
        '.agp-sn-ok .agp-sn-n{display:inline-block;min-width:1em;text-align:center;color:#e0dcf0;font-variant-numeric:tabular-nums}' +
        '.agp-sn-ok.is-ready{cursor:pointer;color:#fff;border-color:transparent;background:linear-gradient(135deg,#2563eb 0%,#6d28d9 100%);' +
        'box-shadow:0 14px 30px -12px rgba(109,40,217,.95),inset 0 1px 0 rgba(255,255,255,.22)}' +
        '.agp-sn-ok.is-ready .agp-sn-fill{display:none}' +
        '.agp-sn-ok.is-ready:hover{box-shadow:0 18px 36px -12px rgba(109,40,217,1),inset 0 1px 0 rgba(255,255,255,.28);background:linear-gradient(135deg,#3b74f0 0%,#7c3aed 100%)}' +
        '.agp-sn-ok.is-ready:active{transform:scale(.985)}' +
        '.agp-sn :focus-visible{outline:2px solid #a5b4fc;outline-offset:3px}' +

        '@keyframes agpSnFade{from{opacity:0}to{opacity:1}}' +
        '@keyframes agpSnIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
        '@media (max-width:600px){' +
            '.agp-sn-bg{padding:12px}' +
            '.agp-sn{border-radius:24px;font-size:16px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px)}' +
            '.agp-sn-head{padding:22px 20px 14px}.agp-sn-head h2{font-size:23px}.agp-sn-sub{font-size:15px}' +
            '.agp-sn-body{padding:18px 20px 6px}.agp-sn-card{padding:16px}' +
            '.agp-sn-price b{font-size:28px}' +
            '.agp-sn-date{gap:14px;padding:16px}.agp-sn-cal{width:66px}.agp-sn-cal b{font-size:26px}.agp-sn-date strong{font-size:21px}' +
            '.agp-sn-contact{flex-direction:column;align-items:stretch}.agp-sn-cbtn{width:100%}' +
            '.agp-sn-foot{padding:14px 20px 20px}' +
        '}' +
        '@media (prefers-reduced-motion:reduce){.agp-sn,.agp-sn-bg{animation:none}.agp-sn-fill{transition:none}}';

    var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>';
    var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var LOGO_TIKTOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';
    var LOGO_KICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#53fc18" d="M5 4h4v4h2V6h2V4h4v5h-2v2h-2v2h2v2h2v5h-4v-2h-2v-2H9v4H5z"/></svg>';
    var LOGO_TWITCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#a970ff" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>';

    function waitLabel(n) {
        return ICON_LOCK + '<span>يمكنك الإغلاق بعد <b class="agp-sn-n">' + n + '</b> ثانية</span>';
    }

    var HTML = '' +
        '<div class="agp-sn" role="dialog" aria-modal="true" aria-labelledby="agpSnTitle" tabindex="-1">' +
            '<div class="agp-sn-head">' +
                '<span class="agp-sn-badge">' + ICON_ALERT + 'تنويه مهم</span>' +
                '<h2 id="agpSnTitle">إلى مجتمع ألعاب أيمن ❤️</h2>' +
                '<p class="agp-sn-sub">بشأن بدء العمل بنظام الاشتراكات في المنصة</p>' +
            '</div>' +
            '<div class="agp-sn-body">' +
                '<ul class="agp-sn-list">' +
                    '<li>شهدت المنصة خلال اليومين الماضيين بعض الانقطاعات، وذلك نتيجة بلوغ الحدود المتاحة في الاستضافات والسيرفرات مع تزايد الاستخدام وعدد البثوث.</li>' +
                    '<li>دفعنا ذلك إلى إعادة النظر في آلية تشغيل المنصة، والبحث عن حلٍّ يضمن استقرارها واستمرار تطويرها.</li>' +
                    '<li>منذ انطلاق ألعاب أيمن كان هدفنا توفير ألعاب وأدوات مجانية تساعدكم على التفاعل مع جمهوركم، وبفضل دعمكم وصلنا إلى ما نحن عليه اليوم.</li>' +
                    '<li>لذلك قررنا اعتماد اشتراك رمزي يُسهم في تغطية تكاليف السيرفرات والاستضافات والصيانة والتطوير.</li>' +
                    '<li>ونودّ التوضيح بأن الهدف من الاشتراك هو استدامة المنصة وتطويرها وتقديم مزيد من الألعاب والميزات، وليس تحويلها إلى مشروع تجاري هدفه الربح.</li>' +
                '</ul>' +

                '<div class="agp-sn-card">' +
                    '<h3 class="agp-sn-label">أسعار الاشتراك</h3>' +
                    '<div class="agp-sn-prices">' +
                        '<div class="agp-sn-price"><small>لمدة شهر</small><b>24.99 <em>ريال</em></b></div>' +
                        '<div class="agp-sn-price"><small>لمدة شهرين</small><b>34.99 <em>ريال</em></b></div>' +
                    '</div>' +
                    '<div class="agp-sn-incl">' +
                        '<p>اشتراك واحد يشمل جميع الألعاب ومنصات البث المدعومة وجميع المميزات:</p>' +
                        '<div class="agp-sn-plats">' +
                            '<span class="agp-sn-plat">' + LOGO_TIKTOK + 'تيك توك</span>' +
                            '<span class="agp-sn-plat">' + LOGO_KICK + 'كيك</span>' +
                            '<span class="agp-sn-plat">' + LOGO_TWITCH + 'تويتش</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div class="agp-sn-card agp-sn-date">' +
                    '<div class="agp-sn-cal" aria-hidden="true"><span>ديسمبر</span><b>1</b><i>2026</i></div>' +
                    '<div><small>يبدأ العمل بنظام الاشتراكات اعتباراً من</small><strong>1 ديسمبر 2026</strong></div>' +
                '</div>' +

                '<p class="agp-sn-thanks">نشكر كل من دعم ألعاب أيمن وكان جزءاً من رحلتنا منذ البداية.</p>' +
                '<p class="agp-sn-sign">ألعاب أيمن منكم وفيكم، ومستمرون معكم ❤️</p>' +

                '<div class="agp-sn-card agp-sn-contact">' +
                    '<p>هل لديك استفسار أو رأي بخصوص التحديث الجديد؟ يسعدنا أن نسمع منك ونتناقش معك بكل وضوح ❤️</p>' +
                    '<a class="agp-sn-cbtn" href="' + CONTACT_URL + '" target="_blank" rel="noopener noreferrer">' + LOGO_TIKTOK + '<span>تواصل معنا وشاركنا رأيك</span></a>' +
                '</div>' +
            '</div>' +
            '<div class="agp-sn-foot">' +
                '<button type="button" class="agp-sn-ok" aria-disabled="true"><i class="agp-sn-fill"></i><span class="agp-sn-txt">' + waitLabel(LOCK_SECONDS) + '</span></button>' +
            '</div>' +
        '</div>';

    function show() {
        if (document.querySelector('.agp-sn-bg')) return;

        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        var bg = document.createElement('div');
        bg.className = 'agp-sn-bg';
        bg.innerHTML = HTML;
        document.body.appendChild(bg);

        var box = bg.querySelector('.agp-sn');
        var okBtn = bg.querySelector('.agp-sn-ok');
        var txt = bg.querySelector('.agp-sn-txt');
        var fill = bg.querySelector('.agp-sn-fill');
        var ready = false;
        var closed = false;

        var html = document.documentElement;
        var prevOverflow = html.style.overflow;
        html.style.overflow = 'hidden';

        try { box.focus({ preventScroll: true }); } catch (e) {}
        requestAnimationFrame(function () { fill.style.transform = 'scaleX(' + (1 / LOCK_SECONDS) + ')'; });

        var left = LOCK_SECONDS;
        var timer = setInterval(function () {
            left -= 1;
            if (left > 0) {
                txt.innerHTML = waitLabel(left);
                fill.style.transform = 'scaleX(' + ((LOCK_SECONDS - left + 1) / LOCK_SECONDS) + ')';
                return;
            }
            clearInterval(timer);
            ready = true;
            okBtn.classList.add('is-ready');
            okBtn.removeAttribute('aria-disabled');
            txt.innerHTML = '<span>فهمت، متابعة</span>' + ICON_CHECK;
            try { okBtn.focus({ preventScroll: true }); } catch (e) {}
        }, 1000);

        function close() {
            if (!ready || closed) return;
            closed = true;
            markClosed();
            document.removeEventListener('keydown', onKey, true);
            html.style.overflow = prevOverflow;
            bg.classList.add('is-out');
            setTimeout(function () { bg.remove(); style.remove(); }, 260);
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
                return;
            }
            if (e.key === 'Tab') {
                // نخلي التنقّل بالكيبورد داخل النافذة
                var f = Array.prototype.slice.call(box.querySelectorAll('a[href],button'));
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }

        document.addEventListener('keydown', onKey, true);
        okBtn.addEventListener('click', close);
        // الضغط برا النافذة ما يقفلها أبداً — نوقفه بس عشان ما يوصل للصفحة تحت
        bg.addEventListener('click', function (e) { if (e.target === bg) e.stopPropagation(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
})();
