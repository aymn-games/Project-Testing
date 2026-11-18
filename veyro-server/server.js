/**
 * VEYRO SERVER — نقطة الدخول. سيرفر فيرو (شاشات البث) المستقل عن سيرفر الألعاب:
 * نشر أي واحد منهم ما يوقف الثاني. كل طلب /api/* → http/veyro-router.js.
 * التشغيل والنشر والنقل من سيرفر الألعاب: docs/VEYRO_SERVER.md
 */

'use strict';

var http = require('http');
var config = require('./config');
var logger = require('./utils/logger');
var router = require('./http/veyro-router');

function handleHttpRequest(req, res) {
    if ((req.url || '').indexOf('/api/') === 0) { router.handle(req, res); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'veyro-server', status: 'ok' }));
}

function start() {
    var server = http.createServer(handleHttpRequest);
    server.listen(config.port, function () {
        logger.info('Veyro server listening on port ' + config.port + ' (games server: ' + config.coreApiUrl + ').');
        // نقل بيانات فيرو القديمة من سيرفر الألعاب (لو VEYRO_EXPORT_SECRET موجود) — يتكرر بأمان
        require('./migrate/import-from-core').startAutoImport();
        // اتصال البث للشاشات المفتوحة بتطبيق البث (توب/هدف/وعاء/أليرت/صوت)
        require('./stats/screen-audio-watcher').startScreenAudioWatcher();
        // «الحساب التلقائي» لإحصائيات البث
        require('./stats/stream-stats-watcher').startWatcher();
        // الدونيشن (Streamlabs)
        require('./streamlabs/streamlabs-manager').startStreamlabs();
        // قائمة هدايا تيك توك (أسماء وصور)
        require('./platforms/tiktok/gift-catalog').startAutoRefresh(logger);
    });
    // إحصائيات البث الشغّالة تنحفظ لحالها عند SIGTERM (stats/live-session-stats.js)
}

start();
