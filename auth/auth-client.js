/**
 * AGP AUTH CLIENT — shared client layer for account pages, connects
 * login.html / signup.html / admin.html / dashboard-core to
 * backend/http/auth-router.js (see docs/BACKEND_ARCHITECTURE.md §10).
 * Deliberately separate from window.AymanGamesPlatform (AGP), hence its
 * own namespace: window.AGPAuth.
 *
 * Session is stored in localStorage (mirrored to a parent-domain cookie,
 * see getToken) and attached to every protected
 * request via an Authorization: Bearer <token> header.
 */

(function (global) {
'use strict';

var API_BASE = 'https://project-testing-akds.onrender.com';
var TOKEN_KEY = 'agp_auth_token';
var USER_KEY = 'agp_auth_user';
var DEVICE_ID_KEY = 'agp_device_id';

/* Local storage — token + last-known user, used for instant display
 * before /api/auth/me confirms; not treated as the source of truth. */

/* Token is mirrored to a cookie on the site's parent domain so the same
 * login works on www and non-www (they have separate localStorage) — e.g.
 * a game QR built from www.aymngames.online opened on a phone logged in at
 * aymngames.online. Also survives a localStorage wipe while the cookie lives. */
var TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // = SESSION_DURATION_MS بالخادم

function cookieDomain() {
    try { return /(^|\.)aymngames\.online$/.test(location.hostname) ? '; domain=.aymngames.online' : ''; } catch (err) { return ''; }
}

function readTokenCookie() {
    try {
        var m = document.cookie.match(/(?:^|;\s*)agp_auth_token=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    } catch (err) { return null; }
}

function writeTokenCookie(token, maxAge) {
    try {
        var secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = 'agp_auth_token=' + encodeURIComponent(token || '') + '; max-age=' + maxAge +
            '; path=/' + cookieDomain() + '; SameSite=Lax' + secure;
    } catch (err) { /* الكوكي نسخة احتياطية فقط */ }
}

function getToken() {
    var token = null;
    try { token = localStorage.getItem(TOKEN_KEY) || null; } catch (err) { token = null; }
    if (token) {
        // حسابات مسجّلة قبل النسخة الاحتياطية: ننسخ التوكن للكوكي أول ما ينقرأ
        if (readTokenCookie() !== token) writeTokenCookie(token, TOKEN_COOKIE_MAX_AGE);
        return token;
    }
    token = readTokenCookie();
    if (token) { try { localStorage.setItem(TOKEN_KEY, token); } catch (err) { /* ignore */ } }
    return token || null;
}

function setSession(token, user) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    } catch (err) { /* localStorage unavailable — don't break the page */ }
    if (token && readTokenCookie() !== token) writeTokenCookie(token, TOKEN_COOKIE_MAX_AGE);
}

function clearSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch (err) {}
    writeTokenCookie('', 0);
}

function getCachedUser() {
    try {
        var raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
}

/**
 * Stable per-browser "device" id — random, generated once and persisted in
 * localStorage AND mirrored to a long-lived cookie on the site's parent
 * domain. Used only for the device limit on approved streamer accounts
 * (see auth-service.js: checkDeviceLock, up to 3 devices).
 * The cookie backup keeps the same id when localStorage is wiped (e.g.
 * Safari's 7-day storage cleanup) and across www/non-www of the same site.
 * NOT a real device fingerprint — clearing all site data or using a
 * different browser/profile yields a new id (an intentionally soft
 * constraint).
 * @returns {string|null}
 */
function readDeviceCookie() {
    try {
        var m = document.cookie.match(/(?:^|;\s*)agp_device_id=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    } catch (err) { return null; }
}

function writeDeviceCookie(id) {
    try {
        var host = location.hostname;
        var domain = /(^|\.)aymngames\.online$/.test(host) ? '; domain=.aymngames.online' : '';
        var secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = 'agp_device_id=' + encodeURIComponent(id) + '; max-age=' + (5 * 365 * 24 * 60 * 60) +
            '; path=/' + domain + '; SameSite=Lax' + secure;
    } catch (err) { /* الكوكي نسخة احتياطية فقط */ }
}

function getDeviceId() {
    var id = null;
    try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (err) { id = null; }
    if (!id) id = readDeviceCookie();
    if (!id) id = 'dev_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (err) { /* ignore */ }
    if (readDeviceCookie() !== id) writeDeviceCookie(id);
    return id;
}

/**
 * Generic request to any API path. Attaches Authorization automatically
 * when a token is stored. Always resolves to the parsed JSON response,
 * even on failure ({success: boolean, ...}) — the only exception is an
 * actual network failure (no connection to the server at all).
 *
 * Content-Type is sent only when there's a body: sending it unconditionally
 * forces a CORS preflight (extra OPTIONS request) on every call, including
 * public GETs with no login.
 * @param {string} path - e.g. '/api/auth/login'
 * @param {Object} [options] - {method, body}
 * @returns {Promise<Object>}
 */
function request(path, options) {
    options = options || {};
    var headers = {};
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.body) headers['Content-Type'] = 'application/json';

    return fetch(API_BASE + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        keepalive: Boolean(options.keepalive)   // يكمل الطلب حتى لو الصفحة تتسكّر (نبضة الخروج)
    }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
            data.__httpStatus = res.status;
            return data;
        });
    });
}

/* Auth functions — map 1:1 to http/auth-router.js routes */

function signup(username, email, password, wantsToBeStreamer, emailCode) {
    return request('/api/auth/signup', {
        method: 'POST',
        body: { username: username, email: email, password: password, wantsToBeStreamer: Boolean(wantsToBeStreamer), emailCode: emailCode }
    });
}

/** Signup step 1: email a 6-digit code; the account is only created by
 * signup(..., emailCode) with the right code. */
function sendSignupCode(username, email) {
    return request('/api/auth/signup/send-code', { method: 'POST', body: { username: username, email: email } });
}

/** Forgot username/email: identifier = email, profile ID, username or
 * verified TikTok username. Emails the account's details + a reset code;
 * returns {success, maskedEmail}. */
function recoverAccount(identifier) {
    return request('/api/auth/recover-account', { method: 'POST', body: { identifier: identifier } });
}

/** Profile: send a code to confirm the current email, or a new one. */
function sendEmailVerification(email) {
    return request('/api/auth/email/send-code', { method: 'POST', body: { email: email || undefined } });
}

function verifyEmail(code) {
    return request('/api/auth/email/verify', { method: 'POST', body: { code: code } })
        .then(function (result) {
            if (result && result.success) {
                var cached = getCachedUser();
                if (cached) { cached.email = result.email; cached.email_verified = true; setSession(getToken(), cached); }
            }
            return result;
        });
}

function login(email, password) {
    return request('/api/auth/login', { method: 'POST', body: { email: email, password: password, deviceId: getDeviceId() } })
        .then(function (result) {
            if (result.success) setSession(result.token, result.user);
            return result;
        });
}

function loginWithGoogle(idToken) {
    return request('/api/auth/google', { method: 'POST', body: { idToken: idToken, deviceId: getDeviceId() } })
        .then(function (result) {
            if (result.success) setSession(result.token, result.user);
            return result;
        });
}

/** "Continue with TikTok" on login.html: a full-page redirect to the
 * backend, which sends the user to TikTok's consent page. The backend
 * returns to login.html#tiktok_token=... (see completeTikTokLogin). */
function tiktokLoginUrl(next) {
    return API_BASE + '/api/auth/tiktok/oauth/login-start?device=' + encodeURIComponent(getDeviceId()) +
        (next ? '&next=' + encodeURIComponent(next) : '');
}

