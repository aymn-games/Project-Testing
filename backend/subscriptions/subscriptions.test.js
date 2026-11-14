'use strict';

// الاشتراكات: أكواد (نفس خانة استرداد الإطارات) + التمديد والترقية + التسليم من المتجر.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var subs = require('./subscriptions-service');
var collectibles = require('../collectibles/collectibles-service');

var DAY = 24 * 60 * 60 * 1000;
var tag = 'subtest_' + Date.now();
var made = [];
function makeUser(suffix) {
    var info = db.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(tag + suffix, tag + suffix + '@test.local', Date.now());
    return Number(info.lastInsertRowid);
}
function cleanup(userIds, codes) {
    userIds.forEach(function (id) { db.prepare('DELETE FROM user_subscriptions WHERE user_id = ?').run(id); db.prepare('DELETE FROM users WHERE id = ?').run(id); });
    (codes || []).forEach(function (c) { db.prepare('DELETE FROM subscription_codes WHERE code = ?').run(c); });
}

test('كود اشتراك ينسترد من خانة أكواد الإطارات ويتفعّل', function () {
    var u = makeUser('a');
    var gen = subs.generateCodes('gold', 30, 2, 'test');
    try {
        assert.equal(gen.success, true);
        assert.equal(gen.codes.length, 2);
        assert.match(gen.codes[0], /^AGP-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        assert.equal(subs.getSubscription(u), null);
        assert.equal(subs.hasTier(u, 'silver'), false);

        var r = collectibles.redeemFrameCode(u, gen.codes[0].toLowerCase().replace(/-/g, ' '));
        assert.equal(r.success, true);
        assert.equal(r.kind, 'subscription');
        var s = subs.getSubscription(u);
        assert.equal(s.tier, 'gold');
        assert.equal(s.daysLeft, 30);
        assert.equal(subs.hasTier(u, 'silver'), true);
        assert.equal(subs.hasTier(u, 'gold'), true);
        assert.equal(subs.hasTier(u, 'diamond'), false);

        // نفس الكود مرة ثانية مرفوض
        assert.equal(collectibles.redeemFrameCode(u, gen.codes[0]).error, 'code_used');
        // كود ثاني بنفس المستوى يمدد فوق المتبقي
        assert.equal(collectibles.redeemFrameCode(u, gen.codes[1]).success, true);
        assert.equal(subs.getSubscription(u).daysLeft, 60);
        // يطلع بقائمة أكواد الأدمن
        assert.ok(collectibles.listFrameCodes(2000).some(function (c) { return c.code === gen.codes[0] && c.kind === 'subscription' && c.redeemedBy === u; }));
    } finally { cleanup([u], gen.codes); }
});

test('الترقية تنقل للمستوى الأعلى، والأقل يُرفض والكود يبقى صالح', function () {
    var u = makeUser('b');
    var low = subs.generateCodes('silver', 30, 1).codes;
    try {
        subs.grant(u, 'diamond', 10, 'test');
        var r = collectibles.redeemFrameCode(u, low[0]);
        assert.equal(r.success, false);
        assert.equal(r.error, 'higher_tier_active');
        assert.equal(db.prepare('SELECT redeemed_at FROM subscription_codes WHERE code = ?').get(low[0]).redeemed_at, null);

        db.prepare('DELETE FROM user_subscriptions WHERE user_id = ?').run(u);
        subs.grant(u, 'silver', 5, 'test');
        assert.equal(subs.grant(u, 'gold', 30, 'test').success, true);
        var s = subs.getSubscription(u);
        assert.equal(s.tier, 'gold');
        assert.equal(s.daysLeft, 35);
    } finally { cleanup([u], low); }
});

test('الاشتراك المنتهي = ما فيه اشتراك، والكود المحروق ما ينفع', function () {
    var u = makeUser('c');
    var codes = subs.generateCodes('silver', 30, 1).codes;
    try {
        db.prepare('INSERT INTO user_subscriptions (user_id, tier, expires_at, source, updated_at) VALUES (?, ?, ?, ?, ?)').run(u, 'diamond', Date.now() - DAY, 'test', Date.now());
        assert.equal(subs.getSubscription(u), null);
        assert.equal(collectibles.burnCode(codes[0]).success, true);
        assert.equal(collectibles.redeemFrameCode(u, codes[0]).error, 'code_burned');
        // بعد انتهاء الماسي، الفضي يبدأ من اليوم
        assert.equal(subs.grant(u, 'silver', 30, 'test').subscription.daysLeft, 30);
    } finally { cleanup([u], codes); }
});

test('مدخلات غلط مرفوضة', function () {
    assert.equal(subs.generateCodes('platinum', 30, 1).error, 'invalid_tier');
    assert.equal(subs.generateCodes('gold', 0, 1).error, 'invalid_days');
    assert.equal(subs.generateCodes('gold', 30, 501).error, 'invalid_count');
});
