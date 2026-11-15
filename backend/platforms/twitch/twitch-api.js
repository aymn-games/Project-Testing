/**
 * AGP TWITCH API — طبقة رقيقة فوق Twitch Helix + EventSub (https://dev.twitch.tv/docs).
 *
 * - App Access Token (client_credentials) بالذاكرة ويتجدد قبل انتهائه — اشتراكات
 *   EventSub عبر Webhook ما تقبل إلا توكن التطبيق.
 * - الاشتراك بأحداث قناة يحتاج إن صاحب القناة وافق مسبقاً على الصلاحيات
 *   (ربط حساب تويتش — auth/twitch-oauth-service.js)؛ الموافقة تبقى لين يلغيها.
 * - سر توقيع الـWebhook مشتق من Client Secret (HMAC) — ما يحتاج متغير بيئة إضافي.
 *   التوقيع: "sha256=" + HMAC-SHA256(secret, message_id + timestamp + raw body).
 */

'use strict';

var crypto = require('crypto');
var config = require('../../config');

var HELIX = 'https://api.twitch.tv/helix';
var TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
var REQUEST_TIMEOUT_MS = 15000;
var TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000;

var _token = null;          // { value, expiresAt }
var _tokenPromise = null;

function isConfigured() {
    return Boolean(config.twitchClientId && config.twitchClientSecret);
}

/** سر توقيع EventSub (10–100 حرف ASCII) — ثابت لنفس التطبيق. */
function webhookSecret() {
    return crypto.createHmac('sha256', String(config.twitchClientSecret || '')).update('agp-eventsub-webhook').digest('hex');
}

function timedFetch(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function () { clearTimeout(timer); });
}

function getAppToken(forceRefresh) {
    if (!isConfigured()) return Promise.reject(new Error('Twitch credentials are not configured'));
    if (!forceRefresh && _token && Date.now() < _token.expiresAt - TOKEN_EARLY_REFRESH_MS) return Promise.resolve(_token.value);
    if (!_tokenPromise) {
        _tokenPromise = timedFetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.twitchClientId,
                client_secret: config.twitchClientSecret,
                grant_type: 'client_credentials'
            }).toString()
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok || !data.access_token) throw new Error('Twitch token request failed (HTTP ' + res.status + ')');
                _token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
                return _token.value;
            });
        }).finally(function () { _tokenPromise = null; });
    }
    return _tokenPromise;
}

/** طلب Helix بتوكن التطبيق. 401 مرة وحدة → توكن جديد. يرجع { status, data }. */
function helix(method, path, body, _retried) {
    return getAppToken(false).then(function (token) {
        var headers = { 'Authorization': 'Bearer ' + token, 'Client-Id': config.twitchClientId };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        return timedFetch(HELIX + path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    }).then(function (res) {
        if (res.status === 401 && !_retried) { _token = null; return helix(method, path, body, true); }
        if (res.status === 204) return { status: 204, data: null };
        return res.json().catch(function () { return null; }).then(function (data) { return { status: res.status, data: data }; });
    });
}

function expectOk(r, what) {
    if (r.status < 200 || r.status >= 300) {
        var err = new Error(what + ' failed (HTTP ' + r.status + ')' + (r.data && r.data.message ? ': ' + r.data.message : ''));
        err.status = r.status;
        throw err;
    }
    return r.data;
}

/** المستخدم باسمه (login) → { id, login, display_name, profile_image_url } أو null. */
function getUserByLogin(login) {
    return helix('GET', '/users?login=' + encodeURIComponent(login)).then(function (r) {
        var data = expectOk(r, 'Get user');
        return (data && data.data && data.data[0]) || null;
    });
}

/** هل القناة تبث الحين؟ */
function isLive(userId) {
    return helix('GET', '/streams?user_id=' + encodeURIComponent(userId)).then(function (r) {
        var data = expectOk(r, 'Get streams');
        return Boolean(data && Array.isArray(data.data) && data.data.length);
    });
}

/** اشتراكات EventSub للتطبيق اللي تخص مستخدم معيّن. */
function listSubscriptions(userId) {
    return helix('GET', '/eventsub/subscriptions?user_id=' + encodeURIComponent(userId)).then(function (r) {
        var data = expectOk(r, 'List subscriptions');
        return (data && Array.isArray(data.data)) ? data.data : [];
    });
}

/**
 * اشتراك Webhook واحد. 409 (موجود أصلاً) يُعتبر نجاح.
 * @returns {Promise<{id:string|null, existed:boolean}>}
 */
function createSubscription(type, version, condition) {
    return helix('POST', '/eventsub/subscriptions', {
        type: type,
        version: String(version),
        condition: condition,
        transport: { method: 'webhook', callback: config.twitchWebhookUrl, secret: webhookSecret() }
    }).then(function (r) {
        if (r.status === 409) return { id: null, existed: true };
        var data = expectOk(r, 'Create subscription ' + type);
        return { id: data && data.data && data.data[0] ? data.data[0].id : null, existed: false };
    });
}

function deleteSubscription(id) {
    return helix('DELETE', '/eventsub/subscriptions?id=' + encodeURIComponent(id)).then(function (r) {
        if (r.status !== 404) expectOk(r, 'Delete subscription');
    });
}

/** تحقق من توقيع رسالة EventSub (مقارنة بوقت ثابت). */
function verifySignature(messageId, timestamp, rawBody, signatureHeader, secret) {
    if (!messageId || !timestamp || !signatureHeader) return false;
    var expected = 'sha256=' + crypto.createHmac('sha256', secret || webhookSecret())
        .update(String(messageId) + String(timestamp)).update(rawBody).digest('hex');
    var a = Buffer.from(String(signatureHeader));
    var b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
    isConfigured: isConfigured,
    getAppToken: getAppToken,
    getUserByLogin: getUserByLogin,
    isLive: isLive,
    listSubscriptions: listSubscriptions,
    createSubscription: createSubscription,
    deleteSubscription: deleteSubscription,
    verifySignature: verifySignature,
    webhookSecret: webhookSecret
};
