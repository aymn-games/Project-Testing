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

var AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
var TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
var USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
var STATE_TTL_MS = 10 * 60 * 1000; // ١٠ دقايق كافية لإكمال تسجيل الدخول بتيك توك

/** توقيع state بـHMAC-SHA256 — يحمل هوية المستخدم + وقت الانتهاء، بدون أي تخزين مؤقت بقاعدة البيانات. */
function signState(userId) {
    var payload = JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(8).toString('hex') });
    var payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    var sig = crypto.createHmac('sha256', config.tiktokStateSecret).update(payloadB64).digest('base64url');
    return payloadB64 + '.' + sig;
}

/** التحقق من state ورجوع userId منه — null لو موقّع بشكل خاطئ أو منتهي. */
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
        if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
        return payload.uid;
    } catch (e) {
        return null;
    }
}

/**
 * رابط "تسجيل الدخول بتيك توك" اللي نوجّه له المستخدم.
 * @param {number} userId
 * @returns {string}
 */
function buildAuthorizeUrl(userId) {
    var state = signState(userId);
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
        return { success: true, accessToken: data.access_token };
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
 * @returns {{success:boolean, error?:string}}
 */
function linkVerifiedAccount(userId, tiktokUser) {
    var existing = db.prepare('SELECT id FROM users WHERE tiktok_open_id = ? AND id != ?').get(tiktokUser.open_id, userId);
    if (existing) return { success: false, error: 'tiktok_account_already_linked_elsewhere' };

    db.prepare(
        'UPDATE users SET tiktok_open_id = ?, tiktok_username = ?, tiktok_display_name = ?, tiktok_avatar_url = ?, tiktok_verified = 1, tiktok_verification_code = NULL WHERE id = ?'
    ).run(tiktokUser.open_id, tiktokUser.username || null, tiktokUser.display_name || null, tiktokUser.avatar_url || null, userId);
    return { success: true };
}

// نفس حد updateAvatarImage بـ auth-service.js.
var MAX_AVATAR_BASE64_LENGTH = 85 * 1024;
var AVATAR_FETCH_TIMEOUT_MS = 8000;

/**
 * يحفظ صورة تيك توك كصورة بروفايل — فقط لو المستخدم ما عنده صورة خاصة
 * فيه. نحمّل الصورة ونخزّنها Base64 بدل الرابط لأن روابط صور تيك توك
 * موقّعة وتنتهي صلاحيتها بعد أيام. أي فشل هنا يُتجاهَل بهدوء ولا يأثر
 * على نجاح الربط نفسه.
 * @returns {Promise<boolean>} true لو انحفظت الصورة
 */
async function saveTikTokAvatarIfMissing(userId, tiktokUser) {
    try {
        var url = tiktokUser && (tiktokUser.avatar_url_100 || tiktokUser.avatar_url);
        if (!url) return false;
        var row = db.prepare('SELECT avatar_image_base64 FROM users WHERE id = ?').get(userId);
        if (!row || row.avatar_image_base64) return false;

        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, AVATAR_FETCH_TIMEOUT_MS);
        var res;
        try { res = await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timer); }
        if (!res.ok) return false;

        var mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (mime === 'image/jpg') mime = 'image/jpeg';
        if (!/^image\/(png|jpeg|webp)$/.test(mime)) return false;

        var buf = Buffer.from(await res.arrayBuffer());
        var dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
        if (dataUrl.length > MAX_AVATAR_BASE64_LENGTH) return false;

        // الشرط "IS NULL" يحمي من الكتابة فوق صورة رفعها المستخدم بنفس اللحظة.
        var result = db.prepare('UPDATE users SET avatar_image_base64 = ? WHERE id = ? AND avatar_image_base64 IS NULL').run(dataUrl, userId);
        return result.changes > 0;
    } catch (err) {
        logger.error('TikTok OAuth: avatar save failed:', err.message);
        return false;
    }
}

module.exports = {
    saveTikTokAvatarIfMissing: saveTikTokAvatarIfMissing,
    buildAuthorizeUrl: buildAuthorizeUrl,
    verifyState: verifyState,
    exchangeCodeForToken: exchangeCodeForToken,
    fetchTikTokUserInfo: fetchTikTokUserInfo,
    linkVerifiedAccount: linkVerifiedAccount
};
