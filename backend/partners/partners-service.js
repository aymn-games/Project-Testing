/**
 * ==========================================================================
 *  AGP CREATIVE PARTNERS SERVICE — قسم "شركاء الإبداع" بالصفحة الرئيسية
 * ==========================================================================
 *
 * يربط حساب مسجَّل فعلي (عبر custom_id) بفئة: أصحاب أفكار (idea) أو فريق
 * تطوير (dev). عمداً لا نخزّن اسم/صورة بجدول creative_partners نفسه —
 * تُقرأ حيّة من users عند كل عرض (JOIN)، فلو الشخص غيّر اسم عرضه أو صورة
 * بروفايله تتحدّث تلقائياً هنا بدون أي تعديل يدوي. نفس فلسفة "الإطارات
 * المفعّلة" (equipFrame) وليس نفس فلسفة supporters (اللي أسماؤهم قد لا
 * تخص حساب مسجَّل أصلاً، فلازم تُخزَّن نصاً مباشرة).
 * ==========================================================================
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * إضافة (أو نقل فئة) شريك إبداع عبر custom_id — يبحث عن الحساب أولاً
 * (نفس بحث findUserForLinking بـsupporters-service.js)، ولو موجود
 * ومربوط من قبل بنفس الفئة يرجع نجاح بدون تكرار (UNIQUE على user_id+category).
 * @param {string} customId
 * @param {'idea'|'dev'} category
 * @returns {{success: boolean, error?: string, partner?: Object}}
 */
function addPartnerByCustomId(customId, category) {
    customId = (customId || '').trim();
    if (!customId) return { success: false, error: 'empty_custom_id' };
    if (category !== 'idea' && category !== 'dev') return { success: false, error: 'invalid_category' };

    var user = db.prepare(
        'SELECT id, custom_id, username, display_name, avatar_image_base64 FROM users WHERE custom_id = ?'
    ).get(customId);
    if (!user) return { success: false, error: 'not_found' };

    try {
        db.prepare(
            'INSERT INTO creative_partners (user_id, category, created_at) VALUES (?, ?, ?)'
        ).run(user.id, category, now());
    } catch (err) {
        // UNIQUE(user_id, category) — موجود بنفس الفئة من قبل، مو خطأ فعلي.
        if (!/UNIQUE/i.test(String(err && err.message))) throw err;
    }

    return {
        success: true,
        partner: {
            customId: user.custom_id,
            name: user.display_name || user.username,
            avatarBase64: user.avatar_image_base64 || null,
            category: category
        }
    };
}

/** حذف ربط شريك إبداع واحد (بمعرّف صف creative_partners، مو معرّف المستخدم). */
function removePartner(id) {
    db.prepare('DELETE FROM creative_partners WHERE id = ?').run(id);
    return { success: true };
}

/**
 * كل شركاء الإبداع — للوحة الأدمن (اسم المستخدم/الدور فيها، بيانات كاملة
 * كفاية للإدارة).
 * @returns {Array<Object>}
 */
function listPartnersAdmin() {
    var rows = db.prepare(
        `SELECT cp.id, cp.category, cp.created_at,
                u.custom_id AS customId, u.username, u.display_name AS displayName,
                u.avatar_image_base64 AS avatarBase64
         FROM creative_partners cp
         JOIN users u ON u.id = cp.user_id
         ORDER BY cp.category ASC, cp.created_at ASC`
    ).all();
    return rows.map(function (r) {
        return {
            id: r.id,
            category: r.category,
            customId: r.customId,
            name: r.displayName || r.username,
            avatarBase64: r.avatarBase64 || null,
            createdAt: r.created_at
        };
    });
}

/**
 * شركاء الإبداع للعرض العلني بالصفحة الرئيسية — مجمَّعين حسب الفئة، بدون
 * تسجيل دخول (نفس فلسفة /api/public/top-streamers، بيانات علنية فقط).
 * @returns {{idea: Array<Object>, dev: Array<Object>}}
 */
function getPartnersPublic() {
    var all = listPartnersAdmin();
    var result = { idea: [], dev: [] };
    all.forEach(function (p) {
        result[p.category].push({ customId: p.customId, name: p.name, avatarBase64: p.avatarBase64 });
    });
    return result;
}

module.exports = {
    addPartnerByCustomId: addPartnerByCustomId,
    removePartner: removePartner,
    listPartnersAdmin: listPartnersAdmin,
    getPartnersPublic: getPartnersPublic
};
