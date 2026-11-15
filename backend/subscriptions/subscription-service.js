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
 * - المصادر: كود (redeem)، المتجر بعد الدفع (grantFromStore — تسليم
 *   'subscription:<أشهر>' بـstore-service.js)، والأدمن (adjustDays/end/unpause).
 *   كل حدث ينكتب بـsubscription_events (يظهر للستريمر كسجل مختصر).
 * - الباقات (subscription_plans): الأشهر + رصيد التعليق، يديرها الأدمن.
 * - القفل: hasActiveSubscription(userId) — يشتغل تلقائياً من
 *   config.subscriptionStartAt (1 ديسمبر 2026) أو يدوياً بـconfig.subscriptionEnforcement
 *   (isEnforced). قبلها يرجع true دائماً. بعدها فيه أيام سماح بعد الانتهاء
 *   (config.subscriptionGraceDays). يستدعيه ws-server.js عند ربط أي بث،
 *   وaccessForUser يرسل النتيجة للمتصفح (subscription_access بـ/api/auth/me).
 * - أدوات الأدمن: منح أيام لأي ستريمر حتى لو ما عنده اشتراك (grantDays)،
 *   اشتراك مفتوح بدون مدة (setOpenEnded) — الأيام الباقية تتجمّد وترجع لما
 *   ينلغي، وتعويض الكل (compensateAll) للفعّال والمعلّق والمنتهي داخل أيام السماح.
 * الجداول streamer_subscriptions وsubscription_codes وsubscription_events
 * وsubscription_plans بـbackend/db/database.js.
 */

var crypto = require('crypto');
var db = require('../db/database');
var logger = require('../utils/logger');
var config = require('../config');

var DAY_MS = 24 * 60 * 60 * 1000;
var MONTH_MS = 30 * DAY_MS;
var PAUSE_MAX_MS = 5 * DAY_MS;
var EXPIRING_SOON_MS = 5 * DAY_MS;
var MAX_PLAN_MONTHS = 24;
var MAX_ADJUST_DAYS = 365;
var MAX_CODES_PER_BATCH = 200;
var MAX_COMPENSATE_DAYS = 30;
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

