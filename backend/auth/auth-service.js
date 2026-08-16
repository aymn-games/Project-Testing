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
var streamerLevelService = require('../points/streamer-level-service');

var SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوماً
var googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

function now() { return Date.now(); }

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ----------------------------------------------------------------------
 * [0.45.7→0.45.8] إطار "من البداية" الحصري — راجع js/agp-player-card.js:
 * FRAME_TEMPLATES['frame-founders-month.png'] لقياسات الإطار نفسه.
 *
 * ⚠️ [0.45.8] تصحيح شرط المنح بطلب صريح من صاحب المنصة — الشرط الآن
 * **مركَّب من قيدين معاً، أيهما يتحقق أولاً يوقف العرض**:
 *   1. زمني: يجب أن يحصل التسجيل + التوثيق قبل FOUNDERS_MONTH_CUTOFF_MS
 *      (تاريخ ثابت مكتوب صراحة، لا حساب ديناميكي "شهر من التشغيل").
 *   2. عددي: أول FOUNDERS_MONTH_MAX_GRANTS حساباً فقط (مو أي عدد بعدها).
 *
 * **تغيّر جوهري عن [0.45.7]**: المنح لم يعد يحصل وقت التسجيل مباشرة —
 * صار يحصل فقط عند **نجاح توثيق تيك توك فعلياً** (verifyTikTokOwnership
 * أدناه)، لأن الشرط صراحة "يسجّل **و** يوثّق حسابه" — تسجيل وحده غير
 * كافٍ. حساب يسجّل ولا يوثّق تيك توك أبداً لا يحصل على الإطار إطلاقاً،
 * بصرف النظر عن تاريخ تسجيله.
 *
 * ⚠️ ملاحظة صادقة: هذا يخص فقط حسابات تسجّل/توثّق **من هذا الإصدار
 * فصاعداً** — أي حساب موثَّق تيك توك مسبقاً (قبل رفع هذا الكود) لا يُمنح
 * الإطار بأثر رجعي، حتى لو كان من أوائل حسابات المنصة تاريخياً. لو تبي
 * تشمل حسابات قديمة موثَّقة أصلاً، هذا يحتاج قراراً ومنحاً يدوياً منفصلاً
 * (عبر admin-settings.html)، مو جزءاً من هذا المنطق التلقائي.
 * ---------------------------------------------------------------------- */
var FOUNDERS_MONTH_FRAME_FILENAME = 'frame-founders-month.png';
var FOUNDERS_MONTH_DISPLAY_NAME_AR = 'من البداية';
var FOUNDERS_MONTH_CUTOFF_MS = Date.parse('2026-09-15T00:00:00Z'); // شهر واحد من [0.45.7]
var FOUNDERS_MONTH_MAX_GRANTS = 100; // [0.45.8]

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
 * [0.45.8] عدد المرات اللي مُنح فيها إطار "من البداية" حتى الآن (لكل
 * حسابات المنصة) — يُستخدَم لفرض سقف الـ100 شخص.
 * @param {number} frameId
 * @returns {number}
 */
function countFoundersMonthGrants(frameId) {
    return db.prepare(
        "SELECT COUNT(*) AS c FROM user_frames WHERE frame_type = 'custom' AND frame_ref = ?"
    ).get(String(frameId)).c;
}

/**
 * [0.45.8] يمنح إطار "من البداية" ويفعّله تلقائياً (equip) — يُستدعى
 * **حصراً من verifyTikTokOwnership عند نجاح التوثيق فعلياً** (راجع
 * التعليق أعلى الملف لسبب هذا التغيير عن [0.45.7]). فحص مزدوج قبل أي
 * منح: (1) لسا قبل تاريخ الانتهاء، (2) لسا تحت سقف الـ100. **كل الفحص
 * والمنح هنا متزامن بالكامل (بدون أي await بينهما)** — عمداً، لتفادي
 * أي Race Condition بين توثيقين متزامنين يشوفان نفس العدّاد ويتجاوزان
 * الـ100 معاً (Node أحادي الخيط، فلا كود آخر يشتغل بين استعلامَي العدّ
 * والإدراج طالما ما فيه await بينهما).
 * @param {number} userId
 */
