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
        streamerAvatar: streamerAvatar
    };
}());
