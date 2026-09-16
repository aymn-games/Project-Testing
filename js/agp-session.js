/**
 * AGP SESSION — session state machine (idle/registration/round lifecycle).
 * No player management, game logic, or network connection lives here —
 * player list management belongs to Player Manager; Session just holds
 * one shared reference to it. Requires js/agp-core.js loaded first.
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

    /* Allowed state sequence:
     *   Idle -> Registration Open -> Registration Closed -> Round Running
     *     -> Round Finished -> Round Running (next round) | Session Ended
     *   Session Ended reachable early from any state.
     * Other code should reference AGP.session.STATES, not raw strings. */
    var STATES = {
        IDLE: 'idle',
        REGISTRATION_OPEN: 'registration_open',
        REGISTRATION_CLOSED: 'registration_closed',
        ROUND_RUNNING: 'round_running',
        ROUND_FINISHED: 'round_finished',
        SESSION_ENDED: 'session_ended'
    };

    var ALLOWED_TRANSITIONS = {};
    ALLOWED_TRANSITIONS[STATES.IDLE] = [STATES.REGISTRATION_OPEN, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.REGISTRATION_OPEN] = [STATES.REGISTRATION_CLOSED, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.REGISTRATION_CLOSED] = [STATES.ROUND_RUNNING, STATES.REGISTRATION_OPEN, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.ROUND_RUNNING] = [STATES.ROUND_FINISHED, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.ROUND_FINISHED] = [STATES.ROUND_RUNNING, STATES.SESSION_ENDED];
    ALLOWED_TRANSITIONS[STATES.SESSION_ENDED] = [];

    // Only one active session at a time — no parallel sessions yet.
    var _session = null;

    function createEmptySession() {
        return {
            id: null,
            state: STATES.IDLE,
            currentGameId: null, // matches data-agp-game-id in AGP.registry
            currentRound: 0,
            joinCode: null,
            registrationOpen: false,
            players: [] // owned/mutated by Player Manager, not here
        };
    }

    function generateJoinCode() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid visually similar chars
        var code = '';
        for (var i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    function generateSessionId() {
        return 'session-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    /** Logs and no-ops (doesn't throw) on a disallowed transition. */
    function transitionTo(newState) {
        if (!_session) {
            AGP.log('Session: cannot change state, no active session.');
            return false;
        }

        var allowed = ALLOWED_TRANSITIONS[_session.state] || [];
        if (allowed.indexOf(newState) === -1) {
            AGP.log('Session: invalid transition from "' + _session.state + '" to "' + newState + '".');
            return false;
        }

        var previousState = _session.state;
        _session.state = newState;

        AGP.log('Session: state changed "' + previousState + '" -> "' + newState + '"');
        AGP.events.emit('session:stateChanged', {
            sessionId: _session.id,
            previousState: previousState,
            state: newState
        });

        return true;
    }

    AGP.session = {

        STATES: STATES,

        /** Creates a new session for gameId, implicitly replacing any
         * current active session (only one active at a time). */
        createSession: function (gameId) {
            if (_session && _session.state !== STATES.SESSION_ENDED) {
                AGP.log('Session: creating a new session will replace the current active one.');
            }

            _session = createEmptySession();
            _session.id = generateSessionId();
            _session.currentGameId = gameId || null;
            _session.joinCode = generateJoinCode();

            AGP.log('Session: created new session', _session.id, 'for game', _session.currentGameId);
            AGP.events.emit('session:created', { sessionId: _session.id, gameId: _session.currentGameId });

            return this.getSession();
        },

        /** Marks the session ended without removing it from memory, so
         * its data stays readable until replaced by a new session. */
        endSession: function () {
            if (!_session) {
                AGP.log('Session: no active session to end.');
                return false;
            }
            var ok = transitionTo(STATES.SESSION_ENDED);
            if (ok) {
                AGP.events.emit('session:ended', { sessionId: _session.id });
            }
            return ok;
        },

        openRegistration: function () {
            var ok = transitionTo(STATES.REGISTRATION_OPEN);
            if (ok) _session.registrationOpen = true;
            return ok;
        },

        closeRegistration: function () {
            var ok = transitionTo(STATES.REGISTRATION_CLOSED);
            if (ok) _session.registrationOpen = false;
            return ok;
        },

        startRound: function () {
            var ok = transitionTo(STATES.ROUND_RUNNING);
            if (ok) {
                _session.currentRound += 1;
                AGP.events.emit('session:roundStarted', {
                    sessionId: _session.id,
                    round: _session.currentRound
                });
            }
            return ok;
        },

        finishRound: function () {
            var ok = transitionTo(STATES.ROUND_FINISHED);
            if (ok) {
                AGP.events.emit('session:roundFinished', {
                    sessionId: _session.id,
                    round: _session.currentRound
                });
            }
            return ok;
        },

        getState: function () {
            return _session ? _session.state : null;
        },

        /** players is intentionally the same array reference (not a copy)
         * so Player Manager can mutate it directly. */
        getSession: function () {
            if (!_session) return null;
            return {
                id: _session.id,
                state: _session.state,
                currentGameId: _session.currentGameId,
                currentRound: _session.currentRound,
                joinCode: _session.joinCode,
                registrationOpen: _session.registrationOpen,
                players: _session.players
            };
        },

        getPlayersRef: function () {
            return _session ? _session.players : [];
        },

        getCurrentGameId: function () {
            return _session ? _session.currentGameId : null;
        },

        getCurrentRound: function () {
            return _session ? _session.currentRound : 0;
        },

        getJoinCode: function () {
            return _session ? _session.joinCode : null;
        },

        isRegistrationOpen: function () {
            return !!(_session && _session.registrationOpen);
        }
    };

    AGP.log('AGP Session skeleton loaded (state machine only, no game/player logic yet)');

}(window.AymanGamesPlatform));
