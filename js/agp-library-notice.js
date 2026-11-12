/**
 * تنبيه «مرة وحدة» بمكتبة الألعاب (games.html) — «السن بالسن والبادي أظلم».
 *
 * بطاقة: الصورة أعلى البطاقة، العنوان والرسالة تحتها، وزر «فهمت» يقفل النافذة
 * ويرجّع المستخدم لأول صف بالمكتبة (قسم الألعاب الجديدة #gl-upd، ولو مو موجود
 * فشبكة الألعاب .gl-grid).
 *
 * التنبيهات القديمة (إطلاق «التحكم عن بعد» و«تنويه التعليق المؤقت») موقّفة.
 *
 * يطلع مرتين بس لكل شخص، وبين المرتين 20 دقيقة على الأقل، وبعدها ما يطلع أبداً:
 *  - العدّاد ووقت آخر مرة بالمتصفح (localStorage 'agp:notice:<KEY>:<user id|guest>' = {n, t}).
 *  - مسجّل دخول: بعد المرة الثانية ينحفظ بحسابه بالسيرفر (GET/POST /api/notices/seen —
 *    backend/notices/seen-notices.js)، فما يطلع له بعدها حتى من جهاز ثاني.
 * أي خطأ بالشبكة ← ما نطلّعه (ما نزعج أحد بتنبيه زيادة).
 *
 * لتنبيه جديد بالمستقبل: غيّر NOTICE_KEY والنص والصورة.
 * للمعاينة بدون ما ينحفظ: games.html?notice=preview
 */
