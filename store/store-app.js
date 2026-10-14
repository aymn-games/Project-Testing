/**
 * AGP STORE — واجهة المتجر (store.html): المتجر، صفحات الاستريمرز، برنامج
 * الاستريمرز، السلة والدفع، نجاح الدفع، وطلباتي. التنقّل عبر hash:
 * #c-<categoryId>  #s-<streamerId>[-<subcatId>]  #sell  #cart  #orders  #success
 * كل الأسعار والإجماليات النهائية يحسبها السيرفر عند الدفع
 * (backend/store/store-service.js) — الحساب هنا للعرض فقط.
 */
(function () {
'use strict';

var S = window.AGPStore;
var h = S.h;
var CART_KEY = 'agp-store-cart';
var FAV_KEY = 'agp-store-favs';
var MOBILE_KEY = 'agp-store-mobile';
var PLAN_ORDER = ['basic', 'mid', 'full'];
var PLAN_FEATURES = { basic: ['إطاران'], mid: ['إطاران', 'بطاقة إقصاء'], full: ['إطاران', 'بطاقة إقصاء', 'بطاقة فوز'] };
var PLAN_CATEGORY = 'اشتراك متجر الاستريمر';
var PAY_METHODS = [['mada', 'مدى'], ['applepay', 'Apple Pay'], ['card', 'بطاقة ائتمانية'], ['stcpay', 'STC Pay']];
var PROFILE_URL = 'profile.html';
var FAQ = [
    ['كيف أبدأ؟', ['اختر الباقة المناسبة لك، وبعد إتمام الدفع نبدأ بتجهيز 3 نماذج لتصميم منتجاتك بناءً على فكرتك ووصفك. تختار نموذجًا واحدًا للتنفيذ، ولا يشمل الطلب تقديم نماذج إضافية.']],
    ['متى يبدأ تجهيز التصاميم؟', ['يبدأ تجهيز النماذج بعد تأكيد الدفع واستلام تفاصيل فكرتك. مدة التجهيز تُوضّح لك عند تقديم الطلب.']],
    ['هل يوجد اشتراك شهري؟', ['نعم، يشمل أول اشتراك شهرين، وبعدها يتجدد شهريًا حسب الباقة. رسوم التجديد مقابل استمرار إتاحة متجرك للبيع.']],
    ['هل يوجد شهر مجاني؟', ['نعم، عند اشتراكك لأول مرة تحصل على شهر إضافي مجاني. تدفع قيمة الباقة مرة واحدة، وتحصل على شهرين من الاشتراك بدل شهر واحد.', 'بعد انتهاء الشهرين، يتجدد اشتراكك شهريًا بنفس سعر الباقة التي اخترتها.']],
    ['هل يتغير سعر التجديد؟', ['لا، سعر التجديد ثابت حسب باقتك، ولا توجد زيادة على السعر المعلن إلا إذا تم إبلاغك بأي تغيير قبل تطبيقه.']],
    ['هل أقدر أغيّر باقتي؟', ['نعم، يمكنك الترقية إلى باقة أعلى مقابل فرق السعر المعلن، وستظهر لك تفاصيل الترقية قبل الدفع.']],
    ['كيف أحدد سعر منتجاتي؟', ['استخدم حاسبة الأسعار واختر:'], [['سعر البيع:', 'أدخل السعر الذي سيدفعه العميل، وستظهر لك الأرباح المتوقعة.'], ['صافي الربح:', 'أدخل المبلغ الذي ترغب في استلامه، وستقترح الحاسبة سعر البيع المناسب.']]],
    ['وش الرسوم التي تُخصم من المبيعات؟', ['تُحتسب رسوم البيع وتشغيل المتجر، بالإضافة إلى رسوم معالجة الدفع والضريبة حسب الرسوم الفعلية. تعرض الحاسبة صافي المبلغ المتوقع قبل اعتماد السعر.']],
    ['هل أضمن تحقيق مبيعات؟', ['لا، تجهيز متجرك يتيح لك عرض منتجاتك، لكن المبيعات تعتمد على إقبال جمهورك.']],
    ['هل أقدر أضيف منتجات؟', ['نعم، يمكنك طلب منتجات إضافية مقابل رسوم يتم تحديدها حسب نوع المنتج ومتطلبات تصميمه.']]
];

var state = {
    data: null,
    loadError: false,
    view: 'store',
    cat: 'all',
    streamer: null,
    sub: null,
    cart: readJson(CART_KEY, {}),
    fav: {},
    coupon: '',
    couponPct: 0,
    couponCode: '',
    couponMsg: '',
    couponErr: false,
    pay: 0,
    paying: false,
    payError: '',
    mobile: readText(MOBILE_KEY),
    mobileErr: false,
    verify: null, // {orderId, status: 'checking'|'pending'|'failed'|'error', tries}
    lastOrder: null,
    orders: null,
    ordersError: '',
    faqOpen: 0
};

function readJson(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; }
}
function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
function readText(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
function writeText(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

/** نفس تحقق السيرفر: جوال سعودي يبدأ بـ05 (يقبل 5xxxxxxxx و9665xxxxxxxx والأرقام العربية). */
function normalizeMobile(raw) {
    var d = String(raw || '').replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); }).replace(/[^\d]/g, '');
    if (/^9665\d{8}$/.test(d)) d = '0' + d.slice(3);
    else if (/^5\d{8}$/.test(d)) d = '0' + d;
    return /^05\d{8}$/.test(d) ? d : null;
}
function usesGateway() { return !!(state.data && state.data.gateway && state.data.gateway !== 'mock'); }

