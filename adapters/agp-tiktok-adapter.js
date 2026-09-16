/**
 * AGP TIKTOK ADAPTER (frontend) — WebSocket bridge only; this file has no
 * idea whether the data is mocked or real (that's the backend's decision
 * in backend/platforms/connector-router.js). It opens one WebSocket to
 * the backend, sends connect/disconnect on request, and routes incoming
 * status/comment/gift/follow/error messages to the same AGP entry points
 * documented in docs/BACKEND_ARCHITECTURE.md §10-12 — meaning once the
 * backend's tiktok-connector.js goes from stub to real implementation,
 * this file needs no changes at all.
 *
 * Mutates the existing AGP.services.TikTokService object in place rather
 * than replacing it.
 *
 * Requires js/agp-core.js, js/agp-events.js, js/agp-services.js,
 * js/agp-stream-connector.js, js/agp-keyword-manager.js,
 * js/agp-queue-manager.js loaded first.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.services || !AGP.services.TikTokService) {
        AGP.log('TikTok Adapter: AGP.services.TikTokService not found, cannot attach.');
        return;
    }

    var PLATFORM_KEY = 'tiktok';

    var BACKEND_WS_URL = 'wss://project-testing-akds.onrender.com';

    var _socket = null;
    var _connecting = false;
    var _commentCallback = null;
    var _giftCallback = null;
    var _pendingConnectOptions = null;

    /* Auto-reconnect for the browser<->backend socket itself (separate from
     * the backend's own reconnect to TikTok). No attempt cap — exponential
     * backoff capped at WS_RECONNECT_MAX_DELAY_MS, retried until success or
     * manual disconnect. Reuses _connecting as the "should we be connected
     * right now?" flag, set false by disconnectFromLiveStream(). */
    var WS_RECONNECT_BASE_DELAY_MS = 1000;
    var WS_RECONNECT_MAX_DELAY_MS = 30000;
    var _wsReconnectAttempts = 0;
    var _wsReconnectTimer = null;

    function clearWsReconnectTimer() {
        if (_wsReconnectTimer !== null) {
            clearTimeout(_wsReconnectTimer);
            _wsReconnectTimer = null;
        }
    }

    function scheduleWsReconnect() {
        if (!_connecting) return; // manually disconnected — no retry

        var delay = Math.min(WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, _wsReconnectAttempts), WS_RECONNECT_MAX_DELAY_MS);
        delay += Math.floor(Math.random() * 500); // jitter
        _wsReconnectAttempts++;

        AGP.log('TikTok Adapter: backend connection lost, retrying in ' + delay + 'ms (attempt ' + _wsReconnectAttempts + ')…');
        if (AGP.streamConnector) AGP.streamConnector.reportStatus(PLATFORM_KEY, 'connecting');

        clearWsReconnectTimer();
        _wsReconnectTimer = setTimeout(function () {
            _wsReconnectTimer = null;
            if (!_connecting) return; // disconnected while waiting
            openSocketAndConnect();
        }, delay);
    }

    function handleIncomingComment(payload) {
        if (_commentCallback) _commentCallback(payload);

        // Broadcast every comment regardless of keyword/followers filtering,
        // so games and console diagnostics (?agpDebug=1) can react to raw chat.
        AGP.events.emit('stream:commentReceived', payload);

        // "Followers only" filtering lives here (moved from the backend,
        // where it couldn't be verified reliably).
        if (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') {
            var shellSettings = AGP.gameShell.getSettings();
            if (shellSettings.followersOnly && !payload.isFollower) {
                return;
            }
        }

        // avatarUrl/frame/entrance feed the player card (agp-player-card.js)
        // and the entrance intro animation (agp-entrance.js).
        var playerData = { id: payload.id, name: payload.name, avatarUrl: payload.avatarUrl || null, frame: payload.frame || null, entrance: payload.entrance || null };
        var keywordActive = AGP.keywordManager && AGP.keywordManager.isActive();

        if (keywordActive) {
            AGP.keywordManager.checkKeyword(payload.text, playerData);
        } else if (AGP.queueManager && typeof AGP.queueManager.enqueue === 'function') {
            AGP.queueManager.enqueue(PLATFORM_KEY, playerData);
        }
    }

    function handleIncomingGift(payload) {
        if (_giftCallback) _giftCallback(payload);
        AGP.events.emit('stream:giftReceived', payload);
    }

    function handleIncomingFollow(payload) {
        AGP.events.emit('stream:followReceived', payload);
    }

    function handleIncomingStatus(payload) {
        if (!AGP.streamConnector || typeof AGP.streamConnector.reportStatus !== 'function') return;
        AGP.streamConnector.reportStatus(PLATFORM_KEY, payload.status);
    }

    function handleIncomingError(payload) {
        AGP.log('TikTok Adapter: backend reported error —', payload.code, payload.message);
    }

    function handleSocketMessage(rawMessage) {
        var envelope;
        try {
            envelope = JSON.parse(rawMessage);
        } catch (err) {
            AGP.log('TikTok Adapter: received non-JSON message, ignored.');
            return;
        }
        if (!envelope || !envelope.type || !envelope.payload) return;

        switch (envelope.type) {
            case 'status': handleIncomingStatus(envelope.payload); break;
            case 'comment': handleIncomingComment(envelope.payload); break;
            case 'gift': handleIncomingGift(envelope.payload); break;
            case 'follow': handleIncomingFollow(envelope.payload); break;
            case 'error': handleIncomingError(envelope.payload); break;
            default: AGP.log('TikTok Adapter: unknown message type from backend:', envelope.type);
        }
    }

    function sendToBackend(type, payload) {
        if (!_socket || _socket.readyState !== 1 /* OPEN */) return;
        _socket.send(JSON.stringify({ type: type, payload: payload || {}, timestamp: Date.now() }));
    }

    function ensureSocketOpen(onOpenSendConnect) {
        if (_socket && (_socket.readyState === 0 /* CONNECTING */ || _socket.readyState === 1 /* OPEN */)) {
            if (_socket.readyState === 1) onOpenSendConnect();
            return;
        }

        _socket = new WebSocket(BACKEND_WS_URL);

        _socket.onopen = function () {
            AGP.log('TikTok Adapter: WebSocket connected to backend.');
            _wsReconnectAttempts = 0;
            clearWsReconnectTimer();
            onOpenSendConnect();
        };
        _socket.onmessage = function (event) { handleSocketMessage(event.data); };
        _socket.onerror = function (err) {
            AGP.log('TikTok Adapter: WebSocket error.', err);
            if (AGP.streamConnector) AGP.streamConnector.reportStatus(PLATFORM_KEY, 'error');
        };
        _socket.onclose = function () {
            AGP.log('TikTok Adapter: WebSocket closed.');
            _socket = null;
            scheduleWsReconnect(); // no-ops if _connecting is already false
        };
    }

    function openSocketAndConnect() {
        ensureSocketOpen(function () {
            if (!_connecting) return; // disconnected before the socket finished opening
            sendToBackend('connect', {
                platform: PLATFORM_KEY,
                username: (_pendingConnectOptions && _pendingConnectOptions.username) || null,
                followersOnly: Boolean(_pendingConnectOptions && _pendingConnectOptions.followersOnly)
            });
        });
    }

    AGP.services.TikTokService.connectToLiveStream = function (options) {
        _connecting = true;
        _pendingConnectOptions = options || {};
        _wsReconnectAttempts = 0;
        clearWsReconnectTimer();

        openSocketAndConnect();
    };

    AGP.services.TikTokService.disconnectFromLiveStream = function () {
        _connecting = false;
        clearWsReconnectTimer();
        sendToBackend('disconnect', { platform: PLATFORM_KEY });
        if (_socket) {
            _socket.close();
            _socket = null;
        }
    };

    AGP.services.TikTokService.onComment = function (callback) {
        _commentCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.services.TikTokService.onGift = function (callback) {
        _giftCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.log('AGP TikTok Adapter attached to AGP.services.TikTokService (WebSocket bridge — backend decides mock vs. real).');

}(window.AymanGamesPlatform));
