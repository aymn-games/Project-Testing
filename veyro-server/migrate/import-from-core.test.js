'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Database = require('better-sqlite3');
var init = require('../db/database').init;
var createImporter = require('./import-from-core').createImporter;

var MEDIA_ID = 'a'.repeat(32);
function exportData(over) {
    return Object.assign({
        success: true,
        users: [{ id: 5, username: 'sara', role: 'streamer', is_streamer: 1, permissions: {}, tiktok_username: 'sara_tt', tiktok_verified: 1 }],
        stream_screens: [{ id: 3, user_id: 5, name: 'شاشتي', screen_key: 'b'.repeat(32), design: '{"items":[]}', created_at: 1, updated_at: 100 }],
        screen_media: [{ id: MEDIA_ID, user_id: 5, name: 'فيديو', mime: 'video/mp4', size: 4, width: 10, height: 10, duration: 1, created_at: 1, settings: '{}' }],
        screen_audio_keys: [{ user_id: 5, youtube_key: 'k1', updated_at: 10 }],
        streamlabs_links: [{ user_id: 5, socket_token: 'tok', status: 'connected', last_error: null, linked_at: 1, last_event_at: null, counter_from: 1, auto_reset: 0 }],
        donations: [{ user_id: 5, sl_id: 'd1', name: 'x', amount_cents: 500, currency: 'USD', message: '', is_test: 0, received_at: 2 }],
        stats_watch: [5]
    }, over || {});
}

function setup() {
    var db = init(new Database(':memory:'));
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veyro-imp-'));
    var state = { data: exportData() };
    var imp = createImporter({
        db: db, coreUrl: 'http://core', secret: 's', mediaDir: dir,
        fetch: function (url, opt) {
            assert.equal(opt.headers['X-Veyro-Secret'], 's');
            if (url.indexOf('/media?id=') !== -1) return Promise.resolve({ status: 200, arrayBuffer: function () { return Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer); } });
            return Promise.resolve({ status: 200, json: function () { return Promise.resolve(state.data); } });
        }
    });
    return { db: db, dir: dir, state: state, imp: imp };
}

test('ينقل الشاشات بنفس الرقم والرمز، والفيديو والربط والإعدادات', async function () {
    var s = setup();
    var n = await s.imp.run();
    assert.equal(n.screens, 1);
    var scr = s.db.prepare('SELECT * FROM stream_screens WHERE id = 3').get();
    assert.equal(scr.screen_key, 'b'.repeat(32));
    assert.equal(s.db.prepare('SELECT tiktok_username FROM users WHERE id = 5').get().tiktok_username, 'sara_tt');
    assert.ok(fs.existsSync(path.join(s.dir, MEDIA_ID)));
    assert.equal(s.db.prepare('SELECT socket_token FROM streamlabs_links WHERE user_id = 5').get().socket_token, 'tok');
    assert.equal(s.db.prepare('SELECT COUNT(*) AS c FROM donations').get().c, 1);
    assert.equal(s.db.prepare('SELECT stats_watch FROM veyro_prefs WHERE user_id = 5').get().stats_watch, 1);
    // شاشة جديدة بفيرو تاخذ رقم بعيد عن أرقام سيرفر الألعاب
    var ins = s.db.prepare("INSERT INTO stream_screens (user_id, name, screen_key, created_at, updated_at) VALUES (5, 'ج', ?, 1, 1)").run('c'.repeat(32));
    assert.ok(Number(ins.lastInsertRowid) > 1000);
});

test('التكرار آمن: الأحدث يغلب، والمحذوف بفيرو ما يرجع', async function () {
    var s = setup();
    await s.imp.run();
    // تعديل بفيرو أحدث من سيرفر الألعاب → يبقى
    s.db.prepare("UPDATE stream_screens SET name = 'من فيرو', updated_at = 500 WHERE id = 3").run();
    await s.imp.run();
    assert.equal(s.db.prepare('SELECT name FROM stream_screens WHERE id = 3').get().name, 'من فيرو');
    // سيرفر الألعاب أحدث → يتحدّث
    s.state.data = exportData({ stream_screens: [{ id: 3, user_id: 5, name: 'أحدث', screen_key: 'b'.repeat(32), design: '{"items":[]}', created_at: 1, updated_at: 900 }] });
    await s.imp.run();
    assert.equal(s.db.prepare('SELECT name FROM stream_screens WHERE id = 3').get().name, 'أحدث');
    // انحذفت بفيرو + انفصل Streamlabs → ما يرجعون
    s.db.prepare('DELETE FROM stream_screens WHERE id = 3').run();
    s.db.prepare('DELETE FROM streamlabs_links WHERE user_id = 5').run();
    await s.imp.run();
    assert.equal(s.db.prepare('SELECT COUNT(*) AS c FROM stream_screens').get().c, 0);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS c FROM streamlabs_links').get().c, 0);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS c FROM donations').get().c, 1);
});

test('بدون سر ما يسوي شي', async function () {
    var db = init(new Database(':memory:'));
    var imp = createImporter({ db: db, coreUrl: 'http://core', secret: '', mediaDir: os.tmpdir(), fetch: function () { throw new Error('no'); } });
    assert.deepEqual(await imp.run(), { skipped: 'no_secret' });
});
