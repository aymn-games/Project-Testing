/**
 * «شفته مرة وحدة» لكل حساب — إعلانات/شروحات تطلع للمستخدم مرة وحدة بس، ولو قفلها ما تطلع له
 * مرة ثانية أبداً حتى لو غيّر الجهاز (لأنها محفوظة بحسابه مو بالمتصفح).
 * المفتاح نص ثابت لكل إعلان (مثل 'mafia-news-2026-11')؛ إعلان جديد = مفتاح جديد.
 * الجدول user_seen_notices بـbackend/db/database.js. أي خطأ بالقاعدة ما يوقف اللعبة: hasSeen يرجع true
 * (ما نزعج المستخدم بإعلان لو ما قدرنا نتأكد) وmarkSeen يتجاهل.
 */
'use strict';

function db() { return require('../db/database'); }

function hasSeen(userId, key) {
    if (!userId || !key) return true;
    try { return !!db().prepare('SELECT 1 FROM user_seen_notices WHERE user_id = ? AND notice = ?').get(String(userId), String(key)); }
    catch (err) { return true; }
}

function markSeen(userId, key) {
    if (!userId || !key) return false;
    try { db().prepare('INSERT OR IGNORE INTO user_seen_notices (user_id, notice, seen_at) VALUES (?, ?, ?)').run(String(userId), String(key), Date.now()); return true; }
    catch (err) { return false; }
}

module.exports = { hasSeen: hasSeen, markSeen: markSeen };
