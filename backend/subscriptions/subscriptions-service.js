/**
 * SUBSCRIPTIONS SERVICE — اشتراكات المنصة بثلاث مستويات (فضي/ذهبي/ماسي).
 *
 * الاشتراك يتفعّل بطريقتين، والنتيجة وحدة (grant):
 *   1. كود AGP-XXXX-XXXX (نفس أكواد الإطارات): الأدمن يولّده من لوحة الأكواد،
 *      ويُباع بمتجر خارجي أو يُعطى يدوياً، والمستخدم يسترده من خانة «استرداد
 *      كود» ببروفايله (collectibles-service.redeemFrameCode يحوّله لهنا).
 *   2. شراء منتج من متجر الموقع تسليمه sub:<tier>:<days> (store-service).
 *
 * قواعد التمديد:
 *   - نفس المستوى أو أعلى: المستوى يصير الجديد والأيام تنضاف فوق المتبقي.
 *   - مستوى أقل والاشتراك الأعلى شغّال: يُرفض (higher_tier_active) والكود يبقى صالح.
 *
 * فحص المزايا المقفلة: hasTier(userId, 'gold') → true للذهبي والماسي.
 * بالواجهة: AGPAuth.hasSubscription('gold') (user.subscription من /api/auth/me).
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var logger = require('../utils/logger');

var DAY_MS = 24 * 60 * 60 * 1000;
var MAX_CODES_PER_BATCH = 500;
var MAX_DAYS = 3650;

// rank: الأعلى يشمل مزايا اللي تحته.
var TIERS = {
    silver: { rank: 1, nameAr: 'فضي' },
    gold: { rank: 2, nameAr: 'ذهبي' },
    diamond: { rank: 3, nameAr: 'ماسي' }
};
var TIER_KEYS = ['silver', 'gold', 'diamond'];
// المدد المعروضة بلوحة الأدمن والمتجر (الكود نفسه يقبل أي عدد أيام بين 1 و MAX_DAYS).
var DURATIONS = [
    { days: 30, nameAr: 'شهر' },
    { days: 90, nameAr: '3 شهور' },
    { days: 365, nameAr: 'سنة' }
];

// كل جداول الأكواد بنفس الصيغة — الكود لازم يكون فريد عبرها كلها.
var ALL_CODE_TABLES = ['frame_codes', 'card_codes', 'bundle_codes', 'choice_codes', 'subscription_codes'];
var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function now() { return Date.now(); }

function isTier(tier) { return Object.prototype.hasOwnProperty.call(TIERS, tier); }

function toDays(value) {
    var n = Math.floor(Number(value));
    return n >= 1 && n <= MAX_DAYS ? n : null;
}

function durationName(days) {
    var d = DURATIONS.filter(function (x) { return x.days === days; })[0];
    return d ? d.nameAr : days + ' يوم';
}

/** «اشتراك ذهبي — شهر» */
function displayName(tier, days) {
    var t = TIERS[tier];
    return 'اشتراك ' + (t ? t.nameAr : tier) + (days ? ' — ' + durationName(days) : '');
}

/**
 * اشتراك المستخدم الحالي، أو null لو ما عنده اشتراك شغّال.
 * @returns {{tier, tierName, rank, expiresAt, daysLeft} | null}
 */
function getSubscription(userId) {
    var row = userId ? db.prepare('SELECT * FROM user_subscriptions WHERE user_id = ?').get(userId) : null;
    if (!row || row.expires_at <= now() || !isTier(row.tier)) return null;
    return {
        tier: row.tier,
        tierName: TIERS[row.tier].nameAr,
        rank: TIERS[row.tier].rank,
        expiresAt: row.expires_at,
        daysLeft: Math.ceil((row.expires_at - now()) / DAY_MS)
    };
}

/** هل عند المستخدم اشتراك شغّال بهذا المستوى أو أعلى؟ */
function hasTier(userId, minTier) {
    var sub = getSubscription(userId);
    if (!sub) return false;
    return sub.rank >= (TIERS[minTier] ? TIERS[minTier].rank : 1);
}

/**
 * يفعّل/يمدد اشتراك. ما يرمي أخطاء.
 * @returns {{success: boolean, subscription?: Object, error?: string}}
 */
function grant(userId, tier, days, source) {
    days = toDays(days);
    if (!userId) return { success: false, error: 'invalid_user' };
    if (!isTier(tier)) return { success: false, error: 'invalid_tier' };
    if (!days) return { success: false, error: 'invalid_days' };

    var current = getSubscription(userId);
    if (current && current.rank > TIERS[tier].rank) return { success: false, error: 'higher_tier_active', subscription: current };

    var start = current ? current.expiresAt : now();
    var expiresAt = start + days * DAY_MS;
    db.prepare(
        'INSERT INTO user_subscriptions (user_id, tier, expires_at, source, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET tier = excluded.tier, expires_at = excluded.expires_at, source = excluded.source, updated_at = excluded.updated_at'
    ).run(userId, tier, expiresAt, String(source || '').slice(0, 40), now());
    logger.log('Subscriptions: user ' + userId + ' → ' + tier + ' +' + days + 'd (' + (source || '') + ')');
    return { success: true, subscription: getSubscription(userId) };
}

