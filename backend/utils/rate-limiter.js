/**
 * ==========================================================================
 *  AGP RATE LIMITER — واجهة محجوزة عمداً لعمل مستقبلي (ليست كوداً ميتاً)
 * ==========================================================================
 *
 * ⚠️ حالة متعمَّدة، وُثِّقت صراحة (بدل حذف الملف) عند مراجعة معمارية
 *   نهائية بعد تفعيل موصِّل تيك توك الحقيقي: هذا الملف **غير مُستدعى من
 *   أي مكان حالياً** (لا `ws-server.js` ولا غيره)، لكنه محجوز عمداً
 *   لتحديد معدّل الرسائل الواردة (راجع docs/BACKEND_ARCHITECTURE.md §8)
 *   بمجرد رصد حجم حركة تيك توك حقيقي يستدعي ذلك. لا يُحذَف.
 *
 * يوثّق هذا الملف الواجهة المتوقَّعة لأداة تحديد معدّل عامة — لا علاقة
 * لها بأي منصة بعينها. لا خوارزمية فعلية (Token Bucket أو غيرها)
 * مطبَّقة بعد؛ shouldAllow() تُعيد true دائماً حالياً (بلا أي تقييد
 * فعلي).
 * ==========================================================================
 */

'use strict';

var logger = require('./logger');

/**
 * إنشاء أداة تحديد معدّل بإعدادات معيّنة. **الجسم الفعلي غير مُنفَّذ
 * بعد** — هذا فقط الشكل الذي ستأخذه الواجهة العامة لاحقاً.
 * @param {{ maxPerSecond: number }} options
 * @returns {{ shouldAllow: function(string): boolean }}
 */
function createRateLimiter(options) {
    logger.log('Rate Limiter: createRateLimiter() called — not implemented yet (Phase 4 skeleton only).', options);

    return {
        /**
         * هل مسموح بمرور طلب/حدث جديد لمفتاح معيّن (مثل معرّف اتصال)؟
         * **غير مُنفَّذة فعلياً بعد** — تُعيد true دائماً حالياً.
         * @param {string} key
         * @returns {boolean}
         */
        shouldAllow: function (key) {
            return true;
        }
    };
}

module.exports = {
    createRateLimiter: createRateLimiter
};
