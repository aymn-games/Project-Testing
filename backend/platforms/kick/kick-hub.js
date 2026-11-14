/**
 * AGP KICK HUB — نقطة استقبال أحداث كيك (Webhook) وتوزيعها على الموصِّلات.
 *
 * كيك يرسل كل أحداث كل القنوات لرابط واحد (POST /kick/webhook). هذا الملف:
 *   1) يتحقق من التوقيع (kick-api.verifySignature) ويرفض أي طلب مزوّر.
 *   2) يتجاهل التكرار (كيك قد يعيد نفس الرسالة) بالهيدر Kick-Event-Message-Id.
 *   3) يوزّع الحدث على كل المستمعين لنفس القناة (broadcaster.user_id).
 *
 * الاشتراكات مشتركة لكل قناة: أول موصِّل يطلب القناة يسوي الاشتراك، والباقي
 * يستخدمونه. لما يطلع آخر مستمع، نلغي الاشتراك بعد مهلة قصيرة (تحديث الصفحة
 * أو إعادة الاتصال ما تسوي اشتراك جديد كل مرة). أحداث قناة ما لها مستمع
 * (اشتراك قديم بقي بعد إعادة تشغيل السيرفر) → نلغي اشتراكاتها، عشان ما
 * تنحسب من حد الاشتراكات ولا يوقف كيك الـWebhook.
 */

'use strict';

var logger = require('../../utils/logger');
var kickApi = require('./kick-api');

var EVENTS = [
    'chat.message.sent',
    'channel.followed',
    'channel.subscription.new',
    'channel.subscription.renewal',
    'channel.subscription.gifts',
    'kicks.gifted',
    'livestream.status.updated'
];

var MAX_BODY_BYTES = 1024 * 1024;
var UNSUBSCRIBE_GRACE_MS = 60 * 1000;
var ORPHAN_CLEANUP_COOLDOWN_MS = 5 * 60 * 1000;
var DEDUPE_TTL_MS = 10 * 60 * 1000;
var DEDUPE_MAX = 5000;

// broadcasterId -> { listeners: Set<fn>, ready: Promise|null, subscriptionIds: string[], unsubTimer }
var _channels = {};
var _seen = new Map(); // messageId -> receivedAt
var _orphanCleanupAt = {}; // broadcasterId -> آخر محاولة تنظيف

function key(id) { return String(id); }

function rememberMessage(id) {
    var now = Date.now();
    _seen.set(id, now);
    if (_seen.size > DEDUPE_MAX) {
        // Map يحفظ ترتيب الإدخال — نحذف الأقدم أولاً
        var it = _seen.keys();
        while (_seen.size > DEDUPE_MAX * 0.8) _seen.delete(it.next().value);
    }
    _seen.forEach(function (t, k) { if (now - t > DEDUPE_TTL_MS) _seen.delete(k); });
}

/** يشترك بالأحداث، مع إعادة استخدام أي اشتراك قائم لنفس القناة (بعد إعادة تشغيل السيرفر). */
function ensureSubscribed(broadcasterId) {
    return kickApi.listSubscriptions(broadcasterId).then(function (existing) {
        var have = {};
        var ids = [];
        existing.forEach(function (s) {
            if (s && Number(s.broadcaster_user_id) === Number(broadcasterId) && EVENTS.indexOf(s.event) !== -1 && !have[s.event]) {
                have[s.event] = true;
                ids.push(s.id);
            }
        });
        var missing = EVENTS.filter(function (e) { return !have[e]; });
        if (!missing.length) return ids;
        return kickApi.subscribe(broadcasterId, missing).then(function (results) {
            var failed = [];
            results.forEach(function (r) {
                if (r && r.subscription_id) ids.push(r.subscription_id);
                else if (r) failed.push(r.name + (r.error ? ' (' + r.error + ')' : ''));
            });
            if (failed.length) logger.error('Kick Hub: some subscriptions failed for ' + broadcasterId + ': ' + failed.join(', '));
            if (!ids.length) throw new Error('Kick subscription failed for all events');
            return ids;
        });
    });
}

function releaseChannel(broadcasterId) {
    var ch = _channels[key(broadcasterId)];
    if (!ch || ch.listeners.size) return;
    var ids = ch.subscriptionIds;
    delete _channels[key(broadcasterId)];
    if (!ids || !ids.length) return;
    kickApi.unsubscribe(ids).then(function () {
        logger.log('Kick Hub: unsubscribed channel ' + broadcasterId + '.');
    }, function (err) {
        logger.error('Kick Hub: unsubscribe failed for ' + broadcasterId + ':', err && err.message);
    });
}

