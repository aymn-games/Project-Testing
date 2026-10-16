/**
 * تشغيل مباراة "تحدي البثوث" على الخادم: يتصل ببث الطرفين بتيك توك (نفس
 * موصِّل الألعاب)، يمرّر تعليقات كل شات لمنطق اللعبة مع رقم البث اللي جات
 * منه، ويرسل نفس الحالة لشاشتي الستريمرين عبر WebSocket (/ws/challenge).
 *
 * الخادم هو الحكم: الشاشات ما ترسل إلا أوامر التحكم (بدء جولة، مباراة
 * جديدة، إنهاء، انسحاب) والمنطق كله هنا.
 *
 * بروتوكول WebSocket:
 *   متصفح → { type:'join', matchId, token }   (أول رسالة إلزامية)
 *   متصفح → { type:'action', action:'spin'|'newGame'|'finish'|'leave' }
 *   خادم  → { type:'state', match:{...} }      (بعد كل تغيير)
 *   خادم  → { type:'error', error }
 *
 * ساعات البث والإحصائيات: كل بث يُسجَّل لصاحبه (broadcasts) من لحظة اتصال
 * تيك توك لين تنتهي المباراة — نفس الألعاب العادية. النقاط: مرة وحدة لكل
 * مباراة عند إعلان الفائز (لعبة فريقين — points-service.js).
 */
'use strict';

var crypto = require('crypto');
var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var connectorRouter = require('../platforms/connector-router');
var authService = require('../auth/auth-service');
var pointsService = require('../points/points-service');
var logger = require('../utils/logger');
var fastestAnswer = require('./fastest-answer-logic');

var GAMES = {
    'fastest-answer': {
        name: 'أسرع إجابة',
        create: fastestAnswer.createFastestAnswer,
        sanitize: fastestAnswer.sanitizeSettings,
        sanitizeHost: fastestAnswer.sanitizeHostSettings,
        sanitizeGuest: fastestAnswer.sanitizeGuestSettings
    }
};

var ABSENT_GRACE_MS = 2 * 60 * 1000;   // شاشة طرف مسكّرة أكثر من كذا → تنتهي المباراة
var STREAM_GRACE_MS = 2 * 60 * 1000;   // بث طرف منقطع أكثر من كذا → تنتهي المباراة
var RECONNECT_EVERY_MS = 30 * 1000;    // إعادة محاولة الاتصال ببث منقطع والشاشة مفتوحة
var KEEP_ENDED_MS = 10 * 60 * 1000;    // المباراة المنتهية تبقى للعرض ثم تُحذف
var WATCHDOG_MS = 5000;

var _matches = {};
var _watchdogStarted = false;

function now() { return Date.now(); }

function createMatch(opts) {
    var game = GAMES[opts.game];
    if (!game) return null;
    var id = crypto.randomBytes(6).toString('hex');
    var m = {
        id: id,
        game: opts.game,
        gameName: game.name,
        sides: opts.sides,                  // [{userId, customId, name, tiktok, avatar}] — 0 = المنشئ
        clients: [[], []],
        connectors: [null, null],
        stream: ['idle', 'idle'],           // idle | connecting | connected | error | ended
        streamMsg: [null, null],
        streamDownSince: [null, null],
        lastConnectAttempt: [0, 0],
        absentSince: [now(), now()],
        broadcastIds: [null, null],
        timers: [],
        ended: false,
        endReason: null,
        endedBy: null,
        endedAt: null,
        createdAt: now(),
        pointsReported: false,
        onEnd: opts.onEnd || function () {},
        _sendTimer: null
    };
    m.settings = game.sanitize(opts.settings, [opts.sides[0].name, opts.sides[1].name]);
    m.logic = game.create(m.settings, {
        schedule: function (fn, ms) {
            var t = setTimeout(function () {
                m.timers = m.timers.filter(function (x) { return x !== t; });
                if (m.ended) return;
                try { fn(); } catch (err) { logger.error('Challenge: game timer failed:', err); }
                scheduleSend(m);
            }, ms);
            m.timers.push(t);
        },
        onChange: function () { scheduleSend(m); },
        onRoundStart: function () { m.pointsReported = false; },
        onWin: function (winnerIdx, durationMs) { reportPoints(m, winnerIdx, durationMs); }
    });
    _matches[id] = m;
    startWatchdog();
    logger.log('Challenge: match ' + id + ' created (' + opts.game + ') — ' + m.sides[0].tiktok + ' vs ' + m.sides[1].tiktok);
    return m;
}

function getMatch(id) { return _matches[id] || null; }

function sideOf(m, userId) {
    if (m.sides[0].userId === userId) return 0;
    if (m.sides[1].userId === userId) return 1;
    return -1;
}

