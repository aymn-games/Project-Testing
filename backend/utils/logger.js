/**
 * ==========================================================================
 *  AGP BACKEND LOGGER — أداة تسجيل بسيطة تحترم وضع Debug
 * ==========================================================================
 *
 * نفس فكرة AGP.log تماماً (js/agp-core.js في الواجهة الأمامية)، لكن هذه
 * نسخة مستقلة لعملية Node الخلفية — لا اعتماد بينهما إطلاقاً. تُستخدَم
 * داخل كل ملفات backend/ بدل console.log مباشرة، حتى يسهل التحكم
 * بالتسجيل مركزياً من config.js (config.debug).
 * ==========================================================================
 */

'use strict';

var config = require('../config');

/**
 * تسجيل رسالة تصحيح عادية (لا تظهر إن كان config.debug = false).
 */
function log() {
    if (!config.debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[AGP Backend]');
    console.log.apply(console, args);
}

/**
 * تسجيل خطأ — يظهر دائماً بصرف النظر عن وضع Debug (الأخطاء لا تُكتَم).
 */
function error() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[AGP Backend]');
    console.error.apply(console, args);
}

module.exports = {
    log: log,
    error: error
};
