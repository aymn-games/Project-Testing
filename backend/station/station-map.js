/**
 * «محطة سهيل» — ثوابت الخريطة على الخادم.
 *
 * منسوخة حرفياً من games/intruder/play.html (ROOMS/CORR/TASKS/VENTS/DEV/BTN
 * ومقياس MS=1.45 ودالة walk). أي تعديل على الخريطة لازم ينعكس بالملفين معاً.
 */
'use strict';

var RAD = 22, SPEED = 270, LONG_K = ['samples', 'upload', 'reactor'];
var ROOMS = [
    { id: 'lounge', n: 'الاستراحة', x: 1000, y: 600, w: 500, h: 380 },
    { id: 'command', n: 'القيادة', x: 1050, y: 120, w: 400, h: 260 },
    { id: 'lab', n: 'المختبر', x: 1750, y: 200, w: 420, h: 320 },
    { id: 'comms', n: 'الاتصالات', x: 1800, y: 750, w: 360, h: 280 },
    { id: 'clinic', n: 'العيادة', x: 1600, y: 1200, w: 380, h: 300 },
    { id: 'storage', n: 'المخزن', x: 1000, y: 1250, w: 480, h: 320 },
    { id: 'hydro', n: 'الحديقة المائية', x: 380, y: 1200, w: 420, h: 300 },
    { id: 'reactor', n: 'المفاعل', x: 100, y: 600, w: 420, h: 380 },
    { id: 'engines', n: 'المحركات', x: 380, y: 150, w: 420, h: 300 }];
var CORR = [[1190, 370, 120, 240], [510, 730, 500, 120], [1490, 780, 320, 120], [1190, 970, 120, 290], [1440, 230, 320, 120], [790, 230, 270, 120], [400, 440, 100, 170], [400, 970, 100, 240], [790, 1340, 220, 120], [1470, 1340, 140, 120], [1850, 1020, 120, 190], [1900, 510, 120, 250]]
    .map(function (a, i) { return { i: i, x: a[0], y: a[1], w: a[2], h: a[3], v: a[3] > a[2] }; });
var TASKS = [
    { id: 't1', n: 'ضبط المحرك', r: 'engines', x: 700, y: 230, k: 'calibrate' },
    { id: 't2', n: 'ضبط المسار', r: 'command', x: 1250, y: 180, k: 'route' },
    { id: 't3', n: 'فحص العينات', r: 'lab', x: 2080, y: 290, k: 'samples' },
    { id: 't4', n: 'توصيل أسلاك الإرسال', r: 'comms', x: 2080, y: 960, k: 'wires' },
    { id: 't5', n: 'تمرير بطاقة الدخول', r: 'clinic', x: 1720, y: 1290, k: 'swipe' },
    { id: 't6', n: 'فتح قفل المخزن', r: 'storage', x: 1120, y: 1480, k: 'lock' },
    { id: 't7', n: 'تنظيف الأحواض', r: 'hydro', x: 560, y: 1290, k: 'trash' },
    { id: 't8', n: 'إصلاح المفاعل', r: 'reactor', x: 200, y: 680, k: 'reactor' },
    { id: 't9', n: 'تنظيف النفايات', r: 'lounge', x: 1430, y: 660, k: 'trash' },
    { id: 't10', n: 'تصويب النيازك', r: 'lab', x: 1820, y: 440, k: 'aim' },
    { id: 't11', n: 'رفع البيانات', r: 'command', x: 1110, y: 330, k: 'upload' }];
var VENTS = [{ id: 'v1', x: 180, y: 910, to: ['v2', 'v5'] }, { id: 'v2', x: 460, y: 220, to: ['v1', 'v6'] }, { id: 'v3', x: 2100, y: 440, to: ['v4', 'v6'] }, { id: 'v4', x: 1900, y: 1440, to: ['v3', 'v5'] }, { id: 'v5', x: 450, y: 1440, to: ['v4', 'v1'] }, { id: 'v6', x: 1380, y: 320, to: ['v2', 'v3'] }];
var BTN = { x: 1250, y: 790 };
var DEV = [{ id: 'r1', k: 'reactor', x: 260, y: 950 }, { id: 'r2', k: 'reactor', x: 440, y: 690 }, { id: 'lights', k: 'lights', x: 430, y: 400 }, { id: 'o2a', k: 'o2', x: 760, y: 1420 }, { id: 'o2b', k: 'o2', x: 1400, y: 320 }, { id: 'comms', k: 'comms', x: 2100, y: 800 }];
var MS = 1.45;
ROOMS.forEach(function (r) { r.x *= MS; r.y *= MS; r.w *= MS; r.h *= MS; });
CORR.forEach(function (c) { c.x *= MS; c.y *= MS; c.w *= MS; c.h *= MS; });
[].concat(TASKS, VENTS, [BTN], DEV).forEach(function (o) { o.x *= MS; o.y *= MS; });

function inR(x, y, a, sx, sy) { return x >= a.x + sx && x <= a.x + a.w - sx && y >= a.y + sy && y <= a.y + a.h - sy; }
function roomAt(x, y) { var r = ROOMS.find(function (r) { return inR(x, y, r, 0, 0); }); return r ? r.id : null; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function rand(a, b) { return a + Math.random() * (b - a); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
CORR.forEach(function (c) {
    var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    c.e1 = c.v ? { x: cx, y: c.y - 45 } : { x: c.x - 45, y: cy };
    c.e2 = c.v ? { x: cx, y: c.y + c.h + 45 } : { x: c.x + c.w + 45, y: cy };
    c.a = roomAt(c.e1.x, c.e1.y); c.b = roomAt(c.e2.x, c.e2.y);
});
/** نفس walk() بالعميل: هل النقطة داخل غرفة أو ممر غير مقفول. */
function walk(x, y, lk) {
    for (var i = 0; i < ROOMS.length; i++) if (inR(x, y, ROOMS[i], RAD, RAD)) return true;
    for (var j = 0; j < CORR.length; j++) {
        var c = CORR[j]; if (lk && lk.has(c.i)) continue;
        if (inR(x, y, c, c.v ? RAD : -RAD - 14, c.v ? -RAD - 14 : RAD)) return true;
    }
    return false;
}

module.exports = {
    RAD: RAD, SPEED: SPEED, LONG_K: LONG_K, ROOMS: ROOMS, CORR: CORR, TASKS: TASKS, VENTS: VENTS,
    BTN: BTN, DEV: DEV, MS: MS, roomAt: roomAt, dist: dist, rand: rand, shuffle: shuffle, walk: walk
};
