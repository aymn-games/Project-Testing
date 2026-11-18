/**
 * VEYRO CORE AUTH — تسجيل الدخول بحساب ألعاب أيمن: فيرو ما عنده حسابات، يرسل توكن
 * المستخدم لسيرفر الألعاب (GET /api/veyro/whoami، وقبله /api/auth/me) ويحفظ النتيجة:
 *
 * - بالذاكرة FRESH_MS لكل توكن (ما نسأل سيرفر الألعاب بكل طلب).
 * - سيرفر الألعاب ما رد (نشر جديد/إعادة تشغيل) → نكمل بآخر نتيجة لين STALE_MS،
 *   فالمحرر ما يوقف وقت نشر الألعاب. توكن جديد ما شفناه قبل → 503 (يعيد المحاولة).
 * - 401 من سيرفر الألعاب → التوكن انتهى، ننساه.
 * - آخر تأكيد ناجح ينحفظ بقاعدة فيرو (veyro_sessions، بصمة التوكن بس) — فلو سيرفر فيرو
 *   انعاد تشغيله وسيرفر الألعاب طايح بنفس الوقت، المحرر يكمل بنفس قاعدة STALE_MS.
 * - بيانات الحساب تنكتب بجدول users بقاعدة فيرو (db/database.js) — منها يقرأ رابط
 *   الشاشة يوزر صاحبها بدون ما يسأل سيرفر الألعاب.
 */

'use strict';

var crypto = require('crypto');

var FRESH_MS = 5 * 60 * 1000;
var STALE_MS = 24 * 60 * 60 * 1000;
var TIMEOUT_MS = 8000;
var MAX_TOKENS = 5000;

/**
 * @param {object} deps — db, coreUrl, fetch?, now?, logger?
 */
