/**
 * ==========================================================================
 * AGP WS SERVER — تنفيذ فعلي كامل (Phase 5)، بدون أي مكتبة خارجية
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
 *
 * ⚠️ [0.45.0] تتبّع إحصائيات البث — أول ربط فعلي: كانت
 * backend/auth/auth-service.js (startBroadcast/endBroadcast/
 * incrementBroadcastStat/addGiftValue) موجودة وجاهزة منذ البداية، لكن
 * لا شيء يستدعيها فعلياً — كل الإحصائيات كانت تبقى صفراً للأبد. الربط
 * هنا **فقط** (لا تعديل على البروتوكول، ولا على
 * platforms/connector-router.js، ولا على tiktok-connector.js، ولا على
 * أي ملف js/agp-*.js بالواجهة الأمامية):
 *
 *   عند "connect" لمنصة 'tiktok' بيوزرنيم مطابق لحساب موثَّق فعلياً
 *   بالمنصة (authService.findVerifiedUserByTikTok) → يُعتبَر "بث بدأ"
 *   لصاحب ذلك الحساب، ويُسجَّل صف جديد بجدول broadcasts. عند "disconnect"
 *   (يدوي أو إغلاق الاتصال) يُختَم بث ذلك الصف. كل تعليق/هدية/متابعة
 *   واردة أثناء ذلك تزيد عدّاد الإحصائية المطابقة لنفس الصف.
 *
 *   لو يوزرنيم المتصَل به **غير** مرتبط بأي حساب موثَّق بالمنصة (حالة
 *   شائعة تماماً — أي زائر يقدر يكتب أي يوزرنيم بلوحة الستريمر لمشاهدة
 *   بثه فقط، بدون تشغيل إحصائيات)، لا يُسجَّل أي بث ولا تتأثر أي إحصائية
 *   — بصمت، بدون أي خطأ أو تغيير سلوك ظاهر بالواجهة.
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
var authService = require('../auth/auth-service');

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
 * [0.45.0] ختم بث نشط مرتبط بهذا الاتصال (لو وُجد) — يُستدعى قبل أي
 * إعادة اتصال، وعند disconnect صريح، وعند إغلاق الاتصال (Socket). لا
 * يفعل شيئاً بصمت لو لا يوجد بث نشط (يوزرنيم غير مرتبط بحساب موثَّق —
 * الحالة الأشيع).
 * @param {Object} entry - سجل الاتصال من connection-registry
 */
