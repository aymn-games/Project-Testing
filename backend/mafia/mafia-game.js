/**
 * «المافيا» — منطق المباراة على الخادم (الخادم هو الحكم).
 *
 * المراحل: reveal (كشف الأدوار على الجوالات) → night (الاختيار من الجوالات)
 *   → dawn (مشاهد الليل على شاشة البث) → day (النقاش بالشات) → vote (التصويت)
 *   → verdict (مشهد الطرد) → night … حتى over.
 *
 * مشاهد الفجر تطلع كتسلسل seq [{k, at, dur, ...}] بأوقات نسبية من بداية المرحلة،
 * وشاشة البث تشغّلها حسب الوقت — فلو حدّث المذيع الصفحة يكمل من نفس اللقطة.
 *
 * view(G, id) تفلتر الحالة لكل طرف:
 *   - المذيع (شاشة البث يشوفها الكل): ما يستلم أدوار الأحياء ولا اختيارات الليل
 *     ولا نتيجة المحقق، ولا الهدف اللي حماه الطبيب إلا إذا أنقذ فعلاً.
 *   - اللاعب: دوره، والمافيا يعرفون بعض ويشوفون اختيارات بعض، والمحقق نتائجه.
 */
'use strict';

var REVEAL_MS = 8000;
var VERDICT_MS = 9000;
var CHAT_MAX = 60;
// أطوال لقطات الفجر (لازم تطابق مدد المشاهد في games/mafia/mafia-scene.js)
var SHOT = { intro: 3000, inspect: 6500, attack: 7000, save: 6000, quiet: 5000, result: 5000 };

function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function assignRoles(n, s) {
    var roles = [];
    for (var i = 0; i < s.mafia; i++) roles.push('mafia');
    if (s.doctor) roles.push('doctor');
    if (s.detective) roles.push('detective');
    while (roles.length < n) roles.push('citizen');
    return shuffle(roles.slice(0, n));
}

/**
 * roster: [{id,name,look,tiktok}] · settings: من mafia-settings.validate
 * hooks: { onChange() }
 */
