/**
 * VEYRO ROUTER — كل مسارات فيرو (/api/*). المعالجات منقولة كما هي من
 * backend/http/auth-router.js (نفس الطلبات ونفس الردود)، والفرق:
 * - الحساب من سيرفر الألعاب عبر core/core-auth.js (بدل جدول الجلسات).
 * - «الحساب التلقائي» لإحصائيات البث بجدول veyro_prefs (بدل صلاحية الحساب بسيرفر الألعاب).
 * - GET /api/veyro/health للفحص.
 */

'use strict';

var fs = require('fs');
var config = require('../config');
var logger = require('../utils/logger');
var response = require('./response');
var bodyParser = require('./body-parser');
var db = require('../db/database');
var coreAuth = require('../core/core-auth');
var tiktokLiveCheck = require('../platforms/tiktok/tiktok-live-check');
var giftCatalog = require('../platforms/tiktok/gift-catalog');
var liveSessionStats = require('../stats/live-session-stats');
var screenTests = require('../stats/screen-tests');
var streamScreens = require('../stats/stream-screens-service');
var screenMedia = require('../stats/screen-media-service');
var screenAudio = require('../stats/screen-audio-service');
var hasAudioTools = require('../stats/screen-audio-design').hasAudioTools;
var usesDonations = require('../stats/screen-audio-design').usesDonations;
var mergeDonations = require('../streamlabs/donations-stats').mergeDonations;
// لوحة تحكم فيرو: الاشتراكات، حالة الحساب، الساعات الفعلية، والمكتبة العامة (admin/)
var veyroAdmin = require('../admin/admin-router');

var sendJson = response.sendJson;

function extractBearerToken(req) {
  var header = req.headers['authorization'] || '';
  var match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function getQueryParam(req, key) {
  var queryString = (req.url || '').split('?')[1] || '';
  var value = '';
  queryString.split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (decodeURIComponent(kv[0] || '') === key) value = decodeURIComponent(kv[1] || '');
  });
  return value;
}

/* «الحساب التلقائي» لإحصائيات البث — إعداد فيرو للحساب (veyro_prefs) */
var authService = {
  setPermission: function (userId, key, on) {
    db.prepare('INSERT INTO veyro_prefs (user_id, stats_watch, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET stats_watch = excluded.stats_watch, updated_at = excluded.updated_at')
      .run(userId, on ? 1 : 0, Date.now());
    return { success: true };
  }
};
function statsWatchOn(userId) {
  var r = db.prepare('SELECT stats_watch FROM veyro_prefs WHERE user_id = ?').get(userId);
  return Boolean(r && r.stats_watch);
}

/** GET /api/veyro/health → حالة السيرفر (بدون أسرار). */
function handleHealth(req, res) {
  sendJson(res, 200, { success: true, service: 'veyro-server', core: config.coreApiUrl, eulerstream: Boolean(process.env.EULERSTREAM_API_KEY) });
}

