/**
 * AGP SCREEN AUDIO WATCHER — اتصال البث لأدوات الصوت بشاشات Veyro (القارئ الصوتي
 * ومشغّل الأغاني) لما الستريمر يبث بدون لعبة.
 *
 * كل CHECK_MS: الشاشات المفتوحة بتطبيق البث (screenTests.seenKeys خلال IDLE_MS) اللي
 * فيها أداة صوت → يوزر تيك توك لصاحبها → لو يبث نفتح اتصال statsOnly (نفس طريقة
 * stream-stats-watcher.js) يغذّي live-session-stats، ومنه الشات يوصل للرابط.
 * الشاشة تتسكّر (ما سألت السيرفر IDLE_MS) أو البث ينتهي → نقفل الاتصال.
 *
 * الاتصال يمر على المجمّع المشترك (shared-connection-pool.js)، فلو فيه لعبة شغّالة
 * لنفس البث ما ينفتح اتصال تيك توك ثاني. معرّفه يبدأ بـ WATCH_PREFIX عشان يكون
 * هو صاحب أحداث الجلسة (ما تنحسب مرتين). ستريمر عليه مراقب الإحصائيات = يكفي، ما نفتح.
 * مفعّل افتراضياً — SCREEN_AUDIO_CONNECT=0 يقفله.
 */

'use strict';

var CHECK_MS = 30 * 1000;
var IDLE_MS = 2 * 60 * 1000;
var CHECK_GAP_MS = 1500;
var START_DELAY_MS = 25 * 1000;

function normalize(u) {
    var s = String(u || '').trim().replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9._]{2,24}$/.test(s) ? s : null;
}

/**
 * @param {object} deps — seenKeys(ms), findByKey(key), ownerTikTok(userId), isLive(username),
 *   statsWatcherActive(username), createConnector(), stats (live-session-stats), hasAudioTools?, gapMs?, logger?
 */
function createWatcher(deps) {
    var hasAudioTools = deps.hasAudioTools || require('./screen-audio-design').hasAudioTools;
    var log = deps.logger || { log: function () {}, error: function () {} };
    var gapMs = deps.gapMs == null ? CHECK_GAP_MS : deps.gapMs;
    var stats = deps.stats;
    var _active = new Map(); // username -> { connector, id }
    var _ticking = false;

    function delay(ms) { return ms ? new Promise(function (r) { setTimeout(r, ms); }) : Promise.resolve(); }

    function stop(username, reason) {
        var a = _active.get(username);
        if (!a) return;
        _active.delete(username);
        stats.setWatching(username, false);
        try { a.connector.disconnect(); } catch (e) { /* ignore */ }
        log.log('Screen Audio: stopped "' + username + '" (' + reason + ').');
    }

    function start(username) {
        var connector = deps.createConnector();
        if (!connector) return;
        var id = stats.WATCH_PREFIX + 'audio:' + username + ':' + Date.now().toString(36);
        var a = { connector: connector, id: id };
        _active.set(username, a);
        stats.setWatching(username, true);
        log.log('Screen Audio: "' + username + '" is live with an audio screen open — connecting.');
        function mine() { return _active.get(username) === a; }
        connector.connect({ username: username, statsOnly: true }, {
            onStatus: function (status) {
                if (!mine()) return;
                if (status === 'connected') stats.attach(username, connector.getRoomId ? connector.getRoomId() : null, id);
                else if (status === 'ended') { stats.markEnded(username, id); stop(username, 'stream ended'); }
                else if (status === 'error') stop(username, 'connection error — retry next check');
            },
            onComment: function (d) { stats.recordComment(username, id, d); },
            onGift: function (d) { stats.recordGift(username, id, d); },
            onFollow: function (d) { stats.recordFollow(username, id, d); },
            onViewerUpdate: function (d) { stats.recordViewers(username, id, d.current, d.totalUsers); },
            onLike: function (d) { stats.recordLike(username, id, d); },
            onShare: function (d) { stats.recordShare(username, id, d); },
            onMember: function (d) { stats.recordMember(username, id, d); },
            onSubscribe: function (d) { stats.recordSubscribe(username, id, d); }
        });
    }

    /** اليوزرات اللي عندهم شاشة صوت مفتوحة الحين */
    function wanted() {
        var set = new Set();
        deps.seenKeys(IDLE_MS).forEach(function (key) {
            var o = deps.findByKey(key);
            if (!o) return;
            var a = hasAudioTools(o.design);
            if (!a.tts && !a.music) return;
            var u = normalize(deps.ownerTikTok(o.userId));
            if (u) set.add(u);
        });
        return set;
    }

    function tick() {
        if (_ticking) return Promise.resolve();
        _ticking = true;
        var want;
        try { want = wanted(); } catch (err) { _ticking = false; log.error('Screen Audio: failed to list screens:', err); return Promise.resolve(); }
        _active.forEach(function (a, u) { if (!want.has(u)) stop(u, 'screen closed'); });
        var pending = Array.from(want).filter(function (u) { return !_active.has(u) && !deps.statsWatcherActive(u); });
        return pending.reduce(function (chain, u) {
            return chain.then(function () {
                return Promise.resolve(deps.isLive(u)).then(function (live) {
                    if (live === true && !_active.has(u)) start(u);
                }).then(function () { return delay(gapMs); });
            });
        }, Promise.resolve()).catch(function (err) {
            log.error('Screen Audio: check cycle failed:', err);
        }).then(function () { _ticking = false; });
    }

    return { tick: tick, active: function () { return Array.from(_active.keys()); } };
}

var _started = false;
function startScreenAudioWatcher() {
    if (_started) return;
    var config = require('../config');
    var logger = require('../utils/logger');
    if (!config.screenAudioConnect) {
        logger.info('Screen Audio: live connection for audio screens disabled (SCREEN_AUDIO_CONNECT=0).');
        return;
    }
    _started = true;
    var screenTests = require('./screen-tests');
    var streamScreens = require('./stream-screens-service');
    var statsWatcher = require('./stream-stats-watcher');
    var w = createWatcher({
        seenKeys: screenTests.seenKeys,
        findByKey: streamScreens.findByKey,
        ownerTikTok: streamScreens.ownerTikTok,
        isLive: require('../platforms/tiktok/tiktok-live-check').isLive,
        statsWatcherActive: function (u) { return Boolean(statsWatcher.statusOf(u)); },
        createConnector: function () { return require('../platforms/connector-router').createConnectorForPlatform('tiktok', { source: 'screen-audio' }); },
        stats: require('./live-session-stats'),
        logger: logger
    });
    setTimeout(function () {
        w.tick();
        var timer = setInterval(w.tick, CHECK_MS);
        if (timer.unref) timer.unref();
    }, START_DELAY_MS);
}

module.exports = { createWatcher: createWatcher, startScreenAudioWatcher: startScreenAudioWatcher };
