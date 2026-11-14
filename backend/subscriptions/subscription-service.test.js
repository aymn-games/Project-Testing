'use strict';

// اشتراك الستريمر: التفعيل بكود، التعليق (واحد لكل شهر، 5 أيام وينفك
// تلقائياً)، فكّه بدري يحسب تعليق كامل، والتمديد بكود ثاني.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var sub = require('./subscription-service');

var DAY = sub.DAY_MS;
var tag = 'subtest_' + Date.now();
var made = [], codes = [];
function makeUser(suffix, streamer) {
    var info = db.prepare('INSERT INTO users (username, email, is_streamer, created_at) VALUES (?, ?, ?, ?)')
        .run(tag + suffix, tag + suffix + '@test.local', streamer ? 1 : 0, Date.now());
    var id = Number(info.lastInsertRowid);
    made.push(id);
    return { id: id };
}
function gen(months) { var r = sub.generateCodes(months, 1, 'test'); codes.push(r.codes[0]); return r.codes[0]; }
var clock = Date.now();
sub._setClock(function () { return clock; });

test.after(function () {
    sub._setClock(null);
    codes.forEach(function (c) { db.prepare('DELETE FROM subscription_codes WHERE code = ?').run(c); });
    made.forEach(function (id) {
        db.prepare('DELETE FROM streamer_subscriptions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
});

test('التفعيل لحسابات الستريمر فقط، والكود مرة وحدة', function () {
    var player = makeUser('p', false), s = makeUser('s', true);
    var code = gen(1);
    assert.equal(sub.redeem(player, code).error, 'not_streamer');
    assert.equal(sub.redeem(s, 'SUB-0000-0000').error, 'invalid_code');
    assert.equal(sub.redeem(s, code.toLowerCase().replace(/-/g, ' ')).success, true); // يقبل الكتابة بدون شرطات
    assert.equal(sub.redeem(s, code).error, 'code_used');
    var st = sub.status(s.id).subscription;
    assert.equal(st.active, true);
    assert.equal(st.months, 1);
    assert.equal(st.pausesAllowed, 1);
    assert.ok(Math.abs(st.remainingMs - 30 * DAY) < 1000);
});

test('شهر: تعليق واحد، الأيام ما تنحسب، وفكّه بدري يحسب تعليق كامل', function () {
    var s = makeUser('s1', true);
    sub.redeem(s, gen(1));
    clock += 10 * DAY;
    assert.equal(sub.pause(s).success, true);
    var st = sub.status(s.id).subscription;
    assert.equal(st.paused, true);
    clock += 2 * DAY;
    assert.ok(Math.abs(sub.status(s.id).subscription.remainingMs - 20 * DAY) < 1000); // متجمّد
    assert.equal(sub.resume(s).success, true);
    st = sub.status(s.id).subscription;
    assert.equal(st.paused, false);
    assert.ok(Math.abs(st.remainingMs - 20 * DAY) < 1000);
    assert.equal(st.canPause, false);
    assert.equal(sub.pause(s).error, 'no_pauses_left');
});

test('التعليق ينفك تلقائياً بعد 5 أيام', function () {
    var s = makeUser('s2', true);
    sub.redeem(s, gen(1));
    sub.pause(s);
    clock += 7 * DAY;
    var st = sub.status(s.id).subscription;
    assert.equal(st.paused, false);
    assert.ok(Math.abs(st.remainingMs - 28 * DAY) < 1000); // 30 - (7 - 5)
});

test('شهرين: تعليقين، واحد بس بكل شهر', function () {
    var s = makeUser('s3', true);
    sub.redeem(s, gen(2));
    assert.equal(sub.status(s.id).subscription.pausesAllowed, 2);
    assert.equal(sub.pause(s).success, true);
    sub.resume(s);
    assert.equal(sub.pause(s).error, 'monthly_pause_used');
    clock += 31 * DAY;
    assert.equal(sub.pause(s).success, true);
    sub.resume(s);
    clock += 20 * DAY; // لسه فعّال، بس الرصيد خلص
    assert.equal(sub.pause(s).error, 'no_pauses_left');
});

test('كود ثاني يمدّد الاشتراك الفعّال، وبعد الانتهاء يبدأ من جديد', function () {
    var s = makeUser('s4', true);
    sub.redeem(s, gen(1));
    clock += 5 * DAY;
    sub.redeem(s, gen(1));
    var st = sub.status(s.id).subscription;
    assert.equal(st.months, 2);
    assert.equal(st.pausesAllowed, 2);
    assert.ok(Math.abs(st.remainingMs - 55 * DAY) < 1000);
    clock += 60 * DAY;
    assert.equal(sub.status(s.id).subscription.active, false);
    assert.equal(sub.pause(s).error, 'expired');
    sub.redeem(s, gen(1));
    st = sub.status(s.id).subscription;
    assert.equal(st.months, 1);
    assert.equal(st.pausesUsed, 0);
    assert.ok(Math.abs(st.remainingMs - 30 * DAY) < 1000);
});

test('التجديد: دورة جديدة من الحين + الأيام الباقية، ورصيد التعليق من جديد', function () {
    var s = makeUser('s6', true);
    sub.redeem(s, gen(2));
    sub.pause(s); sub.resume(s);           // استخدم تعليق
    clock += 40 * DAY;                      // باقي 20 يوم
    assert.equal(sub.redeem(s, gen(1), 'bad').error, 'invalid_mode');
    var r = sub.redeem(s, gen(1), 'renew');
    assert.equal(r.mode, 'renew');
    var st = sub.status(s.id).subscription;
    assert.equal(st.months, 1);
    assert.equal(st.pausesAllowed, 1);
    assert.equal(st.pausesUsed, 0);
    assert.ok(Math.abs(st.remainingMs - 50 * DAY) < 1000); // 30 جديدة + 20 باقية
    assert.ok(Math.abs(st.startedAt - clock) < 1000);
    assert.equal(sub.redeem(s, gen(1), 'extend').mode, 'extend');
    assert.ok(Math.abs(sub.status(s.id).subscription.remainingMs - 80 * DAY) < 1000);
});

test('الأدمن: التوليد والإيقاف', function () {
    assert.equal(sub.generateCodes(3, 1).error, 'invalid_months');
    var c = gen(2);
    assert.equal(sub.burnCode(c).success, true);
    var s = makeUser('s5', true);
    assert.equal(sub.redeem(s, c).error, 'code_burned');
    assert.ok(sub.listCodes().some(function (x) { return x.code === c && x.burnedAt; }));
});
