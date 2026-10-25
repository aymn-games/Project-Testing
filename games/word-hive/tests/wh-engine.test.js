// خلية الكلمات — اختبارات المحرك والبنك والإعدادات.
// التشغيل: node --test games/word-hive/tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../wh-engine.js');
const ROUNDS = require('../wh-rounds.js');
const S = require('../wh-settings.js');

// جولة اختبار بأحرف «برمجيات» (حرف الوسط ر) — 31 كلمة، أول 20 منها هي المطلوبة أثناء اللعب
const R = E.validateRound({
    id: 't1', center: 'ر', letters: ['ب', 'م', 'ج', 'ي', 'ا', 'ت'], status: 'approved',
    words: ['برمجيات', 'برامج', 'تاجر', 'تجار', 'جار', 'جرار', 'برج', 'أبراج', 'جرب', 'جبر', 'إجبار', 'جبار', 'أمير', 'مرايا',
        'تمر', 'مرات', 'أمر', 'يمر', 'مريب', 'ريب', 'ارتياب', 'مرتاب', 'أريج', 'بري', 'تبرير', 'مبرر', 'براري', 'ربما', 'رمي',
        'مرمى', 'تيار', 'كتاب' /* ليست من أحرف الجولة */, 'تمر' /* مكررة */]
});
const RULES = { durationSec: 60, minLen: 3, allowRepeat: true, points: { p3: 1, p4: 2, p5: 3, p6: 5, golden: 7 } };
const T0 = 1_000_000;
const msg = (id, name, text, extra) => Object.assign({ playerId: id, playerName: name, text }, extra || {});
function running(rules) { const s = E.createSession(R, rules || RULES); s.start(T0); return s; }

test('فحص البنك: يرفض الكلمات غير المطابقة والمكررة ويحسب الذهبية', () => {
    assert.equal(R.status, 'approved');
    assert.equal(R.count, 31);
    assert.deepEqual(R.rejected.map(r => r.reason).sort(), ['duplicate', 'no_center']);
    assert.deepEqual(R.golden, ['برمجيات']);
});

test('كلمة صحيحة تُقبل وتُحتسب نقاطها لأول لاعب', () => {
    const s = running();
    const r = s.submit(msg('tiktok:ali', 'علي', 'تاجر'), T0 + 1000);
    assert.equal(r.status, 'accepted');
    assert.equal(r.points, 2);
    assert.equal(s.leaderboard()[0].score, 2);
});

test('كلمة لا تحتوي على حرف الوسط تُرفض', () => {
    const s = running();
    const r = s.submit(msg('a', 'a', 'باب'), T0 + 1);
    assert.equal(r.reason, 'no_center');
});

test('كلمة فيها حرف غير متاح تُرفض حتى لو فيها حرف الوسط', () => {
    const s = running();
    assert.equal(s.submit(msg('a', 'a', 'كتاب'), T0 + 1).reason, 'no_center');
    assert.equal(s.submit(msg('a', 'a', 'قمر'), T0 + 1).reason, 'bad_letter');
});

test('كلمة أقصر من الحد الأدنى تُرفض', () => {
    const s = running(Object.assign({}, RULES, { minLen: 4 }));
    assert.equal(s.submit(msg('a', 'a', 'جار'), T0 + 1).reason, 'short');
    assert.equal(s.submit(msg('a', 'a', 'تاجر'), T0 + 1).status, 'accepted');
    assert.equal(s.total, 20);
    assert.deepEqual(s.eligible, R.answers.filter(w => [...w].length >= 4).slice(0, 20));
});

test('كلمة بأحرف الخلية لكنها غير موجودة في القاموس تُرفض', () => {
    const s = running();
    const r = s.submit(msg('a', 'a', 'ربرب'), T0 + 1);
    assert.equal(r.reason, 'not_in_dict');
    assert.equal(r.usesHiveOnly, true);
});

