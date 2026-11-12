/**
 * الهاوية — منطق المباراة (شاشة game.html).
 *
 * الفكرة: جسر زجاجي، كل خطوة صف فيه لوحين (يمين = 1 / صح · يسار = 2 / خطأ).
 * يطلع سؤال، كل لاعب يكتب جوابه بالشات وشخصيته تنط على اللوح، ولما يخلص الوقت
 * اللوح الغلط ينكسر ويطيح اللي فوقه، ونكمل بالباقين.
 *
 * النمطين:
 *  - steps: عدد خطوات (10/15/20) — اللي يوصل خط النجاة يفوز.
 *  - last:  آخر ناجي — نكمل لين يبقى واحد (يفوز) أو يطيح الكل.
 *
 * التسلسل: index.html (الإعدادات → 'abyss-settings') ← lobby.html (اللاعبين →
 * 'abyss-roster' + 'abyss-players') ← هنا. البيانات عبر AB (abyss-platform.js).
 *
 * ?demo=1 بالرابط = لاعبين تجريبيين يجاوبون عشوائي (للتصميم والاختبار، بدون نقاط).
 */
(function (AGP) {
    'use strict';
    AGP = AGP || {};
    if (!AGP.log) { AGP.log = function () {}; }
    var AB = window.AB;

    var params = new URLSearchParams(location.search);
    // نمط التجربة: ?demo=1 بالرابط، أو صفحة تجربة تحط AGP.abyssDemo = true قبل هذا الملف
    var DEMO = params.get('demo') === '1' || AGP.abyssDemo === true;
    // تجربة كاملة (إعدادات ← لوبي ← هنا) ببوتات: اللاعبين من اللوبي، والأزرار تتنقل بين الشاشات مثل الحقيقي
    var FLOW = DEMO && AGP.abyssDemoFlow === true;

    // ---------- الإعدادات (من شاشة الإعدادات) ----------
    var SETUP = AB.readJSON(AB.keys.setup, null) || {};
    if ((!DEMO || FLOW) && !SETUP.keyword) { location.replace('index.html'); return; }
    var ROSTER = DEMO && !FLOW ? [] : AB.readJSON(AB.keys.roster, []);
    if ((!DEMO || FLOW) && (!Array.isArray(ROSTER) || !ROSTER.length)) { location.replace('lobby.html'); return; }
    var pick = function (k, d) { return params.has(k) ? params.get(k) : (SETUP[k] != null ? SETUP[k] : d); };
    var modeV = pick('mode', 'عدد خطوات');
    var CFG = {
        mode: modeV === 'last' || modeV === 'آخر ناجي' ? 'last' : 'steps',
        steps: [10, 15, 20].indexOf(+pick('steps', 15)) >= 0 ? +pick('steps', 15) : 15,
        answerSec: [10, 15, 20, 30].indexOf(+pick('answerSec', 15)) >= 0 ? +pick('answerSec', 15) : 15,
        joinWord: String(SETUP.keyword || 'دخول').trim() || 'دخول',
        maxPlayers: Math.max(2, Math.min(200, +SETUP.maxPlayers || 50)),
        followersOnly: SETUP.who === 'المتابعين فقط',
        noAnswerFalls: SETUP.noAnswerFalls !== false,
        sound: SETUP.sound !== false,
        // جودة الرسومات: عالية · متوازنة (الافتراضي) · ضعيفة
        quality: ({ 'عالية': 'high', 'ضعيفة': 'low', high: 'high', low: 'low' })[pick('quality', '')] || 'mid'
    };

    // نفس أشكال شخصيات سفينة النجاة (games/survival-ship/game.html) — للي ما عندهم شخصية أنمي
    var LOOKS = [
        { skin: '#f6cfa6', hair: '#3b2414', girl: 0, outfit: '#3b82f6', pants: '#1e3a8a' },
        { skin: '#f2c49b', hair: '#5b3a1e', girl: 1, outfit: '#a855f7', pants: '#4c1d95' },
        { skin: '#d9a273', hair: '#1f1410', girl: 0, outfit: '#10b981', pants: '#064e3b' },
        { skin: '#f8d9bd', hair: '#7c4a1e', girl: 1, outfit: '#f43f5e', pants: '#881337' },
        { skin: '#c68a5c', hair: '#120c09', girl: 0, outfit: '#f97316', pants: '#7c2d12' },
        { skin: '#f6cfa6', hair: '#2a1a10', girl: 1, outfit: '#14b8a6', pants: '#134e4a' },
        { skin: '#e3ae80', hair: '#3b2414', girl: 0, outfit: '#8b5cf6', pants: '#312e81' },
        { skin: '#f2c49b', hair: '#4a2c17', girl: 1, outfit: '#0ea5e9', pants: '#0c4a6e' }
    ];

    var $ = function (id) { return document.getElementById(id); };
    var scene = $('scene');
    var reg = AB.createRegistry(DEMO && !FLOW ? {} : AB.readJSON(AB.keys.players, {}));

    var S = {
        phase: 'intro',  // intro · question · reveal · over
        players: [],     // {id, name, look, vrm, row, lane, alive, fall, ans}
        qs: [], rows: [], row: 0, left: 0, startedAt: 0, winners: [], cam: 'overview',
        broke: false, pts: {}, ptsState: 'idle', reported: false
    };

    // ---------- أدوات ----------
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var pool = [];
    function nextQuestion() { if (!pool.length) pool = shuffle(AGP.abyssQuestions || []); return pool.pop(); }
    function isTF(q) { return !!q && typeof q.tf === 'boolean'; }
    function correctLane(q) { return isTF(q) ? (q.tf ? 0 : 1) : q.c; }
    // كل لوح زجاج عليه رقمه (1 يمين · 2 يسار) حتى بأسئلة صح وخطأ
    function ensureRows(n) { while (S.qs.length < n) { S.qs.push(nextQuestion()); S.rows.push({ labels: ['1', '2'], broken: null, safe: null }); } }
    function alive() { return S.players.filter(function (p) { return p.alive; }); }
    function show(id, on) { $(id).hidden = !on; }
    function hashOf(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
    // شخصية الأنمي لأصحاب الحسابات الموثّقة (docs/CHARACTERS.md): girl/boy، و any = وحدة ثابتة من id
    function vrmOf(c, id) { if (c === 'girl' || c === 'boy') return c; return c === 'any' ? (hashOf(id) & 1 ? 'boy' : 'girl') : null; }
    function initialOf(n) { return ([].slice.call(String(n || '')).filter(function (c) { return /[^\s_\d]/.test(c); }).slice(0, 2).join('')) || '؟'; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    // الجواب ← اللوح: 1/صح = يمين (0) · 2/خطأ = يسار (1)
    function laneOf(text, q) {
        var t = AB.norm(text);
        if (t === '1') return 0;
        if (t === '2') return 1;
        if (isTF(q)) { if (t === 'صح' || t === 'صحيح') return 0; if (t === 'خطا' || t === 'غلط') return 1; }
        return -1;
    }

    // ---------- الأصوات (WebAudio خفيفة) ----------
    var ac = null;
    function tone(fr, d, type, v) {
        if (!CFG.sound) return;
        try { if (!audio()) return; var o = ac.createOscillator(), g = ac.createGain();
            o.type = type || 'sine'; o.frequency.value = fr; g.gain.setValueAtTime(v || .14, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + d);
            o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d); } catch (e) {}
    }
    function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch (e) { return null; } }
    // المتصفح ما يشغّل الصوت إلا بعد ضغطة من الستريمر: أول ضغطة بالصفحة تفعّله
    ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function () { if (CFG.sound) audio(); }, { once: true }); });
    // صوت انكسار زجاج (مولّد بالكود): ضربة + تكسّر ضوضاء عالية + رنّات شظايا متناثرة
    function sCrack() {
        if (!CFG.sound) return; var A = audio(); if (!A) return;
        var t0 = A.currentTime, out = A.createGain(); out.gain.value = .9; out.connect(A.destination);
        var len = Math.floor(A.sampleRate * .9), buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) { var k = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 3) * (k < .015 ? k / .015 : 1); }
        var nz = A.createBufferSource(); nz.buffer = buf; var hp = A.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
        var ng = A.createGain(); ng.gain.value = .55; nz.connect(hp); hp.connect(ng); ng.connect(out); nz.start(t0);
        var th = A.createOscillator(), tg = A.createGain(); th.type = 'sine'; th.frequency.setValueAtTime(140, t0); th.frequency.exponentialRampToValueAtTime(45, t0 + .25);
        tg.gain.setValueAtTime(.5, t0); tg.gain.exponentialRampToValueAtTime(.001, t0 + .3); th.connect(tg); tg.connect(out); th.start(t0); th.stop(t0 + .32);
        for (var j = 0; j < 22; j++) { var at = t0 + .02 + Math.pow(Math.random(), 1.6) * 1.1, o = A.createOscillator(), g = A.createGain();
            o.type = 'sine'; o.frequency.value = 2600 + Math.random() * 4200; g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.06 + Math.random() * .06, at + .004); g.gain.exponentialRampToValueAtTime(.0001, at + .08 + Math.random() * .18);
            o.connect(g); g.connect(out); o.start(at); o.stop(at + .3); }
    }
    function sSafe() { tone(659, .18); setTimeout(function () { tone(880, .25); }, 120); }
    function sWin() { tone(523, .22); setTimeout(function () { tone(659, .22); }, 160); setTimeout(function () { tone(784, .5, 'sine', .16); }, 320); }

    // ---------- المشهد ----------
    function pushScene() {
        scene.scene = {
            names: true, quality: CFG.quality, cam: S.cam, row: S.row, finish: CFG.mode === 'steps', win: S.winners, rows: S.rows,
            players: S.players.map(function (p) {
                return { id: p.id, name: p.name, skin: p.look.skin, hair: p.look.hair, girl: p.look.girl, outfit: p.look.outfit, pants: p.look.pants, vrm: p.vrm, row: p.row, lane: p.lane, fall: p.fall };
            })
        };
    }

    // ---------- الواجهة ----------
    function render() {
        var ph = S.phase, q = S.qs[S.row], n = alive().length, playing = ph === 'question' || ph === 'reveal';
        show('intro', ph === 'intro');
        show('q', playing); show('opts', playing); show('hint', ph === 'question');
        show('alive', ph !== 'intro'); show('steps', ph !== 'intro');
        $('joinKw').textContent = CFG.joinWord;
        $('aliveN').textContent = n;
        $('stepsN').textContent = CFG.mode === 'steps' ? Math.min(S.row + 1, CFG.steps) + '/' + CFG.steps : S.row + 1;
        if (q && playing) {
            $('qText').textContent = q.q;
            [0, 1].forEach(function (l) {
                $('o' + l + 't').textContent = isTF(q) ? (l ? 'خطأ' : 'صح') : q.a[l];
                $('o' + l + 'c').textContent = S.players.filter(function (p) { return p.row === S.row && p.lane === l && (p.alive || p.fall); }).length;
                var o = $('o' + l); o.classList.toggle('ok', ph === 'reveal' && S.broke && correctLane(q) === l); o.classList.toggle('bad', ph === 'reveal' && S.broke && correctLane(q) !== l);
            });
            $('hintTx').innerHTML = isTF(q) ? 'اكتب <span class="kbd">1</span> صح أو <span class="kbd">2</span> خطأ بالشات' : 'اكتب <span class="kbd">1</span> أو <span class="kbd">2</span> بالشات';
            $('qTm').textContent = Math.max(0, Math.ceil(S.left));
            $('qTm').classList.toggle('low', ph === 'question' && S.left <= 5);
            $('qBar').style.width = (ph === 'question' ? Math.max(0, S.left / CFG.answerSec * 100) : 0) + '%';
        }
    }
    // المسرح يتصغّر مع الشاشة والهيدر ثابت 80px، فالعناصر العلوية تبدأ تحت الهيدر دائماً
    function fit() { var k = Math.min(innerWidth / 1920, innerHeight / 1080), st = $('stage').style; st.setProperty('--s', k); st.setProperty('--top', Math.max(24, Math.round((80 - (innerHeight / 2 - 540 * k)) / k + 22)) + 'px'); }
    addEventListener('resize', fit); fit();

    // ---------- أحداث المباراة (زر «أحداث المباراة» بالهيدر) ----------
    var LOG = [];
    function logEv(icon, text) {
        LOG.unshift({ icon: icon, text: text, at: new Date() }); if (LOG.length > 80) LOG.pop();
        $('evList').innerHTML = LOG.map(function (e) { return '<li><span>' + e.icon + '</span><b>' + esc(e.text) + '</b><time>' + e.at.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + '</time></li>'; }).join('');
        $('evEmpty').hidden = LOG.length > 0;
    }

    // ---------- اللاعبين ----------
    function makePlayer(name) {
        var p = reg.player(name);
        return { id: p.id, name: name, look: LOOKS[hashOf(p.id) % LOOKS.length], vrm: vrmOf(p.character, p.id), row: -1, lane: 0, alive: true, fall: false, ans: -1 };
    }
    // دخول أثناء المباراة (الدخول التلقائي): يوقف مع الناجين على آخر لوح سليم
    function joinMidMatch(name) {
        if (S.players.some(function (p) { return p.name === name; }) || S.players.length >= CFG.maxPlayers) return;
        if (S.phase !== 'question' && S.phase !== 'intro') return;
        var p = makePlayer(name), prev = S.rows[S.row - 1];
        if (S.phase === 'question' && prev) { p.row = S.row - 1; p.lane = prev.safe != null ? prev.safe : 0; }
        S.players.push(p); participants[p.name] = true;
        try { AGP.winCard && AGP.winCard.preloadFor(reg.player(name)); } catch (e) {}
        logEv('🙋', 'انضم ' + name); pushScene(); render();
    }
    function answer(name, text) {
        if (S.phase !== 'question') return;
        var p = S.players.find(function (x) { return x.name === name; }); if (!p || !p.alive) return;
        var l = laneOf(text, S.qs[S.row]); if (l < 0) return;
        p.ans = l; p.row = S.row; p.lane = l;   // الشخصية تنط للوح (وتقدر تغيّر رأيها قبل نهاية الوقت)
        pushScene(); render();
    }

    // ---------- دورة المباراة ----------
    var timer = null, timers = [], participants = {};
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearAll() { clearInterval(timer); timers.forEach(clearTimeout); timers = []; }

    function setupMatch(names) {
        clearAll();
        S.players = names.map(makePlayer); participants = {};
        S.players.forEach(function (p) { participants[p.name] = true; try { AGP.winCard && AGP.winCard.preloadFor(reg.player(p.name)); } catch (e) {} });
        S.qs = []; S.rows = []; S.row = 0; S.winners = []; S.broke = false; S.pts = {}; S.ptsState = 'idle'; S.reported = false;
        S.cam = 'overview'; S.phase = 'intro';
        ensureRows(CFG.mode === 'steps' ? CFG.steps : 6);
        $('win').hidden = true;
        pushScene(); render();
        // عد تنازلي قصير والكاميرا تستعرض الجسر، ثم أول سؤال
        var n = 3; $('introN').textContent = n;
        later(function tick() { n--; if (n > 0) { $('introN').textContent = n; tone(440, .12, 'triangle'); later(tick, 1000); } else start(); }, 1600);
    }
    function start() {
        S.startedAt = Date.now(); S.row = 0; S.cam = 'play';
        logEv('🚩', 'بدأت المباراة بـ ' + S.players.length + ' لاعب · ' + (CFG.mode === 'steps' ? CFG.steps + ' خطوة' : 'آخر ناجي'));
        ask();
    }
    function ask() {
        S.phase = 'question'; S.left = CFG.answerSec; S.broke = false;
        alive().forEach(function (p) { p.ans = -1; });
        if (CFG.mode === 'last') ensureRows(S.row + 6);
        pushScene(); render();
        clearInterval(timer);
        timer = setInterval(function () {
            S.left -= .25;
            if (S.left > 0 && S.left <= 5 && Math.abs(S.left - Math.round(S.left)) < .01) tone(660, .08, 'triangle', .08);
            if (S.left <= 0) { clearInterval(timer); reveal(); } else render();
        }, 250);
        if (DEMO) demoAnswers();
    }
    // انتهى الوقت: اللي ما جاوب ينط على اللوح الغلط (أو الصح)، لحظة ترقّب، ثم ينكسر الزجاج
    function reveal() {
        S.phase = 'reveal'; S.broke = false;
        var q = S.qs[S.row], ok = correctLane(q), bad = 1 - ok;
        alive().forEach(function (p) { if (p.ans < 0) { p.row = S.row; p.lane = CFG.noAnswerFalls ? bad : ok; } });
        pushScene(); render();
        later(breakGlass, 1300);
    }
    function breakGlass() {
        var q = S.qs[S.row], ok = correctLane(q), bad = 1 - ok, fell = [];
        S.broke = true; S.rows[S.row].broken = bad; S.rows[S.row].safe = ok;
        alive().forEach(function (p) { if (p.lane === ok) return; p.alive = false; p.fall = true; fell.push(p.name); });
        pushScene(); render(); later(sCrack, 400); if (!fell.length) sSafe();
        logEv(fell.length ? '💥' : '✅', 'الخطوة ' + (S.row + 1) + ': ' + (fell.length ? 'سقط ' + fell.join('، ') : 'الكل نجا'));
        // إعلان مختصر: عدد اللي طاحوا + صورة واسم كل واحد (أول 10، والباقي +N)
        var h = $('fallH'), MAXF = 10;
        h.className = fell.length ? '' : 'safe'; h.textContent = fell.length ? '💥 سقط ' + fell.length : '✅ الكل نجا';
        $('fallList').innerHTML = fell.slice(0, MAXF).map(function (n, i) { var av = reg.player(n).avatarUrl;
            return '<div class="fp" style="animation-delay:' + (i * .05).toFixed(2) + 's"><span class="av">' + esc(initialOf(n)) + (av ? '<img src="' + esc(av) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span><b>' + esc(n) + '</b></div>'; }).join('') +
            (fell.length > MAXF ? '<div class="fp more"><span class="av">+' + (fell.length - MAXF) + '</span><b>غيرهم</b></div>' : '');
        later(function () { show('fall', true); }, 700);
        later(function () { show('fall', false); next(); }, 4200);
    }
    function next() {
        var left = alive();
        if (!left.length) return finish([]);
        if (CFG.mode === 'last' && left.length === 1) return finish(left);
        S.row++;
        if (CFG.mode === 'steps' && S.row >= CFG.steps) { left.forEach(function (p) { p.row = CFG.steps; p.lane = 0; }); pushScene(); return later(function () { finish(left); }, 1300); }
        ask();
    }
    function finish(winners) {
        clearAll();
        S.phase = 'over'; S.winners = winners.map(function (p) { return p.id; }); S.cam = winners.length ? 'win' : 'overview';
        logEv(winners.length ? '👑' : '💀', winners.length ? 'الفائز: ' + winners.map(function (p) { return p.name; }).join('، ') : 'سقط الجميع');
        pushScene(); render(); if (winners.length) sWin();
        reportPoints(winners);
        later(function () { renderWin(); $('win').hidden = false; }, winners.length ? 2600 : 1600);
    }

    // ---------- نقاط المنصة (إلزامي لكل لعبة — CLAUDE.md) ----------
    // reportMatchPoints تسجّل للاعبين نقاطهم وإحصائياتهم، وللاستريمر ساعات البث وعدد المشاركين.
    function reportPoints(winners) {
        if (S.reported) return; S.reported = true;
        var A = window.AGPAuth;
        if (DEMO || !A || typeof A.reportMatchPoints !== 'function') { S.ptsState = 'none'; return; }
        S.ptsState = 'pending';
        var players = Object.keys(participants).map(function (n) { var p = reg.player(n); return { id: p.id, name: n }; });
        A.reportMatchPoints({ players: players, winnerIds: winners.map(function (p) { return p.id; }), teamGame: false, durationMs: Date.now() - (S.startedAt || Date.now()) })
            .then(function (res) {
                S.pts = {}; S.ptsState = 'done';
                (res && res.success && Array.isArray(res.awarded) ? res.awarded : []).forEach(function (a) { S.pts[String(a.tiktokUsername).toLowerCase()] = a.added; });
                if (!$('win').hidden) renderWin();
            });
    }
    function ptsOf(p) {
        if (S.ptsState === 'pending') return { main: '…', sub: 'جارٍ احتساب النقاط' };
        if (DEMO) return { main: '+14 نقطة', sub: 'نقاط تجريبية' }; // تجربة: إكمال 4 + فوز 10 (points-service.js)
        var u = String(p.id).indexOf('tiktok:') === 0 ? String(p.id).slice(7).toLowerCase() : '';
        var v = u ? S.pts[u] : undefined;
        return typeof v === 'number' ? { main: '+' + v + ' نقطة', sub: 'تظهر في بروفايلك' } : { main: '—', sub: 'النقاط للحسابات الموثّقة في الموقع' };
    }

    // ---------- شاشة الفوز (نفس قالب روليت الإقصاء) ----------
    var CROWN = '<svg width="60" height="40" viewBox="0 0 60 40" style="display:block;fill:#a78bfa;stroke:#6d28d9;stroke-linejoin:round"><polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"></polygon><circle cx="6" cy="13" r="4" stroke-width="1.5"></circle><circle cx="30" cy="4" r="4.5" stroke-width="1.5"></circle><circle cx="54" cy="13" r="4" stroke-width="1.5"></circle><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"></rect></svg>';
    function renderWin() {
        var ws = S.players.filter(function (p) { return S.winners.indexOf(p.id) >= 0; }), n = ws.length, total = Object.keys(participants).length;
        $('winH').textContent = n ? (n === 1 ? '🏆 الفائز في لعبة "الهاوية"' : '🏆 الفائزين في لعبة "الهاوية"') : '💀 سقط الجميع في الهاوية';
        $('winSub').textContent = n ? (n === 1 ? (CFG.mode === 'last' ? 'آخر ناجي من ' + total + ' لاعب' : 'وصل خط النجاة من ' + total + ' لاعب') : 'وصلوا خط النجاة ' + n + ' من ' + total + ' لاعب') : 'ما أحد نجا هالمرة — جربوا مرة ثانية';
        // كل ما زاد عدد الفائزين تصغر البطاقات (بدون أي تطاير)
        var k = n <= 1 ? 1 : n <= 3 ? .85 : n <= 6 ? .7 : n <= 12 ? .58 : .5, MAX = 24;
        $('winCards').innerHTML = ws.slice(0, MAX).map(function (p, i) {
            var pl = reg.player(p.name), pt = ptsOf(p), delay = 'animation-delay:' + (i * 0.05).toFixed(2) + 's;';
            if (AGP.winCard && AGP.winCard.canShow(pl)) {
                return '<div class="wc own" style="zoom:' + k + ';' + delay + '">' + AGP.winCard.renderHtml(pl, [pt.main, n === 1 ? 'المركز الأول من ' + total + ' لاعب' : 'من الناجين', 'الهاوية'], { pop: false }) + '</div>';
            }
            var av = pl.avatarUrl;
            return '<div class="wc" style="zoom:' + k + ';' + delay + '"><div class="crown">' + CROWN + '</div><div class="card"><div class="shine"></div><div class="in">' +
                '<span class="lbl">WINNER</span><span class="av">' + esc(initialOf(p.name)) + (av ? '<img src="' + esc(av) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>' +
                '<span class="nm">' + esc(p.name) + '</span><div class="pts" style="font-size:' + (pt.main.length > 2 ? '2em' : '1.4em') + '">' + esc(pt.main) + '<small>' + esc(pt.sub) + '</small></div></div></div></div>';
        }).join('') + (n > MAX ? '<span class="more">و' + (n - MAX) + ' غيرهم</span>' : '');
    }

    // ---------- الشات ----------
    if (!DEMO) {
        AB.connect();
        AB.onComment(function (c) {
            var name = reg.nameFor(c);
            if (AB.norm(c.text) === AB.norm(CFG.joinWord)) {
                if ($('bAuto').getAttribute('aria-checked') !== 'true') return;
                if (CFG.followersOnly && !c.isFollower) return;
                return joinMidMatch(name);
            }
            answer(name, c.text);
        });
    }

    // ---------- أزرار ----------
    function goLobby() { if (DEMO && !FLOW) { $('setPanel').hidden = true; return newDemo(); } clearAll(); try { localStorage.removeItem(AB.keys.roster); localStorage.removeItem(AB.keys.players); } catch (e) {} location.href = 'lobby.html'; }
    function saveSetup() { if (DEMO && !FLOW) return; SETUP.answerSec = String(CFG.answerSec); SETUP.noAnswerFalls = CFG.noAnswerFalls; SETUP.sound = CFG.sound; SETUP.quality = ({ high: 'عالية', mid: 'متوازنة', low: 'ضعيفة' })[CFG.quality]; AB.writeJSON(AB.keys.setup, SETUP); }
    function paintSettings() {
        [].forEach.call($('sSec').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-v') === CFG.answerSec)); });
        [].forEach.call($('sGfx').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === CFG.quality)); });
        $('sFall').setAttribute('aria-checked', String(CFG.noAnswerFalls)); $('sSound').setAttribute('aria-checked', String(CFG.sound));
    }
    $('bExit').onclick = function () { $('exitDlg').hidden = false; };
    $('xNo').onclick = function () { $('exitDlg').hidden = true; };
    $('exitDlg').onclick = function (e) { if (e.target === $('exitDlg')) $('exitDlg').hidden = true; };
    $('xYes').onclick = function () { $('exitDlg').hidden = true; if (FLOW) { clearAll(); location.href = 'index.html'; return; } if (DEMO) return newDemo(); clearAll(); location.href = AB.libraryUrl; };
    $('bSettings').onclick = function (e) { e.stopPropagation(); paintSettings(); $('setPanel').hidden = !$('setPanel').hidden; };
    $('sClose').onclick = function () { $('setPanel').hidden = true; };
    $('sSec').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; CFG.answerSec = +b.getAttribute('data-v'); saveSetup(); paintSettings(); };
    $('sGfx').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; CFG.quality = b.getAttribute('data-v'); saveSetup(); paintSettings(); pushScene(); };
    $('sFall').onclick = function () { CFG.noAnswerFalls = !CFG.noAnswerFalls; saveSetup(); paintSettings(); };
    $('sSound').onclick = function () { CFG.sound = !CFG.sound; saveSetup(); paintSettings(); };
    $('sBack').onclick = function () { if (DEMO && !FLOW) { $('setPanel').hidden = true; return newDemo(); } clearAll(); location.href = 'index.html'; };
    $('sEnd').onclick = goLobby;
    $('bEvents').onclick = function (e) { e.stopPropagation(); $('evPanel').hidden = !$('evPanel').hidden; };
    document.addEventListener('click', function (e) {
        if (!$('evPanel').contains(e.target)) $('evPanel').hidden = true;
        if (!$('setPanel').contains(e.target) && !$('bSettings').contains(e.target)) $('setPanel').hidden = true;
    });
    $('bAuto').onclick = function () { var b = $('bAuto'); b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); };
    $('wExit').onclick = function () { $('exitDlg').hidden = false; };
    $('wNew').onclick = goLobby;
    // إعادة بنفس اللاعبين: الجسر ينبني من جديد والكل يرجع لمنصة البداية
    $('wSame').onclick = function () {
        var names = S.players.map(function (p) { return p.name; });
        var fresh = document.createElement('abyss-3d'); fresh.id = 'scene'; scene.replaceWith(fresh); scene = fresh;
        setupMatch(names);
    };

    // ---------- نمط التجربة ----------
    var DEMO_ACC = +params.get('acc') || .7;
    var NAMES = ['سارا', 'فهد', 'نوره', 'عبدالله', 'ريم', 'خالد', 'لمى', 'تركي', 'جود', 'سلطان', 'هيا', 'ماجد', 'دانة', 'ناصر', 'غلا', 'بندر', 'شهد', 'راكان'];
    function demoAnswers() {
        alive().forEach(function (p) {
            if (p.human) return;
            later(function () { var ok = correctLane(S.qs[S.row]); answer(p.name, String(Math.random() < DEMO_ACC ? ok + 1 : 2 - ok)); }, 800 + Math.random() * (CFG.answerSec - 4) * 1000);
        });
    }
    // تجربة جديدة ببوتات: {n, mode:'steps'|'last', steps, sec, acc}
    var demoOpts = { n: +params.get('n') || 12, acc: DEMO_ACC };
    function newDemo(o) {
        o = Object.assign(demoOpts, o || {});
        if (o.mode) CFG.mode = o.mode === 'last' ? 'last' : 'steps';
        if ([10, 15, 20].indexOf(+o.steps) >= 0) CFG.steps = +o.steps;
        if (+o.sec >= 5) CFG.answerSec = +o.sec;
        DEMO_ACC = Math.max(.05, Math.min(1, +o.acc || DEMO_ACC));
        var list = [], init = {};
        for (var i = 0; i < Math.max(1, Math.min(60, +o.n || 12)); i++) { var nm = NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (i + 1) : ''); list.push(nm); init[nm] = { id: 'demo:' + i, avatar: null, character: null }; }
        reg = AB.createRegistry(init);
        var fresh = document.createElement('abyss-3d'); fresh.id = 'scene'; scene.replaceWith(fresh); scene = fresh;
        setupMatch(list);
    }
    // رسالة شات بنمط التجربة (أنت تلعب مع البوتات): كلمة الدخول = انضمام، وغيرها = جواب
    function demoChat(name, text) {
        name = String(name || '').trim(); if (!name) return 'اكتب اسمك';
        if (AB.norm(text) === AB.norm(CFG.joinWord)) {
            if (S.players.some(function (p) { return p.name === name; })) return 'أنت داخل المباراة';
            if (S.phase !== 'intro' && S.phase !== 'question') return 'انتظر السؤال الجاي وادخل';
            var nm = reg.nameFor({ id: 'human:' + name, name: name });
            joinMidMatch(nm); var p = S.players.find(function (x) { return x.name === nm; }); if (p) p.human = true;
            return p ? 'دخلت باسم ' + nm : 'ما قدرت تدخل';
        }
        var me = S.players.find(function (x) { return x.human && x.name === name; });
        if (!me) return 'اكتب «' + CFG.joinWord + '» أول عشان تدخل';
        if (!me.alive) return 'طحت بالهاوية — انتظر المباراة الجاية';
        if (S.phase !== 'question') return 'انتظر السؤال';
        answer(name, text); return me.ans >= 0 ? 'اخترت ' + (me.ans + 1) : 'اكتب 1 أو 2';
    }
    AGP.abyssGame = { state: S, cfg: CFG, start: start, pause: function () { clearInterval(timer); }, reveal: function () { clearInterval(timer); reveal(); }, answer: answer, render: render, push: pushScene, renderWin: renderWin, newDemo: newDemo, demoChat: demoChat, setAcc: function (v) { DEMO_ACC = Math.max(.05, Math.min(1, +v || DEMO_ACC)); } };

    if (DEMO && !FLOW) newDemo(); else setupMatch(ROSTER.slice());
}(window.AymanGamesPlatform));
