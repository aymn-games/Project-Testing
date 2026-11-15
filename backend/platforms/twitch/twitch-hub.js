/**
 * AGP TWITCH HUB — نقطة استقبال أحداث تويتش (EventSub Webhook) وتوزيعها على الموصِّلات.
 * نفس فكرة platforms/kick/kick-hub.js:
 *   - POST /twitch/webhook: يتحقق من التوقيع (HMAC)، يرد على تحدي التحقق
 *     (webhook_callback_verification) بالنص الخام، ويسجّل الإلغاء (revocation).
 *   - يتجاهل التكرار (Twitch-Eventsub-Message-Id) والرسائل الأقدم من 10 دقايق.
 *   - اشتراكات مشتركة لكل قناة، وتنلغي بعد دقيقة من خروج آخر مستمع، واليتيمة
 *     (بعد إعادة تشغيل السيرفر) تنلغي أول ما يوصل لها حدث.
 *
 * كل الأحداث تحتاج موافقة صاحب القناة المسبقة (ربط حساب تويتش)، ما عدا
 * stream.offline. الشات يُقرأ باسم صاحب القناة نفسه (user_id = broadcaster).
 */

'use strict';

var logger = require('../../utils/logger');
var twitchApi = require('./twitch-api');

/** الاشتراكات لكل قناة — condition تُبنى من رقم صاحب القناة. */
var EVENTS = [
    { type: 'channel.chat.message', version: 1, condition: function (id) { return { broadcaster_user_id: id, user_id: id }; } },
    { type: 'channel.follow', version: 2, condition: function (id) { return { broadcaster_user_id: id, moderator_user_id: id }; } },
    { type: 'channel.cheer', version: 1, condition: function (id) { return { broadcaster_user_id: id }; } },
    { type: 'channel.subscribe', version: 1, condition: function (id) { return { broadcaster_user_id: id }; } },
    { type: 'channel.subscription.message', version: 1, condition: function (id) { return { broadcaster_user_id: id }; } },
    { type: 'channel.subscription.gift', version: 1, condition: function (id) { return { broadcaster_user_id: id }; } },
    { type: 'stream.offline', version: 1, condition: function (id) { return { broadcaster_user_id: id }; } }
];
// الشات أساسي — بدونه الاتصال يعتبر فاشل (غالباً صاحب القناة ما ربط حسابه).
var REQUIRED_TYPE = 'channel.chat.message';

var MAX_BODY_BYTES = 1024 * 1024;
var MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;
var UNSUBSCRIBE_GRACE_MS = 60 * 1000;
var ORPHAN_CLEANUP_COOLDOWN_MS = 5 * 60 * 1000;
var DEDUPE_TTL_MS = 10 * 60 * 1000;
var DEDUPE_MAX = 5000;

var _channels = {};      // broadcasterId -> { listeners:Set, ready:Promise|null, unsubTimer }
var _seen = new Map();   // messageId -> receivedAt
var _orphanCleanupAt = {};

function key(id) { return String(id); }

function rememberMessage(id) {
    var now = Date.now();
    _seen.set(id, now);
    if (_seen.size > DEDUPE_MAX) {
        var it = _seen.keys();
        while (_seen.size > DEDUPE_MAX * 0.8) _seen.delete(it.next().value);
    }
    _seen.forEach(function (t, k) { if (now - t > DEDUPE_TTL_MS) _seen.delete(k); });
}

function subsForBroadcaster(subs, broadcasterId) {
    return subs.filter(function (s) {
        return s && s.condition && String(s.condition.broadcaster_user_id) === String(broadcasterId) &&
            s.transport && s.transport.method === 'webhook';
    });
}

/** يشترك بالأحداث الناقصة (يعيد استخدام القائم). يرفض لو فشل اشتراك الشات. */
function ensureSubscribed(broadcasterId) {
    var id = String(broadcasterId);
    return twitchApi.listSubscriptions(id).then(function (existing) {
        var have = {};
        subsForBroadcaster(existing, id).forEach(function (s) {
            if (s.status === 'enabled' || s.status === 'webhook_callback_verification_pending') have[s.type] = true;
        });
        var missing = EVENTS.filter(function (e) { return !have[e.type]; });
        return Promise.all(missing.map(function (e) {
            return twitchApi.createSubscription(e.type, e.version, e.condition(id)).then(function () {
                return null;
            }, function (err) {
                return { type: e.type, error: err && err.message };
            });
        })).then(function (results) {
            var failed = results.filter(Boolean);
            if (failed.length) logger.error('Twitch Hub: subscriptions failed for ' + id + ': ' + failed.map(function (f) { return f.type + ' (' + f.error + ')'; }).join(', '));
            if (failed.some(function (f) { return f.type === REQUIRED_TYPE; })) {
                var err = new Error('Twitch chat subscription failed');
                err.code = 'chat_subscription_failed';
                throw err;
            }
        });
    });
}

function unsubscribeAll(broadcasterId) {
    return twitchApi.listSubscriptions(broadcasterId).then(function (subs) {
        var ids = subsForBroadcaster(subs, broadcasterId).map(function (s) { return s.id; });
        return Promise.all(ids.map(function (sid) { return twitchApi.deleteSubscription(sid); })).then(function () { return ids.length; });
    });
}

