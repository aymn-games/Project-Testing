'use strict';

var test = require('node:test');
var assert = require('node:assert');
var crypto = require('crypto');
var kickApi = require('./kick-api');
var kickConnector = require('./kick-connector');

function recorder() {
    var calls = [];
    function rec(name) { return function (d) { calls.push([name, d]); }; }
    return { calls: calls, cb: { onComment: rec('comment'), onGift: rec('gift'), onFollow: rec('follow'), onSubscribe: rec('subscribe'), onStatus: rec('status') } };
}

var SENDER = { is_anonymous: false, user_id: 9, username: 'Sender_Name', profile_picture: 'https://x/a.jpg', channel_slug: 'sender_name',
    identity: { badges: [{ type: 'moderator', text: 'Moderator' }] } };

test('normalizeSlug: يقبل الرابط و@ والحروف الكبيرة', function () {
    assert.strictEqual(kickConnector._normalizeSlug('https://kick.com/Some_Name/'), 'some_name');
    assert.strictEqual(kickConnector._normalizeSlug('  @Abc-1 '), 'abc-1');
    assert.strictEqual(kickConnector._normalizeSlug('www.kick.com/x'), 'x');
    assert.strictEqual(kickConnector._normalizeSlug('kick.com/Y'), 'y');
    assert.strictEqual(kickConnector._normalizeSlug('https://www.kick.com/x?y=1'), 'x');
    assert.strictEqual(kickConnector._normalizeSlug(''), '');
});

test('cleanContent: الإيموت يصير اسمه', function () {
    assert.strictEqual(kickConnector._cleanContent('Hello [emote:4148074:HYPERCLAP]  [emote:37226:KEKW]'), 'Hello HYPERCLAP KEKW');
});

test('chat.message.sent → onComment بمعرّف kick:', function () {
    var r = recorder();
    var ended = kickConnector._routeEvent({ type: 'chat.message.sent', data: { sender: SENDER, content: 'join [emote:1:Hi]' } }, r.cb);
    assert.strictEqual(ended, false);
    assert.strictEqual(r.calls.length, 1);
    assert.strictEqual(r.calls[0][0], 'comment');
    assert.strictEqual(r.calls[0][1].id, 'kick:sender_name');
    assert.strictEqual(r.calls[0][1].name, 'Sender_Name');
    assert.strictEqual(r.calls[0][1].text, 'join Hi');
    assert.strictEqual(r.calls[0][1].avatarUrl, 'https://x/a.jpg');
    assert.strictEqual(r.calls[0][1].isModerator, true);
});

test('kicks.gifted → onGift بقيمة عدد الـKicks', function () {
    var r = recorder();
    kickConnector._routeEvent({ type: 'kicks.gifted', data: { sender: SENDER, gift: { amount: 500, name: 'Rage Quit' } } }, r.cb);
    assert.strictEqual(r.calls[0][0], 'gift');
    assert.strictEqual(r.calls[0][1].giftValue, 500);
    assert.strictEqual(r.calls[0][1].repeatCount, 1);
    assert.strictEqual(r.calls[0][1].giftName, 'Rage Quit');
});

test('الاشتراكات: جديد = هدية + اشتراك، والإهداء = القيمة × عدد المهدى لهم', function () {
    var r = recorder();
    kickConnector._routeEvent({ type: 'channel.subscription.new', data: { subscriber: SENDER } }, r.cb);
    assert.deepStrictEqual(r.calls.map(function (c) { return c[0]; }), ['gift', 'subscribe']);
    assert.strictEqual(r.calls[0][1].giftValue, kickConnector.SUB_GIFT_VALUE);

    var g = recorder();
    kickConnector._routeEvent({ type: 'channel.subscription.gifts', data: { gifter: SENDER, giftees: [{}, {}, {}] } }, g.cb);
    assert.strictEqual(g.calls[0][1].repeatCount, 3);

    var anon = recorder();
    kickConnector._routeEvent({ type: 'channel.subscription.gifts', data: { gifter: { is_anonymous: true }, giftees: [{}] } }, anon.cb);
    assert.strictEqual(anon.calls.length, 0);
});

test('channel.followed → onFollow، وانتهاء البث يرجع true', function () {
    var r = recorder();
    kickConnector._routeEvent({ type: 'channel.followed', data: { follower: SENDER } }, r.cb);
    assert.strictEqual(r.calls[0][0], 'follow');
    assert.strictEqual(kickConnector._routeEvent({ type: 'livestream.status.updated', data: { is_live: false } }, r.cb), true);
    assert.strictEqual(kickConnector._routeEvent({ type: 'livestream.status.updated', data: { is_live: true } }, r.cb), false);
});

test('verifySignatureWithKey: يقبل التوقيع الصحيح ويرفض المعدَّل', function () {
    var pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    var pem = pair.publicKey.export({ type: 'spki', format: 'pem' });
    var id = '01JABC', ts = '2026-11-15T00:00:00Z', body = Buffer.from('{"a":1}');
    var signer = crypto.createSign('RSA-SHA256');
    signer.update(id + '.' + ts + '.' + body.toString());
    var sig = signer.sign(pair.privateKey, 'base64');

    assert.strictEqual(kickApi.verifySignatureWithKey(pem, id, ts, body, sig), true);
    assert.strictEqual(kickApi.verifySignatureWithKey(pem, id, ts, Buffer.from('{"a":2}'), sig), false);
    assert.strictEqual(kickApi.verifySignatureWithKey(pem, 'other', ts, body, sig), false);
    assert.strictEqual(kickApi.verifySignatureWithKey(pem, id, ts, body, ''), false);
    assert.strictEqual(kickApi.verifySignatureWithKey('not a key', id, ts, body, sig), false);
});

test('الموصِّل بدون مفاتيح كيك يرجع خطأ واضح بدون أي طلب', function () {
    var r = recorder();
    kickConnector.createKickConnector().connect({ username: 'abc' }, r.cb);
    assert.deepStrictEqual(r.calls[0][0], 'status');
    assert.strictEqual(r.calls[0][1], 'error');
});

test('ربط حساب كيك: state موقّع، وPKCE challenge = SHA256(verifier)', function () {
    var config = require('../../config');
    var saved = { id: config.kickClientId, secret: config.kickClientSecret };
    config.kickClientId = 'cid'; config.kickClientSecret = 'sec';
    try {
        var oauth = require('../../auth/kick-oauth-service');
        var url = new URL(oauth.buildAuthorizeUrl(42));
        assert.strictEqual(url.origin + url.pathname, 'https://id.kick.com/oauth/authorize');
        assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
        assert.strictEqual(url.searchParams.get('scope'), 'user:read channel:read');
        var st = oauth.verifyState(url.searchParams.get('state'));
        assert.strictEqual(st.uid, 42);
        var verifier = oauth._codeVerifierFor(st.nonce);
        assert.ok(verifier.length >= 43 && verifier.length <= 128);
        assert.strictEqual(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(verifier).digest('base64url'));
        // state معدَّل أو مزوّر يُرفض
        var parts = url.searchParams.get('state').split('.');
        var forged = Buffer.from(JSON.stringify({ uid: 1, nonce: 'x', exp: Date.now() + 1e6 })).toString('base64url') + '.' + parts[1];
        assert.strictEqual(oauth.verifyState(forged), null);
        assert.strictEqual(oauth.verifyState('garbage'), null);
    } finally {
        config.kickClientId = saved.id; config.kickClientSecret = saved.secret;
    }
});
