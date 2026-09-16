/**
 * AGP ROOMS MANAGER — implements "room" on top of Session Manager. Only
 * one active room is supported currently, but the internal store is
 * already a roomId -> room map so multi-room support can be added later
 * without restructuring. Events: room:created, room:closed.
 * Requires js/agp-core.js, js/agp-events.js, js/agp-session.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var _rooms = {};        // roomId -> { id, gameId, createdAt }
    var _activeRoomId = null;

    function generateRoomId() {
        return 'room_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    AGP.roomsManager = {

        /** Rejects if a room is already active (single-room mode). */
        createRoom: function (gameId) {
            if (_activeRoomId) {
                AGP.log('Rooms Manager: a room is already active ("' + _activeRoomId + '"); single-room mode allows only one.');
                return null;
            }

            var roomId = generateRoomId();
            var room = { id: roomId, gameId: gameId || null, createdAt: Date.now() };
            _rooms[roomId] = room;
            _activeRoomId = roomId;

            // getState() returns 'session_ended' (truthy), not null, after a
            // session ends — must check for that state explicitly, or no
            // new session ever gets created after the first one ends.
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

        getRoomState: function () {
            if (!AGP.session || typeof AGP.session.getState !== 'function') return null;
            return AGP.session.getState();
        }
    };

    AGP.log('AGP Rooms Manager loaded (single active room; internal structure upgrade-ready for multi-room).');

}(window.AymanGamesPlatform));
