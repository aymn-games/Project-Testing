/**
 * AGP LIVE WATCH — قطع الاتصال بالبث فعلياً لما ينتهي البث في تيك توك.
 *
 * مكتبة الألعاب (games.html) تحفظ الاتصال الموثَّق بـ localStorage
 * ('agp:agp-stream-connection') وكل الألعاب تقرأ منه. بدون هذا الملف كان
 * الاتصال يبقى "متصل" للأبد حتى لو البث انتهى. هنا:
 *
 *  1. فحص دوري (عند فتح الصفحة، كل دقيقة، وعند الرجوع للتبويب) عبر
 *     GET /api/stream/is-live (backend/platforms/tiktok/tiktok-live-check.js).
 *     الخادم يرجع true/false/null — نقطع فقط بعد false صريحة مرتين متتاليتين
 *     (بفاصل قصير)، عشان رد خاطئ مرة وحدة أو خطأ شبكة ما يفصل بثاً شغّالاً.
 *  2. إشعار فوري من الخادم أثناء اللعب: الموصِّل يبلّغ انتهاء البث
 *     (حدث streamEnd من تيك توك) → adapters/agp-tiktok-adapter.js يطلق
 *     'stream:liveEnded' → قطع فوري.
 *
 * عند القطع: يُمسح الاتصال المحفوظ (فتظهر "غير متصل" بالمكتبة وكل الألعاب)،
 * يُوقَف اتصال اللعبة بالبث، يُطلق window event 'agp:stream-ended'، وتظهر
 * رسالة فوق اللعبة مع زر "الرجوع لمكتبة الألعاب" (اللعبة تبقى مكانها).
 *
 * يُحمَّل بكل صفحة لعبة بعد auth/auth-client.js. مكتبة الألعاب تستخدم
 * AGPLiveWatch.start({ overlay: false, onEnded }) وتعرض حالتها بنفسها.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'agp:agp-stream-connection';
    var POLL_MS = 60000;
    var CONFIRM_DELAY_MS = 20000; // فحص ثاني بعد أول false قبل القطع
    var ROOT = (function () {
        var sc = document.currentScript;
        return sc && sc.src ? sc.src.replace(/js\/agp-live-watch\.js(\?.*)?$/, '') : '../../';
    }());

    var _opts = { overlay: true, onEnded: null };
    var _started = false;
    var _timer = null;
    var _confirmTimer = null;
    var _checking = false;
    var _ended = false;

    function saved() {
        try {
            var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return d && typeof d.username === 'string' && d.username ? d : null;
        } catch (e) { return null; }
    }

    function apiBase() {
        return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }

    /** @returns {Promise<boolean|null>} */
    function fetchLive(username) {
        var t = token();
        if (!t || !window.fetch) return Promise.resolve(null);
        return fetch(apiBase() + '/api/stream/is-live?username=' + encodeURIComponent(username), {
            headers: { 'Authorization': 'Bearer ' + t }
        }).then(function (res) {
            return res.json().then(function (d) {
                return d && d.success && (d.live === true || d.live === false) ? d.live : null;
            });
        }).catch(function () { return null; });
    }

    function check(confirming) {
        var conn = saved();
        if (!conn || _checking || _ended) return;
        _checking = true;
        fetchLive(conn.username).then(function (live) {
            _checking = false;
            var now = saved();
            if (!now || now.username !== conn.username) return; // تغيّر الاتصال أثناء الفحص
            if (live !== false) return;
            if (confirming) { end('not_live'); return; }
            clearTimeout(_confirmTimer);
            _confirmTimer = setTimeout(function () { check(true); }, CONFIRM_DELAY_MS);
        });
    }

    function end(reason) {
        if (_ended && reason !== 'stream_ended') return;
        var had = !!saved();
        _ended = true;
        clearTimeout(_confirmTimer);
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

        var AGP = window.AymanGamesPlatform;
        if (AGP && AGP.streamConnector && typeof AGP.streamConnector.disconnect === 'function') {
            try { AGP.streamConnector.disconnect('tiktok'); } catch (e) {}
        }
        try { window.dispatchEvent(new CustomEvent('agp:stream-ended', { detail: { reason: reason } })); } catch (e) {}
        if (typeof _opts.onEnded === 'function') _opts.onEnded(reason);
        if (_opts.overlay && (had || reason === 'stream_ended')) showOverlay();
    }

    function showOverlay() {
        if (document.getElementById('agp-live-ended')) return;
        if (!document.body) { document.addEventListener('DOMContentLoaded', showOverlay); return; }
        var wrap = document.createElement('div');
        wrap.id = 'agp-live-ended';
        wrap.setAttribute('dir', 'rtl');
        wrap.setAttribute('role', 'alertdialog');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif;';
        wrap.innerHTML =
            '<div style="width:min(420px,100%);box-sizing:border-box;padding:28px 24px;border-radius:24px;background:rgba(12,11,18,.97);border:1px solid rgba(248,113,113,.35);box-shadow:0 30px 90px rgba(0,0,0,.6);display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;color:#f4f2f8">' +
              '<span style="width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:rgba(248,113,113,.12);border:2px solid rgba(248,113,113,.5);color:#fca5a5;font-size:26px">●</span>' +
              '<span style="font-weight:700;font-size:21px">انتهى البث المباشر</span>' +
              '<span style="font-size:15px;line-height:1.7;color:#a8a3b5">البث في تيك توك انتهى أو صار غير نشط، وتم قطع الاتصال. ابدأ البث من جديد ثم اتصل من مكتبة الألعاب.</span>' +
              '<div style="display:grid;grid-template-columns:1fr auto;gap:10px;width:100%;margin-top:6px">' +
                '<a data-agp-live-back href="' + ROOT + 'games.html" style="height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;font-weight:700;font-size:15px">الرجوع لمكتبة الألعاب</a>' +
                '<button type="button" data-agp-live-close style="height:48px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e7e3ef;font:inherit;font-weight:700;font-size:15px;cursor:pointer">إغلاق</button>' +
              '</div>' +
            '</div>';
        wrap.querySelector('[data-agp-live-close]').addEventListener('click', function () { wrap.remove(); });
        document.body.appendChild(wrap);
    }

    function schedule() {
        clearInterval(_timer);
        _timer = setInterval(function () { if (!document.hidden) check(false); }, POLL_MS);
    }

    function start(opts) {
        if (opts) {
            if (opts.overlay === false) _opts.overlay = false;
            if (typeof opts.onEnded === 'function') _opts.onEnded = opts.onEnded;
        }
        if (_started) return;
        _started = true;
        check(false);
        schedule();
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(false); });
        // اتصال جديد من تبويب المكتبة (بعد ما رجع البث) → نرجع نراقب من جديد
        window.addEventListener('storage', function (e) {
            if (e.key === STORAGE_KEY && e.newValue) { _ended = false; check(false); }
        });
        // إشعار فوري من الخادم: انتهاء البث أثناء اتصال اللعبة
        var AGP = window.AymanGamesPlatform;
        if (AGP && AGP.events && typeof AGP.events.on === 'function') {
            AGP.events.on('stream:liveEnded', function () { end('stream_ended'); });
        }
    }

    window.AGPLiveWatch = {
        start: start,
        check: function () { check(false); },
        /** للمكتبة: بعد اتصال جديد ناجح نرجع نراقب. */
        reset: function () { _ended = false; clearTimeout(_confirmTimer); }
    };

    // صفحات الألعاب: تشغيل تلقائي (المكتبة تشغّله بنفسها بخيارات مختلفة)
    if (!(document.currentScript && document.currentScript.hasAttribute('data-manual'))) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(); });
        else start();
    }
}());
