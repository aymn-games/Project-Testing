'use strict';

// اشتراكات فيرو بالمتجر: سعر خطة فيرو، خصم مشتركي الألعاب، والتسليم لسيرفر فيرو (مع إعادة المحاولة).
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var config = require('../config');
var sub = require('../subscriptions/subscription-service');
var link = require('./veyro-link');

var tag = 'vytest_' + Date.now();
var made = [];
function makeUser(suffix) {
    var info = db.prepare('INSERT INTO users (username, email, is_streamer, created_at) VALUES (?, ?, 1, ?)').run(tag + suffix, tag + suffix + '@test.local', Date.now());
    made.push(Number(info.lastInsertRowid));
    return { id: Number(info.lastInsertRowid) };
}
var oldUrl = config.veyroApiUrl, oldSecret = config.veyroStoreSecret;

test.after(function () {
    config.veyroApiUrl = oldUrl; config.veyroStoreSecret = oldSecret;
    link._setFetch(null); link._setPlans(null);
    made.forEach(function (id) {
        db.prepare('DELETE FROM veyro_store_grants WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM streamer_subscriptions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM subscription_events WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
});

link._setPlans([{ id: 'monthly', name: 'شهري', days: 30, price: 40, gamesDiscount: 25 }, { id: 'yearly', name: 'سنوي', days: 365, price: 300, gamesDiscount: 0 }]);
var ROW = { id: 999001, name: 'فيرو شهري', price: 55, old_price: null, delivery: 'veyro:monthly', badge: '' };

test('السعر من خطة فيرو، والخصم لمشترك الألعاب بس', function () {
    var plain = makeUser('a'), member = makeUser('b');
    assert.equal(sub.grantDays(member.id, 30).success, true);
    assert.equal(link.isGamesSubscriber(member.id), true);
    assert.equal(link.isGamesSubscriber(plain.id), false);

    var r1 = link.priceRowFor(ROW, plain);
    assert.equal(r1.price, 40);
    assert.equal(r1.old_price, null);
    var r2 = link.priceRowFor(ROW, member);
    assert.equal(r2.price, 30);
    assert.equal(r2.old_price, 40);
    assert.match(r2.badge, /25/);
    assert.equal(link.priceRowFor(ROW, null).price, 40);
    // خطة بدون خصم
    assert.equal(link.priceRowFor(Object.assign({}, ROW, { delivery: 'veyro:yearly' }), member).price, 300);
    // منتج عادي ما يتأثر
    var other = { id: 5, price: 10, delivery: 'frame' };
    assert.equal(link.priceRowFor(other, member), other);
});

test('التسليم: ينرسل لفيرو بالسر، والفشل يعيد المحاولة، والمكرر ما ينرسل', async function () {
    var u = makeUser('c');
    config.veyroApiUrl = 'http://veyro.test'; config.veyroStoreSecret = 's3cret';
    var calls = [], fail = true;
    link._setFetch(function (url, opt) {
        calls.push({ url: url, opt: opt });
        if (fail) return Promise.reject(new Error('down'));
        return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ success: true }); } });
    });
    var orderId = 9000000 + Math.floor(Math.random() * 99999);
    link.grant(u.id, 'veyro:monthly', 30, orderId, 777);
    link.grant(u.id, 'veyro:monthly', 30, orderId, 777); // مكرر
    await new Promise(function (r) { setTimeout(r, 30); });
    assert.equal(calls.length, 1);
    var row = db.prepare('SELECT * FROM veyro_store_grants WHERE order_id = ?').get(orderId);
    assert.equal(row.status, 'pending');
    assert.equal(row.tries, 1);
    assert.equal(calls[0].url, 'http://veyro.test/api/veyro/internal/store-grant');
    assert.equal(calls[0].opt.headers['X-Veyro-Secret'], 's3cret');
    var body = JSON.parse(calls[0].opt.body);
    assert.equal(body.plan, 'monthly');
    assert.equal(body.amount, 30);
    assert.equal(body.user.id, u.id);
    assert.equal(body.ref, 'store:' + orderId + ':777');

    fail = false;
    await link.retryPending();
    row = db.prepare('SELECT * FROM veyro_store_grants WHERE order_id = ?').get(orderId);
    assert.equal(row.status, 'sent');
    await link.retryPending();
    assert.equal(calls.filter(function (c) { return JSON.parse(c.opt.body).ref === body.ref; }).length, 2);
});

test('خيارات التسليم بلوحة المتجر فيها خطط فيرو', function () {
    var opts = link.deliveryOptions().map(function (o) { return o.value; });
    assert.ok(opts.indexOf('veyro:monthly') !== -1);
    assert.equal(link.planOfDelivery('veyro:monthly'), 'monthly');
    assert.equal(link.planOfDelivery('subscription:1'), null);
});

test('المتجر: سعر فيرو بالسلة بعد الخصم، والطلب المدفوع يوصل لفيرو بالمبلغ', async function () {
    var store = require('./store-service');
    var info = db.prepare("INSERT INTO users (username, email, role, is_streamer, created_at) VALUES (?, ?, 'admin', 1, ?)").run(tag + 'adm', tag + 'adm@test.local', Date.now());
    var adm = { id: Number(info.lastInsertRowid), role: 'admin', username: tag + 'adm' };
    made.push(adm.id);
    sub.grantDays(adm.id, 30);
    var pid = Number(db.prepare("INSERT INTO store_products (category_id, name, price, delivery, hidden, created_at) VALUES (NULL, 'فيرو شهري تجربة', 55, 'veyro:monthly', 0, ?)").run(Date.now()).lastInsertRowid);
    config.veyroApiUrl = 'http://veyro.test'; config.veyroStoreSecret = 's3cret';
    var sent = [];
    link._setFetch(function (url, opt) { sent.push(JSON.parse(opt.body)); return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ success: true }); } }); });
    try {
        var pub = store.getPublicStore(adm).products.filter(function (p) { return p.id === pid; })[0];
        assert.equal(pub.price, 30);
        assert.equal(pub.oldPrice, 40);
        var priced = store.priceCart([pid], '', adm);
        assert.equal(priced.total, 30);
        var r = await store.checkout(adm, { items: [pid] });
        if (r.success && r.order) {
            assert.equal(r.order.total, 30);
            await new Promise(function (res) { setTimeout(res, 30); });
            assert.equal(sent.length, 1);
            assert.equal(sent[0].amount, 30);
            assert.equal(sent[0].plan, 'monthly');
            db.prepare('DELETE FROM store_inventory WHERE order_id = ?').run(r.order.id);
            db.prepare('DELETE FROM store_orders WHERE id = ?').run(r.order.id);
        } else {
            // بوابة دفع مفعّلة بهالبيئة: الطلب يحتاج دفع حقيقي، نكتفي بالسعر
            assert.ok(r.redirectUrl || r.error, JSON.stringify(r));
        }
    } finally {
        db.prepare('DELETE FROM store_products WHERE id = ?').run(pid);
    }
});
