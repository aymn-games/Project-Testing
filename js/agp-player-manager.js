/**
 * ==========================================================================
 *  AGP PLAYER MANAGER — المسؤول الوحيد عن إدارة اللاعبين (Player Manager)
 * ==========================================================================
 *
 * هذا الملف هو **المسؤول الوحيد** عن إدارة قائمة اللاعبين داخل الجلسة
 * الحالية على المنصة (لا يوجد ولا يجوز أن يوجد أي Player Manager آخر).
 * لا يحتوي على أي منطق لعبة (أدوار، فرق، نقاط...)، ولا أي ارتباط بتيك
 * توك أو أي منصة بث. (ملاحظة: كان هذا الملف باسم `agp-player.js` في
 * مراحل سابقة، وأُعيدت تسميته إلى `agp-player-manager.js` لتوضيح دوره
 * كمرجع وحيد — المنطق الداخلي لم يتغيّر إطلاقاً بهذه التسمية).
 *
 * العلاقة مع Session Manager (agp-session.js):
 *   Player Manager **لا يملك** قائمة اللاعبين بشكل مستقل؛ هو يعمل فوق
 *   نفس المصفوفة التي تُدار من `AGP.session.getPlayersRef()` (مرجع
 *   واحد مشترك)، تماماً كما هو موثّق في `agp-session.js`:
 *   "Session Manager لا يضيف/يحذف لاعبين، فقط يحتفظ بمكان موحّد يشير
 *   إليه Player Manager". هذا الملف هو ذلك الطرف الآخر من العلاقة.
 *
 *   إن لم توجد جلسة نشطة بعد (مثلاً استُخدم هذا الملف قبل إنشاء أي
 *   جلسة، أو حُمّل بشكل مستقل)، يعمل Player Manager فوق مصفوفة احتياطية
 *   داخلية خاصة به (Fallback) حتى لا ينهار، لكن الاستخدام الطبيعي دائماً
 *   يكون بعد `AGP.session.createSession(...)`.
 *
 * العلاقة مع Event Bus (agp-events.js / agp-core.js):
 *   كل تغيير في قائمة اللاعبين يُبث كحدث عبر `AGP.events`، بدل أي
 *   استدعاء مباشر لوحدات أخرى (Lobby, Round Manager, Game Engine
 *   مستقبلاً تستمع لهذه الأحداث بدل استدعاء Player Manager مباشرة قدر
 *   الإمكان). الأحداث المستخدمة ضمن Namespace خاص بهذه الوحدة (`player:*`):
 *     - player:joinRequested  -> عند محاولة انضمام لاعب (قبل أي تحقق)
 *     - player:joinRejected   -> عند رفض الانضمام (بيانات ناقصة/تكرار)
 *     - player:joined         -> عند إضافة اللاعب فعلياً بنجاح
 *     - player:removed        -> عند حذف لاعب من القائمة
 *     - player:listReset      -> عند تصفير قائمة اللاعبين بالكامل
 *
 * يعتمد هذا الملف على وجود js/agp-core.js (لـ AGP.log) و js/agp-events.js
 * (لدعم AGP.events.once إن احتيج لاحقاً) قبله، ويُفضَّل تحميله بعد
 * js/agp-session.js لأنه يستخدم AGP.session.getPlayersRef() عند توفرها.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    // حماية بسيطة في حال تم تحميل هذا الملف قبل agp-core.js بالخطأ
    if (!AGP.log) {
        AGP.log = function () {};
    }
    if (!AGP.events) {
        // نسخة بديلة بسيطة جداً (Fallback) حتى لا ينهار الملف لو حُمّل بمفرده،
        // لكن الاستخدام الطبيعي دائماً بعد تحميل agp-core.js/agp-events.js.
        AGP.events = { emit: function () {}, on: function () { return function () {}; } };
    }

    /* ----------------------------------------------------------------
     * 1) مصدر قائمة اللاعبين (Players Source)
     * ----------------------------------------------------------------
     * Player Manager لا يخزّن قائمته الخاصة عندما توجد جلسة نشطة؛ بدلاً
     * من ذلك يقرأ/يعدّل المصفوفة المشتركة نفسها التي يحتفظ بها Session
     * Manager (`AGP.session.getPlayersRef()`). هذا يضمن أن كل من
     * Session Manager وPlayer Manager (وأي وحدة قادمة) يريان نفس البيانات
     * دائماً دون الحاجة لمزامنة يدوية بينهما.
     * ---------------------------------------------------------------- */

    // مصفوفة احتياطية تُستخدم فقط إذا لم توجد جلسة نشطة عبر AGP.session
    var _fallbackPlayers = [];

    function getPlayersArray() {
        if (AGP.session && typeof AGP.session.getPlayersRef === 'function') {
            var ref = AGP.session.getPlayersRef();
            if (Array.isArray(ref)) return ref;
        }
        AGP.log('Player Manager: no active session found, using local fallback list.');
        return _fallbackPlayers;
    }

    /* ----------------------------------------------------------------
     * 2) دوال مساعدة داخلية
     * ---------------------------------------------------------------- */
    function findIndexById(players, playerId) {
        for (var i = 0; i < players.length; i++) {
            if (players[i] && players[i].id === playerId) return i;
        }
        return -1;
    }

    /* ----------------------------------------------------------------
     * 3) واجهة AGP.player العامة
     * ---------------------------------------------------------------- */
    AGP.player = {

        /**
         * محاولة إضافة لاعب جديد إلى قائمة الجلسة الحالية.
         * يتجاهل الانضمام المكرر تلقائياً (بنفس الـ id).
         *
         * @param {Object} playerData - بيانات اللاعب، ويجب أن تحتوي على
         *   الأقل على { id, name }. أي حقول إضافية تُحفظ كما هي دون
         *   تفسير أو تعديل من هذا الملف (لا معنى/دور لعبة يُفرض هنا).
         * @returns {Object|null} كائن اللاعب المُضاف عند النجاح، أو
         *   null عند الرفض (بيانات ناقصة أو تكرار).
         */
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

            // أي حقول إضافية غير الحقول الأساسية تُنسخ كما هي (بدون
            // تفسير)، حتى تبقى هذه الوحدة عامة وغير مرتبطة بلعبة معيّنة.
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

        /**
         * حذف لاعب من قائمة الجلسة الحالية عن طريق الـ id.
         * @param {string} playerId
         * @returns {boolean} true إذا تم الحذف فعلياً، false إن لم يوجد.
         */
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

        /**
         * البحث عن لاعب معيّن عن طريق الـ id.
         * @param {string} playerId
         * @returns {Object|null}
         */
        findPlayer: function (playerId) {
            var players = getPlayersArray();
            var index = findIndexById(players, playerId);
            return index === -1 ? null : players[index];
        },

        /**
         * التحقق من وجود لاعب معيّن ضمن القائمة الحالية.
         * @param {string} playerId
         * @returns {boolean}
         */
        hasPlayer: function (playerId) {
            return this.findPlayer(playerId) !== null;
        },

        /**
         * إرجاع قائمة اللاعبين الحالية كنسخة (Copy) آمنة للقراءة، حتى لا
         * يستطيع أي كود خارجي تعديل القائمة الأصلية مباشرة دون المرور
         * عبر addPlayer/removePlayer/reset.
         * @returns {Array<Object>}
         */
        getAllPlayers: function () {
            return getPlayersArray().slice();
        },

        /**
         * إرجاع عدد اللاعبين الحاليين. دالة مساعدة بسيطة لتفادي كتابة
         * getAllPlayers().length في كل مكان.
         * @returns {number}
         */
        getPlayersCount: function () {
            return getPlayersArray().length;
        },

        /**
         * تصفير قائمة اللاعبين بالكامل (مثلاً عند بدء جلسة جديدة أو
         * إعادة ضبط يدوية). يُفرغ المصفوفة الأصلية دون استبدال مرجعها،
         * حتى تبقى Session Manager (وأي وحدة أخرى) تشير لنفس المصفوفة.
         */
        reset: function () {
            var players = getPlayersArray();
            players.length = 0;

            AGP.log('Player Manager: players list reset.');
            AGP.events.emit('player:listReset', {});
        }
    };

    AGP.log('AGP Player Manager skeleton loaded (no game/TikTok logic yet).');

}(window.AymanGamesPlatform));