/** Stores the session token from the TikTok login redirect, then loads
 * the user from /api/auth/me. Resolves the user, or null. */
function completeTikTokLogin(token) {
    if (!token) return Promise.resolve(null);
    setSession(token, {});
    return refreshUser();
}

/**
 * Password reset step 1: request a code by email. Always resolves
 * {success:true}, even for an unregistered email — prevents email
 * enumeration from the client (see authService.requestPasswordReset).
 */
function forgotPassword(email) {
    return request('/api/auth/forgot-password', { method: 'POST', body: { email: email } });
}

/**
 * Password reset step 2: verify the code and set the new password.
 * Does not auto-login after success (all old sessions are invalidated) —
 * the user logs in with the new password via the normal form.
 */
function resetPasswordWithCode(email, code, newPassword) {
    return request('/api/auth/reset-password', { method: 'POST', body: { email: email, code: code, newPassword: newPassword } });
}

/** Same as resetPasswordWithCode but for the account-recovery flow, where
 * the user identified the account by something other than the email. */
function resetPasswordWithIdentifier(identifier, code, newPassword) {
    return request('/api/auth/reset-password', { method: 'POST', body: { identifier: identifier, code: code, newPassword: newPassword } });
}

/** Mandatory account-type choice (player/streamer) after first Google
 * sign-in on a brand-new account — see choose-account-type.html. */
function chooseAccountType(wantsToBeStreamer) {
    return request('/api/auth/account-type', { method: 'POST', body: { wantsToBeStreamer: Boolean(wantsToBeStreamer) } });
}

function needsAccountTypeChoice(user) {
    return Boolean(user) && user.account_type_chosen === false;
}

function logout() {
    return request('/api/auth/logout', { method: 'POST' }).then(function (result) {
        clearSession();
        return result;
    }).catch(function () {
        clearSession(); // even if the request fails (offline), don't stay "logged in" locally
        return { success: true };
    });
}

function me() {
    return request('/api/auth/me', { method: 'GET' });
}

/**
 * Refreshes the locally cached user from the server without redirecting
 * or logging out on failure (unlike requireAuth). Used on public pages
 * (e.g. index.html) to pick up server-side permission changes without
 * forcing a login.
 * @returns {Promise<Object|null>}
 */
// Several scripts on the same page (header account button, games library
// lock, ...) call refreshUser while the page loads — concurrent calls share
// one in-flight /api/auth/me request. Once it settles, the next call fetches
// fresh data again (e.g. right after choosing an account type).
var _refreshUserPromise = null;

function refreshUser() {
    if (!getToken()) return Promise.resolve(null);
    if (_refreshUserPromise) return _refreshUserPromise;
    _refreshUserPromise = me().then(function (result) {
        if (result.success) {
            setSession(getToken(), result.user);
            return result.user;
        }
        // Only a real 401 means the session is gone — a server waking up
        // from sleep (5xx) must not log the user out (same rule as requireAuth).
        if (result.__httpStatus === 401) clearSession();
        return null;
    }).catch(function () { return null; }).then(function (user) {
        _refreshUserPromise = null;
        return user;
    });
    return _refreshUserPromise;
}

/* Header account button — one source of truth for every page with the
 * shared site header (index.html, games.html). The page template rebuilds
 * the header on its own schedule (and can finish rendering after any fixed
 * polling window on a slow phone), so a MutationObserver keeps the button
 * correct for the whole visit instead of patching it once. Logged in means
 * "has a stored session token"; a missing custom_id in the cached user
 * doesn't make someone look logged out. */
var ACCOUNT_LINK_TEXT_IN = 'البروفايل';
var ACCOUNT_LINK_TEXT_OUT = 'إنشاء حساب أو تسجيل الدخول';
// النص القديم بقوالب الهيدر المحفوظة — يتعرّف عليه ويتبدّل للجديد
var ACCOUNT_LINK_TEXT_LEGACY = 'حسابي';

function syncHeaderAccountLinks() {
    var loggedIn = Boolean(getToken());
    var user = loggedIn ? getCachedUser() : null;
    var text = loggedIn ? ACCOUNT_LINK_TEXT_IN : ACCOUNT_LINK_TEXT_OUT;
    var href = !loggedIn ? 'login.html'
        : (user && user.custom_id ? 'profile.html?id=' + encodeURIComponent(user.custom_id) : 'profile.html');
    var links = document.querySelectorAll('header a, [data-mobile-panel] a');
    for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var t = (a.textContent || '').trim();
        if (t !== ACCOUNT_LINK_TEXT_IN && t !== ACCOUNT_LINK_TEXT_OUT && t !== ACCOUNT_LINK_TEXT_LEGACY) continue;
        if (t !== text) a.textContent = text;
        if (a.getAttribute('href') !== href) a.setAttribute('href', href);
    }
}

function keepHeaderAccountLinkSynced() {
    var scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        (global.requestAnimationFrame || setTimeout)(function () {
            scheduled = false;
            syncHeaderAccountLinks();
        });
    }
    // Observe the document itself (not <html>/<body>): bundled pages replace
    // the whole documentElement when they unpack.
    new MutationObserver(schedule).observe(document, { childList: true, subtree: true, characterData: true });
    // Another tab logging in/out changes localStorage — reflect it here too.
    global.addEventListener('storage', function (e) {
        if (e.key === TOKEN_KEY || e.key === USER_KEY) schedule();
    });
    schedule();
    refreshUser().then(schedule);
}

function linkTikTok(tiktokUsername) {
    return request('/api/auth/tiktok/link', { method: 'POST', body: { tiktokUsername: tiktokUsername } });
}

/** رابط موافقة تيك توك لربط الحساب (الجلسة بالهيدر، مو بالرابط). يرجع {success, url}. */
function tiktokLinkUrl() {
    return request('/api/auth/tiktok/oauth/url', { method: 'POST' });
}

function requestTikTokVerificationCode() {
    return request('/api/auth/tiktok/verification-code', { method: 'POST' });
}

function verifyTikTok(tiktokUsername) {
    return request('/api/auth/tiktok/verify', { method: 'POST', body: { tiktokUsername: tiktokUsername } });
}

/** Manual TikTok unlink (explicit user action only) — a verified link
 * never expires on its own, even if the user removes the code from
 * their TikTok bio afterward. */
function unlinkTikTok() {
    return request('/api/auth/tiktok/unlink', { method: 'POST' });
}

/** ربط حساب كيك: انتقال مباشر لخادمنا وهو يحوّل (302) لصفحة موافقة كيك —
 * نفس طريقة زر ربط تيك توك (profile.html). */
function startKickLink() {
    var token = getToken();
    if (!token) { window.location.href = 'login.html'; return; }
    window.location.href = API_BASE + '/api/auth/kick/oauth/start?token=' + encodeURIComponent(token);
}

function unlinkKick() {
    return request('/api/auth/kick/unlink', { method: 'POST' });
}

/** ربط حساب تويتش (موافقة الستريمر على قراءة الشات) — نفس طريقة كيك. */
function startTwitchLink() {
    var token = getToken();
    if (!token) { window.location.href = 'login.html'; return; }
    window.location.href = API_BASE + '/api/auth/twitch/oauth/start?token=' + encodeURIComponent(token);
}

function unlinkTwitch() {
    return request('/api/auth/twitch/unlink', { method: 'POST' });
}

/** Self-service account deletion — final, no undo. */
function deleteMyAccount() {
    return request('/api/profile/delete-account', { method: 'POST' });
}

