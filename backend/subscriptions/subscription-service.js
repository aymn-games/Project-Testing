'use strict';

/**
 * اشتراك الستريمر — مدة، تعليق وفك تعليق، وأكواد تفعيل.
 *
 * - الأدمن يولّد أكواد اشتراك (شهر أو شهرين) من لوحة الإدارة، والستريمر
 *   يفعّل الكود من بروفايله (قسم «الاشتراك»). الربط مع المتجر لاحقاً.
 * - الشهر = 30 يوم. كود جديد والاشتراك فعّال يمدّد النهاية ويضيف رصيد
 *   تعليق؛ والاشتراك المنتهي يبدأ من جديد من وقت التفعيل.
 * - التعليق: تعليق واحد لكل شهر (شهر = مرة، شهرين = مرتين، وواحد بس بكل
 *   شهر)، حده الأقصى 5 أيام وينفك تلقائياً بعدها. أيام التعليق ما تنحسب
 *   من المدة (النهاية تتأجل بقدرها). فكّ التعليق قبل الـ5 أيام يحسب تعليق
 *   كامل من الرصيد.
 * - حالياً للعرض فقط: ما فيه ميزة تنقفل لو انتهى الاشتراك أو انعلّق.
 * الجداول streamer_subscriptions وsubscription_codes بـbackend/db/database.js.
 */

var crypto = require('crypto');
var db = require('../db/database');
var logger = require('../utils/logger');

var DAY_MS = 24 * 60 * 60 * 1000;
var MONTH_MS = 30 * DAY_MS;
var PAUSE_MAX_MS = 5 * DAY_MS;
var ALLOWED_MONTHS = [1, 2];
var MAX_CODES_PER_BATCH = 200;
var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

var _now = function () { return Date.now(); };
/** للاختبارات فقط: تثبيت الوقت. */
function _setClock(fn) { _now = fn || function () { return Date.now(); }; }

function parsePermissions(p) {
    if (p && typeof p === 'object') return p;
    try { return JSON.parse(p || '{}'); } catch (e) { return {}; }
}
function isStreamerUser(u) {
    if (!u) return false;
    return u.role === 'admin' || Boolean(u.is_streamer) || Boolean(parsePermissions(u.permissions).can_run_games);
}

