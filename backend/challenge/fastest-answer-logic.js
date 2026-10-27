/**
 * منطق "أسرع إجابة" لتحدي البثوث — على الخادم (الخادم هو الحكم).
 *
 * نفس قواعد games/fastest-answer/game.html، بفرق واحد: الفريق = البث.
 * الفريق 0 = جمهور بث منشئ التحدي، الفريق 1 = جمهور بث الخصم. اللاعب
 * ينضم بكتابة رقم فريقه (1 لبث المنشئ، 2 لبث الخصم) في شات بثه هو، واللي
 * انضم لفريق ما يقدر ينضم للفريق الثاني (حتى لو كتب بشات البث الثاني).
 * لوبي الدخول له وقت انتظار يبدأ لما يتصل البثين (المنشئ يقدر يبدأ قبل).
 * كل جولة يُختار لاعب واحد من كل فريق (تدوير: كل لاعب يجيه الدور مرة قبل
 * ما يتكرر)، وفئة عشوائية من الفئات المختارة. بس اللاعبين المختارين
 * يقدرون يجاوبون، وكل واحد من شات بثه فقط. أول إجابة صحيحة = نقطتين.
 * أول فريق يوصل نقاط الفوز يكسب.
 *
 * النمط الفردي (settings.mode === 'solo'): ما فيه اختيار لاعبين — أي لاعب
 * منضم يقدر يجاوب من شات بثه، وأسرع إجابة صحيحة = نقطة وحدة له ولفريق بثه،
 * وتنتهي الجولة فوراً. أول بث يوصل مجموع نقاطه لنقاط الفوز يكسب.
 *
 * هذا الملف منطق خالص: ما يعرف شي عن تيك توك أو WebSocket. الأوقات
 * والمؤقتات يديرها challenge-match.js عبر hooks.schedule/onChange/onWin.
 */
'use strict';

var path = require('path');

var QUESTIONS = (function () {
    try { return require(path.join(__dirname, '..', '..', 'games', 'fastest-answer', 'fa-questions.js')); } catch (e) { return null; }
}());

var ALL_CATS = [
    { id: 'math', name: 'مسألة رياضية' }, { id: 'image', name: 'صورة واكتب الاسم' },
    { id: 'reverse', name: 'اعكس الكلمة' }, { id: 'number', name: 'اكتب الرقم' },
    { id: 'capital', name: 'عاصمة الدولة' }, { id: 'proverb', name: 'أكمل المثل' },
    { id: 'scramble', name: 'ترتيب الحروف' }, { id: 'flag', name: 'علم الدولة' },
    { id: 'complete', name: 'أكمل الكلمة' }, { id: 'odd', name: 'اكتشف المختلف' }
];
// إعدادات ثابتة لتحدي البثوث: كلمة الدخول 1 لفريق المنشئ و2 لفريق الخصم،
// 20 ثانية للإجابة، و25 لاعب كحد أقصى لكل فريق (شرط أساسي ما يتعدّل). كل
// ستريمر يختار 3 فئات بالضبط (المنشئ بالدعوة والخصم قبل «جاهز»)، والخصم ما
// يقدر يختار فئات المنشئ — والأسئلة تطلع من فئات الطرفين (6 فئات).
var CATS_PER_SIDE = 3;
var KEYWORDS = ['1', '2'];
var DURATION_SEC = 20;
var MAX_PLAYERS = 25;
var LOBBY_MIN_SEC = 15, LOBBY_MAX_SEC = 300, LOBBY_DEF_SEC = 60;
// نفس توقيت حركة game.html الأصلية: بكرات اللاعبين ثم بكرة الفئة (6.25 ث)، ثم 3، 2، 1 (3.9 ث).
var SPIN_MS = 6250;
// النمط الفردي: بكرة الفئة بس (2.65 ث) — نفس توقيت game.html.
var SPIN_MS_SOLO = 2650;
var COUNTDOWN_MS = 3900;
var MAX_LOG = 60;

