/**
 * AGP ENTRANCE — دخولية اللاعب: مشهد 4 ثواني فوق الشاشة كلها لما يدخل لاعب
 * عنده دخولية مفعّلة (backend/collectibles: user_entrances + user_owned_entrances).
 *
 * 6 نماذج: 4 بمؤثرات حقيقية مصوّرة (assets/entrances/<key>/، مصادرها
 * بـCREDITS.md) تنحط فوق اللوبي بـmix-blend-mode: screen:
 *   nitro    — نيترو: جزيئات زرقاء، لهب ينفجر، كرة نار، جمر. بصوت (مخفّف).
 *   royal    — ملكي: عمود ضوء ذهبي، غبار ولمعات ذهبية. بدون صوت.
 *   princess — الأميرة: أضواء ولمعات وردية، دخان ناعم، فراشات مضيئة تطير. بدون صوت.
 *   storm    — العاصفة: غيوم وصواعق حقيقية، الإطار يطلع مع الصاعقة. بصوت (مخفّف).
 *   notes    — النوتات: موجة نوتات موسيقية مضيئة (مرسومة بالكود على canvas، بدون
 *              ملفات فيديو) مع خطوط المدرج، والإطار يركب الموجة ويستقر بالنص. بدون صوت.
 *   cloud    — الغيمة: دخولية ناعمة ولطيفة بألوان باستيل — غيوم قطنية تدخل من
 *              الجوانب، فقاعات تطفو، قلوب صغيرة ولمعات، والإطار يطلع من تحت وينط
 *              بنعومة. مرسومة بالكود على canvas (بدون ملفات). بدون صوت.
 * المشهد يعرض إطار اللاعب نفسه (AGP.playerCard، أي إطار — مو مربوط بإطار
 * معيّن)، واسمه كبير، ونص الدخولية اللي يكتبه من بروفايله، وبلونه اللي اختاره
 * (entrance.color من ألوان النموذج الجاهزة).
 *
 * متى تشتغل:
 *  - ألعاب الشِل المشترك (agp-game-shell): مع حدث player:joined.
 *  - صفحات اللوبي (games/<id>/lobby.html): أول ما يظهر اللاعب بالشات وصفحة
 *    اللوبي مفتوحة (مثل دخوليات تيك توك) — بدون تعديل كود انضمام كل لعبة.
 *  مرة وحدة لكل لاعب (ما تتكرر لو انفتحت الصفحة من جديد خلال 20 دقيقة)،
 *  وأكثر من دخولية بنفس الوقت تنعرض ورا بعض.
 *
 * AGP.entrance.play(player) / AGP.entrance.preview(player) لأي صفحة ثانية
 * (البروفايل يستخدم preview). player = {id, name, avatarUrl, frame, entrance:{templateKey, entranceText, color}}.
 *
 * Requires js/agp-core.js + js/agp-events.js. js/agp-player-card.js اختياري (بدونه بطاقة بسيطة).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var ROOT = (function () {
        var s = document.currentScript, src = s && s.src;
        return src ? src.replace(/js\/agp-entrance\.js(\?.*)?$/, '') : '../../';
    }());
    var ASSETS = ROOT + 'assets/entrances/';
    var DURATION = 4.0;
    var REPLAY_GAP_MS = 20 * 60 * 1000;
    var STYLE_ID = 'agp-entrance-styles';

    // ---------------------------------------------------------------- catalog
    // layer: n = file name, z = back|front, t0/t1 = window on the 4s timeline, fi/fo = fades,
    // op = max opacity, hue = the clip's own hue (null = neutral grey/white), s = scale fn(t-t0)
    var COLORS = {
        nitro:    { blue: 210, red: 2, green: 135, purple: 272 },
        royal:    { gold: 45, silver: 'silver', rose: 18 },
        princess: { pink: 328, purple: 282, sky: 200 },
        storm:    { white: null, blue: 215, purple: 270, red: 0 },
        notes:    { gold: 45, silver: 'silver', pink: 328, sky: 200 },
        cloud:    { pink: 328, purple: 270, sky: 200, mint: 160 }
    };
    var GLOW = {
        blue: '110,180,255', red: '255,95,95', green: '90,230,150', purple: '185,125,255', gold: '255,205,110', silver: '220,228,240',
        rose: '255,170,150', pink: '255,140,205', sky: '130,200,255', white: '200,215,255', mint: '120,225,190'
    };
    var MODELS = {
        nitro: {
            tag: 'دخول نيترو', sound: 'sound.mp3', dim: 'radial-gradient(ellipse at 50% 45%, rgba(2,8,22,.55), rgba(0,2,8,.95) 72%)',
            layers: [
                { n: 'particles', z: 'back', t0: 0, t1: 1.05, fi: .25, fo: .3, op: .95, hue: 210, s: function (t) { return 1.1 + .35 * t; } },
                { n: 'flame', z: 'front', t0: .36, t1: 1.15, fi: .06, fo: .35, op: .9, hue: 30, sat: 1.25, s: function () { return 1.25; } },
                { n: 'blast', z: 'back', t0: .8, t1: 1.9, fi: .05, fo: .7, op: .6, hue: 30, sat: 1.25, s: function () { return 1.25; } },
                { n: 'embers', z: 'back', t0: 1.0, t1: 3.7, fi: .5, fo: .4, op: .6, hue: 18, sat: 1.25 },
                { n: 'smoke', z: 'back', t0: 1.0, t1: 3.7, fi: .6, fo: .4, op: .12, hue: null },
                { n: 'flame2', z: 'front', t0: 2.92, t1: 3.75, fi: .08, fo: .4, op: .85, hue: 30, sat: 1.25, s: function () { return 1.2; } }
            ]
        },
        royal: {
            tag: 'دخول ملكي', dim: 'radial-gradient(ellipse at 50% 45%, rgba(20,12,2,.5), rgba(4,2,0,.95) 72%)',
            layers: [
                { n: 'beam', z: 'back', t0: .05, t1: 3.85, fi: .7, fo: .45, op: .8, hue: 45, s: function (t) { return 1.05 + .03 * t; } },
                { n: 'glitter', z: 'back', t0: .9, t1: 3.85, fi: .6, fo: .45, op: .45, hue: 40, sat: .8 },
                { n: 'flare', z: 'front', t0: .45, t1: 2.3, fi: .2, fo: .6, op: .9, hue: 120, sat: 1.6, br: 1.4 },
                { n: 'rain', z: 'back', t0: 1.0, t1: 3.85, fi: .6, fo: .45, op: .28, hue: 45 },
                { n: 'sparkles', z: 'front', t0: 1.3, t1: 3.85, fi: .5, fo: .4, op: .7, hue: 30, sat: .8, br: 1.2 }
            ]
        },
        princess: {
            tag: 'دخول الأميرة', butterflies: true, dim: 'radial-gradient(ellipse at 50% 45%, rgba(26,6,20,.5), rgba(8,2,6,.95) 72%)',
            layers: [
                { n: 'bokeh', z: 'back', t0: .05, t1: 3.85, fi: .7, fo: .45, op: .9, hue: 325, s: function (t) { return 1.05 + .04 * t; } },
                { n: 'smoke', z: 'back', t0: .3, t1: 3.8, fi: .8, fo: .5, op: .35, hue: null, tint: true },
                { n: 'light', z: 'front', t0: .45, t1: 1.6, fi: .25, fo: .5, op: .55, hue: null, tint: true },
                { n: 'sparkles', z: 'front', t0: .9, t1: 3.85, fi: .5, fo: .45, op: .85, hue: 25, br: 1.25 }
            ]
        },
        storm: {
            tag: 'دخول العاصفة', sound: 'sound.mp3', dim: 'radial-gradient(ellipse at 50% 40%, rgba(6,8,14,.65), rgba(0,0,3,.97) 72%)',
            layers: [
                { n: 'clouds', z: 'back', t0: 0, t1: 3.9, fi: .4, fo: .4, op: .45, hue: null, tint: true, base: 'brightness(.8) contrast(1.2)', s: function (t) { return 1.1 + .03 * t; } },
                { n: 'strike1', z: 'back', t0: 0, t1: 1.5, fi: .05, fo: .4, op: 1, hue: null, tint: true, base: 'saturate(.6) brightness(1.1)' },
                { n: 'strike2', z: 'back', t0: 1.2, t1: 2.7, fi: .2, fo: .4, op: .95, hue: null, tint: true, base: 'saturate(.6)' },
                { n: 'strike1', z: 'back', t0: 2.8, t1: 3.95, fi: .05, fo: .3, op: 1, hue: null, tint: true, base: 'saturate(.6) brightness(1.1)' },
                { n: 'smoke', z: 'front', t0: .5, t1: 3.85, fi: .5, fo: .4, op: .35, hue: null, tint: true }
            ]
        },
        notes: {
            tag: 'دخول النوتات', notes: true, dim: 'radial-gradient(ellipse at 50% 45%, rgba(22,8,44,.6), rgba(4,2,10,.95) 72%)',
            layers: []
        },
        cloud: {
            tag: 'دخول الغيمة', cloud: true, dim: 'radial-gradient(ellipse at 50% 45%, rgba(40,20,48,.5), rgba(10,6,16,.93) 72%)',
            layers: []
        }
    };

    // ---------------------------------------------------------------- helpers
    function clamp(v, a, b) { return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); }
    function seg(t, a, b) { return clamp((t - a) / (b - a)); }
    function expoOut(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
    function expoIn(x) { return x <= 0 ? 0 : Math.pow(2, 10 * x - 10); }
    function cubicOut(x) { return 1 - Math.pow(1 - x, 3); }
    function bump(t, c, w) { return Math.exp(-Math.pow((t - c) / w, 2)); }
    function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

    /** CSS filter that recolours a clip to the chosen preset. */
    function layerFilter(key, L, color) {
        var target = COLORS[key][color];
        var parts = [];
        if (L.base) parts.push(L.base);
        if (target === 'silver') { parts.push('grayscale(1) brightness(1.15)'); return parts.join(' '); }
        if (L.hue === null || L.hue === undefined) {
            if (L.tint && target !== null && target !== undefined) parts.push('sepia(1) saturate(3.5) hue-rotate(' + (target - 38) + 'deg)');
            return parts.join(' ') || 'none';
        }
        if (target !== null && target !== undefined) parts.push('hue-rotate(' + (target - L.hue) + 'deg)');
        parts.push('saturate(' + (L.sat || 1.1) + ')');
        if (L.br) parts.push('brightness(' + L.br + ')');
        return parts.join(' ');
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        if (!document.querySelector('link[data-agp-entrance-fonts]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet'; link.setAttribute('data-agp-entrance-fonts', '1');
            link.href = 'https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=Baloo+Bhaijaan+2:wght@800&family=Cairo:wght@700;900&display=swap';
            document.head.appendChild(link);
        }
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            '.agp-ent{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;direction:rtl;}',
            '.agp-ent-dim{position:absolute;inset:0;opacity:0;}',
            '.agp-ent-stage{position:absolute;left:50%;top:50%;width:1280px;height:720px;margin:-360px 0 0 -640px;font-family:Cairo,"IBM Plex Sans Arabic",sans-serif;}',
            '.agp-ent-world{position:absolute;inset:0;}',
            '.agp-ent-fx{position:absolute;left:0;top:0;width:1280px;height:720px;object-fit:cover;mix-blend-mode:screen;opacity:0;}',
            '.agp-ent-card{position:absolute;left:0;right:0;top:0;height:576px;display:flex;align-items:center;justify-content:center;opacity:0;}',
            '.agp-ent-card-in{transform:scale(2.6);transform-origin:50% 50%;line-height:0;}',
            '.agp-ent-basic{display:inline-flex;align-items:center;gap:8px;padding:5px 14px 5px 6px;border-radius:999px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.8);line-height:1.2;}',
            '.agp-ent-basic img,.agp-ent-basic i{width:38px;height:38px;border-radius:50%;object-fit:cover;background:#3b2a6b;display:block;}',
            '.agp-ent-basic b{color:#fff;font-size:15px;font-weight:800;white-space:nowrap;}',
            '.agp-ent-title{position:absolute;left:0;right:0;top:65%;text-align:center;opacity:0;}',
            '.agp-ent-title::before{content:"";position:absolute;left:50%;top:50%;width:900px;height:260px;margin:-130px 0 0 -450px;z-index:-1;background:radial-gradient(ellipse,rgba(0,0,0,.72),rgba(0,0,0,.4) 45%,transparent 70%);}',
            '.agp-ent-tag{font-size:18px;font-weight:700;letter-spacing:6px;color:rgba(255,255,255,.85);}',
            '.agp-ent-tag::before,.agp-ent-tag::after{content:"";display:inline-block;vertical-align:middle;width:70px;height:1px;margin:0 16px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.8));}',
            '.agp-ent-tag::after{background:linear-gradient(270deg,transparent,rgba(255,255,255,.8));}',
            '.agp-ent-name{display:inline-block;white-space:nowrap;vertical-align:top;font-size:86px;font-weight:900;line-height:1.2;color:#fff;}',
            '.agp-ent-msg{font-size:22px;font-weight:700;color:rgba(255,255,255,.92);margin-top:2px;text-shadow:0 2px 8px rgba(0,0,0,.8);}',
            '.agp-ent-royal .agp-ent-name{font-family:"Aref Ruqaa",serif;font-weight:700;font-size:100px;line-height:1.35;-webkit-background-clip:text;background-clip:text;color:transparent;',
            'background-image:linear-gradient(180deg,#fff8dc 0%,#f3d27a 35%,#c8952f 60%,#fff0bf 75%,#9c6b1c 100%);filter:drop-shadow(0 2px 0 rgba(50,25,0,.9)) drop-shadow(0 0 18px rgba(255,200,90,.45));text-shadow:none!important;}',
            '.agp-ent-royal.agp-ent-c-silver .agp-ent-name{background-image:linear-gradient(180deg,#ffffff 0%,#e6ebf2 35%,#9aa6b6 60%,#f4f7fb 75%,#6c7787 100%);}',
            '.agp-ent-royal.agp-ent-c-rose .agp-ent-name{background-image:linear-gradient(180deg,#fff2ec 0%,#f6c1a8 35%,#c9806a 60%,#ffe2d6 75%,#8e4d3e 100%);}',
            '.agp-ent-royal .agp-ent-tag{font-family:"Aref Ruqaa",serif;font-size:24px;letter-spacing:2px;color:#e9cf8a;}',
            '.agp-ent-flash{position:absolute;inset:0;opacity:0;mix-blend-mode:screen;}',
            '.agp-ent-trail{position:absolute;inset:0;}',
            '.agp-ent-notecv{position:absolute;left:0;top:0;width:1280px;height:720px;}',
            '.agp-ent-cloudcv{position:absolute;left:0;top:0;width:1280px;height:720px;-webkit-mask-image:linear-gradient(transparent,#000 9%,#000 80%,transparent);mask-image:linear-gradient(transparent,#000 9%,#000 80%,transparent);}',
            '.agp-ent-cloud .agp-ent-name{font-family:"Baloo Bhaijaan 2",Cairo,sans-serif;font-weight:800;line-height:1.25;}',
            '.agp-ent-cloud .agp-ent-tag{letter-spacing:3px;}',
            '.agp-ent-cloud .agp-ent-tag::before,.agp-ent-cloud .agp-ent-tag::after{content:"\\2661";width:auto;height:auto;margin:0 12px;background:none;font-size:20px;}',
            '.agp-ent-cloud .agp-ent-title::before{background:radial-gradient(ellipse,rgba(20,10,28,.6),rgba(20,10,28,.3) 45%,transparent 70%);}',
            '.agp-ent-bfs{position:absolute;inset:0;}',
            '.agp-ent-bf{position:absolute;left:0;top:0;width:0;height:0;perspective:520px;}',
            '.agp-ent-bf .w{position:absolute;top:-70px;width:100px;height:140px;filter:drop-shadow(0 0 6px rgba(255,170,220,.9)) drop-shadow(0 0 16px rgba(255,120,200,.55));}',
            '.agp-ent-bf .w.r{left:0;transform-origin:0 50%;}',
            '.agp-ent-bf .w.l{left:-100px;transform-origin:100% 50%;}',
            '.agp-ent-bf .w svg{width:100%;height:100%;display:block;overflow:visible;}',
            '.agp-ent-bf .bd{position:absolute;left:-3px;top:-16px;width:6px;height:34px;border-radius:3px;background:linear-gradient(#fff,#f7b6d9 40%,#7a2a55);box-shadow:0 0 8px rgba(255,200,235,.9);}'
        ].join('\n');
        document.head.appendChild(st);
    }

    // ---------------------------------------------------------------- butterflies (princess)
    var WING = '<svg viewBox="0 0 100 140"><defs>' +
        '<radialGradient id="__G" cx="0" cy="0.5" r="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".98"/><stop offset=".35" stop-color="#ffd3ea" stop-opacity=".92"/>' +
        '<stop offset=".75" stop-color="#ff79bf" stop-opacity=".8"/><stop offset="1" stop-color="#b8277a" stop-opacity=".75"/></radialGradient>' +
        '<linearGradient id="__S" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="M0 66 C 18 18 66 2 92 22 C 106 34 96 58 64 70 C 40 76 16 74 0 72 Z" fill="url(#__G)" stroke="rgba(255,255,255,.85)" stroke-width="1.2"/>' +
        '<path d="M0 76 C 20 80 54 86 66 108 C 74 126 52 140 32 130 C 16 122 6 102 0 84 Z" fill="url(#__G)" stroke="rgba(255,255,255,.85)" stroke-width="1.2"/>' +
        '<g stroke="rgba(150,30,95,.55)" stroke-width=".9" fill="none"><path d="M0 68 C 30 50 58 32 88 24"/><path d="M0 69 C 32 60 62 54 90 48"/><path d="M0 70 C 26 66 46 66 66 68"/>' +
        '<path d="M0 80 C 22 90 40 104 52 126"/><path d="M0 80 C 18 96 26 112 30 128"/></g>' +
        '<g fill="#fff" opacity=".9"><circle cx="80" cy="30" r="3"/><circle cx="88" cy="44" r="2.2"/><circle cx="56" cy="118" r="2.4"/><circle cx="40" cy="128" r="1.8"/></g>' +
        '<path d="M6 64 C 30 30 60 16 86 22 L 70 40 C 50 44 26 54 6 64 Z" fill="url(#__S)"/></svg>';
    // [start x, start y, orbit phase, size, speed, enter time, orbit rx, ry, cx, cy]
    var BF = [[-160, 560, 3.6, 1.0, .55, .75, 600, 160, 640, 280], [1440, 140, .4, .82, .62, .95, 540, 220, 650, 260],
              [-160, 120, 2.5, .72, .5, 1.15, 560, 150, 620, 250], [1440, 640, 5.5, .9, .58, 1.3, 590, 150, 660, 300],
              [700, 860, 4.6, .64, .66, 1.5, 600, 140, 640, 240]];
    var _uid = 0;
    function bfPos(i, t) {
        var b = BF[i], a = b[2] + (t - b[5]) * 1.6 * b[4];
        var ox = b[8] + Math.cos(a) * b[6] + 30 * Math.sin(t * 2.3 + i), oy = b[9] + Math.sin(a * (1 + .15 * i)) * b[7] + 18 * Math.sin(t * 3.1 + i * 2);
        var k = cubicOut(seg(t, b[5], b[5] + .9)), e = expoIn(seg(t, 3.0 + i * .04, 3.75));
        return [b[0] + (ox - b[0]) * k + (ox > 640 ? 1 : -1) * 700 * e, b[1] + (oy - b[1]) * k - 420 * e];
    }
    function buildButterflies(box, hueShift) {
        var els = [];
        for (var i = 0; i < BF.length; i++) {
            var id = 'agpbf' + (++_uid), d = document.createElement('div');
            d.className = 'agp-ent-bf';
            d.innerHTML = '<div class="w l"><div style="width:100%;height:100%;transform:scaleX(-1)">' + WING.replace(/__G/g, id + 'g').replace(/__S/g, id + 's') + '</div></div>' +
                '<div class="w r">' + WING.replace(/__G/g, id + 'G').replace(/__S/g, id + 'S') + '</div><div class="bd"></div>';
            box.appendChild(d); els.push(d);
        }
        if (hueShift) box.style.filter = 'hue-rotate(' + hueShift + 'deg)';
        return els;
    }
    function drawButterflies(els, g, t) {
        g.clearRect(0, 0, 1280, 720);
        g.globalCompositeOperation = 'lighter';
        for (var i = 0; i < els.length; i++) {
            var b = BF[i], el = els[i];
            if (t < b[5] || t > 3.9) { el.style.opacity = 0; continue; }
            var p = bfPos(i, t), p2 = bfPos(i, t + .02), head = Math.atan2(p2[1] - p[1], p2[0] - p[0]) * 180 / Math.PI + 90;
            var flap = 14 + 58 * (.5 + .5 * Math.sin(t * 2 * Math.PI * (5.5 + i * .5) + i));
            el.style.opacity = seg(t, b[5], b[5] + .25) * (1 - seg(t, 3.55, 3.85));
            el.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px) rotateZ(' + (head * .35) + 'deg) scale(' + (.78 * b[3]) + ')';
            el.children[1].style.transform = 'rotateX(18deg) rotateY(' + (-flap) + 'deg)';
            el.children[0].style.transform = 'rotateX(18deg) rotateY(' + flap + 'deg)';
            for (var k = 1; k < 14; k++) {
                var tt = t - k * .035; if (tt < b[5]) break;
                var q = bfPos(i, tt), a = Math.pow(1 - k / 14, 1.5) * .7 * (1 - seg(t, 3.5, 3.85));
                var jx = (hash(i * 97 + Math.floor(tt * 60)) - .5) * 10, jy = (hash(i * 31 + Math.floor(tt * 60)) - .5) * 10 + k * 1.2;
                var r = 1.8 + 2.6 * (1 - k / 14), gr = g.createRadialGradient(q[0] + jx, q[1] + jy, 0, q[0] + jx, q[1] + jy, r * 3);
                gr.addColorStop(0, 'rgba(255,235,248,' + a + ')'); gr.addColorStop(1, 'rgba(255,120,200,0)');
                g.fillStyle = gr; g.beginPath(); g.arc(q[0] + jx, q[1] + jy, r * 3, 0, 7); g.fill();
            }
        }
        g.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------------- notes (music wave)
    // موجة نوتات تعبر المسرح (1280×720) من اليسار لليمين: النوتات تطلع من رأس
    // الموجة وتتطاير وتختفي، ووراها 5 خطوط مدرج. كل شي محسوب من الزمن t مباشرة
    // (بذرة عشوائية ثابتة)، فالحركة ناعمة بأي معدل إطارات.
    var NOTE_HEAD_END = 2.1;
    function notesWaveY(x, t) {   // x: 0..1 من العرض → y: 0..1 من الطول، تمر بمكان الإطار (0.4) عند x=0.5
        return .4 + .16 * Math.sin((x - .5) * 5.2 + .9) * (1 - .35 * x) - .16 * Math.sin(.9) * (1 - .35 * .5) +
            .015 * Math.sin(t * 2.2 + x * 7) + .13 * (1 - smooth(-.2, .55, x));
    }
    function notesSlope(x, t) { return (notesWaveY(x + .002, t) - notesWaveY(x - .002, t)) / .004; }
    function notesHead(t) { return -.1 + 1.25 * easeInOut(t / NOTE_HEAD_END); }
    function smooth(a, b, x) { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); }
    function easeInOut(x) { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function noteSprites(glow) {
        var px = 64, sz = Math.round(px * 2.2), out = [];
        function sprite(draw) {
            var c = document.createElement('canvas'); c.width = c.height = sz; var g = c.getContext('2d');
            g.translate(sz / 2, sz / 2); g.shadowColor = 'rgba(' + glow + ',.95)'; g.shadowBlur = px * .35;
            g.fillStyle = '#fffaf0'; g.strokeStyle = '#fffaf0'; g.lineCap = 'round';
            draw(g, px * .5); draw(g, px * .5); return c;
        }
        function head(g, u, x, y) { g.save(); g.translate(x, y); g.rotate(-.45); g.beginPath(); g.ellipse(0, 0, u * .42, u * .3, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
        out.push(sprite(function (g, u) { head(g, u, -u * .2, u * .55); g.lineWidth = u * .12; g.beginPath(); g.moveTo(u * .17, u * .5); g.lineTo(u * .17, -u * .85); g.quadraticCurveTo(u * .3, -u * .35, u * .7, -u * .2); g.stroke(); }));
        out.push(sprite(function (g, u) { head(g, u, -u * .62, u * .62); head(g, u, u * .42, u * .45); g.lineWidth = u * .11; g.beginPath(); g.moveTo(-u * .25, u * .58); g.lineTo(-u * .25, -u * .7); g.moveTo(u * .79, u * .4); g.lineTo(u * .79, -u * .88); g.stroke(); g.lineWidth = u * .2; g.beginPath(); g.moveTo(-u * .25, -u * .66); g.lineTo(u * .79, -u * .84); g.stroke(); }));
        out.push(sprite(function (g, u) { head(g, u, -u * .1, u * .6); g.lineWidth = u * .12; g.beginPath(); g.moveTo(u * .27, u * .55); g.lineTo(u * .27, -u * .85); g.stroke(); }));
        out.push(sprite(function (g, u) { g.beginPath(); for (var i = 0; i < 8; i++) { var r = i % 2 ? u * .14 : u * .55, a = i * Math.PI / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }));
        return out;
    }
    function buildNotes(o) {
        var cv = o.root.querySelector('.agp-ent-notecv'), dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = 1280 * dpr; cv.height = 720 * dpr;
        var g = cv.getContext('2d'); g.scale(dpr, dpr);
        var parts = [];
        for (var i = 0; i < 700; i++) {
            var r = function (k) { return hash(i * 13.7 + k * 101.3); };
            parts.push({ born: Math.pow(r(1), .9) * NOTE_HEAD_END, life: 1.1 + r(2) * .9, off: (r(3) + r(4) + r(5) - 1.5) * .14,
                dx: (r(6) - .3) * .05, dy: -(.02 + r(7) * .06), k: r(8) < .12 ? 3 : Math.floor(r(9) * 3), sc: .45 + r(10) * .7,
                rot: (r(11) - .5) * .6, spin: (r(12) - .5) * 1.2, ph: r(13) * 6.28, lag: r(14) * .08 });
        }
        o.notes = { g: g, parts: parts, sprites: noteSprites(o.glow) };
    }
    function drawNotes(o, t) {
        var N = o.notes, g = N.g, W = 1280, H = 720, fadeAll = 1 - smooth(3.4, 3.9, t);
        g.clearRect(0, 0, W, H);
        var hx = notesHead(t), tail = Math.max(-.1, hx - .75), lineA = smooth(0, .3, t) * (1 - smooth(2.4, 3.2, t));
        if (lineA > 0) {
            g.lineWidth = 1.2; g.shadowColor = 'rgba(' + o.glow + ',.8)'; g.shadowBlur = 6;
            for (var L = -2; L <= 2; L++) {
                g.beginPath();
                for (var x = tail; x <= Math.min(hx, 1.12); x += .006) { var y = (notesWaveY(x, t) + L * .018) * H; if (x === tail) g.moveTo(x * W, y); else g.lineTo(x * W, y); }
                var gr = g.createLinearGradient(tail * W, 0, hx * W, 0);
                gr.addColorStop(0, 'rgba(255,245,225,0)'); gr.addColorStop(.6, 'rgba(255,245,225,' + (.35 * lineA) + ')'); gr.addColorStop(1, 'rgba(255,250,235,' + (.7 * lineA) + ')');
                g.strokeStyle = gr; g.stroke();
            }
            g.shadowBlur = 0;
        }
        for (var i = 0; i < N.parts.length; i++) {
            var p = N.parts[i], age = t - p.born; if (age < 0 || age > p.life) continue;
            var u = age / p.life, a = smooth(0, .12, u) * (1 - smooth(.55, 1, u)) * fadeAll; if (a <= 0) continue;
            var x0 = notesHead(p.born) - p.lag;
            var px = x0 + p.dx * age + .012 * Math.sin(p.ph + age * 3);
            var py = notesWaveY(x0, p.born) + p.off * (.6 + .8 * Math.pow(Math.sin(x0 * 3.1 + 1.2), 2)) + p.dy * age;
            var d = 30 * p.sc * (.8 + .35 * smooth(0, .25, u)) * 2.2;
            g.save(); g.globalAlpha = a; g.translate(px * W, py * H); g.rotate(p.rot + p.spin * age + .12 * Math.sin(p.ph + age * 4));
            g.drawImage(N.sprites[p.k], -d / 2, -d / 2, d, d); g.restore();
        }
    }

    // ---------------------------------------------------------------- cloud (soft pastel)
    // دخولية ناعمة: غيوم قطنية تدخل من الجوانب وتطلع بالنهاية، فقاعات تطفو من تحت،
    // لمعات صغيرة، ودفعة قلوب لما ينزل الإطار. كل شي sprites مرسومة مرة وحدة، وكل
    // حركة محسوبة من الزمن t (بذرة ثابتة)، فالحركة ناعمة بأي معدل إطارات.
    var CLOUD_PAL = {
        pink:   { main: '255,150,200', light: '255,226,241', dim: 'radial-gradient(ellipse at 50% 45%, rgba(70,24,52,.5), rgba(18,6,14,.92) 72%)' },
        purple: { main: '190,160,255', light: '236,226,255', dim: 'radial-gradient(ellipse at 50% 45%, rgba(44,26,78,.5), rgba(10,6,20,.92) 72%)' },
        sky:    { main: '140,200,255', light: '226,242,255', dim: 'radial-gradient(ellipse at 50% 45%, rgba(18,40,74,.5), rgba(4,8,18,.92) 72%)' },
        mint:   { main: '120,225,190', light: '222,250,238', dim: 'radial-gradient(ellipse at 50% 45%, rgba(14,54,46,.5), rgba(3,12,10,.92) 72%)' }
    };
    // [from x, to x, y, scale, drift phase]
    var CLOUDS = [[-420, 110, 650, 1.35, 0], [1700, 1170, 640, 1.45, 1.7], [-320, 400, 735, 1.05, 2.9],
                  [1600, 880, 745, 1.15, 4.1], [-300, 140, 85, .7, 5.2], [1580, 1140, 105, .8, .8]];
    function cloudSprites(pal) {
        function mk(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); draw(g, w, h); return c; }
        var cloud = mk(460, 260, function (g) {
            var puffs = [[130, 160, 72], [205, 120, 88], [290, 130, 78], [350, 165, 60], [85, 180, 46], [230, 180, 84], [330, 190, 48]];
            g.shadowColor = 'rgba(' + pal.main + ',.75)'; g.shadowBlur = 34;
            var gr = g.createLinearGradient(0, 40, 0, 250);
            gr.addColorStop(0, 'rgba(255,255,255,.97)'); gr.addColorStop(.55, 'rgba(' + pal.light + ',.93)'); gr.addColorStop(1, 'rgba(' + pal.main + ',.7)');
            g.fillStyle = gr; g.beginPath();
            puffs.forEach(function (p) { g.moveTo(p[0] + p[2], p[1]); g.arc(p[0], p[1], p[2], 0, Math.PI * 2); });
            g.fill(); g.shadowBlur = 0;
            g.fillStyle = 'rgba(255,255,255,.55)';   // ضوء ناعم فوق الغيمة
            g.beginPath(); g.ellipse(195, 82, 46, 18, -.25, 0, Math.PI * 2); g.fill();
        });
        var bubble = mk(72, 72, function (g) {
            g.translate(36, 36);
            var gr = g.createRadialGradient(-6, -6, 2, 0, 0, 30);
            gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(.7, 'rgba(' + pal.light + ',.12)'); gr.addColorStop(1, 'rgba(' + pal.main + ',.45)');
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill();
            g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
            g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(-11, -12, 7, 4, -.7, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.arc(12, 13, 2.2, 0, Math.PI * 2); g.fill();
        });
        var heart = mk(80, 80, function (g) {
            g.translate(40, 42); var u = 24;
            g.shadowColor = 'rgba(' + pal.main + ',.95)'; g.shadowBlur = 14;
            g.fillStyle = 'rgb(' + pal.light + ')';
            g.beginPath(); g.moveTo(0, u * .55);
            g.bezierCurveTo(-u * 1.1, -u * .15, -u * .55, -u * 1.05, 0, -u * .45);
            g.bezierCurveTo(u * .55, -u * 1.05, u * 1.1, -u * .15, 0, u * .55);
            g.fill(); g.shadowBlur = 0;
            g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(-u * .42, -u * .45, u * .16, u * .1, -.6, 0, Math.PI * 2); g.fill();
        });
        var spark = mk(64, 64, function (g) {
            g.translate(32, 32); g.shadowColor = 'rgba(' + pal.main + ',1)'; g.shadowBlur = 10; g.fillStyle = '#fff';
            g.beginPath(); for (var i = 0; i < 8; i++) { var r = i % 2 ? 4 : 20, a = i * Math.PI / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
        });
        return { cloud: cloud, bubble: bubble, heart: heart, spark: spark };
    }
    function buildCloud(o, color) {
        var pal = CLOUD_PAL[color] || CLOUD_PAL.pink;
        o.dim.style.background = pal.dim;
        var cv = o.root.querySelector('.agp-ent-cloudcv'), dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = 1280 * dpr; cv.height = 720 * dpr;
        var g = cv.getContext('2d'); g.scale(dpr, dpr);
        var R = function (i, k) { return hash(i * 17.3 + k * 91.7); }, bubbles = [], floats = [], burst = [], sparks = [], i;
        for (i = 0; i < 46; i++) bubbles.push({ born: .2 + R(i, 1) * 2.7, life: 1.7 + R(i, 2) * 1.1, x: 60 + R(i, 3) * 1160, sp: 150 + R(i, 4) * 170, r: 9 + R(i, 5) * 22, ph: R(i, 6) * 6.28 });
        for (i = 0; i < 18; i++) floats.push({ born: 1.35 + R(i, 7) * 1.7, life: 1.4 + R(i, 8) * .7, x: 640 + (R(i, 9) - .5) * 560, y: 330 + (R(i, 10) - .5) * 120, sp: 60 + R(i, 11) * 60, sc: .35 + R(i, 12) * .3, ph: R(i, 13) * 6.28 });
        for (i = 0; i < 12; i++) burst.push({ a: i / 12 * Math.PI * 2 + (R(i, 14) - .5) * .4, d: 210 + R(i, 15) * 110, sc: .45 + R(i, 16) * .35, rot: (R(i, 17) - .5) * .8 });
        for (i = 0; i < 30; i++) sparks.push({ x: 40 + R(i, 18) * 1200, y: 30 + R(i, 19) * 660, ph: R(i, 20) * 6.28, sp: 2.2 + R(i, 21) * 2.4, sc: .3 + R(i, 22) * .45 });
        o.cloud = { g: g, s: cloudSprites(pal), bubbles: bubbles, floats: floats, burst: burst, sparks: sparks };
    }
    function drawCloud(o, t) {
        var C = o.cloud, g = C.g, S = C.s, all = 1 - smooth(3.45, 3.95, t), i, p, a, d;
        g.clearRect(0, 0, 1280, 720);
        // لمعات بعيدة
        var sw = smooth(.3, .9, t) * all;
        for (i = 0; i < C.sparks.length; i++) {
            p = C.sparks[i]; a = Math.pow(Math.max(0, Math.sin(t * p.sp + p.ph)), 3) * sw; if (a <= .02) continue;
            d = 64 * p.sc * (.7 + .3 * a);
            g.globalAlpha = a; g.drawImage(S.spark, p.x - d / 2, p.y - d / 2, d, d);
        }
        // فقاعات تطفو
        for (i = 0; i < C.bubbles.length; i++) {
            p = C.bubbles[i]; var age = t - p.born; if (age < 0 || age > p.life) continue;
            var u = age / p.life; a = smooth(0, .15, u) * (1 - smooth(.7, 1, u)) * all; if (a <= 0) continue;
            var by = 770 - p.sp * age, bx = p.x + 16 * Math.sin(p.ph + age * 2.4);
            d = p.r * 2 * (1 + .04 * Math.sin(age * 6 + p.ph));
            g.globalAlpha = a; g.drawImage(S.bubble, bx - d / 2, by - d / 2, d, d * (1 - .05 * Math.sin(age * 5 + p.ph)));
        }
        // دفعة قلوب لما ينزل الإطار
        var bt = t - 1.25;
        if (bt > 0 && bt < 1.3) {
            var k = cubicOut(clamp(bt / 1.1)), ba = (1 - smooth(.55, 1.3, bt)) * smooth(0, .08, bt);
            for (i = 0; i < C.burst.length; i++) {
                p = C.burst[i]; d = 80 * p.sc * (.6 + .4 * k);
                g.save(); g.globalAlpha = ba; g.translate(640 + Math.cos(p.a) * p.d * k, 288 + Math.sin(p.a) * p.d * k * .8 - 30 * bt);
                g.rotate(p.rot * k); g.drawImage(S.heart, -d / 2, -d / 2, d, d); g.restore();
            }
        }
        // قلوب صغيرة تطلع حول الإطار
        for (i = 0; i < C.floats.length; i++) {
            p = C.floats[i]; var fa = t - p.born; if (fa < 0 || fa > p.life) continue;
            var fu = fa / p.life; a = smooth(0, .2, fu) * (1 - smooth(.6, 1, fu)) * all; if (a <= 0) continue;
            d = 80 * p.sc * (.7 + .3 * smooth(0, .3, fu));
            g.save(); g.globalAlpha = a; g.translate(p.x + 14 * Math.sin(p.ph + fa * 3), p.y - p.sp * fa); g.rotate(.25 * Math.sin(p.ph + fa * 2.5));
            g.drawImage(S.heart, -d / 2, -d / 2, d, d); g.restore();
        }
        // الغيوم تدخل من الجوانب، تتمايل، وترجع تطلع بالنهاية
        var ex = easeInOut(seg(t, 3.15, 3.95));
        for (i = 0; i < CLOUDS.length; i++) {
            p = CLOUDS[i];
            var ck = cubicOut(seg(t, .05 + i * .07, 1.35 + i * .07));
            var cx = p[0] + (p[1] - p[0]) * ck + (p[0] - p[1]) * ex + 10 * Math.sin(t * .9 + p[4]);
            var cy = p[2] + 6 * Math.sin(t * 1.3 + p[4]);
            var cw = 460 * p[3], ch = 260 * p[3];
            g.globalAlpha = seg(t, 0, .5) * (1 - seg(t, 3.55, 3.95)) * .95;
            g.drawImage(S.cloud, cx - cw / 2, cy - ch / 2, cw, ch);
        }
        g.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- per-model motion of card + title
    function title(o, t, tIn, tOut, rise) {
        var a = cubicOut(seg(t, tIn, tIn + .7)), out = seg(t, tOut, tOut + .35);
        o.title.style.opacity = a * (1 - out);
        o.title.style.transform = 'translateY(' + ((1 - a) * rise - out * 8) + 'px)';
        o.name.style.letterSpacing = ((1 - a) * 10) + 'px';
        o.tag.style.opacity = seg(t, tIn + .15, tIn + .6);
        o.msg.style.opacity = seg(t, tIn + .35, tIn + .8);
    }
    function card(o, x, y, sc, filter, op) { o.card.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + sc + ')'; o.card.style.filter = filter; o.card.style.opacity = op; }
    function shake(o, t, amp) { o.world.style.transform = amp > .3 ? 'translate(' + ((hash(t * 997) - .5) * amp * 2) + 'px,' + ((hash(t * 991 + 7) - .5) * amp * 2) + 'px)' : 'none'; }
    function flash(o, op, rgb) { o.flash.style.opacity = op; o.flash.style.background = 'radial-gradient(circle at 50% 42%, rgba(255,255,255,1), rgba(' + rgb + ',.5) 35%, transparent 70%)'; }

    var RUN = {
        nitro: function (o, t) {
            o.dim.style.opacity = seg(t, 0, .3) * (1 - seg(t, 3.55, 4));
            var X = function (s) { return s < .4 ? 1500 : s < .87 ? 1500 * (1 - expoOut(seg(s, .4, .87))) : s < 3.0 ? 0 : -1700 * expoIn(seg(s, 3.0, 3.45)); };
            var v = (X(t + 1 / 120) - X(t - 1 / 120)) * 60, imp = bump(t, .9, .12);
            card(o, X(t), t > 1.2 && t < 3 ? Math.sin((t - 1.2) * 2.6) * 3 : 0, 1 + .06 * imp,
                 'blur(' + clamp(Math.abs(v) / 2600, 0, 5) + 'px) brightness(' + (1 + .5 * imp) + ')', t < .4 || t > 3.45 ? 0 : 1);
            o.card.style.transform += ' skewX(' + clamp(-v / 1100, -14, 14) + 'deg)';
            shake(o, t, Math.max(bump(t, .88, .08) * 12, bump(t, .42, .06) * 5, bump(t, 3.02, .07) * 8));
            flash(o, Math.max(.8 * bump(t, .88, .05), .45 * bump(t, .4, .05)), o.glow);
            title(o, t, 1.05, 2.95, 18);
        },
        royal: function (o, t) {
            o.dim.style.opacity = seg(t, 0, .45) * (1 - seg(t, 3.55, 4));
            var ci = cubicOut(seg(t, .7, 1.5)), co = seg(t, 3.15, 3.55);
            card(o, 0, (1 - ci) * 30 - co * 6 + (t > 1.5 && t < 3.15 ? Math.sin((t - 1.5) * 2) * 2 : 0), .97 + .03 * ci,
                 'blur(' + ((1 - ci) * 8 + co * 6) + 'px) brightness(' + (1 + .35 * bump(t, 1.2, .3)) + ') drop-shadow(0 0 22px rgba(' + o.glow + ',.35))', ci * (1 - co));
            shake(o, t, 0);
            flash(o, .25 * bump(t, 1.05, .25), o.glow);
            title(o, t, 1.5, 3.05, 14);
        },
        princess: function (o, t) {
            o.dim.style.opacity = seg(t, 0, .45) * (1 - seg(t, 3.55, 4));
            var ci = cubicOut(seg(t, .65, 1.35)), co = seg(t, 3.1, 3.5);
            card(o, 0, t > 1.35 && t < 3.1 ? Math.sin((t - 1.35) * 2.2) * 3 : 0, (.9 + .1 * ci) * (1 + .04 * co),
                 'blur(' + ((1 - ci) * 12 + co * 10) + 'px) brightness(' + (1 + .3 * bump(t, 1.05, .3)) + ') drop-shadow(0 0 24px rgba(' + o.glow + ',.45))', ci * (1 - co));
            shake(o, t, 0);
            flash(o, .3 * bump(t, .95, .25), o.glow);
            title(o, t, 1.35, 3.0, 14);
            if (o.bfs) drawButterflies(o.bfs, o.trail, t);
        },
        storm: function (o, t) {
            o.dim.style.opacity = seg(t, 0, .25) * (1 - seg(t, 3.6, 4));
            var ap = seg(t, .4, .55), ex = seg(t, 3.2, 3.32);
            var flick = t > .4 && t < .62 ? (hash(Math.floor(t * 30)) > .3 ? 1 : .25) : 1;
            card(o, 0, t > .7 && t < 3.2 ? Math.sin((t - .7) * 2.4) * 2 : 0, 1.04 - .04 * cubicOut(ap),
                 'brightness(' + (1 + 1.1 * bump(t, .42, .07) + .5 * bump(t, 2.0, .06) + 1.2 * bump(t, 3.2, .05)) + ')', t < .4 ? 0 : flick * (1 - ex));
            shake(o, t, Math.max(bump(t, .42, .07) * 14, bump(t, 2.0, .06) * 5, bump(t, 3.2, .06) * 11));
            flash(o, Math.max(.95 * bump(t, .41, .035), .5 * bump(t, .48, .03), .45 * bump(t, 2.0, .04), .9 * bump(t, 3.2, .035)), o.glow);
            title(o, t, 1.0, 3.0, 12);
        },
        notes: function (o, t) {
            o.dim.style.opacity = seg(t, 0, .35) * (1 - seg(t, 3.55, 4));
            drawNotes(o, t);
            // الإطار يركب الموجة من خارج اليسار، يميل مع اتجاهها، ويستقر بمكانه بنعومة
            var T0 = .4, T1 = 2.0, u = seg(t, T0, T1), e = easeInOut(u);
            var fx = -.22 + .72 * e, w = smooth(.55, 1, e);
            var cy = .4 + (notesWaveY(fx, t) - .4) * .7 * (1 - w);
            var ang = Math.atan(notesSlope(fx, t) * 720 / 1280) * (1 - w) * .55;
            var sc = .5 + .5 * cubicOut(u), st = t - T1;
            if (st > 0) sc *= 1 + .028 * Math.exp(-st * 5) * Math.sin(st * 11);
            var co = seg(t, 3.1, 3.5);
            card(o, fx * 1280 - 640, cy * 720 - 288, sc * (1 - .06 * co),
                 'brightness(' + (1 + .3 * bump(t, 2.05, .2)) + ') drop-shadow(0 0 22px rgba(' + o.glow + ',' + (.45 * smooth(1.6, 2.2, t)) + '))',
                 seg(t, T0, T0 + .35) * (1 - co));
            o.card.style.transform += ' rotate(' + ang + 'rad)';
            shake(o, t, 0);
            flash(o, .22 * bump(t, 2.05, .2), o.glow);
            title(o, t, 2.0, 3.05, 14);
        },
        cloud: function (o, t) {
            o.dim.style.opacity = seg(t, 0, .4) * (1 - seg(t, 3.55, 4));
            drawCloud(o, t);
            // الإطار يطلع من تحت بنعومة، ينط نطّة صغيرة (يتمدد ويرجع)، ويتمايل كأنه طاير
            var u = seg(t, .7, 1.25), bk = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
            var st = t - 1.25, sq = st > 0 ? .07 * Math.exp(-st * 5.5) * Math.sin(st * 15) : 0;
            var co = seg(t, 3.1, 3.5), fl = t > 1.25 ? Math.sin((t - 1.25) * 2.4) * 5 * (1 - co) : 0;
            o.card.style.transform = 'translate(0px,' + ((1 - bk) * 320 + fl - co * 40) + 'px) scale(' + ((1 + sq) * (.9 + .1 * u)) + ',' + ((1 - sq) * (.9 + .1 * u)) + ')';
            o.card.style.filter = 'brightness(' + (1 + .25 * bump(t, 1.3, .25)) + ') drop-shadow(0 0 26px rgba(' + o.glow + ',' + (.55 * smooth(1.0, 1.6, t)) + '))';
            o.card.style.opacity = seg(t, .7, .95) * (1 - co);
            shake(o, t, 0);
            flash(o, .2 * bump(t, 1.28, .22), o.glow);
            title(o, t, 1.55, 3.05, 22);
        }
    };

    // ---------------------------------------------------------------- building + playing one entrance
    function cardHtml(player) {
        if (AGP.playerCard && typeof AGP.playerCard.renderHtml === 'function') {
            try {
                var html = AGP.playerCard.renderHtml({ id: player.id, name: player.name, avatarUrl: player.avatarUrl, frame: player.frame }, { showFrame: true, basePath: ROOT });
                if (html) return html;
            } catch (e) { /* fall back to the simple card */ }
        }
        var av = player.avatarUrl ? '<img src="' + esc(player.avatarUrl) + '" alt="" referrerpolicy="no-referrer">' : '<i></i>';
        return '<div class="agp-ent-basic">' + av + '<b>' + esc(player.name || '') + '</b></div>';
    }

    function build(player, key, color) {
        injectStyles();
        var M = MODELS[key], glow = GLOW[color] || '255,255,255';
        var root = document.createElement('div');
        root.className = 'agp-ent agp-ent-' + key + ' agp-ent-c-' + color;
        root.innerHTML =
            '<div class="agp-ent-dim" style="background:' + M.dim + '"></div>' +
            '<div class="agp-ent-stage"><div class="agp-ent-world">' +
            '<div class="agp-ent-back"></div>' +
            (M.notes ? '<canvas class="agp-ent-notecv"></canvas>' : '') +
            (M.cloud ? '<canvas class="agp-ent-cloudcv"></canvas>' : '') +
            '<div class="agp-ent-card"><div class="agp-ent-card-in">' + cardHtml(player) + '</div></div>' +
            '<div class="agp-ent-title"><div class="agp-ent-tag">' + esc(M.tag) + '</div>' +
            '<div class="agp-ent-name" style="text-shadow:0 0 24px rgba(' + glow + ',.75),0 4px 12px rgba(0,0,0,.8)">' + esc(player.name || '') + '</div>' +
            '<div class="agp-ent-msg">' + esc((player.entrance && player.entrance.entranceText) || '') + '</div></div>' +
            '<div class="agp-ent-front"></div>' +
            (M.butterflies ? '<canvas class="agp-ent-trail" width="1280" height="720"></canvas><div class="agp-ent-bfs"></div>' : '') +
            '<div class="agp-ent-flash"></div></div></div>';
        var q = function (c) { return root.querySelector('.agp-ent-' + c); };
        var o = { root: root, key: key, glow: glow, dim: q('dim'), stage: q('stage'), world: q('world'), card: q('card'), title: q('title'), tag: q('tag'), name: q('name'), msg: q('msg'), flash: q('flash'), vids: [] };
        M.layers.forEach(function (L) {
            var v = document.createElement('video');
            v.className = 'agp-ent-fx'; v.muted = true; v.playsInline = true; v.preload = 'auto';
            v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
            v.innerHTML = '<source src="' + ASSETS + key + '/' + L.n + '.mp4" type="video/mp4"><source src="' + ASSETS + key + '/' + L.n + '.webm" type="video/webm">';
            v.style.filter = layerFilter(key, L, color);
            q(L.z).appendChild(v);
            o.vids.push({ L: L, v: v, started: false });
        });
        if (M.butterflies) {
            var shift = (COLORS.princess[color] || 328) - 328;
            o.bfs = buildButterflies(q('bfs'), shift);
            o.trail = q('trail').getContext('2d');
            if (shift) q('trail').style.filter = 'hue-rotate(' + shift + 'deg)';
        }
        if (M.notes) buildNotes(o);
        if (M.cloud) buildCloud(o, color);
        if (M.sound) { o.audio = new Audio(ASSETS + key + '/' + M.sound); o.audio.preload = 'auto'; }
        return o;
    }

    function fit(o) {
        var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        o.stage.style.transform = 'scale(' + s + ')';
    }

    function whenReady(o, cb) {
        var left = o.vids.length, done = false;
        var go = function () { if (!done) { done = true; cb(); } };
        if (!left) return go();
        o.vids.forEach(function (x) {
            var ok = function () { if (--left <= 0) go(); };
            if (x.v.readyState >= 3) ok(); else { x.v.addEventListener('canplaythrough', ok, { once: true }); x.v.addEventListener('error', ok, { once: true }); }
        });
        setTimeout(go, 3000);   // slow connection: start anyway, late clips just join in
    }

    function run(player, done) {
        var e = player.entrance || {}, key = e.templateKey;
        var color = COLORS[key] && Object.prototype.hasOwnProperty.call(COLORS[key], e.color) ? e.color : Object.keys(COLORS[key])[0];
        var o = build(player, key, color);
        document.body.appendChild(o.root);
        fit(o);
        // long names shrink to fit the stage instead of being cut
        var nw = o.name.scrollWidth;
        if (nw > 1100) o.name.style.fontSize = Math.max(34, parseFloat(getComputedStyle(o.name).fontSize) * 1100 / nw) + 'px';
        var onResize = function () { fit(o); };
        window.addEventListener('resize', onResize);
        whenReady(o, function () {
            var t0 = performance.now();
            if (o.audio) { try { var p = o.audio.play(); if (p && p.catch) p.catch(function () {}); } catch (err) { /* autoplay blocked */ } }
            (function frame() {
                var t = (performance.now() - t0) / 1000;
                o.vids.forEach(function (x) {
                    var L = x.L, on = t >= L.t0 && t <= L.t1;
                    if (on && !x.started) { x.started = true; try { x.v.currentTime = 0; var pp = x.v.play(); if (pp && pp.catch) pp.catch(function () {}); } catch (err) { /* ignore */ } }
                    var a = on ? Math.min(seg(t, L.t0, L.t0 + L.fi), 1 - seg(t, L.t1 - L.fo, L.t1)) * L.op : 0;
                    x.v.style.opacity = a;
                    if (L.s) x.v.style.transform = 'scale(' + L.s(t - L.t0) + ')';
                    if (t > L.t1 && !x.v.paused) x.v.pause();
                });
                RUN[key](o, t);
                if (t < DURATION) return requestAnimationFrame(frame);
                window.removeEventListener('resize', onResize);
                o.vids.forEach(function (x) { x.v.pause(); x.v.removeAttribute('src'); x.v.innerHTML = ''; });
                if (o.root.parentNode) o.root.parentNode.removeChild(o.root);
                done();
            }());
        });
    }

    // ---------------------------------------------------------------- queue + triggers
    // متى تتكرر: الدخولية تطلع مرة لكل «دخول» حقيقي، مو مع كل تعليق:
    //  - أول مرة يظهر اللاعب، أو لو غيّر دخوليته/لونها/نصها (توقيع مختلف).
    //  - لو انطرد/طلع ورجع: اسمه ما كان باللوبي قبل التعليق وصار موجود بعده.
    //  - ألعاب الشِل: كل player:joined حقيقي.
    // ودردشة لاعب موجود باللوبي ما تكررها.
    var _queue = [], _busy = false, _seen = {};
    var SEEN_KEY = 'agp-entrance-seen';
    var SAME_JOIN_GUARD_MS = 3000;   // نفس الحدث يوصل مرتين (تعليق + انضمام) — ما تنعرض مرتين
    function signature(p) { var e = p.entrance || {}; return [e.templateKey, e.color || '', e.entranceText || ''].join('|'); }
    function readSeen() { try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function lastSeen(id) { return _seen[id] || readSeen()[id] || null; }
    function markSeen(id, sig) {
        _seen[id] = { t: Date.now(), sig: sig };
        try { var m = readSeen(); m[id] = _seen[id]; sessionStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch (e) { /* storage blocked */ }
    }
    function valid(player) { var k = player && player.entrance && player.entrance.templateKey; return Boolean(k && MODELS[k]); }
    function next() {
        if (_busy || !_queue.length) return;
        _busy = true;
        run(_queue.shift(), function () { _busy = false; setTimeout(next, 350); });
    }
    function enqueue(player) {
        markSeen(player.id, signature(player));
        if (_queue.length >= 6) return false;   // a flood of joins: skip the rest rather than block the lobby for minutes
        _queue.push(player); next();
        return true;
    }
    /** Plays unless this exact entrance already played for this player and nothing changed. */
    function play(player, opts) {
        if (!valid(player) || !player.id) return false;
        var last = lastSeen(player.id);
        if (last && typeof last === 'object' && Date.now() - last.t < SAME_JOIN_GUARD_MS) return false;
        if (!(opts && opts.rejoin) && last && (typeof last !== 'object' || last.sig === signature(player)) && Date.now() - (last.t || last) < REPLAY_GAP_MS) return false;
        return enqueue(player);
    }
    // Is this player's name currently shown on the lobby page (outside our own overlay)?
    function nameShown(name) {
        name = String(name || '').trim();
        if (name.length < 2 || !document.body) return false;
        var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var el = n.parentElement;
                if (!el || el.closest('.agp-ent, script, style, template')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        for (var n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.indexOf(name) >= 0) return true;
        return false;
    }

    // Shared-shell games: a player actually joined — every real join plays.
    AGP.events.on('player:joined', function (payload) { if (payload && payload.player) play(payload.player, { rejoin: true }); });
    // Lobby pages (games/<id>/lobby.html): first time the owner shows up, after a change, or when they (re)join the lobby.
    var ON_LOBBY = /\/lobby(\.html)?\/?$/i.test(location.pathname) || document.documentElement.hasAttribute('data-agp-entrance-on-comment');
    AGP.events.on('stream:commentReceived', function (payload) {
        if (!ON_LOBBY || !payload || !valid(payload)) return;
        if (play(payload)) return;
        // already seen with the same entrance: play again only if this comment (re)joined them to the lobby
        var before = nameShown(payload.name);
        if (before) return;
        setTimeout(function () { if (nameShown(payload.name)) play(payload, { rejoin: true }); }, 700);
    });

    AGP.entrance = {
        play: play,
        /** Plays right away for previews (profile page): no once-per-player rule. */
        preview: function (player) { if (!valid(player)) return false; _queue.push(player); next(); return true; },
        models: function () { return Object.keys(MODELS).map(function (k) { return { key: k, colors: Object.keys(COLORS[k]) }; }); }
    };
    // Kept for js/agp-game-shell.js (the old small badges are gone; the full-screen entrance replaces them).
    AGP.playerEntrance = { syncSettled: function () {} };

    AGP.log('AGP Entrance loaded (6 entrances: nitro/royal/princess/storm/notes/cloud).');

}(window.AymanGamesPlatform));
