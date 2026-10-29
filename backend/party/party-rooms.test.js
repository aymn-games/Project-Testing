'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var createRoomManager = require('./party-rooms').createRoomManager;

// ساعة قابلة للتحكم عشان اختبارات السرعة والإغراق
function toFree(mgr, code) { mgr.start(code); for (var k = 0; k < 20 && mgr.phaseOf(code).p !== 'free'; k++) mgr.skip(code, mgr.phaseOf(code).p); }

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
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' }); toFree(c.mgr, room.code);
    var a = c.mgr.join(room.code, { name: 'ريم' });
    // نقرّب اللاعب من الزاوية بخطوات قانونية ثم نطلب أبعد من الحدود
    for (var i = 0; i < 20; i++) { c.t.now += 1000; c.mgr.move(room.code, a.id, [31 * (i + 1) / 20, -20 + 67 * (i + 1) / 20, 0, 1]); }
    c.t.now += 1000;
    c.mgr.move(room.code, a.id, [99, 99, 0, 0]);
    var p = c.mgr.fullState(room.code).find(function (d) { return d[0] === a.n; });
    assert.equal(p[1], 31);
    assert.equal(p[2], 47);
});

test('move rejects teleport', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' }); toFree(c.mgr, room.code);
    var a = c.mgr.join(room.code, { name: 'ريم' });
    var before = c.mgr.fullState(room.code)[0].slice();
    c.t.now += 500;
    c.mgr.move(room.code, a.id, [before[1] + 30, before[2], 0, 1]);
    var after = c.mgr.fullState(room.code)[0];
    assert.equal(after[1], before[1]);
    assert.equal(after[2], before[2]);
});

test('move ignores flood', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' }); toFree(c.mgr, room.code);
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
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' }); toFree(c.mgr, room.code);
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
    var c = clockMgr(), mgr = c.mgr, room = mgr.createRoom({ girlName: 'سارة' });
    var a = mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey });
    mgr.leave(room.code, a.id);
    // انتقالها العادي من صفحة الدخول للقاعة (ثواني) ما يسمح لأحد ياخذ مكانها
    c.t.now += 10 * 1000;
    assert.equal(mgr.join(room.code, { name: 'دخيل', girlKey: room.girlKey }).err, 'girl-taken');
    c.t.now += 21 * 1000;
    var b = mgr.join(room.code, { name: 'سارة', girlKey: room.girlKey });
    assert.equal(b.ok, true);
    assert.equal(b.role, 'girl');
    assert.equal(b.n, a.n);
    assert.notEqual(b.key, a.key);
    assert.equal(mgr.resume(room.code, a.id, a.key).ok, false);
    assert.equal(mgr.roster(room.code).players.filter(function (p) { return p[2] === 'girl'; }).length, 1);
});

test('deltaFor: near players every tick, far players only on far ticks, never self', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' }); toFree(c.mgr, room.code);
    var A = c.mgr.join(room.code, { name: 'أ' }), B = c.mgr.join(room.code, { name: 'ب' }), C = c.mgr.join(room.code, { name: 'ج' });
    var st = function (n) { return c.mgr.fullState(room.code).find(function (r) { return r[0] === n; }); };
    var a = st(A.n);
    c.t.now += 5000; c.mgr.move(room.code, B.id, [a[1] + 1, a[2], 0, 1]);
    // خطوات قانونية (≤ 28م لكل حركة) لأن أماكن البداية عشوائية
    [10, 20, 30, 40, 45].forEach(function (d) { c.t.now += 5000; assert.equal(c.mgr.move(room.code, C.id, [a[1], a[2] + d, 0, 1]).ok, true); });
    var seen = new Map();
    var d1 = c.mgr.deltaFor(room.code, A.id, seen, false).map(function (r) { return r[0]; });
    assert.ok(d1.indexOf(B.n) >= 0, 'near B sent');
    assert.ok(d1.indexOf(C.n) < 0, 'far C held');
    assert.ok(d1.indexOf(A.n) < 0, 'self never sent');
    assert.deepEqual(c.mgr.deltaFor(room.code, A.id, seen, false), []);
    var d2 = c.mgr.deltaFor(room.code, A.id, seen, true).map(function (r) { return r[0]; });
    assert.deepEqual(d2, [C.n]);
    assert.deepEqual(c.mgr.deltaFor(room.code, A.id, seen, true), []);
});

test('deltaFor: viewer without a character gets every change', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' });
    c.mgr.join(room.code, { name: 'أ' }); c.mgr.join(room.code, { name: 'ب' });
    var d = c.mgr.deltaFor(room.code, null, new Map(), false);
    assert.equal(d.length, 2);
});

test('packRows flattens rows to integer centimetres', function () {
    var packRows = require('./party-rooms').packRows;
    assert.deepEqual(packRows([[3, -12.34, 17.5, 1.57, 1], [4, 0, 0.01, -3.14, 0]]), [3, -1234, 1750, 157, 1, 4, 0, 1, -314, 0]);
    assert.deepEqual(packRows([]), []);
});

test('full room reuses the slot of a guest offline for over 2 minutes', function () {
    var c = clockMgr(), room = c.mgr.createRoom({ girlName: 'سارة' }), first = null;
    for (var i = 0; i < 100; i++) { var j = c.mgr.join(room.code, { name: 'ضيف ' + i }); if (!first) first = j; }
    c.mgr.leave(room.code, first.id);
    c.t.now += 60 * 1000;
    assert.equal(c.mgr.join(room.code, { name: 'جديد' }).err, 'full', 'brief disconnect keeps the slot');
    c.t.now += 61 * 1000;
    var r = c.mgr.join(room.code, { name: 'جديد' });
    assert.equal(r.ok, true);
    assert.equal(c.mgr.roster(room.code).players.length, 100);
    assert.equal(c.mgr.resume(room.code, first.id, first.key).ok, false);
});

// ================= الدفعة 2: المراحل والمناطق =================
function showRoom(extra) {
    var c = clockMgr(), room = c.mgr.createRoom(Object.assign({ girlName: 'سارة' }, extra || {}));
    return { c: c, mgr: c.mgr, code: room.code, room: room };
}
function rowOf(mgr, code, n, viewer) { return mgr.fullState(code, viewer, true).find(function (r) { return r[0] === n; }); }

test('room without a schedule starts in lobby and waits for the host (default durations)', function () {
    var d = showRoom();
    var ph = d.mgr.phaseOf(d.code);
    assert.equal(ph.p, 'lobby'); assert.equal(ph.sched, null); assert.equal(ph.waitGirl, false);
    d.c.t.now += 3600000; d.mgr.tick(d.code); assert.equal(d.mgr.phaseOf(d.code).p, 'lobby');
    d.mgr.start(d.code); d.mgr.skip(d.code, 'entrance'); d.mgr.skip(d.code, 'reveal');
    ph = d.mgr.phaseOf(d.code); assert.equal(ph.until - ph.at, 7 * 60000);
});

