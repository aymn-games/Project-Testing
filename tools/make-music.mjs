// موسيقى حفلة عيد الميلاد — مؤلفة ومولّدة بالكود (بدون عينات خارجية):
// لحن «Happy Birthday» (ملكية عامة) بتوزيعات مختلفة لكل مرحلة، وآلات مركّبة (synth):
// بيانو كهربائي FM، باد، باص، بلَك، ليد، أجراس، نحاس، وطبول مصنوعة من الموجات والضجيج.
//
//   الحفلة الحين ما تستخدم أي ملف من هذي (كلها أغاني يرفعها صاحب المشروع، والخلفية bg.mp3)، فما يتولد شي إلا بالخيار:
//   lobby.mp3  — لو-فاي هادي (84 BPM)، يتكرر بدون قطع — بس مع --lobby
//   reveal.mp3 — فانفير الافتتاح (14ث) — بس مع --reveal
//   dance.mp3  — دانس بوب (124 BPM)، يتكرر بدون قطع — بس مع --dance
//   (موسيقى الكيكة ما عادت تتولد: التجمّع حول الكيكة cakesong.mp3 ورقص الكيكة cutsong.mp3 أغاني يرفعها صاحب المشروع)
//
// التشغيل: node tools/make-music.mjs  (يحتاج ffmpeg) ← games/birthday-party/music/*.mp3
// تسوية خفيفة (حضور أكثر للّحن حوالي 3kHz، وأقل حدّة فوق 10kHz)، ومستوى الصوت موحّد بـ loudnorm: الانتظار أهدى (-19 LUFS) والباقي (-15/-14) عشان ينسمع بالبث.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SR = 44100, TAU = Math.PI * 2;
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'games', 'birthday-party', 'music');
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------- مولّد ضجيج ثابت (نفس النتيجة كل مرة) ----------
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;

// ---------- جداول موجات محدودة التردد (بدون تشويش aliasing) ----------
const TBL = 2048;
function table(harm) { const t = new Float32Array(TBL + 1); for (let i = 0; i <= TBL; i++) { let v = 0; for (const [h, a] of harm) v += a * Math.sin(TAU * h * i / TBL); t[i] = v; } return t; }
const tables = {};
function bandTable(kind, f) {
  const n = Math.max(1, Math.min(64, Math.floor(15000 / f))), key = kind + n;
  if (!tables[key]) {
    const hs = [];
    for (let h = 1; h <= n; h++) {
      if (kind === 'saw') hs.push([h, 1 / h]);
      else if (kind === 'sq' && h % 2) hs.push([h, 1 / h]);
      else if (kind === 'tri' && h % 2) hs.push([h, (((h - 1) / 2) % 2 ? -1 : 1) / (h * h)]);
    }
    tables[key] = table(hs);
  }
  return tables[key];
}
const SINE = table([[1, 1]]);
const look = (t, ph) => { const x = ph * TBL, i = x | 0, f = x - i; return t[i] + (t[i + 1] - t[i]) * f; };

// ---------- المكسر: باصات (جاف + ريفيرب + باد يتنفّس مع الكيك) ----------
function makeMix(sec) {
  const n = Math.ceil(sec * SR);
  const bus = () => ({ L: new Float32Array(n), R: new Float32Array(n) });
  return { n, sec, dry: bus(), duck: bus(), verb: bus(), kicks: [] };
}
// يكتب صوت مولّد (gen(t) لكل عيّنة) بالوقت start، مع pan وإرسال للريفيرب
function put(mix, start, len, gen, { gain = 1, pan = 0, verb = .15, bus = 'dry' } = {}) {
  const s0 = Math.round(start * SR), n = Math.min(Math.round(len * SR), mix.n - s0);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const B = mix[bus];
  for (let i = 0; i < n; i++) {
    const v = gen(i / SR); if (!v) continue;
    const k = s0 + i; if (k < 0) continue;
    B.L[k] += v * gl; B.R[k] += v * gr;
    if (verb) { mix.verb.L[k] += v * gl * verb; mix.verb.R[k] += v * gr * verb; }
  }
}
const adsr = (t, dur, a, d, s, r) => t < a ? t / a : t < a + d ? 1 - (1 - s) * (t - a) / d : t < dur ? s : Math.max(0, s * (1 - (t - dur) / r));

