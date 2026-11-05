/**
 * AGP CONNECTOR ROUTER — نقطة التبديل الوحيدة بين المحاكاة والاتصال الحقيقي.
 * ws-server.js وباقي الملفات لا تعرف الفرق، تتعامل مع "شكل الموصِّل" فقط.
 *
 * ⚠️ للرجوع للمحاكاة (اختبار محلي فقط): استبدال
 *   `tiktokConnector.createTikTokConnector()` بـ
 *   `mockConnector.createMockConnector()` أدناه — لا تعديل آخر مطلوب.
 */

'use strict';

var mockConnector = require('./mock/mock-connector'); // يبقى متاحاً للاختبار المحلي، غير مستخدَم بالإنتاج الآن
var tiktokConnector = require('./tiktok/tiktok-connector'); // يُستخدَم عبر المجمّع تحت
var connectionPool = require('./tiktok/shared-connection-pool');

/**
 * جلب موصِّل جديد (نسخة مستقلة) للمنصة المطلوبة.
 * @param {string} platform - مثل 'tiktok'
 * @returns {{connect: function, disconnect: function, isConnected: function}|null}
 */
function createConnectorForPlatform(platform, meta) {
    if (platform === 'tiktok') {
        // ⚠️ نقطة التبديل الوحيدة — راجع التعليق أعلى الملف.
        // موصِّل مشترك: اتصال تيك توك واحد لكل بث مهما كثرت الصفحات
        // (shared-connection-pool.js) — يوفّر طلبات توقيع EulerStream.
        // meta.source للعداد فقط (game:<slug>، library، watcher، challenge).
        return connectionPool.createLease(meta);
    }
    return null;
}

/**
 * ⚠️ تشخيصي فقط — يعكس بالضبط نفس قرار createConnectorForPlatform أعلاه
 * بدون إنشاء موصِّل فعلي، يُستخدَم من server.js لفحص الصحة (/) حتى يكون
 * بالإمكان التأكد من نوع الموصِّل النشط بمجرد فتح رابط الباك اند.
 */
function getActiveConnectorName(platform) {
    if (platform === 'tiktok') return 'tiktok-connector.js (real, shared pool)';
    return 'none';
}

module.exports = {
    createConnectorForPlatform: createConnectorForPlatform,
    getActiveConnectorName: getActiveConnectorName
};
