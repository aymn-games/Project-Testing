/**
 * AGP BOOTSTRAP — last platform file loaded; its only job is to start the
 * platform once the page is ready. Requires (in this order): agp-core.js,
 * agp-services.js, agp-registry.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    function initPlatform() {
        AGP.log('Initializing platform "' + AGP.config.platformName + '" v' + AGP.config.version + ' ...');

        if (AGP.registry && typeof AGP.registry._discoverGamesFromDOM === 'function') {
            AGP.registry._discoverGamesFromDOM();
        }

        AGP.events.emit('platform:ready', {
            platformName: AGP.config.platformName,
            version: AGP.config.version,
            games: AGP.registry.getAllGames()
        });

        AGP.log('Platform ready. Registered games:', AGP.registry.getAllGames().map(function (g) { return g.id; }));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlatform);
    } else {
        initPlatform();
    }

}(window.AymanGamesPlatform));
