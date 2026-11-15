'use strict';

// اشتراك الستريمر: التفعيل بكود، التعليق (واحد لكل شهر، 5 أيام وينفك
// تلقائياً)، فكّه بدري يحسب تعليق كامل، والتمديد بكود ثاني.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var sub = require('./subscription-service');
var config = require('../config');

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
    db.prepare('DELETE FROM subscription_plans WHERE months = 7').run();
    made.forEach(function (id) {
        db.prepare('DELETE FROM streamer_subscriptions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM subscription_events WHERE user_id = ?').run(id);
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

test('السجل: كل حدث ينكتب بمصدره، والكود يظهر مختصر', function () {
    var s = makeUser('e1', true);
    var code = gen(1);
    sub.redeem(s, code);
    sub.pause(s); sub.resume(s);
    sub.redeem(s, gen(1), 'renew');
    var ev = sub.listEvents(s.id, 10);
    assert.deepEqual(ev.map(function (e) { return e.type; }), ['renew', 'resume', 'pause', 'activate']);
    assert.equal(ev[3].source, 'code');
    assert.equal(ev[3].ref, '…' + code.slice(-4));
    assert.equal(ev[3].days, 30);
    assert.equal(ev[1].source, 'user');
});

test('الباقات: الأدمن يضيف باقة، والكود ياخذ رصيد التعليق منها', function () {
    assert.equal(sub.generateCodes(7, 1).error, 'invalid_months');
    assert.equal(sub.savePlan({ months: 7, name: '', pauses: 1 }).error, 'invalid_name');
    assert.equal(sub.savePlan({ months: 7, name: 'سبعة', pauses: 3 }).success, true);
    assert.ok(sub.listPlans().some(function (p) { return p.months === 7 && p.pauses === 3; }));
    var s = makeUser('pl', true);
    sub.redeem(s, gen(7));
    var st = sub.status(s.id).subscription;
    assert.equal(st.months, 7);
    assert.equal(st.pausesAllowed, 3);
    sub.savePlan({ months: 7, name: 'سبعة', pauses: 3, active: false });
    assert.equal(sub.generateCodes(7, 1).error, 'invalid_months');
    assert.ok(!sub.listPlans().some(function (p) { return p.months === 7; }));
    assert.ok(sub.listPlans(true).some(function (p) { return p.months === 7 && !p.active; }));
});

test('المتجر: الشراء يفعّل أو يمدّد، ويُسجَّل برقم الطلب', function () {
    var s = makeUser('st', true);
    assert.equal(sub.grantFromStore(s.id, 1, 'ORD-1').mode, 'new');
    assert.equal(sub.grantFromStore(s.id, 2, 'ORD-2').mode, 'extend');
    var st = sub.status(s.id).subscription;
    assert.equal(st.months, 3);
    assert.equal(st.pausesAllowed, 3);
    assert.ok(Math.abs(st.remainingMs - 90 * DAY) < 1000);
    var ev = sub.listEvents(s.id);
    assert.equal(ev[0].source, 'store');
    assert.equal(ev[0].ref, 'ORD-2');
    assert.equal(sub.grantFromStore(s.id, 0, 'x').error, 'invalid_months');
});

test('الأدمن: إضافة/خصم أيام، فك تعليق، وإنهاء', function () {
    var s = makeUser('ad', true);
    assert.equal(sub.adjustDays(s.id, 5).error, 'no_subscription');
    sub.redeem(s, gen(1));
    assert.equal(sub.adjustDays(s.id, 0).error, 'invalid_days');
    sub.adjustDays(s.id, 10);
    sub.adjustDays(s.id, -3);
    assert.ok(Math.abs(sub.status(s.id).subscription.remainingMs - 37 * DAY) < 1000);
    sub.pause(s);
    assert.equal(sub.adminUnpause(s.id).success, true);
    assert.equal(sub.status(s.id).subscription.paused, false);
    assert.ok(sub.listSubscribers().some(function (x) { return x.userId === s.id && x.active; }));
    sub.endSubscription(s.id);
    assert.equal(sub.status(s.id).subscription.active, false);
    clock += 10 * DAY;
    sub.adjustDays(s.id, 4); // المنتهي يبدأ العد من الحين
    assert.ok(Math.abs(sub.status(s.id).subscription.remainingMs - 4 * DAY) < 1000);
    var types = sub.listEvents(s.id).map(function (e) { return e.type; });
    assert.deepEqual(types.slice(0, 3), ['admin_add', 'admin_end', 'resume']);
    assert.equal(sub.listEvents(s.id)[2].source, 'admin');
});

test('التنبيه والقفل: قرب الانتهاء، والقفل مطفي افتراضياً مع أيام سماح', function () {
    var s = makeUser('en', true);
    var none = makeUser('en0', true);
    sub.redeem(s, gen(1));
    clock += 24 * DAY;
    assert.equal(sub.status(s.id).subscription.expiringSoon, false);
    clock += 2 * DAY;
    assert.equal(sub.status(s.id).subscription.expiringSoon, true);
    var saved = { on: config.subscriptionEnforcement, grace: config.subscriptionGraceDays };
    try {
        config.subscriptionEnforcement = false;
        assert.equal(sub.hasActiveSubscription(none.id), true); // مطفي = مسموح للكل
        config.subscriptionEnforcement = true;
        config.subscriptionGraceDays = 3;
        assert.equal(sub.hasActiveSubscription(none.id), false);
        assert.equal(sub.hasActiveSubscription(s.id), true);
        clock += 6 * DAY; // انتهى قبل يومين — داخل السماح
        assert.equal(sub.hasActiveSubscription(s.id), true);
        clock += 2 * DAY;
        assert.equal(sub.hasActiveSubscription(s.id), false);
    } finally {
        config.subscriptionEnforcement = saved.on;
        config.subscriptionGraceDays = saved.grace;
    }
});

test('القفل يبدأ تلقائياً من تاريخ البدء (subscriptionStartAt)', function () {
    var none = makeUser('sch', true);
    var saved = { on: config.subscriptionEnforcement, start: config.subscriptionStartAt };
    try {
        config.subscriptionEnforcement = null;
        config.subscriptionStartAt = clock + DAY;
        assert.equal(sub.isEnforced(), false);
        assert.equal(sub.hasActiveSubscription(none.id), true); // قبل البدء = مفتوح للكل
        assert.equal(sub.accessForUser({ id: none.id, role: 'user' }), true);
        clock += DAY;
        assert.equal(sub.isEnforced(), true);
        assert.equal(sub.hasActiveSubscription(none.id), false);
        assert.equal(sub.accessForUser({ id: none.id, role: 'user' }), false);
        assert.equal(sub.accessForUser({ id: none.id, role: 'admin' }), true); // الأدمن مستثنى
        config.subscriptionEnforcement = false; // الإطفاء اليدوي يغلب التاريخ
        assert.equal(sub.isEnforced(), false);
    } finally {
        config.subscriptionEnforcement = saved.on;
        config.subscriptionStartAt = saved.start;
    }
});

test('منح أيام من الأدمن: بدون اشتراك يبدأ، والفعّال يتمدد، والمنتهي يبدأ من الحين', function () {
    var a = makeUser('g1', true);
    assert.equal(sub.grantDays(a.id, 0).error, 'invalid_days');
    assert.equal(sub.grantDays(999999999, 5).error, 'user_not_found');
    var r = sub.grantDays(a.id, 10);
    assert.equal(r.success, true);
    assert.equal(r.mode, 'new');
    var st = sub.status(a.id).subscription;
    assert.equal(st.active, true);
    assert.equal(Math.round(st.remainingMs / DAY), 10);
    assert.equal(sub.grantDays(a.id, 5).mode, 'extend');
    assert.equal(Math.round(sub.status(a.id).subscription.remainingMs / DAY), 15);
    clock += 20 * DAY; // انتهى
    assert.equal(sub.status(a.id).subscription.active, false);
    assert.equal(sub.grantDays(a.id, 3).mode, 'new');
    assert.equal(Math.round(sub.status(a.id).subscription.remainingMs / DAY), 3);
});

test('الاشتراك المفتوح: بدون نهاية، الأيام الباقية تتجمّد وترجع عند الإلغاء', function () {
    var a = makeUser('o1', true), b = makeUser('o2', true);
    var saved = config.subscriptionEnforcement;
    try {
        config.subscriptionEnforcement = true;
        sub.grantDays(a.id, 10);
        assert.equal(sub.setOpenEnded(a.id, true).success, true);
        assert.equal(sub.setOpenEnded(a.id, true).error, 'already_open');
        var st = sub.status(a.id).subscription;
        assert.equal(st.openEnded, true);
        assert.equal(st.active, true);
        assert.equal(st.canPause, false);
        assert.equal(sub.adjustDays(a.id, 5).error, 'open_ended');
        assert.equal(sub.grantDays(a.id, 5).error, 'open_ended');
        clock += 100 * DAY; // الوقت يمشي والمفتوح شغّال
        assert.equal(sub.hasActiveSubscription(a.id), true);
        // كود يتفعّل والاشتراك مفتوح: المدة تنحفظ مع المجمّد
        sub.redeem(a, gen(1));
        assert.equal(Math.round(sub.status(a.id).subscription.carryMs / DAY), 40);
        assert.equal(sub.setOpenEnded(a.id, false).success, true);
        st = sub.status(a.id).subscription;
        assert.equal(st.openEnded, false);
        assert.equal(Math.round(st.remainingMs / DAY), 40);
        assert.equal(sub.setOpenEnded(a.id, false).error, 'not_open');
        // مستخدم بدون اشتراك: المفتوح يفتح له، والإلغاء ينهيه الحين
        assert.equal(sub.setOpenEnded(b.id, true).success, true);
        assert.equal(sub.hasActiveSubscription(b.id), true);
        sub.setOpenEnded(b.id, false);
        assert.equal(sub.status(b.id).subscription.active, false);
        // إنهاء الاشتراك يلغي المفتوح
        sub.setOpenEnded(b.id, true);
        sub.endSubscription(b.id);
        assert.equal(sub.status(b.id).subscription.openEnded, false);
    } finally {
        config.subscriptionEnforcement = saved;
    }
});

test('تعويض الكل: الفعّال والمعلّق والمنتهي داخل السماح، بدون المفتوح والمنتهي قديم', function () {
    var savedGrace = config.subscriptionGraceDays;
    config.subscriptionGraceDays = 3;
    try {
        var act = makeUser('c1', true), paused = makeUser('c2', true), recent = makeUser('c3', true), old = makeUser('c4', true), open = makeUser('c5', true);
        sub.grantDays(act.id, 10);
        sub.redeem(paused, gen(1));
        sub.pause(paused);
        var pausedBefore = sub.status(paused.id).subscription.remainingMs;
        sub.grantDays(recent.id, 1);
        sub.grantDays(old.id, 1);
        sub.setOpenEnded(open.id, true);
        clock += 2 * DAY; // recent وold انتهوا قبل يوم
        sub.adjustDays(old.id, -10); // old انتهى من زمان
        assert.equal(sub.compensateAll(0).error, 'invalid_days');
        assert.equal(sub.compensateAll(31).error, 'invalid_days');
        var r = sub.compensateAll(2, 'انقطاع');
        assert.equal(r.success, true);
        assert.ok(r.count >= 3);
        assert.equal(Math.round(sub.status(act.id).subscription.remainingMs / DAY), 10); // 10 - 2 + 2
        assert.equal(Math.round((sub.status(paused.id).subscription.remainingMs - pausedBefore) / DAY), 2);
        assert.equal(sub.status(recent.id).subscription.active, true);
        assert.equal(Math.round(sub.status(recent.id).subscription.remainingMs / DAY), 2);
        assert.equal(sub.status(old.id).subscription.active, false);
        assert.equal(sub.status(open.id).subscription.openEnded, true);
        assert.equal(sub.listEvents(act.id, 1)[0].type, 'admin_compensate');
    } finally {
        config.subscriptionGraceDays = savedGrace;
    }
});
