'use strict';

// «خارج التغطية»: منطق المباراة والغرف — الدفعات، السرية، التصويت والتعادل، التخمين، الانقطاع، وإعادة اللعب.
var test = require('node:test');
var assert = require('node:assert/strict');
var Game = require('./coverage-game');
var Settings = require('./coverage-settings');
var Rooms = require('./coverage-rooms');
var Words = require('./coverage-words');

function clockAt(t) { var c = { t: t || 1000 }; c.fn = function () { return c.t; }; return c; }
function roster(n) { var a = []; for (var i = 0; i < n; i++) a.push({ id: 'p' + i, name: 'لاعب ' + i, look: i % 12 }); return a; }
function mk(n, over, opts) {
    var clk = clockAt(), s = Settings.validate(Object.assign({}, over || {}));
    var g = Game.createGame(roster(n), s, Object.assign({ now: clk.fn }, opts || {}));
    return { g: g, clk: clk, s: s };
}
/** يقدّم الوقت لين تنتهي المرحلة الحالية */
function skip(x) { x.clk.t = x.g.G.stage.ends; x.g.tick(x.clk.t); }
function toStage(x, k) { for (var i = 0; i < 60 && x.g.G.stage.k !== k; i++) skip(x); assert.equal(x.g.G.stage.k, k); }
function outs(x) { return x.g.G.players.filter(function (p) { return p.out; }).map(function (p) { return p.id; }); }
function civs(x) { return x.g.G.players.filter(function (p) { return !p.out; }).map(function (p) { return p.id; }); }

test('الدفعات: 3 لاعبين بكل دفعة، بدون تكرار، وآخر دفعة بالباقي', function () {
    [[4, [3, 1]], [5, [3, 2]], [8, [3, 3, 2]], [10, [3, 3, 3, 1]]].forEach(function (c) {
        var x = mk(c[0]);
        assert.deepEqual(x.g.G.batches.map(function (b) { return b.length; }), c[1]);
        var all = [].concat.apply([], x.g.G.batches);
        assert.equal(new Set(all).size, c[0]);
    });
    var y = mk(7, { batchSize: 2 });
    assert.deepEqual(y.g.G.batches.map(function (b) { return b.length; }), [2, 2, 2, 1]);
});

test('السرية: شاشة البث وباقي اللاعبين ما يوصلهم أي كلمة أو دور', function () {
    var x = mk(6);
    toStage(x, 'write');
    var host = JSON.stringify(x.g.view('host'));
    assert.ok(host.indexOf(x.g.G.word) < 0 && host.indexOf(x.g.G.alt) < 0);
    assert.ok(!/"out":/.test(host));
    var o = outs(x)[0], c = civs(x)[0];
    assert.equal(x.g.view(o).me.word, x.g.G.alt);
    assert.equal(x.g.view(c).me.word, x.g.G.word);
    var other = JSON.stringify(x.g.view(c));
    assert.ok(other.indexOf(x.g.G.alt) < 0, 'كلمة خارج التغطية ما توصل للأغلبية');
    assert.ok(!/"out":true/.test(other.replace(/"me":\{[^}]*\}/, '')));
});

test('التلميح: متزامن ومخفي لين تخلص الدفعة، وممنوع ذكر الكلمة', function () {
    var x = mk(5);
    toStage(x, 'write');
    var b = x.g.G.batches[0], p0 = x.g.G.players.find(function (p) { return p.id === b[0]; });
    var word = p0.out ? x.g.G.alt : x.g.G.word;
    assert.ok(x.g.act(b[0], 'hint', 'هذي ' + word).err);
    assert.equal(x.g.act(b[0], 'hint', 'شي كبير'), undefined);
    assert.ok(x.g.act(b[0], 'hint', 'ثاني').err, 'ما يتغيّر بعد الإرسال');
    var notInBatch = x.g.G.batches[1][0];
    assert.ok(x.g.act(notInBatch, 'hint', 'قبل دوري').err);
    var v = x.g.view(b[1]);
    assert.equal(v.players.find(function (p) { return p.id === b[0]; }).hint, undefined);
    assert.equal(v.players.find(function (p) { return p.id === b[0]; }).sent, true);
    // الباقين ما أرسلوا: ينتهي الوقت والمباراة تكمل، واللي ما أرسل يطلع ''
    skip(x);
    assert.equal(x.g.G.stage.k, 'show');
    v = x.g.view('host');
    assert.equal(v.players.find(function (p) { return p.id === b[0]; }).hint, 'شي كبير');
    assert.equal(v.players.find(function (p) { return p.id === b[1]; }).hint, '');
});

test('الدفعة تنتهي بدري لما الكل يرسل', function () {
    var x = mk(4);
    toStage(x, 'write');
    x.g.G.batches[0].forEach(function (id) { x.g.act(id, 'hint', 'تلميح ' + id); });
    x.g.tick(x.clk.t);
    assert.equal(x.g.G.stage.k, 'show');
    skip(x); assert.equal(x.g.G.stage.k, 'write'); assert.equal(x.g.G.batch, 1);
    skip(x); skip(x); assert.equal(x.g.G.stage.k, 'talk');
});