/**
 * تسجيل مستمع لأحداث قناة. الوعد يتم لما يصير الاشتراك جاهز (أو يُرفض).
 * @param {number} broadcasterId
 * @param {function({type: string, data: object})} handler
 * @returns {{ ready: Promise, remove: function }}
 */
function addListener(broadcasterId, handler) {
    var k = key(broadcasterId);
    var ch = _channels[k];
    if (!ch) {
        ch = _channels[k] = { listeners: new Set(), ready: null, subscriptionIds: [], unsubTimer: null };
    }
    if (ch.unsubTimer) { clearTimeout(ch.unsubTimer); ch.unsubTimer = null; }
    ch.listeners.add(handler);

    if (!ch.ready) {
        var thisCh = ch;
        ch.ready = ensureSubscribed(broadcasterId).then(function (ids) {
            thisCh.subscriptionIds = ids;
            logger.log('Kick Hub: subscribed channel ' + broadcasterId + ' (' + ids.length + ' events).');
        }, function (err) {
            // فشل الاشتراك — المحاولة الجاية تبدأ من جديد
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
            }
        }
    };
}

/** اشتراكات بقيت لقناة ما لها مستمع → نلغيها (مرة كل خمس دقايق كحد أقصى لكل قناة). */
function cleanupOrphan(broadcasterId) {
    var k = key(broadcasterId);
    var now = Date.now();
    if (_orphanCleanupAt[k] && now - _orphanCleanupAt[k] < ORPHAN_CLEANUP_COOLDOWN_MS) return;
    _orphanCleanupAt[k] = now;
    kickApi.listSubscriptions(broadcasterId).then(function (subs) {
        if (_channels[k]) return; // صار له مستمع بالوقت هذا
        var ids = subs.filter(function (s) { return s && Number(s.broadcaster_user_id) === Number(broadcasterId); })
            .map(function (s) { return s.id; });
        if (!ids.length) return;
        return kickApi.unsubscribe(ids).then(function () {
            logger.log('Kick Hub: removed ' + ids.length + ' orphan subscriptions for channel ' + broadcasterId + '.');
        });
    }).catch(function (err) {
        logger.error('Kick Hub: orphan cleanup failed for ' + broadcasterId + ':', err && err.message);
    });
}

function dispatch(type, data) {
    var broadcasterId = data && data.broadcaster && data.broadcaster.user_id;
    if (broadcasterId === undefined || broadcasterId === null) return;
    var ch = _channels[key(broadcasterId)];
    if (!ch || !ch.listeners.size) {
        if (!ch) cleanupOrphan(broadcasterId);
        return;
    }
    ch.listeners.forEach(function (fn) {
        try { fn({ type: type, data: data }); } catch (err) { logger.error('Kick Hub: listener failed:', err); }
    });
}

function header(req, name) {
    var v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : (v || '');
}

/**
 * معالج HTTP لـ POST /kick/webhook. يرد 200 بعد التحقق مباشرة (كيك يلغي
 * الاشتراك لو فشل الاستلام لأكثر من يوم)، و401 للتوقيع الغلط.
 */
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
        var messageId = header(req, 'Kick-Event-Message-Id');
        var timestamp = header(req, 'Kick-Event-Message-Timestamp');
        var signature = header(req, 'Kick-Event-Signature');
        var eventType = header(req, 'Kick-Event-Type');

        kickApi.verifySignature(messageId, timestamp, rawBody, signature).then(function (ok) {
            if (!ok) {
                logger.log('Kick Hub: rejected webhook with invalid signature (' + (eventType || 'unknown') + ').');
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Invalid signature');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');

            if (_seen.has(messageId)) return;
            rememberMessage(messageId);

            var data;
            try { data = JSON.parse(rawBody.toString('utf8')); } catch (e) {
                logger.error('Kick Hub: webhook body is not JSON (' + eventType + ').');
                return;
            }
            dispatch(eventType, data);
        }, function (err) {
            // ما قدرنا نجيب المفتاح العام — 500 عشان كيك يعيد الإرسال لاحقاً
            logger.error('Kick Hub: signature verification unavailable:', err && err.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Verification unavailable');
        });
    });
    req.on('error', function () {
        if (!res.headersSent) { res.writeHead(400); res.end(); }
    });
}

module.exports = {
    EVENTS: EVENTS,
    addListener: addListener,
    handleWebhook: handleWebhook,
    // للاختبارات
    _dispatch: dispatch,
    _channels: _channels
};
