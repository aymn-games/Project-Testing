/**
 * كود نيمز — رقم دخول (4 أرقام) لكل سباي ماستر، مرتبط بنظام الغرف.
 *
 * شاشة اللعب (حساب الستريمر) تطلب رقم لكل فريق بغرفتها. الرقم يطلع بشاشة
 * الباركود بخط كبير، والسباي ماستر يكتبه بخانة «عندك رقم غرفة؟» بالرئيسية
 * (js/agp-join-room.js) فينفتح له spymaster.html على فريقه مباشرة — نفس اللي
 * يسويه مسح الباركود:
 *   - فيه سباي ماستر معيّن بحساب تيك توك (خانة خاصة من spy-slots-service.js)
 *     ← الرابط فيه الخانة، والخادم يفتح الخريطة لصاحب الحساب فقط.
 *   - ما فيه ← رابط الطلبات العام مع الفريق مختار، والمذيع يقبل الطلب.
 * يعني الرقم ما يعطي أي صلاحية زيادة عن الباركود اللي ظاهر بالبث أصلاً.
 *
 * الأرقام من نطاق «codenames» (rooms/room-code-ranges.js). نفس الغرفة والفريق
 * ياخذون نفس الرقم طول الجلسة. الشاشة تجدد التسجيل كل كم دقيقة (نبضة)، ولو
 * وقفت (المذيع قفل الصفحة) الرقم ينتهي بعد CODE_TTL_MS ويرجع للنطاق.
 *
 * التخزين بالذاكرة فقط، ما يلمس قاعدة البيانات.
 */

'use strict';

var CodeRanges = require('../rooms/room-code-ranges');

var CODE_TTL_MS = 20 * 60 * 1000;
var MAX_ROOMS = 40; // كل غرفة تاخذ رقمين، والنطاق 100 رقم

var _rooms = {}; // room -> { ownerId, updatedAt, teams: { 1: {code, slot, name}, 2: {...} } }
var _codes = {}; // code -> { room, team }

function now() { return Date.now(); }

function isValidId(s, max) {
    return typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);
}

function canHostGames(user) {
    if (!user) return false;
    var p = user.permissions || {};
    return user.role === 'admin' || Boolean(user.is_streamer) || Boolean(p.can_run_games) || Boolean(p.full_game_access);
}

function dropRoom(room) {
    var r = _rooms[room];
    if (!r) return;
    [1, 2].forEach(function (t) { if (r.teams[t]) delete _codes[r.teams[t].code]; });
    delete _rooms[room];
}

function sweep() {
    var t = now();
    Object.keys(_rooms).forEach(function (room) {
        if (t - _rooms[room].updatedAt > CODE_TTL_MS) dropRoom(room);
    });
}

/**
 * تسجيل/تجديد أرقام غرفة. teams: [{team:1|2, slot?:id, name?}] (فريق أو فريقين).
 * ترجع {ok:true, codes:{1:'15xx', 2:'15yy'}} أو {ok:false, error}.
 */
function register(user, room, teams) {
    if (!canHostGames(user)) return { ok: false, error: 'forbidden' };
    if (!isValidId(room, 40) || !Array.isArray(teams) || !teams.length || teams.length > 2) return { ok: false, error: 'invalid_request' };
    var clean = {};
    for (var i = 0; i < teams.length; i++) {
        var x = teams[i] || {};
        var team = Number(x.team);
        if ((team !== 1 && team !== 2) || clean[team]) return { ok: false, error: 'invalid_request' };
        var slot = x.slot == null || x.slot === '' ? null : x.slot;
        if (slot !== null && !isValidId(slot, 40)) return { ok: false, error: 'invalid_request' };
        clean[team] = { slot: slot, name: String(x.name || '').slice(0, 40) };
    }
    sweep();
    var r = _rooms[room];
    if (r && r.ownerId !== user.id) return { ok: false, error: 'forbidden' };
    if (!r) {
        if (Object.keys(_rooms).length >= MAX_ROOMS) return { ok: false, error: 'busy' };
        r = _rooms[room] = { ownerId: user.id, updatedAt: now(), teams: {} };
    }
    var codes = {};
    for (var t = 1; t <= 2; t++) {
        if (!clean[t]) { if (r.teams[t]) codes[t] = r.teams[t].code; continue; }
        var code = r.teams[t] ? r.teams[t].code : CodeRanges.allocate('codenames', function (c) { return !!_codes[c]; });
        if (!code) {
            if (!Object.keys(r.teams).length) delete _rooms[room];
            return { ok: false, error: 'busy' };
        }
        _codes[code] = { room: room, team: t };
        r.teams[t] = { code: code, slot: clean[t].slot, name: clean[t].name };
        codes[t] = code;
    }
    r.updatedAt = now();
    return { ok: true, codes: codes };
}

/** الرقم ← {room, team, slot, name} أو null لو الرقم مو موجود أو انتهى. */
function resolve(code) {
    var c = _codes[String(code == null ? '' : code)];
    if (!c) return null;
    var r = _rooms[c.room];
    if (!r || now() - r.updatedAt > CODE_TTL_MS) { if (r) dropRoom(c.room); return null; }
    var t = r.teams[c.team];
    return { room: c.room, team: c.team, slot: t.slot, name: t.name };
}

/** لـ rooms/room-lookup-service.js: false للغرفة المنتهية. */
function hasRoom(code) {
    return !!resolve(code);
}

module.exports = {
    register: register,
    resolve: resolve,
    hasRoom: hasRoom,
    CODE_TTL_MS: CODE_TTL_MS,
    // للاختبار
    _reset: function () { _rooms = {}; _codes = {}; }
};
