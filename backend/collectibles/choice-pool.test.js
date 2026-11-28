'use strict';

// الكود الجماعي ما يعرض إلا الإطارات اللي بقائمته وقت إنشائه: إطار ينضاف
// بعدين ما يدخل فيه، وتعديل «قائمة الكود الجماعي» ما يغيّر الأكواد السابقة.
// والأكواد القديمة (بدون قائمة) تتثبّت على الإطارات اللي كانت موجودة يوم انسوت.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');

var tag = 'pooltest_' + Date.now();
var T0 = Date.now() - 100000;
// كود قديم بدون قائمة + إطار حصري قبله وإطار بعده — قبل تحميل الخدمة (التثبيت يصير وقت التحميل)
var oldFrame = Number(db.prepare('INSERT INTO custom_frames (image_filename, display_name_ar, created_at) VALUES (?, ?, ?)').run(tag + '-old.png', tag, T0 - 1000).lastInsertRowid);
var lateFrame = Number(db.prepare('INSERT INTO custom_frames (image_filename, display_name_ar, created_at) VALUES (?, ?, ?)').run(tag + '-late.png', tag, T0 + 1000).lastInsertRowid);
var legacyCode = 'AGP-' + tag.slice(-4) + '-LGCY';
db.prepare("INSERT INTO choice_codes (code, max_uses, uses, excluded, note, created_at) VALUES (?, 10, 0, '[]', ?, ?)").run(legacyCode, tag, T0);

var svc = require('./collectibles-service');

function keys(choices) { return choices.map(function (f) { return f.frameType + ':' + f.frameRef; }); }

test('قائمة الكود الجماعي: الكود يحفظ قائمته، والإطار الجديد ما يدخل فيه', function () {
    var poolBefore = svc.getChoicePool();
    var user = Number(db.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)').run(tag + 'u', tag + 'u@test.local', Date.now()).lastInsertRowid);
    var a = String(svc.createCustomFrame(tag + '-a.png', tag).id);
    var b = null, code = null, code2 = null;
    try {
        assert.equal(svc.setChoicePool([]).frames.length, 0);
        assert.equal(svc.generateChoiceCodeFromPool(5, tag).error, 'empty_pool');

        assert.deepEqual(svc.setChoicePool(['custom:' + a, 'custom:999999999']).frames, ['custom:' + a]);
        var r = svc.generateChoiceCodeFromPool(5, tag);
        code = r.code;
        assert.equal(r.frames, 1);
        assert.deepEqual(keys(svc.redeemFrameCode(user, code).choices), ['custom:' + a]);

        // إطار جديد + إضافته للقائمة بعد الكود: ما يطلع بالكود القديم، ويطلع بالجديد
        b = String(svc.createCustomFrame(tag + '-b.png', tag).id);
        svc.setChoicePool(['custom:' + a, 'custom:' + b]);
        assert.deepEqual(keys(svc.redeemFrameCode(user, code).choices), ['custom:' + a]);
        assert.equal(svc.claimChoiceCode(user, code, 'custom', b).error, 'invalid_frame');
        code2 = svc.generateChoiceCodeFromPool(5, tag).code;
        assert.deepEqual(keys(svc.redeemFrameCode(user, code2).choices).sort(), ['custom:' + a, 'custom:' + b].sort());

        // الاستثناء الدائم يغلب القائمة
        var permBefore = svc.getPermanentExcluded();
        svc.setPermanentExcluded(permBefore.concat(['custom:' + b]));
        assert.deepEqual(keys(svc.redeemFrameCode(user, code2).choices), ['custom:' + a]);
        svc.setPermanentExcluded(permBefore);
    } finally {
        svc.setChoicePool(poolBefore);
        [code, code2].forEach(function (c) { if (c) db.prepare('DELETE FROM choice_codes WHERE code = ?').run(c); });
        db.prepare('DELETE FROM custom_frames WHERE id IN (?, ?)').run(a, b || -1);
        db.prepare('DELETE FROM users WHERE id = ?').run(user);
    }
});

test('الكود القديم يتثبّت على الإطارات اللي كانت موجودة يوم انسوى', function () {
    try {
        var row = db.prepare('SELECT allowed FROM choice_codes WHERE code = ?').get(legacyCode);
        var allowed = JSON.parse(row.allowed);
        assert.ok(allowed.indexOf('custom:' + oldFrame) >= 0);
        assert.equal(allowed.indexOf('custom:' + lateFrame), -1);
    } finally {
        db.prepare('DELETE FROM choice_codes WHERE code = ?').run(legacyCode);
        db.prepare('DELETE FROM custom_frames WHERE id IN (?, ?)').run(oldFrame, lateFrame);
    }
});
