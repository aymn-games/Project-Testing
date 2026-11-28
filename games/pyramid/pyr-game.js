// «الهرم» — منطق اللعبة (القواعد، المؤقت، الشات، القرعة العشوائية، النقاط). المشهد pyr3d.js عرض فقط.
//
// الجولة (المرحلة):
//   1) صف دوائر بعدد اللاعبين الباقين، مرقّمة 1..N. كل لاعب يكتب رقم دائرة فاضية بالشات
//      (يقدر يغيّره لين يخلص الوقت؛ الرقم المحجوز ما ينقبل).
//   2) انتهاء الوقت: اللي اختاروا يمشون لدوائرهم، واللي ما اختاروا يُقصون مباشرة.
//   3) إقصاء لاعب عشوائي واحد من اللي بقوا (Math.random هنا بملف اللعبة فقط).
//   4) صف جديد بعدد الناجين، وتتكرر لين يبقى لاعب واحد = البطل على القمة.
//   حالات خاصة: ما أحد اختار = تُعاد نفس المرحلة بدون إقصاء. بقي واحد بعد إقصاء من لم يختر = يفوز مباشرة.
// إعداد «جودة الرسومات» يروح للمشهد بس — ما يأثر على أي قاعدة أو توقيت أو نتيجة.
import { mountPyramid, colorOf } from './pyr3d.js';

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BOT_NAMES = ['أبو فهد', 'سعود', 'نورة', 'ريم', 'خالد', 'مشاري', 'جود', 'تركي', 'لمى', 'فيصل', 'هيا', 'بندر', 'العنود', 'ذيب', 'مها', 'راكان', 'سارة', 'عبدالله', 'غلا', 'نواف', 'شهد', 'يزيد', 'رهف', 'سلطان', 'دانة', 'ماجد', 'لين', 'عمر', 'جنى', 'حمد', 'روان', 'بدر', 'ليان', 'منصور', 'أسيل', 'وليد', 'ديما', 'عزام', 'تالا', 'فارس', 'وعد', 'زياد', 'هتان', 'رزان', 'مشعل', 'جوري', 'أنس', 'ريما', 'طلال', 'سديم', 'هشام', 'بشاير', 'عادل', 'ميار', 'ناصر', 'شوق', 'إياد', 'لولوة', 'معاذ', 'غدير', 'حسام', 'نوف', 'ثامر', 'مرام'];

const G = { players: [], alive: [], phase: 'loading', round: 0, picks: new Map(), taken: new Map(), timers: [], startedAt: 0, scene: null, bots: false, settings: PYSettings.load(), champ: null, pts: null, endAt: 0, endNow: null };

// ================================================================ الصوت (WebAudio مولّد بالكود — هوية صوتية واحدة: أجراس زجاجية + نبض إلكتروني ناعم)
const VOL = (() => { const K = 'pyramid:volume'; let v = .8, last = .8;
    try { const x = parseFloat(localStorage.getItem(K)); if (isFinite(x)) v = Math.max(0, Math.min(1, x)); } catch (e) { } if (v > 0) last = v;
    const set = x => { v = Math.round(Math.max(0, Math.min(1, x)) * 10) / 10; if (v > 0) last = v; try { localStorage.setItem(K, String(v)); } catch (e) { } return v; };
    return { get: () => v, set, step: d => set(v + d), toggle: () => set(v > 0 ? 0 : last || .8) }; })();
