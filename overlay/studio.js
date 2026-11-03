/**
 * VEYRO — «شاشات البث» (overlay/index.html): محرر شاشات لـOBS وTikTok LIVE Studio
 * بهوية Veyro (من منظومة ألعاب أيمن). المذيع يسوي أكثر من شاشة، يرتّب فوق كل وحدة
 * الأدوات اللي يبيها، وينسخ رابطها (overlay/live.html?k=<رمز>) ويحطه بتطبيق البث.
 *
 * - يسار الشاشة قائمة جانبية تنطوي (أيقونات بس) وتنفتح (أيقونة + اسم):
 *   الرئيسية ← الشاشات ← أدوات البث (الأليرتات، التوب، الأهداف، الوعاء، النصوص،
 *   الأيقونات، الأشكال — كل أداة قسم) ← الطبقات ← الرابط والإعدادات.
 *   قسم الأداة يفتح المحرر ولوحته جنب القائمة، وفيها بطاقات بمعاينة حقيقية مصغّرة
 *   — الضغط على البطاقة يضيف الأداة. بالجوال القائمة درج، والأقسام شريط فوق المحرر.
 * - الرسم والبيانات كلها من js/agp-stream-overlay.js (وضع data-agp-screens):
 *   نفس الكود اللي يرسم الرابط، فالمعاينة = اللي يطلع بالبث.
 * - الشاشات بالسيرفر (backend/stats/stream-screens-service.js، /api/screens*)،
 *   وكل تعديل ينحفظ بعد لحظة، والرابط يتحدّث لحاله خلال ثواني.
 * - صفوف الإعدادات: العنوان يمين والتحكم يسار (قاعدة CLAUDE.md).
 */
