/**
 * AGP SUPPORTERS SERVICE — سجل داعمي المنصة (اسم/رسالة/مبلغ).
 *
 * مصدران: تلقائي من Streamlabs حساب المنصة (supporters/platform-streamlabs.js ←
 * addStreamlabsDonation، رمز PLATFORM_STREAMLABS_SOCKET_TOKEN)، ويدوي من الأدمن
 * (admin.html ← الداعمون). العرض العام الأحدث أولاً (listRecent).
 *
 * ربط اختياري بحساب مسجَّل عبر custom_id: لو موجود، دوال العرض تُظهر اسم
 * وصورة الحساب الحيّة بدل الاسم النصي الثابت وقت الإدخال.
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

// أعمدة العرض المشتركة — LEFT JOIN لجلب اسم/صورة الحساب المرتبط لو موجود.
var SELECT_WITH_USER =
    'SELECT s.id, s.name, s.message, s.amount, s.currency, s.sl_id, s.created_at, s.user_id, ' +
    'u.display_name AS linked_display_name, u.username AS linked_username, ' +
    'u.avatar_image_base64 AS linked_avatar, u.custom_id AS linked_custom_id ' +
    'FROM supporters s LEFT JOIN users u ON u.id = s.user_id ';

function decorateRow(row) {
    var linkedName = row.linked_display_name || row.linked_username || null;
    return {
        id: row.id,
        name: linkedName || row.name,
        message: row.message,
        amount: row.amount,
        currency: row.currency || 'USD',
        source: row.sl_id ? 'streamlabs' : 'manual',
        created_at: row.created_at,
        linked: Boolean(row.user_id),
        avatarBase64: row.linked_avatar || null,
        customId: row.linked_custom_id || null
    };
}

/**
 * بحث سريع عن حساب مسجَّل عبر custom_id — لعرض معاينة حيّة بلوحة الأدمن
 * قبل تأكيد الربط. لا يفشح بيانات حساسة، فقط ما سيظهر علنياً أصلاً.
 * @param {string} customId
 * @returns {{success: boolean, error?: string, user?: Object}}
 */
function findUserForLinking(customId) {
    customId = (customId || '').trim();
    if (!customId) return { success: false, error: 'empty_custom_id' };

    var row = db.prepare(
        'SELECT id, custom_id, username, display_name, avatar_image_base64 FROM users WHERE custom_id = ?'
    ).get(customId);

    if (!row) return { success: false, error: 'not_found' };

    return {
        success: true,
        user: {
            id: row.id,
            customId: row.custom_id,
            name: row.display_name || row.username,
            avatarBase64: row.avatar_image_base64 || null
        }
    };
}

/**
 * إضافة صف دعم جديد — الأدمن فقط (يُتحقَّق من الدور بطبقة الراوت، لا
 * فحص صلاحية هنا). name إلزامي دائماً (حتى لو مربوط بحساب — يبقى بديلاً
 * احتياطياً)، message/amount/customId اختيارية.
 * @param {string} name
 * @param {string} [message]
 * @param {number} [amount]
 * @param {string} [customId] - لو مُمرَّر، لازم يطابق حساباً موجوداً فعلاً
 * @returns {{success: boolean, error?: string, supporter?: Object}}
 */
function addSupporter(name, message, amount, customId) {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'empty_name' };

    var numericAmount = Number(amount);
    if (!isFinite(numericAmount) || numericAmount < 0) numericAmount = 0;

    var userId = null;
    customId = (customId || '').trim();
    if (customId) {
        var found = findUserForLinking(customId);
        if (!found.success) return { success: false, error: 'unknown_linked_user' };
        userId = found.user.id;
    }

    var createdAt = now();
    var result = db.prepare(
        'INSERT INTO supporters (name, message, amount, created_at, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, (message || '').trim(), numericAmount, createdAt, userId);

    return {
        success: true,
        supporter: {
            id: result.lastInsertRowid,
            name: name,
            message: (message || '').trim(),
            amount: numericAmount,
            created_at: createdAt,
            linked: Boolean(userId)
        }
    };
}

/**
 * دونيشن وصل من Streamlabs حساب المنصة — يُحفظ مرة وحدة بس (sl_id فريد).
 * @param {{slId: string|number, name?: string, amount: number|string, currency?: string, message?: string}} d
 * @returns {Object|null} الصف الجديد، أو null لو مكرر أو غير صالح
 */
