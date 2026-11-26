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
        { k: 'fullReveal', n: 'كشف الدور كامل', t: 'bool', d: false, desc: 'مشغّل: يطلع دور اللي يموت أو ينطرد بالضبط (طبيب، محقق…). مطفي: قتيل الليل دوره سر، والمطرود يطلع فريقه بس (مافيا أو مواطن). وبالنهاية تنكشف أدوار الكل' }
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
        { k: 'talkSec', n: 'مدة النقاش', t: 'num', min: 30, max: 600, step: 10, d: 60, u: 'ث' },
        { k: 'voteSec', n: 'مدة التصويت', t: 'num', min: 15, max: 180, step: 5, d: 30, u: 'ث' }
    ] },
    { id: 'room', n: 'الروم', f: [
        { k: 'maxPlayers', n: 'أكثر عدد بالروم', t: 'num', min: MIN_ROOM, max: MAX_ROOM, step: 5, d: MAX_ROOM }
    ] }
];

var DEFAULTS = {};
SCHEMA.forEach(function (g) { g.f.forEach(function (f) { DEFAULTS[f.k] = f.d; }); });

// ---------------------------------------------------------------- «نظام القرية» (النظام الجديد)
// المذيع يختار النظام أول ما يفتح اللعبة (games/mafia/index.html). الإعدادات تحمل system: 'village'،
// وmafia-server يشغّل mafia-village.js بدل mafia-game.js. أعداد الأدوار تنختار بشاشة «اختر الأدوار» قبل التوزيع،
// والوقت وحجم الروم بشاشة الإعدادات (VILLAGE_SCHEMA).
// team: town = فريق القرية · mafia = فريق المافيا · neutral = محايد. core = بطاقة أساسية (الباقي «الأدوار الإضافية»)
var VILLAGE_ROLES = [
    { k: 'mafia', n: 'مافيا', team: 'mafia', core: true, min: 1, max: 60, d: 2 },
    { k: 'doctor', n: 'الطبيب', team: 'town', core: true, min: 0, max: 20, d: 1 },
    { k: 'detective', n: 'المحقق', team: 'town', core: true, min: 0, max: 20, d: 1 },
    { k: 'mayor', n: 'العمدة', team: 'town', min: 0, max: 1, d: 0 },
    { k: 'bodyguard', n: 'الحارس الشخصي', team: 'town', min: 0, max: 5, d: 0 },
    { k: 'sniper', n: 'القنّاص', team: 'town', min: 0, max: 5, d: 0 },
    { k: 'forger', n: 'المزوّر', team: 'mafia', min: 0, max: 5, d: 0 },
    { k: 'jester', n: 'المهرّج', team: 'neutral', min: 0, max: 3, d: 0 }
];
var KILL_MODES = ['agree', 'each'];   // agree = يتفقون على واحد · each = كل مافيا يقتل لاعب
var VILLAGE_SCHEMA = [
    { id: 'time', n: 'الوقت', f: [
        { k: 'nightSec', n: 'مدة الليل', t: 'num', min: 15, max: 120, step: 5, d: 40, u: 'ث', desc: 'كل الأدوار تختار بنفس الوقت من جوالاتها' },
        { k: 'talkSec', n: 'مدة النقاش', t: 'num', min: 0, max: 600, step: 10, d: 60, u: 'ث', desc: '0 = التصويت على طول بعد الصبح' },
        { k: 'voteSec', n: 'مدة التصويت', t: 'num', min: 15, max: 180, step: 5, d: 30, u: 'ث' }
    ] },
    { id: 'room', n: 'الروم', f: [
        { k: 'maxPlayers', n: 'أكثر عدد بالروم', t: 'num', min: MIN_ROOM, max: MAX_ROOM, step: 5, d: MAX_ROOM }
    ] }
];
var VILLAGE_DEFAULTS = { system: 'village', killMode: 'agree' };
VILLAGE_SCHEMA.forEach(function (g) { g.f.forEach(function (f) { VILLAGE_DEFAULTS[f.k] = f.d; }); });
VILLAGE_ROLES.forEach(function (r) { VILLAGE_DEFAULTS['v_' + r.k] = r.d; });

