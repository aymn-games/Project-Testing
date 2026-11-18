/**
 * AGP STREAMLABS OAUTH — زر «اربط Streamlabs» (المرحلة الثانية من ربط الدونيشن).
 *
 * الستريمر يضغط الزر → صفحة موافقة Streamlabs → يرجع لـ/api/streamlabs/oauth/callback?code=&state= →
 * نبدّل code بـaccess token → نجيب «socket token» → نكمل بنفس ربط لصق الرمز (streamlabs-manager.link).
 *
 * - مخفي لين صاحب المنصة يسجّل تطبيق عند Streamlabs ويحط STREAMLABS_CLIENT_ID و
 *   STREAMLABS_CLIENT_SECRET بـRender (enabled()).
 * - state = userId.وقت.توقيع HMAC بالـclient secret — صالح 10 دقايق، وما ينزوّر.
 * - ما نحفظ access token: نحتاج socket token بس (نفس اللي يلصقه الستريمر يدوياً).
 * ⚠️ أسماء المسارات من Streamlabs API v2.0 — تتأكد عند تسجيل التطبيق.
 */

'use strict';

var crypto = require('crypto');

var API = 'https://streamlabs.com/api/v2.0';
var SCOPE = 'socket.token';
var STATE_TTL_MS = 10 * 60 * 1000;

function createOAuth(opts) {
    opts = opts || {};
    var now = opts.now || Date.now;

    function enabled() { return Boolean(opts.clientId && opts.clientSecret); }

    function sign(payload) {
        return crypto.createHmac('sha256', String(opts.clientSecret || '')).update(payload).digest('hex').slice(0, 32);
    }

    function makeState(userId) {
        var p = String(userId) + '.' + now().toString(36);
        return p + '.' + sign(p);
    }

    /** → userId أو null (مزوّر/منتهي/فاضي). */
    function verifyState(state) {
        var m = /^(\d+)\.([0-9a-z]+)\.([0-9a-f]{32})$/.exec(String(state || ''));
        if (!m) return null;
        var p = m[1] + '.' + m[2];
        var a = Buffer.from(sign(p)), b = Buffer.from(m[3]);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        if (now() - parseInt(m[2], 36) > STATE_TTL_MS) return null;
        return Number(m[1]);
    }

    function authorizeUrl(userId) {
        var q = new URLSearchParams({
            client_id: opts.clientId,
            redirect_uri: opts.redirectUri,
            response_type: 'code',
            scope: SCOPE,
            state: makeState(userId)
        });
        return API + '/authorize?' + q.toString();
    }

    function json(r) { return r.json().catch(function () { return {}; }); }

    /** code (من رجوع Streamlabs) → { success, socketToken } أو { success:false, error } */
    function socketTokenFromCode(code) {
        if (!code) return Promise.resolve({ success: false, error: 'missing_code' });
        return Promise.resolve().then(function () {
            return opts.fetch(API + '/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ grant_type: 'authorization_code', client_id: opts.clientId, client_secret: opts.clientSecret, redirect_uri: opts.redirectUri, code: String(code) })
            });
        }).then(function (r) {
            return json(r).then(function (b) {
                if (!r.ok || !b.access_token) return { success: false, error: 'token_exchange_failed' };
                return opts.fetch(API + '/socket/token', { headers: { Authorization: 'Bearer ' + b.access_token, Accept: 'application/json' } }).then(function (r2) {
                    return json(r2).then(function (b2) {
                        if (!r2.ok || !b2.socket_token) return { success: false, error: 'socket_token_failed' };
                        return { success: true, socketToken: String(b2.socket_token) };
                    });
                });
            });
        }).catch(function () { return { success: false, error: 'network' }; });
    }

    return { enabled: enabled, authorizeUrl: authorizeUrl, verifyState: verifyState, socketTokenFromCode: socketTokenFromCode };
}

var instance = null;
function get() {
    if (!instance) {
        var config = require('../config');
        instance = createOAuth({
            clientId: config.streamlabsClientId,
            clientSecret: config.streamlabsClientSecret,
            redirectUri: config.streamlabsRedirectUri,
            fetch: function (u, o) { return global.fetch(u, o); }
        });
    }
    return instance;
}

module.exports = { createOAuth: createOAuth, get: get };
