/**
 * ==========================================================================
 *  AGP STREAMER LEVEL SERVICE — نظام "SP" (نقاط الستريمر) [0.45.0]
 * ==========================================================================
 *
 * نظام جديد بالكامل، منفصل تماماً عن backend/points/points-service.js
 * (ذلك الملف لنقاط/مستوى **اللاعب**، مبني على جولات الألعاب المكتملة —
 * لا علاقة له بالبث). هذا الملف لمستوى **الستريمر**، مبني على إحصائيات
 * البث الفعلية المخزَّنة بجدول broadcasts (راجع
 * backend/auth/auth-service.js: startBroadcast/endBroadcast/
 * incrementBroadcastStat/addGiftValue، وbackend/websocket/ws-server.js
 * الذي يستدعيها الآن فعلياً — قبل [0.45.0] كانت هذي الدوال موجودة لكن
 * لا شيء يستدعيها، فكل الإحصائيات كانت صفراً دائماً).
 *
 * ⚠️ ملاحظة صادقة (نفس أسلوب التوثيق المتّبع بالمشروع): بما إن تتبّع
 * البث لم يكن مفعَّلاً قبل هذا الإصدار، **لا توجد أي بيانات بث تاريخية**
 * نبني عليها — كل ستريمر يبدأ من SP = صفر لحظة أول بث بعد هذا التحديث،
 * بصرف النظر عن نشاطه الفعلي قبل ذلك. هذا متوقَّع وليس خللاً.
 *
 * معادلة SP (تصميم جديد، تفويض كامل من صاحب المنصة — راجع docs/CHANGELOG.md
 * [0.45.0] للمبرر الكامل):
 *   SP = (دقائق البث الفعلية × SP_PER_LIVE_MINUTE)
 *      + (إجمالي قيمة الهدايا بالماس × SP_PER_DIAMOND)
 *
 * نظام مركّب عمداً (مو مدة فقط ولا هدايا فقط) — يكافئ الالتزام بالبث
 * بانتظام (حتى بدون هدايا كثيرة) وأيضاً التفاعل/الدعم الفعلي من
 * الجمهور، بدل تفضيل نوع نشاط واحد على حساب الثاني بالكامل.
 *
 * العتبات نفسها (كم SP لكل مستوى) **ليست** أرقاماً بالكود — مخزَّنة
 * بجدول streamer_levels (راجع backend/db/database.js) وقابلة للتعديل
 * الكامل من لوحة الأدمن دون أي تعديل كود لاحق، بنفس فلسفة
 * frame_catalog.level_points_required تماماً.
 */

'use strict';

var db = require('../db/database');

// ⚠️ استعلام إحصائيات البث هنا مكرَّر عمداً بدل استدعاء
// authService.getUserStats — auth-service.js سيستورد هذا الملف نفسه
// (ليُرفِق حقل streamerLevel بـgetPublicProfile)، فاستيراد auth-service.js
// من هنا يُنشئ اعتمادية دائرية. نفس السبب/الحل المُوثَّق أصلاً بـ
// collectibles-service.js (getEquippedFrameForVerifiedTikTok).
function getBroadcastTotals(userId) {
    return db.prepare(
        `SELECT
            COALESCE(SUM(gifts_value_total), 0) AS total_gifts_value,
            COALESCE(SUM(CASE WHEN ended_at IS NOT NULL THEN ended_at - started_at ELSE 0 END), 0) AS total_live_ms
         FROM broadcasts WHERE user_id = ?`
    ).get(userId);
}

// SP لكل دقيقة بث فعلية مكتملة (60 دقيقة = 60 SP بالساعة). وزن الوقت
// عمداً بسيط/صحيح (لا كسور) لسهولة الفهم من الستريمر نفسه.
var SP_PER_LIVE_MINUTE = 1;

// SP لكل 10 ماسات هدايا مستلمة (أي: ماسة واحدة = 0.1 SP، مجمَّعة
// ومقرَّبة لأقرب عدد صحيح بالنهاية فقط — لا تراكم كسور بقاعدة البيانات).
var SP_PER_10_DIAMONDS = 1;

/**
 * حساب SP الحالي لمستخدم واحد من إحصائيات بثوثه المجمَّعة فعلياً.
 * @param {number} userId
 * @returns {number}
 */
