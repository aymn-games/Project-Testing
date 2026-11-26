/**
 * «المافيا» — نظام القرية (النظام الجديد). منطق المباراة على الخادم (الخادم هو الحكم).
 *
 * المذيع يختار النظام أول ما يفتح اللعبة، ولو اختار «القرية» يشغّل mafia-server هذا الملف بدل mafia-game.js
 * (نفس الواجهة: createGame(roster, settings, hooks, saved) ← {G, tick, act, endStage, remove, view, serialize}).
 *
 * المراحل: reveal (كل واحد يشوف دوره بجواله) → night (كل الأدوار تختار بنفس الوقت)
 *   → dawn («طلع الصبح على القرية»: مين مات ومين نجا، ودور الميت ينكشف) → day (النقاش)
 *   → vote (صوت واحد لكل لاعب ولا يتغيّر) → verdict («قرار القرية» وكشف دور المطرود) → night … حتى over.
 *
 * الأدوار (أعدادها من شاشة «اختر الأدوار»، واللي ما ياخذ دور يصير مواطن):
 *   مافيا (فريق المافيا) — يقتلون بالليل: «يتفقون على واحد» (killMode agree) أو «كل مافيا يقتل لاعب» (each).
 *   المزوّر (فريق المافيا) — يعرف المافيا، ما يقتل. كل ليلة يزوّر لاعب: نتيجة فحصه عند المحقق تنقلب
 *     الليلة هذي. والمزوّر نفسه يطلع للمحقق «بريء» دايماً.
 *   الطبيب — يحمي لاعب من أي قتل (المافيا أو القنّاص). ما يكرر نفس الشخص ليلتين ورا بعض، ويحمي نفسه مرة وحدة.
 *   المحقق — يفحص لاعب: «مافيا» أو «بريء». النتيجة توصله مع الصبح (عشان التزوير يأثر).
 *   الحارس الشخصي — يحرس لاعب (مو نفسه، ولا نفس الشخص ليلتين ورا بعض). لو هجمت المافيا عليه
 *     يموت المافيا المهاجم وينجو المحروس. الحارس نفسه ما يموت.
 *   القنّاص — عنده رصاصة وحدة بالمباراة، يطلقها بالليل على أي لاعب (الطبيب يقدر ينقذ منها).
 *   العمدة — معروف للكل من البداية، وصوته بالتصويت بصوتين.
 *   المهرّج (محايد) — يفوز لو طردته القرية بالتصويت. اللعبة تكمل بعدها، ويُحسب مع الفائزين بالنهاية.
 *   مواطن.
 *
 * الفوز: القرية لما تطلع المافيا كلها (والمزوّر منهم)، والمافيا لما يصير عددها يساوي الباقين أو أكثر.
 * التعادل بالتصويت = ما أحد يطلع.
 *
 * G كله بيانات JSON (معرّفات بس، بدون روابط بين الكائنات) عشان الحفظ والترجيع (serialize) يكون نسخ مباشر.
 */
'use strict';

var Settings = require('./mafia-settings');

var REVEAL_MS = 10000;
var VERDICT_MS = 11000;       // لازم يكفي لتسلسل «هل كان من المافيا؟» ثم الكشف بشاشة البث (VERDICT_ASK_MS)
var DAWN_BASE_MS = 4500, DAWN_ITEM_MS = 2600, DAWN_MAX_MS = 26000;
var EARLY_END_MS = 1500;      // الكل خلّص (أكّد اختياره/صوّت) ← المرحلة تنتهي بعد هالمدة
var CHAT_MAX = 250;
var NIGHT_ROLES = ['mafia', 'forger', 'doctor', 'detective', 'bodyguard', 'sniper'];
var ROLE_NAMES = {}; Settings.VILLAGE_ROLES.forEach(function (r) { ROLE_NAMES[r.k] = r.n; }); ROLE_NAMES.citizen = 'مواطن';
var TEAM_OF = {}; Settings.VILLAGE_ROLES.forEach(function (r) { TEAM_OF[r.k] = r.team; }); TEAM_OF.citizen = 'town';

