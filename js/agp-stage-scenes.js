/*
 * مشاهد «مراحل البث» المتحركة (Veyro) — window.AGPStageScenes
 *
 * خمس صور حقيقية (assets/stage-scenes/<key>.webp — صور صاحب المنصة) تتحرك بتأثيرات فوقها:
 *   sakura   = ساكورا وقمر: هالة القمر تنبض، بتلات تطيح، لمعات على الزهر
 *   moonfly  = فراشات الهلال: نجوم تلمع، توهّج الهلال والفراشات، ضباب يمشي، لمعات تطلع
 *   catroom  = غرفة القطة: ضوء الشاشة ينبض، نجوم بالشباك والشاشة، غبار يطفو
 *   cateyes  = عيون القطة: العيون تلمع وتتوهّج، ضوء يمر، جزيئات بنفسجية تطفو
 *   flame    = لهب الفراشات: لهب السيف يرتعش، جمر يطلع، فراشات ضوء، العيون تتوهّج
 * وكلها فيها حركة كاميرا بطيئة جداً (تقريب وتحريك) تتكرر بسلاسة.
 *
 * build(host, o):
 *   o.scene، o.w / o.h = مقاس الشاشة (px). الصورة تغطي الشاشة (cover) بأي اتجاه، ومركزها على
 *     الشي المهم بالصورة (القمر، الفراشات، العيون…) عشان الطولي (تيك توك) ما يقص الأهم.
 *   o.mode = full (الصورة كاملة) | glow (شفاف: الأجزاء الغامقة تختفي وتبقى الأجزاء المضيئة —
 *     قناع SVG بالإضاءة، يشتغل بـ OBS) | fx (التأثيرات بس بدون الصورة)
 *   o.hue (−180..180 درجة) / o.sat / o.bri = الألوان، o.speed (0.5..2)
 *
 * الأداء: الصورة والتأثيرات الكبيرة طبقات تتحرك بـ transform/opacity (على كرت الشاشة).
 * بدون نصوص — مكان النصوص ينبني بعدين.
 */
