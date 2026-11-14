/**
 * AGP KICK OAUTH SERVICE — ربط حساب كيك بحساب الموقع (OAuth 2.1 + PKCE).
 * الهدف: نعرف إن الستريمر فعلاً صاحب قناة كيك قبل ما نسمح له يربط
 * الألعاب ببثها (checkKickConnectAllowed بـ websocket/ws-server.js) — نفس
 * فكرة توثيق تيك توك (tiktok-oauth-service.js).
 *
 * التدفق (docs.kick.com/getting-started/generating-tokens-oauth2-flow):
 *   1) buildAuthorizeUrl(userId) — رابط id.kick.com/oauth/authorize. الـstate
 *      موقّع (HMAC) ويحمل هوية المستخدم، والـcode_verifier مشتق منه بالـHMAC
 *      بعد، فما نحتاج نخزن شي بقاعدة البيانات بين الطلبين.
 *   2) exchangeCodeForToken(code, state) — يبدّل الكود بتوكن مستخدم (سيرفر فقط).
 *   3) fetchKickAccount(token) — رقم المستخدم واسمه وصورته، واسم قناته (slug).
 *   4) linkVerifiedAccount() — يحفظ الربط، ويمنع نفس حساب كيك من الارتباط
 *      بأكثر من حساب بالموقع. التوكن نفسه ما يُحفظ (نحتاجه للتوثيق بس).
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var config = require('../config');
var logger = require('../utils/logger');

var AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
var TOKEN_URL = 'https://id.kick.com/oauth/token';
var API_BASE = 'https://api.kick.com';
var SCOPES = 'user:read channel:read';
var STATE_TTL_MS = 10 * 60 * 1000;
var REQUEST_TIMEOUT_MS = 15000;

function secret() {
    // نفس سر توقيع state المستخدم لتيك توك — بغرض مختلف (بادئة 'kick').
    return 'kick.' + config.tiktokStateSecret;
}

function hmac(data) {
    return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function signState(data) {
    var payload = JSON.stringify(Object.assign({}, data, {
        exp: Date.now() + STATE_TTL_MS,
        nonce: crypto.randomBytes(16).toString('hex')
    }));
    var payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    return payloadB64 + '.' + hmac(payloadB64);
}

/** محتوى state لو صحيح وما انتهى ({uid, nonce, exp})، وإلا null. */
function verifyState(state) {
    if (!state || typeof state !== 'string' || state.indexOf('.') === -1) return null;
    var parts = state.split('.');
    var sigBuf = Buffer.from(parts[1] || '');
    var expBuf = Buffer.from(hmac(parts[0]));
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        var payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now() || !payload.uid || !payload.nonce) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

/** PKCE: الـverifier مشتق من nonce الـstate بالسر — ثابت لنفس الطلب وما ينعرف من برّا. */
function codeVerifierFor(nonce) {
    return hmac('pkce.' + nonce) + hmac('pkce2.' + nonce); // 86 حرف (المسموح 43–128)
}

function codeChallengeFor(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function isConfigured() {
    return Boolean(config.kickClientId && config.kickClientSecret);
}

/** رابط موافقة كيك لربط حساب المستخدم. */
function buildAuthorizeUrl(userId) {
    var state = signState({ uid: userId });
    var nonce = verifyState(state).nonce;
    var params = new URLSearchParams({
        response_type: 'code',
        client_id: config.kickClientId,
        redirect_uri: config.kickRedirectUri,
        scope: SCOPES,
        code_challenge: codeChallengeFor(codeVerifierFor(nonce)),
        code_challenge_method: 'S256',
        state: state
    });
    return AUTHORIZE_URL + '?' + params.toString();
}

function timedFetch(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function () { clearTimeout(timer); });
}

/**
 * @param {string} code
 * @param {{nonce:string}} statePayload - من verifyState
 * @returns {Promise<{success:boolean, accessToken?:string, error?:string}>}
 */
async function exchangeCodeForToken(code, statePayload) {
    try {
        var res = await timedFetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.kickClientId,
                client_secret: config.kickClientSecret,
                redirect_uri: config.kickRedirectUri,
                code_verifier: codeVerifierFor(statePayload.nonce),
                code: code
            }).toString()
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.access_token) {
            logger.error('Kick OAuth: token exchange failed. status=' + res.status + ' error=' + (data && (data.error_description || data.error || data.message)));
            return { success: false, error: 'token_exchange_failed' };
        }
        return { success: true, accessToken: data.access_token };
    } catch (err) {
        logger.error('Kick OAuth: token exchange network error:', err && err.message);
        return { success: false, error: 'token_exchange_failed' };
    }
}

async function getJson(path, accessToken) {
    var res = await timedFetch(API_BASE + path, { headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' } });
    var data = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error(path + ' HTTP ' + res.status);
    return data;
}

/**
 * حساب كيك صاحب التوكن: { userId, name, avatarUrl, slug }.
 * @returns {Promise<{success:boolean, account?:Object, error?:string}>}
 */
async function fetchKickAccount(accessToken) {
    try {
        var users = await getJson('/public/v1/users', accessToken);
        var u = users && Array.isArray(users.data) ? users.data[0] : null;
        if (!u || !u.user_id) return { success: false, error: 'user_info_failed' };
        var channels = await getJson('/public/v1/channels', accessToken);
        var ch = channels && Array.isArray(channels.data) ? channels.data[0] : null;
        var slug = ch && ch.slug ? String(ch.slug).toLowerCase() : null;
        if (!slug) return { success: false, error: 'user_info_failed' };
        return {
            success: true,
            account: { userId: String(u.user_id), name: u.name || slug, avatarUrl: u.profile_picture || null, slug: slug }
        };
    } catch (err) {
        logger.error('Kick OAuth: fetching account failed:', err && err.message);
        return { success: false, error: 'user_info_failed' };
    }
}

/** يحفظ الربط. يرفض لو نفس حساب كيك مربوط بحساب ثاني بالموقع. */
function linkVerifiedAccount(userId, account) {
    var existing = db.prepare('SELECT id FROM users WHERE kick_user_id = ? AND id != ?').get(account.userId, userId);
    if (existing) return { success: false, error: 'kick_account_already_linked_elsewhere' };
    db.prepare(
        'UPDATE users SET kick_user_id = ?, kick_username = ?, kick_display_name = ?, kick_avatar_url = ?, kick_verified = 1 WHERE id = ?'
    ).run(account.userId, account.slug, account.name || null, account.avatarUrl || null, userId);
    return { success: true };
}

function unlink(userId) {
    db.prepare('UPDATE users SET kick_user_id = NULL, kick_username = NULL, kick_display_name = NULL, kick_avatar_url = NULL, kick_verified = 0 WHERE id = ?').run(userId);
    return { success: true };
}

module.exports = {
    isConfigured: isConfigured,
    buildAuthorizeUrl: buildAuthorizeUrl,
    verifyState: verifyState,
    exchangeCodeForToken: exchangeCodeForToken,
    fetchKickAccount: fetchKickAccount,
    linkVerifiedAccount: linkVerifiedAccount,
    unlink: unlink,
    // للاختبارات
    _codeVerifierFor: codeVerifierFor,
    _codeChallengeFor: codeChallengeFor
};
