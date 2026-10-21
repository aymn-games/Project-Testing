/**
 * AGP LIVE SESSION STATS — إحصائيات بث تيك توك الواحد (زر «عرض إحصائيات
 * البث» بمكتبة الألعاب): المكبّسين، الداعمين، اللي سوّوا شير، مع
 * إجماليات البث.
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
 * ملاحظة: الأحداث تنحسب فقط والاستريمر فاتح لعبة متصلة بالبث. إعادة تشغيل
 * السيرفر تمسح الإحصائيات (ما تنحفظ بقاعدة البيانات).
 */

'use strict';

var SESSION_GAP_MS = 30 * 60 * 1000;          // انقطاع أطول من كذا بدون Room ID = بث جديد
var RETENTION_MS = 24 * 60 * 60 * 1000;       // نحتفظ بآخر بث ٢٤ ساعة بعد آخر نشاط
var CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
var MAX_USERS_PER_LIST = 5000;                // سقف الذاكرة لكل قائمة بالبث الواحد
var TOP_N = 10;

var _sessions = new Map(); // username -> session
var _cleanupStarted = false;

function normalize(name) {
  return String(name || '').trim().replace(/^@+/, '').toLowerCase();
}

function newSession(username, roomId, connectionId) {
  return {
    username: username,
    roomId: roomId || null,
    ownerConnectionId: connectionId,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    endedAt: null,
    totals: { likes: 0, diamonds: 0, gifts: 0, shares: 0, comments: 0, follows: 0, peakViewers: 0, totalViewers: 0 },
    likers: new Map(),
    gifters: new Map(),
    sharers: new Map()
  };
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

function bump(map, id, name, field, amount) {
  if (!id) return;
  var rec = map.get(id);
  if (!rec) {
    if (map.size >= MAX_USERS_PER_LIST) return;
    rec = { id: id, name: name || id, count: 0, diamonds: 0 };
    map.set(id, rec);
  } else if (name) {
    rec.name = name;
  }
  rec[field] += amount;
}

function recordLike(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  var n = Number(data.count) || 1;
  s.totals.likes += n;
  bump(s.likers, data.id, data.name, 'count', n);
}

function recordShare(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  s.totals.shares++;
  bump(s.sharers, data.id, data.name, 'count', 1);
}

function recordGift(username, connectionId, data) {
  var s = owned(username, connectionId);
  if (!s) return;
  var repeat = Number(data.repeatCount) || 1;
  var diamonds = (Number(data.giftValue) || 0) * repeat;
  s.totals.gifts += repeat;
  s.totals.diamonds += diamonds;
  bump(s.gifters, data.id, data.name, 'diamonds', diamonds);
  var rec = s.gifters.get(data.id);
  if (rec) rec.count += repeat;
}

function recordComment(username, connectionId) {
  var s = owned(username, connectionId);
  if (s) s.totals.comments++;
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

function top(map, field) {
  var list = [];
  map.forEach(function (r) { list.push(r); });
  list.sort(function (a, b) { return b[field] - a[field]; });
  return list.slice(0, TOP_N).map(function (r) {
    return { name: r.name, username: r.id, count: r.count, diamonds: r.diamonds };
  });
}

/**
 * ملخص البث الحالي/الأخير لهذا اليوزر، أو null لو ما فيه.
 */
function getSummary(username) {
  var s = _sessions.get(normalize(username));
  if (!s) return null;
  var end = s.endedAt || s.lastActivityAt;
  return {
    username: s.username,
    live: !s.endedAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationMs: Math.max(0, end - s.startedAt),
    totals: Object.assign({}, s.totals),
    counts: { likers: s.likers.size, gifters: s.gifters.size, sharers: s.sharers.size },
    topLikers: top(s.likers, 'count'),
    topGifters: top(s.gifters, 'diamonds'),
    topSharers: top(s.sharers, 'count')
  };
}

module.exports = {
  attach: attach,
  recordLike: recordLike,
  recordShare: recordShare,
  recordGift: recordGift,
  recordComment: recordComment,
  recordFollow: recordFollow,
  recordViewers: recordViewers,
  markEnded: markEnded,
  getSummary: getSummary
};
