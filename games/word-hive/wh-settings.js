/**
 * خلية الكلمات — تعريف الإعدادات المشترك بين شاشة الإعدادات (index.html)
 * ولوحة «إعدادات اللعبة» داخل شاشة اللعب (game.html).
 *
 * نفس صيغة قالب روليت الإقصاء:
 *   choice : اختيار واحد   { key, label, options:[...], values:[...], default:قيمة }
 *   number : رقم مع − و +   { key, label, min, max, step, default }
 *   toggle : تشغيل / إيقاف  { key, label, default }
 *   select : قائمة منسدلة   { key, label, showIf } (قائمة الجولات المعتمدة)
 *   locked : قاعدة ثابتة لا يغيّرها أي إعداد (حرف الوسط، القاموس، التطبيع…)
 * rule:true = إعداد يؤثر على قواعد الجولة؛ تعديله أثناء جولة جارية يُحفظ
 * ويُطبَّق من الجولة القادمة (الجولة الحالية تحتفظ بنسخة قواعدها).
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WHSettings = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // الدخول (شاشة الإعدادات الأساسية واللوبي): كلمة الدخول بالشات، الحد الأقصى، والمسموح لهم
    var JOIN = { title: 'الدخول', join: true, rows: [
        { type: 'text', key: 'keyword', label: 'كلمة الدخول', placeholder: 'اكتب كلمة الدخول', default: '' },
        { type: 'number', key: 'maxPlayers', label: 'الحد الأقصى للاعبين', min: 1, max: 200, step: 1, default: 50 },
        { type: 'choice', key: 'who', label: 'المسموح لهم', options: ['المتابعين فقط', 'الجميع'], values: ['followers', 'all'], default: 'all' }
    ]};

    // قواعد ثابتة لا تظهر بالإعدادات: أقل طول 3 أحرف، ومكافأة الكلمة الذهبية 7 نقاط،
    // وحرف الوسط + أحرف الخلية + القاموس + منع الاحتساب مرتين إلزامية دائماً (wh-engine.js).
    var FIXED = { minLen: 3, golden: 7 };

    var SECTIONS = [
        { title: 'إعدادات الجولة', rows: [
            { type: 'choice', basic: true, key: 'matchRounds', label: 'عدد الجولات', options: ['3', '5', '7'], values: [3, 5, 7], default: 3, rule: true },
            { type: 'choice', basic: true, key: 'durationSec', label: 'مدة الجولة', options: ['3 دقائق', '4 دقائق', '5 دقائق'], values: [180, 240, 300], default: 180, rule: true },
            { type: 'choice', basic: true, key: 'difficulty', label: 'مستوى الصعوبة', options: ['سهل', 'متوسط', 'مختلط'], values: ['easy', 'medium', 'mixed'], default: 'mixed', rule: true },
            { type: 'choice', key: 'roundPick', label: 'اختيار الجولة', options: ['عشوائية', 'يدوية'], values: ['random', 'manual'], default: 'random', rule: true },
            { type: 'select', key: 'roundId', label: 'الجولة المحددة', showIf: 'roundPick', showIfVal: 'manual', default: '', rule: true },
            { type: 'toggle', key: 'avoidRecent', label: 'منع تكرار الجولات الأخيرة', default: true },
            { type: 'toggle', key: 'showTotal', label: 'عرض إجمالي الكلمات', default: true }
        ]},
        { title: 'إعدادات الكلمات', rows: [
            { type: 'toggle', key: 'allowRepeat', label: 'السماح بتكرار الحرف', default: true, rule: true },
            { type: 'toggle', key: 'showErrors', label: 'تنبيهات الكلمات المرفوضة', default: true },
            { type: 'toggle', key: 'showAccepted', label: 'إظهار الكلمات المقبولة', default: true }
        ]},
        { title: 'إعدادات النقاط', rows: [
            { type: 'number', key: 'p3', label: 'كلمة من 3 أحرف', min: 0, max: 50, step: 1, default: 1, rule: true },
            { type: 'number', key: 'p4', label: 'كلمة من 4 أحرف', min: 0, max: 50, step: 1, default: 2, rule: true },
            { type: 'number', key: 'p5', label: 'كلمة من 5 أحرف', min: 0, max: 50, step: 1, default: 3, rule: true },
            { type: 'number', key: 'p6', label: 'كلمة من 6 أحرف فأكثر', min: 0, max: 50, step: 1, default: 5, rule: true }
        ]},
        { title: 'العرض', rows: [
            { type: 'choice', key: 'motion', label: 'المؤثرات الحركية', options: ['كاملة', 'مخففة', 'بدون'], values: ['full', 'low', 'off'], default: 'full' },
            { type: 'toggle', basic: true, key: 'sound', label: 'الأصوات', default: true }
        ]}
    ];

    function rows() { return [JOIN].concat(SECTIONS).reduce(function (a, s) { return a.concat(s.rows); }, []); }

    function defaults() {
        var out = {};
        rows().forEach(function (r) { if (r.type !== 'locked') out[r.key] = r.default; });
        return out;
    }

    /** يدمج القيم المحفوظة مع الافتراضية ويضبط كل قيمة ضمن خياراتها/حدودها. */
    function sanitize(v) {
        var d = defaults(), out = {};
        v = v || {};
        rows().forEach(function (r) {
            if (r.type === 'locked') return;
            var x = v[r.key];
            if (r.type === 'choice') out[r.key] = r.values.indexOf(x) !== -1 ? x : d[r.key];
            else if (r.type === 'toggle') out[r.key] = typeof x === 'boolean' ? x : d[r.key];
            else if (r.type === 'text') out[r.key] = typeof x === 'string' ? x.trim().slice(0, 40) : d[r.key];
            else if (r.type === 'number') { var n = Math.round(+x); out[r.key] = x === '' || x == null || isNaN(n) ? d[r.key] : Math.max(r.min, Math.min(r.max, n)); }
            else out[r.key] = typeof x === 'string' ? x : d[r.key];
        });
        return out;
    }

    /** قواعد الجولة للمحرك (createSession) من الإعدادات. */
    function rules(v) {
        v = sanitize(v);
        return { durationSec: v.durationSec, minLen: FIXED.minLen, allowRepeat: v.allowRepeat,
            points: { p3: v.p3, p4: v.p4, p5: v.p5, p6: v.p6, golden: FIXED.golden } };
    }

    function ruleKeys() { return rows().filter(function (r) { return r.rule; }).map(function (r) { return r.key; }); }

    function seg(on) {
        return { bg: on ? 'linear-gradient(90deg, #7c3aed, #a855f7)' : 'transparent', fg: on ? '#fff' : '#a8a3b5', sh: on ? '0 6px 20px rgba(139,92,246,.4)' : 'none' };
    }

    /**
     * عرض صف إعداد لقالب الأقسام (نفس حقول قالب روليت الإقصاء):
     * العنوان يمين والعنصر التفاعلي يسار بصف flex واحد (CLAUDE.md).
     * values: القيم الحالية · set(key, value) · ctx.rounds: [{id, label}] للجولة المحددة.
     */
    function viewRow(r, idx, values, set, ctx) {
        var v = values[r.key], t = r.type;
        var row = { hint: r.hint || null, label: r.label, dot: r.dot || null, divider: idx > 0, isInline: true, value: v,
            isNumber: t === 'number', isChoice: t === 'choice', isToggle: t === 'toggle', isSelect: t === 'select', isLocked: t === 'locked',
            isText: t === 'text', isMulti: false, isSupport: false, text: r.text || '', placeholder: r.placeholder || '' };
        if (t === 'text') row.onInput = function (e) { set(r.key, e.target.value); };
        if (t === 'number') {
            var clamp = function (n) { return Math.min(r.max, Math.max(r.min, n)); };
            row.dec = function () { set(r.key, clamp((+v || 0) - r.step)); };
            row.inc = function () { set(r.key, clamp((+v || 0) + r.step)); };
            row.onInput = function (e) {
                var d = e.target.value.replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); }).replace(/\D/g, '');
                set(r.key, d === '' ? '' : Math.min(r.max, +d));
            };
        }
        if (t === 'choice') row.opts = r.options.map(function (l, k) {
            var val = r.values[k];
            return Object.assign({ label: l, pick: function () { set(r.key, val); } }, seg(v === val));
        });
        if (t === 'toggle') {
            row.on = !!v; row.flip = function () { set(r.key, !v); };
            row.knobSide = v ? 'flex-start' : 'flex-end';
            row.trackBg = v ? 'linear-gradient(90deg, #7c3aed, #a855f7)' : 'rgba(255,255,255,.12)';
        }
        if (t === 'select') {
            row.opts = [{ value: '', label: 'اختر جولة' }].concat((ctx && ctx.rounds) || []);
            row.value = v || '';
            row.onInput = function (e) { set(r.key, e.target.value); };
        }
        return row;
    }

    /**
     * أقسام الإعدادات جاهزة للقالب (مع إخفاء الصفوف المشروطة).
     * ctx.basic: شاشة الإعدادات الأساسية (الدخول + أساسيات المباراة فقط)،
     * وإلا لوحة الإعدادات داخل اللعبة (كل الأقسام عدا الدخول).
     */
    function viewSections(values, set, ctx) {
        var list = ctx && ctx.basic
            ? [JOIN, { title: 'المباراة', rows: rows().filter(function (r) { return r.basic; }) }]
            : SECTIONS;
        return list.map(function (s, i) {
            var visible = s.rows.filter(function (r) { return !r.showIf || values[r.showIf] === r.showIfVal; });
            return { title: s.title, num: i + 1, span: s.full ? '1 / -1' : 'auto', delay: (i * 0.07).toFixed(2) + 's',
                rows: visible.map(function (r, k) { return viewRow(r, k, values, set, ctx); }) };
        });
    }

    return { JOIN: JOIN, FIXED: FIXED, SECTIONS: SECTIONS, rows: rows, defaults: defaults, sanitize: sanitize, rules: rules, ruleKeys: ruleKeys, viewRow: viewRow, viewSections: viewSections };
}));
