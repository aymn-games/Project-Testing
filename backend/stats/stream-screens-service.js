/**
 * AGP STREAM SCREENS SERVICE — «شاشات البث» (obs-studio.html): كل ستريمر يسوي
 * أكثر من شاشة (بداية البث، اللعب، استراحة…)، ولكل شاشة رابط خاص
 * (overlay.html?k=<رمز>) يحطه بـOBS أو TikTok LIVE Studio كـBrowser Source.
 *
 * - تصميم الشاشة = نفس كائن js/agp-stream-overlay.js ({ v, template, items… }).
 * - الرمز (screen_key) سري ويكفي لوحده لقراءة تصميم الشاشة وإحصائيات بث صاحبها
 *   (قراءة فقط، بدون حساب). المذيع يقدر يغيّره، والرابط القديم يوقف فوراً.
 *
 * الجدول (stream_screens) ينشأ هنا عشان الخدمة تنختبر بقاعدة بيانات بالذاكرة.
 */

'use strict';

var crypto = require('crypto');

var MAX_SCREENS = 12;
var MAX_DESIGN_BYTES = 90 * 1024; // أقل من حد جسم الطلب (body-parser 100KB)
var MAX_ITEMS = 80;
var MAX_NAME = 40;
var KEY_RE = /^[a-f0-9]{32}$/;

function newKey() { return crypto.randomBytes(16).toString('hex'); }

function cleanName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** @returns {string|null} JSON التصميم أو null لو غير صالح، مع سبب الرفض */
function checkDesign(design) {
    if (!design || typeof design !== 'object' || Array.isArray(design) || !Array.isArray(design.items)) return { error: 'invalid_design' };
    if (design.items.length > MAX_ITEMS) return { error: 'too_many_items' };
    var json = JSON.stringify(design);
    if (Buffer.byteLength(json, 'utf8') > MAX_DESIGN_BYTES) return { error: 'design_too_large' };
    return { json: json };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function createService(db) {
    db.exec(
        'CREATE TABLE IF NOT EXISTS stream_screens (' +
        '    id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '    user_id INTEGER NOT NULL,' +
        '    name TEXT NOT NULL,' +
        '    screen_key TEXT NOT NULL UNIQUE,' +
        '    design TEXT,' +
        '    created_at INTEGER NOT NULL,' +
        '    updated_at INTEGER NOT NULL' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_stream_screens_user ON stream_screens(user_id);'
    );

    function parse(design) {
        if (!design) return null;
        try { return JSON.parse(design); } catch (e) { return null; }
    }

    function shape(r) {
        return { id: r.id, name: r.name, key: r.screen_key, design: parse(r.design), updatedAt: r.updated_at };
    }

    function own(userId, id) {
        return db.prepare('SELECT * FROM stream_screens WHERE id = ? AND user_id = ?').get(Number(id) || 0, userId) || null;
    }

    /** شاشات المذيع بترتيب إنشائها. */
    function list(userId) {
        return db.prepare('SELECT * FROM stream_screens WHERE user_id = ? ORDER BY id').all(userId).map(shape);
    }

    /**
     * @param {number} userId
     * @param {string} name
     * @param {Object} [design] - تصميم مبدئي (تكرار شاشة)
     */
    function create(userId, name, design) {
        var count = db.prepare('SELECT COUNT(*) AS n FROM stream_screens WHERE user_id = ?').get(userId).n;
        if (count >= MAX_SCREENS) return { success: false, error: 'too_many_screens' };
        var json = null;
        if (design != null) {
            var c = checkDesign(design);
            if (c.error) return { success: false, error: c.error };
            json = c.json;
        }
        var at = Date.now();
        var info = db.prepare('INSERT INTO stream_screens (user_id, name, screen_key, design, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(userId, cleanName(name) || ('شاشة ' + (count + 1)), newKey(), json, at, at);
        return { success: true, screen: shape(own(userId, info.lastInsertRowid)) };
    }

    /** تعديل الاسم و/أو التصميم. */
    function save(userId, id, fields) {
        var r = own(userId, id);
        if (!r) return { success: false, error: 'not_found' };
        fields = fields || {};
        var name = r.name, json = r.design;
        if (fields.name != null) name = cleanName(fields.name) || r.name;
        if (fields.design != null) {
            var c = checkDesign(fields.design);
            if (c.error) return { success: false, error: c.error };
            json = c.json;
        }
        var at = Date.now();
        db.prepare('UPDATE stream_screens SET name = ?, design = ?, updated_at = ? WHERE id = ?').run(name, json, at, r.id);
        return { success: true, updatedAt: at, name: name };
    }

    function remove(userId, id) {
        var info = db.prepare('DELETE FROM stream_screens WHERE id = ? AND user_id = ?').run(Number(id) || 0, userId);
        return info.changes ? { success: true } : { success: false, error: 'not_found' };
    }

    /** رمز جديد — الرابط القديم يوقف فوراً. */
    function rotateKey(userId, id) {
        var r = own(userId, id);
        if (!r) return { success: false, error: 'not_found' };
        var key = newKey();
        db.prepare('UPDATE stream_screens SET screen_key = ? WHERE id = ?').run(key, r.id);
        return { success: true, key: key };
    }

    /** @returns {{userId: number, design: Object|null, updatedAt: number}|null} */
    function findByKey(key) {
        key = String(key || '').toLowerCase();
        if (!KEY_RE.test(key)) return null;
        var r = db.prepare('SELECT user_id, design, updated_at FROM stream_screens WHERE screen_key = ?').get(key);
        return r ? { userId: r.user_id, design: parse(r.design), updatedAt: r.updated_at } : null;
    }

    /** يوزر تيك توك الموثّق لصاحب الشاشة (الإحصائيات تنقرأ عليه) — أو null. */
    function ownerTikTok(userId) {
        var u = db.prepare('SELECT tiktok_username, tiktok_verified FROM users WHERE id = ?').get(userId);
        return u && u.tiktok_verified && u.tiktok_username ? u.tiktok_username : null;
    }

    return { list: list, create: create, save: save, remove: remove, rotateKey: rotateKey, findByKey: findByKey, ownerTikTok: ownerTikTok };
}

var instance = null;
function get() {
    if (!instance) instance = createService(require('../db/database'));
    return instance;
}

module.exports = {
    MAX_SCREENS: MAX_SCREENS,
    createService: createService,
    list: function (userId) { return get().list(userId); },
    create: function (userId, name, design) { return get().create(userId, name, design); },
    save: function (userId, id, fields) { return get().save(userId, id, fields); },
    remove: function (userId, id) { return get().remove(userId, id); },
    rotateKey: function (userId, id) { return get().rotateKey(userId, id); },
    findByKey: function (key) { return get().findByKey(key); },
    ownerTikTok: function (userId) { return get().ownerTikTok(userId); }
};
