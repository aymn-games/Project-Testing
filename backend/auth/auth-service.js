/**
 * AGP AUTH SERVICE — حسابات، جلسات، وتتبّع إحصائيات البثوث. منطق بحت هنا
 * (بدون أي معالجة HTTP — ذلك بطبقة الراوت).
 *
 * أول حساب يُنشَأ بالنظام يصبح 'admin' تلقائياً؛ كل حساب بعده 'streamer'.
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var password = require('./password');
var logger = require('../utils/logger');
var config = require('../config');
var OAuth2Client = require('google-auth-library').OAuth2Client;
var collectiblesService = require('../collectibles/collectibles-service');
var pointsService = require('../points/points-service');
var streamerLevelService = require('../points/streamer-level-service');
var streamerHours = require('../points/streamer-hours');
var emailService = require('../email/email-service');

var SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوماً
// أقصى عدد أجهزة لحساب ستريمر معتمد (راجع checkDeviceLock).
var MAX_STREAMER_DEVICES = 3;
var DEVICE_LOCKED_MESSAGE = 'هذا الحساب وصل للحد الأقصى من الأجهزة (3 أجهزة). تواصل مع الأدمن للسماح بجهاز جديد.';
var googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

function now() { return Date.now(); }

// حساب أُنشئ بالدخول بتيك توك (loginWithTikTok) — تيك توك ما يعطينا
// إيميل، وعمود email إلزامي وفريد، فنحفظ إيميل بديل بنطاق .invalid
// (محجوز، لا يستقبل بريد). يُعامَل كأن الحساب بلا إيميل حتى يضيف إيميله.
var TIKTOK_PLACEHOLDER_EMAIL_DOMAIN = '@tiktok.invalid';

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        email.slice(-TIKTOK_PLACEHOLDER_EMAIL_DOMAIN.length).toLowerCase() !== TIKTOK_PLACEHOLDER_EMAIL_DOMAIN;
}

/* ----------------------------------------------------------------------
 * إطار "من البداية" الحصري. شرط المنح مركَّب من قيدين معاً (أيهما يتحقق
 * أولاً يوقف المنح): (1) زمني — التسجيل والتوثيق قبل FOUNDERS_MONTH_CUTOFF_MS،
 * (2) عددي — أول FOUNDERS_MONTH_MAX_GRANTS حساباً فقط.
 *
 * ⚠️ المنح يحصل فقط عند نجاح توثيق تيك توك فعلياً (verifyTikTokOwnership
 * أدناه)، لا وقت التسجيل — تسجيل وحده غير كافٍ. حساب موثَّق تيك توك
 * مسبقاً (قبل هذا الإصدار) لا يُمنح الإطار بأثر رجعي.
 * ---------------------------------------------------------------------- */
var FOUNDERS_MONTH_FRAME_FILENAME = 'frame-founders-month.png';
var FOUNDERS_MONTH_DISPLAY_NAME_AR = 'من البداية';
var FOUNDERS_MONTH_CUTOFF_MS = Date.parse('2026-09-15T00:00:00Z');
var FOUNDERS_MONTH_MAX_GRANTS = 100;

/**
 * يضمن وجود صف `custom_frames` واحد لإطار "من البداية" (بدون تكرار عند
 * كل استدعاء أو كل إعادة تشغيل للخادم — بحث أولاً بـimage_filename).
 * @returns {number|null} id الصف، أو null لو فشل الإنشاء لسبب ما
 */
function ensureFoundersMonthCustomFrameId() {
    var existing = db.prepare('SELECT id FROM custom_frames WHERE image_filename = ?').get(FOUNDERS_MONTH_FRAME_FILENAME);
    if (existing) return existing.id;
    var created = collectiblesService.createCustomFrame(FOUNDERS_MONTH_FRAME_FILENAME, FOUNDERS_MONTH_DISPLAY_NAME_AR);
    return created.success ? created.id : null;
}

/**
 * عدد المرات اللي مُنح فيها إطار "من البداية" — لفرض سقف الـ100 شخص.
 * @param {number} frameId
 * @returns {number}
 */
function countFoundersMonthGrants(frameId) {
    return db.prepare(
        "SELECT COUNT(*) AS c FROM user_frames WHERE frame_type = 'custom' AND frame_ref = ?"
    ).get(String(frameId)).c;
}

/**
 * يمنح إطار "من البداية" ويفعّله تلقائياً — يُستدعى حصراً من
 * verifyTikTokOwnership عند نجاح التوثيق. فحص مزدوج: قبل تاريخ الانتهاء،
 * وتحت سقف الـ100. ⚠️ الفحص والمنح متزامنان بالكامل (بدون await بينهما)
 * عمداً، لتفادي Race Condition بين توثيقين متزامنين يتجاوزان الـ100 معاً.
 * @param {number} userId
 */
function grantFoundersMonthFrameIfEligible(userId) {
    if (now() > FOUNDERS_MONTH_CUTOFF_MS) return;
    var frameId = ensureFoundersMonthCustomFrameId();
    if (!frameId) return;

    // لو مُنح له مسبقاً — لا تحسبه مرتين ولا تعيد المنح.
    var already = db.prepare(
        "SELECT id FROM user_frames WHERE user_id = ? AND frame_type = 'custom' AND frame_ref = ?"
    ).get(userId, String(frameId));
    if (already) return;

    if (countFoundersMonthGrants(frameId) >= FOUNDERS_MONTH_MAX_GRANTS) return;

    var result = collectiblesService.grantFrame(userId, 'custom', frameId, { grantedBy: 'auto_founders_month' });
    if (result.success) collectiblesService.setEquipped(userId, 'custom', frameId);
}

/**
 * رقم عرض عام (Public ID) — رقم عشوائي من 8 أرقام، فريد بكل قاعدة
 * البيانات. يُولَّد تلقائياً لكل حساب جديد ويُستخدم كـ custom_id
 * الافتراضي؛ قابل للتغيير لاحقاً عبر setCustomId.
 * @returns {string}
 */
function generatePublicId() {
    var id;
    do {
        id = String(Math.floor(10000000 + Math.random() * 90000000)); // 10000000–99999999
    } while (db.prepare('SELECT id FROM users WHERE custom_id = ?').get(id));
    return id;
}

/**
 * إنشاء حساب جديد.
 * @param {boolean} [wantsToBeStreamer] - زر التفعيل بصفحة إنشاء الحساب
 * @returns {{success: boolean, user?: Object, error?: string}}
 */
function signup(username, email, plainPassword, wantsToBeStreamer, emailCode) {
    username = (username || '').trim();
    email = (email || '').trim().toLowerCase();

    if (username.length < 3) return { success: false, error: 'username_too_short' };
    if (!isValidEmail(email)) return { success: false, error: 'invalid_email' };
    if (!plainPassword || plainPassword.length < 8) return { success: false, error: 'password_too_short' };

    var existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) return { success: false, error: 'already_exists' };

    // الحساب ما ينشأ إلا بعد تأكيد الإيميل بالرمز (sendSignupCode)
    var codeCheck = checkPendingSignupCode(email, emailCode);
    if (!codeCheck.success) return codeCheck;

    var userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    var role = userCount === 0 ? 'admin' : 'streamer'; // أول حساب = الأدمن (صاحب المنصة)
    var isStreamer = wantsToBeStreamer ? 1 : 0;

    var hash = password.hashPassword(plainPassword);
    var publicId = generatePublicId();
    var info = db.prepare(
        'INSERT INTO users (username, email, password_hash, role, is_streamer, custom_id, created_at, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(username, email, hash, role, isStreamer, publicId, now());
    db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);

    logger.log('Auth: new user signed up: ' + username + ' (role: ' + role + ', streamer: ' + Boolean(isStreamer) + ', id: ' + publicId + ')');

    return { success: true, user: { id: info.lastInsertRowid, username: username, email: email, role: role, is_streamer: Boolean(isStreamer), custom_id: publicId, permissions: {}, email_verified: true } };
}

/* ----------------------------------------------------------------------
 * تأكيد الإيميل واستعادة الحساب. كل الرموز 6 أرقام صالحة 15 دقيقة،
 * 5 محاولات خاطئة كحد أقصى للرمز الواحد، ودقيقة بين كل إرسال وإرسال.
 * ---------------------------------------------------------------------- */
var EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
var EMAIL_CODE_RESEND_MS = 60 * 1000;
var EMAIL_CODE_MAX_ATTEMPTS = 5;

function newEmailCode() { return String(crypto.randomInt(100000, 1000000)); }
function cleanCode(code) { return String(code || '').replace(/\D/g, ''); }
function resendWaitFrom(sentAt) {
    var wait = sentAt ? sentAt + EMAIL_CODE_RESEND_MS - now() : 0;
    return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

/**
 * الخطوة ١ لإنشاء حساب: يتحقق من البيانات ويرسل رمز للإيميل. الحساب
 * نفسه ما ينشأ إلا بـsignup(..., emailCode) بعد الرمز الصحيح.
 */
async function sendSignupCode(username, email) {
    username = (username || '').trim();
    email = (email || '').trim().toLowerCase();
    if (username.length < 3) return { success: false, error: 'username_too_short' };
    if (!isValidEmail(email)) return { success: false, error: 'invalid_email' };
    if (db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username)) {
        return { success: false, error: 'already_exists' };
    }
    var pending = db.prepare('SELECT sent_at FROM pending_signups WHERE email = ?').get(email);
    var wait = resendWaitFrom(pending && pending.sent_at);
    if (wait) return { success: false, error: 'code_resend_wait', retryAfter: wait };

    var code = newEmailCode(), at = now();
    db.prepare('INSERT INTO pending_signups (email, code, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, 0) ' +
        'ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, sent_at = excluded.sent_at, attempts = 0')
        .run(email, code, at + EMAIL_CODE_TTL_MS, at);
    var sent = await emailService.sendSignupCodeEmail(email, code);
    if (!sent.success) {
        db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email);
        return { success: false, error: 'email_send_failed' };
    }
    return { success: true };
}

