/**
 * AGP ROULETTE ADAPTER — ربط لعبة "روليت القبائل" بمنصة AGP.
 *
 * اللعبة لا تعيش داخل هذا المشروع؛ موقع مستقل مستضاف خارجياً
 * (https://aymn-games.github.io/roulette-game/) يُفتح في تبويب جديد.
 * لا وصول لكودها من هنا. منطق الاتصال عبر postMessage (فتح النافذة،
 * تمرير أحداث دورة الحياة، استقبال أحداث اللعبة) موجود في
 * js/agp-game-bridge.js؛ هذا الملف مجرد تسجيل + اتصال رقيق فوقه.
 *
 * يعتمد على js/agp-core.js, agp-events.js, agp-registry.js,
 * agp-game-api.js, agp-game-engine.js, agp-game-manager.js,
 * agp-game-bridge.js قبله.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    var GAME_ID = 'roulette-game';

    // source name used by agp-integration.js inside the roulette repo.
    var GAME_INTEGRATION_SOURCE = 'agp-roulette-integration';

    // Message types the game itself sends (Game → Platform); rebroadcast
    // as-is via AGP.events with no extra interpretation.
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

    // تسجيل لعبة الروليت داخل Game API، وفتح اتصال جسر postMessage عام.
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

        var playLinkEl = (registryEntry && registryEntry.domElement)
            ? registryEntry.domElement.querySelector('.btn-play')
            : null;

        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: registryEntry ? registryEntry.title : 'روليت القبائل',
            url: registryEntry ? registryEntry.url : 'https://aymn-games.github.io/roulette-game/',
            category: 'roulette-games',

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
            _bridgeHandle = AGP.gameBridge.connect({
                id: GAME_ID,
                playLinkEl: playLinkEl,
                incomingSource: GAME_INTEGRATION_SOURCE,
                reportedEvents: GAME_REPORTED_EVENTS
            });
        } else {
            AGP.log('Roulette Adapter: no .btn-play element found, cannot connect Game Bridge.');
        }
    }

    // Forwards any player who joined via AGP to the open game window.
    AGP.events.on('player:joined', function (payload) {
        if (!_bridgeHandle || !payload || !payload.player) return;

        var current = AGP.gameManager.getCurrentGame();
        if (!current || current.id !== GAME_ID) return;

        _bridgeHandle.sendToGameWindow('game:addPlayer', { name: payload.player.name || payload.player.id });
    });

    AGP.events.on('platform:ready', registerRouletteGame);

    // Defensive fallback: page already loaded and card data available
    // by the time this file runs.
    if (document.readyState !== 'loading' &&
        AGP.registry && typeof AGP.registry.getGame === 'function' &&
        AGP.registry.getGame(GAME_ID)) {
        registerRouletteGame();
    }

}(window.AymanGamesPlatform));
