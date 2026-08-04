/**
 * ==========================================================================
 *  AGP PLAYER SOURCE LAYER — طبقة عامة لمصادر اللاعبين (بدون ربط فعلي)
 * ==========================================================================
 * واجهة موحّدة يستخدمها أي "مصدر" مستقبلي (Stream Connector لاحقاً، أو
 * إضافة يدوية من Dashboard، أو أي مصدر آخر) لإرسال لاعب جديد للمنصة،
 * دون أن يعرف المصدر تفاصيل Player Manager نفسه. لا يُدير قائمة لاعبين
 * خاصة به؛ فقط يُطبِّع الطلب ويُمرِّره لـ AGP.player.addPlayer الوحيد
 * فعلياً (المالك الوحيد لقائمة اللاعبين، كما هو موثَّق في
 * agp-player-manager.js)، مع وسم كل لاعب بمصدره.
 *
 * لا اتصال فعلي بأي مصدر هنا (لا TikTok ولا غيره) — فقط العقد العام:
 *   AGP.playerSource.registerSource('tiktok', { label: '...' });
 *   AGP.playerSource.submitPlayer('tiktok', { id, name, ... });
 *
 * يعتمد على js/agp-core.js, js/agp-events.js, js/agp-player-manager.js
 * قبله.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var _sources = {}; // key -> { label }

    function registerSource(key, options) {
        options = options || {};
        if (!key) {
            AGP.log('Player Source: cannot register, missing key.');
            return false;
        }
        _sources[key] = { label: options.label || key };
        AGP.events.emit('playerSource:registered', { source: key });
        AGP.log('Player Source: "' + key + '" registered.');
        return true;
    }

    function unregisterSource(key) {
        if (!_sources[key]) return false;
        delete _sources[key];
        AGP.events.emit('playerSource:unregistered', { source: key });
        AGP.log('Player Source: "' + key + '" unregistered.');
        return true;
    }

    AGP.playerSource = {

        registerSource: registerSource,
        unregisterSource: unregisterSource,

        getRegisteredSources: function () {
            return Object.keys(_sources);
        },

        /**
         * نقطة الدخول الموحّدة لإضافة لاعب من أي مصدر مسجَّل. لا تُضيف
         * اللاعب بنفسها؛ تُطبِّعه وتُمرِّره لـ AGP.player.addPlayer.
         * @param {string} sourceKey - يجب أن يكون مسجَّلاً مسبقاً عبر registerSource
         * @param {Object} rawPlayerData - يجب أن تحتوي {id, ...} على الأقل
         * @returns {Object|null} كائن اللاعب المُضاف، أو null عند الرفض
         */
        submitPlayer: function (sourceKey, rawPlayerData) {
            if (!_sources[sourceKey]) {
                AGP.log('Player Source: submission rejected, unknown source "' + sourceKey + '".');
                AGP.events.emit('playerSource:playerRejected', {
                    source: sourceKey,
                    reason: 'unknown_source',
                    playerData: rawPlayerData
                });
                return null;
            }

            if (!AGP.player || typeof AGP.player.addPlayer !== 'function') {
                AGP.log('Player Source: AGP.player not available, cannot submit.');
                return null;
            }

            var playerData = {};
            Object.keys(rawPlayerData || {}).forEach(function (key) {
                playerData[key] = rawPlayerData[key];
            });
            playerData.source = sourceKey;

            var player = AGP.player.addPlayer(playerData);

            if (player) {
                AGP.events.emit('playerSource:playerSubmitted', { source: sourceKey, player: player });
            } else {
                AGP.events.emit('playerSource:playerRejected', {
                    source: sourceKey,
                    reason: 'rejected_by_player_manager',
                    playerData: playerData
                });
            }

            return player;
        }
    };

    AGP.log('AGP Player Source Layer loaded (foundation only, no real source connected).');

}(window.AymanGamesPlatform));
