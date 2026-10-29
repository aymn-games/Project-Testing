/**
 * «حفلة عيد الميلاد» — خادم WebSocket على '/ws/party'.
 *
 * يوصّل منطق الغرف (party-rooms.js) بالجوالات وشاشة المذيع، بنفس أسلوب
 * «محطة سهيل» (station-server.js). الحفلات طافية افتراضياً (config.partyEnabled
 * ← متغير البيئة PARTY_ENABLED=1)، وكل رسالة وكل دورة تحديث محمية بـ try/catch:
 * أي خطأ هنا يتسجل وما يطيّح باقي سيرفر الموقع. إنشاء حفلة يحتاج المفتاح الخاص
 * (config.partyHostKey ← PARTY_HOST_KEY)، وكل اتصال عليه حد للرسائل وحد للي
 * يتكدّس له (جوال ما يقرأ ← ينقطع بدل ما يملأ ذاكرة السيرفر).
 *
 * بروتوكول (JSON، كل رسالة فيها t):
 *   عميل → host {girlName, key, schedule} | host {code, token}   ← hosted {code, token, girlKey, viewKey}
 *          schedule = {startAt (ms UTC), durationMin, openBeforeMin, danceMin, writeMin, cakeDanceMin, cutTimeoutSec, tzOffsetMin}
 *   المذيع → schedule {schedule} (تعديل أي وقت) ← phase جديدة للكل
 *   عميل → join {code, name, auth?, girlKey?, dev?} ← welcome {id, key, n, role, kind} ثم all {d}
 *          (قبل فتح الدخول: ← closed {openAt, tzOffsetMin, girlName} ويبقى مشاهد لين توصله phase lobby؛
 *          صاحبة الحفلة تقدر تدخل غرفتها قبل. بعد النهاية: err ended)
 *   عميل → resume {code, id, key}                 ← نفس رد join
 *   عميل → peek {code, vk}                        ← room + all (شاشة عرض بدون شخصية؛ بدون vk صحيح صاحبة الحفلة مخفية قبل الافتتاح)
 *   اللاعب → react {e} (heart|smile|laugh|party، ولصاحبة الحفلة crown|love|sparkle) ← reacts {d: n,e,…} للكل
 *   صاحبة الحفلة → rain ← rain {at} للكل (مطر قلوب، مرة كل 20ث) · المذيع → chars {v: rig|classic} ← room
 *   اللاعب → look {look: 8 أرقام}                ← room (الصف السادس = الشكل بعد التحقق حسب نوع الحساب)
 *   عميل → mv {p:[x, z, ry, a]} · ping {k}        ← pong {k, now}
 *   المذيع → start · skip {from}                  ← phase {p, at, until, walk, cut} للكل
 *   (phase تنرسل أيضاً لكل اتصال جديد؛ walk مسطّحة n, x×100, z×100 وقت المشي التلقائي)
 *   الضيف → wish {text} (وقت wishWrite بس) ← myWish {text} · صاحبة الحفلة/المذيع → next {seen} · prev {seen} · cut
 *          (seen = pos آخر wishes وصلت)
 *   المذيع → kick {n} (المطرود ياخذ err kicked وينقطع، وحسابه/جهازه ما يقدر يدخل مرة ثانية، وتهنئته تنخفي) · hideWish {id, hidden} · pointsClaim ← pointsGo {id} (جهاز واحد بس) · pointsRelease · pointsDone ← pointsOk لباقي أجهزة المذيع
 *   خادم → wishes {cur, shown, total, pos} للكل · phase {p, at, until, walk, cut, sched, waitGirl} · wishList {items} للمذيع · points {id, players, durationMs} للمذيع
 *   خادم → room {room} عند تغيّر القائمة · s {now, d} دلتا الحركة كل 125ms
 *          (d مسطّحة: n,x,z,ry,a لكل لاعب تحرك، x/z بالسم وry ×100 — خاصة بكل مستقبل:
 *          القريب منه كل دورة والبعيد كل 1.5ث، وبدون صفه هو) — all {d} بنفس الصيغة · err {err, of} · closed
 */
'use strict';

