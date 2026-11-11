// «مواجهة الغرب» — منطق اللعبة (نموذج أولي).
// كل جولة: يُختار راعيين عشوائياً ← مشهد دخول سينمائي ← لوحة معلّقة تنزل برقم عشوائي 10–99
// ← أول واحد منهم يكتب الرقم بالشات يسحب ويطلق ← الثاني يطيح ويُقصى ← الدور ينتقل لاثنين غيرهم… لين يبقى بطل واحد.
// المشهد الثري دي (duel3d.js) عرض فقط: هنا القواعد والمؤقتات والشات والنقاط.
import { mountDuel } from './duel3d.js';

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const BOT_NAMES = ['أبو فهد', 'سعود', 'نورة', 'ريم', 'خالد', 'مشاري', 'جود', 'تركي', 'لمى', 'فيصل', 'هيا', 'بندر', 'العنود', 'ذيب', 'مها', 'راكان'];
const ANSWER_MS = 15000;          // ما أحد كتب الرقم = رقم جديد
const JAM_MS = 1200;              // رقم غلط = المسدس يعلّق شوي

const G = { players: [], alive: [], duels: {}, phase: 'loading', pair: null, number: 0, revealAt: 0, jam: {}, timers: [], round: 0, startedAt: 0, scene: null, bots: true };

// ---------- الصوت (WebAudio مولّد بالكود — بدون ملفات)
const SFX = (() => {
    let ac = null, echo = null, windG = null;
    function ctx() { if (ac) return ac; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
        // صدى الوادي للطلقة
        const d = ac.createDelay(1); d.delayTime.value = .32; const fb = ac.createGain(); fb.gain.value = .38; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(ac.destination); echo = d; return ac; }
    function noise(sec) { const a = ctx(), b = a.createBuffer(1, a.sampleRate * sec, a.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; }
    return {
        unlock() { const a = ctx(); a && a.state === 'suspended' && a.resume(); },
        bang() { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(.7), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + .5); g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .55); n.connect(f); f.connect(g); g.connect(a.destination); g.connect(echo); n.start(t);
            const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + .25); og.gain.setValueAtTime(.9, t); og.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + .3); },
        bell() { const a = ctx(); if (!a) return; const t = a.currentTime; [[620, .35], [620 * 2.76, .16], [620 * 5.4, .08], [310, .2]].forEach(([fq, v]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = fq; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + 2.4); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 2.4); }); },
        tick() { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 1800; g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .04); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .05); },
        thud() { const a = ctx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + .3); g.gain.setValueAtTime(.7, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .35); },
        whoosh() { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(1.6), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1600, t + 1.5); g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.35, t + .8); g.gain.exponentialRampToValueAtTime(.001, t + 1.6); n.connect(f); f.connect(g); g.connect(a.destination); n.start(t); },
        wind(on) { const a = ctx(); if (!a) return; if (!windG) { const n = noise(4); n.loop = true; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .7; windG = a.createGain(); windG.gain.value = 0; n.connect(f); f.connect(windG); windG.connect(a.destination); n.start(); }
            windG.gain.setTargetAtTime(on ? .09 : .025, a.currentTime, .8); }
    };
})();

