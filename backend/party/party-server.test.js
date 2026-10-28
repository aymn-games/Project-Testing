'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var http = require('http');
var party = require('./party-server');

// سيرفر HTTP صغير يمرّر طلبات الترقية لـ party-server مباشرة (نفس اللي يسويه
// ws-server.js بالإنتاج) — بدون تحميل باقي السيرفر وقاعدة البيانات.
function startServer() {
    return new Promise(function (resolve) {
        var srv = http.createServer();
        srv.on('upgrade', function (req, socket) { party.handleUpgrade(req, socket); });
        srv.listen(0, '127.0.0.1', function () { resolve(srv); });
    });
}

// عميل اختبار: يجمع الرسائل وينتظر رسالة تطابق شرط
function client(port) {
    return new Promise(function (resolve, reject) {
        var ws = new WebSocket('ws://127.0.0.1:' + port + '/ws/party'), msgs = [], waiters = [];
        ws.onmessage = function (e) {
            var m = JSON.parse(e.data); msgs.push(m);
            waiters = waiters.filter(function (w) { if (w.fn(m)) { clearTimeout(w.timer); w.res(m); return false; } return true; });
        };
        ws.onerror = reject;
        ws.onopen = function () {
            resolve({
                ws: ws, msgs: msgs,
                send: function (o) { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); },
                wait: function (fn, ms) {
                    var hit = msgs.find(fn); if (hit) return Promise.resolve(hit);
                    return new Promise(function (res, rej) { var w = { fn: fn, res: res }; w.timer = setTimeout(function () { rej(new Error('timeout waiting')); }, ms || 1500); waiters.push(w); });
                },
                close: function () { ws.close(); }
            });
        };
    });
}

function reset() { party._mgr.rooms().forEach(function (c) { party._mgr.closeRoom(c); }); }

test('disabled by default refuses host', async function () {
    reset(); party._setEnabled(false);
    var srv = await startServer(), c = await client(srv.address().port);
    c.send({ t: 'host', girlName: 'سارة' });
    var m = await c.wait(function (x) { return x.t === 'err'; });
    assert.equal(m.err, 'disabled');
    c.close(); srv.close();
});

test('host → join → both receive room roster with the guest', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var h = await client(port);
    h.send({ t: 'host', girlName: 'سارة' });
    var hosted = await h.wait(function (x) { return x.t === 'hosted'; });
    var g = await client(port);
    g.send({ t: 'join', code: hosted.code, name: 'ريم' });
    var w = await g.wait(function (x) { return x.t === 'welcome'; });
    assert.equal(w.role, 'guest');
    var hasRim = function (x) { return x.t === 'room' && x.room.players.some(function (p) { return p[1] === 'ريم'; }); };
    await h.wait(hasRim);
    await g.wait(hasRim);
    await g.wait(function (x) { return x.t === 'all'; });
    h.close(); g.close(); srv.close();
});

test('movement reaches other client within 300ms', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة' });
    var code = (await h.wait(function (x) { return x.t === 'hosted'; })).code;
    var a = await client(port), b = await client(port);
    a.send({ t: 'join', code: code, name: 'أ' }); b.send({ t: 'join', code: code, name: 'ب' });
    var wa = await a.wait(function (x) { return x.t === 'welcome'; });
    await b.wait(function (x) { return x.t === 'welcome'; });
    var start = (await a.wait(function (x) { return x.t === 'all'; })).d.find(function (r) { return r[0] === wa.n; });
    await new Promise(function (r) { setTimeout(r, 200); });
    b.msgs.length = 0;
    var t0 = Date.now();
    a.send({ t: 'mv', p: [start[1] + 1, start[2], 0, 1] });
    var s = await b.wait(function (x) { return x.t === 's' && x.d.some(function (r) { return r[0] === wa.n; }); }, 300);
    assert.ok(Date.now() - t0 <= 300);
    assert.equal(typeof s.now, 'number');
    h.close(); a.close(); b.close(); srv.close();
});

test('garbage message does not crash server', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), c = await client(srv.address().port);
    c.send('{bad json');
    c.send({ t: 'join' });
    c.send({ t: 'mv', p: 'x' });
    c.send({ t: 'resume', code: null, id: {}, key: [] });
    c.send({ t: 'ping', k: 5 });
    var pong = await c.wait(function (x) { return x.t === 'pong'; });
    assert.equal(pong.k, 5);
    c.close(); srv.close();
});

test('reconnect with resume restores same n', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة' });
    var code = (await h.wait(function (x) { return x.t === 'hosted'; })).code;
    var a = await client(port); a.send({ t: 'join', code: code, name: 'ريم' });
    var w = await a.wait(function (x) { return x.t === 'welcome'; });
    a.close();
    await new Promise(function (r) { setTimeout(r, 100); });
    var a2 = await client(port); a2.send({ t: 'resume', code: code, id: w.id, key: w.key });
    var w2 = await a2.wait(function (x) { return x.t === 'welcome'; });
    assert.equal(w2.n, w.n);
    h.close(); a2.close(); srv.close();
});
