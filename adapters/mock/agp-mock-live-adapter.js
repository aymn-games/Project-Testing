/**
 * AGP MOCK LIVE ADAPTER — fully local simulation, no real connection.
 *
 * DEPRECATED: no longer loaded by dashboard-core/index.html. Simulation
 * moved server-side (backend/platforms/mock/mock-connector.js); the
 * browser now receives it via adapters/agp-tiktok-adapter.js's WebSocket
 * bridge. Kept here for reference only, not wired into any page.
 *
 * Implements the AGP.services.TikTokService contract (connectToLiveStream/
 * disconnectFromLiveStream/onComment/onGift) by mutating the existing
 * object in place — AGP.streamConnector already holds a reference to it,
 * so mutating in place makes it pick up this simulation regardless of
 * load order relative to agp-stream-connector.js.
 *
 * Simulates: connection delay then a periodic setInterval heartbeat
 * producing comments (some matching the active join keyword), gifts, and
 * follows — routed through the same AGP Core entry points a real adapter
 * would use (streamConnector.reportStatus, keywordManager.checkKeyword,
 * queueManager.enqueue, stream:giftReceived/followReceived events).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.services || !AGP.services.TikTokService) {
        AGP.log('Mock Live Adapter: AGP.services.TikTokService not found, cannot attach mock.');
        return;
    }

    var PLATFORM_KEY = 'tiktok';

    var MOCK_USERNAMES = [
        'ahmad_gamer', 'sara.live', 'omar_ksa', 'nourah22', 'faisal_tv',
        'layla_x', 'khalid.stream', 'reem_here', 'yousef99', 'hind_live'
    ];

    var MOCK_FILLER_COMMENTS = [
        '🔥🔥🔥', 'lets go!', 'من وين البث', 'حياكم', '😂😂', 'yesss',
        'من فترة اتابعك', 'شنو اللعبة هذي', 'gg', '👏👏'
    ];

    var MOCK_GIFTS = [
        { name: 'Rose', value: 1 },
        { name: 'Heart', value: 5 },
        { name: 'Lion', value: 500 },
        { name: 'Galaxy', value: 1000 }
    ];

    var _connecting = false;
    var _intervalId = null;
    var _commentCallback = null;
    var _giftCallback = null;

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function randomViewer() {
        var username = pick(MOCK_USERNAMES);
        return { id: PLATFORM_KEY + ':' + username.toLowerCase(), name: username };
    }

    function simulateComment() {
        var viewer = randomViewer();
        var keywordActive = AGP.keywordManager && AGP.keywordManager.isActive();
        var currentKeyword = keywordActive ? AGP.keywordManager.getKeyword() : null;

        // ~40% of comments match the active keyword to exercise the real
        // join path; the rest are generic chat that matches nothing.
        var text = (keywordActive && currentKeyword && Math.random() < 0.4)
            ? currentKeyword
            : pick(MOCK_FILLER_COMMENTS);

        var rawComment = { platform: PLATFORM_KEY, id: viewer.id, name: viewer.name, text: text, timestamp: Date.now() };
        if (_commentCallback) _commentCallback(rawComment);

        var playerData = { id: viewer.id, name: viewer.name };

        if (keywordActive) {
            AGP.keywordManager.checkKeyword(text, playerData);
        } else if (AGP.queueManager && typeof AGP.queueManager.enqueue === 'function') {
            AGP.queueManager.enqueue(PLATFORM_KEY, playerData);
        }
    }

    function simulateGift() {
        var viewer = randomViewer();
        var gift = pick(MOCK_GIFTS);
        var payload = {
            platform: PLATFORM_KEY,
            id: viewer.id,
            name: viewer.name,
            giftName: gift.name,
            giftValue: gift.value,
            repeatCount: 1,
            timestamp: Date.now()
        };

        if (_giftCallback) _giftCallback(payload);
        AGP.events.emit('stream:giftReceived', payload);
    }

    function simulateFollow() {
        var viewer = randomViewer();
        AGP.events.emit('stream:followReceived', {
            platform: PLATFORM_KEY,
            id: viewer.id,
            name: viewer.name,
            timestamp: Date.now()
        });
    }

    function tick() {
        var roll = Math.random();
        if (roll < 0.55) {
            simulateComment();
        } else if (roll < 0.85) {
            simulateGift();
        } else {
            simulateFollow();
        }
    }

    function startSimulationLoop() {
        stopSimulationLoop();
        _intervalId = setInterval(tick, 1500 + Math.random() * 1500);
    }

    function stopSimulationLoop() {
        if (_intervalId !== null) {
            clearInterval(_intervalId);
            _intervalId = null;
        }
    }

    AGP.services.TikTokService.connectToLiveStream = function (options) {
        AGP.log('Mock Live Adapter: simulating connection…', options);
        _connecting = true;

        setTimeout(function () {
            if (!_connecting) return; // disconnected before the simulated delay finished

            if (!AGP.streamConnector || typeof AGP.streamConnector.reportStatus !== 'function') {
                AGP.log('Mock Live Adapter: AGP.streamConnector.reportStatus not available.');
                return;
            }

            AGP.streamConnector.reportStatus(PLATFORM_KEY, AGP.streamConnector.STATUS.CONNECTED);
            startSimulationLoop();
        }, 800 + Math.random() * 700);
    };

    AGP.services.TikTokService.disconnectFromLiveStream = function () {
        _connecting = false;
        stopSimulationLoop();
        AGP.log('Mock Live Adapter: simulated disconnect.');
    };

    AGP.services.TikTokService.onComment = function (callback) {
        _commentCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.services.TikTokService.onGift = function (callback) {
        _giftCallback = (typeof callback === 'function') ? callback : null;
    };

    AGP.log('AGP Mock Live Adapter attached to AGP.services.TikTokService (simulation only, no real connection).');

}(window.AymanGamesPlatform));