function me() { return window.AGPAuth && window.AGPAuth.getToken() ? window.AGPAuth.getCachedUser() : null; }
function meName(u) { return (u && (u.tiktok_display_name || u.username)) || ''; }
function meUser(u) { return (u && (u.tiktok_username || u.username)) || ''; }

function loginUrl(hash) { return 'login.html?next=' + encodeURIComponent('store.html' + (hash || '')); }

/* ---------- البيانات المشتقة ---------- */

function cats() { return state.data ? state.data.categories : []; }
function products() { return state.data ? state.data.products : []; }
function streamers() { return state.data ? state.data.streamers : []; }
function streamersCat() { return cats().filter(function (c) { return c.kind === 'streamers'; })[0] || null; }
function catById(id) { return cats().filter(function (c) { return c.id === id; })[0] || null; }
function productById(id) { return products().filter(function (p) { return p.id === id; })[0] || null; }
function visible() { return products().filter(function (p) { return !p.hidden; }); }
function catName(p) { if (p.plan) return PLAN_CATEGORY; var c = catById(p.categoryId); return c ? c.name : ''; }
function cartIds() { return Object.keys(state.cart).map(Number).filter(function (id) { return !!productById(id); }); }
function cartProducts() { return cartIds().map(productById); }
function inCart(id) { return !!state.cart[id]; }
function offPct(p) { return p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0; }

function totals() {
    var list = cartProducts();
    var total = list.reduce(function (a, p) { return a + p.price; }, 0);
    var savings = list.reduce(function (a, p) { return a + (p.oldPrice ? p.oldPrice - p.price : 0); }, 0);
    var disc = state.couponPct ? Math.round(total * state.couponPct / 100) : 0;
    var grand = Math.round((total - disc) * 100) / 100;
    return { total: total, savings: savings, disc: disc, grand: grand, subtotal: total + savings, vat: (grand - grand / 1.15).toFixed(2) };
}

/* ---------- التنقّل ---------- */

function go(hash) {
    if (location.hash === hash || (!hash && !location.hash)) { applyHash(); return; }
    if (hash) location.hash = hash;
    else history.pushState(null, '', location.pathname + location.search);
    if (!hash) applyHash();
}

function applyHash() {
    var hsh = (location.hash || '').slice(1);
    var prevView = state.view;
    state.view = 'store';
    state.cat = 'all';
    state.streamer = null;
    state.sub = null;
    var m;
    if (hsh === 'cart' || hsh === 'orders' || hsh === 'sell') {
        state.view = hsh;
    } else if (hsh === 'success') {
        state.view = state.lastOrder ? 'success' : 'store';
    } else if ((m = /^c-(\d+)$/.exec(hsh))) {
        state.cat = catById(Number(m[1])) ? Number(m[1]) : 'all';
    } else if ((m = /^s-(\d+)(?:-(\d+))?$/.exec(hsh))) {
        var sc = streamersCat();
        if (sc) {
            state.cat = sc.id;
            if (streamers().some(function (s) { return s.id === Number(m[1]); })) {
                state.streamer = Number(m[1]);
                state.sub = m[2] ? Number(m[2]) : null;
            }
        }
    }
    if (state.view === 'orders') loadOrders();
    if (state.view !== prevView) S.scrollTop();
    render();
}

/* ---------- الأفعال ---------- */

function toggleCart(p) {
    if (state.cart[p.id]) delete state.cart[p.id];
    else state.cart[p.id] = 1;
    writeJson(CART_KEY, state.cart);
    render();
}

function pickPlan(p) {
    if (inCart(p.id)) { go('#cart'); return; }
    products().forEach(function (x) { if (x.plan) delete state.cart[x.id]; });
    state.cart[p.id] = 1;
    writeJson(CART_KEY, state.cart);
    render();
}

function toggleFav(p) {
    var on = !state.fav[p.id];
    if (on) state.fav[p.id] = true; else delete state.fav[p.id];
    render();
    if (me()) {
        S.api('/api/store/favorite', { method: 'POST', body: { productId: p.id, on: on } });
    } else {
        writeJson(FAV_KEY, state.fav);
    }
}

function resetCoupon() {
    state.couponPct = 0;
    state.couponCode = '';
    state.couponMsg = '';
    state.couponErr = false;
}

function applyCoupon() {
    var code = state.coupon.trim();
    if (!code) return;
    S.api('/api/store/coupon', { method: 'POST', body: { code: code } }).then(function (r) {
        if (r && r.success) {
            state.couponPct = r.pct;
            state.couponCode = r.code;
            state.couponErr = false;
            state.couponMsg = 'تم تطبيق خصم ' + r.pct + '٪';
        } else {
            state.couponPct = 0;
            state.couponCode = '';
            state.couponErr = true;
            state.couponMsg = S.errorText((r && r.error) || 'invalid_coupon');
        }
        render();
    });
}