(function () {
    'use strict';

    var NOTICE_KEY = 'library-tooth-for-tooth';
    var MAX_TIMES = 2;
    var GAP_MS = 20 * 60 * 1000;
    var IMG = 'assets/notices/check-new-games.jpg';

    var A = window.AGPAuth;
    var preview = /[?&]notice=preview\b/.test(location.search);

    function loggedIn() { return !!(A && A.getToken && A.getToken()); }
    function userId() {
        try { var u = loggedIn() && A.getCachedUser ? A.getCachedUser() : null; return u && u.id ? String(u.id) : ''; } catch (e) { return ''; }
    }
    function localKey() { return 'agp:notice:' + NOTICE_KEY + ':' + (userId() || 'guest'); }

    /** {n: كم مرة طلع، t: وقت آخر مرة} — لو التخزين مو متاح نرجع null (ما نطلّعه). */
    function readState() {
        try { var st = JSON.parse(localStorage.getItem(localKey()) || '{}') || {}; return { n: +st.n || 0, t: +st.t || 0 }; }
        catch (e) { return null; }
    }
    function writeState(st) { try { localStorage.setItem(localKey(), JSON.stringify(st)); return true; } catch (e) { return false; } }
    function canShow(st) { return !!st && st.n < MAX_TIMES && Date.now() - st.t >= GAP_MS; }

    /** نحسب المرة؛ وبعد المرة الأخيرة نحفظها بالحساب عشان ما يطلع بعدها من أي جهاز. */
    function markShown() {
        if (preview) return;
        var st = readState() || { n: 0, t: 0 };
        st = { n: st.n + 1, t: Date.now() };
        writeState(st);
        if (st.n >= MAX_TIMES && loggedIn() && A.request) {
            A.request('/api/notices/seen', { method: 'POST', body: { key: NOTICE_KEY } }).catch(function () {});
        }
    }

    var CSS = '' +
        '.agp-ln-bg{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;direction:rtl;' +
        'background:radial-gradient(60% 50% at 50% 40%,rgba(124,58,237,.25),transparent 70%),rgba(4,3,8,.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'animation:agpLnBg .3s ease both;transition:opacity .45s ease}' +
        '.agp-ln-bg.is-out{opacity:0}' +
        '.agp-ln{position:relative;width:min(380px,100%);max-height:calc(100vh - 32px);overflow-y:auto;scrollbar-width:none;border-radius:32px;color:#f7f5fc;text-align:center;' +
        'background:#120d1d;font:500 15px/1.7 "IBM Plex Sans Arabic",system-ui,sans-serif;' +
        'box-shadow:0 50px 100px -30px rgba(0,0,0,1),0 0 0 1px rgba(255,255,255,.07),0 0 80px -20px rgba(168,85,247,.55);animation:agpLnIn .55s cubic-bezier(.22,1.2,.36,1) both}' +
        '.agp-ln::-webkit-scrollbar{display:none}' +
        '.agp-ln-hero{position:relative;height:clamp(200px,36vh,290px);background:#1a1329 50% 35%/cover no-repeat}' +
        '.agp-ln-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,13,29,0) 45%,rgba(18,13,29,.6) 75%,#120d1d 100%)}' +
        '.agp-ln-body{position:relative;z-index:1;margin-top:-40px;padding:0 22px 22px}' +
        '.agp-ln h3{margin:0;font:800 24px/1.4 "Noto Kufi Arabic","IBM Plex Sans Arabic",sans-serif;text-shadow:0 4px 18px rgba(0,0,0,.6)}' +
        '.agp-ln h3 span{background:linear-gradient(90deg,#d8b4fe,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}' +
        '.agp-ln p{margin:10px 0 0;font-size:16px;line-height:1.85;color:#e2dcef}' +
        '.agp-ln p b{color:#fff}' +
        '.agp-ln-ok{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;margin-top:18px;border:none;border-radius:18px;cursor:pointer;color:#fff;' +
        'font:800 16px "IBM Plex Sans Arabic",sans-serif;background:linear-gradient(135deg,#6d28d9,#a855f7 55%,#d8b4fe);' +
        'box-shadow:0 16px 34px -12px rgba(139,92,246,1),inset 0 1px 0 rgba(255,255,255,.35);transition:transform .15s}' +
        '.agp-ln-ok:active{transform:scale(.97)}' +
        '.agp-ln-ok::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:agpLnSh 3s ease-in-out 1s infinite}' +
        '.agp-ln-ok i{font-style:normal;display:inline-block;animation:agpLnUp 1.2s ease-in-out infinite}' +
        '@keyframes agpLnBg{from{opacity:0}to{opacity:1}}' +
        '@keyframes agpLnIn{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}' +
        '@keyframes agpLnSh{0%{left:-60%}45%,100%{left:130%}}' +
        '@keyframes agpLnUp{50%{transform:translateY(-4px)}}' +
        '@media (prefers-reduced-motion:reduce){.agp-ln,.agp-ln-bg,.agp-ln-ok::after,.agp-ln-ok i{animation:none}}';

    /** أول صف بالمكتبة: قسم الألعاب الجديدة فوق، ولو مو موجود فشبكة الألعاب. */
    function goToFirstRow() {
        var el = document.getElementById('gl-upd') || document.querySelector('.gl-grid');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function show() {
        if (document.getElementById('agp-ln-css')) return;
        var st = document.createElement('style');
        st.id = 'agp-ln-css';
        st.textContent = CSS;
        document.head.appendChild(st);

        var bg = document.createElement('div');
        bg.className = 'agp-ln-bg';
        bg.innerHTML = '<div class="agp-ln" role="dialog" aria-modal="true" aria-labelledby="agp-ln-t">' +
            '<div class="agp-ln-hero" role="img" aria-label="" style="background-image:url(' + IMG + ')"></div>' +
            '<div class="agp-ln-body">' +
            '<h3 id="agp-ln-t">مثل ما قالوا:<br><span>السن بالسن والبادي أظلم</span></h3>' +
            '<p>ماعلينا 😏<br><b>شيك الألعاب اللي نزلت فوق</b></p>' +
            '<button type="button" class="agp-ln-ok">فهمت <i>☝️</i></button>' +
            '</div></div>';

        function remove() {
            document.removeEventListener('keydown', onKey);
            bg.classList.add('is-out');
            setTimeout(function () { if (bg.parentNode) bg.parentNode.removeChild(bg); }, 460);
        }
        function onKey(e) { if (e.key === 'Escape') remove(); }
        bg.querySelector('.agp-ln-ok').onclick = function () { remove(); goToFirstRow(); };
        bg.addEventListener('click', function (e) { if (e.target === bg) remove(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(bg);
        // أول ما يطلع نحسبها مرة — حتى لو سكّر الصفحة بدون ما يضغط
        markShown();
    }

    function start() {
        if (preview) { show(); return; }
        var st = readState();
        if (!canShow(st)) return;
        if (!loggedIn() || !A.request) { show(); return; }
        A.request('/api/notices/seen?key=' + encodeURIComponent(NOTICE_KEY)).then(function (r) {
            if (r && r.success && !r.seen) { if (canShow(readState())) show(); }
            else if (r && r.success) writeState({ n: MAX_TIMES, t: Date.now() });
        }).catch(function () {});
    }

    // بعد ما تستقر الصفحة شوي (المكتبة تبني محتواها بعد التحميل)
    function delayed() { setTimeout(start, 1200); }
    if (document.readyState !== 'loading') delayed(); else document.addEventListener('DOMContentLoaded', delayed);
}());
