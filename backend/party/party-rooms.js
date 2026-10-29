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
 *
 * مراحل العرض: lobby (الضيوف بالصالة وصاحبة الحفلة بغرفتها) ← entrance (مشي
 * تلقائي: walk = هدف كل لاعب) ← reveal (الستارة) ← dance ← gather (تجمّع) ← wishes
 * (التهاني) ← cakeWalk ← cake (تنتظر صاحبة الحفلة تقص) ← celebrate ← photo ← free. السيرفر يحصر
 * الحركة بمنطقة الدور والمرحلة، ويخفي صاحبة الحفلة عن الضيوف قبل الافتتاح.
 */
'use strict';

var crypto = require('crypto');

var HX = 31, HZ = 47;           // حدود الحركة داخل القاعة (القاعة 64×96م)
var MAX_SPEED = 14;             // م/ث — أسرع من الجري بالواجهة بهامش
var SPEED_SLACK = 0.5;          // م — تذبذب الشبكة
var MIN_MOVE_GAP_MS = 60;       // أقل فاصل بين رسائل الحركة من نفس اللاعب
var MAX_ANIM = 4;                // 0 وقوف · 1 مشي · 2 رقص · 3 تلويح · 4 تصفيق (5+ للدفعة 4)
// مناطق الحركة [xmin, xmax, zmin, zmax]
var ZONES = {
    lounge: [-15, 15, 50.5, 69],      // صالة الضيوف خلف المدخل
    girl: [-9, 9, -67, -50.5],        // غرفة صاحبة الحفلة خلف الجدار الشمالي
    hall: [-31, 31, -47, 47],
    nostage: [-31, 31, -31, 47]       // الضيوف وقت الرقص: المنصة والدرج ممنوعين
};
var GIRL_SPOT = [0, -36.5], CAKE_SPOT = [0, -37.6], PHOTO_SPOT = [0, -29.6];
var PHASES = ['lobby', 'entrance', 'reveal', 'dance', 'gather', 'wishes', 'cakeWalk', 'cake', 'celebrate', 'photo', 'free'];
// مدد ثابتة (ms) — dance و wishes من إعدادات المذيع، cake و free بدون وقت
var FIXED_MS = { entrance: 40000, reveal: 12000, gather: 12000, cakeWalk: 10000, celebrate: 30000, photo: 16000 };
// مراحل مشي تلقائي: نوع الأهداف لكل مرحلة
var WALK_KIND = { entrance: 'grid', gather: 'grid', cakeWalk: 'cake', photo: 'photo' };
var AUTO = { entrance: 1, reveal: 1, gather: 1, cakeWalk: 1, photo: 1 };  // الحركة اليدوية ممنوعة
var MAX_WISH = 200;
// فلتر بسيط — الكلمة تنستبدل بنجوم (المذيع يقدر يخفي أي رسالة)
var BAD_WORDS = ['كلب', 'حمار', 'حيوان', 'زق', 'قحب', 'شرموط', 'منيوك', 'خول', 'fuck', 'shit', 'bitch'];
var GIRL_GRACE_MS = 30 * 1000;  // صاحبة الحفلة غايبة أقل من كذا (تنقّل بين الصفحات/انقطاع قصير) ← مكانها محجوز لها
var STALE_MS = 2 * 60 * 1000;    // ضيف غايب أكثر من كذا ← مكانه ينعطى لضيف جديد لو الحفلة مكتملة
var NEAR_R = 10;                // م — اللي أقرب من كذا يوصل 8 مرات/ث، والأبعد أبطأ (party-server)

