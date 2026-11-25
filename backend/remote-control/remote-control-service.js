/**
 * «التحكم عن بعد» — صلاحيات المتحكمين لكل ستريمر.
 *
 * الستريمر (من بروفايله) يضيف حتى MAX_CONTROLLERS يوزر تيك توك، ولكل
 * واحد مفتاح تشغيل/إيقاف، وفوقهم مفتاح عام (مفعّل افتراضياً: الستريمر اللي
 * يضيف متحكم يقصد يعطيه الصلاحية، ويقدر يطفيه عن الكل بأي وقت). المتحكم الفعّال هو اللي:
 * المفتاح العام مفعّل + مفتاحه هو مفعّل. صاحب الحساب الموثّق بنفس يوزر
 * تيك توك يطلع له زر «لوحة التحكم» ببروفايله، ويتحكم من جواله
 * (control.html عبر remote-control-server.js)، وأوامره بالشات تنقبل.
 *
 * أي تغيير يُبلَّغ للمستمعين (onChange) عشان خادم WebSocket يقفل الوصول
 * فوراً عن اللي انشالت صلاحيته، ويحدّث قائمة المتحكمين عند الستريمر.
 *
 * الأدمن (role = 'admin'): يتحكم بأي بث بدون ما يضيفه أحد، حتى لو الستريمر
 * طافي المفتاح العام (إشراف ودعم). أوامره بالشات تنقبل من يوزر تيك توك
 * الموثّق بحسابه (adminUsernames)، وكل أمر ينفّذه يتسجّل (logAdmin).
 *
 * الجداول: remote_control_settings + remote_controllers + remote_admin_log (db/database.js).
 */

'use strict';

var MAX_CONTROLLERS = 5;

var _db = null;
function db() { return _db || require('../db/database'); }
var _listeners = [];

function now() { return Date.now(); }

/** يوزر تيك توك بشكل موحّد (بدون @، حروف صغيرة) أو '' لو غير صالح. */
function cleanUsername(u) {
    var s = String(u == null ? '' : u).trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9._]{2,24}$/.test(s)) return '';
    return s;
}

function emit(streamerId) {
    _listeners.forEach(function (fn) { try { fn(streamerId); } catch (e) {} });
}

/** المفتاح العام: مفعّل لين يطفيه الستريمر بنفسه (ما فيه صف = ما لمسه = مفعّل). */
function isMasterOn(streamerId) {
    var row = db().prepare('SELECT enabled FROM remote_control_settings WHERE streamer_id = ?').get(streamerId);
    return !row || !!row.enabled;
}

/**
 * إعدادات الستريمر كاملة (لنافذة الإدارة ببروفايله).
 * @returns {{enabled:boolean, max:number, controllers:Array<{username, enabled, createdAt, account:{name, avatar}|null}>}}
 */
function getConfig(streamerId) {
    var rows = db().prepare('SELECT tiktok_username, enabled, created_at FROM remote_controllers WHERE streamer_id = ? ORDER BY created_at ASC, rowid ASC').all(streamerId);
    var findAcc = db().prepare('SELECT tiktok_display_name, username, tiktok_avatar_url FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE');
    return {
        enabled: isMasterOn(streamerId),
        max: MAX_CONTROLLERS,
        controllers: rows.map(function (r) {
            var a = findAcc.get(r.tiktok_username);
            return {
                username: r.tiktok_username,
                enabled: !!r.enabled,
                createdAt: r.created_at,
                account: a ? { name: a.tiktok_display_name || a.username || r.tiktok_username, avatar: a.tiktok_avatar_url || null } : null
            };
        })
    };
}

/** المفتاح العام. */
function setEnabled(streamerId, on) {
    db().prepare('INSERT INTO remote_control_settings (streamer_id, enabled, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(streamer_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at')
        .run(streamerId, on ? 1 : 0, now());
    emit(streamerId);
    return { success: true };
}

