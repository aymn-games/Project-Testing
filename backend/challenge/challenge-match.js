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
 *   متصفح → { type:'action', action:'start'|'spin'|'newGame'|'finish'|'leave'|'kick', name? }
 *   خادم  → { type:'state', match:{...} }      (بعد كل تغيير)
 *   خادم  → { type:'error', error }
 *
 * تواصل الستريمرين (شات + مايك) طوال المباراة:
 *   متصفح → { type:'chat', text }              → للطرفين { type:'chat', msg:{side, name, text, at} }
 *   خادم  → { type:'chatHistory', messages }    (عند الدخول — آخر MAX_CHAT رسالة)
 *   متصفح → { type:'mic', on }                  (حالة المايك تظهر بالـ state: sides[i].mic)
 *   متصفح → { type:'rtc', data }                → للطرف الثاني كما هي (إشارات WebRTC للصوت)
 *   خادم  → { type:'peer' }                      (للطرفين لما تكون شاشتيهم مفتوحة — المنشئ يبدأ الاتصال الصوتي)
 *
 * ساعات البث والإحصائيات: كل بث يُسجَّل لصاحبه (broadcasts) من لحظة اتصال
 * تيك توك لين تنتهي المباراة — نفس الألعاب العادية (ws-server.js): التعليقات
 * والهدايا وقيمتها (تدخل بنقاط الستريمر SP) والمتابعات والمشاهدين، وإحصائيات
 * البث (live-session-stats.js). عند إعلان الفائز (مرة وحدة لكل مباراة):
 * وقت المباراة لساعات كل ستريمر، وعدد مشاركي فريقه («الأكثر مشاركات»)،
 * ونقاط كل لاعب (لعبة فريقين — points-service.js).
 */
'use strict';

var crypto = require('crypto');
var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var connectorRouter = require('../platforms/connector-router');
var authService = require('../auth/auth-service');
var pointsService = require('../points/points-service');
var streamerHours = require('../points/streamer-hours');
var liveSessionStats = require('../stats/live-session-stats');
var collectiblesService = require('../collectibles/collectibles-service');
var logger = require('../utils/logger');
var fastestAnswer = require('./fastest-answer-logic');
var penalty = require('./penalty-logic');

// hostActions: أوامر المنشئ من الشاشة → دالة منطق اللعبة.
// twoStep: الخصم يقبل ثم يجهّز إعداداته ويضغط «جاهز»، والمنشئ يدخل اللوبي (challenge-service.js).
var GAMES = {
    'fastest-answer': {
        name: 'أسرع إجابة',
        create: fastestAnswer.createFastestAnswer,
        sanitize: fastestAnswer.sanitizeSettings,
        sanitizeHost: fastestAnswer.sanitizeHostSettings,
        sanitizeGuest: fastestAnswer.sanitizeGuestSettings,
        hostActions: { start: 'startMatch', spin: 'spin', newGame: 'newGame', finish: 'finish' },
        twoStep: true
    },
    'penalty': {
        name: 'بلنتي',
        create: penalty.createPenalty,
        sanitize: penalty.sanitizeSettings,
        sanitizeHost: penalty.sanitizeHostSettings,
        sanitizeGuest: penalty.sanitizeGuestSettings,
        hostActions: { start: 'startMatch', skipIntro: 'skipIntro' },
        twoStep: true
    }
};

