'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var store = require('./live-session-store');

var SECTIONS = { likers: 'count', gifters: 'diamonds', viewers: 'watchMs' };

// نفس شكل newSession بـlive-session-stats.js
function newSession(username, roomId, connectionId) {
    var s = {
        username: username, roomId: roomId || null, ownerConnectionId: connectionId,
        startedAt: Date.now(), lastActivityAt: Date.now(), endedAt: null,
        totals: { likes: 0, diamonds: 0 }, lists: {}, avatars: new Map()
    };
    Object.keys(SECTIONS).forEach(function (k) { s.lists[k] = new Map(); });
    return s;
}

function rec(id, name, count) { return { id: id, name: name, count: count, diamonds: 0, joinedAt: 1000, lastSeenAt: 2000 }; }

test('serialize then deserialize keeps lists and totals; owner is cleared', function () {
    var s = newSession('streamer', 'room1', 'conn1');
    s.totals.likes = 30;
    s.lists.likers.set('u1', rec('u1', 'أبو فهد', 20));
    s.lists.likers.set('u2', rec('u2', 'نوره', 10));
    s.avatars.set('u1', ['https://a/1.jpg']);
    var back = store.deserialize(JSON.parse(JSON.stringify(store.serialize(s, SECTIONS, 20))), SECTIONS, newSession);
    assert.equal(back.username, 'streamer');
    assert.equal(back.roomId, 'room1');
    assert.equal(back.ownerConnectionId, null);
    assert.equal(back.totals.likes, 30);
    assert.deepEqual(back.lists.likers.get('u1'), rec('u1', 'أبو فهد', 20));
    assert.equal(back.lists.likers.size, 2);
    assert.deepEqual(back.avatars.get('u1'), ['https://a/1.jpg']);
});

test('only top users keep their avatar urls', function () {
    var s = newSession('streamer', null, 'c');
    for (var i = 0; i < 5; i++) {
        s.lists.likers.set('u' + i, rec('u' + i, 'n' + i, i));
        s.avatars.set('u' + i, ['https://a/' + i]);
    }
    var o = store.serialize(s, SECTIONS, 2);
    var ids = o.avatars.map(function (p) { return p[0]; }).sort();
    assert.deepEqual(ids, ['u3', 'u4']);
    assert.equal(o.lists.likers.length, 5);
});

test('store save/load/remove round trip; bad rows are skipped', function () {
    var db = new Database(':memory:'), st = store.createStore(db);
    st.save('a', { v: 1, username: 'a' });
    st.save('a', { v: 1, username: 'a', roomId: 'r2' });
    db.prepare('INSERT INTO live_session_stats (username, data, updated_at) VALUES (?, ?, ?)').run('b', '{nope', 1);
    var all = st.loadAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].roomId, 'r2');
    st.removeOlderThan(Date.now() + 1);
    assert.deepEqual(st.loadAll(), []);
});

test('deserialize rejects wrong shapes', function () {
    assert.equal(store.deserialize(null, SECTIONS, newSession), null);
    assert.equal(store.deserialize({ v: 2, username: 'x' }, SECTIONS, newSession), null);
    assert.equal(store.deserialize({ v: 1 }, SECTIONS, newSession), null);
});

test('recent gifts (gift jar) survive a round trip; old rows without them still load', function () {
    var s = newSession('streamer', 'r', 'c');
    s.recentGifts = [{ seq: 4, name: 'Rose', img: 'https://x/rose.png', count: 3, diamonds: 3, user: 'نوره', at: 5 }];
    s.giftSeq = 4;
    var back = store.deserialize(JSON.parse(JSON.stringify(store.serialize(s, SECTIONS, 20))), SECTIONS, newSession);
    assert.deepEqual(back.recentGifts, s.recentGifts);
    assert.equal(back.giftSeq, 4);
    var old = store.deserialize({ v: 1, username: 'old', lists: {}, totals: {} }, SECTIONS, newSession);
    assert.deepEqual(old.recentGifts, []);
    assert.equal(old.giftSeq, 0);
});
