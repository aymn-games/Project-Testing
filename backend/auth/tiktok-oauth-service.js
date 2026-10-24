/**
 * AGP TIKTOK OAUTH SERVICE — تسجيل دخول تيك توك الرسمي (Login Kit v2).
 * بديل حقيقي لطريقة "كود بالبايو" القديمة (verifyTikTokOwnership
 * بـauth-service.js، تبقى كخيار احتياطي).
 *
 * التدفق:
 *   1) buildAuthorizeUrl()  — رابط "تسجيل الدخول بتيك توك"، فيه state
 *      موقّع (HMAC) يحمل هوية المستخدم بدون جدول قاعدة بيانات منفصل.
 *   2) exchangeCodeForToken() — تبادل الكود بـaccess token (سيرفر فقط).
 *   3) fetchTikTokUserInfo() — بيانات المستخدم الحقيقية عبر access token.
 *   4) linkVerifiedAccount() — يحفظ الربط، مع منع نفس open_id من
 *      الارتباط بأكثر من حساب AGP.
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var config = require('../config');
var logger = require('../utils/logger');
var tiktokAvatarSync = require('./tiktok-avatar-sync');

var AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
var TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
var USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
var STATE_TTL_MS = 10 * 60 * 1000; // ١٠ دقايق كافية لإكمال تسجيل الدخول بتيك توك

/** توقيع state بـHMAC-SHA256 — يحمل بيانات الطلب + وقت الانتهاء، بدون أي تخزين مؤقت بقاعدة البيانات. */
function signState(data) {
    var payload = JSON.stringify(Object.assign({}, data, { exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(8).toString('hex') }));
    var payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    var sig = crypto.createHmac('sha256', config.tiktokStateSecret).update(payloadB64).digest('base64url');
    return payloadB64 + '.' + sig;
}

/**
 * التحقق من state ورجوع محتواه — null لو موقّع بشكل خاطئ أو منتهي.
 * ربط حساب: {uid}. دخول/تسجيل بتيك توك: {mode:'login', did, next}.
 */
function verifyState(state) {
    if (!state || state.indexOf('.') === -1) return null;
    var parts = state.split('.');
    var payloadB64 = parts[0];
    var sig = parts[1];
    var expectedSig = crypto.createHmac('sha256', config.tiktokStateSecret).update(payloadB64).digest('base64url');
    // مقارنة بوقت ثابت — يمنع هجمات توقيت (timing attack) على التوقيع
    var sigBuf = Buffer.from(sig || '');
    var expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        var payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now()) return null;
        if (!payload.uid && payload.mode !== 'login') return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function authorizeUrlWithState(state) {
    var params = new URLSearchParams({
        client_key: config.tiktokClientKey,
        scope: 'user.info.basic,user.info.profile',
        response_type: 'code',
        redirect_uri: config.tiktokRedirectUri,
        state: state
    });
    return AUTHORIZE_URL + '?' + params.toString();
}

/**
 * رابط "تسجيل الدخول بتيك توك" اللي نوجّه له المستخدم.
 * @param {number} userId
 * @returns {string}
 */
function buildAuthorizeUrl(userId) {
    return authorizeUrlWithState(signState({ uid: userId }));
}

/**
 * رابط "الدخول/إنشاء حساب بتيك توك" من صفحة الدخول (بدون جلسة سابقة).
 * نفس redirect_uri — الـcallback يميّز الحالتين من mode داخل state.
 * @param {string} [deviceId] - لقيد الأجهزة (auth-client.js: getDeviceId)
 * @param {string} [next] - صفحة الرجوع بعد الدخول (يُتحقَّق منها بالواجهة)
 * @returns {string}
 */
function buildLoginAuthorizeUrl(deviceId, next) {
    return authorizeUrlWithState(signState({ mode: 'login', did: String(deviceId || '').slice(0, 100), next: String(next || '').slice(0, 300) }));
}

/**
 * تبادل authorization code بـaccess token (سيرفر-لسيرفر فقط).
 * @returns {Promise<{success:boolean, accessToken?:string, error?:string}>}
 */
