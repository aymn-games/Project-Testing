/**
 * «خارج التغطية» — مؤثرات شاشة البث (Web Audio، كلها مولّدة بالكود بدون ملفات، نفس أسلوب mafia-sfx.js).
 *
 * OCSfx.cue(k)   join · start · deal · batch · sent · timeup · vote · cast · drum · reveal
 *                · caught · innocent · guessOk · guessFail · win · tick
 * OCSfx.volume(v?) · OCSfx.toggleMute() · OCSfx.needsUnlock()
 * أصوات قصيرة وهادية؛ وكل حدث مهم واضح بالصورة كمان، فاللعبة ما تعتمد على الصوت.
 */
(function () {
    'use strict';
    var ctx = null, master = null, noise = null, muted = false, VOL = 0.7;
    try { var sv = parseFloat(localStorage.getItem('oc-vol')); if (sv >= 0 && sv <= 1) VOL = sv; muted = localStorage.getItem('oc-mute') === '1'; } catch (e) { }

    function init() {
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : VOL;
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
        var len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noise = buf;
        return ctx;
    }
    function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function tone(type, f, t, a, peak, d, f2) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
        o.connect(g); g.connect(master); env(g, t, a, peak, d); o.start(t); o.stop(t + a + d + 0.05);
    }
    function hiss(t, dur, f, peak, type) {
        var s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noise; s.loop = true; b.type = type || 'bandpass'; b.frequency.value = f; b.Q.value = 0.8;
        s.connect(b); b.connect(g); g.connect(master); env(g, t, 0.01, peak, dur); s.start(t); s.stop(t + dur + 0.05);
    }
    function notes(list, type, t0, step, peak, d) { list.forEach(function (f, i) { tone(type, f, t0 + i * step, 0.01, peak, d); }); }

    var FX = {
        join: function (t) { notes([660, 990], 'sine', t, 0.07, 0.18, 0.18); },
        start: function (t) { notes([392, 523, 659, 784], 'triangle', t, 0.11, 0.22, 0.35); hiss(t, 0.5, 3000, 0.05, 'highpass'); },
        deal: function (t) { for (var i = 0; i < 4; i++) hiss(t + i * 0.09, 0.07, 2600, 0.12); },
        batch: function (t) { notes([523, 784], 'sine', t, 0.09, 0.2, 0.25); },
        sent: function (t) { tone('sine', 880, t, 0.005, 0.16, 0.12, 1320); },
        timeup: function (t) { tone('square', 330, t, 0.005, 0.07, 0.18); tone('square', 247, t + 0.2, 0.005, 0.07, 0.28); },
        vote: function (t) { tone('sawtooth', 110, t, 0.2, 0.08, 0.9); notes([440, 415], 'triangle', t, 0.25, 0.14, 0.4); },
        cast: function (t) { tone('triangle', 520, t, 0.004, 0.13, 0.08); },
        tick: function (t) { tone('sine', 1400, t, 0.002, 0.06, 0.04); },
        drum: function (t) { for (var i = 0; i < 14; i++) { var tt = t + i * (0.17 - i * 0.006); tone('sine', 90, tt, 0.004, 0.22 + i * 0.015, 0.1, 50); hiss(tt, 0.05, 900, 0.05); } },
        reveal: function (t) { tone('sawtooth', 220, t, 0.01, 0.12, 0.6, 110); hiss(t, 0.7, 500, 0.12, 'lowpass'); },
        caught: function (t) { notes([392, 494, 587, 784], 'square', t, 0.08, 0.09, 0.3); },
        innocent: function (t) { notes([392, 370, 349, 262], 'triangle', t, 0.16, 0.16, 0.4); },
        guessOk: function (t) { notes([523, 659, 784, 1047, 1319], 'triangle', t, 0.08, 0.18, 0.4); },
        guessFail: function (t) { tone('sawtooth', 200, t, 0.01, 0.12, 0.5, 90); },
        win: function (t) { notes([523, 659, 784, 659, 784, 1047], 'triangle', t, 0.12, 0.2, 0.35); for (var i = 0; i < 6; i++) hiss(t + 0.2 + i * 0.13, 0.12, 4000 + i * 300, 0.04, 'highpass'); }
    };

    function cue(k) {
        if (muted || !FX[k]) return;
        if (!init() || ctx.state !== 'running') { if (ctx) ctx.resume().catch(function () { }); if (!ctx || ctx.state !== 'running') return; }
        try { FX[k](ctx.currentTime + 0.01); } catch (e) { }
    }
    function unlock() { if (init() && ctx.state !== 'running') ctx.resume().catch(function () { }); }
    ['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, unlock, { passive: true }); });

    function apply() { if (master) master.gain.value = muted ? 0 : VOL; try { localStorage.setItem('oc-vol', String(VOL)); localStorage.setItem('oc-mute', muted ? '1' : '0'); } catch (e) { } }
    window.OCSfx = {
        cue: cue, unlock: unlock,
        volume: function (v) { if (arguments.length) { VOL = Math.max(0, Math.min(1, v)); muted = false; apply(); } return VOL; },
        muted: function () { return muted; },
        toggleMute: function () { muted = !muted; apply(); return muted; },
        needsUnlock: function () { return !ctx || ctx.state !== 'running'; }
    };
})();