var ABSENT_GRACE_MS = 2 * 60 * 1000;   // شاشة طرف مسكّرة أكثر من كذا → تنتهي المباراة
var STREAM_GRACE_MS = 2 * 60 * 1000;   // بث طرف منقطع أكثر من كذا → تنتهي المباراة
var RECONNECT_EVERY_MS = 30 * 1000;    // إعادة محاولة الاتصال ببث منقطع والشاشة مفتوحة
var KEEP_ENDED_MS = 10 * 60 * 1000;    // المباراة المنتهية تبقى للعرض ثم تُحذف
var WATCHDOG_MS = 5000;
var MAX_CHAT = 50;                     // آخر كم رسالة بشات الستريمرين تنحفظ للمباراة
var MAX_CHAT_LEN = 200;
var CHAT_MIN_GAP_MS = 400;

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
        reward: null,                       // جائزة الفوز {side} — كود واحد لكل مباراة لستريمر الفريق الفائز
        onEnd: opts.onEnd || function () {},
        _sendTimer: null,
        chat: [],                           // شات الستريمرين [{side, name, text, at}]
        mic: [false, false]
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
        onWin: function (winnerIdx, durationMs) { reportPoints(m, winnerIdx, durationMs); grantWinReward(m, winnerIdx); }
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
    // ساعات البث لكل طرف = وقت المباراة فقط (راجع streamer-hours.js).
    [0, 1].forEach(function (i) {
        try { streamerHours.recordMatchTime(m.sides[i].userId, durationMs); } catch (err) { logger.error('Challenge: match time record failed:', err); }
    });
    try {
        // «الأكثر مشاركات»: كل ستريمر ينحسب له لاعبين فريقه (جمهور بثه) بدون تكرار.
        var perSide = [{}, {}];
        m.logic.participants().forEach(function (p) { if (perSide[p.team]) perSide[p.team][p.tiktokUsername.toLowerCase()] = true; });
        [0, 1].forEach(function (i) { authService.recordStreamerParticipations(m.sides[i].userId, Object.keys(perSide[i]).length); });
    } catch (err) {
        logger.error('Challenge: participations record failed:', err);
    }
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

