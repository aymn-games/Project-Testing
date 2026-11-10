/**
 * كود نيمز — مكتبة الأصوات (Web Audio، بدون ملفات صوت).
 *
 * كل صوت يتركّب من مذبذبات وضوضاء مفلترة، فيشتغل بأي متصفح بدون تحميل.
 * CN_SFX.play(name, opts) يشغّل الصوت حالاً. نفس الدوال تقبل أي AudioContext
 * ووقت بداية، فتقدر ترسمها بـ OfflineAudioContext (مثلاً لتسجيل فيديو).
 *
 *   shake     اهتزاز الصندوق قبل ما ينفتح (طقطقة خشب تتسارع وتعلى)
 *   burst     انبثاق الصندوق (ضربة + هواء)
 *   correct   صندوق الفريق نفسه (نغمة صاعدة لامعة)
 *   opponent  صندوق الفريق الثاني (نغمتين نازلة + طنين)
 *   neutral   صندوق محايد (نغمة نازلة حزينة «واه واه»)
 *   assassin  الصندوق الأسود (ضربة عميقة + هدير + كورد مظلم)
 *   hint      وصول التلميح (جرس سحري)
 *   tick      آخر 10 ثواني (تك/توك، وآخر 3 أعلى) — opts: {left}
 *   timeup    انتهى الوقت (بزر)
 *   turn      بداية دور جديد (سووش قصير)
 */
