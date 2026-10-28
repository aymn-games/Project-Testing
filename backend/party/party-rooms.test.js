'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var createRoomManager = require('./party-rooms').createRoomManager;

// ساعة قابلة للتحكم عشان اختبارات السرعة والإغراق
function clockMgr(extra) {
    var t = { now: 1000000 };
    var mgr = createRoomManager(Object.assign({ now: function () { return t.now; } }, extra || {}));
    return { mgr: mgr, t: t };
}

test('createRoom gives 4-digit code and secrets', function () {
    var r = createRoomManager().createRoom({ girlName: 'سارة' });
    assert.equal(r.ok, true);
    assert.match(r.code, /^\d{4}$/);
    assert.ok(r.token.length >= 16);
    assert.ok(r.girlKey.length >= 16);
});

test('third room is refused', function () {
    var mgr = createRoomManager();
    assert.equal(mgr.createRoom({ girlName: 'أ' }).ok, true);
    assert.equal(mgr.createRoom({ girlName: 'ب' }).ok, true);
    var r = mgr.createRoom({ girlName: 'ج' });
    assert.equal(r.ok, false);
    assert.equal(r.err, 'busy');
});

test('quick guest joins with cleaned name', function () {
    var mgr = createRoomManager(), room = mgr.createRoom({ girlName: 'سارة' });
    var r = mgr.join(room.code, { name: '  <b>سارة</b>\u0007 الطويلة جداً جداً جداً ' });
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'quick');
    assert.equal(r.role, 'guest');
    var name = mgr.roster(room.code).players[0][1];
    assert.doesNotMatch(name, /[<>\u0000-\u001f]/);
    assert.ok(name.length <= 16);
    assert.ok(name.length > 0);
});

test('empty name refused', function () {
    var mgr = createRoomManager(), room = mgr.createRoom({ girlName: 'سارة' });
    var r = mgr.join(room.code, { name: '   ' });
    assert.equal(r.ok, false);
    assert.equal(r.err, 'name');
});

test('member joins with valid session', function () {
    var mgr = createRoomManager({ validateSession: function (tok) { return tok === 'good' ? { id: 7, username: 'noura', tiktok_username: 'noura_tt', tiktok_verified: true } : null; } });
    var room = mgr.createRoom({ girlName: 'سارة' });
    var r = mgr.join(room.code, { auth: 'good' });
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'member');
    assert.equal(mgr.roster(room.code).players[0][1], 'noura');
});

test('bad session falls back to error', function () {
    var mgr = createRoomManager({ validateSession: function () { return null; } });
    var room = mgr.createRoom({ girlName: 'سارة' });
    var r = mgr.join(room.code, { name: 'ريم', auth: 'bad' });
    assert.equal(r.ok, false);
    assert.equal(r.err, 'auth');
});

test('girl joins with key, second girl refused', function () {
    var mgr = createRoomManager(), room = mgr.createRoom({ girlName: 'سارة' });
    var a = mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey });
    assert.equal(a.ok, true);
    assert.equal(a.role, 'girl');
    assert.equal(a.kind, 'member');
    var b = mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey });
    assert.equal(b.ok, false);
    assert.equal(b.err, 'girl-taken');
    var c = mgr.join(room.code, { name: 'x', girlKey: 'wrong' });
    assert.equal(c.ok, false);
    assert.equal(c.err, 'girl-key');
});

test('101st guest refused', function () {
    var mgr = createRoomManager(), room = mgr.createRoom({ girlName: 'سارة' });
    for (var i = 0; i < 100; i++) assert.equal(mgr.join(room.code, { name: 'ضيف ' + i }).ok, true);
    var r = mgr.join(room.code, { name: 'زائد' });
    assert.equal(r.ok, false);
    assert.equal(r.err, 'full');
    assert.equal(mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey }).ok, true);
});

