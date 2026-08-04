/**
 * ==========================================================================
 *  AGP MOCK LIVE ADAPTER — محاكاة محلية بالكامل، بدون أي اتصال فعلي
 * ==========================================================================
 *
 * ⚠️ DEPRECATED منذ Phase 5: لم يعد هذا الملف مُحمَّلاً في
 *   dashboard-core/index.html. المحاكاة انتقلت للخادم الخلفي
 *   (backend/platforms/mock/mock-connector.js)، والمتصفح يستقبلها الآن
 *   عبر adapters/tiktok/agp-tiktok-adapter.js (جسر WebSocket). محفوظ
 *   هنا للمرجعية فقط، ولم يُحذَف أو يُعدَّل منطقه.
 *
 * هذا الملف **ليس Manager جديداً وليس تعديلاً على AGP Core**. هو تطبيق
 * فعلي (Implementation) للعقد الموجود أصلاً في `AGP.services.TikTokService`
 * (المعرَّف كهيكل فارغ في `js/agp-services.js`)، تماماً بنفس الأربع
 * دوال المتوقَّعة: `connectToLiveStream`, `disconnectFromLiveStream`,
 * `onComment`, `onGift` — بدون أي دالة إضافية، وبدون أي تغيير على
 * `AGP.streamConnector` أو أي ملف Core آخر.
 *
 * الطريقة: نُعدِّل (Mutate) دوال الكائن **الموجود بالفعل**
 * `AGP.services.TikTokService` في مكانها، بدل استبدال الكائن بالكامل.
 * السبب: `AGP.streamConnector` سجّل بالفعل مرجعاً (Reference) لنفس هذا
 * الكائن عند تحميل `agp-stream-connector.js` (يتحقق فقط أن الدوال
 * موجودة كنوع Function، لا من سلوكها). تعديل الدوال داخل نفس الكائن
 * يجعل ما يستدعيه `AGP.streamConnector.connect('tiktok')` هو نسخة
 * المحاكاة هذه تلقائياً، بصرف النظر عن ترتيب تحميل هذا الملف بالنسبة
 * لـ agp-stream-connector.js.
 *
 * ⚠️ الاستبدال المستقبلي (بدون أي تعديل على Core أو Dashboard):
 *   لاستبدال هذا الملف بالمحوِّل الحقيقي لاحقاً، يكفي:
 *     1) عدم تحميل هذا الملف (`adapters/mock/agp-mock-live-adapter.js`).
 *     2) تحميل `adapters/tiktok/agp-tiktok-adapter.js` (مستقبلاً) بدلاً
 *        عنه — بنفس الأسلوب بالضبط (تعديل دوال نفس الكائن
 *        `AGP.services.TikTokService` في مكانها).
 *   لا يوجد أي كود آخر في المشروع (Core أو Dashboard) يعرف اسم هذا
 *   الملف أو يستورده مباشرة؛ الربط الوحيد هو عبر العقد الموحّد نفسه.
 *
 * ما يُحاكيه هذا الملف محلياً فقط (بدون شبكة، بدون Node.js):
 *   - حالات اتصال واقعية (تأخير بسيط عشوائي قبل "connected"، ثم محاكاة
 *     نبض حي عبر setInterval يولّد أحداثاً بشكل دوري).
 *   - تعليقات (بعضها يطابق كلمة الانضمام الحالية إن كانت مفعَّلة).
 *   - هدايا.
 *   - متابعات جديدة.
 *
 * كيف يتواصل مع AGP Core (نفس الأربع نقاط الموثَّقة في تصميم محوِّل
 * تيك توك، بدون أي إضافة):
 *   - AGP.streamConnector.reportStatus('tiktok', status) — دورة الحياة
 *     فقط. لا نداء مباشر لأي دالة أخرى في streamConnector.
 *   - AGP.keywordManager.checkKeyword(text, playerData) — عند وجود
 *     تعليق يطابق كلمة انضمام مفعَّلة (تستدعي هي AGP.playerSource
 *     داخلياً؛ لا نداء مباشر لـ AGP.player من هنا إطلاقاً).
 *   - AGP.queueManager.enqueue('tiktok', playerData) — للتعليقات التي
 *     لا تطابق كلمة انضمام (أو لا كلمة مفعَّلة أصلاً)، لإظهار مسار
 *     Queue أيضاً (كلا المسارين المصمَّمين، لا مسار واحد فقط).
 *   - AGP.events.emit('stream:giftReceived' / 'stream:followReceived', …)
 *     — Namespace جديد للأحداث فقط (نص، لا كود)، بنفس اصطلاح
 *     "منصّة:فعل" الموثَّق أصلاً في agp-events.js. لا تعديل على ناقل
 *     الأحداث نفسه.
 *
 * لا منطق خاص بأي لعبة هنا إطلاقاً. لا Manager جديد. لا تعديل على AGP
 * Core أو Dashboard. يعتمد على وجود js/agp-core.js, js/agp-events.js,
 * js/agp-services.js, js/agp-stream-connector.js, js/agp-keyword-manager.js,
 * js/agp-queue-manager.js قبله (يعمل بأمان حتى لو تأخر تحميله بعدها).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.services || !AGP.services.TikTokService) {
        AGP.log('Mock Live Adapter: AGP.services.TikTokService not found, cannot attach mock.');
        return;
    }

    var PLATFORM_KEY = 'tiktok';

    var MOCK_USERNAMES = [
        'ahmad_gamer', 'sara.live', 'omar_ksa', 'nourah22', 'faisal_tv',
        'layla_x', 'khalid.stream', 'reem_here', 'yousef99', 'hind_live'
    ];

    var MOCK_FILLER_COMMENTS = [
        '🔥🔥🔥', 'lets go!', 'من وين البث', 'حياكم', '😂😂', 'yesss',
        'من فترة اتابعك', 'شنو اللعبة هذي', 'gg', '👏👏'
    ];

    var MOCK_GIFTS = [
        { name: 'Rose', value: 1 },
        { name: 'Heart', value: 5 },
        { name: 'Lion', value: 500 },
        { name: 'Galaxy', value: 1000 }
    ];

    var _connecting = false;
    var _intervalId = null;
    var _commentCallback = null;
    var _giftCallback = null;

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function randomViewer() {
        var username = pick(MOCK_USERNAMES);
        return { id: PLATFORM_KEY + ':' + username.toLowerCase(), name: username };
    }

    /* ----------------------------------------------------------------
     * محاكاة استقبال تعليق — نفس مسارَي الانضمام المصمَّمين في معمارية
     * محوِّل تيك توك (Keyword أو Queue)، بلا منطق جديد بينهما هنا؛ فقط
     * توجيه لما هو موجود فعلاً في AGP Core.
     * ---------------------------------------------------------------- */
    function simulateComment() {
        var viewer = randomViewer();
        var keywordActive = AGP.keywordManager && AGP.keywordManager.isActive();
        var currentKeyword = keywordActive ? AGP.keywordManager.getKeyword() : null;

        // ~40% من التعليقات أثناء تفعيل الكلمة تكون مطابقة فعلياً، لإظهار
        // مسار الانضمام الحقيقي، والباقي دردشة عامة لا تُطابِق شيئاً.
        var text = (keywordActive && currentKeyword && Math.random() < 0.4)
            ? currentKeyword
            : pick(MOCK_FILLER_COMMENTS);

        var rawComment = { platform: PLATFORM_KEY, id: viewer.id, name: viewer.name, text: text, timestamp: Date.now() };
        if (_commentCallback) _commentCallback(rawComment);

        var playerData = { id: viewer.id, name: viewer.name };

        if (keywordActive) {
            AGP.keywordManager.checkKeyword(text, playerData);
        } else if (AGP.queueManager && typeof AGP.queueManager.enqueue === 'function') {
            AGP.queueManager.enqueue(PLATFORM_KEY, playerData);
        }
    }

    /* ----------------------------------------------------------------
     * محاكاة استقبال هدية — حدث فقط (stream:giftReceived)، بلا أي قرار
     * لعب من هنا. ما يحدث بالهدية (نقاط، إلخ) قرار لاحق منفصل تماماً.
     * ---------------------------------------------------------------- */
    function simulateGift() {
        var viewer = randomViewer();
        var gift = pick(MOCK_GIFTS);
        var payload = {
            platform: PLATFORM_KEY,
            id: viewer.id,
            name: viewer.name,
            giftName: gift.name,
            giftValue: gift.value,
            repeatCount: 1,
            timestamp: Date.now()
        };

        if (_giftCallback) _giftCallback(payload);
        AGP.events.emit('stream:giftReceived', payload);
    }

    /* ----------------------------------------------------------------
     * محاكاة متابعة جديدة — حدث فقط، لا علاقة له بانضمام لاعب إطلاقاً
     * (متابعة اللاعب لا تعني رغبته باللعب).
     * ---------------------------------------------------------------- */
    function simulateFollow() {
        var viewer = randomViewer();
        AGP.events.emit('stream:followReceived', {
            platform: PLATFORM_KEY,
            id: viewer.id,
            name: viewer.name,
            timestamp: Date.now()
        });
    }

    function tick() {
        var roll = Math.random();
        if (roll < 0.55) {
            simulateComment();
        } else if (roll < 0.85) {
            simulateGift();
        } else {
            simulateFollow();
        }
    }

    function startSimulationLoop() {
        stopSimulationLoop();
        _intervalId = setInterval(tick, 1500 + Math.random() * 1500);
    }

    function stopSimulationLoop() {
        if (_intervalId !== null) {
            clearInterval(_intervalId);
            _intervalId = null;
        }
    }

    /* ----------------------------------------------------------------
     * تطبيق العقد الأربعة — نفس أسماء الدوال المتوقَّعة تماماً، معدَّلة
     * في مكانها على الكائن الموجود أصلاً.
     * ---------------------------------------------------------------- */
    AGP.services.TikTokService.connectToLiveStream = function (options) {
        AGP.log('Mock Live Adapter: simulating connection…', options);
        _connecting = true;

        setTimeout(function () {
            if (!_connecting) return; // أُلغي الاتصال قبل اكتمال المحاكاة

            if (!AGP.streamConnector || typeof AGP.streamConnector.reportStatus !== 'function') {
                AGP.log('Mock Live Adapter: AGP.streamConnector.reportStatus not available.');
                return;
            }

            AGP.streamConnector.reportStatus(PLATFORM_KEY, AGP.streamConnector.STATUS.CONNECTED);
            startSimulationLoop();
        }, 800 + Math.random() * 700);
    };

    AGP.services.TikTokService.disconnectFromLiveStream = function () {
        _connecting = false;
        stopSimulationLoop();
        AGP.log('Mock Live Adapter: simulated disconnect.');
    };

    AGP.services.TikTokService.onComment = function (callback) {
        _commentCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.services.TikTokService.onGift = function (callback) {
        _giftCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.log('AGP Mock Live Adapter attached to AGP.services.TikTokService (simulation only, no real connection).');

}(window.AymanGamesPlatform));