function createCoreAuth(deps) {
    var db = deps.db;
    var doFetch = deps.fetch || fetch;
    var now = deps.now || Date.now;
    var log = deps.logger || { error: function () {}, log: function () {} };
    var cache = new Map(); // sha256(token) -> { user, at }
    var inflight = new Map();

    var upsert = db.prepare(
        'INSERT INTO users (id, username, display_name, role, is_streamer, permissions, tiktok_username, tiktok_verified, tiktok_display_name, tiktok_avatar_url, avatar_image_base64, updated_at) ' +
        'VALUES (@id, @username, @display_name, @role, @is_streamer, @permissions, @tiktok_username, @tiktok_verified, @tiktok_display_name, @tiktok_avatar_url, @avatar_image_base64, @updated_at) ' +
        'ON CONFLICT(id) DO UPDATE SET username = excluded.username, display_name = COALESCE(excluded.display_name, users.display_name), role = excluded.role, ' +
        'is_streamer = excluded.is_streamer, permissions = excluded.permissions, tiktok_username = excluded.tiktok_username, tiktok_verified = excluded.tiktok_verified, ' +
        'tiktok_display_name = excluded.tiktok_display_name, tiktok_avatar_url = excluded.tiktok_avatar_url, ' +
        'avatar_image_base64 = CASE WHEN excluded.avatar_image_base64 IS NOT NULL OR @avatar_known = 1 THEN excluded.avatar_image_base64 ELSE users.avatar_image_base64 END, ' +
        'updated_at = excluded.updated_at'
    );

    function hash(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

    var putSession = db.prepare('INSERT OR REPLACE INTO veyro_sessions (token_hash, user_id, at) VALUES (?, ?, ?)');
    var dropSession = db.prepare('DELETE FROM veyro_sessions WHERE token_hash = ?');
    var getSession = db.prepare('SELECT s.at, u.* FROM veyro_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
    /** آخر تأكيد محفوظ بالقاعدة → { user, at } بنفس شكل حساب سيرفر الألعاب، أو null. */
    function fromDb(key) {
        var r = getSession.get(key);
        if (!r) return null;
        var perms = {};
        try { perms = JSON.parse(r.permissions || '{}'); } catch (e) { perms = {}; }
        return { at: r.at, user: {
            id: r.id, username: r.username, role: r.role, is_streamer: Boolean(r.is_streamer), permissions: perms,
            tiktok_username: r.tiktok_username, tiktok_verified: Boolean(r.tiktok_verified),
            tiktok_display_name: r.tiktok_display_name, tiktok_avatar_url: r.tiktok_avatar_url, display_name: r.display_name
        } };
    }

    /** يحفظ بيانات الحساب بقاعدة فيرو. u = user من سيرفر الألعاب. */
    function save(u) {
        var known = Object.prototype.hasOwnProperty.call(u, 'avatar_image_base64');
        upsert.run({
            id: Number(u.id),
            username: u.username || null,
            display_name: u.display_name || null,
            role: u.role || 'streamer',
            is_streamer: u.is_streamer ? 1 : 0,
            permissions: JSON.stringify(u.permissions || {}),
            tiktok_username: u.tiktok_username || null,
            tiktok_verified: u.tiktok_verified ? 1 : 0,
            tiktok_display_name: u.tiktok_display_name || null,
            tiktok_avatar_url: u.tiktok_avatar_url || null,
            avatar_image_base64: known ? (u.avatar_image_base64 || null) : null,
            avatar_known: known ? 1 : 0,
            updated_at: now()
        });
    }

    function get(path, token) {
        var ctl = new AbortController();
        var timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
        return doFetch(deps.coreUrl + path, { headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal })
            .then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (d) { return { status: res.status, body: d || {} }; });
            })
            .finally(function () { clearTimeout(timer); });
    }

    /** سؤال سيرفر الألعاب: whoami (فيه الاسم والصورة)، ولو قديم (404) /api/auth/me. */
    function askCore(token) {
        return get('/api/veyro/whoami', token).then(function (r) {
            return r.status === 404 ? get('/api/auth/me', token) : r;
        });
    }

    /**
     * @returns {Promise<{user: object}|{status: number, error: string}>}
     *   status 401 = التوكن غلط/انتهى، 503 = سيرفر الألعاب ما رد وما عندنا نتيجة سابقة.
     */
    function resolve(token) {
        if (!token) return Promise.resolve({ status: 401, error: 'unauthorized' });
        var key = hash(token);
        var c = cache.get(key);
        if (c && now() - c.at < FRESH_MS) return Promise.resolve({ user: c.user });
        if (inflight.has(key)) return inflight.get(key);
        var p = askCore(token).then(function (r) {
            if (r.status === 401 || r.status === 403) { cache.delete(key); dropSession.run(key); return { status: 401, error: 'unauthorized' }; }
            if (r.status !== 200 || !r.body.success || !r.body.user) throw new Error('core status ' + r.status);
            var user = r.body.user;
            try { save(user); } catch (e) { log.error('Core auth: failed to store user ' + user.id + ':', e); }
            delete user.avatar_image_base64; // ما نخليه بالذاكرة لكل توكن
            cache.delete(key);
            cache.set(key, { user: user, at: now() });
            try { putSession.run(key, Number(user.id), now()); } catch (e) { /* ignore */ }
            if (cache.size > MAX_TOKENS) cache.delete(cache.keys().next().value);
            return { user: user };
        }).catch(function (err) {
            var last = c || fromDb(key);
            if (last && now() - last.at < STALE_MS) return { user: last.user };
            log.error('Core auth: games server unreachable (' + (err && err.message) + ').');
            return { status: 503, error: 'core_unavailable' };
        }).finally(function () { inflight.delete(key); });
        inflight.set(key, p);
        return p;
    }

    /** بعد ما فيرو يغيّر شي يخص الحساب (ما فيه حالياً) — ننسى النتيجة المحفوظة. */
    function forget(token) { cache.delete(hash(token)); dropSession.run(hash(token)); }

    return { resolve: resolve, forget: forget, save: save };
}

var instance = null;
function get() {
    if (!instance) {
        var config = require('../config');
        instance = createCoreAuth({ db: require('../db/database'), coreUrl: config.coreApiUrl, logger: require('../utils/logger') });
    }
    return instance;
}

module.exports = { createCoreAuth: createCoreAuth, get: get, FRESH_MS: FRESH_MS, STALE_MS: STALE_MS };
