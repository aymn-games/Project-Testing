/**
 * «غرفة الجوالات» — اللعب بدون بث.
 *
 * صاحب الصلاحية (الأدمن، أو حساب منحه الأدمن صلاحية 'phone_rooms' من
 * admin.html) يفتح غرفة برقم من 4 أرقام (نطاق 'phone' بـ
 * rooms/room-code-ranges.js). اللاعبين يدخلونها من جوالاتهم بالباركود أو
 * بكتابة الرقم (phone/index.html)، وكل اللي يرسلونه (تعليق، هدية، لايك،
 * متابعة) يوصل لصفحة اللعبة عند صاحب الغرفة بنفس شكل أحداث بث تيك توك
 * بالضبط (platforms/phone/phone-connector.js) — فكل الألعاب تشتغل بدون أي
 * تعديل فيها، وكأن اللاعبين مشاهدين في بث.
 *
 * الغرفة وحدة لكل حساب، تبقى مفتوحة وهو يتنقل بين الألعاب (صفحة اللعبة
 * تنقفل وتنفتح، واللاعبين يبقون بالغرفة)، وتنقفل لما يقفلها بنفسه أو تبقى
 * بدون أي نشاط IDLE_MS. كل شي بالذاكرة فقط (مثل باقي الغرف).
 *
 * نقاط المنصة ما تنحسب للاعبين هنا: معرّفاتهم 'phone:<جهاز>' مو 'tiktok:'
 * (auth/auth-client.js → reportMatchPoints يتجاهلها) — اللعب بدون بث ما
 * يصير طريقة لجمع النقاط.
 */
'use strict';

var CodeRanges = require('../rooms/room-code-ranges');

var IDLE_MS = 6 * 60 * 60 * 1000;   // الغرفة تنقفل بعد 6 ساعات بدون أي نشاط
var MAX_PLAYERS = 200;
var NAME_MAX = 24;
var TEXT_MAX = 150;
var MAX_LIKES_PER_MSG = 30;
var MAX_GIFT_COUNT = 99;

var _rooms = {};      // code -> room
var _byOwner = {};    // ownerId -> code
var _now = function () { return Date.now(); };

function canHost(user) {
    if (!user) return false;
    if (user.role === 'admin' || user.is_super_admin) return true;
    var p = user.permissions;
    if (typeof p === 'string') { try { p = JSON.parse(p || '{}'); } catch (e) { p = {}; } }
    return Boolean(p && p.phone_rooms);
}

function ownerName(user) {
    return String(user.display_name || user.tiktok_display_name || user.username || '').slice(0, 40);
}

function touch(room) { room.lastActive = _now(); }

function playerList(room) {
    return Object.keys(room.players).map(function (pid) {
        var p = room.players[pid];
        return { id: p.id, name: p.name, online: p.conns > 0, joinedAt: p.joinedAt };
    }).sort(function (a, b) { return a.joinedAt - b.joinedAt; });
}

function publicRoom(room) {
    if (!room) return null;
    return {
        code: room.code,
        createdAt: room.createdAt,
        hostOnline: room.hosts.length > 0,
        players: playerList(room)
    };
}

/** يرسل حدث لكل صفحات اللعبة المتصلة بالغرفة (عادة وحدة). */
function emitToHosts(room, kind, data) {
    room.hosts.slice().forEach(function (h) {
        try { h(kind, data); } catch (e) { /* صفحة وحدة ما توقف الباقي */ }
    });
}

var _listeners = [];  // fn(code, event) — خادم الجوالات يسمع (live/kicked/closed)
function notify(code, event) {
    _listeners.forEach(function (fn) { try { fn(code, event); } catch (e) {} });
}

/** يفتح غرفة لصاحب الصلاحية (أو يرجع غرفته المفتوحة). */
function openRoom(user) {
    if (!canHost(user)) return { success: false, error: 'no_permission' };
    var existing = _byOwner[user.id] && _rooms[_byOwner[user.id]];
    if (existing) { touch(existing); existing.ownerName = ownerName(user) || existing.ownerName; return { success: true, room: publicRoom(existing) }; }
    var code = CodeRanges.allocate('phone', function (c) { return Boolean(_rooms[c]); });
    if (!code) return { success: false, error: 'rooms_full' };
    var room = {
        code: code, ownerId: user.id, ownerName: ownerName(user),
        createdAt: _now(), lastActive: _now(),
        players: {}, hosts: [], seq: 0
    };
    _rooms[code] = room;
    _byOwner[user.id] = code;
    return { success: true, room: publicRoom(room) };
}

