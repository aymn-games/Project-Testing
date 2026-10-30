/**
 * AGP STREAM STUDIO — صفحة «استوديو البث» (stream-studio.html): يصمّم فيها
 * المذيع أوفرلي شاشته (نصوص، توب المكبّسين/الداعمين/المتفاعلين/الشير، هدف،
 * عدّادات) على معاينة بمقاس قالب جهازه، ويسحب العناصر لأي مكان.
 *
 * الرسم والبيانات والحفظ كلها من js/agp-stream-overlay.js (window.AGPStreamOverlay)
 * — نفس الكود اللي يرسم الأوفرلي فوق الألعاب، فالمعاينة = اللي يطلع بالبث.
 * كل تعديل ينحفظ فوراً (localStorage) ويوصل للألعاب المفتوحة بتبويب ثاني.
 *
 * القائمة الجانبية: حالة الاتصال بالبث، وتبويبات «الأدوات / العناصر / الشاشة»،
 * ولما ينحدد عنصر تتحول لخصائصه. صفوف الإعدادات: العنوان يمين والتحكم يسار.
 */
(function () {
    'use strict';

    var O = window.AGPStreamOverlay;
    if (!O) return;

    var PREVIEWS = [
        { key: 'grid', label: 'شبكة' },
        { key: 'light', label: 'فاتح' },
        { key: 'roulette', label: 'روليت', img: 'elimination-roulette-cover.png' },
        { key: 'letters', label: 'خلية الحروف', img: 'letters-cell-cover.png' },
        { key: 'topten', label: 'خمّن العشرة', img: 'top-ten-cover.png' }
    ];
    var TOOLS = [
        { type: 'text', label: 'نص', sub: 'خطوط وتأثيرات وحركة', glyph: 'T' },
        { type: 'top', section: 'likers', label: 'توب المكبّسين', sub: 'أكثر من كبّس' },
        { type: 'top', section: 'gifters', label: 'توب الداعمين', sub: 'أكثر من دعم بالماس' },
        { type: 'top', section: 'commenters', label: 'المتفاعلين', sub: 'أكثر من علّق' },
        { type: 'top', section: 'sharers', label: 'توب الشير', sub: 'أكثر من نشر البث' },
        { type: 'goal', label: 'هدف', sub: 'شريط يتعبّى لين الهدف', icon: 'heart' },
        { type: 'counter', label: 'عدّادات البث', sub: 'تكبيسات، ماس، متابعين…', icon: 'eye' },
        { type: 'jar', label: 'وعاء الهدايا', sub: 'يتعبّى بصور الهدايا', icon: 'gift' }
    ];
    var TYPE_NAMES = { text: 'نص', top: 'توب', goal: 'هدف', counter: 'عدّادات', jar: 'وعاء' };

    var side = document.getElementById('st-side');
    var canvas = document.getElementById('st-canvas');
    var frame = document.getElementById('st-frame');
    var savedEl = document.getElementById('st-saved');
    var enabledEl = document.getElementById('st-enabled');

    var selectedId = null;
    var tab = 'tools';
    var textTab = 'text';
    var drag = null;
    var F = null;
    var nodes = {};
    var connEl = null;
    var savedTimer = null;

    function S() { return O.getState(); }
    function find(id) { return S().items.filter(function (it) { return it.id === id; })[0] || null; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function viewOrient() {
        var t = O.tpl(S().template);
        return t.w ? (S().editOrient || O.orient()) : O.orient();
    }
    function curKey() { return O.keyFor(S().template, viewOrient()); }

    function commit() {
        O.commit();
        savedEl.textContent = 'تم الحفظ ✓';
        savedEl.classList.add('flash');
        clearTimeout(savedTimer);
        savedTimer = setTimeout(function () { savedEl.textContent = 'يحفظ تلقائياً'; savedEl.classList.remove('flash'); }, 1400);
    }

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

    /* ---------------- المعاينة ---------------- */

    function renderCanvas() {
        var st = S();
        var t = O.tpl(st.template);
        var o = viewOrient();
        var pad = 24;
        var W = canvas.clientWidth - pad * 2, H = canvas.clientHeight - pad * 2;
        // «شاشة جهازي» = نسبة الشاشة اللي فاتح منها الاستوديو
        var box = t.w ? O.frameIn(st.template, o, W, H) : (function () {
            var r = window.innerWidth / window.innerHeight, w = W, h = W / r;
            if (h > H) { h = H; w = H * r; }
            return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
        }());
        F = { w: box.w, h: box.h };
        frame.style.left = (pad + box.x) + 'px';
        frame.style.top = (pad + box.y) + 'px';
        frame.style.width = box.w + 'px';
        frame.style.height = box.h + 'px';

        var pv = PREVIEWS.filter(function (p) { return p.key === st.preview; })[0] || PREVIEWS[0];
        frame.className = 'st-frame ' + (pv.img ? 'bg-img' : 'bg-' + pv.key);
        frame.style.backgroundImage = pv.img ? 'url("' + pv.img + '")' : '';

        frame.textContent = '';
        nodes = {};
        frame.appendChild(el('div', 'st-frametag', t.label + (t.w ? ' · ' + (o === 'l' ? 'أفقي' : 'عمودي') : '')));
        if (!st.items.length) frame.appendChild(el('div', 'st-empty', 'ابدأ بإضافة أداة من القائمة — وبعدها اسحبها بإصبعك لأي مكان'));
        var key = curKey();
        st.items.forEach(function (it) {
            var n = O.buildItem(it, F, { preview: true });
            if (it.hidden) n.classList.add('st-hidden');
            if (it.id === selectedId) n.classList.add('st-sel');
            frame.appendChild(n);
            nodes[it.id] = n;
            O.place(n, O.posOf(it, key), F);
        });
    }

    function markSelected() {
        Object.keys(nodes).forEach(function (id) { nodes[id].classList.toggle('st-sel', id === selectedId); });
    }

    function select(id) {
        selectedId = id;
        textTab = 'text';
        markSelected();
        renderSide();
    }

    frame.addEventListener('pointerdown', function (e) {
        var n = e.target.closest && e.target.closest('.agp-so-item');
        if (!n) { if (selectedId) select(null); return; }
        e.preventDefault();
        var it = find(n.getAttribute('data-id'));
        if (!it) return;
        if (selectedId !== it.id) select(it.id);
        // من المكان الظاهر فعلاً (ممكن يكون متزحزح عن المحفوظ عند حافة الإطار)
        var r = n.getBoundingClientRect(), fr = frame.getBoundingClientRect();
        drag = {
            it: it, n: nodes[it.id] || n, pid: e.pointerId, sx: e.clientX, sy: e.clientY, key: curKey(),
            px: (r.left + r.width / 2 - fr.left) / fr.width, py: (r.top + r.height / 2 - fr.top) / fr.height, moved: false
        };
        try { drag.n.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    window.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.it.pos[drag.key] = { x: clamp(drag.px + dx / F.w, 0.02, 0.98), y: clamp(drag.py + dy / F.h, 0.02, 0.98) };
        O.place(drag.n, drag.it.pos[drag.key], F);
    });

    function endDrag(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var moved = drag.moved;
        drag = null;
        if (moved) commit();
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // كيبورد (للكمبيوتر): الأسهم تحرّك العنصر المحدد، وDelete يحذفه
    window.addEventListener('keydown', function (e) {
        var it = selectedId && find(selectedId);
        if (!it || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
        var step = e.shiftKey ? 0.02 : 0.005, p = O.posOf(it, curKey());
        var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) {
            e.preventDefault();
            p.x = clamp(p.x + moves[e.key][0], 0.02, 0.98);
            p.y = clamp(p.y + moves[e.key][1], 0.02, 0.98);
            O.place(nodes[it.id], p, F);
            commit();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            removeItem(it);
        } else if (e.key === 'Escape') {
            select(null);
        }
    });

    /* ---------------- عناصر واجهة الإعدادات ---------------- */

    /** صف إعداد: العنوان يمين والتحكم يسار. col = التحكم تحت العنوان (للقوائم الطويلة). */
    function row(label, control, col) {
        var r = el('div', 'st-row' + (col ? ' col' : ''));
        r.appendChild(el('span', 'st-label', label));
        r.appendChild(control);
        return r;
    }

    function pills(options, current, onPick, multi) {
        var g = el('div', 'st-pills');
        options.forEach(function (opt) {
            var on = multi ? current.indexOf(opt.value) !== -1 : opt.value === current;
            g.appendChild(button(opt.label, 'st-pill' + (on ? ' on' : ''), function () { onPick(opt.value); }));
        });
        return g;
    }

    function swatches(current, onPick) {
        var g = el('div', 'st-sw');
        O.COLORS.forEach(function (c) {
            var b = button('', c === current ? 'on' : '', function () { onPick(c); });
            b.style.background = c;
            b.setAttribute('aria-label', c);
            g.appendChild(b);
        });
        return g;
    }

    function slider(min, max, step, value, onInput) {
        var s = document.createElement('input');
        s.type = 'range';
        s.className = 'st-range';
        s.min = min; s.max = max; s.step = step; s.value = value;
        s.addEventListener('input', function () { onInput(Number(s.value)); });
        return s;
    }

    function textInput(value, max, onInput, multiline) {
        var i = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline) i.type = 'text';
        else i.rows = 2;
        i.className = 'st-input';
        i.maxLength = max;
        i.value = value || '';
        i.addEventListener('input', function () { onInput(i.value); });
        return i;
    }

    function toggle(checked, onChange) {
        var l = el('label', 'st-toggle');
        var i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = Boolean(checked);
        i.addEventListener('change', function () { onChange(i.checked); });
        l.appendChild(i);
        l.appendChild(el('span'));
        return l;
    }

    function opts(list) { return list.map(function (x) { return { label: x.label, value: x.key }; }); }

    /** تعديل خاصية: يحفظ ويعيد رسم المعاينة؛ repaint = يعيد رسم الخصائص (للأزرار، مو للكتابة). */
    function update(it, key, value, repaint) {
        it[key] = value;
        commit();
        renderCanvas();
        if (repaint) renderSide();
        else renderLayersOnly();
    }

    /* ---------------- القائمة الجانبية ---------------- */

    function itemName(it) {
        if (it.type === 'text') return (it.text || '').replace(/\s+/g, ' ').trim().slice(0, 28) || 'نص فاضي';
        if (it.type === 'top') return it.title || (O.SECTIONS[it.section] || O.SECTIONS.likers).title;
        if (it.type === 'goal') return it.title || 'هدف';
        if (it.type === 'jar') return it.title || 'وعاء الهدايا';
        return it.title || 'عدّادات البث';
    }

    function addTool(tool) {
        var it = O.newItem(tool.type, { section: tool.section });
        // أماكن متوزّعة عشان الأدوات الجديدة ما تتراكب فوق بعض
        var spots = [[0.5, 0.3], [0.5, 0.72], [0.22, 0.5], [0.78, 0.5], [0.22, 0.2], [0.78, 0.2], [0.22, 0.82], [0.78, 0.82]];
        var spot = spots[S().items.length % spots.length];
        it.pos[curKey()] = { x: spot[0], y: spot[1] };
        S().items.push(it);
        commit();
        selectedId = it.id;
        textTab = 'text';
        renderCanvas();
        renderSide();
        if (O.isDataItem(it)) O.refreshStats();
        var ta = side.querySelector('textarea');
        if (ta) { ta.focus(); ta.select(); }
    }

    function removeItem(it) {
        S().items = S().items.filter(function (x) { return x.id !== it.id; });
        if (selectedId === it.id) selectedId = null;
        commit();
        renderCanvas();
        renderSide();
    }

    function moveItem(it, dir) {
        var list = S().items, i = list.indexOf(it), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        list[i] = list[j];
        list[j] = it;
        commit();
        renderCanvas();
        renderSide();
    }

    function duplicate(it) {
        var copy = JSON.parse(JSON.stringify(it));
        copy.id = O.newItem(it.type).id;
        var k = curKey(), p = O.posOf(it, k);
        copy.pos = {};
        copy.pos[k] = { x: clamp(p.x + 0.04, 0.02, 0.98), y: clamp(p.y + 0.04, 0.02, 0.98) };
        S().items.push(copy);
        commit();
        select(copy.id);
        renderCanvas();
    }

    function connCard() {
        var c = el('div', 'st-card');
        connEl = el('div', 'st-conn');
        c.appendChild(connEl);
        paintConn();
        return c;
    }

    function paintConn() {
        if (!connEl) return;
        connEl.textContent = '';
        connEl.classList.toggle('ok', O.linkOk());
        connEl.appendChild(el('span', 'st-dot'));
        connEl.appendChild(el('span', 'st-sp', O.linkText()));
        if (!O.linkOk()) {
            var a = el('a', null, 'مكتبة الألعاب');
            a.href = 'games.html';
            connEl.appendChild(a);
        }
    }

    function toolsPane() {
        var g = el('div', 'st-tools');
        TOOLS.forEach(function (t) {
            var b = button('', 'st-tool', function () { addTool(t); });
            var ic = t.glyph ? el('span', 'st-ti', t.glyph) : O.icon(t.icon || O.SECTIONS[t.section].icon);
            b.appendChild(ic);
            var txt = el('span');
            txt.appendChild(el('b', null, t.label));
            txt.appendChild(el('small', null, t.sub));
            b.appendChild(txt);
            g.appendChild(b);
        });
        return g;
    }

    var layersBox = null;

    function layersPane() {
        layersBox = el('div', 'st-layers');
        paintLayers();
        return layersBox;
    }

    function paintLayers() {
        if (!layersBox) return;
        layersBox.textContent = '';
        var list = S().items.slice().reverse(); // فوق القائمة = فوق الشاشة
        if (!list.length) { layersBox.appendChild(el('div', 'st-hint', 'ما فيه عناصر للحين — أضف من «الأدوات».')); return; }
        list.forEach(function (it) {
            var r = el('div', 'st-layer' + (it.id === selectedId ? ' on' : '') + (it.hidden ? ' off' : ''));
            r.addEventListener('click', function () { select(it.id); });
            r.appendChild(el('span', 'st-lname', itemName(it)));
            r.appendChild(el('span', 'st-ltype', TYPE_NAMES[it.type] || ''));
            function ib(label, title, fn, cls) {
                var b = button(label, 'st-ib' + (cls ? ' ' + cls : ''), function (e) { e.stopPropagation(); fn(); });
                b.title = title;
                b.setAttribute('aria-label', title);
                r.appendChild(b);
            }
            ib(it.hidden ? '◌' : '◉', it.hidden ? 'إظهار' : 'إخفاء', function () { it.hidden = !it.hidden; commit(); renderCanvas(); renderSide(); });
            ib('↑', 'لفوق', function () { moveItem(it, 1); });
            ib('↓', 'لتحت', function () { moveItem(it, -1); });
            ib('✕', 'حذف', function () { removeItem(it); }, 'danger');
            layersBox.appendChild(r);
        });
    }

    function renderLayersOnly() { paintLayers(); }

    function thumb(t) {
        var box = el('span', 'st-thumb');
        var r = el('span');
        var tw = t.w || window.innerWidth, th = t.h || window.innerHeight;
        if (tw < th) { var x = tw; tw = th; th = x; }
        r.style.width = '52px';
        r.style.height = Math.round(52 * th / tw) + 'px';
        box.appendChild(r);
        return box;
    }

    function screenPane() {
        var wrap = el('div');
        var st = S();
        var grid = el('div', 'st-tgrid');
        O.TEMPLATES.forEach(function (t) {
            var c = button('', 'st-tcard' + (t.key === st.template ? ' on' : ''), function () {
                st.template = t.key;
                if (!st.editOrient) st.editOrient = O.orient();
                commit(); renderCanvas(); renderSide();
            });
            c.appendChild(thumb(t));
            c.appendChild(el('span', 'st-tname', t.label));
            c.appendChild(el('span', 'st-tdim', t.w ? t.w + '×' + t.h : t.sub));
            grid.appendChild(c);
        });
        var card = el('div', 'st-card');
        card.appendChild(el('h3', null, 'قالب الشاشة — الجهاز اللي تبث منه'));
        card.appendChild(grid);
        wrap.appendChild(card);
        if (O.tpl(st.template).w) {
            wrap.appendChild(row('الاتجاه', pills([{ label: 'عمودي', value: 'p' }, { label: 'أفقي', value: 'l' }], viewOrient(), function (v) {
                st.editOrient = v; commit(); renderCanvas(); renderSide();
            })));
        }
        wrap.appendChild(row('خلفية المعاينة', pills(opts(PREVIEWS), st.preview || 'grid', function (v) {
            st.preview = v; commit(); renderCanvas(); renderSide();
        })));
        var hint = el('div', 'st-hint', 'كل قالب واتجاه ينحفظ ترتيبه لحاله. وقت البث الإطار ياخذ اتجاه جهازك ويملأ الشاشة لو نفس القالب.');
        wrap.appendChild(hint);
        return wrap;
    }

    function textProps(it, box) {
        var tabs = el('div', 'st-tabs');
        [['text', 'النص'], ['font', 'الخط'], ['fx', 'التأثير'], ['anim', 'الحركة']].forEach(function (t) {
            tabs.appendChild(button(t[1], t[0] === textTab ? 'on' : '', function () { textTab = t[0]; renderSide(); }));
        });
        box.appendChild(tabs);
        var body = el('div');
        body.style.marginTop = '10px';
        box.appendChild(body);
        if (textTab === 'text') {
            body.appendChild(row('النص', textInput(it.text, 200, function (v) { update(it, 'text', v); }, true)));
            body.appendChild(row('الحجم', slider(2, 16, 0.5, it.size, function (v) { update(it, 'size', v); })));
            body.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
        } else if (textTab === 'font') {
            var g = el('div', 'st-fgrid');
            var cur = it.font || O.DEFAULT_FONT;
            O.FONTS.forEach(function (f) {
                O.loadFont(f);
                var b = button('', 'st-fbtn' + (f.key === cur ? ' on' : ''), function () { update(it, 'font', f.key, true); });
                var sample = el('span', null, 'حياكم');
                sample.style.fontFamily = O.fontStack(f);
                sample.style.fontWeight = String(f.b);
                b.appendChild(sample);
                b.appendChild(el('span', null, f.label));
                g.appendChild(b);
            });
            body.appendChild(g);
        } else if (textTab === 'fx') {
            body.appendChild(row('التأثير', pills(opts(O.TEXT_STYLES), it.style || 'outline', function (v) { update(it, 'style', v, true); }), true));
        } else {
            body.appendChild(row('الحركة', pills(opts(O.ANIMS), it.anim || 'none', function (v) { update(it, 'anim', v, true); }), true));
            if (it.anim && it.anim !== 'none') {
                body.appendChild(row('السرعة', pills(O.SPEEDS, Number(it.speed) || 1, function (v) { update(it, 'speed', v, true); })));
            }
        }
    }

    function sectionOpts() {
        return Object.keys(O.SECTIONS).map(function (k) { return { label: O.SECTIONS[k].label, value: k }; });
    }
    function metricOpts(keys) {
        return keys.map(function (k) { return { label: O.METRICS[k].name, value: k }; });
    }

    function topProps(it, box) {
        box.appendChild(row('القسم', pills(sectionOpts(), it.section, function (v) {
            var oldTitle = (O.SECTIONS[it.section] || {}).title;
            if (!it.title || it.title === oldTitle) it.title = O.SECTIONS[v].title; // العنوان الافتراضي يتبع القسم
            update(it, 'section', v, true);
            O.refreshStats();
        }), true));
        box.appendChild(row('التصميم', pills(opts(O.DESIGNS), it.design || 'podium', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); })));
        box.appendChild(row('عدد الأشخاص', pills(O.TOPS.map(function (n) { return { label: String(n), value: n }; }), Number(it.top) || 3, function (v) {
            update(it, 'top', v, true);
            O.refreshStats();
        })));
        box.appendChild(row('الحجم', slider(2, 7, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
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
        num.className = 'st-input num';
        num.value = it.target;
        num.addEventListener('input', function () { var v = Math.floor(Number(num.value)); if (v > 0) update(it, 'target', v); });
        box.appendChild(row('الهدف', num));
        box.appendChild(row('لما يوصل ينتقل للهدف اللي بعده', toggle(it.autoNext, function (v) { update(it, 'autoNext', v); })));
        box.appendChild(row('التصميم', pills(opts(O.GOAL_DESIGNS), it.design || 'bar', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); })));
        box.appendChild(row('الحجم', slider(2, 7, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
    }

    function counterProps(it, box) {
        var cur = Array.isArray(it.metrics) ? it.metrics : [];
        box.appendChild(row('العدّادات', pills(metricOpts(Object.keys(O.METRICS)), cur, function (v) {
            var next = cur.indexOf(v) === -1 ? cur.concat([v]) : cur.filter(function (m) { return m !== v; });
            if (!next.length) return; // لازم عدّاد واحد على الأقل
            update(it, 'metrics', next, true);
        }, true), true));
        box.appendChild(row('التصميم', pills(opts(O.COUNTER_DESIGNS), it.design || 'pills', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('العنوان (اختياري)', textInput(it.title, 40, function (v) { update(it, 'title', v); })));
        box.appendChild(row('الحجم', slider(2, 7, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); })));
    }

    function jarProps(it, box) {
        box.appendChild(row('العنوان (اختياري)', textInput(it.title, 40, function (v) { update(it, 'title', v); })));
        box.appendChild(row('صور الداعمين على الهدايا', toggle(it.avatars !== false, function (v) { update(it, 'avatars', v, true); })));
        box.appendChild(row('تحت الوعاء', pills([{ label: 'مجموع الماس', value: 'diamonds' }, { label: 'عدد الهدايا', value: 'gifts' }, { label: 'بدون', value: 'none' }], it.counter || 'diamonds', function (v) { update(it, 'counter', v, true); })));
        box.appendChild(row('الحجم', slider(1.5, 5, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('لون الغطاء والتوهّج', swatches(it.color, function (c) { update(it, 'color', c, true); })));
        var demo = el('div', 'st-actions');
        demo.appendChild(button('جرّب سقوط هدايا', 'st-btn primary', function () { O.jarDemo(6); }));
        demo.appendChild(button('فرّغ التجربة', 'st-btn', function () { O.jarClearDemo(); }));
        box.appendChild(demo);
        box.appendChild(el('div', 'st-hint', 'يتعبّى بصور هدايا تيك توك نفسها اللي توصل بالبث، وعلى كل هدية صورة اللي أرسلها (آخر 54 صورة)، والهدايا الجديدة تطيح من فوق. التجربة بالمعاينة هنا بس.'));
    }

    function propsPane(it) {
        var card = el('div', 'st-card');
        var head = el('div', 'st-props-head');
        head.appendChild(el('b', null, (TYPE_NAMES[it.type] || '') + ' · ' + itemName(it)));
        head.appendChild(button('رجوع', 'st-btn', function () { select(null); }));
        card.appendChild(head);
        if (it.type === 'text') textProps(it, card);
        else if (it.type === 'top') topProps(it, card);
        else if (it.type === 'goal') goalProps(it, card);
        else if (it.type === 'counter') counterProps(it, card);
        else if (it.type === 'jar') jarProps(it, card);
        var actions = el('div', 'st-actions');
        actions.appendChild(button(it.hidden ? 'إظهار' : 'إخفاء', 'st-btn', function () { it.hidden = !it.hidden; commit(); renderCanvas(); renderSide(); }));
        actions.appendChild(button('تكرار', 'st-btn', function () { duplicate(it); }));
        actions.appendChild(button('حذف', 'st-btn danger', function () { removeItem(it); }));
        card.appendChild(actions);
        var hint = el('div', 'st-hint', 'اسحب العنصر بالمعاينة لأي مكان' + (window.matchMedia('(pointer:fine)').matches ? ' — أو حرّكه بالأسهم' : ''));
        card.appendChild(hint);
        return card;
    }

    function renderSide() {
        side.textContent = '';
        layersBox = null;
        side.appendChild(connCard());
        var it = selectedId && find(selectedId);
        if (it) { side.appendChild(propsPane(it)); return; }
        var tabs = el('div', 'st-tabs');
        [['tools', 'الأدوات'], ['layers', 'العناصر (' + S().items.length + ')'], ['screen', 'الشاشة']].forEach(function (t) {
            tabs.appendChild(button(t[1], t[0] === tab ? 'on' : '', function () { tab = t[0]; renderSide(); }));
        });
        side.appendChild(tabs);
        if (tab === 'tools') side.appendChild(toolsPane());
        else if (tab === 'layers') side.appendChild(layersPane());
        else side.appendChild(screenPane());
    }

    /* ---------------- تشغيل ---------------- */

    enabledEl.checked = S().enabled !== false;
    enabledEl.addEventListener('change', function () { S().enabled = enabledEl.checked; commit(); });

    O.onStats(function () { if (!drag) renderCanvas(); paintConn(); });
    O.onLink(paintConn);
    window.addEventListener('resize', function () { if (!drag) renderCanvas(); });
    // تعديل من تبويب ثاني (الملف المشترك يعيد تحميل الحالة قبل هذا)
    window.addEventListener('storage', function (e) {
        if (e.key !== O.STORE_KEY && e.key !== 'agp:stream-overlay') return;
        setTimeout(function () { enabledEl.checked = S().enabled !== false; if (selectedId && !find(selectedId)) selectedId = null; renderCanvas(); renderSide(); }, 0);
    });

    renderSide();
    renderCanvas();
    // الخطوط تتحمّل بعد أول رسم — نعيد القياس عشان المواقع تنضبط
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!drag) renderCanvas(); });
}());