function checkPendingSignupCode(email, code) {
    code = cleanCode(code);
    if (!code) return { success: false, error: 'email_code_required' };
    var row = db.prepare('SELECT code, expires_at, attempts FROM pending_signups WHERE email = ?').get(email);
    if (!row || now() > row.expires_at || row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        return { success: false, error: 'invalid_or_expired_code' };
    }
    if (row.code !== code) {
        db.prepare('UPDATE pending_signups SET attempts = attempts + 1 WHERE email = ?').run(email);
        return { success: false, error: 'invalid_or_expired_code' };
    }
    return { success: true };
}

/**
 * تأكيد الإيميل من البروفايل (حسابات قديمة سجّلت قبل التحقق). newEmail
 * اختياري: لو مختلف عن الحالي يتأكّد الجديد، ويصير هو إيميل الحساب بعد
 * الرمز الصحيح فقط (verifyEmail).
 */
async function sendEmailVerification(userId, newEmail) {
    var user = db.prepare('SELECT id, email, email_verified, email_code_sent_at FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'not_found' };
    var target = (newEmail || user.email || '').trim().toLowerCase();
    if (!isValidEmail(target)) return { success: false, error: 'invalid_email' };
    if (target === user.email && user.email_verified) return { success: false, error: 'already_verified' };
    if (target !== user.email && db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(target, userId)) {
        return { success: false, error: 'email_taken' };
    }
    var wait = resendWaitFrom(user.email_code_sent_at);
    if (wait) return { success: false, error: 'code_resend_wait', retryAfter: wait };

    var code = newEmailCode(), at = now();
    db.prepare('UPDATE users SET email_verify_code = ?, email_verify_target = ?, email_verify_expires = ?, email_verify_attempts = 0, email_code_sent_at = ? WHERE id = ?')
        .run(code, target, at + EMAIL_CODE_TTL_MS, at, userId);
    var sent = await emailService.sendEmailVerifyCodeEmail(target, code);
    if (!sent.success) {
        db.prepare('UPDATE users SET email_verify_code = NULL, email_verify_target = NULL, email_verify_expires = NULL, email_code_sent_at = NULL WHERE id = ?').run(userId);
        return { success: false, error: 'email_send_failed' };
    }
    return { success: true, email: target };
}

function verifyEmail(userId, code) {
    code = cleanCode(code);
    var user = db.prepare('SELECT id, email_verify_code, email_verify_target, email_verify_expires, email_verify_attempts FROM users WHERE id = ?').get(userId);
    if (!user || !user.email_verify_code || !code || now() > (user.email_verify_expires || 0) || user.email_verify_attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        return { success: false, error: 'invalid_or_expired_code' };
    }
    if (user.email_verify_code !== code) {
        db.prepare('UPDATE users SET email_verify_attempts = email_verify_attempts + 1 WHERE id = ?').run(userId);
        return { success: false, error: 'invalid_or_expired_code' };
    }
    // الإيميل الجديد ممكن أحد ثاني سجّل فيه بعد ما انرسل الرمز
    if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(user.email_verify_target, userId)) {
        return { success: false, error: 'email_taken' };
    }
    db.prepare('UPDATE users SET email = ?, email_verified = 1, email_verify_code = NULL, email_verify_target = NULL, email_verify_expires = NULL, email_verify_attempts = 0 WHERE id = ?')
        .run(user.email_verify_target, userId);
    return { success: true, email: user.email_verify_target };
}

/**
 * يلقى الحساب من أي معلومة تخصه: الإيميل، آيدي البروفايل (#1234)، اسم
 * المستخدم، أو يوزر تيك توك الموثّق (@user). بدون حساسية لحالة الأحرف.
 */
