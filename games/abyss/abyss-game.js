/**
 * الهاوية — منطق المباراة (شاشة game.html).
 *
 * الفكرة: جسر زجاجي، كل خطوة صف فيه مربعين (يمين = 1 / صح · يسار = 2 / خطأ).
 * يطلع سؤال، كل لاعب يكتب جوابه بالشات وشخصيته تنط للمربع، ولما يخلص الوقت
 * المربع الغلط ينكسر ويطيح اللي فوقه، ونكمل بالباقين.
 *
 * النمطين:
 *  - steps: عدد خطوات (10/15/20) — اللي يوصل خط النجاة يفوز.
 *  - last:  آخر ناجي — نكمل لين يبقى واحد (يفوز) أو يطيح الكل.
 *
 * ?demo=1 بالرابط = لاعبين تجريبيين يدخلون ويجاوبون عشوائي (للتصميم والاختبار).
 */
(function (AGP) {
    'use strict';
    AGP = AGP || {};
    if (!AGP.log) { AGP.log = function () {}; }

    var params = new URLSearchParams(location.search);
    var DEMO = params.get('demo') === '1';
    // الإعدادات من شاشة index.html (localStorage 'abyss-settings')، والرابط يغلبها (للتجربة)
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('abyss-settings') || '{}') || {}; } catch (e) {}
    var pick = function (k) { return params.has(k) ? params.get(k) : saved[k]; };
    var CFG = {
        mode: pick('mode') === 'last' ? 'last' : 'steps',
        steps: [10, 15, 20].indexOf(+pick('steps')) >= 0 ? +pick('steps') : 15,
        answerSec: Math.min(60, Math.max(5, +pick('answerSec') || 15)),
        joinWord: String(pick('joinWord') || 'دخول').trim() || 'دخول',
        // اللي ما جاوب لين خلص الوقت: يطيح (الافتراضي)، أو ينتقل للمربع الصح
        noAnswerFalls: pick('noAnswerFalls') !== false && pick('noAnswerFalls') !== '0'
    };

    // نفس أشكال شخصيات سفينة النجاة (games/survival-ship/game.html)
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

    var S = {
        phase: 'join',   // join · question · reveal · over
        players: [],     // {id, name, look, vrm, row, lane, alive, fall, ans}
        qs: [],          // أسئلة المباراة بالترتيب — qs[i] = صف الجسر i
        rows: [],        // {labels, broken, safe}
        row: 0,          // الصف اللي عليه السؤال الحين
        left: 0,         // ثواني باقية
        startedAt: 0,
        winners: [],
        cam: 'overview'
    };

    // ---------- أدوات ----------
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var pool = [];
    function nextQuestion() { if (!pool.length) pool = shuffle(AGP.abyssQuestions || []); return pool.pop(); }
    function isTF(q) { return !!q && typeof q.tf === 'boolean'; }
    // كل لوح زجاج عليه رقمه (1 يمين · 2 يسار) حتى بأسئلة صح وخطأ
    function labelsOf() { return ['1', '2']; }
    function correctLane(q) { return isTF(q) ? (q.tf ? 0 : 1) : q.c; }
    function ensureRows(n) { while (S.qs.length < n) { var q = nextQuestion(); S.qs.push(q); S.rows.push({ labels: labelsOf(q), broken: null, safe: null }); } }
    function alive() { return S.players.filter(function (p) { return p.alive; }); }
    function show(id, on) { $(id).hidden = !on; }

    // تطبيع بسيط للأجوبة: الأرقام العربية والفارسية، الهمزات، التاء المربوطة
    function norm(s) {
        return String(s == null ? '' : s).trim()
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[ً-ٰـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    }
    // الجواب ← المربع: 1/صح = يمين (0) · 2/خطا = يسار (1)
    function laneOf(text, q) {
        var t = norm(text);
        if (t === '1') return 0;
        if (t === '2') return 1;
        if (isTF(q)) { if (t === 'صح' || t === 'صحيح') return 0; if (t === 'خطا' || t === 'غلط') return 1; }
        return -1;
    }

    // ---------- المشهد ----------
    function pushScene() {
        scene.scene = {
            names: true, cam: S.cam, row: S.row, finish: CFG.mode === 'steps', win: S.winners,
            rows: S.rows,
            players: S.players.map(function (p) {
                return { id: p.id, name: p.name, skin: p.look.skin, hair: p.look.hair, girl: p.look.girl, outfit: p.look.outfit, pants: p.look.pants, vrm: p.vrm, row: p.row, lane: p.lane, fall: p.fall };
            })
        };
    }

    // ---------- الواجهة ----------
    function render() {
        var ph = S.phase, q = S.qs[S.row], n = alive().length;
        show('join', ph === 'join');
        show('q', ph === 'question' || ph === 'reveal');
        show('opts', ph === 'question' || ph === 'reveal');
        show('hint', ph === 'question');
        show('alive', ph !== 'join'); show('steps', ph !== 'join');
        show('over', ph === 'over');
        $('joinN').textContent = S.players.length;
        $('joinKw').textContent = CFG.joinWord; $('joinKw2').textContent = CFG.joinWord;
        $('modeChip').textContent = CFG.mode === 'steps' ? 'النمط: ' + CFG.steps + ' خطوة' : 'النمط: آخر ناجي';
        $('bStart').disabled = S.players.length < 1;
        $('aliveN').textContent = n;
        $('stepsN').textContent = CFG.mode === 'steps' ? Math.min(S.row + 1, CFG.steps) + '/' + CFG.steps : S.row + 1;
        if (q && (ph === 'question' || ph === 'reveal')) {
            $('qStep').textContent = CFG.mode === 'steps' ? 'الخطوة ' + (S.row + 1) + ' من ' + CFG.steps : 'الخطوة ' + (S.row + 1) + ' · آخر ناجي';
            $('qType').textContent = isTF(q) ? 'صح أو خطأ' : 'اختر 1 أو 2';
            $('qText').textContent = q.q;
            [0, 1].forEach(function (l) {
                $('o' + l + 't').textContent = isTF(q) ? (l ? 'خطأ' : 'صح') : q.a[l];
                $('o' + l + 'c').textContent = alive().filter(function (p) { return p.ans === l; }).length + S.players.filter(function (p) { return p.fall && p.lane === l && p.row === S.row; }).length;
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

    // ---------- اللاعبين ----------
    function addPlayer(id, name, vrm) {
        if (S.phase !== 'join' || S.players.some(function (p) { return p.id === id; })) return;
        var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
        S.players.push({ id: id, name: name, look: LOOKS[Math.abs(h) % LOOKS.length], vrm: vrm || null, row: -1, lane: 0, alive: true, fall: false, ans: -1 });
        logEv('🙋', 'انضم ' + name);
        pushScene(); render();
    }
    function answer(id, text) {
        if (S.phase !== 'question') return;
        var p = S.players.find(function (x) { return x.id === id; }); if (!p || !p.alive) return;
        var l = laneOf(text, S.qs[S.row]); if (l < 0) return;
        p.ans = l; p.row = S.row; p.lane = l;   // الشخصية تنط للمربع (وتقدر تغيّر رأيها قبل نهاية الوقت)
        pushScene(); render();
    }

    // ---------- دورة المباراة ----------
    var timer = null;
    function start() {
        if (!S.players.length) return;
        S.startedAt = Date.now(); S.row = 0; S.winners = [];
        S.cam = 'play'; logEv('🚩', 'بدأت المباراة بـ ' + S.players.length + ' لاعب · ' + (CFG.mode === 'steps' ? CFG.steps + ' خطوة' : 'آخر ناجي')); ask();
    }
    function ask() {
        S.phase = 'question'; S.left = CFG.answerSec;
        alive().forEach(function (p) { p.ans = -1; });
        if (CFG.mode === 'last') ensureRows(S.row + 6);
        pushScene(); render();
        clearInterval(timer);
        timer = setInterval(function () { S.left -= .25; if (S.left <= 0) { clearInterval(timer); reveal(); } else render(); }, 250);
        if (DEMO) demoAnswers();
    }
    // انتهى الوقت: اللي ما جاوب ينط على المربع الغلط، لحظة ترقّب، ثم ينكسر الزجاج
    function reveal() {
        S.phase = 'reveal'; S.broke = false;
        var q = S.qs[S.row], ok = correctLane(q), bad = 1 - ok;
        alive().forEach(function (p) { if (p.ans < 0) { p.row = S.row; p.lane = CFG.noAnswerFalls ? bad : ok; } });
        pushScene(); render();
        setTimeout(breakGlass, 1300);
    }
    function breakGlass() {
        var q = S.qs[S.row], ok = correctLane(q), bad = 1 - ok, fell = [];
        S.broke = true; S.rows[S.row].broken = bad; S.rows[S.row].safe = ok;
        alive().forEach(function (p) {
            if (p.lane === ok) return;
            p.alive = false; p.fall = true; fell.push(p.name);
        });
        pushScene(); render();
        logEv(fell.length ? '💥' : '✅', 'الخطوة ' + (S.row + 1) + ': ' + (fell.length ? 'سقط ' + fell.join('، ') : 'الكل نجا'));
        var h = $('fallH'), pTx = $('fallP');
        if (fell.length) { h.className = ''; h.textContent = 'انكسر الزجاج! سقط ' + fell.length + (fell.length === 1 ? ' لاعب' : ' لاعبين'); pTx.textContent = fell.slice(0, 12).join(' · ') + (fell.length > 12 ? ' و' + (fell.length - 12) + ' غيرهم' : ''); }
        else { h.className = 'safe'; h.textContent = 'الكل نجا!'; pTx.textContent = 'الجواب الصح: ' + (isTF(q) ? (q.tf ? 'صح' : 'خطأ') : q.a[ok]); }
        setTimeout(function () { show('fall', true); }, 700);
        setTimeout(function () { show('fall', false); next(); }, 4200);
    }
    function next() {
        var left = alive();
        if (!left.length) return finish([]);
        if (CFG.mode === 'last' && left.length === 1) return finish(left);
        S.row++;
        if (CFG.mode === 'steps' && S.row >= CFG.steps) { left.forEach(function (p) { p.row = CFG.steps; p.lane = 0; }); pushScene(); return setTimeout(function () { finish(left); }, 1300); }
        ask();
    }
    function finish(winners) {
        S.phase = 'over'; S.winners = winners.map(function (p) { return p.id; }); S.cam = winners.length ? 'win' : 'overview';
        $('overH').textContent = winners.length ? (winners.length === 1 ? 'الفائز: ' + winners[0].name : 'نجا ' + winners.length + ' لاعبين!') : 'سقط الجميع!';
        $('overP').textContent = winners.length > 1 ? winners.map(function (p) { return p.name; }).join(' · ') : winners.length ? 'آخر واحد صامد على الجسر' : 'ما أحد نجا من الهاوية هالمرة';
        $('over').querySelector('.crown').textContent = winners.length ? '👑' : '💀';
        logEv(winners.length ? '👑' : '💀', winners.length ? 'الفائز: ' + winners.map(function (p) { return p.name; }).join('، ') : 'سقط الجميع');
        pushScene(); render();
        // نظام نقاط المنصة (إلزامي لكل لعبة) — مرة وحدة بنهاية كل مباراة
        if (!DEMO && window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') {
            window.AGPAuth.reportMatchPoints({
                players: S.players.map(function (p) { return { id: p.id, name: p.name }; }),
                winnerIds: S.winners, teamGame: false, durationMs: Date.now() - S.startedAt
            });
        }
    }
    function reset() {
        clearInterval(timer);
        S.players.forEach(function (p) { p.row = -1; p.lane = 0; p.alive = true; p.fall = false; p.ans = -1; });
        S.qs = []; S.rows = []; S.row = 0; S.winners = []; S.cam = 'overview'; S.phase = 'join'; ensureRows(CFG.mode === 'steps' ? CFG.steps : 6);
        // المشهد يبني الجسر من جديد
        var fresh = document.createElement('abyss-3d'); fresh.id = 'scene'; scene.replaceWith(fresh); scene = fresh;
        pushScene(); render();
    }

    // ---------- أحداث المباراة (زر «أحداث المباراة» بالهيدر) ----------
    var LOG = [];
    function logEv(icon, text) {
        LOG.unshift({ icon: icon, text: text, at: new Date() }); if (LOG.length > 60) LOG.pop();
        var box = $('evList'); if (!box) return;
        box.innerHTML = LOG.map(function (e) { return '<li><span>' + e.icon + '</span><b></b><time>' + e.at.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) + '</time></li>'; }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('b'), function (b, i) { b.textContent = LOG[i].text; });
        $('evEmpty').hidden = LOG.length > 0;
    }

    // ---------- الشات ----------
    // الاتصال بالبث: نفس الاتصال الموثّق المحفوظ بمكتبة الألعاب (games.html)
    (function connectStream() {
        if (DEMO || !AGP.streamConnector) return;
        var conn = null; try { conn = JSON.parse(localStorage.getItem('agp:agp-stream-connection') || 'null'); } catch (e) {}
        if (conn && conn.username) AGP.streamConnector.connect('tiktok', { username: conn.username });
    }());
    // شخصية الأنمي لأصحاب الحسابات الموثّقة (docs/CHARACTERS.md): girl/boy، و any = وحدة ثابتة من id
    function vrmOf(c, id) {
        if (c === 'girl' || c === 'boy') return c;
        if (c !== 'any') return null;
        var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
        return h & 1 ? 'boy' : 'girl';
    }
    if (AGP.events && typeof AGP.events.on === 'function') {
        AGP.events.on('stream:commentReceived', function (c) {
            if (!c || typeof c.text !== 'string' || !c.id) return;
            var id = String(c.id), name = String(c.name || c.id).trim() || 'لاعب';
            if (S.phase === 'join') { if (norm(c.text) === norm(CFG.joinWord) && $('bAuto').getAttribute('aria-checked') === 'true') addPlayer(id, name, vrmOf(c.character, id)); }
            else answer(id, c.text);
        });
    }

    // ---------- أزرار ----------
    $('bStart').onclick = start;
    $('bAgain').onclick = reset;
    $('bBack').onclick = function () { location.href = 'index.html'; };
    $('bExit').onclick = function () { location.href = '../../games.html'; };
    $('bSettings').onclick = function () { location.href = 'index.html'; };
    $('bEvents').onclick = function (e) { e.stopPropagation(); $('evPanel').hidden = !$('evPanel').hidden; };
    document.addEventListener('click', function (e) { if (!$('evPanel').contains(e.target)) $('evPanel').hidden = true; });
    $('bAuto').onclick = function () { var b = $('bAuto'); b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); };

    // ---------- نمط التجربة ----------
    var DEMO_ACC = +params.get('acc') || .7;
    var NAMES = ['سارا', 'فهد', 'نوره', 'عبدالله', 'ريم', 'خالد', 'لمى', 'تركي', 'جود', 'سلطان', 'هيا', 'ماجد', 'دانة', 'ناصر', 'غلا', 'بندر', 'شهد', 'راكان'];
    function demoJoin(n) { for (var i = 0; i < n; i++) addPlayer('demo:' + i, NAMES[i % NAMES.length], i % 5 === 1 ? 'girl' : i % 5 === 3 ? 'boy' : null); }
    function demoAnswers() {
        alive().forEach(function (p) {
            setTimeout(function () { answer(p.id, Math.random() < DEMO_ACC ? String(correctLane(S.qs[S.row]) + 1) : String(2 - correctLane(S.qs[S.row]))); }, 800 + Math.random() * (CFG.answerSec - 4) * 1000);
        });
    }
    // للتجربة ولقطات الشاشة
    AGP.abyssGame = { state: S, cfg: CFG, start: start, pause: function () { clearInterval(timer); }, reveal: function () { clearInterval(timer); reveal(); }, answer: answer, addPlayer: addPlayer, demoJoin: demoJoin, render: render, push: pushScene };
    ensureRows(CFG.mode === 'steps' ? CFG.steps : 6); // الجسر يبان من اللوبي
    if (DEMO) demoJoin(+params.get('n') || 12);

    pushScene(); render();
}(window.AymanGamesPlatform));
