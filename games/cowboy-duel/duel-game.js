// «بلدة الكاوبوي» — منطق اللعبة.
// الإعدادات (cd-settings.js): ما يظهر عند الجرس (أرقام/كلمات/مختلط)، الخدعة الحمراء، طريقة المبارزات
// (مبارزة بعد مبارزة / كل المبارزات في وقت واحد)، طول مشهد الدخول، الحد الأقصى، ومن يمكنه الانضمام.
// كل جولة: الباقين يتوزّعون أزواج (الفردي يتأهل) ← مشهد دخول ← تنبيهات + سحب المسدسات ← الجرس ← أسرع واحد بكل زوج يطلق
// ← الخاسرين يُقصون ← الجولة الجاية… لين يبقى بطل واحد.
// المشهد الثري دي (duel3d.js) عرض فقط: هنا القواعد والمؤقتات والشات والنقاط.
import { mountDuel } from './duel3d.js';

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const BOT_NAMES = ['أبو فهد', 'سعود', 'نورة', 'ريم', 'خالد', 'مشاري', 'جود', 'تركي', 'لمى', 'فيصل', 'هيا', 'بندر', 'العنود', 'ذيب', 'مها', 'راكان'];
const ANSWER_MS = 15000;          // ما أحد كتب = جرس جديد
const JAM_MS = 1200;              // إجابة غلط = المسدس يعلّق شوي

const G = { players: [], alive: [], phase: 'loading', active: null, ch: null, decoy: null, revealAt: 0, timers: [], round: 0, startedAt: 0, scene: null, bots: true, settings: CDSettings.load(), draft: null, finish: null, force: {} }; // force: لتسجيل فيديو العرض فقط (decoy: نعم/لا، fall: الأول يطيح بالخدعة)

