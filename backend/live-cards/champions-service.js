/**
 * AGP TOP-1 CHAMPIONS — كم مرة كل ستريمر أخذ المركز الأول بتصنيف الاستريمرز
 * الأسبوعي (ساعات البث، يتصفر كل سبت — getRankingPeriodStart بـauth-service).
 *
 * المصدر: جدول ranking_snapshots (stats/last-week-ranking-service.js) — صف لكل
 * أسبوع منتهي، وأول واحد بقائمة streamers هو بطل الأسبوع. قبل العدّ نتأكد إن
 * كل الأسابيع المنتهية محفوظة من أول بث مسجّل (ensureAllSnapshots) — فالألقاب
 * القديمة (حتى قبل تصفير التصنيف) تنحسب.
 *
 * العدد يرجع مع كل بث بـ/api/public/live-streams (champion)، والواجهة
 * (js/agp-live-streams.js) ترسم بطاقة «بطل التوب» تتطور مع كل لقب جديد:
 * 1 برونزي، 2 فضي، 3 ذهبي، 4 بلاتيني، 5+ أسطوري.
 *
 * النتيجة محفوظة بالذاكرة لين يبدأ أسبوع جديد (التصنيف ما يتغير بنص الأسبوع
 * لأنه يعد الأسابيع المنتهية بس).
 */

'use strict';

var db = require('../db/database');
var authService = require('../auth/auth-service');
var lastWeekRanking = require('../stats/last-week-ranking-service');
var logger = require('../utils/logger');

var _cache = null; // { periodStart, counts: { userId: n } }

/**
 * صاحب لقب أسبوع محفوظ → معرّف حسابه الداخلي (users.id). الصف المحفوظ فيه
 * customId ويوزر تيك توك كما كانوا وقتها، والستريمر ممكن يغيّر اسمه أو الـID
 * العام بعدها — فنطابق أول بيوزر تيك توك الموثَّق (ثابت للحساب)، وبعده بالـID
 * لو ما لقينا. بدون هذا يضيع لقبه أول ما يغيّر الـID.
 */
function resolveUserId(top, byTiktok, byCustomId) {
    var tk = String(top.tiktokUsername || '').trim().replace(/^@+/, '').toLowerCase();
    if (tk && byTiktok[tk]) return byTiktok[tk];
    if (top.customId && byCustomId[top.customId]) return byCustomId[top.customId];
    return null;
}

function computeCounts() {
    var byTiktok = {}, byCustomId = {};
    db.prepare('SELECT id, custom_id, tiktok_username, tiktok_verified FROM users').all().forEach(function (u) {
        if (u.custom_id) byCustomId[u.custom_id] = u.id;
        if (u.tiktok_verified && u.tiktok_username) byTiktok[String(u.tiktok_username).trim().replace(/^@+/, '').toLowerCase()] = u.id;
    });
    var counts = {};
    db.prepare('SELECT data FROM ranking_snapshots').all().forEach(function (row) {
        var data;
        try { data = JSON.parse(row.data); } catch (err) { return; }
        var top = data && data.streamers && data.streamers[0];
        var userId = top ? resolveUserId(top, byTiktok, byCustomId) : null;
        if (userId) counts[userId] = (counts[userId] || 0) + 1;
    });
    return counts;
}

/** { userId: عدد مرات التوب ون } — للأسابيع المنتهية. */
function getCounts() {
    var periodStart = authService.getRankingPeriodStart();
    if (_cache && _cache.periodStart === periodStart) return _cache.counts;
    try { lastWeekRanking.ensureAllSnapshots(); } catch (err) { logger.error('Champions: snapshot backfill failed:', err); }
    _cache = { periodStart: periodStart, counts: computeCounts() };
    return _cache.counts;
}

/** عدد مرات التوب ون لحساب واحد بمعرّفه الداخلي (users.id) — 0 لو ولا مرة. */
function getChampionCount(userId) {
    if (!userId) return 0;
    return getCounts()[userId] || 0;
}

/** للاختبارات/الأدمن بعد تصفير التصنيف. */
function clearCache() { _cache = null; }

module.exports = {
    getCounts: getCounts,
    getChampionCount: getChampionCount,
    clearCache: clearCache
};
