/**
 * AGP STORE COMMON — أدوات مشتركة لصفحات المتجر: بناء عناصر DOM بأمان
 * (نصوص عبر textContent فقط، بدون innerHTML لأي بيانات)، رمز الريال،
 * تنسيق الأرقام والتواريخ، والاتصال بالـAPI عبر AGPAuth.request.
 * يعتمد على auth/auth-client.js (يُحمَّل قبله).
 */
(function (global) {
'use strict';

var SVG_NS = 'http://www.w3.org/2000/svg';
var RIYAL_PATHS = [
    'M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z',
    'M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z'
];

/**
 * h('div', {class: 'x', style: '...', onclick: fn, dir: 'ltr'}, child1, [child2, ...])
 * الأبناء: نص (يُضاف كـtextContent) أو عنصر أو مصفوفة أو null/false (يُتجاهل).
 */
function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
        Object.keys(props).forEach(function (k) {
            var v = props[k];
            if (v == null || v === false) return;
            if (k === 'class') el.className = v;
            else if (k === 'style') el.setAttribute('style', v);
            else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else if (k === 'value') el.value = v;
            else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
            else el.setAttribute(k, v === true ? '' : String(v));
        });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
}

function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

function svg(viewBox, attrs, inner) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', viewBox);
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    (inner || []).forEach(function (spec) {
        var n = document.createElementNS(SVG_NS, spec[0]);
        Object.keys(spec[1]).forEach(function (k) { n.setAttribute(k, spec[1][k]); });
        s.appendChild(n);
    });
    return s;
}

function riyal() {
    var s = svg('0 0 1124.14 1256.39', { 'class': 'riyal', 'aria-label': 'ريال سعودي', role: 'img' },
        RIYAL_PATHS.map(function (d) { return ['path', { d: d }]; }));
    return s;
}

/** رقم + رمز الريال بعده (يسار الرقم بصرياً في RTL). */
function money(value, cls) {
    return h('span', { 'class': 'money' + (cls ? ' ' + cls : '') }, h('span', null, value), riyal());
}

function bagIcon(size, stroke) {
    return svg('0 0 24 24', { width: size || 18, height: size || 18, fill: 'none', stroke: 'currentColor', 'stroke-width': stroke || 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        [['rect', { x: 4, y: 8, width: 16, height: 13, rx: 3 }], ['path', { d: 'M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8' }]]);
}

function lockIcon() {
    return svg('0 0 24 24', { width: 14, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' },
        [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }]]);
}

function checkIcon(size) {
    return svg('0 0 24 24', { width: size || 40, height: size || 40, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]]);
}

