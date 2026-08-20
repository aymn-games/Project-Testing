/**
 * ==========================================================================
 * AGP AUTH ROUTER — يوصّل backend/auth/auth-service.js بواجهة HTTP فعلية
 * ==========================================================================
 *
 * قبل هذا الملف: auth-service.js/database.js/password.js كانت منطقاً
 * كاملاً وجاهزاً (حسابات، جلسات، تحقق تيك توك، صلاحيات أدمن) لكن غير
 * موصول بأي شيء — لا مسار HTTP يستدعيه، ولا صفحة واجهة تستخدمه. هذا
 * الملف هو نقطة الربط الوحيدة؛ لا تعديل على auth-service.js نفسه.
 *
 * جدول مسارات بسيط + دالة `handle(req, res)` واحدة تُستدعى من
 * server.js لكل طلب يبدأ بـ "/api/". لا معرفة هنا بـ WebSocket أو
 * تيك توك أو أي شيء آخر في backend/ — مسؤولية واحدة: HTTP API للحسابات
 * والإدارة، راجع docs/BACKEND_ARCHITECTURE.md §10 للبروتوكول الكامل.
 * ==========================================================================
 */

'use strict';

var authService = require('../auth/auth-service');
var announcementService = require('../announcements/announcement-service');
var collectiblesService = require('../collectibles/collectibles-service');
var pointsService = require('../points/points-service');
var streamerLevelService = require('../points/streamer-level-service');
var supportersService = require('../supporters/supporters-service');
var siteThemeService = require('../theme/site-theme-service');
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
  { method: 'POST', path: '/api/auth/tiktok/verify', requireAuth: true, handler: handleTikTokVerify },
  { method: 'POST', path: '/api/auth/tiktok/unlink', requireAuth: true, handler: handleTikTokUnlink },
  { method: 'POST', path: '/api/auth/custom-id', requireAuth: true, handler: handleCustomId },
  // [0.45.6] اختيار نوع الحساب الإجباري (لاعب/استريمر) بعد أول دخول
  // بجوجل لحساب جديد كلياً — راجع choose-account-type.html.
  { method: 'POST', path: '/api/auth/account-type', requireAuth: true, handler: handleChooseAccountType },
  { method: 'GET', path: '/api/admin/users', requireAuth: true, requireAdmin: true, handler: handleAdminListUsers },
  { method: 'POST', path: '/api/admin/permissions', requireAuth: true, requireAdmin: true, handler: handleAdminSetPermission },
  { method: 'POST', path: '/api/admin/custom-id', requireAuth: true, requireAdmin: true, handler: handleAdminSetCustomId },
  // [0.45.6] حذف حساب نهائياً (لاعب أو ستريمر) — زر بـadmin.html.
  { method: 'POST', path: '/api/admin/users/delete', requireAuth: true, requireAdmin: true, handler: handleAdminDeleteUser },
  // [0.45.6] تصفير قيد الجهاز الواحد لستريمر معتمد — صمام أمان يدوي.
  { method: 'POST', path: '/api/admin/reset-device-lock', requireAuth: true, requireAdmin: true, handler: handleAdminResetDeviceLock },
  { method: 'GET', path: '/api/profile', requireAuth: false, handler: handlePublicProfile },
  { method: 'GET', path: '/api/announcement', requireAuth: false, handler: handleGetAnnouncement },
  { method: 'POST', path: '/api/admin/announcement', requireAuth: true, requireAdmin: true, handler: handleAdminSetAnnouncement },
  // ---- المقتنيات (إطارات + دخوليات) والنقاط — راجع
  // backend/collectibles/collectibles-service.js وbackend/points/points-service.js
  { method: 'GET', path: '/api/admin/collectibles/catalog', requireAuth: true, requireAdmin: true, handler: handleAdminGetCatalog },
  { method: 'POST', path: '/api/admin/collectibles/catalog', requireAuth: true, requireAdmin: true, handler: handleAdminUpdateCatalog },
  { method: 'POST', path: '/api/admin/collectibles/custom-frame', requireAuth: true, requireAdmin: true, handler: handleAdminCreateCustomFrame },
  { method: 'POST', path: '/api/admin/collectibles/grant', requireAuth: true, requireAdmin: true, handler: handleAdminGrantFrame },
  { method: 'POST', path: '/api/admin/collectibles/revoke', requireAuth: true, requireAdmin: true, handler: handleAdminRevokeFrame },
  { method: 'POST', path: '/api/admin/entrance', requireAuth: true, requireAdmin: true, handler: handleAdminSetEntrance },
  { method: 'POST', path: '/api/collectibles/equip', requireAuth: true, handler: handleEquipFrame },
  { method: 'POST', path: '/api/points/round-complete', requireAuth: true, handler: handleRoundComplete },
  // ---- [0.45.0] تفعيل/إيقاف الدخولية ذاتياً من صاحب الحساب — راجع
  // backend/collectibles/collectibles-service.js (setEntranceEnabled).
  // نفس نمط handleEquipFrame أدناه بالضبط (صاحب الجلسة فقط، user.id من
  // الجلسة نفسها لا من body، حتى ما يقدر أحد يبدّل دخولية غيره).
  { method: 'POST', path: '/api/entrance/toggle', requireAuth: true, handler: handleToggleEntrance },
  // ---- [0.45.0] مستوى الستريمر (SP) — راجع
  // backend/points/streamer-level-service.js. القراءة العامة لعتبات
  // المستويات مسموحة بدون تسجيل دخول (نفس فلسفة /api/announcement) —
  // لا بيانات حساسة هنا، فقط عتبات SP الثابتة للعرض. التعديل أدمن فقط.
  { method: 'GET', path: '/api/streamer-levels', requireAuth: false, handler: handleGetStreamerLevels },
  { method: 'POST', path: '/api/admin/streamer-levels', requireAuth: true, requireAdmin: true, handler: handleAdminUpdateStreamerLevel },
  // ---- حفلة ترحيب الستريمر الجديد — راجع docs/CHANGELOG.md
  { method: 'POST', path: '/api/auth/welcome/complete', requireAuth: true, handler: handleCompleteWelcome },
  { method: 'POST', path: '/api/admin/welcome/reset', requireAuth: true, requireAdmin: true, handler: handleAdminResetWelcome },
  // ---- داعمو المنصة — إدخال يدوي من الأدمن حالياً، راجع
  // backend/supporters/supporters-service.js وdocs/CHANGELOG.md
  { method: 'GET', path: '/api/supporters/recent', requireAuth: false, handler: handleGetRecentSupporters },
  { method: 'GET', path: '/api/supporters/top', requireAuth: false, handler: handleGetTopSupporters },
  { method: 'GET', path: '/api/admin/supporters', requireAuth: true, requireAdmin: true, handler: handleAdminListSupporters },
  { method: 'POST', path: '/api/admin/supporters', requireAuth: true, requireAdmin: true, handler: handleAdminAddSupporter },
  { method: 'POST', path: '/api/admin/supporters/delete', requireAuth: true, requireAdmin: true, handler: handleAdminDeleteSupporter },
  // [0.45.14] معاينة حيّة (اسم+صورة) لحساب قبل ربطه بصف دعم — راجع
  // supportersService.findUserForLinking.
  { method: 'GET', path: '/api/admin/supporters/find-user', requireAuth: true, requireAdmin: true, handler: handleAdminFindSupporterUser },
  // ---- ثيم المناسبات — راجع backend/theme/site-theme-service.js
  { method: 'GET', path: '/api/theme', requireAuth: false, handler: handleGetTheme },
  { method: 'POST', path: '/api/admin/theme', requireAuth: true, requireAdmin: true, handler: handleAdminSetTheme },
  { method: 'POST', path: '/api/admin/theme/clear', requireAuth: true, requireAdmin: true, handler: handleAdminClearTheme },
  // ---- [0.45.10] شريط "أكثر الاستريمرز ساعات" بالصفحة الرئيسية — عام
  // بدون تسجيل دخول (نفس فلسفة /api/announcement و/api/theme)، يرجع
  // فقط يوزرنيم تيك توك + ساعات، بدون أي بيانات حساب حساسة.
  { method: 'GET', path: '/api/public/top-streamers', requireAuth: false, handler: handleTopStreamers },
  // ---- [0.45.10] إحصائيات لوحة الأدمن — راجع backend/auth/auth-service.js
  // (getAdminStreamerStats/getAdminUserStats) للملاحظات الصادقة حول
  // دقة "إجمالي المشاهدات" (غير مؤكَّدة ضد بث حقيقي من هذه البيئة).
  { method: 'GET', path: '/api/admin/stats/streamers', requireAuth: true, requireAdmin: true, handler: handleAdminStreamerStats },
  { method: 'GET', path: '/api/admin/stats/users', requireAuth: true, requireAdmin: true, handler: handleAdminUserStats },
  // ---- [0.45.10] تعديل بروفايل المستخدم (اسم عرض + صورة) — صاحب
  // الجلسة فقط (user.id من الجلسة، لا من body، حتى ما يقدر أحد يعدّل
  // بروفايل غيره — نفس نمط handleEquipFrame/handleToggleEntrance).
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
  // [0.45.6] body.deviceId اختياري — يؤثر فقط على حسابات ستريمر معتمدة
  // (can_run_games)، راجع authService.checkDeviceLock. خطأ 'device_locked'
  // يُرجَع بـ403 (مو 401 — بيانات الدخول صحيحة، فقط الجهاز مرفوض).
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

