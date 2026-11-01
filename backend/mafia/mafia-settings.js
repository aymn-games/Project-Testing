/**
 * «المافيا» — مخطط إعدادات المباراة والتحقق منها (الخادم هو المرجع).
 *
 * الخادم يرسل SCHEMA لشاشة المذيع داخل welcome، فالواجهة تبني صفوف
 * الإعدادات منه مباشرة بدون نسخة ثانية بالمتصفح.
 * الأدوار يحددها المذيع يدوياً (قواعد «مدينة المافيا» 1.0): عدد المافيا
 * (ومنهم المتخفين) وعدد الأطباء والمحققين، والباقي مواطنين.
 * الغرفة من 10 إلى 200 لاعب، وفوق 25 لاعب تتوزع الأسماء على أحياء.
 */
'use strict';

var MIN_ROOM = 5, MAX_ROOM = 200;   // أقل شي 5: مافيا + طبيب + 3 مواطنين، والمحقق من 6 لاعبين وطالع

var SCHEMA = [
    { id: 'roles', n: 'الأدوار', f: [
        { k: 'mafia', n: 'عدد المافيا', t: 'num', min: 1, max: 60, step: 1, d: 2, desc: 'يشمل المتخفين' },
        { k: 'disguised', n: 'منهم متخفين', t: 'num', min: 0, max: 10, step: 1, d: 1, desc: 'أول فحص ناجح له يطلع «مواطن»' },
        { k: 'doctors', n: 'عدد الأطباء', t: 'num', min: 0, max: 10, step: 1, d: 1 },
        { k: 'detectives', n: 'عدد المحققين', t: 'num', min: 0, max: 10, step: 1, d: 1, desc: 'يحتاج 6 لاعبين وطالع' },
        { k: 'fullReveal', n: 'كشف الدور كامل', t: 'bool', d: false, desc: 'مطفي = حسب القواعد: قتيل الليل بدون كشف، والمطرود يظهر فريقه بس' }
    ] },
    // كروت المافيا: المذيع يفعّل اللي يبيه، وكل مباراة تنسحب منها عشوائي بالعدد المحدد
    { id: 'cards', n: 'كروت المافيا', f: [
        { k: 'cardsCount', n: 'عدد الكروت بالمباراة', t: 'num', min: 0, max: 5, step: 1, d: 3, desc: 'تنسحب عشوائي من الكروت المفعّلة' },
        { k: 'card_recruit', n: '🤝 التجنيد', t: 'bool', d: true, desc: 'بدل القتل: مواطن يصير مافيا (من الليلة 3)' },
        { k: 'card_shield', n: '🛡️ الحماية', t: 'bool', d: true, desc: 'عضو مافيا يطلع للمحقق «مواطن» لليلتين' },
        { k: 'card_reveal', n: '👁️ كشف الهوية', t: 'bool', d: true, desc: 'المافيا يعرفون دور مواطن' },
        { k: 'card_mislead', n: '🎭 التضليل', t: 'bool', d: true, desc: 'لاعب بريء يطلع للمحقق «مافيا» لليلتين' },
        { k: 'card_silence', n: '🤐 الإسكات', t: 'bool', d: true, desc: 'لاعب ما يكتب بنقاش بكرة (يصوّت عادي)' }
    ] },
    { id: 'time', n: 'الوقت', f: [
        { k: 'mafiaSec', n: 'دور المافيا بالليل', t: 'num', min: 15, max: 120, step: 5, d: 40, u: 'ث' },
        { k: 'doctorSec', n: 'دور الطبيب', t: 'num', min: 10, max: 90, step: 5, d: 25, u: 'ث' },
        { k: 'detectiveSec', n: 'دور المحقق', t: 'num', min: 10, max: 90, step: 5, d: 25, u: 'ث' },
        { k: 'talkSec', n: 'مدة النقاش', t: 'num', min: 30, max: 600, step: 10, d: 180, u: 'ث' },
        { k: 'voteSec', n: 'مدة التصويت', t: 'num', min: 15, max: 180, step: 5, d: 45, u: 'ث' }
    ] },
    { id: 'room', n: 'الروم', f: [
        { k: 'maxPlayers', n: 'أكثر عدد بالروم', t: 'num', min: MIN_ROOM, max: MAX_ROOM, step: 5, d: MAX_ROOM }
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
    out.disguised = Math.min(out.disguised, out.mafia);   // المتخفين من ضمن المافيا
    out.cardsCount = Math.min(out.cardsCount, enabledCards(out).length);   // ما يتعدى عدد الكروت المفعّلة
    return out;
}

var CARD_IDS = ['recruit', 'shield', 'reveal', 'mislead', 'silence'];
/** الكروت المفعّلة بالإعدادات */
function enabledCards(s) { return CARD_IDS.filter(function (c) { return s['card_' + c] !== false; }); }

/** أقل عدد لاعبين لهالإعدادات: 5 على الأقل، والمافيا أقل من الباقين، ومواطن واحد على الأقل، والمحقق من 6 لاعبين. */
function minPlayers(s) {
    return Math.max(MIN_ROOM, s.mafia * 2 + 1, s.mafia + s.doctors + s.detectives + 1, s.detectives > 0 ? 6 : 0);
}

module.exports = { SCHEMA: SCHEMA, DEFAULTS: DEFAULTS, validate: validate, minPlayers: minPlayers, enabledCards: enabledCards, MIN_ROOM: MIN_ROOM, MAX_ROOM: MAX_ROOM };
