/**
 * AGP DATABASE — قاعدة بيانات دائمة (SQLite عبر better-sqlite3). ملف واحد
 * على القرص (agp-data.sqlite)، لا سيرفر قاعدة بيانات منفصل.
 *
 * ⚠️ Render يمسح أي ملفات محلية غير موجودة على قرص دائم مُرفَق صراحةً، في
 *   كل إعادة نشر أو استيقاظ بعد خمول — سبب اختفاء الحسابات الملاحَظ سابقاً.
 *   الحل: إرفاق قرص دائم بمسار وصل `/var/data` (خطة مدفوعة). لو ذلك
 *   المسار موجود، قاعدة البيانات تُخزَّن فيه تلقائياً؛ غير ذلك ترجع لملف
 *   بجانب مجلد backend/.
 *
 * الجداول:
 *   users          — حسابات الستريمرز (+ حساب أدمن واحد)
 *   sessions       — جلسات تسجيل الدخول (Token مؤقّت لكل تسجيل دخول)
 *   broadcasts     — سجل كل بث مباشر رُبط بالمنصة (بداية/نهاية + إحصائياته)
 *   announcement   — إعلان/تنبيه واحد يديره الأدمن، يظهر للزوار بالصفحة
 *                    الرئيسية — راجع backend/announcements/announcement-service.js
 *   frame_catalog  — كتالوج الإطارات الثابتة (تلقائية/خاصة + 7 مستويات) —
 *                    راجع backend/collectibles/collectibles-service.js
 *   custom_frames  — إطارات حصرية حرة يرفعها الأدمن ويمنحها لأي مستخدم
 *   user_frames    — ملكية/تفعيل الإطارات لكل مستخدم
 *   user_entrances — الدخولية النشطة (أنيميشن + نص) لكل مستخدم
 *   user_points    — نقاط اللاعب الإجمالية + سقف يومي — راجع
 *                    backend/points/points-service.js
 *   streamer_levels — كتالوج مستويات "SP" (نقاط الستريمر) القابلة
 *                    للتعديل من الأدمن — راجع backend/points/streamer-level-service.js
 *                    [0.45.0]
 *   supporters     — سجل داعمي المنصة (اسم/رسالة/مبلغ) — إدخال يدوي من
 *                    الأدمن حالياً (لا ربط تلقائي مع منصة كريترز/دكان
 *                    تب بعد، بانتظار رد الدعم الفني منهم) — راجع
 *                    backend/supporters/supporters-service.js
 *   site_theme     — ثيم ألوان مؤقت للمناسبات (اليوم الوطني، يوم
 *                    التأسيس...)، صف واحد ثابت يُفعَّل/يُعطَّل من الأدمن
 *                    — راجع backend/theme/site-theme-service.js
 *   letters_cell_questions_draft — مسودة بنك أسئلة "خلية الحروف" المشتركة
 *                    بين كل من عنده صلاحية إدارتها، صف واحد ثابت يُستبدَل
 *                    بالكامل مع كل حفظ من لوحة admin-questions.html —
 *                    راجع backend/letters-cell/letters-cell-questions-service.js
 *   platform_stats_cache — أرقام حقيقية مُجمَّعة لقسم "الأرقام" بالصفحة
 *                    الرئيسية (حسابات مسجّلة، استريمرز نشطين، مشاهدين...)،
 *                    محسوبة من الجداول الفعلية ومخزَّنة مؤقتاً (٣ أيام) —
 *                    راجع backend/stats/platform-stats-service.js
 * ==========================================================================
 */

'use strict';

var fs = require('fs');
var path = require('path');
var Database = require('better-sqlite3');
var logger = require('../utils/logger');

var RENDER_DISK_MOUNT_PATH = '/var/data';
var DB_DIR = fs.existsSync(RENDER_DISK_MOUNT_PATH) ? RENDER_DISK_MOUNT_PATH : path.join(__dirname, '..');
var DB_PATH = path.join(DB_DIR, 'agp-data.sqlite');

// logger.info() عمداً وليس logger.log(): يظهر حتى بالإنتاج (config.debug=false)
// لأن مسار قاعدة البيانات الفعلي معلومة تشغيلية حرجة.
logger.info('Database: using ' + (DB_DIR === RENDER_DISK_MOUNT_PATH ? 'persistent Render disk' : 'local (non-persistent) path') + ' — ' + DB_PATH);

