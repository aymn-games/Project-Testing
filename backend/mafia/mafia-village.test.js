'use strict';

// المافيا — نظام القرية (mafia-village.js): الأدوار والليل والتصويت والفوز.
var test = require('node:test');
var assert = require('node:assert/strict');
var Settings = require('./mafia-settings');
var Village = require('./mafia-village');

function roster(n) { var a = []; for (var i = 0; i < n; i++) a.push({ id: 'p' + i, name: 'لاعب ' + i, look: {} }); return a; }
function setup(n, roles, extra) {
    var s = { system: 'village' }; Object.keys(roles).forEach(function (k) { s['v_' + k] = roles[k]; });
    Object.assign(s, extra || {});
    var S = Settings.validate(s);
    var g = Village.createGame(roster(n), S, {});
    return { g: g, G: g.G, S: S };
}
function byRole(G, r) { return G.players.filter(function (p) { return p.role === r; }); }
function next(g) { g.endStage(); }
function toNight(g) { while (g.G.phase !== 'night') next(g); }

test('الإعدادات: نظام القرية يتحقق ويحسب أقل عدد', function () {
    var s = Settings.validate({ system: 'village', v_mafia: 3, v_forger: 1, v_mayor: 4, killMode: 'x' });
    assert.equal(s.system, 'village');
    assert.equal(s.v_mayor, 1);           // العمدة واحد بالكثير
    assert.equal(s.killMode, 'agree');
    assert.equal(Settings.minPlayers(s), 9);   // فريق المافيا 4 ← لازم 9 على الأقل
    assert.equal(Settings.validate({}).system, undefined);   // النظام الحالي ما تغيّر
});

test('توزيع الأدوار بالأعداد المختارة والباقي مواطنين', function () {
    var t = setup(12, { mafia: 2, doctor: 1, detective: 1, mayor: 1, bodyguard: 1, sniper: 1, forger: 1, jester: 1 });
    var c = {}; t.G.players.forEach(function (p) { c[p.role] = (c[p.role] || 0) + 1; });
    assert.deepEqual(c, { mafia: 2, doctor: 1, detective: 1, mayor: 1, bodyguard: 1, sniper: 1, forger: 1, jester: 1, citizen: 3 });
    assert.equal(byRole(t.G, 'forger')[0].team, 'mafia');
    assert.equal(byRole(t.G, 'jester')[0].team, 'neutral');
});

test('الحارس يقتل المافيا المهاجم والمحروس ينجو', function () {
    var t = setup(8, { mafia: 2, doctor: 0, detective: 0, bodyguard: 1 }, { killMode: 'agree' }), g = t.g, G = t.G;
    toNight(g);
    var maf = byRole(G, 'mafia'), bg = byRole(G, 'bodyguard')[0], victim = G.players.find(function (p) { return p.role === 'citizen'; });
    maf.forEach(function (m) { g.act(m.id, 'pick', victim.id); });
    g.act(bg.id, 'pick', victim.id);
    next(g);
    assert.equal(G.phase, 'dawn');
    assert.equal(victim.alive, true);
    var dead = maf.filter(function (m) { return !m.alive; });
    assert.equal(dead.length, 1);
    assert.equal(dead[0].cause, 'guard');
    assert.equal(dead[0].causeRef, victim.id);
    assert.ok(G.morning.items.some(function (i) { return i.id === victim.id && i.kind === 'saved-guard'; }));
    assert.equal(bg.alive, true);
});

test('كل مافيا يقتل لاعب، والطبيب ينقذ واحد', function () {
    var t = setup(10, { mafia: 2, doctor: 1, detective: 0 }, { killMode: 'each' }), g = t.g, G = t.G;
    toNight(g);
    var maf = byRole(G, 'mafia'), doc = byRole(G, 'doctor')[0], cits = byRole(G, 'citizen');
    g.act(maf[0].id, 'pick', cits[0].id); g.act(maf[1].id, 'pick', cits[1].id);
    g.act(doc.id, 'pick', cits[1].id);
    next(g);
    assert.equal(cits[0].alive, false); assert.equal(cits[0].cause, 'mafia');
    assert.equal(cits[1].alive, true);
    assert.ok(G.morning.items.some(function (i) { return i.id === cits[1].id && i.kind === 'saved-doctor'; }));
    // الطبيب ما يكرر نفس الشخص الليلة الجاية
    while (G.phase !== 'night') next(g);
    var v = g.view(doc.id);
    assert.ok(v.me.allowed.indexOf(cits[1].id) < 0);
});

