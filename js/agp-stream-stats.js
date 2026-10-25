/**
 * AGP STREAM STATS — زر «عرض إحصائيات البث» بمكتبة الألعاب (games.html).
 *
 * خطوتين بنفس النافذة:
 *  1. الإعدادات: الاستريمر يختار الأقسام اللي يبيها (المكبّسين، الداعمين،
 *     الشير، المتفاعلين، المشاهدين)، وعدد التوب لكل قسم، والخلفية (خلفيات
 *     جاهزة مرسومة بالكود، أو صورة يرفعها من جهازه) — تنحفظ بـlocalStorage.
 *  2. الصورة: بمقاس ستوري تيك توك 1080×1920. يجيب الملخص من
 *     GET /api/stream/session-stats?sections=... (backend/stats/live-session-stats.js
 *     — الصور تجي Data URL جاهزة)، ويرسمها بـCanvas داخل المتصفح: صورة واسم
 *     صاحب البث فوق، وتحتها الأقسام وكل قسم فيه أصحاب التوب بصورهم وأسمائهم.
 *     المحتوى يتصغّر تلقائياً عشان يدخل كامل بالمقاس. زر «حفظ الصورة» يحمّلها PNG.
 *
 * الخلفية المرفوعة ما تطلع من جهاز الاستريمر (ما ترتفع للسيرفر).
 *
 * AGPStreamStats.open()
 */
