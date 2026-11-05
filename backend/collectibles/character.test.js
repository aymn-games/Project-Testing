'use strict';

// شخصية الأنمي بالألعاب (user_characters) — اختيار من البروفايل، وقراءتها لصاحب تعليق تيك توك موثّق.
// يستخدم قاعدة البيانات المحلية (backend/agp-data.sqlite، متجاهلة بـ .gitignore) ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var svc = require('./collectibles-service');
var builder = require('../protocol/message-builder');

var tag = 'chartest_' + Date.now();
function makeUser(suffix, tiktok, verified) {
    var info = db.prepare('INSERT INTO users (username, email, tiktok_username, tiktok_verified, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(tag + suffix, tag + suffix + '@test.local', tiktok, verified ? 1 : 0, Date.now());
    return Number(info.lastInsertRowid);
}

test('اختيار الشخصية وقراءتها والرجوع للعشوائي', function () {
    var id = makeUser('a', tag + '_tt', true);
    try {
        assert.equal(svc.getCharacter(id), null);
        assert.deepEqual(svc.setCharacter(id, 'girl'), { success: true, character: 'girl' });
        assert.equal(svc.getCharacter(id), 'girl');
        assert.deepEqual(svc.setCharacter(id, 'boy'), { success: true, character: 'boy' });
        assert.equal(svc.getCharacter(id), 'boy');
        assert.equal(svc.setCharacter(id, 'dragon').success, false);
        assert.equal(svc.getCharacter(id), 'boy');
        assert.deepEqual(svc.setCharacter(id, null), { success: true, character: null });
        assert.equal(svc.getCharacter(id), null);
    } finally { db.prepare('DELETE FROM users WHERE id = ?').run(id); }
});

test('الشخصية توصل لصاحب التعليق بس لو تيك توك موثّق', function () {
    var ok = makeUser('b', tag + '_ok', true), no = makeUser('c', tag + '_no', false);
    try {
        svc.setCharacter(ok, 'boy'); svc.setCharacter(no, 'girl');
        assert.equal(svc.getCharacterForVerifiedTikTok(tag + '_OK'), 'boy'); // بدون حساسية للأحرف
        assert.equal(svc.getCharacterForVerifiedTikTok(tag + '_no'), null);
        assert.equal(svc.getCharacterForVerifiedTikTok('nobody_' + tag), null);
        assert.equal(svc.getCharacterForVerifiedTikTok(''), null);
    } finally { db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(ok, no); }
});

test('رسالة التعليق تحمل الشخصية (والقيم الغريبة تصير null)', function () {
    var msg = function (c) { var e = builder.buildCommentMessage('tiktok', 'tiktok:x', 'x', 'hi', false, null, null, null, null, c); return (e.payload || e.data || e).character; };
    assert.equal(msg('girl'), 'girl');
    assert.equal(msg('boy'), 'boy');
    assert.equal(msg('dragon'), null);
    assert.equal(msg(undefined), null);
});
