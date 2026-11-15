'use strict';

var test = require('node:test');
var assert = require('node:assert');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var config = require('../../config');
var twitchApi = require('./twitch-api');
var twitchHub = require('./twitch-hub');
var twitchConnector = require('./twitch-connector');

function recorder() {
    var calls = [];
    function rec(name) { return function (d) { calls.push([name, d]); }; }
    return { calls: calls, cb: { onComment: rec('comment'), onGift: rec('gift'), onFollow: rec('follow'), onSubscribe: rec('subscribe'), onStatus: rec('status') } };
}

test('normalizeLogin: الرابط و@ والحروف الكبيرة', function () {
    assert.strictEqual(twitchConnector._normalizeLogin('https://www.twitch.tv/Some_User/videos'), 'some_user');
    assert.strictEqual(twitchConnector._normalizeLogin('twitch.tv/abc'), 'abc');
    assert.strictEqual(twitchConnector._normalizeLogin(' @Abc '), 'abc');
});

test('channel.chat.message → onComment بمعرّف twitch:', function () {
    var r = recorder();
    twitchConnector._routeEvent({ type: 'channel.chat.message', data: { chatter_user_login: 'Ali_1', chatter_user_name: 'Ali_1', message: { text: ' join ' }, badges: [{ set_id: 'moderator' }] } }, r.cb);
    assert.strictEqual(r.calls[0][0], 'comment');
    assert.strictEqual(r.calls[0][1].id, 'twitch:ali_1');
    assert.strictEqual(r.calls[0][1].text, 'join');
    assert.strictEqual(r.calls[0][1].isFollower, true);
    assert.strictEqual(r.calls[0][1].isModerator, true);
});

test('Bits والاشتراكات والمتابعة وانتهاء البث', function () {
    var r = recorder();
    twitchConnector._routeEvent({ type: 'channel.cheer', data: { user_login: 'a', user_name: 'A', bits: 250 } }, r.cb);
    twitchConnector._routeEvent({ type: 'channel.cheer', data: { is_anonymous: true, bits: 100 } }, r.cb);
    twitchConnector._routeEvent({ type: 'channel.subscribe', data: { user_login: 'b', tier: '2000', is_gift: false } }, r.cb);
    twitchConnector._routeEvent({ type: 'channel.subscribe', data: { user_login: 'c', tier: '1000', is_gift: true } }, r.cb);
    twitchConnector._routeEvent({ type: 'channel.subscription.gift', data: { user_login: 'd', tier: '1000', total: 5 } }, r.cb);
    twitchConnector._routeEvent({ type: 'channel.follow', data: { user_login: 'e', user_name: 'E' } }, r.cb);
    var gifts = r.calls.filter(function (c) { return c[0] === 'gift'; }).map(function (c) { return [c[1].id, c[1].giftValue, c[1].repeatCount]; });
    assert.deepStrictEqual(gifts, [['twitch:a', 250, 1], ['twitch:b', 1000, 1], ['twitch:d', 500, 5]]);
    assert.ok(r.calls.some(function (c) { return c[0] === 'subscribe' && c[1].id === 'twitch:b'; }));
    assert.ok(r.calls.some(function (c) { return c[0] === 'follow' && c[1].id === 'twitch:e'; }));
    assert.strictEqual(twitchConnector._routeEvent({ type: 'stream.offline', data: {} }, r.cb), true);
});

test('verifySignature: HMAC صحيح يمر والمعدّل ينرفض', function () {
    var secret = 'test-secret-123456';
    var body = Buffer.from('{"x":1}');
    var sig = 'sha256=' + crypto.createHmac('sha256', secret).update('id1' + 't1').update(body).digest('hex');
    assert.strictEqual(twitchApi.verifySignature('id1', 't1', body, sig, secret), true);
    assert.strictEqual(twitchApi.verifySignature('id1', 't1', Buffer.from('{"x":2}'), sig, secret), false);
    assert.strictEqual(twitchApi.verifySignature('id1', 't1', body, 'sha256=00', secret), false);
});

function withConfig(fn) {
    var saved = { id: config.twitchClientId, secret: config.twitchClientSecret };
    config.twitchClientId = 'cid'; config.twitchClientSecret = 'csecret';
    return Promise.resolve().then(fn).finally(function () {
        config.twitchClientId = saved.id; config.twitchClientSecret = saved.secret;
    });
}

function post(type, body, id, opts) {
    opts = opts || {};
    var raw = Buffer.from(JSON.stringify(body));
    var ts = opts.ts || new Date().toISOString();
    var sig = 'sha256=' + crypto.createHmac('sha256', twitchApi.webhookSecret()).update(id + ts).update(raw).digest('hex');
    var req = new EventEmitter();
    req.method = 'POST';
    req.headers = {
        'twitch-eventsub-message-id': id, 'twitch-eventsub-message-timestamp': ts,
        'twitch-eventsub-message-signature': opts.badSig ? 'sha256=bad' : sig, 'twitch-eventsub-message-type': type
    };
    var res = { headers: null, body: '', writeHead: function (c, h) { this.code = c; this.headers = h; }, end: function (b) { this.body = b || ''; } };
    twitchHub.handleWebhook(req, res);
    req.emit('data', raw);
    req.emit('end');
    return res;
}

