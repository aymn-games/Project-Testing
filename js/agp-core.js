/**
 * ==========================================================================
 *  AGP CORE — النواة الأساسية لمنصة "ألعاب أيمن" (AymanGamesPlatform)
 * ==========================================================================
 *
 * هذا الملف هو نقطة البداية لتحويل الموقع تدريجياً من "صفحة ألعاب" إلى
 * "منصة ألعاب" حقيقية قابلة للتوسع، دون أي تأثير على شكل أو وظائف الموقع
 * الحالية.
 *
 * ملاحظات مهمة:
 *  - هذا الملف لا يغيّر أي شيء في الصفحة الحالية عند تحميله فقط.
 *  - كل ما بداخله عبارة عن "بنية تحتية" (Infrastructure) يُبنى عليها
 *    لاحقاً في مراحل قادمة (Cloudflare Workers, WebSocket, Live Chat...).
 *  - أي كود جديد يجب أن يوضع داخل الـ Namespace التالي فقط، ولا يجب أبداً
 *    الكتابة مباشرة على window أو على متغيرات الصفحة الحالية.
 *
 * ترتيب تحميل ملفات المنصة في index.html:
 *   1) js/agp-core.js       <-- (هذا الملف) Namespace + Config + Event Bus
 *   2) js/agp-services.js   <-- هياكل الخدمات المستقبلية (فارغة حالياً)
 *   3) js/agp-registry.js   <-- سجل الألعاب
 *   4) js/agp-bootstrap.js  <-- نقطة تشغيل المنصة عند تحميل الصفحة
 * ==========================================================================
 */

/* --------------------------------------------------------------------
 * 1) Platform Namespace
 * --------------------------------------------------------------------
 * كل شيء يخص المنصة يوضع داخل هذا الكائن الرئيسي فقط، حتى لا يتعارض مع
 * أي كود حالي أو مستقبلي في الصفحة (مثل togglePolicyModal, toggleDescription).
 *
 * نستخدم "window.AymanGamesPlatform = window.AymanGamesPlatform || {}"
 * بدلاً من إنشاء كائن جديد مباشرة، حتى لو تم تحميل هذا الملف أكثر من مرة
 * بالخطأ، لا يتم فقدان أي بيانات مسجّلة مسبقاً.
 * ------------------------------------------------------------------ */
