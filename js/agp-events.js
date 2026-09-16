/**
 * AGP EVENTS — extends the AGP.events bus already created by agp-core.js
 * with once() support, and documents the event-naming contract below. If
 * agp-core.js wasn't loaded first, creates a fallback EventBus so nothing
 * depending on AGP.events breaks. Load right after agp-core.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    /* Fallback EventBus, used only when AGP.events doesn't already exist. */
    if (!AGP.events) {
        (function () {
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

                handlers.slice().forEach(function (handler) {
                    try {
                        handler(payload);
                    } catch (err) {
                        console.error('[AGP] Event handler error for "' + eventName + '":', err);
                    }
                });
            };

            AGP.events = new EventBus();
            AGP.log('AGP Events: fallback event bus created (agp-core.js was not loaded first).');
        }());
    }

    /* once(eventName, handler): listener fires once then auto-unsubscribes.
     * Built on top of the existing on/off, whatever their source. */
    if (typeof AGP.events.once !== 'function') {
        AGP.events.once = function (eventName, handler) {
            if (typeof handler !== 'function') return function () {};

            var bus = this;
            var unsubscribe = null;

            function wrappedHandler(payload) {
                if (typeof unsubscribe === 'function') unsubscribe();
                handler(payload);
            }

            unsubscribe = bus.on(eventName, wrappedHandler);
            return unsubscribe;
        };

        AGP.log('AGP Events: once() support added.');
    }

    /* Usage contract (documentation only, no code):
     *
     *   AGP.events.on(eventName, handler)   -> Function (unsubscribe)
     *   AGP.events.off(eventName, handler)  -> void
     *   AGP.events.once(eventName, handler) -> Function (unsubscribe)
     *   AGP.events.emit(eventName, payload) -> void
     *
     * Event names follow "namespace:action" (e.g. 'session:created',
     * 'registry:gameRegistered', 'platform:ready'). Each module owns its
     * namespace and should subscribe to others' events rather than call
     * their functions directly, keeping modules loosely coupled:
     *
     *   session:*    -> agp-session.js
     *   player:*     -> agp-player-manager.js
     *   lobby:*      -> agp-lobby.js
     *   round:*      -> agp-round-manager.js
     *   game:*       -> agp-game-api.js / agp-game-engine.js, also events
     *                    from connected games (e.g. games/roulette)
     *   tiktok:*     -> TikTok service/adapter (future)
     *   cloudflare:* -> Cloudflare Workers/Durable Objects (future)
     *   network:*    -> WebSocket / NetworkService (future)
     *   registry:*   -> agp-registry.js
     *   platform:*   -> agp-bootstrap.js
     */

    AGP.log('AGP Events module ready (on/off/emit/once).');

}(window.AymanGamesPlatform));
