/**
 * AGP SUPPORT SERVICE — نظام "الدعم والاقتراحات": تذاكر المستخدمين
 * ورسائلها، توقيع رفع المرفقات المباشر لـCloudinary، وإشعارات الإيميل.
 *
 * ⚠️ الملفات نفسها لا تمر بهذا السيرفر إطلاقاً: المتصفح يطلب توقيعاً
 *   (getUploadSignature) ثم يرفع مباشرة لـCloudinary، ويرسل لنا فقط رابط
 *   النتيجة. validateAttachments يتحقق أن كل رابط تابع لنفس الحساب
 *   (cloud) ومجلد نفس المستخدم (agp-support/u<userId>/) وبصيغة مسموحة.
 *
 * ⚠️ النصوص تُخزَّن كنص خام (بعد إزالة محارف التحكم وقصّ الطول) ولا
 *   تُعرَض أبداً كـHTML: الواجهات تستخدم textContent، والإيميلات تهرّبها
 *   (escapeHtml بـemail-service.js). هذا هو خط الدفاع ضد XSS.
 *
 * ⚠️ PRAGMA foreign_keys غير مفعّل بالمشروع، فحذف حساب مستخدم لا يحذف
 *   تذاكره تلقائياً — قراءات الأدمن تستخدم LEFT JOIN وتتعامل مع ذلك.
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var config = require('../config');
var logger = require('../utils/logger');
var emailService = require('../email/email-service');

var TICKET_TYPES = ['suggestion', 'question', 'bug'];
var TICKET_STATUSES = ['new', 'in_progress', 'closed'];

var MAX_TITLE_LENGTH = 120;
var MAX_BODY_LENGTH = 5000;
var MAX_ATTACHMENTS_PER_MESSAGE = 5;
var MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
var MAX_FILE_NAME_LENGTH = 120;

var RATE_WINDOW_MS = 60 * 60 * 1000; // ساعة
var MAX_TICKETS_PER_HOUR = 5;
var MAX_MESSAGES_PER_HOUR = 30; // يشمل أول رسالة بكل تذكرة
var MAX_SIGNATURES_PER_HOUR = 60;

var CLOUDINARY_ROOT_FOLDER = 'agp-support';

/**
 * الصيغ المسموحة وأين تُرفع بـCloudinary: الصور وPDF كـimage
 * (/image/upload)، وtxt/zip كـraw (/raw/upload).
 */
var EXTENSION_RESOURCE_TYPE = {
    jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', pdf: 'image',
    txt: 'raw', zip: 'raw'
};
var IMAGE_ALLOWED_FORMATS = 'jpg,jpeg,png,webp,gif,pdf';

function now() { return Date.now(); }

/* -----------------------------------------------------------------------
 * تنظيف النصوص
 * ----------------------------------------------------------------------- */

/**
 * يزيل محارف التحكم (عدا سطر جديد/تاب) ومحارف الاتجاه الخفية الخطرة،
 * يوحّد نهايات الأسطر، ويقصّ المسافات الطرفية.
 */
function cleanText(value, allowNewlines) {
    var s = String(value == null ? '' : value);
    s = s.replace(/\r\n?/g, '\n');
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    s = s.replace(/[‪-‮⁦-⁩]/g, ''); // bidi overrides
    if (!allowNewlines) s = s.replace(/[\n\t]+/g, ' ');
    else s = s.replace(/\n{4,}/g, '\n\n\n');
    return s.trim();
}

function validateTitle(title) {
    var t = cleanText(title, false);
    if (!t) return { error: 'empty_title' };
    if (t.length > MAX_TITLE_LENGTH) return { error: 'title_too_long' };
    return { value: t };
}

function validateBody(body) {
    var b = cleanText(body, true);
    if (!b) return { error: 'empty_body' };
    if (b.length > MAX_BODY_LENGTH) return { error: 'body_too_long' };
    return { value: b };
}

