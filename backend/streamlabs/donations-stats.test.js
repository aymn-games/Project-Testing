'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var mergeDonations = require('./donations-stats').mergeDonations;

var summary = {
    donors: [{ name: 'نوره', amount: 20, count: 1 }, { name: 'فهد', amount: 15.5, count: 2 }, { name: 'سعد', amount: 5, count: 1 }, { name: 'ريم', amount: 1, count: 1 }],
    total: 41.5,
    lastDonation: { name: 'فهد', amount: 5.5, currency: 'USD', message: 'كفو', at: 5 }
};

test('mergeDonations: builds stats when there is no live session', function () {
    var r = mergeDonations(null, summary, 3);
    assert.equal(r.sections.donors.length, 3);
    assert.deepEqual(r.sections.donors[0], { name: 'نوره', amount: 20, count: 1 });
    assert.equal(r.totals.donations, 41.5);
    assert.equal(r.totals.lastDonation.name, 'فهد');
});

test('mergeDonations: keeps the stream stats and adds donations', function () {
    var stats = { sections: { likers: [{ name: 'x', count: 3 }] }, totals: { likes: 3 }, live: true };
    var r = mergeDonations(stats, summary, 0);
    assert.equal(r.sections.likers.length, 1);
    assert.equal('donors' in r.sections, false);
    assert.equal(r.totals.likes, 3);
    assert.equal(r.totals.donations, 41.5);
    assert.equal(r.live, true);
});
