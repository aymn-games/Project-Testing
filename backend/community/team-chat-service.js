'use strict';

/**
 * «مجتمعي» — شات الفريق.
 *
 * - كل ستريمر له شات واحد لفريقه: يكتب فيه صاحب الفريق وأعضاؤه
 *   (team_members). اللاعب اللي بأكثر من فريق يختار الشات.
 * - الإشراف: صاحب الفريق يضيف/يشيل مشرفين من أعضاء فريقه. صاحب الفريق
 *   والمشرفين يحذفون الرسائل، يكتمون عضو (10 دقايق، ساعة، يوم، أو دائم)
 *   ويفكون الكتم، ويطلّعون عضو من الفريق. المشرف ما يقدر على صاحب الفريق
 *   ولا على مشرف ثاني.
 * - التحديث بالسحب (polling): الواجهة تطلب الجديد بعد آخر رقم رسالة كل
 *   بضع ثواني، ومعه أرقام الرسائل اللي انحذفت من آخر طلب.
 * الجداول team_chat_* بـbackend/db/database.js.
 */

var db = require('../db/database');
var logger = require('../utils/logger');
var teamService = require('../teams/team-service');
var utils = require('./message-utils');

var PAGE = 60;
var MUTE_OPTIONS = [10, 60, 1440, 0]; // بالدقايق، 0 = دائم
var MAX_MODERATORS = 20;

var _now = function () { return Date.now(); };
/** للاختبارات فقط: تثبيت الوقت. */
function _setClock(fn) { _now = fn || function () { return Date.now(); }; }
var allowSend = utils.makeLimiter(function () { return _now(); });

function userRow(id) {
    return db.prepare('SELECT ' + teamService.USER_COLUMNS + ' FROM users WHERE id = ?').get(id) || null;
}

/** صاحب الفريق من الـID، أو null لو مو ستريمر. */
function teamOwner(customId) {
    var s = teamService.byCustomId(customId);
    return s && teamService.isStreamer(s) ? s : null;
}

function isModerator(streamerId, userId) {
    return Boolean(db.prepare('SELECT 1 FROM team_chat_moderators WHERE streamer_id = ? AND user_id = ?').get(streamerId, userId));
}

/** دور المستخدم بالفريق: 'owner' | 'mod' | 'member' | null. */
function roleOf(streamerId, userId) {
    if (streamerId === userId) return 'owner';
    if (!teamService.isMember(streamerId, userId)) return null;
    return isModerator(streamerId, userId) ? 'mod' : 'member';
}

/** يقدر actor يشرف على target؟ صاحب الفريق على الكل، والمشرف على الأعضاء بس. */
function canModerate(actorRole, targetRole) {
    if (actorRole === 'owner') return targetRole === 'mod' || targetRole === 'member';
    if (actorRole === 'mod') return targetRole === 'member';
    return false;
}

/** الكتم الفعّال: {until} (0 = دائم) أو null. الكتم المنتهي ينشال. */
function activeMute(streamerId, userId) {
    var m = db.prepare('SELECT until FROM team_chat_mutes WHERE streamer_id = ? AND user_id = ?').get(streamerId, userId);
    if (!m) return null;
    if (m.until && m.until <= _now()) {
        db.prepare('DELETE FROM team_chat_mutes WHERE streamer_id = ? AND user_id = ?').run(streamerId, userId);
        return null;
    }
    return { until: m.until || 0 };
}

function unreadFor(streamerId, userId) {
    var r = db.prepare('SELECT last_id FROM team_chat_reads WHERE streamer_id = ? AND user_id = ?').get(streamerId, userId);
    return db.prepare('SELECT COUNT(*) AS n FROM team_chat_messages WHERE streamer_id = ? AND id > ? AND user_id != ? AND deleted_at IS NULL')
        .get(streamerId, r ? r.last_id : 0, userId).n;
}