// ---------- الآلات ----------
// بيانو كهربائي (FM): ضربة لامعة تهدى بسرعة
function epiano(mix, t, m, dur, vel = .5, o = {}) {
  const f = mtof(m), len = dur + .6;
  put(mix, t, len, x => {
    const env = Math.exp(-x * 1.4) * (x < .004 ? x / .004 : 1) * (x > dur ? Math.max(0, 1 - (x - dur) / .5) : 1);
    const I = 1.6 * Math.exp(-x * 4) + .25;
    return (Math.sin(TAU * f * x + I * Math.sin(TAU * f * x)) + .06 * Math.sin(TAU * f * 14 * x) * Math.exp(-x * 30)) * env * vel;
  }, { verb: .25, ...o });
}
// أجراس (FM نسبة 3.5)
function bell(mix, t, m, vel = .3, o = {}) {
  const f = mtof(m);
  put(mix, t, 2.5, x => Math.sin(TAU * f * x + 2.4 * Math.exp(-x * 3) * Math.sin(TAU * f * 3.5 * x)) * Math.exp(-x * 2.2) * Math.min(1, x / .002) * vel, { verb: .4, ...o });
}
// مذبذب بفلتر: kind موجة، cut(x) تردد القطع، env(x) الشكل
function synth(mix, t, m, len, kind, env, cut, vel, o = {}, detune = 0, vib = 0) {
  const f = mtof(m) * Math.pow(2, detune / 1200), tb = bandTable(kind, f);
  let ph = rnd(), y1 = 0, y2 = 0;
  put(mix, t, len, x => {
    const fv = f * (1 + (vib && x > .25 ? vib * Math.sin(TAU * 5.2 * x) : 0));
    ph += fv / SR; ph -= ph | 0;
    const a = 1 - Math.exp(-TAU * Math.min(18000, cut(x)) / SR);
    y1 += a * (look(tb, ph) - y1); y2 += a * (y1 - y2);
    return y2 * env(x) * vel;
  }, o);
}
// باد: 5 طبقات مفوّتة شوي (supersaw) بهجوم ناعم
function pad(mix, t, notes, dur, vel = .1, o = {}) {
  for (const m of notes) for (const d of [-14, -6, 0, 7, 15]) synth(mix, t, m, dur + 1, 'saw', x => adsr(x, dur, .35, .4, .8, .9), () => 2600, vel, { verb: .35, pan: d / 30, bus: 'duck', ...o }, d);
}
const pluck = (mix, t, m, vel = .14, o = {}) => synth(mix, t, m, .5, 'saw', x => Math.exp(-x * 7), x => 400 + 5200 * Math.exp(-x * 14), vel, { verb: .22, ...o });
const bass = (mix, t, m, dur, vel = .32, o = {}) => {
  synth(mix, t, m, dur + .08, 'saw', x => adsr(x, dur, .004, .1, .7, .06), x => 180 + 1100 * Math.exp(-x * 12), vel, { verb: 0, ...o });
  put(mix, t, dur + .08, x => Math.sin(TAU * mtof(m) * x) * adsr(x, dur, .004, .1, .8, .06) * vel * .7, { verb: 0, ...o });
};
const lead = (mix, t, m, dur, vel = .16, o = {}) => {
  synth(mix, t, m, dur + .3, 'sq', x => adsr(x, dur, .01, .15, .7, .25), x => 1800 + 2600 * Math.exp(-x * 5), vel, { verb: .3, pan: -.1, ...o }, 0, .006);
  synth(mix, t, m, dur + .3, 'saw', x => adsr(x, dur, .01, .15, .7, .25), () => 3000, vel * .55, { verb: .3, pan: .15, ...o }, 9, .006);
};
const brass = (mix, t, m, dur, vel = .14, o = {}) => {
  for (const d of [-8, 0, 8]) synth(mix, t, m, dur + .4, 'saw', x => adsr(x, dur, .06, .2, .8, .35), x => 500 + 3800 * Math.min(1, x / .12) * (.6 + .4 * Math.exp(-x * 2)), vel, { verb: .35, pan: d / 20, ...o }, d, .004);
};
// الطبول
function kick(mix, t, vel = .9) {
  mix.kicks.push(t);
  put(mix, t, .5, x => { const f = 45 + 110 * Math.exp(-x * 28); return Math.sin(TAU * (45 * x + 110 * (1 - Math.exp(-x * 28)) / 28)) * Math.exp(-x * 7) * vel + (x < .003 ? noise() * .3 : 0); }, { verb: 0 });
}
function snare(mix, t, vel = .5, o = {}) {
  let y = 0, p = 0;
  put(mix, t, .3, x => { const n = noise(); y = n - p * .6; p = n; return (y * Math.exp(-x * 16) * .7 + Math.sin(TAU * 190 * x) * Math.exp(-x * 25) * .5) * vel; }, { verb: .25, ...o });
}
function clap(mix, t, vel = .45) {
  let p = 0;
  put(mix, t, .35, x => { const n = noise(), hp = n - p; p = n; const e = (x < .03 ? (Math.exp(-(x % .01) * 300)) : Math.exp(-(x - .03) * 14)); return hp * e * vel; }, { verb: .3, pan: .05 });
}
function hat(mix, t, vel = .14, open = false, pan = .2) {
  let p = 0, q = 0;
  put(mix, t, open ? .35 : .07, x => { const n = noise(), h1 = n - p; p = n; const h2 = h1 - q; q = h1; return h2 * Math.exp(-x * (open ? 9 : 55)) * vel; }, { verb: .08, pan });
}
function crash(mix, t, vel = .2) {
  let p = 0;
  put(mix, t, 3, x => { const n = noise(), h = n - p * .3; p = n; return h * Math.exp(-x * 1.4) * vel; }, { verb: .3, pan: -.15 });
}
function riser(mix, t, len, vel = .15) {
  let y = 0;
  put(mix, t, len, x => { const k = x / len, a = .02 + .5 * k * k; y += a * (noise() - y); return y * k * k * vel; }, { verb: .4 });
}
function timpani(mix, t, m, vel = .5) { const f = mtof(m); put(mix, t, 1.6, x => (Math.sin(TAU * f * x) + .4 * Math.sin(TAU * f * 1.5 * x)) * Math.exp(-x * 2.5) * vel + noise() * Math.exp(-x * 40) * vel * .2, { verb: .4 }); }

