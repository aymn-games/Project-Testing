/**
 * «محطة سهيل» — اتصال الشاشات بخادم اللعبة (backend/station/station-server.js).
 *
 * يحل محل BroadcastChannel + localStorage('station-room') بالنموذج. كل شاشة
 * تفتح اتصال WebSocket واحد عبر StationNet.connect، وعند كل (إعادة) اتصال
 * تستدعى onOpen عشان الشاشة ترسل host/resume/peek من جديد.
 *
 * التخزين المحلي (لكل جهاز):
 *   'station-host' → {code, token}   جلسة المذيع (يرجع لنفس الروم بعد التحديث)
 *   'station-me'   → {room, id, key} جلسة اللاعب
 *   'station-host-skin' و 'station-vol' كما بالنموذج.
 *
 * الساعة: مؤقتات المباراة تجي بتوقيت الخادم، فـ patchClock() يخلي Date.now
 * بالصفحة يرجع وقت الخادم (فرق الساعة يُحسب من كل state/pong).
 */
(function () {
    'use strict';

    var PROD_URL = 'wss://project-testing-akds.onrender.com/ws/station';

    function wsUrl() {
        var q = new URLSearchParams(location.search).get('ws');
        if (q) return q;
        var h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws/station';
        return PROD_URL;
    }

    function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
    function writeJSON(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

    // ---- فرق الساعة مع الخادم ----
    var _realNow = Date.now.bind(Date), samples = [], offset = 0;
    function noteServerNow(serverNow) {
        if (typeof serverNow !== 'number') return;
        samples.push(serverNow - _realNow()); if (samples.length > 30) samples.shift();
        // التأخير بالشبكة يقلل التقدير دائماً، فأكبر عيّنة حديثة هي الأقرب
        offset = Math.max.apply(null, samples);
    }
    function patchClock() { Date.now = function () { return _realNow() + offset; }; }

    function connect(onMessage, onOpen, onStatus) {
        var ws = null, closed = false, tries = 0, pingT = null, queue = [];
        function open() {
            if (closed) return;
            try { ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
            ws.onopen = function () {
                tries = 0; if (onStatus) onStatus(true);
                if (onOpen) onOpen();
                queue.splice(0).forEach(function (m) { ws.send(m); });
                clearInterval(pingT); pingT = setInterval(function () { send({ t: 'ping', k: _realNow() }); }, 15000);
                send({ t: 'ping', k: _realNow() });
            };
            ws.onmessage = function (e) {
                var m; try { m = JSON.parse(e.data); } catch (err) { return; }
                if (m && (m.t === 'state' || m.t === 'pong')) noteServerNow(m.now);
                if (m && m.t === 'pong') return;
                try { onMessage(m); } catch (err) { console.error(err); }
            };
            ws.onclose = function () { clearInterval(pingT); if (onStatus) onStatus(false); retry(); };
            ws.onerror = function () { };
        }
        function retry() { if (closed) return; tries++; setTimeout(open, Math.min(8000, 500 * Math.pow(1.6, tries))); }
        function send(obj) {
            var s = JSON.stringify(obj);
            if (ws && ws.readyState === 1) ws.send(s);
            else if (obj.t !== 'pos' && obj.t !== 'ping' && queue.length < 50) queue.push(s);
        }
        open();
        return { send: send, close: function () { closed = true; clearInterval(pingT); try { ws && ws.close(); } catch (e) { } } };
    }

    // ---- ملء الشاشة لجوالات اللاعبين ----
    // أندرويد: Fullscreen API + تثبيت الشاشة بالعرض. آيفون (سفاري) ما يدعم ملء الشاشة
    // للمواقع، فنعرض خطوة «إضافة إلى الشاشة الرئيسية» (الصفحات فيها apple-mobile-web-app-capable).
    // المتصفح يطلع من ملء الشاشة عند الانتقال بين الصفحات (اللوبي ← المباراة)، فنحفظ
    // اختيار اللاعب ('station-fs') ونرجّعه مع أول لمسة بالصفحة الجديدة.
    var FS_KEY = 'station-fs', leaving = false;
    function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function fsCan() { var d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
    // ملء الشاشة بالزر نفسه يطابق display-mode: fullscreen، فما نعتبره «شاشة رئيسية» إلا إذا ما فيه fullscreenElement
    function standalone() { try { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || (matchMedia('(display-mode: fullscreen)').matches && !fsEl()); } catch (e) { return false; } }
    function fsWant(v) { try { if (v) sessionStorage.setItem(FS_KEY, '1'); else sessionStorage.removeItem(FS_KEY); } catch (e) { } }
    function fsWanted() { try { return sessionStorage.getItem(FS_KEY) === '1'; } catch (e) { return false; } }
    function fsEnter() {
        var d = document.documentElement, req = d.requestFullscreen || d.webkitRequestFullscreen;
        if (!req) return;
        try {
            var r = req.call(d, { navigationUI: 'hide' });
            var lock = function () { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { }); } catch (e) { } };
            if (r && r.then) r.then(lock, function () { }); else lock();
        } catch (e) { }
    }
    function fsExit() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { } }
    function iosHint() {
        if (document.getElementById('station-fs-hint')) return;
        var m = document.createElement('div');
        m.id = 'station-fs-hint';
        m.setAttribute('role', 'dialog');
        m.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,7,13,.8);direction:rtl;font-family:Zain,sans-serif';
        m.innerHTML = '<div style="max-width:380px;width:100%;padding:18px 18px 14px;border-radius:16px;background:#1b2230;border:4px solid #06080d;box-shadow:0 5px 0 #06080d;color:#f4f2f8;text-align:center">' +
            '<div style="font:900 22px Zain;margin-bottom:8px">ملء الشاشة على الآيفون</div>' +
            '<div style="font:600 16px/1.7 Zain;color:#cbd5e1">سفاري ما يسمح بملء الشاشة للمواقع. اضغط زر المشاركة <b>⬆️</b> تحت ثم <b>«إضافة إلى الشاشة الرئيسية»</b>، وافتح اللعبة من الأيقونة الجديدة — تطلع بدون شريط المتصفح.</div>' +
            '<button type="button" style="margin-top:14px;width:100%;height:44px;border-radius:10px;border:3px solid #06080d;background:#14b8a6;color:#06080d;font:900 17px Zain;cursor:pointer">تمام</button></div>';
        m.addEventListener('click', function (e) { if (e.target === m || e.target.tagName === 'BUTTON') m.remove(); });
        document.body.appendChild(m);
    }
    var fs = {
        /** يظهر الزر؟ (مخفي إذا اللعبة مفتوحة أصلاً من أيقونة الشاشة الرئيسية) */
        show: function () { return !standalone(); },
        active: function () { return !!fsEl(); },
        toggle: function () {
            if (fsEl()) { fsWant(false); fsExit(); return; }
            if (!fsCan()) { iosHint(); return; }
            fsWant(true); fsEnter();
        },
        /** onChange: تُستدعى كل ما تغيّرت الحالة (لتحديث أيقونة الزر). */
        init: function (onChange) {
            var ev = function () { if (!fsEl() && !leaving) fsWant(false); if (onChange) onChange(); };
            document.addEventListener('fullscreenchange', ev); document.addEventListener('webkitfullscreenchange', ev);
            addEventListener('beforeunload', function () { leaving = true; }); addEventListener('pagehide', function () { leaving = true; });
            var resume = function (e) {
                if (fsWanted() && !fsEl() && fsCan() && !(e.target && e.target.closest && e.target.closest('[data-fs-btn]'))) fsEnter();
                removeEventListener('pointerdown', resume, true);
            };
            addEventListener('pointerdown', resume, true);
        }
    };

    window.StationNet = {
        connect: connect, patchClock: patchClock, wsUrl: wsUrl, fs: fs,
        hostSession: function (v) { if (arguments.length) writeJSON('station-host', v); else return readJSON('station-host'); },
        me: function (v) { if (arguments.length) writeJSON('station-me', v); else return readJSON('station-me'); },
        // توكن حساب الموقع (auth/auth-client.js) — الخادم يسمح بإنشاء الروم للأدمن فقط بمرحلة الاختبار
        authToken: function () { try { return window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null; } catch (e) { return null; } }
    };
})();
