/**
 * VEYRO DATABASE — قاعدة بيانات فيرو (SQLite) على قرص سيرفر فيرو، منفصلة عن
 * قاعدة سيرفر الألعاب. جداول الخدمات (الشاشات، المكتبة، Streamlabs…) تنشئها
 * الخدمات نفسها؛ هنا جدولين بس:
 *
 * - users: نسخة من بيانات الحساب اللي يحتاجها فيرو (اليوزر، تيك توك، الصلاحيات،
 *   الاسم والصورة) — تنكتب من سيرفر الألعاب كل ما يتأكد فيرو من الحساب
 *   (core/core-auth.js). اسمه users عشان استعلامات الخدمات المنقولة تشتغل بدون تغيير.
 *   رابط الشاشة بـOBS يقرأ يوزر صاحبها من هنا، فما يحتاج سيرفر الألعاب أبداً.
 * - veyro_prefs: إعدادات فيرو للحساب (الحساب التلقائي لإحصائيات البث).
 */

'use strict';

var fs = require('fs');
var path = require('path');
var Database = require('better-sqlite3');
var config = require('../config');
var logger = require('../utils/logger');

function dataDir() {
    if (config.dataDir) return config.dataDir;
    return fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, '..');
}

function init(db) {
    db.exec(
        'CREATE TABLE IF NOT EXISTS users (' +
        '  id INTEGER PRIMARY KEY,' +
        '  username TEXT,' +
        '  display_name TEXT,' +
        '  role TEXT,' +
        '  is_streamer INTEGER NOT NULL DEFAULT 0,' +
        '  permissions TEXT NOT NULL DEFAULT \'{}\',' +
        '  tiktok_username TEXT,' +
        '  tiktok_verified INTEGER NOT NULL DEFAULT 0,' +
        '  tiktok_display_name TEXT,' +
        '  tiktok_avatar_url TEXT,' +
        '  avatar_image_base64 TEXT,' +
        '  updated_at INTEGER NOT NULL' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_users_tiktok ON users(tiktok_username);' +
        // آخر تأكيد ناجح لكل توكن (بصمته بس، مو التوكن نفسه) — المحرر يكمل لو سيرفر فيرو
        // انعاد تشغيله وسيرفر الألعاب طايح بنفس الوقت (core/core-auth.js)
        'CREATE TABLE IF NOT EXISTS veyro_sessions (' +
        '  token_hash TEXT PRIMARY KEY,' +
        '  user_id INTEGER NOT NULL,' +
        '  at INTEGER NOT NULL' +
        ');' +
        'CREATE TABLE IF NOT EXISTS veyro_prefs (' +
        '  user_id INTEGER PRIMARY KEY,' +
        '  stats_watch INTEGER NOT NULL DEFAULT 0,' +
        '  updated_at INTEGER NOT NULL' +
        ');'
    );
    return db;
}

var DIR = dataDir();
var DB_PATH = path.join(DIR, 'veyro-data.sqlite');
logger.info('Database: ' + DB_PATH);
var db = init(new Database(DB_PATH));
db.pragma('journal_mode = WAL');

module.exports = db;
module.exports.DATA_DIR = DIR;
module.exports.init = init;