test('lobby spawns guests in lounge and girl in her room', function () {
    var s = showRoom();
    var g = s.mgr.join(s.code, { name: 'ريم' }), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    var rg = rowOf(s.mgr, s.code, g.n, null), rr = rowOf(s.mgr, s.code, girl.n, null);
    assert.ok(rg[1] >= -15 && rg[1] <= 15 && rg[2] >= 50.5 && rg[2] <= 69, 'guest in lounge ' + rg);
    assert.ok(rr[1] >= -9 && rr[1] <= 9 && rr[2] >= -67 && rr[2] <= -50.5, 'girl in her room ' + rr);
});

test('guest cannot leave the lounge during lobby', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' });
    var r = rowOf(s.mgr, s.code, g.n, null);
    s.c.t.now += 2000; s.mgr.move(s.code, g.id, [r[1], 40, 0, 1]); // نقطة برا الصالة (القاعة)
    assert.equal(rowOf(s.mgr, s.code, g.n, null)[2], 50.5);
});

test('start moves to entrance with walk targets for everyone', function () {
    var s = showRoom(), gs = [];
    for (var i = 0; i < 5; i++) gs.push(s.mgr.join(s.code, { name: 'ض' + i }));
    var girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.equal(s.mgr.start(s.code).ok, true);
    var ph = s.mgr.phaseOf(s.code);
    assert.equal(ph.p, 'entrance');
    assert.equal(ph.until - ph.at, 40000);
    var seen = {};
    gs.forEach(function (g) {
        var t = ph.walk[g.n];
        assert.ok(t[0] >= -14 && t[0] <= 14 && t[1] >= -30.5 && t[1] <= -18, 'grid ' + t);
        assert.ok(!seen[t.join()], 'unique'); seen[t.join()] = 1;
    });
    assert.deepEqual(ph.walk[girl.n], [0, -36.5]);
});

test('double start and stale skip are refused', function () {
    var s = showRoom();
    assert.equal(s.mgr.start(s.code).ok, true);
    assert.equal(s.mgr.start(s.code).err, 'phase');
    assert.equal(s.mgr.skip(s.code, 'lobby').err, 'phase');
    assert.equal(s.mgr.skip(s.code, 'entrance').ok, true);
    assert.equal(s.mgr.phaseOf(s.code).p, 'reveal');
});

test('mv is ignored during entrance and reveal', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' });
    s.mgr.start(s.code);
    s.c.t.now += 2000;
    assert.equal(s.mgr.move(s.code, g.id, [0, 50.5, 0, 1]).err, 'auto');
    s.mgr.skip(s.code, 'entrance'); s.c.t.now += 2000;
    assert.equal(s.mgr.move(s.code, g.id, [0, 50.5, 0, 1]).err, 'auto');
});

test('tick advances entrance→reveal→dance→free on time and places everyone', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' });
    s.mgr.start(s.code);
    var target = s.mgr.phaseOf(s.code).walk[g.n];
    s.c.t.now += 39000; assert.equal(s.mgr.tick(s.code).changed, false);
    s.c.t.now += 1000; assert.equal(s.mgr.tick(s.code).changed, true);
    assert.equal(s.mgr.phaseOf(s.code).p, 'reveal');
    var r = rowOf(s.mgr, s.code, g.n, null);
    assert.equal(r[1], target[0]); assert.equal(r[2], target[1]);
    assert.ok(Math.abs(r[3] - Math.PI) < .01);
    s.c.t.now += 12000; s.mgr.tick(s.code); assert.equal(s.mgr.phaseOf(s.code).p, 'dance');
    s.c.t.now += 7 * 60000; s.mgr.tick(s.code); assert.equal(s.mgr.phaseOf(s.code).p, 'gather');
});

test('guest cannot climb the stage during dance; girl can', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    s.mgr.start(s.code); s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    var r = rowOf(s.mgr, s.code, g.n, null);
    s.c.t.now += 2000; s.mgr.move(s.code, g.id, [r[1], -36, 0, 1]);
    assert.equal(rowOf(s.mgr, s.code, g.n, null)[2], -31);
    s.c.t.now += 2000; assert.equal(s.mgr.move(s.code, girl.id, [3, -36.5, 0, 1]).ok, true);
    assert.equal(rowOf(s.mgr, s.code, girl.n, null)[1], 3);
    s.c.t.now += 2000; s.mgr.move(s.code, girl.id, [3, -20, 0, 1]);
    assert.equal(rowOf(s.mgr, s.code, girl.n, null)[2], -20, 'girl can come down');
});

test('girl row hidden from guests before reveal, visible after', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    var has = function (rows) { return rows.some(function (r) { return r[0] === girl.n; }); };
    assert.equal(has(s.mgr.fullState(s.code, g.id)), false);
    assert.equal(has(s.mgr.deltaFor(s.code, g.id, new Map(), true)), false);
    assert.equal(has(s.mgr.fullState(s.code, null, true)), true, 'trusted display sees her');
    assert.equal(has(s.mgr.fullState(s.code, girl.id)), true, 'she sees herself');
    s.mgr.start(s.code);
    assert.equal(has(s.mgr.fullState(s.code, g.id)), false, 'still hidden during entrance');
    s.mgr.skip(s.code, 'entrance');
    assert.equal(has(s.mgr.fullState(s.code, g.id)), true);
    assert.equal(has(s.mgr.deltaFor(s.code, g.id, new Map(), true)), true);
});

test('late joiner during entrance gets a target and appears there', function () {
    var s = showRoom(); s.mgr.join(s.code, { name: 'ريم' });
    s.mgr.start(s.code);
    var late = s.mgr.join(s.code, { name: 'متأخر' }), t = s.mgr.phaseOf(s.code).walk[late.n];
    assert.ok(t, 'has target');
    var r = rowOf(s.mgr, s.code, late.n, null);
    assert.equal(r[1], t[0]); assert.equal(r[2], t[1]);
    s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    var late2 = s.mgr.join(s.code, { name: 'متأخر٢' }), r2 = rowOf(s.mgr, s.code, late2.n, null);
    assert.ok(r2[2] >= -24 && r2[2] <= -14, 'dance spawn near stage ' + r2);
});

test('emote values above the guest limit (10) become 0', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }), r = rowOf(s.mgr, s.code, g.n, null);
    s.c.t.now += 2000; s.mgr.move(s.code, g.id, [r[1], r[2], 0, 4]);
    assert.equal(rowOf(s.mgr, s.code, g.n, null)[4], 4);
    s.c.t.now += 2000; s.mgr.move(s.code, g.id, [r[1], r[2], 0, 12]);
    assert.equal(rowOf(s.mgr, s.code, g.n, null)[4], 0);
});

// ================= الدفعة 3: التهاني والكيكة والصورة والنقاط =================
function toDance(s) { s.mgr.start(s.code); s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal'); }
// toWishes: لين كتابة التهاني (wishWrite) · toShow: من الكتابة للعرض (wishes)
function toWishes(s) { toDance(s); s.mgr.skip(s.code, 'dance'); s.mgr.skip(s.code, 'gather'); }
function toShow(s) { s.mgr.skip(s.code, 'wishWrite'); }

test('dance ends into gather with walk targets, then wish writing', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' });
    toDance(s);
    s.c.t.now += 7 * 60000; s.mgr.tick(s.code);
    var ph = s.mgr.phaseOf(s.code);
    assert.equal(ph.p, 'gather'); assert.ok(ph.walk[g.n]); assert.equal(ph.until - ph.at, 12000);
    assert.equal(s.mgr.move(s.code, g.id, [0, -20, 0, 1]).err, 'auto');
    s.c.t.now += 12000; s.mgr.tick(s.code);
    ph = s.mgr.phaseOf(s.code);
    assert.equal(ph.p, 'wishWrite'); assert.equal(ph.until - ph.at, 3 * 60000);
});

