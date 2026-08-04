/**
 * ==========================================================================
 *  DASHBOARD LIVE UPDATES — تحديث حي عام للوحة التحكم عبر AGP.events فقط
 * ==========================================================================
 *
 * هذا الملف يجعل Dashboard "حياً": أي تغيير حقيقي يحدث على المنصة
 * (انضمام لاعب، بدء/انتهاء جولة، تسجيل لعبة جديدة، فتح/إغلاق تسجيل...)
 * يُعاد رسم الصفحة الحالية تلقائياً ليعكسه، دون أي Polling ودون أي تعديل
 * على ناقل الأحداث نفسه (`agp-events.js` لم يُلمَس إطلاقاً — لا `onAny`،
 * لا Wildcard، فقط استخدام `AGP.events.on(eventName, handler)` الموجودة
 * أصلاً لكل اسم حدث على حدة).
 *
 * ⚠️ قرار معماري متعمَّد (بدل Wildcard حقيقي في ناقل الأحداث):
 *   `LIVE_EVENT_NAMES` أدناه قائمة **صريحة وثابتة** بكل أسماء الأحداث
 *   الموثَّقة فعلياً اليوم في agp-events.js عبر الـ Namespaces التالية:
 *   `session:*`, `player:*`, `lobby:*`, `round:*`, `game:*`, `registry:*`.
 *   أي لعبة تصل مستقبلاً وتستخدم هذه الأحداث نفسها (تماماً كما تفعل
 *   الروليت اليوم) ستُحدِّث Dashboard تلقائياً دون أي تعديل هنا. أما أي
 *   Namespace **جديد كلياً** غير موجود بعد (مثل أحداث تيك توك حقيقية
 *   لاحقاً) فسيتطلب إضافة أسمائه لهذه القائمة عند إنشائه — قرار Wildcard
 *   حقيقي في ناقل الأحداث نفسه تُرك عمداً لمرحلة مستقلة لاحقة بناءً على
 *   طلب صريح.
 *
 * لماذا هذا التصميم "عام" وليس خاصاً بالروليت:
 *   لا يوجد هنا أي سطر يذكر 'roulette' أو أي لعبة بعينها. الملف يستمع
 *   فقط لأسماء أحداث AGP العامة (لا Namespace خاص بلعبة واحدة)، ويعيد
 *   رسم أي صفحة حالية عبر NS.router.refresh() — التي بدورها تقرأ بيانات
 *   حقيقية طازجة من AGP.gameManager (عبر dashboard-data.js الموجود
 *   أصلاً، بدون أي تعديل عليه). أي لعبة تيك توك مستقبلية تُبلِّغ عبر
 *   نفس أسماء الأحداث الموجودة (أو Namespace جديد يُضاف لاحقاً لهذه
 *   القائمة تحديداً) ستستفيد من هذا النظام تلقائياً دون أي كود إضافي
 *   خاص بها هنا.
 *
 * واجهة عامة قابلة لإعادة الاستخدام مستقبلاً (`NS.live.subscribe`):
 *   أي وحدة Dashboard قادمة (غير مبنية الآن — لا Widgets، لا Marketplace،
 *   لا Settings حقيقية) تستطيع الاشتراك في "نبضة تحديث حي" واحدة موحّدة
 *   دون معرفة تفاصيل AGP.events مباشرة ودون تسجيل مستمعين مكررة لنفس
 *   الأحداث:
 *     var unsubscribe = AGPDashboard.live.subscribe(function () { ... });
 *   إعادة رسم الصفحة الحالية (السلوك الافتراضي المطلوب الآن) هي نفسها
 *   مجرد أول مشترك مسجَّل هنا، وليست حالة خاصة مبنية داخل النظام.
 *
 * تجميع الأحداث المتلاحقة (Debounce):
 *   أحداث AGP كثيراً ما تصل متتالية جداً في نفس اللحظة المنطقية (مثال:
 *   `game:winnerSelected` ثم `game:roundEnded` تقريباً في نفس اللحظة).
 *   بدل إعادة رسم الصفحة عدة مرات متتالية بلا فائدة، تُجمَّع كل الأحداث
 *   الواردة خلال نافذة زمنية قصيرة جداً في إعادة رسم واحدة فقط.
 *
 * حماية دفاعية: لو لم يكن AGP.events متوفراً بعد (ترتيب تحميل خاطئ) أو
 * لم يكن NS.router متوفراً، الملف لا ينهار، فقط يُعطِّل نفسه بصمت مع
 * رسالة تحذير واحدة في الـ Console.
 *
 * يعتمد هذا الملف على وجود ../js/agp-core.js (لـ AGP.events) قبله، وعلى
 * js/dashboard-router.js (لـ NS.router.refresh) قبله. لا علاقة له بأي
 * ملف AGP آخر أو بأي لعبة.
 * ==========================================================================
 */

window.AGPDashboard = window.AGPDashboard || {};

(function (NS) {
    'use strict';

    /* ----------------------------------------------------------------
     * قائمة أسماء الأحداث الحية — صريحة، بدون Wildcard، قابلة للتوسعة
     * بإضافة أسماء جديدة فقط عند إنشائها فعلياً في وحدة AGP مقابلة.
     * ---------------------------------------------------------------- */
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

    /* ----------------------------------------------------------------
     * واجهة AGPDashboard.live العامة
     * ---------------------------------------------------------------- */
    NS.live = {

        // معروضة للاطلاع/الاختبار فقط (مثلاً من الـ Console)، وليست
        // مخصصة لتعديلها من خارج هذا الملف.
        EVENT_NAMES: LIVE_EVENT_NAMES,

        /**
         * الاشتراك في "نبضة تحديث حي" موحّدة، تُستدعى مرة واحدة (مُجمَّعة)
         * بعد ورود أي حدث من LIVE_EVENT_NAMES. أي وحدة Dashboard قادمة
         * (Widgets/Marketplace/Settings الحقيقية مستقبلاً) تستخدم هذه
         * الدالة بدل تسجيل مستمعين خاصين بها على AGP.events مباشرة.
         * @param {Function} callback
         * @returns {Function} دالة لإلغاء الاشتراك
         */
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

    // السلوك الافتراضي المطلوب الآن: إعادة رسم المسار الحالي عند أي
    // تحديث حي. هذا مجرد أول مشترك عادي في النظام أعلاه، وليس حالة
    // خاصة داخل AGPDashboard.live نفسه.
    if (attached) {
        NS.live.subscribe(function () {
            if (NS.router && typeof NS.router.refresh === 'function') {
                NS.router.refresh();
            }
        });
    }

}(window.AGPDashboard));
