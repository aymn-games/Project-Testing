/**
 * ==========================================================================
 *  AGP SITE THEME SERVICE — ثيم ألوان مؤقت للمناسبات (اليوم الوطني وغيره)
 * ==========================================================================
 *
 * منطق بحت هنا (بدون أي معالجة HTTP — ذلك في backend/http/auth-router.js)،
 * بنفس فلسفة backend/announcements/announcement-service.js تماماً: صف
 * واحد ثابت (id = 1) يُستبدَل بالكامل مع كل تفعيل جديد من الأدمن.
 *
 * لا علاقة له بأي منطق AGP.* — فقط 3 أكواد لون (accent/accent_2/
 * accent_pink) يقرأها index.html ويطبّقها فوق متغيرات CSS الموجودة
 * أصلاً (--accent/--accent-2/--accent-pink) وقت التحميل، عبر
 * document.documentElement.style.setProperty — لا تعديل على أي ملف CSS
 * ثابت، تراجع فوري بمجرد التعطيل (active = 0). راجع docs/CHANGELOG.md.
 * ==========================================================================
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * الثيم الحالي إن كان نشطاً فعلاً — تُستدعى من مسار عام (بدون تسجيل
 * دخول) لتُطبَّق بالصفحة الرئيسية. ترجع null لو غير نشط أو غير موجود.
 * @returns {{presetKey: string|null, accent: string, accent2: string, accentPink: string}|null}
 */
function getActiveTheme() {
    var row = db.prepare('SELECT active, preset_key, accent, accent_2, accent_pink FROM site_theme WHERE id = 1').get();
    if (!row || !row.active) return null;
    return {
        presetKey: row.preset_key || null,
        accent: row.accent || '',
        accent2: row.accent_2 || '',
        accentPink: row.accent_pink || ''
    };
}

/**
 * تفعيل ثيم جديد (أو تحديث الثيم النشط الحالي) — الأدمن فقط. الأكواد
 * الثلاثة إلزامية (Hex صالح، مثال: "#006C35")؛ presetKey اختياري (اسم
 * الثيم الجاهز المختار، أو null لثيم مخصَّص بالكامل).
 * @param {string|null} presetKey
 * @param {string} accent
 * @param {string} accent2
 * @param {string} accentPink
 * @returns {{success: boolean, error?: string}}
 */
function setTheme(presetKey, accent, accent2, accentPink) {
    var hexPattern = /^#[0-9a-fA-F]{3,8}$/;
    accent = (accent || '').trim();
    accent2 = (accent2 || '').trim();
    accentPink = (accentPink || '').trim();

    if (!hexPattern.test(accent) || !hexPattern.test(accent2) || !hexPattern.test(accentPink)) {
        return { success: false, error: 'invalid_color' };
    }

    db.prepare(
        'INSERT INTO site_theme (id, active, preset_key, accent, accent_2, accent_pink, updated_at) VALUES (1, 1, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET active = 1, preset_key = excluded.preset_key, accent = excluded.accent, ' +
        'accent_2 = excluded.accent_2, accent_pink = excluded.accent_pink, updated_at = excluded.updated_at'
    ).run((presetKey || '').trim() || null, accent, accent2, accentPink, now());

    return { success: true };
}

/**
 * تعطيل الثيم فوراً — الموقع يرجع لألوانه الافتراضية من اللحظة
 * التالية لكل زائر. الأكواد القديمة تبقى محفوظة (active = 0 فقط، لا
 * حذف) حتى يقدر الأدمن يعيد تفعيلها بسرعة بدون إعادة كتابتها.
 * @returns {{success: boolean}}
 */
function clearTheme() {
    db.prepare('UPDATE site_theme SET active = 0, updated_at = ? WHERE id = 1').run(now());
    return { success: true };
}

module.exports = {
    getActiveTheme: getActiveTheme,
    setTheme: setTheme,
    clearTheme: clearTheme
};