function setCustomId(customId) {
    return request('/api/auth/custom-id', { method: 'POST', body: { customId: customId } });
}

/** Updates the session owner's display name (user id comes from the
 * server-side session, never sent here). */
function updateDisplayName(displayName) {
    return request('/api/profile/display-name', { method: 'POST', body: { displayName: displayName } });
}

/** Changes the login username (unique, 3–30 letters/digits/_/.). Updates
 * the cached user on success so other pages see the new name. */
function updateUsername(username) {
    return request('/api/profile/username', { method: 'POST', body: { username: username } })
        .then(function (result) {
            if (result && result.success) {
                var cached = getCachedUser();
                if (cached) { cached.username = result.username; setSession(getToken(), cached); }
            }
            return result;
        });
}

/** imageDataUrl is a ready Data URL (e.g. "data:image/png;base64,...").
 * Max ~85KB after encoding (MAX_AVATAR_BASE64_LENGTH in auth-service.js) —
 * resize/compress client-side before calling. */
function updateAvatarImage(imageDataUrl) {
    return request('/api/profile/avatar', { method: 'POST', body: { imageDataUrl: imageDataUrl } });
}

function adminListUsers() {
    return request('/api/admin/users', { method: 'GET' });
}

function adminSetPermission(userId, permissionKey, value) {
    return request('/api/admin/permissions', {
        method: 'POST',
        body: { userId: userId, permissionKey: permissionKey, value: Boolean(value) }
    });
}

/** Admin only — sets a user's public custom_id by internal userId,
 * unlike setCustomId above which always targets the current session. */
/** Admin: change any account's email (saved as unverified). */
function adminSetEmail(userId, email) {
    return request('/api/admin/email', { method: 'POST', body: { userId: userId, email: email } });
}

function adminSetCustomId(userId, customId) {
    return request('/api/admin/custom-id', {
        method: 'POST',
        body: { userId: userId, customId: customId }
    });
}

/** Admin only — permanently deletes an account. No undo. */
function adminDeleteUser(userId) {
    return request('/api/admin/users/delete', { method: 'POST', body: { userId: userId } });
}

/** Admin only — resets the single-device lock for an approved streamer. */
function adminResetDeviceLock(userId) {
    return request('/api/admin/reset-device-lock', { method: 'POST', body: { userId: userId } });
}

/** Admin only — allows a device-locked streamer one device change,
 * consumed automatically on their next login. */
function adminAllowDeviceChange(userId, allow) {
    return request('/api/admin/allow-device-change', { method: 'POST', body: { userId: userId, allow: allow } });
}

/** Public profile by custom_id — no login required. */
function getPublicProfile(customId) {
    return request('/api/profile?id=' + encodeURIComponent(customId), { method: 'GET' });
}

/** Admin only — find an account by internal id or profile id (custom_id).
 * @param {string} query
 * @param {'internal'|'profile'} idType */
function adminLookupUser(query, idType) {
    return request('/api/admin/users/lookup?q=' + encodeURIComponent(query) + '&type=' + encodeURIComponent(idType), { method: 'GET' });
}

/** Current active announcement, if any — no login required.
 * result.announcement is null when nothing is active. */
function getAnnouncement() {
    return request('/api/announcement', { method: 'GET' });
}

/** Admin only — publishes/updates the current announcement. imageFilename
 * is a filename already uploaded to the repo root, not an actual upload. */
function adminSetAnnouncement(text, imageFilename) {
    return request('/api/admin/announcement', {
        method: 'POST',
        body: { text: text, imageFilename: imageFilename || '', active: true }
    });
}

/** Admin only — clears the current announcement immediately. */
function adminClearAnnouncement() {
    return request('/api/admin/announcement', { method: 'POST', body: { active: false } });
}

/* Collectibles (frames + entrances) and points — see
 * backend/collectibles/collectibles-service.js and backend/points/points-service.js */

function adminGetCollectiblesCatalog() {
    return request('/api/admin/collectibles/catalog', { method: 'GET' });
}

function adminUpdateCatalogEntry(slug, fields) {
    return request('/api/admin/collectibles/catalog', {
        method: 'POST',
        body: Object.assign({ slug: slug }, fields)
    });
}

function adminCreateCustomFrame(imageFilename, displayNameAr) {
    return request('/api/admin/collectibles/custom-frame', {
        method: 'POST',
        body: { imageFilename: imageFilename, displayNameAr: displayNameAr }
    });
}

/**
 * @param {number} userId
 * @param {'catalog'|'custom'} frameType
 * @param {string} frameRef
 * @param {{entranceTemplate?: string, entranceText?: string}} [opts]
 */
function adminGrantFrame(userId, frameType, frameRef, opts) {
    opts = opts || {};
    return request('/api/admin/collectibles/grant', {
        method: 'POST',
        body: { userId: userId, frameType: frameType, frameRef: frameRef, entranceTemplate: opts.entranceTemplate, entranceText: opts.entranceText }
    });
}

function adminRevokeFrame(userId, frameType, frameRef) {
    return request('/api/admin/collectibles/revoke', {
        method: 'POST',
        body: { userId: userId, frameType: frameType, frameRef: frameRef }
    });
}

function adminSetEntrance(userId, templateKey, entranceText) {
    return request('/api/admin/entrance', {
        method: 'POST',
        body: { userId: userId, templateKey: templateKey, entranceText: entranceText }
    });
}

function adminClearEntrance(userId) {
    return request('/api/admin/entrance', { method: 'POST', body: { userId: userId, clear: true } });
}

/** After redeemFrameCode returns kind 'choice': claims the chosen frame.
 * result.error: invalid_code | code_burned | code_full | already_redeemed | invalid_frame */
function redeemChoiceCode(code, frameType, frameRef) {
    return request('/api/collectibles/redeem-choice', { method: 'POST', body: { code: code, frameType: frameType, frameRef: frameRef } });
}

/** Admin only — one multi-use "choose your frame" code. excluded: ["catalog:<slug>", "custom:<id>"] */
function adminGenerateChoiceCode(maxUses, excluded, note) {
    return request('/api/admin/choice-codes/generate', { method: 'POST', body: { maxUses: maxUses, excluded: excluded || [], note: note || '' } });
}

/** Admin only — list "choose your frame" codes with their usage. */
function adminListChoiceCodes() {
    return request('/api/admin/choice-codes', { method: 'GET' });
}
/** Admin only — frames permanently excluded from every choice code: ["catalog:<slug>"|"custom:<id>"] */
function adminGetChoiceExcluded() {
    return request('/api/admin/choice-codes/excluded', { method: 'GET' });
}
function adminSetChoiceExcluded(frames) {
    return request('/api/admin/choice-codes/excluded', { method: 'POST', body: { frames: frames || [] } });
}
/** جائزة فوز مباريات البثين: {enabled, maxUses, frames:["catalog:<slug>"|"custom:<id>"]} */
function adminGetWinReward() {
    return request('/api/admin/win-reward', { method: 'GET' });
}
function adminSetWinReward(config) {
    return request('/api/admin/win-reward', { method: 'POST', body: config || {} });
}
/** أكواد جوائز الفوز للستريمر الحالي (بروفايله). */
function getWinRewardCodes() {
    return request('/api/collectibles/win-codes', { method: 'GET' });
}

