/**
 * ==========================================================================
 *  AGP PASSWORD — تجزئة كلمات المرور (scrypt المدمجة في Node، بلا مكتبة)
 * ==========================================================================
 */

'use strict';

var crypto = require('crypto');

var KEY_LENGTH = 64;

/**
 * تجزئة كلمة مرور جديدة — يُنتَج ملح (Salt) عشوائي مختلف كل مرة.
 * @param {string} password
 * @returns {string} النص المخزَّن بقاعدة البيانات، بصيغة "salt:hash"
 */
function hashPassword(password) {
    var salt = crypto.randomBytes(16).toString('hex');
    var hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    return salt + ':' + hash;
}

/**
 * التحقق من كلمة مرور مقابل القيمة المخزَّنة، بمقارنة زمن ثابت
 * (Timing-Safe) لتفادي هجمات قياس الزمن.
 * @param {string} password
 * @param {string} stored - القيمة المخزَّنة (من hashPassword)
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
    var parts = (stored || '').split(':');
    if (parts.length !== 2) return false;
    var salt = parts[0], expectedHash = parts[1];
    var actualHash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    var expectedBuffer = Buffer.from(expectedHash, 'hex');
    var actualBuffer = Buffer.from(actualHash, 'hex');
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = {
    hashPassword: hashPassword,
    verifyPassword: verifyPassword
};
