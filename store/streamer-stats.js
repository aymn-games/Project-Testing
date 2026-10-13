/**
 * AGP STORE — إحصائيات مبيعات استريمر (streamer-stats.html?s=<id>&t=<token>).
 * السطور (منتجاته + حصته من الباكجات، بعد خصم الأكواد) يحسبها السيرفر؛
 * هنا التجميع حسب الفترة والعرض فقط. بدون ?s والمستخدم أدمن: يظهر شريط
 * اختيار الاستريمر.
 */
(function () {
'use strict';

var S = window.AGPStore;
var h = S.h;
var params = new URLSearchParams(location.search);
var state = { sid: params.get('s') || '', token: params.get('t') || '', multi: !params.get('s'), period: '30', data: null, error: '' };

function load() {
    state.error = '';
    S.api('/api/store/streamer-stats?s=' + encodeURIComponent(state.sid) + '&t=' + encodeURIComponent(state.token)).then(function (r) {
        if (r && r.success) { state.data = r; state.sid = String(r.streamer.id); }
        else state.error = r && (r.error === 'forbidden' || r.error === 'unauthorized') ? 'الرابط غير صالح أو ما عندك صلاحية.' : S.errorText(r && r.error);
        render();
    });
}

function render() {
    var root = document.getElementById('stats-app');
    if (state.error) { root.replaceChildren(h('div', { 'class': 'st-error' }, state.error)); return; }
    if (!state.data) { root.replaceChildren(h('div', { 'class': 'st-loading' }, 'جاري التحميل…')); return; }

    var d = state.data;
    var s = d.streamer;
    var since = state.period === 'all' ? 0 : Date.now() - Number(state.period) * 864e5;
    var L = d.lines.filter(function (l) { return !since || l.t >= since; });
    var rev = L.reduce(function (a, l) { return a + l.amount; }, 0);
    var ordersN = {};
    L.forEach(function (l) { ordersN[l.order] = true; });
    var barDays = state.period === '7' ? 7 : 30;

    var m = {};
    L.forEach(function (l) {
        m[l.productId] = m[l.productId] || { productId: l.productId, name: l.name, units: 0, r: 0 };
        m[l.productId].units++;
        m[l.productId].r += l.amount;
    });
    var arr = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.r - a.r; });
    var mp = Math.max.apply(null, [1].concat(arr.map(function (x) { return x.r; })));
    var recent = L.slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 10);

    root.replaceChildren(
        h('div', { 'class': 'hero-card shead' }, h('div', { 'class': 'hero-card-in' },
            S.avatar(s.avatarUrl, s.name, 'avatar--glow'),
            h('div', { 'class': 'shead-t' },
                h('span', { 'class': 'lbl' }, 'إحصائيات مبيعات الاستريمر'),
                h('h1', null, s.name),
                h('span', { 'class': 'at-user', dir: 'ltr' }, '@' + s.user)),
            h('div', { 'class': 'seg' }, [['7', '7 أيام'], ['30', '30 يوم'], ['all', 'الكل']].map(function (p) {
                return h('button', { type: 'button', 'class': state.period === p[0] ? 'on' : '', onclick: function () { state.period = p[0]; render(); } }, p[1]);
            })))),
        state.multi && d.streamers ? h('div', { 'class': 'pick-row' }, d.streamers.map(function (x) {
            return h('button', { type: 'button', 'class': String(x.id) === state.sid ? 'on' : '', onclick: function () { state.sid = String(x.id); load(); } }, x.name);
        })) : null,
        h('div', { 'class': 'kpis' }, [
            ['إجمالي المبيعات', S.fmt(rev), true], ['القطع المباعة', L.length, false], ['عدد الطلبات', Object.keys(ordersN).length, false]
        ].map(function (k) {
            return h('div', { 'class': 'kpi' }, h('div', { 'class': 'kpi-in' }, h('span', { 'class': 'l' }, k[0]), h('span', { 'class': 'v' }, h('span', null, k[1]), k[2] ? S.riyal() : null)));
        })),
        h('div', { 'class': 'panel' },
            h('div', { 'class': 'panel-h' }, h('h2', { 'class': 'ph' }, 'المبيعات اليومية'), h('span', { 'class': 'muted' }, 'آخر ' + barDays + ' يوم')),
            S.barChart(S.daily(L, barDays, function (x) { return x.amount; }), 'bars--sm')),
        h('div', { 'class': 'two-col', style: 'grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));' },
            h('div', { 'class': 'panel', style: 'gap:12px;' },
                h('h2', { 'class': 'ph' }, 'مبيعات كل منتج'),
                arr.map(function (x) {
                    return h('div', { 'class': 'pstat' },
                        h('div', { 'class': 'thumb thumb--sm' }, S.productImg(d.images[x.productId])),
                        h('div', { 'class': 'pstat-t' },
                            h('div', { 'class': 'pstat-top' }, h('span', { 'class': 'n' }, x.name), h('span', { 'class': 'r' }, S.fmt(x.r) + ' ر.س')),
                            h('div', { 'class': 'prog' }, h('div', { style: 'width:' + (x.r / mp * 100).toFixed(1) + '%' })),
                            h('span', { 'class': 'u' }, x.units + ' مبيع')));
                }),
                arr.length ? null : h('span', { style: 'font-size:14px;color:#8f89a3;' }, 'ما فيه مبيعات بهالفترة.')),
            h('div', { 'class': 'panel', style: 'gap:4px;' },
                h('h2', { 'class': 'ph', style: 'margin-bottom:8px;' }, 'آخر المبيعات'),
                recent.map(function (l) {
                    return h('div', { 'class': 'sale-row' },
                        h('span', { 'class': 'n' }, l.name),
                        l.via ? h('span', { 'class': 'via' }, 'ضمن ' + l.via) : null,
                        h('span', { 'class': 'd' }, S.dateShort(l.t)),
                        h('span', { 'class': 'a' }, S.fmt(l.amount) + ' ر.س'));
                })))
    );
}

render();
load();
})();
