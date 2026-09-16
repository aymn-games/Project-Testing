/**
 * AGP AUTH ROUTER — يوصّل backend/auth/auth-service.js بواجهة HTTP فعلية.
 * جدول مسارات بسيط + دالة `handle(req, res)` واحدة تُستدعى من server.js
 * لكل طلب يبدأ بـ "/api/". لا معرفة هنا بـ WebSocket أو تيك توك — مسؤولية
 * واحدة: HTTP API للحسابات والإدارة.
 */

'use strict';

var authService = require('../auth/auth-service');
var tiktokOAuthService = require('../auth/tiktok-oauth-service');
var announcementService = require('../announcements/announcement-service');
var collectiblesService = require('../collectibles/collectibles-service');
var pointsService = require('../points/points-service');
var streamerLevelService = require('../points/streamer-level-service');
var supportersService = require('../supporters/supporters-service');
var siteThemeService = require('../theme/site-theme-service');
var partnersService = require('../partners/partners-service');
var logger = require('../utils/logger');
var config = require('../config');
var response = require('./response');
var bodyParser = require('./body-parser');

var sendJson = response.sendJson;

/**
 * استخراج Token من ترويسة Authorization: "Bearer <token>".
 * @param {http.IncomingMessage} req
 * @returns {string|null}
 */
function extractBearerToken(req) {
  var header = req.headers['authorization'] || '';
  var match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * يتحقق من الجلسة الحالية عبر auth-service.validateSession (كما هو،
 * بدون أي تعديل). يرجع null دون أي throw لو الترويسة غير موجودة أو
 * الجلسة منتهية/غير صالحة.
 * @param {http.IncomingMessage} req
 * @returns {Object|null} بيانات المستخدم
 */
function requireUser(req) {
  var token = extractBearerToken(req);
  if (!token) return null;
  return authService.validateSession(token);
}

/**
 * قراءة قيمة واحدة من query string الطلب (مثال: ?id=abc&limit=5).
 * @param {http.IncomingMessage} req
 * @param {string} key
 * @returns {string} فارغ لو غير موجود
 */
function getQueryParam(req, key) {
  var queryString = (req.url || '').split('?')[1] || '';
  var value = '';
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === key) value = decodeURIComponent(kv[1] || '');
  });
  return value;
}

/**
 * جدول المسارات: كل عنصر {method, path, handler}. الـ handler يستقبل
 * (req, res, body, user) — user يكون null لو المسار لا يتطلب Auth.
 * requireAuth/requireAdmin يُطبَّقان تلقائياً قبل استدعاء الـ handler.
 */