// ---------- واجهة: شات، لافتات، ملصقات مطلوب، ستارة سينما، انتقالات
function chat(name, text, kind = '') {
    const box = $('#chat'), el = document.createElement('div'); el.className = 'msg ' + kind;
    el.innerHTML = `<b></b><span></span>`; el.querySelector('b').textContent = name; el.querySelector('span').textContent = text;
    box.appendChild(el); while (box.children.length > 7) box.firstChild.remove();
    setTimeout(() => el.classList.add('old'), 6000);
}
function bars(mode) { document.body.dataset.bars = mode || ''; }
function grade(mode) { document.body.dataset.grade = mode || ''; }
async function flash(color = '#fff', ms = 160) { const f = $('#flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = 1; await sleep(30); f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }
// انتقال «القزحية» الكلاسيكي حق أفلام الغرب القديمة: دايرة تنغلق على البطل ثم تنفتح على المشهد الجاي
function iris(closing, ms = 700, cx = 50, cy = 50) { const el = $('#iris'); return new Promise(res => { const t0 = performance.now(), max = 120;
    const step = now => { const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, r = closing ? max * (1 - e) : max * e;
        el.style.background = `radial-gradient(circle at ${cx}% ${cy}%, transparent ${r}vmax, #0d0704 ${r + .3}vmax)`; if (k < 1) requestAnimationFrame(step); else { if (!closing) el.style.background = 'transparent'; res(); } };
    requestAnimationFrame(step); }); }
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
    $('#startBtn').disabled = G.players.length < 2; updateCount();
}

// ---------- اللاعبين
function addPlayer(id, name, bot = false) {
    if (G.phase !== 'lobby' || G.players.some(p => p.id === id) || G.players.length >= 16) return;
    G.players.push({ id, name, bot }); G.scene && G.scene.setPlayers(G.players); renderLobby();
    chat(name, 'دخل السوق 🤠', 'sys');
}
function addBot() { const used = new Set(G.players.map(p => p.name)), name = BOT_NAMES.find(n => !used.has(n)) || ('راعي ' + (G.players.length + 1)); addPlayer('bot:' + name, name, true); }

// ---------- الجولات
function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
function later(ms, fn) { G.timers.push(setTimeout(fn, ms)); }
function nextPair() {
    // الأقل مواجهات أولاً (عشان كل واحد ياخذ دوره)، وبعدين عشوائي
    const pool = G.alive.slice().sort((a, b) => (G.duels[a.id] || 0) - (G.duels[b.id] || 0) || Math.random() - .5);
    const a = pool[0], rest = pool.slice(1).sort(() => Math.random() - .5); return [a, rest[0]].sort(() => Math.random() - .5);
}
async function startMatch() {
    if (G.players.length < 2) return; SFX.unlock(); SFX.wind(false);
    G.alive = G.players.slice(); G.duels = {}; G.round = 0; G.startedAt = Date.now();
    $('#lobby').classList.add('hide'); G.phase = 'intro'; updateCount();
    await iris(true, 600); await sleep(150); await iris(false, 600);
    runRound();
}
async function runRound() {
    G.round++; const [a, b] = nextPair(); G.pair = [a, b]; G.duels[a.id] = (G.duels[a.id] || 0) + 1; G.duels[b.id] = (G.duels[b.id] || 0) + 1; G.jam = {};
    G.phase = 'intro'; updateCount(); $('#demoA').textContent = a.name; $('#demoB').textContent = b.name;
    banner(`<small>المواجهة ${G.round}</small>${esc(a.name)} <i>ضد</i> ${esc(b.name)}`, 2600);
    poster('a', a); poster('b', b); bars('wide'); SFX.wind(true);
    const short = G.round > 1 && Math.random() < .65;
    const ok = await G.scene.duelIntro(a.id, b.id, { short });
    if (!ok || G.phase !== 'intro') return;
    G.scene.standoff(); bars('wide'); grade('');
    G.phase = 'standoff'; warnThenReveal();
}
// تنبيه ← تنبيه ← «لا ترمش» ← «ارسم!» ← الرقم (توقيت آخر خطوة عشوائي عشان ما أحد يحفظ الإيقاع)
function warnThenReveal(again) {
    const lines = again ? ['ولا أحد سحب… الرقم الجاي لا يفوتك!', pickOne(WARN[2])] : WARN.map(pickOne);
    lines.forEach((l, i) => later(i * 1700, () => { sign('ready', null, l); SFX.tick(); }));
    const t = lines.length * 1700 + rnd(200, 1400);
    later(t, () => { sign('draw'); SFX.tick(); flash('rgba(255,180,90,.35)', 200); });
    later(t + 750, reveal);
}
function reveal() {
    G.number = Math.floor(rnd(10, 100)); G.revealAt = performance.now(); G.phase = 'armed';
    sign('show', G.number); SFX.bell(); flash('rgba(255,220,150,.55)', 260);
    chat('🔔', `الرقم ${G.number} — اكتبه بسرعة!`, 'sys');
    // البوتات (وضع التجربة): كل واحد يكتب بعد زمن عشوائي، وأحياناً يغلط أول
    if (G.bots) G.pair.forEach(p => { if (!p.bot) return; const d = rnd(900, 3600);
        if (Math.random() < .25) later(d * .6, () => answer(p.id, String(G.number + (Math.random() < .5 ? 1 : -1) * Math.ceil(rnd(1, 9)))));
        later(d, () => answer(p.id, String(G.number))); });
    later(ANSWER_MS, () => { if (G.phase !== 'armed') return; chat('🌵', 'ولا أحد سحب! رقم جديد…', 'sys'); G.phase = 'standoff'; warnThenReveal(true); });
}
function toDigits(s) { return String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, ''); }
function answer(id, text) {
    const p = G.players.find(x => x.id === id); if (!p) return;
    chat(p.name, text);
    if (G.phase !== 'armed' || !G.pair || !G.pair.some(x => x.id === id)) return;
    if (G.jam[id] && performance.now() < G.jam[id]) return;
    const n = toDigits(text); if (!n) return;
    if (+n !== G.number) { G.jam[id] = performance.now() + JAM_MS; chat('❌', `${p.name} غلط — المسدس علّق!`, 'bad'); return; }
    resolve(p);
}
async function resolve(shooter) {
    G.phase = 'resolve'; clearTimers();
    const target = G.pair.find(x => x.id !== shooter.id), secs = ((performance.now() - G.revealAt) / 1000).toFixed(2);
    sign('gone'); grade('duel');
    await G.scene.fire(shooter.id, target.id);
    $('#poster-' + (G.pair[0] === target ? 'a' : 'b')).classList.add('dead');
    banner(`🔫 <b>${esc(shooter.name)}</b> أسقط ${esc(target.name)}<small>سحب بـ ${secs} ث</small>`, 3200);
    await sleep(900);
    // انتقال القزحية على البطل ثم رجعة للسوق
    await iris(true, 800, 50, 48);
    G.alive = G.alive.filter(x => x.id !== target.id);
    G.scene.removePlayer(target.id); G.scene.returnToCrowd(shooter.id); G.scene.lobby();
    poster('a'); poster('b'); bars(''); grade(''); SFX.wind(false); updateCount();
    await sleep(250); await iris(false, 800);
    if (G.alive.length <= 1) return crown(G.alive[0] || shooter);
    G.phase = 'between'; await sleep(1600); runRound();
}
async function crown(p) {
    G.phase = 'champ'; G.scene.champion(p.id); bars('wide');
    $('#champName').textContent = p.name; $('#champ').classList.add('in'); SFX.bell();
    // نقاط المنصة (قاعدة إلزامية لكل لعبة) — بدون أثر بصفحة التجربة لأن ما فيه حساب
    try { if (window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') window.AGPAuth.reportMatchPoints({ players: G.players.map(x => ({ id: x.id, name: x.name })), winnerIds: [p.id], teamGame: false, durationMs: Date.now() - G.startedAt }); } catch (e) { }
}
async function newGame() {
    $('#champ').classList.remove('in'); await iris(true, 600);
    G.phase = 'lobby'; G.players = G.players.slice(); G.scene.setPlayers([]); G.scene.lobby(); bars(''); G.scene.setPlayers(G.players);
    $('#lobby').classList.remove('hide'); renderLobby(); await iris(false, 600);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- شات تيك توك الحقيقي (لو اللعبة محمّلة داخل المنصة مع AGP): «دخول» للانضمام، والأرقام للمواجهة
function hookStream() {
    const A = window.AymanGamesPlatform || window.AGP; if (!A || !A.events || typeof A.events.on !== 'function') return;
    A.events.on('stream:commentReceived', pl => { if (!pl || !pl.id || typeof pl.text !== 'string') return; const id = 'tiktok:' + (pl.username || pl.uniqueId || pl.id), name = pl.nickname || pl.name || pl.username || 'راعي';
        if (/^\s*(دخول|join)\s*$/i.test(pl.text)) addPlayer(id, name); else answer(id, pl.text); });
}

// ---------- تشغيل
(async function boot() {
    let scene = null;
    try { scene = await mountDuel($('#stage'), { onEvent: (e, d) => {
        if (e === 'bang') { SFX.bang(); flash('#fff8e0', 140); }
        else if (e === 'hit') { SFX.thud(); flash('rgba(255,255,255,.7)', 120); }
        else if (e === 'thud') SFX.thud();
        else if (e === 'tick') SFX.tick();
        else if (e === 'pop') SFX.bang();
        else if (e === 'shot') { // ستارة السينما + تدرّج الألوان حسب اللقطة
            if (d === 'eyesA' || d === 'eyesB') { bars('tight'); grade('eyes'); }
            else if (d === 'bullet') { bars('tight'); grade('slow'); SFX.whoosh(); }
            else if (d === 'hand' || d === 'clock' || d === 'overB' || d === 'boots') { bars('wide'); grade('duel'); }
            else if (d === 'draw' || d === 'fall') { bars('wide'); grade('duel'); }
            else if (d === 'hero') { bars('wide'); grade('hero'); }
            else if (d === 'crane' || d === 'profile' || d === 'standoff') { bars('wide'); grade(''); }
        } } }); } catch (e) { console.error(e); }
    if (!scene) { $('#fallback').hidden = false; return; }
    G.scene = scene; G.phase = 'lobby';
    for (let i = 0; i < 8; i++) addBot();
    $('#loading').classList.add('hide');
    $('#startBtn').onclick = startMatch; $('#addBot').onclick = addBot; $('#againBtn').onclick = newGame;
    // لوحة التجربة: اكتب الرقم بدال أي راعي من الاثنين
    const send = (slot, inp) => { const p = G.pair && G.pair[slot]; if (!p || !inp.value.trim()) return; answer(p.id, inp.value.trim()); inp.value = ''; };
    [['#inA', 0], ['#inB', 1]].forEach(([s, i]) => { const inp = $(s); inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(i, inp); }); inp.nextElementSibling.onclick = () => send(i, inp); });
    $('#botsTgl').onchange = e => { G.bots = e.target.checked; };
    $('#demoToggle').onclick = () => $('#demo').classList.toggle('open');
    hookStream();
    window.__duel = G; // للاختبار
})();
