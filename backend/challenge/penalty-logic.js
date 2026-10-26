/**
 * منطق "ركلات الترجيح" لتحدي البثوث — على الخادم (الخادم هو الحكم).
 *
 * الفريق = البث: الفريق 0 = جمهور بث منشئ التحدي (كلمة الدخول 1)، الفريق 1
 * = جمهور بث الخصم (كلمة الدخول 2). كل لاعب ينضم من شات بثه هو، واللي انضم
 * لفريق ما يقدر ينضم للفريق الثاني (حتى لو كتب بشات البث الثاني).
 *
 * المباراة 3 جولات ثابتة: أول فريق يكسب جولتين يفوز. كل جولة لها وقت
 * (3 / 4 / 5 دقائق)، وكل فريق يسدد بالدور على مرماه بشكل مستقل: صاحب الدور
 * يكتب رقم الزاوية (1–4) في شات بثه خلال وقت الركلة (10 / 15 / 20 ثانية)، والحارس يرتمي لزاوية
 * عشوائية — زاوية مختلفة = هدف، نفس الزاوية = صدّها. بدون رقم = ضاعت.
 * لما يخلص وقت الجولة: الأكثر أهدافاً ياخذ الجولة، والتعادل = ركلات ترجيح
 * حاسمة (ركلة لكل فريق لين يسجل فريق ويضيّع الثاني).
 *
 * هذا الملف منطق خالص: ما يعرف شي عن تيك توك أو WebSocket. الأوقات
 * والمؤقتات يديرها challenge-match.js عبر hooks.schedule/onChange/onWin.
 */
'use strict';

// إعدادات ثابتة: كلمة الدخول 1 لفريق المنشئ و2 لفريق الخصم، 3 جولات
// (الفائز بجولتين)، و25 لاعب كحد أقصى لكل فريق. وقت الركلة يختاره المنشئ (10 / 15 / 20 ثانية).
var KEYWORDS = ['1', '2'];
var ROUNDS = 3;
var ROUNDS_TO_WIN = 2;
var ROUND_MINUTES = [3, 4, 5];
var LOBBY_MIN_SEC = 15, LOBBY_MAX_SEC = 300, LOBBY_DEF_SEC = 60;
var MAX_PLAYERS = 25;                   // حد ثابت لكل فريق — شرط أساسي، ما يتعدّل من الإعدادات
var SHOT_SECS = [10, 15, 20];
// نفس توقيت الحركة بالتصميم: ركض 800ms ← ركلة، النتيجة بعد 750ms، الدور التالي بعد 1900ms.
var RUN_MS = 800, FLIGHT_MS = 750, NEXT_MS = 1900;
var FIRST_TURN_MS = [800, 3800];        // الفريق الثاني يبدأ بعد الأول بـ3 ثواني
var INTRO_MS = 30000;                   // مقدمة التشكيلة ثلاثية الأبعاد
var COUNTDOWN_MS = 3300;                // 3، 2، 1، يلا!
var ROUND_END_MS = 7000;                // عرض نتيجة الجولة قبل اللي بعدها
var SUDDEN_GAP_MS = 2500;               // بين كل زوج ركلات بالترجيح الحاسم
var MAX_LOG = 60;

function rand(n) { return Math.floor(Math.random() * n); }

function clampInt(v, min, max, def) {
    var n = Math.floor(Number(v));
    return isNaN(n) ? def : Math.min(max, Math.max(min, n));
}

function cleanTeamName(v) { return String(v || '').trim().slice(0, 24); }

function cleanShotSec(v) {
    var n = Number(v);
    return SHOT_SECS.indexOf(n) >= 0 ? n : 10;
}

function cleanMinutes(v) {
    var n = Number(v);
    return ROUND_MINUTES.indexOf(n) >= 0 ? n : 4;
}

