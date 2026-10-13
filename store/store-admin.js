/**
 * AGP STORE ADMIN — لوحة إدارة المتجر (admin-store.html، أدمن فقط):
 * الإحصائيات، المنتجات، الباكجات، التصنيفات، الاستريمرز، العروض، أكواد الخصم.
 * كل تعديل يُرسل فوراً لـ/api/admin/store/* (الحقول تُحفظ عند change، أي
 * بعد ما يخلص الأدمن كتابة الحقل) ثم تُعاد قراءة البيانات من السيرفر.
 */
(function () {
'use strict';

var S = window.AGPStore;
var h = S.h;

var TABS = [['stats', 'الإحصائيات'], ['products', 'المنتجات'], ['bundles', 'الباكجات'], ['cats', 'التصنيفات'], ['streamers', 'الاستريمرز'], ['offers', 'العروض'], ['coupons', 'أكواد الخصم']];

var state = {
    gate: 'loading', // loading | login | forbidden | ready | error
    data: null,
    tab: 'stats',
    period: '30',
    q: '',
    filterCat: 'all',
    showAdd: false,
    np: { name: '', categoryId: '', streamerId: '', subcatId: '', price: '', badge: '' },
    npErr: '',
    nb: { name: '', price: '', badge: '', items: [] },
    nbErr: '',
    newCat: '',
    ns: { name: '', user: '' },
    newSub: {},
    of: { pid: '', pct: 10, badge: '' },
    nc: { code: '', pct: '' },
    ncErr: '',
    copied: null
};

/* ---------- البيانات ---------- */

function D() { return state.data; }
function cats() { return D().categories; }
function products() { return D().products; }
function streamers() { return D().streamers; }
function catById(id) { return cats().filter(function (c) { return c.id === id; })[0] || null; }
function streamerById(id) { return streamers().filter(function (s) { return s.id === id; })[0] || null; }
function productById(id) { return products().filter(function (p) { return p.id === id; })[0] || null; }
function streamersCat() { return cats().filter(function (c) { return c.kind === 'streamers'; })[0] || null; }
function baseProducts() { return products().filter(function (p) { return !p.items && !p.hidden; }); }

function load() {
    return S.api('/api/admin/store/data').then(function (r) {
        if (r && r.success) { state.data = r; state.gate = 'ready'; }
        else if (r && r.error === 'unauthorized') state.gate = 'login';
        else if (r && r.error === 'forbidden') state.gate = 'forbidden';
        else state.gate = 'error';
        render();
    });
}

/** تعديل واحد على السيرفر ثم تحديث البيانات. يرجّع النتيجة. */
function act(path, body) {
    return S.api('/api/admin/store/' + path, { method: 'POST', body: body }).then(function (r) {
        if (!r || !r.success) S.flash(S.errorText(r && r.error), true);
        return load().then(function () { return r || {}; });
    });
}

/* ---------- رفع الصور ---------- */

function pickImage(onUrl) {
    var input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
    input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.remove();
        if (!file) return;
        S.flash('جاري رفع الصورة…');
        S.api('/api/admin/store/upload-signature', { method: 'POST', body: { fileName: file.name, fileSize: file.size } }).then(function (sig) {
            if (!sig || !sig.success) {
                if (sig && sig.error === 'uploads_not_configured') return askPath(onUrl);
                S.flash(S.errorText(sig && sig.error), true);
                return;
            }
            var fd = new FormData();
            fd.append('file', file);
            fd.append('api_key', sig.apiKey);
            fd.append('signature', sig.signature);
            Object.keys(sig.params).forEach(function (k) { fd.append(k, sig.params[k]); });
            return fetch(sig.uploadUrl, { method: 'POST', body: fd }).then(function (res) { return res.json(); }).then(function (up) {
                if (up && up.secure_url) onUrl(up.secure_url);
                else S.flash('فشل رفع الصورة', true);
            });
        }).catch(function () { S.flash('فشل رفع الصورة', true); });
    });
    document.body.appendChild(input);
    input.click();
}

/** بديل لو Cloudinary غير مفعّل: مسار صورة موجودة أصلاً داخل الموقع. */
function askPath(onUrl) {
    var path = window.prompt('رفع الصور غير مفعّل بالسيرفر.\nاكتب مسار صورة موجودة داخل الموقع (مثال: assets/win-cards/win-card-rais-blue.png):', '');
    if (path && path.trim()) onUrl(path.trim());
}

function imageThumb(url, onUrl, round) {
    var label = url ? null : h('span', { 'class': 'up' }, 'رفع صورة');
    if (round) {
        var av = S.avatar(url, '', '');
        av.style.cssText = 'width:56px;height:56px;padding:2px;cursor:pointer;';
        av.setAttribute('role', 'button');
        av.setAttribute('tabindex', '0');
        av.setAttribute('aria-label', 'تغيير الصورة');
        av.addEventListener('click', function () { pickImage(onUrl); });
        if (!url) av.firstChild.textContent = '+';
        return av;
    }
    return h('div', { 'class': 'thumb thumb--admin', role: 'button', tabindex: '0', title: 'تغيير الصورة', 'aria-label': 'تغيير الصورة', onclick: function () { pickImage(onUrl); }, onkeydown: function (e) { if (e.key === 'Enter') pickImage(onUrl); } },
        S.productImg(url), label);
}

