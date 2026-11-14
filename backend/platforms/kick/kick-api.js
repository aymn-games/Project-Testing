/**
 * AGP KICK API — طبقة رقيقة فوق Kick Public API الرسمي (https://docs.kick.com).
 *
 * - التوكن: App Access Token عبر Client Credentials (id.kick.com/oauth/token)،
 *   يُخزَّن بالذاكرة ويتجدد قبل انتهائه. بهذا التوكن يقدر التطبيق يشترك
 *   بأحداث أي قناة برقمها (broadcaster_user_id) — فالستريمر ما يحتاج يسجّل
 *   دخول بحساب كيك، يكفي اسم قناته.
 * - المفاتيح من متغيرات البيئة فقط (config.kickClientId / kickClientSecret).
 * - توقيع الـWebhook: RSA (PKCS#1 v1.5 + SHA-256) على
 *   "<Kick-Event-Message-Id>.<Kick-Event-Message-Timestamp>.<raw body>"،
 *   والمفتاح العام يُجلب من /public/v1/public-key (ما يُكتب بالكود — كيك
 *   ممكن يغيّره بأي وقت).
 */

'use strict';

var crypto = require('crypto');
var config = require('../../config');

var API_BASE = 'https://api.kick.com';
var TOKEN_URL = 'https://id.kick.com/oauth/token';
var REQUEST_TIMEOUT_MS = 15000;
var TOKEN_EARLY_REFRESH_MS = 60 * 1000;
var PUBLIC_KEY_TTL_MS = 6 * 60 * 60 * 1000;

var _token = null;          // { value, expiresAt }
var _tokenPromise = null;
var _publicKey = null;      // { pem, fetchedAt }
var _publicKeyPromise = null;

function isConfigured() {
    return Boolean(config.kickClientId && config.kickClientSecret);
}

function withTimeout(promiseFactory) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return promiseFactory(controller.signal).finally(function () { clearTimeout(timer); });
}

function fetchAppToken() {
    var body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.kickClientId,
        client_secret: config.kickClientSecret
    }).toString();
    return withTimeout(function (signal) {
        return fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body,
            signal: signal
        });
    }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok || !data || !data.access_token) {
                throw new Error('Kick token request failed (HTTP ' + res.status + ')');
            }
            var ttlMs = (Number(data.expires_in) || 3600) * 1000;
            _token = { value: data.access_token, expiresAt: Date.now() + ttlMs };
            return _token.value;
        });
    });
}

/** App Access Token صالح (من الذاكرة أو جديد). */
function getAppToken(forceRefresh) {
    if (!isConfigured()) return Promise.reject(new Error('Kick credentials are not configured'));
    if (!forceRefresh && _token && Date.now() < _token.expiresAt - TOKEN_EARLY_REFRESH_MS) {
        return Promise.resolve(_token.value);
    }
    if (!_tokenPromise) {
        _tokenPromise = fetchAppToken().finally(function () { _tokenPromise = null; });
    }
    return _tokenPromise;
}

/**
 * طلب للـAPI بالتوكن. 401 مرة وحدة → توكن جديد وإعادة الطلب.
 * يرجع { status, data } — data هو JSON الرد (أو null).
 */
function apiRequest(method, path, body, _retried) {
    return getAppToken(false).then(function (token) {
        var headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        return withTimeout(function (signal) {
            return fetch(API_BASE + path, {
                method: method,
                headers: headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: signal
            });
        });
    }).then(function (res) {
        if (res.status === 401 && !_retried) {
            _token = null;
            return apiRequest(method, path, body, true);
        }
        if (res.status === 204) return { status: res.status, data: null };
        return res.json().catch(function () { return null; }).then(function (data) {
            return { status: res.status, data: data };
        });
    });
}

function expectOk(result, what) {
    if (result.status < 200 || result.status >= 300) {
        var msg = result.data && result.data.message ? ': ' + result.data.message : '';
        var err = new Error(what + ' failed (HTTP ' + result.status + ')' + msg);
        err.status = result.status;
        throw err;
    }
    return result.data;
}

/** القناة باسمها (slug) → { broadcaster_user_id, slug, stream: { is_live, ... } } أو null. */
function getChannelBySlug(slug) {
    return apiRequest('GET', '/public/v1/channels?slug=' + encodeURIComponent(slug)).then(function (r) {
        if (r.status === 404) return null;
        var data = expectOk(r, 'Get channel');
        var list = (data && Array.isArray(data.data)) ? data.data : [];
        return list[0] || null;
    });
}

