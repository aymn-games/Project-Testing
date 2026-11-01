/**
 * «المافيا» — المؤثرات الصوتية لشاشة البث (Web Audio، كل الأصوات مولّدة بالكود بدون ملفات).
 *
 * MafiaSFX.ambience(mode)  جو المكان بتلاشي ناعم: 'plaza-night' | 'plaza-day' | 'market' | 'room' | null
 * MafiaSFX.cue(k, data)    مؤثر لحظي يطلقه المشهد (mafia-scene.js) بتوقيته:
 *   step {g,pan} · heart · drone {dur} · eyes · shing · stab · stinger · thud · whoosh
 *   · slam · cage · bell · heal · rise · owl · tick · paper · buzz · clunk · fall · chain
 *   · revealMafia · revealTown · mourn · tie · fanfare {mafia} · firework {pan}
 * المتصفح ما يسمح بالصوت قبل أول ضغطة بالصفحة: unlock() تنربط بأول ضغطة تلقائياً،
 * وneedsUnlock() تقول للصفحة تعرض زر «تفعيل الصوت».
 */
(function () {
    'use strict';
    var ctx = null, master = null, noise = null, muted = false, amb = {}, ambMode = null, timers = [];
    var VOL = 0.8;

    function init() {
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : VOL;
        // ضاغط خفيف عشان الضربات القوية ما تشوّه صوت البث
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
        var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noise = buf;
        return ctx;
    }
    function now() { return ctx.currentTime; }
    function out(g, pan) {
        if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); }
        else g.connect(master);
    }
    function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function noiseSrc(t, dur) { var s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s; }
    function filt(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
    function osc(type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }

    // ---------------------------------------------------------------- المؤثرات
    var FX = {
        // خطوة على حجر: نقرة ضوضاء مفلترة + دقّة منخفضة
        step: function (t, d) {
            var g = ctx.createGain(), n = noiseSrc(t, 0.12), bp = filt('bandpass', 700 + Math.random() * 500, 1.2);
            n.connect(bp); bp.connect(g); env(g, t, 0.004, 0.5 * (d.g || 0.5), 0.09); out(g, d.pan || 0);
            var o = osc('sine', 95), g2 = ctx.createGain(); o.connect(g2); env(g2, t, 0.003, 0.35 * (d.g || 0.5), 0.07); o.start(t); o.stop(t + 0.1); out(g2, d.pan || 0);
        },
        // نبض القلب: دقتين منخفضتين
        heart: function (t, d) {
            [0, 0.16].forEach(function (o2, i) {
                var o = osc('sine', 62), g = ctx.createGain(), tt = t + o2;
                o.frequency.setValueAtTime(70, tt); o.frequency.exponentialRampToValueAtTime(38, tt + 0.18);
                o.connect(g); env(g, tt, 0.01, (i ? 0.45 : 0.7) * (d.g || 1), 0.2); o.start(tt); o.stop(tt + 0.3); out(g);
            });
        },
        // توتر: نغمتين منخفضتين متنافرتين يفتح فلترهم تدريجياً
        drone: function (t, d) {
            var dur = (d.dur || 3000) / 1000, lp = filt('lowpass', 180, 6), g = ctx.createGain();
            lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
            [55, 55.6, 82.4, 116.5].forEach(function (f) { var o = osc('sawtooth', f); o.connect(lp); o.start(t); o.stop(t + dur + 0.6); });
            lp.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5); out(g);
        },
        // ظهور العيون الحمر: ضربة عميقة + نفس معكوس
        eyes: function (t) {
            var o = osc('sine', 48), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(30, t + 1.2); o.connect(g); env(g, t, 0.02, 0.8, 1.3); o.start(t); o.stop(t + 1.5); out(g);
            var n = noiseSrc(t - 0.6, 0.8), bp = filt('bandpass', 1800, 0.8), g2 = ctx.createGain(); n.connect(bp); bp.connect(g2);
            g2.gain.setValueAtTime(0.0001, t - 0.6); g2.gain.exponentialRampToValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); out(g2);
        },
        // سحب السكين: كشطة معدن صاعدة + رنّة
        shing: function (t) {
            var n = noiseSrc(t, 0.45), hp = filt('bandpass', 2000, 6), g = ctx.createGain();
            hp.frequency.setValueAtTime(1800, t); hp.frequency.exponentialRampToValueAtTime(9000, t + 0.35);
            n.connect(hp); hp.connect(g); env(g, t, 0.02, 0.35, 0.38); out(g, -0.2);
            [2637, 3951].forEach(function (f, i) { var o = osc('sine', f), g2 = ctx.createGain(); o.connect(g2); env(g2, t + 0.3, 0.005, i ? 0.05 : 0.09, 0.9); o.start(t + 0.3); o.stop(t + 1.3); out(g2, -0.2); });
        },
        // الطعنة: ضربة مكتومة ثقيلة
        stab: function (t) {
            var n = noiseSrc(t, 0.2), lp = filt('lowpass', 1100), g = ctx.createGain(); n.connect(lp); lp.connect(g); env(g, t, 0.003, 0.9, 0.16); out(g);
            var o = osc('sine', 85), g2 = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(36, t + 0.3); o.connect(g2); env(g2, t, 0.003, 1, 0.32); o.start(t); o.stop(t + 0.4); out(g2);
        },
        // ضربة موسيقية درامية (أوركسترا مصغّرة) مع ذيل
        stinger: function (t) {
            var lp = filt('lowpass', 2400, 1), g = ctx.createGain();
            lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
            [55, 110, 130.8, 164.8, 220, 233.1].forEach(function (f) { var o = osc('sawtooth', f * (1 + (Math.random() - 0.5) * 0.004)); o.connect(lp); o.start(t); o.stop(t + 2.6); });
            lp.connect(g); env(g, t, 0.01, 0.32, 2.3); out(g);
            var n = noiseSrc(t, 1.2), hp = filt('highpass', 3000), g2 = ctx.createGain(); n.connect(hp); hp.connect(g2); env(g2, t, 0.005, 0.18, 1.1); out(g2);
        },
        // طيحة الجسم على الأرض
        thud: function (t) {
            var o = osc('sine', 70), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(32, t + 0.35); o.connect(g); env(g, t, 0.004, 0.9, 0.4); o.start(t); o.stop(t + 0.5); out(g);
            var n = noiseSrc(t, 0.3), lp = filt('lowpass', 420), g2 = ctx.createGain(); n.connect(lp); lp.connect(g2); env(g2, t, 0.004, 0.6, 0.26); out(g2);
        },
        // انتقال لقطة: هواء ناعم
        whoosh: function (t, d) {
            var n = noiseSrc(t, 0.7), bp = filt('bandpass', 400, 1.4), g = ctx.createGain();
            bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.35); bp.frequency.exponentialRampToValueAtTime(500, t + 0.65);
            n.connect(bp); bp.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * (d.g || 1), t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); out(g);
        },
        // ضربة المحقق على الطاولة
        slam: function (t) { FX.stab(t); FX.thud(t + 0.02); },
        // القفص ينزل: صدمة معدن ورنين
        cage: function (t) {
            FX.thud(t);
            [180, 241, 367, 512].forEach(function (f) { var o = osc('triangle', f), g = ctx.createGain(); o.connect(g); env(g, t, 0.003, 0.12, 1.4); o.start(t); o.stop(t + 1.6); out(g); });
        },
        // جرس الصبح
        bell: function (t) {
            [523.3, 659.3, 784].forEach(function (f, i) { var tt = t + i * 0.18, o = osc('sine', f), o2 = osc('sine', f * 2.01), g = ctx.createGain(); o.connect(g); o2.connect(g); env(g, tt, 0.01, 0.16, 1.6); o.start(tt); o2.start(tt); o.stop(tt + 1.8); o2.stop(tt + 1.8); out(g, (i - 1) * 0.3); });
        },
        // علاج الطبيب: لمعان صاعد
        heal: function (t) {
            [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach(function (f, i) { var tt = t + i * 0.22, o = osc('sine', f), g = ctx.createGain(); o.connect(g); env(g, tt, 0.02, 0.11, 0.9); o.start(tt); o.stop(tt + 1.1); out(g, Math.sin(i) * 0.4); });
        },
        rise: function (t) { FX.whoosh(t, { g: 1.3 }); FX.bell(t + 0.2); },
        // بومة بعيدة: «هوو… هوو»
        owl: function (t) {
            [0, 0.45].forEach(function (o2, i) {
                var tt = t + o2, o = osc('sine', i ? 370 : 410), g = ctx.createGain(), lp = filt('lowpass', 900);
                o.frequency.setValueAtTime(i ? 390 : 430, tt); o.frequency.exponentialRampToValueAtTime(i ? 340 : 380, tt + 0.35);
                o.connect(lp); lp.connect(g); env(g, tt, 0.06, 0.09, 0.32); o.start(tt); o.stop(tt + 0.45); out(g, 0.5);
            });
        },
        // تكتكة ساعة (غرفة التحقيق وآخر ثواني المؤقت)
        tick: function (t, d) {
            var n = noiseSrc(t, 0.03), bp = filt('bandpass', d.hi ? 3200 : 2400, 8), g = ctx.createGain(); n.connect(bp); bp.connect(g); env(g, t, 0.001, 0.4 * (d.g || 1), 0.025); out(g);
            var o = osc('sine', d.hi ? 1800 : 1200), g2 = ctx.createGain(); o.connect(g2); env(g2, t, 0.001, 0.08 * (d.g || 1), 0.03); o.start(t); o.stop(t + 0.05); out(g2);
        },
        // تقليب أوراق الملف
        paper: function (t) {
            var n = noiseSrc(t, 0.4), bp = filt('bandpass', 3500, 0.7), g = ctx.createGain(); n.connect(bp); bp.connect(g);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.05); g.gain.exponentialRampToValueAtTime(0.03, t + 0.2); g.gain.exponentialRampToValueAtTime(0.1, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38); out(g, 0.2);
        },
        // اهتزاز جوال على الطاولة (النتيجة وصلت للمحقق)
        buzz: function (t) {
            [0, 0.28, 0.56].forEach(function (o2) {
                var tt = t + o2, o = osc('square', 150), lp = filt('lowpass', 500), g = ctx.createGain(), lfo = osc('square', 30), lg = ctx.createGain();
                lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain); o.connect(lp); lp.connect(g); env(g, tt, 0.01, 0.12, 0.17);
                o.start(tt); lfo.start(tt); o.stop(tt + 0.2); lfo.stop(tt + 0.2); out(g);
            });
        },
        // كشاف ينطفي/يشتغل
        clunk: function (t) {
            var o = osc('square', 110), lp = filt('lowpass', 700), g = ctx.createGain(); o.connect(lp); lp.connect(g); env(g, t, 0.002, 0.35, 0.12); o.start(t); o.stop(t + 0.15); out(g);
            var n = noiseSrc(t, 0.1), hp = filt('highpass', 2000), g2 = ctx.createGain(); n.connect(hp); hp.connect(g2); env(g2, t, 0.001, 0.12, 0.06); out(g2);
            var hum = osc('sawtooth', 100), lp2 = filt('lowpass', 300), g3 = ctx.createGain(); hum.connect(lp2); lp2.connect(g3); g3.gain.setValueAtTime(0.0001, t); g3.gain.exponentialRampToValueAtTime(0.04, t + 0.1); g3.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); hum.start(t); hum.stop(t + 1.7); out(g3);
        },
        // صوت قفص يسقط من فوق (صفير نازل)
        fall: function (t) {
            var n = noiseSrc(t, 0.9), bp = filt('bandpass', 2500, 2), g = ctx.createGain();
            bp.frequency.setValueAtTime(3000, t); bp.frequency.exponentialRampToValueAtTime(400, t + 0.85);
            n.connect(bp); bp.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); out(g);
        },
        // سلاسل تنسحب (رفع القفص)
        chain: function (t) {
            for (var i = 0; i < 16; i++) {
                var tt = t + i * 0.09 + Math.random() * 0.03;
                [1300, 2100, 3400].forEach(function (f) { var o = osc('triangle', f * (0.95 + Math.random() * 0.1)), g = ctx.createGain(); o.connect(g); env(g, tt, 0.002, 0.025, 0.12); o.start(tt); o.stop(tt + 0.15); out(g, 0.1); });
            }
            FX.whoosh(t, { g: 1.2 });
        },
        // كشف فريق المطرود: مافيا = ضربة مظلمة، مدينة = نغمة حزينة
        revealMafia: function (t) { FX.stinger(t); FX.eyes(t); },
        revealTown: function (t) { FX.mourn(t); },
        // حزن: وتر صغير منخفض يتلاشى
        mourn: function (t) {
            var lp = filt('lowpass', 1200, 0.7), g = ctx.createGain();
            [110, 130.8, 164.8, 196].forEach(function (f, i) { var o = osc('triangle', f), tt = t + i * 0.12; o.connect(lp); o.start(tt); o.stop(t + 3.6); });
            lp.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5); out(g);
        },
        // تعادل/ما أحد طلع: نغمتين مترددتين
        tie: function (t) {
            [0, 0.35].forEach(function (o2, i) { var tt = t + o2, o = osc('triangle', i ? 196 : 220), g = ctx.createGain(); o.connect(g); env(g, tt, 0.02, 0.12, 0.5); o.start(tt); o.stop(tt + 0.6); out(g); });
        },
        // نفخة فوز: المدينة مشرقة، المافيا مظلمة
        fanfare: function (t, d) {
            var notes = d.mafia ? [[110, 0], [130.8, 0.25], [146.8, 0.5], [164.8, 0.8], [110, 0.8]] : [[261.6, 0], [329.6, 0.18], [392, 0.36], [523.3, 0.6], [392, 0.6], [659.3, 0.6]];
            notes.forEach(function (n) {
                var tt = t + n[1], long = n[1] >= 0.6, o = osc('sawtooth', n[0]), o2 = osc('square', n[0] * 1.003), lp = filt('lowpass', d.mafia ? 900 : 2600, 1), g = ctx.createGain();
                o.connect(lp); o2.connect(lp); lp.connect(g); env(g, tt, 0.02, 0.12, long ? 1.8 : 0.2); o.start(tt); o2.start(tt); o.stop(tt + (long ? 2.1 : 0.3)); o2.stop(tt + (long ? 2.1 : 0.3)); out(g);
            });
            if (d.mafia) FX.stab(t + 0.8); else FX.bell(t + 0.6);
        },
        // ألعاب نارية: صفير صعود ثم فرقعة وطقطقة
        firework: function (t, d) {
            var pan = d.pan || 0;
            var o = osc('sine', 800), g = ctx.createGain(); o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(2400, t + 0.7); o.connect(g); env(g, t, 0.05, 0.03, 0.65); o.start(t); o.stop(t + 0.75); out(g, pan);
            var tb = t + 0.75, n = noiseSrc(tb, 0.5), lp = filt('lowpass', 1800), g2 = ctx.createGain(); n.connect(lp); lp.connect(g2); env(g2, tb, 0.003, 0.5, 0.4); out(g2, pan);
            for (var i = 0; i < 10; i++) { var tc = tb + 0.25 + Math.random() * 0.8, n2 = noiseSrc(tc, 0.03), hp = filt('highpass', 3000), g3 = ctx.createGain(); n2.connect(hp); hp.connect(g3); env(g3, tc, 0.001, 0.07, 0.02); out(g3, pan + (Math.random() - 0.5) * 0.4); }
        }
    };

    // ---------------------------------------------------------------- الأجواء
    function loopNoise(type, f, q, gain) {
        var s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
        var fl = filt(type, f, q), g = ctx.createGain(); g.gain.value = gain;
        s.connect(fl); fl.connect(g); s.start(); return { src: s, out: g };
    }
    function buildAmb(mode) {
        var bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(master);
        var nodes = [];
        function add(n) { n.out.connect(bus); nodes.push(n.src); }
        if (mode === 'room') {
            [60, 120, 180].forEach(function (f, i) { var o = osc('sine', f), g = ctx.createGain(); g.gain.value = [0.05, 0.025, 0.012][i]; o.connect(g); g.connect(bus); o.start(); nodes.push(o); });
            add(loopNoise('lowpass', 300, 0.5, 0.05));
        } else {
            // ريح خفيفة متموّجة
            var wind = loopNoise('lowpass', mode === 'plaza-day' ? 700 : 420, 0.7, mode === 'plaza-day' ? 0.05 : 0.08);
            var lfo = osc('sine', 0.13), lg = ctx.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(wind.out.gain); lfo.start(); nodes.push(lfo);
            add(wind);
            if (mode === 'plaza-night') add(loopNoise('bandpass', 2600, 0.6, 0.012));   // طقطقة النار (خلفية)
        }
        return { bus: bus, nodes: nodes, mode: mode };
    }
    // أحداث متقطعة: صراصير الليل، طقطقة النار، عصافير النهار
    function sprinkle() {
        if (!ctx || muted || ctx.state !== 'running') return;
        var t = now() + 0.05;
        if (ambMode === 'plaza-night' || ambMode === 'market') {
            for (var i = 0; i < 3; i++) { var tt = t + i * 0.07, o = osc('sine', 4300 + Math.random() * 300), g = ctx.createGain(); o.connect(g); env(g, tt, 0.004, 0.018, 0.04); o.start(tt); o.stop(tt + 0.06); out(g, ambMode === 'market' ? -0.5 : 0.4); }
        }
        if ((ambMode === 'plaza-night' || ambMode === 'market') && Math.random() < 0.025) FX.owl(t);
        if (ambMode === 'plaza-night') {
            for (var j = 0; j < 2 + Math.random() * 3; j++) { var tc = t + Math.random() * 0.5, n = noiseSrc(tc, 0.03), hp = filt('highpass', 1500), g2 = ctx.createGain(); n.connect(hp); hp.connect(g2); env(g2, tc, 0.001, 0.08 + Math.random() * 0.08, 0.02); out(g2); }
        }
        if (ambMode === 'plaza-day' && Math.random() < 0.35) {
            var tb = t + Math.random() * 0.3, ob = osc('sine', 2400), gb = ctx.createGain(); ob.frequency.setValueAtTime(2200, tb); ob.frequency.exponentialRampToValueAtTime(3400, tb + 0.08); ob.frequency.exponentialRampToValueAtTime(2600, tb + 0.16);
            ob.connect(gb); env(gb, tb, 0.01, 0.03, 0.15); ob.start(tb); ob.stop(tb + 0.2); out(gb, 0.6);
        }
    }

    window.MafiaSFX = {
        unlock: function () { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); if (!timers.length) timers.push(setInterval(sprinkle, 650)); if (ambMode) { var m = ambMode; ambMode = null; this.ambience(m); } },
        needsUnlock: function () { return !ctx || ctx.state !== 'running'; },
        muted: function () { return muted; },
        setMuted: function (v) { muted = !!v; if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, now(), 0.05); },
        ambience: function (mode) {
            if (mode === ambMode) return;
            ambMode = mode;
            if (!ctx || ctx.state !== 'running') return;
            var t = now();
            Object.keys(amb).forEach(function (k) {
                var a = amb[k]; a.bus.gain.cancelScheduledValues(t); a.bus.gain.setTargetAtTime(0.0001, t, 0.4);
                setTimeout(function () { a.nodes.forEach(function (n) { try { n.stop(); } catch (e) { } }); a.bus.disconnect(); }, 2500);
                delete amb[k];
            });
            if (!mode) return;
            var a2 = amb[mode] = buildAmb(mode);
            a2.bus.gain.setTargetAtTime(1, t, 0.6);
        },
        cue: function (k, d) {
            if (!ctx || muted || ctx.state !== 'running' || !FX[k]) return;
            try { FX[k](now() + 0.01, d || {}); } catch (e) { }
        }
    };
    // أول ضغطة بالصفحة تفتح الصوت (سياسة المتصفحات)
    ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function () { window.MafiaSFX.unlock(); }, { capture: true }); });
})();
