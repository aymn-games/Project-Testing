/**
 * تنبيه «مرة وحدة» بمكتبة الألعاب (games.html) — «مستحي أصارحكم»: تحديث قصير.
 *
 * - يطلع بس خلال نافذة زمنية (من WINDOW_START إلى WINDOW_START + WINDOW_MINUTES).
 *   اللي يدخل بعدها ما يشوفه أبداً. لو WINDOW_START = null فالتنبيه موقّف.
 * - اللي يدخل خلال النافذة يطلع له مرة وحدة بس:
 *     localStorage 'agp:notice:<KEY>:<user id|guest>'، ومسجّل الدخول ينحفظ بحسابه
 *     بالسيرفر (GET/POST /api/notices/seen — backend/notices/seen-notices.js).
 * - مرحلتين:
 *     ١) صورة القطو + «عندي تحديث مدته أقل من 10 دقايق ومستحي أصارحكم»
 *        وزرّين: «خذ راحتك ماورانا شي» و«لا خله بعدين».
 *     ٢) لو ضغط «لا خله بعدين»: الزر ينط لمكان ثاني بالشاشة، والصورة تتبدّل
 *        للصورة الثانية وفوقها «متأكد؟». الزر يظل ينط كل ما ينضغط.
 *        وزر «خذ راحتك ماورانا شي» يصير «لا خلاص خذ راحتك».
 * - زر «خذ راحتك» (بالمرحلتين) هو الوحيد اللي يقفل — ويقفل معه كل التنويهات
 *   المفتوحة بالصفحة، وما يطلع بعده أي تنويه ثاني بنفس الزيارة
 *   (window.__agpNoticesDismissed + حدث 'agp:notices:dismiss-all').
 *   ESC والضغط برا ما يقفلون.
 *
 * لتنبيه جديد بالمستقبل: غيّر NOTICE_KEY والنص و WINDOW_START.
 * للمعاينة بدون ما ينحفظ وبدون شرط الوقت: games.html?notice=preview
 */
