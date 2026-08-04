/**
 * ==========================================================================
 *  AGP BOOTSTRAP — نقطة تهيئة المنصة
 * ==========================================================================
 *
 * هذا الملف هو آخر ملف يتم تحميله من ملفات المنصة، ومهمته الوحيدة هي
 * "تشغيل" المنصة بعد جاهزية الصفحة بالكامل، دون أي تأثير على وظائف
 * الموقع الحالية (الروليت، مين الامبوستر، مافيا، النوافذ المنبثقة،
 * عداد الزوار، تبديل بانر الاستريمر... كل ذلك يستمر بالعمل كما هو تماماً).
 *
 * يعتمد هذا الملف على تحميل الملفات التالية قبله بنفس الترتيب:
 *   1) js/agp-core.js
 *   2) js/agp-services.js
 *   3) js/agp-registry.js
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    /**
     * دالة التهيئة الرئيسية للمنصة.
     * تُستدعى مرة واحدة فقط بعد تحميل الصفحة بالكامل (DOMContentLoaded).
     */
    function initPlatform() {
        AGP.log('Initializing platform "' + AGP.config.platformName + '" v' + AGP.config.version + ' ...');

        // اكتشاف الألعاب الموجودة حالياً في الصفحة وتسجيلها داخل المنصة
        // (دون أي تعديل على شكلها أو رابط تشغيلها)
        if (AGP.registry && typeof AGP.registry._discoverGamesFromDOM === 'function') {
            AGP.registry._discoverGamesFromDOM();
        }

        // بث حدث عام يوضح أن المنصة جاهزة، لتستخدمه أي إضافات مستقبلية
        // (مثل واجهة إدارية أو أدوات تحليلية) دون الحاجة لتعديل هذا الملف
        AGP.events.emit('platform:ready', {
            platformName: AGP.config.platformName,
            version: AGP.config.version,
            games: AGP.registry.getAllGames()
        });

        AGP.log('Platform ready. Registered games:', AGP.registry.getAllGames().map(function (g) { return g.id; }));
    }

    // ندعم حالتين: إما أن الصفحة لا تزال قيد التحميل فننتظر الحدث،
    // أو أنها اكتملت بالفعل (نادراً عند تحميل الملف في نهاية <body>)
    // فنشغّل التهيئة مباشرة حتى لا تفوتنا اللحظة المناسبة.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlatform);
    } else {
        initPlatform();
    }

}(window.AymanGamesPlatform));