var frame = require('../websocket/ws-frame');
var handshake = require('../websocket/ws-handshake');
var logger = require('../utils/logger');
var config = require('../config');
var createRoomManager = require('./party-rooms').createRoomManager;
var packRows = require('./party-rooms').packRows;

var SEND_MS = 125;                       // 8 تحديثات حركة بالثانية للقريبين
var FAR_EVERY = 12;                      // البعيدين (> 10م) كل 12 دورة = مرة كل 1.5ث
var EMPTY_ROOM_MS = 30 * 60 * 1000;      // غرفة بدون أي اتصال أكثر من كذا ← تنقفل
var MAX_MSG = 4 * 1024;
var MAX_BACKLOG = 256 * 1024;            // بايتات متكدّسة لاتصال ما يقرأ ← نقطعه
var ROSTER_MS = 1000;                    // قائمة الحضور تنرسل للكل مرة بالثانية كحد أقصى
var MSG_RATE = 30, MSG_BURST = 60;       // رسائل/ث لكل اتصال
var HEAVY_RATE = 1, HEAVY_BURST = 3;     // host/join/resume/peek (ردها كبير) — مرة بالثانية
var MAX_DROPS = 300;                     // تجاوزات كثيرة ← نقطع الاتصال
var crypto = require('crypto');

var _enabled = !!config.partyEnabled;
var _hostKey = String(config.partyHostKey || '');
var _idleMs = 40 * 1000;                 // ما وصل شي من الاتصال كذا (الجوال يرسل ping كل 15ث) ← ميت
var _roster = {};                        // code -> {at, dirty}
// التحقق من الجلسة يتحمّل وقت الحاجة فقط (يفتح قاعدة البيانات)
var _mgr = createRoomManager({
    maxRooms: config.partyMaxRooms || 2,
    validateSession: function (token) { try { return require('../auth/auth-service').validateSession(token); } catch (err) { logger.error('Party: session check failed:', err); return null; } }
});
// الحفظ في SQLite (party-store): الحفلة ترجع بعد إعادة تشغيل السيرفر. مجمّع (مرة كل 2ث بالأكثر لكل
// غرفة)، وفوري لما تتغيّر المرحلة. _store = null ← بدون حفظ (الاختبارات، أو القاعدة ما اشتغلت)
var SAVE_MS = 2000, ENDED_KEEP_MS = 2 * 60 * 60 * 1000, POINTS_KEEP_MS = 48 * 60 * 60 * 1000;
var _store = null, _save = {}, _sigHooked = false;   // code -> {at, dirty}
function markSave(code, now) {
    if (!_store || !code) return;
    var st = _save[code] || (_save[code] = { at: 0, dirty: false });
    st.dirty = true; if (now) st.at = 0;
}
function flushSave(code, force) {
    var st = _save[code]; if (!_store || !st || !st.dirty) return;
    var t = Date.now(); if (!force && t - st.at < SAVE_MS) return;
    st.at = t; st.dirty = false;
    try { var o = _mgr.serialize(code); if (o) _store.save(code, o); } catch (err) { logger.error('Party: save failed:', err); }
}
// إيقاف السيرفر (نشر جديد على Render يرسل SIGTERM): نكتب كل التغييرات المعلّقة قبل ما يطفي
function flushAll() { Object.keys(_save).forEach(function (code) { flushSave(code, true); }); }
function dropRoom(code, why) {
    _mgr.closeRoom(code); delete _emptySince[code]; delete _roster[code]; delete _wl[code]; delete _save[code];
    if (_store) { try { _store.remove(code); } catch (err) { logger.error('Party: store remove failed:', err); } }
    logger.log('Party: room ' + code + ' closed (' + why + ')');
}
// عند تشغيل السيرفر: نرجّع الحفلات المحفوظة (party-rooms.restore يكمّل حسب الساعة)
function boot() {
    if (!_enabled) return;
    if (!_store) { try { _store = require('./party-store').createStore(require('../db/database')); } catch (err) { logger.error('Party: store unavailable:', err); return; } }
    var n = 0;
    var rows = [];
    try { rows = _store.loadAll(); } catch (err) { logger.error('Party: load failed:', err); }
    // كل غرفة لحالها: صف تالف ما يوقف رجوع الباقي
    rows.forEach(function (o) {
        try {
            var res = _mgr.restore(o);
            if (res.ok) { n++; markSave(res.code, true); }
            else if ((res.err === 'expired' || res.err === 'bad') && o && typeof o.code === 'string') _store.remove(o.code);
        } catch (err) { logger.error('Party: restore failed for ' + (o && o.code) + ':', err); }
    });
    if (n) logger.log('Party: restored ' + n + ' rooms');
    if (!_sigHooked) {
        _sigHooked = true;
        process.once('SIGTERM', function () { try { flushAll(); } catch (e) { } process.kill(process.pid, 'SIGTERM'); });
    }
    ensureTicker();
}

