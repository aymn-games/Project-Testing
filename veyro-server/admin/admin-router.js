/**
 * VEYRO ADMIN ROUTER — مسارات لوحة تحكم فيرو (veyro/admin.html) ومسارات الستريمر الخاصة بالاشتراك.
 * تنضاف لـROUTES بـhttp/veyro-router.js. المنطق كله بـadmin/veyro-admin-service.js.
 *
 * الأدمن:
 *   GET  /api/veyro/admin/snapshot            → كل بيانات اللوحة (نفس شكل بيانات المعاينة بـveyro/admin.js)
 *   POST /api/veyro/admin/op { op, ... }      → أي تعديل (أيام، تجديد، أكواد، خطط، مكتبة، إعدادات…)
 *   POST /api/veyro/admin/assets/upload?id=   → ملف أصل بالمكتبة العامة (الجسم = الملف)
 * الستريمر:
 *   GET  /api/veyro/me                        → اشتراكه وحالة حسابه والإعلان
 *   POST /api/veyro/me/redeem { code }        → يطبّق كود
 *   GET  /api/veyro/library                   → مكتبة فيرو العامة المسموحة له
 * عام:
 *   GET  /api/veyro/assets/file?id=           → ملف أصل (المعرّف عشوائي طويل ما ينخمّن، مثل فيديوهات المكتبة)
 *
 * الصلاحيات: role = admin بسيرفر الألعاب = المالك (كل شي). والمشرفين من إعدادات فيرو (cfg.admins):
 *   manager = كل شي ما عدا المشرفين، support = قراءة + أيام إضافية + ملاحظات + تطبيق كود، content = المكتبة بس.
 */

'use strict';

var fs = require('fs');
var response = require('../http/response');
var svcMod = require('./veyro-admin-service');
var tracker = require('./usage-tracker');

var sendJson = response.sendJson;
function svc() { return svcMod.get(); }

function q(req, key) {
    var qs = (req.url || '').split('?')[1] || '', v = '';
    qs.split('&').forEach(function (p) { var kv = p.split('='); if (decodeURIComponent(kv[0] || '') === key) v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); });
    return v;
}

/** دور الأدمن بفيرو: owner | manager | support | content | null */
function adminRole(user) {
    if (!user) return null;
    if (user.role === 'admin') return 'owner';
    var a = (svc().settings().admins || []).filter(function (x) { return Number(x.id) === Number(user.id); })[0];
    return a && svcMod.get().ADMIN_ROLES[a.role] ? a.role : null;
}
function adminOf(user) { return { id: Number(user.id), name: user.display_name || user.tiktok_display_name || user.username || ('#' + user.id) }; }

var CONTENT_OPS = { assetSave: 1, assetDelete: 1 };
var SUPPORT_OPS = { addDays: 1, bulkDays: 1, setNotes: 1, redeem: 1 };
var OWNER_OPS = { adminAdd: 1, adminDel: 1 };
function allowed(role, op, body) {
    if (role === 'owner') return true;
    if (OWNER_OPS[op]) return false;
    if (role === 'manager') return true;
    if (role === 'content') return Boolean(CONTENT_OPS[op]);
    if (role === 'support') return Boolean(SUPPORT_OPS[op]) && !((op === 'addDays' || op === 'bulkDays') && Number(body.n) < 0);
    return false;
}

function handleSnapshot(req, res, body, user) {
    var role = adminRole(user);
    if (!role) { sendJson(res, 403, { success: false, error: 'not_admin' }); return; }
    var snap = svc().snapshot(tracker.get().presence);
    snap.success = true;
    snap.me = { id: Number(user.id), name: adminOf(user).name, role: role };
    snap.roles = svc().ADMIN_ROLES;
    sendJson(res, 200, snap);
}

/* ---------- العمليات ---------- */
function uidOf(b) { var n = Math.round(Number(b.uid)); return n > 0 && svc().userExists(n) ? n : 0; }
function uidsOf(b) { return (Array.isArray(b.uids) ? b.uids : []).slice(0, 2000).map(Number).filter(function (n) { return n > 0 && svc().userExists(n); }); }

function wipeVeyroData(uid) {
    var screens = require('../stats/stream-screens-service'), media = require('../stats/screen-media-service');
    var n = { screens: 0, videos: 0 };
    screens.list(uid).forEach(function (s) { if (screens.remove(uid, s.id).success) n.screens++; });
    media.list(uid).forEach(function (m) { if (media.remove(uid, m.id).success) n.videos++; });
    return n;
}

