/**
 * «حفلة عيد الميلاد» — منطق الغرف (نقي، بدون اتصالات).
 *
 * يملك حالة كل حفلة: الكود، والأسرار (توكن المذيع ومفتاح صاحبة الحفلة)،
 * واللاعبين بأدوارهم ونوع دخولهم، ومواقعهم بالقاعة. party-server.js هو
 * اللي يوصّل هذا بالـ WebSocket — هنا ما فيه أي socket عشان ينختبر بسهولة.
 *
 * الأدوار: guest (ضيف) · girl (صاحبة الحفلة، وحدة بس لكل حفلة).
 * نوع الدخول: quick (اسم فقط) · member (حساب موقع صالح — أو صاحبة الحفلة دائماً).
 * كل دالة ترجع { ok:true, ... } أو { ok:false, err } — ما ترمي أخطاء للخادم.
 */
'use strict';

var crypto = require('crypto');

var HX = 31, HZ = 47;           // حدود الحركة داخل القاعة (القاعة 64×96م)
var MAX_SPEED = 14;             // م/ث — أسرع من الجري بالواجهة بهامش
var SPEED_SLACK = 0.5;          // م — تذبذب الشبكة
var MIN_MOVE_GAP_MS = 60;       // أقل فاصل بين رسائل الحركة من نفس اللاعب
var MAX_ANIM = 15;
var STALE_MS = 2 * 60 * 1000;    // ضيف غايب أكثر من كذا ← مكانه ينعطى لضيف جديد لو الحفلة مكتملة
var NEAR_R = 10;                // م — اللي أقرب من كذا يوصل 8 مرات/ث، والأبعد أبطأ (party-server)

