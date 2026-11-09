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
var challengeService = require('../challenge/challenge-service');
var pointsService = require('../points/points-service');
var streamerLevelService = require('../points/streamer-level-service');
var streamerHours = require('../points/streamer-hours');
var supportersService = require('../supporters/supporters-service');
var siteThemeService = require('../theme/site-theme-service');
var partnersService = require('../partners/partners-service');
var lettersCellQuestionsService = require('../letters-cell/letters-cell-questions-service');
var platformStatsService = require('../stats/platform-stats-service');
var supportService = require('../support/support-service');
var codenamesSpySlots = require('../codenames/spy-slots-service');
var storeRouter = require('./store-router');
var tiktokLiveCheck = require('../platforms/tiktok/tiktok-live-check');
var screenTests = require('../stats/screen-tests');
var liveSessionStats = require('../stats/live-session-stats');
var streamScreens = require('../stats/stream-screens-service');
var screenMedia = require('../stats/screen-media-service');
var screenAudio = require('../stats/screen-audio-service');
var hasAudioTools = require('../stats/screen-audio-design').hasAudioTools;
var usesDonations = require('../stats/screen-audio-design').usesDonations;
var mergeDonations = require('../streamlabs/donations-stats').mergeDonations;
var fs = require('fs');
var roomLookupService = require('../rooms/room-lookup-service');
var gamePrefsService = require('../game-prefs/game-prefs-service');
var remoteControlService = require('../remote-control/remote-control-service');
var logger = require('../utils/logger');
var chatLatency = require('../utils/chat-latency');
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
  // كلمة الدخول وأسماء/كلمات الفريقين المشتركة بين كل الألعاب — js/agp-shared-prefs.js
  { method: 'GET', path: '/api/game-prefs', requireAuth: true, handler: handleGetGamePrefs },
  { method: 'POST', path: '/api/game-prefs', requireAuth: true, handler: handleSaveGamePrefs },
  // «التحكم عن بعد» — الستريمر يدير المتحكمين، والمتحكم يشوف مين أعطاه صلاحية (remote-control/)
  { method: 'GET', path: '/api/remote-control/config', requireAuth: true, handler: handleGetRemoteControl },
  { method: 'POST', path: '/api/remote-control/config', requireAuth: true, handler: handleSaveRemoteControl },
  { method: 'GET', path: '/api/remote-control/access', requireAuth: true, handler: handleRemoteControlAccess },
  // كود نيمز: باركود خاص لكل سباي ماستر مرتبط بحسابه (codenames/spy-slots-service.js)
  { method: 'POST', path: '/api/codenames/spy-slots', requireAuth: true, handler: handleCodenamesSpySlots },
  { method: 'POST', path: '/api/codenames/spy-claim', requireAuth: true, handler: handleCodenamesSpyClaim },
  { method: 'POST', path: '/api/auth/tiktok/link', requireAuth: true, handler: handleTikTokLink },
  { method: 'POST', path: '/api/auth/tiktok/verification-code', requireAuth: true, handler: handleTikTokVerificationCode },
  // ---- تسجيل دخول تيك توك الرسمي (OAuth Login Kit) — البديل الموصى به
  // لطريقة كود البايو أعلاه. requireAuth: false بالاثنين لأنهما مسارا
  // تنقّل متصفح خام — لا يقدران يرفقان ترويسة Authorization، لذا نتحقق
  // من الجلسة يدوياً داخل handleTikTokOAuthStart عبر ?token=.
  { method: 'GET', path: '/api/auth/tiktok/oauth/start', requireAuth: false, handler: handleTikTokOAuthStart },
  // البديل الآمن لـoauth/start: الجلسة بهيدر Authorization (مو بالرابط)، ويرجع رابط تيك توك كـJSON.
  { method: 'POST', path: '/api/auth/tiktok/oauth/url', requireAuth: true, handler: handleTikTokOAuthUrl },
  // الدخول/إنشاء حساب بتيك توك من login.html (بدون جلسة) — نفس الـcallback أعلاه.
  { method: 'GET', path: '/api/auth/tiktok/oauth/login-start', requireAuth: false, handler: handleTikTokLoginStart },
  { method: 'GET', path: '/api/auth/tiktok/oauth/callback', requireAuth: false, handler: handleTikTokOAuthCallback },
  { method: 'POST', path: '/api/auth/tiktok/verify', requireAuth: true, handler: handleTikTokVerify },
  { method: 'POST', path: '/api/auth/tiktok/unlink', requireAuth: true, handler: handleTikTokUnlink },
  { method: 'POST', path: '/api/auth/custom-id', requireAuth: true, handler: handleCustomId },
  // اختيار نوع الحساب الإجباري بعد أول دخول بجوجل لحساب جديد كلياً.
  { method: 'POST', path: '/api/auth/account-type', requireAuth: true, handler: handleChooseAccountType },
  // استرجاع كلمة المرور — خطوتين، بدون Auth (المستخدم أصلاً خارج جلسته).
  { method: 'POST', path: '/api/auth/forgot-password', requireAuth: false, handler: handleForgotPassword },
  { method: 'POST', path: '/api/auth/reset-password', requireAuth: false, handler: handleResetPassword },
  { method: 'POST', path: '/api/auth/signup/send-code', requireAuth: false, handler: handleSignupSendCode },
  { method: 'POST', path: '/api/auth/recover-account', requireAuth: false, handler: handleRecoverAccount },
  { method: 'POST', path: '/api/auth/email/send-code', requireAuth: true, handler: handleEmailSendCode },
  { method: 'POST', path: '/api/auth/email/verify', requireAuth: true, handler: handleEmailVerify },
  { method: 'GET', path: '/api/admin/users', requireAuth: true, requireAdmin: true, handler: handleAdminListUsers },
  { method: 'GET', path: '/api/admin/users/lookup', requireAuth: true, requireAdmin: true, handler: handleAdminLookupUser },
  { method: 'POST', path: '/api/admin/permissions', requireAuth: true, requireAdmin: true, handler: handleAdminSetPermission },
  { method: 'POST', path: '/api/admin/custom-id', requireAuth: true, requireAdmin: true, handler: handleAdminSetCustomId },
  { method: 'POST', path: '/api/admin/email', requireAuth: true, requireAdmin: true, handler: handleAdminSetEmail },
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
  // أكواد استرداد الإطارات — توليد/عرض للأدمن، واسترداد لصاحب الحساب.
  { method: 'POST', path: '/api/admin/frame-codes/generate', requireAuth: true, requireAdmin: true, handler: handleAdminGenerateFrameCodes },
  { method: 'GET', path: '/api/admin/frame-codes', requireAuth: true, requireAdmin: true, handler: handleAdminListFrameCodes },
  { method: 'POST', path: '/api/admin/card-codes/generate', requireAuth: true, requireAdmin: true, handler: handleAdminGenerateCardCodes },
  { method: 'GET', path: '/api/admin/bundles', requireAuth: true, requireAdmin: true, handler: handleAdminListBundles },
  { method: 'POST', path: '/api/admin/bundles', requireAuth: true, requireAdmin: true, handler: handleAdminCreateBundle },
  { method: 'POST', path: '/api/admin/bundle-codes/generate', requireAuth: true, requireAdmin: true, handler: handleAdminGenerateBundleCodes },
  { method: 'POST', path: '/api/admin/codes/burn', requireAuth: true, requireAdmin: true, handler: handleAdminBurnCode },
  { method: 'POST', path: '/api/collectibles/redeem', requireAuth: true, handler: handleRedeemFrameCode },
  // تحدي البثوث — بحث عن خصم، دعوات، وقبول (المباراة نفسها عبر /ws/challenge).
  { method: 'GET', path: '/api/challenge/search', requireAuth: true, handler: handleChallengeSearch },
  { method: 'GET', path: '/api/challenge/inbox', requireAuth: true, handler: handleChallengeInbox },
  { method: 'POST', path: '/api/challenge/invite', requireAuth: true, handler: handleChallengeInvite },
  { method: 'POST', path: '/api/challenge/respond', requireAuth: true, handler: handleChallengeRespond },
  { method: 'POST', path: '/api/challenge/cancel', requireAuth: true, handler: handleChallengeCancel },
  // ألعاب twoStep (ركلات الترجيح): الخصم يضغط «جاهز» ثم المنشئ يدخل اللوبي.
  { method: 'POST', path: '/api/challenge/ready', requireAuth: true, handler: handleChallengeReady },
  { method: 'POST', path: '/api/challenge/start', requireAuth: true, handler: handleChallengeStart },
  { method: 'POST', path: '/api/challenge/presence', requireAuth: true, handler: handleChallengePresence },
  { method: 'GET', path: '/api/challenge/lobby', requireAuth: true, handler: handleChallengeLobby },
  { method: 'POST', path: '/api/challenge/join', requireAuth: true, handler: handleChallengeJoin },
  // أكواد "اختيار إطار" — توليد/عرض للأدمن، واستلام الإطار المختار للاعب.
  { method: 'POST', path: '/api/admin/choice-codes/generate', requireAuth: true, requireAdmin: true, handler: handleAdminGenerateChoiceCode },
  { method: 'GET', path: '/api/admin/choice-codes', requireAuth: true, requireAdmin: true, handler: handleAdminListChoiceCodes },
  { method: 'GET', path: '/api/admin/win-reward', requireAuth: true, requireAdmin: true, handler: handleAdminGetWinReward },
  { method: 'POST', path: '/api/admin/win-reward', requireAuth: true, requireAdmin: true, handler: handleAdminSetWinReward },
  { method: 'GET', path: '/api/collectibles/win-codes', requireAuth: true, handler: handleWinRewardCodes },
  { method: 'POST', path: '/api/collectibles/redeem-choice', requireAuth: true, handler: handleRedeemChoiceCode },
  { method: 'POST', path: '/api/points/round-complete', requireAuth: true, handler: handleRoundComplete },
  // ---- هل البث شغّال الحين؟ — مكتبة الألعاب والألعاب تقطع الاتصال المحفوظ
  // لما يرجع live:false (راجع backend/platforms/tiktok/tiktok-live-check.js).
  { method: 'GET', path: '/api/stream/is-live', requireAuth: true, handler: handleStreamIsLive },
  // زر «عرض إحصائيات البث» بمكتبة الألعاب — ملخص البث الحالي/الأخير (بالذاكرة).
  { method: 'GET', path: '/api/stream/session-stats', requireAuth: true, handler: handleStreamSessionStats },
  { method: 'GET', path: '/api/stream/stats-watch', requireAuth: true, handler: handleGetStatsWatch },
  { method: 'POST', path: '/api/stream/stats-watch', requireAuth: true, handler: handleSetStatsWatch },
  { method: 'GET', path: '/api/stream/recent-gifts', requireAuth: true, handler: handleStreamRecentGifts },
  { method: 'GET', path: '/api/stream/media', requireAuth: false, handler: handleStreamMedia },
  // «شاشات البث» (overlay/index.html) — كل شاشة لها رابط overlay/live.html?k= لـOBS/TikTok LIVE Studio.
  // راجع stats/stream-screens-service.js. الإدارة لحسابات الستريمر، والرابط يقرأ بالرمز بس.
  { method: 'GET', path: '/api/screens', requireAuth: true, handler: handleListScreens },
  { method: 'POST', path: '/api/screens/create', requireAuth: true, handler: handleCreateScreen },
  { method: 'POST', path: '/api/screens/save', requireAuth: true, handler: handleSaveScreen },
  { method: 'POST', path: '/api/screens/delete', requireAuth: true, handler: handleDeleteScreen },
  { method: 'POST', path: '/api/screens/new-key', requireAuth: true, handler: handleRotateScreenKey },
  // «أليرت الفيديو» (Veyro) — راجع stats/screen-media-service.js. الرفع جسمه الملف نفسه (rawBody)،
  // والملف يقراه رابط الشاشة بدون حساب بمعرّف عشوائي طويل.
  { method: 'GET', path: '/api/screens/media', requireAuth: true, handler: handleListScreenMedia },
  { method: 'POST', path: '/api/screens/media/upload', requireAuth: true, rawBody: true, handler: handleUploadScreenMedia },
  { method: 'POST', path: '/api/screens/media/delete', requireAuth: true, handler: handleDeleteScreenMedia },
  { method: 'POST', path: '/api/screens/media/update', requireAuth: true, handler: handleUpdateScreenMedia },
  { method: 'GET', path: '/api/screens/media/file', requireAuth: false, handler: handleScreenMediaFile },
  { method: 'GET', path: '/api/public/screen', requireAuth: false, handler: handlePublicScreenDesign },
  { method: 'GET', path: '/api/public/screen/stats', requireAuth: false, handler: handlePublicScreenStats },
  { method: 'GET', path: '/api/public/screen/gifts', requireAuth: false, handler: handlePublicScreenGifts },
  { method: 'GET', path: '/api/screens/live-status', requireAuth: true, handler: handleScreensLiveStatus },
  { method: 'POST', path: '/api/screens/test-alert', requireAuth: true, handler: handleScreenTestAlert },
  // أدوات الصوت (Veyro): القارئ الصوتي ومشغّل الأغاني — راجع stats/screen-audio-service.js.
  { method: 'GET', path: '/api/public/screen/music/search', requireAuth: false, handler: handlePublicScreenMusicSearch },
  { method: 'GET', path: '/api/public/screen/tts', requireAuth: false, handler: handlePublicScreenTts },
  { method: 'GET', path: '/api/screens/audio-key', requireAuth: true, handler: handleGetScreenAudioKey },
  { method: 'POST', path: '/api/screens/audio-key', requireAuth: true, handler: handleSetScreenAudioKey },
  // Streamlabs (الدونيشن — كريترز وغيره): ربط برمز Socket API — streamlabs/
  { method: 'GET', path: '/api/streamlabs', requireAuth: true, handler: handleStreamlabsState },
  { method: 'POST', path: '/api/streamlabs/link', requireAuth: true, handler: handleStreamlabsLink },
  { method: 'POST', path: '/api/streamlabs/unlink', requireAuth: true, handler: handleStreamlabsUnlink },
  { method: 'POST', path: '/api/streamlabs/reset', requireAuth: true, handler: handleStreamlabsReset },
  { method: 'POST', path: '/api/streamlabs/settings', requireAuth: true, handler: handleStreamlabsSettings },
  { method: 'GET', path: '/api/streamlabs/donations', requireAuth: true, handler: handleStreamlabsDonations },
  // زر «اربط Streamlabs» (OAuth) — يشتغل بس لما STREAMLABS_CLIENT_ID/SECRET موجودين
  { method: 'GET', path: '/api/streamlabs/oauth/start', requireAuth: true, handler: handleStreamlabsOAuthStart },
  { method: 'GET', path: '/api/streamlabs/oauth/callback', requireAuth: false, handler: handleStreamlabsOAuthCallback },
  // «اتصل بالبث» برئيسية Veyro: اتصال من السيرفر بيوزر تيك توك الموثّق — stats/screen-audio-watcher.js
  { method: 'GET', path: '/api/screens/connection', requireAuth: true, handler: handleScreenConnectionStatus },
  { method: 'POST', path: '/api/screens/connect', requireAuth: true, handler: handleScreenConnect },
  { method: 'POST', path: '/api/screens/disconnect', requireAuth: true, handler: handleScreenDisconnect },
  { method: 'GET', path: '/api/public/screen/events', requireAuth: false, handler: handlePublicScreenEvents },
  // زر «دخول غرفة» بالهيدر: أي لعبة فيها روم بهذا الرقم؟ (بدون حساب — الجوالات تدخل بدون تسجيل)
  { method: 'GET', path: '/api/rooms/lookup', requireAuth: false, handler: handleRoomLookup },
  // تفعيل/إيقاف الدخولية ذاتياً — نفس نمط handleEquipFrame (صاحب الجلسة فقط).
  { method: 'POST', path: '/api/entrance/toggle', requireAuth: true, handler: handleToggleEntrance },
  { method: 'POST', path: '/api/admin/elim-card', requireAuth: true, requireAdmin: true, handler: handleAdminSetElimCard },
  { method: 'POST', path: '/api/elim-card/toggle', requireAuth: true, handler: handleToggleElimCard },
  { method: 'POST', path: '/api/admin/win-card', requireAuth: true, requireAdmin: true, handler: handleAdminSetWinCard },
  { method: 'POST', path: '/api/win-card/toggle', requireAuth: true, handler: handleToggleWinCard },
  // شخصية الأنمي بالألعاب (بنت/ولد، أو null = عشوائي) — من المقتنيات بالبروفايل
  { method: 'POST', path: '/api/character/set', requireAuth: true, handler: handleSetCharacter },
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
  { method: 'GET', path: '/api/public/top-streamers-participations', requireAuth: false, handler: handleTopStreamersByParticipations },
  { method: 'GET', path: '/api/public/user-ranks', requireAuth: false, handler: handleUserRanks },
  { method: 'GET', path: '/api/public/top-players-wins', requireAuth: false, handler: handleTopPlayersByWins },
  { method: 'GET', path: '/api/public/top-players-hours', requireAuth: false, handler: handleTopPlayersByHours },
  { method: 'GET', path: '/api/public/top-players-rounds', requireAuth: false, handler: handleTopPlayersByRounds },
  // ---- أرقام حقيقية لقسم "الأرقام" بالصفحة الرئيسية — عام، مخزَّن مؤقتاً
  // (٣ أيام) بالسيرفر — راجع backend/stats/platform-stats-service.js
  { method: 'GET', path: '/api/public/platform-stats', requireAuth: false, handler: handleGetPlatformStats },
  // ---- البثوث الشغّالة الآن (بطاقات مكتبة الألعاب) — عام، حقول عامة فقط.
  { method: 'GET', path: '/api/public/live-streams', requireAuth: false, handler: handlePublicLiveStreams },
  // صورة الستريمر لبطاقات البث — ملف صورة مباشر (مو JSON) عشان يُستخدم في <img>.
  { method: 'GET', path: '/api/public/streamer-avatar', requireAuth: false, handler: handlePublicStreamerAvatar },
  // ---- إحصائيات لوحة الأدمن
  { method: 'GET', path: '/api/admin/stats/streamers', requireAuth: true, requireAdmin: true, handler: handleAdminStreamerStats },
  { method: 'GET', path: '/api/admin/stats/users', requireAuth: true, requireAdmin: true, handler: handleAdminUserStats },
  { method: 'GET', path: '/api/admin/live-streams', requireAuth: true, requireAdmin: true, handler: handleAdminLiveStreams },
  // ---- تعديل بروفايل المستخدم (اسم عرض + صورة) — صاحب الجلسة فقط.
  { method: 'POST', path: '/api/profile/display-name', requireAuth: true, handler: handleUpdateDisplayName },
  { method: 'POST', path: '/api/profile/username', requireAuth: true, handler: handleUpdateUsername },
  { method: 'POST', path: '/api/profile/avatar', requireAuth: true, handler: handleUpdateAvatar },
  // ---- مسودة بنك أسئلة "خلية الحروف" المشتركة — أدمن المنصة أو أي
  // مستخدم عنده can_manage_letters_cell (يُتحقَّق داخل كل handler لأنه
  // ليس requireAdmin بالمعنى العام، بل صلاحية جزئية تُمنح لأي شخص).
  { method: 'GET', path: '/api/letters-cell/questions-draft', requireAuth: true, handler: handleGetLettersCellQuestionsDraft },
  { method: 'POST', path: '/api/letters-cell/questions-draft', requireAuth: true, handler: handleSaveLettersCellQuestionsDraft },
  // ---- الدعم والاقتراحات (تذاكر) — راجع backend/support/support-service.js.
  // المستخدم يصل لتذاكره فقط (يُفرَض داخل الخدمة بـuser_id الجلسة).
  { method: 'POST', path: '/api/support/upload-signature', requireAuth: true, handler: handleSupportUploadSignature },
  { method: 'POST', path: '/api/support/tickets', requireAuth: true, handler: handleSupportCreateTicket },
  { method: 'GET', path: '/api/support/tickets', requireAuth: true, handler: handleSupportListTickets },
  { method: 'GET', path: '/api/support/unread-count', requireAuth: true, handler: handleSupportUnreadCount },
  { method: 'GET', path: '/api/support/ticket', requireAuth: true, handler: handleSupportGetTicket },
  { method: 'POST', path: '/api/support/ticket/reply', requireAuth: true, handler: handleSupportReply },
  { method: 'GET', path: '/api/admin/support/tickets', requireAuth: true, requireAdmin: true, handler: handleAdminSupportListTickets },
  { method: 'GET', path: '/api/admin/support/ticket', requireAuth: true, requireAdmin: true, handler: handleAdminSupportGetTicket },
  { method: 'POST', path: '/api/admin/support/ticket/reply', requireAuth: true, requireAdmin: true, handler: handleAdminSupportReply },
  { method: 'POST', path: '/api/admin/support/ticket/status', requireAuth: true, requireAdmin: true, handler: handleAdminSupportSetStatus }
].concat(storeRouter.routes); // المتجر — راجع http/store-router.js

