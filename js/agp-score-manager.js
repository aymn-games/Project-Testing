/**
 * ==========================================================================
 *  AGP SCORE MANAGER — سجل نقاط عام لكل لاعب (بدون قواعد لعبة)
 * ==========================================================================
 * سجل نقاط عام مبني فوق معرّفات اللاعبين (لا يفرض أي قاعدة احتساب —
 * تلك مسؤولية كل لعبة). إضافة/طرح/تعيين نقاط، وترتيب لوحة صدارة عامة.
 * لا يلمس AGP.player (لا يحذف/يضيف لاعبين)، فقط يربط رقماً بمعرّف لاعب
 * موجود بالفعل. لا اتصال فعلي، لا واجهة، لا كود خاص بأي لعبة.
 * يعتمد على js/agp-core.js, js/agp-events.js قبله.
 * ==========================================================================
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

        /**
         * لوحة صدارة مرتّبة تنازلياً حسب النقاط.
         * @returns {Array<{playerId: string, score: number}>}
         */
        getLeaderboard: function () {
            return Object.keys(_scores)
                .map(function (playerId) {
                    return { playerId: playerId, score: _scores[playerId] };
                })
                .sort(function (a, b) { return b.score - a.score; });
        },

        /**
         * تصفير نقاط لاعب واحد، أو الجميع إن لم يُمرَّر معرّف.
         * @param {string} [playerId]
         */
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
