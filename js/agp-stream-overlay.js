/**
 * AGP STREAM OVERLAY — أوفرلي شاشة البث (نصوص + توب المكبّسين).
 *
 * موجّه أساساً لمذيعين الآيباد اللي يبثون من تطبيق تيك توك بمشاركة الشاشة:
 * ما عندهم OBS، فالأوفرلي يترسم فوق الصفحة نفسها كطبقة ما تستقبل لمس
 * (pointer-events:none)، ويطلع بالبث مع اللعبة.
 *
 * - زر صغير عائم (يتسحب لأي مكان) يفتح محرر بملء الشاشة: إضافة نص، إضافة
 *   «توب المكبّسين»، والسحب بالإصبع لأي مكان بالشاشة.
 * - التصميم محفوظ بـlocalStorage (agp:stream-overlay) — نفس الأصل لكل
 *   الألعاب، فيبقى ثابت لما المذيع يغيّر اللعبة.
 * - قوالب شاشات (TEMPLATES): المذيع يختار جهازه واتجاهه، والمحرر يرسم إطار
 *   بنفس النسبة يرتب داخله. المواقع نِسب من الإطار (0..1 لمنتصف العنصر)
 *   وتنحفظ لكل قالب+اتجاه لحاله (pos['ipad-air-p'])، والأحجام نسبة من أصغر
 *   ضلع بالإطار. وقت البث الإطار ياخذ اتجاه الجهاز الفعلي ويتوسّط الشاشة
 *   (يملاها لو الجهاز نفس القالب).
 * - توب المكبّسين من GET /api/stream/session-stats?sections=likers:N
 *   (backend/stats/live-session-stats.js — نفس مصدر زر «إحصائيات البث»)،
 *   كل POLL_MS والصفحة ظاهرة فقط. آخر نتيجة بـsessionStorage عشان ما يفضى
 *   العنصر لحظة الانتقال بين الألعاب.
 * - الحساب نفسه يصير بالسيرفر من اتصال البث. داخل اللعبة اتصال اللعبة يكفي؛
 *   بالصفحات اللي ما فيها لعبة متصلة (مكتبة الألعاب، أو لعبة قبل ما تتصل)
 *   الأوفرلي يفتح اتصال إحصائيات فقط (source 'overlay' بـws-server.js) بنفس
 *   الحساب المحفوظ من زر «اتصل بالبث» بالمكتبة (agp:agp-stream-connection)،
 *   ويقفله أول ما تتصل اللعبة — فيه دايماً اتصال واحد يحسب.
 *
 * - النص: خطوط عربية من Google Fonts (FONTS — تتحمّل بس اللي انستخدم، وكلها
 *   لما تنفتح قائمة الخطوط بالمحرر)، تأثيرات (TEXT_STYLES)، وحركة متكررة
 *   (ANIMS) بثلاث سرعات. التأثير والحركة على عنصر داخلي (.agp-so-tx) عشان
 *   ما يتعارض transform الحركة مع تمركز العنصر.
 *
 * النصوص تنعرض بـtextContent فقط. مستقل عن window.AymanGamesPlatform عشان
 * يشتغل بأي صفحة (مكتبة الألعاب، اللوبي، اللعبة).
 *
 * AGPStreamOverlay.open()
 */