async function exchangeCodeForToken(code) {
    try {
        var res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
            body: new URLSearchParams({
                client_key: config.tiktokClientKey,
                client_secret: config.tiktokClientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: config.tiktokRedirectUri
            }).toString()
        });
        var data = await res.json();
        if (!res.ok || !data.access_token) {
            logger.error('TikTok OAuth: token exchange failed. status=' + res.status + ' body=' + JSON.stringify(data));
            return { success: false, error: (data && (data.error_description || data.error)) || 'token_exchange_failed' };
        }
        return {
            success: true,
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null,
            refreshExpiresAt: data.refresh_expires_in ? Date.now() + Number(data.refresh_expires_in) * 1000 : null
        };
    } catch (err) {
        logger.error('TikTok OAuth: token exchange network error:', err.message);
        return { success: false, error: 'token_exchange_network_error' };
    }
}

/**
 * بيانات المستخدم الحقيقية من تيك توك — open_id/display_name/avatar_url
 * تحت user.info.basic، وusername (لمطابقة شات البث) تحت user.info.profile؛
 * كلا الصلاحيتين مطلوبتان بـbuildAuthorizeUrl أعلاه.
 * @returns {Promise<{success:boolean, user?:Object, error?:string}>}
 */
async function fetchTikTokUserInfo(accessToken) {
    try {
        var fields = 'open_id,display_name,avatar_url,avatar_url_100,username';
        var res = await fetch(USER_INFO_URL + '?fields=' + fields, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        var data = await res.json();
        if (!res.ok || !data.data || !data.data.user) {
            logger.error('TikTok OAuth: user info fetch failed. status=' + res.status + ' body=' + JSON.stringify(data));
            return { success: false, error: (data && data.error && data.error.message) || 'user_info_failed' };
        }
        return { success: true, user: data.data.user };
    } catch (err) {
        logger.error('TikTok OAuth: user info network error:', err.message);
        return { success: false, error: 'user_info_network_error' };
    }
}

/**
 * يحفظ الربط الموثَّق بقاعدة البيانات. يمنع نفس حساب تيك توك (نفس
 * open_id) من الارتباط بأكثر من حساب AGP — لو مرتبط بحساب AGP ثاني
 * فعلاً، يرجع خطأ واضح بدل ما يسرق الربط بصمت.
 * @param {{refreshToken?:string, refreshExpiresAt?:number}} [tokens] - من exchangeCodeForToken
 * @returns {{success:boolean, error?:string}}
 */
function linkVerifiedAccount(userId, tiktokUser, tokens) {
    var existing = db.prepare('SELECT id FROM users WHERE tiktok_open_id = ? AND id != ?').get(tiktokUser.open_id, userId);
    if (existing) return { success: false, error: 'tiktok_account_already_linked_elsewhere' };

    db.prepare(
        'UPDATE users SET tiktok_open_id = ?, tiktok_username = ?, tiktok_display_name = ?, tiktok_avatar_url = ?, tiktok_verified = 1, tiktok_verification_code = NULL, tiktok_refresh_token = ?, tiktok_refresh_expires_at = ? WHERE id = ?'
    ).run(tiktokUser.open_id, tiktokUser.username || null, tiktokUser.display_name || null, tiktokUser.avatar_url || null,
        (tokens && tokens.refreshToken) || null, (tokens && tokens.refreshExpiresAt) || null, userId);
    return { success: true };
}

/**
 * تجديد access token بالـrefresh token المحفوظ (تيك توك قد يرجع refresh
 * token جديد — نحفظه بدل القديم).
 * @returns {Promise<string|null>} access token أو null لو تعذّر
 */
async function refreshAccessToken(userId, refreshToken) {
    try {
        var res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
            body: new URLSearchParams({
                client_key: config.tiktokClientKey,
                client_secret: config.tiktokClientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }).toString()
        });
        var data = await res.json();
        if (!res.ok || !data.access_token) {
            logger.error('TikTok OAuth: token refresh failed for user ' + userId + '. status=' + res.status + ' error=' + (data && (data.error_description || data.error)));
            return null;
        }
        if (data.refresh_token) {
            var expiresAt = data.refresh_expires_in ? Date.now() + Number(data.refresh_expires_in) * 1000 : null;
            db.prepare('UPDATE users SET tiktok_refresh_token = ?, tiktok_refresh_expires_at = ? WHERE id = ?').run(data.refresh_token, expiresAt, userId);
        }
        return data.access_token;
    } catch (err) {
        logger.error('TikTok OAuth: token refresh network error:', err.message);
        return null;
    }
}

