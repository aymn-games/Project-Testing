/**
 * «محطة سهيل» — خادم الرومات والمباريات (WebSocket على '/ws/station').
 *
 * يحل محل BroadcastChannel + localStorage بالنموذج: المذيع (PC) ينشئ روم
 * برقم من 4 أرقام، والجوالات تدخل بالرقم (QR)، والخادم يملك حالة الروم
 * والمباراة (station-game.js) ويرسل لكل لاعب نسخته المفلترة.
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   عميل → host {code?,token?,auth}      إنشاء روم جديد أو رجوع المذيع لرومه
 *                                        (auth = توكن حساب الموقع — مرحلة الاختبار: أدمن فقط)
 *   عميل → peek {code}                   شاشة الدخول: معلومات الروم + تحديثات حية
 *   عميل → join {code,name,c,skin}       دخول لاعب جديد ← welcome {id,key}
 *   عميل → resume {code,id,key}          رجوع لاعب (تحديث الصفحة/انقطاع)
 *   عميل → leave · skin {skin} · color {c} (لاعب باللوبي) · ping {k}
 *   المذيع → settings {settings} · kick {id} (باللوبي أو وسط الجولة) · endStage (ينهي النقاش/التصويت)
 *            · start · again · lobby · close
 *   المباراة → pos {x,y,f,v} · act {a,arg}
 *   الصوت → rtc {to,data}  (تمرير إشارات WebRTC بين اللاعبين فقط)
 *   خادم → welcome · room {room} · state {G,now} · fx {k} · err {err}
 *          kicked · lobby · closed · gone · rtc {from,data} · pong {k,now}
 */
'use strict';

var crypto = require('crypto');
var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');
var Settings = require('./station-settings');
var Game = require('./station-game');

var COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#f4f2f8', '#64748b', '#84cc16', '#06b6d4', '#b45309', '#f43f5e', '#6366f1', '#10b981', '#facc15', '#c084fc', '#0ea5e9', '#78350f'];
var SKIN_KEYS = ['hat', 'acc', 'top', 'pants', 'back'];
var HOST_GRACE_MS = 30 * 60 * 1000;  // روم بدون مذيع متصل أكثر من كذا ← ينقفل
var TICK_MS = 50, PLAY_SEND_MS = 100, IDLE_SEND_MS = 1000;
var MAX_MSG = 16 * 1024;
// ADMIN_ONLY = true يقصر إنشاء الروم (شاشة المذيع) على حساب الأدمن (استُخدم بمرحلة الاختبار،
// مع adminOnly ببطاقة games.html). اللعبة الآن مفتوحة للكل كنسخة تجريبية. الجوالات تدخل دائماً بدون حساب.
var ADMIN_ONLY = false;
var _isAdmin = function (token) {
    var u = require('../auth/auth-service').validateSession(String(token || ''));
    return !!(u && u.role === 'admin');
};

var _rooms = {};   // code -> room
var _clients = {}; // connectionId -> client

function rid(n) { return crypto.randomBytes(n || 12).toString('hex'); }

function cleanSkin(s) {
    var o = {}; SKIN_KEYS.forEach(function (k) { var v = s && s[k]; o[k] = typeof v === 'string' && /^[a-z0-9_-]{1,24}$/i.test(v) ? v : 'none'; }); return o;
}
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); }

function hostColor(room) { var used = room.players.map(function (p) { return p.c; }); return COLORS.find(function (x) { return used.indexOf(x) < 0; }) || '#f4f2f8'; }

function publicRoom(room) {
    return {
        code: room.code, started: room.started, max: room.settings.maxPlayers, settings: room.settings,
        hostC: hostColor(room), hostSkin: room.hostSkin, hostOnline: !!room.hostConn,
        players: room.players.map(function (p) { return Object.assign({ id: p.id, name: p.name, c: p.c, online: isOnline(room, p.id) }, p.skin); })
    };
}

