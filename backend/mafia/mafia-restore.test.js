'use strict';

// المافيا: إعادة تشغيل السيرفر (نشر جديد على Render) وسط مباراة ما تطلّع اللاعبين ولا تنهي المباراة —
// الروم تنحفظ بقاعدة البيانات وترجع، والمذيع والجوالات يكملون بنفس المفاتيح.
var test = require('node:test');
var assert = require('node:assert/strict');
var http = require('node:http');
var path = require('node:path');
var Database = require('better-sqlite3');

var MOD = ['mafia-server.js', 'mafia-game.js'].map(function (f) { return path.join(__dirname, f); });

/** نسخة جديدة من الخادم (كأنه سيرفر جديد اشتغل) — بنفس قاعدة البيانات */
function freshServer(store) {
    MOD.forEach(function (m) { delete require.cache[m]; });
    var srv = require('./mafia-server');
    srv._setStore(store);
    srv._setSessionValidator(function (tok) { return { id: tok, username: 'u' + tok }; });
    srv._setSiteNameLookup(function (uid) { return 'لاعب ' + uid; });
    srv._setPhotoLookup(function () { return null; });
    srv._setFrameLookup(function () { return null; });
    srv._setSeenStore({ hasSeen: function () { return true; }, markSeen: function () {} });
    var server = http.createServer();
    server.on('upgrade', function (req, socket) { srv.handleUpgrade(req, socket); });
    return new Promise(function (res) { server.listen(0, '127.0.0.1', function () { res({ srv: srv, server: server, url: 'ws://127.0.0.1:' + server.address().port + '/ws/mafia' }); }); });
}

/** عميل WebSocket: يجمع الرسائل، و next(t) ينتظر أول رسالة من نوع t */
function client(url) {
    return new Promise(function (res, rej) {
        var ws = new WebSocket(url), msgs = [], waiters = [];
        ws.onmessage = function (e) {
            var m = JSON.parse(e.data); msgs.push(m);
            waiters = waiters.filter(function (w) { if (w.f(m)) { w.r(m); return false; } return true; });
        };
        ws.onerror = rej;
        ws.onopen = function () {
            res({
                ws: ws, msgs: msgs,
                send: function (o) { ws.send(JSON.stringify(o)); },
                next: function (t, f) {
                    var ok = function (m) { return m.t === t && (!f || f(m)); };
                    var hit = msgs.find(ok); if (hit) { msgs.splice(msgs.indexOf(hit), 1); return Promise.resolve(hit); }
                    return new Promise(function (r, j) { var to = setTimeout(function () { j(new Error('timeout waiting ' + t)); }, 4000); waiters.push({ f: ok, r: function (m) { clearTimeout(to); msgs.splice(msgs.indexOf(m), 1); r(m); } }); });
                },
                close: function () { ws.close(); }
            });
        };
    });
}

