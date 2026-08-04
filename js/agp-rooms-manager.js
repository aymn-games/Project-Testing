/**
 * ==========================================================================
 *  AGP ROOMS MANAGER — غرفة نشطة واحدة فقط (بنية قابلة للترقية لاحقاً)
 * ==========================================================================
 * تنفيذ فعلي لمفهوم "الغرفة" فوق Session Manager الموجود (بدون إعادة
 * تنفيذ منطقه — يستدعي دواله العامة فقط). المنصة تدعم **غرفة نشطة واحدة
 * فقط** حالياً (قرار معماري صريح). البنية الداخلية مع ذلك خريطة
 * `roomId -> room` منذ البداية، حتى تسمح ترقية مستقبلية لـ Multi-room
 * بإضافة معامل `roomId` اختياري للدوال العامة فقط، دون إعادة هيكلة أي
 * بيانات داخلية هنا أو أي تعديل على بقية الـ Managers (Session, Round
 * Manager, Lobby...) التي لا تعرف عن هذا الملف إطلاقاً.
 *
 * ✅ تحديث: `agp-round-manager.js` يمر الآن عبر `AGP.roomsManager.createRoom()`/
 *   `closeRoom()` (بدل استدعاء `AGP.session` مباشرة) عند دخول/مغادرة
 *   `registration_open`/`idle`، وكذلك عند الدخول المباشر لـ `in_progress`
 *   (مسار الألعاب التي تتخطى Lobby، عبر `ensureSessionReadyForRound()`).
 *   `_activeRoomId` هنا يبقى متزامناً مع الجلسة الفعلية في كل المسارات.
 *
 * الأحداث (`room:*`): room:created, room:closed.
 * لا اتصال فعلي، لا واجهة، لا كود خاص بأي لعبة.
 * يعتمد على js/agp-core.js, js/agp-events.js, js/agp-session.js قبله.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    // خريطة منذ البداية (وليس متغيّراً واحداً) خصيصاً لتسهيل ترقية
    // Multi-room مستقبلاً دون إعادة هيكلة البيانات الداخلية.
    var _rooms = {};        // roomId -> { id, gameId, createdAt }
    var _activeRoomId = null;

    function generateRoomId() {
        return 'room_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    AGP.roomsManager = {

        /**
         * إنشاء الغرفة النشطة الوحيدة. يرفض الإنشاء إن وُجدت غرفة نشطة
         * بالفعل (قيد "غرفة واحدة" الصريح لهذه المرحلة).
         * @param {string} [gameId]
         * @returns {Object|null}
         */
        createRoom: function (gameId) {
            if (_activeRoomId) {
                AGP.log('Rooms Manager: a room is already active ("' + _activeRoomId + '"); single-room mode allows only one.');
                return null;
            }

            var roomId = generateRoomId();
            var room = { id: roomId, gameId: gameId || null, createdAt: Date.now() };
            _rooms[roomId] = room;
            _activeRoomId = roomId;

            // ⚠️ إصلاح تكامل: getState() تُعيد 'session_ended' (truthy)
            // بعد انتهاء أي جلسة سابقة، وليس null — الفحص السابق كان
            // يمنع إنشاء أي جلسة جديدة بعد أول جلسة تنتهي. يُعتبَر الآن
            // عدم وجود جلسة أو انتهاؤها حالتين تستدعيان إنشاء جلسة جديدة.
            if (AGP.session && typeof AGP.session.createSession === 'function') {
                var currentState = AGP.session.getState();
                if (!currentState || currentState === AGP.session.STATES.SESSION_ENDED) {
                    AGP.session.createSession(gameId || null);
                }
            }

            AGP.log('Rooms Manager: room created', roomId);
            AGP.events.emit('room:created', { room: room });
            return room;
        },

        /**
         * إغلاق الغرفة النشطة (إن وُجدت)، وإنهاء الجلسة المرتبطة بها.
         * @returns {boolean}
         */
        closeRoom: function () {
            if (!_activeRoomId) return false;
            var room = _rooms[_activeRoomId];

            if (AGP.session && typeof AGP.session.endSession === 'function') {
                AGP.session.endSession();
            }

            delete _rooms[_activeRoomId];
            _activeRoomId = null;

            AGP.log('Rooms Manager: room closed', room.id);
            AGP.events.emit('room:closed', { room: room });
            return true;
        },

        getCurrentRoom: function () {
            return _activeRoomId ? _rooms[_activeRoomId] : null;
        },

        hasActiveRoom: function () {
            return !!_activeRoomId;
        },

        /**
         * تفويض مباشر لحالة Session المرتبطة بالغرفة النشطة (لا نسخة
         * موازية لحالة الجلسة هنا).
         * @returns {string|null}
         */
        getRoomState: function () {
            if (!AGP.session || typeof AGP.session.getState !== 'function') return null;
            return AGP.session.getState();
        }
    };

    AGP.log('AGP Rooms Manager loaded (single active room; internal structure upgrade-ready for multi-room).');

}(window.AymanGamesPlatform));