/* -----------------------------------------------------------------------
 * Handlers — كل واحد يستدعي دالة واحدة موجودة أصلاً في auth-service.js
 * ----------------------------------------------------------------------- */

function handleSignup(req, res, body) {
  var result = authService.signup(body.username, body.email, body.password, Boolean(body.wantsToBeStreamer), body.emailCode);
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
  // body.identifier بدل email من «نسيت اليوزر أو الإيميل» (المستخدم ما يعرف إيميله)
  var result = authService.resetPasswordWithCode(body.email || body.identifier, body.code, body.newPassword);
  sendJson(res, result.success ? 200 : 400, result);
}

function codeResultStatus(result) {
  return result.success ? 200 : (result.error === 'code_resend_wait' ? 429 : 400);
}

/** خطوة ١ لإنشاء حساب — رمز تأكيد للإيميل. body: {username, email} */
function handleSignupSendCode(req, res, body) {
  return authService.sendSignupCode(body.username, body.email).then(function (result) {
    sendJson(res, codeResultStatus(result), result);
  });
}

/** نسيت اليوزر أو الإيميل. body: {identifier} — إيميل/آيدي/يوزر/يوزر تيك توك */
function handleRecoverAccount(req, res, body) {
  return authService.recoverAccount(body.identifier).then(function (result) {
    sendJson(res, result.success ? 200 : (result.error === 'code_resend_wait' ? 429 : result.error === 'account_not_found' ? 404 : 400), result);
  });
}