function playToVote(x) { toStage(x, 'vote'); }

test('التصويت: سري، ما يصوّت لنفسه، ما يتغيّر — والمكشوف يخمّن', function () {
    var x = mk(5);
    playToVote(x);
    var o = outs(x)[0], cs = civs(x);
    assert.ok(x.g.act(cs[0], 'vote', cs[0]).err);
    cs.forEach(function (id) { x.g.act(id, 'vote', o); });
    assert.ok(x.g.act(cs[0], 'vote', cs[1]).err, 'التصويت نهائي');
    var hv = x.g.view('host');
    assert.equal(hv.tally, null); assert.ok(hv.players.every(function (p) { return p.vote === undefined; }));
    x.g.act(o, 'vote', cs[0]);
    x.g.tick(x.clk.t);
    assert.equal(x.g.G.stage.k, 'reveal');
    assert.equal(x.g.view('host').accused, o);
    assert.equal(x.g.view('host').accusedOut, null, 'الدور ما ينكشف قبل لحظة الكشف');
    skip(x); assert.equal(x.g.G.stage.k, 'unmask'); assert.equal(x.g.view('host').accusedOut, true);
    skip(x); assert.equal(x.g.G.stage.k, 'guess');
    assert.equal(x.g.view('host').words, null);
    assert.ok(x.g.act(cs[0], 'guess', 'x').err);
    x.g.act(o, 'guess', 'ال' + x.g.G.word);
    x.g.tick(x.clk.t);
    assert.equal(x.g.G.stage.k, 'guessed'); assert.equal(x.g.G.guessOk, true);
    skip(x);
    var r = x.g.G.result;
    assert.equal(r.winner, 'out'); assert.equal(r.reason, 'guessed');
    assert.equal(r.points[o], 4);
    cs.forEach(function (id) { assert.equal(r.points[id], 1); });   // صوّتوا صح
});

test('التخمين الغلط = فوز الأغلبية، ومدة التخمين تنتهي بدون إرسال', function () {
    var x = mk(6);
    playToVote(x);
    var o = outs(x)[0], cs = civs(x);
    cs.forEach(function (id) { x.g.act(id, 'vote', o); }); x.g.act(o, 'vote', cs[0]);
    x.g.tick(x.clk.t); toStage(x, 'guess'); skip(x); skip(x);
    assert.equal(x.g.G.result.winner, 'in');
    cs.forEach(function (id) { assert.equal(x.g.G.result.points[id], 3); });
});

test('التعادل: جولة فاصلة بين المتعادلين، وتعادل ثاني = ما أحد ينكشف', function () {
    var x = mk(6, { finalGuess: false });
    playToVote(x);
    var ids = x.g.G.players.map(function (p) { return p.id; });
    // p0 وp1 كل واحد صوتين، والباقي صوت لكل واحد مو عليهم
    x.g.act(ids[2], 'vote', ids[0]); x.g.act(ids[3], 'vote', ids[0]);
    x.g.act(ids[4], 'vote', ids[1]); x.g.act(ids[5], 'vote', ids[1]);
    skip(x);
    assert.equal(x.g.G.stage.k, 'runoff');
    assert.deepEqual(x.g.G.runoff.slice().sort(), [ids[0], ids[1]].sort());
    assert.ok(x.g.act(ids[2], 'vote', ids[3]).err, 'الفاصلة بين المتعادلين بس');
    x.g.act(ids[2], 'vote', ids[0]); x.g.act(ids[3], 'vote', ids[1]);
    skip(x);
    assert.equal(x.g.G.stage.k, 'reveal'); assert.equal(x.g.G.accused, null);
    skip(x);
    assert.equal(x.g.G.result.winner, 'out'); assert.equal(x.g.G.result.reason, 'tie');
});

test('اتهام بريء = فوز خارج التغطية', function () {
    var x = mk(5);
    playToVote(x);
    var cs = civs(x);
    x.g.G.players.forEach(function (p) { x.g.act(p.id, 'vote', p.id === cs[0] ? cs[1] : cs[0]); });
    skip(x); toStage(x, 'over');
    assert.equal(x.g.G.result.winner, 'out'); assert.equal(x.g.G.result.reason, 'wrong');
});

test('لاعب منقطع ما يوقف الدفعة، ولاعب يطلع يكمل بدونه', function () {
    var offline = {};
    var x = mk(5, {}, { isOnline: function (id) { return !offline[id]; } });
    toStage(x, 'write');
    var b = x.g.G.batches[0];
    offline[b[2]] = true;
    x.g.act(b[0], 'hint', 'أ'); x.g.act(b[1], 'hint', 'ب'); x.g.tick(x.clk.t);
    assert.equal(x.g.G.stage.k, 'show');
    // خارج التغطية يطلع ← المباراة تنتهي بدون فايز
    x.g.remove(outs(x)[0]);
    assert.equal(x.g.G.stage.k, 'over'); assert.equal(x.g.G.result.winner, 'none');
});