// محاولة وحدة لكل مستخدم كل REFRESH_USERNAME_COOLDOWN_MS — الفحص يُستدعى
// من استطلاع is-live (كل ~45 ثانية) فلازم ما نضغط على API تيك توك.
var REFRESH_USERNAME_COOLDOWN_MS = 10 * 60 * 1000;
var _lastUsernameRefreshAt = {}; // userId -> وقت آخر محاولة

/**
 * الستريمر غيّر يوزره في تيك توك بعد الربط؟ نجيب اليوزر الحالي من تيك
 * توك (عبر refresh token المحفوظ وقت الربط بـOAuth) ونحدّث tiktok_username.
 * بدونه يدوّر الموقع على بث اليوزر القديم ويطلع "ما لقينا بث".
 * يشتغل فقط للحسابات المربوطة بـOAuth بعد إضافة هذه الميزة.
 * @returns {Promise<string|null>} اليوزر الجديد لو تغيّر، وإلا null
 */
async function refreshTikTokUsername(userId) {
    var now = Date.now();
    if (_lastUsernameRefreshAt[userId] && now - _lastUsernameRefreshAt[userId] < REFRESH_USERNAME_COOLDOWN_MS) return null;
    _lastUsernameRefreshAt[userId] = now;

    var row = db.prepare('SELECT tiktok_username, tiktok_open_id, tiktok_refresh_token, tiktok_refresh_expires_at FROM users WHERE id = ? AND tiktok_verified = 1').get(userId);
    if (!row || !row.tiktok_refresh_token) return null;
    if (row.tiktok_refresh_expires_at && row.tiktok_refresh_expires_at < now) return null;

    var accessToken = await refreshAccessToken(userId, row.tiktok_refresh_token);
    if (!accessToken) return null;

    var info = await fetchTikTokUserInfo(accessToken);
    if (!info.success) return null;
    var tiktokUser = info.user;
    // أمان: نفس حساب تيك توك المربوط فعلاً (open_id ثابت لا يتغيّر مع اليوزر).
    if (!tiktokUser.username || (row.tiktok_open_id && tiktokUser.open_id !== row.tiktok_open_id)) return null;

    var newUsername = String(tiktokUser.username).trim().replace(/^@+/, '');
    if (newUsername.toLowerCase() === String(row.tiktok_username || '').toLowerCase()) return null;

    // اليوزر الجديد مربوط موثَّق بحساب AGP ثاني (حالة نادرة: أخذه بعد ما تُرك) — ما نسرقه.
    var taken = db.prepare('SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE AND id != ?').get(newUsername, userId);
    if (taken) {
        logger.error('TikTok OAuth: new username "' + newUsername + '" for user ' + userId + ' is already linked to user ' + taken.id + ' — not updating.');
        return null;
    }

    db.prepare('UPDATE users SET tiktok_username = ?, tiktok_display_name = COALESCE(?, tiktok_display_name) WHERE id = ?')
        .run(newUsername, tiktokUser.display_name || null, userId);
    logger.log('TikTok OAuth: user ' + userId + ' TikTok username changed "' + row.tiktok_username + '" -> "' + newUsername + '" — updated.');
    return newUsername;
}

/**
 * صورة تيك توك كصورة بروفايل لحظة الربط — فقط لو ما عنده صورة خاصة
 * (راجع tiktok-avatar-sync.js). أي فشل يُتجاهَل ولا يأثر على الربط.
 * @returns {Promise<boolean>}
 */
function saveTikTokAvatarIfMissing(userId, tiktokUser) {
    var url = tiktokUser && (tiktokUser.avatar_url_100 || tiktokUser.avatar_url);
    return tiktokAvatarSync.saveAvatarIfMissing(userId, url);
}

module.exports = {
    saveTikTokAvatarIfMissing: saveTikTokAvatarIfMissing,
    buildAuthorizeUrl: buildAuthorizeUrl,
    buildLoginAuthorizeUrl: buildLoginAuthorizeUrl,
    verifyState: verifyState,
    exchangeCodeForToken: exchangeCodeForToken,
    fetchTikTokUserInfo: fetchTikTokUserInfo,
    linkVerifiedAccount: linkVerifiedAccount,
    refreshTikTokUsername: refreshTikTokUsername
};