/* ---- جائزة الفوز (كود اختيار إطار) ---- */
// مرة وحدة لكل مباراة (حتى لو أسرع إجابة بدأت مباراة جديدة بنفس الفرق).
// الكود نفسه ما ينرسل للشاشة أبداً — يظهر للستريمر الفائز ببروفايله بس.
function grantWinReward(m, winnerIdx) {
    if (m.reward) return;
    var side = m.sides[winnerIdx];
    if (!side) return;
    try {
        var st = m.logic.state();
        var r = collectiblesService.createWinRewardCode(side.userId, {
            matchId: m.id, game: m.game, gameName: m.gameName, teamName: st.teams && st.teams[winnerIdx] ? st.teams[winnerIdx].name : ''
        });
        if (r.success) m.reward = { side: winnerIdx };
    } catch (err) {
        logger.error('Challenge: win reward failed:', err);
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
function statsConnId(m, i) { return 'challenge:' + m.id + ':' + i; }

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
                // إحصائيات البث (زر «عرض إحصائيات البث»): نفس Room ID = نفس البث.
                try { liveSessionStats.attach(m.sides[i].tiktok, connector.getRoomId ? connector.getRoomId() : null, statsConnId(m, i)); } catch (err) { logger.error('Challenge: live stats attach failed:', err); }
                // البثين متصلين: بعض الألعاب تبدأ عدّاد اللوبي من هنا.
                if (m.stream[0] === 'connected' && m.stream[1] === 'connected' && typeof m.logic.onStreamsReady === 'function') {
                    try { m.logic.onStreamsReady(); } catch (err) { logger.error('Challenge: onStreamsReady failed:', err); }
                }
            } else if (status === 'connecting') {
                m.stream[i] = 'connecting';
            } else {
                m.stream[i] = status === 'ended' ? 'ended' : 'error';
                if (status === 'ended') { try { liveSessionStats.markEnded(m.sides[i].tiktok, statsConnId(m, i)); } catch (e) {} }
                m.streamMsg[i] = message || null;
                if (!m.streamDownSince[i]) m.streamDownSince[i] = now();
                endBroadcastFor(m, i);
            }
            scheduleSend(m);
        },
        onComment: function (data) {
            if (m.connectors[i] !== connector || m.ended) return;
            if (m.broadcastIds[i]) { try { authService.incrementBroadcastStat(m.broadcastIds[i], 'comment', 1); } catch (e) {} }
            try { liveSessionStats.recordComment(m.sides[i].tiktok, statsConnId(m, i), data); } catch (e) {}
            var changed = false;
            try { changed = m.logic.onChat(i, data); } catch (err) { logger.error('Challenge: onChat failed:', err); }
            if (changed) scheduleSend(m);
        },
        // الهدايا (عددها وقيمتها بالماس × التكرار — تدخل بنقاط الستريمر SP)، المتابعات، والمشاهدين.
        onGift: function (data) {
            if (m.connectors[i] !== connector || m.ended) return;
            if (m.broadcastIds[i]) {
                try {
                    authService.incrementBroadcastStat(m.broadcastIds[i], 'gift', 1);
                    var value = (Number(data && data.giftValue) || 0) * (Number(data && data.repeatCount) || 1);
                    if (value > 0) authService.addGiftValue(m.broadcastIds[i], value);
                } catch (err) { logger.error('Challenge: gift stat failed:', err); }
            }
            try { liveSessionStats.recordGift(m.sides[i].tiktok, statsConnId(m, i), data); } catch (e) {}
        },
        onFollow: function () {
            if (m.connectors[i] !== connector || m.ended) return;
            if (m.broadcastIds[i]) { try { authService.incrementBroadcastStat(m.broadcastIds[i], 'follow', 1); } catch (e) {} }
            try { liveSessionStats.recordFollow(m.sides[i].tiktok, statsConnId(m, i)); } catch (e) {}
        },
        onViewerUpdate: function (data) {
            if (m.connectors[i] !== connector || m.ended) return;
            if (m.broadcastIds[i]) { try { authService.updateBroadcastViewerStats(m.broadcastIds[i], data && data.current, data && data.totalUsers); } catch (e) {} }
            try { liveSessionStats.recordViewers(m.sides[i].tiktok, statsConnId(m, i), data && data.current, data && data.totalUsers); } catch (e) {}
        },
        onLike: function (data) { if (m.connectors[i] === connector && !m.ended) { try { liveSessionStats.recordLike(m.sides[i].tiktok, statsConnId(m, i), data); } catch (e) {} } },
        onShare: function (data) { if (m.connectors[i] === connector && !m.ended) { try { liveSessionStats.recordShare(m.sides[i].tiktok, statsConnId(m, i), data); } catch (e) {} } },
        onMember: function (data) { if (m.connectors[i] === connector && !m.ended) { try { liveSessionStats.recordMember(m.sides[i].tiktok, statsConnId(m, i), data); } catch (e) {} } }
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
                stream: m.stream[i], streamMsg: m.streamMsg[i], present: m.clients[i].length > 0, mic: m.mic[i]
            };
        }),
        settings: m.settings,
        ended: m.ended,
        endReason: m.endReason,
        endedBy: m.endedBy,
        reward: m.reward ? { side: m.reward.side, mine: m.reward.side === side } : null,
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
    m.mic = [false, false];
    m.timers.forEach(clearTimeout);
    m.timers = [];
    [0, 1].forEach(function (i) {
        if (m.connectors[i]) { try { m.connectors[i].disconnect(); } catch (e) {} m.connectors[i] = null; }
        endBroadcastFor(m, i);
        try { liveSessionStats.markEnded(m.sides[i].tiktok, statsConnId(m, i)); } catch (e) {}
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
function handleAction(m, side, action, msg) {
    if (m.ended) return { ok: false, error: 'ended' };
    if (action === 'leave') { endMatch(m, 'left', side); return { ok: true }; }
    // كل ستريمر يقدر يطلّع لاعبين من فريقه هو بس.
    if (action === 'kick') { var k = m.logic.kick(side, String((msg && msg.name) || '')); scheduleSend(m); return k; }
    if (side !== 0) return { ok: false, error: 'host_only' };
    var method = Object.prototype.hasOwnProperty.call(GAMES[m.game].hostActions, action) ? GAMES[m.game].hostActions[action] : null;
    if (!method) return { ok: false, error: 'unknown_action' };
    var r = m.logic[method]();
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
        sendTo(client, { type: 'chatHistory', messages: m.chat });
        // الشاشتين مفتوحة: نبلّغ الطرفين عشان المنشئ يبدأ (أو يعيد) الاتصال الصوتي.
        if (!m.ended && m.clients[1 - side].length) [0, 1].forEach(function (i) { m.clients[i].forEach(function (c) { sendTo(c, { type: 'peer' }); }); });
        return;
    }
    if (!client.match) return;
    var cm = client.match;
    if (msg.type === 'chat') {
        if (cm.ended) return;
        var text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LEN);
        if (!text) return;
        var t = now();
        if (client.lastChatAt && t - client.lastChatAt < CHAT_MIN_GAP_MS) return sendTo(client, { type: 'error', error: 'chat_too_fast' });
        client.lastChatAt = t;
        var chatMsg = { side: client.side, name: cm.sides[client.side].name, text: text, at: t };
        cm.chat.push(chatMsg);
        if (cm.chat.length > MAX_CHAT) cm.chat.shift();
        [0, 1].forEach(function (i) { cm.clients[i].forEach(function (c) { sendTo(c, { type: 'chat', msg: chatMsg }); }); });
        return;
    }
    if (msg.type === 'mic') {
        cm.mic[client.side] = Boolean(msg.on) && !cm.ended;
        scheduleSend(cm);
        return;
    }
    if (msg.type === 'rtc') {
        // إشارات WebRTC (offer/answer/candidate) تنتقل للطرف الثاني بدون ما يقراها الخادم.
        if (cm.ended || !msg.data || typeof msg.data !== 'object') return;
        cm.clients[1 - client.side].forEach(function (c) { sendTo(c, { type: 'rtc', data: msg.data }); });
        return;
    }
    if (msg.type === 'action') {
        var res = handleAction(client.match, client.side, String(msg.action || ''), msg);
        if (res && !res.ok) sendTo(client, { type: 'error', error: res.error });
    }
}

