'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Database = require('better-sqlite3');
var audio = require('./screen-audio-service');

var USER_KEY = 'AIzaUserKey_aaaaaaaaaaaaaaaaaaaa';
var PLATFORM_KEY = 'AIzaPlatformKey_bbbbbbbbbbbbbbbbbb';

function res(status, body) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
}
function ytError(status, reason) { return res(status, { error: { code: status, errors: [{ reason: reason }] } }); }

/** fetch وهمي: handler(url, opts) يرجّع رد، وكل الطلبات تنسجّل */
function fakeFetch(handler) {
    var f = function (url, opts) { f.calls.push({ url: String(url), opts: opts || {} }); return handler(String(url), opts || {}); };
    f.calls = [];
    return f;
}

function okSearch(url) {
    if (url.indexOf('/search?') !== -1) {
        return res(200, { items: [
            { id: { videoId: 'vid1' }, snippet: { title: 'الأماكن', channelTitle: 'محمد عبده' } },
            { id: { videoId: 'vid2' }, snippet: { title: 'أبعاد', channelTitle: 'محمد عبده' } }
        ] });
    }
    return res(200, { items: [
        { id: 'vid2', contentDetails: { duration: 'PT1H2S' } },
        { id: 'vid1', contentDetails: { duration: 'PT4M13S' } }
    ] });
}

function svc(opts) {
    opts = opts || {};
    var clock = { t: 1000000 };
    var s = audio.createService(new Database(':memory:'), {
        fetch: opts.fetch,
        platformYoutubeKey: opts.platformYoutubeKey === undefined ? PLATFORM_KEY : opts.platformYoutubeKey,
        ttsKey: opts.ttsKey === undefined ? 'tts_key' : opts.ttsKey,
        now: function () { return clock.t; }
    });
    s.clock = clock;
    return s;
}

test('music search: empty query and missing keys never hit the network', async function () {
    var f = fakeFetch(okSearch);
    var s = svc({ fetch: f });
    assert.deepEqual(await s.searchMusic('k1', 1, '   '), { success: false, error: 'empty_query' });
    var s2 = svc({ fetch: f, platformYoutubeKey: '' });
    assert.deepEqual(await s2.searchMusic('k1', 1, 'محمد عبده'), { success: false, error: 'disabled' });
    assert.equal(f.calls.length, 0);
});

test('music search: embeddable videos with durations, in search order, then cached', async function () {
    var f = fakeFetch(okSearch);
    var s = svc({ fetch: f });
    var r = await s.searchMusic('k1', 1, 'محمد عبده الأماكن');
    assert.equal(r.success, true);
    assert.deepEqual(r.results, [
        { id: 'vid1', title: 'الأماكن', channel: 'محمد عبده', durationSec: 253 },
        { id: 'vid2', title: 'أبعاد', channel: 'محمد عبده', durationSec: 3602 }
    ]);
    assert.match(f.calls[0].url, /videoEmbeddable=true/);
    assert.match(f.calls[0].url, /type=video/);
    assert.match(f.calls[0].url, new RegExp('key=' + PLATFORM_KEY));
    assert.match(f.calls[1].url, /\/videos\?/);
    s.clock.t += 10000;
    var again = await s.searchMusic('k2', 1, '  محمد   عبده الأماكن ');
    assert.deepEqual(again.results, r.results);
    assert.equal(f.calls.length, 2);
});

test('music search: one search every 3 seconds per screen', async function () {
    var s = svc({ fetch: fakeFetch(okSearch) });
    assert.equal((await s.searchMusic('k1', 1, 'أغنية أ')).success, true);
    s.clock.t += 1000;
    assert.deepEqual(await s.searchMusic('k1', 1, 'أغنية ب'), { success: false, error: 'rate_limited' });
    assert.equal((await s.searchMusic('k9', 1, 'أغنية ب')).success, true);
    s.clock.t += 3000;
    assert.equal((await s.searchMusic('k1', 1, 'أغنية ج')).success, true);
});

test('music search: the streamer key is used first and falls back to the platform key', async function () {
    var f = fakeFetch(function (url) {
        if (url.indexOf(USER_KEY) !== -1) return ytError(403, 'quotaExceeded');
        return okSearch(url);
    });
    var s = svc({ fetch: f });
    assert.equal(s.setUserYoutubeKey(1, USER_KEY).success, true);
    var r = await s.searchMusic('k1', 1, 'طلال مداح');
    assert.equal(r.success, true);
    assert.match(f.calls[0].url, new RegExp(USER_KEY));
    assert.match(f.calls[1].url, new RegExp(PLATFORM_KEY));

    var f2 = fakeFetch(function (url) { return url.indexOf(USER_KEY) !== -1 ? ytError(400, 'keyInvalid') : okSearch(url); });
    var s2 = svc({ fetch: f2, platformYoutubeKey: '' });
    s2.setUserYoutubeKey(1, USER_KEY);
    assert.deepEqual(await s2.searchMusic('k1', 1, 'x'), { success: false, error: 'quota' });

    var s3 = svc({ fetch: fakeFetch(function (url) { return url.indexOf(USER_KEY) !== -1 ? okSearch(url) : ytError(500, 'x'); }), platformYoutubeKey: '' });
    s3.setUserYoutubeKey(1, USER_KEY);
    assert.equal((await s3.searchMusic('k1', 1, 'y')).success, true);
});

