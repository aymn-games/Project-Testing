/**
 * «المافيا» — حفظ الرومات والمباريات في SQLite (جدول mafia_rooms)، عشان إعادة تشغيل
 * السيرفر (نشر جديد على Render) ما تطلّع اللاعبين وتنهي المباراة: نفس الرقم واللاعبين
 * ومفاتيحهم والمباراة كاملة ترجع، والجوالات وشاشة البث يكملون بـresume/host بدون ما يحسون.
 * نفس طريقة party/party-store.js. db = اتصال better-sqlite3 (backend/db/database.js بالإنتاج، أو :memory: بالاختبار).
 * أي صف تالف ينتجاهل بدل ما يوقف تحميل الباقي.
 */
'use strict';

function createStore(db) {
    db.exec('CREATE TABLE IF NOT EXISTS mafia_rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    var put = db.prepare('INSERT INTO mafia_rooms (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
    var del = db.prepare('DELETE FROM mafia_rooms WHERE code = ?');
    var all = db.prepare('SELECT code, data FROM mafia_rooms');
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
