/**
 * AGP GAME BRIDGE — generic window.postMessage bridge for a game hosted
 * on a separate (possibly cross-origin) window. Generalized out of logic
 * originally embedded in games/roulette/agp-roulette.js: no game id,
 * origin, or source name is hardcoded — all passed as connect() options.
 *
 * connect() does 4 things: intercepts the play link click and opens the
 * game window itself (for a real window reference); waits for a "ready"
 * message from that window before calling onReady; forwards this game's
 * AGP.gameEngine lifecycle events (game:loaded/started/ended/destroyed by
 * default) to the game window via postMessage; and re-emits any message
 * type the game reports (via `reportedEvents`) through AGP.events.
 *
 * Usage from a game adapter (games/<id>/agp-<id>.js):
 *   var handle = AGP.gameBridge.connect({
 *     id: 'my-game',
 *     playLinkEl: someAnchorElement,
 *     incomingSource: 'agp-my-game-integration',
 *     reportedEvents: ['game:roundStarted', 'game:roundEnded', ...],
 *     onReady: function (gameWindow) { ... }  // optional, has a default
 *   });
 *   handle.disconnect();  // e.g. from the game's onDestroy
 *
 * Default onReady (if none passed): loads the game via
 * AGP.gameManager.loadGame(id) if not already current, then starts it via
 * AGP.gameEngine.start() if not already running.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }
    if (!AGP.events) {
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    var DEFAULT_OUTGOING_SOURCE = 'agp-platform';
    var DEFAULT_FORWARDED_EVENTS = ['game:loaded', 'game:started', 'game:ended', 'game:destroyed'];

    function defaultOnReady(id) {
        return function () {
            if (!AGP.gameManager || !AGP.gameEngine) return;

            var currentGame = AGP.gameManager.getCurrentGame();
            if (!currentGame || currentGame.id !== id) {
                AGP.gameManager.loadGame(id);
            }
            // isRunning()/start() aren't part of AGP.gameManager's facade,
            // so these go straight to AGP.gameEngine.
            if (!AGP.gameEngine.isRunning()) {
                AGP.gameEngine.start();
            }
        };
    }

    AGP.gameBridge = {

        /**
         * @param {Object} options
         *   - {string} id, {Element} playLinkEl, {string} incomingSource - required
         *   - {string} [outgoingSource='agp-platform']
         *   - {Array<string>} [forwardedEvents] - default: the 4 Game Engine lifecycle events
         *   - {Array<string>} [reportedEvents] - message types the game may report (default: [])
         *   - {Function} [onReady]
         * @returns {Object|null} { getGameWindow, sendToGameWindow, disconnect }, or null if a required option is missing
         */
        connect: function (options) {
            options = options || {};

            var id = options.id;
            var playLinkEl = options.playLinkEl;
            var incomingSource = options.incomingSource;
            var outgoingSource = options.outgoingSource || DEFAULT_OUTGOING_SOURCE;
            var forwardedEvents = options.forwardedEvents || DEFAULT_FORWARDED_EVENTS;
            var reportedEvents = options.reportedEvents || [];
            var onReady = (typeof options.onReady === 'function') ? options.onReady : defaultOnReady(id);

            if (!id || !playLinkEl || !incomingSource) {
                AGP.log('Game Bridge: cannot connect, missing required option(s) (id/playLinkEl/incomingSource).', options);
                return null;
            }

            var _gameWindow = null;
            var _gameOrigin = null;   // used as postMessage's targetOrigin

            function sendToGameWindow(type, payload) {
                if (!_gameWindow || _gameWindow.closed) return;
                try {
                    _gameWindow.postMessage({
                        source: outgoingSource,
                        type: type,
                        payload: payload || {}
                    }, _gameOrigin || '*');
                } catch (err) {
                    console.error('[AGP Game Bridge] Failed to postMessage to game window ("' + id + '"):', err);
                }
            }

            function handleMessageFromGameWindow(event) {
                if (!_gameWindow || event.source !== _gameWindow) return;

                var data = event.data;
                if (!data || data.source !== incomingSource || !data.type) return;

                if (data.type === 'ready') {
                    AGP.log('Game Bridge: "' + id + '" window signaled ready.');
                    onReady(_gameWindow);
                    return;
                }

                if (reportedEvents.indexOf(data.type) !== -1) {
                    var payload = data.payload || {};
                    payload.id = id;

                    AGP.log('Game Bridge: "' + id + '" reported "' + data.type + '".', payload);
                    AGP.events.emit(data.type, payload);
                }
            }

            function handlePlayButtonClick(event) {
                var url = playLinkEl.getAttribute('href');
                if (!url) return;

                event.preventDefault();

                _gameWindow = window.open(url, '_blank');
                try {
                    _gameOrigin = new URL(url, window.location.href).origin;
                } catch (err) {
                    _gameOrigin = null;
                }

                if (!_gameWindow) {
                    AGP.log('Game Bridge: window.open() was blocked for "' + id + '" (popup blocker?).');
                }
            }

            playLinkEl.addEventListener('click', handlePlayButtonClick);
            window.addEventListener('message', handleMessageFromGameWindow);

            // تمرير أحداث دورة حياة Game Engine (الخاصة بهذه اللعبة فقط،
            // بمقارنة payload.id) إلى نافذة اللعبة الفعلية.
            forwardedEvents.forEach(function (eventName) {
                AGP.events.on(eventName, function (payload) {
                    if (!payload || payload.id !== id) return;
                    sendToGameWindow(eventName, payload);
                });
            });

            AGP.log('Game Bridge: connected for "' + id + '".');

            return {
                getGameWindow: function () { return _gameWindow; },
                sendToGameWindow: sendToGameWindow,

                /**
                 * قطع الاتصال: إزالة مستمعي النقر والرسائل، وتفريغ مرجع
                 * النافذة. لا يُلغي تسجيل اللعبة من Game API؛ تلك مسؤولية
                 * منفصلة تماماً (AGP.gameAPI.unregister أو onDestroy).
                 */
                disconnect: function () {
                    playLinkEl.removeEventListener('click', handlePlayButtonClick);
                    window.removeEventListener('message', handleMessageFromGameWindow);
                    _gameWindow = null;
                    _gameOrigin = null;
                    AGP.log('Game Bridge: disconnected for "' + id + '".');
                }
            };
        }
    };

    AGP.log('AGP Game Bridge loaded — generic postMessage bridge for externally-hosted games.');

}(window.AymanGamesPlatform));
