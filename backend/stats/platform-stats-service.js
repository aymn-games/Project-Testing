/**
 * AGP PLATFORM STATS SERVICE — أرقام حقيقية لقسم "الأرقام" بالصفحة
 * الرئيسية (تبويبات المنصة/الاستريمرز/اللاعبين)، محسوبة من الجداول
 * الفعلية (users/broadcasts/user_points) بدل أرقام تجريبية ثابتة.
 *
 * الحساب مُكلف نسبياً (تجميع على broadcasts/user_points)، فيُخزَّن
 * الناتج بجدول platform_stats_cache ولا يُعاد حسابه إلا كل ٣ أيام كحد
 * أقصى (CACHE_MAX_AGE_MS) — استدعاء getCachedStats() المتكرر من كل
 * زيارة للصفحة الرئيسية يقرأ الصف المخزَّن غالباً، لا يعيد التجميع في
 * كل مرة. عدد الألعاب نفسه ليس هنا عمداً — الواجهة تجيبه مباشرة من
 * games.html فيبقى حياً فوراً بلا أي تخزين مؤقت (راجع index.html).
 */

'use strict';

var db = require('../db/database');

var CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 أيام

function now() { return Date.now(); }

function startOfCurrentUtcMonthMs() {
    var d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function computeStats() {
    var totalAccounts = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

    var monthStart = startOfCurrentUtcMonthMs();
    var activeStreamersThisMonth = db.prepare(
        'SELECT COUNT(DISTINCT user_id) AS c FROM broadcasts WHERE started_at >= ?'
    ).get(monthStart).c;

    var trailing30dStart = now() - 30 * 24 * 60 * 60 * 1000;
    var last30dBroadcasts = db.prepare(
        'SELECT COUNT(*) AS c FROM broadcasts WHERE started_at >= ?'
    ).get(trailing30dStart).c;
    var avgDailyLiveStreams = Math.round(last30dBroadcasts / 30);

    var avgSessionRow = db.prepare(
        'SELECT AVG(ended_at - started_at) AS avgMs FROM broadcasts WHERE ended_at IS NOT NULL AND ended_at > started_at'
    ).get();
    var avgSessionMinutes = avgSessionRow.avgMs ? Math.round(avgSessionRow.avgMs / 60000) : 0;

    var monthlyViewersRow = db.prepare(
        'SELECT SUM(total_unique_viewers) AS total FROM broadcasts WHERE started_at >= ?'
    ).get(monthStart);
    var monthlyViewersMillions = Math.round(((monthlyViewersRow.total || 0) / 1000000) * 10) / 10;

    var totalRoundsRow = db.prepare('SELECT SUM(games_played) AS total FROM user_points').get();
    var totalRoundsPlayed = totalRoundsRow.total || 0;

    return {
        totalAccounts: totalAccounts,
        activeStreamersThisMonth: activeStreamersThisMonth,
        avgDailyLiveStreams: avgDailyLiveStreams,
        avgSessionMinutes: avgSessionMinutes,
        monthlyViewersMillions: monthlyViewersMillions,
        totalRoundsPlayed: totalRoundsPlayed
    };
}

/**
 * @returns {{stats: Object, computedAt: number}}
 */
function getCachedStats() {
    var row = db.prepare('SELECT data, computed_at FROM platform_stats_cache WHERE id = 1').get();
    if (row && (now() - row.computed_at) < CACHE_MAX_AGE_MS) {
        return { stats: JSON.parse(row.data), computedAt: row.computed_at };
    }

    var stats = computeStats();
    var computedAt = now();
    db.prepare(
        'INSERT INTO platform_stats_cache (id, data, computed_at) VALUES (1, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET data = excluded.data, computed_at = excluded.computed_at'
    ).run(JSON.stringify(stats), computedAt);

    return { stats: stats, computedAt: computedAt };
}

module.exports = {
    getCachedStats: getCachedStats
};
