/**
 * DASHBOARD DATA — يقرأ التصنيفات والألعاب فعلياً من AGP Platform عبر
 * AGP.gameManager.getRegisteredGames(). النطاق محدود صراحةً بالتصنيفات
 * والألعاب فقط — لا Widgets، لا Settings حقيقية، لا Marketplace.
 *
 * AGP لا تملك مفهوم "تصنيفات" بحد ذاته؛ كل لعبة تحمل حقل `category` نصي
 * بسيط (مثل 'roulette-games')، وأسماء العرض العربية تبقى جدول ترجمة
 * محلي هنا (`CATEGORY_LABELS`). الاسم "mockData" أُبقي عليه للتوافق مع
 * الاستدعاءات الحالية رغم أن البيانات حقيقية لا وهمية.
 *
 * لو فُتحت الصفحة بدون تحميل ملفات AGP، كل الدوال أدناه ترجع مصفوفات
 * فارغة بدل الانهيار.
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