const SFX = (() => {
    let ac = null, master = null, verb = null, padG = null, unlocked = false; // ما ننشئ الصوت قبل أول ضغطة (سياسة المتصفح)
    const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // خماسي: أي تسلسل يطلع متناغم
    const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12);
    function ctx() {
        if (ac) return ac; if (!unlocked || G.settings.sound === false) return null;
        try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
        // المستوى العام هادي (0.55) حتى ما يغطي صوت المذيع
        master = ac.createGain(); master.gain.value = VOL.get() * .55;
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; master.connect(comp); comp.connect(ac.destination);
        // صدى ساحة بسيط
        const d = ac.createDelay(1); d.delayTime.value = .21; const fb = ac.createGain(); fb.gain.value = .32; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        d.connect(lp); lp.connect(fb); fb.connect(d); const wet = ac.createGain(); wet.gain.value = .5; lp.connect(wet); wet.connect(master); verb = d;
        return ac;
    }
    function noise(sec) { const a = ac, b = a.createBuffer(1, Math.max(1, a.sampleRate * sec), a.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; }
    function tone(f, t, d, { type = 'sine', v = .2, a = .005, wet = .3, to = null } = {}) {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(g); g.connect(master); if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); } o.start(t); o.stop(t + d + .05);
    }
    function bell(f, t, v = .14, d = 1.2) { tone(f, t, d, { v, wet: .5 }); tone(f * 2.76, t, d * .5, { v: v * .35, wet: .4 }); tone(f * 5.4, t, d * .25, { v: v * .12, wet: .3 }); }
    function hit(t, f = 120, v = .5, d = .35) { tone(f, t, d, { v, to: f * .35, wet: .2 }); }
    function swish(t, d = .6, f0 = 400, f1 = 3000, v = .18) { const n = noise(d), bp = ac.createBiquadFilter(), g = ac.createGain(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + d * .7); g.gain.exponentialRampToValueAtTime(.0001, t + d); n.connect(bp); bp.connect(g); g.connect(master); n.start(t); }
    let pickN = 0, elimV = 0, survV = 0;
    const S = {
        setVolume(v) { if (master) master.gain.setTargetAtTime(v * .55, ac.currentTime, .03); },
        unlock() { unlocked = true; const a = ctx(); a && a.state === 'suspended' && a.resume(); },
        // اختيار رقم: جرس صغير بنغمة من السلم، تتغير مع الرقم ومع كل اختيار (ما يتكرر نفس الصوت)
        pick(num) { const a = ctx(); if (!a) return; const t = a.currentTime, s = SCALE[(num + pickN++) % SCALE.length]; bell(hz(s), t, .07, .7); if (pickN % 3 === 0) bell(hz(s + 7), t + .07, .04, .5); },
        tick(k = 0) { const a = ctx(); if (!a) return; tone(1400 + k * 600, a.currentTime, .05, { type: 'square', v: .035, wet: 0 }); },
        count(n) { const a = ctx(); if (!a) return; const t = a.currentTime; tone(n <= 3 ? 880 : 660, t, .16, { type: 'triangle', v: n <= 3 ? .12 : .07, wet: .2 }); },
        // انتهاء الوقت: ضربة + جرس عميق + نفَس عكسي
        timeUp() { const a = ctx(); if (!a) return; const t = a.currentTime; hit(t, 90, .7, .6); bell(hz(-12), t, .2, 2.2); bell(hz(-5), t + .02, .1, 1.8); swish(t - .01, .5, 3000, 300, .14); },
        // تشويق قبل الإقصاء: لفّة طبل تتسارع + صاعد
        roll(dur = 3) { const a = ctx(); if (!a) return; const t0 = a.currentTime; let t = t0, i = 0; while (t < t0 + dur) { const n = noise(.05), hp = ac.createBiquadFilter(), g = ac.createGain(); hp.type = 'bandpass'; hp.frequency.value = 900; g.gain.setValueAtTime(.05 + (t - t0) / dur * .12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .05); n.connect(hp); hp.connect(g); g.connect(master); n.start(t); t += Math.max(.035, .12 - (t - t0) / dur * .09); i++; }
            tone(110, t0, dur, { type: 'sawtooth', v: .03, to: 220, wet: .1 }); },
        suspense() { const a = ctx(); if (!a) return; const t = a.currentTime; [0, .5].forEach(dt => tone(55, t + dt, .45, { v: .25, wet: .1 })); tone(hz(-24 + 3), t, 1.1, { type: 'triangle', v: .06, wet: .4 }); },
        // الإقصاء: ثلاث نسخ تتناوب (هبوط + ضربة / زجاج ينكسر / صفّارة رقمية)
        elim(kind) { const a = ctx(); if (!a) return; const t = a.currentTime, v = elimV++ % 3;
            if (v === 0) { tone(600, t, .7, { type: 'sawtooth', v: .07, to: 90, wet: .3 }); hit(t + .5, 80, .55, .5); }
            else if (v === 1) { swish(t, .25, 5000, 2000, .12); for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 3000, t + i * .03, .25, { v: .03, wet: .5 }); hit(t, 70, .5, .45); }
            else { [0, .12, .24].forEach((dt, i) => tone(440 - i * 90, t + dt, .14, { type: 'square', v: .05, wet: .2 })); hit(t + .3, 60, .5, .5); }
            if (kind === 'random') bell(hz(-17), t + .05, .12, 2); },
        // فحيح الحيّة: ضجيج عالي النبرة يكبر ويصغر مع رجفة خفيفة
        hiss(d = 1.2) { const a = ctx(); if (!a) return; const t = a.currentTime, n = noise(d), hp = ac.createBiquadFilter(), bp = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
            hp.type = 'highpass'; hp.frequency.value = 3200; bp.type = 'bandpass'; bp.frequency.value = 6200; bp.Q.value = .9; lfo.frequency.value = 11; lg.gain.value = .025; lfo.connect(lg); lg.connect(g.gain);
            g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + d * .35); g.gain.exponentialRampToValueAtTime(.0001, t + d); n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master); n.start(t); lfo.start(t); lfo.stop(t + d); },
        bite() { const a = ctx(); if (!a) return; const t = a.currentTime; swish(t, .12, 2000, 6000, .12); hit(t + .04, 140, .5, .25); tone(900, t + .02, .2, { type: 'square', v: .04, to: 200, wet: .3 }); },
        fall() { const a = ctx(); if (!a) return; swish(a.currentTime, .9, 1800, 200, .08); },
        // النجاة: أربع جمل لحنية تتناوب
        survive() { const a = ctx(); if (!a) return; const t = a.currentTime, set = [[0, 4, 7, 12], [2, 7, 9, 14], [4, 7, 12, 16], [0, 7, 12, 19]][survV++ % 4]; set.forEach((s, i) => bell(hz(s), t + i * .09, .09, 1.2)); swish(t, .8, 300, 6000, .05); },
        // بناء الصف: نقرات تطلع بالنغمة
        build(k) { const a = ctx(); if (!a) return; bell(hz(SCALE[Math.min(SCALE.length - 1, Math.floor(k * SCALE.length))] - 12), a.currentTime, .06, .5); },
        rise() { const a = ctx(); if (!a) return; const t = a.currentTime; tone(70, t, .9, { type: 'sawtooth', v: .05, to: 140, wet: .2 }); swish(t, .9, 200, 1200, .06); },
        intro() { const a = ctx(); if (!a) return; const t = a.currentTime; [0, 7, 12, 16, 19].forEach((s, i) => bell(hz(s - 12), t + i * .16, .08, 1.6)); tone(hz(-24), t, 2.4, { type: 'triangle', v: .06, wet: .5 }); },
        join() { const a = ctx(); if (!a) return; const t = a.currentTime; bell(hz(SCALE[(Math.random() * 6) | 0] + 12), t, .05, .4); },
        stage() { const a = ctx(); if (!a) return; const t = a.currentTime; [0, 4, 7].forEach((s, i) => tone(hz(s - 12), t + i * .07, .5, { type: 'triangle', v: .07, wet: .4 })); },
        firework() { const a = ctx(); if (!a) return; const t = a.currentTime + Math.random() * .1, n = noise(.6), lp = ac.createBiquadFilter(), g = ac.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1800; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .6); n.connect(lp); lp.connect(g); g.connect(master); g.connect(verb); n.start(t); },
        // الفوز: نفخة صاعدة + هتاف
        victory() { const a = ctx(); if (!a) return; const t = a.currentTime; [0, 4, 7, 12, 16].forEach((s, i) => { tone(hz(s - 12), t + i * .1, 1.6 - i * .1, { type: 'sawtooth', v: .045, wet: .4 }); bell(hz(s), t + i * .1, .07, 1.4); });
            const n = noise(2.4), bp = ac.createBiquadFilter(), g = ac.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = .5; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .4); g.gain.exponentialRampToValueAtTime(.0001, t + 2.4); n.connect(bp); bp.connect(g); g.connect(master); n.start(t); },
        // خلفية هادئة جداً (هدير جمهور بعيد + وتر منخفض) — أخفض من أي مؤثر
        ambient(on) { const a = ctx(); if (!a) return; if (on && !padG) { padG = a.createGain(); padG.gain.value = 0; padG.connect(master); const n = noise(4); n.loop = true; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = .4; n.connect(bp); bp.connect(padG); n.start(); [hz(-24), hz(-17)].forEach(f => { const o = a.createOscillator(), og = a.createGain(); o.frequency.value = f; og.gain.value = .25; o.connect(og); og.connect(padG); o.start(); }); }
            if (padG) padG.gain.setTargetAtTime(on ? .035 : 0, a.currentTime, .8); },
    };
    return S;
})();

