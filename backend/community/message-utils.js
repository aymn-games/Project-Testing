'use strict';

/**
 * أدوات مشتركة لرسائل «مجتمعي» (شات الفريق والرسائل الخاصة):
 * تنظيف النص، وحد سرعة الإرسال لكل مستخدم.
 */

var MAX_BODY = 500;
var MIN_GAP_MS = 1200;   // رسالة وحدة كل 1.2 ثانية
var BURST = 5;           // أو 5 رسائل ورا بعض بحد أقصى، بعدها انتظار
var BURST_WINDOW_MS = 10000;

/** نص الرسالة بعد التنظيف، أو null لو فاضي. يشيل رموز التحكم ويقص الطول. */
function cleanBody(raw) {
    var s = String(raw == null ? '' : raw)
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!s) return null;
    return Array.from(s).slice(0, MAX_BODY).join('');
}

/** حد السرعة (بالذاكرة): يرجع true لو مسموح يرسل الحين. */
function makeLimiter(now) {
    var hits = new Map();
    return function allow(key) {
        var t = now();
        var list = (hits.get(key) || []).filter(function (x) { return t - x < BURST_WINDOW_MS; });
        if (list.length && t - list[list.length - 1] < MIN_GAP_MS) return false;
        if (list.length >= BURST) return false;
        list.push(t);
        hits.set(key, list);
        if (hits.size > 5000) hits.clear();
        return true;
    };
}

module.exports = { cleanBody: cleanBody, makeLimiter: makeLimiter, MAX_BODY: MAX_BODY };
