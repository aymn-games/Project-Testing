/**
 * AGP REGISTRY — internal game registry. Reads existing .game-card
 * elements from index.html and records their data for future use
 * (filtering, search, stats, admin panel) without touching the HTML/CSS.
 * Requires js/agp-core.js loaded first.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) {
        AGP.log = function () {};
    }

    var _games = {};

    AGP.registry = {
        /** @param {Object} game - { id, title, url, coverEl, status } */
        registerGame: function (game) {
            if (!game || !game.id) return;
            _games[game.id] = game;
            AGP.log('Game registered:', game.id);
            AGP.events && AGP.events.emit('registry:gameRegistered', game);
        },

        getGame: function (id) {
            return _games[id] || null;
        },

        getAllGames: function () {
            return Object.keys(_games).map(function (id) {
                return _games[id];
            });
        }
    };

    /* Auto-discovery: reads .game-card elements already in index.html.
     * Falls back to a generated id (card order) when data-agp-game-id
     * is missing, so older cards still get discovered. */
    function discoverGamesFromDOM() {
        var cards = document.querySelectorAll('.game-card');

        cards.forEach(function (card, index) {
            var id = card.getAttribute('data-agp-game-id') || ('game-' + (index + 1));
            var status = card.getAttribute('data-agp-game-status') || 'active';

            var titleEl = card.querySelector('.game-title');
            var linkEl = card.querySelector('.btn-play');
            var coverEl = card.querySelector('.game-cover');

            AGP.registry.registerGame({
                id: id,
                title: titleEl ? titleEl.textContent.trim() : null,
                url: linkEl ? linkEl.getAttribute('href') : null,
                coverSrc: coverEl ? coverEl.getAttribute('src') : null,
                status: status,
                domElement: card
            });
        });

        AGP.log('Discovered', cards.length, 'game(s) from the page.');
    }

    AGP.registry._discoverGamesFromDOM = discoverGamesFromDOM;

}(window.AymanGamesPlatform));