test('resume keeps same id and n, wrong key refused', function () {
    var mgr = createRoomManager(), room = mgr.createRoom({ girlName: 'سارة' });
    var a = mgr.join(room.code, { name: 'ريم' });
    mgr.leave(room.code, a.id);
    var b = mgr.resume(room.code, a.id, a.key);
    assert.equal(b.ok, true);
    assert.equal(b.id, a.id);
    assert.equal(b.n, a.n);
    assert.equal(mgr.roster(room.code).players.length, 1);
    var c = mgr.resume(room.code, a.id, 'nope');
    assert.equal(c.ok, false);
});

test('move clamps to hall bounds', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' });
    var a = c.mgr.join(room.code, { name: 'ريم' });
    // نقرّب اللاعب من الزاوية بخطوات قانونية ثم نطلب أبعد من الحدود
    for (var i = 0; i < 20; i++) { c.t.now += 1000; c.mgr.move(room.code, a.id, [31 * (i + 1) / 20, 47 - 94 * (i + 1) / 20, 0, 1]); }
    c.t.now += 1000;
    c.mgr.move(room.code, a.id, [99, -99, 0, 0]);
    var p = c.mgr.fullState(room.code).find(function (d) { return d[0] === a.n; });
    assert.equal(p[1], 31);
    assert.equal(p[2], -47);
});

test('move rejects teleport', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' });
    var a = c.mgr.join(room.code, { name: 'ريم' });
    var before = c.mgr.fullState(room.code)[0].slice();
    c.t.now += 500;
    c.mgr.move(room.code, a.id, [before[1] + 30, before[2], 0, 1]);
    var after = c.mgr.fullState(room.code)[0];
    assert.equal(after[1], before[1]);
    assert.equal(after[2], before[2]);
});

test('move ignores flood', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' });
    var a = c.mgr.join(room.code, { name: 'ريم' });
    var s = c.mgr.fullState(room.code)[0];
    c.t.now += 200;
    assert.equal(c.mgr.move(room.code, a.id, [s[1] + 1, s[2], 0, 1]).ok, true);
    c.t.now += 10;
    c.mgr.move(room.code, a.id, [s[1] + 1.1, s[2], 0, 1]);
    assert.equal(c.mgr.fullState(room.code)[0][1], Math.round((s[1] + 1) * 100) / 100);
});

test('move rejects non-numbers', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' });
    var a = c.mgr.join(room.code, { name: 'ريم' });
    c.t.now += 200;
    assert.equal(c.mgr.move(room.code, a.id, ['a', null, 0, 0]).ok, false);
    assert.equal(c.mgr.move(room.code, a.id, 'x').ok, false);
});

test('takeDelta returns only changed players once', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' });
    var a = c.mgr.join(room.code, { name: 'ريم' });
    c.mgr.join(room.code, { name: 'هيا' });
    c.mgr.takeDelta(room.code); // الدخول نفسه تغيير — نصفّره
    var s = c.mgr.fullState(room.code).find(function (d) { return d[0] === a.n; });
    c.t.now += 200;
    c.mgr.move(room.code, a.id, [s[1] + .5, s[2], 1.234, 1]);
    var d1 = c.mgr.takeDelta(room.code);
    assert.equal(d1.length, 1);
    assert.equal(d1[0][0], a.n);
    assert.equal(d1[0][3], 1.23);
    assert.deepEqual(c.mgr.takeDelta(room.code), []);
});

test('unknown room', function () {
    var mgr = createRoomManager();
    ['join', 'resume', 'move', 'roster', 'takeDelta', 'fullState', 'hostResume'].forEach(function (fn) {
        var r = mgr[fn]('0000', {}, 'x', [0, 0, 0, 0]);
        assert.equal(r.ok, false, fn);
        assert.equal(r.err, 'nocode', fn);
    });
});

test('girl can take over from another device when first is offline', function () {
    var mgr = createRoomManager(), room = mgr.createRoom({ girlName: 'سارة' });
    var a = mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey });
    mgr.leave(room.code, a.id);
    var b = mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey });
    assert.equal(b.ok, true);
    assert.equal(b.role, 'girl');
    assert.equal(b.n, a.n);
    assert.notEqual(b.key, a.key);
    assert.equal(mgr.resume(room.code, a.id, a.key).ok, false);
    assert.equal(mgr.roster(room.code).players.filter(function (p) { return p[2] === 'girl'; }).length, 1);
});