function findUserByIdentifier(identifier) {
    var raw = String(identifier || '').trim();
    if (!raw) return null;
    var cols = 'SELECT id, username, email, custom_id, recovery_sent_at FROM users WHERE ';
    if (raw.indexOf('@') > 0) return db.prepare(cols + 'email = ?').get(raw.toLowerCase()) || null;
    var bare = raw.replace(/^[@#]+/, '').trim();
    if (!bare) return null;
    return db.prepare(cols + 'custom_id = ?').get(bare) ||
        db.prepare(cols + 'username = ? COLLATE NOCASE').get(bare) ||
        db.prepare(cols + 'tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE').get(bare) || null;
}

/** a***n@gmail.com — يعرف المستخدم وين يدوّر بدون ما ينكشف الإيميل كامل. */
function maskEmail(email) {
    var parts = String(email || '').split('@');
    if (parts.length !== 2) return '';
    var name = parts[0];
    var shown = name.length <= 2 ? name.charAt(0) + '*' : name.charAt(0) + '***' + name.charAt(name.length - 1);
    return shown + '@' + parts[1];
}

/**
 * نسيت اليوزر أو الإيميل: يلقى الحساب من أي معلومة تخصه، ويرسل لإيميله
 * اسم المستخدم وآيدي البروفايل + رمز تعيين كلمة مرور جديدة (نفس رمز
 * resetPasswordWithCode). يرجع الإيميل مخفي جزئياً (قرار المنتج).
 */
async function recoverAccount(identifier) {
    var user = findUserByIdentifier(identifier);
    if (!user) return { success: false, error: 'account_not_found' };
    if (!isValidEmail(user.email)) return { success: false, error: 'no_email_on_account' };
    var wait = resendWaitFrom(user.recovery_sent_at);
    if (wait) return { success: false, error: 'code_resend_wait', retryAfter: wait, maskedEmail: maskEmail(user.email) };

    var code = newEmailCode(), at = now();
    db.prepare('UPDATE users SET password_reset_code = ?, password_reset_expires = ?, recovery_sent_at = ? WHERE id = ?')
        .run(code, at + PASSWORD_RESET_CODE_TTL_MS, at, user.id);
    var sent = await emailService.sendAccountRecoveryEmail(user.email, { username: user.username, customId: user.custom_id }, code);
    if (!sent.success) {
        db.prepare('UPDATE users SET password_reset_code = NULL, password_reset_expires = NULL, recovery_sent_at = NULL WHERE id = ?').run(user.id);
        return { success: false, error: 'email_send_failed' };
    }
    return { success: true, maskedEmail: maskEmail(user.email) };
}

/**
 * قيد الأجهزة لحسابات الستريمر (حتى MAX_STREAMER_DEVICES = 3 أجهزة):
 * أول 3 أجهزة يدخل منها الحساب تُربط تلقائياً، والرابع يُرفض (device_locked)
 * إلا لو الأدمن فعّل "السماح بجهاز جديد" — وقتها يحل محل الأقدم استخداماً.
 * يشمل الحسابات اللي اختارت "ستريمر" بالتسجيل (is_streamer)
 * أو حوّله الأدمن (can_run_games). لا قيد على اللاعبين العاديين، ولا على
 * حسابات الأدمن (عشان صاحب المنصة ما ينقفل خارج حسابه).
 *
 * ⚠️ قيد "ناعم" لا "صلب" — الجهاز يُعرَّف برقم عشوائي بـlocalStorage
 * بالمتصفح (auth-client.js: getDeviceId)، وليس بصمة جهاز حقيقية. أي شخص
 * يمسح بيانات المتصفح أو يستخدم متصفحاً مختلفاً يقدر يتحايل عليه — أقصى
 * حماية ممكنة تقنياً من صفحة ويب عادية، لا وعد بحماية أقوى.
 *
 * سوبر أدمن (is_super_admin=1) يتجاوز الفحص بالكامل، يُفعَّل يدوياً لحساب
 * محدد فقط. allow_device_change=1 يسمح بجهاز إضافي مرة واحدة (يحل محل
 * الأقدم) — يُستهلَك تلقائياً بعد أول تسجيل دخول من جهاز جديد.
 *
 * @param {Object} user - صف قاعدة بيانات كامل (permissions لسا نص JSON خام)
 * @param {string|null|undefined} deviceId
 * @returns {{allowed: boolean, bind?: boolean}}
 */
function checkDeviceLock(user, deviceId) {
    if (user.is_super_admin) return { allowed: true, bind: false };
    if (user.role === 'admin') return { allowed: true, bind: false };
    var perms = JSON.parse(user.permissions || '{}');
    // صلاحية «تشغيل كامل» (full_game_access) — بدون أي قيود، ومنها قيد الأجهزة
    if (perms.full_game_access) return { allowed: true, bind: false };
    var isStreamerAccount = Boolean(user.is_streamer) || Boolean(perms.can_run_games);
    if (!isStreamerAccount) return { allowed: true };
    var devices = getBoundDevices(user);
    if (deviceId && devices.indexOf(deviceId) !== -1) return { allowed: true, bind: true, devices: devices };
    if (devices.length < MAX_STREAMER_DEVICES) return { allowed: true, bind: true, devices: devices };
    if (user.allow_device_change) return { allowed: true, bind: true, consumeAllowChange: true, devices: devices };
    return { allowed: false };
}

/**
 * الأجهزة المربوطة بحساب ستريمر — مصفوفة JSON بعمود bound_device_ids،
 * مرتبة من الأقدم استخداماً للأحدث. الحسابات القديمة (قبل تعدد الأجهزة)
 * عندها bound_device_id فقط، فنعتبره الجهاز الأول.
 * @param {Object} user
 * @returns {string[]}
 */
function getBoundDevices(user) {
    var list = [];
    try { list = JSON.parse(user.bound_device_ids || '[]'); } catch (err) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(function (d) { return typeof d === 'string' && d; });
    if (!list.length && user.bound_device_id) list = [user.bound_device_id];
    return list;
}

/**
 * يحفظ نتيجة checkDeviceLock بعد نجاح الدخول: الجهاز الحالي يصير الأحدث
 * بالقائمة. لو القائمة ممتلئة (مسموح بتغيير الجهاز لمرة واحدة) يُحذف
 * الأقدم استخداماً. bound_device_id يبقى = أحدث جهاز للتوافق.
 * @param {number} userId
 * @param {{bind?: boolean, devices?: string[], consumeAllowChange?: boolean}} deviceCheck
 * @param {string|null|undefined} deviceId
 */
function saveDeviceBinding(userId, deviceCheck, deviceId) {
    if (!deviceCheck.bind || !deviceId || !deviceCheck.devices) return;
    var list = deviceCheck.devices.filter(function (d) { return d !== deviceId; });
    list.push(deviceId);
    while (list.length > MAX_STREAMER_DEVICES) list.shift();
    if (deviceCheck.consumeAllowChange) {
        db.prepare('UPDATE users SET bound_device_ids = ?, bound_device_id = ?, allow_device_change = 0 WHERE id = ?')
            .run(JSON.stringify(list), deviceId, userId);
    } else {
        db.prepare('UPDATE users SET bound_device_ids = ?, bound_device_id = ? WHERE id = ?')
            .run(JSON.stringify(list), deviceId, userId);
    }
}

/**
 * تسجيل الدخول — يقبل البريد الإلكتروني أو اسم المستخدم بنفس الحقل،
 * نميّز بينهما بوجود "@" فقط. يُنشئ جلسة جديدة عند النجاح.
 * @param {string} identifier - بريد إلكتروني أو اسم مستخدم
 * @param {string} plainPassword
 * @param {string} [deviceId] - معرّف الجهاز، يُستخدَم فقط لو ستريمر معتمد.
 * @returns {{success: boolean, token?: string, user?: Object, error?: string}}
 */
function login(identifier, plainPassword, deviceId) {
    identifier = (identifier || '').trim();
    var user = identifier.indexOf('@') !== -1
        ? db.prepare('SELECT * FROM users WHERE email = ?').get(identifier.toLowerCase())
        : db.prepare('SELECT * FROM users WHERE username = ?').get(identifier);

    if (!user || !password.verifyPassword(plainPassword || '', user.password_hash)) {
        return { success: false, error: 'invalid_credentials' };
    }

    var deviceCheck = checkDeviceLock(user, deviceId);
    if (!deviceCheck.allowed) return { success: false, error: 'device_locked', message: DEVICE_LOCKED_MESSAGE };
    saveDeviceBinding(user.id, deviceCheck, deviceId);

    var token = createSessionFor(user);

    return {
        success: true,
        token: token,
        user: {
            id: user.id, username: user.username, email: user.email, role: user.role, custom_id: user.custom_id,
            is_streamer: Boolean(user.is_streamer), permissions: JSON.parse(user.permissions || '{}'),
            account_type_chosen: user.account_type_chosen === undefined ? true : Boolean(user.account_type_chosen),
            email_verified: Boolean(user.email_verified)
        }
    };
}

function createSessionFor(user) {
    var token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(token, user.id, now(), now() + SESSION_DURATION_MS);
    return token;
}

var PASSWORD_RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 دقيقة

/**
 * الخطوة ١ من استرجاع كلمة المرور — يولّد رمز 6 أرقام ويرسله بالبريد،
 * لو الحساب موجود فعلاً.
 *
 * ⚠️ يرجع {success: true} دائماً بغض النظر عن وجود الحساب — منع تعداد
 * الإيميلات المسجَّلة (Email Enumeration).
 *
 * ⚠️ لا حد لعدد الطلبات (Rate Limiting) حالياً — يمكن استنزاف حصة إرسال
 * Resend المجانية بطلبات متكررة، قيد يُعالَج لاحقاً لو صار مشكلة فعلية.
 *
 * @param {string} email
 * @returns {Promise<{success: boolean}>}
 */
async function requestPasswordReset(email) {
    email = (email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return { success: true }; // نفس مبدأ عدم التعداد أعلاه

    var user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    if (!user) return { success: true };

    var code = String(crypto.randomInt(100000, 1000000)); // 6 أرقام
    var expires = now() + PASSWORD_RESET_CODE_TTL_MS;
    db.prepare('UPDATE users SET password_reset_code = ?, password_reset_expires = ? WHERE id = ?')
        .run(code, expires, user.id);

    var sendResult = await emailService.sendPasswordResetEmail(user.email, code);
    if (!sendResult.success) {
        logger.error('Auth: تعذّر إرسال إيميل استرجاع كلمة المرور لحساب id=' + user.id + ' — ' + sendResult.error);
        // لا نكشف فشل الإرسال للمستخدم — لكن نصفّر الرمز حتى لا يبقى صالحاً بدون علم صاحبه.
        db.prepare('UPDATE users SET password_reset_code = NULL, password_reset_expires = NULL WHERE id = ?').run(user.id);
    }

    return { success: true };
}

/**
 * الخطوة ٢ — يتحقق من الرمز وصلاحيته، يحدّث كلمة المرور، ويصفّر الرمز.
 * يفسخ أيضاً كل جلسات الحساب الحالية (خروج من كل الأجهزة) — صمام أمان:
 * لو الرمز وصل لشخص غير صاحب الحساب، أي جلسة مسروقة تُفسَخ فوراً.
 *
 * @param {string} email
 * @param {string} code
 * @param {string} newPassword
 * @returns {{success: boolean, error?: string}}
 */
function resetPasswordWithCode(email, code, newPassword) {
    email = (email || '').trim().toLowerCase();
    code = (code || '').trim();
    if (!code) return { success: false, error: 'missing_code' };
    if (!newPassword || newPassword.length < 6) return { success: false, error: 'weak_password' };

    var user = email.indexOf('@') > 0
        ? db.prepare('SELECT id, password_reset_code, password_reset_expires FROM users WHERE email = ?').get(email)
        : findUserByIdentifier(email);
    if (user && user.password_reset_code === undefined) {
        user = db.prepare('SELECT id, password_reset_code, password_reset_expires FROM users WHERE id = ?').get(user.id);
    }
    // رسالة خطأ عامة موحّدة لكل حالات الفشل — لا كشف تفاصيل داخلية.
    if (!user || !user.password_reset_code || user.password_reset_code !== code) {
        return { success: false, error: 'invalid_or_expired_code' };
    }
    if (!user.password_reset_expires || now() > user.password_reset_expires) {
        db.prepare('UPDATE users SET password_reset_code = NULL, password_reset_expires = NULL WHERE id = ?').run(user.id);
        return { success: false, error: 'invalid_or_expired_code' };
    }

    var newHash = password.hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, password_reset_code = NULL, password_reset_expires = NULL WHERE id = ?')
        .run(newHash, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    return { success: true };
}

/**
 * تسجيل دخول (أو إنشاء حساب تلقائياً أول مرة) عبر Google. يتحقق من
 * رمز الهوية (ID Token) الوارد من المتصفح ضد خوادم Google رسمياً —
 * لا تصديق يدوي، توثيق حقيقي عبر مكتبة Google الرسمية.
 *
 * ⚠️ يتطلب config.googleClientId مضبوطاً مسبقاً (من Google Cloud
 *   Console — راجع README.md)، وإلا يرفض فوراً بخطأ واضح.
 *
 * @param {string} idToken - الرمز القادم من زر تسجيل الدخول بجوجل بالمتصفح
 * @param {string} [deviceId] - نفس شرط checkDeviceLock بدالة login أعلاه.
 * @returns {Promise<{success: boolean, token?: string, user?: Object, error?: string}>}
 */
async function loginWithGoogle(idToken, deviceId) {
    if (!googleClient) return { success: false, error: 'google_signin_not_configured' };
    if (!idToken) return { success: false, error: 'missing_id_token' };

    var payload;
    try {
        var ticket = await googleClient.verifyIdToken({ idToken: idToken, audience: config.googleClientId });
        payload = ticket.getPayload();
    } catch (err) {
        logger.error('Auth: Google token verification failed:', err.message);
        return { success: false, error: 'invalid_google_token' };
    }

    var googleId = payload.sub;
    var email = (payload.email || '').toLowerCase();
    var existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    if (!existing) {
        // أول تسجيل دخول بجوجل لهذا الحساب — يُنشأ حساب جديد تلقائياً.
        var byEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (byEmail) {
            // بريد مسجَّل مسبقاً بكلمة مرور عادية — نربط جوجل بنفس الحساب بدل تكراره.
            // الدخول بـGoogle بنفس الإيميل يثبت إن الإيميل يخص صاحب الحساب
            db.prepare('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?').run(googleId, byEmail.id);
            existing = byEmail;
        } else {
            var userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
            var role = userCount === 0 ? 'admin' : 'streamer';
            var baseUsername = (payload.name || email.split('@')[0] || 'user').replace(/\s+/g, '_').slice(0, 30);
            var username = baseUsername;
            var suffix = 1;
            while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
                username = baseUsername + suffix++;
            }
            var publicId = generatePublicId();
            // ⚠️ account_type_chosen = 0 صراحة (خلافاً للقيمة الافتراضية 1
            // بقاعدة البيانات) — حساب جوجل جديد كلياً لازم يختار لاعب/
            // استريمر بخطوة إجبارية بعد الدخول (choose-account-type.html).
            var info = db.prepare(
                'INSERT INTO users (username, email, google_id, role, custom_id, created_at, account_type_chosen, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
            ).run(username, email, googleId, role, publicId, now(), 0);
            existing = { id: info.lastInsertRowid, username: username, email: email, role: role, custom_id: publicId, account_type_chosen: 0 };
            logger.log('Auth: new user signed up via Google: ' + username + ' (role: ' + role + ', id: ' + publicId + ') — account type choice pending');
        }
    }

    // قيد الجهاز الواحد يُطبَّق هنا أيضاً (نفس checkDeviceLock بـlogin
    // العادي)، بصرف النظر عن طريقة الدخول.
    var deviceCheck = checkDeviceLock(
        Object.assign({ permissions: '{}' }, existing, {
            permissions: typeof existing.permissions === 'string' ? existing.permissions : JSON.stringify(existing.permissions || {})
        }),
        deviceId
    );
    if (!deviceCheck.allowed) return { success: false, error: 'device_locked', message: DEVICE_LOCKED_MESSAGE };
    saveDeviceBinding(existing.id, deviceCheck, deviceId);

    // "existing" قد يكون صف قاعدة بيانات فعلي أو كائناً جديداً بُني
    // يدوياً بالأعلى — توحيد الشكل هنا قبل الإرجاع.
    var sessionToken = createSessionFor(existing);
    return {
        success: true,
        token: sessionToken,
        user: {
            id: existing.id, username: existing.username, email: existing.email, role: existing.role, custom_id: existing.custom_id,
            is_streamer: Boolean(existing.is_streamer),
            permissions: typeof existing.permissions === 'string' ? JSON.parse(existing.permissions || '{}') : (existing.permissions || {}),
            account_type_chosen: existing.account_type_chosen === undefined ? true : Boolean(existing.account_type_chosen),
            email_verified: true
        }
    };
}

/**
 * الدخول/إنشاء حساب بتيك توك (زي جوجل). tiktokUser من
 * tiktokOAuthService.fetchTikTokUserInfo بعد OAuth ناجح، فالملكية مثبتة.
 * الحساب يُلقى بـopen_id (ثابت لا يتغيّر مع اليوزر)؛ لو ما فيه حساب يُنشأ
 * حساب جديد موثَّق تيك توك مباشرة، بإيميل بديل (راجع
 * TIKTOK_PLACEHOLDER_EMAIL_DOMAIN) واختيار لاعب/استريمر إجباري بعده.
 * @param {{open_id:string, username?:string, display_name?:string, avatar_url?:string}} tiktokUser
 * @param {{refreshToken?:string, refreshExpiresAt?:number}} [tokens]
 * @param {string} [deviceId]
 * @returns {{success: boolean, token?: string, user?: Object, isNew?: boolean, error?: string}}
 */
function loginWithTikTok(tiktokUser, tokens, deviceId) {
    if (!tiktokUser || !tiktokUser.open_id) return { success: false, error: 'missing_tiktok_user' };
    var tiktokUsername = String(tiktokUser.username || '').trim().replace(/^@+/, '') || null;
    var refreshToken = (tokens && tokens.refreshToken) || null;
    var refreshExpiresAt = (tokens && tokens.refreshExpiresAt) || null;
    var isNew = false;

    var existing = db.prepare('SELECT * FROM users WHERE tiktok_open_id = ?').get(tiktokUser.open_id);
    if (existing) {
        // تحديث بيانات تيك توك (اليوزر ممكن تغيّر) + refresh token الجديد.
        db.prepare(
            'UPDATE users SET tiktok_username = COALESCE(?, tiktok_username), tiktok_display_name = COALESCE(?, tiktok_display_name), tiktok_avatar_url = COALESCE(?, tiktok_avatar_url), tiktok_verified = 1, tiktok_refresh_token = COALESCE(?, tiktok_refresh_token), tiktok_refresh_expires_at = COALESCE(?, tiktok_refresh_expires_at) WHERE id = ?'
        ).run(tiktokUsername, tiktokUser.display_name || null, tiktokUser.avatar_url || null, refreshToken, refreshExpiresAt, existing.id);
    } else {
        // نفس اليوزر موثَّق بحساب ثاني بطريقة كود البايو القديمة (بدون open_id)
        // — ما ننشئ حساب مكرر لنفس يوزر تيك توك؛ صاحبه يدخل بحسابه ويربط من البروفايل.
        if (tiktokUsername && db.prepare('SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE').get(tiktokUsername)) {
            return { success: false, error: 'tiktok_linked_to_other_account' };
        }
        var userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
        var role = userCount === 0 ? 'admin' : 'streamer';
        var baseUsername = (tiktokUsername || 'tiktok_user').replace(/\s+/g, '_').slice(0, 30);
        var username = baseUsername;
        var suffix = 1;
        while (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
            username = baseUsername + suffix++;
        }
        var placeholderEmail = 'tt_' + crypto.createHash('sha256').update(tiktokUser.open_id).digest('hex').slice(0, 24) + TIKTOK_PLACEHOLDER_EMAIL_DOMAIN;
        var publicId = generatePublicId();
        // account_type_chosen = 0 — نفس حساب جوجل الجديد (choose-account-type.html).
        var info = db.prepare(
            'INSERT INTO users (username, email, role, custom_id, created_at, account_type_chosen, email_verified, display_name, tiktok_open_id, tiktok_username, tiktok_display_name, tiktok_avatar_url, tiktok_verified, tiktok_refresh_token, tiktok_refresh_expires_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 1, ?, ?)'
        ).run(username, placeholderEmail, role, publicId, now(), tiktokUser.display_name || null, tiktokUser.open_id, tiktokUsername,
            tiktokUser.display_name || null, tiktokUser.avatar_url || null, refreshToken, refreshExpiresAt);
        isNew = true;
        logger.log('Auth: new user signed up via TikTok: ' + username + ' (role: ' + role + ', id: ' + publicId + ') — account type choice pending');
        existing = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    var deviceCheck = checkDeviceLock(existing, deviceId);
    if (!deviceCheck.allowed) return { success: false, error: 'device_locked', message: DEVICE_LOCKED_MESSAGE };
    saveDeviceBinding(existing.id, deviceCheck, deviceId);

    return { success: true, token: createSessionFor(existing), userId: existing.id, isNew: isNew };
}

/**
 * ربط يوزرنيم تيك توك بملف الستريمر بشكل دائم (يظهر لاحقاً كافتراضي
 * في مربع الاتصال اليدوي، والستريمر يقدر يعدّله وقت الاتصال نفسه).
 */
function linkTikTokUsername(userId, tiktokUsername) {
    db.prepare('UPDATE users SET tiktok_username = ? WHERE id = ?').run((tiktokUsername || '').trim(), userId);
}

/* ----------------------------------------------------------------------
 * رقم عرض مخصص (Custom ID) — منفصل تماماً عن الآيدي الداخلي (id)، آمن
 * للتعديل من لوحة الأدمن دون أي خطر على ربط الجلسات/البثوث.
 * ---------------------------------------------------------------------- */

/**
 * @returns {{success: boolean, error?: string}}
 */
function setCustomId(userId, customId) {
    customId = (customId || '').trim();
    if (!customId) return { success: false, error: 'empty_custom_id' };

    var existing = db.prepare('SELECT id FROM users WHERE custom_id = ? AND id != ?').get(customId, userId);
    if (existing) return { success: false, error: 'custom_id_taken' };

    db.prepare('UPDATE users SET custom_id = ? WHERE id = ?').run(customId, userId);
    return { success: true };
}

/**
 * الأدمن فقط — إيجاد حساب عبر الآيدي الداخلي (users.id) أو آيدي البروفايل
 * (custom_id)، لعرض اسم صاحب الحساب للتأكد قبل المنح/السحب.
 * @param {string} query
 * @param {'internal'|'profile'} idType
 * @returns {Object|null}
 */
function adminLookupUser(query, idType) {
    query = String(query || '').trim();
    if (!query) return null;
    var cols = 'id, username, display_name, custom_id, tiktok_username, tiktok_verified, tiktok_display_name';
    var user = idType === 'profile'
        ? db.prepare('SELECT ' + cols + ' FROM users WHERE custom_id = ?').get(query)
        : (/^\d+$/.test(query) ? db.prepare('SELECT ' + cols + ' FROM users WHERE id = ?').get(Number(query)) : null);
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        display_name: user.display_name || null,
        custom_id: user.custom_id || null,
        tiktok_username: user.tiktok_verified ? user.tiktok_username : null,
        tiktok_display_name: user.tiktok_verified ? (user.tiktok_display_name || null) : null
    };
}

/**
 * بروفايل مستخدم عبر الـID العام (custom_id) — مسار عام، لكن الراوتر
 * (handlePublicProfile بـauth-router.js) هو من يقرّر أي جزء من هذا
 * الكائن يُرسَل فعلياً: صاحب الحساب أو الأدمن يشوفون كل شيء، غيرهم فقط
 * username/custom_id. لا بريد ولا الآيدي الداخلي (id) حتى بالإرجاع الكامل.
 * @param {string} customId
 * @returns {Object|null}
 */
function getPublicProfile(customId) {
    customId = (customId || '').trim();
    if (!customId) return null;

    var user = db.prepare(
        'SELECT id, username, role, is_streamer, tiktok_username, tiktok_verified, tiktok_avatar_url, tiktok_display_name, custom_id, permissions, created_at, display_name, avatar_image_base64 FROM users WHERE custom_id = ?'
    ).get(customId);
    if (!user) return null;

    var stats = getUserStats(user.id);
    return {
        custom_id: user.custom_id,
        username: user.username,
        role: user.role,
        is_streamer: Boolean(user.is_streamer),
        can_run_games: Boolean(JSON.parse(user.permissions || '{}').can_run_games),
        tiktok_username: user.tiktok_verified ? user.tiktok_username : null,
        tiktok_verified: Boolean(user.tiktok_verified),
        // استخراج تقريبي (meta tags) لحظة نجاح التحقق — قد ترجع null بدون أثر على صحة التحقق نفسه.
        tiktok_avatar_url: user.tiktok_verified ? (user.tiktok_avatar_url || null) : null,
        tiktok_display_name: user.tiktok_verified ? (user.tiktok_display_name || null) : null,
        // اسم عرض + صورة بروفايل يعدّلهما المستخدم بنفسه — منفصلان عن
        // username (ثابت) وtiktok_display_name/tiktok_avatar_url (من تيك توك).
        display_name: user.display_name || null,
        avatar_image_base64: user.avatar_image_base64 || null,
        joined_at: user.created_at,
        stats: {
            total_broadcasts: stats.total_broadcasts,
            total_comments: stats.total_comments,
            total_gifts: stats.total_gifts,
            total_gifts_value: stats.total_gifts_value,
            total_follows: stats.total_follows,
            total_players: stats.total_players,
            total_live_ms: stats.total_live_ms
        },
        // نظام النقاط/المستويات + المقتنيات — handlePublicProfile بـ
        // auth-router.js يقرر إرسال هذه الحقول فقط لصاحب الحساب أو الأدمن.
        points: pointsService.getUserPoints(user.id),
        frames: collectiblesService.getUserFrames(user.id),
        entrance: collectiblesService.getEntrance(user.id),
        elimCards: collectiblesService.getElimCards(user.id),
        winCards: collectiblesService.getWinCards(user.id),
        streamerLevel: streamerLevelService.getStreamerLevelInfo(user.id)
    };
}

/**
 * إيجاد حساب مسجَّل له يوزرنيم تيك توك موثَّق فعلياً (tiktok_verified = 1)
 * يطابق الاسم المُمرَّر — يُستخدَم لربط مشاركة لاعب بجولة بحساب فعلي
 * لمنحه نقاطاً. مطابقة غير حساسة لحالة الأحرف.
 * @param {string} tiktokUsername
 * @returns {{id: number}|null}
 */
function findVerifiedUserByTikTok(tiktokUsername) {
    tiktokUsername = (tiktokUsername || '').trim();
    if (!tiktokUsername) return null;
    // "= ? COLLATE NOCASE" بدل LOWER() — قابل لاستخدام فهرس
    // idx_users_tiktok_username_nocase بدل مسح جدول users كاملاً كل تعليق.
    return db.prepare(
        'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
    ).get(tiktokUsername) || null;
}

/* ----------------------------------------------------------------------
 * التحقق من ملكية حساب تيك توك عبر كود مؤقّت بالبايو.
 * ---------------------------------------------------------------------- */

var https = require('https');

/**
 * توليد كود تحقق جديد وتخزينه للمستخدم (يُعرَض له ليضيفه ببايو تيك توك).
 * @returns {string} الكود المُولَّد
 */
function generateVerificationCode(userId) {
    var code = 'AGP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.prepare('UPDATE users SET tiktok_verification_code = ?, tiktok_verified = 0 WHERE id = ?').run(code, userId);
    return code;
}

/**
 * يفحص نص HTML: هل هو صفحة "تحقّق إنك إنسان" من تيك توك بدل البروفايل
 * الفعلي؟ مُستخرَجة كدالة مستقلة حتى تُستخدَم من فحص إعادة المحاولة
 * وسجل التشخيص بنفس المنطق دون تكرار.
 * @param {string} html
 * @returns {boolean}
 */
function looksLikeTikTokBotCheck(html) {
    // "please enable javascript" أُزيلت عمداً — عبارة عامة موجودة حتى
    // بصفحات حقيقية (noscript افتراضي لأي SPA)، كانت تُصنَّف خطأً كـ"تحقق
    // إنسان". أبقينا فقط عبارات خاصة فعلياً بصفحة التحدي.
    return /verify you.{0,20}human|captcha|are you a robot/i.test(html || '');
}

/**
 * جلب صفحة واحدة عبر https، مع متابعة إعادة التوجيه (redirect) يدوياً —
 * https.get لا يتابعها تلقائياً. حتى 3 قفزات دفاعياً ضد أي حلقة.
 * @param {string} url
 * @param {Object} headers
 * @param {number} redirectsLeft
 * @returns {Promise<string>}
 */
function fetchFollowingRedirects(url, headers, redirectsLeft) {
    return new Promise(function (resolve, reject) {
        https.get(url, { headers: headers }, function (res) {
            var status = res.statusCode;
            if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
                res.resume();
                var nextUrl = new URL(res.headers.location, url).toString();
                resolve(fetchFollowingRedirects(nextUrl, headers, redirectsLeft - 1));
                return;
            }
            if (status !== 200) {
                reject(new Error('profile_fetch_failed_status_' + status));
                res.resume();
                return;
            }
            var chunks = [];
            res.on('data', function (chunk) { chunks.push(chunk); });
            res.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
        }).on('error', reject);
    });
}

/**
 * تأخير بسيط (ms) — يُستخدَم بين محاولات إعادة الجلب.
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * جلب HTML صفحة بروفايل تيك توك العامة، مع إعادة محاولة تلقائية (حتى
 * مرتين إضافيتين) لو الرد الأول كان صفحة "تحقّق إنك إنسان" بدل البروفايل
 * الفعلي — تظهر بشكل انتقائي، والمحاولة التالية غالباً تنجح.
 * @returns {Promise<string>}
 */
async function fetchPublicProfileHtml(tiktokUsername) {
    var url = 'https://www.tiktok.com/@' + encodeURIComponent(tiktokUsername);
    // هيدرز أشبه بمتصفح حقيقي — تيك توك معروف بحجب/تقديم صفحة تحقّق
    // لطلبات فيها هيدرز واضحة إنها من سكربت/سيرفر لا متصفح.
    var headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
    };

    var attempts = 3;
    var lastHtml = '';
    for (var i = 0; i < attempts; i++) {
        lastHtml = await fetchFollowingRedirects(url, headers, 3);
        if (!looksLikeTikTokBotCheck(lastHtml)) return lastHtml;
        // رد بدا صفحة bot-check — لو ما زال فيه محاولات، ننتظر ونعيد الجلب.
        if (i < attempts - 1) await delay(800 + i * 700);
    }
    return lastHtml; // آخر محاولة (bot-check على الأغلب) — verifyTikTokOwnership يشخّصها ويرجع خطأ واضح
}

/**
 * التحقق: هل كود المستخدم المخزَّن موجود فعلياً بصفحة بروفايل تيك توك
 * العامة؟ بحث نصي مباشر بكامل الصفحة (أكثر مقاومة لتغيّر بنية HTML
 * الداخلية من تيك توك، بدل الاعتماد على مسار JSON محدَّد قد يتغيّر).
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function verifyTikTokOwnership(userId, tiktokUsername) {
    var user = db.prepare('SELECT tiktok_verification_code FROM users WHERE id = ?').get(userId);
    if (!user || !user.tiktok_verification_code) return { success: false, error: 'no_pending_verification' };

    var html;
    try {
        html = await fetchPublicProfileHtml(tiktokUsername);
    } catch (err) {
        logger.error('Auth: TikTok profile fetch failed:', err.message);
        return { success: false, error: 'profile_fetch_failed' };
    }

    if (html.indexOf(user.tiktok_verification_code) === -1) {
        // تشخيص: طول الصفحة + أول 300 حرف + هل تبدو صفحة "تحقّق إنسان"،
        // ومحتوى og:description (يحوي البايو عادة) — للتفريق بين "المستخدم
        // ما حفظ الكود" و"تيك توك يحذف البايو من الرد".
        var looksLikeBotCheck = looksLikeTikTokBotCheck(html);
        var descriptionTag = extractMetaTagContent(html, 'og:description');
        logger.error(
            'Auth: TikTok verification code not found in fetched page for "' + tiktokUsername + '". ' +
            'html_length=' + html.length + ' looks_like_bot_check=' + looksLikeBotCheck + ' ' +
            'og_description=' + JSON.stringify(descriptionTag) + ' ' +
            'snippet=' + JSON.stringify(html.slice(0, 300).replace(/\s+/g, ' '))
        );
        return { success: false, error: 'code_not_found_in_bio' };
    }

    // نفس صفحة البروفايل المجلوبة أعلاه تُستخدَم أيضاً لاستخراج صورة/اسم
    // عرض تيك توك (meta tags og:image/og:title)، بدون طلب شبكي إضافي.
    // فشل الاستخراج لا يُفشِل التحقق — الصورة/الاسم يرجعوا null فقط.
    var avatarUrl = extractProfileAvatarFromHtml(html);
    var displayName = extractProfileDisplayNameFromHtml(html);

    db.prepare(
        // تصفير refresh token أي ربط OAuth سابق — قد يكون لحساب تيك توك ثاني.
        'UPDATE users SET tiktok_verified = 1, tiktok_username = ?, tiktok_avatar_url = ?, tiktok_display_name = ?, tiktok_refresh_token = NULL, tiktok_refresh_expires_at = NULL WHERE id = ?'
    ).run(tiktokUsername, avatarUrl, displayName, userId);

    grantFoundersMonthFrameIfEligible(userId);

    return { success: true };
}

/**
 * استخراج قيمة content من وسم <meta> يطابق property/name معيّن، بصرف
 * النظر عن ترتيب الخصائص بالوسم — بعض صفحات React Helmet SSR تضع خاصية
 * أخرى (مثل data-rh="true") قبل property بنفس الوسم. يبحث عن كامل وسم
 * <meta ...> المحتوي property="<key>" ثم يستخرج content منه بمعزل عن
 * الترتيب. لا يرمي أبداً — يرجع null عند أي فشل.
 * @param {string} html
 * @param {string} propertyKey - مثل 'og:image' أو 'og:title'
 * @returns {string|null}
 */
function extractMetaTagContent(html, propertyKey) {
    var escapedKey = propertyKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var tagRegex = new RegExp('<meta\\b[^>]*\\bproperty=["\']' + escapedKey + '["\'][^>]*>', 'i');
    var tagMatch = tagRegex.exec(html);
    if (!tagMatch) return null;

    var contentMatch = /\bcontent=["']([^"']*)["']/i.exec(tagMatch[0]);
    return (contentMatch && contentMatch[1]) ? contentMatch[1] : null;
}

var _tiktokExtractionDebugLogsRemaining = 5;
/** تسجيل تشخيصي محدود (أول 5 محاولات) — يوضّح هل HTML يحتوي وسوم og: أم لا. */
function _logTikTokExtractionDiagnostics(label, html, extractedValue) {
    if (_tiktokExtractionDebugLogsRemaining <= 0) return;
    _tiktokExtractionDebugLogsRemaining--;
    var hasAnyOgTag = /<meta\b[^>]*\bproperty=["']og:/i.test(html || '');
    logger.log(
        'Auth Service: [0.45.0 تشخيص] استخراج ' + label + ' — ' +
        'طول HTML=' + ((html && html.length) || 0) + ' ' +
        'يحتوي أي وسم og:=' + hasAnyOgTag + ' ' +
        '→ النتيجة=' + JSON.stringify(extractedValue)
    );
}

/**
 * استخراج تقريبي لرابط صورة بروفايل تيك توك من HTML صفحة البروفايل
 * العامة، عبر وسم <meta property="og:image" content="...">. لا يرمي
 * أبداً — يرجع null عند أي فشل.
 * @returns {string|null}
 */
function extractProfileAvatarFromHtml(html) {
    try {
        var value = extractMetaTagContent(html, 'og:image');
        _logTikTokExtractionDiagnostics('avatar (og:image)', html, value);
        return value;
    } catch (err) {
        return null;
    }
}

/**
 * استخراج تقريبي لاسم عرض تيك توك من HTML صفحة البروفايل العامة، عبر
 * وسم <meta property="og:title" content="...">. لا يرمي أبداً — يرجع
 * null عند أي فشل.
 * @returns {string|null}
 */
function extractProfileDisplayNameFromHtml(html) {
    try {
        var value = extractMetaTagContent(html, 'og:title');
        _logTikTokExtractionDiagnostics('display name (og:title)', html, value);
        return value;
    } catch (err) {
        return null;
    }
}

/**
 * إلغاء ربط تيك توك يدوياً من قِبل صاحب الحساب — المخرج الوحيد لإلغاء
 * الربط؛ بمجرد tiktok_verified = 1 يبقى الحساب مرتبطاً بلا إعادة تحقق دورية.
 * @param {number} userId
 * @returns {{success: boolean}}
 */
function unlinkTikTok(userId) {
    // تصفير tiktok_avatar_url/tiktok_display_name أيضاً — وإلا تبقى صورة/
    // اسم الحساب القديم عالقة لو ربط لاحقاً حساب تيك توك مختلف.
    db.prepare('UPDATE users SET tiktok_username = NULL, tiktok_verified = 0, tiktok_verification_code = NULL, tiktok_avatar_url = NULL, tiktok_display_name = NULL, tiktok_refresh_token = NULL, tiktok_refresh_expires_at = NULL WHERE id = ?').run(userId);
    return { success: true };
}

/**
 * التحقق من رمز جلسة — يُستخدَم بكل طلب محمي.
 * @returns {Object|null} بيانات المستخدم إن كانت الجلسة صالحة، وإلا null
 */
function validateSession(token) {
    if (!token) return null;
    var session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!session || session.expires_at < now()) return null;

    // تجديد تلقائي (sliding session): المستخدم النشط ما يطلع من حسابه بعد
    // 30 يوم من أول دخول — نمدّ الجلسة 30 يوم من الآن لما يبقى أقل من
    // نصف مدتها (كتابة واحدة للقاعدة كل ~15 يوم كحد أقصى، مو مع كل طلب).
    if (session.expires_at - now() < SESSION_DURATION_MS / 2) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(now() + SESSION_DURATION_MS, token);
    }

    var user = db.prepare('SELECT id, username, email, role, tiktok_username, tiktok_verified, tiktok_avatar_url, tiktok_display_name, custom_id, is_streamer, permissions, welcome_completed, account_type_chosen, email_verified FROM users WHERE id = ?').get(session.user_id);
    if (!user) return null;

    // شفاء ذاتي: حسابات أُنشئت قبل ميزة الـID العام (custom_id) قد لا
    // يكون لها واحد بعد — نولّد واحداً الآن بدل ما نتركه فارغاً.
    if (!user.custom_id) {
        user.custom_id = generatePublicId();
        db.prepare('UPDATE users SET custom_id = ? WHERE id = ?').run(user.custom_id, user.id);
    }

    user.is_streamer = Boolean(user.is_streamer);
    user.tiktok_verified = Boolean(user.tiktok_verified);
    user.permissions = JSON.parse(user.permissions || '{}');
    user.welcome_completed = Boolean(user.welcome_completed);
    user.email_verified = Boolean(user.email_verified);
    user.account_type_chosen = user.account_type_chosen === undefined ? true : Boolean(user.account_type_chosen);

    return user;
}

