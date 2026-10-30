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
 * - المواقع نِسب من الشاشة (0..1 لمنتصف العنصر) وتنحفظ لكل اتجاه (عمودي/
 *   أفقي) لحاله؛ الأحجام بـvmin عشان تتناسب مع أي مقاس.
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

    /* ---------------- الحالة والتخزين ---------------- */

    function defaults() { return { v: 1, enabled: true, launcher: null, items: [] }; }

    function load() {
        try {
            var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (s && Array.isArray(s.items)) return s;
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

    var layer, launcher, backdrop, bar, panel, enabledBtn;

    function uid() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function find(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function orient() { return window.innerWidth >= window.innerHeight ? 'l' : 'p'; }
    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

    /** موقع العنصر بالاتجاه الحالي — أول مرة ينسخ من الاتجاه الثاني. */
    function posOf(it, o) {
        it.pos = it.pos || {};
        if (!it.pos[o]) {
            var other = it.pos[o === 'l' ? 'p' : 'l'];
            it.pos[o] = other ? { x: other.x, y: other.y } : { x: 0.5, y: 0.5 };
        }
        return it.pos[o];
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

    function buildItem(it) {
        var n = document.createElement('div');
        n.className = 'agp-so-item';
        n.setAttribute('data-id', it.id);
        n.style.fontSize = (Number(it.size) || 5) + 'vmin';
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
        var o = orient();
        layer.textContent = '';
        nodes = {};
        layer.classList.toggle('agp-so-editing', editing);
        layer.style.display = (editing || state.enabled) ? '' : 'none';
        state.items.forEach(function (it) {
            var n = buildItem(it);
            if (editing && it.id === selectedId) n.classList.add('agp-so-selected');
            layer.appendChild(n);
            nodes[it.id] = n;
            place(n, posOf(it, o));
        });
        launcher.style.display = editing ? 'none' : '';
        placeLauncher();
        syncPolling();
    }

    /** يحط العنصر بموقعه، ويزحزحه بصرياً بس لو طلع جزء منه برّا الشاشة. */
    function place(n, p) {
        var W = window.innerWidth, H = window.innerHeight;
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
        it.pos[orient()] = { x: 0.5, y: 0.4 };
        addItem(it);
        var ta = panel.querySelector('textarea');
        if (ta) { ta.focus(); ta.select(); }
    }

    function addLikers() {
        var existing = likersItems()[0];
        if (existing) { selectedId = existing.id; markSelected(); renderPanel(); return; }
        var it = { id: uid(), type: 'likers', title: 'توب المكبّسين', top: 3, size: 3.2, color: '#ffd54a', pos: {} };
        it.pos[orient()] = { x: 0.8, y: 0.3 };
        addItem(it);
    }

    function syncEnabledBtn() {
        enabledBtn.textContent = state.enabled ? 'ظاهر بالشاشة ✓' : 'مخفي من الشاشة';
        enabledBtn.classList.toggle('on', state.enabled);
    }

    function open() {
        ensureDom();
        editing = true;
        selectedId = null;
        backdrop.style.display = bar.style.display = '';
        syncEnabledBtn();
        render();
        renderPanel();
        fetchLikers();
    }

    function close() {
        editing = false;
        selectedId = null;
        drag = null;
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
        // من المكان الظاهر فعلاً (ممكن يكون متزحزح عن المحفوظ عند حافة الشاشة)
        var r = el.getBoundingClientRect();
        var px = (r.left + r.width / 2) / window.innerWidth, py = (r.top + r.height / 2) / window.innerHeight;
        drag = { kind: 'item', it: it, el: el, pid: e.pointerId, sx: e.clientX, sy: e.clientY, px: px, py: py, o: orient() };
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
            var x = clamp(drag.px + dx / window.innerWidth, 0.02, 0.98);
            var y = clamp(drag.py + dy / window.innerHeight, 0.02, 0.98);
            drag.it.pos[drag.o] = { x: x, y: y };
            place(drag.el, drag.it.pos[drag.o]);
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
        '.agp-so-pactions{display:flex;justify-content:space-between;gap:8px}'
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
        bar.appendChild(btn('＋ نص', '', addText));
        bar.appendChild(btn('＋ توب المكبّسين', '', addLikers));
        enabledBtn = btn('', '', function () { state.enabled = !state.enabled; save(); syncEnabledBtn(); });
        bar.appendChild(enabledBtn);
        bar.appendChild(btn('إغلاق', 'primary', close));
        var hint = document.createElement('div');
        hint.className = 'agp-so-hint';
        hint.style.flexBasis = '100%';
        hint.textContent = 'اسحب أي عنصر بإصبعك لأي مكان بالشاشة · اضغط عليه عشان تعدّله';
        bar.appendChild(hint);

        panel = document.createElement('div');
        panel.id = 'agp-so-panel';
        panel.className = 'agp-so-ui';
        panel.style.display = 'none';

        [layer, launcher, backdrop, bar, panel].forEach(function (el) { document.body.appendChild(el); });

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('resize', function () { if (!drag) render(); });
        window.addEventListener('keydown', function (e) { if (editing && e.key === 'Escape') close(); });
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
