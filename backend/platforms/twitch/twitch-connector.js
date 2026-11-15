/**
 * AGP TWITCH CONNECTOR — اتصال ببث تويتش عبر EventSub الرسمي (Webhooks).
 * نفس شكل موصِّل تيك توك وكيك عشان ws-server.js والألعاب ما تفرق:
 *
 *   createTwitchConnector() -> { connect(options, callbacks), disconnect(), isConnected(), getRoomId() }
 *   options.username = اسم القناة في تويتش (login)، أو رابطها twitch.tv/<login>.
 *
 * تحويل الأحداث (dev.twitch.tv/docs/eventsub/reference):
 *   channel.chat.message          -> onComment
 *   channel.cheer                 -> onGift (القيمة = عدد الـBits: كل Bit = عملة وحدة)
 *   channel.subscribe (مو هدية) / channel.subscription.message (تجديد)
 *                                 -> onGift + onSubscribe (SUB_GIFT_VALUE × مضاعف المستوى)
 *   channel.subscription.gift     -> onGift (× عدد الاشتراكات المهداة)
 *   channel.follow                -> onFollow
 *   stream.offline                -> onStatus('ended')
 *   تويتش ما فيه لايكات ولا مشاركات.
 *
 * شرط: صاحب القناة ربط حساب تويتش بالموقع (auth/twitch-oauth-service.js) —
 * تويتش ما يسمح بقراءة الشات بدون موافقته. معرّف اللاعب "twitch:<login>".
 */

'use strict';

var logger = require('../../utils/logger');
var twitchApi = require('./twitch-api');
var twitchHub = require('./twitch-hub');

// نفس قيمة اشتراك كيك (≈ سعر الاشتراك). المستوى 2 و3 أغلى (~2× و~5×).
var SUB_GIFT_VALUE = 500;
var TIER_MULTIPLIER = { '1000': 1, '2000': 2, '3000': 5 };

var MSG_NOT_CONFIGURED = 'ربط تويتش غير مفعّل بالسيرفر حالياً.';
var MSG_MISSING_LOGIN = 'اكتب اسم قناتك في تويتش.';
var MSG_NOT_FOUND = 'ما لقينا قناة تويتش بهذا الاسم — تأكد من اسم القناة كما يظهر في رابطها (twitch.tv/اسم-القناة).';
var MSG_OFFLINE = 'القناة مو في بث مباشر الحين — ابدأ البث في تويتش أولاً ثم اضغط اتصال.';
var MSG_NOT_AUTHORIZED = 'تويتش ما سمح بقراءة شات القناة — صاحب القناة لازم يربط حساب تويتش من صفحة «حسابي» بالموقع.';
var MSG_FAILED = 'تعذّر الاشتراك بأحداث بث تويتش — جرّب مرة ثانية بعد شوي.';
var MSG_STREAM_ENDED = 'انتهى البث في تويتش.';

