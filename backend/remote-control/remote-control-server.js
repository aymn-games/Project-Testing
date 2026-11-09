/**
 * «التحكم عن بعد» — خادم WebSocket على '/ws/remote'.
 *
 * يوصل جوال المتحكم (control.html) بصفحة اللعبة المفتوحة عند الستريمر
 * (js/agp-remote-control.js). الخادم ما يعرف شي عن الألعاب: صفحة الستريمر
 * ترسل وصف الشاشة الحالية (state) ويوصل للجوالات كما هو، والجوال يرسل
 * أوامر (نفس أوامر الشات) أو «افتح لعبة» وتوصل لصفحة الستريمر وتنفّذها هي.
 *
 * الصلاحية تنفحص بالخادم بكل أمر (remote-control-service.canControl)، وأي
 * تغيير من الستريمر (إيقاف عام أو لشخص) يقفل جوال اللي انشالت صلاحيته فوراً.
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   صفحة الستريمر → host {auth}            ← hosted {controllers:[يوزرات فعّالة]}
 *                                          (وبعدها controllers {list} مع أي تغيير)
 *   صفحة الستريمر → state {s}              ← state {s} لكل جوالات هالستريمر
 *   صفحة الستريمر → res {c, id, ok, msg}   ← res {id, ok, msg} لجوال c بس
 *   الجوال → ctl {auth, s: رقم الستريمر}    ← welcome {streamer, me, online, state}
 *                                          أو err {err: login|no_access} وينقفل
 *   الجوال → cmd {id, cmd, arg}            ← تنرسل للصفحة: cmd {c, id, from, cmd, arg}
 *   الجوال → open {id, game}               ← تنرسل للصفحة: open {c, id, from, game}
 *   خادم → online {on} للجوالات لما صفحة الستريمر تنفتح/تنقفل
 *   خادم → err {err: revoked} للجوال لما تنشال صلاحيته، وينقفل
 *   أي طرف → ping ← pong
 *
 * صفحة الستريمر تنتقل بين الشاشات (إعدادات ← لوبي ← لعب) فاتصالها ينقطع
 * لحظات؛ الأمر اللي يوصل وقتها ينتظر PENDING_MS ويتنفذ أول ما ترجع.
 */
'use strict';

var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');

var MAX_MSG = 64 * 1024;          // وصف الشاشة ممكن يكون كبير شوي
var MAX_BACKLOG = 512 * 1024;
var IDLE_MS = 60 * 1000;          // الطرفين يرسلون ping كل 20ث
var PENDING_MS = 8000;
var MSG_RATE = 15, MSG_BURST = 40;

var _service = null;
var _auth = null;
function service() { return _service || require('./remote-control-service'); }
function auth() { return _auth || require('../auth/auth-service'); }

var _conns = {};                  // id -> conn
var _seq = 0;
var _pending = {};                // streamerId -> [{msg, at}]
var _lastState = {};              // streamerId -> s
var _primary = {};                // streamerId -> conn id (آخر صفحة أرسلت state)
var _hooked = false;

function isStreamerUser(u) {
    var p = u.permissions || {};
    return u.role === 'admin' || Boolean(u.is_streamer) || Boolean(p.can_run_games) || Boolean(p.full_game_access);
}

function send(conn, obj) {
    if (!conn || conn.closed) return;
    try {
        if (conn.socket.writableLength > MAX_BACKLOG) { drop(conn); return; }
        conn.socket.write(frame.encodeTextFrame(JSON.stringify(obj)));
    } catch (e) { drop(conn); }
}

function drop(conn) {
    if (!conn || conn.closed) return;
    conn.closed = true;
    try { conn.socket.end(frame.encodeControlFrame(frame.OPCODES.CLOSE)); } catch (e) {}
    try { conn.socket.destroy(); } catch (e) {}
    cleanup(conn);
}

function hostsOf(streamerId) {
    return Object.keys(_conns).map(function (k) { return _conns[k]; })
        .filter(function (c) { return c.role === 'host' && c.streamerId === streamerId && !c.closed; });
}
function ctlsOf(streamerId) {
    return Object.keys(_conns).map(function (k) { return _conns[k]; })
        .filter(function (c) { return c.role === 'ctl' && c.streamerId === streamerId && !c.closed; });
}
/** الصفحة اللي تنفّذ الأوامر: آخر وحدة أرسلت state، وإلا آخر وحدة اتصلت. */
function primaryHost(streamerId) {
    var hs = hostsOf(streamerId);
    if (!hs.length) return null;
    var p = _conns[_primary[streamerId]];
    if (p && hs.indexOf(p) >= 0) return p;
    return hs[hs.length - 1];
}