function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pickRandom(a) { return a[Math.floor(Math.random() * a.length)]; }

/** الأدوار بالترتيب العشوائي — لو الأدوار أكثر من اللاعبين (ما يصير: الخادم يمنع البداية) نقص من الإضافية أول */
function assignRoles(n, S) {
    var c = Settings.villageCounts(S), roles = [];
    Settings.VILLAGE_ROLES.forEach(function (r) { for (var i = 0; i < c[r.k]; i++) roles.push(r.k); });
    roles = roles.slice(0, n);
    while (roles.length < n) roles.push('citizen');
    return shuffle(roles);
}

function createGame(roster, settings, hooks, saved) {
    if (saved && saved.G) {
        var G0 = saved.G, shift = Math.max(0, Date.now() - (Number(saved.savedAt) || Date.now()));
        G0.phaseAt += shift; if (G0.endsAt) G0.endsAt += shift;
        return gameApi(G0, hooks, true);
    }
    return gameApi(newState(roster, settings), hooks, false);
}

function newState(roster, S) {
    var roles = assignRoles(roster.length, S), counts = { citizen: 0 };
    roles.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
    var now = Date.now();
    return {
        id: now.toString(36) + Math.random().toString(36).slice(2, 6), system: 'village',
        phase: 'reveal', round: 0, startedAt: now, phaseAt: now, endsAt: now + REVEAL_MS,
        settings: S, counts: counts, chatSeq: 0,
        players: roster.map(function (p, i) {
            var r = roles[i];
            return {
                id: p.id, name: p.name, look: p.look, tiktok: p.tiktok || null, seat: i,
                role: r, team: TEAM_OF[r], alive: true, diedRound: 0, cause: null, causeRef: null,
                doctorPrev: null, doctorSelf: false, guardPrev: null, bullets: r === 'sniper' ? 1 : 0,
                notices: [], inspections: []
            };
        }),
        night: null, morning: null, votes: {}, verdict: null, winner: null, jesterWins: [], chat: [], endedAt: 0
    };
}