// ---------- الصوت (WebAudio مولّد بالكود — بدون ملفات)
const SFX = (() => {
    let ac = null, echo = null, windG = null;
    function ctx() { if (ac) return ac; if (G.settings && G.settings.sound === false) return null; try { // إعداد «الأصوات» متوقف = بدون صوت
        // تسجيل فيديو العرض (tools/cowboy-duel-video): الأصوات تنكتب بـ OfflineAudioContext على نفس وقت اللعبة (performance.now المزيّف)
        const cap = window.__capAudio;
        if (cap) ac = new Proxy(cap.ctx, { get(o, k) { if (k === 'currentTime') return Math.max(0, (performance.now() - cap.t0) / 1000); const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
        else ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
        // صدى الوادي للطلقة
        const d = ac.createDelay(1); d.delayTime.value = .32; const fb = ac.createGain(); fb.gain.value = .38; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(ac.destination); echo = d; return ac; }
    function noise(sec) { const a = ctx(), b = a.createBuffer(1, a.sampleRate * sec, a.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; }
    return {
        unlock() { if (window.__capAudio) return; const a = ctx(); a && a.state === 'suspended' && a.resume(); },
        bang() { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(.7), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + .5); g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .55); n.connect(f); f.connect(g); g.connect(a.destination); g.connect(echo); n.start(t);
            const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + .25); og.gain.setValueAtTime(.9, t); og.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + .3); },
        bell() { const a = ctx(); if (!a) return; const t = a.currentTime; [[620, .35], [620 * 2.76, .16], [620 * 5.4, .08], [310, .2]].forEach(([fq, v]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = fq; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + 2.4); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 2.4); }); },
        tick() { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 1800; g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .04); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .05); },
        thud() { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + .3); g.gain.setValueAtTime(.7, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .35); },
        // خطوة جزمة على تراب + رنّة المهماز، pan: يسار (-) أو يمين (+) حسب مكان اللاعب
        step(pan = 0) { const a = ctx(); if (!a) return; const t = a.currentTime, out = a.createStereoPanner ? a.createStereoPanner() : a.createGain(); if (out.pan) out.pan.value = pan; out.connect(a.destination);
            const n = noise(.18), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = 520; g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .16); n.connect(f); f.connect(g); g.connect(out); n.start(t);
            const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(60, t + .08); og.gain.setValueAtTime(.35, t); og.gain.exponentialRampToValueAtTime(.001, t + .1); o.connect(og); og.connect(out); o.start(t); o.stop(t + .12);
            [3150, 4230, 5370].forEach((fq, i) => { const s = a.createOscillator(), sg = a.createGain(), d = t + .03 + i * .018; s.frequency.value = fq; sg.gain.setValueAtTime(.0001, t); sg.gain.setValueAtTime(.045, d); sg.gain.exponentialRampToValueAtTime(.0001, d + .3); s.connect(sg); sg.connect(out); s.start(t); s.stop(d + .32); }); },
        // سحب المسدس من الجراب + تدوير الحشوة (تكات تتسارع ثم تبطى) + تلقيم الزناد
        spin(pan = 0) { const a = ctx(); if (!a) return; const t0 = a.currentTime, out = a.createStereoPanner ? a.createStereoPanner() : a.createGain(); if (out.pan) out.pan.value = pan; out.connect(a.destination);
            const n = noise(.25), hp = a.createBiquadFilter(), g = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 1800; g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.25, t0 + .06); g.gain.exponentialRampToValueAtTime(.0001, t0 + .22); n.connect(hp); hp.connect(g); g.connect(out); n.start(t0);
            const click = (t, v, f) => { const c = noise(.03), bp = a.createBiquadFilter(), cg = a.createGain(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; cg.gain.setValueAtTime(v, t); cg.gain.exponentialRampToValueAtTime(.0001, t + .025); c.connect(bp); bp.connect(cg); cg.connect(out); c.start(t); };
            let t = t0 + .3; for (let i = 0; i < 16; i++) { const k = i / 15, gap = .028 + Math.pow(Math.abs(k - .35) * 1.6, 2) * .07; click(t, .5, 3800 + (i % 2) * 500); t += gap; }
            click(t + .12, .9, 2200); click(t + .2, .7, 1500); },
        stamp() { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + .2); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .25); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .26); },
        blow() { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(.7), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = .8; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .65); n.connect(f); f.connect(g); g.connect(a.destination); n.start(t); },
        // الخدعة الحمراء: طلقة بالهوا (أخف من الطلقة الحقيقية) + صفير الرصاصة الضايعة
        dud() { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(.4), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = 2500; g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); n.connect(f); f.connect(g); g.connect(a.destination); n.start(t);
            const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(2400, t + .05); o.frequency.exponentialRampToValueAtTime(700, t + .7); og.gain.setValueAtTime(.0001, t); og.gain.exponentialRampToValueAtTime(.08, t + .1); og.gain.exponentialRampToValueAtTime(.0001, t + .7); o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + .72); },
        // بعد السقوط: جرس عميق واحد
        toll() { const a = ctx(); if (!a) return; const t = a.currentTime; [[98, .5], [196, .3], [294, .12], [523, .06]].forEach(([fq, v]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = fq; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + 3); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 3); }); },
        whoosh() { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(1.6), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1600, t + 1.5); g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.35, t + .8); g.gain.exponentialRampToValueAtTime(.001, t + 1.6); n.connect(f); f.connect(g); g.connect(a.destination); n.start(t); },
        // صوت خلفية: ريح خفيفة جداً (منخفضة عشان ما تزعج)
        wind() { const a = ctx(); if (!a || windG) return; const n = noise(4); n.loop = true; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = .6; windG = a.createGain(); windG.gain.value = .012; n.connect(f); f.connect(windG); windG.connect(a.destination); n.start(); },
        // موسيقى دخول قصيرة: صفير غربي (لحن أصلي) + أوتار منتوفة — مرة وحدة مع وصول اللاعبين
        motif() { const a = ctx(); if (!a) return; const t0 = a.currentTime, out = a.createGain(); out.gain.value = .9; out.connect(a.destination); out.connect(echo);
            const pluck = (f, t, d = .9, v = .35) => { const o = a.createOscillator(), lp = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(300, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + d + .05); };
            const whistle = (f, t, d) => { const o = a.createOscillator(), vb = a.createOscillator(), vg = a.createGain(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f; vb.frequency.value = 5.5; vg.gain.value = f * .012; vb.connect(vg); vg.connect(o.frequency); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .06); g.gain.setValueAtTime(.16, t + d - .08); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(out); o.start(t); vb.start(t); o.stop(t + d + .02); vb.stop(t + d + .02); };
            [[82.4, 0], [123.5, .45], [82.4, .9], [110, 1.35], [98, 1.8]].forEach(([f, t]) => pluck(f, t0 + t, 1.1, .4));
            [[493.9, .1, .3], [659.3, .45, .3], [784, .8, .25], [740, 1.1, .9], [587.3, 2.1, .7]].forEach(([f, t, d]) => whistle(f, t0 + t, d)); },
        // دقة قلب (تتسارع وقت التنبيهات)
        heart(v = .7) { const a = ctx(); if (!a) return; const t = a.currentTime; [0, .17].forEach((dt, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(70 - i * 8, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + .14); g.gain.setValueAtTime(v * (i ? .6 : 1), t + dt); g.gain.exponentialRampToValueAtTime(.001, t + dt + .16); o.connect(g); g.connect(a.destination); o.start(t + dt); o.stop(t + dt + .18); }); },
        // ضربة طبل + صنج مع «ارسم!» وبعدها سكوت لين الجرس
        drum() { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + .35); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(.001, t + .45); o.connect(g); g.connect(a.destination); g.connect(echo); o.start(t); o.stop(t + .46);
            const n = noise(1.2), hp = a.createBiquadFilter(), ng = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 5000; ng.gain.setValueAtTime(.35, t); ng.gain.exponentialRampToValueAtTime(.001, t + 1.1); n.connect(hp); hp.connect(ng); ng.connect(a.destination); n.start(t); },
        // منظور اللاعب: نفَس منخفض قصير يكبر ويختفي
        drone(d = 1) { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), lp = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 55; lp.type = 'lowpass'; lp.frequency.setValueAtTime(120, t); lp.frequency.exponentialRampToValueAtTime(700, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.22, t + d * .6); g.gain.exponentialRampToValueAtTime(.0001, t + d + .2); o.connect(lp); lp.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .25); },
        // الفوز: نفخة نحاسية صاعدة + هتاف السوق
        victory() { const a = ctx(); if (!a) return; const t0 = a.currentTime;
            [329.6, 415.3, 493.9, 659.3].forEach((f, i) => { const t = t0 + i * .09, o = a.createOscillator(), o2 = a.createOscillator(), lp = a.createBiquadFilter(), g = a.createGain(); o.type = o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.006; lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(2600, t + .12); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .05); g.gain.setValueAtTime(.12, t + .9 - i * .09); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4 - i * .09); o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(a.destination); o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5); });
            const n = noise(1.6), bp = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = .6; lfo.frequency.value = 7; lg.gain.value = .08; lfo.connect(lg); lg.connect(g.gain); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.22, t0 + .25); g.gain.exponentialRampToValueAtTime(.0001, t0 + 1.6); n.connect(bp); bp.connect(g); g.connect(a.destination); n.start(t0); lfo.start(t0); lfo.stop(t0 + 1.6); },
    };
})();

