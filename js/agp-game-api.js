/**
 * AGP GAME API — the unified contract any game registers against.
 * Defines the game-object shape and wires platform events straight
 * through to the active game's hooks, with no game logic of its own.
 *
 * Different from agp-registry.js: that file discovers display cards
 * (.game-card) in index.html; this file is about how a game talks to the
 * platform programmatically via a Game Object with a lifecycle,
 * independent of how it's displayed.
 *
 * Expected game object shape (all hook functions optional — missing ones
 * are backfilled as no-ops):
 *   {
 *     id: 'roulette-game',        // required, matches data-agp-game-id
 *     name: '...',                // optional
 *     onLoad: function () {},          // AGP.gameEngine.loadGame(), not registration
 *     onLobbyOpen: function () {},     // lobby:opened
 *     onLobbyClose: function () {},    // lobby:closed
 *     onRoundStart: function () {},    // session:roundStarted
 *     onRoundEnd: function () {},      // session:roundFinished
 *     onPlayerJoin: function () {},    // player:joined
 *     onPlayerLeave: function () {},   // player:removed
 *     onDestroy: function () {}        // on unregister
 *   }
 *
 * Requires js/agp-core.js, js/agp-events.js, and preferably
 * js/agp-session.js, js/agp-player-manager.js, js/agp-lobby.js loaded first.
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

    var LIFECYCLE_HOOKS = [
        'onLoad',
        'onLobbyOpen',
        'onLobbyClose',
        'onRoundStart',
        'onRoundEnd',
        'onPlayerJoin',
        'onPlayerLeave',
        'onDestroy'
    ];

    var _games = {};
    var _currentGameId = null;

    /** Backfills any missing lifecycle hook with a no-op. */
    function normalizeGame(game) {
        var normalized = {};

        Object.keys(game).forEach(function (key) {
            normalized[key] = game[key];
        });

        LIFECYCLE_HOOKS.forEach(function (hookName) {
            if (typeof normalized[hookName] !== 'function') {
                normalized[hookName] = function () {};
            }
        });

        return normalized;
    }

    function safeCallHook(game, hookName, payload) {
        if (!game || typeof game[hookName] !== 'function') return;
        try {
            game[hookName](payload);
        } catch (err) {
            console.error('[AGP Game API] Error in "' + game.id + '.' + hookName + '()":', err);
        }
    }

    /** Shared guard (defined once, here or in agp-game-engine.js,
     * whichever loads first) preventing onRoundStart/onRoundEnd from
     * firing twice for the same game when both files react to the same
     * underlying event. */
    if (!AGP._shouldNotifyRoundHook) {
        AGP._roundHookGuard = {};
        AGP._shouldNotifyRoundHook = function (gameId, hookName) {
            if (!gameId) return true;
            if (AGP._roundHookGuard[gameId] === hookName) return false;
            AGP._roundHookGuard[gameId] = hookName;
            return true;
        };
    }

    AGP.gameAPI = {

        LIFECYCLE_HOOKS: LIFECYCLE_HOOKS,

        register: function (game) {
            if (!game || !game.id) {
                AGP.log('Game API: registration rejected, missing game id.', game);
                return false;
            }

            if (_games[game.id]) {
                AGP.log('Game API: a game with id "' + game.id + '" is already registered.');
                return false;
            }

            var normalizedGame = normalizeGame(game);
            _games[game.id] = normalizedGame;

            AGP.log('Game API: game registered', game.id);
            AGP.events.emit('game:registered', { id: game.id, game: normalizedGame });

            // onLoad() is not called here — registering is separate from
            // actually loading (AGP.gameEngine.loadGame), so it only fires once.

            return true;
        },

        unregister: function (id) {
            var game = _games[id];
            if (!game) {
                AGP.log('Game API: cannot unregister, no game found with id', id);
                return false;
            }

            safeCallHook(game, 'onDestroy');

            delete _games[id];
            if (_currentGameId === id) {
                _currentGameId = null;
            }

            AGP.log('Game API: game unregistered', id);
            AGP.events.emit('game:unregistered', { id: id });

            return true;
        },

        getGame: function (id) {
            return _games[id] || null;
        },

        getAllGames: function () {
            return Object.keys(_games).map(function (id) {
                return _games[id];
            });
        },

        setCurrentGame: function (id) {
            if (!_games[id]) {
                AGP.log('Game API: cannot set current game, no game found with id', id);
                return false;
            }

            var previousId = _currentGameId;
            _currentGameId = id;

            AGP.log('Game API: current game set to', id);
            AGP.events.emit('game:currentChanged', { previousId: previousId, id: id });

            return true;
        },

        getCurrentGame: function () {
            return _currentGameId ? (_games[_currentGameId] || null) : null;
        }
    };

    /* Pass-through wiring: each listener just forwards the event to the
     * matching hook on the current game, no logic of its own. */
    AGP.events.on('lobby:opened', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onLobbyOpen', payload);
    });

    AGP.events.on('lobby:closed', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onLobbyClose', payload);
    });

    AGP.events.on('player:joined', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onPlayerJoin', payload);
    });

    AGP.events.on('player:removed', function (payload) {
        safeCallHook(AGP.gameAPI.getCurrentGame(), 'onPlayerLeave', payload);
    });

    AGP.events.on('session:roundStarted', function (payload) {
        var currentGame = AGP.gameAPI.getCurrentGame();
        if (currentGame && !AGP._shouldNotifyRoundHook(currentGame.id, 'onRoundStart')) return;
        safeCallHook(currentGame, 'onRoundStart', payload);
    });

    AGP.events.on('session:roundFinished', function (payload) {
        var currentGame = AGP.gameAPI.getCurrentGame();
        if (currentGame && !AGP._shouldNotifyRoundHook(currentGame.id, 'onRoundEnd')) return;
        safeCallHook(currentGame, 'onRoundEnd', payload);
    });

    AGP.log('AGP Game API skeleton loaded (unified game contract, no Game Engine/round logic yet).');

}(window.AymanGamesPlatform));
