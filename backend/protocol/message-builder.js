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

    buildCommentMessage: function (platform, id, name, text, isFollower, avatarUrl, frame, elimCard, winCard, character) {
        // avatarUrl: رابط صورة بروفايل تيك توك أو null. frame: الإطار المفعَّل
        // لصاحب التعليق إن كان موثَّقاً، أو null. تُستخدَم لبطاقة اللاعب بالواجهة
        // الأمامية (راجع js/agp-player-card.js). elimCard: بطاقة الإقصاء
        // المفعّلة {cardKey} أو null (راجع js/agp-elim-card.js). winCard: بطاقة
        // الفوز المفعّلة {cardKey} أو null (راجع js/agp-win-card.js). character:
        // شخصية الأنمي: 'girl'|'boy' اختاره، 'any' عنده حساب وما اختار، null ما عنده حساب (docs/CHARACTERS.md).
        return buildEnvelope(MESSAGE_TYPES.COMMENT, {
            platform: platform, id: id, name: name, text: text,
            isFollower: Boolean(isFollower),
            avatarUrl: avatarUrl || null,
            frame: frame || null,
            elimCard: elimCard || null,
            winCard: winCard || null,
            character: character === 'girl' || character === 'boy' || character === 'any' ? character : null
        });
    },

    buildGiftMessage: function (platform, id, name, giftName, giftValue, repeatCount, giftId, avatarUrl) {
        return buildEnvelope(MESSAGE_TYPES.GIFT, {
            platform: platform, id: id, name: name,
            giftName: giftName, giftId: giftId || null, giftValue: giftValue, repeatCount: repeatCount || 1,
            avatarUrl: avatarUrl || null   // صورة حساب الداعم (اختياري — للألعاب اللي تعرض اللاعب من أول دعم)
        });
    },

    buildFollowMessage: function (platform, id, name) {
        return buildEnvelope(MESSAGE_TYPES.FOLLOW, { platform: platform, id: id, name: name });
    },

    // تكبيسات (لايكات) مشاهد: count = مجموع التكبيسات بالدفعة (تيك توك يجمّعها، والخادم يجمّعها أكثر كل ~300ms).
    // avatarUrl = صورة حساب تيك توك (فورمولا ون تكمّل فيها صورة اللاعب لو دخل بدونها).
    buildLikeMessage: function (platform, id, name, count, avatarUrl) {
        return buildEnvelope(MESSAGE_TYPES.LIKE, { platform: platform, id: id, name: name, count: Math.max(1, Number(count) || 1), avatarUrl: avatarUrl || null });
    },

    buildErrorMessage: function (platform, code, message) {
        return buildEnvelope(MESSAGE_TYPES.ERROR, { platform: platform, code: code, message: message });
    }
};
