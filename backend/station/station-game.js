/**
 * «محطة سهيل» — منطق المباراة على الخادم (الخادم هو الحكم).
 *
 * منقول سطر بسطر من مضيف النموذج (Station Play.dc.html): newGame / act /
 * meeting / tally / checkWin / win / hostTick — بعد حذف البوتات والتجربة
 * (bots / botVotes / DEMO / hostRole / الهاشات). الأدوار عشوائية دائماً.
 *
 * الأصوات اللي كان المضيف يشغّلها داخل act (kill / fixed) تطلع هنا كأحداث
 * onSfx(k, ids) يرسلها الخادم للعملاء المعنيين.
 * view(G, id) تفلتر الحالة لكل لاعب: المواطن ما يستلم هوية الدخلاء ولا
 * القاتل ولا رمز الأكسجين ولا مواقع اللي داخل الفتحات ولا أصوات الآخرين.
 */
'use strict';

var M = require('./station-map');
var Settings = require('./station-settings');

var ROOMS = M.ROOMS, TASKS = M.TASKS, DEV = M.DEV, BTN = M.BTN, VENTS = M.VENTS, dist = M.dist, rand = M.rand, shuffle = M.shuffle;

function cfgOf(settings) {
    var c = Object.assign({}, Settings.DEFAULTS, Settings.validate(settings || {}));
    return Object.assign({}, c, { kill: c.killCd, vote: c.voteSec, talk: c.talkSec });
}

function seats(n) {
    return Array.from({ length: n }, function (_, i) {
        var inner = i < 8, k = inner ? i : i - 8, m = inner ? Math.min(n, 8) : n - 8, a = (k / m) * Math.PI * 2 - Math.PI / 2 + (inner ? 0 : .3);
        var rx = inner ? 120 : 200, ry = inner ? 90 : 140; return { x: BTN.x + Math.cos(a) * rx, y: BTN.y + Math.sin(a) * ry };
    });
}

/**
 * مباراة واحدة. roster: [{id,name,c,hat,acc,top,pants,back}] · settings: إعدادات الجولة.
 * hooks: { onChange(), onSfx(k, ids|null), onOver(G) }
 */
