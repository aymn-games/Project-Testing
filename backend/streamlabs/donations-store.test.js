'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var storeMod = require('./donations-store');

function mk() {
    var clock = { t: 1000000 };
    var s = storeMod.createStore(new Database(':memory:'), { now: function () { return clock.t; } });
    s.clock = clock;
    return s;
}

test('toCents: numbers and strings to integer cents', function () {
    var c = storeMod.toCents;
    assert.equal(c(25), 2500);
    assert.equal(c('25.00'), 2500);
    assert.equal(c('1,000.5'), 100050);
    assert.equal(c('0.99'), 99);
    assert.equal(c(0.1 + 0.2), 30);
    assert.equal(c(-5), null);
    assert.equal(c('abc'), null);
    assert.equal(c(0), null);
});

test('addDonation: the same Streamlabs id is stored once per streamer', function () {
    var s = mk();
    var a = s.addDonation(1, { slId: 'x1', name: 'فهد', amount: 10, currency: 'USD' });
    assert.equal(a.amountCents, 1000);
    assert.equal(s.addDonation(1, { slId: 'x1', name: 'فهد', amount: 10, currency: 'USD' }), null);
    assert.ok(s.addDonation(2, { slId: 'x1', name: 'فهد', amount: 10, currency: 'USD' }));
    assert.equal(s.addDonation(1, { slId: '', name: 'x', amount: 5 }), null);
    assert.equal(s.addDonation(1, { slId: 'x9', name: 'x', amount: 'bad' }), null);
    assert.equal(s.list(1, 50).length, 1);
});

test('summary: USD non-test only, grouped by name, newest last donation', function () {
    var s = mk();
    s.addDonation(1, { slId: 'a', name: 'فهد', amount: 10, currency: 'USD' }); s.clock.t += 10;
    s.addDonation(1, { slId: 'b', name: 'نوره', amount: '20', currency: 'usd' }); s.clock.t += 10;
    s.addDonation(1, { slId: 'c', name: 'فهد', amount: 5.5, currency: 'USD', message: 'كفو' }); s.clock.t += 10;
    s.addDonation(1, { slId: 'd', name: 'تجربة', amount: 100, currency: 'USD', isTest: true }); s.clock.t += 10;
    s.addDonation(1, { slId: 'e', name: 'يورو', amount: 50, currency: 'EUR' });
    var r = s.summary(1, 0, 10);
    assert.deepEqual(r.donors, [{ name: 'نوره', amount: 20, count: 1 }, { name: 'فهد', amount: 15.5, count: 2 }]);
    assert.equal(r.total, 35.5);
    assert.equal(r.lastDonation.name, 'فهد');
    assert.equal(r.lastDonation.amount, 5.5);
    assert.equal(r.lastDonation.message, 'كفو');
    assert.equal(s.summary(1, 0, 1).donors.length, 1);
    assert.equal(s.list(1, 50).length, 5);
    assert.equal(s.list(1, 50)[0].slId, 'e');
});

test('links: save, reset window, auto reset, remove keeps donations', function () {
    var s = mk();
    s.saveLink(1, 'tok_abc');
    var l = s.getLink(1);
    assert.equal(l.token, 'tok_abc');
    assert.equal(l.status, 'connecting');
    assert.equal(l.counterFrom, 1000000);
    s.clock.t += 100;
    s.addDonation(1, { slId: 'a', name: 'فهد', amount: 10, currency: 'USD' });
    s.clock.t += 100;
    s.reset(1);
    assert.equal(s.summary(1, s.effectiveFrom(s.getLink(1), null), 10).total, 0);
    assert.equal(s.list(1, 10).length, 1);
    var link = s.getLink(1);
    assert.equal(s.effectiveFrom(link, link.counterFrom + 50), link.counterFrom);
    s.setAutoReset(1, true);
    link = s.getLink(1);
    assert.equal(s.effectiveFrom(link, link.counterFrom + 50), link.counterFrom + 50);
    assert.equal(s.effectiveFrom(link, link.counterFrom - 50), link.counterFrom);
    s.setStatus(1, 'invalid_token', 'Unauthorized');
    assert.equal(s.getLink(1).status, 'invalid_token');
    assert.equal(s.allLinks().length, 1);
    s.removeLink(1);
    assert.equal(s.getLink(1), null);
    assert.equal(s.list(1, 10).length, 1);
});