var ROUTES = [
  { method: 'GET', path: '/api/veyro/health', requireAuth: false, handler: handleHealth },
  // بوابة محرر فيرو: الحساب من سيرفر الألعاب (محفوظ مؤقتاً — المحرر يفتح حتى وقت نشر الألعاب)
  // + veyro: حالة الحساب والاشتراك والإعلان من لوحة تحكم فيرو (المحرر يقرأها من نفس الطلب)
  { method: 'GET', path: '/api/auth/me', requireAuth: true, allowBlocked: true, handler: function (req, res, body, user) { sendJson(res, 200, { success: true, user: user, veyro: veyroAdmin.veyroInfo(user) }); } },
  { method: 'GET', path: '/api/stream/session-stats', requireAuth: true, handler: handleStreamSessionStats },
  { method: 'GET', path: '/api/stream/stats-watch', requireAuth: true, handler: handleGetStatsWatch },
  { method: 'POST', path: '/api/stream/stats-watch', requireAuth: true, handler: handleSetStatsWatch },
  { method: 'GET', path: '/api/stream/recent-gifts', requireAuth: true, handler: handleStreamRecentGifts },
  { method: 'GET', path: '/api/stream/media', requireAuth: false, handler: handleStreamMedia },
  { method: 'GET', path: '/api/tiktok/gifts', requireAuth: true, handler: handleTikTokGifts },
  { method: 'GET', path: '/api/screens', requireAuth: true, handler: handleListScreens },
  { method: 'POST', path: '/api/screens/create', requireAuth: true, handler: handleCreateScreen },
  { method: 'POST', path: '/api/screens/save', requireAuth: true, handler: handleSaveScreen },
  { method: 'POST', path: '/api/screens/delete', requireAuth: true, handler: handleDeleteScreen },
  { method: 'POST', path: '/api/screens/new-key', requireAuth: true, handler: handleRotateScreenKey },
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
  { method: 'GET', path: '/api/public/screen/music/search', requireAuth: false, handler: handlePublicScreenMusicSearch },
  { method: 'GET', path: '/api/public/screen/tts', requireAuth: false, handler: handlePublicScreenTts },
  { method: 'GET', path: '/api/screens/audio-key', requireAuth: true, handler: handleGetScreenAudioKey },
  { method: 'POST', path: '/api/screens/audio-key', requireAuth: true, handler: handleSetScreenAudioKey },
  { method: 'GET', path: '/api/streamlabs', requireAuth: true, handler: handleStreamlabsState },
  { method: 'POST', path: '/api/streamlabs/link', requireAuth: true, handler: handleStreamlabsLink },
  { method: 'POST', path: '/api/streamlabs/unlink', requireAuth: true, handler: handleStreamlabsUnlink },
  { method: 'POST', path: '/api/streamlabs/reset', requireAuth: true, handler: handleStreamlabsReset },
  { method: 'POST', path: '/api/streamlabs/settings', requireAuth: true, handler: handleStreamlabsSettings },
  { method: 'GET', path: '/api/streamlabs/donations', requireAuth: true, handler: handleStreamlabsDonations },
  { method: 'GET', path: '/api/streamlabs/oauth/start', requireAuth: true, handler: handleStreamlabsOAuthStart },
  { method: 'GET', path: '/api/streamlabs/oauth/callback', requireAuth: false, handler: handleStreamlabsOAuthCallback },
  { method: 'GET', path: '/api/screens/connection', requireAuth: true, handler: handleScreenConnectionStatus },
  { method: 'POST', path: '/api/screens/connect', requireAuth: true, handler: handleScreenConnect },
  { method: 'POST', path: '/api/screens/disconnect', requireAuth: true, handler: handleScreenDisconnect },
  { method: 'GET', path: '/api/public/screen/events', requireAuth: false, handler: handlePublicScreenEvents },
].concat(veyroAdmin.ROUTES);

function matchRoute(method, pathname) {
  for (var i = 0; i < ROUTES.length; i++) {
    var r = ROUTES[i];
    if (r.path === pathname && (r.method === method || (method === 'HEAD' && r.method === 'GET'))) return r;
  }
  return null;
}

/** GET /api/stream/session-stats?sections= — إحصائيات البث (صورة الإحصائيات بفيرو). */
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

/**
 * «إحصائيات البث» (Veyro): الستريمر يفعّل لنفسه الحساب التلقائي — أول ما يبدأ
 * يبث (بدون ما يفتح الموقع) المراقب (stats/stream-stats-watcher.js) يتصل ويحسب
 * التكبيسات والدعم والشير والمشاهدين. التفعيل بـveyro_prefs (سيرفر فيرو).
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
  sendJson(res, 200, statsWatchState(user, statsWatchOn(user.id)));
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
  if (!(isStreamerUser(user) || isVeyroTester(user))) { sendJson(res, 403, { success: false, error: 'not_streamer' }); return false; }
  // لوحة تحكم فيرو: «الاشتراك الإلزامي» لو مفعّل (الأدمن والتجربة مستثنين)
  if (veyroAdmin.subRequired(user)) { sendJson(res, 402, { success: false, error: 'subscription_required' }); return false; }
  return true;
}

/** GET /api/screens → { success, screens: [{id, name, key, design, updatedAt}], max, tiktokLinked } */
function handleListScreens(req, res, body, user) {
  if (!screensGate(res, user)) return;
  sendJson(res, 200, {
    success: true,
    screens: streamScreens.list(user.id),
    max: veyroAdmin.limits(user.id).screens != null ? veyroAdmin.limits(user.id).screens : streamScreens.MAX_SCREENS,
    tiktokLinked: Boolean(user.tiktok_verified && user.tiktok_username)
  });
}

/** POST /api/screens/create { name, design? } → { success, screen } */
function handleCreateScreen(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var r = streamScreens.create(user.id, body && body.name, body && body.design, veyroAdmin.limits(user.id).screens);
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
  var lim = veyroAdmin.limits(user.id).videos;
  sendJson(res, 200, { success: true, media: screenMedia.list(user.id), max: lim != null ? lim : screenMedia.MAX_FILES, maxBytes: screenMedia.MAX_FILE_BYTES });
}