function send(client, obj) {
    if (!client || client.closed) return;
    try { client.socket.write(frame.encodeTextFrame(JSON.stringify(obj))); } catch (err) { logger.error('Station: write failed:', err); }
}
function roomClients(room) { return Object.keys(_clients).map(function (k) { return _clients[k]; }).filter(function (c) { return c.code === room.code; }); }
function isOnline(room, id) { return roomClients(room).some(function (c) { return c.id === id && !c.closed; }); }
function broadcastRoom(room) { var msg = { t: 'room', room: publicRoom(room) }; roomClients(room).forEach(function (c) { send(c, msg); }); }
function sendToIds(room, ids, obj) { roomClients(room).forEach(function (c) { if (c.id && (!ids || ids.indexOf(c.id) >= 0)) send(c, obj); }); }

function sendStates(room) {
    if (!room.game) return;
    var now = Date.now(), cache = {};
    roomClients(room).forEach(function (c) {
        if (!c.id) return;
        var v = cache[c.id] || (cache[c.id] = JSON.stringify({ t: 'state', G: room.game.view(c.id), now: now }));
        if (c.closed) return;
        try { c.socket.write(frame.encodeTextFrame(v)); } catch (e) { }
    });
    room.lastSend = now; room.dirty = false;
}

function createRoom(client) {
    var code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (_rooms[code]);
    var room = { code: code, token: rid(16), settings: Settings.validate({}), players: [], hostSkin: cleanSkin(null), started: false, game: null, hostConn: null, hostGoneAt: 0, dirty: false, lastSend: 0 };
    _rooms[code] = room;
    logger.log('Station: room ' + code + ' created');
    return room;
}

function closeRoom(room, reason) {
    roomClients(room).forEach(function (c) { if (c.role !== 'host') send(c, { t: 'closed', reason: reason || '' }); c.code = null; c.id = null; });
    delete _rooms[room.code];
    logger.log('Station: room ' + room.code + ' closed (' + (reason || '') + ')');
}

function roster(room) {
    var list = [Object.assign({ id: 'host', name: 'المذيع', c: hostColor(room) }, room.hostSkin)];
    room.players.forEach(function (p) { list.push(Object.assign({ id: p.id, name: p.name, c: p.c }, p.skin)); });
    return list;
}

function startGame(room) {
    var old = room.game && room.game.G;
    room.game = Game.createGame(roster(room), room.settings, {
        onChange: function () { room.dirty = true; },
        onSfx: function (k, ids) { sendToIds(room, ids, { t: 'fx', k: k }); }
    }, old);
    room.started = true; room.dirty = true;
    broadcastRoom(room); sendStates(room);
}

function toLobby(room) {
    room.game = null; room.started = false;
    roomClients(room).forEach(function (c) { if (c.role === 'player') send(c, { t: 'lobby' }); });
    broadcastRoom(room);
}

function attach(client, room, role, id) {
    client.code = room.code; client.role = role; client.id = id;
    if (role === 'host') { if (room.hostConn && room.hostConn !== client) send(room.hostConn, { t: 'gone', reason: 'host-elsewhere' }); room.hostConn = client; room.hostGoneAt = 0; }
}

