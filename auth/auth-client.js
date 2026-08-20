/**
 * ==========================================================================
 * AGP AUTH CLIENT — طبقة عميل مشتركة لصفحات الحسابات (خارج AGP.* تماماً)
 * ==========================================================================
 *
 * يوصّل صفحات login.html / signup.html / admin.html وقسم "Account" في
 * dashboard-core بواجهة backend/http/auth-router.js (راجع
 * docs/BACKEND_ARCHITECTURE.md §10). لا علاقة له بـ window.AymanGamesPlatform
 * (AGP) — تلك namespace خاصة بمنطق المنصة/الألعاب المجمّد، وهذا نظام
 * حسابات/إدارة منفصل تماماً، لذا يُعرَّف تحت اسم مستقل: window.AGPAuth.
 *
 * الجلسة تُخزَّن في localStorage (مفتاح واحد ثابت)، وتُرفَق تلقائياً في
 * كل طلب محمي عبر ترويسة Authorization: Bearer <token>.
 * ==========================================================================
 */

(function (global) {
'use strict';

var API_BASE = 'https://project-testing-akds.onrender.com';
var TOKEN_KEY = 'agp_auth_token';
var USER_KEY = 'agp_auth_user';
var DEVICE_ID_KEY = 'agp_device_id'; // [0.45.6] راجع getDeviceId أدناه

/* ----------------------------------------------------------------------
 * تخزين محلي — Token + آخر بيانات مستخدم معروفة (للعرض الفوري قبل
 * تأكيد /api/auth/me، لا تُعتمَد كمصدر حقيقة وحيد).
 * ---------------------------------------------------------------------- */

function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (err) { return null; }
}

function setSession(token, user) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    } catch (err) { /* localStorage غير متاح — لا كسر للصفحة */ }
}

function clearSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch (err) { /* لا شيء */ }
}