/**
 * إلغاء ربط تيك توك يدوياً — بطلب صريح من صاحب الحساب فقط (زر "إلغاء
 * الربط" بصفحة البروفايل). لا علاقة له بأي فحص تلقائي دوري — غير
 * موجود أصلاً. راجع authService.unlinkTikTok وdocs/CHANGELOG.md.
 */
function handleTikTokUnlink(req, res, body, user) {
  var result = authService.unlinkTikTok(user.id);
  sendJson(res, 200, result);
}

function handleCustomId(req, res, body, user) {
  var result = authService.setCustomId(user.id, body.customId);
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * [0.45.6] اختيار نوع الحساب الإجباري (لاعب/استريمر) — user.id من الجلسة
 * نفسها دائماً (مو من body)، حتى ما يقدر أي مستخدم يبدّل نوع حساب غيره.
 */
function handleChooseAccountType(req, res, body, user) {
  var result = authService.chooseAccountType(user.id, Boolean(body.wantsToBeStreamer));
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminListUsers(req, res) {
  sendJson(res, 200, { success: true, users: authService.listAllUsersWithStats() });
}

/**
 * ⚠️ منح تلقائي مرتبط: تفعيل صلاحية can_run_games تحديداً (وليس أي
 * صلاحية أخرى) يمنح تلقائياً إطار "streamer" الخاص (+ دخولية + توهج
 * تلقائياً معه، راجع frame_catalog.bundles_entrance) — هذا هو "الإطار
 * التلقائي" المتفَق عليه: لا يُمنح عند مجرد إنشاء الحساب كستريمر
 * (is_streamer)، فقط عند موافقة الأدمن الفعلية على تشغيل الألعاب. تعطيل
 * الصلاحية لاحقاً **لا يسحب الإطار تلقائياً** (قرار منتج: الإطار إنجاز
 * مكتسب، سحبه يحتاج فعل يدوي صريح من الأدمن عبر /api/admin/collectibles/revoke).
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

/** [0.45.6] الأدمن فقط — حذف حساب نهائياً (لاعب أو ستريمر). راجع authService.deleteUser. */
function handleAdminDeleteUser(req, res, body) {
  var result = authService.deleteUser(body.userId);
  sendJson(res, result.success ? 200 : 400, result);
}

/** [0.45.6] الأدمن فقط — تصفير قيد الجهاز الواحد لستريمر معتمد. */
function handleAdminResetDeviceLock(req, res, body) {
  var result = authService.adminResetDeviceLock(body.userId);
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * بروفايل عبر ?id=<custom_id> بالرابط — بدون تسجيل دخول إلزامي (مسار
 * الوحيد بالراوتر اللي يقرأ query string). **الخصوصية**: لا عرض علني
 * لبروفايل أي أحد بعد الآن — البيانات الكاملة (إحصائيات، تيك توك...)
 * تُرسَل فقط لصاحب الحساب نفسه أو للأدمن؛ أي طرف آخر (زائر أو حساب
 * مختلف) يستلم فقط username/custom_id، بقية الحقول (role, stats,
 * tiktok...) undefined عمداً. راجع docs/CHANGELOG.md.
 */
function handlePublicProfile(req, res, body, user) {
  var queryString = (req.url || '').split('?')[1] || '';
  var customId = '';
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === 'id') customId = decodeURIComponent(kv[1] || '');
  });
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
 * المقتنيات (إطارات + دخوليات) والنقاط — كل Handler يستدعي دالة واحدة
 * موجودة أصلاً في collectiblesService/pointsService، بدون منطق هنا.
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
 * تعيين/إزالة دخولية مستخدم يدوياً — مستقل تماماً عن أي إطار (يُستخدَم
 * لإعطاء دخولية لمستخدم لا يملك أحد الإطارات الأربعة "الخاصة"، أو
 * لتخصيص نص/نموذج مختلف عن الافتراضي). body.clear === true يزيلها.
 */
function handleAdminSetEntrance(req, res, body) {
  if (body.clear) {
    sendJson(res, 200, collectiblesService.clearEntrance(body.userId));
    return;
  }
  var result = collectiblesService.setEntrance(body.userId, body.templateKey, body.entranceText, 'admin_manual');
  sendJson(res, 200, result);
}

/**
 * صاحب الحساب نفسه يفعّل أحد إطاراته المملوكة كإطاره الظاهر الوحيد —
 * راجع Q4 بخصوص تصميم المقتنيات: "المستخدم يفعّل من بروفايله الخاص".
 */
function handleEquipFrame(req, res, body, user) {
  var result = collectiblesService.setEquipped(user.id, body.frameType, body.frameRef);
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * [0.45.0] تفعيل/إيقاف ذاتي للدخولية — نفس نمط handleEquipFrame تماماً
 * (user.id من الجلسة نفسها، لا من body). body.enabled: true/false.
 * يرجع {success:false, error:'no_entrance'} بهدوء لو المستخدم ما عنده
 * دخولية أصلاً (لا شيء لتفعيله/إيقافه).
 */
function handleToggleEntrance(req, res, body, user) {
  var result = collectiblesService.setEntranceEnabled(user.id, Boolean(body.enabled));
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * تُستدعى من dashboard-core عند إنهاء جولة (راجع dashboard-core/js/
 * dashboard-core.js — NS.components.round.end). body.participants: مصفوفة
 * {tiktokUsername, won}. كل مشارك يُطابَق بحساب مسجَّل موثَّق تيك توك
 * (findVerifiedUserByTikTok) قبل منح أي نقاط — لا نقاط لمن لا حساب له
 * أو لم يوثّق تيك توك، بصمت (لا خطأ، هذا سلوك متوقَّع وليس استثنائياً).
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
 * [0.45.0] مستوى الستريمر (SP) — راجع backend/points/streamer-level-service.js
 * ----------------------------------------------------------------------- */

/**
 * عتبات مستويات SP الحالية — مسار عام (لا بيانات حساسة، فقط جدول
 * عتبات ثابت)، يُستخدَم لو أردنا لاحقاً عرضه بصفحة عامة (مثل "كيف تكسب
 * SP؟" المشابهة لقسم XP الحالي بالبروفايل).
 */
function handleGetStreamerLevels(req, res) {
  sendJson(res, 200, { success: true, levels: streamerLevelService.listLevels() });
}

/**
 * الأدمن فقط — تعديل عتبة/اسم مستوى SP موجود مسبقاً (7 مستويات ثابتة
 * العدد، نفس فلسفة frame_catalog.level — لا إنشاء/حذف هنا).
 */
function handleAdminUpdateStreamerLevel(req, res, body) {
  var ok = streamerLevelService.updateStreamerLevel(body.slug, {
    minSp: body.minSp,
    displayNameAr: body.displayNameAr
  });
  sendJson(res, ok ? 200 : 400, { success: ok, error: ok ? undefined : 'unknown_slug' });
}

/* -----------------------------------------------------------------------
 * حفلة ترحيب الستريمر الجديد — راجع docs/CHANGELOG.md
 * ----------------------------------------------------------------------- */

/**
 * يُستدعى من index.html بعد ما صاحب الحساب يكمل الحفلة كاملة فعلياً
 * (كل السلايدات + قص الشريطة + العد التنازلي) — من user.id بالجلسة
 * نفسها، مو من body، حتى ما يقدر أي مستخدم يعلّم حساب غيره كمكتمل.
 */
function handleCompleteWelcome(req, res, body, user) {
  sendJson(res, 200, authService.completeWelcome(user.id));
}

/**
 * الأدمن فقط — يصفّر حالة الترحيب لمستخدم معيّن (زر "إعادة الترحيب"
 * بجدول admin.html، بجانب صلاحية الألعاب لكل مستخدم).
 */
function handleAdminResetWelcome(req, res, body) {
  var result = authService.resetWelcome(body.userId);
  sendJson(res, result.success ? 200 : 400, result);
}

/* -----------------------------------------------------------------------
 * داعمو المنصة — راجع backend/supporters/supporters-service.js
 * ----------------------------------------------------------------------- */

/**
 * آخر N داعمين (افتراضياً 3) — مسار عام بدون تسجيل دخول، يستدعيه
 * index.html للشريط المتحرك بدل نص "لتفعيل الاشتراك..." القديم (بدون
 * ?limit، يبقى بنفس السلوك القديم تماماً: 3 فقط). [0.45.14]: أضيف دعم
 * اختياري لـ?limit=N (محدود بـ50 كحد أقصى دفاعي) حتى تقدر
 * top-supporters.html تطلب قائمة أطول لتبويب "أحدث الداعمين" — نفس
 * نمط قراءة query string في handlePublicProfile أعلاه.
 */
function handleGetRecentSupporters(req, res) {
  var queryString = (req.url || '').split('?')[1] || '';
  var limit = 3;
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === 'limit') {
      var n = parseInt(decodeURIComponent(kv[1] || ''), 10);
      if (isFinite(n) && n > 0) limit = Math.min(n, 50);
    }
  });
  sendJson(res, 200, { success: true, supporters: supportersService.listRecent(limit) });
}