window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    /* ----------------------------------------------------------------
     * ⚠️ إصلاح تدقيق (قبل تكامل تيك توك): كانت debug: true مضبوطة ثابتة
     * دون أي طريقة فعلية لتعطيلها في الإنتاج — أي AGP.events.emit()
     * كان يطبع في الـ Console دائماً. تحت حركة تيك توك حقيقية (تعليقات/
     * هدايا بمعدل عالٍ) هذا يُبطئ الصفحة فعلياً. القيمة الافتراضية الآن
     * تُحسَب من بيئة التشغيل نفسها (بدون أي إعداد بناء/Build Tool جديد):
     *   - معطّلة افتراضياً على أي نطاق حقيقي (إنتاج).
     *   - مفعّلة تلقائياً على localhost/127.0.0.1 (تطوير محلي).
     *   - يمكن فرضها صراحة عبر ?agpDebug=1 أو ?agpDebug=0 في الرابط،
     *     بغضّ النظر عن النطاق.
     * AGP.setDebug(bool) متاحة أيضاً للتحكم اليدوي وقت التشغيل (من
     * الـ Console مثلاً)، دون تغيير طريقة قراءة AGP.config.debug في أي
     * مكان آخر بالمنصة.
     * ---------------------------------------------------------------- */
    function computeDefaultDebug() {
        try {
            if (typeof window === 'undefined' || !window.location) return false;

            var search = window.location.search || '';
            var match = /[?&]agpDebug=([^&]*)/.exec(search);
            if (match) {
                var value = decodeURIComponent(match[1]);
                return value !== '0' && value !== 'false';
            }

            var host = window.location.hostname;
            return !host || host === 'localhost' || host === '127.0.0.1';
        } catch (err) {
            return false;
        }
    }

    /* ----------------------------------------------------------------
     * 2) Platform Config
     * ----------------------------------------------------------------
     * إعدادات عامة للمنصة يمكن تعديلها بسهولة مستقبلاً دون البحث داخل
     * الكود. أي جزء آخر من المنصة يجب أن يقرأ من هنا بدلاً من كتابة
     * قيم ثابتة (Hardcoded) في أماكن متفرقة.
     * ---------------------------------------------------------------- */
    AGP.config = {
        // اسم المنصة (يُستخدم لاحقاً في أي واجهات إدارية أو رسائل تسجيل)
        platformName: 'AymanGamesPlatform',

        // نسخة بنية المنصة الداخلية (Platform Architecture Version)
        // يُفضّل ترقيتها مع كل مرحلة تطوير جديدة (0.x أثناء التأسيس)
        version: '0.1.0',

        // وضع التصحيح: عند تفعيله تُطبع رسائل توضيحية في الـ Console
        // تساعد في متابعة عمل المنصة أثناء التطوير. القيمة الافتراضية
        // تُحسَب تلقائياً (راجع computeDefaultDebug أعلاه) بدل ثابتة
        // true دائماً — آمنة للإنتاج افتراضياً.
        debug: computeDefaultDebug(),

        // مفاتيح تفعيل/تعطيل الميزات (Feature Flags)
        // كل ميزة مستقبلية تُضاف هنا أولاً بقيمة false، ثم تُفعّل عند
        // اكتمال تنفيذها الفعلي في مرحلة لاحقة. هذا يسمح بإضافة الكود
        // الخاص بالميزة مبكراً دون تفعيلها فعلياً على المستخدمين.
        features: {
            realtimeSync: false,
            tiktokLive: false,
            youtubeLive: false,
            twitchLive: false,
            cloudflareWorkers: false,
            durableObjects: false,
            liveChatProviders: false
        }
    };

    /**
     * أداة تسجيل داخلية بسيطة تحترم وضع Debug Mode.
     * تُستخدم داخل كل ملفات المنصة بدلاً من console.log مباشرة، حتى يسهل
     * إيقاف كل رسائل التصحيح دفعة واحدة من مكان واحد (AGP.config.debug).
     */
    AGP.log = function () {
        if (!AGP.config.debug) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[' + AGP.config.platformName + ']');
        console.log.apply(console, args);
    };

    /**
     * تحكّم يدوي صريح بوضع التصحيح وقت التشغيل (مثلاً من الـ Console)،
     * دون الحاجة لإعادة تحميل الصفحة برابط مختلف. لا تغيّر طريقة قراءة
     * AGP.config.debug في أي ملف آخر — كلها تستمر بقراءته كما هو.
     * @param {boolean} enabled
     */
    AGP.setDebug = function (enabled) {
        AGP.config.debug = !!enabled;
    };

    /* ----------------------------------------------------------------
     * 3) Event Bus (نظام أحداث داخلي بسيط)
     * ----------------------------------------------------------------
     * بنية تحتية بسيطة لنمط Publish/Subscribe داخل المتصفح فقط، بدون
     * أي اتصال شبكي حقيقي (بدون WebSocket، وبدون أي اتصال فعلي بـ TikTok
     * أو غيره في هذه المرحلة). الهدف منها هو توحيد طريقة تواصل أجزاء
     * المنصة مع بعضها البعض مستقبلاً (مثل: عند انضمام لاعب، عند بدء
     * جولة، عند استقبال هدية بث مباشر... إلخ).
     *
     * أمثلة استخدام مستقبلية (غير مفعّلة الآن):
     *   AGP.events.on('room:playerJoined', function(payload) {...});
     *   AGP.events.emit('room:playerJoined', { playerId: 'abc' });
     * ---------------------------------------------------------------- */
    function EventBus() {
        // كائن داخلي يحتفظ بقوائم المستمعين لكل اسم حدث
        this._listeners = {};
    }

    /**
     * تسجيل مستمع (listener) لحدث معيّن.
     * @param {string} eventName - اسم الحدث، مثل 'room:created'
     * @param {Function} handler - الدالة التي تُستدعى عند حدوث الحدث
     * @returns {Function} دالة لإلغاء الاشتراك (Unsubscribe) بسهولة
     */
    EventBus.prototype.on = function (eventName, handler) {
        if (typeof handler !== 'function') return function () {};
        if (!this._listeners[eventName]) {
            this._listeners[eventName] = [];
        }
        this._listeners[eventName].push(handler);

        var listeners = this._listeners[eventName];
        return function unsubscribe() {
            var index = listeners.indexOf(handler);
            if (index !== -1) listeners.splice(index, 1);
        };
    };

    /**
     * إلغاء تسجيل مستمع محدد من حدث معيّن.
     */
    EventBus.prototype.off = function (eventName, handler) {
        if (!this._listeners[eventName]) return;
        var index = this._listeners[eventName].indexOf(handler);
        if (index !== -1) this._listeners[eventName].splice(index, 1);
    };

    /**
     * بث حدث لكل المستمعين المسجّلين عليه.
     * @param {string} eventName
     * @param {*} [payload] - أي بيانات إضافية تُرسل مع الحدث
     */
    EventBus.prototype.emit = function (eventName, payload) {
        AGP.log('Event emitted:', eventName, payload);
        var handlers = this._listeners[eventName];
        if (!handlers || handlers.length === 0) return;

        // ننسخ المصفوفة قبل التكرار عليها لتفادي مشاكل لو تم إلغاء
        // الاشتراك من داخل أحد المستمعين نفسه أثناء التنفيذ
        handlers.slice().forEach(function (handler) {
            try {
                handler(payload);
            } catch (err) {
                console.error('[' + AGP.config.platformName + '] Event handler error for "' + eventName + '":', err);
            }
        });
    };

    // نسخة واحدة مشتركة من ناقل الأحداث لكل المنصة
    AGP.events = new EventBus();

    /* ----------------------------------------------------------------
     * 4) Future Hooks (نقاط ربط مستقبلية)
     * ----------------------------------------------------------------
     * هذه مجرد "أماكن محجوزة" (Placeholders) لمراحل قادمة من تطوير
     * المنصة. لا يوجد بداخلها أي تنفيذ فعلي الآن، وهي لا تُشغّل أي
     * اتصال شبكي أو خدمة خارجية بأي شكل من الأشكال في هذه المرحلة.
     *
     * الهدف منها فقط هو تجهيز "أسماء" و"مكان" واضح في بنية المنصة، حتى
     * عند بدء تنفيذ هذه المراحل مستقبلاً يكون معروفاً أين يجب أن تُضاف
     * كل قطعة، دون الحاجة لإعادة هيكلة المشروع من جديد.
     * ---------------------------------------------------------------- */
    AGP.hooks = {
        // سيُستخدم مستقبلاً للاتصال بخدمات Cloudflare Workers (لا يوجد تنفيذ الآن)
        cloudflareWorkers: null,

        // سيُستخدم مستقبلاً لإدارة الغرف الحية عبر Durable Objects (لا يوجد تنفيذ الآن)
        durableObjects: null,

        // سيُستخدم مستقبلاً لإنشاء اتصال WebSocket حقيقي بين اللاعبين (لا يوجد تنفيذ الآن)
        webSocket: null,

        // سيُستخدم مستقبلاً لمزامنة حالة اللعبة لحظياً بين كل اللاعبين (لا يوجد تنفيذ الآن)
        realtimeSync: null,

        // قائمة مزوّدي الدردشة المباشرة المستقبليين (تيك توك / يوتيوب / تويتش)
        // كل عنصر مستقبلاً سيكون عبارة عن Adapter موحّد الشكل (لا يوجد تنفيذ الآن)
        liveChatProviders: []
    };

    AGP.log('AGP Core loaded — version', AGP.config.version);

}(window.AymanGamesPlatform));
