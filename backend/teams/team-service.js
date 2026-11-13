'use strict';

/**
 * «فريقك» — لاعبين ينضمون لفريق ستريمر من الموقع.
 *
 * - أي حساب مسجّل يبحث عن ستريمر بالـID أو بيوزر تيك توك وينضم لفريقه
 *   مباشرة (بدون موافقة)، ويقدر يكون بأكثر من فريق.
 * - الستريمر يشوف أعضاء فريقه ويقدر يشيل أي عضو.
 * - أعضاء الفريق هم اللي يقدر الستريمر يمنحهم أكواد جوائز الفوز
 *   (collectibles-service.grantWinCode).
 * الجدول team_members بـbackend/db/database.js.
 */

var db = require('../db/database');
var logger = require('../utils/logger');

var USER_COLUMNS = 'id, username, display_name, role, is_streamer, permissions, tiktok_username, tiktok_verified, custom_id, avatar_image_base64, tiktok_avatar_url';
var MAX_RESULTS = 8;

function now() { return Date.now(); }

function parsePermissions(p) {
    if (p && typeof p === 'object') return p;
    try { return JSON.parse(p || '{}'); } catch (e) { return {}; }
}

/** حساب ستريمر = اختار ستريمر بالتسجيل، أو صلاحية تشغيل الألعاب، أو أدمن. */
function isStreamer(u) {
    if (!u) return false;
    var perms = parsePermissions(u.permissions);
    return u.role === 'admin' || Boolean(u.is_streamer) || Boolean(perms.can_run_games);
}

function card(u) {
    return {
        customId: u.custom_id,
        name: u.display_name || u.username,
        tiktok: u.tiktok_verified && u.tiktok_username ? String(u.tiktok_username).replace(/^@+/, '') : null,
        avatar: u.avatar_image_base64 || u.tiktok_avatar_url || null
    };
}

function byCustomId(customId) {
    customId = String(customId == null ? '' : customId).trim().replace(/^#/, '');
    if (!customId) return null;
    return db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE custom_id = ?').get(customId) || null;
}

function memberCount(streamerId) {
    return db.prepare('SELECT COUNT(*) AS n FROM team_members WHERE streamer_id = ?').get(streamerId).n;
}

function isMember(streamerId, memberId) {
    return Boolean(db.prepare('SELECT 1 FROM team_members WHERE streamer_id = ? AND member_id = ?').get(streamerId, memberId));
}

/**
 * بحث عن ستريمر بالـID (مطابقة) أو بيوزر تيك توك موثّق (مطابقة أو بداية الاسم).
 * @returns {{success: boolean, results: Array}}
 */
function search(me, rawQuery) {
    var q = String(rawQuery || '').trim().replace(/^@+/, '').replace(/^#/, '');
    if (q.length < 2) return { success: true, results: [] };
    var rows = [];
    if (/^\d+$/.test(q)) rows = db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE custom_id = ?').all(q);
    var like = q.replace(/[%_\\]/g, '\\$&') + '%';
    rows = rows.concat(db.prepare(
        'SELECT ' + USER_COLUMNS + " FROM users WHERE tiktok_verified = 1 AND tiktok_username LIKE ? ESCAPE '\\' ORDER BY LENGTH(tiktok_username) LIMIT 20"
    ).all(like));
    var seen = {};
    var results = rows.filter(function (u) {
        if (seen[u.id] || !isStreamer(u)) return false;
        seen[u.id] = true;
        return true;
    }).slice(0, MAX_RESULTS).map(function (u) {
        var c = card(u);
        c.members = memberCount(u.id);
        c.joined = me ? isMember(u.id, me.id) : false;
        c.self = Boolean(me && me.id === u.id);
        return c;
    });
    return { success: true, results: results };
}

/** @returns {{success: boolean, error?: string}} */
function join(me, streamerCustomId) {
    var s = byCustomId(streamerCustomId);
    if (!s || !isStreamer(s)) return { success: false, error: 'streamer_not_found' };
    if (s.id === me.id) return { success: false, error: 'self' };
    db.prepare('INSERT OR IGNORE INTO team_members (streamer_id, member_id, joined_at) VALUES (?, ?, ?)').run(s.id, me.id, now());
    logger.log('Teams: user ' + me.id + ' joined team of ' + s.id);
    return { success: true };
}

/** اللاعب يطلع من فريق. */
function leave(me, streamerCustomId) {
    var s = byCustomId(streamerCustomId);
    if (!s) return { success: false, error: 'streamer_not_found' };
    db.prepare('DELETE FROM team_members WHERE streamer_id = ? AND member_id = ?').run(s.id, me.id);
    return { success: true };
}

/** الستريمر يشيل عضو من فريقه. */
function removeMember(me, memberCustomId) {
    var m = byCustomId(memberCustomId);
    if (!m) return { success: false, error: 'member_not_found' };
    db.prepare('DELETE FROM team_members WHERE streamer_id = ? AND member_id = ?').run(me.id, m.id);
    return { success: true };
}

/**
 * فريقي (لو أنا ستريمر) + الفرق اللي أنا فيها.
 * @returns {{success: boolean, members: Array, teams: Array, isStreamer: boolean}}
 */
function mine(me) {
    var meRow = db.prepare('SELECT ' + USER_COLUMNS + ' FROM users WHERE id = ?').get(me.id);
    var streamer = isStreamer(meRow);
    var members = streamer ? db.prepare(
        'SELECT u.' + USER_COLUMNS.split(', ').join(', u.') + ', t.joined_at FROM team_members t JOIN users u ON u.id = t.member_id ' +
        'WHERE t.streamer_id = ? ORDER BY t.joined_at DESC LIMIT 500'
    ).all(me.id).map(function (u) { var c = card(u); c.joinedAt = u.joined_at; return c; }) : [];
    var teams = db.prepare(
        'SELECT u.' + USER_COLUMNS.split(', ').join(', u.') + ', t.joined_at FROM team_members t JOIN users u ON u.id = t.streamer_id ' +
        'WHERE t.member_id = ? ORDER BY t.joined_at DESC LIMIT 200'
    ).all(me.id).map(function (u) { var c = card(u); c.joinedAt = u.joined_at; c.members = memberCount(u.id); return c; });
    return { success: true, isStreamer: streamer, members: members, teams: teams };
}

module.exports = {
    isStreamer: isStreamer,
    isMember: isMember,
    byCustomId: byCustomId,
    search: search,
    join: join,
    leave: leave,
    removeMember: removeMember,
    mine: mine
};