function gameApi(G, hooks, restored) {
    var S = G.settings;

    function changed() { if (hooks && hooks.onChange) hooks.onChange(); }
    function P(id) { return G.players.find(function (p) { return p.id === id; }); }
    function alive() { return G.players.filter(function (p) { return p.alive; }); }
    function aliveRole(r) { return alive().filter(function (p) { return p.role === r; }); }
    function aliveMafiaTeam() { return alive().filter(function (p) { return p.team === 'mafia'; }); }
    function go(phase, ms) { G.phase = phase; G.phaseAt = Date.now(); G.endsAt = ms ? G.phaseAt + ms : 0; changed(); }
    function notice(p, text) { p.notices.push({ round: G.round, text: text, at: Date.now() }); if (p.notices.length > 40) p.notices.shift(); }
    function sys(text) { G.chat.push({ n: ++G.chatSeq, sys: true, ch: 'city', text: text, at: Date.now() }); trimChat(); }
    function trimChat() { if (G.chat.length > CHAT_MAX) G.chat.splice(0, G.chat.length - CHAT_MAX); }

    if (!restored) G.players.forEach(function (p) {
        var txt = 'دورك: ' + ROLE_NAMES[p.role];
        if (p.team === 'mafia') txt += ' — من فريق المافيا. لا تقول دورك لأحد!';
        else if (p.role === 'jester') txt += ' — محايد: تفوز لو طردتك القرية بالتصويت.';
        else txt += ' — من فريق القرية. دوّر على المافيا.';
        notice(p, txt);
    });

    // ---------------------------------------------------------------- الليل (كل الأدوار بنفس الوقت)
    /** هل اللاعب عنده شي يسويه الليلة؟ (القنّاص بس لو باقي عنده رصاصة) */
    function nightActor(p) { return !!p && p.alive && NIGHT_ROLES.indexOf(p.role) >= 0 && (p.role !== 'sniper' || p.bullets > 0); }
    /** هل يقدر يختار هالهدف؟ (نفس الشروط تنعرض بالجوال) */
    function canPick(me, t) {
        if (!t || !t.alive) return false;
        switch (me.role) {
            case 'mafia': return t.team !== 'mafia';
            case 'forger': return t.id !== me.id;
            case 'doctor': return t.id !== me.doctorPrev && (t.id !== me.id || !me.doctorSelf);
            case 'detective': return t.id !== me.id;
            case 'bodyguard': return t.id !== me.id && t.id !== me.guardPrev;
            case 'sniper': return t.id !== me.id && me.bullets > 0;
        }
        return false;
    }
    function startNight() {
        G.round++;
        G.night = { picks: {}, confirmed: {} };
        G.votes = {}; G.verdict = null;
        sys('🌙 الليلة ' + G.round + ' — القرية نامت');
        go('night', S.nightSec * 1000);
    }
    function nightDone() {
        var actors = alive().filter(nightActor);
        return actors.length > 0 && actors.every(function (p) { return G.night.confirmed[p.id]; });
    }

    /** هجمات المافيا الليلة: [{target, attacker}] */
    function mafiaAttacks(N) {
        var mafs = aliveRole('mafia'), valid = function (id) { var t = P(id); return t && t.alive && t.team !== 'mafia'; };
        var out = [];
        if (S.killMode === 'each') {
            mafs.forEach(function (m) { var t = N.picks[m.id]; if (t && t !== 'skip' && valid(t) && !out.some(function (a) { return a.target === t; })) out.push({ target: t, attacker: m.id }); });
            return out;
        }
        // يتفقون على واحد: أكثر هدف انختار، والتعادل قرعة بين الأعلى (عشان الليلة ما تضيع)
        var count = {}, best = 0, top = [];
        mafs.forEach(function (m) { var t = N.picks[m.id]; if (t && t !== 'skip' && valid(t)) count[t] = (count[t] || 0) + 1; });
        Object.keys(count).forEach(function (t) { if (count[t] > best) { best = count[t]; top = [t]; } else if (count[t] === best) top.push(t); });
        if (!top.length) return out;
        var target = pickRandom(top), by = mafs.filter(function (m) { return N.picks[m.id] === target; });
        out.push({ target: target, attacker: pickRandom(by).id });
        return out;
    }

    function resolveNight() {
        var N = G.night, pickOf = function (p) { var t = N.picks[p.id]; return t && t !== 'skip' && canPick(p, P(t)) ? t : null; };
        var attacks = mafiaAttacks(N);
        var forged = {}, protect = {}, guard = {}, shots = [];
        aliveRole('forger').forEach(function (f) { var t = pickOf(f); if (t) forged[t] = true; });
        aliveRole('doctor').forEach(function (d) {
            var t = pickOf(d); d.doctorPrev = t;
            if (!t) return;
            (protect[t] = protect[t] || []).push(d.id);
            if (t === d.id) d.doctorSelf = true;
        });
        aliveRole('bodyguard').forEach(function (b) { var t = pickOf(b); b.guardPrev = t; if (t && !guard[t]) guard[t] = b.id; });
        aliveRole('sniper').forEach(function (s) { var t = pickOf(s); if (t) { s.bullets--; shots.push({ target: t, by: s.id }); } });

        // نتائج المحققين (قبل الموت: كل شي يصير بنفس الوقت)
        aliveRole('detective').forEach(function (d) {
            var t = P(pickOf(d) || ''); if (!t) return;
            var res = t.team === 'mafia' && t.role !== 'forger' ? 'mafia' : 'innocent';
            if (forged[t.id]) res = res === 'mafia' ? 'innocent' : 'mafia';
            d.inspections.push({ round: G.round, id: t.id, res: res });
            notice(d, '🔍 نتيجة فحص ' + t.name + ': ' + (res === 'mafia' ? 'مافيا 🔪' : 'بريء ✓'));
        });

        var dies = {}, saved = {}, order = [];
        function kill(id, kind, ref) { if (dies[id]) return; dies[id] = { kind: kind, ref: ref || null }; order.push(id); }
        attacks.forEach(function (a) {
            var t = P(a.target), atk = P(a.attacker);
            if (guard[a.target]) {
                kill(a.attacker, 'guard', a.target);
                saved[a.target] = saved[a.target] || 'guard';
                notice(P(guard[a.target]), '🛡️ المافيا هجمت على ' + t.name + ' وأنت تحرسه — قتلت المهاجم ' + atk.name + ' ونجا');
            } else if (protect[a.target]) {
                saved[a.target] = saved[a.target] || 'doctor';
                protect[a.target].forEach(function (d) { notice(P(d), '💊 أنقذت ' + (d === t.id ? 'نفسك' : t.name) + ' من هجوم المافيا'); });
            } else kill(a.target, 'mafia');
        });
        shots.forEach(function (s) {
            var t = P(s.target);
            if (dies[s.target]) { notice(P(s.by), '🎯 أطلقت على ' + t.name + ' بس كان مات قبلها'); return; }
            if (protect[s.target]) { saved[s.target] = saved[s.target] || 'doctor'; notice(P(s.by), '🎯 أطلقت على ' + t.name + ' بس الطبيب أنقذه'); return; }
            kill(s.target, 'sniper', s.by);
            notice(P(s.by), '🎯 رصاصتك أصابت ' + t.name);
        });

        var items = [];
        order.forEach(function (id) {
            var p = P(id), d = dies[id];
            p.alive = false; p.diedRound = G.round; p.cause = d.kind; p.causeRef = d.ref;
            items.push({ id: id, kind: d.kind, ref: d.ref });
            var ref = d.ref && P(d.ref);
            sys(d.kind === 'mafia' ? '🔪 المافيا قتلت ' + p.name + ' — كان ' + ROLE_NAMES[p.role]
                : d.kind === 'sniper' ? '🎯 رصاصة القنّاص أصابت ' + p.name + ' — كان ' + ROLE_NAMES[p.role]
                : '🛡️ الحارس الشخصي قتل ' + p.name + ' وهو يحاول قتل ' + (ref ? ref.name : '') + ' — كان ' + ROLE_NAMES[p.role]);
        });
        Object.keys(saved).forEach(function (id) {
            if (dies[id]) return;
            var p = P(id);
            items.push({ id: id, kind: saved[id] === 'guard' ? 'saved-guard' : 'saved-doctor' });
            sys(saved[id] === 'guard' ? '🛡️ حاولت المافيا قتل ' + p.name + ' فحماه الحارس الشخصي ونجا' : '💚 حاولوا قتل ' + p.name + ' لكن الطبيب أنقذه في آخر لحظة');
        });
        if (!items.length) sys('🌙 ليلة هادية — ما مات أحد');
        G.morning = { round: G.round, items: items };
        G.night = null;
        go('dawn', Math.min(DAWN_MAX_MS, DAWN_BASE_MS + items.length * DAWN_ITEM_MS));
    }

    // ---------------------------------------------------------------- النهار
    function winner() {
        var m = aliveMafiaTeam().length, rest = alive().length - m;
        if (m === 0) return 'town';
        if (m >= rest) return 'mafia';
        return null;
    }
    function finish(w) {
        G.winner = w; G.endedAt = Date.now();
        sys(w === 'mafia' ? '🏆 فازت المافيا! سيطرت على القرية' : '🏆 فاز أهل القرية! خرجت المافيا كلها');
        go('over', 0);
    }
    function afterDawn() {
        var w = winner(); if (w) return finish(w);
        if (S.talkSec > 0) { sys('☀️ النهار ' + G.round + ': بدأ النقاش'); go('day', S.talkSec * 1000); }
        else startVote();
    }
    function weight(p) { return p.role === 'mayor' ? 2 : 1; }
    function tally() {
        var t = {};
        Object.keys(G.votes).forEach(function (vid) { var v = P(vid), x = P(G.votes[vid]); if (v && x && x.alive) t[x.id] = (t[x.id] || 0) + weight(v); });
        return t;
    }
    function startVote() { G.votes = {}; sys('🗳️ بدأ التصويت: من المافيا؟'); go('vote', S.voteSec * 1000); }
    function resolveVote() {
        var t = tally(), best = 0, top = [];
        Object.keys(t).forEach(function (id) { if (t[id] > best) { best = t[id]; top = [id]; } else if (t[id] === best) top.push(id); });
        var out = top.length === 1 ? P(top[0]) : null;
        G.verdict = { id: out ? out.id : null, votes: best, tie: top.length > 1, none: !top.length, tally: t, role: null, team: null };
        if (out) {
            out.alive = false; out.diedRound = G.round; out.cause = 'vote';
            G.verdict.role = out.role; G.verdict.team = out.team;
            if (out.role === 'jester') { G.verdict.jester = true; G.jesterWins.push(out.id); }
            sys('⚖️ ' + out.name + ' خرج من القرية بـ' + best + ' صوت — ' + (out.role === 'jester' ? 'كان المهرّج وفاز! 🤡' : out.team === 'mafia' ? 'كان ' + ROLE_NAMES[out.role] + ' من المافيا' : 'بريء، كان ' + ROLE_NAMES[out.role]));
        } else sys(top.length > 1 ? '⚖️ تعادل بالأصوات — ما أحد خرج' : '⚖️ ما أحد صوّت — ما أحد خرج');
        go('verdict', out ? VERDICT_MS : 6000);
    }
    function afterVerdict() { var w = winner(); if (w) return finish(w); startNight(); }

    function next() {
        var ph = G.phase;
        if (ph === 'reveal') startNight();
        else if (ph === 'night') resolveNight();
        else if (ph === 'dawn') afterDawn();
        else if (ph === 'day') startVote();
        else if (ph === 'vote') resolveVote();
        else if (ph === 'verdict') afterVerdict();
    }
    function tick(now) { if (G.endsAt && now >= G.endsAt) next(); }

    // ---------------------------------------------------------------- الشات: العام وقت النقاش، والمافيا (مع المزوّر) سري طول المباراة
    function chat(me, arg) {
        var raw = String(arg == null ? '' : arg), bar = raw.indexOf('|');
        var ch = bar > 0 ? raw.slice(0, bar) : 'city', text = (bar > 0 ? raw.slice(bar + 1) : raw).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
        if (!text || !me.alive || G.phase === 'over') return;
        if (ch === 'mafia') { if (me.team !== 'mafia') return; }
        else if (ch === 'city') { if (G.phase !== 'day' && G.phase !== 'vote') return; }
        else return;
        var now = Date.now();
        me._chatTok = Math.min(5, (me._chatTok == null ? 5 : me._chatTok) + (now - (me._lastChat || now)) / 1000);
        me._lastChat = now;
        if (me._chatTok < 1) return;
        me._chatTok -= 1;
        G.chat.push({ n: ++G.chatSeq, from: me.id, ch: ch, text: text, at: now }); trimChat();
        changed();
    }

    function act(id, a, arg) {
        var me = P(id); if (!me) return;
        if (a === 'chat') return chat(me, arg);
        if (!me.alive) return;
        if (G.phase === 'night' && G.night && nightActor(me)) {
            var N = G.night;
            if (N.confirmed[id]) return;   // بعد التأكيد ما يتغيّر
            if (a === 'confirm') { if (!N.picks[id]) return; N.confirmed[id] = true; changed(); if (nightDone()) { G.endsAt = Math.min(G.endsAt, Date.now() + EARLY_END_MS); changed(); } return; }
            if (a !== 'pick') return;
            if (arg === 'skip') N.picks[id] = 'skip';
            else { var t = P(String(arg || '')); if (!canPick(me, t)) return; N.picks[id] = t.id; }
            return changed();
        }
        if (G.phase === 'vote' && a === 'vote') {
            if (G.votes[id]) return;   // صوت واحد ولا يتغيّر
            var vt = P(String(arg || '')); if (!vt || !vt.alive || vt.id === id) return;
            G.votes[id] = vt.id; changed();
            if (alive().every(function (p) { return G.votes[p.id]; })) { G.endsAt = Math.min(G.endsAt, Date.now() + EARLY_END_MS); changed(); }
        }
    }

    function endStage() { if (G.phase !== 'over') next(); }

    function remove(id) {
        var p = P(id); if (!p || !p.alive) return;
        p.alive = false; p.diedRound = G.round; p.cause = 'left';
        sys(p.name + ' طلع من اللعبة');
        if (G.phase !== 'over' && G.phase !== 'dawn' && G.phase !== 'verdict') { var w = winner(); if (w) finish(w); }
        changed();
    }

    function view(id) {
        var isHost = id === 'host', me = !isHost && P(id), over = G.phase === 'over';
        var meMafia = !!(me && me.alive && me.team === 'mafia');
        var players = G.players.map(function (p) {
            var o = { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok, seat: p.seat, alive: p.alive, cause: p.cause, causeRef: p.causeRef, diedRound: p.diedRound, role: null, team: null };
            // الدور ينكشف: بالنهاية، ولما يموت، ولصاحبه، والمافيا يعرفون بعض (مع المزوّر)، والعمدة معروف للكل
            if (over || !p.alive || p === me || (meMafia && p.team === 'mafia') || p.role === 'mayor') { o.role = p.role; o.team = p.team; }
            if (meMafia && p.team === 'mafia' && p !== me) o.mate = true;
            return o;
        });
        var v = {
            id: G.id, system: 'village', phase: G.phase, round: G.round, startedAt: G.startedAt, phaseAt: G.phaseAt, endsAt: G.endsAt, endedAt: G.endedAt || 0,
            settings: S, counts: G.counts, players: players, winner: G.winner, jesterWins: G.jesterWins,
            morning: G.phase === 'night' || G.phase === 'reveal' ? null : G.morning,
            votes: G.phase === 'vote' || G.phase === 'verdict' ? G.votes : {},
            tally: G.phase === 'vote' || G.phase === 'verdict' ? tally() : {},
            verdict: G.phase === 'verdict' || over ? G.verdict : null,
            chat: G.chat.filter(function (c) { return c.ch !== 'mafia' || meMafia; }).slice(isHost ? -60 : -120)
        };
        if (me) {
            v.me = { id: me.id, role: me.role, team: me.team, alive: me.alive, notices: me.notices.slice(-20), inspections: me.inspections, bullets: me.bullets, doctorPrev: me.doctorPrev, doctorSelf: me.doctorSelf, guardPrev: me.guardPrev };
            if (G.phase === 'night' && G.night) {
                v.me.actor = nightActor(me);
                v.me.pick = G.night.picks[me.id] || null;
                v.me.confirmed = !!G.night.confirmed[me.id];
                // اختيارات المافيا لبعض (المزوّر يشوفها بعد)، عشان يتفقون على واحد
                if (meMafia) { v.me.teamPicks = {}; aliveRole('mafia').forEach(function (m) { if (G.night.picks[m.id]) v.me.teamPicks[m.id] = G.night.picks[m.id]; }); }
                // الأهداف المسموحة (الخادم هو المرجع)
                v.me.allowed = v.me.actor ? alive().filter(function (t) { return canPick(me, t); }).map(function (t) { return t.id; }) : [];
            }
            if (G.phase === 'vote' || G.phase === 'verdict') { v.me.vote = G.votes[me.id] || null; v.me.weight = weight(me); }
        }
        return v;
    }

    function serialize() { return { G: G, savedAt: Date.now() }; }

    if (!restored) sys('بدأت المباراة: ' + G.players.length + ' لاعب بالقرية — كل واحد يعرف دوره من جواله، ولا يقوله لأحد');
    changed();
    return { G: G, tick: tick, act: act, endStage: endStage, remove: remove, view: view, serialize: serialize };
}

module.exports = { createGame: createGame, ROLE_NAMES: ROLE_NAMES, REVEAL_MS: REVEAL_MS, VERDICT_MS: VERDICT_MS };
