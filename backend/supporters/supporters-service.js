/**
 * ==========================================================================
 *  AGP SUPPORTERS SERVICE — سجل داعمي المنصة (اسم/رسالة/مبلغ)
 * ==========================================================================
 *
 * منطق بحت هنا (بدون أي معالجة HTTP — ذلك في backend/http/auth-router.js)،
 * بنفس فلسفة backend/announcements/announcement-service.js تماماً: ملف
 * واحد بمسؤولية واحدة، لا اعتماديات خارجية جديدة.
 *
 * ⚠️ **ملاحظة صادقة مهمة**: لا يوجد حالياً أي ربط تلقائي مع منصة الدعم
 * الفعلية (كريترز/دكان تب سابقاً، creators.sa) — بحثنا ولم نجد توثيق
 * API/Webhook عام لها، وصاحب المشروع ينتظر رد الدعم الفني منهم. لذلك كل
 * صف هنا يُدخَل **يدوياً من الأدمن** (admin.html) بعد ما يشوف الدعم فعلياً
 * بلوحة تحكم كريترز. متى توفّر Webhook حقيقي من عندهم، يُضاف مسار HTTP
 * عام جديد يستقبله وينادي addSupporter() هنا بدون أي تغيير على هذا
 * الملف أو على واجهة العرض (index.html/top-supporters.html) — التخزين
 * والعرض مستقلان تماماً عن مصدر الإدخال. راجع docs/CHANGELOG.md.
 * ==========================================================================
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * إضافة صف دعم جديد — الأدمن فقط (يُتحقَّق من الدور بطبقة الراوت، لا
 * فحص صلاحية هنا). name إلزامي، message/amount اختياريان.
 * @param {string} name
 * @param {string} [message]
 * @param {number} [amount]
 * @returns {{success: boolean, error?: string, supporter?: Object}}
 */
function addSupporter(name, message, amount) {
    name = (name || '').trim();
    if (!name) return { success: false, error: 'empty_name' };

    var numericAmount = Number(amount);
    if (!isFinite(numericAmount) || numericAmount < 0) numericAmount = 0;

    var createdAt = now();
    var result = db.prepare(
        'INSERT INTO supporters (name, message, amount, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, (message || '').trim(), numericAmount, createdAt);

    return {
        success: true,
        supporter: {
            id: result.lastInsertRowid,
            name: name,
            message: (message || '').trim(),
            amount: numericAmount,
            created_at: createdAt
        }
    };
}

/**
 * آخر N داعمين (الأحدث أولاً) — تُستخدَم بالشريط المتحرك بالصفحة
 * الرئيسية (راجع index.html، مكان النص القديم "لتفعيل الاشتراك...").
 * @param {number} [limit]
 * @returns {Array<Object>}
 */
function listRecent(limit) {
    var n = Number(limit) || 3;
    return db.prepare('SELECT id, name, message, amount, created_at FROM supporters ORDER BY created_at DESC LIMIT ?').all(n);
}

/**
 * توب الداعمين — مجموع المبالغ لكل اسم داعم (قد يدعم نفس الشخص أكثر
 * من مرة)، مرتّبة تنازلياً. لا ربط بحساب مستخدم (الداعم قد لا يملك
 * حساباً بالمنصة أصلاً) — التجميع بالاسم النصي كما أدخله الأدمن.
 * @param {number} [limit]
 * @returns {Array<{name: string, totalAmount: number, donationsCount: number, lastDonationAt: number}>}
 */
function listTop(limit) {
    var n = Number(limit) || 20;
    var rows = db.prepare(
        'SELECT name, SUM(amount) AS totalAmount, COUNT(*) AS donationsCount, MAX(created_at) AS lastDonationAt ' +
        'FROM supporters GROUP BY name ORDER BY totalAmount DESC LIMIT ?'
    ).all(n);
    return rows;
}

/**
 * كل صفوف الدعم (الأحدث أولاً) — لوحة إدارة الأدمن فقط، تشمل id لكل
 * صف عشان يقدر يحذف إدخالاً خاطئاً (راجع deleteSupporter أدناه).
 * @param {number} [limit]
 * @returns {Array<Object>}
 */
function listAll(limit) {
    var n = Number(limit) || 200;
    return db.prepare('SELECT id, name, message, amount, created_at FROM supporters ORDER BY created_at DESC LIMIT ?').all(n);
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
    listRecent: listRecent,
    listTop: listTop,
    listAll: listAll,
    deleteSupporter: deleteSupporter
};
