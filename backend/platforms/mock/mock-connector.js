/**
 * AGP MOCK CONNECTOR (Backend) — يولّد بيانات محاكاة، بلا معرفة بحالة
 * الواجهة الأمامية (مثل أي موصِّل حقيقي، لا يمكنه معرفة الكلمة المفعَّلة
 * بمتصفح آخر). يطبّق نفس "شكل الموصِّل" الذي يطبّقه
 * platforms/tiktok/tiktok-connector.js، ما يسمح بالتبديل بينهما عبر
 * platforms/connector-router.js فقط:
 *
 *   connect(options, callbacks) / disconnect() / isConnected()
 *   callbacks = {
 *     onStatus(status, message?),   // 'connected' | 'error' فقط من هنا
 *     onComment({ id, name, text }),
 *     onGift({ id, name, giftName, giftValue, repeatCount }),
 *     onFollow({ id, name }),
 *     onViewerUpdate({ current, totalUsers })   // current يتذبذب، totalUsers يزيد فقط
 *   }
 */

'use strict';

var logger = require('../../utils/logger');

var MOCK_USERNAMES = [
    'ahmad_gamer', 'sara.live', 'omar_ksa', 'nourah22', 'faisal_tv',
    'layla_x', 'khalid.stream', 'reem_here', 'yousef99', 'hind_live'
];

var MOCK_COMMENT_TEXTS = [
    'JOIN', '🔥🔥🔥', 'lets go!', 'من وين البث', 'حياكم', '😂😂',
    'yesss', 'شنو اللعبة هذي', 'gg', '👏👏', 'join'
];

var MOCK_GIFTS = [
    { name: 'Rose', value: 1 },
    { name: 'Heart', value: 5 },
    { name: 'Lion', value: 500 },
    { name: 'Galaxy', value: 1000 }
];

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function randomViewer() {
    var username = pick(MOCK_USERNAMES);
    return { id: 'tiktok:' + username.toLowerCase(), name: username };
}

/**
 * إنشاء نسخة موصِّل محاكاة جديدة ومستقلة (اتصال واحد = نسخة واحدة).
 * @returns {{connect: function, disconnect: function, isConnected: function}}
 */
function createMockConnector() {
    var _intervalId = null;
    var _viewerIntervalId = null;
    var _connected = false;
    var _totalUsers = Math.floor(10 + Math.random() * 20);

    function tick(callbacks) {
        var roll = Math.random();
        if (roll < 0.55) {
            var viewer = randomViewer();
            callbacks.onComment({ id: viewer.id, name: viewer.name, text: pick(MOCK_COMMENT_TEXTS) });
        } else if (roll < 0.85) {
            var giftViewer = randomViewer();
            var gift = pick(MOCK_GIFTS);
            callbacks.onGift({
                id: giftViewer.id, name: giftViewer.name,
                giftName: gift.name, giftValue: gift.value, repeatCount: 1
            });
        } else {
            var followViewer = randomViewer();
            callbacks.onFollow({ id: followViewer.id, name: followViewer.name });
        }
    }

    var _disconnected = false;

    return {
        /**
         * @param {{username: string}} options
         * @param {Object} callbacks
         */
        connect: function (options, callbacks) {
            _disconnected = false;
            logger.log('Mock Connector (backend): simulating connection for "' + (options && options.username) + '"…');

            setTimeout(function () {
                if (_disconnected) return; // فُصل الاتصال يدوياً أثناء التأخير المحاكى — تجاهل تماماً
                _connected = true;
                callbacks.onStatus('connected');

                _intervalId = setInterval(function () {
                    tick(callbacks);
                }, 1500 + Math.random() * 1500);

                if (callbacks.onViewerUpdate) {
                    _viewerIntervalId = setInterval(function () {
                        if (Math.random() < 0.3) _totalUsers += 1; // مشاهد جديد أحياناً
                        var current = Math.max(1, Math.floor(_totalUsers * (0.4 + Math.random() * 0.3)));
                        callbacks.onViewerUpdate({ current: current, totalUsers: _totalUsers });
                    }, 4000 + Math.random() * 2000);
                }
            }, 800 + Math.random() * 700);
        },

        disconnect: function () {
            _disconnected = true;
            _connected = false;
            if (_intervalId !== null) {
                clearInterval(_intervalId);
                _intervalId = null;
            }
            if (_viewerIntervalId !== null) {
                clearInterval(_viewerIntervalId);
                _viewerIntervalId = null;
            }
            logger.log('Mock Connector (backend): simulated disconnect.');
        },

        isConnected: function () {
            return _connected;
        }
    };
}

module.exports = {
    createMockConnector: createMockConnector
};
