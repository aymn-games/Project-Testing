/**
 * ==========================================================================
 *  AGP AUTH SERVICE — حسابات، جلسات، وتتبّع إحصائيات البثوث
 * ==========================================================================
 *
 * منطق بحت هنا (بدون أي معالجة HTTP — ذلك في طبقة الراوت لاحقاً)، حتى
 * يكون قابلاً للاختبار المباشر بمعزل عن الشبكة تماماً.
 *
 * أول حساب يُنشَأ بالنظام يصبح 'admin' تلقائياً (صاحب المنصة)؛ كل حساب
 * بعده يكون 'streamer' افتراضياً.
 * ==========================================================================
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

var SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوماً
var googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

function now() { return Date.now(); }

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * رقم عرض عام (Public ID) — رقم عشوائي من 8 أرقام على الأقل، فريد بكل
 * قاعدة البيانات. يُولَّد تلقائياً لكل حساب جديد (signup أو أول دخول
 * بجوجل)، ويُستخدم كـ custom_id الافتراضي — يبقى نفس العمود، فقط الآن
 * يُملأ تلقائياً بدل ما يُترَك فارغاً. الأدمن أو المستخدم نفسه يقدر
 * يغيّره لاحقاً عبر setCustomId (نفس الدالة أدناه، بدون أي تعديل عليها).
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
function signup(username, email, plainPassword, wantsToBeStreamer) {
    username = (username || '').trim();
    email = (email || '').trim().toLowerCase();

    if (username.length < 3) return { success: false, error: 'username_too_short' };
    if (!isValidEmail(email)) return { success: false, error: 'invalid_email' };
    if (!plainPassword || plainPassword.length < 8) return { success: false, error: 'password_too_short' };

    var existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) return { success: false, error: 'already_exists' };

    var userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    var role = userCount === 0 ? 'admin' : 'streamer'; // أول حساب = الأدمن (صاحب المنصة)
    var isStreamer = wantsToBeStreamer ? 1 : 0;

    var hash = password.hashPassword(plainPassword);
    var publicId = generatePublicId();
    var info = db.prepare(
        'INSERT INTO users (username, email, password_hash, role, is_streamer, custom_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(username, email, hash, role, isStreamer, publicId, now());

    logger.log('Auth: new user signed up: ' + username + ' (role: ' + role + ', streamer: ' + Boolean(isStreamer) + ', id: ' + publicId + ')');

    return { success: true, user: { id: info.lastInsertRowid, username: username, email: email, role: role, is_streamer: Boolean(isStreamer), custom_id: publicId, permissions: {} } };
}

/**
 * تسجيل الدخول — يُنشئ جلسة جديدة عند النجاح.
 * @returns {{success: boolean, token?: string, user?: Object, error?: string}}
 */
function login(email, plainPassword) {
    email = (email || '').trim().toLowerCase();
    var user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !password.verifyPassword(plainPassword || '', user.password_hash)) {
        return { success: false, error: 'invalid_credentials' };
    }

    var token = createSessionFor(user);

    return {
        success: true,
        token: token,
        user: {
            id: user.id, username: user.username, email: user.email, role: user.role, custom_id: user.custom_id,
            is_streamer: Boolean(user.is_streamer), permissions: JSON.parse(user.permissions || '{}')
        }
    };
}

function createSessionFor(user) {
    var token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(token, user.id, now(), now() + SESSION_DURATION_MS);
    return token;
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
 * @returns {Promise<{success: boolean, token?: string, user?: Object, error?: string}>}
 */
async function loginWithGoogle(idToken) {
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
            db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, byEmail.id);
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
            var info = db.prepare(
                'INSERT INTO users (username, email, google_id, role, custom_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(username, email, googleId, role, publicId, now());
            existing = { id: info.lastInsertRowid, username: username, email: email, role: role, custom_id: publicId };
            logger.log('Auth: new user signed up via Google: ' + username + ' (role: ' + role + ', id: ' + publicId + ')');
        }
    }

    // "existing" قد يكون صف قاعدة بيانات فعلي (permissions نص JSON،
    // is_streamer رقم 0/1) أو كائناً جديداً بُني يدوياً بالأعلى (فرع
    // الحساب الجديد كلياً، بدون هذين الحقلين إطلاقاً) — توحيد الشكل هنا
    // قبل الإرجاع بدل تكرار المنطق بكل فرع.
    var sessionToken = createSessionFor(existing);
    return {
        success: true,
        token: sessionToken,
        user: {
            id: existing.id, username: existing.username, email: existing.email, role: existing.role, custom_id: existing.custom_id,
            is_streamer: Boolean(existing.is_streamer),
            permissions: typeof existing.permissions === 'string' ? JSON.parse(existing.permissions || '{}') : (existing.permissions || {})
        }
    };
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
 * بروفايل مستخدم عبر الـID العام (custom_id) — يُستدعى من مسار عام
 * (auth-router.js لا يتطلّب تسجيل دخول لاستدعائه)، لكن الراوتر نفسه هو
 * من يقرّر أي جزء من هذا الكائن يُرسَل فعلياً للمتصفح: صاحب الحساب أو
 * الأدمن يشوفون كل شيء، أي أحد آخر يشوف فقط username/custom_id (راجع
 * handlePublicProfile في auth-router.js وdocs/CHANGELOG.md — لا عرض
 * علني لبروفايلات الآخرين بعد الآن). حقول آمنة أصلاً حتى بالإرجاع
 * الكامل: لا بريد، لا الآيدي الداخلي (id) — راجع docs/BACKEND_ARCHITECTURE.md §10.
 * @param {string} customId
 * @returns {Object|null}
 */