function getRoomOf(user) {
    var room = user && _byOwner[user.id] && _rooms[_byOwner[user.id]];
    return room ? publicRoom(room) : null;
}

function closeRoomByCode(code, reason) {
    var room = _rooms[code];
    if (!room) return false;
    delete _rooms[code];
    if (_byOwner[room.ownerId] === code) delete _byOwner[room.ownerId];
    emitToHosts(room, 'closed', {});
    room.hosts = [];
    notify(code, { t: 'closed', reason: reason || 'closed' });
    return true;
}

function closeRoom(user) {
    var code = user && _byOwner[user.id];
    if (!code) return { success: false, error: 'no_room' };
    closeRoomByCode(code, 'closed');
    return { success: true };
}

function kickPlayer(user, playerId) {
    var room = user && _byOwner[user.id] && _rooms[_byOwner[user.id]];
    if (!room) return { success: false, error: 'no_room' };
    if (!room.players[playerId]) return { success: false, error: 'not_found' };
    delete room.players[playerId];
    notify(room.code, { t: 'kicked', playerId: playerId });
    return { success: true };
}

function hasRoom(code) {
    return Object.prototype.hasOwnProperty.call(_rooms, String(code || ''));
}

/** معلومات للجوال قبل الدخول (اسم صاحب الغرفة). */
function roomInfo(code) {
    var room = _rooms[String(code || '')];
    return room ? { code: room.code, host: room.ownerName, live: room.hosts.length > 0 } : null;
}

function cleanName(v) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
function cleanText(v) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TEXT_MAX);
}

/**
 * جوال يدخل الغرفة. dev = معرّف ثابت للجهاز (يتولد بالجوال ويبقى بـ
 * localStorage) — نفس الجهاز يرجع لنفس اللاعب بعد انقطاع أو تحديث الصفحة.
 * @returns {{ok: true, player, room}|{ok: false, err: string}}
 */
function joinRoom(code, dev, name) {
    var room = _rooms[String(code || '')];
    if (!room) return { ok: false, err: 'no_room' };
    dev = String(dev || '');
    if (!/^[a-z0-9]{8,32}$/.test(dev)) return { ok: false, err: 'bad_device' };
    var nm = cleanName(name);
    if (nm.length < 2) return { ok: false, err: 'bad_name' };
    var pid = 'phone:' + dev;
    var p = room.players[pid];
    if (!p) {
        if (Object.keys(room.players).length >= MAX_PLAYERS) return { ok: false, err: 'full' };
        p = room.players[pid] = { id: pid, name: nm, conns: 0, joinedAt: _now() };
    }
    // اسم مكرر بجهاز ثاني ← رقم بآخره، عشان الستريمر يفرّق بينهم باللعبة
    var taken = Object.keys(room.players).some(function (k) { return k !== pid && room.players[k].name === nm; });
    if (taken) {
        var n = 2;
        while (Object.keys(room.players).some(function (k) { return k !== pid && room.players[k].name === nm + ' ' + n; })) n++;
        nm = nm + ' ' + n;
    }
    p.name = nm;
    touch(room);
    return { ok: true, player: { id: p.id, name: p.name }, room: roomInfo(room.code) };
}

function setOnline(code, playerId, delta) {
    var room = _rooms[code];
    var p = room && room.players[playerId];
    if (p) p.conns = Math.max(0, p.conns + delta);
}

function isMember(code, playerId) {
    var room = _rooms[code];
    return Boolean(room && room.players[playerId]);
}

/**
 * حدث من جوال لاعب ← صفحة اللعبة (بشكل أحداث موصّل البث).
 * kind: 'chat' {text} | 'like' {count} | 'gift' {gift: {id, name, coins}, count} | 'follow'
 */
