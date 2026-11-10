'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var codes = require('./spy-codes-service');

var host = { id: 1, is_streamer: true };
var other = { id: 2, is_streamer: true };

test('register gives each team a code from the codenames range', function () {
    codes._reset();
    var r = codes.register(host, 'room1', [{ team: 1, slot: 'sabc', name: 'فهد' }, { team: 2 }]);
    assert.equal(r.ok, true);
    [1, 2].forEach(function (t) {
        assert.match(r.codes[t], /^\d{4}$/);
        assert.ok(+r.codes[t] >= 1500 && +r.codes[t] <= 1599);
    });
    assert.notEqual(r.codes[1], r.codes[2]);
    assert.deepEqual(codes.resolve(r.codes[1]), { room: 'room1', team: 1, slot: 'sabc', name: 'فهد' });
    assert.deepEqual(codes.resolve(r.codes[2]), { room: 'room1', team: 2, slot: null, name: '' });
    assert.equal(codes.hasRoom(r.codes[1]), true);
});

test('re-register keeps the same codes and updates the slot', function () {
    codes._reset();
    var a = codes.register(host, 'room1', [{ team: 1 }, { team: 2 }]);
    var b = codes.register(host, 'room1', [{ team: 1, slot: 'snew', name: 'سارة' }, { team: 2 }]);
    assert.deepEqual(b.codes, a.codes);
    assert.equal(codes.resolve(a.codes[1]).slot, 'snew');
});

test('only the owner can update a room, and only hosts can register', function () {
    codes._reset();
    codes.register(host, 'room1', [{ team: 1 }]);
    assert.equal(codes.register(other, 'room1', [{ team: 1 }]).error, 'forbidden');
    assert.equal(codes.register({ id: 3 }, 'room2', [{ team: 1 }]).error, 'forbidden');
});

test('invalid input is rejected', function () {
    codes._reset();
    assert.equal(codes.register(host, 'bad room', [{ team: 1 }]).error, 'invalid_request');
    assert.equal(codes.register(host, 'room1', [{ team: 3 }]).error, 'invalid_request');
    assert.equal(codes.register(host, 'room1', [{ team: 1, slot: 'x y' }]).error, 'invalid_request');
    assert.equal(codes.register(host, 'room1', [{ team: 1 }, { team: 1 }]).error, 'invalid_request');
    assert.equal(codes.resolve('9999'), null);
    assert.equal(codes.hasRoom('abcd'), false);
});

test('codes expire when the game stops refreshing', function () {
    codes._reset();
    var realNow = Date.now;
    try {
        var t = realNow();
        Date.now = function () { return t; };
        var r = codes.register(host, 'room1', [{ team: 1 }]);
        Date.now = function () { return t + codes.CODE_TTL_MS + 1; };
        assert.equal(codes.resolve(r.codes[1]), null);
        assert.equal(codes.hasRoom(r.codes[1]), false);
    } finally {
        Date.now = realNow;
    }
});
