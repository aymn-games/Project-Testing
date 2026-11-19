'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var os = require('os');
var fs = require('fs');
var path = require('path');
var stream = require('stream');
var Database = require('better-sqlite3');
var mod = require('./veyro-admin-service');
var trackerMod = require('./usage-tracker');

var DAY = mod.DAY;
var ADMIN = { id: 1, name: 'أيمن' };

function setup(opts) {
    opts = opts || {};
    var db = new Database(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, role TEXT, is_streamer INTEGER, permissions TEXT, tiktok_username TEXT, tiktok_verified INTEGER, tiktok_display_name TEXT, tiktok_avatar_url TEXT, avatar_image_base64 TEXT, email TEXT, custom_id TEXT, created_at INTEGER, updated_at INTEGER)');
    [[7, 'fahad'], [8, 'sara'], [9, 'noura']].forEach(function (u) {
        db.prepare("INSERT INTO users (id, username, role, is_streamer, permissions, tiktok_username, tiktok_verified, email, custom_id, updated_at) VALUES (?, ?, 'streamer', 1, '{}', ?, 1, ?, ?, 0)").run(u[0], u[1], u[1] + '.live', u[1] + '@mail.com', String(5000 + u[0]));
    });
    var clock = { t: Date.UTC(2026, 10, 19, 9) };
    var s = mod.createService(db, { now: function () { return clock.t; }, dir: opts.dir });
    return { db: db, s: s, clock: clock };
}

test('first visit creates the account, with trial days when enabled', function () {
    var x = setup();
    x.s.setSetting('trialDays', 3);
    assert.equal(x.s.ensureAccount(7), true);
    assert.equal(x.s.ensureAccount(7), false);
    var sum = x.s.subSummary(7);
    assert.equal(sum.state, 'expiring');
    assert.equal(sum.msLeft, 3 * DAY);
    assert.equal(x.s.subRow(7).source, 'trial');
});

test('adding days starts today when there is no sub, and stacks on a running one', function () {
    var x = setup();
    assert.equal(x.s.addDays(7, 7, 'هدية', ADMIN).success, true);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 7 * DAY);
    x.s.addDays(7, 30, '', ADMIN);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 37 * DAY);
    x.s.addDays(7, -10, '', ADMIN);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 27 * DAY);
    assert.equal(x.s.addDays(8, -3, '', ADMIN).error, 'no_active_sub');
    // انتهى: الأيام تبدأ من اليوم مو من النهاية القديمة
    x.clock.t += 40 * DAY;
    assert.equal(x.s.subSummary(7).state, 'expired');
    x.s.addDays(7, 5, '', ADMIN);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 5 * DAY);
});

test('renew extends from the current end and counts renewals and payments', function () {
    var x = setup();
    x.s.renew(7, 'monthly', 39, 'تحويل بنكي', ADMIN);
    assert.equal(x.s.subRow(7).renewals, 0);
    x.s.renew(7, 'quarter', 99, 'مدى', ADMIN);
    var s = x.s.subRow(7);
    assert.equal(s.plan, 'quarter');
    assert.equal(s.renewals, 1);
    assert.equal(s.end_at, x.clock.t + 120 * DAY);
    assert.equal(x.db.prepare('SELECT SUM(amount) AS a FROM veyro_payments WHERE user_id = 7').get().a, 138);
    assert.equal(x.s.limits(7).screens, 20);
});

test('freeze keeps the remaining days and unfreeze restores them', function () {
    var x = setup();
    x.s.addDays(7, 20, '', ADMIN);
    x.s.freeze(7, 'سفر', ADMIN);
    x.clock.t += 50 * DAY;
    assert.equal(x.s.subSummary(7).state, 'frozen');
    x.s.addDays(7, 2, '', ADMIN);
    x.s.unfreeze(7, ADMIN);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 22 * DAY);
});

test('lifetime has no end and cannot get days', function () {
    var x = setup();
    x.s.setLifetime(7, true, null, ADMIN);
    assert.equal(x.s.subSummary(7).state, 'lifetime');
    assert.equal(x.s.addDays(7, 3, '', ADMIN).error, 'already_lifetime');
    x.s.setLifetime(7, false, null, ADMIN);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 30 * DAY);
    x.s.cancel(7, ADMIN);
    assert.equal(x.s.subSummary(7).state, 'expired');
});

