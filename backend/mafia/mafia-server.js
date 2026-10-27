/**
 * «المافيا» — خادم الرومات والمباريات (WebSocket على '/ws/mafia').
 *
 * نفس نموذج «الدخيل» (station/station-server.js): شاشة البث تنشئ روم برقم من
 * 4 أرقام، والجوالات تدخل بالرقم (QR)، والخادم يملك حالة المباراة
 * (mafia-game.js) ويرسل لكل طرف نسخته المفلترة. المذيع راوي وليس لاعباً.
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   عميل → host {code?,token?}          إنشاء روم أو رجوع المذيع لرومه
 *   عميل → peek {code}                  شاشة الدخول: معلومات الروم
 *   عميل → join {code,name,look,auth}   دخول لاعب ← welcome {id,key}
 *                                       (auth = توكن حساب الموقع؛ الموثّق بتيك توك تنحسب له النقاط)
 *   عميل → resume {code,id,key} · leave · look {look} (باللوبي) · ping {k}
 *   اللاعب → act {a,arg}   a: kill|recruit|card ('كرت|هدف' أو 'none')|protect|inspect|vote|chat ('city|district|mafia' + '|' + النص)
 *   المذيع → settings {settings} · kick {id} · endStage · start · again · lobby · close
 *   خادم → welcome · room {room} · state {G,now} · err {err} · kicked · lobby · closed · gone · pong
 */
'use strict';

var crypto = require('crypto');
var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');
var Settings = require('./mafia-settings');
var Game = require('./mafia-game');

// حدود ملامح الشخصية (لازم تطابق اللوحات في games/mafia/mafia-looks.js)
var LOOK_LIMITS = { skin: 6, hair: 7, hairC: 8, shirt: 12, pants: 6 };
var HOST_GRACE_MS = 30 * 60 * 1000;
var TICK_MS = 100, LIVE_SEND_MS = 250, IDLE_SEND_MS = 1000;
var MAX_MSG = 8 * 1024;

var _rooms = {};
var _clients = {};
var _validateSession = function (token) { return require('../auth/auth-service').validateSession(String(token || '')); };

function rid(n) { return crypto.randomBytes(n || 12).toString('hex'); }
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); }
function cleanLook(l) {
    var o = {};
    Object.keys(LOOK_LIMITS).forEach(function (k) {
        var v = Math.floor(Number(l && l[k]));
        o[k] = isFinite(v) && v >= 0 && v < LOOK_LIMITS[k] ? v : Math.floor(Math.random() * LOOK_LIMITS[k]);
    });
    return o;
}

function send(client, obj) {
    if (!client || client.closed) return;
    try { client.socket.write(frame.encodeTextFrame(JSON.stringify(obj))); } catch (err) { logger.error('Mafia: write failed:', err); }
}
function roomClients(room) { return Object.keys(_clients).map(function (k) { return _clients[k]; }).filter(function (c) { return c.code === room.code; }); }
function isOnline(room, id) { return roomClients(room).some(function (c) { return c.id === id && !c.closed; }); }

function publicRoom(room) {
    return {
        code: room.code, started: room.started, settings: room.settings, minPlayers: Settings.minPlayers(room.settings),
        hostOnline: !!room.hostConn,
        players: room.players.map(function (p) { return { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok, online: isOnline(room, p.id) }; })
    };
}
function broadcastRoom(room) { var msg = { t: 'room', room: publicRoom(room) }; roomClients(room).forEach(function (c) { send(c, msg); }); }

function sendStates(room) {
    if (!room.game) return;
    var now = Date.now(), cache = {};
    roomClients(room).forEach(function (c) {
        if (!c.id || c.closed) return;
        var v = cache[c.id] || (cache[c.id] = JSON.stringify({ t: 'state', G: room.game.view(c.id), now: now }));
        try { c.socket.write(frame.encodeTextFrame(v)); } catch (e) { }
    });
    room.lastSend = now; room.dirty = false;
}

function createRoom() {
    var code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (_rooms[code]);
    var room = { code: code, token: rid(16), settings: Settings.validate({}), players: [], started: false, game: null, hostConn: null, hostGoneAt: 0, dirty: false, lastSend: 0 };
    _rooms[code] = room;
    logger.log('Mafia: room ' + code + ' created');
    return room;
}

function closeRoom(room, reason) {
    roomClients(room).forEach(function (c) { if (c.role !== 'host') send(c, { t: 'closed', reason: reason || '' }); c.code = null; c.id = null; });
    delete _rooms[room.code];
    logger.log('Mafia: room ' + room.code + ' closed (' + (reason || '') + ')');
}

