/**
 * AGP TWITCH OAUTH SERVICE — ربط حساب تويتش بحساب الموقع (Authorization Code).
 *
 * لازم لسببين:
 *   1) نعرف إن الستريمر صاحب القناة فعلاً (checkStreamConnectAllowed بـ ws-server.js).
 *   2) تويتش ما يسمح لتطبيقنا يقرأ شات القناة أو المتابعات أو الـBits أو
 *      الاشتراكات إلا بعد موافقة صاحبها على الصلاحيات تحت (SCOPES). الموافقة
 *      تبقى عند تويتش لين يلغيها هو، فتوكن المستخدم نفسه ما نحفظه.
 *
 * التدفق: buildAuthorizeUrl(userId) → id.twitch.tv/oauth2/authorize (state موقّع
 * HMAC يحمل هوية المستخدم) → callback: exchangeCodeForToken → fetchTwitchAccount
 * → linkVerifiedAccount.
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var config = require('../config');
var logger = require('../utils/logger');

var AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
var TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
var USERS_URL = 'https://api.twitch.tv/helix/users';
// قراءة الشات باسم صاحب القناة (user:read:chat + user:bot + channel:bot)،
// المتابعات (moderator:read:followers)، الـBits، والاشتراكات.
var SCOPES = 'user:read:chat user:bot channel:bot moderator:read:followers bits:read channel:read:subscriptions';
var STATE_TTL_MS = 10 * 60 * 1000;
var REQUEST_TIMEOUT_MS = 15000;

function hmac(data) {
    return crypto.createHmac('sha256', 'twitch.' + config.tiktokStateSecret).update(data).digest('base64url');
}

function signState(data) {
    var payload = JSON.stringify(Object.assign({}, data, { exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(12).toString('hex') }));
    var b64 = Buffer.from(payload, 'utf8').toString('base64url');
    return b64 + '.' + hmac(b64);
}

function verifyState(state) {
    if (!state || typeof state !== 'string' || state.indexOf('.') === -1) return null;
    var parts = state.split('.');
    var sigBuf = Buffer.from(parts[1] || '');
    var expBuf = Buffer.from(hmac(parts[0]));
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        var payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now() || !payload.uid) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function isConfigured() {
    return Boolean(config.twitchClientId && config.twitchClientSecret);
}

function buildAuthorizeUrl(userId) {
    return AUTHORIZE_URL + '?' + new URLSearchParams({
        response_type: 'code',
        client_id: config.twitchClientId,
        redirect_uri: config.twitchRedirectUri,
        scope: SCOPES,
        state: signState({ uid: userId }),
        // صفحة الموافقة تطلع دايماً — لو أضفنا صلاحية جديدة لاحقاً يوافق عليها.
        force_verify: 'true'
    }).toString();
}

function timedFetch(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function () { clearTimeout(timer); });
}

/** @returns {Promise<{success:boolean, accessToken?:string, scopes?:string[], error?:string}>} */
async function exchangeCodeForToken(code) {
    try {
        var res = await timedFetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.twitchClientId,
                client_secret: config.twitchClientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: config.twitchRedirectUri
            }).toString()
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.access_token) {
            logger.error('Twitch OAuth: token exchange failed. status=' + res.status + ' message=' + (data && data.message));
            return { success: false, error: 'token_exchange_failed' };
        }
        return { success: true, accessToken: data.access_token, scopes: Array.isArray(data.scope) ? data.scope : [] };
    } catch (err) {
        logger.error('Twitch OAuth: token exchange network error:', err && err.message);
        return { success: false, error: 'token_exchange_failed' };
    }
}

/** حساب تويتش صاحب التوكن: { userId, login, name, avatarUrl }. */
async function fetchTwitchAccount(accessToken) {
    try {
        var res = await timedFetch(USERS_URL, { headers: { 'Authorization': 'Bearer ' + accessToken, 'Client-Id': config.twitchClientId } });
        var data = await res.json().catch(function () { return null; });
        var u = res.ok && data && Array.isArray(data.data) ? data.data[0] : null;
        if (!u || !u.id || !u.login) return { success: false, error: 'user_info_failed' };
        return { success: true, account: { userId: String(u.id), login: String(u.login).toLowerCase(), name: u.display_name || u.login, avatarUrl: u.profile_image_url || null } };
    } catch (err) {
        logger.error('Twitch OAuth: fetching account failed:', err && err.message);
        return { success: false, error: 'user_info_failed' };
    }
}

function linkVerifiedAccount(userId, account) {
    var existing = db.prepare('SELECT id FROM users WHERE twitch_user_id = ? AND id != ?').get(account.userId, userId);
    if (existing) return { success: false, error: 'twitch_account_already_linked_elsewhere' };
    db.prepare(
        'UPDATE users SET twitch_user_id = ?, twitch_username = ?, twitch_display_name = ?, twitch_avatar_url = ?, twitch_verified = 1 WHERE id = ?'
    ).run(account.userId, account.login, account.name || null, account.avatarUrl || null, userId);
    return { success: true };
}

function unlink(userId) {
    db.prepare('UPDATE users SET twitch_user_id = NULL, twitch_username = NULL, twitch_display_name = NULL, twitch_avatar_url = NULL, twitch_verified = 0 WHERE id = ?').run(userId);
    return { success: true };
}

module.exports = {
    SCOPES: SCOPES,
    isConfigured: isConfigured,
    buildAuthorizeUrl: buildAuthorizeUrl,
    verifyState: verifyState,
    exchangeCodeForToken: exchangeCodeForToken,
    fetchTwitchAccount: fetchTwitchAccount,
    linkVerifiedAccount: linkVerifiedAccount,
    unlink: unlink
};