function getCachedUser() {
    try {
        var raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
}

/**
 * [0.45.6] معرّف "جهاز" ثابت لهذا المتصفح — رقم عشوائي يُولَّد مرة واحدة
 * فقط ويُخزَّن بـlocalStorage للأبد (لا ينتهي، خلافاً للـToken). يُستخدَم
 * حصراً لقيد الجهاز الواحد لحسابات الستريمر المعتمدين (راجع
 * backend/auth/auth-service.js: checkDeviceLock) — **ليس بصمة جهاز
 * حقيقية**، مجرد رقم محلي بالمتصفح. مسح بيانات المتصفح أو استخدام متصفح/
 * وضع تصفح مختلف يُولِّد رقماً جديداً بالكامل (نفس القيد الناعم الموثَّق
 * صراحة بـauth-service.js وdocs/CHANGELOG.md).
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
    } catch (err) { return null; } // localStorage غير متاح — القيد ببساطة لا يُطبَّق (نفس تحفّظ باقي localStorage بالملف)
}

/**
 * طلب عام لأي مسار API. يُرفِق Authorization تلقائياً لو كان هناك
 * Token مخزَّن. يرجع دائماً كائن الاستجابة المُحلَّل (JSON)، حتى في
 * حالات الفشل (شكله دائماً {success: boolean, ...}) — الاستثناء
 * الوحيد هو فشل الشبكة نفسه (لا اتصال بالخادم إطلاقاً).
 * @param {string} path - مثل '/api/auth/login'
 * @param {Object} [options] - {method, body}
 * @returns {Promise<Object>}
 */
function request(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

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

/* ----------------------------------------------------------------------
 * دوال Auth — تطابق مسارات http/auth-router.js واحداً لواحد
 * ---------------------------------------------------------------------- */

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
 * [0.45.6] اختيار نوع الحساب الإجباري (لاعب/استريمر) بعد أول دخول بجوجل
 * لحساب جديد — راجع choose-account-type.html وneedsAccountTypeChoice أدناه.
 * @param {boolean} wantsToBeStreamer
 * @returns {Promise<Object>}
 */
function chooseAccountType(wantsToBeStreamer) {
    return request('/api/auth/account-type', { method: 'POST', body: { wantsToBeStreamer: Boolean(wantsToBeStreamer) } });
}

/**
 * هل هذا المستخدم لازم يشوف شاشة اختيار نوع الحساب الإجبارية الآن؟ —
 * صحيح فقط لحسابات جوجل جديدة كلياً من [0.45.6] فصاعداً لم تختر بعد.
 * @param {Object} user
 * @returns {boolean}
 */
function needsAccountTypeChoice(user) {
    return Boolean(user) && user.account_type_chosen === false;
}

function logout() {
    return request('/api/auth/logout', { method: 'POST' }).then(function (result) {
        clearSession();
        return result;
    }).catch(function () {
        clearSession(); // حتى لو فشل الطلب (لا اتصال)، لا داعي لإبقاء المستخدم "مسجَّل دخول" محلياً
        return { success: true };
    });
}

function me() {
    return request('/api/auth/me', { method: 'GET' });
}

/**
 * يحدّث بيانات المستخدم المخزَّنة محلياً (localStorage) من الخادم
 * مباشرة — بدون أي تحويل أو تسجيل خروج عند الفشل، خلافاً لـ
 * requireAuth أدناه. يحل مشكلة بيانات مخزَّنة قديمة (مثال: الأدمن
 * وافق على can_run_games لحساب بعد ما كان صاحبه سجّل دخوله أصلاً —
 * الجلسة المحلية المخزَّنة تبقى بالصلاحية القديمة لحد ما يسجّل خروج
 * ويدخل من جديد، أو تُستدعى هذه الدالة). تُستخدَم بصفحات عامة مثل
 * index.html حيث لا نريد فرض requireAuth (لا تسجيل دخول إلزامي).
 * @returns {Promise<Object|null>} المستخدم المحدَّث، أو null لو فشل
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

/**
 * إلغاء ربط تيك توك يدوياً (زر صريح من المستخدم فقط) — الربط
 * الموثَّق لا ينتهي أبداً من نفسه، حتى لو شال المستخدم الكود من
 * بايو حسابه بتيك توك بعد التحقق. راجع docs/CHANGELOG.md.
 * @returns {Promise<Object>}
 */
function unlinkTikTok() {
    return request('/api/auth/tiktok/unlink', { method: 'POST' });
}

function setCustomId(customId) {
    return request('/api/auth/custom-id', { method: 'POST', body: { customId: customId } });
}

/**
 * [0.45.10] تعديل اسم العرض بالبروفايل (صاحب الجلسة فقط — user.id من
 * الجلسة بالخادم، لا يُرسَل هنا). راجع backend/http/auth-router.js
 * (handleUpdateDisplayName).
 */
function updateDisplayName(displayName) {
    return request('/api/profile/display-name', { method: 'POST', body: { displayName: displayName } });
}

/**
 * [0.45.10] تعديل صورة بروفايل المستخدم — imageDataUrl كامل جاهز (Data
 * URL، مثال "data:image/png;base64,..."). حد أقصى ~85KB بعد الترميز
 * (راجع MAX_AVATAR_BASE64_LENGTH بـauth-service.js) — يفضَّل تصغير/
 * ضغط الصورة (Canvas) بالمتصفح قبل الاستدعاء.
 */
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

/**
 * الأدمن فقط — يعدّل الـID العام (custom_id) لأي مستخدم بمعرفة id
 * حسابه الداخلي (userId)، خلافاً لـ setCustomId أعلاه اللي يقتصر
 * دائماً على حساب الجلسة الحالية نفسها.
 */
function adminSetCustomId(userId, customId) {
    return request('/api/admin/custom-id', {
        method: 'POST',
        body: { userId: userId, customId: customId }
    });
}

/**
 * [0.45.6] الأدمن فقط — حذف حساب نهائياً (لاعب أو ستريمر). لا تراجع.
 * @param {number} userId
 * @returns {Promise<Object>}
 */
function adminDeleteUser(userId) {
    return request('/api/admin/users/delete', { method: 'POST', body: { userId: userId } });
}

/**
 * [0.45.6] الأدمن فقط — تصفير قيد الجهاز الواحد لستريمر معتمد (صمام أمان
 * لو الستريمر غيّر جهازه فعلاً بشكل مشروع).
 * @param {number} userId
 * @returns {Promise<Object>}
 */
function adminResetDeviceLock(userId) {
    return request('/api/admin/reset-device-lock', { method: 'POST', body: { userId: userId } });
}

/**
 * بروفايل عام لأي مستخدم عبر الـID العام (custom_id) — بدون تسجيل
 * دخول، يصلح للاستدعاء من صفحة profile.html العامة مباشرة.
 * @param {string} customId
 * @returns {Promise<Object>}
 */
function getPublicProfile(customId) {
    return request('/api/profile?id=' + encodeURIComponent(customId), { method: 'GET' });
}

/**
 * الإعلان الحالي (إن كان نشطاً) — بدون تسجيل دخول، تستدعيها
 * index.html عند التحميل لعرض نافذة منبثقة لكل زائر. النتيجة
 * result.announcement تكون null لو ما فيه إعلان نشط حالياً.
 * @returns {Promise<Object>}
 */
function getAnnouncement() {
    return request('/api/announcement', { method: 'GET' });
}

/**
 * الأدمن فقط — نشر/تحديث الإعلان الحالي (يظهر فوراً لكل زائر جديد
 * للصفحة الرئيسية). imageFilename اختياري: اسم ملف مرفوع لجذر
 * المستودع (بنفس أسلوب logo.png/hero-banner.png)، مو رفع صورة فعلي.
 * @param {string} text
 * @param {string} [imageFilename]
 * @returns {Promise<Object>}
 */
function adminSetAnnouncement(text, imageFilename) {
    return request('/api/admin/announcement', {
        method: 'POST',
        body: { text: text, imageFilename: imageFilename || '', active: true }
    });
}

/**
 * الأدمن فقط — إزالة الإعلان الحالي فوراً (يختفي من الصفحة الرئيسية
 * لكل الزوار من اللحظة التالية). النص القديم يبقى محفوظاً بالخادم.
 * @returns {Promise<Object>}
 */
function adminClearAnnouncement() {
    return request('/api/admin/announcement', { method: 'POST', body: { active: false } });
}

/* ----------------------------------------------------------------------
 * المقتنيات (إطارات + دخوليات) والنقاط — راجع
 * backend/collectibles/collectibles-service.js وbackend/points/points-service.js
 * ---------------------------------------------------------------------- */

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

/**
 * صاحب الحساب يفعّل أحد إطاراته المملوكة (من صفحة بروفايله الخاصة فقط).
 */
function equipFrame(frameType, frameRef) {
    return request('/api/collectibles/equip', { method: 'POST', body: { frameType: frameType, frameRef: frameRef } });
}

/**
 * [0.45.0] صاحب الحساب يفعّل/يوقف دخوليته الحالية بنفسه — لا يحذفها
 * (يبقى القالب/النص محفوظين لإعادة التفعيل بضغطة واحدة). راجع
 * backend/collectibles/collectibles-service.js (setEntranceEnabled).
 * @param {boolean} enabled
 * @returns {Promise<Object>}
 */
function toggleEntrance(enabled) {
    return request('/api/entrance/toggle', { method: 'POST', body: { enabled: Boolean(enabled) } });
}

/**
 * تُستدعى من dashboard-core عند إنهاء جولة — راجع dashboard-core/js/
 * dashboard-core.js. participants: [{tiktokUsername, won}].
 */
function reportRoundCompletion(participants, durationMs) {
    return request('/api/points/round-complete', {
        method: 'POST',
        body: { participants: participants, durationMs: durationMs }
    });
}

/* ----------------------------------------------------------------------
 * [0.45.0] مستوى الستريمر (SP) — راجع
 * backend/points/streamer-level-service.js
 * ---------------------------------------------------------------------- */

/**
 * عتبات مستويات SP الحالية (مسار عام، بدون تسجيل دخول).
 * @returns {Promise<Object>}
 */
function getStreamerLevels() {
    return request('/api/streamer-levels', { method: 'GET' });
}

/**
 * الأدمن فقط — تعديل عتبة/اسم مستوى SP موجود مسبقاً.
 * @param {string} slug
 * @param {{minSp?: number, displayNameAr?: string}} fields
 * @returns {Promise<Object>}
 */
function adminUpdateStreamerLevel(slug, fields) {
    return request('/api/admin/streamer-levels', {
        method: 'POST',
        body: Object.assign({ slug: slug }, fields)
    });
}

/**
 * هل هذا المستخدم يقدر يدخل لوحة الستريمر (dashboard-core)؟ حصراً
 * حساب الأدمن — أي حساب آخر (عادي أو ستريمر موافَق عليه) يُحوَّل
 * دائماً لصفحة بروفايله العامة بدل اللوحة. راجع docs/CHANGELOG.md.
 * @param {Object} user
 * @returns {boolean}
 */
function canAccessDashboard(user) {
    return Boolean(user && user.role === 'admin');
}

/**
 * هل هذا المستخدم يقدر "يفتح" الألعاب (أزرار "العب الآن" بالصفحة
 * الرئيسية)؟ الأدمن دائماً يقدر، أو أي حساب وافق له الأدمن صراحة
 * على صلاحية can_run_games من admin.html (راجع setPermission/
 * adminSetPermission). تسجيل الحساب كـ"يبي يكون ستريمر" (مربع
 * الاختيار بصفحة signup.html) مجرّد طلب أولي لا يمنح فتح الألعاب
 * تلقائياً — الموافقة الفعلية دايماً من الأدمن.
 * @param {Object} user
 * @returns {boolean}
 */
function canPlayGames(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Boolean(user.permissions && user.permissions.can_run_games);
}

/**
 * هل هذا المستخدم لازم يشوف "حفلة ترحيب الستريمر الجديد" الآن؟ —
 * حساب ستريمر موافَق عليه فعلياً (نفس شرط canPlayGames، بدون
 * الأدمن نفسه — الحفلة لستريمر جديد لا لصاحب المنصة) ولم يكملها
 * كاملة بعد (welcome_completed). راجع docs/CHANGELOG.md.
 * @param {Object} user
 * @returns {boolean}
 */
function needsWelcome(user) {
    if (!user || user.role === 'admin') return false;
    return Boolean(user.permissions && user.permissions.can_run_games) && !user.welcome_completed;
}

/**
 * صاحب الحساب يعلّم الحفلة كمكتملة بعد ما يشوفها كاملة فعلياً
 * (آخر خطوة بالعد التنازلي) — راجع index.html.
 * @returns {Promise<Object>}
 */
function completeWelcome() {
    return request('/api/auth/welcome/complete', { method: 'POST' });
}

/**
 * الأدمن فقط — يصفّر حالة الترحيب لمستخدم معيّن فتطلع له الحفلة
 * مرة وحدة إضافية بأول زيارة جاية.
 * @param {number} userId
 * @returns {Promise<Object>}
 */
function adminResetWelcome(userId) {
    return request('/api/admin/welcome/reset', { method: 'POST', body: { userId: userId } });
}

/* ----------------------------------------------------------------------
 * داعمو المنصة — راجع backend/supporters/supporters-service.js
 * ---------------------------------------------------------------------- */

/**
 * آخر 3 داعمين (افتراضياً) — بدون تسجيل دخول، تستدعيها index.html
 * للشريط المتحرك.
 * @returns {Promise<Object>}
 */
function getRecentSupporters(limit) {
    var path = '/api/supporters/recent';
    if (limit) path += '?limit=' + encodeURIComponent(limit);
    return request(path, { method: 'GET' });
}

/**
 * [0.45.10] أعلى الاستريمرز بإجمالي ساعات البث — بدون تسجيل دخول،
 * تستدعيها index.html لشريط "الاستريمرز الأكثر ساعات". يرجع فقط يوزرنيم
 * تيك توك + إجمالي الساعات لكل استريمر — بدون أي بيانات حساب حساسة.
 * @param {number} [limit]
 * @returns {Promise<Object>}
 */
function getTopStreamers(limit) {
    var qs = limit ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/api/public/top-streamers' + qs, { method: 'GET' });
}

/**
 * [0.45.10] الأدمن فقط — إحصائيات تجميعية للستريمرز (إجمالي الساعات،
 * إجمالي المشاهدات، عدد الستريمرز المسجَّلين، وأعلى 10 بالساعات).
 * تستدعيها admin-stats.html — راجع getAdminStreamerStats() بـ
 * backend/auth/auth-service.js.
 * @returns {Promise<Object>}
 */
function getAdminStreamerStats() {
    return request('/api/admin/stats/streamers', { method: 'GET' });
}

/**
 * [0.45.10] الأدمن فقط — إحصائيات عامة للمستخدمين (عدد المسجَّلين،
 * عدد الستريمرز، عدد الموثَّقين بتيك توك، وأعلى اللاعبين بعدد الجولات
 * كبديل صادق عن "الأكثر نشاطاً" لغير الستريمرز — راجع الملاحظة الصادقة
 * بـgetAdminUserStats() بـbackend/auth/auth-service.js).
 * @returns {Promise<Object>}
 */
function getAdminUserStats() {
    return request('/api/admin/stats/users', { method: 'GET' });
}

/**
 * توب الداعمين (مجموع المبالغ لكل اسم) — بدون تسجيل دخول، تستدعيها
 * صفحة top-supporters.html.
 * @returns {Promise<Object>}
 */
function getTopSupporters() {
    return request('/api/supporters/top', { method: 'GET' });
}

/** الأدمن فقط — كل صفوف الدعم (لوحة الإدارة بـadmin.html). */
function adminListSupporters() {
    return request('/api/admin/supporters', { method: 'GET' });
}

/**
 * الأدمن فقط — إضافة دعم جديد يدوياً (بعد ما يشوفه فعلياً بلوحة
 * تحكم كريترز — لا ربط تلقائي بعد، راجع docs/CHANGELOG.md).
 * @param {string} name
 * @param {string} message
 * @param {number} amount
 * @returns {Promise<Object>}
 */
function adminAddSupporter(name, message, amount, customId) {
    return request('/api/admin/supporters', { method: 'POST', body: { name: name, message: message, amount: amount, customId: customId } });
}

/**
 * [0.45.14] معاينة حيّة (اسم+صورة) لحساب عبر custom_id — تُستخدَم
 * بلوحة الأدمن قبل تأكيد ربط صف دعم بحساب فعلي. راجع
 * backend/supporters/supporters-service.js (findUserForLinking).
 * @param {string} customId
 * @returns {Promise<Object>}
 */
function adminFindSupporterUser(customId) {
    return request('/api/admin/supporters/find-user?customId=' + encodeURIComponent(customId || ''), { method: 'GET' });
}

/** الأدمن فقط — حذف صف دعم واحد (تصحيح خطأ إدخال يدوي). */
function adminDeleteSupporter(id) {
    return request('/api/admin/supporters/delete', { method: 'POST', body: { id: id } });
}

/* ----------------------------------------------------------------------
 * ثيم المناسبات — راجع backend/theme/site-theme-service.js
 * ---------------------------------------------------------------------- */

/**
 * الثيم الحالي (إن كان نشطاً) — بدون تسجيل دخول، تستدعيها
 * index.html عند التحميل. result.theme تكون null لو غير مفعَّل.
 * @returns {Promise<Object>}
 */
function getSiteTheme() {
    return request('/api/theme', { method: 'GET' });
}

/**
 * الأدمن فقط — تفعيل/تحديث ثيم المناسبة (3 أكواد لون Hex).
 * @param {string|null} presetKey
 * @param {string} accent
 * @param {string} accent2
 * @param {string} accentPink
 * @returns {Promise<Object>}
 */
function adminSetSiteTheme(presetKey, accent, accent2, accentPink) {
    return request('/api/admin/theme', {
        method: 'POST',
        body: { presetKey: presetKey, accent: accent, accent2: accent2, accentPink: accentPink }
    });
}

/** الأدمن فقط — تعطيل الثيم فوراً (رجوع للألوان الافتراضية). */
function adminClearSiteTheme() {
    return request('/api/admin/theme/clear', { method: 'POST' });
}

/* ----------------------------------------------------------------------
 * حرّاس صفحات — تُستدعى في أول سطر من أي صفحة محمية
 * ---------------------------------------------------------------------- */

/**
 * يتأكد أن هناك جلسة صالحة فعلياً (يستدعي /api/auth/me، لا يكتفي
 * بوجود Token محلي). لو غير صالحة يمسح الجلسة ويحوّل لصفحة الدخول.
 * @param {string} [redirectTo] - رابط صفحة الدخول (افتراضي: login.html)
 * @returns {Promise<Object|null>} بيانات المستخدم عند النجاح فقط
 */
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
 * مثل requireAuth، لكن يرفض أيضاً أي مستخدم دوره ليس 'admin'.
 *
 * مستخدم مسجَّل دخول فعلياً لكن دوره ليس admin يُحوَّل لـ
 * `nonAdminRedirectTo` (افتراضياً لوحته الخاصة) بدل `redirectTo`
 * (صفحة الدخول) — لو حوَّلناه لصفحة الدخول، ستكتشف تلك الصفحة نفسها
 * أن جلسته صالحة وتُعيد تحويله لِلوحته تلقائياً على أي حال (راجع
 * login.html)، فتحويله مباشرة أوضح وأقصر.
 * @param {string} [redirectTo] - لغير المسجَّلين دخولهم إطلاقاً
 * @param {string} [nonAdminRedirectTo] - للمسجَّلين دخولهم بدور غير admin
 * @returns {Promise<Object|null>}
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
    logout: logout,
    me: me,
    refreshUser: refreshUser,
    linkTikTok: linkTikTok,
    requestTikTokVerificationCode: requestTikTokVerificationCode,
    verifyTikTok: verifyTikTok,
    unlinkTikTok: unlinkTikTok,
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
    getAdminStreamerStats: getAdminStreamerStats,
    getAdminUserStats: getAdminUserStats,
    getRecentSupporters: getRecentSupporters,
    getTopSupporters: getTopSupporters,
    adminListSupporters: adminListSupporters,
    adminAddSupporter: adminAddSupporter,
    adminFindSupporterUser: adminFindSupporterUser,
    adminDeleteSupporter: adminDeleteSupporter,
    getSiteTheme: getSiteTheme,
    adminSetSiteTheme: adminSetSiteTheme,
    adminClearSiteTheme: adminClearSiteTheme,
    requireAuth: requireAuth,
    requireAdmin: requireAdmin
};

}(window));