test('كلمة سبق احتسابها لا تُحتسب مرة ثانية (لنفس اللاعب أو غيره)', () => {
    const s = running();
    assert.equal(s.submit(msg('a', 'A', 'برج'), T0 + 1).status, 'accepted');
    assert.equal(s.submit(msg('a', 'A', 'برج'), T0 + 2).reason, 'duplicate');
    const r = s.submit(msg('b', 'B', 'بُرْج'), T0 + 3);
    assert.equal(r.reason, 'duplicate');
    assert.equal(r.by, 'A');
    assert.equal(s.leaderboard().length, 1);
});

test('رسالتان متزامنتان للكلمة نفسها: نقاط مرة واحدة فقط لأول رسالة', () => {
    const s = running();
    const [a, b] = [s.submit(msg('x', 'X', 'جرار'), T0 + 500), s.submit(msg('y', 'Y', 'جرار'), T0 + 500)];
    assert.equal(a.status, 'accepted');
    assert.equal(b.reason, 'duplicate');
    assert.equal(s.leaderboard().reduce((t, p) => t + p.score, 0), a.points);
});

test('الرسالة نفسها (msgId أو نفس الكائن) لا تُعالج مرتين', () => {
    const s = running();
    assert.equal(s.submit(msg('x', 'X', 'تمر', { msgId: 'm1' }), T0 + 1).status, 'accepted');
    assert.equal(s.submit(msg('x', 'X', 'مرات', { msgId: 'm1' }), T0 + 2).reason, 'dup_message');
    const payload = { id: 'y', text: 'أمر' };
    assert.equal(s.submit(msg('y', 'Y', 'أمر', { payload }), T0 + 3).status, 'accepted');
    assert.equal(s.submit(msg('y', 'Y', 'يمر', { payload }), T0 + 4).reason, 'dup_message');
});

test('انتهاء الوقت أثناء استقبال الرسائل: لا نقاط بعد آخر لحظة', () => {
    const s = running();
    assert.equal(s.submit(msg('a', 'a', 'جبر'), T0 + 59_999).status, 'accepted');
    const late = s.submit(msg('b', 'b', 'جبار'), T0 + 60_000);
    assert.equal(late.status, 'ignored');
    assert.equal(late.reason, 'time_up');
    assert.equal(s.state, 'ended');
    assert.equal(s.endReason, 'time');
    assert.equal(s.submit(msg('c', 'c', 'جرب'), T0 + 61_000).status, 'ignored');
    assert.equal(s.found.length, 1);
});

test('الإيقاف المؤقت: لا نقاط أثناء الإيقاف والوقت يتجمد ثم يكمل', () => {
    const s = running();
    s.pause(T0 + 20_000);
    assert.equal(s.submit(msg('a', 'a', 'ريب'), T0 + 25_000).reason, 'paused');
    assert.equal(s.remaining(T0 + 90_000), 40_000);
    s.resume(T0 + 100_000);
    assert.equal(s.remaining(T0 + 110_000), 30_000);
    assert.equal(s.submit(msg('a', 'a', 'ريب'), T0 + 110_000).status, 'accepted');
    assert.equal(s.tick(T0 + 140_000), true);
    assert.equal(s.activeMs(T0 + 200_000), 60_000);
});

test('إعادة الجولة من البداية: جلسة جديدة بنفس الأحرف وبدون أي نقاط سابقة', () => {
    const s1 = running();
    s1.submit(msg('a', 'a', 'مريب'), T0 + 1);
    const s2 = E.createSession(s1.round, RULES);
    s2.start(T0 + 5000);
    assert.equal(s2.leaderboard().length, 0);
    assert.equal(s2.submit(msg('b', 'b', 'مريب'), T0 + 6000).status, 'accepted');
    assert.equal(s2.remaining(T0 + 5000), 60_000);
});

test('الكلمة الذهبية: مكافأة إضافية مرة واحدة عند أول اكتشاف', () => {
    const s = running();
    const r = s.submit(msg('g', 'G', 'برمجيات'), T0 + 1);
    assert.equal(r.status, 'accepted');
    assert.equal(r.golden, true);
    assert.equal(r.base, 5);
    assert.equal(r.bonus, 7);
    assert.equal(r.points, 12);
    assert.equal(s.submit(msg('h', 'H', 'برمجيات'), T0 + 2).reason, 'duplicate');
    assert.equal(s.leaderboard().reduce((t, p) => t + p.score, 0), 12);
});