function onMessage(client, msg) {
    var t = msg && msg.t, room = client.code ? _rooms[client.code] : null;

    if (t === 'ping') return send(client, { t: 'pong', k: msg.k, now: Date.now() });

    if (t === 'host') {
        var allowed = false; try { allowed = !ADMIN_ONLY || _isAdmin(msg.auth); } catch (err) { logger.error('Station: auth check failed:', err); }
        if (!allowed) return send(client, { t: 'err', code: 'admin_only', err: 'اللعبة بمرحلة اختبار ومتاحة للأدمن فقط' });
        var r = msg.code && _rooms[msg.code];
        if (!(r && msg.token && r.token === msg.token)) r = createRoom(client);
        attach(client, r, 'host', 'host');
        send(client, { t: 'welcome', role: 'host', id: 'host', code: r.code, token: r.token });
        broadcastRoom(r); if (r.game) sendStates(r);
        return;
    }
    if (t === 'peek') {
        var pr = _rooms[String(msg.code || '')];
        if (!pr) return send(client, { t: 'peek', ok: false, err: 'ما لقينا روم بهالرقم' });
        client.code = pr.code; client.role = 'peek'; client.id = null;
        return send(client, { t: 'peek', ok: true, room: publicRoom(pr) });
    }
    if (t === 'join') {
        var jr = _rooms[String(msg.code || '')]; if (!jr) return send(client, { t: 'err', err: 'الروم انقفل', step: 'code' });
        var name = cleanName(msg.name), c = String(msg.c || '');
        if (!name) return send(client, { t: 'err', err: 'اكتب اسمك' });
        if (jr.players.length + 1 >= jr.settings.maxPlayers) return send(client, { t: 'err', err: 'الروم ممتلئ' });
        if (name === 'المذيع' || jr.players.some(function (p) { return p.name === name; })) return send(client, { t: 'err', err: 'الاسم مستخدم، اختر اسم ثاني' });
        if (COLORS.indexOf(c) < 0 || jr.players.some(function (p) { return p.c === c; })) return send(client, { t: 'err', err: 'اللون انأخذ، اختر لون ثاني', room: publicRoom(jr) });
        var p = { id: 'p' + rid(5), key: rid(16), name: name, c: c, skin: cleanSkin(msg.skin) };
        jr.players.push(p); attach(client, jr, 'player', p.id);
        send(client, { t: 'welcome', role: 'player', id: p.id, key: p.key, code: jr.code });
        broadcastRoom(jr); if (jr.game) sendStates(jr);
        return;
    }
    if (t === 'resume') {
        var rr = _rooms[String(msg.code || '')], rp = rr && rr.players.find(function (q) { return q.id === msg.id && q.key === msg.key; });
        if (!rp) return send(client, { t: 'gone', reason: rr ? 'kicked' : 'closed' });
        attach(client, rr, 'player', rp.id);
        send(client, { t: 'welcome', role: 'player', id: rp.id, key: rp.key, code: rr.code });
        broadcastRoom(rr); if (rr.game) sendStates(rr);
        return;
    }

    if (!room || !client.id) return;
    var isHost = client.role === 'host' && room.hostConn === client;

    if (t === 'leave') {
        if (client.role === 'player') { room.players = room.players.filter(function (q) { return q.id !== client.id; }); client.code = null; client.id = null; broadcastRoom(room); }
        return;
    }
    if (t === 'skin') {
        var sk = cleanSkin(msg.skin);
        if (isHost) room.hostSkin = sk; else { var me = room.players.find(function (q) { return q.id === client.id; }); if (me) me.skin = sk; }
        return broadcastRoom(room);
    }
    if (t === 'color') {
        // تغيير اللون من لوبي الانتظار: قبل بداية الجولة فقط، ونفس قاعدة الدخول (لون غير مأخوذ)
        var mine = room.players.find(function (q) { return q.id === client.id; }), nc = String(msg.c || '');
        if (!mine || client.role !== 'player') return;
        if (room.started) return send(client, { t: 'err', err: 'ما تقدر تغيّر لونك والجولة شغالة' });
        if (COLORS.indexOf(nc) < 0 || room.players.some(function (q) { return q !== mine && q.c === nc; })) return send(client, { t: 'err', err: 'اللون انأخذ، اختر لون ثاني', room: publicRoom(room) });
        mine.c = nc;
        return broadcastRoom(room);
    }
    if (t === 'pos') { if (room.game) room.game.pos(client.id, msg.x, msg.y, msg.f, msg.v); return; }
    if (t === 'act') { if (room.game) var arg = msg.arg; if (typeof arg === 'string') arg = arg.slice(0, 160); else if (typeof arg !== 'number' && typeof arg !== 'boolean') arg = null; room.game.act(client.id, String(msg.a || ''), arg); return; }
    if (t === 'rtc') {
        var to = String(msg.to || ''); if (!to || to === client.id) return;
        return sendToIds(room, [to], { t: 'rtc', from: client.id, data: msg.data });
    }

    if (!isHost) return;
    if (t === 'settings') { room.settings = Settings.validate(msg.settings, room.players.length + 1); return broadcastRoom(room); }
    if (t === 'kick') {
        var kid = String(msg.id || ''); if (kid === 'host') return;
        room.players = room.players.filter(function (q) { return q.id !== kid; });
        roomClients(room).forEach(function (c) { if (c.id === kid) { send(c, { t: 'kicked' }); c.code = null; c.id = null; } });
        if (room.game) room.game.remove(kid);   // وسط الجولة: يطلع من المباراة نفسها (مفيد للي فصل وما رجع)
        return broadcastRoom(room);
    }
    if (t === 'endStage') { if (room.game) room.game.endStage(); return;
    }
    if (t === 'start' || t === 'again') {
        var C = room.settings, total = room.players.length + 1;
        if (t === 'start' && !room.started && (C.startRule === 'الروم ممتلئ' ? total < C.maxPlayers : total < C.minPlayers)) return send(client, { t: 'err', err: 'عدد اللاعبين ما يكفي' });
        return startGame(room);
    }
    if (t === 'lobby') return toLobby(room);
    if (t === 'close') return closeRoom(room, 'host-exit');
}

