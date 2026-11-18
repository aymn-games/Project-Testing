/** VEYRO LOGGER — نفس backend/utils/logger.js بس بختم [Veyro] عشان سجلات Render تنفرق. */

'use strict';

var config = require('../config');

function out(fn, args) {
    args = Array.prototype.slice.call(args);
    args.unshift('[Veyro]');
    fn.apply(console, args);
}

module.exports = {
    log: function () { if (config.debug) out(console.log, arguments); },
    error: function () { out(console.error, arguments); },
    info: function () { out(console.log, arguments); }
};
