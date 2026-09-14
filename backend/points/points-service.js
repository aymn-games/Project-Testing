/**
 * ==========================================================================
 *  AGP POINTS SERVICE — نقاط المشاركة + المستويات (تفتح إطارات تلقائياً)
 * ==========================================================================
 *
 * قواعد النقاط (محدَّدة صراحة من صاحب المشروع، ثابتة بالكود وليست قابلة
 * للتعديل من لوحة الأدمن حالياً — فقط عتبات المستويات نفسها قابلة للتعديل،
 * راجع backend/collectibles/collectibles-service.js):
 *   +4  نقاط لكل جولة يُكملها اللاعب (باقٍ مسجَّلاً فيها للنهاية فعلياً —
 *       التحقق من هذا الشرط مسؤولية المُستدعي في auth-router.js، هذا
 *       الملف يفترض أن كل استدعاء له هو مشاركة مكتملة فعلاً).
 *   +20 نقطة إضافية لو فاز بالجولة.
 *   +4  نقاط لكل ساعة لعب فعلي (مجموع مدة الجولة نفسها بالمللي ثانية).
 *   سقف يومي: 100 نقطة كحد أقصى — أي نقاط زايدة عن ذلك بنفس اليوم لا
 *       تُحتسب، ويُعاد العداد صفراً تلقائياً عند تغيّر اليوم (تاريخ UTC).
 *
 * النقاط تُحتسب فقط لمستخدمين لهم حساب مسجَّل بالمنصة — لا علاقة لهذا
 * الملف بكيفية إيجاد ذلك الحساب (مسؤولية auth-router.js عبر مطابقة
 * يوزرنيم تيك توك الموثَّق، راجع authService.findVerifiedUserByTikTok).
 * ==========================================================================
 */

'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');
var collectiblesService = require('../collectibles/collectibles-service');

var POINTS_PER_COMPLETED_ROUND = 4;
var WIN_BONUS_POINTS = 20;
var POINTS_PER_HOUR_PLAYED = 4;
var DAILY_CAP = 100;

function now() { return Date.now(); }
function todayUtc() { return new Date().toISOString().slice(0, 10); }

function getRow(userId) {
    return db.prepare('SELECT * FROM user_points WHERE user_id = ?').get(userId);
}

/**
 * إضافة نقاط لمستخدم مع احترام السقف اليومي (100) وإعادة ضبط العداد
 * اليومي تلقائياً عند تغيّر التاريخ. يستدعي تلقائياً فتح أي إطار مستوى
 * جديد تحقق شرطه بعد الإضافة.
 * @param {number} userId
 * @param {number} amount - نقاط مرشَّحة للإضافة (قد يُقتطَع جزء منها لو
 *   قارب السقف اليومي)
 * @returns {{success: boolean, added: number, totalPoints: number}}
 */
function awardPoints(userId, amount) {
    amount = Math.max(0, Math.floor(amount || 0));
    if (amount === 0) {
        var current = getRow(userId);
        return { success: true, added: 0, totalPoints: current ? current.total_points : 0 };
    }

    var today = todayUtc();
    var row = getRow(userId);

    var todayEarned = (row && row.today_date === today) ? row.today_earned : 0;
    var remainingToday = Math.max(0, DAILY_CAP - todayEarned);
    var added = Math.min(amount, remainingToday);

    var newTotal = (row ? row.total_points : 0) + added;
    var newTodayEarned = todayEarned + added;

    db.prepare(
        'INSERT INTO user_points (user_id, total_points, today_date, today_earned, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET total_points = ?, today_date = ?, today_earned = ?, updated_at = ?'
    ).run(userId, newTotal, today, newTodayEarned, now(), newTotal, today, newTodayEarned, now());

    if (added > 0) {
        logger.log('Points: user ' + userId + ' +' + added + ' (requested ' + amount + ', daily cap ' + DAILY_CAP + ') → total ' + newTotal);
        collectiblesService.autoGrantOnLevelUp(userId, newTotal);
    }

    return { success: true, added: added, totalPoints: newTotal };
}

/**
 * نقاط مشاركة كاملة بجولة واحدة — راجع قواعد الحساب أعلى الملف.
 * @param {number} userId
 * @param {{won?: boolean, durationMs?: number}} params
 * @returns {{success: boolean, added: number, totalPoints: number}}
 */
function awardForRoundCompletion(userId, params) {
    params = params || {};
    var points = POINTS_PER_COMPLETED_ROUND;
    if (params.won) points += WIN_BONUS_POINTS;
    var hours = Math.floor((params.durationMs || 0) / 3600000);
    points += hours * POINTS_PER_HOUR_PLAYED;

    var result = awardPoints(userId, points);

    // ⚠️ [0.44.2] عدّاد جولات مكتملة/فوز — لتفعيل بطاقة "إحصائيات اللاعب"
    // بالبروفايل (كانت "قريباً" ثابتة). منفصل عمداً عن سقف النقاط اليومي
    // (awardPoints أعلاه) — المشاركة والفوز حقيقيان بصرف النظر عن اقتطاع
    // النقاط لبلوغ السقف اليومي. awardPoints أعلاه ضمِنت وجود صف
    // user_points لهذا المستخدم، فهذا التحديث آمن دائماً بعده مباشرة.
    db.prepare(
        'UPDATE user_points SET games_played = games_played + 1, games_won = games_won + ?, total_play_ms = total_play_ms + ? WHERE user_id = ?'
    ).run(params.won ? 1 : 0, params.durationMs || 0, userId);

    return result;
}