function removeClient(id) {
    var c = _clients[id]; if (!c) return;
    c.closed = true; delete _clients[id];
    var room = c.code && _rooms[c.code];
    if (room && room.hostConn === c) { room.hostConn = null; room.hostGoneAt = Date.now(); broadcastRoom(room); }
    else if (room && c.role === 'player' && c.id) broadcastRoom(room);   // المذيع يشوف مين فاصل
}

function tickAll() {
    var now = Date.now();
    Object.keys(_rooms).forEach(function (code) {
        var room = _rooms[code];
        if (!room.hostConn && room.hostGoneAt && now - room.hostGoneAt > HOST_GRACE_MS) return closeRoom(room, 'host-timeout');
        if (!room.game) return;
        try { room.game.tick(now); } catch (err) { logger.error('Station: tick error:', err); }
        var ph = room.game.G && room.game.G.phase, live = ph === 'play' || ph === 'reveal' || ph === 'meeting';
        var gap = now - room.lastSend;
        if ((room.dirty && gap >= TICK_MS) || gap >= (live ? PLAY_SEND_MS : IDLE_SEND_MS)) sendStates(room);
    });
}
var _ticker = null;
function ensureTicker() { if (!_ticker) { _ticker = setInterval(tickAll, TICK_MS); if (_ticker.unref) _ticker.unref(); } }

function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + handshake.computeAcceptKey(key), '', ''].join('\r\n'));
    try { socket.setNoDelay(true); } catch (e) { }
    ensureTicker();

    var id = 'st_' + Date.now().toString(36) + '_' + rid(3);
    var client = _clients[id] = { socket: socket, code: null, role: null, id: null, closed: false };
    var buffer = Buffer.alloc(0);

    socket.on('data', function (chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > MAX_MSG * 4) { socket.destroy(); removeClient(id); return; }
        var result;
        while ((result = frame.tryDecodeFrame(buffer)) !== null) {
            buffer = buffer.slice(result.bytesConsumed);
            if (result.opcode === frame.OPCODES.CLOSE) { socket.end(); removeClient(id); return; }
            if (result.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
            if (result.opcode !== frame.OPCODES.TEXT || result.payload.length > MAX_MSG) continue;
            var msg; try { msg = JSON.parse(result.payload.toString('utf8')); } catch (err) { continue; }
            try { onMessage(client, msg); } catch (err) { logger.error('Station: message error:', err); }
        }
    });
    socket.on('close', function () { removeClient(id); });
    socket.on('error', function () { removeClient(id); });
}

module.exports = { handleUpgrade: handleUpgrade, _rooms: _rooms, _setAdminCheck: function (fn) { _isAdmin = fn; } };