function cleanFileName(name) {
    var n = cleanText(name, false).replace(/[\\/<>:"|?*]/g, '_');
    if (n.length > MAX_FILE_NAME_LENGTH) n = n.slice(0, MAX_FILE_NAME_LENGTH);
    return n || 'file';
}

function getExtension(fileName) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(fileName || ''));
    return m ? m[1].toLowerCase() : '';
}

/* -----------------------------------------------------------------------
 * Cloudinary — توقيع الرفع + التحقق من الروابط
 * ----------------------------------------------------------------------- */

function isCloudinaryConfigured() {
    return Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret);
}

/**
 * توقيع Cloudinary القياسي: SHA-1 لكل البارامترات الموقَّعة مرتّبة
 * أبجدياً بصيغة key=value مفصولة بـ&، ثم API Secret ملصوق بالنهاية.
 * (file/cloud_name/resource_type/api_key لا تدخل التوقيع).
 */
function signCloudinaryParams(params) {
    var toSign = Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('&');
    return crypto.createHash('sha1').update(toSign + config.cloudinaryApiSecret).digest('hex');
}

// عدّاد بسيط بالذاكرة لطلبات التوقيع (لا يستحق جدولاً — يُصفَّر مع إعادة التشغيل).
var signatureHits = new Map();
function allowSignature(userId) {
    var t = now();
    var list = (signatureHits.get(userId) || []).filter(function (ts) { return t - ts < RATE_WINDOW_MS; });
    if (list.length >= MAX_SIGNATURES_PER_HOUR) { signatureHits.set(userId, list); return false; }
    list.push(t);
    signatureHits.set(userId, list);
    return true;
}

/**
 * يولّد توقيعاً لرفع ملف واحد. public_id يُحدَّد هنا (عشوائي تحت مجلد
 * المستخدم) ويدخل التوقيع، فلا يقدر المتصفح يرفع لمسار آخر بنفس التوقيع.
 * صيغ الصور مقيّدة أيضاً بـallowed_formats الموقَّع؛ ملفات raw تُقيَّد
 * بامتداد public_id نفسه (Cloudinary لا يحلّل صيغة ملفات raw).
 * @param {number} userId
 * @param {{fileName: string, fileSize: number}} input
 */