// ---------- الريفيرب (Freeverb مبسّط) + التنفّس + الماستر ----------
function reverb(inp, room = .82, damp = .3) {
  const out = new Float32Array(inp.length), combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const cb = combs.map(n => ({ b: new Float32Array(n), i: 0, f: 0 })), ab = aps.map(n => ({ b: new Float32Array(n), i: 0 }));
  for (let k = 0; k < inp.length; k++) {
    const x = inp[k] * .015; let s = 0;
    for (const c of cb) { const y = c.b[c.i]; c.f = y * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * room; c.i = (c.i + 1) % c.b.length; s += y; }
    for (const a of ab) { const y = a.b[a.i]; a.b[a.i] = s + y * .5; a.i = (a.i + 1) % a.b.length; s = y - s; }
    out[k] = s;
  }
  return out;
}
function master(mix, { loopLen = 0 } = {}) {
  const n = mix.n, L = new Float32Array(n), R = new Float32Array(n);
  // التنفّس (sidechain): الباد ينخفض لحظة كل كيك
  const duckEnv = new Float32Array(n).fill(1);
  for (const t of mix.kicks) { const s0 = Math.round(t * SR); for (let i = 0; i < SR * .3 && s0 + i < n; i++) duckEnv[s0 + i] = Math.min(duckEnv[s0 + i], .35 + .65 * Math.min(1, i / (SR * .25))); }
  const vL = reverb(mix.verb.L), vR = reverb(mix.verb.R, .83, .32);
  for (let k = 0; k < n; k++) { L[k] = mix.dry.L[k] + mix.duck.L[k] * duckEnv[k] + vL[k]; R[k] = mix.dry.R[k] + mix.duck.R[k] * duckEnv[k] + vR[k]; }
  // التكرار بدون قطع: ذيل آخر الملف يركب على أوله
  let len = n;
  if (loopLen) { len = Math.round(loopLen * SR); for (let k = len; k < n; k++) { L[k - len] += L[k]; R[k - len] += R[k]; } }
  const outL = L.subarray(0, len), outR = R.subarray(0, len);
  let peak = 0; for (let k = 0; k < len; k++) peak = Math.max(peak, Math.abs(outL[k]), Math.abs(outR[k]));
  const g = .9 / (peak || 1);
  // ضغط ناعم (tanh) عشان القمم ما تقص
  const pcm = Buffer.alloc(len * 4);
  for (let k = 0; k < len; k++) { pcm.writeInt16LE(Math.round(Math.tanh(outL[k] * g * 1.2) * 32000), k * 4); pcm.writeInt16LE(Math.round(Math.tanh(outR[k] * g * 1.2) * 32000), k * 4 + 2); }
  return pcm;
}
function writeMp3(name, pcm, lufs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-music-')), raw = path.join(tmp, name + '.raw');
  fs.writeFileSync(raw, pcm);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(SR), '-ac', '2', '-i', raw,
    '-af', `equalizer=f=3200:t=q:w=1.1:g=4,equalizer=f=11000:t=q:w=1:g=-2.5,acompressor=threshold=-14dB:ratio=2.5:attack=8:release=120:makeup=1,loudnorm=I=${lufs}:TP=-1.5:LRA=9`, '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', '128k', path.join(OUT, name + '.mp3')]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- اللحن والهارموني ----------
