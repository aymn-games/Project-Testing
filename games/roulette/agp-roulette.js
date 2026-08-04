/**
 * ==========================================================================
 *  AGP ROULETTE ADAPTER — ربط لعبة "روليت القبائل" بمنصة AGP
 * ==========================================================================
 *
 * هذا الملف يربط لعبة موجودة فعلاً بالمنصة عبر Game API و Game Engine،
 * دون أي تعديل على منطق اللعبة نفسها أو نسخه.
 *
 * ⚠️ طبيعة الربط: لعبة "روليت القبائل" لا تعيش داخل هذا المشروع؛ هي
 *   موقع مستقل مستضاف على عنوان خارجي منفصل
 *   (https://aymn-games.github.io/roulette-game/) ويُفتح في تبويب جديد.
 *   لا يوجد وصول لكود اللعبة نفسه من هنا، وبالتالي لا يمكن استدعاء أي
 *   دالة داخلية من داخل اللعبة مباشرة.
 *
 * ⚠️ تحديث معماري: منطق الاتصال عبر postMessage (فتح النافذة، تمرير
 *   أحداث دورة الحياة، استقبال أحداث اللعبة) لم يعد مكتوباً هنا؛ استُخرج
 *   بالكامل إلى `js/agp-game-bridge.js` كطبقة عامة قابلة لإعادة الاستخدام
 *   من أي لعبة مستقبلية (بما فيها ألعاب تيك توك القادمة). هذا الملف
 *   أصبح الآن مجرد "تسجيل + اتصال" رقيق فوق تلك الطبقة العامة:
 *     - يسجّل الروليت في Game API عبر AGP.gameManager (كما كان).
 *     - يفتح اتصال جسر واحد عبر AGP.gameBridge.connect(...) بخيارات
 *       الروليت تحديداً (معرّفها، رابط لعبها، واسم `source` الذي تستخدمه
 *       طبقة `agp-integration.js` الخاصة بها في مستودعها الخارجي).
 *   لا تغيير في السلوك الفعلي أو بروتوكول الاتصال مع اللعبة — نفس أسماء
 *   `source` (`agp-platform` / `agp-roulette-integration`)، نفس أحداث
 *   دورة الحياة الممرَّرة، ونفس أحداث اللعبة المُستقبَلة بالضبط.
 *
 * تذكير بآلية الاتصال (تفاصيلها الكاملة الآن في agp-game-bridge.js):
 *   1) اعتراض نقرة "العب الآن"، فتح نافذة حقيقية عبر window.open().
 *   2) عند استقبال رسالة "ready" من agp-integration.js (داخل مستودع
 *      الروليت)، يُستدعى AGP.gameManager.loadGame() ثم
 *      AGP.gameEngine.start() تلقائياً (سلوك AGP.gameBridge الافتراضي).
 *   3) أحداث AGP.gameEngine (`game:loaded/started/ended/destroyed`) تُمرَّر
 *      كرسائل postMessage لنافذة اللعبة، حيث تستقبلها agp-integration.js
 *      وتُحوِّلها لاستدعاء onLoad/onRoundStart/onRoundEnd/onDestroy هناك.
 *   4) أحداث اللعبة المُبلَّغة (game:roundStarted/roundEnded/reset/
 *      wheelSpun/winnerSelected) تُبثّ مباشرة عبر AGP.events.emit(...).
 *
 * اختبار سريع من الـ Console (بعد تحميل الصفحة بالكامل):
 *   1. اضغط زر "العب الآن" في بطاقة الروليت (يفتح نافذة جديدة ويُحمِّل
 *      ويُشغِّل اللعبة تلقائياً فور جاهزيتها فعلياً).
 *   2. AGP.events.on('game:wheelSpun', console.log);  // راقب أحداث اللعبة
 *   3. AGP.gameEngine.stop();     // يرسل onRoundEnd فعلياً للعبة المفتوحة
 *   4. AGP.gameEngine.destroy();  // يرسل onDestroy فعلياً للعبة المفتوحة
 *
 * يعتمد هذا الملف على وجود js/agp-core.js, js/agp-events.js,
 * js/agp-registry.js, js/agp-game-api.js, js/agp-game-engine.js,
 * js/agp-game-manager.js, js/agp-game-bridge.js قبله.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    var GAME_ID = 'roulette-game';

    // نوع رسائل بروتوكول الاتصال مع مستودع الروليت (agp-integration.js
    // هناك) — يُمرَّر كخيار لـ AGP.gameBridge.connect بدل أن يعرفه الجسر
    // العام نفسه. نفس القيمة بالضبط المستخدمة سابقاً قبل استخراج الجسر.
    var GAME_INTEGRATION_SOURCE = 'agp-roulette-integration';

    // أنواع الرسائل التي تُرسِلها اللعبة نفسها (Game → Platform)، وتُبثّ
    // كما هي عبر AGP.events دون أي تفسير أو منطق إضافي. نفس القائمة
    // بالضبط المستخدمة سابقاً قبل استخراج الجسر.
    var GAME_REPORTED_EVENTS = [
        'game:roundStarted',
        'game:roundEnded',
        'game:reset',
        'game:wheelSpun',
        'game:winnerSelected'
    ];

    // حماية بسيطة في حال تم تحميل هذا الملف قبل agp-core.js بالخطأ
    if (!AGP.log) {
        AGP.log = function () {};
    }
    if (!AGP.events) {
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    var _registered = false;
    var _bridgeHandle = null;

    /**
     * تسجيل لعبة الروليت داخل Game API، وفتح اتصال جسر postMessage
     * عام (AGP.gameBridge) بينها وبين المنصة.
     */
    function registerRouletteGame() {
        if (_registered) return;

        if (!AGP.gameManager || typeof AGP.gameManager.registerGame !== 'function') {
            AGP.log('Roulette Adapter: Game Manager not available, cannot register.');
            return;
        }
        if (!AGP.gameBridge || typeof AGP.gameBridge.connect !== 'function') {
            AGP.log('Roulette Adapter: Game Bridge not available, cannot connect.');
            return;
        }

        var registryEntry = (AGP.registry && typeof AGP.registry.getGame === 'function')
            ? AGP.registry.getGame(GAME_ID)
            : null;

        if (!registryEntry) {
            AGP.log('Roulette Adapter: no matching .game-card found for "' + GAME_ID + '" yet.');
        }

        // العثور على زر "العب الآن" الفعلي داخل بطاقة اللعبة الحالية،
        // دون أي تعديل على شكله أو رابطه أو نصه.
        var playLinkEl = (registryEntry && registryEntry.domElement)
            ? registryEntry.domElement.querySelector('.btn-play')
            : null;

        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: registryEntry ? registryEntry.title : 'روليت القبائل',
            url: registryEntry ? registryEntry.url : 'https://aymn-games.github.io/roulette-game/',

            // حقل إضافي بسيط (لا يغيّر عقد Game API القائم؛ normalizeGame()
            // في agp-game-api.js ينسخ أي حقل موجود على كائن اللعبة كما هو
            // أصلاً) — يُستخدَم حصراً من AGP Dashboard لتصنيف اللعبة في
            // القائمة الجانبية وصفحة التصنيف، دون أي أثر على منطق اللعبة
            // أو محرك التشغيل نفسه.
            category: 'roulette-games',

            // ملاحظة: هذه الدوال تمثّل السجل المحلي لدى المنصة نفسها
            // (تسجيل/تصحيح فقط)، وهي منفصلة عن جسر الاتصال أدناه الذي
            // يُبلِّغ اللعبة الفعلية بنفس هذه الأحداث بالضبط.
            onLoad: function () {
                AGP.log('Roulette Adapter: onLoad — "' + GAME_ID + '" loaded inside AGP Platform.');
            },
            onRoundStart: function () {
                AGP.log('Roulette Adapter: onRoundStart — "' + GAME_ID + '" started.');
            },
            onRoundEnd: function () {
                AGP.log('Roulette Adapter: onRoundEnd — "' + GAME_ID + '" ended.');
            },
            onDestroy: function () {
                if (_bridgeHandle) {
                    _bridgeHandle.disconnect();
                    _bridgeHandle = null;
                }
                AGP.log('Roulette Adapter: onDestroy — cleaned up.');
            }
        });

        if (registered) {
            _registered = true;
            AGP.log('Roulette Adapter: "' + GAME_ID + '" registered successfully in Game API.');
        }

        if (playLinkEl) {
            // فتح الجسر العام: نفس المعرّف، نفس رابط اللعب، نفس بروتوكول
            // الأسماء (source) وأحداث اللعبة المُبلَّغة كما كانت قبل
            // الاستخراج — فقط عبر الطبقة العامة الآن بدل تكرار الكود.
            _bridgeHandle = AGP.gameBridge.connect({
                id: GAME_ID,
                playLinkEl: playLinkEl,
                incomingSource: GAME_INTEGRATION_SOURCE,
                reportedEvents: GAME_REPORTED_EVENTS
                // outgoingSource/forwardedEvents/onReady: القيم الافتراضية
                // في agp-game-bridge.js تطابق تماماً ما كان مكتوباً هنا
                // يدوياً سابقاً (agp-platform + أحداث Game Engine الأربعة
                // + تحميل/تشغيل تلقائي عند "ready").
            });
        } else {
            AGP.log('Roulette Adapter: no .btn-play element found, cannot connect Game Bridge.');
        }
    }

    /**
     * ⚠️ إضافة جديدة: تمرير أي لاعب انضم فعلياً عبر AGP (تعليق تيك توك
     * طابق الكلمة المفتاحية، أو أي مصدر آخر مستقبلي) إلى نافذة اللعبة
     * المفتوحة فعلياً — عبر sendToGameWindow العامة أصلاً في
     * agp-game-bridge.js (Core لم يُلمَس). تحاكي اللعبة طرفها بمحاكاة
     * نفس مسار الإضافة اليدوي (راجع agp-integration.js داخل مستودعها)،
     * فلا حاجة لأي تعديل على script.js هناك أيضاً.
     */
    AGP.events.on('player:joined', function (payload) {
        if (!_bridgeHandle || !payload || !payload.player) return;

        var current = AGP.gameManager.getCurrentGame();
        if (!current || current.id !== GAME_ID) return; // ليست الروليت اللعبة النشطة حالياً

        _bridgeHandle.sendToGameWindow('game:addPlayer', { name: payload.player.name || payload.player.id });
    });

    // التسجيل الطبيعي يحدث بعد بث 'platform:ready' (أي بعد اكتشاف كل
    // بطاقات الألعاب فعلياً من الصفحة عبر agp-registry.js).
    AGP.events.on('platform:ready', registerRouletteGame);

    // حالة دفاعية نادرة: لو كانت الصفحة جاهزة بالفعل وبيانات البطاقة
    // متوفرة أصلاً وقت تنفيذ هذا الملف، نحاول التسجيل مباشرة أيضاً.
    if (document.readyState !== 'loading' &&
        AGP.registry && typeof AGP.registry.getGame === 'function' &&
        AGP.registry.getGame(GAME_ID)) {
        registerRouletteGame();
    }

}(window.AymanGamesPlatform));