/* ---------- عناصر مساعدة ---------- */

function select(cls, value, options, onChange, extra) {
    var el = h('select', Object.assign({ 'class': cls, onchange: function () { onChange(el.value); } }, extra || {}),
        options.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    el.value = String(value == null ? '' : value);
    return el;
}

function inlineInput(cls, value, onSave, extra) {
    var el = h('input', Object.assign({ 'class': cls, value: value }, extra || {}));
    el.addEventListener('change', function () { onSave(el.value); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.blur(); });
    return el;
}

function field(label, control) { return h('label', { 'class': 'field' }, h('span', null, label), control); }

function fin(value, placeholder, onInput, extra) {
    var el = h('input', Object.assign({ 'class': 'fin', value: value, placeholder: placeholder }, extra || {}));
    el.addEventListener('input', function () { onInput(el.value); });
    return el;
}

function catOptions() { return cats().map(function (c) { return [String(c.id), c.name]; }); }
function streamerOptions() { return streamers().map(function (s) { return [String(s.id), s.name]; }); }
function subOptions(streamerId) {
    var s = streamerById(Number(streamerId));
    return [['', 'بدون تصنيف فرعي']].concat((s ? s.subcats : []).map(function (b) { return [String(b.id), b.name]; }));
}
function deliveryOptions() { return D().deliveryOptions.map(function (o) { return [o.value, o.label]; }); }
function statsUrl(s) { return 'streamer-stats.html?s=' + s.id + '&t=' + s.statsToken; }

/* ---------- حسابات الإحصائيات (نفس قواعد ملف التسليم) ---------- */

function orderLines(orders) {
    var out = [];
    orders.forEach(function (o) {
        var sum = o.items.reduce(function (a, i) { return a + i.price; }, 0) || 1;
        var f = o.total / sum;
        o.items.forEach(function (i) { out.push({ order: o.id, t: o.createdAt, productId: i.productId, name: i.name, cat: i.categoryName, amount: i.price * f }); });
    });
    return out;
}

function streamerLines(orders, sid) {
    var out = [];
    orders.forEach(function (o) {
        var sum = o.items.reduce(function (a, i) { return a + i.price; }, 0) || 1;
        var f = o.total / sum;
        o.items.forEach(function (i) {
            if (i.parts) i.parts.forEach(function (pt) { if (pt.streamerId === sid) out.push({ amount: pt.amount * f }); });
            else if (i.streamerId === sid) out.push({ amount: i.price * f });
        });
    });
    return out;
}

function group(list, keyOf, nameOf) {
    var m = {};
    list.forEach(function (x) {
        var k = keyOf(x);
        if (k == null || k === '') return;
        m[k] = m[k] || { name: nameOf(x), units: 0, rev: 0 };
        m[k].units++;
        m[k].rev += x.amount;
    });
    var arr = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.rev - a.rev; });
    var mx = Math.max.apply(null, [1].concat(arr.map(function (x) { return x.rev; })));
    arr.forEach(function (x) { x.w = (x.rev / mx * 100).toFixed(1) + '%'; });
    return arr;
}

function rankRow(x) {
    return h('div', { 'class': 'rank-row' },
        h('div', { 'class': 'rank-top' }, h('span', { 'class': 'n' }, x.name),
            h('span', { 'class': 'r' }, h('span', { 'class': 'u' }, x.units + ' مبيع'), S.money(S.fmt(x.rev)))),
        h('div', { 'class': 'prog' }, h('div', { style: 'width:' + x.w })));
}

/* ---------- التبويبات ---------- */

