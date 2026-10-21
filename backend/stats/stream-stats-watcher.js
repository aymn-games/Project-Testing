/**
 * AGP STREAM STATS WATCHER — مراقبة إحصائيات البث من السيرفر نفسه، بدون ما
 * يحتاج الستريمر يفتح الموقع أو أي لعبة.
 *
 * يشتغل فقط للستريمرز اللي فعّلها لهم الأدمن يدوياً (admin.html → صلاحية
 * permissions.stream_stats_watch). كل CHECK_MS نفحص هل كل واحد منهم يبث
 * (platforms/tiktok/tiktok-live-check.js — طلب HTTP خفيف بدون توقيع)، ولو
 * يبث نفتح اتصال بث بوضع statsOnly يغذّي stats/live-session-stats.js، ويتقفل
 * لحاله لما ينتهي البث. فشل الاتصال → نوقف ونرجع نحاول بالدورة الجاية.
 *
 * اتصالات المراقب معرّفها يبدأ بـ liveSessionStats.WATCH_PREFIX، ولها
 * الأولوية على اتصالات الألعاب لنفس البث (ما تنحسب الأحداث مرتين).
 *
 * ⚠️ كل مراقب = اتصال بث كامل يمر على توقيع EulerStream طول البث — عشان كذا
 * التفعيل يدوي من الأدمن لستريمرز محددين.
 */

'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');
var connectorRouter = require('../platforms/connector-router');
var tiktokLiveCheck = require('../platforms/tiktok/tiktok-live-check');
var liveSessionStats = require('./live-session-stats');

var PERMISSION_KEY = 'stream_stats_watch';
var START_DELAY_MS = 20 * 1000;
var CHECK_MS = 2 * 60 * 1000;
var CHECK_GAP_MS = 1500;        // فاصل بين فحص يوزر والثاني — تفادياً لحظر تيك توك

var _watchers = new Map(); // username -> { connector, connectionId, status, startedAt, connectedAt, userId }
var _ticking = false;
var _started = false;

function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

/** الستريمرز الموثَّقين اللي مفعّل لهم المراقبة. */
function enabledUsers() {
  var rows = db.prepare(
    "SELECT id, tiktok_username, permissions FROM users WHERE tiktok_verified = 1 AND tiktok_username IS NOT NULL AND permissions LIKE ?"
  ).all('%' + PERMISSION_KEY + '%');
  return rows.filter(function (r) {
    try { return Boolean(JSON.parse(r.permissions || '{}')[PERMISSION_KEY]); } catch (e) { return false; }
  }).map(function (r) {
    return { userId: r.id, username: tiktokLiveCheck.normalize(r.tiktok_username) };
  }).filter(function (u) { return u.username; });
}

function stop(username, reason) {
  var w = _watchers.get(username);
  if (!w) return;
  _watchers.delete(username);
  liveSessionStats.setWatching(username, false);
  try { w.connector.disconnect(); } catch (e) {}
  logger.log('Stats Watcher: stopped "' + username + '" (' + reason + ').');
}

function start(user) {
  var username = user.username;
  var connector = connectorRouter.createConnectorForPlatform('tiktok');
  if (!connector) return;
  var id = liveSessionStats.WATCH_PREFIX + username + ':' + Date.now().toString(36);
  var w = { connector: connector, connectionId: id, status: 'connecting', startedAt: Date.now(), connectedAt: null, userId: user.userId };
  _watchers.set(username, w);
  liveSessionStats.setWatching(username, true);
  logger.log('Stats Watcher: "' + username + '" is live — connecting.');

  function mine() { return _watchers.get(username) === w; }

  connector.connect({ username: username, statsOnly: true }, {
    onStatus: function (status) {
      if (!mine()) return;
      w.status = status;
      if (status === 'connected') {
        if (!w.connectedAt) w.connectedAt = Date.now();
        liveSessionStats.attach(username, connector.getRoomId ? connector.getRoomId() : null, id);
      } else if (status === 'ended') {
        liveSessionStats.markEnded(username, id);
        stop(username, 'stream ended');
      } else if (status === 'error') {
        stop(username, 'connection error — retry next check');
      }
    },
    onComment: function (d) { liveSessionStats.recordComment(username, id, d); },
    onGift: function (d) { liveSessionStats.recordGift(username, id, d); },
    onFollow: function () { liveSessionStats.recordFollow(username, id); },
    onViewerUpdate: function (d) { liveSessionStats.recordViewers(username, id, d.current, d.totalUsers); },
    onLike: function (d) { liveSessionStats.recordLike(username, id, d); },
    onShare: function (d) { liveSessionStats.recordShare(username, id, d); },
    onMember: function (d) { liveSessionStats.recordMember(username, id, d); }
  });
}

/** دورة وحدة: نوقف المراقب عن اللي انلغى تفعيلهم، ونبدأه لأي مفعّل صار يبث. */
function tick() {
  if (_ticking) return Promise.resolve();
  _ticking = true;
  var users;
  try { users = enabledUsers(); } catch (err) {
    _ticking = false;
    logger.error('Stats Watcher: failed to load enabled users:', err);
    return Promise.resolve();
  }
  var enabled = new Set(users.map(function (u) { return u.username; }));
  _watchers.forEach(function (w, username) { if (!enabled.has(username)) stop(username, 'disabled by admin'); });

  var pending = users.filter(function (u) { return !_watchers.has(u.username); });
  return pending.reduce(function (chain, u) {
    return chain.then(function () {
      return tiktokLiveCheck.isLive(u.username).then(function (live) {
        if (live === true && !_watchers.has(u.username) && enabled.has(u.username)) start(u);
      }).then(function () { return delay(CHECK_GAP_MS); });
    });
  }, Promise.resolve()).catch(function (err) {
    logger.error('Stats Watcher: check cycle failed:', err);
  }).then(function () { _ticking = false; });
}

function startWatcher() {
  if (_started) return;
  _started = true;
  setTimeout(function () {
    tick();
    var timer = setInterval(tick, CHECK_MS);
    if (timer.unref) timer.unref();
  }, START_DELAY_MS);
}

/** للأدمن («البثوث الشغّالة الآن»): المراقبات الشغّالة حالياً. */
function listWatchers() {
  var out = [];
  _watchers.forEach(function (w, username) {
    var u = null;
    try { u = db.prepare('SELECT id, username, custom_id, role, tiktok_avatar_url FROM users WHERE id = ?').get(w.userId); } catch (e) {}
    out.push({ username: username, user: u, status: w.status, startedAt: w.startedAt, connectedAt: w.connectedAt });
  });
  return out;
}

module.exports = {
  PERMISSION_KEY: PERMISSION_KEY,
  startWatcher: startWatcher,
  listWatchers: listWatchers,
  tick: tick
};
