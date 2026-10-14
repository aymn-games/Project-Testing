/**
 * PAYLINK CLIENT — بوابة الدفع (paylink.sa) للمتجر. ثلاث عمليات فقط:
 * تسجيل الدخول (id_token)، إنشاء فاتورة (رابط الدفع)، وقراءة حالة فاتورة.
 *
 * PAYLINK_ENV=test  → بيئة التجربة restpilot.paylink.sa بمفاتيح بيلينك
 *                     التجريبية العامة (مفاتيح الحساب الحقيقية ما تشتغل فيها).
 * PAYLINK_ENV=production → restapi.paylink.sa بمفاتيح الحساب
 *                     (PAYLINK_API_ID / PAYLINK_SECRET_KEY).
 * غير ذلك (فارغ) → بيلينك غير مفعّل والمتجر يرجع للدفع التجريبي القديم.
 */

'use strict';

var config = require('../config');
var logger = require('../utils/logger');

var URLS = { test: 'https://restpilot.paylink.sa', production: 'https://restapi.paylink.sa' };
// مفاتيح بيئة التجربة العامة المنشورة من بيلينك نفسها.
var TEST_API_ID = 'APP_ID_1123453311';
var TEST_SECRET_KEY = '0662abb5-13c7-38ab-cd12-236e58f43766';
var TIMEOUT_MS = 20000;

function env() {
    var e = String(config.paylinkEnv || '').toLowerCase();
    if (e === 'test') return 'test';
    if ((e === 'production' || e === 'prod' || e === 'live') && config.paylinkApiId && config.paylinkSecretKey) return 'production';
    return null;
}

function isEnabled() { return env() !== null; }

function credentials() {
    return env() === 'test'
        ? { apiId: TEST_API_ID, secretKey: TEST_SECRET_KEY }
        : { apiId: config.paylinkApiId, secretKey: config.paylinkSecretKey };
}

function call(method, path, body, token) {
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(URLS[env()] + path, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
    }).then(function (res) {
        return res.text().then(function (text) {
            var data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
            if (!res.ok) {
                logger.error('Paylink: ' + method + ' ' + path + ' failed with HTTP ' + res.status + ': ' + String(text).slice(0, 300));
                var err = new Error('paylink_http_' + res.status);
                // نص رد بيلينك (للتشخيص — يُعرض للأدمن فقط)
                err.detail = path + ' → HTTP ' + res.status + ': ' + String(text).slice(0, 300);
                throw err;
            }
            return data;
        });
    }).finally(function () { clearTimeout(timer); });
}

// التوكن صالح لفترة — نحتفظ فيه 10 دقائق بس ونطلب جديد بعدها.
var cachedToken = null;
var cachedAt = 0;
var TOKEN_TTL_MS = 10 * 60 * 1000;

function authenticate() {
    if (cachedToken && Date.now() - cachedAt < TOKEN_TTL_MS) return Promise.resolve(cachedToken);
    var c = credentials();
    return call('POST', '/api/auth', { apiId: c.apiId, secretKey: c.secretKey, persistToken: false }).then(function (data) {
        if (!data || !data.id_token) throw new Error('paylink_auth_failed');
        cachedToken = data.id_token;
        cachedAt = Date.now();
        return cachedToken;
    });
}

/**
 * @param {Object} invoice - {amount, orderNumber, clientName, clientMobile, clientEmail?, callBackUrl, cancelUrl, note, products}
 * @returns {Promise<{url: string, transactionNo: string}>}
 */
function addInvoice(invoice) {
    return authenticate().then(function (token) {
        return call('POST', '/api/addInvoice', Object.assign({ currency: 'SAR', displayPending: true }, invoice), token);
    }).then(function (data) {
        if (!data || !data.url || !data.transactionNo) {
            var err = new Error('paylink_invoice_failed');
            err.detail = '/api/addInvoice → ' + JSON.stringify(data).slice(0, 300);
            logger.error('Paylink: unexpected addInvoice response: ' + err.detail);
            throw err;
        }
        return { url: data.url, transactionNo: String(data.transactionNo) };
    });
}

/**
 * @returns {Promise<{orderStatus: string, amount: number, orderNumber: string}>}
 */
function getInvoice(transactionNo) {
    return authenticate().then(function (token) {
        return call('GET', '/api/getInvoice/' + encodeURIComponent(transactionNo), null, token);
    }).then(function (data) {
        if (!data) throw new Error('paylink_invoice_missing');
        var req = data.gatewayOrderRequest || {};
        return {
            orderStatus: String(data.orderStatus || ''),
            amount: Number(data.amount != null ? data.amount : req.amount),
            orderNumber: String(req.orderNumber || data.orderNumber || '')
        };
    });
}

module.exports = { isEnabled: isEnabled, env: env, addInvoice: addInvoice, getInvoice: getInvoice };
