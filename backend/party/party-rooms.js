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
 * مراحل العرض: closed (قبل فتح الدخول — صاحبة الحفلة بس تقدر تدخل غرفتها) ← lobby (الضيوف
 * بالصالة وصاحبة الحفلة بغرفتها) ← entrance (مشي تلقائي: walk = هدف كل لاعب) ← reveal (الستارة)
 * ← dance ← gather (تجمّع) ← wishWrite (كتابة التهاني بوقت) ← wishes (العرض، بدون وقت) ← cakeWalk
 * ← cake (تنتظر القص، أو قص تلقائي) ← celebrate ← photo ← free ← ended. السيرفر يحصر الحركة
 * بمنطقة الدور والمرحلة، ويخفي صاحبة الحفلة عن الضيوف قبل الافتتاح.
 *
 * الجدول (schedule، يحدده المذيع ويعدّله): الانتقالات كلها على الساعة في tick() —
 * closed ← lobby عند openAt، و lobby ← entrance عند startAt بشرط صاحبة الحفلة متصلة،
 * والمراحل الموقّتة بمددها، ومن أي مرحلة ← ended عند endAt. غرفة بدون جدول (اختبارات)
 * تبدأ lobby وتنتظر «بدء» المذيع، بنفس المدد الافتراضية.
 */
'use strict';

var crypto = require('crypto');

var HX = 31, HZ = 47;           // حدود الحركة داخل القاعة (القاعة 64×96م)
var MAX_SPEED = 14;             // م/ث — أسرع من الجري بالواجهة بهامش
var SPEED_SLACK = 0.5;          // م — تذبذب الشبكة
var MIN_MOVE_GAP_MS = 60;       // أقل فاصل بين رسائل الحركة من نفس اللاعب
// 0 وقوف · 1 مشي · 2 سامبا · 3 تلويح · 4 تصفيق · 5 لفّة · 6 قفز · 7 قلب · 8 تمايل · 9 رقصة 2 · 10 رقصة 3
// · 11 تحية الأميرة (لصاحبة الحفلة بس). كل الضيوف (حتى السريع) ياخذون 0-10
var MAX_ANIM = 11, GUEST_ANIM = 10;
// الشكل: [نوع اللبس، لون اللبس، البشرة، لون الشعر، التسريحة، الإكسسوار، المؤثر، قبعة الحفلة] — -1 = الافتراضي (الجوال يشتقه من n)
// التسريحة: 0 قصير · 1 طويل · 2 كعكة · 3 ذيلين · 4 كيرلي قصير · 5 كيرلي طويل. القبعة: 0 بدون · 1-4 أشكال
// الشكل: [st, o, s, h, hs, acc, fx, hat, g] — g: 0 بنت، 1 ولد. st للولد 0-3 (ثوب وشماغ، قميص وبنطلون، هودي وجينز، بدلة)
// وللبنت 0-1 (فستان، بنطلون وقميص)؛ hs وacc لهم قوائم خاصة لكل نوع (crowd-common.js LOOK)
var LOOK_MAX = [3, 11, 4, 7, 5, 5, 3, 4, 1];
var LOOK_QUICK = [false, true, false, false, false, false, false, true, true]; // السريع: لون لبسه وقبعته وولد/بنت بس
// التفاعلات اللي تطير فوق الراس (الثلاث الأخيرة لصاحبة الحفلة بس)
var REACTS = ['heart', 'smile', 'laugh', 'party', 'crown', 'love', 'sparkle'], GIRL_REACT_FROM = 4;
var REACT_RATE = 2, REACT_BURST = 4, RAIN_COOLDOWN_MS = 20000;
var CHARS = ['rig', 'classic'];
// مناطق الحركة [xmin, xmax, zmin, zmax]
var ZONES = {
    lounge: [-15, 15, 50.5, 69],      // صالة الضيوف خلف المدخل
    girl: [-9, 9, -67, -50.5],        // غرفة صاحبة الحفلة خلف الجدار الشمالي
    hall: [-31, 31, -47, 47],
    nostage: [-31, 31, -31, 47]       // الضيوف وقت الرقص: المنصة والدرج ممنوعين
};
var GIRL_SPOT = [0, -36.5], PHOTO_SPOT = [0, -29.6];
// الكيكة تنزل من السماء بنص القاعة (CAKE_C) على طاولة دائرية: صاحبة الحفلة جنبها من جهة المنصة
// تطالعها، والضيوف حلقات حولها يطالعونها (نفس القيم في hall3d.js وplay.html)
var CAKE_C = [0, -17], CAKE_SPOT = [0, -19.6];
var RING_R0 = 3.6, RING_DR = 1.25, RING_GAP = 1.05, RING_HOLE = .55; // الحلقة الأولى، المسافة بين الحلقات وبين الضيوف، فتحة صاحبة الحفلة (±راديان)
var PHASES = ['closed', 'lobby', 'entrance', 'reveal', 'dance', 'gather', 'wishWrite', 'wishes', 'cakeWalk', 'cake', 'celebrate', 'photo', 'free', 'outro', 'ended'];
// مشهد النهاية: آخر 30 ثانية من الحفل (من أي مرحلة بعد الافتتاح) — صاحبة الحفلة تمشي لحالها على السجادة
// لباب القاعة (الضيوف يختفون عند الكل ويبقون بمكانهم)
var OUTRO_MS = 30000, OUTRO_END = [0, 45];
// مدد ثابتة (ms) — dance و wishWrite و celebrate و cake من الجدول، wishes و free بدون وقت
// cakeWalk: التجمّع حول الكيكة بطول أغنية «Happy Birthday» (music/cakesong.mp3 ≈ 23.9ث) — زر القص يطلع بعدها
var FIXED_MS = { entrance: 40000, reveal: 12000, gather: 12000, cakeWalk: 24500, photo: 16000, outro: OUTRO_MS };
// الجدول الافتراضي (بالدقايق، ومهلة القص بالثواني) والحدود
var SCHED_DEF = { durationMin: 60, openBeforeMin: 15, danceMin: 7, writeMin: 3, cakeDanceMin: 5, cutTimeoutSec: 60 };
var SCHED_LIM = { durationMin: [15, 240], openBeforeMin: [0, 120], danceMin: [1, 60], writeMin: [1, 60], cakeDanceMin: [1, 60], cutTimeoutSec: [10, 600] };
var MIN_MS = 60000, MAX_AHEAD_MS = 30 * 24 * 3600 * 1000, PAST_SLACK_MS = 60000, EXPIRE_MS = 48 * 3600 * 1000;
// مراحل مشي تلقائي: نوع الأهداف لكل مرحلة
var WALK_KIND = { entrance: 'grid', gather: 'grid', cakeWalk: 'cake', photo: 'photo', outro: 'outro' };
var AUTO = { entrance: 1, reveal: 1, gather: 1, cakeWalk: 1, photo: 1, outro: 1 };  // الحركة اليدوية ممنوعة
var MAX_WISH = 200;
// فلتر بسيط — الكلمة تنستبدل بنجوم (المذيع يقدر يخفي أي رسالة)
// كلمات كاملة بس (مو جزء من كلمة: «يرزقك» و«دخول» تبقى مثل ما هي)، ومعها «ال» و«يا» والتشكيل ما يفرق
var BAD_WORDS = ['كلب', 'كلبه', 'كلبة', 'حمار', 'حماره', 'حمارة', 'حيوان', 'حيوانه', 'حيوانة', 'قحبه', 'قحبة', 'شرموط', 'شرموطه', 'شرموطة', 'منيوك', 'خول', 'fuck', 'fucking', 'shit', 'bitch'];
var BAD_SET = new Set(BAD_WORDS);
var GIRL_GRACE_MS = 30 * 1000;  // صاحبة الحفلة غايبة أقل من كذا (تنقّل بين الصفحات/انقطاع قصير) ← مكانها محجوز لها
var STALE_MS = 2 * 60 * 1000;    // ضيف غايب أكثر من كذا ← مكانه ينعطى لضيف جديد لو الحفلة مكتملة
var NEAR_R = 10;                // م — اللي أقرب من كذا يوصل 8 مرات/ث، والأبعد أبطأ (party-server)

