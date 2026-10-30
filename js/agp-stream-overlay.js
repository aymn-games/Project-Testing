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
    var POLL_MS = 15000;
    var Z = 2147483000;
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,-apple-system,sans-serif';
    var COLORS = ['#ffffff', '#ffd54a', '#ff4d6d', '#4dd8ff', '#7cff6b', '#c58bff', '#111111'];
    var TEXT_STYLES = [
        { key: 'outline', label: 'حدود' },
        { key: 'shadow', label: 'ظل' },
        { key: 'pill', label: 'خلفية' }
    ];
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
    var frameRect = null;

    var layer, stage, launcher, backdrop, bar, panel, picker, enabledBtn, templateBtn, orientPills;

    function uid() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function find(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function orient() { return window.innerWidth >= window.innerHeight ? 'l' : 'p'; }
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
        var W = window.innerWidth, H = window.innerHeight;
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
        if (likers.status === 'login') return 'سجّل دخول بحسابك عشان يطلع التوب';
        if (likers.status === 'tiktok') return 'اربط حساب تيك توك بحسابك أولاً';
        return 'بانتظار التكبيسات… (اتصل بالبث من أي لعبة)';
    }

    function fillLikers(node, it) {
        var list = node.querySelector('.agp-so-list');
        list.textContent = '';
        var rows = likers.rows.slice(0, Number(it.top) || 3);
        if (!rows.length) {
            var em = document.createElement('div');
            em.className = 'agp-so-empty';
            em.textContent = emptyMessage();
            list.appendChild(em);
            return;
        }
        rows.forEach(function (r, i) {
            var row = document.createElement('div');
            row.className = 'agp-so-row';
            var rank = document.createElement('span');
            rank.className = 'agp-so-rank';
            rank.textContent = String(i + 1);
            var av;
            if (typeof r.avatar === 'string' && /^data:image\//.test(r.avatar)) {
                av = document.createElement('img');
                av.src = r.avatar;
                av.alt = '';
            } else {
                av = document.createElement('span');
                av.textContent = String(r.name || r.username || '?').charAt(0);
            }
            av.className = 'agp-so-av';
            av.draggable = false;
            var name = document.createElement('span');
            name.className = 'agp-so-name';
            name.textContent = r.name || r.username || '';
            var count = document.createElement('span');
            count.className = 'agp-so-count';
            count.textContent = fmt(r.count) + ' ❤';
            row.appendChild(rank);
            row.appendChild(av);
            row.appendChild(name);
            row.appendChild(count);
            list.appendChild(row);
        });
    }

    function paintLikers() {
        likersItems().forEach(function (it) { if (nodes[it.id]) fillLikers(nodes[it.id], it); });
    }

    /* ---------------- الرسم ---------------- */

    function buildItem(it, F) {
        var n = document.createElement('div');
        n.className = 'agp-so-item';
        n.setAttribute('data-id', it.id);
        n.style.fontSize = ((Number(it.size) || 5) * Math.min(F.w, F.h) / 100) + 'px';
        if (it.type === 'text') {
            n.className += ' agp-so-text s-' + (it.style || 'outline');
            n.style.color = it.color || '#fff';
            n.textContent = it.text || ' ';
        } else if (it.type === 'likers') {
            n.className += ' agp-so-likers';
            n.style.setProperty('--agp-so-c', it.color || '#ffd54a');
            var title = document.createElement('div');
            title.className = 'agp-so-likers-title';
            title.textContent = it.title || '';
            var list = document.createElement('div');
            list.className = 'agp-so-list';
            n.appendChild(title);
            n.appendChild(list);
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
            var ta = document.createElement('textarea');
            ta.className = 'agp-so-input';
            ta.rows = 2;
            ta.maxLength = 200;
            ta.value = it.text || '';
            ta.addEventListener('input', function () { update(it, 'text', ta.value); });
            panel.appendChild(row('النص', ta));
            panel.appendChild(row('الحجم', slider(2, 16, 0.5, it.size, function (v) { update(it, 'size', v); })));
            panel.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
            panel.appendChild(row('الشكل', pills(TEXT_STYLES.map(function (s) { return { label: s.label, value: s.key }; }), it.style, function (v) { update(it, 'style', v, true); })));
        } else if (it.type === 'likers') {
            var ti = document.createElement('input');
            ti.type = 'text';
            ti.className = 'agp-so-input';
            ti.maxLength = 40;
            ti.value = it.title || '';
            ti.addEventListener('input', function () { update(it, 'title', ti.value); });
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
        var it = { id: uid(), type: 'text', text: 'اكتب نصك هنا', size: 6, color: '#ffffff', style: 'outline', pos: {} };
        it.pos[curKey()] = { x: 0.5, y: 0.4 };
        addItem(it);
        var ta = panel.querySelector('textarea');
        if (ta) { ta.focus(); ta.select(); }
    }

    function addLikers() {
        var existing = likersItems()[0];
        if (existing) { selectedId = existing.id; markSelected(); renderPanel(); return; }
        var it = { id: uid(), type: 'likers', title: 'توب المكبّسين', top: 3, size: 3.2, color: '#ffd54a', pos: {} };
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
        if (selectedId !== id) { selectedId = id; markSelected(); renderPanel(); }
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
                x: clamp((drag.px + dx) / window.innerWidth, 0, 1),
                y: clamp((drag.py + dy) / window.innerHeight, 0, 1)
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
        launcher.style.left = clamp(p.x * window.innerWidth, m, window.innerWidth - size - m) + 'px';
        launcher.style.top = clamp(p.y * window.innerHeight, m, window.innerHeight - size - m) + 'px';
    }

    /* ---------------- DOM ---------------- */

    var CSS = [
        '#agp-so-layer{position:fixed;inset:0;z-index:' + Z + ';pointer-events:none;direction:rtl;font-family:' + FONT + ';overflow:hidden}',
        '#agp-so-layer.agp-so-editing{z-index:' + (Z + 2) + '}',
        '#agp-so-stage{position:absolute}',
        '#agp-so-layer.agp-so-framed #agp-so-stage{outline:2px dashed rgba(77,216,255,.8);box-shadow:0 0 0 100vmax rgba(0,0,0,.45)}',
        '.agp-so-frametag{position:absolute;bottom:6px;right:8px;font-size:12px;font-weight:700;color:#4dd8ff;opacity:.85}',
        '.agp-so-item{position:absolute;transform:translate(-50%,-50%);max-width:96vw;line-height:1.3;user-select:none;-webkit-user-select:none;box-sizing:border-box}',
        '#agp-so-layer.agp-so-editing .agp-so-item{pointer-events:auto;touch-action:none;cursor:grab;outline:2px dashed rgba(255,255,255,.6);outline-offset:6px;border-radius:6px}',
        '#agp-so-layer.agp-so-editing .agp-so-item.agp-so-selected{outline:2px solid #4dd8ff}',
        '.agp-so-text{white-space:pre-wrap;text-align:center;font-weight:800;word-break:break-word;width:max-content}',
        '.agp-so-text.s-shadow{text-shadow:0 .05em .2em rgba(0,0,0,.9)}',
        '.agp-so-text.s-outline{text-shadow:-.04em -.04em 0 #000,.04em -.04em 0 #000,-.04em .04em 0 #000,.04em .04em 0 #000,0 .06em .15em rgba(0,0,0,.6)}',
        '.agp-so-text.s-pill{background:rgba(0,0,0,.6);padding:.15em .6em;border-radius:.6em}',
        '.agp-so-likers{--agp-so-c:#ffd54a;color:#fff;min-width:11em;padding:.6em .75em;border-radius:.8em;background:linear-gradient(160deg,rgba(28,30,52,.82),rgba(10,12,24,.82));border:1px solid rgba(255,255,255,.14);box-shadow:0 .3em 1em rgba(0,0,0,.35)}',
        '.agp-so-likers-title{text-align:center;font-weight:800;color:var(--agp-so-c);margin-bottom:.35em}',
        '.agp-so-likers-title:empty{display:none}',
        '.agp-so-row{display:flex;align-items:center;gap:.5em;padding:.22em 0}',
        '.agp-so-rank{width:1.2em;text-align:center;font-weight:800;color:var(--agp-so-c);flex:none}',
        '.agp-so-av{width:2em;height:2em;border-radius:50%;object-fit:cover;flex:none;border:2px solid var(--agp-so-c);background:#2a2d45;display:inline-flex;align-items:center;justify-content:center;font-weight:800;box-sizing:border-box}',
        '.agp-so-name{flex:1;min-width:0;max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;text-align:right}',
        '.agp-so-count{flex:none;font-weight:800;color:var(--agp-so-c);direction:ltr;font-size:.9em}',
        '.agp-so-empty{text-align:center;font-size:.75em;opacity:.75;padding:.2em 0}',
        '#agp-so-launcher{position:fixed;z-index:' + (Z + 1) + ';width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(15,17,32,.7);color:#fff;display:flex;align-items:center;justify-content:center;opacity:.4;touch-action:none;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;transition:opacity .2s}',
        '#agp-so-launcher:hover,#agp-so-launcher:active{opacity:1}',
        '#agp-so-backdrop{position:fixed;inset:0;z-index:' + (Z + 1) + ';background:rgba(0,0,0,.35);touch-action:none}',
        '.agp-so-ui{position:fixed;z-index:' + (Z + 3) + ';direction:rtl;font-family:' + FONT + ';color:#fff;background:rgba(16,18,34,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}',
        '#agp-so-bar{top:10px;left:50%;transform:translateX(-50%);border-radius:16px;padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;width:max-content;max-width:calc(100vw - 20px);box-sizing:border-box}',
        '.agp-so-hint{font-size:12px;opacity:.7;padding:0 6px;text-align:center}',
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
        window.addEventListener('resize', function () { if (!drag) render(); });
        window.addEventListener('keydown', function (e) {
            if (!editing || e.key !== 'Escape') return;
            if (pickerOpen && state.template) closePicker(); else close();
        });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && pollTimer) fetchLikers(); });
        // تعديل من تبويب ثاني بنفس الجهاز
        window.addEventListener('storage', function (e) {
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