/** POST /api/screens/media/upload?name=&w=&h=&d= — الجسم = ملف الفيديو (MP4/WebM/MOV). */
function handleUploadScreenMedia(req, res, body, user) {
  if (!screensGate(res, user)) { req.resume(); return; }
  var meta = { name: getQueryParam(req, 'name'), w: getQueryParam(req, 'w'), h: getQueryParam(req, 'h'), d: getQueryParam(req, 'd') };
  var declared = Number(req.headers['content-length']) || 0;
  return screenMedia.upload(user.id, meta, req, declared, veyroAdmin.limits(user.id).videos).then(function (r) {
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
  // لوحة تحكم فيرو: أليرت من مكتبة فيرو العامة يشتغل بنفس الرابط
  var m = screenMedia.find(getQueryParam(req, 'id')) || require('../admin/veyro-admin-service').get().findAssetFile(getQueryParam(req, 'id'), false);
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
  // لوحة تحكم فيرو: حساب موقوف/محظور → شاشاته تطفى
  if (o && veyroAdmin.ownerBlocked(o.userId)) { sendJson(res, 403, { success: false, error: 'owner_blocked' }); return null; }
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
  // الساعات الفعلية بلوحة تحكم فيرو: الرابط مفتوح بـOBS = نبضة لصاحب الشاشة
  try { veyroAdmin.tracker().beat(o.userId, out.live); } catch (e) { /* ignore */ }
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

/** GET /api/screens/connection → { success, username|null, state: idle|connecting|connected, error: null|timeout|error } */
function handleScreenConnectionStatus(req, res, body, user) {
  if (!screensGate(res, user)) return;
  var u = tiktokLiveCheck.normalize(streamScreens.ownerTikTok(user.id));
  var w = require('../stats/screen-audio-watcher').get();
  sendJson(res, 200, { success: true, username: u || null, state: u ? w.status(u) : 'idle', error: u ? w.lastError(u) : null });
}

/**
 * POST /api/screens/connect { username, force? } → { success, state } — force = «إعادة الاتصال» (يقفل القديم ويفتح جديد) — اليوزر لازم يكون حساب تيك توك
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
    var r = require('../stats/screen-audio-watcher').get().connectManual(mine, Boolean(body && body.force));
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

/** GET /api/tiktok/gifts → { success, gifts: [{id, name, diamonds, image, official}], updatedAt } */
function handleTikTokGifts(req, res) {
  try {
    var c = giftCatalog.get();
    sendJson(res, 200, { success: true, gifts: c.list(), updatedAt: c.listUpdatedAt() });
  } catch (err) {
    logger.error('TikTok gifts: list failed:', err);
    sendJson(res, 500, { success: false, error: 'server_error' });
  }
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


/** نقطة الدخول لكل طلب /api/* — CORS، الحساب (من سيرفر الألعاب)، الجسم، والأخطاء. */
function handle(req, res) {
  response.applyCors(req, res, config);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  var pathname = (req.url || '').split('?')[0];
  var route = matchRoute(req.method, pathname);
  if (!route) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
  var token = extractBearerToken(req);
  // الحساب بس للمسارات المحمية (روابط الشاشات العامة ما تسأل سيرفر الألعاب أبداً)
  var auth = route.requireAuth ? coreAuth.get().resolve(token) : Promise.resolve({ user: null });
  auth.then(function (a) {
    if (route.requireAuth && !a.user) {
      if (route.rawBody) req.resume();
      sendJson(res, a.status === 503 ? 503 : 401, { success: false, error: a.error || 'unauthorized' });
      return;
    }
    // لوحة تحكم فيرو: الحساب موقوف/محظور، أو انسجّل خروجه من كل الأجهزة، وصلاحية التجربة
    var denied = route.requireAuth ? veyroAdmin.guard(route, a.user, token) : null;
    if (denied) {
      if (route.rawBody) req.resume();
      sendJson(res, denied.status, { success: false, error: denied.error });
      return;
    }
    var bodyPromise = route.rawBody ? Promise.resolve({}) : bodyParser.readJsonBody(req);
    return bodyPromise.then(function (body) {
      return route.handler(req, res, body || {}, a.user, token);
    });
  }).catch(function (err) {
    if (err && (err.message === 'invalid_json' || err.message === 'body_too_large')) {
      sendJson(res, 400, { success: false, error: err.message });
      return;
    }
    logger.error('Veyro Router: unhandled error on ' + route.method + ' ' + route.path + ':', err);
    if (!res.headersSent) sendJson(res, 500, { success: false, error: 'internal_error' });
  });
}

module.exports = { handle: handle, ROUTES: ROUTES };
