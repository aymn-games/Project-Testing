/**
 * سفينة النجاة — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * الشاشات الثلاث (index.html الإعدادات، lobby.html اللوبي، game.html
 * المباراة) منقولة من ملفات التصميم المعتمدة وتشتغل عبر support.js،
 * والمشهد الثري دي من ship3d.js كما هو. هذا الملف هو طبقة الربط الوحيدة
 * بينها وبين المنصة (نفس نمط games/luck-color/lc-platform.js):
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived').
 *  - الهدايا (طوق النجاة): الحدث 'stream:giftReceived'.
 *  - مفاتيح التخزين كما في عقد التصميم: 'ship-settings' و 'ship-join'
 *    و 'ship-roster' (أسماء فقط)، وبجانبها 'ship-players' (id/صورة لكل اسم).
 * يحتاج تحميل ملفات js/agp-*.js + الأدابتر + auth/auth-client.js قبله.
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

    // تطبيع النص قبل المقارنة — كلمة الدخول بالشات.
    // التشكيل والتطويل والرموز غير المرئية والترقيم · أ إ آ ٱ ← ا · ة ← ه · ى ← ي · ؤ ← و · ئ ← ي · حذف ء
    // الحروف الفارسية (ی ک ہ) · الأرقام العربية والفارسية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
    function norm(s) {
        // الأرقام العربية/الفارسية تتحول قبل حذف التشكيل (مداها داخل مدى التشكيل ً-ٰ فكانت تنحذف)
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
            .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/).map(function (w) { return w.replace(/^ال/, ''); }).join('')
            .replace(/(\p{L})\1+/gu, '$1');
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

    // هدايا قائمة الإعدادات (SUPPORT_TYPES في index.html) ← اسم الهدية كما يرسله تيك توك (giftName).
    var GIFT_NAMES = {
        'rose': ['Rose'], 'tiktok': ['TikTok'], 'finger-heart': ['Finger Heart'],
        'heart-in-your-hands-a': ['Heart In Your Hands', 'Heart in Your Hands'], 'heart-in-your-hands-b': ['Heart In Your Hands', 'Heart in Your Hands'],
        'love-saudi': ['Love Saudi', 'I Love Saudi'], 'saudi-in-heart': ['Saudi In Heart', 'Saudi in My Heart'], 'rosa': ['Rosa'],
        'ice-cream': ['Ice Cream Cone', 'Ice Cream'], 'donut': ['Doughnut', 'Donut'], 'cake-slice': ['Cake Slice'],
        'paper-crane': ['Paper Crane'], 'butterfly': ['Butterfly'], 'hat-and-mustache': ['Hat and Mustache'],
        'kiss': ['Kiss'], 'hearts': ['Hearts'], 'corgi': ['Corgi'], 'kings-scepter': ["King's Scepter", 'Kings Scepter'],
        'lion': ['Lion'], 'galaxy': ['Galaxy'], 'diving-with-whales': ['Diving with Whales', 'Diving With Whales']
    };
    function giftKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    /**
     * هل الهدية القادمة من البث تطابق هدية الإعدادات (id)؟ بالاسم، أو بقيمة
     * العملات (giftValue من تيك توك = coins هدية الإعدادات) لأن أسماء تيك توك
     * الإنجليزية ما تطابق دائماً الأسماء المحفوظة هنا (نفس games/xo/xo-platform.js).
     */
    function giftMatches(giftId, giftName, giftValue, coins) {
        var got = giftKey(giftName);
        if (got && got === giftKey(giftId)) return true;
        if (got && (GIFT_NAMES[giftId] || []).some(function (n) { return giftKey(n) === got; })) return true;
        var c = Number(coins), v = Number(giftValue);
        return c > 0 && v > 0 && c === v;
    }

    /** cb(payload) لكل هدية من البث ({id, name, giftName, giftValue, ...}). ترجع دالة لإلغاء الاستماع. */
    function onGift(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:giftReceived', function (payload) {
            if (!payload || !payload.id) return;
            cb(payload);
        });
    }

    /** صورة حساب تيك توك الموثّق للاستريمر (من حسابه بالمنصة) أو null. */
    function streamerAvatar() {
        try {
            var u = window.AGPAuth && typeof window.AGPAuth.getCachedUser === 'function' ? window.AGPAuth.getCachedUser() : null;
            return (u && u.tiktok_avatar_url) || null;
        } catch (e) { return null; }
    }

    /**
     * سجل اللاعبين: الشاشات تتعامل بالأسماء (كما في التصميم)، وهنا نربط كل
     * اسم بـ id ثابت من المنصة (tiktok:<username>) وصورته وإطاره وفيديو
     * فوزه. لو تكرر اسم العرض لحسابين مختلفين يُضاف رقم
     * للاسم الثاني حتى يبقى كل اسم فريداً.
     */
    function createRegistry(initial) {
        var byName = Object.assign({}, initial || {});
        var byId = {};
        Object.keys(byName).forEach(function (n) { if (byName[n] && byName[n].id) byId[byName[n].id] = n; });
        function winVideoOf(payload) {
            var v = payload.winVideo || payload.winVideoUrl || null;
            if (v && typeof v === 'object') v = v.url || v.src || null;
            return typeof v === 'string' && v ? v : null;
        }
        return {
            nameFor: function (payload) {
                if (byId[payload.id]) {
                    var known = byName[byId[payload.id]];
                    if (payload.avatarUrl) known.avatar = payload.avatarUrl;
                    if (payload.frame !== undefined) known.frame = payload.frame || null;
                    if (payload.elimCard !== undefined) known.elimCard = payload.elimCard || null;
                    if (payload.winCard !== undefined) known.winCard = payload.winCard || null;
                    var wv = winVideoOf(payload); if (wv) known.winVideo = wv;
                    return byId[payload.id];
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null, frame: payload.frame || null, elimCard: payload.elimCard || null, winCard: payload.winCard || null, winVideo: winVideoOf(payload) };
                byId[payload.id] = name;
                return name;
            },
            has: function (name) { return !!byName[name]; },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            id: function (name) { return (byName[name] && byName[name].id) || null; },
            winVideo: function (name) { return (byName[name] && byName[name].winVideo) || null; },
            // اللاعب بصيغة AGP ({id, name, avatarUrl}) — لنقاط المنصة
            player: function (name) {
                var p = byName[name] || {};
                return { id: p.id || name, name: name, avatarUrl: p.avatar || null, elimCard: p.elimCard || null, winCard: p.winCard || null };
            },
            // لاعب عنده إطار مفعّل من المنصة → بيانات بطاقته، وإلا null
            framed: function (name) {
                var p = byName[name];
                return p && p.frame && p.frame.imageFilename ? { name: name, id: p.id, avatar: p.avatar, frame: p.frame } : null;
            },
            all: function () { return byName; }
        };
    }

    /** الانتقال لصفحة أخرى — النافذة العليا لو اللعبة داخل إطار (iframe). */
    function go(url) {
        try { if (window.top !== window) { window.top.location.href = url; return; } } catch (e) {}
        location.href = url;
    }

    window.SHIP = {
        libraryUrl: 'https://aymngames.online/',
        keys: { setup: 'ship-settings', join: 'ship-join', roster: 'ship-roster', players: 'ship-players', guideHide: 'ship-guide-hide-v2' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        connect: connect,
        onComment: onComment,
        onGift: onGift,
        giftMatches: giftMatches,
        streamerAvatar: streamerAvatar,
        createRegistry: createRegistry,
        go: go
    };
}());
