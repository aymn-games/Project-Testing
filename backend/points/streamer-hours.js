/**
 * AGP STREAMER HOURS — ساعات البث المحتسبة للاستريمر (التصنيف الأسبوعي،
 * البروفايل، مستوى SP).
 *
 * قبل لحظة التحويل (CUTOVER_KEY): الساعات = مدة اتصال صفحة اللعبة ببث تيك
 * توك (جدول broadcasts) — كانت تنحسب حتى لو بقي التبويب مفتوح بدون لعب.
 * من لحظة التحويل: الساعات = وقت المباريات المكتملة فقط (جدول
 * streamer_match_time)، يُسجَّل عند إعلان الفائز. انتهاء المباراة والرجوع
 * للمكتبة = يوقف الحساب.
 *
 * لحظة التحويل = أول تصفير أسبوعي للتصنيف (سبت 12:00 ص بتوقيت السعودية)
 * بعد تشغيل هذا التحديث — الأسبوع الجاري يكمل على الحساب القديم.
 * بيانات broadcasts القديمة ما تنحذف (الهدايا/المشاهدين تبقى منها).
 */

'use strict';

var db = require('../db/database');

var RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
var DAY_MS = 24 * 60 * 60 * 1000;
var SATURDAY = 6; // getUTCDay()
var CUTOVER_KEY = 'streamer_hours_match_based_from';

// تقرير نهاية مباراة يوصل بعد انتهاء البث بلحظات (انقطاع/إغلاق) يُقبل.
var BROADCAST_GRACE_MS = 2 * 60 * 1000;
// بث مفتوح (ended_at = NULL) أقدم من هذا يُعتبر يتيم (توقف خادم) ولا يُعتمد.
var OPEN_BROADCAST_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function nextRiyadhSaturday(nowMs) {
    var riyadh = new Date(nowMs + RIYADH_OFFSET_MS);
    var riyadhMidnight = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate());
    var daysSinceSaturday = (riyadh.getUTCDay() - SATURDAY + 7) % 7;
    return riyadhMidnight + (7 - daysSinceSaturday) * DAY_MS - RIYADH_OFFSET_MS;
}

db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(CUTOVER_KEY, String(nextRiyadhSaturday(Date.now())));
var CUTOVER_AT = Number(db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CUTOVER_KEY).value) || 0;

function getCutoverAt() { return CUTOVER_AT; }

/**
 * تسجيل وقت مباراة مكتملة لحساب الاستريمر. يُقبل فقط لو عنده بث مباشر
 * مسجَّل الآن (أو انتهى قبل لحظات)، وبداية المباراة تُقصّ لبداية البث
 * ولنهاية آخر مباراة مسجّلة (ما يتكرر احتساب نفس الوقت).
 * @param {number} userId
 * @param {number} durationMs - مدة المباراة كما أرسلتها اللعبة
 * @returns {number} المدة المسجّلة فعلياً (ms)
 */
function recordMatchTime(userId, durationMs) {
    var dur = Math.max(0, Number(durationMs) || 0);
    if (!userId || !dur) return 0;
    var end = Date.now();
    var b = db.prepare(
        `SELECT started_at, ended_at FROM broadcasts
         WHERE user_id = ? AND (ended_at >= ? OR (ended_at IS NULL AND started_at >= ?))
         ORDER BY started_at DESC LIMIT 1`
    ).get(userId, end - BROADCAST_GRACE_MS, end - OPEN_BROADCAST_MAX_AGE_MS);
    if (!b) return 0;
    if (b.ended_at) end = Math.min(end, b.ended_at);
    var last = db.prepare('SELECT MAX(ended_at) AS t FROM streamer_match_time WHERE user_id = ?').get(userId);
    var start = Math.max(end - dur, b.started_at, (last && last.t) || 0);
    if (end <= start) return 0;
    db.prepare('INSERT INTO streamer_match_time (user_id, started_at, ended_at) VALUES (?, ?, ?)').run(userId, start, end);
    return end - start;
}

/**
 * استعلام فرعي (user_id, total_ms): ساعات البث المحتسبة لكل مستخدم من لحظة
 * @hoursFrom — الجزء قبل التحويل من broadcasts، والجزء بعده من
 * streamer_match_time. معاملاته المسمّاة تأتي من hoursParams(periodStart)
 * (periodStart = 0 → تراكمي كامل).
 */
var HOURS_BY_USER_SQL =
    `SELECT user_id, SUM(ms) AS total_ms FROM (
        SELECT user_id, MAX(0, MIN(ended_at, @cutover) - MAX(started_at, @hoursFrom)) AS ms
          FROM broadcasts WHERE ended_at IS NOT NULL
        UNION ALL
        SELECT user_id, MAX(0, ended_at - MAX(started_at, @cutover, @hoursFrom)) AS ms
          FROM streamer_match_time
    ) GROUP BY user_id`;

function hoursParams(periodStart) {
    return { hoursFrom: periodStart || 0, cutover: CUTOVER_AT };
}

/** ساعات البث المحتسبة (ms) لمستخدم واحد — تراكمي كامل. */
function getTotalLiveMs(userId) {
    var p = hoursParams(0);
    var row = db.prepare(
        `SELECT
            (SELECT COALESCE(SUM(MAX(0, MIN(ended_at, @cutover) - started_at)), 0) FROM broadcasts
              WHERE user_id = @userId AND ended_at IS NOT NULL) +
            (SELECT COALESCE(SUM(MAX(0, ended_at - MAX(started_at, @cutover))), 0) FROM streamer_match_time
              WHERE user_id = @userId) AS total_ms`
    ).get({ userId: userId, cutover: p.cutover });
    return row ? row.total_ms : 0;
}

module.exports = {
    getCutoverAt: getCutoverAt,
    recordMatchTime: recordMatchTime,
    getTotalLiveMs: getTotalLiveMs,
    HOURS_BY_USER_SQL: HOURS_BY_USER_SQL,
    hoursParams: hoursParams
};
