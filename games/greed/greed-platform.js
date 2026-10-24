/**
 * الطمع — طبقة الربط بين شاشات اللعبة والمنصة (نفس نمط er-platform.js).
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - إعدادات المباراة تُحفظ بـ 'greed-settings'.
 */
(function () {
    'use strict';

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

    window.GR = {
        libraryUrl: 'https://aymngames.online/games.html',
        keys: { setup: 'greed-settings', roster: 'greed-roster', players: 'greed-players' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection
    };
})();