// ================================================================ واجهة
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function uiZoom() { const w = innerWidth, h = innerHeight, z = w / h < 1 ? Math.min(w / 430, h / 932) : Math.min(w / 1280, h / 720); return Math.max(.6, Math.min(2.6, z)); }
function applyZoom() { document.documentElement.style.setProperty('--z', uiZoom().toFixed(3)); }
applyZoom(); addEventListener('resize', applyZoom);
function notice(text) { const el = $('#notice'); el.textContent = text; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); clearTimeout(notice.t); notice.t = setTimeout(() => el.classList.remove('in'), 2200); }
// النص بإخراج متحرك: العنوان كلمة كلمة (والأرقام كبيرة)، والعبارات الثانوية متفرقة يمين/يسار بتوقيت متتابع
function banner(t, s = '', cls = '', ms = 2200) {
    const el = $('#banner'); el.className = cls; el.innerHTML = ''; clearTimeout(banner.t); clearTimeout(banner.t2);
    const line = document.createElement('div'); line.className = 'kl'; let d = 0;
    String(t).split(/\s+/).filter(Boolean).forEach(w => { const sp = document.createElement('span'); sp.className = 'kw' + (/^[\d٠-٩]+!?$/.test(w) ? ' kn' : ''); sp.textContent = w; sp.style.animationDelay = d + 'ms'; d += 150; line.appendChild(sp); });
    el.appendChild(line);
    String(s || '').split(/\s*[·،]\s*/).filter(Boolean).forEach((ph, i) => { const row = document.createElement('div'); row.className = 'kl ' + (i % 2 ? 'l' : 'r'); const sp = document.createElement('span'); sp.className = 'ks'; sp.textContent = ph; sp.style.animationDelay = (d + 180 + i * 280) + 'ms'; row.appendChild(sp); el.appendChild(row); });
    return new Promise(res => { banner.t = setTimeout(() => { el.classList.add('out'); banner.t2 = setTimeout(() => { el.innerHTML = ''; res(); }, 420); }, ms + Math.min(900, d)); });
}
async function flash(color = '#fff', ms = 200) { const f = $('#flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = .55; await sleep(30); f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }
function fx(k, ms = 1200) { document.body.dataset.fx = k; clearTimeout(fx.t); if (ms) fx.t = setTimeout(() => { document.body.dataset.fx = ''; }, ms); }
const initial = p => [...String(p.name).replace(/^أبو\s*/, '')][0] || '؟';
function avatarHtml(p, cls = '') { const c = colorOf(p.id); return p.avatar ? `<img class="av ${cls}" src="${esc(p.avatar)}" alt="" style="border-color:${c}" onerror="this.outerHTML='<span class=\\'av ${cls}\\' style=\\'border-color:${c}\\'>${esc(initial(p))}</span>'">` : `<span class="av ${cls}" style="border-color:${c};background:${c}33">${esc(initial(p))}</span>`; }
function updateCount() { const lobby = G.phase === 'lobby'; $('#count').textContent = lobby ? G.players.length : G.alive.length; $('#countLbl').textContent = lobby ? 'بالساحة' : 'باقين'; }
function pill(state) { $('#rRound').textContent = 'المرحلة ' + G.round; $('#rLeft').textContent = G.alive.length; if (state) $('#rState').textContent = state; updateCount(); }

// ---------- فقاعات الأسماء (مرسومة على الشاشة نفسها: حجمها ثابت ومقروء مهما بعدت الكاميرا)
// اختيار رقم: فقاعة «الاسم ← الرقم» فوق الدائرة وتختفي بعد ثانيتين. من لم يختر: فقاعة حمراء فوق راسه لين يطيح.
const BUB = new Map();
function bubble(key, o) {
    dropBubble(key, true);
    const el = document.createElement('div'), p = o.p, c = o.out ? '#e9906f' : colorOf(p.id), slot = BUB.size % 3;
    el.className = 'bub' + (o.out ? ' out' : ''); el.style.setProperty('--k', c); el.style.setProperty('--h', (o.out ? 18 + slot * 34 : 34 + slot * 38) + 'px');
    el.innerHTML = `<div class="c">${avatarHtml(p, 'sm')}<b class="n"></b>${o.num != null ? `<span class="ar">←</span><b class="num">${o.num}</b>` : ''}</div><i></i>`;
    el.querySelector('.n').textContent = p.name; $('#bubbles').appendChild(el);
    BUB.set(key, { el, id: p.id, num: o.num, until: o.ms ? performance.now() + o.ms : 0 });
}
function dropBubble(key, now) { const b = BUB.get(key); if (!b) return; BUB.delete(key); if (now) b.el.remove(); else { b.el.classList.add('gone'); setTimeout(() => b.el.remove(), 450); } }
function clearBubbles(prefix) { for (const k of [...BUB.keys()]) if (!prefix || k.startsWith(prefix)) dropBubble(k); }
(function bubLoop() {
    requestAnimationFrame(bubLoop); if (!G.scene || !BUB.size) return; const t = performance.now();
    for (const [k, b] of BUB) {
        if (b.until && t > b.until) { dropBubble(k); continue; }
        const q = b.num != null ? G.scene.circleScreen(b.num) : G.scene.headScreen(b.id);
        if (!q) { b.el.style.visibility = 'hidden'; continue; }
        b.el.style.visibility = ''; b.el.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
})();

// ---------- اللوبي (نفس بلدة الكاوبوي/روليت الإقصاء: بطاقة إطار لمن عنده + كبسولة صورة واسم + زر إقصاء)
const KICK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
const FRAME_W_RATIO = 4.96, X_SIZE = 24;
const PCard = () => window.AymanGamesPlatform && window.AymanGamesPlatform.playerCard;
const hasFrame = p => !!(PCard() && p.frame && p.frame.imageFilename);
const kickBtn = p => `<button class="kick" type="button" data-kick="${esc(p.id)}" aria-label="إقصاء ${esc(p.name)}">${KICK_SVG}</button>`;
function lobbyCard(p) { if (hasFrame(p)) return `<div class="lcell"><div class="fw" data-fid="${esc(p.id)}"></div></div>`; return `<div class="lcell"><div class="pl">${avatarHtml(p)}<span class="ln">${esc(p.name)}</span>${kickBtn(p)}</div></div>`; }
function fillFramed(list) {
    list.querySelectorAll('.fw[data-fid]').forEach(box => {
        const p = G.players.find(x => String(x.id) === box.dataset.fid), w = Math.floor(box.clientWidth); if (!p || !w) return;
        box.innerHTML = PCard().renderHtml({ id: p.id, name: p.name, avatarUrl: p.avatar || null, frame: p.frame }, { showFrame: true, basePath: '../../', size: Math.max(20, Math.floor(w / FRAME_W_RATIO)) }) + kickBtn(p);
        const plate = box.querySelector('[data-agp-pcard-name="1"]'), x = box.querySelector('.kick');
        if (plate) { plate.style.width = `calc(${plate.style.width} - ${X_SIZE}px)`; const b = box.getBoundingClientRect(), r = plate.getBoundingClientRect(); x.style.left = Math.round(r.right - b.left) + 'px'; x.style.top = Math.round(r.top - b.top + r.height / 2 - X_SIZE / 2) + 'px'; }
    });
    PCard() && PCard().fitAllNames && PCard().fitAllNames(list);
}
function showLobby(on) { $('#lobby').classList.toggle('hide', !on); document.body.classList.toggle('inlobby', !!on); }
function renderLobby() {
    const list = $('#roster'), framed = G.players.some(hasFrame), narrow = innerWidth < 720;
    list.style.setProperty('--cols', narrow ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))'); list.style.setProperty('--rowH', framed ? '78px' : '54px');
    list.innerHTML = G.players.length ? G.players.map(lobbyCard).join('') : '<div class="lempty">بانتظار انضمام اللاعبين…</div>';
    if (framed) fillFramed(list);
    $('#lobbyCount').textContent = G.players.length; $('#lobbyMax').textContent = G.settings.maxPlayers;
    $('#startBtn').disabled = G.players.length < 2; updateCount();
}
let syncT = 0;
function syncScene() { clearTimeout(syncT); syncT = setTimeout(() => G.scene && G.phase === 'lobby' && G.scene.setPlayers(G.players), 60); }
function addPlayer(id, name, bot = false, avatar = null, frame = null, winCard = null, character = null) {
    if (G.phase !== 'lobby' || G.players.some(p => p.id === id)) return;
    if (G.players.length >= G.settings.maxPlayers) { if (!addPlayer.warned) { addPlayer.warned = true; notice(`🚫 الساحة ممتلئة (${G.settings.maxPlayers} لاعب)`); } return; }
    G.players.push({ id, name, bot, avatar, frame, winCard, character });
    try { const W = window.AymanGamesPlatform && window.AymanGamesPlatform.winCard; if (W && winCard) W.preloadFor({ name, avatarUrl: avatar, winCard }); } catch (e) { }
    syncScene(); renderLobby();
}
function kickPlayer(id) { if (G.phase !== 'lobby') return; G.players = G.players.filter(p => String(p.id) !== String(id)); syncScene(); renderLobby(); }
function addBot() { const used = new Set(G.players.map(p => p.name)), name = BOT_NAMES.find(n => !used.has(n)) || ('لاعب ' + (G.players.length + 1)); addPlayer('bot:' + name, name, true); }
function fillBots(n) { G.players = G.players.filter(p => !p.bot); while (G.players.length < n && G.players.length < G.settings.maxPlayers) addBot(); syncScene(); renderLobby(); }

// ---------- الشرح قبل البداية
function renderRules() {
    $('#rulesList').innerHTML = [
        `كل مرحلة فيها <b>دوائر بعدد اللاعبين</b> ومرقّمة. اكتب <b>رقم دائرة فاضية</b> بالشات قبل نهاية الوقت (${G.settings.pickTime} ثانية).`,
        'تقدر <b>تغيّر رقمك</b> قبل نهاية الوقت، والرقم المحجوز لغيرك ما ينقبل.',
        'مع نهاية الوقت: شخصيتك تمشي لدائرتك، و<b>من لم يختر يُقصى</b> مباشرة.',
        `بعدها <b>${(+G.settings.snakes || 1) > 1 ? (+G.settings.snakes) + ' حيّات مميتة' : 'حيّة مميتة'}</b> تسكن تحت ${(+G.settings.snakes || 1) > 1 ? 'أرقام' : 'أحد الأرقام'} عشوائياً، وتلدغ أصحابها ويُقصون مع بعض. والناجين يطلعون لصف أصغر أعلى الهرم.`,
        'آخر لاعب يبقى يوصل <b>القمة</b> ويفوز.'
    ].map(t => `<div class="rrow">${t}</div>`).join('');
    $('#rulesCount').textContent = `${G.players.length} لاعب جاهز`;
}
function openRules() { if (G.players.length < 2) return; SFX.unlock(); renderRules(); $('#rules').classList.add('in'); }

// ================================================================ قواعد اللعبة
const toDigits = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
function parseNum(text) { const m = toDigits(text).trim().match(/^#?\s*(\d{1,2})\s*$/); return m ? +m[1] : null; }
function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
const later = (ms, fn) => G.timers.push(setTimeout(fn, ms));
const byId = id => G.alive.find(p => String(p.id) === String(id));

async function startMatch() {
    $('#rules').classList.remove('in'); showLobby(false); SFX.unlock();
    G.alive = G.players.slice(); G.round = 0; G.startedAt = Date.now(); G.phase = 'intro';
    document.body.classList.add('match'); updateCount();
    // اللاعبين بالساحة قبل البداية (لو أحد انضاف آخر لحظة)
    G.scene.setPlayers(G.alive); await sleep(300);
    banner(`${G.alive.length} لاعب`, 'على أرض الهرم · واحد بس يوصل القمة', '', 3000);
    await G.scene.startMatch(G.alive.length, { short: G.settings.intro === 'short' });
    playRound();
}
async function playRound() {
    G.round++; G.picks = new Map(); G.taken = new Map(); const n = G.alive.length;
    pill('اختيار الأرقام'); SFX.stage();
    await banner('المرحلة ' + G.round, `${n} دائرة · اكتب رقمك بالشات`, '', 1500);
    banner('ابدأوا', 'اختاروا أرقامكم · اكتب رقم دائرة فاضية بالشات', '', 1700);
    G.phase = 'pick'; document.body.classList.add('picking'); $('#hTotal').textContent = n; $('#hPicked').textContent = 0;
    G.scene.choosing(true, G.round);
    // المؤقت (وقت حقيقي — ما يتأثر بسرعة الرسم)
    const ms = G.settings.pickTime * 1000; G.endAt = performance.now() + ms; const tm = $('#timer'), arc = $('#tArc'); tm.classList.add('in');
    let lastSec = -1;
    await new Promise(res => {
        G.endNow = res;
        const step = () => {
            if (G.phase !== 'pick') return res();
            const left = Math.max(0, G.endAt - performance.now()), sec = Math.ceil(left / 1000), k = left / ms;
            arc.style.strokeDashoffset = String(276.5 * (1 - k)); tm.classList.toggle('warn', sec <= 10 && sec > 5); tm.classList.toggle('hot', sec <= 5);
            if (sec !== lastSec) { lastSec = sec; $('#tNum').textContent = sec; if (sec <= 5 && sec > 0) SFX.count(sec); }
            G.scene.setUrgency(left < 8000 ? 1 - left / 8000 : 0);
            if (left <= 0) return res(); requestAnimationFrame(step);
        }; step();
    });
    G.endNow = null; clearTimers(); G.phase = 'lock'; document.body.classList.remove('picking'); tm.classList.remove('in', 'warn', 'hot');
    G.scene.choosing(false); SFX.timeUp(); flash('#c4b5fd', 260); pill('انتهى الوقت');
    banner('انتهى الوقت!', `اختار ${G.picks.size} من ${n} · الكل لمكانه`, '', 1500);
    await G.scene.timeUp();
    clearBubbles('p:');
    G.alive.filter(p => !G.picks.has(String(p.id))).forEach(p => bubble('o:' + p.id, { p, out: true }));
    const chosen = G.alive.filter(p => G.picks.has(String(p.id))), idle = G.alive.filter(p => !G.picks.has(String(p.id)));
    if (!chosen.length) { clearBubbles(); await banner('ما أحد اختار!', 'نعيد نفس المرحلة', 'red', 2000); G.round--; G.scene.choosing(false); return playRound(); }
    // 1) اللي اختاروا يمشون لدوائرهم
    pill('الكل لمكانه'); const assign = {}; chosen.forEach(p => { assign[p.id] = G.picks.get(String(p.id)); });
    await G.scene.moveIn(assign);
    // 2) من لم يختر يُقصى مباشرة
    if (idle.length) {
        pill('إقصاء من لم يختر'); fx('danger', 2500);
        await G.scene.eliminate(idle.map(p => p.id), 'idle');
        clearBubbles('o:');
        G.alive = chosen; pill();
    }
    if (G.alive.length === 1) return crown(G.alive[0]);
    // 3) إقصاء عشوائي (القرار هنا قبل الأنيميشن — المشهد يعرضه بس)
    // حدث «الحيّة المميتة»: تبويب ينبّه إن حيّة ساكنة تحت أحد الأرقام ← الكشاف يدوّر ← الحيّة تطلع وتلدغ صاحب الرقم
    // كم ضحية هالمرحلة (من الإعدادات) — ما يتعدى الباقين ناقص واحد عشان يبقى بطل
    const k = Math.max(1, Math.min(+G.settings.snakes || 1, G.alive.length - 1));
    pill(k > 1 ? `${k} حيّات بين الأرقام` : 'حيّة بين الأرقام'); await snakeCard(k);
    const pool = G.alive.slice(), victims = [];
    for (let i = 0; i < k; i++) victims.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const victim = victims[0];
    pill('الحيّة تتنقل بين الأرقام…'); SFX.roll(3.4);
    G.lastVictims = victims;
    await G.scene.roulette(victims.map(v => v.id));
    const nums = victims.map(v => G.picks.get(String(v.id))).sort((a, b) => a - b);
    if (k === 1) banner(`الرقم ${nums[0]}`, `كانت الحيّة تحته · لدغت ${victim.name}`, 'red', 2200);
    else banner('الأرقام ' + nums.join(' · '), `${k} حيّات · لدغت ${victims.map(v => v.name).join(' و')}`, 'red', 2600);
    G.alive = G.alive.filter(p => !victims.includes(p)); pill();
    if (G.alive.length === 1) return crown(G.alive[0]);
    // 4) الناجين + بناء الصف الجديد
    SFX.survive(); banner(`نجا ${G.alive.length}`, 'لاعب · يصعدون درجة · الهرم يضيق', 'gold', 1900); fx('gold', 1600);
    await G.scene.survived(G.alive.map(p => p.id));
    pill('بناء الصف التالي');
    await G.scene.nextLevel(G.alive.length);
    playRound();
}
// تبويب الحيّة: يطلع بنص الشاشة قبل الاختيار العشوائي
function snakeCard(k = 1) { return new Promise(res => {
    const el = $('#snake'); $('#snNum').textContent = G.alive.length;
    $('#snCount').textContent = k > 1 ? k : 'واحد'; $('#snWord').textContent = k > 1 ? 'حيّات' : 'حيّة'; $('#snDead').textContent = k > 1 ? 'مميتة' : 'مميتة'; $('#snBite').textContent = k > 1 ? 'وراح تلدغ أصحابها مع بعض' : 'وراح تلدغ صاحبه'; $('#snQ').textContent = k > 1 ? 'من هم أصحاب الأرقام؟' : 'من هو صاحب الرقم؟'; el.classList.add('in'); SFX.hiss(1.6); fx('danger', 3400);
    setTimeout(() => { el.classList.remove('in'); setTimeout(res, 420); }, 4400);
}); }
function showStrip(title, list) { $('#osTitle').textContent = title; const max = 18; $('#osChips').innerHTML = list.slice(0, max).map(p => `<span class="chip">${avatarHtml(p, 'sm')}${esc(p.name)}</span>`).join('') + (list.length > max ? `<span class="chip">+${list.length - max}</span>` : ''); $('#outStrip').classList.add('in'); }
function hideStrip() { $('#outStrip').classList.remove('in'); }
function outCard(p) { $('#ocPic').innerHTML = avatarHtml(p, 'lg'); $('#ocName').textContent = p.name; $('#ocSub').textContent = `كانت الحيّة تحت رقمه (${G.picks.get(String(p.id)) || '—'}) · المرحلة ${G.round}`; $('#outCard').classList.add('in'); setTimeout(() => $('#outCard').classList.remove('in'), 2600); }

// إجابة من الشات: رقم دائرة (يقبل الأرقام العربية والهندية)
function answer(id, text) {
    if (G.phase !== 'pick') return; const p = byId(id); if (!p) return;
    const num = parseNum(text); if (num == null) return;
    const n = G.alive.length; if (num < 1 || num > n) return;
    const key = String(p.id), prev = G.picks.get(key); if (prev === num) return;
    const owner = G.taken.get(num); if (owner && owner !== key) { if (!p.bot) notice(`الرقم ${num} محجوز — اختر رقم ثاني يا ${p.name}`); return; }
    if (prev != null) G.taken.delete(prev);
    G.picks.set(key, num); G.taken.set(num, key);
    G.scene.pick(p.id, num, prev); SFX.pick(num); bubble('p:' + key, { p, num, ms: 2200 }); // الاسم يطلع فوق الدائرة نفسها (pyr3d.js)
    $('#hPicked').textContent = G.picks.size;
}

// ---------- البطل + نقاط المنصة (قاعدة إلزامية)
const CROWN_SVG = '<svg width="60" height="40" viewBox="0 0 60 40"><polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"/><circle cx="6" cy="13" r="4" stroke-width="1.5"/><circle cx="30" cy="4" r="4.5" stroke-width="1.5"/><circle cx="54" cy="13" r="4" stroke-width="1.5"/><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"/></svg>';
function ptsLine() { const v = G.pts; return v === 'pending' ? 'جارٍ احتساب النقاط' : typeof v === 'number' ? `+${v} نقطة` : 'النقاط للحسابات الموثّقة في الموقع'; }
function renderChamp() {
    const p = G.champ; if (!p) return;
    const W = window.AymanGamesPlatform && window.AymanGamesPlatform.winCard, place = `المركز الأول من ${G.players.length} لاعب`, owned = { name: p.name, avatarUrl: p.avatar || null, winCard: p.winCard || null };
    if (W && p.winCard && W.canShow(owned)) { $('#champCard').innerHTML = `<div class="owc">${W.renderHtml(owned, [ptsLine(), place, 'الهرم'], { pop: false })}</div>`; return; }
    const pts = typeof G.pts === 'number' ? [`+${G.pts}`, 'نقطة'] : [G.pts === 'pending' ? '…' : '🏆', ptsLine()];
    $('#champCard').innerHTML = `<div class="tw"><div class="crown">${CROWN_SVG}</div><div class="tcard"><div class="shine"></div><div class="in"><span class="wl">WINNER</span>${avatarHtml(p)}<span class="wn">${esc(p.name)}</span><span class="wx">${place}</span><div class="wp"><b>${pts[0]}<small>${esc(pts[1])}</small></b></div></div></div></div>`;
}
async function crown(p) {
    G.phase = 'champ'; G.champ = p; G.pts = null; pill('البطل'); fx('gold', 0);
    banner('البطل', `${p.name} · وصل القمة`, 'gold', 3000);
    const real = G.players.filter(x => String(x.id).indexOf('tiktok:') === 0), A = window.AGPAuth;
    if (real.length && A && typeof A.reportMatchPoints === 'function') {
        G.pts = 'pending';
        try { A.reportMatchPoints({ players: real.map(x => ({ id: x.id, name: x.name })), winnerIds: [p.id], teamGame: false, durationMs: Date.now() - G.startedAt }).then(res => {
            if (G.champ !== p) return; const u = String(p.id).indexOf('tiktok:') === 0 ? String(p.id).slice(7) : p.name;
            const aw = res && res.success && Array.isArray(res.awarded) ? res.awarded.find(a => a.tiktokUsername === u) : null; G.pts = aw ? aw.added : null; renderChamp(); }, () => { G.pts = null; renderChamp(); }); } catch (e) { G.pts = null; }
    }
    await G.scene.champion(p.id); SFX.victory();
    renderChamp(); await sleep(3200);
    if (G.champ === p) { document.body.classList.remove('match'); document.body.classList.add('champ'); $('#champ').classList.add('in'); }
}
function closeChamp() { clearBubbles(); $('#champ').classList.remove('in'); document.body.classList.remove('champ', 'match', 'picking'); document.body.dataset.fx = ''; G.champ = null; }
async function replay() { closeChamp(); G.phase = 'lobby'; G.scene.reset(); G.scene.setPlayers(G.players); renderLobby(); showLobby(true); await sleep(300); openRules(); }
function newMatch() { closeChamp(); G.phase = 'lobby'; G.players = []; G.alive = []; G.scene.reset(); if (G.bots) fillBots(8); showLobby(true); renderLobby(); }

// ---------- بوتات وضع التجربة: أغلبهم يختارون بأوقات عشوائية، وبعضهم يغيّر رأيه، وقليل ما يختار
function botsPick() {
    if (!G.bots) return; const ms = G.settings.pickTime * 1000, n = G.alive.length;
    G.alive.filter(p => p.bot).forEach(p => {
        if (Math.random() < .08) return; // ما يختار = يُقصى
        later(600 + Math.random() * (ms - 1800), () => { if (!G.bots) return; const free = []; for (let i = 1; i <= n; i++) if (!G.taken.has(i)) free.push(i); if (free.length) answer(p.id, String(free[(Math.random() * free.length) | 0])); });
        if (Math.random() < .12) later(ms * .7 + Math.random() * ms * .2, () => { if (!G.bots) return; const free = []; for (let i = 1; i <= n; i++) if (!G.taken.has(i)) free.push(i); if (free.length) answer(p.id, String(free[(Math.random() * free.length) | 0])); });
    });
}

// ---------- قائمة الجودة بالهيدر (تغيير فوري بدون إعادة تحميل، ويوضح النمط الحالي)
const Q_OPTS = [['auto', 'تلقائي', 'الموصى به: يقيس سلاسة جهازك ويختار ويخفّف تلقائياً'], ['low', 'منخفضة', 'للأجهزة الضعيفة: أولوية السلاسة'], ['balanced', 'متوازنة', 'الخيار اليدوي الموصى به لأغلب الأجهزة'], ['high', 'قوية', 'أعلى جودة للأجهزة القوية']];
function paintQuality(info) {
    if (!info) return; const modeLbl = Q_OPTS.find(o => o[0] === info.mode)[1];
    $('#qLbl').textContent = info.mode === 'auto' ? `تلقائي · ${info.label}` : modeLbl;
    $('#qOpts').innerHTML = Q_OPTS.map(([k, l, d]) => `<button class="qopt${k === info.mode ? ' on' : ''}" type="button" data-q="${k}"><span class="ql"><b>${l}</b><small>${d}</small></span><i></i></button>`).join('');
    $('#qNow').innerHTML = `المستخدم الآن: <b>${esc(info.label)}</b>${info.reduced ? ' (دقة مخفّضة)' : ''}${info.fps ? ` · ${info.fps} إطار/ث` : ''}`;
    if (info.reason) { const t = $('#qToast'); t.textContent = '🎛️ ' + info.reason + ' — ' + (info.mode === 'auto' ? 'تلقائي: ' : '') + info.label; t.classList.add('in'); clearTimeout(paintQuality.t); paintQuality.t = setTimeout(() => t.classList.remove('in'), 3200); }
}

// ---------- شات تيك توك: كلمة الدخول ثم الأرقام
const norm = s => String(s).trim().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '');
function isJoin(text) { const k = norm(G.settings.keyword || 'دخول'); return norm(text) === k || norm(text) === 'join'; }
function hookStream() {
    const P = window.PYPlatform; if (!P) return;
    P.connect();
    // التعليق: { id: 'tiktok:<user>', name, text, isFollower, avatarUrl, frame, winCard, character } (adapters/agp-tiktok-adapter.js)
    P.onComment(pl => { const id = String(pl.id), name = pl.name || pl.nickname || 'لاعب';
        if (G.phase === 'lobby' && isJoin(pl.text)) { if (G.settings.who === 'followers' && !pl.isFollower) return; const before = G.players.length; addPlayer(id, name, false, pl.avatarUrl || null, pl.frame || null, pl.winCard || null, pl.character || null);
            if (G.players.length > before) { const AE = window.AymanGamesPlatform && window.AymanGamesPlatform.entrance; if (AE) try { AE.play(pl, { rejoin: true }); } catch (e) { } } }
        else answer(id, pl.text); });
}

// ================================================================ تشغيل
(async function boot() {
    let scene = null;
    try {
        scene = await mountPyramid($('#stage'), { quality: G.settings.quality, onQuality: paintQuality, onEvent: (e, d) => {
            if (e === 'tick') SFX.tick(d); else if (e === 'build') SFX.build(d); else if (e === 'rise') SFX.rise(); else if (e === 'intro') SFX.intro();
            else if (e === 'fall') { SFX.elim(d); SFX.fall(); if (d === 'random') flash('#ef4444', 260); }
            else if (e === 'suspense') SFX.suspense(); else if (e === 'strike') { fx('danger', 2400); const vs = G.lastVictims || []; if (vs.length === 1) outCard(vs[0]); else if (vs.length) { showStrip(`لدغت الحيّات ${vs.length} لاعبين 🐍`, vs); setTimeout(hideStrip, 3200); } }
            else if (e === 'firework') SFX.firework(); else if (e === 'hiss') SFX.hiss(1.8); else if (e === 'bite') { SFX.bite(); flash('#c4664c', 220); } else if (e === 'join' && G.phase === 'lobby') SFX.join();
        } });
    } catch (e) { console.error(e); }
    if (!scene) { $('#fallback').hidden = false; $('#loading').classList.add('hide'); return; }
    G.scene = scene; G.phase = 'lobby'; window.__pyr = G;
    // ضحية الإقصاء العشوائي لبطاقة الاسم (تتسجّل قبل نداء المشهد)
    const demo = !window.PYPlatform || window.PYPlatform.demo;
    G.bots = demo;
    if (demo) {
        $('#demo').hidden = false;
        $('#demoFill').innerHTML = [5, 24, 30, 32, 56].map(n => `<button class="lbot fill" type="button" data-fill="${n}">${n} لاعب</button>`).join('') + '<button class="lbot" type="button" id="addBot">+ لاعب تجريبي</button>';
        $('#demoFill').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.fill) fillBots(+b.dataset.fill); else addBot(); });
        const n0 = +(new URLSearchParams(location.search).get('n') || 8); fillBots(Math.max(2, Math.min(64, n0)));
    }
    $('#kwWord').textContent = G.settings.keyword || 'دخول';
    $('#roster').addEventListener('click', e => { const b = e.target.closest('[data-kick]'); if (b) kickPlayer(b.dataset.kick); });
    showLobby(true); renderLobby(); addEventListener('resize', () => { if (G.phase === 'lobby') renderLobby(); });
    $('#loading').classList.add('hide');
    $('#startBtn').onclick = openRules; $('#rulesGo').onclick = startMatch; $('#againBtn').onclick = replay; $('#newBtn').onclick = newMatch;
    $('#exitBtn').onclick = () => { location.href = window.PYPlatform ? PYPlatform.libraryUrl : '../../games.html'; };
    // لوحة التجربة
    $('#botsTgl').onchange = e => { G.bots = e.target.checked; };
    $('#demoToggle').onclick = () => $('#demo').classList.toggle('open');
    $('#inGo').onclick = () => { const p = G.alive.find(x => !G.picks.has(String(x.id))); if (p) answer(p.id, $('#inNum').value); $('#inNum').value = ''; };
    $('#endNow').onclick = () => { if (G.phase === 'pick') G.endAt = performance.now(); };
    // الهيدر
    const inMatch = () => G.phase !== 'lobby' && G.phase !== 'champ';
    $('#hSet').href = window.PYPlatform ? PYPlatform.settingsUrl + (PYPlatform.demo ? '?demo=1' : '') : 'index.html';
    $('#hExit').href = window.PYPlatform ? PYPlatform.libraryUrl : '../../games.html';
    $('#hSet').addEventListener('click', e => { if (inMatch() && !confirm('المباراة شغّالة… تبي تطلع منها للإعدادات؟')) e.preventDefault(); });
    const paintVol = () => { const v = VOL.get(); $('#volVal').textContent = Math.round(v * 100) + '%'; $('#hVol').classList.toggle('muted', v === 0); $('#hVol').classList.toggle('lowv', v > 0 && v < .5); $('#volDown').disabled = v <= 0; $('#volUp').disabled = v >= 1; SFX.setVolume(v); };
    $('#volUp').onclick = () => { VOL.step(.1); SFX.unlock(); paintVol(); SFX.tick(); };
    $('#volDown').onclick = () => { VOL.step(-.1); SFX.unlock(); paintVol(); SFX.tick(); };
    $('#volMute').onclick = () => { VOL.toggle(); SFX.unlock(); paintVol(); };
    paintVol(); if (G.settings.sound === false) $('#hVol').hidden = true;
    // الجودة: من الهيدر (يتحفظ بالإعدادات بعد)
    $('#qBtn').onclick = e => { e.stopPropagation(); $('#qMenu').classList.toggle('in'); };
    $('#qOpts').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; G.settings.quality = b.dataset.q; PYSettings.save(G.settings); scene.setQuality(b.dataset.q); });
    document.addEventListener('click', e => { if (!e.target.closest('#qMenu') && !e.target.closest('#qBtn')) $('#qMenu').classList.remove('in'); });
    paintQuality(scene.qualityInfo());
    setInterval(() => { if ($('#qMenu').classList.contains('in')) paintQuality(scene.qualityInfo()); }, 1000);
    // البوتات تبدأ تختار مع بداية كل مرحلة
    const origChoosing = scene.choosing; scene.choosing = (on, r) => { origChoosing(on, r); if (on) botsPick(); };
    hookStream();
    if (window.PYPlatform && PYPlatform.onStatus) PYPlatform.onStatus(st => $('#live').classList.toggle('on', st === 'connected'));
    if (!scene.vrm) notice('الشخصيات المبسّطة مفعّلة (تعذّر تحميل الشخصيات)');
})();
