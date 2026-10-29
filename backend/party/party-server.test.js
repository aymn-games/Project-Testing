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

// جدول للاختبارات: البداية بعد نص ساعة والدخول مفتوح من الحين (lobby)
function SCHED() { return { startAt: Date.now() + 30 * 60000, openBeforeMin: 60, tzOffsetMin: 180 }; }
function reset() { party._mgr.rooms().forEach(function (c) { party._mgr.closeRoom(c); }); }

test('disabled by default refuses host', async function () {
    reset(); party._setEnabled(false);
    var srv = await startServer(), c = await client(srv.address().port);
    c.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: SCHED() });
    var m = await c.wait(function (x) { return x.t === 'err'; });
    assert.equal(m.err, 'disabled');
    c.close(); srv.close();
});

test('host → join → both receive room roster with the guest', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var h = await client(port);
    h.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: SCHED() });
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
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: SCHED() });
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
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: SCHED() });
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
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: SCHED() });
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

// ================= الدفعة 2: المراحل =================
function walkHas(d, n) { for (var i = 0; i + 2 < d.length; i += 3) if (d[i] === n) return true; return false; }
function flatHas(d, n) { for (var i = 0; i + 4 < d.length; i += 5) if (d[i] === n) return true; return false; }

test('host can start; guests receive phase entrance with walk', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    await r.h.wait(function (x) { return x.t === 'phase' && x.p === 'lobby'; });
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' });
    var w = await g.wait(function (x) { return x.t === 'welcome'; });
    await g.wait(function (x) { return x.t === 'phase' && x.p === 'lobby'; });
    await sleep(1100);
    r.h.send({ t: 'start' });
    try {
        var ph = await g.wait(function (x) { return x.t === 'phase' && x.p === 'entrance'; });
        assert.ok(walkHas(ph.walk, w.n), 'walk has my target');
        assert.equal(ph.until - ph.at, 40000);
    } catch (e) { e.message += ' | host msgs: ' + JSON.stringify(r.h.msgs.map(function (m) { return m.t + ':' + (m.p || m.err || ''); })); throw e; }
    finally { r.h.close(); g.close(); srv.close(); }
});

test('guest cannot start or skip', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' });
    await g.wait(function (x) { return x.t === 'welcome'; });
    await sleep(1100);
    g.send({ t: 'start' });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'start'; })).err, 'host-only');
    assert.equal(party._mgr.phaseOf(r.code).p, 'lobby');
    r.h.close(); g.close(); srv.close();
});

test('late peek gets current phase', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    await sleep(1100); r.h.send({ t: 'start' });
    await r.h.wait(function (x) { return x.t === 'phase' && x.p === 'entrance'; });
    var v = await client(port); v.send({ t: 'peek', code: r.code });
    var ph = await v.wait(function (x) { return x.t === 'phase'; });
    assert.equal(ph.p, 'entrance');
    r.h.close(); v.close(); srv.close();
});

test('guest never receives girl row before reveal', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var girlKey = (await r.h.wait(function (x) { return x.t === 'hosted'; })).girlKey;
    var gl = await client(port); gl.send({ t: 'join', code: r.code, name: 'سارة', girlKey: girlKey });
    var wg = await gl.wait(function (x) { return x.t === 'welcome'; });
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' });
    await g.wait(function (x) { return x.t === 'welcome'; });
    var all = await g.wait(function (x) { return x.t === 'all'; });
    assert.equal(flatHas(all.d, wg.n), false, 'not in all');
    var st = (await gl.wait(function (x) { return x.t === 'all'; })).d, me = null;
    for (var i = 0; i + 4 < st.length; i += 5) if (st[i] === wg.n) me = [st[i + 1] / 100, st[i + 2] / 100];
    for (var k = 1; k <= 6; k++) { gl.send({ t: 'mv', p: [me[0] + k * .3, me[1], 0, 1] }); await sleep(150); }
    await sleep(300);
    assert.equal(g.msgs.some(function (x) { return x.t === 's' && flatHas(x.d, wg.n); }), false, 'not in deltas');
    r.h.close(); gl.close(); g.close(); srv.close();
});

// ================= الدفعة 3 =================
async function toPhase(r, target) {
    for (var k = 0; k < 12; k++) {
        var p = party._mgr.phaseOf(r.code).p; if (p === target) return;
        if (p === 'lobby') party._mgr.start(r.code); else party._mgr.skip(r.code, p);
    }
}