test('wish: only guests, only during wishes, trimmed to 200, text kept as text, bad words masked', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.equal(s.mgr.addWish(s.code, g.id, 'كل عام وانتي بخير').err, 'phase');
    toWishes(s);
    assert.equal(s.mgr.addWish(s.code, girl.id, 'x').err, 'role');
    assert.equal(s.mgr.addWish(s.code, g.id, '   \u0007  ').err, 'empty');
    var long = Array(300).fill('ح').join('');
    assert.equal(s.mgr.addWish(s.code, g.id, long + ' <b>هلا</b> يا كلب').ok, true);
    var it = s.mgr.wishList(s.code).items[0];
    assert.equal(Array.from(it.text).length, 200);
    var w2 = showRoom(), g2 = w2.mgr.join(w2.code, { name: 'هيا' }); toWishes(w2);
    w2.mgr.addWish(w2.code, g2.id, '<b>هلا</b> يا كلب');
    var t2 = w2.mgr.wishList(w2.code).items[0].text;
    assert.ok(t2.indexOf('<b>هلا</b>') === 0, 'kept as plain text: ' + t2);
    assert.ok(t2.indexOf('كلب') < 0 && t2.indexOf('***') > 0, 'masked: ' + t2);
});

test('bad-word mask is whole-word: blessings untouched, insults (with ال/يا, caps, zero-width) masked', function () {
    function clean(text) { var w = showRoom(), g = w.mgr.join(w.code, { name: 'هيا' }); toWishes(w); w.mgr.addWish(w.code, g.id, text); return w.mgr.wishList(w.code).items[0].text; }
    assert.equal(clean('الله يرزقك ويسعدك، رزقك الله'), 'الله يرزقك ويسعدك، رزقك الله');
    assert.equal(clean('أول دخول لي للحفلة'), 'أول دخول لي للحفلة');
    assert.equal(clean('يا كلب'), 'يا ***');
    assert.equal(clean('ياكلب والكلب'), '*** ***');
    assert.equal(clean('FUCK this'), '*** this');
    assert.equal(clean('ك​لب'), '***');
});

test('wish edit during writing, refused once writing closes', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    toWishes(s);
    s.mgr.addWish(s.code, g.id, 'أول'); s.mgr.addWish(s.code, g.id, 'ثاني');
    assert.equal(s.mgr.wishList(s.code).items.length, 1);
    assert.equal(s.mgr.wishList(s.code).items[0].text, 'ثاني');
    toShow(s); s.mgr.nextWish(s.code, girl.id);
    assert.equal(s.mgr.addWish(s.code, g.id, 'ثالث').err, 'phase');
});

test('nextWish shows one per call in first-sent order, skips hidden, and after the last moves to cakeWalk', function () {
    var s = showRoom(), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey }), gs = [];
    for (var i = 0; i < 3; i++) gs.push(s.mgr.join(s.code, { name: 'ض' + i }));
    toWishes(s);
    s.mgr.addWish(s.code, gs[2].id, 'ج'); s.mgr.addWish(s.code, gs[0].id, 'أ'); s.mgr.addWish(s.code, gs[1].id, 'ب');
    s.mgr.hideWish(s.code, s.mgr.wishList(s.code).items[1].id, true); // يخفي «أ»
    toShow(s);
    var r1 = s.mgr.nextWish(s.code, girl.id);
    assert.equal(r1.cur.text, 'ج'); assert.equal(s.mgr.wishesState(s.code).total, 2);
    assert.deepEqual(s.mgr.wishList(s.code).items.map(function (w) { return w.cur; }), [true, false, false], 'host sees which wish is on screen');
    var r2 = s.mgr.nextWish(s.code, 'host');
    assert.equal(r2.cur.text, 'ب'); assert.equal(r2.done, false);
    assert.equal(s.mgr.phaseOf(s.code).p, 'wishes');
    var r3 = s.mgr.nextWish(s.code, girl.id);
    assert.equal(r3.done, true);
    assert.equal(s.mgr.phaseOf(s.code).p, 'cakeWalk');
});

test('next with a stale seen count is refused (girl and host pressing together skip only one)', function () {
    var s = showRoom(), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey }), gs = [];
    for (var i = 0; i < 3; i++) gs.push(s.mgr.join(s.code, { name: 'ض' + i }));
    toWishes(s);
    gs.forEach(function (g, i) { s.mgr.addWish(s.code, g.id, 'رسالة ' + i); });
    toShow(s);
    assert.equal(s.mgr.nextWish(s.code, girl.id, 0).cur.text, 'رسالة 0');
    assert.equal(s.mgr.nextWish(s.code, 'host', 0).err, 'stale');
    assert.equal(s.mgr.wishesState(s.code).cur.text, 'رسالة 0');
    assert.equal(s.mgr.nextWish(s.code, 'host', 1).cur.text, 'رسالة 1');
});

test('offline guests go after online ones in walk slots and do not count in photo rows', function () {
    var s = showRoom(), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey }), gs = [];
    for (var i = 0; i < 4; i++) gs.push(s.mgr.join(s.code, { name: 'ض' + i }));
    s.mgr.leave(s.code, gs[0].id);
    toWishes(s); s.mgr.skip(s.code, 'wishWrite'); s.mgr.skip(s.code, 'cakeWalk'); s.mgr.cut(s.code, girl.id); s.mgr.skip(s.code, 'celebrate');
    var walk = s.mgr.phaseOf(s.code).walk, on = [1, 2, 3].map(function (i) { return walk[gs[i].n]; });
    assert.deepEqual(on.map(function (t) { return t[0]; }), [-1.1, 0, 1.1], 'three online guests centered');
    assert.ok(walk[gs[0].n][1] > on[0][1], 'offline guest behind');
});

test('only the girl (or host) can next and cut', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    toWishes(s);
    assert.equal(s.mgr.nextWish(s.code, g.id).err, 'role');
    s.mgr.skip(s.code, 'wishWrite'); s.mgr.skip(s.code, 'cakeWalk');
    assert.equal(s.mgr.phaseOf(s.code).p, 'cake');
    assert.equal(s.mgr.cut(s.code, g.id).err, 'role');
    assert.equal(s.mgr.cut(s.code, girl.id).ok, true);
    assert.equal(s.mgr.cut(s.code, girl.id).err, 'phase');
});

