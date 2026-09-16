/**
 * AGP PLAYER MANAGER — the sole owner of player-list management.
 * No game logic (roles, teams, scores) and no TikTok/stream coupling.
 *
 * Works directly on the array from AGP.session.getPlayersRef() (shared
 * reference, not its own copy) so Session Manager and Player Manager
 * always see the same data. Falls back to an internal array if no
 * session exists yet. Every list change is broadcast via AGP.events
 * under the player:* namespace (joinRequested/joinRejected/joined/
 * removed/listReset) rather than calling other modules directly.
 *
 * Load after js/agp-session.js.
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

    // Used only when there's no active AGP.session
    var _fallbackPlayers = [];

    function getPlayersArray() {
        if (AGP.session && typeof AGP.session.getPlayersRef === 'function') {
            var ref = AGP.session.getPlayersRef();
            if (Array.isArray(ref)) return ref;
        }
        AGP.log('Player Manager: no active session found, using local fallback list.');
        return _fallbackPlayers;
    }

    function findIndexById(players, playerId) {
        for (var i = 0; i < players.length; i++) {
            if (players[i] && players[i].id === playerId) return i;
        }
        return -1;
    }

    AGP.player = {

        /** Ignores duplicate joins (same id). */
        addPlayer: function (playerData) {
            AGP.events.emit('player:joinRequested', { playerData: playerData });

            if (!playerData || !playerData.id) {
                AGP.log('Player Manager: join rejected, missing player id.', playerData);
                AGP.events.emit('player:joinRejected', {
                    reason: 'missing_id',
                    playerData: playerData
                });
                return null;
            }

            var players = getPlayersArray();

            if (findIndexById(players, playerData.id) !== -1) {
                AGP.log('Player Manager: duplicate join ignored for id', playerData.id);
                AGP.events.emit('player:joinRejected', {
                    reason: 'duplicate',
                    playerData: playerData
                });
                return null;
            }

            var player = {
                id: playerData.id,
                name: playerData.name || null,
                joinedAt: Date.now()
            };

            Object.keys(playerData).forEach(function (key) {
                if (key !== 'id' && key !== 'name' && !(key in player)) {
                    player[key] = playerData[key];
                }
            });

            players.push(player);

            AGP.log('Player Manager: player joined', player.id);
            AGP.events.emit('player:joined', { player: player });

            return player;
        },

        removePlayer: function (playerId) {
            var players = getPlayersArray();
            var index = findIndexById(players, playerId);

            if (index === -1) {
                AGP.log('Player Manager: cannot remove, player not found', playerId);
                return false;
            }

            var removedPlayer = players[index];
            players.splice(index, 1);

            AGP.log('Player Manager: player removed', playerId);
            AGP.events.emit('player:removed', { player: removedPlayer });

            return true;
        },

        findPlayer: function (playerId) {
            var players = getPlayersArray();
            var index = findIndexById(players, playerId);
            return index === -1 ? null : players[index];
        },

        hasPlayer: function (playerId) {
            return this.findPlayer(playerId) !== null;
        },

        /** Returns a copy — external code can't mutate the real list
         * without going through addPlayer/removePlayer/reset. */
        getAllPlayers: function () {
            return getPlayersArray().slice();
        },

        getPlayersCount: function () {
            return getPlayersArray().length;
        },

        /** Clears in place (doesn't replace the array reference) so
         * Session Manager keeps pointing at the same array. */
        reset: function () {
            var players = getPlayersArray();
            players.length = 0;

            AGP.log('Player Manager: players list reset.');
            AGP.events.emit('player:listReset', {});
        }
    };

    AGP.log('AGP Player Manager skeleton loaded (no game/TikTok logic yet).');

}(window.AymanGamesPlatform));
