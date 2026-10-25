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

    // قواعد ثابتة لا تظهر بالإعدادات: أقل طول 3 أحرف، والنقاط حسب طول الكلمة
    // (3 أحرف: 1 · 4: 2 · 5: 3 · 6 فأكثر: 5) + مكافأة الكلمة الذهبية 7،
    // وحرف الوسط + أحرف الخلية + القاموس + منع الاحتساب مرتين إلزامية دائماً (wh-engine.js).
    var FIXED = { minLen: 3, points: { p3: 1, p4: 2, p5: 3, p6: 5, golden: 7 } };

    // داخل المباراة: الوقت وعدد الجولات والصوت فقط — والباقي ثابت (VIEW_FIXED)
    var SECTIONS = [
        { title: 'إعدادات المباراة', rows: [
            { type: 'choice', basic: true, key: 'matchRounds', label: 'عدد الجولات', options: ['3', '5', '7'], values: [3, 5, 7], default: 3, rule: true },
            { type: 'choice', basic: true, key: 'durationSec', label: 'مدة الجولة', options: ['3 دقائق', '4 دقائق', '5 دقائق'], values: [180, 240, 300], default: 180, rule: true },
            { type: 'toggle', basic: true, key: 'sound', label: 'الأصوات', default: true }
        ]}
    ];

    // سلوك ثابت بدون خيارات: جولة عشوائية مع تجنّب الجولات الأخيرة، عرض الإجمالي،
    // تكرار الحرف مسموح، تنبيهات المرفوض وإظهار المقبول مفعّلة، والمؤثرات كاملة.
    var VIEW_FIXED = { roundPick: 'random', roundId: '', avoidRecent: true, showTotal: true, allowRepeat: true, showErrors: true, showAccepted: true, motion: 'full' };

    function rows() { return [JOIN].concat(SECTIONS).reduce(function (a, s) { return a.concat(s.rows); }, []); }

    function defaults() {
        var out = {};
        rows().forEach(function (r) { if (r.type !== 'locked') out[r.key] = r.default; });
        return Object.assign(out, VIEW_FIXED);
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
        return Object.assign(out, VIEW_FIXED);
    }

    /** قواعد الجولة للمحرك (createSession) من الإعدادات. */
    function rules(v) {
        v = sanitize(v);
        return { durationSec: v.durationSec, minLen: FIXED.minLen, allowRepeat: v.allowRepeat,
            points: Object.assign({}, FIXED.points) };
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
        var list = ctx && ctx.basic ? [JOIN, { title: 'المباراة', rows: SECTIONS[0].rows }] : SECTIONS;
        return list.map(function (s, i) {
            var visible = s.rows.filter(function (r) { return !r.showIf || values[r.showIf] === r.showIfVal; });
            return { title: s.title, num: i + 1, span: s.full ? '1 / -1' : 'auto', delay: (i * 0.07).toFixed(2) + 's',
                rows: visible.map(function (r, k) { return viewRow(r, k, values, set, ctx); }) };
        });
    }

    return { JOIN: JOIN, FIXED: FIXED, SECTIONS: SECTIONS, rows: rows, defaults: defaults, sanitize: sanitize, rules: rules, ruleKeys: ruleKeys, viewRow: viewRow, viewSections: viewSections };
}));
