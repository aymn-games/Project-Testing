/**
 * DASHBOARD LIVE UPDATES — أي تغيير حقيقي على المنصة (انضمام لاعب، بدء/
 * انتهاء جولة، تسجيل لعبة جديدة...) يعيد رسم الصفحة الحالية تلقائياً،
 * بدون Polling وبدون لمس ناقل الأحداث نفسه.
 *
 * ⚠️ LIVE_EVENT_NAMES قائمة صريحة وثابتة (لا Wildcard حقيقي في ناقل
 * الأحداث) — أي Namespace جديد كلياً (مثل أحداث تيك توك لاحقاً) يتطلب
 * إضافة أسمائه هنا يدوياً عند إنشائه.
 *
 * أحداث AGP كثيراً ما تصل متتالية (مثال: winnerSelected ثم roundEnded)؛
 * تُجمَّع كل الأحداث الواردة خلال نافذة قصيرة في إعادة رسم واحدة فقط.
 *
 * يعتمد على ../js/agp-core.js (لـ AGP.events) وjs/dashboard-router.js
 * (لـ NS.router.refresh) قبله.
 */

window.AGPDashboard = window.AGPDashboard || {};

(function (NS) {
    'use strict';

    var LIVE_EVENT_NAMES = [
        // session:* (agp-session.js)
        'session:created',
        'session:stateChanged',
        'session:roundStarted',
        'session:roundFinished',
        'session:ended',

        // player:* (agp-player-manager.js)
        'player:joinRequested',
        'player:joinRejected',
        'player:joined',
        'player:removed',
        'player:listReset',

        // lobby:* (agp-lobby.js)
        'lobby:opened',
        'lobby:closed',
        'lobby:playerAccepted',
        'lobby:playerRejected',
        'lobby:stateChanged',

        // round:* (agp-round-manager.js)
        'round:stateChanged',

        // game:* (agp-game-api.js / agp-game-engine.js / أي لعبة متصلة)
        'game:registered',
        'game:unregistered',
        'game:currentChanged',
        'game:loaded',
        'game:started',
        'game:ended',
        'game:destroyed',
        'game:roundStarted',
        'game:roundEnded',
        'game:reset',
        'game:wheelSpun',
        'game:winnerSelected',

        // registry:* (agp-registry.js)
        'registry:gameRegistered'
    ];

    var DEBOUNCE_MS = 100;
    var _debounceTimer = null;
    var _subscribers = [];

    function getAGP() {
        return window.AymanGamesPlatform || null;
    }

    function notifySubscribers() {
        _subscribers.slice().forEach(function (callback) {
            try {
                callback();
            } catch (err) {
                console.error('[AGP Dashboard Live] Subscriber error:', err);
            }
        });
    }

    function scheduleNotify() {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function () {
            _debounceTimer = null;
            notifySubscribers();
        }, DEBOUNCE_MS);
    }

    function attachEventListeners() {
        var agp = getAGP();
        if (!agp || !agp.events || typeof agp.events.on !== 'function') {
            console.warn('[AGP Dashboard Live] AGP.events not available — live updates disabled.');
            return false;
        }

        LIVE_EVENT_NAMES.forEach(function (eventName) {
            agp.events.on(eventName, scheduleNotify);
        });

        return true;
    }

    NS.live = {
        // للاطلاع/الاختبار فقط (مثلاً من الـ Console)، غير مخصصة للتعديل.
        EVENT_NAMES: LIVE_EVENT_NAMES,

        // الاشتراك في "نبضة تحديث حي" موحّدة، تُستدعى مرة واحدة (مُجمَّعة)
        // بعد ورود أي حدث من LIVE_EVENT_NAMES.
        // @returns {Function} دالة لإلغاء الاشتراك
        subscribe: function (callback) {
            if (typeof callback !== 'function') return function () {};
            _subscribers.push(callback);
            return function unsubscribe() {
                var index = _subscribers.indexOf(callback);
                if (index !== -1) _subscribers.splice(index, 1);
            };
        }
    };

    var attached = attachEventListeners();

    // Default subscriber: re-render the current route on any live update.
    if (attached) {
        NS.live.subscribe(function () {
            if (NS.router && typeof NS.router.refresh === 'function') {
                NS.router.refresh();
            }
        });
    }

}(window.AGPDashboard));
