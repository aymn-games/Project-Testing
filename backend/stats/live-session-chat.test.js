'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var stats = require('./live-session-stats');

test('chat ring: keeps recent comments per stream with a sequence for screen links', function () {
    var u = 'chattest_' + Date.now();
    stats.attach(u, 'room1', 'c1');
    for (var i = 0; i < 3; i++) stats.recordComment(u, 'c1', { id: 'tiktok:viewer', name: 'فهد', text: 'هلا' });
    var r = stats.getRecentChat(u, 0);
    assert.equal(r.cseq, 3);
    assert.equal(r.chat.length, 3);
    assert.equal(r.chat[0].user, 'فهد');
    assert.equal(r.chat[0].uid, 'viewer');
    assert.equal(r.chat[0].text, 'هلا');
    assert.equal(r.chat[0].owner, false);
    assert.equal(stats.getRecentChat(u, 2).chat.length, 1);
    assert.equal(stats.getRecentChat(u, 99).chat.length, 3); // السيرفر رجع = الكل
});

test('chat ring: owner flag, trimming, empty text and the 50 message cap', function () {
    var u = 'chatcap_' + Date.now();
    stats.attach(u, 'room1', 'c1');
    stats.recordComment(u, 'c1', { id: 'tiktok:' + u, name: 'المذيع', text: '!تخطي' });
    assert.equal(stats.getRecentChat(u, 0).chat[0].owner, true);
    stats.recordComment(u, 'c1', { id: 'tiktok:x', name: 'x', text: 'ا'.repeat(500) });
    assert.equal(stats.getRecentChat(u, 1).chat[0].text.length, 200);
    stats.recordComment(u, 'c1', { id: 'tiktok:x', name: 'x', text: '   ' });
    assert.equal(stats.getRecentChat(u, 0).cseq, 2);
    for (var i = 0; i < 60; i++) stats.recordComment(u, 'c1', { id: 'tiktok:y', name: 'y', text: 'm' + i });
    var r = stats.getRecentChat(u, 0);
    assert.equal(r.chat.length, 50);
    assert.equal(r.chat[0].seq, 13);
    assert.equal(r.cseq, 62);
});

test('chat ring: unknown streamer returns null', function () {
    assert.equal(stats.getRecentChat('nobody_' + Date.now(), 0), null);
});

test('chat ring: moderator flag from TikTok (isModerator) for the song player permissions', function () {
    var u = 'chatmod_' + Date.now();
    stats.attach(u, 'room1', 'c1');
    stats.recordComment(u, 'c1', { id: 'tiktok:mod1', name: 'مشرف', text: '!تخطي', isModerator: true });
    stats.recordComment(u, 'c1', { id: 'tiktok:v', name: 'v', text: '!تخطي' });
    var c = stats.getRecentChat(u, 0).chat;
    assert.equal(c[0].mod, true);
    assert.equal(c[1].mod, false);
});
