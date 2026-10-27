/**
 * «المافيا» — اتصال الشاشات بخادم اللعبة (backend/mafia/mafia-server.js).
 * نفس أسلوب games/intruder/station-net.js: اتصال WebSocket واحد يعيد الاتصال
 * تلقائياً، وعند كل (إعادة) اتصال تُستدعى onOpen عشان الشاشة ترسل host/resume.
 *
 * التخزين المحلي: 'mafia-host' → {code, token} · 'mafia-me' → {room, id, key}
 * now() يرجع وقت الخادم (فرق الساعة من كل state/pong) عشان المؤقتات والمشاهد تتزامن.
 */
(function () {
    'use strict';

    var PROD_URL = 'wss://project-testing-akds.onrender.com/ws/mafia';

    function wsUrl() {
        var q = new URLSearchParams(location.search).get('ws');
        if (q) return q;
        var h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws/mafia';
        return PROD_URL;
    }

    function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
    function writeJSON(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

    var samples = [], offset = 0;
    function noteServerNow(serverNow) {
        if (typeof serverNow !== 'number') return;
        samples.push(serverNow - Date.now()); if (samples.length > 30) samples.shift();
        offset = Math.max.apply(null, samples);
    }

    function connect(onMessage, onOpen, onStatus) {
        var ws = null, closed = false, tries = 0, pingT = null, queue = [];
        function open() {
            if (closed) return;
            try { ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
            ws.onopen = function () {
                tries = 0; if (onStatus) onStatus(true);
                if (onOpen) onOpen();
                queue.splice(0).forEach(function (m) { ws.send(m); });
                clearInterval(pingT); pingT = setInterval(function () { send({ t: 'ping', k: Date.now() }); }, 15000);
                send({ t: 'ping', k: Date.now() });
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
            else if (obj.t !== 'ping' && queue.length < 50) queue.push(s);
        }
        open();
        return { send: send, close: function () { closed = true; clearInterval(pingT); try { ws && ws.close(); } catch (e) { } } };
    }

    window.MafiaNet = {
        connect: connect, wsUrl: wsUrl,
        now: function () { return Date.now() + offset; },
        hostSession: function (v) { if (arguments.length) writeJSON('mafia-host', v); else return readJSON('mafia-host'); },
        me: function (v) { if (arguments.length) writeJSON('mafia-me', v); else return readJSON('mafia-me'); },
        look: function (v) { if (arguments.length) writeJSON('mafia-look', v); else return readJSON('mafia-look'); },
        authToken: function () { try { return window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null; } catch (e) { return null; } }
    };
})();
