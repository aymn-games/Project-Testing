/**
 * AGP LIVE SESSION STATS — إحصائيات بث تيك توك الواحد (زر «عرض إحصائيات
 * البث» بمكتبة الألعاب). الأقسام (SECTIONS): المكبّسين، الداعمين، اللي
 * سوّوا شير، المتفاعلين (التعليقات)، والحاضرين (دخول البث).
 *
 * كل شي بالذاكرة فقط — بدون أي كتابة SQLite لكل حدث (نفس سبب التجميع في
 * ws-server.js: Render محدود بـ0.5 CPU). كل حدث = تحديث رقم في Map.
 *
 * الجلسة = بث تيك توك واحد، مفتاحها يوزر الاستريمر. كل لعبة تفتح اتصال
 * WebSocket خاص فيها، فالتنقّل بين الألعاب يكمل نفس الجلسة: نفس Room ID
 * من تيك توك = نفس البث، Room ID مختلف = بث جديد (القديم يصير "آخر بث").
 * لو Room ID غير معروف، نكمل نفس الجلسة إذا ما مر عليها SESSION_GAP_MS.
 *
 * لو فيه أكثر من اتصال لنفس البث بنفس اللحظة (تبويبين/لعبتين) نحسب أحداث
 * اتصال واحد فقط (ownerConnectionId) عشان ما تنحسب الأحداث مرتين.
 *
 * الصور: نحفظ رابط صورة تيك توك لكل مستخدم، وتُحمَّل الصور (Data URL)
 * فقط لما يطلب الاستريمر الملخص، وفقط لأصحاب المراكز المطلوبة — مع كاش
 * صغير بالذاكرة. التحميل بالسيرفر لأن صور تيك توك ما تسمح برسمها على
 * Canvas مباشرة من المتصفح (CORS).
 *
 * ملاحظة: الأحداث تنحسب فقط والاستريمر فاتح لعبة متصلة بالبث. إعادة تشغيل
 * السيرفر تمسح الإحصائيات (ما تنحفظ بقاعدة البيانات).
 */

'use strict';

var db = require('../db/database');
var tiktokAvatarSync = require('../auth/tiktok-avatar-sync');

var SESSION_GAP_MS = 30 * 60 * 1000;          // انقطاع أطول من كذا بدون Room ID = بث جديد
var RETENTION_MS = 24 * 60 * 60 * 1000;       // نحتفظ بآخر بث ٢٤ ساعة بعد آخر نشاط
var CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
var MAX_USERS_PER_LIST = 5000;                // سقف الذاكرة لكل قائمة بالبث الواحد
var MAX_TOP = 20;
var DEFAULT_TOP = 10;
var AVATAR_CACHE_MAX = 500;
var AVATAR_CONCURRENCY = 8;

// القسم -> الحقل اللي نرتّب عليه ('joinedAt' تصاعدي = أول من دخل أولاً)
var SECTIONS = {
  likers: 'count',
  gifters: 'diamonds',
  sharers: 'count',
  commenters: 'count',
  viewers: 'joinedAt'
};

var _sessions = new Map(); // username -> session
var _avatarCache = new Map(); // url -> dataUrl|null
var _cleanupStarted = false;

function normalize(name) {
  return String(name || '').trim().replace(/^@+/, '').toLowerCase();
}

function newSession(username, roomId, connectionId) {
  var s = {
    username: username,
    roomId: roomId || null,
    ownerConnectionId: connectionId,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    endedAt: null,
    totals: { likes: 0, diamonds: 0, gifts: 0, shares: 0, comments: 0, follows: 0, joins: 0, peakViewers: 0, totalViewers: 0 },
    lists: {}
  };
  Object.keys(SECTIONS).forEach(function (k) { s.lists[k] = new Map(); });
  return s;
}

