#!/usr/bin/env node
/*
 * server.js — خادم «أداة الهدف»: يستضيف ملفات الويدجت + يستقبل الويب هوك/API
 * ويدفع التحديث فوراً لكل ويدجت مفتوح (OBS) عبر Server-Sent Events.
 * Node.js فقط، بدون أي حزم (npm install مو مطلوب).
 *
 * التشغيل:   GOAL_SECRET=كلمة-سر-طويلة node server.js
 * المتغيرات:
 *   PORT         المنفذ (الافتراضي 3030)
 *   HOST         عنوان الاستماع (الافتراضي 0.0.0.0)
 *   GOAL_SECRET  كلمة السر لطلبات التعديل. بدونها التعديل مسموح من نفس الجهاز بس.
 *   GOAL_DATA    مكان ملف حفظ الأرقام (الافتراضي ./data/goals.json)
 *
 * المسارات (:key اسم الهدف، مثلاً default أو followers):
 *   GET  /api/goal/:key            الحالة الحالية JSON
 *   GET  /api/goal/:key/stream     بث SSE (الويدجت يتصل عليه)
 *   POST /api/goal/:key            تعديل/حدث (JSON أو form) — التفاصيل بـ README.md
 *   GET  /api/goal/:key/add?amount=5&secret=...   إضافة سريعة (لأوامر الشات وStreamer.bot)
 *   GET  /api/goal/:key/set?value=120&secret=...  تعيين القيمة
 *   GET  /api/goal/:key/reset?secret=...          تصفير
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var Core = require('./goal-core.js');

var PORT = Number(process.env.PORT) || 3030;
var HOST = process.env.HOST || '0.0.0.0';
var SECRET = process.env.GOAL_SECRET || '';
var DATA_FILE = process.env.GOAL_DATA || path.join(__dirname, 'data', 'goals.json');
var ROOT = __dirname;

var MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8' };
// الملفات المسموح عرضها للمتصفح بس (ما نعرض server.js ولا ملف البيانات).
var PUBLIC = { 'index.html': 1, 'goal.css': 1, 'goal.js': 1, 'goal-core.js': 1, 'README.md': 1 };

/* ===== التخزين ===== */
var goals = {};
try { goals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {}; } catch (e) { goals = {}; }

var saveTimer = null;
function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
        try {
            fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
            var tmp = DATA_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(goals, null, 2));
            fs.renameSync(tmp, DATA_FILE);
        } catch (e) { console.error('[goal] تعذّر الحفظ:', e.message); }
    }, 200);
}

function getGoal(key) {
    if (!goals[key]) { goals[key] = { current: 0, goal: null, title: null, type: null, lastName: '' }; }
    return goals[key];
}

/* ===== SSE ===== */
var clients = {};   // key → [res, ...]
function broadcast(key) {
    var data = 'data: ' + JSON.stringify(publicState(key)) + '\n\n';
    (clients[key] || []).forEach(function (res) { res.write(data); });
}
function publicState(key) {
    var g = getGoal(key);
    return { key: key, current: g.current, goal: g.goal, title: g.title, type: g.type, lastName: g.lastName };
}
setInterval(function () {   // نبضة تمنع البروكسيات من قطع الاتصال
    Object.keys(clients).forEach(function (k) { clients[k].forEach(function (res) { res.write(': ping\n\n'); }); });
}, 25000);

/* ===== تطبيق التعديلات ===== */
function round2(n) { return Math.round(n * 100) / 100; }

/*
 * body أحد الأشكال:
 *   { action: 'add', amount: 5, name: 'سارة' }
 *   { action: 'set', value: 120 }
 *   { action: 'reset' }
 *   { action: 'config', goal: 1000, title: 'هدف المتابعين', type: 'follower' }
 *   { provider: 'streamelements'|'streamlabs', event: {...} }   حدث بصيغة المزوّد
 *   { type: 'tip', amount: 10, name: 'خالد' }                     حدث مخصّص
 */
function apply(key, body) {
    var g = getGoal(key);
    var action = String(body.action || '').toLowerCase();
    var added = 0;
    if (action === 'add') {
        added = Core.num(body.amount == null ? 1 : body.amount);
        if (body.name) { g.lastName = String(body.name).slice(0, 60); }
    } else if (action === 'set') {
        g.current = round2(Core.num(body.value));
    } else if (action === 'reset') {
        g.current = 0; g.lastName = '';
    } else if (action === 'config') {
        if (body.goal != null) { g.goal = Core.num(body.goal) || null; }
        if (body.title != null) { g.title = String(body.title).slice(0, 80) || null; }
        if (body.type != null) { g.type = Core.TYPES[body.type] ? body.type : null; }
        if (body.value != null) { g.current = round2(Core.num(body.value)); }
    } else {
        var provider = body.provider || 'custom';
        var raw = body.event || body;
        Core.normalize(provider, raw, false).forEach(function (ev) {
            var add = Core.contribution(g.type, ev);
            if (add > 0) { added += add; if (ev.name) { g.lastName = String(ev.name).slice(0, 60); } }
        });
    }
    if (added > 0) { g.current = round2(g.current + added); }
    persist();
    broadcast(key);
    return { ok: true, added: added, state: publicState(key) };
}