function computeSpForUser(userId) {
    var stats = getBroadcastTotals(userId);
    if (!stats) return 0;

    var liveMinutes = Math.floor((stats.total_live_ms || 0) / 60000);
    var giftsValue = stats.total_gifts_value || 0;

    var sp = (liveMinutes * SP_PER_LIVE_MINUTE) + Math.floor((giftsValue / 10) * SP_PER_10_DIAMONDS);
    return Math.max(0, Math.floor(sp));
}

/**
 * كل مستويات SP مرتّبة تصاعدياً (sort_order) — تُقرأ من قاعدة البيانات
 * مباشرة في كل استدعاء (جدول صغير جداً، لا حاجة لتخزين مؤقّت بالذاكرة؛
 * يضمن رؤية أي تعديل أدمن فوري بدون إعادة تشغيل الخادم).
 * @returns {Array<{slug: string, display_name_ar: string, min_sp: number, sort_order: number}>}
 */
function listLevels() {
    return db.prepare('SELECT slug, display_name_ar, min_sp, sort_order FROM streamer_levels ORDER BY sort_order ASC').all();
}

/**
 * إيجاد المستوى المطابق لقيمة SP معيّنة (أعلى مستوى بلغه فعلاً)، مع
 * المستوى التالي (لو وُجد) ونسبة التقدّم نحوه — لعرض شريط تقدّم بالبروفايل.
 * @param {number} sp
 * @returns {{current: Object|null, next: Object|null, progressPercent: number}}
 */
function resolveLevelForSp(sp) {
    var levels = listLevels();
    if (!levels.length) return { current: null, next: null, progressPercent: 0 };

    var current = null;
    var next = null;
    for (var i = 0; i < levels.length; i++) {
        if (levels[i].min_sp <= sp) {
            current = levels[i];
        } else {
            next = levels[i];
            break;
        }
    }
    // لو ما وصل حتى أقل عتبة (نادر، فقط لو الأدمن رفع أدنى عتبة فوق صفر)
    if (!current) {
        current = null;
        next = levels[0];
    }

    var progressPercent = 100;
    if (next) {
        var base = current ? current.min_sp : 0;
        var span = next.min_sp - base;
        progressPercent = span > 0 ? Math.max(0, Math.min(100, Math.round(((sp - base) / span) * 100))) : 0;
    }

    return { current: current, next: next, progressPercent: progressPercent };
}

/**
 * كل معلومات SP الجاهزة للعرض بالبروفايل مباشرة، لمستخدم واحد.
 * @param {number} userId
 * @returns {{sp: number, currentLevel: Object|null, nextLevel: Object|null, progressPercent: number}}
 */
function getStreamerLevelInfo(userId) {
    var sp = computeSpForUser(userId);
    var resolved = resolveLevelForSp(sp);
    return {
        sp: sp,
        currentLevel: resolved.current,
        nextLevel: resolved.next,
        progressPercent: resolved.progressPercent
    };
}

/**
 * تعديل عتبة/اسم مستوى SP موجود من لوحة الأدمن — لا يضيف/يحذف مستويات
 * (7 صفوف ثابتة العدد مثل frame_catalog.level بالضبط)، فقط يعدّل
 * min_sp/display_name_ar لصف موجود فعلاً.
 * @param {string} slug
 * @param {{minSp?: number, displayNameAr?: string}} updates
 * @returns {boolean} نجح التعديل فعلاً (الصف موجود)
 */
function updateStreamerLevel(slug, updates) {
    var existing = db.prepare('SELECT slug FROM streamer_levels WHERE slug = ?').get(slug);
    if (!existing) return false;

    var minSp = (updates && typeof updates.minSp === 'number' && updates.minSp >= 0) ? Math.floor(updates.minSp) : null;
    var displayNameAr = (updates && typeof updates.displayNameAr === 'string') ? updates.displayNameAr.trim() : null;

    if (minSp !== null) {
        db.prepare('UPDATE streamer_levels SET min_sp = ? WHERE slug = ?').run(minSp, slug);
    }
    if (displayNameAr !== null && displayNameAr !== '') {
        db.prepare('UPDATE streamer_levels SET display_name_ar = ? WHERE slug = ?').run(displayNameAr, slug);
    }
    return true;
}

module.exports = {
    computeSpForUser: computeSpForUser,
    listLevels: listLevels,
    getStreamerLevelInfo: getStreamerLevelInfo,
    updateStreamerLevel: updateStreamerLevel
};