/* «فريقك» (backend/teams/team-service.js) + منح أكواد جوائز الفوز لأعضاء الفريق. */
function teamSearch(query) {
    return request('/api/teams/search?q=' + encodeURIComponent(query || ''), { method: 'GET' });
}
function teamMine() {
    return request('/api/teams/mine', { method: 'GET' });
}
function teamJoin(customId) {
    return request('/api/teams/join', { method: 'POST', body: { customId: customId } });
}
function teamLeave(customId) {
    return request('/api/teams/leave', { method: 'POST', body: { customId: customId } });
}
function teamRemove(customId) {
    return request('/api/teams/remove', { method: 'POST', body: { customId: customId } });
}

/* «مجتمعي»: شات الفريق والإشراف + الأصدقاء والرسائل الخاصة (backend/community/). */
function q(v) { return encodeURIComponent(v == null ? '' : String(v)); }
function communitySummary() { return request('/api/community/summary', { method: 'GET' }); }
function communityTeams() { return request('/api/community/teams', { method: 'GET' }); }
/** team = ID صاحب الفريق، after = آخر رسالة عندي، since = `now` من آخر رد (للمحذوف). */
function teamChat(team, after, since) {
    return request('/api/community/team-chat?team=' + q(team) + '&after=' + q(after || 0) + '&since=' + q(since || 0), { method: 'GET' });
}
function teamChatSend(team, body) { return request('/api/community/team-chat/send', { method: 'POST', body: { team: team, body: body } }); }
function teamChatDelete(team, id) { return request('/api/community/team-chat/delete', { method: 'POST', body: { team: team, id: id } }); }
/** minutes: 10 | 60 | 1440 | 0 (دائم) */
function teamChatMute(team, customId, minutes) { return request('/api/community/team-chat/mute', { method: 'POST', body: { team: team, customId: customId, minutes: minutes } }); }
function teamChatUnmute(team, customId) { return request('/api/community/team-chat/unmute', { method: 'POST', body: { team: team, customId: customId } }); }
function teamChatKick(team, customId) { return request('/api/community/team-chat/kick', { method: 'POST', body: { team: team, customId: customId } }); }
function teamChatMembers(team) { return request('/api/community/team-chat/members?team=' + q(team), { method: 'GET' }); }
/** صاحب الفريق: on = true يضيف مشرف، false يشيله. */
function setTeamModerator(customId, on) { return request('/api/community/moderators', { method: 'POST', body: { customId: customId, on: !!on } }); }
function friendsList() { return request('/api/friends', { method: 'GET' }); }
function friendsSearch(text) { return request('/api/friends/search?q=' + q(text), { method: 'GET' }); }
/** action: request | accept | decline | cancel | remove | block | unblock */
function friendAction(action, customId) { return request('/api/friends/' + action, { method: 'POST', body: { customId: customId } }); }
function friendChat(customId, after) { return request('/api/friends/chat?user=' + q(customId) + '&after=' + q(after || 0), { method: 'GET' }); }
function friendChatSend(customId, body) { return request('/api/friends/chat/send', { method: 'POST', body: { customId: customId, body: body } }); }
function grantWinCode(code, customId) {
    return request('/api/collectibles/win-codes/grant', { method: 'POST', body: { code: code, customId: customId } });
}
function getMyGrants() {
    return request('/api/collectibles/grants', { method: 'GET' });
}

/* اشتراك الستريمر (backend/subscriptions/subscription-service.js). */
function getSubscription() {
    return request('/api/subscription', { method: 'GET' });
}
/** mode: 'extend' (تمديد) | 'renew' (تجديد — دورة جديدة) — يُتجاهل لو ما فيه اشتراك فعّال. */
function redeemSubscriptionCode(code, mode) {
    return request('/api/subscription/redeem', { method: 'POST', body: { code: code, mode: mode || null } });
}
/** يوم التجربة المجاني — مرة وحدة لكل حساب ولكل حساب تيك توك (backend: startTrial). */
function startSubscriptionTrial() {
    return request('/api/subscription/trial', { method: 'POST' });
}
function pauseSubscription() {
    return request('/api/subscription/pause', { method: 'POST', body: {} });
}
function resumeSubscription() {
    return request('/api/subscription/resume', { method: 'POST', body: {} });
}
/** Admin only. months: أشهر باقة فعّالة (subscription_plans). */
function adminGenerateSubscriptionCodes(months, count, note) {
    return request('/api/admin/subscription-codes/generate', { method: 'POST', body: { months: months, count: count, note: note || '' } });
}
function adminListSubscriptionCodes() {
    return request('/api/admin/subscription-codes', { method: 'GET' });
}
function adminBurnSubscriptionCode(code) {
    return request('/api/admin/subscription-codes/burn', { method: 'POST', body: { code: code } });
}
/** Admin only: المشتركين + كل الباقات. */
function adminListSubscribers() {
    return request('/api/admin/subscriptions', { method: 'GET' });
}
/** Admin only: days موجب = إضافة، سالب = خصم. */
function adminAdjustSubscription(userId, days) {
    return request('/api/admin/subscriptions/adjust', { method: 'POST', body: { userId: userId, days: days } });
}
function adminEndSubscription(userId) {
    return request('/api/admin/subscriptions/end', { method: 'POST', body: { userId: userId } });
}
function adminUnpauseSubscription(userId) {
    return request('/api/admin/subscriptions/unpause', { method: 'POST', body: { userId: userId } });
}
/** Admin only: منح أيام لأي مستخدم (حتى بدون اشتراك). */
function adminGrantSubscription(userId, days) {
    return request('/api/admin/subscriptions/grant', { method: 'POST', body: { userId: userId, days: days } });
}
/** Admin only: اشتراك مفتوح بدون مدة — on=false يلغيه وترجع الأيام المجمّدة. */
function adminSetOpenSubscription(userId, on) {
    return request('/api/admin/subscriptions/open', { method: 'POST', body: { userId: userId, on: on !== false } });
}
/** Admin only: تعويض كل المشتركين بأيام (انقطاع). */
function adminCompensateSubscriptions(days, note) {
    return request('/api/admin/subscriptions/compensate', { method: 'POST', body: { days: days, note: note || '' } });
}
/** Admin only: plan = {months, name, pauses, active} — إضافة أو تعديل. */
function adminSaveSubscriptionPlan(plan) {
    return request('/api/admin/subscription-plans', { method: 'POST', body: plan || {} });
}

/* Stream challenge (two streams play one game) — backend/challenge/. */
function challengeSearch(query) {
    return request('/api/challenge/search?q=' + encodeURIComponent(query || ''), { method: 'GET' });
}
/** have: invite ids whose avatar the page already has (comma-separated). */
function challengeInbox(have) {
    return request('/api/challenge/inbox' + (have ? '?have=' + encodeURIComponent(have) : ''), { method: 'GET' });
}
function challengeInvite(toCustomId, game, settings) {
    return request('/api/challenge/invite', { method: 'POST', body: { toCustomId: toCustomId, game: game, settings: settings || {} } });
}
/** settings (on accept): {team2, cats:[3 category ids]} */
function challengeRespond(inviteId, accept, settings) {
    return request('/api/challenge/respond', { method: 'POST', body: { inviteId: inviteId, accept: Boolean(accept), settings: settings || {} } });
}
function challengeCancel(inviteId) {
    return request('/api/challenge/cancel', { method: 'POST', body: { inviteId: inviteId } });
}
/** twoStep games: the opponent saves settings and marks ready (ready=false = back to editing). */
/** حضور الستريمر: where = 'library' أو اسم لعبة بثين (ينتظر خصم، مع إعداداته)، أو '' = طلع. */
function challengePresence(where, settings, keepalive) {
    return request('/api/challenge/presence', { method: 'POST', body: { where: where || '', settings: settings || {} }, keepalive: Boolean(keepalive) });
}
/** البثوث المتاحة: {waiting:[{customId,name,tiktok,game,gameName,settings}], idle:[{customId,name,tiktok}]} */
function challengeLobby() {
    return request('/api/challenge/lobby', { method: 'GET' });
}
/** «دخول مباشر» لمباراة ستريمر ينتظر → {success, inviteId, game} (تبدأ بخطوة التجهيز) */
function challengeJoin(customId, game) {
    return request('/api/challenge/join', { method: 'POST', body: { customId: customId, game: game } });
}
function challengeReady(inviteId, ready, settings) {
    return request('/api/challenge/ready', { method: 'POST', body: { inviteId: inviteId, ready: Boolean(ready), settings: settings || {} } });
}
/** twoStep games: the host enters the lobby once the opponent is ready → {success, matchId, game} */
function challengeStart(inviteId) {
    return request('/api/challenge/start', { method: 'POST', body: { inviteId: inviteId } });
}