function cleanup(conn) {
    if (!_conns[conn.id]) return;
    delete _conns[conn.id];
    if (conn.role === 'host' && !hostsOf(conn.streamerId).length) {
        ctlsOf(conn.streamerId).forEach(function (c) { send(c, { t: 'online', on: false }); });
    }
}

function flushPending(streamerId) {
    var list = _pending[streamerId];
    if (!list || !list.length) return;
    delete _pending[streamerId];
    var h = primaryHost(streamerId);
    list.forEach(function (p) {
        if (Date.now() - p.at > PENDING_MS) return;
        if (h) send(h, p.msg);
    });
}

function expirePending() {
    var t = Date.now();
    Object.keys(_pending).forEach(function (sid) {
        _pending[sid] = _pending[sid].filter(function (p) {
            if (t - p.at <= PENDING_MS) return true;
            var c = _conns[p.msg.c];
            if (c) send(c, { t: 'res', id: p.msg.id, ok: false, msg: 'شاشة اللعبة عند الستريمر مو مفتوحة الحين' });
            return false;
        });
        if (!_pending[sid].length) delete _pending[sid];
    });
}

/** يوصل أمر الجوال لصفحة الستريمر (أو ينتظرها لو تنتقل بين الشاشات). */
function forward(conn, msg) {
    var h = primaryHost(conn.streamerId);
    if (h) { send(h, msg); return; }
    (_pending[conn.streamerId] = _pending[conn.streamerId] || []).push({ msg: msg, at: Date.now() });
    if (_pending[conn.streamerId].length > 10) _pending[conn.streamerId].shift();
}

function onServiceChange(streamerId) {
    var list = service().activeUsernames(streamerId);
    hostsOf(streamerId).forEach(function (h) { send(h, { t: 'controllers', list: list }); });
    ctlsOf(streamerId).forEach(function (c) {
        if (!service().canControl(c.user, streamerId)) { send(c, { t: 'err', err: 'revoked' }); drop(c); }
    });
}

function hookService() {
    if (_hooked) return;
    _hooked = true;
    service().onChange(onServiceChange);
}

function cleanStr(v, max) {
    return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '';
}

function handleMessage(conn, msg) {
    var t = msg.t;
    if (t === 'ping') { send(conn, { t: 'pong' }); return; }

    if (!conn.role) {
        if (t !== 'host' && t !== 'ctl') return;
        var user = null;
        try { user = msg.auth ? auth().validateSession(String(msg.auth)) : null; } catch (e) { user = null; }
        if (!user) { send(conn, { t: 'err', err: 'login' }); drop(conn); return; }
        hookService();
        if (t === 'host') {
            if (!isStreamerUser(user)) { send(conn, { t: 'err', err: 'not_streamer' }); drop(conn); return; }
            var wasOnline = hostsOf(user.id).length > 0;
            conn.role = 'host'; conn.streamerId = user.id; conn.user = user;
            send(conn, { t: 'hosted', controllers: service().activeUsernames(user.id) });
            if (!wasOnline) ctlsOf(user.id).forEach(function (c) { send(c, { t: 'online', on: true }); });
            flushPending(user.id);
            return;
        }
        var sid = parseInt(msg.s, 10);
        if (!sid || !service().canControl(user, sid)) { send(conn, { t: 'err', err: 'no_access' }); drop(conn); return; }
        conn.role = 'ctl'; conn.streamerId = sid; conn.user = user;
        conn.username = String(user.tiktok_username || '').replace(/^@+/, '').toLowerCase();
        send(conn, {
            t: 'welcome',
            streamer: service().streamerInfo(sid),
            me: { username: conn.username, name: user.tiktok_display_name || user.username || conn.username },
            online: hostsOf(sid).length > 0,
            state: _lastState[sid] || null
        });
        return;
    }

    if (conn.role === 'host') {
        if (t === 'state' && msg.s && typeof msg.s === 'object') {
            _lastState[conn.streamerId] = msg.s;
            _primary[conn.streamerId] = conn.id;
            ctlsOf(conn.streamerId).forEach(function (c) { send(c, { t: 'state', s: msg.s }); });
            return;
        }
        if (t === 'res') {
            var target = _conns[msg.c];
            if (target && target.role === 'ctl' && target.streamerId === conn.streamerId) {
                send(target, { t: 'res', id: msg.id, ok: msg.ok !== false, msg: cleanStr(msg.msg, 300) });
            }
        }
        return;
    }

    // الجوال: كل أمر يعيد فحص الصلاحية من القاعدة
    if (t !== 'cmd' && t !== 'open') return;
    if (!service().canControl(conn.user, conn.streamerId)) { send(conn, { t: 'err', err: 'revoked' }); drop(conn); return; }
    var id = typeof msg.id === 'number' || typeof msg.id === 'string' ? msg.id : null;
    if (t === 'cmd') {
        var cmd = cleanStr(msg.cmd, 40).trim();
        if (!cmd) return;
        forward(conn, { t: 'cmd', c: conn.id, id: id, from: conn.username, cmd: cmd, arg: cleanStr(msg.arg, 200) });
    } else {
        var game = cleanStr(msg.game, 40).trim();
        if (!/^[a-z0-9-]+$/.test(game)) return;
        forward(conn, { t: 'open', c: conn.id, id: id, from: conn.username, game: game });
    }
}

