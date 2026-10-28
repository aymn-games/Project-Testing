/**
 * «حفلة عيد الميلاد» — خادم WebSocket على '/ws/party'.
 *
 * يوصّل منطق الغرف (party-rooms.js) بالجوالات وشاشة المذيع، بنفس أسلوب
 * «محطة سهيل» (station-server.js). الحفلات طافية افتراضياً (config.partyEnabled
 * ← متغير البيئة PARTY_ENABLED=1)، وكل رسالة وكل دورة تحديث محمية بـ try/catch:
 * أي خطأ هنا يتسجل وما يطيّح باقي سيرفر الموقع.
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   عميل → host {girlName} | host {code, token}   ← hosted {code, token, girlKey}
 *   عميل → join {code, name, auth?, girlKey?}     ← welcome {id, key, n, role, kind} ثم all {d}
 *   عميل → resume {code, id, key}                 ← نفس رد join
 *   عميل → peek {code}                            ← room + all (شاشة عرض بدون شخصية)
 *   عميل → mv {p:[x, z, ry, a]} · ping {k}        ← pong {k, now}
 *   خادم → room {room} عند تغيّر القائمة · s {now, d} دلتا الحركة كل 125ms
 *          (d = [[n, x, z, ry, a], ...] للي تحركوا فقط) · err {err, of} · closed
 */
'use strict';

var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');
var config = require('../config');
var createRoomManager = require('./party-rooms').createRoomManager;

var SEND_MS = 125;                       // 8 تحديثات حركة بالثانية
var EMPTY_ROOM_MS = 30 * 60 * 1000;      // غرفة بدون أي اتصال أكثر من كذا ← تنقفل
var MAX_MSG = 4 * 1024;

var _enabled = !!config.partyEnabled;
// التحقق من الجلسة يتحمّل وقت الحاجة فقط (يفتح قاعدة البيانات)
var _mgr = createRoomManager({
    validateSession: function (token) { try { return require('../auth/auth-service').validateSession(token); } catch (err) { logger.error('Party: session check failed:', err); return null; } }
});
var _clients = {};   // connectionId -> { socket, code, role: 'host'|'player'|'viewer', id, closed }
var _emptySince = {}; // code -> وقت آخر مرة صارت الغرفة بدون اتصالات

function send(client, obj) {
    if (!client || client.closed) return;
    try { client.socket.write(frame.encodeTextFrame(JSON.stringify(obj))); } catch (err) { logger.error('Party: write failed:', err); }
}
function sendRaw(client, encoded) {
    if (!client || client.closed) return;
    try { client.socket.write(encoded); } catch (err) { logger.error('Party: write failed:', err); }
}
function roomClients(code) { return Object.keys(_clients).map(function (k) { return _clients[k]; }).filter(function (c) { return c.code === code && !c.closed; }); }

function broadcastRoster(code) {
    var r = _mgr.roster(code); if (!r.ok) return;
    var encoded = frame.encodeTextFrame(JSON.stringify({ t: 'room', room: { code: r.code, girlName: r.girlName, players: r.players } }));
    roomClients(code).forEach(function (c) { sendRaw(c, encoded); });
}
function sendAll(client) { var d = _mgr.fullState(client.code); if (Array.isArray(d)) send(client, { t: 'all', now: Date.now(), d: d }); }

function attach(client, code, role, id) {
    client.code = code; client.role = role; client.id = id || null;
    delete _emptySince[code];
}

function onWelcome(client, code, res) {
    attach(client, code, 'player', res.id);
    send(client, { t: 'welcome', id: res.id, key: res.key, n: res.n, role: res.role, kind: res.kind });
    broadcastRoster(code);
    sendAll(client);
}