test('cut only during cake → celebrate → photo → free with photo targets behind the girl', function () {
    var s = showRoom(), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey }), gs = [];
    for (var i = 0; i < 20; i++) gs.push(s.mgr.join(s.code, { name: 'ض' + i }));
    toWishes(s);
    assert.equal(s.mgr.cut(s.code, 'host').err, 'phase');
    s.mgr.skip(s.code, 'wishWrite'); s.mgr.skip(s.code, 'cakeWalk');
    var ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'cake'); assert.equal(ph.until, 0);
    s.mgr.cut(s.code, 'host');
    ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'celebrate'); assert.equal(ph.cut, true); assert.equal(ph.until - ph.at, 5 * 60000);
    s.c.t.now += 5 * 60000; s.mgr.tick(s.code);
    ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'photo'); assert.equal(ph.until - ph.at, 16000);
    assert.deepEqual(ph.walk[girl.n], [0, -29.6]);
    gs.forEach(function (g) { var t = ph.walk[g.n]; assert.ok(t[1] > -29.6 && t[1] <= -29.6 + 1.2 * 6 + .01, 'row behind ' + t); });
    s.c.t.now += 16000; s.mgr.tick(s.code);
    assert.equal(s.mgr.phaseOf(s.code).p, 'free');
    var r = rowOf(s.mgr, s.code, girl.n, null);
    assert.equal(r[1], 0); assert.equal(r[2], -29.6);
});

test('photo rows are centered behind the girl, staggered, no overlap; late joiner goes to a new row behind', function () {
    var s = showRoom(), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey }), gs = [];
    for (var i = 0; i < 30; i++) gs.push(s.mgr.join(s.code, { name: 'ض' + i }));
    toWishes(s); s.mgr.skip(s.code, 'wishWrite'); s.mgr.skip(s.code, 'cakeWalk'); s.mgr.cut(s.code, girl.id); s.mgr.skip(s.code, 'celebrate');
    var walk = s.mgr.phaseOf(s.code).walk, ts = gs.map(function (g) { return walk[g.n]; }), keys = {};
    ts.forEach(function (t) { keys[t.join()] = 1; assert.ok(Math.abs(t[0]) <= 7.7, 'inside frame ' + t); assert.ok(t[1] > -29.6, 'behind girl ' + t); });
    assert.equal(Object.keys(keys).length, 30, 'no two guests on one spot');
    var row0 = ts.filter(function (t) { return t[1] === ts[0][1]; });
    assert.equal(row0.length, 14);
    assert.ok(Math.abs(row0.reduce(function (a, t) { return a + t[0]; }, 0) / 14) < .01, 'row centered');
    var last = ts.filter(function (t) { return t[1] === ts[29][1]; });
    assert.equal(last.length, 2, 'last row has the remainder');
    var late = s.mgr.join(s.code, { name: 'متأخر' }), lt = s.mgr.phaseOf(s.code).walk[late.n];
    assert.ok(lt[1] > ts[29][1], 'late joiner behind everyone ' + lt);
});

test('pointsList includes only tiktok-verified members (not quick guests even if named like a tiktok user)', function () {
    var users = { a: { id: 1, username: 'nora', tiktok_username: 'nora_tt', tiktok_verified: true }, b: { id: 2, username: 'lama', tiktok_username: 'lama_tt', tiktok_verified: false } };
    var c = clockMgr({ validateSession: function (t) { return users[t] || null; } }), room = c.mgr.createRoom({ girlName: 'سارة' });
    c.mgr.join(room.code, { auth: 'a' }); c.mgr.join(room.code, { auth: 'b' }); c.mgr.join(room.code, { name: 'nora_tt' });
    c.mgr.start(room.code); c.t.now += 90000;
    var pl = c.mgr.pointsList(room.code);
    assert.deepEqual(pl.players.map(function (p) { return p.id; }), ['tiktok:nora_tt']);
    assert.equal(pl.durationMs, 90000);
});

test('late joiner during wishes/photo is placed correctly', function () {
    var s = showRoom(), girl = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    toWishes(s);
    var a = s.mgr.join(s.code, { name: 'متأخر' }), ra = rowOf(s.mgr, s.code, a.n, null);
    assert.ok(ra[2] >= -31 && ra[2] <= -14, 'near stage ' + ra);
    s.mgr.skip(s.code, 'wishWrite'); s.mgr.skip(s.code, 'cakeWalk'); s.mgr.cut(s.code, girl.id); s.mgr.skip(s.code, 'celebrate');
    var b = s.mgr.join(s.code, { name: 'متأخر٢' }), t = s.mgr.phaseOf(s.code).walk[b.n], rb = rowOf(s.mgr, s.code, b.n, null);
    assert.ok(t, 'photo target'); assert.equal(rb[1], t[0]); assert.equal(rb[2], t[1]);
});

// ---------- الدفعة 4: الشكل والحركات والطرد والمشاهد الموثوق ----------
function lookRoom() {
    var c = clockMgr({ validateSession: function (t) { return t === 'm' ? { id: 7, username: 'nora' } : null; } }), room = c.mgr.createRoom({ girlName: 'سارة' });
    return { c: c, mgr: c.mgr, code: room.code, room: room };
}

test('look has 8 fields: quick keeps outfit color and hat only; hs 4/5 allowed', function () {
    var s = lookRoom(), q = s.mgr.join(s.code, { name: 'ريم' }), m = s.mgr.join(s.code, { auth: 'm' }), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.deepEqual(s.mgr.setLook(s.code, q.id, [1, 3, 2, 4, 5, 2, 1, 3]).look, [-1, 3, -1, -1, -1, -1, -1, 3]);
    assert.deepEqual(s.mgr.setLook(s.code, m.id, [1, 3, 2, 4, 5, 2, 1, 4]).look, [1, 3, 2, 4, 5, 2, 1, 4]);
    assert.deepEqual(s.mgr.setLook(s.code, g.id, [0, 11, 4, 7, 4, 5, 3, 0]).look, [0, 11, 4, 7, 4, 5, 3, 0]);
    assert.deepEqual(s.mgr.setLook(s.code, m.id, [2, 12, 5, 8, 6, 6, 4, 5]).look, [-1, -1, -1, -1, -1, -1, -1, -1]);
    assert.deepEqual(s.mgr.setLook(s.code, m.id, ['1', 1.5, null, -3, 0, 0, 0, 1]).look, [-1, -1, -1, -1, 0, 0, 0, 1]);
    assert.equal(s.mgr.setLook(s.code, m.id, 'x').err, 'bad');
    assert.deepEqual(s.mgr.setLook(s.code, m.id, [0, 1]).look, [0, 1, -1, -1, -1, -1, -1, -1], 'short array padded');
});

test('7-field look is accepted and hat becomes -1', function () {
    var s = lookRoom(), m = s.mgr.join(s.code, { auth: 'm' });
    assert.deepEqual(s.mgr.setLook(s.code, m.id, [1, 3, 2, 4, 1, 2, 1]).look, [1, 3, 2, 4, 1, 2, 1, -1]);
});

test('every guest kind gets anims up to 10; 11 only for the girl', function () {
    var s = lookRoom(), q = s.mgr.join(s.code, { name: 'ريم' }), m = s.mgr.join(s.code, { auth: 'm' }), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    toFree(s.mgr, s.code);
    function animAfter(p, a) { s.c.t.now += 500; var r = rowOf(s.mgr, s.code, p.n, null); s.mgr.move(s.code, p.id, [r[1], r[2], 0, a]); return rowOf(s.mgr, s.code, p.n, null)[4]; }
    assert.equal(animAfter(q, 7), 7, 'quick guests get every move now');
    assert.equal(animAfter(q, 10), 10);
    assert.equal(animAfter(q, 11), 0, 'princess bow is the girl\'s');
    assert.equal(animAfter(m, 11), 0);
    assert.equal(animAfter(g, 11), 11);
    assert.equal(animAfter(g, 12), 0);
    assert.equal(animAfter(m, -1), 0);
});