var ROUTES = [
  { method: 'POST', path: '/api/auth/signup', requireAuth: false, handler: handleSignup },
  { method: 'POST', path: '/api/auth/login', requireAuth: false, handler: handleLogin },
  { method: 'POST', path: '/api/auth/google', requireAuth: false, handler: handleGoogleLogin },
  { method: 'POST', path: '/api/auth/logout', requireAuth: true, handler: handleLogout },
  { method: 'GET', path: '/api/auth/me', requireAuth: true, handler: handleMe },
  { method: 'POST', path: '/api/auth/tiktok/link', requireAuth: true, handler: handleTikTokLink },
  { method: 'POST', path: '/api/auth/tiktok/verification-code', requireAuth: true, handler: handleTikTokVerificationCode },
  // ---- تسجيل دخول تيك توك الرسمي (OAuth Login Kit) — البديل الموصى به
  // لطريقة كود البايو أعلاه. requireAuth: false بالاثنين لأنهما مسارا
  // تنقّل متصفح خام — لا يقدران يرفقان ترويسة Authorization، لذا نتحقق
  // من الجلسة يدوياً داخل handleTikTokOAuthStart عبر ?token=.
  { method: 'GET', path: '/api/auth/tiktok/oauth/start', requireAuth: false, handler: handleTikTokOAuthStart },
  { method: 'GET', path: '/api/auth/tiktok/oauth/callback', requireAuth: false, handler: handleTikTokOAuthCallback },
  { method: 'POST', path: '/api/auth/tiktok/verify', requireAuth: true, handler: handleTikTokVerify },
  { method: 'POST', path: '/api/auth/tiktok/unlink', requireAuth: true, handler: handleTikTokUnlink },
  { method: 'POST', path: '/api/auth/custom-id', requireAuth: true, handler: handleCustomId },
  // اختيار نوع الحساب الإجباري بعد أول دخول بجوجل لحساب جديد كلياً.
  { method: 'POST', path: '/api/auth/account-type', requireAuth: true, handler: handleChooseAccountType },
  // استرجاع كلمة المرور — خطوتين، بدون Auth (المستخدم أصلاً خارج جلسته).
  { method: 'POST', path: '/api/auth/forgot-password', requireAuth: false, handler: handleForgotPassword },
  { method: 'POST', path: '/api/auth/reset-password', requireAuth: false, handler: handleResetPassword },
  { method: 'GET', path: '/api/admin/users', requireAuth: true, requireAdmin: true, handler: handleAdminListUsers },
  { method: 'POST', path: '/api/admin/permissions', requireAuth: true, requireAdmin: true, handler: handleAdminSetPermission },
  { method: 'POST', path: '/api/admin/custom-id', requireAuth: true, requireAdmin: true, handler: handleAdminSetCustomId },
  { method: 'POST', path: '/api/admin/users/delete', requireAuth: true, requireAdmin: true, handler: handleAdminDeleteUser },
  // حذف ذاتي — requireAdmin غير موجود عمداً، requireAuth فقط.
  { method: 'POST', path: '/api/profile/delete-account', requireAuth: true, handler: handleDeleteMyAccount },
  { method: 'POST', path: '/api/admin/reset-device-lock', requireAuth: true, requireAdmin: true, handler: handleAdminResetDeviceLock },
  { method: 'POST', path: '/api/admin/allow-device-change', requireAuth: true, requireAdmin: true, handler: handleAdminAllowDeviceChange },
  { method: 'POST', path: '/api/admin/super-admin', requireAuth: true, requireAdmin: true, handler: handleAdminSetSuperAdmin },
  { method: 'GET', path: '/api/profile', requireAuth: false, handler: handlePublicProfile },
  { method: 'GET', path: '/api/announcement', requireAuth: false, handler: handleGetAnnouncement },
  { method: 'POST', path: '/api/admin/announcement', requireAuth: true, requireAdmin: true, handler: handleAdminSetAnnouncement },
  // ---- المقتنيات (إطارات + دخوليات) والنقاط
  { method: 'GET', path: '/api/admin/collectibles/catalog', requireAuth: true, requireAdmin: true, handler: handleAdminGetCatalog },
  { method: 'POST', path: '/api/admin/collectibles/catalog', requireAuth: true, requireAdmin: true, handler: handleAdminUpdateCatalog },
  { method: 'POST', path: '/api/admin/collectibles/custom-frame', requireAuth: true, requireAdmin: true, handler: handleAdminCreateCustomFrame },
  { method: 'POST', path: '/api/admin/collectibles/grant', requireAuth: true, requireAdmin: true, handler: handleAdminGrantFrame },
  { method: 'POST', path: '/api/admin/collectibles/revoke', requireAuth: true, requireAdmin: true, handler: handleAdminRevokeFrame },
  { method: 'POST', path: '/api/admin/entrance', requireAuth: true, requireAdmin: true, handler: handleAdminSetEntrance },
  { method: 'POST', path: '/api/collectibles/equip', requireAuth: true, handler: handleEquipFrame },
  { method: 'POST', path: '/api/points/round-complete', requireAuth: true, handler: handleRoundComplete },
  // تفعيل/إيقاف الدخولية ذاتياً — نفس نمط handleEquipFrame (صاحب الجلسة فقط).
  { method: 'POST', path: '/api/entrance/toggle', requireAuth: true, handler: handleToggleEntrance },
  // ---- مستوى الستريمر (SP). القراءة العامة لعتبات المستويات مسموحة
  // بدون تسجيل دخول — لا بيانات حساسة، فقط عتبات ثابتة للعرض.
  { method: 'GET', path: '/api/streamer-levels', requireAuth: false, handler: handleGetStreamerLevels },
  { method: 'POST', path: '/api/admin/streamer-levels', requireAuth: true, requireAdmin: true, handler: handleAdminUpdateStreamerLevel },
  // ---- حفلة ترحيب الستريمر الجديد
  { method: 'POST', path: '/api/auth/welcome/complete', requireAuth: true, handler: handleCompleteWelcome },
  { method: 'POST', path: '/api/admin/welcome/reset', requireAuth: true, requireAdmin: true, handler: handleAdminResetWelcome },
  // ---- داعمو المنصة — إدخال يدوي من الأدمن حالياً
  { method: 'GET', path: '/api/supporters/recent', requireAuth: false, handler: handleGetRecentSupporters },
  { method: 'GET', path: '/api/supporters/top', requireAuth: false, handler: handleGetTopSupporters },
  { method: 'GET', path: '/api/admin/supporters', requireAuth: true, requireAdmin: true, handler: handleAdminListSupporters },
  { method: 'POST', path: '/api/admin/supporters', requireAuth: true, requireAdmin: true, handler: handleAdminAddSupporter },
  { method: 'POST', path: '/api/admin/supporters/delete', requireAuth: true, requireAdmin: true, handler: handleAdminDeleteSupporter },
  { method: 'GET', path: '/api/admin/supporters/find-user', requireAuth: true, requireAdmin: true, handler: handleAdminFindSupporterUser },
  // ---- شركاء الإبداع — نفس فلسفة الداعمين (عرض علني + إدارة أدمن)،
  // إلا إنه يربط بحساب مسجَّل حقيقي (JOIN وقت القراءة) بدل اسم/صورة نصاً.
  { method: 'GET', path: '/api/partners', requireAuth: false, handler: handleGetPartners },
  { method: 'GET', path: '/api/admin/partners', requireAuth: true, requireAdmin: true, handler: handleAdminListPartners },
  { method: 'POST', path: '/api/admin/partners', requireAuth: true, requireAdmin: true, handler: handleAdminAddPartner },
  { method: 'POST', path: '/api/admin/partners/delete', requireAuth: true, requireAdmin: true, handler: handleAdminDeletePartner },
  // ---- ثيم المناسبات
  { method: 'GET', path: '/api/theme', requireAuth: false, handler: handleGetTheme },
  { method: 'POST', path: '/api/admin/theme', requireAuth: true, requireAdmin: true, handler: handleAdminSetTheme },
  { method: 'POST', path: '/api/admin/theme/clear', requireAuth: true, requireAdmin: true, handler: handleAdminClearTheme },
  // ---- شريط "أكثر الاستريمرز ساعات" وأعلى اللاعبين بالفوز/بالساعات —
  // عام بدون تسجيل دخول، بيانات غير حساسة فقط.
  { method: 'GET', path: '/api/public/top-streamers', requireAuth: false, handler: handleTopStreamers },
  { method: 'GET', path: '/api/public/top-players-wins', requireAuth: false, handler: handleTopPlayersByWins },
  { method: 'GET', path: '/api/public/top-players-hours', requireAuth: false, handler: handleTopPlayersByHours },
  // ---- إحصائيات لوحة الأدمن
  { method: 'GET', path: '/api/admin/stats/streamers', requireAuth: true, requireAdmin: true, handler: handleAdminStreamerStats },
  { method: 'GET', path: '/api/admin/stats/users', requireAuth: true, requireAdmin: true, handler: handleAdminUserStats },
  // ---- تعديل بروفايل المستخدم (اسم عرض + صورة) — صاحب الجلسة فقط.
  { method: 'POST', path: '/api/profile/display-name', requireAuth: true, handler: handleUpdateDisplayName },
  { method: 'POST', path: '/api/profile/avatar', requireAuth: true, handler: handleUpdateAvatar }
];

