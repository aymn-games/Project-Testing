'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var tests = require('./screen-tests');

test('screen tests: push and read after a sequence, per screen key', function () {
    var k = 'key_' + Date.now();
    assert.deepEqual(tests.since(k, 0), { tseq: 0, tests: [] });
    tests.push(k, 'i1abc', 'gift');
    tests.push(k, 'i2abc', 'like');
    tests.push('other_' + k, 'i3', 'join');
    var r = tests.since(k, 0);
    assert.equal(r.tseq, 2);
    assert.deepEqual(r.tests.map(function (t) { return [t.itemId, t.type]; }), [['i1abc', 'gift'], ['i2abc', 'like']]);
    assert.deepEqual(tests.since(k, 1).tests.map(function (t) { return t.itemId; }), ['i2abc']);
    assert.equal(tests.since(k, 2).tests.length, 0);
    assert.equal(tests.since(k, 99).tests.length, 2); // seq أكبر (السيرفر رجع) = الكل
    assert.equal(tests.push(k, 'bad id!', 'gift'), null);
    assert.equal(tests.push(k, 'i4', 'nope').type, 'gift');
});
