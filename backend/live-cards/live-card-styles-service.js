/**
 * AGP LIVE CARD STYLES — تصاميم مميزة لبطاقات «البثوث النشطة» بمكتبة الألعاب.
 * الأدمن يمنح أي حساب (عبر custom_id) تصميماً من STYLES يدوياً، أو يشيله.
 * التصميم محفوظ بعمود users.live_card_style (NULL = البطاقة العادية)،
 * و/api/public/live-streams يرجعه كـcard: {style, sponsor, host}، والواجهة (js/agp-live-streams.js)
 * ترسم البطاقة حسبه. أي تصميم جديد: أضفه هنا وأضف CSS له بنفس الملف.
 * مع التصميم سطرين اختياريين يكتبهم الأدمن: live_card_sponsor («البث برعاية …»)
 * وlive_card_host («يقدّم البث …») — يظهرون على البطاقة المميزة بس.
 */

'use strict';

var db = require('../db/database');

/** مفتاح التصميم ← اسمه بلوحة الأدمن (الواجهة لها نفس المفاتيح). */
var STYLES = {
    founder: 'المؤسس (أسود وذهبي)',
    platform: 'حساب المنصة — رسمي',
    vip: 'مميز (وردي لؤلؤي)',
    diamond: 'ألماسي (ثلجي)'
};

function isValidStyle(style) {
    return Object.prototype.hasOwnProperty.call(STYLES, style);
}

var TEXT_MAX = 40;

/** نص سطر اختياري: سطر واحد، بدون مسافات زايدة، 40 حرف بالكثير؛ الفاضي = null. */
function cleanText(v) {
    var t = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return t ? t.slice(0, TEXT_MAX) : null;
}

/**
 * منح تصميم لحساب (مع سطري «برعاية» و«يقدّم البث» الاختياريين)، أو شيله بـstyle = null/''
 * (الشيل يمسح السطرين بعد).
 * @returns {{success: boolean, error?: string}}
 */
function setStyleByCustomId(customId, style, sponsor, host) {
    customId = String(customId || '').trim();
    if (!customId) return { success: false, error: 'empty_custom_id' };
    style = style ? String(style) : null;
    if (style && !isValidStyle(style)) return { success: false, error: 'invalid_style' };
    var user = db.prepare('SELECT id FROM users WHERE custom_id = ?').get(customId);
    if (!user) return { success: false, error: 'not_found' };
    db.prepare('UPDATE users SET live_card_style = ?, live_card_sponsor = ?, live_card_host = ? WHERE id = ?')
        .run(style, style ? cleanText(sponsor) : null, style ? cleanText(host) : null, user.id);
    return { success: true };
}

/** كل الحسابات اللي عندها تصميم — للوحة الأدمن. */
function listAdmin() {
    return db.prepare(
        'SELECT custom_id, username, display_name, tiktok_username, tiktok_verified, tiktok_display_name, live_card_style, live_card_sponsor, live_card_host ' +
        'FROM users WHERE live_card_style IS NOT NULL ORDER BY live_card_style, username'
    ).all().map(function (u) {
        return {
            customId: u.custom_id,
            name: (u.tiktok_verified && u.tiktok_display_name) || u.display_name || u.username,
            tiktok: u.tiktok_verified ? (u.tiktok_username || null) : null,
            style: u.live_card_style,
            sponsor: u.live_card_sponsor || '',
            host: u.live_card_host || ''
        };
    });
}

/** بطاقة حساب واحد (لـ/api/public/live-streams): { style, sponsor, host } — null لو ما عنده
 * تصميم أو التصميم انشال من STYLES. */
function getCardByCustomId(customId) {
    var row = db.prepare('SELECT live_card_style, live_card_sponsor, live_card_host FROM users WHERE custom_id = ?').get(String(customId || ''));
    var style = row && row.live_card_style;
    if (!style || !isValidStyle(style)) return null;
    return { style: style, sponsor: row.live_card_sponsor || null, host: row.live_card_host || null };
}

module.exports = {
    STYLES: STYLES,
    setStyleByCustomId: setStyleByCustomId,
    listAdmin: listAdmin,
    getCardByCustomId: getCardByCustomId
};