function getUploadSignature(userId, input) {
    if (!isCloudinaryConfigured()) return { success: false, error: 'uploads_not_configured' };
    input = input || {};
    var ext = getExtension(input.fileName);
    var resourceType = EXTENSION_RESOURCE_TYPE[ext];
    if (!resourceType) return { success: false, error: 'file_type_not_allowed' };
    var size = Number(input.fileSize);
    if (!isFinite(size) || size <= 0) return { success: false, error: 'invalid_file_size' };
    if (size > MAX_FILE_BYTES) return { success: false, error: 'file_too_large' };
    if (!allowSignature(userId)) return { success: false, error: 'rate_limited' };

    var randomPart = crypto.randomBytes(12).toString('hex');
    var publicId = CLOUDINARY_ROOT_FOLDER + '/u' + userId + '/' + randomPart + (resourceType === 'raw' ? '.' + ext : '');
    var params = { public_id: publicId, timestamp: Math.floor(now() / 1000) };
    if (resourceType === 'image') params.allowed_formats = IMAGE_ALLOWED_FORMATS;

    return {
        success: true,
        cloudName: config.cloudinaryCloudName,
        apiKey: config.cloudinaryApiKey,
        resourceType: resourceType,
        uploadUrl: 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(config.cloudinaryCloudName) + '/' + resourceType + '/upload',
        params: params,
        signature: signCloudinaryParams(params)
    };
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * يتحقق من قائمة المرفقات القادمة من المتصفح بعد رفعها لـCloudinary.
 * الرابط لازم يطابق حرفياً: https://res.cloudinary.com/<cloud>/<image|raw>/upload/v<رقم>/agp-support/u<userId>/<id>.<ext>
 * مع صيغة تناسب نوع المورد. الرابط المخزَّن هو الذي تحقّقنا منه فقط.
 * @returns {{value?: Array, error?: string}}
 */
function validateAttachments(userId, attachments) {
    if (attachments == null) return { value: [] };
    if (!Array.isArray(attachments)) return { error: 'invalid_attachments' };
    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) return { error: 'too_many_attachments' };
    if (attachments.length && !isCloudinaryConfigured()) return { error: 'uploads_not_configured' };

    var pattern = new RegExp(
        '^https://res\\.cloudinary\\.com/' + escapeRegExp(config.cloudinaryCloudName) +
        '/(image|raw)/upload/v(\\d{1,12})/(' + escapeRegExp(CLOUDINARY_ROOT_FOLDER) + '/u' + Number(userId) +
        '/[a-f0-9]{24})\\.([a-z0-9]{2,5})$'
    );

    var out = [];
    for (var i = 0; i < attachments.length; i++) {
        var a = attachments[i] || {};
        var m = pattern.exec(String(a.url || ''));
        if (!m) return { error: 'invalid_attachment_url' };
        var resourceType = m[1];
        var ext = m[4];
        if (EXTENSION_RESOURCE_TYPE[ext] !== resourceType) return { error: 'file_type_not_allowed' };
        var bytes = Number(a.bytes);
        if (!isFinite(bytes) || bytes <= 0) return { error: 'invalid_file_size' };
        if (bytes > MAX_FILE_BYTES) return { error: 'file_too_large' };
        out.push({
            url: m[0],
            public_id: resourceType === 'raw' ? m[3] + '.' + ext : m[3],
            resource_type: resourceType,
            format: ext,
            name: cleanFileName(a.name),
            bytes: Math.round(bytes)
        });
    }
    return { value: out };
}

/* -----------------------------------------------------------------------
 * Rate limit (من قاعدة البيانات — لا يُصفَّر مع إعادة تشغيل السيرفر)
 * ----------------------------------------------------------------------- */

function countRecentTickets(userId) {
    return db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND created_at > ?')
        .get(userId, now() - RATE_WINDOW_MS).n;
}

function countRecentUserMessages(userId) {
    return db.prepare(
        "SELECT COUNT(*) AS n FROM ticket_messages m JOIN tickets t ON t.id = m.ticket_id " +
        "WHERE t.user_id = ? AND m.sender = 'user' AND m.created_at > ?"
    ).get(userId, now() - RATE_WINDOW_MS).n;
}

/* -----------------------------------------------------------------------
 * أدوات قراءة
 * ----------------------------------------------------------------------- */

function parseAttachments(raw) {
    try {
        var list = JSON.parse(raw || '[]');
        return Array.isArray(list) ? list : [];
    } catch (err) { return []; }
}

function mapMessage(row) {
    return {
        id: row.id,
        sender: row.sender,
        body: row.body,
        attachments: parseAttachments(row.attachments),
        created_at: row.created_at
    };
}

function getMessages(ticketId) {
    return db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC')
        .all(ticketId).map(mapMessage);
}

