/**
 * AGP GAME ENGINE (minimal) — manages a single loaded game's lifecycle:
 * load, start, stop, destroy. No per-game logic, no round management.
 *
 * AGP.gameAPI is the registry (register/unregister); this engine loads a
 * game already registered there (via getGame(id)) and calls its lifecycle
 * hooks, also calling AGP.gameAPI.setCurrentGame(id) on load so both
 * modules agree on the active game. onLoad() fires here (on loadGame()),
 * not at registration, so it only fires once.
 *
 * start()/stop() call onRoundStart/onRoundEnd directly (originally for
 * manual console testing) while agp-game-api.js also forwards
 * session:roundStarted/roundFinished to the same hooks — both paths share
 * the AGP._shouldNotifyRoundHook guard so neither hook double-fires.
 * game:roundEnded -> stop() and game:reset -> destroy() are wired below so
 * Round Manager drives this automatically.
 *
 * Events: game:loaded, game:started, game:ended, game:destroyed.
 * Requires js/agp-core.js, js/agp-events.js, js/agp-game-api.js.
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

    function safeCallHook(game, hookName, payload) {
        if (!game || typeof game[hookName] !== 'function') return;
        try {
            game[hookName](payload);
        } catch (err) {
            console.error('[AGP Game Engine] Error in "' + game.id + '.' + hookName + '()":', err);
        }
    }

    if (!AGP._shouldNotifyRoundHook) {
        AGP._roundHookGuard = {};
        AGP._shouldNotifyRoundHook = function (gameId, hookName) {
            if (!gameId) return true;
            if (AGP._roundHookGuard[gameId] === hookName) return false;
            AGP._roundHookGuard[gameId] = hookName;
            return true;
        };
    }

    var _loadedGame = null;
    var _isRunning = false;

    AGP.gameEngine = {

        loadGame: function (id) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.getGame !== 'function') {
                AGP.log('Game Engine: Game API not available, cannot load game.');
                return false;
            }

            var game = AGP.gameAPI.getGame(id);
            if (!game) {
                AGP.log('Game Engine: cannot load, no registered game found with id', id);
                return false;
            }

            if (_loadedGame && _loadedGame.id !== id) {
                AGP.log('Game Engine: replacing currently loaded game "' + _loadedGame.id + '" with "' + id + '".');
            }

            _loadedGame = game;
            _isRunning = false;

            if (typeof AGP.gameAPI.setCurrentGame === 'function') {
                AGP.gameAPI.setCurrentGame(id);
            }

            AGP.log('Game Engine: game loaded', id);
            safeCallHook(_loadedGame, 'onLoad');
            AGP.events.emit('game:loaded', { id: id, game: _loadedGame });

            return true;
        },

        start: function () {
            if (!_loadedGame) {
                AGP.log('Game Engine: cannot start, no game loaded.');
                return false;
            }
            if (_isRunning) {
                AGP.log('Game Engine: game "' + _loadedGame.id + '" is already running.');
                return false;
            }

            _isRunning = true;

            AGP.log('Game Engine: game started', _loadedGame.id);
            if (AGP._shouldNotifyRoundHook(_loadedGame.id, 'onRoundStart')) {
                safeCallHook(_loadedGame, 'onRoundStart');
            }
            AGP.events.emit('game:started', { id: _loadedGame.id, game: _loadedGame });

            return true;
        },

        stop: function () {
            if (!_loadedGame) {
                AGP.log('Game Engine: cannot stop, no game loaded.');
                return false;
            }
            if (!_isRunning) {
                AGP.log('Game Engine: game "' + _loadedGame.id + '" is not running.');
                return false;
            }

            _isRunning = false;

            AGP.log('Game Engine: game ended', _loadedGame.id);
            if (AGP._shouldNotifyRoundHook(_loadedGame.id, 'onRoundEnd')) {
                safeCallHook(_loadedGame, 'onRoundEnd');
            }
            AGP.events.emit('game:ended', { id: _loadedGame.id, game: _loadedGame });

            return true;
        },

        /** Doesn't unregister the game from AGP.gameAPI — separate concern. */
        destroy: function () {
            if (!_loadedGame) {
                AGP.log('Game Engine: cannot destroy, no game loaded.');
                return false;
            }

            if (_isRunning) {
                AGP.log('Game Engine: stopping running game before destroy.');
                this.stop();
            }

            var id = _loadedGame.id;
            var game = _loadedGame;

            AGP.log('Game Engine: game destroyed', id);
            safeCallHook(game, 'onDestroy');
            AGP.events.emit('game:destroyed', { id: id, game: game });

            _loadedGame = null;
            _isRunning = false;

            return true;
        },

        getLoadedGame: function () {
            return _loadedGame;
        },

        getLoadedGameId: function () {
            return _loadedGame ? _loadedGame.id : null;
        },

        isRunning: function () {
            return _isRunning;
        }
    };

    AGP.events.on('game:roundEnded', function (payload) {
        if (!_loadedGame || !_isRunning) return;
        if (payload && payload.id && payload.id !== _loadedGame.id) return;

        AGP.log('Game Engine: auto-stopping "' + _loadedGame.id + '" after game:roundEnded.');
        AGP.gameEngine.stop();
    });

    AGP.events.on('game:reset', function (payload) {
        if (!_loadedGame) return;
        if (payload && payload.id && payload.id !== _loadedGame.id) return;

        AGP.log('Game Engine: auto-destroying "' + _loadedGame.id + '" after game:reset.');
        AGP.gameEngine.destroy();
    });

    AGP.log('AGP Game Engine (minimal) loaded — manages a single current game lifecycle only.');

}(window.AymanGamesPlatform));
