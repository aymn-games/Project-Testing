/**
 * ==========================================================================
 *  AGP TIKTOK OAUTH SERVICE — تسجيل دخول تيك توك الرسمي (Login Kit v2)
 * ==========================================================================
 *
 * هذا البديل الحقيقي لطريقة "كود بالبايو" القديمة (verifyTikTokOwnership
 * بـauth-service.js) — تلك تبقى بالكود كخيار احتياطي، لكن هذا المسار هو
 * الموصى به الآن: تسجيل دخول تيك توك الرسمي عبر OAuth 2.0، بدون أي كود
 * يدوي وبدون استخراج HTML عرضة للحجب.
 *
 * التدفق (راجع docs التيك توك الرسمية — Login Kit v2 OAuth):
 *   1) buildAuthorizeUrl()  — رابط "تسجيل الدخول بتيك توك" اللي نوجّه له
 *      المستخدم، فيه state موقّع (HMAC) يحمل هويته حتى نعرف نربط لمين
 *      لما يرجع (بدون جدول قاعدة بيانات منفصل لحفظ حالات مؤقتة).
 *   2) exchangeCodeForToken() — تبادل الكود اللي رجّعه تيك توك بـaccess
 *      token فعلي (على السيرفر فقط، أبداً بالمتصفح — التوكن لا يُكشَف).
 *   3) fetchTikTokUserInfo() — بيانات المستخدم الحقيقية (open_id، اليوزر
 *      نيم الفعلي، الاسم المعروض، الصورة) باستخدام access token.
 *   4) linkVerifiedAccount() — يحفظ الربط بقاعدة البيانات، مع منع نفس
 *      حساب تيك توك (نفس open_id) من الارتباط بأكثر من حساب AGP.
 * ==========================================================================
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
        scope: 'user.info.basic',
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
 * بيانات المستخدم الحقيقية من تيك توك (open_id، الاسم المعروض،
 * الصورة) — user.info.basic فقط، كافية لهدفنا. ⚠️ [إصلاح] كنا نطلب
 * حقل "username" أيضاً، لكن هذا الحقل ما هو موثَّق ضمن نطاق
 * user.info.basic بتوثيق تيك توك الرسمي (فقط open_id، union_id،
 * avatar_url، display_name) — احتمال قوي إنه هو سبب فشل الطلب بالكامل
 * (تيك توك يرفض الطلب كله لو فيه حقل غير مصرَّح به بدل ما يتجاهله).
 * شلناه؛ لو رجع فعلاً بدون خطأ الآن، نعرف السبب بالتأكيد ونقرر بعدها
 * كيف نجيب اليوزرنيم الحقيقي (على الأغلب يحتاج نطاق user.info.profile
 * إضافي، يحتاج مراجعة تيك توك).
 * @returns {Promise<{success:boolean, user?:Object, error?:string}>}
 */
async function fetchTikTokUserInfo(accessToken) {
    try {
        var fields = 'open_id,display_name,avatar_url';
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

module.exports = {
    buildAuthorizeUrl: buildAuthorizeUrl,
    verifyState: verifyState,
    exchangeCodeForToken: exchangeCodeForToken,
    fetchTikTokUserInfo: fetchTikTokUserInfo,
    linkVerifiedAccount: linkVerifiedAccount
};
