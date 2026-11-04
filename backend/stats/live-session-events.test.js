'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var stats = require('./live-session-stats');

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

test('alert events: likes are batched per viewer, subscribe and join carry the username', async function () {
    var u = 'evtest_' + Date.now();
    stats.attach(u, 'room', 'c1');
    stats.recordMember(u, 'c1', { id: 'tiktok:Abu_Fahad', name: 'أبو فهد' });
    stats.recordLike(u, 'c1', { id: 'tiktok:Abu_Fahad', name: 'أبو فهد', count: 15 });
    stats.recordLike(u, 'c1', { id: 'tiktok:Abu_Fahad', name: 'أبو فهد', count: 20 });
    stats.recordLike(u, 'c1', { id: 'tiktok:noura', name: 'نوره', count: 5 });
    stats.recordSubscribe(u, 'c1', { id: 'tiktok:noura', name: 'نوره' });
    var r = stats.getRecentEvents(u, 0);
    assert.deepEqual(r.events.map(function (e) { return e.type; }), ['join', 'subscribe']);
    assert.equal(r.events[0].uid, 'abu_fahad');
    await wait(1700);
    r = stats.getRecentEvents(u, 0);
    var likes = r.events.filter(function (e) { return e.type === 'like'; });
    assert.equal(likes.length, 2);
    assert.equal(likes[0].uid, 'abu_fahad');
    assert.equal(likes[0].count, 35);
    assert.equal(likes[0].total, 35);
    assert.equal(likes[1].count, 5);
    assert.equal(likes[1].allPrev, 35);
    assert.equal(likes[1].all, 40);
    stats.recordLike(u, 'c1', { id: 'tiktok:Abu_Fahad', name: 'أبو فهد', count: 70 });
    await wait(1700);
    var last = stats.getRecentEvents(u, 0).events.pop();
    assert.deepEqual([last.count, last.total, last.allPrev, last.all], [70, 105, 40, 110]);
});
