/**
 * AGP PROTOCOL — أدوات بناء الرسائل (Message Builder). دوال بحتة تبني
 * غلاف رسالة صحيح الشكل (type + payload + timestamp)، بدون أي اتصال شبكي.
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
        // avatarUrl: رابط صورة بروفايل تيك توك أو null. frame: الإطار المفعَّل
        // لصاحب التعليق إن كان موثَّقاً، أو null. تُستخدَم لبطاقة اللاعب بالواجهة
        // الأمامية (راجع js/agp-player-card.js).
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