(function () {
    'use strict';

    var O = window.AGPStreamOverlay;
    if (!O) return;

    var LAST_KEY = 'agp:obs-studio:last';
    var TEMPLATE = 'pc'; // 1920×1080 (أفقي) / 1080×1920 (عمودي)

    var app = document.getElementById('vy-app');
    var navEl = document.getElementById('vy-nav');
    var mtabs = document.getElementById('ob-mtabs');
    var homeBody = document.getElementById('vy-home-body');
    var screensBody = document.getElementById('vy-screens-body');
    var userEl = document.getElementById('vy-user');
    var tipEl = document.getElementById('vy-tip');
    var mtitle = document.getElementById('vy-mtitle');
    var body = document.getElementById('ob-body');
    var panel = document.getElementById('ob-panel');
    var stage = document.getElementById('ob-stage');
    var frame = document.getElementById('ob-frame');
    var zoomBar = document.getElementById('ob-zoom');
    var chipsEl = document.getElementById('ob-screens');
    var savedEl = document.getElementById('ob-saved');
    var statusEl = document.getElementById('ob-status');
    var copyBtn = document.getElementById('ob-copy');
    var gate = document.getElementById('ob-gate');
    var gbox = document.getElementById('ob-gbox');
    var toastEl = document.getElementById('ob-toast');

    var UI = {
        text: '<path d="M4 4h16v4h-2V6h-5v12h2v2H9v-2h2V6H6v2H4z"/>',
        bars: '<path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z"/>',
        shapes: '<path d="M3 3h9v9H3zM17.5 3a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM12 13.5l5.5 8.5h-11z"/>',
        layers: '<path d="M12 2l10 5-10 5L2 7zM4.4 10.2L12 14l7.6-3.8L22 11.5l-10 5-10-5zm0 4.5L12 18.5l7.6-3.8L22 16l-10 5-10-5z"/>',
        gear: '<path d="M10 2h4l.6 3 2.4 1.4 2.9-1 2 3.4-2.3 2a7 7 0 010 2.4l2.3 2-2 3.4-2.9-1-2.4 1.4-.6 3h-4l-.6-3L7 17.8l-2.9 1-2-3.4 2.3-2a7 7 0 010-2.4l-2.3-2 2-3.4 2.9 1L9.4 5zM12 9a3 3 0 100 6 3 3 0 000-6z"/>',
        close: '<path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>',
        home: '<path d="M12 3l9 7.6V21h-6.5v-6h-5v6H3V10.6z"/>',
        screens: '<path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v10h16V6z"/>',
        link: '<path d="M10.6 13.4a1 1 0 001.4 1.4l.1-.1a4 4 0 000-5.6L9.3 6.3a4 4 0 00-5.6 5.6l1.6 1.6 1.4-1.4-1.6-1.6a2 2 0 112.8-2.8l2.8 2.8a2 2 0 010 2.8zm2.8-2.8a1 1 0 00-1.4-1.4l-.1.1a4 4 0 000 5.6l2.8 2.8a4 4 0 005.6-5.6l-1.6-1.6-1.4 1.4 1.6 1.6a2 2 0 11-2.8 2.8l-2.8-2.8a2 2 0 010-2.8z"/>',
        copy: '<path d="M8 3h11a2 2 0 012 2v11h-2V5H8zM4 7h11a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z"/>',
        edit: '<path d="M4 17.3V20h2.7L17.8 8.9l-2.7-2.7zM20.7 6a1 1 0 000-1.4l-1.3-1.3a1 1 0 00-1.4 0l-1.5 1.5 2.7 2.7z"/>',
        dup: '<path d="M7 7V3h14v14h-4v4H3V7zm2 0h8v8h2V5H9zm-4 2v10h10V9z"/>',
        trash: '<path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/>',
        plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>',
        play: '<path d="M8 5v14l11-7z"/>',
        login: '<path d="M10 3h9a2 2 0 012 2v14a2 2 0 01-2 2h-9v-2h9V5h-9zm1.6 4.6L13 6.2 18.8 12 13 17.8l-1.4-1.4 3.4-3.4H3v-2h12z"/>',
        check: '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
        bolt2: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'
    };
    function ic(name) { return O.ICON_SET[name] ? O.ICON_SET[name].p : UI[name]; }
    function svg(paths) { return '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true">' + paths + '</svg>'; }

    var SECTIONS = [
        { key: 'alerts', label: 'الأليرتات', icon: 'bell', title: 'الأليرتات', desc: 'تنبيه يطلع على الشاشة لما يوصلك دعم أو متابعة أو شير أو أحد يدخل البث.' },
        { key: 'tops', label: 'التوب', icon: 'trophy', title: 'التوب', desc: 'أكثر المشاهدين تفاعلاً بالبث، يتحدّث لحاله.' },
        { key: 'goals', label: 'الأهداف', icon: 'bars', title: 'الأهداف والعدّادات', desc: 'هدف يتعبّى قدام المشاهدين، وعدّادات لأرقام البث.' },
        { key: 'jar', label: 'الوعاء', icon: 'gift', title: 'وعاء الهدايا', desc: 'وعاء يتعبّى بصور الهدايا اللي توصلك.' },
        { key: 'text', label: 'النصوص', icon: 'text', title: 'النصوص', desc: 'عناوين وجمل بخطوط عربية وتأثيرات وحركة.' },
        { key: 'icons', label: 'الأيقونات', icon: 'star', title: 'الأيقونات والملصقات', desc: 'أيقونات وإيموجي تزيّن فيها شاشتك.' },
        { key: 'shapes', label: 'الأشكال', icon: 'shapes', title: 'الأشكال', desc: 'لوحات وإطارات وشرائط تحط فوقها الأدوات.' },
        { sep: true },
        { key: 'layers', label: 'الطبقات', icon: 'layers', title: 'الطبقات', desc: 'كل عناصر الشاشة — فوق القائمة = فوق الشاشة.' },
        { key: 'screen', label: 'الرابط والإعدادات', icon: 'gear', title: 'الشاشة والرابط', desc: 'رابط الشاشة لتطبيق البث، والاتجاه والاسم.' }
    ];
    var TOOL_KEYS = ['alerts', 'tops', 'goals', 'jar', 'text', 'icons', 'shapes'];
    var VIEW_TITLES = { home: 'الرئيسية', screens: 'الشاشات', editor: 'أدوات البث' };
    var TYPE_NAMES = { text: 'نص', top: 'توب', goal: 'هدف', counter: 'عدّادات', jar: 'وعاء الهدايا', alert: 'أليرت', icon: 'أيقونة', shape: 'شكل' };
    var TYPE_ICONS = { text: 'text', top: 'trophy', goal: 'bars', counter: 'bars', jar: 'gift', alert: 'bell', icon: 'star', shape: 'shapes' };
    var PREVIEWS = [
        { key: 'checker', label: 'شفاف' },
        { key: 'dark', label: 'داكن' },
        { key: 'light', label: 'فاتح' },
        { key: 'green', label: 'كروما' },
        { key: 'roulette', label: 'لعبة', img: '../elimination-roulette-cover.png' }
    ];

    var TOOLS = {
        alerts: [
            { label: 'كل التنبيهات', sub: 'هدايا ومتابعة وشير بأداة وحدة', type: 'alert', opts: { events: ['gift', 'follow', 'share'] } },
            { label: 'تنبيه الهدايا', sub: 'اسم الداعم والهدية والماس', type: 'alert', opts: { events: ['gift'], color: '#ff5fa8' } },
            { label: 'تنبيه المتابعين', sub: 'لكل متابع جديد', type: 'alert', opts: { events: ['follow'], color: '#4dd8ff' } },
            { label: 'تنبيه الشير', sub: 'لكل من ينشر البث', type: 'alert', opts: { events: ['share'], color: '#c58bff' } },
            { label: 'تنبيه الدخول', sub: 'شريط خفيف لمن يدخل', type: 'alert', opts: { events: ['join'], design: 'banner', color: '#7cff6b' } },
            { label: 'تنبيه كبير', sub: 'بالوسط للهدايا والمتابعة', type: 'alert', opts: { events: ['gift', 'follow'], design: 'pop', color: '#ffd54a' } }
        ],
        tops: [
            { label: 'توب المكبّسين', sub: 'منصة تتويج', type: 'top', opts: { section: 'likers' } },
            { label: 'توب الداعمين', sub: 'بالماس', type: 'top', opts: { section: 'gifters' } },
            { label: 'المتفاعلين', sub: 'أكثر من علّق', type: 'top', opts: { section: 'commenters' } },
            { label: 'توب الشير', sub: 'أكثر من نشر', type: 'top', opts: { section: 'sharers' } },
            { label: 'الداعمين — ميداليات', sub: 'قائمة بالترتيب', type: 'top', opts: { section: 'gifters' }, set: { design: 'medals', top: 5 } },
            { label: 'المكبّسين — بطاقات', sub: 'صور جنب بعض', type: 'top', opts: { section: 'likers' }, set: { design: 'cards' } }
        ],
        goals: [
            { label: 'هدف التكبيسات', sub: 'شريط يتعبّى', type: 'goal' },
            { label: 'هدف الماس', sub: 'دائرة', type: 'goal', set: { metric: 'diamonds', title: 'هدف الماس', target: 1000, design: 'ring', color: '#4dd8ff' } },
            { label: 'هدف المتابعين', sub: 'شريط', type: 'goal', set: { metric: 'follows', title: 'هدف المتابعين', target: 100, color: '#7cff6b' } },
            { label: 'عدّادات كبسولات', sub: 'تكبيسات وماس ومتابعين', type: 'counter' },
            { label: 'أرقام كبيرة', sub: 'للزاوية', type: 'counter', set: { design: 'big', metrics: ['likes', 'diamonds'] } },
            { label: 'قائمة أرقام', sub: 'تحت بعض', type: 'counter', set: { design: 'stack', metrics: ['likes', 'diamonds', 'follows', 'shares'] } }
        ],
        jar: [
            { label: 'وعاء الهدايا', sub: 'صور الهدايا تطيح فيه وتتكدّس، وتحته مجموع الماس', type: 'jar' }
        ],
        text: [
            { label: 'عنوان ذهبي', type: 'text', set: { text: 'حياكم الله', style: 'gold', font: 'lalezar', size: 9 } },
            { label: 'نيون', type: 'text', set: { text: 'LIVE', style: 'neon', font: 'changa', color: '#4dd8ff', size: 8, anim: 'glow' } },
            { label: 'بخلفية', type: 'text', set: { text: 'تابعني 💜', style: 'pill', font: 'cairo', size: 5 } },
            { label: 'نار', type: 'text', set: { text: 'تحدي اليوم', style: 'fire', font: 'cairo', size: 7 } },
            { label: 'زجاجي', type: 'text', set: { text: 'اكتب سؤالك بالشات', style: 'glass', font: 'tajawal', size: 4.5 } },
            { label: 'نص عادي', type: 'text', set: { text: 'اكتب نصك هنا', style: 'outline', size: 6 } }
        ],
        shapes: [
            { label: 'لوحة زجاجية', sub: 'خلفية للأدوات', type: 'shape', opts: { shape: 'round', fill: 'glass', w: 60, h: 36 } },
            { label: 'شريط سفلي', sub: 'بعرض الشاشة', type: 'shape', opts: { shape: 'rect', fill: 'gradient', w: 178, h: 12, color: '#7a3fd4' }, at: [0.5, 0.92] },
            { label: 'إطار نيون', sub: 'حول الكاميرا', type: 'shape', opts: { shape: 'round', fill: 'neon', w: 64, h: 40, color: '#4dd8ff' } },
            { label: 'كبسولة', sub: 'تحت عنوان', type: 'shape', opts: { shape: 'pill', fill: 'gradient', w: 42, h: 9, color: '#ff4d6d' } },
            { label: 'دائرة', sub: 'خلف أيقونة', type: 'shape', opts: { shape: 'circle', fill: 'solid', w: 16, color: '#ffd54a' } },
            { label: 'إطار', sub: 'حدود بس', type: 'shape', opts: { shape: 'round', fill: 'outline', w: 60, h: 36, color: '#ffffff' } }
        ]
    };

    var screens = [];
    var cur = null;            // الشاشة المفتوحة { id, name, key, design, updatedAt }
    var maxScreens = 12;
    var tiktokLinked = true;
    var section = 'alerts';
    var view = 'home';         // home | screens | editor
    var me = null;             // الحساب (AGPAuth.getCachedUser)
    var panelOpen = true;
    var selectedId = null;
    var textTab = 'text';
    var iconTab = 'icons';
    var iconColor = '#ffd54a';
    var drag = null, resize = null;
    var F = null;
    var nodes = {};
    var save = { timer: null, pending: false, busy: false, again: false };

    function S() { return O.getState(); }
    function find(id) { return S().items.filter(function (it) { return it.id === id; })[0] || null; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function orientNow() { return S().editOrient === 'p' ? 'p' : 'l'; }
    function curKey() { return O.keyFor(TEMPLATE, orientNow()); }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function button(label, cls, onClick) {
        var b = el('button', cls, label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }
    function iconEl(name) { var s = el('span'); s.innerHTML = svg(ic(name)); return s.firstChild; }

    var toastTimer = null;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
    }

    /* ---------------- السيرفر ---------------- */

    function apiBase() { return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com'; }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }
    function api(method, path, data, keepalive) {
        var opt = { method: method, headers: { 'Authorization': 'Bearer ' + token() } };
        if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
        if (keepalive) opt.keepalive = true;
        return fetch(apiBase() + path, opt).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (d) { d = d || {}; d._status = res.status; return d; });
        });
    }

    function linkUrl(scr) { return scr ? new URL('live.html?k=' + scr.key, location.href).href : ''; }

    function setSaved(kind, text) {
        savedEl.className = 'ob-saved' + (kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : '');
        savedEl.textContent = text || { ok: 'محفوظ ✓', saving: 'يحفظ…', bad: 'ما انحفظ' }[kind] || '';
    }

    /** بعد أي تعديل على S(): يحدّث البيانات ويجدول الحفظ. */
    function commit() {
        O.commit();
        save.pending = true;
        setSaved('saving');
        clearTimeout(save.timer);
        save.timer = setTimeout(flush, 700);
    }

    function flush(keepalive) {
        clearTimeout(save.timer);
        if (!save.pending || !cur) return;
        if (save.busy) { save.again = true; return; }
        save.pending = false;
        save.busy = true;
        var scr = cur;
        var design = JSON.parse(JSON.stringify(S()));
        scr.design = design;
        api('POST', '/api/screens/save', { id: scr.id, design: design }, keepalive).then(function (d) {
            if (d.success) { scr.updatedAt = d.updatedAt; setSaved('ok'); }
            else setSaved('bad', d.error === 'too_many_items' ? 'عناصر كثيرة' : d.error === 'design_too_large' ? 'التصميم كبير' : 'ما انحفظ');
        }).catch(function () { setSaved('bad'); save.pending = true; }).then(function () {
            save.busy = false;
            if (save.again || save.pending) { save.again = false; save.timer = setTimeout(flush, 1500); }
        });
    }

    window.addEventListener('beforeunload', function () { if (save.pending) flush(true); });

    /* ---------------- الشاشات ---------------- */

    function freshDesign() {
        return { v: 3, enabled: true, template: TEMPLATE, editOrient: 'l', preview: 'checker', items: [] };
    }

    function openScreen(scr) {
        if (cur && cur !== scr && save.pending) flush();
        cur = scr;
        try { localStorage.setItem(LAST_KEY, String(scr.id)); } catch (e) { /* ignore */ }
        var d = scr.design && Array.isArray(scr.design.items) ? JSON.parse(JSON.stringify(scr.design)) : freshDesign();
        d.template = TEMPLATE;
        if (d.editOrient !== 'p') d.editOrient = 'l';
        O.setState(d);
        selectedId = null;
        setSaved(scr.updatedAt ? 'ok' : '', scr.updatedAt ? 'محفوظ ✓' : '');
        renderChips();
        renderRail();
        renderPanel();
        renderCanvas();
        renderZoom();
    }

    /** stay = تبقى بالصفحة الحالية (أول شاشة تنسوى تلقائياً). */
    function createScreen(name, design, stay) {
        if (screens.length >= maxScreens) { toast('وصلت للحد: ' + maxScreens + ' شاشة'); return; }
        api('POST', '/api/screens/create', { name: name || '', design: design || freshDesign() }).then(function (d) {
            if (!d.success) { toast(d.error === 'too_many_screens' ? 'وصلت للحد: ' + maxScreens + ' شاشة' : 'ما قدرنا نسوي الشاشة'); return; }
            screens.push(d.screen);
            openScreen(d.screen);
            if (stay) renderViews();
            else go('editor', design ? null : 'alerts');
            toast('انضافت «' + d.screen.name + '» — رابطها جاهز بقسم «الشاشة»');
        }).catch(function () { toast('ما قدرنا نسوي الشاشة — تأكد من الاتصال'); });
    }

    function renameScreen(name) {
        if (!cur) return;
        var scr = cur;
        api('POST', '/api/screens/save', { id: scr.id, name: name }).then(function (d) {
            if (d.success) { scr.name = d.name; renderChips(); renderViews(); }
        }).catch(function () { /* ignore */ });
    }

    function deleteScreen(target) {
        var scr = target && target.id ? target : cur;
        if (!scr) return;
        if (!window.confirm('تحذف «' + scr.name + '»؟ رابطها بيوقف على طول.')) return;
        if (scr === cur) save.pending = false;
        api('POST', '/api/screens/delete', { id: scr.id }).then(function (d) {
            if (!d.success) { toast('ما قدرنا نحذفها'); return; }
            screens = screens.filter(function (x) { return x.id !== scr.id; });
            if (scr === cur) {
                cur = null;
                if (screens.length) openScreen(screens[0]);
                else { createScreen('شاشتي الأولى'); return; }
            }
            renderViews();
            toast('انحذفت الشاشة');
        }).catch(function () { toast('ما قدرنا نحذفها'); });
    }

    function newKey() {
        if (!cur) return;
        if (!window.confirm('الرابط القديم بيوقف على طول، ولازم تحط الجديد بتطبيق البث. تكمل؟')) return;
        var scr = cur;
        api('POST', '/api/screens/new-key', { id: scr.id }).then(function (d) {
            if (d.success) { scr.key = d.key; renderPanel(); toast('تغيّر الرابط — انسخ الجديد'); }
        }).catch(function () { toast('ما قدرنا نغيّر الرابط'); });
    }

    function copyLink(target) {
        var scr = target && target.id ? target : cur;
        if (!scr) return;
        var url = linkUrl(scr);
        var done = function () { toast('انسخ الرابط ✓ — حطه بتطبيق البث كـ Browser Source'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('انسخ الرابط:', url); });
        else window.prompt('انسخ الرابط:', url);
    }
    copyBtn.addEventListener('click', function () { copyLink(); });

    function renderChips() {
        chipsEl.textContent = '';
        screens.forEach(function (scr) {
            var c = button('', 'ob-chip' + (scr === cur ? ' on' : ''), function () { if (scr !== cur) { openScreen(scr); renderViews(); } });
            c.appendChild(el('i', 'dot'));
            c.appendChild(el('span', null, scr.name));
            c.title = scr.name;
            chipsEl.appendChild(c);
        });
        if (screens.length < maxScreens) {
            var add = button('+ شاشة جديدة', 'ob-chip add', function () { createScreen(''); });
            chipsEl.appendChild(add);
        }
        var on = chipsEl.querySelector('.on');
        if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    /* ---------------- القائمة الجانبية (يسار) ---------------- */

    function secOf(key) { return SECTIONS.filter(function (s) { return s.key === key; })[0]; }

    function navItem(label, icon, on, onClick, badge) {
        var b = button('', 'vy-item' + (on ? ' on' : ''), onClick);
        b.innerHTML = svg(ic(icon));
        b.appendChild(el('span', 'lbl', label));
        if (badge) b.appendChild(el('span', 'badge', badge));
        b.setAttribute('aria-label', label);
        b.setAttribute('data-tip', label);
        if (on) b.setAttribute('aria-current', 'page');
        return b;
    }

    /** قسم أداة من القائمة: يفتح المحرر عليه، والضغط مرة ثانية يطوي اللوحة. */
    function pickSection(key) {
        if (view === 'editor' && key === section && panelOpen && !selectedId) { panelOpen = false; }
        else { section = key; panelOpen = true; }
        if (selectedId) { selectedId = null; renderCanvas(); }
        go('editor');
    }

    function renderRail() {
        navEl.textContent = '';
        var n = S().items.length;
        navEl.appendChild(navItem('الرئيسية', 'home', view === 'home', function () { go('home'); }));
        navEl.appendChild(navItem('الشاشات', 'screens', view === 'screens', function () { go('screens'); }, screens.length ? String(screens.length) : ''));
        navEl.appendChild(el('div', 'vy-group', 'أدوات البث'));
        TOOL_KEYS.forEach(function (k) {
            var sec = secOf(k);
            navEl.appendChild(navItem(sec.label, sec.icon, view === 'editor' && section === k && panelOpen && !selectedId, function () { pickSection(k); }));
        });
        navEl.appendChild(el('div', 'vy-group', 'الشاشة المفتوحة'));
        ['layers', 'screen'].forEach(function (k) {
            var sec = secOf(k);
            navEl.appendChild(navItem(sec.label, sec.icon, view === 'editor' && section === k && panelOpen && !selectedId, function () { pickSection(k); }, k === 'layers' && cur && n ? String(n) : ''));
        });
        // بالجوال: نفس أقسام المحرر كشريط فوقه
        mtabs.textContent = '';
        TOOL_KEYS.concat(['layers', 'screen']).forEach(function (k) {
            var sec = secOf(k);
            mtabs.appendChild(navItem(sec.label, sec.icon, section === k && panelOpen && !selectedId, function () { pickSection(k); }));
        });
        var on = mtabs.querySelector('.on');
        if (on && on.scrollIntoView && view === 'editor') on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    /** التنقّل بين الصفحات: home | screens | editor (و sec = قسم أداة بالمحرر). */
    function go(next, sec) {
        if (sec) { section = sec; panelOpen = true; selectedId = null; }
        if (next === 'editor' && !cur) { if (screens[0]) openScreen(screens[0]); else { next = 'screens'; } }
        var changed = next !== view;
        view = next;
        ['home', 'screens', 'editor'].forEach(function (v) {
            var sEl = document.getElementById('vy-' + v);
            sEl.hidden = v !== view;
            if (v === view && changed) { sEl.classList.remove('enter'); void sEl.offsetWidth; sEl.classList.add('enter'); }
        });
        mtitle.textContent = view === 'editor' ? (secOf(section) || {}).label || VIEW_TITLES.editor : VIEW_TITLES[view];
        document.title = 'Veyro — ' + (view === 'editor' && cur ? cur.name : VIEW_TITLES[view]);
        app.classList.remove('drawer');
        try { history.replaceState(null, '', '#' + (view === 'editor' ? 'tools/' + section : view)); } catch (e) { /* ignore */ }
        renderRail();
        if (view === 'home') renderHome();
        else if (view === 'screens') renderScreensView();
        else { renderPanel(); layoutChanged(); renderCanvas(); }
    }

    /** يعيد رسم الصفحة المفتوحة لو هي الرئيسية أو الشاشات (بعد تغيّر قائمة الشاشات). */
    function renderViews() {
        renderRail();
        if (view === 'home') renderHome();
        else if (view === 'screens') renderScreensView();
    }

    function layoutChanged() {
        body.classList.toggle('closed', !panelOpen);
        setTimeout(function () { if (!drag) renderCanvas(); }, 300);
    }

    /* ---------------- عناصر الإعدادات ---------------- */

    function row(label, control, col, sub) {
        var r = el('div', 'ob-row' + (col ? ' col' : ''));
        var l = el('span', 'ob-label', label);
        if (sub) l.appendChild(el('small', null, sub));
        r.appendChild(l);
        r.appendChild(control);
        return r;
    }
    function pills(options, current, onPick, multi) {
        var g = el('div', 'ob-pills');
        options.forEach(function (opt) {
            var on = multi ? current.indexOf(opt.value) !== -1 : opt.value === current;
            g.appendChild(button(opt.label, 'ob-pill' + (on ? ' on' : ''), function () { onPick(opt.value); }));
        });
        return g;
    }
    function swatches(current, onPick) {
        var g = el('div', 'ob-sw');
        O.COLORS.forEach(function (c) {
            var b = button('', c === current ? 'on' : '', function () { onPick(c); });
            b.style.background = c;
            b.setAttribute('aria-label', c);
            g.appendChild(b);
        });
        var pick = document.createElement('input');
        pick.type = 'color';
        pick.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#ffffff';
        pick.title = 'لون مخصص';
        pick.addEventListener('change', function () { onPick(pick.value); });
        g.appendChild(pick);
        return g;
    }
    function slider(min, max, step, value, onInput) {
        var s = document.createElement('input');
        s.type = 'range';
        s.className = 'ob-range';
        s.min = min; s.max = Math.max(max, Number(value) || 0); s.step = step; s.value = value;
        s.addEventListener('input', function () { onInput(Number(s.value)); });
        return s;
    }
    function textInput(value, max, onInput, multiline) {
        var i = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline) i.type = 'text';
        else i.rows = 2;
        i.className = 'ob-input';
        i.maxLength = max;
        i.value = value || '';
        i.addEventListener('input', function () { onInput(i.value); });
        return i;
    }
    function toggle(checked, onChange) {
        var l = el('label', 'ob-toggle');
        var i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = Boolean(checked);
        i.addEventListener('change', function () { onChange(i.checked); });
        l.appendChild(i);
        l.appendChild(el('span'));
        return l;
    }
    function opts(list) { return list.map(function (x) { return { label: x.label, value: x.key }; }); }

    /** تعديل خاصية: يحفظ ويعيد رسم المعاينة؛ repaint = يعيد رسم اللوحة (للأزرار، مو للكتابة). */
    function update(it, key, value, repaint) {
        it[key] = value;
        commit();
        rebuildNode(it);
        if (repaint) renderPanel();
    }

    /* ---------------- إضافة وتعديل العناصر ---------------- */

    function itemName(it) {
        if (it.type === 'text') return (it.text || '').replace(/\s+/g, ' ').trim().slice(0, 28) || 'نص فاضي';
        if (it.type === 'top') return it.title || (O.SECTIONS[it.section] || O.SECTIONS.likers).title;
        if (it.type === 'goal') return it.title || 'هدف';
        if (it.type === 'jar') return it.title || 'وعاء الهدايا';
        if (it.type === 'alert') return 'أليرت: ' + (it.events || []).map(function (k) { return (O.ALERT_EVENTS[k] || {}).label; }).filter(Boolean).join('، ');
        if (it.type === 'icon') return it.emoji ? 'ملصق ' + it.emoji : 'أيقونة ' + ((O.ICON_SET[it.icon] || {}).label || '');
        if (it.type === 'shape') return 'شكل: ' + ((O.SHAPES.filter(function (s) { return s.key === it.shape; })[0] || {}).label || '');
        return it.title || 'عدّادات البث';
    }

    function makeItem(tool) {
        var it = O.newItem(tool.type, tool.opts || {});
        if (tool.set) Object.keys(tool.set).forEach(function (k) { it[k] = Array.isArray(tool.set[k]) ? tool.set[k].slice() : tool.set[k]; });
        return it;
    }

    function addItem(it, at) {
        var spots = [[0.5, 0.3], [0.5, 0.7], [0.2, 0.5], [0.8, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
        var spot = at || spots[S().items.length % spots.length];
        it.pos[curKey()] = { x: spot[0], y: spot[1] };
        // الأشكال تنحط تحت باقي العناصر عشان تصير خلفية لها
        if (it.type === 'shape') S().items.unshift(it); else S().items.push(it);
        commit();
        selectedId = it.id;
        textTab = 'text';
        renderRail();
        renderCanvas();
        renderPanel();
        if (O.isDataItem(it)) O.refreshStats();
        if (it.type === 'alert') setTimeout(function () { O.alertDemo(it.id, (it.events || ['gift'])[0]); }, 200);
        var ta = panel.querySelector('textarea');
        if (ta) { ta.focus(); ta.select(); }
    }

    function removeItem(it) {
        S().items = S().items.filter(function (x) { return x.id !== it.id; });
        if (selectedId === it.id) selectedId = null;
        commit();
        renderRail();
        renderCanvas();
        renderPanel();
    }

    function moveItem(it, dir) {
        var list = S().items, i = list.indexOf(it), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        list[i] = list[j]; list[j] = it;
        commit();
        renderCanvas();
        renderPanel();
    }

    function duplicate(it) {
        var copy = JSON.parse(JSON.stringify(it));
        copy.id = O.newItem('text').id;
        var k = curKey(), p = O.posOf(it, k);
        copy.pos = {};
        copy.pos[k] = { x: clamp(p.x + 0.04, 0.02, 0.98), y: clamp(p.y + 0.04, 0.02, 0.98) };
        var list = S().items;
        list.splice(list.indexOf(it) + 1, 0, copy);
        commit();
        selectedId = copy.id;
        renderRail();
        renderCanvas();
        renderPanel();
    }

    /* ---------------- المعاينة ---------------- */

    function renderCanvas() {
        if (!cur) return;
        var st = S();
        var o = orientNow();
        var pad = 28;
        var W = stage.clientWidth - pad * 2, H = stage.clientHeight - pad * 2 - 54;
        if (W < 50 || H < 50) return;
        var box = O.frameIn(TEMPLATE, o, W, H);
        F = { w: box.w, h: box.h };
        frame.style.left = (pad + box.x) + 'px';
        frame.style.top = (pad + box.y) + 'px';
        frame.style.width = box.w + 'px';
        frame.style.height = box.h + 'px';
        var pv = PREVIEWS.filter(function (p) { return p.key === st.preview; })[0] || PREVIEWS[0];
        frame.className = 'ob-frame ' + (pv.img ? 'bg-img' : 'bg-' + pv.key);
        frame.style.backgroundImage = pv.img ? 'url("' + pv.img + '")' : '';
        frame.textContent = '';
        nodes = {};
        var tag = el('div', 'ob-ftag');
        tag.appendChild(el('b', null, o === 'l' ? '1920×1080' : '1080×1920'));
        tag.appendChild(el('span', null, Math.round(box.w / (o === 'l' ? 1920 : 1080) * 100) + '%'));
        frame.appendChild(tag);
        if (!st.items.length) {
            var em = el('div', 'ob-empty');
            em.appendChild(el('b', null, 'شاشة فاضية'));
            em.appendChild(el('span', null, 'اختر قسم من اليمين واضغط على أي أداة — وبعدها اسحبها لأي مكان'));
            frame.appendChild(em);
        }
        st.items.forEach(function (it) { frame.appendChild(buildNode(it)); });
        // الأماكن بعد ما ينضافون كلهم (القياس يحتاج العنصر بالصفحة)
        st.items.forEach(function (it) { placeNode(it); });
    }

    function buildNode(it) {
        var n = O.buildItem(it, F, { preview: true });
        if (it.hidden) n.classList.add('ob-hidden');
        if (it.id === selectedId) {
            n.classList.add('ob-sel');
            var h = el('span', 'ob-handle');
            h.title = 'كبّر / صغّر';
            n.appendChild(h);
        }
        nodes[it.id] = n;
        return n;
    }

    function placeNode(it) {
        var n = nodes[it.id];
        if (!n) return;
        n._pos = O.posOf(it, curKey());
        n._F = F;
        O.place(n, n._pos, F);
    }

    /** يعيد رسم عنصر واحد بمكانه (تعديل خاصية أو تكبير). */
    function rebuildNode(it) {
        var old = nodes[it.id];
        if (!old || !F) { renderCanvas(); return; }
        var n = buildNode(it);
        frame.replaceChild(n, old);
        placeNode(it);
    }

    function select(id) {
        selectedId = id;
        textTab = 'text';
        if (id) panelOpen = true;
        renderCanvas();
        renderRail();
        renderPanel();
        body.classList.toggle('closed', !panelOpen);
    }

    frame.addEventListener('pointerdown', function (e) {
        var handle = e.target.closest && e.target.closest('.ob-handle');
        var n = e.target.closest && e.target.closest('.agp-so-item');
        if (!n) { if (selectedId) select(null); return; }
        e.preventDefault();
        var it = find(n.getAttribute('data-id'));
        if (!it) return;
        if (handle) {
            var r0 = n.getBoundingClientRect();
            resize = { it: it, pid: e.pointerId, sx: e.clientX, sy: e.clientY, half: Math.max(20, r0.width / 2), size: Number(it.size) || 5, w: Number(it.w) || 40, h: Number(it.h) || 20 };
            return;
        }
        if (selectedId !== it.id) { select(it.id); n = nodes[it.id] || n; }
        var r = n.getBoundingClientRect(), fr = frame.getBoundingClientRect();
        drag = {
            it: it, pid: e.pointerId, sx: e.clientX, sy: e.clientY, key: curKey(),
            px: (r.left + r.width / 2 - fr.left) / fr.width, py: (r.top + r.height / 2 - fr.top) / fr.height, moved: false
        };
    });

    window.addEventListener('pointermove', function (e) {
        if (resize && e.pointerId === resize.pid) {
            // المقبض بالزاوية اليسار تحت: نبعد عنه = يكبر
            var d = ((resize.sx - e.clientX) + (e.clientY - resize.sy)) / 2;
            var k = clamp(1 + d / resize.half, 0.15, 6);
            var it = resize.it;
            if (it.type === 'shape') { it.w = Math.round(clamp(resize.w * k, 2, 200)); it.h = Math.round(clamp(resize.h * k, 1, 200) * 10) / 10; }
            else it.size = Math.round(clamp(resize.size * k, 0.8, 40) * 10) / 10;
            rebuildNode(it);
            return;
        }
        if (!drag || e.pointerId !== drag.pid) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.it.pos[drag.key] = { x: clamp(drag.px + dx / F.w, 0.01, 0.99), y: clamp(drag.py + dy / F.h, 0.01, 0.99) };
        var n = nodes[drag.it.id];
        if (n) { n._pos = drag.it.pos[drag.key]; O.place(n, n._pos, F); }
    });

    function endPointer(e) {
        if (resize && e.pointerId === resize.pid) { resize = null; commit(); renderPanel(); return; }
        if (!drag || e.pointerId !== drag.pid) return;
        var moved = drag.moved;
        drag = null;
        if (moved) commit();
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    window.addEventListener('keydown', function (e) {
        var it = selectedId && find(selectedId);
        if (!it || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
        var step = e.shiftKey ? 0.02 : 0.004, p = O.posOf(it, curKey());
        var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) {
            e.preventDefault();
            p.x = clamp(p.x + moves[e.key][0], 0.01, 0.99);
            p.y = clamp(p.y + moves[e.key][1], 0.01, 0.99);
            placeNode(it);
            commit();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            removeItem(it);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            duplicate(it);
        } else if (e.key === 'Escape') {
            select(null);
        }
    });

    function renderZoom() {
        zoomBar.textContent = '';
        zoomBar.appendChild(el('span', null, 'خلفية المعاينة'));
        PREVIEWS.forEach(function (p) {
            zoomBar.appendChild(button(p.label, 'ob-btn' + ((S().preview || 'checker') === p.key ? ' primary' : ' ghost'), function () {
                S().preview = p.key;
                commit();
                renderCanvas();
                renderZoom();
            }));
        });
    }

    /* ---------------- اللوحة ---------------- */

    function head(title, desc, onBack) {
        var h = el('div', 'ob-phead');
        var t = el('div');
        t.appendChild(el('h2', null, title));
        if (desc) t.appendChild(el('p', null, desc));
        h.appendChild(t);
        var x = button('', 'ob-x', onBack || function () { panelOpen = false; renderRail(); layoutChanged(); });
        x.innerHTML = onBack ? '→' : svg(UI.close);
        x.setAttribute('aria-label', onBack ? 'رجوع' : 'إغلاق');
        h.appendChild(x);
        return h;
    }

    function renderPanel() {
        panel.textContent = '';
        if (!cur) return;
        var it = selectedId && find(selectedId);
        var pb = el('div', 'ob-pbody');
        if (it) {
            panel.appendChild(head(TYPE_NAMES[it.type] || 'عنصر', itemName(it), function () { select(null); }));
            propsPane(it, pb);
        } else {
            var sec = SECTIONS.filter(function (s) { return s.key === section; })[0] || SECTIONS[0];
            panel.appendChild(head(sec.title, sec.desc));
            if (TOOLS[sec.key]) toolsPane(TOOLS[sec.key], pb, sec.key === 'jar');
            if (sec.key === 'alerts') pb.appendChild(el('div', 'ob-hint', 'الأليرت يطلع بس وقت الحدث، وبالمعاينة هنا يطلع باهت عشان تشوف مكانه. اضغط عليه بعد ما تضيفه وجرّبه.'));
            if (sec.key === 'jar') pb.appendChild(el('div', 'ob-hint', 'يتعبّى بصور هدايا تيك توك نفسها (آخر 54 صورة)، والجديدة تطيح من فوق.'));
            if (sec.key === 'icons') iconsPane(pb);
            if (sec.key === 'layers') layersPane(pb);
            if (sec.key === 'screen') screenPane(pb);
        }
        panel.appendChild(pb);
    }

    /** بطاقات أدوات بمعاينة حقيقية مصغّرة. */
    function toolsPane(list, box, one) {
        var g = el('div', 'ob-tools' + (one ? ' one' : ''));
        list.forEach(function (tool) {
            var card = button('', 'ob-tool', function () { addItem(makeItem(tool), tool.at); });
            var pv = el('div', 'pv');
            var wrap = el('div', 'ob-pvw');
            var sample = makeItem(tool);
            sample.id = 'pv-' + sample.id;
            var n = O.buildItem(sample, { w: 300, h: 300 }, { preview: true });
            wrap.appendChild(n);
            pv.appendChild(wrap);
            card.appendChild(pv);
            var meta = el('div', 'meta');
            meta.appendChild(el('b', null, tool.label));
            if (tool.sub) meta.appendChild(el('small', null, tool.sub));
            card.appendChild(meta);
            g.appendChild(card);
            fitPreview(pv, wrap, n);
        });
        box.appendChild(g);
    }

    function fitPreview(pv, wrap, n) {
        requestAnimationFrame(function () {
            var w = n.offsetWidth, h = n.offsetHeight;
            if (!w || !h) return;
            var k = Math.min(1.4, (pv.clientWidth - 18) / w, (pv.clientHeight - 14) / h);
            wrap.style.transform = 'scale(' + k + ')';
        });
    }

    function iconsPane(box) {
        var seg = el('div', 'ob-seg');
        [['icons', 'أيقونات'], ['emoji', 'إيموجي']].forEach(function (t) {
            seg.appendChild(button(t[1], t[0] === iconTab ? 'on' : '', function () { iconTab = t[0]; renderPanel(); }));
        });
        box.appendChild(seg);
        if (iconTab === 'icons') box.appendChild(row('اللون', swatches(iconColor, function (c) { iconColor = c; renderPanel(); }), true));
        var g = el('div', 'ob-igrid');
        if (iconTab === 'icons') {
            Object.keys(O.ICON_SET).forEach(function (k) {
                var b = button('', 'ob-ibtn', function () { addItem(O.newItem('icon', { icon: k, color: iconColor })); });
                b.innerHTML = svg(O.ICON_SET[k].p);
                b.style.color = iconColor;
                b.title = O.ICON_SET[k].label;
                b.setAttribute('aria-label', O.ICON_SET[k].label);
                g.appendChild(b);
            });
        } else {
            O.EMOJIS.forEach(function (em) {
                g.appendChild(button(em, 'ob-ibtn emo', function () { addItem(O.newItem('icon', { emoji: em })); }));
            });
        }
        box.appendChild(g);
    }

    function layersPane(box) {
        var list = S().items.slice().reverse(); // فوق القائمة = فوق الشاشة
        if (!list.length) { box.appendChild(el('div', 'ob-hint', 'ما فيه عناصر للحين — أضف من الأقسام.')); return; }
        var wrap = el('div', 'ob-layers');
        list.forEach(function (it) {
            var r = el('div', 'ob-layer' + (it.id === selectedId ? ' on' : '') + (it.hidden ? ' off' : ''));
            r.addEventListener('click', function () { select(it.id); });
            var li = el('span', 'ob-lic');
            li.innerHTML = svg(ic(TYPE_ICONS[it.type] || 'star'));
            r.appendChild(li);
            r.appendChild(el('span', 'ob-lname', itemName(it)));
            function ib(label, title, fn, cls) {
                var b = button(label, 'ob-ib' + (cls ? ' ' + cls : ''), function (e) { e.stopPropagation(); fn(); });
                b.title = title;
                b.setAttribute('aria-label', title);
                r.appendChild(b);
            }
            ib(it.hidden ? '◌' : '◉', it.hidden ? 'إظهار' : 'إخفاء', function () { it.hidden = !it.hidden; commit(); renderCanvas(); renderPanel(); });
            ib('↑', 'لفوق', function () { moveItem(it, 1); });
            ib('↓', 'لتحت', function () { moveItem(it, -1); });
            ib('✕', 'حذف', function () { removeItem(it); }, 'danger');
            wrap.appendChild(r);
        });
        box.appendChild(wrap);
    }

    function screenPane(box) {
        var st = S();
        var link = el('div', 'ob-card link');
        link.appendChild(el('h3', null, 'رابط «' + cur.name + '»'));
        var url = el('input', 'ob-url');
        url.readOnly = true;
        url.value = linkUrl(cur);
        url.addEventListener('focus', function () { url.select(); });
        link.appendChild(url);
        var a = el('div', 'ob-actions');
        a.appendChild(button('نسخ الرابط', 'ob-btn primary', function () { copyLink(); }));
        a.appendChild(button('افتح الرابط', 'ob-btn ghost', function () { window.open(linkUrl(cur), '_blank', 'noopener'); }));
        a.appendChild(button('رابط جديد', 'ob-btn ghost', newKey));
        link.appendChild(a);
        link.appendChild(el('div', 'ob-hint', 'لا تنشر الرابط — اللي عنده يشوف أرقام بثك. لو تسرّب اضغط «رابط جديد».'));
        box.appendChild(link);

        if (!tiktokLinked) box.appendChild(el('div', 'ob-warn', 'حسابك مو مربوط بتيك توك — اربطه من «حسابي» عشان تطلع أرقام البث والأليرتات بالرابط.'));

        var nameIn = textInput(cur.name, 40, function (v) {
            clearTimeout(nameIn._t);
            nameIn._t = setTimeout(function () { if (v.trim()) renameScreen(v); }, 600);
        });
        box.appendChild(row('اسم الشاشة', nameIn));
        box.appendChild(row('الاتجاه', pills([{ label: 'أفقي', value: 'l' }, { label: 'عمودي', value: 'p' }], orientNow(), function (v) {
            st.editOrient = v; commit(); renderCanvas(); renderPanel();
        }), true, 'أفقي لـOBS، وعمودي لبث الجوال بـTikTok LIVE Studio'));
        box.appendChild(row('ظاهرة بالبث', toggle(st.enabled !== false, function (v) { st.enabled = v; commit(); }), false, 'إطفاؤها يخفي كل شي بالرابط'));

        var data = el('div', 'ob-card');
        data.appendChild(el('h3', null, 'أرقام البث'));
        data.appendChild(el('div', 'ob-hint', O.linkText()));
        data.appendChild(el('div', 'ob-hint', 'الرابط يعرض الأرقام اللي تنحسب وانت متصل بالبث من الموقع (لعبة، أو «اتصل بالبث» بمكتبة الألعاب).'));
        box.appendChild(data);

        var guide = el('div', 'ob-card');
        guide.appendChild(el('h3', null, 'طريقة الإضافة'));
        guide.appendChild(el('b', 'ob-hint', 'OBS'));
        var s1 = el('ol', 'ob-steps');
        ['من «المصادر» اضغط + واختر «Browser» (متصفح).', 'الصق الرابط بخانة URL.', 'العرض 1920 والطول 1080 (للعمودي 1080 × 1920).', 'اضغط OK — والخلفية شفافة لحالها.'].forEach(function (t) { s1.appendChild(el('li', null, t)); });
        guide.appendChild(s1);
        guide.appendChild(el('b', 'ob-hint', 'TikTok LIVE Studio'));
        var s2 = el('ol', 'ob-steps');
        ['من «إضافة مصدر» اختر «رابط» أو «Link».', 'الصق الرابط واضبط المقاس على حجم المشهد.', 'لو المشهد عمودي غيّر اتجاه الشاشة هنا لـ«عمودي».'].forEach(function (t) { s2.appendChild(el('li', null, t)); });
        guide.appendChild(s2);
        box.appendChild(guide);

        var acts = el('div', 'ob-actions');
        acts.appendChild(button('تكرار الشاشة', 'ob-btn ghost', function () {
            flush();
            createScreen(cur.name + ' (نسخة)', JSON.parse(JSON.stringify(S())));
        }));
        acts.appendChild(button('حذف الشاشة', 'ob-btn danger', function () { deleteScreen(); }));
        box.appendChild(acts);
    }

    /* ---------------- خصائص العنصر المحدد ---------------- */

    function sectionOpts() { return Object.keys(O.SECTIONS).map(function (k) { return { label: O.SECTIONS[k].label, value: k }; }); }
    function metricOpts(keys) { return keys.map(function (k) { return { label: O.METRICS[k].name, value: k }; }); }

    function propsPane(it, box) {
        if (it.type === 'text') textProps(it, box);
        else if (it.type === 'top') topProps(it, box);
        else if (it.type === 'goal') goalProps(it, box);
        else if (it.type === 'counter') counterProps(it, box);
        else if (it.type === 'jar') jarProps(it, box);
        else if (it.type === 'alert') alertProps(it, box);
        else if (it.type === 'icon') iconProps(it, box);
        else if (it.type === 'shape') shapeProps(it, box);
        var a = el('div', 'ob-actions');
        a.appendChild(button('لفوق', 'ob-btn ghost', function () { moveItem(it, 1); }));
        a.appendChild(button('لتحت', 'ob-btn ghost', function () { moveItem(it, -1); }));
        a.appendChild(button('تكرار', 'ob-btn ghost', function () { duplicate(it); }));
        a.appendChild(button(it.hidden ? 'إظهار' : 'إخفاء', 'ob-btn ghost', function () { it.hidden = !it.hidden; commit(); renderCanvas(); renderPanel(); }));
        a.appendChild(button('حذف', 'ob-btn danger', function () { removeItem(it); }));
        box.appendChild(a);
        box.appendChild(el('div', 'ob-hint', 'اسحبه بالمعاينة لأي مكان، وكبّره من النقطة اللي بزاويته. بالكيبورد: الأسهم للتحريك، Delete للحذف، Ctrl+D للتكرار.'));
    }

    function textProps(it, box) {
        var tabs = el('div', 'ob-ptabs');
        [['text', 'النص'], ['font', 'الخط'], ['fx', 'التأثير'], ['anim', 'الحركة']].forEach(function (t) {
            tabs.appendChild(button(t[1], t[0] === textTab ? 'on' : '', function () { textTab = t[0]; renderPanel(); }));
        });
        box.appendChild(tabs);
        if (textTab === 'text') {
            box.appendChild(row('النص', textInput(it.text, 200, function (v) { update(it, 'text', v); }, true), true));
            box.appendChild(row('الحجم', slider(2, 20, 0.5, it.size, function (v) { update(it, 'size', v); })));
            box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
        } else if (textTab === 'font') {
            var g = el('div', 'ob-fgrid');
            var cur2 = it.font || O.DEFAULT_FONT;
            O.FONTS.forEach(function (f) {
                O.loadFont(f);
                var b = button('', 'ob-fbtn' + (f.key === cur2 ? ' on' : ''), function () { update(it, 'font', f.key, true); });
                var sample = el('span', null, 'حياكم');
                sample.style.fontFamily = O.fontStack(f);
                sample.style.fontWeight = String(f.b);
                b.appendChild(sample);
                b.appendChild(el('span', null, f.label));
                g.appendChild(b);
            });
            box.appendChild(g);
        } else if (textTab === 'fx') {
            box.appendChild(row('التأثير', pills(opts(O.TEXT_STYLES), it.style || 'outline', function (v) { update(it, 'style', v, true); }), true));
        } else {
            animRows(it, box);
        }
    }

    function animRows(it, box) {
        box.appendChild(row('الحركة', pills(opts(O.ANIMS), it.anim || 'none', function (v) { update(it, 'anim', v, true); }), true));
        if (it.anim && it.anim !== 'none') box.appendChild(row('السرعة', pills(O.SPEEDS, Number(it.speed) || 1, function (v) { update(it, 'speed', v, true); })));
    }

    function sizeColor(it, box, min, max) {
        box.appendChild(row('الحجم', slider(min, max, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
    }

    function topProps(it, box) {
        box.appendChild(row('القسم', pills(sectionOpts(), it.section, function (v) {
            var oldTitle = (O.SECTIONS[it.section] || {}).title;
            if (!it.title || it.title === oldTitle) it.title = O.SECTIONS[v].title;
            update(it, 'section', v, true);
            O.refreshStats();
        }), true));
        box.appendChild(row('التصميم', pills(opts(O.DESIGNS), it.design || 'podium', function (v) { update(it, 'design', v, true); }), true));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); })));
        box.appendChild(row('عدد الأشخاص', pills(O.TOPS.map(function (n) { return { label: String(n), value: n }; }), Number(it.top) || 3, function (v) {
            update(it, 'top', v, true);
            O.refreshStats();
        })));
        sizeColor(it, box, 1.5, 9);
    }

    function goalProps(it, box) {
        box.appendChild(row('يحسب', pills(metricOpts(['likes', 'diamonds', 'follows', 'gifts', 'shares', 'comments']), it.metric, function (v) {
            if (!it.title || /^هدف /.test(it.title)) it.title = 'هدف ' + O.METRICS[v].name;
            update(it, 'metric', v, true);
        }), true));
        var num = document.createElement('input');
        num.type = 'number';
        num.min = '1';
        num.inputMode = 'numeric';
        num.className = 'ob-input num';
        num.value = it.target;
        num.addEventListener('input', function () { var v = Math.floor(Number(num.value)); if (v > 0) update(it, 'target', v); });
        box.appendChild(row('الهدف', num));
        box.appendChild(row('لما يوصل ينتقل للي بعده', toggle(it.autoNext, function (v) { update(it, 'autoNext', v); })));
        box.appendChild(row('التصميم', pills(opts(O.GOAL_DESIGNS), it.design || 'bar', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); })));
        sizeColor(it, box, 1.5, 9);
    }

    function counterProps(it, box) {
        var cur2 = Array.isArray(it.metrics) ? it.metrics : [];
        box.appendChild(row('العدّادات', pills(metricOpts(Object.keys(O.METRICS)), cur2, function (v) {
            var next = cur2.indexOf(v) === -1 ? cur2.concat([v]) : cur2.filter(function (m) { return m !== v; });
            if (!next.length) return;
            update(it, 'metrics', next, true);
        }, true), true));
        box.appendChild(row('التصميم', pills(opts(O.COUNTER_DESIGNS), it.design || 'pills', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري'));
        sizeColor(it, box, 1.5, 9);
    }

    function jarProps(it, box) {
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري'));
        box.appendChild(row('تحت الوعاء', pills([{ label: 'مجموع الماس', value: 'diamonds' }, { label: 'عدد الهدايا', value: 'gifts' }, { label: 'بدون', value: 'none' }], it.counter || 'diamonds', function (v) { update(it, 'counter', v, true); }), true));
        sizeColor(it, box, 1, 8);
        var demo = el('div', 'ob-actions');
        demo.appendChild(button('جرّب سقوط هدايا', 'ob-btn primary', function () { O.jarDemo(6); }));
        demo.appendChild(button('فرّغ التجربة', 'ob-btn ghost', function () { O.jarClearDemo(); }));
        box.appendChild(demo);
    }

    function alertProps(it, box) {
        var evs = Array.isArray(it.events) ? it.events : [];
        var demo = el('div', 'ob-actions');
        evs.forEach(function (k) {
            demo.appendChild(button('جرّب ' + O.ALERT_EVENTS[k].label, 'ob-btn primary', function () { O.alertDemo(it.id, k); }));
        });
        box.appendChild(demo);
        box.appendChild(row('يطلع لـ', pills(Object.keys(O.ALERT_EVENTS).map(function (k) { return { label: O.ALERT_EVENTS[k].label, value: k }; }), evs, function (v) {
            var next = evs.indexOf(v) === -1 ? evs.concat([v]) : evs.filter(function (x) { return x !== v; });
            if (!next.length) return;
            update(it, 'events', next, true);
        }, true), true));
        box.appendChild(row('التصميم', pills(opts(O.ALERT_DESIGNS), it.design || 'card', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('الدخول', pills(opts(O.ALERT_ANIMS), it.anim || 'pop', function (v) { update(it, 'anim', v, true); O.alertDemo(it.id, evs[0]); })));
        box.appendChild(row('المدة', pills([3, 5, 8, 12].map(function (n) { return { label: n + ' ث', value: n }; }), Number(it.duration) || 5, function (v) { update(it, 'duration', v, true); })));
        if (evs.indexOf('gift') !== -1) {
            box.appendChild(row('أقل هدية', pills([{ label: 'الكل', value: 0 }, { label: '10+', value: 10 }, { label: '100+', value: 100 }, { label: '1000+', value: 1000 }], Number(it.minDiamonds) || 0, function (v) {
                update(it, 'minDiamonds', v, true);
            }), false, 'بالماس'));
        }
        box.appendChild(row('صوت', toggle(it.sound, function (v) { update(it, 'sound', v); }), false, 'نغمة قصيرة مع كل تنبيه'));
        it.msg = it.msg || {};
        evs.forEach(function (k) {
            box.appendChild(row('نص ' + O.ALERT_EVENTS[k].label, textInput(it.msg[k] || O.ALERT_EVENTS[k].msg, 80, function (v) {
                it.msg[k] = v; commit(); rebuildNode(it);
            }), true));
        });
        box.appendChild(el('div', 'ob-hint', 'بالنص: {name} اسم المشاهد، {gift} اسم الهدية، {count} العدد، {diamonds} الماس.'));
        sizeColor(it, box, 1.5, 9);
    }

    function iconProps(it, box) {
        if (it.emoji) {
            var ge = el('div', 'ob-igrid');
            O.EMOJIS.forEach(function (em) {
                var b = button(em, 'ob-ibtn emo', function () { update(it, 'emoji', em, true); });
                if (em === it.emoji) b.style.borderColor = 'var(--accent-2)';
                ge.appendChild(b);
            });
            box.appendChild(ge);
            box.appendChild(row('الحجم', slider(2, 30, 0.5, it.size, function (v) { update(it, 'size', v); })));
        } else {
            var g = el('div', 'ob-igrid');
            Object.keys(O.ICON_SET).forEach(function (k) {
                var b = button('', 'ob-ibtn', function () { update(it, 'icon', k, true); });
                b.innerHTML = svg(O.ICON_SET[k].p);
                b.style.color = it.color;
                if (k === it.icon) b.style.borderColor = 'var(--accent-2)';
                b.title = O.ICON_SET[k].label;
                g.appendChild(b);
            });
            box.appendChild(g);
            sizeColor(it, box, 2, 30);
            box.appendChild(row('توهّج', toggle(it.glow, function (v) { update(it, 'glow', v); })));
        }
        animRows(it, box);
    }

    function shapeProps(it, box) {
        box.appendChild(row('الشكل', pills(opts(O.SHAPES), it.shape || 'round', function (v) { update(it, 'shape', v, true); }), true));
        box.appendChild(row('التعبئة', pills(opts(O.SHAPE_FILLS), it.fill || 'glass', function (v) { update(it, 'fill', v, true); }), true));
        box.appendChild(row(it.shape === 'circle' ? 'القطر' : 'العرض', slider(2, 178, 1, it.w, function (v) { update(it, 'w', v); })));
        if (it.shape !== 'circle') box.appendChild(row('الطول', slider(1, 100, 0.5, it.h, function (v) { update(it, 'h', v); })));
        box.appendChild(row('الشفافية', slider(0.1, 1, 0.05, it.opacity, function (v) { update(it, 'opacity', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
    }

    /* ---------------- حالة البيانات ---------------- */

    function paintStatus() {
        var ok = O.linkOk();
        statusEl.classList.toggle('ok', ok);
        statusEl.title = O.linkText();
        statusEl.lastChild.textContent = ok ? 'البيانات متصلة' : 'البيانات';
        var hs = document.getElementById('vy-data-stat');
        if (hs) paintDataStat(hs);
    }
    statusEl.addEventListener('click', function () { go('editor', 'screen'); });
    statusEl.style.cursor = 'pointer';

    /* ---------------- الرئيسية ---------------- */

    function svgEl(name) { var w = el('span', 'ic'); w.innerHTML = svg(ic(name)); return w; }
    function iconBtn(label, icon, cls, onClick) {
        var b = button('', 'ob-btn ' + (cls || 'ghost'), onClick);
        b.innerHTML = svg(ic(icon));
        b.appendChild(el('span', null, label));
        return b;
    }
    function firstName() {
        var n = me && (me.display_name || me.tiktok_display_name || me.username);
        return n ? String(n).split(/\s+/)[0] : '';
    }
    function itemsOf(scr) { return scr && scr.design && Array.isArray(scr.design.items) ? scr.design.items : []; }
    function itemsCount(scr) { return scr === cur ? S().items.length : itemsOf(scr).length; }

    function paintDataStat(card) {
        var ok = O.linkOk();
        card.className = 'vy-stat glass ' + (ok ? 'ok' : 'warn');
        card.querySelector('b').textContent = ok ? 'متصلة' : 'غير متصلة';
        card.querySelector('.sub').textContent = ok ? 'أرقام البث توصل للروابط' : 'اتصل بالبث من الموقع';
    }

    function stat(icon, value, label, id) {
        var c = el('div', 'vy-stat glass');
        if (id) c.id = id;
        c.appendChild(svgEl(icon));
        c.appendChild(el('b', null, value));
        c.appendChild(el('span', 'sub', label));
        return c;
    }

    function renderHome() {
        homeBody.textContent = '';
        var w = el('div', 'vy-wrap');

        // الهيرو
        var hero = el('div', 'vy-hero glass');
        var txt = el('div');
        var k = el('span', 'kicker');
        k.appendChild(el('i'));
        k.appendChild(document.createTextNode(firstName() ? 'أهلاً ' + firstName() + ' — جاهز للبث؟' : 'منصة الأوفرلي لصناع المحتوى'));
        txt.appendChild(k);
        var h1 = el('h1');
        h1.appendChild(el('span', 'ar', 'فيرو '));
        h1.appendChild(el('span', 'en', 'Veyro'));
        txt.appendChild(h1);
        txt.appendChild(el('p', null, 'صمّم شاشات بثك على OBS و TikTok LIVE Studio: أليرتات، توب الداعمين، أهداف، نصوص وأيقونات — وكل شاشة لها رابط تحطه ببرنامج البث.'));
        var acts = el('div', 'acts');
        acts.appendChild(iconBtn(cur ? 'افتح أدوات البث' : 'ابدأ أول شاشة', 'play', 'primary lg', function () { if (cur) go('editor'); else createScreen(''); }));
        acts.appendChild(iconBtn('شاشاتي', 'screens', 'ghost lg', function () { go('screens'); }));
        txt.appendChild(acts);
        hero.appendChild(txt);
        var live = el('div', 'vy-live');
        live.id = 'vy-live';
        var tag = el('span', 'tag'); tag.appendChild(el('i')); tag.appendChild(document.createTextNode('LIVE'));
        live.appendChild(tag);
        var logo = el('img'); logo.src = 'brand/veyro-icon.png'; logo.alt = ''; live.appendChild(logo);
        var st2 = el('div', 'stat');
        st2.appendChild(el('span', null, screens.length + ' شاشة'));
        if (cur) st2.appendChild(el('span', null, cur.name));
        live.appendChild(st2);
        hero.appendChild(live);
        w.appendChild(hero);

        // أرقام سريعة
        var stats = el('div', 'vy-stats');
        stats.appendChild(stat('screens', screens.length + ' / ' + maxScreens, 'شاشاتك'));
        var total = 0, on = 0;
        screens.forEach(function (x) { total += itemsCount(x); if (!(x === cur ? S().enabled === false : x.design && x.design.enabled === false)) on++; });
        stats.appendChild(stat('layers', String(total), 'عنصر بكل الشاشات'));
        stats.appendChild(stat('link', String(on), 'رابط شغّال بالبث'));
        var ds = stat('bolt2', '', '', 'vy-data-stat');
        paintDataStat(ds);
        stats.appendChild(ds);
        w.appendChild(stats);

        // أدوات البث
        w.appendChild(secHead('أدوات البث', 'اختر أداة وتنضاف للشاشة المفتوحة — وبعدها اسحبها لأي مكان.'));
        var tools = el('div', 'vy-tools');
        TOOL_KEYS.forEach(function (key) {
            var sec = secOf(key);
            var c = button('', 'vy-card vy-tool glass', function () { pickSection(key); });
            c.appendChild(svgEl(sec.icon));
            c.appendChild(el('b', null, sec.label));
            c.appendChild(el('small', null, sec.desc));
            tools.appendChild(c);
        });
        w.appendChild(tools);

        // آخر الشاشات
        if (screens.length) {
            var hd = secHead('شاشاتك', 'آخر الشاشات اللي اشتغلت عليها.');
            hd.appendChild(iconBtn('كل الشاشات', 'screens', 'ghost', function () { go('screens'); }));
            w.appendChild(hd);
            var grid = el('div', 'vy-screens');
            screensSorted().slice(0, 3).forEach(function (scr) { grid.appendChild(screenCard(scr)); });
            w.appendChild(grid);
        }

        // طريقة الإضافة
        w.appendChild(secHead('طريقة الإضافة ببرنامج البث', 'انسخ رابط الشاشة وحطه كمصدر متصفح — الخلفية شفافة لحالها.'));
        w.appendChild(guideCard());

        homeBody.appendChild(w);
        thumbsLater(homeBody);
    }

    function secHead(title, sub) {
        var h = el('div', 'vy-sechead');
        var t = el('div');
        t.appendChild(el('h2', null, title));
        if (sub) t.appendChild(el('p', null, sub));
        h.appendChild(t);
        return h;
    }

    function guideCard() {
        var g = el('div', 'vy-guide glass');
        [['OBS Studio', 'PC', ['من «المصادر» اضغط + واختر «Browser» (متصفح).', 'الصق الرابط بخانة URL.', 'العرض 1920 والطول 1080 (للعمودي 1080 × 1920).', 'اضغط OK — والخلفية شفافة لحالها.']],
         ['TikTok LIVE Studio', 'LIVE', ['من «إضافة مصدر» اختر «رابط» أو «Link».', 'الصق الرابط واضبط المقاس على حجم المشهد.', 'لو المشهد عمودي غيّر اتجاه الشاشة لـ«عمودي» من «الرابط والإعدادات».']]
        ].forEach(function (x) {
            var c = el('div');
            var h = el('h3', null, x[0] + ' ');
            h.appendChild(el('span', null, x[1]));
            c.appendChild(h);
            var ol = el('ol', 'ob-steps');
            x[2].forEach(function (t) { ol.appendChild(el('li', null, t)); });
            c.appendChild(ol);
            g.appendChild(c);
        });
        return g;
    }

    /* ---------------- الشاشات ---------------- */

    function screensSorted() {
        return screens.slice().sort(function (a, b) {
            if (a === cur) return -1;
            if (b === cur) return 1;
            return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });
    }

    function designOf(scr) { return scr === cur ? S() : (scr.design || {}); }

    function screenCard(scr) {
        var d = designOf(scr);
        var portrait = d.editOrient === 'p';
        var c = el('div', 'vy-card vy-scr glass' + (scr === cur ? ' cur' : ''));
        var th = el('div', 'thumb');
        th.setAttribute('data-thumb', String(scr.id));
        th.title = 'افتح بأدوات البث';
        th.addEventListener('click', function () { openIn(scr); });
        var badge = el('span', 'badge' + (d.enabled === false ? ' off' : ''), d.enabled === false ? 'مخفية بالبث' : (portrait ? 'عمودي' : 'أفقي'));
        th.appendChild(badge);
        c.appendChild(th);
        var info = el('div', 'info');
        info.appendChild(el('b', null, scr.name));
        var n = itemsCount(scr);
        info.appendChild(el('small', null, (n ? n + ' عنصر' : 'فاضية') + (scr === cur ? ' · مفتوحة الحين' : '')));
        c.appendChild(info);
        var a = el('div', 'acts');
        var open = iconBtn('تعديل', 'edit', 'primary grow', function () { openIn(scr); });
        a.appendChild(open);
        var cp = iconBtn('', 'link', 'ghost icon', function () { copyLink(scr); });
        cp.title = 'نسخ الرابط'; cp.setAttribute('aria-label', 'نسخ رابط ' + scr.name);
        a.appendChild(cp);
        var dp = iconBtn('', 'dup', 'ghost icon', function () {
            if (screens.length >= maxScreens) { toast('وصلت للحد: ' + maxScreens + ' شاشة'); return; }
            if (scr === cur) flush();
            createScreen(scr.name + ' (نسخة)', JSON.parse(JSON.stringify(designOf(scr))), true);
        });
        dp.title = 'تكرار'; dp.setAttribute('aria-label', 'تكرار ' + scr.name);
        a.appendChild(dp);
        var rm = iconBtn('', 'trash', 'danger icon', function () { deleteScreen(scr); });
        rm.title = 'حذف'; rm.setAttribute('aria-label', 'حذف ' + scr.name);
        a.appendChild(rm);
        c.appendChild(a);
        return c;
    }

    function openIn(scr) {
        if (scr !== cur) openScreen(scr);
        go('editor');
    }

    function renderScreensView() {
        screensBody.textContent = '';
        var w = el('div', 'vy-wrap');
        var hd = secHead('الشاشات', 'كل شاشة لها تصميم ورابط خاص — تقدر تسوي لين ' + maxScreens + ' شاشة.');
        if (screens.length < maxScreens) hd.appendChild(iconBtn('شاشة جديدة', 'plus', 'primary', function () { createScreen(''); }));
        w.appendChild(hd);
        var grid = el('div', 'vy-screens');
        screensSorted().forEach(function (scr) { grid.appendChild(screenCard(scr)); });
        if (screens.length < maxScreens) {
            var nw = button('', 'vy-card vy-new', function () { createScreen(''); });
            nw.appendChild(el('span', 'plus', '+'));
            nw.appendChild(el('span', null, 'شاشة جديدة'));
            nw.appendChild(el('small', null, (maxScreens - screens.length) + ' متبقية'));
            grid.appendChild(nw);
        }
        w.appendChild(grid);
        screensBody.appendChild(w);
        thumbsLater(screensBody);
    }

    /** معاينة مصغّرة حقيقية لكل شاشة (نفس رسم الرابط) — بعد ما تنقاس البطاقات. */
    function thumbsLater(root) {
        requestAnimationFrame(function () {
            Array.prototype.forEach.call(root.querySelectorAll('[data-thumb]'), function (th) {
                var scr = screens.filter(function (x) { return String(x.id) === th.getAttribute('data-thumb'); })[0];
                if (scr) drawThumb(scr, th);
            });
        });
    }

    function drawThumb(scr, th) {
        var d = designOf(scr);
        var items = (Array.isArray(d.items) ? d.items : []).filter(function (it) { return !it.hidden; });
        var W = th.clientWidth, H = th.clientHeight;
        if (!W || !H) return;
        if (!items.length) { th.appendChild(el('span', 'empty', 'شاشة فاضية')); return; }
        var o = d.editOrient === 'p' ? 'p' : 'l';
        var fw = o === 'l' ? W : Math.round(H * 1080 / 1920), fh = H;
        var tf = el('div', 'tf' + (o === 'p' ? ' p' : ''));
        tf.style.width = fw + 'px';
        var Fs = { w: fw, h: fh };
        th.appendChild(tf);
        var key = O.keyFor(TEMPLATE, o);
        items.forEach(function (it, i) {
            try {
                var copy = JSON.parse(JSON.stringify(it));
                copy.id = 'th-' + scr.id + '-' + i;
                var n = O.buildItem(copy, Fs, { preview: true });
                tf.appendChild(n);
                O.place(n, O.posOf(it, key), Fs);
            } catch (e) { /* معاينة بس — نتجاهل أي عنصر ما انرسم */ }
        });
    }

    /* ---------------- القائمة: طي، درج الجوال، الحساب، تأثيرات الماوس ---------------- */

    var NAV_KEY = 'vy:nav-mini';
    function setMini(on) {
        app.classList.toggle('mini', on);
        try { localStorage.setItem(NAV_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
        var cb = document.getElementById('vy-collapse');
        cb.setAttribute('aria-label', on ? 'فتح القائمة' : 'طي القائمة');
        cb.querySelector('.lbl').textContent = on ? 'فتح القائمة' : 'طي القائمة';
        setTimeout(function () { if (view === 'editor' && !drag) renderCanvas(); }, 380);
    }
    try { if (localStorage.getItem(NAV_KEY) === '1') setMini(true); } catch (e) { /* ignore */ }
    document.getElementById('vy-collapse').addEventListener('click', function () { setMini(!app.classList.contains('mini')); });
    document.getElementById('vy-menu').addEventListener('click', function () { app.classList.add('drawer'); });
    document.getElementById('vy-scrim').addEventListener('click', function () { app.classList.remove('drawer'); });
    document.querySelector('.vy-brand').addEventListener('click', function (e) { e.preventDefault(); go('home'); });

    function renderUser() {
        userEl.textContent = '';
        try { me = window.AGPAuth && window.AGPAuth.getCachedUser ? window.AGPAuth.getCachedUser() : null; } catch (e) { me = null; }
        if (!token() || !me) {
            var b = el('a', 'ob-btn primary');
            b.href = loginUrl();
            b.innerHTML = svg(ic('login'));
            b.appendChild(el('span', 'lbl', 'تسجيل الدخول'));
            b.setAttribute('data-tip', 'تسجيل الدخول');
            b.style.width = '100%';
            userEl.appendChild(b);
            return;
        }
        var u = el('a', 'vy-user');
        u.href = '../profile.html';
        u.setAttribute('data-tip', 'حسابي');
        var av = el('span', 'av');
        var pic = me.tiktok_avatar_url;
        if (pic) { var im = el('img'); im.src = pic; im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = function () { av.textContent = initial(); }; av.appendChild(im); }
        else av.textContent = initial();
        u.appendChild(av);
        var who = el('span', 'who');
        who.appendChild(el('b', null, me.display_name || me.tiktok_display_name || me.username || 'حسابي'));
        who.appendChild(el('small', null, me.tiktok_username ? '@' + me.tiktok_username : 'حسابي'));
        u.appendChild(who);
        userEl.appendChild(u);
    }
    function initial() { var n = me && (me.display_name || me.username) || 'V'; return String(n).trim().charAt(0).toUpperCase(); }
    function loginUrl() { return '../login.html?next=' + encodeURIComponent('overlay/index.html'); }

    // لمعة تتبع الماوس على الأزرار والبطاقات، وتوهّج الخلفية، وميلان بطاقة LIVE
    var glowEl = document.getElementById('vy-glow');
    var gPos = null, gRaf = 0;
    document.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var t = e.target.closest && e.target.closest('.ob-btn, .vy-item, .vy-card, .ob-tool, .ob-chip');
        if (t) {
            var r = t.getBoundingClientRect();
            t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            t.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }
        gPos = [e.clientX, e.clientY];
        if (!gRaf) gRaf = requestAnimationFrame(function () {
            gRaf = 0;
            glowEl.style.setProperty('--gx', gPos[0] + 'px');
            glowEl.style.setProperty('--gy', gPos[1] + 'px');
            var lv = view === 'home' && document.getElementById('vy-live');
            if (lv) {
                var rr = lv.getBoundingClientRect();
                var dx = clamp((gPos[0] - (rr.left + rr.width / 2)) / rr.width, -1, 1);
                var dy = clamp((gPos[1] - (rr.top + rr.height / 2)) / rr.height, -1, 1);
                lv.style.setProperty('--ry', (-8 + dx * 10) + 'deg');
                lv.style.setProperty('--rx', (4 - dy * 8) + 'deg');
            }
        });
    }, { passive: true });

    // اسم القسم كتلميح لما القائمة مطوية
    document.getElementById('vy-side').addEventListener('pointerover', function (e) {
        var t = e.target.closest && e.target.closest('[data-tip]');
        if (!t || !app.classList.contains('mini') || window.innerWidth <= 900) { tipEl.classList.remove('show'); return; }
        var r = t.getBoundingClientRect();
        tipEl.textContent = t.getAttribute('data-tip');
        tipEl.style.left = (r.right + 12) + 'px';
        tipEl.style.top = (r.top + r.height / 2 - 16) + 'px';
        tipEl.classList.add('show');
    });
    document.getElementById('vy-side').addEventListener('pointerleave', function () { tipEl.classList.remove('show'); });

    /* ---------------- تشغيل ---------------- */

    function showGate(kind) {
        gbox.textContent = '';
        // يسار: هوية Veyro ومزاياها — يمين: الرسالة والأزرار
        var br = el('div', 'ob-gbrand');
        var logo = el('img', 'ob-glogo');
        logo.src = 'brand/veyro-logo.webp';
        logo.alt = 'Veyro فيرو';
        logo.width = 260; logo.height = 128;
        br.appendChild(logo);
        var ul = el('ul');
        ['شاشات برابط لكل وحدة على OBS و TikTok LIVE Studio', 'أليرتات الهدايا والمتابعين والشير', 'توب الداعمين والأهداف والعدّادات', 'كل تعديل ينحفظ ويوصل للبث خلال ثواني'].forEach(function (t) {
            var li = el('li');
            li.innerHTML = svg(ic('check'));
            li.appendChild(el('span', null, t));
            ul.appendChild(li);
        });
        br.appendChild(ul);
        var f = el('div', 'ob-gform');
        if (kind === 'login') {
            f.appendChild(el('h2', null, 'سجّل دخولك'));
            f.appendChild(el('p', null, 'شاشات البث مربوطة بحسابك، عشان تنحفظ تصاميمك وتاخذ رابط لكل شاشة.'));
            var a = el('a', 'ob-btn primary lg');
            a.href = loginUrl();
            a.innerHTML = svg(ic('login'));
            a.appendChild(el('span', null, 'تسجيل الدخول'));
            f.appendChild(a);
            f.appendChild(el('div', 'or', 'أو'));
            var sg = el('a', 'ob-btn ghost lg', 'إنشاء حساب جديد');
            sg.href = '../signup.html';
            f.appendChild(sg);
        } else if (kind === 'streamer') {
            f.appendChild(el('h2', null, 'لحسابات الستريمر'));
            f.appendChild(el('p', null, 'أدوات Veyro لحسابات الستريمر بس. لو تبث على تيك توك، تواصل مع الإدارة لتحويل حسابك.'));
            var b = el('a', 'ob-btn primary lg', 'رجوع لحسابي');
            b.href = '../profile.html';
            f.appendChild(b);
        } else {
            f.appendChild(el('h2', null, 'ما قدرنا نفتح شاشاتك'));
            f.appendChild(el('p', null, 'تأكد من الاتصال بالإنترنت وحدّث الصفحة.'));
            f.appendChild(button('حدّث الصفحة', 'ob-btn primary lg', function () { location.reload(); }));
        }
        f.appendChild(el('div', 'fine', 'Veyro — من منظومة ألعاب أيمن'));
        gbox.appendChild(br);
        gbox.appendChild(f);
        gate.hidden = false;
    }

    /** الصفحة من الرابط: #home، #screens، #tools/<قسم> (أو ?s=<شاشة> = المحرر). */
    function viewFromUrl() {
        var h = (location.hash || '').replace(/^#/, '');
        var m = /^tools\/(\w+)$/.exec(h);
        if (m && secOf(m[1])) return { view: 'editor', sec: m[1] };
        if (h === 'screens') return { view: 'screens' };
        if (h === 'tools') return { view: 'editor' };
        if (new URLSearchParams(location.search).get('s')) return { view: 'editor' };
        return { view: 'home' };
    }

    function start() {
        renderUser();
        if (!token()) { renderHome(); showGate('login'); return; }
        api('GET', '/api/screens').then(function (d) {
            if (d._status === 401) { renderHome(); showGate('login'); return; }
            if (d._status === 403) { renderHome(); showGate('streamer'); return; }
            if (!d.success) { renderHome(); showGate('error'); return; }
            screens = d.screens || [];
            maxScreens = d.max || maxScreens;
            tiktokLinked = d.tiktokLinked !== false;
            renderUser();
            var want = Number(new URLSearchParams(location.search).get('s'));
            if (!want) { try { want = Number(localStorage.getItem(LAST_KEY)); } catch (e) { want = 0; } }
            var first = screens.filter(function (x) { return x.id === want; })[0] || screens[0];
            if (first) openScreen(first);
            var v = viewFromUrl();
            go(v.view, v.sec);
            if (!screens.length) createScreen('شاشتي الأولى', null, true);
        }).catch(function () { renderHome(); showGate('error'); });
    }

    // بيانات جديدة: نعيد رسم أدوات البيانات بس (الأليرت والنصوص وحركتها ما تنلمس)
    O.onStats(function () {
        if (!drag && !resize && F) S().items.forEach(function (it) { if (O.isDataItem(it)) rebuildNode(it); });
        paintStatus();
    });
    O.onLink(paintStatus);
    window.addEventListener('resize', function () { if (!drag) renderCanvas(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!drag) renderCanvas(); });

    window.addEventListener('resize', function () { if (window.innerWidth > 900) app.classList.remove('drawer'); });
    renderRail();
    paintStatus();
    start();
}());
