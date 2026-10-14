/**
 * MOYASAR CLIENT — بوابة الدفع ميسّر (moyasar.com) للمتجر. عمليتان فقط:
 * إنشاء فاتورة (رابط صفحة الدفع) وقراءة حالة فاتورة.
 * التوثيق: Basic Auth بالمفتاح السري (اسم المستخدم = المفتاح، بدون كلمة مرور).
 * المبالغ بالهللة (17.95 ر.س = 1795).
 *
 * MOYASAR_SECRET_KEY:
 *   sk_test_... → بيئة التجربة (بطاقات ميسّر التجريبية) — للأدمن فقط.
 *   sk_live_... → دفع حقيقي، و MOYASAR_MODE يحدد لمين:
 *       production → للكل
 *       غير ذلك (الافتراضي) → live-admin: للأدمن فقط (تجربة قبل فتح المتجر).
 * فارغ = ميسّر غير مفعّل.
 */

'use strict';

var config = require('../config');
var logger = require('../utils/logger');

var BASE_URL = 'https://api.moyasar.com/v1';
var TIMEOUT_MS = 20000;

function env() {
    var key = String(config.moyasarSecretKey || '');
    if (!key) return null;
    if (key.indexOf('sk_test_') === 0) return 'test';
    var mode = String(config.moyasarMode || '').toLowerCase();
    return (mode === 'production' || mode === 'prod' || mode === 'live') ? 'production' : 'live-admin';
}

function isEnabled() { return env() !== null; }

function call(method, path, body) {
    var headers = {
        'Accept': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(String(config.moyasarSecretKey) + ':').toString('base64')
    };
    if (body) headers['Content-Type'] = 'application/json';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(BASE_URL + path, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
    }).then(function (res) {
        return res.text().then(function (text) {
            var data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
            if (!res.ok) {
                logger.error('Moyasar: ' + method + ' ' + path + ' failed with HTTP ' + res.status + ': ' + String(text).slice(0, 300));
                var err = new Error('moyasar_http_' + res.status);
                // نص رد ميسّر (للتشخيص — يُعرض للأدمن فقط)
                err.detail = path + ' → HTTP ' + res.status + ': ' + String(text).slice(0, 300);
                throw err;
            }
            return data;
        });
    }).finally(function () { clearTimeout(timer); });
}

function toHalalas(amount) { return Math.round(Number(amount) * 100); }

/**
 * @param {Object} invoice - {amount (ريال), description, callbackUrl, successUrl, backUrl, metadata}
 * @returns {Promise<{id: string, url: string}>}
 */
function createInvoice(invoice) {
    return call('POST', '/invoices', {
        amount: toHalalas(invoice.amount),
        currency: 'SAR',
        description: invoice.description,
        callback_url: invoice.callbackUrl,
        success_url: invoice.successUrl,
        back_url: invoice.backUrl,
        metadata: invoice.metadata || {}
    }).then(function (data) {
        if (!data || !data.id || !data.url) {
            var err = new Error('moyasar_invoice_failed');
            err.detail = '/invoices → ' + JSON.stringify(data).slice(0, 300);
            logger.error('Moyasar: unexpected invoice response: ' + err.detail);
            throw err;
        }
        return { id: String(data.id), url: String(data.url) };
    });
}

/**
 * @returns {Promise<{status: string, amount: number (ريال), currency: string}>}
 */
function getInvoice(id) {
    return call('GET', '/invoices/' + encodeURIComponent(id)).then(function (data) {
        if (!data) throw new Error('moyasar_invoice_missing');
        return {
            status: String(data.status || '').toLowerCase(),
            amount: Number(data.amount) / 100,
            currency: String(data.currency || '').toUpperCase()
        };
    });
}

module.exports = { isEnabled: isEnabled, env: env, createInvoice: createInvoice, getInvoice: getInvoice };