var db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // أداء أفضل مع كتابة متزامنة أثناء البث

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_id TEXT UNIQUE,
        tiktok_username TEXT,
        tiktok_verified INTEGER NOT NULL DEFAULT 0,
        tiktok_verification_code TEXT,
        custom_id TEXT UNIQUE,
        is_streamer INTEGER NOT NULL DEFAULT 0,
        permissions TEXT NOT NULL DEFAULT '{}',
        role TEXT NOT NULL DEFAULT 'streamer' CHECK(role IN ('admin', 'streamer')),
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tiktok_username TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        comments_count INTEGER NOT NULL DEFAULT 0,
        gifts_count INTEGER NOT NULL DEFAULT 0,
        gifts_value_total INTEGER NOT NULL DEFAULT 0,
        follows_count INTEGER NOT NULL DEFAULT 0,
        players_joined_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_user ON broadcasts(user_id);
    -- ⚠️ فهرس بمطابقة غير حساسة لحالة الأحرف (COLLATE NOCASE) — استعلامات
    -- findVerifiedUserByTikTok/getEquippedFrameForVerifiedTikTok تُستدعى
    -- على كل تعليق وارد من الشات المباشر؛ لفّها بـLOWER(column) كان يُبطِل
    -- أي فهرس عادي فيضطر لمسح الجدول تسلسلياً لكل تعليق، ما يوقف حلقة
    -- الأحداث بـNode (استعلام better-sqlite3 متزامن). استخدام
    -- "= ? COLLATE NOCASE" بدل LOWER() مع هذا الفهرس يحل المشكلة.
    CREATE INDEX IF NOT EXISTS idx_users_tiktok_username_nocase ON users(tiktok_username COLLATE NOCASE);

    -- إعلان/تنبيه واحد يديره الأدمن، يظهر للزوار بالصفحة الرئيسية. صف
    -- واحد ثابت (id = 1) يُستبدَل بالكامل مع كل نشر جديد.
    CREATE TABLE IF NOT EXISTS announcement (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        text TEXT,
        image_filename TEXT,
        active INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER
    );

    -- نظام المقتنيات (إطارات + دخوليات) والنقاط/المستويات.

    -- كتالوج الإطارات الثابتة/المحجوزة: 4 صفوف "خاصة" (تُمنح تلقائياً أو
    -- يدوياً وتأتي مع دخولية + توهج)، و7 صفوف "مستوى" (تُفتح تلقائياً عند
    -- بلوغ عدد النقاط الذي يحدده الأدمن).
    CREATE TABLE IF NOT EXISTS frame_catalog (
        slug TEXT PRIMARY KEY,
        image_filename TEXT NOT NULL,
        display_name_ar TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK(kind IN ('special', 'level')),
        level_points_required INTEGER,
        bundles_entrance INTEGER NOT NULL DEFAULT 0,
        default_entrance_template TEXT,
        default_entrance_text TEXT
    );

    -- إطارات حصرية بأسماء ملفات حرة يرفعها الأدمن، خارج الكتالوج الثابت.
    CREATE TABLE IF NOT EXISTS custom_frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_filename TEXT NOT NULL,
        display_name_ar TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
    );

    -- ملكية الإطارات لكل مستخدم. frame_type يحدد المصدر ('catalog' يشير
    -- إلى frame_catalog.slug، 'custom' يشير إلى custom_frames.id، كلاهما
    -- عبر frame_ref). equipped = الإطار الظاهر حالياً (واحد فقط لكل
    -- مستخدم — يُطبَّق بمنطق التطبيق، لا قيد قاعدة بيانات).
    CREATE TABLE IF NOT EXISTS user_frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        frame_type TEXT NOT NULL CHECK(frame_type IN ('catalog', 'custom')),
        frame_ref TEXT NOT NULL,
        granted_by TEXT NOT NULL DEFAULT 'admin_manual',
        equipped INTEGER NOT NULL DEFAULT 0,
        granted_at INTEGER NOT NULL,
        UNIQUE(user_id, frame_type, frame_ref)
    );

    -- الدخولية النشطة لكل مستخدم — صف واحد لكل مستخدم، يُستبدَل بالكامل
    -- مع كل منح جديد (تلقائي مع إطار خاص، أو يدوي من الأدمن).
    CREATE TABLE IF NOT EXISTS user_entrances (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        template_key TEXT NOT NULL,
        entrance_text TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'admin_manual',
        updated_at INTEGER NOT NULL
    );

    -- كتالوج مستويات "SP" (نقاط الستريمر) — عتبات قابلة للتعديل من الأدمن.
    -- جدول منفصل عن frame_catalog بدل تعديل قيد CHECK(kind IN (...))
    -- الحالي (يتطلب إعادة بناء الجدول بالكامل بـSQLite).
    CREATE TABLE IF NOT EXISTS streamer_levels (
        slug TEXT PRIMARY KEY,
        display_name_ar TEXT NOT NULL DEFAULT '',
        min_sp INTEGER NOT NULL,
        sort_order INTEGER NOT NULL
    );

    -- نقاط اللاعب الإجمالية (تحدد المستوى) + تتبّع سقف يومي (100 نقطة/يوم
    -- كحد أقصى — today_date/today_earned يُصفَّران تلقائياً عند تغيّر اليوم).
    CREATE TABLE IF NOT EXISTS user_points (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_points INTEGER NOT NULL DEFAULT 0,
        today_date TEXT,
        today_earned INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_user_frames_user ON user_frames(user_id);

    -- سجل داعمي المنصة — كل صف تبرّع/دعم واحد، إدخال يدوي من الأدمن.
    CREATE TABLE IF NOT EXISTS supporters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_supporters_created ON supporters(created_at);

    -- شركاء الإبداع — يربط حساب مسجَّل بفئة (أصحاب أفكار / فريق تطوير).
    -- لا نخزّن اسم أو صورة هنا؛ تُقرأ حيّة من users عند العرض (JOIN).
    CREATE TABLE IF NOT EXISTS creative_partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK (category IN ('idea', 'dev')),
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, category)
    );
    CREATE INDEX IF NOT EXISTS idx_creative_partners_category ON creative_partners(category);

    -- ثيم ألوان مؤقت للمناسبات — صف واحد ثابت (id = 1)، يُستبدَل بالكامل
    -- مع كل تفعيل جديد. active = 0 يعني الموقع بألوانه الافتراضية.
    CREATE TABLE IF NOT EXISTS site_theme (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active INTEGER NOT NULL DEFAULT 0,
        preset_key TEXT,
        accent TEXT,
        accent_2 TEXT,
        accent_pink TEXT,
        updated_at INTEGER
    );

    -- مسودة بنك أسئلة "خلية الحروف" المشتركة — صف واحد ثابت (id = 1)
    -- يُستبدَل بالكامل مع كل حفظ. هذا هو ما تعرضه admin-questions.html
    -- فعلياً (بدل نسخة محلية بالمتصفح فقط)، فتبقى الأسئلة المضافة محفوظة
    -- ومرئية لأي أدمن آخر حتى قبل تنزيل questions-bank.json ورفعه لـGitHub.
    CREATE TABLE IF NOT EXISTS letters_cell_questions_draft (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_by INTEGER,
        updated_at INTEGER NOT NULL
    );

    -- أرقام "المنصة/الاستريمرز/اللاعبين" الحقيقية بالصفحة الرئيسية — صف
    -- واحد ثابت (id = 1) يخزّن آخر حساب فعلي، ويُعاد حسابه من قاعدة
    -- البيانات مرة كل ٣ أيام كحد أقصى (راجع backend/stats/platform-
    -- stats-service.js) بدل حساب مُكلف بكل زيارة للصفحة الرئيسية.
    CREATE TABLE IF NOT EXISTS platform_stats_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        computed_at INTEGER NOT NULL
    );
