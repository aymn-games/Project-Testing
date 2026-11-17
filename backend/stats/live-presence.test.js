'use strict';

// «البثوث الشغّالة» لألعاب الباركود (المافيا…): عدد المشاهدين ينجاب من صفحة البث بنفس فحص «هل يبث؟»
var test = require('node:test');
var assert = require('node:assert/strict');
var liveCheck = require('../platforms/tiktok/tiktok-live-check');
var presence = require('./live-presence');

// مكتبة تيك توك وهمية: html = اللي ترجعه صفحة البث (أو خطأ)، isLive = نتيجة fetchIsLive الاحتياطية
function fakeLib(html, isLive) {
    var calls = { html: 0, isLive: 0 };
    liveCheck._setLib({
        TikTokLiveConnection: function () { this.webClient = {}; this.fetchIsLive = function () { calls.isLive++; return isLive instanceof Error ? Promise.reject(isLive) : Promise.resolve(isLive); }; },
        fetchRoomInfoFromHtmlRoute: function () { calls.html++; return html instanceof Error ? Promise.reject(html) : Promise.resolve(html); }
    });
    liveCheck._clearCache(); presence._clear();
    return calls;
}
var USER = { id: 7, custom_id: 'A7', tiktok_verified: true, tiktok_username: '@Streamer_One' };

test('يبث: الحالة وعدد المشاهدين من صفحة البث بطلب واحد', async function () {
    var calls = fakeLib({ liveRoom: { status: 2, liveRoomStats: { userCount: 123 } } }, true);
    var r = await presence.report(USER, 'mafia');
    assert.equal(r.live, true);
    var list = presence.listLive();
    assert.equal(list.length, 1);
    assert.equal(list[0].username, 'streamer_one');
    assert.equal(list[0].gameName, 'المافيا');
    assert.equal(list[0].viewers, 123);
    assert.deepEqual(calls, { html: 1, isLive: 0 });   // ما فيه طلب إضافي
});

test('البث منتهي (status 4): ما يطلع بالقائمة', async function () {
    fakeLib({ liveRoom: { status: 4, liveRoomStats: { userCount: 0 } } }, false);
    var r = await presence.report(USER, 'mafia');
    assert.equal(r.live, false);
    assert.equal(presence.listLive().length, 0);
});

test('صفحة البث فشلت: يرجع لـfetchIsLive ويطلع بدون عدد (—)', async function () {
    var calls = fakeLib(new Error('blocked'), true);
    await presence.report(USER, 'mafia');
    var list = presence.listLive();
    assert.equal(list.length, 1);
    assert.equal(list[0].viewers, null);
    assert.deepEqual(calls, { html: 1, isLive: 1 });
});

test('آخر عدد معروف يبقى لو النبضة الجاية ما رجّعت عدد', async function () {
    fakeLib({ liveRoom: { status: 2, liveRoomStats: { userCount: 50 } } }, true);
    await presence.report(USER, 'mafia');
    // النبضة الثانية: الصفحة ما فيها إحصائيات
    liveCheck._clearCache();
    liveCheck._setLib({
        TikTokLiveConnection: function () { this.webClient = {}; this.fetchIsLive = function () { return Promise.resolve(true); }; },
        fetchRoomInfoFromHtmlRoute: function () { return Promise.resolve({ liveRoom: { status: 2 } }); }
    });
    await presence.report(USER, 'mafia');
    assert.equal(presence.listLive()[0].viewers, 50);
});

test('isLive القديمة ترجع نفس النتيجة (true/false)', async function () {
    fakeLib({ liveRoom: { status: 2, liveRoomStats: { userCount: 9 } } }, true);
    assert.equal(await liveCheck.isLive('streamer_one'), true);
    fakeLib({ liveRoom: { status: 4 } }, false);
    assert.equal(await liveCheck.isLive('streamer_one'), false);
});
