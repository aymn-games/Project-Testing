/*
 * goal-core.js — منطق «أداة الهدف» المشترك بين الويدجت (المتصفح/OBS) وخادم
 * الويب هوك (server.js على Node). بدون أي اعتماديات.
 *
 * وظيفته: تحويل أحداث Streamlabs / StreamElements / الويب هوك المخصّص إلى
 * شكل موحّد { kind, amount, name, id }، ثم حساب كم يضيف كل حدث للهدف حسب
 * نوعه (متابعين، اشتراكات، دعم مادي، بتس، مخصّص).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.GoalCore = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* أنواع الهدف المدعومة ونصوصها الافتراضية. */
    var TYPES = {
        follower:   { title: 'هدف المتابعين',  unit: 'متابع',  prefix: '' },
        subscriber: { title: 'هدف الاشتراكات', unit: 'اشتراك', prefix: '' },
        tip:        { title: 'هدف الدعم',      unit: '',       prefix: '$' },
        cheer:      { title: 'هدف البتس',      unit: 'بت',     prefix: '' },
        custom:     { title: 'الهدف',          unit: '',       prefix: '' }
    };

    /* أسماء الأحداث لكل مزوّد ← النوع الموحّد. */
    var SE_KINDS = { follower: 'follower', follow: 'follower', subscriber: 'subscriber',
        tip: 'tip', cheer: 'cheer', superchat: 'tip' };
    var SL_KINDS = { follow: 'follower', subscription: 'subscriber', resub: 'subscriber',
        donation: 'tip', superchat: 'tip', bits: 'cheer' };

    function num(v) {
        if (typeof v === 'number') { return isFinite(v) ? v : 0; }
        var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
        return isFinite(n) ? n : 0;
    }

    function round2(n) { return Math.round(n * 100) / 100; }

    /*
     * StreamElements (socket الحي): الحدث `event` شكله
     * { _id, type: 'follower'|'tip'|..., data: { amount, username, displayName } }
     * وحدث التجربة `event:test` شكله { listener: 'tip-latest', event: { amount, name } }.
     */
    function fromStreamElements(raw, isTest) {
        if (!raw) { return []; }
        var type, data, id;
        if (isTest || raw.listener) {
            type = String(raw.listener || '').replace(/-latest$/, '');
            data = raw.event || {};
            id = null;
        } else {
            type = raw.type;
            data = raw.data || {};
            id = raw._id || raw.activityId || null;
        }
        var kind = SE_KINDS[type];
        if (!kind) { return []; }
        var amount = (kind === 'tip' || kind === 'cheer') ? num(data.amount) : 1;
        // اشتراكات مهداة دفعة وحدة (bulk): العدد بالحقل amount.
        if (kind === 'subscriber' && data.bulkGifted) { amount = Math.max(1, num(data.amount)); }
        return [{ kind: kind, amount: amount,
            name: data.displayName || data.username || data.name || '', id: id }];
    }

    /*
     * Streamlabs (socket الحي): الحدث `event` شكله
     * { type: 'donation'|'follow'|..., for: '...', message: [ { amount, name, _id }, ... ] }
     * السوبرتشات مبلغه بالمايكرو (÷ 1,000,000).
     */
    function fromStreamlabs(raw) {
        if (!raw) { return []; }
        var kind = SL_KINDS[raw.type];
        if (!kind) { return []; }
        var list = Array.isArray(raw.message) ? raw.message : (raw.message ? [raw.message] : []);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var m = list[i] || {};
            var amount = 1;
            if (kind === 'tip' || kind === 'cheer') {
                amount = num(m.amount);
                if (raw.type === 'superchat') { amount = amount / 1000000; }
            }
            out.push({ kind: kind, amount: amount, name: m.name || m.from || '',
                id: m._id || m.id || m.event_id || null });
        }
        return out;
    }

    /* ويب هوك مخصّص: { type|kind, amount, name, id } — الأبسط. */
    function fromCustom(raw) {
        if (!raw) { return []; }
        var t = String(raw.kind || raw.type || 'custom').toLowerCase();
        var kind = TYPES[t] ? t : (SE_KINDS[t] || SL_KINDS[t] || 'custom');
        var amount = raw.amount == null ? 1 : num(raw.amount);
        return [{ kind: kind, amount: amount, name: raw.name || raw.username || '', id: raw.id || null }];
    }

    /* يحوّل أي حدث خام لقائمة أحداث موحّدة. */
    function normalize(provider, raw, isTest) {
        switch (String(provider || '').toLowerCase()) {
            case 'streamelements': case 'se': return fromStreamElements(raw, isTest);
            case 'streamlabs': case 'sl': return fromStreamlabs(raw);
            default: return fromCustom(raw);
        }
    }

    /*
     * كم يضيف الحدث للهدف: لازم نوع الحدث يطابق نوع الهدف. الهدف «custom»
     * يقبل أي حدث بمبلغه كما هو.
     */
    function contribution(goalType, ev) {
        if (!ev || !(ev.amount > 0)) { return 0; }
        if (!goalType || goalType === 'custom' || goalType === ev.kind) { return round2(ev.amount); }
        return 0;
    }

    function percent(current, goal) {
        if (!(goal > 0)) { return 0; }
        return Math.max(0, Math.min(100, (current / goal) * 100));
    }

    /* تنسيق الرقم: فواصل الآلاف، وخانتين عشريتين بس لو فيه كسور. */
    function format(n, locale) {
        var hasFrac = Math.abs(n - Math.round(n)) > 0.004;
        try {
            return Number(n).toLocaleString(locale || 'en-US', {
                minimumFractionDigits: hasFrac ? 2 : 0, maximumFractionDigits: hasFrac ? 2 : 0 });
        } catch (e) { return String(hasFrac ? n.toFixed(2) : Math.round(n)); }
    }

    return { TYPES: TYPES, num: num, normalize: normalize, contribution: contribution,
        percent: percent, format: format };
}));
