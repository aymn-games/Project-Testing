/**
 * حارس فتح الألعاب — يُحمَّل في كل صفحة لعبة يشغّلها الستريمر، مباشرة
 * بعد auth/auth-client.js.
 *
 * نفس شرط مكتبة الألعاب (games.html) وشرط الخادم عند الاتصال بالبث
 * (backend/websocket/ws-server.js): اللعبة تفتح فقط لحساب ستريمر مربوط
 * بحساب تيك توك موثَّق (AGPAuth.canPlayGames — الأدمن مستثنى). غير كذا
 * الصفحة ما تنعرض أصلاً ويرجع لمكتبة الألعاب مع سبب المنع
 * (games.html?locked=login|not_streamer|tiktok) فتظهر له رسالة القفل.
 *
 * الفحص الأول فوري من الجلسة المحفوظة (قبل رسم الصفحة)، ثم يُعاد بعد
 * تحديث بيانات الحساب من الخادم (refreshUser) — لو انتهت الجلسة أو تغيّر
 * نوع الحساب/الربط. تعثّر الخادم مؤقتاً (5xx) ما يطرد المستخدم.
 *
 * لا يُحمَّل في صفحات اللاعبين على جوالاتهم (مثل codenames/spymaster.html)
 * ولا صفحات الإدارة (admin-*.html).
 */
(function () {
    'use strict';

    var auth = window.AGPAuth;
    var script = document.currentScript;
    // جذر الموقع من مسار هذا الملف نفسه (…/auth/game-access-guard.js)
    var root = script && script.src ? script.src.replace(/auth\/game-access-guard\.js(\?.*)?$/, '') : '../../';

    function blockReason() {
        if (!auth || !auth.getToken || !auth.getToken()) return 'login';
        var user = auth.getCachedUser ? auth.getCachedUser() : null;
        if (!user) return 'login';
        if (auth.canPlayGames && auth.canPlayGames(user)) return null;
        if (auth.isStreamerAccount && !auth.isStreamerAccount(user)) return 'not_streamer';
        return 'tiktok';
    }

    var blocked = false;
    function enforce() {
        if (blocked) return;
        var reason = blockReason();
        if (!reason) return;
        blocked = true;
        document.documentElement.style.visibility = 'hidden';
        window.location.replace(root + 'games.html?locked=' + reason);
    }

    enforce();
    if (!blocked && auth && auth.refreshUser) auth.refreshUser().then(enforce, function () {});
}());
