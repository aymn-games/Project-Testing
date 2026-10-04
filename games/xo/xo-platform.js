/**
 * إكس أو — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * الشاشات الثلاث (index.html الإعدادات، lobby.html اللوبي، game.html
 * اللعبة) منقولة من ملفات التصميم المعتمدة كما هي وتشتغل عبر support.js.
 * هذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة:
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived').
 *  - الهدايا (الرجوع عن طريق الدعم): الحدث 'stream:giftReceived'.
 *  - بيانات اللاعبين (id/صورة) تُحفظ بـ 'xo-players' بجانب 'xo-roster'
 *    (أسماء فقط، كما في عقد البيانات بملف التصميم).
 *  - قواعد الانضمام (JOIN-RULES.md بملف التسليم): XO.join() وحدة مشتركة
 *    يستخدمها اللوبي ونافذة "دخول لاعبين جدد" داخل المباراة.
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

    // تطبيع النص قبل المقارنة — كلمة الدخول ورقم المربع بالشات.
    // نفس قواعد أسرع إجابة (نسخة موسَّعة من norm() في JOIN-RULES.md — تشمل كل حالاتها):
    // التشكيل والتطويل والرموز غير المرئية والترقيم · أ إ آ ٱ ← ا · ة ← ه · ى ← ي · ؤ ← و · ئ ← ي · حذف ء
    // الحروف الفارسية (ی ک ہ) · الأرقام العربية والفارسية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
            .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/).map(function (w) { return w.replace(/^ال/, ''); }).join('')
            .replace(/(\p{L})\1+/gu, '$1');
    }

    /**
     * قواعد الانضمام وتبديل الفريق (JOIN-RULES.md §1–2) لكل شاشات الدخول.
     * teams: [{name, keyword, max, members:[أسماء]}] — members هي العضوية
     * الفعلية الحالية (في نافذة المباراة تشمل المنضمين المعلّقين).
     * ترجع null لو الرسالة مو كلمة دخول، وإلا {k, cur, ok, toast}:
     * k فريق الكلمة، cur فريق اللاعب الحالي (-1 لو جديد)، ok هل يُنفَّذ.
     */
    function join(teams, user, text, opts) {
        var t = norm(text);
        var k = -1;
        for (var i = 0; i < teams.length; i++) if (teams[i].keyword && norm(teams[i].keyword) === t) { k = i; break; }
        if (k < 0) return null;
        var cur = -1;
        for (var j = 0; j < teams.length; j++) if (teams[j].members.indexOf(user) >= 0) { cur = j; break; }
        if (opts && opts.followersOnly && !opts.isFollower) return { k: k, cur: cur, ok: false, toast: null };
        if (cur === k) return { k: k, cur: cur, ok: false, toast: null };
        if (teams[k].members.length >= teams[k].max) return { k: k, cur: cur, ok: false, toast: teams[k].name + ' ممتلئ' };
        return { k: k, cur: cur, ok: true, toast: cur >= 0 ? user + ' انتقل إلى ' + teams[k].name : null };
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

    // هدايا قائمة الإعدادات (GIFTS في index.html) ← اسم الهدية كما يرسله تيك توك (giftName).
    var GIFT_NAMES = {
        rose: ['Rose'], tiktok: ['TikTok'], icecream: ['Ice Cream Cone', 'Ice Cream'],
        fingerheart: ['Finger Heart'], perfume: ['Perfume'], doughnut: ['Doughnut'],
        cap: ['Cap'], handhearts: ['Hand Hearts'], corgi: ['Corgi'],
        moneygun: ['Money Gun'], galaxy: ['Galaxy'], jet: ['Private Jet'],
        car: ['Sports Car'], lion: ['Lion'], universe: ['TikTok Universe', 'Universe']
    };
    function giftKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    /** هل اسم الهدية القادمة من البث يطابق هدية الإعدادات (id)؟ */
    function giftMatches(giftId, giftName) {
        var got = giftKey(giftName);
        if (!got) return false;
        if (got === giftKey(giftId)) return true;
        return (GIFT_NAMES[giftId] || []).some(function (n) { return giftKey(n) === got; });
    }

    /** cb(payload) لكل هدية من البث ({id, name, giftName, ...}). ترجع دالة لإلغاء الاستماع. */
    function onGift(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:giftReceived', function (payload) {
            if (!payload || !payload.id) return;
            cb(payload);
        });
    }

    /**
     * سجل اللاعبين: الشاشات تتعامل بالأسماء (كما في التصميم)، وهنا نربط كل
     * اسم بـ id ثابت من المنصة (tiktok:<username>) وصورته. لو تكرر اسم
     * العرض لحسابين مختلفين يُضاف رقم للاسم الثاني حتى يبقى كل اسم فريداً.
     */
    function createRegistry(initial) {
        var byName = Object.assign({}, initial || {});
        var byId = {};
        Object.keys(byName).forEach(function (n) { if (byName[n] && byName[n].id) byId[byName[n].id] = n; });
        return {
            nameFor: function (payload) {
                if (byId[payload.id]) {
                    var known = byId[payload.id];
                    if (payload.avatarUrl && !byName[known].avatar) byName[known].avatar = payload.avatarUrl;
                    return known;
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null };
                byId[payload.id] = name;
                return name;
            },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            id: function (name) { return (byName[name] && byName[name].id) || null; },
            all: function () { return byName; }
        };
    }

    window.XO = {
        libraryUrl: 'https://aymngames.online/',
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        join: join,
        connect: connect,
        onComment: onComment,
        onGift: onGift,
        giftMatches: giftMatches,
        createRegistry: createRegistry
    };
}());