(function () {
    'use strict';

    var NOTICE_KEY = 'library-shy-update-1';
    // بداية النافذة بتوقيت السعودية (+03:00). null = موقّف (يطلع بالمعاينة بس).
    var WINDOW_START = new Date('2026-11-24T21:15:00+03:00').getTime(); // 9:15 مساءً بتوقيت السعودية
    var WINDOW_MINUTES = 30;
    // صورة المرحلة الأولى والثانية. لو ما تحمّلت تختفي ويطلع الإيموجي بدالها.
    var IMG = 'assets/notices/shy-update.jpg';
    var IMG_SURE = 'assets/notices/are-you-sure.jpg';

    var A = window.AGPAuth;
    var preview = /[?&]notice=preview\b/.test(location.search);

    function inWindow() {
        if (!WINDOW_START) return false;
        var now = Date.now();
        return now >= WINDOW_START && now < WINDOW_START + WINDOW_MINUTES * 60 * 1000;
    }

    function loggedIn() { return !!(A && A.getToken && A.getToken()); }
    function userId() {
        try { var u = loggedIn() && A.getCachedUser ? A.getCachedUser() : null; return u && u.id ? String(u.id) : ''; } catch (e) { return ''; }
    }
    function localKey() { return 'agp:notice:' + NOTICE_KEY + ':' + (userId() || 'guest'); }

    /** شافه قبل؟ لو التخزين مو متاح نعتبره شافه (ما نزعج أحد). */
    function seenLocally() {
        try { return localStorage.getItem(localKey()) === '1'; } catch (e) { return true; }
    }
    function markShown() {
        if (preview) return;
        try { localStorage.setItem(localKey(), '1'); } catch (e) {}
        if (loggedIn() && A.request) {
            A.request('/api/notices/seen', { method: 'POST', body: { key: NOTICE_KEY } }).catch(function () {});
        }
    }

    var CSS = '' +
        '.agp-ln-bg{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;direction:rtl;' +
        'background:radial-gradient(60% 50% at 50% 40%,rgba(124,58,237,.25),transparent 70%),rgba(4,3,8,.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'animation:agpLnBg .3s ease both;transition:opacity .45s ease}' +
        '.agp-ln-bg.is-out{opacity:0}' +
        '.agp-ln{position:relative;width:min(380px,100%);max-height:calc(100vh - 32px);overflow-y:auto;scrollbar-width:none;border-radius:32px;color:#f7f5fc;text-align:center;' +
        'padding:30px 22px 22px;box-sizing:border-box;background:#120d1d;font:500 15px/1.7 "IBM Plex Sans Arabic",system-ui,sans-serif;' +
        'box-shadow:0 50px 100px -30px rgba(0,0,0,1),0 0 0 1px rgba(255,255,255,.07),0 0 80px -20px rgba(168,85,247,.55);animation:agpLnIn .55s cubic-bezier(.22,1.2,.36,1) both}' +
        '.agp-ln::-webkit-scrollbar{display:none}' +
        '.agp-ln.has-img{padding-top:0}' +
        '.agp-ln-hero{display:block;width:calc(100% + 44px);margin:0 -22px;height:clamp(200px,36vh,290px);object-fit:cover;object-position:50% 30%;background:#1a1329;' +
        '-webkit-mask-image:linear-gradient(180deg,#000 60%,transparent);mask-image:linear-gradient(180deg,#000 60%,transparent)}' +
        '.agp-ln.has-img .agp-ln-emoji{display:none}' +
        '.agp-ln.has-img h3{margin-top:-18px;position:relative;text-shadow:0 4px 18px rgba(0,0,0,.6)}' +
        '.agp-ln-emoji{font-size:64px;line-height:1;display:inline-block;animation:agpLnWob 2.4s ease-in-out infinite}' +
        '.agp-ln h3{margin:14px 0 0;font:800 24px/1.4 "Noto Kufi Arabic","IBM Plex Sans Arabic",sans-serif}' +
        '.agp-ln h3 span{background:linear-gradient(90deg,#d8b4fe,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}' +
        '.agp-ln p{margin:10px 0 0;font-size:16px;line-height:1.85;color:#e2dcef}' +
        '.agp-ln p b{color:#fff}' +
        '.agp-ln-btns{display:flex;gap:10px;margin-top:20px}' +
        '.agp-ln-ok,.agp-ln-x{height:52px;border:none;border-radius:18px;cursor:pointer;font:800 16px "IBM Plex Sans Arabic",sans-serif;transition:transform .15s}' +
        '.agp-ln-ok:active,.agp-ln-x:active{transform:scale(.97)}' +
        '.agp-ln-ok{position:relative;overflow:hidden;flex:1.6;color:#fff;background:linear-gradient(135deg,#6d28d9,#a855f7 55%,#d8b4fe);' +
        'box-shadow:0 16px 34px -12px rgba(139,92,246,1),inset 0 1px 0 rgba(255,255,255,.35)}' +
        '.agp-ln-ok::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:agpLnSh 3s ease-in-out 1s infinite}' +
        '.agp-ln-x{flex:1;padding:0 18px;color:#cfc7e2;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}' +
        // زر الإغلاق بعد أول ضغطة يطلع من البطاقة ويصير ينط بالشاشة
        '.agp-ln-x.is-run{position:fixed;z-index:2147483101;flex:none;width:auto;background:#241a38;box-shadow:0 10px 30px -8px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.18);transition:left .28s cubic-bezier(.3,1.4,.5,1),top .28s cubic-bezier(.3,1.4,.5,1)}' +
        // المرحلة الثانية: «متأكد؟» فوق الصورة
        '.agp-ln.is-sure{padding-top:24px}' +
        '.agp-ln.is-sure h3{margin:0 0 14px;font-size:30px;text-shadow:none}' +
        '.agp-ln.is-sure .agp-ln-hero{width:100%;margin:0;border-radius:22px;-webkit-mask-image:none;mask-image:none}' +
        '@keyframes agpLnBg{from{opacity:0}to{opacity:1}}' +
        '@keyframes agpLnIn{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}' +
        '@keyframes agpLnSh{0%{left:-60%}45%,100%{left:130%}}' +
        '@keyframes agpLnWob{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg) translateY(-4px)}}' +
        '@media (prefers-reduced-motion:reduce){.agp-ln,.agp-ln-bg,.agp-ln-ok::after,.agp-ln-emoji{animation:none}}';

    function show() {
        if (document.getElementById('agp-ln-css')) return;
        var st = document.createElement('style');
        st.id = 'agp-ln-css';
        st.textContent = CSS;
        document.head.appendChild(st);

        var bg = document.createElement('div');
        bg.className = 'agp-ln-bg';
        bg.innerHTML = '<div class="agp-ln has-img" role="dialog" aria-modal="true" aria-labelledby="agp-ln-t">' +
            '<img class="agp-ln-hero" alt="" src="' + IMG + '">' +
            '<div class="agp-ln-emoji" aria-hidden="true">🙈</div>' +
            '<h3 id="agp-ln-t">عندي تحديث مدته <span>أقل من 10 دقايق</span></h3>' +
            '<p>ومستحي أصارحكم 🙈</p>' +
            '<div class="agp-ln-btns">' +
            '<button type="button" class="agp-ln-ok">خذ راحتك ماورانا شي</button>' +
            '<button type="button" class="agp-ln-x">لا خله بعدين</button>' +
            '</div></div>';

        var hero = bg.querySelector('.agp-ln-hero');
        hero.onerror = function () {
            hero.parentNode.classList.remove('has-img');
            hero.parentNode.removeChild(hero);
        };

        var x = bg.querySelector('.agp-ln-x');
        var card = bg.querySelector('.agp-ln');
        var sure = false;
        /** المرحلة الثانية: الصورة الثانية وفوقها «متأكد؟». */
        function toSure() {
            if (sure) return;
            sure = true;
            var h = card.querySelector('.agp-ln-hero');
            if (h) { card.classList.add('has-img'); h.src = IMG_SURE; }
            card.querySelector('.agp-ln-emoji').textContent = '🌹';
            card.querySelector('.agp-ln-ok').textContent = 'لا خلاص خذ راحتك';
            var t = card.querySelector('h3');
            t.innerHTML = '<span>متأكد؟</span>';
            card.classList.add('is-sure');
            if (h) card.insertBefore(t, h);
            var p = card.querySelector('p');
            if (p) p.parentNode.removeChild(p);
            card.style.animation = 'none';
            void card.offsetWidth;
            card.style.animation = '';
        }
        /** ينط زر الإغلاق لمكان عشوائي بالشاشة (بعيد عن مكانه الحالي). */
        function runAway(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            var r = x.getBoundingClientRect();
            if (!x.classList.contains('is-run')) {
                // نثبّته بمكانه الحالي أول، بعدين ننقله عشان تبان الحركة
                x.style.left = r.left + 'px';
                x.style.top = r.top + 'px';
                x.style.width = r.width + 'px';
                x.classList.add('is-run');
                // ننقله لطبقة الخلفية (بحجم الشاشة) — البطاقة فيها transform فتصير هي المرجع لـ fixed
                bg.appendChild(x);
                void x.offsetWidth;
            }
            var pad = 12;
            var maxX = Math.max(pad, window.innerWidth - r.width - pad);
            var maxY = Math.max(pad, window.innerHeight - r.height - pad);
            var nx, ny, tries = 0;
            do {
                nx = pad + Math.random() * (maxX - pad);
                ny = pad + Math.random() * (maxY - pad);
                tries++;
            } while (tries < 10 && Math.abs(nx - r.left) + Math.abs(ny - r.top) < 160);
            x.style.left = Math.round(nx) + 'px';
            x.style.top = Math.round(ny) + 'px';
            toSure();
        }
        x.addEventListener('pointerdown', runAway);
        x.addEventListener('click', runAway);

        // «خذ راحتك» يقفل هذا التنبيه وكل التنويهات المفتوحة، وما يطلع بعده شي بنفس الزيارة
        bg.querySelector('.agp-ln-ok').onclick = function () {
            window.__agpNoticesDismissed = true;
            try { document.dispatchEvent(new CustomEvent('agp:notices:dismiss-all')); } catch (e) {}
            bg.classList.add('is-out');
            x.style.opacity = '0';
            setTimeout(function () { if (bg.parentNode) bg.parentNode.removeChild(bg); }, 460);
        };
        // ESC ما يقفل — نوقفه عشان ما يوصل لأي مستمع ثاني بالصفحة
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && bg.parentNode) { e.preventDefault(); e.stopPropagation(); }
        }, true);
        document.body.appendChild(bg);
        // أول ما يطلع نحسبه — حتى لو سكّر الصفحة بدون ما يضغط
        markShown();
    }

    function start() {
        if (window.__agpNoticesDismissed) return;
        if (preview) { show(); return; }
        if (!inWindow() || seenLocally()) return;
        if (!loggedIn() || !A.request) { show(); return; }
        A.request('/api/notices/seen?key=' + encodeURIComponent(NOTICE_KEY)).then(function (r) {
            if (r && r.success && !r.seen) { if (inWindow() && !seenLocally()) show(); }
            else if (r && r.success) { try { localStorage.setItem(localKey(), '1'); } catch (e) {} }
        }).catch(function () {});
    }

    // بعد ما تستقر الصفحة شوي (المكتبة تبني محتواها بعد التحميل)
    function delayed() { setTimeout(start, 1200); }
    if (document.readyState !== 'loading') delayed(); else document.addEventListener('DOMContentLoaded', delayed);
}());
