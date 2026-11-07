/**
 * AGP TIKTOK CONNECTION LOG — سجل دائم لكل محاولة اتصال حقيقية ببث تيك توك
 * (كل محاولة = طلب توقيع من EulerStream)، عشان نعرف وش اللي يحسب «غرفة جديدة»
 * بحد EulerStream «Distinct LIVE rooms per day».
 *
 * صف لكل محاولة: الوقت، يوزر الستريمر، رقم الغرفة (Room ID)، المصدر (لعبة،
 * تحديات، مكتبة…)، نوع المحاولة (أول اتصال / إعادة اتصال / بعد حد التوقيع /
 * بعد فشل جلب Room ID)، هل كانت بعد إعادة تشغيل السيرفر، نجحت أو فشلت (والسبب)،
 * وهل رقم الغرفة **جديد اليوم** (أول مرة يظهر بيوم UTC هذا).
 *
 * ليش SQLite بدل الذاكرة: عداد shared-connection-pool.js يتصفّر مع كل نشر
 * على Render، والنشر نفسه من أسباب الاستهلاك. الصفوف تنحذف بعد KEEP_DAYS.
 *
 * db = اتصال better-sqlite3 (backend/db/database.js بالإنتاج، أو :memory: بالاختبار).
 */
'use strict';

var KEEP_DAYS = 7;
var DAY_MS = 24 * 60 * 60 * 1000;

function dayOf(ts) { return new Date(ts).toISOString().slice(0, 10); }

function createStore(db) {
    db.exec(
        'CREATE TABLE IF NOT EXISTS tiktok_connection_log (' +
        ' id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        ' at INTEGER NOT NULL,' +
        ' day TEXT NOT NULL,' +
        ' username TEXT NOT NULL,' +
        ' room_id TEXT,' +
        ' source TEXT NOT NULL,' +
        ' source_label TEXT,' +
        ' kind TEXT NOT NULL,' +
        ' after_restart INTEGER NOT NULL DEFAULT 0,' +
        ' ok INTEGER NOT NULL,' +
        ' new_room INTEGER NOT NULL DEFAULT 0,' +
        ' error TEXT' +
        ')'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_tiktok_connection_log_day ON tiktok_connection_log (day, room_id)');

    var seenRoom = db.prepare('SELECT 1 FROM tiktok_connection_log WHERE day = ? AND room_id = ? LIMIT 1');
    var insert = db.prepare('INSERT INTO tiktok_connection_log (at, day, username, room_id, source, source_label, kind, after_restart, ok, new_room, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    var delOld = db.prepare('DELETE FROM tiktok_connection_log WHERE at < ?');
    var listDay = db.prepare('SELECT * FROM tiktok_connection_log WHERE day = ? ORDER BY id DESC LIMIT ?');
    var days = db.prepare('SELECT day, COUNT(*) AS attempts, SUM(ok) AS ok, SUM(new_room) AS new_rooms, SUM(after_restart) AS after_restart FROM tiktok_connection_log GROUP BY day ORDER BY day DESC');
    var bySource = db.prepare('SELECT source, MAX(source_label) AS label, COUNT(*) AS attempts, SUM(ok) AS ok, SUM(new_room) AS new_rooms FROM tiktok_connection_log WHERE day = ? GROUP BY source ORDER BY new_rooms DESC, attempts DESC');
    var byKind = db.prepare('SELECT kind, after_restart, COUNT(*) AS attempts, SUM(new_room) AS new_rooms FROM tiktok_connection_log WHERE day = ? GROUP BY kind, after_restart');
    var byUser = db.prepare('SELECT username, COUNT(*) AS attempts, SUM(new_room) AS new_rooms, COUNT(DISTINCT room_id) AS rooms FROM tiktok_connection_log WHERE day = ? GROUP BY username ORDER BY new_rooms DESC, attempts DESC LIMIT 50');

    var lastPrune = 0;

    return {
        /**
         * @param {{at?: number, username: string, roomId?: string|null, source?: string, sourceLabel?: string, kind?: string, afterRestart?: boolean, ok: boolean, error?: string|null}} e
         * @returns {{newRoom: boolean}}
         */
        record: function (e) {
            var at = e.at || Date.now();
            var day = dayOf(at);
            var roomId = e.roomId ? String(e.roomId) : null;
            var newRoom = Boolean(roomId && !seenRoom.get(day, roomId));
            insert.run(at, day, String(e.username || ''), roomId, String(e.source || 'other'), e.sourceLabel ? String(e.sourceLabel) : null, String(e.kind || 'first'),
                e.afterRestart ? 1 : 0, e.ok ? 1 : 0, newRoom ? 1 : 0, e.error ? String(e.error).slice(0, 300) : null);
            if (at - lastPrune > 60 * 60 * 1000) {
                lastPrune = at;
                delOld.run(at - KEEP_DAYS * DAY_MS);
            }
            return { newRoom: newRoom };
        },

        /** ملخص يوم (UTC) + آخر المحاولات — للوحة الأدمن. */
        report: function (day, limit) {
            day = day || dayOf(Date.now());
            return {
                day: day,
                days: days.all(),
                bySource: bySource.all(day),
                byKind: byKind.all(day),
                byUser: byUser.all(day),
                entries: listDay.all(day, limit || 300).map(function (r) {
                    return { at: r.at, username: r.username, roomId: r.room_id, source: r.source, sourceLabel: r.source_label || r.source, kind: r.kind,
                        afterRestart: !!r.after_restart, ok: !!r.ok, newRoom: !!r.new_room, error: r.error };
                })
            };
        }
    };
}

module.exports = { createStore: createStore, KEEP_DAYS: KEEP_DAYS };