// مثل FA.norm في games/fastest-answer/fa-platform.js، مع قبول الأرقام العربية (١ = 1).
function norm(s) {
    return String(s == null ? '' : s).normalize('NFKC').trim()
        // التشكيل (بدون الأرقام العربية ٠-٩ اللي بين U+065F وU+0670 — تتحوّل تحت لأرقام عادية)
        .replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
        .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
        .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
        .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
        .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
        .split(/\s+/).map(function (w) { return w.replace(/^ال/, ''); }).join('')
        .replace(/(\p{L})\1+/gu, '$1');
}

function rand(n) { return Math.floor(Math.random() * n); }
function pick(a) { return a[rand(a.length)]; }
// نفس pick بس ما يعيد آخر سؤال طلع من نفس الفئة مباشرةً.
var lastQ = {};
function pickNew(k, a) { var x; do { x = pick(a); } while (a.length > 1 && x === lastQ[k]); lastQ[k] = x; return x; }

function clampInt(v, min, max, def) {
    var n = Math.floor(Number(v));
    return isNaN(n) ? def : Math.min(max, Math.max(min, n));
}

function cleanCats(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) {
        if (out.indexOf(id) < 0 && ALL_CATS.some(function (c) { return c.id === id; })) out.push(id);
    });
    return out;
}

function cleanTeamName(v) { return String(v || '').trim().slice(0, 24); }

function cleanMode(v) { return v === 'solo' ? 'solo' : 'teams'; }

/** جزء المنشئ (مع الدعوة): نمط اللعب + اسم فريقه + المسموح لهم + فئاته + نقاط الفوز + وقت انتظار اللوبي. */
function sanitizeHostSettings(raw) {
    raw = raw || {};
    var cats = cleanCats(raw.cats);
    if (cats.length !== CATS_PER_SIDE) return { error: 'pick_cats' };
    return {
        mode: cleanMode(raw.mode), team1: cleanTeamName(raw.team1), followers1: Boolean(raw.followersOnly), hostCats: cats,
        target: clampInt(raw.target, 1, 99, 15), lobbySec: clampInt(raw.lobbySec, LOBBY_MIN_SEC, LOBBY_MAX_SEC, LOBBY_DEF_SEC)
    };
}

/** جزء الخصم (قبل «جاهز»): اسم فريقه + المسموح لهم + فئاته (غير فئات المنشئ). */
function sanitizeGuestSettings(raw, hostSettings) {
    raw = raw || {};
    var cats = cleanCats(raw.cats), taken = (hostSettings && hostSettings.hostCats) || [];
    if (cats.length !== CATS_PER_SIDE) return { error: 'pick_cats' };
    if (cats.some(function (id) { return taken.indexOf(id) >= 0; })) return { error: 'cats_taken' };
    return { team2: cleanTeamName(raw.team2), followers2: Boolean(raw.followersOnly), guestCats: cats };
}

/** إعدادات المباراة النهائية (المنشئ + الخصم + الثوابت). اسم الفريق الفاضي = اسم حساب الستريمر. */
function sanitizeSettings(raw, sideNames) {
    raw = raw || {};
    var hostCats = cleanCats(raw.hostCats), guestCats = cleanCats(raw.guestCats);
    var cats = cleanCats(hostCats.concat(guestCats));
    return {
        mode: cleanMode(raw.mode),
        team1: cleanTeamName(raw.team1) || (sideNames && sideNames[0]) || 'الفريق 1',
        team2: cleanTeamName(raw.team2) || (sideNames && sideNames[1]) || 'الفريق 2',
        keywords: KEYWORDS.slice(),
        maxPlayers: MAX_PLAYERS,
        dur: DURATION_SEC,
        target: clampInt(raw.target, 1, 99, 15),
        followersOnly: [Boolean(raw.followers1), Boolean(raw.followers2)],
        lobbySec: clampInt(raw.lobbySec, LOBBY_MIN_SEC, LOBBY_MAX_SEC, LOBBY_DEF_SEC),
        hostCats: hostCats,
        guestCats: guestCats,
        cats: cats.length ? cats : ALL_CATS.map(function (c) { return c.id; })
    };
}

