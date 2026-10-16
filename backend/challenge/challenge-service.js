/**
 * تحدي البثوث — البحث عن ستريمر، الدعوات، وبدء المباراة.
 *
 * الستريمر (أ) يختار اللعبة وإعداداتها، يبحث عن خصمه (بيوزر تيك توك أو ID
 * البروفايل) ويرسل له دعوة. الدعوة تظهر للخصم بشاشة تحدي البثوث
 * (challenge.html — تسحب صندوق الدعوات كل بضع ثواني)، ولو قبلها تنشأ
 * المباراة (challenge-match.js) وتنتقل الشاشتين لها.
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

var _invites = {};        // id -> invite
var _activeMatch = {};    // userId -> matchId (مباراة جارية)

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

function expireInvites() {
    var t = now();
    Object.keys(_invites).forEach(function (id) {
        var inv = _invites[id];
        if (inv.status === 'pending' && t > inv.expiresAt) inv.status = 'expired';
        if (inv.status !== 'pending' && t - inv.createdAt > KEEP_INVITE_MS) delete _invites[id];
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
        if (inv.fromId === me.id && inv.status === 'pending') inv.status = 'cancelled';
    });

    var fromRow = loadUser(me.id);
    var inv = {
        id: crypto.randomBytes(6).toString('hex'),
        fromId: me.id,
        toId: to.id,
        from: profile(fromRow),
        to: profile(to),
        game: game,
        gameName: challengeMatch.GAMES[game].name,
        settings: challengeMatch.GAMES[game].sanitize(settings, [profile(fromRow, false).name, profile(to, false).name]),
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
        status: inv.status,
        matchId: inv.matchId,
        expiresIn: Math.max(0, inv.expiresAt - now())
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
    var incoming = [], outgoing = null;
    Object.keys(_invites).forEach(function (id) {
        var inv = _invites[id];
        if (inv.toId === me.id && inv.status === 'pending') incoming.push(inviteView(inv, me.id, haveAvatars));
        if (inv.fromId === me.id && (!outgoing || inv.createdAt > outgoing._createdAt)) {
            outgoing = inviteView(inv, me.id, haveAvatars);
            outgoing._createdAt = inv.createdAt;
        }
    });
    if (outgoing) delete outgoing._createdAt;
    var m = activeMatchFor(me.id);
    return {
        success: true,
        eligible: isEligible(me),
        incoming: incoming,
        outgoing: outgoing,
        activeMatch: m ? { id: m.id, game: m.game } : null
    };
}

/** قبول/رفض دعوة واردة. */
function respond(me, inviteId, accept) {
    expireInvites();
    var inv = _invites[String(inviteId || '')];
    if (!inv || inv.toId !== me.id) return { success: false, error: 'invite_not_found' };
    if (inv.status !== 'pending') return { success: false, error: 'invite_' + inv.status };
    if (!accept) { inv.status = 'declined'; return { success: true }; }

    if (!isEligible(me)) return { success: false, error: 'not_eligible' };
    var fromRow = loadUser(inv.fromId), toRow = loadUser(inv.toId);
    if (!fromRow || !isEligible(fromRow)) { inv.status = 'cancelled'; return { success: false, error: 'opponent_not_eligible' }; }
    if (activeMatchFor(inv.fromId)) { inv.status = 'cancelled'; return { success: false, error: 'opponent_in_match' }; }
    if (activeMatchFor(inv.toId)) return { success: false, error: 'you_in_match' };

    var m = challengeMatch.createMatch({
        game: inv.game,
        settings: inv.settings,
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

/** إلغاء دعوة صادرة. */
function cancel(me, inviteId) {
    var inv = _invites[String(inviteId || '')];
    if (!inv || inv.fromId !== me.id) return { success: false, error: 'invite_not_found' };
    if (inv.status === 'pending') inv.status = 'cancelled';
    return { success: true };
}

module.exports = {
    isEligible: isEligible,
    search: search,
    createInvite: createInvite,
    inbox: inbox,
    respond: respond,
    cancel: cancel
};