function playerAction(code, playerId, kind, data) {
    var room = _rooms[code];
    var p = room && room.players[playerId];
    if (!p) return { ok: false, err: 'not_member' };
    touch(room);
    data = data || {};
    var base = { id: p.id, name: p.name };
    if (kind === 'chat') {
        var text = cleanText(data.text);
        if (!text) return { ok: false, err: 'empty' };
        emitToHosts(room, 'comment', { id: base.id, name: base.name, text: text, isFollower: true });
        return { ok: true, live: room.hosts.length > 0 };
    }
    if (kind === 'like') {
        var count = Math.max(1, Math.min(MAX_LIKES_PER_MSG, Math.floor(Number(data.count) || 1)));
        emitToHosts(room, 'like', { id: base.id, name: base.name, count: count });
        return { ok: true, live: room.hosts.length > 0 };
    }
    if (kind === 'gift') {
        var g = data.gift || {};
        var gid = String(g.id || '').toLowerCase();
        var coins = Math.floor(Number(g.coins) || 0);
        var gname = cleanText(g.name).slice(0, 60);
        if (!/^[a-z0-9-]{1,40}$/.test(gid) || coins < 1 || coins > 100000 || !gname) return { ok: false, err: 'bad_gift' };
        var repeat = Math.max(1, Math.min(MAX_GIFT_COUNT, Math.floor(Number(data.count) || 1)));
        emitToHosts(room, 'gift', { id: base.id, name: base.name, giftName: gname, giftValue: coins, repeatCount: repeat, giftId: null });
        return { ok: true, live: room.hosts.length > 0 };
    }
    if (kind === 'follow') {
        emitToHosts(room, 'follow', { id: base.id, name: base.name });
        return { ok: true, live: room.hosts.length > 0 };
    }
    return { ok: false, err: 'bad_kind' };
}

/**
 * صفحة لعبة عند صاحب الغرفة تتصل (platforms/phone/phone-connector.js).
 * @param {Object} user - مستخدم الجلسة
 * @param {string} code - رقم الغرفة من الاتصال المحفوظ
 * @param {function(kind, data)} onEvent
 * @returns {{ok: true, detach: function}|{ok: false, err: string}}
 */
function attachHost(user, code, onEvent) {
    if (!canHost(user)) return { ok: false, err: 'no_permission' };
    var room = _rooms[String(code || '')];
    if (!room) return { ok: false, err: 'no_room' };
    if (room.ownerId !== user.id) return { ok: false, err: 'not_owner' };
    var wasLive = room.hosts.length > 0;
    room.hosts.push(onEvent);
    touch(room);
    if (!wasLive) notify(room.code, { t: 'live', on: true });
    var detached = false;
    return {
        ok: true,
        detach: function () {
            if (detached) return;
            detached = true;
            var i = room.hosts.indexOf(onEvent);
            if (i >= 0) room.hosts.splice(i, 1);
            touch(room);
            if (!room.hosts.length && _rooms[room.code] === room) notify(room.code, { t: 'live', on: false });
        }
    };
}

function sweep() {
    var t = _now();
    Object.keys(_rooms).forEach(function (code) {
        var room = _rooms[code];
        var anyoneOnline = room.hosts.length > 0 || Object.keys(room.players).some(function (k) { return room.players[k].conns > 0; });
        if (!anyoneOnline && t - room.lastActive > IDLE_MS) closeRoomByCode(code, 'expired');
    });
}
var _timer = setInterval(sweep, 60 * 1000);
if (_timer.unref) _timer.unref();

module.exports = {
    canHost: canHost,
    openRoom: openRoom,
    getRoomOf: getRoomOf,
    closeRoom: closeRoom,
    kickPlayer: kickPlayer,
    hasRoom: hasRoom,
    roomInfo: roomInfo,
    joinRoom: joinRoom,
    setOnline: setOnline,
    isMember: isMember,
    playerAction: playerAction,
    attachHost: attachHost,
    onRoomEvent: function (fn) { _listeners.push(fn); },
    sweep: sweep,
    _reset: function () { _rooms = {}; _byOwner = {}; },
    _setNow: function (fn) { _now = fn || function () { return Date.now(); }; }
};
