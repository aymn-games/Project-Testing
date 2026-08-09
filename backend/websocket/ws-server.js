/**
 * ==========================================================================
 *  AGP WS SERVER — تنفيذ فعلي كامل (Phase 5)، بدون أي مكتبة خارجية
 * ==========================================================================
 *
 * تنفيذ حقيقي الآن (بعد أن كان هيكلاً فارغاً في Phase 4): مصافحة
 * WebSocket كاملة (Handshake عبر websocket/ws-handshake.js)، وتأطير/فك
 * تأطير الرسائل (Framing عبر websocket/ws-frame.js)، وتوجيه الرسائل
 * الواردة حسب البروتوكول الموثَّق في docs/BACKEND_ARCHITECTURE.md §3-4
 * بالضبط — بدون أي تغيير على شكل الرسائل نفسه.
 *
 * لا معرفة هنا بتيك توك تحديداً؛ التوجيه لأي منصة (mock أو tiktok لاحقاً)
 * يمر عبر platforms/connector-router.js — هذا الملف لا يستورد
 * mock-connector.js ولا tiktok-connector.js مباشرة إطلاقاً، فيبقى عاماً
 * تماماً بصرف النظر عمّا يقرره الموجِّه (Router).
 * ==========================================================================
 */

'use strict';

var handshake = require('./ws-handshake');
var frame = require('./ws-frame');
var schema = require('../protocol/message-schema');
var builder = require('../protocol/message-builder');
var MESSAGE_TYPES = require('../protocol/message-types').MESSAGE_TYPES;
var connectorRouter = require('../platforms/connector-router');
var registry = require('./connection-registry');
var logger = require('../utils/logger');

var WEBSOCKET_MAGIC_PATH_CHECK = null; // لا قيد على المسار حالياً (تطوير محلي)

/**
 * إرسال غلاف رسالة واحد (بُني عبر protocol/message-builder.js) إلى
 * مقبس (Socket) اتصال معيّن، مؤطَّراً كإطار WebSocket نصي صحيح.
 * @param {net.Socket} socket
 * @param {Object} envelope
 */
function sendEnvelope(socket, envelope) {
    if (!socket || socket.destroyed) return;
    try {
        socket.write(frame.encodeTextFrame(JSON.stringify(envelope)));
    } catch (err) {
        logger.error('WS Server: failed to write frame:', err);
    }
}

/**
 * إغلاق اتصال بأمان: إيقاف أي موصِّل نشط مرتبط به، ثم إزالته من السجل.
 * @param {string} connectionId
 */
function cleanupConnection(connectionId) {
    var entry = registry.get(connectionId);
    if (!entry) return;

    if (entry.activeConnector && typeof entry.activeConnector.disconnect === 'function') {
        entry.activeConnector.disconnect();
    }

    registry.remove(connectionId);
}

/**
 * معالجة رسالة "connect" واردة من المتصفح — تفتح موصِّلاً جديداً حسب
 * platforms/connector-router.js، وتربط استدعاءاته الراجعة (Callbacks)
 * بإرسال رسائل status/comment/gift/follow عبر نفس هذا الاتصال فقط.
 */
function handleConnectMessage(connectionId, socket, payload) {
    var entry = registry.get(connectionId);
    if (!entry) return;

    var platform = payload.platform;

    // ⚠️ إصلاح تسريب "اتصال مزدوج": أي موصِّل نشط سابق لنفس هذا الاتصال
    // يُفصَل بالكامل أولاً (يوقف مؤقّتات إعادة اتصاله الخاصة، ويُنهي
    // اتصاله الفعلي) قبل إنشاء أي موصِّل جديد — يمنع بقاء الموصِّل
    // القديم يعمل بالخلفية ويكتب على نفس المقبس (Socket) بعد أن فقد
    // المتصفح أي مرجع له فعلياً.
    if (entry.activeConnector && typeof entry.activeConnector.disconnect === 'function') {
        logger.log('WS Server: disposing previous connector for connection ' + connectionId + ' before replacing it.');
        entry.activeConnector.disconnect();
    }
    entry.activeConnector = null;
    entry.activePlatform = null;

    // "connecting" تُرسَل هنا دائماً فوراً (موحّدة بصرف النظر عن الموصِّل)
    sendEnvelope(socket, builder.buildStatusMessage(platform, 'connecting'));

    var connector = connectorRouter.createConnectorForPlatform(platform);
    if (!connector) {
        sendEnvelope(socket, builder.buildErrorMessage(platform, 'unsupported_platform', 'No connector registered for "' + platform + '".'));
        sendEnvelope(socket, builder.buildStatusMessage(platform, 'error'));
        return;
    }

    entry.activeConnector = connector;
    entry.activePlatform = platform;

    connector.connect(payload, {
        onStatus: function (status, message) {
            sendEnvelope(socket, builder.buildStatusMessage(platform, status, message));
        },
        onComment: function (data) {
            // ⚠️ [0.42.2] data.isFollower يُمرَّر الآن للرسالة الصادرة —
            // كان يُحسَب بـ tiktok-connector.js لكن يُفقَد هنا سابقاً.
            sendEnvelope(socket, builder.buildCommentMessage(platform, data.id, data.name, data.text, data.isFollower));
        },
        onGift: function (data) {
            sendEnvelope(socket, builder.buildGiftMessage(platform, data.id, data.name, data.giftName, data.giftValue, data.repeatCount));
        },
        onFollow: function (data) {
            sendEnvelope(socket, builder.buildFollowMessage(platform, data.id, data.name));
        }
    });
}

