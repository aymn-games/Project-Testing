/**
 * يراقب بث حساب تيك توك المنصة (@aymngame) من السيرفر نفسه — بدون ما يحتاج
 * أحد يشغّل لعبة. كل POLL_MS يفحص "هل الحساب يبث؟" (tiktok-live-check:
 * طلب HTTP خفيف بدون توقيع)، ولو يبث يفتح اتصال قراءة فقط عبر نفس
 * tiktok-connector. الموصِّل نفسه يلتقط أحداث المتابعة/التعليقات ويحدّث
 * مكافأة المتابعة (راجع trackPlatformFollow بـ tiktok-connector.js)، فهذا
 * الملف مسؤول بس عن فتح الاتصال وقفله.
 *
 * ⚠️ الاتصال يستهلك توقيع WebSocket من خدمة التوقيع (Euler) — مرة لكل بث.
 */
'use strict';

var logger = require('../../utils/logger');
var tiktokLiveCheck = require('./tiktok-live-check');
var tiktokConnector = require('./tiktok-connector');
var followRewardService = require('../../collectibles/follow-reward-service');

var POLL_MS = 3 * 60 * 1000;
var START_DELAY_MS = 45 * 1000;

var _connector = null;
var _started = false;
var _timer = null;

function noop() {}

function closeConnection() {
    if (!_connector) return;
    try { _connector.disconnect(); } catch (err) { /* ignore */ }
    _connector = null;
}

function openConnection(username) {
    var connector = tiktokConnector.createTikTokConnector();
    _connector = connector;
    logger.log('Platform follow watcher: @' + username + ' is live — connecting to read follows.');
    connector.connect({ username: username, source: 'platform-follow-watcher' }, {
        onStatus: function (status, message) {
            if (_connector !== connector) return;
            if (status === 'connected') logger.log('Platform follow watcher: connected to @' + username + ' live.');
            // انتهى البث أو فشل الاتصال — نقفل ونرجع للفحص الدوري.
            if (status === 'ended' || status === 'error' || status === 'disconnected') {
                logger.log('Platform follow watcher: connection ' + status + (message ? ' (' + message + ')' : '') + ' — back to polling.');
                closeConnection();
            }
        },
        onComment: noop,
        onGift: noop,
        onFollow: noop,
        onViewerUpdate: noop
    });
}

function tick() {
    var username = followRewardService.PLATFORM_TIKTOK_USERNAME;
    if (_connector && _connector.isConnected && _connector.isConnected()) return;
    tiktokLiveCheck.isLive(username).then(function (live) {
        if (live === true) {
            if (!_connector) openConnection(username);
        } else if (live === false) {
            closeConnection();
        }
    }).catch(function (err) {
        logger.error('Platform follow watcher: live check failed:', err && err.message);
    });
}

function start() {
    if (_started) return;
    _started = true;
    setTimeout(function () {
        tick();
        _timer = setInterval(tick, POLL_MS);
    }, START_DELAY_MS);
}

module.exports = { start: start };
