/**
 * خلية الكلمات — ربط الشاشات بالمنصة (منقول ومختصر من er-platform.js لروليت الإقصاء).
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived') — نفس التكامل الحالي بدون أي بديل وهمي.
 *  - حالة الموصّل الفعلية: الحدث 'stream:statusChanged' إن وُجد.
 *  - الإعدادات بـ 'wh-settings' والجولات الأخيرة بـ 'wh-recent-rounds'.
 *  - المحرك (wh-engine.js) والبنك (wh-rounds.js) والإعدادات (wh-settings.js) ملفات مستقلة.
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';

    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }
    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function getSavedConnection() {
        var data = readJSON(STREAM_CONNECTION_STORAGE_KEY, null);
        return data && typeof data.username === 'string' && data.username ? data : null;
    }

    var _connected = false;
    function connect() {
        var saved = getSavedConnection();
        if (_connected || !saved || !AGP.streamConnector) return false;
        _connected = true;
        AGP.streamConnector.connect('tiktok', { username: saved.username });
        return true;
    }

    /** cb(payload) لكل تعليق من شات البث. ترجع دالة لإلغاء الاستماع. */
    function onComment(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:commentReceived', function (payload) {
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;
            cb(payload);
        });
    }

    /** cb(status) عند تغيّر حالة الموصّل ('connecting' | 'connected' | 'disconnected' | 'error'). */
    function onStatus(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:statusChanged', function (p) {
            if (p && (!p.platform || p.platform === 'tiktok')) cb(p.status || null, p.message || null);
        });
    }

    /**
     * بطاقة الفوز المملوكة (js/agp-win-card.js) كعنصر React بعرض 240px — نفس
     * er-platform.js لروليت الإقصاء: تحل محل بطاقة الفائز العادية فقط لو الفائز
     * يملك بطاقة مفعّلة. player: {name, avatarUrl, winCard}. ترجع null لو ما يملك بطاقة.
     */
    function winCard(player, lines, key, width) {
        var React = window.React;
        if (!React || !AGP.winCard || !player || !AGP.winCard.canShow(player)) return null;
        return React.createElement('div', { key: key || 'wc', style: { width: width || 240, maxWidth: '100%', lineHeight: 0, animation: 'agpWinCardPop .55s cubic-bezier(.2,1.3,.4,1) both' }, dangerouslySetInnerHTML: { __html: AGP.winCard.renderHtml(player, lines, { pop: false }) } });
    }

    /** فيديو الفوز من بيانات رسالة الشات (إن وُجد). */
    function winVideoOf(payload) {
        var v = payload && (payload.winVideo || payload.winVideoUrl) || null;
        if (v && typeof v === 'object') v = v.url || v.src || null;
        return typeof v === 'string' && v ? v : null;
    }

    /** صورة حساب تيك توك الموثّق للاستريمر (من حسابه بالمنصة) أو null. */
    function streamerAvatar() {
        try {
            var u = window.AGPAuth && typeof window.AGPAuth.getCachedUser === 'function' ? window.AGPAuth.getCachedUser() : null;
            return (u && u.tiktok_avatar_url) || null;
        } catch (e) { return null; }
    }

    window.WH = {
        libraryUrl: 'https://aymngames.online/games.html',
        keys: { setup: 'wh-settings', recent: 'wh-recent-rounds' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        connect: connect,
        onComment: onComment,
        onStatus: onStatus,
        streamerAvatar: streamerAvatar,
        winCard: winCard,
        winVideoOf: winVideoOf
    };
}());
