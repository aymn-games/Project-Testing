/**
 * AGP STREAMLABS MANAGER — اتصال واحد مع Streamlabs (Socket API، socket.io v2) لكل ستريمر مربوط،
 * مفتوح طول الوقت (حتى لو ما يبث) عشان الدونيشن ما يضيع.
 *
 * - الربط (link): نتصل بالرمز الجديد ونستنى قبول Streamlabs أو رفضه (أو مهلة) — ما نحفظ رمز غلط.
 * - رمز مرفوض بعدين (انلغى من Streamlabs) → invalid_token ونقفل بدون إعادة محاولة بلا نهاية.
 * - كل حدث donation → donations-store (UNIQUE يمنع التكرار) → حلقة بالذاكرة (recent) يسحبها رابط
 *   الشاشة مع الأحداث (/api/public/screen/events?d=) للأليرتات.
 * راجع docs/superpowers/specs/2026-11-08-veyro-streamlabs-donations-design.md.
 */

'use strict';

var SOCKET_URL = 'https://sockets.streamlabs.com?token=';
var LINK_TIMEOUT_MS = 10000;
var RECENT_MAX = 50;

function isUnauthorized(err) {
    var m = String((err && (err.message || err.description)) || err || '');
    return /unauthori[sz]ed|invalid token|401/i.test(m);
}

/**
 * @param {{ store, io: Function, onDonation?: Function, linkTimeoutMs?: number, logger? }} deps
 */
