/**
 * إعلان بدء نظام الاشتراكات — نافذة «مرة وحدة» بالرئيسية (index.html) ومكتبة الألعاب (games.html).
 *
 *  - تطلع تلقائياً أول ما يدخل المستخدم.
 *  - ما تنقفل أول 15 ثانية (لا زر، لا ESC، لا ضغط برا النافذة)، مع عدّاد «يمكنك الإغلاق بعد N ثانية».
 *  - بعد العدّاد يطلع زر «فهمت، متابعة» (ويصير × بالزاوية يقفل).
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

    var CSS = '' +
        '.agp-sn-bg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;direction:rtl;' +
        'background:rgba(5,4,12,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:agpSnFade .25s ease both;transition:opacity .25s ease}' +
        '.agp-sn-bg.is-out{opacity:0}' +
        '.agp-sn-bg *{box-sizing:border-box}' +
        '.agp-sn{position:relative;display:flex;flex-direction:column;width:min(540px,100%);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);' +
        'border-radius:28px;color:#f4f2fa;text-align:right;font:500 16px/1.8 "IBM Plex Sans Arabic",system-ui,sans-serif;' +
        'background:linear-gradient(180deg,#1f1a33 0%,#16121f 100%);border:1px solid rgba(255,255,255,.09);' +
        'box-shadow:0 30px 80px -20px rgba(0,0,0,.85);animation:agpSnIn .3s ease both}' +
        '.agp-sn-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:24px 24px 6px}' +
        '.agp-sn-head h2{margin:0;font:800 22px/1.5 "IBM Plex Sans Arabic",system-ui,sans-serif;color:#fff}' +
        '.agp-sn-x{flex:0 0 auto;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:14px;cursor:pointer;' +
        'border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#e9e6f2;font:700 16px "IBM Plex Sans Arabic",sans-serif;transition:background .15s,color .15s}' +
        '.agp-sn-x:disabled{cursor:not-allowed;color:#8f88a8}' +
        '.agp-sn-x:not(:disabled):hover{background:rgba(255,255,255,.09)}' +
        '.agp-sn-x svg{width:16px;height:16px}' +
        '.agp-sn-body{flex:1 1 auto;overflow-y:auto;padding:6px 24px 6px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}' +
        '.agp-sn-body p{margin:0 0 12px;color:#c9c4d9}' +
        '.agp-sn-card{margin:14px 0;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}' +
        '.agp-sn-card p{margin:0}' +
        '.agp-sn-label{display:block;margin-bottom:10px;font-weight:700;font-size:15px;color:#fff}' +
        '.agp-sn-prices{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
        '.agp-sn-price{padding:14px 12px;border-radius:16px;text-align:center;background:linear-gradient(160deg,rgba(91,108,255,.16),rgba(139,92,246,.14));border:1px solid rgba(139,92,246,.32)}' +
        '.agp-sn-price b{display:block;font:800 26px/1.3 "IBM Plex Sans Arabic",sans-serif;color:#fff;direction:ltr;unicode-bidi:isolate}' +
        '.agp-sn-price span{display:block;font-size:14px;color:#c4bdf0}' +
        '.agp-sn-incl{margin-top:12px !important;font-size:15px;color:#d9d4ea !important}' +
        '.agp-sn-date{display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,rgba(59,130,246,.14),rgba(139,92,246,.14));border-color:rgba(99,102,241,.35)}' +
        '.agp-sn-date i{flex:0 0 auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(99,102,241,.22);color:#c7d2fe;font-style:normal}' +
        '.agp-sn-date i svg{width:22px;height:22px}' +
        '.agp-sn-date p{color:#e8e6f5}' +
        '.agp-sn-date strong{color:#fff;font-weight:800;white-space:nowrap}' +
        '.agp-sn-sign{color:#fff !important;font-weight:700}' +
        '.agp-sn-contact p{color:#d9d4ea;font-size:15px}' +
        '.agp-sn-cbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;margin-top:12px;padding:10px 16px;border-radius:14px;text-decoration:none;' +
        'color:#fff;font:700 15px "IBM Plex Sans Arabic",sans-serif;background:rgba(255,255,255,.05);border:1px solid rgba(139,92,246,.45);transition:background .15s}' +
        '.agp-sn-cbtn:hover{background:rgba(139,92,246,.18)}' +
        '.agp-sn-cbtn svg{width:18px;height:18px}' +
        '.agp-sn-foot{padding:12px 24px 22px;border-top:1px solid rgba(255,255,255,.06)}' +
        '.agp-sn-wait{text-align:center;font-size:14px;color:#a9a3bf}' +
        '.agp-sn-wait b{color:#fff;font-weight:800;display:inline-block;min-width:1.4em;text-align:center}' +
        '.agp-sn-bar{height:4px;margin-top:10px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}' +
        '.agp-sn-bar span{display:block;height:100%;width:100%;border-radius:4px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);transform-origin:right;transition:transform 1s linear}' +
        '.agp-sn-ok{display:none;width:100%;min-height:52px;border:none;border-radius:16px;cursor:pointer;color:#fff;font:800 16px "IBM Plex Sans Arabic",sans-serif;' +
        'background:linear-gradient(135deg,#3b82f6,#7c3aed);box-shadow:0 10px 24px -10px rgba(124,58,237,.9);transition:transform .15s,filter .15s}' +
        '.agp-sn-ok:hover{filter:brightness(1.08)}' +
        '.agp-sn-ok:active{transform:scale(.98)}' +
        '.agp-sn.is-ready .agp-sn-wait{display:none}' +
        '.agp-sn.is-ready .agp-sn-ok{display:block}' +
        '.agp-sn:focus{outline:none}' +
        '.agp-sn :focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}' +
        '@keyframes agpSnFade{from{opacity:0}to{opacity:1}}' +
        '@keyframes agpSnIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
        '@media (max-width:480px){.agp-sn{border-radius:24px}.agp-sn-head{padding:20px 18px 4px}.agp-sn-head h2{font-size:20px}.agp-sn-body{padding:4px 18px}' +
        '.agp-sn-foot{padding:12px 18px 18px}.agp-sn-price b{font-size:22px}.agp-sn-x{width:44px;height:44px}}' +
        '@media (prefers-reduced-motion:reduce){.agp-sn,.agp-sn-bg{animation:none}.agp-sn-bar span{transition:none}}';

    var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
    var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

    var HTML = '' +
        '<div class="agp-sn" role="dialog" aria-modal="true" aria-labelledby="agpSnTitle" tabindex="-1">' +
            '<div class="agp-sn-head">' +
                '<h2 id="agpSnTitle">إلى مجتمع ألعاب أيمن ❤️</h2>' +
                '<button type="button" class="agp-sn-x" disabled aria-label="يمكنك الإغلاق بعد ' + LOCK_SECONDS + ' ثانية">' + LOCK_SECONDS + '</button>' +
            '</div>' +
            '<div class="agp-sn-body">' +
                '<p>يمكن لاحظتوا الانقطاعات اللي صارت في المنصة خلال اليومين الماضية والسبب كان وصولنا للحدود المتاحة في الاستضافات والسيرفرات مع زيادة الاستخدام وعدد البثوث.</p>' +
                '<p>وهذا خلانا نعيد النظر في طريقة تشغيل المنصة ونبحث عن حل يضمن استقرارها واستمرار تطويرها.</p>' +
                '<p>من بداية ألعاب أيمن كان هدفنا نوفر لكم ألعاب وأدوات تساعدكم تتفاعلون مع جمهوركم مجاناً وبفضل دعمكم قدرنا نوصل لليوم.</p>' +
                '<p>لذلك قررنا اعتماد اشتراك رمزي يساعدنا على تغطية تكاليف السيرفرات والاستضافات والصيانة والتطوير.</p>' +
                '<p>ونحب نوضح أن الهدف من الاشتراك هو استدامة المنصة وتطويرها وتقديم ألعاب وميزات أكثر وليس تحويلها إلى مشروع تجاري هدفه الربح.</p>' +
                '<div class="agp-sn-card">' +
                    '<span class="agp-sn-label">أسعار الاشتراك:</span>' +
                    '<div class="agp-sn-prices">' +
                        '<div class="agp-sn-price"><b>24.99</b><span>ريال لمدة شهر</span></div>' +
                        '<div class="agp-sn-price"><b>34.99</b><span>ريال لمدة شهرين</span></div>' +
                    '</div>' +
                    '<p class="agp-sn-incl">اشتراك واحد يشمل جميع الألعاب ومنصات البث المدعومة وجميع المميزات.</p>' +
                '</div>' +
                '<div class="agp-sn-card agp-sn-date">' +
                    '<i>' + ICON_CAL + '</i>' +
                    '<p>سيبدأ العمل بنظام الاشتراكات اعتباراً من <strong>1 ديسمبر 2026</strong></p>' +
                '</div>' +
                '<p>شكراً لكل شخص دعم ألعاب أيمن وكان جزءاً من رحلتنا من البداية.</p>' +
                '<p class="agp-sn-sign">ألعاب أيمن منكم وفيكم ومستمرين معكم ❤️</p>' +
                '<div class="agp-sn-card agp-sn-contact">' +
                    '<p>عندك استفسار أو رأي بخصوص التحديث الجديد؟ يسعدنا نسمع منك ونتناقش معك بكل وضوح ❤️</p>' +
                    '<a class="agp-sn-cbtn" href="' + CONTACT_URL + '" target="_blank" rel="noopener noreferrer">' + ICON_CHAT + '<span>تواصل معنا وشاركنا رأيك</span></a>' +
                '</div>' +
            '</div>' +
            '<div class="agp-sn-foot">' +
                '<div class="agp-sn-wait" aria-live="polite">يمكنك الإغلاق بعد <b>' + LOCK_SECONDS + '</b> ثانية' +
                    '<div class="agp-sn-bar"><span></span></div></div>' +
                '<button type="button" class="agp-sn-ok">فهمت، متابعة</button>' +
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
        var xBtn = bg.querySelector('.agp-sn-x');
        var okBtn = bg.querySelector('.agp-sn-ok');
        var count = bg.querySelector('.agp-sn-wait b');
        var bar = bg.querySelector('.agp-sn-bar span');
        var ready = false;
        var closed = false;

        var html = document.documentElement;
        var prevOverflow = html.style.overflow;
        html.style.overflow = 'hidden';

        try { box.focus({ preventScroll: true }); } catch (e) {}

        var left = LOCK_SECONDS;
        var timer = setInterval(function () {
            left -= 1;
            if (left > 0) {
                count.textContent = left;
                xBtn.textContent = left;
                xBtn.setAttribute('aria-label', 'يمكنك الإغلاق بعد ' + left + ' ثانية');
                bar.style.transform = 'scaleX(' + (left / LOCK_SECONDS) + ')';
                return;
            }
            clearInterval(timer);
            ready = true;
            box.classList.add('is-ready');
            xBtn.disabled = false;
            xBtn.innerHTML = ICON_X;
            xBtn.setAttribute('aria-label', 'إغلاق');
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
                var f = Array.prototype.filter.call(
                    box.querySelectorAll('button:not([disabled]),a[href]'),
                    function (el) { return el.offsetParent !== null; }
                );
                if (!f.length) { e.preventDefault(); return; }
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }

        document.addEventListener('keydown', onKey, true);
        okBtn.addEventListener('click', close);
        xBtn.addEventListener('click', close);
        bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
})();