function rid(n) { return crypto.randomBytes(n || 12).toString('hex'); }
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim(); }
function r2(v) { return Math.round(v * 100) / 100; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fail(err) { return { ok: false, err: err }; }
function inZone(z, x, y) { return [clamp(x, z[0], z[1]), clamp(y, z[2], z[3])]; }
// مكان رقم i بالشبكة قدام المنصة (24 عمود × صفوف بمسافة 1.2م، الصف الأول الأقرب للمنصة)
// صفوف الصورة الجماعية ورا صاحبة الحفلة: 14 بالصف (عرض الكادر)، كل صف بالنص حسب عدده،
// والصفوف متبادلة بنص مسافة عشان الرؤوس ما تغطي بعض. اللي يدخل متأخر (i >= total) بصف جديد ورا.
var PHOTO_ROW = 14, PHOTO_DX = 1.1;
function photoSlot(i, total) {
    var row, col, cnt, full = Math.ceil(total / PHOTO_ROW);
    if (i < total) { row = Math.floor(i / PHOTO_ROW); col = i % PHOTO_ROW; cnt = Math.min(PHOTO_ROW, total - row * PHOTO_ROW); }
    else { row = full + Math.floor((i - total) / PHOTO_ROW); col = (i - total) % PHOTO_ROW; cnt = PHOTO_ROW; }
    return [r2((col - (cnt - 1) / 2 + (row % 2 ? .5 : 0)) * PHOTO_DX), r2(PHOTO_SPOT[1] + 1.5 + row * 1.2)];
}
function cleanWish(t) {
    var s = String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    s = Array.from(s).slice(0, MAX_WISH).join('').trim();
    BAD_WORDS.forEach(function (w) { s = s.split(w).join('***'); });
    return s;
}
function gridSlot(i) { return [r2(-13.8 + (i % 24) * 1.2), r2(-30.5 + Math.floor(i / 24) * 1.2)]; }
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
        place(room, p);
        room.players.push(p);
        return p;
    }
    function zoneOf(room, p) {
        if (room.phase === 'lobby') return p.role === 'girl' ? ZONES.girl : ZONES.lounge;
        return p.role === 'girl' ? ZONES.hall : ZONES.nostage;
    }
    function rnd(a, b) { return r2(a + Math.random() * (b - a)); }
    // مكان اللاعب حسب المرحلة (للداخل جديد)
    function place(room, p) {
        var ph = room.phase;
        if (ph === 'lobby') {
            if (p.role === 'girl') { p.x = rnd(-3, 3); p.z = rnd(-62, -56); p.ry = 0; }
            else { p.x = rnd(-10, 10); p.z = rnd(54, 64); p.ry = Math.PI; }
        } else if (WALK_KIND[ph] || ph === 'reveal') {
            var t = targetFor(room, p, WALK_KIND[ph] || 'grid'); room.walk[p.n] = t; p.x = t[0]; p.z = t[1]; p.ry = facing(ph, p);
        } else if (p.role === 'girl') { var gs = (ph === 'cake' || ph === 'celebrate') ? CAKE_SPOT : ph === 'free' && room.photoDone ? PHOTO_SPOT : GIRL_SPOT; p.x = gs[0]; p.z = gs[1]; p.ry = facing(ph, p); }
        else { p.x = rnd(-12, 12); p.z = rnd(-24, -14); p.ry = Math.PI; }
    }
    function targetFor(room, p, kind) {
        kind = kind || 'grid';
        if (p.role === 'girl') return (kind === 'cake' ? CAKE_SPOT : kind === 'photo' ? PHOTO_SPOT : GIRL_SPOT).slice();
        return kind === 'photo' ? photoSlot(room.slotN++, room.slotTotal) : gridSlot(room.slotN++);
    }
    // اتجاه الوقوف: الضيوف يطالعون المنصة (π)، وصاحبة الحفلة تطالع الضيوف (0) إلا عند الكيكة والصورة
    function facing(ph, p) { return p.role === 'girl' && !(ph === 'cakeWalk' || ph === 'cake' || ph === 'celebrate' || ph === 'photo') ? 0 : r2(Math.PI); }
    function setPhase(room, ph) {
        var t = now(); room.phase = ph; room.phaseAt = t;
        var ms = ph === 'dance' ? room.danceSec * 1000 : ph === 'wishes' ? room.wishesSec * 1000 : (FIXED_MS[ph] || 0);
        room.phaseUntil = ms ? t + ms : 0;
        var kind = WALK_KIND[ph];
        if (kind) {
            // أهداف المشي بترتيب n (نفس الترتيب عند الكل)
            room.walk = {}; room.slotN = 0;
            room.slotTotal = room.players.filter(function (p) { return p.role !== 'girl'; }).length;
            room.players.slice().sort(function (a, b) { return a.n - b.n; }).forEach(function (p) { room.walk[p.n] = targetFor(room, p, kind); });
        }
        if (ph === 'entrance') room.startedAt = t;
    }
    // الانتقال للمرحلة اللي بعد الحالية (مرة وحدة)
    function advance(room) {
        var i = PHASES.indexOf(room.phase);
        if (i < 0 || i >= PHASES.length - 1) return false;
        var from = room.phase;
        if (WALK_KIND[from]) {
            // نهاية المشي: الكل على هدفه وبالاتجاه الصح
            room.players.forEach(function (p) {
                var t = room.walk[p.n] || targetFor(room, p, WALK_KIND[from]);
                p.x = t[0]; p.z = t[1]; p.ry = facing(from, p); p.a = 0; p.dirty = true; p.ver++;
            });
        }
        if (from === 'cake') room.cakeCut = true;   // تخطي المذيع للكيكة = قص
        if (from === 'photo') room.photoDone = true;
        setPhase(room, PHASES[i + 1]);
        return true;
    }
    function hiddenFor(room, viewer, p) { return p.role === 'girl' && viewer && viewer.role === 'guest' && (room.phase === 'lobby' || room.phase === 'entrance'); }

    function welcome(p) { return { ok: true, id: p.id, key: p.key, n: p.n, role: p.role, kind: p.kind }; }

    function createRoom(o) {
        if (Object.keys(rooms).length >= maxRooms) return fail('busy');
        var code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms[code]);
        var ds = Math.round(Number(o && o.danceSec)); ds = isFinite(ds) && ds > 0 ? clamp(ds, 60, 900) : 300;
        var ws = Math.round(Number(o && o.wishesSec)); ws = isFinite(ws) && ws > 0 ? clamp(ws, 120, 1200) : 480;
        rooms[code] = { code: code, token: rid(16), girlKey: rid(16), girlName: cleanName(o && o.girlName), players: [], nextN: 1, createdAt: now(),
            danceSec: ds, wishesSec: ws, phase: 'lobby', phaseAt: now(), phaseUntil: 0, walk: {}, slotN: 0, slotTotal: 0,
            wishes: [], wishSeq: 1, wishCur: -1, cakeCut: false, photoDone: false, startedAt: 0 };
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
            if (cur && (cur.online || now() - (cur.offlineSince || 0) < GIRL_GRACE_MS)) return fail('girl-taken');
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
        if (AUTO[room.phase]) return fail('auto');
        var t = now(), gap = t - p.lastMoveAt;
        if (gap < MIN_MOVE_GAP_MS) return fail('flood');
        var zc = inZone(zoneOf(room, p), x, z); x = zc[0]; z = zc[1]; // المناطق فيها حدود القاعة والغرف
        if (a > MAX_ANIM || a < 0) a = 0;
        var dist = Math.hypot(x - p.x, z - p.z);
        p.lastMoveAt = t;
        if (dist > MAX_SPEED * Math.min(gap, 2000) / 1000 + SPEED_SLACK) return fail('speed');
        p.x = r2(x); p.z = r2(z); p.ry = r2(ry); p.a = Math.round(a);
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
            if (hiddenFor(room, me, p)) return;
            if (seen.get(p.n) === p.ver) return;
            if (me && !farTick && Math.hypot(p.x - me.x, p.z - me.z) > NEAR_R) return;
            seen.set(p.n, p.ver); out.push(stateRow(p));
        });
        return out;
    }

    function fullState(code, viewerId) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var me = viewerId ? playerOf(room, viewerId) : null;
        return room.players.filter(function (p) { return !hiddenFor(room, me, p); }).map(stateRow);
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

    function phaseOf(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var walk = null;
        if (WALK_KIND[room.phase] || room.phase === 'reveal') walk = room.walk;
        return { ok: true, p: room.phase, at: room.phaseAt, until: room.phaseUntil, walk: walk, cut: room.cakeCut };
    }
    function start(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (room.phase !== 'lobby') return fail('phase');
        advance(room); return { ok: true };
    }
    function skip(code, from) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (room.phase !== from || room.phase === 'free') return fail('phase');
        advance(room); return { ok: true };
    }
    function tick(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (room.phaseUntil && now() >= room.phaseUntil) return { ok: true, changed: advance(room) };
        return { ok: true, changed: false };
    }

    // ---- التهاني ----
    function visibleWishes(room) { return room.wishes.filter(function (w) { return !w.hidden; }); }
    function addWish(code, id, text) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p) return fail('noplayer');
        if (room.phase !== 'wishes') return fail('phase');
        if (p.role !== 'guest') return fail('role');
        var t = cleanWish(text); if (!t) return fail('empty');
        var w = room.wishes.find(function (x) { return x.pid === p.id; });
        if (w) { if (w.shown) return fail('shown'); w.text = t; w.name = p.name; return { ok: true, wishId: w.id }; }
        w = { id: room.wishSeq++, pid: p.id, name: p.name, text: t, hidden: false, shown: false };
        room.wishes.push(w);
        return { ok: true, wishId: w.id };
    }
    function hideWish(code, wishId, hidden) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var w = room.wishes.find(function (x) { return x.id === Number(wishId); }); if (!w) return fail('nowish');
        w.hidden = !!hidden; return { ok: true };
    }
    function canLead(room, byId) { if (byId === 'host') return true; var p = playerOf(room, byId); return !!(p && p.role === 'girl'); }
    function wishesState(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var vis = visibleWishes(room), w = room.wishCur >= 0 ? room.wishes[room.wishCur] : null;
        var shown = vis.filter(function (x) { return x.shown; }).length;
        return { ok: true, cur: w && !w.hidden ? { i: shown, name: w.name, text: w.text } : null, shown: shown, total: vis.length };
    }
    function nextWish(code, byId) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (!canLead(room, byId)) return fail('role');
        if (room.phase !== 'wishes') return fail('phase');
        for (var i = room.wishCur + 1; i < room.wishes.length; i++) {
            var w = room.wishes[i];
            if (!w.hidden) { room.wishCur = i; w.shown = true; return { ok: true, cur: wishesState(code).cur, done: false }; }
        }
        // ما فيه رسالة جاية: ننتقل للكيكة
        advance(room);
        return { ok: true, cur: null, done: true };
    }
    function wishList(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return { ok: true, items: room.wishes.map(function (w) { return { id: w.id, name: w.name, text: w.text, hidden: w.hidden, shown: w.shown }; }) };
    }
    function cut(code, byId) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (!canLead(room, byId)) return fail('role');
        if (room.phase !== 'cake') return fail('phase');
        advance(room); return { ok: true };
    }
    // النقاط: بس الحسابات الموثّقة بتيك توك (الضيف السريع ما ينرسل اسمه أبداً)
    function pointsList(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var players = [];
        room.players.forEach(function (p) { var id = pointsId(p); if (id) players.push({ id: id, name: p.name }); });
        return { ok: true, players: players, durationMs: room.startedAt ? now() - room.startedAt : 0 };
    }

    function closeRoom(code) { if (!rooms[code]) return fail('nocode'); delete rooms[code]; return { ok: true }; }
    function getRoom(code) { return rooms[code] || null; }

    return {
        createRoom: createRoom, hostResume: hostResume, join: join, resume: resume, leave: leave,
        move: move, takeDelta: takeDelta, deltaFor: deltaFor, fullState: fullState, roster: roster,
        closeRoom: closeRoom, rooms: function () { return Object.keys(rooms); },
        getRoom: getRoom, pointsId: pointsId, phaseOf: phaseOf, start: start, skip: skip, tick: tick,
        addWish: addWish, hideWish: hideWish, nextWish: nextWish, wishesState: wishesState, wishList: wishList, cut: cut, pointsList: pointsList
    };
}

module.exports = { createRoomManager: createRoomManager, packRows: packRows };
