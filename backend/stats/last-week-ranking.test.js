'use strict';

// تصنيف «الأسبوع الماضي»: يحسب الأسبوع اللي خلص فقط (ساعات + فوز)، يحفظه، وما يتغير بعدها.
// يستخدم قاعدة البيانات المحلية ويحذف اللي أضافه.

var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../db/database');
// الساعات بعد لحظة التحويل تنحسب من streamer_match_time — نخلي التحويل بالماضي
// قبل ما ينحمل streamer-hours.js (يقرأه مرة وحدة)، ونرجعه بعد الاختبار.
var CUTOVER_KEY = 'streamer_hours_match_based_from';
var oldCutover = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CUTOVER_KEY);
db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(CUTOVER_KEY, '1');
var svc = require('./last-week-ranking-service');
test.after(function () {
    if (oldCutover) db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(oldCutover.value, CUTOVER_KEY);
    else db.prepare('DELETE FROM app_settings WHERE key = ?').run(CUTOVER_KEY);
});

var tag = 'lwtest_' + Date.now();
var H = 3600000, DAY = 24 * H;
var made = [];
function makeUser(suffix) {
    var info = db.prepare('INSERT INTO users (username, email, tiktok_username, tiktok_verified, is_streamer, created_at) VALUES (?, ?, ?, 1, 1, ?)')
        .run(tag + suffix, tag + suffix + '@test.local', tag + suffix, Date.now());
    made.push(Number(info.lastInsertRowid));
    return Number(info.lastInsertRowid);
}

test('الأسبوع الماضي: ينحسب من بدايته لبداية الأسبوع الحالي ويتحفظ', function () {
    // لحظة ثابتة بنص أسبوع، والأسبوع اللي قبله
    var nowMs = svc.weekStartOf(Date.now()) + 3 * DAY + 5 * H;
    var cur = svc.weekStartOf(nowMs), prev = cur - 7 * DAY;
    db.prepare("DELETE FROM app_settings WHERE key = 'streamer_ranking_reset_at'").run();
    var period = svc.previousPeriod(nowMs);
    assert.equal(period.end, cur);
    assert.equal(period.start, prev);

    var a = makeUser('a'), b = makeUser('b');
    var ins = db.prepare('INSERT INTO streamer_match_time (user_id, started_at, ended_at) VALUES (?, ?, ?)');
    ins.run(a, prev + DAY, prev + DAY + 3 * H);        // 3 ساعات الأسبوع الماضي
    ins.run(b, prev + 2 * DAY, prev + 2 * DAY + 1 * H); // ساعة الأسبوع الماضي
    ins.run(b, cur + H, cur + 6 * H);                   // الأسبوع الحالي: ما تنحسب
    ins.run(a, cur - H, cur + H);                       // تقطع الحد: ساعة وحدة بس للماضي

    db.prepare('DELETE FROM ranking_snapshots WHERE period_start = ?').run(prev);
    var r = svc.getLastWeekRanking(nowMs);
    var mine = r.streamers.filter(function (s) { return s.tiktokUsername && s.tiktokUsername.indexOf(tag) === 0; });
    assert.equal(mine[0].tiktokUsername, tag + 'a');
    assert.equal(mine[0].totalMinutes, 4 * 60);
    assert.equal(mine[1].totalMinutes, 60);

    // محفوظ: ساعات جديدة بعدها ما تغيّر النتيجة
    ins.run(b, prev + 3 * DAY, prev + 3 * DAY + 10 * H);
    var again = svc.getLastWeekRanking(nowMs);
    assert.equal(again.savedAt, r.savedAt);
    assert.deepEqual(again.streamers, r.streamers);

    db.prepare('DELETE FROM ranking_snapshots WHERE period_start = ?').run(prev);
    made.forEach(function (id) {
        db.prepare('DELETE FROM streamer_match_time WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
});
