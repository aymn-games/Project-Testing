'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var overlays = require('./stream-overlay-service');

function svc() { return overlays.createService(new Database(':memory:')); }

test('getOwn creates a key once and keeps it', function () {
    var s = svc();
    var a = s.getOwn(7);
    assert.match(a.key, /^[a-f0-9]{32}$/);
    assert.equal(a.design, null);
    assert.equal(s.getOwn(7).key, a.key);
    assert.notEqual(s.getOwn(8).key, a.key);
});

test('saved design is readable by key', function () {
    var s = svc();
    var key = s.getOwn(7).key;
    var r = s.saveDesign(7, { v: 3, enabled: true, items: [{ id: 'i1', type: 'text', text: 'هلا' }] });
    assert.equal(r.success, true);
    var found = s.findByKey(key);
    assert.equal(found.userId, 7);
    assert.equal(found.design.items[0].text, 'هلا');
    assert.equal(found.updatedAt, r.updatedAt);
});

test('rotateKey stops the old link', function () {
    var s = svc();
    var oldKey = s.getOwn(7).key;
    var newKey = s.rotateKey(7);
    assert.notEqual(newKey, oldKey);
    assert.equal(s.findByKey(oldKey), null);
    assert.equal(s.findByKey(newKey).userId, 7);
});

test('invalid designs and keys are rejected', function () {
    var s = svc();
    assert.equal(s.saveDesign(7, null).success, false);
    assert.equal(s.saveDesign(7, { items: 'x' }).success, false);
    assert.equal(s.saveDesign(7, { items: new Array(61).fill({}) }).error, 'too_many_items');
    assert.equal(s.saveDesign(7, { items: [{ text: 'x'.repeat(100 * 1024) }] }).error, 'design_too_large');
    assert.equal(s.findByKey('nope'), null);
    assert.equal(s.findByKey(''), null);
});