/**
 * الاختيار الإجباري لنوع الحساب (لاعب/استريمر) بعد أول دخول بجوجل لحساب
 * جديد كلياً. يضبط is_streamer فقط — لا يمنح صلاحية تشغيل الألعاب
 * تلقائياً، الموافقة الفعلية تبقى من الأدمن عبر can_run_games.
 * @param {number} userId - من الجلسة نفسها دائماً، لا يُمرَّر من body خام
 * @param {boolean} wantsToBeStreamer
 * @returns {{success: boolean, error?: string}}
 */
function chooseAccountType(userId, wantsToBeStreamer) {
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    db.prepare('UPDATE users SET is_streamer = ?, account_type_chosen = 1 WHERE id = ?')
        .run(wantsToBeStreamer ? 1 : 0, userId);
    return { success: true };
}

/**
 * حذف حساب نهائياً — الأدمن فقط. يحذف يدوياً كل الصفوف المرتبطة بكل
 * جدول قبل حذف صف المستخدم نفسه.
 *
 * ⚠️ حذف يدوي صريح بدل الاعتماد على `ON DELETE CASCADE` المكتوب بتعريفات
 * الجداول: `PRAGMA foreign_keys` غير مفعَّل بهذا المشروع (database.js)،
 * فكل تعريفات CASCADE خاملة فعلياً — `DELETE FROM users` وحده كان سيترك
 * صفوفاً يتيمة. لم نفعّل الـPRAGMA (قد يكسر بيانات يتيمة موجودة بالإنتاج).
 * @param {number} userId
 * @returns {{success: boolean, error?: string}}
 */
