/**
 * كوّن كلمة — محرك اللعبة (منطق فقط، بدون أي واجهة).
 *
 * يشتغل في المتصفح (window.WordHiveEngine) وفي Node (require) حتى تنفحص
 * القواعد باختبارات مستقلة (tests/wh-engine.test.js) وبسكربت تقرير
 * الجولات (tools/wh-report.js).
 *
 * سياسة التطبيع العربية الموحّدة (normalizeWord):
 *  - حذف التشكيل والتطويل والرموز غير المرئية.
 *  - أ إ آ ٱ ← ا · ى ← ي · ة ← ه · ؤ ← و · ئ ← ي (الهمزة المفردة ء تبقى حرفاً).
 *  - الحروف الفارسية: ی ← ي · ک ← ك · ہ/ە ← ه.
 *  - لا تُحذف "ال" ولا يُختصر تكرار الحرف (تكرار الحرف مسموح بالكلمة).
 * نفس التطبيع يُطبَّق على أحرف الخلية وكلمات القاموس ورسائل الشات.
 *
 * كل جولة لها 20 كلمة مطلوبة محددة (targetWords) — وهي وحدها قاموس الجولة أثناء اللعب.
 *
 * ترتيب فحص الكلمة (submit):
 *  حالة الجولة ← الرسالة مكررة؟ ← تطبيع ← الطول ← حرف الوسط ←
 *  أحرف من الخلية فقط ← تكرار الحرف (حسب الإعداد) ← القاموس المعتمد ←
 *  سبق احتسابها؟ ← احتساب النقاط لأول لاعب.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WordHiveEngine = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var MIN_APPROVED_WORDS = 20;
    // كل جولة لها 20 كلمة مطلوبة محددة مسبقاً: أول 20 كلمة من قاموسها المعتمد (حسب ترتيبها بالبنك)
    // تنطبق عليها قواعد الطول والتكرار. فقط هذه الكلمات تُحتسب، والجولة تكتمل عند اكتشافها كلها.
    var TARGET_WORDS = 20;

    var REASONS = {
        inactive:    'الجولة غير نشطة',
        paused:      'الجولة متوقفة مؤقتاً',
        time_up:     'انتهى الوقت',
        dup_message: 'رسالة مكررة',
        empty:       'ليست كلمة عربية',
        short:       'أقصر من الحد الأدنى',
        no_center:   'لا تحتوي على حرف الوسط',
        bad_letter:  'تحتوي على حرف غير موجود في الخلية',
        repeat:      'تكرار الحرف غير مسموح',
        not_in_dict: 'ليست من كلمات الجولة المطلوبة',
        duplicate:   'سبق احتسابها'
    };

    var DEFAULT_POINTS = { p3: 1, p4: 2, p5: 3, p6: 5, golden: 7 };

    function normalizeWord(s) {
        return String(s == null ? '' : s).normalize('NFKC')
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
            .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا')
            .replace(/[ىیېۍ]/g, 'ي')
            .replace(/[ةۃہە]/g, 'ه')
            .replace(/ؤ/g, 'و')
            .replace(/ئ/g, 'ي')
            .replace(/ک/g, 'ك')
            .trim();
    }

    var ARABIC_WORD_RE = /^[ء-ي]+$/;

    /**
     * يستخرج كلمة واحدة من رسالة الشات (بعد حذف الرموز والإيموجي والترقيم
     * حولها). رسالة فيها أكثر من كلمة أو أحرف غير عربية = دردشة عادية → null.
     */
    function extractCandidate(text) {
        var t = normalizeWord(text).replace(/[^ء-ي\s]/g, ' ').trim();
        if (!t || /\s/.test(t)) return null;
        return ARABIC_WORD_RE.test(t) ? t : null;
    }

    function chars(word) { return Array.from(word); }

    function hasRepeat(word) {
        var seen = {};
        return chars(word).some(function (c) { if (seen[c]) return true; seen[c] = 1; return false; });
    }

    /** أحرف الخلية السبعة (الوسط أولاً) بعد التطبيع. */
    function hiveLetters(round) {
        return [normalizeWord(round.center)].concat((round.letters || []).map(normalizeWord));
    }

    function isGolden(word, round) {
        var w = normalizeWord(word);
        return hiveLetters(round).every(function (c) { return w.indexOf(c) !== -1; });
    }

    /**
     * فحص الكلمة مقابل أحرف الخلية والقواعد فقط (بدون القاموس وحالة الجولة).
     * rules: { minLen, allowRepeat } — حرف الوسط وأحرف الخلية إلزامية دائماً
     * ولا يوجد إعداد يتجاوزها.
     * ترجع { ok, reason, word, usesHiveOnly }.
     */
    function checkLetters(raw, round, rules) {
        rules = rules || {};
        var w = normalizeWord(raw);
        if (!w || !ARABIC_WORD_RE.test(w)) return { ok: false, reason: 'empty', word: w, usesHiveOnly: false };
        var letters = hiveLetters(round), center = letters[0];
        var usesHiveOnly = chars(w).every(function (c) { return letters.indexOf(c) !== -1; });
        var minLen = Math.max(3, +rules.minLen || 3);
        if (chars(w).length < minLen) return { ok: false, reason: 'short', word: w, usesHiveOnly: usesHiveOnly };
        if (w.indexOf(center) === -1) return { ok: false, reason: 'no_center', word: w, usesHiveOnly: usesHiveOnly };
        if (!usesHiveOnly) return { ok: false, reason: 'bad_letter', word: w, usesHiveOnly: false };
        if (rules.allowRepeat === false && hasRepeat(w)) return { ok: false, reason: 'repeat', word: w, usesHiveOnly: true };
        return { ok: true, reason: null, word: w, usesHiveOnly: true };
    }

    function pointsFor(word, round, points) {
        var P = Object.assign({}, DEFAULT_POINTS, points || {});
        var len = chars(normalizeWord(word)).length;
        var base = len >= 6 ? +P.p6 : len === 5 ? +P.p5 : len === 4 ? +P.p4 : +P.p3;
        var golden = isGolden(word, round);
        var bonus = golden ? +P.golden : 0;
        return { base: base || 0, bonus: bonus || 0, total: (base || 0) + (bonus || 0), golden: golden };
    }

    /**
     * تقرير تحقق جولة من البنك: يفحص كل كلمة مقابل أحرف جولتها ويستبعد غير
     * المطابقة والمكررة، ويحسب الكلمات الذهبية وحالة الجولة الفعلية.
     * الجولة "معتمدة" فقط لو حالتها المعلنة approved وعدد الكلمات الصحيحة
     * الفريدة ≥ minWords (20 افتراضياً)، وإلا "مسودة" وتُستبعد من الاختيار.
     */
    function validateRound(raw, opts) {
        opts = opts || {};
        var minWords = opts.minWords || MIN_APPROVED_WORDS;
        var problems = [];
        var letters = hiveLetters(raw);
        var distinct = letters.filter(function (c, i) { return c && letters.indexOf(c) === i; });
        if (letters.length !== 7 || distinct.length !== 7 || letters.some(function (c) { return chars(c).length !== 1; })) {
            problems.push('الخلية يجب أن تحتوي 7 أحرف مختلفة (حرف وسط + 6 حوله)');
        }
        var accepted = [], rejected = [], seen = {};
        (raw.words || []).forEach(function (orig) {
            var r = checkLetters(orig, raw, { minLen: 3, allowRepeat: true });
            if (!r.ok) return rejected.push({ word: String(orig), reason: r.reason, message: REASONS[r.reason] });
            if (seen[r.word]) return rejected.push({ word: String(orig), reason: 'duplicate', message: 'مكررة في البنك' });
            seen[r.word] = 1;
            accepted.push(r.word);
        });
        var golden = accepted.filter(function (w) { return isGolden(w, raw); });
        var declared = raw.status === 'draft' ? 'draft' : 'approved';
        var status = !problems.length && declared === 'approved' && accepted.length >= minWords ? 'approved' : 'draft';
        if (accepted.length < minWords) problems.push('عدد الكلمات الصحيحة الفريدة ' + accepted.length + ' أقل من ' + minWords);
        if (declared === 'draft') problems.push('معلّمة كمسودة تحتاج مراجعة');
        return {
            id: raw.id, center: letters[0], letters: letters.slice(1), difficulty: raw.difficulty || 'easy',
            declaredStatus: declared, status: status, answers: accepted, golden: golden,
            count: accepted.length, rejected: rejected, problems: problems
        };
    }

    /** يفحص كل جولات البنك. ترجع { rounds (كلها بعد الفحص), approved, drafts }. */
    function buildBank(rawRounds, opts) {
        var rounds = (rawRounds || []).map(function (r) { return validateRound(r, opts); });
        return {
            rounds: rounds,
            approved: rounds.filter(function (r) { return r.status === 'approved'; }),
            drafts: rounds.filter(function (r) { return r.status !== 'approved'; })
        };
    }

    /**
     * اختيار جولة معتمدة: يدوياً (manualId) أو عشوائياً حسب الصعوبة
     * ('easy' | 'medium' | 'mixed') مع تجنّب الجولات الأخيرة لو أمكن.
     * المسودات لا تُختار أبداً.
     */
    function pickRound(bank, opts) {
        opts = opts || {};
        var approved = bank.approved || [];
        if (opts.manualId) {
            var m = approved.filter(function (r) { return r.id === opts.manualId; })[0];
            if (m) return m;
        }
        var pool = opts.difficulty && opts.difficulty !== 'mixed'
            ? approved.filter(function (r) { return r.difficulty === opts.difficulty; }) : approved.slice();
        if (!pool.length) pool = approved.slice();
        if (opts.avoidRecent && opts.recent && opts.recent.length) {
            var fresh = pool.filter(function (r) { return opts.recent.indexOf(r.id) === -1; });
            if (fresh.length) pool = fresh;
        }
        if (!pool.length) return null;
        var rng = opts.rng || Math.random;
        return pool[Math.floor(rng() * pool.length) % pool.length];
    }

    /** معرّف ثابت للاعب: اختلاف حالة الأحرف أو @ أو المسافات لا ينشئ لاعباً جديداً. */
    function playerKey(id, name) {
        var k = String(id == null || id === '' ? (name || '') : id).normalize('NFKC').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
        return k || null;
    }

    /** الكلمات المطلوبة للجولة: أول TARGET_WORDS كلمة من القاموس المعتمد تنطبق عليها القواعد. */
    function targetWords(round, rules, count) {
        var n = Math.max(1, +count || TARGET_WORDS);
        return round.answers.filter(function (w) { return checkLetters(w, round, rules || {}).ok; }).slice(0, n);
    }

    /**
     * جلسة جولة واحدة. rules تُنسخ عند الإنشاء (snapshot) فأي تعديل على
     * الإعدادات أثناء اللعب لا يغيّر قواعد هذه الجولة.
     * rules: { durationSec, minLen, allowRepeat, points:{p3,p4,p5,p6,golden} }
     * الوقت يُمرَّر دائماً (now بالمللي ثانية) حتى تكون الجلسة قابلة للاختبار.
     */
    function createSession(round, rules) {
        var R = {
            durationSec: Math.max(10, +(rules && rules.durationSec) || 120),
            minLen: Math.max(3, Math.min(5, +(rules && rules.minLen) || 3)),
            allowRepeat: !(rules && rules.allowRepeat === false),
            points: Object.assign({}, DEFAULT_POINTS, rules && rules.points)
        };
        var eligible = targetWords(round, R, rules && rules.targetCount);
        var dict = {};
        eligible.forEach(function (w) { dict[w] = 1; });

        var state = 'ready', endsAt = 0, remainingMs = R.durationSec * 1000, startedAt = 0, activeMs = 0, resumedAt = 0, endReason = null;
        var found = [];            // [{word, playerKey, name, points, golden, at}]
        var foundBy = {};          // word → entry
        var players = {};          // key → {key, id, name, score, words:[]}
        var seenMsg = {};
        var seenPayloads = typeof WeakSet === 'function' ? new WeakSet() : null;

        function remaining(now) {
            if (state === 'running') return Math.max(0, endsAt - now);
            return state === 'ended' ? 0 : remainingMs;
        }
        function start(now) {
            if (state !== 'ready') return false;
            state = 'running'; startedAt = now; resumedAt = now; endsAt = now + remainingMs;
            return true;
        }
        function pause(now) {
            if (state !== 'running') return false;
            if (tick(now)) return false;
            remainingMs = Math.max(0, endsAt - now); activeMs += now - resumedAt; state = 'paused';
            return true;
        }
        function resume(now) {
            if (state !== 'paused') return false;
            state = 'running'; resumedAt = now; endsAt = now + remainingMs;
            return true;
        }
        function end(now, reason) {
            if (state === 'ended' || state === 'ready') return false;
            if (state === 'running') activeMs += Math.min(now, endsAt) - resumedAt;
            state = 'ended'; remainingMs = 0; endReason = reason || 'manual';
            return true;
        }
        /** ينهي الجولة لو خلص الوقت. ترجع true لو انتهت الآن. */
        function tick(now) {
            if (state === 'running' && now >= endsAt) return end(now, 'time');
            return false;
        }
        function playerFor(msg) {
            var key = playerKey(msg.playerId, msg.playerName);
            if (!key) return null;
            var p = players[key];
            if (!p) p = players[key] = { key: key, id: msg.playerId || key, name: String(msg.playerName || msg.playerId || key), score: 0, words: [], avatar: msg.avatar || null };
            else {
                if (msg.playerName) p.name = String(msg.playerName);
                if (msg.avatar) p.avatar = msg.avatar;
            }
            return p;
        }
        function reject(reason, extra) {
            return Object.assign({ status: 'rejected', reason: reason, message: REASONS[reason] }, extra || {});
        }
        /**
         * msg: { playerId, playerName, text, msgId?, payload? }
         * ترجع { status: 'accepted'|'rejected'|'ignored', reason, message, word, points, golden, player }
         * الجافاسكربت يعالج الرسائل بالتتابع، فأول رسالة تحجز الكلمة والثانية
         * (حتى لو وصلت بنفس اللحظة) ترجع duplicate بدون مضاعفة النقاط.
         */
        function submit(msg, now) {
            msg = msg || {};
            if (state === 'running') tick(now);
            if (state === 'paused') return { status: 'ignored', reason: 'paused', message: REASONS.paused };
            if (state === 'ended') return { status: 'ignored', reason: endReason === 'time' ? 'time_up' : 'inactive', message: REASONS[endReason === 'time' ? 'time_up' : 'inactive'] };
            if (state !== 'running') return { status: 'ignored', reason: 'inactive', message: REASONS.inactive };
            if (msg.msgId != null && msg.msgId !== '') {
                if (seenMsg[msg.msgId]) return { status: 'ignored', reason: 'dup_message', message: REASONS.dup_message };
                seenMsg[msg.msgId] = 1;
            }
            if (msg.payload && typeof msg.payload === 'object' && seenPayloads) {
                if (seenPayloads.has(msg.payload)) return { status: 'ignored', reason: 'dup_message', message: REASONS.dup_message };
                seenPayloads.add(msg.payload);
            }
            var cand = extractCandidate(msg.text);
            if (!cand) return { status: 'ignored', reason: 'empty', message: REASONS.empty };
            var player = playerFor(msg);
            if (!player) return { status: 'ignored', reason: 'empty', message: REASONS.empty };
            var c = checkLetters(cand, round, R);
            if (!c.ok) return reject(c.reason, { word: c.word, player: player, usesHiveOnly: c.usesHiveOnly });
            if (!dict[c.word]) return reject('not_in_dict', { word: c.word, player: player, usesHiveOnly: true });
            if (foundBy[c.word]) return reject('duplicate', { word: c.word, player: player, usesHiveOnly: true, by: foundBy[c.word].name });
            var pts = pointsFor(c.word, round, R.points);
            var entry = { word: c.word, playerKey: player.key, name: player.name, avatar: player.avatar || null, points: pts.total, base: pts.base, bonus: pts.bonus, golden: pts.golden, at: now };
            foundBy[c.word] = entry; found.push(entry);
            player.score += pts.total; player.words.push(c.word); player.lastAt = now;
            // اكتملت كل الكلمات المطلوبة → تنتهي الجولة فوراً
            var completed = found.length >= eligible.length && end(now, 'complete');
            return { status: 'accepted', reason: null, word: c.word, points: pts.total, base: pts.base, bonus: pts.bonus, golden: pts.golden, player: player, completed: !!completed };
        }
        function leaderboard() {
            return Object.keys(players).map(function (k) { return players[k]; })
                .filter(function (p) { return p.score > 0; })
                .sort(function (a, b) { return b.score - a.score || b.words.length - a.words.length || (a.lastAt || 0) - (b.lastAt || 0); });
        }
        /** الفائزون: أصحاب أعلى نقاط (تعادل = أكثر من فائز). */
        function winners() {
            var lb = leaderboard();
            if (!lb.length) return [];
            return lb.filter(function (p) { return p.score === lb[0].score; });
        }

        return {
            round: round, rules: R, eligible: eligible,
            get state() { return state; },
            get endReason() { return endReason; },
            get found() { return found.slice(); },
            get startedAt() { return startedAt; },
            activeMs: function (now) { return activeMs + (state === 'running' ? Math.min(now, endsAt) - resumedAt : 0); },
            total: eligible.length,
            goldenWords: eligible.filter(function (w) { return isGolden(w, round); }),
            foundBy: function (w) { return foundBy[normalizeWord(w)] || null; },
            remaining: remaining, start: start, pause: pause, resume: resume, end: end, tick: tick,
            submit: submit, leaderboard: leaderboard, winners: winners
        };
    }

    return {
        MIN_APPROVED_WORDS: MIN_APPROVED_WORDS,
        TARGET_WORDS: TARGET_WORDS,
        targetWords: targetWords,
        REASONS: REASONS,
        DEFAULT_POINTS: DEFAULT_POINTS,
        normalizeWord: normalizeWord,
        extractCandidate: extractCandidate,
        hiveLetters: hiveLetters,
        hasRepeat: hasRepeat,
        isGolden: isGolden,
        checkLetters: checkLetters,
        pointsFor: pointsFor,
        validateRound: validateRound,
        buildBank: buildBank,
        pickRound: pickRound,
        playerKey: playerKey,
        createSession: createSession
    };
}));
