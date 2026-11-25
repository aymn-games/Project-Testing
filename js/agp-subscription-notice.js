/**
 * إعلان بدء نظام الاشتراكات — نافذة «مرة وحدة» بالرئيسية (index.html) ومكتبة الألعاب (games.html).
 *
 *  - تطلع تلقائياً أول ما يدخل المستخدم، وفوقها شارة «تنويه مهم».
 *  - ما تنقفل أول 15 ثانية: لا ESC ولا ضغط برا النافذة. العدّاد مدموج بزر الإغلاق نفسه
 *    («يمكنك الإغلاق بعد N ثانية» مع تعبئة هادئة)، وبعدها يتحوّل الزر لـ«فهمت، متابعة».
 *  - الضغط برا النافذة وESC ما يقفلونها أبداً — الإغلاق من الزر بس.
 *  - لو المستخدم ضغط «خذ راحتك» بتنبيه المكتبة (js/agp-library-notice.js) تنقفل
 *    هذي النافذة فوراً وما تطلع بنفس الزيارة (بدون ما تنحفظ إنها انقفلت).
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
        '.agp-sn{position:relative;display:flex;flex-direction:column;width:min(900px,100%);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);' +
        'border-radius:28px;color:#f4f2fa;text-align:right;font:500 16px/1.75 ' + FONT + ';' +
        'background:linear-gradient(180deg,#1e1a31 0%,#14111d 100%);border:1px solid rgba(255,255,255,.09);' +
        'box-shadow:0 40px 90px -24px rgba(0,0,0,.9);animation:agpSnIn .3s ease both}' +
        '.agp-sn:focus{outline:none}' +

        /* الرأس: العنوان يمين وشارة «تنويه مهم» يسار */
        '.agp-sn-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 30px 16px;border-bottom:1px solid rgba(255,255,255,.06)}' +
        '.agp-sn-head h2{margin:0;font:800 26px/1.4 ' + FONT + ';color:#fff}' +
        '.agp-sn-badge{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;padding:7px 14px 7px 12px;border-radius:999px;font:700 14px/1 ' + FONT + ';color:#dbe4ff;' +
        'background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(139,92,246,.2));border:1px solid rgba(129,140,248,.4)}' +
        '.agp-sn-badge svg{width:16px;height:16px;color:#a5b4fc}' +

        /* المحتوى */
        '.agp-sn-body{flex:1 1 auto;overflow-y:auto;padding:16px 30px 16px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}' +
        '.agp-sn-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}' +
        '.agp-sn-list li{position:relative;padding-right:22px;color:#d6d1e6}' +
        '.agp-sn-list li::before{content:"";position:absolute;right:2px;top:.68em;width:8px;height:8px;border-radius:3px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);box-shadow:0 0 0 4px rgba(99,102,241,.14)}' +

        /* شريط المعلومات: سعرين + تاريخ البدء بسطر واحد */
        '.agp-sn-info{margin-top:14px;padding:14px;border-radius:20px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}' +
        '.agp-sn-label{margin:0 4px 10px 0;font:700 15px/1.4 ' + FONT + ';color:#fff}' +
        '.agp-sn-tiles{display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:10px}' +
        '.agp-sn-tile{display:flex;flex-direction:column;justify-content:center;min-height:68px;padding:8px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(139,92,246,.3)}' +
        '.agp-sn-tile b{font:800 22px/1.3 ' + FONT + ';color:#fff}' +
        '.agp-sn-tile b em{font-style:normal;font-size:14px;font-weight:600;color:#c4bdf0;margin-right:4px}' +
        '.agp-sn-tile small{font-size:14px;line-height:1.5;color:#b9b2d6}' +
        '.agp-sn-tile.is-date{flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;background:linear-gradient(120deg,rgba(37,99,235,.32),rgba(124,58,237,.34));border-color:rgba(129,140,248,.6)}' +
        '.agp-sn-tile.is-date svg{flex:0 0 auto;width:26px;height:26px;color:#c7d2fe}' +
        '.agp-sn-tile.is-date small{display:block;color:#c7d2fe;font-size:13px}' +
        '.agp-sn-tile.is-date b{display:block;font-size:21px}' +
        '.agp-sn-incl{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;padding:0 4px}' +
        '.agp-sn-incl p{margin:0;font-size:15px;font-weight:600;color:#e6e2f2}' +
        '.agp-sn-plats{display:flex;gap:8px}' +
        '.agp-sn-plat{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:10px;font:700 14px/1.2 ' + FONT + ';color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}' +
        '.agp-sn-plat svg{width:17px;height:17px;flex:0 0 auto}' +

        /* الختام والتواصل */
        '.agp-sn-thanks{margin:14px 0 0;color:#d6d1e6}' +
        '.agp-sn-sign{margin:0;font-weight:800;color:#fff}' +
        '.agp-sn-contact{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px;padding:12px 14px 12px 12px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}' +
        '.agp-sn-contact p{margin:0;flex:1 1 auto;font-size:15px;line-height:1.6;color:#d6d1e6}' +
        '.agp-sn-cbtn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:44px;padding:8px 16px;border-radius:13px;text-decoration:none;white-space:nowrap;' +
        'color:#fff;font:700 15px ' + FONT + ';background:rgba(255,255,255,.06);border:1px solid rgba(139,92,246,.5);transition:background .15s,border-color .15s}' +
        '.agp-sn-cbtn:hover{background:rgba(139,92,246,.2);border-color:rgba(167,139,250,.8)}' +
        '.agp-sn-cbtn svg{width:18px;height:18px}' +

        /* الزر السفلي: العدّاد مدموج فيه */
        '.agp-sn-foot{padding:14px 30px 20px;border-top:1px solid rgba(255,255,255,.06)}' +
        '.agp-sn-ok{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;width:100%;min-height:54px;padding:0 20px;border-radius:17px;' +
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
        /* شاشات قصيرة (لابتوب 768 وأقل): نضغط المسافات شوي */
        '@media (max-height:780px){.agp-sn{font-size:15px;line-height:1.7}.agp-sn-head{padding:16px 28px 12px}.agp-sn-head h2{font-size:23px}.agp-sn-body{padding:12px 28px}' +
            '.agp-sn-list{gap:4px}.agp-sn-info{margin-top:10px;padding:12px}.agp-sn-tile{min-height:60px}.agp-sn-thanks,.agp-sn-contact{margin-top:10px}.agp-sn-foot{padding:12px 28px 16px}.agp-sn-ok{min-height:50px}}' +
        '@media (max-width:640px){' +
            '.agp-sn-bg{padding:10px}' +
            '.agp-sn{border-radius:22px;font-size:14.5px;line-height:1.65;max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px)}' +
            '.agp-sn-head{padding:14px 16px 10px}.agp-sn-head h2{font-size:19px}.agp-sn-badge{padding:5px 10px;font-size:12px}.agp-sn-badge svg{width:14px;height:14px}' +
            '.agp-sn-body{padding:10px 16px}.agp-sn-list{gap:4px}.agp-sn-list li{padding-right:18px}' +
            '.agp-sn-info{padding:10px;margin-top:10px}.agp-sn-tiles{grid-template-columns:1fr 1fr;gap:8px}.agp-sn-tile{min-height:0;padding:7px 10px}.agp-sn-tile b{font-size:19px}' +
            '.agp-sn-tile.is-date{grid-column:1 / -1}.agp-sn-tile.is-date b{font-size:18px}' +
            '.agp-sn-incl{margin-top:8px}.agp-sn-incl p{font-size:13.5px}.agp-sn-plat{padding:4px 8px;font-size:12.5px}.agp-sn-plat svg{width:15px;height:15px}' +
            '.agp-sn-thanks,.agp-sn-contact{margin-top:10px}' +
            '.agp-sn-contact{flex-direction:column;align-items:stretch;gap:8px;padding:10px}.agp-sn-contact p{font-size:13.5px}.agp-sn-cbtn{width:100%;min-height:42px}' +
            '.agp-sn-foot{padding:10px 16px 14px}.agp-sn-ok{min-height:50px;font-size:16px}' +
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

    var ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

    var HTML = '' +
        '<div class="agp-sn" role="dialog" aria-modal="true" aria-labelledby="agpSnTitle" tabindex="-1">' +
            '<div class="agp-sn-head">' +
                '<h2 id="agpSnTitle">إلى مجتمع ألعاب أيمن ❤️</h2>' +
                '<span class="agp-sn-badge">' + ICON_ALERT + 'تنويه مهم</span>' +
            '</div>' +
            '<div class="agp-sn-body">' +
                '<ul class="agp-sn-list">' +
                    '<li>يمكن لاحظتوا الانقطاعات اللي صارت في المنصة خلال اليومين الماضية والسبب كان وصولنا للحدود المتاحة في الاستضافات والسيرفرات مع زيادة الاستخدام وعدد البثوث</li>' +
                    '<li>وهذا خلانا نعيد النظر في طريقة تشغيل المنصة ونبحث عن حل يضمن استقرارها واستمرار تطويرها</li>' +
                    '<li>من بداية ألعاب أيمن كان هدفنا نوفر لكم ألعاب وأدوات تساعدكم تتفاعلون مع جمهوركم مجاناً وبفضل دعمكم قدرنا نوصل لليوم</li>' +
                    '<li>لذلك قررنا اعتماد اشتراك رمزي يساعدنا على تغطية تكاليف السيرفرات والاستضافات والصيانة والتطوير</li>' +
                    '<li>ونحب نوضح أن الهدف من الاشتراك هو استدامة المنصة وتطويرها وتقديم ألعاب وميزات أكثر وليس تحويلها إلى مشروع تجاري هدفه الربح</li>' +
                '</ul>' +

                '<div class="agp-sn-info">' +
                    '<h3 class="agp-sn-label">أسعار الاشتراك</h3>' +
                    '<div class="agp-sn-tiles">' +
                        '<div class="agp-sn-tile"><b>24.99<em>ريال</em></b><small>لمدة شهر</small></div>' +
                        '<div class="agp-sn-tile"><b>34.99<em>ريال</em></b><small>لمدة شهرين</small></div>' +
                        '<div class="agp-sn-tile is-date">' + ICON_CAL + '<div><small>سيبدأ العمل بنظام الاشتراكات اعتباراً من</small><b>1 ديسمبر 2026</b></div></div>' +
                    '</div>' +
                    '<div class="agp-sn-incl">' +
                        '<p>اشتراك واحد يشمل جميع الألعاب ومنصات البث المدعومة وجميع المميزات</p>' +
                        '<div class="agp-sn-plats">' +
                            '<span class="agp-sn-plat">' + LOGO_TIKTOK + 'تيك توك</span>' +
                            '<span class="agp-sn-plat">' + LOGO_KICK + 'كيك</span>' +
                            '<span class="agp-sn-plat">' + LOGO_TWITCH + 'تويتش</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<p class="agp-sn-thanks">شكراً لكل شخص دعم ألعاب أيمن وكان جزءاً من رحلتنا من البداية</p>' +
                '<p class="agp-sn-sign">ألعاب أيمن منكم وفيكم ومستمرين معكم ❤️</p>' +

                '<div class="agp-sn-contact">' +
                    '<p>عندك استفسار أو رأي بخصوص التحديث الجديد؟ يسعدنا نسمع منك ونتناقش معك بكل وضوح ❤️</p>' +
                    '<a class="agp-sn-cbtn" href="' + CONTACT_URL + '" target="_blank" rel="noopener noreferrer">' + LOGO_TIKTOK + '<span>تواصل معنا وشاركنا رأيك</span></a>' +
                '</div>' +
            '</div>' +
            '<div class="agp-sn-foot">' +
                '<button type="button" class="agp-sn-ok" aria-disabled="true"><i class="agp-sn-fill"></i><span class="agp-sn-txt">' + waitLabel(LOCK_SECONDS) + '</span></button>' +
            '</div>' +
        '</div>';

    function show() {
        if (window.__agpNoticesDismissed || document.querySelector('.agp-sn-bg')) return;

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

        function close(force) {
            if ((!ready && force !== true) || closed) return;
            closed = true;
            clearInterval(timer);
            document.removeEventListener('agp:notices:dismiss-all', dismissAll);
            if (force !== true) markClosed();
            document.removeEventListener('keydown', onKey, true);
            html.style.overflow = prevOverflow;
            bg.classList.add('is-out');
            setTimeout(function () { bg.remove(); style.remove(); }, 260);
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                // ESC ما يقفل — الإغلاق من الزر بس
                e.preventDefault();
                e.stopPropagation();
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
        okBtn.addEventListener('click', function () { close(); });
        // «خذ راحتك» بتنبيه المكتبة يقفل كل التنويهات
        function dismissAll() { close(true); }
        document.addEventListener('agp:notices:dismiss-all', dismissAll);
        // الضغط برا النافذة ما يقفلها أبداً — نوقفه بس عشان ما يوصل للصفحة تحت
        bg.addEventListener('click', function (e) { if (e.target === bg) e.stopPropagation(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
})();
