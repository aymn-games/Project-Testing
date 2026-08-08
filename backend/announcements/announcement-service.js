/**
 * ==========================================================================
 *  AGP ANNOUNCEMENT SERVICE — إعلان/تنبيه واحد يديره الأدمن للزوار
 * ==========================================================================
 *
 * منطق بحت هنا (بدون أي معالجة HTTP — ذلك في backend/http/auth-router.js)،
 * بنفس فلسفة backend/auth/auth-service.js تماماً: ملف واحد بمسؤولية
 * واحدة، لا اعتماديات خارجية جديدة.
 *
 * صف واحد ثابت (id = 1) في جدول announcement (راجع backend/db/database.js)
 * — الأدمن ينشر نصاً (وصورة اختيارية عبر اسم ملف مرفوع لجذر المستودع،
 * بنفس أسلوب logo.png/hero-banner.png الحالي، لا نظام رفع صور جديد)،
 * ويقدر يزيله في أي وقت. الزوار (حتى غير المسجَّلين) يشوفونه بالصفحة
 * الرئيسية فقط، بنافذة منبثقة، في كل زيارة طالما نشط.
 * ==========================================================================
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * الإعلان الحالي إن كان نشطاً فعلاً — تُستدعى من مسار عام (بدون تسجيل
 * دخول) لتُعرَض بالصفحة الرئيسية. ترجع null لو غير نشط أو غير موجود
 * إطلاقاً (لا فرق للزائر بين الحالتين).
 * @returns {{text: string, imageFilename: string|null}|null}
 */
function getActiveAnnouncement() {
    var row = db.prepare('SELECT text, image_filename, active FROM announcement WHERE id = 1').get();
    if (!row || !row.active) return null;
    return { text: row.text || '', imageFilename: row.image_filename || null };
}

/**
 * نشر/تحديث الإعلان — الأدمن فقط (يُتحقَّق من الدور بطبقة الراوت، لا
 * فحص صلاحية هنا). يستبدل نص/صورة الإعلان بالكامل ويُفعّله فوراً.
 * @param {string} text
 * @param {string} [imageFilename] - اسم ملف مرفوع لجذر المستودع، اختياري
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
 * إزالة الإعلان فوراً (يختفي من الصفحة الرئيسية لكل الزوار من اللحظة
 * التالية). النص القديم يبقى محفوظاً بالصف (active = 0 فقط، لا حذف)
 * حتى يقدر الأدمن يشوفه/يعيد نشره لاحقاً بدون إعادة كتابته من الصفر.
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
