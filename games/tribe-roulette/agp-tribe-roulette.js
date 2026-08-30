/**
 * ==========================================================================
 *  AGP TRIBE ROULETTE — "روليت القبائل" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing — لا تحتاج نافذة
 * خارجية ولا postMessage إطلاقاً؛ صفحتها الخاصة
 * (games/tribe-roulette/index.html) تحمّل AGP Core كاملاً + هذا الملف
 * مباشرة.
 *
 * ⚠️ هذا الملف مبني بالكامل على أساس games/elimination-roulette/
 *   agp-elimination-roulette.js (نفس الهيكلة، نفس شاشة الإعدادات/اللوبي/
 *   الفائز، نفس آلية إرجاع "وقفت العجلة على نفس الاسم مرتين") — بطلب
 *   صريح من المستخدم ("استخدم نفس تبويب الاختيار في ملفات روليت
 *   الإقصاء"). كل تعليقات "[0.4x.x]" الموروثة من ذلك الملف أُبقيت كما هي
 *   لتوثيق أصل كل قرار تصميمي، وتنطبق هنا بنفس المنطق إلا حيث ذُكر
 *   خلاف ذلك صراحة أدناه.
 *
 * الفروقات الجوهرية عن روليت الإقصاء (بطلب صريح من المستخدم):
 *   1) عجلة حقيقية بعنصر <canvas> (مش Conic Gradient بCSS) — منقولة من
 *      كود اللعبة القديمة المستقلة (roulette-game، رفعها المستخدم)
 *      وأُعيد تلوينها بألوان المنصة الرسمية (نفس ثوابت C_ACCENT/C_PINK/
 *      C_ACCENT2 المستخدمة أصلاً بروليت الإقصاء).
 *   2) تبويب الاختيار (الإقصاء): بطاقات المرشَّحين لا تُظهر صورة/اسم
 *      اللاعب الحقيقي إطلاقاً — فقط اسم قبيلة عشوائي (من قائمة قبائل
 *      سعودية، من نفس ملف اللعبة القديمة) + شخصية مخفية (ظل/أيقونة) خلف
 *      الاسم. صاحب الدور نفسه (البطاقة الجانبية) يبقى بهويته الحقيقية —
 *      التمويه للأهداف فقط. لا فتحة "أمان" ولا فرصة فشل — كل اختيار
 *      يقصي فعلياً (نفس مبدأ روليت الإقصاء أصلاً: cada اختيار = نتيجة
 *      أكيدة، لا حاجة لأي تعديل هناك).
 *   3) تبويب الإرجاع: هوية اللاعبين المُقصَين ظاهرة بالكامل (صورة+اسم)
 *      كما بروليت الإقصاء تماماً، لكن ترتيب/رقم كل بطاقة يُعاد خلطه
 *      عشوائياً (Fisher-Yates) في كل مرة تُفتح فيها النافذة — مافيه رقم
 *      "ثابت" لاعب معيّن عبر الدورات المتتالية.
 *   4) إعلان النتيجة (بعد أي اختيار) يكشف الهوية الحقيقية دائماً — نفس
 *      دالة showResultAnnouncement الأصلية بدون أي تعديل؛ التمويه خاص
 *      بلحظة الاختيار فقط، لا بعدها.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، ثم js/agp-game-shell.js (شاشة الإعدادات +
 *   الاتصال بتيك توك + اللوبي — ملف عام، غير مُعدَّل هنا)، ثم هذا الملف.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'tribe-roulette';
    var GAME_NAME = 'روليت القبائل';
    var TIMER_NAME = 'tribe-roulette-turn';

    // ⚠️ [تصحيح هوية] ألوان "روليت القبائل" الخاصة — سماوي/بنفسجي مطابق
    // لعجلة اللعبة القديمة (#80d4ff/#330066)، بدل بنفسجي/سماوي روليت
    // الإقصاء الأصلي. C_ACCENT (المتغيّر الأساسي --tr-accent، يُستخدم
    // لحدود الصناديق العامة) صار سماوياً، C_ACCENT2 (ثانوي، يُستخدم مع
    // C_ACCENT بتدرّجات الأزرار) صار بنفسجياً — كل الأماكن اللي تستخدم
    // var(--tr-accent)/var(--tr-accent2) بهذا الملف تتحدّث تلقائياً.
    var C_ACCENT = '#80d4ff';   // سماوي أساسي (مطابق للعجلة)
    var C_ACCENT2 = '#7c3aed';  // بنفسجي ثانوي
    var C_PINK = '#ff4dff';     // وردي (يبقى بلا تغيير — خاص بحلقة "الأكثر إقصاءً" بشاشة الفائز فقط)
    var C_ACCENT_LT = '#b3e6ff';
    var C_PINK_LT = '#ff8de8';
    var C_ACCENT2_LT = '#a78bfa';

    // ⚠️ [0.45.0] نسخة غامقة من نفس ألوان العجلة أعلاه (لعجلة أغمق كما
    // طلب المستخدم) — كل لون = نفس اللون الأصلي بسطوع ~50%. راجع
    // docs/CHANGELOG.md للطريقة الحسابية.
    var C_ACCENT_DK = '#3f6a80';
    var C_ACCENT2_DK = '#3e1d76';
    var C_PINK_DK = '#7f267f';
    var C_ACCENT_LT_DK = '#597380';
    var C_PINK_LT_DK = '#7f4674';
    var C_ACCENT2_LT_DK = '#53457d';
    var WHEEL_PALETTE = [C_ACCENT_DK, C_PINK_DK, C_ACCENT2_DK, C_ACCENT_LT_DK, C_PINK_LT_DK, C_ACCENT2_LT_DK];

    // ⚠️ [0.45.0] لون العناصر الي كانت بيضاء فوق/داخل العجلة (حلقة
    // الحافة، السهم المؤشّر، حدود زر الدوران) — صار غامقاً بدل الأبيض
    // بناءً على طلب المستخدم، لكن مقصود يكون أفتح/مختلف عن ألوان العجلة
    // الغامقة أعلاه حتى يبقى مميّزاً وواضحاً فوقها (مو أسود بحت).
    var C_WHEEL_TRIM = '#9c8fb0';

    /* ======================================================================
     *  0ب) قائمة القبائل — منقولة حرفياً من كود اللعبة القديمة المستقلة
     *      (roulette-game/script.js، رفعها المستخدم) بدون أي تعديل على
     *      الأسماء نفسها. تُستخدَم حصراً لتمويه هوية الأهداف بتبويب
     *      الاختيار (الإقصاء) — راجع tribeCardHtml/randomTribeLabels أدناه.
     * ==================================================================== */
    var TRIBE_NAMES = [
        'عتيبة', 'قحطان', 'عنزة', 'حرب', 'مطير', 'شمر', 'بنو تميم', 'الدواسر',
        'زهران', 'غامد', 'يام', 'سبيع', 'السهول', 'بنو خالد', 'بنو حارث (الحارثي)',
        'بلقرن', 'بنو مالك', 'بنو شهر', 'بنو عمرو', 'بنو الأسمر (بلسمر)',
        'بنو الأحمر (بلحمر)', 'رجال ألمع', 'عسير', 'شمران', 'أكلب', 'البقوم',
        'سليم', 'جهينة', 'الاشراف', 'هذيل', 'قريش', 'ثقيف', 'بنو زيد',
        'الشرارات', 'بنو عطية', 'الحويطات', 'الحوازم', 'آل مرة', 'العجمان',
        'بنو هاجر (الهواجر)'
    ];

    /**
     * ⚠️ يبني "count" اسم قبيلة فريد للعرض على البطاقات (يكرر القائمة
     * مع ترقيم "(2)"، "(3)"... لو عدد المرشَّحين تجاوز عدد القبائل
     * المتاحة) — نفس منطق randomTribeCards() بالضبط من الملف القديم.
     * الترتيب مخلوط عشوائياً (Fisher-Yates) في كل استدعاء، فلا يوجد أي
     * ربط ثابت بين قبيلة معيّنة ولاعب معيّن عبر الدورات.
     */
    function randomTribeLabels(count) {
        var pool = [];
        while (pool.length < count) {
            pool = pool.concat(shuffleArray(TRIBE_NAMES.slice()));
        }
        pool = pool.slice(0, count);

        var seen = {};
        return pool.map(function (t) {
            seen[t] = (seen[t] || 0) + 1;
            return seen[t] > 1 ? (t + ' (' + seen[t] + ')') : t;
        });
    }

    // ⚠️ [0.45.0] قيم عملات كل هدية بحسب بحث فعلي بمصادر عامة (streamwrapped.com،
    // bettertok.app، joinotto.com) — راجع الملاحظة الصادقة بـCHANGELOG:
    // "Confetti Battle" ما لقيت له قيمة مؤكدة بأي مصدر، تظهر "؟" بدلها.
    // أيقونات الهدايا: Twemoji (jdecked/twemoji، رخصة MIT + CC-BY 4.0) —
    // مو صور تيك توك الرسمية المحمية بحقوق ملكية (تفادياً لأي انتهاك).
    var COMMON_GIFTS = [
        { label: 'وردة', value: 'Rose', codepoint: '1f339', coins: 1 },
        { label: 'تيك توك', value: 'TikTok', codepoint: '1f496', coins: 1 },
        { label: 'قلب الإصبع', value: 'Finger Heart', codepoint: '1f90d', coins: 5 },
        { label: 'جي جي', value: 'GG', codepoint: '1f3a4', coins: 1 },
        { label: 'مخروط آيسكريم', value: 'Ice Cream Cone', codepoint: '1f366', coins: 1 },
        { label: 'عطر', value: 'Perfume', codepoint: '1f9f4', coins: 20 },
        { label: 'دوناتس', value: 'Doughnut', codepoint: '1f369', coins: 30 },
        { label: 'قلوب اليد', value: 'Hand Hearts', codepoint: '1f49e', coins: 100 },
        { label: 'نظارة شمسية', value: 'Sunglasses', codepoint: '1f576', coins: 199 },
        { label: 'تاج صغير', value: 'Little Crown', codepoint: '1f451', coins: 99 },
        { label: 'كلب كورجي', value: 'Corgi', codepoint: '1f415', coins: 299 },
        { label: 'باقة ورد', value: 'Rosa', codepoint: '1f490', coins: 10 },
        { label: 'نغمة موسيقية', value: 'Music Note', codepoint: '1f3b5', coins: 169 },
        { label: 'قصاصات احتفالية', value: 'Confetti Battle', codepoint: '1f389', coins: null },
        { label: 'مجرة', value: 'Galaxy', codepoint: '1f30c', coins: 1000 },
        { label: 'مسدس نقود', value: 'Money Gun', codepoint: '1f4b8', coins: 500 },
        { label: 'سيارة رياضية', value: 'Sports Car', codepoint: '1f3ce', coins: 7000 },
        { label: 'أسد', value: 'Lion', codepoint: '1f981', coins: 29999 },
        { label: 'ملكة الدراما', value: 'Drama Queen', codepoint: '1f483', coins: 5 },
        { label: 'كون تيك توك', value: 'TikTok Universe', codepoint: '1f320', coins: 44999 }
    ];

    var TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/';
    function giftIconUrl(g) { return TWEMOJI_BASE + g.codepoint + '.svg'; }
    function giftCoinsText(g) { return (g.coins != null) ? (g.coins + ' 🪙') : '؟'; }

    var ELIMINATION_TIMER_OPTIONS = [20, 25, 30, 40].map(function (s) {
        return { label: s + 'ث', value: s };
    });

    // ⚠️ [0.48.0] موشر تكبير/تصغير العجلة — حدود الحجم بالبكسل + القيمة
    // الافتراضية (تطابق 440px القديمة الثابتة). القيمة الحالية تُحفَظ
    // بمتغيّر وحدة (_wheelSizePx أدناه مع بقية حالة المباراة) حتى تبقى
    // كما هي عبر renderStage() المتكرّرة (إعادة مباراة بنفس اللاعبين...).
    var WHEEL_SIZE_MIN = 260;
    var WHEEL_SIZE_MAX = 640;
    var WHEEL_SIZE_DEFAULT = 440;
    var _wheelSizePx = WHEEL_SIZE_DEFAULT; // يبقى كما هو عبر renderStage() المتكرّرة (خارج resetMatchState() عمداً)

    /* ======================================================================
     *  0) الصوت — أربعة مقاطع مولَّدة برمجياً (راجع الملاحظة الصادقة أعلى
     *     الملف) + مستوى صوت قابل للتعديل حياً من الإعدادات.
     * ==================================================================== */
    var SOUND_BASE = 'sounds/';
    var _sounds = {
        spin: new Audio(SOUND_BASE + 'spin.wav'),
        eliminate: new Audio(SOUND_BASE + 'eliminate.wav'),
        revive: new Audio(SOUND_BASE + 'revive.wav'),
        warning: new Audio(SOUND_BASE + 'warning-beep.wav')
    };

    function currentVolume() {
        var settings = AGP.gameShell && AGP.gameShell.getSettings ? AGP.gameShell.getSettings() : {};
        var v = settings.soundVolume;
        if (v === undefined || v === null || isNaN(v)) v = 7;
        return Math.max(0, Math.min(10, v)) / 10;
    }

    function playSound(name) {
        var a = _sounds[name];
        if (!a) return;
        // ⚠️ [0.45.11] إصلاح خلل حقيقي: لو مستوى الصوت صفر، الكود كان
        // يستدعي play() فعلياً (بس بصوت صامت volume=0) بدل تجاهل الاستدعاء
        // بالكامل. على iOS تحديداً، مجرد استدعاء play() على أي عنصر
        // <audio> (حتى بصوت صفر) يخلي Safari يستولي على جلسة الصوت
        // ويسكت أي صوت آخر شغّال بالخلفية بجهاز الاستريمر (موسيقى من
        // تطبيق ثاني مثلاً) — هذا سلوك نظام iOS نفسه، لا يوجد أي API
        // متاح لصفحات الويب يطلب استثناءً منه (خاص بالتطبيقات الأصلية
        // فقط). الحل الوحيد الفعلي: عدم استدعاء play() إطلاقاً لو مستوى
        // الصوت صفر، فما تلمس اللعبة نظام الصوت من الأساس ولا سبب يخلي
        // iOS يسكت الصوت الآخر.
        if (currentVolume() <= 0) return;
        try {
            a.volume = currentVolume();
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () { /* المتصفح يمنع أحياناً تشغيلاً تلقائياً قبل أول تفاعل مستخدم — تجاهل صامت */ });
            }
        } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين، لا يوقف اللعبة */ }
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية (محلية بالكامل لهذا الملف)
     * ==================================================================== */
    var _alive = [];
    var _eliminated = [];       // { player }
    var _lastWheelWinnerId = null;
    var _repeatStreak = 0;
    var _settings = null;
    var _startedAt = null;
    var _matchActive = false;
    var _pendingTurn = null;    // { type: 'eliminate'|'revive', candidates: [...], chooser }
    var _commentUnsub = null;
    var _giftUnsub = null;
    var _giftReviveCounts = {}; // playerId -> عدد مرات الإنعاش بالدعم المستخدَمة (طول المباراة)
    var _friendRevivedIds = {}; // playerId -> true (استُخدمت له فرصة "انعاش صديق" مرة، مرة واحدة طول عمره بالمباراة)
    var _eliminationCounts = {}; // playerId (المُقصي) -> عدد من أقصاهم فعلياً
    // ⚠️ [0.46.0] حالة "العب" (الدوران التلقائي) — راجع handleAutoPlayToggle/maybeAutoSpin/stopAutoPlay.
    var _autoPlayActive = false;
    var _autoPlayTimer = null;

    // ⚠️ [نافذة الاختيار الجديدة] فهرس المرشَّح المُختار يدوياً بنافذة
    // الإقصاء (النقر على بطاقة = تحديد فقط، الإقصاء الفعلي يصير بالزر
    // الأحمر — راجع selectCandidateManually/handleForceEliminateClick).
    // null يعني "بدون اختيار يدوي" فيقصي الزر صاحب الدور نفسه افتراضياً.
    var _selectedCandidateIdx = null;
    // ⚠️ [تبويب "عودة لاعب" الجديد] معرِّف setTimeout الخاص بإخفائه
    // تلقائياً — راجع showReviveSplash() أدناه.
    var _reviveSplashTimer = null;

    function resetMatchState() {
        _alive = [];
        _eliminated = [];
        _lastWheelWinnerId = null;
        _repeatStreak = 0;
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _pendingTurn = null;
        _giftReviveCounts = {};
        _friendRevivedIds = {};
        _eliminationCounts = {};
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        _autoPlayActive = false;
        _selectedCandidateIdx = null;
        if (_reviveSplashTimer) { window.clearTimeout(_reviveSplashTimer); _reviveSplashTimer = null; }
        var splashOverlay = el('tr-revive-splash-overlay');
        if (splashOverlay) splashOverlay.style.display = 'none';
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }

    /* ======================================================================
     *  2) أدوات DOM صغيرة
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }

    /**
     * ⚠️ [0.46.0] إصلاح فعلي لثغرة نقاط: player.name هو الاسم المستعار
     * (nickname) بتيك توك، وليس اليوزرنيم الحقيقي (@handle) المستخدَم
     * فعلياً بمطابقة الباك إند (auth-service.js findVerifiedUserByTikTok
     * يقارن tiktok_username الحقيقي المُدخَل يدوياً وقت التوثيق —
     * dashboard-auth.js). اليوزرنيم الحقيقي (uniqueId) متوفر فقط داخل
     * player.id بصيغة 'tiktok:'+uniqueId (راجع
     * backend/platforms/tiktok/tiktok-connector.js extractUser()) —
     * الحل: نستخرجه من id، لا من name. نفس الدالة مكرَّرة بـ
     * dashboard-core/js/dashboard-core.js لنفس السبب (ملف مشترك منفصل).
     */
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }

    function findPlayerByIdAnywhere(id) {
        var found = _alive.filter(function (p) { return p.id === id; })[0];
        if (found) return found;
        var entry = _eliminated.filter(function (e) { return e.player.id === id; })[0];
        if (entry) return entry.player;
        if (AGP.gameManager && typeof AGP.gameManager.getPlayers === 'function') {
            return AGP.gameManager.getPlayers().filter(function (p) { return p.id === id; })[0] || null;
        }
        return null;
    }

    // ⚠️ [0.45.9] خط "Zain" — طلب صريح (خط أوضح لشاشات الإعدادات/عناوين
    // التبويبات وغيرها). يُحمَّل هنا فقط (لا يُلمَس js/agp-game-shell.js
    // المشترك ولا أي لعبة أخرى) — نفس رابط Google Fonts المرسَل بالضبط،
    // بحارس (guard) بمعرِّف العنصر يمنع التكرار لو استُدعيت الدالة أكثر
    // من مرة.
    function ensureZainFont() {
        if (el('tr-zain-font-link')) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = 'tr-zain-font-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(pre1);
        document.head.appendChild(pre2);
        document.head.appendChild(sheet);
    }

    function injectStageStyles() {
        if (el('tr-stage-styles')) return;
        ensureZainFont();
        var style = document.createElement('style');
        style.id = 'tr-stage-styles';
        style.textContent = [
            ':root{--tr-accent:' + C_ACCENT + ';--tr-accent2:' + C_ACCENT2 + ';--tr-pink:' + C_PINK + ';}',

            // ⚠️ [0.45.9] خط "Zain" يطغى على كل خطوط اللعبة — أوضح للقراءة
            // بحسب طلب المستخدم. Cairo يبقى احتياطياً (fallback) لو تأخّر
            // تحميل الخط. ملاحظة تقنية: body{font-family:...} وحده لا
            // يكفي — أي عنصر له font-family مُحدَّد مباشرة عليه (كل
            // العناوين/الأزرار/التسميات هنا وبالملف المشترك) يتجاهل قيمة
            // الوراثة من body حتى لو !important، لأن التوريث أضعف من أي
            // تطابق مباشر. الحل: تطبيق !important على كل عنصر مباشرة عبر
            // محدِّد "*" داخل كل حاويات اللعبة (شاشة اللعب + الحاوية
            // المشتركة للإعدادات/اللوبي #agp-shell-overlay + نافذة
            // الإقصاء/الفائز + التوست وسجل الأحداث) — يطغى فوراً بغضّ
            // النظر عن الخصوصية لأنه الوحيد المُعلَّم !important، ودون أي
            // لمس لملف js/agp-game-shell.js المشترك نفسه أو أي لعبة أخرى
            // (المحدِّدات هنا خاصة بعناصر روليت الإقصاء فقط).
            '#agp-shell-overlay,#agp-shell-overlay *,#tr-stage,#tr-stage *,',
            '#tr-modal-overlay,#tr-modal-overlay *,#tr-toast-wrap,#tr-toast-wrap *,',
            '#tr-event-log,#tr-event-log *{font-family:"Zain",Cairo,sans-serif !important;}',

            '#tr-stage{position:fixed;inset:0;padding-top:70px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:flex-start;gap:14px;overflow-y:auto;font-family:Cairo,sans-serif;direction:rtl;color:#f3eefc;}',

            /* ---- [0.48.0] موشر تكبير/تصغير العجلة — عنصر عادي بترتيب
             * العمود (#tr-stage flex-direction:column) بين العجلة وزر
             * إعادة الترتيب العشوائي، حتى يتحرك الأخير تلقائياً معه لما
             * يتغيّر حجم العجلة فوقه (بدل التموضع المطلق). */
            '#tr-wheel-zoom-row{display:flex;align-items:center;gap:10px;font-size:0.82em;color:#e9d3ff;}',
            '#tr-wheel-zoom-slider{width:170px;accent-color:var(--tr-accent2);cursor:pointer;}',

            /* ---- زر إعادة الترتيب العشوائي (تحت العجلة) ---- */
            '#tr-shuffle-btn{margin-top:2px;padding:9px 22px;border-radius:999px;',
            'border:1px solid var(--tr-accent2);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:700;font-size:0.85em;cursor:pointer;}',
            '#tr-shuffle-btn:disabled{opacity:0.4;cursor:not-allowed;}',
            '#tr-shuffle-btn:not(:disabled):hover{background:rgba(255,255,255,0.16);}',

            /* ---- العجلة الحقيقية (canvas 2D + حلقة مصابيح) — منقولة
             * ومُعاد تلوينها من كود اللعبة القديمة المستقلة (بدل
             * Conic Gradient بـCSS المستخدَم بروليت الإقصاء؛ الدوران نفسه
             * يُرسَم مباشرة كل إطار بـJS، لا CSS transition هنا إطلاقاً).
             * ⚠️ [0.45.0] margin-top زاد من 8px لـ46px (نزول العجلة شوي
             * كما طلب المستخدم، تقريباً 1 سم — قياس تقريبي غير دقيق). */
            // ⚠️ [0.45.7] إصلاح خلل حقيقي: width وheight كانا يُحسَبان بصيغتين
            // منفصلتين (min(440px,88vw) لكل واحد) — عند مستويات تكبير معيّنة
            // بالمتصفح (Ctrl+، مثلاً 175%/200%) يحسبهما Chromium بقيمتين
            // مختلفتين فعلياً رغم تطابق الصيغة نصياً (خلل استُنسِخ وأُكِّد
            // فعلياً بمتصفح آلي)، فتصير العجلة بيضاوية بدل مربّعة. الحل:
            // width فقط عبر نفس الصيغة، وheight يُشتَق منها تلقائياً عبر
            // aspect-ratio:1 — قيمة واحدة محسوبة، صفر احتمال تباعد بينهما.
            '#tr-wheel-wrap{position:relative;width:min(440px,88vw);aspect-ratio:1;margin-top:46px;}',
            '#tr-wheel-bezel{position:absolute;inset:-14px;border-radius:50%;',
            'background:linear-gradient(135deg,var(--tr-accent2),var(--tr-accent),var(--tr-pink));',
            'box-shadow:0 0 46px rgba(124,58,237,0.65),inset 0 0 0 6px rgba(156,143,176,0.25);}',
            '.tr-bulb{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff8dd;',
            'box-shadow:0 0 8px 2px rgba(255,244,180,0.85);}',
            /* ⚠️ [0.45.0] حلقة العجلة كانت بيضاء (rgba(255,255,255,0.92))
             * — صارت C_WHEEL_TRIM (غامقة لكن أفتح/مختلفة عن ألوان
             * العجلة الغامقة نفسها، حتى تبقى مميّزة فوقها). */
            '#tr-wheel-canvas{position:absolute;inset:8px;display:block;border-radius:50%;',
            'border:5px solid ' + C_WHEEL_TRIM + ';box-shadow:inset 0 0 30px rgba(0,0,0,0.35);}',
            '#tr-wheel-pointer{position:absolute;top:-20px;left:50%;transform:translateX(-50%);',
            'width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;',
            'border-top:26px solid ' + C_WHEEL_TRIM + ';z-index:6;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}',

            /* ---- محور المنتصف = زر الدوران (شعار + كلمة "دور") ---- */
            '#tr-spin-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:7;',
            'width:104px;height:104px;border-radius:50%;border:4px solid ' + C_WHEEL_TRIM + ';cursor:pointer;',
            'background:radial-gradient(circle at 35% 30%,#2a1443,#0e0e16);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
            'box-shadow:0 0 24px rgba(0,194,255,0.6),0 4px 10px rgba(0,0,0,0.5);padding:0;}',
            '#tr-spin-hub img{width:44px;height:44px;object-fit:contain;border-radius:50%;}',
            '#tr-spin-hub span{font-size:0.82em;font-weight:900;color:#fff;font-family:Almarai,Cairo,sans-serif;}',
            '#tr-spin-hub:disabled{opacity:0.55;cursor:not-allowed;}',
            '#tr-spin-hub:not(:disabled):hover{box-shadow:0 0 34px rgba(0,194,255,0.85),0 4px 14px rgba(0,0,0,0.5);}',

            /* ---- نافذة الدور (إقصاء/إرجاع) — 1300×800 ----
             * ⚠️ [0.45.0] عرّض من 1200 لـ1300، وصار بنفس تدريج/ألوان
             * صورة 4 (884B98 → 2D1932) بدل التدريج الفاتح القديم، والخط
             * أبيض بدل البنفسجي الغامق القديم. */
            // ⚠️ [0.46.0] flex-direction:column + gap: تسمح لبطاقة الاختيار
            // الجديدة (#tr-modal-chooser-card) بالظهور فوق الصندوق كعنصر
            // شقيق منفصل بفاصل واضح (مو تراكب/overlap) — بدل التموضع
            // المطلق القديم.
            '#tr-modal-overlay{position:fixed;inset:0;z-index:100010;display:none;flex-direction:column;',
            'align-items:center;justify-content:center;gap:18px;padding:16px;background:rgba(8,4,16,0.72);}',
            // ⚠️ [0.44.0] تعديل: height ثابتة 800px كانت تترك فراغاً فارغاً
            // كبيراً أسفل المحتوى بالتبويبات الأقصر (منبثقة اختيار الهدية،
            // إعلان النتيجة، شاشة الفائز) — نفس الملاحظة اللي طلعت
            // بالاختبار البصري لصندوق شاشة الإعدادات المشتركة. حوّلتها
            // لـheight:auto مع max-height:800px (سقف أقصى فقط).
            // ⚠️ [0.45.8] تدرّج الخلفية (884B98→2D1932) صار (5F3976→211528) —
            // نفس التدرّج بالضبط طلبه المستخدم موحَّداً بكل "تبويبات"
            // اللعبة (الإعدادات/اللوبي/الإقصاء/الإنعاش/الفائز)، راجع
            // التعليق المطابق بـ#agp-shell-box أدناه لشاشتي الإعدادات واللوبي.
            '#tr-modal-box{width:1300px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--tr-accent);border-radius:20px;',
            'padding:28px 32px;color:#fff;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '#tr-modal-box h2{margin:0 0 6px;font-size:1.5em;text-align:center;color:#fff;font-weight:800;',
            'font-family:Almarai,Cairo,sans-serif;}',
            // ⚠️ [0.45.8] تبويب "اختيار الإقصاء" تحديداً يتميّز بحدّ وعنوان
            // أخضرين (بدل الأساسي البنفسجي) — طلب صريح، بينما تبويب
            // "انعاش الصديق" (نفس الصندوق، roleClass مختلف) يبقى بالمظهر
            // الأساسي بدون تمييز. الكلاس tr-role-eliminate/tr-role-revive
            // يُضاف على #tr-modal-box نفسه من renderTurnModal() (بدل
            // تفريغه بالكامل كما كان سابقاً).
            '#tr-modal-box.tr-role-eliminate{border-color:#22c55e;}',
            '#tr-modal-box.tr-role-eliminate h2{color:#22c55e;}',
            /* اسم صاحب الدور وكلمة "يختار!" — كل وحدة مميَّزة بلون مختلف
             * ⚠️ [0.45.0] طلب صريح: تمييز الاسم عن كلمة "يختار!" بألوان
             * مختلفة (كانا سطراً واحداً بلون واحد سابقاً) — يطبَّق تلقائياً
             * على نافذتي الإقصاء والإرجاع لأنهما يستخدمان نفس الدالة. */
            /* ---- [0.46.0] "بطاقة اختيار" فوق نافذة الدور — تحل محل نص
             * "الاسم يختار!" القديم بالكامل. دائرة أفاتار بحلقة ملوَّنة
             * (أخضر لنافذة الإقصاء، أحمر لنافذة الإرجاع — بالضبط كما أكّد
             * المستخدم رغم كونه عكس المتوقَّع منطقياً) + الاسم تحتها. */
            '#tr-modal-chooser-card{display:none;flex-direction:column;align-items:center;gap:6px;}',
            '.tr-chooser-card-ring{position:relative;width:110px;height:110px;border-radius:50%;',
            'padding:5px;box-sizing:border-box;}',
            '.tr-chooser-card-ring.tr-role-eliminate{background:#22c55e;box-shadow:0 0 22px rgba(34,197,94,0.65);}',
            '.tr-chooser-card-ring.tr-role-revive{background:#ef4444;box-shadow:0 0 22px rgba(239,68,68,0.65);}',
            '.tr-chooser-card-inner{width:100%;height:100%;border-radius:50%;background:#2D1932;overflow:hidden;}',
            '.tr-chooser-card-name{font-size:1.15em;font-weight:900;color:#fff;text-align:center;}',
            // ⚠️ [0.45.7] زرّا تحكّم يدوي جديدان للمضيف — يظهران فقط بنافذة
            // الإقصاء (roleClass tr-role-eliminate)، مبنيان بـchooserCardHtml().
            // بديل يدوي اختياري لآلية كتابة الرقم بشات البث الموجودة أصلاً
            // — الاثنان يبقيان شغّالين معاً (لا إلغاء لأي منهما).
            // ⚠️ [0.45.12] تعديل صريح: الزرّان كانا فوق بعض عمودياً (column)
            // بعرض 200px موحّد للاثنين — صار بجانب بعض أفقياً (row) بطلب
            // المستخدم، كل زر ياخذ نصف المساحة (flex:1) بدل عرض ثابت.
            // ⚠️ [0.45.13] إصلاح: width:100% كانت تحسب نسبة لعرض الحاوية
            // الأب (#tr-modal-chooser-card) اللي بدورها auto-width بحجم
            // أضيق محتوى (حلقة الأفاتار 110px) — فعملياً الصف كان يضيق
            // كثيراً (~277px)، ونص زر "إقصاء صاحب الدور" كان ينكسر
            // لسطرين ويطوّل الزر — طلب صريح: عرض ثابت أوسع (380px) بدل
            // النسبة المئوية، يفرض على الحاوية الأب تتوسع لتلائمه، فيصير
            // فيه مساحة كافية لكل النص بسطر وحد + الزر يصير أقصر ارتفاعاً.
            '.tr-chooser-actions{display:flex;flex-direction:row;gap:8px;margin-top:12px;',
            'width:380px;max-width:92vw;}',
            '.tr-chooser-action-btn{flex:1;padding:9px 8px;border-radius:999px;border:none;font-weight:800;',
            'cursor:pointer;font-family:inherit;font-size:0.85em;color:#fff;white-space:nowrap;',
            'line-height:1.3;transition:transform 0.15s,box-shadow 0.15s;}',
            '.tr-chooser-action-btn:hover{transform:translateY(-2px);}',
            '.tr-chooser-action-eliminate{background:linear-gradient(90deg,#ef4444,#b91c1c);',
            'box-shadow:0 4px 14px rgba(239,68,68,0.45);}',
            '.tr-chooser-action-resume{background:linear-gradient(90deg,var(--tr-accent2),var(--tr-accent));',
            'box-shadow:0 4px 14px rgba(124,58,237,0.45);}',
            '#tr-modal-sub{text-align:center;color:#e9d3ff;font-size:0.95em;margin-bottom:10px;}',
            '#tr-modal-timer{text-align:center;font-weight:900;font-size:2.2em;color:#ffe066;margin-bottom:16px;',
            'transition:color 0.2s;}',
            '#tr-modal-timer.tr-timer-warning{color:#ff4d6d;animation:tr-pulse 1s infinite;}',
            '@keyframes tr-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}',

            /* ---- [0.45.8] بطاقات مرشَّحين أُعيد تصميمها مرة أخرى — شبكة
             * أفقية (4 بطاقات بالصف الواحد) بدل الصفوف العمودية المتراكبة
             * السابقة ([0.45.7])، بطلب صريح بعد مراجعة الشكل على الموقع
             * الحي: كل بطاقة الآن مربّعة الشكل تقريباً بخلفية سوداء صريحة،
             * تحتوي الصورة + رقم الاختيار + الاسم بجانب بعض، بحجم مريح
             * للقراءة من جوال أثناء البث المباشر. نفس البنية تُستخدَم
             * تلقائياً بنافذتي الإقصاء والإرجاع معاً (دالة renderTurnModal
             * واحدة مشتركة بين الاثنتين). */
            // ⚠️ [0.45.12] تكبير بطاقات المرشَّحين بطلب صريح (أرقام محددة من
            // المستخدم): عرض البطاقة 270→290px، الأفاتار 44→47px، رقم
            // البطاقة 32→34px، خط الاسم ~15px→17px (انظر تعليق أدناه).
            '#tr-candidates-grid{display:flex;flex-flow:row wrap;gap:14px;justify-content:center;',
            'width:100%;max-width:1180px;margin:0 auto;}',
            '.tr-candidate-card{display:flex;align-items:center;gap:10px;cursor:pointer;',
            'width:290px;box-sizing:border-box;background:#000;border:1px solid rgba(255,255,255,0.18);',
            'border-radius:16px;padding:10px 14px;transition:background 0.15s,transform 0.15s;}',
            '.tr-candidate-card:hover{background:#1a1a1a;transform:translateY(-2px);}',
            '.tr-candidate-num{color:#000000;border-radius:50%;width:34px;height:34px;flex-shrink:0;',
            'display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.95em;}',
            // ⚠️ [0.45.8] رقم بطاقة "الإقصاء" تحديداً صار أخضر مميَّز (بدل
            // اللون البنفسجي الأساسي) — طلب صريح لتمييز تبويب الإقصاء عن
            // بقية التبويبات، بنفس الأخضر المستخدم أصلاً بحلقة "صاحب
            // الدور" (tr-role-eliminate) لنفس النافذة، للتناسق.
            // ⚠️ [0.45.13] طلب صريح: رقم البادج الأخضر (الإقصاء) تحديداً
            // يكبر ويكون أوضح أكثر من الرقم الأساسي (34px) — البادج
            // الأرجواني (نافذة الإرجاع) يبقى بحجمه بدون تغيير.
            '.tr-candidate-num.tr-role-eliminate{background:#22c55e;width:40px !important;',
            'height:40px !important;font-size:1.15em !important;}',
            // ⚠️ [0.45.13] شارة "🔴 مرحلة الإقصاء" — تظهر فقط بأعلى نافذة
            // اختيار الإقصاء (isEliminate)، طلب صريح لتوضيح المرحلة
            // الحالية للمشاهدين بالبث.
            '.tr-phase-badge-wrap{text-align:center;margin-bottom:8px;}',
            '.tr-phase-badge{display:inline-block;padding:4px 16px;border-radius:999px;',
            'background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.65);color:#22c55e;',
            'font-weight:900;font-size:0.85em;letter-spacing:0.3px;}',
            // ⚠️ بطاقة اللاعب المشتركة (agp-pcard) داخل شبكة المرشَّحين هنا
            // فقط — تكبير الصورة/الاسم بمحدِّدات مقيَّدة بـ#tr-candidates-grid
            // (لا تلمس .agp-pcard بأي مكان آخر بالمنصة، ولا الملف المشترك
            // نفسه) + !important لضمان الأولوية بغضّ النظر عن ترتيب حقن
            // الأنماط بين هذا الملف وjs/agp-player-card.js.
            '#tr-candidates-grid .agp-pcard{display:flex !important;flex:1;flex-direction:row-reverse;',
            'align-items:center;gap:10px;min-width:0;}',
            '#tr-candidates-grid .agp-pcard-avatar-basic{width:47px !important;height:47px !important;',
            'flex-shrink:0;}',
            // ⚠️ [0.45.12] المستخدم طلب "1.20em و 17px" لخط اسم المرشَّح —
            // القيمتان لا تتطابقان تماماً إلا بافتراض حجم أساس غير معتاد،
            // فاستُخدمت القيمة الصريحة غير الملتبسة (17px) مباشرةً.
            '#tr-candidates-grid .agp-pcard-name-basic{font-size:17px !important;font-weight:800 !important;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.tr-candidate-num.tr-role-revive{background:var(--tr-accent2);}',

            /* ---- بطاقة "قبيلة" (تبويب الاختيار/الإقصاء فقط) — هوية
             * الهدف مخفية: دائرة "شخصية مخفية" (❔ فوق خلفية غامقة) بدل
             * صورة اللاعب الحقيقية، بنفس أبعاد الأفاتار الأساسية
             * (47px) حتى يتطابق ارتفاع الصف مع تبويب الإرجاع (playerCardHtml). ---- */
            '.tr-tribe-pcard{display:flex;flex:1;flex-direction:row-reverse;',
            'align-items:center;gap:10px;min-width:0;}',
            '.tr-tribe-avatar{width:47px;height:47px;flex-shrink:0;border-radius:50%;',
            'background:radial-gradient(circle at 35% 30%,#3e1d76,#150a29);',
            'border:1px solid rgba(255,255,255,0.22);display:flex;align-items:center;',
            'justify-content:center;font-size:1.3em;color:rgba(255,255,255,0.75);}',
            '.tr-tribe-name{font-size:17px;font-weight:800;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',

            /* ---- تبويب إعلان النتيجة (4 ثوانٍ) ----
             * ⚠️ [0.44.0] إصلاح: كانت هذي القواعد مكتوبة بمُحدِّد ID
             * (#tr-announce-box) بينما الكود يطبّقها فعلياً كـclassName
             * على نفس صندوق #tr-modal-box (id يبقى tr-modal-box دائماً) —
             * فما كانت تُطابَق إطلاقاً، وتبويب الإعلان كان يظهر بدون أي
             * تنسيق (نص متكدّس بالزاوية). صُححت لمحدِّدات class. */
            /* ⚠️ [0.45.0] ألوان الإعلان (كانت مصمَّمة لخلفية فاتحة) كُبِّرت
             * سطوعاً لتبقى مقروءة فوق الخلفية الغامقة الجديدة — تعديل
             * تقني ضروري للقراءة، مو مطلوباً صراحة بس لازم للتناسق. */
            /* ---- [0.46.0] إعادة تصميم كاملة لتبويب إعلان النتيجة —
             * صندوق صغير (~650×300) بجملة واحدة "اللاعب [أفاتار+اسم] قام
             * بإقصاء/بإرجاع [أفاتار+اسم]" بدل الأيقونة+العنوان+الاسم
             * الكبير القديم. تُستخدَم أيضاً بإعلان إنعاش "انعاش صديق". */
            '#tr-modal-box.tr-announce-box{width:650px;max-width:92vw;height:auto;max-height:300px;',
            'display:flex;align-items:center;justify-content:center;padding:30px 24px;}',
            '.tr-announce-box .tr-announce-sentence{font-size:1.25em;font-weight:800;text-align:center;',
            'line-height:2.4;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}',
            '.tr-announce-person{display:inline-flex;flex-direction:column;align-items:center;gap:4px;',
            'vertical-align:middle;}',
            '.tr-announce-avatar-wrap{display:block;width:106px;height:106px;border-radius:50%;position:relative;}',
            '.tr-announce-avatar-wrap .tr-ring-avatar,.tr-announce-avatar-wrap .tr-ring-avatar--fallback{',
            'width:106px;height:106px;}',
            '.tr-announce-person-name{font-size:0.55em;font-weight:800;color:#fff;}',
            /* تأثير أحمر خلف صورة المُقصى + تلاشي الصورة */
            '.tr-announce-effect-red{box-shadow:0 0 0 6px rgba(255,77,109,0.25),0 0 30px 10px rgba(255,77,109,0.55);',
            'border-radius:50%;}',
            '@keyframes tr-target-fadeout{0%{opacity:1;}60%{opacity:1;}100%{opacity:0.15;}}',
            '.tr-announce-target-fadeout img,.tr-announce-target-fadeout .tr-ring-avatar--fallback{',
            'animation:tr-target-fadeout 2.6s ease forwards;}',
            /* تأثير أخضر خلف صورة المُرجَع + تحوّل الحلقة من أحمر لأخضر */
            '.tr-announce-effect-green{box-shadow:0 0 0 6px rgba(74,222,128,0.25),0 0 30px 10px rgba(74,222,128,0.55);',
            'border-radius:50%;}',
            '@keyframes tr-target-revive-ring{0%{box-shadow:0 0 0 6px rgba(255,77,109,0.35),0 0 30px 10px rgba(255,77,109,0.5);}',
            '100%{box-shadow:0 0 0 6px rgba(74,222,128,0.25),0 0 30px 10px rgba(74,222,128,0.55);}}',
            '.tr-announce-target-revive-ring{animation:tr-target-revive-ring 1.6s ease forwards;}',
            /* بطاقة إنعاش-بالهدية العائمة (toast غير مقاطِع — راجع showGiftReviveCard) */
            '.tr-gift-revive-card{display:flex;align-items:center;gap:10px;background:rgba(20,8,35,0.95);',
            'border:1px solid rgba(74,222,128,0.55);color:#f3eefc;padding:8px 18px 8px 8px;border-radius:999px;',
            'font-size:0.85em;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,0.4);}',
            '.tr-gift-revive-card .tr-announce-avatar-wrap{width:40px;height:40px;}',
            '.tr-gift-revive-card .tr-announce-avatar-wrap .tr-ring-avatar,',
            '.tr-gift-revive-card .tr-announce-avatar-wrap .tr-ring-avatar--fallback{width:40px;height:40px;font-size:0.8em;}',

            /* ======================================================================
             *  [نافذة "مرحلة الاختيار" الجديدة] — منقولة بالحرف من التصميم
             *  الأخير المعتمَد فعلياً بروليت الإقصاء (#er-select-overlay/box)،
             *  بطلب صريح، بألوان هوية روليت القبائل (سماوي/بنفسجي) بدل
             *  بنفسجي/وردي روليت الإقصاء. تحل محل الصندوق القديم
             *  (#tr-modal-overlay/box) لخصوص نافذتَي الإقصاء/الإرجاع فقط —
             *  ذاك الصندوق يبقى مستخدَماً بدون تغيير لتبويب إعلان النتيجة
             *  وشاشة الفائز ونافذة اختيار الهدية (خارج نطاق هذا الطلب).
             * ==================================================================== */
            '#tr-select-overlay{position:fixed;inset:0;z-index:99990;display:none;align-items:center;',
            'justify-content:center;background:rgba(8,4,16,0.72);padding:16px;}',
            '#tr-select-box{width:1150px;max-width:97vw;height:700px;max-height:94vh;border-radius:20px;',
            'padding:14px 18px 18px;box-sizing:border-box;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--tr-accent);position:relative;overflow:hidden;',
            'box-shadow:0 0 50px rgba(128,212,255,0.45);display:flex;flex-direction:column;}',
            // ⚠️ نفس تمييز الأحمر/الأخضر المعتمَد أصلاً (إقصاء=أحمر بأرقام
            // المرشَّحين وعنوان التبويب، إرجاع=أخضر) — لغة ألوان وظيفية
            // (خطر/أمان) منفصلة عن هوية اللعبة نفسها، بلا تغيير.
            '#tr-select-box.tr-role-eliminate{border-color:#22c55e;}',
            '#tr-select-box.tr-role-revive{border-color:#ef4444;}',
            '#tr-select-box::before{content:"";position:absolute;inset:0;background:url(../../logo.png) no-repeat center;',
            'background-size:220px auto;opacity:0.2;pointer-events:none;}',
            '#tr-select-box > *{position:relative;z-index:1;}',
            '#tr-select-title{text-align:center;font-size:0.92em;color:#9d92b3;margin-bottom:6px;flex:none;}',
            '#tr-select-title b{color:var(--tr-accent);font-weight:900;}',
            '#tr-select-box.tr-role-eliminate #tr-select-title b{color:#ef4444;}',
            '#tr-select-box.tr-role-revive #tr-select-title b{color:#22c55e;}',
            /* ---- صف واحد: بطاقة صاحب الدور المكبَّرة + الأزرار (متمركزان معاً) ---- */
            '#tr-chooser-row{display:flex;align-items:center;justify-content:center;gap:26px;margin-bottom:12px;flex:none;}',
            '.tr-select-chooser-card{display:flex;align-items:center;gap:12px;}',
            '.tr-select-chooser-ring{width:88px;height:88px;border-radius:50%;padding:4px;box-sizing:border-box;flex:none;}',
            '.tr-select-chooser-ring.tr-role-eliminate{background:#22c55e;box-shadow:0 0 22px rgba(34,197,94,0.65);}',
            '.tr-select-chooser-ring.tr-role-revive{background:#ef4444;box-shadow:0 0 22px rgba(239,68,68,0.65);}',
            '.tr-select-chooser-ring .tr-ring-avatar,.tr-select-chooser-ring .tr-ring-avatar--fallback{width:100%;height:100%;font-size:1.5em;}',
            '.tr-select-chooser-nmrow{display:flex;align-items:center;gap:10px;margin-top:1px;}',
            '.tr-select-chooser-nm{font-size:1.35em;font-weight:900;color:#fff;}',
            '#tr-select-actions{display:flex;flex-direction:row;gap:8px;width:230px;flex:none;}',
            '#tr-select-actions button{flex:1;padding:9px 6px;border-radius:999px;border:none;font-weight:800;',
            'cursor:pointer;font-family:inherit;font-size:0.74em;color:#fff;white-space:nowrap;line-height:1.3;',
            'transition:transform 0.15s,box-shadow 0.15s;}',
            '#tr-select-actions button:hover{transform:translateY(-2px);}',
            '#tr-select-resume-btn{background:linear-gradient(90deg,var(--tr-accent2),var(--tr-accent));',
            'box-shadow:0 4px 14px rgba(128,212,255,0.4);}',
            '#tr-force-eliminate-btn{background:linear-gradient(90deg,#ef4444,#b91c1c);',
            'box-shadow:0 4px 14px rgba(239,68,68,0.45);}',
            /* ---- المؤقّت — سطر مستقل بعد صف صاحب الدور، بارز وكبير ---- */
            '#tr-select-timer{text-align:center;font-weight:900;font-size:1.5em;color:#ffe066;margin-bottom:10px;',
            'flex:none;transition:color 0.2s;}',
            '#tr-select-timer.tr-timer-warning{color:#ff4d6d;animation:tr-pulse 1s infinite;}',
            /* ---- شبكة المرشّحين — ٤ أعمدة ثابتة، بطاقة لوبي-قياسي-v1 ---- */
            '#tr-select-candidates-grid{flex:1;min-height:0;overflow-y:auto;display:grid;',
            'grid-template-columns:repeat(4,1fr);gap:0.5cm;align-content:flex-start;padding:4px 2px 6px;}',
            '.tr-select-cand-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;}',
            '.tr-select-cand-row{display:inline-flex;align-items:center;}',
            '.tr-select-cand-avatar{width:60px;height:60px;border-radius:50%;flex:none;position:relative;z-index:2;',
            'overflow:hidden;box-sizing:border-box;border:3px solid rgba(255,255,255,0.55);}',
            '.tr-select-cand-avatar .tr-ring-avatar,.tr-select-cand-avatar .tr-ring-avatar--fallback{width:100%;height:100%;font-size:1.1em;}',
            // ⚠️ خاص بروليت القبائل: بديل الأفاتار المخفي (تبويب الإقصاء
            // فقط) — نفس أبعاد/موضع .tr-select-cand-avatar بالضبط، ظل
            // غامق + علامة استفهام بدل الصورة الحقيقية.
            '.tr-select-cand-avatar-hidden{background:radial-gradient(circle at 35% 30%,#3e1d76,#150a29);',
            'display:flex;align-items:center;justify-content:center;font-size:1.6em;color:rgba(255,255,255,0.75);}',
            '.tr-select-cand-plate{position:relative;height:48px;width:194px;box-sizing:border-box;',
            'margin-inline-start:-13px;padding-inline-start:31px;padding-inline-end:10px;',
            'display:flex;align-items:center;justify-content:flex-start;gap:8px;font-weight:800;color:#fff;',
            'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.28);',
            'border-radius:999px;overflow:hidden;z-index:1;}',
            '.tr-select-cand-name{font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;}',
            '.tr-select-cand-num{width:40px;height:40px;flex:none;color:#fff;',
            'border-radius:50%;font-size:1.2em;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;z-index:3;}',
            '.tr-select-cand-num.tr-role-eliminate{background:#ef4444;}',
            '.tr-select-cand-num.tr-role-revive{background:#22c55e;}',
            '.tr-select-cand-card.tr-cand-selected .tr-select-cand-plate{box-shadow:0 0 0 2px #ef4444;}',

            /* ======================================================================
             *  [تبويب "عودة لاعب" الجديد] — منقول بالحرف من التصميم الأخير
             *  المعتمَد فعلياً بروليت الإقصاء (#er-revive-splash-overlay/box)،
             *  بألوان هوية روليت القبائل. يحل محل تبويب "إعلان النتيجة"
             *  القديم لحالة الإرجاع فقط (كلا النوعين: انعاش صديق + الدعم) —
             *  حالة الإقصاء تبقى بتبويب إعلان النتيجة القديم بلا أي تغيير
             *  (خارج نطاق هذا الطلب). قلب PNG مرفوع خصيصاً لهذي اللعبة
             *  (revive-heart.png، بجانب index.html بنفس مجلد اللعبة).
             * ==================================================================== */
            '#tr-revive-splash-overlay{position:fixed;inset:0;z-index:100030;display:none;',
            'align-items:center;justify-content:center;pointer-events:none;}',
            '#tr-revive-splash-box{width:300px;height:300px;box-sizing:border-box;border-radius:24px;',
            'border:4px solid var(--tr-accent);background:radial-gradient(circle at 50% 32%,rgba(128,212,255,0.28),rgba(8,16,24,0.94) 72%);',
            'box-shadow:0 0 60px rgba(128,212,255,0.55),0 20px 50px rgba(0,0,0,0.5);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;',
            'padding:18px;text-align:center;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'opacity:0;transform:scale(0.6);}',
            '#tr-revive-splash-box.tr-revive-splash-anim{animation:tr-revive-pop 0.45s cubic-bezier(.34,1.56,.64,1) forwards;}',
            '@keyframes tr-revive-pop{0%{opacity:0;transform:scale(0.5);}60%{opacity:1;transform:scale(1.08);}100%{opacity:1;transform:scale(1);}}',
            '.tr-revive-splash-heart{width:58px;height:58px;object-fit:contain;',
            'animation:tr-revive-heartbeat 1s ease-in-out infinite;',
            'filter:drop-shadow(0 0 10px rgba(128,212,255,0.85));}',
            '@keyframes tr-revive-heartbeat{0%,100%{transform:scale(1);}25%{transform:scale(1.18);}45%{transform:scale(0.96);}}',
            '.tr-revive-splash-reason{font-size:0.82em;font-weight:700;color:#cdeeff;line-height:1.4;}',
            '.tr-revive-splash-avatar{width:92px;height:92px;border-radius:50%;border:3px solid var(--tr-accent);',
            'box-shadow:0 0 18px rgba(128,212,255,0.6);overflow:hidden;flex:none;}',
            '.tr-revive-splash-avatar .tr-ring-avatar,.tr-revive-splash-avatar .tr-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:1.6em;}',
            '.tr-revive-splash-name{font-size:1.15em;font-weight:900;color:#fff;}',

            /* ---- Toasts ---- */
            '#tr-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.tr-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(124,58,237,0.55);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',

            /* ---- شاشة نهاية المباراة ----
             * ⚠️ [0.45.0] تصميم بطاقات جديد بالكامل (البطاقة القديمة
             * أُلغيت كلياً) — حلقة (ring) بسيطة حول الصورة الدائرية تناسب
             * اللعبة نفسها: حلقة "ذهبية دوّارة" للفائز (تلمّح لعجلة
             * الفوز)، وحلقة "متقطّعة وردية" لصاحب الأكثر إقصاءً (تلمّح
             * لعلامة استهداف/إقصاء) — بشارة أيقونة صغيرة فوق كل حلقة،
             * بنفس ألوان صورة 4. */
            '#tr-winner-box{text-align:center;}',
            '#tr-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;}',
            '.tr-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            /* ⚠️ [0.46.0] حجم موحَّد 250×250 لكل بطاقة، وبدون أي خلفية أو
             * حدود إطلاقاً (أُلغيتا بالكامل) — تأثير "تطاير" (confetti)
             * هو البديل الاحتفالي الآن، راجع spawnConfetti().
             * ⚠️ [0.47.0] تأثير "إشعاع/توهّج" جديد حول كل بطاقة (نفس اللون
             * الموحَّد للطرفين — الفائز والأكثر إقصاءً — بطلب صريح)، مع
             * نبضة خفيفة مستمرة. overflow صار visible بدل hidden حتى لا
             * يُقصّ التوهّج (ولا قصاصات confetti التي تتخطى حدود الصندوق
             * أحياناً — إصلاح فني إضافي وُجد أثناء المراجعة). */
            '.tr-trophy-card{position:relative;width:250px;height:250px;box-sizing:border-box;',
            'border-radius:18px;padding:20px 14px;display:flex;flex-direction:column;align-items:center;',
            'justify-content:center;overflow:visible;background:none;border:none;',
            'box-shadow:0 0 55px 14px rgba(255,255,255,0.4),0 0 120px 35px rgba(216,120,255,0.6);',
            'animation:tr-trophy-glow-pulse 2.6s ease-in-out infinite;}',
            '@keyframes tr-trophy-glow-pulse{0%,100%{box-shadow:0 0 55px 14px rgba(255,255,255,0.4),',
            '0 0 120px 35px rgba(216,120,255,0.6);}',
            '50%{box-shadow:0 0 75px 22px rgba(255,255,255,0.6),0 0 150px 45px rgba(216,120,255,0.78);}}',
            '.tr-trophy-card .tr-trophy-label{font-size:0.85em;font-weight:800;color:#fff;margin-bottom:10px;}',

            '.tr-ring-wrap{position:relative;width:88px;height:88px;margin:0 auto 10px;border-radius:50%;',
            'padding:5px;box-sizing:border-box;}',
            '.tr-ring-winner{background:conic-gradient(from 0deg,#ffd400,#fff6cf,#ffd400,#c9960a,#ffd400);',
            'box-shadow:0 0 20px rgba(255,212,0,0.55);}',
            '.tr-ring-most{background:repeating-conic-gradient(' + C_PINK + ' 0deg 18deg,' + C_PINK_DK + ' 18deg 36deg);',
            'box-shadow:0 0 20px rgba(255,77,255,0.4);}',
            '.tr-ring-inner{width:100%;height:100%;border-radius:50%;background:#2D1932;overflow:hidden;}',
            '.tr-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.tr-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',
            '.tr-ring-badge{position:absolute;bottom:-2px;right:-2px;width:28px;height:28px;border-radius:50%;',
            'display:flex;align-items:center;justify-content:center;font-size:0.95em;border:2px solid #2D1932;}',
            '.tr-ring-badge.tr-badge-winner{background:#ffd400;}',
            '.tr-ring-badge.tr-badge-most{background:var(--tr-pink);}',

            '.tr-trophy-name{font-size:1.15em;font-weight:900;color:#fff;}',
            '.tr-trophy-count{color:#e9d3ff;font-size:0.85em;margin-top:4px;}',

            /* ---- عرض النقاط المكتسبة ---- */
            '.tr-trophy-points{margin-top:10px;font-size:0.85em;line-height:1.4;}',
            '.tr-trophy-points.tr-points-earned{color:#ffd400;font-weight:800;}',
            '.tr-trophy-points .tr-points-sub{display:block;color:#e9d3ff;font-weight:500;font-size:0.85em;margin-top:2px;}',
            '.tr-trophy-points.tr-points-noaccount{color:#e9d3ff;font-size:0.8em;}',

            '.tr-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.tr-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#tr-replay-same-btn{background:linear-gradient(90deg,var(--tr-accent2),var(--tr-accent));color:#0b0616;}',
            '#tr-new-match-btn{background:#fff;border:1px solid var(--tr-accent);color:#5a2585;}',

            /* ---- أزرار اختيار الهدية (أيقونة Twemoji + اسم + قيمة عملات) ---- */
            '.agp-pill-btn.tr-gift-btn{display:inline-flex;flex-direction:column;align-items:center;',
            'justify-content:center;gap:3px;min-width:84px;margin:4px;padding:10px 8px;border-radius:14px;}',
            '.tr-gift-icon{width:30px;height:30px;object-fit:contain;}',
            '.tr-gift-name{font-size:0.82em;font-weight:700;}',
            '.tr-gift-coins{font-size:0.72em;opacity:0.8;}',

            /* ---- [0.46.0] تأثير التطاير الاحتفالي (بطاقات شاشة الفائز) ---- */
            '.tr-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'pointer-events:none;opacity:0;animation:tr-confetti-burst 1.4s ease-out forwards;}',
            '@keyframes tr-confetti-burst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0deg);}',
            '100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(540deg);}}',

            /* ---- بانر أحداث المباراة (يسار الشاشة، من تحت الشعار) ----
             * ⚠️ [0.47.0] العرض صار 250px بدل 450px (طلب صريح).
             * ⚠️ [0.45.7] صار مخفياً افتراضياً (display:none) — يظهر فقط
             * بإضافة الكلاس tr-log-visible (زر إظهار/إخفاء مخصَّص، راجع
             * ensureEventLog/#tr-event-log-toggle أدناه). بما إنه
             * position:fixed أصلاً (خارج تخطيط #tr-stage تماماً)، إخفاؤه/
             * إظهاره لا يحرّك ولا يزاحم أي عنصر بشاشة اللعب — طلب صريح. */
            '#tr-event-log{position:fixed;left:0;top:70px;bottom:0;width:250px;max-width:90vw;',
            'box-sizing:border-box;padding:14px 16px;overflow-y:auto;background:rgba(12,6,22,0.55);',
            'border-inline-end:1px solid rgba(156,143,176,0.25);z-index:20;display:none;}',
            '#tr-event-log.tr-log-visible{display:block;}',
            '#tr-event-log h3{margin:0 0 10px;font-size:0.95em;font-weight:800;color:#e9d3ff;}',
            '.tr-event-log-item{display:flex;align-items:flex-start;gap:8px;font-size:0.82em;color:#f3eefc;',
            'background:rgba(255,255,255,0.05);border-radius:10px;padding:6px 10px;margin-bottom:6px;line-height:1.5;}',
            '.tr-event-icon{flex-shrink:0;}',
            '#tr-event-log-toggle{position:fixed;left:14px;top:78px;z-index:21;width:42px;height:42px;',
            'border-radius:50%;border:1px solid rgba(156,143,176,0.4);background:rgba(20,8,35,0.9);color:#e9d3ff;',
            'font-size:1.15em;cursor:pointer;display:flex;align-items:center;justify-content:center;',
            'box-shadow:0 4px 14px rgba(0,0,0,0.4);transition:background 0.15s,transform 0.15s;}',
            '#tr-event-log-toggle:hover{background:rgba(124,58,237,0.35);transform:translateY(-1px);}',
            '#tr-event-log-toggle.tr-log-toggle-active{background:rgba(124,58,237,0.55);',
            'border-color:var(--tr-accent2);}',

            /* ---- [0.45.7] تحسين بصري لمفتاحي تفعيل "انعاش صديق"/"الإنعاش
             * عن طريق الدعم" بشاشة الإعدادات — طلب صريح: الشكل بحالتي
             * التشغيل/الإيقاف "مو متناسق"، يحتاج يكون أوضح. تباين واضح
             * الآن: رمادي غامق مطفأ (OFF) ← أخضر متوهّج بارز (ON)، بدل
             * درجتي بنفسجي فاتح/غامق شبه متطابقتين سابقاً. محدود بصفحة
             * روليت القبائل فقط (!important + محدِّد خاص بمفتاحي هذي
             * اللعبة تحديداً)، بدون أي لمس لملف js/agp-game-shell.js
             * المشترك ولا أي لعبة أخرى تستخدمه.
             */
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]) .agp-toggle-track,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]) .agp-toggle-track{',
            'background:linear-gradient(180deg,#4a4458,#332e40) !important;',
            'box-shadow:inset 0 2px 5px rgba(0,0,0,0.5) !important;}',
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]:checked) .agp-toggle-track,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]:checked) .agp-toggle-track{',
            'background:linear-gradient(180deg,#4ade80,#16a34a) !important;',
            'box-shadow:inset 0 2px 5px rgba(0,0,0,0.35),0 0 12px rgba(74,222,128,0.65) !important;}',
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]) .agp-toggle-track::before,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]) .agp-toggle-track::before{',
            'width:22px !important;height:22px !important;left:2px !important;top:2px !important;',
            'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;',
            'content:"✕" !important;color:#7a7488;line-height:22px;text-align:center;}',
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]:checked) .agp-toggle-track::before,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]:checked) .agp-toggle-track::before{',
            'content:"✓" !important;color:#16a34a !important;transform:translateX(-20px) !important;}',

            /* ---- [0.45.8] توحيد لون/تدرّج خلفية "تبويبات" شاشتي الإعدادات
             * واللوبي (#agp-shell-box بكلاسيه) بنفس تدرّج (5F3976→211528)
             * المستخدم بـ#tr-modal-box أعلاه — طلب صريح لتوحيد شكل كل
             * شاشات اللعبة. #agp-shell-box معرَّف أصلاً بالملف المشترك
             * js/agp-game-shell.js (تستخدمه كل الألعاب)، فبدل تعديله هناك
             * (يؤثر على كل لعبة)، هذا التنسيق محقون هنا فقط — يُحمَّل بعد
             * تنسيق الملف المشترك (registerGame تستدعي injectStageStyles
             * أول شيء)، بنفس محدِّد الـID + !important، فيطغى فقط على
             * صفحة روليت القبائل تحديداً دون أي تأثير على أي لعبة أخرى
             * تستخدم نفس الصندوق المشترك (لا تعديل بالملف المشترك نفسه إطلاقاً). */
            '#agp-shell-box{background:linear-gradient(180deg,#5F3976,#211528) !important;}',
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(180deg,#5F3976,#211528) !important;position:relative;overflow:hidden;}',

            /* ---- [0.45.12] تعديلات إضافية على صندوق الإعدادات/اللوبي
             * المشترك (#agp-shell-box) — كل القواعد هنا !important ومحقونة
             * من هذا الملف فقط (بعد تنسيق الملف المشترك)، فتطغى فقط على
             * صفحة روليت القبائل دون لمس js/agp-game-shell.js إطلاقاً. */

            // ⚠️ زر إغلاق الإعدادات (✕) كان بلون بنفسجي غامق (#5a2585) قليل
            // التباين — طلب صريح: يكون بارزاً وأبيض واضح.
            '#agp-settings-close-btn{color:#ffffff !important;font-weight:900 !important;',
            'text-shadow:0 1px 4px rgba(0,0,0,0.5) !important;}',

            // ⚠️ [منقول بالحرف من التحديث الأخير لروليت الإقصاء] معيار
            // PLAYER-CARD-STANDARDS.md §4: الشاشة تبقى ثابتة بدون أي
            // سكرول على مستوى الصفحة/الصندوق نفسه — فقط منطقة شبكة
            // البطاقات (#agp-lobby-list) عندها سكرول داخلي، ويتوقف دائماً
            // قبل الشريط السفلي بغضّ النظر عن عدد اللاعبين. يستبدل نظام
            // الصندوق الثابت 900px + التصغير التلقائي الديناميكي (القديم
            // بهذا الملف) بالكامل — الصندوق صار flex عمودي: العناصر
            // الثابتة (العنوان، سطر التلميح، الشريط السفلي) بحجمها
            // الطبيعي، وشبكة البطاقات وحدها تاخذ المساحة المتبقية وتسكرل
            // لو لزم.
            '#agp-shell-box.agp-lobby-box{height:min(94vh,980px) !important;max-height:94vh !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;}',
            '#agp-shell-box.agp-lobby-box > h2,',
            '#agp-shell-box.agp-lobby-box > .agp-join-hint,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-stage,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-settled-list{flex:0 0 auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{flex:1 1 auto !important;',
            'min-height:0 !important;overflow-y:auto !important;}',

            // ⚠️ شعار "Ayman Games" كخلفية شفافة (25%) بمنتصف صندوق اللوبي —
            // طلب صريح. يُضاف كعنصر img عبر enhanceLobbyWatermarkAndActions()،
            // هذا فقط موضعته/شفافيته.
            '#tr-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            // العناصر الحقيقية بصندوق اللوبي فوق الشعار دائماً.
            '#agp-shell-box.agp-lobby-box > *:not(#tr-lobby-watermark){position:relative;z-index:1;}',

            // ⚠️ [0.45.14] تدرّج جديد خاص باللوبي فقط (5D336A→000000 —
            // من صورة Figma زوَّدنا بها المستخدم)، يستبدل التدرّج الموحَّد
            // (5F3976→211528) المستخدَم بباقي الشاشات (الإعدادات، تبويبي
            // الإقصاء/الإرجاع، بطاقة الفائز) — تلك تبقى بتدرّجها القديم
            // بدون تغيير، القاعدة `#agp-shell-box{...}` (بدون .agp-lobby-box)
            // ما تغيّرت. محدِّد `.agp-lobby-box` أعلى تخصيصاً فيطغى هنا فقط.
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(180deg,#5D336A,#000000) !important;',
            'position:relative;overflow:hidden;}',

            // ⚠️ [0.45.14] عنوان اللوبي بلونين — طلب صريح حسب تصميم
            // Figma: جزء أبيض ثابت + جزء ملوَّن مميَّز ("روليت القبائل")،
            // يستبدل تمييز اللون الذهبي الموحَّد المستخدَم سابقاً بـ[0.45.12].
            // النص نفسه (وليس فقط اللون) يتغيّر أيضاً — يُطبَّق عبر
            // enhanceLobbyHeading() (استبدال innerHTML لعنصر h2 الموجود
            // أصلاً بالملف المشترك، بدون أي تعديل على الملف نفسه).
            '#agp-shell-box.agp-lobby-box h2{text-shadow:none !important;letter-spacing:0.5px !important;}',
            '.tr-lobby-title-plain{color:#fff !important;}',
            '.tr-lobby-title-accent{color:#ffb648 !important;text-shadow:0 2px 10px rgba(255,182,72,0.4) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{color:#d9c8e8 !important;',
            'font-weight:400 !important;}',
            // إبراز إضافي لبادج الكلمة المفتاحية الجاهزة أصلاً بالملف
            // المشترك (.agp-join-keyword-badge) فوق الخلفية الغامقة الجديدة.
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{box-shadow:0 0 22px rgba(0,194,255,0.75) !important;}',

            // ⚠️ [منقول بالحرف من التحديث الأخير لروليت الإقصاء] شارة عدد
            // اللاعبين — "شارة عائمة أعلى الشاشة" بدل بقائها بنص سطر
            // التلميح. العنصر نفسه (#agp-lobby-count) موجود أصلاً بالملف
            // المشترك ومُعبَّأ تلقائياً، هذا فقط يفصلها بصرياً ويعوّمها
            // أعلى يمين الصندوق بدل تدفقها العادي بالسطر.
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:absolute !important;top:14px !important;',
            'left:20px !important;z-index:3 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{background:rgba(0,0,0,0.45) !important;',
            'border:1px solid rgba(255,255,255,0.35) !important;border-radius:999px !important;',
            'padding:6px 16px !important;font-weight:900 !important;font-size:0.95em !important;',
            'box-shadow:0 4px 14px rgba(0,0,0,0.35) !important;}',

            /* ==================================================================
             * ⚠️ [حذف كامل — منقول بالحرف من التحديث الأخير لروليت الإقصاء]
             * تخصيص شكل/حجم بطاقات اللوبي المحلي (الشبكة 3 أعمدة، حجم
             * الأفاتار/البلاطة، نظام "البطاقة العريضة"، والتصغير التلقائي
             * الديناميكي) حُذف بالكامل من هنا. السبب: js/agp-game-shell.js
             * وjs/agp-player-card.js المشتركان صار فيهما نفس هذا النظام
             * مبنياً بشكل أصلي (شبكة 4 أعمدة، AGP.playerCard.renderHtml
             * بحجم موحَّد وتراكب، AGP.playerCard.fitAllNames للـMarquee،
             * وقياس عرض البطاقة المؤطَّرة رياضياً) — أي تخصيص محلي مكرِّر
             * لنفس الشيء يتعارض بصرياً معه، فحُذف بدل التطبيق فوقه (نفس
             * القرار المعتمَد فعلياً بروليت الإقصاء، بطلب صريح).
             * ⚠️ فائدة إضافية مباشرة لهذا الحذف: الشبكة المحلية القديمة
             * هنا كانت بدون align-content:start (نفس علّة "البطاقات تصعد
             * من تحت" الموجودة حالياً بلعبتَي روليت الروسي والكراسي
             * الموسيقية — كلتاهما لسا فيهما شبكة محلية مشابهة بدون
             * align-content). الاعتماد الآن على شبكة الملف المشترك
             * (المُصلَحة فعلياً بـalign-content:start) يتفادى نفس العلة
             * هنا تلقائياً، بدون أي كود إضافي.
             * ==================================================================== */

            // ⚠️ [0.45.15] صف أزرار اللوبي السفلي — الثلاثة أزرار (العودة
            // للإعدادات، بدء الجولة، رجوع للمنصة) بصف واحد جنب بعض، بنفس
            // المقاس بالضبط (W360×H48). المقاس ثابت (مو flex:1) + الصف
            // نفسه في المنتصف (justify-content:center).
            // ⚠️ flex:0 0 auto — الصف يبقى بحجمه الطبيعي (شريط سفلي ثابت)
            // جوّا الصندوق اللي صار flex-column، ولا يتأثر بمساحة القائمة
            // القابلة للتمدد/السكرول فوقه.
            '#agp-shell-box.agp-lobby-box .tr-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;}',
            '.tr-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '.tr-lobby-back-settings-btn{border-radius:999px;',
            'border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;transition:background 0.15s;}',
            '.tr-lobby-back-settings-btn:hover{background:rgba(255,255,255,0.18);}',
            '#agp-shell-box.agp-lobby-box .tr-lobby-actions-row #agp-start-round-btn{',
            'background:linear-gradient(90deg,#22c55e,#16a34a) !important;color:#fff !important;}',

            // ⚠️ زر "رجوع للمنصة" — بشاشة اللوبي صار ضمن نفس صف الأزرار
            // الثلاثة (W360×H48 موحَّد أعلاه)، بينما بشاشة الإعدادات
            // الأولى بقي بشكله الأصلي (block بعرض تلقائي) — القاعدة
            // العامة أدناه تبقى الافتراضي، ومحدِّد .tr-lobby-actions-row
            // أعلى تخصيصاً فيطغى فقط داخل صف اللوبي.
            '.tr-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.tr-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  3) شاشة العجلة الرئيسية
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('tr-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'tr-modal-overlay';
            overlay.innerHTML = '<div id="tr-modal-chooser-card"></div><div id="tr-modal-box"></div>';
            document.body.appendChild(overlay);
        }
        // ⚠️ صندوق "اختيار الإقصاء/الإرجاع" الجديد — منقول بالحرف من
        // تصميم روليت الإقصاء الأخير (#er-select-overlay). عنصر مستقل
        // كلياً عن #tr-modal-overlay أعلاه (يبقى مستخدَماً فقط لإعلان
        // النتيجة/الفائز/اختيار الهدية). يُبنى مرة واحدة فقط هنا —
        // renderTurnModal() تحدّث المحتوى الداخلي فقط بكل فتحة دور.
        if (!el('tr-select-overlay')) {
            var selectOverlay = document.createElement('div');
            selectOverlay.id = 'tr-select-overlay';
            selectOverlay.innerHTML =
                '<div id="tr-select-box">' +
                    '<div id="tr-select-title"></div>' +
                    '<div id="tr-chooser-row">' +
                        '<div id="tr-select-chooser-slot"></div>' +
                        '<div id="tr-select-actions">' +
                            '<button id="tr-force-eliminate-btn" type="button">❌ إقصاء صاحب الدور</button>' +
                            '<button id="tr-select-resume-btn" type="button">▶️ استئناف اللعبة</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="tr-select-timer"></div>' +
                    '<div id="tr-select-candidates-grid"></div>' +
                '</div>';
            document.body.appendChild(selectOverlay);
            el('tr-force-eliminate-btn').addEventListener('click', handleForceEliminateClick);
            el('tr-select-resume-btn').addEventListener('click', handleSelectResumeClick);
        }
        if (!el('tr-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'tr-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        // ⚠️ تبويب "عودة لاعب" الجديد — منقول بالحرف من تصميم روليت
        // الإقصاء الأخير (#er-revive-splash-overlay). عنصر مستقل تماماً،
        // يُبنى مرة واحدة فقط هنا بنفس أسلوب بقية عناصر ensureScaffolding().
        if (!el('tr-revive-splash-overlay')) {
            var splashOverlay = document.createElement('div');
            splashOverlay.id = 'tr-revive-splash-overlay';
            splashOverlay.innerHTML = '<div id="tr-revive-splash-box"></div>';
            document.body.appendChild(splashOverlay);
        }
    }

    function renderStage() {
        ensureScaffolding();
        ensureEventLog();
        var stage = el('tr-stage');
        if (!stage) {
            stage = document.createElement('div');
            stage.id = 'tr-stage';
            document.body.appendChild(stage);
        }
        // ⚠️ [0.46.0] أسماء اللاعبين رجعت مكتوبة داخل قطع العجلة نفسها
        // (renderWheelLabels)، وزر "إعادة ترتيب عشوائية" تحت العجلة.
        // ⚠️ [0.48.0] موشر تكبير/تصغير العجلة بين العجلة والزر — عنصر
        // عادي بترتيب العمود حتى يتحرك الزر تلقائياً معه عند تغيير الحجم.
        stage.innerHTML =
            '<div id="tr-wheel-wrap">' +
            '<div id="tr-wheel-bezel"></div>' +
            '<div id="tr-wheel-pointer"></div>' +
            '<canvas id="tr-wheel-canvas"></canvas>' +
            '<button id="tr-spin-hub" title="دوّر العجلة"><img src="../../logo.png" alt="ألعاب أيمن"><span>دور</span></button>' +
            '</div>' +
            '<div id="tr-wheel-zoom-row">' +
            '<span>🔍−</span>' +
            '<input type="range" id="tr-wheel-zoom-slider" min="' + WHEEL_SIZE_MIN + '" max="' + WHEEL_SIZE_MAX + '" step="10" value="' + _wheelSizePx + '" title="تكبير/تصغير العجلة">' +
            '<span>🔍+</span>' +
            '</div>' +
            '<button id="tr-shuffle-btn" type="button">🔀 إعادة ترتيب عشوائية</button>';

        applyWheelSize(_wheelSizePx);
        renderWheelBulbs();
        drawWheelCanvas();
        el('tr-spin-hub').onclick = handleSpinClick;
        el('tr-shuffle-btn').onclick = handleShuffleClick;
        el('tr-wheel-zoom-slider').oninput = function () {
            handleWheelZoomChange(parseInt(this.value, 10));
        };
    }

    /**
     * ⚠️ [0.48.0] يضبط حجم العجلة فعلياً (inline style، يتجاوز الحجم
     * الافتراضي بـCSS) + يحسب حداً آمناً بالنسبة لعرض الشاشة الحالي
     * (88vw، نفس سقف CSS الأصلي القديم) حتى ما تطفح العجلة خارج الشاشة
     * بشاشات صغيرة حتى لو الموشر مضبوط على قيمة أكبر.
     */
    function applyWheelSize(px) {
        var wrap = el('tr-wheel-wrap');
        if (!wrap) return;
        var viewportSafeMax = Math.floor(window.innerWidth * 0.88);
        var applied = Math.max(WHEEL_SIZE_MIN, Math.min(px, viewportSafeMax));
        wrap.style.width = applied + 'px';
        wrap.style.height = applied + 'px';
        // ⚠️ عجلة الـcanvas (بعكس نسخة CSS conic-gradient القديمة) تحتاج
        // إعادة رسم فعلية بعد أي تغيير بحجم الحاوية — أبعاد الكانفس
        // الداخلية (canvas.width/height) لا تتحدّث تلقائياً مع CSS.
        drawWheelCanvas();
    }

    function handleWheelZoomChange(px) {
        if (isNaN(px)) return;
        _wheelSizePx = Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, px));
        applyWheelSize(_wheelSizePx); // يستدعي drawWheelCanvas() داخلياً أصلاً
    }

    // ⚠️ حلقة "مصابيح" زخرفية ثابتة حول العجلة (16 نقطة) — تُبنى مرة
    // واحدة فقط (لا تعتمد على عدد اللاعبين). بدون تغيير عن روليت
    // الإقصاء — عنصر DOM منفصل تماماً عن الكانفس، لا علاقة له بالرسم.
    function renderWheelBulbs() {
        var bezel = el('tr-wheel-bezel');
        if (!bezel || bezel.dataset.built) return;
        var n = 16;
        for (var i = 0; i < n; i++) {
            var angle = (360 / n) * i;
            var bulb = document.createElement('div');
            bulb.className = 'tr-bulb';
            bulb.style.top = '50%';
            bulb.style.left = '50%';
            bulb.style.transform = 'rotate(' + angle + 'deg) translate(0,-50%) rotate(-' + angle + 'deg)';
            bulb.style.marginTop = '-4.5px';
            bulb.style.marginLeft = '-4.5px';
            // ⚠️ تموضع فعلي عبر transform مبني على نصف قطر الحلقة نفسها
            bulb.style.transform =
                'translate(-50%,-50%) rotate(' + angle + 'deg) translate(0,-50%)';
            bezel.appendChild(bulb);
        }
        bezel.dataset.built = '1';
    }

    /* ======================================================================
     *  3ب) رسم العجلة على <canvas> — منقول ومُعاد تلوينه من كود اللعبة
     *      القديمة المستقلة (roulette-game/script.js: drawWheel)، بدل
     *      Conic Gradient بـCSS المستخدَم بروليت الإقصاء. الألوان
     *      البديلة صارت WHEEL_PALETTE (ثوابت المنصة الرسمية) بدل الأزرق
     *      السماوي/البنفسجي اليدوي القديم. راجع التعليق فوق _wheelRotation
     *      أدناه لشرح نظام الزوايا (بالراديان، صفر = محاذاة القطعة صفر
     *      تحت المؤشر بالأعلى، مطابق تماماً لسلوك نسخة CSS القديمة).
     */
    function drawWheelCanvas() {
        var canvas = el('tr-wheel-canvas');
        var wrap = el('tr-wheel-wrap');
        if (!canvas || !wrap) return;
        var sizeCss = wrap.clientWidth;
        if (!sizeCss) return;

        var dpr = window.devicePixelRatio || 1;
        var sizePx = Math.round(sizeCss * dpr);
        if (canvas.width !== sizePx || canvas.height !== sizePx) {
            canvas.width = sizePx;
            canvas.height = sizePx;
        }
        canvas.style.width = sizeCss + 'px';
        canvas.style.height = sizeCss + 'px';

        var ctx = canvas.getContext('2d');
        var cx = canvas.width / 2, cy = canvas.height / 2;
        var radius = canvas.width / 2 - 4 * dpr;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var n = _alive.length;
        if (!n) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#2a1443';
            ctx.fill();
            return;
        }

        var anglePer = (2 * Math.PI) / n;
        // ⚠️ حجم الخط يتقلص تلقائياً كلما زاد عدد اللاعبين حتى تبقى
        // الأسماء مقروءة — نفس منطق اللعبة القديمة بالضبط.
        var fontSize = Math.max(11, Math.min(18, 260 / n)) * dpr;
        var maxChars = n <= 8 ? 16 : 10;

        for (var i = 0; i < n; i++) {
            // ⚠️ -π/2 ثابتة تحاذي القطعة رقم 0 تحت المؤشر (أعلى العجلة)
            // عند _wheelRotation=0 — بالضبط سلوك segment 0 بنسخة CSS
            // القديمة (conic-gradient يبدأ من الأعلى افتراضياً).
            var startAng = _wheelRotation + i * anglePer - Math.PI / 2;
            var endAng = startAng + anglePer;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAng, endAng);
            ctx.closePath();
            ctx.fillStyle = WHEEL_PALETTE[i % WHEEL_PALETTE.length];
            ctx.fill();
            ctx.lineWidth = 2 * dpr;
            ctx.strokeStyle = C_WHEEL_TRIM;
            ctx.stroke();

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(startAng + anglePer / 2);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#f1e9fb';
            ctx.font = 'bold ' + fontSize.toFixed(1) + 'px Zain,Cairo,sans-serif';

            var label = playerLabel(_alive[i]);
            if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…';
            ctx.fillText(label, radius - 15 * dpr, 5 * dpr);
            ctx.restore();
        }
    }

    /**
     * ⚠️ [0.45.7] إصلاح خلل حقيقي: كل ما يتغيّر عدد/ترتيب اللاعبين الأحياء
     * (إقصاء، إرجاع، انضمام لاعب أثناء المباراة، إعادة ترتيب عشوائية)
     * تُعاد بناء قطع العجلة من الصفر (renderWheelSlices/renderWheelLabels)
     * — لكن دوران العجلة الفعلي (_wheelRotation، من آخر دورة سبِن) كان
     * يبقى كما هو بدون تصفير، فيصير الشيء الظاهر تحت المؤشر بعد التغيير
     * غير مطابق فعلياً لصاحب الدور الحقيقي (بطاقة "صاحب الدور" الجانبية
     * تبقى صحيحة لأنها مبنية من البيانات مباشرة، لا من موضع العجلة
     * البصري — هذا بالضبط سبب الملاحظة اللي وصلتنا: "العجلة وقفت على
     * اسم لكن الاختيار طلع للاعب ثاني"). الحل: تصفير الدوران فعلياً
     * لحظة أي تغيير بالتشكيلة (بدون أنيميشن مرئي — transition تُعطَّل
     * مؤقتاً ثم تُعاد فوراً)، حتى تبقى العجلة دائماً متوافقة مع تشكيلتها
     * الحالية إلى حين الدورة القادمة الفعلية.
     */
    // ⚠️ [0.45.10] استُخرجت من realignWheelAfterRosterChange() لتصفير دوران
    // العجلة بمفردها (بدون إعادة رسم القطع/الأسماء غير اللازمة لو
    // التشكيلة نفسها ما تغيّرت) — راجع تعليق handleSpinClick أدناه لشرح
    // سبب الحاجة لهذا التصفير بعد كل دور ينتهي، مو فقط عند تغيّر التشكيلة.
    function resetWheelSpinPosition() {
        _wheelRotation = 0;
        drawWheelCanvas();
    }

    function realignWheelAfterRosterChange() {
        // ⚠️ رسمة واحدة تكفي هنا (بعكس renderWheelSlices+renderWheelLabels
        // المنفصلتين بنسخة CSS القديمة) — drawWheelCanvas() ترسم القطع
        // والأسماء معاً بنفس المرور. _wheelRotation يُصفَّر أولاً حتى
        // تُرسَم القطعة رقم 0 تحت المؤشر مباشرة (نفس منطق التصفير القديم).
        _wheelRotation = 0;
        drawWheelCanvas();
    }

    // ⚠️ [0.46.0] "إعادة ترتيب عشوائية" — يخلط ترتيب اللاعبين الأحياء
    // فقط (Fisher-Yates) ثم يعيد رسم القطع + الأسماء بالترتيب الجديد.
    // مُعطَّل أثناء نافذة دور مفتوحة أو أثناء دوران العجلة نفسها (نفس
    // شرط تعطيل زر الدوران) تفادياً لتغيير الترتيب وسط عملية جارية.
    function shuffleArray(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    function handleShuffleClick() {
        if (!_matchActive || _pendingTurn) return;
        var spinBtn = el('tr-spin-hub');
        if (spinBtn && spinBtn.disabled) return; // العجلة تدور حالياً
        if (_alive.length < 2) return;
        shuffleArray(_alive);
        realignWheelAfterRosterChange();
    }

    function showToast(message) {
        var wrap = el('tr-toast-wrap');
        if (!wrap) return;
        var t = document.createElement('div');
        t.className = 'tr-toast';
        t.textContent = message;
        wrap.appendChild(t);
        window.setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
        }, 4000);
    }

    /* ======================================================================
     *  4) دوران العجلة — بالراديان الآن (canvas)، بعكس الدرجات (CSS
     *     transform) بروليت الإقصاء. القطعة رقم 0 تبدأ تحت المؤشر (أعلى
     *     العجلة) عند _wheelRotation=0 — راجع تعليق drawWheelCanvas.
     * ==================================================================== */
    var _wheelRotation = 0;
    var _wheelSpinning = false;

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    /**
     * ⚠️ [0.45.10] نفس المبدأ الموروث من روليت الإقصاء (راجع الشرح
     * الأصلي بتعليق realignWheelAfterRosterChange أعلاه): targetRotation
     * أدناه يُحسَب دائماً بافتراض أن _wheelRotation الحالي = 0 بالضبط —
     * صحيح فقط لو resetWheelSpinPosition()/realignWheelAfterRosterChange()
     * استُدعيت فعلياً بعد آخر تغيير بالتشكيلة أو نهاية دور سابقة. كل
     * مسارات إنهاء الدور بهذا الملف (استئناف اللعب، تخطي الوقت، انتهاء
     * وقت نافذة الإرجاع) تستدعيها فعلاً — نفس الالتزام الأصلي.
     */
    function handleSpinClick() {
        if (!_matchActive || _pendingTurn || _wheelSpinning) return;
        if (_alive.length <= 1) return;

        var spinBtn = el('tr-spin-hub');
        if (spinBtn) spinBtn.disabled = true;
        _wheelSpinning = true;
        playSound('spin');

        var winnerIndex = Math.floor(Math.random() * _alive.length);
        var winner = _alive[winnerIndex];

        var n = _alive.length;
        var anglePer = (2 * Math.PI) / n;
        var segmentCenterLocal = winnerIndex * anglePer + anglePer / 2;
        var twoPi = 2 * Math.PI;
        var desiredMod = (((-segmentCenterLocal) % twoPi) + twoPi) % twoPi;
        var currentMod = ((_wheelRotation % twoPi) + twoPi) % twoPi;
        var deltaToTarget = ((desiredMod - currentMod) % twoPi + twoPi) % twoPi;
        var fullSpins = 5;
        var totalDelta = deltaToTarget + fullSpins * twoPi;

        var startRotation = _wheelRotation;
        var spinTimeTotal = 3300; // نفس مدة روليت الإقصاء (3.3 ثانية)
        var startTime = null;

        function frame(now) {
            if (startTime === null) startTime = now;
            var elapsed = now - startTime;
            var progress = Math.min(elapsed / spinTimeTotal, 1);
            var eased = easeOutCubic(progress);
            _wheelRotation = startRotation + totalDelta * eased;
            drawWheelCanvas();

            if (progress >= 1) {
                _wheelSpinning = false;
                if (spinBtn) spinBtn.disabled = false;
                handleWheelLanded(winner);
            } else {
                window.requestAnimationFrame(frame);
            }
        }
        window.requestAnimationFrame(frame);
    }

    function handleWheelLanded(winner) {
        if (!winner) return;
        logEvent('spin', '🎡 وقفت العجلة عند ' + playerLabel(winner));

        var isRepeat = (_lastWheelWinnerId !== null && winner.id === _lastWheelWinnerId);
        _repeatStreak = isRepeat ? (_repeatStreak + 1) : 1;
        _lastWheelWinnerId = winner.id;

        if (_repeatStreak === 2 && liveSettings().friendRevivalEnabled) {
            _repeatStreak = 0; // استهلاك التكرار سواء فُتحت نافذة إرجاع أو لا
            var eligibleForFriendRevival = _eliminated.filter(function (e) {
                return !_friendRevivedIds[e.player.id];
            });
            if (eligibleForFriendRevival.length > 0) {
                openRevivalWindow(winner, eligibleForFriendRevival.map(function (e) { return e.player; }), 'friend');
                return;
            }
            // ⚠️ ما فيه أي لاعب مؤهَّل للإرجاع بطريقة "انعاش صديق" (الكل
            // استخدم فرصته سابقاً، أو ما فيه مُقصى أصلاً) — نرجع لسلوك
            // الإقصاء العادي مباشرة، بدون أي نافذة إرجاع فارغة.
        }

        openEliminationWindow(winner);
    }

    /* ======================================================================
     *  4ب) "العب" — الدوران التلقائي بعد كل دور (زر عام مُعرَّف بـ
     *      js/agp-game-shell.js عبر _config.midMatchToggleButton؛ هذا
     *      الملف فقط يمرّر onToggle وينفّذ الدوران الفعلي).
     * ==================================================================== */
    function handleAutoPlayToggle(isActive) {
        _autoPlayActive = isActive;
        if (_autoPlayActive) {
            maybeAutoSpin();
        } else if (_autoPlayTimer) {
            window.clearTimeout(_autoPlayTimer);
            _autoPlayTimer = null;
        }
    }

    function maybeAutoSpin() {
        if (!_autoPlayActive || !_matchActive || _pendingTurn) return;
        if (_alive.length <= 1) return;
        if (_autoPlayTimer) window.clearTimeout(_autoPlayTimer);
        _autoPlayTimer = window.setTimeout(function () {
            _autoPlayTimer = null;
            if (_autoPlayActive && _matchActive && !_pendingTurn && _alive.length > 1) {
                handleSpinClick();
            }
        }, 1800);
    }

    function stopAutoPlay() {
        _autoPlayActive = false;
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        if (AGP.gameShell && typeof AGP.gameShell.setMidMatchToggleActive === 'function') {
            AGP.gameShell.setMidMatchToggleActive(false);
        }
    }

    /* ======================================================================
     *  5) نافذة الإقصاء
     * ==================================================================== */
    function openEliminationWindow(chooser) {
        var candidates = _alive.filter(function (p) { return p.id !== chooser.id; });
        if (!candidates.length) return;
        // ⚠️ خلط الترتيب — رقم البطاقة (واسم القبيلة خلفها) لا يرتبط بأي
        // ترتيب ثابت للاعبين (نفس مبدأ عدم ثبات الأرقام المطلوب بتبويب
        // الإرجاع أدناه، مطبَّق هنا أيضاً لأن الهوية أصلاً مموَّهة).
        shuffleArray(candidates);

        _pendingTurn = { type: 'eliminate', candidates: candidates, chooser: chooser };
        renderTurnModal();
        startTurnTimer(function onTimeout() {
            applyEliminationTimeout(chooser);
        });
    }

    function applyEliminationTimeout(chooser) {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        var behavior = liveSettings().eliminationTimeoutBehavior;
        closeTurnModal();
        if (behavior === 'eliminate_chooser') {
            eliminatePlayer(chooser, chooser.id);
        } else {
            // 'skip_turn' — بدون إقصاء؛ لو "العب" مفعّل نكمل الدوران تلقائياً
            // ⚠️ [0.45.10] لازم تصفير دوران العجلة هنا رغم عدم تغيّر
            // التشكيلة — راجع تعليق handleSpinClick لشرح سبب الخلل الحقيقي
            // (توقّف السهم بصرياً على لاعب مختلف عن صاحب الدور الفعلي).
            resetWheelSpinPosition();
            maybeAutoSpin();
        }
    }

    /**
     * @param {Object} target - اللاعب المُقصى
     * @param {string} [eliminatorId] - id صاحب الدور اللي اختار الإقصاء
     *   (لاحتساب "الأكثر إقصاءً" بشاشة الفائز). لا يُحتسَب لو أقصى نفسه
     *   (انتهاء وقت + سلوك "يُقصى صاحب الدور").
     */
    function eliminatePlayer(target, eliminatorId) {
        var idx = _alive.findIndex(function (p) { return p.id === target.id; });
        if (idx === -1) return;
        _alive.splice(idx, 1);
        _eliminated.push({ player: target });

        if (eliminatorId && eliminatorId !== target.id) {
            _eliminationCounts[eliminatorId] = (_eliminationCounts[eliminatorId] || 0) + 1;
        }

        realignWheelAfterRosterChange();
        closeTurnModal();

        var eliminatorPlayer = eliminatorId ? findPlayerByIdAnywhere(eliminatorId) : null;
        logEvent('eliminate', '❌ ' + playerLabel(target) + ' تم إقصاؤه' +
            (eliminatorPlayer && eliminatorPlayer.id !== target.id ? (' بواسطة ' + playerLabel(eliminatorPlayer)) : ''));

        showResultAnnouncement('eliminate', {
            target: target,
            chooser: (eliminatorPlayer && eliminatorPlayer.id !== target.id) ? eliminatorPlayer : null
        }, function onDone() {
            if (_alive.length <= 1) {
                endMatch(_alive[0] || null);
            } else {
                maybeAutoSpin();
            }
        });
    }

    /* ======================================================================
     *  6) نافذة الإرجاع — "انعاش صديق" (تكرار الاسم مرتين ← مرة واحدة لكل
     *     لاعب طول عمره بالمباراة)
     * ==================================================================== */
    function openRevivalWindow(chooser, candidates, via) {
        // ⚠️ طلب صريح: مبدأ "الرقم الثابت" ملغي هنا — ترتيب/رقم كل بطاقة
        // يُعاد خلطه عشوائياً (Fisher-Yates) في كل مرة تُفتح فيها هذي
        // النافذة، بدل أي ترتيب متوقَّع (مثل ترتيب الإقصاء أو الانضمام).
        candidates = shuffleArray(candidates.slice());
        _pendingTurn = { type: 'revive', candidates: candidates, chooser: chooser, via: via };
        renderTurnModal();
        startTurnTimer(function onTimeout() {
            closeTurnModal(); // انتهاء الوقت بدون اختيار = تفويت فرصة الإرجاع فقط
            // ⚠️ [0.45.10] نفس تصفير الدوران المطلوب بكل مسار لا يغيّر
            // التشكيلة — راجع تعليق handleSpinClick.
            resetWheelSpinPosition();
            maybeAutoSpin();
        });
    }

    function revivePlayer(target, chooserId) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === target.id; });
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(target);
        _friendRevivedIds[target.id] = true; // ⚠️ يُستخدَم فقط لإرجاع "انعاش صديق" — مرة واحدة طول العمر

        realignWheelAfterRosterChange();
        closeTurnModal();

        var chooserPlayer = chooserId ? findPlayerByIdAnywhere(chooserId) : null;
        logEvent('revive', '💚 ' + playerLabel(target) + ' رجع للعبة' +
            (chooserPlayer ? (' بواسطة ' + playerLabel(chooserPlayer)) : ''));

        // ⚠️ استُبدل تبويب إعلان النتيجة القديم بتبويب "عودة لاعب" الجديد
        // الموحَّد (نفس الدالة المستخدَمة لإنعاش الدعم — راجع showReviveSplash
        // أدناه). onDone (استمرار الدوران التلقائي) بقي كما هو تماماً.
        showReviveSplash(target, { reason: 'friend', chooser: chooserPlayer }, function onDone() {
            maybeAutoSpin();
        });
    }

    /* ======================================================================
     *  7) نافذة الدور المشتركة (إقصاء أو إرجاع) — عرض + عدّاد + استماع للشات
     *  ⚠️ منقولة بالحرف من تصميم روليت الإقصاء الأخير (renderTurnModal
     *  الجديدة، #er-select-overlay/box)، بفارقين مقصودين لروليت القبائل:
     *   1) تبويب الإقصاء: بطاقات المرشَّحين تعرض اسم قبيلة + شخصية مخفية
     *      (tribeCandidateCardHtml) بدل الصورة/الاسم الحقيقي.
     *   2) الرقم المعروض على كل بطاقة **ليس** رقم اللاعب الثابت الجديد
     *      (playerNumber) المستخدَم بروليت الإقصاء — هو فهرس عرض عشوائي
     *      (i+1) يُعاد خلطه كل دورة (candidates أصلاً مخلوطة مسبقاً —
     *      راجع openEliminationWindow/openRevivalWindow). قرار مقصود:
     *      رقم ثابت مرتبط بلاعب معيّن يكسر تمويه الهوية بتبويب الإقصاء
     *      (المشاهد يتعلّم "رقم ٣ = فلان" رغم تغيّر اسم القبيلة)، ويخالف
     *      طلب المستخدم الصريح السابق بإلغاء الأرقام الثابتة بتبويب
     *      الإرجاع. باقي التصميم (الأبعاد، صفّ صاحب الدور+الأزرار،
     *      المؤقّت، الشبكة) منقول بالحرف.
     * ==================================================================== */
    function renderTurnModal() {
        ensureScaffolding();
        var overlay = el('tr-select-overlay');
        var box = el('tr-select-box');
        if (!overlay || !box || !_pendingTurn) return;

        var isRevive = _pendingTurn.type === 'revive';
        var roleClass = isRevive ? 'tr-role-revive' : 'tr-role-eliminate';
        box.className = roleClass;

        var titleLine = isRevive
            ? '<b>مرحلة الإنعاش</b> — اختر من الشات بكتابة الرقم، أو يدوياً بالنقر على بطاقة اللاعب'
            : '<b>مرحلة الإقصاء</b> — اختر من الشات بكتابة رقم القبيلة، أو يدوياً من الأزرار تحت';
        el('tr-select-title').innerHTML = titleLine;

        el('tr-select-chooser-slot').innerHTML = selectChooserCardHtml(_pendingTurn.chooser, roleClass);

        // ⚠️ تبويب الإقصاء تحديداً: الهوية الحقيقية مخفية — كل بطاقة
        // تعرض اسم قبيلة عشوائي بدل صورة/اسم اللاعب الحقيقي. تبويب
        // الإرجاع يبقى بالهوية الحقيقية ظاهرة بالكامل.
        var tribeLabels = !isRevive ? randomTribeLabels(_pendingTurn.candidates.length) : null;
        var grid = el('tr-select-candidates-grid');
        grid.innerHTML = _pendingTurn.candidates.map(function (p, i) {
            return isRevive
                ? selectCandidateCardHtml(p, i, roleClass)
                : tribeCandidateCardHtml(tribeLabels[i], i, roleClass);
        }).join('');
        grid.querySelectorAll('.tr-select-cand-card[data-index]').forEach(function (card) {
            card.onclick = function () {
                var idx = parseInt(card.getAttribute('data-index'), 10);
                if (isRevive) {
                    // ⚠️ ما فيه زر تأكيد بنافذة الإرجاع — النقر يُرجع فوراً.
                    resolveTurnSelection(idx);
                } else {
                    selectCandidateManually(idx, tribeLabels[idx]);
                }
            };
        });

        var forceBtn = el('tr-force-eliminate-btn');
        forceBtn.style.display = isRevive ? 'none' : '';
        if (!isRevive) forceBtn.textContent = '❌ إقصاء صاحب الدور';
        _selectedCandidateIdx = null;

        if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);

        overlay.style.display = 'flex';
    }

    // ⚠️ playerCardHtml معزولة بدالة واحدة — تستخدم AGP.playerCard
    // المشترك (js/agp-player-card.js) بدون إطار (showFrame:false) عمداً؛
    // ما زالت تُستخدَم بتبويب "إعلان النتيجة" (showResultAnnouncement).
    function playerCardHtml(p) {
        if (!AGP.playerCard) return '<span>' + escapeHtml(playerLabel(p)) + '</span>';
        return AGP.playerCard.renderHtml(p, { showFrame: false });
    }

    // ⚠️ بطاقة "صاحب الدور" المكبَّرة داخل صف #tr-chooser-row — حلقة
    // ٨٨px + اسمه. بدون رقم بجانب الاسم (بعكس روليت الإقصاء) — لا يوجد
    // "رقم ثابت" بروليت القبائل أصلاً (راجع تعليق renderTurnModal أعلاه)،
    // وهوية صاحب الدور نفسها دائماً ظاهرة وواضحة، فرقم بجانبها بلا فائدة.
    function selectChooserCardHtml(chooser, roleClass) {
        return '<div class="tr-select-chooser-card">' +
            '<div class="tr-select-chooser-ring ' + roleClass + '">' + ringAvatarHtml(chooser) + '</div>' +
            '<div>' +
                '<div class="tr-select-chooser-nmrow">' +
                    '<span class="tr-select-chooser-nm" data-agp-pcard-name="1">' + escapeHtml(playerLabel(chooser)) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ⚠️ بطاقة مرشَّح بشبكة الاختيار — تبويب الإرجاع فقط (هوية حقيقية
    // ظاهرة): أفاتار ٦٠px يتراكب على لوح اسم دائري، رقم عرض عشوائي
    // (index+1، مو رقم ثابت — راجع تعليق renderTurnModal) داخل تدفّق
    // لوح الاسم.
    function selectCandidateCardHtml(p, index, roleClass) {
        return '<div class="tr-select-cand-card" data-index="' + index + '">' +
            '<div class="tr-select-cand-row">' +
                '<div class="tr-select-cand-avatar">' + ringAvatarHtml(p) + '</div>' +
                '<div class="tr-select-cand-plate">' +
                    '<span class="tr-select-cand-name" data-agp-pcard-name="1">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="tr-select-cand-num ' + roleClass + '">' + (index + 1) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ⚠️ بطاقة مرشَّح بشبكة الاختيار — تبويب الإقصاء فقط (هوية مخفية):
    // نفس تخطيط selectCandidateCardHtml بالضبط، لكن دائرة "شخصية مخفية"
    // (❔) بدل الأفاتار الحقيقي، واسم قبيلة عشوائي بدل اسم اللاعب.
    function tribeCandidateCardHtml(tribeLabel, index, roleClass) {
        return '<div class="tr-select-cand-card" data-index="' + index + '">' +
            '<div class="tr-select-cand-row">' +
                '<div class="tr-select-cand-avatar tr-select-cand-avatar-hidden" aria-hidden="true">❔</div>' +
                '<div class="tr-select-cand-plate">' +
                    '<span class="tr-select-cand-name">' + escapeHtml(tribeLabel) + '</span>' +
                    '<span class="tr-select-cand-num ' + roleClass + '">' + (index + 1) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ⚠️ تحديد يدوي (نافذة الإقصاء فقط) — النقر على بطاقة مرشَّح لا
    // يُقصيه فوراً، فقط يحدِّده (حدود حمراء) ويبدّل نص الزر الأحمر
    // لـ"إقصاء [اسم القبيلة]" بدل "إقصاء صاحب الدور" الافتراضي — اسم
    // القبيلة تحديداً، مو الاسم الحقيقي، حتى يبقى التمويه سارياً لين
    // لحظة الضغط الفعلي على الزر. الإقصاء الفعلي يصير فقط بالضغط عليه
    // (handleForceEliminateClick).
    function selectCandidateManually(idx, tribeLabel) {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        _selectedCandidateIdx = idx;
        var grid = el('tr-select-candidates-grid');
        if (grid) {
            grid.querySelectorAll('.tr-select-cand-card[data-index]').forEach(function (card) {
                card.classList.toggle('tr-cand-selected', parseInt(card.getAttribute('data-index'), 10) === idx);
            });
        }
        var btn = el('tr-force-eliminate-btn');
        if (btn && tribeLabel) btn.textContent = '❌ إقصاء ' + tribeLabel;
    }

    // ⚠️ الزر الأحمر (نافذة الإقصاء فقط، مخفي بنافذة الإرجاع) — بدون
    // اختيار يدوي = يقصي صاحب الدور نفسه. بعد اختيار بطاقة يدوياً = يقصي
    // ذاك المرشَّح المحدَّد (الحقيقي — الهوية المخفاة كانت بصرياً فقط،
    // eliminatePlayer تتعامل مع كائن اللاعب الحقيقي دائماً).
    function handleForceEliminateClick() {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        var chooser = _pendingTurn.chooser;
        if (!chooser) return;
        var target = (_selectedCandidateIdx !== null && _pendingTurn.candidates[_selectedCandidateIdx])
            ? _pendingTurn.candidates[_selectedCandidateIdx]
            : chooser;
        AGP.timerManager.stop(TIMER_NAME);
        eliminatePlayer(target, chooser.id);
    }

    // ⚠️ "استئناف اللعبة" — الزر الوحيد بنافذة الإرجاع، وأحد زرَّين بنافذة
    // الإقصاء. يغلق الدور بدون أي إقصاء/إرجاع. بنافذة الإقصاء فقط: نفس
    // تصفير دوران العجلة القديم + استئناف "العب" التلقائي لو مفعَّل.
    function handleSelectResumeClick() {
        if (!_pendingTurn) return;
        var isRevive = _pendingTurn.type === 'revive';
        AGP.timerManager.stop(TIMER_NAME);
        closeTurnModal();
        if (!isRevive) {
            resetWheelSpinPosition();
            maybeAutoSpin();
        }
    }

    var _turnTickUnsub = null;
    var _turnEndUnsub = null;
    var _warningPlayedForSecond = null;

    function closeTurnModal() {
        var overlay = el('tr-select-overlay');
        if (overlay) overlay.style.display = 'none';
        AGP.timerManager.stop(TIMER_NAME);
        if (typeof _turnTickUnsub === 'function') _turnTickUnsub();
        if (typeof _turnEndUnsub === 'function') _turnEndUnsub();
        _turnTickUnsub = null;
        _turnEndUnsub = null;
        _pendingTurn = null;
        _warningPlayedForSecond = null;
        _selectedCandidateIdx = null;
    }

    // ⚠️ #tr-modal-chooser-card عنصر من التصميم القديم لنافذتَي الإقصاء/
    // الإرجاع — لم يعد يُملأ بأي محتوى من renderTurnModal الجديد، لكن
    // showResultAnnouncement/renderWinnerScreen ما زالا يستدعيان هذي
    // الدالة دفاعياً (احتياطاً لو بقي ظاهراً من حالة سابقة) — إبقاؤها
    // بلا ضرر.
    function hideChooserCard() {
        var card = el('tr-modal-chooser-card');
        if (card) { card.style.display = 'none'; card.innerHTML = ''; }
    }

    function startTurnTimer(onTimeout) {
        var seconds = liveSettings().eliminationTimerSeconds || 30;
        AGP.timerManager.start(TIMER_NAME, seconds);
        updateTimerDisplay(seconds);
        _turnTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            updateTimerDisplay(payload.remainingSeconds);
            // ⚠️ آخر 10 ثوانٍ: صوت تنبيه، مرة واحدة لكل ثانية (تيك التايمر
            // نفسه كل ثانية أصلاً، فهذا يعطي إحساس "نبضة" حتى ينتهي الوقت).
            if (payload.remainingSeconds > 0 && payload.remainingSeconds <= 10 && _warningPlayedForSecond !== payload.remainingSeconds) {
                _warningPlayedForSecond = payload.remainingSeconds;
                playSound('warning');
            }
        });
        _turnEndUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            onTimeout();
        });
    }

    function updateTimerDisplay(seconds) {
        var t = el('tr-select-timer');
        if (!t) return;
        t.textContent = '⏱️ ' + seconds + ' ث';
        t.classList.toggle('tr-timer-warning', seconds > 0 && seconds <= 10);
    }

    /**
     * @param {number} index - فهرس اللاعب ضمن _pendingTurn.candidates (من 0)
     */
    function resolveTurnSelection(index) {
        if (!_pendingTurn) return;
        var target = _pendingTurn.candidates[index];
        if (!target) return;

        var type = _pendingTurn.type;
        var chooserId = _pendingTurn.chooser && _pendingTurn.chooser.id;
        AGP.timerManager.stop(TIMER_NAME);

        if (type === 'eliminate') {
            eliminatePlayer(target, chooserId);
        } else if (type === 'revive') {
            revivePlayer(target, chooserId);
        }
    }

    /* ======================================================================
     *  7ب) تبويب إعلان النتيجة (إقصاء/إرجاع) — 4 ثوانٍ + صوت
     * ==================================================================== */
    /**
     * ⚠️ [0.46.0] إعادة تصميم كاملة: بدل الأيقونة+العنوان+الاسم الكبير
     * القديم، صندوق صغير (~650×300) بجملة واحدة "اللاعب [أفاتار+اسم] قام
     * بإقصاء/بإرجاع [أفاتار+اسم]". تأثير أحمر+تلاشي لصورة المُقصى،
     * تأثير أخضر + تحوّل حلقة المُرجَع من أحمر لأخضر (بالضبط كما أكّد
     * المستخدم بالطلب).
     * @param {Object} data - {target, chooser} كائنا لاعب كاملين (وليس
     *   نصوصاً فقط كما كان بالتصميم القديم). chooser قد يكون null (مثلاً
     *   إقصاء صاحب الدور نفسه عند انتهاء الوقت).
     */
    function showResultAnnouncement(type, data, onDone) {
        ensureScaffolding();
        var overlay = el('tr-modal-overlay');
        var box = el('tr-modal-box');
        if (!overlay || !box) { if (typeof onDone === 'function') onDone(); return; }
        hideChooserCard();

        var isEliminate = type === 'eliminate';
        playSound(isEliminate ? 'eliminate' : 'revive');

        var verb = isEliminate ? 'قام بإقصاء' : 'قام بإرجاع';
        var chooserHtml = data.chooser ? announcePersonHtml(data.chooser, '') : '';
        var targetEffectClass = isEliminate
            ? 'tr-announce-effect-red tr-announce-target-fadeout'
            : 'tr-announce-effect-green tr-announce-target-revive-ring';
        var targetHtml = announcePersonHtml(data.target, targetEffectClass);

        box.className = 'tr-announce-box ' + (isEliminate ? 'tr-announce-eliminate' : 'tr-announce-revive');
        box.innerHTML =
            '<div class="tr-announce-sentence">' +
            (chooserHtml
                ? ('اللاعب ' + chooserHtml + ' ' + verb + ' ' + targetHtml)
                : (isEliminate ? ('تم إقصاء ' + targetHtml) : ('تم إرجاع ' + targetHtml))) +
            '</div>';

        overlay.style.display = 'flex';

        // ⚠️ [0.45.12] تقليل مدة ظهور تبويب الإعلان من 4 ثوانٍ إلى 3 —
        // طلب صريح.
        window.setTimeout(function () {
            overlay.style.display = 'none';
            box.className = '';
            if (typeof onDone === 'function') onDone();
        }, 3000);
    }

    function announcePersonHtml(player, effectClass) {
        return '<span class="tr-announce-person">' +
            '<span class="tr-announce-avatar-wrap ' + effectClass + '">' + ringAvatarHtml(player) + '</span>' +
            '<span class="tr-announce-person-name">' + escapeHtml(playerLabel(player)) + '</span>' +
            '</span>';
    }

    /* ======================================================================
     *  8) الاستماع لشات البث — اختيار رقم، أو كتابة "تخطي" (إرجاع فقط)
     * ==================================================================== */
    function wireCommentListener() {
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_pendingTurn || !payload || typeof payload.text !== 'string') return;

            var chooser = _pendingTurn.chooser;
            if (!chooser || (payload.id !== chooser.id && payload.name !== chooser.name)) return;

            var text = payload.text.trim();

            // ⚠️ "تخطي" مسموحة فقط بنافذة الإرجاع — تُغلق النافذة بدون
            // إرجاع أي أحد. لا يوجد زر لهذا بالواجهة عمداً (طلب صريح).
            if (_pendingTurn.type === 'revive' && text === 'تخطي') {
                AGP.timerManager.stop(TIMER_NAME);
                closeTurnModal();
                return;
            }

            var n = parseInt(text, 10);
            if (isNaN(n) || n < 1 || n > _pendingTurn.candidates.length) return;
            resolveTurnSelection(n - 1);
        });
    }

    /* ======================================================================
     *  9) الإنعاش عن طريق الدعم — عبر حدث stream:giftReceived الموجود أصلاً
     * ==================================================================== */
    function wireGiftListener() {
        _giftUnsub = AGP.events.on('stream:giftReceived', function (payload) {
            var settings = liveSettings();
            if (!_matchActive || !settings.giftRevivalEnabled) return;
            if (!payload || !payload.giftName) return;
            if (payload.giftName !== settings.giftRevivalGiftName) return;

            var entry = _eliminated.filter(function (e) {
                return e.player.id === payload.id || e.player.name === payload.name;
            })[0];
            if (!entry) return;

            var maxCount = settings.giftRevivalMaxCount || 1;
            var usedCount = _giftReviveCounts[entry.player.id] || 0;
            if (usedCount >= maxCount) {
                showToast('⚠️ ' + playerLabel(entry.player) + ' استخدم كل مرات الإنعاش بالدعم المسموحة');
                return;
            }

            _giftReviveCounts[entry.player.id] = usedCount + 1;
            revivePlayerByEntry(entry);
        });
    }

    function revivePlayerByEntry(entry) {
        var idx = _eliminated.indexOf(entry);
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(entry.player);

        realignWheelAfterRosterChange();

        logEvent('gift', '🎁 ' + playerLabel(entry.player) + ' رجع للعبة عن طريق الدعم');
        // ⚠️ استُبدلت البطاقة العائمة القديمة (showGiftReviveCard) بتبويب
        // "عودة لاعب" الموحَّد الجديد — راجع showReviveSplash أدناه.
        showReviveSplash(entry.player, { reason: 'gift' });
        // ⚠️ لا نضيفه لقائمة نافذة إقصاء مفتوحة حالياً لو موجودة — يظهر
        // فقط بداية الدورة الجاية على العجلة (موجود أصلاً بـ_alive الآن).
    }

    /**
     * ⚠️ [تبويب "عودة لاعب" الجديد] نافذة احتفالية موحَّدة تظهر وسط
     * الشاشة فوق كل شيء (حتى فوق نافذة الاختيار المفتوحة لو مفتوحة بنفس
     * اللحظة، بدون مقاطعتها — pointer-events:none + z-index أعلى من كل
     * عنصر بالصفحة)، تحل محل: (أ) البطاقة العائمة القديمة (إنعاش بالدعم
     * فقط)، (ب) تبويب إعلان النتيجة لحالة الإرجاع (انعاش صديق فقط) —
     * منقولة بالحرف من تصميم روليت الإقصاء الأخير (showReviveSplash)،
     * بألوان هوية روليت القبائل. تختفي تلقائياً بعد ثانيتين بالضبط.
     * @param {Object} player - اللاعب الذي عاد للعبة
     * @param {Object} opts - {reason: 'gift'|'friend', chooser?: player}
     * @param {Function} [onDone] - يُستدعى بعد اختفاء التبويب تلقائياً
     *   (بعد ثانيتين بالضبط) — يحافظ على استمرار تدفّق اللعبة (مثلاً
     *   maybeAutoSpin() بعد إنعاش عبر "انعاش صديق"). حالة "بالدعم" لا
     *   تمرّر onDone (لا إجراء إضافي مطلوب بعدها).
     */
    function showReviveSplash(player, opts, onDone) {
        opts = opts || {};
        ensureScaffolding();
        var overlay = el('tr-revive-splash-overlay');
        var box = el('tr-revive-splash-box');
        if (!overlay || !box || !player) {
            if (typeof onDone === 'function') onDone();
            return;
        }

        playSound('revive');

        var reasonHtml;
        if (opts.reason === 'friend' && opts.chooser) {
            reasonHtml = '💚 ' + escapeHtml(playerLabel(opts.chooser)) + ' أرجعه للعبة عن طريق إنعاش صديق!';
        } else if (opts.reason === 'friend') {
            reasonHtml = '💚 رجع للعبة عن طريق إنعاش صديق!';
        } else {
            reasonHtml = '🎁 رجع للعبة عن طريق الدعم!';
        }

        box.innerHTML =
            '<img class="tr-revive-splash-heart" src="revive-heart.png" alt="">' +
            '<div class="tr-revive-splash-reason">' + reasonHtml + '</div>' +
            '<div class="tr-revive-splash-avatar">' + ringAvatarHtml(player) + '</div>' +
            '<div class="tr-revive-splash-name">' + escapeHtml(playerLabel(player)) + '</div>';

        overlay.style.display = 'flex';
        // ⚠️ إعادة تشغيل أنيميشن pop-in لو ظهرت النافذة مرتين متتاليتين
        // بسرعة — إزالة الكلاس ثم فرض إعادة تدفّق (reflow) قبل إضافته.
        box.classList.remove('tr-revive-splash-anim');
        void box.offsetWidth;
        box.classList.add('tr-revive-splash-anim');

        if (_reviveSplashTimer) window.clearTimeout(_reviveSplashTimer);
        _reviveSplashTimer = window.setTimeout(function () {
            overlay.style.display = 'none';
            _reviveSplashTimer = null;
            if (typeof onDone === 'function') onDone();
        }, 2000);
    }

    /* ======================================================================
     *  10) مزامنة حذف لاعب (زر 🗑️ بشاشة الإعدادات أثناء المباراة —
     *      js/agp-game-shell.js عبر AGP.player.removePlayer، يبث
     *      player:removed) — حذف نهائي كامل، خارج نطاق الإقصاء/الإنعاش.
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;

        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);

        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);

        if (aliveIdx === -1 && elimIdx === -1) return; // ما كان جزءاً من مباراة نشطة أصلاً (حذف قبل بدء الجولة مثلاً)

        realignWheelAfterRosterChange();

        // لو كان صاحب الدور بالضبط باللي حُذف وسط نافذة مفتوحة، نُلغي
        // الدور بالكامل (بدون إقصاء/إرجاع) بدل حالة غير متّسقة.
        if (_pendingTurn && _pendingTurn.chooser && _pendingTurn.chooser.id === removedPlayer.id) {
            closeTurnModal();
            return;
        }
        // لو كان مجرد أحد المرشَّحين بنافذة مفتوحة، نعيد بناءها بدونه.
        if (_pendingTurn) {
            _pendingTurn.candidates = _pendingTurn.candidates.filter(function (p) { return p.id !== removedPlayer.id; });
            if (!_pendingTurn.candidates.length) { closeTurnModal(); return; }
            renderTurnModal();
        }

        if (_matchActive && _alive.length <= 1) {
            endMatch(_alive[0] || null);
        }
    }

    /**
     * ⚠️ [0.45.7] إصلاح خلل انضمام لاعب أثناء مباراة نشطة (زر "إضافة لوبي
     * جديد" بشاشة الإعدادات) — راجع تعليق مستمع player:joined أعلاه.
     * لا يُنفَّذ شيء إلا لو فعلاً فيه مباراة جارية والّلاعب ما كان موجوداً
     * أصلاً (لا بالأحياء ولا بالمُقصَين — تفادياً لتكرار وهمي لو وصل
     * الحدث أكثر من مرة لأي سبب).
     */
    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive) return;
        var alreadyAlive = _alive.some(function (p) { return p.id === newPlayer.id; });
        var alreadyEliminated = _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (alreadyAlive || alreadyEliminated) return;
        _alive.push(newPlayer);
        realignWheelAfterRosterChange();
    }

    /* ======================================================================
     *  10ب) بانر أحداث المباراة — شريط جانبي ثابت (450px)، من تحت الشعار
     *      حتى أسفل الشاشة، بنفس جهة الشعار (يسار — أعلى يسار بالهيدر
     *      الفعلي المرصود بالاختبار البصري). يسجّل 5 أنواع أحداث بشكل
     *      مستمر: دوران، إقصاء، إرجاع، انضمام لاعب جديد، هدايا.
     * ==================================================================== */
    var EVENT_ICONS = { spin: '🎡', eliminate: '❌', revive: '💚', join: '➕', gift: '🎁' };
    var EVENT_LOG_MAX = 60;

    // ⚠️ [0.45.7] البانر صار مخفياً افتراضياً (راجع CSS tr-log-visible) —
    // زر دائري صغير ثابت بأعلى يسار الشاشة يُظهره/يُخفيه. البانر نفسه
    // position:fixed خارج تخطيط #tr-stage بالكامل، فإخفاؤه/إظهاره لا
    // يزاحم ولا يحرّك أي عنصر بشاشة اللعب — الزر ثابت بمكانه بغضّ النظر
    // عن حالة البانر (z-index أعلى منه) حتى يبقى قابلاً للنقر دائماً.
    function ensureEventLog() {
        if (!el('tr-event-log')) {
            var log = document.createElement('div');
            log.id = 'tr-event-log';
            log.innerHTML = '<h3>📋 أحداث المباراة</h3><div id="tr-event-log-list"></div>';
            document.body.appendChild(log);
        }
        if (!el('tr-event-log-toggle')) {
            var btn = document.createElement('button');
            btn.id = 'tr-event-log-toggle';
            btn.type = 'button';
            btn.title = 'إظهار/إخفاء أحداث المباراة';
            btn.textContent = '📋';
            btn.onclick = function () {
                var logEl = el('tr-event-log');
                if (!logEl) return;
                var visible = logEl.classList.toggle('tr-log-visible');
                btn.classList.toggle('tr-log-toggle-active', visible);
            };
            document.body.appendChild(btn);
        }
    }

    function logEvent(type, text) {
        ensureEventLog();
        var list = el('tr-event-log-list');
        if (!list) return;
        var item = document.createElement('div');
        item.className = 'tr-event-log-item';
        item.innerHTML = '<span class="tr-event-icon">' + (EVENT_ICONS[type] || '•') + '</span><span>' + escapeHtml(text) + '</span>';
        list.insertBefore(item, list.firstChild);
        while (list.children.length > EVENT_LOG_MAX) {
            list.removeChild(list.lastChild);
        }
    }

    /* ======================================================================
     *  11) الحد الأقصى للاعبين — إغلاق فعلي للانضمام (ليس AGP.lobby.close()
     *      وحدها — راجع الملاحظة الصادقة أعلى الملف؛ checkKeyword() الحقيقية
     *      بـagp-keyword-manager.js لا تتحقق من AGP.lobby إطلاقاً).
     * ==================================================================== */
    function enforceMaxPlayers() {
        var settings = AGP.gameShell.getSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }

    /* ======================================================================
     *  12) نهاية المباراة + تقرير النقاط (نفس مسار dashboard-core الحقيقي
     *      — بدون أي تعديل بقيم النقاط نفسها، النظام العام الموحّد فقط)
     *  ⚠️ [0.45.0] الاستدعاء كان "أرسل وانسَ" (fire-and-forget) بدون
     *  قراءة النتيجة — الآن نُنظر نتيجته فعلياً (result.awarded) قبل رسم
     *  شاشة الفائز، عشان نعرض النقاط المكتسبة فعلياً على البطاقة.
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        stopAutoPlay();
        closeTurnModal();
        if (typeof _commentUnsub === 'function') _commentUnsub();
        if (typeof _giftUnsub === 'function') _giftUnsub();

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return {
                    tiktokUsername: tiktokUsernameFor(p),
                    won: Boolean(winner) && p.id === winner.id
                };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () {
                    // فشل صامت (شبكة/باك إند) — لا نوقف عرض نتيجة المباراة بسبب هذا
                    // (نفس نمط dashboard-core.js)، لكن نُرجع null حتى تعرف شاشة
                    // الفائز إنها ما قدرت تتأكد من النقاط (تفرّق بين "فشل" و"بدون حساب").
                    return null;
                });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });

        pointsPromise.then(function (pointsResult) {
            renderWinnerScreen(winner, pointsResult);
        });
    }

    /**
     * ⚠️ [0.45.0] يبحث عن سطر هذا اللاعب داخل result.awarded (يُطابَق
     * بـtiktokUsername فقط — نفس المفتاح المُرسَل بالمشاركين أعلاه).
     * موجود فقط لو الحساب مرتبط وموثَّق (راجع authService.findVerifiedUserByTikTok
     * بالباك إند) — غير ذلك يرجع null (يعني "بدون حساب مرتبط").
     */
    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    /**
     * ⚠️ [0.45.0] نص النقاط بجانب البطاقة — 3 حالات:
     *  1) pointsResult === null (فشل الاتصال بالنظام العام، أو AGPAuth غير
     *     متوفر أصلاً) → نص محايد "تعذّر جلب النقاط الآن"، لأننا فعلياً
     *     ما نعرف لو صاحب حساب أو لا (تفرّق صريحة عن حالة 3).
     *  2) الحساب مرتبط وموثَّق وله سطر بـawarded → النقاط الحقيقية + "تظهر
     *     في بروفايلك".
     *  3) الحساب غير مرتبط/غير موثَّق (النتيجة نجحت لكن بدون سطر لهذا
     *     اللاعب) → "لازم يسوي حساب" تلقائياً.
     */
    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) {
            return '<div class="tr-trophy-points tr-points-noaccount">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="tr-trophy-points tr-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="tr-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="tr-trophy-points tr-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
    }

    /**
     * ⚠️ [0.45.0] بطاقة أفاتار دائرية بحلقة رمزية بسيطة (بدون الاعتماد
     * على AGP.playerCard هنا عمداً — تلك الوحدة تبني بطاقة "بيضاوية:
     * صورة+اسم بجانب بعض"، بينما التصميم الجديد يحتاج صورة دائرية مستقلة
     * داخل حلقة، والاسم نص منفصل تحتها، مطابقةً لنموذج المستخدم المرجعي).
     */
    function ringAvatarHtml(player) {
        var name = playerLabel(player);
        var avatarUrl = player && player.avatarUrl;
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return avatarUrl
            ? '<img class="tr-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;tr-ring-avatar tr-ring-avatar--fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
            : '<div class="tr-ring-avatar tr-ring-avatar--fallback">' + escapeHtml(initials) + '</div>';
    }

    function ringHtml(player, kind) {
        var badgeIcon = kind === 'winner' ? '👑' : '⚔️';
        return '<div class="tr-ring-wrap tr-ring-' + kind + '">' +
            '<div class="tr-ring-inner">' + ringAvatarHtml(player) + '</div>' +
            '<div class="tr-ring-badge tr-badge-' + kind + '">' + badgeIcon + '</div>' +
            '</div>';
    }

    function trophyCardHtml(player, opts) {
        opts = opts || {};
        return '<div class="tr-trophy-card ' + (opts.cls || '') + '"' + (opts.cardId ? ' id="' + opts.cardId + '"' : '') + '>' +
            '<div class="tr-trophy-label">' + opts.label + '</div>' +
            ringHtml(player, opts.kind) +
            '<div class="tr-trophy-name">' + escapeHtml(playerLabel(player)) + '</div>' +
            (opts.extra || '') +
            (opts.pointsHtml || '') +
            '</div>';
    }

    function computeMostEliminations() {
        var bestId = null, bestCount = 0;
        Object.keys(_eliminationCounts).forEach(function (id) {
            if (_eliminationCounts[id] > bestCount) { bestCount = _eliminationCounts[id]; bestId = id; }
        });
        if (!bestId) return null;
        var player = findPlayerByIdAnywhere(bestId);
        return player ? { player: player, count: bestCount } : null;
    }

    // ⚠️ [0.46.0] "تأثير تطاير" احتفالي عند الفوز — بديل خلفية/حدود
    // البطاقة القديمة المُلغاة بالكامل (طلب صريح). قصاصات ملوَّنة CSS/JS
    // بحتة (بدون أي صور خارجية، اتساقاً مع قيد "لا صور جاهزة" المطبَّق
    // بكل المشروع) تنطلق من مركز البطاقة بزوايا/مسافات عشوائية.
    var CONFETTI_COLORS = ['#ffd400', '#ff4dff', '#00c2ff', '#7c3aed', '#4ade80', '#ff6b8a'];
    function spawnConfetti(container, count) {
        if (!container) return;
        count = count || 26;
        for (var i = 0; i < count; i++) {
            var piece = document.createElement('span');
            piece.className = 'tr-confetti-piece';
            var angle = Math.random() * Math.PI * 2;
            var dist = 70 + Math.random() * 90;
            piece.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
            piece.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
            piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            piece.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
            container.appendChild(piece);
            (function (p) {
                window.setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1700);
            })(piece);
        }
    }

    function renderWinnerScreen(winner, pointsResult) {
        ensureScaffolding();
        hideChooserCard();
        var overlay = el('tr-modal-overlay');
        var box = el('tr-modal-box');
        if (!overlay || !box) return;

        var mostElim = computeMostEliminations();

        var cardsHtml = '';
        if (winner) {
            cardsHtml += trophyCardHtml(winner, {
                cls: 'tr-trophy-winner', label: '🏆 الفائز', kind: 'winner', cardId: 'tr-trophy-card-winner',
                pointsHtml: pointsHtmlFor(pointsResult, winner)
            });
        }
        if (mostElim) {
            cardsHtml += trophyCardHtml(mostElim.player, {
                cls: 'tr-trophy-most', label: '⚔️ الأكثر إقصاءً', kind: 'most', cardId: 'tr-trophy-card-most',
                extra: '<div class="tr-trophy-count">' + mostElim.count + ' إقصاء</div>',
                pointsHtml: pointsHtmlFor(pointsResult, mostElim.player)
            });
        }

        box.className = 'tr-modal-box';
        box.style.textAlign = 'center';
        box.innerHTML =
            '<div id="tr-winner-box">' +
            '<h2>🏁 انتهت المباراة!</h2>' +
            '<div class="tr-trophy-cards">' + (cardsHtml || '<p class="tr-trophy-label">بدون فائز</p>') + '</div>' +
            '<div class="tr-winner-actions">' +
            '<button class="tr-btn-secondary" id="tr-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '<button class="tr-btn-secondary" id="tr-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '</div></div>';

        document.getElementById('tr-replay-same-btn').onclick = handleReplaySamePlayers;
        document.getElementById('tr-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession(); // يبث game:reset — يستدعي onDestroy() تلقائياً
            window.location.reload();
        };

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            if (winner) spawnConfetti(el('tr-trophy-card-winner'), 28);
            if (mostElim) spawnConfetti(el('tr-trophy-card-most'), 20);
        }, 120);
    }

    /**
     * ⚠️ "إعادة المباراة بنفس اللاعبين" — يتخطى شاشتي الإعدادات واللوبي
     * تماماً، يرجع مباشرة لشاشة العجلة بنفس القائمة (كل من كان بالمباراة
     * السابقة سواء حياً أو مُقصى — اللاعبون المحذوفون يدوياً مستبعدون
     * تلقائياً لأنهم أُزيلوا فعلياً من _alive/_eliminated وقت الحذف).
     * تُعتبر مباراة جديدة كلياً: كل الحالات (إقصاء/إنعاش/عدادات) تتصفّر.
     */
    function handleReplaySamePlayers() {
        var roster = _alive.concat(_eliminated.map(function (e) { return e.player; }));
        if (!roster.length) return;

        var overlay = el('tr-modal-overlay');
        if (overlay) overlay.style.display = 'none';

        stopAutoPlay();
        resetMatchState();
        _alive = roster;
        _startedAt = Date.now();
        _matchActive = true;

        wireCommentListener();
        wireGiftListener();
        renderStage();

        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    /* ======================================================================
     *  13) تسجيل اللعبة + شاشة الإعدادات (agp-game-shell.js)
     * ==================================================================== */
    function giftLabelFor(value) {
        var match = COMMON_GIFTS.filter(function (g) { return g.value === value; })[0];
        if (!match) return value || 'اختر هدية';
        return match.label + ' · ' + giftCoinsText(match);
    }

    /**
     * ⚠️ [0.44.0] نافذة اختيار الهدية — تبويب منبثق مبني بالكامل هنا
     * (استجابةً لـfield.type === 'modal-trigger' الجديد بـagp-game-shell.js
     * — الملف العام لا يعرف شيئاً عن الهدايا نفسها). يعمل حتى قبل بدء
     * المباراة (يُفتح من شاشة الإعدادات الأولى)، فيبني عناصره الخاصة
     * بنفسه (ensureScaffolding) بدل الاعتماد على renderStage.
     */
    function openGiftPickerModal(currentValue) {
        ensureScaffolding();
        var overlay = el('tr-modal-overlay');
        var box = el('tr-modal-box');
        if (!overlay || !box) return;

        // ⚠️ [0.45.0] أيقونة كل هدية = صورة Twemoji حقيقية (رخصة MIT + CC-BY 4.0،
        // مو صور تيك توك الرسمية) + اسم الهدية + قيمتها الحقيقية بالعملات
        // (بحسب بحث فعلي — راجع الملاحظة أعلى COMMON_GIFTS وCHANGELOG).
        var itemsHtml = COMMON_GIFTS.map(function (g) {
            var active = g.value === currentValue ? 'agp-pill-active' : '';
            return '<button type="button" class="agp-pill-btn tr-gift-btn ' + active + '" data-gift-value="' + escapeHtml(g.value) + '">' +
                '<img class="tr-gift-icon" src="' + giftIconUrl(g) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';">' +
                '<span class="tr-gift-name">' + escapeHtml(g.label) + '</span>' +
                '<span class="tr-gift-coins">' + giftCoinsText(g) + '</span>' +
                '</button>';
        }).join('');

        box.className = '';
        box.style.textAlign = 'center';
        box.innerHTML =
            '<h2>🎁 اختر هدية الإنعاش</h2>' +
            '<div id="tr-modal-sub">اضغط على الهدية المطلوبة — تُغلق النافذة تلقائياً بعد الاختيار</div>' +
            '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:14px;">' + itemsHtml + '</div>';

        box.querySelectorAll('[data-gift-value]').forEach(function (btn) {
            btn.onclick = function () {
                var value = btn.getAttribute('data-gift-value');
                AGP.gameShell.setSetting('giftRevivalGiftName', value);
                overlay.style.display = 'none';
                box.style.textAlign = '';
            };
        });

        overlay.style.display = 'flex';
    }

    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة',
                min: 2, default: 20
            },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [
                    { label: 'الكل', value: false },
                    { label: 'المتابعون فقط', value: true }
                ],
                default: false
            },
            {
                // ⚠️ [0.45.12] نص توضيحي مختصر أُضيف للتسمية نفسها (لا يوجد
                // حقل hint/description منفصل بنظام الإعدادات المشترك) —
                // طلب صريح لتوضيح آلية "انعاش صديق" دون الحاجة لشرح خارجي.
                key: 'friendRevivalEnabled', type: 'toggle',
                label: '🎗️ ميزة انعاش صديق (لو توقفت العجلة على نفس الاسم مرتين متتاليتين، يرجع أحد المُقصَين)',
                default: false
            },
            {
                key: 'giftRevivalEnabled', type: 'toggle', label: '🎁 الإنعاش عن طريق الدعم',
                default: false
            },
            {
                key: 'giftRevivalGiftName', type: 'modal-trigger', label: 'الهدية المختارة',
                default: COMMON_GIFTS[0].value,
                formatValue: giftLabelFor,
                onOpen: openGiftPickerModal,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'giftRevivalMaxCount', type: 'counter', label: 'كم مرة يقدر ينعش نفسه (طول المباراة)',
                min: 1, default: 1,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'eliminationTimerSeconds', type: 'pill-group', label: '⏱️ موقّت الإقصاء',
                options: ELIMINATION_TIMER_OPTIONS, default: 30
            },
            {
                key: 'eliminationTimeoutBehavior', type: 'pill-choice', label: 'عند انتهاء الوقت',
                options: [
                    { label: 'يُقصى صاحب الدور', value: 'eliminate_chooser' },
                    { label: 'يتخطى دوره فقط', value: 'skip_turn' }
                ],
                default: 'eliminate_chooser'
            },
            {
                // ⚠️ [0.45.0] صار خطاً قابلاً للتحريك (slider) بدل عدّاد +/-،
                // ويظهر فقط بالإعدادات المفتوحة أثناء مباراة نشطة (onlyMidMatch)
                // — مخفي كلياً بشاشة الإعدادات الأولى قبل بدء المباراة.
                key: 'soundVolume', type: 'slider', label: '🔊 مستوى الصوت',
                min: 0, max: 10, default: 7, onlyMidMatch: true
            }
        ];
    }

    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _startedAt = Date.now();
        _matchActive = true;

        wireCommentListener();
        wireGiftListener();
        renderStage();
    }

    /* ======================================================================
     *  تحسينات شاشتي الإعدادات/اللوبي المشتركتين (js/agp-game-shell.js) —
     *  خاصة بروليت القبائل فقط، بدون أي تعديل على الملف المشترك نفسه.
     *  ⚠️ [0.45.12] نفس التقنية المُثبَتة فعلياً بلعبة روليت الفواكه (نفس
     *  المنصة، ملف مختلف تماماً) — بعد سؤال صريح من المستخدم "هل راح
     *  يتاثر اي شي بخصوصها؟" تحقّقنا من الكود الحي الفعلي لروليت الفواكه
     *  (git show origin/main) وتأكّدنا إنها تستخدم بالضبط هذي الطريقة:
     *  MutationObserver يراقب #agp-shell-overlay (يُنشأ مرة واحدة عند
     *  init()، يبقى بالـDOM طول الوقت) ويعيد تطبيق تحسيناتنا كل مرة
     *  يُعاد فيها بناء محتوى #agp-shell-box بالكامل (كل تنقّل بين شاشة
     *  إعدادات/اتصال/لوبي يمسح المحتوى). كل دالة idempotent (تتأكد أول
     *  شي إن عنصرها مو موجود مسبقاً قبل ما تضيفه) — صفر تعديل على
     *  js/agp-game-shell.js، وصفر تأثير على أي لعبة أخرى تستخدم نفس
     *  الملف المشترك (هذا الكود موجود فقط بملف روليت القبائل نفسه، ولا
     *  يُحمَّل إطلاقاً إلا بصفحة هذي اللعبة تحديداً). هذا يُلغي الاقتراح
     *  السابق (خيار opt-in بالملف المشترك) لصالح هذي التقنية الأثبت.
     * ==================================================================== */
    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../index.html'; }
    }

    function makeBackToPlatformBtn() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tr-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    // ⚠️ زر "رجوع للمنصة" بشاشة الإعدادات الأولى (قبل الاتصال بالبث) —
    // طلب صريح (صورة 1)، بالإضافة لأيقونة 🏠 الثابتة بالهيدر أصلاً.
    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box')) return;
        if (box.querySelector('.tr-back-to-platform-btn')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
        if (!connectBtn) return;
        connectBtn.insertAdjacentElement('afterend', makeBackToPlatformBtn());
    }

    // ⚠️ [حذف كامل — منقول بالحرف من التحديث الأخير لروليت الإقصاء]
    // enhanceLobbyList() (زر ✕ محلي index-based)، markWideLobbyCards()
    // وapplyDynamicLobbyCardScale() (التصغير التلقائي المحلي) — الثلاثة
    // حُذفت بالكامل من هنا. السبب: js/agp-game-shell.js وjs/agp-player-
    // card.js المشتركان صار فيهما نفس هذي الميزات أصلياً (renderLobbyPlayerList
    // يمرّر removable:true فتضيف زر حذف حقيقي مرتبط بمعرّف اللاعب الفعلي،
    // وAGP.playerCard.fitAllNames تطبّق الـMarquee بنفسها، وrenderFramedHtml
    // تحسب عرض البطاقة المؤطَّرة رياضياً) — فأي نسخة محلية مكرِّرة لنفس
    // الشيء تتعارض بصرياً معها. حُذفت الثلاثة بالكامل، بدون أي استثناء
    // ولا حل مؤقّت محلي (نفس القرار المعتمَد فعلياً بروليت الإقصاء).

    // ⚠️ [0.45.14] عنوان اللوبي بلونين — يستبدل نص "اللوبي بانتظار
    // اللاعبين" (المُعرَّف بالملف المشترك) بنص جديد بلونين، حسب تصميم
    // Figma مُزوَّد من المستخدم. تعديل DOM من كودنا فقط (استبدال
    // innerHTML لعنصر h2 موجود أصلاً) — صفر لمس لملف
    // js/agp-game-shell.js نفسه، بنفس فلسفة كل تحسينات هذا القسم.
    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2 || h2.getAttribute('data-tr-heading') === '1') return;
        h2.innerHTML = '<span class="tr-lobby-title-plain">لوبي دخول لعبة - </span>' +
            '<span class="tr-lobby-title-accent">روليت القبائل</span>';
        h2.setAttribute('data-tr-heading', '1');
    }

    // ⚠️ [0.45.14] شعار "ألعاب أيمن" شفاف بمنتصف صندوق اللوبي (من [0.45.12])
    // + صف الأزرار السفلي الجديد (طلب صريح، صورة 5): "العودة لاعدادات
    // المباراة" (جديد كلياً — يلغي الاتصال الحالي بالبث ويرجّع لشاشة
    // البداية عبر إعادة تحميل الصفحة، بعد تأكيد المستخدم؛ نفس الأسلوب
    // المُثبَت بروليت الفواكة — ما فيه طريقة عامة نظيفة تفتح شاشة
    // الاتصال الكاملة من خارج الملف المشترك) + زر البدء الأصلي (نفس
    // العنصر ونفس onclick المُعرَّف بالملف المشترك، فقط نص/لون جديدان)
    // + زر "رجوع لمنصة ألعاب أيمن" (من [0.45.12]) يبقى تحت الصف الجديد
    // — المستخدم أكّد صراحة إبقاء الثلاثة أزرار معاً.
    function enhanceLobbyWatermarkAndActions() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;

        if (!box.querySelector('#tr-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'tr-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;

        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.tr-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'tr-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);

            var backSettingsBtn = document.createElement('button');
            backSettingsBtn.type = 'button';
            backSettingsBtn.className = 'tr-lobby-back-settings-btn';
            backSettingsBtn.textContent = '⚙️ العودة لاعدادات المباراة';
            backSettingsBtn.addEventListener('click', function () {
                if (window.confirm('بيرجّعك لشاشة إعدادات المباراة الأولى، ويلغي الاتصال الحالي بالبث ' +
                    'ويقفل اللوبي — بيحتاج اتصال جديد بعدها. تكمل؟')) {
                    window.location.reload();
                }
            });

            row.appendChild(backSettingsBtn);
            row.appendChild(startBtn); // ينقل الزر الأصلي (بعنصره ونفس onclick) داخل الصف الجديد
        }

        // ⚠️ [0.45.15] طلب صريح: زر "رجوع للمنصة" صار ضمن نفس الصف (ثلاثة
        // أزرار بصف واحد، W360×H48 موحَّد) بدل عنصر منفصل تحت الصف.
        if (!row.querySelector('.tr-back-to-platform-btn')) {
            row.appendChild(makeBackToPlatformBtn());
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        // ⚠️ لا حاجة لأي معالجة يدوية لقائمة اللوبي هنا بعد الآن — الملف
        // المشترك (renderLobbyPlayerList) يبني زر الحذف والـMarquee
        // وأحجام البطاقات تلقائياً بنفسه. راجع التعليق أعلى هذا القسم
        // لتفاصيل ما كان هنا سابقاً.
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        var overlay = el('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(applyShellEnhancements);
        observer.observe(overlay, { childList: true, subtree: true });
    }

    function registerGame() {
        // ⚠️ [0.45.7] إصلاح خلل: كان يُنادى أول مرة فقط عند بدء أول مباراة
        // (renderStage → ensureScaffolding)، فتحسين مفتاحي "انعاش صديق"/
        // "الإنعاش عن طريق الدعم" (CSS داخل نفس الأنماط المحقونة هنا)
        // ما كان يظهر إطلاقاً بشاشة الإعدادات الأولى (قبل بدء أي مباراة)
        // — الاستدعاء صار هنا أيضاً (دالة idempotent، تتأكد أصلاً من عدم
        // التكرار) حتى تكون الأنماط جاهزة من أول تحميل للصفحة.
        injectStageStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'roulette-games',

            onLoad: function () {
                AGP.log('Tribe Roulette: onLoad.');
            },
            onPlayerJoin: function () {
                enforceMaxPlayers();
            },
            onRoundEnd: function () {
                AGP.log('Tribe Roulette: onRoundEnd.');
            },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Tribe Roulette: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Tribe Roulette: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        // ⚠️ يُستمَع له مرة واحدة بشكل دائم (مو محصور بمدة مباراة نشطة)،
        // لأن زر الحذف بشاشة الإعدادات متاح حتى قبل بدء الجولة تقنياً.
        AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });

        // ⚠️ [0.46.0] تسجيل مستمر بانضمام لاعب جديد بانر أحداث المباراة.
        // ⚠️ [0.47.0] أُلغي مستمع "كل هدية تصل من شات البث" العام الذي
        // كان مُضافاً هنا بـ[0.46.0] — كان يسجّل أي هدية حقيقية بغضّ
        // النظر عن علاقتها بالمباراة (سبام غير مرتبط)، بطلب صريح إن
        // البانر يعرض "أحداث المباراة" فقط. تسجيل الهدية اللي فعلاً
        // تسبّب إنعاش لاعب لا يزال قائماً (راجع revivePlayerByEntry
        // أدناه) — تلك حدث مباراة حقيقي، بعكس أي هدية عشوائية بالشات.
        // ⚠️ [0.45.7] إصلاح خلل حقيقي: هذا المستمع كان يسجّل الحدث بالبانر
        // فقط، بدون أي ربط فعلي للاعب الجديد بمصفوفة الأحياء الداخلية —
        // فلاعب ينضم عبر "إضافة لوبي جديد" أثناء مباراة نشطة كان يظهر
        // بقائمة اللوبي المصغَّرة بالإعدادات فقط، ولا يدخل العجلة إطلاقاً.
        // الحل: handlePlayerJoinedMidMatch أدناه — تتحقق من مباراة نشطة
        // فعلياً وأن اللاعب مو مكرَّر (لا بالأحياء ولا بالمُقصَين)، ثم
        // تضيفه لـ_alive وتعيد محاذاة العجلة (نفس دالة realignWheelAfterRosterChange
        // المستخدَمة بكل تغيير تشكيلة آخر، لضمان توافق العجلة البصري).
        AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (!p) return;
            logEvent('join', '➕ ' + playerLabel(p) + ' انضم للعبة');
            handlePlayerJoinedMidMatch(p);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة روليت القبائل',
            gameExplanation: 'تدور العجلة وتتوقف عند أحد اللاعبين، فتظهر له قبائل تخفي خلفها بقية اللاعبين — يختار رقم قبيلة من الشات ليقصي من خلفها، بدون معرفة هويته الحقيقية إلا بعد الإقصاء. ' +
                'لو وقفت العجلة على نفس الشخص مرتين متتاليتين (ولو مفعّلة ميزة انعاش صديق)، يقدر يرجّع مُقصى بدل الإقصاء — هنا الهوية والصورة ظاهرتان بالكامل ' +
                '(كل مُقصى يترجّع بهذي الطريقة مرة واحدة فقط طول المباراة). ' +
                'المُقصى يقدر يرجع بإرسال هدية معيّنة لو مفعّلة ميزة الإنعاش بالدعم. تستمر المباراة حتى يبقى لاعب واحد.',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound,
            // ⚠️ [0.46.0] زر "العب" — يُبنى عاماً بـjs/agp-game-shell.js
            // (لا يعرف معناه، فقط يرسم الزر وينادي onToggle) ويُنفَّذ
            // فعلياً هنا (handleAutoPlayToggle → maybeAutoSpin/stopAutoPlay).
            // ⚠️ [0.47.0] النص صار أوضح "العب التلقائي"/"إيقاف التلقائي"
            // بطلب صريح (كان "العب"/"إيقاف" فقط، غير واضح المعنى).
            midMatchToggleButton: {
                icon: '▶️', label: 'العب التلقائي',
                activeIcon: '⏸️', activeLabel: 'إيقاف التلقائي',
                onToggle: handleAutoPlayToggle
            }
        });

        // ⚠️ [0.45.12] تفعيل تحسينات شاشتي الإعدادات/اللوبي (زر رجوع
        // للمنصة، ✕ الإقصاء اليدوي، الشعار الشفاف) — راجع التعليق التفصيلي
        // فوق تعريف الدوال أعلاه.
        wireSharedShellEnhancements();
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