(function () {
  'use strict';

  var MASTER = 0.55; // مستوى الصوت العام
  var live = null, noiseBuf = null;

  function ctxLive() {
    if (!live) { try { live = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (live.state === 'suspended' && live.resume) live.resume();
    return live;
  }
  function noise(ac) {
    if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
    var b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b; return b;
  }
  // نغمة: f تردد (أو [من، إلى] لانزلاق)، d مدة، type شكل الموجة، v حجم، a هجوم
  function tone(ac, out, t, f, d, type, v, a) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    if (Array.isArray(f)) { o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + d); }
    else o.frequency.setValueAtTime(f, t);
    a = a || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05);
  }
  // ضوضاء مفلترة: type فلتر، f تردده (أو [من، إلى])، q
  function hiss(ac, out, t, d, v, ftype, f, q, a) {
    var s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise(ac); fl.type = ftype || 'bandpass'; fl.Q.value = q || 1;
    if (Array.isArray(f)) { fl.frequency.setValueAtTime(f[0], t); fl.frequency.exponentialRampToValueAtTime(f[1], t + d); }
    else fl.frequency.setValueAtTime(f || 1000, t);
    a = a || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + d + 0.05);
  }

  var SOUNDS = {
    shake: function (ac, out, t, o) {
      var dur = (o && o.ms ? o.ms : 600) / 1000, n = 9;
      for (var i = 0; i < n; i++) {
        var k = i / (n - 1), at = t + dur * Math.pow(k, 0.85) * 0.92; // تتسارع
        hiss(ac, out, at, 0.05, 0.10 + k * 0.22, 'bandpass', 1800 + k * 1400, 6);
        tone(ac, out, at, 170 + k * 90 + (i % 2) * 25, 0.07, 'triangle', 0.10 + k * 0.16);
      }
      hiss(ac, out, t, dur, 0.06, 'bandpass', [400, 2400], 2, dur * 0.8); // توتر صاعد
    },
    burst: function (ac, out, t) {
      tone(ac, out, t, [140, 45], 0.28, 'sine', 0.55, 0.004);
      hiss(ac, out, t, 0.35, 0.35, 'highpass', [600, 6000], 0.7, 0.003);
      hiss(ac, out, t, 0.18, 0.25, 'bandpass', 2500, 1.5, 0.002);
    },
    correct: function (ac, out, t) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(ac, out, t + i * 0.075, f, 0.32, 'triangle', 0.2);
        tone(ac, out, t + i * 0.075, f * 2, 0.22, 'sine', 0.05);
      });
      [2093, 2637, 3136].forEach(function (f, i) { tone(ac, out, t + 0.32 + i * 0.05, f, 0.2, 'sine', 0.05); }); // بريق
    },
    opponent: function (ac, out, t) {
      tone(ac, out, t, 466.16, 0.22, 'square', 0.09); tone(ac, out, t, 466.16 * 1.006, 0.22, 'sawtooth', 0.05);
      tone(ac, out, t + 0.2, 349.23, 0.38, 'square', 0.09); tone(ac, out, t + 0.2, 349.23 * 1.006, 0.38, 'sawtooth', 0.05);
      tone(ac, out, t + 0.2, [110, 98], 0.4, 'sawtooth', 0.06);
    },
    neutral: function (ac, out, t) {
      // «واه واه وااه» نازلة ومهزوزة — يأس
      [[392, 370], [370, 349], [349, 262]].forEach(function (p, i) {
        var d = i < 2 ? 0.26 : 0.7, at = t + i * 0.3;
        var o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(), fl = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(p[0], at); o.frequency.exponentialRampToValueAtTime(p[1], at + d);
        lfo.frequency.value = i < 2 ? 0 : 6; lg.gain.value = 6; lfo.connect(lg).connect(o.frequency);
        fl.type = 'lowpass'; fl.frequency.setValueAtTime(1400, at); fl.frequency.exponentialRampToValueAtTime(500, at + d);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.14, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(fl).connect(g).connect(out); o.start(at); o.stop(at + d + 0.05); lfo.start(at); lfo.stop(at + d + 0.05);
      });
    },
    assassin: function (ac, out, t) {
      tone(ac, out, t, [90, 30], 1.4, 'sine', 0.7, 0.003);              // ضربة عميقة
      hiss(ac, out, t, 1.6, 0.25, 'lowpass', [900, 120], 0.8, 0.01);     // هدير
      [[110, 0.12], [130.81, 0.1], [155.56, 0.1], [116.54, 0.07]].forEach(function (x) { // كورد مظلم متنافر
        tone(ac, out, t + 0.15, x[0], 1.8, 'sawtooth', x[1], 0.08);
      });
      tone(ac, out, t + 0.9, [55, 41], 1.2, 'sine', 0.45, 0.01);        // نبضة ثانية
    },
    hint: function (ac, out, t) {
      [[880, 0], [1318.5, 0.11], [1760, 0.22]].forEach(function (x) {
        tone(ac, out, t + x[1], x[0], 0.9, 'sine', 0.16, 0.004);
        tone(ac, out, t + x[1], x[0] * 2.76, 0.35, 'sine', 0.035, 0.002); // رنين الجرس
      });
      hiss(ac, out, t, 0.6, 0.05, 'highpass', 7000, 0.5, 0.15);
    },
    tick: function (ac, out, t, o) {
      var left = o && o.left || 10, hot = left <= 3, tock = left % 2 === 0;
      tone(ac, out, t, hot ? 1568 : tock ? 1046.5 : 1318.5, hot ? 0.12 : 0.06, hot ? 'square' : 'triangle', hot ? 0.09 : 0.14);
      hiss(ac, out, t, 0.03, hot ? 0.12 : 0.18, 'bandpass', tock ? 2500 : 3500, 8);
    },
    timeup: function (ac, out, t) {
      tone(ac, out, t, 196, 0.7, 'square', 0.12); tone(ac, out, t, 196 * 1.01, 0.7, 'sawtooth', 0.09);
      tone(ac, out, t, 98, 0.7, 'square', 0.08);
    },
    turn: function (ac, out, t) {
      hiss(ac, out, t, 0.35, 0.16, 'bandpass', [500, 3000], 1.2, 0.12);
      tone(ac, out, t + 0.08, [440, 660], 0.22, 'sine', 0.08, 0.03);
    }
  };

  /** يرسم صوت على أي AudioContext عند وقت معيّن (للتشغيل الحي أو OfflineAudioContext). */
  function render(ac, name, t, opts) {
    var fn = SOUNDS[name]; if (!fn) return;
    var out = ac.createGain(); out.gain.value = MASTER; out.connect(ac.destination);
    fn(ac, out, t, opts || {});
  }
  /** تشغيل حي الآن. */
  function play(name, opts) {
    var ac = ctxLive(); if (!ac) return;
    try { render(ac, name, ac.currentTime + 0.01, opts); } catch (e) { /* تجاهل */ }
    if (window.CN_SFX.onPlay) { try { window.CN_SFX.onPlay(name, opts || {}); } catch (e) { /* تجاهل */ } }
  }

  window.CN_SFX = { play: play, render: render, names: Object.keys(SOUNDS) };
}());
