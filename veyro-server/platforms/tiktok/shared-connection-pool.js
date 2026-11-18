/**
 * AGP SHARED TIKTOK CONNECTION POOL — اتصال تيك توك واحد لكل بث، تشترك فيه
 * كل الصفحات والخدمات اللي تبي نفس البث.
 *
 * ليش: كل اتصال جديد بتيك توك = طلب توقيع من EulerStream (/webcast/.../connect)،
 * والحد اليومي محدود (طلبات + «Distinct LIVE rooms per day»). قبل هذا، كل
 * صفحة تفتح اتصالها: لوبي اللعبة ثم صفحة اللعبة ثم كل تحديث للصفحة = اتصال
 * جديد لنفس البث. الإحصائيات كانت ~99.5% من الطلبات طلبات اتصال.
 *
 * الطريقة:
 *   - createLease(meta) يرجّع كائن بنفس شكل الموصِّل
 *     ({connect, disconnect, isConnected, getRoomId}) — ws-server.js وغيره
 *     ما يحسّون بأي فرق.
 *   - lease.connect(options, callbacks): لو فيه اتصال حقيقي لنفس اليوزر (ونفس
 *     وضع statsOnly) ينضم له المشترك الجديد ويوصله حالته الحالية فوراً؛ وإلا
 *     ينفتح اتصال حقيقي جديد.
 *   - كل أحداث الاتصال الحقيقي تتوزّع على كل المشتركين.
 *   - lease.disconnect(): يطلع المشترك. لو ما بقى أحد، الاتصال الحقيقي يبقى
 *     GRACE_MS (تنقّل اللوبي ← اللعبة، تحديث الصفحة) وبعدها يتقفل.
 *   - انتهاء البث أو فشل نهائي → الاتصال ينشال من المجمّع، والطلب الجاي يفتح جديد.
 *
 * عداد الاستهلاك (getUsage): محاولات الاتصال الحقيقية اليوم (كل محاولة = طلب
 * توقيع) والبثوث المختلفة، مقسّمة حسب المصدر — للوحة الأدمن وسجلات Render.
 */

'use strict';

var logger = require('../../utils/logger');
var tiktokConnector = require('./tiktok-connector');

var GRACE_MS = 2 * 60 * 1000;

var _pool = new Map(); // key -> entry

function normalize(username) {
    return String(username || '').trim().replace(/^@+/, '').trim().toLowerCase();
}

function poolKey(username, statsOnly) {
    return normalize(username) + (statsOnly ? '#stats' : '');
}

/* ---------------- عداد الاستهلاك (يومي، UTC) ---------------- */

var _usage = null;

function todayKey() { return new Date().toISOString().slice(0, 10); }

function usageForToday() {
    var day = todayKey();
    if (!_usage || _usage.day !== day) {
        if (_usage) logUsage('day ended');
        _usage = { day: day, attempts: 0, sharedJoins: 0, rooms: new Set(), bySource: {}, byUser: {} };
    }
    return _usage;
}

var SOURCE_LABELS = { library: 'تحقق مكتبة الألعاب', overlay: 'أوفرلي البث', watcher: 'مراقب الإحصائيات', challenge: 'التحديات', other: 'غير معروف' };
var _gameLabels = {}; // game:<slug> -> اسم اللعبة بالعربي (من ws-server)

function sourceBucket(u, source) {
    if (!u.bySource[source]) u.bySource[source] = { attempts: 0, rooms: new Set(), sharedJoins: 0 };
    return u.bySource[source];
}

function labelOf(source) {
    return SOURCE_LABELS[source] || _gameLabels[source] || source.replace(/^game:/, '');
}

function recordAttempt(username, source) {
    var u = usageForToday();
    var b = sourceBucket(u, source);
    u.attempts++;
    b.attempts++;
    u.byUser[username] = (u.byUser[username] || 0) + 1;
}

function recordRoom(username, roomId, source) {
    if (!roomId) return;
    var u = usageForToday();
    var key = username + ':' + roomId;
    u.rooms.add(key);
    sourceBucket(u, source).rooms.add(key);
}

