/**
 * AGP STREAM STATS — زر «عرض إحصائيات البث» بمكتبة الألعاب (games.html).
 *
 * يجيب ملخص البث الحالي/الأخير من GET /api/stream/session-stats
 * (backend/stats/live-session-stats.js)، ويرسمه صورة PNG بـCanvas داخل
 * متصفح الاستريمر نفسه (بدون أي معالجة صور بالسيرفر)، ويعرضها بنافذة مع
 * زر «حفظ الصورة».
 *
 * AGPStreamStats.open()
 */
(function () {
    'use strict';

    var W = 1080;
    var PAD = 56;
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif';
    var COLORS = {
        bg1: '#120d22', bg2: '#050508', card: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)',
        text: '#f4f2fb', muted: '#968ea4', accent: '#b28cf5',
        likes: '#f472b6', gifts: '#facc15', shares: '#38bdf8'
    };

    function apiBase() {
        return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }

    function fetchStats() {
        var t = token();
        if (!t) return Promise.reject(new Error('سجّل دخول بحسابك عشان تشوف إحصائيات البث'));
        return fetch(apiBase() + '/api/stream/session-stats', { headers: { 'Authorization': 'Bearer ' + t } })
            .then(function (res) { return res.json(); }, function () { return null; })
            .then(function (d) {
                if (!d || !d.success) {
                    throw new Error(d && d.error === 'tiktok_not_linked'
                        ? 'اربط حساب تيك توك بحسابك في الموقع أولاً'
                        : 'تعذّر جلب إحصائيات البث — جرّب مرة ثانية');
                }
                return d.stats;
            });
    }

    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

    function fmtDuration(ms) {
        var mins = Math.round((Number(ms) || 0) / 60000);
        var h = Math.floor(mins / 60), m = mins % 60;
        if (h && m) return h + ' ساعة و ' + m + ' دقيقة';
        if (h) return h + ' ساعة';
        return m + ' دقيقة';
    }

    function fmtDate(ts) {
        try {
            return new Date(ts).toLocaleString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (e) { return new Date(ts).toLocaleString(); }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function fitText(ctx, text, maxW) {
        text = String(text || '');
        if (ctx.measureText(text).width <= maxW) return text;
        while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        return text + '…';
    }

    // كل قائمة: عنوان + صفوف (أو سطر "لا يوجد")
    var ROW_H = 58, LIST_HEAD = 76, LIST_GAP = 28;
    function listHeight(rows) { return LIST_HEAD + Math.max(rows.length, 1) * ROW_H + 24; }

    function drawList(ctx, y, title, color, rows, valueOf, total) {
        var x = PAD, w = W - PAD * 2, h = listHeight(rows);
        roundRect(ctx, x, y, w, h, 28);
        ctx.fillStyle = COLORS.card; ctx.fill();
        ctx.strokeStyle = COLORS.border; ctx.lineWidth = 2; ctx.stroke();

        ctx.textAlign = 'right';
        ctx.fillStyle = color;
        ctx.font = '700 34px ' + FONT;
        ctx.fillText(title, x + w - 32, y + 50);
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.muted;
        ctx.font = '500 24px ' + FONT;
        ctx.fillText(total, x + 32, y + 50);

        var ry = y + LIST_HEAD;
        if (!rows.length) {
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.muted;
            ctx.font = '500 26px ' + FONT;
            ctx.fillText('لا يوجد', x + w / 2, ry + 38);
            return h;
        }
        rows.forEach(function (r, i) {
            if (i % 2 === 0) {
                roundRect(ctx, x + 16, ry + 4, w - 32, ROW_H - 8, 14);
                ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            }
            var mid = ry + ROW_H / 2 + 10;
            // الترتيب يمين، الاسم بعده، القيمة يسار
            ctx.textAlign = 'right';
            ctx.fillStyle = i < 3 ? color : COLORS.muted;
            ctx.font = '700 26px ' + FONT;
            ctx.fillText(String(i + 1), x + w - 36, mid);
            ctx.fillStyle = COLORS.text;
            ctx.font = '600 27px ' + FONT;
            var nameMax = w - 380;
            var name = fitText(ctx, r.name, nameMax);
            ctx.fillText(name, x + w - 84, mid);
            if (r.username && r.username !== r.name) {
                var nameW = ctx.measureText(name).width;
                ctx.fillStyle = COLORS.muted;
                ctx.font = '400 21px ' + FONT;
                var handleMax = nameMax - nameW - 16;
                if (handleMax > 60) {
                    ctx.direction = 'ltr'; ctx.textAlign = 'right';
                    ctx.fillText(fitText(ctx, '@' + r.username, handleMax), x + w - 84 - nameW - 14, mid);
                    ctx.direction = 'rtl';
                }
            }
            ctx.textAlign = 'left';
            ctx.fillStyle = color;
            ctx.font = '700 27px ' + FONT;
            ctx.fillText(valueOf(r), x + 36, mid);
            ry += ROW_H;
        });
        return h;
    }

    function draw(stats) {
        var lists = [
            { title: 'أكثر المكبّسين', color: COLORS.likes, rows: stats.topLikers, value: function (r) { return fmt(r.count) + ' تكبيسة'; }, total: fmt(stats.counts.likers) + ' مكبّس' },
            { title: 'الداعمين', color: COLORS.gifts, rows: stats.topGifters, value: function (r) { return fmt(r.diamonds) + ' 💎'; }, total: fmt(stats.counts.gifters) + ' داعم' },
            { title: 'سوّوا شير للبث', color: COLORS.shares, rows: stats.topSharers, value: function (r) { return fmt(r.count) + ' شير'; }, total: fmt(stats.counts.sharers) + ' شخص' }
        ];
        var HEADER_H = 230, TILES_H = 2 * 150 + 20;
        var H = PAD + HEADER_H + TILES_H + 40 + lists.reduce(function (s, l) { return s + listHeight(l.rows) + LIST_GAP; }, 0) + 70;

        var canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.direction = 'rtl';

        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, COLORS.bg1); g.addColorStop(1, COLORS.bg2);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        var glow = ctx.createRadialGradient(W * 0.8, 0, 0, W * 0.8, 0, 700);
        glow.addColorStop(0, 'rgba(122,63,212,0.35)'); glow.addColorStop(1, 'rgba(122,63,212,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 700);

        // العنوان
        var y = PAD;
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.accent;
        ctx.font = '600 26px ' + FONT;
        ctx.fillText(stats.live ? 'البث شغّال الآن' : 'ملخص البث', W - PAD, y + 30);
        ctx.fillStyle = COLORS.text;
        ctx.font = '700 64px ' + FONT;
        ctx.fillText('إحصائيات البث', W - PAD, y + 110);
        ctx.direction = 'ltr';
        ctx.font = '600 32px ' + FONT;
        ctx.fillStyle = COLORS.accent;
        ctx.fillText('@' + stats.username, W - PAD, y + 160);
        ctx.direction = 'rtl';
        ctx.fillStyle = COLORS.muted;
        ctx.font = '500 24px ' + FONT;
        ctx.fillText(fmtDate(stats.startedAt) + '  ·  المدة: ' + fmtDuration(stats.durationMs), W - PAD, y + 205);
        y += HEADER_H;

        // البطاقات (٣ × ٢)
        var tiles = [
            ['التكبيسات', fmt(stats.totals.likes), COLORS.likes],
            ['الدعم (ماس)', fmt(stats.totals.diamonds), COLORS.gifts],
            ['الشير', fmt(stats.totals.shares), COLORS.shares],
            ['التعليقات', fmt(stats.totals.comments), COLORS.text],
            ['متابعين جدد', fmt(stats.totals.follows), COLORS.text],
            ['أعلى مشاهدة', fmt(stats.totals.peakViewers), COLORS.text]
        ];
        var gap = 20, tw = (W - PAD * 2 - gap * 2) / 3, th = 150;
        tiles.forEach(function (t, i) {
            var col = i % 3, row = Math.floor(i / 3);
            var tx = W - PAD - (col + 1) * tw - col * gap, ty = y + row * (th + gap);
            roundRect(ctx, tx, ty, tw, th, 24);
            ctx.fillStyle = COLORS.card; ctx.fill();
            ctx.strokeStyle = COLORS.border; ctx.lineWidth = 2; ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = t[2];
            ctx.font = '700 46px ' + FONT;
            ctx.fillText(fitText(ctx, t[1], tw - 24), tx + tw / 2, ty + 72);
            ctx.fillStyle = COLORS.muted;
            ctx.font = '500 24px ' + FONT;
            ctx.fillText(t[0], tx + tw / 2, ty + 118);
        });
        y += TILES_H + 40;

        lists.forEach(function (l) {
            y += drawList(ctx, y, l.title, l.color, l.rows || [], l.value, l.total) + LIST_GAP;
        });

        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.muted;
        ctx.font = '500 22px ' + FONT;
        ctx.fillText('منصة ألعاب أيمن', W / 2, H - 36);
        return canvas;
    }

    /* ---------------- النافذة ---------------- */

    var BTN = 'height:46px;padding:0 22px;border-radius:999px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;';

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
            '<div data-box style="width:min(520px,100%);max-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:24px;background:rgba(12,11,18,.97);border:1px solid rgba(178,140,245,.3);box-shadow:0 30px 90px rgba(0,0,0,.6)">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
                '<span style="font-weight:700;font-size:19px">إحصائيات البث</span>' +
                '<button type="button" data-close aria-label="إغلاق" style="width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e7e3ef;font-size:18px;cursor:pointer">✕</button>' +
              '</div>' +
              '<div data-body style="flex:1;min-height:120px;overflow:auto;border-radius:16px;display:flex;align-items:flex-start;justify-content:center"></div>' +
              '<div data-actions style="display:flex;gap:10px;flex-wrap:wrap"></div>' +
            '</div>';
        wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
        wrap.querySelector('[data-close]').addEventListener('click', function () { wrap.remove(); });
        document.body.appendChild(wrap);
        return wrap;
    }

    function message(wrap, text) {
        var body = wrap.querySelector('[data-body]');
        body.style.alignItems = 'center';
        body.innerHTML = '';
        var p = document.createElement('p');
        p.style.cssText = 'margin:0;padding:24px 8px;text-align:center;line-height:1.8;color:#a8a3b5;font-size:15px';
        p.textContent = text;
        body.appendChild(p);
    }

    function show(wrap, canvas, stats) {
        var body = wrap.querySelector('[data-body]');
        body.style.alignItems = 'flex-start';
        body.innerHTML = '';
        var img = new Image();
        img.alt = 'إحصائيات البث';
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:16px';
        img.src = canvas.toDataURL('image/png');
        body.appendChild(img);

        var actions = wrap.querySelector('[data-actions]');
        actions.innerHTML = '';
        var save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'حفظ الصورة';
        save.style.cssText = BTN + 'flex:1;border:none;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;';
        save.addEventListener('click', function () {
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
        });
        var refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.textContent = 'تحديث';
        refresh.style.cssText = BTN + 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e7e3ef;';
        refresh.addEventListener('click', open);
        actions.appendChild(save);
        actions.appendChild(refresh);
    }

    function open() {
        var wrap = modal();
        message(wrap, 'جاري تجهيز الإحصائيات…');
        var fontsReady = (document.fonts && document.fonts.load)
            ? Promise.all([document.fonts.load('700 40px "IBM Plex Sans Arabic"'), document.fonts.load('500 24px "IBM Plex Sans Arabic"')]).catch(function () {})
            : Promise.resolve();
        Promise.all([fetchStats(), fontsReady]).then(function (r) {
            var stats = r[0];
            if (!document.body.contains(wrap)) return;
            if (!stats) {
                message(wrap, 'ما فيه إحصائيات بث حتى الآن. الإحصائيات تنحسب لما تكون متصل بالبث من داخل لعبة، وتبقى متاحة ٢٤ ساعة بعد آخر بث.');
                return;
            }
            show(wrap, draw(stats), stats);
        }).catch(function (err) {
            if (document.body.contains(wrap)) message(wrap, (err && err.message) || 'تعذّر جلب إحصائيات البث — جرّب مرة ثانية');
        });
    }

    window.AGPStreamStats = { open: open };
}());
