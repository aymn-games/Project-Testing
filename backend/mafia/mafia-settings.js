/**
 * «المافيا» — مخطط إعدادات المباراة والتحقق منها (الخادم هو المرجع).
 *
 * الخادم يرسل SCHEMA لشاشة المذيع داخل welcome، فالواجهة تبني صفوف
 * الإعدادات منه مباشرة بدون نسخة ثانية بالمتصفح.
 * الأدوار يحددها المذيع يدوياً: عدد المافيا + وجود الطبيب + وجود المحقق،
 * والباقي مواطنين.
 */
'use strict';

var SCHEMA = [
    { id: 'roles', n: 'الأدوار', f: [
        { k: 'mafia', n: 'عدد المافيا', t: 'num', min: 1, max: 5, step: 1, d: 1 },
        { k: 'doctor', n: 'الطبيب', t: 'bool', d: true, desc: 'يختار كل ليلة شخص يحميه من المافيا' },
        { k: 'detective', n: 'المحقق', t: 'bool', d: true, desc: 'يستجوب كل ليلة شخص ويعرف هل هو مافيا' },
        { k: 'doctorSelf', n: 'الطبيب يقدر يحمي نفسه', t: 'bool', d: true },
        { k: 'revealRole', n: 'كشف دور اللي يطلع', t: 'bool', d: true, desc: 'يظهر دور اللاعب بعد ما يُقتل أو يُطرد' }
    ] },
    { id: 'time', n: 'الوقت', f: [
        { k: 'nightSec', n: 'مدة الليل', t: 'num', min: 15, max: 120, step: 5, d: 40, u: 'ث' },
        { k: 'talkSec', n: 'مدة النقاش', t: 'num', min: 20, max: 300, step: 10, d: 90, u: 'ث' },
        { k: 'voteSec', n: 'مدة التصويت', t: 'num', min: 10, max: 120, step: 5, d: 30, u: 'ث' }
    ] },
    { id: 'room', n: 'الروم', f: [
        { k: 'maxPlayers', n: 'أكثر عدد بالروم', t: 'num', min: 4, max: 20, step: 1, d: 16 }
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
            else {
                v = Number(v);
                if (!isFinite(v)) v = f.d;
                v = Math.round(v / f.step) * f.step;
                out[f.k] = Math.max(f.min, Math.min(f.max, v));
            }
        });
    });
    return out;
}

/** أقل عدد لاعبين لهالإعدادات: المافيا أقل من الباقين، ومواطن واحد على الأقل. */
function minPlayers(s) {
    var specials = (s.doctor ? 1 : 0) + (s.detective ? 1 : 0);
    return Math.max(4, s.mafia * 2 + 1, s.mafia + specials + 1);
}

module.exports = { SCHEMA: SCHEMA, DEFAULTS: DEFAULTS, validate: validate, minPlayers: minPlayers };