test('guest wish appears in host wishList, girl next broadcasts wishes cur to all', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var girlKey = (await r.h.wait(function (x) { return x.t === 'hosted'; })).girlKey;
    var gl = await client(port); gl.send({ t: 'join', code: r.code, name: 'سارة', girlKey: girlKey }); await gl.wait(function (x) { return x.t === 'welcome'; });
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); await g.wait(function (x) { return x.t === 'welcome'; });
    await toPhase(r, 'wishWrite');
    await sleep(1100);
    g.send({ t: 'wish', text: 'كل عام وانتي بخير' });
    await g.wait(function (x) { return x.t === 'myWish' && x.text === 'كل عام وانتي بخير'; });
    var wl = await r.h.wait(function (x) { return x.t === 'wishList' && x.items.length === 1; });
    assert.equal(wl.items[0].name, 'ريم');
    await toPhase(r, 'wishes'); // الكتابة تنقفل ← العرض
    await sleep(1100);
    gl.send({ t: 'next' });
    var ws = await g.wait(function (x) { return x.t === 'wishes' && x.cur; });
    assert.equal(ws.cur.text, 'كل عام وانتي بخير'); assert.equal(ws.total, 1);
    await r.h.wait(function (x) { return x.t === 'wishes' && x.cur; });
    r.h.close(); gl.close(); g.close(); srv.close();
});

test('phase message after cut carries cut=true (phones play the cake cut)', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); await g.wait(function (x) { return x.t === 'welcome'; });
    await toPhase(r, 'cake'); await sleep(1100);
    r.h.send({ t: 'cut' });
    var ph = await g.wait(function (x) { return x.t === 'phase' && x.p === 'celebrate'; });
    assert.equal(ph.cut, true);
    var late = await client(port); late.send({ t: 'peek', code: r.code });
    assert.equal((await late.wait(function (x) { return x.t === 'phase'; })).cut, true, 'late viewer sees the cake cut');
    r.h.close(); g.close(); late.close(); srv.close();
});

test('points: only one host device may claim; others get pointsOk after pointsDone', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var hosted = await r.h.wait(function (x) { return x.t === 'hosted'; });
    var h2 = await client(port); h2.send({ t: 'host', code: r.code, token: hosted.token }); await h2.wait(function (x) { return x.t === 'phase'; });
    await toPhase(r, 'celebrate'); await sleep(1100);
    r.h.send({ t: 'skip', from: 'celebrate' });
    var p1 = await r.h.wait(function (x) { return x.t === 'points'; }), p2 = await h2.wait(function (x) { return x.t === 'points'; });
    assert.ok(p1.id && p1.id === p2.id, 'stable id');
    await sleep(1100);
    r.h.send({ t: 'pointsClaim' }); await r.h.wait(function (x) { return x.t === 'pointsGo'; });
    h2.send({ t: 'pointsClaim' }); assert.equal((await h2.wait(function (x) { return x.t === 'err' && x.of === 'pointsClaim'; })).err, 'claimed');
    await sleep(1100); r.h.send({ t: 'pointsDone' });
    await h2.wait(function (x) { return x.t === 'pointsOk'; });
    await sleep(1100); h2.send({ t: 'pointsClaim' });
    await h2.wait(function (x) { return x.t === 'err' && x.of === 'pointsClaim' && x.err === 'done'; });
    r.h.close(); h2.close(); srv.close();
});

test('claim is released when the claiming host disconnects', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var hosted = await r.h.wait(function (x) { return x.t === 'hosted'; });
    await toPhase(r, 'celebrate'); await sleep(1100);
    r.h.send({ t: 'skip', from: 'celebrate' }); await r.h.wait(function (x) { return x.t === 'points'; });
    await sleep(1100); r.h.send({ t: 'pointsClaim' }); await r.h.wait(function (x) { return x.t === 'pointsGo'; });
    r.h.close(); await sleep(200);
    var h2 = await client(port); h2.send({ t: 'host', code: r.code, token: hosted.token }); await h2.wait(function (x) { return x.t === 'points'; });
    await sleep(1100); h2.send({ t: 'pointsClaim' }); await h2.wait(function (x) { return x.t === 'pointsGo'; });
    h2.close(); srv.close();
});