function startCleanup() {
  if (_cleanupStarted) return;
  _cleanupStarted = true;
  var timer = setInterval(function () {
    var cutoff = Date.now() - RETENTION_MS;
    _sessions.forEach(function (s, key) {
      if (s.lastActivityAt < cutoff) _sessions.delete(key);
    });
  }, CLEANUP_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

/**
 * يُستدعى لما تيك توك يؤكّد الاتصال. يرجع نفس الجلسة أو يبدأ بث جديد.
 */
function attach(username, roomId, connectionId) {
  startCleanup();
  var key = normalize(username);
  if (!key) return;
  var s = _sessions.get(key);
  var sameStream = s && (
    (roomId && s.roomId) ? String(roomId) === String(s.roomId)
      : (!s.endedAt && Date.now() - s.lastActivityAt < SESSION_GAP_MS)
  );
  if (!sameStream) {
    _sessions.set(key, newSession(key, roomId, connectionId));
    return;
  }
  s.ownerConnectionId = connectionId;
  s.endedAt = null;
  if (roomId && !s.roomId) s.roomId = roomId;
  s.lastActivityAt = Date.now();
}

/** يرجع الجلسة فقط لو هذا الاتصال هو المالك الحالي لها. */
function owned(username, connectionId) {
  var s = _sessions.get(normalize(username));
  if (!s || s.endedAt || s.ownerConnectionId !== connectionId) return null;
  s.lastActivityAt = Date.now();
  return s;
}

/** سجل المستخدم بالقائمة (ينشئه لو جديد)، أو null لو القائمة وصلت السقف. */
function rec(map, data) {
  if (!data || !data.id) return null;
  var r = map.get(data.id);
  if (!r) {
    if (map.size >= MAX_USERS_PER_LIST) return null;
    r = { id: data.id, name: data.name || data.id, avatarUrl: null, count: 0, diamonds: 0, joinedAt: Date.now() };
    map.set(data.id, r);
  } else if (data.name) {
    r.name = data.name;
  }
  if (data.avatarUrl) r.avatarUrl = data.avatarUrl;
  return r;
}

function recordLike(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  var n = Number(data.count) || 1;
  s.totals.likes += n;
  var r = rec(s.lists.likers, data);
  if (r) r.count += n;
}

function recordShare(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  s.totals.shares++;
  var r = rec(s.lists.sharers, data);
  if (r) r.count++;
}

function recordGift(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  var repeat = Number(data.repeatCount) || 1;
  var diamonds = (Number(data.giftValue) || 0) * repeat;
  s.totals.gifts += repeat;
  s.totals.diamonds += diamonds;
  var r = rec(s.lists.gifters, data);
  if (r) { r.count += repeat; r.diamonds += diamonds; }
}

function recordComment(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  s.totals.comments++;
  var r = rec(s.lists.commenters, data);
  if (r) r.count++;
}

function recordMember(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  s.totals.joins++;
  var r = rec(s.lists.viewers, data);
  if (r) r.count++;
}

function recordFollow(username, connectionId) {
  var s = owned(username, connectionId);
  if (s) s.totals.follows++;
}

function recordViewers(username, connectionId, current, totalUsers) {
  var s = owned(username, connectionId);
  if (!s) return;
  s.totals.peakViewers = Math.max(s.totals.peakViewers, Number(current) || 0);
  s.totals.totalViewers = Math.max(s.totals.totalViewers, Number(totalUsers) || 0);
}

/** انتهى البث فعلياً في تيك توك. */
function markEnded(username, connectionId) {
  var s = _sessions.get(normalize(username));
  if (!s || s.ownerConnectionId !== connectionId) return;
  s.endedAt = Date.now();
}

function top(map, field, n) {
  var list = [];
  map.forEach(function (r) { list.push(r); });
  if (field === 'joinedAt') list.sort(function (a, b) { return a.joinedAt - b.joinedAt; });
  else list.sort(function (a, b) { return b[field] - a[field]; });
  return list.slice(0, n).map(function (r) {
    return { name: r.name, username: r.id, count: r.count, diamonds: r.diamonds, joinedAt: r.joinedAt, avatarUrl: r.avatarUrl };
  });
}

function cachedAvatar(url) {
  if (!url) return Promise.resolve(null);
  if (_avatarCache.has(url)) return Promise.resolve(_avatarCache.get(url));
  return tiktokAvatarSync.downloadAvatarDataUrl(url).then(function (dataUrl) {
    if (_avatarCache.size >= AVATAR_CACHE_MAX) _avatarCache.delete(_avatarCache.keys().next().value);
    _avatarCache.set(url, dataUrl || null);
    return dataUrl || null;
  }, function () { return null; });
}

/** يستبدل avatarUrl بـ avatar (Data URL) لكل عنصر، بحد أقصى AVATAR_CONCURRENCY بنفس اللحظة. */
function attachAvatars(items) {
  var i = 0;
  function worker() {
    if (i >= items.length) return Promise.resolve();
    var item = items[i++];
    return cachedAvatar(item.avatarUrl).then(function (a) {
      item.avatar = a;
      delete item.avatarUrl;
      return worker();
    });
  }
  var workers = [];
  for (var w = 0; w < Math.min(AVATAR_CONCURRENCY, items.length); w++) workers.push(worker());
  return Promise.all(workers);
}

/**
 * ملخص البث الحالي/الأخير لهذا اليوزر، أو null لو ما فيه.
 * @param {string} username
 * @param {Object<string, number>} [tops] - القسم -> عدد التوب المطلوب (الأقسام غير المذكورة ما ترجع)
 * @param {boolean} [withAvatars]
 * @returns {Promise<Object|null>}
 */
function getSummary(username, tops, withAvatars) {
  var s = _sessions.get(normalize(username));
  if (!s) return Promise.resolve(null);
  var end = s.endedAt || s.lastActivityAt;
  var counts = {}, sections = {}, all = [];
  Object.keys(SECTIONS).forEach(function (k) {
    counts[k] = s.lists[k].size;
    var n = tops ? Math.min(MAX_TOP, Math.max(0, Math.floor(Number(tops[k]) || 0))) : DEFAULT_TOP;
    if (!n) return;
    sections[k] = top(s.lists[k], SECTIONS[k], n);
    all = all.concat(sections[k]);
  });
  var summary = {
    username: s.username,
    live: !s.endedAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationMs: Math.max(0, end - s.startedAt),
    totals: Object.assign({}, s.totals),
    counts: counts,
    sections: sections
  };
  if (!withAvatars) {
    all.forEach(function (it) { delete it.avatarUrl; });
    return Promise.resolve(summary);
  }
  return attachAvatars(all).then(function () { return summary; });
}

/**
 * اسم وصورة صاحب البث لأعلى الصورة: صورة البروفايل المحفوظة بالموقع، وإلا
 * صورة تيك توك المربوطة.
 * @returns {Promise<{name: string, avatar: string|null}>}
 */
function getStreamerProfile(username) {
  var key = normalize(username);
  var row = null;
  try {
    row = db.prepare(
      'SELECT display_name, username, tiktok_display_name, tiktok_avatar_url, avatar_image_base64 FROM users ' +
      'WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
    ).get(key);
  } catch (e) { row = null; }
  var name = (row && (row.tiktok_display_name || row.display_name || row.username)) || key;
  if (row && row.avatar_image_base64) return Promise.resolve({ name: name, avatar: row.avatar_image_base64 });
  return cachedAvatar(row && row.tiktok_avatar_url).then(function (a) { return { name: name, avatar: a }; });
}

module.exports = {
  getStreamerProfile: getStreamerProfile,
  SECTIONS: Object.keys(SECTIONS),
  MAX_TOP: MAX_TOP,
  attach: attach,
  recordLike: recordLike,
  recordShare: recordShare,
  recordGift: recordGift,
  recordComment: recordComment,
  recordMember: recordMember,
  recordFollow: recordFollow,
  recordViewers: recordViewers,
  markEnded: markEnded,
  getSummary: getSummary,
  cachedAvatar: cachedAvatar
};