function deleteUser(userId) {
    var user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };

    // منع حذف آخر حساب أدمن — لا نظام استرجاع/تعيين أدمن آخر حالياً.
    if (user.role === 'admin') {
        var adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
        if (adminCount <= 1) return { success: false, error: 'cannot_delete_last_admin' };
    }

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM broadcasts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_frames WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_entrances WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_elim_cards WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_win_cards WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_points WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    logger.log('Auth: user permanently deleted by admin (id: ' + userId + ')');
    return { success: true };
}

/**
 * الأدمن فقط — يصفّر قيد الجهاز الواحد لستريمر معتمد. بعد التصفير، أول
 * تسجيل دخول جاي (من أي جهاز) يصير هو الجهاز المربوط الجديد.
 * @param {number} userId
 * @returns {{success: boolean, error?: string}}
 */
function adminResetDeviceLock(userId) {
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    db.prepare('UPDATE users SET bound_device_id = NULL, bound_device_ids = NULL WHERE id = ?').run(userId);
    return { success: true };
}

/**
 * الأدمن فقط — يفعّل/يطفي سماح تغيير الجهاز لمرة واحدة. يُستهلَك تلقائياً
 * بأول تسجيل دخول تالٍ من أي جهاز (منطق منفصل بدالة login).
 * @param {number} userId
 * @param {boolean} allow
 * @returns {{success: boolean, error?: string}}
 */