var _clients = {};   // connectionId -> { socket, code, role: 'host'|'player'|'viewer', id, closed }
var _emptySince = {}; // code -> وقت آخر مرة صارت الغرفة بدون اتصالات

function sendRaw(client, encoded) {
    if (!client || client.closed) return;
    // جوال معلّق ما يقرأ: بدل ما نكدّس له بالذاكرة للأبد نقطعه (يرجع بـ resume)
    if ((client.socket.writableLength || 0) > MAX_BACKLOG) { try { client.socket.destroy(); } catch (e) { } if (client.cid) removeClient(client.cid); return; }
    try { client.socket.write(encoded); } catch (err) { logger.error('Party: write failed:', err); }
}
function send(client, obj) { if (client && !client.closed) sendRaw(client, frame.encodeTextFrame(JSON.stringify(obj))); }
function keyOk(k) { return !!_hostKey && sameKey(k, _hostKey); }
function sameKey(k, secret) {
    var a = Buffer.from(String(k || '')), b = Buffer.from(String(secret));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// دلو رموز بسيط لكل اتصال: يرجع false إذا لازم نتجاهل الرسالة
function allow(client, heavy) {
    var now = Date.now(), dt = (now - client.bucketAt) / 1000; client.bucketAt = now;
    client.tokens = Math.min(MSG_BURST, client.tokens + dt * MSG_RATE);
    client.heavy = Math.min(HEAVY_BURST, client.heavy + dt * HEAVY_RATE);
    if (client.tokens < 1 || (heavy && client.heavy < 1)) {
        if (++client.drops > MAX_DROPS) { try { client.socket.destroy(); } catch (e) { } removeClient(client.cid); }
        return false;
    }
    client.tokens -= 1; if (heavy) client.heavy -= 1;
    return true;
}
function roomClients(code) { return Object.keys(_clients).map(function (k) { return _clients[k]; }).filter(function (c) { return c.code === code && !c.closed; }); }

function rosterMsg(code) { var r = _mgr.roster(code); return r.ok ? { t: 'room', room: { code: r.code, girlName: r.girlName, chars: r.chars, players: r.players } } : null; }
// تغيّر بالحضور: نرسل فوراً إذا آخر إرسال قبل ثانية، وإلا نأجّله لدورة tickAll (يمنع
// موجة دخول 100 شخص من إرسال القائمة الكاملة لكل واحد 100 مرة)
function markRoster(code) {
    var st = _roster[code] || (_roster[code] = { at: 0, dirty: false });
    if (Date.now() - st.at >= ROSTER_MS) broadcastRoster(code); else st.dirty = true;
}
function broadcastRoster(code) {
    var st = _roster[code] || (_roster[code] = { at: 0, dirty: false }); st.at = Date.now(); st.dirty = false;
    var r = _mgr.roster(code); if (!r.ok) return;
    var encoded = frame.encodeTextFrame(JSON.stringify({ t: 'room', room: { code: r.code, girlName: r.girlName, chars: r.chars, players: r.players } }));
    roomClients(code).forEach(function (c) { sendRaw(c, encoded); });
}
function phaseMsg(code) {
    var ph = _mgr.phaseOf(code); if (!ph.ok) return null;
    var walk = null;
    if (ph.walk) { walk = []; Object.keys(ph.walk).forEach(function (n) { walk.push(Number(n), Math.round(ph.walk[n][0] * 100), Math.round(ph.walk[n][1] * 100)); }); }
    return { t: 'phase', p: ph.p, at: ph.at, until: ph.until, walk: walk, cut: !!ph.cut, sched: ph.sched, waitGirl: !!ph.waitGirl, now: Date.now() };
}
function broadcastPhase(code) {
    var m = phaseMsg(code); if (!m) return;
    var encoded = frame.encodeTextFrame(JSON.stringify(m));
    roomClients(code).forEach(function (c) { sendRaw(c, encoded); });
    if (m.p === 'photo') sendPoints(code);
    markSave(code, true);
}
function wishesMsg(code) { var w = _mgr.wishesState(code); return w.ok ? { t: 'wishes', cur: w.cur, shown: w.shown, total: w.total, pos: w.pos } : null; }
function broadcastWishes(code) {
    var m = wishesMsg(code); if (!m) return;
    var encoded = frame.encodeTextFrame(JSON.stringify(m));
    roomClients(code).forEach(function (c) { sendRaw(c, encoded); });
}
function hosts(code) { return roomClients(code).filter(function (c) { return c.role === 'host'; }); }
function sendWishList(code, only) {
    var wl = _mgr.wishList(code); if (!wl.ok) return;
    if (!only) { var st = _wl[code] || (_wl[code] = { at: 0, dirty: false }); st.at = Date.now(); st.dirty = false; }
    (only ? [only] : hosts(code)).forEach(function (c) { send(c, { t: 'wishList', items: wl.items }); });
}
// القائمة كاملة ممكن توصل ~45KB مع 100 رسالة، فتعديلات الضيوف تتجمّع (مرة كل نص ثانية بالأكثر)
var _wl = {}, WISHLIST_MS = 500;
function markWishList(code) {
    var st = _wl[code] || (_wl[code] = { at: 0, dirty: false });
    if (Date.now() - st.at >= WISHLIST_MS) sendWishList(code); else st.dirty = true;
}
// النقاط تنرسل للمذيع (هو اللي مسجّل دخول ويرسلها للمنصة) لين يرد pointsDone
function sendPoints(code, only) {
    var room = _mgr.getRoom(code); if (!room || room.pointsAcked) return;
    if (!room.pointsMsg) { var pl = _mgr.pointsList(code); if (!pl.ok) return; room.pointsMsg = { t: 'points', id: code + ':' + room.startedAt, players: pl.players, durationMs: pl.durationMs }; }
    (only ? [only] : hosts(code)).forEach(function (c) { send(c, room.pointsMsg); });
}
function myWishFor(code, id) { var room = _mgr.getRoom(code); var w = room && room.wishes.find(function (x) { return x.pid === id; }); return w ? { t: 'myWish', text: w.text, shown: w.shown } : null; }
function sendAll(client) { var d = _mgr.fullState(client.code, client.role === 'player' ? client.id : null, !!client.trusted); if (Array.isArray(d)) send(client, { t: 'all', now: Date.now(), d: packRows(d) }); }

// trusted: المذيع وشاشة العرض اللي معها مفتاحه (vk) — يشوفون صاحبة الحفلة قبل الافتتاح
function attach(client, code, role, id, trusted) {
    client.code = code; client.role = role; client.id = id || null; client.seen = new Map(); client.trusted = role === 'host' || !!trusted;
    delete _emptySince[code];
}

function onWelcome(client, code, res) {
    attach(client, code, 'player', res.id);
    send(client, { t: 'welcome', id: res.id, key: res.key, n: res.n, role: res.role, kind: res.kind });
    send(client, rosterMsg(code));
    markRoster(code);
    send(client, phaseMsg(code));
    send(client, wishesMsg(code));
    var mw = myWishFor(code, res.id); if (mw) send(client, mw);
    sendAll(client);
}

function onMessage(client, msg) {
    var t = msg && msg.t;
    if (t === 'ping') return send(client, { t: 'pong', k: msg.k, now: Date.now() });
    if (typeof t !== 'string') return;
    var ident = t === 'host' || t === 'join' || t === 'resume' || t === 'peek';
    var heavy = ident || t === 'start' || t === 'skip' || t === 'wish' || t === 'next' || t === 'cut' || t === 'hideWish' || t === 'pointsDone' || t === 'pointsClaim' || t === 'pointsRelease' || t === 'look' || t === 'kick' || t === 'schedule' || t === 'prev' || t === 'rain' || t === 'chars';
    if (!allow(client, heavy)) return;
    try { return handle(client, msg, t, ident); } finally { if (heavy && client.code) markSave(client.code); }
}
function handle(client, msg, t, ident) {
    if (!_enabled) return send(client, { t: 'err', err: 'disabled', of: t });
    // كل اتصال له هوية وحدة: المشاهد (peek) يقدر يدخل كلاعب مرة، وغير كذا مرفوض
    if (ident && (client.role === 'player' || client.role === 'host' || (client.role === 'viewer' && t === 'host'))) return send(client, { t: 'err', err: 'already', of: t });
    var code = typeof msg.code === 'string' ? msg.code : null, res;

    if (t === 'host') {
        if (code) {
            res = _mgr.hostResume(code, String(msg.token || ''));
            if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
            var room = _mgr.getRoom(code);
            attach(client, code, 'host');
            send(client, { t: 'hosted', code: code, token: room.token, girlKey: room.girlKey, viewKey: room.viewKey });
        } else {
            if (!keyOk(msg.key)) return send(client, { t: 'err', err: 'hostkey', of: t });
            // كل حفلة من صفحة المذيع مجدولة (الغرفة بدون جدول للاختبارات بس)
            if (!msg.schedule || typeof msg.schedule !== 'object') return send(client, { t: 'err', err: 'schedule', of: t });
            res = _mgr.createRoom({ girlName: msg.girlName, schedule: msg.schedule, chars: msg.chars });
            if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
            attach(client, res.code, 'host');
            logger.log('Party: room ' + res.code + ' created');
            send(client, { t: 'hosted', code: res.code, token: res.token, girlKey: res.girlKey, viewKey: res.viewKey });
        }
        send(client, rosterMsg(client.code)); send(client, phaseMsg(client.code)); send(client, wishesMsg(client.code)); sendAll(client);
        sendWishList(client.code, client);
        // النقاط تنتظر المذيع حتى بعد نهاية الحفلة (لو ما كان مسجّل دخوله وقت الصورة)
        var ph0 = _mgr.phaseOf(client.code).p, rm0 = _mgr.getRoom(client.code);
        if (ph0 === 'photo' || ph0 === 'free' || (ph0 === 'ended' && rm0 && rm0.photoDone)) sendPoints(client.code, client);
        return;
    }
    if (t === 'peek') {
        if (!code || !_mgr.getRoom(code)) return send(client, { t: 'err', err: 'nocode', of: t });
        attach(client, code, 'viewer', null, sameKey(msg.vk, _mgr.getRoom(code).viewKey));
        send(client, rosterMsg(code));
        send(client, phaseMsg(code));
        send(client, wishesMsg(code));
        sendAll(client);
        return;
    }
    if (t === 'join') {
        if (!code) return send(client, { t: 'err', err: 'nocode', of: t });
        res = _mgr.join(code, { name: msg.name, auth: msg.auth || null, girlKey: msg.girlKey == null ? null : String(msg.girlKey), dev: msg.dev });
        if (!res.ok && res.err === 'closed') {
            // الدخول لسا ما فتح: يبقى مشاهد (بدون صاحبة الحفلة) لين توصله phase lobby ويدخل
            var rc = _mgr.getRoom(code), pc = _mgr.phaseOf(code);
            if (!client.code) attach(client, code, 'viewer', null, false);
            send(client, { t: 'closed', openAt: pc.sched.openAt, tzOffsetMin: pc.sched.tzOffsetMin, girlName: rc.girlName });
            send(client, phaseMsg(code));
            return;
        }
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        logger.log('Party: ' + res.role + ' joined room ' + code + ' (' + res.kind + ')');
        return onWelcome(client, code, res);
    }
    if (t === 'resume') {
        if (!code || typeof msg.id !== 'string' || typeof msg.key !== 'string') return send(client, { t: 'err', err: 'resume', of: t });
        res = _mgr.resume(code, msg.id, msg.key);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        // نفس اللاعب من اتصال أقدم (تبويب ثاني/اتصال معلّق) يتفصل عنه
        Object.keys(_clients).forEach(function (k) { var c = _clients[k]; if (c !== client && c.code === code && c.id === msg.id) { c.id = null; c.role = 'viewer'; send(c, { t: 'err', err: 'elsewhere', of: t }); } });
        return onWelcome(client, code, res);
    }
    if (t === 'start' || t === 'skip') {
        if (client.role !== 'host' || !client.code) return send(client, { t: 'err', err: 'host-only', of: t });
        res = t === 'start' ? _mgr.start(client.code) : _mgr.skip(client.code, String(msg.from || ''));
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        logger.log('Party: room ' + client.code + ' → ' + _mgr.phaseOf(client.code).p);
        return broadcastPhase(client.code);
    }
    if (t === 'wish') {
        if (client.role !== 'player' || !client.code) return send(client, { t: 'err', err: 'role', of: t });
        res = _mgr.addWish(client.code, client.id, typeof msg.text === 'string' ? msg.text.slice(0, 2000) : '');
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        send(client, myWishFor(client.code, client.id));
        markWishList(client.code);
        if (res.isNew) broadcastWishes(client.code); // التعديل ما يغيّر العدد ولا المعروضة
        return;
    }
    if (t === 'schedule') {
        if (client.role !== 'host' || !client.code) return send(client, { t: 'err', err: 'host-only', of: t });
        res = _mgr.setSchedule(client.code, msg.schedule);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        logger.log('Party: room ' + client.code + ' schedule updated');
        _mgr.tick(client.code); // تعديل فتح الدخول أو البداية ممكن ينقل المرحلة على طول
        return broadcastPhase(client.code);
    }
    if (t === 'next' || t === 'cut' || t === 'prev') {
        if (!client.code || (client.role !== 'host' && client.role !== 'player')) return send(client, { t: 'err', err: 'role', of: t });
        var by = client.role === 'host' ? 'host' : client.id, seen = typeof msg.seen === 'number' ? msg.seen : null;
        res = t === 'next' ? _mgr.nextWish(client.code, by, seen) : t === 'prev' ? _mgr.prevWish(client.code, by, seen) : _mgr.cut(client.code, by);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        sendWishList(client.code); broadcastWishes(client.code);
        if (t === 'cut' || res.done) { logger.log('Party: room ' + client.code + ' → ' + _mgr.phaseOf(client.code).p); broadcastPhase(client.code); }
        return;
    }
    if (t === 'hideWish' || t === 'pointsDone' || t === 'pointsClaim' || t === 'pointsRelease') {
        if (client.role !== 'host' || !client.code) return send(client, { t: 'err', err: 'host-only', of: t });
        var rm = _mgr.getRoom(client.code);
        // النقاط: جهاز مذيع واحد بس يرسلها (لو المذيع فاتح الصفحة بجهازين) — اللي يحجز أول
        if (t === 'pointsClaim') {
            if (!rm || !rm.pointsMsg || rm.pointsAcked) return send(client, { t: 'err', err: 'done', of: t });
            if (rm.pointsClaim && rm.pointsClaim !== client.cid && _clients[rm.pointsClaim]) return send(client, { t: 'err', err: 'claimed', of: t });
            rm.pointsClaim = client.cid; return send(client, { t: 'pointsGo', id: rm.pointsMsg.id });
        }
        if (t === 'pointsRelease') { if (rm && rm.pointsClaim === client.cid) rm.pointsClaim = null; return; }
        if (t === 'pointsDone') {
            if (rm && !rm.pointsAcked) { rm.pointsAcked = true; rm.pointsClaim = null; hosts(client.code).forEach(function (c) { if (c !== client) send(c, { t: 'pointsOk' }); }); }
            return;
        }
        res = _mgr.hideWish(client.code, msg.id, !!msg.hidden);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        sendWishList(client.code); broadcastWishes(client.code);
        return;
    }
    if (t === 'react') {
        if (client.role !== 'player' || !client.code) return;
        _mgr.react(client.code, client.id, msg.e); // الزيادة تنتجاهل بصمت (ضغط سريع على الأيقونة)
        return;
    }
    if (t === 'rain') {
        if (client.role !== 'player' || !client.code) return send(client, { t: 'err', err: 'role', of: t });
        res = _mgr.rain(client.code, client.id);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t, at: res.at });
        var enc = frame.encodeTextFrame(JSON.stringify({ t: 'rain', at: res.at }));
        roomClients(client.code).forEach(function (c) { sendRaw(c, enc); });
        return;
    }
    if (t === 'chars') {
        if (client.role !== 'host' || !client.code) return send(client, { t: 'err', err: 'host-only', of: t });
        res = _mgr.setChars(client.code, msg.v);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        return broadcastRoster(client.code);
    }
    if (t === 'look') {
        if (client.role !== 'player' || !client.code) return send(client, { t: 'err', err: 'role', of: t });
        res = _mgr.setLook(client.code, client.id, msg.look);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        return markRoster(client.code);
    }
    if (t === 'kick') {
        if (client.role !== 'host' || !client.code) return send(client, { t: 'err', err: 'host-only', of: t });
        res = _mgr.kick(client.code, msg.n);
        if (!res.ok) return send(client, { t: 'err', err: res.err, of: t });
        // المطرود: نبلغه ونقفل اتصاله (بدون leave — شخصيته انشالت أصلاً)
        Object.keys(_clients).forEach(function (k) {
            var c = _clients[k];
            if (c.code === client.code && c.id === res.id) { send(c, { t: 'err', err: 'kicked', of: 'kick' }); c.id = null; c.role = 'viewer'; try { c.socket.end(); } catch (e) { } }
        });
        logger.log('Party: room ' + client.code + ' kicked n=' + Number(msg.n));
        if (res.wishHidden) { sendWishList(client.code); broadcastWishes(client.code); }
        return markRoster(client.code);
    }
    if (t === 'mv') {
        if (client.role !== 'player' || !client.code) return;
        _mgr.move(client.code, client.id, msg.p);
        return;
    }
}

