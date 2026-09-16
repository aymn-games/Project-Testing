/**
 * AGP CORE — core of the "Ayman Games" platform (AymanGamesPlatform).
 * All platform code lives under this namespace only; never write
 * directly to window or page-level variables.
 *
 * Load order in index.html:
 *   1) js/agp-core.js       (this file) Namespace + Config + Event Bus
 *   2) js/agp-services.js
 *   3) js/agp-registry.js
 *   4) js/agp-bootstrap.js
 */

/* Reuse the existing object (if any) so reloading this file by mistake
 * doesn't drop already-registered data. */
window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    /* Debug defaults off in production, on for localhost/127.0.0.1, and
     * can be forced either way via ?agpDebug=1 / ?agpDebug=0 regardless
     * of host. (Debug logging on every event was previously always-on,
     * which noticeably slowed the page under real TikTok Live traffic.) */
    function computeDefaultDebug() {
        try {
            if (typeof window === 'undefined' || !window.location) return false;

            var search = window.location.search || '';
            var match = /[?&]agpDebug=([^&]*)/.exec(search);
            if (match) {
                var value = decodeURIComponent(match[1]);
                return value !== '0' && value !== 'false';
            }

            var host = window.location.hostname;
            return !host || host === 'localhost' || host === '127.0.0.1';
        } catch (err) {
            return false;
        }
    }

    /* Platform config — other parts of the platform should read from
     * here rather than hardcoding values. */
    AGP.config = {
        platformName: 'AymanGamesPlatform',
        version: '0.1.0',
        debug: computeDefaultDebug(),

        // Feature flags: added here as false, flipped on once implemented
        features: {
            realtimeSync: false,
            tiktokLive: false,
            youtubeLive: false,
            twitchLive: false,
            cloudflareWorkers: false,
            durableObjects: false,
            liveChatProviders: false
        }
    };

    /** Internal logger that respects debug mode; used platform-wide
     * instead of console.log directly. */
    AGP.log = function () {
        if (!AGP.config.debug) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[' + AGP.config.platformName + ']');
        console.log.apply(console, args);
    };

    /** Manual runtime override of debug mode (e.g. from the console). */
    AGP.setDebug = function (enabled) {
        AGP.config.debug = !!enabled;
    };

    /* Event Bus — in-browser publish/subscribe only, no network layer. */
    function EventBus() {
        this._listeners = {};
    }

    EventBus.prototype.on = function (eventName, handler) {
        if (typeof handler !== 'function') return function () {};
        if (!this._listeners[eventName]) {
            this._listeners[eventName] = [];
        }
        this._listeners[eventName].push(handler);

        var listeners = this._listeners[eventName];
        return function unsubscribe() {
            var index = listeners.indexOf(handler);
            if (index !== -1) listeners.splice(index, 1);
        };
    };

    EventBus.prototype.off = function (eventName, handler) {
        if (!this._listeners[eventName]) return;
        var index = this._listeners[eventName].indexOf(handler);
        if (index !== -1) this._listeners[eventName].splice(index, 1);
    };

    EventBus.prototype.emit = function (eventName, payload) {
        AGP.log('Event emitted:', eventName, payload);
        var handlers = this._listeners[eventName];
        if (!handlers || handlers.length === 0) return;

        // Copy before iterating: a handler may unsubscribe during dispatch
        handlers.slice().forEach(function (handler) {
            try {
                handler(payload);
            } catch (err) {
                console.error('[' + AGP.config.platformName + '] Event handler error for "' + eventName + '":', err);
            }
        });
    };

    AGP.events = new EventBus();

    /* Future hooks — unimplemented placeholders for later stages, no
     * network/external calls happen through these yet. */
    AGP.hooks = {
        cloudflareWorkers: null,
        durableObjects: null,
        webSocket: null,
        realtimeSync: null,
        liveChatProviders: []
    };

    AGP.log('AGP Core loaded — version', AGP.config.version);

}(window.AymanGamesPlatform));
