'use strict';

// المجمّع المشترك: المشترك اللي ينضم لاتصال مفتوح ياخذ الحالة وآخر عدد مشاهدين على طول
var test = require('node:test');
var assert = require('node:assert/strict');
var path = require('node:path');

// موصِّل وهمي بدل tiktok-connector (بدون تيك توك ولا قاعدة بيانات): نحتفظ بالـcallbacks عشان نطلق الأحداث بنفسنا
var fakes = [];
var connPath = path.join(__dirname, 'tiktok-connector.js');
require.cache[connPath] = { id: connPath, filename: connPath, loaded: true, exports: { createTikTokConnector: null } };
require.cache[connPath].exports.createTikTokConnector = function () {
    var f = { cbs: null, connect: function (o, cbs) { f.cbs = cbs; }, disconnect: function () {}, isConnected: function () { return true; }, isActive: function () { return true; }, getRoomId: function () { return 'room1'; } };
    fakes.push(f);
    return f;
};
var pool = require('./shared-connection-pool');

function recorder() {
    var r = { statuses: [], viewers: [] };
    r.cbs = { onStatus: function (s) { r.statuses.push(s); }, onViewerUpdate: function (d) { r.viewers.push(d.current); } };
    return r;
}
function tick() { return new Promise(function (res) { setImmediate(res); }); }

test('المنضم لاتصال مفتوح ياخذ آخر عدد مشاهدين', async function () {
    var a = recorder(), b = recorder();
    var la = pool.createLease({ source: 'game:test' }), lb = pool.createLease({ source: 'overlay' });
    la.connect({ username: 'Viewers_Test', statsOnly: true }, a.cbs);
    var real = fakes[fakes.length - 1];
    real.cbs.onStatus('connected');
    real.cbs.onViewerUpdate({ current: 37, totalUsers: 120 });
    assert.deepEqual(a.viewers, [37]);

    lb.connect({ username: 'viewers_test', statsOnly: true }, b.cbs);
    await tick();
    assert.deepEqual(b.statuses, ['connected']);
    assert.deepEqual(b.viewers, [37]);   // قبل الإصلاح كانت فاضية لين التحديث الجاي

    real.cbs.onViewerUpdate({ current: 40, totalUsers: 130 });
    assert.deepEqual(b.viewers, [37, 40]);
    la.disconnect(); lb.disconnect();
});

test('بدون عدد مشاهدين سابق ما يرسل شي', async function () {
    var a = recorder(), b = recorder();
    var la = pool.createLease({ source: 'game:test' }), lb = pool.createLease({ source: 'overlay' });
    la.connect({ username: 'no_viewers_yet', statsOnly: true }, a.cbs);
    fakes[fakes.length - 1].cbs.onStatus('connected');
    lb.connect({ username: 'no_viewers_yet', statsOnly: true }, b.cbs);
    await tick();
    assert.deepEqual(b.statuses, ['connected']);
    assert.deepEqual(b.viewers, []);
    la.disconnect(); lb.disconnect();
});
