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

        /**
         * تسجيل لعبة جديدة. تفويض مباشر لـ AGP.gameAPI.register(game).
         * @param {Object} game
         * @returns {boolean}
         */
        registerGame: function (game) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.register !== 'function') {
                AGP.log('Game Manager: Game API not available, cannot register.');
                return false;
            }
            return AGP.gameAPI.register(game);
        },

        /**
         * إلغاء تسجيل لعبة. تفويض مباشر لـ AGP.gameAPI.unregister(id).
         * @param {string} id
         * @returns {boolean}
         */
        unregisterGame: function (id) {
            if (!AGP.gameAPI || typeof AGP.gameAPI.unregister !== 'function') {
                AGP.log('Game Manager: Game API not available, cannot unregister.');
                return false;
            }
            return AGP.gameAPI.unregister(id);
        },

        /**
         * تحميل لعبة مسجَّلة مسبقاً في المحرك. تفويض مباشر لـ
         * AGP.gameEngine.loadGame(id).
         * @param {string} id
         * @returns {boolean}
         */
        loadGame: function (id) {
            if (!AGP.gameEngine || typeof AGP.gameEngine.loadGame !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot load game.');
                return false;
            }
            return AGP.gameEngine.loadGame(id);
        },

        /**
         * إلغاء تحميل اللعبة الحالية من المحرك. تفويض مباشر لـ
         * AGP.gameEngine.destroy() (أقرب مكافئ موجود فعلياً لمفهوم
         * "unload" — راجع الملاحظة أعلى الملف).
         * @returns {boolean}
         */
        unloadGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.destroy !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot unload game.');
                return false;
            }
            return AGP.gameEngine.destroy();
        },

        /**
         * جلب اللعبة المحمَّلة حالياً في المحرك. تفويض مباشر لـ
         * AGP.gameEngine.getLoadedGame().
         * @returns {Object|null}
         */
        getCurrentGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.getLoadedGame !== 'function') {
                return null;
            }
            return AGP.gameEngine.getLoadedGame();
        },

        /**
         * جلب كل الألعاب المسجَّلة. تفويض مباشر لـ
         * AGP.gameAPI.getAllGames().
         * @returns {Array<Object>}
         */
        getRegisteredGames: function () {
            if (!AGP.gameAPI || typeof AGP.gameAPI.getAllGames !== 'function') {
                return [];
            }
            return AGP.gameAPI.getAllGames();
        },

        /**
         * فتح التسجيل لانضمام لاعبين جدد. تفويض مباشر لـ
         * AGP.lobby.open().
         * @returns {boolean}
         */
        openRegistration: function () {
            if (!AGP.lobby || typeof AGP.lobby.open !== 'function') {
                AGP.log('Game Manager: Lobby not available, cannot open registration.');
                return false;
            }
            return AGP.lobby.open();
        },

        /**
         * إغلاق التسجيل. تفويض مباشر لـ AGP.lobby.close().
         * @returns {boolean}
         */
        closeRegistration: function () {
            if (!AGP.lobby || typeof AGP.lobby.close !== 'function') {
                AGP.log('Game Manager: Lobby not available, cannot close registration.');
                return false;
            }
            return AGP.lobby.close();
        },

        /**
         * تشغيل اللعبة المحمَّلة حالياً. تفويض مباشر لـ
         * AGP.gameEngine.start().
         * @returns {boolean}
         */
        startGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.start !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot start game.');
                return false;
            }
            return AGP.gameEngine.start();
        },

        /**
         * إيقاف اللعبة الجارية حالياً. تفويض مباشر لـ
         * AGP.gameEngine.stop().
         * @returns {boolean}
         */
        stopGame: function () {
            if (!AGP.gameEngine || typeof AGP.gameEngine.stop !== 'function') {
                AGP.log('Game Manager: Game Engine not available, cannot stop game.');
                return false;
            }
            return AGP.gameEngine.stop();
        },

        /**
         * إعادة ضبط الجلسة الحالية. لا توجد دالة "إعادة ضبط" في أي وحدة
         * أصلية؛ الآلية الوحيدة الموجودة أصلاً هي حدث `game:reset` نفسه
         * (الذي تطلقه لعبة الروليت عن نفسها، ويستمع له Round Manager
         * وLobby أصلاً). هذه الدالة تُطلِق نفس الحدث الموجود، ولا تخترع
         * أي آلية إعادة ضبط جديدة.
         * @returns {boolean}
         */
        resetSession: function () {
            if (!AGP.events || typeof AGP.events.emit !== 'function') {
                AGP.log('Game Manager: Event Bus not available, cannot reset session.');
                return false;
            }
            var currentGame = this.getCurrentGame();
            AGP.events.emit('game:reset', { id: currentGame ? currentGame.id : null });
            return true;
        },

        /**
         * جلب حالة اللوبي الحالية. تفويض مباشر لـ AGP.lobby.getLobbyState().
         * @returns {string|null}
         */
        getLobbyState: function () {
            if (!AGP.lobby || typeof AGP.lobby.getLobbyState !== 'function') {
                return null;
            }
            return AGP.lobby.getLobbyState();
        },

        /**
         * جلب حالة الجولة الحالية. تفويض مباشر لـ AGP.roundManager.getState().
         * @returns {string|null}
         */
        getRoundState: function () {
            if (!AGP.roundManager || typeof AGP.roundManager.getState !== 'function') {
                return null;
            }
            return AGP.roundManager.getState();
        },

        /**
         * جلب قائمة اللاعبين الحاليين. تفويض مباشر لـ
         * AGP.player.getAllPlayers().
         * @returns {Array<Object>}
         */
        getPlayers: function () {
            if (!AGP.player || typeof AGP.player.getAllPlayers !== 'function') {
                return [];
            }
            return AGP.player.getAllPlayers();
        },

        /**
         * جلب عدد اللاعبين الحاليين. تفويض مباشر لـ
         * AGP.player.getPlayersCount().
         * @returns {number}
         */
        getPlayersCount: function () {
            if (!AGP.player || typeof AGP.player.getPlayersCount !== 'function') {
                return 0;
            }
            return AGP.player.getPlayersCount();
        }
    };

    AGP.log('AGP Game Manager (Facade) ready — delegates to AGP.gameAPI + AGP.gameEngine, no logic duplicated.');

}(window.AymanGamesPlatform));
