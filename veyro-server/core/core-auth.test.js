'use strict';

var test = require('node:test');
var assert = require('node:assert');
var Database = require('better-sqlite3');
var init = require('../db/database').init;
var createCoreAuth = require('./core-auth').createCoreAuth;

function setup(responder) {
    var db = init(new Database(':memory:'));
    var t = { now: 1000000, calls: 0 };
    var auth = createCoreAuth({
        db: db, coreUrl: 'http://core', now: function () { return t.now; },
        fetch: function (url, opt) {
            t.calls++;
            var r = responder(url, opt);
            if (r instanceof Error) return Promise.reject(r);
            return Promise.resolve({ status: r.status, json: function () { return Promise.resolve(r.body); } });
        }
    });
    return { db: db, t: t, auth: auth };
}

var USER = { id: 7, username: 'ali', role: 'streamer', is_streamer: true, permissions: { veyro_tester: true }, tiktok_username: 'ali_tt', tiktok_verified: true, display_name: 'علي', avatar_image_base64: 'data:x' };

test('يحفظ الحساب بقاعدة فيرو ويستخدم الذاكرة بدل ما يسأل كل مرة', async function () {
    var s = setup(function () { return { status: 200, body: { success: true, user: Object.assign({}, USER) } }; });
    var r = await s.auth.resolve('tok');
    assert.equal(r.user.id, 7);
    await s.auth.resolve('tok');
    assert.equal(s.t.calls, 1);
    var row = s.db.prepare('SELECT * FROM users WHERE id = 7').get();
    assert.equal(row.tiktok_username, 'ali_tt');
    assert.equal(row.display_name, 'علي');
    assert.equal(row.avatar_image_base64, 'data:x');
    assert.equal(JSON.parse(row.permissions).veyro_tester, true);
});

test('سيرفر الألعاب طايح: يكمل بآخر نتيجة، وتوكن جديد = 503', async function () {
    var down = false;
    var s = setup(function () { return down ? new Error('ECONNREFUSED') : { status: 200, body: { success: true, user: Object.assign({}, USER) } }; });
    await s.auth.resolve('tok');
    down = true;
    s.t.now += 10 * 60 * 1000;
    var r = await s.auth.resolve('tok');
    assert.equal(r.user.id, 7);
    var n = await s.auth.resolve('other');
    assert.equal(n.status, 503);
});

test('401 من سيرفر الألعاب = التوكن انتهى', async function () {
    var s = setup(function () { return { status: 401, body: { success: false } }; });
    var r = await s.auth.resolve('tok');
    assert.equal(r.status, 401);
});

test('whoami مو موجود (سيرفر ألعاب قديم) → /api/auth/me، والصورة القديمة ما تنمسح', async function () {
    var urls = [];
    var s = setup(function (url) {
        urls.push(url);
        if (url.indexOf('whoami') !== -1) return { status: 404, body: {} };
        var u = Object.assign({}, USER); delete u.avatar_image_base64; delete u.display_name;
        return { status: 200, body: { success: true, user: u } };
    });
    s.auth.save(Object.assign({}, USER));
    await s.auth.resolve('tok');
    assert.deepEqual(urls, ['http://core/api/veyro/whoami', 'http://core/api/auth/me']);
    var row = s.db.prepare('SELECT * FROM users WHERE id = 7').get();
    assert.equal(row.avatar_image_base64, 'data:x');
    assert.equal(row.display_name, 'علي');
});

test('سيرفر فيرو انعاد تشغيله وسيرفر الألعاب طايح: يكمل من آخر تأكيد محفوظ بالقاعدة', async function () {
    var db = init(new Database(':memory:'));
    var t = { now: 1000000, down: false };
    function make() {
        return createCoreAuth({ db: db, coreUrl: 'http://core', now: function () { return t.now; }, fetch: function () {
            if (t.down) return Promise.reject(new Error('down'));
            return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ success: true, user: Object.assign({}, USER) }); } });
        } });
    }
    await make().resolve('tok');
    t.down = true; t.now += 60 * 60 * 1000;
    var fresh = make(); // ذاكرة فاضية = سيرفر فيرو انعاد تشغيله
    var r = await fresh.resolve('tok');
    assert.equal(r.user.id, 7);
    assert.equal(r.user.tiktok_username, 'ali_tt');
    t.now += 25 * 60 * 60 * 1000;
    assert.equal((await make().resolve('tok')).status, 503);
});
