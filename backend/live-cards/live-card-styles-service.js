/**
 * AGP LIVE CARD STYLES — تصاميم مميزة لبطاقات «البثوث النشطة» بمكتبة الألعاب.
 * الأدمن يمنح أي حساب (عبر custom_id) تصميماً من STYLES يدوياً، أو يشيله.
 * التصميم محفوظ بعمود users.live_card_style (NULL = البطاقة العادية)،
 * و/api/public/live-streams يرجعه كـcardStyle، والواجهة (js/agp-live-streams.js)
 * ترسم البطاقة حسبه. أي تصميم جديد: أضفه هنا وأضف CSS له بنفس الملف.
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

/**
 * منح تصميم لحساب، أو شيله بـstyle = null/''.
 * @returns {{success: boolean, error?: string, user?: Object}}
 */
function setStyleByCustomId(customId, style) {
    customId = String(customId || '').trim();
    if (!customId) return { success: false, error: 'empty_custom_id' };
    style = style ? String(style) : null;
    if (style && !isValidStyle(style)) return { success: false, error: 'invalid_style' };
    var user = db.prepare('SELECT id FROM users WHERE custom_id = ?').get(customId);
    if (!user) return { success: false, error: 'not_found' };
    db.prepare('UPDATE users SET live_card_style = ? WHERE id = ?').run(style, user.id);
    return { success: true };
}

/** كل الحسابات اللي عندها تصميم — للوحة الأدمن. */
function listAdmin() {
    return db.prepare(
        'SELECT custom_id, username, display_name, tiktok_username, tiktok_verified, tiktok_display_name, live_card_style ' +
        'FROM users WHERE live_card_style IS NOT NULL ORDER BY live_card_style, username'
    ).all().map(function (u) {
        return {
            customId: u.custom_id,
            name: (u.tiktok_verified && u.tiktok_display_name) || u.display_name || u.username,
            tiktok: u.tiktok_verified ? (u.tiktok_username || null) : null,
            style: u.live_card_style
        };
    });
}

/** تصميم حساب واحد (لـ/api/public/live-streams) — null لو ما عنده أو التصميم انشال من STYLES. */
function getStyleByCustomId(customId) {
    var row = db.prepare('SELECT live_card_style FROM users WHERE custom_id = ?').get(String(customId || ''));
    var style = row && row.live_card_style;
    return style && isValidStyle(style) ? style : null;
}

module.exports = {
    STYLES: STYLES,
    setStyleByCustomId: setStyleByCustomId,
    listAdmin: listAdmin,
    getStyleByCustomId: getStyleByCustomId
};