function attach(socket) {
    var conn = { id: 'rc' + (++_seq).toString(36), socket: socket, role: null, buf: Buffer.alloc(0), seen: Date.now(), tokens: MSG_BURST, last: Date.now(), closed: false };
    _conns[conn.id] = conn;
    socket.on('data', function (chunk) {
        try {
            conn.seen = Date.now();
            conn.buf = Buffer.concat([conn.buf, chunk]);
            if (conn.buf.length > MAX_MSG * 2) { drop(conn); return; }
            var r;
            while ((r = frame.tryDecodeFrame(conn.buf)) !== null) {
                conn.buf = conn.buf.slice(r.bytesConsumed);
                if (r.opcode === frame.OPCODES.CLOSE) { drop(conn); return; }
                if (r.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
                if (r.opcode !== frame.OPCODES.TEXT) continue;
                if (r.payload.length > MAX_MSG) continue;
                var t = Date.now();
                conn.tokens = Math.min(MSG_BURST, conn.tokens + (t - conn.last) / 1000 * MSG_RATE);
                conn.last = t;
                if (conn.tokens < 1) continue;
                conn.tokens -= 1;
                var msg;
                try { msg = JSON.parse(r.payload.toString('utf8')); } catch (e) { continue; }
                if (msg && typeof msg === 'object') handleMessage(conn, msg);
                if (conn.closed) return;
            }
        } catch (err) {
            logger.error('Remote control: message failed:', err);
        }
    });
    // سوكت الترقية من سيرفر http يبقى نص مفتوح (allowHalfOpen) لما الطرف الثاني يقفل
    socket.on('end', function () { drop(conn); });
    socket.on('close', function () { conn.closed = true; cleanup(conn); });
    socket.on('error', function () { conn.closed = true; cleanup(conn); });
}

function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Accept: ' + handshake.computeAcceptKey(key),
        '', ''
    ].join('\r\n'));
    attach(socket);
}

var _timer = setInterval(function () {
    try {
        var t = Date.now();
        Object.keys(_conns).forEach(function (k) { var c = _conns[k]; if (c && t - c.seen > IDLE_MS) drop(c); });
        expirePending();
        // وصف شاشة ستريمر ما عنده أي صفحة مفتوحة ولا جوال → ينشال من الذاكرة
        Object.keys(_lastState).forEach(function (sid) {
            sid = +sid;
            if (!hostsOf(sid).length && !ctlsOf(sid).length) { delete _lastState[sid]; delete _primary[sid]; }
        });
    } catch (e) { logger.error('Remote control: sweep failed:', e); }
}, 5000);
if (_timer.unref) _timer.unref();

module.exports = {
    handleUpgrade: handleUpgrade,
    _setDeps: function (svc, au) { _service = svc; _auth = au; _hooked = false; },
    _setTimings: function (o) { if (o.pendingMs) PENDING_MS = o.pendingMs; }
};