`);

/** ترقية آمنة: تضيف عموداً فقط إن لم يكن موجوداً، بدون فقدان بيانات. */
function ensureColumn(table, column, definition) {
    var existing = db.prepare('PRAGMA table_info(' + table + ')').all();
    var hasColumn = existing.some(function (col) { return col.name === column; });
    if (!hasColumn) {
        db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
        logger.log('Database: migrated — added column ' + table + '.' + column);
    }
}
ensureColumn('users', 'google_id', 'TEXT');
ensureColumn('users', 'tiktok_username', 'TEXT');
ensureColumn('users', 'tiktok_verified', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'tiktok_verification_code', 'TEXT');
ensureColumn('users', 'custom_id', 'TEXT');
ensureColumn('users', 'is_streamer', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'permissions', "TEXT NOT NULL DEFAULT '{}'");
// حفلة ترحيب الستريمر الجديد — 0 = لسا ما شافها كاملة، 1 = خلص شافها.
ensureColumn('users', 'welcome_completed', 'INTEGER NOT NULL DEFAULT 0');
// صورة بروفايل تيك توك واسم العرض — تُلتقَط مرة واحدة لحظة نجاح التحقق
// الفعلي (verifyTikTokOwnership). استخراج تقريبي (meta tags)، قد يفشل
// أحياناً فيرجع null بدون كسر التحقق نفسه.
ensureColumn('users', 'tiktok_avatar_url', 'TEXT');
ensureColumn('users', 'tiktok_display_name', 'TEXT');
// معرّف تيك توك الثابت (open_id) — يوصل من تسجيل الدخول الرسمي (OAuth)
// فقط، يمنع نفس حساب التيك توك من الارتباط بأكثر من حساب AGP بالغلط.
ensureColumn('users', 'tiktok_open_id', 'TEXT');
// عدّادات جولات مكتملة/فوز — لبطاقة "إحصائيات اللاعب" بالبروفايل، تُحدَّث
// من awardForRoundCompletion بـpoints-service.js.
ensureColumn('user_points', 'games_played', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('user_points', 'games_won', 'INTEGER NOT NULL DEFAULT 0');
// إجمالي وقت اللعب الفعلي للاعب (مللي ثانية) — لـ"الأكثر نشاطاً بالساعات"
// (getTopPlayersByHours بـpoints-service.js).
ensureColumn('user_points', 'total_play_ms', 'INTEGER NOT NULL DEFAULT 0');
// تفعيل/إيقاف ذاتي للدخولية من البروفايل — 1 افتراضي (مفعّلة)، 0 يعني
// الستريمر أطفأها بنفسه (القالب/النص يبقيان محفوظين لإعادة التفعيل).
ensureColumn('user_entrances', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
// اختيار نوع الحساب (لاعب/استريمر) بعد تسجيل الدخول عبر جوجل — افتراضي 1
// ("تم الاختيار") للحسابات الحالية؛ فقط حسابات جوجل الجديدة تُنشأ بـ0.
ensureColumn('users', 'account_type_chosen', 'INTEGER NOT NULL DEFAULT 1');
// قيد جهاز واحد لحسابات الستريمر المعتمدين — معرّف جهاز يُربَط تلقائياً
// بأول تسجيل دخول بعد اعتماد الحساب. NULL = لا قيد بعد. قيد ناعم وليس
// صلباً (راجع checkDeviceLock بـauth-service.js)؛ لا قيد على لاعبين عاديين.
ensureColumn('users', 'bound_device_id', 'TEXT');

// عدد المشاهدين لكل بث — من حدث roomUser بمكتبة tiktok-live-connector.
// peak_viewers = أعلى عدد متزامن (حقل `total`)، total_unique_viewers =
// آخر قيمة تراكمية مرصودة (حقل `totalUser`).
ensureColumn('broadcasts', 'peak_viewers', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('broadcasts', 'total_unique_viewers', 'INTEGER NOT NULL DEFAULT 0');

// اسم عرض منفصل عن username (المعرّف الثابت لتسجيل الدخول) — يعدّله
// المستخدم من البروفايل. صورة البروفايل تُخزَّن Base64 مباشرة (لا نظام
// تخزين ملفات بالباك إند)؛ الحد الأقصى للحجم يُفرَض بمستوى الكود.
ensureColumn('users', 'display_name', 'TEXT');
ensureColumn('users', 'avatar_image_base64', 'TEXT');

// سوبر أدمن — يتجاوز قيد الجهاز (checkDeviceLock) بالكامل، يدخل من أي
// جهاز دائماً. 0 افتراضياً لكل الحسابات، يُفعَّل يدوياً فقط.
ensureColumn('users', 'is_super_admin', 'INTEGER NOT NULL DEFAULT 0');

// سماح تغيير الجهاز — استخدام لمرة واحدة. الأدمن يفعّله لحساب مقفول
// بجهاز؛ أول تسجيل دخول تالٍ من أي جهاز يُقبل ويحدّث bound_device_id،
// والعمود يرجع 0 تلقائياً بنفس اللحظة.
ensureColumn('users', 'allow_device_change', 'INTEGER NOT NULL DEFAULT 0');

// تفعيل سوبر أدمن مرة واحدة لحساب أيمن — استعلام آمن للتكرار (Idempotent).
db.prepare("UPDATE users SET is_super_admin = 1 WHERE email = 'aymanff66@gmail.com' AND is_super_admin = 0").run();

// استرجاع كلمة المرور — كود مؤقت + وقت انتهاء صلاحية. NULL = لا طلب معلّق.
ensureColumn('users', 'password_reset_code', 'TEXT');
ensureColumn('users', 'password_reset_expires', 'INTEGER');

// ربط اختياري بين صف دعم (supporters) وحساب مسجَّل (users.id) — NULL
// افتراضياً. لو مربوط، تُعرَض اسم/صورة الحساب الحيّة بدل النص الثابت.
ensureColumn('supporters', 'user_id', 'INTEGER');

/**
 * تهيئة أولية لكتالوج الإطارات الثابت (4 خاصة + 7 مستويات) — INSERT OR
 * IGNORE بمفتاح slug، فلا خطر إعادة الكتابة فوق تعديلات الأدمن اللاحقة.
 * مستويات النقاط تُترَك NULL عمداً لحد ما الأدمن يحددها.
 */
var DEFAULT_FRAME_CATALOG = [
    { slug: 'founder', image_filename: 'frame-founder.png', kind: 'special', bundles_entrance: 1, default_entrance_template: 'gold', default_entrance_text: 'مؤسس المنصة دخل البث!' },
    { slug: 'streamer', image_filename: 'frame-streamer.png', kind: 'special', bundles_entrance: 1, default_entrance_template: 'neon', default_entrance_text: 'استريمر رسمي انضم الآن' },
    { slug: 'supporter', image_filename: 'frame-supporter.png', kind: 'special', bundles_entrance: 1, default_entrance_template: 'fire', default_entrance_text: 'داعم المنصة دخل بقوة!' },
    { slug: 'distinguished', image_filename: 'frame-distinguished.png', kind: 'special', bundles_entrance: 1, default_entrance_template: 'ice', default_entrance_text: 'عضو مميز حضر اللحظة' },
    { slug: 'level-1', image_filename: 'frame-level-1.png', kind: 'level' },
    { slug: 'level-2', image_filename: 'frame-level-2.png', kind: 'level' },
    { slug: 'level-3', image_filename: 'frame-level-3.png', kind: 'level' },
    { slug: 'level-4', image_filename: 'frame-level-4.png', kind: 'level' },
    { slug: 'level-5', image_filename: 'frame-level-5.png', kind: 'level' },
    { slug: 'level-6', image_filename: 'frame-level-6.png', kind: 'level' },
    { slug: 'level-7', image_filename: 'frame-level-7.png', kind: 'level' }
];
(function ensureFrameCatalogSeed() {
    var insert = db.prepare(
        'INSERT OR IGNORE INTO frame_catalog ' +
        '(slug, image_filename, display_name_ar, kind, level_points_required, bundles_entrance, default_entrance_template, default_entrance_text) ' +
        'VALUES (@slug, @image_filename, @display_name_ar, @kind, @level_points_required, @bundles_entrance, @default_entrance_template, @default_entrance_text)'
    );
    DEFAULT_FRAME_CATALOG.forEach(function (row) {
        insert.run({
            slug: row.slug,
            image_filename: row.image_filename,
            display_name_ar: row.display_name_ar || '',
            kind: row.kind,
            level_points_required: row.level_points_required === undefined ? null : row.level_points_required,
            bundles_entrance: row.bundles_entrance ? 1 : 0,
            default_entrance_template: row.default_entrance_template || null,
            default_entrance_text: row.default_entrance_text || null
        });
    });
}());

/**
 * تهيئة أولية لكتالوج مستويات SP — نفس أسلوب ensureFrameCatalogSeed أعلاه،
 * قابلة للتعديل الكامل من admin.html لاحقاً.
 */
var DEFAULT_STREAMER_LEVELS = [
    { slug: 'sp-level-1', display_name_ar: 'مستوى 1 — مبتدئ', min_sp: 0, sort_order: 1 },
    { slug: 'sp-level-2', display_name_ar: 'مستوى 2 — نشِط', min_sp: 500, sort_order: 2 },
    { slug: 'sp-level-3', display_name_ar: 'مستوى 3 — صاعد', min_sp: 1500, sort_order: 3 },
    { slug: 'sp-level-4', display_name_ar: 'مستوى 4 — محترف', min_sp: 3500, sort_order: 4 },
    { slug: 'sp-level-5', display_name_ar: 'مستوى 5 — مميز', min_sp: 7000, sort_order: 5 },
    { slug: 'sp-level-6', display_name_ar: 'مستوى 6 — نخبة', min_sp: 15000, sort_order: 6 },
    { slug: 'sp-level-7', display_name_ar: 'مستوى 7 — أسطورة', min_sp: 30000, sort_order: 7 }
];
(function ensureStreamerLevelsSeed() {
    var insert = db.prepare(
        'INSERT OR IGNORE INTO streamer_levels (slug, display_name_ar, min_sp, sort_order) VALUES (@slug, @display_name_ar, @min_sp, @sort_order)'
    );
    DEFAULT_STREAMER_LEVELS.forEach(function (row) { insert.run(row); });
}());

logger.log('Database: ready at ' + DB_PATH);

module.exports = db;