var OPS = {
    addDays: function (b, A) { return svc().addDays(uidOf(b), b.n, b.why, A); },
    setEnd: function (b, A) { return svc().setEnd(uidOf(b), b.ts, A); },
    renew: function (b, A) { return svc().renew(uidOf(b), b.plan, b.amount, b.method, A); },
    setLifetime: function (b, A) { return svc().setLifetime(uidOf(b), Boolean(b.on), null, A); },
    freeze: function (b, A) { return svc().freeze(uidOf(b), b.why, A); },
    unfreeze: function (b, A) { return svc().unfreeze(uidOf(b), A); },
    cancel: function (b, A) { return svc().cancel(uidOf(b), A); },
    setStatus: function (b, A) { return svc().setStatus(uidOf(b), b.status, b.why, A); },
    setTester: function (b, A) { return svc().setTester(uidOf(b), Boolean(b.on), A); },
    logoutAll: function (b, A) { return svc().logoutAll(uidOf(b), A); },
    setLimits: function (b, A) { return svc().setLimits(uidOf(b), { screens: b.screens, videos: b.videos }, A); },
    setNotes: function (b, A) { return svc().setNotes(uidOf(b), b.text, A); },
    wipe: function (b, A) {
        var uid = uidOf(b); if (!uid) return { success: false, error: 'bad_user' };
        var n = wipeVeyroData(uid);
        svc().hist(uid, 'حذف بيانات فيرو (' + n.screens + ' شاشة، ' + n.videos + ' فيديو)', 'bad', A.name);
        svc().log(A, 'حذف بيانات فيرو', svc().userTag(uid), uid);
        return { success: true, removed: n };
    },
    bulkDays: function (b, A) {
        var ok = 0; uidsOf(b).forEach(function (u) { if (svc().addDays(u, b.n, b.why, A, true).success) ok++; });
        svc().log(A, 'أضاف ' + Number(b.n) + ' يوم لـ' + ok + ' ستريمر', b.why || '—');
        return { success: true, count: ok };
    },
    bulkGrant: function (b, A) {
        var ok = 0; uidsOf(b).forEach(function (u) { if (svc().renew(u, b.plan, b.amount, b.method, A).success) ok++; });
        return { success: ok > 0, count: ok, error: ok ? undefined : 'bad_plan' };
    },
    bulkTester: function (b, A) {
        var l = uidsOf(b); l.forEach(function (u) { svc().setTester(u, true, A, true); });
        svc().log(A, 'عطى صلاحية التجربة لـ' + l.length + ' ستريمر', '—');
        return { success: true, count: l.length };
    },
    compensate: function (b, A) {
        var t = Date.now(), DAY = svcMod.DAY, n = Math.round(Number(b.n));
        if (!(n > 0 && n <= 365)) return { success: false, error: 'bad_days' };
        var groups = {
            paying: function (st) { return st === 'active' || st === 'expiring'; },
            pf: function (st) { return st === 'active' || st === 'expiring' || st === 'frozen'; },
            recent: function (st, s) { return st === 'active' || st === 'expiring' || (st === 'expired' && s.end_at > t - 7 * DAY); }
        };
        var g = groups[b.group] || groups.paying, ok = 0;
        require('../db/database').prepare('SELECT user_id FROM veyro_subs').all().forEach(function (r) {
            var s = svc().subRow(r.user_id), st = svc().subState(s);
            if (g(st, s) && svc().addDays(r.user_id, n, b.why, A, true).success) ok++;
        });
        svc().log(A, 'تعويض ' + n + ' يوم لـ' + ok + ' ستريمر', b.why || '—');
        return { success: true, count: ok };
    },
    genCodes: function (b, A) { return svc().genCodes(b, A); },
    redeem: function (b, A) { var r = svc().redeem(b.code, uidOf(b), A); if (!r.success) r.message = svc().REDEEM_ERR[r.error] || r.error; return r; },
    codeToggle: function (b, A) { return svc().toggleCode(b.code, A); },
    codeDel: function (b, A) { return svc().deleteCode(b.code, A); },
    planSave: function (b, A) { var r = svc().savePlan(b.plan || {}); if (r.success) svc().log(A, r.isNew ? 'أضاف خطة' : 'عدّل خطة', r.plan.name); return r; },
    cfgSet: function (b, A) {
        var key = b.key, v = b.value, L = { previewAdminOnly: 1, requireSub: 1, trialDays: 1, announce: 1 };
        if (!L[key]) return { success: false, error: 'bad_key' };
        if (key === 'trialDays') v = Math.max(0, Math.min(60, Math.round(Number(v)) || 0));
        else if (key === 'announce') v = { on: Boolean(v && v.on), text: String((v && v.text) || '').slice(0, 300) };
        else v = Boolean(v);
        svc().setSetting(key, v);
        var T = { previewAdminOnly: v ? 'قفل فيرو للأدمن والتجربة' : 'فتح فيرو للكل', requireSub: v ? 'شغّل الاشتراك الإلزامي' : 'طفّى الاشتراك الإلزامي', trialDays: 'غيّر أيام التجربة', announce: 'عدّل الإعلان' };
        svc().log(A, T[key], key === 'trialDays' ? v + ' يوم' : '—');
        return { success: true };
    },
    adminAdd: function (b, A) {
        var uid = uidOf(b); if (!uid) return { success: false, error: 'bad_user' };
        if (!svc().ADMIN_ROLES[b.role]) return { success: false, error: 'bad_role' };
        var list = (svc().settings().admins || []).filter(function (x) { return Number(x.id) !== uid; });
        var u = require('../db/database').prepare('SELECT display_name, username, tiktok_display_name FROM users WHERE id = ?').get(uid) || {};
        list.push({ id: uid, name: u.display_name || u.tiktok_display_name || u.username || ('#' + uid), role: b.role });
        svc().setSetting('admins', list); svc().log(A, 'أضاف مشرف', svc().userTag(uid), uid);
        return { success: true };
    },
    adminDel: function (b, A) {
        var uid = Number(b.uid), list = svc().settings().admins || [];
        svc().setSetting('admins', list.filter(function (x) { return Number(x.id) !== uid; }));
        svc().log(A, 'أزال مشرف', '#' + uid, uid);
        return { success: true };
    },
    assetSave: function (b, A) { return svc().saveAsset(b.asset || {}, Boolean(b.publish), A); },
    assetDelete: function (b, A) { return svc().deleteAsset(b.id, A); }
};
var USER_OPS = { addDays: 1, setEnd: 1, renew: 1, setLifetime: 1, freeze: 1, unfreeze: 1, cancel: 1, setStatus: 1, setTester: 1, logoutAll: 1, setLimits: 1, setNotes: 1, wipe: 1, redeem: 1, adminAdd: 1 };