function toPositiveInt(value) {
    var n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function userDisplayName(u) {
    if (!u) return 'حساب محذوف';
    return u.display_name || u.username || ('#' + u.id);
}

/* -----------------------------------------------------------------------
 * إشعارات الإيميل — لا تُنتظَر ولا تُفشل الطلب أبداً
 * ----------------------------------------------------------------------- */

function fireAndForget(promise, what) {
    Promise.resolve(promise).then(function (result) {
        if (result && !result.success && result.error !== 'no_recipient') {
            logger.error('Support: تعذّر إرسال ' + what + ' — ' + result.error);
        }
    }).catch(function (err) {
        logger.error('Support: خطأ أثناء إرسال ' + what + ':', err && err.message);
    });
}

function notifyAdmin(kind, ticket, userId, body) {
    if (!config.supportAdminEmail) {
        logger.error('Support: SUPPORT_ADMIN_EMAIL غير مضبوط — لا إشعار للأدمن بالتذكرة #' + ticket.id);
        return;
    }
    var u = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(userId);
    fireAndForget(emailService.sendSupportAdminNotification({
        kind: kind,
        toEmail: config.supportAdminEmail,
        ticketId: ticket.id,
        type: ticket.type,
        title: ticket.title,
        userName: userDisplayName(u) + (u && u.username && u.display_name ? ' (@' + u.username + ')' : ''),
        body: body,
        link: config.frontendBaseUrl + '/admin-support.html?id=' + ticket.id
    }), 'إشعار الأدمن (' + kind + ')');
}

function notifyUser(ticket, body) {
    var u = db.prepare('SELECT email FROM users WHERE id = ?').get(ticket.user_id);
    if (!u || !u.email) return;
    fireAndForget(emailService.sendSupportUserNotification({
        toEmail: u.email,
        ticketId: ticket.id,
        title: ticket.title,
        body: body,
        link: config.frontendBaseUrl + '/support-tickets.html?id=' + ticket.id
    }), 'إشعار المستخدم');
}

/* -----------------------------------------------------------------------
 * API المستخدم
 * ----------------------------------------------------------------------- */

/**
 * @param {number} userId
 * @param {{type, title, body, attachments}} input
 */
function createTicket(userId, input) {
    input = input || {};
    if (TICKET_TYPES.indexOf(input.type) === -1) return { success: false, error: 'invalid_type' };
    var title = validateTitle(input.title);
    if (title.error) return { success: false, error: title.error };
    var body = validateBody(input.body);
    if (body.error) return { success: false, error: body.error };
    var attachments = validateAttachments(userId, input.attachments);
    if (attachments.error) return { success: false, error: attachments.error };

    if (countRecentTickets(userId) >= MAX_TICKETS_PER_HOUR) return { success: false, error: 'rate_limited' };
    if (countRecentUserMessages(userId) >= MAX_MESSAGES_PER_HOUR) return { success: false, error: 'rate_limited' };

    var t = now();
    var ticketId = db.transaction(function () {
        var info = db.prepare(
            "INSERT INTO tickets (user_id, type, title, status, created_at, updated_at, last_reply_by) VALUES (?, ?, ?, 'new', ?, ?, 'user')"
        ).run(userId, input.type, title.value, t, t);
        db.prepare("INSERT INTO ticket_messages (ticket_id, sender, body, attachments, created_at) VALUES (?, 'user', ?, ?, ?)")
            .run(info.lastInsertRowid, body.value, JSON.stringify(attachments.value), t);
        return Number(info.lastInsertRowid);
    })();

    var ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    logger.log('Support: ticket #' + ticketId + ' created by user ' + userId);
    notifyAdmin('new_ticket', ticket, userId, body.value);
    return { success: true, ticket: ticket };
}

/** تذكرة فيها رد أدمن أحدث من آخر فتح لصاحبها (user_seen_at). */
var UNREAD_SQL = "EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = t.id AND m.sender = 'admin' AND m.created_at > t.user_seen_at)";

function listMyTickets(userId) {
    var tickets = db.prepare(
        'SELECT t.id, t.type, t.title, t.status, t.created_at, t.updated_at, t.last_reply_by, ' + UNREAD_SQL + ' AS unread ' +
        'FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC, t.id DESC'
    ).all(userId);
    tickets.forEach(function (t) { t.unread = Boolean(t.unread); });
    return { success: true, tickets: tickets };
}

/** عدد تذاكر المستخدم اللي فيها رد أدمن ما قرأه — لشارة زر "تذاكري". */
function countMyUnread(userId) {
    var n = db.prepare('SELECT COUNT(*) AS n FROM tickets t WHERE t.user_id = ? AND ' + UNREAD_SQL).get(userId).n;
    return { success: true, unread: n };
}

/** المستخدم يرى تذكرته فقط — تذكرة غيره تُعامَل كغير موجودة (404). */
function getMyTicket(userId, ticketId) {
    var id = toPositiveInt(ticketId);
    if (!id) return { success: false, error: 'not_found' };
    var ticket = db.prepare(
        'SELECT id, user_id, type, title, status, created_at, updated_at, last_reply_by FROM tickets WHERE id = ? AND user_id = ?'
    ).get(id, userId);
    if (!ticket) return { success: false, error: 'not_found' };
    delete ticket.user_id;
    // فتح صاحب التذكرة لمحادثتها = قراءة كل ردود الأدمن الحالية.
    db.prepare('UPDATE tickets SET user_seen_at = ? WHERE id = ?').run(now(), id);
    return { success: true, ticket: ticket, messages: getMessages(id) };
}

function replyAsUser(userId, input) {
    input = input || {};
    var id = toPositiveInt(input.ticketId);
    if (!id) return { success: false, error: 'not_found' };
    var ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(id, userId);
    if (!ticket) return { success: false, error: 'not_found' };
    if (ticket.status === 'closed') return { success: false, error: 'ticket_closed' };

    var body = validateBody(input.body);
    if (body.error) return { success: false, error: body.error };
    var attachments = validateAttachments(userId, input.attachments);
    if (attachments.error) return { success: false, error: attachments.error };
    if (countRecentUserMessages(userId) >= MAX_MESSAGES_PER_HOUR) return { success: false, error: 'rate_limited' };

    var t = now();
    var info;
    db.transaction(function () {
        info = db.prepare("INSERT INTO ticket_messages (ticket_id, sender, body, attachments, created_at) VALUES (?, 'user', ?, ?, ?)")
            .run(id, body.value, JSON.stringify(attachments.value), t);
        db.prepare("UPDATE tickets SET updated_at = ?, last_reply_by = 'user' WHERE id = ?").run(t, id);
    })();

    notifyAdmin('user_reply', ticket, userId, body.value);
    var message = mapMessage(db.prepare('SELECT * FROM ticket_messages WHERE id = ?').get(info.lastInsertRowid));
    return { success: true, message: message };
}

/* -----------------------------------------------------------------------
 * API الإدارة
 * ----------------------------------------------------------------------- */

/**
 * @param {{type?, status?, q?, limit?, offset?}} filters
 */
function adminListTickets(filters) {
    filters = filters || {};
    var where = [];
    var args = [];
    if (TICKET_TYPES.indexOf(filters.type) !== -1) { where.push('t.type = ?'); args.push(filters.type); }
    if (TICKET_STATUSES.indexOf(filters.status) !== -1) { where.push('t.status = ?'); args.push(filters.status); }
    var q = cleanText(filters.q, false).slice(0, 100);
    if (q) {
        var like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
        var idMatch = /^#?(\d+)$/.exec(q);
        where.push(
            "(t.title LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' " +
            "OR u.email LIKE ? ESCAPE '\\' OR u.tiktok_username LIKE ? ESCAPE '\\' " +
            "OR EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = t.id AND m.body LIKE ? ESCAPE '\\')" +
            (idMatch ? ' OR t.id = ?' : '') + ')'
        );
        args.push(like, like, like, like, like, like);
        if (idMatch) args.push(Number(idMatch[1]));
    }
    var limit = Math.min(toPositiveInt(filters.limit) || 50, 200);
    var offset = Math.max(Number(filters.offset) || 0, 0);
    var whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

    var total = db.prepare('SELECT COUNT(*) AS n FROM tickets t LEFT JOIN users u ON u.id = t.user_id' + whereSql).get(args).n;
    var rows = db.prepare(
        'SELECT t.id, t.user_id, t.type, t.title, t.status, t.created_at, t.updated_at, t.last_reply_by, ' +
        'u.username, u.display_name, u.tiktok_username, u.tiktok_verified ' +
        'FROM tickets t LEFT JOIN users u ON u.id = t.user_id' + whereSql +
        ' ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?'
    ).all(args.concat([limit, offset]));

    var tickets = rows.map(function (r) {
        return {
            id: r.id, type: r.type, title: r.title, status: r.status,
            created_at: r.created_at, updated_at: r.updated_at, last_reply_by: r.last_reply_by,
            user: {
                id: r.user_id,
                name: r.username ? (r.display_name || r.username) : 'حساب محذوف',
                username: r.username || null,
                tiktok_username: r.tiktok_verified ? (r.tiktok_username || null) : null
            }
        };
    });
    var newCount = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'new'").get().n;
    return { success: true, tickets: tickets, total: total, newCount: newCount, limit: limit, offset: offset };
}

function adminGetTicket(ticketId) {
    var id = toPositiveInt(ticketId);
    if (!id) return { success: false, error: 'not_found' };
    var ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return { success: false, error: 'not_found' };
    var u = db.prepare(
        'SELECT id, username, display_name, email, custom_id, tiktok_username, tiktok_verified, tiktok_display_name, created_at FROM users WHERE id = ?'
    ).get(ticket.user_id);
    var user = u ? {
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        email: u.email,
        custom_id: u.custom_id,
        tiktok_username: u.tiktok_username || null,
        tiktok_verified: Boolean(u.tiktok_verified),
        tiktok_display_name: u.tiktok_display_name || null,
        created_at: u.created_at
    } : { id: ticket.user_id, name: 'حساب محذوف', deleted: true };
    return { success: true, ticket: ticket, user: user, messages: getMessages(id) };
}

/** رد الأدمن — نص فقط. تذكرة "جديدة" تتحول تلقائياً لـ"قيد المعالجة". */
function replyAsAdmin(input) {
    input = input || {};
    var id = toPositiveInt(input.ticketId);
    if (!id) return { success: false, error: 'not_found' };
    var ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return { success: false, error: 'not_found' };
    var body = validateBody(input.body);
    if (body.error) return { success: false, error: body.error };

    var t = now();
    var info;
    db.transaction(function () {
        info = db.prepare("INSERT INTO ticket_messages (ticket_id, sender, body, attachments, created_at) VALUES (?, 'admin', ?, '[]', ?)")
            .run(id, body.value, t);
        db.prepare(
            "UPDATE tickets SET updated_at = ?, last_reply_by = 'admin', status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END WHERE id = ?"
        ).run(t, id);
    })();

    notifyUser(ticket, body.value);
    var message = mapMessage(db.prepare('SELECT * FROM ticket_messages WHERE id = ?').get(info.lastInsertRowid));
    return { success: true, message: message, status: db.prepare('SELECT status FROM tickets WHERE id = ?').get(id).status };
}

function adminSetStatus(input) {
    input = input || {};
    var id = toPositiveInt(input.ticketId);
    if (!id) return { success: false, error: 'not_found' };
    if (TICKET_STATUSES.indexOf(input.status) === -1) return { success: false, error: 'invalid_status' };
    var info = db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run(input.status, now(), id);
    if (!info.changes) return { success: false, error: 'not_found' };
    return { success: true, status: input.status };
}

module.exports = {
    getUploadSignature: getUploadSignature,
    createTicket: createTicket,
    listMyTickets: listMyTickets,
    countMyUnread: countMyUnread,
    getMyTicket: getMyTicket,
    replyAsUser: replyAsUser,
    adminListTickets: adminListTickets,
    adminGetTicket: adminGetTicket,
    replyAsAdmin: replyAsAdmin,
    adminSetStatus: adminSetStatus,
    // للاختبارات فقط
    _signCloudinaryParams: signCloudinaryParams
};
