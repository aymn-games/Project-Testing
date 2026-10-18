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

    window.StationNet = {
        connect: connect, patchClock: patchClock, wsUrl: wsUrl,
        hostSession: function (v) { if (arguments.length) writeJSON('station-host', v); else return readJSON('station-host'); },
        me: function (v) { if (arguments.length) writeJSON('station-me', v); else return readJSON('station-me'); },
        // توكن حساب الموقع (auth/auth-client.js) — الخادم يسمح بإنشاء الروم للأدمن فقط بمرحلة الاختبار
        authToken: function () { try { return window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null; } catch (e) { return null; } }
    };
})();
