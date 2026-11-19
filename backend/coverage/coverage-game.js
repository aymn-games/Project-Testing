/**
 * «خارج التغطية» — منطق المباراة (الخادم يملكه، والشاشات تعرض بس).
 *
 * مباراة = جولة وحدة: توزيع سري ← تلميحات على دفعات ← نقاش ← تصويت (وجولة
 * فاصلة لو تعادل) ← كشف ← تخمين أخير ← نتيجة. كل مرحلة لها وقت نهاية من ساعة
 * الخادم (stage.ends)، والشاشات تحسب العدّاد منه — ما تعتمد على ساعة الجهاز.
 *
 * السرية: view(id) يبني نسخة لكل طرف. الكلمات والأدوار ما تطلع بالنسخة العامة
 * (شاشة البث وباقي الجوالات) إلا بعد الكشف، والتلميح ما يطلع إلا لما تخلص دفعته.
 *
 * createGame(players, settings, opts)
 *   players: [{id, name, look, tiktok}]   opts: {onChange, now, rnd, recent, intro:'long'|'short', scores}
 *   → { G, tick(now), act(id, a, arg) → {err}|undefined, endStage(seq), remove(id), view(id) }
 *
 * المراحل (G.stage.k) ومددها بالملّي ثانية (لازم تطابق لقطات games/out-of-coverage/oc-scene.js):
 *   intro · deal · write · show · talk · vote · runoff · reveal · unmask · guess · guessed · over
 */
'use strict';

var Words = require('./coverage-words');

var DUR = {
    introLong: 6000, introShort: 2600, deal: 4200, show: 5200,
    reveal: 6200, unmask: 4200, guessed: 4800
};
var HINT_MAX = 40, GUESS_MAX = 30;
// المراحل اللي يقدر المذيع ينهيها بدري (بدون ما تخرب حالة المباراة).
// الكشف والتخمين ما ينتخطون: الكشف لقطة قصيرة، والتخمين فرصة اللاعب.
var SKIPPABLE = { intro: 1, deal: 1, write: 1, show: 1, talk: 1, vote: 1, runoff: 1 };

