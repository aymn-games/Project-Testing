/**
 * ==========================================================================
 *  AGP QUEUE MANAGER — طابور اللاعبين المرشَّحين (بدون ربط فعلي)
 * ==========================================================================
 * طابور وسيط عام بين أي مصدر مرشِّح للاعبين وبين قبولهم فعلياً. يمنع
 * التكرار (داخل الطابور نفسه، وضد اللاعبين المنضمين فعلاً عبر
 * AGP.player.hasPlayer)، ويُدخِل اللاعب حصراً عبر
 * AGP.playerSource.submitPlayer عند القبول — لا يلمس AGP.player مباشرة
 * ولا يعرف شيئاً عن مصدر اللاعب الحقيقي (يُمرَّر معه عند الإضافة للطابور).
 * لا اتصال فعلي، لا واجهة، لا كود خاص بأي لعبة.
 * يعتمد على js/agp-core.js, js/agp-events.js, js/agp-player-manager.js,
 * js/agp-player-source.js قبله.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var _queue = []; // { sourceKey, playerData }

    function findQueueIndex(playerId) {
        for (var i = 0; i < _queue.length; i++) {
            if (_queue[i].playerData && _queue[i].playerData.id === playerId) return i;
        }
        return -1;
    }

    function isAlreadyJoined(playerId) {
        return !!(AGP.player && typeof AGP.player.hasPlayer === 'function' && AGP.player.hasPlayer(playerId));
    }

    AGP.queueManager = {

        /**
         * إضافة لاعب مرشَّح إلى الطابور (لا يُقبَل فعلياً بعد).
         * @param {string} sourceKey - المصدر الحقيقي (يُستخدم لاحقاً عند القبول)
         * @param {Object} playerData - يجب أن تحتوي {id, ...} على الأقل
         * @returns {boolean}
         */
        enqueue: function (sourceKey, playerData) {
            if (!playerData || !playerData.id) {
                AGP.log('Queue Manager: rejected, missing player id.');
                AGP.events.emit('queue:rejected', { reason: 'missing_id', sourceKey: sourceKey, playerData: playerData });
                return false;
            }

            if (findQueueIndex(playerData.id) !== -1) {
                AGP.log('Queue Manager: rejected, already in queue.', playerData.id);
                AGP.events.emit('queue:rejected', { reason: 'duplicate_in_queue', sourceKey: sourceKey, playerData: playerData });
                return false;
            }

            if (isAlreadyJoined(playerData.id)) {
                AGP.log('Queue Manager: rejected, player already joined.', playerData.id);
                AGP.events.emit('queue:rejected', { reason: 'already_joined', sourceKey: sourceKey, playerData: playerData });
                return false;
            }

            _queue.push({ sourceKey: sourceKey, playerData: playerData });
            AGP.log('Queue Manager: enqueued', playerData.id);
            AGP.events.emit('queue:enqueued', { sourceKey: sourceKey, playerData: playerData });
            return true;
        },

        /**
         * إزالة وإرجاع أول عنصر في الطابور دون قبوله فعلياً.
         * @returns {Object|null} { sourceKey, playerData }
         */
        dequeue: function () {
            var item = _queue.shift();
            if (!item) return null;
            AGP.events.emit('queue:dequeued', item);
            return item;
        },

        peek: function () {
            return _queue.length ? _queue[0] : null;
        },

        removeFromQueue: function (playerId) {
            var index = findQueueIndex(playerId);
            if (index === -1) return false;
            var item = _queue.splice(index, 1)[0];
            AGP.events.emit('queue:removed', item);
            return true;
        },

        isQueued: function (playerId) {
            return findQueueIndex(playerId) !== -1;
        },

        getQueue: function () {
            return _queue.slice();
        },

        getQueueLength: function () {
            return _queue.length;
        },

        /**
         * قبول أول لاعب في الطابور فعلياً، عبر AGP.playerSource.submitPlayer
         * (باستخدام sourceKey المخزَّن معه عند الإضافة للطابور).
         * @returns {Object|null} كائن اللاعب المُضاف، أو null
         */
        admitNext: function () {
            var item = _queue.shift();
            if (!item) return null;

            if (!AGP.playerSource || typeof AGP.playerSource.submitPlayer !== 'function') {
                AGP.log('Queue Manager: AGP.playerSource not available, cannot admit.');
                AGP.events.emit('queue:admitRejected', { reason: 'player_source_unavailable', item: item });
                return null;
            }

            var player = AGP.playerSource.submitPlayer(item.sourceKey, item.playerData);

            if (player) {
                AGP.events.emit('queue:admitted', { sourceKey: item.sourceKey, player: player });
            } else {
                AGP.events.emit('queue:admitRejected', { reason: 'rejected_by_player_source', item: item });
            }

            return player;
        },

        /**
         * قبول كل من في الطابور، لاعباً تلو الآخر بنفس ترتيب الدخول.
         * @returns {Array<Object>} قائمة اللاعبين المقبولين فعلياً فقط
         */
        admitAll: function () {
            var admitted = [];
            var player;
            while (_queue.length) {
                player = this.admitNext();
                if (player) admitted.push(player);
            }
            return admitted;
        },

        clear: function () {
            _queue.length = 0;
            AGP.log('Queue Manager: queue cleared.');
            AGP.events.emit('queue:cleared', {});
        }
    };

    AGP.log('AGP Queue Manager loaded (foundation only, no real source connected).');

}(window.AymanGamesPlatform));
