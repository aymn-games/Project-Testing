/**
 * حصيلة — لعبة فريقين بلوحة فئات وأسئلة (200 / 400 / 600).
 *
 * الشاشات (صفحة وحدة): الإعدادات ← اختيار الفئات ← اللوبي ← اللوحة ← السؤال ← الفوز.
 *  - الدخول: المشاهد يكتب كلمة فريقه بالشات (stream:commentReceived). تبديل الفريق يتجاهل بصمت.
 *    بعد بداية المباراة يدخل بس لو «الدخول التلقائي» شغّال.
 *  - اللعب: الفريق صاحب الدور (الستريمر يضغط الخانة بداله) يجاوب بالشات خلال «وقت الإجابة»،
 *    وأول جواب صح من أي لاعب بالفريق ياخذ النقاط. لو خلص الوقت، السؤال ينفتح للفريقين OPEN_SECS ثانية.
 *    بعد كل سؤال الدور ينتقل للفريق الثاني، ولما تخلص الخانات (أو يضغط الستريمر «إنهاء») تطلع شاشة الفوز.
 *  - النقاط والإحصائيات: AGPAuth.reportMatchPoints مرة وحدة لكل مباراة (teamGame) — هي اللي تحسب
 *    نقاط اللاعبين وإحصائياتهم، وساعات الستريمر وعدد مشاركينه (backend/http/auth-router.js).
 *  - البثوث النشطة: الاتصال بالبث يرسل مسار الصفحة (/games/hasila/) والخادم يعرض الاسم من
 *    GAME_NAMES بـbackend/websocket/ws-server.js.
 *  - بنك الأسئلة: questions/*.js (AGP.hasilaBank)، وصور الفئات: hs-art.js (AGP.hasilaArt).
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    if (!AGP.log) AGP.log = function () {};

    var LIB_URL = '../../games.html';
    var SETTINGS_KEY = 'hs-settings';
    var SEEN_KEY = 'hs-seen';
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';
    var OPEN_SECS = 15;          // الوقت المفتوح للفريقين بعد ما يخلص وقت الفريق
    var BACK_TO_BOARD_MS = 4500; // بعد كشف الجواب يرجع للوحة تلقائياً
    var ROWS = [200, 200, 400, 400, 600, 600];
    var LEVEL = { 200: 'سهل', 400: 'متوسط', 600: 'صعب' };
    var MIN_CATS = 2, MAX_CATS = 6;

    var BANK = AGP.hasilaBank || {};
    var ART = AGP.hasilaArt || { CATS: [], svgFor: function () { return ''; } };
    var CATS = ART.CATS.map(function (c) {
        var b = BANK[c.k];
        return Object.assign({}, c, { ready: !!(b && b.questions && b.questions.length), n: b ? b.questions.length + ' سؤال' : 'قريبًا' });
    });
    function catOf(k) { for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return CATS[i]; return null; }

    // ---------- أدوات ----------
    function readJSON(key, fb) { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
    function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function $(id) { return document.getElementById(id); }
    function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }
    function fmtDur(ms) {
        var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
    }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    // قراءة الإجابات بكل الطرق (أساس اللعبة): التشكيل ما يفرق، «ال» التعريف ما تفرق (مكتوبة أو لا)،
    // ة = ه، أ إ آ = ا، ى = ي، ؤ/ئ/ء، الأرقام العربية والإنجليزية والأرقام بالحروف، المسافات والرموز، وتكرار الحرف.
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
            .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/).map(function (w) { w = w.replace(/^ال/, ''); return NUM_WORDS[w] || w; }).join('')
            .replace(/(\p{L})\1+/gu, '$1');
    }
    // الأرقام بالحروف = الأرقام نفسها («ستة» = «6»)، بعد التطبيع (ة ← ه، الهمزات ← ا/ي)
    var NUM_WORDS = {
        'صفر': '0', 'واحد': '1', 'واحده': '1', 'وحده': '1', 'اثنين': '2', 'اثنان': '2', 'ثنين': '2', 'ثنتين': '2', 'اثنتين': '2',
        'ثلاث': '3', 'ثلاثه': '3', 'تلات': '3', 'اربع': '4', 'اربعه': '4', 'خمس': '5', 'خمسه': '5', 'ست': '6', 'سته': '6', 'سبع': '7', 'سبعه': '7',
        'ثمان': '8', 'ثماني': '8', 'ثمانيه': '8', 'ثمنيه': '8', 'تسع': '9', 'تسعه': '9', 'عشر': '10', 'عشره': '10',
        'عشرين': '20', 'ثلاثين': '30', 'اربعين': '40', 'خمسين': '50', 'ستين': '60', 'سبعين': '70', 'ثمانين': '80', 'تسعين': '90',
        'ميه': '100', 'مايه': '100', 'مية': '100', 'الف': '1000'
    };

    // ---------- الإعدادات ----------
    var DEFAULTS = {
        teams: [{ name: 'السماوي', kw: 'سماوي' }, { name: 'الوردي', kw: 'وردي' }],
        who: 'all', answerTime: 30, autoJoin: true,
        cats: CATS.filter(function (c) { return c.ready; }).slice(0, MAX_CATS).map(function (c) { return c.k; })
    };
    function loadSettings() {
        var s = readJSON(SETTINGS_KEY, null) || {};
        var out = JSON.parse(JSON.stringify(DEFAULTS));
        if (Array.isArray(s.teams) && s.teams.length === 2) out.teams = s.teams.map(function (t, i) { return { name: String(t.name || DEFAULTS.teams[i].name).slice(0, 20), kw: String(t.kw || DEFAULTS.teams[i].kw).slice(0, 20) }; });
        if (s.who === 'followers') out.who = 'followers';
        if ([20, 30, 45, 60].indexOf(s.answerTime) >= 0) out.answerTime = s.answerTime;
        if (typeof s.autoJoin === 'boolean') out.autoJoin = s.autoJoin;
        if (Array.isArray(s.cats)) {
            var c = s.cats.filter(function (k) { var x = catOf(k); return x && x.ready; }).slice(0, MAX_CATS);
            if (c.length >= MIN_CATS) out.cats = c;
        }
        return out;
    }
    function saveSettings() { writeJSON(SETTINGS_KEY, S.settings); }

    // ---------- الحالة ----------
    var S = {
        screen: 'settings',
        settings: loadSettings(),
        players: {},            // id → {id, name, avatar, winCard, team, correct}
        teams: [{ score: 0, members: [] }, { score: 0, members: [] }],
        board: [],              // [{k, tiles:[{p, qi, q, used, by}]}]
        turn: 0,
        cur: null,              // السؤال المفتوح {col, row, q, phase:'turn'|'open'|'done', endsAt, total, winner}
        log: [],                // [{k, p, team, player}] — لإحصائيات المباراة
        asked: 0,
        matchStartedAt: 0,
        endedAt: 0,
        reported: false,
        pointsLabel: null,      // نقاط المنصة لكل فائز (من رد reportMatchPoints)
        endSure: false
    };
    var timers = { tick: null, back: null, endSure: null };

    // ---------- الاتصال بالبث ----------
    function savedConnection() {
        var d = readJSON(STREAM_CONNECTION_STORAGE_KEY, null);
        return d && typeof d.username === 'string' && d.username ? d : null;
    }
    var liveStatus = savedConnection() ? 'connecting' : 'off';
    function connectStream() {
        var saved = savedConnection();
        if (!saved || !AGP.streamConnector) { liveStatus = 'off'; return; }
        try { AGP.streamConnector.connect('tiktok', { username: saved.username }); } catch (e) { AGP.log('hasila: connect failed', e); }
    }
    if (AGP.events && typeof AGP.events.on === 'function') {
        AGP.events.on('stream:statusChanged', function (p) {
            if (!p || p.platform !== 'tiktok') return;
            liveStatus = p.status === 'connected' ? 'on' : (p.status === 'connecting' ? 'connecting' : 'off');
            renderHeader();
        });
        AGP.events.on('stream:commentReceived', function (p) {
            if (!p || typeof p.text !== 'string' || !p.id) return;
            onComment(p);
        });
    }
    window.addEventListener('agp:stream-ended', function () { liveStatus = 'off'; renderHeader(); });

    // ---------- الأصوات (WebAudio بدون ملفات) ----------
    var actx = null;
    function tone(freqs, dur, type, vol) {
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            if (actx.state === 'suspended') actx.resume();
            var t0 = actx.currentTime;
            freqs.forEach(function (f, i) {
                var o = actx.createOscillator(), g = actx.createGain();
                o.type = type || 'sine'; o.frequency.value = f;
                var st = t0 + i * dur * 0.8;
                g.gain.setValueAtTime(0.0001, st);
                g.gain.exponentialRampToValueAtTime(vol || 0.12, st + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
                o.connect(g); g.connect(actx.destination); o.start(st); o.stop(st + dur + 0.05);
            });
        } catch (e) {}
    }
    var SFX = {
        join: function () { tone([660, 990], 0.12, 'triangle', 0.08); },
        pick: function () { tone([520, 780], 0.1, 'triangle', 0.1); },
        correct: function () { tone([523, 659, 784, 1047], 0.16, 'triangle', 0.14); },
        open: function () { tone([440, 330], 0.18, 'sawtooth', 0.06); },
        none: function () { tone([330, 247, 196], 0.22, 'sine', 0.12); },
        tick: function () { tone([1200], 0.05, 'square', 0.03); },
        win: function () { tone([523, 659, 784, 1047, 1319], 0.2, 'triangle', 0.14); }
    };

    // ---------- تنبيهات ----------
    function toast(html) {
        var box = $('toasts'); if (!box) return;
        var el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html;
        box.appendChild(el);
        while (box.children.length > 3) box.removeChild(box.firstChild);
        setTimeout(function () { el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300); }, 2600);
    }
    function avatarHtml(p, cls) {
        var ini = esc(String(p.name || '?').trim().charAt(0) || '?');
        if (p.avatar) return '<img class="av ' + (cls || '') + '" src="' + esc(p.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<span class=&quot;av ' + (cls || '') + '&quot;>' + ini + '</span>\'">';
        return '<span class="av ' + (cls || '') + '">' + ini + '</span>';
    }
    function teamColor(k) { return k === 0 ? 'var(--t0)' : 'var(--t1)'; }
    function teamName(k) { return S.settings.teams[k].name; }

    // ---------- الشات: الدخول والإجابات ----------
    function teamOfKeyword(text) {
        var t = norm(text); if (!t) return -1;
        for (var i = 0; i < 2; i++) if (norm(S.settings.teams[i].kw) === t) return i;
        return -1;
    }
    function inMatch() { return S.screen === 'board' || S.screen === 'question'; }
    function onComment(p) {
        var known = S.players[p.id];
        if (known) { // تحديث الصورة/بطاقة الفوز لو وصلت متأخرة
            if (p.avatarUrl && !known.avatar) known.avatar = p.avatarUrl;
            if (p.winCard !== undefined) known.winCard = p.winCard || null;
        }
        var k = teamOfKeyword(p.text);
        if (k >= 0) { tryJoin(p, k); return; }
        if (S.screen === 'question') tryAnswer(p);
    }
    function tryJoin(p, k) {
        if (S.players[p.id] && !S.players[p.id].kicked) return; // موجود بفريق — تبديل الفريق يتجاهل بصمت
        if (S.screen === 'settings' || S.screen === 'win') return;
        if (inMatch() && !S.settings.autoJoin) return;
        if (S.settings.who === 'followers' && !p.isFollower) return;
        var pl = S.players[p.id] || { id: p.id, correct: 0 };
        pl.name = String(p.name || p.id).trim() || String(p.id);
        pl.avatar = p.avatarUrl || pl.avatar || null;
        pl.winCard = p.winCard || pl.winCard || null;
        pl.team = k; pl.kicked = false;
        S.players[p.id] = pl;
        S.teams[k].members.push(p.id);
        if (AGP.winCard && pl.winCard && AGP.winCard.preloadFor) AGP.winCard.preloadFor(playerForCard(pl));
        SFX.join();
        toast(avatarHtml(pl) + '<span><b style="color:' + teamColor(k) + '">' + esc(pl.name) + '</b> ' + (inMatch() ? 'دخل المباراة مع ' : 'انضم إلى ') + 'الفريق ' + esc(teamName(k)) + '</span>');
        if (S.screen === 'lobby') renderLobbyLists(); else if (inMatch()) { renderHeader(); renderTeamsBar(); }
        else renderHeader();
    }
    function kick(id) {
        var pl = S.players[id]; if (!pl) return;
        var m = S.teams[pl.team].members, i = m.indexOf(id);
        if (i >= 0) m.splice(i, 1);
        pl.kicked = true;
    }
    function answersOf(q) { return [q.a].concat(q.alt || []); }
    function isCorrect(text, q) {
        var t = norm(text); if (!t) return false;
        return answersOf(q).some(function (a) { return norm(a) === t; });
    }
    function tryAnswer(p) {
        var c = S.cur; if (!c || c.phase === 'done') return;
        var pl = S.players[p.id]; if (!pl || pl.kicked) return;
        if (c.phase === 'turn' && pl.team !== S.turn) return;
        if (!isCorrect(p.text, c.q)) return;
        reveal(pl);
    }

    // ---------- الأسئلة واللوحة ----------
    function pickQuestion(k, p, taken) {
        var qs = BANK[k].questions, seen = readJSON(SEEN_KEY, {});
        var key = k + ':' + p, used = seen[key] || [];
        var pool = [];
        for (var i = 0; i < qs.length; i++) if (qs[i].p === p && taken.indexOf(i) < 0) pool.push(i);
        var fresh = pool.filter(function (i) { return used.indexOf(i) < 0; });
        if (!fresh.length) { used = []; fresh = pool; } // خلصت أسئلة المستوى — تبدأ الدورة من جديد
        if (!fresh.length) return -1;
        var qi = fresh[Math.floor(Math.random() * fresh.length)];
        used.push(qi); seen[key] = used; writeJSON(SEEN_KEY, seen);
        return qi;
    }
    function buildBoard() {
        S.board = S.settings.cats.map(function (k) {
            var taken = [];
            var tiles = ROWS.map(function (p) {
                var qi = pickQuestion(k, p, taken); taken.push(qi);
                return { p: p, qi: qi, q: qi >= 0 ? BANK[k].questions[qi] : null, used: qi < 0, by: -1 };
            });
            return { k: k, tiles: tiles };
        });
    }
    function tilesLeft() {
        var n = 0; S.board.forEach(function (c) { c.tiles.forEach(function (t) { if (!t.used) n++; }); }); return n;
    }

    // ---------- دورة المباراة ----------
    function clearTimers() { clearInterval(timers.tick); clearTimeout(timers.back); timers.tick = timers.back = null; }
    function resetMatch() {
        clearTimers();
        S.teams.forEach(function (t) { t.score = 0; });
        Object.keys(S.players).forEach(function (id) { S.players[id].correct = 0; });
        S.log = []; S.asked = 0; S.cur = null; S.reported = false; S.pointsLabel = null; S.endedAt = 0; S.endSure = false;
        buildBoard();
        S.turn = Math.random() < 0.5 ? 0 : 1;
        S.matchStartedAt = Date.now();
        go('board');
    }
    function openTile(col, row) {
        if (S.screen !== 'board' || S.cur) return;
        var t = S.board[col] && S.board[col].tiles[row];
        if (!t || t.used || !t.q) return;
        SFX.pick();
        S.cur = { col: col, row: row, q: t.q, phase: 'turn', endsAt: 0, total: 0, winner: null };
        startPhase('turn', S.settings.answerTime);
        go('question');
    }
    function startPhase(phase, secs) {
        var c = S.cur; c.phase = phase; c.total = secs; c.endsAt = Date.now() + secs * 1000; c.lastSec = secs;
        clearInterval(timers.tick);
        timers.tick = setInterval(tick, 200);
    }
    function tick() {
        var c = S.cur; if (!c || c.phase === 'done' || S.screen !== 'question') return;
        var left = Math.max(0, c.endsAt - Date.now()), sec = Math.ceil(left / 1000);
        var ring = $('ring');
        if (ring) {
            ring.style.setProperty('--p', (left / (c.total * 1000) * 100).toFixed(1));
            ring.style.setProperty('--c', sec <= 5 ? '#f87171' : (c.phase === 'open' ? '#fbbf24' : (S.turn === 0 ? '#38bdf8' : '#f472b6')));
            ring.querySelector('b').textContent = sec;
        }
        if (sec !== c.lastSec) { c.lastSec = sec; if (sec <= 5 && sec > 0) SFX.tick(); }
        if (left > 0) return;
        if (c.phase === 'turn') { SFX.open(); startPhase('open', OPEN_SECS); renderQuestion(); }
        else reveal(null);
    }
    function reveal(pl) {
        var c = S.cur; if (!c || c.phase === 'done') return;
        clearInterval(timers.tick); timers.tick = null;
        c.phase = 'done'; c.winner = pl ? pl.id : null;
        var col = S.board[c.col], t = col.tiles[c.row];
        t.used = true; t.by = pl ? pl.team : -1;
        S.asked++;
        if (pl) {
            S.teams[pl.team].score += t.p; pl.correct++;
            SFX.correct();
        } else SFX.none();
        S.log.push({ k: col.k, p: t.p, team: pl ? pl.team : -1, player: pl ? pl.id : null });
        renderQuestion();
        if (pl) bump(pl.team);
        clearTimeout(timers.back);
        timers.back = setTimeout(backToBoard, BACK_TO_BOARD_MS);
    }
    function backToBoard() {
        clearTimeout(timers.back); timers.back = null;
        if (S.screen !== 'question' || !S.cur || S.cur.phase !== 'done') return;
        S.cur = null;
        S.turn = 1 - S.turn;
        if (!tilesLeft()) { finish(); return; }
        go('board');
    }
    function swapQuestion() {
        var c = S.cur; if (!c || c.phase === 'done') return;
        var col = S.board[c.col], t = col.tiles[c.row];
        var taken = col.tiles.map(function (x) { return x.qi; });
        var qi = pickQuestion(col.k, t.p, taken);
        if (qi < 0) { toast('<span>ما فيه سؤال بديل بنفس المستوى</span>'); return; }
        t.qi = qi; t.q = BANK[col.k].questions[qi]; c.q = t.q;
        startPhase('turn', S.settings.answerTime);
        renderQuestion();
    }
    function finish() {
        clearTimers();
        S.cur = null;
        S.endedAt = Date.now();
        go('win');
        SFX.win();
        reportPoints();
    }
    function winnerTeam() {
        var a = S.teams[0].score, b = S.teams[1].score;
        return a === b ? -1 : (a > b ? 0 : 1);
    }
    function activePlayers() {
        return Object.keys(S.players).map(function (id) { return S.players[id]; }).filter(function (p) { return !p.kicked; });
    }
    // نظام نقاط المنصة (CLAUDE.md): مرة وحدة لكل مباراة، وكل لاعبي الفريق الفائز فائزين.
    function reportPoints() {
        if (S.reported) return;
        S.reported = true;
        if (!S.asked) { S.pointsLabel = '—'; renderWinPoints(); return; } // مباراة انتهت قبل أي سؤال: ما تنحسب
        var A = window.AGPAuth;
        if (!A || typeof A.reportMatchPoints !== 'function') { S.pointsLabel = '—'; renderWinPoints(); return; }
        var w = winnerTeam();
        var winners = w >= 0 ? S.teams[w].members.slice() : [];
        var players = activePlayers().map(function (p) { return { id: p.id, name: p.name }; });
        var matchId = S.matchStartedAt;
        A.reportMatchPoints({ players: players, winnerIds: winners, teamGame: true, durationMs: (S.endedAt || Date.now()) - S.matchStartedAt })
            .then(function (res) {
                if (matchId !== S.matchStartedAt) return; // بدأت مباراة ثانية قبل ما يوصل الرد
                var best = null;
                if (res && Array.isArray(res.awarded)) {
                    var winNames = {};
                    // نفس استخراج يوزر تيك توك بـauth-client.js (tiktok:<username> وإلا اسم اللاعب)
                    winners.forEach(function (id) {
                        var pl = S.players[id], u = String(id).indexOf('tiktok:') === 0 ? String(id).slice(7) : (pl && pl.name) || String(id);
                        winNames[u.toLowerCase()] = true;
                    });
                    res.awarded.forEach(function (r) { if (winNames[String(r.tiktokUsername || '').toLowerCase()] && (best === null || r.added > best)) best = r.added; });
                }
                S.pointsLabel = best !== null ? '+' + best : '—';
                renderWinPoints();
            });
    }

    // ---------- التنقل والرسم ----------
    function go(screen) {
        S.screen = screen;
        closeModal();
        render();
        window.scrollTo(0, 0);
    }
    function render() {
        renderHeader();
        var app = $('app');
        app.innerHTML = ({ settings: viewSettings, cats: viewCats, lobby: viewLobby, board: viewBoard, question: viewQuestion, win: viewWin })[S.screen]();
        if (S.screen === 'question') tick();
        if (S.screen === 'win') fillWinCards();
    }
    var ICON = {
        exit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
        fs: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
        users: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        stats: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="18" y1="20" x2="18" y2="10"/></svg>',
        redo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        trophy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>'
    };
    function renderHeader() {
        var h = $('hdr'); if (!h) return;
        var live = liveStatus === 'on' ? '<span class="live"><i></i>متصل بالبث</span>'
            : liveStatus === 'connecting' ? '<span class="live wait"><i></i>جاري الاتصال…</span>'
            : '<a class="live off" href="' + LIB_URL + '"><i></i>غير متصل بالبث</a>';
        var n = activePlayers().length;
        var right = '<button class="hb exit" data-act="exit">' + ICON.exit + '<span class="lbl">مكتبة الألعاب</span></button>';
        if (inMatch()) right += '<button class="hb danger' + (S.endSure ? ' sure' : '') + '" data-act="end"><span>' + (S.endSure ? 'متأكد؟ اضغط مرة ثانية' : 'إنهاء المباراة') + '</span></button>';
        var left = live + '<button class="hb ic" data-act="fs" title="ملء الشاشة">' + ICON.fs + '</button>';
        if (S.screen !== 'settings') left += '<button class="hb" data-act="players">' + ICON.users + '<span class="lbl">اللاعبين</span> <span class="n">' + n + '</span></button>';
        if (inMatch()) left += '<div class="aj"><span class="lbl">الدخول التلقائي</span><button class="tg' + (S.settings.autoJoin ? ' on' : '') + '" data-act="autojoin" aria-label="الدخول التلقائي"><i></i></button></div>';
        h.innerHTML = '<div class="hr">' + right + '</div><div class="mid"><img class="logo" src="../../logo.png" alt="ألعاب أيمن"></div><div class="hl">' + left + '</div>';
    }

    // ----- الإعدادات -----
    function kwProblem() {
        var a = norm(S.settings.teams[0].kw), b = norm(S.settings.teams[1].kw);
        if (!a || !b) return 'اكتب كلمة دخول لكل فريق';
        if (a === b) return 'كلمة الدخول لازم تختلف بين الفريقين';
        if (!S.settings.teams[0].name.trim() || !S.settings.teams[1].name.trim()) return 'اكتب اسم لكل فريق';
        return '';
    }
    function pills(field, opts) {
        return '<div class="pills">' + opts.map(function (o) {
            return '<button class="pill' + (S.settings[field] === o.v ? ' on' : '') + '" data-act="set" data-f="' + field + '" data-v="' + o.v + '">' + o.t + '</button>';
        }).join('') + '</div>';
    }
    function viewSettings() {
        var teamCard = function (k) {
            var t = S.settings.teams[k];
            return '<section class="card"><div class="card-h"><span class="num">' + (k + 1) + '</span><b style="color:' + teamColor(k) + '">الفريق ' + esc(t.name) + '</b></div>' +
                '<div class="row"><div class="row-l"><b><i class="dot" style="background:' + teamColor(k) + '"></i>اسم الفريق</b></div>' +
                '<input class="inp" data-in="name" data-k="' + k + '" value="' + esc(t.name) + '" maxlength="20"></div>' +
                '<div class="row"><div class="row-l"><b>الكلمة المفتاحية للانضمام</b><span>يكتبها اللاعب بالشات ويدخل</span></div>' +
                '<input class="inp" data-in="kw" data-k="' + k + '" value="' + esc(t.kw) + '" maxlength="20" style="color:' + teamColor(k) + '"></div></section>';
        };
        var prob = kwProblem();
        return '<div class="title"><b>حصيلة</b>' + '<span class="badge">فريقين · فئات · 200 / 400 / 600</span></div>' +
            '<div class="set-grid">' + teamCard(0) + teamCard(1) +
            '<section class="card wide"><div class="card-h"><span class="num">3</span><b>المباراة</b></div>' +
            '<div class="row"><div class="row-l"><b>مين مسموح له ينضم؟</b><span>المتابعون فقط: اللي ما يتابع حسابك تتجاهل اللعبة رسالته</span></div>' + pills('who', [{ v: 'all', t: 'الجميع' }, { v: 'followers', t: 'المتابعون فقط' }]) + '</div>' +
            '<div class="row"><div class="row-l"><b>وقت الإجابة</b><span>الوقت اللي يجاوب فيه الفريق اللي اختار السؤال، وبعده ' + OPEN_SECS + ' ثانية مفتوحة للفريقين</span></div>' + pills('answerTime', [{ v: 20, t: '20 ث' }, { v: 30, t: '30 ث' }, { v: 45, t: '45 ث' }, { v: 60, t: '60 ث' }]) + '</div>' +
            '<div class="row"><div class="row-l"><b>الدخول التلقائي أثناء المباراة</b><span>اللاعب الجديد يكتب الكلمة المفتاحية ويدخل حتى بعد بداية المباراة</span></div>' +
            '<button class="tg' + (S.settings.autoJoin ? ' on' : '') + '" data-act="toggle" data-f="autoJoin" aria-label="الدخول التلقائي"><i></i></button></div>' +
            '</section></div>' +
            '<div class="foot"><button class="bp" data-act="toCats"' + (prob ? ' disabled' : '') + '>التالي: اختيار الفئات</button></div>' +
            '<p class="hint" id="setHint">' + esc(prob) + '</p>';
    }

    // ----- الفئات -----
    function viewCats() {
        var sel = S.settings.cats;
        var cards = CATS.map(function (c, i) {
            var on = sel.indexOf(c.k) >= 0;
            return '<button class="cat' + (on ? ' on' : '') + (c.ready ? '' : ' soon') + '" data-act="cat" data-k="' + c.k + '"' + (c.ready ? '' : ' aria-disabled="true"') + '>' +
                '<div class="art">' + ART.svgFor(c, 'k' + i) + '</div>' +
                '<div class="tx"><b>' + esc(c.t) + '</b>' + (c.ready ? '<span>' + esc(c.n) + '</span>' : '<span class="soon-tag">قريبًا</span>') + '</div>' +
                '<span class="chk"></span></button>';
        }).join('');
        var ok = sel.length >= MIN_CATS;
        return '<div class="title"><b>اختر الفئات</b><span class="badge" id="catCnt">' + sel.length + ' / ' + MAX_CATS + ' مختارة</span></div>' +
            '<div class="cg">' + cards + '</div>' +
            '<p class="hint">كل فئة فيها 6 أسئلة: 2 سهل (200) · 2 متوسط (400) · 2 صعب (600) — اختر من ' + MIN_CATS + ' إلى ' + MAX_CATS + ' فئات</p>' +
            '<div class="foot"><button class="bs" data-act="toSettings">رجوع</button><button class="bp" data-act="toLobby"' + (ok ? '' : ' disabled') + '>التالي: اللوبي</button></div>';
    }

    // ----- اللوبي -----
    function playerChip(p, kickable) {
        return '<span class="pchip">' + avatarHtml(p) + '<span>' + esc(p.name) + '</span>' +
            (kickable ? '<button class="x" data-act="kick" data-id="' + esc(p.id) + '" aria-label="إخراج ' + esc(p.name) + '">✕</button>' : '') + '</span>';
    }
    function membersOf(k) { return S.teams[k].members.map(function (id) { return S.players[id]; }).filter(Boolean); }
    function lobbyCol(k) {
        var t = S.settings.teams[k], m = membersOf(k);
        return '<section class="tcol" style="border-color:' + (k === 0 ? 'rgba(56,189,248,.35)' : 'rgba(244,114,182,.35)') + '">' +
            '<div class="tcol-h"><b style="color:' + teamColor(k) + '">الفريق ' + esc(t.name) + '</b><span class="cnt" id="cnt' + k + '">' + m.length + ' لاعب</span></div>' +
            '<div class="kw" style="color:' + teamColor(k) + '"><span>الكلمة المفتاحية · اكتبها في الشات للانضمام</span><b>' + esc(t.kw) + '</b></div>' +
            '<div class="plist" id="pl' + k + '">' + listHtml(k) + '</div></section>';
    }
    function listHtml(k) {
        var m = membersOf(k);
        return m.length ? m.map(function (p) { return playerChip(p, true); }).join('') : '<div class="empty">بانتظار اللاعبين… اكتب «' + esc(S.settings.teams[k].kw) + '» بالشات</div>';
    }
    function lobbyReady() { return membersOf(0).length > 0 && membersOf(1).length > 0; }
    function viewLobby() {
        return '<div class="title"><b>لوبي الدخول</b><span class="badge">' + S.settings.cats.length + ' فئات · ' + S.settings.cats.length * 6 + ' سؤال</span></div>' +
            '<div class="lob">' + lobbyCol(0) + lobbyCol(1) + '</div>' +
            '<div class="foot"><button class="bs" data-act="toCats">رجوع</button><button class="bp" id="startBtn" data-act="start"' + (lobbyReady() ? '' : ' disabled') + '>ابدأ المباراة</button></div>' +
            '<p class="hint" id="lobHint">' + (lobbyReady() ? '' : 'لازم لاعب واحد على الأقل بكل فريق') + '</p>';
    }
    function renderLobbyLists() {
        for (var k = 0; k < 2; k++) {
            var el = $('pl' + k); if (el) el.innerHTML = listHtml(k);
            var c = $('cnt' + k); if (c) c.textContent = membersOf(k).length + ' لاعب';
        }
        var b = $('startBtn'); if (b) b.disabled = !lobbyReady();
        var h = $('lobHint'); if (h) h.textContent = lobbyReady() ? '' : 'لازم لاعب واحد على الأقل بكل فريق';
        renderHeader();
    }

    // ----- شريط الفريقين (اللوحة والسؤال) -----
    function teamsBarHtml() {
        var box = function (k) {
            var turn = S.turn === k && (S.screen === 'board' || (S.cur && S.cur.phase === 'turn'));
            return '<div class="tbox t' + k + (turn ? ' turn' : '') + '" style="color:' + teamColor(k) + '">' +
                '<div class="tn"><b>الفريق ' + esc(teamName(k)) + '</b><span>' + membersOf(k).length + ' لاعب · «' + esc(S.settings.teams[k].kw) + '»</span></div>' +
                (turn ? '<span class="tt"><em>' + (S.screen === 'board' ? 'دوره يختار' : 'دوره يجاوب') + '</em></span>' : '') +
                '<span class="sc" id="sc' + k + '">' + fmtNum(S.teams[k].score) + '</span></div>';
        };
        return '<div class="teams" id="teamsBar">' + box(0) + '<div class="mid-logo">حصيلة</div>' + box(1) + '</div>';
    }
    function renderTeamsBar() { var el = $('teamsBar'); if (el) el.outerHTML = teamsBarHtml(); }
    function bump(k) { var el = $('sc' + k); if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

    // ----- اللوحة -----
    function viewBoard() {
        var cols = S.board.map(function (col, ci) {
            var c = catOf(col.k);
            return '<div class="col"><div class="ch"><div class="ca">' + ART.svgFor(c, 'b' + ci) + '</div><div class="ct">' + esc(c.t) + '</div></div>' +
                col.tiles.map(function (t, ri) {
                    var cls = t.used ? (t.by === 0 ? ' w0' : t.by === 1 ? ' w1' : '') : '';
                    return '<button class="tile' + cls + '" data-act="tile" data-c="' + ci + '" data-r="' + ri + '"' + (t.used ? ' disabled' : '') + '>' + t.p + '</button>';
                }).join('') + '</div>';
        }).join('');
        return teamsBarHtml() +
            '<div class="board" style="grid-template-columns:repeat(' + S.board.length + ',minmax(0,1fr))">' + cols + '</div>' +
            '<p class="board-hint">دور الفريق <b style="color:' + teamColor(S.turn) + '">' + esc(teamName(S.turn)) + '</b> يختار سؤال — اضغط الخانة اللي يختارونها · باقي ' + tilesLeft() + ' سؤال</p>';
    }

    // ----- السؤال -----
    function viewQuestion() {
        var c = S.cur, col = S.board[c.col], cat = catOf(col.k), q = c.q;
        var emoji = col.k === 'emoji';
        var meta = '<div class="qmeta"><span class="qc"><span class="mini">' + ART.svgFor(cat, 'q') + '</span>' + esc(cat.t) + '</span>' +
            '<span class="qp">' + q.p + '</span><span class="ql">' + LEVEL[q.p] + '</span></div>';
        var hint = emoji ? '<div class="qhint">' + esc(q.hint || 'خمّن') + '</div>' : (col.k === 'proverbs' ? '<div class="qhint">كمّل المثل</div>' : '');
        var body;
        if (c.phase === 'done') {
            var pl = c.winner ? S.players[c.winner] : null;
            body = '<div class="reveal">' +
                (pl ? '<div class="plus">+' + q.p + '</div>' : '') +
                '<div class="ans' + (pl ? '' : ' none') + '">' + esc(q.a) + '</div>' +
                (pl ? '<div class="by">' + avatarHtml(pl) + '<span><b style="color:' + teamColor(pl.team) + '">' + esc(pl.name) + '</b> جاوب صح للفريق ' + esc(teamName(pl.team)) + '</span></div>'
                    : '<div class="by"><span>ما أحد جاوب صح — هذا هو الجواب</span></div>') +
                '</div><div class="qctl"><button class="bs" data-act="back">رجوع للوحة</button></div>';
        } else {
            var who = c.phase === 'turn'
                ? '💬 الفريق <b style="color:' + teamColor(S.turn) + '">' + esc(teamName(S.turn)) + '</b> يجاوب الحين بالشات — أول جواب صح ياخذ النقاط'
                : '⏳ خلص وقت الفريق! السؤال <b style="color:#fbbf24">مفتوح للفريقين</b> — أول جواب صح ياخذ النقاط';
            body = '<div class="qbar"><div class="ring" id="ring"><b>' + Math.ceil(Math.max(0, c.endsAt - Date.now()) / 1000) + '</b></div><div class="who">' + who + '</div></div>' +
                '<div class="qctl"><button class="bs" data-act="swap">تبديل السؤال</button><button class="bs" data-act="reveal">كشف الجواب</button></div>';
        }
        return teamsBarHtml() + '<div class="qwrap">' + meta + hint + '<div class="qtext' + (emoji ? ' emoji' : '') + '">' + esc(q.q) + '</div>' + body + '</div>';
    }
    function renderQuestion() { if (S.screen === 'question') { $('app').innerHTML = viewQuestion(); tick(); } }

    // ----- الفوز -----
    function playerForCard(p) { return { id: p.id, name: p.name, avatarUrl: p.avatar || null, winCard: p.winCard || null }; }
    function viewWin() {
        var w = winnerTeam();
        var a = S.teams[0].score, b = S.teams[1].score;
        var color = w >= 0 ? teamColor(w) : '#c4b5fd';
        var head = w >= 0
            ? '<div class="pts" style="color:' + color + '">' + ICON.trophy + fmtNum(S.teams[w].score) + ' نقطة</div><h1 style="color:' + color + '">الفريق ' + esc(teamName(w)) + '</h1><h2>فاز بالمباراة</h2>'
            : '<div class="pts" style="color:' + color + '">' + ICON.trophy + fmtNum(a) + ' نقطة لكل فريق</div><h1 style="color:' + color + '">تعادل!</h1><h2>ما فيه فريق فائز هالمرة</h2>';
        var chips = '<div class="chips">' +
            '<div class="chip"><b>' + fmtNum(Math.max(a, b)) + ' – ' + fmtNum(Math.min(a, b)) + '</b><span>النتيجة</span></div>' +
            '<div class="chip"><b>' + fmtDur((S.endedAt || Date.now()) - S.matchStartedAt) + '</b><span>مدة المباراة</span></div>' +
            '<div class="chip"><b>' + S.asked + '</b><span>سؤال</span></div>' +
            '<div class="chip"><b>' + activePlayers().length + '</b><span>لاعب شارك</span></div>' +
            (w >= 0 ? '<div class="chip gold"><b id="winPts">' + esc(S.pointsLabel || '…') + '</b><span>نقاط المنصة لكل فائز</span></div>' : '') +
            '</div>';
        var cards = w >= 0 ? '<div class="wcards" id="wcards"></div>' : '';
        return '<div class="win">' + head + chips + cards +
            '<div class="foot"><button class="bp" data-act="restart">' + ICON.redo + ' إعادة المباراة</button>' +
            '<button class="bs" data-act="stats">' + ICON.stats + ' الإحصائيات</button>' +
            '<button class="bs" data-act="exit">' + ICON.exit + ' الخروج</button></div></div>';
    }
    function fillWinCards() {
        var box = $('wcards'); var w = winnerTeam(); if (!box || w < 0) return;
        var list = membersOf(w).slice().sort(function (x, y) { return y.correct - x.correct; }).slice(0, 12);
        box.innerHTML = list.map(function (p, i) {
            var delay = 'animation-delay:' + (0.15 + i * 0.07).toFixed(2) + 's';
            var lines = ['فوز الفريق ' + teamName(w), p.correct + ' إجابات صح', 'حصيلة'];
            if (AGP.winCard && AGP.winCard.canShow(playerForCard(p))) {
                return '<div class="wc-own" style="' + delay + '">' + AGP.winCard.renderHtml(playerForCard(p), lines) + '</div>';
            }
            return '<div class="wc" style="color:' + teamColor(w) + ';' + delay + '">' + avatarHtml(p) + '<b>' + esc(p.name) + '</b><span class="tag">فائز</span><span>' + p.correct + ' إجابات صح</span></div>';
        }).join('');
    }
    function renderWinPoints() { var el = $('winPts'); if (el) el.textContent = S.pointsLabel || '…'; }

    // ----- النوافذ: اللاعبين والإحصائيات -----
    function closeModal() { var m = $('modal'); if (m) m.innerHTML = ''; }
    function openModal(title, html) {
        $('modal').innerHTML = '<div class="mbg" data-act="closeBg"><div class="mbox" role="dialog" aria-label="' + esc(title) + '"><div class="mh"><b>' + esc(title) + '</b><button class="mx" data-act="close" aria-label="إغلاق">✕</button></div>' + html + '</div></div>';
    }
    function showPlayers() {
        var col = function (k) {
            var m = membersOf(k);
            return '<div><b style="color:' + teamColor(k) + ';font-size:18px">الفريق ' + esc(teamName(k)) + ' (' + m.length + ')</b><div class="plist" style="padding:10px 0;max-height:none">' +
                (m.length ? m.map(function (p) { return playerChip(p, true); }).join('') : '<span class="empty">ما فيه لاعبين</span>') + '</div></div>';
        };
        openModal('اللاعبين', '<div class="st-teams" style="grid-template-columns:1fr 1fr;align-items:start">' + col(0) + col(1) + '</div>');
    }
    function showStats() {
        var rows = activePlayers().slice().sort(function (x, y) { return y.correct - x.correct || x.team - y.team; });
        var perTeam = [0, 1].map(function (k) { return S.log.filter(function (l) { return l.team === k; }).length; });
        var none = S.log.filter(function (l) { return l.team < 0; }).length;
        var cats = S.settings.cats.map(function (k) {
            var L = S.log.filter(function (l) { return l.k === k; });
            return '<tr><td>' + esc(catOf(k).t) + '</td><td class="num">' + L.length + '</td><td class="num" style="color:var(--t0)">' + L.filter(function (l) { return l.team === 0; }).length +
                '</td><td class="num" style="color:var(--t1)">' + L.filter(function (l) { return l.team === 1; }).length + '</td><td class="num">' + L.filter(function (l) { return l.team < 0; }).length + '</td></tr>';
        }).join('');
        var html = '<div class="st-teams">' + [0, 1].map(function (k) {
            return '<div style="color:' + teamColor(k) + '"><span>الفريق ' + esc(teamName(k)) + '</span><b>' + fmtNum(S.teams[k].score) + '</b><span style="color:var(--mut)">' + perTeam[k] + ' إجابة صح · ' + membersOf(k).length + ' لاعب</span></div>';
        }).join('') + '</div>' +
            '<p style="color:var(--mut);margin-bottom:12px">مدة المباراة ' + fmtDur((S.endedAt || Date.now()) - S.matchStartedAt) + ' · ' + S.asked + ' سؤال · ' + none + ' بدون إجابة</p>' +
            '<table class="st"><thead><tr><th>الفئة</th><th>أسئلة</th><th>' + esc(teamName(0)) + '</th><th>' + esc(teamName(1)) + '</th><th>بدون</th></tr></thead><tbody>' + cats + '</tbody></table>' +
            '<h3 style="margin:18px 0 8px">اللاعبين</h3>' +
            '<table class="st"><thead><tr><th>#</th><th>اللاعب</th><th>الفريق</th><th>إجابات صح</th><th>نقاط جابها</th></tr></thead><tbody>' +
            (rows.length ? rows.map(function (p, i) {
                var pts = S.log.filter(function (l) { return l.player === p.id; }).reduce(function (s, l) { return s + l.p; }, 0);
                return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td style="color:' + teamColor(p.team) + '">' + esc(teamName(p.team)) + '</td><td class="num">' + p.correct + '</td><td class="num">' + fmtNum(pts) + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="num">ما فيه لاعبين</td></tr>') + '</tbody></table>';
        openModal('إحصائيات المباراة', html);
    }

    // ---------- الأحداث ----------
    var ACT = {
        exit: function () { location.href = LIB_URL; }, // بدون تأكيد
        fs: function () {
            var d = document;
            if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
            else { var e = d.documentElement; var f = e.requestFullscreen || e.webkitRequestFullscreen; if (f) f.call(e); }
        },
        players: showPlayers,
        stats: showStats,
        close: closeModal,
        closeBg: function (el, ev) { if (ev.target === el) closeModal(); },
        autojoin: function () { S.settings.autoJoin = !S.settings.autoJoin; saveSettings(); renderHeader(); },
        end: function () {
            if (!S.endSure) {
                S.endSure = true; renderHeader();
                clearTimeout(timers.endSure);
                timers.endSure = setTimeout(function () { S.endSure = false; renderHeader(); }, 3000);
                return;
            }
            clearTimeout(timers.endSure); S.endSure = false;
            finish();
        },
        set: function (el) {
            var f = el.dataset.f, v = el.dataset.v;
            S.settings[f] = f === 'answerTime' ? Number(v) : v;
            saveSettings(); render();
        },
        toggle: function (el) { var f = el.dataset.f; S.settings[f] = !S.settings[f]; saveSettings(); el.classList.toggle('on', S.settings[f]); },
        toCats: function () { if (S.screen === 'settings' && kwProblem()) return; go('cats'); },
        toSettings: function () { go('settings'); },
        toLobby: function () { if (S.settings.cats.length >= MIN_CATS) go('lobby'); },
        cat: function (el) {
            var c = catOf(el.dataset.k); if (!c || !c.ready) return;
            var sel = S.settings.cats, i = sel.indexOf(c.k);
            if (i >= 0) sel.splice(i, 1);
            else if (sel.length < MAX_CATS) sel.push(c.k);
            else { toast('<span>الحد ' + MAX_CATS + ' فئات</span>'); return; }
            saveSettings(); render();
        },
        kick: function (el) {
            kick(el.dataset.id);
            if (S.screen === 'lobby') renderLobbyLists();
            if ($('modal').innerHTML) showPlayers();
            renderHeader(); if (inMatch()) renderTeamsBar();
        },
        start: function () { if (lobbyReady()) resetMatch(); },
        tile: function (el) { openTile(Number(el.dataset.c), Number(el.dataset.r)); },
        swap: swapQuestion,
        reveal: function () { reveal(null); },
        back: backToBoard,
        restart: function () { resetMatch(); } // نفس اللاعبين والفئات، أسئلة جديدة
    };
    document.addEventListener('click', function (ev) {
        var el = ev.target.closest('[data-act]'); if (!el) return;
        var fn = ACT[el.dataset.act]; if (!fn) return;
        if (el.dataset.act !== 'closeBg') ev.preventDefault();
        fn(el, ev);
    });
    document.addEventListener('input', function (ev) {
        var el = ev.target; if (!el.dataset || !el.dataset.in) return;
        var k = Number(el.dataset.k);
        S.settings.teams[k][el.dataset.in] = el.value;
        saveSettings();
        var prob = kwProblem();
        var b = document.querySelector('[data-act="toCats"]'); if (b) b.disabled = !!prob;
        var h = $('setHint'); if (h) h.textContent = prob;
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeModal(); });

    // أداة فحص من الكونسول (للستريمر/المطوّر): AGP.hasila.sim('اسم', 'نص') يحاكي تعليق شات.
    AGP.hasila = {
        state: S,
        sim: function (name, text, extra) {
            onComment(Object.assign({ id: 'sim:' + name, name: name, text: text, isFollower: true }, extra || {}));
        }
    };

    render();
    connectStream();
}());
