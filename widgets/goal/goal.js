/*
 * goal.js — تشغيل «أداة الهدف» داخل OBS (Browser Source) أو أي متصفح.
 *
 * الإعدادات كلها من الرابط (?type=follower&goal=500&...) — الجدول الكامل
 * بـ README.md. مصادر البيانات (provider):
 *   - streamelements : اتصال حي بـ socket StreamElements بتوكن JWT.
 *   - streamlabs     : اتصال حي بـ socket Streamlabs بـ Socket API Token.
 *   - server         : يستقبل التحديثات من server.js (ويب هوك/API) عبر SSE.
 *   - none           : قيمة ثابتة من الرابط (مع ?demo=1 للتجربة).
 *
 * ملاحظة: الأداة مستقلة عن نواة المنصة (AGP) عمداً، عشان تشتغل على أي
 * استضافة أو من جهاز المذيع مباشرة بدون باقي ملفات الموقع.
 */
(function (Core) {
    'use strict';

    var q = new URLSearchParams(window.location.search);
    function param(name, def) { var v = q.get(name); return (v === null || v === '') ? def : v; }
    function flag(name, def) { var v = q.get(name); return v === null ? def : !/^(0|false|no|off)$/i.test(v); }
    function log() { if (cfg.debug && window.console) { console.log.apply(console, ['[goal]'].concat([].slice.call(arguments))); } }

    var type = String(param('type', 'follower')).toLowerCase();
    if (!Core.TYPES[type]) { type = 'custom'; }
    var defs = Core.TYPES[type];

    var cfg = {
        type: type,
        title: param('title', defs.title),
        goal: Core.num(param('goal', 100)),
        start: Core.num(param('start', 0)),
        prefix: param('prefix', defs.prefix),
        unit: param('unit', defs.unit),
        provider: String(param('provider', 'none')).toLowerCase(),
        token: param('token', ''),
        server: String(param('server', '')).replace(/\/+$/, ''),
        key: param('key', 'default'),
        persist: flag('persist', true),
        test: flag('test', false),
        demo: flag('demo', false),
        debug: flag('debug', false),
        foot: flag('foot', true),
        doneText: param('done', 'اكتمل الهدف 🎉'),
        leftLabel: param('leftLabel', 'المتبقي:'),
        lastLabel: param('lastLabel', 'آخر دعم:'),
        locale: param('locale', 'en-US'),
        eio: param('eio', '3')
    };

    /* ===== المظهر من الرابط (ثيم، اتجاه، ألوان سريعة) ===== */
    var rootEl = document.documentElement;
    if (param('theme', '')) { rootEl.setAttribute('data-theme', param('theme')); }
    // شكل الأداة: bar (شريط، الافتراضي) أو heart (قلب يتعبّى بالماء).
    rootEl.setAttribute('data-style', param('style', 'bar') === 'heart' ? 'heart' : 'bar');
    if (param('dir', '')) { rootEl.setAttribute('dir', param('dir') === 'ltr' ? 'ltr' : 'rtl'); }
    var COLOR_PARAMS = { accent: '--goal-accent', fill1: '--goal-fill-start', fill2: '--goal-fill-end',
        text: '--goal-text', track: '--goal-track', bg: '--goal-bg',
        water: ['--goal-water-start', '--goal-water-end'], water1: '--goal-water-start',
        water2: '--goal-water-end', heartStroke: '--goal-heart-stroke', heartEmpty: '--goal-heart-empty' };
    Object.keys(COLOR_PARAMS).forEach(function (k) {
        var v = q.get(k);
        if (!v) { return; }
        var color = /^[0-9a-f]{3,8}$/i.test(v) ? '#' + v : v;
        [].concat(COLOR_PARAMS[k]).forEach(function (name) { rootEl.style.setProperty(name, color); });
    });
    if (param('width', '')) { rootEl.style.setProperty('--goal-width', Core.num(param('width')) + 'px'); }
    if (param('scale', '')) { rootEl.style.setProperty('--goal-scale', String(Core.num(param('scale')) || 1)); }

    var $ = function (id) { return document.getElementById(id); };
    var el = { box: $('goal'), title: $('goal-title'), percent: $('goal-percent'), fill: $('goal-fill'),
        barText: $('goal-bar-text'), foot: $('goal-foot'), remaining: $('goal-remaining'),
        last: $('goal-last'), status: $('goal-status'), water: $('goal-water'),
        heartPct: $('goal-heart-pct'), heartValue: $('goal-heart-value') };
    if (cfg.debug) { el.box.classList.add('is-debug'); }
    if (!cfg.foot) { el.foot.style.display = 'none'; }

    /* ===== الحالة + الحفظ المحلي (يبقى الرقم بعد إعادة تحميل OBS) ===== */
    var STORE_KEY = 'goal-widget:' + cfg.key + ':' + cfg.type;
    var state = { current: cfg.start, goal: cfg.goal, title: cfg.title, lastName: '' };
    var shown = state.current;   // الرقم المعروض حالياً (للعدّ التدريجي)

    function load() {
        if (!cfg.persist || cfg.provider === 'server') { return; }
        try {
            if (flag('reset', false)) { localStorage.removeItem(STORE_KEY); return; }
            var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            // لو المذيع غيّر start بالرابط نعتبرها بداية جديدة ونتجاهل المحفوظ.
            if (saved && saved.start === cfg.start && typeof saved.current === 'number') {
                state.current = saved.current;
                state.lastName = saved.lastName || '';
                shown = state.current;
            }
        } catch (e) { /* التخزين ممنوع: نكمل بدون حفظ */ }
    }
    function save() {
        if (!cfg.persist || cfg.provider === 'server') { return; }
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ start: cfg.start,
            current: state.current, lastName: state.lastName })); } catch (e) { /* تجاهل */ }
    }

    /* ===== الرسم ===== */
    function money(n) { return cfg.prefix + Core.format(n, cfg.locale); }
    function withUnit(text) { return cfg.unit ? text + ' ' + cfg.unit : text; }

    function paint(value) {
        var pct = Core.percent(value, state.goal);
        var rawPct = state.goal > 0 ? (value / state.goal) * 100 : 0;
        var done = state.goal > 0 && state.current >= state.goal;
        el.title.textContent = state.title;
        el.fill.style.width = pct.toFixed(2) + '%';
        el.percent.textContent = done ? cfg.doneText : Math.floor(rawPct) + '%';
        el.barText.innerHTML = '';
        var bdi = document.createElement('bdi');
        bdi.textContent = withUnit(money(value) + ' / ' + money(state.goal));
        el.barText.appendChild(bdi);
        el.heartPct.textContent = Math.floor(rawPct) + '%';
        el.heartValue.textContent = bdi.textContent;
        var left = Math.max(0, state.goal - value);
        el.remaining.textContent = done ? '' : cfg.leftLabel + ' ' + withUnit(money(left));
        el.last.textContent = state.lastName ? cfg.lastLabel + ' ' + state.lastName : '';
        el.box.classList.toggle('is-complete', done);
    }

    /*
     * مستوى الماء بالقلب: سطح الموجة عند y بإحداثيات الرسم (قاع القلب 170،
     * وأعلاه 0)، فـ 0% ← 180 (مخفي تحت) و100% ← -10 (يغطي القلب كامل).
     */
    function setWater(pct) {
        el.water.style.transform = 'translateY(' + (180 - pct * 1.9).toFixed(2) + 'px)';
    }

    /* العدّ التدريجي للرقم من القيمة القديمة للجديدة. */
    var tweenId = 0;
    function render() {
        var from = shown, to = state.current, t0 = performance.now(), dur = 900, id = ++tweenId;
        el.fill.style.width = Core.percent(to, state.goal).toFixed(2) + '%';
        setWater(Core.percent(to, state.goal));
        if (from === to) { paint(to); return; }
        (function step(now) {
            if (id !== tweenId) { return; }
            var k = Math.min(1, (now - t0) / dur);
            var e = 1 - Math.pow(1 - k, 3);
            shown = k >= 1 ? to : from + (to - from) * e;
            paint(shown);
            if (k < 1) { requestAnimationFrame(step); }
        }(t0));
    }

    function pop(amount) {
        var b = document.createElement('div');
        b.className = 'goal-pop';
        b.dir = 'ltr';
        b.textContent = '+' + money(amount);
        el.box.appendChild(b);
        el.box.classList.remove('is-bump');
        void el.box.offsetWidth;   // إعادة تشغيل الحركة
        el.box.classList.add('is-bump');
        setTimeout(function () { b.remove(); }, 1900);
    }

    /* ===== استقبال الأحداث ===== */
    var seen = [];
    function isDuplicate(id) {
        if (!id) { return false; }
        if (seen.indexOf(id) !== -1) { return true; }
        seen.push(id);
        if (seen.length > 300) { seen.shift(); }
        return false;
    }

    function addAmount(amount, name) {
        if (!(amount > 0)) { return; }
        state.current = Math.round((state.current + amount) * 100) / 100;
        if (name) { state.lastName = name; }
        save();
        pop(amount);
        render();
    }

    function handle(provider, raw, isTest) {
        if (isTest && !cfg.test) { log('تجاهل حدث تجربة (فعّل ?test=1 لحسابها)', raw); return; }
        Core.normalize(provider, raw, isTest).forEach(function (ev) {
            if (isDuplicate(ev.id)) { return; }
            var add = Core.contribution(cfg.type, ev);
            log('حدث', ev, '← يضيف', add);
            addAmount(add, ev.name);
        });
    }

    function setStatus(s) { el.status.setAttribute('data-state', s); }

    /*
     * عميل Socket.IO مصغّر فوق WebSocket عادي — يكفي لاستقبال الأحداث من
     * StreamElements وStreamlabs بدون تحميل مكتبة خارجية. يدعم Engine.IO
     * الإصدار 3 (الافتراضي) و4 (?eio=4) مع إعادة الاتصال التلقائي.
     */
    function socketIO(baseUrl, query, handlers) {
        var ws, pingTimer, retry = 0, closed = false;
        function url() {
            var u = baseUrl.replace(/^http/, 'ws') + '/socket.io/?EIO=' + cfg.eio + '&transport=websocket';
            return query ? u + '&' + query : u;
        }
        function send(event, data) {
            if (ws && ws.readyState === 1) { ws.send('42' + JSON.stringify([event, data])); }
        }
        function connect() {
            setStatus('connecting');
            ws = new WebSocket(url());
            ws.onmessage = function (m) {
                var s = String(m.data), t = s.charAt(0);
                if (t === '0') {                       // open
                    var info = {};
                    try { info = JSON.parse(s.slice(1)); } catch (e) { /* تجاهل */ }
                    clearInterval(pingTimer);
                    if (cfg.eio === '3') {
                        pingTimer = setInterval(function () { if (ws.readyState === 1) { ws.send('2'); } },
                            info.pingInterval || 25000);
                    } else {
                        ws.send('40');
                    }
                } else if (t === '2') {                // ping من السيرفر (EIO4)
                    ws.send('3');
                } else if (s.slice(0, 2) === '40') {    // connected
                    retry = 0;
                    if (handlers.connect) { handlers.connect(send); }
                } else if (s.slice(0, 2) === '42') {    // event
                    try {
                        var arr = JSON.parse(s.slice(2));
                        if (handlers[arr[0]]) { handlers[arr[0]](arr[1], send); }
                    } catch (e) { log('رسالة غير مفهومة', s); }
                } else if (s.slice(0, 2) === '44') {    // error
                    setStatus('error');
                    log('خطأ من السيرفر', s);
                }
            };
            ws.onclose = function () {
                clearInterval(pingTimer);
                if (closed) { return; }
                setStatus('error');
                var wait = Math.min(30000, 1000 * Math.pow(2, retry++));
                log('انقطع الاتصال، إعادة المحاولة بعد', wait, 'ms');
                setTimeout(connect, wait);
            };
            ws.onerror = function () { setStatus('error'); };
        }
        connect();
        return { close: function () { closed = true; if (ws) { ws.close(); } } };
    }

    function startStreamElements() {
        if (!cfg.token) { log('provider=streamelements يحتاج ?token= (JWT)'); setStatus('error'); return; }
        socketIO('https://realtime.streamelements.com', '', {
            connect: function (send) { send('authenticate', { method: 'jwt', token: cfg.token }); },
            authenticated: function () { setStatus('online'); log('StreamElements: تم التوثيق'); },
            unauthorized: function (d) { setStatus('error'); log('StreamElements: التوكن مرفوض', d); },
            'event': function (d) { handle('streamelements', d, false); },
            'event:test': function (d) { handle('streamelements', d, true); }
        });
    }

    function startStreamlabs() {
        if (!cfg.token) { log('provider=streamlabs يحتاج ?token= (Socket API Token)'); setStatus('error'); return; }
        socketIO('https://sockets.streamlabs.com', 'token=' + encodeURIComponent(cfg.token), {
            connect: function () { setStatus('online'); log('Streamlabs: متصل'); },
            'event': function (d) {
                // أحداث «Test» من لوحة Streamlabs ما لها علامة واضحة، فتنحسب عادي.
                handle('streamlabs', d, false);
            }
        });
    }

    /* وضع السيرفر: server.js هو مصدر الحقيقة، ويرسل الحالة كاملة عبر SSE. */
    function startServer() {
        if (!window.EventSource) { setStatus('error'); return; }
        var base = cfg.server || '';
        var src = new EventSource(base + '/api/goal/' + encodeURIComponent(cfg.key) + '/stream');
        var first = true;
        src.onopen = function () { setStatus('online'); };
        src.onerror = function () { setStatus('error'); };   // EventSource يعيد الاتصال تلقائياً
        src.onmessage = function (m) {
            var s;
            try { s = JSON.parse(m.data); } catch (e) { return; }
            var prev = state.current;
            if (typeof s.current === 'number') { state.current = s.current; }
            if (s.goal > 0) { state.goal = s.goal; }
            if (s.title) { state.title = s.title; }
            // نوع الهدف المحفوظ بالسيرفر يحدد الوحدة والعملة، إلا لو الرابط حددها.
            if (s.type && Core.TYPES[s.type] && !q.get('type')) {
                if (!q.get('unit')) { cfg.unit = Core.TYPES[s.type].unit; }
                if (!q.get('prefix')) { cfg.prefix = Core.TYPES[s.type].prefix; }
                if (!q.get('title') && !s.title) { state.title = Core.TYPES[s.type].title; }
            }
            if (s.lastName) { state.lastName = s.lastName; }
            if (!first && state.current > prev) { pop(state.current - prev); }
            if (first) { shown = state.current; }
            first = false;
            render();
        };
    }

    /* وضع التجربة: يضيف أرقام عشوائية كل ثانيتين ونص. */
    function startDemo() {
        var names = ['سارة', 'Ahmed', 'نورة', 'خالد', 'Lina', 'فهد'];
        setInterval(function () {
            var amount = type === 'tip' ? Math.round(Math.random() * 2000) / 100 + 1
                : type === 'cheer' ? Math.ceil(Math.random() * 5) * 100 : 1;
            if (state.current >= state.goal) { state.current = cfg.start; shown = state.current; }
            addAmount(amount, names[Math.floor(Math.random() * names.length)]);
        }, 2500);
    }

    load();
    render();
    switch (cfg.provider) {
        case 'streamelements': case 'se': startStreamElements(); break;
        case 'streamlabs': case 'sl': startStreamlabs(); break;
        case 'server': startServer(); break;
        default: setStatus('online');
    }
    if (cfg.demo) { startDemo(); }
}(window.GoalCore));
