/**
 * AGP SCORE MANAGER — generic per-player-id score ledger; scoring rules
 * are each game's own responsibility. Never touches AGP.player itself.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var _scores = {}; // playerId -> number

    function emitChanged(playerId) {
        AGP.events.emit('score:changed', { playerId: playerId, score: _scores[playerId] || 0 });
    }

    AGP.scoreManager = {

        addPoints: function (playerId, amount) {
            if (!playerId || typeof amount !== 'number') return false;
            _scores[playerId] = (_scores[playerId] || 0) + amount;
            emitChanged(playerId);
            return true;
        },

        subtractPoints: function (playerId, amount) {
            if (!playerId || typeof amount !== 'number') return false;
            _scores[playerId] = (_scores[playerId] || 0) - amount;
            emitChanged(playerId);
            return true;
        },

        setScore: function (playerId, amount) {
            if (!playerId || typeof amount !== 'number') return false;
            _scores[playerId] = amount;
            emitChanged(playerId);
            return true;
        },

        getScore: function (playerId) {
            return _scores[playerId] || 0;
        },

        getLeaderboard: function () {
            return Object.keys(_scores)
                .map(function (playerId) {
                    return { playerId: playerId, score: _scores[playerId] };
                })
                .sort(function (a, b) { return b.score - a.score; });
        },

        /** Resets one player's score, or everyone's if playerId is omitted. */
        reset: function (playerId) {
            if (playerId) {
                delete _scores[playerId];
                emitChanged(playerId);
            } else {
                _scores = {};
                AGP.events.emit('score:reset', {});
            }
        }
    };

    AGP.log('AGP Score Manager loaded (generic per-player ledger, no scoring rules).');

}(window.AymanGamesPlatform));
