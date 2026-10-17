/**
 * اتصال تلقائي ببث حساب تيك توك المربوط — لصفحات إعدادات الألعاب.
 *
 * نفس فكرة الاتصال التلقائي بمكتبة الألعاب (games.html): لو حساب الموقع
 * ستريمر (أو أدمن/صلاحية تشغيل) ومربوط بتيك توك موثَّق، وما فيه اتصال
 * محفوظ، نفحص كل POLL_MS هل الحساب يبث (GET /api/stream/is-live)، ولو
 * يبث نتحقق منه عبر الخادم (WebSocket connect بـ source 'library' — تحقق
 * فقط، ما يُحتسب ساعات بث) ونحفظ الاتصال بنفس مفتاح المكتبة
 * ('agp:agp-stream-connection')، فتلقاه اللعبة مثل ما لو اتصل من المكتبة.
 *
 * بعد الحفظ نطلق حدث 'storage' (نفس التبويب ما يطلقه المتصفح تلقائياً) +
 * حدث 'agp:stream-connected' عشان شارة الاتصال باللعبة تتحدث فوراً.
 * القطع اليدوي بالمكتبة يوقف الاتصال التلقائي لنفس الجلسة (sessionStorage
 * 'agp-auto-connect-off' — نفس مفتاح games.html).
 *
 * يحتاج auth/auth-client.js قبله.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'agp:agp-stream-connection';
    var LAST_USERNAME_KEY = 'agp:agp-last-username';
    var AUTO_OFF_KEY = 'agp-auto-connect-off';
    var BACKEND_WS_URL = 'wss://project-testing-akds.onrender.com';
    var POLL_MS = 45000;
    var VERIFY_TIMEOUT_MS = 30000;
    var MAX_FAILED_ATTEMPTS = 3;

    var linkedUsername = null;
    var inFlight = false;
    var failedAttempts = 0;

    function saved() {
        try {
            var d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return d && typeof d.username === 'string' && d.username ? d : null;
        } catch (e) { return null; }
    }

    function isOff() {
        try { return sessionStorage.getItem(AUTO_OFF_KEY) === '1'; } catch (e) { return false; }
    }

    function apiBase() {
        return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    }
    function token() {
        return window.AGPAuth && window.AGPAuth.getToken ? window.AGPAuth.getToken() : null;
    }

    function canRunGames(u) {
        var perms = (u && u.permissions) || {};
        return Boolean(u && (u.role === 'admin' || u.is_streamer || perms.can_run_games || perms.full_game_access));
    }

    function save(username) {
        var value = JSON.stringify({ platform: 'tiktok', username: username, connectedAt: Date.now() });
        try {
            localStorage.setItem(STORAGE_KEY, value);
            localStorage.setItem(LAST_USERNAME_KEY, JSON.stringify(username));
        } catch (e) { return; }
        try { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: value })); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('agp:stream-connected', { detail: { username: username } })); } catch (e) {}
        if (window.AGPLiveWatch && window.AGPLiveWatch.reset) window.AGPLiveWatch.reset();
    }

    /** @returns {Promise<boolean|null>} */
    function fetchIsLive(username) {
        var t = token();
        if (!t || !window.fetch) return Promise.resolve(null);
        return fetch(apiBase() + '/api/stream/is-live?username=' + encodeURIComponent(username), {
            headers: { 'Authorization': 'Bearer ' + t }
        }).then(function (res) { return res.json(); }).then(function (d) {
            // الستريمر غيّر يوزره في تيك توك — الخادم حدّثه، نكمل على الجديد.
            if (d && d.success && d.renamed && d.username) linkedUsername = d.username;
            return d && d.success && (d.live === true || d.live === false) ? d.live : null;
        }).catch(function () { return null; });
    }

    /** يتحقق من البث عبر الخادم (نفس طلب مكتبة الألعاب). @returns {Promise<boolean>} */
    function verify(username) {
        return new Promise(function (resolve) {
            var ws;
            var done = false;
            function finish(ok) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; try { ws.close(); } catch (e) {} }
                resolve(ok);
            }
            var timer = setTimeout(function () { finish(false); }, VERIFY_TIMEOUT_MS);
            try { ws = new WebSocket(BACKEND_WS_URL); } catch (e) { finish(false); return; }
            ws.onopen = function () {
                ws.send(JSON.stringify({
                    type: 'connect',
                    payload: { platform: 'tiktok', username: username, followersOnly: false, source: 'library', authToken: token() },
                    timestamp: Date.now()
                }));
            };
            ws.onmessage = function (event) {
                var env;
                try { env = JSON.parse(event.data); } catch (e) { return; }
                if (!env || !env.payload) return;
                if (env.type === 'status' && env.payload.status === 'connected') finish(true);
                else if (env.type === 'error' || (env.type === 'status' && (env.payload.status === 'error' || env.payload.status === 'disconnected'))) finish(false);
            };
            ws.onerror = function () { finish(false); };
            ws.onclose = function () { finish(false); };
        });
    }

    function tick() {
        if (!linkedUsername || inFlight || isOff() || document.hidden) return;
        if (saved()) return; // متصل أصلاً (من المكتبة أو من قبل) — ما نلمسه
        if (failedAttempts >= MAX_FAILED_ATTEMPTS) return;
        inFlight = true;
        fetchIsLive(linkedUsername).then(function (live) {
            if (live !== true || isOff() || saved()) return null;
            return verify(linkedUsername).then(function (ok) {
                if (ok && !saved()) { failedAttempts = 0; save(linkedUsername); }
                else if (!ok) failedAttempts++;
            });
        }).then(function () { inFlight = false; }, function () { inFlight = false; });
    }

    function start() {
        if (!window.AGPAuth || !window.AGPAuth.me || !token()) return;
        window.AGPAuth.me().then(function (r) {
            var u = r && r.success ? r.user : null;
            if (!u || !u.tiktok_verified || !u.tiktok_username || !canRunGames(u)) return;
            linkedUsername = String(u.tiktok_username).replace(/^@+/, '');
            tick();
            setInterval(tick, POLL_MS);
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden) { failedAttempts = 0; tick(); }
            });
            // البث انتهى (js/agp-live-watch.js) — نرجع نفحص لما يبدأ بث جديد.
            window.addEventListener('agp:stream-ended', function () { failedAttempts = 0; });
        }).catch(function () {});
    }

    window.AGPAutoConnect = {
        getLinkedUsername: function () { return linkedUsername; },
        checkNow: function () { failedAttempts = 0; tick(); }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