test('roster rows carry look', function () {
    var s = lookRoom(), m = s.mgr.join(s.code, { auth: 'm' });
    assert.deepEqual(s.mgr.roster(s.code).players[0][5], [-1, -1, -1, -1, -1, -1, -1, -1]);
    s.mgr.setLook(s.code, m.id, [1, 2, 3, 4, 1, 2, 3, 2]);
    assert.deepEqual(s.mgr.roster(s.code).players[0][5], [1, 2, 3, 4, 1, 2, 3, 2]);
});

test('kick removes the player; resume with the old key fails', function () {
    var s = lookRoom(), q = s.mgr.join(s.code, { name: 'ريم' }), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    var k = s.mgr.kick(s.code, q.n);
    assert.equal(k.ok, true); assert.equal(k.id, q.id);
    assert.equal(s.mgr.roster(s.code).players.length, 1);
    assert.equal(s.mgr.resume(s.code, q.id, q.key).err, 'resume');
    assert.equal(s.mgr.kick(s.code, 999).err, 'noplayer');
    assert.equal(s.mgr.kick(s.code, g.n).err, 'girl', 'the girl cannot be kicked');
});

test('untrusted peek does not see the girl before reveal; trusted peek (vk) does', function () {
    var s = lookRoom(), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.ok(s.room.viewKey && s.room.viewKey.length >= 16);
    var has = function (trusted) { return s.mgr.fullState(s.code, null, trusted).some(function (r) { return r[0] === g.n; }); };
    assert.equal(has(false), false); assert.equal(has(true), true);
    var seen = new Map(); assert.equal(s.mgr.deltaFor(s.code, null, seen, true, false).some(function (r) { return r[0] === g.n; }), false);
    s.mgr.start(s.code); s.mgr.skip(s.code, 'entrance');
    assert.equal(has(false), true, 'visible after reveal starts');
});

test('kicked member and kicked device cannot join again; other devices still can', function () {
    var s = lookRoom(), m = s.mgr.join(s.code, { auth: 'm' }), q = s.mgr.join(s.code, { name: 'ريم', dev: 'aaaabbbbcccc' });
    s.mgr.kick(s.code, m.n); s.mgr.kick(s.code, q.n);
    assert.equal(s.mgr.join(s.code, { auth: 'm' }).err, 'kicked');
    assert.equal(s.mgr.join(s.code, { name: 'اسم ثاني', dev: 'aaaabbbbcccc' }).err, 'kicked');
    assert.equal(s.mgr.join(s.code, { name: 'هيا', dev: 'ddddeeeeffff' }).ok, true);
    assert.equal(s.mgr.join(s.code, { name: 'بدون جهاز' }).ok, true, 'no dev → allowed (weak protection by design)');
    assert.equal(s.mgr.join(s.code, { name: 'جهاز غلط', dev: '../x' }).ok, true, 'malformed dev is ignored');
});

test('same device joining again replaces its own offline guest, not an online one', function () {
    var s = lookRoom(), q = s.mgr.join(s.code, { name: 'ريم', dev: 'aaaabbbbcccc' });
    var on = s.mgr.join(s.code, { name: 'تبويب ثاني', dev: 'aaaabbbbcccc' });
    assert.equal(s.mgr.roster(s.code).players.length, 2, 'online character is kept');
    s.mgr.leave(s.code, q.id);
    var again = s.mgr.join(s.code, { auth: 'm', dev: 'aaaabbbbcccc' });
    var ns = s.mgr.roster(s.code).players.map(function (r) { return r[0]; });
    assert.deepEqual(ns.sort(), [on.n, again.n].sort());
});

test('kick hides the kicked guest\'s pending wish', function () {
    var s = showRoom(), g = s.mgr.join(s.code, { name: 'ريم' }); s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    toWishes(s);
    s.mgr.addWish(s.code, g.id, 'رسالة مزعجة');
    var k = s.mgr.kick(s.code, g.n);
    assert.equal(k.wishHidden, true);
    assert.equal(s.mgr.wishList(s.code).items[0].hidden, true);
    assert.equal(s.mgr.wishesState(s.code).total, 0);
});

// ---- الحفلة المجدولة على الساعة ----
var cleanSchedule = require('./party-rooms').cleanSchedule;
var MIN = 60000;
// حفلة تبدأ بعد ساعة من «الحين» (t0)، والدخول يفتح قبلها بربع ساعة
function schedRoom(over) {
    var c = clockMgr(), t0 = c.t.now;
    var sched = Object.assign({ startAt: t0 + 60 * MIN, tzOffsetMin: 180 }, over || {});
    var r = c.mgr.createRoom({ girlName: 'سارة', schedule: sched });
    return { c: c, mgr: c.mgr, code: r.code, room: r, t0: t0, start: sched.startAt, at: function (ms) { c.t.now = ms; c.mgr.tick(r.code); }, ph: function () { return c.mgr.phaseOf(r.code).p; } };
}
function girlIn(s) { return s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey }); }
// يطقطق لين المرحلة تتغيّر (لحد 20 مرة) — مثل السيرفر كل 125ms
function settle(s) { for (var k = 0; k < 20; k++) { if (!s.mgr.tick(s.code).changed) break; } }

test('cleanSchedule: defaults, bounds, start in the past or > 30 days rejected', function () {
    var now = 5e12;
    var d = cleanSchedule({ startAt: now + MIN }, now, { creating: true });
    assert.deepEqual([d.durationMin, d.openBeforeMin, d.danceMin, d.writeMin, d.cakeDanceMin, d.cutTimeoutSec], [60, 15, 7, 3, 5, 60]);
    assert.equal(cleanSchedule({ startAt: now + MIN, danceMin: 0 }, now, { creating: true }).danceMin, 1);
    assert.equal(cleanSchedule({ startAt: now + MIN, danceMin: 99 }, now, { creating: true }).danceMin, 60);
    assert.equal(cleanSchedule({ startAt: now + MIN, durationMin: 5 }, now, { creating: true }).durationMin, 15);
    assert.equal(cleanSchedule({ startAt: now - 2 * MIN }, now, { creating: true }), null);
    assert.equal(cleanSchedule({ startAt: now + 31 * 1440 * MIN }, now, { creating: true }), null);
    assert.equal(cleanSchedule({ startAt: 'x' }, now, { creating: true }), null);
    assert.equal(cleanSchedule(null, now, { creating: true }), null);
});