function pay() {
    if (state.paying) return;
    if (!me()) { location.href = loginUrl('#cart'); return; }
    var items = cartIds();
    if (!items.length) return;
    var mobile = '';
    if (usesGateway()) {
        mobile = normalizeMobile(state.mobile);
        if (!mobile) { state.mobileErr = true; state.payError = S.errorText('invalid_mobile'); render(); return; }
        writeText(MOBILE_KEY, mobile);
    }
    state.paying = true;
    state.payError = '';
    render();
    S.api('/api/store/checkout', { method: 'POST', body: { items: items, coupon: state.couponCode || '', method: PAY_METHODS[state.pay][0], mobile: mobile } }).then(function (r) {
        if (r && r.success && r.redirectUrl) {
            // البوابة: التحويل لصفحة الدفع. السلة تبقى لين يتأكد الدفع (لو لغى يرجع يلقاها).
            location.href = r.redirectUrl;
            return;
        }
        state.paying = false;
        if (r && r.success && r.order) {
            state.lastOrder = r.order;
            state.cart = {};
            writeJson(CART_KEY, state.cart);
            state.coupon = '';
            resetCoupon();
            state.orders = null;
            go('#success');
            return;
        }
        if (r && r.error === 'unauthorized') { location.href = loginUrl('#cart'); return; }
        if (r && r.error === 'invalid_coupon') { resetCoupon(); state.couponErr = true; state.couponMsg = S.errorText('invalid_coupon'); }
        state.payError = S.errorText(r && r.error) + (r && r.detail ? ' — ' + r.detail : '');
        if (r && r.error === 'product_unavailable') loadStore();
        render();
    });
}

/** بعد الرجوع من بوابة الدفع (store.html?order=ID): السيرفر يتحقق من البوابة ويكمل الطلب. */
function verifyReturn() {
    var v = state.verify;
    v.status = 'checking';
    render();
    S.api('/api/store/order?id=' + encodeURIComponent(v.orderId)).then(function (r) {
        var o = r && r.success ? r.order : null;
        if (o && o.status === 'completed') {
            state.lastOrder = o;
            state.verify = null;
            state.cart = {};
            writeJson(CART_KEY, state.cart);
            state.coupon = '';
            resetCoupon();
            state.orders = null;
            history.replaceState(null, '', location.pathname + '#success');
            applyHash();
            return;
        }
        if (o && o.status === 'failed') { v.status = 'failed'; render(); return; }
        if (r && r.error === 'unauthorized') { location.href = loginUrl('?order=' + v.orderId); return; }
        if (!o && r && r.error === 'not_found') { v.status = 'error'; render(); return; }
        // ما زال معلّق: نعيد المحاولة كم مرة (إشعار البوابة أحياناً يتأخر ثواني)
        v.tries = (v.tries || 0) + 1;
        v.status = 'pending';
        render();
        if (v.tries < 6) setTimeout(function () { if (state.verify === v) verifyReturn(); }, 3000);
    });
}

function viewVerify() {
    var v = state.verify;
    var title, text, ico, actions;
    if (v.status === 'checking' || (v.status === 'pending' && v.tries < 6)) {
        title = 'جاري التأكد من الدفع…';
        text = 'لحظات ونتأكد من عملية الدفع ونضيف منتجاتك لبروفايلك.';
    } else if (v.status === 'pending') {
        title = 'الدفع قيد المعالجة';
        text = 'ما وصلنا تأكيد الدفع للحين. لو انخصم المبلغ، بتوصلك منتجاتك تلقائياً أول ما يتأكد — تقدر تتابع من «طلباتي».';
        actions = [h('button', { type: 'button', 'class': 'btn btn-primary btn-primary--lg', onclick: function () { v.tries = 0; verifyReturn(); } }, 'تحقق مرة ثانية'),
            h('button', { type: 'button', 'class': 'btn btn-secondary', onclick: function () { state.verify = null; history.replaceState(null, '', location.pathname); go('#orders'); } }, 'طلباتي')];
    } else if (v.status === 'failed') {
        title = 'ما تمت عملية الدفع';
        text = 'تم إلغاء الدفع أو رفضه، وما انخصم شي. منتجاتك باقية في السلة وتقدر تحاول مرة ثانية.';
        ico = '!';
        actions = [h('button', { type: 'button', 'class': 'btn btn-primary btn-primary--lg', onclick: function () { state.verify = null; history.replaceState(null, '', location.pathname); go('#cart'); } }, 'الرجوع للسلة')];
    } else {
        title = 'ما لقينا الطلب';
        text = 'تأكد إنك مسجّل دخول بنفس الحساب اللي سويت فيه الطلب.';
        ico = '!';
        actions = [h('button', { type: 'button', 'class': 'btn btn-secondary', onclick: function () { state.verify = null; history.replaceState(null, '', location.pathname); go(''); } }, 'العودة للمتجر')];
    }
    return [h('div', { 'class': 'success' }, gcard('gcard--soft', h('div', { 'class': 'success-in' },
        ico ? h('div', { 'class': 'ok-ico', style: 'color:#fca5a5;background:radial-gradient(circle,rgba(248,113,113,0.22),rgba(248,113,113,0.05));box-shadow:0 0 0 1px rgba(248,113,113,0.4);font-size:40px;font-weight:700;' }, ico)
            : h('div', { 'class': 'ok-ico verify-spin' }, S.checkIcon(40)),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, h('h1', null, title), h('p', null, text)),
        h('div', { 'class': 'receipt' }, h('div', { 'class': 'r-no' }, h('span', null, 'رقم الطلب'), h('span', { 'class': 'mono', dir: 'ltr' }, '#' + v.orderId))),
        actions ? h('div', { 'class': 'success-actions' }, actions) : null)))];
}

