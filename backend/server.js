/**
 * AGP BACKEND SERVER — نقطة الدخول. يُشغِّل خادم HTTP (وحدة http المدمجة
 * في Node، بدون مكتبة خارجية)، يربط باقي وحدات backend/ ببعضها، يفوّض أي
 * طلب "/api/*" لـ http/auth-router.js، ويربط خادم WebSocket
 * (websocket/ws-server.js). طلبات تيك توك تمر عبر platforms/connector-router.js.
 */

'use strict';

var http = require('http');

var config = require('./config');
var logger = require('./utils/logger');
var wsServer = require('./websocket/ws-server');
var connectorRouter = require('./platforms/connector-router');
var authRouter = require('./http/auth-router');
var kickHub = require('./platforms/kick/kick-hub');
var twitchHub = require('./platforms/twitch/twitch-hub');
var veyroBridge = require('./http/veyro-bridge');

/** معالج طلبات HTTP — فحص صحة على الجذر، وتفويض "/api/*" لـ http/auth-router.js. */
function handleHttpRequest(req, res) {
    // أحداث بث كيك (Webhook موقَّع من كيك) — platforms/kick/kick-hub.js
    if ((req.url || '').split('?')[0] === '/kick/webhook') {
        kickHub.handleWebhook(req, res);
        return;
    }
    // أحداث بث تويتش (EventSub Webhook موقَّع) — platforms/twitch/twitch-hub.js
    if ((req.url || '').split('?')[0] === '/twitch/webhook') {
        twitchHub.handleWebhook(req, res);
        return;
    }
    // فيرو: التصدير لسيرفره، وتحويل طلباته القديمة لو VEYRO_API_URL موجود — http/veyro-bridge.js
    if ((req.url || '').indexOf('/api/') === 0 && veyroBridge.handle(req, res)) return;
    if ((req.url || '').indexOf('/api/') === 0) {
        authRouter.handle(req, res);
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        service: 'agp-backend',
        status: 'ok',
        websocket: 'implemented',
        activeTikTokConnector: connectorRouter.getActiveConnectorName('tiktok'),
        // للتأكد إن KICK_CLIENT_ID و KICK_CLIENT_SECRET مضافة بـ Render (بدون كشف قيمها)
        kickConfigured: require('./platforms/kick/kick-api').isConfigured(),
        twitchConfigured: require('./platforms/twitch/twitch-api').isConfigured()
    }));
}

function start() {
    var server = http.createServer(handleHttpRequest);

    wsServer.attachWebSocketServer(server);

    server.listen(config.port, function () {
        // تعبئة صور تيك توك للحسابات الموثَّقة القديمة اللي ما عندها صورة.
        require('./auth/tiktok-avatar-sync').startBackfill();
        // مراقبة إحصائيات البث للستريمرز المفعّلين من الأدمن (بدون فتح الموقع).
        require('./stats/stream-stats-watcher').startWatcher();
        if (veyroBridge.proxyMode()) {
            // فيرو انتقل لسيرفره (VEYRO_API_URL): هو اللي يتصل بالبث للشاشات ويشغّل Streamlabs
            logger.info('Veyro: proxy mode — Veyro requests go to ' + config.veyroApiUrl + '; screen watcher and Streamlabs run there.');
        } else {
            // اتصال البث لشاشات Veyro اللي فيها أدوات صوت (القارئ/مشغّل الأغاني) — SCREEN_AUDIO_CONNECT.
            require('./stats/screen-audio-watcher').startScreenAudioWatcher();
            // Streamlabs: اتصال لكل ستريمر مربوط (الدونيشن — كريترز وغيره) — streamlabs/streamlabs-manager.js
            require('./streamlabs/streamlabs-manager').startStreamlabs();
        }
        // كتالوج هدايا تيك توك (الأسماء بالعربي والإنجليزي، الأسعار، الصور) — مرة باليوم من تيك توك نفسه.
        require('./platforms/tiktok/gift-catalog').startAutoRefresh(logger);
        // اشتراكات فيرو من المتجر: خطط فيرو ونسب خصم مشتركي الألعاب، وإعادة إرسال اللي ما وصل — store/veyro-link.js
        require('./store/veyro-link').start();
        // عملات أيمن: جوائز التصنيف الأسبوعي (تنصرف مرة وحدة بعد تصفير السبت) — coins/coins-service.js
        require('./coins/coins-service').start();
        logger.log('AGP Backend listening on port ' + config.port + ' (WebSocket implemented; TikTok connector: ' + connectorRouter.getActiveConnectorName('tiktok') + ').');
    });

    return server;
}

// يُشغَّل تلقائياً عند node server.js، يبقى قابلاً للاستيراد بدون تشغيل تلقائي (اختبارات).
if (require.main === module) {
    start();
}

module.exports = { start: start };