function normalizeLogin(input) {
    var s = String(input || '').trim();
    s = s.replace(/^(https?:\/\/)?(www\.|m\.)?twitch\.tv\//i, '').replace(/^@+/, '');
    return s.split(/[/?#]/)[0].toLowerCase();
}

function player(login, name) {
    if (!login) return null;
    return { id: 'twitch:' + String(login).toLowerCase(), name: String(name || login) };
}

function subValue(tier) {
    return SUB_GIFT_VALUE * (TIER_MULTIPLIER[String(tier)] || 1);
}

function isModerator(badges) {
    return (Array.isArray(badges) ? badges : []).some(function (b) { return b && (b.set_id === 'moderator' || b.set_id === 'broadcaster'); });
}

/** يحوّل حدث تويتش لاستدعاءات الموصِّل. @returns {boolean} true لو البث انتهى. */
function routeEvent(evt, callbacks) {
    var type = evt && evt.type;
    var e = (evt && evt.data) || {};
    var p;
    switch (type) {
        case 'channel.chat.message':
            p = player(e.chatter_user_login, e.chatter_user_name);
            if (!p) return false;
            callbacks.onComment({
                id: p.id, name: p.name, text: String((e.message && e.message.text) || '').trim(),
                // تويتش ما يرسل بالشات هل صاحب التعليق متابع — true عشان «المتابعين فقط» ما يحجب الشات.
                isFollower: true, avatarUrl: null, avatarUrls: [],
                isModerator: isModerator(e.badges)
            });
            return false;

        case 'channel.cheer':
            if (e.is_anonymous) return false;
            p = player(e.user_login, e.user_name);
            if (!p) return false;
            callbacks.onGift({ id: p.id, name: p.name, giftName: 'Bits', giftId: 'twitch:bits', giftValue: Number(e.bits) || 0, repeatCount: 1, avatarUrl: null });
            return false;

        case 'channel.subscribe':
            if (e.is_gift) return false; // الإهداء يوصل كحدث channel.subscription.gift لصاحب الهدية
            // falls through
        case 'channel.subscription.message':
            p = player(e.user_login, e.user_name);
            if (!p) return false;
            callbacks.onGift({ id: p.id, name: p.name, giftName: 'اشتراك', giftId: 'twitch:subscription', giftValue: subValue(e.tier), repeatCount: 1, avatarUrl: null });
            if (callbacks.onSubscribe) callbacks.onSubscribe({ id: p.id, name: p.name, avatarUrls: [] });
            return false;

        case 'channel.subscription.gift':
            if (e.is_anonymous) return false;
            p = player(e.user_login, e.user_name);
            if (!p || !(Number(e.total) > 0)) return false;
            callbacks.onGift({ id: p.id, name: p.name, giftName: 'اشتراك هدية', giftId: 'twitch:subscription-gift', giftValue: subValue(e.tier), repeatCount: Number(e.total), avatarUrl: null });
            return false;

        case 'channel.follow':
            p = player(e.user_login, e.user_name);
            if (!p) return false;
            callbacks.onFollow({ id: p.id, name: p.name, avatarUrls: [] });
            return false;

        case 'stream.offline':
            return true;

        default:
            return false;
    }
}

function createTwitchConnector() {
    var _callbacks = null;
    var _connected = false;
    var _disposed = false;
    var _listener = null;
    var _broadcasterId = null;

    function stop() {
        _connected = false;
        if (_listener) { _listener.remove(); _listener = null; }
    }
    function fail(message) {
        stop();
        if (_callbacks && !_disposed) _callbacks.onStatus('error', message);
    }

    return {
        connect: function (options, callbacks) {
            _callbacks = callbacks;
            options = options || {};
            if (!twitchApi.isConfigured()) { callbacks.onStatus('error', MSG_NOT_CONFIGURED); return; }
            var login = normalizeLogin(options.username);
            if (!login) { callbacks.onStatus('error', MSG_MISSING_LOGIN); return; }

            callbacks.onStatus('connecting');

            twitchApi.getUserByLogin(login).then(function (user) {
                if (_disposed) return null;
                if (!user || !user.id) { fail(MSG_NOT_FOUND); return null; }
                _broadcasterId = user.id;
                return twitchApi.isLive(user.id).then(function (live) {
                    if (_disposed) return;
                    if (!live) { fail(MSG_OFFLINE); return; }

                    if (options.source === 'library') {
                        _connected = true;
                        callbacks.onStatus('connected');
                        return;
                    }

                    _listener = twitchHub.addListener(_broadcasterId, function (evt) {
                        if (!_connected || _disposed) return;
                        if (routeEvent(evt, callbacks)) {
                            stop();
                            callbacks.onStatus('ended', MSG_STREAM_ENDED);
                        }
                    });
                    return _listener.ready.then(function () {
                        if (_disposed) return;
                        _connected = true;
                        logger.log('Twitch Connector: connected to channel "' + login + '" (' + _broadcasterId + ').');
                        callbacks.onStatus('connected');
                    }, function (err) {
                        logger.error('Twitch Connector: subscribe failed for "' + login + '":', err && err.message);
                        fail(err && err.code === 'chat_subscription_failed' ? MSG_NOT_AUTHORIZED : MSG_FAILED);
                    });
                });
            }).catch(function (err) {
                logger.error('Twitch Connector: connect failed for "' + login + '":', err && err.message);
                fail(MSG_FAILED);
            });
        },
        disconnect: function () { _disposed = true; stop(); },
        isConnected: function () { return _connected; },
        getRoomId: function () { return _broadcasterId ? 'twitch:' + _broadcasterId : null; }
    };
}

module.exports = {
    createTwitchConnector: createTwitchConnector,
    SUB_GIFT_VALUE: SUB_GIFT_VALUE,
    _normalizeLogin: normalizeLogin,
    _routeEvent: routeEvent
};