function loadOrders() {
    if (!me()) return;
    if (state.orders) return;
    S.api('/api/store/orders').then(function (r) {
        if (r && r.success) { state.orders = r.orders; state.ordersError = ''; }
        else state.ordersError = S.errorText(r && r.error);
        render();
    });
}

function loadStore() {
    return S.api('/api/store').then(function (r) {
        if (!r || !r.success) { state.loadError = true; render(); return; }
        state.data = r;
        state.loadError = false;
        if (me()) {
            state.fav = {};
            (r.favorites || []).forEach(function (id) { state.fav[id] = true; });
        } else {
            state.fav = readJson(FAV_KEY, {});
        }
        // تنظيف السلة من منتجات انحذفت
        Object.keys(state.cart).forEach(function (id) { if (!productById(Number(id))) delete state.cart[id]; });
        writeJson(CART_KEY, state.cart);
        applyHash();
    });
}

/* ---------- العرض ---------- */

function backBtn(label, onClick) {
    return h('button', { type: 'button', 'class': 'btn btn-back', onclick: onClick }, h('span', { 'class': 'arr' }, '→'), h('span', null, label));
}

function gcard(cls, inner, extra) {
    return h('div', Object.assign({ 'class': 'gcard ' + (cls || '') }, extra || {}), h('div', { 'class': 'gcard-in' }, inner));
}

function viewStoreHeader() {
    var u = me();
    var t = totals();
    return [
        h('header', { 'class': 'st-hero' },
            h('div', { 'class': 'st-pill-label' }, h('span', { 'class': 'dot' }), h('span', null, 'متجر المنصة · منتجات رقمية')),
            h('h1', null, 'المتجر'),
            h('p', null, 'إطارات، باقات ألعاب، واشتراكات لبثّك. ادفع بالريال السعودي ويتفعّل المنتج على حسابك مباشرة.')),
        h('div', { 'class': 'toolbar' },
            h('div', { 'class': 'tabs', role: 'tablist' }, catTabs()),
            h('div', { 'class': 'toolbar-actions' },
                h('button', { type: 'button', 'class': 'btn-orders', onclick: function () { go('#orders'); } },
                    S.avatar(u && u.tiktok_avatar_url, meName(u)), h('span', null, 'طلباتي')),
                h('button', { type: 'button', 'class': 'btn-cart', onclick: function () { go('#cart'); } },
                    S.bagIcon(18), h('span', null, 'السلة'), h('span', { 'class': 'count' }, cartIds().length),
                    h('span', { 'class': 'sep' }), S.money(S.price(t.total), 'total'))))
    ];
}

function catTabs() {
    var sc = streamersCat();
    var keys = ['all'].concat(cats().map(function (c) { return c.id; }));
    return keys.map(function (k) {
        var c = k === 'all' ? null : catById(k);
        var count = k === 'all' ? visible().length
            : (sc && k === sc.id) ? streamers().length
                : visible().filter(function (p) { return p.categoryId === k; }).length;
        return h('button', { type: 'button', role: 'tab', 'aria-selected': state.cat === k ? 'true' : 'false', 'class': 'tab' + (state.cat === k ? ' on' : ''), onclick: function () { go(k === 'all' ? '' : '#c-' + k); } },
            h('span', null, c ? c.name : 'الكل'), h('span', { 'class': 'cnt' }, count));
    });
}

function productCard(p) {
    var added = inCart(p.id);
    var sale = p.badge && p.badge.indexOf('وفّر') === 0;
    return gcard('gcard--hover pcard', [
        h('div', { 'class': 'media' },
            h('div', { 'class': 'media-img' }, S.productImg(p.imageUrl) || h('span', { 'class': 'media-ph' }, 'صورة المنتج')),
            p.badge ? h('span', { 'class': 'badge' + (sale ? ' badge--gold' : '') }, p.badge) : null,
            h('button', { type: 'button', 'class': 'fav' + (state.fav[p.id] ? ' on' : ''), 'aria-label': 'إضافة للمفضلة', 'aria-pressed': state.fav[p.id] ? 'true' : 'false', onclick: function () { toggleFav(p); } }, state.fav[p.id] ? '♥' : '♡')),
        h('div', { 'class': 'pbody' },
            h('span', { 'class': 'pcat' }, h('span', { 'class': 'dot' }), catName(p)),
            h('h3', { 'class': 'pname' }, p.name),
            p.items ? h('span', { 'class': 'pbundle' }, 'يشمل ' + p.items.length + ' منتجات') : null),
        h('div', { 'class': 'pspacer' }),
        h('div', { 'class': 'pprice' },
            h('div', { 'class': 'pprice-col' },
                p.oldPrice ? h('span', { 'class': 'old' }, S.price(p.oldPrice)) : null,
                h('span', { 'class': 'price-big' }, h('span', null, S.price(p.price)), S.riyal())),
            p.oldPrice ? h('span', { 'class': 'st-chip-green' }, 'خصم ' + offPct(p) + '٪') : null),
        h('div', { 'class': 'pactions' },
            h('button', { type: 'button', 'class': 'buy' + (added ? ' added' : ''), onclick: function () { toggleCart(p); } },
                h('span', null, added ? 'في السلة' : 'شراء الآن'), h('span', null, added ? '✓' : '←')),
            h('button', { type: 'button', 'class': 'bagbtn', 'aria-label': added ? 'إزالة من السلة' : 'أضف للسلة', onclick: function () { toggleCart(p); } }, S.bagIcon(20)))
    ]);
}