function tabStats() {
    var since = state.period === 'all' ? 0 : Date.now() - Number(state.period) * 864e5;
    var orders = D().orders.filter(function (o) { return !since || o.createdAt >= since; });
    var L = orderLines(orders);
    var revenue = orders.reduce(function (a, o) { return a + o.total; }, 0);
    var barDays = state.period === '7' ? 7 : 30;
    var streamerStats = streamers().map(function (s) {
        var SL = streamerLines(orders, s.id);
        return { s: s, units: SL.length, rev: SL.reduce(function (a, l) { return a + l.amount; }, 0) };
    }).sort(function (a, b) { return b.rev - a.rev; });
    var recent = orders.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 8);

    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'sec-head' }, h('h2', null, 'المبيعات'),
            h('div', { 'class': 'seg' }, [['7', '7 أيام'], ['30', '30 يوم'], ['all', 'الكل']].map(function (p) {
                return h('button', { type: 'button', 'class': state.period === p[0] ? 'on' : '', onclick: function () { state.period = p[0]; render(); } }, p[1]);
            }))),
        h('div', { 'class': 'kpis' }, [
            ['الإيرادات', S.fmt(revenue), true], ['الطلبات', orders.length, false], ['المنتجات المباعة', L.length, false],
            ['متوسط الطلب', S.fmt(orders.length ? revenue / orders.length : 0), true]
        ].map(function (k) {
            return h('div', { 'class': 'kpi' }, h('div', { 'class': 'kpi-in' }, h('span', { 'class': 'l' }, k[0]), h('span', { 'class': 'v' }, h('span', null, k[1]), k[2] ? S.riyal() : null)));
        })),
        h('div', { 'class': 'panel' },
            h('div', { 'class': 'panel-h' }, h('h3', null, 'الإيرادات اليومية'), h('span', { 'class': 'muted' }, 'آخر ' + barDays + ' يوم')),
            S.barChart(S.daily(orders.map(function (o) { return { t: o.createdAt, total: o.total }; }), barDays, function (x) { return x.total; }))),
        h('div', { 'class': 'two-col' },
            h('div', { 'class': 'panel' }, h('h3', null, 'الأكثر مبيعاً'), group(L, function (x) { return x.productId; }, function (x) { return x.name; }).slice(0, 6).map(rankRow)),
            h('div', { 'class': 'panel' }, h('h3', null, 'حسب التصنيف'), group(L, function (x) { return x.cat; }, function (x) { return x.cat; }).map(rankRow))),
        h('div', { 'class': 'panel' }, h('h3', null, 'مبيعات الاستريمرز'),
            h('div', { 'class': 'list' }, streamerStats.map(function (x, i) {
                return h('div', { 'class': 'srow' },
                    h('span', { 'class': 'rk' }, '#' + (i + 1)),
                    S.avatar(x.s.avatarUrl, x.s.name),
                    h('div', { 'class': 'nm' }, h('b', null, x.s.name), h('span', { 'class': 'at-user', dir: 'ltr' }, '@' + x.s.user)),
                    h('span', { 'class': 'u' }, x.units + ' مبيع'),
                    S.money(S.fmt(x.rev)),
                    h('a', { 'class': 'btn-soft', href: statsUrl(x.s), target: '_blank', rel: 'noopener' }, h('span', null, 'صفحة الإحصائيات'), h('span', null, '←')));
            }))),
        h('div', { 'class': 'panel' }, h('h3', null, 'آخر الطلبات'),
            h('div', null, recent.map(function (o) {
                return h('div', { 'class': 'orow' },
                    h('span', { 'class': 'no', dir: 'ltr' }, '#' + o.id),
                    h('span', { 'class': 'dt' }, S.dateShort(o.createdAt, true)),
                    h('span', { 'class': 'nm' }, o.items.map(function (i) { return i.name; }).join('، ')),
                    o.coupon ? h('span', { 'class': 'cp', dir: 'ltr' }, o.coupon) : null,
                    S.money(S.fmt(o.total)));
            }), recent.length ? null : h('div', { 'class': 'fhint', style: 'padding:12px 0;' }, 'ما فيه طلبات بهالفترة.'))));
}

function tabProducts() {
    var sc = streamersCat();
    var q = state.q.trim();
    var rows = baseProducts().filter(function (p) {
        return (state.filterCat === 'all' || String(p.categoryId) === state.filterCat) && (!q || p.name.indexOf(q) !== -1);
    });
    var np = state.np;
    var npCat = np.categoryId || String((cats().filter(function (c) { return c.kind !== 'bundles'; })[0] || {}).id || '');
    var npIsStreamer = sc && npCat === String(sc.id);
    var npStreamer = np.streamerId || String((streamers()[0] || {}).id || '');

    var addForm = state.showAdd ? h('div', { 'class': 'form-card' }, h('div', { 'class': 'form-card-in' },
        h('h2', null, 'منتج جديد'),
        h('div', { 'class': 'fgrid' },
            field('اسم المنتج', fin(np.name, 'مثال: إطار الشتاء', function (v) { np.name = v; })),
            field('التصنيف', select('sel', npCat, cats().filter(function (c) { return c.kind !== 'bundles'; }).map(function (c) { return [String(c.id), c.name]; }), function (v) { np.categoryId = v; render(); })),
            npIsStreamer ? field('الاستريمر', select('sel', npStreamer, streamerOptions(), function (v) { np.streamerId = v; np.subcatId = ''; render(); })) : null,
            npIsStreamer ? field('تصنيف داخل صفحة الاستريمر', select('sel', np.subcatId, subOptions(npStreamer), function (v) { np.subcatId = v; })) : null,
            field('السعر (ر.س)', fin(np.price, '0', function (v) { np.price = v; }, { type: 'number', min: '0', inputmode: 'decimal' })),
            field('شارة (اختياري)', fin(np.badge, 'جديد', function (v) { np.badge = v; }))),
        h('div', { 'class': 'st-row', style: 'gap:10px;' },
            h('button', { type: 'button', 'class': 'btn-add', onclick: function () {
                if (!np.name.trim()) { state.npErr = 'اكتب اسم المنتج'; render(); return; }
                if (!(Number(np.price) > 0)) { state.npErr = 'اكتب سعر صحيح'; render(); return; }
                act('product/create', { name: np.name, categoryId: Number(npCat), streamerId: npIsStreamer ? Number(npStreamer) : null, subcatId: npIsStreamer && np.subcatId ? Number(np.subcatId) : null, price: Number(np.price), badge: np.badge }).then(function (r) {
                    if (r.success) {
                        state.np = { name: '', categoryId: npCat, streamerId: np.streamerId, subcatId: np.subcatId, price: '', badge: '' };
                        state.npErr = ''; state.showAdd = false; state.filterCat = 'all'; state.q = '';
                        render();
                    }
                });
            } }, 'حفظ المنتج'),
            h('span', { 'class': 'fhint' }, 'صورة المنتج ونوع التسليم تقدر تحددها من صف المنتج بعد الحفظ.'),
            state.npErr ? h('span', { 'class': 'ferr' }, state.npErr) : null))) : null;

    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'toolbar-adm' },
            fin(state.q, 'ابحث عن منتج', function (v) { state.q = v; renderSoon(); }, { 'aria-label': 'ابحث عن منتج' }),
            select('sel', state.filterCat, [['all', 'كل التصنيفات']].concat(catOptions()), function (v) { state.filterCat = v; render(); }, { 'aria-label': 'التصنيف' }),
            h('button', { type: 'button', 'class': 'btn-primary', style: 'font-size:14px;min-height:46px;padding:0 18px;border-radius:12px;', onclick: function () { state.showAdd = !state.showAdd; state.npErr = ''; render(); } },
                h('span', { style: 'font-size:18px;line-height:1;' }, state.showAdd ? '×' : '+'), h('span', null, state.showAdd ? 'إلغاء' : 'إضافة منتج'))),
        addForm,
        h('div', { 'class': 'list' }, rows.map(productRow), rows.length ? null : h('div', { 'class': 'empty-box', style: 'font-size:14px;' }, 'ما فيه منتجات مطابقة.')));
}