(function () {
    'use strict';

    var W = 1080;
    var H = 1920;
    var MAX_TOP = 10;           // أكثر من كذا ما يدخل مقروء بمقاس الستوري
    var PREFS_KEY = 'agp:stream-stats-prefs';
    var CUSTOM_BG_KEY = 'agp:stream-stats-bg';
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif';

    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

    /** مدة بالدقايق/الساعات بدون أي ص/م. */
    function fmtDuration(ms) {
        var mins = Math.round((Number(ms) || 0) / 60000);
        if (mins < 1) return 'أقل من دقيقة';
        var h = Math.floor(mins / 60), m = mins % 60;
        if (h && m) return h + ' ساعة و ' + m + ' دقيقة';
        if (h) return h + ' ساعة';
        return m + ' دقيقة';
    }

    // ترتيب الأقسام هنا = ترتيبها بالصورة وبالإعدادات
    var SECTIONS = [
        { key: 'likers', title: 'المكبّسين', desc: 'أكثر من كبّس على البث', def: true,
          value: function (r) { return fmt(r.count) + ' تكبيسة'; },
          total: function (s) { return fmt(s.counts.likers) + ' مكبّس · ' + fmt(s.totals.likes) + ' تكبيسة'; } },
        { key: 'gifters', title: 'الداعمين', desc: 'أكثر من دعم بالهدايا (بالماس)', def: true,
          value: function (r) { return fmt(r.diamonds) + ' 💎'; },
          total: function (s) { return fmt(s.counts.gifters) + ' داعم · ' + fmt(s.totals.diamonds) + ' 💎'; } },
        { key: 'sharers', title: 'سوّوا شير', desc: 'اللي نشروا البث', def: true,
          value: function (r) { return fmt(r.count) + ' شير'; },
          total: function (s) { return fmt(s.counts.sharers) + ' شخص · ' + fmt(s.totals.shares) + ' شير'; } },
        { key: 'commenters', title: 'المتفاعلين', desc: 'أكثر من كتب تعليقات', def: false,
          value: function (r) { return fmt(r.count) + ' تعليق'; },
          total: function (s) { return fmt(s.counts.commenters) + ' متفاعل · ' + fmt(s.totals.comments) + ' تعليق'; } },
        { key: 'viewers', title: 'المشاهدين', desc: 'أطول من جلس في البث', def: false,
          value: function (r) { return fmtDuration(r.watchMs); },
          total: function (s) { return fmt(s.counts.viewers) + ' مشاهد · أعلى مشاهدة ' + fmt(s.totals.peakViewers); } }
    ];

    /* ---------------- الخلفيات الجاهزة (مرسومة بالكود — بدون ملفات صور) ---------------- */

    /** عشوائي ثابت (نفس النجوم كل مرة). */
    function seeded(seed) {
        var s = seed;
        return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }

    function stars(ctx, w, h, count, seed, maxR, alpha) {
        var rnd = seeded(seed);
        for (var i = 0; i < count; i++) {
            var r = rnd() * maxR * (w / W) + 0.4;
            ctx.globalAlpha = (0.25 + rnd() * 0.75) * alpha;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function linear(ctx, w, h, stops) {
        var g = ctx.createLinearGradient(0, 0, 0, h);
        stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }

    function blob(ctx, x, y, r, color) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    var BACKGROUNDS = [
        { key: 'galaxy', name: 'المجرّة', accent: '#c4b5fd', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#0b0620'], [0.5, '#1a0b33'], [1, '#05030c']]);
            blob(ctx, w * 0.2, h * 0.25, w * 0.9, 'rgba(147,51,234,0.45)');
            blob(ctx, w * 0.85, h * 0.55, w * 0.8, 'rgba(236,72,153,0.28)');
            blob(ctx, w * 0.4, h * 0.85, w * 0.7, 'rgba(59,130,246,0.25)');
            stars(ctx, w, h, 260, 7, 2.2, 1);
        } },
        { key: 'night', name: 'نجوم الليل', accent: '#7dd3fc', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#020617'], [0.6, '#0b1a3a'], [1, '#0f2a52']]);
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.rotate(-0.5);
            var band = ctx.createLinearGradient(-w, 0, w, 0);
            band.addColorStop(0, 'rgba(255,255,255,0)');
            band.addColorStop(0.5, 'rgba(186,230,253,0.10)');
            band.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = band;
            ctx.fillRect(-w, -h * 0.12, w * 2, h * 0.24);
            ctx.restore();
            stars(ctx, w, h, 420, 11, 2, 1);
        } },
        { key: 'moon', name: 'ليلة القمر', accent: '#e0f2fe', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#0a1024'], [1, '#03050d']]);
            stars(ctx, w, h, 160, 23, 1.8, 0.8);
            var mx = w * 0.72, my = h * 0.16, mr = w * 0.2;
            blob(ctx, mx, my, mr * 3.2, 'rgba(191,219,254,0.22)');
            var m = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
            m.addColorStop(0, '#f8fafc');
            m.addColorStop(1, '#cbd5e1');
            ctx.fillStyle = m;
            ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(148,163,184,0.35)';
            [[-0.3, -0.1, 0.18], [0.25, 0.2, 0.12], [-0.05, 0.35, 0.09]].forEach(function (c) {
                ctx.beginPath(); ctx.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, Math.PI * 2); ctx.fill();
            });
        } },
        { key: 'desert', name: 'غروب الصحراء', accent: '#fde68a', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#1e1b4b'], [0.45, '#7c2d12'], [0.7, '#c2410c'], [1, '#431407']]);
            blob(ctx, w * 0.5, h * 0.62, w * 0.6, 'rgba(253,186,116,0.55)');
            stars(ctx, w, h * 0.35, 90, 31, 1.6, 0.7);
            [['#5a1d0c', 0.70, 0.06], ['#3d1408', 0.78, 0.05], ['#240b04', 0.87, 0.04]].forEach(function (d, i) {
                ctx.fillStyle = d[0];
                ctx.beginPath();
                ctx.moveTo(0, h);
                ctx.lineTo(0, h * d[1]);
                ctx.bezierCurveTo(w * (0.25 + i * 0.1), h * (d[1] - d[2]), w * (0.55 - i * 0.05), h * (d[1] + d[2]), w, h * (d[1] - d[2] / 2));
                ctx.lineTo(w, h);
                ctx.closePath();
                ctx.fill();
            });
        } },
        { key: 'ocean', name: 'أعماق البحر', accent: '#5eead4', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#0c4a6e'], [0.5, '#082f49'], [1, '#020617']]);
            ctx.save();
            for (var i = 0; i < 6; i++) {
                ctx.globalAlpha = 0.07;
                ctx.fillStyle = '#e0f2fe';
                ctx.beginPath();
                var x = w * (0.1 + i * 0.16);
                ctx.moveTo(x - w * 0.02, 0);
                ctx.lineTo(x + w * 0.04, 0);
                ctx.lineTo(x + w * 0.22, h * 0.8);
                ctx.lineTo(x + w * 0.08, h * 0.8);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            var rnd = seeded(41);
            for (var b = 0; b < 40; b++) {
                ctx.strokeStyle = 'rgba(186,230,253,' + (0.15 + rnd() * 0.3) + ')';
                ctx.lineWidth = 2 * (w / W);
                ctx.beginPath();
                ctx.arc(rnd() * w, h * 0.3 + rnd() * h * 0.7, (3 + rnd() * 9) * (w / W), 0, Math.PI * 2);
                ctx.stroke();
            }
        } },
        { key: 'aurora', name: 'الشفق', accent: '#86efac', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#020617'], [1, '#04121c']]);
            stars(ctx, w, h, 200, 53, 1.8, 0.9);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            [['rgba(34,197,94,0.30)', 0.22], ['rgba(20,184,166,0.25)', 0.30], ['rgba(168,85,247,0.18)', 0.38]].forEach(function (a, i) {
                ctx.fillStyle = a[0];
                ctx.beginPath();
                ctx.moveTo(0, h * a[1]);
                ctx.bezierCurveTo(w * 0.3, h * (a[1] - 0.12), w * 0.6, h * (a[1] + 0.1), w, h * (a[1] - 0.05 + i * 0.02));
                ctx.lineTo(w, h * (a[1] + 0.12));
                ctx.bezierCurveTo(w * 0.6, h * (a[1] + 0.22), w * 0.3, h * a[1], 0, h * (a[1] + 0.14));
                ctx.closePath();
                ctx.fill();
            });
            ctx.restore();
        } },
        { key: 'classic', name: 'كلاسيكي', accent: '#b28cf5', paint: function (ctx, w, h) {
            linear(ctx, w, h, [[0, '#120d22'], [1, '#050508']]);
            blob(ctx, w / 2, h * 0.08, w * 0.75, 'rgba(122,63,212,0.40)');
        } }
    ];
    var CUSTOM_ACCENT = '#38bdf8';

    function findBg(key) {
        for (var i = 0; i < BACKGROUNDS.length; i++) if (BACKGROUNDS[i].key === key) return BACKGROUNDS[i];
        return BACKGROUNDS[0];
    }

    /* ---------------- الإعدادات ---------------- */

    function loadPrefs() {
        var p = null;
        try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) {}
        var out = { bg: (p && typeof p.bg === 'string') ? p.bg : BACKGROUNDS[0].key };
        SECTIONS.forEach(function (sec) {
            var v = p && p[sec.key];
            out[sec.key] = {
                on: v ? Boolean(v.on) : sec.def,
                top: v ? clampTop(v.top) : (sec.key === 'viewers' ? 10 : 3)
            };
        });
        if (out.bg === 'custom' && !loadCustomBg()) out.bg = BACKGROUNDS[0].key;
        return out;
    }
    function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
    function clampTop(n) { return Math.min(MAX_TOP, Math.max(1, Math.floor(Number(n) || 1))); }

    function loadCustomBg() { try { return localStorage.getItem(CUSTOM_BG_KEY) || null; } catch (e) { return null; } }
    function saveCustomBg(dataUrl) {
        try { localStorage.setItem(CUSTOM_BG_KEY, dataUrl); return true; } catch (e) { return false; }
    }

    /**
     * صورة من جهاز الاستريمر → مقاس الستوري (قص وسطي) كـJPEG خفيف.
     * @returns {Promise<string>} Data URL
     */
    function prepareUpload(file) {
        return new Promise(function (resolve, reject) {
            if (!file || !/^image\//.test(file.type)) { reject(new Error('اختر ملف صورة')); return; }
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                var c = document.createElement('canvas');
                c.width = W; c.height = H;
                drawCover(c.getContext('2d'), img, W, H);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذّر فتح الصورة')); };
            img.src = url;
        });
    }

    function drawCover(ctx, img, w, h) {
        var s = Math.max(w / img.width, h / img.height);
        var dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }

    /* ---------------- الشبكة ---------------- */

    function apiBase() {
        return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }

    function fetchStats(prefs) {
        var t = token();
        if (!t) return Promise.reject(new Error('سجّل دخول بحسابك عشان تشوف إحصائيات البث'));
        var q = SECTIONS.filter(function (s) { return prefs[s.key].on; })
            .map(function (s) { return s.key + ':' + prefs[s.key].top; }).join(',');
        return fetch(apiBase() + '/api/stream/session-stats?sections=' + encodeURIComponent(q), { headers: { 'Authorization': 'Bearer ' + t } })
            .then(function (res) { return res.json(); }, function () { return null; })
            .then(function (d) {
                if (!d || !d.success) {
                    throw new Error(d && d.error === 'tiktok_not_linked'
                        ? 'اربط حساب تيك توك بحسابك في الموقع أولاً'
                        : 'تعذّر جلب إحصائيات البث — جرّب مرة ثانية');
                }
                return d;
            });
    }

    /** يحوّل Data URL لصورة جاهزة للرسم (أو null). */
    function loadImg(src) {
        return new Promise(function (resolve) {
            if (!src) { resolve(null); return; }
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
    }

    /* ---------------- الرسم ---------------- */

    function fitText(ctx, text, maxW) {
        text = String(text || '');
        if (ctx.measureText(text).width <= maxW) return text;
        while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        return text + '…';
    }

    /** صورة دائرية، وإلا أول حرف من الاسم. */
    function drawAvatar(ctx, img, name, cx, cy, r, ring, ringW) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        if (img) {
            ctx.clip();
            ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        } else {
            ctx.fillStyle = 'rgba(8,10,20,0.75)';
            ctx.fill();
            ctx.fillStyle = ring;
            ctx.font = '700 ' + Math.round(r * 0.95) + 'px ' + FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(name || '?').trim().charAt(0) || '?', cx, cy + r * 0.06);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = ring;
        ctx.lineWidth = ringW;
        ctx.stroke();
    }

    /** نجمة رباعية (✦) مرسومة — شكل ثابت بكل الأجهزة بدل خط الإيموجي. */
    function sparkle(ctx, cx, cy, r, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx, cy, cx + r, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy + r);
        ctx.quadraticCurveTo(cx, cy, cx - r, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy - r);
        ctx.fill();
    }

    var SIDE = 70;               // الهامش الجانبي
    // رأس الصورة (صاحب البث): كامل، أو مصغّر لما الأقسام كثيرة. top = بداية الأقسام
    var HEADS = {
        full: { caption: 110, avY: 270, avR: 110, name: 460, nameSize: 60, handle: 504, thanks: 570, thanksSize: 44, duration: 616, top: 660 },
        compact: { caption: 80, avY: 180, avR: 72, name: 312, nameSize: 48, handle: 352, thanks: 408, thanksSize: 38, duration: 450, top: 490 }
    };
    var BOTTOM = 1840;           // نهاية مساحة الأقسام (تحتها التوقيع)

    /**
     * تخطيط الأقسام بمقياس s: كل مستخدم في صف لحاله. لو cols = 2، الأقسام
     * الطويلة (MIN_SPLIT صف أو أكثر) تنقسم عمودين — اليمين فيه المراكز
     * الأولى — والقصيرة تبقى عمود واحد. يرجّع المواقع والارتفاع الكلي.
     */
    var MIN_SPLIT = 5;
    function layout(chosen, stats, s, cols) {
        var rowH = 70 * s, titleH = 122 * s, secGap = 46 * s, emptyH = 44 * s, colGap = 44 * s;
        var y = 0, secs = [];
        chosen.forEach(function (sec) {
            var rows = stats.sections[sec.key] || [];
            var c2 = cols === 2 && rows.length >= MIN_SPLIT ? 2 : 1;
            var listW = c2 === 1 ? Math.min(820, W - SIDE * 2) : W - SIDE * 2;
            var colW = (listW - (c2 - 1) * colGap) / c2;
            var perCol = Math.ceil(rows.length / c2);
            var top = y;
            y += titleH;
            var items = rows.map(function (r, i) {
                var c = Math.floor(i / perCol), ri = i % perCol;
                return {
                    r: r, rank: i + 1, colW: colW,
                    xRight: W / 2 + listW / 2 - c * (colW + colGap),
                    y: y + ri * rowH,
                    last: ri === perCol - 1 || i === rows.length - 1
                };
            });
            y += rows.length ? perCol * rowH : emptyH;
            secs.push({ sec: sec, top: top, items: items });
            y += secGap;
        });
        return { height: y - secGap, secs: secs, titleH: titleH, rowH: rowH };
    }

    /** صف مستخدم واحد: الترتيب ← الصورة ← الاسم (يمين)، والقيمة يسار. */
    function drawRow(ctx, item, L, sec, s, accent, img) {
        var xr = item.xRight, w = item.colW, cy = item.y + L.rowH / 2, top3 = item.rank <= 3;
        if (!item.last) {
            var g = ctx.createLinearGradient(xr - w, 0, xr, 0);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = g;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(xr - w, item.y + L.rowH); ctx.lineTo(xr, item.y + L.rowH); ctx.stroke();
        }

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = top3 ? accent : 'rgba(255,255,255,0.55)';
        ctx.font = '700 ' + (28 * s) + 'px ' + FONT;
        ctx.fillText(String(item.rank), xr - 20 * s, cy);

        var av = 25 * s, ax = xr - 48 * s - av;
        drawAvatar(ctx, img, item.r.name, ax, cy, av, top3 ? accent : 'rgba(255,255,255,0.3)', 2.5 * s);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = accent;
        ctx.font = '600 ' + (25 * s) + 'px ' + FONT;
        var val = sec.value(item.r);
        var valW = ctx.measureText(val).width;
        ctx.fillText(val, xr - w, cy);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = (top3 ? '700 ' : '600 ') + (29 * s) + 'px ' + FONT;
        var nameRight = ax - av - 16 * s;
        ctx.fillText(fitText(ctx, item.r.name, nameRight - (xr - w) - valW - 24 * s), nameRight, cy);
        ctx.textBaseline = 'alphabetic';
    }

    /**
     * @returns {Promise<HTMLCanvasElement>}
     */
    function draw(data, prefs) {
        var stats = data.stats;
        var streamer = data.streamer || { name: stats.username, avatar: null };
        var chosen = SECTIONS.filter(function (s) { return prefs[s.key].on; });
        var custom = prefs.bg === 'custom' ? loadCustomBg() : null;
        var bg = custom ? null : findBg(prefs.bg);
        var accent = bg ? bg.accent : CUSTOM_ACCENT;

        var jobs = [loadImg(streamer.avatar), loadImg(custom)];
        chosen.forEach(function (sec) {
            (stats.sections[sec.key] || []).forEach(function (r) { jobs.push(loadImg(r.avatar)); });
        });
        return Promise.all(jobs).then(function (loaded) {
            var streamerImg = loaded[0], customImg = loaded[1];
            var imgs = new Map(), k = 2;
            chosen.forEach(function (sec) {
                (stats.sections[sec.key] || []).forEach(function (r) { imgs.set(r, loaded[k++]); });
            });

            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');
            ctx.direction = 'rtl';

            // الخلفية + تظليل خفيف للقراءة
            if (customImg) drawCover(ctx, customImg, W, H);
            else bg.paint(ctx, W, H);
            var shade = ctx.createLinearGradient(0, 0, 0, H);
            // الصور المرفوعة تفاصيلها كثيرة — تظليل أقوى عشان النص يبان
            var k0 = customImg ? 1.6 : 1;
            shade.addColorStop(0, 'rgba(0,0,0,' + (0.30 * k0) + ')');
            shade.addColorStop(0.35, 'rgba(0,0,0,' + (0.42 * k0) + ')');
            shade.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.85, 0.62 * k0) + ')');
            ctx.fillStyle = shade;
            ctx.fillRect(0, 0, W, H);

            // أكبر مقياس يدخل بعمود واحد وبعمودين؛ عمود واحد إلا لو الخط صار صغير
            // وعمودين يعطي خط أكبر
            function fit(avail, cols, start, min) {
                var sc = start, lay = layout(chosen, stats, sc, cols);
                while (lay.height > avail && sc > min) { sc -= 0.05; lay = layout(chosen, stats, sc, cols); }
                return { s: sc, L: lay, avail: avail };
            }
            function best(topH) {
                var avail = BOTTOM - topH - 20;
                var one = fit(avail, 1, 1.3, 0.35);
                if (one.s >= 0.85 && one.L.height <= avail) return one;
                var two = fit(avail, 2, 1, 0.35);
                return two.s > one.s + 0.05 ? two : one;
            }
            // محتوى كثير → رأس مصغّر عشان الأسماء تاخذ مساحة أكبر
            var head = HEADS.full, pick = best(head.top);
            if (pick.s < 0.7) {
                var compact = best(HEADS.compact.top);
                if (compact.s > pick.s) { head = HEADS.compact; pick = compact; }
            }
            var s = pick.s, L = pick.L;
            var y0 = head.top + Math.max(0, (pick.avail - L.height) / 2);

            // الرأس: صورة واسم صاحب البث
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = accent;
            ctx.font = '700 26px ' + FONT;
            ctx.fillText(stats.live ? 'إحصائيات البث · شغّال الآن' : 'إحصائيات البث', W / 2, head.caption);
            drawAvatar(ctx, streamerImg, streamer.name, W / 2, head.avY, head.avR, accent, 7);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 ' + head.nameSize + 'px ' + FONT;
            ctx.fillText(fitText(ctx, streamer.name, W - SIDE * 2), W / 2, head.name);
            ctx.direction = 'ltr';
            ctx.fillStyle = accent;
            ctx.font = '600 28px ' + FONT;
            ctx.fillText('@' + stats.username, W / 2, head.handle);
            ctx.direction = 'rtl';
            // نفس خط عناوين الأقسام
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 ' + head.thanksSize + 'px ' + FONT;
            ctx.fillText('أنتم أجمل ما في البث، شكراً لكم', W / 2, head.thanks);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '500 24px ' + FONT;
            ctx.fillText('مدة البث: ' + fmtDuration(stats.durationMs), W / 2, head.duration);

            L.secs.forEach(function (block) {
                var sec = block.sec, ty = y0 + block.top + 44 * s;
                ctx.font = '700 ' + (40 * s) + 'px ' + FONT;
                var tw = ctx.measureText(sec.title).width;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(sec.title, W / 2, ty);
                sparkle(ctx, W / 2 + tw / 2 + 26 * s, ty, 11 * s, accent);
                sparkle(ctx, W / 2 - tw / 2 - 26 * s, ty, 11 * s, accent);
                // خطوط رفيعة على الجانبين
                [[SIDE, W / 2 - tw / 2 - 50 * s, 0], [W / 2 + tw / 2 + 50 * s, W - SIDE, 1]].forEach(function (seg) {
                    var g = ctx.createLinearGradient(seg[0], 0, seg[1], 0);
                    g.addColorStop(seg[2] ? 0 : 1, accent);
                    g.addColorStop(seg[2] ? 1 : 0, 'rgba(255,255,255,0)');
                    ctx.strokeStyle = g;
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(seg[0], ty); ctx.lineTo(seg[1], ty); ctx.stroke();
                });
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '500 ' + (20 * s) + 'px ' + FONT;
                ctx.fillText(sec.total(stats), W / 2, ty + 38 * s);

                if (!block.items.length) {
                    ctx.fillStyle = 'rgba(255,255,255,0.55)';
                    ctx.font = '500 ' + (22 * s) + 'px ' + FONT;
                    ctx.fillText('لا يوجد', W / 2, y0 + block.top + L.titleH + 20 * s);
                }
                block.items.forEach(function (item) {
                    drawRow(ctx, { r: item.r, rank: item.rank, colW: item.colW, xRight: item.xRight, y: y0 + item.y, last: item.last }, L, sec, s, accent, imgs.get(item.r));
                });
            });

            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '500 22px ' + FONT;
            ctx.fillText('منصة ألعاب أيمن', W / 2, H - 40);
            return canvas;
        });
    }

    /* ---------------- النافذة ---------------- */

    var BTN = 'height:46px;padding:0 22px;border-radius:999px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;';
    var BTN_PRIMARY = BTN + 'flex:1;border:none;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;';
    var BTN_GHOST = BTN + 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e7e3ef;';

    function modal() {
        var old = document.getElementById('agp-stream-stats');
        if (old) old.remove();
        var wrap = document.createElement('div');
        wrap.id = 'agp-stream-stats';
        wrap.setAttribute('dir', 'rtl');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', 'إحصائيات البث');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:' + FONT + ';color:#f4f2fb;';
        wrap.innerHTML =
            '<div style="width:min(520px,100%);max-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:24px;background:rgba(12,11,18,.97);border:1px solid rgba(178,140,245,.3);box-shadow:0 30px 90px rgba(0,0,0,.6)">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
                '<span style="font-weight:700;font-size:19px">إحصائيات البث</span>' +
                '<button type="button" data-close aria-label="إغلاق" style="width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e7e3ef;font-size:18px;cursor:pointer">✕</button>' +
              '</div>' +
              '<div data-body style="flex:1;min-height:120px;overflow:auto;border-radius:16px;display:flex;flex-direction:column;align-items:stretch"></div>' +
              '<div data-actions style="display:flex;gap:10px;flex-wrap:wrap"></div>' +
            '</div>';
        wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
        wrap.querySelector('[data-close]').addEventListener('click', function () { wrap.remove(); });
        document.body.appendChild(wrap);
        return wrap;
    }

    function setActions(wrap, buttons) {
        var actions = wrap.querySelector('[data-actions]');
        actions.innerHTML = '';
        buttons.forEach(function (b) {
            var el = document.createElement('button');
            el.type = 'button';
            el.textContent = b.label;
            el.style.cssText = b.style;
            el.addEventListener('click', b.onClick);
            actions.appendChild(el);
        });
    }

    function message(wrap, text, back) {
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'center';
        body.innerHTML = '';
        var p = document.createElement('p');
        p.style.cssText = 'margin:0;padding:24px 8px;text-align:center;line-height:1.8;color:#a8a3b5;font-size:15px';
        p.textContent = text;
        body.appendChild(p);
        setActions(wrap, back ? [{ label: 'رجوع للإعدادات', style: BTN_GHOST + 'flex:1;', onClick: function () { showSettings(wrap); } }] : []);
    }

    var ROW = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));';
    var STEP = 'width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e7e3ef;font:inherit;font-size:18px;line-height:1;cursor:pointer;';
    var HEADING = 'margin:16px 0 10px;font-size:15px;font-weight:700;color:#f4f2fb';

    /** بلاطة خلفية واحدة (معاينة مصغّرة + الاسم). */
    function bgTile(label, selected, paintPreview, onPick) {
        var tile = document.createElement('button');
        tile.type = 'button';
        tile.setAttribute('aria-pressed', String(selected));
        tile.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:14px;cursor:pointer;font:inherit;color:#e7e3ef;text-align:center;background:rgba(255,255,255,.03);border:2px solid ' + (selected ? '#a855f7' : 'rgba(255,255,255,.08)') + ';';
        var c = document.createElement('canvas');
        c.width = 108; c.height = 192;
        c.style.cssText = 'display:block;width:100%;aspect-ratio:9/16;border-radius:9px;background:#0b0b12';
        paintPreview(c.getContext('2d'), c.width, c.height);
        var dot = document.createElement('span');
        dot.style.cssText = 'position:absolute;top:12px;left:12px;width:16px;height:16px;border-radius:50%;border:2px solid #fff;background:' + (selected ? '#a855f7' : 'rgba(0,0,0,.5)');
        var name = document.createElement('span');
        name.style.cssText = 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        name.textContent = label;
        tile.appendChild(c); tile.appendChild(dot); tile.appendChild(name);
        tile.addEventListener('click', onPick);
        return tile;
    }

    /** شاشة الاختيار: الأقسام (العنوان يمين، التحكم يسار) ثم الخلفيات. */
    function showSettings(wrap) {
        var prefs = loadPrefs();
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'flex-start';
        body.innerHTML = '';

        var intro = document.createElement('p');
        intro.style.cssText = 'margin:0 0 10px;font-size:14px;line-height:1.7;color:#a8a3b5';
        intro.textContent = 'اختر الأقسام اللي تبيها بالصورة، وكم توب تبي بكل قسم (حتى ' + MAX_TOP + ')، والخلفية. الصورة بمقاس ستوري تيك توك.';
        body.appendChild(intro);

        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:10px';
        body.appendChild(list);

        SECTIONS.forEach(function (sec) {
            var st = prefs[sec.key];
            var row = document.createElement('div');
            row.style.cssText = ROW;

            var label = document.createElement('div');
            label.style.cssText = 'display:flex;flex-direction:column;gap:2px;text-align:right;min-width:0';
            label.innerHTML = '<span style="font-weight:700;font-size:15px"></span><span style="font-size:12.5px;color:#968ea4"></span>';
            label.children[0].textContent = sec.title;
            label.children[1].textContent = sec.desc;

            var ctl = document.createElement('div');
            ctl.style.cssText = 'display:flex;align-items:center;gap:8px;flex:none';

            var counter = document.createElement('div');
            counter.style.cssText = 'display:flex;align-items:center;gap:6px';
            var minus = document.createElement('button');
            minus.type = 'button'; minus.textContent = '−'; minus.style.cssText = STEP;
            minus.setAttribute('aria-label', 'أقل');
            var num = document.createElement('span');
            num.style.cssText = 'min-width:56px;text-align:center;font-weight:700;font-size:14px;white-space:nowrap';
            var plus = document.createElement('button');
            plus.type = 'button'; plus.textContent = '+'; plus.style.cssText = STEP;
            plus.setAttribute('aria-label', 'أكثر');
            // ترتيب DOM بالـrtl: + يمين، − يسار
            counter.appendChild(plus); counter.appendChild(num); counter.appendChild(minus);

            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.setAttribute('role', 'switch');
            toggle.style.cssText = 'position:relative;width:50px;height:28px;border-radius:999px;border:none;cursor:pointer;flex:none;transition:background .2s';
            var knob = document.createElement('span');
            knob.style.cssText = 'position:absolute;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .2s,right .2s';
            toggle.appendChild(knob);

            function paint() {
                num.textContent = 'توب ' + st.top;
                toggle.setAttribute('aria-checked', String(st.on));
                toggle.setAttribute('aria-label', sec.title);
                toggle.style.background = st.on ? '#a855f7' : 'rgba(255,255,255,.15)';
                knob.style.right = st.on ? '3px' : '25px';
                counter.style.opacity = st.on ? '1' : '.35';
                minus.disabled = plus.disabled = !st.on;
            }
            minus.addEventListener('click', function () { st.top = clampTop(st.top - 1); paint(); savePrefs(prefs); });
            plus.addEventListener('click', function () { st.top = clampTop(st.top + 1); paint(); savePrefs(prefs); });
            toggle.addEventListener('click', function () { st.on = !st.on; paint(); savePrefs(prefs); });
            paint();

            ctl.appendChild(counter);
            ctl.appendChild(toggle);
            row.appendChild(label);
            row.appendChild(ctl);
            list.appendChild(row);
        });

        // الخلفيات
        var bgHead = document.createElement('div');
        bgHead.style.cssText = HEADING;
        bgHead.textContent = 'الخلفية';
        body.appendChild(bgHead);
        var grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px';
        body.appendChild(grid);
        var uploadNote = document.createElement('p');
        uploadNote.style.cssText = 'margin:8px 0 0;font-size:12.5px;color:#968ea4;line-height:1.6';
        uploadNote.textContent = 'الخلفية المرفوعة تبقى في جهازك فقط.';
        body.appendChild(uploadNote);

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        body.appendChild(fileInput);

        function renderGrid() {
            grid.innerHTML = '';
            BACKGROUNDS.forEach(function (bg) {
                grid.appendChild(bgTile(bg.name, prefs.bg === bg.key, bg.paint, function () {
                    prefs.bg = bg.key; savePrefs(prefs); renderGrid();
                }));
            });
            var custom = loadCustomBg();
            if (custom) {
                grid.appendChild(bgTile('خلفيتك', prefs.bg === 'custom', function (ctx, w, h) {
                    var img = new Image();
                    img.onload = function () { drawCover(ctx, img, w, h); };
                    img.src = custom;
                }, function () { prefs.bg = 'custom'; savePrefs(prefs); renderGrid(); }));
            }
            var up = document.createElement('button');
            up.type = 'button';
            up.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:120px;padding:8px;border-radius:14px;cursor:pointer;font:inherit;font-size:12px;font-weight:600;color:#c6b4f2;background:rgba(122,63,212,.08);border:2px dashed rgba(178,140,245,.4)';
            up.innerHTML = '<span style="font-size:22px;line-height:1">+</span><span></span>';
            up.children[1].textContent = custom ? 'تغيير خلفيتك' : 'رفع خلفية من جهازك';
            up.addEventListener('click', function () { fileInput.click(); });
            grid.appendChild(up);
        }
        fileInput.addEventListener('change', function () {
            var f = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!f) return;
            uploadNote.textContent = 'جاري تجهيز الخلفية…';
            prepareUpload(f).then(function (dataUrl) {
                if (!saveCustomBg(dataUrl)) throw new Error('الصورة كبيرة على ذاكرة المتصفح — جرّب صورة أصغر');
                prefs.bg = 'custom'; savePrefs(prefs);
                uploadNote.textContent = 'الخلفية المرفوعة تبقى في جهازك فقط.';
                renderGrid();
            }).catch(function (err) {
                uploadNote.textContent = (err && err.message) || 'تعذّر رفع الخلفية';
            });
        });
        renderGrid();

        setActions(wrap, [{ label: 'إنشاء الصورة', style: BTN_PRIMARY, onClick: function () {
            if (!SECTIONS.some(function (s) { return prefs[s.key].on; })) {
                intro.textContent = 'اختر قسم واحد على الأقل.';
                intro.style.color = '#f5a3a3';
                body.scrollTop = 0;
                return;
            }
            generate(wrap, prefs);
        } }]);
    }

    function showImage(wrap, canvas, stats, prefs) {
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'flex-start';
        body.innerHTML = '';
        var img = new Image();
        img.alt = 'إحصائيات البث';
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:16px';
        img.src = canvas.toDataURL('image/png');
        body.appendChild(img);

        setActions(wrap, [
            { label: 'حفظ الصورة', style: BTN_PRIMARY, onClick: function () {
                var d = new Date(stats.startedAt);
                var name = 'stream-stats-' + stats.username + '-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '.png';
                canvas.toBlob(function (blob) {
                    if (!blob) return;
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = name;
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                }, 'image/png');
            } },
            { label: 'تعديل', style: BTN_GHOST, onClick: function () { showSettings(wrap); } },
            { label: 'تحديث', style: BTN_GHOST, onClick: function () { generate(wrap, prefs); } }
        ]);
    }

    function generate(wrap, prefs) {
        message(wrap, 'جاري تجهيز الصورة…');
        var fontsReady = (document.fonts && document.fonts.load)
            ? Promise.all([document.fonts.load('700 40px "IBM Plex Sans Arabic"'), document.fonts.load('500 24px "IBM Plex Sans Arabic"')]).catch(function () {})
            : Promise.resolve();
        Promise.all([fetchStats(prefs), fontsReady]).then(function (r) {
            var data = r[0];
            if (!document.body.contains(wrap)) return null;
            if (!data.stats) {
                message(wrap, 'ما فيه إحصائيات بث حتى الآن. الإحصائيات تنحسب لما تكون متصل بالبث من داخل لعبة، وتبقى متاحة ٢٤ ساعة بعد آخر بث.', true);
                return null;
            }
            return draw(data, prefs).then(function (canvas) {
                if (document.body.contains(wrap)) showImage(wrap, canvas, data.stats, prefs);
            });
        }).catch(function (err) {
            if (document.body.contains(wrap)) message(wrap, (err && err.message) || 'تعذّر تجهيز الصورة — جرّب مرة ثانية', true);
        });
    }

    function open() {
        showSettings(modal());
    }

    // shared: الخلفيات وأدوات الرسم والنافذة — تعيد استخدامها صورة البروفايل
    // (js/agp-profile-card.js) بنفس الشكل والمقاس.
    window.AGPStreamStats = {
        open: open,
        shared: {
            W: W, H: H, FONT: FONT, BACKGROUNDS: BACKGROUNDS, CUSTOM_ACCENT: CUSTOM_ACCENT,
            BTN_PRIMARY: BTN_PRIMARY, BTN_GHOST: BTN_GHOST, ROW: ROW, HEADING: HEADING,
            drawCover: drawCover, prepareUpload: prepareUpload, loadImg: loadImg, fitText: fitText,
            drawAvatar: drawAvatar, sparkle: sparkle, bgTile: bgTile, setActions: setActions
        }
    };
}());
