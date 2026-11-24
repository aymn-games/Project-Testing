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
 *
 * فوقها: تعديلات الأدمن اليدوية (جدول streamer_hours_adjustments) — تعويض
 * ساعات ما انحسبت أو خصم لتصحيح خطأ، تنحسب بيوم effective_at اللي يختاره
 * الأدمن. تدخل بكل مكان (التصنيف الأسبوعي، البروفايل، مستوى SP، إحصائيات
 * الأدمن) لأنها جزء من HOURS_BY_USER_SQL وgetTotalLiveMs.
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
    `SELECT user_id, MAX(0, SUM(ms)) AS total_ms FROM (
        SELECT user_id, MAX(0, MIN(ended_at, @cutover) - MAX(started_at, @hoursFrom)) AS ms
          FROM broadcasts WHERE ended_at IS NOT NULL
        UNION ALL
        SELECT user_id, MAX(0, ended_at - MAX(started_at, @cutover, @hoursFrom)) AS ms
          FROM streamer_match_time
        UNION ALL
        SELECT user_id, ms FROM streamer_hours_adjustments WHERE effective_at >= @hoursFrom
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
              WHERE user_id = @userId) +
            (SELECT COALESCE(SUM(ms), 0) FROM streamer_hours_adjustments
              WHERE user_id = @userId) AS total_ms`
    ).get({ userId: userId, cutover: p.cutover });
    return row ? Math.max(0, row.total_ms) : 0;
}

/* ----------------------------------------------------------------------
 * تعديل الساعات يدوياً (لوحة الأدمن ← الإحصائيات ← إحصائيات الستريمرز)
 * ---------------------------------------------------------------------- */

var MAX_ADJUST_HOURS = 200;

/**
 * إضافة (hours موجب) أو خصم (hours سالب) ساعات لاستريمر.
 * @param {number} userId
 * @param {number} hours - تقبل كسور (0.5 = نص ساعة)، من -200 إلى 200، غير صفر
 * @param {number} effectiveAt - لحظة (ms) اليوم اللي تنحسب فيه — ما تكون بالمستقبل
 * @param {string} reason
 * @param {number} adminId
 */
function addAdjustment(userId, hours, effectiveAt, reason, adminId) {
    var h = Number(hours);
    if (!isFinite(h) || h === 0 || Math.abs(h) > MAX_ADJUST_HOURS) return { success: false, error: 'invalid_hours' };
    var now = Date.now();
    var at = Number(effectiveAt) || now;
    if (at > now) at = now;
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    var ms = Math.round(h * 3600000);
    if (ms < 0 && getTotalLiveMs(user.id) + ms < 0) return { success: false, error: 'exceeds_total' };
    var info = db.prepare(
        'INSERT INTO streamer_hours_adjustments (user_id, ms, effective_at, reason, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.id, ms, at, String(reason || '').trim().slice(0, 200) || null, adminId || null, now);
    return { success: true, id: info.lastInsertRowid, totalHours: Math.round(getTotalLiveMs(user.id) / 360000) / 10 };
}

/** سجل التعديلات (الأحدث أولاً) — userId اختياري لتصفية سجل استريمر واحد. */
function listAdjustments(userId, limit) {
    var rows = db.prepare(
        `SELECT a.id, a.user_id, a.ms, a.effective_at, a.reason, a.created_at,
                u.username, u.display_name, u.custom_id, u.tiktok_username, u.tiktok_verified,
                ad.username AS admin_username
           FROM streamer_hours_adjustments a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN users ad ON ad.id = a.admin_id
          WHERE (@userId IS NULL OR a.user_id = @userId)
          ORDER BY a.created_at DESC LIMIT @limit`
    ).all({ userId: userId || null, limit: Math.min(Math.max(Number(limit) || 50, 1), 200) });
    return rows.map(function (r) {
        return {
            id: r.id,
            userId: r.user_id,
            name: r.display_name || r.username,
            customId: r.custom_id || null,
            tiktokUsername: r.tiktok_verified ? r.tiktok_username : null,
            hours: Math.round(r.ms / 36000) / 100,
            effectiveAt: r.effective_at,
            reason: r.reason || '',
            createdAt: r.created_at,
            admin: r.admin_username || null
        };
    });
}

/** حذف تعديل (تراجع) — ترجع ساعات الاستريمر كأن التعديل ما صار. */
function deleteAdjustment(id) {
    var info = db.prepare('DELETE FROM streamer_hours_adjustments WHERE id = ?').run(Number(id) || 0);
    return info.changes ? { success: true } : { success: false, error: 'not_found' };
}

module.exports = {
    getCutoverAt: getCutoverAt,
    recordMatchTime: recordMatchTime,
    getTotalLiveMs: getTotalLiveMs,
    addAdjustment: addAdjustment,
    listAdjustments: listAdjustments,
    deleteAdjustment: deleteAdjustment,
    HOURS_BY_USER_SQL: HOURS_BY_USER_SQL,
    hoursParams: hoursParams
};
