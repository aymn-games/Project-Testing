/**
 * «خارج التغطية» — مخطط إعدادات المباراة والتحقق منها (الخادم هو المرجع).
 *
 * نفس شكل مخطط «المافيا» (mafia/mafia-settings.js): الخادم يرسل SCHEMA لشاشة
 * الإعدادات فتبني صفوفها منه مباشرة. الأنواع: num (عدّاد) · bool (مفتاح)
 * · pick (مجموعة أزرار كبسولة، الخيارات بـ o).
 * القيم الافتراضية جاهزة للعب بدون أي تعديل.
 */
'use strict';

var Words = require('./coverage-words');

var MIN_ROOM = 4, MAX_ROOM = 20;

var SCHEMA = [
    { id: 'play', n: 'اللعب', f: [
        { k: 'mode', n: 'نمط اللعب', t: 'pick', d: 'different', o: [{ v: 'different', n: 'كلمة مختلفة' }, { v: 'blank', n: 'بدون كلمة' }],
            desc: 'خارج التغطية تجيه كلمة قريبة من كلمة الباقين، أو ما تجيه كلمة أبداً' },
        { k: 'outsiders', n: 'عدد اللاعبين خارج التغطية', t: 'num', min: 1, max: 3, step: 1, d: 1 },
        { k: 'cat', n: 'فئة الكلمات', t: 'pick', d: 'all', o: Words.CATEGORY_OPTIONS },
        { k: 'finalGuess', n: 'التخمين الأخير', t: 'bool', d: true, desc: 'لو انكشف، يقدر يفوز إذا خمّن كلمة الباقين' }
    ] },
    { id: 'turns', n: 'التلميحات', f: [
        { k: 'batchSize', n: 'لاعبين بكل دفعة', t: 'num', min: 1, max: 5, step: 1, d: 3, desc: 'يكتبون تلميحاتهم بنفس الوقت، وتنكشف مع بعض' },
        { k: 'hintSec', n: 'وقت كتابة التلميح', t: 'num', min: 10, max: 60, step: 5, d: 15, u: 'ث' }
    ] },
    { id: 'time', n: 'الوقت', f: [
        { k: 'talkSec', n: 'مدة النقاش', t: 'num', min: 0, max: 120, step: 5, d: 25, u: 'ث', desc: '0 = بدون نقاش، ويقدر المذيع ينهيه بدري' },
        { k: 'voteSec', n: 'مدة التصويت', t: 'num', min: 10, max: 60, step: 5, d: 20, u: 'ث' },
        { k: 'guessSec', n: 'مدة التخمين الأخير', t: 'num', min: 10, max: 60, step: 5, d: 20, u: 'ث' }
    ] },
    { id: 'room', n: 'الغرفة', f: [
        { k: 'maxPlayers', n: 'أكثر عدد بالغرفة', t: 'num', min: MIN_ROOM, max: MAX_ROOM, step: 1, d: 16 }
    ] }
];

var DEFAULTS = {};
SCHEMA.forEach(function (g) { g.f.forEach(function (f) { DEFAULTS[f.k] = f.d; }); });

function validate(input) {
    var out = {}, src = input || {};
    SCHEMA.forEach(function (g) {
        g.f.forEach(function (f) {
            var v = src[f.k];
            if (f.t === 'bool') out[f.k] = typeof v === 'boolean' ? v : f.d;
            else if (f.t === 'pick') out[f.k] = f.o.some(function (o) { return o.v === v; }) ? v : f.d;
            else {
                v = Number(v);
                if (!isFinite(v)) v = f.d;
                v = Math.round(v / f.step) * f.step;
                out[f.k] = Math.max(f.min, Math.min(f.max, v));
            }
        });
    });
    // الغرفة لازم تكفي لأقل عدد تحتاجه المباراة
    out.maxPlayers = Math.max(out.maxPlayers, minPlayers(out));
    return out;
}

/** أقل عدد: 4، وخارج التغطية دايم أقل من نص اللاعبين (عشان الأغلبية لها معنى). */
function minPlayers(s) { return Math.max(MIN_ROOM, (s.outsiders || 1) * 2 + 2); }

module.exports = { SCHEMA: SCHEMA, DEFAULTS: DEFAULTS, validate: validate, minPlayers: minPlayers, MIN_ROOM: MIN_ROOM, MAX_ROOM: MAX_ROOM };