function markRead(streamerId, userId, lastId) {
    if (!lastId) return;
    db.prepare('INSERT INTO team_chat_reads (streamer_id, user_id, last_id) VALUES (?, ?, ?) ' +
        'ON CONFLICT(streamer_id, user_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)').run(streamerId, userId, lastId);
}

/**
 * الشاتات المتاحة لي: فريقي (لو ستريمر) + الفرق اللي أنا فيها، مع غير المقروء.
 * @returns {{success: boolean, teams: Array}}
 */
function listTeams(me) {
    var meRow = userRow(me.id);
    var rows = [];
    if (teamService.isStreamer(meRow)) rows.push(meRow);
    rows = rows.concat(db.prepare(
        'SELECT u.' + teamService.USER_COLUMNS.split(', ').join(', u.') + ' FROM team_members t JOIN users u ON u.id = t.streamer_id ' +
        'WHERE t.member_id = ? ORDER BY t.joined_at DESC LIMIT 200'
    ).all(me.id));
    return {
        success: true,
        teams: rows.map(function (u) {
            var c = teamService.card(u);
            c.role = roleOf(u.id, me.id);
            c.unread = unreadFor(u.id, me.id);
            return c;
        })
    };
}

function mapMessage(r, streamerId, mods, meId) {
    var c = teamService.card(r);
    c.role = r.user_id === streamerId ? 'owner' : mods[r.user_id] ? 'mod' : 'member';
    return { id: r.mid, author: c, body: r.body, at: r.created_at, mine: r.user_id === meId };
}

/**
 * رسائل الشات. afterId = آخر رسالة عندي (0 = آخر 60)، since = وقت آخر طلب
 * (يرجع أرقام الرسائل اللي انحذفت بعده عشان تختفي عندي).
 */
function messages(me, teamCustomId, afterId, since) {
    var owner = teamOwner(teamCustomId);
    if (!owner) return { success: false, error: 'team_not_found' };
    var role = roleOf(owner.id, me.id);
    if (!role) return { success: false, error: 'not_member' };
    afterId = Math.max(0, Math.floor(Number(afterId) || 0));
    since = Math.max(0, Math.floor(Number(since) || 0));
    var cols = 'm.id AS mid, m.user_id, m.body, m.created_at, u.' + teamService.USER_COLUMNS.split(', ').join(', u.');
    var rows = afterId
        ? db.prepare('SELECT ' + cols + ' FROM team_chat_messages m JOIN users u ON u.id = m.user_id WHERE m.streamer_id = ? AND m.id > ? AND m.deleted_at IS NULL ORDER BY m.id LIMIT 200').all(owner.id, afterId)
        : db.prepare('SELECT * FROM (SELECT ' + cols + ' FROM team_chat_messages m JOIN users u ON u.id = m.user_id WHERE m.streamer_id = ? AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT ?) ORDER BY mid').all(owner.id, PAGE);
    var mods = {};
    db.prepare('SELECT user_id FROM team_chat_moderators WHERE streamer_id = ?').all(owner.id).forEach(function (r) { mods[r.user_id] = true; });
    var removed = since
        ? db.prepare('SELECT id FROM team_chat_messages WHERE streamer_id = ? AND deleted_at >= ?').all(owner.id, since).map(function (r) { return r.id; })
        : [];
    var list = rows.map(function (r) { return mapMessage(r, owner.id, mods, me.id); });
    if (list.length) markRead(owner.id, me.id, list[list.length - 1].id);
    return {
        success: true,
        team: teamService.card(owner),
        myRole: role,
        muted: activeMute(owner.id, me.id),
        messages: list,
        removed: removed,
        now: _now()
    };
}

