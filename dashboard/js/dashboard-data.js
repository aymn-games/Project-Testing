/**
 * ==========================================================================
 *  DASHBOARD DATA — الآن يقرأ التصنيفات والألعاب فعلياً من AGP Platform
 * ==========================================================================
 *
 * ⚠️ هذه أول مرحلة من ربط Dashboard بمنصة AGP الحقيقية. النطاق محدود
 * صراحةً بـ **التصنيفات والألعاب فقط** — لا Widgets، لا Settings حقيقية،
 * لا Marketplace، لا اتصال بث. كل تلك تبقى كما هي (غير مربوطة).
 *
 * كيف يعمل الربط:
 *   - `AGP.gameManager.getRegisteredGames()` (موجودة أصلاً، بدون أي
 *     تعديل عليها) هي مصدر الحقيقة الوحيد للألعاب المسجَّلة فعلياً على
 *     المنصة. هذا الملف لا يخترع أي لعبة؛ يقرأ فقط ما هو مسجَّل حقاً.
 *   - AGP لا تملك مفهوم "تصنيفات" بحد ذاته (لا اسم عرض ولا سجل مركزي).
 *     الحل: كل لعبة تحمل الآن حقل `category` بسيط (معرّف نصي فقط، مثل
 *     'roulette-games') ضمن بيانات تسجيلها — أُضيف هذا الحقل تحديداً في
 *     games/roulette/agp-roulette.js لأن الربط تطلّب ذلك، وهو حقل إضافي
 *     بسيط لا يغيّر عقد Game API ولا أي منطق تشغيل حالي.
 *   - أسماء عرض التصنيفات (النص العربي المقروء) لا يوجد لها مكان في AGP
 *     إطلاقاً، فتبقى جدول عرض محلي بسيط هنا (`CATEGORY_LABELS`) — هذا
 *     ليس "بيانات وهمية" بمعنى اختلاق ألعاب أو تصنيفات غير موجودة، بل
 *     مجرد ترجمة عرض لمعرّف تصنيف حقيقي قادم من AGP.
 *
 * حماية دفاعية: لو فُتحت هذه الصفحة بمفردها بدون تحميل ملفات AGP (أو قبل
 * اكتمال تسجيل أي لعبة)، كل الدوال أدناه ترجع مصفوفات فارغة بدل الانهيار
 * — نفس فلسفة "حالة فارغة صادقة" المتّبعة في بقية Dashboard.
 *
 * الواجهة العامة (`NS.mockData.*`) لم تتغيّر ولا حرف واحد عن المرحلة
 * السابقة — نفس الأسماء والتوقيعات بالضبط، حتى لا يحتاج أي ملف آخر
 * (dashboard-layout.js, dashboard-pages.js) أي تعديل بسبب هذا الربط.
 * الاسم "mockData" أُبقي عليه للتوافق مع الاستدعاءات الحالية، رغم أن
 * البيانات الآن حقيقية فعلياً لا وهمية.
 * ==========================================================================
 */

window.AGPDashboard = window.AGPDashboard || {};

(function (NS) {
    'use strict';

    var CATEGORY_LABELS = {
        'roulette-games': 'ألعاب الروليت',
        'mafia-games': 'ألعاب المافيا',
        'guessing-games': 'ألعاب التخمين',
        'party-games': 'ألعاب الحفلات'
    };
    var UNCATEGORIZED_ID = 'uncategorized';
    var UNCATEGORIZED_LABEL = 'أخرى';

    function getAGP() {
        return window.AymanGamesPlatform || null;
    }

    function readRealGames() {
        var agp = getAGP();
        if (!agp || !agp.gameManager || typeof agp.gameManager.getRegisteredGames !== 'function') {
            return [];
        }

        var registeredGames = agp.gameManager.getRegisteredGames() || [];

        return registeredGames.map(function (game) {
            return {
                id: game.id,
                name: game.name || game.id,
                category: game.category || UNCATEGORIZED_ID
            };
        });
    }

    NS.mockData = {
        getCategories: function () {
            var games = readRealGames();
            var seenIds = {};
            var categories = [];

            games.forEach(function (game) {
                if (seenIds[game.category]) return;
                seenIds[game.category] = true;
                categories.push({
                    id: game.category,
                    name: CATEGORY_LABELS[game.category] || UNCATEGORIZED_LABEL
                });
            });

            return categories;
        },

        getGames: function () {
            return readRealGames();
        },

        getGamesByCategory: function (categoryId) {
            return readRealGames().filter(function (game) {
                return game.category === categoryId;
            });
        },

        getGameById: function (gameId) {
            var found = null;
            readRealGames().forEach(function (game) {
                if (game.id === gameId) found = game;
            });
            return found;
        }
    };

}(window.AGPDashboard));