test('المباراة ترجع بعد إعادة تشغيل السيرفر', async function () {
    var db = new Database(':memory:');
    var store = require('./mafia-store').createStore(db);

    // ---- السيرفر الأول: روم، 6 لاعبين، بداية المباراة
    var A = await freshServer(store);
    var host = await client(A.url);
    host.send({ t: 'host' });
    var w = await host.next('welcome');
    var players = [];
    for (var i = 1; i <= 6; i++) {
        var c = await client(A.url);
        c.send({ t: 'join', code: w.code, auth: String(i), look: {} });
        var pw = await c.next('welcome');
        players.push({ c: c, id: pw.id, key: pw.key });
    }
    host.send({ t: 'start' });
    var st = await players[0].c.next('state');
    var before = A.srv._rooms[w.code].game.G;
    var roles = {}; before.players.forEach(function (p) { roles[p.id] = p.role; });
    // نحرّك المباراة شوي: نخلص مرحلة كشف الأدوار
    A.srv._rooms[w.code].game.endStage();
    var phaseBefore = before.phase, roundBefore = before.round;
    assert.notEqual(phaseBefore, 'reveal');
    A.srv._flushAll();   // نفس اللي يصير عند SIGTERM
    host.close(); players.forEach(function (p) { p.c.close(); });
    await new Promise(function (r) { A.server.close(r); A.server.closeAllConnections && A.server.closeAllConnections(); });

    // ---- السيرفر الجديد: يرجّع من القاعدة
    var B = await freshServer(store);
    B.srv.boot();
    assert.ok(B.srv.hasRoom(w.code), 'الروم رجعت');
    var G = B.srv._rooms[w.code].game.G;
    assert.equal(G.phase, phaseBefore);
    assert.equal(G.round, roundBefore);
    G.players.forEach(function (p) { assert.equal(p.role, roles[p.id], 'نفس الأدوار'); });

    // اللاعب يرجع بنفس المفتاح ويوصله حالة المباراة
    var p1 = await client(B.url);
    p1.send({ t: 'resume', code: w.code, id: players[0].id, key: players[0].key });
    var pw1 = await p1.next('welcome');
    assert.equal(pw1.id, players[0].id);
    var st1 = await p1.next('state');
    assert.equal(st1.G.phase, phaseBefore);
    assert.equal(st1.G.me.role, roles[players[0].id]);

    // المذيع يرجع لنفس الروم (نفس الرقم)
    var h2 = await client(B.url);
    h2.send({ t: 'host', code: w.code, token: w.token });
    var hw = await h2.next('welcome');
    assert.equal(hw.code, w.code);

    // مفتاح غلط ما يدخل
    var bad = await client(B.url);
    bad.send({ t: 'resume', code: w.code, id: players[1].id, key: 'wrong' });
    assert.equal((await bad.next('gone')).reason, 'kicked');

    // إقفال الروم يمسحها من القاعدة
    h2.send({ t: 'close' });
    await new Promise(function (r) { setTimeout(r, 100); });
    assert.equal(store.loadAll().length, 0);

    [p1, h2, bad].forEach(function (c) { c.close(); });
    await new Promise(function (r) { B.server.close(r); B.server.closeAllConnections && B.server.closeAllConnections(); });
});

test('قرار المافيا المحفوظ يرجع مربوط بلاعبين المباراة', function () {
    delete require.cache[MOD[1]];
    var Settings = require('./mafia-settings'), Game = require('./mafia-game');
    var s = Settings.validate({ mafia: 2, disguised: 0, doctors: 1, detectives: 1, cardsCount: 0 });
    var r = []; for (var i = 0; i < 8; i++) r.push({ id: 'p' + i, name: 'P' + i });
    var g = Game.createGame(r, s, { onChange: function () {} }), G = g.G;
    G.players.forEach(function (p, i) { p.role = i < 2 ? 'mafia' : i === 2 ? 'doctor' : i === 3 ? 'detective' : 'citizen'; p.faction = i < 2 ? 'mafia' : 'town'; });
    G.cards = []; G.round = 1; G.phase = 'night'; G.turn = 'mafia'; G.endsAt = Date.now() + 30000;
    G.night = { ops: {}, cards: {}, actions: {}, confirmed: {}, reports: {}, triggered: [], dec: null, unscanned: {} };
    g.act('p0', 'kill', 'p5'); g.act('p1', 'kill', 'p5');
    g.act('p0', 'confirm'); g.act('p1', 'confirm');
    G.endsAt = 1; g.tick(Date.now());   // نهاية دور المافيا ← القرار محسوب، والدور للطبيب
    assert.equal(G.turn, 'doctor');
    var saved = JSON.parse(JSON.stringify(g.serialize()));

    var g2 = Game.createGame(null, null, { onChange: function () {} }, saved), G2 = g2.G;
    assert.equal(G2.night.dec.killTargets[0], G2.players.find(function (p) { return p.id === 'p5'; }));
    G2.endsAt = 1; g2.tick(Date.now());   // الطبيب
    G2.endsAt = 1; g2.tick(Date.now());   // المحقق ← الفجر
    assert.equal(G2.players.find(function (p) { return p.id === 'p5'; }).alive, false, 'الضحية ماتت بالمباراة المرجّعة');
});