test('guest cannot next/cut/hideWish', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); await g.wait(function (x) { return x.t === 'welcome'; });
    await toPhase(r, 'wishWrite'); await sleep(1100);
    g.send({ t: 'next' });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'next'; })).err, 'role');
    await sleep(1100); g.send({ t: 'hideWish', id: 1, hidden: true });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'hideWish'; })).err, 'host-only');
    await toPhase(r, 'cake'); await sleep(1100); g.send({ t: 'cut' });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'cut'; })).err, 'role');
    assert.equal(party._mgr.phaseOf(r.code).p, 'cake');
    r.h.close(); g.close(); srv.close();
});

test('host receives points on photo, again after reconnect until pointsDone', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var hosted = await r.h.wait(function (x) { return x.t === 'hosted'; });
    await toPhase(r, 'celebrate'); await sleep(1100);
    r.h.send({ t: 'skip', from: 'celebrate' });
    var pts = await r.h.wait(function (x) { return x.t === 'points'; });
    assert.ok(Array.isArray(pts.players)); assert.equal(typeof pts.durationMs, 'number');
    r.h.close(); await sleep(150);
    var h2 = await client(port); h2.send({ t: 'host', code: r.code, token: hosted.token });
    await h2.wait(function (x) { return x.t === 'points'; });
    await sleep(1100); h2.send({ t: 'pointsDone' }); await sleep(200);
    h2.close(); await sleep(150);
    var h3 = await client(port); h3.send({ t: 'host', code: r.code, token: hosted.token });
    await h3.wait(function (x) { return x.t === 'phase'; }); await sleep(300);
    assert.equal(h3.msgs.some(function (x) { return x.t === 'points'; }), false, 'not resent after pointsDone');
    h3.close(); srv.close();
});

// ---------- الدفعة 4 ----------
test('look message updates roster for everyone (coalesced)', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var a = await client(port); a.send({ t: 'join', code: r.code, name: 'ريم' }); var wa = await a.wait(function (x) { return x.t === 'welcome'; });
    var b = await client(port); b.send({ t: 'join', code: r.code, name: 'هيا' }); await b.wait(function (x) { return x.t === 'welcome'; });
    await sleep(1100);
    a.send({ t: 'look', look: [1, 5, 2, 3, 1, 2, 1] });
    var rm = await b.wait(function (x) { return x.t === 'room' && x.room.players.some(function (p) { return p[0] === wa.n && p[5][1] === 5; }); }, 2500);
    assert.deepEqual(rm.room.players.find(function (p) { return p[0] === wa.n; })[5], [-1, 5, -1, -1, -1, -1, -1, -1], 'quick guest: outfit (and hat) only');
    r.h.close(); a.close(); b.close(); srv.close();
});

test('kick: host-only, kicked socket gets err kicked and is closed', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var a = await client(port); a.send({ t: 'join', code: r.code, name: 'ريم', dev: 'devkicked01' }); var wa = await a.wait(function (x) { return x.t === 'welcome'; });
    var b = await client(port); b.send({ t: 'join', code: r.code, name: 'هيا' }); await b.wait(function (x) { return x.t === 'welcome'; });
    await sleep(1100);
    b.send({ t: 'kick', n: wa.n });
    assert.equal((await b.wait(function (x) { return x.t === 'err' && x.of === 'kick'; })).err, 'host-only');
    var closed = new Promise(function (res) { a.ws.onclose = res; });
    r.h.send({ t: 'kick', n: wa.n });
    assert.equal((await a.wait(function (x) { return x.t === 'err' && x.err === 'kicked'; })).err, 'kicked');
    await closed;
    await r.h.wait(function (x) { return x.t === 'room' && !x.room.players.some(function (p) { return p[0] === wa.n; }); }, 2500);
    // نفس الجهاز يحاول يرجع باسم ثاني ← مرفوض
    var a2 = await client(port); a2.send({ t: 'join', code: r.code, name: 'اسم ثاني', dev: 'devkicked01' });
    assert.equal((await a2.wait(function (x) { return x.t === 'err' && x.of === 'join'; })).err, 'kicked');
    r.h.close(); b.close(); a2.close(); srv.close();
});

