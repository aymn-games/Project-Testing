/**
 * VEYRO ADMIN SERVICE — بيانات لوحة تحكم فيرو (veyro/admin.html) بقاعدة فيرو:
 *
 * - veyro_accounts: حالة الحساب بفيرو (نشط/موقوف/محظور)، صلاحية التجربة، الحدود، الملاحظات،
 *   وتسجيل الخروج من كل الأجهزة (sessions_revoked_at).
 * - veyro_subs + veyro_payments: الاشتراك (خطة، بداية، نهاية، مفتوح، تجميد، تجديدات) والدفعات.
 * - veyro_plans: الخطط والأسعار والحدود.
 * - veyro_codes + veyro_code_uses: الأكواد واستخداماتها.
 * - veyro_usage: الساعات الفعلية لكل يوم (رابط شاشة فيرو مفتوح بـOBS) — admin/usage-tracker.js.
 * - veyro_tokens: أول وآخر مرة شفنا كل توكن (الأجهزة، وتسجيل الخروج من الكل).
 * - veyro_history + veyro_admin_log: سجل كل حساب، وسجل تعديلات الأدمن.
 * - veyro_settings: إعدادات فيرو العامة (التجربة للأدمن بس، أيام التجربة، الإعلان، المشرفين…).
 * - veyro_assets: مكتبة فيرو العامة (أليرتات، توبات، أيقونات، إطارات، أصوات) — الملفات بـ<DATA_DIR>/veyro-assets/.
 *
 * كل شي هنا بدون HTTP (admin/admin-router.js هو اللي يربطه بالمسارات)، فيتجرّب بقاعدة بالذاكرة.
 * المنطق نفسه اللي بوضع المعاينة بـveyro/admin.js — أي تغيير بقواعد الاشتراك يتعدّل بالمكانين.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DAY = 864e5;
var TZ_MS = 3 * 36e5; // اليوم يتحسب بتوقيت السعودية (UTC+3)
var USAGE_DAYS = 90;
var ID_RE = /^[a-f0-9]{32}$/;
var CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

var DEFAULT_PLANS = [
    { id: 'monthly', name: 'شهري', days: 30, price: 39, screens: 10, videos: 10, on: 1, internal: 0, features: ['كل أدوات البث', '10 شاشات', '10 فيديوهات بالمكتبة'], sort: 1 },
    { id: 'quarter', name: 'ربع سنوي', days: 90, price: 99, screens: 20, videos: 20, on: 1, internal: 0, features: ['كل أدوات البث', '20 شاشة', '20 فيديو بالمكتبة'], sort: 2 },
    { id: 'yearly', name: 'سنوي', days: 365, price: 349, screens: 50, videos: 40, on: 1, internal: 0, features: ['كل أدوات البث', '50 شاشة', '40 فيديو بالمكتبة', 'أصول حصرية للسنوي'], sort: 3 },
    { id: 'lifetime', name: 'مفتوح', days: 0, price: 0, screens: 100, videos: 60, on: 1, internal: 1, features: ['بدون تاريخ انتهاء', 'يعطيه الأدمن أو كود خاص بس'], sort: 4 }
];
var DEFAULT_SETTINGS = { previewAdminOnly: true, requireSub: false, trialDays: 0, announce: { on: false, text: '' }, admins: [] };
var ADMIN_ROLES = { manager: 'مدير (كل شي)', support: 'دعم (قراءة + أيام إضافية)', content: 'محتوى (المكتبة بس)' };
var CODE_TYPES = { days: 'اشتراك بأيام', plan: 'خطة كاملة', lifetime: 'اشتراك مفتوح', extra: 'أيام إضافية للمشتركين' };
var ASSET_TYPES = ['alert', 'top', 'icon', 'frame', 'sound'];
var ASSET_STATUS = ['published', 'draft', 'hidden'];
var ASSET_ACCESS = ['all', 'subs', 'yearly'];
var MAX_ASSET_BYTES = 30 * 1024 * 1024;
var GAMES_DISCOUNT = 30; // خصم مشتركي منصة الألعاب الافتراضي (٪) لكل خطة

function dayKey(ts) { var d = new Date(ts + TZ_MS); return d.toISOString().slice(0, 10); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function int(v, def) { var n = Math.round(Number(v)); return isFinite(n) ? n : def; }
function str(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }
function json(s, def) { try { var v = JSON.parse(s); return v == null ? def : v; } catch (e) { return def; } }
function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

/** نوع الملف من أول بايتاته (فيديو/صورة/صوت) — SVG ممنوع (ممكن فيه سكربت). */
function sniffAsset(h) {
    if (!h || h.length < 12) return null;
    if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'video/webm';
    if (h.toString('ascii', 4, 8) === 'ftyp') return h.toString('ascii', 8, 12) === 'qt  ' ? 'video/quicktime' : (/^M4A/.test(h.toString('ascii', 8, 12)) ? 'audio/mp4' : 'video/mp4');
    if (h[0] === 0x89 && h.toString('ascii', 1, 4) === 'PNG') return 'image/png';
    if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
    if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
    if (h.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
    if (h.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
    if (h.toString('ascii', 0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    return null;
}
function mimeFits(type, mime) {
    if (type === 'alert') return /^video\//.test(mime);
    if (type === 'icon' || type === 'frame') return /^image\//.test(mime);
    if (type === 'sound') return /^audio\//.test(mime);
    return false;
}

/**
 * @param {Database} db
 * @param {{now?:function, dir?:string, fileUrl?:function(string):string}} [deps]
 */
function createService(db, deps) {
    deps = deps || {};
    var now = deps.now || Date.now;
    var dir = deps.dir || null;
    var fileUrl = deps.fileUrl || function (id) { return '/api/veyro/assets/file?id=' + id; };

    db.exec(
        'CREATE TABLE IF NOT EXISTS veyro_accounts (' +
        '  user_id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT \'active\', status_reason TEXT NOT NULL DEFAULT \'\',' +
        '  tester INTEGER, notes TEXT NOT NULL DEFAULT \'\', limit_screens INTEGER, limit_videos INTEGER,' +
        '  sessions_revoked_at INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);' +
        'CREATE TABLE IF NOT EXISTS veyro_subs (' +
        '  user_id INTEGER PRIMARY KEY, plan TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER, lifetime INTEGER NOT NULL DEFAULT 0,' +
        '  frozen_at INTEGER, frozen_remaining INTEGER, frozen_why TEXT NOT NULL DEFAULT \'\', renewals INTEGER NOT NULL DEFAULT 0,' +
        '  source TEXT NOT NULL DEFAULT \'gift\', updated_at INTEGER NOT NULL);' +
        'CREATE TABLE IF NOT EXISTS veyro_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, at INTEGER NOT NULL,' +
        '  amount REAL NOT NULL DEFAULT 0, plan TEXT NOT NULL, method TEXT NOT NULL DEFAULT \'\', by_admin TEXT NOT NULL DEFAULT \'\');' +
        'CREATE INDEX IF NOT EXISTS idx_veyro_payments_user ON veyro_payments(user_id);' +
        'CREATE TABLE IF NOT EXISTS veyro_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, at INTEGER NOT NULL,' +
        '  text TEXT NOT NULL, kind TEXT NOT NULL DEFAULT \'\', by_admin TEXT NOT NULL DEFAULT \'\');' +
        'CREATE INDEX IF NOT EXISTS idx_veyro_history_user ON veyro_history(user_id);' +
        'CREATE TABLE IF NOT EXISTS veyro_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, days INTEGER NOT NULL, price REAL NOT NULL,' +
        '  screens INTEGER NOT NULL, videos INTEGER NOT NULL, on_sale INTEGER NOT NULL DEFAULT 1, internal INTEGER NOT NULL DEFAULT 0,' +
        '  features TEXT NOT NULL DEFAULT \'[]\', sort INTEGER NOT NULL DEFAULT 0);' +
        'CREATE TABLE IF NOT EXISTS veyro_codes (code TEXT PRIMARY KEY, type TEXT NOT NULL, days INTEGER NOT NULL DEFAULT 0, plan TEXT,' +
        '  max_uses INTEGER NOT NULL DEFAULT 1, expires_at INTEGER, campaign TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL,' +
        '  created_by TEXT NOT NULL DEFAULT \'\', disabled INTEGER NOT NULL DEFAULT 0, for_user INTEGER);' +
        'CREATE TABLE IF NOT EXISTS veyro_code_uses (code TEXT NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, user_id));' +
        'CREATE TABLE IF NOT EXISTS veyro_usage (user_id INTEGER NOT NULL, day TEXT NOT NULL, open_sec INTEGER NOT NULL DEFAULT 0,' +
        '  live_sec INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));' +
        'CREATE TABLE IF NOT EXISTS veyro_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL);' +
        'CREATE INDEX IF NOT EXISTS idx_veyro_tokens_user ON veyro_tokens(user_id);' +
        'CREATE TABLE IF NOT EXISTS veyro_admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, by_id INTEGER, by_name TEXT NOT NULL DEFAULT \'\',' +
        '  act TEXT NOT NULL, target TEXT NOT NULL DEFAULT \'\', user_id INTEGER);' +
        'CREATE TABLE IF NOT EXISTS veyro_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);' +
        'CREATE TABLE IF NOT EXISTS veyro_assets (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, cat TEXT NOT NULL DEFAULT \'\',' +
        '  status TEXT NOT NULL DEFAULT \'draft\', access TEXT NOT NULL DEFAULT \'all\', version INTEGER NOT NULL DEFAULT 0,' +
        '  settings TEXT NOT NULL DEFAULT \'{}\', mime TEXT, size INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);'
    );
    // خصم مشتركي منصة الألعاب (٪) لكل خطة — يطبّقه متجر الألعاب (backend/store/veyro-link.js).
    // الافتراضي GAMES_DISCOUNT (30٪ بطلب صاحب المنصة) لكل الخطط، ويتعدّل لكل خطة من اللوحة.
    if (db.prepare('PRAGMA table_info(veyro_plans)').all().every(function (c) { return c.name !== 'games_discount'; })) db.exec('ALTER TABLE veyro_plans ADD COLUMN games_discount INTEGER NOT NULL DEFAULT ' + GAMES_DISCOUNT);
    db.exec('CREATE TABLE IF NOT EXISTS veyro_store_refs (ref TEXT PRIMARY KEY, user_id INTEGER NOT NULL, plan TEXT NOT NULL, amount REAL NOT NULL, at INTEGER NOT NULL)');
    if (!db.prepare('SELECT COUNT(*) AS n FROM veyro_plans').get().n) {
        var ins = db.prepare('INSERT INTO veyro_plans (id, name, days, price, screens, videos, on_sale, internal, features, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        DEFAULT_PLANS.forEach(function (p) { ins.run(p.id, p.name, p.days, p.price, p.screens, p.videos, p.on, p.internal, JSON.stringify(p.features), p.sort); });
    }

    /* ---------------- الإعدادات ---------------- */
    function settings() {
        var out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        db.prepare('SELECT key, value FROM veyro_settings').all().forEach(function (r) { out[r.key] = json(r.value, out[r.key]); });
        return out;
    }
    function setSetting(key, value) { db.prepare('INSERT OR REPLACE INTO veyro_settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value)); }

    /* ---------------- الخطط ---------------- */
    function planRow(r) { return r ? { id: r.id, name: r.name, days: r.days, price: r.price, screens: r.screens, videos: r.videos, on: Boolean(r.on_sale), internal: Boolean(r.internal), features: json(r.features, []), gamesDiscount: r.games_discount || 0 } : null; }
    function plans() { return db.prepare('SELECT * FROM veyro_plans ORDER BY sort, rowid').all().map(planRow); }
    function plan(id) { return planRow(db.prepare('SELECT * FROM veyro_plans WHERE id = ?').get(String(id || ''))); }
    function planName(id) { var p = plan(id); return p ? p.name : String(id || '—'); }
    function savePlan(p) {
        var id = /^[a-z0-9_-]{2,24}$/.test(String(p.id || '')) ? p.id : 'p' + crypto.randomBytes(3).toString('hex');
        var old = plan(id);
        var name = str(p.name, 40);
        if (!name) return { success: false, error: 'name_required' };
        var days = id === 'lifetime' ? 0 : clamp(int(p.days, 30), 1, 3650);
        var feats = (Array.isArray(p.features) ? p.features : []).map(function (f) { return str(f, 80); }).filter(Boolean).slice(0, 12);
        var sort = old ? db.prepare('SELECT sort FROM veyro_plans WHERE id = ?').get(id).sort : db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM veyro_plans').get().s;
        var gd = p.gamesDiscount == null ? (old ? old.gamesDiscount : GAMES_DISCOUNT) : clamp(int(p.gamesDiscount, 0), 0, 100);
        db.prepare('INSERT OR REPLACE INTO veyro_plans (id, name, days, price, screens, videos, on_sale, internal, features, sort, games_discount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, name, days, Math.max(0, Number(p.price) || 0), clamp(int(p.screens, 10), 0, 500), clamp(int(p.videos, 10), 0, 500), p.on === false ? 0 : 1, id === 'lifetime' ? 1 : 0, JSON.stringify(feats), sort, gd);
        return { success: true, plan: plan(id), isNew: !old };
    }

    /** الخطط المعروضة للبيع (المتجر والمحرر): المفعّلة وغير الداخلية. */
    function salePlans() {
        return plans().filter(function (p) { return p.on && !p.internal; }).map(function (p) {
            return { id: p.id, name: p.name, days: p.days, price: p.price, gamesDiscount: p.gamesDiscount, features: p.features };
        });
    }
    /**
     * اشتراك انشرى من متجر الألعاب: يفعّل الخطة ويسجّل الدفعة. ref = رقم الطلب والمنتج،
     * فلو المتجر أعاد الإرسال ما يتفعّل مرتين.
     */
    function storeGrant(ref, uid, planId, amount, orderId) {
        ref = str(ref, 80);
        if (!ref || !(uid > 0)) return { success: false, error: 'bad_request' };
        if (db.prepare('SELECT 1 FROM veyro_store_refs WHERE ref = ?').get(ref)) return { success: true, duplicate: true };
        if (!plan(planId)) return { success: false, error: 'bad_plan' };
        ensureAccount(uid);
        var r;
        db.transaction(function () {
            r = renew(uid, planId, amount, 'متجر الألعاب #' + str(orderId, 20), { id: null, name: 'المتجر' });
            if (r.success) db.prepare('INSERT INTO veyro_store_refs (ref, user_id, plan, amount, at) VALUES (?, ?, ?, ?, ?)').run(ref, uid, planId, Number(amount) || 0, now());
        })();
        return r.success ? { success: true, sub: subSummary(uid) } : r;
    }

    /* ---------------- الحساب ---------------- */
    function account(uid) { return db.prepare('SELECT * FROM veyro_accounts WHERE user_id = ?').get(uid) || null; }
    /** أول مرة يدخل فيرو: ينشئ حسابه (وأيام التجربة لو مفعّلة). يرجع true لو جديد. */
    function ensureAccount(uid) {
        var t = now();
        var r = db.prepare('INSERT OR IGNORE INTO veyro_accounts (user_id, first_seen, last_seen) VALUES (?, ?, ?)').run(uid, t, t);
        if (!r.changes) return false;
        var trial = int(settings().trialDays, 0);
        if (trial > 0 && !subRow(uid)) {
            putSub(uid, { plan: 'monthly', start_at: t, end_at: t + trial * DAY, lifetime: 0, renewals: 0, source: 'trial' });
            hist(uid, 'تجربة مجانية ' + trial + ' يوم', 'ok', '');
        }
        hist(uid, 'دخل فيرو أول مرة بحساب ألعاب أيمن', 'ok', '');
        return true;
    }
    function touch(uid) { db.prepare('UPDATE veyro_accounts SET last_seen = ? WHERE user_id = ?').run(now(), uid); }
    function setAccount(uid, fields) {
        ensureAccount(uid);
        var keys = Object.keys(fields);
        db.prepare('UPDATE veyro_accounts SET ' + keys.map(function (k) { return k + ' = @' + k; }).join(', ') + ' WHERE user_id = @uid').run(Object.assign({ uid: uid }, fields));
    }

    /* ---------------- التوكنات (الأجهزة وتسجيل الخروج) ---------------- */
    var tokenSeen = new Map(); // hash -> { first, wrote }
    /** يسجّل التوكن ويرجع وقت أول مرة شفناه. */
    function seeToken(uid, token) {
        if (!token) return 0;
        var h = hashToken(token), t = now(), c = tokenSeen.get(h);
        if (!c) {
            var r = db.prepare('SELECT first_at FROM veyro_tokens WHERE token_hash = ?').get(h);
            if (!r) { db.prepare('INSERT OR REPLACE INTO veyro_tokens (token_hash, user_id, first_at, last_at) VALUES (?, ?, ?, ?)').run(h, uid, t, t); c = { first: t, wrote: t }; }
            else c = { first: r.first_at, wrote: 0 };
            tokenSeen.set(h, c);
            if (tokenSeen.size > 20000) tokenSeen.delete(tokenSeen.keys().next().value);
        }
        if (t - c.wrote > 10 * 60e3) { db.prepare('UPDATE veyro_tokens SET last_at = ? WHERE token_hash = ?').run(t, h); c.wrote = t; touch(uid); }
        return c.first;
    }
    var DEVICES_SQL = 'SELECT t.user_id, COUNT(*) AS n FROM veyro_tokens t LEFT JOIN veyro_accounts a ON a.user_id = t.user_id WHERE t.last_at > ? AND t.first_at >= COALESCE(a.sessions_revoked_at, 0)';
    function devices(uid) { var r = db.prepare(DEVICES_SQL + ' AND t.user_id = ? GROUP BY t.user_id').get(now() - 30 * DAY, uid); return r ? r.n : 0; }

    /**
     * فحص كل طلب محمي: حالة الحساب وصلاحية التجربة وتسجيل الخروج.
     * @returns {{blocked?:string, revoked?:boolean, tester:boolean|null}}
     */
    function gate(user, token) {
        var uid = Number(user.id);
        ensureAccount(uid);
        var first = seeToken(uid, token);
        var a = account(uid);
        var out = { tester: a.tester == null ? null : Boolean(a.tester) };
        if (a.status !== 'active') out.blocked = a.status;
        if (a.sessions_revoked_at && first && first < a.sessions_revoked_at) out.revoked = true;
        return out;
    }

    /* ---------------- الاشتراك ---------------- */
    function subRow(uid) { return db.prepare('SELECT * FROM veyro_subs WHERE user_id = ?').get(uid) || null; }
    function putSub(uid, s) {
        var cur = subRow(uid) || {};
        var row = Object.assign({ frozen_at: null, frozen_remaining: null, frozen_why: '', renewals: 0, source: 'gift', end_at: null, lifetime: 0 }, cur, s, { user_id: uid, updated_at: now() });
        db.prepare('INSERT OR REPLACE INTO veyro_subs (user_id, plan, start_at, end_at, lifetime, frozen_at, frozen_remaining, frozen_why, renewals, source, updated_at) ' +
            'VALUES (@user_id, @plan, @start_at, @end_at, @lifetime, @frozen_at, @frozen_remaining, @frozen_why, @renewals, @source, @updated_at)').run(row);
    }
    function subState(s) {
        if (!s) return 'none';
        if (s.lifetime) return 'lifetime';
        if (s.frozen_at) return 'frozen';
        if (s.end_at <= now()) return 'expired';
        if (s.end_at - now() < 7 * DAY) return 'expiring';
        return 'active';
    }
    function isPaying(st) { return st === 'active' || st === 'expiring' || st === 'lifetime'; }
    /** ملخص الاشتراك للستريمر نفسه (المحرر) وللفحص. */
    function subSummary(uid) {
        var s = subRow(uid), st = subState(s), p = s ? plan(s.plan) : null;
        var left = !s ? 0 : s.lifetime ? null : s.frozen_at ? s.frozen_remaining : Math.max(0, s.end_at - now());
        return { state: st, active: isPaying(st), plan: s ? s.plan : null, planName: p ? p.name : null, endsAt: s && !s.lifetime && !s.frozen_at ? s.end_at : null, msLeft: left, lifetime: Boolean(s && s.lifetime), frozen: Boolean(s && s.frozen_at), source: s ? s.source : null };
    }
    /** حدود الحساب: المخصّصة، وإلا خطة اشتراكه النشط، وإلا null (حدود السيرفر العادية). */
    function limits(uid) {
        var a = account(uid) || {}, s = subRow(uid), p = s && isPaying(subState(s)) ? plan(s.plan) : null;
        return {
            screens: a.limit_screens != null ? a.limit_screens : (p ? p.screens : null),
            videos: a.limit_videos != null ? a.limit_videos : (p ? p.videos : null)
        };
    }

    function hist(uid, text, kind, by) { db.prepare('INSERT INTO veyro_history (user_id, at, text, kind, by_admin) VALUES (?, ?, ?, ?, ?)').run(uid, now(), str(text, 300), kind || '', by || ''); }
    function log(admin, act, target, uid) { db.prepare('INSERT INTO veyro_admin_log (at, by_id, by_name, act, target, user_id) VALUES (?, ?, ?, ?, ?, ?)').run(now(), admin ? admin.id : null, admin ? admin.name : '', str(act, 200), str(target, 200), uid || null); }
    function userTag(uid) { var u = db.prepare('SELECT tiktok_username, username FROM users WHERE id = ?').get(uid) || {}; return u.tiktok_username ? '@' + u.tiktok_username : (u.username || '#' + uid); }
    function userExists(uid) { return Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)); }

    function fdate(ts) { return new Date(ts + TZ_MS).toISOString().slice(0, 10); }

    /* ---- العمليات على الاشتراك (كل وحدة ترجع {success} أو {success:false, error}) ---- */
    function addDays(uid, n, why, admin, quiet) {
        n = int(n, 0);
        if (!n || Math.abs(n) > 3650) return { success: false, error: 'bad_days' };
        var s = subRow(uid), st = subState(s), t = now();
        if (st === 'lifetime') return { success: false, error: 'already_lifetime' };
        if (st === 'none' || st === 'expired') {
            if (n < 0) return { success: false, error: 'no_active_sub' };
            putSub(uid, { plan: s ? s.plan : 'monthly', start_at: t, end_at: t + n * DAY, lifetime: 0, frozen_at: null, frozen_remaining: null, renewals: s ? s.renewals : 0, source: 'gift' });
        } else if (st === 'frozen') putSub(uid, { frozen_remaining: Math.max(0, s.frozen_remaining + n * DAY) });
        else putSub(uid, { end_at: Math.max(t, s.end_at + n * DAY) });
        hist(uid, (n > 0 ? 'إضافة ' + n + ' يوم' : 'خصم ' + (-n) + ' يوم') + (why ? ' — ' + str(why, 120) : ''), n > 0 ? 'ok' : 'warn', admin && admin.name);
        if (!quiet) log(admin, n > 0 ? 'أضاف ' + n + ' يوم' : 'خصم ' + (-n) + ' يوم', userTag(uid), uid);
        return { success: true };
    }
    function setEnd(uid, ts, admin) {
        ts = Number(ts);
        if (!isFinite(ts) || ts < now() - 3650 * DAY || ts > now() + 3650 * DAY) return { success: false, error: 'bad_date' };
        var s = subRow(uid);
        putSub(uid, { plan: s ? s.plan : 'monthly', start_at: s ? s.start_at : now(), end_at: ts, lifetime: 0, frozen_at: null, frozen_remaining: null });
        hist(uid, 'تغيير تاريخ الانتهاء إلى ' + fdate(ts), 'warn', admin && admin.name);
        log(admin, 'غيّر تاريخ الانتهاء', userTag(uid) + ' ← ' + fdate(ts), uid);
        return { success: true };
    }
    function setLifetime(uid, on, method, admin, quiet) {
        var s = subRow(uid);
        if (on) {
            putSub(uid, { plan: 'lifetime', start_at: s ? s.start_at : now(), end_at: null, lifetime: 1, frozen_at: null, frozen_remaining: null, renewals: s ? s.renewals : 0, source: 'gift' });
            db.prepare('INSERT INTO veyro_payments (user_id, at, amount, plan, method, by_admin) VALUES (?, ?, 0, ?, ?, ?)').run(uid, now(), 'lifetime', str(method || 'هدية من الأدمن', 60), admin ? admin.name : '');
            hist(uid, 'اشتراك مفتوح (بدون انتهاء)', 'gold', admin && admin.name);
            if (!quiet) log(admin, 'عطى اشتراك مفتوح', userTag(uid), uid);
        } else {
            if (!s || !s.lifetime) return { success: false, error: 'not_lifetime' };
            putSub(uid, { lifetime: 0, plan: 'monthly', end_at: now() + 30 * DAY });
            hist(uid, 'إلغاء الاشتراك المفتوح — صار شهري ينتهي ' + fdate(now() + 30 * DAY), 'warn', admin && admin.name);
            log(admin, 'ألغى الاشتراك المفتوح', userTag(uid), uid);
        }
        return { success: true };
    }
    function renew(uid, planId, amount, method, admin, quiet) {
        var p = plan(planId);
        if (!p) return { success: false, error: 'bad_plan' };
        if (p.id === 'lifetime') return setLifetime(uid, true, method, admin, quiet);
        var s = subRow(uid), st = subState(s);
        if (st === 'frozen') { putSub(uid, { end_at: now() + s.frozen_remaining, frozen_at: null, frozen_remaining: null }); s = subRow(uid); st = subState(s); }
        var had = st !== 'none';
        var running = st === 'active' || st === 'expiring';
        amount = Math.max(0, Number(amount) || 0);
        putSub(uid, { plan: p.id, start_at: running ? s.start_at : now(), end_at: (running ? s.end_at : now()) + p.days * DAY, lifetime: 0, frozen_at: null, frozen_remaining: null, renewals: (s ? s.renewals : 0) + (had ? 1 : 0), source: amount ? 'paid' : (/^كود/.test(method || '') ? 'code' : 'gift') });
        db.prepare('INSERT INTO veyro_payments (user_id, at, amount, plan, method, by_admin) VALUES (?, ?, ?, ?, ?, ?)').run(uid, now(), amount, p.id, str(method || 'يدوي', 60), admin ? admin.name : '');
        hist(uid, (had ? 'تجديد ' : 'اشتراك ') + p.name + (amount ? ' — ' + amount + ' ر.س' : ' (بدون مبلغ)') + (method ? ' (' + str(method, 60) + ')' : ''), 'gold', admin && admin.name);
        if (!quiet) log(admin, (had ? 'جدّد ' : 'فعّل ') + p.name, userTag(uid), uid);
        return { success: true };
    }
    function freeze(uid, why, admin) {
        var s = subRow(uid), st = subState(s);
        if (st !== 'active' && st !== 'expiring') return { success: false, error: 'not_running' };
        putSub(uid, { frozen_at: now(), frozen_remaining: s.end_at - now(), frozen_why: str(why, 80) });
        hist(uid, 'تجميد الاشتراك' + (why ? ' (' + str(why, 80) + ')' : '') + ' — باقي ' + Math.ceil((s.end_at - now()) / DAY) + ' يوم محفوظة', 'warn', admin && admin.name);
        log(admin, 'جمّد اشتراك', userTag(uid), uid);
        return { success: true };
    }
    function unfreeze(uid, admin) {
        var s = subRow(uid);
        if (!s || !s.frozen_at) return { success: false, error: 'not_frozen' };
        putSub(uid, { end_at: now() + s.frozen_remaining, frozen_at: null, frozen_remaining: null, frozen_why: '' });
        hist(uid, 'فك التجميد — ينتهي ' + fdate(now() + s.frozen_remaining), 'ok', admin && admin.name);
        log(admin, 'فك تجميد', userTag(uid), uid);
        return { success: true };
    }
    function cancel(uid, admin) {
        var s = subRow(uid);
        if (!s) return { success: false, error: 'no_sub' };
        putSub(uid, { lifetime: 0, frozen_at: null, frozen_remaining: null, end_at: now() - 1000, plan: s.plan === 'lifetime' ? 'monthly' : s.plan });
        hist(uid, 'إنهاء الاشتراك فوراً', 'bad', admin && admin.name);
        log(admin, 'أنهى اشتراك', userTag(uid), uid);
        return { success: true };
    }

    /* ---------------- الأكواد ---------------- */
    function codeRow(r) {
        var uses = db.prepare('SELECT user_id, at FROM veyro_code_uses WHERE code = ? ORDER BY at').all(r.code).map(function (x) { return { uid: x.user_id, at: x.at }; });
        return { code: r.code, type: r.type, days: r.days, plan: r.plan, maxUses: r.max_uses, uses: uses, expires: r.expires_at, campaign: r.campaign, created: r.created_at, by: r.created_by, disabled: Boolean(r.disabled), forUser: r.for_user };
    }
    function codeState(c) { if (c.disabled) return 'disabled'; if (c.uses.length >= c.maxUses) return 'used'; if (c.expires && c.expires < now()) return 'expired'; return 'active'; }
    function genCode(prefix) {
        var b = crypto.randomBytes(8), s = '';
        for (var i = 0; i < 8; i++) { s += CODE_ALPHA[b[i] % CODE_ALPHA.length]; if (i === 3) s += '-'; }
        prefix = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
        return (prefix ? prefix + '-' : '') + s;
    }
    function genCodes(o, admin) {
        var type = CODE_TYPES[o.type] ? o.type : null;
        if (!type) return { success: false, error: 'bad_type' };
        var count = clamp(int(o.count, 1), 1, 1000), maxUses = clamp(int(o.maxUses, 1), 1, 100000);
        var days = clamp(int(o.days, 0), 0, 3650);
        if ((type === 'days' || type === 'extra') && !days) return { success: false, error: 'bad_days' };
        if (type === 'plan' && !plan(o.plan)) return { success: false, error: 'bad_plan' };
        var exp = o.expires ? Number(o.expires) : null;
        if (exp && exp < now()) return { success: false, error: 'bad_date' };
        var forUser = o.forUser ? int(o.forUser, 0) : null;
        if (forUser && !userExists(forUser)) return { success: false, error: 'bad_user' };
        var ins = db.prepare('INSERT OR IGNORE INTO veyro_codes (code, type, days, plan, max_uses, expires_at, campaign, created_at, created_by, disabled, for_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)');
        var out = [];
        db.transaction(function () {
            var guard = 0;
            while (out.length < count && guard++ < count * 5) {
                var c = genCode(o.prefix);
                if (ins.run(c, type, days, type === 'plan' ? o.plan : null, maxUses, exp, str(o.campaign, 60), now(), admin ? admin.name : '', forUser).changes) out.push(c);
            }
        })();
        log(admin, 'أنشأ ' + out.length + ' كود (' + CODE_TYPES[type] + ')', str(o.campaign, 60) || '—');
        return { success: true, codes: out.map(function (c) { return codeRow(db.prepare('SELECT * FROM veyro_codes WHERE code = ?').get(c)); }) };
    }
    var REDEEM_ERR = { not_found: 'الكود غير موجود', used: 'الكود مستخدم بالكامل', expired: 'الكود منتهي', disabled: 'الكود معطّل', other_user: 'الكود مخصّص لستريمر ثاني', already_used: 'استخدمت هالكود قبل', blocked: 'الحساب موقوف أو محظور', needs_sub: 'هالكود للمشتركين الحاليين بس' };
    /** يطبّق كود على حساب. admin = null لو الستريمر نفسه كتبه. */
    function redeem(codeStr, uid, admin) {
        var r = db.prepare('SELECT * FROM veyro_codes WHERE code = ?').get(String(codeStr || '').trim().toUpperCase());
        if (!r) return { success: false, error: 'not_found' };
        var c = codeRow(r), st = codeState(c);
        if (st !== 'active') return { success: false, error: st };
        if (c.forUser && c.forUser !== uid) return { success: false, error: 'other_user' };
        if (c.uses.some(function (x) { return x.uid === uid; })) return { success: false, error: 'already_used' };
        ensureAccount(uid);
        if (account(uid).status !== 'active') return { success: false, error: 'blocked' };
        var sst = subState(subRow(uid));
        if (c.type === 'extra' && !isPaying(sst) && sst !== 'frozen') return { success: false, error: 'needs_sub' };
        var res;
        db.transaction(function () {
            if (c.type === 'days' || c.type === 'extra') res = addDays(uid, c.days, 'كود ' + c.code, admin, true);
            else if (c.type === 'plan') res = renew(uid, c.plan, 0, 'كود ' + c.code, admin, true);
            else res = setLifetime(uid, true, 'كود ' + c.code, admin, true);
            if (res.success) {
                db.prepare('INSERT INTO veyro_code_uses (code, user_id, at) VALUES (?, ?, ?)').run(c.code, uid, now());
                hist(uid, 'استخدم الكود ' + c.code, 'gold', admin ? admin.name : '');
                log(admin || { id: uid, name: userTag(uid) }, admin ? 'طبّق كود' : 'استخدم كود', c.code + ' ← ' + userTag(uid), uid);
            }
        })();
        return res.success ? { success: true, sub: subSummary(uid) } : res;
    }

    /* ---------------- الاستخدام (الساعات الفعلية) ---------------- */
    var addUsageStmt = db.prepare('INSERT INTO veyro_usage (user_id, day, open_sec, live_sec, sessions) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, day) DO UPDATE SET open_sec = open_sec + excluded.open_sec, live_sec = live_sec + excluded.live_sec, sessions = sessions + excluded.sessions');
    /** rows: [{uid, day, open, live, sessions}] بالثواني. */
    function addUsage(rows) {
        db.transaction(function () { rows.forEach(function (r) { addUsageStmt.run(r.uid, r.day, Math.round(r.open), Math.round(r.live), r.sessions | 0); }); })();
    }

    /* ---------------- المكتبة العامة ---------------- */
    function assetFile(id) { return dir ? path.join(dir, id) : null; }
    function assetRow(r, withUsage) {
        var st = json(r.settings, {});
        var a = { id: r.id, type: r.type, name: r.name, cat: r.cat, status: r.status, access: r.access, version: r.version, updated: r.updated_at, created: r.created_at, mime: r.mime, size: r.size, key: st.key || null, top: st.top || null, vol: st.vol == null ? 0.8 : st.vol, dur: st.dur || 6, w: st.w || 0, h: st.h || 0, d: st.d || 0, fscale: st.fscale || 1.3, src: {} };
        if (r.mime) {
            var url = fileUrl(r.id) + '&v=' + r.updated_at;
            if (r.type === 'alert') a.src.video = url; else if (r.type === 'sound') a.src.audio = url; else a.src.img = url;
        }
        if (withUsage) a.usage = assetUsage(r.id);
        return a;
    }
    function assetUsage(id) { try { return db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM stream_screens WHERE design LIKE ?').get('%' + id + '%').n; } catch (e) { return 0; } }
    function cleanAssetSettings(type, a, old) {
        var st = json(old || '{}', {});
        if ('key' in a) st.key = a.key && typeof a.key === 'object' ? require('../stats/screen-media-service').cleanKey(a.key) : null;
        if (type === 'top' && a.top && typeof a.top === 'object') {
            var t = a.top, hex = /^#[0-9a-f]{6}$/i;
            st.top = { title: str(t.title, 40), rows: clamp(int(t.rows, 5), 1, 10), shape: ['bevel', 'round', 'pill', 'sharp'].indexOf(t.shape) >= 0 ? t.shape : 'bevel',
                accent: hex.test(t.accent) ? t.accent : '#cfc3dc', bg: hex.test(t.bg) ? t.bg : '#14121a', bgA: clamp(Number(t.bgA) || 0, 0, 1), border: hex.test(t.border) ? t.border : '#a99bb8',
                gap: clamp(int(t.gap, 6), 0, 24), font: ['kufi', 'plex', 'mono'].indexOf(t.font) >= 0 ? t.font : 'kufi', crown: t.crown !== false };
        }
        if (a.vol != null) st.vol = clamp(Number(a.vol) || 0, 0, 1);
        if (a.dur != null) st.dur = clamp(int(a.dur, 6), 1, 60);
        // أبعاد الفيديو ومدته (من المتصفح) — المحرر يحتاجها لأليرت من مكتبة فيرو
        if (a.w != null) st.w = clamp(int(a.w, 0), 0, 10000);
        if (a.h != null) st.h = clamp(int(a.h, 0), 0, 10000);
        if (a.d != null) st.d = clamp(Number(a.d) || 0, 0, 3600);
        // الإطار: حجمه نسبة لصورة الداعم (المحرر يحطه حولها)
        if (a.fscale != null) st.fscale = clamp(Number(a.fscale) || 1.3, 1, 2.5);
        return JSON.stringify(st);
    }
    /** حفظ أصل (جديد أو تعديل). publish = ينشر للجميع ويرفع رقم النسخة. */
    function saveAsset(a, publish, admin) {
        a = a || {};
        var old = ID_RE.test(String(a.id || '')) ? db.prepare('SELECT * FROM veyro_assets WHERE id = ?').get(a.id) : null;
        var type = old ? old.type : (ASSET_TYPES.indexOf(a.type) >= 0 ? a.type : null);
        if (!type) return { success: false, error: 'bad_type' };
        var name = str(a.name, 60) || (old && old.name);
        if (!name) return { success: false, error: 'name_required' };
        var status = publish ? 'published' : (ASSET_STATUS.indexOf(a.status) >= 0 ? a.status : (old ? old.status : 'draft'));
        if (status === 'published' && type !== 'top' && !(old && old.mime)) return { success: false, error: 'file_required' };
        var id = old ? old.id : crypto.randomBytes(16).toString('hex'), t = now();
        var version = old ? old.version : 0;
        if (publish) version = (old && old.status === 'published') ? version + 1 : Math.max(1, version);
        var access = ASSET_ACCESS.indexOf(a.access) >= 0 ? a.access : (old ? old.access : 'all');
        var settingsJson = cleanAssetSettings(type, a, old && old.settings);
        if (old) db.prepare('UPDATE veyro_assets SET name = ?, cat = ?, status = ?, access = ?, version = ?, settings = ?, updated_at = ? WHERE id = ?').run(name, str(a.cat, 40), status, access, version, settingsJson, t, id);
        else db.prepare('INSERT INTO veyro_assets (id, type, name, cat, status, access, version, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, type, name, str(a.cat, 40), status, access, version, settingsJson, t, t);
        log(admin, publish ? 'نشر أصل للجميع' : (old ? 'عدّل أصل' : 'أضاف أصل'), name);
        return { success: true, asset: assetRow(db.prepare('SELECT * FROM veyro_assets WHERE id = ?').get(id), true) };
    }
    function deleteAsset(id, admin) {
        var r = ID_RE.test(String(id || '')) ? db.prepare('SELECT * FROM veyro_assets WHERE id = ?').get(id) : null;
        if (!r) return { success: false, error: 'not_found' };
        db.prepare('DELETE FROM veyro_assets WHERE id = ?').run(id);
        var f = assetFile(id); if (f) fs.unlink(f, function () {});
        log(admin, 'حذف أصل', r.name);
        return { success: true };
    }
    /** يحفظ ملف الأصل من جسم الطلب (بحد أقصى، ونوعه من أول بايتات). */
    function uploadAssetFile(id, input, declared, admin) {
        return new Promise(function (resolve) {
            var r = ID_RE.test(String(id || '')) ? db.prepare('SELECT * FROM veyro_assets WHERE id = ?').get(id) : null;
            if (!r || !dir) { input.resume(); resolve({ success: false, error: r ? 'storage_unavailable' : 'not_found' }); return; }
            if (r.type === 'top') { input.resume(); resolve({ success: false, error: 'no_file_for_type' }); return; }
            if (declared && declared > MAX_ASSET_BYTES) { input.resume(); resolve({ success: false, error: 'file_too_large', max: MAX_ASSET_BYTES }); return; }
            try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { input.resume(); resolve({ success: false, error: 'storage_unavailable' }); return; }
            var tmp = assetFile(id + '.part'), out = fs.createWriteStream(tmp), size = 0, head = [], headLen = 0, done = false;
            function fin(x) { if (done) return; done = true; if (!x.success) { out.destroy(); fs.unlink(tmp, function () {}); } resolve(x); }
            input.on('data', function (ch) {
                if (done) return;
                size += ch.length;
                if (size > MAX_ASSET_BYTES) { fin({ success: false, error: 'file_too_large', max: MAX_ASSET_BYTES }); input.resume(); return; }
                if (headLen < 16) { head.push(ch); headLen += ch.length; }
                if (!out.write(ch)) { input.pause(); out.once('drain', function () { input.resume(); }); }
            });
            input.on('error', function () { fin({ success: false, error: 'upload_failed' }); });
            input.on('end', function () {
                if (done) return;
                var mime = sniffAsset(Buffer.concat(head));
                if (!size) return fin({ success: false, error: 'empty_file' });
                if (!mime || !mimeFits(r.type, mime)) return fin({ success: false, error: 'unsupported_type' });
                out.end(function () {
                    fs.rename(tmp, assetFile(id), function (err) {
                        if (err) return fin({ success: false, error: 'storage_unavailable' });
                        db.prepare('UPDATE veyro_assets SET mime = ?, size = ?, updated_at = ? WHERE id = ?').run(mime, size, now(), id);
                        log(admin, 'رفع ملف أصل', r.name);
                        done = true;
                        resolve({ success: true, asset: assetRow(db.prepare('SELECT * FROM veyro_assets WHERE id = ?').get(id), true) });
                    });
                });
            });
        });
    }
    /** ملف أصل للرابط العام (المنشور بس، أو أي حالة لو forAdmin). */
    function findAssetFile(id, forAdmin) {
        if (!ID_RE.test(String(id || '')) || !dir) return null;
        var r = db.prepare('SELECT * FROM veyro_assets WHERE id = ?').get(id);
        if (!r || !r.mime || (!forAdmin && r.status !== 'published')) return null;
        var f = assetFile(id);
        if (!fs.existsSync(f)) return null;
        return { mime: r.mime, size: fs.statSync(f).size, file: f };
    }
    /** المكتبة اللي يشوفها الستريمر: المنشور المسموح له. */
    function libraryFor(uid) {
        var s = subRow(uid), st = subState(s), paying = isPaying(st);
        return db.prepare("SELECT * FROM veyro_assets WHERE status = 'published' ORDER BY updated_at DESC").all().filter(function (r) {
            return r.access === 'all' || (r.access === 'subs' && paying) || (r.access === 'yearly' && paying && (s.plan === 'yearly' || s.lifetime));
        }).map(function (r) { return assetRow(r, false); });
    }

    /* ---------------- تعديلات الحساب من الأدمن ---------------- */
    function setStatus(uid, status, why, admin) {
        if (['active', 'suspended', 'banned'].indexOf(status) === -1) return { success: false, error: 'bad_status' };
        setAccount(uid, { status: status, status_reason: str(why, 120) });
        var L = { active: 'تفعيل الحساب', suspended: 'إيقاف الحساب', banned: 'حظر الحساب' };
        hist(uid, L[status] + (why ? ': ' + str(why, 120) : ''), status === 'active' ? 'ok' : 'bad', admin && admin.name);
        log(admin, L[status], userTag(uid), uid);
        return { success: true };
    }
    function setTester(uid, on, admin, quiet) {
        setAccount(uid, { tester: on ? 1 : 0 });
        hist(uid, (on ? 'إعطاء' : 'سحب') + ' صلاحية «تجربة Veyro»', on ? 'ok' : 'warn', admin && admin.name);
        if (!quiet) log(admin, (on ? 'عطى' : 'سحب') + ' صلاحية التجربة', userTag(uid), uid);
        return { success: true };
    }
    function logoutAll(uid, admin) {
        // سجل التوكنات يبقى: القديم (أول ما شفناه قبل هالوقت) يظل مرفوض، والدخول الجديد يشتغل
        setAccount(uid, { sessions_revoked_at: now() + 1 });
        hist(uid, 'تسجيل خروج من كل الأجهزة', 'warn', admin && admin.name);
        log(admin, 'سجّل خروجه من كل الأجهزة', userTag(uid), uid);
        return { success: true };
    }
    function setLimits(uid, l, admin) {
        function lim(v) { return v === '' || v == null ? null : clamp(int(v, 0), 0, 500); }
        var screens = lim(l.screens), videos = lim(l.videos);
        setAccount(uid, { limit_screens: screens, limit_videos: videos });
        hist(uid, 'تعديل الحدود: ' + (screens == null ? 'الشاشات حسب الخطة' : screens + ' شاشة') + '، ' + (videos == null ? 'الفيديوهات حسب الخطة' : videos + ' فيديو'), '', admin && admin.name);
        log(admin, 'عدّل الحدود', userTag(uid), uid);
        return { success: true };
    }
    function setNotes(uid, text, admin) { setAccount(uid, { notes: str(text, 2000) }); log(admin, 'عدّل الملاحظات', userTag(uid), uid); return { success: true }; }

    /* ---------------- لقطة كاملة للوحة (نفس شكل بيانات المعاينة) ---------------- */
    function snapshot(presence) {
        presence = presence || function () { return null; };
        var t = now(), days = [];
        for (var i = USAGE_DAYS - 1; i >= 0; i--) days.push(dayKey(t - i * DAY));
        var dayIdx = {}; days.forEach(function (d, i) { dayIdx[d] = i; });
        var usage = {};
        db.prepare('SELECT user_id, day, open_sec, live_sec, sessions FROM veyro_usage WHERE day >= ?').all(days[0]).forEach(function (r) {
            var u = usage[r.user_id] || (usage[r.user_id] = { daily: new Array(USAGE_DAYS).fill(0), live: new Array(USAGE_DAYS).fill(0) });
            if (dayIdx[r.day] != null) { u.daily[dayIdx[r.day]] = Math.round(r.open_sec / 360) / 10; u.live[dayIdx[r.day]] = Math.round(r.live_sec / 360) / 10; }
        });
        var totals = {};
        db.prepare('SELECT user_id, SUM(open_sec) AS o, SUM(live_sec) AS l, SUM(sessions) AS s FROM veyro_usage GROUP BY user_id').all().forEach(function (r) { totals[r.user_id] = r; });
        function countBy(sql) { var m = {}; try { db.prepare(sql).all().forEach(function (r) { m[r.user_id] = r.n; }); } catch (e) { /* الجدول ما انشأ */ } return m; }
        var screens = countBy('SELECT user_id, COUNT(*) AS n FROM stream_screens GROUP BY user_id');
        var videos = countBy('SELECT user_id, COUNT(*) AS n FROM screen_media GROUP BY user_id');
        var bytes = countBy('SELECT user_id, SUM(size) AS n FROM screen_media GROUP BY user_id');
        var dons = {};
        try { db.prepare("SELECT user_id, SUM(amount_cents) AS c, COUNT(*) AS n FROM donations WHERE is_test = 0 AND currency = 'USD' GROUP BY user_id").all().forEach(function (r) { dons[r.user_id] = { total: r.c / 100, count: r.n }; }); } catch (e) { /* ignore */ }
        var subs = {}; db.prepare('SELECT * FROM veyro_subs').all().forEach(function (r) { subs[r.user_id] = r; });
        var pays = {}; db.prepare('SELECT * FROM veyro_payments ORDER BY at DESC').all().forEach(function (r) { (pays[r.user_id] = pays[r.user_id] || []).push({ at: r.at, amount: r.amount, plan: r.plan, method: r.method }); });
        var hists = {}; db.prepare('SELECT * FROM veyro_history ORDER BY at DESC, id DESC').all().forEach(function (r) { var l = hists[r.user_id] = hists[r.user_id] || []; if (l.length < 200) l.push({ at: r.at, t: r.text, k: r.kind, by: r.by_admin }); });
        var devs = {}; db.prepare(DEVICES_SQL + ' GROUP BY t.user_id').all(t - 30 * DAY).forEach(function (r) { devs[r.user_id] = r.n; });
        var users = db.prepare('SELECT u.*, a.status, a.status_reason, a.tester AS a_tester, a.notes, a.limit_screens, a.limit_videos, a.first_seen, a.last_seen FROM users u LEFT JOIN veyro_accounts a ON a.user_id = u.id').all().map(function (r) {
            var perms = json(r.permissions, {}), s = subs[r.id], us = usage[r.id], tot = totals[r.id] || {}, pr = presence(r.id) || {};
            var email = r.email && !/\.invalid$/i.test(r.email) ? r.email : '';
            return {
                id: r.id, customId: r.custom_id || '', name: r.display_name || r.tiktok_display_name || r.username || ('#' + r.id), username: r.username || '', email: email,
                tiktok: (r.tiktok_username || '').replace(/^@/, '').toLowerCase(), tiktokVerified: Boolean(r.tiktok_verified), avatar: r.tiktok_avatar_url || '',
                role: r.role, isStreamer: Boolean(r.is_streamer), coreTester: Boolean(perms.veyro_tester),
                joined: r.created_at || r.first_seen || r.updated_at, veyroSince: r.first_seen || r.updated_at, lastSeen: Math.max(r.last_seen || 0, pr.last || 0) || r.updated_at,
                online: Boolean(pr.online), liveSince: pr.since || null, onAir: Boolean(pr.live),
                status: r.status || 'active', statusReason: r.status_reason || '', tester: r.a_tester == null ? Boolean(perms.veyro_tester) : Boolean(r.a_tester),
                notes: r.notes || '', limits: { screens: r.limit_screens == null ? null : r.limit_screens, videos: r.limit_videos == null ? null : r.limit_videos },
                devices: devs[r.id] || 0,
                sub: s ? { plan: s.plan, start: s.start_at, end: s.end_at, lifetime: Boolean(s.lifetime), frozen: s.frozen_at ? { at: s.frozen_at, remaining: s.frozen_remaining, why: s.frozen_why } : null, renewals: s.renewals, source: s.source } : null,
                payments: pays[r.id] || [],
                usage: { daily: us ? us.daily : new Array(USAGE_DAYS).fill(0), live: us ? us.live : new Array(USAGE_DAYS).fill(0), hoursTotal: Math.round((tot.o || 0) / 360) / 10, liveTotal: Math.round((tot.l || 0) / 360) / 10, sessions: tot.s || 0, screens: screens[r.id] || 0, videos: videos[r.id] || 0, storageMb: Math.round((bytes[r.id] || 0) / 1048576) },
                donations: dons[r.id] || { total: 0, count: 0 },
                history: hists[r.id] || []
            };
        });
        return {
            v: 1, real: true, now: t,
            plans: plans(),
            users: users,
            codes: db.prepare('SELECT * FROM veyro_codes ORDER BY created_at DESC LIMIT 5000').all().map(codeRow),
            assets: db.prepare('SELECT * FROM veyro_assets ORDER BY updated_at DESC').all().map(function (r) { return assetRow(r, true); }),
            log: db.prepare('SELECT * FROM veyro_admin_log ORDER BY at DESC, id DESC LIMIT 500').all().map(function (r) { return { id: r.id, at: r.at, by: r.by_name, act: r.act, target: r.target, uid: r.user_id }; }),
            cfg: settings()
        };
    }

    return {
        settings: settings, setSetting: setSetting,
        plans: plans, plan: plan, planName: planName, savePlan: savePlan, salePlans: salePlans, storeGrant: storeGrant,
        ensureAccount: ensureAccount, account: account, gate: gate, devices: devices,
        subRow: subRow, subState: subState, subSummary: subSummary, limits: limits, isPaying: isPaying,
        addDays: addDays, setEnd: setEnd, renew: renew, setLifetime: setLifetime, freeze: freeze, unfreeze: unfreeze, cancel: cancel,
        setStatus: setStatus, setTester: setTester, logoutAll: logoutAll, setLimits: setLimits, setNotes: setNotes,
        genCodes: genCodes, redeem: redeem, codeState: codeState, REDEEM_ERR: REDEEM_ERR,
        toggleCode: function (code, admin) { var r = db.prepare('SELECT * FROM veyro_codes WHERE code = ?').get(String(code || '')); if (!r) return { success: false, error: 'not_found' }; db.prepare('UPDATE veyro_codes SET disabled = ? WHERE code = ?').run(r.disabled ? 0 : 1, r.code); log(admin, r.disabled ? 'فعّل كود' : 'عطّل كود', r.code); return { success: true }; },
        deleteCode: function (code, admin) { var c = String(code || ''); if (db.prepare('SELECT 1 FROM veyro_code_uses WHERE code = ?').get(c)) return { success: false, error: 'code_used' }; var r = db.prepare('DELETE FROM veyro_codes WHERE code = ?').run(c); if (!r.changes) return { success: false, error: 'not_found' }; log(admin, 'حذف كود', c); return { success: true }; },
        addUsage: addUsage,
        saveAsset: saveAsset, deleteAsset: deleteAsset, uploadAssetFile: uploadAssetFile, findAssetFile: findAssetFile, libraryFor: libraryFor,
        hist: hist, log: log, userTag: userTag, userExists: userExists,
        snapshot: snapshot, dayKey: dayKey,
        ADMIN_ROLES: ADMIN_ROLES, CODE_TYPES: CODE_TYPES
    };
}

var instance = null;
function get() {
    if (!instance) {
        var database = require('../db/database');
        instance = createService(database, { dir: path.join(database.DATA_DIR, 'veyro-assets') });
    }
    return instance;
}

module.exports = { createService: createService, get: get, sniffAsset: sniffAsset, dayKey: dayKey, DAY: DAY, MAX_ASSET_BYTES: MAX_ASSET_BYTES };