function viewStore() {
    var sc = streamersCat();
    var inStreamersCat = sc && state.cat === sc.id;
    var out = viewStoreHeader();
    var cur = inStreamersCat && state.streamer ? streamers().filter(function (s) { return s.id === state.streamer; })[0] : null;

    if (state.cat !== 'all' && !cur) {
        var c = catById(state.cat);
        var count = inStreamersCat ? streamers().length + ' استريمرز' : visible().filter(function (p) { return p.categoryId === state.cat; }).length + ' منتجات';
        out.push(h('div', { 'class': 'st-row cat-bar' }, backBtn('رجوع', function () { go(''); }), h('h2', null, c ? c.name : ''), h('span', { 'class': 'muted' }, count)));
    }

    if (inStreamersCat && !cur) {
        out.push(h('button', { type: 'button', 'class': 'sell-cta', onclick: function () { go('#sell'); } },
            h('span', { 'class': 'sell-cta-in' },
                h('span', { 'class': 'sell-cta-t' }, h('b', null, 'كيف أقدر أبيع منتجاتي هنا؟'), h('span', null, 'صمّم منتجاتك الخاصة، واعرضها لجمهورك، وحدد صافي ربحك بنفسك.')),
                h('span', { 'class': 'btn-gold' }, 'اعرف التفاصيل ', h('span', null, '←')))));
        out.push(streamers().length
            ? h('div', { 'class': 'grid' }, streamers().map(function (s) {
                var n = products().filter(function (p) { return p.streamerId === s.id && !p.hidden; }).length;
                return gcard('gcard--hover scard', [
                    S.avatar(s.avatarUrl, s.name),
                    h('div', { style: 'display:flex;flex-direction:column;gap:2px;' }, h('h3', null, s.name), h('span', { 'class': 'at-user', dir: 'ltr' }, '@' + s.user)),
                    h('span', { 'class': 'st-chip st-chip--sm' }, n + ' إطارات'),
                    h('div', { 'class': 'pspacer' }),
                    h('span', { 'class': 'cta' }, h('span', null, 'عرض الإطارات'), h('span', null, '←'))
                ], { role: 'link', tabindex: '0', onclick: function () { go('#s-' + s.id); }, onkeydown: function (e) { if (e.key === 'Enter') go('#s-' + s.id); } });
            }))
            : h('div', { 'class': 'empty-box' }, 'ما فيه استريمرز للحين.'));
        return out;
    }

    var items;
    if (cur) {
        var all = products().filter(function (p) { return p.streamerId === cur.id && !p.hidden; });
        out.push(h('div', { 'class': 'hero-card shead' }, h('div', { 'class': 'hero-card-in' },
            S.avatar(cur.avatarUrl, cur.name, 'avatar--glow'),
            h('div', { 'class': 'shead-t' }, h('span', { 'class': 'lbl' }, 'إطارات برعاية'), h('h2', null, cur.name), h('span', { 'class': 'at-user', dir: 'ltr' }, '@' + cur.user)),
            backBtn('كل الاستريمرز', function () { go('#c-' + sc.id); }))));
        if (cur.subcats.length) {
            var tabs = [{ id: null, label: 'الكل', count: all.length }].concat(cur.subcats.map(function (b) {
                return { id: b.id, label: b.name, count: all.filter(function (p) { return p.subcatId === b.id; }).length };
            }));
            out.push(h('div', { 'class': 'tabs tabs--sub', role: 'tablist' }, tabs.map(function (t) {
                var on = state.sub === t.id;
                return h('button', { type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', 'class': 'tab' + (on ? ' on' : ''), onclick: function () { go('#s-' + cur.id + (t.id ? '-' + t.id : '')); } },
                    h('span', null, t.label), h('span', { 'class': 'cnt' }, t.count));
            })));
        }
        items = all.filter(function (p) { return state.sub == null || p.subcatId === state.sub; });
    } else {
        items = visible().filter(function (p) { return state.cat === 'all' || p.categoryId === state.cat; });
    }
    out.push(items.length ? h('div', { 'class': 'grid' }, items.map(productCard)) : h('div', { 'class': 'empty-box' }, 'ما فيه منتجات هنا للحين.'));
    return out;
}

function viewCart() {
    var list = cartProducts();
    var t = totals();
    var u = me();
    var paymentsOff = state.data && !state.data.paymentsEnabled && u;
    var out = [h('div', { 'class': 'st-row' },
        backBtn('متابعة التسوق', function () { go(''); }),
        h('h1', { 'class': 'st-h-sub' }, 'سلة المشتريات'),
        h('span', { 'class': 'st-chip' }, list.length + ' منتجات'))];

    if (!list.length) {
        out.push(gcard('gcard--soft cart-empty', h('div', { 'class': 'cart-empty-in' },
            h('div', { 'class': 'circle-ico' }, S.bagIcon(32, 1.6)),
            h('h2', null, 'سلتك فاضية'),
            h('p', null, 'تصفّح المتجر وأضف المنتجات اللي تعجبك.'),
            h('button', { type: 'button', 'class': 'btn btn-primary btn-primary--lg', style: 'padding:0 28px;', onclick: function () { go(''); } }, 'تصفّح المتجر'))));
        return out;
    }

    var couponInput = h('input', { 'class': 'in', value: state.coupon, placeholder: 'كود الخصم', 'aria-label': 'كود الخصم', autocomplete: 'off', dir: 'auto' });
    var couponBtn = h('button', { type: 'button', 'class': 'coupon-apply', onclick: applyCoupon }, state.couponPct ? 'تم ✓' : 'تطبيق');
    var couponMsg = h('span', { 'class': 'coupon-msg' + (state.couponErr ? ' err' : ''), hidden: !state.couponMsg }, state.couponMsg);
    couponInput.addEventListener('input', function () {
        state.coupon = couponInput.value;
        if (state.couponPct || state.couponMsg) {
            // الكتابة تلغي الكود المطبّق — نعيد رسم الملخص بدون فقدان التركيز
            resetCoupon();
            render();
            var again = document.querySelector('.coupon-row .in');
            if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }
    });
    couponInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyCoupon(); });

    out.push(h('div', { 'class': 'cart-grid' },
        h('div', { 'class': 'cart-list' }, list.map(function (p) {
            return gcard('gcard--soft crow', [
                h('div', { 'class': 'thumb thumb--cart' }, S.productImg(p.imageUrl)),
                h('div', { 'class': 'crow-t' }, h('span', { 'class': 'c' }, catName(p)), h('span', { 'class': 'n' }, p.name), h('span', { 'class': 'h' }, 'منتج رقمي · يُضاف للبروفايل فوراً')),
                h('div', { 'class': 'crow-p' }, S.money(S.price(p.price)),
                    h('button', { type: 'button', 'class': 'btn btn-danger', onclick: function () { toggleCart(p); } }, 'حذف'))
            ]);
        })),
        gcard('gcard--soft summary', [
            h('h2', null, 'ملخص الطلب'),
            h('div', { 'class': 'coupon-box' }, h('span', { 'class': 'lbl' }, 'عندك كود خصم؟'), h('div', { 'class': 'coupon-row' }, couponInput, couponBtn), couponMsg),
            h('div', { 'class': 'lines' },
                h('div', { 'class': 'line' }, h('span', null, 'المجموع الفرعي'), S.money(S.price(t.subtotal))),
                t.savings + t.disc > 0 ? h('div', { 'class': 'line' }, h('span', null, 'التوفير'), S.money(S.price(t.savings + t.disc) + '-', 'green')) : null,
                h('div', { 'class': 'line' }, h('span', null, 'ضريبة القيمة المضافة (15٪)'), S.money(t.vat))),
            h('div', { 'class': 'grand' }, h('span', null, 'الإجمالي'), S.money(S.price(t.grand))),
            usesGateway() ? mobileField() : null,
            h('div', { style: 'display:flex;flex-direction:column;gap:10px;' },
                h('span', { 'class': 'pay-title' }, 'طريقة الدفع'),
                h('div', { 'class': 'pay-grid', role: 'radiogroup', 'aria-label': 'طريقة الدفع' }, PAY_METHODS.map(function (m, i) {
                    var on = i === state.pay;
                    return h('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', 'class': 'pay-m' + (on ? ' on' : ''), onclick: function () { state.pay = i; render(); } },
                        h('span', { 'class': 'radio' }), h('span', null, m[1]));
                }))),
            h('button', { type: 'button', 'class': 'btn btn-primary btn-primary--lg pay-btn', disabled: state.paying || paymentsOff, onclick: pay },
                h('span', null, !u ? 'سجّل دخول لإتمام الدفع' : state.paying ? (usesGateway() ? 'جاري التحويل لصفحة الدفع…' : 'جاري الدفع…') : 'ادفع ' + S.price(t.grand) + ' ر.س')),
            paymentsOff ? h('span', { 'class': 'pay-note' }, S.errorText('payments_not_configured')) : null,
            state.payError ? h('span', { 'class': 'pay-note' }, state.payError) : null,
            h('span', { 'class': 'pay-consent' }, 'بإتمام الدفع أنت توافق على ', h('a', { href: 'terms.html', target: '_blank', rel: 'noopener' }, 'الشروط والأحكام'), ' و', h('a', { href: 'refund-policy.html', target: '_blank', rel: 'noopener' }, 'سياسة الاسترجاع'), '.'),
            h('span', { 'class': 'secure' }, S.lockIcon(), h('span', null, 'دفع آمن ومشفّر'))
        ])));
    return out;
}

