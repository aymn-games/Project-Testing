/**
 * AGP ANNOUNCEMENT SERVICE — إعلان/تنبيه واحد يديره الأدمن للزوار.
 * صف واحد ثابت (id = 1) في جدول announcement؛ الزوار (حتى غير المسجَّلين)
 * يشوفونه بالصفحة الرئيسية بنافذة منبثقة، في كل زيارة طالما نشط.
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * @returns {{text: string, imageFilename: string|null}|null} null لو غير نشط أو غير موجود
 */
function getActiveAnnouncement() {
    var row = db.prepare('SELECT text, image_filename, active FROM announcement WHERE id = 1').get();
    if (!row || !row.active) return null;
    return { text: row.text || '', imageFilename: row.image_filename || null };
}

/**
 * نشر/تحديث الإعلان — الأدمن فقط (يُتحقَّق من الدور بطبقة الراوت).
 * @param {string} text
 * @param {string} [imageFilename]
 * @returns {{success: boolean, error?: string}}
 */
function setAnnouncement(text, imageFilename) {
    text = (text || '').trim();
    if (!text) return { success: false, error: 'empty_text' };

    db.prepare(
        'INSERT INTO announcement (id, text, image_filename, active, updated_at) VALUES (1, ?, ?, 1, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET text = excluded.text, image_filename = excluded.image_filename, active = 1, updated_at = excluded.updated_at'
    ).run(text, (imageFilename || '').trim() || null, now());

    return { success: true };
}

/**
 * إزالة الإعلان فوراً. النص القديم يبقى محفوظاً (active = 0 فقط، لا حذف).
 * @returns {{success: boolean}}
 */
function clearAnnouncement() {
    db.prepare('UPDATE announcement SET active = 0, updated_at = ? WHERE id = 1').run(now());
    return { success: true };
}

module.exports = {
    getActiveAnnouncement: getActiveAnnouncement,
    setAnnouncement: setAnnouncement,
    clearAnnouncement: clearAnnouncement
};
