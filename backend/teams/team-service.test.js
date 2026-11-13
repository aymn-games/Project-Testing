'use strict';

// «فريقك» + منح أكواد جوائز الفوز: انضمام مباشر، أكثر من فريق، بحث،
// والمنح لأعضاء الفريق بس ويحجز استخدام من رصيد الكود.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var teams = require('./team-service');
var svc = require('../collectibles/collectibles-service');

var tag = 'teamtest_' + Date.now();
var made = [];
function makeUser(suffix, opts) {
    opts = opts || {};
    var info = db.prepare('INSERT INTO users (username, email, tiktok_username, tiktok_verified, is_streamer, custom_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(tag + suffix, tag + suffix + '@test.local', opts.tiktok || null, opts.tiktok ? 1 : 0, opts.streamer ? 1 : 0, opts.customId || null, Date.now());
    var id = Number(info.lastInsertRowid);
    made.push(id);
    return { id: id };
}
function cleanup(codes) {
    (codes || []).forEach(function (c) {
        db.prepare('DELETE FROM code_grants WHERE code = ?').run(c);
        db.prepare('DELETE FROM choice_code_redemptions WHERE code = ?').run(c);
        db.prepare('DELETE FROM challenge_reward_codes WHERE code = ?').run(c);
        db.prepare('DELETE FROM choice_codes WHERE code = ?').run(c);
    });
    made.forEach(function (id) {
        db.prepare('DELETE FROM user_frames WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM team_members WHERE streamer_id = ? OR member_id = ?').run(id, id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
}
function uniq() { return String(90000000 + Math.floor(Math.random() * 9999999)); }

test('الانضمام والبحث والطلوع وأكثر من فريق', function () {
    var c1 = uniq(), c2 = uniq(), cp = uniq();
    var s1 = makeUser('s1', { streamer: true, tiktok: tag + '_one', customId: c1 });
    var s2 = makeUser('s2', { streamer: true, tiktok: tag + '_two', customId: c2 });
    var p = makeUser('p', { customId: cp });
    try {
        assert.equal(teams.join(p, cp).error, 'streamer_not_found'); // لاعب مو ستريمر
        assert.equal(teams.join(s1, c1).error, 'self');
        assert.equal(teams.join(p, c1).success, true);
        assert.equal(teams.join(p, c1).success, true); // مرة ثانية ما تكرر
        assert.equal(teams.join(p, c2).success, true);
        var m = teams.mine(p);
        assert.equal(m.teams.length, 2);
        assert.equal(teams.mine(s1).members.length, 1);

        var r = teams.search(p, '@' + tag + '_o');
        assert.equal(r.results.length, 1);
        assert.equal(r.results[0].customId, c1);
        assert.equal(r.results[0].joined, true);
        assert.equal(teams.search(p, c2).results[0].customId, c2);
        assert.equal(teams.search(p, cp).results.length, 0); // اللاعب ما يطلع بالبحث

        assert.equal(teams.leave(p, c2).success, true);
        assert.equal(teams.mine(p).teams.length, 1);
        assert.equal(teams.removeMember(s1, cp).success, true);
        assert.equal(teams.mine(s1).members.length, 0);
    } finally { cleanup(); made = []; }
});

test('منح كود جائزة الفوز لعضو الفريق واسترداده', function () {
    var c1 = uniq(), cm = uniq(), co = uniq();
    var s = makeUser('gs', { streamer: true, tiktok: tag + '_gs', customId: c1 });
    var member = makeUser('gm', { customId: cm });
    var outsider = makeUser('go', { customId: co });
    var gen = svc.generateChoiceCode(2, [], 'test');
    assert.equal(gen.success, true);
    var code = gen.code;
    db.prepare('INSERT INTO challenge_reward_codes (code, user_id, match_id, game, team_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(code, s.id, 'm1', 'penalty', 'blue', Date.now());
    try {
        teams.join(member, c1);
        assert.equal(svc.grantWinCode(s.id, code, co).error, 'not_team_member');
        assert.equal(svc.grantWinCode(member.id, code, c1).error, 'not_team_member');
        assert.equal(svc.grantWinCode(s.id, code, cm).success, true);
        assert.equal(svc.grantWinCode(s.id, code, cm).error, 'already_granted');
        assert.equal(db.prepare('SELECT uses FROM choice_codes WHERE code = ?').get(code).uses, 1);

        var listed = svc.listWinRewardCodes(s.id).filter(function (c) { return c.code === code; })[0];
        assert.equal(listed.grants.length, 1);
        assert.equal(listed.grants[0].redeemed, false);
        var mine = svc.listMyGrants(member.id);
        assert.equal(mine.length, 1);
        assert.equal(mine[0].from.customId, c1);

        // الكود يمتلي بعدين — الممنوح له يقدر يسترد لأن استخدامه محجوز
        db.prepare('UPDATE choice_codes SET uses = max_uses WHERE code = ?').run(code);
        var preview = svc.redeemFrameCode(member.id, code);
        assert.equal(preview.success, true);
        assert.equal(preview.kind, 'choice');
        var pick = preview.choices[0];
        var claim = svc.claimChoiceCode(member.id, code, pick.frameType, pick.frameRef);
        assert.equal(claim.success, true);
        assert.equal(db.prepare('SELECT uses FROM choice_codes WHERE code = ?').get(code).uses, 2); // ما زاد
        assert.equal(svc.listMyGrants(member.id)[0].redeemed, true);
        // اللي ما انمنح له والكود ممتلي
        assert.equal(svc.claimChoiceCode(outsider.id, code, pick.frameType, pick.frameRef).error, 'code_full');
    } finally { cleanup([code]); made = []; }
});