/* ----------------------------------------------------------------------
 * الأكواد
 * ---------------------------------------------------------------------- */

function randomChunk(length) {
    var out = '';
    for (var i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    return out;
}

function codeTaken(code) {
    return ALL_CODE_TABLES.some(function (t) { return Boolean(db.prepare('SELECT code FROM ' + t + ' WHERE code = ?').get(code)); });
}

/** @returns {{success: boolean, codes?: string[], error?: string}} */
function generateCodes(tier, days, count, note) {
    days = toDays(days);
    count = Math.floor(Number(count));
    if (!isTier(tier)) return { success: false, error: 'invalid_tier' };
    if (!days) return { success: false, error: 'invalid_days' };
    if (!count || count < 1 || count > MAX_CODES_PER_BATCH) return { success: false, error: 'invalid_count' };

    var insert = db.prepare('INSERT OR IGNORE INTO subscription_codes (code, tier, days, note, created_at) VALUES (?, ?, ?, ?, ?)');
    var codes = [];
    var createdAt = now();
    db.transaction(function () {
        while (codes.length < count) {
            var code = 'AGP-' + randomChunk(4) + '-' + randomChunk(4);
            if (codeTaken(code)) continue;
            if (insert.run(code, tier, days, String(note || '').slice(0, 200), createdAt).changes === 1) codes.push(code);
        }
    })();
    logger.log('Subscriptions: generated ' + codes.length + ' codes for ' + tier + ' ' + days + 'd');
    return { success: true, codes: codes };
}

function findCode(code) {
    return code ? db.prepare('SELECT * FROM subscription_codes WHERE code = ?').get(code) || null : null;
}

/**
 * استرداد كود اشتراك (الكود مُطبَّع مسبقاً بـcollectibles-service).
 * @returns {{success: boolean, kind?: 'subscription', subscription?: Object, error?: string}}
 */
function redeemCode(userId, code, row) {
    row = row || findCode(code);
    if (!row) return { success: false, error: 'invalid_code' };
    if (row.burned_at) return { success: false, error: 'code_burned' };
    if (row.redeemed_at) return { success: false, error: 'code_used' };

    var result = db.transaction(function () {
        var claimed = db.prepare('UPDATE subscription_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL AND burned_at IS NULL')
            .run(userId, now(), row.code);
        if (claimed.changes !== 1) return { success: false, error: 'code_used' };
        var granted = grant(userId, row.tier, row.days, 'code');
        // فشل التفعيل (مثلاً higher_tier_active): الكود يرجع صالح ويقدر يعطيه لغيره.
        if (!granted.success) db.prepare('UPDATE subscription_codes SET redeemed_by = NULL, redeemed_at = NULL WHERE code = ?').run(row.code);
        return granted;
    })();
    if (!result.success) return result;

    logger.log('Subscriptions: user ' + userId + ' redeemed code ' + row.code);
    return { success: true, kind: 'subscription', name: displayName(row.tier, row.days), days: row.days, subscription: result.subscription };
}

/** صفوف بنفس شكل listFrameCodes (لجدول الأكواد بلوحة الأدمن). */
function listCodes(limit) {
    return db.prepare(
        'SELECT c.*, u.username AS redeemed_username, u.custom_id AS redeemed_custom_id ' +
        'FROM subscription_codes c LEFT JOIN users u ON u.id = c.redeemed_by ' +
        'ORDER BY c.created_at DESC, c.code ASC LIMIT ?'
    ).all(limit || 300).map(function (row) {
        return {
            code: row.code,
            kind: 'subscription',
            tier: row.tier,
            days: row.days,
            displayNameAr: displayName(row.tier, row.days),
            note: row.note,
            createdAt: row.created_at,
            redeemedAt: row.redeemed_at,
            redeemedBy: row.redeemed_by,
            redeemedUsername: row.redeemed_username || null,
            redeemedCustomId: row.redeemed_custom_id || null,
            burnedAt: row.burned_at || null
        };
    });
}

/** المستويات والمدد (للوحة الأدمن وخيارات التسليم بالمتجر). */
function getPlans() {
    return {
        tiers: TIER_KEYS.map(function (k) { return { key: k, nameAr: TIERS[k].nameAr, rank: TIERS[k].rank }; }),
        durations: DURATIONS.slice()
    };
}

module.exports = {
    TIER_KEYS: TIER_KEYS,
    DURATIONS: DURATIONS,
    isTier: isTier,
    displayName: displayName,
    getPlans: getPlans,
    getSubscription: getSubscription,
    hasTier: hasTier,
    grant: grant,
    generateCodes: generateCodes,
    findCode: findCode,
    redeemCode: redeemCode,
    listCodes: listCodes
};