function createManager(deps) {
    var store = deps.store;
    var io = deps.io;
    var log = deps.logger || { log: function () {}, error: function () {} };
    var linkTimeoutMs = deps.linkTimeoutMs || LINK_TIMEOUT_MS;
    var _sockets = new Map(); // userId -> { socket, connected }
    var _recent = new Map();  // userId -> { seq, list }

    function open(userId, token, handlers) {
        var socket = io(SOCKET_URL + token, { transports: ['websocket'], reconnection: true, reconnectionDelay: 2000, reconnectionDelayMax: 60000 });
        var entry = { socket: socket, connected: false };
        socket.on('connect', function () { entry.connected = true; if (handlers.connect) handlers.connect(); });
        socket.on('disconnect', function () { entry.connected = false; });
        socket.on('connect_error', function (err) { entry.connected = false; if (handlers.error) handlers.error(err); });
        socket.on('error', function (err) { if (handlers.error) handlers.error(err); });
        socket.on('event', function (payload) { handleEvent(userId, payload); });
        return entry;
    }

    function close(userId) {
        var e = _sockets.get(userId);
        if (!e) return;
        _sockets.delete(userId);
        try { e.socket.close(); } catch (err) { /* ignore */ }
    }

    /** يتصل برمز محفوظ (عند تشغيل السيرفر أو بعد الربط). */
    function connect(userId) {
        var link = store.getLink(userId);
        if (!link || link.status === 'invalid_token') return;
        close(userId);
        var entry = open(userId, link.token, {
            connect: function () { store.setStatus(userId, 'connected'); },
            error: function (err) {
                if (!isUnauthorized(err)) { store.setStatus(userId, 'connecting', String((err && err.message) || err || '').slice(0, 120)); return; }
                store.setStatus(userId, 'invalid_token', 'Unauthorized');
                log.error('Streamlabs: token rejected for user ' + userId + ' — stopped.');
                close(userId);
            }
        });
        _sockets.set(userId, entry);
    }

    function disconnect(userId) { close(userId); }

    function connectAll() {
        store.allLinks().forEach(function (l) { if (l.status !== 'invalid_token') connect(l.userId); });
    }

    /** ربط برمز جديد: نتصل ونستنى القبول قبل ما نحفظ. */
    function link(userId, token) {
        token = String(token || '').trim();
        if (!/^[\w.\-]{3,4096}$/.test(token)) return Promise.resolve({ success: false, error: 'invalid_token' });
        close(userId);
        return new Promise(function (resolve) {
            var done = false;
            var entry;
            function finish(r) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (!r.success) { try { entry.socket.close(); } catch (e) { /* ignore */ } }
                resolve(r);
            }
            var timer = setTimeout(function () { finish({ success: false, error: 'timeout' }); }, linkTimeoutMs);
            entry = open(userId, token, {
                connect: function () {
                    if (done) { store.setStatus(userId, 'connected'); return; }
                    store.saveLink(userId, token);
                    store.setStatus(userId, 'connected');
                    _sockets.set(userId, entry);
                    finish({ success: true });
                },
                error: function (err) {
                    if (!done) { if (isUnauthorized(err)) finish({ success: false, error: 'invalid_token' }); return; }
                    if (isUnauthorized(err)) {
                        store.setStatus(userId, 'invalid_token', 'Unauthorized');
                        close(userId);
                    }
                }
            });
        });
    }

    /** حدث من Streamlabs: الدونيشن بس. */
    function handleEvent(userId, payload) {
        if (!payload || payload.type !== 'donation') return;
        var msgs = Array.isArray(payload.message) ? payload.message : (payload.message ? [payload.message] : []);
        msgs.forEach(function (m) {
            if (!m) return;
            var d = store.addDonation(userId, {
                slId: m._id != null ? m._id : m.id,
                name: m.name || m.from,
                amount: m.amount,
                currency: m.currency,
                message: m.message,
                isTest: Boolean(m.isTest || m.is_test || payload.for === 'test')
            });
            if (!d) return; // مكرر أو غير صالح
            var r = _recent.get(userId) || { seq: 0, list: [] };
            r.seq++;
            r.list.push({ seq: r.seq, type: 'donation', user: d.name, amount: d.amountCents / 100, currency: d.currency, message: d.message, isTest: d.isTest, at: d.receivedAt });
            if (r.list.length > RECENT_MAX) r.list.splice(0, r.list.length - RECENT_MAX);
            _recent.set(userId, r);
            if (deps.onDonation) { try { deps.onDonation(userId, d); } catch (e) { /* ignore */ } }
        });
    }

    /** الدونيشن الجديد بعد since → { dseq, donations }. since أكبر من الحالي (السيرفر رجع) = الكل. */
    function recent(userId, since) {
        var r = _recent.get(userId) || { seq: 0, list: [] };
        var after = Number(since) || 0;
        if (after > r.seq) after = 0;
        return { dseq: r.seq, donations: r.list.filter(function (d) { return d.seq > after; }) };
    }

    /** idle | connecting | connected | invalid_token */
    function status(userId) {
        var e = _sockets.get(userId);
        if (e) return e.connected ? 'connected' : 'connecting';
        var l = store.getLink(userId);
        return l && l.status === 'invalid_token' ? 'invalid_token' : 'idle';
    }

    /** «جرّب» من المحرر: دونيشن مثال بالطابور بس (ما ينحفظ). */
    function pushTest(userId) {
        var r = _recent.get(userId) || { seq: 0, list: [] };
        r.seq++;
        r.list.push({ seq: r.seq, type: 'donation', user: 'أبو فهد', amount: 25, currency: 'USD', message: 'كفو والله، استمر 💜', isTest: true, at: Date.now() });
        if (r.list.length > RECENT_MAX) r.list.splice(0, r.list.length - RECENT_MAX);
        _recent.set(userId, r);
    }

    return { link: link, connect: connect, disconnect: disconnect, connectAll: connectAll, handleEvent: handleEvent, recent: recent, status: status, pushTest: pushTest };
}

var instance = null;
function get() {
    if (!instance) {
        instance = createManager({
            store: require('./donations-store').get(),
            io: require('socket.io-client'),
            logger: require('../utils/logger')
        });
    }
    return instance;
}

function startStreamlabs() {
    try { get().connectAll(); } catch (err) { require('../utils/logger').error('Streamlabs: failed to start:', err); }
}

module.exports = { createManager: createManager, get: get, startStreamlabs: startStreamlabs };
