/**
 * بلدة الكاوبوي — طبقة الربط مع المنصة (نفس نمط games/elimination-roulette/er-platform.js).
 *
 *  - الرابط الخاص: اللعبة مو بمكتبة الألعاب (games.html)، وتنفتح بس بالرابط اللي فيه المفتاح
 *    games/cowboy-duel/?k=<KEY>. أول فتح يحفظ المفتاح بالمتصفح، فالانتقال بين الإعدادات
 *    واللعبة ما يحتاج المفتاح بالرابط. بدونه يرجع لمكتبة الألعاب.
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ ('agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js ('stream:commentReceived').
 *    الاتصال من صفحة اللعبة نفسها = اللعبة تطلع بـ«البثوث الحالية» (الخادم يقرأ اسمها من
 *    مسار الصفحة — GAME_NAMES بـ backend/websocket/ws-server.js) وتنحسب إحصائيات البث.
 *  - النقاط والإحصائيات: AGPAuth.reportMatchPoints بنهاية كل مباراة (duel-game.js).
 * يحتاج ملفات js/agp-*.js + الأدابتر + auth/auth-client.js قبله.
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    var KEY = 'wst-8k3q7m2x';                     // مفتاح الرابط الخاص
    var KEY_STORE = 'cowboy-duel:key';
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';
    var ROOT = '../../';

    // ---- الرابط الخاص (يُفحص أول ما يتحمّل الملف — قبل ما تنرسم الصفحة)
    function hasAccess() {
        var k = null;
        try { k = new URLSearchParams(location.search).get('k'); } catch (e) { }
        if (k === KEY) { try { localStorage.setItem(KEY_STORE, KEY); } catch (e) { } return true; }
        try { return localStorage.getItem(KEY_STORE) === KEY; } catch (e) { return false; }
    }
    if (!hasAccess()) { location.replace(ROOT + 'games.html'); return; }

    function readJSON(key, fallback) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
    function getSavedConnection() { var d = readJSON(STREAM_CONNECTION_STORAGE_KEY, null); return d && typeof d.username === 'string' && d.username ? d : null; }

    var _connected = false;
    /** يتصل ببث الحساب المربوط (لو فيه اتصال محفوظ). */
    function connect() {
        var saved = getSavedConnection();
        if (_connected || !saved || !AGP.streamConnector) return false;
        _connected = true;
        AGP.streamConnector.connect('tiktok', { username: saved.username });
        return true;
    }
    /** cb(payload) لكل تعليق: { id: 'tiktok:<user>', name, text, isFollower, avatarUrl }. ترجع دالة لإلغاء الاستماع. */
    function onComment(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () { };
        return AGP.events.on('stream:commentReceived', function (p) { if (p && typeof p.text === 'string' && p.id) cb(p); });
    }

    // هدية الدخول: اسم الهدية من تيك توك (giftName) أو قيمتها بالكوينز — نفس طريقة games/survival-ship/sh-platform.js
    var GIFT_NAMES = {
        'rose': ['Rose'], 'tiktok': ['TikTok'], 'finger-heart': ['Finger Heart'], 'heart-in-your-hands-a': ['Heart In Your Hands', 'Heart in Your Hands'], 'heart-in-your-hands-b': ['Heart In Your Hands', 'Heart in Your Hands'],
        'love-saudi': ['Love Saudi', 'I Love Saudi'], 'saudi-in-heart': ['Saudi In Heart', 'Saudi in My Heart'], 'rosa': ['Rosa'], 'ice-cream': ['Ice Cream Cone', 'Ice Cream'], 'donut': ['Doughnut', 'Donut'],
        'cake-slice': ['Cake Slice'], 'paper-crane': ['Paper Crane'], 'butterfly': ['Butterfly'], 'hat-and-mustache': ['Hat and Mustache'], 'kiss': ['Kiss'], 'hearts': ['Hearts'], 'corgi': ['Corgi'],
        'kings-scepter': ["King's Scepter", 'Kings Scepter'], 'lion': ['Lion'], 'galaxy': ['Galaxy'], 'diving-with-whales': ['Diving with Whales', 'Diving With Whales']
    };
    function gk(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function giftMatches(giftId, p) {
        var got = gk(p.giftName || p.name);
        if (got && (got === gk(giftId) || (GIFT_NAMES[giftId] || []).some(function (n) { return gk(n) === got; }))) return true;
        var g = AGP.tiktokGifts && AGP.tiktokGifts.byId(giftId), v = Number(p.giftValue);
        return !!(g && v > 0 && g.coins === v);
    }
    /** cb(payload) لكل هدية من البث ({ id, name, giftName, giftValue, avatarUrl, ... }). */
    function onGift(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () { };
        return AGP.events.on('stream:giftReceived', function (p) { if (p && p.id) cb(p); });
    }

    window.CDPlatform = {
        connect: connect, onComment: onComment, onGift: onGift, giftMatches: giftMatches, getSavedConnection: getSavedConnection,
        demo: /[?&]demo=1\b/.test(location.search),   // وضع التجربة: بوتات + لوحة التجربة
        libraryUrl: ROOT + 'games.html', settingsUrl: 'index.html', gameUrl: 'game.html'
    };
}());
