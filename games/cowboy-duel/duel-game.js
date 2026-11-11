// «مواجهة الغرب» — منطق اللعبة.
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

const G = { players: [], alive: [], byes: {}, phase: 'loading', active: null, ch: null, decoy: null, revealAt: 0, timers: [], round: 0, startedAt: 0, scene: null, bots: true, settings: CDSettings.load(), draft: null, finish: null, force: {} }; // force: لتسجيل فيديو العرض فقط (decoy: نعم/لا، fall: الأول يطيح بالخدعة)

// ---------- الصوت (WebAudio مولّد بالكود — بدون ملفات)
const SFX = (() => {
    let ac = null, echo = null, windG = null;
    function ctx() { if (ac) return ac; try {
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
        wind(on) { const a = ctx(); if (!a) return; if (!windG) { const n = noise(4); n.loop = true; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .7; windG = a.createGain(); windG.gain.value = 0; n.connect(f); f.connect(windG); windG.connect(a.destination); n.start(); }
            windG.gain.setTargetAtTime(on ? .09 : .025, a.currentTime, .8); }
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
const pickOne = a => a[Math.floor(Math.random() * a.length)];
function banner(html, ms = 2600) { const el = $('#banner'); el.innerHTML = html; el.classList.add('in'); clearTimeout(banner.t); banner.t = setTimeout(() => el.classList.remove('in'), ms); }
function updateCount() { $('#count').textContent = G.phase === 'lobby' ? G.players.length : G.alive.length; $('#countLbl').textContent = G.phase === 'lobby' ? 'بالسوق' : 'باقين'; }
function renderLobby() {
    const list = $('#roster'); list.innerHTML = '';
    G.players.forEach(p => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = p.name; list.appendChild(c); });
    $('#startBtn').disabled = G.players.length < 2; $('#lobbyMax').textContent = G.settings.maxPlayers; updateCount();
}

// ---------- اللاعبين (الحد الأقصى ومن يمكنه الانضمام من الإعدادات)
function addPlayer(id, name, bot = false) {
    if (G.phase !== 'lobby' || G.players.some(p => p.id === id)) return;
    if (G.players.length >= G.settings.maxPlayers) { if (!addPlayer.warned) { addPlayer.warned = true; notice(`🚫 السوق ممتلئ (${G.settings.maxPlayers} لاعب)`); } return; }
    G.players.push({ id, name, bot }); G.scene && G.scene.setPlayers(G.players); renderLobby();
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
function makePairs(list) {
    const pool = list.slice().sort(() => Math.random() - .5); let bye = null;
    if (pool.length % 2) { pool.sort((a, b) => (G.byes[a.id] || 0) - (G.byes[b.id] || 0)); bye = pool.shift(); G.byes[bye.id] = (G.byes[bye.id] || 0) + 1; pool.sort(() => Math.random() - .5); }
    const pairs = []; for (let i = 0; i < pool.length; i += 2) pairs.push({ a: pool[i], b: pool[i + 1], done: false, wasted: {}, jam: {} });
    return { pairs, bye };
}
async function startMatch() {
    if (G.players.length < 2) return; SFX.unlock(); SFX.wind(false);
    G.alive = G.players.slice(); G.byes = {}; G.round = 0; G.startedAt = Date.now();
    $('#lobby').classList.add('hide'); G.phase = 'intro'; updateCount();
    await sleep(300);
    nextRound();
}
async function nextRound() {
    G.round++; const { pairs, bye } = makePairs(G.alive), all = G.settings.mode === 'all';
    banner(`<small>الجولة ${G.round}</small>${pairs.length} ${pairs.length === 1 ? 'مبارزة' : pairs.length === 2 ? 'مبارزتين' : pairs.length <= 10 ? 'مبارزات' : 'مبارزة'}${all && pairs.length > 1 ? ' <i>بوقت واحد</i>' : ''}`, 1700);
    if (bye) { notice(`🍀 ${bye.name} يتأهل مباشرة للجولة الجاية`); }
    await sleep(1900);
    const winners = [], final = pairs.length === 1 && !bye;
    if (all) winners.push(...await runDuels(pairs, { idx: 1, total: 1, next: final ? 'إعلان البطل 🏆' : 'الجولة التالية' }));
    else for (let i = 0; i < pairs.length; i++) winners.push(...await runDuels([pairs[i]], { idx: i + 1, total: pairs.length, next: final ? 'إعلان البطل 🏆' : i === pairs.length - 1 ? 'الجولة التالية' : 'المبارزة التالية' }));
    G.alive = winners.concat(bye ? [bye] : []); updateCount();
    if (G.alive.length <= 1) return crown(G.alive[0]);
    await sleep(600); nextRound();
}
// يشغّل مبارزة وحدة (بتصوير كامل) أو كل مبارزات الجولة سوا، ويرجع الفايزين
function runDuels(duels, info) { return new Promise(async done => {
    clearTimers(); G.active = duels; G.info = info; G.finish = done; G.phase = 'intro'; updateCount();
    const one = duels.length === 1, d0 = duels[0];
    $('#demoA').textContent = d0.a.name; $('#demoB').textContent = d0.b.name;
    poster('a'); poster('b');
    await showVs(duels, info); // «المبارزة 2 من أصل 4» + صورة واسم كل لاعب، وبعدها مشهد دخولهم
    if (one) { poster('a', d0.a); poster('b', d0.b); }
    bars('wide'); SFX.wind(true);
    await G.scene.duelIntro(duels.map(d => [d.a.id, d.b.id]), { len: G.settings.intro });
    if (G.phase !== 'intro') return;
    G.scene.standoff(); grade(''); G.phase = 'standoff'; warnThenReveal();
}); }
const activeIds = () => G.active.filter(d => !d.done).flatMap(d => [d.a.id, d.b.id]);
// تنبيه ← تنبيه (يطلعون المسدسات ويدوّرون الحشوة) ← «لا ترمش» ← [الخدعة الحمراء أحياناً] ← «ارسم!» ← الجرس
function warnThenReveal(again) {
    const lines = again ? ['ولا أحد سحب… الجرس الجاي لا يفوتك!', pickOne(WARN[2])] : WARN.map(pickOne);
    lines.forEach((l, i) => later(i * 1700, () => { sign('ready', null, l); SFX.tick(); }));
    if (!again) later(1700 + 300, () => G.scene.drawGuns(activeIds()));
    let t = lines.length * 1700 + rnd(200, 1200);
    if (G.settings.trick && (G.force.decoy != null ? G.force.decoy : Math.random() < .55)) { const tt = t; later(tt, decoy); t += 1700; }
    later(t, () => { G.phase = 'standoff'; sign('draw'); SFX.tick(); flash('rgba(255,180,90,.35)', 200); });
    later(t + 750, reveal);
}
// الخدعة الحمراء: رقم/كلمة بالأحمر — اللي يكتبها يطلق بالهوا ويضيّع طلقته
function decoy() {
    G.decoy = makeChallenge(); G.phase = 'decoy';
    sign('decoy', G.decoy.value); $('#sign').classList.toggle('word', G.decoy.type === 'word'); SFX.tick();
    if (G.bots) G.active.forEach(d => !d.done && [d.a, d.b].forEach(p => { const fall = G.force.fall != null ? (G.force.fall && p === d.a) : Math.random() < .22; if (p.bot && fall) later(rnd(350, 1300), () => answer(p.id, G.decoy.value)); }));
}
function reveal() {
    G.ch = makeChallenge(G.decoy); G.decoy = null; G.revealAt = performance.now(); G.phase = 'armed';
    // الاثنين ضيّعوا طلقتهم؟ يرجع لهم الحق بالجرس هذا
    G.active.forEach(d => { if (!d.done && d.wasted[d.a.id] && d.wasted[d.b.id]) { d.wasted = {}; notice(`🌵 ${d.a.name} و${d.b.name} ضيّعوا طلقاتهم… عبّوا من جديد`); } });
    sign('show', G.ch.value); $('#sign').classList.toggle('word', G.ch.type === 'word');
    $('#sign .lbl').textContent = G.ch.type === 'word' ? 'اكتب الكلمة بالشات!' : 'اكتب الرقم بالشات!';
    SFX.bell(); flash('rgba(255,220,150,.55)', 260);
    // البوتات (وضع التجربة): كل واحد يكتب بعد زمن عشوائي، وأحياناً يغلط أول
    if (G.bots) G.active.forEach(d => !d.done && [d.a, d.b].forEach(p => { if (!p.bot || d.wasted[p.id]) return; const ms = rnd(900, 3800);
        if (Math.random() < .25) later(ms * .6, () => answer(p.id, G.ch.type === 'num' ? String(+G.ch.value + (Math.random() < .5 ? 1 : -1) * Math.ceil(rnd(1, 9))) : pickOne(WORDS)));
        later(ms, () => answer(p.id, G.ch.value)); }));
    later(ANSWER_MS, () => { if (G.phase !== 'armed') return; notice('🌵 ولا أحد سحب! جرس جديد…'); G.active.forEach(d => { d.wasted = {}; }); G.phase = 'standoff'; warnThenReveal(true); });
}
function answer(id, text) {
    const p = G.players.find(x => x.id === id); if (!p) return;
    const d = G.active && G.active.find(x => !x.done && (x.a.id === id || x.b.id === id)); if (!d) return;
    if (G.phase === 'decoy') { if (matches(text, G.decoy) && !d.wasted[id]) { d.wasted[id] = true; G.scene.wasteShot(id); notice(`💨 ${p.name} طاح بالخدعة وضيّع طلقته!`); } return; }
    if (G.phase !== 'armed') return;
    if (d.wasted[id]) return; // مسدسه فاضي لين الجرس الجاي
    if (d.jam[id] && performance.now() < d.jam[id]) return;
    if (!matches(text, G.ch)) { if (toDigits(text) || norm(text)) { d.jam[id] = performance.now() + JAM_MS; } return; }
    win(d, p, text.trim());
}
// الأسرع: بطاقة باسمه وإجابته ووقته ← يوجّه ويطلق ← الثاني يطيح
async function win(d, shooter, typed) {
    const target = d.a === shooter ? d.b : d.a, secs = ((performance.now() - G.revealAt) / 1000).toFixed(2);
    d.done = true; d.winner = shooter; d.loser = target; d.secs = secs;
    tag(shooter.id, shooter.name, 'ok', secs, 3200); // الفايز بس: تبويب فوق راسه باسمه ووقت إجابته
    if (G.active.length === 1) { // مبارزة بعد مبارزة: تصوير كامل
        G.phase = 'resolve'; clearTimers(); G.target = target; sign('gone'); SFX.stamp();
        await sleep(1200); grade('duel');
        await G.scene.fire(shooter.id, target.id);           // السحب ← الرصاصة ← السقوط ← ينفخ الدخان (اللقطة تثبت عليه)
        return afterDuels();
    }
    // كل المبارزات بوقت واحد: الزوج يُحسم فوراً بدون قطع، واسمه يطلع بقائمة الأسرع
    G.scene.quickFire(shooter.id, target.id); feed(shooter, typed, secs);
    if (G.active.every(x => x.done)) {
        G.phase = 'resolve'; clearTimers(); sign('gone');
        await sleep(1800); $('#feed').classList.remove('in');
        await G.scene.multiOutro(G.active.map(x => x.winner.id), G.active.map(x => x.loser.id));
        afterDuels();
    }
}
// بطاقة الفايز (اسمه وصورته وإنه فاز) ← «التالي» يرجع الكاميرا للقطة المبارزة ← زر المبارزة/الجولة التالية
async function afterDuels() {
    await winnerCard(G.active);
    G.scene.aftermath(); bars('wide'); grade('');
    await nextButton(G.info.next);
    endDuels();
}
async function endDuels() {
    const winners = G.active.map(d => d.winner);
    G.scene.cleanup(winners.map(p => p.id), G.active.map(d => d.loser.id)); // يذوب للسوق: الخاسرين يختفون والفايزين يرجعون لأماكنهم
    poster('a'); poster('b'); bars(''); grade(''); SFX.wind(false); $('#feed').innerHTML = ''; clearTags();
    G.phase = 'between'; await sleep(500);
    const f = G.finish; G.finish = null; f && f(winners);
}
// ---------- الصور والبطاقات
const face = p => p.avatar || G.scene.portrait(p.id) || '';
function avatarHtml(p, cls = '') { const src = face(p); return src ? `<img class="av ${cls}" src="${src}" alt="">` : `<span class="av ${cls} ini">${esc([...p.name.replace(/^أبو\s*/, '')][0] || '؟')}</span>`; }
// الشريط السفلي قبل الدخول
async function showVs(duels, info) {
    const el = $('#vs'), one = duels.length === 1;
    const head = one ? `الجولة ${G.round} · المبارزة ${info.idx} من أصل ${info.total}` : `الجولة ${G.round} · ${duels.length} مبارزات في وقت واحد`;
    const body = one ? `<div class="vp">${avatarHtml(duels[0].a)}<b>${esc(duels[0].a.name)}</b></div><i class="vx">ضد</i><div class="vp">${avatarHtml(duels[0].b)}<b>${esc(duels[0].b.name)}</b></div>`
        : `<div class="vgrid">${duels.slice(0, 6).map(d => `<div class="vpair">${avatarHtml(d.a, 'sm')}<span>${esc(d.a.name)}</span><i>ضد</i><span>${esc(d.b.name)}</span>${avatarHtml(d.b, 'sm')}</div>`).join('')}${duels.length > 6 ? `<div class="vmore">+${duels.length - 6} مبارزات</div>` : ''}</div>`;
    el.innerHTML = `<div class="vhead">${head}</div><div class="vbody">${body}</div>`; el.classList.add('in'); SFX.stamp();
    await sleep(one ? 2800 : 3200); el.classList.remove('in'); await sleep(250);
}
// بطاقة الفايز: صورته واسمه و«فاز بالمبارزة» + زر «التالي»
function winnerCard(duels) { return new Promise(res => {
    const el = $('#winCard'), one = duels.length === 1, d = duels[0];
    el.innerHTML = one
        ? `<div class="wtag">🏆 فاز بالمبارزة</div><div class="wpic">${avatarHtml(d.winner, 'big')}</div><h3>${esc(d.winner.name)}</h3><p>ضد ${esc(d.loser.name)} · سحب بـ <b>${d.secs}</b> ث</p><button type="button" class="wbtn">التالي ←</button>`
        : `<div class="wtag">🏆 الفايزين بالمبارزات</div><div class="wlist">${duels.map(x => `<div class="wrow">${avatarHtml(x.winner, 'sm')}<b>${esc(x.winner.name)}</b><small>${x.secs} ث</small></div>`).join('')}</div><button type="button" class="wbtn">التالي ←</button>`;
    el.classList.add('in'); SFX.bell();
    waitClick(el.querySelector('.wbtn'), () => { el.classList.remove('in'); res(); });
}); }
function nextButton(label) { return new Promise(res => { const b = $('#nextBtn'); b.textContent = label + ' ←'; b.classList.add('in'); waitClick(b, () => { b.classList.remove('in'); res(); }); }); }
// زر واحد ينتظر ضغطة (أو Enter/مسافة من كيبورد الستريمر)
function waitClick(btn, fn) { let on = true; const go = () => { if (!on) return; on = false; btn.onclick = null; removeEventListener('keydown', key); fn(); };
    const key = e => { if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; e.preventDefault(); go(); } };
    btn.onclick = go; setTimeout(() => addEventListener('keydown', key), 300); }
// ---------- تبويب الإجابة فوق راس اللاعب (نفس هوية اللعبة: لوح خشب)
const TAGS = new Map(); let tagLoop = 0;
const TAG_IC = { ok: '✓', bad: '✗', waste: '💨', out: '✖' };
function tag(id, text, kind, secs, ms = 2000) { let t = TAGS.get(id); if (!t) { t = { el: document.createElement('div') }; $('#tags').appendChild(t.el); TAGS.set(id, t); }
    t.el.className = 'atag ' + kind; t.el.innerHTML = `<span class="ic">${TAG_IC[kind] || ''}</span><b></b>${secs ? `<small>⏱ ${secs} ث</small>` : ''}`; t.el.querySelector('b').textContent = text;
    t.until = performance.now() + ms; void t.el.offsetWidth; t.el.classList.add('pop'); if (!tagLoop) tagLoop = requestAnimationFrame(moveTags); }
function moveTags() { tagLoop = 0; const now = performance.now();
    for (const [id, t] of TAGS) { const p = now < t.until && G.scene.screenPos(id); if (!p) { t.el.remove(); TAGS.delete(id); continue; } t.el.style.left = (Math.min(.93, Math.max(.07, p.x)) * 100) + '%'; t.el.style.top = (Math.min(.9, Math.max(.16, p.y)) * 100) + '%'; }
    if (TAGS.size) tagLoop = requestAnimationFrame(moveTags); }
function clearTags() { for (const [, t] of TAGS) t.el.remove(); TAGS.clear(); }
function feed(p, typed, secs) { const box = $('#feed'), row = document.createElement('div'); row.className = 'frow';
    row.innerHTML = '<b></b><span class="ft"></span><span class="fs"></span>'; row.querySelector('b').textContent = '🔫 ' + p.name; row.querySelector('.ft').textContent = typed; row.querySelector('.fs').textContent = secs + ' ث';
    box.appendChild(row); while (box.children.length > 8) box.firstChild.remove(); box.classList.add('in'); SFX.stamp(); }
async function crown(p) {
    G.phase = 'champ'; G.scene.champion(p.id); bars('wide');
    $('#champName').textContent = p.name; $('#champ').classList.add('in'); SFX.bell();
    // نقاط المنصة (قاعدة إلزامية لكل لعبة) — بدون أثر بصفحة التجربة لأن ما فيه حساب
    try { if (window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') window.AGPAuth.reportMatchPoints({ players: G.players.map(x => ({ id: x.id, name: x.name })), winnerIds: [p.id], teamGame: false, durationMs: Date.now() - G.startedAt }); } catch (e) { }
}
async function newGame() {
    $('#champ').classList.remove('in');
    G.phase = 'lobby'; G.scene.setPlayers([]); G.scene.lobby(); bars(''); G.scene.setPlayers(G.players);
    $('#lobby').classList.remove('hide'); renderLobby();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- شاشة الإعدادات (نفس شكل كروت المنصة: أيقونة + عنوان + خيارات + وصف)
const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M19 8v6M16 11h6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
function renderSettings() {
    const v = G.draft, grid = $('#setGrid'); grid.innerHTML = '';
    CDSettings.FIELDS.forEach(f => {
        const card = document.createElement('div'); card.className = 'scard';
        card.innerHTML = `<div class="shead"><span class="sico"><svg viewBox="0 0 24 24">${ICONS[f.icon] || ICONS.clock}</svg></span><h3></h3></div>`;
        card.querySelector('h3').textContent = f.label;
        if (f.type === 'number') {
            const inp = document.createElement('input'); inp.type = 'number'; inp.min = f.min; inp.max = f.max; inp.value = v[f.key]; inp.className = 'snum';
            inp.oninput = () => { G.draft[f.key] = inp.value; }; inp.onblur = () => { G.draft = CDSettings.sanitize(G.draft); inp.value = G.draft[f.key]; };
            card.appendChild(inp);
        } else {
            const row = document.createElement('div'); row.className = 'spills'; row.style.gridTemplateColumns = `repeat(${f.options.length},1fr)`;
            f.options.forEach(([val, txt]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'spill' + (v[f.key] === val ? ' on' : ''); b.textContent = txt; b.onclick = () => { G.draft[f.key] = val; renderSettings(); }; row.appendChild(b); });
            card.appendChild(row);
        }
        const desc = f.descs ? f.descs[v[f.key]] : f.desc;
        if (desc) { const p = document.createElement('p'); p.className = 'sdesc'; p.textContent = desc; card.appendChild(p); }
        grid.appendChild(card);
    });
}
function openSettings() { G.draft = Object.assign({}, G.settings); renderSettings(); $('#settings').classList.add('in'); }
function saveSettings() {
    G.settings = CDSettings.save(G.draft); $('#settings').classList.remove('in');
    if (G.players.length > G.settings.maxPlayers) { G.players = G.players.slice(0, G.settings.maxPlayers); G.scene.setPlayers(G.players); }
    addPlayer.warned = false; renderLobby();
}

// ---------- شات تيك توك الحقيقي (لو اللعبة محمّلة داخل المنصة مع AGP): «دخول» للانضمام، والباقي إجابات
function hookStream() {
    const A = window.AymanGamesPlatform || window.AGP; if (!A || !A.events || typeof A.events.on !== 'function') return;
    A.events.on('stream:commentReceived', pl => { if (!pl || !pl.id || typeof pl.text !== 'string') return; const id = 'tiktok:' + (pl.username || pl.uniqueId || pl.id), name = pl.nickname || pl.name || pl.username || 'راعي';
        if (/^\s*(دخول|join)\s*$/i.test(pl.text)) { if (G.settings.who === 'followers' && !pl.isFollower) return; addPlayer(id, name); } else answer(id, pl.text); });
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
        else if (e === 'pop') SFX.bang();
        else if (e === 'shot') { // ستارة السينما + تدرّج الألوان حسب اللقطة
            if (d !== 'povA' && d !== 'povB') $('#lids').classList.remove('on');
            if (d === 'povA' || d === 'povB') { bars(''); grade('pov'); const L = $('#lids'); L.classList.remove('on'); L.style.setProperty('--lid', (dur || 2.4) + 's'); void L.offsetWidth; L.classList.add('on'); }
            else if (d === 'bullet') { bars('tight'); grade('slow'); SFX.whoosh(); }
            else if (d === 'boots' || d === 'draw' || d === 'fall') { bars('wide'); grade('duel'); }
            else if (d === 'hero' || d === 'heroAll') { bars('wide'); grade('hero'); }
            else if (d === 'leave') { bars('wide'); grade(''); SFX.whoosh(); }
            else if (d === 'crane' || d === 'profile' || d === 'standoff') { bars('wide'); grade(''); }
        } } }); } catch (e) { console.error(e); }
    if (!scene) { $('#fallback').hidden = false; return; }
    G.scene = scene; G.phase = 'lobby';
    for (let i = 0; i < 8; i++) addBot();
    $('#loading').classList.add('hide');
    $('#startBtn').onclick = startMatch; $('#addBot').onclick = addBot; $('#againBtn').onclick = newGame;
    $('#setBtn').onclick = openSettings; $('#setSave').onclick = saveSettings; $('#setClose').onclick = () => $('#settings').classList.remove('in');
    // لوحة التجربة: اكتب بدال أي راعي من أول مبارزة نشطة
    const send = (slot, inp) => { const d = G.active && (G.active.find(x => !x.done) || G.active[0]), p = d && (slot ? d.b : d.a); if (!p || !inp.value.trim()) return; answer(p.id, inp.value.trim()); inp.value = ''; };
    [['#inA', 0], ['#inB', 1]].forEach(([s, i]) => { const inp = $(s); inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(i, inp); }); inp.nextElementSibling.onclick = () => send(i, inp); });
    $('#botsTgl').onchange = e => { G.bots = e.target.checked; };
    $('#demoToggle').onclick = () => $('#demo').classList.toggle('open');
    hookStream(); renderLobby();
    openSettings(); // الإعدادات أول شي، بعدها اللوبي
    window.__duel = G; // للاختبار
})();
