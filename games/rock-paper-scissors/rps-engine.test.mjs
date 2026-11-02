// منطق بطولة حجرة ورقة مقص (rps-engine.js): الغلبة، قراءة الشات، الأزواج، التعادل، والبطل
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const E = createRequire(import.meta.url)('./rps-engine.js');
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const add = (g, n) => { for (let i = 1; i <= n; i++) g.join({ id: 'tiktok:p' + i, name: 'p' + i }); };

test('beats: rock>scissors, paper>rock, scissors>paper, same=tie', () => {
    assert.equal(E.beats(1, 3), 1); assert.equal(E.beats(2, 1), 1); assert.equal(E.beats(3, 2), 1);
    assert.equal(E.beats(3, 1), -1); assert.equal(E.beats(2, 2), 0);
});

test('parsePick accepts 1/2/3 in latin, arabic and persian digits only', () => {
    assert.equal(E.parsePick(' 1 '), 1); assert.equal(E.parsePick('٢'), 2); assert.equal(E.parsePick('۳'), 3);
    for (const t of ['4', '12', 'حجرة', '1 2', '', null]) assert.equal(E.parsePick(t), 0, String(t));
});

test('join: no duplicates, respects maxPlayers, closed after start', () => {
    const g = E.create({ maxPlayers: 3 });
    assert.ok(g.join({ id: 'a', name: 'A' })); assert.equal(g.join({ id: 'a', name: 'A' }), null);
    g.join({ id: 'b' }); g.join({ id: 'c' }); assert.equal(g.join({ id: 'd' }), null);
    assert.ok(g.startRound()); assert.equal(g.join({ id: 'e' }), null);
});

test('start needs 2 players; odd count gives exactly one bye', () => {
    const g = E.create(); g.join({ id: 'a' }); assert.equal(g.startRound(), false);
    add(g, 4); assert.ok(g.startRound());
    assert.equal(g.duels.length, 2); assert.ok(g.bye);
    const ids = new Set(g.duels.flatMap(d => [d.a, d.b]).concat(g.bye)); assert.equal(ids.size, 5);
});

test('resolve: winner by pick, no-show loses, last pick counts', () => {
    const g = E.create({ random: seq(0) }); add(g, 2); g.startRound();
    const d = g.duels[0];
    g.pick(d.a, 1); g.pick(d.a, 2); g.pick(d.b, 1); // a غيّر لورقة
    g.resolve(); assert.equal(d.winner, d.a); assert.equal(d.how, 'beat');
    const h = E.create({ random: seq(0) }); add(h, 2); h.startRound();
    h.pick(h.duels[0].b, 3); h.resolve(); assert.equal(h.duels[0].winner, h.duels[0].b); assert.equal(h.duels[0].how, 'noshow');
});

test('outsiders and eliminated players cannot pick', () => {
    const g = E.create(); add(g, 3); g.startRound();
    assert.equal(g.pick(g.bye, 1), false); assert.equal(g.pick('nobody', 1), false); assert.equal(g.pick(g.duels[0].a, 4), false);
});

test('tie replays the same duel, then a draw after MAX_TIES', () => {
    const g = E.create({ random: seq(0.9) }); add(g, 2); g.startRound();
    const d = g.duels[0];
    for (let i = 1; i < E.MAX_TIES; i++) {
        g.pick(d.a, 1); g.pick(d.b, 1);
        assert.equal(g.resolve().ties, 1); assert.equal(g.roundDone(), false);
        assert.equal(g.startReplay(), 1); assert.deepEqual(d.picks, {});
    }
    g.pick(d.a, 2); g.pick(d.b, 2); assert.equal(g.resolve().ties, 0);
    assert.equal(d.how, 'draw'); assert.ok(g.roundDone());
});

test('full tournament of 7 ends with one champion and everyone else out', () => {
    const g = E.create({ random: Math.random }); add(g, 7); g.startRound();
    let rounds = 0;
    while (!g.champion) {
        g.duels.forEach(d => { g.pick(d.a, 1); g.pick(d.b, 3); });
        g.resolve(); assert.ok(g.nextRound()); rounds++;
        assert.ok(rounds < 10);
    }
    assert.equal(rounds, 3);
    assert.equal(g.players.filter(p => !p.out).length, 1);
    assert.equal(g.players.find(p => !p.out).id, g.champion);
});

test('stageName follows remaining players', () => {
    const g = E.create(); add(g, 2); g.startRound(); assert.equal(g.stageName(), 'النهائي');
    const h = E.create(); add(h, 4); h.startRound(); assert.equal(h.stageName(), 'نصف النهائي');
});

test('resolve(i) settles only that duel; others stay open for later', () => {
    const g = E.create({ random: seq(0) }); add(g, 4); g.startRound();
    const [d0, d1] = g.duels;
    g.pick(d0.a, 1); g.pick(d0.b, 3);
    g.resolve(0);
    assert.equal(d0.result, 'done'); assert.equal(d0.winner, d0.a);
    assert.equal(d1.result, null); assert.equal(g.roundDone(), false);
    g.pick(d1.a, 2); g.pick(d1.b, 2); assert.equal(g.resolve(1).ties, 1);
    assert.equal(g.startReplay(0), 0); assert.equal(g.startReplay(1), 1);
    g.pick(d1.a, 3); g.pick(d1.b, 2); g.resolve(1); assert.ok(g.roundDone());
});