/** @returns {{success: boolean, message?: Object, error?: string}} */
function send(me, teamCustomId, rawBody) {
    var owner = teamOwner(teamCustomId);
    if (!owner) return { success: false, error: 'team_not_found' };
    var role = roleOf(owner.id, me.id);
    if (!role) return { success: false, error: 'not_member' };
    var mute = activeMute(owner.id, me.id);
    if (mute) return { success: false, error: 'muted', until: mute.until };
    var body = utils.cleanBody(rawBody);
    if (!body) return { success: false, error: 'empty' };
    if (!allowSend('team:' + me.id)) return { success: false, error: 'too_fast' };
    var t = _now();
    var id = Number(db.prepare('INSERT INTO team_chat_messages (streamer_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').run(owner.id, me.id, body, t).lastInsertRowid);
    markRead(owner.id, me.id, id);
    var mods = {}; if (role === 'mod') mods[me.id] = true;
    var r = userRow(me.id);
    r.mid = id; r.user_id = me.id; r.body = body; r.created_at = t;
    return { success: true, message: mapMessage(r, owner.id, mods, me.id) };
}

/** حذف رسالة: صاحبها، أو صاحب الفريق/مشرف (حسب canModerate). */
function deleteMessage(me, teamCustomId, messageId) {
    var owner = teamOwner(teamCustomId);
    if (!owner) return { success: false, error: 'team_not_found' };
    var m = db.prepare('SELECT id, user_id FROM team_chat_messages WHERE id = ? AND streamer_id = ? AND deleted_at IS NULL').get(Math.floor(Number(messageId)) || 0, owner.id);
    if (!m) return { success: false, error: 'message_not_found' };
    var role = roleOf(owner.id, me.id);
    if (!role) return { success: false, error: 'not_member' };
    if (m.user_id !== me.id) {
        var authorRole = m.user_id === owner.id ? 'owner' : isModerator(owner.id, m.user_id) ? 'mod' : 'member';
        if (!canModerate(role, authorRole)) return { success: false, error: 'forbidden' };
    }
    db.prepare('UPDATE team_chat_messages SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(_now(), me.id, m.id);
    return { success: true };
}

/** يجهّز عملية إشراف على عضو: الفريق، دوري، العضو ودوره. */
function moderationTarget(me, teamCustomId, targetCustomId) {
    var owner = teamOwner(teamCustomId);
    if (!owner) return { error: 'team_not_found' };
    var role = roleOf(owner.id, me.id);
    if (role !== 'owner' && role !== 'mod') return { error: 'forbidden' };
    var target = teamService.byCustomId(targetCustomId);
    var targetRole = target ? roleOf(owner.id, target.id) : null;
    if (!targetRole) return { error: 'member_not_found' };
    if (!canModerate(role, targetRole)) return { error: 'forbidden' };
    return { owner: owner, role: role, target: target, targetRole: targetRole };
}

/** كتم عضو. minutes: 10 | 60 | 1440 | 0 (دائم). */
function mute(me, teamCustomId, targetCustomId, minutes) {
    minutes = Math.floor(Number(minutes));
    if (MUTE_OPTIONS.indexOf(minutes) < 0) return { success: false, error: 'invalid_duration' };
    var x = moderationTarget(me, teamCustomId, targetCustomId);
    if (x.error) return { success: false, error: x.error };
    var t = _now();
    db.prepare('INSERT INTO team_chat_mutes (streamer_id, user_id, until, by_user_id, created_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(streamer_id, user_id) DO UPDATE SET until = excluded.until, by_user_id = excluded.by_user_id, created_at = excluded.created_at')
        .run(x.owner.id, x.target.id, minutes ? t + minutes * 60000 : 0, me.id, t);
    logger.log('TeamChat: user ' + me.id + ' muted ' + x.target.id + ' in team ' + x.owner.id + ' (' + (minutes || 'permanent') + ')');
    return { success: true };
}

function unmute(me, teamCustomId, targetCustomId) {
    var x = moderationTarget(me, teamCustomId, targetCustomId);
    if (x.error) return { success: false, error: x.error };
    db.prepare('DELETE FROM team_chat_mutes WHERE streamer_id = ? AND user_id = ?').run(x.owner.id, x.target.id);
    return { success: true };
}

/** طرد عضو من الفريق (يطلع من الشات والفريق، ويقدر يرجع ينضم). */
function kick(me, teamCustomId, targetCustomId) {
    var x = moderationTarget(me, teamCustomId, targetCustomId);
    if (x.error) return { success: false, error: x.error };
    db.transaction(function () {
        db.prepare('DELETE FROM team_members WHERE streamer_id = ? AND member_id = ?').run(x.owner.id, x.target.id);
        db.prepare('DELETE FROM team_chat_moderators WHERE streamer_id = ? AND user_id = ?').run(x.owner.id, x.target.id);
        db.prepare('DELETE FROM team_chat_reads WHERE streamer_id = ? AND user_id = ?').run(x.owner.id, x.target.id);
    })();
    logger.log('TeamChat: user ' + me.id + ' kicked ' + x.target.id + ' from team ' + x.owner.id);
    return { success: true };
}

/** صاحب الفريق بس: يضيف (on=true) أو يشيل مشرف من أعضاء فريقه. */
function setModerator(me, targetCustomId, on) {
    var meRow = userRow(me.id);
    if (!teamService.isStreamer(meRow)) return { success: false, error: 'forbidden' };
    var target = teamService.byCustomId(targetCustomId);
    if (!target || !teamService.isMember(me.id, target.id)) return { success: false, error: 'member_not_found' };
    if (on) {
        var n = db.prepare('SELECT COUNT(*) AS n FROM team_chat_moderators WHERE streamer_id = ?').get(me.id).n;
        if (n >= MAX_MODERATORS && !isModerator(me.id, target.id)) return { success: false, error: 'too_many_moderators' };
        db.prepare('INSERT OR IGNORE INTO team_chat_moderators (streamer_id, user_id, added_at) VALUES (?, ?, ?)').run(me.id, target.id, _now());
        db.prepare('DELETE FROM team_chat_mutes WHERE streamer_id = ? AND user_id = ?').run(me.id, target.id);
    } else {
        db.prepare('DELETE FROM team_chat_moderators WHERE streamer_id = ? AND user_id = ?').run(me.id, target.id);
    }
    return { success: true };
}

/** أعضاء الفريق مع أدوارهم وكتمهم — لصاحب الفريق والمشرفين. */
function members(me, teamCustomId) {
    var owner = teamOwner(teamCustomId);
    if (!owner) return { success: false, error: 'team_not_found' };
    var role = roleOf(owner.id, me.id);
    if (role !== 'owner' && role !== 'mod') return { success: false, error: 'forbidden' };
    var rows = db.prepare(
        'SELECT u.' + teamService.USER_COLUMNS.split(', ').join(', u.') + ' FROM team_members t JOIN users u ON u.id = t.member_id ' +
        'WHERE t.streamer_id = ? ORDER BY t.joined_at DESC LIMIT 500'
    ).all(owner.id);
    var list = rows.map(function (u) {
        var c = teamService.card(u);
        c.role = isModerator(owner.id, u.id) ? 'mod' : 'member';
        c.muted = activeMute(owner.id, u.id);
        return c;
    }).sort(function (a, b) { return (a.role === 'mod' ? 0 : 1) - (b.role === 'mod' ? 0 : 1); });
    return { success: true, myRole: role, members: list };
}

/** عدد الرسائل غير المقروءة بكل شاتاتي (لشارة «مجتمعي»). */
function unreadTotal(me) {
    return listTeams(me).teams.reduce(function (a, t) { return a + t.unread; }, 0);
}

module.exports = {
    listTeams: listTeams,
    messages: messages,
    send: send,
    deleteMessage: deleteMessage,
    mute: mute,
    unmute: unmute,
    kick: kick,
    setModerator: setModerator,
    members: members,
    unreadTotal: unreadTotal,
    MUTE_OPTIONS: MUTE_OPTIONS,
    _setClock: _setClock
};