/** أفاتار دائري: صورة لو موجودة، وإلا أول حرف من الاسم. */
function avatar(url, name, cls) {
    var inner = h('div', { 'class': 'avatar-in' });
    if (url) {
        var img = h('img', { src: url, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
        img.addEventListener('error', function () { inner.textContent = initial(name); });
        inner.appendChild(img);
    } else {
        inner.textContent = initial(name);
    }
    return h('div', { 'class': 'avatar' + (cls ? ' ' + cls : '') }, inner);
}

function initial(name) {
    var s = String(name || '').trim();
    return s ? s.charAt(0) : '؟';
}

/** صورة منتج (contain) أو مكان فاضي. */
function productImg(url) {
    if (!url) return null;
    return h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
}

function fmt(v) {
    return Math.round(Number(v) || 0).toLocaleString('en-US');
}

/** سعر كما هو (يحتفظ بالكسور لو موجودة، مثل 47.5). */
function price(v) {
    var n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function dateLong(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dateShort(ts, withTime) {
    var d = new Date(ts);
    var s = d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' });
    return withTime ? s + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : s;
}

/** توزيع قيم على أيام (آخر N يوم، بتوقيت المتصفح). */
function daily(items, days, valueOf) {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    start = start.getTime() - (days - 1) * 864e5;
    var arr = [];
    for (var i = 0; i < days; i++) {
        var dt = new Date(start + i * 864e5);
        arr.push({ v: 0, label: dt.getDate() + '/' + (dt.getMonth() + 1) });
    }
    items.forEach(function (x) {
        var idx = Math.floor((x.t - start) / 864e5);
        if (idx >= 0 && idx < days) arr[idx].v += valueOf(x);
    });
    return arr;
}

/** رسم أعمدة يومي (LTR). */
function barChart(points, cls) {
    var max = Math.max.apply(null, [1].concat(points.map(function (x) { return x.v; })));
    var step = points.length > 7 ? 5 : 1;
    return h('div', { 'class': 'bars' + (cls ? ' ' + cls : ''), dir: 'ltr' }, points.map(function (x, i) {
        return h('div', { 'class': 'bar', title: x.label + ' · ' + fmt(x.v) + ' ر.س' },
            h('div', { 'class': 'bar-f', style: 'height:' + (x.v / max * 100).toFixed(1) + '%' }),
            h('span', { 'class': 'bar-l' }, (points.length - 1 - i) % step === 0 ? x.label : ''));
    }));
}

function api(path, options) {
    if (!global.AGPAuth || typeof global.AGPAuth.request !== 'function') return Promise.reject(new Error('auth_client_missing'));
    return global.AGPAuth.request(path, options).then(function (data) {
        if (data && data.__httpStatus === 401) data.error = data.error || 'unauthorized';
        return data;
    }, function () { return { success: false, error: 'network_error' }; });
}

var flashTimer = null;
function flash(text, isError) {
    var el = document.getElementById('st-flash');
    if (!el) {
        el = h('div', { id: 'st-flash', 'class': 'flash', role: 'status', 'aria-live': 'polite' });
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'flash' + (isError ? ' err' : '');
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

function scrollTop() {
    try { global.scrollTo({ top: 0 }); } catch (e) { global.scrollTo(0, 0); }
}

var ERRORS = {
    network_error: 'تعذّر الاتصال بالسيرفر، حاول مرة ثانية.',
    unauthorized: 'لازم تسجّل دخول أولاً.',
    forbidden: 'ما عندك صلاحية.',
    not_found: 'غير موجود.',
    payments_not_configured: 'الدفع غير متاح حالياً، قريباً بإذن الله.',
    product_unavailable: 'أحد المنتجات ما عاد متوفر، حدّث الصفحة.',
    one_plan_only: 'تقدر تشترك بباقة وحدة بس.',
    invalid_coupon: 'الكود غير صحيح أو منتهي',
    rate_limited: 'محاولات كثيرة، انتظر شوي.',
    empty_cart: 'سلتك فاضية.',
    empty_name: 'اكتب الاسم',
    name_taken: 'الاسم موجود',
    invalid_price: 'اكتب سعر صحيح',
    invalid_image: 'رابط الصورة غير مسموح',
    uploads_not_configured: 'رفع الصور غير مفعّل (إعدادات Cloudinary ناقصة بالسيرفر).',
    file_type_not_allowed: 'الصيغ المسموحة: PNG, JPG, WEBP, GIF',
    file_too_large: 'الحد الأقصى للصورة 10MB',
    code_taken: 'الكود موجود',
    invalid_pct: 'النسبة من 1 إلى 90',
    empty_code: 'اكتب الكود',
    invalid_code: 'الكود حروف إنجليزية وأرقام فقط',
    min_two_items: 'اختر منتجين على الأقل',
    missing_fields: 'اكتب الاسم واليوزر',
    offer_exists: 'المنتج عليه عرض فعّال',
    invalid_mobile: 'اكتب رقم جوال صحيح يبدأ بـ 05',
    payment_gateway_error: 'تعذّر فتح صفحة الدفع، حاول مرة ثانية بعد شوي.',
    invalid_total: 'مبلغ الطلب غير صحيح'
};

function errorText(err) {
    return ERRORS[err] || 'صار خطأ، حاول مرة ثانية.';
}

global.AGPStore = {
    h: h, svg: svg, riyal: riyal, money: money, bagIcon: bagIcon, lockIcon: lockIcon, checkIcon: checkIcon,
    avatar: avatar, productImg: productImg, fmt: fmt, price: price, dateLong: dateLong, dateShort: dateShort,
    daily: daily, barChart: barChart, api: api, flash: flash, scrollTop: scrollTop, errorText: errorText
};

})(window);