function clampNum(v, f) {
    v = Number(v); if (!isFinite(v)) v = f.d;
    v = Math.round(v / (f.step || 1)) * (f.step || 1);
    return Math.max(f.min, Math.min(f.max, v));
}
function validateVillage(src) {
    var out = { system: 'village' };
    VILLAGE_SCHEMA.forEach(function (g) { g.f.forEach(function (f) { out[f.k] = clampNum(src[f.k], f); }); });
    VILLAGE_ROLES.forEach(function (r) { out['v_' + r.k] = clampNum(src['v_' + r.k], r); });
    out.killMode = KILL_MODES.indexOf(src.killMode) >= 0 ? src.killMode : 'agree';
    return out;
}
/** عدد كل دور بنظام القرية (بدون المواطنين) */
function villageCounts(s) { var o = {}; VILLAGE_ROLES.forEach(function (r) { o[r.k] = s['v_' + r.k] || 0; }); return o; }
function villageMin(s) {
    var c = villageCounts(s), sum = 0, maf = 0;
    VILLAGE_ROLES.forEach(function (r) { sum += c[r.k]; if (r.team === 'mafia') maf += c[r.k]; });
    // فريق المافيا لازم يكون أقل من الباقين من البداية، وكل دور يحتاج لاعب
    return Math.max(MIN_ROOM, sum, maf * 2 + 1);
}

function validate(input) {
    if (input && input.system === 'village') return validateVillage(input);
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
    out.disguised = out.detectives ? Math.min(out.disguised, out.mafia) : 0;   // المتخفين من ضمن المافيا، ولا لهم معنى بدون محقق
    out.cardsCount = Math.min(out.cardsCount, enabledCards(out).length);   // ما يتعدى عدد الكروت المفعّلة
    return out;
}

var CARD_IDS = ['recruit', 'shield', 'reveal', 'mislead', 'silence'];
/** هل للكرت فايدة بهالإعدادات؟ الحماية والتضليل يحتاجون محقق، وكشف الهوية يحتاج دور خاص بالمدينة (طبيب/محقق)،
 *  والتجنيد يحتاج روم كبيرة كفاية عشان ما يتعدى 30% (n = عدد اللاعبين لو معروف). */
function cardUseful(c, s, n) {
    if (c === 'shield' || c === 'mislead') return s.detectives > 0;
    if (c === 'reveal') return s.doctors + s.detectives > 0;
    if (c === 'recruit' && n) return (s.mafia + 1) / n <= 0.30;
    return true;
}
/** الكروت المفعّلة بالإعدادات واللي لها فايدة */
function enabledCards(s, n) { return CARD_IDS.filter(function (c) { return s['card_' + c] !== false && cardUseful(c, s, n); }); }

/** أقل عدد لاعبين لهالإعدادات: 5 على الأقل، والمافيا أقل من الباقين، ومواطن واحد على الأقل، والمحقق من 6 لاعبين. */
function minPlayers(s) {
    if (s && s.system === 'village') return villageMin(s);
    return Math.max(MIN_ROOM, s.mafia * 2 + 1, s.mafia + s.doctors + s.detectives + 1, s.detectives > 0 ? 6 : 0);
}

module.exports = { VILLAGE_SCHEMA: VILLAGE_SCHEMA, VILLAGE_ROLES: VILLAGE_ROLES, VILLAGE_DEFAULTS: VILLAGE_DEFAULTS, KILL_MODES: KILL_MODES, villageCounts: villageCounts, SCHEMA: SCHEMA, DEFAULTS: DEFAULTS, validate: validate, minPlayers: minPlayers, enabledCards: enabledCards, cardUseful: cardUseful, MIN_ROOM: MIN_ROOM, MAX_ROOM: MAX_ROOM };
