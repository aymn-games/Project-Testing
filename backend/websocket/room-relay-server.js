/**
 * AGP ROOM RELAY SERVER — قناة WebSocket عامة منفصلة تماماً عن بروتوكول
 * التيك توك. وظيفتها الوحيدة: توصيل (Relay) أي رسالة JSON بين كل
 * الاتصالات المنضمّة لنفس `room`، بدون أي منطق لعبة هنا. تُستخدَم من
 * شاشة اللعب الرئيسية (OBS) وصفحة جوال السباي ماستر بـcodenames.
 *
 * بروتوكول: { type: 'join', room: '<roomId>' } كأول رسالة إلزامية، ثم أي
 * رسالة أخرى تُبَث فوراً لبقية المنضمّين لنفس الغرفة فقط.
 *
 * سجل اتصالات داخلي منفصل عن connection-registry.js (مخصَّص لاتصالات
 * التيك توك، تُستخدَم من دورة تفريغ إحصائيات دورية هناك).
 */

'use strict';

var frame = require('./ws-frame');
var handshake = require('./ws-handshake');
var logger = require('../utils/logger');

var _connections = {}; // connectionId -> { socket, room, buffer }

function generateConnectionId() {
    return 'relay_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function broadcastToRoom(room, senderId, obj) {
    var payload = frame.encodeTextFrame(JSON.stringify(obj));
    Object.keys(_connections).forEach(function (id) {
        if (id === senderId) return;
        var entry = _connections[id];
        if (entry && entry.room === room) {
            try { entry.socket.write(payload); } catch (err) { logger.error('Room Relay: broadcast write failed:', err); }
        }
    });
}

function cleanup(connectionId) {
    if (_connections[connectionId]) {
        delete _connections[connectionId];
        logger.log('Room Relay: connection removed (' + connectionId + '). Total: ' + Object.keys(_connections).length);
    }
}

function attachDataHandler(connectionId, socket) {
    var buffer = Buffer.alloc(0);

    socket.on('data', function (chunk) {
        buffer = Buffer.concat([buffer, chunk]);

        var result;
        while ((result = frame.tryDecodeFrame(buffer)) !== null) {
            buffer = buffer.slice(result.bytesConsumed);

            if (result.opcode === frame.OPCODES.CLOSE) { socket.end(); cleanup(connectionId); return; }
            if (result.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
            if (result.opcode !== frame.OPCODES.TEXT) continue;

            var msg;
            try { msg = JSON.parse(result.payload.toString('utf8')); } catch (err) { continue; } // رسائل غير صالحة تُتجاهَل بصمت

            var entry = _connections[connectionId];
            if (!entry) return;

            if (msg && msg.type === 'join' && typeof msg.room === 'string' && msg.room) {
                entry.room = msg.room;
                logger.log('Room Relay: connection ' + connectionId + ' joined room ' + msg.room);
                continue;
            }

            if (!entry.room) continue; // ما انضم لغرفة بعد -- يتجاهل أي رسالة قبل الانضمام
            broadcastToRoom(entry.room, connectionId, msg);
        }
    });

    socket.on('close', function () { cleanup(connectionId); });
    socket.on('error', function (err) { logger.error('Room Relay: socket error:', err); cleanup(connectionId); });
}

/** معالجة طلب ترقية (Upgrade) خاص بهذه القناة فقط. */
function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
        socket.destroy();
        return;
    }

    var acceptKey = handshake.computeAcceptKey(key);
    var responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Accept: ' + acceptKey,
        '', ''
    ].join('\r\n');
    socket.write(responseHeaders);

    var connectionId = generateConnectionId();
    _connections[connectionId] = { socket: socket, room: null };
    attachDataHandler(connectionId, socket);

    logger.log('Room Relay: client connected (' + connectionId + '). Total: ' + Object.keys(_connections).length);
}

module.exports = {
    handleUpgrade: handleUpgrade
};