function adminSetAllowDeviceChange(userId, allow) {
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    db.prepare('UPDATE users SET allow_device_change = ? WHERE id = ?').run(allow ? 1 : 0, userId);
    return { success: true };
}

/**
 * الأدمن فقط — يفعّل/يطفي وضع سوبر أدمن لحساب محدد (تجاوز كامل لقيد
 * الجهاز). يدوي بحت، حساب بحساب.
 * @param {number} userId
 * @param {boolean} isSuperAdmin
 * @returns {{success: boolean, error?: string}}
 */
function adminSetSuperAdmin(userId, isSuperAdmin) {
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    db.prepare('UPDATE users SET is_super_admin = ? WHERE id = ?').run(isSuperAdmin ? 1 : 0, userId);
    return { success: true };
}

/**
 * حفلة ترحيب الستريمر الجديد — تُستدعى بعد ما يكمل الحفلة كاملة فعلياً،
 * وليس مجرد فتحها. بعدها ما تتكرر تلقائياً أبداً.
 * @param {number} userId
 */
function completeWelcome(userId) {
    db.prepare('UPDATE users SET welcome_completed = 1 WHERE id = ?').run(userId);
    return { success: true };
}

/**
 * الأدمن فقط — يصفّر حالة الترحيب لمستخدم معيّن، فتطلع له الحفلة مرة
 * وحدة إضافية بأول زيارة جاية لـindex.html، ثم تنتهي تلقائياً بعد ما
 * يكملها زي أول مرة (نفس مسار completeWelcome أعلاه).
 * @param {number} userId
 */
function resetWelcome(userId) {
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    db.prepare('UPDATE users SET welcome_completed = 0 WHERE id = ?').run(userId);
    return { success: true };
}