function rid(n) { return crypto.randomBytes(n || 12).toString('hex'); }
function cleanName(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim(); }
// معرّف الجهاز (party-dev بالجوال): عشان المطرود ما يرجع، والجهاز ياخذ شخصيته الغايبة بدل ما يسوي ثانية
function cleanDev(d) { return typeof d === 'string' && /^[a-z0-9]{8,32}$/i.test(d) ? d : null; }
function r2(v) { return Math.round(v * 100) / 100; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fail(err) { return { ok: false, err: err }; }
// الجدول من المذيع: أرقام صحيحة بحدودها، والحقل الغلط أو الناقص ← القيمة الافتراضية (أو base لو تعديل).
// creating: البداية ما تكون بالماضي (بسماح دقيقة) ولا بعد أكثر من 30 يوم
function cleanSchedule(s, nowMs, o) {
    if (!s || typeof s !== 'object') return null;
    var base = (o && o.base) || SCHED_DEF;
    var startAt = Math.round(Number(s.startAt != null ? s.startAt : base.startAt));
    if (!isFinite(startAt) || startAt <= 0) return null;
    if (o && o.creating && (startAt < nowMs - PAST_SLACK_MS || startAt > nowMs + MAX_AHEAD_MS)) return null;
    var out = { startAt: startAt };
    Object.keys(SCHED_LIM).forEach(function (k) {
        var v = s[k] == null || s[k] === '' ? NaN : Math.round(Number(s[k]));
        out[k] = isFinite(v) ? clamp(v, SCHED_LIM[k][0], SCHED_LIM[k][1]) : (base[k] != null ? base[k] : SCHED_DEF[k]);
    });
    var tz = s.tzOffsetMin == null ? NaN : Math.round(Number(s.tzOffsetMin));
    out.tzOffsetMin = isFinite(tz) ? clamp(tz, -720, 840) : (base.tzOffsetMin || 0);
    return out;
}
function openAtOf(sc) { return sc.startAt - sc.openBeforeMin * MIN_MS; }
function endAtOf(sc) { return sc.startAt + sc.durationMin * MIN_MS; }
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
function cleanLook(look, kind) {
    return LOOK_MAX.map(function (max, i) {
        var v = look[i];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) return -1;
        return kind === 'quick' && !LOOK_QUICK[i] ? -1 : v;
    });
}
function cleanWish(t) {
    var s = String(t == null ? '' : t).replace(/[\u200b-\u200f\u2060\ufeff]/g, '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    s = Array.from(s).slice(0, MAX_WISH).join('').trim();
    return s.replace(/[\p{L}\p{M}\p{N}\u0640]+/gu, function (word) {
        var w = word.toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, ''); // تشكيل وتطويل
        var bare = w.replace(/^(يا|وال|بال|ال|و|ب)(?=..)/, '');
        return BAD_SET.has(w) || BAD_SET.has(bare) ? '***' : word;
    });
}
// مكان الضيف i (من total متصلين) بالحلقات حول الكيكة — زاوية a: (sin a, cos a)، وπ جهة صاحبة الحفلة (فاضية)
function ringSlot(i, total) {
    var r = RING_R0, start = 0, arc = 2 * Math.PI - 2 * RING_HOLE, late = i >= total;
    for (;;) {
        var cap = Math.max(1, Math.floor(arc * r / RING_GAP));
        // المتأخرين (بعد المتصلين) يبدون من الحلقة اللي بعد آخر حلقة فيها متصلين، عشان ما يركبون عليهم
        if (late && start < total) { start += cap; r += RING_DR; if (start >= total) { i = i - total; start = 0; total = 0; } continue; }
        if (i < start + cap) {
            // آخر حلقة ناقصة: نوزّعهم على القوس كله بدل ما يتكدّسون بجهة
            var cnt = late ? cap : Math.min(cap, total - start), k = i - start;
            var a = Math.PI + RING_HOLE + arc * (k + .5) / cnt;
            return [r2(CAKE_C[0] + Math.sin(a) * r), r2(CAKE_C[1] + Math.cos(a) * r)];
        }
        start += cap; r += RING_DR;
    }
}
function faceCake(x, z) { return r2(Math.atan2(CAKE_C[0] - x, CAKE_C[1] - z)); }
var CAKE_PH = { cakeWalk: 1, cake: 1, celebrate: 1 };
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

    function addPlayer(room, name, role, kind, user, dev) {
        var p = {
            id: rid(8), key: rid(16), n: room.nextN++, name: name, role: role, kind: kind,
            user: user || null, dev: dev || null, online: true, look: LOOK_MAX.map(function () { return -1; }),
            // مكان البداية: منطقة المدخل
            x: r2(-8 + Math.random() * 16), z: r2(38 + Math.random() * 6), ry: Math.PI, a: 0,
            lastMoveAt: now(), dirty: true, ver: 1
        };
        place(room, p);
        room.players.push(p);
        return p;
    }
    function zoneOf(room, p) {
        if (room.phase === 'lobby' || room.phase === 'closed') return p.role === 'girl' ? ZONES.girl : ZONES.lounge;
        return p.role === 'girl' ? ZONES.hall : ZONES.nostage;
    }
    function rnd(a, b) { return r2(a + Math.random() * (b - a)); }
    // مكان اللاعب حسب المرحلة (للداخل جديد)
    function place(room, p) {
        var ph = room.phase;
        if (ph === 'lobby' || ph === 'closed' || ph === 'ended') {
            if (p.role === 'girl') { p.x = rnd(-3, 3); p.z = rnd(-62, -56); p.ry = 0; }
            else { p.x = rnd(-10, 10); p.z = rnd(54, 64); p.ry = Math.PI; }
        } else if (WALK_KIND[ph] || ph === 'reveal' || (CAKE_PH[ph] && p.role !== 'girl')) {
            var t = targetFor(room, p, WALK_KIND[ph] || (CAKE_PH[ph] ? 'cake' : 'grid')); if (WALK_KIND[ph] || ph === 'reveal') room.walk[p.n] = t; p.x = t[0]; p.z = t[1]; p.ry = facing(ph, p);
        } else if (p.role === 'girl') { var gs = (ph === 'cake' || ph === 'celebrate') ? CAKE_SPOT : ph === 'free' && room.photoDone ? PHOTO_SPOT : GIRL_SPOT; p.x = gs[0]; p.z = gs[1]; p.ry = facing(ph, p); }
        else { p.x = rnd(-12, 12); p.z = rnd(-24, -14); p.ry = Math.PI; }
    }
    function targetFor(room, p, kind) {
        kind = kind || 'grid';
        if (p.role === 'girl') return (kind === 'cake' ? CAKE_SPOT : kind === 'photo' ? PHOTO_SPOT : kind === 'outro' ? OUTRO_END : GIRL_SPOT).slice();
        return kind === 'photo' ? photoSlot(room.slotN++, room.slotTotal) : kind === 'cake' ? ringSlot(room.slotN++, room.slotTotal) : kind === 'outro' ? [p.x, p.z] : gridSlot(room.slotN++);
    }
    // اتجاه الوقوف: الضيوف يطالعون المنصة (π)، وصاحبة الحفلة تطالع الضيوف (0) إلا عند الكيكة والصورة
    // مشهد النهاية: هي تطالع الباب (0)، والضيوف على حالهم
    function facing(ph, p) {
        if (ph === 'outro') return p.role === 'girl' ? 0 : p.ry;
        if (CAKE_PH[ph]) return p.role === 'girl' ? 0 : faceCake(p.x, p.z); // الكل يطالع الكيكة
        return p.role === 'girl' && ph !== 'photo' ? 0 : r2(Math.PI);
    }
    // مدة المرحلة (ms) من الجدول — 0 = بدون وقت. الغرفة بدون جدول: نفس الافتراضي، والكيكة تنتظر القص
    function durationOf(room, ph) {
        var sc = room.sched || SCHED_DEF;
        if (ph === 'dance') return sc.danceMin * MIN_MS;
        if (ph === 'wishWrite') return sc.writeMin * MIN_MS;
        if (ph === 'celebrate') return sc.cakeDanceMin * MIN_MS;
        if (ph === 'cake') return room.sched ? sc.cutTimeoutSec * 1000 : 0;
        return FIXED_MS[ph] || 0;
    }
    // at: وقت بداية المرحلة (الافتراضي الحين) — الرجوع بعد إعادة تشغيل يبدأ كل مرحلة فاتت بوقتها الصحيح
    function setPhase(room, ph, at) {
        var t = at || now(); room.phase = ph; room.phaseAt = t;
        var ms = durationOf(room, ph);
        room.phaseUntil = ms ? t + ms : 0;
        buildWalk(room);
        if (ph === 'entrance') room.startedAt = t;
    }
    // أهداف المشي التلقائي للمرحلة الحالية (لو لها مشي)
    function buildWalk(room) {
        var kind = WALK_KIND[room.phase];
        if (kind) {
            // أهداف المشي بترتيب n (نفس الترتيب عند الكل)
            room.walk = {}; room.slotN = 0;
            // المتصلين أول بالترتيب (صفوف الصورة بدون فراغات للغايبين)، والغايبين بعدهم
            room.slotTotal = room.players.filter(function (p) { return p.role !== 'girl' && p.online; }).length;
            room.players.slice().sort(function (a, b) { return (b.online - a.online) || a.n - b.n; }).forEach(function (p) { room.walk[p.n] = targetFor(room, p, kind); });
        }
    }
    // الانتقال للمرحلة اللي بعد الحالية (مرة وحدة)
    function advance(room, at) {
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
        setPhase(room, PHASES[i + 1], at);
        // العرض بدون ولا رسالة ظاهرة: ما فيه شي ينتظر ← للكيكة على طول
        if (room.phase === 'wishes') { room.wishCur = -1; if (!visibleWishes(room).length) advance(room, at); }
        return true;
    }
    // مفاجأة الافتتاح: مكان صاحبة الحفلة مخفي قبل الافتتاح عن الضيوف، وعن شاشة العرض اللي ما معها مفتاح المذيع
    function hiddenFor(room, viewer, p, trusted) {
        if (p.role !== 'girl' || (room.phase !== 'lobby' && room.phase !== 'entrance' && room.phase !== 'closed')) return false;
        return viewer ? viewer.role === 'guest' : !trusted;
    }

    function welcome(p) { return { ok: true, id: p.id, key: p.key, n: p.n, role: p.role, kind: p.kind }; }

    function createRoom(o) {
        // الحفلات اللي انتهت ما تحجز مكان (تبقى بس عشان الرجوع وحفظ الصورة والنقاط)
        if (Object.keys(rooms).filter(function (c) { return rooms[c].phase !== 'ended'; }).length >= maxRooms) return fail('busy');
        var code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms[code]);
        var sched = null;
        if (o && o.schedule != null) { sched = cleanSchedule(o.schedule, now(), { creating: true }); if (!sched) return fail('schedule'); }
        rooms[code] = { code: code, token: rid(16), girlKey: rid(16), viewKey: rid(8), girlName: cleanName(o && o.girlName), players: [], nextN: 1, createdAt: now(),
            chars: CHARS.indexOf(o && o.chars) >= 0 ? o.chars : 'rig', reacts: [],
            sched: sched, phase: sched && now() < openAtOf(sched) ? 'closed' : 'lobby', phaseAt: now(), phaseUntil: 0, walk: {}, slotN: 0, slotTotal: 0,
            wishes: [], wishSeq: 1, wishCur: -1, cakeCut: false, photoDone: false, startedAt: 0, banned: { users: {}, devs: {} } };
        return { ok: true, code: code, token: rooms[code].token, girlKey: rooms[code].girlKey, viewKey: rooms[code].viewKey };
    }

    function hostResume(code, token) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return room.token === token ? { ok: true } : fail('token');
    }

    function join(code, o) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (room.phase === 'ended') return fail('ended');
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
        if (room.phase === 'closed') return fail('closed'); // الدخول لسا ما فتح (صاحبة الحفلة بس)
        var dev = cleanDev(o.dev);
        // المطرود ما يرجع: حسابه (المسجّل) أو جهازه (السريع — حماية بسيطة تكفي لحفلة)
        if ((user && user.id != null && room.banned.users[user.id]) || (dev && room.banned.devs[dev])) return fail('kicked');
        // نفس الجهاز رجع يدخل (مثلاً سجّل دخوله بعد ما كان ضيف سريع): شخصيته القديمة الغايبة تنشال
        if (dev) room.players = room.players.filter(function (p) { return !(p.role === 'guest' && p.dev === dev && !p.online); });
        if (guestCount(room) >= maxGuests) {
            // مكتملة: نشيل أقدم ضيف غايب من دقيقتين أو أكثر (اللي طلع وما رجع)
            var t = now(), stale = room.players.filter(function (p) { return p.role === 'guest' && !p.online && t - p.offlineSince >= STALE_MS; })
                .sort(function (a, b) { return a.offlineSince - b.offlineSince; })[0];
            if (!stale) return fail('full');
            room.players.splice(room.players.indexOf(stale), 1);
        }
        var name = cleanName(o.name) || (user ? cleanName(user.username) : '');
        if (!name) return fail('name');
        var np = addPlayer(room, name, 'guest', user ? 'member' : 'quick', user, dev);
        if (o.g === 0 || o.g === 1) np.look[8] = o.g; // ولد/بنت من شاشة الدخول
        return welcome(np);
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
        if (room.phase === 'ended') return fail('phase');
        var t = now(), gap = t - p.lastMoveAt;
        if (gap < MIN_MOVE_GAP_MS) return fail('flood');
        var zc = inZone(zoneOf(room, p), x, z); x = zc[0]; z = zc[1]; // المناطق فيها حدود القاعة والغرف
        if (a > (p.role === 'girl' ? MAX_ANIM : GUEST_ANIM) || a < 0) a = 0;
        var dist = Math.hypot(x - p.x, z - p.z);
        p.lastMoveAt = t;
        if (dist > MAX_SPEED * Math.min(gap, 2000) / 1000 + SPEED_SLACK) return fail('speed');
        p.x = r2(x); p.z = r2(z); p.ry = r2(ry); p.a = Math.round(a);
        p.dirty = true; p.ver++;
        return { ok: true };
    }

    function setLook(code, id, look) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p) return fail('noplayer');
        if (!Array.isArray(look)) return fail('bad');
        p.look = cleanLook(look, p.kind);
        return { ok: true, look: p.look };
    }
    // طرد ضيف (المذيع): يطلع من الغرفة ومفتاحه ما عاد يرجّعه
    function kick(code, n) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = room.players.find(function (x) { return x.n === Number(n); }); if (!p) return fail('noplayer');
        if (p.role === 'girl') return fail('girl');
        room.players.splice(room.players.indexOf(p), 1);
        if (p.user && p.user.id != null) room.banned.users[p.user.id] = 1;
        if (p.dev) room.banned.devs[p.dev] = 1;
        // تهنئته تنخفي تلقائياً (لو كانت مزعجة ما تحتاج المذيع يخفيها بعد)
        var wish = room.wishes.find(function (w) { return w.pid === p.id; }), wishHidden = !!(wish && !wish.shown && !wish.hidden);
        if (wishHidden) wish.hidden = true;
        return { ok: true, id: p.id, wishHidden: wishHidden };
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
    function deltaFor(code, viewerId, seen, farTick, trusted) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var me = viewerId ? playerOf(room, viewerId) : null, out = [];
        room.players.forEach(function (p) {
            if (me && p === me) return;
            if (hiddenFor(room, me, p, trusted)) return;
            if (seen.get(p.n) === p.ver) return;
            if (me && !farTick && Math.hypot(p.x - me.x, p.z - me.z) > NEAR_R) return;
            seen.set(p.n, p.ver); out.push(stateRow(p));
        });
        return out;
    }

    function fullState(code, viewerId, trusted) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var me = viewerId ? playerOf(room, viewerId) : null;
        return room.players.filter(function (p) { return !hiddenFor(room, me, p, trusted); }).map(stateRow);
    }

    function roster(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return {
            ok: true, code: room.code, girlName: room.girlName, chars: room.chars || 'rig',
            players: room.players.map(function (p) { return [p.n, p.name, p.role, p.kind, p.online ? 1 : 0, p.look]; })
        };
    }

    // للنقاط بالدفعات الجاية: بس الحسابات الموثّقة بتيك توك
    function pointsId(p) { return p && p.user && p.user.tiktok_verified && p.user.tiktok_username ? 'tiktok:' + p.user.tiktok_username : null; }

    function phaseOf(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var walk = null;
        if (WALK_KIND[room.phase] || room.phase === 'reveal') walk = room.walk;
        var sc = room.sched;
        return { ok: true, p: room.phase, at: room.phaseAt, until: room.phaseUntil, walk: walk, cut: room.cakeCut,
            // الجدول كامل (المدد مو سرية) — صفحة المذيع تعبّي منه نموذج «تعديل الأوقات»
            sched: sc ? Object.assign({ openAt: openAtOf(sc), endAt: endAtOf(sc) }, sc) : null,
            waitGirl: waitingGirl(room) };
    }
    function girlOnline(room) { return room.players.some(function (p) { return p.role === 'girl' && p.online; }); }
    // جا وقت البداية وصاحبة الحفلة مو موجودة: الحفل ينتظرها
    function waitingGirl(room) { return !!(room.sched && room.phase === 'lobby' && now() >= room.sched.startAt && !girlOnline(room)); }
    function start(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (room.phase !== 'lobby') return fail('phase');
        advance(room); return { ok: true };
    }
    function skip(code, from) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (room.phase !== from || room.phase === 'free' || room.phase === 'ended') return fail('phase');
        advance(room); return { ok: true };
    }
    // «إنهاء الحفلة» من المذيع: مشهد النهاية (30ث) على طول من أي مرحلة بعد الافتتاح، وبعده ended
    function endNow(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var i = PHASES.indexOf(room.phase);
        if (i < PHASES.indexOf('reveal') || room.phase === 'outro' || room.phase === 'ended') return fail('phase');
        setPhase(room, 'outro'); return { ok: true };
    }
    // catchUp: رجوع بعد إعادة تشغيل — كل مرحلة فاتت تبدأ بوقتها حسب الساعة (مو «الحين»)
    function tick(code, catchUp) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var t = now(), sc = room.sched;
        if (room.phase === 'ended') return { ok: true, changed: false };
        // وقت النهاية يغلب كل شي، وين ما وصلت الحفلة
        if (sc && t >= endAtOf(sc)) { setPhase(room, 'ended', catchUp ? endAtOf(sc) : 0); return { ok: true, changed: true }; }
        // آخر 30 ثانية: مشهد النهاية من أي مرحلة بعد الافتتاح
        if (sc && t >= endAtOf(sc) - OUTRO_MS && room.phase !== 'outro' && PHASES.indexOf(room.phase) >= PHASES.indexOf('reveal')) { setPhase(room, 'outro', catchUp ? endAtOf(sc) - OUTRO_MS : 0); return { ok: true, changed: true }; }
        if (room.phase === 'closed') return { ok: true, changed: !!(sc && t >= openAtOf(sc)) && (setPhase(room, 'lobby', catchUp ? openAtOf(sc) : 0), true) };
        if (room.phase === 'lobby') return { ok: true, changed: !!(sc && t >= sc.startAt && girlOnline(room)) && advance(room) };
        if (room.phaseUntil && t >= room.phaseUntil) return { ok: true, changed: advance(room, catchUp ? room.phaseUntil : 0) };
        return { ok: true, changed: false };
    }
    // تعديل الجدول من المذيع (أي وقت): البداية وفتح الدخول بس قبل ما يبدأ الحفل، والمرحلة الشغالة
    // تنعاد حسبة نهايتها من بدايتها الفعلية بالمدة الجديدة (لو فاتت، tick ينقلها مرة وحدة)
    function setSchedule(code, s) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (!room.sched) return fail('schedule');
        if (room.phase === 'ended') return fail('phase');
        var sc = cleanSchedule(s, now(), { base: room.sched }); if (!sc) return fail('schedule');
        if (room.phase !== 'closed' && room.phase !== 'lobby') { sc.startAt = room.sched.startAt; sc.openBeforeMin = room.sched.openBeforeMin; }
        // غلطة بالتعديل ما تنهي الحفلة الحقيقية فجأة (ended ما يرجع)
        if (endAtOf(sc) <= now() + 60000) return fail('ends');
        room.sched = sc;
        var ms = durationOf(room, room.phase);
        if (ms && room.phaseUntil) room.phaseUntil = room.phaseAt + ms;
        return { ok: true, changed: true };
    }

    // ---- التفاعلات (قلوب وضحك…) ومطر القلوب وإعداد الشخصيات ----
    // كل لاعب له دلو: 2 بالثانية وبحد أقصى 4 دفعة وحدة، والزيادة تنتجاهل بدون ما تقطع الاتصال
    function react(code, id, e) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p) return fail('noplayer');
        var i = REACTS.indexOf(e); if (i < 0) return fail('bad');
        if (i >= GIRL_REACT_FROM && p.role !== 'girl') return fail('role');
        var t = now(), b = p.reactB || (p.reactB = { tokens: REACT_BURST, at: t });
        b.tokens = Math.min(REACT_BURST, b.tokens + (t - b.at) / 1000 * REACT_RATE); b.at = t;
        if (b.tokens < 1) return fail('flood');
        b.tokens -= 1;
        if (room.reacts.length < 400) room.reacts.push({ n: p.n, e: i, girl: p.role === 'girl' });
        return { ok: true };
    }
    function takeReacts(code) { var room = rooms[code]; if (!room) return []; var d = room.reacts; room.reacts = []; return d; }
    // تفاعل صاحبة الحفلة قبل الافتتاح يكشف إنها موجودة: ينخفي عن الضيوف والمشاهد غير الموثوق
    function reactHidden(code, fromGirl) { var room = rooms[code]; return !!(room && fromGirl && (room.phase === 'closed' || room.phase === 'lobby' || room.phase === 'entrance')); }
    function rain(code, id) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p || p.role !== 'girl') return fail('role');
        if (reactHidden(code, true)) return fail('phase'); // قبل الافتتاح يكشف إنها موجودة
        var t = now(); if (room.rainAt && t - room.rainAt < RAIN_COOLDOWN_MS) { var f = fail('cooldown'); f.at = room.rainAt; return f; }
        room.rainAt = t; return { ok: true, at: t };
    }
    function setChars(code, v) { var room = rooms[code]; if (!room) return fail('nocode'); if (CHARS.indexOf(v) < 0) return fail('bad'); room.chars = v; return { ok: true }; }

    // ---- التهاني ----
    function visibleWishes(room) { return room.wishes.filter(function (w) { return !w.hidden; }); }
    function addWish(code, id, text) {
        var room = rooms[code]; if (!room) return fail('nocode');
        var p = playerOf(room, id); if (!p) return fail('noplayer');
        if (room.phase !== 'wishWrite') return fail('phase');
        if (p.role !== 'guest') return fail('role');
        var t = cleanWish(text); if (!t) return fail('empty');
        var w = room.wishes.find(function (x) { return x.pid === p.id; });
        if (w) { if (w.shown) return fail('shown'); w.text = t; w.name = p.name; return { ok: true, wishId: w.id, isNew: false }; }
        w = { id: room.wishSeq++, pid: p.id, name: p.name, text: t, hidden: false, shown: false };
        room.wishes.push(w);
        return { ok: true, wishId: w.id, isNew: true };
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
        // pos: ترتيب المعروضة الحين بين الظاهرة (مع «رجوع» ممكن يكون أقل من shown)
        var pos = w && !w.hidden ? vis.indexOf(w) + 1 : 0;
        return { ok: true, cur: pos ? { i: pos, name: w.name, text: w.text } : null, shown: shown, total: vis.length, pos: pos };
    }
    // seen = عدد المعروضة عند اللي ضغط: لو صاحبة الحفلة والمذيع ضغطوا سوا، الضغطة الثانية تنرفض
    // بدل ما تتخطى رسالة محد قرأها
    function nextWish(code, byId, seen) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (!canLead(room, byId)) return fail('role');
        if (room.phase !== 'wishes') return fail('phase');
        if (seen != null && seen !== wishesState(code).pos) return fail('stale');
        for (var i = room.wishCur + 1; i < room.wishes.length; i++) {
            var w = room.wishes[i];
            if (!w.hidden) { room.wishCur = i; w.shown = true; return { ok: true, cur: wishesState(code).cur, done: false }; }
        }
        // ما فيه رسالة جاية: ننتقل للكيكة
        advance(room);
        return { ok: true, cur: null, done: true };
    }
    // «رجوع»: للرسالة الظاهرة اللي قبل المعروضة (seen = pos عند اللي ضغط، مثل التالي)
    function prevWish(code, byId, seen) {
        var room = rooms[code]; if (!room) return fail('nocode');
        if (!canLead(room, byId)) return fail('role');
        if (room.phase !== 'wishes') return fail('phase');
        if (seen != null && seen !== wishesState(code).pos) return fail('stale');
        for (var i = room.wishCur - 1; i >= 0; i--) {
            if (!room.wishes[i].hidden) { room.wishCur = i; return { ok: true, cur: wishesState(code).cur }; }
        }
        return fail('first');
    }
    function wishList(code) {
        var room = rooms[code]; if (!room) return fail('nocode');
        return { ok: true, items: room.wishes.map(function (w, i) { return { id: w.id, name: w.name, text: w.text, hidden: w.hidden, shown: w.shown, cur: i === room.wishCur }; }) };
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

    // ---- الحفظ (party-store) والرجوع بعد إعادة تشغيل السيرفر ----
    // كل شي إلا المواقع (تتغيّر 8 مرات/ث) وحالة الإرسال — بعد الرجوع كل لاعب يتحط بمكان مرحلته
    var ROOM_KEYS = ['chars', 'code', 'token', 'girlKey', 'viewKey', 'girlName', 'createdAt', 'sched', 'phase', 'phaseAt', 'phaseUntil', 'nextN',
        'wishes', 'wishSeq', 'wishCur', 'cakeCut', 'photoDone', 'startedAt', 'banned', 'pointsMsg', 'pointsAcked'];
    function serialize(code) {
        var room = rooms[code]; if (!room) return null;
        var o = { v: 1 };
        ROOM_KEYS.forEach(function (k) { if (room[k] !== undefined) o[k] = room[k]; });
        o.players = room.players.map(function (p) {
            var u = p.user ? { id: p.user.id, username: p.user.username, tiktok_username: p.user.tiktok_username, tiktok_verified: p.user.tiktok_verified } : null;
            return { id: p.id, key: p.key, n: p.n, name: p.name, role: p.role, kind: p.kind, look: p.look, dev: p.dev, user: u };
        });
        return o;
    }
    function restore(o) {
        if (!o || typeof o.code !== 'string' || !/^\d{4}$/.test(o.code) || !Array.isArray(o.players) || PHASES.indexOf(o.phase) < 0) return fail('bad');
        if (!o.players.every(function (q) { return q && typeof q.id === 'string' && typeof q.key === 'string' && Number.isInteger(q.n); })) return fail('bad');
        if (o.sched != null) {
            var sc = o.sched;
            if (typeof sc !== 'object' || !isFinite(sc.startAt) || Object.keys(SCHED_LIM).some(function (k) { return typeof sc[k] !== 'number' || !isFinite(sc[k]); })) return fail('bad');
            if (now() > endAtOf(sc) + EXPIRE_MS) return fail('expired'); // حفلة قديمة مرّ عليها يومين: ما ترجع
        }
        if (rooms[o.code]) return fail('exists');
        var room = { chars: 'rig', reacts: [], players: [], walk: {}, slotN: 0, slotTotal: 0, wishes: [], wishSeq: 1, wishCur: -1, cakeCut: false, photoDone: false, startedAt: 0, banned: { users: {}, devs: {} }, sched: null, nextN: 1, phaseUntil: 0 };
        ROOM_KEYS.forEach(function (k) { if (o[k] !== undefined) room[k] = o[k]; });
        if (CHARS.indexOf(room.chars) < 0) room.chars = 'rig';
        var t = now();
        room.players = o.players.map(function (q) {
            var p = { id: q.id, key: q.key, n: q.n, name: q.name, role: q.role, kind: q.kind, look: Array.isArray(q.look) ? q.look : LOOK_MAX.map(function () { return -1; }),
                dev: q.dev || null, user: q.user || null, online: false, offlineSince: t, x: 0, z: 0, ry: Math.PI, a: 0, lastMoveAt: t, dirty: true, ver: 1 };
            room.nextN = Math.max(room.nextN, p.n + 1);
            return p;
        });
        rooms[o.code] = room;
        buildWalk(room);
        room.players.forEach(function (p) { var w = room.walk[p.n]; if (w) { p.x = w[0]; p.z = w[1]; p.ry = facing(room.phase, p); } else place(room, p); });
        // اللي فات وقت ما كان السيرفر طافي
        for (var k = 0; k < 30 && tick(o.code, true).changed; k++) { }
        return { ok: true, code: o.code };
    }

    function closeRoom(code) { if (!rooms[code]) return fail('nocode'); delete rooms[code]; return { ok: true }; }
    function getRoom(code) { return rooms[code] || null; }

    return {
        createRoom: createRoom, hostResume: hostResume, join: join, resume: resume, leave: leave,
        move: move, takeDelta: takeDelta, deltaFor: deltaFor, fullState: fullState, roster: roster,
        closeRoom: closeRoom, rooms: function () { return Object.keys(rooms); }, serialize: serialize, restore: restore,
        getRoom: getRoom, pointsId: pointsId, phaseOf: phaseOf, start: start, skip: skip, endNow: endNow, tick: tick,
        setLook: setLook, kick: kick, react: react, takeReacts: takeReacts, reactHidden: reactHidden, rain: rain, setChars: setChars, setSchedule: setSchedule, addWish: addWish, hideWish: hideWish, nextWish: nextWish, prevWish: prevWish, wishesState: wishesState, wishList: wishList, cut: cut, pointsList: pointsList
    };
}

module.exports = { createRoomManager: createRoomManager, packRows: packRows, cleanSchedule: cleanSchedule, REACTS: REACTS, ringSlot: ringSlot, CAKE_C: CAKE_C, CAKE_SPOT: CAKE_SPOT };