/** يسجّل حدث بسجل الاشتراك. ms = المدة المرتبطة (تنحفظ بالأيام). */
function logEvent(userId, type, source, ref, months, ms) {
    db.prepare('INSERT INTO subscription_events (user_id, type, source, ref, months, days, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, type, source, ref == null ? null : String(ref), months || 0, Math.round((ms || 0) / DAY_MS), _now());
}

/** آخر أحداث اشتراك المستخدم (الأحدث أولاً). */
function listEvents(userId, limit) {
    return db.prepare('SELECT type, source, ref, months, days, created_at FROM subscription_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(userId, Math.min(50, Math.max(1, limit || 10)))
        .map(function (e) {
            // رقم الطلب يظهر للستريمر، والكود يظهر مختصر (آخر 4)
            var ref = e.ref;
            if (ref && e.source === 'code') ref = '…' + ref.slice(-4);
            return { type: e.type, source: e.source, ref: ref, months: e.months, days: e.days, at: e.created_at };
        });
}

/* ---------- الباقات ---------- */

function mapPlan(r) { return { months: r.months, name: r.name, pauses: r.pauses, active: Boolean(r.active) }; }

/** الباقات (الفعّالة بس، أو الكل للأدمن). */
function listPlans(includeInactive) {
    return db.prepare('SELECT * FROM subscription_plans' + (includeInactive ? '' : ' WHERE active = 1') + ' ORDER BY months').all().map(mapPlan);
}

function planFor(months) {
    var r = db.prepare('SELECT * FROM subscription_plans WHERE months = ?').get(months);
    return r ? mapPlan(r) : null;
}

/** الأدمن: إضافة/تعديل باقة. @returns {{success: boolean, plan?: Object, error?: string}} */
function savePlan(input) {
    input = input || {};
    var months = Math.floor(Number(input.months));
    var pauses = Math.floor(Number(input.pauses));
    var name = String(input.name || '').trim().slice(0, 40);
    if (!months || months < 1 || months > MAX_PLAN_MONTHS) return { success: false, error: 'invalid_months' };
    if (!(pauses >= 0 && pauses <= months * 2)) return { success: false, error: 'invalid_pauses' };
    if (!name) return { success: false, error: 'invalid_name' };
    var active = input.active === false || input.active === 0 ? 0 : 1;
    db.prepare('INSERT INTO subscription_plans (months, name, pauses, active, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(months) DO UPDATE SET name = excluded.name, pauses = excluded.pauses, active = excluded.active, updated_at = excluded.updated_at')
        .run(months, name, pauses, active, _now());
    logger.log('Subscriptions: plan saved (' + months + ' months, ' + pauses + ' pauses, active=' + active + ')');
    return { success: true, plan: planFor(months) };
}

/** فكّ التعليق تلقائياً لو خلصت الـ5 أيام (يُستدعى قبل أي قراءة أو تعديل). */
function settle(row) {
    if (row && row.paused_at && _now() >= row.pause_until) {
        var pausedFor = row.pause_until - row.paused_at;
        db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, paused_total_ms = paused_total_ms + ?, paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
            .run(pausedFor, pausedFor, _now(), row.user_id);
        logEvent(row.user_id, 'auto_resume', 'system', null, 0, pausedFor);
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
    if (row.open_ended) {
        // مفتوح: فعّال بدون نهاية، والتعليق ما له معنى
        return {
            success: true,
            subscription: {
                months: row.months_total, startedAt: row.started_at, endsAt: null, remainingMs: null,
                active: true, openEnded: true, paused: false, pausedAt: null, pauseUntil: null,
                pausesAllowed: row.pauses_allowed, pausesUsed: row.pauses_used, canPause: false, pauseBlocked: 'open_ended',
                pauseMaxDays: PAUSE_MAX_MS / DAY_MS, expiringSoon: false, graceUntil: null,
                carryMs: row.open_carry_ms || 0
            }
        };
    }
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
            openEnded: false,
            paused: paused,
            pausedAt: row.paused_at || null,
            pauseUntil: row.pause_until || null,
            pausesAllowed: row.pauses_allowed,
            pausesUsed: row.pauses_used,
            canPause: canPause,
            // ليش ما يقدر يعلّق: خلص الرصيد كله، أو تعليق هالشهر مستخدم (فيه رصيد للشهر الجاي)
            pauseBlocked: canPause || !active || paused ? null : (row.pauses_used >= row.pauses_allowed ? 'no_pauses_left' : 'monthly_pause_used'),
            pauseMaxDays: PAUSE_MAX_MS / DAY_MS,
            // تنبيه قرب الانتهاء (≤5 أيام) — المعلّق ما يتنبّه لأن أيامه متجمّدة
            expiringSoon: active && !paused && remaining <= EXPIRING_SOON_MS,
            graceUntil: active ? null : row.ends_at + config.subscriptionGraceDays * DAY_MS
        }
    };
}

/**
 * هل القفل شغّال الحين؟ SUBSCRIPTION_ENFORCEMENT=true/false يفرض القرار،
 * وإلا يشتغل تلقائياً من config.subscriptionStartAt.
 */
function isEnforced() {
    if (config.subscriptionEnforcement === true) return true;
    if (config.subscriptionEnforcement === false) return false;
    return _now() >= config.subscriptionStartAt;
}

/**
 * هل المستخدم يقدر يستخدم أدوات الستريمر؟ نقطة القفل الوحيدة.
 * القفل مطفي = true دائماً. شغّال: مفتوح أو فعّال أو معلّق أو داخل أيام
 * السماح بعد الانتهاء. الأدمن مستثنى عند المستدعي (ws-server.js / accessForUser).
 */
function hasActiveSubscription(userId) {
    if (!isEnforced()) return true;
    var row = settle(getRow(userId));
    if (!row) return false;
    if (row.open_ended || row.paused_at) return true;
    return _now() < row.ends_at + config.subscriptionGraceDays * DAY_MS;
}

/** للمتصفح (/api/auth/me): هل يقدر يشغّل الألعاب؟ الأدمن دائماً. */
function accessForUser(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return hasActiveSubscription(user.id);
}

/** حالة القفل للوحة الأدمن. */
function enforcementInfo() {
    return {
        enforced: isEnforced(),
        mode: config.subscriptionEnforcement === true ? 'forced_on' : config.subscriptionEnforcement === false ? 'forced_off' : 'scheduled',
        startAt: config.subscriptionStartAt,
        graceDays: config.subscriptionGraceDays
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
    logEvent(user.id, 'pause', 'user', null, 0, 0);
    logger.log('Subscriptions: user ' + user.id + ' paused subscription');
    return { success: true };
}

/** فكّ التعليق قبل الـ5 أيام — المدة اللي انعلّقت فعلاً تتأجل بها النهاية. */
function resume(user, source) {
    var row = settle(getRow(user.id));
    if (!row || !row.paused_at) return { success: false, error: 'not_paused' };
    var t = _now();
    var pausedFor = Math.max(0, t - row.paused_at);
    db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, paused_total_ms = paused_total_ms + ?, paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
        .run(pausedFor, pausedFor, t, user.id);
    logEvent(user.id, 'resume', source || 'user', null, 0, pausedFor);
    logger.log('Subscriptions: user ' + user.id + ' resumed subscription (' + (source || 'user') + ')');
    return { success: true };
}

/**
 * يضيف مدة للاشتراك (من كود أو المتجر). لازم ينادى داخل معاملة.
 * @returns {string} الوضع المطبّق: 'extend' | 'renew' | 'new'
 */
function applyGrant(userId, months, pauses, mode, source, ref) {
    var t = _now();
    var row = settle(getRow(userId));
    var add = months * MONTH_MS;
    if (row && row.open_ended) {
        // الاشتراك مفتوح: المدة تنحفظ مع الأيام المجمّدة وتبدأ لما ينلغي المفتوح
        db.prepare('UPDATE streamer_subscriptions SET open_carry_ms = open_carry_ms + ?, months_total = months_total + ?, pauses_allowed = pauses_allowed + ?, updated_at = ? WHERE user_id = ?')
            .run(add, months, pauses, t, userId);
        logEvent(userId, 'extend', source, ref, months, add);
        return 'extend';
    }
    var activeNow = row && (row.paused_at || row.ends_at > t);
    var applied = activeNow ? (mode || 'extend') : 'new';
    if (applied === 'extend') {
        db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, months_total = months_total + ?, pauses_allowed = pauses_allowed + ?, updated_at = ? WHERE user_id = ?')
            .run(add, months, pauses, t, userId);
    } else if (applied === 'renew') {
        // المتبقي وقت التجديد (لو معلّق: المتجمّد لحظة التعليق)، ينضاف للدورة الجديدة
        var carry = Math.max(0, row.ends_at - (row.paused_at || t));
        db.prepare('UPDATE streamer_subscriptions SET started_at = ?, ends_at = ?, months_total = ?, pauses_allowed = ?, pauses_used = 0, paused_total_ms = 0, ' +
            'paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
            .run(t, t + add + carry, months, pauses, t, userId);
    } else {
        db.prepare(
            'INSERT INTO streamer_subscriptions (user_id, started_at, ends_at, months_total, pauses_allowed, pauses_used, paused_total_ms, paused_at, pause_until, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET started_at = excluded.started_at, ends_at = excluded.ends_at, ' +
            'months_total = excluded.months_total, pauses_allowed = excluded.pauses_allowed, pauses_used = 0, paused_total_ms = 0, paused_at = NULL, pause_until = NULL, updated_at = excluded.updated_at'
        ).run(userId, t, t + add, months, pauses, t);
    }
    logEvent(userId, applied === 'new' ? 'activate' : applied, source, ref, months, add);
    return applied;
}

/**
 * المتجر: تسليم اشتراك بعد الدفع (تسليم 'subscription:<أشهر>'). تمديد لو
 * فعّال، وإلا يبدأ من جديد. ينادى من داخل معاملة إكمال الطلب (مرة وحدة لكل طلب).
 * ما يشترط حساب ستريمر — المشتري دفع، فالمدة تنحفظ له.
 * @returns {{success: boolean, mode?: string, error?: string}}
 */
function grantFromStore(userId, months, orderId) {
    months = Math.floor(Number(months));
    if (!months || months < 1 || months > MAX_PLAN_MONTHS) return { success: false, error: 'invalid_months' };
    var plan = planFor(months);
    var mode = db.transaction(function () {
        return applyGrant(userId, months, plan ? plan.pauses : months, 'extend', 'store', orderId);
    })();
    logger.log('Subscriptions: user ' + userId + ' got ' + months + ' months from store order ' + orderId);
    return { success: true, mode: mode };
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
        var applied = applyGrant(user.id, c.months, c.pauses == null ? c.months : c.pauses, mode, 'code', code);
        var t = _now();
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
    var plan = planFor(months);
    if (!plan || !plan.active) return { success: false, error: 'invalid_months' };
    if (!count || count < 1 || count > MAX_CODES_PER_BATCH) return { success: false, error: 'invalid_count' };
    var insert = db.prepare('INSERT OR IGNORE INTO subscription_codes (code, months, pauses, note, created_at) VALUES (?, ?, ?, ?, ?)');
    var codes = [];
    db.transaction(function () {
        var tries = 0;
        while (codes.length < count && tries++ < count * 20) {
            var c = randomCode();
            if (insert.run(c, months, plan.pauses, String(note || '').slice(0, 200), _now()).changes === 1) codes.push(c);
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

/* ---------- أدوات الأدمن على المشتركين ---------- */

/** الأدمن: كل المشتركين مع حالتهم (الفعّال أولاً، ثم الأقرب انتهاءً). */
function listSubscribers() {
    var rows = db.prepare(
        'SELECT s.user_id, u.username, u.display_name, u.custom_id, u.tiktok_username FROM streamer_subscriptions s JOIN users u ON u.id = s.user_id'
    ).all();
    return rows.map(function (r) {
        var st = status(r.user_id).subscription;
        return {
            userId: r.user_id, name: r.display_name || r.username, customId: r.custom_id, tiktok: r.tiktok_username || null,
            active: st.active, openEnded: st.openEnded, carryMs: st.carryMs || 0, paused: st.paused, remainingMs: st.remainingMs, endsAt: st.endsAt, months: st.months,
            pausesUsed: st.pausesUsed, pausesAllowed: st.pausesAllowed, expiringSoon: st.expiringSoon
        };
    }).sort(function (a, b) {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.openEnded !== b.openEnded) return a.openEnded ? 1 : -1;
        return a.active ? a.remainingMs - b.remainingMs : b.endsAt - a.endsAt;
    });
}

/**
 * الأدمن: إضافة (+) أو خصم (−) أيام. المنتهي مع إضافة يبدأ العد من الحين.
 * @returns {{success: boolean, error?: string}}
 */
function adjustDays(userId, days) {
    days = Math.trunc(Number(days));
    if (!days || Math.abs(days) > MAX_ADJUST_DAYS) return { success: false, error: 'invalid_days' };
    var row = settle(getRow(userId));
    if (!row) return { success: false, error: 'no_subscription' };
    if (row.open_ended) return { success: false, error: 'open_ended' };
    var t = _now();
    var ms = days * DAY_MS;
    var base = days > 0 && !row.paused_at && row.ends_at < t ? t : row.ends_at;
    db.prepare('UPDATE streamer_subscriptions SET ends_at = ?, updated_at = ? WHERE user_id = ?').run(base + ms, t, userId);
    logEvent(userId, days > 0 ? 'admin_add' : 'admin_subtract', 'admin', null, 0, Math.abs(ms));
    logger.log('Subscriptions: admin adjusted user ' + userId + ' by ' + days + ' days');
    return { success: true };
}

/** الأدمن: إنهاء الاشتراك الحين (يفك التعليق لو موجود). */
function endSubscription(userId) {
    var row = settle(getRow(userId));
    if (!row) return { success: false, error: 'no_subscription' };
    var t = _now();
    db.prepare('UPDATE streamer_subscriptions SET ends_at = ?, paused_at = NULL, pause_until = NULL, open_ended = 0, open_carry_ms = 0, updated_at = ? WHERE user_id = ?').run(t, t, userId);
    logEvent(userId, 'admin_end', 'admin', null, 0, 0);
    logger.log('Subscriptions: admin ended subscription of user ' + userId);
    return { success: true };
}

/** الأدمن: فك تعليق مستخدم. */
function adminUnpause(userId) {
    return resume({ id: userId }, 'admin');
}

function getUserBasic(userId) {
    return db.prepare('SELECT id, role, is_streamer, permissions FROM users WHERE id = ?').get(userId) || null;
}

/**
 * الأدمن: منح أيام لأي مستخدم — بدون اشتراك يبدأ له اشتراك من الحين، والفعّال
 * تنضاف على نهايته، والمنتهي يبدأ العد من الحين. رصيد التعليق: واحد لكل 30 يوم.
 * @returns {{success: boolean, mode?: string, error?: string}}
 */
function grantDays(userId, days) {
    days = Math.floor(Number(days));
    if (!days || days < 1 || days > MAX_ADJUST_DAYS) return { success: false, error: 'invalid_days' };
    if (!getUserBasic(userId)) return { success: false, error: 'user_not_found' };
    var ms = days * DAY_MS;
    var pauses = Math.floor(days / 30);
    var mode = db.transaction(function () {
        var t = _now();
        var row = settle(getRow(userId));
        if (row && row.open_ended) return 'open_ended';
        if (row && (row.paused_at || row.ends_at > t)) {
            db.prepare('UPDATE streamer_subscriptions SET ends_at = ends_at + ?, pauses_allowed = pauses_allowed + ?, updated_at = ? WHERE user_id = ?').run(ms, pauses, t, userId);
            logEvent(userId, 'admin_add', 'admin', null, 0, ms);
            return 'extend';
        }
        db.prepare(
            'INSERT INTO streamer_subscriptions (user_id, started_at, ends_at, months_total, pauses_allowed, pauses_used, paused_total_ms, paused_at, pause_until, open_ended, open_carry_ms, updated_at) ' +
            'VALUES (?, ?, ?, 0, ?, 0, 0, NULL, NULL, 0, 0, ?) ON CONFLICT(user_id) DO UPDATE SET started_at = excluded.started_at, ends_at = excluded.ends_at, ' +
            'months_total = 0, pauses_allowed = excluded.pauses_allowed, pauses_used = 0, paused_total_ms = 0, paused_at = NULL, pause_until = NULL, open_ended = 0, open_carry_ms = 0, updated_at = excluded.updated_at'
        ).run(userId, t, t + ms, pauses, t);
        logEvent(userId, 'admin_grant', 'admin', null, 0, ms);
        return 'new';
    })();
    if (mode === 'open_ended') return { success: false, error: 'open_ended' };
    logger.log('Subscriptions: admin granted ' + days + ' days to user ' + userId + ' (' + mode + ')');
    return { success: true, mode: mode };
}

/**
 * الأدمن: تشغيل/إلغاء الاشتراك المفتوح (بدون مدة).
 * التشغيل: يفك التعليق، ويجمّد الأيام الباقية بـopen_carry_ms.
 * الإلغاء: الأيام المجمّدة ترجع تبدأ من الحين (صفر = ينتهي الحين).
 * @returns {{success: boolean, error?: string}}
 */
function setOpenEnded(userId, on) {
    if (!getUserBasic(userId)) return { success: false, error: 'user_not_found' };
    var r = db.transaction(function () {
        var t = _now();
        var row = settle(getRow(userId));
        if (on) {
            if (row && row.open_ended) return { success: false, error: 'already_open' };
            if (!row) {
                db.prepare('INSERT INTO streamer_subscriptions (user_id, started_at, ends_at, months_total, pauses_allowed, pauses_used, paused_total_ms, paused_at, pause_until, open_ended, open_carry_ms, updated_at) ' +
                    'VALUES (?, ?, ?, 0, 0, 0, 0, NULL, NULL, 1, 0, ?)').run(userId, t, t, t);
            } else {
                var carry = Math.max(0, row.ends_at - (row.paused_at || t));
                var pausedFor = row.paused_at ? Math.max(0, t - row.paused_at) : 0;
                db.prepare('UPDATE streamer_subscriptions SET open_ended = 1, open_carry_ms = ?, ends_at = ?, paused_total_ms = paused_total_ms + ?, paused_at = NULL, pause_until = NULL, updated_at = ? WHERE user_id = ?')
                    .run(carry, t, pausedFor, t, userId);
            }
            logEvent(userId, 'admin_open', 'admin', null, 0, 0);
            return { success: true };
        }
        if (!row || !row.open_ended) return { success: false, error: 'not_open' };
        var back = row.open_carry_ms || 0;
        db.prepare('UPDATE streamer_subscriptions SET open_ended = 0, open_carry_ms = 0, ends_at = ?, updated_at = ? WHERE user_id = ?').run(t + back, t, userId);
        logEvent(userId, 'admin_close', 'admin', null, 0, back);
        return { success: true };
    })();
    if (r.success) logger.log('Subscriptions: admin ' + (on ? 'opened' : 'closed') + ' open-ended subscription of user ' + userId);
    return r;
}

/**
 * الأدمن: تعويض كل المشتركين بأيام (انقطاع مثلاً). يشمل الفعّال والمعلّق
 * (تنضاف على النهاية)، والمنتهي داخل أيام السماح (يبدأ العد من الحين).
 * المفتوح ما يحتاج. @returns {{success: boolean, count?: number, error?: string}}
 */
function compensateAll(days, note) {
    days = Math.floor(Number(days));
    if (!days || days < 1 || days > MAX_COMPENSATE_DAYS) return { success: false, error: 'invalid_days' };
    var ms = days * DAY_MS;
    var ref = String(note || '').trim().slice(0, 100) || null;
    var graceMs = config.subscriptionGraceDays * DAY_MS;
    var count = db.transaction(function () {
        var t = _now();
        var n = 0;
        db.prepare('SELECT user_id FROM streamer_subscriptions').all().forEach(function (x) {
            var row = settle(getRow(x.user_id));
            if (!row || row.open_ended) return;
            var base;
            if (row.paused_at || row.ends_at > t) base = row.ends_at;
            else if (t < row.ends_at + graceMs) base = t;
            else return;
            db.prepare('UPDATE streamer_subscriptions SET ends_at = ?, updated_at = ? WHERE user_id = ?').run(base + ms, t, row.user_id);
            logEvent(row.user_id, 'admin_compensate', 'admin', ref, 0, ms);
            n++;
        });
        return n;
    })();
    logger.log('Subscriptions: admin compensated ' + count + ' subscribers with ' + days + ' days');
    return { success: true, count: count };
}

module.exports = {
    status: status,
    pause: pause,
    resume: resume,
    redeem: redeem,
    generateCodes: generateCodes,
    listCodes: listCodes,
    burnCode: burnCode,
    listEvents: listEvents,
    listPlans: listPlans,
    savePlan: savePlan,
    grantFromStore: grantFromStore,
    hasActiveSubscription: hasActiveSubscription,
    isEnforced: isEnforced,
    accessForUser: accessForUser,
    enforcementInfo: enforcementInfo,
    grantDays: grantDays,
    setOpenEnded: setOpenEnded,
    compensateAll: compensateAll,
    listSubscribers: listSubscribers,
    adjustDays: adjustDays,
    endSubscription: endSubscription,
    adminUnpause: adminUnpause,
    normalizeCode: normalizeCode,
    _setClock: _setClock,
    DAY_MS: DAY_MS,
    MONTH_MS: MONTH_MS
};
