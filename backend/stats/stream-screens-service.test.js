'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var screens = require('./stream-screens-service');

function svc() { return screens.createService(new Database(':memory:')); }

test('create gives each screen its own key and a default name', function () {
    var s = svc();
    var a = s.create(7, '').screen;
    var b = s.create(7, '  شاشة   اللعب ').screen;
    assert.equal(a.name, 'شاشة 1');
    assert.equal(b.name, 'شاشة اللعب');
    assert.match(a.key, /^[a-f0-9]{32}$/);
    assert.notEqual(a.key, b.key);
    assert.deepEqual(s.list(7).map(function (x) { return x.id; }), [a.id, b.id]);
    assert.equal(s.list(8).length, 0);
});

test('saved design is readable by the screen key only', function () {
    var s = svc();
    var a = s.create(7, 'أ').screen;
    var b = s.create(7, 'ب').screen;
    var r = s.save(7, a.id, { design: { v: 3, items: [{ id: 'i1', type: 'text', text: 'هلا' }] } });
    assert.equal(r.success, true);
    assert.equal(s.findByKey(a.key).design.items[0].text, 'هلا');
    assert.equal(s.findByKey(a.key).updatedAt, r.updatedAt);
    assert.equal(s.findByKey(b.key).design, null);
});

test('another user cannot touch my screens', function () {
    var s = svc();
    var a = s.create(7, 'أ').screen;
    assert.equal(s.save(8, a.id, { name: 'x' }).error, 'not_found');
    assert.equal(s.remove(8, a.id).error, 'not_found');
    assert.equal(s.rotateKey(8, a.id).error, 'not_found');
    assert.equal(s.list(7)[0].name, 'أ');
});

test('rotateKey stops the old link, remove deletes it', function () {
    var s = svc();
    var a = s.create(7, 'أ').screen;
    var k = s.rotateKey(7, a.id).key;
    assert.equal(s.findByKey(a.key), null);
    assert.equal(s.findByKey(k).userId, 7);
    assert.equal(s.remove(7, a.id).success, true);
    assert.equal(s.findByKey(k), null);
});

test('limits: screens count, design shape and size', function () {
    var s = svc();
    for (var i = 0; i < screens.MAX_SCREENS; i++) assert.equal(s.create(7, 'x').success, true);
    assert.equal(s.create(7, 'x').error, 'too_many_screens');
    var id = s.list(7)[0].id;
    assert.equal(s.save(7, id, { design: { items: 'x' } }).error, 'invalid_design');
    assert.equal(s.save(7, id, { design: { items: new Array(81).fill({}) } }).error, 'too_many_items');
    assert.equal(s.save(7, id, { design: { items: [{ text: 'x'.repeat(100 * 1024) }] } }).error, 'design_too_large');
    assert.equal(s.findByKey('nope'), null);
});
