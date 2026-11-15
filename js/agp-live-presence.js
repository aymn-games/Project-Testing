/**
 * AGP LIVE PRESENCE (واجهة) — نبضة حضور من شاشة المذيع بألعاب الباركود اللي
 * ما فيها اتصال تيك توك خاص (المافيا، محطة سهيل، حفلة الميلاد، من الأمبوستر)،
 * عشان تطلع بقائمة «البثوث الشغّالة» بمكتبة الألعاب.
 *
 * الاستخدام: بعد auth/auth-client.js
 *   <script src="../../js/agp-live-presence.js" data-game="mafia"></script>
 * الصفحة اللي يفتحها المذيع واللاعب مع بعض (من الأمبوستر) تضيف
 * data-host-only وتحدد مين المذيع:
 *   window.AGPLivePresence.setActive(function () { return state.isHost; });
 *
 * POST /api/stream/presence كل BEAT_MS والصفحة مفتوحة، بس لحساب مسجّل
 * وموثّق تيك توك. السيرفر يتأكد إنه يبث فعلاً (backend/stats/live-presence.js)
 * بدون أي اتصال تيك توك.
 */
(function () {
    'use strict';
    if (window.AGPLivePresence) return;

    var BEAT_MS = 45000;
    var script = document.currentScript;
    var game = script && script.getAttribute('data-game');
    // data-host-only: ما ننبض لين الصفحة تحدد مين المذيع بـsetActive
    var hostOnly = Boolean(script && script.hasAttribute('data-host-only'));
    var activeFn = null;
    var sent = false;
    var stopped = false;

    function auth() { return window.AGPAuth && typeof window.AGPAuth.request === 'function' ? window.AGPAuth : null; }

    function eligible() {
        var a = auth();
        if (!a || !game || stopped || !a.getToken()) return false;
        var u = null;
        try { u = a.getCachedUser && a.getCachedUser(); } catch (e) { u = null; }
        if (u && !u.tiktok_verified) return false;
        if (hostOnly && !activeFn) return false;
        if (activeFn) { try { if (!activeFn()) return false; } catch (e) { return false; } }
        return true;
    }

    function leave() {
        var a = auth();
        if (!sent || !a) return;
        sent = false;
        a.request('/api/stream/presence', { method: 'POST', body: { game: game, leave: true }, keepalive: true }).catch(function () {});
    }

    function beat() {
        if (!eligible()) { leave(); return; }
        sent = true;
        auth().request('/api/stream/presence', { method: 'POST', body: { game: game } }).then(function (d) {
            // حساب غير موثّق أو لعبة مو مسموحة — نوقف النبضات لهذي الصفحة
            if (d && (d.error === 'tiktok_not_linked' || d.error === 'invalid_game')) { stopped = true; sent = false; }
        }).catch(function () {});
    }

    window.AGPLivePresence = {
        setActive: function (fn) { activeFn = typeof fn === 'function' ? fn : null; beat(); }
    };

    if (!game) return;
    setTimeout(beat, 1500);
    setInterval(beat, BEAT_MS);
    window.addEventListener('pagehide', leave);
}());