test('المذيع ينهي النقاش مرة وحدة بس حتى مع الضغط المكرر', function () {
    var x = mk(4);
    toStage(x, 'talk');
    var seq = x.g.G.stage.seq;
    assert.equal(x.g.endStage(seq), true);
    assert.equal(x.g.G.stage.k, 'vote');
    assert.equal(x.g.endStage(seq), false);
    assert.equal(x.g.G.stage.k, 'vote');
});

test('بدون كلمة: خارج التغطية ما توصله كلمة', function () {
    var x = mk(5, { mode: 'blank' });
    var o = outs(x)[0];
    assert.equal(x.g.view(o).me.word, null);
    assert.equal(x.g.view(o).me.out, true);
});

test('توحيد الكتابة بالتخمين', function () {
    assert.ok(Words.matches('المطار', 'مطار'));
    assert.ok(Words.matches('مَطَار ', 'مطار'));
    assert.ok(Words.matches('محطه القطار', 'محطة قطار'));
    assert.ok(!Words.matches('قطار', 'مطار'));
    assert.ok(Words.containsWord('اسمه المطار الكبير', 'مطار'));
});

// ---------------------------------------------------------------- الغرف (بدون شبكة)
function hub() {
    var clk = clockAt(), n = 0;
    var h = Rooms.createHub({ now: clk.fn, allocate: function (taken) { var c = String(1600 + (n++)); return taken(c) ? null : c; } });
    function client() { var c = { box: [] }; c.c = h.open(function (m) { c.box.push(m); }); c.send = function (m) { h.message(c.c, m); }; c.last = function (t) { for (var i = c.box.length - 1; i >= 0; i--) if (c.box[i].t === t) return c.box[i]; }; return c; }
    return { h: h, clk: clk, client: client };
}

test('الغرفة: رقم من نطاق اللعبة، دخول بالاسم بدون حساب، ومنع بدء مباراتين', function () {
    var H = hub(), host = H.client();
    host.send({ t: 'host' });
    var code = host.last('welcome').code;
    assert.equal(code, '1600');
    var ps = [];
    for (var i = 0; i < 4; i++) { var p = H.client(); p.send({ t: 'join', code: code, name: 'لاعب' + i }); assert.ok(p.last('welcome')); ps.push(p); }
    var dup = H.client(); dup.send({ t: 'join', code: code, name: 'لاعب0' }); assert.equal(dup.last('err').step, 'name');
    var bad = H.client(); bad.send({ t: 'join', code: '9999', name: 'س' }); assert.ok(bad.last('err'));
    host.send({ t: 'start' });
    var mid = H.h.rooms[code].game.G.mid;
    host.send({ t: 'start' }); host.send({ t: 'again' });
    assert.equal(H.h.rooms[code].game.G.mid, mid, 'ما تنبدأ مباراة فوق مباراة شغالة');
    assert.ok(H.h.hasRoom(code));
    // كل جوال يوصله نسخته، وشاشة البث بدون كلمات
    H.h.tick();
    var hs = JSON.stringify(host.last('state'));
    var G = H.h.rooms[code].game.G;
    assert.ok(hs.indexOf(G.word) < 0);
    ps.forEach(function (p) { assert.ok(p.last('state').G.me); });
});

test('إعادة اللعب نظيفة: نقاط الغرفة تتجمع والكلمات والأصوات تتصفّر', function () {
    var H = hub(), host = H.client();
    host.send({ t: 'host' });
    var code = host.last('welcome').code, ps = [];
    for (var i = 0; i < 4; i++) { var p = H.client(); p.send({ t: 'join', code: code, name: 'لاعب' + i }); ps.push(p); }
    var seen = {};
    for (var m = 0; m < 3; m++) {
        host.send({ t: m ? 'again' : 'start' });
        var room = H.h.rooms[code], G = room.game.G;
        assert.ok(!seen[G.pairKey], 'زوج كلمات جديد كل مباراة'); seen[G.pairKey] = 1;
        assert.ok(G.players.every(function (p) { return !p.hint && !p.vote; }));
        for (var k = 0; k < 80 && G.stage.k !== 'over'; k++) { H.clk.t = G.stage.ends || H.clk.t + 1000; H.h.tick(); }
        assert.equal(G.stage.k, 'over');
        assert.equal(room.matches, m + 1);
    }
    assert.ok(Object.keys(H.h.rooms[code].scores).length > 0);
    host.send({ t: 'lobby' });
    assert.equal(H.h.rooms[code].started, false);
    host.send({ t: 'close' });
    assert.equal(H.h.hasRoom(code), false);
});