var _tickN = 0;
function tickAll() {
    var now = Date.now(), farTick = (++_tickN % FAR_EVERY) === 0;
    // اتصالات صامتة (جوال نايم/شبكة ميتة) تنقطع عشان صاحبها ما يبقى «متصل» للأبد
    Object.keys(_clients).forEach(function (cid) {
        var c = _clients[cid];
        if (c && now - c.lastRx > _idleMs) { try { c.socket.destroy(); } catch (e) { } removeClient(cid); }
    });
    _mgr.rooms().forEach(function (code) {
        try {
            var cs = roomClients(code), room = _mgr.getRoom(code), sc = room && room.sched;
            // الحفلة المجدولة تمشي على الساعة حتى لو محد متصل، وتبقى لين ساعتين بعد نهايتها
            // (وأكثر لو النقاط ما انحسبت — تنتظر المذيع يفتح صفحته)
            if (sc) {
                var endAt = sc.startAt + sc.durationMin * 60000;
                // تنشال بعد ساعتين من النهاية لو ما فيه نقاط تنتظر المذيع، وبعد يومين بأي حال
                if ((now > endAt + ENDED_KEEP_MS && (!room.pointsMsg || room.pointsAcked) && !cs.length) || now > endAt + POINTS_KEEP_MS) return dropRoom(code, 'ended');
            } else if (!cs.length) {
                if (!_emptySince[code]) _emptySince[code] = now;
                else if (now - _emptySince[code] > EMPTY_ROOM_MS) dropRoom(code, 'empty');
                return;
            }
            var tk = _mgr.tick(code);
            if (tk.ok && tk.changed) { logger.log('Party: room ' + code + ' → ' + _mgr.phaseOf(code).p); broadcastPhase(code); }
            flushSave(code);
            if (!cs.length) return;
            var st = _roster[code];
            if (st && st.dirty && now - st.at >= ROSTER_MS) broadcastRoster(code);
            var wl = _wl[code];
            if (wl && wl.dirty && now - wl.at >= WISHLIST_MS) sendWishList(code);
            // التفاعلات توصل الكل كل دورة (محدودة بمعدل لكل لاعب)؛ الجوال يقرر يرسم البعيد أو لا
            var rq = _mgr.takeReacts(code);
            if (rq.length) {
                var rmObj = _mgr.getRoom(code);
                cs.forEach(function (c) {
                    if (c.role === 'host') return;
                    var me = c.role === 'player' && c.id ? rmObj.players.find(function (p) { return p.id === c.id; }) : null, d = [];
                    rq.forEach(function (x) {
                        if (x.girl && !c.trusted && _mgr.reactHidden(code, true) && !(me && me.role === 'girl')) return;
                        d.push(x.n, x.e);
                    });
                    if (d.length) sendRaw(c, frame.encodeTextFrame(JSON.stringify({ t: 'reacts', d: d })));
                });
            }
            cs.forEach(function (c) {
                if (c.role === 'host') return; // لوحة المذيع ما تعرض الحركة
                var d = _mgr.deltaFor(code, c.role === 'player' ? c.id : null, c.seen || (c.seen = new Map()), farTick, !!c.trusted);
                if (Array.isArray(d) && d.length) sendRaw(c, frame.encodeTextFrame(JSON.stringify({ t: 's', now: now, d: packRows(d) })));
            });
        } catch (err) { logger.error('Party: tick error:', err); }
    });
}
var _ticker = null;
function ensureTicker() { if (!_ticker) { _ticker = setInterval(tickAll, SEND_MS); if (_ticker.unref) _ticker.unref(); } }

