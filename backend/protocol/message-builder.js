/**
 * ==========================================================================
 *  AGP PROTOCOL — أدوات بناء الرسائل (Message Builder)
 * ==========================================================================
 *
 * دوال مساعدة بحتة لبناء غلاف رسالة صحيح الشكل (type + payload +
 * timestamp)، بنفس البنية الموثَّقة في docs/BACKEND_ARCHITECTURE.md §4
 * بالضبط. لا اتصال شبكي هنا إطلاقاً — فقط إنشاء كائنات JavaScript عادية
 * جاهزة لاحقاً لتُرسَل عبر WebSocket (عندما يُبنى فعلياً).
 * ==========================================================================
 */

'use strict';

var MESSAGE_TYPES = require('./message-types').MESSAGE_TYPES;

function buildEnvelope(type, payload) {
    return {
        type: type,
        payload: payload || {},
        timestamp: Date.now()
    };
}

module.exports = {
    buildStatusMessage: function (platform, status, message) {
        var payload = { platform: platform, status: status };
        if (message) payload.message = message;
        return buildEnvelope(MESSAGE_TYPES.STATUS, payload);
    },

    buildCommentMessage: function (platform, id, name, text, isFollower, avatarUrl, frame) {
        // ⚠️ [0.42.2] isFollower أُضيف هنا — كان يُحسَب فعلاً بالباك إند
        // (tiktok-connector.js) لكن يُفقَد قبل الوصول للمتصفح لأن هذي
        // الدالة نفسها ما كانت تستقبله ولا تضيفه لحمولة الرسالة، فيصل
        // للواجهة الأمامية `undefined` دائماً بصرف النظر عن حالة المتابعة
        // الحقيقية — هذا هو السبب الجذري الفعلي وراء فشل بوابة
        // "المتابعون فقط" حتى مع متابع حقيقي.
        //
        // ⚠️ [جديد] avatarUrl (رابط صورة بروفايل تيك توك، أو null) وframe
        // (الإطار المفعَّل لصاحب التعليق لو يملك حساباً موثَّقاً بالمنصة،
        // أو null) — تُستخدَم لبناء بطاقة اللاعب (صورة + اسم [+ إطار
        // باللوبي فقط]) بالواجهة الأمامية. راجع js/agp-player-card.js.
        return buildEnvelope(MESSAGE_TYPES.COMMENT, {
            platform: platform, id: id, name: name, text: text,
            isFollower: Boolean(isFollower),
            avatarUrl: avatarUrl || null,
            frame: frame || null
        });
    },

    buildGiftMessage: function (platform, id, name, giftName, giftValue, repeatCount) {
        return buildEnvelope(MESSAGE_TYPES.GIFT, {
            platform: platform, id: id, name: name,
            giftName: giftName, giftValue: giftValue, repeatCount: repeatCount || 1
        });
    },

    buildFollowMessage: function (platform, id, name) {
        return buildEnvelope(MESSAGE_TYPES.FOLLOW, { platform: platform, id: id, name: name });
    },

    buildErrorMessage: function (platform, code, message) {
        return buildEnvelope(MESSAGE_TYPES.ERROR, { platform: platform, code: code, message: message });
    }
};
