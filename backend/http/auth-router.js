/**
 * ==========================================================================
 *  AGP AUTH ROUTER — يوصّل backend/auth/auth-service.js بواجهة HTTP فعلية
 * ==========================================================================
 *
 * قبل هذا الملف: auth-service.js/database.js/password.js كانت منطقاً
 * كاملاً وجاهزاً (حسابات، جلسات، تحقق تيك توك، صلاحيات أدمن) لكن غير
 * موصول بأي شيء — لا مسار HTTP يستدعيه، ولا صفحة واجهة تستخدمه. هذا
 * الملف هو نقطة الربط الوحيدة؛ لا تعديل على auth-service.js نفسه.
 *
 * جدول مسارات بسيط + دالة `handle(req, res)` واحدة تُستدعى من
 * server.js لكل طلب يبدأ بـ "/api/". لا معرفة هنا بـ WebSocket أو
 * تيك توك أو أي شيء آخر في backend/ — مسؤولية واحدة: HTTP API للحسابات
 * والإدارة، راجع docs/BACKEND_ARCHITECTURE.md §10 للبروتوكول الكامل.
 * ==========================================================================
 */

'use strict';

var authService = require('../auth/auth-service');
var logger = require('../utils/logger');
var config = require('../config');
var response = require('./response');
var bodyParser = require('./body-parser');

var sendJson = response.sendJson;

/**
 * استخراج Token من ترويسة Authorization: "Bearer <token>".
 * @param {http.IncomingMessage} req
 * @returns {string|null}
 */
function extractBearerToken(req) {
    var header = req.headers['authorization'] || '';
    var match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1].trim() : null;
}

/**
 * يتحقق من الجلسة الحالية عبر auth-service.validateSession (كما هو،
 * بدون أي تعديل). يرجع null دون أي throw لو الترويسة غير موجودة أو
 * الجلسة منتهية/غير صالحة.
 * @param {http.IncomingMessage} req
 * @returns {Object|null} بيانات المستخدم
 */
function requireUser(req) {
    var token = extractBearerToken(req);
    if (!token) return null;
    return authService.validateSession(token);
}

/**
 * جدول المسارات: كل عنصر {method, path, handler}. الـ handler يستقبل
 * (req, res, body, user) — user يكون null لو المسار لا يتطلب Auth.
 * requireAuth/requireAdmin يُطبَّقان تلقائياً قبل استدعاء الـ handler.
 */
var ROUTES = [
    { method: 'POST', path: '/api/auth/signup', requireAuth: false, handler: handleSignup },
    { method: 'POST', path: '/api/auth/login', requireAuth: false, handler: handleLogin },
    { method: 'POST', path: '/api/auth/google', requireAuth: false, handler: handleGoogleLogin },
    { method: 'POST', path: '/api/auth/logout', requireAuth: true, handler: handleLogout },
    { method: 'GET', path: '/api/auth/me', requireAuth: true, handler: handleMe },
    { method: 'POST', path: '/api/auth/tiktok/link', requireAuth: true, handler: handleTikTokLink },
    { method: 'POST', path: '/api/auth/tiktok/verification-code', requireAuth: true, handler: handleTikTokVerificationCode },
    { method: 'POST', path: '/api/auth/tiktok/verify', requireAuth: true, handler: handleTikTokVerify },
    { method: 'POST', path: '/api/auth/custom-id', requireAuth: true, handler: handleCustomId },
    { method: 'GET', path: '/api/admin/users', requireAuth: true, requireAdmin: true, handler: handleAdminListUsers },
    { method: 'POST', path: '/api/admin/permissions', requireAuth: true, requireAdmin: true, handler: handleAdminSetPermission }
];

/* ----------------------------------------------------------------------
 * Handlers — كل واحد يستدعي دالة واحدة موجودة أصلاً في auth-service.js
 * ---------------------------------------------------------------------- */

function handleSignup(req, res, body) {
    var result = authService.signup(body.username, body.email, body.password, Boolean(body.wantsToBeStreamer));
    sendJson(res, result.success ? 201 : 400, result);
}

function handleLogin(req, res, body) {
    var result = authService.login(body.email, body.password);
    sendJson(res, result.success ? 200 : 401, result);
}

function handleGoogleLogin(req, res, body) {
    return authService.loginWithGoogle(body.idToken).then(function (result) {
        sendJson(res, result.success ? 200 : 401, result);
    });
}

function handleLogout(req, res, body, user, token) {
    authService.logout(token);
    sendJson(res, 200, { success: true });
}

function handleMe(req, res, body, user) {
    sendJson(res, 200, { success: true, user: user });
}

function handleTikTokLink(req, res, body, user) {
    authService.linkTikTokUsername(user.id, body.tiktokUsername);
    sendJson(res, 200, { success: true });
}

function handleTikTokVerificationCode(req, res, body, user) {
    var code = authService.generateVerificationCode(user.id);
    sendJson(res, 200, { success: true, code: code });
}

function handleTikTokVerify(req, res, body, user) {
    return authService.verifyTikTokOwnership(user.id, body.tiktokUsername).then(function (result) {
        sendJson(res, result.success ? 200 : 400, result);
    });
}

function handleCustomId(req, res, body, user) {
    var result = authService.setCustomId(user.id, body.customId);
    sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminListUsers(req, res) {
    sendJson(res, 200, { success: true, users: authService.listAllUsersWithStats() });
}

function handleAdminSetPermission(req, res, body) {
    var result = authService.setPermission(body.userId, body.permissionKey, Boolean(body.value));
    sendJson(res, result.success ? 200 : 400, result);
}

/* ----------------------------------------------------------------------
 * المُوجِّه الرئيسي
 * ---------------------------------------------------------------------- */

/**
 * إيجاد المسار المطابق لطريقة + مسار طلب معيّن.
 * @param {string} method
 * @param {string} pathname
 * @returns {Object|null}
 */
function matchRoute(method, pathname) {
    for (var i = 0; i < ROUTES.length; i++) {
        if (ROUTES[i].method === method && ROUTES[i].path === pathname) return ROUTES[i];
    }
    return null;
}

/**
 * نقطة الدخول الوحيدة — تُستدعى من server.js لكل طلب "/api/*". تتكفّل
 * بـ CORS، الـ Preflight، تحليل الجسم، فحص Auth/Admin، ومعالجة الأخطاء
 * دفاعياً (لا throw غير ممسوك يوقف السيرفر بالكامل).
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handle(req, res) {
    response.applyCors(req, res, config);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    var pathname = (req.url || '').split('?')[0];
    var route = matchRoute(req.method, pathname);

    if (!route) {
        sendJson(res, 404, { success: false, error: 'not_found' });
        return;
    }

    var token = extractBearerToken(req);
    var user = null;

    if (route.requireAuth) {
        user = requireUser(req);
        if (!user) {
            sendJson(res, 401, { success: false, error: 'unauthorized' });
            return;
        }
        if (route.requireAdmin && user.role !== 'admin') {
            sendJson(res, 403, { success: false, error: 'forbidden' });
            return;
        }
    }

    bodyParser.readJsonBody(req).then(function (body) {
        return route.handler(req, res, body || {}, user, token);
    }).catch(function (err) {
        if (err && (err.message === 'invalid_json' || err.message === 'body_too_large')) {
            sendJson(res, 400, { success: false, error: err.message });
            return;
        }
        logger.error('Auth Router: unhandled error on ' + route.method + ' ' + route.path + ':', err);
        if (!res.headersSent) sendJson(res, 500, { success: false, error: 'internal_error' });
    });
}

module.exports = {
    handle: handle
};
