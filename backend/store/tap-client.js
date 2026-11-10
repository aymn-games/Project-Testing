/**
 * TAP CLIENT — بوابة الدفع تاب (tap.company) للمتجر. عمليتان فقط:
 * إنشاء عملية دفع (Charge) ترجع رابط صفحة الدفع، وقراءة حالة العملية.
 * التوثيق: Authorization: Bearer <المفتاح السري>.
 * المبالغ بالريال نفسه (17.95 = 17.95)، مو بالهللة.
 *
 * صفحة الدفع: source = src_all → تاب تعرض كل وسائل الدفع المفعّلة بحسابك
 * (مدى، فيزا/ماستر، Apple Pay، STC Pay...).
 * بعد الدفع ترجّع العميل لـ redirect.url ومعه ?tap_id=chg_...، وترسل
 * إشعار POST لـ post.url. الحالة "CAPTURED" = مدفوع.
 *
 * TAP_SECRET_KEY:
 *   sk_test_... → بيئة التجربة (بطاقات تاب التجريبية) — للأدمن فقط.
 *   sk_live_... → دفع حقيقي، و TAP_MODE يحدد لمين:
 *       production → للكل
 *       غير ذلك (الافتراضي) → live-admin: للأدمن فقط (تجربة قبل فتح المتجر).
 * فارغ = تاب غير مفعّل.
 */

'use strict';

var config = require('../config');
var logger = require('../utils/logger');

var BASE_URL = 'https://api.tap.company/v2';
var TIMEOUT_MS = 20000;

function env() {
    var key = String(config.tapSecretKey || '');
    if (!key) return null;
    if (key.indexOf('sk_test_') === 0) return 'test';
    var mode = String(config.tapMode || '').toLowerCase();
    return (mode === 'production' || mode === 'prod' || mode === 'live') ? 'production' : 'live-admin';
}

function isEnabled() { return env() !== null; }

function call(method, path, body) {
    var headers = {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + String(config.tapSecretKey)
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
                logger.error('Tap: ' + method + ' ' + path + ' failed with HTTP ' + res.status + ': ' + String(text).slice(0, 300));
                var err = new Error('tap_http_' + res.status);
                // نص رد تاب (للتشخيص — يُعرض للأدمن فقط)
                err.detail = path + ' → HTTP ' + res.status + ': ' + String(text).slice(0, 300);
                throw err;
            }
            return data;
        });
    }).finally(function () { clearTimeout(timer); });
}

/** 05xxxxxxxx → {country_code: '966', number: '5xxxxxxxx'} */
function toPhone(mobile) {
    var digits = String(mobile || '').replace(/[^\d]/g, '');
    if (digits.indexOf('966') === 0) digits = digits.slice(3);
    if (digits.charAt(0) === '0') digits = digits.slice(1);
    return digits ? { country_code: '966', number: digits } : undefined;
}

/**
 * @param {Object} charge - {amount (ريال), description, orderId, customerName,
 *                            email, mobile, postUrl, redirectUrl, metadata}
 * @returns {Promise<{id: string, url: string}>}
 */
function createCharge(charge) {
    var customer = { first_name: String(charge.customerName || 'Customer').slice(0, 60) };
    var phone = toPhone(charge.mobile);
    if (phone) customer.phone = phone;
    if (charge.email) customer.email = String(charge.email);
    return call('POST', '/charges', {
        amount: Math.round(Number(charge.amount) * 100) / 100,
        currency: 'SAR',
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: charge.description,
        metadata: charge.metadata || {},
        reference: { transaction: 'agp-' + charge.orderId, order: String(charge.orderId) },
        receipt: { email: false, sms: false },
        customer: customer,
        source: { id: 'src_all' },
        post: { url: charge.postUrl },
        redirect: { url: charge.redirectUrl }
    }).then(function (data) {
        var url = data && data.transaction && data.transaction.url;
        if (!data || !data.id || !url) {
            var err = new Error('tap_charge_failed');
            err.detail = '/charges → ' + JSON.stringify(data).slice(0, 300);
            logger.error('Tap: unexpected charge response: ' + err.detail);
            throw err;
        }
        return { id: String(data.id), url: String(url) };
    });
}

/**
 * @returns {Promise<{status: string (بأحرف صغيرة: captured/initiated/failed...), amount: number (ريال), currency: string}>}
 */
function getCharge(id) {
    return call('GET', '/charges/' + encodeURIComponent(id)).then(function (data) {
        if (!data) throw new Error('tap_charge_missing');
        return {
            status: String(data.status || '').toLowerCase(),
            amount: Number(data.amount),
            currency: String(data.currency || '').toUpperCase()
        };
    });
}

module.exports = { isEnabled: isEnabled, env: env, createCharge: createCharge, getCharge: getCharge };
