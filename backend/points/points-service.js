/**
 * AGP POINTS SERVICE — نقاط المشاركة + المستويات (تفتح إطارات تلقائياً).
 * قواعد النقاط (ثابتة بالكود، غير قابلة للتعديل من لوحة الأدمن؛ فقط عتبات
 * المستويات نفسها قابلة للتعديل، راجع collectibles-service.js):
 *   +4  نقاط لكل جولة مكتملة، +10 إضافية لو فاز (+5 فقط لكل لاعب بالفريق
 *   الفائز في ألعاب الفريقين)، +4 لكل ساعة لعب فعلي.
 *   سقف يومي: 100 نقطة — الزائد لا يُحتسب، ويُعاد العداد عند تغيّر اليوم (UTC).
 */

'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');
var collectiblesService = require('../collectibles/collectibles-service');

var POINTS_PER_COMPLETED_ROUND = 4;
var WIN_BONUS_POINTS = 10;
var TEAM_WIN_BONUS_POINTS = 5;
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
 * @param {{won?: boolean, teamGame?: boolean, durationMs?: number}} params
 * @returns {{success: boolean, added: number, totalPoints: number}}
 */
function awardForRoundCompletion(userId, params) {
    params = params || {};
    var points = POINTS_PER_COMPLETED_ROUND;
    if (params.won) points += params.teamGame ? TEAM_WIN_BONUS_POINTS : WIN_BONUS_POINTS;
    var hours = Math.floor((params.durationMs || 0) / 3600000);
    points += hours * POINTS_PER_HOUR_PLAYED;

    var result = awardPoints(userId, points);

    // عدّاد جولات مكتملة/فوز منفصل عمداً عن سقف النقاط اليومي — المشاركة
    // والفوز حقيقيان بصرف النظر عن اقتطاع النقاط لبلوغ السقف اليومي.
    // awardPoints أعلاه ضمِنت وجود صف user_points، فهذا التحديث آمن.
    db.prepare(
        'UPDATE user_points SET games_played = games_played + 1, games_won = games_won + ?, total_play_ms = total_play_ms + ? WHERE user_id = ?'
    ).run(params.won ? 1 : 0, params.durationMs || 0, userId);
    db.prepare('INSERT INTO player_rounds_log (user_id, won, duration_ms, created_at) VALUES (?, ?, ?, ?)')
        .run(userId, params.won ? 1 : 0, params.durationMs || 0, now());

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

    // نسبة الفوز: 0 لو صفر جولات، تجنّباً للقسمة على صفر.
    var gamesPlayed = row ? (row.games_played || 0) : 0;
    var gamesWon = row ? (row.games_won || 0) : 0;
    var winRatePct = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

    return {
        totalPoints: totalPoints,
        currentLevel: currentLevel ? { slug: currentLevel.slug, displayNameAr: currentLevel.display_name_ar, pointsRequired: currentLevel.level_points_required } : null,
        nextLevel: nextLevel ? { slug: nextLevel.slug, displayNameAr: nextLevel.display_name_ar, pointsRequired: nextLevel.level_points_required } : null,
        gamesPlayed: gamesPlayed,
        gamesWon: gamesWon,
        winRatePct: winRatePct,
        // قواعد الحساب نفسها — تعرضها صفحة البروفايل بقسم "كيف تكسب نقاط
        // الخبرة" بدل ما تنكتب القيم يدوياً بالواجهة.
        rules: {
            perCompletedRound: POINTS_PER_COMPLETED_ROUND,
            winBonus: WIN_BONUS_POINTS,
            teamWinBonus: TEAM_WIN_BONUS_POINTS,
            perHourPlayed: POINTS_PER_HOUR_PLAYED,
            dailyCap: DAILY_CAP
        }
    };
}

// تصنيفات "توب اللاعبين" بالرئيسية — كلها أسبوعية مثل توب الاستريمرز:
// تحسب الجولات من sinceMs فقط (بداية الأسبوع من getRankingPeriodStart
// بـauth-service.js، يمررها الراوتر). العمود metric يحدد الترتيب.
var TOP_PLAYERS_ORDER = {
    wins: 'l.games_won DESC, l.games_played ASC',
    rounds: 'l.games_played DESC, l.games_won DESC',
    hours: 'l.play_ms DESC, l.games_played DESC'
};
var TOP_PLAYERS_MIN = {
    wins: 'l.games_won > 0',
    rounds: 'l.games_played > 0',
    hours: 'l.play_ms > 0'
};

