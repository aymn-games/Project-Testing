/**
 * «حجرة ورقة مقص» — منطق البطولة (بدون واجهة ولا Three.js).
 *
 * نظام اللعب: بطولة مواجهات ثنائية. كل دور اللاعبين الباقين ينقسمون أزواج،
 * وكل لاعب يكتب بالشات 1 (حجرة) أو 2 (ورقة) أو 3 (مقص). الفائز يتأهل للدور
 * اللي بعده، والخاسر يطلع ويصير متفرج. العدد الفردي: لاعب واحد يتأهل
 * مباشرة (الأولوية لمن ما تأهل مباشرة قبل). التعادل يعيد المواجهة نفسها.
 *
 * الشاشة (game.html) هي اللي تمسك الوقت وتستدعي الدوال هنا بالترتيب:
 *   join() طول فترة الدخول ← startRound() ← لكل مواجهة i بالترتيب: pick() طول وقت
 *   الاختيار ← resolve(i) ← (لو تعادل: startReplay(i) ثم pick() ثم resolve(i) من جديد)
 *   ← nextRound() ... لين champion().
 *
 * يشتغل بالمتصفح (window.RpsEngine) وبـ node للاختبار (module.exports).
 */
(function (root) {
    'use strict';

    var ROCK = 1, PAPER = 2, SCISSORS = 3;
    var NAMES = { 1: 'حجرة', 2: 'ورقة', 3: 'مقص' };
    var MAX_TIES = 3; // بعد 3 تعادلات ورا بعض يُحسم بالقرعة عشان البث ما يعلق

    /** 1 لو a يغلب b، -1 لو العكس، 0 تعادل. */
    function beats(a, b) {
        if (a === b) return 0;
        return (a === ROCK && b === SCISSORS) || (a === PAPER && b === ROCK) || (a === SCISSORS && b === PAPER) ? 1 : -1;
    }

    /** رقم الاختيار من نص التعليق: «1» أو «٢» أو «۳» بس (رقم واحد لحاله). */
    function parsePick(text) {
        var s = String(text == null ? '' : text).normalize('NFKC').trim()
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
        return s === '1' || s === '2' || s === '3' ? Number(s) : 0;
    }

    function shuffle(list, rnd) {
        var a = list.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
    }

    /**
     * opts: {maxPlayers, random}. random() للاختبار (افتراضياً Math.random).
     */
    function create(opts) {
        opts = opts || {};
        var rnd = typeof opts.random === 'function' ? opts.random : Math.random;
        var maxPlayers = Math.max(2, opts.maxPlayers | 0 || 32);
        var players = [];      // {id, name, avatarUrl, out, outRound, byes}
        var byId = {};
        var round = 0;
        var duels = [];        // {a, b, picks:{}, ties, result, winner, loser, how}
        var bye = null;        // id المتأهل مباشرة بهذا الدور
        var champ = null;

        function alive() { return players.filter(function (p) { return !p.out; }); }

        /** دخول لاعب جديد (فترة الدخول بس). يرجع اللاعب لو انضاف، أو null. */
        function join(p) {
            if (round > 0 || !p || !p.id || byId[p.id] || players.length >= maxPlayers) return null;
            var pl = { id: p.id, name: String(p.name || p.id), avatarUrl: p.avatarUrl || null, out: false, outRound: 0, byes: 0 };
            players.push(pl); byId[p.id] = pl;
            return pl;
        }

        /** يحدّث الاسم/الصورة لو تغيّرت (نفس اللاعب). */
        function touch(p) {
            var pl = p && byId[p.id];
            if (!pl) return;
            if (p.name) pl.name = String(p.name);
            if (p.avatarUrl) pl.avatarUrl = p.avatarUrl;
        }

        function remove(id) {
            if (round > 0 || !byId[id]) return false;
            players = players.filter(function (p) { return p.id !== id; });
            delete byId[id];
            return true;
        }

        function pair(list) {
            list = shuffle(list, rnd);
            bye = null;
            if (list.length % 2) {
                // اللي تأهل مباشرة أقل عدد مرات ياخذها هالمرة
                var min = Math.min.apply(null, list.map(function (p) { return p.byes; }));
                var cands = list.filter(function (p) { return p.byes === min; });
                var b = cands[Math.floor(rnd() * cands.length)];
                b.byes++; bye = b.id;
                list = list.filter(function (p) { return p !== b; });
            }
            duels = [];
            for (var i = 0; i < list.length; i += 2) duels.push({ a: list[i].id, b: list[i + 1].id, picks: {}, ties: 0, result: null, winner: null, loser: null, how: null });
        }

        /** يبدأ الدور الأول. يحتاج لاعبين على الأقل. */
        function startRound() {
            if (round > 0 || players.length < 2) return false;
            round = 1;
            pair(players);
            return true;
        }

        function duelOf(id) {
            for (var i = 0; i < duels.length; i++) if (!duels[i].result && (duels[i].a === id || duels[i].b === id)) return duels[i];
            return null;
        }

        /** اختيار لاعب بمواجهة مفتوحة. آخر اختيار قبل نهاية الوقت هو اللي يُحسب. */
        function pick(id, choice) {
            if (champ || !(choice >= 1 && choice <= 3)) return false;
            var d = duelOf(id);
            if (!d) return false;
            d.picks[id] = choice;
            return true;
        }

        /**
         * نهاية وقت الاختيار: يحسم كل مواجهة مفتوحة، أو المواجهة رقم only بس (اللعب مواجهة مواجهة).
         * يرجع {ties: عدد المواجهات اللي تعادلت}.
         * how: 'beat' غلب · 'noshow' الخصم ما اختار · 'draw' قرعة (كلهم ما اختاروا أو تعادل كثير)
         */
        function resolve(only) {
            var ties = 0;
            duels.forEach(function (d, i) {
                if (d.result || (only != null && i !== only)) return;
                var pa = d.picks[d.a] || 0, pb = d.picks[d.b] || 0, w = 0, how = 'beat';
                if (pa && pb) {
                    w = beats(pa, pb);
                    if (!w) {
                        d.ties++;
                        if (d.ties < MAX_TIES) { d.result = 'tie'; ties++; return; }
                        how = 'draw'; w = rnd() < 0.5 ? 1 : -1;
                    }
                } else if (pa || pb) { w = pa ? 1 : -1; how = 'noshow'; }
                else { w = rnd() < 0.5 ? 1 : -1; how = 'draw'; }
                d.result = 'done'; d.how = how;
                d.winner = w > 0 ? d.a : d.b; d.loser = w > 0 ? d.b : d.a;
            });
            return { ties: ties };
        }

        /** يفتح المواجهات المتعادلة من جديد (نفس اللاعبين، اختيارات جديدة). */
        function startReplay(only) {
            var n = 0;
            duels.forEach(function (d, i) { if (d.result === 'tie' && (only == null || i === only)) { d.result = null; d.lastPicks = d.picks; d.picks = {}; n++; } });
            return n;
        }

        function roundDone() { return duels.every(function (d) { return d.result === 'done'; }); }

        /** يطلّع الخاسرين ويرتب الدور اللي بعده (أو يعلن البطل). */
        function nextRound() {
            if (!roundDone()) return false;
            duels.forEach(function (d) { var p = byId[d.loser]; if (p && !p.out) { p.out = true; p.outRound = round; } });
            var left = alive();
            if (left.length <= 1) { champ = left[0] ? left[0].id : null; duels = []; bye = null; return true; }
            round++;
            pair(left);
            return true;
        }

        /** عدد الأدوار المتبقية تقريباً (للعنوان: نهائي/نصف نهائي). */
        function stageName() {
            var n = alive().length;
            if (n === 2) return 'النهائي';
            if (n <= 4) return 'نصف النهائي';
            if (n <= 8) return 'ربع النهائي';
            return 'الدور ' + round;
        }

        return {
            join: join, touch: touch, remove: remove, startRound: startRound, pick: pick, resolve: resolve,
            startReplay: startReplay, roundDone: roundDone, nextRound: nextRound, stageName: stageName,
            get players() { return players; },
            get alive() { return alive(); },
            get round() { return round; },
            get duels() { return duels; },
            get bye() { return bye; },
            get champion() { return champ; },
            get maxPlayers() { return maxPlayers; },
            player: function (id) { return byId[id] || null; },
            duelOf: duelOf
        };
    }

    var api = { create: create, beats: beats, parsePick: parsePick, NAMES: NAMES, ROCK: ROCK, PAPER: PAPER, SCISSORS: SCISSORS, MAX_TIES: MAX_TIES };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RpsEngine = api;
}(typeof window !== 'undefined' ? window : this));