test('Webhook: تحدي التحقق يرجع النص الخام، والتوقيع الغلط/القديم ينرفض', function () {
    return withConfig(function () {
        var ok = post('webhook_callback_verification', { challenge: 'pogchamp-kappa' }, 'v1');
        assert.strictEqual(ok.code, 200);
        assert.strictEqual(ok.body, 'pogchamp-kappa');
        assert.strictEqual(ok.headers['Content-Type'], 'text/plain');
        assert.strictEqual(post('webhook_callback_verification', { challenge: 'x' }, 'v2', { badSig: true }).code, 403);
        assert.strictEqual(post('notification', {}, 'v3', { ts: new Date(Date.now() - 3600e3).toISOString() }).code, 403);
    });
});

test('الموصِّل: اتصال → أحداث من الـWebhook → انتهاء البث (الـAPI مُحاكى)', function () {
    return withConfig(function () {
        var orig = {};
        ['getUserByLogin', 'isLive', 'listSubscriptions', 'createSubscription', 'deleteSubscription'].forEach(function (k) { orig[k] = twitchApi[k]; });
        var created = [];
        twitchApi.getUserByLogin = function () { return Promise.resolve({ id: '777', login: 'chan' }); };
        twitchApi.isLive = function () { return Promise.resolve(true); };
        twitchApi.listSubscriptions = function () { return Promise.resolve([]); };
        twitchApi.createSubscription = function (type, v, cond) { created.push([type, cond]); return Promise.resolve({ id: 's' + created.length }); };
        twitchApi.deleteSubscription = function () { return Promise.resolve(); };
        var out = [];
        var c = twitchConnector.createTwitchConnector();
        c.connect({ username: 'twitch.tv/Chan' }, {
            onStatus: function (s, m) { out.push('status:' + s); },
            onComment: function (d) { out.push('comment:' + d.id + ':' + d.text); },
            onGift: function (d) { out.push('gift:' + d.giftValue); },
            onFollow: function (d) { out.push('follow:' + d.id); }
        });
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
            assert.strictEqual(created.length, twitchHub.EVENTS.length);
            assert.deepStrictEqual(created[0], ['channel.chat.message', { broadcaster_user_id: '777', user_id: '777' }]);
            var sub = function (t) { return { type: t }; };
            post('notification', { subscription: sub('channel.chat.message'), event: { broadcaster_user_id: '777', chatter_user_login: 'ali', message: { text: 'join' } } }, 'n1');
            post('notification', { subscription: sub('channel.chat.message'), event: { broadcaster_user_id: '777', chatter_user_login: 'ali', message: { text: 'join' } } }, 'n1'); // تكرار
            post('notification', { subscription: sub('channel.cheer'), event: { broadcaster_user_id: '777', user_login: 'ali', bits: 100 } }, 'n2');
            post('notification', { subscription: sub('stream.offline'), event: { broadcaster_user_id: '777' } }, 'n3');
            post('notification', { subscription: sub('channel.chat.message'), event: { broadcaster_user_id: '777', chatter_user_login: 'late', message: { text: 'x' } } }, 'n4');
            assert.deepStrictEqual(out, ['status:connecting', 'status:connected', 'comment:twitch:ali:join', 'gift:100', 'status:ended']);
            c.disconnect();
        }).finally(function () { Object.keys(orig).forEach(function (k) { twitchApi[k] = orig[k]; }); });
    });
});

test('الموصِّل: فشل اشتراك الشات = رسالة «اربط حساب تويتش»', function () {
    return withConfig(function () {
        var orig = {};
        ['getUserByLogin', 'isLive', 'listSubscriptions', 'createSubscription'].forEach(function (k) { orig[k] = twitchApi[k]; });
        twitchApi.getUserByLogin = function () { return Promise.resolve({ id: '888', login: 'x' }); };
        twitchApi.isLive = function () { return Promise.resolve(true); };
        twitchApi.listSubscriptions = function () { return Promise.resolve([]); };
        twitchApi.createSubscription = function (type) {
            return type === 'channel.chat.message' ? Promise.reject(new Error('HTTP 403')) : Promise.resolve({ id: 'z' });
        };
        var statuses = [];
        twitchConnector.createTwitchConnector().connect({ username: 'x' }, { onStatus: function (s, m) { statuses.push([s, m]); } });
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
            var last = statuses[statuses.length - 1];
            assert.strictEqual(last[0], 'error');
            assert.ok(/يربط حساب تويتش/.test(last[1]));
        }).finally(function () { Object.keys(orig).forEach(function (k) { twitchApi[k] = orig[k]; }); });
    });
});