function normalizeCode(raw) {
    return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SUB/, '').replace(/^(.{4})(.{4})$/, 'SUB-$1-$2');
}
function randomCode() {
    var bytes = crypto.randomBytes(8), s = '';
    for (var i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return 'SUB-' + s.slice(0, 4) + '-' + s.slice(4);
}

function getRow(userId) {
    return db.prepare('SELECT * FROM streamer_subscriptions WHERE user_id = ?').get(userId) || null;
}

/** فكّ التعليق تلقائياً لو خلصت الـ5 أيام (يُستدعى قبل أي قراءة أو تعديل). */
function settle(row) {
    if (row && row.paused_at && _now() >= row.pause_until) {
        var pausedFor = row.pause_until - row.paused_at;
        db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, paused_total_ms = paused_total_ms + ?, paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
            .run(pausedFor, pausedFor, _now(), row.user_id);
        row = getRow(row.user_id);
    }
    return row;
}

/** كم تعليق مسموح لين الحين: واحد بكل شهر بدأ من الاشتراك، وبحد أقصى عدد الأشهر. */
function pausesUnlocked(row, t) {
    var activeElapsed = Math.max(0, t - row.started_at - row.paused_total_ms);
    return Math.min(row.pauses_allowed, Math.floor(activeElapsed / MONTH_MS) + 1);
}

/**
 * حالة اشتراك المستخدم للعرض بالبروفايل.
 * @returns {{success: boolean, subscription: Object|null}}
 */
function status(userId) {
    var row = settle(getRow(userId));
    if (!row) return { success: true, subscription: null };
    var t = _now();
    var paused = Boolean(row.paused_at);
    // وقت التعليق ما ينحسب: المتبقي يتجمّد على قيمته لحظة التعليق
    var remaining = Math.max(0, row.ends_at - (paused ? row.paused_at : t));
    var active = remaining > 0;
    var unlocked = pausesUnlocked(row, paused ? row.paused_at : t);
    var canPause = active && !paused && row.pauses_used < unlocked;
    return {
        success: true,
        subscription: {
            months: row.months_total,
            startedAt: row.started_at,
            endsAt: paused ? row.ends_at + (row.pause_until - row.paused_at) : row.ends_at,
            remainingMs: remaining,
            active: active,
            paused: paused,
            pausedAt: row.paused_at || null,
            pauseUntil: row.pause_until || null,
            pausesAllowed: row.pauses_allowed,
            pausesUsed: row.pauses_used,
            canPause: canPause,
            // ليش ما يقدر يعلّق: خلص الرصيد كله، أو تعليق هالشهر مستخدم (فيه رصيد للشهر الجاي)
            pauseBlocked: canPause || !active || paused ? null : (row.pauses_used >= row.pauses_allowed ? 'no_pauses_left' : 'monthly_pause_used'),
            pauseMaxDays: PAUSE_MAX_MS / DAY_MS
        }
    };
}

/** @returns {{success: boolean, error?: string}} */
function pause(user) {
    var row = settle(getRow(user.id));
    if (!row) return { success: false, error: 'no_subscription' };
    var s = status(user.id).subscription;
    if (!s.active) return { success: false, error: 'expired' };
    if (s.paused) return { success: false, error: 'already_paused' };
    if (!s.canPause) return { success: false, error: s.pauseBlocked || 'no_pauses_left' };
    var t = _now();
    db.prepare('UPDATE streamer_subscriptions SET paused_at = ?, pause_until = ?, pauses_used = pauses_used + 1, updated_at = ? WHERE user_id = ?')
        .run(t, t + PAUSE_MAX_MS, t, user.id);
    logger.log('Subscriptions: user ' + user.id + ' paused subscription');
    return { success: true };
}

/** فكّ التعليق قبل الـ5 أيام — المدة اللي انعلّقت فعلاً تتأجل بها النهاية. */
function resume(user) {
    var row = settle(getRow(user.id));
    if (!row || !row.paused_at) return { success: false, error: 'not_paused' };
    var t = _now();
    var pausedFor = Math.max(0, t - row.paused_at);
    db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, paused_total_ms = paused_total_ms + ?, paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
        .run(pausedFor, pausedFor, t, user.id);
    logger.log('Subscriptions: user ' + user.id + ' resumed subscription');
    return { success: true };
}

/**
 * تفعيل كود اشتراك. لحسابات الستريمر فقط.
 * mode (للاشتراك الفعّال):
 *   'extend' تمديد — يضيف مدة الكود على نهاية الاشتراك الحالي ويزيد رصيد التعليق.
 *   'renew'  تجديد — دورة جديدة من الحين بمدة الكود + الأيام الباقية (ما تضيع)،
 *            ورصيد التعليق يبدأ من جديد بعدد أشهر الكود.
 * بدون mode: تمديد لو فعّال. والاشتراك المنتهي (أو بدون اشتراك) يبدأ من جديد بأي وضع.
 * @returns {{success: boolean, months?: number, mode?: string, error?: string}}
 */
function redeem(user, rawCode, mode) {
    if (mode != null && mode !== 'extend' && mode !== 'renew') return { success: false, error: 'invalid_mode' };
    var me = db.prepare('SELECT id, role, is_streamer, permissions FROM users WHERE id = ?').get(user.id);
    if (!isStreamerUser(me)) return { success: false, error: 'not_streamer' };
    var code = normalizeCode(rawCode);
    if (!/^SUB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { success: false, error: 'invalid_code' };
    var result = db.transaction(function () {
        var c = db.prepare('SELECT * FROM subscription_codes WHERE code = ?').get(code);
        if (!c) return { success: false, error: 'invalid_code' };
        if (c.burned_at) return { success: false, error: 'code_burned' };
        if (c.redeemed_at) return { success: false, error: 'code_used' };
        var t = _now();
        var row = settle(getRow(user.id));
        var add = c.months * MONTH_MS;
        var activeNow = row && (row.paused_at || row.ends_at > t);
        var applied = activeNow ? (mode || 'extend') : 'new';
        if (applied === 'extend') {
            db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, months_total = months_total + ?, pauses_allowed = pauses_allowed + ?, updated_at = ? WHERE user_id = ?')
                .run(add, c.months, c.months, t, user.id);
        } else if (applied === 'renew') {
            // المتبقي وقت التجديد (لو معلّق: المتجمّد لحظة التعليق)، ينضاف للدورة الجديدة
            var carry = Math.max(0, row.ends_at - (row.paused_at || t));
            db.prepare('UPDATE streamer_subscriptions SET started_at = ?, ends_at = ?, months_total = ?, pauses_allowed = ?, pauses_used = 0, paused_total_ms = 0, ' +
                'paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
                .run(t, t + add + carry, c.months, c.months, t, user.id);
        } else {
            db.prepare(
                'INSERT INTO streamer_subscriptions (user_id, started_at, ends_at, months_total, pauses_allowed, pauses_used, paused_total_ms, paused_at, pause_until, updated_at) ' +
                'VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET started_at = excluded.started_at, ends_at = excluded.ends_at, ' +
                'months_total = excluded.months_total, pauses_allowed = excluded.pauses_allowed, pauses_used = 0, paused_total_ms = 0, paused_at = NULL, pause_until = NULL, updated_at = excluded.updated_at'
            ).run(user.id, t, t + add, c.months, c.months, t);
        }
        var used = db.prepare('UPDATE subscription_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL AND burned_at IS NULL').run(user.id, t, code);
        if (used.changes !== 1) throw new Error('code_race');
        return { success: true, months: c.months, mode: applied };
    })();
    if (result.success) logger.log('Subscriptions: user ' + user.id + ' redeemed ' + code + ' (' + result.months + ' months)');
    return result;
}

/** الأدمن: توليد أكواد. @returns {{success: boolean, codes?: string[], error?: string}} */
function generateCodes(months, count, note) {
    months = Math.floor(Number(months));
    count = Math.floor(Number(count));
    if (ALLOWED_MONTHS.indexOf(months) < 0) return { success: false, error: 'invalid_months' };
    if (!count || count < 1 || count > MAX_CODES_PER_BATCH) return { success: false, error: 'invalid_count' };
    var insert = db.prepare('INSERT OR IGNORE INTO subscription_codes (code, months, note, created_at) VALUES (?, ?, ?, ?)');
    var codes = [];
    db.transaction(function () {
        var tries = 0;
        while (codes.length < count && tries++ < count * 20) {
            var c = randomCode();
            if (insert.run(c, months, String(note || '').slice(0, 200), _now()).changes === 1) codes.push(c);
        }
    })();
    logger.log('Subscriptions: generated ' + codes.length + ' codes (' + months + ' months)');
    return { success: true, codes: codes };
}

/** الأدمن: آخر الأكواد مع حالتها ومين فعّلها. */
function listCodes() {
    return db.prepare(
        'SELECT c.code, c.months, c.note, c.created_at, c.redeemed_at, c.burned_at, u.username, u.display_name, u.custom_id ' +
        'FROM subscription_codes c LEFT JOIN users u ON u.id = c.redeemed_by ORDER BY c.created_at DESC LIMIT 300'
    ).all().map(function (r) {
        return {
            code: r.code, months: r.months, note: r.note, createdAt: r.created_at, redeemedAt: r.redeemed_at || null, burnedAt: r.burned_at || null,
            redeemedBy: r.redeemed_at ? { name: r.display_name || r.username, customId: r.custom_id } : null
        };
    });
}

/** الأدمن: إيقاف كود ما انستخدم. */
function burnCode(rawCode) {
    var code = normalizeCode(rawCode);
    var r = db.prepare('UPDATE subscription_codes SET burned_at = ? WHERE code = ? AND redeemed_at IS NULL AND burned_at IS NULL').run(_now(), code);
    return r.changes === 1 ? { success: true } : { success: false, error: 'not_burnable' };
}

module.exports = {
    status: status,
    pause: pause,
    resume: resume,
    redeem: redeem,
    generateCodes: generateCodes,
    listCodes: listCodes,
    burnCode: burnCode,
    normalizeCode: normalizeCode,
    _setClock: _setClock,
    DAY_MS: DAY_MS,
    MONTH_MS: MONTH_MS
};