function mobileField() {
    var input = h('input', { 'class': 'in', type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr', value: state.mobile, placeholder: '05xxxxxxxx', 'aria-label': 'رقم الجوال', maxlength: '16', style: 'text-align:right;' + (state.mobileErr ? 'border-color:rgba(248,113,113,0.7);' : '') });
    input.addEventListener('input', function () {
        state.mobile = input.value;
        if (state.mobileErr && normalizeMobile(input.value)) {
            state.mobileErr = false;
            input.style.borderColor = '';
            if (state.payError === S.errorText('invalid_mobile')) {
                state.payError = '';
                Array.prototype.forEach.call(document.querySelectorAll('.pay-note'), function (n) { if (n.textContent === S.errorText('invalid_mobile')) n.remove(); });
            }
        }
    });
    return h('label', { 'class': 'mobile-box' },
        h('span', { 'class': 'pay-title' }, 'رقم الجوال'),
        input,
        h('span', { 'class': 'mobile-hint' }, 'يُستخدم لفاتورة الدفع فقط.'));
}

function viewSuccess() {
    var o = state.lastOrder;
    return [h('div', { 'class': 'success' }, gcard('gcard--soft', h('div', { 'class': 'success-in' },
        h('div', { 'class': 'ok-ico' }, S.checkIcon(40)),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px;' },
            h('h1', null, 'تم الدفع بنجاح'),
            h('p', null, 'وصلت منتجاتك إلى بروفايلك، وتقدر تستخدمها في البث الحين.')),
        h('div', { 'class': 'receipt' },
            h('div', { 'class': 'r-no' }, h('span', null, 'رقم الطلب'), h('span', { 'class': 'mono', dir: 'ltr' }, '#' + o.id)),
            o.items.map(function (i) {
                return h('div', { 'class': 'r-it' }, h('span', { style: 'display:flex;align-items:center;gap:8px;' }, h('span', { 'class': 'ck' }, '✓'), h('span', null, i.name)), S.money(S.price(i.price)));
            }),
            h('div', { 'class': 'r-tot' }, h('span', null, 'المدفوع'), S.money(S.price(o.total)))),
        h('div', { 'class': 'success-actions' },
            h('a', { 'class': 'btn btn-primary btn-primary--lg', href: PROFILE_URL }, h('span', null, 'الذهاب للبروفايل'), h('span', null, '←')),
            h('button', { type: 'button', 'class': 'btn btn-secondary', onclick: function () { go(''); } }, 'العودة للمتجر')))))];
}

function viewOrders() {
    var u = me();
    var out = [h('div', { style: 'display:flex;' }, backBtn('متابعة التسوق', function () { go(''); }))];
    if (!u) {
        out.push(h('div', { 'class': 'gate' }, h('span', null, 'سجّل دخولك عشان تشوف طلباتك.'),
            h('a', { 'class': 'btn btn-primary btn-primary--lg', href: loginUrl('#orders') }, 'تسجيل الدخول')));
        return out;
    }
    var orders = state.orders || [];
    var spent = orders.reduce(function (a, o) { return a + o.total; }, 0);
    out.push(gcard('gcard--soft me-card', [
        S.avatar(u.tiktok_avatar_url, meName(u)),
        h('div', { 'class': 'me-t' }, h('h1', null, 'طلباتي'),
            h('span', { 'class': 'sub' }, meName(u) + ' · ', h('span', { dir: 'ltr', 'class': 'mono' }, '@' + meUser(u)))),
        h('div', { 'class': 'stat-boxes' },
            h('div', { 'class': 'stat-box' }, h('span', { 'class': 'l' }, 'الطلبات'), h('span', { 'class': 'v' }, orders.length)),
            h('div', { 'class': 'stat-box' }, h('span', { 'class': 'l' }, 'إجمالي المشتريات'), S.money(S.fmt(spent), 'v')))
    ]));
    if (!state.orders) {
        out.push(h('div', { 'class': state.ordersError ? 'st-error' : 'st-loading' }, state.ordersError || 'جاري التحميل…'));
    } else {
        out.push(h('div', { 'class': 'orders-list' },
            orders.map(function (o) {
                return gcard('gcard--soft ocard', [
                    h('div', { 'class': 'ohead' },
                        h('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;' }, h('span', { 'class': 'no', dir: 'ltr' }, '#' + o.id), h('span', { 'class': 'dt' }, S.dateLong(o.createdAt))),
                        h('span', { 'class': 'status-ok' }, h('span', { 'class': 'dot' }), 'مكتمل · في بروفايلك')),
                    h('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, o.items.map(function (i) {
                        return h('div', { 'class': 'oitem' },
                            h('div', { 'class': 'thumb thumb--sm' }, S.productImg(i.imageUrl)),
                            h('div', { 'class': 'oitem-t' }, h('span', { 'class': 'n' }, i.name), h('span', { 'class': 'c' }, i.categoryName)),
                            S.money(S.price(i.price)));
                    })),
                    h('div', { 'class': 'ofoot' },
                        o.coupon ? h('span', { 'class': 'cp' }, 'كود خصم: ', h('span', { dir: 'ltr', 'class': 'mono' }, o.coupon)) : null,
                        h('span', { 'class': 'paid' }, h('span', { 'class': 'l' }, 'المدفوع'), h('span', null, S.price(o.total)), S.riyal()))
                ]);
            }),
            orders.length ? null : h('div', { 'class': 'empty-box' }, 'ما عندك طلبات للحين.')));
    }
    out.push(h('a', { 'class': 'btn btn-primary btn-primary--lg profile-link', href: PROFILE_URL }, h('span', null, 'الذهاب للبروفايل'), h('span', null, '←')));
    return out;
}

