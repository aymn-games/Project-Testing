/**
 * ==========================================================================
 *  AGP CONNECTION REGISTRY — تتبّع اتصالات المتصفح المفتوحة (بيانات فقط)
 * ==========================================================================
 *
 * بنية بيانات عامة بحتة (خريطة في الذاكرة) لتتبّع أي "اتصال" مفتوح
 * (Connection Object) بمعرّف فريد، بغضّ النظر عن نوع النقل الفعلي
 * (WebSocket لاحقاً، أو أي شيء آخر). لا يوجد هنا أي كود WebSocket
 * حقيقي — ذلك في websocket/ws-server.js (لم يُبنَ بعد). هذا الملف مجرد
 * "دفتر" يُستخدَم لاحقاً من قِبَل ws-server.js عند اكتماله.
 * ==========================================================================
 */

'use strict';

var logger = require('../utils/logger');

var _connections = {}; // connectionId -> connectionObject (شكله يُحدَّد لاحقاً مع ws-server.js)

module.exports = {
    /**
     * تسجيل اتصال جديد بمعرّف فريد.
     * @param {string} connectionId
     * @param {*} connectionObject
     */
    register: function (connectionId, connectionObject) {
        _connections[connectionId] = connectionObject;
        logger.log('Connection registered:', connectionId);
    },

    /**
     * إزالة اتصال (عند الإغلاق/قطع الاتصال).
     * @param {string} connectionId
     * @returns {boolean} true إن كان موجوداً فعلاً وتمت إزالته
     */
    remove: function (connectionId) {
        if (!Object.prototype.hasOwnProperty.call(_connections, connectionId)) return false;
        delete _connections[connectionId];
        logger.log('Connection removed:', connectionId);
        return true;
    },

    /**
     * جلب اتصال بمعرّفه.
     * @param {string} connectionId
     * @returns {*|null}
     */
    get: function (connectionId) {
        return _connections[connectionId] || null;
    },

    /**
     * قائمة كل معرّفات الاتصالات المسجَّلة حالياً.
     * @returns {Array<string>}
     */
    listConnectionIds: function () {
        return Object.keys(_connections);
    },

    /**
     * عدد الاتصالات المفتوحة حالياً.
     * @returns {number}
     */
    count: function () {
        return Object.keys(_connections).length;
    }
};
