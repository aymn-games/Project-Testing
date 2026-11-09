'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var sanitize = require('./game-prefs-service').sanitize;

test('sanitize keeps only known string fields, trimmed', function () {
    var out = sanitize({ keyword: '  العب ', team1Name: 'الصقور', evil: 'x', team2Keyword: 5 });
    assert.deepEqual(out, { keyword: 'العب', team1Name: 'الصقور' });
});

test('sanitize drops empty values so they never wipe saved ones', function () {
    assert.deepEqual(sanitize({ keyword: '   ', team1Name: '' }), {});
});

test('sanitize caps length and strips control chars', function () {
    var out = sanitize({ keyword: 'a\u0000b' + 'x'.repeat(100) });
    assert.equal(out.keyword.length, 40);
    assert.equal(out.keyword.slice(0, 2), 'ab');
});

test('sanitize handles bad input', function () {
    assert.deepEqual(sanitize(null), {});
    assert.deepEqual(sanitize('str'), {});
});