function addStreamlabsDonation(d) {
    if (!d || d.slId == null || d.slId === '') return null;
    var amount = Number(String(d.amount == null ? '' : d.amount).replace(/[,\s]/g, ''));
    if (!isFinite(amount) || amount <= 0) return null;
    amount = Math.round(amount * 100) / 100;
    var name = String(d.name || '').trim().slice(0, 60) || 'داعم';
    var message = String(d.message || '').trim().slice(0, 300);
    var currency = String(d.currency || 'USD').trim().toUpperCase().slice(0, 8) || 'USD';
    var createdAt = now();
    var result = db.prepare(
        'INSERT OR IGNORE INTO supporters (name, message, amount, currency, sl_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, message, amount, currency, 'sl:' + String(d.slId), createdAt);
    if (!result.changes) return null;
    return { id: result.lastInsertRowid, name: name, message: message, amount: amount, currency: currency, created_at: createdAt };
}

/**
 * آخر N داعمين (الأحدث أولاً) — قائمة الداعمين بالصفحة الرئيسية
 * (js/agp-home.js) وصفحة top-supporters.html: كل دعم جديد يصير الأول.
 * @param {number} [limit]
 * @returns {Array<Object>}
 */
function listRecent(limit) {
    var n = Number(limit) || 3;
    var rows = db.prepare(SELECT_WITH_USER + 'ORDER BY s.created_at DESC, s.id DESC LIMIT ?').all(n);
    return rows.map(decorateRow);
}

/**
 * توب الداعمين — مجموع المبالغ لكل داعم، مرتّبة تنازلياً. التجميع حسب
 * الحساب المرتبط (user_id) لو موجود، وإلا حسب الاسم النصي.
 * @param {number} [limit]
 * @returns {Array<{name: string, totalAmount: number, donationsCount: number, lastDonationAt: number}>}
 */
function listTop(limit) {
    var n = Number(limit) || 20;
    var rows = db.prepare(
        'SELECT s.name, s.user_id, ' +
        'u.display_name AS linked_display_name, u.username AS linked_username, ' +
        'u.avatar_image_base64 AS linked_avatar, u.custom_id AS linked_custom_id, ' +
        'SUM(s.amount) AS totalAmount, COUNT(*) AS donationsCount, MAX(s.created_at) AS lastDonationAt ' +
        'FROM supporters s LEFT JOIN users u ON u.id = s.user_id ' +
        'GROUP BY COALESCE(s.user_id, s.name) ORDER BY totalAmount DESC LIMIT ?'
    ).all(n);

    return rows.map(function (row) {
        var linkedName = row.linked_display_name || row.linked_username || null;
        return {
            name: linkedName || row.name,
            totalAmount: row.totalAmount,
            donationsCount: row.donationsCount,
            lastDonationAt: row.lastDonationAt,
            linked: Boolean(row.user_id),
            avatarBase64: row.linked_avatar || null,
            customId: row.linked_custom_id || null
        };
    });
}

/**
 * كل صفوف الدعم (الأحدث أولاً) — لوحة إدارة الأدمن فقط، تشمل id لكل
 * صف عشان يقدر يحذف إدخالاً خاطئاً (راجع deleteSupporter أدناه).
 * @param {number} [limit]
 * @returns {Array<Object>}
 */
function listAll(limit) {
    var n = Number(limit) || 200;
    var rows = db.prepare(SELECT_WITH_USER + 'ORDER BY s.created_at DESC, s.id DESC LIMIT ?').all(n);
    return rows.map(decorateRow);
}

/**
 * حذف صف دعم واحد (تصحيح خطأ إدخال يدوي) — الأدمن فقط.
 * @param {number} id
 * @returns {{success: boolean}}
 */
function deleteSupporter(id) {
    db.prepare('DELETE FROM supporters WHERE id = ?').run(Number(id));
    return { success: true };
}

module.exports = {
    addSupporter: addSupporter,
    addStreamlabsDonation: addStreamlabsDonation,
    listRecent: listRecent,
    listTop: listTop,
    listAll: listAll,
    deleteSupporter: deleteSupporter,
    findUserForLinking: findUserForLinking
};