/** Owner equips one of their owned frames (own profile page only). */
function equipFrame(frameType, frameRef) {
    return request('/api/collectibles/equip', { method: 'POST', body: { frameType: frameType, frameRef: frameRef } });
}

/** Owner redeems a purchased code (e.g. "AGP-7K3M-Q9XD") — a frame, an
 * elimination card, a win card or a bundle. result.kind: frame | elim | win |
 * bundle (result.frame / result.card / result.bundle + result.granted +
 * result.alreadyOwned). result.error: invalid_code | code_used | code_burned |
 * already_owned | rate_limited */
function redeemFrameCode(code) {
    return request('/api/collectibles/redeem', { method: 'POST', body: { code: code } });
}

/** Admin only — generates `count` one-time codes for a single frame. */
function adminGenerateFrameCodes(frameType, frameRef, count, note) {
    return request('/api/admin/frame-codes/generate', {
        method: 'POST',
        body: { frameType: frameType, frameRef: frameRef, count: count, note: note || '' }
    });
}

/** Admin only — generates `count` one-time codes for an elimination
 * (kind 'elim') or win (kind 'win') card. */
function adminGenerateCardCodes(kind, cardKey, count, note) {
    return request('/api/admin/card-codes/generate', {
        method: 'POST',
        body: { kind: kind, cardKey: cardKey, count: count, note: note || '' }
    });
}

/** Admin only — bundles (several items granted by one code). */
function adminListBundles() {
    return request('/api/admin/bundles', { method: 'GET' });
}
/** items: [{kind:'frame',frameType,frameRef} | {kind:'elim'|'win',cardKey}] (2+). */
function adminCreateBundle(name, items) {
    return request('/api/admin/bundles', { method: 'POST', body: { name: name, items: items } });
}
function adminGenerateBundleCodes(bundleId, count, note) {
    return request('/api/admin/bundle-codes/generate', {
        method: 'POST',
        body: { bundleId: bundleId, count: count, note: note || '' }
    });
}
/** Admin only — burns (cancels) an unused code of any kind, e.g. after a refund.
 * result.error: invalid_code | code_used | already_burned */
function adminBurnCode(code) {
    return request('/api/admin/codes/burn', { method: 'POST', body: { code: code } });
}

/** Admin only — latest codes (frames, cards and bundles) with redemption status. */
function adminListFrameCodes() {
    return request('/api/admin/frame-codes', { method: 'GET' });
}

/** Owner toggles their entrance on/off without deleting it (template/text
 * stay saved for one-click re-enable). */
/** Owner picks one of their owned entrances (nitro/royal/princess/storm/notes). */
function equipEntrance(key) {
    return request('/api/entrance/equip', { method: 'POST', body: { key: key } });
}
/** Owner edits their entrance text and/or colour preset. settings: {text?, color?} */
function updateEntranceSettings(settings) {
    return request('/api/entrance/settings', { method: 'POST', body: settings || {} });
}
/** Admin only — grant (or revoke with revoke:true) one entrance to a user. */
function adminGrantEntrance(userId, key, revoke) {
    return request('/api/admin/entrance/grant', { method: 'POST', body: { userId: userId, key: key, revoke: Boolean(revoke) } });
}
/** Admin only — a user's entrances: {catalog, owned, active}. */
function adminGetUserEntrances(userId) {
    return request('/api/admin/entrances?userId=' + encodeURIComponent(userId || ''), { method: 'GET' });
}
function toggleEntrance(enabled) {
    return request('/api/entrance/toggle', { method: 'POST', body: { enabled: Boolean(enabled) } });
}

/** Admin only — adds an elimination card to a user's collection (a user can
 * own several). cardKey from adminGetCollectiblesCatalog().elimCards. */
function adminGrantElimCard(userId, cardKey) {
    return request('/api/admin/elim-card', { method: 'POST', body: { userId: userId, cardKey: cardKey } });
}

function adminRevokeElimCard(userId, cardKey) {
    return request('/api/admin/elim-card', { method: 'POST', body: { userId: userId, cardKey: cardKey, revoke: true } });
}

/** Owner activates one of their elimination cards (deactivating the rest),
 * or turns it off, without losing it. */
function toggleElimCard(cardKey, enabled) {
    return request('/api/elim-card/toggle', { method: 'POST', body: { cardKey: cardKey, enabled: Boolean(enabled) } });
}

/** Admin only — adds a win card to a user's collection (a user can own
 * several). cardKey from adminGetCollectiblesCatalog().winCards. */
function adminGrantWinCard(userId, cardKey) {
    return request('/api/admin/win-card', { method: 'POST', body: { userId: userId, cardKey: cardKey } });
}

function adminRevokeWinCard(userId, cardKey) {
    return request('/api/admin/win-card', { method: 'POST', body: { userId: userId, cardKey: cardKey, revoke: true } });
}

/** Owner activates one of their win cards (deactivating the rest), or turns
 * it off, without losing it. */
function toggleWinCard(cardKey, enabled) {
    return request('/api/win-card/toggle', { method: 'POST', body: { cardKey: cardKey, enabled: Boolean(enabled) } });
}

/** شخصية الأنمي بالألعاب: 'girl' أو 'boy'، أو null = شكل عشوائي (docs/CHARACTERS.md). */
function setCharacter(kind) {
    return request('/api/character/set', { method: 'POST', body: { kind: kind || null } });
}

/** Called on round/match end. participants: [{tiktokUsername, won}].
 * options.teamGame: true for two-team games (smaller per-player win bonus,
 * see backend/points/points-service.js). */
function reportRoundCompletion(participants, durationMs, options) {
    return request('/api/points/round-complete', {
        method: 'POST',
        body: { participants: participants, durationMs: durationMs, teamGame: Boolean(options && options.teamGame) }
    });
}

/* TikTok username of an AGP player: ids from the TikTok adapter are
 * "tiktok:<username>"; anything else falls back to the player's name. */
function tiktokUsernameForPlayer(player) {
    var id = (player && player.id) || '';
    if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
    // لاعب من بث كيك/تويتش ("kick:<username>"/"twitch:<login>") — النقاط مربوطة بتيك توك فقط،
    // وما نرجع للاسم عشان ما تنحسب لحساب تيك توك بنفس الاسم بالغلط.
    if (id.indexOf('kick:') === 0 || id.indexOf('twitch:') === 0) return '';
    return (player && (player.name || player.id)) || '';
}

