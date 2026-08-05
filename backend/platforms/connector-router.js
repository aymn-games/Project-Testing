/**
 * ==========================================================================
 *  AGP CONNECTOR ROUTER — نقطة التبديل الوحيدة بين المحاكاة والاتصال الحقيقي
 * ==========================================================================
 *
 * هذا الملف هو **الملف الوحيد** الذي احتاج تعديلاً عند تفعيل موصِّل
 * تيك توك الحقيقي (platforms/tiktok/tiktok-connector.js). لا
 * websocket/ws-server.js ولا أي ملف آخر يعرف الفرق بين المحاكاة
 * والاتصال الحقيقي — كلاهما يطبّق نفس "شكل الموصِّل" تماماً.
 *
 * ✅ الحالة الآن (التبديل النهائي للإنتاج): 'tiktok' يُوجَّه إلى موصِّل
 *   تيك توك الحقيقي. موصِّل المحاكاة (platforms/mock/mock-connector.js)
 *   لم يُحذَف — يبقى مفيداً للاختبار المحلي بدون اتصال فعلي — لكنه لم
 *   يعد المسار النشط بالإنتاج.
 *
 * ⚠️ الرجوع لاحقاً للمحاكاة (اختبار محلي فقط) = سطر واحد فقط هنا:
 *   استبدال `tiktokConnector.createTikTokConnector()` بـ
 *   `mockConnector.createMockConnector()` مؤقّتاً، دون أي تعديل على
 *   ws-server.js أو البروتوكول أو الواجهة الأمامية إطلاقاً.
 * ==========================================================================
 */

'use strict';

var mockConnector = require('./mock/mock-connector'); // يبقى متاحاً للاختبار المحلي، غير مستخدَم بالإنتاج الآن
var tiktokConnector = require('./tiktok/tiktok-connector');

/**
 * جلب موصِّل جديد (نسخة مستقلة) للمنصة المطلوبة.
 * @param {string} platform - مثل 'tiktok'
 * @returns {{connect: function, disconnect: function, isConnected: function}|null}
 */
function createConnectorForPlatform(platform) {
    if (platform === 'tiktok') {
        // ⚠️ نقطة التبديل الوحيدة — راجع التعليق أعلى الملف.
        return tiktokConnector.createTikTokConnector();
    }
    return null;
}

/**
 * ⚠️ تشخيصي فقط — يعكس بالضبط نفس قرار createConnectorForPlatform أعلاه
 * بدون إنشاء موصِّل فعلي، يُستخدَم من server.js لفحص الصحة (/) حتى يكون
 * بالإمكان التأكد من نوع الموصِّل النشط بمجرد فتح رابط الباك اند.
 */
function getActiveConnectorName(platform) {
    if (platform === 'tiktok') return 'tiktok-connector.js (real)';
    return 'none';
}

module.exports = {
    createConnectorForPlatform: createConnectorForPlatform,
    getActiveConnectorName: getActiveConnectorName
};