test('القنّاص رصاصة وحدة، والمزوّر يقلب نتيجة المحقق', function () {
    var t = setup(10, { mafia: 1, doctor: 0, detective: 1, sniper: 1, forger: 1 }), g = t.g, G = t.G;
    toNight(g);
    var sn = byRole(G, 'sniper')[0], det = byRole(G, 'detective')[0], fg = byRole(G, 'forger')[0], maf = byRole(G, 'mafia')[0];
    var cit = byRole(G, 'citizen');
    g.act(sn.id, 'pick', cit[0].id);
    g.act(det.id, 'pick', cit[1].id); g.act(fg.id, 'pick', cit[1].id);
    next(g);
    assert.equal(cit[0].cause, 'sniper');
    assert.equal(sn.bullets, 0);
    assert.equal(det.inspections[0].res, 'mafia');   // بريء بس مزوّر
    while (G.phase !== 'night') next(g);
    assert.equal(g.view(sn.id).me.actor, false);   // خلصت الرصاصة
    g.act(det.id, 'pick', fg.id);
    next(g);
    assert.equal(det.inspections[1].res, 'innocent');   // المزوّر يطلع بريء
    assert.ok(maf);
});

test('العمدة صوته بصوتين، والتعادل ما يطلّع أحد', function () {
    var t = setup(6, { mafia: 1, doctor: 0, detective: 0, mayor: 1 }, { talkSec: 0 }), g = t.g, G = t.G;
    toNight(g); next(g);   // ليلة بدون اختيار
    next(g);               // الصبح ← التصويت (بدون نقاش)
    assert.equal(G.phase, 'vote');
    var mayor = byRole(G, 'mayor')[0], others = G.players.filter(function (p) { return p !== mayor; });
    g.act(mayor.id, 'vote', others[0].id);
    g.act(others[1].id, 'vote', others[2].id);
    g.act(others[2].id, 'vote', others[1].id);
    g.act(others[1].id, 'vote', others[0].id);   // الصوت ما يتغيّر
    assert.equal(g.view('host').tally[others[0].id], 2);
    next(g);
    assert.equal(G.verdict.id, others[0].id);
    assert.equal(G.verdict.votes, 2);
});

test('المهرّج يفوز لو طردوه واللعبة تكمل، والقرية تفوز لما تطلع المافيا كلها', function () {
    var t = setup(7, { mafia: 1, doctor: 0, detective: 0, jester: 1 }, { talkSec: 0 }), g = t.g, G = t.G;
    var jester = byRole(G, 'jester')[0], maf = byRole(G, 'mafia')[0];
    toNight(g); next(g); next(g);
    G.players.forEach(function (p) { if (p !== jester) g.act(p.id, 'vote', jester.id); });
    next(g);
    assert.equal(G.verdict.jester, true);
    assert.deepEqual(G.jesterWins, [jester.id]);
    next(g);
    assert.equal(G.phase, 'night');
    next(g); next(g);
    G.players.forEach(function (p) { if (p.alive && p !== maf) g.act(p.id, 'vote', maf.id); });
    next(g); next(g);
    assert.equal(G.phase, 'over');
    assert.equal(G.winner, 'town');
});

test('المذيع ما يشوف أدوار الأحياء (إلا العمدة)، والمافيا يعرفون بعض', function () {
    var t = setup(9, { mafia: 2, doctor: 1, detective: 0, mayor: 1, forger: 1 }), g = t.g, G = t.G;
    var hv = g.view('host');
    hv.players.forEach(function (p) {
        var real = G.players.find(function (q) { return q.id === p.id; });
        assert.equal(p.role, real.role === 'mayor' ? 'mayor' : null);
    });
    var m = byRole(G, 'mafia')[0], mv = g.view(m.id);
    var known = mv.players.filter(function (p) { return p.team === 'mafia'; }).length;
    assert.equal(known, 3);   // مافيا 2 + المزوّر
});

test('الحفظ والترجيع يكمل نفس المباراة', function () {
    var t = setup(8, { mafia: 2, doctor: 1, detective: 1 }), g = t.g;
    toNight(g);
    var saved = JSON.parse(JSON.stringify(g.serialize()));
    var g2 = Village.createGame(null, null, {}, saved);
    assert.equal(g2.G.phase, 'night');
    assert.equal(g2.G.players.length, 8);
    var m = byRole(g2.G, 'mafia')[0], c = byRole(g2.G, 'citizen')[0];
    g2.act(m.id, 'pick', c.id);
    assert.equal(g2.G.night.picks[m.id], c.id);
});

test('«تخطّى» بالتصويت: لو أخذ نفس أصوات الأعلى أو أكثر ما أحد يطلع', function () {
    var t = setup(6, { mafia: 1, doctor: 0, detective: 0 }, { talkSec: 0 }), g = t.g, G = t.G;
    toNight(g); next(g); next(g);
    var ps = G.players;
    g.act(ps[0].id, 'vote', ps[1].id); g.act(ps[2].id, 'vote', ps[1].id);
    g.act(ps[3].id, 'vote', 'skip'); g.act(ps[4].id, 'vote', 'skip');
    g.act(ps[3].id, 'vote', ps[1].id);   // ما يتغيّر
    assert.equal(g.view('host').skipVotes, 2);
    next(g);
    assert.equal(G.verdict.skip, true);
    assert.equal(G.verdict.id, null);
    assert.equal(ps[1].alive, true);
});
