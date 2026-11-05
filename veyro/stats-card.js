/**
 * VEYRO — «إحصائيات البث»: صورة ملخص البث بمقاس ستوري إنستقرام / فيديو تيك توك
 * بالطول (1080×1920)، يخصصها الستريمر وينزّلها لجهازه.
 *
 * - البيانات: GET /api/stream/session-stats?sections=likers:5,... (آخر بث أو البث
 *   الحالي — backend/stats/live-session-stats.js). ما فيه بث محسوب = مثال بأسماء وهمية.
 * - الحساب التلقائي: GET/POST /api/stream/stats-watch — أول ما يبدأ يبث يتصل
 *   المراقب ويحسب لحاله (backend/stats/stream-stats-watcher.js).
 * - المحتوى كله داخل «منطقة الأمان» (SAFE) عشان واجهة إنستقرام وتيك توك
 *   (فوق: الاسم والأزرار، تحت: الكومنتات، يمين: أزرار التفاعل) ما تغطيه،
 *   ولو الأقسام كثيرة يتصغّر عشان يدخل كامل.
 * - الإعدادات تنحفظ بالمتصفح (localStorage)، والخلفية اللي يرفعها ما تطلع من جهازه.
 *
 * VeyroStats.mount(rootEl, { api, toast, O })
 */
