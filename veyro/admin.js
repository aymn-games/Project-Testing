/*
 * لوحة تحكم فيرو (Veyro Admin) — veyro/admin.html
 * منفصلة عن لوحة أدمن ألعاب أيمن: كل شي هنا يخص فيرو بس
 * (الستريمرز اللي دخلوا فيرو بحساب ألعاب أيمن، الاشتراكات، الأكواد، مكتبة فيرو العامة، الإحصائيات).
 *
 * الأقسام: نظرة عامة ← الستريمرز (ملف كامل لكل ستريمر) ← الاشتراكات والخطط ← الأكواد
 *          ← مكتبة فيرو (أليرتات، توبات، أيقونات، إطارات، أصوات + التفريغ) ← الإحصائيات ← السجل ← الإعدادات
 *
 * وضع المعاينة: البيانات تجريبية (DEMO) وتنحفظ بمتصفحك بس (localStorage).
 * كل تعديل يمر من دوال API تحت — لما ينربط سيرفر فيرو تتبدّل هذي الدوال بطلبات /api/veyro/admin/*
 * والواجهة تبقى زي ما هي.
 *
 * التفريغ (Chroma Key) هنا بنفس مفاتيح KEY_DEFAULT بـjs/agp-stream-overlay.js
 * ({ on, mode: color|black|white|screen, color, sim, smooth, spill, opacity })،
 * فالأليرت اللي تفرّغه هنا يطلع بنفس الشكل بشاشة البث.
 */