function shuffle(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
}
function clean(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function createGame(roster, settings, opts) {
    opts = opts || {};
    var clock = opts.now || Date.now, rnd = opts.rnd || Math.random;
    var onChange = opts.onChange || function () { };
    var S = settings;

    var pair = Words.pick(S.cat, opts.recent, rnd);
    var ids = roster.map(function (p) { return p.id; });
    var outIds = shuffle(ids.slice(), rnd).slice(0, Math.min(S.outsiders, Math.max(1, Math.floor((ids.length - 1) / 2))));

    var G = {
        mid: Math.random().toString(36).slice(2, 10),
        startedAt: clock(), endedAt: 0,
        settings: { mode: S.mode, batchSize: S.batchSize, finalGuess: S.finalGuess, outsiders: outIds.length, hintSec: S.hintSec, talkSec: S.talkSec, voteSec: S.voteSec, guessSec: S.guessSec },
        cat: pair.catName, pairKey: pair.key,
        word: pair.word, alt: S.mode === 'blank' ? null : pair.alt,
        // seat = مكان الشخصية على المسرح (ترتيب الدخول)، ثابت طول المباراة
        players: roster.map(function (p, i) {
            var out = outIds.indexOf(p.id) >= 0;
            return { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok || null, seat: i, out: out, left: false, hint: null, hintAt: 0, vote: null, guess: null };
        }),
        // دفعات التلميح: ترتيب عشوائي جديد كل مباراة، وكل لاعب بدفعة وحدة بس
        batches: chunk(shuffle(ids.slice(), rnd), S.batchSize),
        batch: -1, shown: [],   // shown = أرقام الدفعات اللي انكشفت تلميحاتها
        stage: null, seq: 0,
        tally: null, tally1: null, runoff: null, accused: null, accusedOut: null, guessOk: null,
        result: null
    };

    function chunk(a, n) { var out = []; for (var i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
    function P(id) { return G.players.find(function (p) { return p.id === id; }); }
    function active() { return G.players.filter(function (p) { return !p.left; }); }
    function online(id) { return opts.isOnline ? opts.isOnline(id) : true; }

    function setStage(k, ms) {
        var now = clock();
        G.seq++;
        G.stage = { k: k, at: now, ends: ms == null ? 0 : now + ms, seq: G.seq };
        onChange();
    }

    // ---------------------------------------------------------------- تسلسل المراحل
    function startBatch(i) {
        // دفعة كل لاعبينها طلعوا من الغرفة ← نتخطاها
        while (i < G.batches.length && !G.batches[i].some(function (id) { var p = P(id); return p && !p.left; })) i++;
        if (i >= G.batches.length) return startTalk();
        G.batch = i;
        setStage('write', S.hintSec * 1000);
    }
    function startTalk() {
        G.batch = -1;
        if (S.talkSec > 0) setStage('talk', S.talkSec * 1000); else startVote();
    }
    function startVote() {
        G.players.forEach(function (p) { p.vote = null; });
        G.runoff = null;
        setStage('vote', S.voteSec * 1000);
    }

    /** ينتقل للمرحلة اللي بعد الحالية — المكان الوحيد اللي يغيّر التسلسل (ما يصير انتقالين مع بعض). */
    function next() {
        var k = G.stage.k;
        if (k === 'intro') return setStage('deal', DUR.deal);
        if (k === 'deal') return startBatch(0);
        if (k === 'write') { G.shown.push(G.batch); return setStage('show', DUR.show); }
        if (k === 'show') return startBatch(G.batch + 1);
        if (k === 'talk') return startVote();
        if (k === 'vote' || k === 'runoff') return closeVote();
        if (k === 'reveal') {
            if (!G.accused) return finish(G.tally && G.tally.top ? 'tie' : 'novote');
            G.accusedOut = !!P(G.accused).out;
            return setStage('unmask', DUR.unmask);
        }
        if (k === 'unmask') {
            if (!G.accusedOut) return finish('wrong');
            if (S.finalGuess && !P(G.accused).left) return setStage('guess', S.guessSec * 1000);
            return finish('caught');
        }
        if (k === 'guess') {
            var g = P(G.accused);
            G.guessOk = !!(g && g.guess && Words.matches(g.guess, G.word));
            return setStage('guessed', DUR.guessed);
        }
        if (k === 'guessed') return finish(G.guessOk ? 'guessed' : 'caught');
    }

    function tallyVotes(candidates) {
        var counts = {}, top = 0;
        candidates.forEach(function (id) { counts[id] = 0; });
        active().forEach(function (p) { if (p.vote && counts[p.vote] != null) counts[p.vote]++; });
        Object.keys(counts).forEach(function (id) { top = Math.max(top, counts[id]); });
        var leaders = top ? Object.keys(counts).filter(function (id) { return counts[id] === top; }) : [];
        var votes = {};
        active().forEach(function (p) { if (p.vote && counts[p.vote] != null) votes[p.id] = p.vote; });
        return { counts: counts, top: top, leaders: leaders, votes: votes };
    }

    /**
     * قفل التصويت. التعادل بالتصويت الأول ← جولة فاصلة قصيرة بين المتعادلين.
     * التعادل بالجولة الفاصلة (أو ما أحد صوّت) ← ما أحد ينكشف، ويفوز خارج التغطية.
     */
    function closeVote() {
        var isRunoff = G.stage.k === 'runoff';
        var cands = isRunoff ? G.runoff.slice() : active().map(function (p) { return p.id; });
        var t = tallyVotes(cands);
        if (!isRunoff) G.tally1 = t;
        G.tally = t;
        if (!isRunoff && t.leaders.length > 1) {
            G.runoff = t.leaders;
            G.players.forEach(function (p) { p.vote = null; });
            return setStage('runoff', Math.max(10, Math.round(S.voteSec * 0.75)) * 1000);
        }
        G.accused = t.leaders.length === 1 ? t.leaders[0] : null;
        setStage('reveal', DUR.reveal);
    }

    /**
     * النتيجة والنقاط (نقاط الغرفة، مو نقاط المنصة):
     *   فوز الأغلبية: كل واحد منهم +2 · فوز خارج التغطية: كل واحد منهم +3، واللي خمّن صح +1
     *   وأي لاعب من الأغلبية صوّت على خارج التغطية +1 (حتى لو فريقه خسر)
     */
    function finish(reason) {
        var winner = reason === 'caught' ? 'in' : reason === 'abort' ? 'none' : 'out';
        var finalVotes = (G.tally && G.tally.votes) || {};
        var pts = {};
        G.players.forEach(function (p) {
            var n = 0;
            if (winner === 'in' && !p.out) n += 2;
            if (winner === 'out' && p.out) n += 3;
            if (reason === 'guessed' && p.id === G.accused) n += 1;
            if (winner !== 'none' && !p.out && finalVotes[p.id] && P(finalVotes[p.id]).out) n += 1;
            if (n) pts[p.id] = n;
        });
        var civ = G.players.filter(function (p) { return !p.out; });
        var correct = civ.filter(function (p) { return finalVotes[p.id] && P(finalVotes[p.id]).out; }).length;
        var fooled = civ.length - correct;
        var deceiver = null;
        if (winner !== 'none') {
            // اللي خدع أكثر: خارج التغطية اللي جاه أقل أصوات من الأغلبية
            G.players.filter(function (p) { return p.out; }).forEach(function (p) {
                var on = civ.filter(function (c) { return finalVotes[c.id] === p.id; }).length;
                if (!deceiver || on < deceiver.on) deceiver = { id: p.id, on: on };
            });
        }
        G.result = {
            winner: winner, reason: reason, points: pts,
            outs: G.players.filter(function (p) { return p.out; }).map(function (p) { return p.id; }),
            stats: { correct: correct, voters: civ.length, fooled: fooled, deceiver: deceiver && fooled ? deceiver.id : null, guess: G.accused && P(G.accused).guess ? P(G.accused).guess : null }
        };
        G.endedAt = clock();
        G.batch = -1;
        setStage('over', null);
    }

    // ---------------------------------------------------------------- واجهة الخادم
    function tick(now) {
        if (!G.stage || G.stage.k === 'over') return;
        now = now || clock();
        if (G.stage.ends && now >= G.stage.ends) return next();
        // نهاية مبكرة: كل اللي باقي عليهم الدور خلّصوا (والطالعين/المنقطعين ما نستناهم)
        var k = G.stage.k;
        if (k === 'write') {
            var batch = G.batches[G.batch].map(P).filter(function (p) { return p && !p.left; });
            if (!batch.length || (batch.every(function (p) { return p.hint || !online(p.id); }) && batch.some(function (p) { return p.hint; }))) return next();
        }
        if (k === 'vote' || k === 'runoff') {
            var voters = active().filter(function (p) { return online(p.id); });
            if (voters.length && voters.every(function (p) { return p.vote; })) return next();
        }
        if (k === 'guess') { var g = P(G.accused); if (g && g.guess) return next(); }
    }

    function act(id, a, arg) {
        var p = P(id); if (!p || p.left || !G.stage) return;
        var k = G.stage.k;
        if (a === 'hint') {
            if (k !== 'write' || G.batches[G.batch].indexOf(id) < 0) return { err: 'مو دورك الحين' };
            if (p.hint) return { err: 'أرسلت تلميحك' };
            var h = clean(arg, HINT_MAX);
            if (!h) return { err: 'اكتب تلميح' };
            var mine = p.out ? G.alt : G.word;
            if (mine && Words.containsWord(h, mine)) return { err: 'لا تكتب الكلمة نفسها 😉' };
            p.hint = h; p.hintAt = clock(); onChange();
            return;
        }
        if (a === 'vote') {
            if (k !== 'vote' && k !== 'runoff') return { err: 'التصويت مقفل' };
            if (p.vote) return { err: 'صوتك انحسب' };
            var t = P(String(arg || ''));
            if (!t || t.left) return { err: 'اختار لاعب' };
            if (t.id === id) return { err: 'ما تقدر تصوّت لنفسك' };
            if (k === 'runoff' && G.runoff.indexOf(t.id) < 0) return { err: 'التصويت الفاصل بين المتعادلين بس' };
            p.vote = t.id; onChange();
            return;
        }
        if (a === 'guess') {
            if (k !== 'guess' || id !== G.accused) return { err: 'مو وقت التخمين' };
            if (p.guess) return;
            var gs = clean(arg, GUESS_MAX);
            if (!gs) return { err: 'اكتب الكلمة' };
            p.guess = gs; onChange();
            return;
        }
    }

    /** المذيع ينهي المرحلة الحالية. seq لازم يطابق المرحلة اللي شافها، فالضغط المكرر أو المتأخر ما ينهي مرحلتين. */
    function endStage(seq) {
        if (!G.stage || !SKIPPABLE[G.stage.k]) return false;
        if (seq != null && Number(seq) !== G.stage.seq) return false;
        next();
        return true;
    }

    /** لاعب طلع أو انطرد: شخصيته تبقى بالمشهد (باهتة) لين تخلص المباراة، والمباراة تكمل بدونه. */
    function remove(id) {
        var p = P(id); if (!p || p.left) return;
        p.left = true; p.vote = null;
        G.players.forEach(function (q) { if (q.vote === id) q.vote = null; });
        if (G.runoff) G.runoff = G.runoff.filter(function (x) { return x !== id; });
        onChange();
        if (G.stage.k === 'over') return;
        var left = active();
        if (!left.some(function (q) { return q.out; }) || left.length < 3) return finish('abort');
        if (G.stage.k === 'runoff' && G.runoff.length < 2) return closeVote();
        if ((G.stage.k === 'guess') && id === G.accused) return next();
    }

    /**
     * نسخة اللاعب id (أو 'host' لشاشة البث). المعلومات السرية ما تنحط أصلاً بالنسخة العامة.
     */
    function view(id) {
        var k = G.stage ? G.stage.k : 'intro', over = k === 'over';
        var curBatch = G.batch >= 0 ? G.batches[G.batch] : [];
        var unmasked = k === 'unmask' || k === 'guess' || k === 'guessed' || over;
        var showTally = k === 'reveal' || unmasked;
        var players = G.players.map(function (p) {
            var bi = -1; G.batches.forEach(function (b, i) { if (b.indexOf(p.id) >= 0) bi = i; });
            var o = { id: p.id, name: p.name, look: p.look, seat: p.seat, left: p.left, batch: bi, tiktok: p.tiktok };
            if (G.shown.indexOf(bi) >= 0) o.hint = p.hint || '';           // '' = ما أرسل تلميح
            if (k === 'write' && curBatch.indexOf(p.id) >= 0) o.sent = !!p.hint;
            if (k === 'vote' || k === 'runoff') o.voted = !!p.vote;
            if (over) { o.out = p.out; o.vote = (G.tally && G.tally.votes[p.id]) || null; }
            return o;
        });
        var v = {
            mid: G.mid, startedAt: G.startedAt, endedAt: G.endedAt, settings: G.settings, cat: G.cat,
            stage: G.stage, batches: G.batches.length, batch: G.batch, shownCount: G.shown.length,
            players: players, runoff: G.runoff,
            tally: showTally && G.tally ? { counts: G.tally.counts, top: G.tally.top } : null,
            tally1: showTally && G.tally1 && G.runoff ? { counts: G.tally1.counts } : null,
            accused: showTally ? G.accused : null,
            accusedOut: unmasked ? G.accusedOut : null,
            guess: (k === 'guessed' || over) && G.accused ? P(G.accused).guess : null,
            guessOk: k === 'guessed' || over ? G.guessOk : null,
            words: k === 'guessed' || over ? { word: G.word, alt: G.alt } : null,
            result: over ? G.result : null
        };
        var me = P(id);
        if (me) {
            v.me = {
                id: me.id, out: me.out, word: me.out ? G.alt : G.word, mode: G.settings.mode,
                batch: players.find(function (q) { return q.id === me.id; }).batch,
                hint: me.hint, vote: me.vote, guess: me.guess, left: me.left
            };
        }
        return v;
    }

    setStage('intro', opts.intro === 'short' ? DUR.introShort : DUR.introLong);

    return { G: G, tick: tick, act: act, endStage: endStage, remove: remove, view: view, finish: finish };
}

module.exports = { createGame: createGame, DUR: DUR, HINT_MAX: HINT_MAX, GUESS_MAX: GUESS_MAX };