/* ---- النقاط ---- */
function reportPoints(m, winnerIdx, durationMs) {
    if (m.pointsReported) return;
    m.pointsReported = true;
    try {
        var seen = {};
        m.logic.participants().forEach(function (p) {
            // نفس الشخص بالشاتين (نادر) ينحسب مرة وحدة.
            var key = p.tiktokUsername.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            var matched = authService.findVerifiedUserByTikTok(p.tiktokUsername);
            if (!matched) return;
            pointsService.awardForRoundCompletion(matched.id, { won: p.team === winnerIdx, teamGame: true, durationMs: durationMs });
        });
    } catch (err) {
        logger.error('Challenge: points report failed:', err);
    }
}

/* ---- ساعات البث ---- */
function startBroadcastFor(m, i) {
    if (m.broadcastIds[i]) return;
    try { m.broadcastIds[i] = authService.startBroadcast(m.sides[i].userId, m.sides[i].tiktok); } catch (err) { logger.error('Challenge: startBroadcast failed:', err); }
}
function endBroadcastFor(m, i) {
    if (!m.broadcastIds[i]) return;
    try { authService.endBroadcast(m.broadcastIds[i]); } catch (err) { logger.error('Challenge: endBroadcast failed:', err); }
    m.broadcastIds[i] = null;
}

/* ---- اتصال تيك توك لكل طرف ---- */
function connectSide(m, i) {
    if (m.ended) return;
    if (m.connectors[i]) { try { m.connectors[i].disconnect(); } catch (e) {} }
    var connector = connectorRouter.createConnectorForPlatform('tiktok');
    m.connectors[i] = connector;
    m.lastConnectAttempt[i] = now();
    m.stream[i] = 'connecting';
    m.streamMsg[i] = null;
    scheduleSend(m);
    if (!connector) { m.stream[i] = 'error'; m.streamMsg[i] = 'الموصل غير متاح'; return; }
    connector.connect({ username: m.sides[i].tiktok }, {
        onStatus: function (status, message) {
            if (m.connectors[i] !== connector || m.ended) return;
            if (status === 'connected') {
                m.stream[i] = 'connected';
                m.streamMsg[i] = null;
                m.streamDownSince[i] = null;
                startBroadcastFor(m, i);
            } else if (status === 'connecting') {
                m.stream[i] = 'connecting';
            } else {
                m.stream[i] = status === 'ended' ? 'ended' : 'error';
                m.streamMsg[i] = message || null;
                if (!m.streamDownSince[i]) m.streamDownSince[i] = now();
                endBroadcastFor(m, i);
            }
            scheduleSend(m);
        },
        onComment: function (data) {
            if (m.connectors[i] !== connector || m.ended) return;
            if (m.broadcastIds[i]) { try { authService.incrementBroadcastStat(m.broadcastIds[i], 'comment', 1); } catch (e) {} }
            var changed = false;
            try { changed = m.logic.onChat(i, data); } catch (err) { logger.error('Challenge: onChat failed:', err); }
            if (changed) scheduleSend(m);
        },
        onGift: function () {},
        onFollow: function () {},
        onViewerUpdate: function () {}
    });
}

/* ---- إرسال الحالة ---- */
function snapshot(m, side) {
    return {
        id: m.id,
        game: m.game,
        gameName: m.gameName,
        you: side,
        host: 0,
        serverNow: now(),
        sides: m.sides.map(function (s, i) {
            return {
                name: s.name, tiktok: s.tiktok, customId: s.customId, avatar: s.avatar,
                stream: m.stream[i], streamMsg: m.streamMsg[i], present: m.clients[i].length > 0
            };
        }),
        settings: m.settings,
        ended: m.ended,
        endReason: m.endReason,
        endedBy: m.endedBy,
        state: m.logic.state()
    };
}

function sendTo(client, obj) {
    try { client.socket.write(frame.encodeTextFrame(JSON.stringify(obj))); } catch (err) { /* اتصال مسكّر */ }
}

function sendState(m) {
    m._sendTimer = null;
    [0, 1].forEach(function (i) {
        if (!m.clients[i].length) return;
        var msg = { type: 'state', match: snapshot(m, i) };
        m.clients[i].forEach(function (c) { sendTo(c, msg); });
    });
}

// تجميع: تغييرات كثيرة ورا بعض (شات سريع) = رسالة وحدة كل 120ms.
function scheduleSend(m) {
    if (m._sendTimer) return;
    m._sendTimer = setTimeout(function () { sendState(m); }, 120);
}