function productRow(p) {
    var sc = streamersCat();
    var isStreamer = !!p.streamerId;
    var s = streamerById(p.streamerId);
    var off = p.oldPrice ? (p.offPct != null ? p.offPct : Math.round((1 - p.price / p.oldPrice) * 100)) : '';
    var set = function (body) { body.id = p.id; return act('product/update', body); };
    return h('div', { 'class': 'arow' },
        imageThumb(p.imageUrl, function (url) { set({ imageUrl: url }); }),
        h('div', { 'class': 'arow-name' },
            inlineInput('inline-in', p.name, function (v) { set({ name: v }); }, { 'aria-label': 'اسم المنتج' }),
            h('div', { 'class': 'hints' },
                isStreamer && s ? h('span', { 'class': 's' }, 'برعاية ' + s.name) : null,
                p.oldPrice ? h('span', { 'class': 'o' }, 'عرض فعّال · قبل ' + S.price(p.oldPrice)) : null)),
        select('sel sel--row', p.categoryId, catOptions().filter(function (o) { var c = catById(Number(o[0])); return c && c.kind !== 'bundles'; }), function (v) { set({ categoryId: Number(v) }); }, { style: 'flex:0 1 170px;', 'aria-label': 'التصنيف' }),
        isStreamer && sc ? select('sel sel--row', p.streamerId, streamerOptions(), function (v) { set({ streamerId: Number(v) }); }, { style: 'flex:0 1 140px;', 'aria-label': 'الاستريمر' }) : null,
        isStreamer && sc ? select('sel sel--row', p.subcatId || '', subOptions(p.streamerId), function (v) { set({ subcatId: v ? Number(v) : null }); }, { style: 'flex:0 1 150px;', 'aria-label': 'تصنيف صفحة الاستريمر' }) : null,
        h('label', { 'class': 'box-in box-in--price' },
            inlineInput('', S.price(p.price), function (v) { set({ price: Number(v) }); }, { type: 'number', min: '0', inputmode: 'decimal', 'aria-label': 'السعر' }), h('span', null, 'ر.س')),
        h('label', { 'class': 'box-in box-in--off' + (p.oldPrice ? ' on' : ''), title: 'خصم على المنتج' },
            h('span', null, 'خصم'),
            inlineInput('', off, function (v) { set({ offPct: Number(v) || 0 }); }, { type: 'number', min: '0', max: '90', placeholder: '0', inputmode: 'numeric', 'aria-label': 'نسبة الخصم' }), h('span', null, '٪')),
        inlineInput('badge-in', p.badge, function (v) { set({ badge: v }); }, { placeholder: 'شارة', 'aria-label': 'الشارة' }),
        select('sel sel--row', p.delivery, deliveryOptions(), function (v) { set({ delivery: v }); }, { style: 'flex:0 1 190px;', title: 'وش ينضاف لمقتنيات المشتري بعد الدفع', 'aria-label': 'التسليم للبروفايل' }),
        h('button', { type: 'button', 'class': 'btn-danger', style: 'min-height:42px;padding:0 14px;', onclick: function () { if (window.confirm('حذف «' + p.name + '»؟')) act('product/delete', { id: p.id }); } }, 'حذف'));
}

