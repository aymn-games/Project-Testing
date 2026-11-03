/**
 * AGP OBS STUDIO — صفحة «شاشات البث» (overlay/index.html): محرر شاشات لـOBS وTikTok
 * LIVE Studio. المذيع يسوي أكثر من شاشة، يرتّب فوق كل وحدة الأدوات اللي يبيها،
 * وينسخ رابطها (overlay/live.html?k=<رمز>) ويحطه بتطبيق البث كـBrowser Source.
 *
 * - يمين الشاشة شريط أقسام بالطول (الأليرتات، التوب، الأهداف، الوعاء، النصوص،
 *   الأيقونات، الأشكال، الطبقات، الشاشة). الضغط على قسم يفتح لوحته جنبه، وفيها
 *   بطاقات أدوات بمعاينة حقيقية مصغّرة — الضغط على البطاقة يضيف الأداة.
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

    var body = document.getElementById('ob-body');
    var rail = document.getElementById('ob-rail');
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
        close: '<path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>'
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
        { key: 'screen', label: 'الشاشة', icon: 'gear', title: 'الشاشة والرابط', desc: 'رابط الشاشة لتطبيق البث، والاتجاه والاسم.' }
    ];
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

    function createScreen(name, design) {
        if (screens.length >= maxScreens) { toast('وصلت للحد: ' + maxScreens + ' شاشة'); return; }
        api('POST', '/api/screens/create', { name: name || '', design: design || freshDesign() }).then(function (d) {
            if (!d.success) { toast(d.error === 'too_many_screens' ? 'وصلت للحد: ' + maxScreens + ' شاشة' : 'ما قدرنا نسوي الشاشة'); return; }
            screens.push(d.screen);
            openScreen(d.screen);
            if (!design) { section = 'alerts'; panelOpen = true; renderRail(); renderPanel(); layoutChanged(); }
            toast('انضافت «' + d.screen.name + '» — رابطها جاهز بقسم «الشاشة»');
        }).catch(function () { toast('ما قدرنا نسوي الشاشة — تأكد من الاتصال'); });
    }

    function renameScreen(name) {
        if (!cur) return;
        var scr = cur;
        api('POST', '/api/screens/save', { id: scr.id, name: name }).then(function (d) {
            if (d.success) { scr.name = d.name; renderChips(); }
        }).catch(function () { /* ignore */ });
    }

    function deleteScreen() {
        if (!cur) return;
        if (!window.confirm('تحذف «' + cur.name + '»؟ رابطها بيوقف على طول.')) return;
        var scr = cur;
        save.pending = false;
        api('POST', '/api/screens/delete', { id: scr.id }).then(function (d) {
            if (!d.success) { toast('ما قدرنا نحذفها'); return; }
            screens = screens.filter(function (x) { return x.id !== scr.id; });
            cur = null;
            if (screens.length) openScreen(screens[0]);
            else createScreen('شاشتي الأولى');
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

    function copyLink() {
        if (!cur) return;
        var url = linkUrl(cur);
        var done = function () { toast('انسخ الرابط ✓ — حطه بتطبيق البث كـ Browser Source'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('انسخ الرابط:', url); });
        else window.prompt('انسخ الرابط:', url);
    }
    copyBtn.addEventListener('click', copyLink);

    function renderChips() {
        chipsEl.textContent = '';
        screens.forEach(function (scr) {
            var c = button('', 'ob-chip' + (scr === cur ? ' on' : ''), function () { if (scr !== cur) openScreen(scr); });
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

    /* ---------------- شريط الأقسام ---------------- */

    function renderRail() {
        rail.textContent = '';
        SECTIONS.forEach(function (sec) {
            if (sec.sep) { rail.appendChild(el('div', 'ob-rsep')); return; }
            var b = button('', 'ob-rbtn' + (sec.key === section && panelOpen ? ' on' : ''), function () {
                if (sec.key === section && panelOpen && !selectedId) { panelOpen = false; }
                else { section = sec.key; panelOpen = true; }
                if (selectedId) { selectedId = null; renderCanvas(); }
                renderRail();
                renderPanel();
                layoutChanged();
            });
            b.innerHTML = svg(ic(sec.icon));
            b.appendChild(el('span', null, sec.label));
            if (sec.key === 'layers' && S().items.length) b.appendChild(el('span', 'badge', String(S().items.length)));
            b.setAttribute('aria-label', sec.title);
            rail.appendChild(b);
        });
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
        a.appendChild(button('نسخ الرابط', 'ob-btn sky', copyLink));
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
        acts.appendChild(button('حذف الشاشة', 'ob-btn danger', deleteScreen));
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
    }
    statusEl.addEventListener('click', function () { section = 'screen'; panelOpen = true; selectedId = null; renderRail(); renderPanel(); layoutChanged(); });
    statusEl.style.cursor = 'pointer';

    /* ---------------- تشغيل ---------------- */

    function showGate(kind) {
        gbox.textContent = '';
        if (kind === 'login') {
            gbox.appendChild(el('h2', null, 'سجّل دخول أول'));
            gbox.appendChild(el('p', null, 'شاشات البث مربوطة بحسابك، عشان تحفظ تصاميمك وتاخذ رابط لكل شاشة.'));
            var a = el('a', 'ob-btn primary', 'تسجيل الدخول');
            a.href = '../login.html';
            gbox.appendChild(a);
        } else if (kind === 'streamer') {
            gbox.appendChild(el('h2', null, 'لحسابات الستريمر'));
            gbox.appendChild(el('p', null, 'شاشات البث لحسابات الستريمر بس. لو تبث على تيك توك، تواصل مع الإدارة لتحويل حسابك.'));
            var b = el('a', 'ob-btn ghost', 'رجوع لحسابي');
            b.href = '../profile.html';
            gbox.appendChild(b);
        } else {
            gbox.appendChild(el('h2', null, 'ما قدرنا نفتح شاشاتك'));
            gbox.appendChild(el('p', null, 'تأكد من الاتصال بالإنترنت وحدّث الصفحة.'));
            gbox.appendChild(button('حدّث الصفحة', 'ob-btn primary', function () { location.reload(); }));
        }
        gate.hidden = false;
    }

    function start() {
        if (!token()) { showGate('login'); return; }
        api('GET', '/api/screens').then(function (d) {
            if (d._status === 401) { showGate('login'); return; }
            if (d._status === 403) { showGate('streamer'); return; }
            if (!d.success) { showGate('error'); return; }
            screens = d.screens || [];
            maxScreens = d.max || maxScreens;
            tiktokLinked = d.tiktokLinked !== false;
            if (!screens.length) { createScreen('شاشتي الأولى'); return; }
            var want = Number(new URLSearchParams(location.search).get('s'));
            if (!want) { try { want = Number(localStorage.getItem(LAST_KEY)); } catch (e) { want = 0; } }
            openScreen(screens.filter(function (x) { return x.id === want; })[0] || screens[0]);
        }).catch(function () { showGate('error'); });
    }

    // بيانات جديدة: نعيد رسم أدوات البيانات بس (الأليرت والنصوص وحركتها ما تنلمس)
    O.onStats(function () {
        if (!drag && !resize && F) S().items.forEach(function (it) { if (O.isDataItem(it)) rebuildNode(it); });
        paintStatus();
    });
    O.onLink(paintStatus);
    window.addEventListener('resize', function () { if (!drag) renderCanvas(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!drag) renderCanvas(); });

    renderRail();
    paintStatus();
    start();
}());
