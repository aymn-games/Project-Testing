/**
 * تنبيه «مرة وحدة» بمكتبة الألعاب (games.html) — إطلاق «التحكم عن بعد».
 *
 * يطلع مرة وحدة بس لكل شخص:
 *  - مسجّل دخول: محفوظ بحسابه بالسيرفر (GET/POST /api/notices/seen —
 *    backend/notices/seen-notices.js)، فما يطلع له مرة ثانية حتى من جهاز ثاني.
 *  - بدون حساب: محفوظ بالمتصفح (localStorage).
 * أي خطأ بالشبكة ← ما نطلّعه (ما نزعج أحد بتنبيه مكرر).
 *
 * لتنبيه جديد بالمستقبل: غيّر NOTICE_KEY والنص والصورة.
 * للمعاينة بدون ما ينحفظ: games.html?notice=preview
 */
(function () {
    'use strict';

    var NOTICE_KEY = 'library-remote-control-launch';
    var LOCAL_KEY = 'agp:notice:' + NOTICE_KEY;
    var IMG = 'assets/notices/remote-control-launch.jpg';
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
        '.agp-ln-bg{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;' +
        'background:rgba(4,3,8,.66);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);direction:rtl;animation:agpLnBg .3s ease both}' +
        '.agp-ln{position:relative;width:min(420px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:24px 22px 20px;border-radius:28px;text-align:center;' +
        'background:radial-gradient(120% 70% at 50% -10%,rgba(139,92,246,.35),transparent 60%),linear-gradient(180deg,#1a1329,#0e0a17);' +
        'border:1px solid rgba(192,132,252,.28);color:#f6f4fb;font:500 15px/1.8 "IBM Plex Sans Arabic",system-ui,sans-serif;' +
        'box-shadow:0 40px 90px -30px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.03) inset;animation:agpLnIn .5s cubic-bezier(.22,1.2,.36,1) both}' +
        '.agp-ln-x{position:absolute;top:14px;left:14px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#cfc8de;font-size:15px;cursor:pointer}' +
        '.agp-ln-img{display:block;width:150px;height:150px;margin:6px auto 16px;border-radius:50%;object-fit:cover;object-position:50% 35%;' +
        'border:4px solid rgba(255,255,255,.08);box-shadow:0 0 0 4px rgba(168,85,247,.45),0 18px 40px -12px rgba(139,92,246,.9);animation:agpLnWob 2.8s ease-in-out .6s infinite}' +
        '.agp-ln h3{margin:0 0 10px;font:700 21px/1.5 "Noto Kufi Arabic","IBM Plex Sans Arabic",sans-serif}' +
        '.agp-ln p{margin:0 0 8px;color:#d9d3e8}' +
        '.agp-ln .agp-ln-tag{display:inline-block;margin:4px 0 12px;padding:5px 14px;border-radius:999px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.35);color:#a7f3d0;font-size:13px;font-weight:700}' +
        '.agp-ln-short{margin:12px 0 18px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#ece7f7;font-weight:600}' +
        '.agp-ln-short b{color:#d8b4fe}' +
        '.agp-ln-btns{display:flex;flex-direction:column;gap:8px}' +
        '.agp-ln-btn{height:50px;border-radius:16px;border:none;cursor:pointer;font:700 15px "IBM Plex Sans Arabic",sans-serif;text-decoration:none;display:flex;align-items:center;justify-content:center;transition:transform .15s}' +
        '.agp-ln-btn:active{transform:scale(.97)}' +
        '.agp-ln-go{color:#fff;background:linear-gradient(135deg,#7c3aed,#a855f7 55%,#c084fc);box-shadow:0 14px 30px -12px rgba(139,92,246,.95),inset 0 1px 0 rgba(255,255,255,.3)}' +
        '.agp-ln-ok{color:#ddd6fe;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}' +
        '@keyframes agpLnBg{from{opacity:0}to{opacity:1}}' +
        '@keyframes agpLnIn{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}' +
        '@keyframes agpLnWob{0%,100%{transform:rotate(0)}50%{transform:rotate(-4deg) scale(1.03)}}' +
        '@media (prefers-reduced-motion:reduce){.agp-ln,.agp-ln-bg,.agp-ln-img{animation:none}}';

    function show() {
        if (document.getElementById('agp-ln-css')) return;
        var st = document.createElement('style');
        st.id = 'agp-ln-css';
        st.textContent = CSS;
        document.head.appendChild(st);

        var bg = document.createElement('div');
        bg.className = 'agp-ln-bg';
        bg.innerHTML = '<div class="agp-ln" role="dialog" aria-modal="true" aria-labelledby="agp-ln-t">' +
            '<button type="button" class="agp-ln-x" aria-label="إغلاق">✕</button>' +
            '<img class="agp-ln-img" src="' + IMG + '" alt="">' +
            '<h3 id="agp-ln-t">علق الموقع معك يا حلو صح؟</h3>' +
            '<p>آسفين، بس ضفت ميزة جديدة.. جرّبها وعطني رأيك 😄</p>' +
            '<span class="agp-ln-tag">🎮 جديد: التحكم عن بعد</span>' +
            '<div class="agp-ln-short"><b>باختصار:</b> صار يمديك تنشغل عن بثك وما تشيل هم.. الشات ما يطفش!</div>' +
            '<div class="agp-ln-btns"><a class="agp-ln-btn agp-ln-go" href="' + TRY_URL + '">جرّبها الحين</a>' +
            '<button type="button" class="agp-ln-btn agp-ln-ok">تمام</button></div>' +
            '</div>';
        function close() { markSeen(); if (bg.parentNode) bg.parentNode.removeChild(bg); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        bg.querySelector('.agp-ln-x').onclick = close;
        bg.querySelector('.agp-ln-ok').onclick = close;
        bg.querySelector('.agp-ln-go').onclick = function () { markSeen(); };
        bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(bg);
        // أول ما يطلع نعتبره «انشاف» — لو سكّر الصفحة بدون ما يضغط، ما يطلع له مرة ثانية
        markSeen();
    }

    function start() {
        if (preview) { show(); return; }
        if (localSeen()) return;
        if (!loggedIn() || !A.request) { show(); return; }
        A.request('/api/notices/seen?key=' + encodeURIComponent(NOTICE_KEY)).then(function (r) {
            if (r && r.success && !r.seen) show();
            else if (r && r.success) setLocalSeen();
        }).catch(function () {});
    }

    // بعد ما تستقر الصفحة شوي (المكتبة تبني محتواها بعد التحميل)
    function later() { setTimeout(start, 1200); }
    if (document.readyState !== 'loading') later(); else document.addEventListener('DOMContentLoaded', later);
}());
