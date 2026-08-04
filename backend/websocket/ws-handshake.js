/**
 * ==========================================================================
 *  AGP WS HANDSHAKE — حساب مفتاح المصافحة (RFC 6455)، وحدة crypto فقط
 * ==========================================================================
 */

'use strict';

var crypto = require('crypto');

var WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * حساب قيمة رأس Sec-WebSocket-Accept من قيمة Sec-WebSocket-Key الواردة
 * من المتصفح، حسب المواصفة تماماً.
 * @param {string} clientKey
 * @returns {string}
 */
function computeAcceptKey(clientKey) {
    return crypto
        .createHash('sha1')
        .update(clientKey + WEBSOCKET_GUID, 'utf8')
        .digest('base64');
}

module.exports = {
    computeAcceptKey: computeAcceptKey
};
