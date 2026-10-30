/**
 * AGP STREAM PIP — «نافذة عائمة» (تجريبي) لأداة وحدة من أوفرلي البث، تطفو
 * فوق كل التطبيقات (صورة داخل صورة / Picture-in-Picture). موجّهة لمذيع
 * الآيباد اللي يطلع من الموقع لتطبيق ثاني وهو يشارك الشاشة بتيك توك.
 *
 * الآيباد ما يسمح لمواقع ترسم فوق تطبيقات ثانية إلا فيديو PiP، فنرسم الأداة
 * بـCanvas (نسخة مبسّطة من شكلها بالأوفرلي) ونحوّلها لفيديو (captureStream)
 * ونفتحه نافذة عائمة. البيانات نفسها من js/agp-stream-overlay.js.
 *
 * حدود معروفة: النافذة مستطيل بخلفية (مو شفافة)، والآيباد ممكن يوقف تحديثها
 * لما Safari يطلع للخلفية — عشان كذا تجريبي. صور الهدايا تنرسم من نسخة
 * السيرفر (/api/stream/media) لأن Canvas ما يقبل صور من موقع ثاني بدون CORS.
 *
 * AGPStreamPip.supported() / attach(item, host) / close()
 */
(function () {
    'use strict';

    var O = window.AGPStreamOverlay;
    if (!O || window.AGPStreamPip) return;

    var FPS = 12;
    var FONT = '"IBM Plex Sans Arabic","Noto Kufi Arabic",system-ui,sans-serif';
    var RANK = [['#ffd54a', '#e08e0b'], ['#eef2f7', '#8e9aab'], ['#ffb27a', '#b25a22']];

    var canvas = null, ctx = null, video = null, timer = null, item = null;
    var images = {};      // url -> Image (crossOrigin)
    var dropStart = {};   // مفتاح صورة الوعاء -> وقت أول ظهور (لحركة السقوط)

    function fmt(n) { return (Number(n) || 0).toLocaleString('en-US'); }

    function supported() {
        var v = document.createElement('video');
        var c = document.createElement('canvas');
        return Boolean(c.captureStream) && (Boolean(document.pictureInPictureEnabled && v.requestPictureInPicture) || typeof v.webkitSetPresentationMode === 'function');
    }

    function image(url) {
        if (!url) return null;
        var im = images[url];
        if (!im) {
            im = new Image();
            // data: ما يحتاج CORS؛ روابط السيرفر لازم crossOrigin عشان ما "يتلوّث" الـCanvas
            if (!/^data:/.test(url)) im.crossOrigin = 'anonymous';
            im.src = url;
            images[url] = im;
        }
        return im.complete && im.naturalWidth ? im : null;
    }

    /** مقاس النافذة حسب نوع الأداة. */
    function sizeFor(it) {
        if (it.type === 'jar') return [360, 480];
        if (it.type === 'top') return [480, 120 + (Number(it.top) || 3) * 70];
        if (it.type === 'goal') return [480, 190];
        if (it.type === 'counter') return [480, 110 + Math.ceil(((it.metrics || []).length || 1) / 2) * 80];
        return [480, 220];
    }

    function bg(w, h) {
        var g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#15122a');
        g.addColorStop(1, '#07060d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }

    function text(str, x, y, size, color, align, weight) {
        ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, size / 7);
        ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(str, x, y);
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
    }

    /** يقصّ النص بـ… لو أعرض من maxW. */
    function fit(str, size, maxW, weight) {
        ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
        if (ctx.measureText(str).width <= maxW) return str;
        while (str.length > 1 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1);
        return str + '…';
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function circleImg(src, cx, cy, r, ring, fallbackChar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = ring;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        var im = image(src);
        if (im) ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2);
        else { ctx.fillStyle = '#2a2d45'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
        ctx.restore();
        if (!im && fallbackChar) text(fallbackChar, cx, cy + 1, r, '#fff', 'center', 800);
    }

    function drawTitle(t, w) { if (t) text(t, w / 2, 36, 28, '#fff'); }

    function drawTop(it, w) {
        var sec = O.SECTIONS[it.section] || O.SECTIONS.likers;
        var rows = ((O.stats().sections || {})[it.section] || []).slice(0, Number(it.top) || 3);
        var ghost = !rows.length;
        if (ghost) rows = O.SAMPLE_ROWS.slice(0, Number(it.top) || 3);
        drawTitle(it.title, w);
        ctx.globalAlpha = ghost ? 0.5 : 1;
        rows.forEach(function (r, i) {
            var y = 100 + i * 70;
            var c = RANK[i] || [it.color || '#ffd54a', '#444'];
            ctx.fillStyle = 'rgba(255,255,255,.06)';
            roundRect(16, y - 28, w - 32, 56, 28);
            ctx.fill();
            // RTL: المركز يمين، بعده الصورة والاسم، والرقم يسار
            ctx.beginPath(); ctx.arc(w - 46, y, 16, 0, Math.PI * 2); ctx.fillStyle = c[0]; ctx.fill();
            text(String(i + 1), w - 46, y + 1, 18, '#1a1206', 'center', 900);
            circleImg(r.avatar, w - 96, y, 22, c[0], String(r.name || '?').charAt(0));
            var name = fit(String(r.name || r.username || ''), 24, w - 300, 700);
            text(name, w - 130, y, 24, '#fff', 'right', 700);
            text(sec.value(r), 34, y, 24, it.color || '#ffd54a', 'left', 900);
        });
        ctx.globalAlpha = 1;
    }

    function totals() { return O.stats().totals || null; }

    function drawGoal(it, w) {
        var m = O.METRICS[it.metric] ? it.metric : 'likes';
        var t = totals(), ghost = !t;
        var cur = Number((t || O.SAMPLE_TOTALS)[m]) || 0;
        var target = Math.max(1, Number(it.target) || 1000);
        if (it.autoNext && cur >= target) target = target * (Math.floor(cur / target) + 1);
        var pct = Math.min(1, cur / target);
        drawTitle(it.title, w);
        ctx.globalAlpha = ghost ? 0.5 : 1;
        var x = 24, y = 92, bw = w - 48, bh = 54;
        ctx.fillStyle = 'rgba(255,255,255,.1)';
        roundRect(x, y, bw, bh, bh / 2); ctx.fill();
        if (pct > 0) {
            var fw = Math.max(bh, bw * pct);
            var g = ctx.createLinearGradient(x + bw - fw, 0, x + bw, 0);
            g.addColorStop(0, '#fff');
            g.addColorStop(0.35, it.color || '#ff4d6d');
            g.addColorStop(1, it.color || '#ff4d6d');
            ctx.fillStyle = g;
            roundRect(x + bw - fw, y, fw, bh, bh / 2); ctx.fill(); // يتعبّى من اليمين
        }
        text(fmt(cur) + ' / ' + fmt(target), w / 2, y + bh / 2 + 1, 26, '#fff', 'center', 900);
        text(Math.floor(pct * 100) + '% · ' + O.METRICS[m].name, w / 2, 172, 20, 'rgba(255,255,255,.8)', 'center', 700);
        ctx.globalAlpha = 1;
    }

    function drawCounter(it, w) {
        var t = totals(), ghost = !t, src = t || O.SAMPLE_TOTALS;
        var list = (Array.isArray(it.metrics) && it.metrics.length ? it.metrics : ['likes']).filter(function (m) { return O.METRICS[m]; });
        var top0 = it.title ? 80 : 30;
        drawTitle(it.title, w);
        ctx.globalAlpha = ghost ? 0.5 : 1;
        list.forEach(function (m, i) {
            var col = i % 2, row = Math.floor(i / 2);
            var cw = (w - 48) / 2, x = w - 24 - (col + 1) * cw, y = top0 + row * 80;
            ctx.fillStyle = 'rgba(255,255,255,.07)';
            roundRect(x + 6, y, cw - 12, 66, 18); ctx.fill();
            text(fmt(src[m]), x + cw / 2, y + 26, 30, it.color || '#ffd54a', 'center', 900);
            text(O.METRICS[m].unit, x + cw / 2, y + 52, 16, 'rgba(255,255,255,.8)', 'center', 600);
        });
        ctx.globalAlpha = 1;
    }

    function drawText(it, w, h) {
        var f = O.fontOf(it.font || O.DEFAULT_FONT);
        var lines = String(it.text || '').split('\n').slice(0, 3);
        var size = 64;
        ctx.font = f.b + ' ' + size + 'px "' + f.family + '",' + FONT;
        var widest = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; }).concat([1]));
        size = Math.max(20, Math.min(size, size * (w - 40) / widest, (h - 40) / lines.length / 1.25));
        // حركة «نبض» بسيطة لو الأداة عليها حركة
        var pulse = it.anim && it.anim !== 'none' ? 1 + 0.05 * Math.sin(Date.now() / 300) : 1;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(pulse, pulse);
        ctx.font = f.b + ' ' + size + 'px "' + f.family + '",' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        lines.forEach(function (l, i) {
            var y = (i - (lines.length - 1) / 2) * size * 1.25;
            if (it.style === 'neon' || it.style === 'fire') { ctx.shadowColor = it.style === 'fire' ? '#ff6d00' : (it.color || '#fff'); ctx.shadowBlur = size / 3; }
            ctx.lineWidth = size / 9;
            ctx.strokeStyle = 'rgba(0,0,0,.9)';
            if (it.style !== 'plain') ctx.strokeText(l, 0, y);
            ctx.fillStyle = it.style === 'gold' ? '#ffd54a' : (it.color || '#fff');
            ctx.fillText(l, 0, y);
            ctx.shadowBlur = 0;
        });
        ctx.restore();
    }

    function drawJar(it, w, h) {
        var color = it.color || '#ff5fa8';
        var jx = 40, jy = 70, jw = w - 80, jh = h - 140;
        // الغطاء
        var lid = ctx.createLinearGradient(0, jy - 34, 0, jy - 6);
        lid.addColorStop(0, '#fff');
        lid.addColorStop(0.3, color);
        lid.addColorStop(1, '#00000080');
        ctx.fillStyle = lid;
        roundRect(jx + jw * 0.12, jy - 34, jw * 0.76, 28, 9); ctx.fill();
        // الزجاج
        ctx.save();
        roundRect(jx, jy, jw, jh, 34);
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.fill();
        ctx.clip();
        var data = O.jarData();
        var list = data.icons.slice(-54);
        var ghost = !list.length;
        if (ghost) list = O.SAMPLE_GIFT_SVGS.concat(O.SAMPLE_GIFT_SVGS, O.SAMPLE_GIFT_SVGS, O.SAMPLE_GIFT_SVGS).map(function (u, i) { return { k: 's' + i, img: u }; });
        var cols = 6, g = (jw - 24) / cols, step = g * 0.82, now = Date.now();
        ctx.globalAlpha = ghost ? 0.5 : 1;
        list.forEach(function (ic, i) {
            var row = Math.floor(i / cols), col = i % cols;
            var x = jx + 12 + col * g + (row % 2 ? g / 4 : 0);
            var y = jy + jh - 10 - (row + 1) * step;
            if (!dropStart[ic.k]) dropStart[ic.k] = ghost ? 1 : now;
            var t = Math.min(1, (now - dropStart[ic.k]) / 700);
            var fall = (1 - t * t) * (jh + 60); // يطيح من فوق الوعاء
            // صور الهدايا الحقيقية من نسخة السيرفر (Canvas يحتاجها من نفس المصدر)
            var src = ic.giftId ? O.mediaUrl('g', ic.giftId) : (/^data:/.test(ic.img || '') ? ic.img : null);
            var im = image(src);
            if (im) ctx.drawImage(im, x, y - fall, g * 0.92, g * 0.92);
            else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + g / 2, y - fall + g / 2, g / 3, 0, Math.PI * 2); ctx.fill(); }
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        roundRect(jx, jy, jw, jh, 34); ctx.stroke();
        ctx.shadowBlur = 0;
        if (it.title) text(it.title, w / 2, 24, 22, '#fff');
        if (it.counter !== 'none') {
            var tt = data.totals || { diamonds: 0, gifts: 0 };
            text(it.counter === 'gifts' ? fmt(tt.gifts) + ' هدية' : fmt(tt.diamonds) + ' 💎', w / 2, h - 34, 26, '#fff', 'center', 900);
        }
    }

    function draw() {
        if (!ctx || !item) return;
        var it = O.getState().items.filter(function (x) { return x.id === item.id; })[0] || item; // آخر تعديل
        var w = canvas.width, h = canvas.height;
        bg(w, h);
        if (it.type === 'top') drawTop(it, w);
        else if (it.type === 'goal') drawGoal(it, w);
        else if (it.type === 'counter') drawCounter(it, w);
        else if (it.type === 'jar') drawJar(it, w, h);
        else drawText(it, w, h);
    }

    /**
     * يجهّز معاينة الفيديو داخل host (لازم ظاهرة بالصفحة عشان iPad يفتح
     * منها النافذة) ويرجّع دالة open() تُستدعى من ضغطة زر.
     */
    function attach(it, host) {
        close();
        item = it;
        var size = sizeFor(it);
        canvas = document.createElement('canvas');
        canvas.width = size[0];
        canvas.height = size[1];
        ctx = canvas.getContext('2d');
        draw();
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.autoplay = true;
        video.className = 'st-pip-video';
        try { video.srcObject = canvas.captureStream(FPS); } catch (e) { return null; }
        host.appendChild(video);
        // setInterval مو requestAnimationFrame: rAF يتوقف لما الصفحة تطلع للخلفية
        timer = setInterval(draw, 1000 / FPS);
        video.play().catch(function () { /* يشتغل مع ضغطة الزر */ });
        // بدون انتظار (await) قبل الطلب: Safari يفتح النافذة بس من نفس ضغطة الزر
        return function open() {
            if (video.requestPictureInPicture && document.pictureInPictureEnabled) return video.requestPictureInPicture();
            if (typeof video.webkitSetPresentationMode === 'function') { video.webkitSetPresentationMode('picture-in-picture'); return Promise.resolve(); }
            return Promise.reject(new Error('unsupported'));
        };
    }

    function close() {
        if (timer) { clearInterval(timer); timer = null; }
        try {
            if (video && document.pictureInPictureElement === video && document.exitPictureInPicture) document.exitPictureInPicture().catch(function () {});
        } catch (e) { /* ignore */ }
        if (video) {
            var s = video.srcObject;
            if (s && s.getTracks) s.getTracks().forEach(function (t) { t.stop(); });
            video.remove();
        }
        canvas = ctx = video = item = null;
    }

    window.AGPStreamPip = { supported: supported, attach: attach, close: close, isOpen: function () { return Boolean(video && (document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture')); } };
}());