function viewSell() {
    var sc = streamersCat();
    var plans = products().filter(function (p) { return p.plan; }).sort(function (a, b) { return PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan); });
    return [
        h('div', { style: 'display:flex;' }, backBtn('رجوع للاستريمرز', function () { go(sc ? '#c-' + sc.id : ''); })),
        h('header', { 'class': 'sell-hero' },
            h('span', { 'class': 'st-pill-label st-pill-label--gold' }, 'للاستريمرز'),
            h('h1', null, 'متجرك الخاص في ألعاب أيمن 🛍️'),
            h('p', null, 'صمّم منتجاتك الخاصة، واعرضها لجمهورك، وحدد صافي ربحك بنفسك.')),
        h('div', { 'class': 'plans' }, plans.map(function (p) {
            var featured = p.plan === 'full';
            var added = inCart(p.id);
            return h('div', { 'class': 'plan' + (featured ? ' plan--featured' : '') }, h('div', { 'class': 'plan-in' },
                h('div', { 'class': 'plan-top' }, h('h2', null, p.name), featured ? h('span', { 'class': 'badge-gold' }, 'الأكثر شمولاً') : null),
                h('div', { 'class': 'plan-price' }, h('span', null, S.price(p.price)), S.riyal(), h('span', { 'class': 'per' }, '/ شهرياً')),
                h('span', { 'class': 'plan-chip' }, 'أول اشتراك: شهرين بسعر شهر'),
                h('div', { 'class': 'plan-feats' }, (PLAN_FEATURES[p.plan] || []).map(function (f) {
                    return h('span', { 'class': 'plan-feat' }, h('span', { 'class': 'ck' }, '✓'), f);
                })),
                h('div', { 'class': 'plan-renew' }, 'التجديد الشهري: ' + S.price(p.price) + ' ريال'),
                h('div', { 'class': 'pspacer' }),
                h('button', { type: 'button', 'class': 'plan-btn' + (added ? ' added' : ''), onclick: function () { pickPlan(p); } }, added ? 'في السلة ✓ · إتمام الدفع' : 'اشترك الآن')));
        })),
        h('div', { 'class': 'faq' }, h('h2', null, 'الأسئلة الشائعة'), FAQ.map(function (f, i) {
            var open = state.faqOpen === i;
            var id = 'faq-a-' + i;
            return h('div', { 'class': 'faq-item' + (open ? ' open' : '') },
                h('button', { type: 'button', 'class': 'faq-q', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': id, onclick: function () { state.faqOpen = open ? -1 : i; render(); } },
                    h('span', null, f[0]), h('span', { 'class': 'ic' }, open ? '−' : '+')),
                open ? h('div', { 'class': 'faq-a', id: id },
                    f[1].map(function (t) { return h('p', null, t); }),
                    f[2] ? h('div', { style: 'display:flex;flex-direction:column;gap:6px;' }, f[2].map(function (b) {
                        return h('div', { 'class': 'faq-b' }, h('span', { 'class': 'dot' }), h('span', null, h('strong', null, b[0]), ' ' + b[1]));
                    })) : null) : null);
        }))
    ];
}

