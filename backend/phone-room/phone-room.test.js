'use strict';

// اختبارات «غرفة الجوالات» (اللعب بدون بث): الصلاحية، الدخول، توصيل
// أحداث الجوالات للعبة بشكل أحداث البث، والموصّل (platforms/phone).

var test = require('node:test');
var assert = require('node:assert/strict');

var svc = require('./phone-room-service');
var phoneConnector = require('../platforms/phone/phone-connector');

var ADMIN = { id: 1, username: 'ayman', role: 'admin', permissions: {} };
var GRANTED = { id: 2, username: 'sara', role: 'streamer', permissions: { phone_rooms: true } };
var PLAIN = { id: 3, username: 'omar', role: 'streamer', is_streamer: true, permissions: { full_game_access: true } };

function fresh() { svc._reset(); svc._setNow(null); }

test('only admin or phone_rooms permission can open a room, code is in the phone range', function () {
    fresh();
    assert.equal(svc.openRoom(PLAIN).error, 'no_permission');
    var a = svc.openRoom(ADMIN);
    assert.ok(a.success);
    var n = Number(a.room.code);
    assert.ok(n >= 1600 && n <= 1699, 'code ' + a.room.code);
    assert.ok(svc.openRoom(GRANTED).success);
    // نفس الحساب يرجع لنفس الغرفة
    assert.equal(svc.openRoom(ADMIN).room.code, a.room.code);
    assert.equal(svc.hasRoom(a.room.code), true);
    assert.equal(svc.canHost({ id: 9, role: 'streamer', permissions: '{"phone_rooms":true}' }), true);
});

test('join validates name/device, same device keeps its id, duplicate names get a number', function () {
    fresh();
    var code = svc.openRoom(ADMIN).room.code;
    assert.equal(svc.joinRoom('0000', 'abcdefgh1', 'سارة').err, 'no_room');
    assert.equal(svc.joinRoom(code, 'x', 'سارة').err, 'bad_device');
    assert.equal(svc.joinRoom(code, 'abcdefgh1', ' ').err, 'bad_name');
    var a = svc.joinRoom(code, 'abcdefgh1', 'سارة');
    assert.ok(a.ok);
    assert.equal(a.player.id, 'phone:abcdefgh1');
    var b = svc.joinRoom(code, 'abcdefgh2', 'سارة');
    assert.equal(b.player.name, 'سارة 2');
    var again = svc.joinRoom(code, 'abcdefgh1', 'سارة');
    assert.equal(again.player.id, a.player.id);
    assert.equal(again.player.name, 'سارة');
    assert.equal(svc.getRoomOf(ADMIN).players.length, 2);
});

test('player actions reach the host page shaped like stream events', function () {
    fresh();
    var code = svc.openRoom(ADMIN).room.code;
    var pid = svc.joinRoom(code, 'abcdefgh1', 'سارة').player.id;
    var got = [];
    assert.equal(svc.playerAction(code, pid, 'chat', { text: 'join' }).live, false);
    var att = svc.attachHost(ADMIN, code, function (k, d) { got.push([k, d]); });
    assert.ok(att.ok);
    assert.equal(svc.playerAction(code, pid, 'chat', { text: '  join ' }).live, true);
    svc.playerAction(code, pid, 'like', { count: 500 });
    svc.playerAction(code, pid, 'gift', { gift: { id: 'rose', name: 'Rose', coins: 1 }, count: 3 });
    svc.playerAction(code, pid, 'follow', {});
    assert.equal(svc.playerAction(code, pid, 'gift', { gift: { id: '<x>', name: 'x', coins: 1 } }).err, 'bad_gift');
    assert.deepEqual(got[0], ['comment', { id: pid, name: 'سارة', text: 'join', isFollower: true }]);
    assert.deepEqual(got[1], ['like', { id: pid, name: 'سارة', count: 30 }]);
    assert.deepEqual(got[2], ['gift', { id: pid, name: 'سارة', giftName: 'Rose', giftValue: 1, repeatCount: 3, giftId: null }]);
    assert.deepEqual(got[3], ['follow', { id: pid, name: 'سارة' }]);
    att.detach();
    svc.playerAction(code, pid, 'chat', { text: 'x' });
    assert.equal(got.length, 4);
});

test('only the owner can attach; kick and close notify phones', function () {
    fresh();
    var code = svc.openRoom(ADMIN).room.code;
    svc.openRoom(GRANTED);
    assert.equal(svc.attachHost(GRANTED, code, function () {}).err, 'not_owner');
    assert.equal(svc.attachHost(PLAIN, code, function () {}).err, 'no_permission');
    var pid = svc.joinRoom(code, 'abcdefgh1', 'سارة').player.id;
    var events = [];
    svc.onRoomEvent(function (c, ev) { if (c === code) events.push(ev.t + (ev.reason ? ':' + ev.reason : '')); });
    assert.ok(svc.kickPlayer(ADMIN, pid).success);
    assert.equal(svc.isMember(code, pid), false);
    var closed = [];
    svc.attachHost(ADMIN, code, function (k) { closed.push(k); });
    assert.ok(svc.closeRoom(ADMIN).success);
    assert.deepEqual(closed, ['closed']);
    assert.equal(svc.hasRoom(code), false);
    assert.deepEqual(events, ['kicked', 'live', 'closed:closed']);
});

test('idle rooms expire, active ones stay', function () {
    fresh();
    var t = 1000;
    svc._setNow(function () { return t; });
    var code = svc.openRoom(ADMIN).room.code;
    t += 5 * 60 * 60 * 1000;
    svc.sweep();
    assert.equal(svc.hasRoom(code), true);
    t += 2 * 60 * 60 * 1000;
    svc.sweep();
    assert.equal(svc.hasRoom(code), false);
    svc._setNow(null);
});

test('phone connector: denies without permission, relays events when allowed', async function () {
    fresh();
    var code = svc.openRoom(ADMIN).room.code;
    var users = { tokA: ADMIN, tokP: PLAIN };
    var auth = { validateSession: function (t) { return users[t] || null; } };
    function run(token) {
        return new Promise(function (resolve) {
            var out = { status: [], comments: [] };
            var c = phoneConnector.createPhoneConnector({ service: svc, auth: auth });
            c.connect({ username: code, authToken: token }, {
                onStatus: function (s, m, r) { out.status.push([s, r]); if (s !== 'connected') resolve(out); else { out.conn = c; resolve(out); } },
                onComment: function (d) { out.comments.push(d.text); },
                onGift: function () {}, onFollow: function () {}, onLike: function () {}
            });
        });
    }
    var denied = await run('tokP');
    assert.deepEqual(denied.status, [['error', 'phone_no_permission']]);
    var noAuth = await run(null);
    assert.deepEqual(noAuth.status, [['error', 'phone_auth_required']]);
    var ok = await run('tokA');
    assert.deepEqual(ok.status, [['connected', undefined]]);
    var pid = svc.joinRoom(code, 'abcdefgh1', 'سارة').player.id;
    svc.playerAction(code, pid, 'chat', { text: 'هلا' });
    assert.deepEqual(ok.comments, ['هلا']);
    ok.conn.disconnect();
    assert.equal(svc.roomInfo(code).live, false);
});