test('room starts closed; guests refused with closed, girl allowed; lobby opens at openAt', function () {
    var s = schedRoom();
    assert.equal(s.ph(), 'closed');
    var sc = s.mgr.phaseOf(s.code).sched;
    assert.deepEqual(sc, { openAt: s.start - 15 * MIN, startAt: s.start, endAt: s.start + 60 * MIN, tzOffsetMin: 180,
        durationMin: 60, openBeforeMin: 15, danceMin: 7, writeMin: 3, cakeDanceMin: 5, cutTimeoutSec: 60 }, 'host page prefills its edit form from this');
    assert.equal(s.mgr.join(s.code, { name: 'ريم' }).err, 'closed');
    assert.equal(girlIn(s).ok, true);
    assert.equal(s.mgr.fullState(s.code, null, false).length, 0, 'girl hidden from untrusted viewers while closed');
    s.at(s.start - 15 * MIN);
    assert.equal(s.ph(), 'lobby');
    assert.equal(s.mgr.join(s.code, { name: 'ريم' }).ok, true);
    assert.equal(createRoomManager().createRoom({ girlName: 'x', schedule: { startAt: 1 } }).err, 'schedule');
});

test('waits for the girl at startAt, starts when she comes online, not again after she drops', function () {
    var s = schedRoom(), g = girlIn(s);
    s.mgr.leave(s.code, g.id);
    s.at(s.start - 15 * MIN); s.at(s.start);
    assert.equal(s.ph(), 'lobby'); assert.equal(s.mgr.phaseOf(s.code).waitGirl, true);
    s.at(s.start + 3 * MIN);
    assert.equal(s.ph(), 'lobby');
    s.mgr.resume(s.code, g.id, g.key); s.mgr.tick(s.code);
    assert.equal(s.ph(), 'entrance'); assert.equal(s.mgr.phaseOf(s.code).waitGirl, false);
    s.at(s.c.t.now + 40000); s.at(s.c.t.now + 12000);
    assert.equal(s.ph(), 'dance');
    s.mgr.leave(s.code, g.id);
    s.at(s.c.t.now + 7 * MIN);
    assert.equal(s.ph(), 'gather', 'the show goes on without her');
});

test('host start skips waiting for the girl', function () {
    var s = schedRoom(); s.at(s.start - 15 * MIN); s.at(s.start);
    assert.equal(s.mgr.phaseOf(s.code).waitGirl, true);
    assert.equal(s.mgr.start(s.code).ok, true);
    assert.equal(s.ph(), 'entrance');
});

test('timed phases follow the schedule', function () {
    var s = schedRoom({ danceMin: 4, writeMin: 2, cakeDanceMin: 6 }), g = girlIn(s), q;
    s.at(s.start - 15 * MIN); q = s.mgr.join(s.code, { name: 'ريم' }); s.at(s.start);
    s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    var ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'dance'); assert.equal(ph.until - ph.at, 4 * MIN);
    s.mgr.skip(s.code, 'dance'); s.mgr.skip(s.code, 'gather');
    ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'wishWrite'); assert.equal(ph.until - ph.at, 2 * MIN);
    s.mgr.addWish(s.code, q.id, 'كل عام وانتي بخير');
    s.mgr.skip(s.code, 'wishWrite'); s.mgr.nextWish(s.code, g.id); s.mgr.nextWish(s.code, g.id);
    s.mgr.skip(s.code, 'cakeWalk'); s.mgr.cut(s.code, g.id);
    ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'celebrate'); assert.equal(ph.until - ph.at, 6 * MIN);
});

test('addWish only during wishWrite; wishes phase has no until', function () {
    var s = schedRoom(), g = girlIn(s), q;
    s.at(s.start - 15 * MIN); q = s.mgr.join(s.code, { name: 'ريم' }); s.at(s.start);
    s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal'); s.mgr.skip(s.code, 'dance');
    assert.equal(s.mgr.addWish(s.code, q.id, 'هلا').err, 'phase');
    s.mgr.skip(s.code, 'gather');
    assert.equal(s.mgr.addWish(s.code, q.id, 'هلا').ok, true);
    s.at(s.c.t.now + 3 * MIN);
    var ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'wishes'); assert.equal(ph.until, 0);
    assert.equal(s.mgr.addWish(s.code, q.id, 'ثانية').err, 'phase');
    s.at(s.c.t.now + 30 * MIN); assert.equal(s.ph(), 'wishes', 'display waits for the messages');
    assert.equal(g.ok, true);
});

test('wishes with no visible wishes moves straight to cakeWalk', function () {
    var s = schedRoom(); girlIn(s);
    s.at(s.start - 15 * MIN); s.at(s.start);
    ['entrance', 'reveal', 'dance', 'gather'].forEach(function (p) { s.mgr.skip(s.code, p); });
    s.at(s.c.t.now + 3 * MIN);
    assert.equal(s.ph(), 'cakeWalk');
});

test('prevWish goes back one visible wish and refuses before the first; seen guards like next', function () {
    var s = schedRoom(), g = girlIn(s), a, b, c;
    s.at(s.start - 15 * MIN);
    a = s.mgr.join(s.code, { name: 'أ' }); b = s.mgr.join(s.code, { name: 'ب' }); c = s.mgr.join(s.code, { name: 'ج' });
    s.at(s.start); ['entrance', 'reveal', 'dance', 'gather'].forEach(function (p) { s.mgr.skip(s.code, p); });
    s.mgr.addWish(s.code, a.id, 'واحد'); s.mgr.addWish(s.code, b.id, 'اثنين'); s.mgr.addWish(s.code, c.id, 'ثلاثة');
    s.mgr.skip(s.code, 'wishWrite');
    assert.equal(s.mgr.prevWish(s.code, g.id, 0).err, 'first');
    s.mgr.nextWish(s.code, g.id, 0); s.mgr.nextWish(s.code, g.id, 1);
    assert.equal(s.mgr.wishesState(s.code).cur.text, 'اثنين');
    assert.equal(s.mgr.prevWish(s.code, g.id, 1).err, 'stale');
    var r = s.mgr.prevWish(s.code, g.id, 2);
    assert.equal(r.ok, true); assert.equal(r.cur.text, 'واحد'); assert.equal(r.cur.i, 1);
    assert.equal(s.mgr.prevWish(s.code, g.id, 1).err, 'first');
    s.mgr.nextWish(s.code, g.id, 1);
    assert.equal(s.mgr.wishesState(s.code).cur.text, 'اثنين');
    var q = s.mgr.join(s.code, { name: 'د' });
    assert.equal(s.mgr.prevWish(s.code, q.id, 2).err, 'role');
});

test('cake auto-cuts after cutTimeoutSec', function () {
    var s = schedRoom({ cutTimeoutSec: 30 }); girlIn(s);
    s.at(s.start - 15 * MIN); s.at(s.start);
    ['entrance', 'reveal', 'dance', 'gather', 'wishWrite'].forEach(function (p) { s.mgr.skip(s.code, p); });
    assert.equal(s.ph(), 'cakeWalk'); s.mgr.skip(s.code, 'cakeWalk');
    assert.equal(s.ph(), 'cake');
    s.at(s.c.t.now + 29000); assert.equal(s.ph(), 'cake');
    s.at(s.c.t.now + 1000);
    var ph = s.mgr.phaseOf(s.code); assert.equal(ph.p, 'celebrate'); assert.equal(ph.cut, true);
});

