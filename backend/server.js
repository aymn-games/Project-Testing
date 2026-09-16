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

/** معالج طلبات HTTP — فحص صحة على الجذر، وتفويض "/api/*" لـ http/auth-router.js. */
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

    wsServer.attachWebSocketServer(server);

    server.listen(config.port, function () {
        logger.log('AGP Backend listening on port ' + config.port + ' (WebSocket implemented; TikTok connector: ' + connectorRouter.getActiveConnectorName('tiktok') + ').');
    });

    return server;
}

// يُشغَّل تلقائياً عند node server.js، يبقى قابلاً للاستيراد بدون تشغيل تلقائي (اختبارات).
if (require.main === module) {
    start();
}

module.exports = { start: start };
