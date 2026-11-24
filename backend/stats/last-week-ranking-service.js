/**
 * AGP LAST WEEK RANKING — تصنيف «الأسبوع الماضي» المحفوظ.
 *
 * التصنيف الأسبوعي (توب الاستريمرز بالساعات، توب اللاعبين بالفوز) يتصفر
 * كل سبت 12:00 ص بتوقيت السعودية (getRankingPeriodStart بـauth-service)،
 * والقوائم العامة تعرض الأسبوع الحالي بس. هنا نحفظ نتيجة الأسبوع اللي
 * خلص كما هي بجدول ranking_snapshots، صف واحد لكل أسبوع، عشان تتعرض
 * بتبويب «الأسبوع الماضي» وما تتغير بعدها (حتى لو تغيّر اسم أو صورة).
 *
 * الحفظ كسول: أول طلب بعد بداية الأسبوع الجديد يحسب الفترة اللي قبله
 * [بدايتها، بداية الأسبوع الحالي) من نفس الجداول المؤرخة اللي يحسب منها
 * التصنيف الحالي، ويخزنها. الطلبات اللي بعده تقرأ الصف المحفوظ بس.
 * وعشان البيانات مؤرخة، أول تشغيل يحفظ الأسبوع الماضي مباشرة بدون انتظار.
 *
 * لو الأدمن صفّر التصنيف بنص الأسبوع (streamer_ranking_reset_at)، الفترة
 * السابقة تنتهي عند لحظة التصفير.
 */

'use strict';

var db = require('../db/database');
var authService = require('../auth/auth-service');
var pointsService = require('../points/points-service');

var RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
var DAY_MS = 24 * 60 * 60 * 1000;
var SATURDAY = 6; // getUTCDay()
var SNAPSHOT_LIMIT = 10;

function now() { return Date.now(); }

/** بداية الأسبوع (سبت 12:00 ص بتوقيت السعودية) اللي فيه اللحظة ms — بدون تصفير الأدمن. */
function weekStartOf(ms) {
    var riyadh = new Date(ms + RIYADH_OFFSET_MS);
    var riyadhMidnight = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate());
    var daysSinceSaturday = (riyadh.getUTCDay() - SATURDAY + 7) % 7;
    return riyadhMidnight - daysSinceSaturday * DAY_MS - RIYADH_OFFSET_MS;
}

/**
 * الفترة اللي خلصت قبل الفترة الحالية.
 * @returns {{start: number, end: number}}
 */
function previousPeriod(nowMs) {
    var end = authService.getRankingPeriodStart(nowMs || now());
    var start = weekStartOf(end - 1);
    var row = db.prepare("SELECT value FROM app_settings WHERE key = 'streamer_ranking_reset_at'").get();
    var resetAt = row ? Number(row.value) || 0 : 0;
    if (resetAt > start && resetAt < end) start = resetAt;
    return { start: start, end: end };
}

function computeSnapshot(period) {
    return {
        streamers: authService.computeTopStreamersByHours(SNAPSHOT_LIMIT, period.start, period.end),
        players: pointsService.getTopPlayersByWins(SNAPSHOT_LIMIT, period.start, period.end)
    };
}

/**
 * تصنيف الأسبوع الماضي — يحفظه أول مرة ويرجع المحفوظ بعدها.
 * @returns {{periodStart: number, periodEnd: number, streamers: Array, players: Array, savedAt: number}}
 */
function getLastWeekRanking(nowMs) {
    var period = previousPeriod(nowMs);
    var row = db.prepare('SELECT period_end, data, created_at FROM ranking_snapshots WHERE period_start = ?').get(period.start);
    if (!row) {
        var data = computeSnapshot(period);
        var savedAt = now();
        db.prepare('INSERT OR IGNORE INTO ranking_snapshots (period_start, period_end, data, created_at) VALUES (?, ?, ?, ?)')
            .run(period.start, period.end, JSON.stringify(data), savedAt);
        row = db.prepare('SELECT period_end, data, created_at FROM ranking_snapshots WHERE period_start = ?').get(period.start);
    }
    var saved = JSON.parse(row.data);
    return {
        periodStart: period.start,
        periodEnd: row.period_end,
        streamers: saved.streamers || [],
        players: saved.players || [],
        savedAt: row.created_at
    };
}

module.exports = {
    getLastWeekRanking: getLastWeekRanking,
    previousPeriod: previousPeriod,
    weekStartOf: weekStartOf
};
