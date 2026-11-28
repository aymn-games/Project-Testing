'use strict';

var test = require('node:test');
var assert = require('node:assert');
var createPlatformStreamlabs = require('./platform-streamlabs').createPlatformStreamlabs;

function fakeIo() {
    var handlers = {};
    var sock = { closed: false, on: function (e, fn) { handlers[e] = fn; }, close: function () { sock.closed = true; }, emit: function (e, a) { if (handlers[e]) handlers[e](a); } };
    var io = function (url) { io.url = url; return sock; };
    io.sock = sock;
    return io;
}

test('no token → stays off and never connects', function () {
    var io = fakeIo();
    var p = createPlatformStreamlabs({ token: '', io: io, addDonation: function () {} });
    assert.strictEqual(p.start(), false);
    assert.strictEqual(io.url, undefined);
    assert.strictEqual(p.getState().status, 'off');
});

test('real donations are saved, test donations are skipped', function () {
    var io = fakeIo();
    var saved = [];
    var p = createPlatformStreamlabs({ token: 'abc', io: io, addDonation: function (d) { saved.push(d); return { created_at: 5 }; } });
    p.start();
    io.sock.emit('connect');
    assert.strictEqual(p.getState().status, 'connected');
    io.sock.emit('event', { type: 'donation', message: [{ _id: 7, name: 'أبو فهد', amount: '10.50', currency: 'USD', message: 'كفو' }] });
    io.sock.emit('event', { type: 'donation', message: [{ _id: 8, name: 'x', amount: 1, isTest: true }] });
    io.sock.emit('event', { type: 'follow', message: [{ name: 'y' }] });
    assert.deepStrictEqual(saved, [{ slId: 7, name: 'أبو فهد', amount: '10.50', currency: 'USD', message: 'كفو' }]);
    assert.strictEqual(p.getState().lastDonationAt, 5);
});

test('rejected token → invalid_token and socket closed', function () {
    var io = fakeIo();
    var p = createPlatformStreamlabs({ token: 'bad', io: io, addDonation: function () {} });
    p.start();
    io.sock.emit('connect_error', new Error('Unauthorized'));
    assert.strictEqual(p.getState().status, 'invalid_token');
    assert.strictEqual(io.sock.closed, true);
});