function removeClient(id) {
    var c = _clients[id]; if (!c) return;
    c.closed = true; delete _clients[id];
    try {
        if (c.code && c.id && c.role === 'player') { _mgr.leave(c.code, c.id); markRoster(c.code); }
    } catch (err) { logger.error('Party: leave error:', err); }
}

function handleUpgrade(req, socket) {
    var key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + handshake.computeAcceptKey(key), '', ''].join('\r\n'));
    try { socket.setNoDelay(true); } catch (e) { }
    ensureTicker();

    var id = 'pt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    var now0 = Date.now();
    var client = _clients[id] = { cid: id, socket: socket, code: null, role: null, id: null, closed: false, lastRx: now0, bucketAt: now0, tokens: MSG_BURST, heavy: HEAVY_BURST, drops: 0 };
    var buffer = Buffer.alloc(0);

    socket.on('data', function (chunk) {
        try {
            client.lastRx = Date.now();
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length > MAX_MSG * 8) { socket.destroy(); removeClient(id); return; }
            var result;
            while ((result = frame.tryDecodeFrame(buffer)) !== null) {
                buffer = buffer.slice(result.bytesConsumed);
                if (result.opcode === frame.OPCODES.CLOSE) { socket.end(); removeClient(id); return; }
                if (result.opcode === frame.OPCODES.PING) { socket.write(frame.encodeControlFrame(frame.OPCODES.PONG)); continue; }
                if (result.opcode !== frame.OPCODES.TEXT || result.payload.length > MAX_MSG) continue;
                var msg; try { msg = JSON.parse(result.payload.toString('utf8')); } catch (err) { continue; }
                try { onMessage(client, msg); } catch (err) { logger.error('Party: message error:', err); }
            }
        } catch (err) { logger.error('Party: data error:', err); try { socket.destroy(); } catch (e) { } removeClient(id); }
    });
    // FIN بدون إطار إغلاق (http.Server يسمح بنصف-إغلاق) ← نقفل من جهتنا
    socket.on('end', function () { try { socket.end(); } catch (e) { } removeClient(id); });
    socket.on('close', function () { removeClient(id); });
    socket.on('error', function () { removeClient(id); });
}

module.exports = {
    handleUpgrade: handleUpgrade,
    boot: boot,
    _flushAll: flushAll,
    _setStore: function (st) { _store = st || null; _save = {}; },
    _mgr: _mgr,
    _setEnabled: function (v) { _enabled = !!v; },
    _setHostKey: function (k) { _hostKey = String(k || ''); },
    _setIdleMs: function (ms) { _idleMs = ms; },
    _sendRaw: sendRaw
};