function onMessage(client, msg) {
    var t = msg && msg.t;
    if (t === 'ping') return send(client, { t: 'pong', k: msg.k, now: Date.now() });
    if (typeof t !== 'string') return;
    if (!_enabled) return send(client, { t: 'err', err: 'disabled', of: t });
    var code = typeof msg.code === 'string' ? msg.code : null, res;

    if (t === 'host') {
        if (code) {
            res = _mgr.hostResume(code, String(msg.token || ''));
            if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
            var room = _mgr.getRoom(code);
            attach(client, code, 'host');
            send(client, { t: 'hosted', code: code, token: room.token, girlKey: room.girlKey });
        } else {
            res = _mgr.createRoom({ girlName: msg.girlName });
            if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
            attach(client, res.code, 'host');
            logger.log('Party: room ' + res.code + ' created');
            send(client, { t: 'hosted', code: res.code, token: res.token, girlKey: res.girlKey });
        }
        broadcastRoster(client.code); sendAll(client);
        return;
    }
    if (t === 'peek') {
        if (!code || !_mgr.getRoom(code)) return send(client, { t: 'err', err: 'nocode', of: t });
        attach(client, code, 'viewer');
        var r = _mgr.roster(code);
        send(client, { t: 'room', room: { code: r.code, girlName: r.girlName, players: r.players } });
        sendAll(client);
        return;
    }
    if (t === 'join') {
        if (!code) return send(client, { t: 'err', err: 'nocode', of: t });
        res = _mgr.join(code, { name: msg.name, auth: msg.auth || null, girlKey: msg.girlKey == null ? null : String(msg.girlKey) });
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        logger.log('Party: ' + res.role + ' joined room ' + code + ' (' + res.kind + ')');
        return onWelcome(client, code, res);
    }
    if (t === 'resume') {
        if (!code || typeof msg.id !== 'string' || typeof msg.key !== 'string') return send(client, { t: 'err', err: 'resume', of: t });
        res = _mgr.resume(code, msg.id, msg.key);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        // نفس اللاعب من اتصال أقدم (تبويب ثاني/اتصال معلّق) يتفصل عنه
        Object.keys(_clients).forEach(function (k) { var c = _clients[k]; if (c !== client && c.code === code && c.id === msg.id) { c.id = null; c.role = 'viewer'; send(c, { t: 'err', err: 'elsewhere', of: t }); } });
        return onWelcome(client, code, res);
    }
    if (t === 'mv') {
        if (client.role !== 'player' || !client.code) return;
        _mgr.move(client.code, client.id, msg.p);
        return;
    }
}

function tickAll() {
    var now = Date.now();
    _mgr.rooms().forEach(function (code) {
        try {
            var cs = roomClients(code);
            if (!cs.length) {
                if (!_emptySince[code]) _emptySince[code] = now;
                else if (now - _emptySince[code] > EMPTY_ROOM_MS) { _mgr.closeRoom(code); delete _emptySince[code]; logger.log('Party: room ' + code + ' closed (empty)'); }
                return;
            }
            var d = _mgr.takeDelta(code);
            if (!Array.isArray(d) || !d.length) return;
            // الدلتا تتحول JSON مرة وحدة وتنرسل للكل
            var encoded = frame.encodeTextFrame(JSON.stringify({ t: 's', now: now, d: d }));
            cs.forEach(function (c) { sendRaw(c, encoded); });
        } catch (err) { logger.error('Party: tick error:', err); }
    });
}
var _ticker = null;
function ensureTicker() { if (!_ticker) { _ticker = setInterval(tickAll, SEND_MS); if (_ticker.unref) _ticker.unref(); } }

function removeClient(id) {
    var c = _clients[id]; if (!c) return;
    c.closed = true; delete _clients[id];
    try {
        if (c.code && c.id && c.role === 'player') { _mgr.leave(c.code, c.id); broadcastRoster(c.code); }
    } catch (err) { logger.error('Party: leave error:', err); }
}

function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + handshake.computeAcceptKey(key), '', ''].join('\r\n'));
    try { socket.setNoDelay(true); } catch (e) { }
    ensureTicker();

    var id = 'pt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    var client = _clients[id] = { socket: socket, code: null, role: null, id: null, closed: false };
    var buffer = Buffer.alloc(0);

    socket.on('data', function (chunk) {
        try {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length > MAX_MSG * 8) { socket.destroy(); removeClient(id); return; }
            var result;
            while ((result = frame.tryDecodeFrame(buffer)) !== null) {
                buffer = buffer.slice(result.bytesConsumed);
                if (result.opcode === frame.OPCODES.CLOSE) { socket.end(); removeClient(id); return; }
                if (result.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
                if (result.opcode !== frame.OPCODES.TEXT || result.payload.length > MAX_MSG) continue;
                var msg; try { msg = JSON.parse(result.payload.toString('utf8')); } catch (err) { continue; }
                try { onMessage(client, msg); } catch (err) { logger.error('Party: message error:', err); }
            }
        } catch (err) { logger.error('Party: data error:', err); try { socket.destroy(); } catch (e) { } removeClient(id); }
    });
    socket.on('close', function () { removeClient(id); });
    socket.on('error', function () { removeClient(id); });
}

module.exports = {
    handleUpgrade: handleUpgrade,
    _mgr: _mgr,
    _setEnabled: function (v) { _enabled = !!v; }
};
