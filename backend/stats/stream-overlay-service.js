/**
 * AGP STREAM OVERLAY SERVICE — «رابط الأوفرلي»: رابط خاص لكل مذيع
 * (overlay.html?k=<رمز>) يحطه بـOBS أو TikTok LIVE Studio كـBrowser Source.
 *
 * - تصميم الأوفرلي (نفس كائن js/agp-stream-overlay.js) ينحفظ هنا من
 *   «استوديو البث» عشان الرابط يقرأه من أي جهاز بدون تسجيل دخول.
 * - الرمز (overlay_key) سري ويكفي لوحده لقراءة التصميم وإحصائيات بث المذيع
 *   (قراءة فقط). المذيع يقدر يغيّره من الاستوديو لو تسرّب، والقديم يوقف فوراً.
 *
 * الجدول (stream_overlays) ينشأ هنا عشان الخدمة تنختبر بقاعدة بيانات بالذاكرة.
 */

'use strict';

var crypto = require('crypto');

var MAX_DESIGN_BYTES = 90 * 1024; // أقل من حد جسم الطلب (body-parser 100KB)
var MAX_ITEMS = 60;
var KEY_RE = /^[a-f0-9]{32}$/;

function newKey() { return crypto.randomBytes(16).toString('hex'); }

/**
 * @param {import('better-sqlite3').Database} db
 */
function createService(db) {
    db.exec(
        'CREATE TABLE IF NOT EXISTS stream_overlays (' +
        '    user_id INTEGER PRIMARY KEY,' +
        '    overlay_key TEXT NOT NULL UNIQUE,' +
        '    design TEXT,' +
        '    updated_at INTEGER NOT NULL DEFAULT 0' +
        ')'
    );

    function row(userId) {
        return db.prepare('SELECT overlay_key, design, updated_at FROM stream_overlays WHERE user_id = ?').get(userId) || null;
    }

    function parse(design) {
        if (!design) return null;
        try { return JSON.parse(design); } catch (e) { return null; }
    }

    /** رمز المذيع وتصميمه — ينشئ الرمز أول مرة. */
    function getOwn(userId) {
        var r = row(userId);
        if (!r) {
            db.prepare('INSERT INTO stream_overlays (user_id, overlay_key, design, updated_at) VALUES (?, ?, NULL, 0)').run(userId, newKey());
            r = row(userId);
        }
        return { key: r.overlay_key, design: parse(r.design), updatedAt: r.updated_at };
    }

    /**
     * @param {number} userId
     * @param {*} design - كائن التصميم من الاستوديو
     * @returns {{success: boolean, error?: string, updatedAt?: number}}
     */
    function saveDesign(userId, design) {
        if (!design || typeof design !== 'object' || Array.isArray(design) || !Array.isArray(design.items)) {
            return { success: false, error: 'invalid_design' };
        }
        if (design.items.length > MAX_ITEMS) return { success: false, error: 'too_many_items' };
        var json = JSON.stringify(design);
        if (Buffer.byteLength(json, 'utf8') > MAX_DESIGN_BYTES) return { success: false, error: 'design_too_large' };
        getOwn(userId);
        var at = Date.now();
        db.prepare('UPDATE stream_overlays SET design = ?, updated_at = ? WHERE user_id = ?').run(json, at, userId);
        return { success: true, updatedAt: at };
    }

    /** رمز جديد — الرابط القديم يوقف فوراً. */
    function rotateKey(userId) {
        getOwn(userId);
        var key = newKey();
        db.prepare('UPDATE stream_overlays SET overlay_key = ? WHERE user_id = ?').run(key, userId);
        return key;
    }

    /** @returns {{userId: number, design: Object|null, updatedAt: number}|null} */
    function findByKey(key) {
        key = String(key || '').toLowerCase();
        if (!KEY_RE.test(key)) return null;
        var r = db.prepare('SELECT user_id, design, updated_at FROM stream_overlays WHERE overlay_key = ?').get(key);
        return r ? { userId: r.user_id, design: parse(r.design), updatedAt: r.updated_at } : null;
    }

    /** يوزر تيك توك الموثّق لصاحب الرابط (الإحصائيات تنقرأ عليه) — أو null. */
    function ownerTikTok(userId) {
        var u = db.prepare('SELECT tiktok_username, tiktok_verified FROM users WHERE id = ?').get(userId);
        return u && u.tiktok_verified && u.tiktok_username ? u.tiktok_username : null;
    }

    return { getOwn: getOwn, saveDesign: saveDesign, rotateKey: rotateKey, findByKey: findByKey, ownerTikTok: ownerTikTok };
}

var instance = null;
function get() {
    if (!instance) instance = createService(require('../db/database'));
    return instance;
}

module.exports = {
    createService: createService,
    getOwn: function (userId) { return get().getOwn(userId); },
    saveDesign: function (userId, design) { return get().saveDesign(userId, design); },
    rotateKey: function (userId) { return get().rotateKey(userId); },
    findByKey: function (key) { return get().findByKey(key); },
    ownerTikTok: function (userId) { return get().ownerTikTok(userId); }
};