test('جدول النقاط حسب الطول والإعدادات', () => {
    assert.equal(E.pointsFor('جار', R).total, 1);
    assert.equal(E.pointsFor('تاجر', R).total, 2);
    assert.equal(E.pointsFor('برامج', R).total, 3);
    assert.equal(E.pointsFor('ارتياب', R).total, 5);
    assert.equal(E.pointsFor('تاجر', R, { p4: 9 }).total, 9);
});

test('جولة أقل من 20 كلمة صحيحة تبقى مسودة ولا تُختار', () => {
    const draft = E.validateRound({ id: 'd', center: 'ر', letters: ['ب', 'م', 'ج', 'ي', 'ا', 'ت'], status: 'approved', words: ['تاجر', 'جار', 'برج'] });
    assert.equal(draft.status, 'draft');
    const bank = E.buildBank(ROUNDS);
    const withDraft = E.buildBank(ROUNDS.concat([{ id: 'dx', center: 'ر', letters: ['ب', 'م', 'ج', 'ي', 'ا', 'ت'], status: 'approved', words: ['تاجر', 'جار', 'برج'] }]));
    assert.ok(withDraft.drafts.some(r => r.id === 'dx'));
    for (let i = 0; i < 200; i++) {
        const r = E.pickRound(withDraft, { difficulty: 'mixed' });
        assert.equal(r.status, 'approved');
        assert.ok(r.count >= 20);
    }
    assert.notEqual(E.pickRound(withDraft, { manualId: 'dx' }).id, 'dx');
});

test('الجولة المعلّمة draft تبقى مسودة حتى لو عدد كلماتها كافٍ', () => {
    const raw = ROUNDS.find(r => r.id === 'r01');
    assert.equal(E.validateRound(Object.assign({}, raw, { status: 'draft' })).status, 'draft');
});

test('اختلافات الكتابة العربية والتشكيل والتطويل تتوحد', () => {
    const s = running();
    assert.equal(s.submit(msg('a', 'a', 'أَمِيـــر'), T0 + 1).status, 'accepted');
    assert.equal(s.submit(msg('b', 'b', 'إجبار'), T0 + 1).status, 'accepted');
    assert.equal(E.normalizeWord('مرمى'), 'مرمي');
    assert.equal(E.normalizeWord('مَدْرَسَة'), 'مدرسه');
    assert.equal(E.normalizeWord('آبار'), 'ابار');
    assert.equal(E.normalizeWord('سؤال'), 'سوال');
    assert.equal(E.extractCandidate('  كتاب!! 😍 '), 'كتاب');
    assert.equal(E.extractCandidate('هلا والله'), null);
    assert.equal(E.extractCandidate('hello'), null);
});

test('تكرار الحرف: مسموح افتراضياً، ويُرفض لو أُوقف', () => {
    const s = running(Object.assign({}, RULES, { allowRepeat: false }));
    assert.equal(s.submit(msg('a', 'a', 'جرار'), T0 + 1).reason, 'repeat');
    assert.ok(!s.eligible.includes('جرار'));
    assert.equal(running().submit(msg('a', 'a', 'جرار'), T0 + 1).status, 'accepted');
});

test('اللاعب نفسه باختلاف حالة الأحرف أو @ لا يتكرر', () => {
    const s = running();
    s.submit(msg('tiktok:Ali_9', 'علي', 'تمر'), T0 + 1);
    s.submit(msg('TIKTOK:ali_9', 'Ali', 'أمر'), T0 + 2);
    s.submit(msg('@tiktok:ali_9 ', 'علي', 'يمر'), T0 + 3);
    const lb = s.leaderboard();
    assert.equal(lb.length, 1);
    assert.equal(lb[0].words.length, 3);
});

