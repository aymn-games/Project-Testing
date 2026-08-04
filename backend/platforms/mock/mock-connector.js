/**
 * ==========================================================================
 *  AGP MOCK CONNECTOR (Backend) — يولّد بيانات محاكاة، بلا معرفة بـ AGP
 * ==========================================================================
 *
 * هذا هو المصدر الفعلي لبيانات المحاكاة الآن (بدل agp-mock-live-adapter.js
 * القديم في المتصفح، الذي كان يولّدها محلياً). لا يعرف هذا الملف شيئاً
 * عن AGP.keywordManager أو أي حالة واجهة أمامية — تماماً كما يُفترض بأي
 * محوِّل خلفي حقيقي (لا يمكنه "معرفة" الكلمة المفعَّلة في متصفح آخر).
 * المتصفح (adapters/tiktok/agp-tiktok-adapter.js) هو من يقرر لاحقاً ماذا
 * يفعل بكل تعليق وارد — تماماً كما سيحدث مع تيك توك الحقيقي.
 *
 * يطبّق نفس "شكل موصِّل" (Connector Shape) الذي سيطبّقه
 * platforms/tiktok/tiktok-connector.js عند تنفيذه فعلياً لاحقاً:
 *
 *   connect(options, callbacks)
 *   disconnect()
 *   isConnected()
 *
 *   callbacks = {
 *     onStatus(status, message?),   // 'connected' | 'error' فقط من هنا
 *                                    // ('connecting'/'disconnected' تُدار
 *                                    // مركزياً من ws-server.js نفسه)
 *     onComment({ id, name, text }),
 *     onGift({ id, name, giftName, giftValue, repeatCount }),
 *     onFollow({ id, name })
 *   }
 *
 * هذا التطابق في الشكل هو ما يسمح لاحقاً باستبدال هذا الملف بموصِّل
 * تيك توك الحقيقي دون تعديل websocket/ws-server.js إطلاقاً — فقط تغيير
 * سطر واحد في platforms/connector-router.js (راجعه).
 * ==========================================================================
 */

'use strict';

var logger = require('../../utils/logger');

var MOCK_USERNAMES = [
    'ahmad_gamer', 'sara.live', 'omar_ksa', 'nourah22', 'faisal_tv',
    'layla_x', 'khalid.stream', 'reem_here', 'yousef99', 'hind_live'
];

// 'JOIN' مُضمَّنة عمداً بين الاحتمالات — قيمة كلمة انضمام افتراضية
// شائعة أثناء الاختبار، لكن هذا الملف لا "يعرف" أي كلمة مفعَّلة فعلياً؛
// المتصفح هو من يقرر إن كانت مطابقة أم لا.
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
 * إنشاء نسخة موصِّل محاكاة جديدة ومستقلة (اتصال واحد = نسخة واحدة)،
 * حتى لا تتشارك عدة اتصالات متصفح نفس المؤقّت (Interval) بالخطأ.
 * @returns {{connect: function, disconnect: function, isConnected: function}}
 */
function createMockConnector() {
    var _intervalId = null;
    var _connected = false;

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
            }, 800 + Math.random() * 700);
        },

        disconnect: function () {
            _disconnected = true;
            _connected = false;
            if (_intervalId !== null) {
                clearInterval(_intervalId);
                _intervalId = null;
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