test('hosted carries viewKey; peek with wrong vk hides the girl in lobby', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var hosted = await r.h.wait(function (x) { return x.t === 'hosted'; });
    assert.ok(hosted.viewKey);
    var gl = await client(port); gl.send({ t: 'join', code: r.code, name: 'سارة', girlKey: hosted.girlKey }); var wg = await gl.wait(function (x) { return x.t === 'welcome'; });
    var has = function (m) { for (var i = 0; i < m.d.length; i += 5) if (m.d[i] === wg.n) return true; return false; }; // صفوف مسطّحة n,x,z,ry,a
    var bad = await client(port); bad.send({ t: 'peek', code: r.code, vk: 'nope' });
    assert.equal(has(await bad.wait(function (x) { return x.t === 'all'; })), false);
    var ok = await client(port); ok.send({ t: 'peek', code: r.code, vk: hosted.viewKey });
    assert.equal(has(await ok.wait(function (x) { return x.t === 'all'; })), true);
    var h2 = await client(port); h2.send({ t: 'host', code: r.code, token: hosted.token });
    assert.equal((await h2.wait(function (x) { return x.t === 'hosted'; })).viewKey, hosted.viewKey, 'resent on host resume');
    r.h.close(); gl.close(); bad.close(); ok.close(); h2.close(); srv.close();
});

// ---- الحفظ: الغرف تنحفظ في المخزن، وboot يرجّعها بعد إعادة التشغيل ----
test('rooms are saved to the store (batched) and boot restores saved rooms', async function () {
    reset(); party._setEnabled(true);
    var Database = require('better-sqlite3'), st = require('./party-store').createStore(new Database(':memory:'));
    party._setStore(st);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); var wg = await g.wait(function (x) { return x.t === 'welcome'; });
    await sleep(2600);
    var saved = st.loadAll().find(function (o) { return o.code === r.code; });
    assert.ok(saved, 'room saved'); assert.ok(saved.players.some(function (p) { return p.id === wg.id; }), 'player saved');
    r.h.close(); g.close(); await sleep(200);
    // «إعادة تشغيل»: الغرفة تنشال من الذاكرة، والمخزن يرجّعها
    party._mgr.closeRoom(r.code);
    party.boot();
    assert.ok(party._mgr.getRoom(r.code), 'restored on boot');
    var g2 = await client(port); g2.send({ t: 'resume', code: r.code, id: wg.id, key: wg.key });
    assert.equal((await g2.wait(function (x) { return x.t === 'welcome'; })).n, wg.n);
    g2.close(); srv.close(); party._setStore(null);
});

// ---- الحفلة المجدولة: البروتوكول ----
test('host create requires a valid schedule; hosted + phase carry sched', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var a = await client(port); a.send({ t: 'host', girlName: 'سارة', key: 'test-key' });
    assert.equal((await a.wait(function (x) { return x.t === 'err' && x.of === 'host'; })).err, 'schedule');
    await sleep(1100); a.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: { startAt: Date.now() - 3600000 } });
    assert.equal((await a.wait(function (x) { return x.t === 'err' && x.of === 'host'; })).err, 'schedule');
    var start = Date.now() + 3600000;
    await sleep(1100); a.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: { startAt: start, tzOffsetMin: 180 } });
    await a.wait(function (x) { return x.t === 'hosted'; });
    var ph = await a.wait(function (x) { return x.t === 'phase'; });
    assert.equal(ph.p, 'closed');
    assert.deepEqual([ph.sched.openAt, ph.sched.startAt, ph.sched.endAt, ph.sched.tzOffsetMin, ph.sched.danceMin], [start - 15 * 60000, start, start + 60 * 60000, 180, 7]);
    assert.equal(ph.waitGirl, false);
    a.close(); srv.close();
});

test('guest join while closed gets closed {openAt}; gets phase lobby when it opens', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, start = Date.now() + 3600000;
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: { startAt: start, tzOffsetMin: 180 } });
    var code = (await h.wait(function (x) { return x.t === 'hosted'; })).code;
    var g = await client(port); g.send({ t: 'join', code: code, name: 'ريم' });
    var cl = await g.wait(function (x) { return x.t === 'closed'; });
    assert.equal(cl.openAt, start - 15 * 60000); assert.equal(cl.tzOffsetMin, 180); assert.equal(cl.girlName, 'سارة');
    assert.equal(party._mgr.roster(code).players.length, 0);
    await sleep(1100);
    h.send({ t: 'schedule', schedule: { openBeforeMin: 120 } }); // يفتح الدخول الحين
    var ph = await g.wait(function (x) { return x.t === 'phase' && x.p === 'lobby'; });
    assert.equal(ph.p, 'lobby');
    await sleep(1100); g.send({ t: 'join', code: code, name: 'ريم' });
    assert.ok(await g.wait(function (x) { return x.t === 'welcome'; }));
    h.close(); g.close(); srv.close();
});