function logout(token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/* ----------------------------------------------------------------------
 * تتبّع البثوث والإحصائيات
 * ---------------------------------------------------------------------- */

function startBroadcast(userId, tiktokUsername) {
    var info = db.prepare(
        'INSERT INTO broadcasts (user_id, tiktok_username, started_at) VALUES (?, ?, ?)'
    ).run(userId, tiktokUsername, now());
    return info.lastInsertRowid;
}

/** endedAt اختياري — لحظة انقطاع البث الفعلية (مثلاً آخر مرة ردّ فيها
 * المتصفح) بدل لحظة اكتشاف الانقطاع، عشان وقت الانتظار ما ينحسب. */
function endBroadcast(broadcastId, endedAt) {
    db.prepare('UPDATE broadcasts SET ended_at = MAX(started_at, ?) WHERE id = ?').run(endedAt || now(), broadcastId);
}

var STAT_COLUMNS = {
    comment: 'comments_count',
    gift: 'gifts_count',
    follow: 'follows_count',
    player: 'players_joined_count'
};

/**
 * زيادة عدّاد إحصائية واحدة لبث معيّن.
 * @param {number} broadcastId
 * @param {'comment'|'gift'|'follow'|'player'} statKey
 * @param {number} [amount]
 */
function incrementBroadcastStat(broadcastId, statKey, amount) {
    var column = STAT_COLUMNS[statKey];
    if (!column || !broadcastId) return;
    db.prepare('UPDATE broadcasts SET ' + column + ' = ' + column + ' + ? WHERE id = ?')
        .run(amount || 1, broadcastId);
}

/**
 * إضافة قيمة هدية (بالماس) لإجمالي بث معيّن.
 */
function addGiftValue(broadcastId, value) {
    if (!broadcastId) return;
    db.prepare('UPDATE broadcasts SET gifts_value_total = gifts_value_total + ? WHERE id = ?')
        .run(value || 0, broadcastId);
}

/**
 * تحديث لقطة عدد المشاهدين لبث معيّن — تُستدعى من ws-server.js عند كل
 * حدث roomUser. MAX(...) بدل الكتابة المباشرة عمداً — أحداث roomUser قد
 * تصل بترتيب غير مضمون، فهذا يمنع رجوع الرقم للخلف بلقطة متأخرة الوصول.
 * @param {number} broadcastId
 * @param {number} currentViewers - عدد المشاهدين المتزامن الآن (حقل `total`)
 * @param {number} totalUsers - العدد التراكمي الكلي المرصود لحد الآن (حقل `totalUser`)
 */
function updateBroadcastViewerStats(broadcastId, currentViewers, totalUsers) {
    if (!broadcastId) return;
    db.prepare(
        `UPDATE broadcasts SET
            peak_viewers = MAX(peak_viewers, ?),
            total_unique_viewers = MAX(total_unique_viewers, ?)
         WHERE id = ?`
    ).run(Number(currentViewers) || 0, Number(totalUsers) || 0, broadcastId);
}

/**
 * إحصائيات مجمَّعة لمستخدم واحد عبر كل بثوثه (لعرضها له أو للأدمن).
 */
function getUserStats(userId) {
    var stats = db.prepare(
        `SELECT
            COUNT(*) AS total_broadcasts,
            COALESCE(SUM(comments_count), 0) AS total_comments,
            COALESCE(SUM(gifts_count), 0) AS total_gifts,
            COALESCE(SUM(gifts_value_total), 0) AS total_gifts_value,
            COALESCE(SUM(follows_count), 0) AS total_follows,
            COALESCE(SUM(players_joined_count), 0) AS total_players,
            COALESCE(SUM(total_unique_viewers), 0) AS total_views,
            COALESCE(MAX(peak_viewers), 0) AS peak_viewers
         FROM broadcasts WHERE user_id = ?`
    ).get(userId);
    // ساعات البث = وقت المباريات الفعلي فقط بعد التحويل (راجع streamer-hours.js).
    stats.total_live_ms = streamerHours.getTotalLiveMs(userId);
    return stats;
}

/**
 * أعلى الاستريمرز بعدد ساعات البث الإجمالي — لشريط الصفحة الرئيسية (عام،
 * بدون Bearer). يرجع فقط بيانات غير حساسة، يشترط حساباً موثَّقاً فعلياً
 * (tiktok_verified=1) وبث واحد مكتمل على الأقل. displayName تسقط تلقائياً
 * لاسم المستخدم لو ما عيّن الاستريمر اسم عرض بعد.
 * @param {number} [limit]
 * @returns {Array<{tiktokUsername: string, displayName: string, avatarBase64: (string|null), customId: (string|null), totalHours: number}>}
 */
// تصنيف الرئيسية أسبوعي: يبدأ من جديد كل سبت 12:00 ص بتوقيت السعودية
// (UTC+3 ثابت، بدون توقيت صيفي). أول أسبوع يبدأ من لحظة التصفير نفسها.
// ⚠️ هذا للتصنيف فقط — ساعات البروفايل ومستوى الستريمر (SP) تراكمية كاملة.
var RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
var DAY_MS = 24 * 60 * 60 * 1000;
var SATURDAY = 6; // getUTCDay()

function getRankingPeriodStart(nowMs) {
    nowMs = nowMs || now();
    var riyadh = new Date(nowMs + RIYADH_OFFSET_MS);
    var riyadhMidnight = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate());
    var daysSinceSaturday = (riyadh.getUTCDay() - SATURDAY + 7) % 7;
    var weekStart = riyadhMidnight - daysSinceSaturday * DAY_MS - RIYADH_OFFSET_MS;
    var row = db.prepare("SELECT value FROM app_settings WHERE key = 'streamer_ranking_reset_at'").get();
    var resetAt = row ? Number(row.value) || 0 : 0;
    return Math.max(weekStart, resetAt);
}

// ترتيب الاستريمرز يُطلب مع كل زيارة للرئيسية — تجميع جدول broadcasts كل
// مرة حمل بلا فايدة، فنحفظ الناتج 5 دقائق (لكل limit)، ويتجدد فوراً مع
// بداية أسبوع جديد.
var TOP_STREAMERS_CACHE_MS = 5 * 60 * 1000;
var _topStreamersCache = {};

function getTopStreamersByHours(limit) {
    limit = limit || 20;
    var periodStart = getRankingPeriodStart();
    var cached = _topStreamersCache[limit];
    if (cached && cached.periodStart === periodStart && now() - cached.at < TOP_STREAMERS_CACHE_MS) return cached.rows;
    var rows = computeTopStreamersByHours(limit, periodStart);
    _topStreamersCache[limit] = { at: now(), periodStart: periodStart, rows: rows };
    return rows;
}

function computeTopStreamersByHours(limit, periodStart) {
    // بث/مباراة بدأت قبل بداية الأسبوع وانتهت بعدها: ينحسب منها الجزء اللي
    // بعد البداية فقط. بعد التحويل: وقت المباريات فقط (راجع streamer-hours.js).
    var rows = db.prepare(
        `SELECT u.tiktok_username AS tiktokUsername, u.username, u.display_name AS displayName,
                u.avatar_image_base64 AS avatarBase64, u.custom_id AS customId,
                h.total_ms AS total_ms
         FROM users u
         JOIN (${streamerHours.HOURS_BY_USER_SQL}) h ON h.user_id = u.id
         WHERE u.tiktok_verified = 1 AND u.tiktok_username IS NOT NULL
           AND h.total_ms > 0
         ORDER BY total_ms DESC
         LIMIT @limit`
    ).all(Object.assign({ limit: limit || 20 }, streamerHours.hoursParams(periodStart)));
    return rows.map(function (r) {
        return {
            tiktokUsername: r.tiktokUsername,
            displayName: r.displayName || r.username || r.tiktokUsername,
            avatarBase64: r.avatarBase64 || null,
            customId: r.customId || null,
            totalHours: Math.round((r.total_ms / 3600000) * 10) / 10
        };
    });
}

/**
 * إحصائيات مجمَّعة عن كل الاستريمرز — لتبويب "إحصائيات الاستريمرز" بلوحة
 * الأدمن فقط. total_views مبنية على حقل totalUser من مكتبة tiktok-live-connector.
 */
function getAdminStreamerStats() {
    // الساعات من streamer-hours.js (وقت المباريات فقط بعد التحويل).
    var hp = streamerHours.hoursParams(0);
    var totals = db.prepare(
        `SELECT
            COUNT(DISTINCT u.id) AS total_streamers,
            COALESCE((SELECT SUM(h.total_ms) FROM (${streamerHours.HOURS_BY_USER_SQL}) h
                      JOIN users s ON s.id = h.user_id WHERE s.is_streamer = 1), 0) AS total_live_ms,
            COALESCE(SUM(b.total_unique_viewers), 0) AS total_views
         FROM users u LEFT JOIN broadcasts b ON b.user_id = u.id
         WHERE u.is_streamer = 1`
    ).get(hp);

    var top = db.prepare(
        `SELECT u.id, u.username, u.tiktok_username AS tiktokUsername,
                (SELECT COUNT(*) FROM broadcasts b WHERE b.user_id = u.id) AS total_broadcasts,
                h.total_ms AS total_ms,
                (SELECT COALESCE(SUM(b.total_unique_viewers), 0) FROM broadcasts b WHERE b.user_id = u.id) AS total_views
         FROM users u
         JOIN (${streamerHours.HOURS_BY_USER_SQL}) h ON h.user_id = u.id
         WHERE u.is_streamer = 1 AND h.total_ms > 0
         ORDER BY total_ms DESC
         LIMIT 10`
    ).all(hp);

    return {
        totalStreamers: totals.total_streamers,
        totalHours: Math.round((totals.total_live_ms / 3600000) * 10) / 10,
        totalViews: totals.total_views,
        topStreamers: top.map(function (r) {
            return {
                username: r.username,
                tiktokUsername: r.tiktokUsername,
                totalBroadcasts: r.total_broadcasts,
                totalHours: Math.round((r.total_ms / 3600000) * 10) / 10,
                totalViews: r.total_views
            };
        })
    };
}

/**
 * إحصائيات مجمَّعة عن كل المستخدمين (لاعبين + استريمرز) — لتبويب
 * "المستخدمون" بلوحة الأدمن. "الأكثر استخداماً" للاعبين العاديين غير
 * قابل للقياس (لا تتبّع جلسات لهم)، لذا نعرض أكثرهم حسب جولات مكتملة
 * (games_played) فقط.
 */
function getAdminUserStats() {
    var totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    var totalStreamers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_streamer = 1').get().c;
    var totalVerifiedTikTok = db.prepare('SELECT COUNT(*) AS c FROM users WHERE tiktok_verified = 1').get().c;

    var topPlayers = db.prepare(
        `SELECT u.username, u.tiktok_username AS tiktokUsername,
                COALESCE(up.games_played, 0) AS gamesPlayed,
                COALESCE(up.games_won, 0) AS gamesWon
         FROM users u
         LEFT JOIN user_points up ON up.user_id = u.id
         WHERE COALESCE(up.games_played, 0) > 0
         ORDER BY gamesPlayed DESC
         LIMIT 10`
    ).all();

    return {
        totalUsers: totalUsers,
        totalStreamers: totalStreamers,
        totalVerifiedTikTok: totalVerifiedTikTok,
        topPlayersByGamesPlayed: topPlayers
    };
}

/**
 * نسخة عامة (بدون Auth) من عدّاد الحسابات لصفحة الهبوط — تكشف فقط عدداً
 * إجمالياً، لا أسماء ولا بيانات شخصية.
 */
function getPublicPlatformStats() {
    var totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    return { totalUsers: totalUsers };
}

/**
 * تحديث اسم العرض بالبروفايل (منفصل عن username الثابت). حد أقصى 40
 * حرفاً، يُرفض الفارغ تماماً بعد trim.
 */
function updateDisplayName(userId, displayName) {
    var trimmed = (displayName || '').trim();
    if (!trimmed) return { success: false, error: 'empty_display_name' };
    if (trimmed.length > 40) return { success: false, error: 'display_name_too_long' };
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(trimmed, userId);
    return { success: true, displayName: trimmed };
}

