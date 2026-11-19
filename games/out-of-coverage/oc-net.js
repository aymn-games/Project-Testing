/**
 * «خارج التغطية» — اتصال الشاشات بخادم اللعبة (backend/coverage/coverage-server.js).
 * نفس أسلوب games/mafia/mafia-net.js: اتصال WebSocket واحد يعيد الاتصال تلقائياً،
 * وعند كل (إعادة) اتصال تُستدعى onOpen عشان الشاشة ترسل host/resume.
 *
 * التخزين المحلي: 'oc-host' → {code, token} · 'oc-me' → {room, id, key, name} · 'oc-setup' → الإعدادات
 * now() يرجع وقت الخادم (فرق الساعة من كل state/pong) عشان العدّادات تتزامن بين كل الأجهزة.
 *
 * نسخة التجربة المحلية (بدون خادم) تعرّف window.OCLocalTransport قبل هذا الملف، فيمر
 * الاتصال من خلالها بدل WebSocket — نفس الرسائل بالضبط.
 */
(function () {
    'use strict';

    var PROD_URL = 'wss://project-testing-akds.onrender.com/ws/coverage';
    function wsUrl() {
        var q = new URLSearchParams(location.search).get('ws');
        if (q) return q;
        var h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8787/ws/coverage';
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

    var PING_MS = 8000, DEAD_MS = 20000;
    function connect(onMessage, onOpen, onStatus) {
        var ws = null, closed = false, tries = 0, pingT = null, retryT = null, queue = [], lastRx = 0;
        function open() {
            if (closed) return;
            clearTimeout(retryT); retryT = null;
            var sock;
            try { sock = ws = window.OCLocalTransport ? window.OCLocalTransport() : new WebSocket(wsUrl()); } catch (e) { retry(); return; }
            sock.onopen = function () {
                if (sock !== ws) return;
                tries = 0; lastRx = Date.now(); if (onStatus) onStatus(true);
                if (onOpen) onOpen();
                queue.splice(0).forEach(function (m) { sock.send(m); });
                clearInterval(pingT); pingT = setInterval(function () {
                    if (Date.now() - lastRx > DEAD_MS) return reconnect();
                    send({ t: 'ping', k: Date.now() });
                }, PING_MS);
                send({ t: 'ping', k: Date.now() });
            };
            sock.onmessage = function (e) {
                if (sock !== ws) return;
                lastRx = Date.now();
                var m; try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
                if (m && (m.t === 'state' || m.t === 'pong')) noteServerNow(m.now);
                if (m && m.t === 'pong') return;
                try { onMessage(m); } catch (err) { console.error(err); }
            };
            sock.onclose = function () { if (sock !== ws) return; clearInterval(pingT); if (onStatus) onStatus(false); retry(); };
            sock.onerror = function () { };
        }
        function reconnect() {
            var old = ws; ws = null;
            if (old) { old.onopen = old.onmessage = old.onclose = old.onerror = null; try { old.close(); } catch (e) { } }
            clearInterval(pingT); if (onStatus) onStatus(false); tries = 0; open();
        }
        function retry() { if (closed || retryT) return; tries++; retryT = setTimeout(open, Math.min(8000, 500 * Math.pow(1.6, tries))); }
        function send(obj) {
            var s = JSON.stringify(obj);
            if (ws && ws.readyState === 1) ws.send(s);
            else if (obj.t !== 'ping' && queue.length < 50) queue.push(s);
        }
        // الجوال رجع للصفحة: نتأكد إن الاتصال حي
        function wake() {
            if (closed || document.visibilityState === 'hidden') return;
            if (!ws || ws.readyState === 2 || ws.readyState === 3) reconnect();
            else if (Date.now() - lastRx > PING_MS * 1.5) send({ t: 'ping', k: Date.now() });
        }
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('pageshow', wake);
        window.addEventListener('online', wake);
        open();
        return { send: send, close: function () { closed = true; clearInterval(pingT); clearTimeout(retryT); try { ws && ws.close(); } catch (e) { } } };
    }

    window.OCNet = {
        connect: connect, wsUrl: wsUrl,
        now: function () { return Date.now() + offset; },
        hostSession: function (v) { if (arguments.length) writeJSON('oc-host', v); else return readJSON('oc-host'); },
        me: function (v) { if (arguments.length) writeJSON('oc-me', v); else return readJSON('oc-me'); },
        setup: function (v) { if (arguments.length) writeJSON('oc-setup', v); else return readJSON('oc-setup'); },
        authToken: function () { try { return window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null; } catch (e) { return null; } }
    };
})();