function handleOp(req, res, body, user) {
    var role = adminRole(user);
    if (!role) { sendJson(res, 403, { success: false, error: 'not_admin' }); return; }
    body = body || {};
    var op = String(body.op || '');
    if (!OPS[op]) { sendJson(res, 400, { success: false, error: 'bad_op' }); return; }
    if (!allowed(role, op, body)) { sendJson(res, 403, { success: false, error: 'no_permission' }); return; }
    if (USER_OPS[op] && !uidOf(body)) { sendJson(res, 404, { success: false, error: 'bad_user' }); return; }
    var r = OPS[op](body, adminOf(user));
    sendJson(res, r.success ? 200 : 400, r);
}

function handleAssetUpload(req, res, body, user) {
    var role = adminRole(user);
    if (!role || !allowed(role, 'assetSave', {})) { req.resume(); sendJson(res, 403, { success: false, error: 'not_admin' }); return; }
    return svc().uploadAssetFile(q(req, 'id'), req, Number(req.headers['content-length']) || 0, adminOf(user)).then(function (r) {
        if (!res.headersSent) sendJson(res, r.success ? 200 : (r.error === 'file_too_large' ? 413 : r.error === 'not_found' ? 404 : 400), r);
    });
}

/** GET /api/veyro/assets/file?id= — مع دعم Range (الفيديو بـOBS يقفز بالملف). */
function handleAssetFile(req, res) {
    var m = svc().findAssetFile(q(req, 'id'), true);
    if (!m) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
    var headers = { 'Content-Type': m.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
    var range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (range && (range[1] || range[2])) {
        var start = range[1] ? Number(range[1]) : Math.max(0, m.size - Number(range[2]));
        var end = range[1] && range[2] ? Math.min(Number(range[2]), m.size - 1) : m.size - 1;
        if (start >= m.size || start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + m.size }); res.end(); return; }
        headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + m.size;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(m.file, { start: start, end: end }).on('error', function () { res.destroy(); }).pipe(res);
        return;
    }
    headers['Content-Length'] = m.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(m.file).on('error', function () { res.destroy(); }).pipe(res);
}