test('free lasts until endAt; endAt ends the party from wishes; points only after photoDone', function () {
    var s = schedRoom(), g = girlIn(s), q;
    s.at(s.start - 15 * MIN); q = s.mgr.join(s.code, { name: 'ريم' }); s.at(s.start);
    ['entrance', 'reveal', 'dance', 'gather'].forEach(function (p) { s.mgr.skip(s.code, p); });
    s.mgr.addWish(s.code, q.id, 'هلا'); s.mgr.skip(s.code, 'wishWrite');
    assert.equal(s.ph(), 'wishes');
    s.at(s.start + 60 * MIN);
    assert.equal(s.ph(), 'ended'); assert.equal(s.mgr.getRoom(s.code).photoDone, false);
    assert.equal(s.mgr.move(s.code, q.id, [0, 0, 0, 2]).err, 'phase');
    assert.equal(s.mgr.skip(s.code, 'ended').err, 'phase');
    var t = schedRoom(); girlIn(t); t.at(t.start - 15 * MIN); t.at(t.start);
    for (var k = 0; k < 20 && t.ph() !== 'free'; k++) t.mgr.skip(t.code, t.ph());
    var ph = t.mgr.phaseOf(t.code); assert.equal(ph.p, 'free'); assert.equal(t.mgr.getRoom(t.code).photoDone, true);
    t.at(t.start + 59 * MIN); assert.equal(t.ph(), 'free');
    t.at(t.start + 60 * MIN); assert.equal(t.ph(), 'ended');
    assert.equal(g.ok, true);
});

test('shortening the running phase below its elapsed time advances once', function () {
    var s = schedRoom(); girlIn(s);
    s.at(s.start - 15 * MIN); s.at(s.start); s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    s.at(s.c.t.now + 3 * MIN); assert.equal(s.ph(), 'dance');
    assert.equal(s.mgr.setSchedule(s.code, { danceMin: 10 }).ok, true);
    var ph = s.mgr.phaseOf(s.code); assert.equal(ph.until - ph.at, 10 * MIN, 'longer: running phase extended');
    s.mgr.setSchedule(s.code, { danceMin: 2 });
    s.mgr.tick(s.code); assert.equal(s.ph(), 'gather');
    s.mgr.tick(s.code); assert.equal(s.ph(), 'gather', 'only once');
    assert.equal(s.mgr.setSchedule(s.code, { durationMin: 'x', danceMin: 5 }).ok, true);
    assert.equal(s.mgr.getRoom(s.code).sched.durationMin, 60, 'bad field keeps the old value');
});

test('moving startAt later while waiting for the girl re-arms the countdown; ignored after entrance', function () {
    var s = schedRoom(), g = girlIn(s);
    s.mgr.leave(s.code, g.id); s.at(s.start - 15 * MIN); s.at(s.start + MIN);
    assert.equal(s.mgr.phaseOf(s.code).waitGirl, true);
    s.mgr.setSchedule(s.code, { startAt: s.start + 10 * MIN });
    assert.equal(s.mgr.phaseOf(s.code).waitGirl, false);
    s.mgr.resume(s.code, g.id, g.key); s.mgr.tick(s.code);
    assert.equal(s.ph(), 'lobby', 'girl is here but the new start time has not come');
    s.at(s.start + 10 * MIN); assert.equal(s.ph(), 'entrance');
    s.mgr.setSchedule(s.code, { startAt: s.start + 20 * MIN });
    assert.equal(s.mgr.phaseOf(s.code).sched.startAt, s.start + 10 * MIN);
    var u = schedRoom(); u.mgr.setSchedule(u.code, { openBeforeMin: 0 });
    u.at(u.start - 15 * MIN); assert.equal(u.ph(), 'closed');
});

test('join refused with ended after the party ends', function () {
    var s = schedRoom(); s.at(s.start + 61 * MIN); settle(s);
    assert.equal(s.ph(), 'ended');
    assert.equal(s.mgr.join(s.code, { name: 'ريم' }).err, 'ended');
    assert.equal(girlIn(s).err, 'ended');
});

// ---- الحفظ والرجوع بعد إعادة تشغيل السيرفر ----
// مدير جديد بنفس الساعة = سيرفر رجع يشتغل
function reboot(s) {
    var data = JSON.parse(JSON.stringify(s.mgr.serialize(s.code)));
    var mgr2 = createRoomManager({ now: function () { return s.c.t.now; }, validateSession: function () { return null; } });
    var r = mgr2.restore(data);
    return { r: r, mgr: mgr2, ph: function () { return mgr2.phaseOf(s.code).p; } };
}

test('serialize/restore round-trips players, looks, wishes, keys, kicked bans and schedule', function () {
    var s = schedRoom(), g = girlIn(s), q, k;
    s.at(s.start - 15 * MIN);
    q = s.mgr.join(s.code, { name: 'ريم', dev: 'aaaabbbbcccc' }); k = s.mgr.join(s.code, { name: 'مزعج', dev: 'ddddeeeeffff' });
    s.mgr.setLook(s.code, g.id, [0, 3, 2, 1, 2, 3, 1]);
    s.mgr.kick(s.code, k.n);
    s.at(s.start); ['entrance', 'reveal', 'dance', 'gather'].forEach(function (p) { s.mgr.skip(s.code, p); });
    s.mgr.addWish(s.code, q.id, 'كل عام وانتي بخير');
    var b = reboot(s);
    assert.equal(b.r.ok, true); assert.equal(b.ph(), 'wishWrite');
    assert.deepEqual(b.mgr.phaseOf(s.code).sched, s.mgr.phaseOf(s.code).sched);
    var room = b.mgr.getRoom(s.code), old = s.mgr.getRoom(s.code);
    assert.deepEqual([room.token, room.girlKey, room.viewKey, room.girlName], [old.token, old.girlKey, old.viewKey, old.girlName]);
    assert.equal(b.mgr.roster(s.code).players.every(function (p) { return p[4] === 0; }), true, 'everyone offline until they reconnect');
    assert.deepEqual(b.mgr.roster(s.code).players.find(function (p) { return p[0] === g.n; })[5], [0, 3, 2, 1, 2, 3, 1, -1]);
    assert.equal(b.mgr.resume(s.code, q.id, q.key).ok, true);
    assert.equal(b.mgr.resume(s.code, g.id, g.key).role, 'girl');
    assert.equal(b.mgr.wishList(s.code).items[0].text, 'كل عام وانتي بخير');
    assert.equal(b.mgr.join(s.code, { name: 'رجع', dev: 'ddddeeeeffff' }).err, 'kicked');
    var n = b.mgr.join(s.code, { name: 'جديد' });
    assert.ok(n.n > k.n, 'numbering continues after the restore');
    assert.equal(b.mgr.restore(JSON.parse(JSON.stringify(s.mgr.serialize(s.code)))).err, 'exists');
    assert.equal(b.mgr.restore({ code: 5 }).err, 'bad');
});

