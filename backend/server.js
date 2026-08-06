/**
 * ==========================================================================
 *  AGP BACKEND SERVER — نقطة الدخول (Phase 5: WebSocket فعلي، تيك توك هيكل)
 * ==========================================================================
 *
 * يُشغِّل هذا الملف خادم HTTP (وحدة http المدمجة في Node، بدون أي مكتبة
 * خارجية)، ويربط باقي وحدات backend/ ببعضها (Wiring). خادم WebSocket
 * (websocket/ws-server.js) أصبح تنفيذاً فعلياً كاملاً الآن (مصافحة +
 * تأطير رسائل، راجع Phase 5)؛ موصِّل تيك توك الحقيقي
 * (platforms/tiktok/tiktok-connector.js) لا يزال هيكلاً فارغاً كما
 * طُلب صراحة — الاتصالات الحالية تمر عبر موصِّل محاكاة
 * (platforms/mock/mock-connector.js) بدلاً منه مؤقّتاً، عبر
 * platforms/connector-router.js.
 *
 * ما يفعله هذا الملف فعلياً الآن:
 *   1) يقرأ الإعدادات من config.js.
 *   2) يُنشئ خادم HTTP عادياً يستجيب بفحص صحة بسيط (Health Check) على
 *      المسار الجذري.
 *   3) يستدعي `attachWebSocketServer()` من websocket/ws-server.js —
 *      أصبحت تنفيذاً فعلياً كاملاً الآن (لم يتغيّر توقيع الاستدعاء هنا
 *      إطلاقاً منذ Phase 4، تماماً كما كان مصمَّماً).
 *   4) يبدأ الاستماع على المنفذ المحدَّد في config.js.
 *
 * يعتمد فقط على وحدات Node المدمجة (http) وملفات backend/ الأخرى؛ لا
 * أي مكتبة من package.json (فارغة عمداً).
 *
 * تحديث: أي طلب يبدأ بـ "/api/" يُفوَّض الآن لـ http/auth-router.js
 * (Auth + Admin API فوق auth/auth-service.js الموجود مسبقاً — راجع
 * docs/BACKEND_ARCHITECTURE.md §10). فحص الصحة على المسار الجذري لم
 * يتغيّر إطلاقاً.
 * ==========================================================================
 */

'use strict';

var http = require('http');

var config = require('./config');
var logger = require('./utils/logger');
var wsServer = require('./websocket/ws-server');
var connectorRouter = require('./platforms/connector-router');
var authRouter = require('./http/auth-router');

/**
 * معالج طلبات HTTP — فحص صحة على الجذر كما كان تماماً، بالإضافة لتفويض
 * أي طلب "/api/*" لـ http/auth-router.js (Auth + Admin API، راجع
 * docs/BACKEND_ARCHITECTURE.md §10). هذا السطر الوحيد المضاف هنا؛ لا
 * تغيير آخر على هذا الملف أو على استجابة فحص الصحة نفسها.
 */
function handleHttpRequest(req, res) {
    if ((req.url || '').indexOf('/api/') === 0) {
        authRouter.handle(req, res);
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        service: 'agp-backend',
        status: 'ok',
        websocket: 'implemented',
        activeTikTokConnector: connectorRouter.getActiveConnectorName('tiktok')
    }));
}

function start() {
    var server = http.createServer(handleHttpRequest);

    // نقطة الربط بخادم WebSocket المستقبلي — غير فعّالة حقيقياً بعد
    // (راجع websocket/ws-server.js)، لكن الاستدعاء نفسه موجود هنا حتى
    // لا يحتاج هذا الملف أي تعديل لاحقاً عند تنفيذها فعلياً.
    wsServer.attachWebSocketServer(server);

    server.listen(config.port, function () {
        logger.log('AGP Backend listening on port ' + config.port + ' (WebSocket implemented; TikTok connector still a stub, mock connector active).');
    });

    return server;
}

// يُشغَّل تلقائياً عند تنفيذ هذا الملف مباشرة (node server.js)، لكن
// يبقى قابلاً للاستيراد دون تشغيل تلقائي من أي اختبار مستقبلي.
if (require.main === module) {
    start();
}

module.exports = { start: start };
