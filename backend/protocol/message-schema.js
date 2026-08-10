/**
 * ==========================================================================
 *  AGP PROTOCOL — شكل غلاف الرسالة (Message Envelope Schema)
 * ==========================================================================
 *
 * يتحقق هذا الملف فقط من **شكل الغلاف العام** (Envelope) الموثَّق في
 * docs/BACKEND_ARCHITECTURE.md §3: { type, payload, timestamp }. لا
 * يتحقق من حقول كل payload تحديداً حسب نوعه (comment/gift/follow/...) —
 * ذلك تفصيل تنفيذي مؤجَّل عمداً لمرحلة لاحقة، بعد اكتمال بروتوكول
 * WebSocket الفعلي؛ هنا فقط توثيق الشكل المتوقَّع لكل نوع كتعليقات.
 *
 * شكل كل payload حسب النوع (توثيق فقط، لا تحقق فعلي حالياً):
 *   connect:    { platform, username }
 *   disconnect: { platform }
 *   status:     { platform, status, message? }
 *   comment:    { platform, id, name, text, isFollower, avatarUrl, frame } // isFollower [0.42.2]، avatarUrl/frame [جديد]
 *   gift:       { platform, id, name, giftName, giftValue, repeatCount }
 *   follow:     { platform, id, name }
 *   error:      { platform, code, message }
 * ==========================================================================
 */

'use strict';

var ALL_TYPES = require('./message-types').ALL_TYPES;

/**
 * تحقّق بنيوي سطحي فقط من غلاف الرسالة — لا يتحقق من حقول payload
 * الداخلية حسب النوع (مؤجَّل، راجع التعليق أعلاه).
 * @param {*} message
 * @returns {boolean} true إن كان الشكل العام صالحاً
 */
function isValidEnvelope(message) {
    if (!message || typeof message !== 'object') return false;
    if (ALL_TYPES.indexOf(message.type) === -1) return false;
    if (!message.payload || typeof message.payload !== 'object') return false;
    return true;
}

module.exports = {
    isValidEnvelope: isValidEnvelope
};
