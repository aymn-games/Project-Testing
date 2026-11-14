/**
 * AGP KICK CONNECTOR — اتصال ببث كيك عبر الـAPI الرسمي (Webhooks).
 * نفس شكل موصِّل تيك توك (platforms/tiktok/tiktok-connector.js) عشان
 * ws-server.js والألعاب ما تفرق بين المنصتين:
 *
 *   createKickConnector() -> { connect(options, callbacks), disconnect(), isConnected(), getRoomId() }
 *   options.username = اسم القناة في كيك (slug)، أو رابطها kick.com/<slug>.
 *
 * تحويل الأحداث (docs.kick.com/events/event-types):
 *   chat.message.sent                -> onComment
 *   kicks.gifted                     -> onGift   (القيمة = عدد الـKicks: كل Kick = عملة تيك توك وحدة)
 *   channel.subscription.new/renewal -> onGift + onSubscribe (القيمة SUB_GIFT_VALUE)
 *   channel.subscription.gifts       -> onGift   (SUB_GIFT_VALUE × عدد المهدى لهم)
 *   channel.followed                 -> onFollow
 *   livestream.status.updated        -> onStatus('ended') لما is_live=false
 *   كيك ما فيه لايكات ولا مشاركات ولا عدد مشاهدين بالأحداث.
 *
 * معرّف اللاعب "kick:<username>" — يميّزه عن يوزرات تيك توك (نقاط المنصة
 * مربوطة بتيك توك فقط، راجع tiktokUsernameForPlayer بـ auth/auth-client.js).
 */

'use strict';

var logger = require('../../utils/logger');
var kickApi = require('./kick-api');
var kickHub = require('./kick-hub');

// قيمة الاشتراك الواحد بعملة الألعاب (≈ سعر الاشتراك بالـKicks).
var SUB_GIFT_VALUE = 500;

var MSG_NOT_CONFIGURED = 'ربط كيك غير مفعّل بالسيرفر حالياً.';
var MSG_MISSING_SLUG = 'اكتب اسم قناتك في كيك.';
var MSG_NOT_FOUND = 'ما لقينا قناة كيك بهذا الاسم — تأكد من اسم القناة كما يظهر في رابطها (kick.com/اسم-القناة).';
var MSG_OFFLINE = 'القناة مو في بث مباشر الحين — ابدأ البث في كيك أولاً ثم اضغط اتصال.';
var MSG_SUBSCRIBE_FAILED = 'تعذّر الاشتراك بأحداث بث كيك — جرّب مرة ثانية بعد شوي.';
var MSG_STREAM_ENDED = 'انتهى البث في كيك.';

