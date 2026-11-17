/**
 * AGP LIVE PRESENCE — حضور خفيف لألعاب الباركود بقائمة «البثوث الشغّالة».
 *
 * قائمة /api/public/live-streams تعتمد على اتصالات تيك توك المفتوحة بالسيرفر.
 * بعض الألعاب ما عندها اتصال تيك توك خاص فيها، لأن اللاعبين يدخلون بالباركود
 * من جوالاتهم: المافيا، محطة سهيل، حفلة الميلاد، ومن الأمبوستر. اتصالها
 * الوحيد كان أوفرلي البث، وهو مقفول افتراضياً (config.overlayStreamConnect)
 * لأنه يستهلك من حد EulerStream.
 *
 * البديل: شاشة المذيع بهذي الألعاب ترسل نبضة كل شوي
 * (js/agp-live-presence.js → POST /api/stream/presence). نتأكد إن المذيع
 * يبث فعلاً بفحص HTTP خفيف بدون توقيع (platforms/tiktok/tiktok-live-check.js،
 * مخزَّن 30 ثانية لكل يوزر)، فما نستهلك شي من EulerStream. الحضور بالذاكرة
 * فقط، وينتهي لحاله لو وقفت النبضات (TTL_MS). عدد المشاهدين من نفس الفحص
 * (صفحة البث فيها العدد) — يتحدّث مع كل نبضة، ولو ما انجاب يطلع «—».
 */

'use strict';

var logger = require('../utils/logger');
var tiktokLiveCheck = require('../platforms/tiktok/tiktok-live-check');

// الألعاب المسموح لها بالحضور — بس اللي ما عندها اتصال تيك توك خاص فيها.
var GAMES = {
  'mafia': 'المافيا',
  'intruder': 'محطة سهيل',
  'birthday-party': 'حفلة الميلاد',
  'impostor': 'من الأمبوستر؟'
};

var TTL_MS = 2 * 60 * 1000; // النبضة كل 45 ثانية بالواجهة؛ نتحمّل نبضة أو نبضتين ضايعة

var _presence = new Map(); // tiktokUsername -> { userId, customId, slug, gameName, since, lastSeen, live, viewers }

function prune() {
  var now = Date.now();
  _presence.forEach(function (p, username) {
    if (now - p.lastSeen > TTL_MS) _presence.delete(username);
  });
}

/**
 * نبضة من شاشة المذيع. user = صاحب الجلسة (من التوكن). leave = الصفحة تتسكّر.
 * يرجع Promise بـ{ success, live } أو { success:false, error }.
 */
function report(user, slug, leave) {
  slug = String(slug || '').toLowerCase();
  if (!GAMES[slug]) return Promise.resolve({ success: false, error: 'invalid_game' });
  if (!user || !user.tiktok_verified || !user.tiktok_username) return Promise.resolve({ success: false, error: 'tiktok_not_linked' });
  var username = tiktokLiveCheck.normalize(user.tiktok_username);
  if (!username) return Promise.resolve({ success: false, error: 'tiktok_not_linked' });

  if (leave) {
    var cur = _presence.get(username);
    if (cur && cur.slug === slug) _presence.delete(username);
    return Promise.resolve({ success: true, live: false });
  }

  var now = Date.now();
  var prev = _presence.get(username);
  var entry = {
    userId: user.id,
    customId: user.custom_id || null,
    slug: slug,
    gameName: GAMES[slug],
    since: prev && prev.slug === slug ? prev.since : now,
    lastSeen: now,
    live: prev ? prev.live : null,
    viewers: prev ? prev.viewers : null
  };
  _presence.set(username, entry);

  return tiktokLiveCheck.liveInfo(username).then(function (info) {
    // null = الفحص ما قدر يتأكد: نخلي آخر نتيجة معروفة
    if (info && info.live !== null && _presence.get(username) === entry) {
      entry.live = info.live;
      // عدد المشاهدين: آخر رقم معروف يبقى لو هالمرة ما انجاب (الصفحة ما رجعته)
      if (!info.live) entry.viewers = null;
      else if (typeof info.viewers === 'number') entry.viewers = info.viewers;
    }
    return { success: true, live: entry.live === true };
  }, function (err) {
    logger.error('Live Presence: live check failed for "' + username + '":', err);
    return { success: true, live: entry.live === true };
  });
}

/** الحضور الحالي اللي تأكدنا إنه يبث — لبطاقات «البثوث الشغّالة». */
function listLive() {
  prune();
  var out = [];
  _presence.forEach(function (p, username) {
    if (p.live !== true) return;
    out.push({ username: username, userId: p.userId, customId: p.customId, gameSlug: p.slug, gameName: p.gameName, since: p.since, viewers: typeof p.viewers === 'number' ? p.viewers : null });
  });
  return out;
}

module.exports = {
  _clear: function () { _presence.clear(); },   // للاختبارات
  GAMES: GAMES,
  report: report,
  listLive: listLive
};
