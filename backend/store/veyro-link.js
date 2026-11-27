'use strict';

/**
 * ربط المتجر بفيرو (Veyro — veyro-server/ خدمة Render مستقلة):
 *
 * - منتج بالمتجر تسليمه 'veyro:<خطة>' = اشتراك فيرو. بعد الدفع ينرسل لسيرفر فيرو
 *   (POST /api/veyro/internal/store-grant بالسر VEYRO_STORE_SECRET بالخدمتين)،
 *   وفيرو يفعّل الاشتراك ويسجّل الدفعة بلوحته (veyro/admin.html).
 * - التسليم يمر على طابور بالقاعدة (veyro_store_grants): لو سيرفر فيرو ما رد (نشر/إعادة تشغيل)
 *   يعيد المحاولة كل دقيقتين لين يوصل. فيرو يتجاهل المكرر (نفس ref).
 * - خصم مشتركي منصة الألعاب: الستريمر اللي اشتراكه بالألعاب فعّال
 *   (subscription-service.status) ياخذ خصم خطة فيرو (gamesDiscount — يتحدد من لوحة فيرو)
 *   على كل شراء لفيرو طول ما اشتراكه بالألعاب فعّال. السعر ينحسب هنا بالسيرفر.
 * - الخطط وأسعارها ونسب الخصم تنجاب من سيرفر فيرو (GET /api/veyro/plans) وتنحفظ مؤقتاً.
 */

var db = require('../db/database');
var config = require('../config');
var logger = require('../utils/logger');
var subscriptionService = require('../subscriptions/subscription-service');

var PLANS_TTL_MS = 10 * 60 * 1000;
var RETRY_MS = 2 * 60 * 1000;
var MAX_TRIES = 200;
var DEFAULT_PLANS = [
    { id: 'monthly', name: 'شهري', days: 30, gamesDiscount: 0 },
    { id: 'quarter', name: 'ربع سنوي', days: 90, gamesDiscount: 0 },
    { id: 'yearly', name: 'سنوي', days: 365, gamesDiscount: 0 }
];

var doFetch = function (url, opt) { return fetch(url, opt); };
/** للاختبارات فقط. */
function _setFetch(fn) { doFetch = fn || function (url, opt) { return fetch(url, opt); }; }

db.exec(
    'CREATE TABLE IF NOT EXISTS veyro_store_grants (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, order_id INTEGER NOT NULL, user_id INTEGER NOT NULL,' +
    '  plan TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'pending\', tries INTEGER NOT NULL DEFAULT 0,' +
    '  last_error TEXT, created_at INTEGER NOT NULL, sent_at INTEGER)'
);

/* ---------------- خطط فيرو ---------------- */
var cache = { plans: null, at: 0, loading: null };
function apiBase() { return config.veyroApiUrl || ''; }

function refreshPlans() {
    if (!apiBase()) return Promise.resolve(plans());
    if (cache.loading) return cache.loading;
    cache.loading = doFetch(apiBase() + '/api/veyro/plans', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.success && Array.isArray(d.plans)) { cache.plans = d.plans; cache.at = Date.now(); }
            return plans();
        })
        .catch(function (err) { logger.error('Veyro link: plans fetch failed:', err && err.message); return plans(); })
        .then(function (x) { cache.loading = null; return x; });
    return cache.loading;
}
/** الخطط المحفوظة (وتتحدّث بالخلفية لو قديمة). */
function plans() {
    if (Date.now() - cache.at > PLANS_TTL_MS && !cache.loading && apiBase()) refreshPlans();
    return cache.plans || DEFAULT_PLANS;
}
function plan(id) { return plans().filter(function (p) { return p.id === id; })[0] || null; }
function planOfDelivery(delivery) { return /^veyro:[a-z0-9_-]{2,24}$/.test(String(delivery || '')) ? String(delivery).slice(6) : null; }

/** خيارات التسليم للوحة المتجر. */
function deliveryOptions() {
    return plans().map(function (p) { return { value: 'veyro:' + p.id, label: 'اشتراك فيرو: ' + p.name }; });
}

/* ---------------- خصم مشتركي الألعاب ---------------- */
function isGamesSubscriber(userId) {
    if (!userId) return false;
    try { var s = subscriptionService.status(userId); return Boolean(s && s.subscription && s.subscription.active); } catch (e) { return false; }
}
/** نسبة الخصم لهذا المستخدم على منتج بهذا التسليم (0 = بدون). */
function discountPct(user, delivery) {
    var id = planOfDelivery(delivery);
    if (!id || !user || !isGamesSubscriber(user.id)) return 0;
    var p = plan(id);
    var pct = p ? Number(p.gamesDiscount) || 0 : 0;
    return Math.max(0, Math.min(100, Math.round(pct)));
}
function round2(n) { return Math.round(n * 100) / 100; }
/**
 * صف منتج بالسعر بعد خصم مشتركي الألعاب (نسخة — الأصل ما يتغير). السعر الأصلي ينحط
 * بـold_price عشان المتجر يعرضه مشطوب (لو المنتج فيه عرض أصلاً يبقى سعره الأعلى).
 */
