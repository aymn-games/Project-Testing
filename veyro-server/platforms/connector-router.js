/**
 * VEYRO — نقطة إنشاء اتصال تيك توك. نفس backend/platforms/connector-router.js بس تيك توك
 * بس (فيرو ما يحتاج كيك وتويتش)، عبر المجمّع المشترك: اتصال واحد لكل بث مهما كثرت الشاشات.
 * التوقيع بمفتاح EulerStream الخاص بفيرو (EULERSTREAM_API_KEY بخدمة فيرو) — حده منفصل عن الألعاب.
 */

'use strict';

var connectionPool = require('./tiktok/shared-connection-pool');

function createConnectorForPlatform(platform, meta) {
    return platform === 'tiktok' ? connectionPool.createLease(meta) : null;
}

module.exports = {
    createConnectorForPlatform: createConnectorForPlatform,
    getActiveConnectorName: function (p) { return p === 'tiktok' ? 'tiktok-connector.js (real, shared pool)' : 'none'; }
};
