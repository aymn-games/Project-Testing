/**
 * إرجاع جدولَي بطاقات الإقصاء/الفوز للشكل القديم (بطاقة واحدة لكل مستخدم)
 * — يُشغَّل يدوياً فقط لو احتجتوا ترجعون لنسخة الكود اللي قبل تعدد
 * البطاقات (الكود القديم يعتمد على user_id كمفتاح أساسي ويفشل بدونه).
 *
 * التشغيل (والسيرفر موقوف، قبل نشر النسخة القديمة):
 *     node backend/db/rollback-multi-cards.js
 *
 * لكل مستخدم تبقى بطاقة وحدة: المفعّلة لو فيه، وإلا الأحدث منحاً (بنفس
 * حالة الإيقاف). باقي البطاقات تنحذف. آمن للتكرار: لو الجدول أصلاً
 * بالشكل القديم ما يسوي شي.
 *
 * ⚠️ لا يستورد database.js عمداً — لأنه يعيد الترحيل للشكل الجديد فوراً.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var Database = require('better-sqlite3');

// نفس منطق مسار القاعدة بـdatabase.js.
var RENDER_DISK_MOUNT_PATH = '/var/data';
var DB_DIR = fs.existsSync(RENDER_DISK_MOUNT_PATH) ? RENDER_DISK_MOUNT_PATH : path.join(__dirname, '..');
var DB_PATH = path.join(DB_DIR, 'agp-data.sqlite');

if (!fs.existsSync(DB_PATH)) {
    console.log('No database at ' + DB_PATH + ' — nothing to do.');
    process.exit(0);
}

var db = new Database(DB_PATH);

function rollbackTable(table) {
    var cols = db.prepare('PRAGMA table_info(' + table + ')').all();
    if (!cols.length || !cols.some(function (col) { return col.name === 'id'; })) {
        console.log(table + ': already single-card (or missing) — skipped.');
        return;
    }

    var before = db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;

    db.transaction(function () {
        db.exec(
            'CREATE TABLE ' + table + '_old (' +
            '    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,' +
            '    card_key TEXT NOT NULL,' +
            '    enabled INTEGER NOT NULL DEFAULT 1,' +
            "    granted_by TEXT NOT NULL DEFAULT 'admin_manual'," +
            '    granted_at INTEGER NOT NULL' +
            ');' +
            // صف وحد لكل مستخدم: المفعّلة أولاً، ثم الأحدث منحاً.
            'INSERT INTO ' + table + '_old (user_id, card_key, enabled, granted_by, granted_at) ' +
            '    SELECT user_id, card_key, enabled, granted_by, granted_at FROM (' +
            '        SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY enabled DESC, granted_at DESC, id DESC) AS rn' +
            '        FROM ' + table +
            '    ) WHERE rn = 1;' +
            'DROP TABLE ' + table + ';' +
            'ALTER TABLE ' + table + '_old RENAME TO ' + table + ';'
        );
    })();

    var after = db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
    console.log(table + ': rolled back to single-card — ' + before + ' rows → ' + after + ' (one per user).');
}

rollbackTable('user_elim_cards');
rollbackTable('user_win_cards');
db.close();