// «Happy Birthday» بإيقاع 4/4: [نغمة MIDI (بالنسبة لـ C)، بداية بالـ beats، مدة] — 8 بارات، والبداية (GG) بآخر بار قبلها
const HB44 = [[7, -1, .5], [7, -.5, .5],
  [9, 0, 1], [7, 1, 1], [12, 2, 2], [11, 4, 3], [7, 7, .5], [7, 7.5, .5],
  [9, 8, 1], [7, 9, 1], [14, 10, 2], [12, 12, 3], [7, 15, .5], [7, 15.5, .5],
  [19, 16, 1], [16, 17, 1], [12, 18, 1], [11, 19, 1], [9, 20, 3], [17, 23, .5], [17, 23.5, .5],
  [16, 24, 1], [12, 25, 1], [14, 26, 2], [12, 28, 4]];
// الكوردات لكل بار (الثامن نصه C ونصه G)
const C = [60, 64, 67], G = [59, 62, 67], G7 = [59, 62, 65, 67], C7 = [60, 64, 67, 70], F = [60, 65, 69], AM = [57, 60, 64];
const HB_CH = [C, G7, G7, C, C7, F, C, C], HB_ROOT = [36, 31, 31, 36, 36, 41, 36, 36];
// نسخة الفالس 3/4: [نغمة، بداية، مدة] — 8 بارات × 3 beats
const HB34 = [[7, -1, .75], [7, -.25, .25],
  [9, 0, 1], [7, 1, 1], [12, 2, 1], [11, 3, 2], [7, 5, .75], [7, 5.75, .25],
  [9, 6, 1], [7, 7, 1], [14, 8, 1], [12, 9, 2], [7, 11, .75], [7, 11.75, .25],
  [19, 12, 1], [16, 13, 1], [12, 14, 1], [11, 15, 1], [9, 16, 1], [17, 17, .75], [17, 17.75, .25],
  [16, 18, 1], [12, 19, 1], [14, 20, 1], [12, 21, 3]];

// ================= dance.mp3 — 124 BPM، 72 بار =================
function dance() {
  const bpm = 124, b = 60 / bpm, bar = 4 * b, BARS = 72, mix = makeMix(BARS * bar + 5);
  const T = (br, bt = 0) => br * bar + bt * b;
  const VERSE = [[C, 36], [AM, 33], [F, 41], [G, 31]];
  const sect = br => br < 8 ? 'intro' : br < 24 ? 'verse' : br < 40 ? 'hook' : br < 48 ? 'break' : br < 64 ? 'drop' : 'outro';
  for (let br = 0; br < BARS; br++) {
    const s = sect(br), hb = s === 'hook' || s === 'drop' || s === 'break', i8 = (br - (s === 'hook' ? 24 : s === 'drop' ? 48 : 40)) % 8;
    const [ch, root] = hb ? [HB_CH[i8], HB_ROOT[i8]] : VERSE[br % 4];
    // الطبول
    if (s !== 'break' && !(s === 'intro' && br < 4)) for (let q = 0; q < 4; q++) kick(mix, T(br, q), .95);
    if (s !== 'intro' && s !== 'break') { clap(mix, T(br, 1)); clap(mix, T(br, 3)); }
    if (s !== 'break') for (let e = 0; e < 8; e++) hat(mix, T(br, e * .5), e % 2 ? .15 : .06, e % 2 === 1 && (s === 'drop' || s === 'hook') && e === 7, e % 2 ? .25 : -.2);
    if (s === 'drop' || s === 'hook') for (let e = 0; e < 16; e++) if (e % 4 === 3) hat(mix, T(br, e * .25), .05, false, .4);
    // الباص: بالضربات النص (house)
    if (s !== 'break') for (let e = 0; e < 4; e++) bass(mix, T(br, e + .5), root + (e === 3 && br % 2 ? 12 : 0) + 12, b * .42, s === 'intro' ? .2 : .3);
    // الباد
    if (hb && i8 === 7) { pad(mix, T(br), C, bar * .5, .055); pad(mix, T(br, 2), G, bar * .5, .055); }
    else pad(mix, T(br), ch, bar, s === 'break' ? .075 : .055);
    // أربيجيو بلَك بالـ 16
    if (s === 'verse' || s === 'drop' || s === 'outro') {
      const notes = [...ch, ch[0] + 12];
      for (let e = 0; e < 16; e++) pluck(mix, T(br, e * .25), notes[[0, 1, 2, 3, 2, 1, 0, 2][e % 8]] + 12, e % 4 === 0 ? .13 : .09, { pan: (e % 2 ? .3 : -.3) });
    }
    if (s === 'break' && br >= 46) { if (br === 46) riser(mix, T(br), 2 * bar, .25); for (let q = 0; q < (br === 47 ? 8 : 4); q++) snare(mix, T(br, q * (br === 47 ? .5 : 1)), .25 + q * .04); }
  }
  // اللحن: الهوك والدروب بالليد، والبريك بالأجراس
  const melody = (startBar, inst) => { for (const [n, st, d] of HB44) inst(T(startBar, st), 60 + 12 + n, d * b); };
  for (const sb of [24, 32]) melody(sb, (t, m, d) => { lead(mix, t, m, d * .95, .15); bell(mix, t, m + 12, .07); });
  melody(40, (t, m, d) => bell(mix, t, m, .22));
  for (const sb of [48, 56]) melody(sb, (t, m, d) => { lead(mix, t, m, d * .95, .17); lead(mix, t, m - 12, d * .95, .07); });
  for (const br of [8, 24, 48, 64]) crash(mix, T(br), .22);
  return master(mix, { loopLen: BARS * bar });
}