function tabBundles() {
    var nb = state.nb;
    var base = baseProducts();
    var sel = nb.items;
    var sum = base.filter(function (p) { return sel.indexOf(p.id) !== -1; }).reduce(function (a, p) { return a + p.price; }, 0);
    var price = Number(nb.price);
    var summary = sel.length ? sel.length + ' منتجات · مجموعها ' + S.price(sum) + ' ر.س' + (price > 0 && sum ? ' · توفير ' + Math.max(0, Math.round((1 - price / sum) * 100)) + '٪' : '') : 'ما اخترت منتجات';
    var summaryEl = h('span', { 'class': 'fsum' }, summary);

    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'form-card' }, h('div', { 'class': 'form-card-in' },
            h('h2', null, 'باكج جديد'),
            h('div', { 'class': 'fgrid' },
                field('اسم الباكج', fin(nb.name, 'مثال: باكج البث الكامل', function (v) { nb.name = v; })),
                field('سعر الباكج (ر.س)', fin(nb.price, '0', function (v) {
                    nb.price = v;
                    var pv = Number(v);
                    summaryEl.textContent = sel.length ? sel.length + ' منتجات · مجموعها ' + S.price(sum) + ' ر.س' + (pv > 0 && sum ? ' · توفير ' + Math.max(0, Math.round((1 - pv / sum) * 100)) + '٪' : '') : 'ما اخترت منتجات';
                }, { type: 'number', min: '0', inputmode: 'decimal' })),
                field('شارة', fin(nb.badge, 'باكج', function (v) { nb.badge = v; }))),
            h('div', { style: 'display:flex;flex-direction:column;gap:8px;' },
                h('span', { style: 'font-size:12px;font-weight:600;color:#a29cb6;' }, 'اختر المنتجات'),
                h('div', { 'class': 'pick' }, base.map(function (p) {
                    var on = sel.indexOf(p.id) !== -1;
                    return h('button', { type: 'button', 'class': on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', onclick: function () {
                        nb.items = on ? sel.filter(function (x) { return x !== p.id; }) : sel.concat([p.id]);
                        render();
                    } }, h('span', null, on ? '✓' : '+'), h('span', null, p.name), h('span', { 'class': 'p' }, S.price(p.price)));
                }))),
            h('div', { 'class': 'st-row', style: 'gap:12px;' },
                h('button', { type: 'button', 'class': 'btn-add', onclick: function () {
                    if (!nb.name.trim()) { state.nbErr = 'اكتب اسم الباكج'; render(); return; }
                    if (sel.length < 2) { state.nbErr = 'اختر منتجين على الأقل'; render(); return; }
                    if (!(price > 0)) { state.nbErr = 'اكتب سعر الباكج'; render(); return; }
                    act('bundle/create', { name: nb.name, price: price, badge: nb.badge, items: sel }).then(function (r) {
                        if (r.success) { state.nb = { name: '', price: '', badge: '', items: [] }; state.nbErr = ''; render(); }
                    });
                } }, 'حفظ الباكج'),
                summaryEl,
                state.nbErr ? h('span', { 'class': 'ferr' }, state.nbErr) : null))),
        h('div', { 'class': 'cards cards--wide' }, products().filter(function (p) { return p.items; }).map(function (b) {
            var bsum = b.items.reduce(function (a, id) { var x = productById(id); return a + (x ? x.price : 0); }, 0);
            var save = bsum ? Math.max(0, Math.round((1 - b.price / bsum) * 100)) : 0;
            return h('div', { 'class': 'acard' },
                h('div', { 'class': 'acard-top' },
                    imageThumb(b.imageUrl, function (url) { act('product/update', { id: b.id, imageUrl: url }); }),
                    inlineInput('inline-in', b.name, function (v) { act('product/update', { id: b.id, name: v }); }, { style: 'flex:1;min-width:0;min-height:40px;', 'aria-label': 'اسم الباكج' }),
                    h('button', { type: 'button', 'class': 'btn-danger', onclick: function () { if (window.confirm('حذف الباكج «' + b.name + '»؟')) act('product/delete', { id: b.id }); } }, 'حذف')),
                h('div', { 'class': 'chips' }, b.items.map(function (id) { var x = productById(id); return h('span', { 'class': 'chip-v' }, x ? x.name : 'منتج محذوف'); })),
                h('div', { 'class': 'st-row dash-top', style: 'gap:10px;' },
                    h('label', { 'class': 'box-in', style: 'flex:0 0 130px;' },
                        inlineInput('', S.price(b.price), function (v) { act('product/update', { id: b.id, price: Number(v) }); }, { type: 'number', min: '0', inputmode: 'decimal', 'aria-label': 'سعر الباكج' }), h('span', null, 'ر.س')),
                    h('span', { 'class': 'old' }, S.price(bsum)),
                    h('span', { 'class': 'st-chip-green' }, 'توفير ' + save + '٪')));
        })));
}

function tabCats() {
    var input = fin(state.newCat, 'اسم التصنيف الجديد', function (v) { state.newCat = v; }, { style: 'flex:1 1 240px;width:auto;', 'aria-label': 'اسم التصنيف الجديد' });
    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'st-row', style: 'gap:10px;' }, input,
            h('button', { type: 'button', 'class': 'btn-add', onclick: function () {
                var n = state.newCat.trim();
                if (!n) return;
                act('category/create', { name: n }).then(function (r) { if (r.success) { state.newCat = ''; render(); } });
            } }, 'إضافة تصنيف')),
        h('div', { 'class': 'cards' }, cats().map(function (c) {
            var count = products().filter(function (p) { return p.categoryId === c.id; }).length;
            return h('div', { 'class': 'acard acard--row' },
                h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;' },
                    inlineInput('inline-in', c.name, function (v) { act('category/update', { id: c.id, name: v }); }, { 'aria-label': 'اسم التصنيف' }),
                    h('span', { 'class': 'sub' }, count + ' منتجات' + (c.kind === 'streamers' ? ' · تصنيف الاستريمرز' : c.kind === 'bundles' ? ' · تصنيف الباكجات' : ''))),
                h('button', { type: 'button', 'class': 'btn-soft', onclick: function () {
                    if (c.kind === 'bundles') state.tab = 'bundles';
                    else { state.tab = 'products'; state.filterCat = String(c.id); }
                    render();
                } }, 'المنتجات'),
                h('button', { type: 'button', 'class': 'btn-danger', onclick: function () {
                    if (window.confirm(count ? 'حذف التصنيف «' + c.name + '» مع ' + count + ' منتجات؟' : 'حذف التصنيف «' + c.name + '»؟')) act('category/delete', { id: c.id });
                } }, 'حذف'));
        })));
}

