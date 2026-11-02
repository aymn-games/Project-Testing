/**
 * «حجرة ورقة مقص» — المؤثرات الصوتية (Web Audio، كل الأصوات مولّدة بالكود بدون ملفات، نفس فكرة
 * games/mafia/mafia-sfx.js).
 *
 * RpsSFX.play(name, opts):
 *   join (لاعب دخل) · tick (آخر ثواني الوقت) · picked (لاعب اختار) · round (بداية دور)
 *   · walk (مواجهة جديدة) · beat {i: 0..2} (ضربات «حجرة.. ورقة.. مقص!») · reveal (الكشف)
 *   · point (كسب محاولة) · tie (تعادل) · boing (نابض الإقصاء) · fall (صفير السقوط) · splat (الفرشة)
 *   · poof (اختفاء) · doom (تمهيد الإقصاء 3ث) · count (عدّ 3-2-1) · win (فاز بالمواجهة) · champion (البطل)
 * المتصفح ما يسمح بالصوت قبل أول ضغطة بالصفحة: unlock() تنربط بأول ضغطة/زر تلقائياً،
 * وneedsUnlock() تقول للصفحة تعرض زر «تفعيل الصوت».
 */
(function () {
    'use strict';
    var ctx = null, master = null, noise = null, VOL = 0.75;

    function init() {
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        master = ctx.createGain(); master.gain.value = VOL;
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; // ما يشوّه صوت البث
        master.connect(comp); comp.connect(ctx.destination);
        var len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noise = buf;
        return ctx;
    }
    function T0() { return ctx.currentTime + 0.01; }
    function gain(t, a, peak, d) { var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); g.connect(master); return g; }
    function tone(type, f0, f1, t, a, peak, d) {
        var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
        o.connect(gain(t, a, peak, d)); o.start(t); o.stop(t + a + d + .05); return o;
    }
    function hiss(type, f, q, t, a, peak, d, f1) {
        var s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
        var b = ctx.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, t); if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + a + d); b.Q.value = q || 1;
        s.connect(b); b.connect(gain(t, a, peak, d)); s.start(t, Math.random() * .5); s.stop(t + a + d + .05);
    }
    function notes(list, t, type, len, peak) { list.forEach(function (f, i) { tone(type || 'triangle', f, f, t + i * len, .01, peak || .22, len * 1.6); }); }

    var FX = {
        join: function (t) { tone('sine', 520, 880, t, .01, .2, .12); tone('sine', 1040, 1040, t + .06, .01, .08, .1); },
        picked: function (t) { tone('sine', 900, 1200, t, .005, .12, .07); },
        tick: function (t) { tone('square', 1500, 1500, t, .002, .05, .03); hiss('highpass', 4000, .7, t, .002, .05, .03); },
        round: function (t) { notes([392, 523, 659], t, 'triangle', .09, .2); hiss('bandpass', 900, .6, t, .2, .05, .6); },
        walk: function (t) { tone('sine', 220, 330, t, .02, .12, .25); },
        beat: function (t, o) {
            var i = (o && o.i) || 0, last = i === 2;
            // طبل منخفض + نقرة، والأخيرة أقوى
            tone('sine', last ? 160 : 130, 55, t, .005, last ? .9 : .65, last ? .35 : .22);
            hiss('lowpass', 1800, .8, t, .002, last ? .35 : .22, .09);
            if (last) hiss('bandpass', 3000, 1.2, t, .002, .18, .18);
        },
        reveal: function (t) { hiss('bandpass', 600, .9, t, .02, .28, .28, 3200); notes([784, 1175], t + .12, 'sine', .06, .12); },
        point: function (t) { notes([659, 988], t, 'triangle', .1, .22); },
        tie: function (t) { tone('triangle', 330, 330, t, .01, .2, .16); tone('triangle', 330, 300, t + .2, .01, .2, .22); },
        boing: function (t) {
            // نابض: تذبذب ينزل ويطلع ثم صفير طيران لفوق
            var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(180, t);
            var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 18; lg.gain.setValueAtTime(90, t); lg.gain.exponentialRampToValueAtTime(4, t + .6);
            lfo.connect(lg); lg.connect(o.frequency); o.frequency.exponentialRampToValueAtTime(420, t + .6);
            o.connect(gain(t, .01, .5, .6)); o.start(t); o.stop(t + .7); lfo.start(t); lfo.stop(t + .7);
            tone('sine', 500, 2400, t + .15, .05, .12, 1.0);
            hiss('bandpass', 700, .8, t + .15, .1, .14, .9, 2600);
        },
        fall: function (t) { tone('sine', 2200, 500, t, .02, .14, .5); },
        splat: function (t) {
            tone('sine', 120, 45, t, .003, .9, .3);
            hiss('lowpass', 900, .7, t, .003, .55, .25, 200);
            hiss('bandpass', 2400, 2, t + .02, .003, .12, .12);
        },
        poof: function (t) { hiss('highpass', 1800, .7, t, .01, .18, .3); tone('sine', 1600, 2600, t, .01, .06, .2); },
        // تمهيد الإقصاء (3ث): طبول تتسارع ونغمة طالعة، وصوت خفيف «بوم» بالنهاية
        doom: function (t) {
            var k = 0, at = 0;
            while (at < 2.85) { var gap = .26 - .2 * (at / 2.85); hiss('bandpass', 260 + at * 90, 1.4, t + at, .003, .1 + .25 * (at / 2.85), .07); tone('sine', 95, 70, t + at, .003, .1 + .3 * (at / 2.85), .08); at += gap; k++; }
            tone('sawtooth', 110, 330, t, .4, .035, 2.6); tone('sine', 220, 660, t, .4, .06, 2.6);
        },
        count: function (t) { tone('square', 880, 880, t, .003, .07, .09); tone('sine', 1760, 1760, t, .003, .05, .12); },
        win: function (t) { notes([523, 659, 784, 1047], t, 'triangle', .08, .2); },
        champion: function (t) {
            notes([523, 659, 784], t, 'triangle', .12, .22);
            [523, 659, 784, 1047].forEach(function (f) { tone('sawtooth', f, f, t + .42, .03, .05, 1.4); tone('triangle', f, f, t + .42, .03, .12, 1.4); });
            for (var k = 0; k < 6; k++) tone('sine', 1800 + Math.random() * 1200, 2600, t + .5 + k * .12, .005, .05, .15);
            hiss('bandpass', 1100, .5, t + .4, .4, .12, 1.8); // تصفيق/هتاف خفيف
        },
    };

    function play(name, opts) {
        if (!init() || ctx.state !== 'running') return;
        var f = FX[name]; if (!f) return;
        try { f(T0(), opts || {}); } catch (e) { /* صوت فاشل ما يوقف اللعبة */ }
    }
    function unlock() { if (!init()) return; if (ctx.state !== 'running') ctx.resume(); }
    function needsUnlock() { return !init() || ctx.state !== 'running'; }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, unlock, { passive: true }); });

    window.RpsSFX = { play: play, unlock: unlock, needsUnlock: needsUnlock, onState: function (cb) { if (init()) ctx.onstatechange = function () { cb(ctx.state); }; } };
}());
