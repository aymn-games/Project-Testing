/**
 * AGP KEYWORD MANAGER — sets/activates a single join keyword and checks
 * incoming text against it. On match, submits the player only through
 * AGP.playerSource.submitPlayer('keyword', ...).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var SOURCE_KEY = 'keyword';

    var _keyword = null;
    var _active = false;

    function normalize(text) {
        return (typeof text === 'string') ? text.trim().toLowerCase() : '';
    }

    AGP.keywordManager = {

        setKeyword: function (keyword) {
            if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
                AGP.log('Keyword Manager: rejected empty/invalid keyword.');
                return false;
            }
            _keyword = keyword.trim();
            AGP.log('Keyword Manager: keyword set to "' + _keyword + '".');
            AGP.events.emit('keyword:changed', { keyword: _keyword });
            return true;
        },

        getKeyword: function () {
            return _keyword;
        },

        activate: function () {
            if (!_keyword) {
                AGP.log('Keyword Manager: cannot activate, no keyword set.');
                return false;
            }
            _active = true;
            AGP.events.emit('keyword:activated', { keyword: _keyword });
            AGP.log('Keyword Manager: activated.');
            return true;
        },

        deactivate: function () {
            _active = false;
            AGP.events.emit('keyword:deactivated', { keyword: _keyword });
            AGP.log('Keyword Manager: deactivated.');
        },

        isActive: function () {
            return _active;
        },

        checkKeyword: function (text, playerData) {
            if (!_active || !_keyword) {
                AGP.events.emit('keyword:rejected', { reason: 'inactive', text: text, playerData: playerData });
                return null;
            }

            if (normalize(text) !== normalize(_keyword)) {
                AGP.events.emit('keyword:rejected', { reason: 'mismatch', text: text, playerData: playerData });
                return null;
            }

            if (!AGP.playerSource || typeof AGP.playerSource.submitPlayer !== 'function') {
                AGP.log('Keyword Manager: AGP.playerSource not available, cannot submit.');
                return null;
            }

            var player = AGP.playerSource.submitPlayer(SOURCE_KEY, playerData);

            if (player) {
                AGP.events.emit('keyword:accepted', { keyword: _keyword, player: player });
            } else {
                AGP.events.emit('keyword:rejected', { reason: 'rejected_by_player_source', text: text, playerData: playerData });
            }

            return player;
        }
    };

    if (AGP.playerSource && typeof AGP.playerSource.registerSource === 'function') {
        AGP.playerSource.registerSource(SOURCE_KEY, { label: 'Join Keyword' });
    } else {
        AGP.log('Keyword Manager: AGP.playerSource not available yet at load time.');
    }

    AGP.log('AGP Keyword Manager loaded (foundation only, no real source connected).');

}(window.AymanGamesPlatform));
