'use strict';

// عدّاد أبطال التوب: يحفظ كل الأسابيع المنتهية (حتى اللي ما أحد طلبها) ويعد كم مرة كل ستريمر طلع أول.
// يستخدم قاعدة البيانات المحلية ويرجّع اللي غيّره.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
var CUTOVER_KEY = 'streamer_hours_match_based_from';
var RESET_KEY = 'streamer_ranking_reset_at';
function getSetting(k) { return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k); }
function setSetting(k, v) { db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v); }
var oldCutover = getSetting(CUTOVER_KEY), oldReset = getSetting(RESET_KEY);
setSetting(CUTOVER_KEY, '1');
var lw = require('../stats/last-week-ranking-service');
var champions = require('./champions-service');

var tag = 'chtest_' + Date.now();
var H = 3600000, DAY = 24 * H;
var users = [], starts = [];

test.after(function () {
    users.forEach(function (id) {
        db.prepare('DELETE FROM streamer_match_time WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    starts.forEach(function (s) { db.prepare('DELETE FROM ranking_snapshots WHERE period_start = ?').run(s); });
    if (oldCutover) setSetting(CUTOVER_KEY, oldCutover.value); else db.prepare('DELETE FROM app_settings WHERE key = ?').run(CUTOVER_KEY);
    if (oldReset) setSetting(RESET_KEY, oldReset.value); else db.prepare('DELETE FROM app_settings WHERE key = ?').run(RESET_KEY);
    champions.clearCache();
});

function makeUser(s) {
    var id = Number(db.prepare('INSERT INTO users (username, email, tiktok_username, tiktok_verified, is_streamer, created_at, custom_id) VALUES (?, ?, ?, 1, 1, ?, ?)')
        .run(tag + s, tag + s + '@test.local', tag + s, Date.now(), tag + s).lastInsertRowid);
    users.push(id);
    return id;
}

test('يعد مرات المركز الأول لكل الأسابيع المنتهية', function () {
    var cur = lw.weekStartOf(Date.now());
    setSetting(RESET_KEY, String(cur - 4 * 7 * DAY));
    for (var w = 1; w <= 4; w++) {
        var s = cur - w * 7 * DAY;
        starts.push(s);
        db.prepare('DELETE FROM ranking_snapshots WHERE period_start = ?').run(s);
    }
    var a = makeUser('a'), b = makeUser('b');
    var ins = db.prepare('INSERT INTO streamer_match_time (user_id, started_at, ended_at) VALUES (?, ?, ?)');
    // 4 أسابيع منتهية: a يفوز 3، b يفوز 1
    [[a, b], [a, b], [b, a], [a, b]].forEach(function (pair, i) {
        var ws = cur - (4 - i) * 7 * DAY;
        ins.run(pair[0], ws + DAY, ws + DAY + 5 * H);
        ins.run(pair[1], ws + 2 * DAY, ws + 2 * DAY + 1 * H);
    });
    champions.clearCache();
    assert.equal(champions.getChampionCount(tag + 'a'), 3);
    assert.equal(champions.getChampionCount(tag + 'b'), 1);
    assert.equal(champions.getChampionCount('nobody'), 0);
});
