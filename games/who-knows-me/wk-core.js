/**
 * «مين يعرفني أكثر؟» — الأساسيات المشتركة بين شاشة البث (index.html)
 * ولوحة جوال المضيف (host.html) ونسخة التجربة (demo.html).
 *
 * - قناة الجوال ↔ الشاشة: backend/websocket/room-relay-server.js (نفس قناة
 *   جوال السباي ماستر بكود نيمز). القناة توصّل كل رسالة لكل من بنفس الغرفة،
 *   ومعرّف الغرفة عشوائي طويل داخل رابط الباركود.
 * - الباركود يظهر على شاشة البث فممكن أي مشاهد يمسحه؛ عشان كذا:
 *   الجوال يرسل طلب باسمه والمضيف يقبله من الشاشة يدوياً، وبعد القبول كل
 *   الرسائل بينهم مشفّرة (ECDH + AES-GCM) بمفتاح ما يعرفه غيرهم — فلا أحد
 *   ثاني بالغرفة يقدر يقرأ جواب المضيف قبل كشفه أو يرسل أوامر باسمه.
 * - norm(): تطبيع الإجابات للمقارنة (نسخة من FA.norm بأسرع إجابة).
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform = window.AymanGamesPlatform || {};
    var WK = AGP.whoKnowsMe = AGP.whoKnowsMe || {};

    var RELAY_URL = 'wss://project-testing-akds.onrender.com/ws/room-relay';

    function randomId(len) {
        var abc = 'abcdefghijkmnpqrstuvwxyz23456789', out = '';
        var a = new Uint8Array(len || 16);
        (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
        for (var i = 0; i < a.length; i++) out += abc[a[i] % abc.length];
        return out;
    }

    function readJSON(store, key, fallback) {
        try { var raw = store.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
    }
    function writeJSON(store, key, value) {
        try { store.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    // تطبيع النص قبل المقارنة: التشكيل والرموز · أ إ آ ← ا · ة ← ه · ى ← ي ·
    // الأرقام العربية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
            .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/).map(function (w) { return w.replace(/^ال/, ''); }).join('')
            .replace(/(\p{L})\1+/gu, '$1');
    }

    /**
     * اتصال بغرفة room-relay. onMessage(msg) لكل رسالة من غيري بنفس الغرفة،
     * onState(ok) لما يتغيّر الاتصال. يعيد الاتصال تلقائياً. ترجع {send, close, reconnect}.
     */
    function relay(room, onMessage, onState) {
        var ws = null, closed = false, retry = null, queue = [], ping = null;
        function open() {
            if (closed || typeof WebSocket === 'undefined') { if (onState) onState(false); return; }
            try { ws = new WebSocket(RELAY_URL); } catch (e) { schedule(); return; }
            ws.onopen = function () {
                ws.send(JSON.stringify({ type: 'join', room: room }));
                if (onState) onState(true);
                var q = queue; queue = [];
                q.forEach(send);
                clearInterval(ping);
                ping = setInterval(function () { send({ t: 'ping' }); }, 20000);
            };
            ws.onmessage = function (ev) {
                var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
                if (m && m.room === room && m.t !== 'ping') onMessage(m);
            };
            ws.onclose = function () { ws = null; clearInterval(ping); if (!closed) { if (onState) onState(false); schedule(); } };
            ws.onerror = function () {};
        }
        function schedule() { clearTimeout(retry); retry = setTimeout(open, 2500); }
        function send(msg) {
            var obj = Object.assign({ room: room }, msg);
            if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
            else if (queue.length < 20 && msg.t !== 'ping') queue.push(msg);
        }
        open();
        return {
            send: send,
            reconnect: function () {
                if (closed) return;
                clearTimeout(retry);
                var old = ws; ws = null;
                if (old) { old.onclose = null; old.onmessage = null; try { old.close(); } catch (e) {} }
                open();
            },
            close: function () { closed = true; clearTimeout(retry); clearInterval(ping); try { ws && ws.close(); } catch (e) {} }
        };
    }

    /**
     * قناة داخل نفس الصفحة (لنسخة التجربة demo.html): نفس واجهة relay بدون
     * سيرفر. كل من يستخدم نفس الكائن بنفس الغرفة يستلم رسائل الثاني.
     */
    function createLoopback() {
        var members = [];
        return function (room, onMessage, onState) {
            var me = { room: room, cb: onMessage, open: true };
            members.push(me);
            setTimeout(function () { if (onState) onState(true); }, 0);
            return {
                send: function (msg) {
                    var obj = JSON.parse(JSON.stringify(Object.assign({ room: room }, msg)));
                    members.forEach(function (m) {
                        if (m !== me && m.open && m.room === room) setTimeout(function () { m.cb(obj); }, 30);
                    });
                },
                reconnect: function () {},
                close: function () { me.open = false; }
            };
        };
    }

    // ── التشفير بين الشاشة والجوال المقبول ──
    var ECDH = { name: 'ECDH', namedCurve: 'P-256' };
    function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
    function unb64(str) { var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
    var secure = {
        supported: function () { return !!(window.crypto && window.crypto.subtle); },
        /** زوج مفاتيح جديد ← {priv, pub} بصيغة JWK (يُحفظ). */
        newPair: function () {
            var subtle = window.crypto.subtle;
            return subtle.generateKey(ECDH, true, ['deriveKey']).then(function (kp) {
                return Promise.all([subtle.exportKey('jwk', kp.privateKey), subtle.exportKey('jwk', kp.publicKey)]);
            }).then(function (r) { return { priv: r[0], pub: { kty: r[1].kty, crv: r[1].crv, x: r[1].x, y: r[1].y } }; });
        },
        /** مفتاح AES مشترك من مفتاحي الخاص والمفتاح العام للطرف الثاني. */
        shared: function (privJwk, peerPub) {
            var subtle = window.crypto.subtle;
            return Promise.all([
                subtle.importKey('jwk', privJwk, ECDH, false, ['deriveKey']),
                subtle.importKey('jwk', { kty: peerPub.kty, crv: peerPub.crv, x: peerPub.x, y: peerPub.y }, ECDH, false, [])
            ]).then(function (k) {
                return subtle.deriveKey({ name: 'ECDH', public: k[1] }, k[0], { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            });
        },
        encrypt: function (key, obj) {
            var iv = window.crypto.getRandomValues(new Uint8Array(12));
            var data = new TextEncoder().encode(JSON.stringify(obj));
            return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data)
                .then(function (ct) { return { iv: b64(iv), data: b64(ct) }; });
        },
        decrypt: function (key, box) {
            return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data))
                .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
        }
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /** أصوات قصيرة بدون ملفات (WebAudio). */
    var _ac = null;
    function sfx(kind) {
        try {
            _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
            var t = _ac.currentTime;
            var notes = {
                ok: [[660, 0], [880, 0.09]], no: [[220, 0], [160, 0.12]], tick: [[1200, 0]],
                pop: [[520, 0], [780, 0.07]], win: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]], go: [[440, 0], [660, 0.1]]
            }[kind] || [[600, 0]];
            notes.forEach(function (n) {
                var o = _ac.createOscillator(), g = _ac.createGain();
                o.type = kind === 'no' ? 'sawtooth' : 'triangle';
                o.frequency.value = n[0];
                g.gain.setValueAtTime(0.0001, t + n[1]);
                g.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.05 : 0.14, t + n[1] + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + (kind === 'tick' ? 0.08 : 0.22));
                o.connect(g); g.connect(_ac.destination);
                o.start(t + n[1]); o.stop(t + n[1] + 0.3);
            });
        } catch (e) {}
    }

    WK.RELAY_URL = RELAY_URL;
    WK.randomId = randomId;
    WK.readJSON = readJSON;
    WK.writeJSON = writeJSON;
    WK.norm = norm;
    WK.relay = relay;
    WK.createLoopback = createLoopback;
    WK.secure = secure;
    WK.esc = esc;
    WK.sfx = sfx;
}());