test('music search: platform quota exhausted', async function () {
    var s = svc({ fetch: fakeFetch(function () { return ytError(403, 'quotaExceeded'); }) });
    assert.deepEqual(await s.searchMusic('k1', 1, 'عبادي'), { success: false, error: 'quota' });
});

test('streamer youtube key: validation, clear, and never exposed', function () {
    var s = svc({ fetch: fakeFetch(okSearch) });
    assert.deepEqual(s.setUserYoutubeKey(1, 'bad key!'), { success: false, error: 'invalid_key' });
    assert.equal(s.hasUserYoutubeKey(1), false);
    assert.deepEqual(s.setUserYoutubeKey(1, USER_KEY), { success: true, hasKey: true });
    assert.equal(s.hasUserYoutubeKey(1), true);
    assert.equal(s.hasUserYoutubeKey(2), false);
    assert.deepEqual(s.setUserYoutubeKey(1, null), { success: true, hasKey: false });
    assert.equal(s.hasUserYoutubeKey(1), false);
});

test('tts: Arabic standard voices, clamped rate, base64 to buffer, cached', async function () {
    var f = fakeFetch(function () { return res(200, { audioContent: Buffer.from('mp3data').toString('base64') }); });
    var s = svc({ fetch: f });
    assert.deepEqual(await s.tts('k1', '  ', 'f', 1), { success: false, error: 'empty_text' });
    assert.deepEqual(await svc({ fetch: f, ttsKey: '' }).tts('k1', 'هلا', 'f', 1), { success: false, error: 'disabled' });
    var r = await s.tts('k1', 'فهد يقول: هلا', 'm', 5);
    assert.equal(r.success, true);
    assert.equal(r.audio.toString(), 'mp3data');
    var body = JSON.parse(f.calls[0].opts.body);
    assert.equal(body.input.text, 'فهد يقول: هلا');
    assert.equal(body.voice.languageCode, 'ar-XA');
    assert.equal(body.voice.name, 'ar-XA-Standard-B');
    assert.equal(body.audioConfig.speakingRate, 2);
    assert.equal(body.audioConfig.audioEncoding, 'MP3');
    assert.match(f.calls[0].url, /texttospeech\.googleapis\.com\/v1\/text:synthesize\?key=tts_key/);
    await s.tts('k1', 'فهد يقول: هلا', 'm', 5);
    assert.equal(f.calls.length, 1);
    await s.tts('k1', 'ا'.repeat(400), 'f', 0.1);
    body = JSON.parse(f.calls[1].opts.body);
    assert.equal(body.input.text.length, 200);
    assert.equal(body.voice.name, 'ar-XA-Standard-A');
    assert.equal(body.audioConfig.speakingRate, 0.5);
});

test('music search: daily cap per streamer on the platform key only', async function () {
    var s = svc({ fetch: fakeFetch(okSearch) });
    for (var i = 0; i < audio.PLATFORM_DAILY_PER_USER; i++) {
        s.clock.t += 4000;
        assert.equal((await s.searchMusic('k1', 1, 'q' + i)).success, true);
    }
    s.clock.t += 4000;
    assert.deepEqual(await s.searchMusic('k1', 1, 'one more'), { success: false, error: 'quota' });
    assert.equal((await s.searchMusic('k2', 2, 'other streamer')).success, true);
    s.setUserYoutubeKey(1, USER_KEY);
    s.clock.t += 4000;
    assert.equal((await s.searchMusic('k1', 1, 'own key')).success, true);
    s.setUserYoutubeKey(1, null);
    s.clock.t += 24 * 3600 * 1000;
    assert.equal((await s.searchMusic('k1', 1, 'next day')).success, true);
});

test('tts: per-screen limit of requests per minute (cache hits are free)', async function () {
    var f = fakeFetch(function () { return res(200, { audioContent: Buffer.from('x').toString('base64') }); });
    var s = svc({ fetch: f });
    for (var i = 0; i < audio.TTS_PER_MINUTE; i++) assert.equal((await s.tts('k1', 'رسالة ' + i, 'f', 1)).success, true);
    assert.deepEqual(await s.tts('k1', 'رسالة زيادة', 'f', 1), { success: false, error: 'rate_limited' });
    assert.equal((await s.tts('k1', 'رسالة 0', 'f', 1)).success, true);   // من الكاش
    assert.equal((await s.tts('k2', 'شاشة ثانية', 'f', 1)).success, true);
    s.clock.t += 61000;
    assert.equal((await s.tts('k1', 'بعد دقيقة', 'f', 1)).success, true);
});

