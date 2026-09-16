/**
 * AGP CONNECTION REGISTRY — خريطة في الذاكرة لتتبّع اتصالات WebSocket
 * المفتوحة بمعرّف فريد. بيانات بحتة، لا كود بروتوكول هنا (راجع ws-server.js).
 */

'use strict';

var logger = require('../utils/logger');

var _connections = {}; // connectionId -> connectionObject

module.exports = {
    register: function (connectionId, connectionObject) {
        _connections[connectionId] = connectionObject;
        logger.log('Connection registered:', connectionId);
    },

    /** @returns {boolean} true إن كان موجوداً فعلاً وتمت إزالته */
    remove: function (connectionId) {
        if (!Object.prototype.hasOwnProperty.call(_connections, connectionId)) return false;
        delete _connections[connectionId];
        logger.log('Connection removed:', connectionId);
        return true;
    },

    get: function (connectionId) {
        return _connections[connectionId] || null;
    },

    listConnectionIds: function () {
        return Object.keys(_connections);
    },

    count: function () {
        return Object.keys(_connections).length;
    }
};