/** اشتراكات التطبيق الحالية لقناة معيّنة: [{ id, event, broadcaster_user_id, ... }]. */
function listSubscriptions(broadcasterUserId) {
    return apiRequest('GET', '/public/v1/events/subscriptions?broadcaster_user_id=' + encodeURIComponent(broadcasterUserId)).then(function (r) {
        var data = expectOk(r, 'List subscriptions');
        return (data && Array.isArray(data.data)) ? data.data : [];
    });
}

/**
 * اشتراك بأحداث قناة عبر Webhook.
 * @param {number} broadcasterUserId
 * @param {string[]} eventNames
 * @returns {Promise<Array<{name, version, subscription_id, error}>>}
 */
function subscribe(broadcasterUserId, eventNames) {
    return apiRequest('POST', '/public/v1/events/subscriptions', {
        broadcaster_user_id: Number(broadcasterUserId),
        events: eventNames.map(function (name) { return { name: name, version: 1 }; }),
        method: 'webhook'
    }).then(function (r) {
        var data = expectOk(r, 'Subscribe to events');
        return (data && Array.isArray(data.data)) ? data.data : [];
    });
}

/** إلغاء اشتراكات بأرقامها. */
function unsubscribe(subscriptionIds) {
    var ids = (subscriptionIds || []).filter(Boolean);
    if (!ids.length) return Promise.resolve();
    var qs = ids.map(function (id) { return 'id=' + encodeURIComponent(id); }).join('&');
    return apiRequest('DELETE', '/public/v1/events/subscriptions?' + qs).then(function (r) {
        expectOk(r, 'Unsubscribe');
    });
}

/** المفتاح العام لكيك (PEM) — بدون توكن، ويُخزَّن بالذاكرة لساعات. */
function getPublicKey(forceRefresh) {
    if (!forceRefresh && _publicKey && Date.now() - _publicKey.fetchedAt < PUBLIC_KEY_TTL_MS) {
        return Promise.resolve(_publicKey.pem);
    }
    if (!_publicKeyPromise) {
        _publicKeyPromise = withTimeout(function (signal) {
            return fetch(API_BASE + '/public/v1/public-key', { headers: { 'Accept': 'application/json' }, signal: signal });
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                var pem = data && data.data && data.data.public_key;
                if (!res.ok || typeof pem !== 'string' || !pem) throw new Error('Kick public key request failed (HTTP ' + res.status + ')');
                _publicKey = { pem: pem, fetchedAt: Date.now() };
                return pem;
            });
        }).finally(function () { _publicKeyPromise = null; });
    }
    return _publicKeyPromise;
}

/** تحقق من توقيع رسالة Webhook بمفتاح PEM معيّن (متزامن، بدون شبكة). */
function verifySignatureWithKey(pem, messageId, timestamp, rawBody, signatureB64) {
    if (!pem || !messageId || !timestamp || !signatureB64) return false;
    try {
        var verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(messageId + '.' + timestamp + '.');
        verifier.update(rawBody);
        verifier.end();
        return verifier.verify(pem, String(signatureB64), 'base64');
    } catch (err) {
        return false;
    }
}

/**
 * تحقق من توقيع رسالة Webhook. لو فشل بالمفتاح المخزَّن نجلب المفتاح
 * مرة ثانية (ممكن كيك غيّره) ونعيد التحقق مرة وحدة.
 * @returns {Promise<boolean>}
 */
function verifySignature(messageId, timestamp, rawBody, signatureB64) {
    return getPublicKey(false).then(function (pem) {
        if (verifySignatureWithKey(pem, messageId, timestamp, rawBody, signatureB64)) return true;
        return getPublicKey(true).then(function (freshPem) {
            if (freshPem === pem) return false;
            return verifySignatureWithKey(freshPem, messageId, timestamp, rawBody, signatureB64);
        });
    });
}

module.exports = {
    isConfigured: isConfigured,
    getAppToken: getAppToken,
    getChannelBySlug: getChannelBySlug,
    listSubscriptions: listSubscriptions,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    getPublicKey: getPublicKey,
    verifySignature: verifySignature,
    verifySignatureWithKey: verifySignatureWithKey
};
