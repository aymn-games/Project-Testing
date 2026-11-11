/**
 * بلدة الكاوبوي — تعريف الإعدادات (شاشة الإعدادات + منطق اللعبة).
 * choice : اختيار واحد  { key, label, icon, options:[[قيمة, نص], ...], default, desc | descs:{قيمة: نص} }
 * number : رقم           { key, label, icon, min, max, default }
 * الحفظ في localStorage (لكل متصفح) — لو التخزين مقفل تشتغل اللعبة بالقيم الافتراضية.
 */
(function (root) {
    'use strict';
    var FIELDS = [
        { key: 'joinBy', type: 'choice', section: 1, label: 'طريقة الدخول', default: 'keyword', options: [['keyword', 'كلمة'], ['gift', 'هدية']], descs: { keyword: 'المشاهد يكتب كلمة الدخول بالشات.', gift: 'المشاهد يرسل الهدية اللي تحددها (تيك توك لايف).' } },
        { key: 'joinGift', type: 'gift', section: 1, showIf: ['joinBy', 'gift'], label: 'هدية الدخول', default: 'rose' },
        { key: 'keyword', type: 'text', section: 1, showIf: ['joinBy', 'keyword'], label: 'كلمة الدخول', placeholder: 'اكتب كلمة الدخول', default: 'دخول', desc: 'المشاهد يكتبها بالشات عشان يدخل السوق.' },
        { key: 'bell', type: 'choice', section: 2, icon: 'clock', label: 'ما يظهر عند الجرس', default: 'numbers',
          options: [['numbers', 'أرقام'], ['words', 'كلمات'], ['mixed', 'مختلط: أرقام وكلمات']],
          desc: 'الكلمات قصيرة من عالم الغرب مثل حصان ومسدس وقبعة، وتُقبل بأي كتابة للهمزة والتاء المربوطة والألف المقصورة. في المختلط تكون كل مبارزة رقمًا أو كلمة عشوائيًا.' },
        { key: 'trick', type: 'toggle', section: 3, icon: 'clock', label: 'الخدعة الحمراء', default: false,
          options: [[false, 'متوقفة'], [true, 'مفعّلة']],
          desc: 'رقم أو كلمة بالأحمر تظهر أحيانًا قبل الجرس، ومن يكتبها يضيّع طلقته.' },
        { key: 'mode', type: 'choice', section: 2, icon: 'sliders', label: 'طريقة المبارزات', default: 'seq',
          options: [['seq', 'مبارزة بعد مبارزة'], ['all', 'كل المبارزات في وقت واحد']],
          descs: { seq: 'في «مبارزة بعد مبارزة» تُلعب مبارزات الجولة واحدة تلو الأخرى، ولكل مبارزة مشهدها، ثم تبدأ الجولة التالية.',
                   all: 'في «كل المبارزات في وقت واحد» يقف كل الأزواج في الشارع معًا، وجرس واحد للجميع، وكل زوج يحسمه أسرع واحد فيه.' } },
        { key: 'intro', type: 'choice', section: 2, icon: 'clock', label: 'مشهد الدخول قبل كل جولة', default: 'short',
          options: [['short', 'قصير (نحو 4 ثوانٍ)'], ['full', 'كامل (نحو 8 ثوانٍ)']] },
        { key: 'maxPlayers', type: 'number', section: 1, icon: 'userplus', label: 'الحد الأقصى للاعبين', min: 2, max: 64, default: 64 },
        { key: 'who', type: 'choice', section: 1, icon: 'shield', label: 'المسموح لهم', default: 'all',
          options: [['followers', 'المتابعون فقط'], ['all', 'الجميع']] },
        { key: 'sound', type: 'toggle', section: 3, label: 'الأصوات', default: true, desc: 'الخطوات والطلقات والموسيقى القصيرة لكل مرحلة.', options: [[false, 'متوقفة'], [true, 'مفعّلة']] }
    ];
    var SECTIONS = [{ n: 1, title: 'الدخول' }, { n: 2, title: 'المواجهة' }, { n: 3, title: 'إضافات', full: true }];
    var KEY = 'cowboy-duel:settings';

    function defaults() { var o = {}; FIELDS.forEach(function (f) { o[f.key] = f.default; }); return o; }
    /** يضبط كل قيمة ضمن خياراتها/حدودها، والباقي افتراضي. */
    function sanitize(v) {
        var d = defaults(), out = {}; v = v || {};
        FIELDS.forEach(function (f) {
            var x = v[f.key];
            if (f.type === 'number') { x = Math.round(+x); out[f.key] = isFinite(x) ? Math.min(f.max, Math.max(f.min, x)) : d[f.key]; }
            else if (f.type === 'text') out[f.key] = typeof x === 'string' && x.trim() ? x.trim().slice(0, 40) : d[f.key];
            else if (f.type === 'gift') out[f.key] = typeof x === 'string' && /^[a-z0-9-]{2,40}$/.test(x) ? x : d[f.key];
            else out[f.key] = f.options.some(function (o) { return o[0] === x; }) ? x : d[f.key];
        });
        return out;
    }
    function load() { try { return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return defaults(); } }
    function save(v) { v = sanitize(v); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } return v; }

    root.CDSettings = { FIELDS: FIELDS, SECTIONS: SECTIONS, defaults: defaults, sanitize: sanitize, load: load, save: save };
}(window));
