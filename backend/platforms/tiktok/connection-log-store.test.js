'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var logStore = require('./connection-log-store');

var T = Date.parse('2026-11-08T10:00:00Z');

test('room is "new" only the first time it appears in a UTC day', function () {
    var store = logStore.createStore(new Database(':memory:'));
    assert.equal(store.record({ at: T, username: 'a', roomId: '111', source: 'game:bomb', ok: true }).newRoom, true);
    // نفس البث من لعبة ثانية أو إعادة اتصال = نفس الغرفة
    assert.equal(store.record({ at: T + 1000, username: 'a', roomId: '111', source: 'game:roulette', kind: 'reconnect', ok: true }).newRoom, false);
    // بث جديد لنفس الستريمر = غرفة جديدة
    assert.equal(store.record({ at: T + 2000, username: 'a', roomId: '222', source: 'game:bomb', ok: true }).newRoom, true);
    // محاولة بدون رقم غرفة ما تنحسب غرفة
    assert.equal(store.record({ at: T + 3000, username: 'b', roomId: null, source: 'library', ok: false, error: 'offline' }).newRoom, false);
    // يوم جديد = يبدأ العد من جديد
    assert.equal(store.record({ at: T + 24 * 3600 * 1000, username: 'a', roomId: '111', source: 'game:bomb', ok: true }).newRoom, true);
});

test('report summarizes a day by source, kind and streamer', function () {
    var store = logStore.createStore(new Database(':memory:'));
    store.record({ at: T, username: 'a', roomId: '111', source: 'game:bomb', sourceLabel: 'القنبلة', ok: true });
    store.record({ at: T + 1, username: 'a', roomId: '111', source: 'game:bomb', sourceLabel: 'القنبلة', kind: 'reconnect', afterRestart: true, ok: true });
    store.record({ at: T + 2, username: 'b', roomId: '333', source: 'challenge', ok: false, error: 'SignatureRateLimitError: 429' });
    var r = store.report('2026-11-08');
    assert.equal(r.entries.length, 3);
    assert.equal(r.entries[0].username, 'b'); // الأحدث أول
    assert.equal(r.entries[0].error, 'SignatureRateLimitError: 429');
    assert.deepEqual(r.days, [{ day: '2026-11-08', attempts: 3, ok: 2, new_rooms: 2, after_restart: 1 }]);
    var bomb = r.bySource.find(function (b) { return b.source === 'game:bomb'; });
    assert.equal(bomb.label, 'القنبلة');
    assert.equal(bomb.attempts, 2);
    assert.equal(bomb.new_rooms, 1);
    assert.equal(r.byUser.find(function (u) { return u.username === 'a'; }).rooms, 1);
    assert.ok(r.byKind.some(function (k) { return k.kind === 'reconnect' && k.after_restart === 1; }));
});

test('rows older than KEEP_DAYS are pruned', function () {
    var store = logStore.createStore(new Database(':memory:'));
    store.record({ at: T, username: 'a', roomId: '1', ok: true });
    store.record({ at: T + (logStore.KEEP_DAYS + 1) * 24 * 3600 * 1000, username: 'a', roomId: '2', ok: true });
    assert.equal(store.report('2026-11-08').entries.length, 0);
});