function grantFoundersMonthFrameIfEligible(userId) {
    if (now() > FOUNDERS_MONTH_CUTOFF_MS) return;
    var frameId = ensureFoundersMonthCustomFrameId();
    if (!frameId) return;

    // لو مُنح له مسبقاً (مثال: أعاد توثيق حسابه مرة ثانية) — لا تحسبه
    // مرتين ولا تعيد المنح.
    var already = db.prepare(
        "SELECT id FROM user_frames WHERE user_id = ? AND frame_type = 'custom' AND frame_ref = ?"
    ).get(userId, String(frameId));
    if (already) return;

    if (countFoundersMonthGrants(frameId) >= FOUNDERS_MONTH_MAX_GRANTS) return;

    var result = collectiblesService.grantFrame(userId, 'custom', frameId, { grantedBy: 'auto_founders_month' });
    if (result.success) collectiblesService.setEquipped(userId, 'custom', frameId);
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

    // [0.45.8] عرض "من البداية" الحصري لم يعد يُمنح هنا (وقت التسجيل) —
    // صار يُمنح فقط عند نجاح توثيق تيك توك فعلياً، راجع verifyTikTokOwnership
    // أدناه والتعليق أعلى الملف لسبب هذا التغيير عن [0.45.7].

    return { success: true, user: { id: info.lastInsertRowid, username: username, email: email, role: role, is_streamer: Boolean(isStreamer), custom_id: publicId, permissions: {} } };
}

/**
 * ⚠️ [0.45.6] قيد جهاز واحد لحسابات الستريمر المعتمدين فقط (can_run_games
 * = true — نفس المعيار المستخدم بكل مكان آخر بالمشروع لـ"استريمر معتمد
 * فعلياً"، راجع canPlayGames بـauth/auth-client.js). لا قيد إطلاقاً على
 * حسابات اللاعبين العاديين أو الستريمرز اللي لسا الأدمن ما وافق عليهم.
 *
 * ⚠️ ملاحظة صادقة صريحة (نفس أسلوب التوثيق بكل هذا المشروع): هذا قيد
 * "ناعم" (soft) لا "صلب" (hard) — الجهاز يُعرَّف برقم عشوائي يُولَّد
 * ويُخزَّن بـlocalStorage بالمتصفح (راجع auth/auth-client.js:
 * getDeviceId)، **مو بصمة جهاز حقيقية (Hardware Fingerprint)** — المتصفح
 * أصلاً لا يسمح بالوصول لمعرّف جهاز ثابت حقيقي لأسباب خصوصية، ولا توجد
 * طريقة أخرى متاحة من صفحة ويب عادية (بدون تطبيق أصلي/Native App). يعني
 * عملياً: أي شخص يمسح بيانات المتصفح (localStorage) أو يستخدم متصفحاً
 * مختلفاً أو وضع تصفح خفي على **نفس جهازه الفعلي** يقدر يتحايل على القيد.
 * هذا ليس خللاً بالتنفيذ — أقصى حماية ممكنة تقنياً بهذا السياق، لا وعد
 * زائف بحماية أقوى مما هو فعلياً موجود.
 * @param {Object} user - صف قاعدة بيانات كامل (permissions لسا نص JSON خام)
 * @param {string|null|undefined} deviceId
 * @returns {{allowed: boolean, bind?: boolean}}
 */
function checkDeviceLock(user, deviceId) {
    var isApprovedStreamer = Boolean(JSON.parse(user.permissions || '{}').can_run_games);
    if (!isApprovedStreamer) return { allowed: true };
    if (!user.bound_device_id) return { allowed: true, bind: true };
    if (!deviceId || deviceId !== user.bound_device_id) return { allowed: false };
    return { allowed: true };
}

/**
 * تسجيل الدخول — يُنشئ جلسة جديدة عند النجاح.
 * @param {string} email
 * @param {string} plainPassword
 * @param {string} [deviceId] - [0.45.6] معرّف الجهاز من auth-client.js —
 *   يُستخدَم فقط لو الحساب ستريمر معتمد (raجع checkDeviceLock أعلاه).
 * @returns {{success: boolean, token?: string, user?: Object, error?: string}}
 */
