'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var oauthMod = require('./streamlabs-oauth');

function res(status, body) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
}
function mk(fetchImpl, over) {
    var clock = { t: 1000000 };
    var o = oauthMod.createOAuth(Object.assign({
        clientId: 'cid123', clientSecret: 'sec456', redirectUri: 'https://api.example.com/api/streamlabs/oauth/callback',
        fetch: fetchImpl, now: function () { return clock.t; }
    }, over || {}));
    o.clock = clock;
    return o;
}

test('enabled only with client id and secret', function () {
    assert.equal(mk(null).enabled(), true);
    assert.equal(mk(null, { clientId: '' }).enabled(), false);
    assert.equal(mk(null, { clientSecret: '' }).enabled(), false);
});

test('authorize url: client id, redirect, code, socket.token scope and a signed state', function () {
    var o = mk(null);
    var u = new URL(o.authorizeUrl(42));
    assert.equal(u.origin + u.pathname, 'https://streamlabs.com/api/v2.0/authorize');
    assert.equal(u.searchParams.get('client_id'), 'cid123');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://api.example.com/api/streamlabs/oauth/callback');
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('scope'), 'socket.token');
    assert.equal(o.verifyState(u.searchParams.get('state')), 42);
});

test('state: tampered, other secret, or older than 10 minutes is rejected', function () {
    var o = mk(null);
    var st = new URL(o.authorizeUrl(42)).searchParams.get('state');
    assert.equal(o.verifyState(st.replace(/^42/, '43')), null);
    assert.equal(mk(null, { clientSecret: 'other' }).verifyState(st), null);
    assert.equal(o.verifyState(''), null);
    o.clock.t += 11 * 60 * 1000;
    assert.equal(o.verifyState(st), null);
});

test('exchange: code → access token → socket token', async function () {
    var calls = [];
    var o = mk(function (url, opts) {
        calls.push({ url: url, opts: opts || {} });
        if (/\/socket\/token$/.test(url)) return res(200, { socket_token: 'sock_1' });
        if (/\/token$/.test(url)) return res(200, { access_token: 'acc_1', token_type: 'Bearer' });
        return res(404, {});
    });
    assert.deepEqual(await o.socketTokenFromCode('code_9'), { success: true, socketToken: 'sock_1' });
    assert.equal(calls[0].url, 'https://streamlabs.com/api/v2.0/token');
    assert.equal(calls[0].opts.method, 'POST');
    var body = JSON.parse(calls[0].opts.body);
    assert.deepEqual(body, { grant_type: 'authorization_code', client_id: 'cid123', client_secret: 'sec456', redirect_uri: 'https://api.example.com/api/streamlabs/oauth/callback', code: 'code_9' });
    assert.equal(calls[1].url, 'https://streamlabs.com/api/v2.0/socket/token');
    assert.equal(calls[1].opts.headers.Authorization, 'Bearer acc_1');
});

test('exchange failures: bad code, no socket token, network error', async function () {
    assert.deepEqual(await mk(function () { return res(400, { error: 'invalid_grant' }); }).socketTokenFromCode('x'), { success: false, error: 'token_exchange_failed' });
    assert.deepEqual(await mk(function (url) { return /\/socket\//.test(url) ? res(403, {}) : res(200, { access_token: 'a' }); }).socketTokenFromCode('x'), { success: false, error: 'socket_token_failed' });
    assert.deepEqual(await mk(function () { return Promise.reject(new Error('down')); }).socketTokenFromCode('x'), { success: false, error: 'network' });
    assert.deepEqual(await mk(null).socketTokenFromCode(''), { success: false, error: 'missing_code' });
});