function priceRowFor(row, user) {
    var id = planOfDelivery(row && row.delivery);
    if (!id) return row;
    // السعر من لوحة فيرو (خطة فيرو) — لو الخطط ما وصلت، سعر المنتج بالمتجر
    var p = plan(id), base = p && Number(p.price) > 0 ? Number(p.price) : row.price;
    var pct = discountPct(user, row.delivery);
    if (!pct) return base === row.price ? row : Object.assign({}, row, { price: base, old_price: row.old_price && row.old_price > base ? row.old_price : null });
    var out = Object.assign({}, row);
    out.price = round2(base * (100 - pct) / 100);
    out.old_price = row.old_price && row.old_price > base ? row.old_price : base;
    out.off_pct = Math.round((1 - out.price / out.old_price) * 100);
    out.badge = 'خصم مشتركي الألعاب ' + pct + '٪';
    out.veyro_games_discount = pct;
    return out;
}

/* ---------------- التسليم لفيرو ---------------- */
function userPayload(userId) {
    var u = db.prepare('SELECT id, username, email, role, is_streamer, permissions, custom_id, tiktok_username, tiktok_verified, tiktok_display_name, tiktok_avatar_url FROM users WHERE id = ?').get(userId) || { id: userId };
    var perms = {};
    try { perms = JSON.parse(u.permissions || '{}'); } catch (e) { perms = {}; }
    return { id: u.id, username: u.username, email: u.email, role: u.role, is_streamer: Boolean(u.is_streamer), permissions: perms, custom_id: u.custom_id, tiktok_username: u.tiktok_username, tiktok_verified: Boolean(u.tiktok_verified), tiktok_display_name: u.tiktok_display_name, tiktok_avatar_url: u.tiktok_avatar_url };
}

function send(row) {
    if (!apiBase() || !config.veyroStoreSecret) {
        db.prepare('UPDATE veyro_store_grants SET last_error = ? WHERE id = ?').run('VEYRO_API_URL أو VEYRO_STORE_SECRET ناقص', row.id);
        return Promise.resolve(false);
    }
    var body = { ref: row.ref, orderId: row.order_id, plan: row.plan, amount: row.amount, user: userPayload(row.user_id) };
    return doFetch(apiBase() + '/api/veyro/internal/store-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Veyro-Secret': config.veyroStoreSecret },
        body: JSON.stringify(body)
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
            if (r.status === 200 && d && d.success) {
                db.prepare("UPDATE veyro_store_grants SET status = 'sent', sent_at = ?, tries = tries + 1, last_error = NULL WHERE id = ?").run(Date.now(), row.id);
                logger.log('Veyro link: order #' + row.order_id + ' → Veyro ' + row.plan + ' for user ' + row.user_id);
                return true;
            }
            throw new Error('veyro ' + r.status + ' ' + ((d && d.error) || ''));
        });
    }).catch(function (err) {
        var tries = row.tries + 1;
        db.prepare('UPDATE veyro_store_grants SET tries = ?, last_error = ?, status = ? WHERE id = ?').run(tries, String(err && err.message || err).slice(0, 200), tries >= MAX_TRIES ? 'failed' : 'pending', row.id);
        logger.error('Veyro link: grant for order #' + row.order_id + ' failed (try ' + tries + '):', err && err.message);
        return false;
    });
}

/**
 * يسجّل اشتراك فيرو اللي انشرى ويرسله (المتجر — finalizeOrder). ما يرمي أخطاء.
 * ref يميّز كل منتج بكل طلب، فالتكرار ما يفعّل مرتين.
 */
function grant(userId, delivery, amount, orderId, productId) {
    var planId = planOfDelivery(delivery);
    if (!planId) return;
    var ref = 'store:' + orderId + ':' + productId;
    var info = db.prepare('INSERT OR IGNORE INTO veyro_store_grants (ref, order_id, user_id, plan, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ref, orderId, userId, planId, round2(Number(amount) || 0), Date.now());
    if (!info.changes) return;
    var row = db.prepare('SELECT * FROM veyro_store_grants WHERE ref = ?').get(ref);
    // بعد ما تخلص معاملة الطلب
    setImmediate(function () { send(row); });
}

/** يعيد إرسال اللي ما وصل لفيرو. */
function retryPending() {
    var rows = db.prepare("SELECT * FROM veyro_store_grants WHERE status = 'pending' ORDER BY id LIMIT 50").all();
    return rows.reduce(function (p, r) { return p.then(function () { return send(r); }); }, Promise.resolve());
}

var timer = null;
function start() {
    if (timer) return;
    refreshPlans();
    timer = setInterval(function () { retryPending().catch(function () {}); }, RETRY_MS);
    if (timer.unref) timer.unref();
}

module.exports = {
    plans: plans, refreshPlans: refreshPlans, deliveryOptions: deliveryOptions, planOfDelivery: planOfDelivery,
    isGamesSubscriber: isGamesSubscriber, discountPct: discountPct, priceRowFor: priceRowFor,
    grant: grant, retryPending: retryPending, start: start, _setFetch: _setFetch,
    _setPlans: function (p) { cache.plans = p; cache.at = p ? Date.now() : 0; }
};
