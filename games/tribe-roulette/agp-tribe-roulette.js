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
    // ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] 'wheel' أو 'reel' — يبقى
    // كما هو عبر renderStage() المتكرّرة (نفس فلسفة _wheelSizePx أعلاه).
    var _displayMode = 'wheel';
    var REEL_REPEATS = 10; // عدد تكرارات قائمة اللاعبين داخل شريط البكرة (مسافة سكرول كافية للتشويق)
    var _reelOffset = 0;

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

            /* ======================================================================
             *  [نموذج "تبديل عجلة/سكرول" المعتمَد] زر التبديل فوق العجلة،
             *  بكرة السكرول الرأسية البديلة، وصف الأزرار السفلي الموحَّد
             *  (إعادة ترتيب + العب التلقائي بجانب بعض).
             * ==================================================================== */
            '#tr-display-toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:2px;}',
            '#tr-display-toggle-row button{padding:8px 18px;border-radius:999px;',
            'border:1px solid rgba(255,255,255,0.16);background:transparent;color:#a99cc4;',
            'font-family:inherit;font-weight:800;font-size:0.8em;cursor:pointer;transition:all 0.15s;}',
            '#tr-display-toggle-row button.tr-mode-active{background:linear-gradient(90deg,var(--tr-accent2),var(--tr-accent));',
            'color:#0a0612;border-color:transparent;}',
            '#tr-stage-btn-row{display:flex;align-items:center;gap:12px;margin-top:2px;}',
            '#tr-stage-btn-row #tr-shuffle-btn{margin-top:0;}',
            '#tr-autoplay-btn{padding:9px 22px;border-radius:999px;border:none;cursor:pointer;',
            'font-family:inherit;font-weight:800;font-size:0.85em;color:#fff;',
            'background:linear-gradient(90deg,#22c55e,#16a34a);box-shadow:0 4px 14px rgba(34,197,94,0.3);}',
            '#tr-autoplay-btn.tr-autoplay-active{background:linear-gradient(90deg,#ef4444,#b91c1c);',
            'box-shadow:0 4px 14px rgba(239,68,68,0.35);}',
            // ⚠️ زر "العب التلقائي" القديم بدرج الإعدادات الجانبي صار
            // مكرَّراً (نفس الوظيفة، نفس الحالة المتزامنة) بعد إضافة الزر
            // الجديد بالشاشة الرئيسية — نُخفيه بدل حذف منطقه بالكامل
            // (أبسط وأقل خطورة، بلا أي تعديل على js/agp-game-shell.js).
            '#agp-midmatch-toggle-btn{display:none !important;}',

            /* ---- بكرة السكرول الرأسية (شكل بديل للعجلة الدائرية) ---- */
            '#tr-reel-wrap{position:relative;margin:0 auto;border-radius:24px;',
            'background:linear-gradient(180deg,#150a22,#0a0512);',
            'box-shadow:0 0 0 3px #9a6a1e,0 0 0 6px #ffd97a,0 0 34px rgba(128,212,255,0.4),',
            'inset 0 0 26px rgba(0,0,0,0.6);overflow:hidden;}',
            '#tr-reel-wrap::before,#tr-reel-wrap::after{content:"";position:absolute;left:0;right:0;',
            'height:22%;z-index:3;pointer-events:none;}',
            '#tr-reel-wrap::before{top:0;background:linear-gradient(180deg,#0a0512 15%,transparent);}',
            '#tr-reel-wrap::after{bottom:0;background:linear-gradient(0deg,#0a0512 15%,transparent);}',
            '.tr-reel-marker{position:absolute;left:10px;right:10px;height:2px;z-index:4;',
            'background:linear-gradient(90deg,transparent,#80d4ff,transparent);',
            'box-shadow:0 0 10px rgba(128,212,255,0.9);}',
            '.tr-reel-marker-top{top:calc(var(--tr-reel-item-h, 100px) * 1);}',
            '.tr-reel-marker-bottom{top:calc(var(--tr-reel-item-h, 100px) * 2);}',
            '#tr-reel-list{position:absolute;left:0;right:0;top:0;will-change:transform;}',
            '.tr-reel-item{height:var(--tr-reel-item-h, 100px);display:flex;align-items:center;',
            'justify-content:center;gap:10px;opacity:0.4;transition:opacity 0.15s;}',
            '.tr-reel-item-av{width:20%;aspect-ratio:1;border-radius:50%;flex:none;overflow:hidden;',
            'border:2px solid rgba(255,255,255,0.35);}',
            '.tr-reel-item-av .tr-ring-avatar,.tr-reel-item-av .tr-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:1.3em;}',
            '.tr-reel-item-name{font-size:1em;font-weight:800;color:#9d92b3;',
            'max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.tr-reel-item.tr-reel-highlight{opacity:1;}',
            '.tr-reel-item.tr-reel-highlight .tr-reel-item-av{width:26%;border-color:#ffd97a;',
            'box-shadow:0 0 16px rgba(255,217,122,0.6);}',
            '.tr-reel-item.tr-reel-highlight .tr-reel-item-name{font-size:1.25em;color:#fff;}',

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
            // ⚠️ [اعتماد التصميم الاحترافي الجديد] حلقة اللمبات القديمة
            // (#tr-wheel-bezel + .tr-bulb، 16 عنصر DOM ثابت) حُذفت بالكامل
            // — الإطار الذهبي المزدوج والحلقة المعدنية الغامقة و24 "قفل"
            // ذهبي مضيء صارت كلها تُرسَم مباشرة داخل الكانفس نفسه
            // (drawWheelCanvas)، بنفس منطق نموذج التصميم المعتمَد من
            // المستخدم بالحرف — أبسط وأدق (تدور فعلياً مع العجلة، بعكس
            // الحلقة الثابتة القديمة اللي ما كانت تدور إطلاقاً).
            // ⚠️ الحدود/التوهّج على عنصر الكانفس نفسه أُزيلا من CSS —
            // الإطار الذهبي + هالة التوهّج السماوية صارا جزءاً من الرسم
            // نفسه (canvas) بدل حدّ CSS خارجي، فما فيه ازدواجية.
            '#tr-wheel-canvas{position:absolute;inset:0;display:block;}',
            // ⚠️ مؤشّر SVG جديد (دمعة سماوية متدرّجة) بدل مثلث CSS
            // البسيط القديم — منقول بالحرف من نموذج التصميم المعتمَد.
            '#tr-wheel-pointer{position:absolute;top:-6px;left:50%;transform:translateX(-50%);',
            'width:36px;height:46px;z-index:6;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.55));}',

            /* ---- محور المنتصف = زر الدوران (تصميم معدني/ذهبي جديد،
             * منقول بالحرف من نموذج التصميم المعتمَد) ---- */
            '#tr-spin-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:7;',
            'width:96px;height:96px;border-radius:50%;border:3px solid #ffd97a;cursor:pointer;',
            'background:radial-gradient(circle at 38% 32%,#2a1a4a 0%,#150a29 55%,#0a0514 100%);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
            'box-shadow:0 0 0 3px rgba(128,212,255,0.35),0 0 22px rgba(128,212,255,0.55),',
            'inset 0 2px 6px rgba(255,255,255,0.25),inset 0 -8px 16px rgba(0,0,0,0.55);padding:0;',
            'transition:transform 0.12s ease;}',
            '#tr-spin-hub:not(:disabled):active{transform:translate(-50%,-50%) scale(0.94);}',
            '#tr-spin-hub img{width:38px;height:38px;object-fit:contain;border-radius:50%;',
            'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));}',
            '#tr-spin-hub span{font-size:0.78em;font-weight:900;color:#ffe9b8;',
            'text-shadow:0 1px 3px rgba(0,0,0,0.7);letter-spacing:0.5px;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '#tr-spin-hub:disabled{opacity:0.55;cursor:not-allowed;}',
            '#tr-spin-hub:not(:disabled):hover{box-shadow:0 0 0 3px rgba(128,212,255,0.5),',
            '0 0 30px rgba(128,212,255,0.8),inset 0 2px 6px rgba(255,255,255,0.25),',
            'inset 0 -8px 16px rgba(0,0,0,0.55);}',

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

            /* ======================================================================
             *  [نموذج معتمَد: شاشة الفائز الشفافة + فيديو] — يُلغي خلفية/حدّ/
             *  ظل #tr-modal-box الموحَّدة لحالة الفائز تحديداً (لا يؤثر على
             *  تبويب إعلان النتيجة ولا اختيار الهدية، نفس الصندوق مستخدَم
             *  للثلاثة بأدوار مختلفة). محتوى شاشة الفائز ينزل قليلاً عن
             *  أعلى الشاشة (padding-top إضافي)، ومربع فيديو 160×160 بحدود
             *  سماوية مضيئة نابضة يظهر فوق العنوان مباشرة.
             * ==================================================================== */
            '#tr-modal-box.tr-winner-transparent{background:none !important;border:none !important;',
            'box-shadow:none !important;padding-top:70px !important;}',
            '#tr-winner-video-badge{width:160px;height:160px;border-radius:22px;overflow:hidden;',
            'margin:0 auto 24px;border:3px solid var(--tr-accent);position:relative;background:#000;',
            'box-shadow:0 0 0 1px rgba(128,212,255,0.3),0 0 30px rgba(128,212,255,0.7),',
            '0 0 60px rgba(124,58,237,0.4);animation:tr-video-badge-pulse 2s ease-in-out infinite;}',
            '@keyframes tr-video-badge-pulse{0%,100%{box-shadow:0 0 0 1px rgba(128,212,255,0.3),',
            '0 0 30px rgba(128,212,255,0.7),0 0 60px rgba(124,58,237,0.4);}',
            '50%{box-shadow:0 0 0 1px rgba(128,212,255,0.5),0 0 40px rgba(128,212,255,0.9),',
            '0 0 75px rgba(124,58,237,0.6);}}',
            '#tr-winner-video-badge video{width:100%;height:100%;object-fit:cover;display:block;}',

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

            /* ======================================================================
             *  [نموذج معتمَد: "elimination-roulette-current-new"] تبويب إعلان
             *  النتيجة — منقول بالحرف من التصميم الحالي فعلياً بروليت
             *  الإقصاء (er-announce-*)، يستبدل التصميم القديم بالكامل
             *  (الجملة المتكدّسة مع الصور بمنتصف النص). جملة كاملة أعلى
             *  الصندوق تتضمّن اسمَي الطرفين حرفياً، وبطاقة شخص منفصلة لكل
             *  طرف (حلقة ملوَّنة + وسم دور كبسولة + اسم). الألوان الوظيفية
             *  (أخضر=فعل ناجح/من قام به، أحمر=المُقصى، تعتيم+تشبّع أقل
             *  لصورة المُقصى فقط) بلا أي تغيير عن المصدر — لغة ألوان
             *  خطر/أمان عامة، منفصلة عن هوية اللعبة (بنفس مبدأ كل تبويبات
             *  هذي اللعبة السابقة). الحجم والمقاسات (500×350، حلقة 112px،
             *  بطاقة 145px) مطابقة حرفياً بلا تغيير.
             * ==================================================================== */
            '#tr-modal-box.tr-announce-box{width:500px;max-width:92vw;height:350px;max-height:90vh;',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;',
            'gap:22px;padding:24px;box-sizing:border-box;}',
            '.tr-announce-title{font-size:1.15em;font-weight:900;color:#fff;text-align:center;',
            'line-height:1.4;}',
            '.tr-announce-eliminate .tr-announce-title{color:#ff8da3;}',
            '.tr-announce-revive .tr-announce-title{color:#7dffb0;}',
            '.tr-announce-row{display:flex;align-items:flex-start;justify-content:center;gap:50px;}',
            '.tr-announce-person-card{width:145px;display:flex;flex-direction:column;',
            'align-items:center;gap:8px;}',
            '.tr-announce-ring{width:112px;height:112px;border-radius:50%;padding:5px;box-sizing:border-box;}',
            '.tr-announce-ring .tr-ring-avatar,.tr-announce-ring .tr-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:2em;}',
            '.tr-announce-ring-green{background:#22c55e;}',
            '.tr-announce-ring-red{background:#ef4444;}',
            '@keyframes tr-announce-eliminate-glow{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.6);}',
            '100%{box-shadow:0 0 24px 6px rgba(239,68,68,0.35);}}',
            '.tr-announce-ring-red{animation:tr-announce-eliminate-glow 3s ease forwards;}',
            '.tr-announce-ring-desaturate .tr-ring-avatar,',
            '.tr-announce-ring-desaturate .tr-ring-avatar--fallback{',
            'filter:saturate(0.4);opacity:0.9;}',
            '.tr-announce-role-badge{padding:3px 12px;border-radius:999px;font-size:12px;',
            'font-weight:800;color:#fff;}',
            '.tr-announce-badge-green{background:#22c55e;}',
            '.tr-announce-badge-red{background:#ef4444;}',
            '.tr-announce-person-name{font-size:14px;font-weight:800;color:#fff;text-align:center;}',
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
            // ⚠️ [إصلاح خلل حقيقي مؤكَّد] z-index كان 99990 — أقل من
            // #agp-shell-overlay (99999، الملف المشترك). لو انفتح درج
            // الإعدادات (زر ⚙️) بينما نافذة اختيار مفتوحة أصلاً (دور
            // جارٍ، أو دوران تلقائي بالخلفية عبر "العب التلقائي")، درج
            // الإعدادات كان يغطّيها بصرياً بالكامل ويمنع أي تفاعل معها
            // فعلياً — تبدو "معطّلة" أو "ما تشتغل" لين تغلق درج الإعدادات
            // يدوياً فتظهر خلفه فجأة. رفعناه فوق 99999 حتى تبقى نافذة
            // الاختيار مرئية وقابلة للتفاعل دائماً بغضّ النظر عن حالة
            // درج الإعدادات.
            // ⚠️ [نموذج معتمَد: تبويبا الاختيار بدون صندوق] نفس فلسفة
            // settings-no-box/lobby-no-box بالضبط — الخلفية الغامقة/الشعار
            // المائي واللوح المحدود العرض (1150px) أُزيلا بالكامل، والمحتوى
            // يطفو مباشرة على خلفية الصفحة الكونية الموحَّدة (نفس التدرّج
            // المستخدَم بشاشتَي الإعدادات واللوبي).
            '#tr-select-overlay{position:fixed;inset:0;z-index:150000;display:none;align-items:flex-start;',
            'justify-content:center;overflow-y:auto;padding:0;',
            'background:',
            'radial-gradient(ellipse 900px 500px at 50% -8%,rgba(128,212,255,0.14),transparent 60%),',
            'radial-gradient(ellipse 700px 500px at 90% 100%,rgba(124,58,237,0.16),transparent 60%),',
            'linear-gradient(180deg,#0d0818 0%,#090614 45%,#05030a 100%);}',
            '#tr-select-box{width:min(1400px,96vw);max-width:96vw;height:auto;min-height:100vh;',
            'padding:34px 30px 30px;box-sizing:border-box;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'background:none;border:none;position:relative;overflow:visible;',
            'box-shadow:none;display:flex;flex-direction:column;}',
            // ⚠️ شعار "ألعاب أيمن" الشفاف (25%) — يظهر بمنتصف الشاشة خلف
            // كل المحتوى بتبويبي الإقصاء والإرجاع معاً (نفس #tr-select-box
            // المشترك بينهما، يميّزهما فقط كلاس tr-role-eliminate/revive).
            // ثابت بمنتصف الشاشة (position:fixed) بدل مرتبط بارتفاع
            // الصندوق نفسه (الصندوق الآن min-height:100vh فقط، بلا ارتفاع
            // ثابت) — يبقى مركزياً بصرياً بغضّ النظر عن طول المحتوى.
            '#tr-select-box::before{content:"";position:fixed;top:50%;left:50%;',
            'transform:translate(-50%,-50%);width:360px;height:360px;',
            'background:url(../../logo.png) no-repeat center;background-size:contain;',
            'opacity:0.25;pointer-events:none;z-index:0;}',
            '#tr-select-box > *{position:relative;z-index:1;}',
            '#tr-select-title{text-align:center;font-size:1.05em;color:#9d92b3;margin-bottom:16px;flex:none;}',
            '#tr-select-title b{color:var(--tr-accent);font-weight:900;}',
            '#tr-select-box.tr-role-eliminate #tr-select-title b{color:#ef4444;}',
            '#tr-select-box.tr-role-revive #tr-select-title b{color:#22c55e;}',
            /* ---- صف واحد: بطاقة صاحب الدور المكبَّرة + الأزرار (متمركزان معاً) ---- */
            '#tr-chooser-row{display:flex;align-items:center;justify-content:center;gap:26px;margin-bottom:20px;flex:none;}',
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
            '#tr-select-timer{text-align:center;font-weight:900;font-size:1.5em;color:#ffe066;margin-bottom:16px;',
            'flex:none;transition:color 0.2s;}',
            '#tr-select-timer.tr-timer-warning{color:#ff4d6d;animation:tr-pulse 1s infinite;}',
            /* ---- شبكة المرشّحين — ٥ بطاقات بكل صف ---- */
            '#tr-select-candidates-grid{flex:1;min-height:0;display:grid;',
            'grid-template-columns:repeat(5,1fr);gap:16px;align-content:flex-start;padding:4px 2px 30px;',
            'max-width:1250px;margin:0 auto;width:100%;}',
            // ⚠️ [إصلاح خلل حقيقي — لُقِط أثناء فحص الاستجابة على شاشات
            // صغيرة] بدون هذا الاستعلام، ٥ أعمدة ثابتة + صف صاحب الدور
            // بعرض غير مرن كانا يطفحان أفقياً بشدة على شاشات جوال ضيقة
            // (~375px) — بطاقات مقصوصة من الطرفين، وصف الأزرار/الصورة
            // يخرج خارج حدود الشاشة كلياً. نخفّض الأعمدة تدريجياً ونسمح
            // لصف صاحب الدور بالالتفاف على أكثر من سطر بدل الفيض الأفقي.
            '@media (max-width:900px){#tr-select-candidates-grid{grid-template-columns:repeat(3,1fr);',
            'gap:10px;}}',
            '@media (max-width:520px){#tr-select-candidates-grid{grid-template-columns:repeat(2,1fr);',
            'gap:8px;}',
            '#tr-chooser-row{flex-wrap:wrap;gap:12px;}',
            '#tr-select-actions{width:100%;max-width:280px;}',
            '.tr-tribe-only-card{height:56px;}',
            '.tr-tribe-only-name{font-size:1.1em;}',
            '.tr-select-cand-plate{width:100%;max-width:194px;}}',
            '.tr-select-cand-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;}',
            '.tr-select-cand-row{display:inline-flex;align-items:center;}',
            '.tr-select-cand-avatar{width:60px;height:60px;border-radius:50%;flex:none;position:relative;z-index:2;',
            'overflow:hidden;box-sizing:border-box;border:3px solid rgba(255,255,255,0.55);}',
            '.tr-select-cand-avatar .tr-ring-avatar,.tr-select-cand-avatar .tr-ring-avatar--fallback{width:100%;height:100%;font-size:1.1em;}',
            '.tr-select-cand-plate{position:relative;height:48px;width:194px;box-sizing:border-box;',
            'margin-inline-start:-13px;padding-inline-start:31px;padding-inline-end:10px;',
            'display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;color:#fff;',
            'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.28);',
            'border-radius:999px;overflow:hidden;z-index:1;}',
            '.tr-select-cand-name{font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;}',
            '.tr-select-cand-num{width:40px;height:40px;flex:none;color:#fff;',
            'border-radius:50%;font-size:1.2em;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;z-index:3;}',
            '.tr-select-cand-num.tr-role-eliminate{background:#ef4444;}',
            '.tr-select-cand-num.tr-role-revive{background:#22c55e;}',
            '.tr-select-cand-card.tr-cand-selected .tr-select-cand-plate{box-shadow:0 0 0 2px #ef4444;}',
            '.tr-select-cand-card.tr-cand-selected .tr-tribe-only-card{box-shadow:0 0 0 2px #ef4444,0 0 18px rgba(239,68,68,0.5);}',
            // ⚠️ [نموذج معتمَد: بطاقة قبيلة نظيفة] تبويب الإقصاء تحديداً —
            // بدون أي أفاتار/شخصية مخفية إطلاقاً، فقط اسم القبيلة + رقم
            // الاختيار داخل بطاقة واحدة مرتّبة (بدل نظام التراكب القديم
            // المصمَّم أصلاً لصورة حقيقية). صف أفقي واحد: رقم دائري
            // بنفسجي + اسم القبيلة بجانبه، كل بطاقة بعرضها الكامل داخل
            // عمود الشبكة (لا عرض ثابت يدوي، يتكيّف تلقائياً مع 5 أعمدة).
            '.tr-tribe-only-card{width:100%;height:64px;border-radius:14px;',
            'background:linear-gradient(180deg,rgba(60,31,102,0.45),rgba(10,5,18,0.65));',
            'border:1px solid rgba(255,255,255,0.16);',
            'display:flex;flex-direction:row;align-items:center;justify-content:space-between;',
            'padding:0 12px;box-sizing:border-box;transition:transform 0.15s,border-color 0.15s;}',
            '.tr-select-cand-card:hover .tr-tribe-only-card{transform:translateY(-3px);border-color:rgba(255,255,255,0.32);}',
            '.tr-tribe-only-num{width:48px;height:48px;border-radius:50%;flex:none;color:#000;',
            'font-size:1.5em;font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '.tr-tribe-only-num.tr-role-eliminate{background:var(--tr-accent2);}',
            '.tr-tribe-only-name{font-size:1.3em;font-weight:900;color:#fff;text-align:center;flex:1;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;',
            'text-shadow:0 1px 6px rgba(128,212,255,0.35);}',

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
            '.tr-trophy-card{position:relative;width:250px;height:300px;box-sizing:border-box;',
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

            /* ======================================================================
             *  [نموذج "settings-no-box" المعتمَد] شاشة الإعدادات الأولى فقط
             *  (قبل أي اتصال بالبث) — بدون أي صندوق/تبويب يحيط الحقول:
             *  الحقول موزَّعة مباشرة على الصفحة بعمودين (عمود ذهبي = خط
             *  فاصل تحت كل حقل بدل خلفية بطاقة)، عنوان كبير بتدرّج لوني،
             *  زر الاتصال عائم بالمنتصف. الإعدادات المعاد فتحها أثناء
             *  المباراة (زر ⚙️) تبقى بشكلها الأصلي (صندوق) بلا أي تغيير —
             *  محدَّدة بكلاس `.tr-settings-initial-box` فقط (يُضاف عبر
             *  enhanceSettingsScreen حصراً للشاشة الأولى الحقيقية).
             *  ⚠️ عدد الحقول الفعلي يتغيّر ديناميكياً (حقلا هدية الإنعاش
             *  مخفيان إلا لو "الإنعاش عن طريق الدعم" مفعَّل) — العمودان
             *  مبنيان بـCSS Multi-column (column-count:2) بدل CSS Grid
             *  عمداً: يتدفّق المحتوى تلقائياً ويعيد توازنه مع أي حقل
             *  يظهر/يختفي، بدون أي حساب `nth-of-type` هش قد ينكسر مع أول
             *  تغيير بعدد الحقول الظاهرة.
             * ==================================================================== */
            '#agp-shell-overlay:has(#agp-shell-box.tr-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(ellipse 900px 500px at 50% -8%,rgba(128,212,255,0.16),transparent 60%),',
            'radial-gradient(ellipse 700px 500px at 90% 100%,rgba(124,58,237,0.18),transparent 60%),',
            'linear-gradient(180deg,#0d0818 0%,#090614 45%,#05030a 100%) !important;}',
            '#agp-shell-box.tr-settings-initial-box{width:min(980px,94vw) !important;max-width:min(980px,94vw) !important;',
            'height:auto !important;max-height:none !important;overflow-y:visible !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:56px 24px 60px !important;box-sizing:border-box !important;',
            'column-count:2 !important;column-gap:60px !important;column-fill:auto !important;}',
            // العنوان — يخرج من تدفّق العمودين (column-span:all) بتدرّج
            // لوني سماوي→بنفسجي، مع خط فاصل قصير متوهّج تحته.
            '#agp-shell-box.tr-settings-initial-box h2{column-span:all !important;margin:0 0 42px !important;',
            'font-size:clamp(24px,4vw,38px) !important;font-weight:900 !important;text-align:center !important;',
            'background:linear-gradient(90deg,var(--tr-accent),#d0b3ff 55%,var(--tr-accent2)) !important;',
            '-webkit-background-clip:text !important;background-clip:text !important;',
            '-webkit-text-fill-color:transparent !important;position:relative;padding-bottom:20px;}',
            '#agp-shell-box.tr-settings-initial-box h2::after{content:"";position:absolute;bottom:0;',
            'left:50%;transform:translateX(-50%);width:64px;height:3px;border-radius:3px;',
            'background:linear-gradient(90deg,transparent,var(--tr-accent),transparent);}',
            // كل حقل (سواء .agp-shell-field الأساسية أو .agp-shell-row
            // العامة) يمتنع عن الانكسار بين عمود وآخر، وياخذ فاصل خطي
            // رفيع تحته بدل خلفية بطاقة — الحقول "تطفو" على الصفحة مباشرة.
            '#agp-shell-box.tr-settings-initial-box .agp-shell-field,',
            '#agp-shell-box.tr-settings-initial-box .agp-shell-row{break-inside:avoid !important;',
            'padding:20px 0 !important;border-bottom:1px solid rgba(255,255,255,0.08) !important;}',
            // حقلا اليوزرنيم/الكلمة المفتاحية — تسمية مصغّرة فوق، إدخال
            // كبير تحتها بخط سفلي بدل صندوق كامل (بدل الصف الأفقي المتزامن).
            '#agp-shell-box.tr-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;gap:10px !important;}',
            '#agp-shell-box.tr-settings-initial-box .agp-shell-field label{font-size:0.82em !important;',
            'color:#b7a9d6 !important;font-weight:700 !important;}',
            '#agp-shell-box.tr-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:transparent !important;',
            'border:none !important;border-bottom:2px solid transparent !important;border-radius:0 !important;',
            'padding:4px 0 !important;font-size:1.25em !important;font-weight:700 !important;',
            'text-align:right !important;transition:border-color 0.2s;}',
            '#agp-shell-box.tr-settings-initial-box .agp-shell-field input[type=text]:focus{',
            'border-bottom-color:var(--tr-accent) !important;outline:none !important;}',
            // أزرار القطاع (pill-choice/pill-group) — مفرَّغة/محدَّدة بدل
            // بيضاء صلدة، تتحوّل لتدرّج هوية اللعبة عند التفعيل.
            '#agp-shell-box.tr-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:1px solid rgba(255,255,255,0.16) !important;color:#a99cc4 !important;}',
            '#agp-shell-box.tr-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:linear-gradient(90deg,var(--tr-accent2),var(--tr-accent)) !important;',
            'color:#0a0612 !important;border-color:transparent !important;}',
            // زر الاتصال — يخرج من تدفّق العمودين، حجم طبيعي (مو 100%)
            // ويتمركز بالمنتصف عبر display:table+margin:auto (بديل مضبوط
            // لتوسيط عنصر بعرضه الطبيعي داخل حاوية multi-column).
            '#agp-shell-box.tr-settings-initial-box .agp-shell-btn-connect{column-span:all !important;',
            'display:table !important;width:auto !important;margin:34px auto 0 !important;',
            'padding:16px 64px !important;font-size:1.05em !important;letter-spacing:0.4px;',
            'box-shadow:0 10px 34px rgba(128,212,255,0.3),0 0 0 1px rgba(255,255,255,0.15) inset !important;}',
            '#agp-shell-box.tr-settings-initial-box .tr-back-to-platform-btn{column-span:all !important;}',
            '@media (max-width:720px){#agp-shell-box.tr-settings-initial-box{column-count:1 !important;}}',

            /* ======================================================================
             *  [نموذج "تبويب الاتصال فوق شاشة الإعدادات" المعتمَد] —
             *  عنصران منفصلان تماماً عن #agp-shell-overlay/#agp-shell-box
             *  (يُبنَيان مرة واحدة بـdocument.body مباشرة عبر enhanceConnectingScreen)،
             *  فوق شاشة الإعدادات المستردَّة بالكامل — سبينر أثناء
             *  الاتصال، تحذير أحمر + زر ✕ عند الفشل (زر الإغلاق يُخفي
             *  التبويب فقط، شاشة الإعدادات خلفه تبقى ظاهرة وتفاعلية).
             * ==================================================================== */
            '#tr-connect-dim{display:none;position:fixed;inset:0;z-index:160000;',
            'background:rgba(5,3,10,0.5);backdrop-filter:blur(2px);}',
            '#tr-connect-popup{display:none;position:fixed;top:50%;left:50%;',
            'transform:translate(-50%,-50%);z-index:160001;width:320px;max-width:88vw;',
            'padding:34px 26px 28px;border-radius:20px;background:rgba(20,12,34,0.9);',
            'backdrop-filter:blur(16px);border:1.5px solid var(--tr-accent);',
            'box-shadow:0 0 0 1px rgba(128,212,255,0.15),0 0 40px rgba(128,212,255,0.4),',
            '0 20px 60px rgba(0,0,0,0.5);text-align:center;color:#fff;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '#tr-connect-popup .tr-connect-spinner{width:46px;height:46px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(128,212,255,0.2);',
            'border-top-color:var(--tr-accent);animation:tr-connect-spin 0.9s linear infinite;}',
            '@keyframes tr-connect-spin{to{transform:rotate(360deg);}}',
            '#tr-connect-popup h3{font-size:17px;font-weight:900;color:#fff;margin-bottom:6px;}',
            '#tr-connect-popup p{font-size:13px;color:#9d92b3;}',
            '#tr-connect-popup.tr-connect-error{border-color:#ef4444;',
            'box-shadow:0 0 0 1px rgba(239,68,68,0.15),0 0 40px rgba(239,68,68,0.35),',
            '0 20px 60px rgba(0,0,0,0.5);}',
            '#tr-connect-popup.tr-connect-error h3{color:#ff8da3;}',
            '#tr-connect-popup .tr-connect-error-icon{font-size:40px;margin-bottom:10px;}',
            '#tr-connect-close-btn{position:absolute;top:12px;left:12px;width:28px;height:28px;',
            'border-radius:50%;background:rgba(255,255,255,0.1);border:none;color:#fff;',
            'font-size:13px;cursor:pointer;}',

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

            // ⚠️ [نموذج "lobby-no-box" المعتمَد] الشعار الشفاف بمنتصف
            // اللوبي حُذف — راجع تعليق enhanceLobbyWatermarkAndActions().

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
            // ⚠️ [نموذج "قالب الكلمة المفتاحية الجديد" المعتمَد] بطاقة
            // زجاجية بحدود سماوية متوهّجة + أيقونة مفتاح، تستبدل التدرّج
            // الجاهز من الملف المشترك بالكامل (!important يطغى فوقه).
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{background:rgba(128,212,255,0.1) !important;',
            'backdrop-filter:blur(6px);border:1.5px solid var(--tr-accent) !important;',
            'box-shadow:0 0 16px rgba(128,212,255,0.5) !important;color:#cdeeff !important;',
            'font-weight:900 !important;letter-spacing:0.5px;border-radius:999px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{content:"🔑 ";}',
            // ⚠️ [نموذج "قالب الكلمة المفتاحية الجديد" المعتمَد] عدد
            // اللاعبين رجع لتدفّقه الطبيعي بنفس صف الكلمة المفتاحية (بدل
            // الشارة العائمة المنفصلة أعلى الصندوق من التحديث السابق)،
            // بشكل متناسق مع القالب الجديد بدل التصميم الأسود القديم.
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:static !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{background:rgba(255,255,255,0.06) !important;',
            'border:1px solid rgba(255,255,255,0.2) !important;border-radius:999px !important;',
            'padding:6px 16px !important;font-weight:800 !important;font-size:0.95em !important;',
            'box-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge::before{content:"👥 ";}',

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
            '.tr-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',

            /* ======================================================================
             *  [نموذج "lobby-no-box" المعتمَد] شاشة اللوبي — بدون أي
             *  صندوق/تبويب يحيط المحتوى: العنوان مباشرة على الصفحة، شارة
             *  العدد عائمة أعلى اليسار، شبكة اللاعبين تطفو مباشرة، وشريط
             *  الأزرار السفلي عائم بلا خلفية — كل شي فوق خلفية الصفحة
             *  الكونية نفسها (نفس أسلوب settings-no-box تماماً). التخطيط
             *  الداخلي (flex-column، سكرول داخلي لشبكة اللاعبين فقط) من
             *  التحديث السابق يبقى بلا أي تغيير — فقط "چروم" الصندوق
             *  نفسه (خلفية/حدّ/ظل/عرض ثابت) هو المُزال هنا.
             * ==================================================================== */
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
            'align-items:flex-start !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(ellipse 900px 500px at 50% -8%,rgba(128,212,255,0.14),transparent 60%),',
            'radial-gradient(ellipse 700px 500px at 90% 100%,rgba(124,58,237,0.16),transparent 60%),',
            'linear-gradient(180deg,#0d0818 0%,#090614 45%,#05030a 100%) !important;}',
            '#agp-shell-box.agp-lobby-box{width:min(1180px,94vw) !important;max-width:min(1180px,94vw) !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:44px 10px 26px !important;box-sizing:border-box !important;}',
            // العنوان يكبر شوي بدون صندوق يحدّه بصرياً — نفس الألوان
            // ثنائية اللون بلا تغيير (enhanceLobbyHeading لم يتغيّر).
            '#agp-shell-box.agp-lobby-box h2{font-size:1.5em !important;margin-bottom:14px !important;}',

            /* ======================================================================
             *  [نموذج "درج الإعدادات الجانبي" المعتمَد] الإعدادات المعاد
             *  فتحها أثناء المباراة (زر ⚙️ بالهيدر) — تحويل #agp-shell-box
             *  (بحالة isReopened=true بالملف المشترك، مُميَّزة بوجود
             *  #agp-settings-close-btn) من صندوق مركزي لدرج ينفتح من
             *  الحافة اليمنى بارتفاع كامل الشاشة، بتبويبين (⚙️ الإعدادات
             *  / 👥 اللاعبون). حقول الإعدادات نفسها (fieldsHtml) تبقى من
             *  إنتاج الملف المشترك بدون أي تغيير على منطقها — فقط
             *  التخطيط/الشكل هنا. تبويب اللاعبين مبني بالكامل محلياً
             *  (renderReopenedPlayersTab) لأنه يحتاج بيانات _alive/
             *  _eliminated الخاصة باللعبة، غير متوفرة بالملف المشترك.
             * ==================================================================== */
            '#agp-shell-overlay:has(#agp-shell-box.tr-reopened-drawer){padding:0 !important;',
            'background:rgba(5,3,10,0.45) !important;}',
            // ⚠️ [تصحيح] موضعة مباشرة بـposition:fixed+top/right على
            // الصندوق نفسه، بدل الاعتماد على justify-content بالحاوية
            // الأب (#agp-shell-overlay) — في dir="rtl" فإن flex-end بصف
            // (row) عادي يعني الطرف الأيسر فعلياً (بداية/نهاية المحور
            // الرئيسي تتبع اتجاه الكتابة)، فكانت الدرج يظهر يسار الشاشة
            // بالغلط بدل يمينها رغم "flex-end" (خلل حقيقي انتُبه له
            // بالاختبار البصري الفعلي). fixed+right:0 يتجاوز هذا اللبس
            // كلياً بغضّ النظر عن اتجاه الصفحة.
            '#agp-shell-box.tr-reopened-drawer{position:fixed !important;top:0 !important;right:0 !important;',
            'left:auto !important;width:360px !important;max-width:88vw !important;',
            'height:100vh !important;max-height:100vh !important;margin:0 !important;',
            'background:rgba(15,9,26,0.96) !important;backdrop-filter:blur(12px);',
            'border:none !important;border-inline-start:1px solid rgba(128,212,255,0.3) !important;',
            'border-radius:0 !important;box-shadow:-12px 0 40px rgba(0,0,0,0.5) !important;',
            'padding:0 !important;box-sizing:border-box !important;display:flex !important;',
            'flex-direction:column !important;overflow:hidden !important;}',
            // ⚠️ [تصحيح] header/tabs/body/footer صارت عناصر DOM حقيقية
            // (تُبنى فعلياً بـenhanceReopenedDrawer عبر نقل العناصر
            // إليها، مو مجرد كلاسات CSS فوق عناصر متفرّقة بترتيب "order"
            // بدون غلاف فعلي — ذاك كان الخلل الجذري: الحقول كانت تفيض
            // خارج الصندوق لأنه ما فيه أي عنصر فعلي بـoverflow-y:auto
            // يحصرها). البنية الفعلية الآن: box > header + tabs + body
            // (overflow-y:auto، فيها الحقول + تبويب اللاعبين) + footer.
            '#agp-shell-box.tr-reopened-drawer .tr-drawer-header{display:flex;align-items:center;',
            'justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);',
            'flex:none;}',
            '#agp-shell-box.tr-reopened-drawer .tr-drawer-header h2{font-size:1em !important;',
            'font-weight:900;margin:0 !important;padding:0 !important;text-shadow:none !important;color:#fff;',
            'position:static !important;}',
            '#agp-shell-box.tr-reopened-drawer #agp-settings-close-btn{position:static !important;',
            'width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08) !important;',
            'color:#fff !important;font-size:0.9em !important;flex:none;display:flex !important;',
            'align-items:center;justify-content:center;}',
            '#agp-shell-box.tr-reopened-drawer .tr-drawer-tabs{display:flex;gap:6px;padding:10px 18px 0;flex:none;}',
            '.tr-drawer-tabs button{flex:1;padding:8px 0;border-radius:8px 8px 0 0;border:none;cursor:pointer;',
            'background:transparent;color:#8f83a8;font-family:inherit;font-weight:800;font-size:0.82em;',
            'border-bottom:2px solid transparent;}',
            '.tr-drawer-tabs button.tr-tab-active{color:#fff;border-bottom-color:var(--tr-accent);',
            'background:rgba(128,212,255,0.06);}',
            '#agp-shell-box.tr-reopened-drawer .tr-drawer-body{flex:1;min-height:0;overflow-y:auto;',
            'padding:14px 18px 18px;}',
            '#agp-shell-box.tr-reopened-drawer .tr-drawer-footer{flex:none;padding:12px 18px 16px;',
            'border-top:1px solid rgba(255,255,255,0.08);}',

            // ⚠️ حقول الإعدادات نفسها (منتَجة من الملف المشترك، لا تغيير
            // بمنطقها) — إعادة تنسيق بصري فقط لتصغيرها داخل عرض 360px،
            // صف واحد لكل حقل (تسمية+تحكّم بجانب بعض) بدل التخطيط الأصلي.
            '#agp-shell-box.tr-reopened-drawer .agp-shell-row{display:flex !important;',
            'align-items:center !important;justify-content:space-between !important;gap:10px;',
            'padding:12px 0 !important;border-bottom:1px solid rgba(255,255,255,0.07);margin:0 !important;}',
            '#agp-shell-box.tr-reopened-drawer .agp-shell-row-label{font-size:0.82em !important;',
            'color:#cdbfe8 !important;font-weight:700 !important;order:2;}',
            '#agp-shell-box.tr-reopened-drawer .agp-pill-group{order:1;display:flex;flex-wrap:wrap;',
            'gap:5px;justify-content:flex-end;}',
            '#agp-shell-box.tr-reopened-drawer .agp-pill-group button{padding:5px 10px !important;',
            'font-size:0.78em !important;}',
            // العداد — الرقم بالمنتصف حقل رقمي قابل للكتابة مباشرة أصلاً
            // (input[type=number] من الملف المشترك)، هنا فقط تصغير حجمه
            // ليناسب عرض الدرج.
            '#agp-shell-box.tr-reopened-drawer .agp-shell-counter-row{order:1;}',
            '#agp-shell-box.tr-reopened-drawer .agp-count-input{width:44px !important;font-size:0.82em !important;}',
            '#agp-shell-box.tr-reopened-drawer .agp-toggle-switch{order:1;}',

            // ⚠️ "قائمة اللاعبين" المُنتَجة من الملف المشترك (playerManagementHtml)
            // — نُخفي قائمتها الداخلية (.agp-settings-player-box) لأننا
            // نبني تبويب لاعبين خاصاً بنا (renderReopenedPlayersTab) يجمع
            // النشطين والمقصيين معاً، لكن نُبقي زر "➕ فتح دخول لاعبين
            // جدد" (بعد إعادة تسميته عبر JS) ظاهراً بآخر تبويب الإعدادات
            // بالضبط بمكانه بترتيب DOM الأصلي.
            '#agp-shell-box.tr-reopened-drawer .agp-settings-player-box{display:none !important;}',
            '#agp-shell-box.tr-reopened-drawer .agp-settings-player-row{display:block !important;}',
            '#agp-shell-box.tr-reopened-drawer #agp-settings-player-count{display:none !important;}',
            '#agp-shell-box.tr-reopened-drawer .agp-shell-field:has(#agp-settings-player-count) > label{display:none !important;}',
            '#agp-shell-box.tr-reopened-drawer #agp-reopen-registration-btn{width:100% !important;',
            'margin-top:6px !important;border:1px dashed rgba(128,212,255,0.5) !important;',
            'background:rgba(128,212,255,0.08) !important;color:#cdeeff !important;}',
            // تبويب اللاعبين يخفي كل حقول الإعدادات (كل .agp-shell-row +
            // حقل إدارة اللاعبين بالكامل بما فيه زر "فتح دخول") — يظهر
            // بدلها حاوية تبويب اللاعبين المخصَّصة (#tr-players-tab).
            '#agp-shell-box.tr-reopened-drawer.tr-tab-players .agp-shell-row,',
            '#agp-shell-box.tr-reopened-drawer.tr-tab-players .agp-shell-field:has(#agp-settings-player-count){',
            'display:none !important;}',
            '#agp-shell-box.tr-reopened-drawer:not(.tr-tab-players) #tr-players-tab{display:none !important;}',

            // ---- تبويب اللاعبين المخصَّص (بحث + فلتر + قائمة موحَّدة) ----
            '#tr-players-tab-search{width:100%;padding:8px 12px;border-radius:9px;',
            'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;',
            'font-family:inherit;font-size:0.8em;margin-bottom:10px;box-sizing:border-box;}',
            '#tr-players-tab-filter{display:flex;gap:5px;margin-bottom:10px;}',
            '#tr-players-tab-filter button{flex:1;padding:5px 2px;border-radius:7px;',
            'border:1px solid rgba(255,255,255,0.14);background:transparent;color:#a99cc4;',
            'font-family:inherit;font-weight:800;font-size:0.68em;cursor:pointer;}',
            '#tr-players-tab-filter button.tr-filter-active{background:rgba(128,212,255,0.14);',
            'border-color:var(--tr-accent);color:#cdeeff;}',
            '.tr-prow{display:flex;align-items:center;gap:8px;padding:7px 0;',
            'border-bottom:1px solid rgba(255,255,255,0.05);}',
            '.tr-prow.tr-prow-out{opacity:0.6;}',
            '.tr-prow .tr-prow-avatar{width:26px;height:26px;border-radius:50%;flex:none;overflow:hidden;}',
            '.tr-prow.tr-prow-out .tr-prow-avatar{filter:grayscale(1);}',
            '.tr-prow .tr-prow-avatar .tr-ring-avatar,.tr-prow .tr-prow-avatar .tr-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:0.7em;}',
            '.tr-prow .tr-prow-name{flex:1;font-size:0.8em;font-weight:700;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',
            '.tr-prow .tr-prow-status{font-size:0.6em;padding:2px 8px;border-radius:999px;font-weight:800;flex:none;}',
            '.tr-prow .tr-prow-status.tr-status-live{background:rgba(34,197,94,0.15);color:#4ade80;',
            'border:1px solid rgba(74,222,128,0.4);}',
            '.tr-prow .tr-prow-status.tr-status-out{background:rgba(239,68,68,0.15);color:#f87171;',
            'border:1px solid rgba(248,113,113,0.4);}',
            '.tr-prow .tr-prow-action{width:22px;height:22px;border-radius:50%;border:none;',
            'color:#fff;font-weight:900;font-size:0.65em;cursor:pointer;flex:none;}',
            '.tr-prow .tr-prow-action.tr-action-eliminate{background:#ef4444;}',
            '.tr-prow .tr-prow-action.tr-action-revive{background:linear-gradient(135deg,#22c55e,#16a34a);}',

            // ---- زر الرجوع الصغير (سهم+نص، بلا خلفية/حدود) — يظهر أسفل
            // الدرج بشكل ثابت (tr-drawer-footer)، بلا علاقة بتبويب اللاعبين.
            '.tr-drawer-back-link{width:100%;padding:4px;border:none;background:transparent;',
            'color:#8f83a8;font-family:inherit;font-weight:700;font-size:0.72em;cursor:pointer;',
            'display:flex;align-items:center;justify-content:center;gap:5px;}',
            '.tr-drawer-back-link:hover{color:#cdbfe8;}',
            '.tr-drawer-back-hint{text-align:center;font-size:0.62em;color:#4a4260;margin-top:2px;}',

            /* ======================================================================
             *  [نموذج "لوحة استقبال لاعبين جدد" المعتمَد] شاشة "إضافة لوبي
             *  جديد" (تظهر بعد الضغط على زر "فتح دخول لاعبين جدد"، مُنتَجة
             *  بالكامل من handleReopenRegistrationClick بالملف المشترك) —
             *  تصميم مختلف عمداً عن باقي شاشات اللعبة: لوحة عائمة شفافة/
             *  زجاجية بحدود مدببة (زوايا مقصوصة) بلون هوية اللعبة السماوي،
             *  فوق العجلة مباشرة (بدل استبدال الدرج بالكامل بصندوق داكن
             *  عادي). نكتشف هذي الحالة بوجود #agp-mini-lobby-list (فريد
             *  لهذي الشاشة تحديداً) — enhanceMiniLobbyPanel() يضيف الكلاس
             *  المميِّز tr-mini-lobby-active.
             * ==================================================================== */
            '#agp-shell-overlay:has(#agp-shell-box.tr-mini-lobby-active){padding:0 !important;',
            'align-items:center !important;justify-content:center !important;',
            'background:rgba(5,3,10,0.55) !important;backdrop-filter:blur(3px);}',
            '#agp-shell-box.tr-mini-lobby-active{width:420px !important;max-width:92vw !important;',
            'height:auto !important;max-height:88vh !important;margin:0 !important;',
            'padding:26px 26px 22px !important;box-sizing:border-box !important;',
            'background:rgba(20,12,34,0.55) !important;backdrop-filter:blur(14px);',
            'border:1.5px solid #80d4ff !important;border-radius:0 !important;',
            'clip-path:polygon(20px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%,0 20px);',
            'box-shadow:0 0 0 1px rgba(128,212,255,0.15),0 0 40px rgba(128,212,255,0.35),',
            '0 20px 60px rgba(0,0,0,0.5) !important;position:relative;overflow-y:auto;}',
            '#agp-shell-box.tr-mini-lobby-active::before,#agp-shell-box.tr-mini-lobby-active::after{',
            'content:"";position:absolute;width:26px;height:1.5px;background:#80d4ff;',
            'box-shadow:0 0 8px rgba(128,212,255,0.9);}',
            '#agp-shell-box.tr-mini-lobby-active::before{top:0;left:0;transform:rotate(45deg) translate(-7px,-7px);}',
            '#agp-shell-box.tr-mini-lobby-active::after{bottom:0;right:0;transform:rotate(45deg) translate(7px,7px);}',
            '#agp-shell-box.tr-mini-lobby-active h2{text-align:center !important;font-size:1.05em !important;',
            'margin-bottom:6px !important;}',
            '#agp-shell-box.tr-mini-lobby-active .agp-join-hint{text-align:center;}',
            '#agp-shell-box.tr-mini-lobby-active #agp-mini-lobby-list{display:grid !important;',
            'grid-template-columns:1fr 1fr !important;gap:8px !important;max-height:130px;overflow-y:auto;',
            'margin:14px 0 !important;list-style:none;padding:0;}',
            '#agp-shell-box.tr-mini-lobby-active #agp-mini-lobby-list li{background:rgba(255,255,255,0.06);',
            'border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:6px 8px;position:relative;}',
            '#agp-shell-box.tr-mini-lobby-active .tr-mini-remove-btn{position:absolute;top:-5px;left:-5px;',
            'width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;border:2px solid #150a29;',
            'font-weight:900;font-size:10px;line-height:14px;text-align:center;cursor:pointer;z-index:2;}',
            '#agp-shell-box.tr-mini-lobby-active .agp-shell-btn-connect{',
            'background:linear-gradient(90deg,#7c3aed,#80d4ff) !important;color:#0a0612 !important;}',
            // "بانتظار انضمام" — مؤشّر نابض يُضاف قبل قائمة اللاعبين مباشرة.
            '.tr-mini-live-dot{display:flex;align-items:center;justify-content:center;gap:6px;',
            'margin-top:8px;font-size:0.75em;color:#80d4ff;font-weight:800;}',
            '.tr-mini-live-dot .dot{width:8px;height:8px;border-radius:50%;background:#80d4ff;',
            'box-shadow:0 0 8px #80d4ff;animation:tr-mini-pulse 1.2s ease-in-out infinite;}',
            '@keyframes tr-mini-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(0.7);}}',
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
            '<div id="tr-display-toggle-row">' +
            '<button type="button" id="tr-mode-wheel-btn" class="tr-mode-active">🎡 عجلة دوارة</button>' +
            '<button type="button" id="tr-mode-reel-btn">🎰 سكرول</button>' +
            '</div>' +
            '<div id="tr-wheel-wrap">' +
            '<canvas id="tr-wheel-canvas"></canvas>' +
            // ⚠️ [اعتماد التصميم الاحترافي الجديد] مؤشّر SVG (دمعة سماوية
            // متدرّجة) بدل مثلث CSS البسيط القديم — منقول بالحرف من نموذج
            // التصميم المعتمَد من المستخدم.
            '<svg id="tr-wheel-pointer" viewBox="0 0 46 58">' +
            '<defs><linearGradient id="tr-ptr-grad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#c9f3ff"/>' +
            '<stop offset="55%" stop-color="#80d4ff"/>' +
            '<stop offset="100%" stop-color="#3f9fd6"/>' +
            '</linearGradient></defs>' +
            '<path d="M23 58 C 12 40, 2 30, 2 17 A21 21 0 0 1 44 17 C 44 30, 34 40, 23 58 Z" ' +
            'fill="url(#tr-ptr-grad)" stroke="#e8fbff" stroke-width="1.5"/>' +
            '<circle cx="23" cy="18" r="7" fill="#0a0612" opacity="0.85"/>' +
            '</svg>' +
            '<button id="tr-spin-hub" title="دوّر العجلة"><img src="../../logo.png" alt="ألعاب أيمن"><span>دور</span></button>' +
            '</div>' +
            // ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] بكرة سكرول رأسية —
            // بديل شكلي بحت (نفس منطق اختيار الفائز بالضبط، راجع
            // handleSpinClick) بشكل شريط أفقي/رأسي بدل الدائرة الدوّارة.
            // مخفية افتراضياً (تبدأ العجلة نشطة)، تُبنى محتوياتها فعلياً
            // عبر renderReel() فقط أول ما يتفعّل وضع السكرول.
            '<div id="tr-reel-wrap" style="display:none">' +
            '<div class="tr-reel-marker tr-reel-marker-top"></div>' +
            '<div class="tr-reel-marker tr-reel-marker-bottom"></div>' +
            '<div id="tr-reel-list"></div>' +
            '</div>' +
            '<div id="tr-wheel-zoom-row">' +
            '<span>🔍−</span>' +
            '<input type="range" id="tr-wheel-zoom-slider" min="' + WHEEL_SIZE_MIN + '" max="' + WHEEL_SIZE_MAX + '" step="10" value="' + _wheelSizePx + '" title="تكبير/تصغير العجلة">' +
            '<span>🔍+</span>' +
            '</div>' +
            '<div id="tr-stage-btn-row">' +
            '<button id="tr-shuffle-btn" type="button">🔀 إعادة ترتيب عشوائية</button>' +
            '<button id="tr-autoplay-btn" type="button">▶️ العب التلقائي</button>' +
            '</div>';

        applyWheelSize(_wheelSizePx);
        drawWheelCanvas();
        el('tr-spin-hub').onclick = handleSpinClick;
        el('tr-shuffle-btn').onclick = handleShuffleClick;
        el('tr-autoplay-btn').onclick = handleAutoPlayButtonClick;
        updateAutoPlayButtonLabel();
        el('tr-mode-wheel-btn').onclick = function () { setDisplayMode('wheel'); };
        el('tr-mode-reel-btn').onclick = function () { setDisplayMode('reel'); };
        el('tr-wheel-zoom-slider').oninput = function () {
            handleWheelZoomChange(parseInt(this.value, 10));
        };
    }

    /**
     * ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] يبدّل شكل الاختيار المعروض
     * (عجلة دوّارة أو بكرة سكرول رأسية) — الاثنان يستخدمان نفس منطق
     * اختيار الفائز بالضبط (handleSpinClick)، فرق شكلي بصري بحت. لا يُسمَح
     * بالتبديل أثناء دوران فعلي (_wheelSpinning) تفادياً لقطع أنيميشن نصفها.
     */
    function setDisplayMode(mode) {
        if (_wheelSpinning) return;
        if (mode === _displayMode) return;
        _displayMode = mode;
        var wheelBtn = el('tr-mode-wheel-btn');
        var reelBtn = el('tr-mode-reel-btn');
        var wheelWrap = el('tr-wheel-wrap');
        var reelWrap = el('tr-reel-wrap');
        var zoomRow = el('tr-wheel-zoom-row');
        if (wheelBtn) wheelBtn.classList.toggle('tr-mode-active', mode === 'wheel');
        if (reelBtn) reelBtn.classList.toggle('tr-mode-active', mode === 'reel');
        if (wheelWrap) wheelWrap.style.display = mode === 'wheel' ? '' : 'none';
        if (reelWrap) reelWrap.style.display = mode === 'reel' ? '' : 'none';
        // ⚠️ موشر التكبير خاص بشكل العجلة الدائرية فقط (نصف قطر/زوايا) —
        // البكرة تتحجّم تلقائياً بنفس منطق التجاوب الجديد (applyReelSize)
        // بدون تحكّم يدوي منفصل، فما فيه داعٍ له بوضع السكرول.
        if (zoomRow) zoomRow.style.display = mode === 'wheel' ? '' : 'none';
        if (mode === 'reel') {
            applyReelSize();
            renderReel();
        }
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

    /**
     * ⚠️ [إصلاح خلل حقيقي — لاحظه المستخدم فعلياً عبر صورة آيباد] الحجم
     * الآمن (viewportSafeMax داخل applyWheelSize) كان يُحسَب مرة وحدة بس
     * وقت التحميل الأول أو تحريك موشر التكبير يدوياً — بدون أي مستمع
     * لحدث resize، فلو كبّر/صغّر المستخدم نافذة المتصفح فعلياً (أو صار
     * تبديل حجم الشاشة تلقائياً بالآيباد عبر تدوير الجهاز أو تغيير وضع
     * تقسيم الشاشة)، العجلة تفضل بنفس القياس القديم حتى لو صار أكبر أو
     * أصغر من المساحة المتاحة الفعلية — تطلع طافحة أو مقصوصة. الحل:
     * مستمع resize (بتأخير debounce 150ms تفادياً لإعادة رسم الكانفس
     * عشرات المرات أثناء السحب المستمر لحواف النافذة) يعيد استدعاء نفس
     * applyWheelSize/applyReelSize بنفس _wheelSizePx الحالي — يعيد حساب
     * viewportSafeMax ضد أبعاد النافذة الجديدة تلقائياً.
     */
    var _resizeDebounceTimer = null;
    function handleWindowResize() {
        if (_resizeDebounceTimer) window.clearTimeout(_resizeDebounceTimer);
        _resizeDebounceTimer = window.setTimeout(function () {
            _resizeDebounceTimer = null;
            if (el('tr-wheel-wrap')) applyWheelSize(_wheelSizePx);
            if (el('tr-reel-wrap') && _displayMode === 'reel') applyReelSize();
        }, 150);
    }
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleWindowResize);

    /**
     * ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] نفس فلسفة applyWheelSize
     * بالضبط (حدّ آمن 88vw) — البكرة تتحجّم تلقائياً بنفس _wheelSizePx
     * (موشر التكبير اليدوي مخفي بوضع السكرول، لكن القيمة المحفوظة تبقى
     * الأساس المشترك بين الشكلين). العرض أضيق من الارتفاع عمداً (بكرة
     * رأسية، مو دائرة).
     */
    function applyReelSize() {
        var wrap = el('tr-reel-wrap');
        if (!wrap) return;
        var viewportSafeMax = Math.floor(window.innerWidth * 0.88);
        var applied = Math.max(WHEEL_SIZE_MIN, Math.min(_wheelSizePx, viewportSafeMax));
        wrap.style.width = Math.round(applied * 0.78) + 'px';
        wrap.style.height = applied + 'px';
        var itemH = applied / 3;
        wrap.style.setProperty('--tr-reel-item-h', itemH + 'px');
        if (_displayMode === 'reel') renderReel();
    }

    function handleWheelZoomChange(px) {
        if (isNaN(px)) return;
        _wheelSizePx = Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, px));
        applyWheelSize(_wheelSizePx); // يستدعي drawWheelCanvas() داخلياً أصلاً
    }

    /* ======================================================================
     *  3ب) رسم العجلة على <canvas> — منقول بالحرف من نموذج التصميم
     *      الاحترافي المعتمَد من المستخدم (عجلة كازينو ثنائية اللون
     *      بتدرّجات + إطار ذهبي مزدوج + حلقة معدنية غامقة + "أقفال"
     *      ذهبية مضيئة حول المحيط + هالة توهّج سماوية + مؤشّر SVG منفصل).
     *      يستبدل النسخة المسطّحة القديمة (WHEEL_PALETTE بدون تدرّجات،
     *      حلقة لمبات DOM ثابتة) بالكامل. نظام الزوايا نفسه بدون تغيير
     *      (بالراديان، -π/2 = محاذاة القطعة رقم 0 تحت المؤشر عند
     *      _wheelRotation=0)، فمنطق الدوران بـhandleSpinClick لم يحتَج
     *      أي تعديل.
     */
    var TR_SEG_COLORS = [
        { a: '#3a1f66', b: '#1a0d33' },  // بنفسجي غامق متدرّج
        { a: '#0e0a17', b: '#050308' }   // شبه أسود متدرّج
    ];
    var TR_RIM_GOLD = '#ffd97a';
    var TR_RIM_CYAN = '#80d4ff';
    var TR_SEP_COLOR = 'rgba(255,217,122,0.55)';

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
        var outerR = canvas.width / 2 - 6 * dpr;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var n = _alive.length;
        if (!n) {
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
            ctx.fillStyle = '#111';
            ctx.fill();
            return;
        }

        // ---- ظل عام أسفل العجلة (إحساس بالعمق) ----
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy + 6 * dpr, outerR, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.filter = 'blur(10px)';
        ctx.fill();
        ctx.restore();

        // ---- هالة توهّج سماوية خارجية (خلف القطع) ----
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + 4 * dpr, 0, 2 * Math.PI);
        ctx.strokeStyle = TR_RIM_CYAN;
        ctx.lineWidth = 10 * dpr;
        ctx.globalAlpha = 0.35;
        ctx.filter = 'blur(6px)';
        ctx.stroke();
        ctx.restore();

        var segR = outerR - 10 * dpr; // نصف قطر القطع نفسها (داخل الإطار الذهبي)
        var anglePer = (2 * Math.PI) / n;
        // ⚠️ حجم الخط يتقلص تلقائياً كلما زاد عدد اللاعبين حتى تبقى
        // الأسماء مقروءة — نفس منطق اللعبة القديمة بالضبط.
        var fontSize = Math.max(11, Math.min(20, 280 / n)) * dpr;
        var maxChars = n <= 8 ? 14 : 9;
        var twoPi = 2 * Math.PI;

        for (var i = 0; i < n; i++) {
            // ⚠️ -π/2 ثابتة تحاذي القطعة رقم 0 تحت المؤشر (أعلى العجلة)
            // عند _wheelRotation=0 — نفس نظام الزوايا الأصلي بدون تغيير.
            var startAng = _wheelRotation + i * anglePer - Math.PI / 2;
            var endAng = startAng + anglePer;
            var mid = startAng + anglePer / 2;
            var pair = TR_SEG_COLORS[i % TR_SEG_COLORS.length];

            var grad = ctx.createRadialGradient(cx, cy, segR * 0.15, cx, cy, segR);
            grad.addColorStop(0, pair.a);
            grad.addColorStop(1, pair.b);

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, segR, startAng, endAng);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // لمعة داخلية خفيفة قرب المركز (إحساس معدني/زجاجي)
            ctx.save();
            ctx.clip();
            var shine = ctx.createRadialGradient(cx, cy, 0, cx, cy, segR * 0.55);
            shine.addColorStop(0, 'rgba(255,255,255,0.10)');
            shine.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shine;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();

            // فاصل ذهبي رفيع بين كل قطعة والتي تليها
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + segR * Math.cos(startAng), cy + segR * Math.sin(startAng));
            ctx.strokeStyle = TR_SEP_COLOR;
            ctx.lineWidth = 1.6 * dpr;
            ctx.stroke();

            // ---- اسم اللاعب — مع إصلاح النصوص المقلوبة بالنصف الأيسر
            // (تأثير معروف بعجلات canvas الدوّارة): نلف النص 180° إضافية
            // ونعكس نقطة الإرساء للقطع اللي زاويتها بين 90°-270°، فيبقى
            // النص مستقيماً ومقروءاً بشكل صحيح بكل مكان حول العجلة. ----
            var normMid = ((mid % twoPi) + twoPi) % twoPi;
            var flip = normMid > Math.PI / 2 && normMid < (3 * Math.PI) / 2;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(mid + (flip ? Math.PI : 0));
            ctx.textAlign = flip ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#f3ecff';
            ctx.font = '800 ' + fontSize.toFixed(1) + 'px Zain,Cairo,sans-serif';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 4 * dpr;

            var label = playerLabel(_alive[i]);
            if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…';
            var textX = flip ? -(segR - 20 * dpr) : (segR - 20 * dpr);
            ctx.fillText(label, textX, 0);
            ctx.restore();
        }

        // ---- إطار ذهبي مزدوج (bezel) حول محيط القطع ----
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, segR + 5 * dpr, 0, 2 * Math.PI);
        ctx.lineWidth = 5 * dpr;
        var bezelGrad = ctx.createLinearGradient(cx, cy - outerR, cx, cy + outerR);
        bezelGrad.addColorStop(0, '#fff3d0');
        bezelGrad.addColorStop(0.5, TR_RIM_GOLD);
        bezelGrad.addColorStop(1, '#9a6a1e');
        ctx.strokeStyle = bezelGrad;
        ctx.stroke();
        ctx.restore();

        // ---- حلقة معدنية خارجية غامقة (جسم العجلة الفعلي) ----
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
        ctx.arc(cx, cy, segR + 7 * dpr, 0, 2 * Math.PI, true);
        var ringGrad = ctx.createLinearGradient(cx, cy - outerR, cx, cy + outerR);
        ringGrad.addColorStop(0, '#241238');
        ringGrad.addColorStop(0.5, '#150a22');
        ringGrad.addColorStop(1, '#0a0512');
        ctx.fillStyle = ringGrad;
        ctx.fill('evenodd');
        ctx.restore();

        // ---- "أقفال" زخرفية ذهبية مضيئة حول الحلقة الخارجية (بديل
        // احترافي لحلقة اللمبات DOM القديمة — تدور فعلياً مع العجلة) ----
        var studCount = 24;
        var studR = (outerR + segR + 7 * dpr) / 2;
        for (var s = 0; s < studCount; s++) {
            var a = (twoPi / studCount) * s + _wheelRotation * 0.15;
            var sx = cx + studR * Math.cos(a);
            var sy = cy + studR * Math.sin(a);
            ctx.beginPath();
            ctx.arc(sx, sy, 2.6 * dpr, 0, twoPi);
            var studGrad = ctx.createRadialGradient(sx - 1, sy - 1, 0, sx, sy, 3 * dpr);
            studGrad.addColorStop(0, '#fff9e6');
            studGrad.addColorStop(1, TR_RIM_GOLD);
            ctx.fillStyle = studGrad;
            ctx.shadowColor = 'rgba(255,217,122,0.9)';
            ctx.shadowBlur = 5 * dpr;
            ctx.fill();
        }

        // ---- إطار ذهبي خارجي رفيع نهائي ----
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, outerR - 1 * dpr, 0, 2 * Math.PI);
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = TR_RIM_GOLD;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.restore();
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
        // ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] نفس التصفير ينطبق على
        // البكرة أيضاً — بغضّ النظر عن أيهما الظاهر حالياً، حتى تبقى
        // الاثنتان متزامنتين ولا تفاجئ المستخدم بموضع غريب لو بدّل الشكل
        // وسط المباراة.
        _reelOffset = 0;
        if (_displayMode === 'reel') renderReel();
    }

    function realignWheelAfterRosterChange() {
        // ⚠️ رسمة واحدة تكفي هنا (بعكس renderWheelSlices+renderWheelLabels
        // المنفصلتين بنسخة CSS القديمة) — drawWheelCanvas() ترسم القطع
        // والأسماء معاً بنفس المرور. _wheelRotation يُصفَّر أولاً حتى
        // تُرسَم القطعة رقم 0 تحت المؤشر مباشرة (نفس منطق التصفير القديم).
        _wheelRotation = 0;
        drawWheelCanvas();
        _reelOffset = 0;
        if (_displayMode === 'reel') renderReel();
    }

    /**
     * ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] يبني شريط البكرة — قائمة
     * _alive مكرَّرة REEL_REPEATS مرة (مسافة سكرول كافية بصرياً). يُعاد
     * بناؤها بالكامل مع أي تغيير بالتشكيلة (نفس مناسبات realignWheelAfterRosterChange)
     * أو أول تفعيل لوضع السكرول.
     */
    function renderReel() {
        var list = el('tr-reel-list');
        if (!list) return;
        var n = _alive.length;
        if (!n) { list.innerHTML = ''; return; }
        var html = '';
        for (var r = 0; r < REEL_REPEATS; r++) {
            for (var i = 0; i < n; i++) {
                var p = _alive[i];
                html += '<div class="tr-reel-item">' +
                    '<div class="tr-reel-item-av">' + ringAvatarHtml(p) + '</div>' +
                    '<span class="tr-reel-item-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '</div>';
            }
        }
        list.innerHTML = html;
        list.style.transform = 'translateY(' + _reelOffset + 'px)';
        updateReelHighlight();
    }

    function updateReelHighlight() {
        var wrap = el('tr-reel-wrap');
        var list = el('tr-reel-list');
        if (!wrap || !list) return;
        var itemH = parseFloat(getComputedStyle(wrap).getPropertyValue('--tr-reel-item-h')) || 100;
        var centerY = itemH * 1.5; // منتصف الحاوية (3 صفوف مرئية، بين العلامتين)
        var items = list.children;
        for (var i = 0; i < items.length; i++) {
            var itemCenter = i * itemH + itemH / 2 + _reelOffset;
            items[i].classList.toggle('tr-reel-highlight', Math.abs(itemCenter - centerY) < itemH / 2);
        }
    }

    /**
     * ⚠️ [نموذج "العب التلقائي بجانب إعادة الترتيب" المعتمَد] زر جديد
     * بالشاشة الرئيسية (بجانب "🔀 إعادة ترتيب عشوائية") يتحكّم بنفس
     * _autoPlayActive المُستخدَم أصلاً من زر الدرج الجانبي (handleAutoPlayToggle
     * بدون تغيير) — الزرّان يبقيان متزامنين دائماً عبر updateAutoPlayButtonLabel().
     */
    function handleAutoPlayButtonClick() {
        handleAutoPlayToggle(!_autoPlayActive);
        updateAutoPlayButtonLabel();
    }

    function updateAutoPlayButtonLabel() {
        var btn = el('tr-autoplay-btn');
        if (!btn) return;
        btn.textContent = _autoPlayActive ? '⏸️ إيقاف التلقائي' : '▶️ العب التلقائي';
        btn.classList.toggle('tr-autoplay-active', _autoPlayActive);
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

        // ⚠️ [إصلاح خلل حقيقي — لاحظه المستخدم فعلياً] بدون هذا الاستثناء،
        // الاختيار عشوائي بحت (Math.random) بلا أي ذاكرة — مع عدد لاعبين
        // قليل (خصوصاً قرب نهاية المباراة، لاعبان-ثلاثة)، هذا يعني إحصائياً
        // أن نفس اللاعب يقدر يتكرر 3، 4، 5 مرات متتالية بسهولة، ويحس وكأن
        // العجلة "عالقة" أو معطوبة. الحل: لو نفس اللاعب فاز بآخر دورتين
        // متتاليتين فعلاً (_repeatStreak >= 2)، يُستبعَد من قائمة هذي
        // الدورة فقط (لو فيه لاعب ثاني متاح) — يضمن حداً أقصى دورتين
        // متتاليتين بالضبط، **بدون** إلغاء إمكانية الوصول لدورتين متتاليتين
        // أصلاً (هذا بالذات هو الشرط اللي يفتح نافذة "انعاش صديق" — راجع
        // handleWheelLanded أدناه، fon لازم يبقى ممكناً).
        var spinPool = _alive;
        if (_repeatStreak >= 2 && _lastWheelWinnerId !== null && _alive.length > 1) {
            var filteredPool = _alive.filter(function (p) { return p.id !== _lastWheelWinnerId; });
            if (filteredPool.length > 0) spinPool = filteredPool;
        }
        var winner = spinPool[Math.floor(Math.random() * spinPool.length)];

        function onSpinDone() {
            _wheelSpinning = false;
            if (spinBtn) spinBtn.disabled = false;
            handleWheelLanded(winner);
        }

        // ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] نفس "winner" المُختار
        // أعلاه (منطق واحد موحَّد) يُمرَّر لأي من الأنيميشنين — فرق شكلي
        // بصري بحت بين الاثنين، لا علاقة له بمنطق اللعب نفسه.
        if (_displayMode === 'reel') {
            spinReelTo(winner, onSpinDone);
        } else {
            spinWheelTo(winner, onSpinDone);
        }
    }

    /**
     * ⚠️ منطق الدوران الأصلي (كان مدموجاً داخل handleSpinClick قبل فصل
     * شكلَي العرض) — بدون أي تغيير على حساباته.
     */
    function spinWheelTo(winner, onDone) {
        var winnerIndex = _alive.indexOf(winner); // فهرس حقيقي داخل _alive الكامل — لازم لحساب زاوية القطعة الصحيحة بالرسم
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
                onDone();
            } else {
                window.requestAnimationFrame(frame);
            }
        }
        window.requestAnimationFrame(frame);
    }

    /**
     * ⚠️ [نموذج "تبديل عجلة/سكرول" المعتمَد] أنيميشن البكرة — نفس مدة
     * ونفس تسارع/تباطؤ (easeOutCubic، 3.3 ثانية) مطابق لأنيميشن العجلة
     * بالضبط، لإحساس متّسق بغضّ النظر عن الشكل المفعَّل. نحرّك
     * translateY على #tr-reel-list من موضعها الحالي (_reelOffset) لموضع
     * جديد يحاذي نسخة "آمنة" (منتصف التكرارات تقريباً) من الفائز مقابل
     * الخط المركزي بالضبط.
     */
    function spinReelTo(winner, onDone) {
        var itemH = parseFloat(getComputedStyle(el('tr-reel-wrap')).getPropertyValue('--tr-reel-item-h')) || 100;
        var n = _alive.length;
        var winnerIndex = _alive.indexOf(winner);
        // ⚠️ نستهدف نسخة قريبة من منتصف التكرارات (REEL_REPEATS/2) —
        // تضمن مسافة سكرول كافية بصرياً بغضّ النظر عن الموضع الحالي.
        var targetRepeat = Math.floor(REEL_REPEATS / 2);
        var targetItemIndex = targetRepeat * n + winnerIndex;
        // مركز العنصر الهدف يحاذي الخط المركزي (منتصف الحاوية، بين
        // العلامتين) — الحاوية 3 صفوف مرئية، فالمنتصف = itemH*1.5.
        var targetOffset = -(targetItemIndex * itemH + itemH / 2) + itemH * 1.5;

        var startOffset = _reelOffset;
        var totalDelta = targetOffset - startOffset;
        // ⚠️ لو الحركة قصيرة جداً بالصدفة (نادر)، نضيف دورة كاملة إضافية
        // كاملة حتى تحس بحركة سكرول حقيقية دائماً (مطابقة لمبدأ "fullSpins"
        // بالعجلة).
        var listHeight = REEL_REPEATS * n * itemH;
        if (Math.abs(totalDelta) < listHeight * 0.5) totalDelta -= listHeight;

        var spinTimeTotal = 3300;
        var startTime = null;

        function frame(now) {
            if (startTime === null) startTime = now;
            var elapsed = now - startTime;
            var progress = Math.min(elapsed / spinTimeTotal, 1);
            var eased = easeOutCubic(progress);
            _reelOffset = startOffset + totalDelta * eased;
            var list = el('tr-reel-list');
            if (list) list.style.transform = 'translateY(' + _reelOffset + 'px)';
            updateReelHighlight();

            if (progress >= 1) {
                onDone();
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
        // ⚠️ [نموذج "العب التلقائي بجانب إعادة الترتيب" المعتمَد] يبقي
        // زر الشاشة الرئيسية متزامناً حتى لو التبديل صار من مصدر ثانٍ
        // (زر الدرج الجانبي القديم، أو استدعاء برمجي آخر مستقبلاً).
        updateAutoPlayButtonLabel();
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
        // ⚠️ [تعديل صريح] صاحب الدور لم يعد مستثنى من قائمة المرشَّحين —
        // يظهر هو نفسه كأحد بطاقات القبائل المموَّهة، فيقدر (بدون ما يدري،
        // لأن هويته مخفية خلف اسم قبيلة زي الباقي) يختار نفسه بالصدفة
        // ويُقصي نفسه فعلياً. قبل هذا التعديل كان مستبعداً تماماً
        // (`.filter(p => p.id !== chooser.id)`)، فكان إقصاء النفس مستحيلاً
        // إلا يدوياً عبر الزر الافتراضي بدون تحديد بطاقة.
        var candidates = _alive.slice();
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
            '<div class="tr-tribe-only-card">' +
                '<span class="tr-tribe-only-num ' + roleClass + '">' + (index + 1) + '</span>' +
                '<span class="tr-tribe-only-name">' + escapeHtml(tribeLabel) + '</span>' +
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
    // الإقصاء. يغلق الدور بدون أي إقصاء/إرجاع. كلا النوعين لا يغيّران
    // التشكيلة، فكلاهما يحتاجان نفس تصفير دوران العجلة + استئناف "العب"
    // التلقائي لو مفعَّل.
    // ⚠️ [إصلاح خلل حقيقي — لُقِط أثناء فحص شامل للعبة] كان تصفير الدوران
    // واستئناف "العب" التلقائي مقصورين على نافذة الإقصاء فقط (isRevive
    // يتخطاهما بالكامل) — يعني استئناف اللعبة من نافذة الإرجاع تحديداً
    // كان يُبقي دوران العجلة المتراكم من الدورة السابقة (نفس علّة "توقّف
    // السهم بصرياً على لاعب مختلف" الموثَّقة بكل مكان آخر بهذا الملف)،
    // وأيضاً يوقف "العب التلقائي" بصمت بدون أي تنبيه. صار السلوك موحَّداً
    // للنوعين الآن.
    function handleSelectResumeClick() {
        if (!_pendingTurn) return;
        AGP.timerManager.stop(TIMER_NAME);
        closeTurnModal();
        resetWheelSpinPosition();
        maybeAutoSpin();
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
     *  7ب) تبويب إعلان النتيجة (إقصاء/إرجاع) — 3 ثوانٍ + صوت
     * ==================================================================== */
    /**
     * ⚠️ [نموذج معتمَد: "elimination-roulette-current-new"] منقول بالحرف
     * من التصميم الحالي فعلياً بروليت الإقصاء — يستبدل التصميم القديم
     * (جملة واحدة متكدّسة مع الصور بمنتصف النص). جملة كاملة أعلى الصندوق
     * تتضمّن اسمَي الطرفين حرفياً ("قام X بإقصاء Y بنجاح")، وبطاقة شخص
     * منفصلة لكل طرف (حلقة ملوَّنة + وسم دور كبسولة + اسم) — راجع
     * announcePersonCardHtml أدناه.
     * @param {Object} data - {target, chooser} كائنا لاعب كاملين. chooser
     *   قد يكون null (مثلاً إقصاء صاحب الدور نفسه عند انتهاء الوقت).
     */
    function showResultAnnouncement(type, data, onDone) {
        ensureScaffolding();
        var overlay = el('tr-modal-overlay');
        var box = el('tr-modal-box');
        if (!overlay || !box) { if (typeof onDone === 'function') onDone(); return; }
        hideChooserCard();

        var isEliminate = type === 'eliminate';
        playSound(isEliminate ? 'eliminate' : 'revive');

        var actorName = data.chooser ? playerLabel(data.chooser) : '';
        var targetName = playerLabel(data.target);
        var titleHtml;
        if (data.chooser) {
            titleHtml = isEliminate
                ? ('قام ' + escapeHtml(actorName) + ' بإقصاء ' + escapeHtml(targetName) + ' بنجاح')
                : ('قام ' + escapeHtml(actorName) + ' بإرجاع ' + escapeHtml(targetName) + ' بنجاح');
        } else {
            titleHtml = isEliminate
                ? ('تم إقصاء ' + escapeHtml(targetName) + ' بنجاح')
                : ('تم إرجاع ' + escapeHtml(targetName) + ' بنجاح');
        }

        var actorCardHtml = data.chooser
            ? announcePersonCardHtml(data.chooser, {
                ringClass: 'tr-announce-ring-green',
                badgeClass: 'tr-announce-badge-green',
                badgeText: isEliminate ? '✅ أقصى' : '✅ رجّع'
            })
            : '';
        var targetCardHtml = isEliminate
            ? announcePersonCardHtml(data.target, {
                ringClass: 'tr-announce-ring-red tr-announce-ring-desaturate',
                badgeClass: 'tr-announce-badge-red',
                badgeText: '❌ انقصى'
            })
            : announcePersonCardHtml(data.target, {
                ringClass: 'tr-announce-ring-green',
                badgeClass: 'tr-announce-badge-green',
                badgeText: '💚 رجع'
            });

        box.className = 'tr-announce-box ' + (isEliminate ? 'tr-announce-eliminate' : 'tr-announce-revive');
        box.innerHTML =
            '<div class="tr-announce-title">' + titleHtml + '</div>' +
            '<div class="tr-announce-row">' + actorCardHtml + targetCardHtml + '</div>';

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            overlay.style.display = 'none';
            box.className = '';
            if (typeof onDone === 'function') onDone();
        }, 3000);
    }

    /**
     * ⚠️ بطاقة شخص لتبويب إعلان النتيجة (حلقة ملوَّنة حول الصورة + وسم
     * دور كبسولة + الاسم) — منقولة بالحرف من announcePersonCardHtml
     * بروليت الإقصاء. @param {Object} opts - {ringClass, badgeClass, badgeText}
     */
    function announcePersonCardHtml(player, opts) {
        opts = opts || {};
        return '<div class="tr-announce-person-card">' +
            '<div class="tr-announce-ring ' + (opts.ringClass || '') + '">' + ringAvatarHtml(player) + '</div>' +
            '<div class="tr-announce-role-badge ' + (opts.badgeClass || '') + '">' + (opts.badgeText || '') + '</div>' +
            '<div class="tr-announce-person-name">' + escapeHtml(playerLabel(player)) + '</div>' +
            '</div>';
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
        // ⚠️ [نموذج "درج الإعدادات الجانبي" المعتمَد] تحديث حي لتبويب
        // اللاعبين لو الدرج مفتوح فعلاً على هذا التبويب وقت الحذف —
        // idempotent (renderReopenedPlayersTab نفسها تتحقق من وجود
        // #tr-players-tab-list أولاً وترجع فوراً لو مو موجود).
        renderReopenedPlayersTab();

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
        renderReopenedPlayersTab();
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

        box.className = 'tr-modal-box tr-winner-transparent';
        box.style.textAlign = 'center';
        box.innerHTML =
            '<div id="tr-winner-box">' +
            // ⚠️ مربع الفيديو 160×160 — يشتغل تلقائياً (autoplay) فور ظهور
            // شاشة الفائز. muted إلزامي: كل المتصفحات تمنع autoplay بصوت
            // بدون تفاعل مستخدم أول، بغضّ النظر عن أي إعداد آخر — قيد
            // متصفحات حقيقي، مو اختيارنا. onerror يخفي المربع بالكامل لو
            // ملف الفيديو غير موجود (بدل مربع أسود فارغ مكسور).
            '<div id="tr-winner-video-badge">' +
            '<video src="winner-video.mp4" autoplay muted playsinline ' +
            'onerror="this.closest(\'#tr-winner-video-badge\').style.display=\'none\'"></video>' +
            '</div>' +
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
        // ⚠️ [نموذج "درج الإعدادات الجانبي" المعتمَد] الإعدادات المعاد
        // فتحها أثناء المباراة صار لها معالج مخصَّص كلياً (enhanceReopenedDrawer)
        // بما فيه زر رجوع صغير خاص بها (.tr-drawer-back-link). بدون هذا
        // الفحص، querySelector('.agp-shell-btn-connect') أدناه كان يطابق
        // زر "➕ فتح دخول لاعبين جدد" بالغلط (نفس الكلاس الأصلي من الملف
        // المشترك) ويضيف زر رجوع مكرَّر وسط حقول الإعدادات — خلل حقيقي
        // انتُبه له بالاختبار الفعلي.
        if (el('agp-settings-close-btn')) return;
        // ⚠️ شاشة "إضافة لوبي جديد" (استقبال لاعبين جدد) أيضاً بلا
        // #agp-settings-close-btn (box.innerHTML مختلف كلياً هناك) —
        // بدون هذا الفحص، querySelector('.agp-shell-btn-connect') تحت
        // كان يطابق زر "✅ إكمال المباراة" بالغلط ويضيف زر رجوع غير
        // مطلوب على تلك الشاشة (خلل حقيقي انتُبه له بالاختبار الفعلي).
        if (el('agp-mini-lobby-list')) return;
        // ⚠️ [نموذج "settings-no-box" المعتمَد] الشاشة الأولى فقط (قبل أي
        // اتصال بالبث) — نميّزها بوجود #agp-tiktok-username (لا يُبنى
        // إطلاقاً بالإعدادات المعاد فتحها أثناء المباراة). الكلاس يفعّل
        // تخطيط الصفحة الكاملة بدون صندوق (راجع CSS تحت `.tr-settings-
        // initial-box` بـinjectStageStyles) — الإعدادات المعاد فتحها
        // تبقى بشكلها الأصلي (صندوق) بلا أي تغيير.
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('tr-settings-initial-box', isInitial);

        // ⚠️ [نموذج "تبويب الاتصال فوق شاشة الإعدادات" المعتمَد] الملف
        // المشترك يستبدل box.innerHTML بالكامل وقت "جاري الاتصال" (يمسح
        // شاشة الإعدادات فعلياً، مو بس يخفيها) — راجع renderConnectingScreen
        // بـjs/agp-game-shell.js. بدل تعديل ذاك الملف، نعترض onclick الأصلي
        // لزر الاتصال هنا محلياً: قبل ما نمرّر التنفيذ للدالة الأصلية،
        // نحفظ كل عناصر box الحيّة (بمستمعات أحداثها سليمة، مجرد نقل
        // DOM حقيقي — لا استنساخ/تسلسل نصّي يفقد المستمعات) بحاوية مخفية
        // منفصلة. enhanceConnectingScreen() أدناه تستردّها فور اكتشاف حالة
        // الاتصال. idempotent عبر dataset فلاغ (تُلف مرة واحدة فقط، مهما
        // تكرّر استدعاء enhanceSettingsScreen على نفس الزر).
        if (isInitial) {
            var connectBtnForWrap = box.querySelector('.agp-shell-btn-connect');
            if (connectBtnForWrap && !connectBtnForWrap.dataset.trConnectWired) {
                connectBtnForWrap.dataset.trConnectWired = '1';
                var originalConnectHandler = connectBtnForWrap.onclick;
                connectBtnForWrap.onclick = function (ev) {
                    _connectingFlowActive = true;
                    _savedSettingsNodes = Array.prototype.slice.call(box.children);
                    if (typeof originalConnectHandler === 'function') originalConnectHandler.call(connectBtnForWrap, ev);
                };
            }
        }

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

        // ⚠️ [نموذج "lobby-no-box" المعتمَد] شعار "ألعاب أيمن" الشفاف
        // بمنتصف الصندوق حُذف — كان مصمَّماً أصلاً ليجلس خلف حدود صندوق
        // محدود الحجم؛ بدون ذاك الصندوق، يظهر كبقعة غامقة غريبة بمنتصف
        // صفحة كاملة (تأكَّد بصرياً أثناء بناء النموذج المعتمَد). الصفحة
        // الآن تعتمد فقط على التدرّج الكوني الخلفي (راجع تعليق CSS تحت
        // `#agp-shell-overlay:has(...agp-lobby-box)`) بدل أي شعار مضاف.

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

    // ⚠️ [نموذج "درج الإعدادات الجانبي" المعتمَد] يتذكّر أي تبويب كان
    // مفتوحاً عبر عمليات renderSettingsScreen(true) المتكرّرة (كل تغيير
    // بحقل إعداد يعيد بناء #agp-shell-box بالكامل من الصفر — الملف
    // المشترك، غير قابل للتفادي بدون تعديله)، حتى ما يرجع المستخدم
    // لتبويب "الإعدادات" تلقائياً كل مرة يبدّل فيها حقلاً وهو بتبويب
    // "اللاعبون". يُصفَّر فقط عند إغلاق الدرج (✕) أو فتحه من جديد.
    var _reopenedDrawerTab = 'settings';
    var _playersTabFilter = 'all';
    // ⚠️ [نموذج "تبويب الاتصال فوق شاشة الإعدادات" المعتمَد]
    var _connectingFlowActive = false;
    var _savedSettingsNodes = null;

    /**
     * ⚠️ يحوّل #agp-shell-box (حالة isReopened=true بالملف المشترك) من
     * صندوق مركزي لدرج جانبي بتبويبين. يُستدعى من applyShellEnhancements
     * (عبر MutationObserver) — يُعاد بناء الأغلفة (header/tabs/body/footer)
     * بالكامل بكل استدعاء لأن الملف المشترك يستبدل box.innerHTML بالكامل
     * مع أي تغيير حقل (راجع renderSettingsScreen بالملف المشترك)، فمافي
     * فايدة من فحص "already wrapped" — لكن _reopenedDrawerTab (متغيّر
     * وحدة، خارج هذي الدالة) يحافظ على التبويب النشط عبر كل عملية إعادة
     * بناء.
     */
    function enhanceReopenedDrawer() {
        var box = el('agp-shell-box');
        if (!box) return;
        var closeBtn = el('agp-settings-close-btn');
        if (!closeBtn || box.classList.contains('agp-lobby-box')) {
            box.classList.remove('tr-reopened-drawer', 'tr-tab-players');
            return; // مو حالة "معاد فتحها"
        }

        // ⚠️ [إصلاح حلقة لا نهائية — باغ حقيقي مؤكَّد بالاختبار الفعلي]
        // هذي الدالة تُستدعى من MutationObserver يراقب #agp-shell-box.
        // بناء الأغلفة أدناه (تفريغ box.innerHTML وإعادة توزيع العناصر)
        // هو بحدّ ذاته تغيير DOM حقيقي — لو نفّذناه بكل استدعاء بلا
        // شرط، كل عملية بناء تُطلق المراقب من جديد، اللي يستدعي هذي
        // الدالة تاني، اللي تعيد البناء تاني... حلقة لا نهائية فعلية
        // (جرّبتها حرفياً، علّقت المتصفح). الفحص هنا يفرّق صح بين حالتين:
        // "الملف المشترك أعاد بناء box.innerHTML فعلياً من جديد" (يحصل
        // فقط عند renderSettingsScreen — عنصرها الأول دائماً closeBtn أو
        // h2 مباشرة، مو أي عنصر بكلاسنا المحلي)، مقابل "هذا مجرد صدى
        // لتعديلاتنا نحن" (العنصر الأول أصلاً tr-drawer-header من مرة
        // سابقة). بالحالة الثانية نوقف فوراً بدون أي DOM mutation إضافي
        // — فقط تحديث حالة زر التبويب النشط (تغيير كلاس بسيط، غير كافٍ
        // وحده لإطلاق نفس شرط "طفل أول تغيّر" فيهرب من الحلقة).
        if (box.firstElementChild && box.firstElementChild.classList.contains('tr-drawer-header')) {
            box.classList.toggle('tr-tab-players', _reopenedDrawerTab === 'players');
            box.querySelectorAll('.tr-drawer-tabs button').forEach(function (b) {
                b.classList.toggle('tr-tab-active', b.getAttribute('data-tab') === _reopenedDrawerTab);
            });
            return;
        }

        // ⚠️ [تصحيح جذري] box.innerHTML يُستبدَل بالكامل من الملف المشترك
        // مع كل تغيير حقل — يعني عناصر header/tabs/body/footer (لو
        // بُنيت بمرة سابقة) اختفت فعلياً، فلا فايدة من فحص "موجودة
        // مسبقاً". نعيد بناء الأغلفة بالكامل بكل استدعاء: نلتقط كل
        // عناصر box الحالية (كما أنتجها الملف المشترك للتو) بمصفوفة
        // ثابتة أولاً (قبل أي نقل، وإلا live HTMLCollection تتغيّر أثناء
        // التكرار نفسه)، ثم نعيد توزيعها داخل أغلفة حقيقية.
        var originalChildren = Array.prototype.slice.call(box.children);
        var h2 = originalChildren.filter(function (n) { return n.tagName === 'H2'; })[0];
        var connectBtn = originalChildren.filter(function (n) { return n.classList && n.classList.contains('agp-shell-btn-connect'); })[0];
        // بقية العناصر (كل حقول الإعدادات + حقل إدارة اللاعبين) — كل
        // شيء غير closeBtn/h2/connectBtn (الأخير عادة غير موجود أصلاً
        // بحالة isReopened=true، لكن نستثنيه احتياطاً).
        var fieldNodes = originalChildren.filter(function (n) {
            return n !== closeBtn && n !== h2 && n !== connectBtn;
        });

        box.classList.add('tr-reopened-drawer');
        box.classList.toggle('tr-tab-players', _reopenedDrawerTab === 'players');
        box.innerHTML = ''; // نفرّغه تماماً — كل العناصر أعلاه محفوظة بمتغيّرات JS، مو مفقودة

        // ---- الهيدر: العنوان + زر الإغلاق بصف واحد ----
        var header = document.createElement('div');
        header.className = 'tr-drawer-header';
        if (h2) header.appendChild(h2);
        // زر الإغلاق الأصلي — نحفظ سلوكه (hideRelocatedControls+hideOverlay،
        // دالتان داخليتان بالملف المشترك غير مُصدَّرتين) ونضيف فوقه
        // تصفير التبويب المحفوظ محلياً، بدل استبداله بالكامل (كان يُفقِد
        // السلوك الأصلي فعلياً — bug حقيقي انتُبه له أثناء المراجعة).
        var originalCloseHandler = closeBtn.onclick;
        closeBtn.onclick = function () {
            _reopenedDrawerTab = 'settings';
            if (typeof originalCloseHandler === 'function') originalCloseHandler.call(closeBtn);
        };
        header.appendChild(closeBtn);
        box.appendChild(header);

        // ---- شريط التبويبين ----
        var tabs = document.createElement('div');
        tabs.className = 'tr-drawer-tabs';
        tabs.innerHTML =
            '<button type="button" data-tab="settings">⚙️ الإعدادات</button>' +
            '<button type="button" data-tab="players">👥 اللاعبون</button>';
        tabs.querySelectorAll('button').forEach(function (btn) {
            btn.classList.toggle('tr-tab-active', btn.getAttribute('data-tab') === _reopenedDrawerTab);
            btn.onclick = function () {
                _reopenedDrawerTab = btn.getAttribute('data-tab');
                box.classList.toggle('tr-tab-players', _reopenedDrawerTab === 'players');
                tabs.querySelectorAll('button').forEach(function (b) {
                    b.classList.toggle('tr-tab-active', b === btn);
                });
                if (_reopenedDrawerTab === 'players') renderReopenedPlayersTab();
            };
        });
        box.appendChild(tabs);

        // ---- الجسم القابل للسكرول: كل حقول الإعدادات + تبويب اللاعبين ----
        var bodyWrap = document.createElement('div');
        bodyWrap.className = 'tr-drawer-body';
        fieldNodes.forEach(function (n) { bodyWrap.appendChild(n); });

        // زر "➕ إضافة لوبي جديد" الأصلي (من الملف المشترك، داخل fieldNodes
        // أصلاً ضمن حقل إدارة اللاعبين) — إعادة تسمية فقط، نفس onclick
        // الأصلي (handleReopenRegistrationClick) بدون أي تغيير على منطقه.
        var reopenBtn = bodyWrap.querySelector('#agp-reopen-registration-btn');
        if (reopenBtn) reopenBtn.textContent = '➕ فتح دخول لاعبين جدد';

        var playersTab = document.createElement('div');
        playersTab.id = 'tr-players-tab';
        playersTab.innerHTML =
            '<input type="text" id="tr-players-tab-search" placeholder="🔍 دوّر على لاعب...">' +
            '<div id="tr-players-tab-filter">' +
            '<button type="button" data-filter="all">الكل</button>' +
            '<button type="button" data-filter="live">🟢 نشطون</button>' +
            '<button type="button" data-filter="out">🔴 مقصون</button>' +
            '</div>' +
            '<div id="tr-players-tab-list"></div>';
        playersTab.querySelector('#tr-players-tab-search').oninput = function () { renderReopenedPlayersTab(); };
        playersTab.querySelectorAll('#tr-players-tab-filter button').forEach(function (b) {
            b.classList.toggle('tr-filter-active', b.getAttribute('data-filter') === _playersTabFilter);
            b.onclick = function () { _playersTabFilter = b.getAttribute('data-filter'); renderReopenedPlayersTab(); };
        });
        bodyWrap.appendChild(playersTab);
        box.appendChild(bodyWrap);

        // ---- التذييل الثابت: زر رجوع صغير (سهم+نص) تحت "فتح دخول
        // لاعبين جدد" مباشرة (بترتيب DOM — الزر داخل bodyWrap فوقه) ----
        var footer = document.createElement('div');
        footer.className = 'tr-drawer-footer';
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'tr-drawer-back-link';
        link.innerHTML = '<span>↩</span> رجوع لمنصة ألعاب أيمن';
        link.onclick = homeNavigate;
        var hint = document.createElement('div');
        hint.className = 'tr-drawer-back-hint';
        hint.textContent = 'هذا الزر يرجّعك أيضاً لمنصة الألعاب الرئيسية';
        footer.appendChild(link);
        footer.appendChild(hint);
        box.appendChild(footer);

        if (connectBtn) box.appendChild(connectBtn); // احتياط فقط — عادة غير موجود بحالة isReopened=true

        if (_reopenedDrawerTab === 'players') renderReopenedPlayersTab();
    }

    /**
     * ⚠️ يجمع اللاعبين النشطين (_alive) والمقصيين (_eliminated) بقائمة
     * واحدة — كل الأسماء اللي شاركت بالمباراة منذ بدايتها، بدون استثناء
     * (بعكس قائمة اللوبي الأصلية اللي تعرض النشطين فقط). فلتر بحث بالاسم
     * + فلتر حالة (الكل/نشطون/مقصون)، ترتيب أبجدي. كل صف نشط له زر ×
     * أحمر (إقصاء يدوي هادئ، بدون تبويب إعلان نتيجة)، وكل صف مقصى له زر
     * ↩ أخضر (إرجاع يدوي فوري — **بدون** فحص _friendRevivedIds، فيرجع
     * حتى لو خلصت فرصة "انعاش صديق" الخاصة به، بطلب صريح).
     */
    function renderReopenedPlayersTab() {
        var listEl = el('tr-players-tab-list');
        if (!listEl) return;

        var query = ((el('tr-players-tab-search') || {}).value || '').trim().toLowerCase();
        var rows = _alive.map(function (p) { return { player: p, status: 'live' }; })
            .concat(_eliminated.map(function (e) { return { player: e.player, status: 'out' }; }));

        if (_playersTabFilter !== 'all') {
            rows = rows.filter(function (r) { return r.status === _playersTabFilter; });
        }
        if (query) {
            rows = rows.filter(function (r) { return playerLabel(r.player).toLowerCase().indexOf(query) !== -1; });
        }
        rows.sort(function (a, b) { return playerLabel(a.player).localeCompare(playerLabel(b.player), 'ar'); });

        // تحديث حالة أزرار الفلتر (تُبنى مرة واحدة فقط بـenhanceReopenedDrawer،
        // نحدّث الكلاس النشط فقط هنا).
        var filterWrap = el('tr-players-tab-filter');
        if (filterWrap) {
            filterWrap.querySelectorAll('button').forEach(function (b) {
                b.classList.toggle('tr-filter-active', b.getAttribute('data-filter') === _playersTabFilter);
            });
        }

        if (!rows.length) {
            listEl.innerHTML = '<div style="text-align:center;color:#6b6280;font-size:0.78em;padding:20px 0;">ولا لاعب مطابق</div>';
            return;
        }

        listEl.innerHTML = rows.map(function (r) {
            var isLive = r.status === 'live';
            var actionHtml = isLive
                ? '<button type="button" class="tr-prow-action tr-action-eliminate" data-id="' + escapeHtml(r.player.id) + '" title="إقصاء يدوي">✕</button>'
                : '<button type="button" class="tr-prow-action tr-action-revive" data-id="' + escapeHtml(r.player.id) + '" title="إرجاع يدوي">↩</button>';
            return '<div class="tr-prow' + (isLive ? '' : ' tr-prow-out') + '">' +
                '<span class="tr-prow-avatar">' + ringAvatarHtml(r.player) + '</span>' +
                '<span class="tr-prow-name">' + escapeHtml(playerLabel(r.player)) + '</span>' +
                '<span class="tr-prow-status ' + (isLive ? 'tr-status-live' : 'tr-status-out') + '">' + (isLive ? 'نشط' : 'مقصى') + '</span>' +
                actionHtml +
                '</div>';
        }).join('');

        listEl.querySelectorAll('.tr-action-eliminate').forEach(function (btn) {
            btn.onclick = function () { manuallyEliminatePlayer(btn.getAttribute('data-id')); };
        });
        listEl.querySelectorAll('.tr-action-revive').forEach(function (btn) {
            btn.onclick = function () { manuallyRevivePlayer(btn.getAttribute('data-id')); };
        });
    }

    /**
     * ⚠️ إقصاء يدوي هادئ من لوحة الإعدادات — بعكس eliminatePlayer()
     * (المستخدَمة لحظة اختيار العجلة)، بدون تبويب إعلان نتيجة ولا صوت
     * احتفالي؛ فقط نقل اللاعب من _alive لـ_eliminated + تحديث العجلة +
     * سطر بانر بسيط. لا تُستدعى closeTurnModal لأنها إجراء إداري منفصل
     * تماماً عن تدفّق الدور الحالي (لو فيه دور مفتوح، يستمر بلا تأثير).
     */
    function manuallyEliminatePlayer(playerId) {
        var idx = _alive.findIndex(function (p) { return p.id === playerId; });
        if (idx === -1) return;
        var player = _alive[idx];
        _alive.splice(idx, 1);
        _eliminated.push({ player: player });

        realignWheelAfterRosterChange();
        logEvent('eliminate', '🗑️ ' + playerLabel(player) + ' تم إقصاؤه يدوياً من لوحة الإعدادات');
        renderReopenedPlayersTab();

        if (_matchActive && _alive.length <= 1) {
            endMatch(_alive[0] || null);
        }
    }

    /**
     * ⚠️ إرجاع يدوي فوري من لوحة الإعدادات — **بدون** فحص _friendRevivedIds
     * (بعكس آلية "انعاش صديق" التلقائية بالعجلة)، بطلب صريح: يرجع حتى
     * لو خلصت فرصة الإنعاش الخاصة به سابقاً. بدون تبويب "عودة لاعب"
     * الاحتفالي (showReviveSplash) — إجراء إداري هادئ، مو لحظة لعب.
     */
    function manuallyRevivePlayer(playerId) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === playerId; });
        if (idx === -1) return;
        var entry = _eliminated[idx];
        _eliminated.splice(idx, 1);
        _alive.push(entry.player);

        realignWheelAfterRosterChange();
        logEvent('gift', '↩️ ' + playerLabel(entry.player) + ' تم إرجاعه يدوياً من لوحة الإعدادات');
        renderReopenedPlayersTab();
    }

    /**
     * ⚠️ [نموذج "لوحة استقبال لاعبين جدد" المعتمَد] شاشة "إضافة لوبي
     * جديد" (تُنتَج بالكامل من handleReopenRegistrationClick بالملف
     * المشترك) — نكتشفها بوجود #agp-mini-lobby-list (فريد لها)، نضيف
     * كلاس tr-mini-lobby-active (راجع CSS: لوحة شفافة بحدود مدببة)،
     * مؤشّر "بانتظار انضمام" نابض، وزر × لكل بطاقة لاعب جديد ينضم حياً
     * (الملف المشترك لا يمرّر removable هنا أصلاً — نضيفه محلياً).
     */
    function enhanceMiniLobbyPanel() {
        var box = el('agp-shell-box');
        if (!box) return;
        var miniList = el('agp-mini-lobby-list');
        if (!miniList) {
            box.classList.remove('tr-mini-lobby-active');
            return;
        }
        box.classList.add('tr-mini-lobby-active');

        var hint = box.querySelector('.agp-join-hint');
        if (hint && !hint.querySelector('.tr-mini-live-dot')) {
            var dot = document.createElement('div');
            dot.className = 'tr-mini-live-dot';
            dot.innerHTML = '<span class="dot"></span>بانتظار انضمام لاعبين جدد الآن...';
            hint.appendChild(dot);
        }

        miniList.querySelectorAll('li').forEach(function (li) {
            if (li.querySelector('.tr-mini-remove-btn')) return;
            var nameEl = li.querySelector('.agp-pcard-name-basic');
            var name = nameEl ? nameEl.textContent : null;
            if (!name || !AGP.gameManager) return;
            var match = AGP.gameManager.getPlayers().find(function (p) { return playerLabel(p) === name; });
            if (!match) return;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tr-mini-remove-btn';
            btn.title = 'إزالة قبل الإكمال';
            btn.textContent = '✕';
            btn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (AGP.player && typeof AGP.player.removePlayer === 'function') {
                    AGP.player.removePlayer(match.id);
                }
            });
            li.appendChild(btn);
        });
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        // ⚠️ لا حاجة لأي معالجة يدوية لقائمة اللوبي هنا بعد الآن — الملف
        // المشترك (renderLobbyPlayerList) يبني زر الحذف والـMarquee
        // وأحجام البطاقات تلقائياً بنفسه. راجع التعليق أعلى هذا القسم
        // لتفاصيل ما كان هنا سابقاً.
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
        // ⚠️ [نموذج "درج الإعدادات الجانبي" المعتمَد] الإعدادات المعاد
        // فتحها أثناء المباراة (زر ⚙️ بالهيدر) — تحويلها لدرج جانبي
        // بتبويبين + تجميل شاشة "إضافة لوبي جديد" (استقبال لاعبين جدد).
        enhanceReopenedDrawer();
        enhanceMiniLobbyPanel();
        // ⚠️ [نموذج "تبويب الاتصال فوق شاشة الإعدادات" المعتمَد]
        enhanceConnectingScreen();
    }

    /**
     * ⚠️ [نموذج "تبويب الاتصال فوق شاشة الإعدادات" المعتمَد] بدل شاشة
     * "جاري الاتصال" الكاملة المستقلة (سلوك الملف المشترك الافتراضي)،
     * نسترد شاشة الإعدادات الحقيقية (العقد المحفوظة فعلياً بـenhanceSettingsScreen
     * وقت الضغط على زر الاتصال) ونعرض تبويباً عائماً صغيراً فوقها بدلاً
     * من محتوى box الافتراضي. عند النجاح (انتقال فعلي لشاشة اللوبي)
     * نخفي التبويب وننسى العقد المحفوظة. عند الفشل، زر ✕ يخفي التبويب
     * فقط — شاشة الإعدادات المستردَّة تبقى ظاهرة وقابلة للتفاعل مباشرة
     * (بدون أي إعادة تحميل صفحة).
     */
    function enhanceConnectingScreen() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (!_connectingFlowActive) {
            var idlePopup = el('tr-connect-popup');
            if (idlePopup) idlePopup.style.display = 'none';
            var idleDim = el('tr-connect-dim');
            if (idleDim) idleDim.style.display = 'none';
            return;
        }

        if (box.classList.contains('agp-lobby-box')) {
            // ⚠️ نجح الاتصال فعلاً — انتقلنا لشاشة اللوبي، العقد المحفوظة
            // (شاشة الإعدادات القديمة) لم تعد مطلوبة إطلاقاً.
            _connectingFlowActive = false;
            _savedSettingsNodes = null;
            var donePopup = el('tr-connect-popup');
            if (donePopup) donePopup.style.display = 'none';
            var doneDim = el('tr-connect-dim');
            if (doneDim) doneDim.style.display = 'none';
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            // ⚠️ لحظة اكتشاف حالة "جاري الاتصال" الافتراضية — نلتقط حالة
            // النجاح/الفشل قبل ما نمحيها، ثم نستبدل محتوى box بالعقد
            // الحقيقية المحفوظة (نقل DOM حي، لا استنساخ نصّي — المستمعات
            // كلها سليمة). هذا التبديل نفسه يُخرج box من كلاس
            // agp-connecting-box، فلن يتكرّر هذا الشرط مجدداً لين محاولة
            // اتصال جديدة فعلية (نفس آلية closeBtn بدرج الإعدادات —
            // لا حلقة لا نهائية).
            var isError = box.classList.contains('agp-conn-error');
            box.innerHTML = '';
            box.className = 'tr-settings-initial-box';
            if (_savedSettingsNodes) {
                _savedSettingsNodes.forEach(function (n) { box.appendChild(n); });
            }

            if (!el('tr-connect-dim')) {
                var dim = document.createElement('div');
                dim.id = 'tr-connect-dim';
                document.body.appendChild(dim);
            }
            var popup = el('tr-connect-popup');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'tr-connect-popup';
                document.body.appendChild(popup);
            }
            el('tr-connect-dim').style.display = 'block';
            popup.style.display = 'block';
            popup.classList.toggle('tr-connect-error', isError);
            popup.innerHTML =
                (isError ? '<button type="button" id="tr-connect-close-btn">✕</button>' : '') +
                '<div class="' + (isError ? 'tr-connect-error-icon' : 'tr-connect-spinner') + '">' +
                (isError ? '⚠️' : '') + '</div>' +
                '<h3>' + (isError ? 'تعذّر الاتصال' : 'جاري الاتصال بالبث') + '</h3>' +
                '<p>' + (isError ? 'تأكد من اسم المستخدم وحاول مرة ثانية' : 'انتظر قليلاً...') + '</p>';
            if (isError) {
                el('tr-connect-close-btn').onclick = function () {
                    popup.style.display = 'none';
                    el('tr-connect-dim').style.display = 'none';
                    _connectingFlowActive = false;
                };
            }
        }
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        var overlay = el('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(applyShellEnhancements);
        observer.observe(overlay, { childList: true, subtree: true });

        // ⚠️ [إصلاح إضافي — طبقة حماية ثانية لنفس الخلل] بجانب رفع
        // z-index نافذة الاختيار فوق درج الإعدادات (الإصلاح الجذري
        // بـCSS)، نمنع فتح درج الإعدادات أصلاً أثناء دور مفتوح — يلغي
        // احتمال تراكب نافذتين بالمرة، بدل الاعتماد على ترتيب الطبقات
        // فقط. الزر (#agp-header-settings-btn) يُبنى مرة واحدة بالملف
        // المشترك (injectPersistentHeader، يبقى بالـDOM طول الوقت مثل
        // الـoverlay تماماً)، فربطه هنا مرة واحدة كافٍ.
        var gearBtn = el('agp-header-settings-btn');
        if (gearBtn && !gearBtn.dataset.trGuarded) {
            var originalGearHandler = gearBtn.onclick;
            gearBtn.onclick = function (ev) {
                if (_pendingTurn) {
                    showToast('أنهِ الدور الحالي أولاً قبل فتح الإعدادات');
                    return;
                }
                if (typeof originalGearHandler === 'function') originalGearHandler.call(gearBtn, ev);
            };
            gearBtn.dataset.trGuarded = '1';
        }
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