function createGame(roster, settings, hooks) {
    var S = settings;
    var roles = assignRoles(roster.length, S);
    var G = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        phase: 'reveal', round: 0, startedAt: Date.now(), phaseAt: Date.now(), endsAt: Date.now() + REVEAL_MS,
        settings: S,
        players: roster.map(function (p, i) {
            return { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok || null, seat: i, role: roles[i], alive: true, diedRound: 0, cause: null };
        }),
        night: null, seq: [], chat: [], votes: {}, verdict: null, winner: null,
        lastSaved: null, inspections: {}   // inspections[detId] = [{round,id,mafia}]
    };
    var chatSeq = 0;

    function changed() { if (hooks && hooks.onChange) hooks.onChange(); }
    function P(id) { return G.players.find(function (p) { return p.id === id; }); }
    function alive() { return G.players.filter(function (p) { return p.alive; }); }
    function aliveRole(r) { return alive().filter(function (p) { return p.role === r; }); }
    function go(phase, ms) { G.phase = phase; G.phaseAt = Date.now(); G.endsAt = ms ? G.phaseAt + ms : 0; changed(); }

    function sys(text) { G.chat.push({ n: ++chatSeq, sys: true, text: text, at: Date.now() }); trimChat(); }
    function trimChat() { if (G.chat.length > CHAT_MAX) G.chat.splice(0, G.chat.length - CHAT_MAX); }

    function startNight() {
        G.round++;
        G.night = { mafiaVotes: {}, protect: null, inspect: null };
        G.votes = {}; G.verdict = null; G.seq = [];
        sys('الليلة ' + G.round + ' — الكل يغمّض عيونه');
        go('night', S.nightSec * 1000);
    }

    function nightDone() {
        var N = G.night;
        var mafiaOk = aliveRole('mafia').every(function (m) { return N.mafiaVotes[m.id]; });
        var docOk = aliveRole('doctor').every(function () { return N.protect; });
        var detOk = aliveRole('detective').every(function () { return N.inspect; });
        return mafiaOk && docOk && detOk;
    }

    function resolveNight() {
        var N = G.night, tally = {}, best = 0, top = [];
        Object.keys(N.mafiaVotes).forEach(function (mid) {
            var m = P(mid); if (!m || !m.alive) return;
            var t = N.mafiaVotes[mid]; tally[t] = (tally[t] || 0) + 1;
        });
        Object.keys(tally).forEach(function (t) { if (tally[t] > best) { best = tally[t]; top = [t]; } else if (tally[t] === best) top.push(t); });
        var target = top.length ? top[Math.floor(Math.random() * top.length)] : null;
        var tp = target && P(target);
        if (tp && !tp.alive) tp = null;

        var seq = [], at = 0;
        function shot(k, extra) { var o = Object.assign({ k: k, at: at, dur: SHOT[k] }, extra || {}); seq.push(o); at += SHOT[k]; return o; }
        shot('intro');

        var det = aliveRole('detective')[0];
        if (det && N.inspect) {
            var sus = P(N.inspect);
            if (sus) {
                (G.inspections[det.id] = G.inspections[det.id] || []).push({ round: G.round, id: sus.id, mafia: sus.role === 'mafia' });
                shot('inspect');   // المشتبه ما ينكشف على البث
            }
        }

        var saved = false, victim = null;
        if (tp) {
            saved = !!(N.protect && N.protect === tp.id && aliveRole('doctor').length);
            shot('attack', { target: tp.id, saved: saved });
            if (saved) shot('save', { target: tp.id });
            else { victim = tp; }
        } else shot('quiet');
        shot('result', { victim: victim ? victim.id : null, saved: saved ? tp.id : null });

        if (victim) {
            victim.alive = false; victim.diedRound = G.round; victim.cause = 'mafia';
            sys('المافيا قتلت ' + victim.name);
        } else if (saved) sys('الطبيب أنقذ ' + tp.name + ' من المافيا!');
        else sys('ليلة هادية… ما مات أحد');

        G.lastSaved = N.protect;
        G.seq = seq;
        go('dawn', at);
    }

    function winner() {
        var m = aliveRole('mafia').length, rest = alive().length - m;
        if (m === 0) return 'town';
        if (m >= rest) return 'mafia';
        return null;
    }

    function finish(w) {
        G.winner = w; G.endedAt = Date.now();
        sys(w === 'mafia' ? 'المافيا سيطرت على البلدة!' : 'البلدة تخلّصت من المافيا!');
        go('over', 0);
    }

    function afterDawn() {
        var w = winner(); if (w) return finish(w);
        G.votes = {};
        sys('طلع الصبح — وقت النقاش');
        go('day', S.talkSec * 1000);
    }

    function startVote() { G.votes = {}; sys('بدأ التصويت'); go('vote', S.voteSec * 1000); }

    function resolveVote() {
        var tally = {}, skip = 0, best = 0, top = [];
        alive().forEach(function (p) {
            var v = G.votes[p.id]; if (!v) return;
            if (v === 'skip') { skip++; return; }
            var t = P(v); if (!t || !t.alive) return;
            tally[v] = (tally[v] || 0) + 1;
        });
        Object.keys(tally).forEach(function (t) { if (tally[t] > best) { best = tally[t]; top = [t]; } else if (tally[t] === best) top.push(t); });
        var out = null;
        if (top.length === 1 && best > skip) out = P(top[0]);
        G.verdict = { id: out ? out.id : null, tie: top.length > 1, tally: tally, skip: skip };
        if (out) { out.alive = false; out.diedRound = G.round; out.cause = 'vote'; sys('البلدة طردت ' + out.name); }
        else sys(top.length > 1 ? 'تعادل بالأصوات — ما أحد طلع' : 'ما أحد طلع هالجولة');
        go('verdict', VERDICT_MS);
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

    function act(id, a, arg) {
        var me = P(id); if (!me) return;
        if (a === 'chat') {
            var text = String(arg == null ? '' : arg).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
            if (!text || !me.alive) return;
            var night = G.phase === 'night';
            if (night && me.role !== 'mafia') return;           // بالليل: شات المافيا السري فقط
            if (!night && G.phase !== 'day' && G.phase !== 'vote') return;
            var now = Date.now();
            if (me._lastChat && now - me._lastChat < 1200) return;
            me._lastChat = now;
            G.chat.push({ n: ++chatSeq, from: id, text: text, at: now, mafia: night || undefined }); trimChat();
            return changed();
        }
        if (!me.alive) return;
        var t = arg == null ? null : P(String(arg));
        if (G.phase === 'night') {
            var N = G.night;
            if (a === 'kill' && me.role === 'mafia') {
                if (!t || !t.alive || t.role === 'mafia') return;
                N.mafiaVotes[id] = t.id;
            } else if (a === 'protect' && me.role === 'doctor') {
                if (!t || !t.alive || (t.id === id && !S.doctorSelf)) return;
                N.protect = t.id;
            } else if (a === 'inspect' && me.role === 'detective') {
                if (!t || !t.alive || t.id === id || N.inspect) return;   // استجواب واحد بالليلة وما يتغيّر
                N.inspect = t.id;
            } else return;
            changed();
            if (nightDone()) { G.endsAt = Math.min(G.endsAt, Date.now() + 2500); changed(); }
            return;
        }
        if (G.phase === 'vote' && a === 'vote') {
            if (arg === 'skip') G.votes[id] = 'skip';
            else { if (!t || !t.alive || t.id === id) return; G.votes[id] = t.id; }
            changed();
            if (alive().every(function (p) { return G.votes[p.id]; })) { G.endsAt = Math.min(G.endsAt, Date.now() + 2000); changed(); }
        }
    }

    /** المذيع: ينهي المرحلة الحالية (تخطي النقاش/التصويت/المشهد). */
    function endStage() { if (G.phase !== 'over') next(); }

    /** لاعب انطرد/طلع وسط المباراة. */
    function remove(id) {
        var p = P(id); if (!p || !p.alive) return;
        p.alive = false; p.diedRound = G.round; p.cause = 'left';
        sys(p.name + ' طلع من اللعبة');
        if (G.phase !== 'over') { var w = winner(); if (w && G.phase !== 'dawn' && G.phase !== 'verdict') finish(w); }
        changed();
    }

    function view(id) {
        var isHost = id === 'host', me = !isHost && P(id), over = G.phase === 'over';
        var meMafia = me && me.role === 'mafia';
        var players = G.players.map(function (p) {
            var showRole = over || (p === me) || (meMafia && p.role === 'mafia') || (!p.alive && S.revealRole && !hiddenDeath(p));
            return { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok, seat: p.seat, alive: p.alive || hiddenDeath(p), cause: hiddenDeath(p) ? null : p.cause, diedRound: p.diedRound, role: showRole ? p.role : null };
        });
        var v = {
            id: G.id, phase: G.phase, round: G.round, startedAt: G.startedAt, phaseAt: G.phaseAt, endsAt: G.endsAt, endedAt: G.endedAt || 0,
            settings: S, players: players, winner: G.winner,
            chat: G.chat.filter(function (c) { return !c.mafia || meMafia; }),
            votes: G.phase === 'vote' || G.phase === 'verdict' ? G.votes : {},
            verdict: G.verdict,
            seq: G.phase === 'dawn' ? G.seq : [],
            counts: { mafia: S.mafia, doctor: S.doctor, detective: S.detective }
        };
        if (G.phase === 'night') {
            // كم واحد خلّص اختياره (بدون ما ينكشف مين ولا وش اختار) — لشريط الانتظار على البث
            var need = 0, done = 0, N = G.night;
            aliveRole('mafia').forEach(function (m) { need++; if (N.mafiaVotes[m.id]) done++; });
            if (aliveRole('doctor').length) { need++; if (N.protect) done++; }
            if (aliveRole('detective').length) { need++; if (N.inspect) done++; }
            v.nightProgress = { need: need, done: done };
        }
        if (me) {
            v.me = { id: me.id, role: me.role, alive: me.alive };
            if (G.phase === 'night' && G.night) {
                if (me.role === 'mafia') v.me.mafiaVotes = G.night.mafiaVotes;
                if (me.role === 'doctor') { v.me.protect = G.night.protect; }
                if (me.role === 'detective') v.me.inspect = G.night.inspect;
            }
            if (me.role === 'detective') v.me.inspections = G.inspections[me.id] || [];
            if (G.phase === 'vote' || G.phase === 'verdict') v.me.vote = G.votes[me.id] || null;
        }
        return v;
    }

    // ضحية الليل تبقى «حية» بحالة البث لين تنتهي لقطة الهجوم، عشان ما ينكشف قبل المشهد
    function hiddenDeath(p) {
        if (G.phase !== 'dawn' || p.cause !== 'mafia' || p.diedRound !== G.round) return false;
        var atk = G.seq.find(function (s) { return s.k === 'attack'; });
        return !atk || Date.now() < G.phaseAt + atk.at + 4600;
    }

    sys('بدأت المباراة — شوفوا أدواركم على جوالاتكم');
    changed();
    return { G: G, tick: tick, act: act, endStage: endStage, remove: remove, view: view };
}

module.exports = { createGame: createGame, SHOT: SHOT, REVEAL_MS: REVEAL_MS, VERDICT_MS: VERDICT_MS };
