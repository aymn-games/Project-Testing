/**
 * «حفلة عيد الميلاد» — حفظ الحفلات في SQLite (جدول party_rooms)، عشان إعادة تشغيل
 * السيرفر (نشر جديد على Render) ما تمسح حفلة مجدولة: نفس الرقم والباركودات واللاعبين
 * وأشكالهم والتهاني ترجع، وparty-rooms.restore يكمّل من المرحلة الصحيحة حسب الساعة.
 * db = اتصال better-sqlite3 (backend/db/database.js بالإنتاج، أو :memory: بالاختبار).
 * أي صف تالف ينتجاهل بدل ما يوقف تحميل الباقي.
 */
'use strict';

function createStore(db) {
    db.exec('CREATE TABLE IF NOT EXISTS party_rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    var put = db.prepare('INSERT INTO party_rooms (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
    var del = db.prepare('DELETE FROM party_rooms WHERE code = ?');
    var all = db.prepare('SELECT code, data FROM party_rooms');
    return {
        save: function (code, obj) { put.run(String(code), JSON.stringify(obj), Date.now()); },
        remove: function (code) { del.run(String(code)); },
        loadAll: function () {
            var out = [];
            all.all().forEach(function (row) { try { out.push(JSON.parse(row.data)); } catch (e) { /* صف تالف */ } });
            return out;
        }
    };
}

module.exports = { createStore: createStore };
