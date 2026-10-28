'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var http = require('http');
var net = require('net');
var party = require('./party-server');
party._setHostKey('test-key');

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
    c.send({ t: 'host', girlName: 'سارة', key: 'test-key' });
    var m = await c.wait(function (x) { return x.t === 'err'; });
    assert.equal(m.err, 'disabled');
    c.close(); srv.close();
});

test('host → join → both receive room roster with the guest', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var h = await client(port);
    h.send({ t: 'host', girlName: 'سارة', key: 'test-key' });
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
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key' });
    var code = (await h.wait(function (x) { return x.t === 'hosted'; })).code;
    var a = await client(port), b = await client(port);
    // b شاشة عرض (تستقبل كل حركة كل دورة) — قاعدة القريب/البعيد لها اختبارها في party-rooms
    a.send({ t: 'join', code: code, name: 'أ' }); b.send({ t: 'peek', code: code });
    var wa = await a.wait(function (x) { return x.t === 'welcome'; });
    await b.wait(function (x) { return x.t === 'all'; });
    var flat = (await a.wait(function (x) { return x.t === 'all'; })).d, start = null;
    for (var i = 0; i < flat.length; i += 5) if (flat[i] === wa.n) start = [flat[i], flat[i + 1] / 100, flat[i + 2] / 100];
    await new Promise(function (r) { setTimeout(r, 200); });
    b.msgs.length = 0;
    var t0 = Date.now();
    a.send({ t: 'mv', p: [start[1] + 1, start[2], 0, 1] });
    var s = await b.wait(function (x) { if (x.t !== 's') return false; for (var i = 0; i < x.d.length; i += 5) if (x.d[i] === wa.n) return true; return false; }, 300);
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
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key' });
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

// ---- عميل خام (TCP) للحالات اللي WebSocket المدمج ما يقدر يسويها ----
function maskFrame(str) {
    var payload = Buffer.from(str), len = payload.length, mask = Buffer.from([1, 2, 3, 4]), head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
    var out = Buffer.alloc(len); for (var i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, out]);
}
function rawClient(port) {
    return new Promise(function (resolve) {
        var sock = net.connect(port, '127.0.0.1', function () {
            sock.write('GET /ws/party HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
            setTimeout(function () { resolve({ sock: sock, send: function (o) { sock.write(maskFrame(JSON.stringify(o))); } }); }, 80);
        });
        sock.on('error', function () { });
    });
}
async function hostRoom(port) {
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key' });
    return { h: h, code: (await h.wait(function (x) { return x.t === 'hosted'; })).code };
}
function onlineOf(code, name) { var r = party._mgr.roster(code).players.find(function (p) { return p[1] === name; }); return r ? r[4] : null; }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

test('creating a party needs the private host key', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), c = await client(srv.address().port);
    c.send({ t: 'host', girlName: 'سارة' });
    assert.equal((await c.wait(function (x) { return x.t === 'err'; })).err, 'hostkey');
    c.send({ t: 'host', girlName: 'سارة', key: 'wrong' });
    await sleep(1100);
    assert.equal(c.msgs.filter(function (x) { return x.t === 'err' && x.err === 'hostkey'; }).length, 2);
    c.close(); srv.close();
});

test('a second join on the same socket is refused (no ghost players)', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var c = await client(port);
    c.send({ t: 'peek', code: r.code });
    await c.wait(function (x) { return x.t === 'room'; });
    c.send({ t: 'join', code: r.code, name: 'أ' });
    await c.wait(function (x) { return x.t === 'welcome'; });
    await sleep(1100);
    c.send({ t: 'join', code: r.code, name: 'ب' });
    assert.equal((await c.wait(function (x) { return x.t === 'err'; })).err, 'already');
    assert.equal(party._mgr.roster(r.code).players.length, 1);
    r.h.close(); c.close(); srv.close();
});

test('peek flood from one socket is throttled', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var c = await client(port);
    for (var i = 0; i < 200; i++) c.send({ t: 'peek', code: r.code });
    await sleep(1000);
    var rooms = c.msgs.filter(function (x) { return x.t === 'room'; }).length;
    assert.ok(rooms <= 4, 'got ' + rooms + ' room replies');
    r.h.close(); c.close(); srv.close();
});

test('slow reader with a huge backlog is disconnected instead of buffering', function () {
    var destroyed = false, wrote = false;
    var fake = { closed: false, socket: { writableLength: 300 * 1024, write: function () { wrote = true; }, destroy: function () { destroyed = true; } } };
    party._sendRaw(fake, Buffer.from('x'));
    assert.equal(destroyed, true);
    assert.equal(wrote, false);
});

test('half-closed socket (FIN without close frame) marks the player offline', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var raw = await rawClient(port);
    raw.send({ t: 'join', code: r.code, name: 'غائب' });
    await sleep(300);
    assert.equal(onlineOf(r.code, 'غائب'), 1);
    raw.sock.end();
    await sleep(400);
    assert.equal(onlineOf(r.code, 'غائب'), 0);
    r.h.close(); srv.close();
});

test('silent socket is dropped after the idle timeout', async function () {
    reset(); party._setEnabled(true); party._setIdleMs(500);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var raw = await rawClient(port);
    raw.send({ t: 'join', code: r.code, name: 'نايم' });
    await sleep(200);
    assert.equal(onlineOf(r.code, 'نايم'), 1);
    await sleep(900);
    assert.equal(onlineOf(r.code, 'نايم'), 0);
    party._setIdleMs(40000);
    raw.sock.destroy(); r.h.close(); srv.close();
});

test('roster broadcasts are coalesced when many people arrive at once', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var obs = await client(port); obs.send({ t: 'peek', code: r.code }); await obs.wait(function (x) { return x.t === 'room'; });
    await sleep(1100); obs.msgs.length = 0;
    var cs = [];
    for (var i = 0; i < 20; i++) { var c = await client(port); c.send({ t: 'join', code: r.code, name: 'ض' + i }); cs.push(c); }
    await sleep(1500);
    var rooms = obs.msgs.filter(function (x) { return x.t === 'room'; });
    assert.ok(rooms.length <= 3, 'got ' + rooms.length + ' roster broadcasts');
    assert.equal(rooms[rooms.length - 1].room.players.length, 20);
    cs.forEach(function (c) { c.close(); }); obs.close(); r.h.close(); srv.close();
});