test('girl can join while closed; untrusted peek still hides her', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port;
    var h = await client(port); h.send({ t: 'host', girlName: 'سارة', key: 'test-key', schedule: { startAt: Date.now() + 3600000 } });
    var hosted = await h.wait(function (x) { return x.t === 'hosted'; });
    var gl = await client(port); gl.send({ t: 'join', code: hosted.code, name: 'سارة', girlKey: hosted.girlKey });
    var wg = await gl.wait(function (x) { return x.t === 'welcome'; });
    assert.equal(wg.role, 'girl');
    var v = await client(port); v.send({ t: 'peek', code: hosted.code });
    var all = await v.wait(function (x) { return x.t === 'all'; });
    assert.equal(all.d.length, 0);
    var hv = await client(port); hv.send({ t: 'peek', code: hosted.code, vk: hosted.viewKey });
    assert.equal((await hv.wait(function (x) { return x.t === 'all'; })).d[0], wg.n, 'trusted screen sees her');
    h.close(); gl.close(); v.close(); hv.close(); srv.close();
});

test('schedule edit by host broadcasts the new phase/until; by a guest is refused', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); await g.wait(function (x) { return x.t === 'welcome'; });
    await toPhase(r, 'dance');
    var before = party._mgr.phaseOf(r.code);
    await sleep(1100); r.h.send({ t: 'schedule', schedule: { danceMin: 20 } });
    var ph = await g.wait(function (x) { return x.t === 'phase' && x.p === 'dance' && x.until === before.at + 20 * 60000; });
    assert.ok(ph);
    await sleep(1100); g.send({ t: 'schedule', schedule: { danceMin: 1 } });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'schedule'; })).err, 'host-only');
    await sleep(1100); r.h.send({ t: 'schedule', schedule: 'x' });
    assert.equal((await r.h.wait(function (x) { return x.t === 'err' && x.of === 'schedule'; })).err, 'schedule');
    r.h.close(); g.close(); srv.close();
});

test('prev from the girl moves back one wish and broadcasts wishes', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var girlKey = party._mgr.getRoom(r.code).girlKey;
    var gl = await client(port); gl.send({ t: 'join', code: r.code, name: 'سارة', girlKey: girlKey }); await gl.wait(function (x) { return x.t === 'welcome'; });
    var a = await client(port); a.send({ t: 'join', code: r.code, name: 'أ' }); await a.wait(function (x) { return x.t === 'welcome'; });
    var b = await client(port); b.send({ t: 'join', code: r.code, name: 'ب' }); await b.wait(function (x) { return x.t === 'welcome'; });
    await toPhase(r, 'wishWrite'); await sleep(1100);
    a.send({ t: 'wish', text: 'واحد' }); b.send({ t: 'wish', text: 'اثنين' });
    await a.wait(function (x) { return x.t === 'myWish'; }); await b.wait(function (x) { return x.t === 'myWish'; });
    await toPhase(r, 'wishes'); await sleep(1100);
    gl.send({ t: 'next', seen: 0 }); await a.wait(function (x) { return x.t === 'wishes' && x.pos === 1; });
    await sleep(1100); gl.send({ t: 'next', seen: 1 }); await a.wait(function (x) { return x.t === 'wishes' && x.pos === 2; });
    await sleep(1100); gl.send({ t: 'prev', seen: 2 });
    var w = await a.wait(function (x) { return x.t === 'wishes' && x.pos === 1; });
    assert.equal(w.cur.text, 'واحد');
    await sleep(1100); gl.send({ t: 'prev', seen: 1 });
    assert.equal((await gl.wait(function (x) { return x.t === 'err' && x.of === 'prev'; })).err, 'first');
    r.h.close(); gl.close(); a.close(); b.close(); srv.close();
});