/**
 * توب الداعمين (مجموع مبالغ كل اسم) — مسار عام، تستدعيه صفحة
 * top-supporters.html الجديدة.
 */
function handleGetTopSupporters(req, res) {
  sendJson(res, 200, { success: true, supporters: supportersService.listTop(50) });
}

/** الأدمن فقط — كل صفوف الدعم (لوحة الإدارة بـadmin.html). */
function handleAdminListSupporters(req, res) {
  sendJson(res, 200, { success: true, supporters: supportersService.listAll(200) });
}

/**
 * الأدمن فقط — إضافة دعم جديد يدوياً بعد ما يشوفه فعلياً بلوحة تحكم
 * كريترز (لا ربط تلقائي بعد — راجع تعليق أعلى supporters-service.js).
 */
function handleAdminAddSupporter(req, res, body) {
  var result = supportersService.addSupporter(body.name, body.message, body.amount, body.customId);
  sendJson(res, result.success ? 201 : 400, result);
}

/** الأدمن فقط — حذف صف دعم واحد (تصحيح خطأ إدخال يدوي). */
function handleAdminDeleteSupporter(req, res, body) {
  sendJson(res, 200, supportersService.deleteSupporter(body.id));
}

/**
 * [0.45.14] الأدمن فقط — بحث عن حساب عبر ?customId=... لعرض معاينة
 * حيّة (اسم+صورة) قبل تأكيد ربطه بصف دعم. نفس نمط قراءة query string
 * المستخدَم بـhandlePublicProfile أعلاه (المسار الوحيد الآخر الذي
 * يقرأ query string بهذا الراوتر).
 */
