/**
 * تنبيه «مرة وحدة» بمكتبة الألعاب (games.html) — إطلاق «التحكم عن بعد».
 *
 * بطاقة «ستوري»: الصورة أعلى البطاقة والعنوان فوقها، رسالة بشكل فقاعة شات،
 * بطاقة الميزة بثلاث مزايا، وزرين: «جرّبها الحين» (البروفايل) و«بعدين».
 * «بعدين» يطلّع صورة القطو مكتوب عليها «لا تنسى» 5 ثواني وبعدها تختفي النافذة.
 *
 * يطلع مرة وحدة بس لكل شخص:
 *  - مسجّل دخول: محفوظ بحسابه بالسيرفر (GET/POST /api/notices/seen —
 *    backend/notices/seen-notices.js)، فما يطلع له مرة ثانية حتى من جهاز ثاني.
 *  - بدون حساب: محفوظ بالمتصفح (localStorage).
 * أي خطأ بالشبكة ← ما نطلّعه (ما نزعج أحد بتنبيه مكرر).
 *
 * لتنبيه جديد بالمستقبل: غيّر NOTICE_KEY والنص والصور.
 * للمعاينة بدون ما ينحفظ: games.html?notice=preview
 */
(function () {
    'use strict';

    var NOTICE_KEY = 'library-remote-control-launch';
    var LOCAL_KEY = 'agp:notice:' + NOTICE_KEY;
    var IMG = 'assets/notices/remote-control-launch.jpg';
    var LATER_IMG = 'assets/notices/dont-forget.jpg';
    var LATER_MS = 5000;
    var TRY_URL = 'profile.html';

    var A = window.AGPAuth;
    var preview = /[?&]notice=preview\b/.test(location.search);

    function localSeen() { try { return localStorage.getItem(LOCAL_KEY) === '1'; } catch (e) { return false; } }
    function setLocalSeen() { try { localStorage.setItem(LOCAL_KEY, '1'); } catch (e) {} }
    function loggedIn() { return !!(A && A.getToken && A.getToken()); }

    function markSeen() {
        if (preview) return;
        setLocalSeen();
        if (loggedIn() && A.request) A.request('/api/notices/seen', { method: 'POST', body: { key: NOTICE_KEY } }).catch(function () {});
    }

    var CSS = '' +
        '.agp-ln-bg{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;direction:rtl;' +
        'background:radial-gradient(60% 50% at 50% 40%,rgba(124,58,237,.25),transparent 70%),rgba(4,3,8,.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'animation:agpLnBg .3s ease both;transition:opacity .45s ease}' +
        '.agp-ln-bg.is-out{opacity:0}' +
        '.agp-ln{position:relative;width:min(400px,100%);max-height:calc(100vh - 32px);overflow-y:auto;scrollbar-width:none;border-radius:32px;color:#f7f5fc;text-align:right;' +
        'background:#120d1d;font:500 15px/1.7 "IBM Plex Sans Arabic",system-ui,sans-serif;' +
        'box-shadow:0 50px 100px -30px rgba(0,0,0,1),0 0 0 1px rgba(255,255,255,.07),0 0 80px -20px rgba(168,85,247,.55);animation:agpLnIn .55s cubic-bezier(.22,1.2,.36,1) both}' +
        '.agp-ln::-webkit-scrollbar{display:none}' +
        '.agp-ln-hero{position:relative;height:clamp(170px,30vh,240px);background:#1a1329 50% 30%/cover no-repeat}' +
        '.agp-ln-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,13,29,0) 35%,rgba(18,13,29,.55) 70%,#120d1d 100%)}' +
        '.agp-ln-x{position:absolute;top:14px;left:14px;z-index:2;width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:15px;' +
        'background:rgba(10,7,18,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
        '.agp-ln-new{position:absolute;top:16px;right:16px;z-index:2;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;' +
        'background:linear-gradient(135deg,#7c3aed,#c084fc);box-shadow:0 8px 20px -6px rgba(168,85,247,.9)}' +
        '.agp-ln-new i{width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 8px #fff;animation:agpLnP 1.6s infinite}' +
        '.agp-ln-body{position:relative;z-index:1;margin-top:-54px;padding:0 20px 14px}' +
        '.agp-ln h3{margin:0;font:800 23px/1.35 "Noto Kufi Arabic","IBM Plex Sans Arabic",sans-serif;text-shadow:0 4px 18px rgba(0,0,0,.6)}' +
        '.agp-ln-bubble{display:inline-block;margin:14px 0 0;padding:11px 15px;border-radius:20px 20px 6px 20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);font-size:14.5px;line-height:1.75;color:#e7e1f3}' +
        '.agp-ln-bubble small{display:block;margin-top:2px;color:#8f88a3;font-size:11px}' +
        '.agp-ln-feat{margin:14px 0 0;padding:14px;border-radius:22px;background:linear-gradient(160deg,rgba(124,58,237,.22),rgba(124,58,237,.05));border:1px solid rgba(192,132,252,.25)}' +
        '.agp-ln-feat .t{display:flex;align-items:center;gap:8px;font:700 15px "Noto Kufi Arabic","IBM Plex Sans Arabic",sans-serif;color:#efe7ff}' +
        '.agp-ln-feat .t span{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#a855f7);font-size:15px}' +
        '.agp-ln-feat p{margin:8px 0 12px;font-size:14px;line-height:1.8;color:#d6cfe6}' +
        '.agp-ln-feat p b{color:#fff}' +
        '.agp-ln-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}' +
        '.agp-ln-chip{padding:9px 4px;border-radius:14px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.07);text-align:center;font-size:11.5px;font-weight:600;color:#cfc6e3;line-height:1.5}' +
        '.agp-ln-chip em{display:block;font-style:normal;font-size:17px;margin-bottom:2px}' +
        '.agp-ln-go{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;height:52px;margin-top:14px;border-radius:18px;color:#fff;text-decoration:none;font-weight:800;font-size:16px;' +
        'background:linear-gradient(135deg,#6d28d9,#a855f7 55%,#d8b4fe);box-shadow:0 16px 34px -12px rgba(139,92,246,1),inset 0 1px 0 rgba(255,255,255,.35);transition:transform .15s}' +
        '.agp-ln-go:active{transform:scale(.97)}' +
        '.agp-ln-go::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:agpLnSh 3s ease-in-out 1s infinite}' +
        '.agp-ln-later{display:block;width:100%;margin-top:4px;height:40px;border:none;background:none;cursor:pointer;color:#a59fb7;font:600 14px "IBM Plex Sans Arabic",sans-serif}' +
        // شاشة «لا تنسى»: صورة القطو بالبطاقة كاملة، والكتابة عليها، وشريط 5 ثواني
        '.agp-ln-nf{position:relative;height:min(470px,calc(100vh - 32px));background:#000 50% 40%/cover no-repeat;animation:agpLnPop .45s cubic-bezier(.22,1.3,.36,1) both}' +
        '.agp-ln-nf::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(10,6,18,.85) 100%)}' +
        '.agp-ln-nf b{position:absolute;z-index:1;left:0;right:0;bottom:44px;text-align:center;font:900 46px/1.2 "Noto Kufi Arabic","IBM Plex Sans Arabic",sans-serif;color:#fff;' +
        'text-shadow:0 4px 0 #6d28d9,0 10px 30px rgba(0,0,0,.8);animation:agpLnShake .6s ease .35s both}' +
        '.agp-ln-nf i{position:absolute;z-index:1;left:22px;right:22px;bottom:20px;height:5px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}' +
        '.agp-ln-nf i::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,#c084fc,#7c3aed);transform-origin:right;animation:agpLnBar ' + (LATER_MS / 1000) + 's linear both}' +
        '@keyframes agpLnBg{from{opacity:0}to{opacity:1}}' +
        '@keyframes agpLnIn{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}' +
        '@keyframes agpLnP{50%{opacity:.3}}' +
        '@keyframes agpLnSh{0%{left:-60%}45%,100%{left:130%}}' +
        '@keyframes agpLnPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}' +
        '@keyframes agpLnShake{0%{opacity:0;transform:scale(1.6)}60%{opacity:1;transform:scale(.95) rotate(-3deg)}80%{transform:scale(1.04) rotate(2deg)}100%{transform:none}}' +
        '@keyframes agpLnBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
        '@media (prefers-reduced-motion:reduce){.agp-ln,.agp-ln-bg,.agp-ln-go::after,.agp-ln-new i,.agp-ln-nf,.agp-ln-nf b{animation:none}}';

    function show() {
        if (document.getElementById('agp-ln-css')) return;
        var st = document.createElement('style');
        st.id = 'agp-ln-css';
        st.textContent = CSS;
        document.head.appendChild(st);
        // صورة «لا تنسى» تنحمّل من الحين عشان تطلع على طول لو ضغط «بعدين»
        new Image().src = LATER_IMG;

        var bg = document.createElement('div');
        bg.className = 'agp-ln-bg';
        bg.innerHTML = '<div class="agp-ln" role="dialog" aria-modal="true" aria-labelledby="agp-ln-t">' +
            '<div class="agp-ln-hero" style="background-image:url(' + IMG + ')">' +
            '<button type="button" class="agp-ln-x" aria-label="إغلاق">✕</button>' +
            '<span class="agp-ln-new"><i></i>ميزة جديدة</span></div>' +
            '<div class="agp-ln-body">' +
            '<h3 id="agp-ln-t">علق الموقع معك<br>يا حلو صح؟</h3>' +
            '<div class="agp-ln-bubble">آسفين، بس ضفت ميزة جديدة.. جرّبها وعطني رأيك 😄<small>— فريق ألعاب أيمن</small></div>' +
            '<div class="agp-ln-feat"><div class="t"><span>🎮</span>التحكم عن بعد</div>' +
            '<p><b>باختصار:</b> صار يمديك تنشغل عن بثك وما تشيل هم.. الشات ما يطفش!</p>' +
            '<div class="agp-ln-chips"><div class="agp-ln-chip"><em>📱</em>من جوال صاحبك</div><div class="agp-ln-chip"><em>💬</em>بأوامر الشات</div><div class="agp-ln-chip"><em>⚡</em>كل الألعاب</div></div></div>' +
            '<a class="agp-ln-go" href="' + TRY_URL + '">جرّبها الحين ←</a>' +
            '<button type="button" class="agp-ln-later">بعدين</button>' +
            '</div></div>';

        var timer = 0;
        function remove() {
            clearTimeout(timer);
            document.removeEventListener('keydown', onKey);
            bg.classList.add('is-out');
            setTimeout(function () { if (bg.parentNode) bg.parentNode.removeChild(bg); }, 460);
        }
        function onKey(e) { if (e.key === 'Escape') remove(); }
        /** «بعدين» → صورة القطو و«لا تنسى» 5 ثواني، بعدها تختفي النافذة كلها. */
        function later() {
            var card = bg.querySelector('.agp-ln');
            card.innerHTML = '<div class="agp-ln-nf" role="img" aria-label="لا تنسى" style="background-image:url(' + LATER_IMG + ')"><b>لا تنسى!</b><i></i></div>';
            card.scrollTop = 0;
            timer = setTimeout(remove, LATER_MS);
        }
        bg.querySelector('.agp-ln-x').onclick = remove;
        bg.querySelector('.agp-ln-later').onclick = later;
        bg.addEventListener('click', function (e) { if (e.target === bg) remove(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(bg);
        // أول ما يطلع نعتبره «انشاف» — لو سكّر الصفحة بدون ما يضغط، ما يطلع له مرة ثانية
        markSeen();
    }

    /**
     * تنويه ثاني بالمكتبة («تنويه التعليق المؤقت» — #agp-freeze-notice بـgames.html) ممكن يكون
     * مفتوح: ننتظره يتقفل وبعدها نطلّع تنبيهنا، عشان ما تطلع نافذتين فوق بعض.
     */
    function whenClear(fn) {
        if (!document.getElementById('agp-freeze-notice')) { fn(); return; }
        var t = setInterval(function () {
            if (document.getElementById('agp-freeze-notice')) return;
            clearInterval(t);
            setTimeout(fn, 500);
        }, 400);
    }

    function start() {
        if (preview) { show(); return; }
        if (localSeen()) return;
        if (!loggedIn() || !A.request) { whenClear(show); return; }
        A.request('/api/notices/seen?key=' + encodeURIComponent(NOTICE_KEY)).then(function (r) {
            if (r && r.success && !r.seen) whenClear(show);
            else if (r && r.success) setLocalSeen();
        }).catch(function () {});
    }

    // بعد ما تستقر الصفحة شوي (المكتبة تبني محتواها بعد التحميل)
    function delayed() { setTimeout(start, 1200); }
    if (document.readyState !== 'loading') delayed(); else document.addEventListener('DOMContentLoaded', delayed);
}());