function endActiveBroadcastIfAny(entry) {
  if (!entry || !entry.activeBroadcastId) return;
  try {
    authService.endBroadcast(entry.activeBroadcastId);
  } catch (err) {
    logger.error('WS Server: failed to end broadcast ' + entry.activeBroadcastId + ':', err);
  }
  entry.activeBroadcastId = null;
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

  // [0.45.0] العميل قد يُغلق التبويب/يفقد الشبكة دون إرسال "disconnect"
  // صريح أبداً — بدون هذا، يبقى البث "مفتوحاً" للأبد بقاعدة البيانات
  // (ended_at = NULL) حتى لو توقّف فعلياً. نفس مبدأ تنظيف activeConnector
  // أعلاه بالضبط، لبث نشط بدل موصِّل نشط.
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

  // ⚠️ إصلاح تسريب "اتصال مزدوج": أي موصِّل نشط سابق لنفس هذا الاتصال
  // يُفصَل بالكامل أولاً (يوقف مؤقّتات إعادة اتصاله الخاصة، ويُنهي
  // اتصاله الفعلي) قبل إنشاء أي موصِّل جديد — يمنع بقاء الموصِّل
  // القديم يعمل بالخلفية ويكتب على نفس المقبس (Socket) بعد أن فقد
  // المتصفح أي مرجع له فعلياً.
  if (entry.activeConnector && typeof entry.activeConnector.disconnect === 'function') {
    logger.log('WS Server: disposing previous connector for connection ' + connectionId + ' before replacing it.');
    entry.activeConnector.disconnect();
  }
  // [0.45.0] أي بث نشط سابق لهذا الاتصال يُختَم أيضاً بنفس لحظة استبدال
  // الموصِّل — نفس منطق تنظيف activeConnector أعلاه تماماً، لتفادي بقاء
  // صف broadcasts "مفتوحاً" بلا داعٍ لو المتصفح غيّر اليوزرنيم المتصَل
  // به دون قطع الاتصال صراحة أولاً.
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

  // [0.45.0] لو يوزرنيم تيك توك المطلوب مراقبته مرتبط فعلياً بحساب
  // موثَّق بالمنصة (نفس تحقّق getEquippedFrameForVerifiedTikTok تماماً)،
  // يُسجَّل بث جديد لصاحب ذلك الحساب فوراً — بصرف النظر عن نجاح الاتصال
  // الفعلي بتيك توك لاحقاً أم لا (بث "بدأ" من منظورنا بمجرد طلب المراقبة؛
  // لو فشل الاتصال فعلياً، ينتهي هذا الصف بسرعة عند disconnect/إعادة
  // المحاولة التالية، بدون أي أثر ضار). لا شيء يحدث بصمت لو اليوزرنيم
  // غير مرتبط بأي حساب — الحالة الأشيع (مراقبة بث أي شخص بدون حساب هنا).
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
      // ⚠️ [0.42.2] data.isFollower يُمرَّر الآن للرسالة الصادرة —
      // كان يُحسَب بـ tiktok-connector.js لكن يُفقَد هنا سابقاً.
      // ⚠️ [جديد] data.avatarUrl وdata.frame يُمرَّران أيضاً — نفس
      // مبدأ 0.42.2 بالضبط، تجنّباً لتكرار نفس الخطأ (حساب صحيح
      // بالباك إند ثم فقدانه هنا قبل وصوله للمتصفح).
      sendEnvelope(socket, builder.buildCommentMessage(platform, data.id, data.name, data.text, data.isFollower, data.avatarUrl, data.frame));

      // [0.45.0]
      if (entry.activeBroadcastId) {
        try { authService.incrementBroadcastStat(entry.activeBroadcastId, 'comment'); } catch (err) { logger.error('WS Server: comment stat increment failed:', err); }
      }
    },

    onGift: function (data) {
      sendEnvelope(socket, builder.buildGiftMessage(platform, data.id, data.name, data.giftName, data.giftValue, data.repeatCount));

      // [0.45.0] قيمة الهدية الفعلية = قيمة الوحدة × عدد التكرار (نفس
      // منطق تيك توك للهدايا القابلة للتسلسل — data.repeatCount يعكس
      // العدد الكلي المُرسَل بالفعل بحدث النهاية الواحد، راجع
      // tiktok-connector.js تعليق GIFT أعلاه).
      if (entry.activeBroadcastId) {
        try {
          authService.incrementBroadcastStat(entry.activeBroadcastId, 'gift');
          var totalValue = (Number(data.giftValue) || 0) * (Number(data.repeatCount) || 1);
          authService.addGiftValue(entry.activeBroadcastId, totalValue);
        } catch (err) {
          logger.error('WS Server: gift stat increment failed:', err);
        }
      }
    },

    onFollow: function (data) {
      sendEnvelope(socket, builder.buildFollowMessage(platform, data.id, data.name));

      // [0.45.0]
      if (entry.activeBroadcastId) {
        try { authService.incrementBroadcastStat(entry.activeBroadcastId, 'follow'); } catch (err) { logger.error('WS Server: follow stat increment failed:', err); }
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
  // [0.45.0] ختم البث النشط (إن وُجد) بنفس لحظة قطع الاتصال الصريح.
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
  registry.register(connectionId, { socket: socket, activeConnector: null, activePlatform: null, activeBroadcastId: null });

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