function tabStreamers() {
    var ns = state.ns;
    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'st-row', style: 'gap:10px;' },
            fin(ns.name, 'اسم الاستريمر', function (v) { ns.name = v; }, { style: 'flex:1 1 180px;width:auto;', 'aria-label': 'اسم الاستريمر' }),
            fin(ns.user, 'يوزر التيك توك بدون @', function (v) { ns.user = v.replace(/@/g, ''); }, { dir: 'ltr', 'class': 'fin mono', style: 'flex:1 1 180px;width:auto;text-align:right;', 'aria-label': 'يوزر التيك توك' }),
            h('button', { type: 'button', 'class': 'btn-add', onclick: function () {
                if (!ns.name.trim() || !ns.user.trim()) return;
                act('streamer/create', { name: ns.name, user: ns.user }).then(function (r) { if (r.success) { state.ns = { name: '', user: '' }; render(); } });
            } }, 'إضافة استريمر')),
        h('div', { 'class': 'cards cards--streamers' }, streamers().map(function (s) {
            var count = products().filter(function (p) { return p.streamerId === s.id; }).length;
            var url = statsUrl(s);
            return h('div', { 'class': 'acard', style: 'padding:12px;' },
                h('div', { 'class': 'acard-top' },
                    imageThumb(s.avatarUrl, function (u) { act('streamer/update', { id: s.id, avatarUrl: u }); }, true),
                    h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;' },
                        inlineInput('inline-in', s.name, function (v) { act('streamer/update', { id: s.id, name: v }); }, { style: 'min-height:34px;padding:0 8px;', 'aria-label': 'اسم الاستريمر' }),
                        inlineInput('inline-in inline-in--user', s.user, function (v) { act('streamer/update', { id: s.id, user: v }); }, { dir: 'ltr', style: 'padding:0 8px;', 'aria-label': 'يوزر التيك توك' })),
                    h('span', { 'class': 'st-chip st-chip--sm', style: 'flex:none;' }, count + ' إطارات'),
                    h('button', { type: 'button', 'class': 'btn-danger', onclick: function () { if (window.confirm('حذف الاستريمر «' + s.name + '» وإطاراته؟')) act('streamer/delete', { id: s.id }); } }, 'حذف')),
                h('div', { 'class': 'dash-top', style: 'display:flex;flex-direction:column;gap:8px;' },
                    h('div', { 'class': 'chips', style: 'padding-bottom:10px;margin-bottom:2px;border-bottom:1px dashed rgba(255,255,255,0.08);' },
                        h('a', { 'class': 'btn-soft', style: 'min-height:38px;', href: url, target: '_blank', rel: 'noopener' }, h('span', null, 'إحصائيات مبيعاته'), h('span', null, '←')),
                        h('button', { type: 'button', 'class': 'btn-ghost', onclick: function () {
                            var abs = new URL(url, location.href).href;
                            var done = function () { state.copied = s.id; render(); setTimeout(function () { state.copied = null; render(); }, 1800); };
                            if (navigator.clipboard) navigator.clipboard.writeText(abs).then(done, function () { window.prompt('انسخ الرابط:', abs); });
                            else window.prompt('انسخ الرابط:', abs);
                        } }, state.copied === s.id ? 'تم النسخ ✓' : 'نسخ الرابط')),
                    h('span', { style: 'font-size:12px;font-weight:600;color:#a29cb6;' }, 'تصنيفات صفحته'),
                    h('div', { 'class': 'chips' },
                        s.subcats.map(function (b) {
                            var n = products().filter(function (p) { return p.streamerId === s.id && p.subcatId === b.id; }).length;
                            return h('span', { 'class': 'subchip' }, h('span', null, b.name), h('span', { 'class': 'c' }, n),
                                h('button', { type: 'button', 'aria-label': 'حذف التصنيف', onclick: function () { if (window.confirm('حذف تصنيف «' + b.name + '»؟ منتجاته تبقى بدون تصنيف.')) act('subcat/delete', { id: b.id }); } }, '×'));
                        }),
                        s.subcats.length ? null : h('span', { style: 'font-size:12px;color:#6f6984;' }, 'ما فيه تصنيفات، كل منتجاته تظهر مع بعض.')),
                    h('div', { style: 'display:flex;gap:6px;' },
                        fin(state.newSub[s.id] || '', 'تصنيف جديد مثل: إطارات المعارك', function (v) { state.newSub[s.id] = v; }, { style: 'flex:1;min-width:0;width:auto;font-size:13px;min-height:40px;border-radius:10px;', 'aria-label': 'تصنيف جديد' }),
                        h('button', { type: 'button', 'class': 'btn-add btn-add--sm', onclick: function () {
                            var n = (state.newSub[s.id] || '').trim();
                            if (!n) return;
                            act('subcat/create', { streamerId: s.id, name: n }).then(function (r) { if (r.success) { state.newSub[s.id] = ''; render(); } });
                        } }, 'إضافة'))));
        })));
}

