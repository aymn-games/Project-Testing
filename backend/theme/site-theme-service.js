/**
 * AGP SITE THEME SERVICE — ثيم ألوان مؤقت للمناسبات. صف واحد ثابت (id = 1)
 * يُستبدَل بالكامل مع كل تفعيل جديد. 3 أكواد لون (accent/accent_2/accent_pink)
 * يقرأها index.html ويطبّقها فوق متغيرات CSS الموجودة عبر
 * document.documentElement.style.setProperty وقت التحميل.
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * @returns {{presetKey: string|null, accent: string, accent2: string, accentPink: string}|null} null لو غير نشط
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
 * تفعيل ثيم جديد (أو تحديث الحالي) — الأدمن فقط. الأكواد الثلاثة إلزامية
 * (Hex صالح، مثال: "#006C35")؛ presetKey اختياري.
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
 * تعطيل الثيم فوراً. الأكواد القديمة تبقى محفوظة (active = 0 فقط، لا حذف).
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
