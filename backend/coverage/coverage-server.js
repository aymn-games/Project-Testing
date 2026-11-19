/**
 * «خارج التغطية» — خادم WebSocket ('/ws/coverage').
 *
 * نفس نموذج «المافيا» و«محطة سهيل»: شاشة البث تنشئ غرفة برقم من 4 أرقام
 * (نطاق 'coverage' بـ rooms/room-code-ranges.js)، والجوالات تدخل بالباركود أو
 * الرقم. كل منطق الغرف والمباراة بـ coverage-rooms.js (بدون شبكة)، وهنا بس
 * فك وتغليف إطارات WebSocket.
 *
 * الدخول للعب بدون حساب (الاسم بس). لو اللاعب مسجّل وموثّق بتيك توك يوصل
 * يوزره لشاشة البث عشان نقاط المنصة (reportMatchPoints).
 */
'use strict';

var crypto = require('crypto');
var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');
var CodeRanges = require('../rooms/room-code-ranges');
var Rooms = require('./coverage-rooms');

var TICK_MS = 100, MAX_MSG = 8 * 1024, SILENT_MS = 75 * 1000;

var _accountOf = function (token) {
    var u = require('../auth/auth-service').validateSession(String(token || ''));
    if (!u) return null;
    return { tiktok: u.tiktok_verified && u.tiktok_username ? String(u.tiktok_username) : null };
};

var hub = Rooms.createHub({
    allocate: function (isTaken) { return CodeRanges.allocate('coverage', isTaken); },
    accountOf: function (t) { return _accountOf(t); },
    log: function (m) { logger.log(m); }
});

var _sockets = new Set(), _ticker = null;
function ensureTicker() {
    if (_ticker) return;
    _ticker = setInterval(function () {
        var t = Date.now();
        _sockets.forEach(function (s) { if (t - s.lastRx > SILENT_MS) { try { s.socket.destroy(); } catch (e) { } s.done(); } });
        hub.tick();
    }, TICK_MS);
    if (_ticker.unref) _ticker.unref();
}

function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + handshake.computeAcceptKey(key), '', ''].join('\r\n'));
    try { socket.setNoDelay(true); } catch (e) { }
    ensureTicker();

    var client = hub.open(function (obj) { socket.write(frame.encodeTextFrame(JSON.stringify(obj))); });
    var entry = { socket: socket, lastRx: Date.now(), done: function () { _sockets.delete(entry); hub.close(client); } };
    _sockets.add(entry);
    var buffer = Buffer.alloc(0);

    socket.on('data', function (chunk) {
        entry.lastRx = Date.now();
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > MAX_MSG * 4) { socket.destroy(); entry.done(); return; }
        var result;
        while ((result = frame.tryDecodeFrame(buffer)) !== null) {
            buffer = buffer.slice(result.bytesConsumed);
            if (result.opcode === frame.OPCODES.CLOSE) { socket.end(); entry.done(); return; }
            if (result.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
            if (result.opcode !== frame.OPCODES.TEXT || result.payload.length > MAX_MSG) continue;
            var msg; try { msg = JSON.parse(result.payload.toString('utf8')); } catch (err) { continue; }
            try { hub.message(client, msg); } catch (err) { logger.error('Coverage: message error:', err); }
        }
    });
    socket.on('close', function () { entry.done(); });
    socket.on('error', function () { entry.done(); });
}

/** لزر «دخول غرفة» (rooms/room-lookup-service.js). */
function hasRoom(code) { return hub.hasRoom(code); }

module.exports = { handleUpgrade: handleUpgrade, hasRoom: hasRoom, _hub: hub, _setAccountLookup: function (fn) { _accountOf = fn; } };