function releaseChannel(broadcasterId) {
    var ch = _channels[key(broadcasterId)];
    if (!ch || ch.listeners.size) return;
    delete _channels[key(broadcasterId)];
    unsubscribeAll(broadcasterId).then(function (n) {
        if (n) logger.log('Twitch Hub: unsubscribed channel ' + broadcasterId + ' (' + n + ').');
    }, function (err) {
        logger.error('Twitch Hub: unsubscribe failed for ' + broadcasterId + ':', err && err.message);
    });
}

/**
 * مستمع لأحداث قناة. ready يتم لما الاشتراكات تنطلب بنجاح.
 * @returns {{ ready: Promise, remove: function }}
 */
function addListener(broadcasterId, handler) {
    var k = key(broadcasterId);
    var ch = _channels[k];
    if (!ch) ch = _channels[k] = { listeners: new Set(), ready: null, unsubTimer: null };
    if (ch.unsubTimer) { clearTimeout(ch.unsubTimer); ch.unsubTimer = null; }
    ch.listeners.add(handler);

    if (!ch.ready) {
        var thisCh = ch;
        ch.ready = ensureSubscribed(broadcasterId).then(function () {
            logger.log('Twitch Hub: subscribed channel ' + broadcasterId + '.');
        }, function (err) {
            if (_channels[k] === thisCh) thisCh.ready = null;
            throw err;
        });
    }

    var removed = false;
    return {
        ready: ch.ready,
        remove: function () {
            if (removed) return;
            removed = true;
            var cur = _channels[k];
            if (!cur) return;
            cur.listeners.delete(handler);
            if (!cur.listeners.size && !cur.unsubTimer) {
                cur.unsubTimer = setTimeout(function () {
                    cur.unsubTimer = null;
                    releaseChannel(broadcasterId);
                }, UNSUBSCRIBE_GRACE_MS);
                // ما يمسك العملية مفتوحة (اختبارات/إيقاف السيرفر)
                if (cur.unsubTimer.unref) cur.unsubTimer.unref();
            }
        }
    };
}

function cleanupOrphan(broadcasterId) {
    var k = key(broadcasterId);
    var now = Date.now();
    if (_orphanCleanupAt[k] && now - _orphanCleanupAt[k] < ORPHAN_CLEANUP_COOLDOWN_MS) return;
    _orphanCleanupAt[k] = now;
    unsubscribeAll(broadcasterId).then(function (n) {
        if (n) logger.log('Twitch Hub: removed ' + n + ' orphan subscriptions for channel ' + broadcasterId + '.');
    }).catch(function (err) {
        logger.error('Twitch Hub: orphan cleanup failed for ' + broadcasterId + ':', err && err.message);
    });
}

function dispatch(type, event) {
    var broadcasterId = event && event.broadcaster_user_id;
    if (!broadcasterId) return;
    var ch = _channels[key(broadcasterId)];
    if (!ch || !ch.listeners.size) {
        if (!ch) cleanupOrphan(broadcasterId);
        return;
    }
    ch.listeners.forEach(function (fn) {
        try { fn({ type: type, data: event }); } catch (err) { logger.error('Twitch Hub: listener failed:', err); }
    });
}

function header(req, name) {
    var v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : (v || '');
}

/** معالج HTTP لـ POST /twitch/webhook. */
function handleWebhook(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
    }
    var chunks = [];
    var size = 0;
    var aborted = false;
    req.on('data', function (chunk) {
        if (aborted) return;
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            aborted = true;
            res.writeHead(413, { 'Content-Type': 'text/plain' });
            res.end('Payload Too Large');
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', function () {
        if (aborted) return;
        var rawBody = Buffer.concat(chunks);
        var messageId = header(req, 'Twitch-Eventsub-Message-Id');
        var timestamp = header(req, 'Twitch-Eventsub-Message-Timestamp');
        var signature = header(req, 'Twitch-Eventsub-Message-Signature');
        var messageType = header(req, 'Twitch-Eventsub-Message-Type');

        if (!twitchApi.isConfigured() || !twitchApi.verifySignature(messageId, timestamp, rawBody, signature)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Invalid signature');
            return;
        }
        var sentAt = Date.parse(timestamp);
        if (!sentAt || Math.abs(Date.now() - sentAt) > MAX_MESSAGE_AGE_MS) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Stale message');
            return;
        }
        var body;
        try { body = JSON.parse(rawBody.toString('utf8')); } catch (e) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad JSON');
            return;
        }

        if (messageType === 'webhook_callback_verification') {
            var challenge = String((body && body.challenge) || '');
            res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(challenge) });
            res.end(challenge);
            return;
        }

        res.writeHead(204);
        res.end();

        if (messageType === 'revocation') {
            var sub = (body && body.subscription) || {};
            logger.log('Twitch Hub: subscription revoked (' + sub.type + ', ' + sub.status + ') for channel ' + (sub.condition && sub.condition.broadcaster_user_id) + '.');
            return;
        }
        if (messageType !== 'notification') return;
        if (_seen.has(messageId)) return;
        rememberMessage(messageId);
        dispatch(body && body.subscription && body.subscription.type, body && body.event);
    });
    req.on('error', function () {
        if (!res.headersSent) { res.writeHead(400); res.end(); }
    });
}

module.exports = {
    EVENTS: EVENTS,
    addListener: addListener,
    handleWebhook: handleWebhook,
    _dispatch: dispatch,
    _channels: _channels
};
