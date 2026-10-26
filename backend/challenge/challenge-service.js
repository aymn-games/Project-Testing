/**
 * تحدي البثوث — البحث عن ستريمر، الدعوات، وبدء المباراة.
 *
 * الستريمر (أ) يختار اللعبة وإعداداتها، يبحث عن خصمه (بيوزر تيك توك أو ID
 * البروفايل) ويرسل له دعوة. الدعوة تظهر للخصم بشاشة تحدي البثوث
 * (challenge.html — تسحب صندوق الدعوات كل بضع ثواني)، ولو قبلها تنشأ
 * المباراة (challenge-match.js) وتنتقل الشاشتين لها.
 *
 * ألعاب twoStep (ركلات الترجيح): القبول ما ينشئ المباراة مباشرة — الخصم
 * يجهّز إعداداته (اسم فريقه + المسموح لهم) ويضغط «جاهز» (status: setup →
 * ready)، والمنشئ يضغط «الدخول للوبي» (start) فتنشأ المباراة.
 *
 * كل شي هنا بالذاكرة: إعادة تشغيل الخادم تلغي الدعوات والمباريات الجارية.
 * شروط الطرفين: حساب ستريمر (أو أدمن/صلاحية تشغيل) مربوط بتيك توك موثَّق.
 */
'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var logger = require('../utils/logger');
var challengeMatch = require('./challenge-match');

var INVITE_TTL_MS = 2 * 60 * 1000;
var KEEP_INVITE_MS = 10 * 60 * 1000;
var SETUP_TTL_MS = 10 * 60 * 1000;   // مدة تجهيز الخصم لإعداداته بعد القبول (twoStep)

var _invites = {};        // id -> invite
var _activeMatch = {};    // userId -> matchId (مباراة جارية)
// وين الستريمر الحين (نبضة من صفحته كل ~20 ثانية): 'library' = فاضي بمكتبة
// الألعاب، أو اسم لعبة بثين = فاتح شاشة دعوتها وينتظر خصم (مع إعداداته عشان
// أي ستريمر يقدر يدخل مباشرة).
var _presence = {};       // userId -> {where, settings, at}
var PRESENCE_TTL_MS = 45 * 1000;

function now() { return Date.now(); }

function parsePermissions(p) {
    if (p && typeof p === 'object') return p;
    try { return JSON.parse(p || '{}'); } catch (e) { return {}; }
}

/** حساب يقدر يدخل تحدي: يشغّل ألعاب + تيك توك مربوط موثَّق. */
function isEligible(u) {
    if (!u || !u.tiktok_verified || !u.tiktok_username) return false;
    var perms = parsePermissions(u.permissions);
    return u.role === 'admin' || Boolean(u.is_streamer) || Boolean(perms.can_run_games) || Boolean(perms.full_game_access);
}

var USER_COLUMNS = 'id, username, display_name, role, is_streamer, permissions, tiktok_username, tiktok_verified, tiktok_display_name, custom_id, avatar_image_base64, tiktok_avatar_url';

function loadUser(id) {
    return db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE id = ?').get(id);
}

function profile(u, withAvatar) {
    return {
        userId: u.id,
        customId: u.custom_id,
        name: u.display_name || u.tiktok_display_name || u.username,
        tiktok: String(u.tiktok_username || '').replace(/^@+/, ''),
        avatar: withAvatar === false ? null : (u.avatar_image_base64 || u.tiktok_avatar_url || null)
    };
}

function publicProfile(u, withAvatar) {
    var p = profile(u, withAvatar);
    delete p.userId;
    return p;
}

/** الستريمر في مباراة جارية الحين؟ */
function activeMatchFor(userId) {
    var id = _activeMatch[userId];
    var m = id ? challengeMatch.getMatch(id) : null;
    if (!m || m.ended) { delete _activeMatch[userId]; return null; }
    return m;
}

/** دعوة ما انحسمت بعد (بانتظار الرد أو الخصم يجهّز). */
function isOpen(inv) { return inv.status === 'pending' || inv.status === 'setup' || inv.status === 'ready'; }