/** رقم زاوية من تعليق (يقبل الأرقام العربية ١-٤). */
function cornerOf(text) {
    var t = String(text == null ? '' : text).normalize('NFKC').trim()
        .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    return /^[1-4]$/.test(t) ? Number(t) : 0;
}

/** جزء المنشئ (مع الدعوة): اسم فريقه + المسموح لهم + وقت الجولة + وقت الركلة + وقت انتظار اللوبي. */
function sanitizeHostSettings(raw) {
    raw = raw || {};
    return {
        team1: cleanTeamName(raw.team1),
        followers1: Boolean(raw.followersOnly),
        roundMinutes: cleanMinutes(raw.roundMinutes),
        shotSec: cleanShotSec(raw.shotSec),
        lobbySec: clampInt(raw.lobbySec, LOBBY_MIN_SEC, LOBBY_MAX_SEC, LOBBY_DEF_SEC)
    };
}

/** جزء الخصم (بعد القبول): اسم فريقه + المسموح لهم. */
function sanitizeGuestSettings(raw) {
    raw = raw || {};
    return { team2: cleanTeamName(raw.team2), followers2: Boolean(raw.followersOnly) };
}

/** إعدادات المباراة النهائية. اسم الفريق الفاضي = اسم حساب الستريمر. */
function sanitizeSettings(raw, sideNames) {
    raw = raw || {};
    return {
        team1: cleanTeamName(raw.team1) || (sideNames && sideNames[0]) || 'الفريق 1',
        team2: cleanTeamName(raw.team2) || (sideNames && sideNames[1]) || 'الفريق 2',
        keywords: KEYWORDS.slice(),
        followersOnly: [Boolean(raw.followers1), Boolean(raw.followers2)],
        roundMinutes: cleanMinutes(raw.roundMinutes),
        lobbySec: clampInt(raw.lobbySec, LOBBY_MIN_SEC, LOBBY_MAX_SEC, LOBBY_DEF_SEC),
        rounds: ROUNDS,
        roundsToWin: ROUNDS_TO_WIN,
        shotSec: cleanShotSec(raw.shotSec),
        maxPlayers: MAX_PLAYERS
    };
}

function blankTurn() {
    return { seq: 0, idx: -1, shooter: null, next: null, endsAt: null, shot: 0, dive: 0, res: '', ph: 'idle' };
}

/**
 * @param {Object} settings - ناتج sanitizeSettings
 * @param {{schedule: function(fn, ms), onChange: function(), onWin: function(winnerIdx, durationMs)}} hooks
 */