/**
 * Unified entry point to the platform points system — every game (current
 * and future) reports its match end through this. See CLAUDE.md.
 * opts.players: every player who took part ({id, name}).
 * opts.winnerIds: ids of the winning player(s) — or, in a team game, every
 *   player on the winning team.
 * opts.teamGame: true for two-team games.
 * opts.durationMs: actual match duration.
 * Resolves to the backend result, or null (nobody to report / request failed)
 * — never rejects, so it can't block the game's winner screen.
 */
function reportMatchPoints(opts) {
    opts = opts || {};
    var winners = {};
    (opts.winnerIds || []).forEach(function (id) { winners[id] = true; });
    var participants = (opts.players || []).map(function (p) {
        return { tiktokUsername: tiktokUsernameForPlayer(p), won: Boolean(p && winners[p.id]) };
    }).filter(function (p) { return p.tiktokUsername; });
    if (!participants.length) return Promise.resolve(null);
    return reportRoundCompletion(participants, opts.durationMs || 0, { teamGame: Boolean(opts.teamGame) })
        .catch(function () { return null; });
}

/* Streamer level (SP) — see backend/points/streamer-level-service.js */

function getStreamerLevels() {
    return request('/api/streamer-levels', { method: 'GET' });
}

/** Admin only — edits an existing SP level's threshold/name. */
function adminUpdateStreamerLevel(slug, fields) {
    return request('/api/admin/streamer-levels', {
        method: 'POST',
        body: Object.assign({ slug: slug }, fields)
    });
}

/* Admin only — manual streamer hours (compensate/deduct), see
 * backend/points/streamer-hours.js. hours < 0 = deduction. */
function adminListHoursAdjustments(userId) {
    return request('/api/admin/streamer-hours/adjustments' + (userId ? '?userId=' + encodeURIComponent(userId) : ''), { method: 'GET' });
}

function adminAdjustStreamerHours(userId, hours, effectiveAt, reason) {
    return request('/api/admin/streamer-hours/adjust', {
        method: 'POST',
        body: { userId: userId, hours: hours, effectiveAt: effectiveAt, reason: reason || '' }
    });
}

function adminDeleteHoursAdjustment(id) {
    return request('/api/admin/streamer-hours/adjustments/delete', { method: 'POST', body: { id: id } });
}

/** Only admin accounts can access the streamer dashboard (dashboard-core);
 * every other account is redirected to its public profile instead. */
function canAccessDashboard(user) {
    return Boolean(user && user.role === 'admin');
}

/** Streamer account = chose "streamer" at signup (is_streamer), or a
 * player the admin converted (can_run_games). */
function isStreamerAccount(user) {
    if (!user) return false;
    return user.role === 'admin' || Boolean(user.is_streamer) ||
        Boolean(user.permissions && user.permissions.can_run_games);
}

/** اشتراك الستريمر: subscription_access يجي من /api/auth/me (refreshUser).
 * false = اشتراك منتهي بعد بدء القفل. غير موجود (جلسة قديمة) = مسموح لين
 * يتحدّث من الخادم — القفل الفعلي بالخادم عند ربط البث. */
function hasSubscriptionAccess(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.subscription_access !== false;
}

/** Playing needs a streamer account with a verified TikTok account and an
 * active subscription — no admin approval step (admins always can). The
 * server enforces the same rule when connecting to a stream
 * (backend/websocket/ws-server.js). */
function canPlayGames(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    // «غرفة الجوالات» (اللعب بدون بث — phone-room.html): صلاحية يمنحها الأدمن
    // بنفسه لكل حساب، فتفتح الألعاب بدون شرط ستريمر/ربط/اشتراك. الاتصال ببث
    // حقيقي يبقى بنفس شروطه بالخادم (ws-server.js checkStreamConnectAllowed).
    if (user.permissions && user.permissions.phone_rooms) return true;
    if (!hasSubscriptionAccess(user)) return false;
    // Admin-granted full access: every game on any stream, no streamer
    // account or TikTok link needed (see admin.html → منح الصلاحيات).
    if (user.permissions && user.permissions.full_game_access) return true;
    // ستريمر مربوط بتيك توك أو كيك أو تويتش (backend/auth/*-oauth-service.js) —
    // الخادم يتأكد عند الاتصال إن البث هو حسابه المربوط على نفس المنصة.
    return isStreamerAccount(user) && Boolean(user.tiktok_verified || user.kick_verified || user.twitch_verified);
}

/** True for an approved streamer (same condition as canPlayGames, excluding
 * admin) who hasn't finished the new-streamer welcome flow yet. */
function needsWelcome(user) {
    if (!user || user.role === 'admin') return false;
    return Boolean(user.permissions && user.permissions.can_run_games) && !user.welcome_completed;
}

function completeWelcome() {
    return request('/api/auth/welcome/complete', { method: 'POST' });
}

/** Admin only — resets a user's welcome flag so it shows again next visit. */
function adminResetWelcome(userId) {
    return request('/api/admin/welcome/reset', { method: 'POST', body: { userId: userId } });
}

/* Platform supporters — see backend/supporters/supporters-service.js */

function getRecentSupporters(limit) {
    var path = '/api/supporters/recent';
    if (limit) path += '?limit=' + encodeURIComponent(limit);
    return request(path, { method: 'GET' });
}

/** تصنيف «الأسبوع الماضي» المحفوظ: توب الاستريمرز بالساعات واللاعبين بالفوز
 * للأسبوع اللي خلص (backend/stats/last-week-ranking-service.js). */
function getLastWeekRanking() {
    return request('/api/public/last-week-ranking', { method: 'GET' });
}

/** Top streamers by total stream hours. Returns TikTok username + hours
 * only, no sensitive account data. */
function getTopStreamers(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-streamers' + qs, { method: 'GET' });
}

/** A user's position in every weekly ranking ({players:{wins,hours,rounds},
 * streamers:{hours,participations}}, each {rank, value} or null). */
function getUserWeeklyRanks(customId) {
    return request('/api/public/user-ranks?id=' + encodeURIComponent(customId || ''), { method: 'GET' });
}

/** Top streamers by total game participations this week (every participant
 * in every match they ran; resets every Saturday). */
function getTopStreamersByParticipations(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-streamers-participations' + qs, { method: 'GET' });
}

function getTopPlayersByWins(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-players-wins' + qs, { method: 'GET' });
}

/** Top players by actual play time this week (resets every Saturday,
 * same as top streamers). */
function getTopPlayersByHours(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-players-hours' + qs, { method: 'GET' });
}

/** Top players by completed rounds this week. */
function getTopPlayersByRounds(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-players-rounds' + qs, { method: 'GET' });
}

function getAdminStreamerStats() {
    return request('/api/admin/stats/streamers', { method: 'GET' });
}

function getAdminUserStats() {
    return request('/api/admin/stats/users', { method: 'GET' });
}

/** Admin only — streams connected right now from inside games + live challenge matches. */
function getAdminLiveStreams() {
    return request('/api/admin/live-streams', { method: 'GET' });
}

function getTopSupporters() {
    return request('/api/supporters/top', { method: 'GET' });
}

function adminListSupporters() {
    return request('/api/admin/supporters', { method: 'GET' });
}

/** Admin only — manually adds a support entry (no automatic linking yet). */
function adminAddSupporter(name, message, amount, customId) {
    return request('/api/admin/supporters', { method: 'POST', body: { name: name, message: message, amount: amount, customId: customId } });
}

/** Live preview (name+avatar) of an account by custom_id, used before
 * confirming a support-row link. */
function adminFindSupporterUser(customId) {
    return request('/api/admin/supporters/find-user?customId=' + encodeURIComponent(customId || ''), { method: 'GET' });
}