function getPublicProfile(customId) {
    customId = (customId || '').trim();
    if (!customId) return null;

    var user = db.prepare(
        'SELECT id, username, role, is_streamer, tiktok_username, tiktok_verified, custom_id, permissions, created_at FROM users WHERE custom_id = ?'
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
        joined_at: user.created_at,
        stats: {
            total_broadcasts: stats.total_broadcasts,
            total_gifts: stats.total_gifts,
            total_gifts_value: stats.total_gifts_value,
            total_follows: stats.total_follows,
            total_players: stats.total_players,
            total_live_ms: stats.total_live_ms
        },
        // نظام النقاط/المستويات + المقتنيات (إطارات + دخولية) — راجع
        // backend/points/points-service.js وbackend/collectibles/collectibles-service.js.
        // handlePublicProfile في auth-router.js هو من يقرر إرسال هذا الحقل
        // أصلاً (صاحب الحساب أو الأدمن فقط)؛ هذا الملف لا يعرف شيئاً عن
        // تلك القاعدة، فقط يُرفِق البيانات لو الكائن كامل سيُرسَل.
        points: pointsService.getUserPoints(user.id),
        frames: collectiblesService.getUserFrames(user.id),
        entrance: collectiblesService.getEntrance(user.id)
    };
}

/**
 * إيجاد حساب مسجَّل بالمنصة له يوزرنيم تيك توك **موثَّق فعلياً**
 * (tiktok_verified = 1) يطابق الاسم المُمرَّر — يُستخدَم لربط مشاركة
 * لاعب بجولة (معروف فقط بيوزرنيم تيك توك من لوحة الستريمر) بحساب فعلي
 * على المنصة لمنحه نقاطاً (راجع backend/points/points-service.js). مطابقة
 * غير حساسة لحالة الأحرف (تيك توك نفسه غير حساس لحالة الأحرف).
 * @param {string} tiktokUsername
 * @returns {{id: number}|null}
 */
function findVerifiedUserByTikTok(tiktokUsername) {
    tiktokUsername = (tiktokUsername || '').trim();
    if (!tiktokUsername) return null;
    return db.prepare(
        'SELECT id FROM users WHERE tiktok_verified = 1 AND LOWER(tiktok_username) = LOWER(?)'
    ).get(tiktokUsername) || null;
}

/* ----------------------------------------------------------------------
 * التحقق من ملكية حساب تيك توك عبر كود مؤقّت بالبايو
 * ----------------------------------------------------------------------
 * ⚠️ ملاحظة صريحة: الجزء الذي يجلب صفحة البروفايل العامة من تيك توك
 *   (verifyTikTokOwnership أدناه) **لم يُختبَر فعلياً ضد تيك توك حقيقي**
 *   من هذه البيئة (لا يوجد وصول شبكي لـ tiktok.com من بيئة التطوير
 *   هذه، تماماً كما حدث سابقاً مع موصِّل تيك توك نفسه). الكود مكتوب
 *   بأفضل ما هو معروف عن بنية صفحة البروفايل العامة، لكن يحتاج اختباراً
 *   حقيقياً على بيئتك قبل الاعتماد عليه كاملاً.
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
 * جلب HTML صفحة بروفايل تيك توك العامة كنص خام.
 * @returns {Promise<string>}
 */
