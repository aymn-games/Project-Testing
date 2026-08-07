/**
 * ==========================================================================
 *  AGP DATABASE — قاعدة بيانات دائمة (SQLite عبر better-sqlite3)
 * ==========================================================================
 *
 * ملف واحد على القرص (agp-data.sqlite)، لا سيرفر قاعدة بيانات منفصل.
 *
 * ⚠️ **قرص Render الدائم (Persistent Disk) إلزامي لبقاء البيانات فعلياً**:
 *   Render (الاستضافة الحالية) يمسح أي ملفات محلية غير موجودة على قرص
 *   دائم مُرفَق صراحةً، وذلك في كل مرة تُعاد فيها الخدمة (نشر جديد، أو
 *   حتى مجرد استيقاظ الخدمة بعد فترة خمول على الخطط غير المدفوعة) —
 *   هذا سبب اختفاء الحسابات (حتى حساب الأدمن) المُلاحَظ فعلياً، وليس
 *   خللاً بمنطق التطبيق. الحل: إرفاق قرص دائم (Persistent Disk) من
 *   لوحة Render بمسار وصل (Mount Path) قيمته بالضبط `/var/data`، على
 *   خطة مدفوعة (الخطط المجانية لا تدعم الأقراص الدائمة إطلاقاً). لو
 *   ذلك المسار موجود فعلياً (أي القرص مُرفَق ومُوصَّل)، قاعدة البيانات
 *   تُخزَّن فيه تلقائياً؛ غير ذلك (بيئة تطوير محلية، أو الخدمة بدون قرص
 *   مُرفَق بعد) ترجع لنفس السلوك القديم بالضبط (ملف بجانب مجلد backend/).
 *   راجع docs/CHANGELOG.md للتفاصيل الكاملة وخطوات الإعداد على Render.
 *
 * الجداول:
 *   users       — حسابات الستريمرز (+ حساب أدمن واحد)
 *   sessions    — جلسات تسجيل الدخول (Token مؤقّت لكل تسجيل دخول)
 *   broadcasts  — سجل كل بث مباشر رُبط بالمنصة (بداية/نهاية + إحصائياته)
 * ==========================================================================
 */

'use strict';

var fs = require('fs');
var path = require('path');
var Database = require('better-sqlite3');
var logger = require('../utils/logger');

var RENDER_DISK_MOUNT_PATH = '/var/data';
var DB_DIR = fs.existsSync(RENDER_DISK_MOUNT_PATH) ? RENDER_DISK_MOUNT_PATH : path.join(__dirname, '..');
var DB_PATH = path.join(DB_DIR, 'agp-data.sqlite');

logger.log('Database: using ' + (DB_DIR === RENDER_DISK_MOUNT_PATH ? 'persistent Render disk' : 'local (non-persistent) path') + ' — ' + DB_PATH);

var db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // أداء أفضل مع كتابة متزامنة أثناء البث

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_id TEXT UNIQUE,
        tiktok_username TEXT,
        tiktok_verified INTEGER NOT NULL DEFAULT 0,
        tiktok_verification_code TEXT,
        custom_id TEXT UNIQUE,
        is_streamer INTEGER NOT NULL DEFAULT 0,
        permissions TEXT NOT NULL DEFAULT '{}',
        role TEXT NOT NULL DEFAULT 'streamer' CHECK(role IN ('admin', 'streamer')),
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tiktok_username TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        comments_count INTEGER NOT NULL DEFAULT 0,
        gifts_count INTEGER NOT NULL DEFAULT 0,
        gifts_value_total INTEGER NOT NULL DEFAULT 0,
        follows_count INTEGER NOT NULL DEFAULT 0,
        players_joined_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_user ON broadcasts(user_id);
`);

/**
 * ترقية آمنة لقاعدة بيانات كانت موجودة قبل هذا التعديل (أُنشئت بدون
 * أعمدة google_id/tiktok_username) — تضيفهم فقط إن لم يكونا موجودين،
 * بدون فقدان أي بيانات مخزَّنة مسبقاً.
 */
function ensureColumn(table, column, definition) {
    var existing = db.prepare('PRAGMA table_info(' + table + ')').all();
    var hasColumn = existing.some(function (col) { return col.name === column; });
    if (!hasColumn) {
        db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
        logger.log('Database: migrated — added column ' + table + '.' + column);
    }
}
ensureColumn('users', 'google_id', 'TEXT');
ensureColumn('users', 'tiktok_username', 'TEXT');
ensureColumn('users', 'tiktok_verified', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'tiktok_verification_code', 'TEXT');
ensureColumn('users', 'custom_id', 'TEXT');
ensureColumn('users', 'is_streamer', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'permissions', "TEXT NOT NULL DEFAULT '{}'");

logger.log('Database: ready at ' + DB_PATH);

module.exports = db;
