/**
 * VEYRO — نقل بيانات فيرو من سيرفر الألعاب (مرة النقل، وبعدها مزامنة لين يخلص الانتقال).
 *
 * يشتغل لما VEYRO_EXPORT_SECRET موجود بالسيرفرين (نفس القيمة): أول ما يشتغل سيرفر فيرو
 * وبعدها كل SYNC_MS. يطلب GET /api/internal/veyro-export من سيرفر الألعاب (بالسر)، ويحفظ:
 * الشاشات (بنفس الأرقام والرموز — روابط OBS القديمة تكمل)، المكتبة (والفيديوهات نفسها)،
 * مفاتيح يوتيوب، ربط Streamlabs والدونيشن، «الحساب التلقائي»، وبيانات أصحابها.
 *
 * قواعد التكرار الآمن:
 * - صف ما انقل قبل → ينضاف. صف انقل قبل → يتحدّث بس لو نسخة سيرفر الألعاب أحدث (updated_at).
 * - صف انقل قبل وانحذف بفيرو → ما يرجع (veyro_imported يتذكر كل اللي انقل).
 * - بعد ما يخلص الانتقال: احذف VEYRO_EXPORT_SECRET من الخدمتين (docs/VEYRO_SERVER.md).
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SYNC_MS = 10 * 60 * 1000;
var START_DELAY_MS = 5 * 1000;
var ID_RE = /^[a-f0-9]{32}$/;

/**
 * @param {object} deps — db, coreUrl, secret, mediaDir, fetch?, logger?
 */
