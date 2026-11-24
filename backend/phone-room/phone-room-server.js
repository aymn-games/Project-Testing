/**
 * «غرفة الجوالات» — خادم WebSocket للاعبين على '/ws/phone-room'.
 *
 * جوال اللاعب (phone/index.html) يدخل الغرفة برقمها واسمه (بدون حساب)،
 * وبعدها يرسل تعليقات/هدايا/لايكات/متابعة توصل لصفحة اللعبة عند صاحب الغرفة
 * عبر phone-room-service.js (بشكل أحداث بث تيك توك).
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   الجوال → join {code, dev, name}  ← joined {me:{id,name}, room:{code,host,live}}
 *                                     أو err {err: no_room|bad_name|bad_device|full}
 *   الجوال → chat {text} | like {n} | gift {g:{id,name,coins}, n} | follow
 *                                     ← ack {k, live}  (live=false: ما فيه لعبة مفتوحة الحين)
 *   خادم → live {on}     لما صاحب الغرفة يفتح/يقفل صفحة لعبة
 *   خادم → bye {reason}  الغرفة انقفلت (closed|expired) أو اللاعب انطرد (kicked)، وينقفل
 *   أي طرف → ping ← pong
 */
'use strict';

var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');
var service = require('./phone-room-service');

var MAX_MSG = 4 * 1024;
var MAX_BACKLOG = 256 * 1024;
var IDLE_MS = 60 * 1000;          // الجوال يرسل ping كل 20ث
var MSG_RATE = 8, MSG_BURST = 20; // التكبيس يتجمّع بالجوال قبل الإرسال
var CHAT_GAP_MS = 400;            // أقل فاصل بين تعليقين من نفس الجوال

var _conns = {};
var _seq = 0;

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

function cleanup(conn) {
    if (!_conns[conn.id]) return;
    delete _conns[conn.id];
    if (conn.code && conn.playerId) service.setOnline(conn.code, conn.playerId, -1);
}

function connsOf(code) {
    return Object.keys(_conns).map(function (k) { return _conns[k]; })
        .filter(function (c) { return c.code === code && !c.closed; });
}

service.onRoomEvent(function (code, ev) {
    connsOf(code).forEach(function (c) {
        if (ev.t === 'live') send(c, { t: 'live', on: ev.on });
        else if (ev.t === 'closed') { send(c, { t: 'bye', reason: ev.reason }); drop(c); }
        else if (ev.t === 'kicked' && c.playerId === ev.playerId) { send(c, { t: 'bye', reason: 'kicked' }); c.playerId = null; drop(c); }
    });
});

function handleMessage(conn, msg) {
    var t = msg.t;
    if (t === 'ping') { send(conn, { t: 'pong' }); return; }

    if (!conn.playerId) {
        if (t !== 'join') return;
        var code = String(msg.code || '').trim();
        var r = service.joinRoom(code, msg.dev, msg.name);
        if (!r.ok) { send(conn, { t: 'err', err: r.err }); return; }
        conn.code = code;
        conn.playerId = r.player.id;
        service.setOnline(code, conn.playerId, +1);
        send(conn, { t: 'joined', me: r.player, room: r.room });
        return;
    }

    if (!service.isMember(conn.code, conn.playerId)) { send(conn, { t: 'bye', reason: 'kicked' }); drop(conn); return; }

    var res = null;
    if (t === 'chat') {
        var now = Date.now();
        if (now - (conn.lastChat || 0) < CHAT_GAP_MS) return;
        conn.lastChat = now;
        res = service.playerAction(conn.code, conn.playerId, 'chat', { text: msg.text });
    } else if (t === 'like') {
        res = service.playerAction(conn.code, conn.playerId, 'like', { count: msg.n });
    } else if (t === 'gift') {
        res = service.playerAction(conn.code, conn.playerId, 'gift', { gift: msg.g, count: msg.n });
    } else if (t === 'follow') {
        res = service.playerAction(conn.code, conn.playerId, 'follow', {});
    } else {
        return;
    }
    if (res) send(conn, { t: 'ack', k: t, ok: res.ok, live: Boolean(res.live), err: res.err || undefined });
}

function attach(socket) {
    var conn = { id: 'ph' + (++_seq).toString(36), socket: socket, code: null, playerId: null, buf: Buffer.alloc(0), seen: Date.now(), tokens: MSG_BURST, last: Date.now(), closed: false };
    _conns[conn.id] = conn;
    socket.on('data', function (chunk) {
        try {
            conn.seen = Date.now();
            conn.buf = Buffer.concat([conn.buf, chunk]);
            if (conn.buf.length > MAX_MSG * 4) { drop(conn); return; }
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
            logger.error('Phone room: message failed:', err);
        }
    });
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
    } catch (e) { logger.error('Phone room: sweep failed:', e); }
}, 5000);
if (_timer.unref) _timer.unref();

module.exports = { handleUpgrade: handleUpgrade, _attach: attach };
