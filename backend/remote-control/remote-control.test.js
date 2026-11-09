'use strict';

// اختبارات «التحكم عن بعد»: الصلاحيات (قاعدة بالذاكرة بنفس جداول database.js)
// وخادم /ws/remote (سيرفر HTTP صغير يمرّر الترقية مباشرة، بنفس أسلوب party-server.test.js).

var test = require('node:test');
var assert = require('node:assert/strict');
var http = require('http');
var net = require('net');
var crypto = require('crypto');
var Database = require('better-sqlite3');

var svc = require('./remote-control-service');
var server = require('./remote-control-server');

function makeDb() {
    var d = new Database(':memory:');
    d.exec(
        'CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, custom_id TEXT, tiktok_username TEXT, tiktok_verified INTEGER, tiktok_display_name TEXT, tiktok_avatar_url TEXT);' +
        'CREATE TABLE remote_control_settings (streamer_id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);' +
        'CREATE TABLE remote_controllers (streamer_id INTEGER NOT NULL, tiktok_username TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, PRIMARY KEY (streamer_id, tiktok_username));'
    );
    d.prepare('INSERT INTO users VALUES (1, ?, ?, ?, 1, ?, NULL)').run('ayman', 'A1', 'ayman_live', 'أيمن');
    d.prepare('INSERT INTO users VALUES (2, ?, ?, ?, 1, ?, NULL)').run('sara', 'S2', 'sara.tt', 'سارة');
    d.prepare('INSERT INTO users VALUES (3, ?, ?, ?, 1, ?, NULL)').run('omar', 'O3', 'omar_1', 'عمر');
    return d;
}
var STREAMER = { id: 1, tiktok_username: 'ayman_live', tiktok_verified: true, role: 'user', is_streamer: true, permissions: {} };
var SARA = { id: 2, tiktok_username: 'sara.tt', tiktok_verified: true, role: 'user', permissions: {} };
var OMAR = { id: 3, tiktok_username: 'omar_1', tiktok_verified: true, role: 'user', permissions: {} };

test('service: add / limit / self / exists, and access needs master + own switch', function () {
    svc._setDb(makeDb());
    assert.equal(svc.addController(STREAMER, '@Sara.TT').success, true);
    assert.equal(svc.addController(STREAMER, 'sara.tt').error, 'exists');
    assert.equal(svc.addController(STREAMER, 'ayman_live').error, 'self');
    assert.equal(svc.addController(STREAMER, 'bad name!').error, 'invalid');
    ['omar_1', 'u3', 'u4', 'u5'].forEach(function (u) { assert.equal(svc.addController(STREAMER, u).success, true); });
    assert.equal(svc.addController(STREAMER, 'u6').error, 'limit');

    // المفتاح العام مطفي → ما أحد يتحكم
    assert.equal(svc.canControl(SARA, 1), false);
    assert.deepEqual(svc.accessFor(SARA), []);
    svc.setEnabled(1, true);
    assert.equal(svc.canControl(SARA, 1), true);
    assert.equal(svc.accessFor(SARA)[0].name, 'أيمن');
    assert.equal(svc.getConfig(1).controllers[0].account.name, 'سارة');

    // إيقاف شخص واحد بس
    svc.setControllerEnabled(1, 'sara.tt', false);
    assert.equal(svc.canControl(SARA, 1), false);
    assert.equal(svc.canControl(OMAR, 1), true);
    assert.deepEqual(svc.activeUsernames(1).indexOf('sara.tt'), -1);

    // الستريمر ما يتحكم بنفسه، وحساب بدون توثيق تيك توك ما يتحكم
    assert.equal(svc.canControl(STREAMER, 1), false);
    assert.equal(svc.canControl({ id: 9, tiktok_username: 'omar_1', tiktok_verified: false }, 1), false);

    svc.removeController(1, 'omar_1');
    assert.equal(svc.canControl(OMAR, 1), false);
    svc.setEnabled(1, false);
    assert.deepEqual(svc.activeUsernames(1), []);
});

// ---------- عميل WebSocket بسيط ----------