function expireInvites() {
    var t = now();
    Object.keys(_invites).forEach(function (id) {
        var inv = _invites[id];
        if (inv.status === 'pending' && t > inv.expiresAt) inv.status = 'expired';
        if ((inv.status === 'setup' || inv.status === 'ready') && t > inv.setupExpiresAt) inv.status = 'expired';
        if (!isOpen(inv) && t - (inv.setupExpiresAt || inv.createdAt) > KEEP_INVITE_MS) delete _invites[id];
    });
}

/**
 * بحث عن خصم بيوزر تيك توك (مطابقة أو بداية الاسم) أو ID البروفايل.
 * @returns {{success:boolean, results?:Array, error?:string}}
 */
function search(me, rawQuery) {
    var q = String(rawQuery || '').trim().replace(/^@+/, '').replace(/^#/, '');
    if (q.length < 2) return { success: true, results: [] };
    var rows = [];
    if (/^\d+$/.test(q)) rows = db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE custom_id = ?').all(q);
    var like = q.replace(/[%_\\]/g, '\\$&') + '%';
    rows = rows.concat(db.prepare(
        'SELECT ' + USER_COLUMNS + " FROM users WHERE tiktok_verified = 1 AND tiktok_username LIKE ? ESCAPE '\\' ORDER BY LENGTH(tiktok_username) LIMIT 10"
    ).all(like));
    var seen = {};
    var results = rows.filter(function (u) {
        if (seen[u.id] || u.id === me.id || !isEligible(u)) return false;
        seen[u.id] = true;
        return true;
    }).slice(0, 8).map(function (u) {
        var p = publicProfile(u);
        p.busy = Boolean(activeMatchFor(u.id));
        return p;
    });
    return { success: true, results: results };
}

/**
 * إرسال دعوة.
 * @returns {{success:boolean, invite?:Object, error?:string}}
 */
function createInvite(me, toCustomId, game, settings) {
    expireInvites();
    if (!isEligible(me)) return { success: false, error: 'not_eligible' };
    if (!challengeMatch.GAMES[game]) return { success: false, error: 'unknown_game' };
    var to = db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE custom_id = ?').get(String(toCustomId || ''));
    if (!to || !isEligible(to)) return { success: false, error: 'opponent_not_eligible' };
    if (to.id === me.id) return { success: false, error: 'self' };
    if (activeMatchFor(me.id)) return { success: false, error: 'you_in_match' };
    if (activeMatchFor(to.id)) return { success: false, error: 'opponent_in_match' };

    // دعوة وحدة معلّقة لكل مرسل — الجديدة تلغي القديمة.
    Object.keys(_invites).forEach(function (id) {
        var inv = _invites[id];
        if (inv.fromId === me.id && isOpen(inv)) inv.status = 'cancelled';
    });

    var hostSettings = challengeMatch.GAMES[game].sanitizeHost(settings);
    if (hostSettings.error) return { success: false, error: hostSettings.error };

    var fromRow = loadUser(me.id);
    var inv = {
        id: crypto.randomBytes(6).toString('hex'),
        fromId: me.id,
        toId: to.id,
        from: profile(fromRow),
        to: profile(to),
        game: game,
        gameName: challengeMatch.GAMES[game].name,
        settings: hostSettings,
        guestSettings: null,
        twoStep: Boolean(challengeMatch.GAMES[game].twoStep),
        setupExpiresAt: null,
        status: 'pending',
        matchId: null,
        createdAt: now(),
        expiresAt: now() + INVITE_TTL_MS
    };
    _invites[inv.id] = inv;
    logger.log('Challenge: invite ' + inv.id + ' ' + inv.from.tiktok + ' → ' + inv.to.tiktok + ' (' + game + ')');
    return { success: true, invite: inviteView(inv, me.id, {}) };
}

function inviteView(inv, viewerId, haveAvatars) {
    var other = inv.fromId === viewerId ? inv.to : inv.from;
    var otherPublic = { customId: other.customId, name: other.name, tiktok: other.tiktok, avatar: haveAvatars[inv.id] ? null : other.avatar };
    return {
        id: inv.id,
        direction: inv.fromId === viewerId ? 'out' : 'in',
        other: otherPublic,
        game: inv.game,
        gameName: inv.gameName,
        settings: inv.settings,
        guestSettings: inv.guestSettings,
        twoStep: inv.twoStep,
        status: inv.status,
        matchId: inv.matchId,
        expiresIn: Math.max(0, (inv.status === 'pending' ? inv.expiresAt : (inv.setupExpiresAt || inv.expiresAt)) - now())
    };
}

/**
 * صندوق الدعوات: الواردة المعلّقة + آخر دعوة صادرة + المباراة الجارية.
 * have: معرّفات دعوات عند المتصفح صورتها (ما نعيد إرسال الصورة كل مرة).
 */
function inbox(me, have) {
    expireInvites();
    var haveAvatars = {};
    String(have || '').split(',').forEach(function (id) { if (id) haveAvatars[id] = true; });
    var incoming = [], outgoing = null, joined = null;
    Object.keys(_invites).forEach(function (id) {
        var inv = _invites[id];
        if (inv.toId === me.id && inv.status === 'pending') incoming.push(inviteView(inv, me.id, haveAvatars));
        // دعوة قبلها وهو يجهّز إعداداته (twoStep) — أو بدأت مباراتها.
        if (inv.toId === me.id && inv.twoStep && inv.status !== 'pending' && (!joined || inv.createdAt > joined._createdAt)) {
            joined = inviteView(inv, me.id, haveAvatars);
            joined._createdAt = inv.createdAt;
        }
        if (inv.fromId === me.id && (!outgoing || inv.createdAt > outgoing._createdAt)) {
            outgoing = inviteView(inv, me.id, haveAvatars);
            outgoing._createdAt = inv.createdAt;
        }
    });
    if (outgoing) delete outgoing._createdAt;
    if (joined) delete joined._createdAt;
    var m = activeMatchFor(me.id);
    return {
        success: true,
        eligible: isEligible(me),
        incoming: incoming,
        outgoing: outgoing,
        joined: joined,
        activeMatch: m ? { id: m.id, game: m.game } : null
    };
}

/** قبول/رفض دعوة واردة. ألعاب twoStep: القبول يبدأ التجهيز بس، وإعدادات الخصم تجي مع «جاهز». */
function respond(me, inviteId, accept, guestSettings) {
    expireInvites();
    var inv = _invites[String(inviteId || '')];
    if (!inv || inv.toId !== me.id) return { success: false, error: 'invite_not_found' };
    // twoStep: الخصم يقدر ينسحب وهو يجهّز (قبل ما يدخل المنشئ اللوبي).
    if (!accept && inv.twoStep && (inv.status === 'setup' || inv.status === 'ready')) { inv.status = 'declined'; return { success: true }; }
    if (inv.status !== 'pending') return { success: false, error: 'invite_' + inv.status };
    if (!accept) { inv.status = 'declined'; return { success: true }; }

    if (!isEligible(me)) return { success: false, error: 'not_eligible' };
    if (inv.twoStep) {
        if (activeMatchFor(inv.toId)) return { success: false, error: 'you_in_match' };
        inv.status = 'setup';
        inv.setupExpiresAt = now() + SETUP_TTL_MS;
        inv.guestSettings = null; // تنحفظ لما يضغط «جاهز» (guestReady)
        return { success: true, setup: true, inviteId: inv.id, game: inv.game };
    }
    var guest = challengeMatch.GAMES[inv.game].sanitizeGuest(guestSettings, inv.settings);
    if (guest.error) return { success: false, error: guest.error };
    return startMatchFor(inv, guest);
}

/** إنشاء مباراة دعوة (بعد قبول الخصم — أو بعد «جاهز» + دخول المنشئ للوبي بألعاب twoStep).
 * guest: إعدادات الخصم بعد sanitizeGuest. */
function startMatchFor(inv, guest) {
    var fromRow = loadUser(inv.fromId), toRow = loadUser(inv.toId);
    if (!fromRow || !isEligible(fromRow)) { inv.status = 'cancelled'; return { success: false, error: 'opponent_not_eligible' }; }
    if (activeMatchFor(inv.fromId)) { inv.status = 'cancelled'; return { success: false, error: 'opponent_in_match' }; }
    if (activeMatchFor(inv.toId)) return { success: false, error: 'you_in_match' };

    var m = challengeMatch.createMatch({
        game: inv.game,
        settings: Object.assign({}, inv.settings, guest),
        sides: [profile(fromRow), profile(toRow)],
        onEnd: function (match) {
            match.sides.forEach(function (s) { if (_activeMatch[s.userId] === match.id) delete _activeMatch[s.userId]; });
        }
    });
    if (!m) return { success: false, error: 'unknown_game' };
    _activeMatch[inv.fromId] = m.id;
    _activeMatch[inv.toId] = m.id;
    inv.status = 'accepted';
    inv.matchId = m.id;
    return { success: true, matchId: m.id, game: m.game };
}

/** twoStep: الخصم يحفظ إعداداته ويضغط «جاهز» (ready=false يرجّعه للتعديل). */
function guestReady(me, inviteId, ready, guestSettings) {
    expireInvites();
    var inv = _invites[String(inviteId || '')];
    if (!inv || inv.toId !== me.id || !inv.twoStep) return { success: false, error: 'invite_not_found' };
    if (inv.status !== 'setup' && inv.status !== 'ready') return { success: false, error: 'invite_' + inv.status };
    var guest = challengeMatch.GAMES[inv.game].sanitizeGuest(guestSettings, inv.settings);
    if (guest.error) return { success: false, error: guest.error };
    inv.guestSettings = guest;
    inv.status = ready ? 'ready' : 'setup';
    return { success: true, status: inv.status };
}

/** twoStep: المنشئ يدخل اللوبي بعد ما الخصم جاهز — تنشأ المباراة للطرفين. */
function hostStart(me, inviteId) {
    expireInvites();
    var inv = _invites[String(inviteId || '')];
    if (!inv || inv.fromId !== me.id || !inv.twoStep) return { success: false, error: 'invite_not_found' };
    if (inv.status === 'setup') return { success: false, error: 'opponent_not_ready' };
    if (inv.status !== 'ready' || !inv.guestSettings) return { success: false, error: 'invite_' + inv.status };
    if (!isEligible(me)) return { success: false, error: 'not_eligible' };
    if (activeMatchFor(inv.fromId)) return { success: false, error: 'you_in_match' };
    if (activeMatchFor(inv.toId)) { inv.status = 'cancelled'; return { success: false, error: 'opponent_in_match' }; }
    if (!isEligible(loadUser(inv.toId))) { inv.status = 'cancelled'; return { success: false, error: 'opponent_not_eligible' }; }
    return startMatchFor(inv, inv.guestSettings);
}

/* ---- الحضور + «دخول مباشر» ---- */

/** نبضة حضور من صفحة الستريمر. where فاضي = طلع من الصفحة. */
function presence(me, where, settings) {
    if (!isEligible(me)) return { success: false, error: 'not_eligible' };
    where = String(where || '');
    if (!where) { delete _presence[me.id]; return { success: true }; }
    if (where !== 'library' && !challengeMatch.GAMES[where]) return { success: false, error: 'unknown_game' };
    _presence[me.id] = { where: where, settings: settings && typeof settings === 'object' ? settings : {}, at: now() };
    return { success: true };
}

/** مشغول بدعوة: خصم يجهّز معه، أو هو نفسه يجهّز لمباراة غيره. */
function busyWithInvite(userId) {
    return Object.keys(_invites).some(function (id) {
        var inv = _invites[id];
        return (inv.status === 'setup' || inv.status === 'ready') && (inv.fromId === userId || inv.toId === userId);
    });
}

/**
 * البثوث المتاحة الحين: waiting = فاتحين شاشة دعوة لعبة بثين (ينتظرون خصم)،
 * idle = فاضين بمكتبة الألعاب. بدون اللي بمباراة أو يجهّزون لمباراة.
 */
function lobby(me) {
    expireInvites();
    var t = now(), waiting = [], idle = [];
    Object.keys(_presence).forEach(function (uid) {
        var p = _presence[uid], id = Number(uid);
        if (t - p.at > PRESENCE_TTL_MS) { delete _presence[uid]; return; }
        if (id === me.id || activeMatchFor(id) || busyWithInvite(id)) return;
        var u = loadUser(id);
        if (!u || !isEligible(u)) return;
        var row = publicProfile(u, false);
        if (p.where === 'library') { idle.push(row); return; }
        var game = challengeMatch.GAMES[p.where];
        var s = game.sanitizeHost(p.settings);
        if (s.error) return; // إعداداته ناقصة (مثلاً ما اختار فئاته) — ما يقدر أحد يدخل
        row.game = p.where;
        row.gameName = game.name;
        row.settings = s;
        waiting.push(row);
    });
    return { success: true, waiting: waiting, idle: idle };
}

/**
 * «دخول مباشر» لمباراة ستريمر ينتظر: دعوة منه لي بإعداداته الحالية، وتبدأ
 * مباشرة بخطوة التجهيز (كأني قبلتها) — بعدها نفس الدعوة العادية.
 */
function joinWaiting(me, hostCustomId, game) {
    expireInvites();
    if (!isEligible(me)) return { success: false, error: 'not_eligible' };
    var spec = challengeMatch.GAMES[game];
    if (!spec || !spec.twoStep) return { success: false, error: 'unknown_game' };
    var host = db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE custom_id = ?').get(String(hostCustomId || ''));
    if (!host || !isEligible(host)) return { success: false, error: 'opponent_not_eligible' };
    if (host.id === me.id) return { success: false, error: 'self' };
    var p = _presence[host.id];
    if (!p || p.where !== game || now() - p.at > PRESENCE_TTL_MS) return { success: false, error: 'not_waiting' };
    if (activeMatchFor(me.id)) return { success: false, error: 'you_in_match' };
    if (activeMatchFor(host.id) || busyWithInvite(host.id)) return { success: false, error: 'opponent_in_match' };
    if (busyWithInvite(me.id)) return { success: false, error: 'you_in_match' };
    var hostSettings = spec.sanitizeHost(p.settings);
    if (hostSettings.error) return { success: false, error: 'not_waiting' };

    Object.keys(_invites).forEach(function (id) {
        var inv = _invites[id];
        if (inv.fromId === host.id && isOpen(inv)) inv.status = 'cancelled';
    });
    var inv = {
        id: crypto.randomBytes(6).toString('hex'),
        fromId: host.id,
        toId: me.id,
        from: profile(host),
        to: profile(loadUser(me.id)),
        game: game,
        gameName: spec.name,
        settings: hostSettings,
        guestSettings: null,
        twoStep: true,
        setupExpiresAt: now() + SETUP_TTL_MS,
        status: 'setup',
        matchId: null,
        direct: true,
        createdAt: now(),
        expiresAt: now() + INVITE_TTL_MS
    };
    _invites[inv.id] = inv;
    logger.log('Challenge: direct join ' + inv.id + ' ' + inv.to.tiktok + ' → ' + inv.from.tiktok + ' (' + game + ')');
    return { success: true, inviteId: inv.id, game: game };
}

/** إلغاء دعوة صادرة. */
function cancel(me, inviteId) {
    var inv = _invites[String(inviteId || '')];
    if (!inv || inv.fromId !== me.id) return { success: false, error: 'invite_not_found' };
    if (isOpen(inv)) inv.status = 'cancelled';
    return { success: true };
}

module.exports = {
    isEligible: isEligible,
    search: search,
    createInvite: createInvite,
    inbox: inbox,
    respond: respond,
    guestReady: guestReady,
    hostStart: hostStart,
    cancel: cancel,
    presence: presence,
    lobby: lobby,
    joinWaiting: joinWaiting
};
