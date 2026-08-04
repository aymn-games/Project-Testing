/**
 * ==========================================================================
 *  AGP TIKTOK ADAPTER (Frontend) — جسر WebSocket، لا محاكاة محلية هنا
 * ==========================================================================
 *
 * هذا الملف **لا يعرف شيئاً عن كون البيانات محاكاة أم حقيقية** — تلك
 * قرار الخادم الخلفي وحده (backend/platforms/connector-router.js). كل
 * ما يفعله هذا الملف: يفتح اتصال WebSocket واحد بالخادم الخلفي، يرسل
 * له `connect`/`disconnect` حسب طلب المستخدم، ويستقبل منه
 * `status`/`comment`/`gift`/`follow`/`error` فيوجّهها لنفس نقاط AGP
 * الأربع الموثَّقة في docs/BACKEND_ARCHITECTURE.md §10-12 بالضبط — نفس
 * الاستدعاءات تماماً التي كانت موجودة سابقاً في
 * adapters/mock/agp-mock-live-adapter.js (المتجاوَز الآن، راجع تعليقه
 * العلوي)، فقط مصدر البيانات تغيّر من setInterval محلي إلى رسائل
 * WebSocket واردة فعلياً من عملية Node منفصلة.
 *
 * هذا يعني عملياً: عندما يتحوّل backend/platforms/tiktok/tiktok-connector.js
 * من هيكل فارغ إلى تنفيذ حقيقي (تعديل سطر واحد في
 * backend/platforms/connector-router.js فقط)، **هذا الملف نفسه لن يحتاج
 * أي تعديل إطلاقاً** — البروتوكول الذي يتحدّث به لا يتغيّر بين المحاكاة
 * والاتصال الحقيقي.
 *
 * نفس تقنية التطبيق: تعديل (Mutate) دوال الكائن الموجود أصلاً
 * `AGP.services.TikTokService` في مكانها، بدل استبداله بالكامل — تماماً
 * كما فعل الملف المتجاوَز.
 *
 * يعتمد على js/agp-core.js, js/agp-events.js, js/agp-services.js,
 * js/agp-stream-connector.js, js/agp-keyword-manager.js,
 * js/agp-queue-manager.js قبله (يعمل بأمان حتى لو تأخر تحميله بعدها).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.services || !AGP.services.TikTokService) {
        AGP.log('TikTok Adapter: AGP.services.TikTokService not found, cannot attach.');
        return;
    }

    var PLATFORM_KEY = 'tiktok';

    // عنوان الخادم الخلفي — تطوير محلي فقط حالياً (نفس نطاق الصفحة،
    // منفذ backend/config.js الافتراضي). سيحتاج ضبطاً حقيقياً (بيئة
    // إنتاج) عند التوزيع الفعلي لاحقاً — خارج نطاق هذه المرحلة.
    var BACKEND_WS_URL = 'ws://' + window.location.hostname + ':8787';

    var _socket = null;
    var _connecting = false;
    var _commentCallback = null;
    var _giftCallback = null;
    var _pendingConnectOptions = null;

    /* ----------------------------------------------------------------
     * إعادة اتصال تلقائية لقناة المتصفح↔الخادم الخلفي نفسها (منفصلة
     * تماماً عن إعادة اتصال الخادم الخلفي بتيك توك، التي تبقى مسؤولية
     * backend/platforms/tiktok/tiktok-connector.js وحده). خادمنا
     * الخاص (بخلاف تيك توك) قابل للاسترداد دائماً (إعادة تشغيل مثلاً)،
     * لذا لا حد أقصى لعدد المحاولات هنا — فقط تأخير تصاعدي يتوقف عند
     * حد أعلى معقول، ويستمر حتى ينجح أو يُلغى الاتصال يدوياً.
     *
     * يُعاد استخدام _connecting الموجودة أصلاً كإشارة "هل يُفترض أن نكون
     * متصلين الآن؟" — تُضبَط false داخل disconnectFromLiveStream()
     * الموجودة أصلاً، فيتوقف أي جدولة إعادة اتصال تلقائياً دون أي علم
     * جديد مستقل، ودون أي تغيير على عقد AGP.services.TikTokService.
     * ---------------------------------------------------------------- */
    var WS_RECONNECT_BASE_DELAY_MS = 1000;
    var WS_RECONNECT_MAX_DELAY_MS = 30000;
    var _wsReconnectAttempts = 0;
    var _wsReconnectTimer = null;

    function clearWsReconnectTimer() {
        if (_wsReconnectTimer !== null) {
            clearTimeout(_wsReconnectTimer);
            _wsReconnectTimer = null;
        }
    }

    function scheduleWsReconnect() {
        if (!_connecting) return; // أُلغي الاتصال يدوياً — لا إعادة محاولة إطلاقاً

        var delay = Math.min(WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, _wsReconnectAttempts), WS_RECONNECT_MAX_DELAY_MS);
        delay += Math.floor(Math.random() * 500); // Jitter بسيط
        _wsReconnectAttempts++;

        AGP.log('TikTok Adapter: backend connection lost, retrying in ' + delay + 'ms (attempt ' + _wsReconnectAttempts + ')…');
        if (AGP.streamConnector) AGP.streamConnector.reportStatus(PLATFORM_KEY, 'connecting');

        clearWsReconnectTimer();
        _wsReconnectTimer = setTimeout(function () {
            _wsReconnectTimer = null;
            if (!_connecting) return; // أُلغي الاتصال أثناء الانتظار
            openSocketAndConnect();
        }, delay);
    }

    /* ----------------------------------------------------------------
     * توجيه رسالة comment واردة — نفس منطق الملف المتجاوَز بالضبط:
     * عبر AGP.keywordManager إن كانت الكلمة مفعَّلة، وإلا عبر
     * AGP.queueManager. لا فرق هنا عن كون النص محاكاة أم حقيقياً.
     * ---------------------------------------------------------------- */
    function handleIncomingComment(payload) {
        if (_commentCallback) _commentCallback(payload);

        var playerData = { id: payload.id, name: payload.name };
        var keywordActive = AGP.keywordManager && AGP.keywordManager.isActive();

        if (keywordActive) {
            AGP.keywordManager.checkKeyword(payload.text, playerData);
        } else if (AGP.queueManager && typeof AGP.queueManager.enqueue === 'function') {
            AGP.queueManager.enqueue(PLATFORM_KEY, playerData);
        }
    }

    function handleIncomingGift(payload) {
        if (_giftCallback) _giftCallback(payload);
        AGP.events.emit('stream:giftReceived', payload);
    }

    function handleIncomingFollow(payload) {
        AGP.events.emit('stream:followReceived', payload);
    }

    function handleIncomingStatus(payload) {
        if (!AGP.streamConnector || typeof AGP.streamConnector.reportStatus !== 'function') return;
        AGP.streamConnector.reportStatus(PLATFORM_KEY, payload.status);
    }

    function handleIncomingError(payload) {
        AGP.log('TikTok Adapter: backend reported error —', payload.code, payload.message);
    }

    function handleSocketMessage(rawMessage) {
        var envelope;
        try {
            envelope = JSON.parse(rawMessage);
        } catch (err) {
            AGP.log('TikTok Adapter: received non-JSON message, ignored.');
            return;
        }
        if (!envelope || !envelope.type || !envelope.payload) return;

        switch (envelope.type) {
            case 'status': handleIncomingStatus(envelope.payload); break;
            case 'comment': handleIncomingComment(envelope.payload); break;
            case 'gift': handleIncomingGift(envelope.payload); break;
            case 'follow': handleIncomingFollow(envelope.payload); break;
            case 'error': handleIncomingError(envelope.payload); break;
            default: AGP.log('TikTok Adapter: unknown message type from backend:', envelope.type);
        }
    }

    function sendToBackend(type, payload) {
        if (!_socket || _socket.readyState !== 1 /* OPEN */) return;
        _socket.send(JSON.stringify({ type: type, payload: payload || {}, timestamp: Date.now() }));
    }

    function ensureSocketOpen(onOpenSendConnect) {
        if (_socket && (_socket.readyState === 0 /* CONNECTING */ || _socket.readyState === 1 /* OPEN */)) {
            if (_socket.readyState === 1) onOpenSendConnect();
            return;
        }

        _socket = new WebSocket(BACKEND_WS_URL);

        _socket.onopen = function () {
            AGP.log('TikTok Adapter: WebSocket connected to backend.');
            _wsReconnectAttempts = 0; // اتصال ناجح فعلياً يعيد ضبط عدّاد المحاولات
            clearWsReconnectTimer();
            onOpenSendConnect();
        };
        _socket.onmessage = function (event) { handleSocketMessage(event.data); };
        _socket.onerror = function (err) {
            AGP.log('TikTok Adapter: WebSocket error.', err);
            if (AGP.streamConnector) AGP.streamConnector.reportStatus(PLATFORM_KEY, 'error');
        };
        _socket.onclose = function () {
            AGP.log('TikTok Adapter: WebSocket closed.');
            _socket = null;
            // انقطاع غير متعمَّد فقط (لا يزال المستخدم يريد الاتصال) يُجدوِل
            // إعادة محاولة؛ انقطاع بعد disconnectFromLiveStream() (حيث
            // _connecting = false أصلاً) لا يفعل شيئاً هنا إطلاقاً.
            scheduleWsReconnect();
        };
    }

    /**
     * فتح القناة (أو إعادة استخدامها إن كانت مفتوحة فعلاً) وإرسال رسالة
     * connect بآخر بيانات معروفة — نفس المسار تماماً يُستخدَم لأول اتصال
     * ولأي محاولة إعادة اتصال لاحقة، دون أي تكرار للمنطق.
     */
    function openSocketAndConnect() {
        ensureSocketOpen(function () {
            if (!_connecting) return; // أُلغي الاتصال قبل اكتمال فتح القناة
            sendToBackend('connect', { platform: PLATFORM_KEY, username: (_pendingConnectOptions && _pendingConnectOptions.username) || null });
        });
    }

    /* ----------------------------------------------------------------
     * تطبيق العقد الأربعة — نفس الأسماء تماماً، معدَّلة في مكانها على
     * الكائن الموجود أصلاً (نفس أسلوب الملف المتجاوَز بالضبط). لا تغيير
     * على أي توقيع أو سلوك خارجي مُلاحَظ من AGP Core أو Dashboard.
     * ---------------------------------------------------------------- */
    AGP.services.TikTokService.connectToLiveStream = function (options) {
        _connecting = true;
        _pendingConnectOptions = options || {};
        _wsReconnectAttempts = 0;
        clearWsReconnectTimer();

        openSocketAndConnect();
    };

    AGP.services.TikTokService.disconnectFromLiveStream = function () {
        _connecting = false;
        clearWsReconnectTimer(); // يمنع أي محاولة إعادة اتصال مجدولة من التنفيذ
        sendToBackend('disconnect', { platform: PLATFORM_KEY });
        if (_socket) {
            _socket.close();
            _socket = null;
        }
    };

    AGP.services.TikTokService.onComment = function (callback) {
        _commentCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.services.TikTokService.onGift = function (callback) {
        _giftCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.log('AGP TikTok Adapter attached to AGP.services.TikTokService (WebSocket bridge — backend decides mock vs. real).');

}(window.AymanGamesPlatform));