function tabOffers() {
    var noOffer = baseProducts().filter(function (p) { return !p.oldPrice; });
    var of = state.of;
    var pid = of.pid && noOffer.some(function (p) { return String(p.id) === of.pid; }) ? of.pid : String((noOffer[0] || {}).id || '');
    var preview = h('span', { style: 'font-size:13px;color:#a29cb6;' });
    function updatePreview() {
        var p = productById(Number(pid));
        var pct = Math.min(90, Math.max(1, Number(of.pct) || 0));
        preview.textContent = p ? p.name + ': ' + S.price(p.price) + ' ← ' + Math.round(p.price * (1 - pct / 100)) + ' ر.س' : 'كل المنتجات عليها عروض';
    }
    updatePreview();
    var offers = baseProducts().filter(function (p) { return p.oldPrice; });
    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'form-card' }, h('div', { 'class': 'form-card-in' },
            h('h2', null, 'عرض جديد'),
            h('div', { 'class': 'fgrid fgrid--end' },
                field('المنتج', select('sel', pid, noOffer.map(function (p) { return [String(p.id), p.name + ' · ' + S.price(p.price) + ' ر.س']; }), function (v) { of.pid = v; pid = v; updatePreview(); })),
                field('نسبة الخصم ٪', fin(of.pct, '', function (v) { of.pct = v; updatePreview(); }, { type: 'number', min: '1', max: '90', inputmode: 'numeric' })),
                field('نص الشارة', fin(of.badge, 'عرض خاص', function (v) { of.badge = v; })),
                h('button', { type: 'button', 'class': 'btn-add', onclick: function () {
                    if (!pid) return;
                    var pct = Math.min(90, Math.max(1, Number(of.pct) || 0));
                    act('offer/apply', { productId: Number(pid), pct: pct, badge: of.badge }).then(function (r) { if (r.success) { state.of = { pid: '', pct: of.pct, badge: '' }; render(); } });
                } }, 'تطبيق العرض')),
            preview)),
        h('h3', { style: 'margin:6px 0 0;font-size:15px;font-weight:700;color:#c9c3dc;' }, 'العروض الفعّالة'),
        offers.length ? h('div', { 'class': 'cards' }, offers.map(function (p) {
            return h('div', { 'class': 'offer-card' },
                h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;' },
                    h('span', { style: 'font-size:15px;font-weight:700;color:#fff;' }, p.name),
                    h('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;' },
                        h('span', { 'class': 'old' }, S.price(p.oldPrice)),
                        h('span', { style: 'color:#fff;font-weight:700;' }, S.price(p.price) + ' ر.س'),
                        h('span', { 'class': 'st-chip-green' }, 'خصم ' + Math.round((1 - p.price / p.oldPrice) * 100) + '٪'))),
                h('button', { type: 'button', 'class': 'btn-danger', onclick: function () { act('offer/remove', { productId: p.id }); } }, 'إلغاء العرض'));
        })) : h('div', { 'class': 'empty-box', style: 'padding:30px 10px;font-size:14px;' }, 'ما فيه عروض فعّالة.'));
}

function tabCoupons() {
    var nc = state.nc;
    var codeIn = fin(nc.code, 'الكود مثل SUMMER15', function (v) {
        var clean = v.toUpperCase().replace(/\s/g, '');
        nc.code = clean;
        if (codeIn.value !== clean) codeIn.value = clean;
    }, { dir: 'ltr', 'class': 'fin mono', style: 'flex:1 1 200px;width:auto;letter-spacing:1px;text-align:right;', 'aria-label': 'الكود', autocapitalize: 'characters' });
    return h('section', { 'class': 'sec' },
        h('div', { 'class': 'st-row', style: 'gap:10px;' },
            codeIn,
            h('label', { 'class': 'box-in', style: 'flex:0 0 140px;min-height:46px;border-radius:12px;padding:0 12px;' },
                fin(nc.pct, '10', function (v) { nc.pct = v; }, { type: 'number', min: '1', max: '90', inputmode: 'numeric', 'class': '', style: 'font-size:14px;font-weight:400;', 'aria-label': 'نسبة الخصم' }),
                h('span', { style: 'font-size:13px;' }, '٪ خصم')),
            h('button', { type: 'button', 'class': 'btn-add', onclick: function () {
                var code = nc.code.trim();
                var p = Number(nc.pct);
                if (!code) { state.ncErr = 'اكتب الكود'; render(); return; }
                if (!(p >= 1 && p <= 90)) { state.ncErr = 'النسبة من 1 إلى 90'; render(); return; }
                if (D().coupons.some(function (c) { return c.code.toLowerCase() === code.toLowerCase(); })) { state.ncErr = 'الكود موجود'; render(); return; }
                act('coupon/create', { code: code, pct: p }).then(function (r) {
                    if (r.success) { state.nc = { code: '', pct: '' }; state.ncErr = ''; }
                    else state.ncErr = S.errorText(r.error);
                    render();
                });
            } }, 'إنشاء كود'),
            state.ncErr ? h('span', { 'class': 'ferr', style: 'align-self:center;' }, state.ncErr) : null),
        h('div', { 'class': 'cards cards--coupons' }, D().coupons.map(function (c) {
            return h('div', { 'class': 'coupon-card' + (c.active ? '' : ' off') },
                h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;' },
                    h('span', { 'class': 'code', dir: 'ltr' }, c.code),
                    h('span', { style: 'font-size:13px;color:#a29cb6;' }, 'خصم ' + c.pct + '٪ على الطلب')),
                h('button', { type: 'button', 'class': 'toggle-pill' + (c.active ? '' : ' off'), 'aria-pressed': c.active ? 'true' : 'false', onclick: function () { act('coupon/toggle', { id: c.id }); } }, c.active ? 'فعّال' : 'موقوف'),
                h('button', { type: 'button', 'class': 'btn-danger', style: 'min-height:36px;', onclick: function () { if (window.confirm('حذف الكود ' + c.code + '؟')) act('coupon/delete', { id: c.id }); } }, 'حذف'));
        })));
}

