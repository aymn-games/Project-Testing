/**
 * ==========================================================================
 *  AGP DATABASE — قاعدة بيانات دائمة (SQLite عبر better-sqlite3)
 * ==========================================================================
 *
 * ملف واحد على القرص (agp-data.sqlite)، لا سيرفر قاعدة بيانات منفصل —
 * أنسب خيار لخطة استضافة VPS مفردة. البيانات هنا **دائمة** (لا تُفقَد
 * عند إعادة تشغيل الخادم)، بخلاف كل شي بُني قبل هذا (كان في الذاكرة
 * فقط أو localStorage بالمتصفح).
 *
 * الجداول:
 *   users       — حسابات الستريمرز (+ حساب أدمن واحد)
 *   sessions    — جلسات تسجيل الدخول (Token مؤقّت لكل تسجيل دخول)
 *   broadcasts  — سجل كل بث مباشر رُبط بالمنصة (بداية/نهاية + إحصائياته)
 * ==========================================================================
 */

'use strict';

var path = require('path');
var Database = require('better-sqlite3');
var logger = require('../utils/logger');

var DB_PATH = path.join(__dirname, '..', 'agp-data.sqlite');

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