function handleAdminFindSupporterUser(req, res) {
  var queryString = (req.url || '').split('?')[1] || '';
  var customId = '';
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === 'customId') customId = decodeURIComponent(kv[1] || '');
  });
  var result = supportersService.findUserForLinking(customId);
  sendJson(res, result.success ? 200 : 404, result);
}

/* -----------------------------------------------------------------------
 * ثيم المناسبات — راجع backend/theme/site-theme-service.js
 * ----------------------------------------------------------------------- */

/**
 * الثيم الحالي (إن كان نشطاً) — مسار عام بدون تسجيل دخول، تستدعيه
 * index.html عند التحميل ليطبّق الألوان فوراً. theme: null بهدوء لو
 * غير مفعَّل (لا خطأ) — الموقع يبقى بألوانه الافتراضية.
 */
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

/**
 * [0.45.10] أعلى الاستريمرز بالساعات — عام، لشريط الصفحة الرئيسية.
 * ?limit=<n> اختياري (افتراضي 20 من authService، يُحدَّد هنا بحد أقصى
 * 50 دفاعياً حتى لو طُلب رقم أكبر أو غير صالح).
 */
function handleTopStreamers(req, res) {
  var queryString = (req.url || '').split('?')[1] || '';
  var limitRaw = '';
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === 'limit') limitRaw = decodeURIComponent(kv[1] || '');
  });
  var limit = Math.min(50, Math.max(1, parseInt(limitRaw, 10) || 20));
  sendJson(res, 200, { success: true, streamers: authService.getTopStreamersByHours(limit) });
}