function recordSharedJoin(source) {
    var u = usageForToday();
    u.sharedJoins++;
    sourceBucket(u, source).sharedJoins++;
}

/** ملخص قابل للإرسال JSON: {day, attempts, rooms, sharedJoins, bySource, topUsers, active}. */
function getUsage() {
    var u = usageForToday();
    var bySource = {};
    Object.keys(u.bySource).forEach(function (s) {
        var b = u.bySource[s];
        bySource[s] = { label: labelOf(s), attempts: b.attempts, rooms: b.rooms.size, sharedJoins: b.sharedJoins };
    });
    var topUsers = Object.keys(u.byUser).map(function (name) { return { username: name, attempts: u.byUser[name] }; })
        .sort(function (a, b) { return b.attempts - a.attempts; }).slice(0, 20);
    var active = [];
    _pool.forEach(function (e) {
        active.push({ username: e.username, statsOnly: e.statsOnly, subscribers: e.subs.size, status: e.status, source: e.source, idleSince: e.graceTimer ? e.idleSince : null });
    });
    return { day: u.day, attempts: u.attempts, rooms: u.rooms.size, sharedJoins: u.sharedJoins, bySource: bySource, topUsers: topUsers, active: active };
}

function logUsage(reason) {
    try {
        var s = getUsage();
        var parts = Object.keys(s.bySource).map(function (k) { var b = s.bySource[k]; return k + '=' + b.attempts + ' attempts/' + b.rooms + ' rooms/' + b.sharedJoins + ' shared'; });
        logger.info('Stream usage (' + reason + ', ' + s.day + ' UTC): ' + s.attempts + ' connect attempts, ' + s.rooms + ' distinct rooms, ' + s.sharedJoins + ' shared joins — ' + (parts.join(', ') || 'none'));
    } catch (err) { /* ignore */ }
}

var _usageLogTimer = setInterval(function () { logUsage('hourly'); }, 60 * 60 * 1000);
if (_usageLogTimer.unref) _usageLogTimer.unref();

/* ---------------- المجمّع ---------------- */

function forEachSub(entry, fn) {
    // نسخة، عشان مشترك يطلع أثناء التوزيع ما يكسر اللفّة
    Array.from(entry.subs).forEach(function (cb) {
        try { fn(cb); } catch (err) { logger.error('Connection pool: subscriber callback failed:', err); }
    });
}

function removeEntry(entry, reason) {
    if (_pool.get(entry.key) !== entry) return;
    _pool.delete(entry.key);
    if (entry.graceTimer) { clearTimeout(entry.graceTimer); entry.graceTimer = null; }
    logger.log('Connection pool: closed "' + entry.key + '" (' + reason + ').');
}

function createEntry(key, options, source) {
    var real = tiktokConnector.createTikTokConnector();
    var entry = {
        key: key,
        username: normalize(options.username),
        statsOnly: Boolean(options.statsOnly),
        source: source,
        real: real,
        subs: new Set(),
        status: 'connecting',
        message: null,
        reason: null,
        graceTimer: null,
        idleSince: null
    };
    _pool.set(key, entry);

    var realOptions = Object.assign({}, options, {
        onAttempt: function () { recordAttempt(entry.username, entry.source); }
    });

    real.connect(realOptions, {
        onStatus: function (status, message, reason) {
            entry.status = status;
            entry.message = message || null;
            entry.reason = reason || null;
            if (status === 'connected') recordRoom(entry.username, real.getRoomId && real.getRoomId(), entry.source);
            forEachSub(entry, function (cb) { cb.onStatus && cb.onStatus(status, message, reason); });
            if (status === 'ended') { removeEntry(entry, 'stream ended'); return; }
            if (status === 'error') {
                // الموصِّل يبلّغ 'error' للفشل النهائي وللفشل المؤقت (يعيد المحاولة).
                // بعد ما يخلص الكود المتزامن نشوف: لو ما عاد يحاول، الاتصال ميت.
                setImmediate(function () {
                    if (_pool.get(key) === entry && !(real.isActive && real.isActive())) {
                        try { real.disconnect(); } catch (e) {}
                        removeEntry(entry, 'failed');
                    }
                });
            }
        },
        onComment: function (d) { forEachSub(entry, function (cb) { cb.onComment && cb.onComment(d); }); },
        onGift: function (d) { forEachSub(entry, function (cb) { cb.onGift && cb.onGift(d); }); },
        onFollow: function (d) { forEachSub(entry, function (cb) { cb.onFollow && cb.onFollow(d); }); },
        onViewerUpdate: function (d) { forEachSub(entry, function (cb) { cb.onViewerUpdate && cb.onViewerUpdate(d); }); },
        onLike: function (d) { forEachSub(entry, function (cb) { cb.onLike && cb.onLike(d); }); },
        onShare: function (d) { forEachSub(entry, function (cb) { cb.onShare && cb.onShare(d); }); },
        onMember: function (d) { forEachSub(entry, function (cb) { cb.onMember && cb.onMember(d); }); }
    });
    return entry;
}