(function () {
    'use strict';

    var W = 1080, H = 1920;
    // منطقة الأمان: فوق 220 (اسم الحساب وشريط الستوري)، تحت 320 (الكومنت والوصف)، يمين ويسار 90 (أزرار تيك توك)
    var SAFE = { l: 90, r: 990, t: 220, b: 1600 };
    var PREFS_KEY = 'veyro:stats-card:v2';
    var BG_KEY = 'veyro:stats-card-bg';
    var SITE_NAME = 'Veyro';

    var SECTIONS = [
        { key: 'likers', title: 'المكبّسين', icon: '❤️', unit: 'تكبيسة', field: 'count', def: true, n: 3 },
        { key: 'gifters', title: 'الداعمين', icon: '🎁', unit: 'coin', field: 'diamonds', def: true, n: 3 },
        { key: 'sharers', title: 'المشيرين', icon: '🔁', unit: 'شير', field: 'count', def: true, n: 3 },
        { key: 'viewers', title: 'توب المشاهدات', icon: '👁️', unit: 'time', field: 'watchMs', def: false, n: 3 },
        { key: 'commenters', title: 'المتفاعلين', icon: '💬', unit: 'تعليق', field: 'count', def: false, n: 3 },
        { key: 'donations', title: 'داعمين الدونيشن', icon: '💵', unit: 'money', field: 'amount', def: false, n: 3, soon: true }
    ];
    var TEMPLATES = [
        { key: 'classic', label: 'الأصلي' },
        { key: 'cards', label: 'بطاقات' },
        { key: 'podium', label: 'منصة التتويج' },
        { key: 'grid', label: 'عمودين' },
        { key: 'minimal', label: 'بسيط' }
    ];
    var BGS = [
        { key: 'veyro', label: 'فيرو' }, { key: 'night', label: 'ليل' }, { key: 'gold', label: 'ذهبي' },
        { key: 'neon', label: 'نيون' }, { key: 'emerald', label: 'زمرّدي' }, { key: 'sunset', label: 'غروب' }, { key: 'mono', label: 'داكن' }
    ];
    var DEFAULTS = {
        template: 'classic', bg: 's:galaxy', dim: 0.35, title: 'أنتم أجمل ما في البث، شكراً لكم', showStreamer: true, showTotals: true,
        sections: SECTIONS.map(function (s) { return { key: s.key, on: s.def, n: s.n }; }),
        fonts: { title: 'plex', name: 'plex', num: 'plex' },
        colors: { title: '#ffffff', name: '#ffffff', num: '#c4b5fd', ring: '#c4b5fd', accent: '#c4b5fd' }
    };
    var COLOR_PRESETS = ['#ffffff', '#ffd54a', '#cfc3dc', '#a99bb8', '#ff5fa8', '#4dd8ff', '#7cff6b', '#ff8a3d', '#f5c46b', '#14121a'];

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }
    function fmtDur(ms) {
        var mins = Math.round((Number(ms) || 0) / 60000);
        if (mins < 1) return 'أقل من دقيقة';
        var h = Math.floor(mins / 60), m = mins % 60;
        if (h && m) return h + ' ساعة و' + m + ' دقيقة';
        return h ? h + ' ساعة' : m + ' دقيقة';
    }
    function secDef(k) { return SECTIONS.filter(function (s) { return s.key === k; })[0]; }

    function loadPrefs() {
        var p = clone(DEFAULTS);
        try {
            var s = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
            if (s && typeof s === 'object') {
                ['template', 'bg', 'dim', 'title', 'showStreamer', 'showTotals'].forEach(function (k) { if (s[k] != null) p[k] = s[k]; });
                if (s.fonts) Object.assign(p.fonts, s.fonts);
                if (s.colors) Object.assign(p.colors, s.colors);
                if (Array.isArray(s.sections)) {
                    var byKey = {};
                    s.sections.forEach(function (x) { if (x && secDef(x.key)) byKey[x.key] = x; });
                    // الترتيب المحفوظ، وأي قسم جديد بالآخر
                    var order = s.sections.map(function (x) { return x && x.key; }).filter(function (k) { return secDef(k); });
                    SECTIONS.forEach(function (d) { if (order.indexOf(d.key) === -1) order.push(d.key); });
                    p.sections = order.map(function (k) { var x = byKey[k] || {}; var d = secDef(k); return { key: k, on: x.on != null ? Boolean(x.on) : d.def, n: Math.max(1, Math.min(10, Number(x.n) || d.n)) }; });
                }
            }
        } catch (e) { /* الافتراضي */ }
        if (p.bg === 'mine' && !loadBgData()) p.bg = DEFAULTS.bg;
        if (/^s:/.test(p.bg) && !sharedBg(p.bg)) p.bg = 'veyro';
        return p;
    }
    function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
    function loadBgData() { try { return localStorage.getItem(BG_KEY) || null; } catch (e) { return null; } }

    /* ---------------- رسم ---------------- */

    var imgCache = {};
    function loadImg(src) {
        if (!src) return Promise.resolve(null);
        if (imgCache[src]) return imgCache[src];
        imgCache[src] = new Promise(function (resolve) {
            var im = new Image();
            if (!/^data:|^blob:/.test(src)) im.crossOrigin = 'anonymous';
            im.onload = function () { resolve(im); };
            im.onerror = function () { resolve(null); };
            im.src = src;
        });
        return imgCache[src];
    }

    function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    function glow(ctx, x, y, r, color, a) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
    }
    function lin(ctx, stops, x0, y0, x1, y1) {
        var g = ctx.createLinearGradient(x0 || 0, y0 || 0, x1 == null ? 0 : x1, y1 == null ? H : y1);
        stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); });
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function dots(ctx, n, seed, maxR, alpha, color) {
        var rnd = seeded(seed);
        ctx.fillStyle = color || '#fff';
        for (var i = 0; i < n; i++) {
            ctx.globalAlpha = (0.2 + rnd() * 0.8) * alpha;
            ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, rnd() * maxR + 0.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /** خلفيات صورة الإحصائيات الأصلية (js/agp-stream-stats.js) بمفتاح 's:<key>'. */
    function sharedBgs() {
        var sh = window.AGPStreamStats && window.AGPStreamStats.shared;
        return sh && Array.isArray(sh.BACKGROUNDS) ? sh.BACKGROUNDS : [];
    }
    function sharedBg(k) {
        if (!/^s:/.test(k || '')) return null;
        return sharedBgs().filter(function (b) { return 's:' + b.key === k; })[0] || null;
    }

    function drawBg(ctx, p, mine) {
        var k = p.bg;
        var sb = sharedBg(k);
        if (sb) {
            sb.paint(ctx, W, H);
            // نفس تظليل الصورة الأصلية عشان النص يبان
            var sh = ctx.createLinearGradient(0, 0, 0, H);
            sh.addColorStop(0, 'rgba(0,0,0,.30)'); sh.addColorStop(0.35, 'rgba(0,0,0,.42)'); sh.addColorStop(1, 'rgba(0,0,0,.62)');
            ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
            return;
        }
        if (k === 'mine' && mine) {
            var s = Math.max(W / mine.width, H / mine.height), dw = mine.width * s, dh = mine.height * s;
            ctx.drawImage(mine, (W - dw) / 2, (H - dh) / 2, dw, dh);
            ctx.fillStyle = 'rgba(8,7,12,' + Math.max(0, Math.min(0.85, Number(p.dim) || 0)) + ')';
            ctx.fillRect(0, 0, W, H);
            return;
        }
        if (k === 'night') { lin(ctx, ['#0b1030', '#1a1146', '#2a0f3d']); dots(ctx, 260, 7, 2.2, 0.8); glow(ctx, 860, 260, 620, '#5b3bd6', 0.35); glow(ctx, 160, 1650, 700, '#c0359a', 0.25); return; }
        if (k === 'gold') {
            lin(ctx, ['#0c0a06', '#1b1408', '#0a0805']); glow(ctx, 540, 380, 900, '#f5c46b', 0.28); glow(ctx, 540, 1800, 700, '#a8741a', 0.25);
            ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = '#f5c46b';
            for (var i = -6; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * 160, 0); ctx.lineTo(i * 160 + 60, 0); ctx.lineTo(i * 160 + 760, H); ctx.lineTo(i * 160 + 700, H); ctx.fill(); }
            ctx.restore(); dots(ctx, 90, 3, 2, 0.5, '#f5c46b'); return;
        }
        if (k === 'neon') { lin(ctx, ['#07060d', '#100b1f', '#07060d']); glow(ctx, 120, 300, 700, '#ff2fa0', 0.4); glow(ctx, 980, 1500, 760, '#2fd9ff', 0.38); glow(ctx, 900, 400, 400, '#8a3dff', 0.3); return; }
        if (k === 'emerald') { lin(ctx, ['#03140f', '#06261c', '#020c09']); glow(ctx, 900, 250, 700, '#1fd18b', 0.3); glow(ctx, 100, 1600, 700, '#0f7a5b', 0.35); dots(ctx, 120, 11, 1.8, 0.5, '#b9f5d9'); return; }
        if (k === 'sunset') { lin(ctx, ['#2a0a24', '#5c1534', '#a83a2c', '#2a0d14']); glow(ctx, 540, 1250, 800, '#ff9a3d', 0.35); glow(ctx, 540, 200, 600, '#ff3d7f', 0.25); return; }
        if (k === 'mono') { lin(ctx, ['#121116', '#0b0a0e']); dots(ctx, 400, 5, 1.1, 0.25); glow(ctx, 540, 500, 800, '#ffffff', 0.05); return; }
        // veyro
        lin(ctx, ['#14121a', '#211c2b', '#14121a']); glow(ctx, 880, 240, 720, '#6e617f', 0.55); glow(ctx, 160, 1620, 760, '#42394f', 0.7); glow(ctx, 540, 960, 500, '#a99bb8', 0.12);
        ctx.save(); ctx.strokeStyle = 'rgba(207,195,220,.05)'; ctx.lineWidth = 2;
        for (var gx = 0; gx <= W; gx += 90) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
        for (var gy = 0; gy <= H; gy += 90) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
        ctx.restore();
    }

    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function hexA(hex, a) {
        var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        var n = m ? parseInt(m[1], 16) : 0xffffff;
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function fitText(ctx, t, max) {
        t = String(t || '');
        if (ctx.measureText(t).width <= max) return t;
        while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
        return t + '…';
    }

    function avatar(ctx, im, name, cx, cy, r, ring, ringW) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = '#2a2338'; ctx.fill();
        ctx.clip();
        if (im) ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2);
        else {
            ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(r * 0.9) + 'px "Noto Kufi Arabic",sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(name || '?').trim().charAt(0) || '?', cx, cy + r * 0.05);
        }
        ctx.restore();
        if (ringW) { ctx.beginPath(); ctx.arc(cx, cy, r + ringW / 2, 0, Math.PI * 2); ctx.strokeStyle = ring; ctx.lineWidth = ringW; ctx.stroke(); }
    }

    var MEDALS = [['#ffe08a', '#d49a1e'], ['#f1f3f7', '#9aa3b5'], ['#ffc39a', '#b8652e']];
    function rankBadge(ctx, i, cx, cy, r, p, F) {
        if (i < 3) {
            var g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
            g.addColorStop(0, MEDALS[i][0]); g.addColorStop(1, MEDALS[i][1]);
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
            ctx.fillStyle = '#1a1206';
        } else {
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
            ctx.fillStyle = hexA(p.colors.name, 0.85);
        }
        ctx.font = '800 ' + Math.round(r * 1.05) + 'px ' + F.num; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), cx, cy + 1);
    }

    /** قيمة القسم (رقم + وحدة)، مرسومة من x لليسار (بداية النص). يرجّع العرض. */
    function valueText(ctx, sec, r, x, y, size, p, F, coin, align) {
        var num, unit;
        if (sec.unit === 'time') {
            // أرقام بس (2:50 ساعة) — الحروف العربية وسط الأرقام تنقلب بالاتجاه
            var mins = Math.max(0, Math.round((Number(r.watchMs) || 0) / 60000));
            if (mins >= 60) { num = Math.floor(mins / 60) + ':' + ('0' + (mins % 60)).slice(-2); unit = 'ساعة'; }
            else { num = String(mins); unit = 'دقيقة'; }
        }
        else if (sec.unit === 'coin') { num = fmt(r.diamonds); unit = 'coin'; }
        else if (sec.unit === 'money') { num = '$' + fmt(r.amount); unit = ''; }
        else { num = fmt(r[sec.field]); unit = sec.unit; }
        ctx.textBaseline = 'middle';
        ctx.font = '800 ' + size + 'px ' + F.num;
        var nw = ctx.measureText(num).width;
        ctx.font = '600 ' + Math.round(size * 0.62) + 'px ' + F.name;
        var uw = unit === 'coin' ? size * 0.95 : unit ? ctx.measureText(unit).width + size * 0.3 : 0;
        var total = nw + uw;
        var x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
        ctx.direction = 'ltr'; ctx.textAlign = 'left';
        ctx.font = '800 ' + size + 'px ' + F.num; ctx.fillStyle = p.colors.num;
        ctx.fillText(num, x0, y);
        if (unit === 'coin') {
            if (coin) ctx.drawImage(coin, x0 + nw + size * 0.18, y - size * 0.4, size * 0.8, size * 0.8);
        } else if (unit) {
            ctx.direction = 'rtl'; ctx.textAlign = 'left';
            ctx.font = '600 ' + Math.round(size * 0.62) + 'px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.7);
            ctx.fillText(unit, x0 + nw + size * 0.3, y + 2);
        }
        ctx.direction = 'rtl';
        return total;
    }

    function sectionTotal(sec, data) {
        if (!data || !data.counts) return '';
        var c = data.counts, t = data.totals || {};
        if (sec.key === 'likers') return fmt(c.likers) + ' مكبّس · ' + fmt(t.likes) + ' تكبيسة';
        if (sec.key === 'gifters') return fmt(c.gifters) + ' داعم · ' + fmt(t.diamonds) + ' عملة';
        if (sec.key === 'sharers') return fmt(c.sharers) + ' شخص · ' + fmt(t.shares) + ' شير';
        if (sec.key === 'viewers') return fmt(c.viewers) + ' مشاهد · أعلى تواجد ' + fmt(t.peakViewers);
        if (sec.key === 'commenters') return fmt(c.commenters) + ' متفاعل · ' + fmt(t.comments) + ' تعليق';
        return '';
    }

    /* ---- القوالب: كل قسم «بلوك» له ارتفاع، ويرسم نفسه بعرض w ---- */

    function headerH() { return 70; }
    function drawSecHeader(ctx, sec, data, x, y, w, p, F) {
        var R = x + w;
        ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = '400 40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(sec.icon, R, y + 32);
        ctx.font = '800 40px ' + F.name; ctx.fillStyle = p.colors.accent;
        ctx.fillText(sec.title, R - 58, y + 32);
        if (p.showTotals && !sec.soon) {
            var tw = ctx.measureText(sec.title).width;
            ctx.font = '600 24px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.6);
            ctx.fillText(fitText(ctx, sectionTotal(sec, data), w - tw - 90), R - 58 - tw - 18, y + 36);
        }
    }

    function rowsOf(item) { return item.rows.length ? item.rows : null; }

    function drawRow(ctx, sec, r, i, x, y, w, h, p, F, A, coin, compact) {
        var R = x + w, cy = y + h / 2;
        var rad = compact ? 24 : 30;
        rankBadge(ctx, i, R - 22, cy, compact ? 17 : 20, p, F);
        avatar(ctx, A[r._ai], r.name, R - 22 - 30 - rad, cy, rad, p.colors.ring, i < 3 ? 4 : 3);
        var vw = valueText(ctx, sec, r, x + 8, cy, compact ? 30 : 36, p, F, coin, 'left');
        ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.font = '700 ' + (compact ? 30 : 34) + 'px ' + F.name; ctx.fillStyle = p.colors.name;
        var nx = R - 22 - 30 - rad * 2 - 18;
        ctx.fillText(fitText(ctx, r.name, nx - x - vw - 30), nx, cy + 2);
    }

    function emptyRow(ctx, x, y, w, p, F, text) {
        ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '600 28px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.5);
        ctx.fillText(text, x + w / 2, y + 36);
    }

    function cardBg(ctx, x, y, w, h, p) {
        rr(ctx, x, y, w, h, 34);
        var g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(255,255,255,.09)'); g.addColorStop(1, 'rgba(255,255,255,.035)');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = hexA(p.colors.accent, 0.35); ctx.lineWidth = 2; ctx.stroke();
    }

    var LAYOUT = {
        cards: {
            height: function (it) { return 30 + headerH() + (rowsOf(it) ? it.rows.length * 78 : 72) + 22; },
            draw: function (ctx, it, x, y, w, p, F, A, coin) {
                cardBg(ctx, x, y, w, this.height(it), p);
                drawSecHeader(ctx, it.sec, it.data, x + 32, y + 26, w - 64, p, F);
                var ry = y + 30 + headerH();
                if (!rowsOf(it)) { emptyRow(ctx, x, ry, w, p, F, it.empty); return; }
                it.rows.forEach(function (r, i) { drawRow(ctx, it.sec, r, i, x + 28, ry + i * 78, w - 56, 78, p, F, A, coin); });
            }
        },
        minimal: {
            height: function (it) { return headerH() + 14 + (rowsOf(it) ? it.rows.length * 70 : 72) + 20; },
            draw: function (ctx, it, x, y, w, p, F, A, coin) {
                drawSecHeader(ctx, it.sec, it.data, x, y, w, p, F);
                ctx.fillStyle = hexA(p.colors.accent, 0.5); ctx.fillRect(x, y + headerH() + 4, w, 2);
                var ry = y + headerH() + 14;
                if (!rowsOf(it)) { emptyRow(ctx, x, ry, w, p, F, it.empty); return; }
                it.rows.forEach(function (r, i) { drawRow(ctx, it.sec, r, i, x, ry + i * 70, w, 70, p, F, A, coin, true); });
            }
        },
        podium: {
            height: function (it) {
                var n = rowsOf(it) ? it.rows.length : 0;
                return 30 + headerH() + (n ? 300 : 72) + Math.max(0, n - 3) * 70 + 24;
            },
            draw: function (ctx, it, x, y, w, p, F, A, coin) {
                cardBg(ctx, x, y, w, this.height(it), p);
                drawSecHeader(ctx, it.sec, it.data, x + 32, y + 26, w - 64, p, F);
                var ry = y + 30 + headerH();
                if (!rowsOf(it)) { emptyRow(ctx, x, ry, w, p, F, it.empty); return; }
                // الأول بالنص (أكبر)، الثاني يمين، الثالث يسار
                var spots = [[x + w / 2, 70, ry + 92], [x + w * 0.8, 54, ry + 118], [x + w * 0.2, 54, ry + 118]];
                it.rows.slice(0, 3).forEach(function (r, i) {
                    var s = spots[i];
                    var g = ctx.createRadialGradient(s[0], s[2], s[1] * 0.6, s[0], s[2], s[1] * 1.8);
                    g.addColorStop(0, hexA(MEDALS[i][0], 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g; ctx.fillRect(s[0] - s[1] * 2, s[2] - s[1] * 2, s[1] * 4, s[1] * 4);
                    avatar(ctx, A[r._ai], r.name, s[0], s[2], s[1], MEDALS[i][0], 6);
                    rankBadge(ctx, i, s[0], s[2] + s[1] + 4, 20, p, F);
                    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.font = '700 ' + (i ? 28 : 32) + 'px ' + F.name; ctx.fillStyle = p.colors.name;
                    ctx.fillText(fitText(ctx, r.name, w * 0.3), s[0], s[2] + s[1] + 48);
                    valueText(ctx, it.sec, r, s[0], s[2] + s[1] + 88, i ? 28 : 32, p, F, coin, 'center');
                });
                it.rows.slice(3).forEach(function (r, j) { drawRow(ctx, it.sec, r, j + 3, x + 28, ry + 300 + j * 70, w - 56, 70, p, F, A, coin, true); });
            }
        },
        grid: {
            pair: true,
            height: function (it) { return 26 + 60 + (rowsOf(it) ? it.rows.length * 66 : 72) + 18; },
            draw: function (ctx, it, x, y, w, p, F, A, coin, h) {
                cardBg(ctx, x, y, w, h || this.height(it), p);
                var R = x + w - 24;
                ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                ctx.font = '400 32px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
                ctx.fillText(it.sec.icon, R, y + 52);
                ctx.font = '800 32px ' + F.name; ctx.fillStyle = p.colors.accent;
                ctx.fillText(fitText(ctx, it.sec.title, w - 100), R - 46, y + 52);
                var ry = y + 26 + 60;
                if (!rowsOf(it)) { emptyRow(ctx, x, ry, w, p, F, it.empty); return; }
                // عمود عريض (لما الصورة تتصغّر): الاسم يمين والرقم يسار بنفس السطر
                if (w > 560) { it.rows.forEach(function (r, i) { drawRow(ctx, it.sec, r, i, x + 20, ry + i * 66, w - 40, 66, p, F, A, coin, true); }); return; }
                it.rows.forEach(function (r, i) {
                    var cy = ry + i * 66 + 33, RR = x + w - 20;
                    avatar(ctx, A[r._ai], r.name, RR - 24, cy, 24, i < 3 ? MEDALS[i][0] : p.colors.ring, 3);
                    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                    ctx.font = '700 26px ' + F.name; ctx.fillStyle = p.colors.name;
                    ctx.fillText(fitText(ctx, r.name, w - 210), RR - 62, cy - 13);
                    ctx.direction = 'rtl';
                    valueText(ctx, it.sec, r, RR - 62, cy + 17, 22, p, F, coin, 'right');
                });
            }
        }
    };

    /**
     * التذييل (داخل منطقة الأمان من تحت): اسم الموقع، وتحته «تحت مظلة منصة ألعاب أيمن» — بدون رابط.
     * يرجّع أعلى نقطة فيه (نهاية مساحة الأقسام).
     */
    function drawFooter(ctx, p, F) {
        var cx = W / 2, fy = SAFE.b;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.direction = 'rtl';
        ctx.font = '500 23px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.6);
        ctx.fillText('تحت مظلة منصة ألعاب أيمن', cx, fy - 6);
        ctx.direction = 'ltr';
        ctx.font = '800 38px ' + F.num; ctx.fillStyle = p.colors.accent;
        ctx.fillText(SITE_NAME, cx, fy - 46);
        ctx.direction = 'rtl';
        // نجمتين صغار على جنب الاسم
        var tw = ctx.measureText(SITE_NAME).width;
        sparkle(ctx, cx + tw / 2 + 22, fy - 58, 8, p.colors.accent);
        sparkle(ctx, cx - tw / 2 - 22, fy - 58, 8, p.colors.accent);
        return fy - 100;
    }

    /** نجمة رباعية (✦) مرسومة — نفس شكلها بكل الأجهزة. */
    function sparkle(ctx, x, y, r, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
    }

    /*
     * «الأصلي»: نفس تنسيق صورة إحصائيات البث بمكتبة الألعاب (js/agp-stream-stats.js) —
     * عنوان صغير، صورة كبيرة، الاسم واليوزر، الشكر ومدة البث، وكل قسم عنوانه بالنص
     * بين نجمتين وخطوط تتلاشى، وصفوف بخط فاصل. هنا كله داخل منطقة الأمان.
     */
    var CL_HEADS = {
        full: { caption: 26, avY: 150, avR: 104, name: 328, nameSize: 58, handle: 370, thanks: 432, thanksSize: 44, duration: 476, top: 510 },
        compact: { caption: 26, avY: 112, avR: 70, name: 232, nameSize: 46, handle: 270, thanks: 322, thanksSize: 38, duration: 362, top: 392 }
    };
    var CL_SIDE = SAFE.l;
    function clLayout(items, s, cols) {
        var rowH = 70 * s, titleH = 122 * s, secGap = 46 * s, emptyH = 50 * s, colGap = 44 * s;
        var full = SAFE.r - SAFE.l, y = 0, secs = [];
        items.forEach(function (it) {
            var rows = it.rows;
            var c2 = cols === 2 && rows.length >= 5 ? 2 : 1;
            var listW = c2 === 1 ? Math.min(820, full) : full;
            var colW = (listW - (c2 - 1) * colGap) / c2;
            var perCol = Math.ceil(rows.length / c2);
            var top = y;
            y += titleH;
            var list = rows.map(function (r, i) {
                var c = Math.floor(i / perCol), ri = i % perCol;
                return { r: r, rank: i + 1, colW: colW, xRight: W / 2 + listW / 2 - c * (colW + colGap), y: y + ri * rowH, last: ri === perCol - 1 || i === rows.length - 1 };
            });
            y += rows.length ? perCol * rowH : emptyH;
            secs.push({ it: it, top: top, rows: list });
            y += secGap;
        });
        return { height: Math.max(0, y - secGap), secs: secs, titleH: titleH, rowH: rowH };
    }

    function renderClassic(ctx, p, data, A, extra, F) {
        var accent = p.colors.accent, cx = W / 2;
        var bottom = drawFooter(ctx, p, F) - 16;
        var items = data.items;
        function fit(top, cols) {
            var avail = bottom - top, sc = 1.3, L = clLayout(items, sc, cols);
            while (L.height > avail && sc > 0.35) { sc -= 0.05; L = clLayout(items, sc, cols); }
            // لو ما دخل بعد: المقياس بالضبط عشان ما يطلع شي من منطقة الأمان
            if (L.height > avail) { sc = sc * avail / L.height; L = clLayout(items, sc, cols); }
            return { s: sc, L: L, avail: avail };
        }
        function best(top) {
            var one = fit(top, 1);
            if (one.s >= 0.85 && one.L.height <= one.avail) return one;
            var two = fit(top, 2);
            return two.s > one.s + 0.05 ? two : one;
        }
        var head = p.showStreamer ? CL_HEADS.full : null;
        var top = SAFE.t + (head ? head.top : 120);
        var pick = best(top);
        if (head && pick.s < 0.7) {
            var c = best(SAFE.t + CL_HEADS.compact.top);
            if (c.s > pick.s) { head = CL_HEADS.compact; pick = c; top = SAFE.t + head.top; }
        }
        var s = pick.s, L = pick.L;
        var y0 = top + Math.max(0, (pick.avail - L.height) / 2);
        var T = SAFE.t;

        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'rtl';
        ctx.fillStyle = accent;
        ctx.font = '700 26px ' + F.name;
        ctx.fillText(data.live ? 'إحصائيات البث · شغّال الآن' : 'إحصائيات البث', cx, T + 26);
        var thanks = String(p.title || '').trim();
        if (head) {
            var st = data.streamer || {};
            avatar(ctx, extra.streamerImg, st.name, cx, T + head.avY, head.avR, p.colors.ring, 7);
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = p.colors.name;
            ctx.font = '700 ' + head.nameSize + 'px ' + F.name;
            ctx.fillText(fitText(ctx, st.name || '', SAFE.r - SAFE.l), cx, T + head.name);
            if (data.username) {
                ctx.direction = 'ltr'; ctx.fillStyle = accent; ctx.font = '600 28px ' + F.num;
                ctx.fillText('@' + data.username, cx, T + head.handle);
                ctx.direction = 'rtl';
            }
            if (thanks) { ctx.fillStyle = p.colors.title; ctx.font = '700 ' + head.thanksSize + 'px ' + F.title; ctx.fillText(fitText(ctx, thanks, SAFE.r - SAFE.l), cx, T + head.thanks); }
            if (p.showTotals) { ctx.fillStyle = hexA(p.colors.name, 0.6); ctx.font = '500 24px ' + F.name; ctx.fillText('مدة البث: ' + fmtDur(data.durationMs), cx, T + head.duration); }
        } else {
            if (thanks) { ctx.fillStyle = p.colors.title; ctx.font = '700 44px ' + F.title; ctx.fillText(fitText(ctx, thanks, SAFE.r - SAFE.l), cx, T + 80); }
            if (p.showTotals) { ctx.fillStyle = hexA(p.colors.name, 0.6); ctx.font = '500 24px ' + F.name; ctx.fillText('مدة البث: ' + fmtDur(data.durationMs), cx, T + 120); }
        }

        L.secs.forEach(function (b) {
            var it = b.it, ty = y0 + b.top + 44 * s;
            ctx.font = '700 ' + (40 * s) + 'px ' + F.title;
            var tw = ctx.measureText(it.sec.title).width;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
            ctx.fillStyle = p.colors.title;
            ctx.fillText(it.sec.title, cx, ty);
            sparkle(ctx, cx + tw / 2 + 26 * s, ty, 11 * s, accent);
            sparkle(ctx, cx - tw / 2 - 26 * s, ty, 11 * s, accent);
            [[CL_SIDE, cx - tw / 2 - 50 * s, 0], [cx + tw / 2 + 50 * s, W - CL_SIDE, 1]].forEach(function (seg) {
                var g = ctx.createLinearGradient(seg[0], 0, seg[1], 0);
                g.addColorStop(seg[2] ? 0 : 1, accent); g.addColorStop(seg[2] ? 1 : 0, 'rgba(255,255,255,0)');
                ctx.strokeStyle = g; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(seg[0], ty); ctx.lineTo(seg[1], ty); ctx.stroke();
            });
            if (p.showTotals && !it.sec.soon) {
                ctx.fillStyle = hexA(p.colors.name, 0.6); ctx.font = '500 ' + (20 * s) + 'px ' + F.name;
                ctx.fillText(sectionTotal(it.sec, it.data), cx, ty + 38 * s);
            }
            if (!b.rows.length) {
                ctx.fillStyle = hexA(p.colors.name, 0.55); ctx.font = '500 ' + (22 * s) + 'px ' + F.name;
                ctx.fillText(it.empty, cx, y0 + b.top + L.titleH + 20 * s);
            }
            b.rows.forEach(function (row) {
                var xr = row.xRight, w = row.colW, ry = y0 + row.y, cy = ry + L.rowH / 2, top3 = row.rank <= 3;
                if (!row.last) {
                    var g2 = ctx.createLinearGradient(xr - w, 0, xr, 0);
                    g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.14)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.strokeStyle = g2; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(xr - w, ry + L.rowH); ctx.lineTo(xr, ry + L.rowH); ctx.stroke();
                }
                ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
                ctx.fillStyle = top3 ? accent : 'rgba(255,255,255,0.55)';
                ctx.font = '700 ' + (28 * s) + 'px ' + F.num;
                ctx.fillText(String(row.rank), xr - 20 * s, cy);
                var av = 25 * s, ax = xr - 48 * s - av;
                avatar(ctx, A[row.r._ai], row.r.name, ax, cy, av, top3 ? p.colors.ring : 'rgba(255,255,255,0.3)', 2.5 * s);
                var vw = valueText(ctx, it.sec, row.r, xr - w, cy, Math.round(25 * s), p, F, extra.coin, 'left');
                ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
                ctx.fillStyle = p.colors.name;
                ctx.font = (top3 ? '700 ' : '600 ') + (29 * s) + 'px ' + F.name;
                var nameRight = ax - av - 16 * s;
                ctx.fillText(fitText(ctx, row.r.name, nameRight - (xr - w) - vw - 24 * s), nameRight, cy);
            });
        });
        if (!items.length) {
            ctx.textAlign = 'center'; ctx.font = '600 32px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.6);
            ctx.fillText('اختر قسم واحد على الأقل', cx, (top + bottom) / 2);
        }
    }

    /** يرسم الصورة كاملة. data = ملخص البث (أو مثال)، A = صور البروفايل محمّلة. */
    function render(canvas, p, data, A, extra) {
        var ctx = canvas.getContext('2d');
        canvas.width = W; canvas.height = H;
        ctx.direction = 'rtl';
        drawBg(ctx, p, extra.mine);
        var O = window.AGPStreamOverlay;
        function fam(k) { var f = O.fontOf(k); return O.fontStack(f); }
        var F = { title: fam(p.fonts.title), name: fam(p.fonts.name), num: fam(p.fonts.num) };
        if (p.template === 'classic') { renderClassic(ctx, p, data, A, extra, F); return; }
        var cx = W / 2, y = SAFE.t;

        // صاحب البث + العنوان
        if (p.showStreamer) {
            var st = data.streamer || {};
            avatar(ctx, extra.streamerImg, st.name, cx, y + 70, 70, p.colors.ring, 7);
            ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '800 44px ' + F.name; ctx.fillStyle = p.colors.name;
            ctx.fillText(fitText(ctx, st.name || '', SAFE.r - SAFE.l), cx, y + 180);
            y += 220;
        }
        var title = String(p.title || '').trim();
        if (title) {
            ctx.font = '400 56px ' + F.title; ctx.fillStyle = p.colors.title; ctx.textAlign = 'center';
            var words = title.split(/\s+/), lines = [], line = '';
            words.forEach(function (wd) { var t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > SAFE.r - SAFE.l && line) { lines.push(line); line = wd; } else line = t; });
            if (line) lines.push(line);
            lines.slice(0, 2).forEach(function (l, i) { ctx.fillText(l, cx, y + 36 + i * 70); });
            y += Math.min(2, lines.length) * 70 + 10;
        }
        if (data.summaryLine) {
            ctx.font = '600 28px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.65); ctx.textAlign = 'center';
            ctx.fillText(data.summaryLine, cx, y + 20);
            y += 50;
        }

        var bottom = drawFooter(ctx, p, F) - 20;

        // الأقسام: نقيس، ونصغّر لو ما دخلت، ونوسّط بالمساحة
        var L = LAYOUT[p.template] || LAYOUT.cards;
        var items = data.items;
        var gap = 28;
        function measure(Lx) {
            var bl = [];
            if (Lx.pair) {
                for (var i = 0; i < items.length; i += 2) {
                    var a = items[i], b = items[i + 1];
                    bl.push({ pair: [a, b], h: Math.max(Lx.height(a), b ? Lx.height(b) : 0) });
                }
            } else items.forEach(function (it) { bl.push({ it: it, h: Lx.height(it) }); });
            return { blocks: bl, total: bl.reduce(function (s2, x) { return s2 + x.h; }, 0) + gap * Math.max(0, bl.length - 1) };
        }
        var avail = bottom - (y + 30);
        var m = measure(L);
        // أقسام كثيرة ما تدخل مقروءة بعمود واحد → عمودين تلقائياً
        if (!L.pair && avail / m.total < 0.62) { L = LAYOUT.grid; m = measure(L); }
        var blocks = m.blocks, total = m.total;
        // يتصغّر لين يدخل كامل — المحتوى ما يطلع من منطقة الأمان أبداً
        var sc = Math.min(1, avail / Math.max(1, total));
        var top0 = y + 30 + Math.max(0, (avail - total * sc) / 2);
        // عمود واحد: ما يتمدد عرضه زيادة لو تصغّر (يبقى مقروء)؛ العمودين ياخذون العرض كامل
        var w = L.pair ? (SAFE.r - SAFE.l) / sc : Math.min((SAFE.r - SAFE.l) / sc, 1150);
        var left0 = SAFE.l + ((SAFE.r - SAFE.l) - w * sc) / 2;
        ctx.save();
        ctx.translate(left0, top0);
        ctx.scale(sc, sc);
        var yy = 0;
        blocks.forEach(function (bl) {
            if (bl.pair) {
                var cw = (w - 24) / 2;
                L.draw(ctx, bl.pair[0], cw + 24, yy, cw, p, F, A, extra.coin, bl.h);
                if (bl.pair[1]) L.draw(ctx, bl.pair[1], 0, yy, cw, p, F, A, extra.coin, bl.h);
            } else L.draw(ctx, bl.it, 0, yy, w, p, F, A, extra.coin);
            yy += bl.h + gap;
        });
        ctx.restore();
        if (!items.length) {
            ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.font = '600 32px ' + F.name; ctx.fillStyle = hexA(p.colors.name, 0.6);
            ctx.fillText('اختر قسم واحد على الأقل', cx, (y + bottom) / 2);
        }
    }

    /* ---------------- بيانات المثال ---------------- */

    var SAMPLE_NAMES = ['أبو فهد', 'نوره', 'سلطان', 'ريم', 'عبدالله', 'جود', 'تركي', 'لمى', 'فيصل', 'سارة'];
    function sampleData() {
        function list(field, base, step) { return SAMPLE_NAMES.map(function (n, i) { var r = { name: n, count: 0, diamonds: 0, watchMs: 0, amount: 0 }; r[field] = Math.round(base - i * step); return r; }); }
        return {
            sample: true,
            username: 'your_name',
            streamer: { name: 'اسم حسابك', avatar: null },
            durationMs: 2.5 * 3600000,
            totals: { likes: 48210, diamonds: 12850, shares: 96, comments: 2210, peakViewers: 340 },
            counts: { likers: 412, gifters: 58, sharers: 41, viewers: 1290, commenters: 230 },
            sections: { likers: list('count', 9800, 850), gifters: list('diamonds', 5200, 480), sharers: list('count', 12, 1), viewers: list('watchMs', 2.4 * 3600000, 600000), commenters: list('count', 420, 35), donations: list('amount', 100, 9) }
        };
    }

    /* ---------------- الواجهة ---------------- */

    function mount(root, deps) {
        var O = window.AGPStreamOverlay;
        var p = loadPrefs();
        var data = null, real = null, A = [], extra = { mine: null, coin: null, streamerImg: null };
        var watch = null;
        var tab = 'data';
        var mineUrl = loadBgData();

        function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
        function btn(label, cls, fn) { var b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; }
        function row(label, ctrl, col, sub) {
            var r = el('div', 'ob-row' + (col ? ' col' : ''));
            var l = el('span', 'ob-label', label);
            if (sub) l.appendChild(el('small', null, sub));
            r.appendChild(l); r.appendChild(ctrl); return r;
        }
        function pills(opts, cur, fn) {
            var g = el('div', 'ob-pills');
            opts.forEach(function (o) { g.appendChild(btn(o.label, 'ob-pill' + (o.value === cur ? ' on' : ''), function () { fn(o.value); })); });
            return g;
        }
        function toggle(on, fn) {
            var l = el('label', 'ob-toggle'), i = document.createElement('input');
            i.type = 'checkbox'; i.checked = Boolean(on); i.addEventListener('change', function () { fn(i.checked); });
            l.appendChild(i); l.appendChild(el('span')); return l;
        }
        function colorRow(label, key) {
            var g = el('div', 'ob-sw');
            COLOR_PRESETS.forEach(function (c) {
                var b = btn('', c === p.colors[key] ? 'on' : '', function () { p.colors[key] = c; changed(true); });
                b.style.background = c; b.setAttribute('aria-label', c); g.appendChild(b);
            });
            var pk = document.createElement('input'); pk.type = 'color'; pk.value = /^#[0-9a-f]{6}$/i.test(p.colors[key]) ? p.colors[key] : '#ffffff';
            pk.title = 'لون مخصص'; pk.addEventListener('input', function () { p.colors[key] = pk.value; changed(false); });
            g.appendChild(pk);
            return row(label, g, true);
        }
        function fontRow(label, key, sample) {
            var g = el('div', 'ob-fgrid vs-fonts');
            O.FONTS.forEach(function (f) {
                O.loadFont(f);
                var b = btn('', 'ob-fbtn' + (f.key === p.fonts[key] ? ' on' : ''), function () { p.fonts[key] = f.key; changed(true); });
                var s = el('span', null, sample); s.style.fontFamily = O.fontStack(f); s.style.fontWeight = String(f.b);
                b.appendChild(s); b.appendChild(el('span', null, f.label)); g.appendChild(b);
            });
            return row(label, g, true);
        }

        root.textContent = '';
        var wrap = el('div', 'vs-wrap');
        var side = el('div', 'vs-side glass');
        var stage = el('div', 'vs-stage');
        var frame = el('div', 'vs-frame');
        var canvas = el('canvas', 'vs-canvas');
        canvas.width = W; canvas.height = H;
        var guide = el('div', 'vs-safe');
        guide.style.cssText = 'left:' + (SAFE.l / W * 100) + '%;right:' + ((W - SAFE.r) / W * 100) + '%;top:' + (SAFE.t / H * 100) + '%;bottom:' + ((H - SAFE.b) / H * 100) + '%';
        guide.appendChild(el('span', null, 'منطقة الأمان'));
        frame.appendChild(canvas); frame.appendChild(guide);
        stage.appendChild(frame);
        var sbar = el('div', 'vs-sbar');
        var gl = el('label', 'vs-gtog');
        var gi = document.createElement('input'); gi.type = 'checkbox'; gi.checked = true;
        gi.addEventListener('change', function () { guide.hidden = !gi.checked; });
        gl.appendChild(gi); gl.appendChild(document.createTextNode(' اعرض حدود الأمان'));
        sbar.appendChild(gl);
        sbar.appendChild(el('span', 'vs-size', '1080 × 1920 · ستوري إنستقرام وتيك توك'));
        stage.appendChild(sbar);
        var acts = el('div', 'vs-acts');
        acts.appendChild(btn('⬇ حفظ الصورة', 'ob-btn primary lg', download));
        if (navigator.share) acts.appendChild(btn('مشاركة', 'ob-btn ghost lg', share));
        stage.appendChild(acts);
        wrap.appendChild(stage);
        wrap.appendChild(side);
        root.appendChild(wrap);

        var drawQ = 0;
        function redraw() {
            if (drawQ) return;
            drawQ = requestAnimationFrame(function () { drawQ = 0; draw(); });
        }
        function changed(repaint) { savePrefs(p); if (repaint) paintSide(); prepare().then(redraw); }

        /** يجهّز البيانات (الأقسام المختارة بالعدد) والصور والخطوط قبل الرسم. */
        function prepare() {
            var src = real || sampleData();
            var items = [];
            A = [];
            p.sections.forEach(function (s) {
                if (!s.on) return;
                var d = secDef(s.key);
                var rows = (src.sections && src.sections[s.key]) ? src.sections[s.key].slice(0, s.n) : [];
                rows = rows.map(function (r) { var c = Object.assign({}, r); c._ai = A.length; A.push(r.avatar || null); return c; });
                items.push({ sec: d, rows: rows, data: src, empty: d.soon && !src.sample ? 'يتفعّل بعد ربط Streamlabs' : 'ما فيه أحد بهالقسم' });
            });
            var t = src.totals || {};
            data = {
                streamer: src.streamer, items: items, username: src.username || '', live: Boolean(src.live), durationMs: src.durationMs,
                summaryLine: p.showTotals ? ['مدة البث ' + fmtDur(src.durationMs), fmt(t.likes) + ' تكبيسة', fmt(t.diamonds) + ' عملة'].join('  ·  ') : ''
            };
            var fonts = ['title', 'name', 'num'].map(function (k) { var f = O.fontOf(p.fonts[k]); O.loadFont(f); return document.fonts ? document.fonts.load(f.b + ' 40px "' + f.family + '"').catch(function () {}) : null; });
            var imgs = A.map(function (src2, i) { return loadImg(src2).then(function (im) { A[i] = im; }); });
            imgs.push(loadImg((src.streamer || {}).avatar).then(function (im) { extra.streamerImg = im; }));
            imgs.push(loadImg('../assets/overlay-frames/coin.webp').then(function (im) { extra.coin = im; }));
            imgs.push(p.bg === 'mine' && mineUrl ? loadImg(mineUrl).then(function (im) { extra.mine = im; }) : Promise.resolve());
            return Promise.all(fonts.concat(imgs));
        }
        function draw() { render(canvas, p, data, A, extra); }

        function fileName() { var d = new Date(); return 'veyro-stats-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '.png'; }
        function download() {
            canvas.toBlob(function (b) {
                if (!b) { deps.toast('ما قدرنا نحفظ الصورة'); return; }
                var a = document.createElement('a');
                a.href = URL.createObjectURL(b); a.download = fileName();
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
                deps.toast('انحفظت الصورة ✓');
            }, 'image/png');
        }
        function share() {
            canvas.toBlob(function (b) {
                if (!b) return;
                var f = new File([b], fileName(), { type: 'image/png' });
                if (navigator.canShare && !navigator.canShare({ files: [f] })) { download(); return; }
                navigator.share({ files: [f], title: 'إحصائيات البث' }).catch(function () { /* ألغاها */ });
            }, 'image/png');
        }

        function setMine(file) {
            if (!file || !/^image\//.test(file.type)) { deps.toast('اختر صورة'); return; }
            var url = URL.createObjectURL(file);
            loadImg(url).then(function (im) {
                if (!im) { deps.toast('ما قدرنا نفتح الصورة'); return; }
                // نصغّرها لمقاس الصورة ونحفظها بالمتصفح بس (ما ترتفع للسيرفر)
                var c = document.createElement('canvas'); c.width = W; c.height = H;
                var x = c.getContext('2d'), s = Math.max(W / im.width, H / im.height);
                x.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
                mineUrl = c.toDataURL('image/jpeg', 0.86);
                try { localStorage.setItem(BG_KEY, mineUrl); } catch (e) { /* كبيرة — تبقى لهالجلسة */ }
                URL.revokeObjectURL(url);
                p.bg = 'mine';
                changed(true);
            });
        }

        function fetchData() {
            var q = p.sections.filter(function (s) { return s.key !== 'donations'; }).map(function (s) { return s.key + ':10'; }).join(',');
            return deps.api('GET', '/api/stream/session-stats?sections=' + q).then(function (d) {
                real = d && d.success && d.stats ? Object.assign({}, d.stats, { streamer: d.streamer }) : null;
                if (real) real.sections.donations = [];
                if (d && d.error === 'tiktok_not_linked') real = null;
            }).catch(function () { real = null; });
        }
        function fetchWatch() {
            return deps.api('GET', '/api/stream/stats-watch').then(function (d) { watch = d && d.success ? d : null; }).catch(function () { watch = null; });
        }

        function statusCard() {
            var c = el('div', 'ob-card vs-status');
            if (real) {
                c.appendChild(el('h3', null, real.live ? '🔴 البث شغّال — الأرقام تتحدّث' : 'آخر بث'));
                var when = real.startedAt ? new Date(real.startedAt).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '';
                c.appendChild(el('div', 'ob-hint', (when ? when + ' · ' : '') + 'مدة ' + fmtDur(real.durationMs) + ' · ' + fmt((real.totals || {}).likes) + ' تكبيسة · ' + fmt((real.totals || {}).diamonds) + ' عملة'));
            } else {
                c.appendChild(el('h3', null, 'مثال'));
                c.appendChild(el('div', 'ob-hint', 'ما فيه بث محسوب لحسابك للحين — الصورة الحين بأسماء وأرقام مثال. فعّل «الحساب التلقائي» تحت وابدأ بثك.'));
            }
            c.appendChild(btn('↻ حدّث الأرقام', 'ob-btn ghost', function () { Promise.all([fetchData(), fetchWatch()]).then(function () { paintSide(); prepare().then(redraw); deps.toast('تحدّثت ✓'); }); }));
            return c;
        }
        function watchCard() {
            var c = el('div', 'ob-card');
            c.appendChild(el('h3', null, 'الحساب التلقائي'));
            if (!watch) { c.appendChild(el('div', 'ob-hint', 'ما قدرنا نجيب الحالة — حدّث الصفحة.')); return c; }
            if (!watch.linked) { c.appendChild(el('div', 'ob-hint', 'اربط حساب تيك توك وثّقه من البروفايل أول، وبعدها فعّل الحساب التلقائي.')); return c; }
            c.appendChild(row('احسب إحصائيات بثي لحالها', toggle(watch.on, function (v) {
                deps.api('POST', '/api/stream/stats-watch', { on: v }).then(function (d) {
                    if (d && d.success) { watch = d; deps.toast(v ? 'تمام ✓ — أول ما تبدأ بث يبدأ يحسب' : 'وقف الحساب التلقائي'); }
                    else deps.toast('ما تغيّر — جرّب بعد شوي');
                    paintSide();
                }).catch(function () { deps.toast('ما تغيّر — تأكد من الاتصال'); });
            }), false, '@' + watch.username));
            var st = watch.watching;
            c.appendChild(el('div', 'ob-hint', !watch.on ? 'طافي: الإحصائيات تنحسب بس لما تشغّل لعبة من الموقع.'
                : st ? (st.status === 'connected' ? '🟢 متصل ببثك الحين ويحسب.' : '🟡 يتصل ببثك…')
                    : 'شغّال: كل دقيقتين يشيّك لو بدأت بث، ويتصل ويحسب التكبيس والدعم والشير والمشاهدين — بدون ما تفتح الموقع.'));
            return c;
        }

        function paintSide() {
            side.textContent = '';
            var hd = el('div', 'ob-phead');
            var t = el('div');
            t.appendChild(el('h2', null, 'إحصائيات البث'));
            t.appendChild(el('p', null, 'صورة ملخص بثك بمقاس الستوري — خصصها ونزّلها لجهازك.'));
            hd.appendChild(t);
            side.appendChild(hd);
            var tabs = el('div', 'ob-ptabs vs-tabs');
            [['data', 'البيانات'], ['sections', 'الأقسام'], ['look', 'القالب والخلفية'], ['style', 'الخطوط والألوان']].forEach(function (x) {
                tabs.appendChild(btn(x[1], x[0] === tab ? 'on' : '', function () { tab = x[0]; paintSide(); }));
            });
            side.appendChild(tabs);
            var b = el('div', 'ob-pbody');
            if (tab === 'data') {
                b.appendChild(statusCard());
                b.appendChild(watchCard());
                var ti = document.createElement('textarea');
                ti.className = 'ob-input'; ti.rows = 2; ti.maxLength = 80; ti.value = p.title;
                ti.addEventListener('input', function () { p.title = ti.value; changed(false); });
                b.appendChild(row('النص فوق', ti, true, 'عنوان الصورة — سطرين بالكثير'));
                b.appendChild(row('اسمك وصورتك', toggle(p.showStreamer, function (v) { p.showStreamer = v; changed(false); })));
                b.appendChild(row('الأرقام الإجمالية', toggle(p.showTotals, function (v) { p.showTotals = v; changed(false); }), false, 'مدة البث والمجاميع تحت العنوان وبكل قسم'));
            } else if (tab === 'sections') {
                b.appendChild(el('div', 'ob-hint', 'شغّل اللي تبيه يطلع بالصورة، وحدد كم شخص بكل قسم، ورتّبها بالأسهم.'));
                p.sections.forEach(function (s, i) {
                    var d = secDef(s.key);
                    var r = el('div', 'vs-sec' + (s.on ? '' : ' off'));
                    r.appendChild(el('span', 'ic', d.icon));
                    var tx = el('div', 'tx');
                    tx.appendChild(el('b', null, d.title));
                    tx.appendChild(el('small', null, d.soon ? 'قريباً — بعد ربط Streamlabs' : d.unit === 'coin' ? 'بالعملات' : d.unit === 'time' ? 'أطول تواجد بالبث' : 'بعدد ' + (d.unit === 'تكبيسة' ? 'التكبيسات' : d.unit === 'شير' ? 'الشير' : 'التعليقات')));
                    r.appendChild(tx);
                    var cnt = el('div', 'vs-cnt');
                    cnt.appendChild(btn('−', 'ob-pill', function () { s.n = Math.max(1, s.n - 1); changed(true); }));
                    cnt.appendChild(el('b', null, String(s.n)));
                    cnt.appendChild(btn('+', 'ob-pill', function () { s.n = Math.min(10, s.n + 1); changed(true); }));
                    r.appendChild(cnt);
                    var mv = el('div', 'vs-mv');
                    var up = btn('↑', 'ob-ib', function () { if (i) { p.sections.splice(i - 1, 0, p.sections.splice(i, 1)[0]); changed(true); } });
                    up.setAttribute('aria-label', 'لفوق'); mv.appendChild(up);
                    var dn = btn('↓', 'ob-ib', function () { if (i < p.sections.length - 1) { p.sections.splice(i + 1, 0, p.sections.splice(i, 1)[0]); changed(true); } });
                    dn.setAttribute('aria-label', 'لتحت'); mv.appendChild(dn);
                    r.appendChild(mv);
                    r.appendChild(toggle(s.on, function (v) { s.on = v; changed(true); }));
                    b.appendChild(r);
                });
            } else if (tab === 'look') {
                b.appendChild(row('شكل القالب', pills(TEMPLATES.map(function (x) { return { label: x.label, value: x.key }; }), p.template, function (v) { p.template = v; changed(true); }), true));
                var g = el('div', 'vs-bgs');
                sharedBgs().map(function (b) { return { key: 's:' + b.key, label: b.name, accent: b.accent }; }).concat(BGS).forEach(function (bg) {
                    var c = el('canvas'); c.width = 108; c.height = 192;
                    var x = c.getContext('2d'); x.scale(0.1, 0.1); drawBg(x, Object.assign({}, p, { bg: bg.key }), null);
                    var bb = btn('', 'vs-bg' + (p.bg === bg.key ? ' on' : ''), function () {
                        p.bg = bg.key;
                        // خلفيات الصورة الأصلية لها لونها المميّز: الأرقام والحدود والنجوم تاخذه
                        if (bg.accent) { p.colors.accent = bg.accent; p.colors.num = bg.accent; p.colors.ring = bg.accent; }
                        changed(true);
                    });
                    bb.appendChild(c); bb.appendChild(el('span', null, bg.label)); g.appendChild(bb);
                });
                var up2 = el('label', 'vs-bg mine' + (p.bg === 'mine' ? ' on' : ''));
                var fin = document.createElement('input'); fin.type = 'file'; fin.accept = 'image/*'; fin.hidden = true;
                fin.addEventListener('change', function () { var f = fin.files && fin.files[0]; fin.value = ''; setMine(f); });
                up2.appendChild(fin);
                if (mineUrl) { var im = el('img'); im.src = mineUrl; im.alt = ''; up2.appendChild(im); }
                else up2.appendChild(el('i', null, '+'));
                up2.appendChild(el('span', null, mineUrl ? 'صورتك (غيّرها)' : 'صورتك'));
                if (mineUrl) up2.addEventListener('click', function (e) { if (p.bg !== 'mine') { e.preventDefault(); p.bg = 'mine'; changed(true); } });
                g.appendChild(up2);
                b.appendChild(row('الخلفية', g, true, 'صورتك تبقى بجهازك وما ترتفع'));
                if (p.bg === 'mine') {
                    var dim = document.createElement('input'); dim.type = 'range'; dim.className = 'ob-range'; dim.min = 0; dim.max = 0.85; dim.step = 0.01; dim.value = p.dim;
                    dim.addEventListener('input', function () { p.dim = Number(dim.value); changed(false); });
                    b.appendChild(row('تعتيم الخلفية', dim, false, 'عشان الأسماء تبان واضحة'));
                }
            } else {
                b.appendChild(fontRow('خط العنوان', 'title', 'شكراً'));
                b.appendChild(fontRow('خط الأسماء', 'name', 'أبو فهد'));
                b.appendChild(fontRow('خط الأرقام', 'num', '12,850'));
                b.appendChild(colorRow('لون العنوان', 'title'));
                b.appendChild(colorRow('لون الأسماء', 'name'));
                b.appendChild(colorRow('لون الأرقام', 'num'));
                b.appendChild(colorRow('حدود الصور', 'ring'));
                b.appendChild(colorRow('لون الأقسام والموقع', 'accent'));
                b.appendChild(btn('رجّع الافتراضي', 'ob-btn ghost', function () { p.fonts = clone(DEFAULTS.fonts); p.colors = clone(DEFAULTS.colors); changed(true); }));
            }
            side.appendChild(b);
        }

        paintSide();
        prepare().then(redraw);
        Promise.all([fetchData(), fetchWatch()]).then(function () { paintSide(); return prepare(); }).then(redraw);

        return {
            refresh: function () { Promise.all([fetchData(), fetchWatch()]).then(function () { paintSide(); return prepare(); }).then(redraw); },
            _state: function () { return { prefs: p, real: real, watch: watch }; }
        };
    }

    window.VeyroStats = { mount: mount, render: render, SAFE: SAFE, W: W, H: H };
})();