function rid(n) { return crypto.randomBytes(n || 12).toString('hex'); }
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim(); }
function r2(v) { return Math.round(v * 100) / 100; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fail(err) { return { ok: false, err: err }; }
// صيغة الإرسال المضغوطة: صفوف [n, x, z, ry, a] ← مصفوفة مسطّحة بأعداد صحيحة (سم وسنتي-راديان)
function packRows(rows) { var out = []; rows.forEach(function (r) { out.push(r[0], Math.round(r[1] * 100), Math.round(r[2] * 100), Math.round(r[3] * 100), r[4]); }); return out; }

function createRoomManager(opts) {
    opts = opts || {};
    var maxRooms = opts.maxRooms || 2, maxGuests = opts.maxGuests || 100;
    var now = opts.now || Date.now;
    var validateSession = opts.validateSession || function () { return null; };
    var rooms = {}; // code -> room

    function playerOf(room, id) { return room.players.find(function (p) { return p.id === id; }); }
    function guestCount(room) { return room.players.filter(function (p) { return p.role === 'guest'; }).length; }

    function addPlayer(room, name, role, kind, user) {
        var p = {
            id: rid(8), key: rid(16), n: room.nextN++, name: name, role: role, kind: kind,
            user: user || null, online: true,
            // مكان البداية: منطقة المدخل
            x: r2(-8 + Math.random() * 16), z: r2(38 + Math.random() * 6), ry: Math.PI, a: 0,
            lastMoveAt: now(), dirty: true, ver: 1
        };
        room.players.push(p);
        return p;
    }
    function welcome(p) { return { ok: true, id: p.id, key: p.key, n: p.n, role: p.role, kind: p.kind }; }

    function createRoom(o) {
        if (Object.keys(rooms).length >= maxRooms) return fail('busy');
        var code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms[code]);
        rooms[code] = { code: code, token: rid(16), girlKey: rid(16), girlName: cleanName(o && o.girlName), players: [], nextN: 1, createdAt: now() };
        return { ok: true, code: code, token: rooms[code].token, girlKey: rooms[code].girlKey };
    }

    function hostResume(code, token) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return room.token === token ? { ok: true } : fail('token');
    }

    function join(code, o) {
        var room = rooms[code]; if (!room) return fail('nocode');
        o = o || {};
        var user = null;
        if (o.auth) { user = validateSession(String(o.auth)); if (!user) return fail('auth'); }
        if (o.girlKey != null) {
            if (o.girlKey !== room.girlKey) return fail('girl-key');
            var cur = room.players.find(function (p) { return p.role === 'girl'; });
            if (cur && cur.online) return fail('girl-taken');
            if (cur) {
                // جوالها الأول طفى/ضاع: نفس الشخصية تنتقل للجهاز الجديد بمفتاح جديد
                cur.key = rid(16); cur.online = true; cur.dirty = true; cur.ver++;
                if (o.name && cleanName(o.name)) cur.name = cleanName(o.name);
                return welcome(cur);
            }
            var gname = cleanName(o.name) || room.girlName || (user && cleanName(user.username));
            if (!gname) return fail('name');
            return welcome(addPlayer(room, gname, 'girl', 'member', user));
        }
        if (guestCount(room) >= maxGuests) {
            // مكتملة: نشيل أقدم ضيف غايب من دقيقتين أو أكثر (اللي طلع وما رجع)
            var t = now(), stale = room.players.filter(function (p) { return p.role === 'guest' && !p.online && t - p.offlineSince >= STALE_MS; })
                .sort(function (a, b) { return a.offlineSince - b.offlineSince; })[0];
            if (!stale) return fail('full');
            room.players.splice(room.players.indexOf(stale), 1);
        }
        var name = cleanName(o.name) || (user ? cleanName(user.username) : '');
        if (!name) return fail('name');
        return welcome(addPlayer(room, name, 'guest', user ? 'member' : 'quick', user));
    }

    function resume(code, id, key) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id);
        if (!p || p.key !== key) return fail('resume');
        p.online = true; p.dirty = true; p.ver++; p.ver++;
        return welcome(p);
    }

    function leave(code, id) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p) return fail('noplayer');
        p.online = false; p.offlineSince = now();
        return { ok: true };
    }

    // الحركة: السيرفر ما يحرّك أحد — يقبل موضع اللاعب إذا كان معقول فقط
    function move(code, id, pos) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p) return fail('noplayer');
        if (!Array.isArray(pos) || pos.length < 4) return fail('bad');
        var x = Number(pos[0]), z = Number(pos[1]), ry = Number(pos[2]), a = Number(pos[3]);
        if (typeof pos[0] !== 'number' || typeof pos[1] !== 'number' || !isFinite(x) || !isFinite(z) || !isFinite(ry) || !isFinite(a)) return fail('bad');
        var t = now(), gap = t - p.lastMoveAt;
        if (gap < MIN_MOVE_GAP_MS) return fail('flood');
        x = clamp(x, -HX, HX); z = clamp(z, -HZ, HZ);
        var dist = Math.hypot(x - p.x, z - p.z);
        p.lastMoveAt = t;
        if (dist > MAX_SPEED * Math.min(gap, 2000) / 1000 + SPEED_SLACK) return fail('speed');
        p.x = r2(x); p.z = r2(z); p.ry = r2(ry); p.a = clamp(Math.round(a), 0, MAX_ANIM);
        p.dirty = true; p.ver++;
        return { ok: true };
    }

    function stateRow(p) { return [p.n, p.x, p.z, p.ry, p.a]; }

    function takeDelta(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var out = [];
        room.players.forEach(function (p) { if (p.dirty) { out.push(stateRow(p)); p.dirty = false; } });
        return out;
    }

    // دلتا خاصة بكل مستقبل: القريب منه (≤ 12م) يوصل كل دورة، والبعيد بس بدورات
    // farTick — يقلل الحمل بحفلة 100 لاعب لجزء صغير. seen = Map(n → آخر نسخة وصلته)
    // يملكها الخادم لكل اتصال. viewerId = null (شاشة عرض) ← كل التغييرات.
    function deltaFor(code, viewerId, seen, farTick) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var me = viewerId ? playerOf(room, viewerId) : null, out = [];
        room.players.forEach(function (p) {
            if (me && p === me) return;
            if (seen.get(p.n) === p.ver) return;
            if (me && !farTick && Math.hypot(p.x - me.x, p.z - me.z) > NEAR_R) return;
            seen.set(p.n, p.ver); out.push(stateRow(p));
        });
        return out;
    }

    function fullState(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return room.players.map(stateRow);
    }

    function roster(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return {
            ok: true, code: room.code, girlName: room.girlName,
            players: room.players.map(function (p) { return [p.n, p.name, p.role, p.kind, p.online ? 1 : 0]; })
        };
    }

    // للنقاط بالدفعات الجاية: بس الحسابات الموثّقة بتيك توك
    function pointsId(p) { return p && p.user && p.user.tiktok_verified && p.user.tiktok_username ? 'tiktok:' + p.user.tiktok_username : null; }

    function closeRoom(code) { if (!rooms[code]) return fail('nocode'); delete rooms[code]; return { ok: true }; }
    function getRoom(code) { return rooms[code] || null; }

    return {
        createRoom: createRoom, hostResume: hostResume, join: join, resume: resume, leave: leave,
        move: move, takeDelta: takeDelta, deltaFor: deltaFor, fullState: fullState, roster: roster,
        closeRoom: closeRoom, rooms: function () { return Object.keys(rooms); },
        getRoom: getRoom, pointsId: pointsId
    };
}

module.exports = { createRoomManager: createRoomManager, packRows: packRows };