function genQuestion(catId) {
    var D = QUESTIONS || {};
    var cat = ALL_CATS.filter(function (c) { return c.id === catId; })[0] || ALL_CATS[0];
    var base = { catName: cat.name, dir: 'rtl', ls: '0' };
    function q(extra) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
    if (cat.id === 'math' || !QUESTIONS) {
        var op = pick(['+', '−', '×']), a, b, res;
        if (op === '×') { a = 2 + rand(14); b = 2 + rand(11); res = a * b; }
        else { a = 12 + rand(88); b = 2 + rand(60); if (op === '−' && b > a) { var t = a; a = b; b = t; } res = op === '+' ? a + b : a - b; }
        return q({ catName: ALL_CATS[0].name, sub: 'احسب الناتج', prompt: a + ' ' + op + ' ' + b, dir: 'ltr', answer: String(res), accept: [String(res)] });
    }
    var x;
    if (cat.id === 'image') { x = pick(D.image); return q({ sub: 'ما اسم الصورة؟', emoji: x[0], answer: x[1], accept: [x[1]].concat(x[2] || []) }); }
    if (cat.id === 'reverse') { x = pick(D.reverse); var rv = Array.from(x).reverse().join(''); return q({ sub: 'اكتب الكلمة معكوسة', prompt: x, answer: rv, accept: [rv] }); }
    if (cat.id === 'number') { x = pick(D.number); return q({ sub: 'اكتب الرقم بالأرقام', prompt: x[0], answer: String(x[1]), accept: [String(x[1])] }); }
    if (cat.id === 'capital') { x = pick(D.capital); return q({ sub: 'ما عاصمة هذه الدولة؟', prompt: x[0], answer: x[1], accept: [x[1]].concat(x[2] || []) }); }
    if (cat.id === 'proverb') { x = pick(D.proverb); return q({ sub: 'أكمل المثل', prompt: x[0], answer: x[1], accept: [x[1]].concat(x[2] || []) }); }
    if (cat.id === 'scramble') {
        x = pick(D.scramble); var s, tries = 0;
        do { s = Array.from(x).sort(function () { return Math.random() - 0.5; }).join(''); } while (s === x && ++tries < 20);
        return q({ sub: 'رتّب الحروف لتكوين كلمة', prompt: Array.from(s).join(' '), ls: '8px', answer: x, accept: [x] });
    }
    if (cat.id === 'complete') { x = pickNew(cat.id, D.complete); return q({ sub: 'أكمل الكلمة', prompt: x[0], answer: x[1], accept: [x[1]] }); }
    if (cat.id === 'odd') {
        x = pickNew(cat.id, D.odd);
        return q({ sub: 'اكتب اسم الشيء المختلف', prompt: x[0].slice().sort(function () { return Math.random() - 0.5; }).join(' '), answer: x[1] + ' ' + x[2], accept: [x[2]].concat(x[3] || []) });
    }
    x = pick(D.flag);
    return q({ sub: 'لمن هذا العلم؟', img: 'https://flagcdn.com/w640/' + x[0] + '.png', answer: x[1], accept: [x[1]].concat(x[2] || []) });
}

function checkAnswer(text, question) {
    var v = [norm(text), norm(String(text).replace(/(\S)(ال)/g, '$1 $2'))].filter(Boolean);
    return v.length > 0 && question.accept.some(function (a) { return v.indexOf(norm(a)) >= 0; });
}

/**
 * @param {Object} settings - ناتج sanitizeSettings
 * @param {{schedule: function(fn, ms), onChange: function(), onWin: function(winnerIdx, teams), onRoundStart: function()}} hooks
 */