(function () {
    'use strict';
    if (window.AGPStageScenes) return;

    var BASE = (function () {
        try { return new URL('../assets/stage-scenes/', (document.currentScript && document.currentScript.src) || location.href).href; } catch (e) { return '../assets/stage-scenes/'; }
    }());

    // iw/ih = مقاس الصورة، fx/fy = مركز الاهتمام (0..1) للقص بالطولي
    var SCENES = [
        { key: 'sakura', label: 'ساكورا وقمر', iw: 1920, ih: 1080, fx: .38, fy: .48 },
        { key: 'moonfly', label: 'فراشات الهلال', iw: 1920, ih: 1076, fx: .5, fy: .5 },
        { key: 'catroom', label: 'غرفة القطة', iw: 1920, ih: 1280, fx: .55, fy: .5 },
        { key: 'cateyes', label: 'عيون القطة', iw: 1920, ih: 1081, fx: .66, fy: .55 },
        { key: 'flame', label: 'لهب الفراشات', iw: 1920, ih: 1109, fx: .5, fy: .42 }
    ];
    var MODES = [{ key: 'full', label: 'الصورة كاملة' }, { key: 'glow', label: 'شفاف (المضيء بس)' }, { key: 'fx', label: 'التأثيرات بس' }];
    var seq = 0;

    function rng(seed) { var s = seed % 2147483647 || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    function f1(v) { return Math.round(v * 10) / 10; }
    function div(cls, style, inner) { return '<div class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '>' + (inner || '') + '</div>'; }
    /** توهّج دائري ناعم: x/y/w/h بالنسبة المئوية من الصورة. */
    function glow(x, y, w, h, color, cls) {
        return div('agsc-g ' + (cls || ''), 'left:' + x + '%;top:' + y + '%;width:' + w + '%;height:' + h + '%;background:radial-gradient(closest-side,' + color + ',transparent)');
    }
    /** لمعة نجمة (نقطة وخيطين) تومض. */
    function glint(x, y, s, d, color) {
        return div('agsc-gl', 'left:' + f1(x) + '%;top:' + f1(y) + '%;width:' + f1(s) + '%;--d:' + d.toFixed(2) + 's;--c:' + (color || '#fff'));
    }

    /**
     * جزيئات SVG داخل الصورة (viewBox = 1000 × ارتفاع الصورة النسبي): كل جزء يتحرك بـ transform بوحدات الرسمة.
     * kind: fall (بتلات تطيح مائلة وتلف)، rise (جمر/لمعات تطلع)، float (غبار يطفو).
     */
    function particles(VH, n, kind, opts, seed) {
        var r = rng(seed), s = '';
        for (var i = 0; i < n; i++) {
            var dur = opts.dur[0] + r() * (opts.dur[1] - opts.dur[0]), dl = (r() * dur).toFixed(1);
            var col = opts.colors[Math.floor(r() * opts.colors.length)];
            var sz = opts.size[0] + r() * (opts.size[1] - opts.size[0]);
            var x0 = (opts.x ? opts.x[0] + r() * (opts.x[1] - opts.x[0]) : r()) * 1000;
            var y0 = (opts.y ? opts.y[0] + r() * (opts.y[1] - opts.y[0]) : r()) * VH;
            var shape = kind === 'fall'
                ? '<ellipse class="agsc-spin" style="animation-duration:calc(' + (2 + r() * 3).toFixed(1) + 's*var(--sp))" rx="' + f1(sz) + '" ry="' + f1(sz * .55) + '" fill="' + col + '" opacity="' + (.65 + r() * .35).toFixed(2) + '"/>'
                : '<circle r="' + f1(sz * 3) + '" fill="' + col + '" opacity=".22"/><circle r="' + f1(sz) + '" fill="' + col + '"/>';
            s += '<g class="agsc-' + kind + '" style="--x:' + f1(x0) + 'px;--y:' + f1(y0) + 'px;--dx:' + f1((opts.dx || 0) * (.6 + r() * .8)) + 'px;--dy:' + f1((opts.dy || 0) * (.6 + r() * .8)) + 'px;animation-duration:calc(' + dur.toFixed(1) + 's*var(--sp));animation-delay:-' + dl + 's">' + shape + '</g>';
        }
        return '<svg class="agsc-pt" viewBox="0 0 1000 ' + f1(VH) + '" preserveAspectRatio="none" aria-hidden="true">' + s + '</svg>';
    }

    /** فراشة ضوء (خطوط مضيئة) ترفرف بـ rotateY وتطلع لفوق. x/y بالنسبة المئوية، size بالـ em. */
    function ghostFly(c1, c2, x, y, size, flap, drift, delay, rot) {
        var id = 'bw' + (++seq);
        var wing = '<svg viewBox="0 0 100 120" aria-hidden="true"><defs><radialGradient id="' + id + '" cx="0" cy=".45" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="' + c2 + '" stop-opacity=".55"/><stop offset="1" stop-color="' + c1 + '" stop-opacity=".1"/></radialGradient></defs>' +
            '<path d="M2 52C10 30 30 4 62 6c26 2 34 22 22 38C72 58 40 60 2 56Z M2 60c22 2 46 8 52 30 4 16-10 26-24 22C16 108 6 86 2 64Z" fill="url(#' + id + ')" stroke="' + c2 + '" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M4 54C30 42 54 26 76 16M4 56c22-4 44-8 70-18M4 62c16 10 28 24 34 40" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/></svg>';
        return div('agsc-bf', 'left:' + x + '%;top:' + y + '%;font-size:' + size + 'em;--fl:' + flap + 's;--dr:' + drift + 's;--dl:-' + delay + 's;--rt:' + (rot || 0) + 'deg',
            div('agsc-bfm', '', div('agsc-bfw r', '', wing) + div('agsc-bfw l', '', wing)));
    }

    /* ---------------- تأثيرات كل صورة (الإحداثيات بالنسبة المئوية من الصورة) ---------------- */
    var FX = {
        sakura: function (VH) {
            var r = rng(5), g = '';
            for (var i = 0; i < 16; i++) g += glint(45 + r() * 55, r() * 70, 1.2 + r() * 1.2, 2 + r() * 3);
            return glow(36.7, 48.3, 52, 92, 'rgba(225,235,255,.55)', 'pulse slow') +
                glow(36.7, 48.3, 24, 43, 'rgba(255,255,255,.45)', 'pulse') +
                g +
                particles(VH, 34, 'fall', { colors: ['#f4e3ff', '#e2c4ff', '#cfa6f5', '#ffffff'], size: [5, 11], dur: [9, 18], dx: -320, dy: VH + 80, y: [-.08, -.02] }, 7);
        },
        moonfly: function (VH) {
            var r = rng(9), g = '';
            for (var i = 0; i < 26; i++) g += glint(r() * 100, r() * 55, .6 + r() * 1.1, 2 + r() * 4);
            for (var j = 0; j < 10; j++) g += glint(38 + r() * 24, 22 + r() * 46, .8 + r() * 1, 1.5 + r() * 2.5, '#e9dbff');
            return g +
                glow(76, 50, 40, 70, 'rgba(255,230,245,.4)', 'pulse slow') +
                glow(48, 46, 46, 80, 'rgba(176,130,255,.35)', 'pulse') +
                glow(26, 61, 26, 44, 'rgba(176,130,255,.3)', 'pulse alt') +
                div('agsc-mist a', 'background:radial-gradient(closest-side,rgba(120,90,220,.45),transparent)') +
                div('agsc-mist b', 'background:radial-gradient(closest-side,rgba(150,110,255,.3),transparent)') +
                particles(VH, 24, 'rise', { colors: ['#ffffff', '#d9c2ff', '#b38cff'], size: [1.2, 2.6], dur: [8, 15], dy: -380, y: [.7, 1.05] }, 11);
        },
        catroom: function (VH) {
            var r = rng(13), g = '';
            for (var i = 0; i < 14; i++) g += glint(30 + r() * 33, 27 + r() * 30, .6 + r() * .8, 2 + r() * 3);
            for (var j = 0; j < 16; j++) g += glint(20 + r() * 60, r() * 22, .5 + r() * .7, 2.5 + r() * 3);
            return glow(46.5, 43, 70, 95, 'rgba(170,120,255,.32)', 'pulse') +
                g +
                particles(VH, 22, 'float', { colors: ['#e7c9ff', '#ffffff'], size: [1.2, 2.4], dur: [12, 22], dx: 40, dy: -60, x: [.25, .8], y: [.2, .75] }, 17);
        },
        cateyes: function (VH) {
            var eyes = [[57.5, 57.8, 1], [79.8, 67.4, 1], [25.4, 28.9, .55], [51.7, 25.2, .55]];
            var s = '';
            eyes.forEach(function (e, i) {
                s += glow(e[0], e[1], 13 * e[2], 23 * e[2], 'rgba(170,90,255,.6)', 'pulse' + (i % 2 ? ' alt' : '')) +
                    glint(e[0] + .8, e[1] - 1.5, 2.6 * e[2], 3 + i * .7);
            });
            return div('agsc-sweep', '') + s +
                particles(VH, 26, 'float', { colors: ['#c58bff', '#e6ccff', '#8f4dff'], size: [1.2, 2.8], dur: [10, 20], dx: 60, dy: -80 }, 19);
        },
        flame: function (VH) {
            var r = rng(29), t = '';
            // لهب على طول السيف (من اليسار لين المقبض)
            for (var i = 0; i < 22; i++) {
                var d = .7 + r() * .8, fh = 7 + r() * 7, fxp = i * 2.8 + r() * 1.5;
                // قاعدة اللهب على خط السيف (يميل شوي لفوق ناحية المقبض)
                t += div('agsc-fl', 'left:' + f1(fxp) + '%;top:' + f1(58.2 - fxp * .025 - fh) + '%;width:' + f1(2.5 + r() * 2.5) + '%;height:' + f1(fh) + '%;--d:' + d.toFixed(2) + 's;--dl:-' + (r() * d).toFixed(2) + 's;' +
                    'background:radial-gradient(40% 60% at 50% 80%,#fff 0,#ffb3f2 22%,#c23dff 50%,rgba(194,61,255,0) 72%)');
            }
            var bfs = [[10, 34, 4.5, 0], [84, 30, 5, 1.5], [12, 82, 5.5, 3], [70, 70, 4, 4.5], [30, 14, 3.5, 6]];
            var b = '';
            bfs.forEach(function (q, k) { b += ghostFly('#c23dff', '#ff9ee8', q[0], q[1], q[2], .5 + (k % 3) * .12, 9 + k, q[3], (k % 2 ? 1 : -1) * 15); });
            return div('agsc-blade', '') + t +
                glow(50.5, 35, 14, 14, 'rgba(255,140,255,.55)', 'pulse') +
                glow(92, 85, 30, 50, 'rgba(210,80,255,.35)', 'pulse alt') +
                b +
                particles(VH, 40, 'rise', { colors: ['#ffffff', '#ffb3f2', '#d35cff'], size: [1, 2.4], dur: [4, 9], dx: 60, dy: -520, y: [.75, 1.05] }, 31);
        }
    };

    /* ---------------- الستايل ---------------- */
    var CSS = [
        '.agsc{position:absolute;inset:0;overflow:hidden;pointer-events:none;--sp:1}',
        '.agsc-cv{position:absolute}',
        // حركة الكاميرا: تقريب وتحريك بطيء يرجع لنفسه (يتكرر بسلاسة)
        '.agsc-kb{position:absolute;inset:0;animation:agsc-kb calc(36s*var(--sp)) ease-in-out infinite alternate;will-change:transform;transform-origin:var(--ox,50%) var(--oy,50%)}',
        '@keyframes agsc-kb{from{transform:scale(1.02) translate(0,0)}to{transform:scale(1.1) translate(-1.2%,-.8%)}}',
        '.agsc-img{position:absolute;inset:0;width:100%;height:100%;display:block}',
        '.agsc-g{position:absolute;transform:translate(-50%,-50%);mix-blend-mode:screen;will-change:opacity}',
        '.agsc-g.pulse{animation:agsc-gp calc(4s*var(--sp)) ease-in-out infinite}',
        '.agsc-g.pulse.slow{animation-duration:calc(7s*var(--sp))}',
        '.agsc-g.pulse.alt{animation-delay:calc(-2s*var(--sp))}',
        '@keyframes agsc-gp{0%,100%{opacity:.45}50%{opacity:1}}',
        // لمعة نجمة
        '.agsc-gl{position:absolute;aspect-ratio:1;transform:translate(-50%,-50%);animation:agsc-glt calc(var(--d)*var(--sp)) ease-in-out infinite;animation-delay:calc(var(--d)*-.37s);will-change:transform,opacity;' +
            'background:radial-gradient(closest-side,var(--c) 0,var(--c) 12%,transparent 40%),linear-gradient(90deg,transparent 0,var(--c) 50%,transparent 100%) center/100% 6% no-repeat,linear-gradient(0deg,transparent 0,var(--c) 50%,transparent 100%) center/6% 100% no-repeat}',
        '@keyframes agsc-glt{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(.3) rotate(0)}50%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(45deg)}}',
        // جزيئات
        '.agsc-pt{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
        '.agsc-fall{animation:agsc-fall linear infinite}',
        '@keyframes agsc-fall{0%{transform:translate(var(--x),var(--y))}25%{transform:translate(calc(var(--x) + var(--dx)*.25 + 30px),calc(var(--y) + var(--dy)*.25))}50%{transform:translate(calc(var(--x) + var(--dx)*.5 - 20px),calc(var(--y) + var(--dy)*.5))}75%{transform:translate(calc(var(--x) + var(--dx)*.75 + 25px),calc(var(--y) + var(--dy)*.75))}100%{transform:translate(calc(var(--x) + var(--dx)),calc(var(--y) + var(--dy)))}}',
        '.agsc-spin{animation:agsc-spin linear infinite;transform-box:fill-box;transform-origin:center}',
        '@keyframes agsc-spin{0%{transform:rotate(0) scaleY(1)}50%{transform:rotate(180deg) scaleY(.35)}100%{transform:rotate(360deg) scaleY(1)}}',
        '.agsc-rise{animation:agsc-rise ease-in infinite}',
        '@keyframes agsc-rise{0%{transform:translate(var(--x),var(--y));opacity:0}15%{opacity:1}80%{opacity:.8}100%{transform:translate(calc(var(--x) + var(--dx)),calc(var(--y) + var(--dy)));opacity:0}}',
        '.agsc-float{animation:agsc-flt ease-in-out infinite}',
        '@keyframes agsc-flt{0%,100%{transform:translate(var(--x),var(--y));opacity:.15}50%{transform:translate(calc(var(--x) + var(--dx)),calc(var(--y) + var(--dy)));opacity:1}}',
        // ضباب
        '.agsc-mist{position:absolute;width:90%;height:40%;bottom:-10%;mix-blend-mode:screen;animation:agsc-mist calc(26s*var(--sp)) ease-in-out infinite alternate;will-change:transform}',
        '.agsc-mist.a{left:-20%}',
        '.agsc-mist.b{right:-25%;bottom:-4%;animation-duration:calc(34s*var(--sp))}',
        '@keyframes agsc-mist{from{transform:translateX(-8%)}to{transform:translateX(12%)}}',
        // ضوء يمر بالمشهد
        '.agsc-sweep{position:absolute;inset:-20% -60%;background:linear-gradient(105deg,transparent 42%,rgba(190,140,255,.16) 50%,transparent 58%);mix-blend-mode:screen;animation:agsc-sweep calc(9s*var(--sp)) ease-in-out infinite;will-change:transform}',
        '@keyframes agsc-sweep{0%{transform:translateX(-30%)}60%,100%{transform:translateX(30%)}}',
        // لهب السيف
        '.agsc-blade{position:absolute;left:0;width:62%;top:57%;height:2.2%;transform:translateY(-50%) rotate(-1.4deg);transform-origin:100% 50%;mix-blend-mode:screen;border-radius:999px;' +
            'background:linear-gradient(90deg,rgba(194,61,255,0),rgba(255,180,245,.9) 40%,#fff 70%,rgba(255,180,245,.8));box-shadow:0 0 1em #ff9ee8,0 0 3em #c23dff;animation:agsc-bl calc(.9s*var(--sp)) ease-in-out infinite alternate;will-change:opacity}',
        '@keyframes agsc-bl{from{opacity:.45}to{opacity:.95}}',
        '.agsc-fl{position:absolute;border-radius:50% 50% 40% 40%/60% 60% 40% 40%;mix-blend-mode:screen;transform-origin:50% 100%;animation:agsc-fl calc(var(--d)*var(--sp)) ease-in infinite;animation-delay:var(--dl);will-change:transform,opacity}',
        '@keyframes agsc-fl{0%{transform:translateY(8%) scale(.9,.6);opacity:0}18%{opacity:.95}60%{opacity:.8}100%{transform:translateY(-45%) scale(.35,1.15);opacity:0}}',
        // فراشات ضوء
        '.agsc-bf{position:absolute;width:1em;height:1.2em;margin:-.6em 0 0 -.5em;animation:agsc-up calc(var(--dr)*var(--sp)) ease-in-out infinite;animation-delay:var(--dl);will-change:transform,opacity}',
        '.agsc-bfm{position:absolute;inset:0;perspective:3em;transform:rotate(var(--rt))}',
        '.agsc-bfw{position:absolute;top:0;width:50%;height:100%;animation:agsc-flap calc(var(--fl)*var(--sp)) ease-in-out infinite;animation-delay:var(--dl);will-change:transform}',
        '.agsc-bfw svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 0 .05em #fff) drop-shadow(0 0 .18em #ff9ee8)}',
        '.agsc-bfw.r{left:50%;transform-origin:0 50%}',
        '.agsc-bfw.l{right:50%;transform-origin:100% 50%;animation-name:agsc-flapl}',
        '.agsc-bfw.l svg{transform:scaleX(-1)}',
        '@keyframes agsc-flap{0%,100%{transform:rotateY(0)}50%{transform:rotateY(68deg)}}',
        '@keyframes agsc-flapl{0%,100%{transform:rotateY(0)}50%{transform:rotateY(-68deg)}}',
        '@keyframes agsc-up{0%{transform:translate(0,.6em);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translate(.5em,-2.2em);opacity:0}}'
    ].join('\n');
    function injectCss() {
        if (document.getElementById('agsc-css')) return;
        var s = document.createElement('style');
        s.id = 'agsc-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    function clampN(v, a, b, d) { v = Number(v); return isFinite(v) && v !== 0 ? Math.max(a, Math.min(b, v)) : d; }

    function build(host, o) {
        injectCss();
        var sc = SCENES.filter(function (x) { return x.key === o.scene; })[0] || SCENES[0];
        var w = Math.max(1, Number(o.w) || 1920), h = Math.max(1, Number(o.h) || 1080);
        var mode = MODES.some(function (m) { return m.key === o.mode; }) ? o.mode : 'full';
        // الصورة تغطي الشاشة، وتنزاح عشان يبقى مركز الاهتمام بالوسط قدر الإمكان (+ هامش لحركة الكاميرا)
        var k = Math.max(w / sc.iw, h / sc.ih) * 1.04;
        var cw = sc.iw * k, ch = sc.ih * k;
        var left = Math.min(0, Math.max(w - cw, w / 2 - sc.fx * cw)), top = Math.min(0, Math.max(h - ch, h / 2 - sc.fy * ch));
        var root = document.createElement('div');
        root.className = 'agsc s-' + sc.key + ' m-' + mode;
        root.style.setProperty('--sp', String(1 / clampN(o.speed, .3, 3, 1)));
        var hue = Number(o.hue) || 0, sat = clampN(o.sat, .2, 2.5, 1), bri = clampN(o.bri, .3, 2, 1);
        if (hue || sat !== 1 || bri !== 1) root.style.filter = 'hue-rotate(' + hue + 'deg) saturate(' + sat + ') brightness(' + bri + ')';
        var url = BASE + sc.key + '.webp';
        var VH = 1000 * sc.ih / sc.iw;
        var img = '';
        if (mode === 'full') {
            img = '<img class="agsc-img" src="' + url + '" alt="" draggable="false">';
        } else if (mode === 'glow') {
            // شفاف: نفس الصورة قناع لنفسها بالإضاءة (الغامق يختفي) — مع تقوية خفيفة عشان الوسط ما يبهت
            var id = 'agscm' + (++seq);
            img = '<svg class="agsc-img" viewBox="0 0 1000 ' + f1(VH) + '" preserveAspectRatio="none" aria-hidden="true"><defs>' +
                '<filter id="' + id + 'f" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="gamma" exponent=".75" amplitude="1.35"/><feFuncG type="gamma" exponent=".75" amplitude="1.35"/><feFuncB type="gamma" exponent=".75" amplitude="1.35"/></feComponentTransfer></filter>' +
                '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="' + f1(VH) + '"><image href="' + url + '" width="1000" height="' + f1(VH) + '" preserveAspectRatio="none" filter="url(#' + id + 'f)"/></mask></defs>' +
                '<image href="' + url + '" width="1000" height="' + f1(VH) + '" preserveAspectRatio="none" mask="url(#' + id + ')"/></svg>';
        }
        root.innerHTML = div('agsc-cv', 'left:' + f1(left) + 'px;top:' + f1(top) + 'px;width:' + f1(cw) + 'px;height:' + f1(ch) + 'px;font-size:' + f1(ch / 100) + 'px',
            div('agsc-kb', '--ox:' + (sc.fx * 100) + '%;--oy:' + (sc.fy * 100) + '%', img + FX[sc.key](VH)));
        host.appendChild(root);
        return root;
    }

    window.AGPStageScenes = { SCENES: SCENES, MODES: MODES, build: build, BASE: BASE };
})();
