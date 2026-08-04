/**
 * ==========================================================================
 *  AGP GAME BRIDGE — جسر اتصال عام (postMessage) لأي لعبة مستضافة خارجياً
 * ==========================================================================
 *
 * هذا الملف يستخرج منطق الاتصال عبر `window.postMessage` الذي كان مكتوباً
 * بالكامل وحصرياً داخل `games/roulette/agp-roulette.js` إلى طبقة عامة
 * قابلة لإعادة الاستخدام من أي لعبة مستقبلية مستضافة على نطاق خارجي
 * منفصل (Cross-Origin) — بما فيها أي لعبة تيك توك قادمة — دون أي منطق
 * خاص بلعبة بعينها هنا، ودون أي اتصال فعلي بتيك توك أو أي منصة بث.
 *
 * ما الذي يفعله هذا الملف بالضبط (نفس آلية الروليت الأصلية، بلا تغيير
 * في السلوك، فقط مُجرَّدة من أي معرّف لعبة محدد):
 *   1) اعتراض نقرة زر لعب (رابط `<a>` عادي)، منع السلوك الافتراضي،
 *      وفتح النافذة بأنفسنا عبر `window.open()` للحصول على مرجع حقيقي.
 *   2) استقبال إشارة `"ready"` من نافذة اللعبة (بعد تحميلها فعلياً)،
 *      واستدعاء دالة `onReady` (افتراضية أو مخصَّصة) عندها فقط.
 *   3) تمرير أحداث دورة حياة `AGP.gameEngine` الخاصة باللعبة المتصلة
 *      فقط (`game:loaded/started/ended/destroyed` افتراضياً) كرسائل
 *      `postMessage` إلى نافذة اللعبة.
 *   4) استقبال أحداث مُبلَّغة من اللعبة نفسها (قائمة تُحدِّدها كل لعبة
 *      عند الاتصال) وبثّها كما هي عبر `AGP.events.emit(...)`.
 *
 * الفرق عن التنفيذ السابق (المُدمَج داخل agp-roulette.js): لا يوجد هنا
 * أي معرّف لعبة (`GAME_ID`) أو نطاق (`origin`) أو اسم `source` ثابت —
 * كل هذه تُمرَّر كخيارات عند الاتصال (`AGP.gameBridge.connect(options)`)،
 * حتى تعمل أي لعبة أخرى بنفس الآلية دون تكرار الكود أو تعديل هذا الملف.
 *
 * الاستخدام المتوقَّع من أي ملف Adapter مستقبلي (`games/<id>/agp-<id>.js`،
 * بنفس نمط `games/roulette/agp-roulette.js` بعد تحديثه ليستخدم هذا
 * الملف):
 *
 *   var handle = AGP.gameBridge.connect({
 *     id: 'my-game',                          // مطلوب، يطابق التسجيل في Game API
 *     playLinkEl: someAnchorElement,          // مطلوب، رابط "العب الآن"
 *     incomingSource: 'agp-my-game-integration', // مطلوب، يطابق ما ترسله اللعبة
 *     reportedEvents: ['game:roundStarted', 'game:roundEnded', ...], // اختياري
 *     outgoingSource: 'agp-platform',         // اختياري (القيمة الافتراضية)
 *     forwardedEvents: [...],                 // اختياري (نفس الأربعة الافتراضية)
 *     onReady: function (gameWindow) { ... }  // اختياري (سلوك افتراضي جاهز أدناه)
 *   });
 *
 *   // لاحقاً عند الحاجة (مثلاً داخل onDestroy الخاص باللعبة):
 *   handle.disconnect();
 *
 * السلوك الافتراضي لـ onReady (لو لم يُمرَّر): تحميل اللعبة عبر
 * `AGP.gameManager.loadGame(id)` لو لم تكن محمَّلة فعلاً، ثم تشغيلها عبر
 * `AGP.gameEngine.start()` لو لم تكن تعمل بالفعل — تماماً كما كان مكتوباً
 * يدوياً داخل agp-roulette.js سابقاً، فقط مُعمَّماً هنا بمعرّف اللعبة.
 *
 * لا يوجد هنا أي كود خاص بتيك توك أو أي Stream Connector؛ هذا الملف لا
 * يعرف شيئاً عن مصدر رسائل اللعبة (تيك توك أو غيره) — هو فقط أنبوب
 * اتصال عام بين نافذتين عبر postMessage، تماماً كحال الروليت اليوم.
 *
 * يعتمد هذا الملف على وجود js/agp-core.js و js/agp-events.js قبله، ويُفضَّل
 * تحميله بعد js/agp-game-manager.js وقبل أي ملف Adapter للعبة
 * (games/<game-id>/agp-<game-id>.js) يستخدمه.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    // حماية بسيطة في حال تم تحميل هذا الملف قبل agp-core.js بالخطأ
    if (!AGP.log) {
        AGP.log = function () {};
    }
    if (!AGP.events) {
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    var DEFAULT_OUTGOING_SOURCE = 'agp-platform';
    var DEFAULT_FORWARDED_EVENTS = ['game:loaded', 'game:started', 'game:ended', 'game:destroyed'];

    /**
     * السلوك الافتراضي عند استقبال إشارة "ready" من نافذة اللعبة، لو لم
     * تُمرَّر دالة onReady مخصَّصة عند الاتصال. مطابق تماماً لما كان
     * مكتوباً داخل agp-roulette.js سابقاً، معمَّماً فقط بمعرّف اللعبة.
     */
    function defaultOnReady(id) {
        return function () {
            if (!AGP.gameManager || !AGP.gameEngine) return;

            var currentGame = AGP.gameManager.getCurrentGame();
            if (!currentGame || currentGame.id !== id) {
                AGP.gameManager.loadGame(id);
            }
            // isRunning()/start() ليستا من دوال AGP.gameManager الستة
            // (Facade مقصود أن يبقى مختصراً بنفس النطاق المطلوب منه)،
            // لذا يبقى هذان الاستدعاءان مباشرين لـ AGP.gameEngine —
            // تماماً كما كان الحال في agp-roulette.js الأصلي.
            if (!AGP.gameEngine.isRunning()) {
                AGP.gameEngine.start();
            }
        };
    }

    AGP.gameBridge = {

        /**
         * فتح اتصال جسر postMessage جديد بين المنصة ونافذة لعبة خارجية.
         * @param {Object} options
         *   - {string} id - معرّف اللعبة (يطابق تسجيلها في Game API)
         *   - {Element} playLinkEl - رابط "العب الآن" المطلوب اعتراض نقره
         *   - {string} incomingSource - قيمة `source` المتوقَّعة في
         *     الرسائل القادمة من نافذة اللعبة
         *   - {string} [outgoingSource] - قيمة `source` المُرسَلة إلى
         *     نافذة اللعبة (افتراضياً 'agp-platform')
         *   - {Array<string>} [forwardedEvents] - أحداث AGP.events التي
         *     تُمرَّر كما هي إلى نافذة اللعبة (افتراضياً أحداث دورة حياة
         *     Game Engine الأربعة)
         *   - {Array<string>} [reportedEvents] - أنواع الرسائل التي قد
         *     ترسلها اللعبة نفسها (غير "ready")، تُبثّ كما هي عبر
         *     AGP.events.emit عند وصولها (افتراضياً مصفوفة فارغة — كل
         *     لعبة تحدّد مفرداتها الخاصة)
         *   - {Function} [onReady] - دالة مخصَّصة تُستدعى عند استقبال
         *     "ready" من نافذة اللعبة (افتراضياً: تحميل+تشغيل تلقائي)
         * @returns {Object|null} كائن تحكّم بالاتصال
         *   ({ getGameWindow, sendToGameWindow, disconnect })، أو null
         *   عند نقص خيار مطلوب.
         */
        connect: function (options) {
            options = options || {};

            var id = options.id;
            var playLinkEl = options.playLinkEl;
            var incomingSource = options.incomingSource;
            var outgoingSource = options.outgoingSource || DEFAULT_OUTGOING_SOURCE;
            var forwardedEvents = options.forwardedEvents || DEFAULT_FORWARDED_EVENTS;
            var reportedEvents = options.reportedEvents || [];
            var onReady = (typeof options.onReady === 'function') ? options.onReady : defaultOnReady(id);

            if (!id || !playLinkEl || !incomingSource) {
                AGP.log('Game Bridge: cannot connect, missing required option(s) (id/playLinkEl/incomingSource).', options);
                return null;
            }

            var _gameWindow = null;   // مرجع النافذة المفتوحة فعلياً للعبة
            var _gameOrigin = null;   // نطاق (Origin) اللعبة، يُستخدم كـ targetOrigin

            /**
             * إرسال رسالة دورة حياة إلى نافذة اللعبة المفتوحة حالياً، إن
             * وُجدت ولم تُغلَق بعد.
             */
            function sendToGameWindow(type, payload) {
                if (!_gameWindow || _gameWindow.closed) return;
                try {
                    _gameWindow.postMessage({
                        source: outgoingSource,
                        type: type,
                        payload: payload || {}
                    }, _gameOrigin || '*');
                } catch (err) {
                    console.error('[AGP Game Bridge] Failed to postMessage to game window ("' + id + '"):', err);
                }
            }

            /**
             * استقبال الرسائل القادمة من نافذة اللعبة: "ready" تُشغِّل
             * onReady، وأي نوع مذكور في reportedEvents يُبثّ كما هو عبر
             * AGP.events.emit.
             */
            function handleMessageFromGameWindow(event) {
                if (!_gameWindow || event.source !== _gameWindow) return;

                var data = event.data;
                if (!data || data.source !== incomingSource || !data.type) return;

                if (data.type === 'ready') {
                    AGP.log('Game Bridge: "' + id + '" window signaled ready.');
                    onReady(_gameWindow);
                    return;
                }

                if (reportedEvents.indexOf(data.type) !== -1) {
                    var payload = data.payload || {};
                    payload.id = id;

                    AGP.log('Game Bridge: "' + id + '" reported "' + data.type + '".', payload);
                    AGP.events.emit(data.type, payload);
                }
            }

            /**
             * عند نقر رابط اللعب: نمنع السلوك الافتراضي ونفتح النافذة
             * بأنفسنا عبر window.open() للحصول على مرجع حقيقي لها.
             */
            function handlePlayButtonClick(event) {
                var url = playLinkEl.getAttribute('href');
                if (!url) return;

                event.preventDefault();

                _gameWindow = window.open(url, '_blank');
                try {
                    _gameOrigin = new URL(url, window.location.href).origin;
                } catch (err) {
                    _gameOrigin = null;
                }

                if (!_gameWindow) {
                    AGP.log('Game Bridge: window.open() was blocked for "' + id + '" (popup blocker?).');
                }
            }

            playLinkEl.addEventListener('click', handlePlayButtonClick);
            window.addEventListener('message', handleMessageFromGameWindow);

            // تمرير أحداث دورة حياة Game Engine (الخاصة بهذه اللعبة فقط،
            // بمقارنة payload.id) إلى نافذة اللعبة الفعلية.
            forwardedEvents.forEach(function (eventName) {
                AGP.events.on(eventName, function (payload) {
                    if (!payload || payload.id !== id) return;
                    sendToGameWindow(eventName, payload);
                });
            });

            AGP.log('Game Bridge: connected for "' + id + '".');

            return {
                getGameWindow: function () { return _gameWindow; },
                sendToGameWindow: sendToGameWindow,

                /**
                 * قطع الاتصال: إزالة مستمعي النقر والرسائل، وتفريغ مرجع
                 * النافذة. لا يُلغي تسجيل اللعبة من Game API؛ تلك مسؤولية
                 * منفصلة تماماً (AGP.gameAPI.unregister أو onDestroy).
                 */
                disconnect: function () {
                    playLinkEl.removeEventListener('click', handlePlayButtonClick);
                    window.removeEventListener('message', handleMessageFromGameWindow);
                    _gameWindow = null;
                    _gameOrigin = null;
                    AGP.log('Game Bridge: disconnected for "' + id + '".');
                }
            };
        }
    };

    AGP.log('AGP Game Bridge loaded — generic postMessage bridge for externally-hosted games.');

}(window.AymanGamesPlatform));
