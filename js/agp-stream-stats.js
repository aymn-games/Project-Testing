/**
 * AGP STREAM STATS — زر «عرض إحصائيات البث» بمكتبة الألعاب (games.html).
 *
 * خطوتين بنفس النافذة:
 *  1. الإعدادات: الاستريمر يختار الأقسام اللي يبيها (المكبّسين، الداعمين،
 *     الشير، المتفاعلين، الحاضرين) وعدد التوب لكل قسم — تنحفظ بـlocalStorage.
 *  2. الصورة: يجيب الملخص من GET /api/stream/session-stats?sections=...
 *     (backend/stats/live-session-stats.js — الصور تجي Data URL جاهزة)،
 *     ويرسمها بـCanvas داخل المتصفح: صورة واسم صاحب البث فوق، وتحتها كل
 *     قسم بترتيبه مع صورة واسم كل مستخدم. زر «حفظ الصورة» يحمّلها PNG.
 *
 * AGPStreamStats.open()
 */
(function () {
    'use strict';

    var W = 1080;
    var PAD = 56;
    var MAX_TOP = 20;
    var PREFS_KEY = 'agp:stream-stats-prefs';
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif';
    var COLORS = {
        bg1: '#120d22', bg2: '#050508', card: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)',
        text: '#f4f2fb', muted: '#968ea4', accent: '#b28cf5'
    };

    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

    function fmtTime(ts) {
        try { return new Date(ts).toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
    }

    // ترتيب الأقسام هنا = ترتيبها بالصورة وبالإعدادات
    var SECTIONS = [
        { key: 'likers', title: 'المكبّسين', desc: 'أكثر من كبّس على البث', color: '#f472b6', def: true,
          value: function (r) { return fmt(r.count) + ' تكبيسة'; },
          total: function (s) { return fmt(s.counts.likers) + ' مكبّس · ' + fmt(s.totals.likes) + ' تكبيسة'; } },
        { key: 'gifters', title: 'الداعمين', desc: 'أكثر من دعم بالهدايا (بالماس)', color: '#facc15', def: true,
          value: function (r) { return fmt(r.diamonds) + ' 💎'; },
          total: function (s) { return fmt(s.counts.gifters) + ' داعم · ' + fmt(s.totals.diamonds) + ' 💎'; } },
        { key: 'sharers', title: 'سوّوا شير', desc: 'اللي نشروا البث', color: '#38bdf8', def: true,
          value: function (r) { return fmt(r.count) + ' شير'; },
          total: function (s) { return fmt(s.counts.sharers) + ' شخص · ' + fmt(s.totals.shares) + ' شير'; } },
        { key: 'commenters', title: 'المتفاعلين', desc: 'أكثر من كتب تعليقات', color: '#34d399', def: false,
          value: function (r) { return fmt(r.count) + ' تعليق'; },
          total: function (s) { return fmt(s.counts.commenters) + ' متفاعل · ' + fmt(s.totals.comments) + ' تعليق'; } },
        { key: 'viewers', title: 'الحاضرين', desc: 'اللي دخلوا البث (حسب وقت الدخول)', color: '#a78bfa', def: false,
          value: function (r) { return fmtTime(r.joinedAt); },
          total: function (s) { return fmt(s.counts.viewers) + ' حاضر · أعلى مشاهدة ' + fmt(s.totals.peakViewers); } }
    ];

    /* ---------------- الإعدادات ---------------- */

    function loadPrefs() {
        var p = null;
        try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) {}
        var out = {};
        SECTIONS.forEach(function (sec) {
            var v = p && p[sec.key];
            out[sec.key] = {
                on: v ? Boolean(v.on) : sec.def,
                top: v ? clampTop(v.top) : (sec.key === 'viewers' ? 10 : 3)
            };
        });
        return out;
    }
    function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
    function clampTop(n) { return Math.min(MAX_TOP, Math.max(1, Math.floor(Number(n) || 1))); }

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

    function fmtDuration(ms) {
        var mins = Math.round((Number(ms) || 0) / 60000);
        var h = Math.floor(mins / 60), m = mins % 60;
        if (h && m) return h + ' ساعة و ' + m + ' دقيقة';
        if (h) return h + ' ساعة';
        return m + ' دقيقة';
    }

    function fmtDate(ts) {
        try {
            return new Date(ts).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) { return new Date(ts).toLocaleDateString(); }
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

    /** صورة دائرية، وإلا أول حرف من الاسم بدائرة ملوّنة. */
    function drawAvatar(ctx, img, name, cx, cy, r, color) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        if (img) {
            ctx.clip();
            ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fill();
            ctx.fillStyle = color;
            ctx.font = '700 ' + Math.round(r * 0.9) + 'px ' + FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(name || '?').trim().charAt(0) || '?', cx, cy + 2);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    var HEADER_H = 470, ROW_H = 78, SEC_HEAD = 96, SEC_GAP = 30;
    function sectionHeight(rows) { return SEC_HEAD + Math.max(rows.length, 1) * ROW_H + 24; }

    function drawSection(ctx, y, sec, stats, rows, imgs) {
        var x = PAD, w = W - PAD * 2, h = sectionHeight(rows);
        roundRect(ctx, x, y, w, h, 28);
        ctx.fillStyle = COLORS.card; ctx.fill();
        ctx.strokeStyle = COLORS.border; ctx.lineWidth = 2; ctx.stroke();
        // شريط لون القسم أعلى البطاقة
        roundRect(ctx, x + w - 140, y, 140, 6, 3);
        ctx.fillStyle = sec.color; ctx.fill();

        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'right';
        ctx.fillStyle = sec.color;
        ctx.font = '700 38px ' + FONT;
        ctx.fillText(sec.title, x + w - 32, y + 60);
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.muted;
        ctx.font = '500 23px ' + FONT;
        ctx.fillText(sec.total(stats), x + 32, y + 58);

        var ry = y + SEC_HEAD;
        if (!rows.length) {
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.muted;
            ctx.font = '500 26px ' + FONT;
            ctx.fillText('لا يوجد', x + w / 2, ry + 46);
            return h;
        }
        rows.forEach(function (r, i) {
            if (i % 2 === 0) {
                roundRect(ctx, x + 16, ry + 4, w - 32, ROW_H - 8, 16);
                ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
            }
            var mid = ry + ROW_H / 2;
            ctx.textBaseline = 'middle';
            // الترتيب ← الصورة ← الاسم (يمين)، القيمة يسار
            ctx.textAlign = 'center';
            ctx.fillStyle = i < 3 ? sec.color : COLORS.muted;
            ctx.font = '700 28px ' + FONT;
            ctx.fillText(String(i + 1), x + w - 52, mid);
            drawAvatar(ctx, imgs[i], r.name, x + w - 112, mid, 26, i < 3 ? sec.color : 'rgba(255,255,255,0.25)');

            var nameRight = x + w - 154;
            var nameMax = w - 154 - 300;
            ctx.textAlign = 'right';
            ctx.fillStyle = COLORS.text;
            ctx.font = '600 28px ' + FONT;
            var name = fitText(ctx, r.name, nameMax);
            ctx.fillText(name, nameRight, mid - (r.username && r.username !== r.name ? 12 : 0));
            if (r.username && r.username !== r.name) {
                ctx.fillStyle = COLORS.muted;
                ctx.font = '400 20px ' + FONT;
                ctx.direction = 'ltr';
                ctx.textAlign = 'right';
                ctx.fillText(fitText(ctx, '@' + r.username, nameMax), nameRight, mid + 20);
                ctx.direction = 'rtl';
            }
            ctx.textAlign = 'left';
            ctx.fillStyle = sec.color;
            ctx.font = '700 28px ' + FONT;
            ctx.fillText(sec.value(r), x + 36, mid);
            ry += ROW_H;
        });
        ctx.textBaseline = 'alphabetic';
        return h;
    }

    /**
     * @returns {Promise<HTMLCanvasElement>}
     */
    function draw(data, prefs) {
        var stats = data.stats;
        var streamer = data.streamer || { name: stats.username, avatar: null };
        var chosen = SECTIONS.filter(function (s) { return prefs[s.key].on; });

        // تحميل كل الصور قبل الرسم
        var jobs = [loadImg(streamer.avatar)];
        chosen.forEach(function (sec) {
            (stats.sections[sec.key] || []).forEach(function (r) { jobs.push(loadImg(r.avatar)); });
        });
        return Promise.all(jobs).then(function (loaded) {
            var streamerImg = loaded[0];
            var k = 1;
            var imgsBySec = {};
            chosen.forEach(function (sec) {
                imgsBySec[sec.key] = (stats.sections[sec.key] || []).map(function () { return loaded[k++]; });
            });

            var H = PAD + HEADER_H + chosen.reduce(function (s, sec) {
                return s + sectionHeight(stats.sections[sec.key] || []) + SEC_GAP;
            }, 0) + 70;

            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');
            ctx.direction = 'rtl';

            var g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, COLORS.bg1); g.addColorStop(1, COLORS.bg2);
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            var glow = ctx.createRadialGradient(W / 2, 120, 0, W / 2, 120, 600);
            glow.addColorStop(0, 'rgba(122,63,212,0.38)'); glow.addColorStop(1, 'rgba(122,63,212,0)');
            ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 800);

            // أعلى الصورة: صورة واسم صاحب البث
            var y = PAD;
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.accent;
            ctx.font = '600 26px ' + FONT;
            ctx.fillText(stats.live ? 'إحصائيات البث · شغّال الآن' : 'إحصائيات البث', W / 2, y + 26);
            drawAvatar(ctx, streamerImg, streamer.name, W / 2, y + 150, 92, COLORS.accent);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.text;
            ctx.font = '700 52px ' + FONT;
            ctx.fillText(fitText(ctx, streamer.name, W - PAD * 2), W / 2, y + 310);
            ctx.direction = 'ltr';
            ctx.fillStyle = COLORS.accent;
            ctx.font = '600 28px ' + FONT;
            ctx.fillText('@' + stats.username, W / 2, y + 354);
            ctx.direction = 'rtl';
            ctx.fillStyle = COLORS.muted;
            ctx.font = '500 24px ' + FONT;
            ctx.fillText(fmtDate(stats.startedAt) + '  ·  المدة: ' + fmtDuration(stats.durationMs), W / 2, y + 398);
            y += HEADER_H;

            // تحت: الأقسام المختارة بترتيبها
            chosen.forEach(function (sec) {
                y += drawSection(ctx, y, sec, stats, stats.sections[sec.key] || [], imgsBySec[sec.key]) + SEC_GAP;
            });

            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.muted;
            ctx.font = '500 22px ' + FONT;
            ctx.fillText('منصة ألعاب أيمن', W / 2, H - 36);
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

    /** شاشة الاختيار: كل قسم صف (العنوان يمين، التحكم يسار). */
    function showSettings(wrap) {
        var prefs = loadPrefs();
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'flex-start';
        body.innerHTML = '';

        var intro = document.createElement('p');
        intro.style.cssText = 'margin:0 0 10px;font-size:14px;line-height:1.7;color:#a8a3b5';
        intro.textContent = 'اختر الأقسام اللي تبيها بالصورة، وكم توب تبي بكل قسم (حتى ' + MAX_TOP + ').';
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
            label.children[0].style.color = sec.color;
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
                toggle.style.background = st.on ? sec.color : 'rgba(255,255,255,.15)';
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

        setActions(wrap, [{ label: 'إنشاء الصورة', style: BTN_PRIMARY, onClick: function () {
            if (!SECTIONS.some(function (s) { return prefs[s.key].on; })) {
                intro.textContent = 'اختر قسم واحد على الأقل.';
                intro.style.color = '#f5a3a3';
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

    window.AGPStreamStats = { open: open };
}());
