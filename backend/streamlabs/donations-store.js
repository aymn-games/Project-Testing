/**
 * AGP STREAMLABS DONATIONS STORE — ربط الستريمر بـStreamlabs (رمز Socket API) والدونيشن اللي يوصل
 * منه (كريترز/دكان تب وغيره). راجع docs/superpowers/specs/2026-11-08-veyro-streamlabs-donations-design.md.
 *
 * - المبالغ بالسنتات (أعداد صحيحة) — ما فيه أخطاء كسور.
 * - UNIQUE(user_id, sl_id): نفس الدونيشن ما ينحفظ مرتين لو Streamlabs أعاد إرساله.
 * - المجاميع (التوب/الهدف/الإحصائيات) = دولار بس وغير التجارب، من «بداية العدّاد» (counter_from)،
 *   ولو auto_reset = من بداية البث الحالي لو أحدث. السجل (list) يعرض كل شي.
 * - الرمز سري: يرجع هنا للسيرفر بس (streamlabs-manager)، وما يطلع للواجهة.
 * الجداول تنشأ هنا عشان الخدمة تنختبر بقاعدة بيانات بالذاكرة.
 */

'use strict';

var MAX_NAME = 60;
var MAX_MESSAGE = 300;

/** مبلغ (رقم أو نص مثل "1,000.50") → سنتات، أو null لو غير صالح أو ≤ 0. */
function toCents(v) {
    var n = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/[,\s]/g, ''));
    if (!isFinite(n) || n <= 0) return null;
    var c = Math.round(n * 100);
    return c > 0 ? c : null;
}