/* ---- نهاية المباراة ---- */
function endMatch(m, reason, bySide) {
    if (m.ended) return;
    m.ended = true;
    m.endReason = reason;
    m.endedBy = bySide == null ? null : bySide;
    m.endedAt = now();
    m.timers.forEach(clearTimeout);
    m.timers = [];
    [0, 1].forEach(function (i) {
        if (m.connectors[i]) { try { m.connectors[i].disconnect(); } catch (e) {} m.connectors[i] = null; }
        endBroadcastFor(m, i);
    });
    logger.log('Challenge: match ' + m.id + ' ended (' + reason + ').');
    sendState(m);
    try { m.onEnd(m); } catch (err) { logger.error('Challenge: onEnd failed:', err); }
}

function startWatchdog() {
    if (_watchdogStarted) return;
    _watchdogStarted = true;
    setInterval(function () {
        var t = now();
        Object.keys(_matches).forEach(function (id) {
            var m = _matches[id];
            if (m.ended) {
                if (t - m.endedAt > KEEP_ENDED_MS) delete _matches[id];
                return;
            }
            for (var i = 0; i < 2; i++) {
                if (!m.clients[i].length && t - m.absentSince[i] > ABSENT_GRACE_MS) { endMatch(m, 'left', i); return; }
                var down = m.stream[i] === 'error' || m.stream[i] === 'ended';
                if (down && m.streamDownSince[i] && t - m.streamDownSince[i] > STREAM_GRACE_MS) { endMatch(m, 'stream_lost', i); return; }
                if (down && m.clients[i].length && t - m.lastConnectAttempt[i] > RECONNECT_EVERY_MS) connectSide(m, i);
            }
        });
    }, WATCHDOG_MS);
}

/* ---- أوامر الشاشات ---- */
function handleAction(m, side, action) {
    if (m.ended) return { ok: false, error: 'ended' };
    if (action === 'leave') { endMatch(m, 'left', side); return { ok: true }; }
    if (side !== 0) return { ok: false, error: 'host_only' };
    var r;
    if (action === 'spin') r = m.logic.spin();
    else if (action === 'newGame') r = m.logic.newGame();
    else if (action === 'finish') r = m.logic.finish();
    else return { ok: false, error: 'unknown_action' };
    scheduleSend(m);
    return r;
}

function onClientMessage(client, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
        if (client.match) return;
        var user = authService.validateSession(String(msg.token || ''));
        var m = getMatch(String(msg.matchId || ''));
        if (!user) return sendTo(client, { type: 'error', error: 'auth_required' });
        if (!m) return sendTo(client, { type: 'error', error: 'match_not_found' });
        var side = sideOf(m, user.id);
        if (side < 0) return sendTo(client, { type: 'error', error: 'not_in_match' });
        client.match = m;
        client.side = side;
        m.clients[side].push(client);
        if (!m.ended && (m.stream[side] === 'idle' || ((m.stream[side] === 'error' || m.stream[side] === 'ended') && now() - m.lastConnectAttempt[side] > 5000))) connectSide(m, side);
        sendState(m);
        return;
    }
    if (msg.type === 'action' && client.match) {
        var res = handleAction(client.match, client.side, String(msg.action || ''));
        if (res && !res.ok) sendTo(client, { type: 'error', error: res.error });
    }
}

function removeClient(client) {
    var m = client.match;
    if (!m) return;
    m.clients[client.side] = m.clients[client.side].filter(function (c) { return c !== client; });
    if (!m.clients[client.side].length) m.absentSince[client.side] = now();
    client.match = null;
    if (!m.ended) scheduleSend(m);
}

function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    socket.write([
        'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
        'Sec-WebSocket-Accept: ' + handshake.computeAcceptKey(key), '', ''
    ].join('\r\n'));

    var client = { socket: socket, match: null, side: -1 };
    var buffer = Buffer.alloc(0);
    socket.on('data', function (chunk) {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > 64 * 1024) { socket.destroy(); return; }
        var result;
        while ((result = frame.tryDecodeFrame(buffer)) !== null) {
            buffer = buffer.slice(result.bytesConsumed);
            if (result.opcode === frame.OPCODES.CLOSE) { socket.end(); removeClient(client); return; }
            if (result.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
            if (result.opcode !== frame.OPCODES.TEXT) continue;
            var msg;
            try { msg = JSON.parse(result.payload.toString('utf8')); } catch (err) { continue; }
            try { onClientMessage(client, msg); } catch (err) { logger.error('Challenge: message handling failed:', err); }
        }
    });
    socket.on('close', function () { removeClient(client); });
    socket.on('error', function () { removeClient(client); });
}

module.exports = {
    GAMES: GAMES,
    createMatch: createMatch,
    getMatch: getMatch,
    endMatch: endMatch,
    handleUpgrade: handleUpgrade
};
