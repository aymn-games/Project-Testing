/**
 * AGP ↔ VEYRO BRIDGE — الربط بين سيرفر الألعاب (هذا) وسيرفر فيرو المستقل (veyro-server/).
 * فيرو صار له سيرفر وقاعدة بيانات خاصة، فنشر أي واحد ما يوقف الثاني. هنا ثلاث أشياء بس:
 *
 * 1. GET /api/veyro/whoami — فيرو يتأكد من حساب المستخدم بتوكنه (مثل /api/auth/me
 *    ومعه الاسم والصورة لصورة إحصائيات البث). فيرو يحفظ النتيجة، فلو هالسيرفر
 *    يعيد التشغيل المحرر يكمل.
 * 2. GET /api/internal/veyro-export (+ /media?id=) — نقل بيانات فيرو القديمة لسيرفر فيرو
 *    (veyro-server/migrate/import-from-core.js). مقفل إلا بسر VEYRO_EXPORT_SECRET بالخدمتين.
 * 3. التحويل: لو VEYRO_API_URL موجود، طلبات فيرو القديمة (/api/screens*، /api/public/screen*،
 *    /api/streamlabs*) تتحوّل كما هي لسيرفر فيرو — روابط OBS القديمة والصفحات المخزّنة
 *    تكمل. ومراقب أدوات الصوت وStreamlabs هنا يوقفون (سيرفر فيرو هو اللي يشغّلهم).
 *
 * الخطوات بالترتيب: docs/VEYRO_SERVER.md
 */

'use strict';

var http = require('http');
var https = require('https');
var crypto = require('crypto');
var fs = require('fs');
var config = require('../config');
var logger = require('../utils/logger');
var sendJson = require('./response').sendJson;

var PROXY_PREFIXES = ['/api/screens', '/api/public/screen', '/api/streamlabs'];

function db() { return require('../db/database'); }

/** وضع التحويل شغّال (VEYRO_API_URL موجود). */
function proxyMode() { return Boolean(config.veyroApiUrl); }

/** GET /api/veyro/whoami → { success, user } — نفس /api/auth/me + display_name وavatar_image_base64. */
function handleWhoami(req, res, body, user) {
    var out = Object.assign({}, user);
    try {
        var row = db().prepare('SELECT display_name, avatar_image_base64 FROM users WHERE id = ?').get(user.id) || {};
        out.display_name = row.display_name || null;
        out.avatar_image_base64 = row.avatar_image_base64 || null;
    } catch (err) { logger.error('Veyro whoami: profile lookup failed:', err); }
    sendJson(res, 200, { success: true, user: out });
}

function secretOk(req) {
    var want = config.veyroExportSecret;
    var got = String(req.headers['x-veyro-secret'] || '');
    if (!want || !got) return false;
    var a = Buffer.from(want), b = Buffer.from(got);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function all(sql) { try { return db().prepare(sql).all(); } catch (e) { return []; } }

/** كل بيانات فيرو بقاعدة سيرفر الألعاب + بيانات أصحابها. */
function exportData() {
    // الجداول تنشئها خدماتها أول ما تنطلب — نتأكد إنها موجودة
    try { require('../stats/stream-screens-service').list(0); } catch (e) { /* ignore */ }
    try { require('../stats/screen-media-service').list(0); } catch (e) { /* ignore */ }
    try { require('../streamlabs/donations-store').get(); } catch (e) { /* ignore */ }
    var screens = all('SELECT * FROM stream_screens');
    var media = all('SELECT * FROM screen_media');
    var keys = all('SELECT * FROM screen_audio_keys');
    var links = all('SELECT * FROM streamlabs_links');
    var donations = all('SELECT user_id, sl_id, name, amount_cents, currency, message, is_test, received_at FROM donations');
    var watchRows = all("SELECT id, permissions FROM users WHERE permissions LIKE '%stream_stats_watch%'");
    var statsWatch = watchRows.filter(function (r) {
        try { return Boolean(JSON.parse(r.permissions || '{}').stream_stats_watch); } catch (e) { return false; }
    }).map(function (r) { return r.id; });

    var ids = {};
    [screens, media, keys, links, donations].forEach(function (rows) { rows.forEach(function (r) { ids[r.user_id] = true; }); });
    statsWatch.forEach(function (id) { ids[id] = true; });
    var getUser = db().prepare('SELECT id, username, display_name, role, is_streamer, permissions, tiktok_username, tiktok_verified, tiktok_display_name, tiktok_avatar_url, avatar_image_base64 FROM users WHERE id = ?');
    var users = Object.keys(ids).map(function (id) {
        var u = getUser.get(Number(id));
        if (!u) return null;
        try { u.permissions = JSON.parse(u.permissions || '{}'); } catch (e) { u.permissions = {}; }
        return u;
    }).filter(Boolean);

    return { success: true, exportedAt: Date.now(), users: users, stream_screens: screens, screen_media: media, screen_audio_keys: keys, streamlabs_links: links, donations: donations, stats_watch: statsWatch };
}

function handleExport(req, res) {
    if (!secretOk(req)) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
    var pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/internal/veyro-export') {
        sendJson(res, 200, exportData());
        return;
    }
    // /api/internal/veyro-export/media?id=<32 hex>
    var id = (/[?&]id=([a-f0-9]{32})(?:&|$)/.exec(req.url || '') || [])[1];
    var m = id ? require('../stats/screen-media-service').find(id) : null;
    if (!m) { sendJson(res, 404, { success: false, error: 'not_found' }); return; }
    res.writeHead(200, { 'Content-Type': m.mime, 'Content-Length': m.size });
    fs.createReadStream(m.file).on('error', function () { res.destroy(); }).pipe(res);
}

/** يحوّل الطلب كما هو (الطريقة، الترويسات، الجسم) لسيرفر فيرو، ويرجّع رده كما هو. */
function forward(req, res) {
    var target = new URL(req.url, config.veyroApiUrl);
    var lib = target.protocol === 'https:' ? https : http;
    var headers = Object.assign({}, req.headers);
    headers.host = target.host;
    var p = lib.request({ method: req.method, hostname: target.hostname, port: target.port || undefined, path: target.pathname + target.search, headers: headers }, function (r) {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
    });
    p.on('error', function (err) {
        logger.error('Veyro proxy: ' + req.method + ' ' + target.pathname + ' failed: ' + err.message);
        if (!res.headersSent) sendJson(res, 502, { success: false, error: 'veyro_unavailable' });
        else res.destroy();
    });
    req.pipe(p);
}

/**
 * من server.js قبل الراوتر: يرجّع true لو تعامل مع الطلب.
 */
function handle(req, res) {
    var pathname = (req.url || '').split('?')[0];
    if (pathname.indexOf('/api/internal/veyro-export') === 0) { handleExport(req, res); return true; }
    if (proxyMode() && PROXY_PREFIXES.some(function (p) { return pathname === p || pathname.indexOf(p + '/') === 0; })) {
        forward(req, res);
        return true;
    }
    return false;
}

module.exports = { handle: handle, handleWhoami: handleWhoami, proxyMode: proxyMode, exportData: exportData, PROXY_PREFIXES: PROXY_PREFIXES };
