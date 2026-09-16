/**
 * AGP GAME MANAGER — thin facade unifying game management for external
 * callers (notably the Dashboard). Every method is a 1-line delegation to
 * an existing module, no logic of its own:
 *
 *   registerGame/unregisterGame   -> AGP.gameAPI.register/unregister
 *   loadGame                      -> AGP.gameEngine.loadGame
 *   unloadGame                    -> AGP.gameEngine.destroy (no "unload" exists natively)
 *   getCurrentGame                -> AGP.gameEngine.getLoadedGame
 *   getRegisteredGames            -> AGP.gameAPI.getAllGames
 *   openRegistration/closeRegistration -> AGP.lobby.open/close
 *   startGame/stopGame            -> AGP.gameEngine.start/stop
 *   resetSession                  -> AGP.events.emit('game:reset', ...) (no dedicated reset fn exists; this just fires the existing event that Round Manager/Lobby/Game Engine already consume)
 *   getLobbyState/getRoundState/getPlayers/getPlayersCount -> AGP.lobby/roundManager/player
 *
 * Doesn't emit any event of its own besides resetSession's game:reset.
 * Requires js/agp-core.js; preferably loaded after agp-game-api.js,
 * agp-game-engine.js, agp-lobby.js (each method checks availability safely
 * either way).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    AGP.gameManager = {

        registerGame: function (game) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.register !== 'function') {
                AGP.log('Game Manager: Game API not available, cannot register.');
                return false;
            }
            return AGP.gameAPI.register(game);
        },

        unregisterGame: function (id) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.unregister !== 'function') {
                AGP.log('Game Manager: Game API not available, cannot unregister.');
                return false;
            }
            return AGP.gameAPI.unregister(id);
        },

        loadGame: function (id) {
            if (!AGP.gameEngine || typeof AGP.gameEngine.loadGame !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot load game.');
                return false;
            }
            return AGP.gameEngine.loadGame(id);
        },

        unloadGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.destroy !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot unload game.');
                return false;
            }
            return AGP.gameEngine.destroy();
        },

        getCurrentGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.getLoadedGame !== 'function') {
                return null;
            }
            return AGP.gameEngine.getLoadedGame();
        },

        getRegisteredGames: function () {
            if (!AGP.gameAPI || typeof AGP.gameAPI.getAllGames !== 'function') {
                return [];
            }
            return AGP.gameAPI.getAllGames();
        },

        openRegistration: function () {
            if (!AGP.lobby || typeof AGP.lobby.open !== 'function') {
                AGP.log('Game Manager: Lobby not available, cannot open registration.');
                return false;
            }
            return AGP.lobby.open();
        },

        closeRegistration: function () {
            if (!AGP.lobby || typeof AGP.lobby.close !== 'function') {
                AGP.log('Game Manager: Lobby not available, cannot close registration.');
                return false;
            }
            return AGP.lobby.close();
        },

        startGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.start !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot start game.');
                return false;
            }
            return AGP.gameEngine.start();
        },

        stopGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.stop !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot stop game.');
                return false;
            }
            return AGP.gameEngine.stop();
        },

        resetSession: function () {
            if (!AGP.events || typeof AGP.events.emit !== 'function') {
                AGP.log('Game Manager: Event Bus not available, cannot reset session.');
                return false;
            }
            var currentGame = this.getCurrentGame();
            AGP.events.emit('game:reset', { id: currentGame ? currentGame.id : null });
            return true;
        },

        getLobbyState: function () {
            if (!AGP.lobby || typeof AGP.lobby.getLobbyState !== 'function') {
                return null;
            }
            return AGP.lobby.getLobbyState();
        },

        getRoundState: function () {
            if (!AGP.roundManager || typeof AGP.roundManager.getState !== 'function') {
                return null;
            }
            return AGP.roundManager.getState();
        },

        getPlayers: function () {
            if (!AGP.player || typeof AGP.player.getAllPlayers !== 'function') {
                return [];
            }
            return AGP.player.getAllPlayers();
        },

        getPlayersCount: function () {
            if (!AGP.player || typeof AGP.player.getPlayersCount !== 'function') {
                return 0;
            }
            return AGP.player.getPlayersCount();
        }
    };

    AGP.log('AGP Game Manager (Facade) ready — delegates to AGP.gameAPI + AGP.gameEngine, no logic duplicated.');

}(window.AymanGamesPlatform));