test('restore catches up through elapsed timed phases and stops at wishes', function () {
    var s = schedRoom(), g = girlIn(s), q;
    s.at(s.start - 15 * MIN); q = s.mgr.join(s.code, { name: 'ريم' }); s.at(s.start);
    s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    var danceAt = s.mgr.phaseOf(s.code).at;
    var data = JSON.parse(JSON.stringify(s.mgr.serialize(s.code)));
    s.c.t.now = danceAt + 7 * MIN + 12000 + 3 * MIN + 1000;
    var mgr2 = createRoomManager({ now: function () { return s.c.t.now; } });
    mgr2.restore(data);
    assert.equal(mgr2.phaseOf(s.code).p, 'cakeWalk', 'no wishes were written → straight past the display');
    // نفس الشي ومعه تهنئة مكتوبة قبل الطفي ← يوقف عند العرض
    var t = schedRoom(), tg = girlIn(t), tq;
    t.at(t.start - 15 * MIN); tq = t.mgr.join(t.code, { name: 'ريم' }); t.at(t.start);
    ['entrance', 'reveal', 'dance', 'gather'].forEach(function (p) { t.mgr.skip(t.code, p); });
    t.mgr.addWish(t.code, tq.id, 'هلا');
    var writeAt = t.mgr.phaseOf(t.code).at, d2 = JSON.parse(JSON.stringify(t.mgr.serialize(t.code)));
    t.c.t.now = writeAt + 3 * MIN + 20 * MIN;
    var mgr3 = createRoomManager({ now: function () { return t.c.t.now; } });
    mgr3.restore(d2);
    var ph = mgr3.phaseOf(t.code);
    assert.equal(ph.p, 'wishes'); assert.equal(ph.at, writeAt + 3 * MIN, 'started when it should have, by the clock');
    assert.equal(g.ok && tg.ok, true);
});

test('restore while dance is still running keeps its end time', function () {
    var s = schedRoom(); girlIn(s);
    s.at(s.start - 15 * MIN); s.at(s.start); s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    var before = s.mgr.phaseOf(s.code);
    s.c.t.now += 2 * MIN;
    var b = reboot(s), after = b.mgr.phaseOf(s.code);
    assert.equal(after.p, 'dance'); assert.equal(after.until, before.until); assert.equal(after.at, before.at);
});

test('restore after endAt lands on ended', function () {
    var s = schedRoom(); girlIn(s);
    s.at(s.start - 15 * MIN);
    s.c.t.now = s.start + 61 * MIN;
    assert.equal(reboot(s).ph(), 'ended');
});

// ---- إصلاحات المراجعة النهائية ----
test('schedule edit that would end the party within a minute is refused', function () {
    var s = schedRoom(); girlIn(s);
    s.at(s.start - 15 * MIN); s.at(s.start); s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    s.c.t.now = s.start + 20 * MIN;
    assert.equal(s.mgr.setSchedule(s.code, { durationMin: 15 }).err, 'ends', 'endAt already passed');
    s.c.t.now = s.start + 14.5 * MIN;
    assert.equal(s.mgr.setSchedule(s.code, { durationMin: 15 }).err, 'ends', 'would end in 30s');
    assert.equal(s.mgr.setSchedule(s.code, { durationMin: 30 }).ok, true);
    assert.equal(s.ph(), 'dance');
});

test('restore refuses rooms long past their end and bad schedules', function () {
    var s = schedRoom(); girlIn(s);
    var data = JSON.parse(JSON.stringify(s.mgr.serialize(s.code)));
    s.c.t.now = s.start + 60 * MIN + 49 * 3600000;
    assert.equal(createRoomManager({ now: function () { return s.c.t.now; } }).restore(data).err, 'expired');
    var bad = JSON.parse(JSON.stringify(data)); bad.sched.durationMin = 'x';
    assert.equal(createRoomManager({ now: function () { return s.start; } }).restore(bad).err, 'bad');
    var nul = JSON.parse(JSON.stringify(data)); nul.players.push(null);
    assert.equal(createRoomManager({ now: function () { return s.start; } }).restore(nul).err, 'bad');
});

// ---- التفاعلات ومطر القلوب وإعداد الشخصيات ----
var REACTS = require('./party-rooms').REACTS;
test('react: allowed set by role, rate-limited per player (2/s, burst 4)', function () {
    var s = lookRoom(), q = s.mgr.join(s.code, { name: 'ريم' }), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.deepEqual(REACTS, ['heart', 'smile', 'laugh', 'party', 'crown', 'love', 'sparkle']);
    assert.equal(s.mgr.react(s.code, q.id, 'crown').err, 'role', 'crown is the girl\'s');
    assert.equal(s.mgr.react(s.code, q.id, 'nope').err, 'bad');
    for (var k = 0; k < 4; k++) assert.equal(s.mgr.react(s.code, q.id, 'heart').ok, true, 'burst ' + k);
    assert.equal(s.mgr.react(s.code, q.id, 'heart').err, 'flood');
    s.c.t.now += 500;
    assert.equal(s.mgr.react(s.code, q.id, 'laugh').ok, true, 'refills 2/s');
    assert.equal(s.mgr.react(s.code, q.id, 'laugh').err, 'flood');
    assert.equal(s.mgr.react(s.code, g.id, 'crown').ok, true);
    var d = s.mgr.takeReacts(s.code);
    assert.equal(d.length, 6);
    assert.deepEqual(d[5], { n: g.n, e: REACTS.indexOf('crown'), girl: true });
    assert.deepEqual(d[0], { n: q.n, e: 0, girl: false });
    assert.equal(s.mgr.takeReacts(s.code).length, 0, 'queue drained');
});

test('girl reactions are hidden from guests before reveal', function () {
    var s = lookRoom(), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.equal(s.mgr.reactHidden(s.code, true), true, 'lobby: hidden');
    toFree(s.mgr, s.code);
    assert.equal(s.mgr.reactHidden(s.code, true), false, 'after reveal: visible');
    assert.equal(s.mgr.reactHidden(s.code, false), false, 'guest reactions are never hidden');
    assert.equal(g.ok, true);
});

test('rain: girl only, after the reveal, 20s cooldown that reports the last rain', function () {
    var s = lookRoom(), q = s.mgr.join(s.code, { name: 'ريم' }), g = s.mgr.join(s.code, { name: 'سارة', girlKey: s.room.girlKey });
    assert.equal(s.mgr.rain(s.code, q.id).err, 'role');
    assert.equal(s.mgr.rain(s.code, g.id).err, 'phase', 'before the reveal it would show she is there');
    s.mgr.start(s.code); s.mgr.skip(s.code, 'entrance'); s.mgr.skip(s.code, 'reveal');
    var r = s.mgr.rain(s.code, g.id); assert.equal(r.ok, true); assert.equal(r.at, s.c.t.now);
    s.c.t.now += 19000; var cd = s.mgr.rain(s.code, g.id); assert.equal(cd.err, 'cooldown'); assert.equal(cd.at, r.at);
    s.c.t.now += 1000; assert.equal(s.mgr.rain(s.code, g.id).ok, true);
});

test('chars setting defaults to rig, host can switch, roster carries it, serialize keeps it', function () {
    var s = lookRoom();
    assert.equal(s.mgr.roster(s.code).chars, 'rig');
    assert.equal(s.mgr.setChars(s.code, 'classic').ok, true);
    assert.equal(s.mgr.roster(s.code).chars, 'classic');
    assert.equal(s.mgr.setChars(s.code, 'x').err, 'bad');
    assert.equal(s.mgr.serialize(s.code).chars, 'classic');
    var c2 = clockMgr(), r2 = c2.mgr.createRoom({ girlName: 'س', chars: 'classic' });
    assert.equal(c2.mgr.roster(r2.code).chars, 'classic');
});