/**
 * معالجة رسالة "disconnect" واردة من المتصفح.
 */
function handleDisconnectMessage(connectionId, socket, payload) {
    var entry = registry.get(connectionId);
    if (!entry) return;

    if (entry.activeConnector && typeof entry.activeConnector.disconnect === 'function') {
        entry.activeConnector.disconnect();
    }
    entry.activeConnector = null;
    entry.activePlatform = null;

    sendEnvelope(socket, builder.buildStatusMessage(payload.platform, 'disconnected'));
}

/**
 * توجيه رسالة واردة صالحة الشكل (بعد التحقق عبر message-schema) إلى
 * المعالج المناسب حسب نوعها. لا يُنفَّذ شيء لأنواع Backend→Browser إن
 * وردت خطأً من المتصفح (تُتجاهَل بصمت).
 */
function routeIncomingMessage(connectionId, socket, message) {
    switch (message.type) {
        case MESSAGE_TYPES.CONNECT:
            handleConnectMessage(connectionId, socket, message.payload);
            break;
        case MESSAGE_TYPES.DISCONNECT:
            handleDisconnectMessage(connectionId, socket, message.payload);
            break;
        default:
            logger.log('WS Server: ignoring unexpected message type from browser:', message.type);
    }
}

/**
 * معالجة بيانات واردة على مقبس اتصال معيّن: تراكم في مخزن مؤقّت خاص
 * بالاتصال، ثم استخراج كل الإطارات المكتملة المتاحة منه بالتتابع.
 */
function attachDataHandler(connectionId, socket) {
    var buffer = Buffer.alloc(0);

    socket.on('data', function (chunk) {
        buffer = Buffer.concat([buffer, chunk]);

        var decoded;
        while ((decoded = frame.tryDecodeFrame(buffer)) !== null) {
            buffer = buffer.slice(decoded.bytesConsumed);

            if (decoded.opcode === frame.OPCODES.CLOSE) {
                socket.write(frame.encodeControlFrame(frame.OPCODES.CLOSE));
                socket.end();
                return;
            }

            if (decoded.opcode === frame.OPCODES.PING) {
                socket.write(frame.encodeControlFrame(frame.OPCODES.PONG));
                continue;
            }

            if (decoded.opcode !== frame.OPCODES.TEXT) continue; // لا دعم لإطارات ثنائية

            var text = decoded.payload.toString('utf8');
            var parsed;
            try {
                parsed = JSON.parse(text);
            } catch (err) {
                logger.log('WS Server: received non-JSON message, ignored.');
                continue;
            }

            if (!schema.isValidEnvelope(parsed)) {
                logger.log('WS Server: received invalid envelope, ignored.', parsed);
                continue;
            }

            routeIncomingMessage(connectionId, socket, parsed);
        }
    });

    // العميل قد ينهي جهته (FIN) دون إرسال إطار Close صريح (شبكة انقطعت،
    // تبويب أُغلِق فجأة، تطبيق تحطَّم...) — بدون هذا، يبقى المقبس نصف
    // مفتوح للأبد ولا يُطلَق حدث 'close' أبداً، فلا يُنظَّف الاتصال ولا
    // موصِّله النشط إطلاقاً. إنهاء جهتنا فوراً يُكمل الإغلاق بأمان.
    socket.on('end', function () { socket.end(); });

    socket.on('close', function () { cleanupConnection(connectionId); });
    socket.on('error', function (err) {
        logger.error('WS Server: socket error:', err);
        cleanupConnection(connectionId);
    });
}

/**
 * معالجة طلب ترقية (Upgrade) HTTP إلى WebSocket: تحقّق أساسي من
 * الترويسات، حساب مفتاح المصافحة، وكتابة استجابة 101 يدوياً.
 */
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

    var connectionId = 'conn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    registry.register(connectionId, { socket: socket, activeConnector: null, activePlatform: null });

    attachDataHandler(connectionId, socket);
    logger.log('WS Server: client connected (' + connectionId + '). Total connections: ' + registry.count());
}

module.exports = {
    /**
     * ربط خادم WebSocket بخادم HTTP موجود فعلياً. تنفيذ حقيقي كامل
     * الآن — لا حاجة لأي تعديل على server.js الذي يستدعي هذه الدالة.
     * @param {http.Server} httpServer
     */
    attachWebSocketServer: function (httpServer) {
        httpServer.on('upgrade', function (req, socket) {
            handleUpgrade(req, socket);
        });
        logger.log('WS Server: attached to HTTP server, listening for WebSocket upgrades.');
    }
};
