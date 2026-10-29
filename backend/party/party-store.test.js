'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var createStore = require('./party-store').createStore;

test('save then loadAll returns the object; save again replaces it; remove deletes it', function () {
    var db = new Database(':memory:'), st = createStore(db);
    assert.deepEqual(st.loadAll(), []);
    st.save('1234', { code: '1234', phase: 'lobby', players: [{ n: 1, name: 'سارة' }] });
    st.save('5678', { code: '5678', phase: 'closed' });
    st.save('1234', { code: '1234', phase: 'dance' });
    var all = st.loadAll().sort(function (a, b) { return a.code < b.code ? -1 : 1; });
    assert.deepEqual(all.map(function (r) { return r.phase; }), ['dance', 'closed']);
    st.remove('1234');
    assert.deepEqual(st.loadAll().map(function (r) { return r.code; }), ['5678']);
});

test('a corrupt row is skipped, not fatal', function () {
    var db = new Database(':memory:'), st = createStore(db);
    st.save('1111', { code: '1111' });
    db.prepare('INSERT INTO party_rooms (code, data, updated_at) VALUES (?, ?, ?)').run('2222', '{nope', 1);
    assert.deepEqual(st.loadAll().map(function (r) { return r.code; }), ['1111']);
});
