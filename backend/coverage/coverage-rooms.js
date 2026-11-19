/**
 * «خارج التغطية» — الغرف واللاعبين وتوجيه الرسائل، بدون أي شي خاص بالشبكة.
 *
 * coverage-server.js يلفّه على WebSocket ('/ws/coverage')، ونسخة التجربة المحلية
 * (بدون خادم) تلفّه على BroadcastChannel بالمتصفح — نفس المنطق بالمكانين.
 *
 * createHub(deps) — deps: {allocate(isTaken)→code|null, accountOf(auth)→{tiktok}|null, log, now}
 *   → { open(sendFn) → client, message(client, msg), close(client), tick(), hasRoom(code), rooms }
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   عميل → schema · host {code?,token?,settings?} · peek {code} · ping {k}
 *          join {code,name,auth?} ← welcome {id,key}   (الحساب اختياري: للنقاط بس)
 *          resume {code,id,key} · leave · look (يغيّر شكل شخصيته باللوبي)
 *   اللاعب → act {a: hint|vote|guess, arg}
 *   المذيع → settings {settings} · kick {id} · endStage {seq} · start · again · lobby · close
 *   خادم → schema · welcome · room {room} · state {G,now} · err {err} · kicked · lobby · closed · gone · pong
 */
'use strict';

var crypto = require('crypto');
var Settings = require('./coverage-settings');
var Game = require('./coverage-game');

var LOOK_COUNT = 12;                 // لازم يطابق LOOKS في games/out-of-coverage/oc-looks.js
var HOST_GRACE_MS = 30 * 60 * 1000;  // غرفة بدون مذيع متصل أكثر من كذا ← تنقفل
var LIVE_SEND_MS = 250, IDLE_SEND_MS = 1000;
var RECENT_PAIRS = 40;

function rid(n) { return crypto.randomBytes(n || 12).toString('hex'); }
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18); }

