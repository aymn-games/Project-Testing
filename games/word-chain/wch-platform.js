/**
 * سلسلة الكلمات — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * نفس نمط games/elimination-roulette/er-platform.js: الشاشات تشتغل عبر
 * support.js، وهذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة.
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - قوائم الكلمات وقواعد الحروف: wc-words.js (window.AGPWordChainWords).
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

    window.WCH = {
        libraryUrl: 'https://aymngames.online/games.html',
        keys: { setup: 'wch-settings' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection
    };
}());