function adminDeleteSupporter(id) {
    return request('/api/admin/supporters/delete', { method: 'POST', body: { id: id } });
}

/* Creative partners — see backend/partners/partners-service.js */

function getPartners() {
    return request('/api/partners', { method: 'GET' });
}

function adminListPartners() {
    return request('/api/admin/partners', { method: 'GET' });
}

/** category: 'idea' or 'dev'. */
function adminAddPartner(customId, category) {
    return request('/api/admin/partners', { method: 'POST', body: { customId: customId, category: category } });
}

function adminDeletePartner(id) {
    return request('/api/admin/partners/delete', { method: 'POST', body: { id: id } });
}

/* Event theme — see backend/theme/site-theme-service.js */

/** result.theme is null when no theme is active. */
function getSiteTheme() {
    return request('/api/theme', { method: 'GET' });
}

function adminSetSiteTheme(presetKey, accent, accent2, accentPink) {
    return request('/api/admin/theme', {
        method: 'POST',
        body: { presetKey: presetKey, accent: accent, accent2: accent2, accentPink: accentPink }
    });
}

function adminClearSiteTheme() {
    return request('/api/admin/theme/clear', { method: 'POST' });
}

/** أرقام حقيقية لقسم "الأرقام" بالصفحة الرئيسية — عام، بلا تسجيل دخول. */
function getPlatformStats() {
    return request('/api/public/platform-stats', { method: 'GET' });
}

/**
 * مسودة بنك أسئلة "خلية الحروف" المشتركة (backend/letters-cell/
 * letters-cell-questions-service.js) — أي أدمن أو مستخدم عنده صلاحية
 * can_manage_letters_cell يقرأها/يكتبها. result.draft يكون null لو ما
 * فيه أي حفظ سابق بعد (أول استخدام قبل أي تعديل).
 */
function getLettersCellQuestionsDraft() {
    return request('/api/letters-cell/questions-draft', { method: 'GET' });
}

/** @param {Object} questions - { letter: [{id, question, answer, aliases}] } */
function saveLettersCellQuestionsDraft(questions) {
    return request('/api/letters-cell/questions-draft', { method: 'POST', body: { questions: questions } });
}

/* Support tickets — map 1:1 to /api/support/* and /api/admin/support/*
 * (backend/support/support-service.js). The file upload itself goes
 * straight from the browser to Cloudinary; the server only signs it. */

function supportGetUploadSignature(fileName, fileSize) {
    return request('/api/support/upload-signature', { method: 'POST', body: { fileName: fileName, fileSize: fileSize } });
}

function supportCreateTicket(type, title, body, attachments) {
    return request('/api/support/tickets', { method: 'POST', body: { type: type, title: title, body: body, attachments: attachments || [] } });
}

function supportListTickets() {
    return request('/api/support/tickets');
}

/** Number of the user's tickets with an admin reply they haven't opened yet. */
function supportUnreadCount() {
    return request('/api/support/unread-count');
}

function supportGetTicket(id) {
    return request('/api/support/ticket?id=' + encodeURIComponent(id));
}

function supportReply(ticketId, body, attachments) {
    return request('/api/support/ticket/reply', { method: 'POST', body: { ticketId: ticketId, body: body, attachments: attachments || [] } });
}

/** filters: {type, status, q, limit, offset} — empty values are omitted. */
function adminSupportListTickets(filters) {
    var qs = Object.keys(filters || {}).filter(function (k) {
        return filters[k] !== undefined && filters[k] !== null && filters[k] !== '';
    }).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(filters[k]);
    }).join('&');
    return request('/api/admin/support/tickets' + (qs ? '?' + qs : ''));
}

function adminSupportGetTicket(id) {
    return request('/api/admin/support/ticket?id=' + encodeURIComponent(id));
}

function adminSupportReply(ticketId, body) {
    return request('/api/admin/support/ticket/reply', { method: 'POST', body: { ticketId: ticketId, body: body } });
}

function adminSupportSetStatus(ticketId, status) {
    return request('/api/admin/support/ticket/status', { method: 'POST', body: { ticketId: ticketId, status: status } });
}

/* Page guards — called as the first line of any protected page */

/** Confirms a session is actually valid (calls /api/auth/me, not just
 * checking a local token exists). Clears and redirects to login only when
 * the server rejects the token (401). Any other failure (server waking up
 * from sleep, 5xx, no connection) keeps the session and falls back to the
 * cached user — otherwise a temporary server outage logs everyone out. */
function requireAuth(redirectTo) {
    if (!getToken()) {
        global.location.href = redirectTo || 'login.html';
        return Promise.resolve(null);
    }
    function fallbackToCachedUser() {
        var cached = getCachedUser();
        if (cached && cached.id) return cached;
        global.location.href = redirectTo || 'login.html';
        return null;
    }
    return me().then(function (result) {
        if (result.success) {
            setSession(getToken(), result.user);
            return result.user;
        }
        if (result.__httpStatus === 401) {
            clearSession();
            global.location.href = redirectTo || 'login.html';
            return null;
        }
        return fallbackToCachedUser();
    }, fallbackToCachedUser);
}

/**
 * Like requireAuth, but also rejects any logged-in user whose role isn't
 * 'admin', sending them to `nonAdminRedirectTo` (their own dashboard by
 * default) instead of the login page — avoids a redirect loop where the
 * login page would just detect the valid session and bounce them back.
 */
function requireAdmin(redirectTo, nonAdminRedirectTo) {
    return requireAuth(redirectTo).then(function (user) {
        if (user && user.role !== 'admin') {
            global.location.href = nonAdminRedirectTo || 'dashboard-core/index.html';
            return null;
        }
        return user;
    });
}

