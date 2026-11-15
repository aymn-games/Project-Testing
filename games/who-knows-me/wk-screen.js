/**
 * «مين يعرفني أكثر؟» — شاشة البث (مصدر الحقيقة لحالة اللعبة).
 *
 * WK.mountScreen(root, opts):
 *   opts.transport(room, onMsg, onState) — قناة الجوال (WK.relay افتراضياً، أو loopback بالتجربة)
 *   opts.onComment(cb) — اشتراك بتعليقات الشات: cb({id, name, avatarUrl, text})
 *   opts.hostUrl(room) — رابط لوحة الجوال اللي بالباركود
 *   opts.streamStatus() — {connected, username} لشارة الاتصال (اختياري)
 *   opts.onExit() — زر الخروج
 *   opts.storage — مكان حفظ الحالة (localStorage افتراضياً)
 *
 * المراحل: setup ← pick ← answer ← reveal ← review ← round ← (pick | final)
 *
 * بروتوكول الجوال (عبر القناة، كل الرسائل فيها dev = مفتاح جهاز الجوال):
 *   جوال → req {dev, name, pub}       ← wait {dev} | ok {dev, pub} | no {dev}
 *   شاشة → kick {dev} (لما ينقبل جوال ثاني مكانه أو يتجدد الباركود)
 *   بعد القبول: e {dev, to:'s'|'p', iv, data} مشفّرة بمفتاح مشترك:
 *     جوال → {c:'cmd', cmd, arg} | {c:'hb'}      شاشة → {c:'state', s}
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform = window.AymanGamesPlatform || {};
    var WK = AGP.whoKnowsMe = AGP.whoKnowsMe || {};
    var esc = function (s) { return WK.esc(s); };

    var STORE_ROOM = 'wk-room';
    var STORE_GAME = 'wk-game';
    var STORE_SETTINGS = 'wk-settings';
    var TIMES = [30, 45, 60, 90, 120];
    var MAX_ANSWER_LEN = 80;
    var AUTO_SHOW_MS = 1400;     // الحكم التلقائي يبان كذا قبل ما ينتقل
    var JUDGE_SHOW_MS = 750;     // ختم قبول/رفض يبان كذا قبل الإجابة اللي بعدها
    var GAME_TTL = 6 * 3600 * 1000;

    function initial(name) { return String(name || '?').trim().charAt(0) || '?'; }
    function avatarHtml(p, cls) {
        var img = p && p.avatar ? '<img src="' + esc(p.avatar) + '" alt="" onerror="this.remove()">' : '';
        return '<span class="wk-av ' + (cls || '') + '">' + esc(initial(p && p.name)) + img + '</span>';
    }

    WK.mountScreen = function (root, opts) {
        opts = opts || {};
        var store = opts.storage || window.localStorage;
        var transport = opts.transport || WK.relay;

        // ── الحالة ──
        var settings = Object.assign({ time: 60, auto: true, keyword: '' }, WK.readJSON(store, STORE_SETTINGS, {}));
        // كلمة الدخول المشتركة بين كل الألعاب (js/agp-shared-prefs.js)
        var SHARED = window.AGPSharedPrefs ? window.AGPSharedPrefs.bind({ keyword: 'keyword' }) : null;
        if (SHARED) settings = SHARED.fill(settings);
        if (TIMES.indexOf(settings.time) < 0) settings.time = 60;

        var G = freshGame();
        var saved = WK.readJSON(store, STORE_GAME, null);
        if (saved && saved.phase && saved.phase !== 'setup' && Date.now() - (saved.savedAt || 0) < GAME_TTL) {
            G = Object.assign(freshGame(), saved);
            if (G.phase === 'review') G.busy = false;
        }

        function freshGame() {
            return {
                phase: 'setup', round: 0, q: null, endsAt: 0, answers: [], seen: {}, idx: 0,
                players: {}, roster: [], scores: {}, roundPts: {}, used: [], matchStartedAt: 0, reported: false,
                winners: [], participants: {}, busy: false
            };
        }
        function saveGame() {
            var copy = Object.assign({}, G, { savedAt: Date.now() });
            delete copy.busy;
            WK.writeJSON(store, STORE_GAME, copy);
        }

        // ── غرفة الجوال والتحكم ──
        var R = WK.readJSON(store, STORE_ROOM, null);   // {id, pair, ctrl:{dev,name,pub}}
        var key = null;              // مفتاح AES مع الجوال المقبول
        var lastSeen = 0;            // آخر رسالة من الجوال المقبول
        var pending = {};            // dev → {name, pub, at}
        var rejected = {};           // dev → true (طلبات مرفوضة بهالجلسة)
        var chan = null, chanOk = false;

        function setupRoom(fresh) {
            if (chan) { try { chan.close(); } catch (e) {} chan = null; }
            var p = (!fresh && R && R.pair) ? Promise.resolve(R.pair) : (WK.secure.supported() ? WK.secure.newPair() : Promise.reject(new Error('no crypto')));
            return p.then(function (pair) {
                if (fresh || !R || !R.id) R = { id: WK.randomId(20), pair: pair, ctrl: null };
                R.pair = pair;
                WK.writeJSON(store, STORE_ROOM, R);
                pending = {}; key = null;
                chan = transport(R.id, onChanMsg, function (ok) { chanOk = ok; renderHead(); });
                if (R.ctrl) {
                    return WK.secure.shared(R.pair.priv, R.ctrl.pub).then(function (k) { key = k; pushState(true); });
                }
            }).catch(function (e) { AGP.log && AGP.log('WK room', e); flash('المتصفح ما يدعم الاتصال الآمن (يحتاج https)'); }).then(render);
        }

        function onChanMsg(m) {
            if (!m || typeof m.dev !== 'string' || m.dev.length > 64) return;
            if (m.t === 'req') {
                var name = String(m.name || '').trim().slice(0, 24);
                if (!name || !m.pub || typeof m.pub.x !== 'string') return;
                if (R.ctrl && R.ctrl.dev === m.dev && R.ctrl.pub.x === m.pub.x) {
                    // نفس الجوال المقبول رجع اتصل
                    R.ctrl.name = name; WK.writeJSON(store, STORE_ROOM, R);
                    chan.send({ t: 'ok', dev: m.dev, pub: R.pair.pub });
                    lastSeen = Date.now(); pushState(true); renderHead();
                    return;
                }
                if (rejected[m.dev]) { chan.send({ t: 'no', dev: m.dev }); return; }
                if (!pending[m.dev] && Object.keys(pending).length >= 6) return;
                var isNew = !pending[m.dev];
                pending[m.dev] = { name: name, pub: m.pub, at: Date.now() };
                chan.send({ t: 'wait', dev: m.dev });
                if (isNew) { WK.sfx('pop'); render(); }
                return;
            }
            if (m.t === 'e' && m.to === 's' && R.ctrl && m.dev === R.ctrl.dev && key) {
                WK.secure.decrypt(key, m).then(function (inner) {
                    lastSeen = Date.now();
                    if (inner.c === 'cmd') handleCmd(inner.cmd, inner.arg, 'phone');
                    else if (inner.c === 'hb') { renderHead(); if (inner.need) pushState(true); }
                }).catch(function () {});
            }
        }

        function acceptReq(dev) {
            var p = pending[dev];
            if (!p) return;
            if (R.ctrl && R.ctrl.dev !== dev) chan.send({ t: 'kick', dev: R.ctrl.dev });
            R.ctrl = { dev: dev, name: p.name, pub: p.pub };
            WK.writeJSON(store, STORE_ROOM, R);
            delete pending[dev];
            WK.secure.shared(R.pair.priv, p.pub).then(function (k) {
                key = k; lastSeen = Date.now();
                chan.send({ t: 'ok', dev: dev, pub: R.pair.pub });
                setTimeout(function () { pushState(true); }, 150);
                WK.sfx('ok'); flash('تم ربط جوال ' + p.name); render();
            });
        }
        function rejectReq(dev) {
            if (!pending[dev]) return;
            rejected[dev] = true;
            chan.send({ t: 'no', dev: dev });
            delete pending[dev];
            render();
        }
        function unlink() {
            if (R && R.ctrl) chan.send({ t: 'kick', dev: R.ctrl.dev });
            setupRoom(true);
        }
        function ctrlOnline() { return !!(R && R.ctrl && key && Date.now() - lastSeen < 35000); }

        // حالة مختصرة للجوال (فيها جواب المضيف — توصل مشفّرة للجوال المقبول بس)
        var _pushT = null, _pushLast = 0;
        function pushState(now) {
            if (!key || !R || !R.ctrl) return;
            var wait = now ? 0 : Math.max(0, 900 - (Date.now() - _pushLast));
            clearTimeout(_pushT);
            _pushT = setTimeout(function () {
                _pushLast = Date.now();
                var dev = R.ctrl.dev;
                WK.secure.encrypt(key, { c: 'state', s: phoneState() }).then(function (box) {
                    chan.send({ t: 'e', dev: dev, to: 'p', iv: box.iv, data: box.data });
                });
            }, wait);
        }
        function phoneState() {
            var a = G.answers[G.idx];
            return {
                phase: G.phase, round: G.round, settings: settings, joined: G.roster.length,
                q: G.q ? { text: G.q.text, answer: G.q.answer, id: G.q.id } : null,
                left: G.phase === 'answer' ? Math.max(0, G.endsAt - Date.now()) : 0,
                count: G.answers.length,
                cur: (G.phase === 'review' && a) ? { i: G.idx + 1, n: G.answers.length, name: a.name, text: a.text, verdict: a.verdict, auto: !!a.auto } : null,
                used: G.used,
                top: ranking().slice(0, 5).map(function (r) { return { name: r.name, total: r.total, pts: G.roundPts[r.id] || 0 }; }),
                winners: G.winners.map(function (id) { return (G.players[id] || {}).name; }),
                canUndo: G.phase === 'review' && (G.idx > 0 || (a && a.verdict != null))
            };
        }

        // ── منطق اللعبة ──
        var reviewTimer = null;
        function handleCmd(cmd, arg, from) {
            arg = arg || {};
            switch (cmd) {
                case 'start':
                    if (G.phase === 'setup') toLobby();
                    else if (G.phase === 'lobby' && R && R.ctrl && G.roster.length) startGame();
                    break;
                case 'settings':
                    if (G.phase !== 'setup' && G.phase !== 'lobby' && G.phase !== 'pick' && G.phase !== 'round') break;
                    if (TIMES.indexOf(arg.time) >= 0) settings.time = arg.time;
                    if (typeof arg.auto === 'boolean') settings.auto = arg.auto;
                    WK.writeJSON(store, STORE_SETTINGS, settings); render(); break;
                case 'pick': pick(arg); break;
                case 'endTime': if (G.phase === 'answer') toReveal(); break;
                case 'startReview': startReview(); break;
                case 'accept': judge(true); break;
                case 'reject': judge(false); break;
                case 'undo': undo(); break;
                case 'endReview': if (G.phase === 'review') toRound(); break;
                case 'next': if (G.phase === 'round' || (G.phase === 'reveal' && !G.answers.length)) { G.phase = 'pick'; G.round++; commit(); } break;
                case 'finish': if (G.phase === 'round' || G.phase === 'pick' || G.phase === 'reveal') finish(); break;
                case 'newGame': if (G.phase === 'final') startGame(); break;
            }
        }
        function commit() { saveGame(); render(); pushState(true); }

        function toLobby() {
            settings.keyword = String(settings.keyword || '').trim().slice(0, 40);
            if (!settings.keyword) { flash('اكتب كلمة الدخول أول'); return; }
            WK.writeJSON(store, STORE_SETTINGS, settings);
            if (SHARED) SHARED.save(settings);
            G.phase = 'lobby'; WK.sfx('pop'); commit();
        }
        function startGame() {
            var players = G.players, roster = G.roster;
            G = freshGame();
            G.players = players; G.roster = roster;
            G.phase = 'pick'; G.round = 1;
            WK.sfx('go'); commit();
        }
        function pick(arg) {
            if (G.phase !== 'pick') return;
            var text = String(arg.text || '').trim().slice(0, 140);
            var answer = String(arg.answer || '').trim().slice(0, 60);
            if (!text || !answer) return;
            var qid = typeof arg.id === 'number' ? arg.id : null;
            G.q = { text: text, answer: answer, id: qid };
            if (qid != null && G.used.indexOf(qid) < 0) G.used.push(qid);
            G.answers = []; G.seen = {}; G.idx = 0; G.roundPts = {};
            G.phase = 'answer';
            G.endsAt = Date.now() + settings.time * 1000;
            if (!G.matchStartedAt) G.matchStartedAt = Date.now();
            WK.sfx('go'); commit();
        }
        function joinPlayer(p) {
            var name = String(p.name || p.id).trim().slice(0, 30) || String(p.id);
            var old = G.players[p.id] || {};
            G.players[p.id] = { id: p.id, name: name, avatar: p.avatarUrl || old.avatar || null, frame: p.frame || old.frame || null };
            if (G.roster.indexOf(p.id) >= 0) return false;
            G.roster.push(p.id);
            return true;
        }
        function kick(id) {
            var i = G.roster.indexOf(id);
            if (i < 0) return;
            G.roster.splice(i, 1);
            commit();
        }
        // كل تعليق: كلمة الدخول = انضمام (من اللوبي وطول اللعبة)، وغيرها إجابة لو وقت الإجابة واللاعب منضم
        function onComment(p) {
            if (!p || !p.id || G.phase === 'setup') return;
            var raw = String(p.text || '');
            if (settings.keyword && WK.norm(raw) === WK.norm(settings.keyword)) {
                if (joinPlayer(p)) {
                    if (G.phase === 'lobby') { WK.sfx('pop'); renderSoon(); }
                    saveGameSoon(); pushState(false);
                }
                return;
            }
            if (G.phase !== 'answer' || Date.now() >= G.endsAt) return;
            if (G.roster.indexOf(p.id) < 0 || G.seen[p.id]) return;
            var text = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER_LEN);
            if (!text) return;
            G.seen[p.id] = 1;
            joinPlayer(p);
            var name = G.players[p.id].name;
            G.participants[p.id] = 1;
            G.answers.push({ id: p.id, name: name, avatar: G.players[p.id].avatar, text: text, verdict: null, auto: false, noAuto: false });
            saveGameSoon();
            updateLive();
            pushState(false);
        }
        var _renderT = null;
        function renderSoon() { clearTimeout(_renderT); _renderT = setTimeout(render, 120); }
        var _saveT = null;
        function saveGameSoon() { clearTimeout(_saveT); _saveT = setTimeout(saveGame, 1500); }

        function toReveal() { G.phase = 'reveal'; WK.sfx('pop'); commit(); }
        function startReview() {
            if (G.phase !== 'reveal') return;
            if (!G.answers.length) { toRound(); return; }
            G.phase = 'review'; G.idx = 0; G.busy = false;
            commit(); autoStep();
        }
        function curAns() { return G.answers[G.idx]; }
        function autoStep() {
            clearTimeout(reviewTimer);
            var a = curAns();
            if (G.phase !== 'review' || !a || a.verdict != null || !settings.auto || a.noAuto) return;
            var n = WK.norm(a.text);
            if (!n) return;
            for (var i = 0; i < G.idx; i++) {
                var b = G.answers[i];
                if (b.verdict != null && WK.norm(b.text) === n) {
                    a.verdict = b.verdict; a.auto = true; G.busy = true;
                    WK.sfx(a.verdict ? 'ok' : 'no'); commit();
                    reviewTimer = setTimeout(advance, AUTO_SHOW_MS);
                    return;
                }
            }
        }
        function judge(v) {
            var a = curAns();
            if (G.phase !== 'review' || !a || G.busy || a.verdict != null) return;
            a.verdict = v; a.auto = false; G.busy = true;
            WK.sfx(v ? 'ok' : 'no'); commit();
            clearTimeout(reviewTimer);
            reviewTimer = setTimeout(advance, JUDGE_SHOW_MS);
        }
        function advance() {
            clearTimeout(reviewTimer);
            if (G.phase !== 'review') return;
            G.busy = false;
            if (G.idx + 1 >= G.answers.length) { toRound(); return; }
            G.idx++;
            commit(); autoStep();
        }
        function undo() {
            if (G.phase !== 'review') return;
            clearTimeout(reviewTimer);
            var a = curAns();
            if (a && a.verdict != null) { a.verdict = null; a.auto = false; a.noAuto = true; }
            else if (G.idx > 0) { G.idx--; var b = curAns(); b.verdict = null; b.auto = false; b.noAuto = true; }
            G.busy = false;
            commit();
        }
        function toRound() {
            clearTimeout(reviewTimer);
            G.roundPts = {};
            G.answers.forEach(function (a) {
                if (a.verdict === true) {
                    G.roundPts[a.id] = (G.roundPts[a.id] || 0) + 1;
                    G.scores[a.id] = (G.scores[a.id] || 0) + 1;
                }
            });
            G.phase = 'round'; G.busy = false;
            WK.sfx('pop'); commit();
        }
        function ranking() {
            return Object.keys(G.scores).map(function (id) {
                var p = G.players[id] || { name: id };
                return { id: id, name: p.name, avatar: p.avatar, total: G.scores[id] };
            }).filter(function (r) { return r.total > 0; }).sort(function (a, b) { return b.total - a.total; });
        }
        function finish() {
            var rk = ranking();
            var top = rk.length ? rk[0].total : 0;
            G.winners = rk.filter(function (r) { return r.total === top && top > 0; }).map(function (r) { return r.id; });
            G.phase = 'final';
            reportPoints();
            WK.sfx('win'); commit();
        }
        function reportPoints() {
            if (G.reported) return;
            var ids = G.roster.slice();
            Object.keys(G.participants).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
            if (!ids.length) return;
            G.reported = true;
            if (window.AGPAuth && typeof window.AGPAuth.reportMatchPoints === 'function') {
                try {
                    window.AGPAuth.reportMatchPoints({
                        players: ids.map(function (id) { return { id: id, name: (G.players[id] || {}).name || id }; }),
                        winnerIds: G.winners.slice(),
                        teamGame: false,
                        durationMs: Date.now() - (G.matchStartedAt || Date.now())
                    });
                } catch (e) {}
            }
        }

        // ── الرسم ──
        root.classList.add('wk-root');
        root.innerHTML = '<div class="wk-stage"><div class="wk-fx">' + fxHtml() + '</div>' +
            '<header class="wk-head"></header><main class="wk-body"></main><div class="wk-over"></div></div>' +
            '<div class="wks" hidden></div>';
        var stage = root.querySelector('.wk-stage');
        var head = root.querySelector('.wk-head');
        var body = root.querySelector('.wk-body');
        var over = root.querySelector('.wk-over');
        var wks = root.querySelector('.wks');
        var wksFx = '<div class="wk-fx">' + fxHtml() + '</div>';
        var modal = null;

        function fit() {
            var w = root.clientWidth || window.innerWidth, h = root.clientHeight || window.innerHeight;
            var s = Math.min(w / 1920, h / 1080);
            stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
        }
        fit();
        if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else window.addEventListener('resize', fit);

        function fxHtml() {
            var h = '<i style="top:-20%;right:-10%;width:900px;height:900px;background:radial-gradient(circle,rgba(124,58,237,.22),transparent 65%)"></i>' +
                '<i style="top:30%;left:-15%;width:800px;height:800px;background:radial-gradient(circle,rgba(139,92,246,.12),transparent 65%)"></i>' +
                '<i style="bottom:-30%;left:35%;width:1000px;height:700px;background:radial-gradient(circle,rgba(168,85,247,.1),transparent 65%)"></i>';
            for (var i = 0; i < 80; i++) {
                var s = i % 9 ? 1.5 : 3;
                h += '<b style="left:' + (Math.random() * 100).toFixed(1) + '%;top:' + (Math.random() * 100).toFixed(1) + '%;width:' + s + 'px;height:' + s + 'px;opacity:' + (0.12 + Math.random() * 0.25).toFixed(2) + '"></b>';
            }
            return h;
        }

        function renderHead() {
            var st = opts.streamStatus ? opts.streamStatus() : null;
            var ctrl = R && R.ctrl;
            var ctrlChip = ctrl
                ? '<span class="wk-chip muted"><span class="wk-dot ' + (ctrlOnline() ? 'on' : 'warn') + '"></span>📱 ' + esc(ctrl.name) + '</span>'
                : '<span class="wk-chip muted"><span class="wk-dot"></span>📱 بدون جوال</span>';
            head.innerHTML =
                '<div class="wk-head-side"><button class="wk-hbtn exit" data-a="exit">خروج</button>' +
                (G.phase !== 'setup' ? '<button class="wk-hbtn" data-a="qr">باركود الجوال</button>' : '') + '</div>' +
                '<div class="wk-logo"><img src="' + (opts.logo || '../../logo.png') + '" alt="" onerror="this.replaceWith(document.createTextNode(\'مين يعرفني أكثر؟\'))"></div>' +
                '<div class="wk-head-side end">' + (settings.keyword ? '<span class="wk-chip">كلمة الدخول: <b style="color:#fff">' + esc(settings.keyword) + '</b></span>' : '') + ctrlChip +
                (st ? '<span class="wk-chip muted"><span class="wk-dot ' + (st.connected ? 'on' : '') + '"></span>' + (st.connected ? 'البث @' + esc(st.username) : 'غير متصل بالبث') + '</span>' : '') +
                '</div>';
        }

        function render() {
            var ph = G.phase;
            if (ph === 'setup' || ph === 'lobby') {
                // شاشة الإعدادات بنفس تنسيق روليت الإقصاء (صفحة عادية، مو مسرح 1920×1080)
                stage.style.display = 'none'; wks.hidden = false;
                var sc = wks.querySelector('.wks-scroll'), top = sc ? sc.scrollTop : 0;
                wks.innerHTML = ph === 'setup' ? vSetupPage() : vLobbyPage();
                if (ph === 'lobby' && AGP.playerCard && AGP.playerCard.fitAllNames) AGP.playerCard.fitAllNames(wks);
                sc = wks.querySelector('.wks-scroll'); if (sc) sc.scrollTop = top;
                if (ph === 'lobby') drawQr(wks.querySelector('.wk-qr'));
                return;
            }
            stage.style.display = ''; wks.hidden = true;
            renderHead();
            var html = ph === 'pick' ? vPick() : ph === 'answer' ? vAnswer() :
                ph === 'reveal' ? vReveal() : ph === 'review' ? vReview() : ph === 'round' ? vRound() : vFinal();
            body.innerHTML = html;
            if (ph === 'pick' && !(R && R.ctrl)) drawQr(body.querySelector('.wk-qr'));
            renderOver();
            updateLive();
        }

        function vSettingsRows() {
            return '<div class="wk-set-row"><div class="wk-pills">' + TIMES.map(function (t) {
                return '<button class="wk-pill ' + (settings.time === t ? 'on' : '') + '" data-a="time" data-v="' + t + '">' + t + '</button>';
            }).join('') + '</div><div class="wk-set-label"><b>وقت الإجابة (ثانية)</b><small>المدة اللي يكتب فيها المتابعين إجاباتهم بالشات</small></div></div>' +
            '<div class="wk-set-row"><button class="wk-toggle ' + (settings.auto ? 'on' : '') + '" data-a="auto" aria-label="الحكم التلقائي"></button>' +
            '<div class="wk-set-label"><b>الحكم التلقائي على المتطابق</b><small>إجابة تطابق إجابة حكمت عليها تاخذ نفس الحكم</small></div></div>';
        }
        function vPhoneCard() {
            var reqs = Object.keys(pending).map(function (dev) {
                return '<div class="wk-req"><div class="wk-row"><button class="wk-btn no sm" data-a="rej" data-v="' + dev + '">رفض</button>' +
                    '<button class="wk-btn ok sm" data-a="acc" data-v="' + dev + '">قبول</button></div>' +
                    '<div class="wk-req-name">' + esc(pending[dev].name) + '<small>يبي يتحكم باللعبة</small></div></div>';
            }).join('');
            var ctrl = R && R.ctrl ? '<div class="wk-ctrl"><button class="wk-btn ghost sm" data-a="unlink">إلغاء الربط</button><b><span class="wk-dot ' + (ctrlOnline() ? 'on' : 'warn') + '"></span>' + esc(R.ctrl.name) + '</b></div>' : '';
            return '<div class="wk-card"><h3 class="wk-card-h">📱 باركود الاستريمر</h3>' +
                '<div class="wk-qr-wrap"><div class="wk-qr">جاري التجهيز…</div><div class="wk-qr-txt"><b>للمضيف فقط</b>' +
                '<span>صوّره بجوالك واكتب اسمك وأرسل طلب، واقبله من هنا. بدون حساب.</span>' +
                '<div class="wk-link">' + esc(R ? opts.hostUrl(R.id) : '') + '</div></div></div>' +
                ctrl + '<div class="wk-reqs">' + reqs + '</div></div>';
        }
        // ── شاشة الإعدادات: نفس تنسيق «روليت الإقصاء» (games/elimination-roulette/index.html):
        // هيدر بزر الخروج واللوقو، عنوان متدرّج + شارة البث، أقسام مرقّمة بصفوف
        // (العنوان يمين والعنصر يسار)، وزر البدء تحت.
        var CHEV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        var EXIT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
        function wksSection(num, title, rows, delay, full) {
            return '<section class="wks-sec' + (full ? ' full' : '') + '" style="animation-delay:' + delay + 's"><div class="wks-sec-h"><span class="wks-num">' + num + '</span><span>' + title + '</span></div>' + rows + '</section>';
        }
        function wksRow(label, hint, control) {
            return '<div class="wks-row"><div class="wks-lbl"><span>' + label + '</span>' + (hint ? '<small>' + hint + '</small>' : '') + '</div>' + control + '</div>';
        }
        // الهيكل المشترك بين الإعدادات واللوبي (هيدر + عنوان + محتوى + زر تحت + نافذة الخروج)
        function wksShell(topHtml, inner, foot) {
            var exitModal = modal === 'exit' ? '<div class="wks-modal" data-a="close"><div class="wks-dialog"><span class="wks-exit-ic">' + EXIT_ICON.replace(/16/g, '28') + '</span>' +
                '<b>الخروج؟</b><small>بترجع لمكتبة الألعاب</small><div class="wks-dlg-btns"><button class="wks-ghost" data-a="close">إلغاء</button><button class="wks-danger" data-a="exitYes">خروج</button></div></div></div>' : '';
            return wksFx +
                '<header class="wks-head"><div><button class="wks-exit" data-a="exit">' + EXIT_ICON + '<span>خروج</span></button></div>' +
                '<div class="wks-logo"><img src="' + (opts.logo || '../../logo.png') + '" alt="" onerror="this.replaceWith(document.createTextNode(\'ألعاب أيمن\'))"></div><div></div></header>' +
                '<main class="wks-main"><div class="wks-wrap">' + topHtml + inner +
                '<div class="wks-foot">' + foot + '</div></div></main>' + exitModal + (flashMsg ? '<div class="wks-toast">' + esc(flashMsg) + '</div>' : '');
        }
        function liveChips() {
            var st = opts.streamStatus ? opts.streamStatus() : { connected: false };
            return '<div class="wks-chips"><span class="wks-live' + (st.connected ? ' on' : '') + '"><i></i>' + (st.connected ? 'متصل بالبث @' + esc(st.username) : 'غير متصل بالبث') + '</span>' +
                (st.connected || !opts.libraryUrl ? '' : '<a class="wks-golive" href="' + esc(opts.libraryUrl) + '">ابدأ البث ونتصل تلقائياً</a>') + '</div>';
        }
        function vSetupPage() {
            var kwCtl = '<input id="wk-keyword" class="wks-text" maxlength="40" placeholder="اكتب كلمة الدخول" value="' + esc(settings.keyword || '') + '" aria-label="كلمة الدخول">';
            var timeCtl = '<div class="wks-seg">' + TIMES.map(function (t) {
                return '<button class="' + (settings.time === t ? 'on' : '') + '" data-a="time" data-v="' + t + '">' + t + ' ث</button>';
            }).join('') + '</div>';
            var autoCtl = '<button class="wks-tg' + (settings.auto ? ' on' : '') + '" role="switch" aria-checked="' + settings.auto + '" aria-label="الحكم التلقائي على المتطابق" data-a="auto"><span></span></button>';
            var sec1 = wksRow('كلمة الدخول', 'اللي يكتبها بالشات يدخل اللعبة', kwCtl);
            var sec2 = wksRow('وقت الإجابة', 'المدة اللي يكتب فيها المتابعين إجاباتهم', timeCtl) +
                '<span class="wks-div"></span>' +
                wksRow('الحكم التلقائي على المتطابق', 'الإجابة اللي تطابق إجابة حكمت عليها تاخذ نفس الحكم', autoCtl);
            var sec3 = '<ol class="wks-how"><li>اللاعبين يدخلون بكتابة كلمة الدخول بالشات.</li><li>تختار سؤال عنك من جوالك وتكتب جوابك.</li>' +
                '<li>اللاعبين يكتبون إجاباتهم بالشات خلال الوقت.</li><li>ينكشف جوابك، وتقبل أو ترفض إجاباتهم وحدة وحدة.</li><li>كل إجابة مقبولة بنقطة، واللي يعرفك أكثر يفوز.</li></ol>';
            var ok = !!String(settings.keyword || '').trim();
            return wksShell('<div class="wks-top"><span class="wks-title">مين يعرفني أكثر؟</span>' + liveChips() + '</div>',
                '<div class="wks-scroll"><div class="wks-grid">' + wksSection(1, 'الدخول', sec1, 0) + wksSection(2, 'المباراة', sec2, 0.06) + wksSection(3, 'طريقة اللعب', sec3, 0.12, true) + '</div></div>',
                '<button class="wks-start" data-a="start"' + (ok ? '' : ' disabled') + '>الدخول للوبي' + CHEV + '</button>');
        }
        // بطاقة لاعب: بإطاره من المنصة (AGP.playerCard) لو عنده إطار، وإلا كبسولة عادية
        function cardHtml(id) {
            var p = G.players[id] || { id: id, name: id };
            var x = '<button class="wks-kick" data-a="kick" data-v="' + esc(id) + '" aria-label="طرد ' + esc(p.name) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg></button>';
            if (p.frame && p.frame.imageFilename && AGP.playerCard) {
                var html = AGP.playerCard.renderHtml({ id: p.id, name: p.name, avatarUrl: p.avatar || null, frame: p.frame }, { showFrame: true, basePath: opts.basePath || '../../', size: 44 });
                return '<div class="wks-card framed"><div class="wks-frame">' + html + x + '</div></div>';
            }
            var img = p.avatar ? '<img src="' + esc(p.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
            return '<div class="wks-card"><span class="wks-av">' + esc(initial(p.name)) + img + '</span><span class="wks-pname">' + esc(p.name) + '</span>' + x + '</div>';
        }
        function vLobbyPage() {
            var linked = !!(R && R.ctrl);
            var n = G.roster.length;
            var cards = n ? '<div class="wks-cards">' + G.roster.map(cardHtml).join('') + '</div>'
                : '<div class="wks-empty">بانتظار انضمام اللاعبين…</div>';
            var players = '<section class="wks-sec wks-players"><span class="wks-halo"></span>' +
                '<div class="wks-ph"><div class="wks-ph-row"><span class="wks-team"><i></i>اللاعبين</span>' +
                '<span class="wks-count"><b>' + n + '</b> لاعب</span></div>' +
                '<span class="wks-kw-lbl">كلمة الدخول · اكتبها في الشات</span><span class="wks-kw">' + esc(settings.keyword) + '</span></div>' +
                '<div class="wks-plist">' + cards + '</div></section>';

            var reqs = Object.keys(pending).map(function (dev) {
                return '<div class="wks-row wks-req">' +
                    '<div class="wks-lbl"><span>' + esc(pending[dev].name) + '</span><small>يبي يتحكم باللعبة</small></div>' +
                    '<div class="wks-btns"><button class="wks-ok" data-a="acc" data-v="' + dev + '">قبول</button><button class="wks-no" data-a="rej" data-v="' + dev + '">رفض</button></div></div>';
            }).join('');
            var ctrl = linked ? '<div class="wks-row wks-ctrl"><div class="wks-lbl"><span><i class="wks-dot' + (ctrlOnline() ? ' on' : '') + '"></i>' + esc(R.ctrl.name) + '</span><small>جوالك مربوط ✓</small></div>' +
                '<button class="wks-ghost" data-a="unlink">إلغاء الربط</button></div>' : '';
            var qr = '<section class="wks-sec wks-host"><div class="wks-sec-h"><span class="wks-num">📱</span><span>باركود الاستريمر</span><span class="wks-only">للمضيف فقط</span></div>' +
                '<div class="wks-qr-big"><div class="wk-qr wks-qr2">جاري التجهيز…</div></div>' +
                '<ul class="wks-steps"><li>صوّره بكاميرا جوالك ويفتح على طول، بدون حساب.</li>' +
                '<li>اكتب اسمك واضغط «إرسال طلب»، واقبله من هنا.</li>' +
                '<li>من جوالك تختار السؤال وتكتب جوابك بدون ما يشوفه أحد.</li></ul>' +
                (linked ? '' : '<p class="wks-keep">لا تقفل هالصفحة لين يدخل جوالك</p>') + ctrl + reqs + '</section>';

            var label = !linked ? 'اربط جوالك أول' : !n ? 'بانتظار انضمام اللاعبين' : 'ابدأ المباراة';
            return wksShell('<div class="wks-top lobby"><span class="wks-game">مين يعرفني أكثر؟</span><span class="wks-title">لوبي الدخول</span></div>',
                '<div class="wks-lobby">' + players + qr + '</div>',
                '<button class="wks-start" data-a="start"' + (linked && n ? '' : ' disabled') + '>' + label + CHEV + '</button>');
        }
        function miniBoard(n) {
            var rk = ranking().slice(0, n);
            if (!rk.length) return '';
            return '<div class="wk-card wk-board" style="width:900px"><h3 class="wk-card-h">🏆 الترتيب</h3><div class="wk-list">' +
                rk.map(liHtml).join('') + '</div></div>';
        }
        function liHtml(r, i) {
            return '<div class="wk-li ' + (i === 0 ? 'top1' : '') + '" style="animation-delay:' + (i * 50) + 'ms"><span class="r">' + (i + 1) + '</span>' + avatarHtml(r) +
                '<span class="n">' + esc(r.name) + '</span>' + (r.pts ? '<span class="p">+' + r.pts + '</span>' : '') + '<span class="s">' + r.total + '</span></div>';
        }
        function vPick() {
            if (!(R && R.ctrl)) {
                return '<span class="wk-chip">الجولة ' + G.round + '</span><h1 class="wk-title">اربط جوالك عشان تختار السؤال</h1>' +
                    '<div class="wk-setup" style="grid-template-columns:1fr;max-width:1000px">' + vPhoneCard() + '</div>';
            }
            return '<span class="wk-chip">الجولة ' + G.round + '</span>' +
                '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20px">' +
                '<div style="font-size:120px;line-height:1">🤔</div>' +
                '<h1 class="wk-title">' + esc(R.ctrl.name) + ' يختار السؤال<span class="wk-dots"><i>.</i><i>.</i><i>.</i></span></h1>' +
                '<p class="wk-sub">جهّزوا أنفسكم، السؤال عن المضيف نفسه!</p></div>' + miniBoard(5);
        }
        function vAnswer() {
            return '<span class="wk-chip">الجولة ' + G.round + ' · سؤال عن المضيف</span>' +
                '<div class="wk-card wk-q"><div class="wk-q-halo"></div><p class="wk-q-text" style="position:relative">' + esc(G.q.text) + '</p></div>' +
                '<div class="wk-row" style="gap:120px;flex:1">' +
                '<div class="wk-count"><b data-live="count">0</b><span>إجابة وصلت</span></div>' +
                '<div class="wk-timer" data-live="timer"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>' +
                '<circle data-live="ring" cx="50" cy="50" r="44" fill="none" stroke="url(#wkg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="0"/>' +
                '<defs><linearGradient id="wkg"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#c084fc"/></linearGradient></defs></svg><span data-live="secs"></span></div>' +
                '<div class="wk-count" style="visibility:hidden"><b>0</b><span>.</span></div></div>' +
                '<div class="wk-howto">✍️ اكتب إجابتك بالشات — أول تعليق لك هو إجابتك</div>' +
                '<div class="wk-faces" data-live="faces"></div>' +
                '<button class="wk-btn ghost sm" data-a="endTime">إنهاء الوقت</button>';
        }
        function vReveal() {
            var n = G.answers.length;
            return '<span class="wk-chip">الجولة ' + G.round + ' · انتهى الوقت</span>' +
                '<div class="wk-reveal"><div class="wk-card wk-q" style="flex:1"><p class="wk-q-text">' + esc(G.q.text) + '</p></div>' +
                '<div class="wk-card wk-host"><span class="wk-host-lbl">⭐ جواب ' + esc(R && R.ctrl ? R.ctrl.name : 'المضيف') + '</span><span class="wk-host-ans">' + esc(G.q.answer) + '</span></div></div>' +
                '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px">' +
                (n ? '<div class="wk-count"><b>' + n + '</b><span>إجابة وصلت</span></div><button class="wk-btn pri xl" data-a="startReview">ابدأ إظهار الإجابات</button>'
                    : '<p class="wk-sub" style="font-size:36px">ما وصلت أي إجابة 😅</p><div class="wk-row"><button class="wk-btn pri" data-a="next">سؤال جديد</button><button class="wk-btn ghost" data-a="finish">إنهاء وعرض الفائز</button></div>') +
                '</div>';
        }
        function vReview() {
            var a = curAns();
            if (!a) return '';
            var n = G.answers.length;
            var vcls = a.verdict === true ? 'ok' : a.verdict === false ? 'no' : '';
            var stamp = vcls ? '<span class="wk-stamp ' + vcls + '">' + (a.verdict ? '✓ مقبولة' : '✗ مرفوضة') + '</span>' : '';
            var canUndo = G.idx > 0 || a.verdict != null;
            return '<div class="wk-review-top"><div class="wk-card wk-q small"><p class="wk-q-text">' + esc(G.q.text) + '</p></div>' +
                '<div class="wk-card wk-host small" style="animation:none"><span class="wk-host-lbl">⭐ جواب المضيف</span><span class="wk-host-ans">' + esc(G.q.answer) + '</span></div></div>' +
                '<div class="wk-row" style="gap:20px"><span class="wk-chip">الإجابة ' + (G.idx + 1) + ' من ' + n + '</span></div>' +
                '<div class="wk-progress"><i style="width:' + ((G.idx + (a.verdict != null ? 1 : 0)) / n * 100) + '%"></i></div>' +
                '<div class="wk-card wk-ans ' + vcls + '" data-k="' + G.idx + '">' + stamp + (a.auto ? '<span class="wk-auto">حكم تلقائي</span>' : '') +
                avatarHtml(a) + '<span class="wk-ans-name">' + esc(a.name) + '</span><span class="wk-ans-text">' + esc(a.text) + '</span></div>' +
                '<div class="wk-row" style="gap:28px">' +
                '<button class="wk-btn ok xl" data-a="accept"' + (a.verdict != null || G.busy ? ' disabled' : '') + '>✓ قبول</button>' +
                '<button class="wk-btn no xl" data-a="reject"' + (a.verdict != null || G.busy ? ' disabled' : '') + '>✗ رفض</button></div>' +
                '<div class="wk-row"><button class="wk-btn ghost sm" data-a="undo"' + (canUndo ? '' : ' disabled') + '>↶ تراجع</button>' +
                '<button class="wk-btn ghost sm" data-a="endReview">إنهاء المراجعة</button></div>';
        }
        function vRound() {
            var gained = Object.keys(G.roundPts).map(function (id) {
                var p = G.players[id] || { name: id };
                return { id: id, name: p.name, avatar: p.avatar, total: G.scores[id] || 0, pts: G.roundPts[id] };
            });
            var rk = ranking().slice(0, 8).map(function (r) { return Object.assign({}, r, { pts: G.roundPts[r.id] || 0 }); });
            return '<span class="wk-chip">نهاية الجولة ' + G.round + '</span>' +
                '<div class="wk-boards"><div class="wk-card wk-board"><h3 class="wk-card-h">✅ عرفوا الجواب (' + gained.length + ')</h3><div class="wk-list">' +
                (gained.length ? gained.slice(0, 8).map(function (r, i) { return liHtml(Object.assign({}, r, { total: '' }), i).replace('class="wk-li top1"', 'class="wk-li"'); }).join('') +
                    (gained.length > 8 ? '<div class="wk-empty" style="padding:6px 0">+ ' + (gained.length - 8) + ' لاعب ثاني</div>' : '')
                    : '<div class="wk-empty">محد عرفها هالمرة 😅</div>') + '</div></div>' +
                '<div class="wk-card wk-board"><h3 class="wk-card-h">🏆 الترتيب العام</h3><div class="wk-list">' +
                (rk.length ? rk.map(liHtml).join('') : '<div class="wk-empty">ما فيه نقاط للحين</div>') + '</div></div></div>' +
                '<div class="wk-row" style="gap:28px"><button class="wk-btn pri xl" data-a="next">سؤال جديد</button>' +
                '<button class="wk-btn ghost xl" data-a="finish">إنهاء وعرض الفائز</button></div>';
        }
        function vFinal() {
            var rk = ranking();
            var ws = G.winners.map(function (id) { var p = G.players[id] || { name: id }; return { name: p.name, avatar: p.avatar, total: G.scores[id] }; });
            var win = ws.length
                ? '<div class="wk-win"><div class="wk-crown">👑</div><p class="wk-sub" style="font-size:34px;color:#fcd34d">' + (ws.length > 1 ? 'الأكثر معرفة بالمضيف (تعادل)' : 'الأكثر معرفة بالمضيف') + '</p><div class="wk-winners">' +
                    ws.slice(0, 4).map(function (w) { return '<div class="wk-winner">' + avatarHtml(w) + '<b>' + esc(w.name) + '</b><span>' + w.total + ' نقطة</span></div>'; }).join('') + '</div></div>'
                : '<div class="wk-win"><div class="wk-crown">🤷</div><h1 class="wk-title">محد جمع نقاط</h1></div>';
            return win + (rk.length > ws.length ? '<div class="wk-card wk-board" style="width:1000px;max-height:330px"><div class="wk-list">' +
                rk.slice(0, 5).map(liHtml).join('') + '</div></div>' : '') +
                '<div class="wk-row" style="gap:28px;margin-top:auto"><button class="wk-btn pri" data-a="newGame">لعبة جديدة</button><button class="wk-btn ghost" data-a="exit">خروج</button></div>';
        }

        function renderOver() {
            var h = '';
            var devs = Object.keys(pending);
            if (devs.length && G.phase !== 'setup' && !(G.phase === 'pick' && !(R && R.ctrl))) {
                var d = devs[0];
                h += '<div class="wk-card wk-toast"><b style="font:700 26px \'IBM Plex Sans Arabic\'">📱 ' + esc(pending[d].name) + ' يبي يتحكم باللعبة</b>' +
                    '<div class="wk-row" style="justify-content:flex-start"><button class="wk-btn ok sm" data-a="acc" data-v="' + d + '">قبول</button>' +
                    '<button class="wk-btn no sm" data-a="rej" data-v="' + d + '">رفض</button></div></div>';
            }
            if (modal === 'qr') {
                h += '<div class="wk-modal" data-a="close"><div class="wk-card" style="min-width:1000px">' + vPhoneCard().replace(/^<div class="wk-card">/, '<div>') +
                    '<button class="wk-btn ghost sm" data-a="close">إغلاق</button></div></div>';
            } else if (modal === 'exit') {
                h += '<div class="wk-modal"><div class="wk-card"><h2 class="wk-title" style="font-size:44px">تبي تطلع من اللعبة؟</h2>' +
                    '<p class="wk-sub">النقاط الحالية بتنمسح.</p><div class="wk-row"><button class="wk-btn no sm" data-a="exitYes">خروج</button>' +
                    '<button class="wk-btn ghost sm" data-a="close">رجوع</button></div></div></div>';
            }
            if (flashMsg) h += '<div class="wk-flash">' + esc(flashMsg) + '</div>';
            over.innerHTML = h;
            if (modal === 'qr') drawQr(over.querySelector('.wk-qr'));
        }
        var flashMsg = '', flashT = null;
        function flash(msg) {
            flashMsg = msg; refreshOver(); clearTimeout(flashT);
            flashT = setTimeout(function () { flashMsg = ''; refreshOver(); }, 2600);
        }
        function refreshOver() { if (G.phase === 'setup') render(); else renderOver(); }

        var _qrUrl = '', _qrImg = '';
        function drawQr(el) {
            if (!el || !R) return;
            var url = opts.hostUrl(R.id);
            if (_qrUrl === url && _qrImg) { el.innerHTML = '<img src="' + _qrImg + '" alt="">'; return; }
            if (!window.QRCode) { el.textContent = 'افتح الرابط تحت من جوالك'; return; }
            el.innerHTML = '';
            try {
                new window.QRCode(el, { text: url, width: 232, height: 232, colorDark: '#0F1117', colorLight: '#ffffff' });
                var c = el.querySelector('canvas');
                if (c) { _qrUrl = url; _qrImg = c.toDataURL('image/png'); }
            } catch (e) { el.textContent = 'افتح الرابط تحت من جوالك'; }
        }

        // تحديثات حيّة بدون إعادة رسم (العدّاد وعدد الإجابات)
        var _lastSec = -1, _facesN = -1;
        function updateLive() {
            if (G.phase !== 'answer') return;
            var left = Math.max(0, G.endsAt - Date.now());
            var secs = Math.ceil(left / 1000);
            var el = body.querySelector('[data-live="secs"]');
            if (el) {
                el.textContent = secs;
                var ring = body.querySelector('[data-live="ring"]');
                if (ring) ring.setAttribute('stroke-dashoffset', String(276.5 * (1 - left / (settings.time * 1000))));
                body.querySelector('[data-live="timer"]').classList.toggle('hot', secs <= 10);
                if (secs !== _lastSec && secs <= 5 && secs > 0) WK.sfx('tick');
                _lastSec = secs;
            }
            var c = body.querySelector('[data-live="count"]');
            if (c) c.textContent = G.answers.length;
            var f = body.querySelector('[data-live="faces"]');
            if (f && _facesN !== G.answers.length) {
                _facesN = G.answers.length;
                f.innerHTML = G.answers.slice(-14).map(function (a) { return avatarHtml(a); }).join('');
            }
        }
        setInterval(function () {
            if (G.phase === 'answer') {
                if (Date.now() >= G.endsAt) toReveal(); else updateLive();
            }
        }, 200);
        setInterval(renderHead, 10000);

        // أزرار الشاشة (نفس أوامر الجوال)
        root.addEventListener('click', function (ev) {
            var t = ev.target.closest('[data-a]');
            if (!t || t.disabled) return;
            var a = t.getAttribute('data-a'), v = t.getAttribute('data-v');
            if (a === 'close') { if (ev.target !== t && (t.classList.contains('wk-modal') || t.classList.contains('wks-modal'))) return; modal = null; refreshOver(); return; }
            if (a === 'qr') { modal = 'qr'; renderOver(); return; }
            if (a === 'exit') { modal = 'exit'; refreshOver(); return; }
            if (a === 'exitYes') { WK.writeJSON(store, STORE_GAME, null); if (opts.onExit) opts.onExit(); else { G = freshGame(); modal = null; render(); } return; }
            if (a === 'acc') { acceptReq(v); return; }
            if (a === 'rej') { rejectReq(v); return; }
            if (a === 'unlink') { unlink(); return; }
            if (a === 'kick') { kick(v); return; }
            if (a === 'time') { handleCmd('settings', { time: +v }); pushState(true); return; }
            if (a === 'auto') { handleCmd('settings', { auto: !settings.auto }); pushState(true); return; }
            handleCmd(a, null, 'screen');
        });

        // كلمة الدخول تنكتب بدون إعادة رسم (عشان ما يضيع التركيز)
        root.addEventListener('input', function (ev) {
            if (ev.target && ev.target.id === 'wk-keyword') {
                settings.keyword = ev.target.value.slice(0, 40);
                WK.writeJSON(store, STORE_SETTINGS, settings);
                var b = wks.querySelector('[data-a="start"]');
                if (b) b.disabled = !settings.keyword.trim();
            }
        });
        if (SHARED) SHARED.watch(function () { return settings; }, function (patch) { Object.assign(settings, patch); if (G.phase === 'setup') render(); });
        if (opts.onComment) opts.onComment(onComment);
        setupRoom(false);
        render();

        return { state: function () { return G; }, room: function () { return R && R.id; }, comment: onComment, cmd: handleCmd };
    };
}());
