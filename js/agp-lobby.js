/**
 * AGP LOBBY — pre-round waiting stage: opens/closes registration, gates
 * player joins, and tracks a 5-state lobby lifecycle (own concept,
 * separate from Session's state machine):
 *
 *   Closed -> RegistrationOpen -> ReadyToStart -> InGame -> Finished
 *     -> RegistrationOpen (new round) | InGame (same players, no reopen)
 *   any state -> Closed via game:reset
 *
 * Transitions happen only by listening to AGP events (lobby:opened/closed,
 * game:roundStarted/roundEnded/reset) — there's no public setLobbyState().
 * This also listens directly for game:roundStarted/roundEnded/reset
 * because the connected roulette game reports those without ever calling
 * AGP.lobby.open()/close().
 *
 * Session Manager remains the source of truth for registrationOpen/STATES;
 * this file doesn't duplicate that state. Player Manager remains the sole
 * owner of the player list; requestJoin() only gates on lobby state, then
 * delegates to AGP.player.addPlayer(). Events: lobby:opened, lobby:closed,
 * lobby:playerAccepted, lobby:playerRejected, lobby:stateChanged.
 *
 * Requires js/agp-core.js, js/agp-events.js, js/agp-session.js,
 * js/agp-player-manager.js loaded first.
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

    var LOBBY_STATES = {
        CLOSED: 'closed',
        REGISTRATION_OPEN: 'registration_open',
        READY_TO_START: 'ready_to_start',
        IN_GAME: 'in_game',
        FINISHED: 'finished'
    };

    var LOBBY_TRANSITIONS = {};
    LOBBY_TRANSITIONS[LOBBY_STATES.CLOSED] = {
        'lobby:opened': LOBBY_STATES.REGISTRATION_OPEN,
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.REGISTRATION_OPEN] = {
        'lobby:closed': LOBBY_STATES.READY_TO_START,
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.READY_TO_START] = {
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.IN_GAME] = {
        'game:roundEnded': LOBBY_STATES.FINISHED
    };
    LOBBY_TRANSITIONS[LOBBY_STATES.FINISHED] = {
        'lobby:opened': LOBBY_STATES.REGISTRATION_OPEN,
        'game:roundStarted': LOBBY_STATES.IN_GAME
    };

    var LOBBY_RESET_EVENT = 'game:reset';

    var _lobbyState = LOBBY_STATES.CLOSED;

    function transitionLobbyTo(newState, eventName) {
        var previousState = _lobbyState;
        if (previousState === newState) return;

        _lobbyState = newState;

        AGP.log('Lobby: state changed "' + previousState + '" -> "' + newState + '" (via ' + eventName + ')');
        AGP.events.emit('lobby:stateChanged', {
            previousState: previousState,
            state: newState,
            causedBy: eventName
        });
    }

    function handleLobbyLifecycleEvent(eventName) {
        return function () {
            if (eventName === LOBBY_RESET_EVENT) {
                if (AGP.player && typeof AGP.player.reset === 'function') {
                    AGP.player.reset();
                }

                transitionLobbyTo(LOBBY_STATES.CLOSED, eventName);

                // Deliberately doesn't auto-reopen registration here: at this
                // point AGP.session hasn't ended yet (that happens later via
                // a separate listener in agp-round-manager.js), so
                // AGP.session.openRegistration() would always reject the
                // transition. Reopening happens later via the normal path
                // (AGP.lobby.open() / a new round).
                return;
            }

            var stateTransitions = LOBBY_TRANSITIONS[_lobbyState];
            var nextState = stateTransitions ? stateTransitions[eventName] : null;
            if (!nextState) return; // not a valid transition from the current state

            transitionLobbyTo(nextState, eventName);
        };
    }

    var _lobbyListenedEvents = {};
    Object.keys(LOBBY_TRANSITIONS).forEach(function (state) {
        Object.keys(LOBBY_TRANSITIONS[state]).forEach(function (eventName) {
            _lobbyListenedEvents[eventName] = true;
        });
    });
    _lobbyListenedEvents[LOBBY_RESET_EVENT] = true;

    Object.keys(_lobbyListenedEvents).forEach(function (eventName) {
        AGP.events.on(eventName, handleLobbyLifecycleEvent(eventName));
    });

    AGP.lobby = {

        STATES: LOBBY_STATES,

        open: function () {
            if (!AGP.session || typeof AGP.session.openRegistration !== 'function') {
                AGP.log('Lobby: Session Manager not available, cannot open registration.');
                return false;
            }

            // openRegistration() needs an existing Idle-state session; ensure
            // one exists (via AGP.roomsManager, same delegation used in
            // agp-round-manager.js) before attempting to open it.
            var currentState = AGP.session.getState();
            var needsNewSession = !currentState || currentState === AGP.session.STATES.SESSION_ENDED;
            if (needsNewSession) {
                if (AGP.roomsManager && typeof AGP.roomsManager.createRoom === 'function') {
                    AGP.roomsManager.createRoom();
                } else if (typeof AGP.session.createSession === 'function') {
                    AGP.session.createSession();
                }
            }

            var ok = AGP.session.openRegistration();

            if (ok) {
                AGP.log('Lobby: registration opened.');
                AGP.events.emit('lobby:opened', {
                    joinCode: (typeof AGP.session.getJoinCode === 'function') ? AGP.session.getJoinCode() : null
                });
            } else {
                AGP.log('Lobby: failed to open registration (invalid session state transition).');
            }

            return ok;
        },

        close: function () {
            if (!AGP.session || typeof AGP.session.closeRegistration !== 'function') {
                AGP.log('Lobby: Session Manager not available, cannot close registration.');
                return false;
            }

            var ok = AGP.session.closeRegistration();

            if (ok) {
                AGP.log('Lobby: registration closed.');
                AGP.events.emit('lobby:closed', {});
            } else {
                AGP.log('Lobby: failed to close registration (invalid session state transition).');
            }

            return ok;
        },

        isOpen: function () {
            if (!AGP.session || typeof AGP.session.isRegistrationOpen !== 'function') {
                return false;
            }
            return AGP.session.isRegistrationOpen();
        },

        getLobbyState: function () {
            return _lobbyState;
        },

        /** Gates on the lobby lifecycle being exactly RegistrationOpen
         * (not just Session's registrationOpen flag), so joins stop the
         * instant the lobby moves to ReadyToStart/InGame. */
        requestJoin: function (playerData) {
            if (_lobbyState !== LOBBY_STATES.REGISTRATION_OPEN) {
                AGP.log('Lobby: join rejected, lobby state is "' + _lobbyState + '" (not registration_open).', playerData);
                AGP.events.emit('lobby:playerRejected', {
                    reason: 'registration_closed',
                    playerData: playerData
                });
                return null;
            }

            if (!AGP.player || typeof AGP.player.addPlayer !== 'function') {
                AGP.log('Lobby: Player Manager not available.');
                AGP.events.emit('lobby:playerRejected', {
                    reason: 'player_manager_unavailable',
                    playerData: playerData
                });
                return null;
            }

            var player = AGP.player.addPlayer(playerData);

            if (!player) {
                // AGP.player.addPlayer already emitted player:joinRejected;
                // mirror it as lobby:playerRejected for lobby:*-only listeners.
                AGP.log('Lobby: join rejected by Player Manager.', playerData);
                AGP.events.emit('lobby:playerRejected', {
                    reason: 'rejected_by_player_manager',
                    playerData: playerData
                });
                return null;
            }

            AGP.log('Lobby: player accepted.', player.id);
            AGP.events.emit('lobby:playerAccepted', { player: player });

            return player;
        },

        getStatus: function () {
            return {
                isOpen: this.isOpen(),
                lobbyState: _lobbyState,
                sessionState: (AGP.session && typeof AGP.session.getState === 'function')
                    ? AGP.session.getState() : null,
                joinCode: (AGP.session && typeof AGP.session.getJoinCode === 'function')
                    ? AGP.session.getJoinCode() : null,
                playersCount: (AGP.player && typeof AGP.player.getPlayersCount === 'function')
                    ? AGP.player.getPlayersCount() : 0,
                players: (AGP.player && typeof AGP.player.getAllPlayers === 'function')
                    ? AGP.player.getAllPlayers() : []
            };
        },

        /** Console-only debugging helper, unused elsewhere in the platform. */
        printStatus: function () {
            var status = this.getStatus();
            console.log('[AGP Lobby] Status:', status);
            return status;
        },

        /** Console-only debugging shortcut for requestJoin. */
        debugJoin: function (id, name) {
            return this.requestJoin({ id: id, name: name });
        }
    };

    AGP.log('AGP Lobby Manager loaded — real life cycle (' + Object.keys(_lobbyListenedEvents).join(', ') + ').');

}(window.AymanGamesPlatform));