// ---------- واجهة: شات، لافتات، ملصقات مطلوب، ستارة سينما، انتقالات
// تنبيه قصير بنص الشاشة (بدل الشات): تأهل مباشر، طلقة ضايعة، ما أحد سحب…
function notice(text) { const el = $('#notice'); el.textContent = text; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); clearTimeout(notice.t); notice.t = setTimeout(() => el.classList.remove('in'), 2600); }
function bars(mode) { document.body.dataset.bars = mode || ''; }
function grade(mode) { document.body.dataset.grade = mode || ''; }
async function flash(color = '#fff', ms = 160) { const f = $('#flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = 1; await sleep(30); f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }
function poster(slot, p) { const el = $('#poster-' + slot); if (!p) { el.classList.remove('in'); return; }
    el.querySelector('.pname').textContent = p.name; el.querySelector('.pava').textContent = [...p.name.replace(/^أبو\s*/, '')][0] || '؟'; el.classList.remove('dead'); el.classList.add('in'); }
function sign(state, n, text) { const el = $('#sign'); el.dataset.state = state || ''; if (n != null) el.querySelector('.num').textContent = n;
    if (text != null) { const w = el.querySelector('.wait'); w.textContent = text; w.classList.remove('swap'); void w.offsetWidth; w.classList.add('swap'); } }
// تنبيهات قبل الرقم بأسلوب رعاة البقر (تنعرض بالترتيب: تهدئة ← تحذير ← «لا ترمش»)
const WARN = [
    ['اهدأ يا راعي… خلّ يدك قريبة من الجراب 🤠', 'الشمس فوق راسكم… والصبر قبل الرصاص', 'هذي البلدة ما تشيل اثنين… واحد بس يبقى'],
    ['عيونك على خصمك… لا تلتفت', 'الريح سكتت… والسوق كله يطالع', 'اللي يتردد اليوم ما يشوف بكره'],
    ['لا ترمش… الرقم جاي!', 'جهّز أصابعك… اللحظة قرّبت!', 'ساعة الظهيرة دقّت… استعد!']
];
// مقاس الواجهة حسب الشاشة (1 = ‎1280×720، وللطولي 430×932) — CSS يستخدمه كـ zoom للتبويبات والبطاقات
function uiZoom() { const w = innerWidth, h = innerHeight, z = w / h < 1 ? Math.min(w / 430, h / 932) : Math.min(w / 1280, h / 720); return Math.max(.6, Math.min(2.6, z)); }
function applyZoom() { document.documentElement.style.setProperty('--z', uiZoom().toFixed(3)); }
applyZoom(); addEventListener('resize', applyZoom);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
function banner(html, ms = 2600) { const el = $('#banner'); el.innerHTML = html; el.classList.add('in'); clearTimeout(banner.t); banner.t = setTimeout(() => el.classList.remove('in'), ms); }
function updateCount() { $('#count').textContent = G.phase === 'lobby' ? G.players.length : G.alive.length; $('#countLbl').textContent = G.phase === 'lobby' ? 'بالسوق' : 'باقين'; }
function renderLobby() {
    const list = $('#roster'); list.innerHTML = '';
    G.players.forEach(p => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = p.name; list.appendChild(c); });
    $('#startBtn').disabled = G.players.length < 2; if ($('#rules').classList.contains('in')) updateRulesCount(); $('#lobbyMax').textContent = G.settings.maxPlayers; updateCount();
}

// ---------- اللاعبين (الحد الأقصى ومن يمكنه الانضمام من الإعدادات)
function addPlayer(id, name, bot = false, avatar = null) {
    if (G.phase !== 'lobby' || G.players.some(p => p.id === id)) return;
    if (G.players.length >= G.settings.maxPlayers) { if (!addPlayer.warned) { addPlayer.warned = true; notice(`🚫 السوق ممتلئ (${G.settings.maxPlayers} لاعب)`); } return; }
    G.players.push({ id, name, bot, avatar }); G.scene && G.scene.setPlayers(G.players); renderLobby();
}
function addBot() { const used = new Set(G.players.map(p => p.name)), name = BOT_NAMES.find(n => !used.has(n)) || ('راعي ' + (G.players.length + 1)); addPlayer('bot:' + name, name, true); }

// ---------- ما يظهر عند الجرس: رقم 10–99 أو كلمة من عالم الغرب
const WORDS = ['حصان', 'مسدس', 'قبعة', 'رصاصة', 'شريف', 'صحراء', 'صبار', 'سرج', 'حبل', 'ذهب', 'صالون', 'برميل', 'عربة', 'مهماز', 'جزمة', 'ثور', 'ذئب', 'نسر', 'قطار', 'منجم', 'نجمة', 'وادي', 'غبار', 'بارود', 'خيمة', 'بقرة', 'جرس', 'سهم', 'كنز', 'مزرعة', 'لاسو', 'فأس', 'صقر', 'خنجر', 'مطر', 'ظهيرة'];
// تطبيع الكتابة: الهمزات ← ا/و/ي، التاء المربوطة ← ه، الألف المقصورة ← ي، بدون تشكيل ولا تطويل ولا «ال» بالبداية
function norm(s) { return String(s).trim().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').replace(/^ال(?=..)/, ''); }
function toDigits(s) { return String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, ''); }
function makeChallenge(avoid) {
    const kind = G.settings.bell === 'mixed' ? (Math.random() < .5 ? 'num' : 'word') : G.settings.bell === 'words' ? 'word' : 'num';
    for (let i = 0; i < 20; i++) { const c = kind === 'num' ? { type: 'num', value: String(Math.floor(rnd(10, 100))) } : { type: 'word', value: pickOne(WORDS) }; if (!avoid || norm(c.value) !== norm(avoid.value)) return c; }
    return { type: 'num', value: '77' };
}
function matches(text, c) { if (!c) return false; return c.type === 'num' ? toDigits(text) === c.value : norm(text) === norm(c.value); }

// ---------- الجولات: كل جولة يتوزّع الباقين أزواج (الفردي يتأهل مباشرة)، والفايزين يكملون للجولة الجاية
function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
function later(ms, fn) { G.timers.push(setTimeout(fn, ms)); }
// القرعة: كل لاعبين بمبارزة، ولو العدد فردي تكون مبارزة وحدة ثلاثية
function makePairs(list) {
    const pool = list.slice().sort(() => Math.random() - .5), pairs = [];
    const duel = ps => ({ ps, a: ps[0], b: ps[1], c: ps[2] || null, done: false, wasted: {}, jam: {}, misses: 0, winner: null, losers: [] });
    if (pool.length % 2 && pool.length >= 3) pairs.push(duel(pool.splice(0, 3)));
    for (let i = 0; i + 1 < pool.length; i += 2) pairs.push(duel([pool[i], pool[i + 1]]));
    return { pairs };
}
// ---------- قبل أول جولة: تبويب الشرح ← «ابدأ المبارزات» ← القرعة ← «ابدأ الآن»
const duelCount = n => Math.floor(n / 2); // الفردي = مبارزة ثلاثية وحدة
function duelsTxt(n) { return n === 1 ? 'مبارزة واحدة' : n === 2 ? 'مبارزتان' : n <= 10 ? n + ' مبارزات' : n + ' مبارزة'; }
function bellWords() { // صيغة النص حسب «ما يظهر عند الجرس»
    const b = G.settings.bell;
    return b === 'words' ? { gold: 'كلمة ذهبية', write: 'اكتبها', wrong: 'الكلمة الخاطئة', the: 'الكلمة الذهبية', red: 'كلمة حمراء', it: 'يكتبها' }
        : b === 'mixed' ? { gold: 'رقم أو كلمة ذهبية', write: 'اكتبها', wrong: 'الإجابة الخاطئة', the: 'الرقم أو الكلمة الذهبية', red: 'رقم أو كلمة بالأحمر', it: 'يكتبها' }
        : { gold: 'رقم ذهبي', write: 'اكتبه', wrong: 'الرقم الخاطئ', the: 'الرقم الذهبي', red: 'رقم أحمر', it: 'يكتبه' };
}
function renderRules() {
    const w = bellWords(), rows = [
        '<b>كل لاعبين</b> في مبارزة، والفائز يتأهل حتى يبقى بطل واحد.',
        `عند دقّ الجرس يظهر <b>${w.gold}</b>: ${w.write} في الشات قبل خصمك.`,
        `<b>الخطأ لا يُخرجك</b>: الكتابة قبل الجرس أو ${w.wrong} لا تُحسب، فاكتب مجددًا حتى تصيب.`,
        'إذا كان العدد فرديًا صارت مواجهة <b>ثلاثية</b>: الأسرع يتأهل.'];
    if (G.settings.trick) rows.push(`<b>الخدعة الحمراء</b>: قد يظهر ${w.red} قبل الجرس، ومن ${w.it} يضيّع طلقته.`);
    $('#rulesList').innerHTML = rows.map(r => `<div class="rrow">${r}</div>`).join('');
    updateRulesCount();
}
function updateRulesCount() {
    const n = G.players.length; $('#rulesGo').disabled = n < 2;
    $('#rulesCount').textContent = n < 2 ? 'بانتظار لاعبين…' : `${n} لاعب · ${duelsTxt(duelCount(n))} في الجولة الأولى`;
}
function openRules() {
    if (G.players.length < 2 || G.phase !== 'lobby') return; SFX.unlock();
    renderRules(); $('#lobby').classList.add('hide'); $('#rules').classList.add('in'); document.body.classList.add('ovl-on'); // الدخول من الشات مستمر لين «ابدأ المبارزات»
}
// شاشة القرعة: كرت لكل مبارزة، وتصغر الكروت تلقائياً لين تطلع كلها بشاشة وحدة
// اسم المرحلة حسب عدد مبارزات الجولة (بعد الجولة الأولى)
function stageName(n) { return G.round > 1 ? (n === 1 ? 'النهائي' : n === 2 ? 'نصف النهائي' : n === 4 ? 'ربع النهائي' : null) : null; }
// القرعة: ببداية المباراة وقبل كل جولة بالباقين — «ابدأ الآن» يبدأها
function showDraw(pairs) { return new Promise(res => {
    const n = pairs.length, all = G.settings.mode === 'all', st = stageName(n);
    $('#drawChip').textContent = G.round > 1 ? 'الجولة ' + G.round : 'القرعة';
    $('#drawTitle').textContent = st || (n === 1 ? 'مبارزة واحدة' : `${duelsTxt(n)} ${all ? 'في وقت واحد' : 'واحدة بعد واحدة'}`);
    $('#drawSub').textContent = G.fastest ? `أسرع مسدس حتى الآن: ${G.fastest.name} · ${G.fastest.secs} ث`
        : `كل اثنين متقابلين. الأسرع في كتابة ${bellWords().the} يتأهل.` + (pairs.some(d => d.c) ? ' والمواجهة الثلاثية: الأسرع من الثلاثة.' : '');
    const g = $('#dgrid');
    g.innerHTML = pairs.map((d, i) => `<div class="dcard${d.c ? ' tri' : ''}" style="animation-delay:${Math.min(i * 45, 900)}ms">${d.ps.map(p => `<div class="dp">${avatarHtml(p)}<b>${esc(p.name)}</b></div>`).join('<i class="dvs">VS</i>')}</div>`).join('');
    const fit = () => { // كل الكروت بشاشة وحدة وبأكبر حجم يتسع: العرض كامل والارتفاع بين العنوان والزر
        const z = uiZoom(), W = innerWidth - 48 * z, top = $('.dhead').getBoundingClientRect().bottom, btn = $('#drawGo').getBoundingClientRect().height;
        const avail = innerHeight - top - btn - 52 * z, narrow = innerWidth < 640;
        let cols = narrow ? 2 : 3; if (n > 12) cols = narrow ? 3 : 4; if (n > 20) cols = narrow ? 3 : 5;
        const base = cols; cols = Math.min(cols, Math.max(1, n)); // كروت قليلة (نصف النهائي/النهائي): نفس عرض الكرت العادي بالنص
        const rows = Math.ceil(n / cols), gap = (rows > 5 ? 8 : 14) * z, cw = (W - gap * (base - 1)) / base;
        const ch = Math.max(44, Math.min(cw / (narrow ? 1.7 : 2.3), (avail - gap * (rows - 1)) / rows)), av = Math.min(ch * .56, cw / (pairs.some(d => d.c) ? 4.4 : 3.4));
        g.style.width = (n < base ? (cw + gap) * n - gap : W) + 'px'; g.style.marginTop = 6 * z + 'px';
        Object.entries({ '--cols': cols, '--tri': narrow && cols > 1 ? 2 : 1, '--gap': gap + 'px', '--ch': ch + 'px', '--av': av + 'px', '--nf': Math.max(10, ch * .15) + 'px', '--vf': Math.max(11, ch * .17) + 'px' }).forEach(([k, v]) => g.style.setProperty(k, v));
    };
    $('#draw').classList.add('in'); document.body.classList.add('ovl-on'); fit(); addEventListener('resize', fit); SFX.stamp();
    $('#drawGo').onclick = () => { removeEventListener('resize', fit); $('#draw').classList.remove('in'); document.body.classList.remove('ovl-on'); SFX.unlock(); res(); };
}); }
async function startMatch() {
    if (G.players.length < 2 || G.phase !== 'lobby') return; SFX.unlock(); SFX.wind(false);
    $('#rules').classList.remove('in'); $('#lobby').classList.add('hide');
    G.alive = G.players.slice(); G.round = 0; G.phase = 'draw'; updateCount(); // القرعة تقفل الدخول
    const { pairs } = makePairs(G.alive); G.fastest = null; G.round = 1; // القرعة الأولى تعرض «القرعة»
    await sleep(350); await showDraw(pairs); G.round = 0;
    G.startedAt = Date.now(); G.phase = 'intro';
    await sleep(450);
    nextRound(pairs);
}
async function nextRound(preset) {
    G.round++; const pairs = preset || makePairs(G.alive).pairs, all = G.settings.mode === 'all', before = G.alive.slice();
    G.roundTotal = pairs.length; G.roundDone = 0; document.body.classList.add('match'); updatePill();
    if (!preset) { G.phase = 'draw'; await sleep(700); await showDraw(pairs); G.phase = 'intro'; await sleep(450); } // كل جولة: قرعة جديدة بالباقين
    const winners = [], final = pairs.length === 1; // النهائي: يُعاد لين ينحسم
    if (all) winners.push(...await runDuels(pairs, { idx: 1, total: 1, final }));
    else for (let i = 0; i < pairs.length; i++) winners.push(...await runDuels([pairs[i]], { idx: i + 1, total: pairs.length, final }));
    G.alive = winners; updateCount();
    // كل المبارزات طلعت بدون فايز (نادر): الجولة تنعاد بنفس اللاعبين
    if (!G.alive.length) { G.alive = before; notice('🌵 ما أحد تأهل… الجولة تنعاد'); await sleep(1500); return nextRound(); }
    if (G.alive.length === 1) return crown(G.alive[0]);
    await sleep(600); nextRound();
}
// يشغّل مبارزة وحدة (بتصوير كامل) أو كل مبارزات الجولة سوا، ويرجع الفايزين
function runDuels(duels, info) { return new Promise(async done => {
    clearTimers(); G.active = duels; G.info = info; G.finish = done; G.phase = 'intro'; updateCount();
    const one = duels.length === 1, d0 = duels[0];
    $('#demoA').textContent = d0.a.name; $('#demoB').textContent = d0.b.name;
    poster('a'); poster('b');
    if (one) { await showDuelCard(d0); fillAnnounce(d0, info); } // بطاقة القرعة لهالمبارزة، والإعلان يطلع على لقطة الكتف
    else await showVs(duels, info);
    SFX.wind(true);
    $('#skipBtn').classList.add('in'); $('#skipBtn').onclick = () => G.scene.skipIntro(); // «تخطّ المشهد»
    await G.scene.duelIntro(duels.map(d => d.ps.map(p => p.id)), { len: G.settings.intro, announce: one ? 3 : 0 });
    $('#skipBtn').classList.remove('in'); $('#annc').classList.remove('in');
    if (G.phase !== 'intro') return;
    G.scene.standoff(); grade(''); G.phase = 'standoff'; duelHud(true); warnThenReveal();
}); }
const others = (d, p) => d.ps.filter(x => x !== p);
const activeIds = () => G.active.filter(d => !d.done).flatMap(d => d.ps.map(p => p.id));
// تنبيه ← تنبيه (يطلعون المسدسات ويدوّرون الحشوة) ← «لا ترمش» ← [الخدعة الحمراء أحياناً] ← «ارسم!» ← الجرس
function warnThenReveal(again) {
    const lines = again ? [again, pickOne(WARN[2])] : WARN.map(pickOne);
    lines.forEach((l, i) => later(i * 1700, () => { sign('ready', null, l); SFX.tick(); }));
    if (!again) later(1700 + 300, () => G.scene.drawGuns(activeIds()));
    let t = lines.length * 1700 + rnd(200, 1200);
    // دقات قلب تتسارع وتعلى لين «ارسم!»
    for (let b = 300, gap = 950; b < t - 250; b += gap, gap = Math.max(430, gap * .88)) { const v = .35 + .45 * b / t; later(b, () => SFX.heart(v)); }
    if (G.settings.trick && (G.force.decoy != null ? G.force.decoy : Math.random() < .55)) { const tt = t; later(tt, decoy); t += 1700; }
    later(t, () => { G.phase = 'standoff'; sign('draw'); SFX.drum(); flash('rgba(255,180,90,.35)', 200); });
    later(t + 750, reveal);
}
// الخدعة الحمراء: رقم/كلمة بالأحمر — اللي يكتبها يطلق بالهوا ويضيّع طلقته
function decoy() {
    G.decoy = makeChallenge(); G.phase = 'decoy';
    sign('decoy', G.decoy.value); $('#sign').classList.toggle('word', G.decoy.type === 'word'); $('#sign .dec').textContent = G.decoy.type === 'word' ? 'خدعة! لا تكتبها' : 'خدعة! لا تكتبه'; SFX.tick();
    if (G.bots) G.active.forEach(d => !d.done && d.ps.forEach(p => { const fall = G.force.fall != null ? (G.force.fall && p === d.a) : Math.random() < .22; if (p.bot && fall) later(rnd(350, 1300), () => answer(p.id, G.decoy.value)); }));
}
function reveal() {
    G.ch = makeChallenge(G.decoy); G.decoy = null; G.revealAt = performance.now(); G.phase = 'armed';
    // الكل ضيّعوا طلقتهم؟ يرجع لهم الحق بالجرس هذا
    G.active.forEach(d => { if (!d.done && d.ps.every(p => d.wasted[p.id])) { d.wasted = {}; notice('🌵 كلهم ضيّعوا طلقاتهم… عبّوا من جديد'); } });
    sign('show', G.ch.value); $('#sign').classList.toggle('word', G.ch.type === 'word');
    const wd = G.ch.type === 'word'; $('#sign .lbl').textContent = wd ? 'اكتب الكلمة' : 'اكتب الرقم'; $('#sign .sub').textContent = wd ? 'أول من يكتبها يُسقط خصمه' : 'أول من يكتبه يُسقط خصمه';
    SFX.bell(); flash('rgba(255,220,150,.55)', 260);
    // البوتات (وضع التجربة): كل واحد يكتب بعد زمن عشوائي، وأحياناً يغلط أول (وأحياناً ما يكتب أبد — عشان تبان الإعادة)
    if (G.bots) G.active.forEach(d => !d.done && d.ps.forEach(p => { if (!p.bot || d.wasted[p.id] || (G.force.silent != null ? G.force.silent : Math.random() < .04)) return; const ms = rnd(900, 3800);
        const wrong = Math.random() < .25; if (wrong) later(ms * .5, () => answer(p.id, G.ch.type === 'num' ? String(+G.ch.value + (Math.random() < .5 ? 1 : -1) * Math.ceil(rnd(1, 9))) : pickOne(WORDS)));
        later(wrong ? ms * .5 + JAM_MS + rnd(150, 700) : ms, () => answer(p.id, G.ch.value)); }));
    later(ANSWER_MS, timeUp);
}
// مهلة الإطلاق (15ث) خلصت بدون إصابة: المبارزة تنعاد، وبعد إعادتين بلا إصابة يخرج الكل — إلا بالنهائي يُعاد لين ينحسم
async function timeUp() {
    if (G.phase !== 'armed') return;
    const open = G.active.filter(d => !d.done), out = [];
    open.forEach(d => { d.wasted = {}; d.misses++; if (d.misses > 2 && !G.info.final) { d.done = true; d.winner = null; d.losers = d.ps.slice(); out.push(d); } });
    if (out.length) {
        G.phase = 'resolve'; clearTimers(); sign('gone');
        notice(out.length === 1 && G.active.length === 1 ? '💀 ولا إصابة بعد إعادتين… الكل خرج' : `💀 ${out.length} ${out.length === 1 ? 'مبارزة' : 'مبارزات'} بلا إصابة… أصحابها خرجوا`);
        out.forEach(d => d.ps.forEach(p => G.scene.removePlayer(p.id))); G.roundDone += out.length; updatePill(); duelHud(false);
        if (G.active.every(x => x.done)) { await sleep(1800); return finishAll(); }
    }
    const left = G.active.filter(d => !d.done); if (!left.length) return;
    const n = Math.max(...left.map(d => d.misses)), msg = G.info.final ? 'ولا إصابة… النهائي يُعاد لين ينحسم!' : `ولا إصابة… إعادة المبارزة (${Math.min(n, 2)} من 2)`;
    G.phase = 'standoff'; warnThenReveal(msg);
}
function answer(id, text) {
    const p = G.players.find(x => x.id === id); if (!p) return;
    const d = G.active && G.active.find(x => !x.done && x.ps.some(q => q.id === id)); if (!d) return;
    if (G.phase === 'decoy') { if (matches(text, G.decoy) && !d.wasted[id]) { d.wasted[id] = true; G.scene.wasteShot(id); notice(`💨 ${p.name} طاح بالخدعة وضيّع طلقته!`); } return; }
    if (G.phase !== 'armed') return;
    if (d.wasted[id]) return; // مسدسه فاضي لين الجرس الجاي
    if (d.jam[id] && performance.now() < d.jam[id]) return;
    if (!matches(text, G.ch)) { if (toDigits(text) || norm(text)) { d.jam[id] = performance.now() + JAM_MS; } return; } // الغلط ما يُخرج: يكتب مرة ثانية
    win(d, p, text.trim());
}
// الأسرع يُسقط خصمه (أو خصميه بالمبارزة الثلاثية) ويتأهل
async function win(d, shooter, typed) {
    const targets = others(d, shooter), secs = ((performance.now() - G.revealAt) / 1000).toFixed(2);
    d.done = true; d.winner = shooter; d.losers = targets; d.secs = secs; G.roundDone++; updatePill();
    if (!G.fastest || +secs < +G.fastest.secs) G.fastest = { name: shooter.name, secs };
    if (G.active.length === 1) { // مبارزة بعد مبارزة: يطلق ← يطيح ← الكاميرا على الفايز + تبويب فوزه و«التالي» ← يرجع مكانه ← المبارزة الجاية
        G.phase = 'resolve'; clearTimers(); G.target = targets[0]; sign('gone'); grade('duel'); duelHud(false);
        await G.scene.fire(shooter.id, targets.map(t => t.id));
        feed(shooter, targets, secs); showWinTab(shooter, secs); SFX.victory();
        await waitNext(G.nextAutoMs || 0); $('#winTab').classList.remove('in');
        await G.scene.walkBack([shooter.id]);
        return endDuels();
    }
    // كل المبارزات بوقت واحد: المبارزة تُحسم فوراً بدون قطع، واسمه يطلع بقائمة الأسرع
    G.scene.quickFire(shooter.id, targets.map(t => t.id)); feed(shooter, targets, secs);
    if (G.active.every(x => x.done)) { G.phase = 'resolve'; clearTimers(); sign('gone'); duelHud(false); await sleep(1300); finishAll(); }
}
async function finishAll() {
    $('#feed').classList.remove('in');
    const W = G.active.filter(x => x.winner);
    if (W.length) {
        if (G.active.length > 1) {
            await G.scene.multiOutro(W.map(x => x.winner.id));   // الفايزين يحتفلون
            await winnerCard(W);
            await G.scene.walkBack(W.map(x => x.winner.id));
        }
    }
    endDuels();
}
// تبويب الفايز: صورته + «فاز بالمبارزة» + اسمه + «أطلق في X ث»، وتحته «التالي»
function showWinTab(p, secs) { $('#wtPic').innerHTML = avatarHtml(p); $('#wtName').textContent = p.name; $('#wtSecs').textContent = secs; $('#winTab').classList.add('in'); }
// «التالي» بعد الفوز: اللعبة توقف لين المذيع يضغطه
function waitNext(ms) { return new Promise(res => { const b = $('#nextBtn'); let t = null; const go = () => { clearTimeout(t); b.onclick = null; SFX.unlock(); res(); }; b.onclick = go; if (ms) t = setTimeout(go, ms); }); } // «التالي»: توقف لين المذيع يضغطه (ms للاختبار فقط)
async function endDuels() {
    const winners = G.active.map(d => d.winner).filter(Boolean);
    G.scene.cleanup(winners.map(p => p.id), G.active.flatMap(d => d.losers.map(p => p.id))); // يذوب للسوق: الخاسرين يختفون والفايزين يرجعون لأماكنهم
    poster('a'); poster('b'); bars(''); grade(''); duelHud(false); SFX.wind(false); $('#feed').innerHTML = '';
    G.phase = 'between'; await sleep(500);
    const f = G.finish; G.finish = null; f && f(winners);
}
// ---------- الصور والبطاقات
const face = p => p.avatar || G.scene.portrait(p.id) || '';
function avatarHtml(p, cls = '') { const src = face(p), alt = p.avatar ? (G.scene.portrait(p.id) || '') : '';
    if (src && alt) return `<img class="av ${cls}" src="${src}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${alt}'">`; return src ? `<img class="av ${cls}" src="${src}" alt="">` : `<span class="av ${cls} ini">${esc([...p.name.replace(/^أبو\s*/, '')][0] || '؟')}</span>`; }
// الشريط السفلي قبل الدخول
// ---------- شاشة المباراة: شريط الجولة، أسماء المتواجهين فوق روسهم، التلميحات، الإعلان
function updatePill() { $('#rRound').textContent = 'الجولة ' + G.round; $('#rDone').textContent = G.roundDone || 0; $('#rTotal').textContent = G.roundTotal || 0; }
function duelHud(on) {
    document.body.classList.toggle('duel', !!on);
    $('#hintGold').textContent = 'اكتب ' + bellWords().the;
    const d = on && G.active && G.active.length === 1 ? G.active[0] : null;
    [0, 1, 2].forEach(i => { const el = $('#tag' + i), p = d && d.ps[i]; el.classList.toggle('on', !!p); if (p) { el.innerHTML = avatarHtml(p, 'sm') + '<span></span>'; el.lastChild.textContent = p.name; } });
}
(function tagLoop() { // البطاقات تلحق راس كل لاعب
    if (document.body.classList.contains('duel') && G.scene && G.active && G.active.length === 1) G.active[0].ps.forEach((p, i) => { const el = $('#tag' + i), q = G.scene.headScreen(p.id); if (!q) { el.style.visibility = 'hidden'; return; } el.style.visibility = ''; el.style.transform = `translate(${q.x}px,${q.y}px) translate(-50%,-100%)`; });
    requestAnimationFrame(tagLoop); })();
const duelCardHtml = d => `<div class="dcard">${d.ps.map(p => `<div class="dp">${avatarHtml(p)}<b>${esc(p.name)}</b></div>`).join('<i class="dvs">VS</i>')}</div>`;
async function showDuelCard(d) { const el = $('#dOne'); el.innerHTML = duelCardHtml(d); el.classList.add('in'); SFX.stamp(); await sleep(2200); el.classList.remove('in'); await sleep(350); }
function fillAnnounce(d, info) {
    $('#anRound').textContent = stageName(G.roundTotal) || 'الجولة ' + G.round;
    $('#anTitle').textContent = info.final ? 'المبارزة النهائية' : `المبارزة ${info.idx} من ${info.total}`;
    $('#anChips').innerHTML = d.ps.map(p => `<span class="chipP">${avatarHtml(p, 'sm')}<span>${esc(p.name)}</span></span>`).join('<i class="chipVs">VS</i>');
}
async function showVs(duels, info) {
    const el = $('#vs'), one = duels.length === 1;
    const head = one ? `مواجهة رقم ${info.idx} من أصل ${info.total}` : `${duels.length} مواجهات في وقت واحد`;
    const body = one ? duels[0].ps.map(p => `<div class="vp">${avatarHtml(p)}<b>${esc(p.name)}</b></div>`).join('<i class="vx">ضد</i>')
        : `<div class="vgrid">${duels.slice(0, 6).map(d => `<div class="vpair">${d.ps.map(p => `${avatarHtml(p, 'sm')}<span>${esc(p.name)}</span>`).join('<i>ضد</i>')}</div>`).join('')}${duels.length > 6 ? `<div class="vmore">+${duels.length - 6} مبارزات</div>` : ''}</div>`;
    el.innerHTML = `<div class="vhead">${head}</div><div class="vbody">${body}</div>`; el.classList.add('in'); SFX.stamp();
    await sleep(3000); el.classList.remove('in'); await sleep(300);
}
// بطاقة الفوز (3 ثواني بدون زر): صورته واسمه و«فاز بالمواجهة» ووقته
function winnerCard(duels) { return new Promise(res => {
    const el = $('#winCard'), one = duels.length === 1, d = duels[0];
    el.innerHTML = one
        ? `<div class="wtag">🏆 فاز بالمواجهة</div><div class="wpic">${avatarHtml(d.winner, 'big')}</div><h3>${esc(d.winner.name)}</h3><p>ضد ${esc(d.losers.map(x => x.name).join(' و'))} · سحب بـ <b>${d.secs}</b> ث</p>`
        : `<div class="wtag">🏆 الفايزين بالمواجهات</div><div class="wlist">${duels.map(x => `<div class="wrow">${avatarHtml(x.winner, 'sm')}<b>${esc(x.winner.name)}</b><small>${x.secs} ث</small></div>`).join('')}</div>`;
    el.classList.add('in'); SFX.victory();
    setTimeout(() => { el.classList.remove('in'); res(); }, 2500);
}); }
function feed(p, losers, secs) { const box = $('#feed'), row = document.createElement('div'); row.className = 'frow';
    row.innerHTML = avatarHtml(p, 'sm') + '<span class="fx">☆</span><b class="w"></b><em>أسقط</em><b class="l"></b><span class="ft"></span>';
    row.querySelector('.w').textContent = p.name; row.querySelector('.l').textContent = losers.map(x => x.name).join(' و'); row.querySelector('.ft').textContent = secs;
    box.appendChild(row); while (box.children.length > 8) box.firstChild.remove(); box.classList.add('in'); SFX.stamp(); }
async function crown(p) {
    document.body.classList.remove('match'); G.phase = 'champ'; G.scene.champion(p.id); bars('wide');
    $('#champName').textContent = p.name; $('#champ').classList.add('in'); SFX.bell();
    // نقاط المنصة (قاعدة إلزامية لكل لعبة) — بدون أثر بصفحة التجربة لأن ما فيه حساب
    const real = G.players.filter(x => String(x.id).indexOf('tiktok:') === 0);
    try { if (real.length && window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') window.AGPAuth.reportMatchPoints({ players: real.map(x => ({ id: x.id, name: x.name })), winnerIds: [p.id], teamGame: false, durationMs: Date.now() - G.startedAt }); } catch (e) { }
}
// إعادة المباراة: نفس اللاعبين يبدأون من جديد مباشرة
async function replay() {
    $('#champ').classList.remove('in'); G.phase = 'lobby'; bars(''); grade(''); G.scene.setPlayers([]); G.scene.lobby(); G.scene.setPlayers(G.players); renderLobby();
    await sleep(400); openRules();
}
async function newGame() {
    $('#champ').classList.remove('in'); document.body.classList.remove('match');
    G.phase = 'lobby'; G.scene.setPlayers([]); G.scene.lobby(); bars(''); G.scene.setPlayers(G.players);
    $('#lobby').classList.remove('hide'); renderLobby();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- شات تيك توك: كلمة الدخول من الإعدادات (cd-settings) — تنقبل بأي كتابة (نفس تطبيع الإجابات)
function isJoin(text) { const k = norm(G.settings.keyword || 'دخول'); return norm(text) === k || norm(text) === 'join'; }
function hookStream() {
    const P = window.CDPlatform; if (!P) return;
    P.connect(); // الاتصال من صفحة اللعبة: تطلع بـ«البثوث الحالية» وتنحسب إحصائيات البث
    // التعليق: { id: 'tiktok:<user>', name, text, isFollower, avatarUrl } (adapters/agp-tiktok-adapter.js)
    P.onComment(pl => { const id = String(pl.id), name = pl.name || pl.nickname || 'راعي';
        if (G.phase === 'lobby' && isJoin(pl.text)) { if (G.settings.who === 'followers' && !pl.isFollower) return; addPlayer(id, name, false, pl.avatarUrl || null); } else answer(id, pl.text); });
}

// ---------- تشغيل
(async function boot() {
    let scene = null;
    try { scene = await mountDuel($('#stage'), { onEvent: (e, d, dur) => {
        const many = G.active && G.active.length > 1; // كل المبارزات سوا: بدون وميض الشاشة عشان ما تومض كثير
        if (e === 'bang') { SFX.bang(); if (!many) flash('#fff8e0', 140); }
        else if (e === 'dud') SFX.dud();
        else if (e === 'hit') { SFX.thud(); if (!many) flash('rgba(255,255,255,.7)', 120); if (G.active && G.active.length === 1 && G.target) $('#poster-' + (G.active[0].a === G.target ? 'a' : 'b')).classList.add('dead'); }
        else if (e === 'thud') SFX.thud();
        else if (e === 'down') { SFX.toll(); document.body.dataset.fx = 'down'; clearTimeout(G.fxT); G.fxT = setTimeout(() => { document.body.dataset.fx = ''; }, 1100); }
        else if (e === 'tick') SFX.tick();
        else if (e === 'step') SFX.step(d);
        else if (e === 'spin') SFX.spin(d);
        else if (e === 'blow') SFX.blow();
        else if (e === 'pop') SFX.dud();
        else if (e === 'shot') { // ستارة السينما + تدرّج الألوان حسب اللقطة
            $('#annc').classList.toggle('in', d === 'ots');
            if (d !== 'povA' && d !== 'povB') $('#lids').classList.remove('on');
            if (d === 'crane') SFX.motif();
            if (d === 'povA' || d === 'povB') { SFX.drone(dur || 1); bars(''); grade('pov'); const L = $('#lids'); L.classList.remove('on'); L.style.setProperty('--lid', (dur || 2.4) + 's'); void L.offsetWidth; L.classList.add('on'); }
            else if (d === 'bullet') { bars('tight'); grade('slow'); SFX.whoosh(); }
            else if (d === 'boots' || d === 'draw' || d === 'fall') { bars('wide'); grade('duel'); }
            else if (d === 'answerCam') { bars('wide'); grade('hero'); }
            else if (d === 'drawWide') { bars('wide'); grade('duel'); }
            else if (d === 'winCam') { bars('wide'); grade('hero'); clearTimeout(G.fxT); document.body.dataset.fx = ''; }
            else if (d === 'walkback') { bars('wide'); grade(''); }
            else if (d === 'leave') { bars('wide'); grade(''); SFX.whoosh(); }
            else if (d === 'crane' || d === 'profile' || d === 'standoff') { bars('wide'); grade(''); }
        } } }); } catch (e) { console.error(e); }
    if (!scene) { $('#fallback').hidden = false; return; }
    G.scene = scene; G.phase = 'lobby';
    const demo = !window.CDPlatform || window.CDPlatform.demo; // وضع التجربة (?demo=1): بوتات + لوحة التجربة
    G.bots = demo; if (demo) { for (let i = 0; i < 8; i++) addBot(); $('#demo').hidden = false; } else $('#addBot').hidden = true;
    $('#lobby p').innerHTML = `اكتب <b></b> بالشات وادخل السوق — كل لاعبين بمبارزة، <b>أول من يكتب اللي يطلع عند الجرس يطلق</b> ويتأهل.`; $('#lobby p b').textContent = G.settings.keyword || 'دخول';
    $('#loading').classList.add('hide');
    $('#startBtn').onclick = openRules; $('#rulesGo').onclick = startMatch; $('#addBot').onclick = addBot; $('#againBtn').onclick = replay; $('#exitBtn').onclick = () => { location.href = window.CDPlatform ? CDPlatform.libraryUrl : '../../games.html'; };
    // لوحة التجربة: اكتب بدال أي راعي من أول مبارزة نشطة
    const send = (slot, inp) => { const d = G.active && (G.active.find(x => !x.done) || G.active[0]), p = d && (slot ? d.b : d.a); if (!p || !inp.value.trim()) return; answer(p.id, inp.value.trim()); inp.value = ''; };
    [['#inA', 0], ['#inB', 1]].forEach(([s, i]) => { const inp = $(s); inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(i, inp); }); inp.nextElementSibling.onclick = () => send(i, inp); });
    $('#botsTgl').onchange = e => { G.bots = e.target.checked; };
    $('#demoToggle').onclick = () => $('#demo').classList.toggle('open');
    // الهيدر: «إعدادات المباراة» و«خروج» (لمكتبة الألعاب) — وقت المباراة يتأكد قبل
    const inMatch = () => G.phase !== 'lobby' && G.phase !== 'champ';
    $('#hSet').href = window.CDPlatform ? CDPlatform.settingsUrl + (CDPlatform.demo ? '?demo=1' : '') : 'index.html';
    $('#hExit').href = window.CDPlatform ? CDPlatform.libraryUrl : '../../games.html';
    [$('#hSet'), $('#hExit')].forEach(a => a.addEventListener('click', e => { if (inMatch() && !confirm('المباراة شغّالة… تبي تطلع منها؟')) e.preventDefault(); }));
    hookStream(); renderLobby();
    if (window.CDPlatform && CDPlatform.onStatus) CDPlatform.onStatus(st => $('#live').classList.toggle('on', st === 'connected'));
    document.documentElement.style.setProperty('--ans', ANSWER_MS / 1000 + 's');
    window.__duel = G; // للاختبار
})();