(function () {
    'use strict';

    if (window.AGPStreamOverlay) return;

    var STORE_KEY = 'agp:stream-overlay';
    var LIKERS_CACHE_KEY = 'agp:stream-overlay:likers';
    var CONN_KEY = 'agp:agp-stream-connection'; // نفس مفتاح زر «اتصل بالبث» بمكتبة الألعاب
    var BACKEND_WS_URL = 'wss://project-testing-akds.onrender.com';
    var LINK_CHECK_MS = 5000;
    var GAME_GRACE_MS = 15000; // اللعبة غير متصلة كذا متواصل → الأوفرلي يتصل بداله
    var POLL_MS = 15000;
    var Z = 2147483000;
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,-apple-system,sans-serif';
    var COLORS = ['#ffffff', '#ffd54a', '#ff4d6d', '#4dd8ff', '#7cff6b', '#c58bff', '#111111'];
    // b = أثقل وزن متوفر بالخط (للخطوط اللي وزنها واحد = 400)
    var FONTS = [
        { key: 'plex', family: 'IBM Plex Sans Arabic', label: 'بلكس', b: 700 },
        { key: 'cairo', family: 'Cairo', label: 'القاهرة', b: 900 },
        { key: 'tajawal', family: 'Tajawal', label: 'تجوال', b: 900 },
        { key: 'almarai', family: 'Almarai', label: 'المراعي', b: 800 },
        { key: 'changa', family: 'Changa', label: 'تشانجا', b: 800 },
        { key: 'alexandria', family: 'Alexandria', label: 'الإسكندرية', b: 900 },
        { key: 'kufam', family: 'Kufam', label: 'كوفام', b: 900 },
        { key: 'notokufi', family: 'Noto Kufi Arabic', label: 'نوتو كوفي', b: 900 },
        { key: 'readex', family: 'Readex Pro', label: 'ريدكس', b: 700 },
        { key: 'mada', family: 'Mada', label: 'مدى', b: 900 },
        { key: 'baloo', family: 'Baloo Bhaijaan 2', label: 'بالو', b: 800 },
        { key: 'lemonada', family: 'Lemonada', label: 'ليمونادة', b: 700 },
        { key: 'marhey', family: 'Marhey', label: 'مرحي', b: 700 },
        { key: 'elmessiri', family: 'El Messiri', label: 'المسيري', b: 700 },
        { key: 'reemkufi', family: 'Reem Kufi', label: 'ريم كوفي', b: 700 },
        { key: 'lalezar', family: 'Lalezar', label: 'لاله زار', b: 400 },
        { key: 'rakkas', family: 'Rakkas', label: 'رقّاص', b: 400 },
        { key: 'jomhuria', family: 'Jomhuria', label: 'جمهورية', b: 400 },
        { key: 'blaka', family: 'Blaka', label: 'بلاكا', b: 400 },
        { key: 'katibeh', family: 'Katibeh', label: 'كاتبة', b: 400 },
        { key: 'vibes', family: 'Vibes', label: 'فايبز', b: 400 },
        { key: 'mirza', family: 'Mirza', label: 'ميرزا', b: 700 },
        { key: 'harmattan', family: 'Harmattan', label: 'هرمتان', b: 700 },
        { key: 'amiri', family: 'Amiri', label: 'أميري', b: 700 },
        { key: 'arefruqaa', family: 'Aref Ruqaa', label: 'رقعة', b: 700 },
        { key: 'gulzar', family: 'Gulzar', label: 'نستعليق', b: 400 }
    ];
    var TEXT_STYLES = [
        { key: 'outline', label: 'حدود' },
        { key: 'shadow', label: 'ظل' },
        { key: 'pill', label: 'خلفية' },
        { key: 'glass', label: 'زجاجي' },
        { key: 'neon', label: 'نيون' },
        { key: 'fire', label: 'نار' },
        { key: 'gradient', label: 'تدرّج' },
        { key: 'gold', label: 'ذهبي' },
        { key: 'rainbow', label: 'قوس قزح' },
        { key: '3d', label: 'ثلاثي الأبعاد' },
        { key: 'hollow', label: 'مفرّغ' },
        { key: 'plain', label: 'بدون' }
    ];
    // d = مدة الدورة بالسرعة العادية (ثواني)
    var ANIMS = [
        { key: 'none', label: 'بدون', d: 0 },
        { key: 'pulse', label: 'نبض', d: 1.4 },
        { key: 'heartbeat', label: 'نبضة قلب', d: 1.3 },
        { key: 'bounce', label: 'قفز', d: 1.1 },
        { key: 'float', label: 'طفو', d: 3 },
        { key: 'swing', label: 'تمايل', d: 2 },
        { key: 'shake', label: 'اهتزاز', d: 0.8 },
        { key: 'zoom', label: 'زووم', d: 2.4 },
        { key: 'blink', label: 'وميض', d: 1.2 },
        { key: 'glow', label: 'توهّج', d: 1.8 },
        { key: 'hue', label: 'تلوّن', d: 4 }
    ];
    var SPEEDS = [{ label: 'بطيء', value: 1.8 }, { label: 'عادي', value: 1 }, { label: 'سريع', value: 0.55 }];
    var DEFAULT_FONT = 'plex';
    var LIKERS_TOPS = [1, 3, 5];
    // w×h بالوضع الأفقي (نقاط CSS)؛ العمودي = نفس الأبعاد مقلوبة
    var TEMPLATES = [
        { key: 'auto', label: 'شاشة جهازي', sub: 'يملأ الشاشة الحالية' },
        { key: 'ipad-air', label: 'آيباد Air / Pro 11 / 10.9', w: 1180, h: 820 },
        { key: 'ipad', label: 'آيباد 4:3 (Pro 12.9 والقديم)', w: 1024, h: 768 },
        { key: 'ipad-mini', label: 'آيباد mini', w: 1133, h: 744 },
        { key: 'phone', label: 'جوال', w: 844, h: 390 },
        { key: 'pc', label: 'كمبيوتر / OBS (16:9)', w: 1920, h: 1080 }
    ];

    /* ---------------- الحالة والتخزين ---------------- */

    function defaults() { return { v: 2, enabled: true, launcher: null, template: null, editOrient: null, items: [] }; }

    function load() {
        try {
            var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (s && Array.isArray(s.items)) {
                // v1: المواقع كانت لكل اتجاه بس (pos.l / pos.p) = قالب «شاشة جهازي»
                if (s.v !== 2) {
                    s.items.forEach(function (it) {
                        var pos = it.pos || {};
                        it.pos = {};
                        if (pos.l) it.pos['auto-l'] = pos.l;
                        if (pos.p) it.pos['auto-p'] = pos.p;
                    });
                    s.v = 2;
                    if (!s.template && s.items.length) s.template = 'auto';
                }
                return s;
            }
        } catch (e) { /* تخزين غير متاح أو تالف */ }
        return defaults();
    }

    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }

    var state = load();
    var editing = false;
    var selectedId = null;
    var drag = null;
    var nodes = {};
    var likers = loadLikersCache();
    var pollTimer = null;
    var inflight = false;

    var pickerOpen = false;
    var textTab = 'text';
    var loadedFonts = {};
    var frameRect = null;

    var linkStatus;
    var layer, stage, launcher, backdrop, bar, panel, picker, enabledBtn, templateBtn, orientPills;

    function uid() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function find(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    /* طول الشاشة الثابت: بـSafari (آيباد/جوال) شريط العنوان يختفي ويرجع مع
     * التمرير فيتغيّر innerHeight، ولو حسبنا عليه تتزحزح العناصر مع كل
     * تمرير. 100vh هناك = الطول الكامل وما يتغيّر، فنقيسه بعنصر ثابت. */
    var probe = null;
    function viewW() { return window.innerWidth; }
    function viewH() {
        if (!probe && document.body) {
            probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
            document.body.appendChild(probe);
        }
        return (probe && probe.offsetHeight) || window.innerHeight;
    }
    function orient() { return viewW() >= viewH() ? 'l' : 'p'; }
    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

    function tpl(key) {
        for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].key === key) return TEMPLATES[i];
        return TEMPLATES[0];
    }

    /** الاتجاه المعروض: بالمحرر اللي اختاره المذيع للقالب، وغير كذا اتجاه الجهاز. */
    function viewOrient() {
        var t = tpl(state.template);
        return (editing && t.w && state.editOrient) ? state.editOrient : orient();
    }

    function curKey() { return tpl(state.template).key + '-' + viewOrient(); }

    /** إطار القالب بالبكسل داخل الشاشة (contain + بالوسط). */
    function computeFrame() {
        var W = viewW(), H = viewH();
        var t = tpl(state.template);
        if (!t.w) return { x: 0, y: 0, w: W, h: H };
        var o = viewOrient();
        var r = o === 'l' ? t.w / t.h : t.h / t.w;
        var m = editing ? 14 : 0;
        // بالمحرر الإطار يبدأ تحت شريط الأدوات عشان ما يغطي عليه
        var top = (editing && bar && bar.style.display !== 'none') ? bar.getBoundingClientRect().bottom + 10 : m;
        var aw = W - m * 2, ah = H - top - m;
        var w = aw, h = aw / r;
        if (h > ah) { h = ah; w = ah * r; }
        return { x: (W - w) / 2, y: top + (ah - h) / 2, w: w, h: h };
    }

    /** موقع العنصر بالقالب الحالي — أول مرة ينسخ من نفس القالب بالاتجاه
     *  الثاني، وإلا من أي قالب بنفس الاتجاه، وإلا أي موقع محفوظ. */
    function posOf(it, key) {
        it.pos = it.pos || {};
        if (!it.pos[key]) {
            var keys = Object.keys(it.pos);
            var o = key.slice(-1), base = key.slice(0, -1);
            var src = it.pos[base + (o === 'l' ? 'p' : 'l')] ||
                it.pos[keys.filter(function (k) { return k.slice(-1) === o; })[0]] ||
                it.pos[keys[0]];
            it.pos[key] = src ? { x: src.x, y: src.y } : { x: 0.5, y: 0.5 };
        }
        return it.pos[key];
    }

    /* ---------------- الخطوط ---------------- */

    function fontOf(key) {
        for (var i = 0; i < FONTS.length; i++) if (FONTS[i].key === key) return FONTS[i];
        return FONTS[0];
    }

    /** يحمّل الخط من Google Fonts مرة وحدة (رابط لكل خط عشان خط غلط ما يكسر الباقي). */
    function loadFont(f) {
        if (loadedFonts[f.key]) return;
        loadedFonts[f.key] = true;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + f.family.replace(/ /g, '+') +
            (f.b > 400 ? ':wght@400;' + f.b : '') + '&display=swap';
        document.head.appendChild(l);
    }

    function fontStack(f) { return '"' + f.family + '",' + FONT; }

    /* ---------------- التكبيسات ---------------- */

    function loadLikersCache() {
        try {
            var c = JSON.parse(sessionStorage.getItem(LIKERS_CACHE_KEY) || 'null');
            if (c && Array.isArray(c.rows)) return { status: 'ok', rows: c.rows };
        } catch (e) { /* ignore */ }
        return { status: 'idle', rows: [] };
    }

    function apiBase() { return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com'; }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }

    /* ---------------- اتصال الإحصائيات (بدون لعبة متصلة) ---------------- */

    var link = { ws: null, state: 'off', msg: '', retry: 0, timer: null, username: null, stopFor: null };
    var gameDownSince = null;

    function savedConn() {
        try {
            var d = JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
            return d && typeof d.username === 'string' && d.username ? d : null;
        } catch (e) { return null; }
    }

    /** نفس اليوزر لو اتصل من جديد من المكتبة يتغيّر connectedAt — فيرجع يحاول. */
    function connId(c) { return c.username + '|' + (c.connectedAt || ''); }

    function gameConnector() {
        var A = window.AymanGamesPlatform;
        return (A && A.services && A.services.TikTokService && A.streamConnector) ? A.streamConnector : null;
    }

    function gameConnected() {
        var sc = gameConnector();
        return Boolean(sc && sc.getStatus('tiktok') === 'connected');
    }

    function linkWanted() {
        var c = savedConn();
        if (!likersItems().length || !(editing || state.enabled) || !token() || !c) return false;
        if (link.stopFor === connId(c)) return false; // رُفض أو انتهى البث — نستنى اتصال جديد من المكتبة
        if (gameConnected()) { gameDownSince = null; return false; }
        if (gameConnector()) {
            // صفحة لعبة: نعطيها مهلة تتصل (أو ترجع تتصل) قبل ما نفتح اتصال ثاني
            if (!gameDownSince) gameDownSince = Date.now();
            if (Date.now() - gameDownSince < GAME_GRACE_MS) return link.ws !== null;
        }
        return true;
    }

    function closeLink() {
        if (link.timer) { clearTimeout(link.timer); link.timer = null; }
        if (link.ws) { var ws = link.ws; link.ws = null; try { ws.close(); } catch (e) { /* ignore */ } }
        link.state = 'off';
    }

    function scheduleLink() {
        if (link.timer) return;
        var d = Math.min(5000 * Math.pow(2, link.retry), 60000);
        link.retry++;
        link.timer = setTimeout(function () { link.timer = null; syncLink(); }, d);
    }

    function openLink(c) {
        var ws;
        try { ws = new WebSocket(BACKEND_WS_URL); } catch (e) { link.state = 'error'; scheduleLink(); return; }
        link.ws = ws;
        link.username = c.username;
        link.state = 'connecting';
        ws.onopen = function () {
            ws.send(JSON.stringify({
                type: 'connect',
                payload: { platform: 'tiktok', username: c.username, followersOnly: false, source: 'overlay', page: location.pathname, authToken: token() },
                timestamp: Date.now()
            }));
        };
        ws.onmessage = function (e) {
            var env;
            try { env = JSON.parse(e.data); } catch (err) { return; }
            if (!env || env.type !== 'status' || !env.payload || link.ws !== ws) return;
            var st = env.payload.status, reason = env.payload.reason;
            if (st === 'connected') {
                link.state = 'connected';
                link.retry = 0;
                setTimeout(fetchLikers, 2500);
            } else if (st === 'error' || st === 'disconnected') {
                // reason = منع (حساب غير مربوط/مختلف) أو انتهاء البث: ما نعيد المحاولة لنفس اليوزر
                link.state = reason === 'stream_ended' ? 'ended' : (reason ? 'denied' : 'error');
                link.msg = env.payload.message || '';
                if (reason) link.stopFor = connId(c);
                try { ws.close(); } catch (err) { /* ignore */ }
            } else {
                link.state = 'connecting';
            }
            syncLinkUi();
        };
        ws.onclose = function () {
            if (link.ws !== ws) return;
            link.ws = null;
            if (link.state === 'connected' || link.state === 'connecting') link.state = 'error';
            if (linkWanted()) scheduleLink();
            syncLinkUi();
        };
    }

    function syncLink() {
        var c = savedConn();
        if (c && link.stopFor && link.stopFor !== connId(c)) link.stopFor = null;
        var want = linkWanted();
        if (want && link.ws && link.username !== c.username) closeLink();
        if (want && !link.ws && !link.timer) openLink(c);
        else if (!want && (link.ws || link.timer)) closeLink();
        syncLinkUi();
    }

    /** حالة حساب التوب بكلمات للمذيع (شريط المحرر + العنصر لما يكون فاضي). */
    function linkText() {
        if (!token()) return 'سجّل دخول بحسابك عشان يطلع التوب';
        if (!savedConn()) return 'اضغط «اتصل بالبث» بمكتبة الألعاب عشان تنحسب التكبيسات';
        if (gameConnected()) return '● متصل بالبث من اللعبة — التكبيسات تنحسب';
        if (link.state === 'connected') return '● متصل بالبث — التكبيسات تنحسب';
        if (link.state === 'denied') return link.msg || 'الاتصال بالبث مرفوض';
        if (link.state === 'ended') return 'البث انتهى — اتصل من جديد من مكتبة الألعاب';
        if (link.state === 'error') return 'انقطع الاتصال بالبث — نعيد المحاولة…';
        return 'جاري الاتصال بالبث…';
    }

    function syncLinkUi() {
        if (linkStatus) {
            linkStatus.style.display = likersItems().length ? '' : 'none';
            linkStatus.textContent = 'توب المكبّسين: ' + linkText();
            linkStatus.classList.toggle('ok', gameConnected() || link.state === 'connected');
        }
        if (editing && !likers.rows.length) paintLikers();
    }

    function likersItems() { return state.items.filter(function (it) { return it.type === 'likers'; }); }

    function fetchLikers() {
        if (inflight || document.visibilityState === 'hidden') return;
        var t = token();
        if (!t) { likers.status = 'login'; paintLikers(); return; }
        var n = 1;
        likersItems().forEach(function (it) { n = Math.max(n, Number(it.top) || 3); });
        inflight = true;
        fetch(apiBase() + '/api/stream/session-stats?sections=likers:' + n, { headers: { 'Authorization': 'Bearer ' + t } })
            .then(function (res) { return res.json(); })
            .then(function (d) {
                if (!d || !d.success) {
                    likers.status = d && d.error === 'tiktok_not_linked' ? 'tiktok' : 'error';
                    return;
                }
                likers.status = 'ok';
                likers.rows = (d.stats && d.stats.sections && d.stats.sections.likers) || [];
                try { sessionStorage.setItem(LIKERS_CACHE_KEY, JSON.stringify({ rows: likers.rows })); } catch (e) { /* ignore */ }
            })
            .catch(function () { likers.status = 'error'; }) // نخلي آخر قائمة ظاهرة
            .then(function () { inflight = false; paintLikers(); });
    }

    function syncPolling() {
        var need = likersItems().length > 0 && (editing || state.enabled);
        if (need && !pollTimer) {
            fetchLikers();
            pollTimer = setInterval(fetchLikers, POLL_MS);
        } else if (!need && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function emptyMessage() {
        if (!editing) return 'بانتظار التكبيسات…';
        if (likers.status === 'tiktok') return 'اربط حساب تيك توك بحسابك أولاً';
        var t = linkText();
        return t.charAt(0) === '●' ? 'بانتظار التكبيسات…' : t;
    }

    var CROWN = '<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14h20l1.5-11-6 4.5L12 0 6.5 7.5.5 3z" fill="currentColor"/></svg>';
    var SAMPLE_ROWS = [
        { name: 'المكبّس الأول', count: 12400 }, { name: 'المكبّس الثاني', count: 8100 },
        { name: 'المكبّس الثالث', count: 4600 }, { name: 'الرابع', count: 2100 }, { name: 'الخامس', count: 900 }
    ];

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /** صورة المكبّس بحلقة لون مركزه (أو أول حرف من اسمه). */
    function avatar(r) {
        var wrap = el('span', 'agp-so-av');
        if (typeof r.avatar === 'string' && /^data:image\//.test(r.avatar)) {
            var img = document.createElement('img');
            img.src = r.avatar;
            img.alt = '';
            img.draggable = false;
            wrap.appendChild(img);
        } else {
            wrap.appendChild(el('span', 'agp-so-av-i', String(r.name || r.username || '?').charAt(0)));
        }
        return wrap;
    }

    function rkClass(i) { return ' rk' + (i < 3 ? i + 1 : 'n'); }
    function nameOf(r) { return r.name || r.username || ''; }
    function countEl(r) { return el('span', 'agp-so-count', fmt(r.count) + ' ❤'); }

    function podium(rows) {
        var box = el('div', 'agp-so-podium');
        // RTL: أول عنصر يمين — الثاني يمين والأول بالوسط والثالث يسار
        [1, 0, 2].forEach(function (i) {
            var r = rows[i];
            if (!r) return;
            var col = el('div', 'agp-so-pcol' + rkClass(i));
            if (i === 0) { var c = el('span', 'agp-so-crown'); c.innerHTML = CROWN; col.appendChild(c); }
            col.appendChild(avatar(r));
            col.appendChild(el('span', 'agp-so-name', nameOf(r)));
            col.appendChild(countEl(r));
            col.appendChild(el('span', 'agp-so-step', String(i + 1)));
            box.appendChild(col);
        });
        var frag = document.createDocumentFragment();
        frag.appendChild(box);
        if (rows.length > 3) frag.appendChild(medals(rows.slice(3), 3));
        return frag;
    }

    function medals(rows, offset) {
        var box = el('div', 'agp-so-medals');
        rows.forEach(function (r, k) {
            var i = k + (offset || 0);
            var row = el('div', 'agp-so-mrow' + rkClass(i));
            row.appendChild(el('span', 'agp-so-medal', String(i + 1)));
            row.appendChild(avatar(r));
            row.appendChild(el('span', 'agp-so-name', nameOf(r)));
            row.appendChild(countEl(r));
            box.appendChild(row);
        });
        return box;
    }

    function cards(rows) {
        var box = el('div', 'agp-so-cards');
        rows.forEach(function (r, i) {
            var c = el('div', 'agp-so-card' + rkClass(i));
            var a = avatar(r);
            a.appendChild(el('span', 'agp-so-badge', String(i + 1)));
            c.appendChild(a);
            c.appendChild(el('span', 'agp-so-name', nameOf(r)));
            c.appendChild(countEl(r));
            box.appendChild(c);
        });
        return box;
    }

    function minimal(rows) {
        var box = el('div', 'agp-so-minimal');
        rows.forEach(function (r, i) {
            var row = el('div', 'agp-so-nrow' + rkClass(i));
            row.appendChild(el('span', 'agp-so-medal', String(i + 1)));
            row.appendChild(el('span', 'agp-so-name', nameOf(r)));
            row.appendChild(countEl(r));
            box.appendChild(row);
        });
        return box;
    }

    var DESIGNS = [
        { key: 'podium', label: 'منصة تتويج', build: podium },
        { key: 'medals', label: 'ميداليات', build: medals },
        { key: 'cards', label: 'بطاقات', build: cards },
        { key: 'minimal', label: 'بسيط', build: minimal }
    ];

    function fillLikers(node, it) {
        var d = DESIGNS.filter(function (x) { return x.key === it.design; })[0] || DESIGNS[0];
        node.textContent = '';
        node.className = node.className.replace(/(^|\s)d-\w+/g, '') + ' d-' + d.key;
        if (it.title) node.appendChild(el('div', 'agp-so-likers-title', it.title));
        var rows = likers.rows.slice(0, Number(it.top) || 3);
        if (!rows.length && !editing) {
            node.appendChild(el('div', 'agp-so-empty', emptyMessage()));
            return;
        }
        // بالمحرر بدون بيانات: أسماء تجريبية باهتة عشان يشوف التصميم وهو يرتّب
        var ghost = !rows.length;
        var body = el('div', 'agp-so-lbody' + (ghost ? ' agp-so-ghost' : ''));
        body.appendChild(d.build(ghost ? SAMPLE_ROWS.slice(0, Number(it.top) || 3) : rows));
        node.appendChild(body);
        if (ghost) node.appendChild(el('div', 'agp-so-empty', emptyMessage()));
    }

    function paintLikers() {
        var key = curKey();
        likersItems().forEach(function (it) {
            if (!nodes[it.id]) return;
            fillLikers(nodes[it.id], it);
            place(nodes[it.id], posOf(it, key)); // الحجم يتغيّر مع عدد الأسماء
        });
    }

    /* ---------------- الرسم ---------------- */

    function buildItem(it, F) {
        var n = document.createElement('div');
        n.className = 'agp-so-item';
        n.setAttribute('data-id', it.id);
        n.style.fontSize = ((Number(it.size) || 5) * Math.min(F.w, F.h) / 100) + 'px';
        if (it.type === 'text') {
            var f = fontOf(it.font || DEFAULT_FONT);
            loadFont(f);
            n.className += ' agp-so-text';
            var tx = document.createElement('span');
            tx.className = 'agp-so-tx s-' + (it.style || 'outline');
            tx.style.color = it.color || '#fff';
            tx.style.setProperty('--agp-so-c', it.color || '#fff');
            tx.style.fontFamily = fontStack(f);
            tx.style.fontWeight = String(f.b);
            // الحركة على غلاف منفصل عن التأثير، عشان ما تلغي حركة «قوس قزح» ولا فلاتر التأثير
            var mv = document.createElement('span');
            mv.className = 'agp-so-mv';
            mv.style.setProperty('--agp-so-c', it.color || '#fff');
            var an = ANIMS.filter(function (a) { return a.key === it.anim; })[0];
            if (an && an.d) {
                mv.className += ' a-' + an.key;
                mv.style.animationDuration = (an.d * (Number(it.speed) || 1)) + 's';
            }
            tx.textContent = it.text || ' ';
            mv.appendChild(tx);
            n.appendChild(mv);
        } else if (it.type === 'likers') {
            n.className += ' agp-so-likers';
            n.style.setProperty('--agp-so-c', it.color || '#ffd54a');
            fillLikers(n, it);
        }
        return n;
    }

    function render() {
        if (!layer) return;
        var F = frameRect = computeFrame();
        var key = curKey();
        var t = tpl(state.template);
        stage.textContent = '';
        nodes = {};
        layer.classList.toggle('agp-so-editing', editing);
        layer.classList.toggle('agp-so-framed', editing && Boolean(t.w));
        layer.style.display = (editing || state.enabled) ? '' : 'none';
        stage.style.left = F.x + 'px';
        stage.style.top = F.y + 'px';
        stage.style.width = F.w + 'px';
        stage.style.height = F.h + 'px';
        if (editing && t.w) {
            var tag = document.createElement('div');
            tag.className = 'agp-so-frametag';
            tag.textContent = t.label + ' · ' + (viewOrient() === 'l' ? 'أفقي' : 'عمودي');
            stage.appendChild(tag);
        }
        state.items.forEach(function (it) {
            var n = buildItem(it, F);
            if (editing && it.id === selectedId) n.classList.add('agp-so-selected');
            stage.appendChild(n);
            nodes[it.id] = n;
            place(n, posOf(it, key));
        });
        if (bar) syncBar();
        launcher.style.display = editing ? 'none' : '';
        placeLauncher();
        syncPolling();
        syncLink();
    }

    /** يحط العنصر بموقعه داخل الإطار، ويزحزحه بصرياً بس لو طلع جزء منه برّاه. */
    function place(n, p) {
        var W = frameRect.w, H = frameRect.h;
        var hw = n.offsetWidth / 2 + 4, hh = n.offsetHeight / 2 + 4;
        n.style.left = (hw * 2 >= W ? W / 2 : clamp(p.x * W, hw, W - hw)) + 'px';
        n.style.top = (hh * 2 >= H ? H / 2 : clamp(p.y * H, hh, H - hh)) + 'px';
    }

    function markSelected() {
        Object.keys(nodes).forEach(function (id) { nodes[id].classList.toggle('agp-so-selected', id === selectedId); });
    }

    /* ---------------- المحرر ---------------- */

    function btn(label, cls, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'agp-so-btn' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    /** صف إعداد: العنوان يمين والتحكم يسار (قاعدة واجهات الإعدادات بـCLAUDE.md). */
    function row(label, control) {
        var r = document.createElement('div');
        r.className = 'agp-so-prow';
        var l = document.createElement('span');
        l.className = 'agp-so-plabel';
        l.textContent = label;
        r.appendChild(l);
        r.appendChild(control);
        return r;
    }

    function pills(options, current, onPick) {
        var g = document.createElement('div');
        g.className = 'agp-so-pills';
        options.forEach(function (opt) {
            var b = btn(opt.label, opt.value === current ? 'on' : '', function () { onPick(opt.value); });
            g.appendChild(b);
        });
        return g;
    }

    function swatches(current, onPick) {
        var g = document.createElement('div');
        g.className = 'agp-so-swatches';
        COLORS.forEach(function (c) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'agp-so-swatch' + (c === current ? ' on' : '');
            b.style.background = c;
            b.setAttribute('aria-label', c);
            b.addEventListener('click', function () { onPick(c); });
            g.appendChild(b);
        });
        return g;
    }

    function slider(min, max, step, value, onInput) {
        var s = document.createElement('input');
        s.type = 'range';
        s.min = min; s.max = max; s.step = step; s.value = value;
        s.className = 'agp-so-range';
        s.addEventListener('input', function () { onInput(Number(s.value)); });
        return s;
    }

    function update(it, key, value, repaintPanel) {
        it[key] = value;
        save();
        render();
        if (repaintPanel) renderPanel();
    }

    function renderPanel() {
        panel.textContent = '';
        var it = selectedId && find(selectedId);
        panel.style.display = it ? '' : 'none';
        if (!it) return;

        if (it.type === 'text') {
            var tabs = [{ label: 'النص', value: 'text' }, { label: 'الخط', value: 'font' }, { label: 'التأثير', value: 'fx' }, { label: 'الحركة', value: 'anim' }];
            var tabBar = pills(tabs, textTab, function (v) { textTab = v; renderPanel(); });
            tabBar.className += ' agp-so-tabs';
            panel.appendChild(tabBar);
            if (textTab === 'text') {
                var ta = document.createElement('textarea');
                ta.className = 'agp-so-input';
                ta.rows = 2;
                ta.maxLength = 200;
                ta.value = it.text || '';
                ta.addEventListener('input', function () { update(it, 'text', ta.value); });
                panel.appendChild(row('النص', ta));
                panel.appendChild(row('الحجم', slider(2, 16, 0.5, it.size, function (v) { update(it, 'size', v); })));
                panel.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
            } else if (textTab === 'font') {
                var grid = document.createElement('div');
                grid.className = 'agp-so-fgrid';
                var cur = it.font || DEFAULT_FONT;
                FONTS.forEach(function (f) {
                    loadFont(f);
                    var b = btn('', 'agp-so-fbtn' + (f.key === cur ? ' on' : ''), function () { update(it, 'font', f.key, true); });
                    var sample = document.createElement('span');
                    sample.className = 'agp-so-fsample';
                    sample.style.fontFamily = fontStack(f);
                    sample.style.fontWeight = String(f.b);
                    sample.textContent = 'حياكم';
                    var name = document.createElement('span');
                    name.className = 'agp-so-fname';
                    name.textContent = f.label;
                    b.appendChild(sample);
                    b.appendChild(name);
                    grid.appendChild(b);
                });
                panel.appendChild(grid);
            } else if (textTab === 'fx') {
                var fx = pills(TEXT_STYLES.map(function (x) { return { label: x.label, value: x.key }; }), it.style || 'outline', function (v) { update(it, 'style', v, true); });
                fx.className += ' agp-so-wrap';
                panel.appendChild(fx);
            } else {
                var am = pills(ANIMS.map(function (x) { return { label: x.label, value: x.key }; }), it.anim || 'none', function (v) { update(it, 'anim', v, true); });
                am.className += ' agp-so-wrap';
                panel.appendChild(am);
                if (it.anim && it.anim !== 'none') {
                    panel.appendChild(row('السرعة', pills(SPEEDS, Number(it.speed) || 1, function (v) { update(it, 'speed', v, true); })));
                }
            }
        } else if (it.type === 'likers') {
            var ti = document.createElement('input');
            ti.type = 'text';
            ti.className = 'agp-so-input';
            ti.maxLength = 40;
            ti.value = it.title || '';
            ti.addEventListener('input', function () { update(it, 'title', ti.value); });
            panel.appendChild(row('التصميم', pills(DESIGNS.map(function (x) { return { label: x.label, value: x.key }; }), it.design || 'podium', function (v) { update(it, 'design', v, true); })));
            panel.appendChild(row('العنوان', ti));
            panel.appendChild(row('عدد الأشخاص', pills(LIKERS_TOPS.map(function (n) { return { label: String(n), value: n }; }), Number(it.top), function (v) { update(it, 'top', v, true); fetchLikers(); })));
            panel.appendChild(row('الحجم', slider(2, 7, 0.1, it.size, function (v) { update(it, 'size', v); })));
            panel.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
        }

        var actions = document.createElement('div');
        actions.className = 'agp-so-pactions';
        actions.appendChild(btn('حذف', 'danger', function () {
            state.items = state.items.filter(function (x) { return x.id !== it.id; });
            selectedId = null;
            save(); render(); renderPanel();
        }));
        actions.appendChild(btn('تم', 'primary', function () { selectedId = null; markSelected(); renderPanel(); }));
        panel.appendChild(actions);
    }

    function addItem(it) {
        state.items.push(it);
        selectedId = it.id;
        save(); render(); renderPanel();
    }

    function addText() {
        var it = { id: uid(), type: 'text', text: 'اكتب نصك هنا', size: 6, color: '#ffffff', style: 'outline', font: DEFAULT_FONT, anim: 'none', speed: 1, pos: {} };
        textTab = 'text';
        it.pos[curKey()] = { x: 0.5, y: 0.4 };
        addItem(it);
        var ta = panel.querySelector('textarea');
        if (ta) { ta.focus(); ta.select(); }
    }

    function addLikers() {
        var existing = likersItems()[0];
        if (existing) { selectedId = existing.id; markSelected(); renderPanel(); return; }
        var it = { id: uid(), type: 'likers', design: 'podium', title: 'توب المكبّسين', top: 3, size: 3, color: '#ffd54a', pos: {} };
        it.pos[curKey()] = { x: 0.8, y: 0.3 };
        addItem(it);
    }

    function syncBar() {
        enabledBtn.textContent = state.enabled ? 'ظاهر بالشاشة ✓' : 'مخفي من الشاشة';
        enabledBtn.classList.toggle('on', state.enabled);
        var t = tpl(state.template);
        templateBtn.textContent = '▦ القالب: ' + t.label;
        orientPills.style.display = t.w ? '' : 'none';
        var o = viewOrient();
        Array.prototype.forEach.call(orientPills.children, function (b) { b.classList.toggle('on', b.getAttribute('data-o') === o); });
    }

    function setEditOrient(o) {
        state.editOrient = o;
        save(); render();
    }

    /* ---------------- اختيار القالب ---------------- */

    /** رسم مصغّر بنسبة القالب (أفقي) داخل كرت الاختيار. */
    function thumb(t) {
        var box = document.createElement('span');
        box.className = 'agp-so-thumb';
        var r = document.createElement('span');
        var tw = t.w || window.innerWidth, th = t.h || window.innerHeight;
        if (tw < th) { var x = tw; tw = th; th = x; }
        r.style.width = '56px';
        r.style.height = Math.round(56 * th / tw) + 'px';
        box.appendChild(r);
        return box;
    }

    function renderPicker() {
        picker.textContent = '';
        var chosen = state.template || 'auto';
        var o = state.editOrient || orient();

        var h = document.createElement('div');
        h.className = 'agp-so-ptitle';
        h.textContent = 'اختر قالب شاشتك';
        var sub = document.createElement('div');
        sub.className = 'agp-so-hint';
        sub.textContent = 'اختر الجهاز اللي تبث منه، وبعدها رتّب أدواتك عليه — كل قالب ينحفظ ترتيبه لحاله';
        picker.appendChild(h);
        picker.appendChild(sub);

        var grid = document.createElement('div');
        grid.className = 'agp-so-tgrid';
        TEMPLATES.forEach(function (t) {
            var c = document.createElement('button');
            c.type = 'button';
            c.className = 'agp-so-tcard' + (t.key === chosen ? ' on' : '');
            c.appendChild(thumb(t));
            var name = document.createElement('span');
            name.className = 'agp-so-tname';
            name.textContent = t.label;
            var dim = document.createElement('span');
            dim.className = 'agp-so-tdim';
            dim.textContent = t.w ? (t.w + '×' + t.h) : t.sub;
            c.appendChild(name);
            c.appendChild(dim);
            c.addEventListener('click', function () { chosen = t.key; renderPickerSel(); });
            grid.appendChild(c);
        });
        picker.appendChild(grid);

        var oRow = row('الاتجاه', pills([{ label: 'عمودي', value: 'p' }, { label: 'أفقي', value: 'l' }], o, function (v) { o = v; renderPickerSel(); }));
        picker.appendChild(oRow);

        var actions = document.createElement('div');
        actions.className = 'agp-so-pactions';
        if (state.template) actions.appendChild(btn('رجوع', '', function () { closePicker(); }));
        else actions.appendChild(btn('إغلاق', '', function () { closePicker(); close(); }));
        actions.appendChild(btn('ابدأ الترتيب', 'primary', function () {
            state.template = chosen;
            state.editOrient = o;
            save();
            closePicker();
            render();
        }));
        picker.appendChild(actions);

        function renderPickerSel() {
            Array.prototype.forEach.call(grid.children, function (c, i) { c.classList.toggle('on', TEMPLATES[i].key === chosen); });
            Array.prototype.forEach.call(oRow.querySelectorAll('.agp-so-btn'), function (b, i) { b.classList.toggle('on', (i === 0 ? 'p' : 'l') === o); });
            oRow.style.display = tpl(chosen).w ? '' : 'none';
        }
        renderPickerSel();
    }

    function openPicker() {
        pickerOpen = true;
        selectedId = null;
        markSelected();
        renderPanel();
        renderPicker();
        picker.style.display = '';
        bar.style.display = 'none';
    }

    function closePicker() {
        pickerOpen = false;
        picker.style.display = 'none';
        if (editing) bar.style.display = '';
        render();
    }

    function open() {
        ensureDom();
        editing = true;
        selectedId = null;
        backdrop.style.display = bar.style.display = '';
        if (!state.editOrient) state.editOrient = orient();
        render();
        renderPanel();
        fetchLikers();
        if (!state.template) openPicker();
    }

    function close() {
        editing = false;
        selectedId = null;
        drag = null;
        if (pickerOpen) closePicker();
        backdrop.style.display = bar.style.display = panel.style.display = 'none';
        render();
    }

    /* ---------------- السحب ---------------- */

    function onLayerDown(e) {
        if (!editing) return;
        var el = e.target.closest && e.target.closest('.agp-so-item');
        if (!el) return;
        e.preventDefault();
        var id = el.getAttribute('data-id');
        var it = find(id);
        if (!it) return;
        if (selectedId !== id) { selectedId = id; textTab = 'text'; markSelected(); renderPanel(); }
        // من المكان الظاهر فعلاً (ممكن يكون متزحزح عن المحفوظ عند حافة الإطار)
        var r = el.getBoundingClientRect(), F = frameRect;
        var px = (r.left + r.width / 2 - F.x) / F.w, py = (r.top + r.height / 2 - F.y) / F.h;
        drag = { kind: 'item', it: it, el: el, pid: e.pointerId, sx: e.clientX, sy: e.clientY, px: px, py: py, key: curKey() };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    function onLauncherDown(e) {
        e.preventDefault();
        var r = launcher.getBoundingClientRect();
        drag = { kind: 'launcher', pid: e.pointerId, sx: e.clientX, sy: e.clientY, px: r.left, py: r.top, moved: false };
        try { launcher.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    function onMove(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (drag.kind === 'item') {
            var x = clamp(drag.px + dx / frameRect.w, 0.02, 0.98);
            var y = clamp(drag.py + dy / frameRect.h, 0.02, 0.98);
            drag.it.pos[drag.key] = { x: x, y: y };
            place(drag.el, drag.it.pos[drag.key]);
        } else {
            if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
            if (!drag.moved) return;
            state.launcher = {
                x: clamp((drag.px + dx) / viewW(), 0, 1),
                y: clamp((drag.py + dy) / viewH(), 0, 1)
            };
            placeLauncher();
        }
    }

    function onUp(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var d = drag;
        drag = null;
        if (d.kind === 'launcher' && !d.moved) { open(); return; }
        save();
    }

    function placeLauncher() {
        var size = 44, m = 8;
        var p = state.launcher || { x: 0, y: 1 };
        // الزر نفسه بالجزء الظاهر فعلاً (innerHeight) عشان ما يختفي تحت شريط Safari
        var W = viewW(), H = Math.min(viewH(), window.innerHeight);
        launcher.style.left = clamp(p.x * W, m, W - size - m) + 'px';
        launcher.style.top = clamp(p.y * viewH(), m, H - size - m) + 'px';
    }

    /* ---------------- DOM ---------------- */

    var CSS = [
        '#agp-so-layer{position:fixed;top:0;left:0;right:0;height:100vh;z-index:' + Z + ';pointer-events:none;direction:rtl;font-family:' + FONT + ';overflow:hidden}',
        '#agp-so-layer.agp-so-editing{z-index:' + (Z + 2) + '}',
        '#agp-so-stage{position:absolute}',
        '#agp-so-layer.agp-so-framed #agp-so-stage{outline:2px dashed rgba(77,216,255,.8);box-shadow:0 0 0 100vmax rgba(0,0,0,.45)}',
        '.agp-so-frametag{position:absolute;bottom:6px;right:8px;font-size:12px;font-weight:700;color:#4dd8ff;opacity:.85}',
        '.agp-so-item{position:absolute;transform:translate(-50%,-50%);max-width:96vw;line-height:1.3;user-select:none;-webkit-user-select:none;box-sizing:border-box}',
        '#agp-so-layer.agp-so-editing .agp-so-item{pointer-events:auto;touch-action:none;cursor:grab;outline:2px dashed rgba(255,255,255,.6);outline-offset:6px;border-radius:6px}',
        '#agp-so-layer.agp-so-editing .agp-so-item.agp-so-selected{outline:2px solid #4dd8ff}',
        '.agp-so-text{white-space:pre-wrap;text-align:center;word-break:break-word;width:max-content}',
        '.agp-so-tx{display:inline-block;padding:.05em .12em}',
        '.agp-so-tx.s-shadow{text-shadow:0 .05em .2em rgba(0,0,0,.9)}',
        '.agp-so-tx.s-outline{text-shadow:-.04em -.04em 0 #000,.04em -.04em 0 #000,-.04em .04em 0 #000,.04em .04em 0 #000,0 .06em .15em rgba(0,0,0,.6)}',
        '.agp-so-tx.s-pill{background:rgba(0,0,0,.6);padding:.15em .6em;border-radius:.6em}',
        '.agp-so-tx.s-glass{background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.3);padding:.15em .6em;border-radius:.6em;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);text-shadow:0 .04em .12em rgba(0,0,0,.5)}',
        '.agp-so-tx.s-neon{color:#fff !important;text-shadow:0 0 .04em #fff,0 0 .12em var(--agp-so-c),0 0 .3em var(--agp-so-c),0 0 .6em var(--agp-so-c)}',
        '.agp-so-tx.s-fire{color:#fff6d0 !important;text-shadow:0 0 .06em #fff,0 -.06em .15em #ffd54a,0 -.12em .3em #ff9800,0 -.2em .45em #ff3d00,0 -.3em .7em #b71c1c}',
        '.agp-so-tx.s-gradient{background:linear-gradient(180deg,#fff 10%,var(--agp-so-c) 90%);-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .08em rgba(0,0,0,.7))}',
        '.agp-so-tx.s-gold{background:linear-gradient(180deg,#fff7c9 0%,#ffd54a 40%,#c9871c 60%,#ffe58a 100%);-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .06em rgba(60,30,0,.9))}',
        '.agp-so-tx.s-rainbow{background:linear-gradient(90deg,#ff4d6d,#ffd54a,#7cff6b,#4dd8ff,#c58bff,#ff4d6d);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent !important;filter:drop-shadow(0 .05em .06em rgba(0,0,0,.8));animation:agp-so-rainbow 3s linear infinite}',
        '.agp-so-tx.s-3d{text-shadow:.02em .02em 0 rgba(0,0,0,.55),.04em .04em 0 rgba(0,0,0,.5),.06em .06em 0 rgba(0,0,0,.45),.08em .08em 0 rgba(0,0,0,.4),.1em .1em .12em rgba(0,0,0,.6)}',
        '.agp-so-tx.s-hollow{color:transparent !important;-webkit-text-stroke:.035em var(--agp-so-c);filter:drop-shadow(0 .03em .06em rgba(0,0,0,.8))}',
        '.agp-so-mv{display:inline-block}',
        '.agp-so-mv[class*=" a-"]{animation-iteration-count:infinite;animation-timing-function:ease-in-out;will-change:transform}',
        '.agp-so-mv.a-pulse{animation-name:agp-so-pulse}',
        '.agp-so-mv.a-heartbeat{animation-name:agp-so-heartbeat}',
        '.agp-so-mv.a-bounce{animation-name:agp-so-bounce}',
        '.agp-so-mv.a-float{animation-name:agp-so-float}',
        '.agp-so-mv.a-swing{animation-name:agp-so-swing;transform-origin:50% 0}',
        '.agp-so-mv.a-shake{animation-name:agp-so-shake;animation-timing-function:linear}',
        '.agp-so-mv.a-zoom{animation-name:agp-so-zoom}',
        '.agp-so-mv.a-blink{animation-name:agp-so-blink;animation-timing-function:steps(1,end)}',
        '.agp-so-mv.a-glow{animation-name:agp-so-glow}',
        '.agp-so-mv.a-hue{animation-name:agp-so-hue;animation-timing-function:linear}',
        '@keyframes agp-so-rainbow{to{background-position:-200% 0}}',
        '@keyframes agp-so-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}',
        '@keyframes agp-so-heartbeat{0%,40%,100%{transform:scale(1)}10%,30%{transform:scale(1.12)}20%{transform:scale(1.02)}}',
        '@keyframes agp-so-bounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-.25em)}50%{transform:translateY(0)}65%{transform:translateY(-.1em)}80%{transform:translateY(0)}}',
        '@keyframes agp-so-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-.15em)}}',
        '@keyframes agp-so-swing{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}',
        '@keyframes agp-so-shake{0%,100%{transform:translate(0,0) rotate(0)}20%{transform:translate(-.03em,.02em) rotate(-2deg)}40%{transform:translate(.03em,-.02em) rotate(2deg)}60%{transform:translate(-.02em,-.02em) rotate(-1deg)}80%{transform:translate(.02em,.02em) rotate(1deg)}}',
        '@keyframes agp-so-zoom{0%,100%{transform:scale(.9)}50%{transform:scale(1.15)}}',
        '@keyframes agp-so-blink{0%,100%{opacity:1}50%{opacity:.15}}',
        '@keyframes agp-so-glow{0%,100%{filter:brightness(1) drop-shadow(0 0 0 transparent)}50%{filter:brightness(1.35) drop-shadow(0 0 .2em var(--agp-so-c))}}',
        '@keyframes agp-so-hue{to{filter:hue-rotate(360deg)}}',
        '.agp-so-likers{--agp-so-c:#ffd54a;color:#fff;display:flex;flex-direction:column;align-items:center;gap:.35em;text-shadow:0 .04em .12em rgba(0,0,0,.85)}',
        '.agp-so-likers .rk1{--rk:#ffd54a;--rk2:#e08e0b}',
        '.agp-so-likers .rk2{--rk:#eef2f7;--rk2:#8e9aab}',
        '.agp-so-likers .rk3{--rk:#ffb27a;--rk2:#b25a22}',
        '.agp-so-likers .rkn{--rk:var(--agp-so-c);--rk2:rgba(0,0,0,.4)}',
        '.agp-so-likers-title{font-weight:800;font-size:1.05em;letter-spacing:.02em;padding:0 .8em .1em;color:#fff;background:linear-gradient(90deg,transparent,var(--agp-so-c),transparent) bottom/100% .1em no-repeat}',
        '.agp-so-lbody{display:flex;flex-direction:column;align-items:center;gap:.45em}',
        '.agp-so-ghost{opacity:.5}',
        '.agp-so-empty{text-align:center;font-size:.7em;opacity:.8}',
        '.agp-so-av{position:relative;display:inline-flex;align-items:center;justify-content:center;width:2.2em;height:2.2em;border-radius:50%;flex:none;padding:.12em;box-sizing:border-box;background:linear-gradient(145deg,var(--rk),var(--rk2));box-shadow:0 .1em .35em rgba(0,0,0,.55)}',
        '.agp-so-av img,.agp-so-av-i{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#22243a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.9em}',
        '.agp-so-name{font-weight:700;max-width:8em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.agp-so-count{font-weight:800;color:var(--agp-so-c);direction:ltr;font-size:.85em;white-space:nowrap}',
        '.agp-so-medal{display:inline-flex;align-items:center;justify-content:center;flex:none;width:1.5em;height:1.5em;border-radius:50%;font-weight:900;font-size:.85em;color:#1a1206;text-shadow:none;background:radial-gradient(circle at 35% 30%,#fff8,transparent 45%),linear-gradient(145deg,var(--rk),var(--rk2));box-shadow:0 .08em .25em rgba(0,0,0,.5)}',
        /* منصة تتويج */
        '.agp-so-podium{display:flex;align-items:flex-end;justify-content:center;gap:.4em}',
        '.agp-so-pcol{display:flex;flex-direction:column;align-items:center;gap:.15em;width:5.4em}',
        '.agp-so-pcol .agp-so-name{max-width:5.4em;font-size:.85em}',
        '.agp-so-pcol.rk1 .agp-so-av{width:3.3em;height:3.3em;box-shadow:0 0 .6em rgba(255,213,74,.55),0 .1em .35em rgba(0,0,0,.55)}',
        '.agp-so-pcol.rk2 .agp-so-av,.agp-so-pcol.rk3 .agp-so-av{width:2.6em;height:2.6em}',
        '.agp-so-crown{width:1.5em;color:#ffd54a;filter:drop-shadow(0 .05em .1em rgba(0,0,0,.6));margin-bottom:-.15em}',
        '.agp-so-crown svg{display:block;width:100%;height:auto}',
        '.agp-so-step{margin-top:.25em;width:100%;display:flex;align-items:flex-start;justify-content:center;padding-top:.15em;font-weight:900;font-size:1.3em;color:rgba(0,0,0,.55);text-shadow:0 .04em 0 rgba(255,255,255,.35);border-radius:.3em .3em .1em .1em;background:linear-gradient(180deg,var(--rk),var(--rk2));box-shadow:inset 0 .08em 0 rgba(255,255,255,.45),0 .15em .4em rgba(0,0,0,.45)}',
        '.agp-so-pcol.rk1 .agp-so-step{height:2.1em}',
        '.agp-so-pcol.rk2 .agp-so-step{height:1.5em}',
        '.agp-so-pcol.rk3 .agp-so-step{height:1.1em}',
        /* ميداليات */
        '.agp-so-medals{display:flex;flex-direction:column;gap:.35em;min-width:12em}',
        '.agp-so-mrow{display:flex;align-items:center;gap:.5em;padding:.25em .9em .25em .3em;border-radius:999px;background:rgba(10,12,24,.4);background:linear-gradient(270deg,color-mix(in srgb,var(--rk) 30%,transparent),rgba(10,12,24,.35) 70%,transparent);border-right:.18em solid var(--rk)}',
        '.agp-so-mrow .agp-so-name{flex:1;text-align:right}',
        /* بطاقات */
        '.agp-so-cards{display:flex;align-items:flex-start;justify-content:center;gap:.7em}',
        '.agp-so-card{display:flex;flex-direction:column;align-items:center;gap:.2em;width:5em}',
        '.agp-so-card .agp-so-av{width:3em;height:3em;margin-bottom:.45em}',
        '.agp-so-card .agp-so-name{max-width:5em;font-size:.85em}',
        '.agp-so-badge{position:absolute;bottom:-.25em;left:50%;transform:translateX(-50%);min-width:1.3em;height:1.3em;padding:0 .2em;box-sizing:border-box;border-radius:999px;font-size:.6em;font-weight:900;display:flex;align-items:center;justify-content:center;color:#1a1206;text-shadow:none;background:linear-gradient(145deg,var(--rk),var(--rk2));border:.12em solid #14162a}',
        /* بسيط */
        '.agp-so-minimal{display:flex;flex-direction:column;gap:.25em}',
        '.agp-so-nrow{display:flex;align-items:center;gap:.45em;text-shadow:-.05em -.05em 0 #000,.05em -.05em 0 #000,-.05em .05em 0 #000,.05em .05em 0 #000}',
        '.agp-so-nrow .agp-so-medal{width:1.35em;height:1.35em}',
        '#agp-so-launcher{position:fixed;z-index:' + (Z + 1) + ';width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(15,17,32,.7);color:#fff;display:flex;align-items:center;justify-content:center;opacity:.4;touch-action:none;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;transition:opacity .2s}',
        '#agp-so-launcher:hover,#agp-so-launcher:active{opacity:1}',
        '#agp-so-backdrop{position:fixed;inset:0;z-index:' + (Z + 1) + ';background:rgba(0,0,0,.35);touch-action:none}',
        '.agp-so-ui{position:fixed;z-index:' + (Z + 3) + ';direction:rtl;font-family:' + FONT + ';color:#fff;background:rgba(16,18,34,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}',
        '#agp-so-bar{top:10px;left:50%;transform:translateX(-50%);border-radius:16px;padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;width:max-content;max-width:calc(100vw - 20px);box-sizing:border-box}',
        '.agp-so-hint{font-size:12px;opacity:.7;padding:0 6px;text-align:center}',
        '.agp-so-link{font-size:12px;font-weight:700;text-align:center;color:#ffd54a}',
        '.agp-so-link.ok{color:#7cff6b}',
        '#agp-so-panel{bottom:10px;left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 20px));box-sizing:border-box;border-radius:18px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;max-height:45vh;overflow:auto}',
        '.agp-so-prow{display:flex;justify-content:space-between;align-items:center;gap:12px}',
        '.agp-so-plabel{text-align:right;font-size:14px;font-weight:700;flex:none;opacity:.9}',
        '.agp-so-btn{font:inherit;font-size:14px;font-weight:700;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 14px;cursor:pointer;min-height:40px;-webkit-tap-highlight-color:transparent}',
        '.agp-so-btn.on,.agp-so-btn.primary{background:#4dd8ff;color:#06121c;border-color:#4dd8ff}',
        '.agp-so-btn.danger{background:rgba(255,77,109,.15);border-color:rgba(255,77,109,.5);color:#ff8fa3}',
        '.agp-so-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
        '.agp-so-pills .agp-so-btn{padding:7px 14px;min-height:36px}',
        '.agp-so-swatches{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}',
        '.agp-so-swatch{width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.3);cursor:pointer;padding:0}',
        '.agp-so-swatch.on{border-color:#4dd8ff;box-shadow:0 0 0 3px rgba(77,216,255,.35)}',
        '.agp-so-input{flex:1;min-width:0;font:inherit;font-size:16px;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 10px;direction:rtl;resize:none}',
        '.agp-so-range{flex:1;max-width:260px;accent-color:#4dd8ff}',
        '.agp-so-pactions{display:flex;justify-content:space-between;gap:8px}',
        '.agp-so-tabs{justify-content:stretch;flex-wrap:nowrap;background:rgba(255,255,255,.05);border-radius:999px;padding:3px}',
        '.agp-so-tabs .agp-so-btn{flex:1;border-color:transparent;background:transparent}',
        '.agp-so-tabs .agp-so-btn.on{background:#4dd8ff;color:#06121c}',
        '.agp-so-wrap{justify-content:flex-start}',
        '.agp-so-fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}',
        '.agp-so-fbtn{border-radius:12px;padding:6px 4px;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:0}',
        '.agp-so-fbtn.on{background:rgba(77,216,255,.15);color:#fff;border-color:#4dd8ff}',
        '.agp-so-fsample{font-size:22px;line-height:1.4}',
        '.agp-so-fname{font-size:11px;opacity:.65;font-weight:600}',
        '#agp-so-picker{top:50%;left:50%;transform:translate(-50%,-50%);width:min(620px,calc(100vw - 20px));max-height:calc(100vh - 20px);overflow:auto;box-sizing:border-box;border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:12px}',
        '.agp-so-ptitle{font-size:18px;font-weight:800;text-align:center}',
        '.agp-so-tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}',
        '.agp-so-tcard{font:inherit;color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;-webkit-tap-highlight-color:transparent}',
        '.agp-so-tcard.on{border-color:#4dd8ff;background:rgba(77,216,255,.12);box-shadow:0 0 0 2px rgba(77,216,255,.35)}',
        '.agp-so-thumb{height:44px;display:flex;align-items:center;justify-content:center}',
        '.agp-so-thumb span{display:block;border:2px solid currentColor;border-radius:5px;opacity:.85}',
        '.agp-so-tcard.on .agp-so-thumb{color:#4dd8ff}',
        '.agp-so-tname{font-size:13px;font-weight:700;text-align:center}',
        '.agp-so-tdim{font-size:11px;opacity:.6;direction:ltr}'
    ].join('\n');

    var ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 16 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';

    function ensureDom() {
        if (layer) return;
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        layer = document.createElement('div');
        layer.id = 'agp-so-layer';
        layer.addEventListener('pointerdown', onLayerDown);
        stage = document.createElement('div');
        stage.id = 'agp-so-stage';
        layer.appendChild(stage);

        launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.id = 'agp-so-launcher';
        launcher.setAttribute('aria-label', 'أوفرلي البث');
        launcher.title = 'أوفرلي البث';
        launcher.innerHTML = ICON;
        launcher.addEventListener('pointerdown', onLauncherDown);

        backdrop = document.createElement('div');
        backdrop.id = 'agp-so-backdrop';
        backdrop.style.display = 'none';
        backdrop.addEventListener('pointerdown', function () { selectedId = null; markSelected(); renderPanel(); });

        bar = document.createElement('div');
        bar.id = 'agp-so-bar';
        bar.className = 'agp-so-ui';
        bar.style.display = 'none';
        templateBtn = btn('', '', openPicker);
        bar.appendChild(templateBtn);
        orientPills = pills([{ label: 'عمودي', value: 'p' }, { label: 'أفقي', value: 'l' }], null, setEditOrient);
        orientPills.children[0].setAttribute('data-o', 'p');
        orientPills.children[1].setAttribute('data-o', 'l');
        bar.appendChild(orientPills);
        bar.appendChild(btn('＋ نص', '', addText));
        bar.appendChild(btn('＋ توب المكبّسين', '', addLikers));
        enabledBtn = btn('', '', function () { state.enabled = !state.enabled; save(); syncBar(); });
        bar.appendChild(enabledBtn);
        bar.appendChild(btn('إغلاق', 'primary', close));
        var hint = document.createElement('div');
        hint.className = 'agp-so-hint';
        hint.style.flexBasis = '100%';
        hint.textContent = 'اسحب أي عنصر بإصبعك لأي مكان داخل الإطار · اضغط عليه عشان تعدّله';
        bar.appendChild(hint);
        linkStatus = document.createElement('div');
        linkStatus.className = 'agp-so-link';
        linkStatus.style.flexBasis = '100%';
        bar.appendChild(linkStatus);

        panel = document.createElement('div');
        panel.id = 'agp-so-panel';
        panel.className = 'agp-so-ui';
        panel.style.display = 'none';

        picker = document.createElement('div');
        picker.id = 'agp-so-picker';
        picker.className = 'agp-so-ui';
        picker.style.display = 'none';

        [layer, launcher, backdrop, bar, panel, picker].forEach(function (el) { document.body.appendChild(el); });

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        // نعيد الرسم بس لو المقاس الثابت تغيّر فعلاً (تدوير/تغيير حجم النافذة)،
        // مو لما شريط Safari يختفي ويرجع مع التمرير
        var lastSize = viewW() + 'x' + viewH();
        window.addEventListener('resize', function () {
            var size = viewW() + 'x' + viewH();
            if (drag || size === lastSize) { if (!drag) placeLauncher(); return; }
            lastSize = size;
            render();
        });
        window.addEventListener('keydown', function (e) {
            if (!editing || e.key !== 'Escape') return;
            if (pickerOpen && state.template) closePicker(); else close();
        });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && pollTimer) fetchLikers(); });
        // اتصال/قطع من زر المكتبة، واتصال اللعبة نفسها
        setInterval(syncLink, LINK_CHECK_MS);
        var A = window.AymanGamesPlatform;
        if (A && A.events && typeof A.events.on === 'function') A.events.on('stream:statusChanged', function () { setTimeout(syncLink, 0); });
        // تعديل من تبويب ثاني بنفس الجهاز
        window.addEventListener('storage', function (e) {
            if (e.key === CONN_KEY) { syncLink(); return; }
            if (e.key !== STORE_KEY || editing) return;
            state = load();
            render();
        });
    }

    function init() {
        if (!document.body) return;
        ensureDom();
        render();
    }

    window.AGPStreamOverlay = { open: open, close: close };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
