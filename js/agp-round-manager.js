/**
 * AGP ROUND MANAGER — single source of truth for round state. All
 * transitions happen only by listening to existing AGP events — there is
 * no public setState().
 *
 *   Idle -> RegistrationOpen -> Ready -> InProgress -> RoundEnded
 *     -> InProgress (new round via game:roundStarted)
 *   any state -> Idle via game:reset
 *
 * Purely generic: no roulette-specific event names live here (an earlier
 * version had spinning/winner_selected sub-states; both collapsed into
 * InProgress). The connected roulette game doesn't go through AGP Lobby —
 * it emits game:roundStarted/roundEnded/reset directly — so this listens
 * to both the Lobby path and direct game:* events.
 *
 * Mirrors each transition onto Session Manager's own state machine
 * (without duplicating its logic):
 *   RegistrationOpen -> createSession() [if needed] + openRegistration()
 *   Ready            -> closeRegistration()
 *   InProgress       -> startRound()
 *   RoundEnded       -> finishRound()
 *   Idle             -> endSession()
 *
 * Events: round:stateChanged { previousState, state, gameId }.
 * Requires js/agp-core.js, js/agp-events.js, js/agp-session.js.
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

    var STATES = {
        IDLE: 'idle',
        REGISTRATION_OPEN: 'registration_open',
        READY: 'ready',
        IN_PROGRESS: 'in_progress',
        ROUND_ENDED: 'round_ended'
    };

    var TRANSITIONS = {};
    TRANSITIONS[STATES.IDLE] = {
        'lobby:opened': STATES.REGISTRATION_OPEN,
        'game:roundStarted': STATES.IN_PROGRESS
    };
    TRANSITIONS[STATES.REGISTRATION_OPEN] = {
        'lobby:closed': STATES.READY,
        'game:roundStarted': STATES.IN_PROGRESS
    };
    TRANSITIONS[STATES.READY] = {
        'game:roundStarted': STATES.IN_PROGRESS
    };
    TRANSITIONS[STATES.IN_PROGRESS] = {
        'game:roundEnded': STATES.ROUND_ENDED
    };
    TRANSITIONS[STATES.ROUND_ENDED] = {
        'game:roundStarted': STATES.IN_PROGRESS
    };

    var RESET_EVENT = 'game:reset';

    var _state = STATES.IDLE;
    var _currentGameId = null;

    /**
     * Walks Session through whatever intermediate transitions it needs
     * (createSession/openRegistration/closeRegistration) so it's in a
     * state that actually allows startRound(). Necessary because Round
     * Manager allows entering InProgress directly from several of its own
     * states (to support games like roulette that skip Lobby entirely),
     * but Session's own state machine doesn't allow skipping its
     * intermediate states — without this, startRound() would silently
     * fail while Round Manager believed the round had started.
     */
    function ensureSessionReadyForRound(gameId) {
        var state = AGP.session.getState();

        if (!state || state === AGP.session.STATES.SESSION_ENDED) {
            if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                AGP.roomsManager.createRoom(gameId || null);
            } else if (typeof AGP.session.createSession === 'function') {
                AGP.session.createSession(gameId || null);
            }
            state = AGP.session.getState();
        }

        if (state === AGP.session.STATES.IDLE && typeof AGP.session.openRegistration === 'function') {
            AGP.session.openRegistration();
            state = AGP.session.getState();
        }

        if (state === AGP.session.STATES.REGISTRATION_OPEN && typeof AGP.session.closeRegistration === 'function') {
            AGP.session.closeRegistration();
        }
    }

    function syncSessionOnEnter(newState, gameId) {
        if (!AGP.session) return;

        switch (newState) {
            case STATES.REGISTRATION_OPEN:
                // Prefer AGP.roomsManager (creates the session internally)
                // so the active room stays in sync; falls back to calling
                // Session directly if roomsManager isn't loaded.
                //
                // getState() returns 'session_ended' (truthy), not null,
                // after a session ends — must check for that explicitly or
                // no second round could ever start after the first game:reset.
                var currentSessionState = AGP.session.getState();
                var needsNewSession = !currentSessionState ||
                    currentSessionState === AGP.session.STATES.SESSION_ENDED;
                if (needsNewSession) {
                    if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                        AGP.roomsManager.createRoom(gameId || null);
                    } else if (typeof AGP.session.createSession === 'function') {
                        AGP.session.createSession(gameId || null);
                    }
                }
                if (typeof AGP.session.openRegistration === 'function') {
                    AGP.session.openRegistration();
                }
                break;

            case STATES.READY:
                if (typeof AGP.session.closeRegistration === 'function') {
                    AGP.session.closeRegistration();
                }
                break;

            case STATES.IN_PROGRESS:
                ensureSessionReadyForRound(gameId);
                if (typeof AGP.session.startRound === 'function') {
                    AGP.session.startRound();
                }
                break;

            case STATES.ROUND_ENDED:
                if (typeof AGP.session.finishRound === 'function') {
                    AGP.session.finishRound();
                }
                break;

            case STATES.IDLE:
                // Prefer roomsManager here too, so no active room is left
                // orphaned after the session actually ends.
                if (AGP.roomsManager && typeof AGP.roomsManager.hasActiveRoom === 'function' && AGP.roomsManager.hasActiveRoom()) {
                    AGP.roomsManager.closeRoom();
                } else if (typeof AGP.session.endSession === 'function') {
                    AGP.session.endSession();
                }
                break;

            default:
                break;
        }
    }

    function transitionTo(newState, eventName, payload) {
        var previousState = _state;
        if (previousState === newState) return;

        if (payload && payload.id) {
            _currentGameId = payload.id;
        }

        _state = newState;

        AGP.log('Round Manager: state changed "' + previousState + '" -> "' + newState + '" (via ' + eventName + ')');
        syncSessionOnEnter(newState, _currentGameId);

        AGP.events.emit('round:stateChanged', {
            previousState: previousState,
            state: newState,
            gameId: _currentGameId,
            causedBy: eventName
        });
    }

    function handleRoundEvent(eventName) {
        return function (payload) {
            if (eventName === RESET_EVENT) {
                transitionTo(STATES.IDLE, eventName, payload);
                return;
            }

            var stateTransitions = TRANSITIONS[_state];
            var nextState = stateTransitions ? stateTransitions[eventName] : null;
            if (!nextState) return; // not a valid transition from the current state

            transitionTo(nextState, eventName, payload);
        };
    }

    var _listenedEvents = {};
    Object.keys(TRANSITIONS).forEach(function (state) {
        Object.keys(TRANSITIONS[state]).forEach(function (eventName) {
            _listenedEvents[eventName] = true;
        });
    });
    _listenedEvents[RESET_EVENT] = true;

    Object.keys(_listenedEvents).forEach(function (eventName) {
        AGP.events.on(eventName, handleRoundEvent(eventName));
    });

    AGP.roundManager = {
        STATES: STATES,

        getState: function () {
            return _state;
        },

        getCurrentGameId: function () {
            return _currentGameId;
        }
    };

    AGP.log('AGP Round Manager loaded — round state driven only by AGP Events (' + Object.keys(_listenedEvents).join(', ') + ').');

}(window.AymanGamesPlatform));
