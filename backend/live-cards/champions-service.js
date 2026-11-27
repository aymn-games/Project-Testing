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

var _cache = null; // { periodStart, counts: { customId: n } }

function computeCounts() {
    var counts = {};
    db.prepare('SELECT data FROM ranking_snapshots').all().forEach(function (row) {
        var data;
        try { data = JSON.parse(row.data); } catch (err) { return; }
        var top = data && data.streamers && data.streamers[0];
        if (top && top.customId) counts[top.customId] = (counts[top.customId] || 0) + 1;
    });
    return counts;
}

/** { customId: عدد مرات التوب ون } — للأسابيع المنتهية. */
function getCounts() {
    var periodStart = authService.getRankingPeriodStart();
    if (_cache && _cache.periodStart === periodStart) return _cache.counts;
    try { lastWeekRanking.ensureAllSnapshots(); } catch (err) { logger.error('Champions: snapshot backfill failed:', err); }
    _cache = { periodStart: periodStart, counts: computeCounts() };
    return _cache.counts;
}

/** عدد مرات التوب ون لحساب واحد (0 لو ولا مرة). */
function getChampionCount(customId) {
    if (!customId) return 0;
    return getCounts()[customId] || 0;
}

/** للاختبارات/الأدمن بعد تصفير التصنيف. */
function clearCache() { _cache = null; }

module.exports = {
    getCounts: getCounts,
    getChampionCount: getChampionCount,
    clearCache: clearCache
};