/**
 * تغيير اسم المستخدم (username) من البروفايل — نفس المعرّف اللي يدخل فيه
 * المستخدم بشاشة تسجيل الدخول، فلازم يبقى فريداً. 3–30 خانة: حروف (أي
 * لغة) وأرقام و _ و . فقط — بدون مسافات وبدون @ (تسجيل الدخول يعامل أي
 * معرّف فيه @ كبريد إلكتروني، راجع login). الفريد بدون حساسية لحالة
 * الأحرف حتى ما يتشابه حسابين (Ali / ali). مرة وحدة كل 7 أيام.
 */
var USERNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
function updateUsername(userId, username) {
    var trimmed = (username || '').trim().replace(/^@+/, '');
    if (trimmed.length < 3) return { success: false, error: 'username_too_short' };
    if (trimmed.length > 30) return { success: false, error: 'username_too_long' };
    if (!/^[\p{L}\p{N}_.]+$/u.test(trimmed)) return { success: false, error: 'username_invalid_chars' };
    var row = db.prepare('SELECT username, username_changed_at FROM users WHERE id = ?').get(userId);
    if (!row) return { success: false, error: 'not_found' };
    if (row.username === trimmed) return { success: true, username: trimmed, nextChangeAt: row.username_changed_at ? row.username_changed_at + USERNAME_CHANGE_COOLDOWN_MS : null };
    if (row.username_changed_at && now() - row.username_changed_at < USERNAME_CHANGE_COOLDOWN_MS) {
        return { success: false, error: 'username_change_cooldown', nextChangeAt: row.username_changed_at + USERNAME_CHANGE_COOLDOWN_MS };
    }
    var taken = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(trimmed, userId);
    if (taken) return { success: false, error: 'username_taken' };
    var at = now();
    db.prepare('UPDATE users SET username = ?, username_changed_at = ? WHERE id = ?').run(trimmed, at, userId);
    return { success: true, username: trimmed, nextChangeAt: at + USERNAME_CHANGE_COOLDOWN_MS };
}

// ⚠️ يجب أن يبقى دون حد body-parser.js (MAX_BODY_BYTES = 100KB لكل جسم
// طلب HTTP) بهامش أمان لغلاف JSON — وإلا تُسقَط الاتصالات خام (ECONNRESET)
// بدل رسالة خطأ 400 واضحة. ~85KB للصورة بعد Base64 يفرض صوراً صغيرة/مضغوطة.
var MAX_AVATAR_BASE64_LENGTH = 85 * 1024;

/**
 * تحديث صورة بروفايل المستخدم — يستقبل Data URL كامل جاهز من المتصفح
 * (مثال: "data:image/png;base64,....") ويخزّنه كما هو بعد التحقق من
 * الحجم والنوع فقط، بدون أي معالجة صورة فعلية بالخادم.
 */
function updateAvatarImage(userId, dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return { success: false, error: 'empty_image' };
    if (dataUrl.length > MAX_AVATAR_BASE64_LENGTH) return { success: false, error: 'image_too_large' };
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) return { success: false, error: 'invalid_image_format' };
    db.prepare('UPDATE users SET avatar_image_base64 = ? WHERE id = ?').run(dataUrl, userId);
    return { success: true };
}

/**
 * كل المستخدمين مع إحصائياتهم المجمَّعة — للوحة الأدمن فقط.
 */
/**
 * الأدمن يغيّر إيميل أي حساب (مثلاً لاعب سجّل بإيميل وهمي ونسي كلمة
 * المرور). الإيميل الجديد لازم صحيح وغير مستخدم. يُحفظ "غير مؤكد" —
 * صاحب الحساب يطلع له تنبيه «أكّد إيميلك» بالبروفايل، وأي رمز تأكيد
 * معلّق للإيميل القديم يُلغى. رسائل «نسيت كلمة المرور» تروح للجديد فوراً.
 */
function adminSetEmail(userId, email) {
    email = (email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return { success: false, error: 'invalid_email' };
    var user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    if (user.email === email) return { success: true, email: email };
    if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId)) return { success: false, error: 'email_taken' };
    db.prepare('UPDATE users SET email = ?, email_verified = 0, email_verify_code = NULL, email_verify_target = NULL, email_verify_expires = NULL, email_verify_attempts = 0 WHERE id = ?')
        .run(email, userId);
    logger.log('Auth: admin changed email of user id=' + userId);
    return { success: true, email: email };
}

function listAllUsersWithStats() {
    var users = db.prepare('SELECT id, username, email, role, tiktok_username, tiktok_verified, custom_id, is_streamer, permissions, welcome_completed, account_type_chosen, bound_device_id, bound_device_ids, is_super_admin, allow_device_change, created_at, email_verified FROM users ORDER BY created_at ASC').all();
    return users.map(function (u) {
        // شفاء ذاتي — نفس منطق validateSession.
        if (!u.custom_id) {
            u.custom_id = generatePublicId();
            db.prepare('UPDATE users SET custom_id = ? WHERE id = ?').run(u.custom_id, u.id);
        }
        var frames = collectiblesService.getUserFrames(u.id);
        var equipped = frames.filter(function (f) { return f.equipped; })[0] || null;
        // deviceLocked: true/false فقط لعرض حالة قيد الجهاز — لا يُرسَل
        // معرّف الجهاز الفعلي (bound_device_id) للواجهة.
        var devicesCount = getBoundDevices(u).length;
        var deviceLocked = devicesCount >= MAX_STREAMER_DEVICES;
        delete u.bound_device_id;
        delete u.bound_device_ids;
        return Object.assign({}, u, {
            is_streamer: Boolean(u.is_streamer),
            permissions: JSON.parse(u.permissions || '{}'),
            welcome_completed: Boolean(u.welcome_completed),
            account_type_chosen: u.account_type_chosen === undefined ? true : Boolean(u.account_type_chosen),
            deviceLocked: deviceLocked,
            devicesCount: devicesCount,
            maxDevices: MAX_STREAMER_DEVICES,
            is_super_admin: Boolean(u.is_super_admin),
            allow_device_change: Boolean(u.allow_device_change),
            email_verified: Boolean(u.email_verified),
            stats: getUserStats(u.id),
            points: pointsService.getUserPoints(u.id),
            framesCount: frames.length,
            equippedFrame: equipped ? { frameType: equipped.frameType, frameRef: equipped.frameRef, displayNameAr: equipped.displayNameAr } : null
        });
    });
}

/**
 * قائمة الستريمرز فقط (وصول مباشر وسريع من لوحة الأدمن، بدون فلترة
 * يدوية لكل المستخدمين).
 */
function listStreamers() {
    return listAllUsersWithStats().filter(function (u) { return u.is_streamer; });
}

/**
 * منح أو سحب صلاحية محدَّدة لستريمر (مثل تشغيل الألعاب). الصلاحيات
 * مخزَّنة كـ JSON مرن — إضافة نوع صلاحية جديد مستقبلاً لا يحتاج أي
 * تعديل على هيكل قاعدة البيانات.
 * @param {number} userId
 * @param {string} permissionKey - مثل 'can_run_games'
 * @param {boolean} value
 */
function setPermission(userId, permissionKey, value) {
    var user = db.prepare('SELECT permissions FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };

    var permissions = JSON.parse(user.permissions || '{}');
    permissions[permissionKey] = Boolean(value);

    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), userId);
    return { success: true, permissions: permissions };
}

/**
 * التحقق السريع من صلاحية معيّنة لمستخدم (تُستخدَم لاحقاً قبل السماح
 * بأي إجراء محمي، مثل بدء لعبة).
 * @returns {boolean}
 */
function hasPermission(userId, permissionKey) {
    var user = db.prepare('SELECT permissions FROM users WHERE id = ?').get(userId);
    if (!user) return false;
    var permissions = JSON.parse(user.permissions || '{}');
    return Boolean(permissions[permissionKey]);
}

module.exports = {
    signup: signup,
    login: login,
    loginWithGoogle: loginWithGoogle,
    loginWithTikTok: loginWithTikTok,
    validateSession: validateSession,
    logout: logout,
    linkTikTokUsername: linkTikTokUsername,
    unlinkTikTok: unlinkTikTok,
    setCustomId: setCustomId,
    completeWelcome: completeWelcome,
    resetWelcome: resetWelcome,
    getPublicProfile: getPublicProfile,
    adminLookupUser: adminLookupUser,
    findVerifiedUserByTikTok: findVerifiedUserByTikTok,
    fetchPublicProfileHtml: fetchPublicProfileHtml,
    extractProfileAvatarFromHtml: extractProfileAvatarFromHtml,
    generateVerificationCode: generateVerificationCode,
    verifyTikTokOwnership: verifyTikTokOwnership,
    startBroadcast: startBroadcast,
    getRankingPeriodStart: getRankingPeriodStart,
    endBroadcast: endBroadcast,
    incrementBroadcastStat: incrementBroadcastStat,
    addGiftValue: addGiftValue,
    getUserStats: getUserStats,
    listAllUsersWithStats: listAllUsersWithStats,
    listStreamers: listStreamers,
    setPermission: setPermission,
    hasPermission: hasPermission,
    chooseAccountType: chooseAccountType,
    deleteUser: deleteUser,
    adminResetDeviceLock: adminResetDeviceLock,
    adminSetAllowDeviceChange: adminSetAllowDeviceChange,
    adminSetSuperAdmin: adminSetSuperAdmin,
    requestPasswordReset: requestPasswordReset,
    sendSignupCode: sendSignupCode,
    sendEmailVerification: sendEmailVerification,
    verifyEmail: verifyEmail,
    recoverAccount: recoverAccount,
    adminSetEmail: adminSetEmail,
    resetPasswordWithCode: resetPasswordWithCode,
    updateBroadcastViewerStats: updateBroadcastViewerStats,
    getTopStreamersByHours: getTopStreamersByHours,
    getAdminStreamerStats: getAdminStreamerStats,
    getAdminUserStats: getAdminUserStats,
    getPublicPlatformStats: getPublicPlatformStats,
    updateDisplayName: updateDisplayName,
    updateUsername: updateUsername,
    updateAvatarImage: updateAvatarImage
};