/** "https://kick.com/Some_Name/" أو "@Some_Name" → "some_name". */
function normalizeSlug(input) {
    var s = String(input || '').trim();
    s = s.replace(/^(https?:\/\/)?(www\.)?kick\.com\//i, '').replace(/^@+/, '');
    s = s.split(/[/?#]/)[0];
    return s.toLowerCase();
}

/** "Hi [emote:37226:KEKW]" → "Hi KEKW" — الألعاب تقارن النص كلمات. */
function cleanContent(text) {
    return String(text || '').replace(/\[emote:\d+:([^\]]*)\]/g, '$1').replace(/\s+/g, ' ').trim();
}

function playerOf(user) {
    if (!user || user.is_anonymous || !user.username) return null;
    var slug = String(user.channel_slug || user.username).toLowerCase();
    return {
        id: 'kick:' + slug,
        name: String(user.username),
        avatarUrl: user.profile_picture || null
    };
}

function isModerator(user) {
    var badges = (user && user.identity && Array.isArray(user.identity.badges)) ? user.identity.badges : [];
    return badges.some(function (b) { return b && (b.type === 'moderator' || b.type === 'broadcaster'); });
}

/**
 * يحوّل حدث كيك لاستدعاءات الموصِّل. مستقل عشان الاختبارات.
 * @returns {boolean} true لو البث انتهى (الموصِّل يوقف نفسه)
 */
function routeEvent(evt, callbacks) {
    var type = evt && evt.type;
    var d = (evt && evt.data) || {};
    var p;

    switch (type) {
        case 'chat.message.sent':
            p = playerOf(d.sender);
            if (!p) return false;
            callbacks.onComment({
                id: p.id, name: p.name, text: cleanContent(d.content),
                // كيك ما يرسل هل صاحب التعليق متابع — true عشان خيار «المتابعين
                // فقط» بالألعاب ما يحجب كل تعليقات كيك (الخيار ينخفي لكيك بـ agp-game-shell.js).
                isFollower: true, avatarUrl: p.avatarUrl, avatarUrls: p.avatarUrl ? [p.avatarUrl] : [],
                isModerator: isModerator(d.sender)
            });
            return false;

        case 'kicks.gifted':
            p = playerOf(d.sender);
            if (!p || !d.gift) return false;
            callbacks.onGift({
                id: p.id, name: p.name,
                giftName: d.gift.name || 'KICKs',
                giftId: 'kick:' + String(d.gift.name || 'kicks'),
                giftValue: Number(d.gift.amount) || 0,
                repeatCount: 1,
                avatarUrl: p.avatarUrl
            });
            return false;

        case 'channel.subscription.new':
        case 'channel.subscription.renewal':
            p = playerOf(d.subscriber);
            if (!p) return false;
            callbacks.onGift({
                id: p.id, name: p.name, giftName: 'اشتراك', giftId: 'kick:subscription',
                giftValue: SUB_GIFT_VALUE, repeatCount: 1, avatarUrl: p.avatarUrl
            });
            if (callbacks.onSubscribe) callbacks.onSubscribe({ id: p.id, name: p.name, avatarUrls: p.avatarUrl ? [p.avatarUrl] : [] });
            return false;

        case 'channel.subscription.gifts':
            p = playerOf(d.gifter);
            if (!p) return false; // إهداء مجهول — ما فيه لاعب ننسب له الهدية
            var count = Array.isArray(d.giftees) ? d.giftees.length : 0;
            if (!count) return false;
            callbacks.onGift({
                id: p.id, name: p.name, giftName: 'اشتراك هدية', giftId: 'kick:subscription-gift',
                giftValue: SUB_GIFT_VALUE, repeatCount: count, avatarUrl: p.avatarUrl
            });
            return false;

        case 'channel.followed':
            p = playerOf(d.follower);
            if (!p) return false;
            callbacks.onFollow({ id: p.id, name: p.name, avatarUrls: p.avatarUrl ? [p.avatarUrl] : [] });
            return false;

        case 'livestream.status.updated':
            return d.is_live === false;

        default:
            return false;
    }
}

function createKickConnector() {
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

            if (!kickApi.isConfigured()) { callbacks.onStatus('error', MSG_NOT_CONFIGURED); return; }
            var slug = normalizeSlug(options.username);
            if (!slug) { callbacks.onStatus('error', MSG_MISSING_SLUG); return; }

            callbacks.onStatus('connecting');

            kickApi.getChannelBySlug(slug).then(function (channel) {
                if (_disposed) return;
                if (!channel || !channel.broadcaster_user_id) { fail(MSG_NOT_FOUND); return; }
                if (channel.stream && channel.stream.is_live === false) { fail(MSG_OFFLINE); return; }
                _broadcasterId = channel.broadcaster_user_id;

                // تحقق مكتبة الألعاب: يكفي نعرف إن القناة موجودة وتبث — بدون اشتراك.
                if (options.source === 'library') {
                    _connected = true;
                    callbacks.onStatus('connected');
                    return;
                }

                _listener = kickHub.addListener(_broadcasterId, function (evt) {
                    if (!_connected || _disposed) return;
                    var ended = routeEvent(evt, callbacks);
                    if (ended) {
                        stop();
                        callbacks.onStatus('ended', MSG_STREAM_ENDED);
                    }
                });
                return _listener.ready.then(function () {
                    if (_disposed) return;
                    _connected = true;
                    logger.log('Kick Connector: connected to channel "' + slug + '" (' + _broadcasterId + ').');
                    callbacks.onStatus('connected');
                }, function (err) {
                    logger.error('Kick Connector: subscribe failed for "' + slug + '":', err && err.message);
                    fail(MSG_SUBSCRIBE_FAILED);
                });
            }).catch(function (err) {
                logger.error('Kick Connector: connect failed for "' + slug + '":', err && err.message);
                fail(MSG_SUBSCRIBE_FAILED);
            });
        },

        disconnect: function () {
            _disposed = true;
            stop();
        },

        isConnected: function () { return _connected; },

        // نفس دور Room ID بتيك توك (إحصائيات البث) — رقم القناة يكفي.
        getRoomId: function () { return _broadcasterId ? 'kick:' + _broadcasterId : null; }
    };
}

module.exports = {
    createKickConnector: createKickConnector,
    SUB_GIFT_VALUE: SUB_GIFT_VALUE,
    // للاختبارات
    _normalizeSlug: normalizeSlug,
    _cleanContent: cleanContent,
    _routeEvent: routeEvent
};
