'use strict';

/**
 * «مجتمعي» — الأصدقاء والرسائل الخاصة.
 *
 * - أي حساب مسجّل يبحث عن أي حساب بالـID أو بيوزر تيك توك موثّق، ويرسل
 *   طلب صداقة. الطرف الثاني يقبل أو يرفض. لو الاثنين أرسلوا لبعض، الطلب
 *   الثاني يقبل الأول على طول.
 * - الرسائل الخاصة بين الأصدقاء بس (1 لـ 1)، والتحديث بالسحب (polling).
 * - الحظر: يشيل الصداقة والطلبات، ويمنع الطلبات والرسائل بالاتجاهين.
 * الجداول friendships وuser_blocks وdirect_messages بـbackend/db/database.js.
 */

var db = require('../db/database');
var logger = require('../utils/logger');
var teamService = require('../teams/team-service');
var utils = require('./message-utils');

var MAX_FRIENDS = 500;
var MAX_PENDING_OUT = 50;
var MAX_RESULTS = 8;
var PAGE = 60;
var COLS = teamService.USER_COLUMNS;

var _now = function () { return Date.now(); };
/** للاختبارات فقط: تثبيت الوقت. */
function _setClock(fn) { _now = fn || function () { return Date.now(); }; }
var allowSend = utils.makeLimiter(function () { return _now(); });

function pair(x, y) { return x < y ? [x, y] : [y, x]; }

function getLink(x, y) {
    var p = pair(x, y);
    return db.prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(p[0], p[1]) || null;
}

function isBlocked(x, y) {
    return Boolean(db.prepare('SELECT 1 FROM user_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').get(x, y, y, x));
}

function areFriends(x, y) {
    var l = getLink(x, y);
    return Boolean(l && l.status === 'accepted');
}

/** علاقتي بالحساب: self | friend | outgoing | incoming | blocked | none. */
function relation(meId, otherId) {
    if (meId === otherId) return 'self';
    if (db.prepare('SELECT 1 FROM user_blocks WHERE user_id = ? AND blocked_id = ?').get(meId, otherId)) return 'blocked';
    var l = getLink(meId, otherId);
    if (!l) return 'none';
    if (l.status === 'accepted') return 'friend';
    return l.requested_by === meId ? 'outgoing' : 'incoming';
}

function target(customId) {
    return teamService.byCustomId(customId);
}

/** بحث بالـID (مطابقة) أو يوزر تيك توك موثّق (بداية الاسم). */
function search(me, rawQuery) {
    var q = String(rawQuery || '').trim().replace(/^@+/, '').replace(/^#/, '');
    if (q.length < 2) return { success: true, results: [] };
    var rows = [];
    if (/^\d+$/.test(q)) rows = db.prepare('SELECT ' + COLS + ' FROM users WHERE custom_id = ?').all(q);
    var like = q.replace(/[%_\\]/g, '\\$&') + '%';
    rows = rows.concat(db.prepare('SELECT ' + COLS + " FROM users WHERE tiktok_verified = 1 AND tiktok_username LIKE ? ESCAPE '\\' ORDER BY LENGTH(tiktok_username) LIMIT 20").all(like));
    var seen = {};
    var results = rows.filter(function (u) {
        if (seen[u.id]) return false;
        seen[u.id] = true;
        // المحظور من الطرف الثاني ما يطلع له
        return !db.prepare('SELECT 1 FROM user_blocks WHERE user_id = ? AND blocked_id = ?').get(u.id, me.id);
    }).slice(0, MAX_RESULTS).map(function (u) {
        var c = teamService.card(u);
        c.relation = relation(me.id, u.id);
        return c;
    });
    return { success: true, results: results };
}

/** طلب صداقة (أو قبول لو هو أرسل لي قبل). */
function request(me, customId) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    if (u.id === me.id) return { success: false, error: 'self' };
    if (isBlocked(me.id, u.id)) return { success: false, error: 'blocked' };
    var l = getLink(me.id, u.id);
    if (l && l.status === 'accepted') return { success: false, error: 'already_friends' };
    if (l && l.requested_by === me.id) return { success: true, status: 'outgoing' };
    if (l) return accept(me, customId);
    var outgoing = db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE requested_by = ? AND status = 'pending'").get(me.id).n;
    if (outgoing >= MAX_PENDING_OUT) return { success: false, error: 'too_many_requests' };
    if (friendCount(me.id) >= MAX_FRIENDS) return { success: false, error: 'friends_full' };
    var p = pair(me.id, u.id);
    db.prepare("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(p[0], p[1], me.id, _now());
    logger.log('Friends: ' + me.id + ' requested ' + u.id);
    return { success: true, status: 'outgoing' };
}

function friendCount(userId) {
    return db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'").get(userId, userId).n;
}

/** قبول طلب وصلني. */
function accept(me, customId) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    var l = getLink(me.id, u.id);
    if (!l || l.status !== 'pending' || l.requested_by === me.id) return { success: false, error: 'no_request' };
    if (friendCount(me.id) >= MAX_FRIENDS || friendCount(u.id) >= MAX_FRIENDS) return { success: false, error: 'friends_full' };
    db.prepare("UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE user_a = ? AND user_b = ?").run(_now(), l.user_a, l.user_b);
    return { success: true, status: 'friend' };
}

/** رفض طلب وصلني، أو إلغاء طلبي، أو حذف صديق — كلها تشيل الرابط. */
function removeLink(me, customId) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    var p = pair(me.id, u.id);
    db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(p[0], p[1]);
    return { success: true, status: 'none' };
}