/* ===== أدوات HTTP ===== */
function send(res, code, obj, headers) {
    var body = typeof obj === 'string' ? obj : JSON.stringify(obj);
    res.writeHead(code, Object.assign({ 'Content-Type': typeof obj === 'string'
        ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' }, cors(), headers || {}));
    res.end(body);
}
function cors() {
    return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Goal-Secret, Authorization' };
}
function isLocal(req) {
    var a = req.socket.remoteAddress || '';
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
function safeEqual(a, b) {
    var x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function authorized(req, url) {
    if (!SECRET) { return isLocal(req); }
    var given = req.headers['x-goal-secret'] || url.searchParams.get('secret') || '';
    var auth = req.headers.authorization || '';
    if (!given && /^Bearer /i.test(auth)) { given = auth.slice(7); }
    return safeEqual(given, SECRET);
}
function readBody(req, cb) {
    var chunks = [], size = 0;
    req.on('data', function (c) {
        size += c.length;
        if (size > 64 * 1024) { req.destroy(); return; }
        chunks.push(c);
    });
    req.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8');
        var type = req.headers['content-type'] || '';
        try {
            if (/json/i.test(type) || /^\s*[{[]/.test(text)) { return cb(null, JSON.parse(text || '{}')); }
            var form = {};
            new URLSearchParams(text).forEach(function (v, k) { form[k] = v; });
            cb(null, form);
        } catch (e) { cb(e); }
    });
}

function serveStatic(res, pathname) {
    var name = pathname.replace(/^\/+/, '') || 'index.html';
    if (!PUBLIC[name]) { return send(res, 404, 'Not found'); }
    fs.readFile(path.join(ROOT, name), function (err, buf) {
        if (err) { return send(res, 404, 'Not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream',
            'Cache-Control': 'no-cache' });
        res.end(buf);
    });
}

/* ===== الراوتر ===== */
var server = http.createServer(function (req, res) {
    var url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }

    var m = url.pathname.match(/^\/api\/goal\/([A-Za-z0-9_-]{1,40})(?:\/(stream|add|set|reset))?\/?$/);
    if (!m) {
        if (req.method === 'GET') { return serveStatic(res, url.pathname); }
        return send(res, 404, { ok: false, error: 'not_found' });
    }
    var key = m[1], sub = m[2] || '';

    if (req.method === 'GET' && sub === 'stream') {
        res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }, cors()));
        res.write('retry: 3000\n');
        res.write('data: ' + JSON.stringify(publicState(key)) + '\n\n');
        (clients[key] = clients[key] || []).push(res);
        req.on('close', function () {
            clients[key] = (clients[key] || []).filter(function (r) { return r !== res; });
        });
        return;
    }
    if (req.method === 'GET' && !sub) { return send(res, 200, publicState(key)); }

    // من هنا كل شي تعديل: يحتاج صلاحية.
    if (!authorized(req, url)) { return send(res, 401, { ok: false, error: 'unauthorized' }); }

    if (req.method === 'GET' && sub) {
        var p = {}; url.searchParams.forEach(function (v, k) { p[k] = v; });
        p.action = sub;
        var r = apply(key, p);
        // ردّ نصي قصير يصلح يطلع بالشات لو استُدعي من أمر بوت.
        return url.searchParams.get('format') === 'json' ? send(res, 200, r)
            : send(res, 200, (r.state.title || 'الهدف') + ': ' + r.state.current + (r.state.goal ? ' / ' + r.state.goal : ''));
    }
    if (req.method === 'POST' && !sub) {
        return readBody(req, function (err, body) {
            if (err) { return send(res, 400, { ok: false, error: 'bad_body' }); }
            send(res, 200, apply(key, body || {}));
        });
    }
    send(res, 405, { ok: false, error: 'method_not_allowed' });
});

if (require.main === module) {
    server.listen(PORT, HOST, function () {
        console.log('[goal] الويدجت شغّال: http://localhost:' + PORT + '/?provider=server');
        if (!SECRET) { console.log('[goal] تنبيه: GOAL_SECRET غير محدد — التعديل مسموح من نفس الجهاز فقط.'); }
    });
}

module.exports = { server: server, apply: apply };