/** [0.45.10] الأدمن فقط — إحصائيات الاستريمرز المجمَّعة. */
function handleAdminStreamerStats(req, res) {
  sendJson(res, 200, { success: true, stats: authService.getAdminStreamerStats() });
}

/** [0.45.10] الأدمن فقط — إحصائيات المستخدمين المجمَّعة. */
function handleAdminUserStats(req, res) {
  sendJson(res, 200, { success: true, stats: authService.getAdminUserStats() });
}

/**
 * [0.45.10] صاحب الجلسة يعدّل اسم العرض الخاص به — user.id من الجلسة
 * حصراً (لا من body)، نفس نمط handleEquipFrame.
 */
function handleUpdateDisplayName(req, res, body, user) {
  var result = authService.updateDisplayName(user.id, body.displayName);
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * [0.45.10] صاحب الجلسة يعدّل صورة بروفايله — يستقبل Data URL كامل
 * (base64) جاهز من المتصفح، راجع authService.updateAvatarImage للحدود
 * (النوع/الحجم الأقصى).
 */
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
 * بـ CORS، الـ Preflight، تحليل الجسم، فحص Auth/Admin، ومعالجة الأخطاء
 * دفاعياً (لا throw غير ممسوك يوقف السيرفر بالكامل).
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

  // فحص Auth "اختياري" دائماً — حتى المسارات العامة (requireAuth: false)
  // تعرف الآن هوية المُرسِل لو أرفق Token صالحاً (مثال: handlePublicProfile
  // يحتاج يعرف "هل هذا صاحب الحساب؟" مع بقاء المسار عاماً وصولاً). هذا لا
  // يغيّر أي سلوك سابق: المسارات المحمية (requireAuth: true) ترفض 401
  // بالضبط كما كانت، والمسارات العامة تجاهلت "user" أصلاً قبل هذا التعديل.

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
