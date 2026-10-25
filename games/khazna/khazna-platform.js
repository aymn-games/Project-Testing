/**
 * الخزنة — ربط شاشة اللعبة (index.html، ملف تصميم .dc.html) بالمنصة.
 *
 * كل شاشات اللعبة (الإعدادات، اللوبي، العجلة، الجولة، النتيجة، الفوز)
 * بصفحة وحدة منقولة من ملف التصميم المعتمد وتشتغل عبر support.js (نفس
 * نمط games/elimination-roulette). هذا الملف هو طبقة الربط الوحيدة:
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الاتصال والشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الأحداث 'stream:statusChanged' و 'stream:commentReceived').
 *  - بطاقة الفوز المملوكة: KZ.winCard() عبر AGP.winCard المشترك.
 * يحتاج تحميل ملفات js/agp-*.js + الأدابتر + auth/auth-client.js قبله.
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';

    function getSavedConnection() {
        try {
            var raw = localStorage.getItem(STREAM_CONNECTION_STORAGE_KEY);
            var data = raw ? JSON.parse(raw) : null;
            return data && typeof data.username === 'string' && data.username ? data : null;
        } catch (e) { return null; }
    }

    // تطبيع النص قبل مقارنة كلمة الدخول (نفس تطبيع روليت الإقصاء):
    // التشكيل والتطويل والرموز غير المرئية والترقيم · أ إ آ ٱ ← ا · ة ← ه · ى ← ي · ؤ ← و · ئ ← ي · حذف ء
    // الحروف الفارسية (ی ک ہ) · الأرقام العربية والفارسية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
    function norm(s) {
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

    function isConnected() {
        return !!(AGP.streamConnector && typeof AGP.streamConnector.getStatus === 'function' &&
            AGP.streamConnector.getStatus('tiktok') === 'connected');
    }

    /** يبدأ الاتصال ببث الحساب الموثّق المحفوظ. ترجع false لو ما فيه اتصال محفوظ. */
    function connect() {
        var saved = getSavedConnection();
        if (!saved || !AGP.streamConnector) return false;
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

    /** cb(status, message) لكل تغيّر بحالة اتصال تيك توك. ترجع دالة لإلغاء الاستماع. */
    function onStatus(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:statusChanged', function (payload) {
            if (!payload || payload.platform !== 'tiktok') return;
            cb(payload.status, payload.message);
        });
    }

    /**
     * بطاقة الفوز المملوكة (js/agp-win-card.js) كعنصر React بعرض 240px —
     * تحل محل بطاقة الفائز العادية بنفس مكانها بشاشة الفوز، فقط لو الفائز
     * يملك بطاقة مفعّلة. player: {name, avatarUrl, winCard}. ترجع null لو ما يملك بطاقة.
     */
    function winCard(player, lines, key) {
        var React = window.React;
        if (!React || !AGP.winCard || !player || !AGP.winCard.canShow(player)) return null;
        return React.createElement('div', { key: key || 'wc', style: { width: 240, maxWidth: '100%', lineHeight: 0, animation: 'agpWinCardPop .55s cubic-bezier(.2,1.3,.4,1) both' }, dangerouslySetInnerHTML: { __html: AGP.winCard.renderHtml(player, lines, { pop: false }) } });
    }

    window.KZ = {
        libraryUrl: '../../games.html',
        getSavedConnection: getSavedConnection,
        norm: norm,
        isConnected: isConnected,
        connect: connect,
        onComment: onComment,
        onStatus: onStatus,
        winCard: winCard
    };
}());
