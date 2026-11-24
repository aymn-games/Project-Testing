'use strict';

// نظام عملات أيمن — الرصيد الافتتاحي، الكسب والحد اليومي، رصيد التوزيع،
// متجر العملات والاسترداد. يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var coins = require('./coins-service');

var tag = 'cointest_' + Date.now();
var created = [];
function makeUser(suffix, verified, ageDays) {
    var info = db.prepare('INSERT INTO users (username, email, tiktok_username, tiktok_verified, custom_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tag + suffix, tag + suffix + '@test.local', tag + suffix + '_tt', verified === false ? 0 : 1, tag + suffix + '_cid', Date.now() - (ageDays || 30) * 86400000);
    var id = Number(info.lastInsertRowid);
    created.push(id);
    return id;
}

test.after(function () {
    created.forEach(function (id) {
        ['coin_wallets', 'coin_ledger', 'coin_daily', 'coin_streaks', 'coin_level_bonus', 'coin_redemptions', 'user_frames', 'user_elim_cards']
            .forEach(function (t) { db.prepare('DELETE FROM ' + t + ' WHERE user_id = ?').run(id); });
        db.prepare('DELETE FROM coin_streamer_players WHERE streamer_id = ? OR player_id = ?').run(id, id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    db.prepare("DELETE FROM coin_shop_items WHERE ref LIKE 'catalog:level-7' OR ref = 'ksa-green'").run();
});

test('رصيد افتتاحي 200 مرة وحدة بس', function () {
    var id = makeUser('open');
    assert.equal(coins.getBalance(id), 200);
    assert.equal(coins.getBalance(id), 200);
    var rows = db.prepare("SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'opening'").get(id).n;
    assert.equal(rows, 1);
});

test('كسب اللاعب: مباراة + فوز + أول مباراة + المهام، والحد اليومي 150', function () {
    var player = makeUser('p1');
    var r = coins.recordMatch({ streamerId: null, recordedMs: 0, teamGame: false, game: 'roulette', participants: [{ userId: player, won: true }] });
    // 2 مباراة + 5 فوز + 5 أول مباراة + 5 مهمة الفوز
    assert.equal(r.players[player], 17);
    r = coins.recordMatch({ teamGame: false, game: 'fruits', participants: [{ userId: player, won: false }] });
    // 2 مباراة + 5 مهمة لعبتين
    assert.equal(r.players[player], 7);
    r = coins.recordMatch({ teamGame: false, game: 'fruits', participants: [{ userId: player, won: false }] });
    // 2 مباراة + 5 مهمة 3 مباريات + 10 كل المهام
    assert.equal(r.players[player], 17);
    var total = 41;
    for (var i = 0; i < 40; i++) {
        r = coins.recordMatch({ teamGame: false, game: 'fruits', participants: [{ userId: player, won: true }] });
        total += r.players[player] || 0;
    }
    assert.equal(total, 150);
    var w = coins.getWallet(player);
    assert.equal(w.today.earned, 150);
    assert.equal(w.balance, 350);
    assert.ok(w.today.missions.every(function (m) { return m.done; }));
});

test('الستريمر: يكسب بس وقت البث، وربع الكسب لرصيد التوزيع، و15 مباراة لكل لاعب عنده', function () {
    var streamer = makeUser('s1');
    var players = [makeUser('a'), makeUser('b'), makeUser('c')];
    var parts = players.map(function (id) { return { userId: id, won: false }; });

    var r = coins.recordMatch({ streamerId: streamer, recordedMs: 0, participants: parts, game: 'x' });
    assert.equal(r.streamer, 0, 'بدون بث مسجّل ما يكسب الستريمر');

    r = coins.recordMatch({ streamerId: streamer, recordedMs: 60 * 60 * 1000, participants: parts.concat([{ userId: streamer, won: true }]), game: 'x' });
    // 3 مباراة + 20 ساعة = 23 → ربع الساعة (5) للتوزيع و18 للرصيد
    assert.equal(r.streamer, 23);
    assert.equal(r.players[streamer], undefined, 'الستريمر ما يكسب كلاعب بمبارياته');
    var w = coins.getWallet(streamer);
    assert.equal(w.poolBalance, 5);
    assert.equal(w.balance, 200 + 18);

    for (var i = 0; i < 20; i++) r = coins.recordMatch({ streamerId: streamer, recordedMs: 1000, participants: parts, game: 'x' });
    assert.equal(r.players[players[0]], undefined, 'بعد 15 مباراة عند نفس الستريمر ما يكسب');
});

test('منح من رصيد التوزيع', function () {
    var streamer = makeUser('s2');
    var player = makeUser('g');
    coins.adminAdjust(streamer, 50, 'test', 'pool');
    var res = coins.grantFromPool(streamer, '#' + tag + 'g_cid', 30);
    assert.equal(res.success, true);
    assert.equal(res.pool, 20);
    assert.equal(coins.getBalance(player), 230);
    assert.equal(coins.grantFromPool(streamer, tag + 'g_tt', 21).error, 'insufficient_pool');
    assert.equal(coins.grantFromPool(streamer, tag + 's2_cid', 1).error, 'self_grant');
    assert.equal(coins.grantFromPool(streamer, 'nobody_' + tag, 1).error, 'user_not_found');
});

test('إهداء اللاعب: من رصيده، حد 100 باليوم، والحساب الجديد أو غير الموثّق ما يهدي', function () {
    var a = makeUser('ga');
    var b = makeUser('gb');
    var fresh = makeUser('gnew', true, 2);
    var unverified = makeUser('gunv', false);
    var r = coins.gift(a, '@' + tag + 'gb_tt', 60, { source: 'main' });
    assert.equal(r.success, true);
    assert.equal(r.balance, 140);
    assert.equal(coins.getBalance(b), 260);
    r = coins.gift(a, tag + 'gb_cid', 41, { source: 'main' });
    assert.equal(r.error, 'daily_limit');
    assert.equal(r.remainingToday, 40);
    assert.equal(coins.gift(a, tag + 'gb_cid', 40, { source: 'main' }).success, true);
    assert.equal(coins.gift(a, tag + 'gb_cid', 1, { source: 'pool' }).error, 'streamers_only');
    assert.equal(coins.gift(fresh, tag + 'gb_cid', 1, {}).error, 'account_too_new');
    assert.equal(coins.gift(unverified, tag + 'gb_cid', 1, {}).error, 'not_verified');
    assert.equal(coins.lookupRecipient(a, '#' + tag + 'gb_cid').target.id, b);
    assert.equal(coins.lookupRecipient(a, tag + 'ga_cid').error, 'self_grant');
    var hist = coins.getHistory(b, 5).map(function (e) { return e.reason; });
    assert.ok(hist.indexOf('gift_received') >= 0);
});

test('إهداء الستريمر: من رصيده الأساسي بدون حد يومي', function () {
    var s = makeUser('gs', true, 1);
    var p = makeUser('gp');
    var r = coins.gift(s, tag + 'gp_cid', 180, { source: 'main', isStreamer: true });
    assert.equal(r.success, true);
    assert.equal(r.balance, 20);
    assert.equal(coins.gift(s, tag + 'gp_cid', 21, { source: 'main', isStreamer: true }).error, 'insufficient_balance');
    assert.equal(coins.getBalance(p), 380);
});

test('متجر العملات: الأدمن يختار العنصر وسعره، والاسترداد يخصم ويمنح', function () {
    var buyer = makeUser('buy');
    var frame = coins.adminSaveShopItem({ kind: 'frame', ref: 'catalog:level-7', price: 150, stock: 1 });
    assert.equal(frame.success, true);
    assert.equal(coins.adminSaveShopItem({ kind: 'frame', ref: 'catalog:level-7', price: 10 }).error, 'already_listed');
    assert.equal(coins.adminSaveShopItem({ kind: 'frame', ref: 'catalog:nope', price: 10 }).error, 'unknown_item');
    var card = coins.adminSaveShopItem({ kind: 'elim', ref: 'ksa-green', price: 100, active: false });
    assert.equal(card.success, true);

    var shop = coins.listShop(buyer);
    assert.ok(shop.some(function (it) { return it.id === frame.item.id; }));
    assert.ok(!shop.some(function (it) { return it.id === card.item.id; }), 'المخفي ما يطلع للاعب');
    assert.equal(coins.redeem(buyer, card.item.id).error, 'not_available');

    var res = coins.redeem(buyer, frame.item.id);
    assert.equal(res.success, true);
    assert.equal(res.balance, 50);
    assert.ok(db.prepare("SELECT id FROM user_frames WHERE user_id = ? AND frame_type = 'catalog' AND frame_ref = 'level-7'").get(buyer));
    assert.equal(coins.redeem(buyer, frame.item.id).error, 'sold_out');

    coins.adminSaveShopItem({ id: frame.item.id, price: 150, stock: null });
    assert.equal(coins.redeem(buyer, frame.item.id).error, 'already_owned');

    coins.adminSaveShopItem({ id: card.item.id, price: 100, active: true });
    var poor = coins.redeem(buyer, card.item.id);
    assert.equal(poor.error, 'insufficient_balance');
    assert.equal(coins.getBalance(buyer), 50, 'فشل الاسترداد ما يخصم شي');
    assert.ok(!db.prepare("SELECT id FROM user_elim_cards WHERE user_id = ? AND card_key = 'ksa-green'").get(buyer));
});

test('التصنيف الأسبوعي ما يصرف عن أسابيع قبل تشغيل النظام', function () {
    var r = coins.runWeeklyPayouts(Date.now());
    assert.equal(r.paid, false);
});

test('اليوم بتوقيت السعودية يتغير 12:00 ص', function () {
    // 20:59 UTC = 23:59 الرياض، 21:00 UTC = 00:00 الرياض (اليوم اللي بعده)
    assert.equal(coins.riyadhDay(Date.UTC(2026, 10, 20, 20, 59)), '2026-11-20');
    assert.equal(coins.riyadhDay(Date.UTC(2026, 10, 20, 21, 0)), '2026-11-21');
});
