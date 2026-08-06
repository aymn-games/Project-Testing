/**
 * ==========================================================================
 *  AGP HTTP RESPONSE — أدوات استجابة JSON + CORS (بدون أي مكتبة خارجية)
 * ==========================================================================
 *
 * مسؤولية واحدة فقط: كتابة استجابة JSON موحّدة، وتطبيق ترويسات CORS حسب
 * config.corsAllowedOrigins. لا معرفة هنا بأي مسار أو منطق أعمال — ذلك
 * في http/auth-router.js.
 * ==========================================================================
 */

'use strict';

/**
 * تطبيق ترويسات CORS على استجابة معيّنة حسب أصل الطلب (Origin) وقائمة
 * config.corsAllowedOrigins. الجلسات تُمرَّر عبر Authorization Bearer
 * فقط (لا كوكيز)، فعكس أي أصل مسموح آمن هنا (راجع تعليق config.js).
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Object} config - وحدة backend/config.js
 */
function applyCors(req, res, config) {
    var origin = req.headers.origin;
    var allowed = (config && config.corsAllowedOrigins) || ['*'];

    if (allowed.indexOf('*') !== -1) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else if (origin && allowed.indexOf(origin) !== -1) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * كتابة استجابة JSON موحّدة الشكل مع رمز حالة HTTP صريح.
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {Object} body - يُسلسَل تلقائياً عبر JSON.stringify
 */
function sendJson(res, statusCode, body) {
    var payload = JSON.stringify(body === undefined ? {} : body);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
}

module.exports = {
    applyCors: applyCors,
    sendJson: sendJson
};