test('codes: generate, redeem once per account, respect limits and owner', function () {
    var x = setup();
    var r = x.s.genCodes({ type: 'days', days: 7, count: 3, maxUses: 1, prefix: 'veyro!' }, ADMIN);
    assert.equal(r.codes.length, 3);
    assert.match(r.codes[0].code, /^VEYRO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    var c = r.codes[0].code;
    assert.equal(x.s.redeem(c.toLowerCase(), 7, null).success, true);
    assert.equal(x.s.subRow(7).end_at, x.clock.t + 7 * DAY);
    assert.equal(x.s.redeem(c, 8, null).error, 'used');
    var shared = x.s.genCodes({ type: 'plan', plan: 'yearly', count: 1, maxUses: 5 }, ADMIN).codes[0].code;
    assert.equal(x.s.redeem(shared, 8, null).success, true);
    assert.equal(x.s.redeem(shared, 8, null).error, 'already_used');
    assert.equal(x.s.subRow(8).plan, 'yearly');
    var mine = x.s.genCodes({ type: 'lifetime', count: 1, forUser: 9 }, ADMIN).codes[0].code;
    assert.equal(x.s.redeem(mine, 7, null).error, 'other_user');
    assert.equal(x.s.redeem(mine, 9, null).success, true);
    var extra = x.s.genCodes({ type: 'extra', days: 3, count: 1, maxUses: 10 }, ADMIN).codes[0].code;
    x.db.prepare('INSERT INTO users (id, username, permissions, updated_at) VALUES (10, ?, ?, 0)').run('new', '{}');
    assert.equal(x.s.redeem(extra, 10, null).error, 'needs_sub');
    assert.equal(x.s.redeem('NOPE-1234', 7, null).error, 'not_found');
    x.s.toggleCode(extra, ADMIN);
    assert.equal(x.s.redeem(extra, 7, null).error, 'disabled');
    assert.equal(x.s.deleteCode(c, ADMIN).error, 'code_used');
    assert.equal(x.s.genCodes({ type: 'days', days: 3, count: 1, expires: x.clock.t - 1 }, ADMIN).error, 'bad_date');
});

test('blocked accounts cannot redeem and the gate reports them', function () {
    var x = setup();
    x.s.setStatus(7, 'suspended', 'مشاركة الحساب', ADMIN);
    assert.equal(x.s.gate({ id: 7 }, 'tok').blocked, 'suspended');
    var c = x.s.genCodes({ type: 'days', days: 7, count: 1 }, ADMIN).codes[0].code;
    assert.equal(x.s.redeem(c, 7, null).error, 'blocked');
    x.s.setStatus(7, 'active', '', ADMIN);
    assert.equal(x.s.gate({ id: 7 }, 'tok').blocked, undefined);
});

test('logout from all devices revokes tokens seen before it', function () {
    var x = setup();
    assert.equal(x.s.gate({ id: 7 }, 'old').revoked, undefined);
    x.clock.t += 1000;
    x.s.logoutAll(7, ADMIN);
    assert.equal(x.s.devices(7), 0);
    x.clock.t += 60e3;
    assert.equal(x.s.gate({ id: 7 }, 'old').revoked, true); // التوكن القديم يظل مرفوض
    assert.equal(x.s.gate({ id: 7 }, 'fresh').revoked, undefined); // دخول جديد بعدها يشتغل
    assert.equal(x.s.devices(7), 1);
});

test('tester override from the panel wins over the games server', function () {
    var x = setup();
    assert.equal(x.s.gate({ id: 7 }, 't').tester, null);
    x.s.setTester(7, true, ADMIN);
    assert.equal(x.s.gate({ id: 7 }, 't').tester, true);
});

test('usage tracker counts open and live time once per streamer, and new sessions', function () {
    var x = setup();
    var tr = trackerMod.createTracker(x.s, { now: function () { return x.clock.t; } });
    tr.beat(7, false);
    for (var i = 0; i < 30; i++) { x.clock.t += 2000; tr.beat(7, i >= 15); tr.beat(7, i >= 15); } // شاشتين مفتوحة
    assert.equal(tr.presence(7).online, true);
    tr.flush();
    var row = x.db.prepare('SELECT * FROM veyro_usage WHERE user_id = 7').get();
    assert.equal(row.open_sec, 60);
    assert.ok(row.live_sec >= 26 && row.live_sec <= 30);
    assert.equal(row.sessions, 1);
    x.clock.t += 20 * 60e3;
    tr.beat(7, false);
    tr.flush();
    assert.equal(x.db.prepare('SELECT sessions FROM veyro_usage WHERE user_id = 7').get().sessions, 2);
    assert.equal(tr.presence(8), null);
});

test('snapshot has the same shape the admin page uses', function () {
    var x = setup();
    x.s.renew(7, 'monthly', 39, 'مدى', ADMIN);
    x.s.addUsage([{ uid: 7, day: x.s.dayKey(x.clock.t), open: 7200, live: 3600, sessions: 1 }]);
    var snap = x.s.snapshot();
    var u = snap.users.filter(function (u) { return u.id === 7; })[0];
    assert.equal(u.email, 'fahad@mail.com');
    assert.equal(u.customId, '5007');
    assert.equal(u.tiktok, 'fahad.live');
    assert.equal(u.usage.daily.length, 90);
    assert.equal(u.usage.daily[89], 2);
    assert.equal(u.usage.hoursTotal, 2);
    assert.equal(u.sub.plan, 'monthly');
    assert.equal(u.payments[0].amount, 39);
    assert.ok(snap.plans.length >= 4);
    assert.ok(snap.log.length >= 1);
});

test('plans: edit keeps the id and lifetime stays without days', function () {
    var x = setup();
    var r = x.s.savePlan({ id: 'monthly', name: 'شهري بلس', days: 31, price: 45, screens: 12, videos: 12, features: ['أ', '', 'ب'] });
    assert.equal(r.plan.name, 'شهري بلس');
    assert.deepEqual(r.plan.features, ['أ', 'ب']);
    assert.equal(x.s.savePlan({ id: 'lifetime', name: 'مفتوح', days: 99 }).plan.days, 0);
    assert.equal(x.s.savePlan({ name: '' }).error, 'name_required');
});

test('library: upload checks the file type, publish bumps the version, access filters', function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vya-'));
    var x = setup({ dir: dir });
    var a = x.s.saveAsset({ type: 'icon', name: 'تاج', access: 'subs' }, false, ADMIN).asset;
    assert.equal(x.s.saveAsset({ id: a.id }, true, ADMIN).error, 'file_required');
    var png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
    return x.s.uploadAssetFile(a.id, stream.Readable.from([Buffer.from('not a file at all')]), 0, ADMIN).then(function (bad) {
        assert.equal(bad.error, 'unsupported_type');
        return x.s.uploadAssetFile(a.id, stream.Readable.from([png]), 0, ADMIN);
    }).then(function (ok) {
        assert.equal(ok.success, true);
        assert.equal(ok.asset.mime, 'image/png');
        var p = x.s.saveAsset({ id: a.id, key: { on: true, mode: 'white', sim: 0.2 } }, true, ADMIN).asset;
        assert.equal(p.version, 1);
        assert.equal(p.key.mode, 'white');
        assert.equal(x.s.saveAsset({ id: a.id }, true, ADMIN).asset.version, 2);
        assert.equal(x.s.libraryFor(7).length, 0); // للمشتركين بس
        x.s.addDays(7, 7, '', ADMIN);
        assert.equal(x.s.libraryFor(7).length, 1);
        var top = x.s.saveAsset({ type: 'top', name: 'توب', top: { rows: 99, shape: 'x', accent: 'red' } }, true, ADMIN).asset;
        assert.equal(top.top.rows, 10);
        assert.equal(top.top.shape, 'bevel');
        assert.ok(x.s.findAssetFile(a.id));
        assert.equal(x.s.deleteAsset(a.id, ADMIN).success, true);
        assert.equal(x.s.findAssetFile(a.id), null);
    });
});