function createStore(db, opts) {
    var now = (opts && opts.now) || Date.now;
    db.exec(
        'CREATE TABLE IF NOT EXISTS streamlabs_links (' +
        '    user_id INTEGER PRIMARY KEY,' +
        '    socket_token TEXT NOT NULL,' +
        '    status TEXT NOT NULL,' +
        '    last_error TEXT,' +
        '    linked_at INTEGER NOT NULL,' +
        '    last_event_at INTEGER,' +
        '    counter_from INTEGER NOT NULL,' +
        '    auto_reset INTEGER NOT NULL DEFAULT 0' +
        ');' +
        'CREATE TABLE IF NOT EXISTS donations (' +
        '    id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        '    user_id INTEGER NOT NULL,' +
        '    sl_id TEXT NOT NULL,' +
        '    name TEXT NOT NULL,' +
        '    amount_cents INTEGER NOT NULL,' +
        '    currency TEXT NOT NULL,' +
        '    message TEXT,' +
        '    is_test INTEGER NOT NULL DEFAULT 0,' +
        '    received_at INTEGER NOT NULL,' +
        '    UNIQUE(user_id, sl_id)' +
        ');' +
        'CREATE INDEX IF NOT EXISTS idx_donations_user_time ON donations(user_id, received_at);'
    );

    function linkRow(r) {
        return r ? {
            userId: r.user_id, token: r.socket_token, status: r.status, lastError: r.last_error || null,
            linkedAt: r.linked_at, lastEventAt: r.last_event_at || null, counterFrom: r.counter_from, autoReset: Boolean(r.auto_reset)
        } : null;
    }
    function donRow(r) {
        return {
            id: r.id, slId: r.sl_id, name: r.name, amountCents: r.amount_cents, currency: r.currency,
            message: r.message || '', isTest: Boolean(r.is_test), receivedAt: r.received_at
        };
    }

    function saveLink(userId, token) {
        var t = now();
        db.prepare('INSERT INTO streamlabs_links (user_id, socket_token, status, linked_at, counter_from) VALUES (?, ?, ?, ?, ?) ' +
            'ON CONFLICT(user_id) DO UPDATE SET socket_token = excluded.socket_token, status = excluded.status, last_error = NULL, linked_at = excluded.linked_at')
            .run(userId, String(token), 'connecting', t, t);
    }
    function getLink(userId) { return linkRow(db.prepare('SELECT * FROM streamlabs_links WHERE user_id = ?').get(userId)); }
    function allLinks() { return db.prepare('SELECT * FROM streamlabs_links').all().map(linkRow); }
    function removeLink(userId) { db.prepare('DELETE FROM streamlabs_links WHERE user_id = ?').run(userId); }
    function setStatus(userId, status, lastError) {
        db.prepare('UPDATE streamlabs_links SET status = ?, last_error = ? WHERE user_id = ?').run(status, lastError || null, userId);
    }
    function reset(userId) { db.prepare('UPDATE streamlabs_links SET counter_from = ? WHERE user_id = ?').run(now(), userId); }
    function setAutoReset(userId, on) { db.prepare('UPDATE streamlabs_links SET auto_reset = ? WHERE user_id = ?').run(on ? 1 : 0, userId); }

    /** يحفظ دونيشن جديد → الدونيشن، أو null لو مكرر أو غير صالح. */
    function addDonation(userId, d) {
        d = d || {};
        var slId = String(d.slId == null ? '' : d.slId).trim().slice(0, 80);
        var cents = toCents(d.amount);
        if (!slId || !cents) return null;
        var t = now();
        var name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'داعم';
        var currency = String(d.currency || 'USD').trim().toUpperCase().slice(0, 8) || 'USD';
        var message = String(d.message || '').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
        var r = db.prepare('INSERT OR IGNORE INTO donations (user_id, sl_id, name, amount_cents, currency, message, is_test, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(userId, slId, name, cents, currency, message, d.isTest ? 1 : 0, t);
        if (!r.changes) return null;
        db.prepare('UPDATE streamlabs_links SET last_event_at = ? WHERE user_id = ?').run(t, userId);
        return donRow(db.prepare('SELECT * FROM donations WHERE id = ?').get(r.lastInsertRowid));
    }

    /** أعلى الداعمين والمجموع وآخر دعم (دولار، غير التجارب) من fromTs. */
    function summary(userId, fromTs, topN) {
        var where = "user_id = ? AND received_at >= ? AND is_test = 0 AND currency = 'USD'";
        var donors = db.prepare('SELECT name, SUM(amount_cents) AS c, COUNT(*) AS n, MAX(received_at) AS last FROM donations WHERE ' + where +
            ' GROUP BY name ORDER BY c DESC, last ASC LIMIT ?').all(userId, fromTs || 0, Math.max(0, topN | 0));
        var tot = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM donations WHERE ' + where).get(userId, fromTs || 0);
        var last = db.prepare('SELECT * FROM donations WHERE ' + where + ' ORDER BY received_at DESC, id DESC LIMIT 1').get(userId, fromTs || 0);
        return {
            donors: donors.map(function (r) { return { name: r.name, amount: r.c / 100, count: r.n }; }),
            total: tot.c / 100,
            lastDonation: last ? { name: last.name, amount: last.amount_cents / 100, currency: last.currency, message: last.message || '', at: last.received_at } : null
        };
    }

    function list(userId, limit) {
        return db.prepare('SELECT * FROM donations WHERE user_id = ? ORDER BY received_at DESC, id DESC LIMIT ?')
            .all(userId, Math.max(1, Math.min(200, limit | 0 || 50))).map(donRow);
    }

    /** بداية العدّاد الفعلية: counter_from، ولو التصفير التلقائي مفعّل = بداية البث الحالي لو أحدث. */
    function effectiveFrom(link, sessionStartedAt) {
        if (!link) return 0;
        if (link.autoReset && sessionStartedAt && sessionStartedAt > link.counterFrom) return sessionStartedAt;
        return link.counterFrom;
    }

    return {
        saveLink: saveLink, getLink: getLink, allLinks: allLinks, removeLink: removeLink, setStatus: setStatus,
        reset: reset, setAutoReset: setAutoReset, addDonation: addDonation, summary: summary, list: list, effectiveFrom: effectiveFrom
    };
}

var instance = null;
function get() {
    if (!instance) instance = createStore(require('../db/database'));
    return instance;
}

module.exports = { createStore: createStore, toCents: toCents, get: get };