/* ---------- الصفحة ---------- */

var renderTimer = null;
function renderSoon() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
        var active = document.activeElement;
        var isSearch = active && active.getAttribute('aria-label') === 'ابحث عن منتج';
        render();
        if (isSearch) {
            var again = document.querySelector('[aria-label="ابحث عن منتج"]');
            if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }
    }, 200);
}

var FOCUSABLE = 'input,select,button,a[href],[tabindex]';

/** إعادة الرسم تمسح الصفحة — نرجّع التركيز لنفس العنصر (بالترتيب) عشان التنقّل بين الحقول ما ينقطع. */
function render() {
    var root = document.getElementById('admin-app');
    var active = document.activeElement;
    var idx = active && root.contains(active) ? Array.prototype.indexOf.call(root.querySelectorAll(FOCUSABLE), active) : -1;
    renderInto(root);
    if (idx >= 0) {
        var next = root.querySelectorAll(FOCUSABLE)[idx];
        if (next && next.tagName === active.tagName) next.focus({ preventScroll: true });
    }
}

function renderInto(root) {
    if (state.gate === 'loading') { root.replaceChildren(h('div', { 'class': 'st-loading' }, 'جاري التحميل…')); return; }
    if (state.gate === 'login') {
        root.replaceChildren(h('div', { 'class': 'gate' }, h('span', null, 'سجّل دخول بحساب الأدمن.'),
            h('a', { 'class': 'btn btn-primary', href: 'login.html?next=' + encodeURIComponent('admin-store.html') }, 'تسجيل الدخول')));
        return;
    }
    if (state.gate === 'forbidden') { root.replaceChildren(h('div', { 'class': 'gate' }, 'هذه الصفحة للأدمن فقط.')); return; }
    if (state.gate === 'error') {
        root.replaceChildren(h('div', { 'class': 'gate' }, h('span', { 'class': 'st-error', style: 'padding:0;' }, 'تعذّر تحميل البيانات.'),
            h('button', { type: 'button', 'class': 'btn btn-back', onclick: function () { state.gate = 'loading'; render(); load(); } }, 'إعادة المحاولة')));
        return;
    }

    var counts = {
        stats: D().orders.length,
        products: baseProducts().length,
        bundles: products().filter(function (p) { return p.items; }).length,
        cats: cats().length,
        streamers: streamers().length,
        offers: baseProducts().filter(function (p) { return p.oldPrice; }).length,
        coupons: D().coupons.length
    };
    var body = { stats: tabStats, products: tabProducts, bundles: tabBundles, cats: tabCats, streamers: tabStreamers, offers: tabOffers, coupons: tabCoupons }[state.tab]();

    root.replaceChildren(
        h('header', { 'class': 'adm-head' },
            h('div', { 'class': 'adm-head-t' },
                h('span', { 'class': 'st-pill-label' }, h('span', { 'class': 'dot' }), 'لوحة تحكم الأدمن'),
                h('h1', null, 'إدارة المتجر'),
                h('p', null, 'كل تعديل يُحفظ تلقائياً ويظهر في المتجر مباشرة.')),
            h('div', { 'class': 'st-row', style: 'gap:8px;' },
                h('a', { 'class': 'btn btn-primary', href: 'store.html' }, h('span', null, 'عرض المتجر'), h('span', null, '←')))),
        h('nav', { 'class': 'adm-nav', role: 'tablist' }, TABS.map(function (t) {
            var on = state.tab === t[0];
            return h('button', { type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', 'class': 'adm-tab' + (on ? ' on' : ''), onclick: function () { state.tab = t[0]; render(); } },
                h('span', null, t[1]), h('span', { 'class': 'cnt' }, counts[t[0]]));
        })),
        body);
}

render();
load();
})();
