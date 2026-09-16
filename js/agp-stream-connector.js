/**
 * AGP STREAM CONNECTOR — manages the stream-service stubs in
 * agp-services.js (TikTokService/YouTubeService/TwitchService) behind a
 * uniform connectToLiveStream/disconnectFromLiveStream contract, tracking
 * each platform's status (disconnected/connecting/connected/error) via
 * AGP.events. connect() only sets status to 'connecting' — a real service
 * must call reportStatus(key, status) itself to confirm success/failure,
 * or the status would otherwise sit at 'connecting' forever.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var STATUS = {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        ERROR: 'error'
    };

    var _platforms = {}; // key -> { service, status }

    function registerPlatform(key, service) {
        if (!key || !service) {
            AGP.log('Stream Connector: cannot register platform, missing key or service.');
            return false;
        }
        if (typeof service.connectToLiveStream !== 'function' || typeof service.disconnectFromLiveStream !== 'function') {
            AGP.log('Stream Connector: service for "' + key + '" missing required contract (connectToLiveStream/disconnectFromLiveStream).');
            return false;
        }
        _platforms[key] = { service: service, status: STATUS.DISCONNECTED };
        AGP.log('Stream Connector: platform "' + key + '" registered.');
        return true;
    }

    function getEntry(key) {
        return _platforms[key] || null;
    }

    function isValidStatus(status) {
        var key;
        for (key in STATUS) {
            if (Object.prototype.hasOwnProperty.call(STATUS, key) && STATUS[key] === status) return true;
        }
        return false;
    }

    function setStatus(key, status) {
        var entry = getEntry(key);
        if (!entry) return false;
        entry.status = status;
        AGP.events.emit('stream:statusChanged', { platform: key, status: status });
        return true;
    }

    AGP.streamConnector = {
        STATUS: STATUS,

        registerPlatform: registerPlatform,

        getSupportedPlatforms: function () {
            return Object.keys(_platforms);
        },

        connect: function (key, options) {
            var entry = getEntry(key);
            if (!entry) {
                AGP.log('Stream Connector: unknown platform "' + key + '".');
                return false;
            }
            setStatus(key, STATUS.CONNECTING);
            try {
                entry.service.connectToLiveStream(options);
            } catch (err) {
                console.error('[AGP Stream Connector] "' + key + '".connectToLiveStream() threw:', err);
                setStatus(key, STATUS.ERROR);
                return false;
            }
            return true;
        },

        disconnect: function (key) {
            var entry = getEntry(key);
            if (!entry) {
                AGP.log('Stream Connector: unknown platform "' + key + '".');
                return false;
            }
            try {
                entry.service.disconnectFromLiveStream();
            } catch (err) {
                console.error('[AGP Stream Connector] "' + key + '".disconnectFromLiveStream() threw:', err);
            }
            setStatus(key, STATUS.DISCONNECTED);
            return true;
        },

        /** Called by a real platform service to confirm connect/disconnect
         * outcome (status must be one of AGP.streamConnector.STATUS). */
        reportStatus: function (key, status) {
            if (!getEntry(key)) {
                AGP.log('Stream Connector: cannot report status, unknown platform "' + key + '".');
                return false;
            }
            if (!isValidStatus(status)) {
                AGP.log('Stream Connector: cannot report status, invalid status "' + status + '".');
                return false;
            }
            return setStatus(key, status);
        },

        getStatus: function (key) {
            var entry = getEntry(key);
            return entry ? entry.status : STATUS.DISCONNECTED;
        },

        getConnectedPlatforms: function () {
            return Object.keys(_platforms).filter(function (key) {
                return _platforms[key].status === STATUS.CONNECTED;
            });
        }
    };

    if (AGP.services) {
        if (AGP.services.TikTokService) registerPlatform('tiktok', AGP.services.TikTokService);
        if (AGP.services.YouTubeService) registerPlatform('youtube', AGP.services.YouTubeService);
        if (AGP.services.TwitchService) registerPlatform('twitch', AGP.services.TwitchService);
    } else {
        AGP.log('Stream Connector: AGP.services not available yet, no platforms registered.');
    }

    AGP.log('AGP Stream Connector loaded (foundation only, no real platform connection).');

}(window.AymanGamesPlatform));
