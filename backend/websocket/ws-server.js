/**
 * AGP WS SERVER — تنفيذ WebSocket كامل: مصافحة (ws-handshake.js)، تأطير/فك
 * تأطير الرسائل (ws-frame.js)، وتوجيه الرسائل حسب البروتوكول. لا معرفة
 * هنا بتيك توك تحديداً؛ التوجيه لأي منصة يمر عبر platforms/connector-router.js.
 *
 * طلبات الترقية على المسار '/ws/room-relay' تُوجَّه لقناة
 * websocket/room-relay-server.js المنفصلة (Relay عام حسب room). أي طلب
 * ترقية آخر يسلك مسار بروتوكول التيك توك المعتاد.
 *
 * تتبّع إحصائيات البث: عند "connect" لمنصة 'tiktok' بيوزرنيم مطابق لحساب
 * موثَّق (authService.findVerifiedUserByTikTok)، يُسجَّل صف broadcasts
 * جديد؛ عند disconnect/إغلاق الاتصال يُختَم. يوزرنيم غير مرتبط بحساب لا
 * يُسجَّل له أي بث (حالة شائعة: مشاهدة بث أي شخص بدون حساب).
 *
 * ⚠️ تجميع كتابات الإحصائيات (Batching): كتابة SQLite متزامنة لكل حدث
 * comment/gift/follow/roomUser كانت تحجب Event Loop عند معدل أحداث عالٍ
 * (خطة Render محدودة بـ0.5 CPU)، يظهر كـ"تعليق" باللعبة. الإصلاح: كل
 * اتصال يجمّع عدّاداته بالذاكرة (entry.pendingStats) وتُفرَّغ دفعة واحدة
 * كل STATS_FLUSH_INTERVAL_MS، وأيضاً عند ختم أي بث (لتفادي ضياع آخر دفعة).
 */

'use strict';

var handshake = require('./ws-handshake');
var frame = require('./ws-frame');
var schema = require('../protocol/message-schema');
var builder = require('../protocol/message-builder');
var MESSAGE_TYPES = require('../protocol/message-types').MESSAGE_TYPES;
var roomRelay = require('./room-relay-server');
var connectorRouter = require('../platforms/connector-router');
var registry = require('./connection-registry');
var logger = require('../utils/logger');
var authService = require('../auth/auth-service');

var STATS_FLUSH_INTERVAL_MS = 5000;
var _statsFlushIntervalStarted = false;

/**
 * @param {Object} entry - سجل الاتصال من connection-registry
 */
function ensurePendingStats(entry) {
  if (!entry.pendingStats) {
    entry.pendingStats = { comments: 0, gifts: 0, giftsValue: 0, follows: 0, viewerCurrent: null, viewerTotal: null };
  }
}

/**
 * تفريغ العدّادات المعلَّقة لاتصال واحد إلى قاعدة البيانات دفعة واحدة.
 * @param {Object} entry
 */
function flushPendingStats(entry) {
  if (!entry || !entry.activeBroadcastId || !entry.pendingStats) return;
  var pending = entry.pendingStats;
  var broadcastId = entry.activeBroadcastId;

  if (pending.comments > 0) {
    try { authService.incrementBroadcastStat(broadcastId, 'comment', pending.comments); } catch (err) { logger.error('WS Server: batched comment stat flush failed:', err); }
    pending.comments = 0;
  }
  if (pending.follows > 0) {
    try { authService.incrementBroadcastStat(broadcastId, 'follow', pending.follows); } catch (err) { logger.error('WS Server: batched follow stat flush failed:', err); }
    pending.follows = 0;
  }
  if (pending.gifts > 0) {
    try {
      authService.incrementBroadcastStat(broadcastId, 'gift', pending.gifts);
      if (pending.giftsValue > 0) authService.addGiftValue(broadcastId, pending.giftsValue);
    } catch (err) {
      logger.error('WS Server: batched gift stat flush failed:', err);
    }
    pending.gifts = 0;
    pending.giftsValue = 0;
  }
  if (pending.viewerCurrent !== null) {
    try { authService.updateBroadcastViewerStats(broadcastId, pending.viewerCurrent, pending.viewerTotal); } catch (err) { logger.error('WS Server: batched viewer stat flush failed:', err); }
    pending.viewerCurrent = null;
    pending.viewerTotal = null;
  }
}

/** تفريغ العدّادات المعلَّقة لكل الاتصالات النشطة — تُستدعى دورياً فقط. */
function flushAllPendingStats() {
  registry.listConnectionIds().forEach(function (connectionId) {
    flushPendingStats(registry.get(connectionId));
  });
}

/** تشغيل مؤقّت التفريغ الدوري مرة واحدة فقط. */
function startStatsFlushInterval() {
  if (_statsFlushIntervalStarted) return;
  _statsFlushIntervalStarted = true;
  setInterval(flushAllPendingStats, STATS_FLUSH_INTERVAL_MS);
}

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
 * ختم بث نشط مرتبط بهذا الاتصال (لو وُجد) — يُستدعى قبل أي إعادة اتصال،
 * وعند disconnect صريح، وعند إغلاق الاتصال.
 * @param {Object} entry - سجل الاتصال من connection-registry
 */
function endActiveBroadcastIfAny(entry) {
  if (!entry || !entry.activeBroadcastId) return;
  // تفريغ أي عدّادات معلَّقة قبل ختم البث، وإلا تضيع آخر دفعة تجميع.
  flushPendingStats(entry);
  try {
    authService.endBroadcast(entry.activeBroadcastId);
  } catch (err) {
    logger.error('WS Server: failed to end broadcast ' + entry.activeBroadcastId + ':', err);
  }
  entry.activeBroadcastId = null;
  entry.pendingStats = null;
}