function render() {
    var root = document.getElementById('store-app');
    var content;
    if (state.loadError) {
        content = [h('div', { 'class': 'st-error' }, 'تعذّر تحميل المتجر.'), h('div', { style: 'text-align:center;' }, h('button', { type: 'button', 'class': 'btn btn-back', onclick: function () { state.loadError = false; render(); loadStore(); } }, 'إعادة المحاولة'))];
    } else if (!state.data) {
        content = h('div', { 'class': 'st-loading' }, 'جاري تحميل المتجر…');
    } else {
        content = state.verify ? viewVerify()
            : state.view === 'cart' ? viewCart()
            : state.view === 'success' ? viewSuccess()
                : state.view === 'orders' ? viewOrders()
                    : state.view === 'sell' ? viewSell()
                        : viewStore();
    }
    root.replaceChildren.apply(root, [].concat(content));
}

window.addEventListener('hashchange', applyHash);
window.addEventListener('popstate', applyHash);
window.addEventListener('storage', function (e) {
    if (e.key === CART_KEY) { state.cart = readJson(CART_KEY, {}); render(); }
});

// رجوع من صفحة الدفع: store.html?order=<رقم الطلب>
(function () {
    var q = new URLSearchParams(location.search);
    var id = Number(q.get('order') || q.get('orderNumber'));
    if (Number.isInteger(id) && id > 0) {
        state.verify = { orderId: id, status: 'checking', tries: 0 };
        if (me()) verifyReturn();
        else location.href = loginUrl('?order=' + id);
    }
})();

render();
loadStore();
if (window.AGPAuth && window.AGPAuth.getToken()) {
    window.AGPAuth.refreshUser().then(function () { render(); });
}
})();
