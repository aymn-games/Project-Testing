'use strict';

// «مجتمعي»: شات الفريق والإشراف، والأصدقاء والرسائل الخاصة.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var teamService = require('../teams/team-service');
var chat = require('./team-chat-service');
var friends = require('./friends-service');

var tag = 'cmt' + Date.now();
var seq = 0;
var made = [];
var clock = Date.now();
chat._setClock(function () { return clock; });
friends._setClock(function () { return clock; });
function tick() { clock += 2000; } // يتعدى حد سرعة الإرسال

function makeUser(streamer) {
    seq++;
    var cid = String(7000000 + Math.floor(Math.random() * 900000) * 10 + seq);
    var info = db.prepare('INSERT INTO users (username, email, is_streamer, custom_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(tag + seq, tag + seq + '@test.local', streamer ? 1 : 0, cid, Date.now());
    var id = Number(info.lastInsertRowid);
    made.push(id);
    return { id: id, cid: cid };
}

test.after(function () {
    chat._setClock(null);
    friends._setClock(null);
    made.forEach(function (id) {
        ['team_chat_messages WHERE user_id = ? OR streamer_id = ?', 'team_chat_moderators WHERE user_id = ? OR streamer_id = ?',
            'team_chat_mutes WHERE user_id = ? OR streamer_id = ?', 'team_chat_reads WHERE user_id = ? OR streamer_id = ?',
            'team_members WHERE member_id = ? OR streamer_id = ?', 'friendships WHERE user_a = ? OR user_b = ?',
            'user_blocks WHERE user_id = ? OR blocked_id = ?', 'direct_messages WHERE from_id = ? OR to_id = ?'
        ].forEach(function (q) { db.prepare('DELETE FROM ' + q).run(id, id); });
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
});

test('شات الفريق: الأعضاء بس يكتبون ويقرون، وغير المقروء ينحسب', function () {
    var owner = makeUser(true), a = makeUser(false), outsider = makeUser(false);
    teamService.join(a, owner.cid);
    assert.equal(chat.send(outsider, owner.cid, 'هلا').error, 'not_member');
    assert.equal(chat.messages(outsider, owner.cid).error, 'not_member');
    assert.equal(chat.send(a, owner.cid, '   ').error, 'empty');
    assert.equal(chat.send(a, owner.cid, 'السلام عليكم').success, true);
    assert.equal(chat.send(a, owner.cid, 'سريع').error, 'too_fast');
    tick();
    var r = chat.send(owner, owner.cid, 'هلا والله');
    assert.equal(r.message.author.role, 'owner');
    assert.equal(chat.listTeams(a).teams.filter(function (t) { return t.customId === owner.cid; })[0].unread, 1);
    var m = chat.messages(a, owner.cid);
    assert.equal(m.myRole, 'member');
    assert.deepEqual(m.messages.map(function (x) { return x.body; }), ['السلام عليكم', 'هلا والله']);
    assert.equal(chat.listTeams(a).teams.filter(function (t) { return t.customId === owner.cid; })[0].unread, 0);
    assert.equal(chat.messages(a, owner.cid, m.messages[1].id).messages.length, 0);
    assert.equal(chat.listTeams(owner).teams[0].role, 'owner');
});

test('الإشراف: حذف، كتم، فك كتم، طرد، والمشرف ما يقدر على المشرفين وصاحب الفريق', function () {
    var owner = makeUser(true), mod = makeUser(false), mod2 = makeUser(false), b = makeUser(false);
    [mod, mod2, b].forEach(function (u) { teamService.join(u, owner.cid); });
    assert.equal(chat.setModerator(mod, owner.cid, true).error, 'forbidden'); // مو ستريمر
    assert.equal(chat.setModerator(owner, mod.cid, true).success, true);
    assert.equal(chat.setModerator(owner, mod2.cid, true).success, true);
    tick();
    var msg = chat.send(b, owner.cid, 'سبام').message;
    var ownerMsg = (tick(), chat.send(owner, owner.cid, 'رسالة الستريمر')).message;
    var since = clock;
    assert.equal(chat.deleteMessage(mod, owner.cid, ownerMsg.id).error, 'forbidden');
    assert.equal(chat.deleteMessage(mod, owner.cid, msg.id).success, true);
    assert.deepEqual(chat.messages(b, owner.cid, ownerMsg.id, since).removed, [msg.id]);
    assert.equal(chat.mute(b, owner.cid, mod.cid, 10).error, 'forbidden');
    assert.equal(chat.mute(mod, owner.cid, mod2.cid, 10).error, 'forbidden');
    assert.equal(chat.mute(mod, owner.cid, owner.cid, 10).error, 'forbidden');
    assert.equal(chat.mute(mod, owner.cid, b.cid, 7).error, 'invalid_duration');
    assert.equal(chat.mute(mod, owner.cid, b.cid, 10).success, true);
    tick();
    assert.equal(chat.send(b, owner.cid, 'هاي').error, 'muted');
    assert.ok(chat.messages(b, owner.cid).muted.until > clock);
    clock += 11 * 60000;
    assert.equal(chat.send(b, owner.cid, 'رجعت').success, true); // الكتم انتهى
    chat.mute(owner, owner.cid, b.cid, 0);
    clock += 30 * 86400000;
    assert.equal(chat.messages(b, owner.cid).muted.until, 0); // دائم
    assert.equal(chat.unmute(mod, owner.cid, b.cid).success, true);
    var list = chat.members(mod, owner.cid).members;
    assert.equal(list.filter(function (x) { return x.role === 'mod'; }).length, 2);
    assert.equal(chat.members(b, owner.cid).error, 'forbidden');
    assert.equal(chat.mute(owner, owner.cid, mod.cid, 60).success, true); // صاحب الفريق يقدر على المشرف
    assert.equal(chat.kick(mod2, owner.cid, b.cid).success, true);
    assert.equal(chat.send(b, owner.cid, 'وينكم').error, 'not_member');
    chat.setModerator(owner, mod2.cid, false);
    assert.equal(chat.kick(mod2, owner.cid, mod.cid).error, 'forbidden');
    teamService.leave(mod, owner.cid);
    teamService.join(mod, owner.cid);
    assert.equal(chat.messages(mod, owner.cid).myRole, 'member'); // الخروج يشيل الإشراف
});

test('الأصدقاء: طلب، قبول، طلب متبادل، رفض، وحذف', function () {
    var a = makeUser(false), b = makeUser(false), c = makeUser(true);
    assert.equal(friends.request(a, a.cid).error, 'self');
    assert.equal(friends.request(a, '0').error, 'user_not_found');
    assert.equal(friends.request(a, b.cid).status, 'outgoing');
    assert.equal(friends.relation(b.id, a.id), 'incoming');
    assert.equal(friends.counts(b).incoming, 1);
    assert.equal(friends.accept(a, b.cid).error, 'no_request'); // ما يقبل طلبه هو
    assert.equal(friends.accept(b, a.cid).status, 'friend');
    assert.equal(friends.request(a, b.cid).error, 'already_friends');
    // طلب متبادل = قبول
    friends.request(a, c.cid);
    assert.equal(friends.request(c, a.cid).status, 'friend');
    var l = friends.list(a);
    assert.equal(l.friends.length, 2);
    assert.equal(friends.search(a, c.cid).results[0].relation, 'friend');
    friends.remove(a, c.cid);
    assert.equal(friends.relation(a.id, c.id), 'none');
    friends.request(a, c.cid);
    friends.decline(c, a.cid);
    assert.equal(friends.list(a).outgoing.length, 0);
});

test('الرسائل الخاصة: للأصدقاء بس، المقروء، والحظر يقفل كل شي', function () {
    var a = makeUser(false), b = makeUser(false);
    assert.equal(friends.sendMessage(a, b.cid, 'هلا').error, 'not_friends');
    friends.request(a, b.cid); friends.accept(b, a.cid);
    assert.equal(friends.sendMessage(a, b.cid, 'هلا').success, true);
    tick();
    friends.sendMessage(a, b.cid, 'كيفك');
    assert.equal(friends.counts(b).unread, 2);
    assert.equal(friends.list(b).friends[0].unread, 2);
    var conv = friends.conversation(b, a.cid);
    assert.deepEqual(conv.messages.map(function (m) { return m.body; }), ['هلا', 'كيفك']);
    assert.equal(conv.messages[0].mine, false);
    assert.equal(friends.counts(b).unread, 0);
    assert.equal(friends.conversation(a, b.cid).seenUpTo, conv.messages[1].id);
    assert.equal(friends.conversation(a, b.cid, conv.messages[1].id).messages.length, 0);
    friends.block(b, a.cid);
    assert.equal(friends.relation(b.id, a.id), 'blocked');
    assert.equal(friends.request(a, b.cid).error, 'blocked');
    tick();
    assert.equal(friends.sendMessage(a, b.cid, 'وش صار').error, 'blocked');
    assert.equal(friends.search(a, b.cid).results.length, 0); // المحظور ما يلقاه
    assert.equal(friends.list(b).blocked.length, 1);
    friends.unblock(b, a.cid);
    assert.equal(friends.request(a, b.cid).status, 'outgoing');
});