function removeClient(client) {
    var m = client.match;
    if (!m) return;
    m.clients[client.side] = m.clients[client.side].filter(function (c) { return c !== client; });
    if (!m.clients[client.side].length) { m.absentSince[client.side] = now(); m.mic[client.side] = false; }
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

/** المباريات الشغّالة الآن (غير المنتهية) — لصفحة «البثوث الشغّالة» بلوحة الأدمن. */
function listActiveMatches() {
    return Object.keys(_matches).map(function (id) { return _matches[id]; })
        .filter(function (m) { return !m.ended; })
        .map(function (m) {
            var st = null;
            try { st = m.logic.state(); } catch (e) {}
            return {
                id: m.id,
                game: m.game,
                gameName: m.gameName,
                createdAt: m.createdAt,
                phase: st ? st.phase : null,
                round: st ? st.round : null,
                sides: m.sides.map(function (s, i) {
                    var team = st && st.teams ? st.teams[i] : null;
                    return {
                        userId: s.userId, customId: s.customId, name: s.name, tiktok: s.tiktok,
                        avatar: /^https?:/.test(s.avatar || '') ? s.avatar : null, // بدون base64 — الصفحة تتحدّث كل ثواني
                        stream: m.stream[i],
                        screenOpen: m.clients[i].length > 0,
                        teamName: team ? team.name : null,
                        players: team ? team.players.length : 0,
                        score: team ? team.score : 0
                    };
                })
            };
        });
}

module.exports = {
    GAMES: GAMES,
    listActiveMatches: listActiveMatches,
    createMatch: createMatch,
    getMatch: getMatch,
    endMatch: endMatch,
    handleUpgrade: handleUpgrade
};