global.AGPAuth = {
    API_BASE: API_BASE,
    // طلب عام لأي مسار API (يرفق Token الجلسة تلقائياً) — يستخدمه المتجر (store/store-common.js).
    request: request,
    getToken: getToken,
    getCachedUser: getCachedUser,
    clearSession: clearSession,
    signup: signup,
    login: login,
    loginWithGoogle: loginWithGoogle,
    tiktokLoginUrl: tiktokLoginUrl,
    completeTikTokLogin: completeTikTokLogin,
    forgotPassword: forgotPassword,
    resetPasswordWithCode: resetPasswordWithCode,
    resetPasswordWithIdentifier: resetPasswordWithIdentifier,
    sendSignupCode: sendSignupCode,
    recoverAccount: recoverAccount,
    sendEmailVerification: sendEmailVerification,
    verifyEmail: verifyEmail,
    logout: logout,
    me: me,
    refreshUser: refreshUser,
    syncHeaderAccountLinks: syncHeaderAccountLinks,
    keepHeaderAccountLinkSynced: keepHeaderAccountLinkSynced,
    linkTikTok: linkTikTok,
    tiktokLinkUrl: tiktokLinkUrl,
    requestTikTokVerificationCode: requestTikTokVerificationCode,
    verifyTikTok: verifyTikTok,
    unlinkTikTok: unlinkTikTok,
    startKickLink: startKickLink,
    unlinkKick: unlinkKick,
    startTwitchLink: startTwitchLink,
    unlinkTwitch: unlinkTwitch,
    deleteMyAccount: deleteMyAccount,
    setCustomId: setCustomId,
    updateDisplayName: updateDisplayName,
    updateUsername: updateUsername,
    updateAvatarImage: updateAvatarImage,
    getDeviceId: getDeviceId,
    chooseAccountType: chooseAccountType,
    needsAccountTypeChoice: needsAccountTypeChoice,
    adminListUsers: adminListUsers,
    adminSetPermission: adminSetPermission,
    adminSetCustomId: adminSetCustomId,
    adminSetEmail: adminSetEmail,
    adminDeleteUser: adminDeleteUser,
    adminResetDeviceLock: adminResetDeviceLock,
    adminAllowDeviceChange: adminAllowDeviceChange,
    getPublicProfile: getPublicProfile,
    adminLookupUser: adminLookupUser,
    getAnnouncement: getAnnouncement,
    adminSetAnnouncement: adminSetAnnouncement,
    adminClearAnnouncement: adminClearAnnouncement,
    adminGetCollectiblesCatalog: adminGetCollectiblesCatalog,
    adminUpdateCatalogEntry: adminUpdateCatalogEntry,
    adminCreateCustomFrame: adminCreateCustomFrame,
    adminGrantFrame: adminGrantFrame,
    adminRevokeFrame: adminRevokeFrame,
    adminSetEntrance: adminSetEntrance,
    adminClearEntrance: adminClearEntrance,
    equipFrame: equipFrame,
    challengeSearch: challengeSearch,
    challengeInbox: challengeInbox,
    challengePresence: challengePresence,
    challengeLobby: challengeLobby,
    challengeJoin: challengeJoin,
    challengeInvite: challengeInvite,
    challengeRespond: challengeRespond,
    challengeCancel: challengeCancel,
    challengeReady: challengeReady,
    challengeStart: challengeStart,
    redeemChoiceCode: redeemChoiceCode,
    adminGenerateChoiceCode: adminGenerateChoiceCode,
    adminListChoiceCodes: adminListChoiceCodes,
    adminGetChoiceExcluded: adminGetChoiceExcluded,
    adminSetChoiceExcluded: adminSetChoiceExcluded,
    adminGetWinReward: adminGetWinReward,
    adminSetWinReward: adminSetWinReward,
    getWinRewardCodes: getWinRewardCodes,
    teamSearch: teamSearch,
    teamMine: teamMine,
    teamJoin: teamJoin,
    teamLeave: teamLeave,
    teamRemove: teamRemove,
    communitySummary: communitySummary,
    communityTeams: communityTeams,
    teamChat: teamChat,
    teamChatSend: teamChatSend,
    teamChatDelete: teamChatDelete,
    teamChatMute: teamChatMute,
    teamChatUnmute: teamChatUnmute,
    teamChatKick: teamChatKick,
    teamChatMembers: teamChatMembers,
    setTeamModerator: setTeamModerator,
    friendsList: friendsList,
    friendsSearch: friendsSearch,
    friendAction: friendAction,
    friendChat: friendChat,
    friendChatSend: friendChatSend,
    grantWinCode: grantWinCode,
    getMyGrants: getMyGrants,
    getSubscription: getSubscription,
    redeemSubscriptionCode: redeemSubscriptionCode,
    pauseSubscription: pauseSubscription,
    resumeSubscription: resumeSubscription,
    adminGenerateSubscriptionCodes: adminGenerateSubscriptionCodes,
    adminListSubscriptionCodes: adminListSubscriptionCodes,
    adminBurnSubscriptionCode: adminBurnSubscriptionCode,
    adminListSubscribers: adminListSubscribers,
    adminAdjustSubscription: adminAdjustSubscription,
    adminEndSubscription: adminEndSubscription,
    adminUnpauseSubscription: adminUnpauseSubscription,
    adminGrantSubscription: adminGrantSubscription,
    startSubscriptionTrial: startSubscriptionTrial,
    adminSetOpenSubscription: adminSetOpenSubscription,
    adminCompensateSubscriptions: adminCompensateSubscriptions,
    hasSubscriptionAccess: hasSubscriptionAccess,
    adminSaveSubscriptionPlan: adminSaveSubscriptionPlan,
    redeemFrameCode: redeemFrameCode,
    adminGenerateFrameCodes: adminGenerateFrameCodes,
    adminGenerateCardCodes: adminGenerateCardCodes,
    adminListBundles: adminListBundles,
    adminCreateBundle: adminCreateBundle,
    adminGenerateBundleCodes: adminGenerateBundleCodes,
    adminBurnCode: adminBurnCode,
    adminListFrameCodes: adminListFrameCodes,
    toggleEntrance: toggleEntrance,
    equipEntrance: equipEntrance,
    updateEntranceSettings: updateEntranceSettings,
    adminGrantEntrance: adminGrantEntrance,
    adminGetUserEntrances: adminGetUserEntrances,
    adminGrantElimCard: adminGrantElimCard,
    adminRevokeElimCard: adminRevokeElimCard,
    toggleElimCard: toggleElimCard,
    adminGrantWinCard: adminGrantWinCard,
    adminRevokeWinCard: adminRevokeWinCard,
    toggleWinCard: toggleWinCard,
    setCharacter: setCharacter,
    reportRoundCompletion: reportRoundCompletion,
    reportMatchPoints: reportMatchPoints,
    getStreamerLevels: getStreamerLevels,
    adminUpdateStreamerLevel: adminUpdateStreamerLevel,
    adminListHoursAdjustments: adminListHoursAdjustments,
    adminAdjustStreamerHours: adminAdjustStreamerHours,
    adminDeleteHoursAdjustment: adminDeleteHoursAdjustment,
    canAccessDashboard: canAccessDashboard,
    isStreamerAccount: isStreamerAccount,
    canPlayGames: canPlayGames,
    needsWelcome: needsWelcome,
    completeWelcome: completeWelcome,
    adminResetWelcome: adminResetWelcome,
    getLastWeekRanking: getLastWeekRanking,
    getTopStreamers: getTopStreamers,
    getTopStreamersByParticipations: getTopStreamersByParticipations,
    getUserWeeklyRanks: getUserWeeklyRanks,
    getTopPlayersByWins: getTopPlayersByWins,
    getTopPlayersByHours: getTopPlayersByHours,
    getTopPlayersByRounds: getTopPlayersByRounds,
    getAdminStreamerStats: getAdminStreamerStats,
    getAdminUserStats: getAdminUserStats,
    getAdminLiveStreams: getAdminLiveStreams,
    getRecentSupporters: getRecentSupporters,
    getTopSupporters: getTopSupporters,
    adminListSupporters: adminListSupporters,
    adminAddSupporter: adminAddSupporter,
    adminFindSupporterUser: adminFindSupporterUser,
    adminDeleteSupporter: adminDeleteSupporter,
    getPartners: getPartners,
    adminListPartners: adminListPartners,
    adminAddPartner: adminAddPartner,
    adminDeletePartner: adminDeletePartner,
    getSiteTheme: getSiteTheme,
    adminSetSiteTheme: adminSetSiteTheme,
    adminClearSiteTheme: adminClearSiteTheme,
    getLettersCellQuestionsDraft: getLettersCellQuestionsDraft,
    saveLettersCellQuestionsDraft: saveLettersCellQuestionsDraft,
    getPlatformStats: getPlatformStats,
    supportGetUploadSignature: supportGetUploadSignature,
    supportCreateTicket: supportCreateTicket,
    supportListTickets: supportListTickets,
    supportUnreadCount: supportUnreadCount,
    supportGetTicket: supportGetTicket,
    supportReply: supportReply,
    adminSupportListTickets: adminSupportListTickets,
    adminSupportGetTicket: adminSupportGetTicket,
    adminSupportReply: adminSupportReply,
    adminSupportSetStatus: adminSupportSetStatus,
    requireAuth: requireAuth,
    requireAdmin: requireAdmin
};

}(window));
