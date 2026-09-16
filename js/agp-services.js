/**
 * AGP SERVICES — service-layer skeletons, no real logic on their own.
 * Where a real implementation exists elsewhere (roomsManager, player
 * manager, storageManager) these delegate to it lazily; otherwise they
 * just log a "not implemented" message. Requires js/agp-core.js loaded first.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    function notImplementedYet(serviceName, methodName) {
        AGP.log('Service call (not implemented yet): ' + serviceName + '.' + methodName + '()');
    }

    AGP.services = AGP.services || {};

    /* createRoom/getRoomState delegate to AGP.roomsManager (lazily, since
     * this file loads before agp-rooms-manager.js). joinRoom/leaveRoom stay
     * unimplemented — real player join/leave belongs to AGP.playerSource. */
    AGP.services.RoomsService = {
        createRoom: function (gameId) {
            if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                return AGP.roomsManager.createRoom(gameId);
            }
            notImplementedYet('RoomsService', 'createRoom');
            return null;
        },
        joinRoom: function () { notImplementedYet('RoomsService', 'joinRoom'); },
        leaveRoom: function () { notImplementedYet('RoomsService', 'leaveRoom'); },
        getRoomState: function () {
            if (AGP.roomsManager && typeof AGP.roomsManager.getRoomState === 'function') {
                return AGP.roomsManager.getRoomState();
            }
            notImplementedYet('RoomsService', 'getRoomState');
            return null;
        }
    };

    /* Delegates to AGP.player (agp-player-manager.js), lazily since this
     * file loads first. */
    AGP.services.PlayersService = {
        addPlayer: function (playerData) {
            if (AGP.player && typeof AGP.player.addPlayer === 'function') {
                return AGP.player.addPlayer(playerData);
            }
            notImplementedYet('PlayersService', 'addPlayer');
            return null;
        },
        removePlayer: function (playerId) {
            if (AGP.player && typeof AGP.player.removePlayer === 'function') {
                return AGP.player.removePlayer(playerId);
            }
            notImplementedYet('PlayersService', 'removePlayer');
            return false;
        },
        getPlayer: function (playerId) {
            if (AGP.player && typeof AGP.player.findPlayer === 'function') {
                return AGP.player.findPlayer(playerId);
            }
            notImplementedYet('PlayersService', 'getPlayer');
            return null;
        },
        listPlayers: function () {
            if (AGP.player && typeof AGP.player.getAllPlayers === 'function') {
                return AGP.player.getAllPlayers();
            }
            notImplementedYet('PlayersService', 'listPlayers');
            return [];
        }
    };

    AGP.services.NetworkService = {
        connect: function () { notImplementedYet('NetworkService', 'connect'); },
        disconnect: function () { notImplementedYet('NetworkService', 'disconnect'); },
        send: function () { notImplementedYet('NetworkService', 'send'); },
        isConnected: function () { notImplementedYet('NetworkService', 'isConnected'); return false; }
    };

    /* Delegates to AGP.storageManager (agp-storage-manager.js). */
    AGP.services.StorageService = {
        get: function (key, defaultValue) {
            if (AGP.storageManager && typeof AGP.storageManager.get === 'function') {
                return AGP.storageManager.get(key, defaultValue);
            }
            notImplementedYet('StorageService', 'get');
            return defaultValue !== undefined ? defaultValue : null;
        },
        set: function (key, value) {
            if (AGP.storageManager && typeof AGP.storageManager.set === 'function') {
                return AGP.storageManager.set(key, value);
            }
            notImplementedYet('StorageService', 'set');
            return false;
        },
        remove: function (key) {
            if (AGP.storageManager && typeof AGP.storageManager.remove === 'function') {
                return AGP.storageManager.remove(key);
            }
            notImplementedYet('StorageService', 'remove');
            return false;
        }
    };

    AGP.services.TikTokService = {
        connectToLiveStream: function () { notImplementedYet('TikTokService', 'connectToLiveStream'); },
        disconnectFromLiveStream: function () { notImplementedYet('TikTokService', 'disconnectFromLiveStream'); },
        onGift: function () { notImplementedYet('TikTokService', 'onGift'); },
        onComment: function () { notImplementedYet('TikTokService', 'onComment'); }
    };

    AGP.services.YouTubeService = {
        connectToLiveStream: function () { notImplementedYet('YouTubeService', 'connectToLiveStream'); },
        disconnectFromLiveStream: function () { notImplementedYet('YouTubeService', 'disconnectFromLiveStream'); },
        onChatMessage: function () { notImplementedYet('YouTubeService', 'onChatMessage'); }
    };

    AGP.services.TwitchService = {
        connectToLiveStream: function () { notImplementedYet('TwitchService', 'connectToLiveStream'); },
        disconnectFromLiveStream: function () { notImplementedYet('TwitchService', 'disconnectFromLiveStream'); },
        onChatMessage: function () { notImplementedYet('TwitchService', 'onChatMessage'); }
    };

    AGP.log('AGP Services skeleton loaded (no real logic yet)');

}(window.AymanGamesPlatform));
