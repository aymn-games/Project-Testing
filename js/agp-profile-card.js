/**
 * AGP PROFILE CARD — زر «صورة بروفايلي» بصفحة البروفايل (profile.html).
 *
 * نفس فكرة «إحصائيات البث» (js/agp-stream-stats.js) وبنفس خلفياتها ومقاسها
 * (ستوري 1080×1920)، خطوتين بنفس النافذة:
 *  1. الإعدادات: صاحب الحساب يختار وش يطلع بالصورة — مراكزه بالتصنيفات
 *     الأسبوعية (اللاعبين والاستريمرز، اللي داخلها فقط) وإحصائياته — والخلفية
 *     (جاهزة أو صورة من جهازه). تنحفظ بـlocalStorage.
 *  2. الصورة: صورته واسمه و@يوزر تيك توك والـID فوق، وتحتها المراكز
 *     والإحصائيات المختارة. زر «حفظ الصورة» يحمّلها PNG بجهازه.
 *
 * المراكز من GET /api/public/user-ranks?id=<custom_id> (getUserWeeklyRanks
 * بـauth-service.js). الخلفية المرفوعة ما تطلع من الجهاز.
 *
 * AGPProfileCard.open(profile) — profile = نفس كائن /api/profile.
 */
(function () {
    'use strict';

    // خط الصورة: Readex Pro (عربي حديث) — يتحمّل من Google Fonts وقت
    // تجهيز الصورة فقط، وIBM Plex احتياط لو ما تحمّل.
    var CARD_FONT = '"Readex Pro","IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif';
    var CARD_FONT_CSS = 'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700&display=swap';
    var LOGO_SRC = 'logo.png';
    var LOGO_BOX = [20, 38, 332, 107]; // حدود الشعار داخل logo.png (بدون الهوامش الشفافة)
    var PREFS_KEY = 'agp:profile-card-prefs';
    var CUSTOM_BG_KEY = 'agp:profile-card-bg';

    function S() { return window.AGPStreamStats && window.AGPStreamStats.shared; }
    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }
    function fmtMinutes(mins) {
        mins = Number(mins) || 0;
        if (mins < 60) return fmt(mins) + ' دقيقة';
        return (Math.round(mins / 6) / 10).toLocaleString('en-US') + ' ساعة';
    }

    /* ---------------- العناصر اللي ممكن تطلع بالصورة ---------------- */

    // التصنيفات الأسبوعية — نفس مبدّلات توب الرئيسية.
    var RANKS = [
        { key: 'players.wins', title: 'الأكثر فوزاً', group: 'توب اللاعبين', unit: function (v) { return fmt(v) + ' فوز'; } },
        { key: 'players.hours', title: 'الأكثر نشاطاً', group: 'توب اللاعبين', unit: fmtMinutes },
        { key: 'players.rounds', title: 'الأكثر لعباً', group: 'توب اللاعبين', unit: function (v) { return fmt(v) + ' جولة'; } },
        { key: 'streamers.hours', title: 'الأكثر نشاطاً', group: 'توب الاستريمرز', unit: fmtMinutes },
        { key: 'streamers.participations', title: 'الأكثر مشاركات', group: 'توب الاستريمرز', unit: function (v) { return fmt(v) + ' مشاركة'; } }
    ];

    function isStreamer(p) { return Boolean(p && (p.is_streamer || p.can_run_games || p.role === 'admin')); }

    // الإحصائيات — streamer: true تطلع لحسابات الستريمر فقط. def = مفعّلة افتراضياً.
    var STATS = [
        { key: 'level', title: 'مستوى اللاعب', def: true,
          value: function (p) { var c = p.points && p.points.currentLevel; return c ? c.displayNameAr : '—'; },
          sub: function (p) { return fmt(p.points && p.points.totalPoints) + ' نقطة خبرة'; } },
        { key: 'played', title: 'جولات مكتملة', def: true, value: function (p) { return fmt(p.points && p.points.gamesPlayed); } },
        { key: 'won', title: 'مرات الفوز', def: true, value: function (p) { return fmt(p.points && p.points.gamesWon); } },
        { key: 'winRate', title: 'نسبة الفوز', def: true, value: function (p) { return fmt(p.points && p.points.winRatePct) + '%'; } },
        { key: 'spLevel', title: 'مستوى الستريمر', streamer: true, def: true,
          value: function (p) { var l = p.streamerLevel; return (l && l.currentLevel && (l.currentLevel.displayNameAr || l.currentLevel.display_name_ar)) || '—'; },
          sub: function (p) { return fmt(p.streamerLevel && p.streamerLevel.sp) + ' SP'; } },
        { key: 'liveHours', title: 'ساعات البث', streamer: true, def: true,
          value: function (p) { return (Math.round(((p.stats && p.stats.total_live_ms) || 0) / 360000) / 10).toLocaleString('en-US'); } },
        { key: 'broadcasts', title: 'عدد البثوث', streamer: true, def: false, value: function (p) { return fmt(p.stats && p.stats.total_broadcasts); } },
        { key: 'comments', title: 'التعليقات', streamer: true, def: false, value: function (p) { return fmt(p.stats && p.stats.total_comments); } },
        { key: 'follows', title: 'متابعين جدد', streamer: true, def: false, value: function (p) { return fmt(p.stats && p.stats.total_follows); } },
        { key: 'gifts', title: 'قيمة الهدايا', streamer: true, def: false, value: function (p) { return fmt(p.stats && p.stats.total_gifts_value) + ' 💎'; } }
    ];

    function rankOf(ranks, key) {
        var parts = key.split('.');
        return (ranks && ranks[parts[0]] && ranks[parts[0]][parts[1]]) || null;
    }
    function availableRanks(ranks) { return RANKS.filter(function (r) { return rankOf(ranks, r.key); }); }
    function availableStats(p) { return STATS.filter(function (st) { return !st.streamer || isStreamer(p); }); }

    /* ---------------- الإعدادات ---------------- */

    function loadCustomBg() { try { return localStorage.getItem(CUSTOM_BG_KEY) || null; } catch (e) { return null; } }
    function saveCustomBg(dataUrl) { try { localStorage.setItem(CUSTOM_BG_KEY, dataUrl); return true; } catch (e) { return false; } }

    function loadPrefs() {
        var p = null;
        try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) {}
        var bgs = S().BACKGROUNDS;
        var out = { bg: (p && typeof p.bg === 'string') ? p.bg : bgs[0].key, items: {} };
        RANKS.forEach(function (r) { out.items[r.key] = p && p.items && r.key in p.items ? Boolean(p.items[r.key]) : true; });
        STATS.forEach(function (st) { out.items[st.key] = p && p.items && st.key in p.items ? Boolean(p.items[st.key]) : st.def; });
        if (out.bg === 'custom' && !loadCustomBg()) out.bg = bgs[0].key;
        return out;
    }
    function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }

    function findBg(key) {
        var bgs = S().BACKGROUNDS;
        for (var i = 0; i < bgs.length; i++) if (bgs[i].key === key) return bgs[i];
        return bgs[0];
    }

    /* ---------------- الرسم ---------------- */

    var MEDALS = [['#fff1b8', '#f0c64e', '#b8861f'], ['#ffffff', '#cfd6e3', '#8f99ad'], ['#ffd2ae', '#d9935c', '#8f5226']];

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function glass(ctx, x, y, w, h, r, edge) {
        roundRect(ctx, x, y, w, h, r);
        var g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, 'rgba(255,255,255,0.11)');
        g.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = edge || 'rgba(255,255,255,0.16)';
        ctx.stroke();
    }

    function pill(ctx, text, cx, cy, color, font) {
        ctx.font = font;
        var w = ctx.measureText(text).width + 44, h = 52;
        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy + 2);
        return w;
    }

    /** عنوان قسم بالنص مع نجمتين وخطين رفيعين على الجانبين (نفس إحصائيات البث). */
    function sectionTitle(ctx, text, y, s, accent, side) {
        var sh = S(), W = sh.W;
        ctx.font = '700 ' + (40 * s) + 'px ' + CARD_FONT;
        var tw = ctx.measureText(text).width;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, W / 2, y);
        sh.sparkle(ctx, W / 2 + tw / 2 + 26 * s, y, 11 * s, accent);
        sh.sparkle(ctx, W / 2 - tw / 2 - 26 * s, y, 11 * s, accent);
        [[side, W / 2 - tw / 2 - 50 * s, 0], [W / 2 + tw / 2 + 50 * s, W - side, 1]].forEach(function (seg) {
            var g = ctx.createLinearGradient(seg[0], 0, seg[1], 0);
            g.addColorStop(seg[2] ? 0 : 1, accent);
            g.addColorStop(seg[2] ? 1 : 0, 'rgba(255,255,255,0)');
            ctx.strokeStyle = g;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(seg[0], y); ctx.lineTo(seg[1], y); ctx.stroke();
        });
    }

    /** بطاقة مركز: ميدالية الرقم يمين، والتصنيف وقيمته يسارها. */
    function drawRankCard(ctx, r, rank, x, y, w, h, s, accent) {
        var sh = S();
        var medal = MEDALS[rank.rank - 1];
        glass(ctx, x, y, w, h, 28 * s, medal ? medal[1] : null);
        var mr = 46 * s, mx = x + w - 30 * s - mr, my = y + h / 2;
        var g = ctx.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr);
        if (medal) { g.addColorStop(0, medal[0]); g.addColorStop(0.5, medal[1]); g.addColorStop(1, medal[2]); }
        else { g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0.08)'); }
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        if (!medal) { ctx.lineWidth = 2; ctx.strokeStyle = accent; ctx.stroke(); }
        ctx.fillStyle = medal ? '#1a1208' : '#ffffff';
        ctx.font = '800 ' + (rank.rank > 99 ? 30 : 40) * s + 'px ' + CARD_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'ltr';
        ctx.fillText('#' + rank.rank, mx, my + 2 * s);
        ctx.direction = 'rtl';

        var tx = mx - mr - 22 * s, maxW = tx - x - 24 * s;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 ' + (34 * s) + 'px ' + CARD_FONT;
        ctx.fillText(sh.fitText(ctx, r.title, maxW), tx, my - 14 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.font = '500 ' + (22 * s) + 'px ' + CARD_FONT;
        ctx.fillText(sh.fitText(ctx, r.group + ' · ' + r.unit(rank.value), maxW), tx, my + 26 * s);
    }

    /** مربع إحصائية: القيمة كبيرة والعنوان تحتها. */
    function drawStatTile(ctx, st, p, x, y, w, h, s, accent) {
        var sh = S();
        glass(ctx, x, y, w, h, 26 * s);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 ' + (44 * s) + 'px ' + CARD_FONT;
        ctx.fillText(sh.fitText(ctx, st.value(p), w - 30 * s), x + w / 2, y + h * 0.48);
        ctx.fillStyle = accent;
        ctx.font = '600 ' + (24 * s) + 'px ' + CARD_FONT;
        ctx.fillText(sh.fitText(ctx, st.title, w - 24 * s), x + w / 2, y + h * 0.48 + 42 * s);
        if (st.sub) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '500 ' + (19 * s) + 'px ' + CARD_FONT;
            ctx.fillText(sh.fitText(ctx, st.sub(p), w - 24 * s), x + w / 2, y + h * 0.48 + 74 * s);
        }
    }

    var SIDE = 70, CONTENT_TOP = 810, CONTENT_BOTTOM = 1800;

    /** ارتفاع المحتوى بمقياس s — للتصغير التلقائي لما العناصر كثيرة. */
    function contentHeight(nRanks, nStats, s) {
        var h = 0;
        if (nRanks) h += 90 * s + Math.ceil(nRanks / 2) * (150 + 22) * s;
        if (nRanks && nStats) h += 40 * s;
        if (nStats) h += 90 * s + Math.ceil(nStats / 3) * (190 + 22) * s;
        return h;
    }

    function draw(p, ranks, prefs) {
        var sh = S(), W = sh.W, H = sh.H, FONT = CARD_FONT;
        var custom = prefs.bg === 'custom' ? loadCustomBg() : null;
        var bg = custom ? null : findBg(prefs.bg);
        var accent = bg ? bg.accent : sh.CUSTOM_ACCENT;
        var chosenRanks = availableRanks(ranks).filter(function (r) { return prefs.items[r.key]; });
        var chosenStats = availableStats(p).filter(function (st) { return prefs.items[st.key]; });
        var name = p.display_name || p.username || '';

        return Promise.all([sh.loadImg(p.avatar_image_base64), sh.loadImg(custom), sh.loadImg(LOGO_SRC)]).then(function (loaded) {
            var avatarImg = loaded[0], customImg = loaded[1], logoImg = loaded[2];
            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');
            ctx.direction = 'rtl';

            if (customImg) sh.drawCover(ctx, customImg, W, H);
            else bg.paint(ctx, W, H);
            var k0 = customImg ? 1.6 : 1;
            var shade = ctx.createLinearGradient(0, 0, 0, H);
            shade.addColorStop(0, 'rgba(0,0,0,' + (0.28 * k0) + ')');
            shade.addColorStop(0.4, 'rgba(0,0,0,' + (0.40 * k0) + ')');
            shade.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.85, 0.62 * k0) + ')');
            ctx.fillStyle = shade;
            ctx.fillRect(0, 0, W, H);

            // الرأس: شعار ألعاب أيمن، توهّج خلف الصورة، الصورة، الاسم، اليوزر والـID، والشارات
            if (logoImg) {
                var lw = 400, lh = lw * LOGO_BOX[3] / LOGO_BOX[2];
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.45)';
                ctx.shadowBlur = 24;
                ctx.drawImage(logoImg, LOGO_BOX[0], LOGO_BOX[1], LOGO_BOX[2], LOGO_BOX[3], W / 2 - lw / 2, 56, lw, lh);
                ctx.restore();
            }
            var glow = ctx.createRadialGradient(W / 2, 370, 120, W / 2, 370, 260);
            glow.addColorStop(0, accent + '66');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(W / 2 - 260, 110, 520, 520);
            sh.drawAvatar(ctx, avatarImg, name, W / 2, 370, 140, accent, 8, FONT);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 64px ' + FONT;
            ctx.fillText(sh.fitText(ctx, name, W - SIDE * 2), W / 2, 600);
            var sub = [];
            if (p.tiktok_username) sub.push('@' + p.tiktok_username);
            if (p.custom_id) sub.push('ID ' + p.custom_id);
            if (sub.length) {
                ctx.direction = 'ltr';
                ctx.fillStyle = 'rgba(255,255,255,0.72)';
                ctx.font = '500 29px ' + FONT;
                ctx.fillText(sub.join('   ·   '), W / 2, 656);
                ctx.direction = 'rtl';
            }
            var pills = [isStreamer(p) ? 'ستريمر' : 'لاعب'];
            var lvl = p.points && p.points.currentLevel;
            if (lvl) pills.push(lvl.displayNameAr);
            var pf = '600 25px ' + FONT;
            ctx.font = pf;
            var widths = pills.map(function (t) { return ctx.measureText(t).width + 44; });
            var total = widths.reduce(function (a, b) { return a + b; }, 0) + (pills.length - 1) * 16;
            var px = W / 2 + total / 2;
            pills.forEach(function (t, i) { pill(ctx, t, px - widths[i] / 2, 728, accent, pf); px -= widths[i] + 16; });

            // المحتوى: يتصغّر لين يدخل، ويتوسّط عمودياً لو كان قليل
            var avail = CONTENT_BOTTOM - CONTENT_TOP, s = 1;
            while (contentHeight(chosenRanks.length, chosenStats.length, s) > avail && s > 0.5) s -= 0.05;
            var y = CONTENT_TOP + Math.max(0, (avail - contentHeight(chosenRanks.length, chosenStats.length, s)) / 2);
            var inner = W - SIDE * 2, gap = 22 * s;

            if (chosenRanks.length) {
                sectionTitle(ctx, 'تصنيفاتي هالأسبوع', y + 40 * s, s, accent, SIDE);
                y += 90 * s;
                var rw = (inner - gap) / 2, rh = 150 * s;
                chosenRanks.forEach(function (r, i) {
                    var col = i % 2, row = Math.floor(i / 2);
                    var lastAlone = i === chosenRanks.length - 1 && col === 0;
                    var w = lastAlone ? inner : rw;
                    var x = lastAlone ? SIDE : W - SIDE - rw - col * (rw + gap);
                    drawRankCard(ctx, r, rankOf(ranks, r.key), x, y + row * (rh + gap), w, rh, s, accent);
                });
                y += Math.ceil(chosenRanks.length / 2) * (rh + gap);
                if (chosenStats.length) y += 40 * s;
            }
            if (chosenStats.length) {
                sectionTitle(ctx, 'إحصائياتي', y + 40 * s, s, accent, SIDE);
                y += 90 * s;
                var cols = 3, th = 190 * s;
                chosenStats.forEach(function (st, i) {
                    var row = Math.floor(i / cols), col = i % cols;
                    // آخر صف ناقص يتوسّط
                    var inRow = Math.min(cols, chosenStats.length - row * cols);
                    var tw = (inner - gap * (cols - 1)) / cols;
                    var rowW = inRow * tw + (inRow - 1) * gap;
                    var x = W / 2 + rowW / 2 - tw - col * (tw + gap);
                    drawStatTile(ctx, st, p, x, y + row * (th + gap), tw, th, s, accent);
                });
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '500 22px ' + FONT;
            ctx.fillText('منصة ألعاب أيمن', W / 2, H - 40);
            return canvas;
        });
    }

    /* ---------------- النافذة ---------------- */

    function modal() {
        var old = document.getElementById('agp-profile-card');
        if (old) old.remove();
        var wrap = document.createElement('div');
        wrap.id = 'agp-profile-card';
        wrap.setAttribute('dir', 'rtl');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', 'صورة بروفايلي');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:' + S().FONT + ';color:#f4f2fb;';
        wrap.innerHTML =
            '<div style="width:min(520px,100%);max-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:24px;background:rgba(12,11,18,.97);border:1px solid rgba(178,140,245,.3);box-shadow:0 30px 90px rgba(0,0,0,.6)">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
                '<span style="font-weight:700;font-size:19px">صورة بروفايلي</span>' +
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

    function message(wrap, text, back, ctx) {
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'center';
        body.innerHTML = '';
        var el = document.createElement('p');
        el.style.cssText = 'margin:0;padding:24px 8px;text-align:center;line-height:1.8;color:#a8a3b5;font-size:15px';
        el.textContent = text;
        body.appendChild(el);
        S().setActions(wrap, back ? [{ label: 'رجوع للإعدادات', style: S().BTN_GHOST + 'flex:1;', onClick: function () { showSettings(wrap, ctx); } }] : []);
    }

    /** صف خيار: العنوان والوصف يمين، ومفتاح التبديل يسار. */
    function toggleRow(title, desc, on, onChange) {
        var row = document.createElement('div');
        row.style.cssText = S().ROW;
        var label = document.createElement('div');
        label.style.cssText = 'display:flex;flex-direction:column;gap:2px;text-align:right;min-width:0';
        label.innerHTML = '<span style="font-weight:700;font-size:15px"></span><span style="font-size:12.5px;color:#968ea4"></span>';
        label.children[0].textContent = title;
        label.children[1].textContent = desc || '';
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', title);
        toggle.style.cssText = 'position:relative;width:50px;height:28px;border-radius:999px;border:none;cursor:pointer;flex:none;transition:background .2s';
        var knob = document.createElement('span');
        knob.style.cssText = 'position:absolute;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .2s,right .2s';
        toggle.appendChild(knob);
        function paint() {
            toggle.setAttribute('aria-checked', String(on));
            toggle.style.background = on ? '#a855f7' : 'rgba(255,255,255,.15)';
            knob.style.right = on ? '3px' : '25px';
        }
        toggle.addEventListener('click', function () { on = !on; paint(); onChange(on); });
        paint();
        row.appendChild(label);
        row.appendChild(toggle);
        return row;
    }

    function heading(text) {
        var h = document.createElement('div');
        h.style.cssText = S().HEADING;
        h.textContent = text;
        return h;
    }

    function showSettings(wrap, ctx) {
        var sh = S(), prefs = loadPrefs(), p = ctx.profile;
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'flex-start';
        body.innerHTML = '';

        var intro = document.createElement('p');
        intro.style.cssText = 'margin:0;font-size:14px;line-height:1.7;color:#a8a3b5';
        intro.textContent = 'اختر وش يطلع بصورتك مع اسمك وصورتك، والخلفية. الصورة بمقاس ستوري تيك توك، وتقدر تحفظها بجهازك.';
        body.appendChild(intro);

        body.appendChild(heading('تصنيفاتي هالأسبوع'));
        var rankList = document.createElement('div');
        rankList.style.cssText = 'display:flex;flex-direction:column;gap:10px';
        var ranked = availableRanks(ctx.ranks);
        if (!ranked.length) {
            var none = document.createElement('p');
            none.style.cssText = 'margin:0;font-size:13px;color:#968ea4;line-height:1.7';
            none.textContent = 'ما عندك مركز بأي تصنيف هالأسبوع بعد — العب أو شغّل ألعاب وارجع لها. التصنيفات تتجدد كل سبت.';
            rankList.appendChild(none);
        }
        ranked.forEach(function (r) {
            var rk = rankOf(ctx.ranks, r.key);
            rankList.appendChild(toggleRow(r.title + ' · ' + r.group, 'المركز ' + rk.rank + ' · ' + r.unit(rk.value), prefs.items[r.key], function (on) {
                prefs.items[r.key] = on; savePrefs(prefs);
            }));
        });
        body.appendChild(rankList);

        body.appendChild(heading('إحصائياتي'));
        var statList = document.createElement('div');
        statList.style.cssText = 'display:flex;flex-direction:column;gap:10px';
        availableStats(p).forEach(function (st) {
            statList.appendChild(toggleRow(st.title, st.value(p) + (st.sub ? ' · ' + st.sub(p) : ''), prefs.items[st.key], function (on) {
                prefs.items[st.key] = on; savePrefs(prefs);
            }));
        });
        body.appendChild(statList);

        body.appendChild(heading('الخلفية'));
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
            sh.BACKGROUNDS.forEach(function (bg) {
                grid.appendChild(sh.bgTile(bg.name, prefs.bg === bg.key, bg.paint, function () {
                    prefs.bg = bg.key; savePrefs(prefs); renderGrid();
                }));
            });
            var custom = loadCustomBg();
            if (custom) {
                grid.appendChild(sh.bgTile('خلفيتك', prefs.bg === 'custom', function (c, w, h) {
                    var img = new Image();
                    img.onload = function () { sh.drawCover(c, img, w, h); };
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
            sh.prepareUpload(f).then(function (dataUrl) {
                if (!saveCustomBg(dataUrl)) throw new Error('الصورة كبيرة على ذاكرة المتصفح — جرّب صورة أصغر');
                prefs.bg = 'custom'; savePrefs(prefs);
                uploadNote.textContent = 'الخلفية المرفوعة تبقى في جهازك فقط.';
                renderGrid();
            }).catch(function (err) {
                uploadNote.textContent = (err && err.message) || 'تعذّر رفع الخلفية';
            });
        });
        renderGrid();

        sh.setActions(wrap, [{ label: 'إنشاء الصورة', style: sh.BTN_PRIMARY, onClick: function () { generate(wrap, ctx); } }]);
    }

    function showImage(wrap, canvas, ctx) {
        var sh = S(), p = ctx.profile;
        var body = wrap.querySelector('[data-body]');
        body.style.justifyContent = 'flex-start';
        body.innerHTML = '';
        var img = new Image();
        img.alt = 'صورة بروفايلي';
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:16px';
        img.src = canvas.toDataURL('image/png');
        body.appendChild(img);
        sh.setActions(wrap, [
            { label: 'حفظ الصورة', style: sh.BTN_PRIMARY, onClick: function () {
                canvas.toBlob(function (blob) {
                    if (!blob) return;
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = 'profile-' + (p.username || p.custom_id || 'agp') + '.png';
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                }, 'image/png');
            } },
            { label: 'تعديل', style: sh.BTN_GHOST, onClick: function () { showSettings(wrap, ctx); } }
        ]);
    }

    /** يحمّل خط الصورة (مرة وحدة) — ما يرمي خطأ أبداً، والرسم يكمل بالخط الاحتياطي. */
    var fontPromise = null;
    function loadCardFont() {
        if (fontPromise) return fontPromise;
        fontPromise = new Promise(function (resolve) {
            if (!document.fonts || !document.fonts.load) { resolve(); return; }
            var link = document.querySelector('link[data-agp-card-font]');
            if (!link) {
                link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = CARD_FONT_CSS;
                link.setAttribute('data-agp-card-font', '1');
                document.head.appendChild(link);
            }
            var done = false;
            function finish() { if (!done) { done = true; resolve(); } }
            function loadFaces() {
                Promise.all(['400', '500', '600', '700', '800'].map(function (w) {
                    return document.fonts.load(w + ' 40px "Readex Pro"', 'أب 12');
                })).then(finish, finish);
            }
            if (link.sheet) loadFaces();
            else { link.addEventListener('load', loadFaces); link.addEventListener('error', finish); }
            setTimeout(finish, 4000);
        });
        return fontPromise;
    }

    function generate(wrap, ctx) {
        message(wrap, 'جاري تجهيز الصورة…');
        loadCardFont().then(function () { return draw(ctx.profile, ctx.ranks, loadPrefs()); }).then(function (canvas) {
            if (document.body.contains(wrap)) showImage(wrap, canvas, ctx);
        }).catch(function () {
            if (document.body.contains(wrap)) message(wrap, 'تعذّر تجهيز الصورة — جرّب مرة ثانية', true, ctx);
        });
    }

    function open(profile) {
        if (!S() || !profile) return;
        var wrap = modal();
        message(wrap, 'جاري جلب تصنيفاتك…');
        var req = window.AGPAuth && window.AGPAuth.getUserWeeklyRanks
            ? window.AGPAuth.getUserWeeklyRanks(profile.custom_id).catch(function () { return null; })
            : Promise.resolve(null);
        req.then(function (r) {
            if (!document.body.contains(wrap)) return;
            showSettings(wrap, { profile: profile, ranks: (r && r.success && r.ranks) || null });
        });
    }

    window.AGPProfileCard = { open: open };
}());