test('youtubeId: every common link form, and plain names are not links', function () {
    var id = 'dQw4w9WgXcQ';
    ['https://www.youtube.com/watch?v=' + id, 'youtube.com/watch?feature=share&v=' + id + '&t=10', 'https://youtu.be/' + id + '?si=abc',
        'https://m.youtube.com/shorts/' + id, 'https://music.youtube.com/watch?v=' + id + '&list=RD', 'شغل https://youtu.be/' + id + ' لو سمحت']
        .forEach(function (u) { assert.equal(audio.youtubeId(u), id, u); });
    assert.equal(audio.youtubeId('محمد عبده الأماكن'), null);
    assert.equal(audio.youtubeId('dQw4w9WgXcQ'), null);
    assert.equal(audio.youtubeId('https://youtube.com/watch?v=short'), null);
});

test('music link: one cheap videos call (not counted in the daily cap), embeddable only, then cached', async function () {
    var f = fakeFetch(function (url) {
        if (url.indexOf('/videos?') !== -1 && url.indexOf('id=dQw4w9WgXcQ') !== -1) {
            return res(200, { items: [{ id: 'dQw4w9WgXcQ', snippet: { title: 'أغنية', channelTitle: 'قناة' }, contentDetails: { duration: 'PT3M33S' }, status: { embeddable: true } }] });
        }
        if (url.indexOf('/videos?') !== -1) return res(200, { items: [{ id: 'xxxxxxxxxxx', snippet: { title: 'x' }, contentDetails: { duration: 'PT1M' }, status: { embeddable: false } }] });
        return res(500, {});
    });
    var s = svc({ fetch: f });
    var r = await s.searchMusic('k1', 1, 'https://youtu.be/dQw4w9WgXcQ');
    assert.deepEqual(r, { success: true, results: [{ id: 'dQw4w9WgXcQ', title: 'أغنية', channel: 'قناة', durationSec: 213 }] });
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].url, /part=snippet,contentDetails,status/);
    assert.doesNotMatch(f.calls[0].url, /\/search\?/);
    s.clock.t += 5000;
    assert.deepEqual((await s.searchMusic('k2', 1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).results, r.results);
    assert.equal(f.calls.length, 1, 'same video by another link = cache');
    s.clock.t += 5000;
    assert.deepEqual((await s.searchMusic('k1', 1, 'https://youtu.be/xxxxxxxxxxx')).results, [], 'not embeddable');
    // الروابط ما تنحسب من حد الستريمر اليومي (25)
    for (var i = 0; i < 30; i++) { s.clock.t += 5000; await s.searchMusic('k1', 7, 'https://youtu.be/' + ('a' + i + 'bcdefghijk').slice(0, 11)); }
    s.clock.t += 5000;
    await s.searchMusic('k1', 7, 'اسم أغنية');
    assert.ok(f.calls.some(function (c) { return c.url.indexOf('/search?') !== -1; }), 'name search still allowed after 30 links');
});

test('music link: keys out of quota → free oEmbed (no duration, marked link); no keys at all still works', async function () {
    var f = fakeFetch(function (url) {
        if (url.indexOf('/videos?') !== -1) return ytError(403, 'quotaExceeded');
        if (url.indexOf('youtube.com/oembed') !== -1) return res(200, { title: 'بالرابط', author_name: 'قناة' });
        return res(500, {});
    });
    var s = svc({ fetch: f });
    var r = await s.searchMusic('k1', 1, 'https://youtu.be/dQw4w9WgXcQ');
    assert.deepEqual(r, { success: true, results: [{ id: 'dQw4w9WgXcQ', title: 'بالرابط', channel: 'قناة', durationSec: 0, link: true }] });
    assert.match(f.calls[f.calls.length - 1].url, /oembed\?format=json&url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3DdQw4w9WgXcQ/);
    var f2 = fakeFetch(function (url) { return url.indexOf('oembed') !== -1 ? res(401, {}) : res(500, {}); });
    var s2 = svc({ fetch: f2, platformYoutubeKey: '' });
    assert.deepEqual(await s2.searchMusic('k1', 1, 'https://youtu.be/dQw4w9WgXcQ'), { success: true, results: [] }, 'oEmbed 401 = embedding disabled');
    assert.equal(f2.calls.length, 1);
});

test('music search: persistent shared cache survives a restart (same db), expires after 30 days', async function () {
    var db = new Database(':memory:');
    var clock = { t: 1000000 };
    var f = fakeFetch(okSearch);
    function make() { return audio.createService(db, { fetch: f, platformYoutubeKey: PLATFORM_KEY, now: function () { return clock.t; } }); }
    var a = make();
    var r = await a.searchMusic('k1', 1, 'محمد عبده الأماكن');
    assert.equal(f.calls.length, 2);
    var b = make(); // «إعادة تشغيل»: ذاكرة جديدة، نفس الداتابيس
    clock.t += 3600 * 1000;
    assert.deepEqual((await b.searchMusic('other-screen', 99, 'محمد عبده الأماكن')).results, r.results);
    assert.equal(f.calls.length, 2, 'another streamer, after restart, no quota used');
    var c = make();
    clock.t += 31 * 24 * 3600 * 1000;
    await c.searchMusic('k1', 1, 'محمد عبده الأماكن');
    assert.equal(f.calls.length, 4, 'expired after 30 days');
});
