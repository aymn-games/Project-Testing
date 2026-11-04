/**
 * AGP SCREEN MEDIA SERVICE — ملفات «أليرت الفيديو» لشاشات البث (Veyro: veyro/).
 * الستريمر يرفع فيديو الأليرت حقه (MP4 / WebM / MOV)، وينحفظ على قرص السيرفر،
 * والشاشة تشغّله برابط عام بمعرّف عشوائي طويل (ما ينخمّن):
 *   GET /api/screens/media/file?id=<id>
 *
 * - الملفات بـ<DB_DIR>/screen-media/ (قرص Render الدائم /var/data لو موجود)،
 *   وبياناتها بجدول screen_media.
 * - حدود: MAX_FILE_BYTES للملف، MAX_FILES لكل حساب.
 * - النوع يتحدد من أول بايتات الملف (مو من اسم الملف أو ترويسة المتصفح).
 */

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
var MAX_FILES = 10;
var MAX_NAME = 60;
var ID_RE = /^[a-f0-9]{32}$/;

function defaultDir() {
    var disk = '/var/data';
    return path.join(fs.existsSync(disk) ? disk : path.join(__dirname, '..'), 'screen-media');
}

function cleanName(name) {
    return String(name == null ? '' : name).replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'أليرت';
}

function num(v, min, max) {
    var n = Number(v);
    return isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
}

var KEY_MODES = ['color', 'black', 'white', 'screen'];
var HEX_RE = /^#[0-9a-f]{6}$/i;
/** ينظّف إعدادات التفريغ اللي جاية من المتصفح (نفس حقول KEY_DEFAULT بالأوفرلي). */
function cleanKey(k) {
    return {
        on: k.on !== false,
        mode: KEY_MODES.indexOf(k.mode) === -1 ? 'color' : k.mode,
        color: HEX_RE.test(k.color || '') ? k.color : '#00ff00',
        floor: HEX_RE.test(k.floor || '') ? k.floor : '#000000',
        sim: num(k.sim, 0, 1), smooth: num(k.smooth, 0, 1), spill: num(k.spill, 0, 1),
        choke: num(k.choke, 0, 0.9), keepBg: num(k.keepBg, 0, 1),
        opacity: k.opacity == null ? 1 : num(k.opacity, 0.05, 1),
        protect: k.protect !== false
    };
}

/** نوع الفيديو من أول بايتات الملف، أو null لو مو فيديو مدعوم. */
function sniff(head) {
    if (!head || head.length < 12) return null;
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm';
    if (head.toString('ascii', 4, 8) === 'ftyp') {
        var brand = head.toString('ascii', 8, 12);
        return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
    }
    return null;
}

/**
 * @param {Database} db
 * @param {string} [dir] مجلد الملفات (للاختبارات)
 */
