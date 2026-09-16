/**
 * AGP BACKEND LOGGER — أداة تسجيل بسيطة، تُستخدَم بدل console.log مباشرة
 * حتى يسهل التحكم بالتسجيل مركزياً من config.js (config.debug).
 */

'use strict';

var config = require('../config');

/** تسجيل رسالة تصحيح (لا تظهر إن كان config.debug = false). */
function log() {
    if (!config.debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[AGP Backend]');
    console.log.apply(console, args);
}

/** تسجيل خطأ — يظهر دائماً بصرف النظر عن وضع Debug. */
function error() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[AGP Backend]');
    console.error.apply(console, args);
}

/**
 * تسجيل معلومة تشغيلية مهمة — تظهر دائماً بعكس log()، لأن Render يضبط
 * NODE_ENV=production تلقائياً (فتصير config.debug=false وتُكتَم log()).
 */
function info() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[AGP Backend]');
    console.log.apply(console, args);
}

module.exports = {
    log: log,
    error: error,
    info: info
};