/**
 * @param {{id:number, tiktok_username?:string, tiktok_verified?:boolean}} streamer
 * @returns {{success:boolean, error?:string}} error: invalid | self | exists | limit
 */
function addController(streamer, username) {
    var u = cleanUsername(username);
    if (!u) return { success: false, error: 'invalid' };
    if (streamer.tiktok_verified && cleanUsername(streamer.tiktok_username) === u) return { success: false, error: 'self' };
    var d = db();
    if (d.prepare('SELECT 1 FROM remote_controllers WHERE streamer_id = ? AND tiktok_username = ?').get(streamer.id, u)) return { success: false, error: 'exists' };
    var n = d.prepare('SELECT COUNT(*) AS n FROM remote_controllers WHERE streamer_id = ?').get(streamer.id).n;
    if (n >= MAX_CONTROLLERS) return { success: false, error: 'limit' };
    d.prepare('INSERT INTO remote_controllers (streamer_id, tiktok_username, enabled, created_at) VALUES (?, ?, 1, ?)').run(streamer.id, u, now());
    emit(streamer.id);
    return { success: true };
}

/** تشغيل/إيقاف متحكم واحد (يبقى بالقائمة). */
function setControllerEnabled(streamerId, username, on) {
    var u = cleanUsername(username);
    var r = db().prepare('UPDATE remote_controllers SET enabled = ? WHERE streamer_id = ? AND tiktok_username = ?').run(on ? 1 : 0, streamerId, u);
    if (!r.changes) return { success: false, error: 'not_found' };
    emit(streamerId);
    return { success: true };
}

function removeController(streamerId, username) {
    var u = cleanUsername(username);
    var r = db().prepare('DELETE FROM remote_controllers WHERE streamer_id = ? AND tiktok_username = ?').run(streamerId, u);
    if (!r.changes) return { success: false, error: 'not_found' };
    emit(streamerId);
    return { success: true };
}

/** يوزرات المتحكمين الفعّالين الحين (فاضية لو المفتاح العام مطفي). */
function activeUsernames(streamerId) {
    if (!isMasterOn(streamerId)) return [];
    return db().prepare('SELECT tiktok_username FROM remote_controllers WHERE streamer_id = ? AND enabled = 1').all(streamerId)
        .map(function (r) { return r.tiktok_username; });
}

/** يوزر تيك توك الموثّق لحساب الموقع، أو ''. */
function userTikTok(user) {
    return user && user.tiktok_verified ? cleanUsername(user.tiktok_username) : '';
}

function isAdmin(user) { return !!user && user.role === 'admin'; }

/** يوزرات تيك توك الموثّقة لحسابات الأدمن — أوامرهم بالشات تنقبل بأي بث. */
function adminUsernames() {
    try {
        return db().prepare("SELECT tiktok_username FROM users WHERE role = 'admin' AND tiktok_verified = 1 AND tiktok_username IS NOT NULL").all()
            .map(function (r) { return cleanUsername(r.tiktok_username); }).filter(Boolean);
    } catch (e) { return []; }
}

/** هل حساب الموقع هذا يقدر يتحكم بألعاب هذا الستريمر الحين؟ */
function canControl(user, streamerId) {
    if (isAdmin(user)) return !!streamerId && user.id !== streamerId;
    var u = userTikTok(user);
    if (!u || !streamerId || (user.id === streamerId)) return false;
    if (!isMasterOn(streamerId)) return false;
    return !!db().prepare('SELECT 1 FROM remote_controllers WHERE streamer_id = ? AND tiktok_username = ? AND enabled = 1').get(streamerId, u);
}

/**
 * الستريمرز اللي أعطوا هذا الحساب صلاحية فعّالة (لزر «لوحة التحكم» بالبروفايل).
 * @returns {Array<{id:number, customId:string|null, name:string, avatar:string|null}>}
 */