function subscribe(entry, callbacks) {
    if (entry.graceTimer) {
        clearTimeout(entry.graceTimer);
        entry.graceTimer = null;
        entry.idleSince = null;
    }
    entry.subs.add(callbacks);
}

function unsubscribe(entry, callbacks) {
    if (!entry.subs.delete(callbacks)) return;
    if (entry.subs.size > 0 || _pool.get(entry.key) !== entry) return;
    // آخر مشترك طلع — نخلي الاتصال مفتوح شوي (تنقّل بين الصفحات/تحديث)
    entry.idleSince = Date.now();
    entry.graceTimer = setTimeout(function () {
        entry.graceTimer = null;
        if (entry.subs.size > 0) return;
        try { entry.real.disconnect(); } catch (e) {}
        removeEntry(entry, 'idle ' + Math.round(GRACE_MS / 1000) + 's');
    }, GRACE_MS);
    if (entry.graceTimer.unref) entry.graceTimer.unref();
}

/**
 * موصِّل مشترك بنفس واجهة tiktok-connector.
 * @param {{source?: string}} [meta] - مصدر الطلب للعداد: game:<slug>، library، watcher، challenge…
 */
function createLease(meta) {
    var source = (meta && meta.source) || 'other';
    if (meta && meta.label && source.indexOf('game:') === 0) _gameLabels[source] = String(meta.label);
    var entry = null;
    var callbacks = null;

    return {
        connect: function (options, cbs) {
            if (entry) this.disconnect();
            if (!options || !options.username) {
                cbs.onStatus('error', 'Missing TikTok username.');
                return;
            }
            callbacks = cbs;
            var key = poolKey(options.username, options.statsOnly);
            var existing = _pool.get(key);
            if (existing) {
                entry = existing;
                subscribe(entry, callbacks);
                recordSharedJoin(source);
                // المشترك الجديد ياخذ الحالة الحالية (بعد ما يخلّص المتصل إعداد نفسه)
                var joined = entry;
                setImmediate(function () {
                    if (entry !== joined || !callbacks) return;
                    if (joined.status === 'connected') callbacks.onStatus('connected');
                    else if (joined.status === 'error' && joined.message) callbacks.onStatus('error', joined.message, joined.reason);
                });
                return;
            }
            entry = createEntry(key, Object.assign({}, options, { username: normalize(options.username) }), source);
            subscribe(entry, callbacks);
        },

        disconnect: function () {
            if (!entry) return;
            var e = entry;
            entry = null;
            unsubscribe(e, callbacks);
            callbacks = null;
        },

        isConnected: function () {
            return Boolean(entry && entry.real.isConnected());
        },

        getRoomId: function () {
            return entry && entry.real.getRoomId ? entry.real.getRoomId() : null;
        }
    };
}

module.exports = {
    createLease: createLease,
    getUsage: getUsage,
    GRACE_MS: GRACE_MS,
    _pool: _pool // للاختبارات
};