/* -----------------------------------------------------------------------
 * Handlers — كل واحد يستدعي دالة واحدة موجودة أصلاً في auth-service.js
 * ----------------------------------------------------------------------- */

function handleSignup(req, res, body) {
  var result = authService.signup(body.username, body.email, body.password, Boolean(body.wantsToBeStreamer));
  sendJson(res, result.success ? 201 : 400, result);
}

function handleLogin(req, res, body) {
  // body.deviceId اختياري — يؤثر فقط على حسابات ستريمر معتمدة. خطأ
  // 'device_locked' يُرجَع بـ403 (مو 401 — بيانات الدخول صحيحة).
  var result = authService.login(body.email, body.password, body.deviceId);
  var status = result.success ? 200 : (result.error === 'device_locked' ? 403 : 401);
  sendJson(res, status, result);
}

function handleGoogleLogin(req, res, body) {
  return authService.loginWithGoogle(body.idToken, body.deviceId).then(function (result) {
    var status = result.success ? 200 : (result.error === 'device_locked' ? 403 : 401);
    sendJson(res, status, result);
  });
}

/** خطوة ١ — يرجع {success:true} دائماً (منع تعداد الإيميلات). body: {email} */
function handleForgotPassword(req, res, body) {
  return authService.requestPasswordReset(body.email).then(function (result) {
    sendJson(res, 200, result);
  });
}

