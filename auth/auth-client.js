/**
 * AGP AUTH CLIENT — shared client layer for account pages, connects
 * login.html / signup.html / admin.html / dashboard-core to
 * backend/http/auth-router.js (see docs/BACKEND_ARCHITECTURE.md §10).
 * Deliberately separate from window.AymanGamesPlatform (AGP), hence its
 * own namespace: window.AGPAuth.
 *
 * Session is stored in localStorage and attached to every protected
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

function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (err) { return null; }
}

function setSession(token, user) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    } catch (err) { /* localStorage unavailable — don't break the page */ }
}

function clearSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch (err) {}
}

function getCachedUser() {
    try {
        var raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
}

/**
 * Stable per-browser "device" id — random, generated once and persisted
 * forever in localStorage. Used only for the single-device lock on
 * approved streamer accounts (see auth-service.js: checkDeviceLock).
 * NOT a real device fingerprint — clearing browser data or using a
 * different browser/profile yields a new id (an intentionally soft
 * constraint).
 * @returns {string|null}
 */
function getDeviceId() {
    try {
        var id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = 'dev_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    } catch (err) { return null; }
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
        body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
            data.__httpStatus = res.status;
            return data;
        });
    });
}

/* Auth functions — map 1:1 to http/auth-router.js routes */

function signup(username, email, password, wantsToBeStreamer) {
    return request('/api/auth/signup', {
        method: 'POST',
        body: { username: username, email: email, password: password, wantsToBeStreamer: Boolean(wantsToBeStreamer) }
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
function refreshUser() {
    if (!getToken()) return Promise.resolve(null);
    return me().then(function (result) {
        if (result.success) {
            setSession(getToken(), result.user);
            return result.user;
        }
        return null;
    }).catch(function () { return null; });
}

function linkTikTok(tiktokUsername) {
    return request('/api/auth/tiktok/link', { method: 'POST', body: { tiktokUsername: tiktokUsername } });
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

/** Owner equips one of their owned frames (own profile page only). */
function equipFrame(frameType, frameRef) {
    return request('/api/collectibles/equip', { method: 'POST', body: { frameType: frameType, frameRef: frameRef } });
}

/** Owner toggles their entrance on/off without deleting it (template/text
 * stay saved for one-click re-enable). */
function toggleEntrance(enabled) {
    return request('/api/entrance/toggle', { method: 'POST', body: { enabled: Boolean(enabled) } });
}

/** Called by dashboard-core on round end. participants: [{tiktokUsername, won}]. */
function reportRoundCompletion(participants, durationMs) {
    return request('/api/points/round-complete', {
        method: 'POST',
        body: { participants: participants, durationMs: durationMs }
    });
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

/** Only admin accounts can access the streamer dashboard (dashboard-core);
 * every other account is redirected to its public profile instead. */
function canAccessDashboard(user) {
    return Boolean(user && user.role === 'admin');
}

/** Admins can always play; otherwise requires the admin-granted
 * can_run_games permission. Checking "wants to be streamer" at signup is
 * just a request — it never grants this on its own. */
function canPlayGames(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Boolean(user.permissions && user.permissions.can_run_games);
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

/** Top streamers by total stream hours. Returns TikTok username + hours
 * only, no sensitive account data. */
function getTopStreamers(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-streamers' + qs, { method: 'GET' });
}

function getTopPlayersByWins(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-players-wins' + qs, { method: 'GET' });
}

/** Top players by actual play hours. Data starts at zero for everyone
 * from when this system was added — no retroactive history. */
function getTopPlayersByHours(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-players-hours' + qs, { method: 'GET' });
}

function getAdminStreamerStats() {
    return request('/api/admin/stats/streamers', { method: 'GET' });
}

function getAdminUserStats() {
    return request('/api/admin/stats/users', { method: 'GET' });
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

/* Page guards — called as the first line of any protected page */

/** Confirms a session is actually valid (calls /api/auth/me, not just
 * checking a local token exists). Clears and redirects to login on failure. */
function requireAuth(redirectTo) {
    if (!getToken()) {
        global.location.href = redirectTo || 'login.html';
        return Promise.resolve(null);
    }
    return me().then(function (result) {
        if (!result.success) {
            clearSession();
            global.location.href = redirectTo || 'login.html';
            return null;
        }
        setSession(getToken(), result.user);
        return result.user;
    });
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
    getToken: getToken,
    getCachedUser: getCachedUser,
    clearSession: clearSession,
    signup: signup,
    login: login,
    loginWithGoogle: loginWithGoogle,
    forgotPassword: forgotPassword,
    resetPasswordWithCode: resetPasswordWithCode,
    logout: logout,
    me: me,
    refreshUser: refreshUser,
    linkTikTok: linkTikTok,
    requestTikTokVerificationCode: requestTikTokVerificationCode,
    verifyTikTok: verifyTikTok,
    unlinkTikTok: unlinkTikTok,
    deleteMyAccount: deleteMyAccount,
    setCustomId: setCustomId,
    updateDisplayName: updateDisplayName,
    updateAvatarImage: updateAvatarImage,
    getDeviceId: getDeviceId,
    chooseAccountType: chooseAccountType,
    needsAccountTypeChoice: needsAccountTypeChoice,
    adminListUsers: adminListUsers,
    adminSetPermission: adminSetPermission,
    adminSetCustomId: adminSetCustomId,
    adminDeleteUser: adminDeleteUser,
    adminResetDeviceLock: adminResetDeviceLock,
    adminAllowDeviceChange: adminAllowDeviceChange,
    getPublicProfile: getPublicProfile,
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
    toggleEntrance: toggleEntrance,
    reportRoundCompletion: reportRoundCompletion,
    getStreamerLevels: getStreamerLevels,
    adminUpdateStreamerLevel: adminUpdateStreamerLevel,
    canAccessDashboard: canAccessDashboard,
    canPlayGames: canPlayGames,
    needsWelcome: needsWelcome,
    completeWelcome: completeWelcome,
    adminResetWelcome: adminResetWelcome,
    getTopStreamers: getTopStreamers,
    getTopPlayersByWins: getTopPlayersByWins,
    getTopPlayersByHours: getTopPlayersByHours,
    getAdminStreamerStats: getAdminStreamerStats,
    getAdminUserStats: getAdminUserStats,
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
    requireAuth: requireAuth,
    requireAdmin: requireAdmin
};

}(window));