// ---- إصلاحات المراجعة النهائية ----
test('host reconnecting after the party ended still gets the pending points', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var room = party._mgr.getRoom(r.code);
    room.photoDone = true; room.pointsMsg = { t: 'points', id: r.code + ':1', players: [{ id: 'tiktok:nora', name: 'نورة' }], durationMs: 1000 };
    room.phase = 'ended';
    r.h.close(); await sleep(300);
    var h2 = await client(port); h2.send({ t: 'host', code: r.code, token: room.token });
    var pm = await h2.wait(function (x) { return x.t === 'points'; });
    assert.equal(pm.players[0].id, 'tiktok:nora');
    h2.close(); srv.close();
});

test('boot restores the good rooms even when one saved row is broken', async function () {
    reset(); party._setEnabled(true);
    var Database = require('better-sqlite3'), st = require('./party-store').createStore(new Database(':memory:'));
    var good = party._mgr.createRoom({ girlName: 'سارة', schedule: SCHED() });
    st.save('9999', { code: '9999', phase: 'lobby', players: [null], sched: SCHED() });
    st.save(good.code, party._mgr.serialize(good.code));
    party._mgr.closeRoom(good.code);
    party._setStore(st); party.boot();
    assert.ok(party._mgr.getRoom(good.code), 'good room restored');
    assert.equal(party._mgr.getRoom('9999'), null);
    party._setStore(null);
});

test('flushAll writes pending changes right away (SIGTERM on deploy)', async function () {
    reset(); party._setEnabled(true);
    var Database = require('better-sqlite3'), st = require('./party-store').createStore(new Database(':memory:'));
    party._setStore(st);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); var wg = await g.wait(function (x) { return x.t === 'welcome'; });
    party._flushAll();
    var saved = st.loadAll().find(function (o) { return o.code === r.code; });
    assert.ok(saved && saved.players.some(function (p) { return p.id === wg.id; }), 'just-joined player saved');
    r.h.close(); g.close(); srv.close(); party._setStore(null);
});

// ---- التفاعلات ومطر القلوب وإعداد الشخصيات ----
test('react reaches other players within 300ms', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var a = await client(port); a.send({ t: 'join', code: r.code, name: 'ريم' }); var wa = await a.wait(function (x) { return x.t === 'welcome'; });
    var b = await client(port); b.send({ t: 'join', code: r.code, name: 'هيا' }); await b.wait(function (x) { return x.t === 'welcome'; });
    a.send({ t: 'react', e: 'laugh' });
    var m = await b.wait(function (x) { return x.t === 'reacts'; }, 600);
    assert.deepEqual(m.d, [wa.n, 2]);
    a.send({ t: 'react', e: 'crown' }); await sleep(400);
    assert.equal(b.msgs.filter(function (x) { return x.t === 'reacts'; }).length, 1, 'guest cannot send the girl\'s reactions');
    r.h.close(); a.close(); b.close(); srv.close();
});

test('heart rain from the girl reaches everyone; guests refused', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var girlKey = party._mgr.getRoom(r.code).girlKey;
    var gl = await client(port); gl.send({ t: 'join', code: r.code, name: 'سارة', girlKey: girlKey }); await gl.wait(function (x) { return x.t === 'welcome'; });
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); await g.wait(function (x) { return x.t === 'welcome'; });
    await sleep(1100); g.send({ t: 'rain' });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'rain'; })).err, 'role');
    gl.send({ t: 'rain' });
    var m = await g.wait(function (x) { return x.t === 'rain'; });
    assert.ok(m.at > 0);
    r.h.close(); gl.close(); g.close(); srv.close();
});

test('chars message from host broadcasts room with new chars; guest refused', async function () {
    reset(); party._setEnabled(true);
    var srv = await startServer(), port = srv.address().port, r = await hostRoom(port);
    var g = await client(port); g.send({ t: 'join', code: r.code, name: 'ريم' }); var rm = await g.wait(function (x) { return x.t === 'room'; });
    assert.equal(rm.room.chars, 'rig');
    await sleep(1100); g.send({ t: 'chars', v: 'classic' });
    assert.equal((await g.wait(function (x) { return x.t === 'err' && x.of === 'chars'; })).err, 'host-only');
    await sleep(1100); r.h.send({ t: 'chars', v: 'classic' });
    var m = await g.wait(function (x) { return x.t === 'room' && x.room.chars === 'classic'; }, 2500);
    assert.ok(m);
    r.h.close(); g.close(); srv.close();
});
