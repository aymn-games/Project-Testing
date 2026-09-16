/**
 * AGP PROTOCOL — شكل غلاف الرسالة { type, payload, timestamp }.
 * يتحقق فقط من الغلاف العام، لا من حقول payload الداخلية حسب النوع.
 *
 * شكل كل payload حسب النوع (توثيق فقط):
 *   connect:    { platform, username }
 *   disconnect: { platform }
 *   status:     { platform, status, message? }
 *   comment:    { platform, id, name, text, isFollower, avatarUrl, frame }
 *   gift:       { platform, id, name, giftName, giftValue, repeatCount }
 *   follow:     { platform, id, name }
 *   error:      { platform, code, message }
 */

'use strict';

var ALL_TYPES = require('./message-types').ALL_TYPES;

/**
 * تحقّق بنيوي سطحي فقط من غلاف الرسالة.
 * @param {*} message
 * @returns {boolean}
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