/** خطوة ٢ — يتحقق من الرمز ويحدّث كلمة المرور. body: {email, code, newPassword} */
function handleResetPassword(req, res, body) {
  var result = authService.resetPasswordWithCode(body.email, body.code, body.newPassword);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleLogout(req, res, body, user, token) {
  authService.logout(token);
  sendJson(res, 200, { success: true });
}

function handleMe(req, res, body, user) {
  sendJson(res, 200, { success: true, user: user });
}

function handleTikTokLink(req, res, body, user) {
  authService.linkTikTokUsername(user.id, body.tiktokUsername);
  sendJson(res, 200, { success: true });
}

function handleTikTokVerificationCode(req, res, body, user) {
  var code = authService.generateVerificationCode(user.id);
  sendJson(res, 200, { success: true, code: code });
}

function handleTikTokVerify(req, res, body, user) {
  return authService.verifyTikTokOwnership(user.id, body.tiktokUsername).then(function (result) {
    sendJson(res, result.success ? 200 : 400, result);
  });
}

/* -----------------------------------------------------------------------
 * تسجيل دخول تيك توك الرسمي (OAuth Login Kit).
 * ----------------------------------------------------------------------- */

/** يبدأ تدفق OAuth — زر "ربط الحساب" بالبروفايل يودي لهذا المسار مباشرة (?token=<جلسة المستخدم>). */
function handleTikTokOAuthStart(req, res) {
  var queryString = (req.url || '').split('?')[1] || '';
  var params = new URLSearchParams(queryString);
  var token = params.get('token');
  var user = token ? authService.validateSession(token) : null;
  if (!user) {
    res.writeHead(302, { Location: config.frontendBaseUrl + '/login.html?tiktok_error=not_logged_in' });
    return res.end();
  }
  var authorizeUrl = tiktokOAuthService.buildAuthorizeUrl(user.id);
  res.writeHead(302, { Location: authorizeUrl });
  res.end();
}

/** يستقبل رد تيك توك (code+state)، يربط الحساب فعلياً، ويرجّع المستخدم لبروفايله. */
async function handleTikTokOAuthCallback(req, res) {
  var queryString = (req.url || '').split('?')[1] || '';
  var params = new URLSearchParams(queryString);
  var code = params.get('code');
  var state = params.get('state');
  var deniedByUser = params.get('error'); // المستخدم رفض الموافقة بصفحة تيك توك نفسها

  function redirectToProfile(status) {
    res.writeHead(302, { Location: config.frontendBaseUrl + '/profile.html?tiktok_link=' + status });
    res.end();
  }

  if (deniedByUser) return redirectToProfile('cancelled');

  var userId = tiktokOAuthService.verifyState(state);
  if (!userId) return redirectToProfile('invalid_state');
  if (!code) return redirectToProfile('missing_code');

  var tokenResult = await tiktokOAuthService.exchangeCodeForToken(code);
  if (!tokenResult.success) return redirectToProfile('token_exchange_failed');

  var infoResult = await tiktokOAuthService.fetchTikTokUserInfo(tokenResult.accessToken);
  if (!infoResult.success) return redirectToProfile('user_info_failed');

  var linkResult = tiktokOAuthService.linkVerifiedAccount(userId, infoResult.user);
  if (!linkResult.success) return redirectToProfile(linkResult.error === 'tiktok_account_already_linked_elsewhere' ? 'already_linked' : 'link_failed');

  return redirectToProfile('success');
}

/** إلغاء ربط تيك توك يدوياً — بطلب صريح من صاحب الحساب فقط. */
function handleTikTokUnlink(req, res, body, user) {
  var result = authService.unlinkTikTok(user.id);
  sendJson(res, 200, result);
}

function handleCustomId(req, res, body, user) {
  var result = authService.setCustomId(user.id, body.customId);
  sendJson(res, result.success ? 200 : 400, result);
}

/** اختيار نوع الحساب الإجباري — user.id من الجلسة نفسها، لا من body. */
function handleChooseAccountType(req, res, body, user) {
  var result = authService.chooseAccountType(user.id, Boolean(body.wantsToBeStreamer));
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminListUsers(req, res) {
  sendJson(res, 200, { success: true, users: authService.listAllUsersWithStats() });
}

/**
 * ⚠️ منح تلقائي مرتبط: تفعيل can_run_games تحديداً يمنح تلقائياً إطار
 * "streamer" الخاص (+ دخولية + توهج معه). تعطيل الصلاحية لاحقاً لا يسحب
 * الإطار تلقائياً — سحبه يحتاج فعل يدوي عبر /api/admin/collectibles/revoke.
 */
function handleAdminSetPermission(req, res, body) {
  var result = authService.setPermission(body.userId, body.permissionKey, Boolean(body.value));
  if (result.success && body.permissionKey === 'can_run_games' && body.value) {
    collectiblesService.grantFrame(body.userId, 'catalog', 'streamer', { grantedBy: 'auto_permission' });
  }
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * الأدمن فقط — يعدّل الـID العام (custom_id) لأي مستخدم (مو حسابه هو
 * بس، خلافاً لـ handleCustomId أعلاه اللي يقتصر على صاحب الجلسة).
 * يستدعي نفس authService.setCustomId دون أي تعديل عليها.
 */
function handleAdminSetCustomId(req, res, body) {
  var result = authService.setCustomId(body.userId, body.customId);
  sendJson(res, result.success ? 200 : 400, result);
}

/** الأدمن فقط — حذف حساب نهائياً (لاعب أو ستريمر). */
function handleAdminDeleteUser(req, res, body) {
  var result = authService.deleteUser(body.userId);
  sendJson(res, result.success ? 200 : 400, result);
}

/** حذف الحساب الذاتي — user.id من الجلسة الحالية، أبداً من body. */
function handleDeleteMyAccount(req, res, body, user) {
  var result = authService.deleteUser(user.id);
  sendJson(res, result.success ? 200 : 400, result);
}

/** الأدمن فقط — تصفير قيد الجهاز الواحد لستريمر معتمد. */
function handleAdminResetDeviceLock(req, res, body) {
  var result = authService.adminResetDeviceLock(body.userId);
  sendJson(res, result.success ? 200 : 400, result);
}

/** الأدمن فقط — تفعيل/تعطيل سماح تغيير الجهاز لمرة واحدة. body: {userId, allow: boolean} */
function handleAdminAllowDeviceChange(req, res, body) {
  var result = authService.adminSetAllowDeviceChange(body.userId, Boolean(body.allow));
  sendJson(res, result.success ? 200 : 400, result);
}

/** الأدمن فقط — تفعيل/تعطيل وضع سوبر أدمن لحساب محدد. body: {userId, isSuperAdmin: boolean} */
function handleAdminSetSuperAdmin(req, res, body) {
  var result = authService.adminSetSuperAdmin(body.userId, Boolean(body.isSuperAdmin));
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * بروفايل عبر ?id=<custom_id> بالرابط — بدون تسجيل دخول إلزامي. البيانات
 * الكاملة تُرسَل فقط لصاحب الحساب أو للأدمن؛ أي طرف آخر يستلم فقط
 * username/custom_id.
 */
function handlePublicProfile(req, res, body, user) {
  var customId = getQueryParam(req, 'id');
  var profile = authService.getPublicProfile(customId);
  if (!profile) {
    sendJson(res, 404, { success: false, error: 'not_found' });
    return;
  }
  var isOwner = Boolean(user && user.custom_id === profile.custom_id);
  var isAdmin = Boolean(user && user.role === 'admin');
  if (!isOwner && !isAdmin) {
    sendJson(res, 200, { success: true, profile: { username: profile.username, custom_id: profile.custom_id, restricted: true } });
    return;
  }
  sendJson(res, 200, { success: true, profile: profile });
}

/**
 * الإعلان الحالي (إن كان نشطاً) — مسار عام بدون تسجيل دخول، تستدعيه
 * الصفحة الرئيسية عند التحميل لعرض نافذة منبثقة لكل زائر. يرجع
 * announcement: null بهدوء لو ما فيه إعلان نشط (لا خطأ).
 */
function handleGetAnnouncement(req, res) {
  sendJson(res, 200, { success: true, announcement: announcementService.getActiveAnnouncement() });
}

/**
 * نشر/تحديث أو إزالة الإعلان — الأدمن فقط. body.active === false يزيل
 * الإعلان الحالي فوراً (يُبقي نصه محفوظاً للتعديل لاحقاً)؛ أي شيء آخر
 * يُعامَل كنشر/تحديث كامل (body.text إلزامي، body.imageFilename اختياري).
 */
function handleAdminSetAnnouncement(req, res, body) {
  if (body.active === false) {
    sendJson(res, 200, announcementService.clearAnnouncement());
    return;
  }
  var result = announcementService.setAnnouncement(body.text, body.imageFilename);
  sendJson(res, result.success ? 200 : 400, result);
}

/* -----------------------------------------------------------------------
 * المقتنيات (إطارات + دخوليات) والنقاط.
 * ----------------------------------------------------------------------- */

function handleAdminGetCatalog(req, res) {
  sendJson(res, 200, {
    success: true,
    catalog: collectiblesService.getCatalog(),
    customFrames: collectiblesService.listCustomFrames()
  });
}

function handleAdminUpdateCatalog(req, res, body) {
  var result = collectiblesService.updateCatalogEntry(body.slug, {
    displayNameAr: body.displayNameAr,
    levelPointsRequired: body.levelPointsRequired,
    defaultEntranceTemplate: body.defaultEntranceTemplate,
    defaultEntranceText: body.defaultEntranceText
  });
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminCreateCustomFrame(req, res, body) {
  var result = collectiblesService.createCustomFrame(body.imageFilename, body.displayNameAr);
  sendJson(res, result.success ? 201 : 400, result);
}

/**
 * منح إطار (كتالوج أو حصري) لأي مستخدم يحدده الأدمن. body.entranceTemplate/
 * body.entranceText اختياريان — لو الإطار من الأربعة "الخاصة" ولم
 * تُمرَّرا، تُستخدَم قيم frame_catalog الافتراضية تلقائياً.
 */
function handleAdminGrantFrame(req, res, body) {
  var result = collectiblesService.grantFrame(body.userId, body.frameType, body.frameRef, {
    grantedBy: 'admin_manual',
    entranceTemplate: body.entranceTemplate,
    entranceText: body.entranceText
  });
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminRevokeFrame(req, res, body) {
  var result = collectiblesService.revokeFrame(body.userId, body.frameType, body.frameRef);
  sendJson(res, 200, result);
}

/**
 * تعيين/إزالة دخولية مستخدم يدوياً — مستقل تماماً عن أي إطار.
 * body.clear === true يزيلها.
 */
function handleAdminSetEntrance(req, res, body) {
  if (body.clear) {
    sendJson(res, 200, collectiblesService.clearEntrance(body.userId));
    return;
  }
  var result = collectiblesService.setEntrance(body.userId, body.templateKey, body.entranceText, 'admin_manual');
  sendJson(res, 200, result);
}

/** صاحب الحساب نفسه يفعّل أحد إطاراته المملوكة كإطاره الظاهر الوحيد. */
function handleEquipFrame(req, res, body, user) {
  var result = collectiblesService.setEquipped(user.id, body.frameType, body.frameRef);
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * تفعيل/إيقاف ذاتي للدخولية — نفس نمط handleEquipFrame (user.id من
 * الجلسة نفسها). body.enabled: true/false.
 */
function handleToggleEntrance(req, res, body, user) {
  var result = collectiblesService.setEntranceEnabled(user.id, Boolean(body.enabled));
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * تُستدعى من dashboard-core عند إنهاء جولة. body.participants: مصفوفة
 * {tiktokUsername, won}. كل مشارك يُطابَق بحساب مسجَّل موثَّق تيك توك قبل
 * منح أي نقاط — لا نقاط لمن لا حساب له، بصمت.
 */
function handleRoundComplete(req, res, body) {
  var participants = Array.isArray(body.participants) ? body.participants : [];
  var durationMs = Number(body.durationMs) || 0;
  var results = [];
  participants.forEach(function (p) {
    var matched = authService.findVerifiedUserByTikTok(p && p.tiktokUsername);
    if (!matched) return;
    var award = pointsService.awardForRoundCompletion(matched.id, { won: Boolean(p.won), durationMs: durationMs });
    results.push({ tiktokUsername: p.tiktokUsername, userId: matched.id, added: award.added, totalPoints: award.totalPoints });
  });
  sendJson(res, 200, { success: true, awarded: results });
}

/* -----------------------------------------------------------------------
 * مستوى الستريمر (SP).
 * ----------------------------------------------------------------------- */

/** عتبات مستويات SP الحالية — مسار عام، لا بيانات حساسة. */
function handleGetStreamerLevels(req, res) {
  sendJson(res, 200, { success: true, levels: streamerLevelService.listLevels() });
}

/** الأدمن فقط — تعديل عتبة/اسم مستوى SP موجود مسبقاً (لا إنشاء/حذف). */
function handleAdminUpdateStreamerLevel(req, res, body) {
  var ok = streamerLevelService.updateStreamerLevel(body.slug, {
    minSp: body.minSp,
    displayNameAr: body.displayNameAr
  });
  sendJson(res, ok ? 200 : 400, { success: ok, error: ok ? undefined : 'unknown_slug' });
}

/* -----------------------------------------------------------------------
 * حفلة ترحيب الستريمر الجديد.
 * ----------------------------------------------------------------------- */

/** يُستدعى من index.html بعد ما صاحب الحساب يكمل الحفلة كاملة فعلياً. */
function handleCompleteWelcome(req, res, body, user) {
  sendJson(res, 200, authService.completeWelcome(user.id));
}

/** الأدمن فقط — يصفّر حالة الترحيب لمستخدم معيّن. */
function handleAdminResetWelcome(req, res, body) {
  var result = authService.resetWelcome(body.userId);
  sendJson(res, result.success ? 200 : 400, result);
}

/* -----------------------------------------------------------------------
 * داعمو المنصة.
 * ----------------------------------------------------------------------- */

/** آخر N داعمين (افتراضياً 3، ?limit=N اختياري حتى 50) — مسار عام. */
function handleGetRecentSupporters(req, res) {
  var limit = 3;
  var n = parseInt(getQueryParam(req, 'limit'), 10);
  if (isFinite(n) && n > 0) limit = Math.min(n, 50);
  sendJson(res, 200, { success: true, supporters: supportersService.listRecent(limit) });
}

/** توب الداعمين (مجموع مبالغ كل اسم) — مسار عام. */
function handleGetTopSupporters(req, res) {
  sendJson(res, 200, { success: true, supporters: supportersService.listTop(50) });
}

/** الأدمن فقط — كل صفوف الدعم (لوحة الإدارة بـadmin.html). */
function handleAdminListSupporters(req, res) {
  sendJson(res, 200, { success: true, supporters: supportersService.listAll(200) });
}

/** الأدمن فقط — إضافة دعم جديد يدوياً. */
function handleAdminAddSupporter(req, res, body) {
  var result = supportersService.addSupporter(body.name, body.message, body.amount, body.customId);
  sendJson(res, result.success ? 201 : 400, result);
}

/** الأدمن فقط — حذف صف دعم واحد (تصحيح خطأ إدخال يدوي). */
function handleAdminDeleteSupporter(req, res, body) {
  sendJson(res, 200, supportersService.deleteSupporter(body.id));
}

/** الأدمن فقط — بحث عن حساب عبر ?customId=... لعرض معاينة قبل ربطه بصف دعم. */
function handleAdminFindSupporterUser(req, res) {
  var customId = getQueryParam(req, 'customId');
  var result = supportersService.findUserForLinking(customId);
  sendJson(res, result.success ? 200 : 404, result);
}

/* -----------------------------------------------------------------------
 * شركاء الإبداع.
 * ----------------------------------------------------------------------- */

/** عام بدون تسجيل دخول — قسم "شركاء الإبداع" بالصفحة الرئيسية. */
function handleGetPartners(req, res) {
  sendJson(res, 200, { success: true, partners: partnersService.getPartnersPublic() });
}

/** الأدمن فقط — كل شركاء الإبداع (لوحة الإدارة). */
function handleAdminListPartners(req, res) {
  sendJson(res, 200, { success: true, partners: partnersService.listPartnersAdmin() });
}

/** الأدمن فقط — ربط حساب (عبر custom_id) كشريك إبداع بفئة معيّنة. */
function handleAdminAddPartner(req, res, body) {
  var result = partnersService.addPartnerByCustomId(body.customId, body.category);
  sendJson(res, result.success ? 201 : 400, result);
}

/** الأدمن فقط — حذف ربط شريك إبداع واحد. */
function handleAdminDeletePartner(req, res, body) {
  sendJson(res, 200, partnersService.removePartner(body.id));
}

/* -----------------------------------------------------------------------
 * ثيم المناسبات.
 * ----------------------------------------------------------------------- */

/** الثيم الحالي (إن كان نشطاً) — مسار عام. theme: null بهدوء لو غير مفعَّل. */
function handleGetTheme(req, res) {
  sendJson(res, 200, { success: true, theme: siteThemeService.getActiveTheme() });
}

/** الأدمن فقط — تفعيل/تحديث ثيم المناسبة الحالي. */
function handleAdminSetTheme(req, res, body) {
  var result = siteThemeService.setTheme(body.presetKey, body.accent, body.accent2, body.accentPink);
  sendJson(res, result.success ? 200 : 400, result);
}

/** الأدمن فقط — تعطيل الثيم فوراً (رجوع للألوان الافتراضية). */
function handleAdminClearTheme(req, res) {
  sendJson(res, 200, siteThemeService.clearTheme());
}

/** أعلى الاستريمرز بالساعات — عام. ?limit=<n> اختياري، محدود بـ50. */
function handleTopStreamers(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, streamers: authService.getTopStreamersByHours(limit) });
}

/** أعلى اللاعبين بعدد مرات الفوز — عام، لبطاقة "الأكثر نشاطاً" بالصفحة الرئيسية. */
function handleTopPlayersByWins(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, players: pointsService.getTopPlayersByWins(limit) });
}

/** أعلى اللاعبين بساعات اللعب الفعلية — عام. */
function handleTopPlayersByHours(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, players: pointsService.getTopPlayersByHours(limit) });
}

/** الأدمن فقط — إحصائيات الاستريمرز المجمَّعة. */
function handleAdminStreamerStats(req, res) {
  sendJson(res, 200, { success: true, stats: authService.getAdminStreamerStats() });
}

/** الأدمن فقط — إحصائيات المستخدمين المجمَّعة. */
function handleAdminUserStats(req, res) {
  sendJson(res, 200, { success: true, stats: authService.getAdminUserStats() });
}

/** صاحب الجلسة يعدّل اسم العرض الخاص به — user.id من الجلسة حصراً. */
function handleUpdateDisplayName(req, res, body, user) {
  var result = authService.updateDisplayName(user.id, body.displayName);
  sendJson(res, result.success ? 200 : 400, result);
}

/** صاحب الجلسة يعدّل صورة بروفايله — Data URL كامل (base64) من المتصفح. */
function handleUpdateAvatar(req, res, body, user) {
  var result = authService.updateAvatarImage(user.id, body.imageDataUrl);
  sendJson(res, result.success ? 200 : 400, result);
}

/* -----------------------------------------------------------------------
 * المُوجِّه الرئيسي
 * ----------------------------------------------------------------------- */

/**
 * إيجاد المسار المطابق لطريقة + مسار طلب معيّن.
 * @param {string} method
 * @param {string} pathname
 * @returns {Object|null}
 */
function matchRoute(method, pathname) {
  for (var i = 0; i < ROUTES.length; i++) {
    if (ROUTES[i].method === method && ROUTES[i].path === pathname) return ROUTES[i];
  }
  return null;
}

/**
 * نقطة الدخول الوحيدة — تُستدعى من server.js لكل طلب "/api/*". تتكفّل
 * بـ CORS، الـ Preflight، تحليل الجسم، فحص Auth/Admin، ومعالجة الأخطاء دفاعياً.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handle(req, res) {
  response.applyCors(req, res, config);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  var pathname = (req.url || '').split('?')[0];
  var route = matchRoute(req.method, pathname);

  if (!route) {
    sendJson(res, 404, { success: false, error: 'not_found' });
    return;
  }

  var token = extractBearerToken(req);

  // فحص Auth "اختياري" دائماً — حتى المسارات العامة تعرف هوية المُرسِل
  // لو أرفق Token صالحاً (مثال: handlePublicProfile يحتاج يعرف "هل هذا
  // صاحب الحساب؟"). المسارات المحمية (requireAuth: true) ترفض 401 كالعادة.
  var user = requireUser(req);

  if (route.requireAuth) {
    if (!user) {
      sendJson(res, 401, { success: false, error: 'unauthorized' });
      return;
    }
    if (route.requireAdmin && user.role !== 'admin') {
      sendJson(res, 403, { success: false, error: 'forbidden' });
      return;
    }
  }

  bodyParser.readJsonBody(req).then(function (body) {
    return route.handler(req, res, body || {}, user, token);
  }).catch(function (err) {
    if (err && (err.message === 'invalid_json' || err.message === 'body_too_large')) {
      sendJson(res, 400, { success: false, error: err.message });
      return;
    }
    logger.error('Auth Router: unhandled error on ' + route.method + ' ' + route.path + ':', err);
    if (!res.headersSent) sendJson(res, 500, { success: false, error: 'internal_error' });
  });
}

module.exports = {
  handle: handle
};
