/**
 * AGP STORE ROUTES — مسارات المتجر (/api/store/*) ولوحة إدارته
 * (/api/admin/store/*). تُدمج بجدول المسارات في http/auth-router.js، فتمر
 * بنفس فحص Auth/Admin وتحليل الجسم و CORS.
 */

'use strict';

var storeService = require('../store/store-service');
var response = require('./response');

var sendJson = response.sendJson;

var ERROR_STATUS = {
  not_found: 404,
  forbidden: 403,
  rate_limited: 429,
  payments_not_configured: 503,
  uploads_not_configured: 503
};

function send(res, result) {
  sendJson(res, result.success ? 200 : (ERROR_STATUS[result.error] || 400), result);
}

function getQueryParam(req, key) {
  var queryString = (req.url || '').split('?')[1] || '';
  var value = '';
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === key) value = decodeURIComponent(kv[1] || '');
  });
  return value;
}

function clientKey(req, user) {
  if (user) return 'u' + user.id;
  var fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return 'ip' + (fwd || (req.socket && req.socket.remoteAddress) || '');
}

var routes = [
  { method: 'GET', path: '/api/store', requireAuth: false, handler: function (req, res, body, user) {
    send(res, storeService.getPublicStore(user));
  } },
  { method: 'POST', path: '/api/store/coupon', requireAuth: false, handler: function (req, res, body, user) {
    send(res, storeService.checkCoupon(body.code, clientKey(req, user)));
  } },
  { method: 'POST', path: '/api/store/checkout', requireAuth: true, handler: function (req, res, body, user) {
    send(res, storeService.checkout(user, { items: body.items, coupon: body.coupon, method: body.method }));
  } },
  { method: 'GET', path: '/api/store/orders', requireAuth: true, handler: function (req, res, body, user) {
    send(res, storeService.listMyOrders(user));
  } },
  { method: 'POST', path: '/api/store/favorite', requireAuth: true, handler: function (req, res, body, user) {
    send(res, storeService.setFavorite(user, body.productId, !!body.on));
  } },
  { method: 'GET', path: '/api/store/streamer-stats', requireAuth: false, handler: function (req, res, body, user) {
    send(res, storeService.getStreamerStats(getQueryParam(req, 's'), getQueryParam(req, 't'), user));
  } },
  { method: 'GET', path: '/api/admin/store/data', requireAuth: true, requireAdmin: true, handler: function (req, res) {
    send(res, storeService.adminGetData());
  } },
  { method: 'POST', path: '/api/admin/store/upload-signature', requireAuth: true, requireAdmin: true, handler: function (req, res, body) {
    send(res, storeService.getUploadSignature({ fileName: body.fileName, fileSize: body.fileSize }));
  } }
];

// كل تعديلات الأدمن: POST /api/admin/store/<entity>/<action> بجسم JSON.
Object.keys(storeService.adminActions).forEach(function (key) {
  var action = storeService.adminActions[key];
  routes.push({ method: 'POST', path: '/api/admin/store/' + key, requireAuth: true, requireAdmin: true, handler: function (req, res, body) {
    send(res, action(body || {}));
  } });
});

module.exports = { routes: routes };
