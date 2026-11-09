/**
 * إعدادات الألعاب المشتركة للستريمر — كلمة الدخول + أسماء وكلمات دخول
 * الفريقين. أول ما يكتبها الستريمر بأي لعبة تنحفظ بحسابه، وكل لعبة ثانية
 * يفتحها تلقاها مكتوبة تلقائياً (js/agp-shared-prefs.js). تتغير بس لما
 * يعدّلها بنفسه من أي لعبة.
 *
 * تُخزَّن JSON بعمود users.game_prefs (database.js).
 */

'use strict';

var FIELDS = ['keyword', 'team1Name', 'team1Keyword', 'team2Name', 'team2Keyword'];
var MAX_LEN = 40;

/**
 * ينظّف المدخل: الحقول المعروفة فقط، نصوص مقصوصة بطول معقول.
 * حقل فاضي أو غير موجود ما يُرجَع (ما يمسح القيمة المحفوظة).
 * @param {object} input
 * @returns {object}
 */
function sanitize(input) {
    var out = {};
    if (!input || typeof input !== 'object') return out;
    FIELDS.forEach(function (k) {
        if (typeof input[k] !== 'string') return;
        var v = input[k].replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_LEN);
        if (v) out[k] = v;
    });
    return out;
}

function parse(raw) {
    try {
        var obj = JSON.parse(raw || '{}');
        var clean = sanitize(obj);
        if (typeof obj.updatedAt === 'number' && isFinite(obj.updatedAt)) clean.updatedAt = obj.updatedAt;
        return clean;
    } catch (e) { return {}; }
}

function db() { return require('../db/database'); }

/**
 * @param {number} userId
 * @returns {object} {keyword?, team1Name?, team1Keyword?, team2Name?, team2Keyword?, updatedAt?}
 */
function get(userId) {
    var row = db().prepare('SELECT game_prefs FROM users WHERE id = ?').get(userId);
    return row ? parse(row.game_prefs) : {};
}

/**
 * يدمج القيم الجديدة فوق المحفوظة (الحقول اللي ما انرسلت تبقى زي ما هي).
 * @param {number} userId
 * @param {object} input
 * @returns {{success: boolean, prefs?: object, error?: string}}
 */
function save(userId, input) {
    var changes = sanitize(input);
    if (!Object.keys(changes).length) return { success: false, error: 'empty' };
    var current = get(userId);
    var next = Object.assign({}, current, changes, { updatedAt: Date.now() });
    var r = db().prepare('UPDATE users SET game_prefs = ? WHERE id = ?').run(JSON.stringify(next), userId);
    if (!r.changes) return { success: false, error: 'not_found' };
    return { success: true, prefs: next };
}

module.exports = { FIELDS: FIELDS, sanitize: sanitize, get: get, save: save };
