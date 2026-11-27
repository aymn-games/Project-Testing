/**
 * الهرم — تعريف الإعدادات (شاشة الإعدادات + منطق اللعبة). نفس شكل cowboy-duel/cd-settings.js.
 * choice : اختيار واحد  { key, label, options:[[قيمة, نص], ...], default, desc | descs:{قيمة: نص} }
 * number : رقم           { key, label, min, max, default }
 * الحفظ في localStorage (لكل متصفح) — لو التخزين مقفل تشتغل اللعبة بالقيم الافتراضية.
 * «جودة الرسومات» بصرية فقط: ما تغيّر أي قاعدة أو نتيجة (pyr-game.js ما يقراها أبداً).
 */
(function (root) {
    'use strict';
    var FIELDS = [
        { key: 'keyword', type: 'text', section: 1, label: 'كلمة الدخول', placeholder: 'اكتب كلمة الدخول', default: 'دخول', desc: 'المشاهد يكتبها بالشات عشان يدخل الساحة.' },
        { key: 'maxPlayers', type: 'number', section: 1, label: 'الحد الأقصى للاعبين', min: 2, max: 64, default: 56 },
        { key: 'who', type: 'choice', section: 1, label: 'المسموح لهم', default: 'all',
          options: [['followers', 'المتابعون فقط'], ['all', 'الجميع']] },
        { key: 'pickTime', type: 'choice', section: 2, label: 'وقت اختيار الرقم', default: 20,
          options: [[10, '10 ث'], [15, '15 ث'], [20, '20 ث'], [30, '30 ث'], [45, '45 ث']],
          desc: 'كل لاعب يكتب رقم دائرة فاضية بالشات. يقدر يغيّر رقمه لين يخلص الوقت، ومن ما يختار يُقصى.' },
        { key: 'intro', type: 'choice', section: 2, label: 'لقطة تقديم الساحة', default: 'full',
          options: [['full', 'كاملة'], ['short', 'قصيرة']] },
        { key: 'quality', type: 'choice', section: 3, label: 'جودة الرسومات', default: 'auto',
          options: [['auto', 'تلقائي'], ['low', 'منخفضة'], ['balanced', 'متوازنة'], ['high', 'قوية']],
          descs: { auto: 'الموصى به: يفحص أداء جهازك الفعلي ويختار الأنسب، ويخفّف المؤثرات تدريجياً لو نزلت السلاسة.',
                   low: 'للأجهزة الضعيفة: بدون ظلال، مؤثرات وجسيمات أقل، ديكور أقل. الشخصيات والدوائر والأرقام واضحة كما هي.',
                   balanced: 'الخيار اليدوي الموصى به: ظلال وإضاءة ومؤثرات متوسطة، مناسب لأغلب الأجهزة.',
                   high: 'للأجهزة القوية: دقة أعلى وظلال ناعمة ومؤثرات وجسيمات أغنى.' } },
        { key: 'sound', type: 'toggle', section: 3, label: 'الأصوات', default: true, desc: 'مؤثرات الاختيار والتشويق والإقصاء والفوز، بمستوى هادئ لا يغطي على صوتك.', options: [[false, 'متوقفة'], [true, 'مفعّلة']] }
    ];
    var SECTIONS = [{ n: 1, title: 'الدخول' }, { n: 2, title: 'الجولات' }, { n: 3, title: 'الرسومات والصوت', full: true }];
    var KEY = 'pyramid:settings';

    function defaults() { var o = {}; FIELDS.forEach(function (f) { o[f.key] = f.default; }); return o; }
    function sanitize(v) {
        var d = defaults(), out = {}; v = v || {};
        FIELDS.forEach(function (f) {
            var x = v[f.key];
            if (f.type === 'number') { x = Math.round(+x); out[f.key] = isFinite(x) ? Math.min(f.max, Math.max(f.min, x)) : d[f.key]; }
            else if (f.type === 'text') out[f.key] = typeof x === 'string' && x.trim() ? x.trim().slice(0, 40) : d[f.key];
            else out[f.key] = f.options.some(function (o) { return o[0] === x; }) ? x : d[f.key];
        });
        return out;
    }
    function load() { try { return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return defaults(); } }
    function save(v) { v = sanitize(v); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } return v; }

    root.PYSettings = { FIELDS: FIELDS, SECTIONS: SECTIONS, defaults: defaults, sanitize: sanitize, load: load, save: save };
}(window));