function startServer() {
    return new Promise(function (resolve) {
        var srv = http.createServer();
        srv.on('upgrade', function (req, socket) { server.handleUpgrade(req, socket); });
        srv.listen(0, '127.0.0.1', function () { resolve(srv); });
    });
}
function encode(obj) {
    var p = Buffer.from(JSON.stringify(obj)), mask = crypto.randomBytes(4), head;
    if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
    else { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(p.length, 2); }
    var out = Buffer.alloc(p.length);
    for (var i = 0; i < p.length; i++) out[i] = p[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, out]);
}
function client(port) {
    return new Promise(function (resolve) {
        var s = net.connect(port, '127.0.0.1');
        var c = { msgs: [], waiters: [], closed: false, buf: Buffer.alloc(0), handshook: false };
        c.send = function (o) { s.write(encode(o)); };
        c.next = function (t) {
            return new Promise(function (res, rej) {
                var idx = c.msgs.findIndex(function (m) { return m.t === t; });
                if (idx >= 0) { res(c.msgs.splice(idx, 1)[0]); return; }
                var w = { t: t, res: res };
                c.waiters.push(w);
                setTimeout(function () { rej(new Error('timeout waiting for ' + t + ' got ' + JSON.stringify(c.msgs))); }, 1500);
            });
        };
        c.close = function () { s.destroy(); };
        s.on('close', function () { c.closed = true; });
        s.on('data', function (d) {
            c.buf = Buffer.concat([c.buf, d]);
            if (!c.handshook) {
                var e = c.buf.indexOf('\r\n\r\n');
                if (e < 0) return;
                c.buf = c.buf.slice(e + 4); c.handshook = true; resolve(c);
            }
            while (c.buf.length >= 2) {
                var len = c.buf[1] & 0x7f, off = 2;
                if (len === 126) { len = c.buf.readUInt16BE(2); off = 4; }
                if (c.buf.length < off + len) break;
                var op = c.buf[0] & 0x0f, body = c.buf.slice(off, off + len);
                c.buf = c.buf.slice(off + len);
                if (op !== 1) continue;
                var m = JSON.parse(body.toString('utf8'));
                var wi = c.waiters.findIndex(function (w) { return w.t === m.t; });
                if (wi >= 0) c.waiters.splice(wi, 1)[0].res(m); else c.msgs.push(m);
            }
        });
        s.write('GET /ws/remote HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

test('server: controller ↔ host relay, permission checks and instant revoke', async function () {
    svc._setDb(makeDb());
    svc.setEnabled(1, true);
    svc.addController(STREAMER, 'sara.tt');
    var users = { s: STREAMER, a: SARA, o: OMAR };
    server._setDeps(svc, { validateSession: function (t) { return users[t] || null; } });
    server._setTimings({ pendingMs: 600 });
    var srv = await startServer(), port = srv.address().port;

    // بدون حساب → login
    var anon = await client(port);
    anon.send({ t: 'ctl', auth: 'zzz', s: 1 });
    assert.equal((await anon.next('err')).err, 'login');

    // عمر ما عنده صلاحية
    var omar = await client(port);
    omar.send({ t: 'ctl', auth: 'o', s: 1 });
    assert.equal((await omar.next('err')).err, 'no_access');

    // سارة تدخل والستريمر مو فاتح شي → online:false، وأمرها ينتظر صفحة الستريمر
    var sara = await client(port);
    sara.send({ t: 'ctl', auth: 'a', s: 1 });
    var w = await sara.next('welcome');
    assert.equal(w.online, false);
    assert.equal(w.streamer.name, 'أيمن');
    sara.send({ t: 'open', id: 1, game: 'elimination-roulette' });

    var host = await client(port);
    host.send({ t: 'host', auth: 's' });
    assert.deepEqual((await host.next('hosted')).controllers, ['sara.tt']);
    assert.equal((await sara.next('online')).on, true);
    var open = await host.next('open');
    assert.equal(open.game, 'elimination-roulette');
    assert.equal(open.from, 'sara.tt');

    // وصف الشاشة يوصل للجوال، والأمر يوصل للصفحة، والرد يرجع للجوال
    host.send({ t: 'state', s: { page: 'الإعدادات' } });
    assert.equal((await sara.next('state')).s.page, 'الإعدادات');
    sara.send({ t: 'cmd', id: 7, cmd: 'الحد', arg: '30' });
    var cmd = await host.next('cmd');
    assert.equal(cmd.cmd, 'الحد');
    host.send({ t: 'res', c: cmd.c, id: cmd.id, ok: true, msg: 'الحد: 30' });
    var res = await sara.next('res');
    assert.equal(res.id, 7);
    assert.equal(res.msg, 'الحد: 30');

    // صفحة الستريمر تنقفل → online:false، وأمر بدون صفحة يفشل بعد المهلة
    host.close();
    assert.equal((await sara.next('online')).on, false);
    sara.send({ t: 'cmd', id: 8, cmd: 'لف', arg: '' });
    await wait(5600);
    var late = await sara.next('res');
    assert.equal(late.ok, false);

    // جوال جديد يستلم آخر وصف شاشة مباشرة
    var host2 = await client(port);
    host2.send({ t: 'host', auth: 's' });
    await host2.next('hosted');

    // الستريمر يوقف سارة → تنقفل فوراً، والصفحة تستلم القائمة الجديدة
    svc.setControllerEnabled(1, 'sara.tt', false);
    assert.equal((await sara.next('err')).err, 'revoked');
    assert.deepEqual((await host2.next('controllers')).list, []);
    await wait(50);
    assert.equal(sara.closed, true);

    host2.close(); anon.close(); omar.close();
    srv.close();
});