// ================= lobby.mp3 — لو-فاي 84 BPM، 32 بار =================
function lobby() {
  const bpm = 84, b = 60 / bpm, bar = 4 * b, BARS = 32, mix = makeMix(BARS * bar + 5);
  const sw = x => x + (Math.floor(x * 2) % 2 ? .08 : 0); // swing للنص
  const T = (br, bt = 0) => br * bar + sw(bt) * b;
  const JAZZ = [[[60, 64, 67, 71], 36], [[57, 60, 64, 67], 33], [[57, 60, 62, 65], 38], [[55, 59, 62, 65], 31]];
  for (let br = 0; br < BARS; br++) {
    const hb = (br >> 3) % 2 === 1, i8 = br % 8;
    const [ch, root] = hb ? [HB_CH[i8].map(m => m - 12 + 12), HB_ROOT[i8]] : JAZZ[br % 4];
    kick(mix, T(br, 0), .55); kick(mix, T(br, 2.5), .45);
    snare(mix, T(br, 1), .22, { verb: .3 }); snare(mix, T(br, 3), .22, { verb: .3 });
    for (let e = 0; e < 8; e++) hat(mix, T(br, e * .5), e % 2 ? .07 : .045, false, .15);
    bass(mix, T(br, 0), root + 12, b * 1.6, .22); bass(mix, T(br, 2.5), root + (br % 2 ? 19 : 12), b * 1.2, .18);
    const voicing = hb ? ch : ch;
    for (const m of voicing) { epiano(mix, T(br, 0), m - (hb ? 0 : 0), b * 1.4, .1, { pan: -.15 }); epiano(mix, T(br, 1.5), m, b * .9, .07, { pan: .15 }); }
    if (!hb && br % 2) epiano(mix, T(br, 3.5), ch[ch.length - 1] + 12, b * .5, .06, { pan: .3 });
    pad(mix, T(br), ch.slice(0, 3), bar, .025);
  }
  for (const sb of [8, 24]) for (const [n, st, d] of HB44) { const t = sb * bar + st * b; epiano(mix, t, 72 + n, d * b, .2, { pan: .05 }); if (sb === 24) bell(mix, t, 84 + n, .06); }
  return master(mix, { loopLen: BARS * bar });
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // تنبيه: الملف الناتج يكتب فوق أي ملف بنفس الاسم بمجلد الموسيقى
  const jobs = [['reveal', reveal, -14], ['lobby', lobby, -19], ['dance', dance, -15]].filter(([n]) => process.argv.includes('--' + n));
  if (!jobs.length) console.log('ما فيه شي يتولد: اختر --lobby أو --dance أو --reveal');
  for (const [name, fn, lufs] of jobs) {
    const t0 = Date.now(); writeMp3(name, fn(), lufs);
    console.log(name + '.mp3', (fs.statSync(path.join(OUT, name + '.mp3')).size / 1024).toFixed(0) + 'KB', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}
main();