function startGame(room) {
    room.game = Game.createGame(room.players.map(function (p) { return { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok }; }), room.settings, {
        onChange: function () { room.dirty = true; }
    });
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

/** حساب الموقع الموثّق بتيك توك ← اسم المستخدم (للنقاط)، وإلا null. */
function tiktokOf(auth) {
    if (!auth) return null;
    try { var u = _validateSession(auth); return u && u.tiktok_verified && u.tiktok_username ? String(u.tiktok_username) : null; }
    catch (err) { logger.error('Mafia: auth check failed:', err); return null; }
}

function onMessage(client, msg) {
    var t = msg && msg.t, room = client.code ? _rooms[client.code] : null;

    if (t === 'ping') return send(client, { t: 'pong', k: msg.k, now: Date.now() });

    if (t === 'host') {
        var r = msg.code && _rooms[msg.code];
        if (!(r && msg.token && r.token === msg.token)) r = createRoom();
        attach(client, r, 'host', 'host');
        send(client, { t: 'welcome', role: 'host', id: 'host', code: r.code, token: r.token, schema: Settings.SCHEMA });
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
        if (jr.started) return send(client, { t: 'err', err: 'المباراة بدأت، انتظر الجولة الجاية' });
        var name = cleanName(msg.name);
        if (!name) return send(client, { t: 'err', err: 'اكتب اسمك' });
        if (jr.players.length >= jr.settings.maxPlayers) return send(client, { t: 'err', err: 'الروم ممتلئ' });
        if (jr.players.some(function (p) { return p.name === name; })) return send(client, { t: 'err', err: 'الاسم مستخدم، اختر اسم ثاني' });
        var tk = tiktokOf(msg.auth);
        if (tk && jr.players.some(function (p) { return p.tiktok && p.tiktok.toLowerCase() === tk.toLowerCase(); })) return send(client, { t: 'err', err: 'حسابك داخل الروم من جهاز ثاني' });
        var p = { id: 'p' + rid(5), key: rid(16), name: name, look: cleanLook(msg.look), tiktok: tk };
        jr.players.push(p); attach(client, jr, 'player', p.id);
        send(client, { t: 'welcome', role: 'player', id: p.id, key: p.key, code: jr.code, tiktok: tk });
        broadcastRoom(jr);
        return;
    }
    if (t === 'resume') {
        var rr = _rooms[String(msg.code || '')], rp = rr && rr.players.find(function (q) { return q.id === msg.id && q.key === msg.key; });
        if (!rp) return send(client, { t: 'gone', reason: rr ? 'kicked' : 'closed' });
        attach(client, rr, 'player', rp.id);
        send(client, { t: 'welcome', role: 'player', id: rp.id, key: rp.key, code: rr.code, tiktok: rp.tiktok });
        broadcastRoom(rr); if (rr.game) sendStates(rr);
        return;
    }

    if (!room || !client.id) return;
    var isHost = client.role === 'host' && room.hostConn === client;

    if (t === 'leave') {
        if (client.role === 'player') {
            room.players = room.players.filter(function (q) { return q.id !== client.id; });
            if (room.game) room.game.remove(client.id);
            client.code = null; client.id = null; broadcastRoom(room);
        }
        return;
    }
    if (t === 'look') {
        var mine = room.players.find(function (q) { return q.id === client.id; });
        if (!mine || room.started) return;
        mine.look = cleanLook(msg.look);
        return broadcastRoom(room);
    }
    if (t === 'act') {
        if (!room.game || client.role !== 'player') return;
        var arg = msg.arg;
        if (typeof arg === 'string') arg = arg.slice(0, 200); else arg = null;
        room.game.act(client.id, String(msg.a || ''), arg);
        return;
    }

    if (!isHost) return;
    if (t === 'settings') { if (room.started) return; room.settings = Settings.validate(msg.settings); return broadcastRoom(room); }
    if (t === 'kick') {
        var kid = String(msg.id || '');
        room.players = room.players.filter(function (q) { return q.id !== kid; });
        roomClients(room).forEach(function (c) { if (c.id === kid) { send(c, { t: 'kicked' }); c.code = null; c.id = null; } });
        if (room.game) room.game.remove(kid);
        return broadcastRoom(room);
    }
    if (t === 'endStage') { if (room.game) room.game.endStage(); return; }
    if (t === 'start' || t === 'again') {
        if (room.players.length < Settings.minPlayers(room.settings)) return send(client, { t: 'err', err: 'تحتاج ' + Settings.minPlayers(room.settings) + ' لاعبين على الأقل لهالإعدادات' });
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
    else if (room && c.role === 'player' && c.id) broadcastRoom(room);
}

function tickAll() {
    var now = Date.now();
    Object.keys(_rooms).forEach(function (code) {
        var room = _rooms[code];
        if (!room.hostConn && room.hostGoneAt && now - room.hostGoneAt > HOST_GRACE_MS) return closeRoom(room, 'host-timeout');
        if (!room.game) return;
        try { room.game.tick(now); } catch (err) { logger.error('Mafia: tick error:', err); }
        // الرومات الكبيرة (لين 200 لاعب): نجمع التغييرات بدل ما نرسل نسخة لكل لاعب مع كل رسالة شات
        var gap = now - room.lastSend, live = room.game.G.phase === 'dawn', minGap = room.players.length > 40 ? 500 : 0;
        if ((room.dirty && gap >= minGap) || gap >= (live ? LIVE_SEND_MS : IDLE_SEND_MS)) sendStates(room);
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

    var id = 'mf_' + Date.now().toString(36) + '_' + rid(3);
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
            try { onMessage(client, msg); } catch (err) { logger.error('Mafia: message error:', err); }
        }
    });
    socket.on('close', function () { removeClient(id); });
    socket.on('error', function () { removeClient(id); });
}

module.exports = { handleUpgrade: handleUpgrade, _rooms: _rooms, _setSessionValidator: function (fn) { _validateSession = fn; } };