test('لا نقاط قبل بدء الجولة أو بعد إنهائها يدوياً', () => {
    const s = E.createSession(R, RULES);
    assert.equal(s.submit(msg('a', 'a', 'تمر'), T0).reason, 'inactive');
    s.start(T0);
    s.end(T0 + 1000, 'manual');
    assert.equal(s.submit(msg('a', 'a', 'تمر'), T0 + 1001).reason, 'inactive');
    assert.equal(s.found.length, 0);
});

test('الإعدادات لا تتجاوز شرط حرف الوسط ولا أحرف الخلية', () => {
    const v = S.sanitize({ minLen: 1, allowRepeat: 'x', p3: 999, durationSec: 7, requireCenter: false });
    assert.equal(v.minLen, 3);
    assert.equal(v.allowRepeat, true);
    assert.equal(v.p3, 50);
    assert.equal(v.durationSec, 180);
    assert.ok(!('requireCenter' in v));
    const s = E.createSession(R, Object.assign(S.rules(v), { requireCenter: false, minLen: 1 }));
    s.start(T0);
    assert.equal(s.submit(msg('a', 'a', 'باب'), T0 + 1).reason, 'no_center');
});

test('قواعد الجولة الجارية ثابتة حتى لو تغيرت الإعدادات بعد البدء', () => {
    const rules = S.rules(S.defaults());
    const s = E.createSession(R, rules);
    s.start(T0);
    rules.points.p4 = 50; rules.minLen = 5;
    const r = s.submit(msg('a', 'a', 'تاجر'), T0 + 1);
    assert.equal(r.status, 'accepted');
    assert.equal(r.points, 2);
});

test('الفائزون: أعلى نقاط، والتعادل يعطي أكثر من فائز', () => {
    const s = running();
    s.submit(msg('a', 'A', 'تاجر'), T0 + 1);
    s.submit(msg('b', 'B', 'تجار'), T0 + 2);
    assert.deepEqual(s.winners().map(p => p.name), ['A', 'B']);
    s.submit(msg('b', 'B', 'جار'), T0 + 3);
    assert.deepEqual(s.winners().map(p => p.name), ['B']);
});

test('بنك المشروع: كل جولة معتمدة ≥20 كلمة وأحرفها 7 مختلفة', () => {
    const bank = E.buildBank(ROUNDS);
    assert.ok(bank.approved.length >= 10);
    bank.approved.forEach(r => {
        assert.ok(r.count >= 20, r.id);
        assert.equal(E.targetWords(r, { minLen: 3 }).length, 20, r.id);
        assert.equal(new Set(E.hiveLetters(r)).size, 7, r.id);
        r.answers.forEach(w => assert.ok(E.checkLetters(w, r, { minLen: 3 }).ok, r.id + ' ' + w));
    });
});

test('20 كلمة مطلوبة فقط: كلمة صحيحة بالقاموس لكنها خارج الـ20 تُرفض', () => {
    const s = running();
    assert.equal(s.total, 20);
    assert.ok(!s.eligible.includes('ارتياب'));
    assert.equal(s.submit(msg('a', 'a', 'ارتياب'), T0 + 1).reason, 'not_in_dict');
});

test('اكتمال الكلمات العشرين ينهي الجولة فوراً', () => {
    const s = running();
    let last;
    s.eligible.forEach((w, i) => { last = s.submit(msg('p' + (i % 3), 'P' + (i % 3), w), T0 + 100 + i); });
    assert.equal(last.status, 'accepted');
    assert.equal(last.completed, true);
    assert.equal(s.state, 'ended');
    assert.equal(s.endReason, 'complete');
    assert.equal(s.found.length, 20);
});

test('صورة صاحب الإجابة تُحفظ مع الكلمة المكتشفة', () => {
    const s = running();
    s.submit(msg('tiktok:x', 'X', 'تاجر', { avatar: 'https://example.com/x.jpg' }), T0 + 1);
    assert.equal(s.foundBy('تاجر').avatar, 'https://example.com/x.jpg');
});
