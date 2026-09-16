/**
 * AGP RATE LIMITER — واجهة محجوزة عمداً لعمل مستقبلي، غير مستدعاة من أي
 * مكان حالياً. لا خوارزمية فعلية مطبَّقة بعد؛ shouldAllow() تُعيد true
 * دائماً. لا تُحذف — محجوزة لتحديد معدّل رسائل تيك توك الحقيقية لاحقاً.
 */

'use strict';

var logger = require('./logger');

/**
 * @param {{ maxPerSecond: number }} options
 * @returns {{ shouldAllow: function(string): boolean }}
 */
function createRateLimiter(options) {
    logger.log('Rate Limiter: createRateLimiter() called — not implemented yet (Phase 4 skeleton only).', options);

    return {
        shouldAllow: function (key) {
            return true;
        }
    };
}

module.exports = {
    createRateLimiter: createRateLimiter
};