(function () {
    'use strict';

    var DAY = 864e5, HOUR = 36e5;
    var LS_KEY = 'veyro-admin-demo-v1';
    // متصل بسيرفر فيرو (REAL) أو بيانات تجريبية — يتحدد بـboot() تحت
    var REAL = false, API_BASE = '', TOKEN = null, ME = null;
    var CUR = 'ر.س';
    var ADMIN_NAME = 'أيمن';

    /* =========================================================
       أدوات عامة
       ========================================================= */
    function $(s, r) { return (r || document).querySelector(s); }
    function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function now() { return Date.now(); }
    function fmtN(n, d) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d }); }
    function money(n) { return fmtN(n) + ' ' + CUR; }
    function hrs(h) { return h >= 100 ? fmtN(h) : fmtN(h, 1); }
    var DF = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
    var DFT = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    var DFM = new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'short' });
    function fdate(t) { return t ? DF.format(new Date(t)) : '—'; }
    function fdt(t) { return t ? DFT.format(new Date(t)) : '—'; }
    function rel(t) {
        if (!t) return '—';
        var d = now() - t, a = Math.abs(d), fut = d < 0, v;
        if (a < 60e3) v = 'لحظات';
        else if (a < HOUR) v = Math.round(a / 60e3) + ' د';
        else if (a < DAY) v = Math.round(a / HOUR) + ' س';
        else if (a < 60 * DAY) v = Math.round(a / DAY) + ' يوم';
        else v = Math.round(a / (30 * DAY)) + ' شهر';
        return (fut ? 'بعد ' : 'قبل ') + v;
    }
    function isoDay(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function normAr(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').trim(); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function uid() { return Math.random().toString(36).slice(2, 10); }
    function copy(text, msg) {
        var done = function () { toast(msg || 'انتسخ'); };
        try {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } catch (e) { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
    }
    function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    /* أيقونات (خط) */
    var IC = {
        overview: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
        users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.4 3.4 0 010 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
        crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/>',
        ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
        layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".5"/>',
        chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        log: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        x: '<path d="M6 6l12 12M18 6L6 18"/>',
        copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
        live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M5 5a10 10 0 000 14M19 5a10 10 0 010 14"/>',
        repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
        upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
        edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
        trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3 3.9M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 004.4-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
        play: '<path d="M7 4.5v15l12-7.5z"/>',
        pause: '<path d="M8 5v14M16 5v14"/>',
        drop: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
        wand: '<path d="M4 20L16 8M14 4v2M20 10h-2M18.5 5.5l-1.4 1.4M12 2.5V3"/><path d="M15 7l2 2"/>',
        send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
        ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
        logout: '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l-5-5 5-5M5 12h11"/>',
        snow: '<path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>',
        infinity: '<path d="M18.2 8.4a4 4 0 110 7.2C15 13.5 9 10.5 5.8 8.4a4 4 0 100 7.2C9 13.5 15 10.5 18.2 8.4z"/>',
        gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3 8 4s0 4 4 4zm0 0s1.5-5 4-4 0 4-4 4z"/>',
        star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
        sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
        reset: '<path d="M3 12a9 9 0 109-9 9.5 9.5 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/>',
        shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
        bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        csv: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'
    };
    function ic(name, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + (IC[name] || '') + '</svg>'; }

    /* =========================================================
       البيانات التجريبية (DEMO)
       ========================================================= */
    var NAMES = [['فهد', 'fahad'], ['سارة', 'sara'], ['عبدالله', 'abdullah'], ['نورة', 'noura'], ['خالد', 'khaled'], ['ريم', 'reem'], ['محمد', 'mohammed'], ['لمى', 'lama'], ['سلطان', 'sultan'], ['جود', 'joud'], ['تركي', 'turki'], ['شهد', 'shahad'], ['ناصر', 'nasser'], ['دانة', 'dana'], ['بندر', 'bandar'], ['غلا', 'ghala'], ['فيصل', 'faisal'], ['رهف', 'rahaf'], ['ماجد', 'majed'], ['العنود', 'alanoud'], ['يزيد', 'yazeed'], ['هيا', 'haya'], ['راكان', 'rakan'], ['لين', 'leen'], ['مشعل', 'meshal'], ['ملاك', 'malak'], ['نواف', 'nawaf'], ['رنا', 'rana'], ['سعود', 'saud'], ['أسيل', 'aseel'], ['عمر', 'omar'], ['وعد', 'waad'], ['زياد', 'ziyad'], ['مها', 'maha'], ['حمد', 'hamad'], ['جنى', 'jana']];
    var NICK = [['', ''], [' جيمنق', 'gaming'], [' لايف', 'live'], [' TV', 'tv'], [' بلس', 'plus'], ['', 'x'], [' ستريم', 'stream'], ['', 'gg']];
    var MAILS = ['gmail.com', 'hotmail.com', 'outlook.com', 'icloud.com'];

    var PLANS_SEED = [
        { id: 'monthly', name: 'شهري', days: 30, price: 39, screens: 10, videos: 10, gamesDiscount: 30, on: true, features: ['كل أدوات البث', '10 شاشات', '10 فيديوهات بالمكتبة'] },
        { id: 'quarter', name: 'ربع سنوي', days: 90, price: 99, screens: 20, videos: 20, gamesDiscount: 30, on: true, features: ['كل أدوات البث', '20 شاشة', '20 فيديو بالمكتبة'] },
        { id: 'yearly', name: 'سنوي', days: 365, price: 349, screens: 50, videos: 40, gamesDiscount: 30, on: true, features: ['كل أدوات البث', '50 شاشة', '40 فيديو بالمكتبة', 'أصول حصرية للسنوي'] },
        { id: 'lifetime', name: 'مفتوح', days: 0, price: 0, screens: 100, videos: 60, on: true, internal: true, features: ['بدون تاريخ انتهاء', 'يعطيه الأدمن أو كود خاص بس'] }
    ];

    function seed() {
        var R = mulberry(20261119), T = now();
        function rnd(a, b) { return a + R() * (b - a); }
        function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
        function pick(a) { return a[Math.floor(R() * a.length)]; }
        var users = [], usedIds = {};
        for (var i = 0; i < 64; i++) {
            var nm = NAMES[i % NAMES.length], nk = pick(NICK);
            var id; do { id = ri(10120, 48900); } while (usedIds[id]); usedIds[id] = 1;
            var tk = nm[1] + (nk[1] ? (R() < .5 ? '_' : '.') + nk[1] : '') + (R() < .4 ? ri(1, 99) : '');
            var joined = T - rnd(4, 220) * DAY;
            var roll = R(), sub = null, st;
            if (roll < .36) st = 'active'; else if (roll < .46) st = 'expiring'; else if (roll < .64) st = 'expired'; else if (roll < .69) st = 'lifetime'; else if (roll < .72) st = 'frozen'; else st = 'none';
            var planId = pick(['monthly', 'monthly', 'monthly', 'quarter', 'quarter', 'yearly']);
            var plan = PLANS_SEED.filter(function (p) { return p.id === planId; })[0];
            var renewals = st === 'none' ? 0 : ri(0, st === 'lifetime' ? 2 : 6);
            var payments = [];
            if (st !== 'none') {
                var end;
                if (st === 'active') end = T + rnd(8, plan.days) * DAY;
                else if (st === 'expiring') end = T + rnd(.2, 6.5) * DAY;
                else if (st === 'expired') end = T - rnd(1, 70) * DAY;
                else end = T + rnd(5, 40) * DAY;
                var start = end - plan.days * DAY;
                for (var p = 0; p <= renewals; p++) {
                    var at = start - p * plan.days * DAY;
                    if (at < joined) { joined = at - rnd(1, 5) * DAY; }
                    payments.push({ at: at, amount: p === renewals && R() < .25 ? 0 : plan.price, plan: planId, method: p === renewals && R() < .25 ? 'كود' : pick(['تحويل بنكي', 'Apple Pay', 'STC Pay', 'مدى']) });
                }
                sub = { plan: st === 'lifetime' ? 'lifetime' : planId, start: start, end: st === 'lifetime' ? null : end, lifetime: st === 'lifetime', frozen: null, renewals: renewals, source: payments[payments.length - 1].amount ? 'paid' : 'code' };
                if (st === 'frozen') { sub.frozen = { at: T - rnd(1, 10) * DAY, remaining: rnd(5, 25) * DAY, why: 'سفر' }; }
                if (st === 'lifetime') { sub.end = null; payments = [{ at: start, amount: 0, plan: 'lifetime', method: 'هدية من الأدمن' }]; }
            }
            var activeish = st !== 'none' && st !== 'expired';
            var daily = [];
            var intensity = activeish ? rnd(.6, 4.2) : (st === 'expired' ? rnd(0, 1.2) : rnd(0, .5));
            for (var d = 0; d < 90; d++) {
                var dayT = T - (89 - d) * DAY;
                var alive = dayT > joined && (st !== 'expired' || dayT < (sub && sub.end || 0));
                var h = alive && R() < (activeish ? .62 : .25) ? Math.max(0, rnd(.4, 1.6) * intensity) : 0;
                if (st === 'frozen' && dayT > sub.frozen.at) h = 0;
                daily.push(Math.round(h * 10) / 10);
            }
            var older = Math.max(0, (T - joined) / DAY - 90) * intensity * .5;
            var total = daily.reduce(function (a, b) { return a + b; }, 0) + older;
            var online = activeish && st !== 'frozen' && R() < .16;
            var lastSeen = online ? T - rnd(0, 10) * 60e3 : T - rnd(.1, activeish ? 6 : 50) * DAY;
            var u = {
                id: id,
                name: nm[0] + nk[0],
                username: nm[1] + ri(10, 999),
                email: nm[1] + (R() < .6 ? ri(1, 9999) : '') + '@' + pick(MAILS),
                tiktok: tk.toLowerCase(),
                tiktokVerified: R() < .88,
                joined: joined,
                veyroSince: joined + rnd(0, 6) * DAY,
                lastSeen: lastSeen,
                online: online,
                liveSince: online ? T - rnd(10, 220) * 60e3 : null,
                status: 'active',
                tester: R() < .22,
                notes: '',
                limits: { screens: null, videos: null },
                devices: ri(1, 3),
                sub: sub,
                payments: payments.sort(function (a, b) { return b.at - a.at; }),
                usage: {
                    daily: daily,
                    hoursTotal: Math.round(total * 10) / 10,
                    sessions: Math.max(0, Math.round(total / rnd(1.8, 3.4))),
                    screens: activeish ? ri(2, 14) : ri(0, 4),
                    videos: activeish ? ri(0, 12) : ri(0, 3),
                    storageMb: activeish ? ri(20, 480) : ri(0, 60),
                    live: daily.map(function (h) { return Math.round(h * 8.5) / 10; }),
                    liveTotal: Math.round(total * 8.5) / 10
                },
                donations: { total: R() < .45 ? Math.round(rnd(20, 4200)) : 0, count: 0 },
                history: []
            };
            u.donations.count = u.donations.total ? ri(2, 90) : 0;
            u.history.push({ at: u.veyroSince, t: 'دخل فيرو أول مرة بحساب ألعاب أيمن', k: 'ok' });
            u.payments.slice().reverse().forEach(function (pm) {
                u.history.push({ at: pm.at, t: (pm.amount ? 'اشترك/جدّد ' : 'تفعيل ') + planName(pm.plan) + (pm.amount ? ' — ' + money(pm.amount) + ' (' + pm.method + ')' : ' (' + pm.method + ')'), k: 'gold' });
            });
            if (st === 'frozen') u.history.push({ at: sub.frozen.at, t: 'تجميد الاشتراك (' + sub.frozen.why + ')', k: 'warn' });
            users.push(u);
        }
        // نضمن وجود اشتراك مفتوح واحد على الأقل بالبيانات التجريبية
        if (!users.some(function (u) { return u.sub && u.sub.lifetime; })) {
            var lu = users.filter(function (u) { return u.sub && u.status === 'active'; })[5] || users[9];
            lu.sub = { plan: 'lifetime', start: lu.sub ? lu.sub.start : T - 60 * DAY, end: null, lifetime: true, frozen: null, renewals: lu.sub ? lu.sub.renewals : 0, source: 'gift' };
            lu.payments.unshift({ at: T - 30 * DAY, amount: 0, plan: 'lifetime', method: 'هدية من الأدمن' });
            lu.history.push({ at: T - 30 * DAY, t: 'اشتراك مفتوح (بدون انتهاء)', k: 'gold', by: ADMIN_NAME });
        }
        users[3].status = 'suspended'; users[3].notes = 'موقوف مؤقتاً: مشاركة الحساب مع أكثر من شخص.';
        users[3].history.push({ at: T - 2 * DAY, t: 'إيقاف الحساب: مشاركة الحساب', k: 'bad', by: ADMIN_NAME });
        users[17].status = 'banned'; users[17].notes = 'محظور: محتوى مخالف بالأليرتات.';
        users[17].history.push({ at: T - 9 * DAY, t: 'حظر الحساب: محتوى مخالف', k: 'bad', by: ADMIN_NAME });
        users.forEach(function (u) { u.history.sort(function (a, b) { return b.at - a.at; }); });

        var codes = [];
        function mk(type, extra) { var c = Object.assign({ code: genCode(extra.prefix || 'VEYRO', R), type: type, days: 0, plan: null, maxUses: 1, uses: [], expires: null, campaign: '', created: T - rnd(1, 40) * DAY, by: ADMIN_NAME, disabled: false, forUser: null }, extra); delete c.prefix; return c; }
        for (var k = 0; k < 6; k++) codes.push(mk('days', { days: 7, campaign: 'تجربة أسبوع', maxUses: 1 }));
        for (k = 0; k < 4; k++) codes.push(mk('plan', { plan: 'monthly', campaign: 'مسابقة البث', maxUses: 1 }));
        codes.push(mk('days', { prefix: 'RAMADAN', days: 30, campaign: 'عرض رمضان', maxUses: 200, expires: T + 25 * DAY }));
        codes.push(mk('extra', { prefix: 'SORRY', days: 3, campaign: 'تعويض توقف السيرفر', maxUses: 500, expires: T + 10 * DAY }));
        codes.push(mk('lifetime', { prefix: 'VIP', campaign: 'شركاء', maxUses: 1 }));
        codes.push(mk('plan', { plan: 'yearly', campaign: 'جائزة', maxUses: 1, expires: T - 3 * DAY }));
        codes.push(mk('days', { days: 14, campaign: 'تجربة أسبوعين', maxUses: 1, disabled: true }));
        // استخدامات تجريبية
        var subs = users.filter(function (u) { return u.sub; });
        codes.slice(0, 3).forEach(function (c, j) { c.uses.push({ uid: subs[j + 2].id, at: T - rnd(1, 9) * DAY }); });
        codes[6].uses.push({ uid: subs[8].id, at: T - 4 * DAY });
        for (k = 0; k < 37; k++) codes[10].uses.push({ uid: pick(users).id, at: T - rnd(0, 6) * DAY });
        for (k = 0; k < 112; k++) codes[11].uses.push({ uid: pick(subs).id, at: T - rnd(0, 4) * DAY });
        codes[12].uses.push({ uid: users.filter(function (u) { return u.sub && u.sub.lifetime; })[0].id, at: T - 30 * DAY });

        var log = [
            { at: T - 35 * 60e3, act: 'نشر أصل للجميع', target: 'أليرت «هدية شكراً»' },
            { at: T - 3 * HOUR, act: 'أضاف 7 أيام', target: '@' + users[5].tiktok, uid: users[5].id },
            { at: T - 6 * HOUR, act: 'أنشأ 500 كود (أيام إضافية)', target: 'تعويض توقف السيرفر' },
            { at: T - 2 * DAY, act: 'أوقف حساب', target: '@' + users[3].tiktok, uid: users[3].id },
            { at: T - 4 * DAY, act: 'عطى اشتراك مفتوح', target: '@' + users.filter(function (u) { return u.sub && u.sub.lifetime; })[0].tiktok },
            { at: T - 9 * DAY, act: 'حظر حساب', target: '@' + users[17].tiktok, uid: users[17].id },
            { at: T - 12 * DAY, act: 'عدّل خطة', target: 'ربع سنوي' }
        ].map(function (l) { l.by = ADMIN_NAME; l.id = uid(); return l; });

        return {
            v: 1,
            seededAt: T,
            plans: JSON.parse(JSON.stringify(PLANS_SEED)),
            users: users,
            codes: codes,
            assets: seedAssets(T),
            log: log,
            cfg: { previewAdminOnly: true, requireSub: false, trialDays: 3, announce: { on: false, text: 'تحديث جديد: مكتبة أليرتات جاهزة بقسم «المكتبة».' }, admins: [{ id: 10001, name: ADMIN_NAME, role: 'owner' }, { id: 10057, name: 'مشرف الدعم', role: 'support' }] }
        };
    }
    function genCode(prefix, R) {
        var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = R || Math.random, s = '';
        for (var i = 0; i < 8; i++) { s += A[Math.floor(r() * A.length)]; if (i === 3) s += '-'; }
        return (prefix ? prefix.toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' : '') + s;
    }

    /* أصول المكتبة التجريبية: الأليرتات مرسومة بالكود (شاشة خضراء/سوداء/زرقاء) عشان التفريغ يتجرّب بدون رفع */
    function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
    function seedAssets(T) {
        var KEY0 = { on: false, mode: 'color', color: '#00ff00', sim: 0.4, smooth: 0.08, spill: 0.1, opacity: 1 };
        function key(o) { return Object.assign({}, KEY0, o); }
        var crown = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#00ff00"/><path d="M40 190l-12-110 56 46 44-74 44 74 56-46-12 110z" fill="#ffd54a" stroke="#b8860b" stroke-width="8" stroke-linejoin="round"/><rect x="40" y="190" width="176" height="26" rx="6" fill="#e0a92e"/><circle cx="128" cy="150" r="14" fill="#ec8f9d"/><circle cx="80" cy="160" r="9" fill="#9fc7ff"/><circle cx="176" cy="160" r="9" fill="#9fc7ff"/></svg>');
        var heart = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#ffffff"/><path d="M128 214S36 160 36 98c0-30 22-52 50-52 18 0 32 9 42 24 10-15 24-24 42-24 28 0 50 22 50 52 0 62-92 116-92 116z" fill="#ff4d79" stroke="#c2185b" stroke-width="6"/><ellipse cx="88" cy="92" rx="18" ry="11" fill="#fff" opacity=".55" transform="rotate(-30 88 92)"/></svg>');
        var starI = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff6c2"/><stop offset="1" stop-color="#ffc400"/></radialGradient></defs><path d="M128 20l30 66 72 8-54 48 16 72-64-38-64 38 16-72-54-48 72-8z" fill="url(#g)" stroke="#d99a00" stroke-width="6" stroke-linejoin="round"/></svg>');
        var fire = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#000"/><path d="M128 236c-46 0-76-30-76-72 0-44 34-66 40-112 22 18 30 40 30 58 12-10 18-26 18-44 40 30 64 64 64 98 0 42-30 72-76 72z" fill="#ff7a1a"/><path d="M128 236c-24 0-40-16-40-38 0-24 20-34 26-60 16 14 22 28 22 40 8-6 12-14 14-24 14 16 18 30 18 44 0 22-16 38-40 38z" fill="#ffd54a"/></svg>');
        var frame1 = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9e1f3"/><stop offset=".5" stop-color="#8d7fa3"/><stop offset="1" stop-color="#cfc3dc"/></linearGradient></defs><circle cx="128" cy="128" r="104" fill="none" stroke="url(#a)" stroke-width="18"/><circle cx="128" cy="128" r="118" fill="none" stroke="#cfc3dc" stroke-width="2" stroke-dasharray="6 10"/><path d="M128 6l10 18h-20zM128 250l-10-18h20z" fill="#e9e1f3"/></svg>');
        var frame2 = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b3"/><stop offset="1" stop-color="#d4a017"/></linearGradient></defs><path d="M128 18l94 54v112l-94 54-94-54V72z" fill="none" stroke="url(#b)" stroke-width="16" stroke-linejoin="round"/><path d="M98 14l30-12 30 12-30 16z" fill="#ffd54a"/></svg>');
        function a(o) { return Object.assign({ id: uid(), status: 'published', access: 'all', cat: '', usage: 0, version: 1, updated: T - Math.random() * 20 * DAY, key: key({}), vol: 0.8, dur: 6 }, o); }
        return [
            a({ type: 'alert', name: 'هدية شكراً', cat: 'هدايا', src: { proc: 'green-gift' }, key: key({ on: true, mode: 'color', color: '#12c84a', sim: 0.34, smooth: 0.1, spill: 0.4 }), usage: 41, version: 3, updated: T - 35 * 60e3 }),
            a({ type: 'alert', name: 'شرارات ذهبية', cat: 'مؤثرات', src: { proc: 'fx-sparks' }, key: key({ on: true, mode: 'screen' }), usage: 27, version: 2 }),
            a({ type: 'alert', name: 'متابعة — قلب أزرق', cat: 'متابعة', src: { proc: 'blue-heart' }, status: 'draft', usage: 0 }),
            a({ type: 'top', name: 'توب الداعمين — مشطوف', cat: 'داعمين', top: { title: 'توب الداعمين', rows: 5, shape: 'bevel', accent: '#cfc3dc', bg: '#14121a', bgA: 0.78, border: '#a99bb8', gap: 6, font: 'kufi', crown: true }, usage: 63, version: 2 }),
            a({ type: 'top', name: 'كبسولة ذهبية', cat: 'داعمين', top: { title: 'أعلى الهدايا', rows: 3, shape: 'pill', accent: '#ffd54a', bg: '#1d1608', bgA: 0.85, border: '#ffd54a', gap: 8, font: 'kufi', crown: true }, usage: 22, access: 'subs' }),
            a({ type: 'top', name: 'توب التعليقات — حاد', cat: 'تفاعل', top: { title: 'أكثر المتفاعلين', rows: 5, shape: 'sharp', accent: '#9fc7ff', bg: '#0b1220', bgA: 0.7, border: '#9fc7ff', gap: 4, font: 'plex', crown: false }, status: 'hidden', usage: 4 }),
            a({ type: 'icon', name: 'تاج', cat: 'رموز', src: { img: crown }, key: key({ on: true, mode: 'color', color: '#00ff00', sim: 0.3, smooth: 0.06, spill: 0.3 }), usage: 88 }),
            a({ type: 'icon', name: 'قلب (خلفية بيضاء)', cat: 'رموز', src: { img: heart }, status: 'draft', usage: 0 }),
            a({ type: 'icon', name: 'نجمة', cat: 'رموز', src: { img: starI }, usage: 51 }),
            a({ type: 'icon', name: 'نار', cat: 'رموز', src: { img: fire }, key: key({ on: true, mode: 'black', sim: 0.12, smooth: 0.08 }), usage: 34, access: 'subs' }),
            a({ type: 'frame', name: 'إطار لافندر', cat: 'إطارات الصورة', src: { img: frame1 }, usage: 47, fscale: 1.3 }),
            a({ type: 'frame', name: 'إطار ذهبي سداسي', cat: 'إطارات الصورة', src: { img: frame2 }, usage: 19, access: 'yearly' }),
            a({ type: 'sound', name: 'دنق', cat: 'تنبيه', src: { synth: 'ding' }, usage: 70 }),
            a({ type: 'sound', name: 'عملات', cat: 'هدايا', src: { synth: 'coins' }, usage: 36 }),
            a({ type: 'sound', name: 'ووش', cat: 'انتقال', src: { synth: 'whoosh' }, status: 'draft', usage: 0 })
        ];
    }

    /* التخزين: بمتصفحك بس، والفيديوهات المرفوعة ما تنحفظ (بس بالجلسة) */
    var S;
    function load() {
        try { var raw = localStorage.getItem(LS_KEY); if (raw) { var d = JSON.parse(raw); if (d && d.v === 1) return d; } } catch (e) { /* ignore */ }
        return null;
    }
    function save() {
        try {
            var out = Object.assign({}, S, {
                assets: S.assets.map(function (a) {
                    if (a.src && (a.src.video || a.src.audio)) { var c = Object.assign({}, a, { src: Object.assign({}, a.src) }); delete c.src.video; delete c.src.audio; c.src.lost = true; return c; }
                    return a;
                })
            });
            localStorage.setItem(LS_KEY, JSON.stringify(out));
        } catch (e) { /* مساحة المتصفح ممتلية أو ممنوعة: تبقى البيانات بالذاكرة */ }
    }
    S = load() || seed();

    /* =========================================================
       منطق الاشتراكات
       ========================================================= */
    function plan(id) { return S.plans.filter(function (p) { return p.id === id; })[0] || null; }
    function planName(id) { var p = (S && plan(id)) || PLANS_SEED.filter(function (x) { return x.id === id; })[0]; return p ? p.name : '—'; }
    function user(id) { id = Number(id); return S.users.filter(function (u) { return u.id === id; })[0] || null; }
    function subState(u) {
        var s = u.sub; if (!s) return 'none';
        if (s.lifetime) return 'lifetime';
        if (s.frozen) return 'frozen';
        if (s.end <= now()) return 'expired';
        if (s.end - now() < 7 * DAY) return 'expiring';
        return 'active';
    }
    var SUBL = { none: ['بدون اشتراك', 'mute'], active: ['نشط', 'ok'], expiring: ['ينتهي قريباً', 'warn'], expired: ['منتهي', 'bad'], lifetime: ['مفتوح', 'gold'], frozen: ['مجمّد', 'info'] };
    function subTag(u) { var s = SUBL[subState(u)]; return '<span class="tag ' + s[1] + '">' + s[0] + '</span>'; }
    function isPaying(u) { var s = subState(u); return s === 'active' || s === 'expiring' || s === 'lifetime'; }
    function msLeft(u) { var s = u.sub; if (!s) return 0; if (s.lifetime) return Infinity; if (s.frozen) return s.frozen.remaining; return Math.max(0, s.end - now()); }
    function daysLeftTxt(u) {
        var st = subState(u), ms = msLeft(u);
        if (st === 'none') return '—';
        if (st === 'lifetime') return '∞';
        if (st === 'expired') return 'انتهى ' + rel(u.sub.end);
        var d = ms / DAY;
        return d < 1 ? Math.max(1, Math.round(ms / HOUR)) + ' ساعة' : Math.ceil(d) + ' يوم';
    }
    function leftBar(u) {
        var st = subState(u); if (st === 'none' || st === 'lifetime') return '';
        var p = plan(u.sub.plan), tot = (p && p.days ? p.days : 30) * DAY;
        var pct = clamp(msLeft(u) / tot * 100, 0, 100);
        return '<div class="bar-mini ' + (st === 'expiring' ? 'warn' : st === 'expired' ? 'bad' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
    }
    function paidTotal(u) { return u.payments.reduce(function (a, p) { return a + (p.amount || 0); }, 0); }
    function paidDays(u) { return u.payments.reduce(function (a, p) { var pl = plan(p.plan); return a + (pl ? pl.days : 0); }, 0); }
    function hours30(u) { return u.usage.daily.slice(-30).reduce(function (a, b) { return a + b; }, 0); }
    function hoursN(u, n) { return u.usage.daily.slice(-n).reduce(function (a, b) { return a + b; }, 0); }

    function hist(u, t, k) { u.history.unshift({ at: now(), t: t, k: k || '', by: ADMIN_NAME }); }
    function logA(act, target, u) { S.log.unshift({ id: uid(), at: now(), by: ADMIN_NAME, act: act, target: target, uid: u ? u.id : null }); }
    function uTag(u) { return '@' + u.tiktok; }

    /* ---- واجهة البيانات: هذي الدوال تتحوّل لطلبات السيرفر لما ينربط ---- */
    var API = {
        addDays: function (u, n, why, silent) {
            n = Number(n); if (!n) return false;
            var st = subState(u);
            if (st === 'lifetime') { if (!silent) toast('اشتراكه مفتوح أصلاً', true); return false; }
            if (st === 'none' || st === 'expired') {
                if (n < 0) { if (!silent) toast('ما عنده اشتراك نشط تنخصم منه أيام', true); return false; }
                u.sub = { plan: u.sub ? u.sub.plan : 'monthly', start: now(), end: now() + n * DAY, lifetime: false, frozen: null, renewals: u.sub ? u.sub.renewals : 0, source: 'gift' };
            } else if (st === 'frozen') u.sub.frozen.remaining = Math.max(0, u.sub.frozen.remaining + n * DAY);
            else u.sub.end = Math.max(now(), u.sub.end + n * DAY);
            var t = (n > 0 ? 'إضافة ' + n + ' يوم' : 'خصم ' + (-n) + ' يوم') + (why ? ' — ' + why : '');
            hist(u, t, n > 0 ? 'ok' : 'warn');
            if (!silent) logA(n > 0 ? 'أضاف ' + n + ' يوم' : 'خصم ' + (-n) + ' يوم', uTag(u), u);
            return true;
        },
        setEnd: function (u, ts) {
            if (!u.sub) u.sub = { plan: 'monthly', start: now(), end: ts, lifetime: false, frozen: null, renewals: 0, source: 'gift' };
            u.sub.lifetime = false; u.sub.frozen = null; u.sub.end = ts;
            hist(u, 'تغيير تاريخ الانتهاء إلى ' + fdate(ts), 'warn'); logA('غيّر تاريخ الانتهاء', uTag(u) + ' ← ' + fdate(ts), u);
        },
        renew: function (u, planId, amount, method) {
            var p = plan(planId); if (!p) return;
            if (p.id === 'lifetime') return API.setLifetime(u, true, method);
            var st = subState(u);
            if (st === 'frozen') API.unfreeze(u, true);
            st = subState(u);
            var had = !!u.sub && st !== 'none';
            var base = (st === 'active' || st === 'expiring') ? u.sub.end : now();
            u.sub = { plan: p.id, start: (st === 'active' || st === 'expiring') ? u.sub.start : now(), end: base + p.days * DAY, lifetime: false, frozen: null, renewals: (u.sub ? u.sub.renewals : 0) + (had ? 1 : 0), source: amount ? 'paid' : 'gift' };
            u.payments.unshift({ at: now(), amount: Number(amount) || 0, plan: p.id, method: method || 'يدوي' });
            hist(u, (had ? 'تجديد ' : 'اشتراك ') + p.name + (amount ? ' — ' + money(amount) : ' (بدون مبلغ)'), 'gold');
            logA((had ? 'جدّد ' : 'فعّل ') + p.name, uTag(u), u);
        },
        setLifetime: function (u, on, method) {
            if (on) {
                u.sub = { plan: 'lifetime', start: u.sub ? u.sub.start : now(), end: null, lifetime: true, frozen: null, renewals: u.sub ? u.sub.renewals : 0, source: 'gift' };
                u.payments.unshift({ at: now(), amount: 0, plan: 'lifetime', method: method || 'هدية من الأدمن' });
                hist(u, 'اشتراك مفتوح (بدون انتهاء)', 'gold'); logA('عطى اشتراك مفتوح', uTag(u), u);
            } else if (u.sub) {
                u.sub.lifetime = false; u.sub.plan = 'monthly'; u.sub.end = now() + 30 * DAY;
                hist(u, 'إلغاء الاشتراك المفتوح — صار شهري ينتهي ' + fdate(u.sub.end), 'warn'); logA('ألغى الاشتراك المفتوح', uTag(u), u);
            }
        },
        freeze: function (u, why) {
            if (!u.sub || subState(u) === 'expired' || u.sub.lifetime || u.sub.frozen) return;
            u.sub.frozen = { at: now(), remaining: u.sub.end - now(), why: why || '' };
            hist(u, 'تجميد الاشتراك' + (why ? ' (' + why + ')' : '') + ' — باقي ' + Math.ceil(u.sub.frozen.remaining / DAY) + ' يوم محفوظة', 'warn'); logA('جمّد اشتراك', uTag(u), u);
        },
        unfreeze: function (u, quiet) {
            if (!u.sub || !u.sub.frozen) return;
            u.sub.end = now() + u.sub.frozen.remaining; u.sub.frozen = null;
            if (!quiet) { hist(u, 'فك التجميد — ينتهي ' + fdate(u.sub.end), 'ok'); logA('فك تجميد', uTag(u), u); }
        },
        cancel: function (u) {
            if (!u.sub) return;
            u.sub.lifetime = false; u.sub.frozen = null; u.sub.end = now() - 1000;
            hist(u, 'إنهاء الاشتراك فوراً', 'bad'); logA('أنهى اشتراك', uTag(u), u);
        },
        setStatus: function (u, st, why) {
            u.status = st;
            var L = { active: 'تفعيل الحساب', suspended: 'إيقاف الحساب', banned: 'حظر الحساب' };
            hist(u, L[st] + (why ? ': ' + why : ''), st === 'active' ? 'ok' : 'bad'); logA(L[st], uTag(u), u);
        },
        setTester: function (u, on) { u.tester = on; hist(u, (on ? 'إعطاء' : 'سحب') + ' صلاحية «تجربة Veyro»', on ? 'ok' : 'warn'); logA((on ? 'عطى' : 'سحب') + ' صلاحية التجربة', uTag(u), u); },
        logoutAll: function (u) { u.devices = 0; u.online = false; u.liveSince = null; hist(u, 'تسجيل خروج من كل الأجهزة', 'warn'); logA('سجّل خروجه من كل الأجهزة', uTag(u), u); },
        setLimits: function (u, l) { u.limits = l; hist(u, 'تعديل الحدود: ' + (l.screens == null ? 'الشاشات حسب الخطة' : l.screens + ' شاشة') + '، ' + (l.videos == null ? 'الفيديوهات حسب الخطة' : l.videos + ' فيديو'), ''); logA('عدّل الحدود', uTag(u), u); },
        setNotes: function (u, t) { u.notes = t; logA('عدّل الملاحظات', uTag(u), u); },
        wipe: function (u) { u.usage.screens = 0; u.usage.videos = 0; u.usage.storageMb = 0; hist(u, 'حذف بيانات فيرو (الشاشات والفيديوهات)', 'bad'); logA('حذف بيانات فيرو', uTag(u), u); },
        unlinkTiktok: function (u) { u.tiktokVerified = false; hist(u, 'فك توثيق تيك توك — لازم يوثّق من جديد', 'warn'); logA('فك توثيق تيك توك', uTag(u), u); },

        genCodes: function (o) {
            var out = [];
            for (var i = 0; i < o.count; i++) {
                var c; do { c = genCode(o.prefix); } while (S.codes.some(function (x) { return x.code === c; }) || out.some(function (x) { return x.code === c; }));
                out.push({ code: c, type: o.type, days: o.days || 0, plan: o.plan || null, maxUses: o.maxUses, uses: [], expires: o.expires || null, campaign: o.campaign || '', created: now(), by: ADMIN_NAME, disabled: false, forUser: o.forUser || null });
            }
            S.codes = out.concat(S.codes);
            logA('أنشأ ' + o.count + ' كود (' + codeTypeName(o.type) + ')', o.campaign || '—');
            return out;
        },
        redeem: function (codeStr, u) {
            var c = S.codes.filter(function (x) { return x.code === String(codeStr).trim().toUpperCase(); })[0];
            if (!c) return 'الكود غير موجود';
            var st = codeState(c);
            if (st !== 'active') return 'الكود ' + CODE_ST[st][0];
            if (c.forUser && c.forUser !== u.id) return 'الكود مخصّص لستريمر ثاني';
            if (c.uses.some(function (x) { return x.uid === u.id; })) return 'هذا الستريمر استخدم الكود قبل';
            if (u.status !== 'active') return 'الحساب موقوف أو محظور';
            if (c.type === 'extra' && !isPaying(u) && subState(u) !== 'frozen') return 'كود الأيام الإضافية للمشتركين الحاليين بس';
            if (c.type === 'days' || c.type === 'extra') API.addDays(u, c.days, 'كود ' + c.code, true);
            else if (c.type === 'plan') API.renew(u, c.plan, 0, 'كود ' + c.code);
            else if (c.type === 'lifetime') API.setLifetime(u, true, 'كود ' + c.code);
            c.uses.push({ uid: u.id, at: now() });
            hist(u, 'استخدم الكود ' + c.code, 'gold');
            return null;
        },

        saveAsset: function (a, publish) {
            var i = S.assets.findIndex(function (x) { return x.id === a.id; });
            a.updated = now();
            if (publish) { a.version = (a.version || 0) + (a.status === 'published' ? 1 : 0) || 1; a.status = 'published'; }
            if (i < 0) S.assets.unshift(a); else S.assets[i] = a;
            logA(publish ? 'نشر أصل للجميع' : 'حفظ أصل', typeName(a.type) + ' «' + a.name + '»');
        },
        deleteAsset: function (a) { S.assets = S.assets.filter(function (x) { return x.id !== a.id; }); logA('حذف أصل', typeName(a.type) + ' «' + a.name + '»'); }
    };

    /* =========================================================
       الأكواد
       ========================================================= */
    var CODE_TYPES = { days: 'اشتراك بأيام', plan: 'خطة كاملة', lifetime: 'اشتراك مفتوح', extra: 'أيام إضافية للمشتركين' };
    function codeTypeName(t) { return CODE_TYPES[t] || t; }
    var CODE_ST = { active: ['فعّال', 'ok'], used: ['مستخدم بالكامل', 'lav'], expired: ['منتهي', 'bad'], disabled: ['معطّل', 'mute'] };
    function codeState(c) { if (c.disabled) return 'disabled'; if (c.uses.length >= c.maxUses) return 'used'; if (c.expires && c.expires < now()) return 'expired'; return 'active'; }
    function codeValue(c) { if (c.type === 'plan') return planName(c.plan); if (c.type === 'lifetime') return '∞'; return c.days + ' يوم'; }

    /* =========================================================
       واجهة عامة: التنبيهات، النوافذ، التأكيد
       ========================================================= */
    function toast(msg, bad) {
        var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.innerHTML = '<i></i>' + esc(msg);
        $('#toasts').appendChild(t); setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 320); }, 2600);
    }
    var modalStack = [];
    function openModal(o) {
        var bg = document.createElement('div'); bg.className = 'modal-bg';
        bg.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"><div class="modal-h"><h3>' + o.title + '</h3><button type="button" class="ob-btn ghost icon sm" data-x aria-label="إغلاق">' + ic('x') + '</button></div><div class="modal-b">' + (o.body || '') + '</div>' + (o.foot ? '<div class="modal-f">' + o.foot + '</div>' : '') + '</div>';
        $('#modal-root').appendChild(bg);
        var m = { el: bg, close: function () { if (o.onClose) o.onClose(); bg.remove(); modalStack = modalStack.filter(function (x) { return x !== m; }); } };
        modalStack.push(m);
        bg.addEventListener('mousedown', function (e) { if (e.target === bg) m.close(); });
        bg.querySelector('[data-x]').addEventListener('click', m.close);
        if (o.onMount) o.onMount(bg, m);
        var f = bg.querySelector('input:not([type=hidden]):not([type=file]):not([hidden]),select,textarea'); if (f && !o.noFocus) setTimeout(function () { try { f.focus(); } catch (e) { /* ignore */ } }, 50);
        return m;
    }
    function confirmBox(o) {
        return new Promise(function (res) {
            var done = false;
            var m = openModal({
                title: o.title, body: '<p>' + o.text + '</p>' + (o.input ? '<div class="field"><label for="cf-in">' + o.input + '</label><input id="cf-in" class="ob-input" placeholder="' + esc(o.ph || '') + '"></div>' : ''),
                foot: '<button type="button" class="ob-btn ' + (o.danger ? 'danger' : 'primary') + '" data-ok>' + (o.ok || 'تأكيد') + '</button><button type="button" class="ob-btn ghost" data-no>رجوع</button>',
                noFocus: !o.input,
                onClose: function () { if (!done) res(null); },
                onMount: function (el, mm) {
                    el.querySelector('[data-ok]').addEventListener('click', function () { done = true; var v = o.input ? el.querySelector('#cf-in').value.trim() : true; mm.close(); res(v === '' ? true : v); });
                    el.querySelector('[data-no]').addEventListener('click', function () { mm.close(); });
                }
            });
        });
    }

    /* =========================================================
       الرسوم (SVG بمقياس حقيقي)
       ========================================================= */
    function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
    function barChart(vals, labels, o) {
        o = o || {};
        var W = o.w || 760, H = o.h || 230, pl = 44, pr = 10, pt = 12, pb = 26, n = vals.length;
        var max = niceMax(Math.max.apply(null, vals.concat([0.0001]))), ih = H - pt - pb, bw = (W - pl - pr) / n, gid = 'g' + uid();
        var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" dir="ltr" role="img" aria-label="' + esc(o.label || '') + '"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfc3dc"/><stop offset="1" stop-color="#6e617f" stop-opacity=".55"/></linearGradient></defs>';
        for (var i = 0; i <= 4; i++) {
            var y = pt + ih * (1 - i / 4), v = max * i / 4;
            s += '<line class="gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + (o.fmt ? o.fmt(v) : fmtN(v, v < 10 ? 1 : 0)) + '</text>';
        }
        var step = Math.ceil(n / (o.ticks || 8));
        vals.forEach(function (v, i) {
            var h = v / max * ih, x = pl + i * bw + bw * .16, w = Math.max(1, bw * .68), last = i === n - 1;
            s += '<rect x="' + x.toFixed(1) + '" y="' + (pt + ih - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="' + Math.min(4, w / 3).toFixed(1) + '" fill="' + (last ? '#e9e1f3' : 'url(#' + gid + ')') + '"><title>' + esc(labels[i]) + ': ' + (o.fmt ? o.fmt(v) : fmtN(v, 1)) + '</title></rect>';
            if ((n - 1 - i) % step === 0) s += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
        });
        return s + '</svg>';
    }
    function donut(segs, size) {
        size = size || 150; var r = size / 2 - 12, c = 2 * Math.PI * r, tot = segs.reduce(function (a, s) { return a + s.v; }, 0) || 1, off = 0;
        var s = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="توزيع"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(169,155,184,.1)" stroke-width="16"/>';
        segs.forEach(function (sg) {
            var len = sg.v / tot * c;
            s += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + sg.c + '" stroke-width="16" stroke-dasharray="' + Math.max(0, len - 2) + ' ' + c + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"><title>' + esc(sg.l) + ': ' + sg.v + '</title></circle>';
            off += len;
        });
        return s + '<text x="50%" y="48%" text-anchor="middle" fill="#f3eff8" font-size="22" font-weight="700" font-family="Noto Kufi Arabic, sans-serif">' + tot + '</text><text x="50%" y="64%" text-anchor="middle" fill="#857a95" font-size="11">مشترك</text></svg>';
    }
    function ring(pct, label, size) {
        size = size || 84; var r = size / 2 - 7, c = 2 * Math.PI * r;
        return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(12,11,16,.6)" stroke-width="7"/><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#e9e1f3" stroke-linecap="' + (pct > 0 ? 'round' : 'butt') + '" stroke-width="7" stroke-dasharray="' + (c * clamp(pct, 0, 1)) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" style="filter:drop-shadow(0 0 6px rgba(233,225,243,.6))"/><text x="50%" y="54%" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="Noto Kufi Arabic, sans-serif">' + label + '</text></svg>';
    }
    function dayLabels(n) { var a = []; for (var i = n - 1; i >= 0; i--) { var d = new Date(now() - i * DAY); a.push(d.getDate() + '/' + (d.getMonth() + 1)); } return a; }
    function sumDaily(users, n) { var arr = new Array(n).fill(0); users.forEach(function (u) { var d = u.usage.daily.slice(-n); d.forEach(function (v, i) { arr[i] += v; }); }); return arr.map(function (v) { return Math.round(v * 10) / 10; }); }
    function revenueByMonth(m) {
        var out = [], labels = [], d = new Date(now());
        for (var i = m - 1; i >= 0; i--) {
            var a = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime(), b = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
            var sum = 0; S.users.forEach(function (u) { u.payments.forEach(function (p) { if (p.at >= a && p.at < b) sum += p.amount || 0; }); });
            out.push(sum); labels.push(DFM.format(new Date(a)));
        }
        return { vals: out, labels: labels };
    }

    function avatar(u, lg) {
        if (u.avatar) return '<span class="av' + (lg ? ' lg' : '') + '"><img src="' + esc(u.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' + (u.online ? '<i class="on" title="شغّال الحين"></i>' : '') + '</span>';
        var letter = (u.name || '?').trim().charAt(0);
        var hue = (u.id * 47) % 360;
        return '<span class="av' + (lg ? ' lg' : '') + '" style="background:linear-gradient(160deg,hsl(' + hue + ' 22% 52%),hsl(' + ((hue + 40) % 360) + ' 24% 26%))">' + esc(letter) + (u.online ? '<i class="on" title="شغّال الحين"></i>' : '') + '</span>';
    }
    function uCell(u, em) { return '<div class="u">' + avatar(u) + '<div class="m"><b>' + esc(u.name) + (u.tester ? ' <span class="tag lav" style="font-size:10px;padding:0 6px">تجربة</span>' : '') + '</b><small>@' + esc(u.tiktok) + '</small>' + (em && u.email ? '<small class="em">' + esc(u.email) + '</small>' : '') + '</div></div>'; }
    function statusTag(u) { return u.status === 'banned' ? '<span class="tag bad">محظور</span>' : u.status === 'suspended' ? '<span class="tag warn">موقوف</span>' : ''; }

    /* =========================================================
       التنقّل
       ========================================================= */
    var PAGES = [
        { g: 'المتابعة' },
        { id: 'overview', t: 'نظرة عامة', i: 'overview', sub: function () { return 'ملخّص فيرو اليوم — ' + fdate(now()); } },
        { id: 'streamers', t: 'الستريمرز', i: 'users', badge: function () { return S.users.length; }, sub: function () { return 'كل من دخل فيرو بحساب ألعاب أيمن'; } },
        { id: 'subs', t: 'الاشتراكات', i: 'crown', badge: function () { var n = S.users.filter(function (u) { return subState(u) === 'expiring'; }).length; return n ? { n: n, c: 'warn' } : null; }, sub: function () { return 'المدد والتجديد والخطط'; } },
        { id: 'codes', t: 'الأكواد', i: 'ticket', badge: function () { return S.codes.filter(function (c) { return codeState(c) === 'active'; }).length; }, sub: function () { return 'إنشاء أكواد الاشتراك والأيام'; } },
        { g: 'المحتوى' },
        { id: 'library', t: 'مكتبة فيرو', i: 'layers', badge: function () { return S.assets.length; }, sub: function () { return 'أصول عامة تنرفع لمكتبات كل المستخدمين'; } },
        { g: 'التحليل' },
        { id: 'stats', t: 'الإحصائيات', i: 'chart', sub: function () { return 'الساعات الفعلية والدعم والتجديد'; } },
        { id: 'activity', t: 'سجل الأدمن', i: 'log', sub: function () { return 'كل تعديل صار من اللوحة'; } },
        { id: 'config', t: 'الإعدادات', i: 'sliders', sub: function () { return 'إعدادات فيرو العامة'; } }
    ];
    var cur = 'overview';
    function renderNav() {
        $('#vy-nav').innerHTML = PAGES.map(function (p) {
            if (p.g) return '<div class="vy-group">' + p.g + '</div>';
            var b = p.badge ? p.badge() : null, bh = '';
            if (b != null && b !== 0) bh = typeof b === 'object' ? '<span class="badge ' + b.c + '">' + b.n + '</span>' : '<span class="badge">' + b + '</span>';
            return '<button type="button" class="vy-item' + (cur === p.id ? ' on' : '') + '" data-go="' + p.id + '" data-tip="' + p.t + '">' + ic(p.i) + '<span class="lbl">' + p.t + '</span>' + bh + '</button>';
        }).join('');
    }
    function go(id, keepScroll) {
        if (!VIEWS[id]) id = 'overview';
        var changed = cur !== id;
        cur = id;
        if (location.hash.slice(1) !== id) { try { history.replaceState(null, '', '#' + id); } catch (e) { location.hash = id; } }
        var p = PAGES.filter(function (x) { return x.id === id; })[0];
        $('#pg-title').textContent = p.t; $('#pg-sub').textContent = p.sub ? p.sub() : '';
        document.title = 'Veyro Admin — ' + p.t;
        renderNav();
        var sc = $('#vy-scroll'), top = sc.scrollTop;
        stopThumbs();
        sc.innerHTML = '<div class="wrap">' + VIEWS[id].html() + '</div>';
        if (VIEWS[id].mount) VIEWS[id].mount();
        if (changed) { sc.scrollTop = 0; window.scrollTo(0, 0); var v = $('#vy-view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
        else if (keepScroll !== false) sc.scrollTop = top;
        $('#vy-app').classList.remove('open');
    }
    function refresh() { if (!REAL) save(); go(cur); if (DR.uid) renderDrawer(); }
    function part(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

    var VIEWS = {};

    /* =========================================================
       ١) نظرة عامة
       ========================================================= */
    function kpi(icon, val, label, delta, go2) {
        return '<div class="kpi glass' + (go2 ? ' click' : '') + '"' + (go2 ? ' data-go="' + go2 + '"' : '') + '><span class="ic">' + ic(icon) + '</span><b class="num">' + val + '</b><span>' + label + '</span>' + (delta ? '<em class="dl ' + (delta[0] === '-' ? 'dn' : 'up') + '">' + delta + '</em>' : '') + '</div>';
    }
    VIEWS.overview = {
        html: function () {
            var U = S.users, T = now();
            var paying = U.filter(isPaying), live = U.filter(function (u) { return u.online; });
            var newWeek = U.filter(function (u) { return u.veyroSince > T - 7 * DAY; }).length;
            var monthStart = new Date(new Date(T).getFullYear(), new Date(T).getMonth(), 1).getTime();
            var rev = 0, revPrev = 0, prevStart = new Date(new Date(T).getFullYear(), new Date(T).getMonth() - 1, 1).getTime();
            U.forEach(function (u) { u.payments.forEach(function (p) { if (p.at >= monthStart) rev += p.amount; else if (p.at >= prevStart) revPrev += p.amount; }); });
            var d30 = sumDaily(U, 30), h30 = d30.reduce(function (a, b) { return a + b; }, 0);
            var prev30 = 0; U.forEach(function (u) { prev30 += u.usage.daily.slice(-60, -30).reduce(function (a, b) { return a + b; }, 0); });
            var everSub = U.filter(function (u) { return u.sub; }), renewed = everSub.filter(function (u) { return u.sub.renewals > 0; }).length;
            var exp = U.filter(function (u) { return subState(u) === 'expiring'; }).sort(function (a, b) { return a.sub.end - b.sub.end; });
            var pct = function (a, b) { if (!b) return ''; var d = (a - b) / b * 100; return (d >= 0 ? '+' : '') + fmtN(d) + '%'; };
            return '' +
                '<div class="kpis">' +
                kpi('users', fmtN(U.length), 'ستريمر دخل فيرو', newWeek ? '+' + newWeek + ' هالأسبوع' : '', 'streamers') +
                kpi('crown', fmtN(paying.length), 'اشتراك نشط', '', 'subs') +
                kpi('money', fmtN(rev) + '<small>' + CUR + '</small>', 'دخل هالشهر', pct(rev, revPrev), 'stats') +
                kpi('clock', hrs(h30) + '<small>ساعة</small>', 'استخدام فعلي آخر 30 يوم', pct(h30, prev30), 'stats') +
                kpi('live', fmtN(live.length), 'شغّالين على فيرو الحين', '', 'streamers') +
                kpi('repeat', everSub.length ? fmtN(renewed / everSub.length * 100) + '%' : '—', 'نسبة اللي جدّدوا مرة أو أكثر', '', 'stats') +
                '</div>' +
                '<div class="g-main">' +
                '<section class="card glass"><div class="card-h"><h3>ساعات فيرو اليومية <span class="sub">آخر 30 يوم — كل الستريمرز</span></h3></div>' + barChart(d30, dayLabels(30), { label: 'ساعات الاستخدام اليومية', fmt: function (v) { return fmtN(v); } }) + '</section>' +
                '<section class="card glass"><div class="card-h"><h3>ينتهي خلال 7 أيام</h3><button type="button" class="ob-btn ghost sm" data-go="subs" data-subtab="expiring">الكل</button></div>' +
                (exp.length ? '<div class="list">' + exp.slice(0, 6).map(function (u) {
                    return '<div class="li">' + avatar(u) + '<div class="m click" data-user="' + u.id + '" style="cursor:pointer"><b>' + esc(u.name) + '</b><small>' + planName(u.sub.plan) + ' — ' + daysLeftTxt(u) + '</small></div><button type="button" class="ob-btn ghost sm" data-a="quickDays" data-id="' + u.id + '" data-n="7">+7 أيام</button></div>';
                }).join('') + '</div>' : '<div class="empty-s">ما فيه اشتراكات تنتهي هالأسبوع</div>') +
                '</section></div>' +
                '<div class="grid2">' +
                '<section class="card glass"><div class="card-h"><h3>شغّالين الحين <span class="sub">رابط الشاشة مفتوح والبث متصل</span></h3></div>' +
                (live.length ? '<div class="list">' + live.sort(function (a, b) { return a.liveSince - b.liveSince; }).map(function (u) {
                    return '<div class="li click" data-user="' + u.id + '">' + avatar(u) + '<div class="m"><b>' + esc(u.name) + '</b><small class="ltr">@' + esc(u.tiktok) + '</small></div><span class="tag ok live">بث من ' + rel(u.liveSince).replace('قبل ', '') + '</span></div>';
                }).join('') + '</div>' : '<div class="empty-s">ما فيه أحد شغّال الحين</div>') + '</section>' +
                '<section class="card glass"><div class="card-h"><h3>آخر تعديلات الأدمن</h3><button type="button" class="ob-btn ghost sm" data-go="activity">السجل كامل</button></div>' + logList(S.log.slice(0, 7)) + '</section>' +
                '</div>';
        }
    };
    function logList(items) {
        if (!items.length) return '<div class="empty-s">ما فيه تعديلات للحين</div>';
        return '<div class="list">' + items.map(function (l) {
            return '<div class="li' + (l.uid ? ' click" data-user="' + l.uid : '') + '">' + ic('log', ' style="width:18px;height:18px;color:var(--lav);flex:none"') + '<div class="m"><b>' + esc(l.act) + '</b><small>' + esc(l.target) + ' · ' + esc(l.by) + '</small></div><span class="v mut2" title="' + fdt(l.at) + '">' + rel(l.at) + '</span></div>';
        }).join('') + '</div>';
    }

    /* =========================================================
       ٢) الستريمرز
       ========================================================= */
    var ST = { q: '', field: 'all', filter: 'all', sort: 'recent', page: 0, sel: {} };
    var ST_FILTERS = [
        ['all', 'الكل'], ['paying', 'مشترك'], ['expiring', 'ينتهي قريباً'], ['expired', 'منتهي'], ['none', 'بدون اشتراك'],
        ['lifetime', 'مفتوح'], ['frozen', 'مجمّد'], ['online', 'شغّال الحين'], ['tester', 'صلاحية التجربة'], ['blocked', 'موقوف/محظور']
    ];
    var FIELDS = [['all', 'كل الحقول'], ['id', 'الآيدي'], ['tiktok', 'يوزر تيك توك'], ['email', 'الإيميل'], ['name', 'الاسم']];
    function matchUser(u, q, field) {
        if (!q) return true;
        var raw = q.trim().replace(/^@/, '').toLowerCase(), n = normAr(raw);
        var by = {
            id: function () { return String(u.id).indexOf(raw) === 0 || (u.customId && String(u.customId).toLowerCase().indexOf(raw) === 0); },
            tiktok: function () { return u.tiktok.indexOf(raw) >= 0; },
            email: function () { return u.email.toLowerCase().indexOf(raw) >= 0; },
            name: function () { return normAr(u.name).indexOf(n) >= 0 || u.username.toLowerCase().indexOf(raw) >= 0; }
        };
        if (field && field !== 'all') return by[field]();
        return by.id() || by.tiktok() || by.email() || by.name();
    }
    function stFilter(u, f) {
        var s = subState(u);
        switch (f) {
            case 'paying': return isPaying(u);
            case 'online': return u.online;
            case 'tester': return u.tester;
            case 'blocked': return u.status !== 'active';
            case 'all': return true;
            default: return s === f;
        }
    }
    var SORTS = {
        recent: ['الأحدث بفيرو', function (a, b) { return b.veyroSince - a.veyroSince; }],
        seen: ['آخر ظهور', function (a, b) { return (b.online - a.online) || b.lastSeen - a.lastSeen; }],
        hours: ['الأكثر ساعات (30 يوم)', function (a, b) { return hours30(b) - hours30(a); }],
        paid: ['الأعلى دعماً', function (a, b) { return paidTotal(b) - paidTotal(a); }],
        ending: ['الأقرب انتهاءً', function (a, b) { var x = isPaying(a) && !a.sub.lifetime ? a.sub.end : Infinity, y = isPaying(b) && !b.sub.lifetime ? b.sub.end : Infinity; return x - y; }],
        renew: ['الأكثر تجديداً', function (a, b) { return (b.sub ? b.sub.renewals : -1) - (a.sub ? a.sub.renewals : -1); }]
    };
    function stList() { return S.users.filter(function (u) { return stFilter(u, ST.filter) && matchUser(u, ST.q, ST.field); }).sort(SORTS[ST.sort][1]); }
    var PER = 15;
    function stTable() {
        var list = stList(), pages = Math.max(1, Math.ceil(list.length / PER));
        ST.page = clamp(ST.page, 0, pages - 1);
        var rows = list.slice(ST.page * PER, ST.page * PER + PER);
        var selN = Object.keys(ST.sel).length;
        var allOn = rows.length && rows.every(function (u) { return ST.sel[u.id]; });
        return (selN ? '<div class="bulk"><b>' + selN + ' مختار</b>' +
            '<button type="button" class="ob-btn sm" data-a="bulkDays">' + ic('plus') + 'إضافة أيام</button>' +
            '<button type="button" class="ob-btn sm" data-a="bulkGrant">' + ic('crown') + 'منح اشتراك</button>' +
            '<button type="button" class="ob-btn sm" data-a="bulkTester">' + ic('bolt') + 'صلاحية التجربة</button>' +
            '<button type="button" class="ob-btn sm" data-a="bulkCsv">' + ic('csv') + 'نسخ CSV</button>' +
            '<button type="button" class="ob-btn ghost sm" data-a="clearSel">إلغاء التحديد</button></div>' : '') +
            '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" class="chk" data-c="selPage" aria-label="تحديد الصفحة"' + (allOn ? ' checked' : '') + '></th><th>الستريمر</th><th>الآيدي</th><th>الاشتراك</th><th>المتبقي</th><th>ساعات 30 يوم</th><th>قيمة الدعم</th><th>تجديد</th><th>آخر ظهور</th></tr></thead><tbody>' +
            (rows.length ? rows.map(function (u) {
                return '<tr class="click' + (ST.sel[u.id] ? ' sel' : '') + '" data-user="' + u.id + '"><td data-stop><input type="checkbox" class="chk" data-c="selOne" data-id="' + u.id + '" aria-label="تحديد"' + (ST.sel[u.id] ? ' checked' : '') + '></td>' +
                    '<td>' + uCell(u, true) + '</td><td class="num ltr">' + esc(u.customId || u.id) + '</td>' +
                    '<td>' + subTag(u) + ' ' + statusTag(u) + (u.sub ? ' <small class="mut2">' + planName(u.sub.plan) + '</small>' : '') + '</td>' +
                    '<td><div style="display:flex;align-items:center;gap:8px">' + leftBar(u) + '<span class="num">' + daysLeftTxt(u) + '</span></div></td>' +
                    '<td class="num">' + hrs(hours30(u)) + ' س</td><td class="num">' + money(paidTotal(u)) + '</td><td class="num">' + (u.sub ? u.sub.renewals : '—') + '</td>' +
                    '<td>' + (u.online ? '<span class="tag ok live">الحين</span>' : '<span class="mut2">' + rel(u.lastSeen) + '</span>') + '</td></tr>';
            }).join('') : '<tr><td colspan="9"><div class="empty-s" style="margin:10px">ما لقيت أحد بهالبحث. جرّب الآيدي أو يوزر تيك توك أو الإيميل.</div></td></tr>') +
            '</tbody></table></div>' +
            '<div class="pager"><span>' + fmtN(list.length) + ' ستريمر' + (ST.q ? ' مطابق' : '') + '</span><div style="display:flex;gap:6px;align-items:center">' +
            '<button type="button" class="ob-btn ghost sm" data-a="pg" data-d="-1"' + (ST.page ? '' : ' disabled') + '>السابق</button><span class="num">' + (ST.page + 1) + ' / ' + pages + '</span>' +
            '<button type="button" class="ob-btn ghost sm" data-a="pg" data-d="1"' + (ST.page < pages - 1 ? '' : ' disabled') + '>التالي</button></div></div>';
    }
    VIEWS.streamers = {
        html: function () {
            var cnt = {}; ST_FILTERS.forEach(function (f) { cnt[f[0]] = S.users.filter(function (u) { return stFilter(u, f[0]); }).length; });
            return '<section class="card glass">' +
                '<div class="toolbar"><div class="search-in">' + ic('search') + '<input id="st-q" class="ob-input" type="search" placeholder="ابحث بالآيدي، @يوزر تيك توك، الإيميل، أو الاسم" value="' + esc(ST.q) + '" autocomplete="off"></div>' +
                '<div class="ob-seg" role="tablist" aria-label="ابحث بـ">' + FIELDS.map(function (f) { return '<button type="button" data-a="stField" data-v="' + f[0] + '" class="' + (ST.field === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
                '<select id="st-sort" class="ob-input" aria-label="الترتيب">' + Object.keys(SORTS).map(function (k) { return '<option value="' + k + '"' + (ST.sort === k ? ' selected' : '') + '>' + SORTS[k][0] + '</option>'; }).join('') + '</select></div>' +
                '<div class="ob-pills" style="margin-bottom:12px">' + ST_FILTERS.map(function (f) { return '<button type="button" class="ob-pill' + (ST.filter === f[0] ? ' on' : '') + '" data-a="stFilter" data-v="' + f[0] + '">' + f[1] + ' <span class="ct num">' + cnt[f[0]] + '</span></button>'; }).join('') + '</div>' +
                '<div id="st-table">' + stTable() + '</div></section>';
        },
        mount: function () {
            var q = $('#st-q');
            q.addEventListener('input', function () { ST.q = q.value; ST.page = 0; part('st-table', stTable()); });
            $('#st-sort').addEventListener('change', function (e) { ST.sort = e.target.value; part('st-table', stTable()); });
        }
    };

    /* =========================================================
       ملف الستريمر (لوحة جانبية)
       ========================================================= */
    var DR = { uid: null, tab: 'info' };
    function openUser(id, tab) { DR.uid = Number(id); DR.tab = tab || 'info'; renderDrawer(); $('#drawer').classList.add('show'); $('#dr-bg').classList.add('show'); closeGs(); }
    function closeDrawer() { DR.uid = null; $('#drawer').classList.remove('show'); $('#dr-bg').classList.remove('show'); }
    var DR_TABS = [['info', 'نظرة عامة'], ['sub', 'الاشتراك'], ['acct', 'الحساب'], ['usage', 'الاستخدام'], ['hist', 'السجل']];
    function idChip(label, val, ltr) { return '<button type="button" class="idc" data-a="copy" data-v="' + esc(val) + '" title="نسخ ' + label + '"><span class="mut2">' + label + '</span> ' + esc(val) + ic('copy') + '</button>'; }
    function renderDrawer() {
        var u = user(DR.uid); if (!u) return closeDrawer();
        var el = $('#drawer');
        var sb = el.querySelector('.drawer-b'), top = sb ? sb.scrollTop : 0;
        el.innerHTML = '<div class="drawer-h">' + avatar(u, true) + '<div class="m"><h2>' + esc(u.name) + ' ' + subTag(u) + ' ' + statusTag(u) + (u.online ? '<span class="tag ok live">شغّال الحين</span>' : '') + '</h2>' +
            '<div class="ids">' + (u.customId ? idChip('آيدي البروفايل', u.customId) : '') + idChip('#', u.id) + (u.tiktok ? idChip('تيك توك', '@' + u.tiktok) : '') + (u.email ? idChip('الإيميل', u.email) : '') + (u.username ? idChip('يوزر', u.username) : '') + '</div></div>' +
            '<button type="button" class="ob-btn ghost icon" data-a="closeDr" aria-label="إغلاق">' + ic('x') + '</button></div>' +
            '<div class="drawer-tabs"><div class="ob-seg">' + DR_TABS.map(function (t) { return '<button type="button" data-a="drTab" data-v="' + t[0] + '" class="' + (DR.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
            '<div class="drawer-b">' + DRT[DR.tab](u) + '</div>';
        if (sb) el.querySelector('.drawer-b').scrollTop = top;
        var nt = $('#u-notes'); if (nt) nt.addEventListener('change', function () { var t = nt.value; doOp('setNotes', { uid: u.id, text: t }, function () { API.setNotes(u, t); }, 'انحفظت الملاحظات'); });
    }
    function subBox(u) {
        var st = subState(u), p = u.sub ? plan(u.sub.plan) : null;
        var pct = st === 'lifetime' ? 1 : (st === 'none' || st === 'expired') ? 0 : msLeft(u) / ((p && p.days ? p.days : 30) * DAY);
        var label = st === 'lifetime' ? '∞' : st === 'none' ? '—' : st === 'expired' ? '0' : (msLeft(u) < DAY ? '<1' : String(Math.ceil(msLeft(u) / DAY)));
        var line = st === 'none' ? 'ما اشترك أبداً' : st === 'lifetime' ? 'اشتراك مفتوح بدون تاريخ انتهاء' : st === 'frozen' ? 'مجمّد من ' + fdate(u.sub.frozen.at) + ' — باقي ' + Math.ceil(u.sub.frozen.remaining / DAY) + ' يوم محفوظة' : st === 'expired' ? 'انتهى ' + fdate(u.sub.end) + ' (' + rel(u.sub.end) + ')' : 'ينتهي ' + fdate(u.sub.end) + ' — باقي ' + daysLeftTxt(u);
        return '<div class="subbox">' + ring(pct, label) + '<div class="m"><b>' + (u.sub ? planName(u.sub.plan) : 'بدون اشتراك') + '</b><span>' + line + '</span>' + (u.sub ? '<div class="mut2" style="font-size:12px;margin-top:4px">بدأ ' + fdate(u.sub.start) + ' · جدّد ' + u.sub.renewals + ' مرة · ' + (u.sub.source === 'paid' ? 'مدفوع' : u.sub.source === 'code' ? 'بكود' : 'هدية') + '</div>' : '') + '</div></div>';
    }
    var DRT = {
        info: function (u) {
            var pt = paidTotal(u);
            return subBox(u) +
                '<div class="sec"><h4>' + ic('chart', ' style="width:16px;height:16px"') + 'إحصائيات فيرو</h4><div class="facts">' +
                fact('الساعات الفعلية (الكل)', hrs(u.usage.hoursTotal) + ' س') + fact('آخر 30 يوم', hrs(hours30(u)) + ' س') + fact('عدد البثوث', fmtN(u.usage.sessions)) +
                fact('متوسط البث', u.usage.sessions ? hrs(u.usage.hoursTotal / u.usage.sessions) + ' س' : '—') +
                fact('قيمة الدعم (المدفوع)', money(pt)) + fact('مدة الاشتراك الكلية', fmtN(paidDays(u)) + ' يوم') + fact('مرات التجديد', u.sub ? u.sub.renewals : 0) +
                fact('دونيشن Streamlabs', u.donations.total ? '$' + fmtN(u.donations.total) + ' <small class="mut2">(' + u.donations.count + ')</small>' : '—') +
                fact('ساعات على الهواء', hrs(u.usage.liveTotal || 0) + ' س') + fact('الشاشات', u.usage.screens) + fact('الفيديوهات', u.usage.videos) + fact('التخزين', u.usage.storageMb + 'MB') +
                '</div></div>' +
                '<div class="sec"><h4>' + ic('users', ' style="width:16px;height:16px"') + 'بيانات الحساب</h4><div class="kv">' +
                kv('آيدي البروفايل', '<span class="ltr num">' + esc(u.customId || '—') + '</span>') + kv('رقم الحساب', '<span class="ltr num">' + u.id + '</span>') + kv('اسم المستخدم', '<span class="ltr">' + esc(u.username) + '</span>') + kv('الاسم', esc(u.name)) +
                kv('الإيميل', u.email ? '<span class="ltr">' + esc(u.email) + '</span>' : '<span class="mut2">— (حساب تيك توك)</span>') +
                kv('تيك توك', '<span class="ltr">@' + esc(u.tiktok) + '</span> ' + (u.tiktokVerified ? '<span class="tag ok">موثّق</span>' : '<span class="tag warn">غير موثّق</span>') + (u.tiktokFollowers ? ' <span class="mut2">' + fmtN(u.tiktokFollowers) + ' متابع</span>' : '')) +
                kv('حساب ألعاب أيمن من', fdate(u.joined)) + kv('أول دخول لفيرو', fdate(u.veyroSince)) + kv('آخر ظهور', u.online ? 'الحين' : fdt(u.lastSeen) + ' (' + rel(u.lastSeen) + ')') +
                kv('الأجهزة المسجّلة', u.devices) + kv('حالة الحساب', u.status === 'active' ? '<span class="tag ok">نشط</span>' : statusTag(u)) + kv('صلاحية «تجربة Veyro»', u.tester ? 'عنده' : 'ما عنده') +
                '</div></div>' +
                '<div class="sec"><h4>ملاحظات الأدمن <span class="sp"></span><small class="mut2" style="font-weight:500">تنحفظ لما تطلع من الخانة</small></h4><textarea id="u-notes" class="ob-input" placeholder="ملاحظة داخلية ما يشوفها الستريمر">' + esc(u.notes) + '</textarea></div>';
        },
        sub: function (u) {
            var st = subState(u), p = S.plans.filter(function (x) { return x.on; });
            var endVal = u.sub && u.sub.end ? isoDay(u.sub.end) : isoDay(now() + 30 * DAY);
            return subBox(u) +
                '<div class="sec"><h4>' + ic('plus', ' style="width:16px;height:16px"') + 'أيام إضافية</h4><div class="quick">' +
                [1, 3, 7, 14, 30, 90].map(function (n) { return '<button type="button" class="ob-btn sm" data-a="uDays" data-n="' + n + '"' + (st === 'lifetime' ? ' disabled' : '') + '>+' + n + '</button>'; }).join('') +
                '<button type="button" class="ob-btn ghost sm" data-a="uDaysCustom"' + (st === 'lifetime' ? ' disabled' : '') + '>عدد مخصص…</button>' +
                '<button type="button" class="ob-btn danger sm" data-a="uDaysMinus"' + (st === 'lifetime' || st === 'none' || st === 'expired' ? ' disabled' : '') + '>خصم أيام…</button></div>' +
                '<p class="mut2" style="margin:10px 0 0;font-size:12.5px">لو اشتراكه منتهي أو ما عنده، الأيام تبدأ من اليوم.' + (st === 'frozen' ? ' الاشتراك مجمّد: الأيام تنضاف للرصيد المحفوظ.' : '') + '</p></div>' +
                '<div class="sec"><h4>التحكم بالمدة</h4><div class="rows">' +
                '<div class="ob-row"><div class="lb"><b>تاريخ الانتهاء</b><small>يحدّد يوم الانتهاء بالضبط</small></div><div class="ct"><input type="date" id="u-end" class="ob-input ltr" value="' + endVal + '" style="width:170px"><button type="button" class="ob-btn sm" data-a="uSetEnd">حفظ</button></div></div>' +
                '<div class="ob-row"><div class="lb"><b>تجديد / تغيير الخطة</b><small>يسجّل دفعة ويمدّد من نهاية الاشتراك الحالي</small></div><div class="ct"><select id="u-plan" class="ob-input" style="width:140px">' + p.map(function (x) { return '<option value="' + x.id + '"' + (u.sub && u.sub.plan === x.id ? ' selected' : '') + '>' + x.name + (x.price ? ' — ' + x.price + ' ' + CUR : '') + '</option>'; }).join('') + '</select><input id="u-amt" type="number" min="0" class="ob-input ltr num" style="width:90px" placeholder="المبلغ" value="' + (u.sub && plan(u.sub.plan) ? plan(u.sub.plan).price : 39) + '"><button type="button" class="ob-btn primary sm" data-a="uRenew">تجديد</button></div></div>' +
                '<div class="ob-row"><div class="lb"><b>اشتراك مفتوح</b><small>بدون تاريخ انتهاء، لين تطفيه</small></div><div class="ct"><label class="ob-toggle"><input type="checkbox" data-c="uLifetime"' + (st === 'lifetime' ? ' checked' : '') + '><span></span></label></div></div>' +
                '<div class="ob-row"><div class="lb"><b>تجميد الاشتراك</b><small>الأيام ما تنحسب وقت التجميد (سفر، مرض…)</small></div><div class="ct"><label class="ob-toggle"><input type="checkbox" data-c="uFreeze"' + (st === 'frozen' ? ' checked' : '') + (st === 'active' || st === 'expiring' || st === 'frozen' ? '' : ' disabled') + '><span></span></label></div></div>' +
                '<div class="ob-row"><div class="lb"><b>إنهاء الاشتراك الحين</b><small>يوقف الأدوات المدفوعة فوراً</small></div><div class="ct"><button type="button" class="ob-btn danger sm" data-a="uCancel"' + (st === 'none' || st === 'expired' ? ' disabled' : '') + '>إنهاء</button></div></div>' +
                '</div></div>' +
                '<div class="sec"><h4>' + ic('money', ' style="width:16px;height:16px"') + 'الدفعات <span class="sp"></span><span class="mut2" style="font-weight:600">' + money(paidTotal(u)) + '</span></h4>' +
                (u.payments.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>الخطة</th><th>المبلغ</th><th>الطريقة</th></tr></thead><tbody>' + u.payments.map(function (pm) {
                    return '<tr><td>' + fdate(pm.at) + '</td><td>' + planName(pm.plan) + '</td><td class="num">' + (pm.amount ? money(pm.amount) : '<span class="mut2">مجاني</span>') + '</td><td>' + esc(pm.method) + '</td></tr>';
                }).join('') + '</tbody></table></div>' : '<div class="empty-s">ما فيه دفعات</div>') + '</div>';
        },
        acct: function (u) {
            var p = u.sub ? plan(u.sub.plan) : plan('monthly');
            return '<div class="sec"><h4>' + ic('shield', ' style="width:16px;height:16px"') + 'حالة الحساب</h4><div class="rows">' +
                '<div class="ob-row"><div class="lb"><b>الحالة</b><small>الموقوف ما يقدر يفتح فيرو، وشاشاته تطفى بالبث</small></div><div class="ct"><div class="ob-seg">' +
                [['active', 'نشط'], ['suspended', 'موقوف'], ['banned', 'محظور']].map(function (s) { return '<button type="button" data-a="uStatus" data-v="' + s[0] + '" class="' + (u.status === s[0] ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') + '</div></div></div>' +
                '<div class="ob-row"><div class="lb"><b>صلاحية «تجربة Veyro»</b><small>يدخل فيرو وقت ما يكون مقفول للأدمن بس</small></div><div class="ct"><label class="ob-toggle"><input type="checkbox" data-c="uTester"' + (u.tester ? ' checked' : '') + '><span></span></label></div></div>' +
                '<div class="ob-row"><div class="lb"><b>تسجيل خروج من كل الأجهزة</b><small>' + u.devices + ' جهاز مسجّل الحين</small></div><div class="ct"><button type="button" class="ob-btn sm" data-a="uLogout">' + ic('logout') + 'تسجيل خروج</button></div></div>' +
                '<div class="ob-row"><div class="lb"><b>توثيق تيك توك</b><small class="ltr" style="text-align:right">@' + esc(u.tiktok) + '</small></div><div class="ct">' + (u.tiktokVerified ? '<span class="tag ok">موثّق</span>' + (REAL ? '' : '<button type="button" class="ob-btn ghost sm" data-a="uUnlink">فك التوثيق</button>') : '<span class="tag warn">غير موثّق</span>') + '</div></div>' +
                '</div></div>' +
                '<div class="sec"><h4>الحدود <span class="sp"></span><small class="mut2" style="font-weight:500">فاضي = حسب خطته (' + (p ? p.name : '—') + ')</small></h4><div class="rows">' +
                '<div class="ob-row"><div class="lb"><b>عدد الشاشات</b><small>يستخدم ' + u.usage.screens + ' من ' + (u.limits.screens != null ? u.limits.screens : p.screens) + '</small></div><div class="ct"><input id="u-lim-s" type="number" min="0" class="ob-input ltr num" style="width:110px" placeholder="' + p.screens + '" value="' + (u.limits.screens != null ? u.limits.screens : '') + '"></div></div>' +
                '<div class="ob-row"><div class="lb"><b>عدد الفيديوهات بالمكتبة</b><small>عنده ' + u.usage.videos + ' من ' + (u.limits.videos != null ? u.limits.videos : p.videos) + ' (' + u.usage.storageMb + 'MB)</small></div><div class="ct"><input id="u-lim-m" type="number" min="0" class="ob-input ltr num" style="width:110px" placeholder="' + p.videos + '" value="' + (u.limits.videos != null ? u.limits.videos : '') + '"></div></div>' +
                '<div style="display:flex;justify-content:flex-start"><button type="button" class="ob-btn primary sm" data-a="uLimits">حفظ الحدود</button></div>' +
                '</div></div>' +
                '<div class="sec" style="border-color:rgba(236,143,157,.3)"><h4 style="color:#f4b6c0">منطقة الخطر</h4><div class="rows">' +
                '<div class="ob-row"><div class="lb"><b>حذف بيانات فيرو</b><small>يحذف شاشاته وفيديوهاته. حساب ألعاب أيمن ما يتأثر</small></div><div class="ct"><button type="button" class="ob-btn danger sm" data-a="uWipe">' + ic('trash') + 'حذف</button></div></div>' +
                '</div></div>';
        },
        usage: function (u) {
            var d = u.usage.daily.slice(-30), sessions = [];
            for (var i = 29; i >= 0 && sessions.length < 10; i--) if (d[i] > 0) sessions.push({ at: now() - (29 - i) * DAY, h: d[i] });
            return '<div class="facts">' + fact('آخر 7 أيام', hrs(hoursN(u, 7)) + ' س') + fact('آخر 30 يوم', hrs(hours30(u)) + ' س') + fact('آخر 90 يوم', hrs(hoursN(u, 90)) + ' س') + fact('أيام بث (30 يوم)', d.filter(function (v) { return v > 0; }).length) + '</div>' +
                '<div class="sec"><h4>الساعات الفعلية يومياً <span class="sp"></span><small class="mut2" style="font-weight:500">وقت رابط شاشة فيرو مفتوح بـOBS</small></h4>' + barChart(d, dayLabels(30), { h: 200, ticks: 6, label: 'ساعات الستريمر' }) + '</div>' +
                '<div class="sec"><h4>آخر البثوث</h4>' + (sessions.length ? '<div class="list">' + sessions.map(function (s) {
                    return '<div class="li"><span class="ic">' + ic('live', ' style="width:18px;height:18px;color:var(--lav)"') + '</span><div class="m"><b>' + fdate(s.at) + '</b><small>' + Math.max(1, Math.round(s.h * 1.4)) + ' شاشة مستخدمة</small></div><span class="v num">' + hrs(s.h) + ' س</span></div>';
                }).join('') + '</div>' : '<div class="empty-s">ما بث بآخر 30 يوم</div>') + '</div>';
        },
        hist: function (u) {
            return '<div class="sec"><h4>سجل الحساب</h4><div class="tl">' + u.history.map(function (h) {
                return '<div class="e ' + (h.k || '') + '">' + esc(h.t) + '<small>' + fdt(h.at) + (h.by ? ' · بواسطة ' + esc(h.by) : '') + '</small></div>';
            }).join('') + '</div></div>';
        }
    };
    function fact(l, v) { return '<div class="fact"><small>' + l + '</small><b class="num">' + v + '</b></div>'; }
    function kv(k, v) { return '<div>' + k + '</div><div>' + v + '</div>'; }

    /* =========================================================
       ٣) الاشتراكات والخطط
       ========================================================= */
    var SB = { tab: 'paying', q: '', sel: {} };
    var SB_TABS = [['paying', 'النشطة'], ['expiring', 'تنتهي خلال 7 أيام'], ['expired', 'المنتهية'], ['lifetime', 'المفتوحة'], ['frozen', 'المجمّدة']];
    function sbList() {
        return S.users.filter(function (u) { return stFilter(u, SB.tab) && matchUser(u, SB.q); }).sort(function (a, b) {
            var x = a.sub.lifetime ? Infinity : a.sub.frozen ? a.sub.frozen.remaining + now() : a.sub.end, y = b.sub.lifetime ? Infinity : b.sub.frozen ? b.sub.frozen.remaining + now() : b.sub.end;
            return SB.tab === 'expired' ? y - x : x - y;
        });
    }
    function sbTable() {
        var list = sbList(), selN = Object.keys(SB.sel).length;
        return (selN ? '<div class="bulk"><b>' + selN + ' مختار</b><button type="button" class="ob-btn sm" data-a="sbBulkDays">' + ic('plus') + 'إضافة أيام</button><button type="button" class="ob-btn ghost sm" data-a="sbClear">إلغاء التحديد</button></div>' : '') +
            '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" class="chk" data-c="sbAll" aria-label="تحديد الكل"' + (list.length && list.every(function (u) { return SB.sel[u.id]; }) ? ' checked' : '') + '></th><th>الستريمر</th><th>الخطة</th><th>البداية</th><th>الانتهاء</th><th>المتبقي</th><th>تجديد</th><th>قيمة الدعم</th><th></th></tr></thead><tbody>' +
            (list.length ? list.map(function (u) {
                var st = subState(u);
                return '<tr class="click' + (SB.sel[u.id] ? ' sel' : '') + '" data-user="' + u.id + '" data-tab="sub"><td data-stop><input type="checkbox" class="chk" data-c="sbOne" data-id="' + u.id + '"' + (SB.sel[u.id] ? ' checked' : '') + ' aria-label="تحديد"></td><td>' + uCell(u) + '</td><td>' + planName(u.sub.plan) + ' ' + subTag(u) + '</td>' +
                    '<td>' + fdate(u.sub.start) + '</td><td>' + (u.sub.lifetime ? '∞' : st === 'frozen' ? '<span class="mut2">مجمّد</span>' : fdate(u.sub.end)) + '</td>' +
                    '<td><div style="display:flex;align-items:center;gap:8px">' + leftBar(u) + '<span class="num">' + daysLeftTxt(u) + '</span></div></td><td class="num">' + u.sub.renewals + '</td><td class="num">' + money(paidTotal(u)) + '</td>' +
                    '<td data-stop><div class="acts">' + (st !== 'lifetime' ? '<button type="button" class="ob-btn ghost sm" data-a="quickDays" data-id="' + u.id + '" data-n="7">+7</button><button type="button" class="ob-btn ghost sm" data-a="quickDays" data-id="' + u.id + '" data-n="30">+30</button>' : '') + '</div></td></tr>';
            }).join('') : '<tr><td colspan="9"><div class="empty-s" style="margin:10px">ما فيه اشتراكات هنا</div></td></tr>') + '</tbody></table></div>';
    }
    VIEWS.subs = {
        html: function () {
            var cnt = {}; SB_TABS.forEach(function (t) { cnt[t[0]] = S.users.filter(function (u) { return stFilter(u, t[0]); }).length; });
            return '<section class="card glass"><div class="card-h"><h3>الاشتراكات</h3>' +
                '<button type="button" class="ob-btn primary sm" data-a="grantOpen">' + ic('crown') + 'منح اشتراك</button>' +
                '<button type="button" class="ob-btn sm" data-a="compOpen">' + ic('gift') + 'تعويض للكل</button></div>' +
                '<div class="toolbar"><div class="ob-seg">' + SB_TABS.map(function (t) { return '<button type="button" data-a="sbTab" data-v="' + t[0] + '" class="' + (SB.tab === t[0] ? 'on' : '') + '">' + t[1] + ' <span class="ct num">' + cnt[t[0]] + '</span></button>'; }).join('') + '</div>' +
                '<div class="search-in">' + ic('search') + '<input id="sb-q" class="ob-input" type="search" placeholder="ابحث بالآيدي أو تيك توك أو الإيميل" value="' + esc(SB.q) + '"></div></div>' +
                '<div id="sb-table">' + sbTable() + '</div></section>' +
                '<section class="card glass"><div class="card-h"><h3>الخطط <span class="sub">الأسعار والحدود اللي تنطبق على المشتركين</span></h3><button type="button" class="ob-btn sm" data-a="planNew">' + ic('plus') + 'خطة جديدة</button></div><div class="plans">' +
                S.plans.map(function (p) {
                    var n = S.users.filter(function (u) { return isPaying(u) && u.sub.plan === p.id; }).length;
                    return '<div class="plan' + (p.on ? '' : ' off') + '"><h4>' + esc(p.name) + '<span class="sp"></span>' + (p.internal ? '<span class="tag gold">داخلي</span>' : p.on ? '<span class="tag ok">مفعّلة</span>' : '<span class="tag mute">موقفة</span>') + '</h4>' +
                        '<div class="pr num">' + (p.price ? fmtN(p.price) + ' <small>' + CUR + ' / ' + p.days + ' يوم</small>' : '<small>' + (p.days ? p.days + ' يوم' : 'بدون انتهاء') + '</small>') + '</div>' +
                        (p.gamesDiscount ? '<div><span class="tag gold">مشتركي الألعاب: −' + p.gamesDiscount + '٪ = ' + fmtN(Math.round(p.price * (100 - p.gamesDiscount)) / 100, 2) + ' ' + CUR + '</span></div>' : '') +
                        '<ul>' + p.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
                        '<div class="ft"><span>' + n + ' مشترك نشط</span><button type="button" class="ob-btn ghost sm" data-a="planEdit" data-id="' + p.id + '">' + ic('edit') + 'تعديل</button></div></div>';
                }).join('') + '</div></section>';
        },
        mount: function () { var q = $('#sb-q'); q.addEventListener('input', function () { SB.q = q.value; part('sb-table', sbTable()); }); }
    };

    /* اختيار ستريمر بنافذة (بحث بكل الطرق) */
    function userPicker(id) {
        return '<div class="field"><label for="' + id + '">الستريمر</label><input id="' + id + '" class="ob-input" placeholder="آيدي، @تيك توك، إيميل، أو اسم" autocomplete="off"><input type="hidden" id="' + id + '-v"><div class="list" id="' + id + '-r" style="max-height:200px;overflow-y:auto"></div></div>';
    }
    function bindPicker(root, id, onPick) {
        var inp = root.querySelector('#' + id), res = root.querySelector('#' + id + '-r'), hv = root.querySelector('#' + id + '-v');
        function draw() {
            var q = inp.value.trim(); if (!q) { res.innerHTML = ''; return; }
            var m = S.users.filter(function (u) { return matchUser(u, q); }).slice(0, 6);
            res.innerHTML = m.length ? m.map(function (u) { return '<button type="button" class="li click" data-pick="' + u.id + '" style="text-align:right;width:100%">' + avatar(u) + '<span class="m"><b>' + esc(u.name) + ' <span class="mut2 num">#' + esc(u.customId || u.id) + '</span></b><small class="ltr">@' + esc(u.tiktok) + (u.email ? ' · ' + esc(u.email) : '') + '</small></span>' + subTag(u) + '</button>'; }).join('') : '<div class="empty-s">ما لقيت أحد</div>';
        }
        inp.addEventListener('input', function () { hv.value = ''; draw(); if (onPick) onPick(null); });
        res.addEventListener('click', function (e) {
            var b = e.target.closest('[data-pick]'); if (!b) return;
            var u = user(b.getAttribute('data-pick')); hv.value = u.id; inp.value = u.name + ' — @' + u.tiktok + ' (#' + u.id + ')';
            res.innerHTML = '<div class="li">' + avatar(u) + '<span class="m"><b>' + esc(u.name) + '</b><small>' + (u.sub ? planName(u.sub.plan) + ' · ' + daysLeftTxt(u) : 'بدون اشتراك') + '</small></span>' + subTag(u) + '</div>';
            if (onPick) onPick(u);
        });
    }

    /* =========================================================
       ٤) الأكواد
       ========================================================= */
    var CD = { f: 'all', q: '' };
    function codeTable() {
        var list = S.codes.filter(function (c) {
            if (CD.f !== 'all' && codeState(c) !== CD.f) return false;
            if (!CD.q) return true;
            var q = CD.q.trim().toUpperCase(), qn = normAr(CD.q);
            return c.code.indexOf(q) >= 0 || normAr(c.campaign).indexOf(qn) >= 0 || c.uses.some(function (x) { var u = user(x.uid); return u && matchUser(u, CD.q); });
        });
        return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الكود</th><th>النوع</th><th>القيمة</th><th>الاستخدام</th><th>ينتهي</th><th>الحملة</th><th>آخر من استخدمه</th><th>الحالة</th><th></th></tr></thead><tbody>' +
            (list.length ? list.slice(0, 120).map(function (c) {
                var st = codeState(c), last = c.uses.length ? user(c.uses[c.uses.length - 1].uid) : null, fu = c.forUser ? user(c.forUser) : null;
                return '<tr><td><span class="code-out">' + esc(c.code) + '</span>' + (fu ? '<div class="mut2" style="font-size:11.5px">مخصّص لـ @' + esc(fu.tiktok) + '</div>' : '') + '</td><td>' + codeTypeName(c.type) + '</td><td class="num">' + codeValue(c) + '</td>' +
                    '<td class="num">' + c.uses.length + ' / ' + c.maxUses + '</td><td>' + (c.expires ? fdate(c.expires) : '<span class="mut2">بدون</span>') + '</td><td>' + esc(c.campaign || '—') + '</td>' +
                    '<td>' + (last ? '<a href="#" data-user="' + last.id + '">@' + esc(last.tiktok) + '</a> <small class="mut2">' + rel(c.uses[c.uses.length - 1].at) + '</small>' : '<span class="mut2">—</span>') + '</td>' +
                    '<td><span class="tag ' + CODE_ST[st][1] + '">' + CODE_ST[st][0] + '</span></td>' +
                    '<td><div class="acts"><button type="button" class="ob-btn ghost icon sm" data-a="copy" data-v="' + c.code + '" title="نسخ" aria-label="نسخ">' + ic('copy') + '</button>' +
                    (c.uses.length ? '<button type="button" class="ob-btn ghost icon sm" data-a="codeUses" data-v="' + c.code + '" title="مين استخدمه" aria-label="مين استخدمه">' + ic('users') + '</button>' : '') +
                    '<button type="button" class="ob-btn ghost sm" data-a="codeToggle" data-v="' + c.code + '">' + (c.disabled ? 'تفعيل' : 'تعطيل') + '</button>' +
                    (c.uses.length ? '' : '<button type="button" class="ob-btn danger icon sm" data-a="codeDel" data-v="' + c.code + '" title="حذف" aria-label="حذف">' + ic('trash') + '</button>') + '</div></td></tr>';
            }).join('') : '<tr><td colspan="9"><div class="empty-s" style="margin:10px">ما فيه أكواد هنا</div></td></tr>') + '</tbody></table></div>' +
            (list.length > 120 ? '<p class="mut2" style="margin:10px 0 0">يعرض أول 120 من ' + list.length + '. استخدم البحث.</p>' : '');
    }
    VIEWS.codes = {
        html: function () {
            var cnt = { all: S.codes.length }; Object.keys(CODE_ST).forEach(function (k) { cnt[k] = S.codes.filter(function (c) { return codeState(c) === k; }).length; });
            var redeemed = S.codes.reduce(function (a, c) { return a + c.uses.length; }, 0);
            return '<div class="kpis k4">' + kpi('ticket', fmtN(cnt.active), 'كود فعّال') + kpi('repeat', fmtN(redeemed), 'مرة انستخدمت الأكواد') + kpi('clock', fmtN(cnt.expired), 'كود منتهي') + kpi('ban', fmtN(cnt.disabled), 'كود معطّل') + '</div>' +
                '<div class="g-main">' +
                '<section class="card glass"><div class="card-h"><h3>إنشاء أكواد</h3></div><div class="rows">' +
                '<div class="ob-row col"><div class="lb"><b>نوع الكود</b></div><div class="ob-pills" id="cg-type">' + Object.keys(CODE_TYPES).map(function (k, i) { return '<button type="button" class="ob-pill' + (i === 0 ? ' on' : '') + '" data-v="' + k + '">' + CODE_TYPES[k] + '</button>'; }).join('') + '</div>' +
                '<small class="mut2" id="cg-help">يعطي الستريمر أيام اشتراك. لو عنده اشتراك تنضاف عليه.</small></div>' +
                '<div class="ob-row" id="cg-days-row"><div class="lb"><b>عدد الأيام</b></div><div class="ct"><div class="ob-pills" id="cg-days-q">' + [3, 7, 14, 30].map(function (n) { return '<button type="button" class="ob-pill' + (n === 7 ? ' on' : '') + '" data-v="' + n + '">' + n + '</button>'; }).join('') + '</div><input id="cg-days" type="number" min="1" value="7" class="ob-input ltr num" style="width:80px"></div></div>' +
                '<div class="ob-row" id="cg-plan-row" hidden><div class="lb"><b>الخطة</b></div><div class="ct"><select id="cg-plan" class="ob-input">' + S.plans.filter(function (p) { return !p.internal; }).map(function (p) { return '<option value="' + p.id + '">' + p.name + ' (' + p.days + ' يوم)</option>'; }).join('') + '</select></div></div>' +
                '<div class="ob-row"><div class="lb"><b>عدد الأكواد</b><small>لين 1000 كود مرة وحدة</small></div><div class="ct"><input id="cg-count" type="number" min="1" max="1000" value="10" class="ob-input ltr num" style="width:100px"></div></div>' +
                '<div class="ob-row"><div class="lb"><b>الاستخدامات لكل كود</b><small>1 = لشخص واحد. أكثر = كود حملة مشترك</small></div><div class="ct"><input id="cg-uses" type="number" min="1" value="1" class="ob-input ltr num" style="width:100px"></div></div>' +
                '<div class="ob-row"><div class="lb"><b>ينتهي الكود</b><small>فاضي = ما ينتهي</small></div><div class="ct"><input id="cg-exp" type="date" class="ob-input ltr" style="width:170px"></div></div>' +
                '<div class="ob-row"><div class="lb"><b>البادئة</b><small>تطلع أول الكود: VEYRO-XXXX-XXXX</small></div><div class="ct"><input id="cg-prefix" class="ob-input ltr" value="VEYRO" maxlength="10" style="width:140px"></div></div>' +
                '<div class="ob-row"><div class="lb"><b>اسم الحملة</b><small>عشان تعرف الكود من وين</small></div><div class="ct"><input id="cg-camp" class="ob-input" placeholder="مثال: مسابقة الجمعة" style="width:200px"></div></div>' +
                '<div class="ob-row col"><div class="lb"><b>مخصّص لستريمر معيّن</b><small>اختياري: ما يقدر يستخدمه غيره</small></div>' + userPicker('cg-user') + '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ob-btn primary lg" data-a="genCodes">' + ic('ticket') + 'إنشاء الأكواد</button></div>' +
                '</div></section>' +
                '<section class="card glass"><div class="card-h"><h3>جرّب كود</h3></div><p class="mut" style="margin:0 0 12px;line-height:1.8">طبّق كود على ستريمر من هنا، زي ما لو كتبه بنفسه بفيرو.</p><div class="rows">' +
                '<div class="field"><label for="rd-code">الكود</label><input id="rd-code" class="ob-input ltr code-out" placeholder="VEYRO-XXXX-XXXX"></div>' + userPicker('rd-user') +
                '<button type="button" class="ob-btn primary" data-a="redeem">تطبيق الكود</button><div id="rd-msg"></div></div></section>' +
                '</div>' +
                '<section class="card glass"><div class="card-h"><h3>كل الأكواد</h3><button type="button" class="ob-btn ghost sm" data-a="codesCsv">' + ic('csv') + 'نسخ الفعّالة</button></div>' +
                '<div class="toolbar"><div class="ob-seg">' + [['all', 'الكل']].concat(Object.keys(CODE_ST).map(function (k) { return [k, CODE_ST[k][0]]; })).map(function (t) { return '<button type="button" data-a="cdF" data-v="' + t[0] + '" class="' + (CD.f === t[0] ? 'on' : '') + '">' + t[1] + ' <span class="ct num">' + cnt[t[0]] + '</span></button>'; }).join('') + '</div>' +
                '<div class="search-in">' + ic('search') + '<input id="cd-q" class="ob-input" type="search" placeholder="ابحث بالكود أو الحملة أو مين استخدمه" value="' + esc(CD.q) + '"></div></div>' +
                '<div id="cd-table">' + codeTable() + '</div></section>';
        },
        mount: function () {
            var type = 'days';
            var help = { days: 'يعطي الستريمر أيام اشتراك. لو عنده اشتراك تنضاف عليه.', plan: 'يفعّل خطة كاملة (مثل لو دفع). لو عنده اشتراك تتمدّد.', lifetime: 'اشتراك مفتوح بدون انتهاء. خلّه لشخص واحد.', extra: 'أيام زيادة للي عندهم اشتراك نشط بس (تعويض، هدية للمشتركين).' };
            $('#cg-type').addEventListener('click', function (e) {
                var b = e.target.closest('.ob-pill'); if (!b) return; type = b.getAttribute('data-v');
                $$('#cg-type .ob-pill').forEach(function (x) { x.classList.toggle('on', x === b); });
                $('#cg-help').textContent = help[type];
                $('#cg-days-row').hidden = !(type === 'days' || type === 'extra'); $('#cg-plan-row').hidden = type !== 'plan';
                if (type === 'lifetime') { $('#cg-count').value = 1; $('#cg-uses').value = 1; $('#cg-prefix').value = 'VIP'; }
                if (type === 'extra') { $('#cg-prefix').value = 'BONUS'; }
            });
            $('#cg-days-q').addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (!b) return; $('#cg-days').value = b.getAttribute('data-v'); $$('#cg-days-q .ob-pill').forEach(function (x) { x.classList.toggle('on', x === b); }); });
            $('#cg-days').addEventListener('input', function () { var v = $('#cg-days').value; $$('#cg-days-q .ob-pill').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === v); }); });
            bindPicker(document, 'cg-user'); bindPicker(document, 'rd-user');
            VIEWS.codes.type = function () { return type; };
            var q = $('#cd-q'); q.addEventListener('input', function () { CD.q = q.value; part('cd-table', codeTable()); });
        }
    };

    /* =========================================================
       ٥) مكتبة فيرو + التفريغ
       ========================================================= */
    var TYPES = { alert: ['أليرت فيديو', 'play'], top: ['توب', 'crown'], icon: ['أيقونة', 'star'], frame: ['إطار', 'drop'], sound: ['صوت', 'sound'] };
    function typeName(t) { return TYPES[t] ? TYPES[t][0] : t; }
    var A_ST = { published: ['منشور للجميع', 'ok'], draft: ['مسودة', 'warn'], hidden: ['مخفي', 'mute'] };
    var ACCESS = { all: 'الكل', subs: 'المشتركين', yearly: 'السنوي بس' };
    var LB = { type: 'all', st: 'all', q: '' };

    /* --- رسم الأليرتات التجريبية (شاشة خضراء/مؤثرات على أسود/شاشة زرقاء) --- */
    function procDraw(ctx, kind, t, w, h) {
        var p = (t % 3) / 3, s = w / 640;
        ctx.save();
        if (kind === 'green-gift') {
            var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#13cf4c'); g.addColorStop(1, '#0fb944'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.translate(w / 2, h * .48);
            var sc = p < .15 ? (p / .15) * 1.12 : p < .25 ? 1.12 - (p - .15) / .1 * .12 : p > .88 ? 1 - (p - .88) / .12 : 1;
            ctx.scale(sc * s, sc * s);
            ctx.save(); ctx.rotate(t * .6);
            for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = 'rgba(255,240,170,.55)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -170); ctx.lineTo(18, -170); ctx.closePath(); ctx.fill(); }
            ctx.restore();
            var bob = Math.sin(t * 5) * 6;
            ctx.fillStyle = '#e8394d'; ctx.fillRect(-62, -40 + bob, 124, 100); ctx.fillStyle = '#ff5468'; ctx.fillRect(-72, -66 + bob, 144, 32);
            ctx.fillStyle = '#ffd54a'; ctx.fillRect(-12, -66 + bob, 24, 126);
            ctx.beginPath(); ctx.ellipse(-24, -78 + bob, 26, 14, -.5, 0, Math.PI * 2); ctx.ellipse(24, -78 + bob, 26, 14, .5, 0, Math.PI * 2); ctx.fill();
            ctx.font = '800 38px "Noto Kufi Arabic", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = '#2b1440'; ctx.fillStyle = '#fff';
            ctx.strokeText('شكراً للدعم!', 0, 112); ctx.fillText('شكراً للدعم!', 0, 112);
            for (var c = 0; c < 26; c++) { var a = c * 2.39996, r = 60 + ((c * 37 + t * 140) % 220); ctx.fillStyle = ['#ffd54a', '#ff6b81', '#9fc7ff', '#fff'][c % 4]; ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r * .7 - 20); ctx.rotate(t * 3 + c); ctx.fillRect(-5, -3, 10, 6); ctx.restore(); }
        } else if (kind === 'fx-sparks') {
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            var cx = w / 2, cy = h / 2;
            var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180 * s); rg.addColorStop(0, 'rgba(255,200,80,' + (.55 * (1 - p)) + ')'); rg.addColorStop(1, 'rgba(255,120,0,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
            for (var k = 0; k < 90; k++) {
                var ang = k * 2.39996, sp = (60 + (k * 53 % 180)) * s, d = p * sp * 1.6, x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d + p * p * 60 * s, al = 1 - p;
                var sg = ctx.createRadialGradient(x, y, 0, x, y, 9 * s); sg.addColorStop(0, 'rgba(255,245,200,' + al + ')'); sg.addColorStop(.4, 'rgba(255,190,60,' + al * .8 + ')'); sg.addColorStop(1, 'rgba(255,120,0,0)');
                ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, 9 * s, 0, Math.PI * 2); ctx.fill();
            }
        } else if (kind === 'blue-heart') {
            ctx.fillStyle = '#1647e0'; ctx.fillRect(0, 0, w, h);
            ctx.translate(w / 2, h * .45); var b = 1 + Math.sin(t * 6) * .08; ctx.scale(b * s, b * s);
            ctx.fillStyle = '#ff4d79'; ctx.beginPath(); ctx.moveTo(0, 70); ctx.bezierCurveTo(-120, -10, -70, -110, 0, -50); ctx.bezierCurveTo(70, -110, 120, -10, 0, 70); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-40, -45, 18, 10, -.6, 0, Math.PI * 2); ctx.fill();
            ctx.font = '800 32px "Noto Kufi Arabic", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = '#3a0a1f'; ctx.fillStyle = '#fff';
            ctx.strokeText('متابعة جديدة', 0, 130); ctx.fillText('متابعة جديدة', 0, 130);
        }
        ctx.restore();
    }
    var IMG_CACHE = {};
    function getImg(src, cb) {
        var c = IMG_CACHE[src]; if (c) { if (c.complete && c.naturalWidth) return c; c._cbs.push(cb); return null; }
        var im = new Image(); im._cbs = [cb]; im.onload = function () { im._cbs.forEach(function (f) { if (f) f(); }); im._cbs = []; }; if (/^https?:/.test(src)) im.crossOrigin = 'anonymous'; im.src = src; IMG_CACHE[src] = im; return null;
    }
    function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join(''); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    function rgbHex(r, g, b) { return '#' + [r, g, b].map(function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); }).join(''); }
    function sstep(a, b, x) { var t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1); return t * t * (3 - 2 * t); }
    /* التفريغ: نفس فكرة WebGL بشاشة البث، بس بالـCPU للمعاينة */
    function applyKey(id, k) {
        if (!k || !k.on) { if (k && k.opacity < 1) { var dd = id.data; for (var j = 3; j < dd.length; j += 4) dd[j] *= k.opacity; } return; }
        var d = id.data, kc = hexRgb(k.color || '#00ff00'), op = k.opacity == null ? 1 : k.opacity;
        var kcb = -0.168736 * kc[0] - 0.331264 * kc[1] + 0.5 * kc[2], kcr = 0.5 * kc[0] - 0.418688 * kc[1] - 0.081312 * kc[2];
        var sim = k.sim, sm = Math.max(0.001, k.smooth), sp = k.spill || 0;
        var dom = kc[1] >= kc[0] && kc[1] >= kc[2] ? 1 : kc[2] >= kc[0] ? 2 : 0;
        for (var i = 0; i < d.length; i += 4) {
            var r = d[i], g = d[i + 1], b = d[i + 2], a = 1;
            if (k.mode === 'color') {
                var cb = -0.168736 * r - 0.331264 * g + 0.5 * b, cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
                var dist = Math.sqrt((cb - kcb) * (cb - kcb) + (cr - kcr) * (cr - kcr)) / 255;
                a = sstep(sim * 0.5, sim * 0.5 + sm, dist);
                if (sp > 0 && a > 0) {
                    var ch = [r, g, b], o1 = ch[(dom + 1) % 3], o2 = ch[(dom + 2) % 3], lim = Math.max(o1, o2);
                    if (ch[dom] > lim) { ch[dom] = ch[dom] - (ch[dom] - lim) * clamp(sp * (1 - a * .5) * 1.4, 0, 1); d[i] = ch[0]; d[i + 1] = ch[1]; d[i + 2] = ch[2]; }
                }
            } else if (k.mode === 'black' || k.mode === 'white') {
                var l = (0.299 * r + 0.587 * g + 0.114 * b) / 255; if (k.mode === 'white') l = 1 - l;
                a = sstep(sim * 0.5, sim * 0.5 + sm, l);
            } else if (k.mode === 'screen') {
                var mx = Math.max(r, g, b) / 255; a = mx;
                if (mx > 0.002) { d[i] = r / mx; d[i + 1] = g / mx; d[i + 2] = b / mx; }
            }
            d[i + 3] = d[i + 3] * a * op;
        }
    }
    /* يرسم مصدر الأصل (فريم) بكانفس: يرجع false لو الصورة لسا تحمّل */
    function drawSource(ctx, a, t, w, h, onReady, videoEl) {
        ctx.clearRect(0, 0, w, h);
        if (a.src && a.src.proc) { procDraw(ctx, a.src.proc, t, w, h); return true; }
        if (videoEl && videoEl.readyState >= 2) { ctx.drawImage(videoEl, 0, 0, w, h); return true; }
        var src = a.src && (a.src.img || a.src.thumb);
        if (src) { var im = getImg(src, onReady); if (!im) return false; var iw = im.naturalWidth || w, ih = im.naturalHeight || h, sc = Math.min(w / iw, h / ih); ctx.drawImage(im, (w - iw * sc) / 2, (h - ih * sc) / 2, iw * sc, ih * sc); return true; }
        ctx.fillStyle = '#1d1a24'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#a99bb8'; ctx.font = '600 ' + Math.round(w / 22) + 'px "IBM Plex Sans Arabic", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(a.src && a.src.lost ? 'ارفع الفيديو مرة ثانية (المعاينة ما تحفظه)' : 'بدون ملف', w / 2, h / 2);
        return true;
    }
    function assetSize(a) { if (a.type === 'alert') return [640, 360]; var src = a.src && (a.src.img || a.src.thumb); var im = src && IMG_CACHE[src]; if (im && im.naturalWidth) { var sc = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)); return [Math.round(im.naturalWidth * sc), Math.round(im.naturalHeight * sc)]; } return [256, 256]; }
    function renderKeyed(cv, a, t, videoEl) {
        var sz = a.type === 'alert' ? [cv.width, cv.height] : [cv.width, cv.height], ctx = cv.getContext('2d', { willReadFrequently: true });
        var ok = drawSource(ctx, a, t, sz[0], sz[1], function () { renderKeyed(cv, a, t, videoEl); }, videoEl);
        if (!ok) return;
        if ((a.key && a.key.on) || (a.key && a.key.opacity < 1)) { try { var id = ctx.getImageData(0, 0, sz[0], sz[1]); applyKey(id, a.key); ctx.putImageData(id, 0, 0); } catch (e) { /* ignore */ } }
    }
    function topHTML(c, sample) {
        var R = { bevel: '12px 3px 12px 3px', round: '12px', pill: '999px', sharp: '0' }[c.shape] || '12px';
        var F = { kufi: '"Noto Kufi Arabic", sans-serif', plex: '"IBM Plex Sans Arabic", sans-serif', mono: 'ui-monospace, Menlo, monospace' }[c.font];
        var rgb = hexRgb(c.bg), names = ['أبو فهد', 'نورة', 'سلطان', 'ريم', 'راكان', 'دانة', 'ماجد', 'جود', 'تركي', 'لين'], sc = [5200, 3880, 2410, 1350, 990, 640, 420, 300, 210, 120];
        var rows = '';
        for (var i = 0; i < c.rows; i++) rows += '<div class="tr' + (i === 0 ? ' first' : '') + '" style="border-radius:' + R + '"><span class="rk" style="border-radius:' + (c.shape === 'pill' ? '50%' : c.shape === 'sharp' ? '0' : '6px 2px 6px 2px') + '">' + (i === 0 && c.crown ? '♛' : i + 1) + '</span><span class="pa"></span><span class="nm">' + names[i] + '</span><span class="sc">' + fmtN(sc[i]) + '</span></div>';
        return '<div class="top-prev" style="--ta:' + c.accent + ';--tb:rgba(' + rgb.join(',') + ',' + c.bgA + ');--tbd:' + c.border + '66;--tg:' + c.gap + 'px;--tf:' + F + '">' + (c.title ? '<div class="tt">' + esc(c.title) + '</div>' : '') + rows + '</div>';
    }
    function thumbHTML(a) {
        if (a.type === 'top') return '<div style="transform:scale(.5);transform-origin:center;width:330px;display:flex;justify-content:center">' + topHTML(a.top) + '</div>';
        if (a.type === 'sound') return '<svg viewBox="0 0 120 50" width="70%" aria-hidden="true">' + Array.apply(null, Array(24)).map(function (_, i) { var hh = 6 + Math.abs(Math.sin(i * 1.7 + a.name.length)) * 34; return '<rect x="' + (i * 5) + '" y="' + (25 - hh / 2) + '" width="3" height="' + hh + '" rx="1.5" fill="#a99bb8"/>'; }).join('') + '</svg>';
        if (a.type === 'alert' && a.src && a.src.video && !a.src.proc && !a.src.thumb && /^https?:/.test(a.src.video)) return '<video src="' + esc(a.src.video) + '#t=0.6" muted playsinline preload="metadata"></video>';
        var sz = a.type === 'alert' ? [320, 180] : [150, 150];
        return '<canvas width="' + sz[0] + '" height="' + sz[1] + '" data-thumb="' + a.id + '"></canvas>';
    }
    var thumbAnim = null;
    function stopThumbs() { if (thumbAnim) cancelAnimationFrame(thumbAnim.raf); thumbAnim = null; }
    function drawThumbs() { $$('canvas[data-thumb]').forEach(function (cv) { var a = S.assets.filter(function (x) { return x.id === cv.getAttribute('data-thumb'); })[0]; if (a) renderKeyed(cv, a, 1.2); }); }

    function lbList() {
        return S.assets.filter(function (a) {
            if (LB.type !== 'all' && a.type !== LB.type) return false;
            if (LB.st !== 'all' && a.status !== LB.st) return false;
            if (LB.q && normAr(a.name + ' ' + a.cat).indexOf(normAr(LB.q)) < 0) return false;
            return true;
        });
    }
    function lbGrid() {
        var list = lbList();
        return '<div class="a-grid"><button type="button" class="a-card add" data-a="assetNew">' + ic('upload') + 'رفع أصل جديد<small class="mut2" style="font-weight:500">فيديو، صورة، صوت، أو توب جاهز</small></button>' +
            list.map(function (a) {
                return '<div class="a-card' + (a.status === 'hidden' ? ' hid' : '') + '" data-a="assetEdit" data-id="' + a.id + '" tabindex="0" role="button" aria-label="تعديل ' + esc(a.name) + '"><div class="th">' + thumbHTML(a) + '<span class="ty tag lav">' + typeName(a.type) + '</span><span class="st tag ' + A_ST[a.status][1] + '">' + A_ST[a.status][0] + '</span></div>' +
                    '<div class="bd"><b>' + esc(a.name) + '</b><small><span>' + (a.status === 'published' ? 'يستخدمه ' + fmtN(a.usage) : 'ما نُشر') + '</span><span>' + ACCESS[a.access] + '</span><span>v' + a.version + '</span></small></div></div>';
            }).join('') + '</div>';
    }
    VIEWS.library = {
        html: function () {
            var cnt = { all: S.assets.length }; Object.keys(TYPES).forEach(function (k) { cnt[k] = S.assets.filter(function (a) { return a.type === k; }).length; });
            var pub = S.assets.filter(function (a) { return a.status === 'published'; }).length;
            return '<section class="card glass"><div class="card-h"><h3>مكتبة فيرو العامة <span class="sub">' + pub + ' أصل منشور يظهر بمكتبة كل مستخدم</span></h3><button type="button" class="ob-btn primary" data-a="assetNew">' + ic('upload') + 'رفع أصل</button></div>' +
                '<div class="toolbar"><div class="ob-seg">' + [['all', 'الكل']].concat(Object.keys(TYPES).map(function (k) { return [k, TYPES[k][0]]; })).map(function (t) { return '<button type="button" data-a="lbType" data-v="' + t[0] + '" class="' + (LB.type === t[0] ? 'on' : '') + '">' + t[1] + ' <span class="ct num">' + cnt[t[0]] + '</span></button>'; }).join('') + '</div>' +
                '<div class="ob-pills">' + [['all', 'كل الحالات']].concat(Object.keys(A_ST).map(function (k) { return [k, A_ST[k][0]]; })).map(function (t) { return '<button type="button" class="ob-pill' + (LB.st === t[0] ? ' on' : '') + '" data-a="lbSt" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
                '<div class="search-in">' + ic('search') + '<input id="lb-q" class="ob-input" type="search" placeholder="ابحث باسم الأصل أو التصنيف" value="' + esc(LB.q) + '"></div></div>' +
                '<div id="lb-grid">' + lbGrid() + '</div></section>';
        },
        mount: function () {
            drawThumbs();
            var q = $('#lb-q'); q.addEventListener('input', function () { LB.q = q.value; part('lb-grid', lbGrid()); drawThumbs(); });
            // الأليرت يتحرك لما تمرّ عليه
            $('#lb-grid').addEventListener('pointerover', function (e) {
                var cv = e.target.closest('.a-card') && e.target.closest('.a-card').querySelector('canvas[data-thumb]'); if (!cv || (thumbAnim && thumbAnim.cv === cv)) return;
                var a = S.assets.filter(function (x) { return x.id === cv.getAttribute('data-thumb'); })[0]; if (!a || a.type !== 'alert') return;
                stopThumbs(); var t0 = performance.now(); thumbAnim = { cv: cv };
                (function loop() { renderKeyed(cv, a, 1.2 + (performance.now() - t0) / 1000); thumbAnim.raf = requestAnimationFrame(loop); })();
                cv.closest('.a-card').addEventListener('pointerleave', function lv() { cv.closest('.a-card').removeEventListener('pointerleave', lv); stopThumbs(); renderKeyed(cv, a, 1.2); });
            });
        }
    };

    /* --- الأصوات التجريبية بـWebAudio --- */
    var AC = null;
    function playSound(a, vol) {
        vol = vol == null ? a.vol : vol;
        if (a.src && a.src.audio) { var au = new Audio(a.src.audio); au.volume = clamp(vol, 0, 1); au.play().catch(function () { toast('ما قدرت أشغّل الصوت', true); }); return; }
        if (a.src && a.src.lost) { toast('ارفع الصوت مرة ثانية (المعاينة ما تحفظه)', true); return; }
        try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        var t = AC.currentTime;
        function tone(f, st, du, type) { var o = AC.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t + st); var gg = AC.createGain(); gg.gain.setValueAtTime(0, t + st); gg.gain.linearRampToValueAtTime(.35 * vol, t + st + .01); gg.gain.exponentialRampToValueAtTime(.001, t + st + du); o.connect(gg); gg.connect(AC.destination); o.start(t + st); o.stop(t + st + du + .05); return o; }
        var k = a.src && a.src.synth;
        if (k === 'ding') { tone(1318, 0, .9); tone(1975, 0, .6); }
        else if (k === 'coins') { [0, .07, .14, .21, .3].forEach(function (s, i) { tone(1800 + i * 220, s, .18, 'triangle'); }); }
        else { var o = tone(200, 0, .5, 'sawtooth'); o.frequency.exponentialRampToValueAtTime(1400, t + .45); }
    }

    /* --- رفع أصل جديد --- */
    function assetNew() {
        var m = openModal({
            title: 'رفع أصل جديد',
            body: '<div class="field"><label>النوع</label><div class="ob-pills" id="an-type">' + Object.keys(TYPES).map(function (k, i) { return '<button type="button" class="ob-pill' + (i === 0 ? ' on' : '') + '" data-v="' + k + '">' + TYPES[k][0] + '</button>'; }).join('') + '</div></div>' +
                '<div class="field"><label for="an-name">الاسم</label><input id="an-name" class="ob-input" placeholder="مثال: أليرت الأسد"></div>' +
                '<div class="drop" id="an-drop" tabindex="0"><b id="an-dt">اسحب الفيديو هنا أو اضغط للاختيار</b><span id="an-dh">MP4 أو WebM. الخلفية الخضراء أو السوداء تتفرّغ بعدين</span></div><input type="file" id="an-file" hidden>' +
                '<p class="mut2" style="font-size:12.5px" id="an-note"></p>',
            foot: '<button type="button" class="ob-btn primary" id="an-go">متابعة للتعديل</button><button type="button" class="ob-btn ghost" data-x2>رجوع</button>',
            onMount: function (el, mm) {
                var type = 'alert', file = null;
                var H = { alert: ['اسحب الفيديو هنا أو اضغط للاختيار', 'MP4 أو WebM. الخلفية الخضراء أو السوداء تتفرّغ بعدين', 'video/*'], icon: ['اسحب الصورة هنا', 'PNG أو JPG أو SVG. تقدر تفرّغ الخلفية بعدين', 'image/*'], frame: ['اسحب صورة الإطار', 'PNG شفاف أفضل', 'image/*'], sound: ['اسحب ملف الصوت', 'MP3 أو WAV أو OGG', 'audio/*'], top: ['التوب ما يحتاج ملف', 'يتصمم من الإعدادات بالخطوة الجاية', ''] };
                function setT(t) { type = t; file = null; $$('#an-type .ob-pill', el).forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === t); }); var h = H[t]; el.querySelector('#an-dt').textContent = h[0]; el.querySelector('#an-dh').textContent = h[1]; el.querySelector('#an-file').accept = h[2]; el.querySelector('#an-drop').hidden = t === 'top'; el.querySelector('#an-note').textContent = ''; }
                el.querySelector('#an-type').addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (b) setT(b.getAttribute('data-v')); });
                var drop = el.querySelector('#an-drop'), fi = el.querySelector('#an-file');
                function take(f) { if (!f) return; file = f; el.querySelector('#an-dt').textContent = f.name; el.querySelector('#an-dh').textContent = (f.size / 1048576).toFixed(1) + 'MB'; if (!el.querySelector('#an-name').value) el.querySelector('#an-name').value = f.name.replace(/\.[^.]+$/, ''); }
                drop.addEventListener('click', function () { fi.click(); });
                drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
                fi.addEventListener('change', function () { take(fi.files[0]); });
                drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
                drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
                drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
                el.querySelector('[data-x2]').addEventListener('click', mm.close);
                el.querySelector('#an-go').addEventListener('click', function () {
                    var name = el.querySelector('#an-name').value.trim() || typeName(type) + ' جديد';
                    var a = { id: uid(), type: type, name: name, status: 'draft', access: 'all', cat: '', usage: 0, version: 0, updated: now(), key: { on: false, mode: 'color', color: '#00ff00', sim: 0.4, smooth: 0.08, spill: 0.1, opacity: 1 }, vol: 0.8, dur: 6, src: {} };
                    if (type === 'top') a.top = { title: 'توب الداعمين', rows: 5, shape: 'bevel', accent: '#cfc3dc', bg: '#14121a', bgA: 0.78, border: '#a99bb8', gap: 6, font: 'kufi', crown: true };
                    else if (!file) { el.querySelector('#an-note').textContent = 'اختر ملف أول.'; return; }
                    if (file && type === 'alert') {
                        if (!/^video\//.test(file.type)) { el.querySelector('#an-note').textContent = 'هذا مو ملف فيديو.'; return; }
                        a.src.video = URL.createObjectURL(file); a.src.size = file.size; a._file = file; mm.close(); assetEditor(a, true); return;
                    }
                    if (file && type === 'sound') {
                        if (!/^audio\//.test(file.type)) { el.querySelector('#an-note').textContent = 'هذا مو ملف صوت.'; return; }
                        a.src.audio = URL.createObjectURL(file); a.src.size = file.size; a._file = file; mm.close(); assetEditor(a, true); return;
                    }
                    if (file) {
                        if (!/^image\//.test(file.type)) { el.querySelector('#an-note').textContent = 'هذا مو ملف صورة.'; return; }
                        var rd = new FileReader(); rd.onload = function () { a.src.img = rd.result; a.src.size = file.size; a._file = file; mm.close(); assetEditor(a, true); }; rd.readAsDataURL(file); return;
                    }
                    mm.close(); assetEditor(a, true);
                });
            }
        });
    }

    /**
     * حفظ أصل بالسيرفر: (١) ينشئه أو يحدّث بياناته، (٢) يرفع الملف لو فيه ملف جديد، (٣) ينشره لو publish.
     * يرجع Promise بالأصل من السيرفر، أو false.
     */
    function persistAsset(a, isNew, publish) {
        var meta = { type: a.type, name: a.name, cat: a.cat, access: a.access, status: publish ? undefined : a.status, key: a.key, top: a.top, vol: a.vol, dur: a.dur, w: a.w, h: a.h, d: a.d, fscale: a.fscale, look: a.type === 'alert' ? a.look : undefined };
        if (!isNew) meta.id = a.id;
        if (isNew && meta.status === 'published') meta.status = 'draft';
        busy(true);
        function fail(d) { toast(errText(d), true); return false; }
        return rawOp('assetSave', { asset: meta, publish: false }).then(function (d) {
            if (!d.success) return fail(d);
            var id = d.asset.id;
            var up = a._file ? uploadAssetFile(id, a._file) : Promise.resolve({ success: true });
            return up.then(function (u) {
                if (!u.success) return fail(u);
                if (!publish) return d.asset;
                return rawOp('assetSave', { asset: { id: id }, publish: true }).then(function (p) { return p.success ? p.asset : fail(p); });
            });
        }).then(function (r) { return r ? reload().then(function () { return r; }) : false; })
            .catch(function () { return fail({ message: 'ما وصل الطلب للسيرفر — تأكد من الاتصال' }); })
            .then(function (x) { busy(false); return x; });
    }
    function uploadAssetFile(id, file) {
        return new Promise(function (resolve) {
            var x = new XMLHttpRequest();
            x.open('POST', API_BASE + '/api/veyro/admin/assets/upload?id=' + encodeURIComponent(id));
            x.setRequestHeader('Authorization', 'Bearer ' + TOKEN);
            x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            x.upload.onprogress = function (e) { if (e.lengthComputable) toastUpload(Math.round(e.loaded / e.total * 100)); };
            x.onload = function () { toastUpload(null); var d = {}; try { d = JSON.parse(x.responseText); } catch (e) { d = {}; } if (x.status === 413) d = { success: false, error: 'file_too_large' }; resolve(d); };
            x.onerror = function () { toastUpload(null); resolve({ success: false, message: 'ما انرفع الملف — تأكد من الاتصال' }); };
            x.send(file);
        });
    }
    var upToast = null;
    function toastUpload(pct) {
        if (pct == null) { if (upToast) upToast.remove(); upToast = null; return; }
        if (!upToast) { upToast = document.createElement('div'); upToast.className = 'toast'; $('#toasts').appendChild(upToast); }
        upToast.innerHTML = '<i></i>يرفع الملف… ' + pct + '%';
    }

    /* --- محرّر الأصل: المعاينة + التفريغ + الشكل + النشر --- */
    function assetEditor(orig, isNew) {
        var a = JSON.parse(JSON.stringify(orig)); if (orig.src && orig.src.video) a.src.video = orig.src.video; if (orig.src && orig.src.audio) a.src.audio = orig.src.audio;
        a._file = orig._file || null;
        var video = null, raf = 0, playing = true, t0 = performance.now(), tOff = 0, picking = false, bg = 'chk';
        var isVis = a.type === 'alert' || a.type === 'icon' || a.type === 'frame';
        function keyRow(lbl, html, sub) { return '<div class="ob-row"><div class="lb"><b>' + lbl + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="ct">' + html + '</div></div>'; }
        function rng(id, v, min, max, st) { return '<input type="range" class="ob-range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + st + '" value="' + v + '" style="width:130px"><span class="rv num" id="' + id + '-v">' + v + '</span>'; }
        var keyUI = isVis ? '<div class="sec"><h4>' + ic('wand', ' style="width:16px;height:16px"') + 'التفريغ (الشفافية)<span class="sp"></span><label class="ob-toggle"><input type="checkbox" id="k-on"' + (a.key.on ? ' checked' : '') + '><span></span></label></h4><div class="rows" id="k-body">' +
            '<div class="ob-row col"><div class="lb"><b>نوع الخلفية</b></div><div class="ob-pills" id="k-mode">' + [['color', 'لون (كروما)'], ['black', 'سوداء'], ['white', 'بيضاء'], ['screen', 'مؤثرات مضيئة']].map(function (m) { return '<button type="button" class="ob-pill' + (a.key.mode === m[0] ? ' on' : '') + '" data-v="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div></div>' +
            '<div id="k-color-row">' + keyRow('لون الخلفية', '<input type="color" class="ob-color" id="k-color" value="' + a.key.color + '" aria-label="لون الخلفية"><button type="button" class="ob-btn sm" id="k-pick">' + ic('drop') + 'التقط من المعاينة</button><button type="button" class="ob-btn ghost sm" id="k-auto">' + ic('wand') + 'تلقائي</button>') + '</div>' +
            '<div id="k-sim-row">' + keyRow('القوة', rng('k-sim', a.key.sim, 0, 1, 0.01), 'كم يشيل من الألوان القريبة') + '</div>' +
            '<div id="k-sm-row">' + keyRow('نعومة الحواف', rng('k-smooth', a.key.smooth, 0, 0.5, 0.01)) + '</div>' +
            '<div id="k-sp-row">' + keyRow('إزالة الهالة', rng('k-spill', a.key.spill, 0, 1, 0.01), 'يشيل اللون الأخضر عن أطراف الشخصية') + '</div>' +
            keyRow('الشفافية العامة', rng('k-op', a.key.opacity, 0.1, 1, 0.01)) +
            (a.type !== 'alert' ? '<button type="button" class="ob-btn sm" id="k-bake">' + ic('bolt') + 'تثبيت التفريغ بالصورة (PNG شفاف)</button>' : '<small class="mut2" style="line-height:1.7">ينطبق لحظياً بشاشة البث بنفس هالإعدادات، والملف الأصلي يبقى زي ما هو.</small>') +
            '</div></div>' : '';
        var topUI = a.type === 'top' ? '<div class="sec"><h4>شكل التوب</h4><div class="rows">' +
            keyRow('العنوان', '<input id="t-title" class="ob-input" value="' + esc(a.top.title) + '" style="width:170px">') +
            keyRow('عدد الصفوف', rng('t-rows', a.top.rows, 1, 10, 1)) +
            '<div class="ob-row col"><div class="lb"><b>شكل الصف</b></div><div class="ob-pills" id="t-shape">' + [['bevel', 'مشطوف'], ['round', 'مستدير'], ['pill', 'كبسولة'], ['sharp', 'حاد']].map(function (m) { return '<button type="button" class="ob-pill' + (a.top.shape === m[0] ? ' on' : '') + '" data-v="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div></div>' +
            '<div class="ob-row col"><div class="lb"><b>الخط</b></div><div class="ob-pills" id="t-font">' + [['kufi', 'كوفي'], ['plex', 'بلكس'], ['mono', 'أرقام']].map(function (m) { return '<button type="button" class="ob-pill' + (a.top.font === m[0] ? ' on' : '') + '" data-v="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div></div>' +
            keyRow('اللون الأساسي', '<input type="color" class="ob-color" id="t-accent" value="' + a.top.accent + '" aria-label="اللون الأساسي">') +
            keyRow('لون الخلفية', '<input type="color" class="ob-color" id="t-bg" value="' + a.top.bg + '" aria-label="لون الخلفية">') +
            keyRow('شفافية الخلفية', rng('t-bgA', a.top.bgA, 0, 1, 0.01)) +
            keyRow('لون الإطار', '<input type="color" class="ob-color" id="t-border" value="' + a.top.border + '" aria-label="لون الإطار">') +
            keyRow('المسافة بين الصفوف', rng('t-gap', a.top.gap, 0, 16, 1)) +
            keyRow('تاج للأول', '<label class="ob-toggle"><input type="checkbox" id="t-crown"' + (a.top.crown ? ' checked' : '') + '><span></span></label>') +
            '</div></div>' : '';
        var soundUI = a.type === 'sound' ? '<div class="sec"><h4>الصوت</h4><div class="rows">' + keyRow('مستوى الصوت', rng('s-vol', a.vol, 0, 1, 0.01)) + '<button type="button" class="ob-btn" id="s-play">' + ic('play') + 'تشغيل</button></div></div>' : '';
        var frameUI = a.type === 'frame' ? keyRow('حجم الإطار حول الصورة', rng('f-scale', a.fscale || 1.3, 1, 2.5, 0.05), 'الدائرة بالمعاينة = صورة الداعم') : '';
        // الأليرت: الشكل اللي ياخذه الستريمر (خلفية خلفه، ألوان الفيديو، ألوان العناصر وظهورها)
        if (a.type === 'alert') {
            var L0 = a.look || {};
            a.look = {
                vbg: Object.assign({ on: false, c: '#000000', a: 0.6, r: 0.6 }, L0.vbg || {}),
                vfx: Object.assign({ hue: 0, sat: 1, bri: 1 }, L0.vfx || {}),
                parts: { avatar: Object.assign({ on: true, c: '#ffffff' }, (L0.parts || {}).avatar || {}), name: Object.assign({ on: true, c: '#ffffff' }, (L0.parts || {}).name || {}), msg: Object.assign({ on: true, c: '#ffd54a' }, (L0.parts || {}).msg || {}) }
            };
        }
        function clr(id, v, label) { return '<input type="color" class="ob-color" id="' + id + '" value="' + v + '" aria-label="' + label + '">'; }
        function tgl(id, on) { return '<label class="ob-toggle"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label>'; }
        var lookUI = a.type === 'alert' ? '<div class="sec"><h4>' + ic('drop', ' style="width:16px;height:16px"') + 'شكل الأليرت للستريمرز</h4><div class="rows">' +
            '<small class="mut2" style="line-height:1.7">يوصل للستريمر مع الأليرت لما يستخدمه، ويقدر يعدّله من المحرر.</small>' +
            keyRow('خلفية خلف الأليرت', tgl('lk-bg-on', a.look.vbg.on), 'للأليرت المفرّغ: لوح ورا الفيديو') +
            '<div id="lk-bg-rows">' + keyRow('لون الخلفية', clr('lk-bg-c', a.look.vbg.c, 'لون الخلفية')) + keyRow('شفافية الخلفية', rng('lk-bg-a', a.look.vbg.a, 0, 1, 0.01), '0 = شفافة، 1 = لون كامل') + keyRow('حواف الخلفية', rng('lk-bg-r', a.look.vbg.r, 0, 3, 0.05)) + '</div>' +
            keyRow('درجة اللون', rng('lk-hue', a.look.vfx.hue, -180, 180, 1), 'تغيّر ألوان الفيديو (0 = الأصلي)') +
            keyRow('التشبّع', rng('lk-sat', a.look.vfx.sat, 0, 2, 0.05)) +
            keyRow('السطوع', rng('lk-bri', a.look.vfx.bri, 0.5, 1.5, 0.05)) +
            keyRow('صورة الداعم', tgl('lk-av-on', a.look.parts.avatar.on) + clr('lk-av-c', a.look.parts.avatar.c, 'لون إطار الصورة'), 'اللون = لون الإطار') +
            keyRow('اسم الداعم', tgl('lk-nm-on', a.look.parts.name.on) + clr('lk-nm-c', a.look.parts.name.c, 'لون الاسم')) +
            keyRow('الرسالة', tgl('lk-ms-on', a.look.parts.msg.on) + clr('lk-ms-c', a.look.parts.msg.c, 'لون الرسالة')) +
            '</div></div>' : '';
        var alertUI = a.type === 'alert' ? keyRow('مدة الأليرت (ثانية)', rng('al-dur', a.dur, 2, 20, 1)) + keyRow('صوت الفيديو', rng('al-vol', a.vol, 0, 1, 0.01)) : '';
        var stage = a.type === 'top' ? '<div class="ed-stage stream" id="ed-stage">' + topHTML(a.top) + '</div>'
            : a.type === 'sound' ? '<div class="ed-stage" id="ed-stage" style="background:rgba(12,11,16,.5)">' + thumbHTML(a) + '</div>'
                : '<div class="ed-stage bg-' + bg + '" id="ed-stage">' + (a.type === 'alert' ? '<div class="lk-box" id="lk-box"><div class="lk-bg" id="lk-bg"></div><canvas id="ed-cv"></canvas><div class="lk-parts"><span class="lk-av" id="lk-av"></span><span class="lk-nm" id="lk-nm">اسم الداعم</span><span class="lk-ms" id="lk-ms">أرسل 5 وردة</span></div></div>' : '<canvas id="ed-cv"></canvas>') + (a.type === 'frame' ? '<div class="fprev" id="f-prev"></div>' : '') + '<span class="pick-hint" id="ed-hint" hidden>اضغط على لون الخلفية بالمعاينة</span><div class="ob-seg bgsw" id="ed-bg"><button type="button" data-v="chk" class="on">شفاف</button><button type="button" data-v="stream">بث</button><button type="button" data-v="white">أبيض</button></div></div>' +
                (a.type === 'alert' ? '<div class="ed-play"><button type="button" class="ob-btn icon sm" id="ed-pp" aria-label="تشغيل/إيقاف">' + ic('pause') + '</button><input type="range" class="ob-range" id="ed-seek" min="0" max="1000" value="0" aria-label="الوقت"><span class="rv num" id="ed-time">0.0</span></div>' : '');

        var m = openModal({
            title: (isNew ? 'أصل جديد: ' : 'تعديل: ') + esc(a.name), wide: true, noFocus: true,
            body: '<div class="ed"><div>' + stage + '<div class="rows" style="margin-top:12px">' +
                keyRow('الاسم', '<input id="ed-name" class="ob-input" value="' + esc(a.name) + '" style="width:200px">') +
                keyRow('التصنيف', '<input id="ed-cat" class="ob-input" value="' + esc(a.cat) + '" placeholder="هدايا، متابعة…" style="width:200px">') +
                '<div class="ob-row col"><div class="lb"><b>متاح لـ</b><small>مين يشوفه بمكتبته</small></div><div class="ob-pills" id="ed-access">' + Object.keys(ACCESS).map(function (k) { return '<button type="button" class="ob-pill' + (a.access === k ? ' on' : '') + '" data-v="' + k + '">' + ACCESS[k] + '</button>'; }).join('') + '</div></div>' +
                '<div class="ob-row col"><div class="lb"><b>الحالة</b><small>«مخفي» يختفي من المكتبات، واللي يستخدمونه يبقى عندهم</small></div><div class="ob-pills" id="ed-st">' + Object.keys(A_ST).map(function (k) { return '<button type="button" class="ob-pill' + (a.status === k ? ' on' : '') + '" data-v="' + k + '">' + A_ST[k][0] + '</button>'; }).join('') + '</div></div>' +
                alertUI + frameUI + '</div></div>' +
                '<div class="ed-side">' + keyUI + lookUI + topUI + soundUI +
                (!isNew ? '<div class="sec"><h4>معلومات</h4><div class="kv">' + kv('النسخة', 'v' + a.version) + kv('آخر تعديل', fdt(a.updated)) + kv('يستخدمه', fmtN(a.usage) + ' ستريمر') + '</div></div>' : '') +
                '</div></div>',
            foot: '<button type="button" class="ob-btn primary" id="ed-pub">' + ic('send') + (a.status === 'published' && !isNew ? 'نشر التحديث للجميع' : 'نشر للجميع') + '</button><button type="button" class="ob-btn" id="ed-save">حفظ</button><button type="button" class="ob-btn ghost" id="ed-cancel">رجوع</button>' + (!isNew ? '<span style="flex:1"></span><button type="button" class="ob-btn danger" id="ed-del">' + ic('trash') + 'حذف</button>' : ''),
            onClose: function () { cancelAnimationFrame(raf); if (video) { video.pause(); } },
            onMount: function (el, mm) {
                var cv = el.querySelector('#ed-cv');
                function tNow() { return playing ? tOff + (performance.now() - t0) / 1000 : tOff; }
                function draw() { if (!cv) return; var t = video ? video.currentTime : tNow() % (a.src.proc ? 3 : 1e9); renderKeyed(cv, a, t, video); if (a.type === 'alert') { var dur = video ? (video.duration || 1) : 3; el.querySelector('#ed-seek').value = Math.round((t % dur) / dur * 1000); el.querySelector('#ed-time').textContent = (t % dur).toFixed(1); } }
                function loop() { draw(); raf = requestAnimationFrame(loop); }
                function sizeCanvas() { if (!cv) return; var sz = a.type === 'alert' ? (video && video.videoWidth ? fit(video.videoWidth, video.videoHeight, 720) : [640, 360]) : assetSize(a); cv.width = sz[0]; cv.height = sz[1]; }
                function fit(w, h, mx) { var s = Math.min(1, mx / Math.max(w, h)); return [Math.round(w * s), Math.round(h * s)]; }
                if (cv) {
                    if (a.src.video) {
                        video = document.createElement('video'); video.src = a.src.video; video.muted = true; video.loop = true; video.playsInline = true; video.crossOrigin = 'anonymous';
                        video.addEventListener('loadedmetadata', function () { a.w = video.videoWidth; a.h = video.videoHeight; a.d = Math.round((video.duration || 0) * 100) / 100; sizeCanvas(); a.dur = Math.min(20, Math.max(2, Math.round(video.duration))) || a.dur; var dr = el.querySelector('#al-dur'); if (dr) { dr.value = a.dur; el.querySelector('#al-dur-v').textContent = a.dur; } });
                        video.addEventListener('loadeddata', function () { if (!a.src.thumb) { try { var tc = document.createElement('canvas'); var sz = fit(video.videoWidth, video.videoHeight, 320); tc.width = sz[0]; tc.height = sz[1]; tc.getContext('2d').drawImage(video, 0, 0, sz[0], sz[1]); a.src.thumb = tc.toDataURL('image/jpeg', .7); } catch (e) { /* ignore */ } } });
                        video.play().catch(function () { /* ignore */ });
                    }
                    sizeCanvas();
                    if (a.type === 'alert') loop(); else { draw(); if (a.src.img) getImg(a.src.img, function () { sizeCanvas(); draw(); }); }
                    el.querySelector('#ed-bg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; bg = b.getAttribute('data-v'); $$('#ed-bg button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); el.querySelector('#ed-stage').className = 'ed-stage bg-' + bg; });
                    cv.addEventListener('click', function (e) {
                        if (!picking) return;
                        var r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * cv.width), y = Math.floor((e.clientY - r.top) / r.height * cv.height);
                        var tc = document.createElement('canvas'); tc.width = cv.width; tc.height = cv.height; var tx = tc.getContext('2d');
                        drawSource(tx, a, video ? video.currentTime : tNow() % 3, cv.width, cv.height, null, video);
                        var px = tx.getImageData(x, y, 1, 1).data; a.key.color = rgbHex(px[0], px[1], px[2]); a.key.mode = 'color'; a.key.on = true;
                        picking = false; el.querySelector('#ed-hint').hidden = true; cv.style.cursor = ''; syncKeyUI(); draw();
                    });
                }
                if (a.type === 'alert') {
                    el.querySelector('#ed-pp').addEventListener('click', function () {
                        var wasT = tNow(); playing = !playing; if (video) { if (playing) video.play(); else video.pause(); } else { tOff = wasT; t0 = performance.now(); }
                        el.querySelector('#ed-pp').innerHTML = ic(playing ? 'pause' : 'play');
                    });
                    el.querySelector('#ed-seek').addEventListener('input', function (e) { var v = e.target.value / 1000; if (video) video.currentTime = v * (video.duration || 0); else { tOff = v * 3; t0 = performance.now(); } });
                }
                // التفريغ
                function syncKeyUI() {
                    if (!isVis) return;
                    var k = a.key, b = el.querySelector('#k-body');
                    el.querySelector('#k-on').checked = k.on; b.style.opacity = k.on ? '' : '.55';
                    $$('#k-mode .ob-pill', el).forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-v') === k.mode); });
                    el.querySelector('#k-color').value = k.color;
                    el.querySelector('#k-color-row').hidden = k.mode !== 'color'; el.querySelector('#k-sp-row').hidden = k.mode !== 'color';
                    el.querySelector('#k-sim-row').hidden = k.mode === 'screen'; el.querySelector('#k-sm-row').hidden = k.mode === 'screen';
                }
                if (isVis) {
                    syncKeyUI();
                    el.querySelector('#k-on').addEventListener('change', function (e) { a.key.on = e.target.checked; syncKeyUI(); draw(); });
                    el.querySelector('#k-mode').addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (!b) return; a.key.mode = b.getAttribute('data-v'); a.key.on = true; if (a.key.mode === 'black' || a.key.mode === 'white') { a.key.sim = Math.min(a.key.sim, .2); syncRange('k-sim', a.key.sim); } syncKeyUI(); draw(); });
                    el.querySelector('#k-color').addEventListener('input', function (e) { a.key.color = e.target.value; a.key.on = true; syncKeyUI(); draw(); });
                    el.querySelector('#k-pick').addEventListener('click', function () { picking = !picking; el.querySelector('#ed-hint').hidden = !picking; cv.style.cursor = picking ? 'crosshair' : ''; });
                    el.querySelector('#k-auto').addEventListener('click', function () {
                        var tc = document.createElement('canvas'); tc.width = cv.width; tc.height = cv.height; var tx = tc.getContext('2d');
                        drawSource(tx, a, video ? video.currentTime : 0.5, cv.width, cv.height, null, video);
                        var pts = [[2, 2], [cv.width - 3, 2], [2, cv.height - 3], [cv.width - 3, cv.height - 3], [cv.width >> 1, 2]], s = [0, 0, 0];
                        pts.forEach(function (p) { var d = tx.getImageData(p[0], p[1], 1, 1).data; s[0] += d[0]; s[1] += d[1]; s[2] += d[2]; });
                        s = s.map(function (v) { return v / pts.length; });
                        var l = (s[0] + s[1] + s[2]) / 3, sat = Math.max.apply(null, s) - Math.min.apply(null, s);
                        if (sat < 30 && l < 40) { a.key.mode = a.type === 'alert' ? 'screen' : 'black'; }
                        else if (sat < 30 && l > 215) { a.key.mode = 'white'; a.key.sim = .1; }
                        else { a.key.mode = 'color'; a.key.color = rgbHex(s[0], s[1], s[2]); a.key.sim = .34; a.key.spill = .4; }
                        a.key.on = true; syncRange('k-sim', a.key.sim); syncRange('k-spill', a.key.spill); syncKeyUI(); draw(); toast('اكتشفت الخلفية: ' + { color: 'لون', black: 'سوداء', white: 'بيضاء', screen: 'مؤثرات على أسود' }[a.key.mode]);
                    });
                    bindRange('k-sim', function (v) { a.key.sim = v; }); bindRange('k-smooth', function (v) { a.key.smooth = v; }); bindRange('k-spill', function (v) { a.key.spill = v; }); bindRange('k-op', function (v) { a.key.opacity = v; });
                    var bake = el.querySelector('#k-bake');
                    if (bake) bake.addEventListener('click', function () {
                        if (!a.key.on) { toast('شغّل التفريغ أول', true); return; }
                        renderKeyed(cv, a, 0); try { a.src.img = cv.toDataURL('image/png'); } catch (e) { toast('المتصفح منع حفظ الصورة', true); return; }
                        if (REAL) cv.toBlob(function (b) { if (b) a._file = b; }, 'image/png'); a.key = Object.assign({}, a.key, { on: false, opacity: 1 }); syncKeyUI(); syncRange('k-op', 1); getImg(a.src.img, draw); draw(); toast('انحفظت الصورة بخلفية شفافة');
                    });
                }
                function bindRange(id, set) { var r = el.querySelector('#' + id); if (!r) return; r.addEventListener('input', function () { var v = Number(r.value); set(v); el.querySelector('#' + id + '-v').textContent = v; if (a.type === 'top') redrawTop(); else draw(); }); }
                function syncRange(id, v) { var r = el.querySelector('#' + id); if (r) { r.value = v; el.querySelector('#' + id + '-v').textContent = v; } }
                // التوب
                function redrawTop() { el.querySelector('#ed-stage').innerHTML = topHTML(a.top); }
                if (a.type === 'top') {
                    el.querySelector('#t-title').addEventListener('input', function (e) { a.top.title = e.target.value; redrawTop(); });
                    bindRange('t-rows', function (v) { a.top.rows = v; }); bindRange('t-bgA', function (v) { a.top.bgA = v; }); bindRange('t-gap', function (v) { a.top.gap = v; });
                    ['accent', 'bg', 'border'].forEach(function (k) { el.querySelector('#t-' + k).addEventListener('input', function (e) { a.top[k] = e.target.value; redrawTop(); }); });
                    el.querySelector('#t-crown').addEventListener('change', function (e) { a.top.crown = e.target.checked; redrawTop(); });
                    pills('#t-shape', function (v) { a.top.shape = v; redrawTop(); }); pills('#t-font', function (v) { a.top.font = v; redrawTop(); });
                }
                if (a.type === 'sound') { bindRange('s-vol', function (v) { a.vol = v; }); el.querySelector('#s-play').addEventListener('click', function () { playSound(a, a.vol); }); }
                if (a.type === 'alert') { bindRange('al-dur', function (v) { a.dur = v; }); bindRange('al-vol', function (v) { a.vol = v; }); }
                // شكل الأليرت: معاينة مباشرة (نفس اللي يطلع بالبث)
                function paintLook() {
                    if (a.type !== 'alert' || !cv) return;
                    if (!document.body.contains(el)) { window.removeEventListener('resize', paintLook); return; } // المحرر تسكّر
                    var L = a.look, box = el.querySelector('#lk-box'), b = L.vbg;
                    el.querySelector('#lk-bg-rows').hidden = !b.on;
                    var m = hexRgb(b.c);
                    var em = Math.max(1, cv.clientWidth / 18);
                    box.style.fontSize = em + 'px';
                    var bgEl = el.querySelector('#lk-bg');
                    bgEl.style.display = b.on ? '' : 'none';
                    bgEl.style.background = 'rgba(' + m.join(',') + ',' + b.a + ')';
                    bgEl.style.borderRadius = b.r + 'em';
                    var f = [];
                    if (L.vfx.hue) f.push('hue-rotate(' + L.vfx.hue + 'deg)');
                    if (L.vfx.sat !== 1) f.push('saturate(' + L.vfx.sat + ')');
                    if (L.vfx.bri !== 1) f.push('brightness(' + L.vfx.bri + ')');
                    cv.style.filter = f.join(' ');
                    var P = L.parts;
                    var av = el.querySelector('#lk-av'), nm = el.querySelector('#lk-nm'), ms = el.querySelector('#lk-ms');
                    av.hidden = !P.avatar.on; av.style.borderColor = P.avatar.c;
                    nm.hidden = !P.name.on; nm.style.color = P.name.c;
                    ms.hidden = !P.msg.on; ms.style.color = P.msg.c;
                }
                if (a.type === 'alert') {
                    var L = a.look;
                    function lkRange(id, obj, key) { bindRange(id, function (v) { obj[key] = v; paintLook(); }); }
                    lkRange('lk-bg-a', L.vbg, 'a'); lkRange('lk-bg-r', L.vbg, 'r'); lkRange('lk-hue', L.vfx, 'hue'); lkRange('lk-sat', L.vfx, 'sat'); lkRange('lk-bri', L.vfx, 'bri');
                    [['lk-bg-on', L.vbg, 'on'], ['lk-av-on', L.parts.avatar, 'on'], ['lk-nm-on', L.parts.name, 'on'], ['lk-ms-on', L.parts.msg, 'on']].forEach(function (t) {
                        el.querySelector('#' + t[0]).addEventListener('change', function (e) { t[1][t[2]] = e.target.checked; paintLook(); });
                    });
                    [['lk-bg-c', L.vbg], ['lk-av-c', L.parts.avatar], ['lk-nm-c', L.parts.name], ['lk-ms-c', L.parts.msg]].forEach(function (t) {
                        el.querySelector('#' + t[0]).addEventListener('input', function (e) { t[1].c = e.target.value; paintLook(); });
                    });
                    paintLook(); setTimeout(paintLook, 80); setTimeout(paintLook, 500);
                    window.addEventListener('resize', paintLook);
                }
                // الإطار: دائرة بحجم صورة الداعم تحت الإطار عشان يضبط الحجم
                function paintFprev() { var fp = el.querySelector('#f-prev'); if (!fp || !cv) return; var d = Math.min(cv.clientWidth, cv.clientHeight) / (a.fscale || 1.3); fp.style.width = fp.style.height = d + 'px'; }
                if (a.type === 'frame') { bindRange('f-scale', function (v) { a.fscale = v; paintFprev(); }); setTimeout(paintFprev, 60); setTimeout(paintFprev, 400); }
                /** متصل: الأيقونة والإطار ينرفعون مفرّغين (PNG شفاف) — الشاشات تعرض الصورة كما هي. */
                function bakeIfNeeded() {
                    if (!REAL || !cv || !(a.type === 'icon' || a.type === 'frame') || !a.key || !a.key.on) return Promise.resolve();
                    return new Promise(function (res) {
                        renderKeyed(cv, a, 0);
                        try { cv.toBlob(function (b) { if (b) { a._file = b; a.key = Object.assign({}, a.key, { on: false, opacity: 1 }); } res(); }, 'image/png'); } catch (e) { res(); }
                    });
                }
                function pills(sel, fn) { el.querySelector(sel).addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (!b) return; $$(sel + ' .ob-pill', el).forEach(function (x) { x.classList.toggle('on', x === b); }); fn(b.getAttribute('data-v')); }); }
                pills('#ed-access', function (v) { a.access = v; }); pills('#ed-st', function (v) { a.status = v; });
                function collect() { a.name = el.querySelector('#ed-name').value.trim() || a.name; a.cat = el.querySelector('#ed-cat').value.trim(); }
                function reach() { return S.users.filter(function (u) { return u.status === 'active' && (a.access === 'all' || (a.access === 'subs' ? isPaying(u) : isPaying(u) && (u.sub.plan === 'yearly' || u.sub.lifetime))); }).length; }
                el.querySelector('#ed-save').addEventListener('click', function () {
                    collect();
                    if (!REAL) { API.saveAsset(a, false); mm.close(); refresh(); toast('انحفظ «' + a.name + '»'); return; }
                    bakeIfNeeded().then(function () { return persistAsset(a, isNew, false); }).then(function (ok) { if (ok) { mm.close(); toast('انحفظ «' + a.name + '»'); } });
                });
                el.querySelector('#ed-pub').addEventListener('click', function () {
                    collect(); if (a.type === 'alert' && !a.src.video && !a.src.proc) { toast('ارفع الفيديو أول', true); return; }
                    var wasPub = orig.status === 'published' && !isNew;
                    if (!REAL) { API.saveAsset(a, true); mm.close(); refresh(); toast((wasPub ? 'انرفع التحديث v' + a.version : 'انرفع «' + a.name + '»') + ' لمكتبات ' + reach() + ' مستخدم'); return; }
                    bakeIfNeeded().then(function () { return persistAsset(a, isNew, true); }).then(function (r) { if (r) { mm.close(); toast((wasPub ? 'انرفع التحديث v' + r.version : 'انرفع «' + a.name + '»') + ' لمكتبات ' + reach() + ' مستخدم'); } });
                });
                el.querySelector('#ed-cancel').addEventListener('click', mm.close);
                var del = el.querySelector('#ed-del');
                if (del) del.addEventListener('click', function () {
                    confirmBox({ title: 'حذف «' + esc(a.name) + '»؟', text: orig.usage ? 'يستخدمه ' + fmtN(orig.usage) + ' ستريمر. بيختفي من مكتباتهم، والشاشات اللي فيها هالأصل بيطلع مكانه فاضي.' : 'بيختفي من المكتبة نهائياً.', ok: 'حذف نهائي', danger: true })
                        .then(function (ok) { if (!ok) return; mm.close(); doOp('assetDelete', { id: orig.id }, function () { API.deleteAsset(orig); }, 'انحذف'); });
                });
            }
        });
        return m;
    }

    /* =========================================================
       ٦) الإحصائيات
       ========================================================= */
    var STS = { days: 30 };
    VIEWS.stats = {
        html: function () {
            var n = STS.days, U = S.users;
            var daily = sumDaily(U, n), totalH = daily.reduce(function (a, b) { return a + b; }, 0);
            var activeU = U.filter(function (u) { return hoursN(u, n) > 0; });
            var T = now(), rev = 0; U.forEach(function (u) { u.payments.forEach(function (p) { if (p.at > T - n * DAY) rev += p.amount; }); });
            var everSub = U.filter(function (u) { return u.sub; });
            var avgDays = everSub.length ? everSub.reduce(function (a, u) { return a + paidDays(u); }, 0) / everSub.length : 0;
            var renewRate = everSub.length ? everSub.filter(function (u) { return u.sub.renewals > 0; }).length / everSub.length * 100 : 0;
            var don = U.reduce(function (a, u) { return a + u.donations.total; }, 0);
            var perDay = 0; for (var di = 0; di < n; di++) U.forEach(function (u) { if (u.usage.daily[90 - n + di] > 0) perDay++; }); perDay /= n;
            var rm = revenueByMonth(6);
            var plans = S.plans.map(function (p, i) { return { l: p.name, v: U.filter(function (u) { return isPaying(u) && u.sub.plan === p.id; }).length, c: ['#cfc3dc', '#8d7fa3', '#ffd54a', '#74d6a1'][i % 4] }; }).filter(function (s) { return s.v; });
            var rb = [0, 1, 2, 3].map(function (k) { return { l: k === 3 ? '3 مرات أو أكثر' : k === 0 ? 'ما جدّد' : k === 1 ? 'مرة' : 'مرتين', v: everSub.filter(function (u) { return k === 3 ? u.sub.renewals >= 3 : u.sub.renewals === k; }).length }; });
            var rbMax = Math.max.apply(null, rb.map(function (r) { return r.v; }).concat([1]));
            function top(fn, fmt, title) {
                var l = U.slice().sort(function (a, b) { return fn(b) - fn(a); }).slice(0, 8);
                return '<section class="card glass"><div class="card-h"><h3>' + title + '</h3></div><div class="list">' + l.map(function (u, i) { return '<div class="li click" data-user="' + u.id + '"><span class="num mut2" style="width:18px">' + (i + 1) + '</span>' + avatar(u) + '<div class="m"><b>' + esc(u.name) + '</b><small class="ltr">@' + esc(u.tiktok) + '</small></div><span class="v num">' + fmt(u) + '</span></div>'; }).join('') + '</div></section>';
            }
            return '<div class="toolbar"><div class="ob-seg">' + [[7, '7 أيام'], [30, '30 يوم'], [90, '90 يوم']].map(function (p) { return '<button type="button" data-a="stsDays" data-v="' + p[0] + '" class="' + (n === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div><span class="sp"></span><small class="mut2">الساعات الفعلية = وقت رابط شاشة فيرو مفتوح بـOBS أو TikTok LIVE Studio</small></div>' +
                '<div class="kpis k4">' +
                kpi('clock', hrs(totalH) + '<small>ساعة</small>', 'استخدام فعلي بآخر ' + n + ' يوم') +
                kpi('users', fmtN(activeU.length), 'ستريمر استخدم فيرو') +
                kpi('chart', activeU.length ? hrs(totalH / activeU.length) + '<small>ساعة</small>' : '—', 'متوسط الساعات للستريمر') +
                kpi('money', fmtN(rev) + '<small>' + CUR + '</small>', 'الدعم (الاشتراكات) بآخر ' + n + ' يوم') +
                kpi('crown', fmtN(avgDays) + '<small>يوم</small>', 'متوسط مدة الاشتراك') +
                kpi('repeat', fmtN(renewRate) + '%', 'نسبة التجديد') +
                kpi('live', fmtN(perDay, 1), 'ستريمر يبث بالمتوسط كل يوم') +
                kpi('gift', '$' + fmtN(don), 'دونيشن Streamlabs المستلمة') +
                '</div>' +
                '<section class="card glass"><div class="card-h"><h3>الساعات الفعلية يومياً</h3></div>' + barChart(daily, dayLabels(n), { ticks: n > 30 ? 9 : 8, label: 'الساعات اليومية' }) + '</section>' +
                '<div class="grid3">' +
                '<section class="card glass"><div class="card-h"><h3>الدخل الشهري <span class="sub">' + CUR + '</span></h3></div>' + barChart(rm.vals, rm.labels, { h: 210, w: 420, ticks: 6, label: 'الدخل الشهري', fmt: function (v) { return fmtN(v); } }) + '</section>' +
                '<section class="card glass"><div class="card-h"><h3>المشتركين حسب الخطة</h3></div><div class="donut-wrap">' + donut(plans) + '<div class="legend">' + plans.map(function (s) { return '<span><i style="background:' + s.c + '"></i>' + s.l + ' <b class="num">' + s.v + '</b></span>'; }).join('') + '</div></div></section>' +
                '<section class="card glass"><div class="card-h"><h3>كم مرة يجدّدون</h3></div><div class="hbar">' + rb.map(function (r) { return '<div class="r"><span>' + r.l + '</span><span class="t"><i style="width:' + (r.v / rbMax * 100) + '%"></i></span><span class="n num">' + r.v + '</span></div>'; }).join('') + '</div></section>' +
                '</div>' +
                '<div class="grid3">' +
                top(function (u) { return hoursN(u, n); }, function (u) { return hrs(hoursN(u, n)) + ' س'; }, 'الأكثر استخداماً (' + n + ' يوم)') +
                top(paidTotal, function (u) { return money(paidTotal(u)); }, 'الأعلى دعماً') +
                top(function (u) { return u.sub ? u.sub.renewals * 1000 + paidDays(u) : -1; }, function (u) { return (u.sub ? u.sub.renewals : 0) + ' تجديد · ' + paidDays(u) + ' يوم'; }, 'الأكثر تجديداً') +
                '</div>';
        }
    };

    /* =========================================================
       ٧) سجل الأدمن
       ========================================================= */
    var LG = { q: '' };
    function logTable() {
        var l = S.log.filter(function (x) { return !LG.q || normAr(x.act + ' ' + x.target + ' ' + x.by).indexOf(normAr(LG.q).replace(/^@/, '')) >= 0; });
        return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الأدمن</th><th>الإجراء</th><th>على</th></tr></thead><tbody>' +
            (l.length ? l.slice(0, 200).map(function (x) { return '<tr' + (x.uid ? ' class="click" data-user="' + x.uid + '"' : '') + '><td>' + fdt(x.at) + ' <small class="mut2">' + rel(x.at) + '</small></td><td>' + esc(x.by) + '</td><td>' + esc(x.act) + '</td><td>' + esc(x.target) + '</td></tr>'; }).join('') : '<tr><td colspan="4"><div class="empty-s" style="margin:10px">ما فيه نتائج</div></td></tr>') + '</tbody></table></div>';
    }
    VIEWS.activity = {
        html: function () { return '<section class="card glass"><div class="toolbar"><div class="search-in">' + ic('search') + '<input id="lg-q" class="ob-input" type="search" placeholder="ابحث بالإجراء أو اليوزر" value="' + esc(LG.q) + '"></div></div><div id="lg-table">' + logTable() + '</div></section>'; },
        mount: function () { var q = $('#lg-q'); q.addEventListener('input', function () { LG.q = q.value; part('lg-table', logTable()); }); }
    };

    /* =========================================================
       ٨) الإعدادات
       ========================================================= */
    var ROLE_NAMES = { owner: 'المالك', manager: 'مدير (كل شي)', support: 'دعم (قراءة + أيام إضافية)', content: 'محتوى (المكتبة بس)' };
    VIEWS.config = {
        html: function () {
            var c = S.cfg;
            function tg(name, on) { return '<label class="ob-toggle"><input type="checkbox" data-c="' + name + '"' + (on ? ' checked' : '') + '><span></span></label>'; }
            return '<div class="grid2">' +
                '<section class="card glass"><div class="card-h"><h3>الوصول لفيرو</h3></div><div class="rows">' +
                '<div class="ob-row"><div class="lb"><b>فيرو للأدمن والتجربة بس</b><small>لما تطفيه يتفتح فيرو لكل ستريمر عنده حساب ألعاب أيمن</small></div><div class="ct">' + tg('cfgPreview', c.previewAdminOnly) + '</div></div>' +
                '<div class="ob-row"><div class="lb"><b>الاشتراك إلزامي</b><small>لما يكون شغّال: اللي ما عنده اشتراك نشط ما يقدر يستخدم أدوات فيرو (الأدمن والتجربة مستثنين)</small></div><div class="ct">' + tg('cfgReq', c.requireSub) + '</div></div>' +
                '<div class="ob-row"><div class="lb"><b>أيام التجربة المجانية</b><small>تنعطى تلقائياً لأي حساب يدخل فيرو أول مرة (0 = بدون)</small></div><div class="ct"><input id="cfg-trial" type="number" min="0" max="60" class="ob-input ltr num" value="' + (c.trialDays || 0) + '" style="width:90px"></div></div>' +
                '</div></section>' +
                '<section class="card glass"><div class="card-h"><h3>إعلان لكل المستخدمين</h3></div><div class="rows">' +
                '<div class="ob-row"><div class="lb"><b>إظهار الإعلان</b><small>يطلع شريط فوق المحرر عند كل المستخدمين</small></div><div class="ct">' + tg('cfgAnn', c.announce && c.announce.on) + '</div></div>' +
                '<textarea id="cfg-ann" class="ob-input" placeholder="نص الإعلان" maxlength="300">' + esc(c.announce ? c.announce.text : '') + '</textarea>' +
                '</div></section>' +
                '<section class="card glass"><div class="card-h"><h3>الأدمن والمشرفين</h3><button type="button" class="ob-btn sm" data-a="adminAdd">' + ic('plus') + 'إضافة</button></div>' +
                '<p class="mut2" style="margin:0 0 10px;font-size:12.5px;line-height:1.7">حسابات الأدمن بألعاب أيمن تدخل اللوحة دايماً بصلاحية كاملة.</p><div class="list">' +
                (c.admins || []).map(function (a) { return '<div class="li"><span class="av">' + esc(String(a.name || '?').charAt(0)) + '</span><div class="m"><b>' + esc(a.name) + ' <span class="mut2 num">#' + a.id + '</span></b><small>' + esc(ROLE_NAMES[a.role] || a.role) + '</small></div>' + (a.role === 'owner' ? '<span class="tag gold">المالك</span>' : '<button type="button" class="ob-btn danger sm" data-a="adminDel" data-id="' + a.id + '">إزالة</button>') + '</div>'; }).join('') +
                ((c.admins || []).length ? '' : '<div class="empty-s">ما فيه مشرفين مضافين</div>') +
                '</div></section>' +
                (REAL ? '<section class="card glass"><div class="card-h"><h3>الاتصال</h3></div><p class="mut" style="margin:0 0 12px;line-height:1.8">اللوحة متصلة بسيرفر فيرو، وكل تعديل يتطبق على الحسابات الحقيقية مباشرة.</p><div class="quick"><button type="button" class="ob-btn" data-a="reloadNow">' + ic('reset') + 'تحديث البيانات</button><a class="ob-btn ghost" href="?demo#overview">فتح المعاينة التجريبية</a></div></section>'
                    : '<section class="card glass"><div class="card-h"><h3>بيانات المعاينة</h3></div><p class="mut" style="margin:0 0 12px;line-height:1.8">كل اللي تشوفه هنا بيانات تجريبية محفوظة بمتصفحك بس. تقدر تجرّب كل الأزرار بدون ما يتأثر أي ستريمر حقيقي.</p>' +
                    '<button type="button" class="ob-btn danger" data-a="resetDemo">' + ic('reset') + 'إرجاع البيانات التجريبية من البداية</button></section>') +
                '</div>';
        },
        mount: function () {
            $('#cfg-trial').addEventListener('change', function (e) {
                var v = clamp(Math.round(Number(e.target.value)) || 0, 0, 60);
                doOp('cfgSet', { key: 'trialDays', value: v }, function () { S.cfg.trialDays = v; logA('غيّر أيام التجربة', v + ' يوم'); }, 'انحفظ');
            });
            $('#cfg-ann').addEventListener('change', function (e) {
                var t = e.target.value;
                doOp('cfgSet', { key: 'announce', value: { on: S.cfg.announce.on, text: t } }, function () { S.cfg.announce.text = t; logA('عدّل الإعلان', '—'); }, 'انحفظ نص الإعلان');
            });
        }
    };

    /* =========================================================
       تنفيذ الإجراءات: السيرفر (اللوحة متصلة) أو البيانات التجريبية
       ========================================================= */
    var ERR = {
        bad_days: 'عدد الأيام غلط', already_lifetime: 'اشتراكه مفتوح أصلاً', no_active_sub: 'ما عنده اشتراك نشط تنخصم منه أيام', bad_plan: 'الخطة غلط',
        not_running: 'الاشتراك مو شغّال', not_frozen: 'الاشتراك مو مجمّد', no_sub: 'ما عنده اشتراك', not_lifetime: 'الاشتراك مو مفتوح', bad_status: 'الحالة غلط',
        bad_user: 'الحساب مو موجود', bad_type: 'النوع غلط', bad_date: 'التاريخ لازم يكون بعد اليوم', code_used: 'الكود انستخدم وما ينحذف — عطّله بداله', not_found: 'مو موجود',
        name_required: 'اكتب الاسم', file_required: 'ارفع الملف أول', no_permission: 'ما عندك صلاحية لهالإجراء', not_admin: 'ما عندك صلاحية للوحة فيرو',
        unsupported_type: 'نوع الملف مو مدعوم', file_too_large: 'الملف كبير (الحد 30MB)', storage_unavailable: 'التخزين بالسيرفر مو متاح الحين', bad_role: 'الصلاحية غلط', bad_key: 'إعداد غلط',
        unauthorized: 'انتهت جلستك — سجّل دخول من جديد', session_revoked: 'انتهت جلستك — سجّل دخول من جديد'
    };
    function errText(d) { return (d && (d.message || ERR[d.error])) || 'ما تم — صار خطأ' + (d && d.error ? ' (' + d.error + ')' : ''); }
    function req(method, path, data) {
        var opt = { method: method, headers: { 'Authorization': 'Bearer ' + TOKEN } };
        if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
        return fetch(API_BASE + path, opt).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d = d || {}; d._status = r.status; return d; }); });
    }
    function rawOp(name, args) { return req('POST', '/api/veyro/admin/op', Object.assign({ op: name }, args || {})); }
    function busy(on) { document.body.classList.toggle('busy', Boolean(on)); }
    /**
     * إجراء واحد: متصل → يرسله للسيرفر ويحدّث البيانات، تجريبي → demo() على البيانات المحلية.
     * demo يرجع false (فشل وطلع تنبيه) أو نص خطأ، أو أي شي ثاني = نجح. ok = رسالة النجاح (أو دالة تاخذ النتيجة).
     * يرجع Promise بالنتيجة (أو false).
     */
    function doOp(name, args, demo, ok) {
        function msg(r) { if (ok) toast(typeof ok === 'function' ? ok(r) : ok); }
        if (!REAL) {
            var r = demo ? demo() : undefined;
            if (r === false) return Promise.resolve(false);
            if (typeof r === 'string') { toast(r, true); return Promise.resolve(false); }
            refresh(); msg(r || {});
            return Promise.resolve(r || {});
        }
        busy(true);
        return rawOp(name, args).then(function (d) {
            if (d._status === 401) { toast(errText({ error: 'unauthorized' }), true); return false; }
            if (!d.success) { toast(errText(d), true); return false; }
            return reload().then(function () { msg(d); return d; });
        }).catch(function () { toast('ما وصل الطلب للسيرفر — تأكد من الاتصال', true); return false; })
            .then(function (x) { busy(false); return x; });
    }

    /* =========================================================
       نوافذ الإجراءات
       ========================================================= */
    function daysModal(title, users, cb) {
        openModal({
            title: title,
            body: '<p>' + (users.length > 1 ? 'بتنضاف لـ<b>' + users.length + '</b> ستريمر.' : '') + ' لو اشتراكه منتهي، تبدأ الأيام من اليوم.</p>' +
                '<div class="field"><label for="dm-n">عدد الأيام</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="ob-pills" id="dm-q">' + [1, 3, 7, 14, 30].map(function (n) { return '<button type="button" class="ob-pill' + (n === 7 ? ' on' : '') + '" data-v="' + n + '">' + n + '</button>'; }).join('') + '</div><input id="dm-n" type="number" min="1" value="7" class="ob-input ltr num" style="width:90px"></div></div>' +
                '<div class="field"><label for="dm-why">السبب (يطلع بسجل الحساب)</label><input id="dm-why" class="ob-input" placeholder="مثال: تعويض، هدية، مسابقة"></div>',
            foot: '<button type="button" class="ob-btn primary" id="dm-ok">' + ic('plus') + 'إضافة</button><button type="button" class="ob-btn ghost" data-x3>رجوع</button>',
            onMount: function (el, mm) {
                el.querySelector('#dm-q').addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (!b) return; el.querySelector('#dm-n').value = b.getAttribute('data-v'); $$('#dm-q .ob-pill', el).forEach(function (x) { x.classList.toggle('on', x === b); }); });
                el.querySelector('[data-x3]').addEventListener('click', mm.close);
                el.querySelector('#dm-ok').addEventListener('click', function () { var n = Math.round(Number(el.querySelector('#dm-n').value)); if (!(n > 0)) return toast('اكتب عدد أيام صحيح', true); cb(n, el.querySelector('#dm-why').value.trim()); mm.close(); });
            }
        });
    }
    function bulkDaysFor(l, n, why) {
        return doOp('bulkDays', { uids: l.map(function (u) { return u.id; }), n: n, why: why }, function () {
            var ok = 0; l.forEach(function (u) { if (API.addDays(u, n, why, true)) ok++; }); logA('أضاف ' + n + ' يوم لـ' + ok + ' ستريمر', why || '—'); return { count: ok };
        }, function (r) { return 'انضاف ' + n + ' يوم لـ' + r.count + ' ستريمر'; });
    }
    function grantModal(preset) {
        openModal({
            title: 'منح اشتراك',
            body: (preset ? '<p>لـ<b>' + preset.length + '</b> ستريمر.</p>' : userPicker('gm-user')) +
                '<div class="field"><label>الخطة</label><div class="ob-pills" id="gm-plan">' + S.plans.filter(function (p) { return p.on; }).map(function (p, i) { return '<button type="button" class="ob-pill' + (i === 0 ? ' on' : '') + '" data-v="' + p.id + '">' + esc(p.name) + '</button>'; }).join('') + '</div></div>' +
                '<div class="field"><label for="gm-amt">المبلغ المدفوع (' + CUR + ')</label><input id="gm-amt" type="number" min="0" value="0" class="ob-input ltr num"><small>0 = هدية بدون دفع. المبلغ يدخل بإحصائيات الدعم.</small></div>' +
                '<div class="field"><label for="gm-m">طريقة الدفع</label><select id="gm-m" class="ob-input"><option>هدية من الأدمن</option><option>تحويل بنكي</option><option>STC Pay</option><option>Apple Pay</option><option>مدى</option></select></div>',
            foot: '<button type="button" class="ob-btn primary" id="gm-ok">' + ic('crown') + 'منح</button><button type="button" class="ob-btn ghost" data-x4>رجوع</button>',
            onMount: function (el, mm) {
                var pl = S.plans.filter(function (p) { return p.on; })[0].id;
                if (!preset) bindPicker(el, 'gm-user');
                el.querySelector('#gm-plan').addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (!b) return; pl = b.getAttribute('data-v'); $$('#gm-plan .ob-pill', el).forEach(function (x) { x.classList.toggle('on', x === b); }); });
                el.querySelector('[data-x4]').addEventListener('click', mm.close);
                el.querySelector('#gm-ok').addEventListener('click', function () {
                    var list = preset || (el.querySelector('#gm-user-v').value ? [user(el.querySelector('#gm-user-v').value)] : []);
                    if (!list.length) return toast('اختر ستريمر', true);
                    var amt = Number(el.querySelector('#gm-amt').value) || 0, meth = amt ? el.querySelector('#gm-m').value : 'هدية من الأدمن';
                    mm.close(); ST.sel = {};
                    doOp('bulkGrant', { uids: list.map(function (u) { return u.id; }), plan: pl, amount: amt, method: meth }, function () { list.forEach(function (u) { API.renew(u, pl, amt, meth); }); },
                        'تم: ' + planName(pl) + ' لـ' + (list.length > 1 ? list.length + ' ستريمر' : list[0].name));
                });
            }
        });
    }
    var COMP_GROUPS = {
        paying: ['المشتركين النشطين', function (u) { var s = subState(u); return s === 'active' || s === 'expiring'; }],
        pf: ['النشطين + المجمّدين', function (u) { var s = subState(u); return s === 'active' || s === 'expiring' || s === 'frozen'; }],
        recent: ['النشطين + اللي انتهى اشتراكهم آخر 7 أيام', function (u) { var s = subState(u); return s === 'active' || s === 'expiring' || (s === 'expired' && u.sub.end > now() - 7 * DAY); }]
    };
    function compModal() {
        var groups = COMP_GROUPS;
        openModal({
            title: 'تعويض للكل',
            body: '<p>يضيف أيام لمجموعة كاملة مرة وحدة، مثلاً بعد توقف السيرفر.</p>' +
                '<div class="field"><label>لمين</label><div class="ob-pills" id="cm-g">' + Object.keys(groups).map(function (k, i) { return '<button type="button" class="ob-pill' + (i === 0 ? ' on' : '') + '" data-v="' + k + '">' + groups[k][0] + ' <span class="ct num">' + S.users.filter(groups[k][1]).length + '</span></button>'; }).join('') + '</div></div>' +
                '<div class="field"><label for="cm-n">عدد الأيام</label><input id="cm-n" type="number" min="1" value="3" class="ob-input ltr num"></div>' +
                '<div class="field"><label for="cm-why">السبب</label><input id="cm-why" class="ob-input" value="تعويض توقف الخدمة"></div>',
            foot: '<button type="button" class="ob-btn primary" id="cm-ok">' + ic('gift') + 'تطبيق التعويض</button><button type="button" class="ob-btn ghost" data-x5>رجوع</button>',
            onMount: function (el, mm) {
                var g = 'paying';
                el.querySelector('#cm-g').addEventListener('click', function (e) { var b = e.target.closest('.ob-pill'); if (!b) return; g = b.getAttribute('data-v'); $$('#cm-g .ob-pill', el).forEach(function (x) { x.classList.toggle('on', x === b); }); });
                el.querySelector('[data-x5]').addEventListener('click', mm.close);
                el.querySelector('#cm-ok').addEventListener('click', function () {
                    var n = Math.round(Number(el.querySelector('#cm-n').value)); if (!(n > 0)) return toast('اكتب عدد أيام صحيح', true);
                    var why = el.querySelector('#cm-why').value.trim();
                    mm.close();
                    doOp('compensate', { group: g, n: n, why: why }, function () {
                        var list = S.users.filter(groups[g][1]); list.forEach(function (u) { API.addDays(u, n, why, true); });
                        logA('تعويض ' + n + ' يوم لـ' + list.length + ' ستريمر', why || '—'); return { count: list.length };
                    }, function (r) { return 'انضاف ' + n + ' يوم لـ' + r.count + ' ستريمر'; });
                });
            }
        });
    }
    function planModal(p) {
        var isNew = !p; p = p ? JSON.parse(JSON.stringify(p)) : { id: '', name: '', days: 30, price: 0, screens: 10, videos: 10, gamesDiscount: 30, on: true, features: [] };
        openModal({
            title: isNew ? 'خطة جديدة' : 'تعديل خطة «' + esc(p.name) + '»',
            body: '<div class="field"><label for="pm-n">الاسم</label><input id="pm-n" class="ob-input" value="' + esc(p.name) + '"></div>' +
                '<div class="grid2"><div class="field"><label for="pm-d">المدة (يوم)</label><input id="pm-d" type="number" min="0" class="ob-input ltr num" value="' + p.days + '"' + (p.id === 'lifetime' ? ' disabled' : '') + '></div><div class="field"><label for="pm-p">السعر (' + CUR + ')</label><input id="pm-p" type="number" min="0" class="ob-input ltr num" value="' + p.price + '"></div>' +
                '<div class="field"><label for="pm-s">عدد الشاشات</label><input id="pm-s" type="number" min="0" class="ob-input ltr num" value="' + p.screens + '"></div><div class="field"><label for="pm-m">عدد الفيديوهات بالمكتبة</label><input id="pm-m" type="number" min="0" class="ob-input ltr num" value="' + (p.videos != null ? p.videos : 10) + '"></div></div>' +
                (p.id === 'lifetime' ? '' : '<div class="field"><label for="pm-g">خصم مشتركي منصة الألعاب (٪)</label><input id="pm-g" type="number" min="0" max="100" class="ob-input ltr num" value="' + (p.gamesDiscount || 0) + '"><small>اللي عنده اشتراك فعّال بالألعاب ياخذ هالخصم كل ما يشتري هالخطة من متجر الألعاب. 0 = بدون.</small></div>') +
                '<div class="field"><label for="pm-f">المزايا (سطر لكل ميزة)</label><textarea id="pm-f" class="ob-input">' + esc(p.features.join('\n')) + '</textarea></div>' +
                '<div class="ob-row"><div class="lb"><b>الخطة مفعّلة</b><small>الموقفة ما تطلع للمشتركين الجدد، والحاليين يكملون</small></div><div class="ct"><label class="ob-toggle"><input type="checkbox" id="pm-on"' + (p.on ? ' checked' : '') + '><span></span></label></div></div>',
            foot: '<button type="button" class="ob-btn primary" id="pm-ok">حفظ الخطة</button><button type="button" class="ob-btn ghost" data-x6>رجوع</button>',
            onMount: function (el, mm) {
                el.querySelector('[data-x6]').addEventListener('click', mm.close);
                el.querySelector('#pm-ok').addEventListener('click', function () {
                    p.name = el.querySelector('#pm-n').value.trim(); if (!p.name) return toast('اكتب اسم الخطة', true);
                    if (p.id !== 'lifetime') p.days = Math.max(1, Number(el.querySelector('#pm-d').value) || 30);
                    p.price = Math.max(0, Number(el.querySelector('#pm-p').value) || 0); p.screens = Number(el.querySelector('#pm-s').value) || 0; p.videos = Number(el.querySelector('#pm-m').value) || 0;
                    var gEl = el.querySelector('#pm-g'); if (gEl) p.gamesDiscount = clamp(Math.round(Number(gEl.value) || 0), 0, 100);
                    p.features = el.querySelector('#pm-f').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); p.on = el.querySelector('#pm-on').checked;
                    mm.close();
                    doOp('planSave', { plan: p }, function () {
                        if (!p.id) p.id = 'p' + uid().slice(0, 5);
                        var i = S.plans.findIndex(function (x) { return x.id === p.id; }); if (i < 0) S.plans.push(p); else S.plans[i] = p;
                        logA(isNew ? 'أضاف خطة' : 'عدّل خطة', p.name);
                    }, 'انحفظت الخطة');
                });
            }
        });
    }
    function showCodes(out, type, uses, ex) {
        if (!out || !out.length) return;
        var all = out.map(function (c) { return c.code; }).join('\n');
        openModal({
            title: 'انشأت ' + out.length + ' كود', wide: out.length > 12,
            body: '<p>' + codeTypeName(type) + ' — ' + codeValue(out[0]) + (uses > 1 ? ' · ' + uses + ' استخدام لكل كود' : '') + (ex ? ' · ينتهي ' + fdate(ex) : '') + '</p><div class="codes-gen code-out">' + out.map(function (c) { return '<span>' + esc(c.code) + '</span>'; }).join('') + '</div>',
            foot: '<button type="button" class="ob-btn primary" id="gc-copy">' + ic('copy') + 'نسخ الكل</button>',
            onMount: function (el) { el.querySelector('#gc-copy').addEventListener('click', function () { copy(all, 'انتسخت ' + out.length + ' كود'); }); }
        });
    }

    /* =========================================================
       الإجراءات (تفويض الأحداث)
       ========================================================= */
    function curU() { return user(DR.uid); }
    function selUsers(map) { return Object.keys(map).map(user).filter(Boolean); }
    function uop(name, args, demo, ok) { var u = curU(); return doOp(name, Object.assign({ uid: u.id }, args || {}), function () { return demo(u); }, ok); }
    var ACT = {
        quickDays: function (b) { var u = user(b.getAttribute('data-id')), n = Number(b.getAttribute('data-n')); doOp('addDays', { uid: u.id, n: n }, function () { return API.addDays(u, n); }, '+' + n + ' يوم لـ' + u.name); },
        copy: function (b) { copy(b.getAttribute('data-v'), 'انتسخ: ' + b.getAttribute('data-v')); },
        closeDr: closeDrawer,
        drTab: function (b) { DR.tab = b.getAttribute('data-v'); renderDrawer(); $('#drawer .drawer-b').scrollTop = 0; },
        pg: function (b) { ST.page += Number(b.getAttribute('data-d')); part('st-table', stTable()); },
        stField: function (b) { ST.field = b.getAttribute('data-v'); ST.page = 0; $$('[data-a=stField]').forEach(function (x) { x.classList.toggle('on', x === b); }); part('st-table', stTable()); $('#st-q').focus(); },
        stFilter: function (b) { ST.filter = b.getAttribute('data-v'); ST.page = 0; $$('[data-a=stFilter]').forEach(function (x) { x.classList.toggle('on', x === b); }); part('st-table', stTable()); },
        clearSel: function () { ST.sel = {}; part('st-table', stTable()); },
        bulkDays: function () { var l = selUsers(ST.sel); daysModal('إضافة أيام لـ' + l.length + ' ستريمر', l, function (n, why) { ST.sel = {}; bulkDaysFor(l, n, why); }); },
        bulkGrant: function () { grantModal(selUsers(ST.sel)); },
        bulkTester: function () { var l = selUsers(ST.sel); ST.sel = {}; doOp('bulkTester', { uids: l.map(function (u) { return u.id; }) }, function () { l.forEach(function (u) { if (!u.tester) API.setTester(u, true); }); }, 'انعطت صلاحية التجربة لـ' + l.length); },
        bulkCsv: function () {
            var l = selUsers(ST.sel), rows = [['id', 'profile_id', 'name', 'tiktok', 'email', 'subscription', 'plan', 'ends', 'hours_30d', 'paid', 'renewals']];
            l.forEach(function (u) { rows.push([u.id, u.customId || '', u.name, '@' + u.tiktok, u.email, SUBL[subState(u)][0], u.sub ? planName(u.sub.plan) : '', u.sub && u.sub.end ? isoDay(u.sub.end) : '', hours30(u).toFixed(1), paidTotal(u), u.sub ? u.sub.renewals : 0]); });
            copy(rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'انتسخ CSV لـ' + l.length + ' ستريمر');
        },
        sbTab: function (b) { SB.tab = b.getAttribute('data-v'); SB.sel = {}; go('subs'); },
        sbClear: function () { SB.sel = {}; part('sb-table', sbTable()); },
        sbBulkDays: function () { var l = selUsers(SB.sel); daysModal('إضافة أيام لـ' + l.length + ' ستريمر', l, function (n, why) { SB.sel = {}; bulkDaysFor(l, n, why); }); },
        grantOpen: function () { grantModal(null); },
        compOpen: compModal,
        planEdit: function (b) { planModal(plan(b.getAttribute('data-id'))); },
        planNew: function () { planModal(null); },
        reloadNow: function () { reload().then(function (ok) { if (ok) toast('تحدّثت البيانات'); }); },
        // ملف الستريمر
        uDays: function (b) { var n = Number(b.getAttribute('data-n')); uop('addDays', { n: n }, function (u) { return API.addDays(u, n); }, '+' + n + ' يوم'); },
        uDaysCustom: function () { var u = curU(); daysModal('أيام إضافية لـ' + u.name, [u], function (n, why) { uop('addDays', { n: n, why: why }, function (x) { return API.addDays(x, n, why); }, '+' + n + ' يوم'); }); },
        uDaysMinus: function () {
            var u = curU();
            confirmBox({ title: 'خصم أيام من ' + esc(u.name), text: 'باقي له ' + daysLeftTxt(u) + '. كم يوم تبي تخصم؟', input: 'عدد الأيام', ph: '3', ok: 'خصم', danger: true }).then(function (v) {
                if (v === true || v == null) return; var n = Math.round(Number(v)); if (!(n > 0)) return toast('اكتب عدد أيام صحيح', true);
                uop('addDays', { n: -n }, function (x) { return API.addDays(x, -n); }, 'انخصم ' + n + ' يوم');
            });
        },
        uSetEnd: function () { var v = $('#u-end').value; if (!v) return; var p = v.split('-'), ts = new Date(+p[0], +p[1] - 1, +p[2], 23, 59).getTime(); uop('setEnd', { ts: ts }, function (u) { API.setEnd(u, ts); }, 'ينتهي ' + fdate(ts)); },
        uRenew: function () { var pl = $('#u-plan').value, amt = Number($('#u-amt').value) || 0, m = amt ? 'يدوي' : 'هدية من الأدمن'; uop('renew', { plan: pl, amount: amt, method: m }, function (u) { API.renew(u, pl, amt, m); }, 'تجدّد: ' + planName(pl)); },
        uCancel: function () { var u = curU(); confirmBox({ title: 'إنهاء اشتراك ' + esc(u.name) + '؟', text: 'الأدوات المدفوعة بتوقف عنده فوراً، وباقي الأيام (' + daysLeftTxt(u) + ') بتروح.', ok: 'إنهاء الاشتراك', danger: true }).then(function (ok) { if (ok) uop('cancel', {}, function (x) { API.cancel(x); }, 'انتهى الاشتراك'); }); },
        uStatus: function (b) {
            var u = curU(), st = b.getAttribute('data-v'); if (u.status === st) return;
            if (st === 'active') { uop('setStatus', { status: st }, function (x) { API.setStatus(x, st); }, 'الحساب نشط'); return; }
            confirmBox({ title: (st === 'banned' ? 'حظر ' : 'إيقاف ') + esc(u.name) + '؟', text: st === 'banned' ? 'ما يقدر يدخل فيرو أبداً، وشاشاته تطفى بالبث.' : 'ما يقدر يدخل فيرو لين ترجّعه، وشاشاته تطفى بالبث.', input: 'السبب (يطلع بالسجل)', ok: st === 'banned' ? 'حظر' : 'إيقاف', danger: true })
                .then(function (v) { if (!v) return; var why = v === true ? '' : v; uop('setStatus', { status: st, why: why }, function (x) { API.setStatus(x, st, why); x.online = false; }, st === 'banned' ? 'انحظر' : 'انوقف'); });
        },
        uLogout: function () { uop('logoutAll', {}, function (u) { API.logoutAll(u); }, 'انسجّل خروجه من كل الأجهزة'); },
        uUnlink: function () { var u = curU(); confirmBox({ title: 'فك توثيق تيك توك؟', text: '@' + esc(u.tiktok) + ' بيحتاج يوثّق من جديد عشان الاتصال بالبث.', ok: 'فك التوثيق', danger: true }).then(function (ok) { if (ok) { API.unlinkTiktok(u); refresh(); } }); },
        uLimits: function () { var s = $('#u-lim-s').value, m = $('#u-lim-m').value; uop('setLimits', { screens: s, videos: m }, function (u) { API.setLimits(u, { screens: s === '' ? null : Number(s), videos: m === '' ? null : Number(m) }); }, 'انحفظت الحدود'); },
        uWipe: function () {
            var u = curU();
            confirmBox({ title: 'حذف بيانات فيرو لـ' + esc(u.name) + '؟', text: 'بتنحذف ' + u.usage.screens + ' شاشة و' + u.usage.videos + ' فيديو. ما تقدر ترجعها. اكتب <b>حذف</b> للتأكيد.', input: 'اكتب: حذف', ok: 'حذف نهائي', danger: true }).then(function (v) {
                if (v !== 'حذف') { if (v) toast('ما انحذف شي: لازم تكتب «حذف»', true); return; }
                uop('wipe', {}, function (x) { API.wipe(x); }, 'انحذفت بيانات فيرو');
            });
        },
        // الأكواد
        cdF: function (b) { CD.f = b.getAttribute('data-v'); $$('[data-a=cdF]').forEach(function (x) { x.classList.toggle('on', x === b); }); part('cd-table', codeTable()); },
        genCodes: function () {
            var type = VIEWS.codes.type(), count = clamp(Math.round(Number($('#cg-count').value) || 1), 1, 1000), uses = Math.max(1, Math.round(Number($('#cg-uses').value) || 1));
            var days = Math.round(Number($('#cg-days').value) || 0), exp = $('#cg-exp').value, fu = $('#cg-user-v').value;
            if ((type === 'days' || type === 'extra') && !(days > 0)) return toast('اكتب عدد أيام صحيح', true);
            var ex = null; if (exp) { var p = exp.split('-'); ex = new Date(+p[0], +p[1] - 1, +p[2], 23, 59).getTime(); if (ex < now()) return toast('تاريخ الانتهاء لازم يكون بعد اليوم', true); }
            var o = { type: type, count: count, maxUses: uses, days: days, plan: type === 'plan' ? $('#cg-plan').value : null, expires: ex, prefix: $('#cg-prefix').value.trim(), campaign: $('#cg-camp').value.trim(), forUser: fu ? Number(fu) : null };
            doOp('genCodes', o, function () { return { codes: API.genCodes(o) }; }).then(function (r) { if (r && r.codes) showCodes(r.codes, type, uses, ex); });
        },
        redeem: function () {
            var code = $('#rd-code').value.trim(), uidv = $('#rd-user-v').value;
            if (!code) return toast('اكتب الكود', true); if (!uidv) return toast('اختر ستريمر', true);
            var u = user(uidv);
            doOp('redeem', { code: code, uid: u.id }, function () { var err = API.redeem(code, u); if (err) return err; logA('طبّق كود', code.toUpperCase() + ' ← ' + uTag(u), u); },
                function () { var x = user(uidv); return 'انطبق الكود على ' + x.name + ' — ' + (x.sub ? planName(x.sub.plan) + ' · ' + daysLeftTxt(x) : ''); });
        },
        codeToggle: function (b) { var cs = b.getAttribute('data-v'), c = S.codes.filter(function (x) { return x.code === cs; })[0]; doOp('codeToggle', { code: cs }, function () { c.disabled = !c.disabled; logA(c.disabled ? 'عطّل كود' : 'فعّل كود', c.code); }, c.disabled ? 'انفعّل الكود' : 'انعطّل الكود'); },
        codeDel: function (b) { var cs = b.getAttribute('data-v'); confirmBox({ title: 'حذف الكود؟', text: '<span class="code-out">' + esc(cs) + '</span> ما انستخدم، بينحذف نهائياً.', ok: 'حذف', danger: true }).then(function (ok) { if (ok) doOp('codeDel', { code: cs }, function () { S.codes = S.codes.filter(function (x) { return x.code !== cs; }); logA('حذف كود', cs); }, 'انحذف الكود'); }); },
        codeUses: function (b) {
            var c = S.codes.filter(function (x) { return x.code === b.getAttribute('data-v'); })[0];
            openModal({ title: 'مين استخدم ' + esc(c.code), body: '<div class="list">' + c.uses.slice().reverse().map(function (x) { var u = user(x.uid); return u ? '<div class="li click" data-user="' + u.id + '">' + avatar(u) + '<div class="m"><b>' + esc(u.name) + '</b><small class="ltr">@' + esc(u.tiktok) + '</small></div><span class="v mut2">' + fdt(x.at) + '</span></div>' : ''; }).join('') + '</div>' });
        },
        codesCsv: function () { var l = S.codes.filter(function (c) { return codeState(c) === 'active'; }); copy(l.map(function (c) { return c.code; }).join('\n'), 'انتسخت ' + l.length + ' كود فعّال'); },
        // المكتبة
        lbType: function (b) { LB.type = b.getAttribute('data-v'); $$('[data-a=lbType]').forEach(function (x) { x.classList.toggle('on', x === b); }); part('lb-grid', lbGrid()); drawThumbs(); },
        lbSt: function (b) { LB.st = b.getAttribute('data-v'); $$('[data-a=lbSt]').forEach(function (x) { x.classList.toggle('on', x === b); }); part('lb-grid', lbGrid()); drawThumbs(); },
        assetNew: assetNew,
        assetEdit: function (b) { var a = S.assets.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (a) { stopThumbs(); assetEditor(a, false); } },
        // الإحصائيات والإعدادات
        stsDays: function (b) { STS.days = Number(b.getAttribute('data-v')); go('stats'); },
        adminAdd: function () {
            openModal({
                title: 'إضافة مشرف', body: userPicker('ad-user') + '<div class="field"><label for="ad-role">الصلاحية</label><select id="ad-role" class="ob-input"><option value="support">' + ROLE_NAMES.support + '</option><option value="content">' + ROLE_NAMES.content + '</option><option value="manager">' + ROLE_NAMES.manager + '</option></select></div>',
                foot: '<button type="button" class="ob-btn primary" id="ad-ok">إضافة</button>',
                onMount: function (el, mm) {
                    bindPicker(el, 'ad-user');
                    el.querySelector('#ad-ok').addEventListener('click', function () {
                        var id = el.querySelector('#ad-user-v').value; if (!id) return toast('اختر حساب', true);
                        var u = user(id), role = el.querySelector('#ad-role').value; mm.close();
                        doOp('adminAdd', { uid: u.id, role: role }, function () { S.cfg.admins = S.cfg.admins.filter(function (a) { return a.id !== u.id; }); S.cfg.admins.push({ id: u.id, name: u.name, role: role }); logA('أضاف مشرف', u.name); }, 'انضاف ' + u.name);
                    });
                }
            });
        },
        adminDel: function (b) {
            var id = Number(b.getAttribute('data-id')), a = S.cfg.admins.filter(function (x) { return Number(x.id) === id; })[0]; if (!a) return;
            confirmBox({ title: 'إزالة ' + esc(a.name) + '؟', text: 'بيفقد الوصول للوحة تحكم فيرو.', ok: 'إزالة', danger: true }).then(function (ok) {
                if (ok) doOp('adminDel', { uid: id }, function () { S.cfg.admins = S.cfg.admins.filter(function (x) { return Number(x.id) !== id; }); logA('أزال مشرف', a.name); }, 'انشال');
            });
        },
        resetDemo: function () { if (REAL) return; confirmBox({ title: 'إرجاع البيانات التجريبية؟', text: 'كل تعديلاتك بالمعاينة بتروح وترجع البيانات من البداية.', ok: 'إرجاع', danger: true }).then(function (ok) { if (!ok) return; S = seed(); ST.sel = {}; SB.sel = {}; save(); closeDrawer(); go(cur); toast('رجعت البيانات من البداية'); }); }
    };
    function cfgToggle(key, el, on, off) {
        var v = el.checked, val = key === 'announce' ? { on: v, text: S.cfg.announce.text } : v;
        doOp('cfgSet', { key: key, value: val }, function () { if (key === 'announce') S.cfg.announce.on = v; else S.cfg[key] = v; logA(v ? on : off, '—'); }, v ? on : off)
            .then(function (r) { if (r === false) el.checked = !v; });
    }
    var CHG = {
        selOne: function (el) { var id = el.getAttribute('data-id'); if (el.checked) ST.sel[id] = 1; else delete ST.sel[id]; part('st-table', stTable()); },
        selPage: function (el) { var list = stList().slice(ST.page * PER, ST.page * PER + PER); list.forEach(function (u) { if (el.checked) ST.sel[u.id] = 1; else delete ST.sel[u.id]; }); part('st-table', stTable()); },
        sbOne: function (el) { var id = el.getAttribute('data-id'); if (el.checked) SB.sel[id] = 1; else delete SB.sel[id]; part('sb-table', sbTable()); },
        sbAll: function (el) { sbList().forEach(function (u) { if (el.checked) SB.sel[u.id] = 1; else delete SB.sel[u.id]; }); part('sb-table', sbTable()); },
        uLifetime: function (el) { var on = el.checked; uop('setLifetime', { on: on }, function (u) { API.setLifetime(u, on); }, on ? 'صار اشتراكه مفتوح' : 'صار شهري لمدة 30 يوم').then(function (r) { if (r === false) el.checked = !on; }); },
        uFreeze: function (el) {
            var u = curU();
            if (el.checked) {
                confirmBox({ title: 'تجميد اشتراك ' + esc(u.name), text: 'الأيام الباقية (' + daysLeftTxt(u) + ') تنحفظ، والأدوات المدفوعة توقف لين تفك التجميد.', input: 'السبب (اختياري)', ph: 'سفر', ok: 'تجميد' }).then(function (v) {
                    if (!v) { el.checked = false; return; } var why = v === true ? '' : v;
                    uop('freeze', { why: why }, function (x) { API.freeze(x, why); }, 'انجمّد');
                });
            } else uop('unfreeze', {}, function (x) { API.unfreeze(x); }, 'انفك التجميد');
        },
        uTester: function (el) { var on = el.checked; uop('setTester', { on: on }, function (u) { API.setTester(u, on); }, on ? 'انعطت صلاحية التجربة' : 'انسحبت صلاحية التجربة'); },
        cfgPreview: function (el) { cfgToggle('previewAdminOnly', el, 'قفل فيرو للأدمن والتجربة', 'فتح فيرو للكل'); },
        cfgReq: function (el) { cfgToggle('requireSub', el, 'شغّل الاشتراك الإلزامي', 'طفّى الاشتراك الإلزامي'); },
        cfgAnn: function (el) { cfgToggle('announce', el, 'أظهر الإعلان', 'أخفى الإعلان'); }
    };
    document.addEventListener('click', function (e) {
        var g = e.target.closest('[data-go]');
        if (g) { e.preventDefault(); if (g.getAttribute('data-subtab')) SB.tab = g.getAttribute('data-subtab'); go(g.getAttribute('data-go')); return; }
        var a = e.target.closest('[data-a]');
        if (a && !a.disabled && ACT[a.getAttribute('data-a')]) { e.preventDefault(); ACT[a.getAttribute('data-a')](a, e); return; }
        if (e.target.closest('[data-stop]') || e.target.closest('input,select,textarea,label')) return;
        var uu = e.target.closest('[data-user]');
        if (uu) { e.preventDefault(); modalStack.slice().forEach(function (m) { m.close(); }); openUser(uu.getAttribute('data-user'), uu.getAttribute('data-tab')); }
    });
    document.addEventListener('change', function (e) { var c = e.target.closest('[data-c]'); if (c && CHG[c.getAttribute('data-c')]) CHG[c.getAttribute('data-c')](c, e); });
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); $('#gs-in').focus(); $('#gs-in').select(); return; }
        if (e.key === 'Escape') { if (modalStack.length) modalStack[modalStack.length - 1].close(); else if (!$('#gs-res').hidden) closeGs(); else if (DR.uid) closeDrawer(); }
        if (e.key === 'Enter' && e.target.matches('.a-card[data-a]')) { e.preventDefault(); e.target.click(); }
    });
    $('#dr-bg').addEventListener('click', closeDrawer);

    /* =========================================================
       البحث الشامل (الهيدر): ستريمرز + أكواد + أصول
       ========================================================= */
    var gsSel = 0, gsItems = [];
    function closeGs() { $('#gs-res').hidden = true; }
    function hl(text, q) { var t = String(text), i = t.toLowerCase().indexOf(q.toLowerCase()); if (!q || i < 0) return esc(t); return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); }
    function runGs() {
        var raw = $('#gs-in').value.trim(), q = raw.replace(/^@/, ''), box = $('#gs-res');
        if (!q) { closeGs(); return; }
        var us = S.users.filter(function (u) { return matchUser(u, raw); }).sort(function (a, b) { return (String(b.id) === q) - (String(a.id) === q) || (b.tiktok === q.toLowerCase()) - (a.tiktok === q.toLowerCase()); }).slice(0, 7);
        var cs = S.codes.filter(function (c) { return c.code.indexOf(q.toUpperCase()) >= 0; }).slice(0, 4);
        var as = S.assets.filter(function (a) { return normAr(a.name).indexOf(normAr(q)) >= 0; }).slice(0, 4);
        gsItems = [];
        var h = '';
        if (us.length) { h += '<div class="grp">الستريمرز</div>'; us.forEach(function (u) { gsItems.push({ k: 'u', v: u.id }); h += '<button type="button" class="it" data-gi="' + (gsItems.length - 1) + '">' + avatar(u) + '<span class="m"><b>' + hl(u.name, q) + ' <span class="mut2 num">#' + hl(String(u.id), q) + '</span></b><small class="ltr">@' + hl(u.tiktok, q) + ' · ' + hl(u.email, q) + '</small></span>' + subTag(u) + '</button>'; }); }
        if (cs.length) { h += '<div class="grp">الأكواد</div>'; cs.forEach(function (c) { gsItems.push({ k: 'c', v: c.code }); h += '<button type="button" class="it" data-gi="' + (gsItems.length - 1) + '"><span class="ic" style="color:var(--lav)">' + ic('ticket', ' style="width:20px;height:20px"') + '</span><span class="m"><b class="code-out">' + hl(c.code, q.toUpperCase()) + '</b><small>' + codeTypeName(c.type) + ' · ' + codeValue(c) + ' · ' + c.uses.length + '/' + c.maxUses + '</small></span><span class="tag ' + CODE_ST[codeState(c)][1] + '">' + CODE_ST[codeState(c)][0] + '</span></button>'; }); }
        if (as.length) { h += '<div class="grp">المكتبة</div>'; as.forEach(function (a) { gsItems.push({ k: 'a', v: a.id }); h += '<button type="button" class="it" data-gi="' + (gsItems.length - 1) + '"><span class="ic" style="color:var(--lav)">' + ic(TYPES[a.type][1], ' style="width:20px;height:20px"') + '</span><span class="m"><b>' + esc(a.name) + '</b><small>' + typeName(a.type) + '</small></span><span class="tag ' + A_ST[a.status][1] + '">' + A_ST[a.status][0] + '</span></button>'; }); }
        if (!gsItems.length) h = '<div class="empty">ما لقيت شي لـ«' + esc(raw) + '». جرّب الآيدي أو يوزر تيك توك أو الإيميل.</div>';
        box.innerHTML = h; box.hidden = false; gsSel = 0; markGs();
    }
    function markGs() { $$('#gs-res .it').forEach(function (b, i) { b.classList.toggle('sel', i === gsSel); }); }
    function pickGs(i) {
        var it = gsItems[i]; if (!it) return; closeGs(); $('#gs-in').blur();
        if (it.k === 'u') openUser(it.v);
        else if (it.k === 'c') { CD.q = it.v; CD.f = 'all'; go('codes'); }
        else { var a = S.assets.filter(function (x) { return x.id === it.v; })[0]; go('library'); if (a) assetEditor(a, false); }
    }
    $('#gs-in').addEventListener('input', runGs);
    $('#gs-in').addEventListener('focus', function () { if ($('#gs-in').value.trim()) runGs(); });
    $('#gs-in').addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); gsSel = Math.min(gsItems.length - 1, gsSel + 1); markGs(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); gsSel = Math.max(0, gsSel - 1); markGs(); }
        else if (e.key === 'Enter') { e.preventDefault(); pickGs(gsSel); }
    });
    $('#gs-res').addEventListener('click', function (e) { var b = e.target.closest('[data-gi]'); if (b) pickGs(Number(b.getAttribute('data-gi'))); });
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('#gs')) closeGs(); });

    /* =========================================================
       القائمة: الطي، الجوال، التلميح، لمعة الماوس
       ========================================================= */
    try { if (localStorage.getItem('veyro-admin-mini') === '1') $('#vy-app').classList.add('mini'); } catch (e) { /* ignore */ }
    $('#vy-collapse').addEventListener('click', function () { var on = $('#vy-app').classList.toggle('mini'); try { localStorage.setItem('veyro-admin-mini', on ? '1' : '0'); } catch (e) { /* ignore */ } });
    $('#vy-menu').addEventListener('click', function () { $('#vy-app').classList.add('open'); });
    $('#vy-scrim').addEventListener('click', function () { $('#vy-app').classList.remove('open'); });
    var tip = $('#vy-tip');
    $('#vy-side').addEventListener('pointerover', function (e) {
        var it = e.target.closest('[data-tip]'); if (!it || !$('#vy-app').classList.contains('mini')) { tip.classList.remove('show'); return; }
        var r = it.getBoundingClientRect(); tip.textContent = it.getAttribute('data-tip'); tip.style.left = (r.right + 10) + 'px'; tip.style.top = (r.top + r.height / 2 - 15) + 'px'; tip.classList.add('show');
    });
    $('#vy-side').addEventListener('pointerleave', function () { tip.classList.remove('show'); });
    var glow = $('#vy-glow'), gq = null;
    document.addEventListener('pointermove', function (e) {
        var t = e.target.closest && e.target.closest('.ob-btn,.vy-item');
        if (t) { var r = t.getBoundingClientRect(); t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
        if (!gq) gq = requestAnimationFrame(function () { gq = null; glow.style.setProperty('--gx', e.clientX + 'px'); glow.style.setProperty('--gy', e.clientY + 'px'); });
    }, { passive: true });

    /* تحديث «شغّال الحين» والأوقات كل دقيقة */
    setInterval(function () {
        if (modalStack.length || document.hidden) return;
        var ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
        if (REAL) reload(); else if (cur === 'overview') go(cur);
    }, 60e3);

    window.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (h && h !== cur && VIEWS[h]) go(h); });
    /* =========================================================
       التشغيل: متصل بسيرفر فيرو (بالموقع وفيه تسجيل دخول) أو بيانات تجريبية
       ========================================================= */
    /** يجيب كل البيانات من السيرفر ويعيد الرسم. يرجع Promise<boolean>. */
    function reload() {
        return req('GET', '/api/veyro/admin/snapshot').then(function (d) {
            if (!d.success) { if (d._status === 401 || d._status === 403) gate(d._status === 401 ? 'login' : 'denied'); else toast(errText(d), true); return false; }
            S = adopt(d); ME = d.me; paintMe();
            if (!PAGES.some(function (p) { return p.id === cur; })) cur = 'overview';
            go(cur); if (DR.uid) { if (user(DR.uid)) renderDrawer(); else closeDrawer(); }
            return true;
        }).catch(function () { toast('ما قدرت أوصل لسيرفر فيرو', true); return false; });
    }
    /** روابط ملفات المكتبة من السيرفر نسبية (/api/...) — نكمّلها بعنوان سيرفر فيرو. */
    function adopt(d) {
        (d.assets || []).forEach(function (a) { ['video', 'audio', 'img'].forEach(function (k) { if (a.src && a.src[k] && a.src[k].charAt(0) === '/') a.src[k] = API_BASE + a.src[k]; }); });
        return d;
    }
    function paintMe() {
        var demo = $('#vy-demo');
        if (REAL) { demo.innerHTML = '<i style="background:var(--ok);box-shadow:0 0 8px var(--ok)"></i><span>متصل</span>'; demo.style.color = 'var(--ok)'; demo.style.borderColor = 'rgba(116,214,161,.45)'; demo.title = 'متصل بسيرفر فيرو — التعديلات حقيقية'; }
        if (ME) { var w = $('.vy-me .who'); if (w) w.innerHTML = '<b>' + esc(ME.name) + '</b><small>' + esc(ROLE_NAMES[ME.role] || 'أدمن') + '</small>'; var av = $('.vy-me .av'); if (av) av.textContent = String(ME.name || 'أ').charAt(0); }
    }
    /** شاشة بدل اللوحة: تسجيل الدخول، ما عنده صلاحية، أو السيرفر طايح. */
    function gate(kind) {
        var T = {
            login: ['سجّل دخولك', 'افتح فيرو وسجّل دخولك بحساب ألعاب أيمن، وارجع لهالصفحة.', '<a class="ob-btn primary" href="index.html">تسجيل الدخول</a>'],
            denied: ['ما عندك صلاحية', 'لوحة تحكم فيرو للأدمن والمشرفين بس. لو المفروض عندك صلاحية، تواصل مع مالك المنصة.', '<a class="ob-btn primary" href="index.html">رجوع لفيرو</a>'],
            error: ['ما قدرت أوصل لسيرفر فيرو', 'تأكد من الاتصال وجرّب مرة ثانية. لو المشكلة مستمرة، شيك على خدمة veyro-api بـRender.', '<button type="button" class="ob-btn primary" id="gate-retry">جرّب مرة ثانية</button>']
        }[kind];
        $('#pg-title').textContent = T[0]; $('#pg-sub').textContent = '';
        $('#vy-nav').innerHTML = '';
        $('#vy-scroll').innerHTML = '<div class="wrap"><section class="card glass" style="max-width:560px;margin:40px auto;text-align:center;padding:34px"><h2 style="font-family:var(--f-head);margin:0 0 10px">' + T[0] + '</h2><p class="mut" style="line-height:1.9;margin:0 0 20px">' + T[1] + '</p><div class="quick" style="justify-content:center">' + T[2] + '<a class="ob-btn ghost" href="?demo#overview">جرّب المعاينة التجريبية</a></div></section></div>';
        var r = $('#gate-retry'); if (r) r.addEventListener('click', boot);
    }
    function boot() {
        var qs = new URLSearchParams(location.search), h = location.hostname;
        var local = h === 'localhost' || h === '127.0.0.1';
        var site = local || /(^|\.)aymngames\.online$/.test(h);
        if (qs.has('demo') || !site) { REAL = false; go(location.hash.slice(1) || 'overview'); return; }
        REAL = true;
        API_BASE = (qs.get('api') || window.AGP_VEYRO_API || (local ? 'http://localhost:8788' : 'https://veyro-api-7mj3.onrender.com')).replace(/\/+$/, '');
        try { TOKEN = (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { TOKEN = null; }
        paintMe();
        if (!TOKEN) { gate('login'); return; }
        $('#vy-scroll').innerHTML = '<div class="wrap"><div class="empty-s" style="margin-top:40px">يحمّل بيانات فيرو…</div></div>';
        cur = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
        req('GET', '/api/veyro/admin/snapshot').then(function (d) {
            if (d._status === 401) return gate('login');
            if (d._status === 403) return gate('denied');
            if (!d.success) return gate('error');
            S = adopt(d); ME = d.me; paintMe(); go(cur);
        }).catch(function () { gate('error'); });
    }
    boot();
})();
