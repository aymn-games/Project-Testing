'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var EventEmitter = require('events');
var Database = require('better-sqlite3');
var storeMod = require('./donations-store');
var managerMod = require('./streamlabs-manager');

/** io وهمي: كل اتصال socket (EventEmitter) نقدر نطلق عليه connect/event/errors */
function fakeIo() {
    var io = function (url, opts) {
        var s = new EventEmitter();
        s.url = url; s.opts = opts; s.closed = false;
        s.close = function () { s.closed = true; };
        s.io = { opts: opts, reconnection: function (v) { s.reconnect = v; } };
        io.sockets.push(s);
        return s;
    };
    io.sockets = [];
    io.last = function () { return io.sockets[io.sockets.length - 1]; };
    return io;
}

function setup() {
    var store = storeMod.createStore(new Database(':memory:'));
    var io = fakeIo();
    var got = [];
    var m = managerMod.createManager({ store: store, io: io, linkTimeoutMs: 40, onDonation: function (u, d) { got.push([u, d]); } });
    return { store: store, io: io, m: m, got: got };
}

test('link: a valid token is saved once Streamlabs accepts it', async function () {
    var t = setup();
    var p = t.m.link(7, 'tok_good');
    assert.match(t.io.last().url, /^https:\/\/sockets\.streamlabs\.com\?token=tok_good$/);
    t.io.last().emit('connect');
    assert.deepEqual(await p, { success: true });
    assert.equal(t.store.getLink(7).token, 'tok_good');
    assert.equal(t.m.status(7), 'connected');
});

test('link: a rejected token is not saved and not retried', async function () {
    var t = setup();
    var p = t.m.link(7, 'tok_bad');
    t.io.last().emit('connect_error', new Error('Unauthorized'));
    assert.deepEqual(await p, { success: false, error: 'invalid_token' });
    assert.equal(t.store.getLink(7), null);
    assert.equal(t.io.last().closed, true);
    var p2 = t.m.link(7, 'tok_silent');
    assert.deepEqual(await p2, { success: false, error: 'timeout' });
    assert.equal(t.store.getLink(7), null);
});

test('donations: stored and fed once even when Streamlabs repeats the event', async function () {
    var t = setup();
    var p = t.m.link(7, 'tok');
    t.io.last().emit('connect');
    await p;
    var ev = { type: 'donation', message: [{ _id: 'd1', name: 'فهد', amount: '25.00', currency: 'USD', message: 'كفو' }, { id: 2, name: 'نوره', amount: 10, currency: 'USD' }] };
    t.io.last().emit('event', ev);
    t.io.last().emit('event', ev);
    t.io.last().emit('event', { type: 'follow', message: [{ _id: 'f1', name: 'x' }] });
    var r = t.m.recent(7, 0);
    assert.equal(r.dseq, 2);
    assert.deepEqual(r.donations.map(function (d) { return [d.user, d.amount, d.currency]; }), [['فهد', 25, 'USD'], ['نوره', 10, 'USD']]);
    assert.equal(r.donations[0].message, 'كفو');
    assert.equal(t.store.list(7, 10).length, 2);
    assert.equal(t.got.length, 2);
    assert.equal(t.m.recent(7, 1).donations.length, 1);
    assert.equal(t.m.recent(7, 99).donations.length, 2); // السيرفر رجع = الكل
    t.io.last().emit('event', { type: 'donation', for: 'streamlabs', message: [{ _id: 't1', name: 'تجربة', amount: 5, currency: 'USD', isTest: true }] });
    assert.equal(t.m.recent(7, 2).donations[0].isTest, true);
});

test('connection: rejected later → invalid_token without reconnect; disconnect closes', async function () {
    var t = setup();
    var p = t.m.link(7, 'tok');
    t.io.last().emit('connect');
    await p;
    var s = t.io.last();
    s.emit('connect_error', new Error('Unauthorized'));
    assert.equal(t.store.getLink(7).status, 'invalid_token');
    assert.equal(s.closed, true);
    t.store.setStatus(7, 'connecting');
    t.m.connect(7);
    t.m.disconnect(7);
    assert.equal(t.io.last().closed, true);
    assert.equal(t.m.status(7), 'idle');
});

test('connectAll: reconnects every saved link except invalid tokens', function () {
    var t = setup();
    t.store.saveLink(1, 'a'); t.store.saveLink(2, 'b'); t.store.saveLink(3, 'c');
    t.store.setStatus(3, 'invalid_token');
    t.m.connectAll();
    assert.deepEqual(t.io.sockets.map(function (s) { return s.url.split('=')[1]; }).sort(), ['a', 'b']);
});