function createHub(deps) {
    var now = deps.now || Date.now, log = deps.log || function () { };
    var rooms = {}, clients = [];

    function send(c, obj) { if (c && !c.closed) { try { c.send(obj); } catch (e) { } } }
    function roomClients(room) { return clients.filter(function (c) { return c.code === room.code && !c.closed; }); }
    function isOnline(room, id) { return roomClients(room).some(function (c) { return c.id === id; }); }
    function freeLook(room, after) {
        var used = room.players.map(function (p) { return p.look; });
        for (var i = 1; i <= LOOK_COUNT; i++) { var l = ((after == null ? -1 : after) + i) % LOOK_COUNT; if (used.indexOf(l) < 0) return l; }
        return Math.floor(Math.random() * LOOK_COUNT);
    }

    function publicRoom(room) {
        var ingame = room.game ? room.game.G.players.map(function (p) { return p.id; }) : [];
        return {
            code: room.code, started: room.started, settings: room.settings, minPlayers: Settings.minPlayers(room.settings),
            hostOnline: !!room.hostConn, matches: room.matches, scores: room.scores,
            players: room.players.map(function (p) { return { id: p.id, name: p.name, look: p.look, online: isOnline(room, p.id), inGame: ingame.indexOf(p.id) >= 0 }; })
        };
    }
    function broadcastRoom(room) { var msg = { t: 'room', room: publicRoom(room) }; roomClients(room).forEach(function (c) { send(c, msg); }); }

    function sendStates(room) {
        if (!room.game) return;
        var t = now(), cache = {};
        roomClients(room).forEach(function (c) {
            if (!c.id) return;
            var key = c.role === 'host' ? 'host' : c.id;
            send(c, { t: 'state', now: t, G: cache[key] || (cache[key] = room.game.view(key)) });
        });
        room.lastSend = t; room.dirty = false;
    }

    function createRoom() {
        var code = deps.allocate(function (c) { return !!rooms[c]; });
        if (!code) return null;
        var room = { code: code, token: rid(16), settings: Settings.validate({}), players: [], started: false, game: null, hostConn: null, hostGoneAt: 0, dirty: false, lastSend: 0, matches: 0, scores: {}, recent: [] };
        rooms[code] = room;
        log('Coverage: room ' + code + ' created');
        return room;
    }
    function closeRoom(room, reason) {
        roomClients(room).forEach(function (c) { if (c.role !== 'host') send(c, { t: 'closed', reason: reason || '' }); c.code = null; c.id = null; });
        delete rooms[room.code];
        log('Coverage: room ' + room.code + ' closed (' + (reason || '') + ')');
    }

    function startGame(room) {
        var roster = room.players.map(function (p) { return { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok }; });
        room.game = Game.createGame(roster, room.settings, {
            now: now, recent: room.recent, intro: room.matches ? 'short' : 'long',
            isOnline: function (id) { return isOnline(room, id); },
            onChange: function () { room.dirty = true; onGameChange(room); }
        });
        room.recent.push(room.game.G.pairKey); if (room.recent.length > RECENT_PAIRS) room.recent.shift();
        room.started = true; room.dirty = true; room.scored = false;
        broadcastRoom(room); sendStates(room);
    }
    // نقاط الغرفة التراكمية (عبر المباريات) تنحسب مرة وحدة لما تخلص المباراة
    function onGameChange(room) {
        var G = room.game && room.game.G;
        if (!G || room.scored || !G.result) return;
        room.scored = true; room.matches++;
        Object.keys(G.result.points).forEach(function (id) { room.scores[id] = (room.scores[id] || 0) + G.result.points[id]; });
        broadcastRoom(room);
    }
    function toLobby(room) {
        room.game = null; room.started = false;
        roomClients(room).forEach(function (c) { if (c.role === 'player') send(c, { t: 'lobby' }); });
        broadcastRoom(room);
    }
    function attach(c, room, role, id) {
        c.code = room.code; c.role = role; c.id = id;
        if (role === 'host') { if (room.hostConn && room.hostConn !== c) send(room.hostConn, { t: 'gone', reason: 'host-elsewhere' }); room.hostConn = c; room.hostGoneAt = 0; }
    }

    function message(c, msg) {
        var t = msg && msg.t, room = c.code ? rooms[c.code] : null;
        if (t === 'ping') return send(c, { t: 'pong', k: msg.k, now: now() });
        if (t === 'schema') return send(c, { t: 'schema', schema: Settings.SCHEMA });

        if (t === 'host') {
            var r = msg.code && rooms[msg.code];
            if (!(r && msg.token && r.token === msg.token)) r = createRoom();
            if (!r) return send(c, { t: 'err', err: 'الغرف ممتلئة الحين، جرّب بعد شوي' });
            if (msg.settings && !r.started) r.settings = Settings.validate(msg.settings);
            attach(c, r, 'host', 'host');
            send(c, { t: 'welcome', role: 'host', id: 'host', code: r.code, token: r.token });
            broadcastRoom(r); if (r.game) sendStates(r);
            return;
        }
        if (t === 'peek') {
            var pr = rooms[String(msg.code || '')];
            if (!pr) return send(c, { t: 'peek', ok: false, err: 'الغرفة غير موجودة' });
            c.code = pr.code; c.role = 'peek'; c.id = null;
            return send(c, { t: 'peek', ok: true, room: publicRoom(pr) });
        }
        if (t === 'join') {
            var jr = rooms[String(msg.code || '')];
            if (!jr) return send(c, { t: 'err', err: 'الغرفة غير موجودة', step: 'code' });
            var name = cleanName(msg.name);
            if (name.length < 2) return send(c, { t: 'err', err: 'اكتب اسم من حرفين أو أكثر', step: 'name' });
            if (jr.players.length >= jr.settings.maxPlayers) return send(c, { t: 'err', err: 'الغرفة ممتلئة', step: 'name' });
            if (jr.players.some(function (q) { return q.name.toLowerCase() === name.toLowerCase(); })) return send(c, { t: 'err', err: 'الاسم مستخدم، اختار اسم ثاني', step: 'name' });
            // الحساب اختياري: لو اللاعب مسجّل وموثّق بتيك توك تنحسب له نقاط المنصة
            var acc = null; try { acc = msg.auth && deps.accountOf ? deps.accountOf(msg.auth) : null; } catch (e) { acc = null; }
            var p = { id: 'p' + rid(5), key: rid(16), name: name, look: freeLook(jr), tiktok: acc && acc.tiktok || null };
            jr.players.push(p); attach(c, jr, 'player', p.id);
            send(c, { t: 'welcome', role: 'player', id: p.id, key: p.key, code: jr.code });
            broadcastRoom(jr); if (jr.game) sendStates(jr);
            return;
        }
        if (t === 'resume') {
            var rr = rooms[String(msg.code || '')], rp = rr && rr.players.find(function (q) { return q.id === msg.id && q.key === msg.key; });
            if (!rp) return send(c, { t: 'gone', reason: rr ? 'kicked' : 'closed' });
            // نفس اللاعب من تبويب ثاني ← القديم يطلع
            clients.forEach(function (o) { if (o !== c && o.code === rr.code && o.id === rp.id) { send(o, { t: 'gone', reason: 'elsewhere' }); o.code = null; o.id = null; } });
            attach(c, rr, 'player', rp.id);
            send(c, { t: 'welcome', role: 'player', id: rp.id, key: rp.key, code: rr.code });
            broadcastRoom(rr); if (rr.game) sendStates(rr);
            return;
        }

        if (!room || !c.id) return;
        var isHost = c.role === 'host' && room.hostConn === c;

        if (t === 'leave' && c.role === 'player') {
            var lid = c.id;
            room.players = room.players.filter(function (q) { return q.id !== lid; });
            if (room.game) room.game.remove(lid);
            c.code = null; c.id = null; broadcastRoom(room); room.dirty = true;
            return;
        }
        if (t === 'look' && c.role === 'player') {
            var me = room.players.find(function (q) { return q.id === c.id; });
            if (!me || room.started) return;
            me.look = freeLook(room, me.look);
            return broadcastRoom(room);
        }
        if (t === 'act' && c.role === 'player') {
            if (!room.game) return;
            var res = room.game.act(c.id, String(msg.a || ''), typeof msg.arg === 'string' ? msg.arg.slice(0, 200) : null);
            if (res && res.err) send(c, { t: 'err', err: res.err });
            room.game.tick(now());
            return;
        }

        if (!isHost) return;
        if (t === 'settings') { if (room.started) return; room.settings = Settings.validate(msg.settings); return broadcastRoom(room); }
        if (t === 'kick') {
            var kid = String(msg.id || '');
            room.players = room.players.filter(function (q) { return q.id !== kid; });
            clients.forEach(function (o) { if (o.code === room.code && o.id === kid) { send(o, { t: 'kicked' }); o.code = null; o.id = null; } });
            if (room.game) room.game.remove(kid);
            return broadcastRoom(room);
        }
        if (t === 'endStage') { if (room.game) room.game.endStage(msg.seq); return; }
        if (t === 'start' || t === 'again') {
            // ما نبدأ مباراة فوق مباراة شغالة (ضغطات مكررة أو تأخر الشبكة)
            if (room.game && room.game.G.stage.k !== 'over') return;
            if (t === 'start' && room.started) return;
            var need = Settings.minPlayers(room.settings);
            if (room.players.length < need) return send(c, { t: 'err', err: 'تحتاج ' + need + ' لاعبين على الأقل' });
            return startGame(room);
        }
        if (t === 'lobby') return toLobby(room);
        if (t === 'close') return closeRoom(room, 'host-exit');
    }

    function open(sendFn) { var c = { send: sendFn, code: null, role: null, id: null, closed: false }; clients.push(c); return c; }
    function close(c) {
        if (!c || c.closed) return;
        c.closed = true; clients = clients.filter(function (x) { return x !== c; });
        var room = c.code && rooms[c.code];
        if (room && room.hostConn === c) { room.hostConn = null; room.hostGoneAt = now(); }
        if (room) { broadcastRoom(room); room.dirty = true; }
    }

    function tick() {
        var t = now();
        Object.keys(rooms).forEach(function (code) {
            var room = rooms[code];
            if (!room.hostConn && room.hostGoneAt && t - room.hostGoneAt > HOST_GRACE_MS) return closeRoom(room, 'host-timeout');
            if (!room.game) return;
            try { room.game.tick(t); } catch (err) { log('Coverage: tick error: ' + (err && err.stack || err)); }
            var gap = t - room.lastSend, live = room.game.G.stage.k !== 'over';
            if ((room.dirty && gap >= 120) || gap >= (live ? LIVE_SEND_MS * 4 : IDLE_SEND_MS * 3)) sendStates(room);
        });
    }

    function hasRoom(code) { return Object.prototype.hasOwnProperty.call(rooms, String(code || '')); }

    return { open: open, message: message, close: close, tick: tick, hasRoom: hasRoom, rooms: rooms };
}

module.exports = { createHub: createHub, LOOK_COUNT: LOOK_COUNT };