function fetchPublicProfileHtml(tiktokUsername) {
    return new Promise(function (resolve, reject) {
        var url = 'https://www.tiktok.com/@' + encodeURIComponent(tiktokUsername);
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
            if (res.statusCode !== 200) {
                reject(new Error('profile_fetch_failed_status_' + res.statusCode));
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
        return { success: false, error: 'code_not_found_in_bio' };
    }

    db.prepare('UPDATE users SET tiktok_verified = 1, tiktok_username = ? WHERE id = ?').run(tiktokUsername, userId);
    return { success: true };
}

/**
 * إلغاء ربط تيك توك يدوياً من قِبل صاحب الحساب نفسه. التحقق (unlink)
 * لا يحدث تلقائياً أبداً بأي مكان آخر في هذا الملف — بمجرد
 * `tiktok_verified = 1` يبقى الحساب "مرتبط" للأبد بلا حاجة لأي إعادة
 * تحقق دورية، حتى لو المستخدم شال الكود من بايو حسابه بتيك توك بعد ما
 * تحقق مرة وحدة. هذه الدالة هي المخرج الوحيد لإلغاء الربط.
 * @param {number} userId
 * @returns {{success: boolean}}
 */
function unlinkTikTok(userId) {
    db.prepare('UPDATE users SET tiktok_username = NULL, tiktok_verified = 0, tiktok_verification_code = NULL WHERE id = ?').run(userId);
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

    var user = db.prepare('SELECT id, username, email, role, tiktok_username, custom_id, is_streamer, permissions FROM users WHERE id = ?').get(session.user_id);
    if (!user) return null;

    // شفاء ذاتي: حسابات أُنشئت قبل ميزة الـID العام (custom_id) قد لا
    // يكون لها واحد بعد — نولّد واحداً الآن بدل ما نتركه فارغاً.
    if (!user.custom_id) {
        user.custom_id = generatePublicId();
        db.prepare('UPDATE users SET custom_id = ? WHERE id = ?').run(user.custom_id, user.id);
    }

    user.is_streamer = Boolean(user.is_streamer);
    user.permissions = JSON.parse(user.permissions || '{}');

    return user;
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

function endBroadcast(broadcastId) {
    db.prepare('UPDATE broadcasts SET ended_at = ? WHERE id = ?').run(now(), broadcastId);
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
 * إحصائيات مجمَّعة لمستخدم واحد عبر كل بثوثه (لعرضها له أو للأدمن).
 */
function getUserStats(userId) {
    return db.prepare(
        `SELECT
            COUNT(*) AS total_broadcasts,
            COALESCE(SUM(comments_count), 0) AS total_comments,
            COALESCE(SUM(gifts_count), 0) AS total_gifts,
            COALESCE(SUM(gifts_value_total), 0) AS total_gifts_value,
            COALESCE(SUM(follows_count), 0) AS total_follows,
            COALESCE(SUM(players_joined_count), 0) AS total_players,
            COALESCE(SUM(CASE WHEN ended_at IS NOT NULL THEN ended_at - started_at ELSE 0 END), 0) AS total_live_ms
         FROM broadcasts WHERE user_id = ?`
    ).get(userId);
}

/**
 * كل المستخدمين مع إحصائياتهم المجمَّعة — للوحة الأدمن فقط.
 */
function listAllUsersWithStats() {
    var users = db.prepare('SELECT id, username, email, role, tiktok_username, tiktok_verified, custom_id, is_streamer, permissions, created_at FROM users ORDER BY created_at ASC').all();
    return users.map(function (u) {
        // شفاء ذاتي — نفس منطق validateSession، حتى تظهر لوحة الأدمن
        // دائماً IDً لكل حساب حتى القديم منه قبل هذه الميزة.
        if (!u.custom_id) {
            u.custom_id = generatePublicId();
            db.prepare('UPDATE users SET custom_id = ? WHERE id = ?').run(u.custom_id, u.id);
        }
        var frames = collectiblesService.getUserFrames(u.id);
        var equipped = frames.filter(function (f) { return f.equipped; })[0] || null;
        return Object.assign({}, u, {
            is_streamer: Boolean(u.is_streamer),
            permissions: JSON.parse(u.permissions || '{}'),
            stats: getUserStats(u.id),
            // للوحة الأدمن فقط (جدول المستخدمين) — نفس بيانات النقاط/
            // المقتنيات المُرفَقة في getPublicProfile، لكن هنا لكل المستخدمين
            // دفعة واحدة بدل طلب منفصل لكل بروفايل.
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
    validateSession: validateSession,
    logout: logout,
    linkTikTokUsername: linkTikTokUsername,
    unlinkTikTok: unlinkTikTok,
    setCustomId: setCustomId,
    getPublicProfile: getPublicProfile,
    findVerifiedUserByTikTok: findVerifiedUserByTikTok,
    generateVerificationCode: generateVerificationCode,
    verifyTikTokOwnership: verifyTikTokOwnership,
    startBroadcast: startBroadcast,
    endBroadcast: endBroadcast,
    incrementBroadcastStat: incrementBroadcastStat,
    addGiftValue: addGiftValue,
    getUserStats: getUserStats,
    listAllUsersWithStats: listAllUsersWithStats,
    listStreamers: listStreamers,
    setPermission: setPermission,
    hasPermission: hasPermission
};