/**
 * نقاط المستخدم الحالية + معلومات المستوى (الحالي/التالي) لعرضها بالبروفايل.
 * مستويات بلا عتبة محددة بعد (level_points_required = NULL) تُستبعَد من
 * الحساب تماماً (لا تُعامَل كأنها بعتبة صفر).
 * @returns {Object}
 */
function getUserPoints(userId) {
    var row = getRow(userId);
    var totalPoints = row ? row.total_points : 0;

    var levels = db.prepare(
        "SELECT slug, display_name_ar, level_points_required FROM frame_catalog " +
        "WHERE kind = 'level' AND level_points_required IS NOT NULL ORDER BY level_points_required ASC"
    ).all();

    var currentLevel = null;
    var nextLevel = null;
    levels.forEach(function (level) {
        if (totalPoints >= level.level_points_required) {
            currentLevel = level;
        } else if (!nextLevel) {
            nextLevel = level;
        }
    });

    // ⚠️ [0.44.2] إحصائيات مشاركة حقيقية (كانت "قريباً" ثابتة بالبروفايل) —
    // عدّادان فقط، بدون أي منطق مُخترَع: عدد الجولات المكتملة الفعلية،
    // وعدد مرات الفوز منها (كلاهما يُحدَّثان بـawardForRoundCompletion
    // أعلاه). نسبة الفوز محسوبة هنا مباشرة (0 لو صفر جولات، تجنّباً
    // للقسمة على صفر).
    var gamesPlayed = row ? (row.games_played || 0) : 0;
    var gamesWon = row ? (row.games_won || 0) : 0;
    var winRatePct = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

    return {
        totalPoints: totalPoints,
        currentLevel: currentLevel ? { slug: currentLevel.slug, displayNameAr: currentLevel.display_name_ar, pointsRequired: currentLevel.level_points_required } : null,
        nextLevel: nextLevel ? { slug: nextLevel.slug, displayNameAr: nextLevel.display_name_ar, pointsRequired: nextLevel.level_points_required } : null,
        gamesPlayed: gamesPlayed,
        gamesWon: gamesWon,
        winRatePct: winRatePct
    };
}

/**
 * [جديد] أعلى اللاعبين بعدد مرات الفوز — عام، بديل صادق عن "الأكثر
 * نشاطاً" لغير الستريمرز (نفس فلسفة getTopStreamersByHours بـ
 * auth-service.js: بيانات علنية غير حساسة فقط — بدون بريد أو أي شيء
 * حساس). يستبعد من لا جولات فائزة له بعد.
 * @param {number} [limit]
 * @returns {Array<{username: string, displayName: string, avatarBase64: (string|null), customId: (string|null), gamesWon: number, gamesPlayed: number}>}
 */
function getTopPlayersByWins(limit) {
    var rows = db.prepare(
        `SELECT u.username, u.display_name AS displayName, u.avatar_image_base64 AS avatarBase64,
                u.custom_id AS customId, p.games_won AS gamesWon, p.games_played AS gamesPlayed
         FROM user_points p
         JOIN users u ON u.id = p.user_id
         WHERE p.games_won > 0
         ORDER BY p.games_won DESC, p.games_played ASC
         LIMIT ?`
    ).all(limit || 20);
    return rows.map(function (r) {
        return {
            username: r.username,
            displayName: r.displayName || r.username,
            avatarBase64: r.avatarBase64 || null,
            customId: r.customId || null,
            gamesWon: r.gamesWon || 0,
            gamesPlayed: r.gamesPlayed || 0
        };
    });
}

/**
 * [جديد] أعلى اللاعبين بساعات اللعب الفعلية (total_play_ms المتراكم من
 * awardForRoundCompletion أعلاه). يستبعد من ما له وقت لعب مسجَّل بعد —
 * البيانات تبدأ من صفر لكل اللاعبين لحظة إضافة هذا العمود (لا سجل
 * تاريخي قبله)، فتترسّخ القائمة تدريجياً مع الجولات الجديدة فقط.
 * @param {number} [limit]
 * @returns {Array<{username: string, displayName: string, avatarBase64: (string|null), customId: (string|null), totalHours: number}>}
 */
function getTopPlayersByHours(limit) {
    var rows = db.prepare(
        `SELECT u.username, u.display_name AS displayName, u.avatar_image_base64 AS avatarBase64,
                u.custom_id AS customId, p.total_play_ms AS totalMs
         FROM user_points p
         JOIN users u ON u.id = p.user_id
         WHERE p.total_play_ms > 0
         ORDER BY p.total_play_ms DESC
         LIMIT ?`
    ).all(limit || 20);
    return rows.map(function (r) {
        return {
            username: r.username,
            displayName: r.displayName || r.username,
            avatarBase64: r.avatarBase64 || null,
            customId: r.customId || null,
            totalHours: Math.round((r.totalMs / 3600000) * 10) / 10
        };
    });
}

module.exports = {
    awardPoints: awardPoints,
    awardForRoundCompletion: awardForRoundCompletion,
    getUserPoints: getUserPoints,
    getTopPlayersByWins: getTopPlayersByWins,
    getTopPlayersByHours: getTopPlayersByHours,
    DAILY_CAP: DAILY_CAP
};
