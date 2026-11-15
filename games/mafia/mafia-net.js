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

    /*
     * تعليق الشات بالجوال: لما اللاعب يطلع من المتصفح ويرجع، الجوال يقتل الاتصال بصمت والمتصفح
     * يظنه شغال (readyState = 1)، فالرسائل تنرسل لاتصال ميت وتضيع ولا يوصل شي جديد.
     * الحل هنا:
     *   - مراقب: لو ما وصل شي من الخادم مدة DEAD_MS (الخادم يرد على كل ping) ← اتصال جديد فوراً.
     *   - رجوع للصفحة (visibilitychange/pageshow/online): فحص سريع بـping، ولو ما رد خلال PROBE_MS ← اتصال جديد.
     *     ولو كان الاتصال مقطوع أصلاً نعيده على طول بدون انتظار مهلة إعادة المحاولة.
     *   - رسائل الشات اللي انرسلت بعد آخر شي وصلنا من الخادم ممكن ضاعت، فتنعاد بعد الاتصال الجديد،
     *     ومعها cid عشان الخادم يتجاهل المكرر لو كانت وصلت فعلاً.
     */
    var PING_MS = 8000, DEAD_MS = 20000, PROBE_MS = 3500, RESEND_WINDOW_MS = 30000, RX_GRACE_MS = 2000;
    function isChat(obj) { return obj.t === 'lchat' || (obj.t === 'act' && obj.a === 'chat'); }

    function connect(onMessage, onOpen, onStatus) {
        var ws = null, closed = false, tries = 0, pingT = null, retryT = null, probeT = null, queue = [], lastRx = 0, sentChat = [];
        function open() {
            if (closed) return;
            clearTimeout(retryT); retryT = null;
            var sock;
            try { sock = ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
            sock.onopen = function () {
                if (sock !== ws) return;
                tries = 0; lastRx = Date.now(); if (onStatus) onStatus(true);
                chat = null; sock.send(JSON.stringify({ t: 'caps', chatDelta: true }));
                if (onOpen) onOpen();
                queue.splice(0).forEach(function (m) { sock.send(m); });
                clearInterval(pingT); pingT = setInterval(function () {
                    if (Date.now() - lastRx > DEAD_MS) return reconnect(true);
                    send({ t: 'ping', k: Date.now() });
                }, PING_MS);
                send({ t: 'ping', k: Date.now() });
            };
            sock.onmessage = function (e) {
                if (sock !== ws) return;
                lastRx = Date.now(); clearTimeout(probeT); probeT = null;
                var m; try { m = JSON.parse(e.data); } catch (err) { return; }
                if (m && (m.t === 'state' || m.t === 'pong')) noteServerNow(m.now);
                if (m && m.t === 'state' && m.G && !mergeChat(m)) return;
                if (m && m.t === 'pong') return;
                try { onMessage(m); } catch (err) { console.error(err); }
            };
            sock.onclose = function () { if (sock !== ws) return; lost(); retry(); };
            sock.onerror = function () { };
        }
        // الشات بالتحديثات: الخادم يرسل الرسائل الجديدة بس (chatAdd) ونضيفها على اللي عندنا، فالصفحات تستلم G.chat كامل
        // مثل قبل. لو اللي عندنا ما يطابق (chatBase) نطلب الشات كامل (resync) ونتجاهل هالتحديث.
        var chat = null;
        function mergeChat(m) {
            if (!m.chatAdd) { chat = m.G.chat || []; return true; }
            var last = chat && chat.length ? chat[chat.length - 1].n : 0;
            if (!chat || last !== m.chatBase) { chat = null; send({ t: 'resync' }); return false; }
            chat = m.chatLen ? chat.concat(m.chatAdd).slice(-m.chatLen) : [];
            m.G.chat = chat;
            return true;
        }
        // الاتصال انقطع: نوقف المؤقتات ونرجّع رسائل الشات اللي يمكن ضاعت لطابور الإرسال
        function lost() {
            clearInterval(pingT); clearTimeout(probeT); probeT = null;
            if (onStatus) onStatus(false);
            var since = lastRx - RX_GRACE_MS, now = Date.now();
            sentChat.forEach(function (it) { if (it.at > since && now - it.at < RESEND_WINDOW_MS && queue.length < 50 && queue.indexOf(it.s) < 0) queue.push(it.s); });
            sentChat = [];
        }
        // نترك الاتصال الحالي (حتى لو المتصفح يظنه شغال) ونفتح واحد جديد
        function reconnect(now) {
            if (closed) return;
            var old = ws; ws = null;
            if (old) { old.onopen = old.onmessage = old.onclose = old.onerror = null; try { old.close(); } catch (e) { } lost(); }
            if (now) { tries = 0; open(); } else retry();
        }
        function retry() { if (closed || retryT) return; tries++; retryT = setTimeout(open, Math.min(8000, 500 * Math.pow(1.6, tries))); }
        function send(obj) {
            if (isChat(obj) && !obj.cid) obj.cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            var s = JSON.stringify(obj);
            if (ws && ws.readyState === 1) {
                ws.send(s);
                if (isChat(obj)) { var now = Date.now(); sentChat = sentChat.filter(function (it) { return now - it.at < RESEND_WINDOW_MS; }); sentChat.push({ s: s, at: now }); }
            }
            else if (obj.t !== 'ping' && queue.length < 50) queue.push(s);
        }
        // اللاعب رجع للصفحة: نتأكد إن الاتصال حي فعلاً
        function wake() {
            if (closed || document.visibilityState === 'hidden') return;
            if (!ws || ws.readyState === 2 || ws.readyState === 3) return reconnect(true);
            if (ws.readyState !== 1) return;   // جاري الاتصال
            if (probeT) return;
            send({ t: 'ping', k: Date.now() });
            probeT = setTimeout(function () { probeT = null; reconnect(true); }, PROBE_MS);
        }
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('pageshow', wake);
        window.addEventListener('online', wake);
        window.addEventListener('focus', wake);
        open();
        return { send: send, close: function () {
            closed = true; clearInterval(pingT); clearTimeout(retryT); clearTimeout(probeT);
            document.removeEventListener('visibilitychange', wake); window.removeEventListener('pageshow', wake);
            window.removeEventListener('online', wake); window.removeEventListener('focus', wake);
            try { ws && ws.close(); } catch (e) { }
        } };
    }

    window.MafiaNet = {
        connect: connect, wsUrl: wsUrl,
        now: function () { return Date.now() + offset; },
        hostSession: function (v) { if (arguments.length) writeJSON('mafia-host', v); else return readJSON('mafia-host'); },
        me: function (v) { if (arguments.length) writeJSON('mafia-me', v); else return readJSON('mafia-me'); },
        look: function (v) { if (arguments.length) writeJSON('mafia-look', v); else return readJSON('mafia-look'); },
        // إعدادات المباراة من شاشة الإعدادات (index.html) — اللوبي يرسلها للخادم عند إنشاء الروم
        setup: function (v) { if (arguments.length) writeJSON('mafia-setup', v); else return readJSON('mafia-setup'); },
        authToken: function () { try { return window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null; } catch (e) { return null; } }
    };
})();