function createGame(roster, settings, hooks, old) {
    var g = { G: null, hooks: hooks || {} };
    var base = TASKS.map(function (t) { return { x: t.x, y: t.y, r: t.r }; });

    function P(id) { return g.G && g.G.players.find(function (p) { return p.id === String(id); }); }
    function cfg() { return g.G.cfg; }
    function changed() { if (g.hooks.onChange) g.hooks.onChange(); }
    function sfx(k, ids) { if (g.hooks.onSfx) g.hooks.onSfx(k, ids || null); }
    function taskPos(id) {
        var i = TASKS.findIndex(function (t) { return t.id === id; }); if (i < 0) return null;
        var sp = g.G.spots && g.G.spots[id]; return sp || base[i];
    }

    function taskTotals(G) {
        var C = G.cfg, crew = G.players.filter(function (p) { return !p.imp; }), tot = 0, dn = 0;
        crew.forEach(function (p) { if (p.alive || C.ghostTasks) { tot += p.tasks.length; dn += p.done.length; } else { tot += p.done.length; dn += p.done.length; } });
        return { tot: tot, dn: dn };
    }

    function newGame() {
        var C = cfgOf(settings), n = roster.length, cap = Settings.impCap(n), k = Math.max(1, Math.min(C.impostors, cap)), now = Date.now();
        var imps = shuffle(roster.map(function (p) { return p.id; })).slice(0, k);
        var st = C.spawn === 'غرف عشوائية' ? roster.map(function () { var r = ROOMS[Math.floor(Math.random() * ROOMS.length)]; return { x: r.x + r.w / 2 + rand(-r.w * .25, r.w * .25), y: r.y + r.h / 2 + rand(-r.h * .15, r.h * .25) }; }) : seats(n);
        var spots = null; if (C.taskSpots === 'عشوائية كل جولة') { var sh = shuffle(base); spots = {}; TASKS.forEach(function (t, i) { spots[t.id] = sh[i]; }); }
        var shortIds = TASKS.filter(function (t) { return M.LONG_K.indexOf(t.k) < 0; }).map(function (t) { return t.id; }), longIds = TASKS.filter(function (t) { return M.LONG_K.indexOf(t.k) >= 0; }).map(function (t) { return t.id; });
        var pickT = function () { return shuffle(shortIds).slice(0, C.shortTasks).concat(shuffle(longIds).slice(0, C.longTasks)); }, common = C.commonTasks ? pickT() : null;
        g.G = {
            cfg: C, spots: spots, emCd: now + 5500 + C.emergencyCd * 1000, endAt: C.roundMin ? now + 5500 + C.roundMin * 60000 : 0, phase: 'reveal', until: now + 4000, seq: (old ? old.seq : 0) + 1, bodies: [], locks: {}, reactor: 0, sabCd: now + 5500 + C.sabCd * 1000, meeting: null, eject: null, winner: null, reason: '', startedAt: now,
            players: roster.map(function (p, i) {
                var op = old && old.players.find(function (x) { return x.id === p.id; });
                return Object.assign({}, p, { x: st[i].x, y: st[i].y, f: 1, alive: true, imp: imps.indexOf(p.id) >= 0, tasks: common ? common.slice() : pickT(), done: [], btn: C.emergencies, kcd: now + 5500 + C.kill * 1000, tp: (op ? op.tp : 0) + 1, lastPos: now });
            })
        };
        changed();
    }

    function act(id, a, arg) {
        var G = g.G, p = P(id), now = Date.now(), C = G && G.cfg; if (!G || !p) return;
        if (a === 'kill') {
            if (G.phase !== 'play' || !p.imp || !p.alive || p.kcd > now) return; var t = P(arg); if (!t || !t.alive || t.imp || dist(p, t) > 140) return;
            t.alive = false; G.bodies.push({ id: t.id, x: t.x, y: t.y, c: t.c, by: p.id }); sfx('kill', [p.id, 'host']); p.x = t.x; p.y = t.y; p.tp++; p.kcd = now + C.kill * 1000; checkWin();
        }
        else if (a === 'report') { if (G.phase !== 'play' || !p.alive) return; var b = G.bodies.find(function (b) { return dist(p, b) < 170; }); if (b) meeting(p, b); }
        else if (a === 'emerg') { if (G.phase !== 'play' || !p.alive || p.btn < 1 || G.reactor || G.o2 || now < (G.emCd || 0) || dist(p, BTN) > 150) return; p.btn--; meeting(p, null); }
        else if (a === 'task') {
            if (G.phase !== 'play' && G.phase !== 'reveal') return; if (!p.alive && !C.ghostTasks) return;
            var tp = taskPos(arg); if (!tp || dist(p, tp) > 170) return;
            if (p.tasks.indexOf(arg) >= 0 && p.done.indexOf(arg) < 0) { p.done.push(arg); checkWin(); }
        }
        else if (a === 'sab') {
            if (G.phase !== 'play' || !p.imp || !p.alive || G.sabCd > now) return; var crit = G.reactor || G.o2 || G.lights || G.comms;
            var dr = String(arg).indexOf('door:') === 0 ? String(arg).slice(5) : null;
            if (dr) { if (!ROOMS.some(function (r) { return r.id === dr; }) || !C.doorSab || G.locks[dr] > now) return; G.locks[dr] = now + C.doorSec * 1000; G.sabCd = now + C.sabCd * 1000; }
            else if (!crit) {
                if (arg === 'reactor' && C.reactorSab) { G.reactor = now + C.reactorSec * 1000; G.rT0 = now; G.rhold = {}; }
                else if (arg === 'o2' && C.o2Sab) { G.o2 = now + C.o2Sec * 1000; G.oT0 = now; G.fixed = {}; G.o2code = String(10000 + Math.floor(Math.random() * 90000)); }
                else if (arg === 'lights' && C.lightsSab) G.lights = now; else if (arg === 'comms' && C.commsSab) { G.comms = now; G.commsF = Math.round(rand(15, 85)); } else return; G.sabCd = now + C.sabCd * 1000;
            }
        }
        else if (a === 'fix') {
            var d = DEV.find(function (x) { return x.id === arg; }); if (G.phase !== 'play' || !d || !p.alive || p.imp || dist(p, d) > 170) return;
            if (d.k === 'lights' && G.lights) { G.lights = 0; sfx('fixed'); } else if (d.k === 'comms' && G.comms) { G.comms = 0; sfx('fixed'); }
            else if (d.k === 'o2' && G.o2) { G.fixed = G.fixed || {}; G.fixed[d.id] = 1; if (G.fixed.o2a && G.fixed.o2b) { G.o2 = 0; G.fixed = {}; sfx('fixed'); } }
        }
        else if (a === 'rhold') { var d2 = DEV.find(function (x) { return x.id === arg; }); if (!G.reactor || !d2 || d2.k !== 'reactor' || !p.alive || p.imp || dist(p, d2) > 170) return; G.rhold = G.rhold || {}; G.rhold[d2.id] = now; }
        else if (a === 'chat') { var m = G.meeting, txt = String(arg || '').trim().slice(0, 120); if (G.phase !== 'meeting' || !m || !p.alive || !txt) return; m.chat.push({ id: p.id, t: txt, k: now }); if (m.chat.length > 60) m.chat.shift(); }
        else if (a === 'mic') { var m2 = G.meeting; if (!m2 || !p.alive) return; if (arg) m2.mic[id] = 1; else delete m2.mic[id]; }
        else if (a === 'vote') {
            var m3 = G.meeting; if (G.phase !== 'meeting' || !m3 || m3.stage !== 'vote' || !p.alive || m3.votes[id]) return; if (arg === 'skip' && !C.allowSkip) return;
            if (arg !== 'skip' && !(P(arg) || {}).alive) return; m3.votes[id] = String(arg);
        }
        else return;
        changed();
    }

    function meeting(p, b) {
        var G = g.G, now = Date.now(), st = seats(G.players.length);
        G.phase = 'meeting'; G.meeting = { by: p.id, body: b ? b.id : null, bodyAt: b ? { x: b.x, y: b.y } : null, t0: now, stage: 'talk', end: now + 2600 + cfg().talk * 1000, votes: {}, chat: [], mic: {} };
        G.bodies = []; G.reactor = 0; G.o2 = 0; G.fixed = {}; G.rhold = {}; G.locks = {};
        G.players.forEach(function (q, i) { q.x = st[i].x; q.y = st[i].y; q.tp++; q.vent = false; });
    }

    function tally(now) {
        var G = g.G, m = G.meeting, cnt = {}; Object.keys(m.votes).forEach(function (k) { var v = m.votes[k]; cnt[v] = (cnt[v] || 0) + 1; });
        var best = null, bv = 0, tie = false; Object.keys(cnt).forEach(function (k) { var v = cnt[k]; if (v > bv) { best = k; bv = v; tie = false; } else if (v === bv) tie = true; });
        var C = cfg(), pickId = best && best !== 'skip' && !tie ? best : null;
        if (tie && C.tieRule === 'طرد عشوائي') { var tied = Object.keys(cnt).filter(function (k) { return cnt[k] === bv && k !== 'skip'; }); if (tied.length) pickId = tied[Math.floor(Math.random() * tied.length)]; }
        var ej = pickId ? P(pickId) : null; if (ej) ej.alive = false;
        G.eject = { id: ej ? ej.id : null, name: ej ? ej.name : '', c: ej ? ej.c : '#3a3450', wasImp: !!(ej && ej.imp), tie: tie && !ej, show: C.confirmEject, votes: C.anonVotes ? null : Object.assign({}, m.votes), until: now + Math.max(C.resultSec, ej ? 7 : 5) * 1000, t0: now, left: G.players.filter(function (q) { return q.imp && q.alive; }).length };
        G.phase = 'eject'; G.meeting = null; changed();
    }

    function checkWin() {
        var G = g.G; if (G.phase === 'over') return;
        var crew = G.players.filter(function (p) { return !p.imp; }), ca = crew.filter(function (p) { return p.alive; }).length, ia = G.players.filter(function (p) { return p.imp && p.alive; }).length;
        var tt = taskTotals(G), C = cfg();
        if (ia === 0) return win('crew', 'كل الامبوسترز انكشفوا');
        if (ia >= ca) return win('imp', 'الامبوسترز صاروا بعدد المواطنين');
        if (C.crewWinTasks && tt.tot && tt.dn >= tt.tot) return win('crew', 'المواطنين خلّص كل المهام');
    }

    function win(team, reason) {
        var G = g.G; G.phase = 'over'; G.winner = team; G.reason = reason; changed();
        if (g.hooks.onOver) g.hooks.onOver(G);
    }

    /** نفس hostTick بالنموذج (بدون البوتات وتحديث موقع المذيع) — يُستدعى 20 مرة بالثانية. */
    function tick(now) {
        var G = g.G; if (!G) return;
        if (G.phase === 'reveal' && now > G.until) { G.phase = 'play'; changed(); }
        if (G.phase === 'play') {
            if (G.reactor && now > G.reactor) { if (cfg().impWinReactor) return win('imp', 'انفجر المفاعل'); G.reactor = 0; changed(); }
            if (G.o2 && now > G.o2) { if (cfg().impWinReactor) return win('imp', 'نفد الأكسجين'); G.o2 = 0; changed(); }
            if (G.reactor) { G.rhold = G.rhold || {}; var h = G.rhold; if (now - (h.r1 || 0) < 500 && now - (h.r2 || 0) < 500) { G.reactor = 0; G.rhold = {}; sfx('fixed'); changed(); } }
            if (G.endAt && now > G.endAt) return win(cfg().timeoutWinner === 'المواطنين' ? 'crew' : 'imp', 'خلص وقت الجولة');
            Object.keys(G.locks).forEach(function (k) { if (G.locks[k] < now) { delete G.locks[k]; changed(); } });
        }
        if (G.phase === 'meeting') {
            var m = G.meeting;
            if (m.stage === 'talk') m.votes = {};
            if (m.stage === 'talk' && now > m.end) { m.stage = 'vote'; m.end = now + cfg().vote * 1000; changed(); }
            else if (m.stage === 'vote') { var alive = G.players.filter(function (p) { return p.alive; }); if (now > m.end || alive.every(function (p) { return m.votes[p.id]; })) tally(now); }
        }
        if (G.phase === 'eject' && now > G.eject.until) {
            G.phase = 'play'; G.eject = null; G.players.forEach(function (p) { if (p.imp) p.kcd = now + cfg().kill * 1000; });
            G.sabCd = Math.max(G.sabCd, now + 10000); G.emCd = now + cfg().emergencyCd * 1000; checkWin(); changed();
        }
    }

    /** موقع من العميل (pos) — الخادم يتحقق من السرعة والجدران قبل ما يقبله. */
    function pos(id, x, y, f, v) {
        var G = g.G, p = P(id); if (!G || !p || !(G.phase === 'play' || G.phase === 'reveal')) return;
        x = Number(x); y = Number(y); if (!isFinite(x) || !isFinite(y)) return;
        var now = Date.now(), el = Math.min(1, Math.max(.02, (now - (p.lastPos || now)) / 1000)); p.lastPos = now;
        var inVent = !!v && p.imp && p.alive && G.cfg.vents, ventAt = VENTS.find(function (q) { return Math.hypot(q.x - x, q.y - y) < 3; });
        var maxD = M.SPEED * (G.cfg.speed || 1) * el * 1.6 + 60;
        var ok = inVent ? !!ventAt : (dist(p, { x: x, y: y }) <= maxD && M.walk(x, y, null)) || (ventAt && p.imp);
        if (!ok) { p.tp++; changed(); return; } // يرجّع العميل لآخر موقع مقبول
        p.x = x; p.y = y; p.f = f === -1 ? -1 : 1; p.vent = inVent;
    }

    /** نسخة الحالة اللي تنرسل للاعب id (فلترة ضد الغش). */
    function view(id) {
        var G = g.G; if (!G) return null;
        var me = P(id), over = G.phase === 'over', seeImp = over || (me && me.imp), tt = taskTotals(G);
        // impN: عدد الامبوسترز (معلومة عامة تظهر بشاشة الدور) — بدونه المواطن يشوف 0 لأن هوياتهم مخفية
        var out = Object.assign({}, G, { tt: tt, impN: G.players.filter(function (p) { return p.imp; }).length });
        out.players = G.players.map(function (p) {
            var self = p.id === String(id), q = { id: p.id, name: p.name, c: p.c, hat: p.hat, acc: p.acc, top: p.top, pants: p.pants, back: p.back, x: p.x, y: p.y, f: p.f, alive: p.alive, btn: p.btn, tp: p.tp, vent: p.vent, imp: self || seeImp ? p.imp : false, tasks: [], done: [] };
            if (self || over) { q.tasks = p.tasks; q.done = p.done; }
            if (self) q.kcd = p.kcd;
            if (!self && p.vent && !seeImp) { q.x = -9999; q.y = -9999; q.vent = false; }
            return q;
        });
        out.bodies = G.bodies.map(function (b) { return seeImp || b.id === String(id) ? b : { id: b.id, x: b.x, y: b.y, c: b.c }; });
        if (!me || me.imp) delete out.o2code;
        if (G.meeting) { var vs = {}; Object.keys(G.meeting.votes).forEach(function (k) { vs[k] = k === String(id) ? G.meeting.votes[k] : '?'; }); out.meeting = Object.assign({}, G.meeting, { votes: vs }); }
        if (G.eject && !G.eject.show) out.eject = Object.assign({}, G.eject, { wasImp: false });
        delete out.startedAt;
        return out;
    }

    g.newGame = newGame; g.act = act; g.tick = tick; g.pos = pos; g.view = view; g.P = P;
    newGame();
    return g;
}

module.exports = { createGame: createGame, cfgOf: cfgOf };