test('store: plan discount for games subscribers and idempotent store grants', function () {
    var x = setup();
    // الافتراضي 30٪ لكل الخطط المعروضة للبيع
    x.s.salePlans().forEach(function (s) { assert.equal(s.gamesDiscount, 30); });
    assert.equal(x.s.savePlan({ name: 'أسبوعي', days: 7, price: 12 }).plan.gamesDiscount, 30);
    var p = x.s.savePlan({ id: 'monthly', name: 'شهري', days: 30, price: 40, screens: 10, videos: 10, gamesDiscount: 25 }).plan;
    assert.equal(p.gamesDiscount, 25);
    assert.equal(x.s.savePlan({ id: 'monthly', name: 'شهري', days: 30, price: 40 }).plan.gamesDiscount, 25); // يبقى لو ما انرسل
    var sale = x.s.salePlans();
    assert.ok(sale.some(function (s) { return s.id === 'monthly' && s.gamesDiscount === 25; }));
    assert.ok(!sale.some(function (s) { return s.id === 'lifetime'; }));
    var r = x.s.storeGrant('store:1:5', 7, 'monthly', 30, 1);
    assert.equal(r.success, true);
    assert.equal(x.s.subRow(7).plan, 'monthly');
    assert.equal(x.db.prepare("SELECT amount, method FROM veyro_payments WHERE user_id = 7").get().amount, 30);
    assert.equal(x.s.storeGrant('store:1:5', 7, 'monthly', 30, 1).duplicate, true);
    assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM veyro_payments WHERE user_id = 7').get().n, 1);
    assert.equal(x.s.storeGrant('store:2:5', 7, 'nope', 30, 2).error, 'bad_plan');
});

test('library: alert look (background, video colors, part colors) is cleaned and returned', function () {
    var x = setup();
    var a = x.s.saveAsset({ type: 'alert', name: 'أليرت', look: { vbg: { on: true, c: '#000000', a: 5, r: 99 }, vfx: { hue: 400, sat: 1.5, bri: 9 }, parts: { name: { on: true, c: '#ff0000' }, msg: { on: false, c: 'red' }, evil: { c: '#000000' } } } }, false, ADMIN).asset;
    assert.deepEqual(a.look.vbg, { on: true, c: '#000000', a: 1, r: 9 });
    assert.deepEqual(a.look.vfx, { hue: 180, sat: 1.5, bri: 2 });
    assert.deepEqual(a.look.parts, { name: { on: true, c: '#ff0000' }, msg: { on: false } });
    assert.equal(a.look.full, false);
    var b = x.s.saveAsset({ type: 'alert', name: 'كامل', look: { full: 1, variants: true, size: 99 } }, false, ADMIN).asset;
    assert.equal(b.look.full, true);
    assert.equal(b.look.variants, true);
    assert.equal(b.look.size, 9);
    var icon = x.s.saveAsset({ type: 'icon', name: 'ا', look: { vbg: { on: true } } }, false, ADMIN).asset;
    assert.equal(icon.look, null);
});