function block(me, customId) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    if (u.id === me.id) return { success: false, error: 'self' };
    var p = pair(me.id, u.id);
    db.transaction(function () {
        db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(p[0], p[1]);
        db.prepare('INSERT OR IGNORE INTO user_blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)').run(me.id, u.id, _now());
    })();
    logger.log('Friends: ' + me.id + ' blocked ' + u.id);
    return { success: true, status: 'blocked' };
}

function unblock(me, customId) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    db.prepare('DELETE FROM user_blocks WHERE user_id = ? AND blocked_id = ?').run(me.id, u.id);
    return { success: true, status: 'none' };
}

/**
 * قائمتي: الأصدقاء (مع غير المقروء وآخر رسالة)، الطلبات الواردة والمرسلة، والمحظورين.
 */
function list(me) {
    var ucols = 'u.' + COLS.split(', ').join(', u.');
    var rows = db.prepare(
        'SELECT ' + ucols + ', f.status, f.requested_by, f.created_at AS f_created, f.accepted_at FROM friendships f ' +
        'JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END WHERE f.user_a = ? OR f.user_b = ?'
    ).all(me.id, me.id, me.id);
    var friends = [], incoming = [], outgoing = [];
    var unreadStmt = db.prepare('SELECT COUNT(*) AS n FROM direct_messages WHERE from_id = ? AND to_id = ? AND read_at IS NULL');
    var lastStmt = db.prepare('SELECT body, from_id, created_at FROM direct_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 1');
    rows.forEach(function (u) {
        var c = teamService.card(u);
        if (u.status === 'accepted') {
            c.since = u.accepted_at;
            c.unread = unreadStmt.get(u.id, me.id).n;
            var last = lastStmt.get(me.id, u.id, u.id, me.id);
            c.last = last ? { body: last.body.slice(0, 80), mine: last.from_id === me.id, at: last.created_at } : null;
            friends.push(c);
        } else if (u.requested_by === me.id) { c.at = u.f_created; outgoing.push(c); }
        else { c.at = u.f_created; incoming.push(c); }
    });
    friends.sort(function (a, b) { return ((b.last && b.last.at) || b.since || 0) - ((a.last && a.last.at) || a.since || 0); });
    incoming.sort(function (a, b) { return b.at - a.at; });
    outgoing.sort(function (a, b) { return b.at - a.at; });
    var blocked = db.prepare('SELECT ' + ucols + ' FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC').all(me.id)
        .map(function (u) { return teamService.card(u); });
    return { success: true, friends: friends, incoming: incoming, outgoing: outgoing, blocked: blocked };
}

function mapDm(r, meId) {
    return { id: r.id, body: r.body, at: r.created_at, mine: r.from_id === meId, read: Boolean(r.read_at) };
}

/** المحادثة مع صديق. afterId = آخر رسالة عندي (0 = آخر 60). يعلّم الواصل كمقروء. */
function conversation(me, customId, afterId) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    var rel = relation(me.id, u.id);
    if (rel !== 'friend') return { success: false, error: 'not_friends', relation: rel };
    afterId = Math.max(0, Math.floor(Number(afterId) || 0));
    var where = '((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))';
    var rows = afterId
        ? db.prepare('SELECT * FROM direct_messages WHERE ' + where + ' AND id > ? ORDER BY id LIMIT 200').all(me.id, u.id, u.id, me.id, afterId)
        : db.prepare('SELECT * FROM (SELECT * FROM direct_messages WHERE ' + where + ' ORDER BY id DESC LIMIT ?) ORDER BY id').all(me.id, u.id, u.id, me.id, PAGE);
    db.prepare('UPDATE direct_messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(_now(), u.id, me.id);
    // آخر رسالة مني قرأها (لعلامة «شافها»)
    var seen = db.prepare('SELECT MAX(id) AS id FROM direct_messages WHERE from_id = ? AND to_id = ? AND read_at IS NOT NULL').get(me.id, u.id).id || 0;
    return { success: true, friend: teamService.card(u), messages: rows.map(function (r) { return mapDm(r, me.id); }), seenUpTo: seen };
}

function sendMessage(me, customId, rawBody) {
    var u = target(customId);
    if (!u) return { success: false, error: 'user_not_found' };
    if (isBlocked(me.id, u.id)) return { success: false, error: 'blocked' };
    if (!areFriends(me.id, u.id)) return { success: false, error: 'not_friends' };
    var body = utils.cleanBody(rawBody);
    if (!body) return { success: false, error: 'empty' };
    if (!allowSend('dm:' + me.id)) return { success: false, error: 'too_fast' };
    var t = _now();
    var id = Number(db.prepare('INSERT INTO direct_messages (from_id, to_id, body, created_at) VALUES (?, ?, ?, ?)').run(me.id, u.id, body, t).lastInsertRowid);
    return { success: true, message: { id: id, body: body, at: t, mine: true, read: false } };
}

/** للشارة: طلبات واردة + رسائل خاصة غير مقروءة (من أصدقاء بس). */
function counts(me) {
    var incoming = db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'pending' AND requested_by != ?").get(me.id, me.id, me.id).n;
    var unread = db.prepare(
        "SELECT COUNT(*) AS n FROM direct_messages d JOIN friendships f ON f.user_a = MIN(d.from_id, d.to_id) AND f.user_b = MAX(d.from_id, d.to_id) AND f.status = 'accepted' " +
        'WHERE d.to_id = ? AND d.read_at IS NULL'
    ).get(me.id).n;
    return { incoming: incoming, unread: unread };
}

module.exports = {
    search: search,
    request: request,
    accept: accept,
    decline: removeLink,
    cancel: removeLink,
    remove: removeLink,
    block: block,
    unblock: unblock,
    list: list,
    conversation: conversation,
    sendMessage: sendMessage,
    counts: counts,
    relation: relation,
    _setClock: _setClock
};