function createFastestAnswer(settings, hooks) {
    var S = {
        teams: [
            { name: settings.team1, players: [], score: 0 },
            { name: settings.team2, players: [], score: 0 }
        ],
        phase: 'lobby',   // lobby (لوبي الدخول) | ready | spinning | countdown | question | results
        round: 0,
        chosen: [null, null],
        catName: null,
        question: null,   // للعرض (بدون الإجابات المقبولة)
        answer: null,     // يظهر بعد نهاية الجولة
        phaseEndsAt: null,
        answers: [],      // [{user, team, pts, rank}]
        received: 0,
        winner: null,     // رقم الفريق الفائز
        lobbyEndsAt: null,  // يبدأ العد لما يتصل البثين
        playerStats: {},  // اسم اللاعب -> {pts, correct} بكل المباراة (لشاشة الفوز)
        log: []
    };
    var players = {};           // name -> {id, side, avatar, frame}
    var nameById = {};          // id -> name
    var sideById = {};          // id -> الفريق اللي انضم له (يمنع الانضمام للفريق الثاني)
    var lobbyExpired = false;
    var played = [{}, {}];      // تدوير الأدوار
    var lastPick = [null, null];
    var currentQ = null;        // السؤال الكامل (مع accept)
    var answered = {};
    var roundToken = 0;
    var matchStartedAt = null;
    var catIds = settings.cats;
    var solo = settings.mode === 'solo';

    function log(kind, text) {
        S.log.unshift({ kind: kind, text: text, at: Date.now() });
        if (S.log.length > MAX_LOG) S.log.length = MAX_LOG;
    }

    function nameFor(p) {
        var key = String(p.id);
        if (nameById[key]) {
            var known = players[nameById[key]];
            if (p.avatarUrl && !known.avatar) known.avatar = p.avatarUrl;
            if (p.frame) known.frame = p.frame;
            return nameById[key];
        }
        var base = String(p.name || p.id).trim() || String(p.id), name = base, k = 2;
        while (players[name]) name = base + ' ' + (k++);
        players[name] = { id: p.id, side: null, avatar: p.avatarUrl || null, frame: p.frame || null };
        nameById[key] = name;
        return name;
    }

    function nextPlayer(i) {
        var P = S.teams[i].players, done = played[i];
        var left = P.filter(function (n) { return !done[n]; });
        if (!left.length) {
            played[i] = done = {};
            left = P.length > 1 ? P.filter(function (n) { return n !== lastPick[i]; }) : P.slice();
        }
        var c = pick(left);
        done[c] = true;
        lastPick[i] = c;
        return c;
    }

    function publicQuestion(q) {
        return { catName: q.catName, sub: q.sub, prompt: q.prompt || null, emoji: q.emoji || null, img: q.img || null, dir: q.dir, ls: q.ls };
    }

    function endRound(token) {
        if (token !== roundToken || S.phase !== 'question') return;
        S.phase = 'results';
        S.phaseEndsAt = null;
        S.answer = currentQ ? currentQ.answer : null;
        var lead = S.teams.map(function (t, i) { return { score: t.score, i: i }; })
            .filter(function (t) { return t.score >= settings.target; })
            .sort(function (a, b) { return b.score - a.score; })[0];
        if (lead) {
            S.winner = lead.i;
            log('win', 'فوز ' + S.teams[lead.i].name + ' بـ ' + S.teams[lead.i].score + ' نقطة');
            hooks.onWin(lead.i, durationMs());
        }
        hooks.onChange();
    }

    function durationMs() { return matchStartedAt ? Date.now() - matchStartedAt : 0; }

    var api = {
        state: function () {
            var view = JSON.parse(JSON.stringify(S));
            view.playerInfo = {};
            S.teams.forEach(function (t) {
                t.players.forEach(function (n) { var p = players[n]; view.playerInfo[n] = { id: p.id, avatar: p.avatar, frame: p.frame }; });
            });
            view.settings = { mode: settings.mode, keywords: settings.keywords, target: settings.target, dur: settings.dur, maxPlayers: settings.maxPlayers, followersOnly: settings.followersOnly, lobbySec: settings.lobbySec };
            return view;
        },

        /** البثين اتصلوا: يبدأ عدّاد انتظار اللوبي (مرة وحدة). */
        onStreamsReady: function () {
            if (S.phase !== 'lobby' || S.lobbyEndsAt || lobbyExpired) return;
            S.lobbyEndsAt = Date.now() + settings.lobbySec * 1000;
            hooks.schedule(function () {
                if (S.phase !== 'lobby') return;
                lobbyExpired = true;
                S.lobbyEndsAt = null;
                if (!api.startMatch().ok) log('round', 'انتهى وقت اللوبي — المباراة تبدأ أول ما يصير بكل فريق لاعب');
                hooks.onChange();
            }, settings.lobbySec * 1000);
            hooks.onChange();
        },

        /** تعليق من شات البث رقم side (0 أو 1). */
        onChat: function (side, p) {
            if (!p || typeof p.text !== 'string' || !p.id) return false;
            var text = p.text;
            var id = String(p.id);
            var user = nameFor(p);
            var team = S.teams[side];
            var inTeam = team.players.indexOf(user) >= 0;

            // الانضمام بلوبي الدخول بس: كلمة دخول هذا البث (1 للمنشئ، 2 للخصم) من شاته هو.
            if (!inTeam && S.phase === 'lobby' && norm(text) === norm(settings.keywords[side])) {
                if (sideById[id] !== undefined && sideById[id] !== side) return false; // انضم للفريق الثاني من قبل
                if (settings.followersOnly[side] && !p.isFollower) return false;
                if (team.players.length >= settings.maxPlayers) return false;
                sideById[id] = side;
                players[user].side = side;
                team.players.push(user);
                log('join', user + ' انضم لـ ' + team.name);
                if (lobbyExpired) api.startMatch();
                return true;
            }

            // الإجابة: بس اللاعب صاحب الدور (أو أي لاعب منضم بالنمط الفردي)، ومن شات بثه.
            if (S.phase !== 'question' || !currentQ || sideById[id] !== side || !inTeam) return false;
            if (solo ? S.answers.length > 0 : (S.chosen[side] !== user || answered[user])) return false;
            S.received++;
            if (checkAnswer(text, currentQ)) {
                var rank = S.answers.length, pts = solo ? 1 : (rank === 0 ? 2 : 0);
                answered[user] = true;
                S.answers.push({ user: user, team: side, pts: pts, rank: rank + 1 });
                team.score += pts;
                var ps = S.playerStats[user] || (S.playerStats[user] = { pts: 0, correct: 0 });
                ps.pts += pts;
                ps.correct++;
                log('correct', user + ' أجاب ' + (rank === 0 ? 'أولاً' : 'ثانياً') + ' · ' + team.name + (pts ? ' +' + pts : ''));
                if (solo || Object.keys(answered).length >= 2) {
                    var tk = roundToken;
                    hooks.schedule(function () { endRound(tk); }, 600);
                }
            } else {
                log('wrong', user + ' أجاب خطأ');
            }
            return true;
        },

        /** إنهاء لوبي الدخول وبدء المباراة (المنشئ). */
        startMatch: function () {
            if (S.phase !== 'lobby') return { ok: false, error: 'busy' };
            if (S.teams.some(function (t) { return !t.players.length; })) return { ok: false, error: 'need_players' };
            S.phase = 'ready';
            S.lobbyEndsAt = null;
            log('round', 'بدأت المباراة: ' + S.teams[0].name + ' (' + S.teams[0].players.length + ') ضد ' + S.teams[1].name + ' (' + S.teams[1].players.length + ')');
            return { ok: true };
        },

        /**
         * إخراج لاعب من فريق بثه: باللوبي يطلع (ويقدر يرجع لنفس فريقه)، وبعد البدء
         * ينقصى — ما يجاوب حتى لو كان مختار بالجولة الحالية. فريق فضى = يخسر.
         */
        kick: function (side, name) {
            if (S.winner !== null) return { ok: false, error: 'match_over' };
            var team = S.teams[side], i = team ? team.players.indexOf(name) : -1;
            if (i < 0) return { ok: false, error: 'not_found' };
            team.players.splice(i, 1);
            if (S.phase === 'lobby') { log('kick', name + ' طلع من ' + team.name); return { ok: true }; }
            delete played[side][name];
            if (lastPick[side] === name) lastPick[side] = null;
            log('kick', name + ' انقصى من ' + team.name);
            if (!team.players.length) {
                roundToken++;
                S.phase = 'results';
                S.phaseEndsAt = null;
                if (currentQ) S.answer = currentQ.answer;
                S.winner = 1 - side;
                log('win', 'فوز ' + S.teams[1 - side].name + ' — ما بقى لاعبين بـ ' + team.name);
                hooks.onWin(1 - side, durationMs());
            }
            hooks.onChange();
            return { ok: true };
        },

        /** بدء جولة (المنشئ). */
        spin: function () {
            if (S.winner !== null) return { ok: false, error: 'match_over' };
            if (S.phase === 'lobby') return { ok: false, error: 'in_lobby' };
            if (S.phase !== 'ready' && S.phase !== 'results') return { ok: false, error: 'busy' };
            if (S.teams.some(function (t) { return !t.players.length; })) return { ok: false, error: 'need_players' };
            if (!matchStartedAt) matchStartedAt = Date.now();
            hooks.onRoundStart();
            var token = ++roundToken;
            S.round++;
            S.chosen = solo ? [null, null] : [nextPlayer(0), nextPlayer(1)];
            currentQ = genQuestion(pick(catIds));
            S.catName = currentQ.catName;
            S.question = null;
            S.answer = null;
            S.answers = [];
            S.received = 0;
            answered = {};
            S.phase = 'spinning';
            var spinMs = solo ? SPIN_MS_SOLO : SPIN_MS;
            S.phaseEndsAt = Date.now() + spinMs;
            log('round', 'الجولة ' + S.round + ': ' + (solo ? '' : S.chosen.join(' ضد ') + ' · ') + S.catName);
            hooks.schedule(function () {
                if (token !== roundToken) return;
                S.phase = 'countdown';
                S.phaseEndsAt = Date.now() + COUNTDOWN_MS;
                hooks.onChange();
                hooks.schedule(function () {
                    if (token !== roundToken) return;
                    S.phase = 'question';
                    S.question = publicQuestion(currentQ);
                    S.phaseEndsAt = Date.now() + settings.dur * 1000;
                    hooks.onChange();
                    hooks.schedule(function () { endRound(token); }, settings.dur * 1000);
                }, COUNTDOWN_MS);
            }, spinMs);
            return { ok: true };
        },

        /** مباراة جديدة بنفس الفرق واللاعبين. */
        newGame: function () {
            roundToken++;
            matchStartedAt = null;
            played = [{}, {}];
            S.teams.forEach(function (t) { t.score = 0; });
            S.playerStats = {};
            S.phase = 'ready'; S.round = 0; S.chosen = [null, null]; S.catName = null;
            S.question = null; S.answer = null; S.phaseEndsAt = null; S.answers = []; S.received = 0; S.winner = null;
            currentQ = null; answered = {};
            log('round', 'مباراة جديدة');
            return { ok: true };
        },

        /** إنهاء يدوي: الأعلى نقاطاً يفوز (والتعادل بدون فائز). */
        finish: function () {
            roundToken++;
            S.phaseEndsAt = null;
            var t = S.teams;
            if (t[0].score === t[1].score) { S.phase = 'results'; S.winner = null; log('round', 'تعادل! لا يوجد فائز'); return { ok: true, draw: true }; }
            var wi = t[0].score > t[1].score ? 0 : 1;
            S.phase = 'results'; S.winner = wi;
            log('win', 'إنهاء يدوي · فوز ' + t[wi].name);
            hooks.onWin(wi, durationMs());
            return { ok: true };
        },

        /** كل اللاعبين للنقاط: [{tiktokUsername, team}] */
        participants: function () {
            var out = [];
            S.teams.forEach(function (t, i) {
                t.players.forEach(function (n) {
                    var id = players[n] && players[n].id;
                    var u = id ? String(id).replace(/^tiktok:/, '') : '';
                    if (u) out.push({ tiktokUsername: u, team: i });
                });
            });
            return out;
        }
    };
    return api;
}

module.exports = {
    ALL_CATS: ALL_CATS,
    sanitizeHostSettings: sanitizeHostSettings,
    sanitizeGuestSettings: sanitizeGuestSettings,
    sanitizeSettings: sanitizeSettings,
    createFastestAnswer: createFastestAnswer,
    _norm: norm,
    _checkAnswer: checkAnswer,
    _genQuestion: genQuestion
};