/** ملخص فيرو للحساب — يرجع مع /api/auth/me ومع /api/veyro/me. */
function veyroInfo(user) {
    var s = svc(), cfg = s.settings(), a = s.account(Number(user.id)) || {};
    return {
        status: a.status || 'active', statusReason: a.status_reason || '',
        sub: s.subSummary(Number(user.id)), limits: s.limits(Number(user.id)),
        previewAdminOnly: Boolean(cfg.previewAdminOnly), requireSub: Boolean(cfg.requireSub),
        announce: cfg.announce && cfg.announce.on && cfg.announce.text ? cfg.announce.text : '',
        isAdmin: Boolean(adminRole(user))
    };
}
function handleMe(req, res, body, user) { sendJson(res, 200, { success: true, veyro: veyroInfo(user) }); }

var redeemTries = new Map();
function handleRedeem(req, res, body, user) {
    var uid = Number(user.id), t = Date.now(), r = redeemTries.get(uid) || { n: 0, at: t };
    if (t - r.at > 3600e3) r = { n: 0, at: t };
    if (r.n >= 10) { sendJson(res, 429, { success: false, error: 'too_many_tries', message: 'محاولات كثيرة — جرّب بعد ساعة' }); return; }
    var out = svc().redeem(body && body.code, uid, null);
    if (!out.success) { r.n++; redeemTries.set(uid, r); out.message = svc().REDEEM_ERR[out.error] || 'ما انطبق الكود'; }
    sendJson(res, out.success ? 200 : 400, out);
}
function handleLibrary(req, res, body, user) { sendJson(res, 200, { success: true, assets: svc().libraryFor(Number(user.id)) }); }

var ROUTES = [
    { method: 'GET', path: '/api/veyro/admin/snapshot', requireAuth: true, handler: handleSnapshot },
    { method: 'POST', path: '/api/veyro/admin/op', requireAuth: true, handler: handleOp },
    { method: 'POST', path: '/api/veyro/admin/assets/upload', requireAuth: true, rawBody: true, handler: handleAssetUpload },
    { method: 'GET', path: '/api/veyro/assets/file', requireAuth: false, handler: handleAssetFile },
    { method: 'GET', path: '/api/veyro/me', requireAuth: true, allowBlocked: true, handler: handleMe },
    { method: 'POST', path: '/api/veyro/me/redeem', requireAuth: true, handler: handleRedeem },
    { method: 'GET', path: '/api/veyro/library', requireAuth: true, handler: handleLibrary }
];

/**
 * قبل أي مسار محمي: حالة الحساب بفيرو، تسجيل الخروج من كل الأجهزة، وصلاحية التجربة من لوحة فيرو.
 * يرجع {status, error} لو الطلب لازم ينرفض، أو null. يعدّل user.permissions.veyro_tester لو الأدمن غيّرها.
 */
function guard(route, user, token) {
    var g;
    try { g = svc().gate(user, token); } catch (e) { return null; } // خلل بالقاعدة ما يوقف المحرر
    if (g.revoked) return { status: 401, error: 'session_revoked' };
    if (g.tester != null) user.permissions = Object.assign({}, user.permissions || {}, { veyro_tester: g.tester });
    if (g.blocked && !route.allowBlocked && !adminRole(user)) return { status: 403, error: 'veyro_' + g.blocked };
    return null;
}

/** صاحب الشاشة موقوف/محظور؟ (رابط الشاشة بـOBS يطفى) */
function ownerBlocked(uid) {
    try { var a = svc().account(Number(uid)); return Boolean(a && a.status !== 'active'); } catch (e) { return false; }
}

/** الاشتراك الإلزامي (لو مفعّل بالإعدادات): الأدمن والتجربة يعدّون، والباقي لازم اشتراك نشط. */
function subRequired(user) {
    try {
        if (!svc().settings().requireSub || adminRole(user) || (user.permissions && user.permissions.veyro_tester)) return false;
        return !svc().subSummary(Number(user.id)).active;
    } catch (e) { return false; }
}

module.exports = { ROUTES: ROUTES, guard: guard, veyroInfo: veyroInfo, ownerBlocked: ownerBlocked, subRequired: subRequired, adminRole: adminRole, tracker: function () { return tracker.get(); }, limits: function (uid) { try { return svc().limits(Number(uid)); } catch (e) { return {}; } } };