/** تأكيد/تغيير إيميل صاحب الجلسة. body: {email?} */
function handleEmailSendCode(req, res, body, user) {
  return authService.sendEmailVerification(user.id, body.email).then(function (result) {
    sendJson(res, codeResultStatus(result), result);
  });
}

function handleEmailVerify(req, res, body, user) {
  var result = authService.verifyEmail(user.id, body.code);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleLogout(req, res, body, user, token) {
  authService.logout(token);
  sendJson(res, 200, { success: true });
}

function handleMe(req, res, body, user) {
  sendJson(res, 200, { success: true, user: user });
}

/** شاشة لعب كود نيمز (حساب ستريمر) تسجّل خانات السباي ماستر لغرفتها. */
function handleCodenamesSpySlots(req, res, body, user) {
  var r = codenamesSpySlots.setSlots(user, String(body.room || ''), body.slots);
  if (!r.ok) {
    sendJson(res, r.error === 'forbidden' ? 403 : r.error === 'busy' ? 503 : 400, { success: false, error: r.error });
    return;
  }
  sendJson(res, 200, { success: true });
}

/** جوال سباي ماستر يطلب مفتاح خانته — يُعطى فقط لصاحب يوزر تيك توك الموثَّق. */
function handleCodenamesSpyClaim(req, res, body, user) {
  var r = codenamesSpySlots.claimSlot(user, String(body.room || ''), String(body.slot || ''));
  if (r.ok) { sendJson(res, 200, { success: true, team: r.team, name: r.name, key: r.key }); return; }
  if (r.error === 'not_owner') { sendJson(res, 200, { success: false, error: 'not_owner', name: r.name, team: r.team }); return; }
  sendJson(res, 404, { success: false, error: r.error });
}

function handleTikTokLink(req, res, body, user) {
  var result = authService.linkTikTokUsername(user.id, body.tiktokUsername);
  sendJson(res, result.success ? 200 : 400, result);
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

/**
 * رابط موافقة تيك توك لربط الحساب — الواجهة ترسل الجلسة بهيدر Authorization
 * وتنتقل للرابط بنفسها. أفضل من oauth/start?token= اللي يحط توكن الجلسة
 * بالرابط (يظهر بسجلات السيرفر وسجل المتصفح). oauth/start باقي للتوافق.
 */
function handleTikTokOAuthUrl(req, res, body, user) {
  sendJson(res, 200, { success: true, url: tiktokOAuthService.buildAuthorizeUrl(user.id) });
}

/** زر "الدخول بتيك توك" بـlogin.html — ?device=&next= ويحوّل لصفحة موافقة تيك توك. */
function handleTikTokLoginStart(req, res) {
  var queryString = (req.url || '').split('?')[1] || '';
  var params = new URLSearchParams(queryString);
  var authorizeUrl = tiktokOAuthService.buildLoginAuthorizeUrl(params.get('device'), params.get('next'));
  res.writeHead(302, { Location: authorizeUrl });
  res.end();
}

/**
 * دخول بتيك توك: يرجّع لـlogin.html — التوكن بالـhash (#) عشان ما يوصل
 * لأي سيرفر أو سجلات، والواجهة تحفظه (AGPAuth.completeTikTokLogin).
 */
async function finishTikTokLogin(res, statePayload, code) {
  function redirectToLogin(query, hash) {
    res.writeHead(302, { Location: config.frontendBaseUrl + '/login.html' + query + (hash || '') });
    res.end();
  }
  var next = statePayload.next ? '&next=' + encodeURIComponent(statePayload.next) : '';
  if (!code) return redirectToLogin('?tiktok_login=missing_code' + next);

  var tokenResult = await tiktokOAuthService.exchangeCodeForToken(code);
  if (!tokenResult.success) return redirectToLogin('?tiktok_login=token_exchange_failed' + next);

  var infoResult = await tiktokOAuthService.fetchTikTokUserInfo(tokenResult.accessToken);
  if (!infoResult.success) return redirectToLogin('?tiktok_login=user_info_failed' + next);

  var result = authService.loginWithTikTok(infoResult.user, tokenResult, statePayload.did);
  if (!result.success) return redirectToLogin('?tiktok_login=' + encodeURIComponent(result.error || 'login_failed') + next);

  await tiktokOAuthService.saveTikTokAvatarIfMissing(result.userId, infoResult.user);

  return redirectToLogin('?tiktok_login=success' + next, '#tiktok_token=' + encodeURIComponent(result.token));
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

  var statePayload = tiktokOAuthService.verifyState(state);
  if (statePayload && statePayload.mode === 'login') {
    if (deniedByUser) {
      res.writeHead(302, { Location: config.frontendBaseUrl + '/login.html?tiktok_login=cancelled' });
      return res.end();
    }
    return finishTikTokLogin(res, statePayload, code);
  }

  if (deniedByUser) return redirectToProfile('cancelled');

  var userId = statePayload && statePayload.uid;
  if (!userId) return redirectToProfile('invalid_state');
  if (!code) return redirectToProfile('missing_code');

  var tokenResult = await tiktokOAuthService.exchangeCodeForToken(code);
  if (!tokenResult.success) return redirectToProfile('token_exchange_failed');

  var infoResult = await tiktokOAuthService.fetchTikTokUserInfo(tokenResult.accessToken);
  if (!infoResult.success) return redirectToProfile('user_info_failed');

  var linkResult = tiktokOAuthService.linkVerifiedAccount(userId, infoResult.user, tokenResult);
  if (!linkResult.success) return redirectToProfile(linkResult.error === 'tiktok_account_already_linked_elsewhere' ? 'already_linked' : 'link_failed');

  // صورة تيك توك تصير صورة البروفايل تلقائياً لو ما عنده صورة خاصة.
  await tiktokOAuthService.saveTikTokAvatarIfMissing(userId, infoResult.user);

  return redirectToProfile('success');
}

/** إلغاء ربط تيك توك يدوياً — بطلب صريح من صاحب الحساب فقط. */
function handleTikTokUnlink(req, res, body, user) {
  var result = authService.unlinkTikTok(user.id);
  sendJson(res, result.success ? 200 : 400, result);
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

/** الأدمن فقط — يغيّر إيميل أي حساب. body: {userId, email} */
function handleAdminSetEmail(req, res, body) {
  var result = authService.adminSetEmail(body.userId, body.email);
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

/** الأدمن فقط — ?q=<id>&type=internal|profile → اسم صاحب الحساب وآيديّاته. */
function handleAdminLookupUser(req, res) {
  var user = authService.adminLookupUser(getQueryParam(req, 'q'), getQueryParam(req, 'type'));
  if (!user) {
    sendJson(res, 404, { success: false, error: 'not_found' });
    return;
  }
  sendJson(res, 200, { success: true, user: user });
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
    customFrames: collectiblesService.listCustomFrames(),
    elimCards: collectiblesService.getElimCardCatalog(),
    winCards: collectiblesService.getWinCardCatalog()
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

function handleAdminGenerateFrameCodes(req, res, body) {
  var result = collectiblesService.generateFrameCodes(body.frameType, body.frameRef, body.count, body.note);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminGenerateCardCodes(req, res, body) {
  var result = collectiblesService.generateCardCodes(body.kind, body.cardKey, body.count, body.note);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminListBundles(req, res) {
  sendJson(res, 200, { success: true, bundles: collectiblesService.listBundles() });
}

function handleAdminCreateBundle(req, res, body) {
  var result = collectiblesService.createBundle(body.name, body.items);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminGenerateBundleCodes(req, res, body) {
  var result = collectiblesService.generateBundleCodes(body.bundleId, body.count, body.note);
  sendJson(res, result.success ? 200 : 400, result);
}

var BURN_ERROR_STATUS = { invalid_code: 404, code_used: 409, already_burned: 409 };
function handleAdminBurnCode(req, res, body) {
  var result = collectiblesService.burnCode(body.code);
  sendJson(res, result.success ? 200 : (BURN_ERROR_STATUS[result.error] || 400), result);
}

function handleAdminListFrameCodes(req, res) {
  sendJson(res, 200, { success: true, codes: collectiblesService.listFrameCodes(getQueryParam(req, 'limit')) });
}

var REDEEM_ERROR_STATUS = { invalid_code: 404, code_used: 409, code_burned: 410, already_owned: 409, rate_limited: 429, code_full: 409, already_redeemed: 409 };

function handleRedeemFrameCode(req, res, body, user) {
  var result = collectiblesService.redeemFrameCode(user.id, body.code);
  sendJson(res, result.success ? 200 : (REDEEM_ERROR_STATUS[result.error] || 400), result);
}

function handleRedeemChoiceCode(req, res, body, user) {
  var result = collectiblesService.claimChoiceCode(user.id, body.code, body.frameType, body.frameRef);
  sendJson(res, result.success ? 200 : (REDEEM_ERROR_STATUS[result.error] || 400), result);
}

function handleAdminGenerateChoiceCode(req, res, body) {
  var result = collectiblesService.generateChoiceCode(body.maxUses, body.excluded, body.note);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleAdminListChoiceCodes(req, res) {
  sendJson(res, 200, { success: true, codes: collectiblesService.listChoiceCodes() });
}

function handleAdminGetWinReward(req, res) {
  sendJson(res, 200, { success: true, config: collectiblesService.getWinRewardConfig() });
}

function handleAdminSetWinReward(req, res, body) {
  var result = collectiblesService.setWinRewardConfig(body);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleWinRewardCodes(req, res, body, user) {
  sendJson(res, 200, { success: true, codes: collectiblesService.listWinRewardCodes(user.id) });
}

function handleChallengeSearch(req, res, body, user) {
  sendJson(res, 200, challengeService.search(user, getQueryParam(req, 'q')));
}

function handleChallengeInbox(req, res, body, user) {
  sendJson(res, 200, challengeService.inbox(user, getQueryParam(req, 'have')));
}

function handleChallengeInvite(req, res, body, user) {
  var result = challengeService.createInvite(user, body.toCustomId, body.game, body.settings);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleChallengeRespond(req, res, body, user) {
  var result = challengeService.respond(user, body.inviteId, Boolean(body.accept), body.settings);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleChallengeCancel(req, res, body, user) {
  var result = challengeService.cancel(user, body.inviteId);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleChallengePresence(req, res, body, user) {
  var result = challengeService.presence(user, body.where, body.settings);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleChallengeLobby(req, res, body, user) {
  sendJson(res, 200, challengeService.lobby(user));
}

function handleChallengeJoin(req, res, body, user) {
  var result = challengeService.joinWaiting(user, body.customId, body.game);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleChallengeReady(req, res, body, user) {
  var result = challengeService.guestReady(user, body.inviteId, Boolean(body.ready), body.settings);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleChallengeStart(req, res, body, user) {
  var result = challengeService.hostStart(user, body.inviteId);
  sendJson(res, result.success ? 200 : 400, result);
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
 * منح/سحب بطاقة الإقصاء يدوياً من الأدمن. body.revoke === true يسحب
 * body.cardKey (أو كل بطاقاته لو ما انمرَّر)، وإلا تُمنح body.cardKey لـbody.userId.
 */
function handleAdminSetElimCard(req, res, body) {
  if (body.revoke) {
    sendJson(res, 200, collectiblesService.revokeElimCard(body.userId, body.cardKey));
    return;
  }
  var result = collectiblesService.grantElimCard(body.userId, body.cardKey, 'admin_manual');
  sendJson(res, result.success ? 200 : 400, result);
}

/** تفعيل/إيقاف ذاتي لبطاقة إقصاء مملوكة — user.id من الجلسة. body: {cardKey, enabled}. */
function handleToggleElimCard(req, res, body, user) {
  var result = collectiblesService.setElimCardEnabled(user.id, body.cardKey, Boolean(body.enabled));
  sendJson(res, result.success ? 200 : 400, result);
}

/** منح/سحب بطاقة الفوز يدوياً من الأدمن — نفس شكل handleAdminSetElimCard. */
function handleAdminSetWinCard(req, res, body) {
  if (body.revoke) {
    sendJson(res, 200, collectiblesService.revokeWinCard(body.userId, body.cardKey));
    return;
  }
  var result = collectiblesService.grantWinCard(body.userId, body.cardKey, 'admin_manual');
  sendJson(res, result.success ? 200 : 400, result);
}

/** تفعيل/إيقاف ذاتي لبطاقة فوز مملوكة — user.id من الجلسة. body: {cardKey, enabled}. */
function handleSetCharacter(req, res, body, user) {
  var result = collectiblesService.setCharacter(user.id, body && body.kind);
  sendJson(res, result.success ? 200 : 400, result);
}

function handleToggleWinCard(req, res, body, user) {
  var result = collectiblesService.setWinCardEnabled(user.id, body.cardKey, Boolean(body.enabled));
  sendJson(res, result.success ? 200 : 400, result);
}

/**
 * GET /api/stream/is-live?username=X → { success, live: true|false|null }
 * null = تعذّر التأكد مؤقتاً (الواجهة ما تقطع الاتصال عليها).
 *
 * لو اليوزر المطلوب هو اليوزر المربوط بحساب الطالب وما فيه بث، نتأكد من
 * تيك توك إن الستريمر ما غيّر يوزره (refreshTikTokUsername). لو تغيّر،
 * نفحص اليوزر الجديد ونرجعه بـusername مع renamed: true عشان الواجهة
 * تتصل عليه بدل القديم.
 */
function handleRoomLookup(req, res) {
  return roomLookupService.lookup(getQueryParam(req, 'code')).then(function (games) {
    if (!games) {
      sendJson(res, 400, { success: false, error: 'invalid_code' });
      return;
    }
    sendJson(res, 200, { success: true, games: games });
  });
}

function handleStreamIsLive(req, res, body, user) {
  var username = tiktokLiveCheck.normalize(getQueryParam(req, 'username'));
  if (!username) {
    sendJson(res, 400, { success: false, error: 'invalid_username' });
    return;
  }
  return tiktokLiveCheck.isLive(username).then(function (live) {
    var isOwnLinked = user && user.tiktok_verified && tiktokLiveCheck.normalize(user.tiktok_username) === username;
    if (live === true || !isOwnLinked) return { username: username, live: live };
    return tiktokOAuthService.refreshTikTokUsername(user.id).then(function (newUsername) {
      var normalized = tiktokLiveCheck.normalize(newUsername);
      if (!normalized) return { username: username, live: live };
      return tiktokLiveCheck.isLive(normalized).then(function (newLive) {
        return { username: normalized, live: newLive, renamed: true };
      });
    }, function (err) {
      logger.error('Stream is-live: username refresh failed:', err && err.message);
      return { username: username, live: live };
    });
  }).then(function (r) {
    sendJson(res, 200, Object.assign({ success: true }, r));
  });
}

/**
 * GET /api/stream/session-stats?sections=likers:3,gifters:5 → { success, stats: {...} | null, streamer }
 * إحصائيات بث حساب تيك توك المربوط بحساب الطالب (stats/live-session-stats.js).
 * sections = الأقسام المطلوبة وعدد التوب لكل قسم (بدونها: كل الأقسام بدون صور).
 * الأدمن وأصحاب «تشغيل كامل» يقدرون يطلبون أي يوزر عبر ?username=.
 */
function handleStreamSessionStats(req, res, body, user) {
  var canAny = user.role === 'admin' || Boolean(user.permissions && user.permissions.full_game_access);
  var requested = canAny ? tiktokLiveCheck.normalize(getQueryParam(req, 'username')) : null;
  var username = requested || (user.tiktok_verified ? tiktokLiveCheck.normalize(user.tiktok_username) : null);
  if (!username) {
    sendJson(res, 400, { success: false, error: 'tiktok_not_linked' });
    return;
  }
  // الدونيشن (Streamlabs) لحساب الستريمر نفسه بس — مو لما الأدمن يطلب يوزر ثاني
  return sendSessionStats(res, username, getQueryParam(req, 'sections'), requested ? null : user.id);
}

/** ملخص الدونيشن لصاحب الحساب لو مربوط بـStreamlabs (من بداية عدّاده) — أو null. */
function donationSummary(userId, username, topN) {
  if (!userId) return null;
  var store = require('../streamlabs/donations-store').get();
  var link = store.getLink(userId);
  if (!link) return null;
  var ev = username ? liveSessionStats.getRecentEvents(username, 0) : null;
  return store.summary(userId, store.effectiveFrom(link, ev && ev.live ? ev.sid : null), topN || 0);
}

/** ملخص بث username بالأقسام المطلوبة — مشترك بين session-stats ورابط الأوفرلي. userId = صاحبه (للدونيشن). */
function sendSessionStats(res, username, rawSections, userId) {
  var tops = null;
  var donors = 0;
  if (rawSections) {
    tops = {};
    String(rawSections).split(',').forEach(function (part) {
      var kv = part.split(':');
      if (kv[0] === 'donors') donors = Math.min(20, Number(kv[1]) || 0);
      else if (liveSessionStats.SECTIONS.indexOf(kv[0]) !== -1) tops[kv[0]] = Number(kv[1]) || 0;
    });
  }
  var don = donationSummary(userId, username, donors);
  return liveSessionStats.getSummary(username, tops, Boolean(tops)).then(function (stats) {
    if (don) stats = mergeDonations(stats, don, donors);
    if (!stats || !tops) return { stats: stats, streamer: null };
    return liveSessionStats.getStreamerProfile(username).then(function (streamer) {
      return { stats: stats, streamer: streamer };
    });
  }).then(function (r) {
    sendJson(res, 200, { success: true, stats: r.stats, streamer: r.streamer });
  });
}

/** GET /api/game-prefs → { success, prefs } */
function handleGetGamePrefs(req, res, body, user) {
  sendJson(res, 200, { success: true, prefs: gamePrefsService.get(user.id) });
}

/** POST /api/game-prefs { keyword?, team1Name?, team1Keyword?, team2Name?, team2Keyword? } → { success, prefs } */
function handleSaveGamePrefs(req, res, body, user) {
  var r = gamePrefsService.save(user.id, body);
  sendJson(res, r.success ? 200 : (r.error === 'not_found' ? 404 : 400), r);
}

/* -----------------------------------------------------------------------
 * «التحكم عن بعد» — راجع remote-control/remote-control-service.js
 * ----------------------------------------------------------------------- */

/** GET /api/remote-control/config → { success, enabled, max, controllers:[{username, enabled, createdAt, account}] } */
function handleGetRemoteControl(req, res, body, user) {
  if (!isStreamerUser(user)) { sendJson(res, 403, { success: false, error: 'not_streamer' }); return; }
  sendJson(res, 200, Object.assign({ success: true }, remoteControlService.getConfig(user.id)));
}

/**
 * POST /api/remote-control/config
 *   { action: 'enable', on } | { action: 'add', username } | { action: 'toggle', username, on } | { action: 'remove', username }
 * → { success, error?, ...config }   (error: invalid | self | exists | limit | not_found | bad_action)
 */
function handleSaveRemoteControl(req, res, body, user) {
  if (!isStreamerUser(user)) { sendJson(res, 403, { success: false, error: 'not_streamer' }); return; }
  var a = body && body.action, r;
  if (a === 'enable') r = remoteControlService.setEnabled(user.id, !!body.on);
  else if (a === 'add') r = remoteControlService.addController(user, body.username);
  else if (a === 'toggle') r = remoteControlService.setControllerEnabled(user.id, body.username, !!body.on);
  else if (a === 'remove') r = remoteControlService.removeController(user.id, body.username);
  else r = { success: false, error: 'bad_action' };
  sendJson(res, r.success ? 200 : 400, Object.assign({}, remoteControlService.getConfig(user.id), r));
}

/** GET /api/remote-control/access → { success, tiktokLinked, streamers:[{id, customId, name, avatar}] } */
function handleRemoteControlAccess(req, res, body, user) {
  sendJson(res, 200, {
    success: true,
    tiktokLinked: Boolean(user.tiktok_verified && user.tiktok_username),
    streamers: remoteControlService.accessFor(user)
  });
}

/**
 * «إحصائيات البث» (Veyro): الستريمر يفعّل لنفسه الحساب التلقائي — أول ما يبدأ
 * يبث (بدون ما يفتح الموقع) المراقب (stats/stream-stats-watcher.js) يتصل ويحسب
 * التكبيسات والدعم والشير والمشاهدين. نفس صلاحية الأدمن stream_stats_watch.
 * GET → { success, on, linked, watching: {status, startedAt}|null }
 * POST { on } → نفس الشكل.
 */
function statsWatchState(user, on) {
  var linked = Boolean(user.tiktok_verified && user.tiktok_username);
  var watcher = require('../stats/stream-stats-watcher');
  return {
    success: true,
    allowed: isStreamerUser(user),
    on: Boolean(on),
    linked: linked,
    username: linked ? tiktokLiveCheck.normalize(user.tiktok_username) : null,
    watching: linked ? watcher.statusOf(user.tiktok_username) : null
  };
}

function handleGetStatsWatch(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, statsWatchState(user, user.permissions && user.permissions.stream_stats_watch));
}

function handleSetStatsWatch(req, res, body, user) {
  if (!screensGate(res, user)) return;
  // حساب «تجربة Veyro» بس (مو ستريمر): الاتصال بالبث مقفل
  if (!isStreamerUser(user)) { sendJson(res, 403, { success: false, error: 'tester_no_connections' }); return; }
  if (!(user.tiktok_verified && user.tiktok_username)) { sendJson(res, 400, { success: false, error: 'tiktok_not_linked' }); return; }
  var on = Boolean(body && body.on);
  var r = authService.setPermission(user.id, 'stream_stats_watch', on);
  if (!r.success) { sendJson(res, 404, r); return; }
  // نفحص على طول بدل ما ننتظر الدورة الجاية (لو يبث الحين يبدأ يحسب)
  try { require('../stats/stream-stats-watcher').tick(); } catch (e) { /* الدورة الجاية */ }
  sendJson(res, 200, statsWatchState(user, on));
}

/**
 * GET /api/stream/recent-gifts?since=<seq> → { success, sid, seq, gifts: [...], totals, live } (sid = معرّف البث)
 * آخر الهدايا (حتى 72) بعد seq — لوعاء الهدايا بأوفرلي البث (js/agp-stream-overlay.js).
 * طلب خفيف (بدون صور بروفايل) يتكرر كل كم ثانية. نفس قواعد اليوزر بـsession-stats.
 */
function handleStreamRecentGifts(req, res, body, user) {
  var canAny = user.role === 'admin' || Boolean(user.permissions && user.permissions.full_game_access);
  var requested = canAny ? tiktokLiveCheck.normalize(getQueryParam(req, 'username')) : null;
  var username = requested || (user.tiktok_verified ? tiktokLiveCheck.normalize(user.tiktok_username) : null);
  if (!username) {
    sendJson(res, 400, { success: false, error: 'tiktok_not_linked' });
    return;
  }
  sendRecentGifts(res, username, getQueryParam(req, 'since'));
}

function sendRecentGifts(res, username, since) {
  var r = liveSessionStats.getRecentGifts(username, since);
  sendJson(res, 200, r ? { success: true, sid: r.sid, seq: r.seq, gifts: r.gifts, totals: r.totals, live: r.live } : { success: true, sid: 0, seq: 0, gifts: [], totals: null, live: false });
}

/* -----------------------------------------------------------------------
 * «شاشات البث» — overlay/index.html، وكل شاشة رابطها overlay/live.html?k=<رمز>.
 * ----------------------------------------------------------------------- */

/** نفس شرط الاتصال بالبث (ws-server checkStreamConnectAllowed): حساب ستريمر أو صلاحية. */
function isStreamerUser(user) {
  var p = user.permissions || {};
  return user.role === 'admin' || Boolean(user.is_streamer) || Boolean(p.can_run_games) || Boolean(p.full_game_access);
}

/**
 * «تجربة Veyro» (permissions.veyro_tester — من لوحة الأدمن): يفتح شاشات البث وأدواتها
 * (تصميم، مكتبة، تفريغ، «جرّب»، صورة الإحصائيات) بدون ما يكون ستريمر — بس بدون الاتصال
 * بالبث (الحساب التلقائي stats-watch مقفل له).
 */
function isVeyroTester(user) { return Boolean(user && user.permissions && user.permissions.veyro_tester); }

function screensGate(res, user) {
  if (isStreamerUser(user) || isVeyroTester(user)) return true;
  sendJson(res, 403, { success: false, error: 'not_streamer' });
  return false;
}

/** GET /api/screens → { success, screens: [{id, name, key, design, updatedAt}], max, tiktokLinked } */
function handleListScreens(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, {
    success: true,
    screens: streamScreens.list(user.id),
    max: streamScreens.MAX_SCREENS,
    tiktokLinked: Boolean(user.tiktok_verified && user.tiktok_username)
  });
}

/** POST /api/screens/create { name, design? } → { success, screen } */
function handleCreateScreen(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = streamScreens.create(user.id, body && body.name, body && body.design);
  sendJson(res, r.success ? 200 : 400, r);
}

/** POST /api/screens/save { id, name?, design? } → { success, updatedAt } */
function handleSaveScreen(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = streamScreens.save(user.id, body && body.id, { name: body && body.name, design: body && body.design });
  sendJson(res, r.success ? 200 : (r.error === 'not_found' ? 404 : 400), r);
}

/** POST /api/screens/delete { id } */
function handleDeleteScreen(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = streamScreens.remove(user.id, body && body.id);
  sendJson(res, r.success ? 200 : 404, r);
}

/** POST /api/screens/new-key { id } → { success, key } — الرابط القديم يوقف فوراً. */
function handleRotateScreenKey(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = streamScreens.rotateKey(user.id, body && body.id);
  sendJson(res, r.success ? 200 : 404, r);
}

/** GET /api/screens/media → { success, media: [{id, name, mime, size, w, h, d}], max, maxBytes } */
function handleListScreenMedia(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, { success: true, media: screenMedia.list(user.id), max: screenMedia.MAX_FILES, maxBytes: screenMedia.MAX_FILE_BYTES });
}

/** POST /api/screens/media/upload?name=&w=&h=&d= — الجسم = ملف الفيديو (MP4/WebM/MOV). */
function handleUploadScreenMedia(req, res, body, user) {
  if (!screensGate(res, user)) { req.resume(); return; }
  var meta = { name: getQueryParam(req, 'name'), w: getQueryParam(req, 'w'), h: getQueryParam(req, 'h'), d: getQueryParam(req, 'd') };
  var declared = Number(req.headers['content-length']) || 0;
  return screenMedia.upload(user.id, meta, req, declared).then(function (r) {
    var status = r.success ? 200 : (r.error === 'file_too_large' ? 413 : r.error === 'storage_unavailable' ? 500 : 400);
    if (!res.headersSent) sendJson(res, status, r);
  });
}

/** POST /api/screens/media/delete { id } */
function handleDeleteScreenMedia(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = screenMedia.remove(user.id, body && body.id);
  sendJson(res, r.success ? 200 : 404, r);
}

/** POST /api/screens/media/update { id, name?, key? } — «مكتبتي»: اسم الملف وتفريغه المحفوظ. */
function handleUpdateScreenMedia(req, res, body, user) {
  if (!screensGate(res, user)) return;
  body = body || {};
  var patch = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if ('key' in body) patch.key = body.key;
  var r = screenMedia.update(user.id, body.id, patch);
  sendJson(res, r.success ? 200 : 404, r);
}

/**
 * GET /api/screens/media/file?id= — الفيديو نفسه، بدعم Range (التشغيل والتقديم
 * بالمتصفح وOBS). المعرّف ما يتغيّر محتواه، فالتخزين المؤقت طويل.
 */
function handleScreenMediaFile(req, res) {
  var m = screenMedia.find(getQueryParam(req, 'id'));
  if (!m) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
  var headers = { 'Content-Type': m.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' };
  var range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (range && (range[1] || range[2])) {
    var start = range[1] ? Number(range[1]) : Math.max(0, m.size - Number(range[2]));
    var end = range[1] && range[2] ? Math.min(Number(range[2]), m.size - 1) : m.size - 1;
    if (start >= m.size || start > end) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + m.size });
      res.end();
      return;
    }
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + m.size;
    headers['Content-Length'] = end - start + 1;
    res.writeHead(206, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(m.file, { start: start, end: end }).on('error', function () { res.destroy(); }).pipe(res);
    return;
  }
  headers['Content-Length'] = m.size;
  res.writeHead(200, headers);
  fs.createReadStream(m.file).on('error', function () { res.destroy(); }).pipe(res);
}

/** صاحب الشاشة من ?k= — أو يرد 404 ويرجع null. */
function screenFromKey(req, res) {
  var o = streamScreens.findByKey(getQueryParam(req, 'k'));
  if (!o) sendJson(res, 404, { success: false, error: 'invalid_key' });
  return o;
}

/** GET /api/public/screen?k=&v=<updatedAt> → { success, updatedAt, design? } (design بس لو تغيّر). */
function handlePublicScreenDesign(req, res) {
  var o = screenFromKey(req, res);
  if (!o) return;
  var out = { success: true, updatedAt: o.updatedAt };
  screenTests.touch(getQueryParam(req, 'k'), getQueryParam(req, 'lv'));
  if (String(o.updatedAt) !== getQueryParam(req, 'v')) out.design = o.design;
  sendJson(res, 200, out);
}

function screenTikTok(req, res) {
  var o = screenFromKey(req, res);
  if (!o) return null;
  var username = tiktokLiveCheck.normalize(streamScreens.ownerTikTok(o.userId));
  if (!username) sendJson(res, 400, { success: false, error: 'tiktok_not_linked' });
  return username || null;
}

/** GET /api/public/screen/stats?k=&sections= — نفس /api/stream/session-stats لصاحب الشاشة. */
function handlePublicScreenStats(req, res) {
  var o = streamScreens.findByKey(getQueryParam(req, 'k'));
  var username = screenTikTok(req, res);
  if (!username) return;
  return sendSessionStats(res, username, getQueryParam(req, 'sections'), o && o.userId);
}

/** GET /api/public/screen/gifts?k=&since= — نفس /api/stream/recent-gifts لصاحب الشاشة. */
function handlePublicScreenGifts(req, res) {
  var username = screenTikTok(req, res);
  if (!username) return;
  sendRecentGifts(res, username, getQueryParam(req, 'since'));
}

/**
 * GET /api/public/screen/events?k=&since=&t= → { success, sid, seq, events, live, tseq, tests } — أليرتات الشاشة.
 * tests = تجارب «جرّب» من المحرر (stats/screen-tests.js) بعد t — تشتغل حتى لو تيك توك مو مربوط.
 */
function handlePublicScreenEvents(req, res) {
  var o = screenFromKey(req, res);
  if (!o) return;
  var username = tiktokLiveCheck.normalize(streamScreens.ownerTikTok(o.userId));
  var r = username ? liveSessionStats.getRecentEvents(username, getQueryParam(req, 'since')) : null;
  var t = screenTests.since(getQueryParam(req, 'k'), getQueryParam(req, 't'));
  screenTests.touch(getQueryParam(req, 'k'), getQueryParam(req, 'lv'), getQueryParam(req, 'dg'));
  var out = r ? { success: true, sid: r.sid, seq: r.seq, events: r.events, live: r.live } : { success: true, sid: 0, seq: 0, events: [], live: false };
  out.tseq = t.tseq;
  out.tests = t.tests;
  // أدوات الصوت بالشاشة → نص الشات بعد c= (الشاشات العادية ما يوصلها الشات)
  // الدونيشن (Streamlabs) لو الشاشة فيها أداة تستخدمه — للأليرتات و«آخر دعم»
  if (usesDonations(o.design)) {
    var dn = require('../streamlabs/streamlabs-manager').get().recent(o.userId, getQueryParam(req, 'd'));
    out.dseq = dn.dseq;
    out.donations = dn.donations;
  }
  var audio = hasAudioTools(o.design);
  if (audio.tts || audio.music) {
    var c = username ? liveSessionStats.getRecentChat(username, getQueryParam(req, 'c')) : null;
    out.cseq = c ? c.cseq : 0;
    out.chat = c ? c.chat : [];
  }
  sendJson(res, 200, out);
}

/** GET /api/public/screen/music/search?k=&q= → { success, results: [{id, title, channel, durationSec}] } — مشغّل الأغاني. */
function handlePublicScreenMusicSearch(req, res) {
  var o = screenFromKey(req, res);
  if (!o) return;
  if (!hasAudioTools(o.design).music) { sendJson(res, 400, { success: false, error: 'no_music_tool' }); return; }
  screenAudio.get().searchMusic(getQueryParam(req, 'k'), o.userId, getQueryParam(req, 'q')).then(function (r) {
    sendJson(res, r.success ? 200 : (r.error === 'rate_limited' ? 429 : r.error === 'empty_query' ? 400 : 503), r);
  });
}

/** GET /api/public/screen/tts?k=&t=&v=f|m&r= → audio/mpeg — القارئ الصوتي. */
function handlePublicScreenTts(req, res) {
  var o = screenFromKey(req, res);
  if (!o) return;
  if (!hasAudioTools(o.design).tts) { sendJson(res, 400, { success: false, error: 'no_tts_tool' }); return; }
  screenAudio.get().tts(getQueryParam(req, 'k'), getQueryParam(req, 't'), getQueryParam(req, 'v'), getQueryParam(req, 'r')).then(function (r) {
    if (!r.success) { sendJson(res, r.error === 'empty_text' ? 400 : r.error === 'rate_limited' ? 429 : 503, r); return; }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': r.audio.length, 'Cache-Control': 'private, max-age=3600' });
    res.end(r.audio);
  });
}

/* ---------------- Streamlabs (الدونيشن) — الرمز ما يرجع للواجهة أبداً ---------------- */

function streamlabsState(userId) {
  var store = require('../streamlabs/donations-store').get();
  var l = store.getLink(userId);
  if (!l) return { success: true, linked: false, oauth: require('../streamlabs/streamlabs-oauth').get().enabled() };
  var mgr = require('../streamlabs/streamlabs-manager').get();
  var st = mgr.status(userId);
  return { success: true, oauth: require('../streamlabs/streamlabs-oauth').get().enabled(), linked: true, status: st === 'idle' ? l.status : st, lastError: l.lastError, linkedAt: l.linkedAt, lastEventAt: l.lastEventAt, counterFrom: l.counterFrom, autoReset: l.autoReset };
}

/** GET /api/streamlabs → { success, linked, status, lastError, lastEventAt, counterFrom, autoReset } */
function handleStreamlabsState(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, streamlabsState(user.id));
}

/** POST /api/streamlabs/link { token } — يتصل بـStreamlabs ويستنى القبول قبل الحفظ. */
function handleStreamlabsLink(req, res, body, user) {
  if (!screensGate(res, user)) return;
  require('../streamlabs/streamlabs-manager').get().link(user.id, body && body.token).then(function (r) {
    if (!r.success) { sendJson(res, 400, r); return; }
    sendJson(res, 200, streamlabsState(user.id));
  });
}

/** GET /api/streamlabs/oauth/start → { success, url } — رابط صفحة موافقة Streamlabs للستريمر. */
function handleStreamlabsOAuthStart(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var oauth = require('../streamlabs/streamlabs-oauth').get();
  if (!oauth.enabled()) { sendJson(res, 404, { success: false, error: 'oauth_disabled' }); return; }
  sendJson(res, 200, { success: true, url: oauth.authorizeUrl(user.id) });
}

/**
 * GET /api/streamlabs/oauth/callback?code=&state= (رجوع Streamlabs) → socket token → نفس ربط لصق الرمز،
 * ويرجّع الستريمر لـVeyro: veyro/index.html?sl=<ok|cancelled|expired|failed|invalid_token>#tools/donations
 */
function handleStreamlabsOAuthCallback(req, res) {
  function back(status) {
    res.writeHead(302, { Location: config.frontendBaseUrl + '/veyro/index.html?sl=' + encodeURIComponent(status) + '#tools/donations' });
    res.end();
  }
  var oauth = require('../streamlabs/streamlabs-oauth').get();
  if (!oauth.enabled()) return back('failed');
  if (getQueryParam(req, 'error')) return back('cancelled');
  var userId = oauth.verifyState(getQueryParam(req, 'state'));
  if (!userId) return back('expired');
  oauth.socketTokenFromCode(getQueryParam(req, 'code')).then(function (r) {
    if (!r.success) { logger.error('Streamlabs OAuth: ' + r.error + ' for user ' + userId); return back('failed'); }
    return require('../streamlabs/streamlabs-manager').get().link(userId, r.socketToken).then(function (l) {
      back(l.success ? 'ok' : (l.error || 'failed'));
    });
  }).catch(function () { back('failed'); });
}

/** POST /api/streamlabs/unlink — يقطع ويمسح الرمز (الدونيشن المحفوظ يبقى). */
function handleStreamlabsUnlink(req, res, body, user) {
  if (!screensGate(res, user)) return;
  require('../streamlabs/streamlabs-manager').get().disconnect(user.id);
  require('../streamlabs/donations-store').get().removeLink(user.id);
  sendJson(res, 200, { success: true, linked: false });
}

/** POST /api/streamlabs/reset — عدّاد الدونيشن (التوب/الهدف/الإحصائيات) يبدأ من الحين. */
function handleStreamlabsReset(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var store = require('../streamlabs/donations-store').get();
  if (!store.getLink(user.id)) { sendJson(res, 400, { success: false, error: 'not_linked' }); return; }
  store.reset(user.id);
  sendJson(res, 200, streamlabsState(user.id));
}

/** POST /api/streamlabs/settings { autoReset } */
function handleStreamlabsSettings(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var store = require('../streamlabs/donations-store').get();
  if (!store.getLink(user.id)) { sendJson(res, 400, { success: false, error: 'not_linked' }); return; }
  store.setAutoReset(user.id, Boolean(body && body.autoReset));
  sendJson(res, 200, streamlabsState(user.id));
}

/** GET /api/streamlabs/donations?limit= → { success, donations } — السجل (الأحدث أول). */
function handleStreamlabsDonations(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var list = require('../streamlabs/donations-store').get().list(user.id, Number(getQueryParam(req, 'limit')) || 30);
  sendJson(res, 200, { success: true, donations: list.map(function (d) {
    return { name: d.name, amount: d.amountCents / 100, currency: d.currency, message: d.message, isTest: d.isTest, at: d.receivedAt };
  }) });
}

/** GET /api/screens/connection → { success, username|null, state: idle|connecting|connected } */
function handleScreenConnectionStatus(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var u = tiktokLiveCheck.normalize(streamScreens.ownerTikTok(user.id));
  sendJson(res, 200, { success: true, username: u || null, state: u ? require('../stats/screen-audio-watcher').get().status(u) : 'idle' });
}

/**
 * POST /api/screens/connect { username } → { success, state } — اليوزر لازم يكون حساب تيك توك
 * الموثّق بحساب الستريمر (not_linked / not_your_account)، ويبث الحين (not_live).
 */
function handleScreenConnect(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var mine = tiktokLiveCheck.normalize(streamScreens.ownerTikTok(user.id));
  if (!mine) { sendJson(res, 400, { success: false, error: 'not_linked' }); return; }
  var typed = tiktokLiveCheck.normalize(body && body.username);
  if (!typed) { sendJson(res, 400, { success: false, error: 'invalid_username' }); return; }
  if (typed !== mine) { sendJson(res, 400, { success: false, error: 'not_your_account', username: mine }); return; }
  tiktokLiveCheck.isLive(mine).then(function (live) {
    if (live === false) { sendJson(res, 409, { success: false, error: 'not_live' }); return; }
    var r = require('../stats/screen-audio-watcher').get().connectManual(mine);
    sendJson(res, 200, { success: true, username: mine, state: r.state });
  });
}

/** POST /api/screens/disconnect → { success } */
function handleScreenDisconnect(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var mine = tiktokLiveCheck.normalize(streamScreens.ownerTikTok(user.id));
  if (mine) require('../stats/screen-audio-watcher').get().disconnectManual(mine);
  sendJson(res, 200, { success: true, state: 'idle' });
}

/** GET /api/screens/audio-key → { success, hasKey } — هل الستريمر حاط مفتاح يوتيوب خاص (المفتاح نفسه ما يرجع أبداً). */
function handleGetScreenAudioKey(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, { success: true, hasKey: screenAudio.get().hasUserYoutubeKey(user.id) });
}

/** POST /api/screens/audio-key { youtubeKey|null } → { success, hasKey } */
function handleSetScreenAudioKey(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = screenAudio.get().setUserYoutubeKey(user.id, body && body.youtubeKey ? String(body.youtubeKey) : null);
  sendJson(res, r.success ? 200 : 400, r);
}

/** GET /api/screens/live-status → { success, screens: [{ id, agoMs|null, ver }] } — أي شاشة مفتوحة بتطبيق البث الحين. */
function handleScreensLiveStatus(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, {
    success: true,
    screens: streamScreens.list(user.id).map(function (x) {
      var s = screenTests.seen(x.key);
      return { id: x.id, agoMs: s ? s.agoMs : null, ver: s ? s.ver : '', vers: s ? s.vers : {}, diag: s ? s.diag : '', diagAgoMs: s ? s.diagAgoMs : null };
    })
  });
}

/** POST /api/screens/test-alert { id, itemId, type } — «جرّب» يطلع على رابط الشاشة (OBS / TikTok LIVE Studio). */
function handleScreenTestAlert(req, res, body, user) {
  if (!screensGate(res, user)) return;
  body = body || {};
  var scr = streamScreens.list(user.id).filter(function (x) { return String(x.id) === String(body.id); })[0];
  if (!scr) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
  var t = screenTests.push(scr.key, body.itemId, String(body.type || 'gift'));
  sendJson(res, t ? 200 : 400, t ? { success: true } : { success: false, error: 'bad_item' });
}

/**
 * GET /api/stream/media?k=g&id=<giftId> → صورة (بايتات) أو 404.
 * صورة هدية تيك توك لوعاء الهدايا — بديل لو الرابط المباشر ما
 * فتح بالمتصفح. عام (وسم <img> ما يرسل توكن)، بس ما يجيب إلا روابط جات من
 * أحداث الهدايا بالبث (live-session-stats noteGiftMedia)، ومخزّنة بالكاش.
 */
function handleStreamMedia(req, res) {
  var kind = getQueryParam(req, 'k') || 'g';
  var id = String(getQueryParam(req, 'id') || '').slice(0, 64);
  return liveSessionStats.getMediaDataUrl(kind, id).then(function (dataUrl) {
    var m = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!m) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
    res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' });
    res.end(Buffer.from(m[2], 'base64'));
  });
}

/**
 * تُستدعى من dashboard-core عند إنهاء جولة. body.participants: مصفوفة
 * {tiktokUsername, won}، وbody.teamGame = true لألعاب الفريقين (مكافأة
 * فوز مختلفة، راجع points-service.js). كل مشارك يُطابَق بحساب مسجَّل موثَّق تيك توك قبل
 * منح أي نقاط — لا نقاط لمن لا حساب له، بصمت.
 */
var MAX_PARTICIPATIONS_PER_MATCH = 500;

function handleRoundComplete(req, res, body, user) {
  var participants = Array.isArray(body.participants) ? body.participants : [];
  var durationMs = Number(body.durationMs) || 0;
  // ساعات البث للاستريمر = وقت المباريات المكتملة فقط (لا وقت فتح الصفحة).
  try { streamerHours.recordMatchTime(user && user.id, durationMs); } catch (err) { logger.error('Round complete: match time record failed:', err); }
  // عدد المشاركين بالمباراة (بدون تكرار) — لتصنيف "الأكثر مشاركات" للاستريمر.
  var seen = {};
  participants.forEach(function (p) {
    var name = p && p.tiktokUsername ? String(p.tiktokUsername).toLowerCase() : '';
    if (name) seen[name] = true;
  });
  // حد أعلى ٥٠٠ للمباراة الوحدة: العدد يجي من متصفح الاستريمر، فالحد يمنع
  // قائمة مزيفة ضخمة تقفز بالتصنيف من مباراة وحدة.
  try { authService.recordStreamerParticipations(user && user.id, Math.min(MAX_PARTICIPATIONS_PER_MATCH, Object.keys(seen).length)); } catch (err) { logger.error('Round complete: participations record failed:', err); }
  var teamGame = Boolean(body.teamGame);
  var results = [];
  participants.forEach(function (p) {
    var matched = authService.findVerifiedUserByTikTok(p && p.tiktokUsername);
    if (!matched) return;
    var award = pointsService.awardForRoundCompletion(matched.id, { won: Boolean(p.won), teamGame: teamGame, durationMs: durationMs });
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

/** مراكز مستخدم (?id=custom_id) بالتصنيفات الأسبوعية — عام، لصورة البروفايل.
 * avatar: صورته كـData URL (المرفوعة بالموقع، وإلا صورة تيك توك يجيبها السيرفر
 * لأن المتصفح ما يقدر يرسمها على Canvas ويحفظها — CORS)، أو null. */
function handleUserRanks(req, res) {
  var profile = authService.getPublicProfile(getQueryParam(req, 'id'));
  var ranks = profile ? authService.getUserWeeklyRanks(profile.custom_id) : null;
  if (!ranks) {
    sendJson(res, 404, { success: false, error: 'not_found' });
    return;
  }
  var avatar = profile.avatar_image_base64
    ? Promise.resolve(profile.avatar_image_base64)
    : profile.tiktok_username
      ? liveSessionStats.getStreamerProfile(profile.tiktok_username).then(function (sp) { return sp.avatar || null; }, function () { return null; })
      : Promise.resolve(null);
  return avatar.then(function (a) {
    sendJson(res, 200, { success: true, ranks: ranks, avatar: a });
  });
}

/** أعلى الاستريمرز بعدد المشاركات بألعابهم هالأسبوع — عام، لتوب الاستريمرز بالرئيسية. */
function handleTopStreamersByParticipations(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, streamers: authService.getTopStreamersByParticipations(limit) });
}

/** أعلى اللاعبين بعدد مرات الفوز هالأسبوع — عام، لبطاقة "الأكثر نشاطاً" بالصفحة الرئيسية.
 * نفس حد التصفير الأسبوعي لتوب الاستريمرز (كل سبت 12:00 ص بتوقيت السعودية). */
function handleTopPlayersByWins(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, players: pointsService.getTopPlayersByWins(limit, authService.getRankingPeriodStart()) });
}

/** أعلى اللاعبين بوقت اللعب الفعلي هالأسبوع ("الأكثر نشاطاً") — عام. */
function handleTopPlayersByHours(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, players: pointsService.getTopPlayersByHours(limit, authService.getRankingPeriodStart()) });
}

/** أعلى اللاعبين بعدد الجولات المكتملة هالأسبوع ("الأكثر لعباً") — عام. */
function handleTopPlayersByRounds(req, res) {
  var limit = Math.min(50, Math.max(1, parseInt(getQueryParam(req, 'limit'), 10) || 20));
  sendJson(res, 200, { success: true, players: pointsService.getTopPlayersByRounds(limit, authService.getRankingPeriodStart()) });
}

/** أرقام حقيقية لقسم "الأرقام" بالصفحة الرئيسية — عام، مخزَّن مؤقتاً بالسيرفر. */
function handleGetPlatformStats(req, res) {
  var result = platformStatsService.getCachedStats();
  sendJson(res, 200, { success: true, stats: result.stats, computedAt: result.computedAt });
}

/** الأدمن فقط — إحصائيات الاستريمرز المجمَّعة. */
function handleAdminStreamerStats(req, res) {
  sendJson(res, 200, { success: true, stats: authService.getAdminStreamerStats() });
}

/** الأدمن فقط — إحصائيات المستخدمين المجمَّعة. */
function handleAdminUserStats(req, res) {
  sendJson(res, 200, { success: true, stats: authService.getAdminUserStats() });
}

/**
 * الأدمن فقط — البثوث المتصلة الآن من داخل الألعاب + مباريات التحدي الشغّالة.
 * من الذاكرة مباشرة (بدون قاعدة البيانات). require متأخر لتفادي حلقة استيراد.
 */
function handleAdminLiveStreams(req, res) {
  var connections = [];
  var matches = [];
  try { connections = require('../websocket/ws-server').listLiveConnections(); } catch (err) { logger.error('Admin live streams: connections failed:', err); }
  try { matches = require('../challenge/challenge-match').listActiveMatches(); } catch (err) { logger.error('Admin live streams: matches failed:', err); }
  // مراقبات إحصائيات البث (stats/stream-stats-watcher.js) — بنفس شكل صفوف الاتصالات
  try { connections = connections.concat(listStatsWatchers()); } catch (err) { logger.error('Admin live streams: watchers failed:', err); }
  // استهلاك EulerStream اليوم (محاولات الاتصال الحقيقية والبثوث) — shared-connection-pool.js
  var streamUsage = null;
  try { streamUsage = require('../platforms/tiktok/shared-connection-pool').getUsage(); } catch (err) { logger.error('Admin live streams: usage failed:', err); }
  sendJson(res, 200, { success: true, now: Date.now(), connections: connections, matches: matches, chatLatency: chatLatency.getStats(), streamUsage: streamUsage });
}

/** البثوث المتصلة الآن من داخل الألعاب لستريمرز مسجّلين — لبطاقات مكتبة
 * الألعاب. يرجع حقول عامة فقط (بدون connectionId/user.id/role)، وبث واحد
 * لكل يوزر تيك توك (لو فاتح أكثر من تبويب ناخذ أعلى عدد مشاهدين).
 * البث يظهر فقط لو حساب تيك توك الموثَّق الحالي لصاحب الجلسة هو نفسه
 * البث المتصل — الأدمن/«تشغيل كامل» يقدرون يتصلون ببث غيرهم، وبدون هذا
 * الشرط تطلع بطاقة باسمهم وصورتهم على بث شخص ثاني. الاسم من قاعدة
 * البيانات لحظة الطلب (نفس ترتيب صفحة البروفايل: display_name ثم username). */
function handlePublicLiveStreams(req, res) {
  var connections = [];
  try { connections = require('../websocket/ws-server').listLiveConnections(); } catch (err) { logger.error('Public live streams failed:', err); }
  var byUser = {};
  connections.forEach(function (c) {
    if (c.status !== 'connected' || !c.user || !c.user.customId || !c.username) return;
    var u = null;
    try { u = authService.adminLookupUser(c.user.customId, 'profile'); } catch (err) { logger.error('Public live streams: user lookup failed:', err); }
    if (!u || !u.tiktok_username) return;
    var tiktok = String(u.tiktok_username).trim().replace(/^@+/, '').toLowerCase();
    if (tiktok !== c.username) return;
    var prev = byUser[tiktok];
    if (prev && (prev.viewers || 0) >= (c.viewers || 0)) return;
    byUser[tiktok] = {
      name: u.display_name || u.username || tiktok,
      tiktok: tiktok,
      customId: u.custom_id,
      gameName: c.gameName || null,
      viewers: typeof c.viewers === 'number' ? c.viewers : null,
      connectedAt: c.connectedAt || null
    };
  });
  var streams = Object.keys(byUser).map(function (k) { return byUser[k]; })
    .sort(function (x, y) { return (y.viewers || 0) - (x.viewers || 0); });
  sendJson(res, 200, { success: true, streams: streams });
}

/** صورة ستريمر موثَّق (?u=<يوزر تيك توك>) كملف صورة. روابط صور تيك توك
 * موقّعة وتنتهي صلاحيتها بعد أيام، فما نرسلها للمتصفح مباشرة: نعتمد على
 * getStreamerProfile — الصورة المخزَّنة بالحساب (المرفوعة أو المحفوظة من
 * تيك توك)، وإلا يحمّلها السيرفر من الرابط المخزَّن (مع كاش). 404 لو ما فيه
 * صورة، والواجهة تعرض أول حرف من الاسم بدلها. */
function handlePublicStreamerAvatar(req, res) {
  var username = String(getQueryParam(req, 'u') || '').trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,40}$/.test(username)) { sendJson(res, 400, { success: false, error: 'invalid_username' }); return; }
  return liveSessionStats.getStreamerProfile(username).then(function (p) { return p && p.avatar; }, function () { return null; }).then(function (dataUrl) {
    var m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
    if (!m) { sendJson(res, 404, { success: false, error: 'no_avatar' }); return; }
    var buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=600' });
    res.end(buf);
  });
}

function listStatsWatchers() {
  return require('../stats/stream-stats-watcher').listWatchers().map(function (w) {
    var u = w.user;
    var totals = liveSessionStats.getTotals(w.username) || {};
    return {
      platform: 'tiktok',
      username: w.username,
      gameName: 'مراقبة إحصائيات البث',
      user: u ? { id: u.id, name: u.username || null, customId: u.custom_id || null, role: u.role, tiktok: w.username, avatar: u.tiktok_avatar_url || null } : null,
      status: w.status,
      requestedAt: w.startedAt,
      connectedAt: w.connectedAt,
      comments: totals.comments || 0,
      gifts: totals.gifts || 0,
      viewers: null,
      tracked: false
    };
  });
}

/** صاحب الجلسة يعدّل اسم العرض الخاص به — user.id من الجلسة حصراً. */
function handleUpdateDisplayName(req, res, body, user) {
  var result = authService.updateDisplayName(user.id, body.displayName);
  sendJson(res, result.success ? 200 : 400, result);
}

/** صاحب الجلسة يغيّر اسم المستخدم الخاص فيه — user.id من الجلسة حصراً. */
function handleUpdateUsername(req, res, body, user) {
  var result = authService.updateUsername(user.id, body.username);
  sendJson(res, result.success ? 200 : 400, result);
}

/** صاحب الجلسة يعدّل صورة بروفايله — Data URL كامل (base64) من المتصفح. */
function handleUpdateAvatar(req, res, body, user) {
  var result = authService.updateAvatarImage(user.id, body.imageDataUrl);
  sendJson(res, result.success ? 200 : 400, result);
}

/* -----------------------------------------------------------------------
 * مسودة بنك أسئلة "خلية الحروف" — صلاحية جزئية (can_manage_letters_cell)
 * وليست requireAdmin عام، لذا التحقق يدوي هنا بدل جدول المسارات.
 * ----------------------------------------------------------------------- */

function canManageLettersCell(user) {
  return Boolean(user) && (user.role === 'admin' || Boolean(user.permissions && user.permissions.can_manage_letters_cell));
}

function handleGetLettersCellQuestionsDraft(req, res, body, user) {
  if (!canManageLettersCell(user)) { sendJson(res, 403, { success: false, error: 'forbidden' }); return; }
  sendJson(res, 200, { success: true, draft: lettersCellQuestionsService.getDraft() });
}

function handleSaveLettersCellQuestionsDraft(req, res, body, user) {
  if (!canManageLettersCell(user)) { sendJson(res, 403, { success: false, error: 'forbidden' }); return; }
  var result = lettersCellQuestionsService.saveDraft(body.questions, user.id);
  sendJson(res, result.success ? 200 : 400, result);
}

/* -----------------------------------------------------------------------
 * الدعم والاقتراحات (تذاكر)
 * ----------------------------------------------------------------------- */

/** رمز HTTP مناسب لكل خطأ من support-service (الافتراضي 400). */
var SUPPORT_ERROR_STATUS = {
  not_found: 404,
  ticket_closed: 409,
  rate_limited: 429,
  uploads_not_configured: 503
};

function sendSupportResult(res, result) {
  sendJson(res, result.success ? 200 : (SUPPORT_ERROR_STATUS[result.error] || 400), result);
}

function handleSupportUploadSignature(req, res, body, user) {
  sendSupportResult(res, supportService.getUploadSignature(user.id, { fileName: body.fileName, fileSize: body.fileSize }));
}

function handleSupportCreateTicket(req, res, body, user) {
  var result = supportService.createTicket(user.id, {
    type: body.type, title: body.title, body: body.body, attachments: body.attachments
  });
  sendJson(res, result.success ? 201 : (SUPPORT_ERROR_STATUS[result.error] || 400), result);
}

function handleSupportListTickets(req, res, body, user) {
  sendSupportResult(res, supportService.listMyTickets(user.id));
}

function handleSupportUnreadCount(req, res, body, user) {
  sendSupportResult(res, supportService.countMyUnread(user.id));
}

function handleSupportGetTicket(req, res, body, user) {
  sendSupportResult(res, supportService.getMyTicket(user.id, getQueryParam(req, 'id')));
}

function handleSupportReply(req, res, body, user) {
  sendSupportResult(res, supportService.replyAsUser(user.id, {
    ticketId: body.ticketId, body: body.body, attachments: body.attachments
  }));
}

function handleAdminSupportListTickets(req, res) {
  sendSupportResult(res, supportService.adminListTickets({
    type: getQueryParam(req, 'type'),
    status: getQueryParam(req, 'status'),
    q: getQueryParam(req, 'q'),
    limit: getQueryParam(req, 'limit'),
    offset: getQueryParam(req, 'offset')
  }));
}

function handleAdminSupportGetTicket(req, res) {
  sendSupportResult(res, supportService.adminGetTicket(getQueryParam(req, 'id')));
}

function handleAdminSupportReply(req, res, body) {
  sendSupportResult(res, supportService.replyAsAdmin({ ticketId: body.ticketId, body: body.body }));
}

function handleAdminSupportSetStatus(req, res, body) {
  sendSupportResult(res, supportService.adminSetStatus({ ticketId: body.ticketId, status: body.status }));
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

  // rawBody: الـ handler يقرأ الجسم بنفسه (رفع ملفات) بدل تحليل JSON بحد 100KB
  var bodyPromise = route.rawBody ? Promise.resolve({}) : bodyParser.readJsonBody(req);
  bodyPromise.then(function (body) {
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
