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
        db.prepare('DELETE FROM broadcasts WHERE user_id = ?').run(id);
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

test('يعد مرات المركز الأول لكل الأسابيع المنتهية (حتى قبل تصفير التصنيف)', function () {
    var cur = lw.weekStartOf(Date.now());
    // التصفير بنص الأسبوع -4: جزءه الرسمي (بعد التصفير) ينحسب، وجزء ما قبله يتخطّى.
    setSetting(RESET_KEY, String(cur - 4 * 7 * DAY + 2 * DAY));
    starts.push(cur - 4 * 7 * DAY + 2 * DAY);
    db.prepare('DELETE FROM ranking_snapshots WHERE period_start = ?').run(cur - 4 * 7 * DAY + 2 * DAY);
    for (var w = 1; w <= 6; w++) {
        var s = cur - w * 7 * DAY;
        starts.push(s);
        db.prepare('DELETE FROM ranking_snapshots WHERE period_start = ?').run(s);
    }
    var a = makeUser('a'), b = makeUser('b');
    var ins = db.prepare('INSERT INTO streamer_match_time (user_id, started_at, ended_at) VALUES (?, ?, ?)');
    // 4 أسابيع بعد التصفير: a يفوز 3، b يفوز 1 (الأسبوع -4 مبارياته بعد لحظة التصفير)
    [[a, b], [a, b], [b, a], [a, b]].forEach(function (pair, i) {
        var ws = cur - (4 - i) * 7 * DAY;
        ins.run(pair[0], ws + 3 * DAY, ws + 3 * DAY + 5 * H);
        ins.run(pair[1], ws + 4 * DAY, ws + 4 * DAY + 1 * H);
    });
    // قبل التصفير: الأسبوع -5 كامل يفوزه b، وجزء ما قبل التصفير بالأسبوع -4 يفوزه b (ما ينحسب).
    var w5 = cur - 5 * 7 * DAY;
    ins.run(b, w5 + DAY, w5 + DAY + 6 * H);
    ins.run(b, cur - 4 * 7 * DAY + 3 * H, cur - 4 * 7 * DAY + 20 * H);
    // أقدم بث مسجّل = بداية الأسبوع -5 (الحد اللي يرجع له الحفظ)
    db.prepare('INSERT INTO broadcasts (user_id, tiktok_username, started_at, ended_at) VALUES (?, ?, ?, ?)').run(b, tag + 'b', w5 + DAY, w5 + DAY + 6 * H);
    champions.clearCache();
    assert.equal(champions.getChampionCount(a), 3);
    assert.equal(champions.getChampionCount(b), 2);
    assert.equal(champions.getChampionCount(999999999), 0);

    // يغيّر اسمه والـID العام بعد ما أخذ ألقابه: ألقابه تبقى له.
    db.prepare('UPDATE users SET custom_id = ?, display_name = ? WHERE id = ?').run(tag + 'a-new', 'اسم جديد', a);
    champions.clearCache();
    assert.equal(champions.getChampionCount(a), 3);
});