function createImporter(deps) {
    var db = deps.db;
    var doFetch = deps.fetch || fetch;
    var log = deps.logger || { info: function () {}, error: function () {} };
    var running = null;

    db.exec('CREATE TABLE IF NOT EXISTS veyro_imported (tbl TEXT NOT NULL, pk TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (tbl, pk))');
    // الجداول نفسها تنشئها خدماتها — نتأكد إنها موجودة قبل الكتابة
    require('../stats/stream-screens-service').createService(db);
    require('../stats/screen-media-service').createService(db, deps.mediaDir);
    require('../stats/screen-audio-service').createService(db, {});
    require('../streamlabs/donations-store').createStore(db);

    var wasImported = db.prepare('SELECT 1 FROM veyro_imported WHERE tbl = ? AND pk = ?');
    var markImported = db.prepare('INSERT OR IGNORE INTO veyro_imported (tbl, pk, at) VALUES (?, ?, ?)');
    function seen(tbl, pk) { return Boolean(wasImported.get(tbl, String(pk))); }
    function mark(tbl, pk) { markImported.run(tbl, String(pk), Date.now()); }

    function headers() { return { 'X-Veyro-Secret': deps.secret }; }

    /** يطبّق تصدير سيرفر الألعاب على قاعدة فيرو. يرجّع عدّاد اللي تغيّر. */
    function apply(data) {
        var n = { users: 0, screens: 0, screensUpdated: 0, media: 0, audioKeys: 0, streamlabs: 0, donations: 0, statsWatch: 0, skipped: 0 };
        var coreAuth = require('../core/core-auth').createCoreAuth({ db: db, coreUrl: '' });
        db.transaction(function () {
            (data.users || []).forEach(function (u) { coreAuth.save(u); n.users++; });

            var getScreen = db.prepare('SELECT screen_key, updated_at FROM stream_screens WHERE id = ?');
            var keyTaken = db.prepare('SELECT id FROM stream_screens WHERE screen_key = ?');
            var insScreen = db.prepare('INSERT INTO stream_screens (id, user_id, name, screen_key, design, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
            var updScreen = db.prepare('UPDATE stream_screens SET name = ?, design = ?, screen_key = ?, updated_at = ? WHERE id = ?');
            var maxId = 0;
            (data.stream_screens || []).forEach(function (r) {
                maxId = Math.max(maxId, r.id);
                var cur = getScreen.get(r.id);
                if (!cur) {
                    if (seen('stream_screens', r.id)) return; // انحذفت بفيرو
                    var k = keyTaken.get(r.screen_key);
                    if (k) { n.skipped++; log.error('Import: screen ' + r.id + ' key already used by ' + k.id + ' — skipped.'); return; }
                    insScreen.run(r.id, r.user_id, r.name, r.screen_key, r.design, r.created_at, r.updated_at);
                    mark('stream_screens', r.id);
                    n.screens++;
                } else if (r.updated_at > cur.updated_at && seen('stream_screens', r.id)) {
                    updScreen.run(r.name, r.design, r.screen_key, r.updated_at, r.id);
                    n.screensUpdated++;
                } else if (!seen('stream_screens', r.id)) {
                    // رقم أخذته شاشة انسوت بفيرو — ما نلمسها
                    n.skipped++;
                    log.error('Import: screen id ' + r.id + ' already used by a Veyro screen — skipped.');
                }
            });
            // شاشات فيرو الجديدة تاخذ أرقام بعد أكبر رقم بسيرفر الألعاب (ما تتعارض مع اللي ينقل بعدين)
            if (maxId) {
                var seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'stream_screens'").get();
                var want = maxId + 1000;
                if (!seq) db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('stream_screens', ?)").run(want);
                else if (seq.seq < want) db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'stream_screens'").run(want);
            }

            var insMedia = db.prepare('INSERT OR IGNORE INTO screen_media (id, user_id, name, mime, size, width, height, duration, created_at, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            (data.screen_media || []).forEach(function (r) {
                if (!ID_RE.test(r.id) || seen('screen_media', r.id)) return;
                insMedia.run(r.id, r.user_id, r.name, r.mime, r.size, r.width, r.height, r.duration, r.created_at, r.settings || '{}');
                mark('screen_media', r.id);
                n.media++;
            });

            var getKey = db.prepare('SELECT updated_at FROM screen_audio_keys WHERE user_id = ?');
            var putKey = db.prepare('INSERT OR REPLACE INTO screen_audio_keys (user_id, youtube_key, updated_at) VALUES (?, ?, ?)');
            (data.screen_audio_keys || []).forEach(function (r) {
                var cur = getKey.get(r.user_id);
                if (cur ? r.updated_at > cur.updated_at : !seen('screen_audio_keys', r.user_id)) { putKey.run(r.user_id, r.youtube_key, r.updated_at); n.audioKeys++; }
                mark('screen_audio_keys', r.user_id);
            });

            var insLink = db.prepare('INSERT OR IGNORE INTO streamlabs_links (user_id, socket_token, status, last_error, linked_at, last_event_at, counter_from, auto_reset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            (data.streamlabs_links || []).forEach(function (r) {
                if (seen('streamlabs_links', r.user_id)) return; // انفصل بفيرو → ما يرجع
                n.streamlabs += insLink.run(r.user_id, r.socket_token, r.status, r.last_error, r.linked_at, r.last_event_at, r.counter_from, r.auto_reset).changes;
                mark('streamlabs_links', r.user_id);
            });
            var insDon = db.prepare('INSERT OR IGNORE INTO donations (user_id, sl_id, name, amount_cents, currency, message, is_test, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            (data.donations || []).forEach(function (r) {
                n.donations += insDon.run(r.user_id, r.sl_id, r.name, r.amount_cents, r.currency, r.message, r.is_test, r.received_at).changes;
            });

            var insWatch = db.prepare('INSERT OR IGNORE INTO veyro_prefs (user_id, stats_watch, updated_at) VALUES (?, 1, ?)');
            (data.stats_watch || []).forEach(function (userId) {
                if (seen('veyro_prefs', userId)) return;
                n.statsWatch += insWatch.run(userId, Date.now()).changes;
                mark('veyro_prefs', userId);
            });
        })();
        return n;
    }

    /** الفيديوهات اللي انقلت بياناتها وملفها مو موجود عندنا → ينزل من سيرفر الألعاب. */
    function fetchMissingFiles() {
        var rows = db.prepare('SELECT id, size FROM screen_media').all();
        fs.mkdirSync(deps.mediaDir, { recursive: true });
        var missing = rows.filter(function (r) { return !fs.existsSync(path.join(deps.mediaDir, r.id)); });
        var got = 0;
        return missing.reduce(function (chain, r) {
            return chain.then(function () {
                return doFetch(deps.coreUrl + '/api/internal/veyro-export/media?id=' + r.id, { headers: headers() }).then(function (res) {
                    if (res.status !== 200) { log.error('Import: media ' + r.id + ' → HTTP ' + res.status); return; }
                    return res.arrayBuffer().then(function (buf) {
                        var tmp = path.join(deps.mediaDir, r.id + '.part');
                        fs.writeFileSync(tmp, Buffer.from(buf));
                        fs.renameSync(tmp, path.join(deps.mediaDir, r.id));
                        got++;
                    });
                }).catch(function (err) { log.error('Import: media ' + r.id + ' failed:', err && err.message); });
            });
        }, Promise.resolve()).then(function () { return { missing: missing.length, downloaded: got }; });
    }

    /** دورة نقل كاملة. ما تتداخل (لو فيه وحدة شغّالة ترجع نفسها). */
    function run() {
        if (!deps.secret) return Promise.resolve({ skipped: 'no_secret' });
        if (running) return running;
        running = doFetch(deps.coreUrl + '/api/internal/veyro-export', { headers: headers() })
            .then(function (res) {
                if (res.status !== 200) throw new Error('export HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (!data || !data.success) throw new Error('export failed');
                var n = apply(data);
                return fetchMissingFiles().then(function (f) {
                    n.files = f;
                    log.info('Import from games server: ' + JSON.stringify(n));
                    return n;
                });
            })
            .catch(function (err) {
                log.error('Import from games server failed: ' + (err && err.message));
                return { error: err && err.message };
            })
            .finally(function () { running = null; });
        return running;
    }

    return { run: run, apply: apply, fetchMissingFiles: fetchMissingFiles };
}

var instance = null;
function get() {
    if (!instance) {
        var config = require('../config');
        var db = require('../db/database');
        instance = createImporter({
            db: db, coreUrl: config.coreApiUrl, secret: config.coreExportSecret,
            mediaDir: path.join(db.DATA_DIR, 'screen-media'), logger: require('../utils/logger')
        });
    }
    return instance;
}

/** من server.js: لو السر موجود ننقل أول ما يشتغل السيرفر وبعدها كل SYNC_MS. */
function startAutoImport() {
    if (!require('../config').coreExportSecret) return;
    setTimeout(function () {
        get().run();
        var t = setInterval(function () { get().run(); }, SYNC_MS);
        if (t.unref) t.unref();
    }, START_DELAY_MS);
}

module.exports = { createImporter: createImporter, get: get, startAutoImport: startAutoImport };
