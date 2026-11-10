'use strict';

var test = require('node:test');
var assert = require('node:assert');
var Database = require('better-sqlite3');
var giftCatalog = require('./gift-catalog');

function make(t0) {
    var clock = { t: t0 || 1000000 };
    var c = giftCatalog.createCatalog(new Database(':memory:'), { now: function () { return clock.t; } });
    return { c: c, clock: clock };
}

test('normalizeGift: يقرأ شكل تيك توك (snake_case) وشكل المكتبة (camelCase)', function () {
    assert.deepStrictEqual(giftCatalog.normalizeGift({ id: 5655, name: 'Rose', diamond_count: 1, image: { url_list: ['http://x', 'https://p16.tiktokcdn.com/rose.png'] } }),
        { id: '5655', name: 'Rose', diamonds: 1, image: 'https://p16.tiktokcdn.com/rose.png' });
    assert.deepStrictEqual(giftCatalog.normalizeGift({ giftId: '6064', giftName: 'GG', diamondCount: 1, icon: { urlList: ['https://a/gg.png'] } }),
        { id: '6064', name: 'GG', diamonds: 1, image: 'https://a/gg.png' });
    assert.strictEqual(giftCatalog.normalizeGift({ id: 'abc', name: 'x' }), null);
    assert.strictEqual(giftCatalog.normalizeGift({ id: 1 }), null);
});

test('saveList + list: مرتبة بالسعر، ورسمية', function () {
    var m = make();
    assert.strictEqual(m.c.saveList([
        { id: 2, name: 'Lion', diamond_count: 29999, image: { url_list: ['https://a/lion.png'] } },
        { id: 1, name: 'Rose', diamond_count: 1 },
        { name: 'broken' }
    ]), 2);
    var l = m.c.list();
    assert.deepStrictEqual(l.map(function (g) { return g.name; }), ['Rose', 'Lion']);
    assert.strictEqual(l[1].image, 'https://a/lion.png');
    assert.strictEqual(l[0].official, true);
});

test('noteGift: هدية من البث تنضاف، وما تمسح صورة أو سعر معروف', function () {
    var m = make();
    m.c.saveList([{ id: 7, name: 'Galaxy', diamond_count: 1000, image: { url_list: ['https://a/g.png'] } }]);
    assert.strictEqual(m.c.noteGift({ giftId: 7, giftName: 'Galaxy', giftValue: 0, giftImage: null }), true);
    assert.deepStrictEqual(m.c.get('7'), { id: '7', name: 'Galaxy', diamonds: 1000, image: 'https://a/g.png' });
    assert.strictEqual(m.c.noteGift({ giftId: 9, giftName: 'Heart', giftValue: 5, giftImage: 'https://a/h.png' }), true);
    assert.strictEqual(m.c.noteGift({ giftId: 9, giftName: 'Heart', giftValue: 5, giftImage: 'https://a/h.png' }), false, 'نفس الهدية ما تنكتب مرتين');
    var heart = m.c.list().filter(function (g) { return g.id === '9'; })[0];
    assert.strictEqual(heart.official, false);
    assert.strictEqual(m.c.get('nope'), null);
});

test('refreshWith: مرة باليوم، وبعد فشل تستنى 3 ساعات', async function () {
    var m = make();
    var calls = 0;
    function fetchOk() { calls++; return Promise.resolve([{ id: 1, name: 'Rose', diamond_count: 1 }]); }
    assert.strictEqual(await m.c.refreshWith(fetchOk), 1);
    assert.strictEqual(await m.c.refreshWith(fetchOk), 0, 'نفس اليوم ما يطلب مرة ثانية');
    assert.strictEqual(calls, 1);
    m.clock.t += 25 * 3600 * 1000;
    assert.strictEqual(await m.c.refreshWith(function () { calls++; return Promise.reject(new Error('rate')); }), 0);
    m.clock.t += 3600 * 1000;
    assert.strictEqual(m.c.shouldRefresh(), false, 'بعد الفشل بساعة لسا ما يعيد');
    m.clock.t += 3 * 3600 * 1000;
    assert.strictEqual(m.c.shouldRefresh(), true);
    assert.strictEqual(m.c.listUpdatedAt(), 1000000);
});