function createService(db, dir) {
    dir = dir || defaultDir();
    db.exec(
        'CREATE TABLE IF NOT EXISTS screen_media (' +
        '    id TEXT PRIMARY KEY,' +
        '    user_id INTEGER NOT NULL,' +
        '    name TEXT NOT NULL,' +
        '    mime TEXT NOT NULL,' +
        '    size INTEGER NOT NULL,' +
        '    width INTEGER NOT NULL DEFAULT 0,' +
        '    height INTEGER NOT NULL DEFAULT 0,' +
        '    duration REAL NOT NULL DEFAULT 0,' +
        '    created_at INTEGER NOT NULL' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_screen_media_user ON screen_media(user_id);'
    );
    // «مكتبتي»: إعدادات الأليرت المحفوظة مع الملف (التفريغ) — JSON
    var cols = db.prepare('PRAGMA table_info(screen_media)').all().map(function (c) { return c.name; });
    if (cols.indexOf('settings') === -1) db.exec("ALTER TABLE screen_media ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'");

    function fileOf(id) { return path.join(dir, id); }

    function shape(r) {
        var st = {};
        try { st = JSON.parse(r.settings || '{}') || {}; } catch (e) { st = {}; }
        return { id: r.id, name: r.name, mime: r.mime, size: r.size, w: r.width, h: r.height, d: r.duration, createdAt: r.created_at, key: st.key || null };
    }

    function list(userId) {
        return db.prepare('SELECT * FROM screen_media WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(shape);
    }

    function count(userId) {
        return db.prepare('SELECT COUNT(*) AS n FROM screen_media WHERE user_id = ?').get(userId).n;
    }

    /**
     * يقرأ جسم الطلب (الملف نفسه) لملف مؤقت بحد أقصى، يتأكد من نوعه، ويحفظه.
     * @param {number} userId
     * @param {{name?:string, w?:number, h?:number, d?:number}} meta من المتصفح
     * @param {stream.Readable} input جسم الطلب
     * @param {number} [declared] Content-Length لو موجود
     * @returns {Promise<{success:boolean, error?:string, media?:Object}>}
     */
    function upload(userId, meta, input, declared) {
        return new Promise(function (resolve) {
            if (count(userId) >= MAX_FILES) { input.resume(); resolve({ success: false, error: 'too_many_files', max: MAX_FILES }); return; }
            if (declared && declared > MAX_FILE_BYTES) { input.resume(); resolve({ success: false, error: 'file_too_large', max: MAX_FILE_BYTES }); return; }
            try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { resolve({ success: false, error: 'storage_unavailable' }); return; }
            var id = crypto.randomBytes(16).toString('hex');
            var tmp = fileOf(id + '.part');
            var out = fs.createWriteStream(tmp);
            var size = 0, head = [], headLen = 0, done = false;
            function finish(result) {
                if (done) return;
                done = true;
                if (!result.success) { out.destroy(); fs.unlink(tmp, function () {}); }
                resolve(result);
            }
            input.on('data', function (chunk) {
                if (done) return;
                size += chunk.length;
                if (size > MAX_FILE_BYTES) { finish({ success: false, error: 'file_too_large', max: MAX_FILE_BYTES }); input.resume(); return; }
                if (headLen < 16) { head.push(chunk); headLen += chunk.length; }
                if (!out.write(chunk)) { input.pause(); out.once('drain', function () { input.resume(); }); }
            });
            input.on('error', function () { finish({ success: false, error: 'upload_failed' }); });
            input.on('end', function () {
                if (done) return;
                var mime = sniff(Buffer.concat(head));
                if (!size) { finish({ success: false, error: 'empty_file' }); return; }
                if (!mime) { finish({ success: false, error: 'unsupported_type' }); return; }
                out.end(function () {
                    if (done) return;
                    fs.rename(tmp, fileOf(id), function (err) {
                        if (err) { finish({ success: false, error: 'storage_unavailable' }); return; }
                        var row = {
                            id: id, user_id: userId, name: cleanName(meta.name), mime: mime, size: size,
                            width: Math.round(num(meta.w, 0, 10000)), height: Math.round(num(meta.h, 0, 10000)),
                            duration: Math.round(num(meta.d, 0, 3600) * 100) / 100, created_at: Date.now()
                        };
                        db.prepare('INSERT INTO screen_media (id, user_id, name, mime, size, width, height, duration, created_at) VALUES (@id, @user_id, @name, @mime, @size, @width, @height, @duration, @created_at)').run(row);
                        row.settings = '{}';
                        done = true;
                        resolve({ success: true, media: shape(row) });
                    });
                });
            });
        });
    }

    function remove(userId, id) {
        if (!ID_RE.test(String(id || ''))) return { success: false, error: 'not_found' };
        var r = db.prepare('DELETE FROM screen_media WHERE id = ? AND user_id = ?').run(id, userId);
        if (!r.changes) return { success: false, error: 'not_found' };
        fs.unlink(fileOf(id), function () {});
        return { success: true };
    }

    /**
     * تعديل ملف بالمكتبة: الاسم و/أو إعدادات التفريغ (key). key = null يشيل التفريغ.
     * التفريغ ينحفظ كما هو بعد تنظيف بسيط (أرقام بحدودها وألوان hex بس).
     */
    function update(userId, id, patch) {
        if (!ID_RE.test(String(id || ''))) return { success: false, error: 'not_found' };
        var r = db.prepare('SELECT * FROM screen_media WHERE id = ? AND user_id = ?').get(id, userId);
        if (!r) return { success: false, error: 'not_found' };
        patch = patch || {};
        var st = {};
        try { st = JSON.parse(r.settings || '{}') || {}; } catch (e) { st = {}; }
        if ('key' in patch) {
            if (patch.key && typeof patch.key === 'object') st.key = cleanKey(patch.key);
            else delete st.key;
        }
        var name = patch.name != null ? cleanName(patch.name) : r.name;
        db.prepare('UPDATE screen_media SET name = ?, settings = ? WHERE id = ?').run(name, JSON.stringify(st), id);
        r.name = name;
        r.settings = JSON.stringify(st);
        return { success: true, media: shape(r) };
    }

    /** للرابط العام: بيانات الملف ومساره، أو null. */
    function find(id) {
        if (!ID_RE.test(String(id || ''))) return null;
        var r = db.prepare('SELECT * FROM screen_media WHERE id = ?').get(id);
        if (!r) return null;
        var file = fileOf(id);
        if (!fs.existsSync(file)) return null;
        return { mime: r.mime, size: r.size, file: file };
    }

    return { list: list, upload: upload, remove: remove, find: find, update: update };
}

var instance = null;
function get() {
    if (!instance) instance = createService(require('../db/database'));
    return instance;
}

module.exports = {
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    MAX_FILES: MAX_FILES,
    createService: createService,
    sniff: sniff,
    list: function (userId) { return get().list(userId); },
    upload: function (userId, meta, input, declared) { return get().upload(userId, meta, input, declared); },
    remove: function (userId, id) { return get().remove(userId, id); },
    update: function (userId, id, patch) { return get().update(userId, id, patch); },
    cleanKey: cleanKey,
    find: function (id) { return get().find(id); }
};
