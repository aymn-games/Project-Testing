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

    return awardPoints(userId, points);
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

    return {
        totalPoints: totalPoints,
        currentLevel: currentLevel ? { slug: currentLevel.slug, displayNameAr: currentLevel.display_name_ar, pointsRequired: currentLevel.level_points_required } : null,
        nextLevel: nextLevel ? { slug: nextLevel.slug, displayNameAr: nextLevel.display_name_ar, pointsRequired: nextLevel.level_points_required } : null
    };
}

module.exports = {
    awardPoints: awardPoints,
    awardForRoundCompletion: awardForRoundCompletion,
    getUserPoints: getUserPoints,
    DAILY_CAP: DAILY_CAP
};
