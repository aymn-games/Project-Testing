'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var createWatcher = require('./screen-audio-watcher').createWatcher;

function setup(opts) {
    opts = opts || {};
    var st = {
        seen: opts.seen || ['k1'],
        screens: opts.screens || { k1: { userId: 1, design: { items: [{ type: 'music' }] } } },
        owners: { 1: 'Streamer_One' },
        live: opts.live === undefined ? true : opts.live,
        statsWatched: opts.statsWatched || [],
        connectors: [],
        watching: {},
        attached: []
    };
    var w = createWatcher({
        seenKeys: function () { return st.seen.slice(); },
        findByKey: function (k) { return st.screens[k] || null; },
        ownerTikTok: function (id) { return st.owners[id] || null; },
        isLive: function () { return Promise.resolve(st.live); },
        statsWatcherActive: function (u) { return st.statsWatched.indexOf(u) !== -1; },
        createConnector: function () {
            var c = { callbacks: null, disconnected: false,
                connect: function (o, cb) { c.options = o; c.callbacks = cb; },
                disconnect: function () { c.disconnected = true; },
                getRoomId: function () { return 'room1'; } };
            st.connectors.push(c);
            return c;
        },
        stats: {
            WATCH_PREFIX: 'watch:',
            setWatching: function (u, on) { st.watching[u] = on; },
            attach: function (u, room, id) { st.attached.push([u, room, id]); },
            markEnded: function () {},
            recordComment: function () {}, recordGift: function () {}, recordFollow: function () {}, recordViewers: function () {},
            recordLike: function () {}, recordShare: function () {}, recordMember: function () {}, recordSubscribe: function () {}
        },
        gapMs: 0,
        autoAudio: opts.autoAudio
    });
    return { w: w, st: st };
}

test('audio watcher: connects once for an open audio screen of a live streamer', async function () {
    var t = setup();
    await t.w.tick();
    assert.deepEqual(t.w.active(), ['streamer_one']);
    assert.equal(t.st.connectors.length, 1);
    assert.equal(t.st.connectors[0].options.username, 'streamer_one');
    assert.equal(t.st.connectors[0].options.statsOnly, true);
    assert.equal(t.st.watching.streamer_one, true);
    t.st.connectors[0].callbacks.onStatus('connected');
    assert.equal(t.st.attached[0][0], 'streamer_one');
    assert.match(t.st.attached[0][2], /^watch:audio:streamer_one:/);
    await t.w.tick();
    assert.equal(t.st.connectors.length, 1);
});

test('audio watcher: no connection without audio tools, offline, or a stats watcher', async function () {
    var a = setup({ screens: { k1: { userId: 1, design: { items: [{ type: 'text' }] } } } });
    await a.w.tick();
    assert.equal(a.st.connectors.length, 0);
    var b = setup({ live: false });
    await b.w.tick();
    assert.equal(b.st.connectors.length, 0);
    var c = setup({ statsWatched: ['streamer_one'] });
    await c.w.tick();
    assert.equal(c.st.connectors.length, 0);
});

test('audio watcher: disconnects when the screen closes or the stream ends', async function () {
    var t = setup();
    await t.w.tick();
    t.st.seen = [];
    await t.w.tick();
    assert.equal(t.st.connectors[0].disconnected, true);
    assert.deepEqual(t.w.active(), []);
    assert.equal(t.st.watching.streamer_one, false);

    var e = setup();
    await e.w.tick();
    e.st.connectors[0].callbacks.onStatus('ended');
    assert.deepEqual(e.w.active(), []);
});

test('manual connect: connects without any open screen and stays until the stream ends', async function () {
    var t = setup({ seen: [] });
    var r = t.w.connectManual('Streamer_One');
    assert.equal(r.state, 'connecting');
    assert.equal(t.st.connectors.length, 1);
    assert.equal(t.w.status('streamer_one'), 'connecting');
    t.st.connectors[0].callbacks.onStatus('connected');
    assert.equal(t.w.status('streamer_one'), 'connected');
    await t.w.tick(); // ما فيه شاشة مفتوحة — الاتصال اليدوي يبقى
    assert.equal(t.st.connectors[0].disconnected, false);
    assert.equal(t.w.connectManual('streamer_one').state, 'connected'); // ما يفتح اتصال ثاني
    assert.equal(t.st.connectors.length, 1);
    t.st.connectors[0].callbacks.onStatus('ended');
    assert.equal(t.w.status('streamer_one'), 'idle');
    await t.w.tick();
    assert.equal(t.st.connectors.length, 1); // ما يرجع يتصل بعد نهاية البث
});

test('manual connect: disconnect stops it, and an offline stream drops the request', async function () {
    var t = setup({ seen: [] });
    t.w.connectManual('streamer_one');
    t.w.disconnectManual('streamer_one');
    assert.equal(t.st.connectors[0].disconnected, true);
    assert.equal(t.w.status('streamer_one'), 'idle');
    await t.w.tick();
    assert.equal(t.st.connectors.length, 1);

    var o = setup({ seen: [], live: false });
    o.w.connectManual('streamer_one');
    o.st.connectors[0].callbacks.onStatus('error');
    await o.w.tick(); // مو يبث → الطلب ينشال، ما يعيد المحاولة
    await o.w.tick();
    assert.equal(o.st.connectors.length, 1);
    assert.equal(o.w.status('streamer_one'), 'idle');
});

test('manual connect: a stats-watched streamer reports connected without a second connection', function () {
    var t = setup({ seen: [], statsWatched: ['streamer_one'] });
    assert.equal(t.w.connectManual('streamer_one').state, 'connected');
    assert.equal(t.st.connectors.length, 0);
});

test('audio auto-connect can be turned off while manual connect still works', async function () {
    var t = setup({ autoAudio: false });
    await t.w.tick();
    assert.equal(t.st.connectors.length, 0);
    t.w.connectManual('streamer_one');
    assert.equal(t.st.connectors.length, 1);
});