/**
 * إغلاق اتصال بأمان: إيقاف أي موصِّل نشط مرتبط به، ثم إزالته من السجل.
 */
function cleanupConnection(connectionId) {
  var entry = registry.get(connectionId);
  if (!entry) return;

  if (entry.activeConnector && typeof entry.activeConnector.disconnect === 'function') {
    entry.activeConnector.disconnect();
  }

  // العميل قد يُغلق التبويب/يفقد الشبكة دون "disconnect" صريح — بدون هذا،
  // يبقى البث "مفتوحاً" للأبد بقاعدة البيانات (ended_at = NULL).
  endActiveBroadcastIfAny(entry);

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

  // ⚠️ أي موصِّل نشط سابق لنفس هذا الاتصال يُفصَل بالكامل أولاً قبل إنشاء
  // موصِّل جديد — يمنع بقاء الموصِّل القديم يعمل بالخلفية ويكتب على نفس
  // المقبس بعد أن فقد المتصفح أي مرجع له (تسريب "اتصال مزدوج").
  if (entry.activeConnector && typeof entry.activeConnector.disconnect === 'function') {
    logger.log('WS Server: disposing previous connector for connection ' + connectionId + ' before replacing it.');
    entry.activeConnector.disconnect();
  }
  // أي بث نشط سابق لهذا الاتصال يُختَم أيضاً بنفس لحظة استبدال الموصِّل.
  endActiveBroadcastIfAny(entry);

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

  // لو يوزرنيم تيك توك المطلوب مراقبته مرتبط بحساب موثَّق، يُسجَّل بث
  // جديد فوراً — بصرف النظر عن نجاح الاتصال الفعلي بتيك توك لاحقاً.
  if (platform === 'tiktok' && payload.username) {
    try {
      var matchedUser = authService.findVerifiedUserByTikTok(payload.username);
      if (matchedUser) {
        entry.activeBroadcastId = authService.startBroadcast(matchedUser.id, payload.username);
        logger.log('WS Server: [0.45.0] broadcast tracking started (broadcastId=' + entry.activeBroadcastId + ') for verified user ' + matchedUser.id + ' watching "' + payload.username + '".');
      }
    } catch (err) {
      logger.error('WS Server: failed to start broadcast tracking:', err);
    }
  }

  connector.connect(payload, {
    onStatus: function (status, message) {
      sendEnvelope(socket, builder.buildStatusMessage(platform, status, message));
    },

    onComment: function (data) {
      sendEnvelope(socket, builder.buildCommentMessage(platform, data.id, data.name, data.text, data.isFollower, data.avatarUrl, data.frame));

      // تجميع بالذاكرة بدل كتابة SQLite فورية — تُفرَّغ دورياً عبر flushAllPendingStats.
      if (entry.activeBroadcastId) {
        ensurePendingStats(entry);
        entry.pendingStats.comments++;
      }
    },

    onGift: function (data) {
      sendEnvelope(socket, builder.buildGiftMessage(platform, data.id, data.name, data.giftName, data.giftValue, data.repeatCount));

      // قيمة الهدية الفعلية = قيمة الوحدة × عدد التكرار. تجميع بالذاكرة
      // بدل كتابتين SQLite فوريتين لكل هدية.
      if (entry.activeBroadcastId) {
        ensurePendingStats(entry);
        entry.pendingStats.gifts++;
        var totalValue = (Number(data.giftValue) || 0) * (Number(data.repeatCount) || 1);
        entry.pendingStats.giftsValue += totalValue;
      }
    },

    onFollow: function (data) {
      sendEnvelope(socket, builder.buildFollowMessage(platform, data.id, data.name));

      if (entry.activeBroadcastId) {
        ensurePendingStats(entry);
        entry.pendingStats.follows++;
      }
    },

    // عدد المشاهدين — تخزين فقط بجدول broadcasts، بدون رسالة جديدة للمتصفح.
    // أعلى معدل أحداث قبل الإصلاح؛ يُخزَّن آخر قيمة بالذاكرة فقط (بدون
    // تراكم) وتُكتب دفعة كل STATS_FLUSH_INTERVAL_MS بدل كل حدث فردي.
    onViewerUpdate: function (data) {
      if (entry.activeBroadcastId) {
        ensurePendingStats(entry);
        entry.pendingStats.viewerCurrent = Number(data.current) || 0;
        entry.pendingStats.viewerTotal = Number(data.totalUsers) || 0;
      }
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
  endActiveBroadcastIfAny(entry);

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

  // العميل قد ينهي جهته (FIN) دون إطار Close صريح — بدون هذا، يبقى
  // المقبس نصف مفتوح للأبد ولا يُطلَق 'close'، فلا يُنظَّف الاتصال.
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
  registry.register(connectionId, { socket: socket, activeConnector: null, activePlatform: null, activeBroadcastId: null });

  attachDataHandler(connectionId, socket);

  logger.log('WS Server: client connected (' + connectionId + '). Total connections: ' + registry.count());
}

module.exports = {
  /**
   * ربط خادم WebSocket بخادم HTTP موجود فعلياً.
   * @param {http.Server} httpServer
   */
  attachWebSocketServer: function (httpServer) {
    httpServer.on('upgrade', function (req, socket) {
      var pathname = (req.url || '').split('?')[0];
      if (pathname === '/ws/room-relay') {
        roomRelay.handleUpgrade(req, socket);
        return;
      }
      handleUpgrade(req, socket);
    });

    startStatsFlushInterval();

    logger.log('WS Server: attached to HTTP server, listening for WebSocket upgrades.');
  }
};