function accessFor(user) {
    var u = userTikTok(user);
    if (!u) return [];
    return db().prepare(
        'SELECT u.id, u.custom_id, u.username, u.tiktok_display_name, u.tiktok_avatar_url FROM remote_controllers c ' +
        'LEFT JOIN remote_control_settings s ON s.streamer_id = c.streamer_id ' +
        'JOIN users u ON u.id = c.streamer_id ' +
        'WHERE c.tiktok_username = ? AND c.enabled = 1 AND COALESCE(s.enabled, 1) = 1 AND u.id != ? ORDER BY c.created_at ASC, c.rowid ASC'
    ).all(u, user.id).map(function (r) {
        return { id: r.id, customId: r.custom_id || null, name: r.tiktok_display_name || r.username || 'ستريمر', avatar: r.tiktok_avatar_url || null };
    });
}

var LOG_KEEP_MS = 90 * 24 * 3600 * 1000;

/** يسجّل أمر نفّذه الأدمن على بث ستريمر. source: phone | chat، action: cmd | open | join. */
function logAdmin(adminId, streamerId, source, action, arg) {
    try {
        var d = db(), t = now();
        d.prepare('INSERT INTO remote_admin_log (admin_id, streamer_id, source, action, arg, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(adminId, streamerId, String(source || '').slice(0, 10), String(action || '').slice(0, 60), arg == null ? null : String(arg).slice(0, 200), t);
        if (Math.random() < 0.02) d.prepare('DELETE FROM remote_admin_log WHERE created_at < ?').run(t - LOG_KEEP_MS);
    } catch (e) {}
}

/** أمر كتبه الأدمن بشات بث الستريمر (تبلّغ عنه صفحة الستريمر) — يتسجّل لو اليوزر فعلاً أدمن. */
function logAdminChat(streamerId, tiktokUsername, cmd, arg) {
    var u = cleanUsername(tiktokUsername);
    if (!u || !cmd) return;
    try {
        var a = db().prepare("SELECT id FROM users WHERE role = 'admin' AND tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE").get(u);
        if (a) logAdmin(a.id, streamerId, 'chat', cmd, arg);
    } catch (e) {}
}

/** آخر أوامر الأدمن (الأحدث أول). */
function adminLog(limit) {
    var n = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    try {
        return db().prepare(
            'SELECT l.id, l.source, l.action, l.arg, l.created_at, l.streamer_id, COALESCE(s.tiktok_display_name, s.username) AS streamer, COALESCE(a.tiktok_display_name, a.username) AS admin ' +
            'FROM remote_admin_log l LEFT JOIN users s ON s.id = l.streamer_id LEFT JOIN users a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT ?'
        ).all(n).map(function (r) {
            return { id: r.id, at: r.created_at, source: r.source, action: r.action, arg: r.arg, streamerId: r.streamer_id, streamer: r.streamer || 'ستريمر', admin: r.admin || 'الأدمن' };
        });
    } catch (e) { return []; }
}

/** بيانات العرض لستريمر (اسم + صورة) — لشاشة الجوال. */
function streamerInfo(streamerId) {
    var r = db().prepare('SELECT id, username, tiktok_display_name, tiktok_avatar_url FROM users WHERE id = ?').get(streamerId);
    return r ? { id: r.id, name: r.tiktok_display_name || r.username || 'ستريمر', avatar: r.tiktok_avatar_url || null } : null;
}

module.exports = {
    MAX_CONTROLLERS: MAX_CONTROLLERS,
    cleanUsername: cleanUsername,
    getConfig: getConfig,
    setEnabled: setEnabled,
    addController: addController,
    setControllerEnabled: setControllerEnabled,
    removeController: removeController,
    activeUsernames: activeUsernames,
    canControl: canControl,
    isAdmin: isAdmin,
    adminUsernames: adminUsernames,
    logAdmin: logAdmin,
    logAdminChat: logAdminChat,
    adminLog: adminLog,
    accessFor: accessFor,
    streamerInfo: streamerInfo,
    onChange: function (fn) { _listeners.push(fn); },
    _setDb: function (d) { _db = d; }
};
