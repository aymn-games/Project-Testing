/**
 * ==========================================================================
 *  AGP DATABASE — قاعدة بيانات دائمة (SQLite عبر better-sqlite3)
 * ==========================================================================
 *
 * ملف واحد على القرص (agp-data.sqlite)، لا سيرفر قاعدة بيانات منفصل.
 *
 * ⚠️ **قرص Render الدائم (Persistent Disk) إلزامي لبقاء البيانات فعلياً**:
 *   Render (الاستضافة الحالية) يمسح أي ملفات محلية غير موجودة على قرص
 *   دائم مُرفَق صراحةً، وذلك في كل مرة تُعاد فيها الخدمة (نشر جديد، أو
 *   حتى مجرد استيقاظ الخدمة بعد فترة خمول على الخطط غير المدفوعة) —
 *   هذا سبب اختفاء الحسابات (حتى حساب الأدمن) المُلاحَظ فعلياً، وليس
 *   خللاً بمنطق التطبيق. الحل: إرفاق قرص دائم (Persistent Disk) من
 *   لوحة Render بمسار وصل (Mount Path) قيمته بالضبط `/var/data`، على
 *   خطة مدفوعة (الخطط المجانية لا تدعم الأقراص الدائمة إطلاقاً). لو
 *   ذلك المسار موجود فعلياً (أي القرص مُرفَق ومُوصَّل)، قاعدة البيانات
 *   تُخزَّن فيه تلقائياً؛ غير ذلك (بيئة تطوير محلية، أو الخدمة بدون قرص
 *   مُرفَق بعد) ترجع لنفس السلوك القديم بالضبط (ملف بجانب مجلد backend/).
 *   راجع docs/CHANGELOG.md للتفاصيل الكاملة وخطوات الإعداد على Render.
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

// ⚠️ عمداً logger.info() وليس logger.log(): هذا السطر لازم يظهر دائماً
// حتى بالإنتاج (حيث Render يضبط NODE_ENV=production تلقائياً فتصير
// config.debug=false وتُكتَم logger.log() العادية) — التأكد من مسار
// قاعدة البيانات الفعلي معلومة تشغيلية حرجة، مو تفصيل تصحيح عادي.
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
    -- [0.45.6] فهرس على tiktok_username بمطابقة غير حساسة لحالة الأحرف
    -- (COLLATE NOCASE) — راجع backend/collectibles/collectibles-service.js
    -- (getEquippedFrameForVerifiedTikTok/getEquippedEntranceForVerifiedTikTok)
    -- وbackend/auth/auth-service.js (findVerifiedUserByTikTok): كل الثلاثة
    -- تُستدعى على **كل تعليق وارد من الشات المباشر بتيك توك** (راجع
    -- backend/websocket/ws-server.js)، وكانت تلف الاستعلام بـLOWER(column)
    -- بدل LOWER(?) فقط — وهذا يُبطِل أي فهرس عادي على العمود نفسه (SQLite
    -- لا يقدر يستخدم فهرساً على تعبير LOWER(tiktok_username) بدون فهرس
    -- تعبيري مخصَّص)، فيضطر كل استعلام لمسح كامل جدول users تسلسلياً —
    -- استعلام متزامن (better-sqlite3) يوقف حلقة الأحداث بـNode بالكامل
    -- لكل الاتصالات أثناء تنفيذه، على كل تعليق، طوال مدة أي بث حي. هذا
    -- الفهرس + تعديل الاستعلامات لاستخدام "= ? COLLATE NOCASE" بدل
    -- LOWER() يحل المشكلة فعلياً (الفهرس أصبح قابلاً للاستخدام).
    CREATE INDEX IF NOT EXISTS idx_users_tiktok_username_nocase ON users(tiktok_username COLLATE NOCASE);

    -- إعلان/تنبيه واحد يديره الأدمن، يظهر للزوار بالصفحة الرئيسية (نافذة
    -- منبثقة). صف واحد ثابت (id = 1) يُستبدَل بالكامل مع كل نشر جديد —
    -- راجع backend/announcements/announcement-service.js.
    CREATE TABLE IF NOT EXISTS announcement (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        text TEXT,
        image_filename TEXT,
        active INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER
    );

    -- ========================================================
    -- نظام المقتنيات (إطارات + دخوليات) والنقاط/المستويات — راجع
    -- backend/collectibles/collectibles-service.js وbackend/points/points-service.js
    -- ========================================================

    -- كتالوج الإطارات الثابتة/المحجوزة: 4 صفوف "خاصة" (founder/streamer/
    -- supporter/distinguished — تُمنح تلقائياً أو يدوياً وتأتي مع دخولية
    -- + توهج تلقائياً)، و7 صفوف "مستوى" (تُفتح تلقائياً عند بلوغ عدد
    -- النقاط الذي يحدده الأدمن). أسماء الملفات ثابتة يرفعها الأدمن يدوياً
    -- لجذر المستودع بنفس أسلوب logo.png — راجع ensureFrameCatalogSeed أدناه.
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

    -- إطارات حصرية بأسماء ملفات حرة يرفعها الأدمن لاحقاً (خارج الكتالوج
    -- الثابت أعلاه) — كل صف مقتنى واحد قابل للمنح لأي مستخدم يدوياً.
    CREATE TABLE IF NOT EXISTS custom_frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_filename TEXT NOT NULL,
        display_name_ar TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
    );

    -- ملكية الإطارات لكل مستخدم. frame_type يحدد المصدر ('catalog' يشير
    -- إلى frame_catalog.slug عبر frame_ref، 'custom' يشير إلى
    -- custom_frames.id عبر frame_ref كنص). equipped = الإطار الظاهر
    -- حالياً (واحد فقط في كل مرة لكل مستخدم — يُطبَّق بمنطق التطبيق، لا
    -- قيد قاعدة بيانات).
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

    -- الدخولية النشطة لكل مستخدم (نموذج أنيميشن ثابت بالواجهة + نص حر) —
    -- صف واحد لكل مستخدم، يُستبدَل بالكامل مع كل منح جديد (تلقائي مع
    -- إطار خاص، أو يدوي مستقل من الأدمن).
    CREATE TABLE IF NOT EXISTS user_entrances (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        template_key TEXT NOT NULL,
        entrance_text TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'admin_manual',
        updated_at INTEGER NOT NULL
    );

    -- [0.45.0] كتالوج مستويات "SP" (نقاط الستريمر) — بنفس فلسفة
    -- frame_catalog kind='level' (عتبات نقاط قابلة للتعديل من الأدمن)،
    -- لكن بجدول منفصل بدل إضافة قيمة جديدة لقيد CHECK(kind IN (...))
    -- الحالي بـ frame_catalog (تعديل قيد CHECK بـSQLite يتطلب إعادة بناء
    -- الجدول بالكامل — قرار غير آمن بلا داعٍ، بينما جدول جديد كامل
    -- إضافة بحتة بلا أي خطر على البيانات الحالية). راجع
    -- backend/points/streamer-level-service.js.
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

    -- سجل داعمي المنصة — كل صف تبرّع/دعم واحد. إدخال يدوي حالياً من
    -- الأدمن (admin.html) بعد ما يشوفه فعلياً بلوحة تحكم كريترز/دكان
    -- تب — راجع backend/supporters/supporters-service.js. لا ربط حساب
    -- مستخدم هنا عمداً (الداعم قد لا يملك حساباً بالمنصة أصلاً).
    CREATE TABLE IF NOT EXISTS supporters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_supporters_created ON supporters(created_at);

    -- ثيم ألوان مؤقت للمناسبات — صف واحد ثابت (id = 1)، يُستبدَل بالكامل
    -- مع كل تفعيل جديد من الأدمن (نفس نمط جدول announcement بالضبط).
    -- active = 0 يعني الموقع بألوانه الافتراضية (index.html:root)، مافي
    -- أي تأثير. راجع backend/theme/site-theme-service.js.
    CREATE TABLE IF NOT EXISTS site_theme (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active INTEGER NOT NULL DEFAULT 0,
        preset_key TEXT,
        accent TEXT,
        accent_2 TEXT,
        accent_pink TEXT,
        updated_at INTEGER
    );
`);

/**
 * ترقية آمنة لقاعدة بيانات كانت موجودة قبل هذا التعديل (أُنشئت بدون
 * أعمدة google_id/tiktok_username) — تضيفهم فقط إن لم يكونا موجودين،
 * بدون فقدان أي بيانات مخزَّنة مسبقاً.
 */
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
// حفلة ترحيب الستريمر الجديد (راجع docs/CHANGELOG.md) — 0 = لسا ما
// شافها كاملة (تظهر له بـindex.html)، 1 = خلص شافها، ما تتكرر تلقائياً
// إلا لو الأدمن صفّرها له صراحة من admin.html.
ensureColumn('users', 'welcome_completed', 'INTEGER NOT NULL DEFAULT 0');
// صورة بروفايل تيك توك واسم العرض — تُلتقَط مرة واحدة فقط لحظة نجاح
// التحقق الفعلي (verifyTikTokOwnership بـbackend/auth/auth-service.js)
// من نفس صفحة البروفايل العامة المجلوبة أصلاً للتحقق من الكود، بدون أي
// طلب شبكي إضافي. تُعرَض بصفحة البروفايل (profile.html) بمجرد الربط.
// ⚠️ استخراج تقريبي (meta tags) من HTML عام — نفس تحفّظ باقي استخراجات
// تيك توك بالمشروع، قد يفشل أحياناً فيرجع null بدون كسر التحقق نفسه.
ensureColumn('users', 'tiktok_avatar_url', 'TEXT');
ensureColumn('users', 'tiktok_display_name', 'TEXT');
// عدّادات جولات مكتملة/فوز — لتفعيل بطاقة "إحصائيات اللاعب" بالبروفايل
// (كانت "قريباً" ثابتة، ما فيه عدّاد حقيقي مخزَّن قبل هذا). تُحدَّث من
// backend/points/points-service.js عند كل استدعاء awardForRoundCompletion
// فعلي (بعد مطابقة الحساب الموثَّق) — راجع [0.44.2] بـdocs/CHANGELOG.md.
ensureColumn('user_points', 'games_played', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('user_points', 'games_won', 'INTEGER NOT NULL DEFAULT 0');
// [0.45.0] تفعيل/إيقاف ذاتي للدخولية من البروفايل — 1 (افتراضي) يعني
// "مفعّلة" لكل الصفوف الحالية، فلا يتغيّر أي سلوك ظاهر لأي مستخدم عنده
// دخولية اليوم. 0 = الستريمر أطفأها بنفسه؛ يبقى القالب/النص محفوظين
// بالصف نفسه (بدون حذف) لإعادة التفعيل بضغطة واحدة — راجع
// backend/http/auth-router.js (POST /api/entrance/toggle) وprofile.html.
ensureColumn('user_entrances', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
// [0.45.6] اختيار نوع الحساب (لاعب/استريمر) بعد تسجيل الدخول عبر جوجل —
// افتراضي 1 (أي "تم الاختيار") لكل الصفوف الحالية عمداً، فلا يتأثر أي
// حساب موجود مسبقاً (كلها اختارت نوعها فعلاً وقت التسجيل العادي بكلمة
// مرور، أو دخلت بجوجل قبل هذا الإصدار وتُعامَل كأنها اختارت "لاعب" ضمنياً
// بدل إجبارها فجأة على شاشة اختيار لم تكن موجودة وقتها). فقط حسابات جوجل
// الجديدة كلياً من هذا الإصدار فصاعداً تُنشأ بـ0 (يحتاج اختيار إجباري) —
// راجع backend/auth/auth-service.js (loginWithGoogle/chooseAccountType).
ensureColumn('users', 'account_type_chosen', 'INTEGER NOT NULL DEFAULT 1');
// [0.45.6] قيد جهاز واحد لحسابات الستريمر المعتمدين (can_run_games=true)
// — معرّف جهاز عشوائي (يُولَّد ويُخزَّن بـlocalStorage بالمتصفح، راجع
// auth/auth-client.js: getDeviceId) يُربَط تلقائياً بأول تسجيل دخول ناجح
// بعد اعتماد الحساب كستريمر فعلي. NULL = لا قيد بعد (لسا ما سجّل دخول
// كستريمر معتمد، أو الأدمن صفّر القيد يدوياً). راجع backend/auth/
// auth-service.js (checkDeviceLock) — **قيد ناعم وليس صلباً، حدوده
// موثَّقة صراحة بالكود وبـdocs/CHANGELOG.md**، لا قيد إطلاقاً على الحسابات
// غير المعتمدة كستريمر (لاعبون عاديون يدخلون من أي جهاز بلا أي تأثير).
ensureColumn('users', 'bound_device_id', 'TEXT');

// [0.45.10] عدد المشاهدين لكل بث — يُحدَّث من حدث roomUser الحقيقي من
// مكتبة tiktok-live-connector (راجع backend/platforms/tiktok/
// tiktok-connector.js). peak_viewers = أعلى عدد مشاهدين متزامن لُوحظ
// خلال البث (من حقل المكتبة `total`)، total_unique_viewers = آخر قيمة
// مرصودة لعدد المشاهدين التراكمي الكلي (من حقل المكتبة `totalUser`).
// ⚠️ ملاحظة صادقة: أسماء الحقول (`total`/`totalUser`) من نوع بروتوكول
// تيك توك غير الرسمي `WebcastRoomUserSeqMessage` بالمكتبة المثبَّتة
// فعلياً (v2.4.3) — لم تُختبَر ضد بث حقيقي من هذه البيئة (لا اتصال
// شبكي فعلي هنا)، فالافتراض إن `totalUser` = العدد التراكمي الكلي
// (المطابق لما تسميه تيك توك "المشاهدات") مبني على اسم الحقل نفسه لا
// اختبار فعلي — يحتاج تأكيداً من بث حقيقي بعد الرفع.
ensureColumn('broadcasts', 'peak_viewers', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('broadcasts', 'total_unique_viewers', 'INTEGER NOT NULL DEFAULT 0');

// [0.45.10] اسم عرض منفصل عن username (المعرّف الثابت لتسجيل الدخول،
// لا يتغيّر) — يقدر المستخدم يعدّله بنفسه من البروفايل. NULL = لسا ما
// عدّله، يُعرَض username كبديل. صورة البروفايل تُخزَّن Base64 مباشرة
// بقاعدة البيانات (لا يوجد نظام تخزين ملفات بالباك إند حالياً) — حد
// أقصى للحجم يُفرَض بمستوى الكود (auth-service.js) قبل التخزين، لا هنا.
ensureColumn('users', 'display_name', 'TEXT');
ensureColumn('users', 'avatar_image_base64', 'TEXT');

// [0.45.14] ربط اختياري بين صف دعم (supporters) وحساب مسجَّل فعلياً
// بالمنصة (users.id) — NULL افتراضياً (الداعم قد لا يملك حساباً، يبقى
// السلوك القديم كما هو تماماً بالاسم النصي وحده). لو الأدمن ربط الصف
// بحساب معيّن، تُعرَض الصفحة الرئيسية/صفحة توب الداعمين اسم العرض
// وصورة البروفايل *الحيّة* لذلك الحساب بدل النص الثابت وقت الإدخال —
// راجع backend/supporters/supporters-service.js.
ensureColumn('supporters', 'user_id', 'INTEGER');

/**
 * تهيئة أولية لكتالوج الإطارات الثابت (4 خاصة + 7 مستويات) — تُنفَّذ مرة
 * واحدة فقط لكل صف (INSERT OR IGNORE بمفتاح slug)، فلا خطر إعادة الكتابة
 * فوق تعديلات الأدمن اللاحقة (اسم عرض عربي، نقاط المستوى، نص/نموذج
 * الدخولية الافتراضي) في أي تشغيل لاحق للخادم. مستويات النقاط تُترَك
 * NULL عمداً (غير مفعَّلة) لحد ما الأدمن يحددها بنفسه من لوحة التحكم —
 * راجع backend/collectibles/collectibles-service.js.
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
 * [0.45.0] تهيئة أولية لكتالوج مستويات SP — نفس أسلوب ensureFrameCatalogSeed
 * أعلاه بالضبط (INSERT OR IGNORE بمفتاح slug)، فلا خطر إعادة الكتابة فوق
 * تعديلات الأدمن اللاحقة على min_sp/display_name_ar. القيم الابتدائية
 * تصميم جديد بالكامل (راجع docs/CHANGELOG.md [0.45.0] للتفاصيل والمبرر) —
 * قابلة للتعديل الكامل من admin.html لاحقاً بدون أي حاجة لتعديل الكود.
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