function login(email, plainPassword, deviceId) {
    email = (email || '').trim().toLowerCase();
    var user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !password.verifyPassword(plainPassword || '', user.password_hash)) {
        return { success: false, error: 'invalid_credentials' };
    }

    var deviceCheck = checkDeviceLock(user, deviceId);
    if (!deviceCheck.allowed) return { success: false, error: 'device_locked' };
    if (deviceCheck.bind && deviceId) {
        db.prepare('UPDATE users SET bound_device_id = ? WHERE id = ?').run(deviceId, user.id);
    }

    var token = createSessionFor(user);

    return {
        success: true,
        token: token,
        user: {
            id: user.id, username: user.username, email: user.email, role: user.role, custom_id: user.custom_id,
            is_streamer: Boolean(user.is_streamer), permissions: JSON.parse(user.permissions || '{}'),
            account_type_chosen: user.account_type_chosen === undefined ? true : Boolean(user.account_type_chosen)
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
 * @param {string} [deviceId] - [0.45.6] معرّف الجهاز من auth-client.js —
 *   نفس شرط checkDeviceLock بدالة login أعلاه (يؤثر فقط على ستريمر معتمد).
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
            // ⚠️ [0.45.6] account_type_chosen = 0 صراحة (خلافاً لقيمة العمود
            // الافتراضية 1 بقاعدة البيانات) — حساب جوجل جديد كلياً **لازم**
            // يختار لاعب/استريمر يدوياً بخطوة إجبارية بعد الدخول مباشرة (راجع
            // choose-account-type.html)، بدل الافتراض الصامت القديم "لاعب"
            // بدون علم صاحب الحساب. راجع docs/CHANGELOG.md [0.45.6].
            var info = db.prepare(
                'INSERT INTO users (username, email, google_id, role, custom_id, created_at, account_type_chosen) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(username, email, googleId, role, publicId, now(), 0);
            existing = { id: info.lastInsertRowid, username: username, email: email, role: role, custom_id: publicId, account_type_chosen: 0 };
            logger.log('Auth: new user signed up via Google: ' + username + ' (role: ' + role + ', id: ' + publicId + ') — account type choice pending');

            // [0.45.8] عرض "من البداية" لم يعد يُمنح هنا — راجع التعليق
            // أعلى الملف (يُمنح فقط عند نجاح توثيق تيك توك).
        }
    }

    // [0.45.6] قيد الجهاز الواحد يُطبَّق هنا أيضاً (نفس دالة checkDeviceLock
    // المستخدمة بـlogin العادي) — يعمل فقط لو الحساب ستريمر معتمد فعلاً
    // (can_run_games)، بصرف النظر عن طريقة الدخول (كلمة مرور أو جوجل).
    var deviceCheck = checkDeviceLock(
        Object.assign({ permissions: '{}' }, existing, {
            permissions: typeof existing.permissions === 'string' ? existing.permissions : JSON.stringify(existing.permissions || {})
        }),
        deviceId
    );
    if (!deviceCheck.allowed) return { success: false, error: 'device_locked' };
    if (deviceCheck.bind && deviceId) {
        db.prepare('UPDATE users SET bound_device_id = ? WHERE id = ?').run(deviceId, existing.id);
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
            permissions: typeof existing.permissions === 'string' ? JSON.parse(existing.permissions || '{}') : (existing.permissions || {}),
            account_type_chosen: existing.account_type_chosen === undefined ? true : Boolean(existing.account_type_chosen)
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
        // ⚠️ [جديد — 0.44.0] تُلتقَط لحظة نجاح التحقق فقط (verifyTikTokOwnership
        // أدناه)، من نفس صفحة البروفايل العامة، استخراج تقريبي (meta tags) —
        // قد ترجع null لو تعذّر الاستخراج، بدون أي أثر على صحة التحقق نفسه.
        tiktok_avatar_url: user.tiktok_verified ? (user.tiktok_avatar_url || null) : null,
        tiktok_display_name: user.tiktok_verified ? (user.tiktok_display_name || null) : null,
        // [0.45.10] اسم عرض + صورة بروفايل يعدّلهما المستخدم بنفسه —
        // منفصلان تماماً عن username (ثابت) وtiktok_display_name/
        // tiktok_avatar_url (من تيك توك). راجع updateDisplayName/
        // updateAvatarImage أدناه.
        display_name: user.display_name || null,
        avatar_image_base64: user.avatar_image_base64 || null,
        joined_at: user.created_at,
        stats: {
            total_broadcasts: stats.total_broadcasts,
            total_comments: stats.total_comments, // [0.45.0] كانت محسوبة بـgetUserStats لكن غير مُرفَقة هنا
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
        entrance: collectiblesService.getEntrance(user.id),
        // [0.45.0] مستوى الستريمر (SP) — راجع backend/points/streamer-level-service.js.
        // بنفس بوابة الخصوصية على "points" أعلاه بالضبط (handlePublicProfile
        // بـauth-router.js يقرر إرسالها فقط لصاحب الحساب أو الأدمن).
        streamerLevel: streamerLevelService.getStreamerLevelInfo(user.id)
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
    // [0.45.6] "= ? COLLATE NOCASE" بدل LOWER(tiktok_username) = LOWER(?) —
    // نفس نتيجة المطابقة (غير حساسة لحالة الأحرف) لكن قابلة لاستخدام فهرس
    // idx_users_tiktok_username_nocase (راجع backend/db/database.js)، خلافاً
    // لِلف العمود بـLOWER() اللي يُبطِل أي فهرس عادي ويفرض مسحاً تسلسلياً
    // كاملاً لجدول users على كل استدعاء — هذا يُستدعى لكل تعليق وارد بالشات.
    return db.prepare(
        'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
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
        // ⚠️ [0.44.1] هيدرز أشبه بمتصفح حقيقي — تيك توك معروف بحجب/تقديم
        // صفحة تحقّق-من-إنك-إنسان (بدل البروفايل الحقيقي) لطلبات فيها
        // هيدرز واضحة إنها من سكربت/سيرفر لا متصفح. هذا يقلّل احتمال
        // الحجب لكنه **ما يضمنه كلياً** — راجع الملاحظة الصادقة بأعلى الملف.
        var headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
        };
        https.get(url, { headers: headers }, function (res) {
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
        // ⚠️ [جديد — 0.44.1] تشخيص حقيقي بدل التخمين: نطبع بسجلات الخادم
        // طول الصفحة المستلَمة فعلياً + أول 300 حرف منها، ونعلّم لو فيها
        // كلمات دلالية معروفة لصفحات "تحقّق من إنك إنسان" بتيك توك. هذا
        // يخلينا نشوف بالضبط وش رجع تيك توك فعلياً بدل ما نفترض.
        var looksLikeBotCheck = /verify you.{0,20}human|captcha|are you a robot|please enable javascript/i.test(html);
        logger.error(
            'Auth: TikTok verification code not found in fetched page for "' + tiktokUsername + '". ' +
            'html_length=' + html.length + ' looks_like_bot_check=' + looksLikeBotCheck + ' ' +
            'snippet=' + JSON.stringify(html.slice(0, 300).replace(/\s+/g, ' '))
        );
        return { success: false, error: 'code_not_found_in_bio' };
    }

    // ⚠️ [جديد — 0.44.0] نفس صفحة البروفايل المجلوبة أعلاه للتحقق من
    // الكود تُستخدَم أيضاً لاستخراج صورة/اسم عرض تيك توك — بدون أي طلب
    // شبكي إضافي. استخراج تقريبي عبر meta tags (og:image/og:title) —
    // **غير مؤكَّد بالكامل ولم يُختبَر ضد تيك توك حقيقي** من هذه البيئة
    // (نفس تحفّظ verifyTikTokOwnership نفسها أعلاه). فشل الاستخراج هنا
    // لا يُفشِل التحقق نفسه إطلاقاً — يبقى الحساب موثَّقاً بأي حال، فقط
    // الصورة/الاسم يرجعوا null ويُعرَض بديل افتراضي بالواجهة.
    var avatarUrl = extractProfileAvatarFromHtml(html);
    var displayName = extractProfileDisplayNameFromHtml(html);

    db.prepare(
        'UPDATE users SET tiktok_verified = 1, tiktok_username = ?, tiktok_avatar_url = ?, tiktok_display_name = ? WHERE id = ?'
    ).run(tiktokUsername, avatarUrl, displayName, userId);

    // [0.45.8] عرض "من البداية" الحصري — نقطة المنح الوحيدة الآن (بعد
    // التوثيق الفعلي، لا وقت التسجيل) — راجع التعليق أعلى الملف.
    grantFoundersMonthFrameIfEligible(userId);

    return { success: true };
}

/**
 * [0.45.0] استخراج قيمة content من وسم <meta> يطابق property/name معيّن،
 * **بصرف النظر عن ترتيب الخصائص بالوسم**. الإصدار القديم كان يفترض
 * ترتيباً ثابتاً (property أولاً ثم content مباشرة)، وهذا يفشل بصمت لو
 * تيك توك (أو أي React SSR — علامته المعتادة سمة data-rh) وضع خاصية
 * أخرى (مثل data-rh="true") قبل property بنفس الوسم — نمط شائع جداً في
 * صفحات React Helmet SSR. هذا الإصدار يبحث أولاً عن كامل وسم <meta ...>
 * الذي يحتوي property="<key>" (بأي مكان بالوسم)، ثم يستخرج content منه
 * بمعزل عن الترتيب. لا يرمي أبداً — يرجع null عند أي فشل.
 *
 * ⚠️ ملاحظة صادقة: هذا تحسين مبني على سبب فشل معروف وشائع (اختلاف ترتيب
 * الخصائص)، لكن **لم يُختبَر بعد ضد تيك توك حقيقي** من هذه البيئة (لا
 * وصول شبكي لتيك توك هنا، نفس تحفّظ verifyTikTokOwnership وباقي
 * استخراجات تيك توك بالمشروع). لو تيك توك أصلاً لا يُرسِل وسوم og:image/
 * og:title لطلبات غير المتصفح (User-Agent غير حقيقي)، هذا الإصلاح وحده
 * لن يكفي — سجل التشخيص أدناه (أول 5 محاولات فقط) سيوضّح ذلك مباشرة
 * بسجلات الخادم بعد الرفع.
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
/**
 * تسجيل تشخيصي محدود (أول 5 محاولات استخراج فقط، بنفس أسلوب
 * _extractUserDebugLogsRemaining بـtiktok-connector.js) — يوضّح هل HTML
 * المجلوب فعلياً يحتوي وسوم og: من الأساس أم لا، بدل التخمين لاحقاً.
 */
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
 * إلغاء ربط تيك توك يدوياً من قِبل صاحب الحساب نفسه. التحقق (unlink)
 * لا يحدث تلقائياً أبداً بأي مكان آخر في هذا الملف — بمجرد
 * `tiktok_verified = 1` يبقى الحساب "مرتبط" للأبد بلا حاجة لأي إعادة
 * تحقق دورية، حتى لو المستخدم شال الكود من بايو حسابه بتيك توك بعد ما
 * تحقق مرة وحدة. هذه الدالة هي المخرج الوحيد لإلغاء الربط.
 * @param {number} userId
 * @returns {{success: boolean}}
 */
function unlinkTikTok(userId) {
    // ⚠️ [0.44.0] تصفير tiktok_avatar_url/tiktok_display_name أيضاً — وإلا
    // تبقى صورة/اسم الحساب القديم عالقة لو ربط لاحقاً حساب تيك توك مختلف.
    db.prepare('UPDATE users SET tiktok_username = NULL, tiktok_verified = 0, tiktok_verification_code = NULL, tiktok_avatar_url = NULL, tiktok_display_name = NULL WHERE id = ?').run(userId);
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

    // ⚠️ [إصلاح باگ حقيقي — 0.44.0] tiktok_verified وtiktok_avatar_url/
    // tiktok_display_name كانوا غايبين تماماً عن هذا الاستعلام — أي كود
    // مستقبلي يعتمد على AGPAuth.me().tiktok_verified كان بيشوفه دائماً
    // undefined (يعني "غير موثَّق") حتى لو الحساب موثَّق فعلياً بقاعدة
    // البيانات. profile.html نفسها ما تأثّرت (تستخدم getPublicProfile
    // أدناه، اللي كان صحيحاً أصلاً)، لكن هذا كان قنبلة موقوتة لأي واجهة
    // ثانية تعتمد على /api/auth/me مباشرة.
    var user = db.prepare('SELECT id, username, email, role, tiktok_username, tiktok_verified, tiktok_avatar_url, tiktok_display_name, custom_id, is_streamer, permissions, welcome_completed, account_type_chosen FROM users WHERE id = ?').get(session.user_id);
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
    user.account_type_chosen = user.account_type_chosen === undefined ? true : Boolean(user.account_type_chosen);

    return user;
}

/**
 * [0.45.6] الاختيار الإجباري لنوع الحساب (لاعب/استريمر) بعد أول دخول
 * بجوجل لحساب جديد كلياً — راجع loginWithGoogle وchoose-account-type.html.
 * نفس أثر مربع الاختيار wantsToBeStreamer وقت التسجيل العادي بالضبط
 * (يضبط is_streamer فقط — **لا يمنح صلاحية تشغيل الألعاب تلقائياً**،
 * الموافقة الفعلية تبقى من الأدمن عبر can_run_games كما كان دائماً).
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
 * [0.45.6] حذف حساب نهائياً — الأدمن فقط (زر "حذف الحساب" بـadmin.html،
 * لكل من الستريمرز واللاعبين). يحذف يدوياً كل الصفوف المرتبطة بكل جدول
 * قبل حذف صف المستخدم نفسه.
 *
 * ⚠️ **سبب الحذف اليدوي الصريح بدل الاعتماد على `ON DELETE CASCADE`
 * المكتوب أصلاً بتعريفات الجداول** (sessions/broadcasts/user_frames/
 * user_entrances/user_points كلها REFERENCES users(id) ON DELETE CASCADE):
 * تحقّقت من backend/db/database.js — **`PRAGMA foreign_keys` غير مفعَّل
 * إطلاقاً بهذا المشروع** (SQLite يترك قيود المفاتيح الأجنبية معطَّلة
 * افتراضياً ما لم يُفعَّل هذا الـPRAGMA صراحة لكل اتصال، وهو غير موجود
 * بـdatabase.js). يعني عملياً: كل تعريفات `ON DELETE CASCADE` الحالية
 * **خاملة تماماً** ولا تُنفَّذ فعلياً — حذف مستخدم بـ`DELETE FROM users`
 * وحده كان سيترك صفوفاً يتيمة (Orphan Rows) بكل تلك الجداول. لم ألمس
 * PRAGMA foreign_keys نفسه (تفعيله الآن قد يكسر أي بيانات يتيمة موجودة
 * فعلياً بالإنتاج من قبل هذا الإصدار)، فقط أضفت حذفاً يدوياً صريحاً هنا
 * يغطي نفس الأثر بأمان تام بغض النظر عن حالة الـPRAGMA.
 * @param {number} userId
 * @returns {{success: boolean, error?: string}}
 */
function deleteUser(userId) {
    var user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };

    // منع حذف آخر حساب أدمن بالمنصة — لو انحذف بالغلط ما تبقى أي طريقة
    // دخول للوحة الأدمن إطلاقاً (لا نظام استرجاع/تعيين أدمن آخر حالياً).
    if (user.role === 'admin') {
        var adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
        if (adminCount <= 1) return { success: false, error: 'cannot_delete_last_admin' };
    }

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM broadcasts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_frames WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_entrances WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_points WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    logger.log('Auth: user permanently deleted by admin (id: ' + userId + ')');
    return { success: true };
}

/**
 * [0.45.6] الأدمن فقط — يصفّر قيد الجهاز الواحد لستريمر معتمد (صمام أمان
 * لو الستريمر غيّر جهازه فعلاً بشكل مشروع — جهاز جديد، فورمات، إلخ) —
 * راجع checkDeviceLock أعلاه. بعد التصفير، أول تسجيل دخول جاي (من أي
 * جهاز) يصير هو الجهاز المربوط الجديد تلقائياً.
 * @param {number} userId
 * @returns {{success: boolean, error?: string}}
 */
function adminResetDeviceLock(userId) {
    var user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'user_not_found' };
    db.prepare('UPDATE users SET bound_device_id = NULL WHERE id = ?').run(userId);
    return { success: true };
}

/**
 * حفلة ترحيب الستريمر الجديد (راجع docs/CHANGELOG.md) — تُستدعى ذاتياً
 * من صاحب الحساب بعد ما يكمل الحفلة كاملة فعلياً (سلايدات + قص الشريطة
 * + العد التنازلي)، وليس مجرد فتحها. بعدها ما تتكرر تلقائياً أبداً.
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
 * [0.45.10] تحديث لقطة عدد المشاهدين لبث معيّن — تُستدعى من ws-server.js
 * عند كل حدث roomUser حقيقي من تيك توك (راجع onViewerUpdate بـ
 * tiktok-connector.js). MAX(...) بدل الكتابة المباشرة عمداً — أحداث
 * roomUser قد تصل بترتيب غير مضمون 100%، فهذا يمنع رجوع الرقم للخلف
 * سهواً بلقطة متأخرة الوصول لكن أقدم زمنياً.
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
    return db.prepare(
        `SELECT
            COUNT(*) AS total_broadcasts,
            COALESCE(SUM(comments_count), 0) AS total_comments,
            COALESCE(SUM(gifts_count), 0) AS total_gifts,
            COALESCE(SUM(gifts_value_total), 0) AS total_gifts_value,
            COALESCE(SUM(follows_count), 0) AS total_follows,
            COALESCE(SUM(players_joined_count), 0) AS total_players,
            COALESCE(SUM(CASE WHEN ended_at IS NOT NULL THEN ended_at - started_at ELSE 0 END), 0) AS total_live_ms,
            COALESCE(SUM(total_unique_viewers), 0) AS total_views,
            COALESCE(MAX(peak_viewers), 0) AS peak_viewers
         FROM broadcasts WHERE user_id = ?`
    ).get(userId);
}

/**
 * [0.45.10] أعلى الاستريمرز بعدد ساعات البث الإجمالي — لشريط الصفحة
 * الرئيسية (عام، بدون Bearer). يرجع فقط بيانات غير حساسة: يوزرنيم
 * تيك توك + إجمالي الساعات — لا بريد، لا id داخلي، لا أي بيانات حساب.
 * يشترط حساباً موثَّقاً فعلياً (tiktok_verified=1) وله يوزرنيم مسجَّل،
 * وبث واحد مكتمل (ended_at IS NOT NULL) على الأقل.
 * @param {number} [limit]
 * @returns {Array<{tiktokUsername: string, totalHours: number}>}
 */
function getTopStreamersByHours(limit) {
    var rows = db.prepare(
        `SELECT u.tiktok_username AS tiktokUsername,
                COALESCE(SUM(CASE WHEN b.ended_at IS NOT NULL THEN b.ended_at - b.started_at ELSE 0 END), 0) AS total_ms
         FROM users u
         JOIN broadcasts b ON b.user_id = u.id
         WHERE u.tiktok_verified = 1 AND u.tiktok_username IS NOT NULL
         GROUP BY u.id
         HAVING total_ms > 0
         ORDER BY total_ms DESC
         LIMIT ?`
    ).all(limit || 20);
    return rows.map(function (r) {
        return { tiktokUsername: r.tiktokUsername, totalHours: Math.round((r.total_ms / 3600000) * 10) / 10 };
    });
}

/**
 * [0.45.10] إحصائيات مجمَّعة عن كل الاستريمرز — لتبويب "إحصائيات
 * الاستريمرز" بلوحة الأدمن فقط.
 * ⚠️ ملاحظة صادقة: total_views مبنية على حقل totalUser من مكتبة
 * tiktok-live-connector — لم تُختبَر ضد بث حقيقي من هذه البيئة، راجع
 * التعليق بـbackend/db/database.js عند عمود total_unique_viewers.
 */
function getAdminStreamerStats() {
    var totals = db.prepare(
        `SELECT
            COUNT(DISTINCT u.id) AS total_streamers,
            COALESCE(SUM(CASE WHEN b.ended_at IS NOT NULL THEN b.ended_at - b.started_at ELSE 0 END), 0) AS total_live_ms,
            COALESCE(SUM(b.total_unique_viewers), 0) AS total_views
         FROM users u LEFT JOIN broadcasts b ON b.user_id = u.id
         WHERE u.is_streamer = 1`
    ).get();

    var top = db.prepare(
        `SELECT u.id, u.username, u.tiktok_username AS tiktokUsername,
                COUNT(b.id) AS total_broadcasts,
                COALESCE(SUM(CASE WHEN b.ended_at IS NOT NULL THEN b.ended_at - b.started_at ELSE 0 END), 0) AS total_ms,
                COALESCE(SUM(b.total_unique_viewers), 0) AS total_views
         FROM users u
         JOIN broadcasts b ON b.user_id = u.id
         WHERE u.is_streamer = 1
         GROUP BY u.id
         HAVING total_ms > 0
         ORDER BY total_ms DESC
         LIMIT 10`
    ).all();

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
 * [0.45.10] إحصائيات مجمَّعة عن كل المستخدمين (لاعبين + استريمرز) —
 * لتبويب "المستخدمون" بلوحة الأدمن. ⚠️ ملاحظة صادقة: "الأكثر استخداماً
 * للمنصة" لغير الاستريمرز (لاعبون عاديون بدون بث) غير قابل للقياس حالياً
 * — لا يوجد أي تتبّع جلسات/دخول بالمنصة لهم (فقط عدّاد جولات ألعاب
 * مكتملة games_played لمن لعب فعلياً عبر نظام النقاط). لهذا نعرض "الأكثر
 * استخداماً" هنا بمعنى: الاستريمرز حسب ساعات البث (نفس بيانات
 * getAdminStreamerStats)، + قائمة منفصلة لأكثر اللاعبين حسب عدد الجولات
 * المكتملة (games_played) — بدون افتراض رقم "استخدام عام" غير موجود.
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
 * [0.45.10] تحديث اسم العرض بالبروفايل (منفصل عن username الثابت لتسجيل
 * الدخول). حد أقصى 40 حرفاً، يُرفض الفارغ تماماً بعد trim (لو المستخدم
 * يبي يرجع للاسم الافتراضي، NULL صراحة عبر عدم إرسال حقل، لا سلسلة فارغة).
 */
function updateDisplayName(userId, displayName) {
    var trimmed = (displayName || '').trim();
    if (!trimmed) return { success: false, error: 'empty_display_name' };
    if (trimmed.length > 40) return { success: false, error: 'display_name_too_long' };
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(trimmed, userId);
    return { success: true, displayName: trimmed };
}

// ⚠️ [تصحيح حقيقي بعد اختبار — 0.45.10] كانت القيمة الأولى 350KB، لكن
// backend/http/body-parser.js يفرض حداً أقصى عاماً لكل جسم طلب HTTP =
// 100KB (MAX_BODY_BYTES، موجود مسبقاً لكل مسارات Auth/Admin) — أي صورة
// أكبر من ~100KB كانت تُسقَط الاتصال خام (ECONNRESET) قبل ما تصل هذا
// التحقق أصلاً، بدل رسالة خطأ واضحة 400. اكتُشف هذا فعلياً باختبار
// تكامل حقيقي (طلب HTTP فعلي بصورة كبيرة)، لا افتراضاً. الحل: تخفيض
// الحد هنا ليبقى **دون** حد body-parser.js بهامش أمان كافٍ لغلاف JSON
// (~85KB للصورة نفسها بعد Base64، يعادل ~62KB للصورة الأصلية تقريباً) —
// يفرض هذا صوراً صغيرة/مضغوطة فعلاً (لا صور بدقة كاملة)؛ الواجهة
// الأمامية يفضَّل تصغّر/تضغط الصورة (Canvas) قبل الإرسال بدل الاعتماد
// على هذا الرفض فقط.
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
function listAllUsersWithStats() {
    var users = db.prepare('SELECT id, username, email, role, tiktok_username, tiktok_verified, custom_id, is_streamer, permissions, welcome_completed, account_type_chosen, bound_device_id, created_at FROM users ORDER BY created_at ASC').all();
    return users.map(function (u) {
        // شفاء ذاتي — نفس منطق validateSession، حتى تظهر لوحة الأدمن
        // دائماً IDً لكل حساب حتى القديم منه قبل هذه الميزة.
        if (!u.custom_id) {
            u.custom_id = generatePublicId();
            db.prepare('UPDATE users SET custom_id = ? WHERE id = ?').run(u.custom_id, u.id);
        }
        var frames = collectiblesService.getUserFrames(u.id);
        var equipped = frames.filter(function (f) { return f.equipped; })[0] || null;
        // [0.45.6] deviceLocked: true/false فقط لعرض حالة قيد الجهاز بلوحة
        // الأدمن — لا يُرسَل معرّف الجهاز الفعلي (bound_device_id) نفسه
        // إطلاقاً للواجهة، لا داعي له هناك (فقط "مربوط أو لا؟").
        var deviceLocked = Boolean(u.bound_device_id);
        delete u.bound_device_id;
        return Object.assign({}, u, {
            is_streamer: Boolean(u.is_streamer),
            permissions: JSON.parse(u.permissions || '{}'),
            welcome_completed: Boolean(u.welcome_completed),
            account_type_chosen: u.account_type_chosen === undefined ? true : Boolean(u.account_type_chosen),
            deviceLocked: deviceLocked,
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
    completeWelcome: completeWelcome,
    resetWelcome: resetWelcome,
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
    hasPermission: hasPermission,
    chooseAccountType: chooseAccountType,
    deleteUser: deleteUser,
    adminResetDeviceLock: adminResetDeviceLock,
    updateBroadcastViewerStats: updateBroadcastViewerStats,
    getTopStreamersByHours: getTopStreamersByHours,
    getAdminStreamerStats: getAdminStreamerStats,
    getAdminUserStats: getAdminUserStats,
    updateDisplayName: updateDisplayName,
    updateAvatarImage: updateAvatarImage
};
