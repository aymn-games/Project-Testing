'use strict';

// الإطارات الخاصة والأكواد الجماعية: الإطار الحصري يُستثنى من أكواد الاختيار،
// و«مين عنده الإطار؟» يعرض الملّاك ومصدر كل واحد، والسحب الجماعي يشيل اللي
// أخذوه بكود بس. يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var svc = require('./collectibles-service');

var tag = 'ownertest_' + Date.now();
function makeUser(suffix) {
    var info = db.prepare('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)')
        .run(tag + suffix, tag + suffix + '@test.local', Date.now());
    return Number(info.lastInsertRowid);
}

test('إطار حصري مستثنى من الكود الجماعي، والملّاك والسحب الجماعي', function () {
    var permBefore = svc.getPermanentExcluded();
    var a = makeUser('a'), b = makeUser('b'), c = makeUser('c');
    var frameId = String(svc.createCustomFrame(tag + '.png', tag).id);
    var code = null;
    try {
        // قبل الاستثناء: الإطار يطلع بالكود الجماعي
        code = svc.generateChoiceCode(5, [], tag).code;
        var opts = svc.redeemFrameCode(a, code).choices.map(function (f) { return f.frameType + ':' + f.frameRef; });
        assert.ok(opts.indexOf('custom:' + frameId) >= 0);

        // a ياخذه بالكود قبل الاستثناء، c بمنح يدوي
        assert.equal(svc.claimChoiceCode(a, code, 'custom', frameId).success, true);
        svc.grantFrame(c, 'custom', frameId, { grantedBy: 'admin_manual' });

        // بعد الاستثناء: ما يطلع لـ b ولا يقدر يستلمه
        svc.excludeFromChoiceCodes('custom', frameId);
        var optsB = svc.redeemFrameCode(b, code).choices.map(function (f) { return f.frameType + ':' + f.frameRef; });
        assert.equal(optsB.indexOf('custom:' + frameId), -1);
        assert.equal(svc.claimChoiceCode(b, code, 'custom', frameId).error, 'invalid_frame');

        var owners = svc.listFrameOwners('custom', frameId).owners;
        assert.equal(owners.length, 2);
        var oa = owners.filter(function (o) { return o.userId === a; })[0];
        assert.equal(oa.grantedBy, 'redeem_code');
        assert.equal(oa.code, code);
        assert.equal(oa.codeKind, 'choice');

        assert.deepEqual(svc.revokeFrameFromCodeRedeemers('custom', frameId), { success: true, revoked: 1 });
        owners = svc.listFrameOwners('custom', frameId).owners;
        assert.deepEqual(owners.map(function (o) { return o.userId; }), [c]);

        assert.equal(svc.listFrameOwners('custom', '999999999').error, 'unknown_frame');
    } finally {
        svc.setPermanentExcluded(permBefore);
        if (code) {
            db.prepare('DELETE FROM choice_code_redemptions WHERE code = ?').run(code);
            db.prepare('DELETE FROM choice_codes WHERE code = ?').run(code);
        }
        db.prepare('DELETE FROM user_frames WHERE frame_type = ? AND frame_ref = ?').run('custom', frameId);
        db.prepare('DELETE FROM custom_frames WHERE id = ?').run(frameId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(a, b, c);
    }
});