function getTopPlayers(metric, limit, sinceMs) {
    var rows = db.prepare(
        `SELECT u.username, u.display_name AS displayName, u.avatar_image_base64 AS avatarBase64,
                u.custom_id AS customId, l.games_won AS gamesWon, l.games_played AS gamesPlayed,
                l.play_ms AS playMs
         FROM (SELECT user_id, SUM(won) AS games_won, COUNT(*) AS games_played, SUM(duration_ms) AS play_ms
               FROM player_rounds_log WHERE created_at >= ? GROUP BY user_id) l
         JOIN users u ON u.id = l.user_id
         WHERE ${TOP_PLAYERS_MIN[metric]}
         ORDER BY ${TOP_PLAYERS_ORDER[metric]}
         LIMIT ?`
    ).all(sinceMs || 0, limit || 20);
    return rows.map(function (r) {
        return {
            username: r.username,
            displayName: r.displayName || r.username,
            avatarBase64: r.avatarBase64 || null,
            customId: r.customId || null,
            gamesWon: r.gamesWon || 0,
            gamesPlayed: r.gamesPlayed || 0,
            totalMinutes: Math.round((r.playMs || 0) / 60000),
            totalHours: Math.round(((r.playMs || 0) / 3600000) * 10) / 10
        };
    });
}

/**
 * مركز لاعب واحد بكل تصنيف أسبوعي (نفس ترتيب وشروط getTopPlayers) — لصورة
 * البروفايل. التصنيف اللي ما يدخله اللاعب يرجع null.
 * @returns {{wins: ?{rank: number, value: number}, hours: ?{rank: number, value: number}, rounds: ?{rank: number, value: number}}}
 */
function getPlayerWeeklyRanks(userId, sinceMs) {
    var out = {};
    Object.keys(TOP_PLAYERS_ORDER).forEach(function (metric) {
        var row = db.prepare(
            `SELECT rn, games_won, games_played, play_ms FROM (
                SELECT l.user_id, l.games_won, l.games_played, l.play_ms,
                       ROW_NUMBER() OVER (ORDER BY ${TOP_PLAYERS_ORDER[metric]}) AS rn
                FROM (SELECT user_id, SUM(won) AS games_won, COUNT(*) AS games_played, SUM(duration_ms) AS play_ms
                      FROM player_rounds_log WHERE created_at >= ? GROUP BY user_id) l
                WHERE ${TOP_PLAYERS_MIN[metric]}
             ) WHERE user_id = ?`
        ).get(sinceMs || 0, userId);
        if (!row) { out[metric] = null; return; }
        var value = metric === 'wins' ? row.games_won
            : metric === 'rounds' ? row.games_played
            : Math.round((row.play_ms || 0) / 60000);
        out[metric] = { rank: row.rn, value: value };
    });
    return out;
}

/**
 * أعلى اللاعبين بعدد مرات الفوز هالأسبوع — بيانات علنية غير حساسة فقط.
 * @param {number} [limit]
 * @param {number} [sinceMs]
 */
function getTopPlayersByWins(limit, sinceMs) { return getTopPlayers('wins', limit, sinceMs); }

/** أعلى اللاعبين بعدد الجولات المكتملة هالأسبوع ("الأكثر لعباً"). */
function getTopPlayersByRounds(limit, sinceMs) { return getTopPlayers('rounds', limit, sinceMs); }

/** أعلى اللاعبين بوقت اللعب الفعلي هالأسبوع ("الأكثر نشاطاً"). */
function getTopPlayersByHours(limit, sinceMs) { return getTopPlayers('hours', limit, sinceMs); }

module.exports = {
    awardPoints: awardPoints,
    awardForRoundCompletion: awardForRoundCompletion,
    getUserPoints: getUserPoints,
    getTopPlayersByWins: getTopPlayersByWins,
    getTopPlayersByHours: getTopPlayersByHours,
    getTopPlayersByRounds: getTopPlayersByRounds,
    getPlayerWeeklyRanks: getPlayerWeeklyRanks,
    DAILY_CAP: DAILY_CAP
};
