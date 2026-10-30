/**
 * AGP LIVE SESSION STORE — حفظ إحصائيات البث (stats/live-session-stats.js) في
 * SQLite (جدول live_session_stats)، عشان إعادة تشغيل السيرفر (نشر جديد على
 * Render) ما تصفّر توب المكبّسين والداعمين وسط البث.
 *
 * صف لكل يوزر ستريمر = آخر جلسة بث له كـJSON. ما نكتب لكل حدث — الجلسة
 * تنعلّم "متغيّرة" وlive-session-stats يكتبها دفعة كل فترة وعند SIGTERM.
 *
 * روابط الصور تنحفظ بس لأصحاب التوب (أعلى maxTop بكل قسم) عشان حجم الصف
 * ما يكبر مع آلاف المشاهدين؛ الباقين ترجع صورهم مع أول حدث جديد منهم.
 *
 * db = اتصال better-sqlite3 (backend/db/database.js بالإنتاج، أو :memory: بالاختبار).
 * أي صف تالف ينتجاهل بدل ما يوقف تحميل الباقي.
 */
'use strict';

var VERSION = 1;
var RECORD_FIELDS = ['id', 'name', 'count', 'diamonds', 'joinedAt', 'lastSeenAt'];

function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/**
 * جلسة بالذاكرة → كائن JSON.
 * @param {Object} s - الجلسة (lists/avatars عبارة عن Map)
 * @param {Object<string,string>} sections - القسم -> حقل الترتيب
 * @param {number} maxTop
 */
function serialize(s, sections, maxTop) {
    var lists = {};
    var keepAvatars = new Set();
    Object.keys(sections).forEach(function (k) {
        var arr = [];
        s.lists[k].forEach(function (r) {
            var o = {};
            RECORD_FIELDS.forEach(function (f) { o[f] = r[f]; });
            arr.push(o);
        });
        lists[k] = arr;
        var field = sections[k];
        arr.map(function (r) { return { id: r.id, v: field === 'watchMs' ? num(r.lastSeenAt) - num(r.joinedAt) : num(r[field]) }; })
            .sort(function (a, b) { return b.v - a.v; })
            .slice(0, maxTop)
            .forEach(function (x) { keepAvatars.add(x.id); });
    });
    var avatars = [];
    keepAvatars.forEach(function (id) { if (s.avatars.has(id)) avatars.push([id, s.avatars.get(id)]); });
    return {
        v: VERSION,
        username: s.username,
        roomId: s.roomId,
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
        endedAt: s.endedAt,
        totals: s.totals,
        lists: lists,
        avatars: avatars,
        recentGifts: s.recentGifts || [],
        giftSeq: s.giftSeq || 0
    };
}

/**
 * كائن JSON → جلسة بالذاكرة، أو null لو الشكل غلط.
 * @param {Object} o
 * @param {Object<string,string>} sections
 * @param {function(string, *, *): Object} newSession - نفس newSession بـlive-session-stats
 */
function deserialize(o, sections, newSession) {
    if (!o || o.v !== VERSION || typeof o.username !== 'string' || !o.username) return null;
    var s = newSession(o.username, o.roomId || null, null);
    s.startedAt = num(o.startedAt) || Date.now();
    s.lastActivityAt = num(o.lastActivityAt) || s.startedAt;
    s.endedAt = o.endedAt ? num(o.endedAt) : null;
    Object.keys(s.totals).forEach(function (k) { if (o.totals && o.totals[k] != null) s.totals[k] = num(o.totals[k]); });
    Object.keys(sections).forEach(function (k) {
        var arr = o.lists && Array.isArray(o.lists[k]) ? o.lists[k] : [];
        arr.forEach(function (r) {
            if (!r || r.id == null) return;
            s.lists[k].set(r.id, {
                id: r.id, name: String(r.name || r.id),
                count: num(r.count), diamonds: num(r.diamonds),
                joinedAt: num(r.joinedAt), lastSeenAt: num(r.lastSeenAt)
            });
        });
    });
    // وعاء الهدايا (حقول أُضيفت لاحقاً — الصفوف القديمة بدونها)
    s.recentGifts = (Array.isArray(o.recentGifts) ? o.recentGifts : []).filter(function (g) { return g && num(g.seq) > 0; }).map(function (g) {
        return {
            seq: num(g.seq), name: String(g.name || ''), img: typeof g.img === 'string' ? g.img : null,
            giftId: g.giftId != null ? String(g.giftId) : null,
            count: num(g.count) || 1, diamonds: num(g.diamonds), user: String(g.user || ''), at: num(g.at)
        };
    });
    s.giftSeq = Math.max(num(o.giftSeq), s.recentGifts.length ? s.recentGifts[s.recentGifts.length - 1].seq : 0);
    (Array.isArray(o.avatars) ? o.avatars : []).forEach(function (pair) {
        if (Array.isArray(pair) && pair[0] != null && Array.isArray(pair[1])) s.avatars.set(pair[0], pair[1].slice(0, 3));
    });
    return s;
}

function createStore(db) {
    db.exec('CREATE TABLE IF NOT EXISTS live_session_stats (username TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    var put = db.prepare('INSERT INTO live_session_stats (username, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
    var del = db.prepare('DELETE FROM live_session_stats WHERE username = ?');
    var delOld = db.prepare('DELETE FROM live_session_stats WHERE updated_at < ?');
    var all = db.prepare('SELECT username, data FROM live_session_stats');
    return {
        save: function (username, obj) { put.run(String(username), JSON.stringify(obj), Date.now()); },
        remove: function (username) { del.run(String(username)); },
        removeOlderThan: function (ts) { delOld.run(ts); },
        loadAll: function () {
            var out = [];
            all.all().forEach(function (row) { try { out.push(JSON.parse(row.data)); } catch (e) { /* صف تالف */ } });
            return out;
        }
    };
}

module.exports = { createStore: createStore, serialize: serialize, deserialize: deserialize };