function createPenalty(settings, hooks) {
    var S = {
        teams: [
            { name: settings.team1, players: [], score: 0 },
            { name: settings.team2, players: [], score: 0 }
        ],
        // lobby | intro | countdown | playing | sudden | roundEnd | over
        phase: 'lobby',
        round: 0,
        roundsWon: [0, 0],
        lobbyEndsAt: null,      // يبدأ العد لما يتصل البثين
        phaseEndsAt: null,
        roundEndsAt: null,
        clockOver: false,
        suddenPair: 0,
        turns: [blankTurn(), blankTurn()],
        lastRound: null,        // {winner, goals:[a,b], sudden}
        winner: null,
        log: []
    };
    var players = {};           // name -> {id, side, avatar, frame}
    var nameById = {};          // id -> name
    var sideById = {};          // id -> الفريق اللي انضم له (يمنع الانضمام للفريق الثاني)
    var turnIdx = [-1, -1];     // تدوير الأدوار (يستمر بين الجولات)
    var roundToken = 0;
    var lobbyExpired = false;
    var matchStartedAt = null;

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
        var base = String(p.name || p.id).trim() || key, name = base, k = 2;
        while (players[name]) name = base + ' ' + (k++);
        players[name] = { id: p.id, side: null, avatar: p.avatarUrl || null, frame: p.frame || null };
        nameById[key] = name;
        return name;
    }

    function durationMs() { return matchStartedAt ? Date.now() - matchStartedAt : 0; }

    /* ---- اللوبي ---- */
    function canStart() { return S.teams.every(function (t) { return t.players.length > 0; }); }

    function startMatch() {
        if (S.phase !== 'lobby') return { ok: false, error: 'busy' };
        if (!canStart()) return { ok: false, error: 'need_players' };
        S.phase = 'intro';
        S.lobbyEndsAt = null;
        S.phaseEndsAt = Date.now() + INTRO_MS;
        matchStartedAt = Date.now();
        log('round', 'بدأت المباراة: ' + S.teams[0].name + ' (' + S.teams[0].players.length + ') ضد ' + S.teams[1].name + ' (' + S.teams[1].players.length + ')');
        var tk = ++roundToken;
        hooks.schedule(function () { if (tk === roundToken && S.phase === 'intro') beginCountdown(); }, INTRO_MS);
        return { ok: true };
    }

    function beginCountdown() {
        S.phase = 'countdown';
        S.round++;
        S.teams.forEach(function (t) { t.score = 0; });
        S.turns = [blankTurn(), blankTurn()];
        S.clockOver = false;
        S.suddenPair = 0;
        S.roundEndsAt = null;
        S.phaseEndsAt = Date.now() + COUNTDOWN_MS;
        var tk = ++roundToken;
        hooks.schedule(function () { if (tk === roundToken) beginRound(tk); }, COUNTDOWN_MS);
        hooks.onChange();
    }

    /* ---- الجولة ---- */
    function beginRound(tk) {
        S.phase = 'playing';
        S.phaseEndsAt = null;
        S.roundEndsAt = Date.now() + settings.roundMinutes * 60000;
        log('round', 'الجولة ' + S.round + ' بدأت');
        [0, 1].forEach(function (k) {
            hooks.schedule(function () { if (tk === roundToken && !S.clockOver) startTurn(k, tk); }, FIRST_TURN_MS[k]);
        });
        hooks.schedule(function () { if (tk === roundToken) clockDone(tk); }, settings.roundMinutes * 60000);
        hooks.onChange();
    }

    function startTurn(k, tk) {
        var P = S.teams[k].players;
        if (!P.length) return;
        turnIdx[k]++;
        var i = turnIdx[k];
        var t = S.turns[k];
        S.turns[k] = {
            seq: t.seq + 1, idx: i,
            shooter: P[i % P.length], next: P[(i + 1) % P.length],
            endsAt: Date.now() + settings.shotSec * 1000,
            shot: 0, dive: 0, res: '', ph: 'ready'
        };
        var seq = S.turns[k].seq;
        hooks.schedule(function () {
            var cur = S.turns[k];
            if (tk !== roundToken || cur.seq !== seq || cur.ph !== 'ready') return;
            resolve(k, tk, 'miss');
        }, settings.shotSec * 1000);
        hooks.onChange();
    }

    function shoot(k, corner, tk) {
        var t = S.turns[k], seq = t.seq;
        t.shot = corner;
        t.ph = 'run';
        t.endsAt = null;
        hooks.schedule(function () {
            var cur = S.turns[k];
            if (tk !== roundToken || cur.seq !== seq) return;
            cur.dive = 1 + rand(4);
            cur.ph = 'kick';
            hooks.onChange();
            hooks.schedule(function () {
                if (tk !== roundToken || S.turns[k].seq !== seq) return;
                resolve(k, tk, cur.shot !== cur.dive ? 'goal' : 'save');
            }, FLIGHT_MS);
        }, RUN_MS);
    }

    function resolve(k, tk, res) {
        var t = S.turns[k], team = S.teams[k];
        t.res = res;
        t.ph = 'done';
        t.endsAt = null;
        if (res === 'goal') team.score++;
        log(res, t.shooter + (res === 'goal' ? ' سجّل هدف لـ ' + team.name : res === 'save' ? ' — صدّها الحارس' : ' — ضاعت الركلة (انتهى الوقت)'));
        if (S.phase === 'sudden') {
            hooks.onChange();
            if (S.turns.every(function (x) { return x.ph === 'done'; })) hooks.schedule(function () { if (tk === roundToken) suddenPairDone(tk); }, NEXT_MS);
            return;
        }
        var seq = t.seq;
        hooks.schedule(function () {
            if (tk !== roundToken || S.turns[k].seq !== seq) return;
            if (S.clockOver) { S.turns[k].ph = 'idle'; S.turns[k].res = ''; maybeEndRound(tk); hooks.onChange(); return; }
            startTurn(k, tk);
        }, NEXT_MS);
        hooks.onChange();
    }

    // انتهى وقت الجولة: الأدوار اللي ما سددت تنلغي، والركلات اللي بالهواء تكمل.
    function clockDone(tk) {
        if (S.phase !== 'playing') return;
        S.clockOver = true;
        S.roundEndsAt = Date.now();
        S.turns.forEach(function (t) {
            if (t.ph === 'ready') { t.ph = 'idle'; t.endsAt = null; t.seq++; }
        });
        maybeEndRound(tk);
        hooks.onChange();
    }

    function maybeEndRound(tk) {
        if (S.phase !== 'playing' || !S.clockOver) return;
        if (S.turns.some(function (t) { return t.ph === 'run' || t.ph === 'kick' || t.ph === 'done'; })) return;
        var g = S.teams.map(function (t) { return t.score; });
        if (g[0] !== g[1]) { endRound(g[0] > g[1] ? 0 : 1, false); return; }
        S.phase = 'sudden';
        log('round', 'تعادل ' + g[0] + '-' + g[1] + ' — ركلات ترجيح حاسمة');
        hooks.schedule(function () { if (tk === roundToken) suddenPair(tk); }, SUDDEN_GAP_MS);
    }

    function suddenPair(tk) {
        S.suddenPair++;
        S.turns.forEach(function (t) { t.res = ''; });
        startTurn(0, tk);
        startTurn(1, tk);
    }

    function suddenPairDone(tk) {
        var r = S.turns.map(function (t) { return t.res === 'goal'; });
        if (r[0] !== r[1]) { endRound(r[0] ? 0 : 1, true); return; }
        S.turns.forEach(function (t) { t.ph = 'idle'; t.res = ''; });
        hooks.onChange();
        hooks.schedule(function () { if (tk === roundToken) suddenPair(tk); }, SUDDEN_GAP_MS);
    }

    function endRound(w, sudden) {
        roundToken++;
        S.roundsWon[w]++;
        S.lastRound = { winner: w, goals: S.teams.map(function (t) { return t.score; }), sudden: sudden, round: S.round };
        S.turns.forEach(function (t) { t.endsAt = null; });
        log('win', 'الجولة ' + S.round + ' لـ ' + S.teams[w].name + (sudden ? ' (بالترجيح الحاسم)' : '') + ' · ' + S.roundsWon[0] + '-' + S.roundsWon[1]);
        if (S.roundsWon[w] >= ROUNDS_TO_WIN || S.round >= ROUNDS) {
            S.phase = 'over';
            S.phaseEndsAt = null;
            S.winner = S.roundsWon[0] > S.roundsWon[1] ? 0 : 1;
            log('win', 'فوز ' + S.teams[S.winner].name + ' بالمباراة ' + S.roundsWon[S.winner] + '-' + S.roundsWon[1 - S.winner]);
            hooks.onWin(S.winner, durationMs());
            hooks.onChange();
            return;
        }
        S.phase = 'roundEnd';
        S.phaseEndsAt = Date.now() + ROUND_END_MS;
        var tk = roundToken;
        hooks.schedule(function () { if (tk === roundToken && S.phase === 'roundEnd') beginCountdown(); }, ROUND_END_MS);
        hooks.onChange();
    }

    var api = {
        state: function () {
            var view = JSON.parse(JSON.stringify(S));
            view.playerInfo = {};
            S.teams.forEach(function (t) {
                t.players.forEach(function (n) { var p = players[n]; view.playerInfo[n] = { id: p.id, avatar: p.avatar, frame: p.frame }; });
            });
            view.settings = {
                keywords: settings.keywords, followersOnly: settings.followersOnly, roundMinutes: settings.roundMinutes,
                lobbySec: settings.lobbySec, rounds: settings.rounds, roundsToWin: settings.roundsToWin,
                shotSec: settings.shotSec, maxPlayers: settings.maxPlayers
            };
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
                if (canStart()) startMatch();
                else log('round', 'انتهى وقت اللوبي — المباراة تبدأ أول ما يصير بكل فريق لاعب');
                hooks.onChange();
            }, settings.lobbySec * 1000);
            hooks.onChange();
        },

        /** تعليق من شات البث رقم side (0 أو 1). */
        onChat: function (side, p) {
            if (!p || typeof p.text !== 'string' || !p.id) return false;
            var id = String(p.id);
            var corner = cornerOf(p.text);

            // الانضمام بلوبي الدخول بس: كلمة دخول هذا البث من شاته هو.
            if (S.phase === 'lobby') {
                if (String(corner) !== settings.keywords[side]) return false;
                if (sideById[id] !== undefined && sideById[id] !== side) return false; // انضم للفريق الثاني من قبل
                var user = nameFor(p), team = S.teams[side];
                if (team.players.indexOf(user) >= 0) return false;
                if (settings.followersOnly[side] && !p.isFollower) return false;
                if (team.players.length >= settings.maxPlayers) return false;
                sideById[id] = side;
                players[user].side = side;
                team.players.push(user);
                log('join', user + ' انضم لـ ' + team.name);
                if (lobbyExpired && canStart()) startMatch();
                return true;
            }

            // الركلة: بس صاحب الدور، ومن شات بثه، خلال وقت الركلة.
            if ((S.phase !== 'playing' && S.phase !== 'sudden') || !corner) return false;
            if (sideById[id] !== side) return false;
            var t = S.turns[side];
            if (t.ph !== 'ready' || t.shooter !== nameById[id]) return false;
            shoot(side, corner, roundToken);
            return true;
        },

        /** إنهاء لوبي الدخول وبدء المباراة قبل انتهاء الوقت (المنشئ). */
        startMatch: startMatch,

        /** تخطي مقدمة التشكيلة (المنشئ). */
        skipIntro: function () {
            if (S.phase !== 'intro') return { ok: false, error: 'busy' };
            beginCountdown();
            return { ok: true };
        },

        /** إخراج لاعب من فريق بثه (بلوبي الدخول بس). */
        kick: function (side, name) {
            if (S.phase !== 'lobby') return { ok: false, error: 'busy' };
            var team = S.teams[side], i = team.players.indexOf(name);
            if (i < 0) return { ok: false, error: 'not_found' };
            team.players.splice(i, 1);
            log('kick', name + ' طلع من ' + team.name);
            return { ok: true };
        },

        /** كل اللاعبين للنقاط: [{tiktokUsername, team}] */
        participants: function () {
            var out = [];
            S.teams.forEach(function (t, i) {
                t.players.forEach(function (n) {
                    var pid = players[n] && players[n].id;
                    var u = pid ? String(pid).replace(/^tiktok:/, '') : '';
                    if (u) out.push({ tiktokUsername: u, team: i });
                });
            });
            return out;
        }
    };
    return api;
}

module.exports = {
    sanitizeHostSettings: sanitizeHostSettings,
    sanitizeGuestSettings: sanitizeGuestSettings,
    sanitizeSettings: sanitizeSettings,
    createPenalty: createPenalty,
    _cornerOf: cornerOf
};
